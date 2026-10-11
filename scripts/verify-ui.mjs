import { chromium } from "playwright";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors = [];
const checks = [];
page.on("pageerror", (e) => errors.push(e.message));
function passed(text) {
  checks.push(text);
  console.log("PASS", text);
}
try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.locator(".movie-card").first().waitFor();
  assert.equal(await page.locator(".movie-card").count(), 6);
  passed("Home shows six selected films");
  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: "کشف فیلم‌ها", exact: true })
    .click();
  assert.equal(await page.locator(".movie-card").count(), 12);
  await page
    .getByRole("button", { name: "فیلم‌های بیشتر", exact: true })
    .click();
  assert.equal(await page.locator(".movie-card").count(), 15);
  passed("Browse and load-more show all 15 cached films");
  await page.getByRole("textbox", { name: "جست‌وجوی فیلم" }).fill("میان");
  await page.locator(".search-result").first().click();
  await page.getByRole("dialog").waitFor();
  assert.ok(
    (await page.locator("#detail-title").textContent()).includes(
      "میان‌ستاره‌ای",
    ),
  );
  passed("Persian search opens the correct film");
  await page.getByRole("tab", { name: /دانلود/ }).click();
  assert.ok(
    (
      await page.locator(".torrent-actions a").first().getAttribute("href")
    ).startsWith("magnet:?"),
  );
  await page.locator(".torrent-actions button").first().click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clipboard, /magnet:\?xt=urn%3Abtih%3A[A-F\d]{40}/);
  passed("Download qualities and verified magnet copying work");
  await page.getByRole("tab", { name: "پخش آنلاین", exact: true }).click();
  await page.locator(".stream-notice").waitFor();
  assert.ok(
    (await page.locator(".stream-notice").textContent()).includes(
      "منبع مستقیم",
    ),
  );
  await page.locator("#stream-url").fill("https://example.com/my-film.m3u8");
  await page.getByRole("button", { name: "ذخیره منبع", exact: true }).click();
  await page.locator(".source-ready").waitFor();
  assert.ok(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("vio:sources")).tt0816692.type ===
        "hls",
    ),
  );
  passed(
    "Streaming clearly distinguishes unavailable sources and saves custom HLS URLs",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.notEqual(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
  );
  passed("Escape closes dialogs and restores scrolling");
  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: "خانه", exact: true })
    .click();
  await page.locator(".movie-card").first().hover();
  await page.locator(".movie-card .save-btn").first().click();
  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: /فهرست من/ })
    .click();
  await expect(page.locator(".movie-card")).toHaveCount(1);
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: /فهرست من/ })
    .click();
  await expect(page.locator(".movie-card")).toHaveCount(1);
  passed("Watchlist persists across reloads");
  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: "خانه", exact: true })
    .click();
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await page.getByLabel("سال انتشار").selectOption("2024");
  await page.getByLabel("کیفیت تصویر").selectOption("2160p");
  await page.getByRole("button", { name: "دیدن فیلم‌ها", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  const titles = await page.locator(".card-title").allTextContents();
  assert.ok(titles.length > 0);
  assert.equal(await page.locator(".active-filters>span").count(), 2);
  passed("Advanced quality and year filters apply together");
  await page.getByRole("button", { name: "حذف فیلترها", exact: true }).click();
  await page
    .getByRole("button", { name: "تجربهٔ پخش آنلاین", exact: true })
    .click();
  await page.locator("video").waitFor();
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
  );
  const duration = await page.locator("video").evaluate((v) => v.duration);
  await page.locator("video").evaluate(async (v) => {
    v.currentTime = 15;
    await v.play();
  });
  await page.waitForFunction(
    () => document.querySelector("video")?.currentTime > 15.2,
  );
  await page.locator("video").evaluate((v) => v.pause());
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.locator(".continue-card").first().waitFor();
  await page.locator(".continue-card").first().click();
  await page.waitForFunction(
    () => document.querySelector("video")?.currentTime > 14,
  );
  await page.screenshot({ path: "screenshots/player.png" });
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  passed(
    `Local licensed sample plays and resumes (duration ${duration.toFixed(1)}s)`,
  );
  await page.getByRole("textbox", { name: "جست‌وجوی فیلم" }).fill("Dune");
  await page
    .getByRole("button", { name: "جست‌وجو در آرشیو زندهٔ YTS", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".catalog-status")
      ?.textContent.includes("آرشیو زنده"),
  );
  assert.ok((await page.locator(".movie-card").count()) > 0);
  passed("Live YTS search works through same-origin API");
  await page.goto("http://127.0.0.1:5173/?film=tt1877830", {
    waitUntil: "networkidle",
  });
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator("#detail-title").textContent(), "بتمن");
  passed("Shareable film deep links resolve");
  await page.getByRole("tab", { name: /دانلود/ }).click();
  await page.screenshot({ path: "screenshots/downloads.png" });
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await mobile
    .locator(".mobile-nav")
    .getByRole("button", { name: "کشف فیلم‌ها", exact: true })
    .click();
  await mobile
    .getByRole("button", { name: "نمایش جست‌وجو", exact: true })
    .click();
  await mobile.getByRole("textbox", { name: "جست‌وجوی فیلم" }).fill("بتمن");
  await mobile.locator(".search-result").first().click();
  await mobile.getByRole("dialog").waitFor();
  assert.equal(await mobile.locator("#detail-title").textContent(), "بتمن");
  const dims = await mobile.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.equal(dims.client, dims.scroll);
  await mobile.screenshot({ path: "screenshots/mobile-details.png" });
  passed("Mobile navigation, search, dialog layout and overflow checks pass");
  assert.deepEqual(errors, []);
  passed("No JavaScript page errors");
  await fs.writeFile(
    "tests/verification.json",
    JSON.stringify({ status: "passed", checks, pageErrors: errors }, null, 2),
  );
} catch (e) {
  console.error("FAILED", e);
  await page.screenshot({
    path: "screenshots/test-failure.png",
    fullPage: true,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
}
