import { chromium, type Page } from "@playwright/test";
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
      console.error(`[${index}/${config.maxUsers}] Failed`, error);
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

  if (config.selectors.openAuthDialog) {
    const dialogTrigger = page.locator(config.selectors.openAuthDialog).first();
    await dialogTrigger.waitFor({ state: "visible", timeout: 30000 });
    await dialogTrigger.click();
    await page.locator(config.selectors.emailInput).waitFor({ state: "visible", timeout: 10000 });
  }

  await page.locator(config.selectors.emailInput).fill(inbox.email);

  if (config.selectors.passwordInput) {
    await page.locator(config.selectors.passwordInput).fill(config.password);
  }

  await page.locator(config.selectors.submitAuth).click();

  const otp = await inbox.waitForOtp();

  await page.locator(config.selectors.otpInput).fill(otp);

  if (config.selectors.submitOtp) {
    await page.locator(config.selectors.submitOtp).click();
  } else {
    await page.keyboard.press("Enter");
  }

  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function followTarget(page: Page): Promise<void> {
  await page.goto(config.targetProfileUrl, { waitUntil: "domcontentloaded" });
  const followButton = page.locator(config.selectors.followButton).first();
  await followButton.waitFor({ state: "visible", timeout: 30000 });
  await followButton.click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
}
