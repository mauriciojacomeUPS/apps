import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function home(page, isMobile) {
  await (
    isMobile
      ? page.locator(".mobile-nav").getByRole("button", { name: "Inicio", exact: true })
      : page.getByRole("button", { name: "Inicio", exact: true })
  ).click();
}

test("guest dashboard presents local options and sign-in without an invented profile or notifications", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Encuentra tu onda.", exact: true }),
  ).toBeVisible();
  const header = page.locator(".topbar");
  await expect(header.getByRole("button", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await expect(page.locator(".avatar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novedades", exact: true })).toHaveCount(0);
  await header.getByRole("button", { name: "Opciones de Onda", exact: true }).click();
  await expect(page.getByText("Tu espacio local", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mi biblioteca", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Usar sin conexión|Instalar Onda)$/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Tu espacio local", { exact: true })).toHaveCount(0);
  await header.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tu música ya tiene un lugar.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar acceso", exact: true }).click();
  await page
    .locator(".home-page")
    .getByRole("button", { name: "Añadir mi música", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "En este dispositivo.", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#device");
  expect(errors).toEqual([]);
});

test("home filters separate the device library from demos and expose imported music", async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const filters = page.locator(".filter-chips");
  await filters.getByRole("button", { name: "Mi música", exact: true }).click();
  await expect(filters.getByRole("button", { name: "Mi música", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".home-page .hero")).toHaveCount(0);
  await expect(page.locator(".home-page .playlist-card")).toHaveCount(0);
  await page
    .locator(".home-page")
    .getByRole("button", { name: "Añadir mi música", exact: true })
    .first()
    .click();
  await page.getByLabel("Seleccionar canciones locales").setInputFiles({
    name: "Mi canción.mp3",
    mimeType: "audio/mpeg",
    buffer: await readFile("public/audio/sunset.mp3"),
  });
  await expect(page.locator(".device-track")).toHaveCount(1);
  await home(page, isMobile);
  await filters.getByRole("button", { name: "Mi música", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recién añadidas", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Escuchar archivo Sunset", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-page .hero")).toHaveCount(0);
  await filters.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(filters.getByRole("button", { name: "Demo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".home-page .hero")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recién añadidas", exact: true })).toHaveCount(0);
  await filters.getByRole("button", { name: "Todo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Escuchar archivo Sunset", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: `test-results/dashboard-${isMobile ? "mobile" : "desktop"}.png` });
  expect(errors).toEqual([]);
});

test("sidebar sorting changes playlist order and clearing its search restores the collection", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The persistent sidebar is a desktop control.");
  await page.goto("./#library");
  for (const title of ["Amanecer", "Zeta nocturna"]) {
    await page.goto("./#library");
    await page
      .locator(".library-page")
      .getByRole("button", { name: "Crear playlist", exact: true })
      .click();
    await page.getByLabel("Nombre de tu playlist").fill(title);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Crear playlist", exact: true })
      .click();
  }
  const sidebar = page.locator(".library-sidebar");
  const titles = sidebar.locator(".library-items .library-item strong");
  const sort = sidebar.getByRole("combobox", { name: "Ordenar biblioteca", exact: true });
  await sort.selectOption("recent");
  await expect(titles).toContainText(["Zeta nocturna", "Amanecer"]);
  await sort.selectOption("title");
  await expect(titles).toContainText(["Amanecer", "Zeta nocturna"]);
  await sidebar.getByRole("button", { name: "Buscar en tu biblioteca", exact: true }).click();
  await sidebar
    .getByRole("textbox", { name: "Buscar en tu biblioteca", exact: true })
    .fill("amanecer");
  await expect(titles).toContainText(["Amanecer"]);
  await expect(sidebar.locator(".library-item").filter({ hasText: "Zeta nocturna" })).toHaveCount(
    0,
  );
  await sidebar
    .getByRole("button", { name: "Limpiar búsqueda de biblioteca", exact: true })
    .click();
  await expect(
    sidebar.getByRole("textbox", { name: "Buscar en tu biblioteca", exact: true }),
  ).toHaveValue("");
  await expect(titles).toContainText(["Amanecer", "Zeta nocturna"]);
});
