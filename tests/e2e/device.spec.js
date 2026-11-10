import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function openDevice(page, mobile) {
  await (
    mobile
      ? page.locator(".mobile-nav").getByRole("button", { name: "Mi música", exact: true })
      : page.getByRole("button", { name: "Archivos de este dispositivo", exact: true })
  ).click();
  await expect(page.getByRole("heading", { name: "En este dispositivo." })).toBeVisible();
}
async function openLibrary(page, mobile) {
  await (
    mobile
      ? page.locator(".mobile-nav").getByRole("button", { name: "Biblioteca", exact: true })
      : page.getByRole("button", { name: "Tu biblioteca", exact: true })
  ).click();
}

test("local files persist, play and participate in favorites/playlists without network uploads", async ({
  page,
  isMobile,
}) => {
  const errors = [],
    mutations = [],
    failed = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(response.status() + " " + response.url());
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Encuentra tu onda." })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await openDevice(page, isMobile);
  const buffer = await readFile("public/audio/sunset.mp3");
  await page
    .getByLabel("Seleccionar canciones locales")
    .setInputFiles({ name: "Mi tema local.mp3", mimeType: "audio/mpeg", buffer });
  await expect(page.locator(".device-track")).toHaveCount(1);
  await expect(page.locator(".device-track .track-info strong")).toHaveText("Sunset");
  await page
    .getByLabel("Seleccionar canciones locales")
    .setInputFiles({ name: "Duplicado.mp3", mimeType: "audio/mpeg", buffer });
  await expect(page.getByText("1 duplicada omitida", { exact: false })).toBeVisible();
  await expect(page.locator(".device-track")).toHaveCount(1);
  await page.getByRole("button", { name: "Reproducir Sunset", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((a) => a.src.startsWith("blob:") && !a.paused && a.currentTime > 0),
    )
    .toBeTruthy();
  await page.getByRole("button", { name: "Me gusta Sunset", exact: true }).click();
  await page.reload();
  await expect(page.locator(".device-track")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Quitar de me gusta Sunset", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Opciones locales de Sunset", exact: true }).click();
  await page.getByRole("button", { name: "Editar detalles", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill("Mi tema editado");
  await page.getByLabel("Artista", { exact: true }).fill("Artista local");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.locator(".device-track .track-info strong")).toHaveText("Mi tema editado");
  await openLibrary(page, isMobile);
  await page
    .locator(".library-page")
    .getByRole("button", { name: "Crear playlist", exact: true })
    .click();
  await page.getByLabel("Nombre de tu playlist").fill("Mi playlist local");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear playlist", exact: true })
    .click();
  await openDevice(page, isMobile);
  await page
    .getByRole("button", { name: "Opciones locales de Mi tema editado", exact: true })
    .click();
  await page.getByRole("button", { name: "Playlist y cola", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Mi playlist local", exact: true })
    .click();
  await openLibrary(page, isMobile);
  await page.getByRole("button", { name: "Abrir Mi playlist local", exact: true }).click();
  await expect(page.locator(".playlist-content > .track-table .track-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Reproducir Mi tema editado", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.src.startsWith("blob:") && !a.paused))
    .toBeTruthy();
  await openDevice(page, isMobile);
  await page
    .getByRole("button", { name: "Opciones locales de Mi tema editado", exact: true })
    .click();
  await page.getByRole("button", { name: "Quitar de la biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Quitar canción", exact: true }).click();
  await expect(page.locator(".device-track")).toHaveCount(0);
  await expect(page.locator(".now-playing strong")).toHaveText("Golden Hour");
  await openLibrary(page, isMobile);
  await page.getByRole("button", { name: "Abrir Mi playlist local", exact: true }).click();
  await expect(page.locator(".playlist-content > .track-table .track-row")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  expect(mutations).toEqual([]);
});

test("folder selection imports three original instrumentals and invalid audio is reported", async ({
  page,
  isMobile,
}) => {
  await page.goto("./#device");
  await expect(page.getByRole("heading", { name: "En este dispositivo." })).toBeVisible();
  await page
    .getByLabel("Seleccionar carpeta de música")
    .setInputFiles(path.resolve("public/audio"));
  await expect(page.locator(".device-track")).toHaveCount(3);
  await page
    .getByLabel("Seleccionar canciones locales")
    .setInputFiles({
      name: "No es audio.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.from("invalid audio"),
    });
  await expect(page.getByText("1 archivo no se pudo leer")).toBeVisible();
  await expect(page.locator(".device-track")).toHaveCount(3);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/device-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: false,
  });
});
