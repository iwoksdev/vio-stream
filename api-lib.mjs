export const PARAMS = new Set([
  "limit",
  "page",
  "quality",
  "minimum_rating",
  "query_term",
  "genre",
  "sort_by",
  "order_by",
]);
export function cleanQuery(input) {
  const output = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (!PARAMS.has(key) || typeof value !== "string") continue;
    if (value.length > 180)
      throw new Error("عبارت جست‌وجو بیش از حد طولانی است.");
    if (["limit", "page", "minimum_rating"].includes(key)) {
      const n = Number(value);
      const max = key === "limit" ? 50 : key === "minimum_rating" ? 9 : 10000;
      const min = key === "minimum_rating" ? 0 : 1;
      if (!Number.isInteger(n) || n < min || n > max)
        throw new Error("مقدار فیلتر نامعتبر است.");
    }
    if (key === "order_by" && !["asc", "desc"].includes(value))
      throw new Error("ترتیب نامعتبر است.");
    if (
      key === "sort_by" &&
      ![
        "title",
        "year",
        "rating",
        "peers",
        "seeds",
        "download_count",
        "like_count",
        "date_added",
      ].includes(value)
    )
      throw new Error("مرتب‌سازی نامعتبر است.");
    if (
      key === "quality" &&
      !["720p", "1080p", "2160p", "3D", "All", "1080p.x265", "480p"].includes(
        value,
      )
    )
      throw new Error("کیفیت نامعتبر است.");
    output.set(key, value);
  }
  if (!output.has("limit")) output.set("limit", "24");
  return output;
}
export function magnetUrl(hash, title, year) {
  if (!/^[a-f\d]{40}$/i.test(hash)) throw new Error("Invalid hash");
  const p = new URLSearchParams({
    xt: `urn:btih:${hash}`,
    dn: `${title} (${year})`,
  });
  p.append("tr", "udp://tracker.opentrackr.org:1337/announce");
  return `magnet:?${p}`;
}
export function filterCached(movies, params) {
  const q = (params.get("query_term") || "").toLowerCase();
  let filtered = movies.filter(
    (m) =>
      (!q ||
        [m.title, m.title_fa, m.imdb_code].some((t) =>
          t?.toLowerCase().includes(q),
        )) &&
      (!params.get("genre") ||
        m.genres.some(
          (g) => g.toLowerCase() === params.get("genre").toLowerCase(),
        )) &&
      (!params.get("minimum_rating") ||
        m.rating >= Number(params.get("minimum_rating"))) &&
      (!params.get("quality") ||
        params.get("quality") === "All" ||
        m.torrents?.some((t) => t.quality === params.get("quality"))),
  );
  const sort = params.get("sort_by");
  if (["rating", "year"].includes(sort))
    filtered.sort(
      (a, b) =>
        (a[sort] - b[sort]) * (params.get("order_by") === "asc" ? 1 : -1),
    );
  if (sort === "title")
    filtered.sort(
      (a, b) =>
        a.title.localeCompare(b.title) *
        (params.get("order_by") === "asc" ? 1 : -1),
    );
  const count = filtered.length,
    limit = Number(params.get("limit") || 24),
    page = Number(params.get("page") || 1);
  return {
    movies: filtered.slice((page - 1) * limit, page * limit),
    movie_count: count,
    source: "cache",
    page_number: page,
  };
}
