import { chromium } from "playwright";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";

const url = process.env.VIO_TEST_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const pass = (text) => {
  checks.push(text);
  console.log("PASS", text);
};
const email = `vio-${crypto.randomUUID()}@example.test`,
  password = crypto.randomBytes(24).toString("base64url");
let account, gid;
try {
  await page.goto(url, { waitUntil: "networkidle" });
  const health = await (
    await context.request.get(url + "/api/platform/status")
  ).json();
  assert.equal(health.player.version, "10.0.1");
  assert.equal(
    health.downloads.available,
    true,
    "A real aria2 daemon must be configured for this suite.",
  );
  assert.equal(
    health.library.configured,
    false,
    "This preview intentionally has no real Jellyfin server.",
  );
  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: "کتابخانه", exact: true })
    .click();
  await expect(page.locator(".connection-panel")).toBeVisible();
  assert.equal(await page.locator(".library-page .movie-card").count(), 0);
  await page.screenshot({ path: "screenshots/v2-library.png" });
  pass("Unconfigured Jellyfin is explicit, with no invented library titles");

  await page
    .getByRole("button", { name: "منوی حساب کاربری", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ورود / ساخت حساب", exact: true })
    .click();
  await page.getByRole("tab", { name: "ساخت حساب", exact: true }).click();
  await page.getByLabel("نام تو", { exact: true }).fill("نیما");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.screenshot({ path: "screenshots/v2-account.png" });
  const registered = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/register"),
  );
  await page
    .getByRole("button", { name: "ساخت حساب و شروع", exact: true })
    .click();
  const registration = await registered;
  assert.equal(registration.status(), 201);
  account = (await registration.json()).user;
  await page.locator(".account-modal").waitFor({ state: "detached" });
  await expect(page.locator(".avatar-initial")).toHaveText("ن");
  const cookie = (await context.cookies()).find(
    (c) => c.name === "vio_session",
  );
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Strict");
  pass("UI registration creates a real server account and HttpOnly session");

  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: "خانه", exact: true })
    .click();
  await page.locator(".movie-card").first().hover();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/account/watchlist") &&
      r.request().method() === "POST",
  );
  await page.locator(".movie-card .save-btn").first().click();
  assert.equal((await saved).status(), 200);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".avatar-initial")).toHaveText("ن");
  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: /فهرست من/ })
    .click();
  await expect(page.locator(".movie-card")).toHaveCount(1);
  pass("Account watchlist and session survive a full reload");

  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: "خانه", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تجربهٔ پخش آنلاین", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
  );
  await page.locator(".player-loading").waitFor({ state: "detached" });
  await page.locator("video").evaluate(async (video) => {
    video.muted = true;
    await video.play();
    video.currentTime = 15;
  });
  await page.waitForFunction(
    () => document.querySelector("video")?.currentTime > 15.1,
  );
  await page.locator("video").evaluate((video) => video.pause());
  await page
    .locator(".player-modal")
    .getByRole("button", { name: "تنظیمات", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /سرعت/ }).click();
  await page.getByRole("menuitemradio", { name: "1.5×", exact: true }).click();
  assert.equal(
    await page.locator("video").evaluate((v) => v.playbackRate),
    1.5,
  );
  await page
    .locator(".player-modal")
    .getByRole("button", { name: "تنظیمات", exact: true })
    .click();
  await page
    .locator(".player-modal")
    .getByRole("button", { name: "فعال‌سازی زیرنویس", exact: true })
    .click();
  await page.waitForFunction(() => {
    const track = document.querySelector("video")?.textTracks?.[0];
    return track?.mode === "showing" && track.cues?.length > 0;
  });
  assert.ok(
    await page
      .locator(".player-modal")
      .getByRole("button", { name: "تصویر در تصویر", exact: true })
      .isVisible(),
  );
  await page.screenshot({ path: "screenshots/v2-player.png" });
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.locator(".player-modal").waitFor({ state: "detached" });
  const progress = await (
    await context.request.get(url + "/api/account/progress")
  ).json();
  assert.ok(progress.progress.tt1727587.time >= 15);
  assert.equal(
    progress.movies.find((m) => m.imdb_code === "tt1727587").title,
    "Sintel",
  );
  assert.ok(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem("vio:progress:" + id)).tt1727587.time >=
        15,
      account.id,
    ),
  );
  pass(
    "Video.js plays licensed MP4, changes real speed, loads VTT and exposes PiP",
  );
  pass(
    "Playback position and movie identity are saved to the private server account",
  );

  await page
    .locator(".desktop-nav")
    .getByRole("button", { name: "دانلودها", exact: true })
    .click();
  await page
    .getByRole("button", { name: "دانلود نمونهٔ آزاد", exact: true })
    .click();
  await page.locator(".download-confirm").waitFor();
  await expect(
    page.getByRole("button", { name: "افزودن به صف شخصی", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("تأیید می‌کنم اجازهٔ دانلود این محتوا را دارم.", {
      exact: true,
    })
    .check();
  const queued = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/downloads") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "افزودن به صف شخصی", exact: true })
    .click();
  const queueResult = await queued;
  assert.equal(queueResult.status(), 201);
  gid = (await queueResult.json()).gid;
  await page.locator(".download-confirm").waitFor({ state: "detached" });
  await page.locator(".download-job.active").waitFor({ timeout: 15000 });
  pass(
    "Explicit consent queues the official CC BY Sintel trailer in a real aria2 daemon",
  );

  await page
    .getByRole("button", { name: "توقف سینتل · تریلر رسمی", exact: true })
    .click();
  await page.locator(".download-job.paused").waitFor({ timeout: 10000 });
  let jobs = await (await context.request.get(url + "/api/downloads")).json();
  assert.equal(jobs.downloads.find((j) => j.gid === gid).status, "paused");
  await page.screenshot({ path: "screenshots/v2-downloads-paused.png" });
  await page
    .getByRole("button", { name: "ادامه سینتل · تریلر رسمی", exact: true })
    .click();
  await page.locator(".download-job.active").waitFor({ timeout: 10000 });
  pass("Pause and resume change the real aria2 job state");

  await page.locator(".download-job.complete").waitFor({ timeout: 75000 });
  jobs = await (await context.request.get(url + "/api/downloads")).json();
  const job = jobs.downloads.find((j) => j.gid === gid);
  assert.equal(job.status, "complete");
  assert.ok(job.completed > 4000000);
  assert.equal(job.playable, true);
  await page.screenshot({ path: "screenshots/v2-downloads.png" });
  const stream = await context.request.get(
    `${url}/api/downloads/${gid}/media`,
    { headers: { Range: "bytes=0-127" } },
  );
  assert.equal(stream.status(), 206);
  assert.equal((await stream.body()).length, 128);
  pass(
    "Licensed download completes on disk and serves protected byte-range video",
  );
  await page
    .locator(".download-job.complete")
    .getByRole("button", { name: "پخش", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
  );
  assert.ok(
    (await page.locator("video").getAttribute("src")).includes(
      `/api/downloads/${gid}/media`,
    ),
  );
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.locator(".player-modal").waitFor({ state: "detached" });
  pass(
    "A completed aria2 file plays through the actual authenticated media endpoint",
  );

  const other = await browser.newContext();
  assert.equal(
    (await other.request.get(`${url}/api/downloads/${gid}/media`)).status(),
    401,
  );
  const secondEmail = `other-${crypto.randomUUID()}@example.test`;
  const newAccount = await other.request.post(url + "/api/auth/register", {
    data: { name: "کاربر دوم", email: secondEmail, password },
  });
  assert.equal(newAccount.status(), 201);
  assert.equal(
    (await other.request.get(`${url}/api/downloads/${gid}/media`)).status(),
    404,
  );
  assert.equal(
    (await (await other.request.get(url + "/api/account/watchlist")).json())
      .movies.length,
    0,
  );
  await other.close();
  pass(
    "Another account cannot read the first user’s queue, watchlist or media",
  );

  const mobile = await context.newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(url, { waitUntil: "networkidle" });
  await mobile
    .locator(".mobile-nav")
    .getByRole("button", { name: "دانلودها", exact: true })
    .click();
  await mobile.locator(".download-job.complete").waitFor();
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await mobile.screenshot({
    path: "screenshots/v2-downloads-mobile.png",
    fullPage: true,
  });
  await mobile
    .locator(".mobile-nav")
    .getByRole("button", { name: "کتابخانه", exact: true })
    .click();
  await mobile.locator(".connection-panel").waitFor();
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await mobile.screenshot({
    path: "screenshots/v2-library-mobile.png",
    fullPage: true,
  });
  await mobile.setViewportSize({ width: 320, height: 740 });
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await mobile.close();
  pass("Six-item mobile navigation and new pages fit 390px and 320px widths");

  for (const path of [
    "/.data/vio.sqlite",
    "/.env",
    "/@fs/home/user/vio-stream/.data/vio.sqlite",
  ]) {
    const res = await context.request.get(url + path);
    assert.ok(
      [403, 404].includes(res.status()),
      `Private path ${path} must not be served`,
    );
  }
  pass("Development server refuses direct access to database and secrets");
  await page
    .getByRole("button", { name: "منوی حساب کاربری", exact: true })
    .click();
  await page.getByRole("button", { name: "خروج از حساب", exact: true }).click();
  await page.locator(".avatar-initial").waitFor({ state: "detached" });
  assert.equal(
    (await context.request.get(url + "/api/account/watchlist")).status(),
    401,
  );
  pass("Logout revokes the real server session");
  assert.deepEqual(errors, []);
  pass(
    "No JavaScript page errors in desktop, player, account and mobile flows",
  );
  await fs.writeFile(
    "tests/platform-verification.json",
    JSON.stringify(
      {
        passed: true,
        date: new Date().toISOString(),
        checks,
        pageErrors: errors,
        integrations: {
          aria2: "real daemon + actual licensed HTTPS file",
          jellyfin:
            "unconfigured in live preview; API contract tested separately",
          docker: "configuration prepared; daemon not available in sandbox",
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  await page
    .screenshot({ path: "screenshots/v2-platform-failure.png", fullPage: true })
    .catch(() => {});
  await fs.writeFile(
    "tests/platform-verification.json",
    JSON.stringify(
      { passed: false, checks, pageErrors: errors, error: String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
