import playwright from "playwright";

const { chromium } = playwright;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(() => window.localStorage.clear());
const page = await context.newPage();
const consoleMessages = [];

page.on("console", (message) => {
  consoleMessages.push(`${message.type()}: ${message.text()}`);
});

async function generateAndWaitForNewManifest() {
  const manifestLink = page.getByRole("link", { name: "Manifest", exact: true });
  const previousHref = (await manifestLink.count())
    ? await manifestLink.getAttribute("href")
    : null;
  await page.getByRole("button", { name: /generate pack/i }).click();
  await page.waitForFunction(
    (previous) => {
      const link = Array.from(document.querySelectorAll("a")).find(
        (candidate) => candidate.textContent?.trim() === "Manifest",
      );
      return Boolean(link?.href && link.href !== previous);
    },
    previousHref,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () =>
      Array.from(document.images).every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    { timeout: 30000 },
  );
}

async function dragItemToTier(itemId, tierIndex) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.locator(`[data-item-id="${itemId}"]`);
  const tier = page.locator(".tier-row").nth(tierIndex);
  await card.dispatchEvent("dragstart", { dataTransfer });
  await tier.dispatchEvent("dragover", { dataTransfer });
  await tier.dispatchEvent("drop", { dataTransfer });
  await card.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

try {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.getByLabel("Tier list title").fill("Identity regeneration");
  await page.locator("textarea#items").fill("Alien\nAlien\nThe Thing");
  await page.getByLabel("Generate mode").selectOption("text");
  await page.getByLabel("Background").fill("#ff0000");
  await page.getByLabel("Text", { exact: true }).fill("#00ff00");
  await page.getByRole("button", { name: "I", exact: true }).click();
  await generateAndWaitForNewManifest();

  const initialIds = await page.locator(".bench .card").evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-item-id")),
  );
  if (initialIds.length !== 3 || new Set(initialIds).size !== 3) {
    throw new Error(`Expected three independent item IDs: ${initialIds}`);
  }

  await dragItemToTier(initialIds[0], 0);
  await dragItemToTier(initialIds[1], 1);

  const rankedBeforeRegeneration = await page
    .locator(".tier-row")
    .evaluateAll((rows) =>
      rows.slice(0, 2).map((row) =>
        Array.from(row.querySelectorAll(".card")).map((card) =>
          card.getAttribute("data-item-id"),
        ),
      ),
    );
  if (
    rankedBeforeRegeneration[0]?.[0] !== initialIds[0] ||
    rankedBeforeRegeneration[1]?.[0] !== initialIds[1]
  ) {
    throw new Error(
      `Drag-and-drop did not rank duplicates independently: ${JSON.stringify(
        rankedBeforeRegeneration,
      )}`,
    );
  }

  await page.locator("textarea#items").fill("The Thing\nAlien\nAliens");
  await page.getByText(/Treated .* as a rename and preserved its ranking/).waitFor();
  await generateAndWaitForNewManifest();

  const firstTierIds = await page
    .locator(".tier-row")
    .nth(0)
    .locator(".card")
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-item-id")));
  const secondTierIds = await page
    .locator(".tier-row")
    .nth(1)
    .locator(".card")
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-item-id")));
  const benchAfterRename = await page.locator(".bench .card").evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-item-id")),
  );

  if (
    firstTierIds[0] !== initialIds[0] ||
    secondTierIds[0] !== initialIds[1]
  ) {
    throw new Error(
      `Ranked IDs changed after regeneration: ${JSON.stringify({
        initialIds,
        firstTierIds,
        secondTierIds,
      })}`,
    );
  }
  if (benchAfterRename.length !== 1) {
    throw new Error(`Expected one existing unranked item: ${benchAfterRename}`);
  }

  await page
    .locator("textarea#items")
    .fill("The Thing\nAlien\nAliens\nArrival");
  await generateAndWaitForNewManifest();
  const benchIds = await page.locator(".bench .card").evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-item-id")),
  );
  if (benchIds.length !== 2) {
    throw new Error(`Expected existing unranked plus one new bench item: ${benchIds}`);
  }

  await page.locator("textarea#items").fill("The Thing\nAlien\nArrival");
  if (await page.locator(`[data-item-id="${initialIds[0]}"]`).count()) {
    throw new Error("A removed ranked item reappeared from stale pack assets.");
  }
  await generateAndWaitForNewManifest();
  const secondTierAfterRemoval = await page
    .locator(".tier-row")
    .nth(1)
    .locator(".card")
    .getAttribute("data-item-id");
  if (secondTierAfterRemoval !== initialIds[1]) {
    throw new Error(
      `Removing another item changed a surviving assignment: ${secondTierAfterRemoval}`,
    );
  }

  const exportDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /export png/i }).click(),
  ]).then(([download]) => download);
  await exportDownload.saveAs("../../.tierzo/export-test.png");

  const manifestHref = await page
    .getByRole("link", { name: "Manifest", exact: true })
    .getAttribute("href");
  const extensionHref = await page
    .getByRole("link", { name: /extension json/i })
    .getAttribute("href");
  const zipHref = await page
    .getByRole("link", { name: /download zip/i })
    .getAttribute("href");
  const manifest = await fetch(manifestHref).then((response) => response.json());
  if (
    manifest.schema_version !== "tierzo.pack.v1" ||
    manifest.card_style?.background !== "#ff0000" ||
    manifest.card_style?.text_color !== "#00ff00" ||
    manifest.card_style?.italic !== true
  ) {
    throw new Error(`Generated manifest is inconsistent: ${JSON.stringify(manifest)}`);
  }
  if (
    manifest.items.length !== 3 ||
    new Set(manifest.items.map((item) => item.id)).size !== 3
  ) {
    throw new Error(`Manifest item identities are not unique: ${JSON.stringify(manifest.items)}`);
  }

  await page.screenshot({
    path: "../../.tierzo/demo-screenshot.png",
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        initialIds,
        firstTierIds,
        secondTierIds,
        benchAfterRename,
        benchIds,
        secondTierAfterRemoval,
        exportName: exportDownload.suggestedFilename(),
        manifestIds: manifest.items.map((item) => item.id),
        manifestFilenames: manifest.items.map((item) => item.filename),
        zipHref,
        extensionHref,
        consoleMessages,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
