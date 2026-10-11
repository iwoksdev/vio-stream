import { useEffect, useState } from "react";
import {
  ArrowUpLeft,
  BookOpen,
  Cloud,
  Film,
  Library,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { apiRequest, demoSource, fa, sintel } from "./api";
import { useAccount, useServices } from "./platform";
import { EmptyState, MovieCard, SectionTitle } from "./ui";
import type { Movie, PlayerState } from "./types";

export function ServiceBadge({
  name,
  available,
  configured,
}: {
  name: string;
  available?: boolean;
  configured?: boolean;
}) {
  return (
    <span className={`service-badge ${available ? "ready" : ""}`}>
      <i />
      {name}
      <small>
        {available ? "متصل" : configured ? "در دسترس نیست" : "نیاز به تنظیم"}
      </small>
    </span>
  );
}
export function ConnectionPanel({ kind }: { kind: "library" | "downloads" }) {
  const services = useServices();
  const health = services.status?.[kind];
  return (
    <div className="connection-panel">
      <span className="connection-icon">
        {health?.configured ? <WifiOff size={29} /> : <Server size={29} />}
      </span>
      <h3>
        {health?.configured
          ? "ارتباط با سرویس برقرار نشد"
          : kind === "library"
            ? "کتابخانهٔ خودت را متصل کن"
            : "موتور دانلود را فعال کن"}
      </h3>
      <p>
        {kind === "library"
          ? "Jellyfin فایل‌های مجاز روی سرورت را دسته‌بندی و برای مرورگر آمادهٔ پخش می‌کند."
          : "aria2 دانلودها را روی سرور اجرا می‌کند؛ حتی وقتی این صفحه بسته است."}
      </p>
      <div className="config-keys" dir="ltr">
        {kind === "library" ? (
          <>
            <code>JELLYFIN_URL</code>
            <code>JELLYFIN_API_KEY</code>
          </>
        ) : (
          <>
            <code>ARIA2_RPC_URL</code>
            <code>ARIA2_RPC_SECRET</code>
          </>
        )}
      </div>
      <span className="connection-note">
        <BookOpen size={14} /> تنظیمات در فایل .env سرور · راهنمای کامل در
        DEPLOY.md
      </span>
      <button
        className="btn btn-secondary btn-sm"
        disabled={services.loading}
        onClick={() => void services.refresh()}
      >
        <RefreshCw className={services.loading ? "spin" : ""} size={15} />
        بررسی دوبارهٔ اتصال
      </button>
      {services.error && (
        <p className="form-error" role="alert">
          {services.error}
        </p>
      )}
    </div>
  );
}
export default function LibraryPage({
  onOpen,
  onSave,
  onPlay,
  saved,
}: {
  onOpen: (m: Movie) => void;
  onSave: (m: Movie) => void;
  onPlay: (p: PlayerState) => void;
  saved: string[];
}) {
  const account = useAccount(),
    services = useServices();
  const [items, setItems] = useState<Movie[]>([]),
    [total, setTotal] = useState(0),
    [search, setSearch] = useState(""),
    [type, setType] = useState("Movie"),
    [start, setStart] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!account.user || !services.status?.library.available) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () => {
        setBusy(true);
        setError("");
        apiRequest<{ movies: Movie[]; total: number }>(
          `/api/library?${new URLSearchParams({ search, type, start: String(start), limit: "24" })}`,
          { signal: abort.signal },
        )
          .then((data) => {
            setItems((previous) =>
              start ? [...previous, ...data.movies] : data.movies,
            );
            setTotal(data.total);
          })
          .catch((e) => {
            if (!abort.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!abort.signal.aborted) setBusy(false);
          });
      },
      search ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [
    account.user?.id,
    services.status?.library.available,
    search,
    type,
    start,
    refresh,
  ]);
  const ready = services.status?.library.available;
  return (
    <section className="platform-page container library-page">
      <div className="platform-intro">
        <div>
          <span className="eyebrow">
            <Library size={14} /> کتابخانهٔ شخصی
          </span>
          <h1>همهٔ داستان‌ها، زیر یک سقف.</h1>
          <p>فیلم‌ها و سریال‌های روی سرورت؛ مرتب، شخصی و آمادهٔ تماشا.</p>
        </div>
        <ServiceBadge
          name="Jellyfin"
          available={ready}
          configured={services.status?.library.configured}
        />
      </div>
      <div className="platform-summary">
        <div>
          <span className="summary-icon">
            <Film size={20} />
          </span>
          <span>
            <small>عنوان‌های کتابخانه</small>
            <strong>{ready && account.user ? fa(total) : "—"}</strong>
          </span>
        </div>
        <div>
          <span className="summary-icon">
            <Cloud size={20} />
          </span>
          <span>
            <small>محل نگهداری رسانه</small>
            <strong>سرور خودت</strong>
          </span>
        </div>
        <div>
          <span className="summary-icon">
            <ShieldCheck size={20} />
          </span>
          <span>
            <small>مسیر پخش</small>
            <strong>مستقیم یا HLS</strong>
          </span>
        </div>
      </div>
      {!ready ? (
        <ConnectionPanel kind="library" />
      ) : !account.user ? (
        <div className="platform-empty">
          <Cloud size={31} />
          <h3>کتابخانهٔ تو، پشت یک ورود ساده.</h3>
          <p>برای دسترسی به رسانه‌های سرور وارد حساب ویو شو.</p>
          <button
            className="btn btn-primary"
            onClick={() => account.setAuthOpen(true)}
          >
            ورود به حساب
            <ArrowUpLeft size={15} />
          </button>
        </div>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="account-segment">
              <button
                className={type === "Movie" ? "active" : ""}
                onClick={() => {
                  setType("Movie");
                  setStart(0);
                }}
              >
                فیلم‌ها
              </button>
              <button
                className={type === "Episode" ? "active" : ""}
                onClick={() => {
                  setType("Episode");
                  setStart(0);
                }}
              >
                قسمت‌های سریال
              </button>
            </div>
            <div className="library-search">
              <Search size={17} />
              <input
                aria-label="جست‌وجو در کتابخانه"
                placeholder="در کتابخانهٔ خودت جست‌وجو کن…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setStart(0);
                }}
              />
            </div>
            <button
              className="icon-btn"
              aria-label="تازه‌سازی کتابخانه"
              disabled={busy}
              onClick={() => {
                setStart(0);
                setRefresh((n) => n + 1);
              }}
            >
              <RefreshCw className={busy ? "spin" : ""} size={18} />
            </button>
          </div>
          {error && (
            <p className="platform-error" role="alert">
              {error}
            </p>
          )}
          {busy && !items.length ? (
            <div className="platform-empty">
              <LoaderCircle className="spin" size={30} />
              <p>دریافت کتابخانه از سرور…</p>
            </div>
          ) : items.length ? (
            <div className="movie-grid">
              {items.map((movie, index) => (
                <MovieCard
                  index={index}
                  key={movie.libraryId}
                  movie={movie}
                  saved={saved.includes(movie.imdb_code)}
                  onOpen={onOpen}
                  onSave={onSave}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                search ? "چیزی با این نام پیدا نشد" : "هنوز داستانی اینجا نیست"
              }
              text={
                search
                  ? "با یک نام دیگر جست‌وجو کن."
                  : "مسیر رسانه‌های خودت را در پنل Jellyfin به یک کتابخانه اضافه کن."
              }
              action="تازه‌سازی"
              onAction={() => setRefresh((n) => n + 1)}
            />
          )}
          {items.length < total && (
            <div className="load-more">
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setStart(items.length)}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Library size={17} />
                )}
                عنوان‌های بیشتر
              </button>
            </div>
          )}
        </>
      )}
      <div className="library-demo">
        <SectionTitle
          title="از یک داستان کوچک شروع کن"
          subtitle="نمونهٔ آزاد؛ مستقل از اتصال کتابخانه"
        />
        <div>
          <img src="/images/sintel.webp" alt="تریلر سینتل" />
          <span>
            <strong>
              سینتل <small dir="ltr">SINTEL · 2010</small>
            </strong>
            <p>تریلر رسمی بنیاد بلندر · ۵۲ ثانیه · CC BY 3.0</p>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                onPlay({ movie: sintel, mode: "stream", source: demoSource })
              }
            >
              <Play size={14} fill="currentColor" /> امتحان پلیر جدید
            </button>
          </span>
          <span className="demo-tag">رسانهٔ آزاد</span>
        </div>
      </div>
    </section>
  );
}
