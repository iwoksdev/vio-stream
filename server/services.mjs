import path from "node:path";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import { isIP } from "node:net";

export function createServices() {
  const ariaUrl = process.env.ARIA2_RPC_URL || "";
  const ariaSecret = process.env.ARIA2_RPC_SECRET || "";
  const jellyfinUrl = (process.env.JELLYFIN_URL || "").replace(/\/$/, "");
  const jellyfinKey = process.env.JELLYFIN_API_KEY || "";
  const jellyfinUser = process.env.JELLYFIN_USER_ID || "";
  const playbackTickets = new Map(),
    resourceTickets = new Map();
  let lastTicketCleanup = 0;
  async function aria(method, params = []) {
    if (!ariaUrl || !ariaSecret)
      throw Object.assign(
        new Error("سرویس aria2 در تنظیمات سرور فعال نشده است."),
        { status: 503 },
      );
    const res = await fetch(ariaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: `aria2.${method}`,
        params: [`token:${ariaSecret}`, ...params],
      }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    if (!res.ok || data.error)
      throw Object.assign(
        new Error(data.error?.message || "ارتباط با aria2 برقرار نشد."),
        { status: 502 },
      );
    return data.result;
  }
  async function jelly(
    route,
    { method = "GET", query = {}, body, timeout = 10000 } = {},
  ) {
    if (!jellyfinUrl || !jellyfinKey)
      throw Object.assign(
        new Error("آدرس و API key سرور Jellyfin هنوز تنظیم نشده‌اند."),
        { status: 503 },
      );
    const url = new URL(jellyfinUrl + route);
    for (const [key, val] of Object.entries(query))
      if (val !== undefined && val !== "")
        url.searchParams.set(key, String(val));
    const res = await fetch(url, {
      method,
      headers: {
        "X-Emby-Token": jellyfinKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok)
      throw Object.assign(
        new Error(
          `Jellyfin پاسخ ${res.status} داد؛ تنظیمات کلید و کتابخانه را بررسی کن.`,
        ),
        { status: 502 },
      );
    return res.json();
  }
  let statusCache = null,
    statusPending = null;
  async function downloadStatus(gid) {
    let raw = await aria("tellStatus", [gid]);
    for (let i = 0; i < 5 && raw.followedBy?.length; i++)
      raw = await aria("tellStatus", [raw.followedBy[0]]);
    return raw;
  }
  async function status(force = false) {
    if (statusCache && Date.now() - statusCache.at < (force ? 3000 : 10000))
      return statusCache.data;
    if (statusPending) return statusPending;
    statusPending = (async () => {
      const [download, library] = await Promise.all([
        ariaUrl && ariaSecret
          ? aria("getVersion")
              .then((v) => {
                if (!v || typeof v.version !== "string")
                  throw new Error("Invalid aria2 health response");
                return {
                  configured: true,
                  available: true,
                  version: v.version,
                  message: "موتور دانلود متصل است.",
                };
              })
              .catch(() => ({
                configured: true,
                available: false,
                message: "موتور دانلود پاسخ نمی‌دهد.",
              }))
          : Promise.resolve({
              configured: false,
              available: false,
              message: "ARIA2_RPC_URL و ARIA2_RPC_SECRET را تنظیم کن.",
            }),
        jellyfinUrl && jellyfinKey
          ? jelly("/System/Info", { timeout: 3000 })
              .then((v) => {
                if (!v || typeof v.Version !== "string")
                  throw new Error("Invalid Jellyfin health response");
                return {
                  configured: true,
                  available: true,
                  version: v.Version,
                  name: v.ServerName,
                  message: "سرور رسانه متصل است.",
                };
              })
              .catch(() => ({
                configured: true,
                available: false,
                message: "اتصال Jellyfin یا کلید آن را بررسی کن.",
              }))
          : Promise.resolve({
              configured: false,
              available: false,
              message: "JELLYFIN_URL و JELLYFIN_API_KEY را تنظیم کن.",
            }),
      ]);
      const data = {
        version: "2.0.0",
        player: { name: "Video.js", version: "10.0.1", available: true },
        accounts: {
          available: true,
          storage: "SQLite",
          registration: process.env.ALLOW_REGISTRATION !== "false",
        },
        downloads: download,
        library,
      };
      statusCache = { at: Date.now(), data };
      return data;
    })().finally(() => {
      statusPending = null;
    });
    return statusPending;
  }
  function itemToMovie(item) {
    const id = item.Id;
    const video = (
      item.MediaSources?.[0]?.MediaStreams ||
      item.MediaStreams ||
      []
    ).find((s) => s.Type === "Video");
    const mediaQuality = video?.Height ? `${video.Height}p` : undefined;
    return {
      id: 0,
      libraryId: id,
      mediaQuality,
      imdb_code: /^tt\d{5,12}$/.test(item.ProviderIds?.Imdb || "")
        ? item.ProviderIds.Imdb
        : `jf-${id}`,
      title: item.Name,
      title_fa: undefined,
      year: item.ProductionYear || 0,
      rating: item.CommunityRating || 0,
      runtime: Math.round((item.RunTimeTicks || 0) / 600000000),
      genres: item.Genres || [],
      summary: item.Overview || "",
      source: "Jellyfin",
      poster: `/api/library/items/${id}/image?type=Primary`,
      backdrop: `/api/library/items/${id}/image?type=Backdrop`,
      torrents: [],
      kind: item.Type === "Episode" ? "episode" : "movie",
      seriesName: item.SeriesName,
    };
  }
  async function library({
    search = "",
    start = 0,
    limit = 24,
    type = "Movie",
    ids = "",
  } = {}) {
    const data = await jelly("/Items", {
      query: {
        UserId: jellyfinUser || undefined,
        Recursive: true,
        IncludeItemTypes: type,
        Ids: ids || undefined,
        Fields: "Overview,Genres,ProviderIds,MediaSources,MediaStreams",
        SearchTerm: search,
        StartIndex: start,
        Limit: limit,
        SortBy: "DateCreated",
        SortOrder: "Descending",
      },
    });
    return {
      movies: (data.Items || []).map(itemToMovie),
      total: data.TotalRecordCount || 0,
    };
  }
  function issueTicket(url, userId) {
    const origin = new URL(jellyfinUrl),
      prefix = origin.pathname.replace(/\/$/, "");
    const value =
      url.startsWith("/") && prefix && !url.startsWith(prefix + "/")
        ? jellyfinUrl + url
        : url;
    const resolved = new URL(value, jellyfinUrl + "/");
    if (
      resolved.origin !== origin.origin ||
      (prefix &&
        resolved.pathname !== prefix &&
        !resolved.pathname.startsWith(prefix + "/"))
    )
      throw new Error("منبع پخش خارج از سرور رسانه است.");
    const resource = crypto
      .createHash("sha256")
      .update(userId + "|" + resolved.href)
      .digest("hex");
    const previous = resourceTickets.get(resource),
      cached = playbackTickets.get(previous);
    if (cached && cached.expires > Date.now()) {
      cached.expires = Date.now() + 6 * 3600000;
      return `/api/library/media/${previous}`;
    }
    if (
      playbackTickets.size >=
      (Number(process.env.MAX_PLAYBACK_TICKETS) || 50000)
    ) {
      for (const [k, v] of playbackTickets)
        if (v.expires < Date.now()) {
          playbackTickets.delete(k);
          if (resourceTickets.get(v.resource) === k)
            resourceTickets.delete(v.resource);
        }
      if (
        playbackTickets.size >=
        (Number(process.env.MAX_PLAYBACK_TICKETS) || 50000)
      )
        throw Object.assign(
          new Error("تعداد منابع پخش فعال زیاد است؛ کمی بعد دوباره تلاش کن."),
          { status: 429 },
        );
    }
    const token = crypto.randomBytes(24).toString("hex");
    resourceTickets.set(resource, token);
    playbackTickets.set(token, {
      url: resolved.href,
      userId,
      resource,
      expires: Date.now() + 6 * 3600000,
    });
    if (Date.now() - lastTicketCleanup > 60000) {
      lastTicketCleanup = Date.now();
      for (const [k, v] of playbackTickets)
        if (v.expires < Date.now()) {
          playbackTickets.delete(k);
          if (resourceTickets.get(v.resource) === k)
            resourceTickets.delete(v.resource);
        }
    }
    return `/api/library/media/${token}`;
  }
  async function playback(id, userId) {
    const data = await jelly(`/Items/${id}/PlaybackInfo`, {
      method: "POST",
      query: { UserId: jellyfinUser || undefined },
      body: {
        UserId: jellyfinUser || undefined,
        StartTimeTicks: 0,
        IsPlayback: true,
        AutoOpenLiveStream: true,
        MaxStreamingBitrate: 20000000,
        DeviceProfile: {
          Name: "VIO Web",
          MaxStreamingBitrate: 20000000,
          DirectPlayProfiles: [
            {
              Container: "mp4,m4v,webm",
              Type: "Video",
              VideoCodec: "h264,vp8,vp9,av1",
              AudioCodec: "aac,mp3,opus,vorbis",
            },
          ],
          TranscodingProfiles: [
            {
              Container: "ts",
              Type: "Video",
              VideoCodec: "h264",
              AudioCodec: "aac",
              Protocol: "hls",
              Context: "Streaming",
              MaxAudioChannels: "2",
              MinSegments: 1,
              BreakOnNonKeyFrames: true,
            },
          ],
        },
      },
    });
    const source = data.MediaSources?.[0];
    if (!source)
      throw Object.assign(new Error("منبع پخش برای این عنوان ثبت نشده است."), {
        status: 404,
      });
    const direct =
      source.SupportsDirectPlay &&
      ["mp4", "m4v", "webm"].includes(source.Container?.toLowerCase());
    const route = direct
      ? `/Videos/${id}/stream.${source.Container === "webm" ? "webm" : "mp4"}?${new URLSearchParams({ Static: "true", MediaSourceId: source.Id, api_key: jellyfinKey })}`
      : source.TranscodingUrl;
    if (!route)
      throw Object.assign(
        new Error(
          "این فایل به ترنسکد نیاز دارد؛ تنظیمات Jellyfin را بررسی کن.",
        ),
        { status: 422 },
      );
    const languages = {
      eng: "en",
      fas: "fa",
      per: "fa",
      ara: "ar",
      fra: "fr",
      fre: "fr",
      deu: "de",
      ger: "de",
      spa: "es",
    };
    const textTracks = (source.MediaStreams || [])
      .filter(
        (s) =>
          s.Type === "Subtitle" &&
          Number.isInteger(s.Index) &&
          s.Index >= 0 &&
          ![
            "pgssub",
            "dvdsub",
            "dvbsub",
            "hdmv_pgs_subtitle",
            "dvd_subtitle",
          ].includes(String(s.Codec || "").toLowerCase()),
      )
      .slice(0, 12)
      .map((s) => ({
        url: issueTicket(
          `/Videos/${id}/${encodeURIComponent(source.Id)}/Subtitles/${s.Index}/Stream.vtt`,
          userId,
        ),
        language: languages[s.Language] || s.Language || "und",
        label: s.DisplayTitle || s.Title || s.Language || "زیرنویس",
      }));
    return {
      sources: [
        {
          url: issueTicket(route, userId),
          type: direct ? "mp4" : "hls",
          label: direct ? "Jellyfin · پخش مستقیم" : "Jellyfin · HLS تطبیقی",
          textTracks,
        },
      ],
    };
  }
  async function proxyMedia(req, res, token, userId) {
    const ticket = playbackTickets.get(token);
    if (!ticket || ticket.userId !== userId || ticket.expires < Date.now())
      return res
        .status(404)
        .json({ error: "نشست پخش منقضی شده است؛ فیلم را دوباره باز کن." });
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    const upstream = await fetch(ticket.url, {
      headers: {
        "X-Emby-Token": jellyfinKey,
        "Accept-Encoding": "identity",
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
      redirect: "error",
      signal: abort.signal,
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    if (contentType.includes("mpegurl") || /\.m3u8(?:\?|$)/.test(ticket.url)) {
      let body = await upstream.text();
      const rewrite = (value) => {
        const u = new URL(value, ticket.url);
        if (u.origin !== new URL(jellyfinUrl).origin)
          throw new Error("مبدأ قطعهٔ ویدیو نامعتبر است.");
        return issueTicket(u.href, userId);
      };
      body = body
        .split("\n")
        .map((line) =>
          line && !line.startsWith("#")
            ? rewrite(line.trim())
            : line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${rewrite(u)}"`),
        )
        .join("\n");
      res.type("application/vnd.apple.mpegurl").send(body);
      return;
    }
    res.status(upstream.status);
    for (const header of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ])
      if (upstream.headers.has(header))
        res.setHeader(header, upstream.headers.get(header));
    Readable.fromWeb(upstream.body)
      .on("error", () => res.destroy())
      .pipe(res);
  }
  async function proxyImage(req, res, id) {
    if (!jellyfinUrl || !jellyfinKey) return res.status(503).end();
    const type = req.query.type === "Backdrop" ? "Backdrop" : "Primary";
    const url = new URL(`${jellyfinUrl}/Items/${id}/Images/${type}`);
    url.searchParams.set("maxWidth", type === "Backdrop" ? "1280" : "450");
    url.searchParams.set("quality", "85");
    const data = await fetch(url, {
      headers: { "X-Emby-Token": jellyfinKey },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!data.ok) return res.status(data.status).end();
    res.setHeader(
      "Content-Type",
      data.headers.get("content-type") || "image/jpeg",
    );
    res.setHeader("Cache-Control", "private,max-age=3600");
    Readable.fromWeb(data.body)
      .on("error", () => res.destroy())
      .pipe(res);
  }
  return {
    aria,
    downloadStatus,
    jelly,
    status,
    library,
    playback,
    proxyMedia,
    proxyImage,
    configured: {
      aria: !!(ariaUrl && ariaSecret),
      jellyfin: !!(jellyfinUrl && jellyfinKey),
    },
  };
}

export function approvedDownload(input) {
  if (typeof input !== "string" || input.length > 2000)
    throw new Error("لینک دانلود معتبر نیست.");
  if (input.startsWith("magnet:?")) {
    const p = new URLSearchParams(input.slice(8));
    const xt = p.get("xt") || "";
    if (!/^urn:btih:[a-f\d]{40}$/i.test(xt))
      throw new Error("هش مگنت نامعتبر است.");
    const out = new URLSearchParams({
      xt,
      dn: (p.get("dn") || "VIO download").slice(0, 200),
    });
    out.append("tr", "udp://tracker.opentrackr.org:1337/announce");
    return `magnet:?${out}`;
  }
  let u;
  try {
    u = new URL(input);
  } catch {
    throw new Error("لینک دانلود معتبر نیست.");
  }
  const allowed = (
    process.env.DOWNLOAD_ALLOWED_HOSTS ||
    "media.w3.org,download.blender.org,yts.gg"
  )
    .split(",")
    .map((s) => s.trim());
  if (
    u.protocol !== "https:" ||
    isIP(u.hostname.replace(/^\[|\]$/g, "")) ||
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    (u.port && u.port !== "443") ||
    u.username ||
    u.password ||
    !allowed.includes(u.hostname)
  )
    throw new Error(
      "برای امنیت سرور، دامنهٔ این لینک در DOWNLOAD_ALLOWED_HOSTS مجاز نشده است.",
    );
  return u.href;
}
export function normalizeDownload(raw, record) {
  const total = Number(raw.totalLength) || 0,
    completed = Number(raw.completedLength) || 0;
  const file = selectedFile(raw);
  const filename = file?.path ? path.basename(file.path) : record.title;
  return {
    gid: record.gid,
    title: record.title,
    movie: record.movie ? JSON.parse(record.movie) : null,
    status: raw.status || "unknown",
    total,
    completed,
    progress: total ? Math.min(100, Math.round((completed / total) * 100)) : 0,
    speed: Number(raw.downloadSpeed) || 0,
    uploadSpeed: Number(raw.uploadSpeed) || 0,
    peers: Number(raw.connections) || 0,
    error: raw.errorMessage || "",
    filename,
    createdAt: record.created_at,
    playable: raw.status === "complete" && /\.(mp4|webm|m4v)$/i.test(filename),
  };
}

export function selectedFile(raw) {
  const files = raw.files || [];
  return (
    files.find(
      (f) => f.selected === "true" && /\.(mp4|webm|m4v)$/i.test(f.path || ""),
    ) ||
    files.find((f) => f.selected === "true") ||
    files[0]
  );
}
