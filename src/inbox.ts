import type { AgentConfig } from "./config.js";

export type TestInbox = {
  email: string;
  waitForOtp: () => Promise<string>;
};

type MessageCandidate = {
  subject?: string;
  body?: string;
};

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 120000;

export async function createInbox(config: AgentConfig, index: number): Promise<TestInbox> {
  if (config.emailProvider === "mailosaur") {
    return createMailosaurInbox(config, index);
  }

  return createMailSlurpInbox(config, index);
}

async function createMailosaurInbox(config: AgentConfig, index: number): Promise<TestInbox> {
  const apiKey = requiredEnv("MAILOSAUR_API_KEY");
  const serverId = normalizeMailosaurServerId(requiredEnv("MAILOSAUR_SERVER_ID"));
  const email = `${config.emailPrefix}-${Date.now()}-${index}@${serverId}`;

  return {
    email,
    waitForOtp: () =>
      pollForOtp(config, async () => {
        const searchParams = new URLSearchParams({
          server: normalizeMailosaurServerId(serverId).split(".")[0],
        });
        const response = await fetch(`https://mailosaur.com/api/messages/search?${searchParams}`, {
          method: "POST",
          headers: {
            ...basicAuthHeaders(apiKey),
            "content-type": "application/json",
          },
          body: JSON.stringify({ sentTo: email }),
        });

        if (!response.ok) {
          throw new Error(`Mailosaur search failed: ${response.status} ${await response.text()}`);
        }

        const data = (await response.json()) as {
          items?: Array<{ id: string; subject?: string; summary?: string }>;
        };
        const item = data.items?.[0];

        if (!item) {
          return undefined;
        }

        const messageResponse = await fetch(`https://mailosaur.com/api/messages/${item.id}`, {
          headers: basicAuthHeaders(apiKey),
        });

        if (!messageResponse.ok) {
          throw new Error(
            `Mailosaur message fetch failed: ${messageResponse.status} ${await messageResponse.text()}`,
          );
        }

        const message = (await messageResponse.json()) as {
          subject?: string;
          text?: { body?: string };
          html?: { body?: string };
        };

        return {
          subject: message.subject,
          body: [message.text?.body, message.html?.body].filter(Boolean).join("\n"),
        };
      }),
  };
}

async function createMailSlurpInbox(config: AgentConfig, index: number): Promise<TestInbox> {
  const apiKey = requiredEnv("MAILSLURP_API_KEY");
  const configuredInboxId = process.env.MAILSLURP_INBOX_ID;

  if (configuredInboxId) {
    const inboxResponse = await fetch(`https://api.mailslurp.com/inboxes/${configuredInboxId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!inboxResponse.ok) {
      throw new Error(`MailSlurp inbox fetch failed: ${inboxResponse.status} ${await inboxResponse.text()}`);
    }

    const inbox = (await inboxResponse.json()) as { emailAddress: string; id: string };

    return {
      email: inbox.emailAddress,
      waitForOtp: () => waitForMailSlurpOtp(config, apiKey, inbox.id),
    };
  }

  const response = await fetch("https://api.mailslurp.com/inboxes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      name: `${config.emailPrefix}-${Date.now()}-${index}`,
      expiresIn: POLL_TIMEOUT_MS * 2,
    }),
  });

  if (!response.ok) {
    throw new Error(`MailSlurp inbox create failed: ${response.status} ${await response.text()}`);
  }

  const inbox = (await response.json()) as { emailAddress: string; id: string };

  return {
    email: inbox.emailAddress,
    waitForOtp: () => waitForMailSlurpOtp(config, apiKey, inbox.id),
  };
}

async function waitForMailSlurpOtp(config: AgentConfig, apiKey: string, inboxId: string): Promise<string> {
  return pollForOtp(config, async () => {
    const response = await fetch(
      `https://api.mailslurp.com/waitForLatestEmail?inboxId=${encodeURIComponent(
        inboxId,
      )}&timeout=${POLL_INTERVAL_MS}&unreadOnly=true`,
      { headers: { "x-api-key": apiKey } },
    );

    if (response.status === 408 || response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(`MailSlurp wait failed: ${response.status} ${await response.text()}`);
    }

    const message = (await response.json()) as {
      subject?: string;
      body?: string;
    };

    return message;
  });
}

async function pollForOtp(
  config: AgentConfig,
  getLatestMessage: () => Promise<MessageCandidate | undefined>,
): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const otpPattern = new RegExp(config.otpRegex);

  while (Date.now() < deadline) {
    const message = await getLatestMessage();
    const content = [message?.subject, message?.body].filter(Boolean).join("\n");
    const otp = content.match(otpPattern)?.[0];

    if (otp) {
      return otp;
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for OTP email.");
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeMailosaurServerId(serverId: string): string {
  if (serverId.endsWith(".mailosaur.net")) {
    return serverId;
  }

  return `${serverId}.mailosaur.net`;
}

function basicAuthHeaders(apiKey: string): HeadersInit {
  return {
    authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
