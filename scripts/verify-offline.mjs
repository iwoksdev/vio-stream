import { chromium } from "playwright";
import { expect } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const html = await fs.readFile(
  process.env.VIO_HTML || "VIO-preview.html",
  "utf8",
);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  reducedMotion: "reduce",
});
const page = await context.newPage(),
  errors = [],
  requests = [],
  checks = [];
page.setDefaultTimeout(12000);
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) => {
  requests.push(route.request().url());
  return route.abort();
});
const pass = (text) => {
  checks.push(text);
  console.log("PASS", text);
};
try {
  await page.setContent(
    '<!doctype html><html><body style="margin:0"><iframe id="vio" sandbox="allow-scripts" style="border:0;width:100vw;height:100vh"></iframe></body></html>',
  );
  await page.evaluate(
    (content) => (document.querySelector("iframe").srcdoc = content),
    html,
  );
  const frame = page.frameLocator("#vio");
  await expect(frame.locator(".movie-card")).toHaveCount(6, { timeout: 20000 });
  assert.equal(await frame.locator("html").getAttribute("dir"), "rtl");
  assert.equal(
    await frame
      .locator("html")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(0, 0, 0)",
  );
  await expect
    .poll(() =>
      frame
        .locator(".movie-card img")
        .first()
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  pass(
    "Opaque, network-disabled iframe renders iOS Dark, Persian RTL and embedded artwork",
  );
  await frame.locator(".movie-card").first().hover();
  await frame.locator(".movie-card .save-btn").first().click();
  await frame
    .locator(".desktop-nav")
    .getByRole("button", { name: /فهرست من/ })
    .click();
  await expect(frame.locator(".movie-card")).toHaveCount(1);
  pass(
    "Guest watchlist works with sandbox-denied storage via in-memory fallback",
  );
  await frame
    .locator(".desktop-nav")
    .getByRole("button", { name: "خانه", exact: true })
    .click();
  await frame
    .getByRole("button", { name: "تجربهٔ پخش آنلاین", exact: true })
    .click();
  await expect
    .poll(() => frame.locator("video").evaluate((v) => v.readyState), {
      timeout: 20000,
    })
    .toBeGreaterThanOrEqual(2);
  await frame.locator(".player-loading").waitFor({ state: "detached" });
  await frame.locator("video").evaluate(async (video) => {
    video.muted = true;
    await video.play();
    video.currentTime = 16;
  });
  await frame.locator("video").evaluate((v) => v.pause());
  await frame.locator(".vio-video-skin").hover();
  await frame
    .locator(".player-modal")
    .getByRole("button", { name: "فعال‌سازی زیرنویس", exact: true })
    .focus();
  await frame
    .locator(".player-modal")
    .getByRole("button", { name: "فعال‌سازی زیرنویس", exact: true })
    .click();
  await expect
    .poll(() =>
      frame
        .locator("video")
        .evaluate((v) => v.textTracks[0]?.cues?.length || 0),
    )
    .toBeGreaterThan(0);
  await frame.locator("video").evaluate(async (v) => {
    v.currentTime = 16;
    await v.play();
  });
  await expect
    .poll(() =>
      frame
        .locator("video")
        .evaluate((v) => v.textTracks[0]?.activeCues?.length || 0),
    )
    .toBeGreaterThan(0);
  await frame.locator("video").evaluate((v) => v.pause());
  assert.ok(
    await frame
      .locator("video")
      .evaluate(
        (v) =>
          v.duration > 52 &&
          v.duration < 53 &&
          v.src.startsWith("data:video/mp4"),
      ),
  );
  await page.screenshot({ path: "screenshots/v2-offline-player.png" });
  pass(
    "Embedded MP4 and actual VTT active cues work without network, imports or backend",
  );
  await frame.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await frame
    .locator(".desktop-nav")
    .getByRole("button", { name: "کتابخانه", exact: true })
    .click();
  await expect(frame.locator(".connection-panel")).toBeVisible();
  assert.equal(await frame.locator(".library-page .movie-card").count(), 0);
  await frame
    .locator(".desktop-nav")
    .getByRole("button", { name: "دانلودها", exact: true })
    .click();
  await expect(
    frame.locator(".downloads-page .connection-panel"),
  ).toBeVisible();
  assert.equal(await frame.locator(".download-job").count(), 0);
  await frame
    .getByRole("button", { name: "منوی حساب کاربری", exact: true })
    .click();
  await frame
    .getByRole("button", { name: "ورود / ساخت حساب", exact: true })
    .click();
  await expect(
    frame.locator(".account-modal .integration-notice"),
  ).toBeVisible();
  assert.equal(await frame.locator(".account-modal form").count(), 0);
  pass(
    "HTML explicitly requires backend for account, library and queue; no fabricated features",
  );
  const iframe = page.frames().find((f) => f !== page.mainFrame());
  const unavailable = await iframe.evaluate(async () => {
    const r = await fetch("/api/downloads", { method: "POST" });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.code, "BACKEND_REQUIRED");
  await frame.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await frame
    .locator(".mobile-nav")
    .getByRole("button", { name: "خانه", exact: true })
    .click();
  assert.equal(
    await iframe.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: "screenshots/v2-offline-mobile.png" });
  pass("Offline mobile layout has no horizontal overflow");
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  pass("No JavaScript errors and zero attempted network requests");
  await fs.writeFile(
    "tests/offline-verification.json",
    JSON.stringify(
      {
        passed: true,
        date: new Date().toISOString(),
        checks,
        pageErrors: errors,
        networkRequests: requests,
        sandbox: "allow-scripts only; opaque origin",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  await page
    .screenshot({ path: "screenshots/v2-offline-failure.png" })
    .catch(() => {});
  await fs.writeFile(
    "tests/offline-verification.json",
    JSON.stringify(
      {
        passed: false,
        checks,
        pageErrors: errors,
        networkRequests: requests,
        error: String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
