import express from "express";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanQuery, filterCached } from "./api-lib.mjs";
import { mountPlatform } from "./server/platform.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 5173);
const apiBase = new URL(
  process.env.YTS_API_BASE || "https://movies-api.accel.li/api/v2/",
);
if (apiBase.protocol !== "https:")
  throw new Error("YTS_API_BASE must use HTTPS");
app.disable("x-powered-by");
app.use((req, res, next) => {
  let pathname;
  try {
    pathname = decodeURIComponent(req.path);
  } catch {
    return res.status(400).end();
  }
  if (
    /(?:^|\/)\.(?:data|arena|git|env)(?:[/.]|$)/i.test(pathname) ||
    /\.(?:sqlite|db)(?:[-.?]|$)/i.test(pathname)
  )
    return res.status(404).end();
  next();
});
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: "32kb" }));
const seed = JSON.parse(
  await fs.readFile(path.join(root, "public/movie-seed.json"), "utf8"),
);
let streams = {};
try {
  streams = JSON.parse(
    await fs.readFile(path.join(root, "streams.json"), "utf8"),
  );
} catch {
  /* optional stream configuration */
}
const cache = new Map();
const rates = new Map();
app.use("/api", (req, res, next) => {
  if (
    /^\/library\/media\//.test(req.path) ||
    /^\/downloads\/[^/]+\/(media|file)$/.test(req.path)
  )
    return next();
  const ip = req.ip,
    now = Date.now(),
    state = rates.get(ip);
  if (!state || now - state.at > 60000) rates.set(ip, { at: now, count: 1 });
  else if (++state.count > 240)
    return res
      .status(429)
      .json({ error: "درخواست‌های زیادی ارسال شده است. یک دقیقه صبر کنید." });
  if (rates.size > 1000)
    for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);
  res.setHeader("Cache-Control", "no-store");
  next();
});
const platform = mountPlatform(app, { root });
app.use("/api", (error, req, res, next) => {
  if (req.destroyed || res.destroyed) return;
  if (res.headersSent) return next(error);
  const code = error.status || (error.name === "TimeoutError" ? 504 : 500);
  if (code >= 500) console.warn("VIO API:", error.message);
  res
    .status(code)
    .json({
      error:
        code === 500 ? "خطایی در سرور رخ داد؛ دوباره تلاش کن." : error.message,
    });
});
async function upstream(endpoint, query) {
  const url = new URL(
    endpoint,
    apiBase.href.endsWith("/") ? apiBase : new URL(apiBase.href + "/"),
  );
  url.search = query.toString();
  const key = url.href,
    saved = cache.get(key);
  if (saved && Date.now() - saved.at < 600000) return saved.data;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("YTS HTTP " + res.status);
  const data = await res.json();
  if (data.status !== "ok" || !data.data)
    throw new Error("Invalid provider response");
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), data: data.data });
  return data.data;
}
app.get("/api/status", (_req, res) =>
  res.json({
    version: "2.0.0",
    accounts: "SQLite / HttpOnly sessions",
    provider: "YTS",
    api: apiBase.hostname,
    mode: "live-with-cache",
    cached_at: seed.updated_at,
    streaming: "MP4 / HLS",
    demo: "Sintel official trailer (CC BY 3.0)",
  }),
);
app.get("/api/movies", async (req, res) => {
  let params;
  try {
    params = cleanQuery(req.query);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const data = await upstream("list_movies.json", params);
    res.json({
      movies: data.movies || [],
      movie_count: data.movie_count || 0,
      page_number: data.page_number || 1,
      source: "live",
    });
  } catch (e) {
    console.warn("YTS fallback:", e.message);
    res.json({
      ...filterCached(seed.movies, params),
      notice: "آرشیو زنده در دسترس نیست؛ نتایج از کش محلی نمایش داده می‌شوند.",
    });
  }
});
app.get("/api/movies/:id", async (req, res) => {
  if (!/^\d+$/.test(req.params.id))
    return res.status(400).json({ error: "شناسهٔ نامعتبر" });
  try {
    const data = await upstream(
      "movie_details.json",
      new URLSearchParams({
        movie_id: req.params.id,
        with_images: "true",
        with_cast: "true",
      }),
    );
    res.json({ movie: data.movie, source: "live" });
  } catch {
    const movie = seed.movies.find((m) => m.id === Number(req.params.id));
    movie
      ? res.json({ movie, source: "cache" })
      : res.status(404).json({ error: "فیلم پیدا نشد." });
  }
});
app.get("/api/streams/:imdb", (req, res) => {
  if (!/^tt\d{5,12}$/.test(req.params.imdb))
    return res.status(400).json({ error: "شناسهٔ IMDb نامعتبر" });
  const sources = (streams[req.params.imdb] || []).filter(
    (s) =>
      typeof s.url === "string" &&
      (s.url.startsWith("/videos/") || /^https:\/\//i.test(s.url)),
  );
  res.json({ sources });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("*", (_req, res) => res.sendFile(path.join(root, "dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true, allowedHosts: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
server.listen(port, "0.0.0.0", () =>
  console.log(`VIO website ready at http://0.0.0.0:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      platform.db.close();
      process.exit(0);
    }),
  );
