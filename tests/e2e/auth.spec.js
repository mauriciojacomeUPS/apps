import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Supabase auth contract switches independent local libraries; audio never uses Supabase storage", async ({
  page,
}) => {
  const calls = [];
  const users = {
    "one@example.test": { id: "11111111-1111-4111-8111-111111111111", email: "one@example.test" },
    "two@example.test": { id: "22222222-2222-4222-8222-222222222222", email: "two@example.test" },
  };
  let active;
  await page.route("https://onda-e2e.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    calls.push(url.pathname);
    if (url.pathname.endsWith("/token")) {
      active = users[request.postDataJSON().email];
      if (!active)
        return route.fulfill({
          status: 400,
          json: { error: "invalid_grant", error_description: "Invalid login credentials" },
        });
      const payload = Buffer.from(
        JSON.stringify({
          sub: active.id,
          email: active.email,
          role: "authenticated",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url");
      return route.fulfill({
        json: {
          access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.e2e_signature`,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "e2e_refresh",
          user: {
            ...active,
            aud: "authenticated",
            role: "authenticated",
            created_at: new Date().toISOString(),
          },
        },
      });
    }
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: active });
    return route.fulfill({
      status: 400,
      json: { message: "Unexpected Supabase request in auth-only test" },
    });
  });
  await page.goto("./");
  const login = async (email) => {
    await page.getByRole("button", { name: "Abrir perfil", exact: true }).click();
    await page.getByRole("button", { name: "Iniciar sesión o registrarte", exact: true }).click();
    await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("test-password-only");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Iniciar sesión", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  };
  await login("one@example.test");
  await page.getByRole("button", { name: "Archivos de este dispositivo", exact: true }).click();
  await page
    .getByLabel("Seleccionar canciones locales")
    .setInputFiles({
      name: "Solo usuario uno.mp3",
      mimeType: "audio/mpeg",
      buffer: await readFile("public/audio/sunset.mp3"),
    });
  await expect(page.locator(".device-track")).toHaveCount(1);
  await page.getByRole("button", { name: "Me gusta Sunset", exact: true }).click();
  await page.reload();
  await expect(page.locator(".device-track")).toHaveCount(1);
  await page.getByRole("button", { name: "Reproducir Sunset", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused && a.src.startsWith("blob:")))
    .toBeTruthy();
  const previousPlayer = await page.locator("audio").elementHandle();
  await page.getByRole("button", { name: "Abrir perfil", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.locator(".device-track")).toHaveCount(0);
  expect(await previousPlayer.evaluate((a) => a.paused)).toBeTruthy();
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBeTruthy();
  await login("two@example.test");
  await page.getByRole("button", { name: "Archivos de este dispositivo", exact: true }).click();
  await expect(page.locator(".device-track")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("onda-liked:22222222-2222-4222-8222-222222222222")),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Abrir perfil", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await login("one@example.test");
  await page.getByRole("button", { name: "Archivos de este dispositivo", exact: true }).click();
  await expect(page.locator(".device-track")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Quitar de me gusta Sunset", exact: true }),
  ).toBeVisible();
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((path) => path.startsWith("/auth/v1/"))).toBeTruthy();
});
