import fs from "node:fs";
import path from "node:path";

export type EmailProviderName = "mailosaur" | "mailslurp";

export type AgentConfig = {
  baseUrl: string;
  signupUrl: string;
  targetProfileUrl: string;
  maxUsers: number;
  runDelayMs: number;
  password: string;
  emailProvider: EmailProviderName;
  emailPrefix: string;
  otpRegex: string;
  selectors: {
    emailInput: string;
    passwordInput?: string;
    submitAuth: string;
    otpInput: string;
    submitOtp?: string;
    followButton: string;
  };
};

export function loadConfig(): AgentConfig {
  const configPath = path.resolve(process.cwd(), "config.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      "Missing config.json. Copy config.example.json to config.json and edit it for your staging site.",
    );
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as AgentConfig;
  const maxUsers = Number(config.maxUsers);

  if (!config.signupUrl || !config.targetProfileUrl) {
    throw new Error("config.json must include signupUrl and targetProfileUrl.");
  }

  if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 90) {
    throw new Error("maxUsers must be an integer between 1 and 90.");
  }

  if (!["mailosaur", "mailslurp"].includes(config.emailProvider)) {
    throw new Error("emailProvider must be either mailosaur or mailslurp.");
  }

  return {
    ...config,
    maxUsers,
    runDelayMs: Number(config.runDelayMs ?? 1500),
  };
}
