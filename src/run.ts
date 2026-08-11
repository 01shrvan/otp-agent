import { chromium, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { loadDotEnv } from "./env.js";
import { createInbox, delay, type TestInbox } from "./inbox.js";

loadDotEnv();

const config = loadConfig();

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== "false",
});

try {
  for (let index = 1; index <= config.maxUsers; index += 1) {
    const inbox = await createInbox(config, index);
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`[${index}/${config.maxUsers}] Using ${inbox.email}`);

    try {
      await signupAndVerify(page, inbox);
      await followTarget(page);
      console.log(`[${index}/${config.maxUsers}] Follow flow completed`);
    } catch (error) {
      const artifacts = await saveFailureDebug(page, index);
      console.error(
        `[${index}/${config.maxUsers}] Debug artifacts saved: ${artifacts.screenshotPath}, ${artifacts.urlPath}`,
      );
      console.error(`[${index}/${config.maxUsers}] Failed`, error);
      break;
    } finally {
      await context.close();
    }

    if (index < config.maxUsers) {
      await delay(config.runDelayMs);
    }
  }
} finally {
  await browser.close();
}

async function signupAndVerify(page: Page, inbox: TestInbox): Promise<void> {
  await page.goto(config.signupUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

  const authFormIsOpen = await hasVisible(page, config.selectors.emailInput);
  if (config.selectors.openAuthDialog && !authFormIsOpen) {
    await clickVisible(page, config.selectors.openAuthDialog, "openAuthDialog");
    console.log("      auth dialog opened");
  }

  if (config.selectors.authTab) {
    await clickVisible(page, config.selectors.authTab, "authTab");
    console.log("      auth tab selected");
  }

  const email = await waitVisible(page, config.selectors.emailInput, "emailInput", 15000);
  await email.fill(inbox.email);
  console.log("      email entered");

  if (config.selectors.usernameInput) {
    const username = await waitVisible(page, config.selectors.usernameInput, "usernameInput", 15000);
    await username.fill(usernameFromEmail(inbox.email));
    console.log("      username entered");
  }

  if (config.selectors.birthdateInput && config.birthdate) {
    const birthdate = await waitVisible(page, config.selectors.birthdateInput, "birthdateInput", 15000);
    await birthdate.fill(config.birthdate);
    console.log("      birthdate entered");
  }

  if (config.selectors.passwordInput) {
    const password = await waitVisible(page, config.selectors.passwordInput, "passwordInput", 15000);
    await password.fill(config.password);
    console.log("      password entered");
  }

  if (config.selectors.submitAuth) {
    await clickVisible(page, config.selectors.submitAuth, "submitAuth");
  } else {
    await page.keyboard.press("Enter");
  }
  console.log("      auth submitted");

  const otp = await inbox.waitForOtp();
  console.log("      otp received from inbox");

  const otpInput = await waitVisible(page, config.selectors.otpInput, "otpInput", 15000);
  await otpInput.fill(otp);
  console.log("      otp entered");

  if (config.selectors.submitOtp) {
    await clickVisible(page, config.selectors.submitOtp, "submitOtp");
  } else {
    await page.keyboard.press("Enter");
  }

  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function followTarget(page: Page): Promise<void> {
  await page.goto(config.targetProfileUrl, { waitUntil: "domcontentloaded" });

  const followButton = await waitVisible(page, config.selectors.followButton, "followButton", 30000);
  await followButton.click();
  console.log("      follow clicked");
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

function visible(page: Page, selector: string): Locator {
  return page.locator(selector).filter({ visible: true }).first();
}

async function hasVisible(page: Page, selector: string): Promise<boolean> {
  return (await visible(page, selector).count()) > 0;
}

async function waitVisible(
  page: Page,
  selector: string,
  selectorName: string,
  timeout: number,
): Promise<Locator> {
  const locator = visible(page, selector);

  try {
    await locator.waitFor({ state: "visible", timeout });
    return locator;
  } catch (error) {
    throw new Error(await selectorErrorMessage(page, selectorName, selector), { cause: error });
  }
}

async function clickVisible(page: Page, selector: string, selectorName: string): Promise<void> {
  const locator = await waitVisible(page, selector, selectorName, 30000);
  await locator.click();
}

function usernameFromEmail(email: string): string {
  return email
    .split("@")[0]
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 24);
}

async function selectorErrorMessage(
  page: Page,
  selectorName: string,
  selector: string,
): Promise<string> {
  const snapshot = await page.evaluate<{
    title: string;
    controls: Array<{
      tag: string;
      text: string;
      type: string;
      name: string;
      placeholder: string;
      testId: string;
      auth: string;
    }>;
  }>(`(() => {
    const controls = Array.from(document.querySelectorAll("button, a, input")).flatMap((element) => {
      const htmlElement = element;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none";

      if (!isVisible) {
        return [];
      }

      const input = element instanceof HTMLInputElement ? element : undefined;
      return [
        {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || (input && input.value) || (input && input.placeholder) || "").trim().slice(0, 80),
          type: (input && input.type) || "",
          name: (input && input.name) || "",
          placeholder: (input && input.placeholder) || "",
          testId: htmlElement.dataset.testid || "",
          auth: htmlElement.dataset.auth || "",
        },
      ];
    });

    return {
      title: document.title,
      controls: controls.slice(0, 30),
    };
  })()`);

  return [
    `Selector "${selectorName}" did not become visible: ${selector}`,
    `URL: ${page.url()}`,
    `Title: ${snapshot.title || "(none)"}`,
    `Visible controls: ${JSON.stringify(snapshot.controls, null, 2)}`,
  ].join("\n");
}

async function saveFailureDebug(
  page: Page,
  index: number,
): Promise<{ screenshotPath: string; urlPath: string }> {
  const dir = path.resolve(process.cwd(), "failure-artifacts");
  fs.mkdirSync(dir, { recursive: true });

  const filePrefix = path.join(dir, `run-${index}-${Date.now()}`);
  const screenshotPath = `${filePrefix}.png`;
  const urlPath = `${filePrefix}.url.txt`;

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  fs.writeFileSync(
    urlPath,
    `${page.url()}\n${await page.title().catch(() => "")}\n`,
    "utf8",
  );

  return { screenshotPath, urlPath };
}
