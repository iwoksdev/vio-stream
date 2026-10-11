import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import {
  openStore,
  hashPassword,
  verifyPassword,
  safeUser,
  digest,
  sanitizeMovie,
} from "./store.mjs";
import {
  createServices,
  approvedDownload,
  normalizeDownload,
  selectedFile,
} from "./services.mjs";

export function mountPlatform(app, { root }) {
  const db = openStore(root),
    services = createServices();
  const authLimits = new Map();
  async function downloadStatus(record) {
    try {
      const raw = await services.downloadStatus(
        record.target_gid || record.gid,
      );
      db.prepare(
        "UPDATE downloads SET snapshot=?,target_gid=? WHERE gid=?",
      ).run(JSON.stringify(raw), raw.gid || record.gid, record.gid);
      return raw;
    } catch (error) {
      if (/not found/i.test(error.message)) {
        const saved = record.snapshot ? JSON.parse(record.snapshot) : null;
        return saved?.status === "complete"
          ? saved
          : {
              status: "removed",
              errorMessage: "این دانلود دیگر در موتور موجود نیست.",
            };
      }
      throw error;
    }
  }
  const route = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch(next);
  const authenticate = (req, res, next) =>
    req.user
      ? next()
      : res.status(401).json({
          error: "برای این بخش وارد حساب کاربری شو.",
          code: "AUTH_REQUIRED",
        });
  const movieKey = /^(tt\d{5,12}|dl-[a-f0-9]{16}|jf-[a-zA-Z0-9-]{8,64})$/;
  const idPattern = /^[a-zA-Z0-9-]{8,64}$/;
  const cookie = (res, token, maxAge) =>
    res.cookie("vio_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure:
        process.env.COOKIE_SECURE === "true" ||
        (process.env.NODE_ENV === "production" &&
          process.env.COOKIE_SECURE !== "false"),
      maxAge,
      path: "/api",
    });
  function newSession(res, id) {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 7 * 86400000;
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      digest(token),
      id,
      expires,
    );
    cookie(res, token, 7 * 86400000);
  }
  app.use("/api", (req, res, next) => {
    const cookieToken = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("vio_session="))
      ?.slice(12);
    if (cookieToken && /^[a-f\d]{64}$/.test(cookieToken))
      req.user = db
        .prepare(
          "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?",
        )
        .get(digest(cookieToken), Date.now());
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin) {
        let allowed = false;
        try {
          allowed = process.env.APP_ORIGIN
            ? origin === process.env.APP_ORIGIN
            : new URL(origin).host === req.get("host");
        } catch {}
        if (!allowed)
          return res.status(403).json({ error: "مبدأ درخواست مجاز نیست." });
      }
      if (req.get("sec-fetch-site") === "cross-site")
        return res.status(403).json({ error: "درخواست بین‌سایتی رد شد." });
    }
    next();
  });
  app.get("/api/auth/me", (req, res) =>
    res.json({
      user: safeUser(req.user),
      registration: process.env.ALLOW_REGISTRATION !== "false",
      mode: "live",
    }),
  );
  app.use("/api/auth", (req, res, next) => {
    if (req.method === "GET") return next();
    const key = req.ip,
      now = Date.now(),
      row = authLimits.get(key);
    if (!row || now - row.at > 60000)
      authLimits.set(key, { at: now, count: 1 });
    else if (++row.count > 20)
      return res.status(429).json({ error: "کمی صبر کن و دوباره تلاش کن." });
    if (authLimits.size > 1000)
      for (const [k, v] of authLimits)
        if (now - v.at > 60000) authLimits.delete(k);
    next();
  });
  app.post(
    "/api/auth/register",
    route(async (req, res) => {
      if (process.env.ALLOW_REGISTRATION === "false")
        return res
          .status(403)
          .json({ error: "ثبت‌نام عمومی این سرور غیرفعال است." });
      const { name, email, password } = req.body || {};
      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.length > 60 ||
        typeof email !== "string" ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        email.length > 254 ||
        typeof password !== "string" ||
        password.length < 10 ||
        password.length > 200
      )
        return res
          .status(400)
          .json({ error: "نام معتبر، ایمیل و رمز حداقل ۱۰ کاراکتری وارد کن." });
      const id = crypto.randomUUID();
      const hashed = await hashPassword(password);
      try {
        db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
          id,
          name.trim(),
          email.toLowerCase().trim(),
          hashed,
          "user",
          Date.now(),
        );
      } catch (e) {
        if (e.code?.startsWith("SQLITE_CONSTRAINT"))
          return res
            .status(409)
            .json({ error: "این ایمیل قبلاً ثبت شده است." });
        throw e;
      }
      newSession(res, id);
      res.status(201).json({
        user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)),
      });
    }),
  );
  app.post(
    "/api/auth/login",
    route(async (req, res) => {
      const { email, password } = req.body || {};
      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        password.length > 200
      )
        return res.status(400).json({ error: "ایمیل و رمز را وارد کن." });
      const user = db
        .prepare("SELECT * FROM users WHERE email=?")
        .get(email.toLowerCase().trim());
      const valid = await verifyPassword(password, user?.password_hash);
      if (!valid || !user)
        return res.status(401).json({ error: "ایمیل یا رمز درست نیست." });
      if (!user.password_hash.startsWith("scrypt$"))
        db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
          await hashPassword(password),
          user.id,
        );
      newSession(res, user.id);
      res.json({ user: safeUser(user) });
    }),
  );
  app.post("/api/auth/logout", (req, res) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("vio_session="))
      ?.slice(12);
    if (token)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
    cookie(res, "", 0);
    res.json({ ok: true });
  });
  app.get("/api/account/watchlist", authenticate, (req, res) =>
    res.json({
      movies: db
        .prepare(
          "SELECT movie FROM watchlist WHERE user_id=? ORDER BY created_at DESC",
        )
        .all(req.user.id)
        .map((x) => JSON.parse(x.movie)),
    }),
  );
  app.post("/api/account/watchlist", authenticate, (req, res, next) => {
    try {
      const m = sanitizeMovie(req.body.movie);
      db.prepare("INSERT OR REPLACE INTO watchlist VALUES(?,?,?,?)").run(
        req.user.id,
        m.imdb_code,
        JSON.stringify(m),
        Date.now(),
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.delete("/api/account/watchlist/:key", authenticate, (req, res) => {
    db.prepare("DELETE FROM watchlist WHERE user_id=? AND movie_key=?").run(
      req.user.id,
      req.params.key,
    );
    res.json({ ok: true });
  });
  app.get("/api/account/progress", authenticate, (req, res) => {
    const rows = db
      .prepare("SELECT * FROM progress WHERE user_id=?")
      .all(req.user.id);
    res.json({
      progress: Object.fromEntries(
        rows.map((r) => [
          r.movie_key,
          { time: r.time, duration: r.duration, updatedAt: r.updated_at },
        ]),
      ),
      movies: rows.filter((r) => r.movie).map((r) => JSON.parse(r.movie)),
    });
  });
  app.post("/api/account/progress", authenticate, (req, res) => {
    const { key, time, duration } = req.body || {};
    if (
      !movieKey.test(key || "") ||
      !Number.isFinite(time) ||
      !Number.isFinite(duration) ||
      time < 0 ||
      duration <= 0 ||
      duration > 86400 ||
      time > duration + 1
    )
      return res.status(400).json({ error: "زمان پخش نامعتبر است." });
    let movie = null;
    try {
      if (req.body.movie) movie = sanitizeMovie(req.body.movie);
    } catch {
      return res.status(400).json({ error: "اطلاعات فیلم نامعتبر است." });
    }
    db.prepare(
      "INSERT OR REPLACE INTO progress(user_id,movie_key,time,duration,updated_at,movie) VALUES(?,?,?,?,?,?)",
    ).run(
      req.user.id,
      key,
      time,
      duration,
      Date.now(),
      movie ? JSON.stringify(movie) : null,
    );
    db.prepare(
      "DELETE FROM progress WHERE user_id=? AND movie_key IN (SELECT movie_key FROM progress WHERE user_id=? ORDER BY updated_at DESC LIMIT -1 OFFSET 500)",
    ).run(req.user.id, req.user.id);
    res.json({ ok: true });
  });
  app.get(
    "/api/platform/status",
    route(async (req, res) =>
      res.json(await services.status(req.query.refresh === "1")),
    ),
  );
  app.get(
    "/api/library",
    authenticate,
    route(async (req, res) => {
      const start = Math.max(
          0,
          Math.min(100000, parseInt(req.query.start) || 0),
        ),
        limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 24));
      res.json(
        await services.library({
          search: String(req.query.search || "").slice(0, 180),
          start,
          limit,
          type: req.query.type === "Episode" ? "Episode" : "Movie",
        }),
      );
    }),
  );
  app.get(
    "/api/library/items/:id",
    authenticate,
    route(async (req, res) => {
      if (!idPattern.test(req.params.id))
        return res.status(400).json({ error: "شناسهٔ کتابخانه نامعتبر است." });
      const result = await services.library({
        ids: req.params.id,
        limit: 1,
        type: "Movie,Episode",
      });
      const movie = result.movies.find(
        (item) => item.libraryId === req.params.id,
      );
      movie
        ? res.json({ movie })
        : res.status(404).json({ error: "این عنوان در کتابخانه پیدا نشد." });
    }),
  );
  app.get(
    "/api/library/items/:id/image",
    authenticate,
    route(async (req, res) => {
      if (!idPattern.test(req.params.id)) return res.status(400).end();
      await services.proxyImage(req, res, req.params.id);
    }),
  );
  app.get(
    "/api/library/items/:id/playback",
    authenticate,
    route(async (req, res) => {
      if (!idPattern.test(req.params.id))
        return res.status(400).json({ error: "شناسهٔ نامعتبر" });
      res.json(await services.playback(req.params.id, req.user.id));
    }),
  );
  app.get(
    "/api/library/media/:ticket",
    authenticate,
    route(async (req, res) =>
      services.proxyMedia(req, res, req.params.ticket, req.user.id),
    ),
  );
  app.get(
    "/api/downloads",
    authenticate,
    route(async (req, res) => {
      if (!services.configured.aria)
        return res.status(503).json({
          error: "موتور دانلود هنوز پیکربندی نشده است.",
          code: "NOT_CONFIGURED",
        });
      await services.aria("getGlobalStat");
      const records = db
        .prepare(
          "SELECT * FROM downloads WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .all(req.user.id);
      const rows = [];
      for (let i = 0; i < records.length; i += 8)
        rows.push(
          ...(await Promise.all(
            records
              .slice(i, i + 8)
              .map(async (record) =>
                normalizeDownload(await downloadStatus(record), record),
              ),
          )),
        );
      res.json({ downloads: rows });
    }),
  );
  app.post(
    "/api/downloads",
    authenticate,
    route(async (req, res) => {
      let uri, movie;
      try {
        uri = approvedDownload(req.body.url);
        movie = req.body.movie ? sanitizeMovie(req.body.movie) : null;
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      const title = String(
        req.body.title || movie?.title || "دانلود جدید",
      ).slice(0, 200);
      if (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM downloads WHERE user_id=? AND created_at>?",
          )
          .get(req.user.id, Date.now() - 3600000).count >= 30
      )
        return res
          .status(429)
          .json({ error: "حداکثر ۳۰ دانلود در ساعت مجاز است." });
      const jobDir = path.join(
        path.resolve(
          process.env.DOWNLOAD_DIR || path.join(root, ".data/downloads"),
        ),
        req.user.id,
        crypto.randomUUID(),
      );
      await fs.mkdir(jobDir, { recursive: true, mode: 0o700 });
      const gid = await services.aria("addUri", [
        [uri],
        {
          dir: jobDir,
          "max-connection-per-server": "3",
          split: "3",
          "seed-time": "0",
          "seed-ratio": "0.0",
          "bt-prioritize-piece": "head=20M,tail=5M",
        },
      ]);
      db.prepare(
        "INSERT INTO downloads(gid,user_id,title,movie,created_at) VALUES(?,?,?,?,?)",
      ).run(
        gid,
        req.user.id,
        title,
        movie ? JSON.stringify(movie) : null,
        Date.now(),
      );
      res.status(201).json({ gid, title });
    }),
  );
  const owned = (req, res, next) => {
    const record = db
      .prepare("SELECT * FROM downloads WHERE gid=? AND user_id=?")
      .get(req.params.gid, req.user.id);
    if (!record)
      return res
        .status(404)
        .json({ error: "این دانلود متعلق به حساب تو نیست یا وجود ندارد." });
    req.downloadRecord = record;
    next();
  };
  app.post(
    "/api/downloads/:gid/:action",
    authenticate,
    owned,
    route(async (req, res) => {
      const actions = {
        pause: "forcePause",
        resume: "unpause",
        retry: "unpause",
        remove: "forceRemove",
      };
      const method = actions[req.params.action];
      if (!method) return res.status(400).json({ error: "عملیات نامعتبر" });
      const raw = await downloadStatus(req.downloadRecord),
        target = raw.gid || req.params.gid;
      if (req.params.action === "remove") {
        if (raw.status !== "removed") {
          try {
            await services.aria(
              ["active", "waiting", "paused"].includes(raw.status)
                ? method
                : "removeDownloadResult",
              [target],
            );
          } catch (e) {
            if (!/not found/i.test(e.message)) throw e;
          }
        }
        db.prepare("DELETE FROM downloads WHERE gid=? AND user_id=?").run(
          req.params.gid,
          req.user.id,
        );
      } else await services.aria(method, [target]);
      res.json({ ok: true });
    }),
  );
  const serveDownload = (inline) =>
    route(async (req, res) => {
      const raw = await downloadStatus(req.downloadRecord);
      if (raw.status !== "complete")
        return res.status(409).json({ error: "ابتدا دانلود باید کامل شود." });
      const file = selectedFile(raw);
      if (!file?.path) return res.status(404).end();
      const base = await fs.realpath(
        process.env.DOWNLOAD_DIR || path.join(root, ".data/downloads"),
      );
      const actual = await fs.realpath(file.path);
      if (!actual.startsWith(base + path.sep)) return res.status(403).end();
      if (inline && !/\.(mp4|webm|m4v)$/i.test(actual))
        return res
          .status(415)
          .json({ error: "برای پخش این فرمت از ترنسکد Jellyfin استفاده کن." });
      inline
        ? res.sendFile(actual)
        : res.download(actual, path.basename(actual));
    });
  app.get(
    "/api/downloads/:gid/file",
    authenticate,
    owned,
    serveDownload(false),
  );
  app.get(
    "/api/downloads/:gid/media",
    authenticate,
    owned,
    serveDownload(true),
  );
  return { db, services };
}
