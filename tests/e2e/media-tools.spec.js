import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });

const iphoneAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test.describe("remote web with an iPhone user agent", () => {
  test.use({ userAgent: iphoneAgent });

  test("shows file import on a remote host and links a Spotify CSV without contacting Spotify", async ({
    page,
    baseURL,
  }) => {
    const errors = [],
      spotifyRequests = [],
      remoteMediaRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname === "spotify.com" || url.hostname.endsWith(".spotify.com"))
        spotifyRequests.push(request.url());
      if (url.pathname.includes("/__onda-media/")) remoteMediaRequests.push(request.url());
    });
    await page.route("https://onda-media.example.test/**", async (route) => {
      const remote = new URL(route.request().url());
      const local = new URL(baseURL);
      local.pathname = remote.pathname;
      local.search = remote.search;
      const response = await route.fetch({ url: local.href });
      await route.fulfill({ response });
    });
    await page.goto("https://onda-media.example.test/apps/#device");
    const tools = page.locator(".media-tools");
    await expect(tools.getByRole("button", { name: "YouTube", exact: true })).toBeVisible();
    await expect(
      tools.getByRole("button", { name: "Spotify · listas", exact: true }),
    ).toBeVisible();
    await expect(
      tools.getByRole("button", { name: "Archivo del equipo", exact: true }),
    ).toBeVisible();
    await expect(
      tools.getByText("Esta versión web no tiene un servidor de descargas conectado.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => Boolean(window.isSecureContext && crypto.subtle)),
    ).toBeTruthy();

    const choosingAudio = page.waitForEvent("filechooser");
    await tools
      .getByRole("button", { name: "Añadir desde Archivos del iPhone", exact: true })
      .click();
    await (
      await choosingAudio
    ).setFiles({
      name: "Sunset.mp3",
      mimeType: "audio/mpeg",
      buffer: await readFile("public/audio/sunset.mp3"),
    });
    await expect(page.locator(".device-track")).toHaveCount(1);
    await expect(page.locator(".device-track .track-info strong")).toHaveText("Sunset");

    await tools.getByRole("button", { name: "Spotify · listas", exact: true }).click();
    const choosingPlaylist = page.waitForEvent("filechooser");
    await tools.getByRole("button", { name: "Importar CSV de Spotify", exact: true }).click();
    const picker = await choosingPlaylist;
    expect(await picker.element().getAttribute("aria-label")).toBe("Importar archivo de playlist");
    await picker.setFiles({
      name: "Favoritas Spotify.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Track Name,Artist Name(s)\nSunset,Onda Studio\nCanción ausente,Onda Studio\n",
      ),
    });
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Favoritas Spotify", exact: true }),
    ).toBeVisible();
    const summary = dialog.locator(".playlist-transfer-summary > div");
    await expect(summary.filter({ hasText: "Canciones encontradas" }).locator("strong")).toHaveText(
      "1",
    );
    await expect(
      summary.filter({ hasText: "Archivos no disponibles" }).locator("strong"),
    ).toHaveText("1");
    await dialog.getByText("Ver canciones pendientes (1)", { exact: true }).click();
    await expect(dialog.locator(".playlist-missing-tracks li strong")).toHaveText(
      "Canción ausente",
    );
    await dialog.getByRole("button", { name: "Importar playlist", exact: true }).click();
    await expect(page.locator(".playlist-content > .track-table .track-info strong")).toHaveText([
      "Sunset",
    ]);
    expect(spotifyRequests).toEqual([]);
    expect(remoteMediaRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test("adds a prepared playlist one track at a time, reports duplicates and does not fetch the ZIP", async ({
  page,
}) => {
  const [sunset, bloom] = await Promise.all([
    readFile("public/audio/sunset.mp3"),
    readFile("public/audio/bloom.mp3"),
  ]);
  const requests = [],
    trackRequests = [];
  let activeTransfers = 0,
    peakTransfers = 0;
  const job = {
    id: "fixture-job",
    state: "ready",
    result: { name: "Lista.zip", type: "application/zip" },
    items: [
      { id: 0, name: "Sunset.mp3", type: "audio/mpeg" },
      { id: 1, name: "Bloom.mp3", type: "audio/mpeg" },
    ],
    saved: 2,
    total: 2,
  };
  await page.route("**/__onda-media/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path.endsWith("/status"))
      return route.fulfill({ json: { convert: true, youtube: true, job } });
    const match = /\/jobs\/fixture-job\/tracks\/([01])$/.exec(path);
    if (match) {
      trackRequests.push(Number(match[1]));
      activeTransfers++;
      peakTransfers = Math.max(peakTransfers, activeTransfers);
      try {
        return await route.fulfill({
          status: 200,
          contentType: "audio/mpeg",
          body: match[1] === "0" ? sunset : bloom,
        });
      } finally {
        activeTransfers--;
      }
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected request in playlist import contract" },
    });
  });
  await page.goto("./#device");
  await page
    .getByLabel("Seleccionar canciones locales")
    .setInputFiles({ name: "Ya estaba.mp3", mimeType: "audio/mpeg", buffer: sunset });
  await expect(page.locator(".device-track")).toHaveCount(1);
  await page.getByRole("button", { name: "Añadir playlist a biblioteca", exact: true }).click();
  await expect(page.locator(".media-import-progress")).toContainText(
    "2 de 2 procesadas · 1 añadidas · 1 duplicadas",
  );
  await expect(page.locator(".device-track")).toHaveCount(2);
  expect((await page.locator(".device-track .track-info strong").allTextContents()).sort()).toEqual(
    ["Bloom", "Sunset"],
  );
  await expect(page.getByRole("button", { name: "En tu biblioteca", exact: true })).toBeDisabled();
  expect(trackRequests).toEqual([0, 1]);
  expect(peakTransfers).toBe(1);
  expect(requests.some((path) => path.endsWith("/result"))).toBe(false);
});

test("Web Share receives the prepared audio as a real File after an explicit prepare action", async ({
  page,
}) => {
  const sunset = await readFile("public/audio/sunset.mp3");
  const resultRequests = [];
  await page.addInitScript(() => {
    window.ondaShareCalls = [];
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: ({ files }) => files?.length === 1 && files[0] instanceof File,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async ({ files, title }) => {
        const captured = await Promise.all(
          files.map(async (file) => ({
            realFile: file instanceof File,
            name: file.name,
            size: file.size,
            type: file.type,
            digest: [
              ...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
            ]
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join(""),
          })),
        );
        window.ondaShareCalls.push({ title, files: captured });
      },
    });
  });
  const job = {
    id: "share-job",
    state: "ready",
    result: { name: "Sunset.mp3", type: "audio/mpeg" },
  };
  await page.route("**/__onda-media/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status"))
      return route.fulfill({ json: { convert: true, youtube: true, job } });
    if (path.endsWith("/jobs/share-job/result")) {
      resultRequests.push(path);
      return route.fulfill({ status: 200, contentType: "audio/mpeg", body: sunset });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected request in Web Share contract" },
    });
  });
  await page.goto("./#device");
  await expect(
    page.getByRole("button", { name: "Preparar para compartir", exact: true }),
  ).toBeVisible();
  expect(resultRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Preparar para compartir", exact: true }).click();
  const share = page.getByRole("button", { name: "Compartir / Guardar en Archivos", exact: true });
  await expect(share).toBeVisible();
  expect(resultRequests).toHaveLength(1);
  await share.click();
  await expect.poll(() => page.evaluate(() => window.ondaShareCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.ondaShareCalls)).toEqual([
    {
      title: "Sunset.mp3",
      files: [
        {
          realFile: true,
          name: "Sunset.mp3",
          size: sunset.length,
          type: "audio/mpeg",
          digest: createHash("sha256").update(sunset).digest("hex"),
        },
      ],
    },
  ]);
  expect(resultRequests).toHaveLength(1);
});
