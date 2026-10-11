import Database from "better-sqlite3";
import crypto from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const scrypt = promisify(crypto.scrypt);
const passwordOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, passwordOptions);
  return `scrypt$32768$8$3$${salt}$${hash.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  const encoded = String(
    stored || `scrypt$32768$8$3$${"0".repeat(32)}$${"0".repeat(128)}`,
  );
  let salt,
    hex,
    options = passwordOptions;
  if (encoded.startsWith("scrypt$")) {
    const fields = encoded.split("$");
    if (
      fields.length !== 6 ||
      fields[1] !== "32768" ||
      fields[2] !== "8" ||
      fields[3] !== "3"
    )
      return false;
    salt = fields[4];
    hex = fields[5];
  } else {
    [salt, hex] = encoded.split(":");
    options = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  }
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(hex || ""))
    return false;
  const actual = await scrypt(password, salt, 64, options),
    expected = Buffer.from(hex, "hex");
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}
export const digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
export const safeUser = (u) =>
  u
    ? {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.created_at,
      }
    : null;

export function openStore(root) {
  const dir = path.resolve(process.env.DATA_DIR || path.join(root, ".data"));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const db = new Database(path.join(dir, "vio.sqlite"));
  fs.chmodSync(path.join(dir, "vio.sqlite"), 0o600);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS watchlist(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,movie_key TEXT NOT NULL,movie TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,movie_key));
    CREATE TABLE IF NOT EXISTS progress(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,movie_key TEXT NOT NULL,time REAL NOT NULL,duration REAL NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,movie_key));
    CREATE TABLE IF NOT EXISTS downloads(gid TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,movie TEXT,created_at INTEGER NOT NULL);
  `);
  const downloadColumns = db
    .prepare("PRAGMA table_info(downloads)")
    .all()
    .map((c) => c.name);
  for (const column of ["snapshot", "target_gid"])
    if (!downloadColumns.includes(column))
      db.exec(`ALTER TABLE downloads ADD COLUMN ${column} TEXT`);
  if (
    !db
      .prepare("PRAGMA table_info(progress)")
      .all()
      .some((c) => c.name === "movie")
  )
    db.exec("ALTER TABLE progress ADD COLUMN movie TEXT");
  db.pragma("user_version = 2");
  db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
  return db;
}
export function sanitizeMovie(input) {
  if (
    !input ||
    typeof input !== "object" ||
    !/^(tt\d{5,12}|dl-[a-f0-9]{16}|jf-[a-zA-Z0-9-]{8,64})$/.test(
      input.imdb_code || "",
    )
  )
    throw new Error("شناسهٔ فیلم نامعتبر است.");
  const text = (v, max = 300) =>
    typeof v === "string" ? v.slice(0, max) : undefined;
  const image = (v) =>
    typeof v === "string" &&
    (v.startsWith("/images/") ||
      v.startsWith("/api/library/") ||
      /^https:\/\//.test(v))
      ? v.slice(0, 1200)
      : undefined;
  return {
    id: Number.isSafeInteger(input.id) ? input.id : 0,
    imdb_code: input.imdb_code,
    title: text(input.title) || "Untitled",
    title_fa: text(input.title_fa),
    year: Number(input.year) || 0,
    rating: Math.max(0, Math.min(10, Number(input.rating) || 0)),
    runtime: Number(input.runtime) || 0,
    genres: Array.isArray(input.genres)
      ? input.genres.filter((g) => typeof g === "string").slice(0, 8)
      : [],
    poster: image(input.poster || input.large_cover_image),
    backdrop: image(input.backdrop),
    description_fa: text(input.description_fa, 2500),
    summary: text(input.summary, 2500),
    director: text(input.director),
    source: text(input.source, 40),
    downloadGid: /^[a-f0-9]{16}$/.test(input.downloadGid || "")
      ? input.downloadGid
      : undefined,
    mediaQuality: text(input.mediaQuality, 15),
    libraryId: /^[a-zA-Z0-9-]{8,64}$/.test(input.libraryId || "")
      ? input.libraryId
      : undefined,
    torrents: Array.isArray(input.torrents)
      ? input.torrents
          .slice(0, 15)
          .filter((t) => /^[a-f\d]{40}$/i.test(t.hash || ""))
          .map((t) => ({
            hash: t.hash,
            quality: text(t.quality, 12),
            type: text(t.type, 20),
            size: text(t.size, 30),
            url: /^https:\/\//.test(t.url || "") ? text(t.url, 1000) : "",
            seeds: Number(t.seeds) || 0,
            video_codec: text(t.video_codec, 20),
            audio_channels: text(t.audio_channels, 10),
          }))
      : [],
  };
}
