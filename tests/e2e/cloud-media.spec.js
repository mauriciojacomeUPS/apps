import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test.use({ serviceWorkers: "block" });
const cloud = "https://onda-cloud.example.test";
const key = "onda-test-cloud-access-key-only-for-contracts-123456";
const wrongKey = "incorrect-test-cloud-access-key-123456789";
const jobId = "11111111-1111-4111-8111-111111111111";
const source = "https://soundcloud.com/onda/mi-tema-publico";

async function configure(page, accessKey = key) {
  const settings = page.locator(".media-server-settings");
  if (!(await settings.locator("summary").evaluate((element) => element.parentElement.open)))
    await settings.locator("summary").click();
  await page.getByLabel("Dirección del servidor de descargas", { exact: true }).fill(cloud);
  await page.getByLabel("Clave del servidor de descargas", { exact: true }).fill(accessKey);
  await expect(
    page.getByRole("checkbox", { name: "Recordar la clave en este navegador", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Guardar y conectar", exact: true }).click();
}

function cors(baseURL) {
  return {
    "Access-Control-Allow-Origin": new URL(baseURL).origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Onda-Client, X-Onda-Format, X-Onda-Filename",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
  };
}
const status = (job) => ({
  convert: false,
  uploads: false,
  youtube: true,
  sources: ["youtube", "soundcloud", "bandcamp", "vimeo", "archive"],
  job,
  limits: {
    maxAudioBytes: 32 * 1024 * 1024,
    maxPlaylistBytes: 128 * 1024 * 1024,
    maxPlaylistTracks: 25,
  },
});

test("cloud connection keeps keys private, requests public sources with isolated credentials and saves playable audio", async ({
  page,
  baseURL,
}) => {
  const audio = await readFile("public/audio/sunset.mp3");
  const headers = cors(baseURL),
    calls = [],
    clientTokens = [];
  const working = {
    id: jobId,
    state: "working",
    provider: "soundcloud",
    message: "Preparando el enlace…",
  };
  const ready = {
    ...working,
    state: "ready",
    message: "Tu descarga está lista.",
    result: { name: "Sunset.mp3", type: "audio/mpeg", size: audio.length },
    downloadToken: "artifact-cap",
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(cloud + "/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      incoming = await request.allHeaders();
    calls.push({
      method: request.method(),
      path: url.pathname,
      query: url.search,
      authorization: incoming.authorization,
      client: incoming["x-onda-client"],
    });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/healthz") {
      expect(incoming.authorization).toBeUndefined();
      expect(incoming["x-onda-client"]).toBeUndefined();
      return route.fulfill({
        headers,
        json: {
          ok: true,
          sourceCheck: { status: "passed", message: "Audio de prueba obtenido en el servidor." },
        },
      });
    }
    if (
      url.pathname === "/v1/media/jobs/" + jobId + "/result" &&
      url.searchParams.has("download_token")
    ) {
      expect(url.searchParams.get("download_token")).toBe("artifact-cap");
      expect(incoming.authorization).toBeUndefined();
      expect(incoming["x-onda-client"]).toBeUndefined();
      return route.fulfill({
        status: 200,
        headers: { ...headers, "Content-Disposition": 'attachment; filename="Sunset.mp3"' },
        contentType: "audio/mpeg",
        body: audio,
      });
    }
    expect(incoming.authorization).toBe("Bearer " + key);
    expect(incoming["x-onda-client"]).toMatch(/^[a-f0-9]{64}$/);
    clientTokens.push(incoming["x-onda-client"]);
    if (url.pathname === "/v1/media/status") return route.fulfill({ headers, json: status(null) });
    if (url.pathname === "/v1/media/jobs" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ url: source, format: "mp3", playlist: false });
      return route.fulfill({ status: 202, headers, json: working });
    }
    if (url.pathname === "/v1/media/jobs/" + jobId) return route.fulfill({ headers, json: ready });
    if (url.pathname === "/v1/media/jobs/" + jobId + "/result") {
      expect(url.search).toBe("");
      return route.fulfill({ headers, contentType: "audio/mpeg", body: audio });
    }
    return route.fulfill({
      status: 404,
      headers,
      json: { error: "Unexpected cloud contract route" },
    });
  });
  await page.goto("./#device");
  await configure(page);
  await expect(page.locator(".source-probe")).toContainText("descarga verificada");
  const storage = await page.evaluate(() => ({
    connection: JSON.parse(localStorage.getItem("onda-media-server:guest")),
    session: sessionStorage.getItem("onda-media-key:guest"),
    localValues: Object.values(localStorage),
    client: localStorage.getItem("onda-media-client:guest"),
    otherAccount: sessionStorage.getItem("onda-media-key:other-account"),
  }));
  expect(storage.connection).toEqual({ url: cloud, key: "", remember: false });
  expect(storage.session).toBe(key);
  expect(storage.localValues.some((value) => value.includes(key))).toBe(false);
  expect(storage.client).toMatch(/^[a-f0-9]{64}$/);
  expect(storage.otherAccount).toBeNull();

  await page.getByRole("button", { name: "Otros sitios", exact: true }).click();
  await page.getByLabel("Enlace público de audio o video", { exact: true }).fill(source);
  await page.locator(".media-tools-format select").selectOption("mp3");
  await page.getByRole("button", { name: "Preparar descarga", exact: true }).click();
  const save = page.getByRole("link", { name: "Guardar archivo", exact: true });
  await expect(save).toBeVisible();
  const href = new URL(await save.getAttribute("href"));
  expect(href.origin).toBe(cloud);
  expect(href.searchParams.get("download_token")).toBe("artifact-cap");
  expect(href.href).not.toContain(key);
  expect(href.href).not.toContain(storage.client);
  const downloading = page.waitForEvent("download");
  await save.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("Sunset.mp3");
  expect(
    createHash("sha256")
      .update(await readFile(await download.path()))
      .digest("hex"),
  ).toBe(createHash("sha256").update(audio).digest("hex"));
  await page.getByRole("button", { name: "Añadir a biblioteca", exact: true }).click();
  await expect(page.locator(".device-track")).toHaveCount(1);
  await expect(page.locator(".device-track .track-info strong")).toHaveText("Sunset");
  await page.getByRole("button", { name: "Reproducir Sunset", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate(
          (element) =>
            element.src.startsWith("blob:") && !element.paused && element.currentTime > 0,
        ),
    )
    .toBeTruthy();
  expect(new Set(clientTokens)).toEqual(new Set([storage.client]));
  expect(
    calls.some(
      (call) =>
        call.path.endsWith("/result") &&
        call.query === "?download_token=artifact-cap" &&
        !call.authorization,
    ),
  ).toBe(true);
  expect(
    calls.some(
      (call) =>
        call.path.endsWith("/result") && !call.query && call.authorization === "Bearer " + key,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("an incorrect cloud key is actionable and the online service never uploads a device audio file", async ({
  page,
  baseURL,
}) => {
  const headers = cors(baseURL),
    uploadCalls = [];
  await page.route(cloud + "/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      incoming = await request.allHeaders();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/healthz")
      return route.fulfill({
        headers,
        json: { ok: true, sourceCheck: { status: "disabled", message: "Pendiente" } },
      });
    if (request.method() === "POST")
      uploadCalls.push({ path: url.pathname, type: incoming["content-type"] });
    if (incoming.authorization !== "Bearer " + key)
      return route.fulfill({ status: 401, headers, json: { error: "Private key mismatch" } });
    expect(incoming["x-onda-client"]).toMatch(/^[a-f0-9]{64}$/);
    return route.fulfill({ headers, json: status(null) });
  });
  await page.goto("./#device");
  await configure(page, wrongKey);
  await expect(page.locator(".media-server-settings").getByRole("alert")).toHaveText(
    "La clave de acceso del servidor no coincide.",
  );
  await page.getByLabel("Clave del servidor de descargas", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Guardar y conectar", exact: true }).click();
  await expect(
    page
      .locator(".media-tools-form")
      .getByRole("button", { name: "Preparar descarga", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archivo del equipo", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Los archivos del dispositivo se añaden directamente a tu biblioteca.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".media-tools-form input[type=file]")).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Añadir audio desde Archivos", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "Mi audio.mp3",
    mimeType: "audio/mpeg",
    buffer: await readFile("public/audio/sunset.mp3"),
  });
  await expect(page.locator(".device-track")).toHaveCount(1);
  expect(uploadCalls).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some(
        (value) =>
          value.includes("onda-test-cloud-access-key-only-for-contracts-123456") ||
          value.includes("incorrect-test-cloud-access-key-123456789"),
      ),
    ),
  ).toBe(false);
});
