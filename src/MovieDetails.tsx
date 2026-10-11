import { useEffect, useState } from "react";
import {
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Info,
  Link,
  LoaderCircle,
  Play,
  Radio,
  Star,
} from "lucide-react";
import {
  createMagnet,
  displayTitle,
  fa,
  genreNames,
  getPoster,
  getStream,
  readStored,
  runtime,
  safeHttpUrl,
  store,
} from "./api";
import { CloseButton, Modal } from "./ui";
import type { Movie, PlayerState, StreamSource } from "./types";

type Tab = "about" | "download" | "stream";
export default function MovieDetails({
  movie,
  saved,
  onClose,
  onSave,
  onPlay,
  notify,
  onQueue,
}: {
  movie: Movie;
  saved: boolean;
  onClose: () => void;
  onSave: (m: Movie) => void;
  onPlay: (p: PlayerState) => void;
  notify: (text: string) => void;
  onQueue: (m: Movie, hash: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("about");
  const [quality, setQuality] = useState("1080p");
  const [source, setSource] = useState<StreamSource | null>(null);
  const [streamLoading, setStreamLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [captionUrl, setCaptionUrl] = useState("");
  const [captionLanguage, setCaptionLanguage] = useState("fa");
  useEffect(() => {
    let active = true;
    const own = readStored<Record<string, StreamSource>>("sources", {})[
      movie.imdb_code
    ];
    if (own) {
      setSource(own);
      setUrl(own.url);
      setCaptionUrl(own.textTracks?.[0]?.url || "");
      setCaptionLanguage(own.textTracks?.[0]?.language || "fa");
      setStreamLoading(false);
      return;
    }
    getStream(movie.imdb_code, movie.libraryId, movie.downloadGid).then((s) => {
      if (active) {
        setSource(s);
        setStreamLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [movie.imdb_code, movie.libraryId, movie.downloadGid]);
  const qualities = [
    ...new Set(movie.torrents?.map((t) => t.quality) || []),
  ].sort((a, b) => Number.parseInt(b) - Number.parseInt(a));
  const torrents = (movie.torrents || []).filter(
    (t) => t.quality === (qualities.includes(quality) ? quality : qualities[0]),
  );
  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify("مرورگر اجازهٔ کپی نمی‌دهد؛ لینک را مستقیم باز کن.");
    }
  }
  const saveSource = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = safeHttpUrl(url.trim());
    if (!parsed || !parsed.startsWith("https://")) {
      setUrlError("یک آدرس HTTPS معتبر برای MP4 یا M3U8 وارد کن.");
      return;
    }
    const caption = captionUrl.trim() ? safeHttpUrl(captionUrl.trim()) : null;
    if (captionUrl.trim() && (!caption || !caption.startsWith("https://"))) {
      setUrlError("زیرنویس باید یک آدرس HTTPS معتبر با محتوای WebVTT باشد.");
      return;
    }
    const next: StreamSource = {
      url: parsed,
      label: "منبع پخش شخصی",
      type: /\.m3u8(?:\?|$)/i.test(parsed) ? "hls" : "mp4",
      ...(caption
        ? {
            textTracks: [
              {
                url: caption,
                language: captionLanguage,
                label:
                  captionLanguage === "fa"
                    ? "فارسی · منبع شخصی"
                    : "English · Personal track",
              },
            ],
          }
        : {}),
    };
    const all = readStored<Record<string, StreamSource>>("sources", {});
    all[movie.imdb_code] = next;
    store("sources", all);
    setSource(next);
    setUrlError("");
    notify("منبع پخش روی این دستگاه ذخیره شد.");
  };
  return (
    <Modal className="detail-modal" titleId="detail-title" onClose={onClose}>
      <div className="detail-top">
        <img
          className="detail-backdrop"
          src={movie.backdrop || getPoster(movie)}
          alt=""
        />
        <div className="detail-backdrop-shade" />
        <CloseButton onClick={onClose} />
        <div className="detail-intro">
          <img
            className="detail-poster"
            src={getPoster(movie)}
            alt={`پوستر ${displayTitle(movie)}`}
          />
          <div className="detail-title-block">
            <span className="eyebrow">{movie.source || "YTS"} / MOVIE</span>
            <h2 id="detail-title">{displayTitle(movie)}</h2>
            <p className="detail-en" dir="ltr">
              {movie.title}
            </p>
            <div className="detail-meta">
              <span className="gold">
                <Star size={15} fill="currentColor" />
                {movie.rating.toFixed(1)}
              </span>
              <span>{fa(movie.year)}</span>
              <span>{runtime(movie.runtime)}</span>
            </div>
            <div className="detail-genres">
              {movie.genres.slice(0, 3).map((g) => (
                <span key={g}>{genreNames[g] || g}</span>
              ))}
            </div>
            <div className="detail-buttons">
              <button
                className="btn btn-primary"
                onClick={() =>
                  source
                    ? onPlay({ movie, mode: "stream", source })
                    : setTab("stream")
                }
              >
                <Play size={15} fill="currentColor" />
                پخش آنلاین
              </button>
              <button
                className={`icon-btn bordered ${saved ? "saved" : ""}`}
                onClick={() => onSave(movie)}
                aria-label={saved ? "حذف از فهرست من" : "افزودن به فهرست من"}
                aria-pressed={saved}
              >
                {saved ? <Check size={18} /> : <Bookmark size={18} />}
              </button>
              <button
                className="icon-btn bordered"
                aria-label="کپی لینک این فیلم"
                disabled={Boolean(movie.downloadGid)}
                title={
                  movie.downloadGid
                    ? "این فایل خصوصی است؛ از مرکز دانلود همان حساب دسترسی داری."
                    : "کپی لینک صفحهٔ این عنوان"
                }
                onClick={() =>
                  copy(
                    `${location.origin}/?${movie.libraryId ? `library=${encodeURIComponent(movie.libraryId)}` : `film=${movie.imdb_code}`}`,
                    "لینک صفحهٔ فیلم کپی شد.",
                  )
                }
              >
                <Link size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        className="detail-tabs"
        role="tablist"
        aria-label="اطلاعات فیلم"
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const tabs: Tab[] = ["about", "download", "stream"];
          const index = tabs.indexOf(tab);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? 2
                : (index + (e.key === "ArrowLeft" ? 1 : 2)) % 3;
          setTab(tabs[next]);
          document.getElementById(`tab-${tabs[next]}`)?.focus();
        }}
      >
        {(
          [
            { id: "about", name: "دربارهٔ فیلم", icon: <Info size={16} /> },
            { id: "download", name: "دانلود", icon: <Download size={16} /> },
            { id: "stream", name: "پخش آنلاین", icon: <Radio size={16} /> },
          ] as const
        ).map((t) => (
          <button
            id={`tab-${t.id}`}
            key={t.id}
            role="tab"
            tabIndex={tab === t.id ? 0 : -1}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.name}
            {t.id === "download" && (
              <small>{fa(movie.torrents?.length || 0)}</small>
            )}
          </button>
        ))}
      </div>
      <div
        className="detail-body"
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "about" && (
          <div className="about-panel">
            <h3>{movie.tagline || "داستان این فیلم"}</h3>
            <p className="synopsis" dir={movie.description_fa ? "rtl" : "auto"}>
              {movie.description_fa ||
                movie.description_full ||
                movie.summary ||
                "خلاصهٔ این فیلم در منبع ثبت نشده است."}
            </p>
            <div className="detail-facts">
              <div>
                <span>کارگردان</span>
                <strong>{movie.director || "در آرشیو ثبت نشده"}</strong>
              </div>
              <div>
                <span>ژانر</span>
                <strong>
                  {movie.genres
                    .slice(0, 2)
                    .map((g) => genreNames[g] || g)
                    .join("، ")}
                </strong>
              </div>
              <div>
                <span>زبان</span>
                <strong>زبان اصلی</strong>
              </div>
            </div>
            {movie.yt_trailer_code && (
              <button
                className="trailer-link"
                onClick={() => onPlay({ movie, mode: "trailer" })}
              >
                <span>
                  <Play size={18} fill="currentColor" />
                </span>
                <div>
                  <strong>قبل از تماشا، کمی کنجکاوی کن</strong>
                  <small>تماشای تریلر فیلم</small>
                </div>
                <ExternalLink size={17} />
              </button>
            )}
          </div>
        )}
        {tab === "download" && (
          <div className="download-panel">
            <div className="panel-title">
              <h3>کیفیت دلخواهت را انتخاب کن</h3>
              <span>منبع: {movie.source || "YTS"}</span>
            </div>
            {qualities.length > 0 ? (
              <>
                <div className="quality-tabs" dir="ltr">
                  {qualities.map((q) => (
                    <button
                      key={q}
                      className={
                        (qualities.includes(quality)
                          ? quality
                          : qualities[0]) === q
                          ? "active"
                          : ""
                      }
                      onClick={() => setQuality(q)}
                    >
                      {q === "2160p" ? "4K · 2160p" : q}
                    </button>
                  ))}
                </div>
                <div className="torrent-list">
                  {torrents.map((t) => (
                    <div className="torrent-row" key={t.hash}>
                      <div className="torrent-format">
                        <span className="file-icon">
                          <Download size={18} />
                        </span>
                        <div>
                          <strong dir="ltr">
                            {t.type.toUpperCase()} ·{" "}
                            {t.video_codec?.toUpperCase() || "X264"}
                          </strong>
                          <span dir="ltr">
                            {t.size} · {t.audio_channels || "2.0"} audio
                          </span>
                        </div>
                      </div>
                      <div className="torrent-actions">
                        <button
                          className="icon-btn"
                          title="کپی لینک مگنت"
                          aria-label={`کپی مگنت ${t.type} ${t.video_codec || ""}`}
                          onClick={() =>
                            copy(
                              createMagnet(movie, t.hash),
                              "لینک مگنت کپی شد.",
                            )
                          }
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          className="icon-btn queue-torrent"
                          aria-label={`دانلود ${t.quality} روی سرور`}
                          title="دانلود روی سرور با aria2"
                          onClick={() => onQueue(movie, t.hash)}
                        >
                          <Download size={17} />
                        </button>
                        <a
                          className="btn btn-secondary btn-sm"
                          href={createMagnet(movie, t.hash)}
                        >
                          مگنت
                          <Link size={14} />
                        </a>
                        {safeHttpUrl(t.url) && (
                          <a
                            className="btn btn-primary btn-sm"
                            href={safeHttpUrl(t.url)!}
                            target="_blank"
                            rel="noreferrer"
                          >
                            تورنت
                            <Download size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="inline-note">
                  <Info size={15} />
                  دانلودهای YTS تورنت هستند؛ برای باز کردن آن‌ها به یک کلاینت
                  مانند qBittorrent نیاز داری. فقط محتوایی را دانلود کن که
                  اجازهٔ استفاده از آن را داری.
                </p>
              </>
            ) : (
              <div className="compact-empty">
                <Download size={24} />
                <p>برای این عنوان، لینک دانلود تورنت ثبت نشده است.</p>
              </div>
            )}
          </div>
        )}
        {tab === "stream" && (
          <div className="stream-panel">
            {streamLoading ? (
              <div className="compact-empty">
                <LoaderCircle className="spin" size={25} />
                <p>بررسی منابع پخش…</p>
              </div>
            ) : source ? (
              <div className="source-ready">
                <span>
                  <CheckCircle2 size={23} />
                </span>
                <div>
                  <h3>همه‌چیز برای تماشا آماده است</h3>
                  <p>{source.label}</p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onPlay({ movie, mode: "stream", source })}
                >
                  <Play size={15} />
                  شروع پخش
                </button>
              </div>
            ) : (
              <div className="stream-notice">
                <Radio size={25} />
                <h3>منبع مستقیم این فیلم هنوز اضافه نشده</h3>
                <p>
                  {movie.libraryId
                    ? "پخش این عنوان نیاز به اتصال معتبر Jellyfin و فایل قابل‌پخش یا ترنسکد فعال دارد."
                    : "YTS لینک تورنت می‌دهد، نه ویدیوی قابل‌پخش در مرورگر. یک منبع مجاز MP4 یا HLS اضافه کن، یا تریلر فیلم را ببین."}
                </p>
                {movie.yt_trailer_code && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onPlay({ movie, mode: "trailer" })}
                  >
                    <Play size={14} />
                    تماشای تریلر
                  </button>
                )}
              </div>
            )}
            <form className="source-form" onSubmit={saveSource}>
              <label htmlFor="stream-url">
                {source ? "تغییر منبع پخش شخصی" : "منبع پخش شخصی"}
              </label>
              <div>
                <input
                  id="stream-url"
                  type="url"
                  dir="ltr"
                  placeholder="https://example.com/movie.m3u8"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlError("");
                  }}
                  required
                  aria-describedby="source-note"
                />
                <button className="btn btn-secondary btn-sm" type="submit">
                  ذخیره منبع
                </button>
              </div>
              <div className="caption-source">
                <label htmlFor="caption-url">زیرنویس اختیاری · WebVTT</label>
                <div>
                  <input
                    id="caption-url"
                    type="url"
                    dir="ltr"
                    value={captionUrl}
                    onChange={(e) => setCaptionUrl(e.target.value)}
                    placeholder="https://…/subtitles.vtt"
                  />
                  <select
                    aria-label="زبان زیرنویس شخصی"
                    value={captionLanguage}
                    onChange={(e) => setCaptionLanguage(e.target.value)}
                  >
                    <option value="fa">فارسی</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              {urlError && (
                <p className="error-text" role="alert">
                  {urlError}
                </p>
              )}
              <p id="source-note">
                فقط روی این دستگاه ذخیره می‌شود. منبع HLS باید دسترسی CORS را
                مجاز کند.
              </p>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}
