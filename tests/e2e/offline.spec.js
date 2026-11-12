import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("production PWA reopens offline and resumes local audio paused at the saved position", async ({
  page,
  context,
  isMobile,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.mediaActions = {};
    const session = navigator.mediaSession;
    if (session) {
      const original = session.setActionHandler.bind(session);
      session.setActionHandler = (action, handler) => {
        window.mediaActions[action] = handler;
        original(action, handler);
      };
    }
  });
  await page.goto("./#device");
  await page.getByLabel("Seleccionar canciones locales").setInputFiles({
    name: "Sunset.mp3",
    mimeType: "audio/mpeg",
    buffer: await readFile("public/audio/sunset.mp3"),
  });
  await expect(page.locator(".device-track")).toHaveCount(1);
  await page.getByRole("button", { name: "Reproducir Sunset", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0))
    .toBeTruthy();
  await page.evaluate(() => {
    window.mediaActions.seekto({ seekTime: 18 });
    window.mediaActions.pause();
    const slider = document.querySelector('input[aria-label="Volumen"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(slider, "0.31");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("onda-player:guest"))?.position),
    )
    .toBeGreaterThanOrEqual(18);
  await expect.poll(() => page.locator("audio").evaluate((a) => a.volume)).toBeCloseTo(0.31, 2);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  const manifest = await page.evaluate(async () => {
    const url = document.querySelector('link[rel="manifest"]').href;
    return { url, ...(await (await fetch(url)).json()) };
  });
  expect(new URL(manifest.url).pathname).toBe("/apps/manifest.webmanifest");
  expect(manifest.display).toBe("standalone");
  const cdp = await context.newCDPSession(page);
  const installedManifest = await cdp.send("Page.getAppManifest");
  expect(installedManifest.errors).toEqual([]);
  expect(new URL(installedManifest.manifest.id).pathname).toBe("/apps/");
  expect(new URL(installedManifest.manifest.scope).pathname).toBe("/apps/");
  await cdp.detach();
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names)
      for (const key of await (await caches.open(name)).keys()) urls.push(key.url);
    return urls;
  });
  expect(cached.some((url) => url.includes("/apps/index.html"))).toBeTruthy();
  expect(cached.some((url) => /supabase|__onda-media|blob:/.test(url))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("Sin conexión · Escucha la música guardada en este navegador.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".device-track")).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate(
          (a) => a.readyState >= 1 && a.paused && a.currentTime >= 18 && a.currentTime < 19,
        ),
    )
    .toBeTruthy();
  expect(await page.locator("audio").evaluate((a) => a.src.startsWith("blob:"))).toBeTruthy();
  await expect.poll(() => page.locator("audio").evaluate((a) => a.volume)).toBeCloseTo(0.31, 2);
  await page.locator(".main-play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 18.1))
    .toBeTruthy();
  expect(await page.evaluate(() => navigator.mediaSession.metadata.title)).toBe("Sunset");
  await page.evaluate(() => window.mediaActions.pause());
  await (
    isMobile
      ? page.locator(".mobile-nav").getByRole("button", { name: "Inicio", exact: true })
      : page.getByRole("button", { name: "Inicio", exact: true })
  ).click();
  await expect(
    page.getByRole("heading", { name: "Continúa donde lo dejaste", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Volver a escuchar Sunset", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `test-results/offline-${isMobile ? "mobile" : "desktop"}.png` });
  expect(errors).toEqual([]);
});
