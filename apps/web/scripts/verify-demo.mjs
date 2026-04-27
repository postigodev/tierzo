import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleMessages = [];

page.on("console", (message) => {
  consoleMessages.push(`${message.type()}: ${message.text()}`);
});

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
const title = await page.getByLabel("Tier list title").inputValue();
const secondTier = page.getByLabel("Tier 2 label");
await secondTier.fill("hola aiiiiiiiiiiiiiiii");
const activeLabelAfterEdit = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
await page.locator(".tier-row").nth(1).click({ button: "right" });
await page.getByRole("menuitem", { name: /add row below/i }).click();
await page.locator(".tier-row").nth(2).click({ button: "right" });
await page.getByRole("menuitem", { name: /add row above/i }).click();
await page.locator(".tier-row").nth(2).click({ button: "right" });
await page.getByRole("menuitem", { name: /delete row/i }).click();
await page.getByLabel("Drag tier 3").dragTo(page.getByLabel("Drag tier 1"));
const tierInputCount = await page.locator(".tier-label").count();
await page.getByRole("button", { name: /generate pack/i }).click();
await page.waitForSelector("img", { timeout: 30000 });
await page.waitForFunction(() =>
  Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
);
await page.locator(".bench .card").first().dragTo(page.locator(".tier-row").nth(4));
const exportDownload = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: /export png/i }).click(),
]).then(([download]) => download);
await exportDownload.saveAs("../../.tierzo/export-test.png");

const imageCount = await page.locator("img").count();
const zipHref = await page.locator("a", { hasText: /download zip/i }).getAttribute("href");
const extensionHref = await page.getByRole("link", { name: /extension json/i }).getAttribute("href");
const exportName = exportDownload.suggestedFilename();
await page.screenshot({ path: "../../.tierzo/demo-screenshot.png", fullPage: true });

await context.close();
await browser.close();

console.log(
  JSON.stringify(
    {
      title,
      activeLabelAfterEdit,
      tierInputCount,
      imageCount,
      exportName,
      zipHref,
      extensionHref,
      consoleMessages,
    },
    null,
    2,
  ),
);
