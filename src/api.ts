import type { Movie, StreamSource } from "./types";

export const genreNames: Record<string, string> = {
  Action: "اکشن",
  "Sci-Fi": "علمی‌تخیلی",
  Drama: "درام",
  Adventure: "ماجراجویی",
  Comedy: "کمدی",
  Animation: "انیمیشن",
  Thriller: "هیجان‌انگیز",
  Crime: "جنایی",
  Romance: "عاشقانه",
  Fantasy: "فانتزی",
  Biography: "زندگی‌نامه",
  History: "تاریخی",
  Horror: "ترسناک",
  Mystery: "معمایی",
  Family: "خانوادگی",
  Short: "کوتاه",
};
export const fa = (value: number | string) =>
  String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
export const getPoster = (m: Movie) =>
  m.poster ||
  m.large_cover_image ||
  m.medium_cover_image ||
  "/images/movie-placeholder.svg";
export const displayTitle = (m: Movie) => m.title_fa || m.title;
export const runtime = (minutes: number) =>
  minutes ? `${fa(minutes)} دقیقه` : "زمان نامشخص";
export function safeHttpUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function createMagnet(movie: Movie, hash: string): string {
  if (!/^[a-f\d]{40}$/i.test(hash)) throw new Error("Invalid torrent hash");
  const query = new URLSearchParams({
    xt: `urn:btih:${hash}`,
    dn: `${movie.title} (${movie.year})`,
  });
  query.append("tr", "udp://tracker.opentrackr.org:1337/announce");
  query.append("tr", "udp://open.stealth.si:80/announce");
  return `magnet:?${query.toString()}`;
}
export async function loadSeed(): Promise<Movie[]> {
  const response = await fetch("/movie-seed.json");
  if (!response.ok) throw new Error("دریافت کاتالوگ ممکن نیست.");
  return (await response.json()).movies;
}
export async function getMovies(
  params: Record<string, string>,
  signal?: AbortSignal,
) {
  const res = await fetch(`/api/movies?${new URLSearchParams(params)}`, {
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "ارتباط با آرشیو برقرار نشد.");
  return data as { movies: Movie[]; movie_count: number; source: string };
}
export async function getStream(
  imdb: string,
  libraryId?: string,
  downloadGid?: string,
): Promise<StreamSource | null> {
  try {
    if (downloadGid) {
      const url = `/api/downloads/${encodeURIComponent(downloadGid)}/media`;
      const check = await fetch(url, { method: "HEAD" });
      return check.ok
        ? { url, type: "mp4", label: "فایل کامل‌شده روی سرور" }
        : null;
    }
    const r = await fetch(
      libraryId
        ? `/api/library/items/${encodeURIComponent(libraryId)}/playback`
        : `/api/streams/${encodeURIComponent(imdb)}`,
    );
    if (!r.ok) return null;
    return (await r.json()).sources?.[0] || null;
  } catch {
    return null;
  }
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(`vio:${key}`) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function store(key: string, value: unknown) {
  try {
    localStorage.setItem(`vio:${key}`, JSON.stringify(value));
  } catch {
    /* Private mode or quota: app remains usable. */
  }
}
export const sintel: Movie = {
  id: -1,
  imdb_code: "tt1727587",
  title: "Sintel",
  title_fa: "سینتل",
  year: 2010,
  rating: 7.4,
  runtime: 1,
  genres: ["Animation", "Short", "Fantasy"],
  description_fa:
    "تریلر رسمی فیلم کوتاه سینتل؛ داستان دوستی یک دختر و یک اژدها. ساختهٔ بنیاد بلندر و منتشرشده با مجوز Creative Commons Attribution 3.0.",
  poster: "/images/sintel.webp",
  backdrop: "/images/sintel.webp",
  director: "کالین لوی",
  source: "Blender Foundation",
  torrents: [],
};
export const demoSource: StreamSource = {
  url: "/videos/sintel-trailer.mp4",
  label: "تریلر سینتل • 480p",
  type: "mp4",
  license: "© Blender Foundation | durian.blender.org | CC BY 3.0",
  textTracks: [
    {
      url: "/captions/sintel.fa.vtt",
      language: "fa",
      label: "راهنمای نمونه · فارسی (نه ترجمهٔ گفتگو)",
    },
  ],
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(15000),
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response
    .json()
    .catch(() => ({ error: "پاسخ سرور قابل خواندن نیست." }));
  if (!response.ok) throw new Error(data.error || "ارتباط با سرور برقرار نشد.");
  return data as T;
}
export const progressStorageKey = (userId?: string) =>
  userId ? `progress:${userId}` : "progress";
export function bytes(value: number): string {
  if (!value) return "۰ B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${fa((value / 1024 ** index).toFixed(index > 1 ? 1 : 0))} ${units[index]}`;
}
