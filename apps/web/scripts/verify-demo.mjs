import playwright from "playwright";

const { chromium } = playwright;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(() => {
  if (!window.sessionStorage.getItem("tierzo.demo.verify.initialized")) {
    window.localStorage.clear();
    window.sessionStorage.setItem("tierzo.demo.verify.initialized", "true");
  }
});
const page = await context.newPage();
const consoleMessages = [];
const workspaceStorageKey = "tierzo.editor.v3";
const utcTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

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

async function readSavedWorkspace() {
  return page.evaluate((key) => {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  }, workspaceStorageKey);
}

function editableWorkspaceSnapshot(workspace) {
  return {
    sourceItems: workspace.sourceItems,
    text: workspace.text,
    title: workspace.title,
    description: workspace.description,
    preset: workspace.preset,
    cardStyle: workspace.cardStyle,
    enrichmentMode: workspace.enrichmentMode,
    tiers: workspace.tiers,
    board: workspace.board,
    lastJobId: workspace.lastJobId,
    migrationWarnings: workspace.migrationWarnings,
  };
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: ${JSON.stringify({ actual, expected }, null, 2)}`,
    );
  }
}

try {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.getByLabel("Tier list title").fill("Identity regeneration");
  await page
    .getByLabel("Tier list description")
    .fill("Lifecycle recovery smoke");
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

  await page
    .getByRole("textbox", { name: "Tier 1 label" })
    .fill("Top picks");
  await page.waitForFunction(
    ({ key, expectedLabel }) => {
      const saved = window.localStorage.getItem(key);
      if (!saved) return false;
      const workspace = JSON.parse(saved);
      return (
        workspace.tiers?.[0]?.label === expectedLabel &&
        workspace.pack?.pack_id &&
        workspace.lastJobId
      );
    },
    { key: workspaceStorageKey, expectedLabel: "Top picks" },
  );

  const savedBeforeReload = await readSavedWorkspace();
  const editableBeforeInvalidation =
    editableWorkspaceSnapshot(savedBeforeReload);
  const restoredPackId = savedBeforeReload.pack?.pack_id;
  if (!restoredPackId || !savedBeforeReload.lastJobId) {
    throw new Error("Expected persisted pack and job IDs before restoration.");
  }

  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("link", { name: "Manifest", exact: true })
    .waitFor({ state: "visible" });
  if (
    (await page.locator("textarea#items").inputValue()) !==
    savedBeforeReload.text
  ) {
    throw new Error("Reload did not restore the source text.");
  }
  if (
    (await page.getByRole("textbox", { name: "Tier 1 label" }).textContent()) !==
    "Top picks"
  ) {
    throw new Error("Reload did not restore the edited tier label.");
  }
  const savedAfterCompletedRestore = await readSavedWorkspace();
  if (savedAfterCompletedRestore.pack?.pack_id !== restoredPackId) {
    throw new Error("A completed pack was not retained after reload.");
  }

  const statusRoute = `**/packs/${restoredPackId}/status`;
  await page.route(statusRoute, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pack_id: restoredPackId,
        status: "lost",
        created_at: null,
        expires_at: null,
      }),
    });
  });
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByText(
      "This temporary pack is no longer available. Your editable workspace is preserved.",
      { exact: true },
    )
    .waitFor();
  await page.waitForFunction(
    (key) =>
      JSON.parse(window.localStorage.getItem(key) ?? "null")?.pack === null,
    workspaceStorageKey,
  );

  if (
    (await page.getByRole("link", { name: "Manifest", exact: true }).count()) ||
    (await page.getByRole("link", { name: /extension json/i }).count()) ||
    (await page.getByRole("link", { name: /download zip/i }).count())
  ) {
    throw new Error("Artifact actions remained enabled after typed pack loss.");
  }
  if (!(await page.getByRole("button", { name: /export png/i }).isDisabled())) {
    throw new Error("PNG export remained enabled after typed pack loss.");
  }

  const savedAfterLoss = await readSavedWorkspace();
  assertEqual(
    editableWorkspaceSnapshot(savedAfterLoss),
    editableBeforeInvalidation,
    "Artifact invalidation changed editable workspace state",
  );
  const rankedIdsAfterLoss = Object.values(savedAfterLoss.board).flat();
  if (
    !rankedIdsAfterLoss.includes(initialIds[1]) ||
    savedAfterLoss.text !== "The Thing\nAlien\nArrival" ||
    savedAfterLoss.tiers[0]?.label !== "Top picks" ||
    savedAfterLoss.cardStyle?.background !== "#ff0000" ||
    savedAfterLoss.cardStyle?.textColor !== "#00ff00" ||
    savedAfterLoss.description !== "Lifecycle recovery smoke" ||
    savedAfterLoss.lastJobId !== savedBeforeReload.lastJobId
  ) {
    throw new Error(
      `Lost restoration did not preserve workspace data: ${JSON.stringify(
        savedAfterLoss,
      )}`,
    );
  }

  await page.unroute(statusRoute);
  await generateAndWaitForNewManifest();
  const savedAfterRegeneration = await readSavedWorkspace();
  if (
    !savedAfterRegeneration.pack ||
    savedAfterRegeneration.pack.pack_id === restoredPackId
  ) {
    throw new Error("Real regeneration did not replace the lost pack.");
  }
  assertEqual(
    savedAfterRegeneration.board,
    editableBeforeInvalidation.board,
    "Regeneration changed preserved rankings",
  );

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
  if (
    !utcTimestampPattern.test(manifest.created_at) ||
    !utcTimestampPattern.test(manifest.expires_at) ||
    Date.parse(manifest.created_at) > Date.parse(manifest.expires_at)
  ) {
    throw new Error(
      `Manifest lifecycle timestamps are not ordered UTC Z values: ${JSON.stringify({
        created_at: manifest.created_at,
        expires_at: manifest.expires_at,
      })}`,
    );
  }

  const regeneratedPackId = savedAfterRegeneration.pack.pack_id;
  const statusHref = `http://localhost:8000/packs/${regeneratedPackId}/status`;
  const firstStatus = await fetch(statusHref).then((response) => response.json());
  const secondStatus = await fetch(statusHref).then((response) => response.json());
  if (
    firstStatus.status !== "completed" ||
    firstStatus.pack_id !== regeneratedPackId ||
    firstStatus.created_at !== manifest.created_at ||
    firstStatus.expires_at !== manifest.expires_at
  ) {
    throw new Error(
      `Pack status disagrees with its manifest: ${JSON.stringify(firstStatus)}`,
    );
  }
  assertEqual(
    secondStatus,
    firstStatus,
    "Repeated status lookup renewed or changed pack lifecycle metadata",
  );

  const imageResponse = await fetch(
    `http://localhost:8000${savedAfterRegeneration.pack.items[0].image_url}`,
  );
  const zipResponse = await fetch(zipHref);
  if (!imageResponse.ok || !zipResponse.ok) {
    throw new Error(
      `Completed artifact access failed: ${JSON.stringify({
        imageStatus: imageResponse.status,
        zipStatus: zipResponse.status,
      })}`,
    );
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
        lifecycle: {
          restoredPackId,
          regeneratedPackId,
          status: firstStatus,
          preservedLastJobId: savedAfterLoss.lastJobId,
          preservedRankedIds: rankedIdsAfterLoss,
        },
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
