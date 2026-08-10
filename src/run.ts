import { chromium, type Locator, type Page } from "@playwright/test";
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
    await visible(page, config.selectors.openAuthDialog).click();
    console.log("      auth dialog opened");
  }

  if (config.selectors.authTab) {
    await visible(page, config.selectors.authTab).click();
    console.log("      auth tab selected");
  }

  const email = await visible(page, config.selectors.emailInput);
  try {
    await email.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    throw new Error(
      "Auth form never appeared. Check selectors.openAuthDialog (did the dialog open?) and selectors.emailInput (does it match the field name?).",
    );
  }
  await email.fill(inbox.email);
  console.log("      email entered");

  if (config.selectors.passwordInput) {
    const password = await visible(page, config.selectors.passwordInput);
    await password.waitFor({ state: "visible", timeout: 15000 });
    await password.fill(config.password);
    console.log("      password entered");
  }

  await page.keyboard.press("Enter");
  console.log("      auth submitted");

  const otp = await inbox.waitForOtp();
  console.log("      otp received from inbox");

  const otpInput = await visible(page, config.selectors.otpInput);
  await otpInput.waitFor({ state: "visible", timeout: 15000 });
  await otpInput.fill(otp);
  console.log("      otp entered");

  if (config.selectors.submitOtp) {
    await visible(page, config.selectors.submitOtp).click();
  } else {
    await page.keyboard.press("Enter");
  }

  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function followTarget(page: Page): Promise<void> {
  await page.goto(config.targetProfileUrl, { waitUntil: "domcontentloaded" });

  const followButton = await visible(page, config.selectors.followButton);
  await followButton.waitFor({ state: "visible", timeout: 30000 });
  await followButton.click();
  console.log("      follow clicked");
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

function visible(page: Page, selector: string): Locator {
  return page.locator(selector).filter({ visible: true }).first();
}