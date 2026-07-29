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
  await page
    .getByRole("button", { name: /(?:create|regenerate) pack/i })
    .click();
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

async function openPasteComposer() {
  const sourceEditor = page.locator("details.source-editor-disclosure");
  if (
    (await sourceEditor.count()) &&
    !(await sourceEditor.evaluate((element) => element.open))
  ) {
    await sourceEditor.locator("summary").click();
  }

  const pasteTab = page.getByRole("tab", { name: "Paste list" });
  if ((await pasteTab.getAttribute("aria-selected")) !== "true") {
    await pasteTab.click();
  }
}

async function openGenerationOptions() {
  const options = page.locator("details.generation-options");
  if (!(await options.evaluate((element) => element.open))) {
    await options.locator("summary").click();
  }
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
  const capabilitiesResponse = await fetch("http://localhost:8000/capabilities");
  const capabilityContract = await capabilitiesResponse.json();
  if (
    !capabilitiesResponse.ok ||
    capabilityContract.schema_version !== "tierzo.capabilities.v1" ||
    !capabilityContract.capabilities?.text_cards?.available ||
    !capabilityContract.capabilities?.auto_planning?.available ||
    capabilityContract.capabilities?.tmdb_movie?.available
  ) {
    throw new Error(
      `Expected deterministic provider-free capabilities: ${JSON.stringify(
        capabilityContract,
      )}`,
    );
  }
  if (
    !(await page.getByRole("tab", { name: "Describe" }).isVisible()) ||
    !(await page.getByRole("tab", { name: "Paste list" }).isVisible()) ||
    !(await page.locator(".empty-board-cue").isVisible()) ||
    (await page.locator(".board").count()) !== 0
  ) {
    throw new Error("The empty workspace did not expose the focused composer.");
  }
  if (
    await page
      .locator("details.generation-options")
      .evaluate((element) => element.open)
  ) {
    throw new Error("Generation options should start collapsed.");
  }

  await page
    .getByLabel("Prompt to tier list")
    .fill("Rank these: Alien, Aliens, Arrival");
  await page.getByRole("button", { name: "Draft list" }).click();
  await page.getByText("3 items ready", { exact: true }).waitFor();
  await page
    .getByText(/OpenAI is not configured; Tierzo used deterministic planning/)
    .waitFor();

  await page.getByLabel("Tier list title").fill("Identity regeneration");
  await page
    .getByLabel("Tier list description")
    .fill("Lifecycle recovery smoke");
  await openPasteComposer();
  await page.locator("textarea#items").fill("Alien\nAlien\nThe Thing");
  await openGenerationOptions();
  const autoOption = page.locator(
    'select[aria-label="Generate mode"] option[value="auto"]',
  );
  const textOption = page.locator(
    'select[aria-label="Generate mode"] option[value="text"]',
  );
  const tmdbOption = page.locator(
    'select[aria-label="Generate mode"] option[value="tmdb_movie"]',
  );
  const generationControls = {
    autoDisabled: await autoOption.isDisabled(),
    textDisabled: await textOption.isDisabled(),
    tmdbDisabled: (await tmdbOption.getAttribute("disabled")) !== null,
    tmdbText: await tmdbOption.textContent(),
  };
  if (
    generationControls.autoDisabled ||
    generationControls.textDisabled ||
    !generationControls.tmdbDisabled ||
    !generationControls.tmdbText?.includes("unavailable")
  ) {
    throw new Error(
      `Generation mode controls do not match API capabilities: ${JSON.stringify(
        generationControls,
      )}`,
    );
  }
  await page.getByText(/Movie posters requires TMDb configuration/).waitFor();
  await page.getByLabel("Generate mode").selectOption("text");
  await page.getByLabel("Background").fill("#ff0000");
  await page.getByLabel("Text", { exact: true }).fill("#00ff00");
  await page.getByRole("button", { name: "I", exact: true }).click();
  await generateAndWaitForNewManifest();
  if (
    (await page.locator(".empty-board-cue").count()) !== 0 ||
    !(await page.locator(".board").isVisible()) ||
    !(await page.locator(".source-tray-board-first").isVisible()) ||
    (await page
      .locator("details.generation-options")
      .evaluate((element) => element.open))
  ) {
    throw new Error("Generation did not transition to the board-first workspace.");
  }

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

  await openPasteComposer();
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
        workspace.lastJobId &&
        workspace.title === "Identity regeneration" &&
        workspace.description === "Lifecycle recovery smoke"
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

  const statusRoute = `**/packs/${restoredPackId}/status`;
  const completedStatusResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/packs/${restoredPackId}/status`) &&
      response.request().method() === "GET",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  const completedStatusResponse = await completedStatusResponsePromise;
  const completedStatusBody = await completedStatusResponse.json();
  if (
    completedStatusResponse.status() !== 200 ||
    completedStatusBody.status !== "completed" ||
    completedStatusBody.pack_id !== restoredPackId
  ) {
    throw new Error(
      `Completed restore received an inconsistent real status response: ${JSON.stringify({
        httpStatus: completedStatusResponse.status(),
        body: completedStatusBody,
      })}`,
    );
  }
  // Artifact actions are asserted only after the real completed status above.
  await page
    .getByRole("link", { name: "Manifest", exact: true })
    .waitFor({ state: "visible" });
  await openPasteComposer();
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
  await openPasteComposer();
  await generateAndWaitForNewManifest();
  const savedAfterRegeneration = await readSavedWorkspace();
  if (
    !savedAfterRegeneration.pack ||
    savedAfterRegeneration.pack.pack_id === restoredPackId
  ) {
    throw new Error("Real regeneration did not replace the lost pack.");
  }
  if (
    savedAfterRegeneration.pack.outcome !== "normal" ||
    savedAfterRegeneration.pack.warnings.length !== 0
  ) {
    throw new Error(
      `Text generation should be a normal outcome: ${JSON.stringify(
        savedAfterRegeneration.pack,
      )}`,
    );
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
  const createdAtMs = Date.parse(manifest.created_at);
  const expiresAtMs = Date.parse(manifest.expires_at);
  if (
    !utcTimestampPattern.test(manifest.created_at) ||
    !utcTimestampPattern.test(manifest.expires_at) ||
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    createdAtMs >= expiresAtMs
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
        capabilities: capabilityContract,
        generationOutcome: {
          outcome: savedAfterRegeneration.pack.outcome,
          warningCodes: savedAfterRegeneration.pack.warnings.map(
            (warning) => warning.code,
          ),
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
