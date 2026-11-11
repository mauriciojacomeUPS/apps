import { test, expect } from "@playwright/test";
async function library(page, isMobile) {
  await (
    isMobile
      ? page.locator(".mobile-nav").getByRole("button", { name: "Biblioteca", exact: true })
      : page.getByRole("button", { name: "Tu biblioteca", exact: true })
  ).click();
}
async function queue(page, isMobile) {
  await page
    .getByRole("button", {
      name: isMobile ? "Ver canción actual" : "Cola de reproducción",
      exact: true,
    })
    .click();
  await expect(page.getByRole("heading", { name: "A continuación", exact: true })).toBeVisible();
}
async function trackOptions(page, title, scope = page) {
  const row = scope
    .locator(".track-row")
    .filter({ has: page.locator(".track-info strong", { hasText: title }) });
  await row.hover();
  await row.getByRole("button", { name: `Opciones de ${title}`, exact: true }).click();
}

test("personal playlists rename, reorder, remove songs, duplicate and delete independently", async ({
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
  await page.getByLabel("Nombre de tu playlist").fill("Mi lista REA");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear playlist", exact: true })
    .click();
  for (const title of ["Golden Hour", "Midnight in the City"]) {
    await trackOptions(page, title, page.locator(".recommendations"));
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Mi lista REA", exact: true })
      .click();
  }
  const rows = page.locator(".playlist-content > .track-table .track-info strong");
  await expect(rows).toHaveText(["Golden Hour", "Midnight in the City"]);
  await page
    .getByRole("button", { name: "Subir Midnight in the City en la playlist", exact: true })
    .click();
  await expect(rows).toHaveText(["Midnight in the City", "Golden Hour"]);
  await page.getByRole("button", { name: "Opciones de playlist", exact: true }).click();
  await page.getByRole("button", { name: "Renombrar playlist", exact: true }).click();
  await page.getByLabel("Nombre de la playlist", { exact: true }).fill("Concentración");
  await page.getByRole("button", { name: "Guardar nombre", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Concentración", exact: true })).toBeVisible();
  await page.reload();
  await expect(rows).toHaveText(["Midnight in the City", "Golden Hour"]);
  await trackOptions(
    page,
    "Midnight in the City",
    page.locator(".playlist-content > .track-table"),
  );
  await page.getByRole("button", { name: "Quitar de esta playlist", exact: true }).click();
  await expect(rows).toHaveText(["Golden Hour"]);
  await expect(
    page.locator(".recommendations .track-row").filter({ hasText: "Midnight in the City" }),
  ).toHaveCount(1);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Compartir playlist", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).pathname).toBe("/apps/");
  expect(new URL(copied).hash).toBe(new URL(page.url()).hash);
  await page.getByRole("button", { name: "Opciones de playlist", exact: true }).click();
  await page.getByRole("button", { name: "Crear una copia", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Concentración (copia)", exact: true }),
  ).toBeVisible();
  await expect(rows).toHaveText(["Golden Hour"]);
  await page.getByRole("button", { name: "Opciones de playlist", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar playlist", exact: true }).click();
  await page.getByRole("button", { name: "Conservar playlist", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Concentración (copia)", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Opciones de playlist", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar playlist", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Eliminar playlist", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Tu biblioteca.", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir Concentración (copia)", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir Concentración", exact: true }).click();
  await expect(rows).toHaveText(["Golden Hour"]);
  expect(errors).toEqual([]);
});

test("queue edits and duplicate entries keep the current song; clearing confirms and stops naturally at the end", async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.locator(".main-play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0.1))
    .toBeTruthy();
  await queue(page, isMobile);
  const entries = page.locator(".queue-entry .queue-item strong");
  await expect(entries).toHaveCount(5);
  await page
    .getByRole("button", { name: "Bajar Midnight in the City en la cola", exact: true })
    .click();
  await expect(entries.nth(0)).toHaveText("Bloom");
  await page
    .getByRole("button", { name: "Quitar Midnight in the City de la cola", exact: true })
    .click();
  await expect(entries).toHaveCount(4);
  await expect(page.locator(".now-playing strong")).toHaveText("Golden Hour");
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBe(false);
  await page.getByRole("button", { name: "Cerrar cola", exact: true }).click();
  if (isMobile)
    await page.locator(".mobile-nav").getByRole("button", { name: "Buscar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Buscar canciones, artistas o playlists" })
    .fill("Golden Hour");
  await trackOptions(page, "Golden Hour");
  await page.getByRole("button", { name: "Añadir a la cola", exact: true }).click();
  await queue(page, isMobile);
  await expect(entries).toHaveCount(5);
  await expect(entries.last()).toHaveText("Golden Hour");
  await page.locator("audio").evaluate((a) => {
    a.currentTime = 20;
  });
  await page
    .getByRole("button", { name: "Reproducir Golden Hour desde la cola", exact: true })
    .click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused && a.currentTime < 3))
    .toBeTruthy();
  await expect(entries).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar cola", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar canciones, artistas o playlists" }).fill("Bloom");
  await trackOptions(page, "Bloom");
  await page.getByRole("button", { name: "Añadir a la cola", exact: true }).click();
  await queue(page, isMobile);
  await expect(entries).toHaveCount(1);
  await page.getByRole("button", { name: "Vaciar cola", exact: true }).click();
  await page.getByRole("button", { name: "Conservar cola", exact: true }).click();
  await expect(entries).toHaveCount(1);
  await page.getByRole("button", { name: "Vaciar cola", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Vaciar cola", exact: true }).click();
  await expect(entries).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Siguiente canción", exact: true })).toBeDisabled();
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBe(false);
  await page.locator("audio").evaluate((a) => {
    a.currentTime = a.duration - 0.15;
  });
  await expect.poll(() => page.locator("audio").evaluate((a) => a.ended && a.paused)).toBeTruthy();
  await expect(page.locator(".main-play")).toHaveAttribute("aria-label", "Reproducir");
  expect(errors).toEqual([]);
});
