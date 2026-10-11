import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { cleanQuery, filterCached, magnetUrl } from "../api-lib.mjs";

const seed = JSON.parse(
  await fs.readFile(
    new URL("../public/movie-seed.json", import.meta.url),
    "utf8",
  ),
).movies;

test("query whitelists prevent arbitrary upstream URLs", () => {
  const p = cleanQuery({
    limit: "10",
    query_term: "Dune",
    url: "http://localhost:80",
    host: "evil.test",
  });
  assert.equal(p.get("limit"), "10");
  assert.equal(p.get("query_term"), "Dune");
  assert.equal(p.has("url"), false);
  assert.equal(p.has("host"), false);
});
test("invalid limits, sorts and ratings are rejected", () => {
  for (const q of [
    { limit: "500" },
    { minimum_rating: "10" },
    { page: "-2" },
    { sort_by: "wat" },
    { quality: "8K" },
    { query_term: "x".repeat(181) },
  ])
    assert.throws(() => cleanQuery(q));
});
test("valid movie search works in the cached fallback", () => {
  const data = filterCached(
    seed,
    cleanQuery({ query_term: "tt15239678", limit: "1" }),
  );
  assert.equal(data.movie_count, 1);
  assert.equal(data.movies[0].title, "Dune: Part Two");
  assert.equal(data.source, "cache");
});
test("Persian local search works", () => {
  const data = filterCached(seed, cleanQuery({ query_term: "میان‌ستاره‌ای" }));
  assert.equal(data.movies.length, 1);
  assert.equal(data.movies[0].imdb_code, "tt0816692");
});
test("quality, rating and genre filters combine", () => {
  const data = filterCached(
    seed,
    cleanQuery({ genre: "Sci-Fi", minimum_rating: "8", quality: "2160p" }),
  );
  assert.ok(data.movies.length > 0);
  for (const m of data.movies) {
    assert.ok(m.genres.includes("Sci-Fi"));
    assert.ok(m.rating >= 8);
    assert.ok(m.torrents.some((t) => t.quality === "2160p"));
  }
});
test("rating sort and pagination return consistent totals", () => {
  const all = filterCached(
    seed,
    cleanQuery({ sort_by: "rating", limit: "50" }),
  );
  assert.equal(all.movie_count, 15);
  assert.ok(
    all.movies.every((m, i, a) => i === 0 || m.rating <= a[i - 1].rating),
  );
  const second = filterCached(
    seed,
    cleanQuery({ sort_by: "rating", limit: "3", page: "2" }),
  );
  assert.deepEqual(
    second.movies.map((m) => m.id),
    all.movies.slice(3, 6).map((m) => m.id),
  );
});
test("magnet links use verified hashes and properly encode movie names", () => {
  const m = seed[0],
    torrent = m.torrents[0],
    url = magnetUrl(torrent.hash, m.title, m.year),
    params = new URLSearchParams(url.split("?")[1]);
  assert.equal(params.get("xt"), `urn:btih:${torrent.hash}`);
  assert.equal(params.get("dn"), `${m.title} (${m.year})`);
  assert.throws(() => magnetUrl("not-a-real-hash", "Fake film", 2026));
});
test("all seed posters and the legal video sample are bundled locally", async () => {
  for (const m of seed) {
    const s = await fs.stat(new URL(`../public${m.poster}`, import.meta.url));
    assert.ok(s.size > 1000);
    for (const t of m.torrents) assert.match(t.hash, /^[A-F\d]{40}$/i);
  }
  assert.ok(
    (
      await fs.stat(
        new URL("../public/videos/sintel-trailer.mp4", import.meta.url),
      )
    ).size > 1000000,
  );
});
