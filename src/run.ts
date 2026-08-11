import { chromium, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { loadDotEnv } from "./env.js";
import { createInbox, delay, type TestInbox } from "./inbox.js";

loadDotEnv();

const config = loadConfig();

const FIRST_NAMES = [
  "alex", "mia", "jordan", "casey", "riley", "sam", "taylor", "morgan", "jamie",
  "dylan", "avery", "cameron", "logan", "quinn", "blake", "skylar", "kai", "leo",
  "nina", "zoe", "liam", "noah", "emma", "olivia", "luna", "isaac", "maya", "eli",
  "ruby", "jasper", "nora", "felix", "aiden", "isla", "milo", "aria", "theo",
  "hazel", "owen", "vera", "jude", "iris", "rowan", "cleo", "atlas", "wren",
  "callum", "sienna", "diego", "amelia", "marcus", "sofia", "ethan", "chloe",
  "ryan", "grace", "caleb", "naomi", "sebastian", "clara",
];

const USERNAME_WORDS = [
  "wolf", "storm", "night", "blaze", "frost", "raven", "hawk", "fox", "moon",
  "star", "river", "sky", "ember", "shadow", "nova", "dawn", "mist", "pine",
  "clover", "juno", "echo", "sage", "cinder", "delta", "orbit", "vega",
  "haven", "orion", "willow", "jasmine",
];

const usedUsernames = new Set<string>();

function randomUsername(): string {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const word = USERNAME_WORDS[Math.floor(Math.random() * USERNAME_WORDS.length)];
    const num = Math.floor(Math.random() * 90) + 10;
    const style = Math.floor(Math.random() * 4);

    const candidate =
      style === 0 ? `${name}${num}`
      : style === 1 ? `${name}_${num}`
      : style === 2 ? `${name}_${word}`
      : `${name}${word}${num}`;

    if (!usedUsernames.has(candidate)) {
      usedUsernames.add(candidate);
      return candidate;
    }
  }

  throw new Error("Could not generate a unique username");
}

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== "false",
  args: ["--disable-blink-features=AutomationControlled"],
});

const contextOptions = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  viewport: { width: 1366, height: 768 },
  locale: "en-US",
  timezoneId: "America/New_York",
};

try {
  for (let index = 1; index <= config.maxUsers; index += 1) {
    const inbox = await createInbox(config, index);
    const context = await browser.newContext(contextOptions);
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
  await waitForAppReady(page, config.selectors.openAuthDialog ?? config.selectors.emailInput);

  const authFormIsOpen = await hasVisible(page, config.selectors.emailInput);
  if (config.selectors.openAuthDialog && !authFormIsOpen) {
    await clickVisible(page, config.selectors.openAuthDialog, "openAuthDialog", 15000);
    console.log("      auth dialog opened");
  }

  if (config.selectors.authTab) {
    const tabClicked = await clickVisibleIfFound(page, config.selectors.authTab, "authTab", 5000);
    if (tabClicked) {
      console.log("      auth tab selected");
    } else {
      console.log("      auth tab not found, continuing");
    }
  }

  const email = await waitVisible(page, config.selectors.emailInput, "emailInput", 15000);
  await email.fill(inbox.email);
  console.log("      email entered");

  if (config.selectors.usernameInput) {
    const username = await waitVisible(page, config.selectors.usernameInput, "usernameInput", 15000);
    await username.fill(randomUsername());
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
    const submitted = await clickVisibleIfFound(page, config.selectors.submitAuth, "submitAuth", 5000);
    if (!submitted) {
      console.log("      submit button not found, pressing Enter");
      await page.keyboard.press("Enter");
    }
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
    const submitted = await clickVisibleIfFound(page, config.selectors.submitOtp, "submitOtp", 5000);
    if (!submitted) {
      console.log("      OTP submit button not found, pressing Enter");
      await page.keyboard.press("Enter");
    }
  } else {
    await page.keyboard.press("Enter");
  }

  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function followTarget(page: Page): Promise<void> {
  await page.goto(config.targetProfileUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

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

async function clickVisible(page: Page, selector: string, selectorName: string, timeout = 30000): Promise<void> {
  const locator = await waitVisible(page, selector, selectorName, timeout);
  await locator.click();
}

async function clickVisibleIfFound(
  page: Page,
  selector: string,
  selectorName: string,
  timeout: number,
): Promise<boolean> {
  const locator = visible(page, selector);

  try {
    await locator.waitFor({ state: "visible", timeout });
    await locator.click();
    return true;
  } catch {
    return false;
  }
}

async function waitForAppReady(page: Page, selector: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const ready = await visible(page, selector)
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (ready) {
      return;
    }

    if (attempt < 3) {
      console.log(`      app not ready on attempt ${attempt}, reloading...`);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    }
  }

  throw new Error(
    "App did not become interactive after 3 attempts. The site is likely blocking automated browsers (anti-bot/WAF). Try HEADLESS=false so the browser window is visible.",
  );
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
