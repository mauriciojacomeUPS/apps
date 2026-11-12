import { test, expect } from "@playwright/test";

test("duplicate queue entries and playback preferences restore without autoplay, including a shared demo audio URL", async ({
  page,
  isMobile,
}) => {
  await page.goto("./");
  await page.locator(".main-play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0))
    .toBeTruthy();
  if (isMobile)
    await page.locator(".mobile-nav").getByRole("button", { name: "Buscar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Buscar canciones, artistas o playlists" })
    .fill("Golden Hour");
  const row = page.locator(".search-page .track-row");
  await row.hover();
  await row.getByRole("button", { name: "Opciones de Golden Hour", exact: true }).click();
  await page.getByRole("button", { name: "Añadir a la cola", exact: true }).click();
  // Preference buttons are visible on desktop; the saved queue is shared by both layouts.
  if (!isMobile) {
    await page.getByRole("button", { name: "Aleatorio", exact: true }).click();
    await page.getByRole("button", { name: "Repetir canción", exact: true }).click();
  }
  await page.locator("audio").evaluate((a) => {
    a.currentTime = 16;
  });
  await expect.poll(() => page.locator("audio").evaluate((a) => a.currentTime >= 16)).toBeTruthy();
  await page.locator(".main-play").click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("onda-player:guest")));
  expect(before.queue.filter((item) => item.trackId === "golden")).toHaveLength(2);
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate(
          (a) => a.readyState >= 1 && a.paused && a.currentTime >= 16 && a.currentTime < 18,
        ),
    )
    .toBeTruthy();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("onda-player:guest")));
  expect(after.queue).toEqual(before.queue);
  expect(after.current).toEqual(before.current);
  expect(after.shuffle).toBe(before.shuffle);
  expect(after.repeat).toBe(before.repeat);
  expect(JSON.stringify(after)).not.toContain("blob:");
  await page.locator(".main-play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 16.1))
    .toBeTruthy();
});
