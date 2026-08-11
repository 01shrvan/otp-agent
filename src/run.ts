import { chromium, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { loadDotEnv } from "./env.js";
import { createInbox, delay, type TestInbox } from "./inbox.js";

loadDotEnv();

const config = loadConfig();

const FIRST_NAMES = [
  "aarohi", "aadya", "advait", "anvi", "aarush", "arnav", "avni", "anaya", "anika",
  "bhavya", "chaitanya", "devansh", "diya", "darsh", "eshaan", "gauri", "harshita",
  "ishir", "ishaan", "jhanvi", "kavya", "krish", "lavanya", "mihir", "manasvi",
  "navya", "nysa", "ojas", "omkar", "prisha", "pari", "rudra", "reyansh", "shlok",
  "saanvi", "shanaya", "tanisha", "vaanya", "vivaan", "vihaan", "yashvi", "zoya",
  "ishita", "karthik", "nandini", "yuvaan", "aditya", "ananya", "arjun", "avinash",
  "bharat", "chetan", "dhanush", "gaurav", "hemant", "isa", "jay", "karan",
  "lakshya", "manas", "neel", "ojasvi", "pranav", "raghav", "riya", "sahil",
  "tanvi", "urja", "varun", "yash", "zaara", "aman", "bhavna", "deepika", "girish",
  "indira", "kirti", "mansi", "nitin", "pooja", "ritu", "sameer", "tejas", "uday",
  "vidhi", "yuvraj", "ziya", "hana", "yuki", "aiko", "mei", "rena", "kyra", "mika",
  "lena", "ines", "nova", "ava", "eira", "freya", "sylvie", "opal", "fern", "hazel",
  "mabel", "ollie", "teddy", "benji", "charlie", "bailey", "skye", "robin", "jules",
  "marlowe", "sasha", "tatum", "winston", "gus", "milo", "otto", "zane", "beau",
  "juno", "wren", "august", "celeste", "dahlia", "esme", "flora", "genevieve",
  "hollis", "irving", "jasper", "kipling", "lavender", "magnolia", "noel", "opal",
  "pearl", "quill", "rosemary", "sage", "tallulah", "ulysses", "violet", "willow",
  "ximena", "yara", "zelda", "amelia", "bryce", "colby", "drew", "ellis", "finch",
  "gray", "hunter", "indigo", "jayce", "knox", "lennox", "maddox", "nico", "oskar",
  "phoenix", "quade", "rowan", "sutton", "troy", "ulric", "vaughn", "west", "xeno",
  "yasmin", "zephyr", "aki", "bo", "cato", "delta", "ember", "falcon", "gizmo",
  "harley", "iguana", "jett", "koda", "luna", "max", "nemo", "otis", "panda", "rex",
  "simba", "tiger", "uni", "vin", "wolf", "yogi", "zorro",
];

const SURNAMES = [
  "sharma", "verma", "iyer", "nair", "kapoor", "malhotra", "mehta", "rao", "joshi",
  "desai", "chopra", "agarwal", "gupta", "sethi", "kohli", "batra", "grewal", "sodhi",
  "dutta", "bose", "ghosh", "mukherjee", "banerjee", "singh", "kumar", "patel",
  "shah", "jain", "saxena", "tripathi", "tiwari", "mishra", "dwivedi", "chauhan",
  "rathore", "gill", "dhillon", "chhabra", "bhatt", "thakur", "negi", "rawat",
  "pandey", "srivastava", "kulkarni", "deshmukh", "patil", "gaikwad", "shetty",
  "menon", "pillai", "reddy", "naidu", "prasad", "yadav", "khan", "ansari",
];

const USERNAME_WORDS = [
  "wolf", "storm", "night", "blaze", "frost", "raven", "hawk", "fox", "moon",
  "star", "river", "sky", "ember", "shadow", "nova", "dawn", "mist", "pine",
  "clover", "juno", "echo", "sage", "cinder", "delta", "orbit", "vega",
  "haven", "orion", "willow", "jasmine", "chase", "buddy", "rocky", "pebbles",
  "lucky", "coco", "zeus", "apollo", "comet", "bandit", "clover", "diesel", "echo",
  "frankie", "ginger", "holly", "indie", "jake", "kobe", "leo", "mango", "nibbles",
  "oakley", "pixel", "quinn", "rosie", "sunny", "taco", "umber", "velvet", "whiskey",
  "zara",
];

const usedUsernames = new Set<string>();

const USERNAME_TAKEN_PATTERN =
  /\b(username|name|handle)\b[^]{0,80}\b(already taken|already in use|in use|not available|taken|unavailable)\b|\b(already taken|already in use|in use|taken|unavailable)\b[^]{0,80}\b(username|name|handle)\b/i;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomSuffix(): number {
  const roll = Math.random();

  if (roll < 0.2) return Math.floor(Math.random() * 90000) + 10000;
  if (roll < 0.4) return Math.floor(Math.random() * 9000) + 1000;
  if (roll < 0.55) return Math.floor(Math.random() * 900) + 100;
  if (roll < 0.75) return Math.floor(Math.random() * 90) + 10;
  return Math.floor(Math.random() * 10) + 2004;
}

function randomUsername(): string {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const name = pick(FIRST_NAMES);
    const surname = pick(SURNAMES);
    const word = pick(USERNAME_WORDS);
    const num = randomSuffix();
    const style = Math.floor(Math.random() * 7);

    const candidate =
      style === 0 ? `${name}${num}`
      : style === 1 ? `${name}_${num}`
      : style === 2 ? `${name}_${surname}`
      : style === 3 ? `${name}${surname}${num}`
      : style === 4 ? `${name}_${surname}_${num}`
      : style === 5 ? `${name}${word}${num}`
      : `${name}${surname}`;

    if (candidate.length > 24) {
      continue;
    }

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
    const opened = await openAuthDialog(page);

    if (!opened) {
      throw new Error(
        `Auth dialog did not open. ${await selectorErrorMessage(page, "emailInput", config.selectors.emailInput)}`,
      );
    }

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

  let authSubmitted = false;
  let lastUsername = "";

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    if (config.selectors.submitAuth) {
      const button = visible(page, config.selectors.submitAuth);
      const enabled = await button.isEnabled().catch(() => false);
      if (enabled) {
        await button.click();
      } else {
        console.log("      submit button disabled, pressing Enter");
        await page.keyboard.press("Enter");
      }
    } else {
      await page.keyboard.press("Enter");
    }

    await delay(2500);

    const errorLines = await pageErrorLines(page);
    if (errorLines.length > 0) {
      console.log(`      form messages: ${errorLines.join(" | ")}`);
    }

    const taken =
      config.selectors.usernameInput !== undefined &&
      errorLines.some((line) => USERNAME_TAKEN_PATTERN.test(line));

    if (!taken) {
      authSubmitted = true;
      break;
    }

    console.log(`      username already taken, retrying with a new one (${attempt}/12)`);

    if (!config.selectors.usernameInput) {
      throw new Error("usernameInput selector is required.");
    }

    const username = await waitVisible(page, config.selectors.usernameInput, "usernameInput", 10000);
    await username.click();
    await username.press("Control+A");
    await username.type(randomUsername(), { delay: 40 });
    await username.press("Tab");

    const newValue = await username.inputValue().catch(() => "");

    if (newValue === lastUsername) {
      console.log("      WARNING: field value did not change, retyping");
      await username.click();
      await username.press("Control+A");
      await username.type(randomUsername(), { delay: 40 });
      await username.press("Tab");
    }

    lastUsername = (await username.inputValue().catch(() => "")) || lastUsername;
    console.log(`      field now contains: ${lastUsername}`);

    const errorCleared = await waitForTextGone(page, "already taken", 6000);
    console.log(errorCleared ? "      validation cleared, resubmitting" : "      error still present, trying next name");
    await delay(500);
  }

  if (!authSubmitted) {
    throw new Error("Could not submit the signup form after 12 attempts.");
  }

  console.log("      auth submitted");

  const otpInputAppeared = await waitVisible(page, config.selectors.otpInput, "otpInput", 15000)
    .then(() => true)
    .catch(() => false);

  let otp: string;
  const resendTimer = setInterval(() => {
    if (config.selectors.resendOtpButton) {
      clickVisibleIfFound(page, config.selectors.resendOtpButton, "resendOtpButton", 1500).catch(
        () => undefined,
      );
    }
  }, 45000);

  try {
    otp = await inbox.waitForOtp();
  } catch (error) {
    const detail = await selectorErrorMessage(page, "otpInput", config.selectors.otpInput);
    throw new Error(
      `Timed out waiting for OTP email (OTP input visible on page: ${otpInputAppeared}).\n${detail}`,
      { cause: error },
    );
  } finally {
    clearInterval(resendTimer);
  }
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

async function openAuthDialog(page: Page): Promise<boolean> {
  const dialogSelector = "[role='dialog'], [class*='modal'], [data-testid*='modal']";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const formVisible = await waitVisible(page, config.selectors.emailInput, "emailInput", 10000)
      .then(() => true)
      .catch(() => false);

    if (formVisible) {
      return true;
    }

    const dialogVisible = await hasVisible(page, dialogSelector);
    if (!dialogVisible && config.selectors.openAuthDialog) {
      await clickVisibleIfFound(page, config.selectors.openAuthDialog, "openAuthDialog", 8000);
      await delay(2500);
    }
  }

  return false;
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

async function pageErrorLines(page: Page): Promise<string[]> {
  const body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 1 &&
        line.length < 200 &&
        /\b(error|taken|invalid|already|required|verify|code|check your email|not available|try again)\b/i.test(
          line,
        ),
    )
    .slice(0, 8);
}

async function waitForTextGone(page: Page, snippet: string, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const body = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    if (!body.toLowerCase().includes(snippet.toLowerCase())) {
      return true;
    }
    await delay(600);
  }

  return false;
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
