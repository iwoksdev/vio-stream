import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { mountPlatform } from "../server/platform.mjs";
import {
  hashPassword,
  verifyPassword,
  sanitizeMovie,
} from "../server/store.mjs";
import { approvedDownload, createServices } from "../server/services.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
let tmp, api, provider, base, platform, userA, userB;
const password = "test-password-only-2026";
const directId = crypto.randomBytes(16).toString("hex"),
  hlsId = crypto.randomBytes(16).toString("hex"),
  mediaId = crypto.randomBytes(16).toString("hex");
const key = crypto.randomBytes(24).toString("hex");
const jobs = new Map();
const movie = {
  id: -1,
  imdb_code: "tt1727587",
  title: "Sintel",
  year: 2010,
  rating: 7.4,
  runtime: 1,
  genres: ["Animation"],
  torrents: [],
  poster: "/images/sintel.webp",
};
function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}
async function request(
  route,
  { cookie, body, method = "GET", headers = {} } = {},
) {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { res, data: await res.json().catch(() => null) };
}
async function register(name) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: {
      name,
      email: `${name}-${crypto.randomUUID()}@example.test`,
      password,
    },
  });
  assert.equal(result.res.status, 201);
  return {
    ...result.data.user,
    cookie: result.res.headers.get("set-cookie").split(";")[0],
    header: result.res.headers.get("set-cookie"),
  };
}

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, ".arena/platform-tests-"));
  process.env.DATA_DIR = tmp;
  process.env.DOWNLOAD_DIR = path.join(tmp, "downloads");
  await fs.mkdir(process.env.DOWNLOAD_DIR);
  await fs.copyFile(
    path.join(root, "public/videos/sintel-trailer.mp4"),
    path.join(process.env.DOWNLOAD_DIR, "sintel.mp4"),
  );
  process.env.ALLOW_REGISTRATION = "true";
  delete process.env.APP_ORIGIN;
  const remote = express();
  remote.use(express.json());
  remote.post("/jsonrpc", (req, res) => {
    const { method, params, id } = req.body;
    assert.equal(params[0], `token:${key}`);
    const args = params.slice(1);
    let result;
    if (method === "aria2.getVersion") result = { version: "contract-fixture" };
    else if (method === "aria2.getGlobalStat") result = { downloadSpeed: "0" };
    else if (method === "aria2.addUri") {
      result = crypto.randomBytes(8).toString("hex");
      jobs.set(result, {
        gid: result,
        status: "complete",
        totalLength: "4372373",
        completedLength: "4372373",
        downloadSpeed: "0",
        files: [
          {
            path: path.join(process.env.DOWNLOAD_DIR, "sintel.mp4"),
            selected: "true",
          },
        ],
      });
    } else if (method === "aria2.tellStatus") {
      result = jobs.get(args[0]);
      if (!result)
        return res.json({
          id,
          jsonrpc: "2.0",
          error: { code: 1, message: "GID not found" },
        });
    } else if (method === "aria2.forcePause") {
      jobs.get(args[0]).status = "paused";
      result = args[0];
    } else if (method === "aria2.unpause") {
      jobs.get(args[0]).status = "active";
      result = args[0];
    } else if (
      ["aria2.forceRemove", "aria2.removeDownloadResult"].includes(method)
    ) {
      jobs.delete(args[0]);
      result = "OK";
    } else
      return res.json({
        id,
        jsonrpc: "2.0",
        error: { code: 1, message: "Unsupported test RPC" },
      });
    res.json({ id, jsonrpc: "2.0", result });
  });
  remote.use((req, res, next) =>
    req.get("X-Emby-Token") === key ? next() : res.status(401).end(),
  );
  remote.get("/System/Info", (req, res) =>
    res.json({
      Version: "contract-fixture",
      ServerName: "Explicit test fixture",
    }),
  );
  remote.get("/Items", (req, res) =>
    res.json({
      Items: [directId, hlsId].map((Id, index) => ({
        Id,
        Name: index ? "Sintel HLS contract fixture" : "Sintel",
        Type: "Movie",
        ProductionYear: 2010,
        CommunityRating: 7.4,
        RunTimeTicks: 520000000,
        Genres: ["Animation"],
        ProviderIds: index ? {} : { Imdb: "tt1727587" },
      })),
      TotalRecordCount: 2,
    }),
  );
  remote.post("/Items/:id/PlaybackInfo", (req, res) => {
    assert.equal(req.body.DeviceProfile.Name, "VIO Web");
    res.json({
      MediaSources: [
        {
          Id: mediaId,
          Container: "mp4",
          SupportsDirectPlay: req.params.id === directId,
          TranscodingUrl: `/fixture/master.m3u8?api_key=${key}`,
          MediaStreams: [
            {
              Type: "Subtitle",
              Index: 2,
              Language: "fas",
              DisplayTitle: "Persian informational captions",
            },
          ],
        },
      ],
    });
  });
  remote.get(`/Videos/${directId}/stream.mp4`, (req, res) =>
    res.sendFile(path.join(root, "public/videos/sintel-trailer.mp4")),
  );
  remote.get("/Videos/:id/:source/Subtitles/:index/Stream.vtt", (req, res) =>
    res
      .type("text/vtt")
      .sendFile(path.join(root, "public/captions/sintel.fa.vtt")),
  );
  remote.get("/fixture/master.m3u8", (req, res) =>
    res
      .type("application/vnd.apple.mpegurl")
      .send("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nchild.m3u8\n"),
  );
  remote.get("/fixture/child.m3u8", (req, res) =>
    res
      .type("application/vnd.apple.mpegurl")
      .send(
        '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:2.0,\nsegment.ts\n#EXT-X-ENDLIST\n',
      ),
  );
  remote.get("/fixture/key.bin", (req, res) =>
    res.type("application/octet-stream").send(Buffer.alloc(16)),
  );
  remote.get("/fixture/segment.ts", (req, res) =>
    res.type("video/mp2t").send("protocol-test-bytes-not-a-video"),
  );
  remote.get("/Items/:id/Images/:type", (req, res) =>
    res
      .type("image/webp")
      .sendFile(path.join(root, "public/images/sintel.webp")),
  );
  provider = await listen(remote);
  const url = `http://127.0.0.1:${provider.address().port}`;
  process.env.ARIA2_RPC_URL = url + "/jsonrpc";
  process.env.ARIA2_RPC_SECRET = key;
  process.env.JELLYFIN_URL = url;
  process.env.JELLYFIN_API_KEY = key;
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  platform = mountPlatform(app, { root });
  app.use((err, req, res, next) =>
    res.status(err.status || 500).json({ error: err.message }),
  );
  api = await listen(app);
  base = `http://127.0.0.1:${api.address().port}`;
  userA = await register("Alice");
  userB = await register("Bob");
});
after(async () => {
  await Promise.all([
    new Promise((r) => api.close(r)),
    new Promise((r) => provider.close(r)),
  ]);
  platform.db.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

test("passwords use salted scrypt, with timing-safe comparison", async () => {
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.ok(!a.includes(password));
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("wrong", a), false);
});
test("real registration sets a private session cookie and stores only its digest", () => {
  assert.match(userA.header, /HttpOnly/i);
  assert.match(userA.header, /SameSite=Strict/i);
  assert.match(userA.header, /Path=\/api/i);
  const session = platform.db
    .prepare("SELECT * FROM sessions WHERE user_id=?")
    .get(userA.id);
  assert.notEqual(session.token_hash, userA.cookie.split("=")[1]);
  assert.equal(session.token_hash.length, 64);
});
test("malformed registration and invalid login are rejected", async () => {
  assert.equal(
    (
      await request("/api/auth/register", {
        method: "POST",
        body: { name: "a", email: "bad", password: "short" },
      })
    ).res.status,
    400,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        body: { email: userA.email, password: "not-right" },
      })
    ).res.status,
    401,
  );
});
test("session restores the account and does not return password hashes", async () => {
  const { data } = await request("/api/auth/me", { cookie: userA.cookie });
  assert.equal(data.user.id, userA.id);
  assert.equal("password_hash" in data.user, false);
});
test("cross-origin writes fail before modifying the private watchlist", async () => {
  assert.equal(
    (
      await request("/api/account/watchlist", {
        method: "POST",
        cookie: userA.cookie,
        headers: { Origin: "https://evil.example" },
        body: { movie },
      })
    ).res.status,
    403,
  );
});
test("watchlists are persistent and isolated by user", async () => {
  assert.equal(
    (
      await request("/api/account/watchlist", {
        method: "POST",
        cookie: userA.cookie,
        body: { movie },
      })
    ).res.status,
    200,
  );
  assert.equal(
    (await request("/api/account/watchlist", { cookie: userA.cookie })).data
      .movies.length,
    1,
  );
  assert.equal(
    (await request("/api/account/watchlist", { cookie: userB.cookie })).data
      .movies.length,
    0,
  );
  assert.equal((await request("/api/account/watchlist")).res.status, 401);
});
test("progress validates times, stores movie identity and isolates accounts", async () => {
  assert.equal(
    (
      await request("/api/account/progress", {
        method: "POST",
        cookie: userA.cookie,
        body: { key: movie.imdb_code, time: 17, duration: 52.2, movie },
      })
    ).res.status,
    200,
  );
  const result = await request("/api/account/progress", {
    cookie: userA.cookie,
  });
  assert.equal(result.data.progress.tt1727587.time, 17);
  assert.equal(result.data.movies[0].title, "Sintel");
  assert.deepEqual(
    (await request("/api/account/progress", { cookie: userB.cookie })).data
      .progress,
    {},
  );
  assert.equal(
    (
      await request("/api/account/progress", {
        method: "POST",
        cookie: userA.cookie,
        body: { key: movie.imdb_code, time: 999, duration: 5 },
      })
    ).res.status,
    400,
  );
});
test("movie records and HTTPS downloads reject unsafe input", () => {
  assert.throws(() => sanitizeMovie({ imdb_code: "../../secrets" }));
  for (const url of [
    "file:///etc/passwd",
    "https://127.0.0.1/secrets",
    "https://user:pass@media.w3.org/a",
    "http://media.w3.org/a",
    "magnet:?xt=bad",
  ])
    assert.throws(() => approvedDownload(url));
  assert.equal(
    approvedDownload("https://media.w3.org/2010/05/sintel/trailer.mp4"),
    "https://media.w3.org/2010/05/sintel/trailer.mp4",
  );
});
test("magnet download adapter keeps a valid hash and discards untrusted trackers", () => {
  const hash = "a".repeat(40);
  const result = approvedDownload(
    `magnet:?xt=urn:btih:${hash}&tr=http://127.0.0.1/private&dn=Test`,
  );
  assert.ok(result.includes(hash));
  assert.ok(!result.includes("127.0.0.1"));
});
test("aria2 queue calls are authenticated and records are owner-scoped", async () => {
  assert.equal(
    (
      await request("/api/downloads", {
        method: "POST",
        body: { url: "https://media.w3.org/2010/05/sintel/trailer.mp4" },
      })
    ).res.status,
    401,
  );
  const created = await request("/api/downloads", {
    method: "POST",
    cookie: userA.cookie,
    body: {
      url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
      title: "Sintel",
      movie,
    },
  });
  assert.equal(created.res.status, 201);
  userA.gid = created.data.gid;
  const list = await request("/api/downloads", { cookie: userA.cookie });
  assert.equal(list.data.downloads.length, 1);
  assert.equal(list.data.downloads[0].playable, true);
  assert.equal(
    (await request("/api/downloads", { cookie: userB.cookie })).data.downloads
      .length,
    0,
  );
  assert.equal(
    (
      await request(`/api/downloads/${userA.gid}/pause`, {
        method: "POST",
        cookie: userB.cookie,
      })
    ).res.status,
    404,
  );
});
test("completed files support byte ranges and deny other accounts", async () => {
  const response = await fetch(`${base}/api/downloads/${userA.gid}/media`, {
    headers: { Cookie: userA.cookie, Range: "bytes=0-99" },
  });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 100);
  assert.equal(
    (
      await request(`/api/downloads/${userA.gid}/media`, {
        cookie: userB.cookie,
      })
    ).res.status,
    404,
  );
});
test("completed download metadata survives lost aria2 result history", async () => {
  jobs.delete(userA.gid);
  const list = await request("/api/downloads", { cookie: userA.cookie });
  assert.equal(list.data.downloads[0].status, "complete");
  const response = await fetch(`${base}/api/downloads/${userA.gid}/media`, {
    headers: { Cookie: userA.cookie, Range: "bytes=0-9" },
  });
  assert.equal(response.status, 206);
  await response.arrayBuffer();
});
test("Jellyfin library uses server-side credentials and maps real provider fields", async () => {
  const result = await request("/api/library", { cookie: userA.cookie });
  assert.equal(result.data.total, 2);
  assert.equal(result.data.movies[0].libraryId, directId);
  assert.ok(!JSON.stringify(result.data).includes(key));
  assert.equal((await request("/api/library")).res.status, 401);
});
test("Jellyfin direct playback hides API keys and enforces ticket ownership", async () => {
  const result = await request(`/api/library/items/${directId}/playback`, {
    cookie: userA.cookie,
  });
  assert.equal(result.data.sources[0].type, "mp4");
  assert.ok(!JSON.stringify(result.data).includes(key));
  const url = result.data.sources[0].url;
  assert.ok(url.startsWith("/api/library/media/"));
  assert.equal((await request(url, { cookie: userB.cookie })).res.status, 404);
  const response = await fetch(base + url, {
    headers: { Cookie: userA.cookie, Range: "bytes=0-127" },
  });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 128);
  const captions = await fetch(
    base + result.data.sources[0].textTracks[0].url,
    { headers: { Cookie: userA.cookie } },
  );
  assert.match(await captions.text(), /^WEBVTT/);
});
test("Jellyfin HLS proxy rewrites nested playlists, segments and key URIs", async () => {
  const result = await request(`/api/library/items/${hlsId}/playback`, {
    cookie: userA.cookie,
  });
  assert.equal(result.data.sources[0].type, "hls");
  const master = await (
    await fetch(base + result.data.sources[0].url, {
      headers: { Cookie: userA.cookie },
    })
  ).text();
  const child = master.split("\n").find((s) => s.startsWith("/api/"));
  assert.ok(child);
  const content = await (
    await fetch(base + child, { headers: { Cookie: userA.cookie } })
  ).text();
  assert.match(content, /URI="\/api\/library\/media\//);
  assert.ok(!content.includes(key));
  assert.ok(!content.includes("/fixture/"));
});
test("unconfigured services report unavailable without simulated connections", async () => {
  const keys = [
      "ARIA2_RPC_URL",
      "ARIA2_RPC_SECRET",
      "JELLYFIN_URL",
      "JELLYFIN_API_KEY",
    ],
    values = keys.map((k) => process.env[k]);
  try {
    for (const key of keys) delete process.env[key];
    const status = await createServices().status();
    assert.equal(status.library.configured, false);
    assert.equal(status.library.available, false);
    assert.equal(status.downloads.configured, false);
    assert.equal(status.downloads.available, false);
  } finally {
    keys.forEach((key, index) => {
      if (values[index] === undefined) delete process.env[key];
      else process.env[key] = values[index];
    });
  }
});
test("library deep-link metadata returns the requested real provider identifier", async () => {
  const result = await request(`/api/library/items/${directId}`, {
    cookie: userA.cookie,
  });
  assert.equal(result.res.status, 200);
  assert.equal(result.data.movie.libraryId, directId);
  assert.equal(
    (await request(`/api/library/items/${directId}`)).res.status,
    401,
  );
});
test("magnet metadata follows the child gid while preserving queue ownership", async () => {
  const created = await request("/api/downloads", {
    method: "POST",
    cookie: userA.cookie,
    body: {
      url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
      title: "Explicit RPC metadata fixture",
      movie,
    },
  });
  const parent = created.data.gid,
    child = crypto.randomBytes(8).toString("hex");
  const original = jobs.get(parent);
  jobs.set(parent, { ...original, status: "complete", followedBy: [child] });
  jobs.set(child, { ...original, gid: child, status: "active" });
  let result = await request("/api/downloads", { cookie: userA.cookie });
  assert.equal(
    result.data.downloads.find((j) => j.gid === parent).status,
    "active",
  );
  assert.equal(
    (
      await request(`/api/downloads/${parent}/pause`, {
        method: "POST",
        cookie: userA.cookie,
      })
    ).res.status,
    200,
  );
  assert.equal(jobs.get(child).status, "paused");
  assert.equal(
    (
      await request(`/api/downloads/${parent}/resume`, {
        method: "POST",
        cookie: userA.cookie,
      })
    ).res.status,
    200,
  );
  assert.equal(jobs.get(child).status, "active");
  assert.equal(
    (
      await request(`/api/downloads/${parent}/remove`, {
        method: "POST",
        cookie: userA.cookie,
      })
    ).res.status,
    200,
  );
  assert.equal(jobs.has(child), false);
});
test("file path canonicalization rejects an engine path outside the download volume", async () => {
  const created = await request("/api/downloads", {
    method: "POST",
    cookie: userA.cookie,
    body: {
      url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
      title: "Path security fixture",
      movie,
    },
  });
  const gid = created.data.gid;
  const outside = path.join(tmp, "outside.mp4");
  await fs.writeFile(outside, "private bytes");
  jobs.get(gid).files[0].path = outside;
  const response = await fetch(`${base}/api/downloads/${gid}/media`, {
    headers: { Cookie: userA.cookie },
  });
  assert.equal(response.status, 403);
  assert.notEqual(await response.text(), "private bytes");
  await request(`/api/downloads/${gid}/remove`, {
    method: "POST",
    cookie: userA.cookie,
  });
});
test("download removal is real, does not erase files, and remains owner-scoped", async () => {
  assert.equal(
    (
      await request(`/api/downloads/${userA.gid}/remove`, {
        method: "POST",
        cookie: userA.cookie,
      })
    ).res.status,
    200,
  );
  assert.equal(
    (await request("/api/downloads", { cookie: userA.cookie })).data.downloads
      .length,
    0,
  );
  assert.ok(
    (await fs.stat(path.join(process.env.DOWNLOAD_DIR, "sintel.mp4"))).size >
      4000000,
  );
});
test("logout revokes the session instead of only hiding the profile", async () => {
  assert.equal(
    (
      await request("/api/auth/logout", {
        method: "POST",
        cookie: userA.cookie,
      })
    ).res.status,
    200,
  );
  assert.equal(
    (await request("/api/auth/me", { cookie: userA.cookie })).data.user,
    null,
  );
  assert.equal(
    (await request("/api/account/watchlist", { cookie: userA.cookie })).res
      .status,
    401,
  );
});
