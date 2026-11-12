import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";

async function library(page, mobile) {
  await (
    mobile
      ? page.locator(".mobile-nav").getByRole("button", { name: "Biblioteca", exact: true })
      : page.getByRole("button", { name: "Tu biblioteca", exact: true })
  ).click();
}
async function edit(page, title, artist, album, year, genre) {
  await page.getByRole("button", { name: `Opciones locales de ${title}`, exact: true }).click();
  await page.getByRole("button", { name: "Editar detalles", exact: true }).click();
  await page.getByLabel("Artista", { exact: true }).fill(artist);
  await page.getByLabel("Artista del álbum", { exact: true }).fill(artist);
  await page.getByLabel("Álbum", { exact: true }).fill(album);
  await page.getByLabel("Año", { exact: true }).fill(String(year));
  await page.getByLabel("Géneros (separados por comas)", { exact: true }).fill(genre);
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
}

test("albums and artists use local metadata, preserve deep links and drive search facets and playback", async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./#device");
  await page
    .getByLabel("Seleccionar carpeta de música")
    .setInputFiles(path.resolve("public/audio"));
  await expect(page.locator(".device-track")).toHaveCount(3);
  // These files contain original ID3 titles. Edit only the additional catalog tags.
  const titles = await page.locator(".device-track .track-info strong").allTextContents();
  await edit(page, titles[0], "Banda Uno", "Horizonte", 2025, "Indie");
  await edit(page, titles[1], "Banda Uno", "Horizonte", 2025, "Indie");
  await edit(page, titles[2], "Banda Dos", "Horizonte", 2024, "Rock");
  await library(page, isMobile);
  await page.locator(".library-tabs").getByRole("button", { name: "Álbumes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tus álbumes.", exact: true })).toBeVisible();
  await expect(page.locator(".catalog-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Abrir álbum Horizonte de Banda Uno", exact: true })
    .click();
  await expect(page.locator(".collection-track-section .track-row")).toHaveCount(2);
  expect(new URL(page.url()).hash).toMatch(/^#album\//);
  await page.reload();
  await expect(page.locator(".collection-track-section .track-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Reproducir álbum", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.src.startsWith("blob:") && !a.paused))
    .toBeTruthy();
  await page
    .locator(".collection-tabs")
    .getByRole("button", { name: "Artistas", exact: true })
    .click();
  await page.getByRole("button", { name: "Abrir artista Banda Dos", exact: true }).click();
  await expect(page.locator(".collection-track-section .track-row")).toHaveCount(1);
  if (isMobile)
    await page.locator(".mobile-nav").getByRole("button", { name: "Buscar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Buscar canciones, artistas o playlists" })
    .fill("Horizonte");
  // The sample album “Sin horizonte” also matches the free-text query.
  await expect(page.locator(".search-page .track-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByLabel("Filtrar por artista", { exact: true }).selectOption("Banda Dos");
  await page.getByLabel("Filtrar por año", { exact: true }).selectOption("2024");
  await page.getByLabel("Filtrar por género", { exact: true }).selectOption("Rock");
  await expect(page.locator(".search-page .track-row")).toHaveCount(1);
  await expect(page.locator(".search-page .track-info strong")).toHaveText(titles[2]);
  await page
    .getByRole("group", { name: "Tipo de resultado" })
    .getByRole("button", { name: /^Álbumes/ })
    .click();
  await expect(page.locator(".search-collection")).toHaveCount(1);
  await expect(page.locator(".search-page .track-row")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: `test-results/discovery-${isMobile ? "mobile" : "desktop"}.png` });
  expect(errors).toEqual([]);
});

test("playlist descriptions, custom artwork and JSON/M3U exports survive reload and reimport", async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./#library");
  await page
    .locator(".library-page")
    .getByRole("button", { name: "Crear playlist", exact: true })
    .click();
  await page.getByLabel("Nombre de tu playlist").fill("Mi viaje");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear playlist", exact: true })
    .click();
  const rec = page.locator(".recommendations .track-row").filter({ hasText: "Golden Hour" });
  await rec.hover();
  await rec.getByRole("button", { name: "Opciones de Golden Hour", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mi viaje", exact: true }).click();
  await page.getByRole("button", { name: "Opciones de playlist", exact: true }).click();
  await page.getByRole("button", { name: "Renombrar playlist", exact: true }).click();
  const description = page.getByLabel("Descripción", { exact: true });
  await description.fill("");
  await description.pressSequentially("Para perderse junto al mar.");
  await expect(description).toBeFocused();
  await page.getByLabel("Seleccionar portada de playlist").setInputFiles({
    name: "coast.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile("public/images/coast.jpg"),
  });
  await expect(page.getByRole("dialog").getByAltText("Portada de la playlist")).toHaveAttribute(
    "src",
    /^data:image\/webp/,
  );
  await page.getByRole("button", { name: "Guardar nombre", exact: true }).click();
  await page.reload();
  await expect(page.locator(".playlist-hero p")).toHaveText("Para perderse junto al mar.");
  await expect(page.locator(".playlist-hero .cover-art>img")).toHaveAttribute(
    "src",
    /^data:image\/webp/,
  );
  let exported;
  for (const format of ["JSON", "M3U"]) {
    await page.getByRole("button", { name: "Opciones de playlist", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: `Exportar ${format}`, exact: true }).click();
    const result = await download;
    expect(result.suggestedFilename()).toBe(`Mi viaje.${format.toLowerCase()}`);
    if (format === "JSON") exported = await readFile(await result.path());
  }
  expect(JSON.parse(exported).tracks.map((t) => t.id)).toEqual(["golden"]);
  await library(page, isMobile);
  await page
    .getByLabel("Importar archivo de playlist")
    .setInputFiles({ name: "Mi viaje.json", mimeType: "application/json", buffer: exported });
  await expect(page.getByRole("dialog").getByText("Canciones encontradas")).toBeVisible();
  await page.getByRole("button", { name: "Importar playlist", exact: true }).click();
  await expect(page.locator(".playlist-content>.track-table .track-info strong")).toHaveText([
    "Golden Hour",
  ]);
  await expect(page.locator(".playlist-hero p")).toHaveText("Para perderse junto al mar.");
  expect(errors).toEqual([]);
});
