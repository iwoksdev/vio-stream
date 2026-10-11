import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  ArrowLeft,
  ArrowUpLeft,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Compass,
  Film,
  Flame,
  Home,
  Library,
  CloudDownload,
  LogIn,
  LogOut,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Play,
  Rocket,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  Theater,
  UserRound,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import Hero from "./Hero";
import MovieDetails from "./MovieDetails";
import Player from "./Player";
import AccountModal from "./AccountModal";
import LibraryPage, { ServiceBadge } from "./LibraryPage";
import DownloadsPage from "./DownloadsPage";
import DownloadConfirm from "./DownloadConfirm";
import { useAccount, useServices } from "./platform";
import {
  Brand,
  CloseButton,
  EmptyState,
  Modal,
  MovieCard,
  SectionTitle,
} from "./ui";
import {
  apiRequest,
  progressStorageKey,
  createMagnet,
  demoSource,
  displayTitle,
  fa,
  getMovies,
  getPoster,
  getStream,
  loadSeed,
  readStored,
  sintel,
  store,
} from "./api";
import type {
  DownloadDraft,
  FilterState,
  Movie,
  Page,
  PlayerState,
  Progress,
  StreamSource,
} from "./types";

const genres: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "All", label: "همهٔ فیلم‌ها", icon: LayoutGrid },
  { id: "Action", label: "اکشن", icon: Flame },
  { id: "Sci-Fi", label: "علمی‌تخیلی", icon: Rocket },
  { id: "Drama", label: "درام", icon: Theater },
  { id: "Adventure", label: "ماجراجویی", icon: Compass },
  { id: "Comedy", label: "کمدی", icon: Smile },
  { id: "Animation", label: "انیمیشن", icon: WandSparkles },
];
const defaultFilters: FilterState = { quality: "all", rating: 0, year: "all" };
const nav: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "خانه", icon: Home },
  { id: "explore", label: "کشف فیلم‌ها", icon: Compass },
  { id: "collections", label: "کالکشن‌ها", icon: Layers3 },
  { id: "library", label: "کتابخانه", icon: Library },
  { id: "downloads", label: "دانلودها", icon: CloudDownload },
  { id: "watchlist", label: "فهرست من", icon: Bookmark },
];

export default function App() {
  const account = useAccount(),
    services = useServices();
  const [downloadDraft, setDownloadDraft] = useState<DownloadDraft | null>(
    null,
  );
  const [downloadRefresh, setDownloadRefresh] = useState(0);
  const previousOwner = useRef<string | undefined>(undefined);
  const activeUser = useRef(account.user?.id);
  activeUser.current = account.user?.id;
  const [movies, setMovies] = useState<Movie[]>([]);
  const [seedLoading, setSeedLoading] = useState(true);
  const [seedError, setSeedError] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [genre, setGenre] = useState("All");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [filterDraft, setFilterDraft] = useState<FilterState>(defaultFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showCount, setShowCount] = useState(6);
  const [dataOwner, setDataOwner] = useState("guest");
  const [savedRecords, setSavedMovies] = useState<Movie[]>(() => {
    const v = readStored<Movie[]>("watchlist", []);
    return Array.isArray(v) ? v : [];
  });
  const [selected, setSelected] = useState<Movie | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [toast, setToast] = useState("");
  const [reduced, setReduced] = useState(() =>
    readStored<boolean>("reduced-motion", false),
  );
  const [progressRecords, setProgress] = useState<Record<string, Progress>>(
    () => readStored("progress", {}),
  );
  const [historyRecords, setHistoryMovies] = useState<Movie[]>(() =>
    readStored("history", []),
  );
  const [live, setLive] = useState(false);
  const [remote, setRemote] = useState<Movie[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remotePage, setRemotePage] = useState(1);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [remoteSource, setRemoteSource] = useState("");
  const [remoteError, setRemoteError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<HTMLElement>(null);
  const ownsData = dataOwner === (account.user?.id || "guest");
  const savedMovies = ownsData ? savedRecords : [];
  const progress = ownsData ? progressRecords : {};
  const historyMovies = ownsData ? historyRecords : [];
  const platformPage = page === "library" || page === "downloads";
  const savedIds = savedMovies.map((m) => m.imdb_code);
  const filterCount =
    (filters.quality !== "all" ? 1 : 0) +
    (filters.rating > 0 ? 1 : 0) +
    (filters.year !== "all" ? 1 : 0);

  useEffect(() => {
    if (account.loading) return;
    const owner = account.user?.id || "guest";
    if (
      previousOwner.current !== undefined &&
      previousOwner.current !== owner
    ) {
      setPlayer(null);
      setSelected(null);
      setDownloadDraft(null);
    }
    previousOwner.current = owner;
    if (!account.user) {
      setDataOwner("guest");
      setSavedMovies(readStored<Movie[]>("watchlist", []));
      setProgress(readStored("progress", {}));
      setHistoryMovies(readStored("history", []));
      return;
    }
    const userId = account.user.id,
      abort = new AbortController();
    setDataOwner(userId);
    setSavedMovies([]);
    setProgress({});
    setHistoryMovies([]);
    Promise.all([
      apiRequest<{ movies: Movie[] }>("/api/account/watchlist", {
        signal: abort.signal,
      }),
      apiRequest<{ progress: Record<string, Progress>; movies: Movie[] }>(
        "/api/account/progress",
        { signal: abort.signal },
      ),
    ])
      .then(([saved, history]) => {
        if (!abort.signal.aborted) {
          setSavedMovies(saved.movies);
          setProgress(history.progress);
          setHistoryMovies(history.movies || []);
          store(progressStorageKey(userId), history.progress);
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setToast(error.message);
      });
    return () => abort.abort();
  }, [account.loading, account.user?.id]);

  useEffect(() => {
    if (account.loading) return;
    const id = new URLSearchParams(location.search).get("library");
    if (!id || !/^[a-zA-Z0-9-]{8,64}$/.test(id)) return;
    if (!account.user) {
      account.setAuthOpen(true);
      return;
    }
    const abort = new AbortController();
    apiRequest<{ movie: Movie }>(
      `/api/library/items/${encodeURIComponent(id)}`,
      { signal: abort.signal },
    )
      .then((result) => {
        if (!abort.signal.aborted) setSelected(result.movie);
      })
      .catch((error) => {
        if (!abort.signal.aborted) setToast(error.message);
      });
    return () => abort.abort();
  }, [account.loading, account.user?.id]);

  function requestDownload(draft: DownloadDraft) {
    setSelected(null);
    setSettingsOpen(false);
    if (!account.user) {
      account.setAuthOpen(true);
      setToast("برای دانلود روی سرور، وارد حساب شو.");
      return;
    }
    if (!services.status?.downloads.available) {
      navigate("downloads");
      setToast("اتصال موتور دانلود را بررسی کن.");
      return;
    }
    setDownloadDraft(draft);
  }
  function updateProgress(key: string, value: Progress, movie: Movie) {
    setProgress((previous) => ({ ...previous, [key]: value }));
    setHistoryMovies((previous) => {
      const next = [
        movie,
        ...previous.filter((m) => m.imdb_code !== key),
      ].slice(0, 50);
      if (!account.user) store("history", next);
      return next;
    });
    if (account.user)
      void apiRequest("/api/account/progress", {
        method: "POST",
        body: JSON.stringify({
          key,
          time: value.time,
          duration: value.duration,
          movie,
        }),
      }).catch(() =>
        setToast(
          "سابقه فعلاً روی این دستگاه ذخیره شد؛ ارتباط سرور را بررسی کن.",
        ),
      );
  }

  async function init() {
    setSeedLoading(true);
    setSeedError(false);
    try {
      const all = await loadSeed();
      setMovies(all);
      const id = new URLSearchParams(location.search).get("film");
      if (id && /^tt\d{5,12}$/.test(id)) {
        const found = all.find((m) => m.imdb_code === id);
        if (found) setSelected(found);
        else if (id === sintel.imdb_code) setSelected(sintel);
        else {
          const data = await getMovies({ query_term: id, limit: "1" });
          if (data.movies[0]) setSelected(data.movies[0]);
        }
      }
    } catch {
      setSeedError(true);
    } finally {
      setSeedLoading(false);
    }
  }
  useEffect(() => {
    void init();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMobileSearch(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (e.key === "Escape") {
        setSearchFocused(false);
        setProfileOpen(false);
        setMobileSearch(false);
      }
    };
    const outside = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest(".search-container")) setSearchFocused(false);
      if (!el.closest(".profile-container")) setProfileOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("click", outside);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("click", outside);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!live || platformPage || page === "watchlist" || page === "collections")
      return;
    const abort = new AbortController();
    setRemoteLoading(true);
    setRemoteError("");
    setRemote([]);
    const t = setTimeout(() => {
      const params: Record<string, string> = {
        limit: "24",
        page: "1",
        sort_by:
          sort === "rating"
            ? "rating"
            : sort === "newest"
              ? "year"
              : "date_added",
        order_by: "desc",
      };
      if (query.trim()) params.query_term = query.trim();
      if (genre !== "All") params.genre = genre;
      if (filters.quality !== "all") params.quality = filters.quality;
      if (filters.rating) params.minimum_rating = String(filters.rating);
      getMovies(params, abort.signal)
        .then((data) => {
          setRemote(data.movies);
          setRemoteTotal(data.movie_count);
          setRemoteSource(data.source);
          setRemotePage(1);
          setShowCount(24);
        })
        .catch((e) => {
          if (!abort.signal.aborted) setRemoteError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setRemoteLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(t);
      abort.abort();
    };
  }, [live, query, genre, sort, filters, page]);

  const enrich = (m: Movie) => {
    const original = movies.find((s) => s.imdb_code === m.imdb_code);
    return original
      ? {
          ...m,
          title_fa: original.title_fa,
          poster: original.poster,
          backdrop: original.backdrop,
          description_fa: original.description_fa,
          director: original.director,
          tagline: original.tagline,
        }
      : m;
  };
  const filtered = useMemo(() => {
    const source =
      page === "watchlist" ? savedMovies : live ? remote.map(enrich) : movies;
    const q = query.trim().toLowerCase();
    let list = source.filter(
      (m) =>
        (!q ||
          (live && page !== "watchlist") ||
          [m.title, m.title_fa, m.imdb_code].some((s) =>
            s?.toLowerCase().includes(q),
          )) &&
        (genre === "All" || m.genres?.includes(genre)) &&
        (filters.quality === "all" ||
          m.torrents?.some((t) => t.quality === filters.quality)) &&
        m.rating >= filters.rating &&
        (filters.year === "all" ||
          (filters.year === "classic"
            ? m.year < 2020
            : m.year === Number(filters.year))),
    );
    if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sort === "newest") list = [...list].sort((a, b) => b.year - a.year);
    return list;
  }, [movies, savedMovies, remote, page, live, query, genre, filters, sort]);
  const quickResults = movies
    .filter((m) =>
      [m.title, m.title_fa, m.imdb_code].some((s) =>
        s?.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    )
    .slice(0, 4);
  const continuing = [
    ...historyMovies,
    ...movies,
    ...savedMovies,
    sintel,
  ].filter(
    (m, i, arr) =>
      arr.findIndex((x) => x.imdb_code === m.imdb_code) === i &&
      progress[m.imdb_code]?.time > 2 &&
      progress[m.imdb_code]?.time < progress[m.imdb_code]?.duration - 2,
  );

  function navigate(next: Page) {
    setPage(next);
    setProfileOpen(false);
    setSearchFocused(false);
    setMobileSearch(false);
    setShowCount(next === "home" ? 6 : 12);
    setQuery("");
    setGenre("All");
    setFilters(defaultFilters);
    setSort("recommended");
    setLive(false);
    window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
  }
  async function saveMovie(m: Movie) {
    const exists = savedIds.includes(m.imdb_code),
      previous = savedMovies;
    const next = exists
      ? savedMovies.filter((s) => s.imdb_code !== m.imdb_code)
      : [...savedMovies, m];
    setSavedMovies(next);
    if (account.user) {
      const userId = account.user.id;
      try {
        await apiRequest(
          exists
            ? `/api/account/watchlist/${encodeURIComponent(m.imdb_code)}`
            : "/api/account/watchlist",
          {
            method: exists ? "DELETE" : "POST",
            ...(!exists ? { body: JSON.stringify({ movie: m }) } : {}),
          },
        );
      } catch (error) {
        if (activeUser.current === userId) {
          setSavedMovies(previous);
          setToast(
            error instanceof Error
              ? error.message
              : "ذخیره روی سرور انجام نشد.",
          );
        }
        return;
      }
    } else store("watchlist", next);
    setToast(
      exists
        ? "از فهرست تماشای تو حذف شد."
        : account.user
          ? "در فهرست شخصی روی سرور ذخیره شد."
          : "برای یک شب سینمایی ذخیره شد.",
    );
  }
  function openMovie(m: Movie) {
    setSearchFocused(false);
    setMobileSearch(false);
    setSelected(m);
  }
  function play(p: PlayerState) {
    setSelected(null);
    setSettingsOpen(false);
    setPlayer(p);
  }
  function clearFilters() {
    setQuery("");
    setGenre("All");
    setFilters(defaultFilters);
    setLive(false);
    setShowCount(page === "home" ? 6 : 12);
  }
  function openFilters() {
    setFilterDraft({ ...filters });
    setFilterOpen(true);
  }
  function liveSearch() {
    setPage("explore");
    setLive(true);
    setSearchFocused(false);
    setMobileSearch(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function collectionFilter(g: string) {
    navigate("explore");
    setGenre(g);
  }
  function localSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchFocused(false);
    setMobileSearch(false);
    if (page === "collections") setPage("explore");
    setShowCount(12);
    setTimeout(
      () =>
        catalogRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50,
    );
  }
  async function loadMoreRemote() {
    setRemoteLoading(true);
    setRemoteError("");
    const params: Record<string, string> = {
      limit: "24",
      page: String(remotePage + 1),
      sort_by:
        sort === "rating"
          ? "rating"
          : sort === "newest"
            ? "year"
            : "date_added",
      order_by: "desc",
    };
    if (query.trim()) params.query_term = query.trim();
    if (genre !== "All") params.genre = genre;
    if (filters.quality !== "all") params.quality = filters.quality;
    if (filters.rating) params.minimum_rating = String(filters.rating);
    try {
      const data = await getMovies(params);
      setRemote((prev) => [
        ...prev,
        ...data.movies.filter(
          (m) => !prev.some((p) => p.imdb_code === m.imdb_code),
        ),
      ]);
      setRemotePage((p) => p + 1);
      setShowCount((c) => c + 24);
      setRemoteSource(data.source);
    } catch (e) {
      setRemoteError(e instanceof Error ? e.message : "ارتباط برقرار نشد.");
    } finally {
      setRemoteLoading(false);
    }
  }
  async function resume(m: Movie) {
    const own = readStored<Record<string, StreamSource>>("sources", {})[
      m.imdb_code
    ];
    const source =
      m.imdb_code === sintel.imdb_code
        ? demoSource
        : own || (await getStream(m.imdb_code, m.libraryId, m.downloadGid));
    source ? play({ movie: m, mode: "stream", source }) : openMovie(m);
  }
  const resultTitle =
    page === "watchlist"
      ? "شب‌های سینمایی بعدی تو"
      : query
        ? `نتیجهٔ جست‌وجوی «${query}»`
        : genre !== "All"
          ? `دنیای ${genres.find((g) => g.id === genre)?.label || genre}`
          : page === "explore"
            ? "داستان بعدی‌ات را پیدا کن"
            : "محبوب این روزها";
  const collections = [
    {
      id: "Sci-Fi",
      className: "collection-space",
      title: "فراتر از زمان",
      sub: "برای ذهن‌های کنجکاو",
      movie: movies.find((m) => m.imdb_code === "tt0816692"),
      number: "01",
    },
    {
      id: "Action",
      className: "collection-action",
      title: "یک نفس، تا آخر",
      sub: "هیجان، بدون دکمهٔ توقف",
      movie: movies.find((m) => m.imdb_code === "tt10366206"),
      number: "02",
    },
    {
      id: "Drama",
      className: "collection-art",
      title: "قاب‌های ماندگار",
      sub: "داستان‌هایی که با تو می‌مانند",
      movie: movies.find((m) => m.imdb_code === "tt2278388"),
      number: "03",
    },
  ];

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      <div className={`app ${reduced ? "reduce-motion" : ""}`}>
        <header className="site-header">
          <div className="header-inner container">
            <button
              className="brand-button"
              aria-label="ویو، صفحهٔ خانه"
              onClick={() => navigate("home")}
            >
              <Brand />
            </button>
            <nav className="desktop-nav" aria-label="منوی اصلی">
              {nav.map((n) => (
                <button
                  key={n.id}
                  className={page === n.id ? "active" : ""}
                  onClick={() => navigate(n.id)}
                >
                  {n.label}
                  {n.id === "watchlist" && savedMovies.length > 0 && (
                    <span>{fa(savedMovies.length)}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="header-tools">
              <form
                className={`search-container ${mobileSearch ? "mobile-open" : ""}`}
                onSubmit={localSearchSubmit}
              >
                <Search size={17} />
                <input
                  ref={searchRef}
                  aria-label="جست‌وجوی فیلم"
                  placeholder="فیلم بعدی‌ات را پیدا کن…"
                  value={query}
                  onFocus={() => setSearchFocused(true)}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowCount(12);
                    setSearchFocused(true);
                  }}
                />
                {query ? (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setQuery("")}
                    aria-label="پاک کردن جست‌وجو"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <kbd dir="ltr">⌘ K</kbd>
                )}
                <AnimatePresence>
                  {searchFocused && query.trim().length > 0 && (
                    <motion.div
                      className="search-popover"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                    >
                      <span className="popover-label">در کالکشن ویو</span>
                      {quickResults.length ? (
                        quickResults.map((m) => (
                          <button
                            type="button"
                            className="search-result"
                            key={m.id}
                            onClick={() => openMovie(m)}
                          >
                            <img src={getPoster(m)} alt="" />
                            <span>
                              <strong>{displayTitle(m)}</strong>
                              <small>
                                {fa(m.year)}
                                <i /> <Star size={10} />
                                {m.rating}
                              </small>
                            </span>
                            <ChevronLeft size={15} />
                          </button>
                        ))
                      ) : (
                        <p className="search-no-results">
                          در کالکشن منتخب پیدا نشد.
                        </p>
                      )}
                      <button
                        type="button"
                        className="search-all"
                        onClick={liveSearch}
                      >
                        جست‌وجو در آرشیو زندهٔ YTS
                        <ArrowUpLeft size={16} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
              <button
                className="icon-btn mobile-search-toggle"
                aria-label="نمایش جست‌وجو"
                onClick={() => {
                  setMobileSearch((v) => !v);
                  requestAnimationFrame(() => searchRef.current?.focus());
                }}
              >
                {mobileSearch ? <X size={20} /> : <Search size={20} />}
              </button>
              <button
                className="icon-btn settings-header"
                aria-label="دربارهٔ ویو و تنظیمات"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontal size={19} />
              </button>
              <span className="header-separator" />
              <div className="profile-container">
                <button
                  className="profile-button"
                  aria-label="منوی حساب کاربری"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((p) => !p)}
                >
                  <span className="avatar">
                    {account.user ? (
                      <span className="avatar-initial">
                        {Array.from(account.user.name)[0]}
                      </span>
                    ) : (
                      <UserRound size={19} />
                    )}
                    <i className={account.user ? "signed-in" : ""} />
                  </span>
                  <ChevronDown size={13} />
                </button>
                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      className="profile-popover"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                    >
                      <strong>
                        {account.user
                          ? `سلام، ${account.user.name}!`
                          : "سلام، فیلم‌باز!"}
                      </strong>
                      <span>
                        {account.user
                          ? "حساب شخصی · همگام با سرور"
                          : "مهمان · ذخیره روی این دستگاه"}
                      </span>
                      {!account.user && (
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            account.setAuthOpen(true);
                          }}
                        >
                          <LogIn size={16} />
                          ورود / ساخت حساب
                        </button>
                      )}
                      <button onClick={() => navigate("watchlist")}>
                        <Bookmark size={16} />
                        فهرست تماشای من<small>{fa(savedMovies.length)}</small>
                      </button>
                      <button onClick={() => navigate("library")}>
                        <Library size={16} />
                        کتابخانهٔ شخصی
                      </button>
                      <button onClick={() => navigate("downloads")}>
                        <CloudDownload size={16} />
                        مرکز دانلود
                      </button>
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          setSettingsOpen(true);
                        }}
                      >
                        <SlidersHorizontal size={16} />
                        تنظیمات و منابع
                      </button>
                      {account.user && (
                        <button
                          className="logout-button"
                          onClick={() => {
                            setProfileOpen(false);
                            void account
                              .logout()
                              .then(() =>
                                setToast(
                                  "از حساب خارج شدی؛ فهرست مهمان جداست.",
                                ),
                              )
                              .catch((e) => setToast(e.message));
                          }}
                        >
                          <LogOut size={16} />
                          خروج از حساب
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        <main>
          {page === "library" && (
            <LibraryPage
              onOpen={openMovie}
              onSave={saveMovie}
              onPlay={play}
              saved={savedIds}
            />
          )}
          {page === "downloads" && (
            <DownloadsPage
              onRequest={requestDownload}
              onPlay={play}
              notify={setToast}
              refreshKey={downloadRefresh}
            />
          )}
          {page === "home" && (
            <Hero
              movies={movies}
              saved={savedIds}
              onSave={saveMovie}
              onOpen={openMovie}
              onTrailer={(m) => play({ movie: m, mode: "trailer" })}
            />
          )}
          {page !== "home" && !platformPage && (
            <div className="browse-intro container">
              <span className="eyebrow">
                <Sparkles size={13} />
                دنیای فیلم، از نگاه تو
              </span>
              <h1>
                {page === "watchlist"
                  ? "فهرستی برای شب‌های خوب"
                  : page === "collections"
                    ? "برای هر حال‌وهوا، یک داستان"
                    : "کشف کن. انتخاب کن. غرق شو."}
              </h1>
              <p>
                {page === "watchlist"
                  ? "فیلم‌هایی که نشان کرده‌ای؛ آماده برای وقتی که فرصت یک داستان تازه را داری."
                  : page === "collections"
                    ? "چند جهان متفاوت، با فیلم‌هایی که با دقت کنار هم چیده‌ایم."
                    : "از یک فیلم محبوب تا یک کشف غیرمنتظره؛ انتخاب بعدی اینجاست."}
              </p>
            </div>
          )}
          {page !== "collections" && !platformPage && (
            <div className="container">
              <div className="genre-bar">
                <div className="genre-pills" aria-label="ژانر فیلم">
                  {genres.map((g) => (
                    <button
                      key={g.id}
                      className={`genre-pill ${genre === g.id ? "active" : ""}`}
                      aria-pressed={genre === g.id}
                      onClick={() => {
                        setGenre(g.id);
                        setShowCount(page === "home" ? 6 : 12);
                      }}
                    >
                      <g.icon size={15} />
                      {g.label}
                    </button>
                  ))}
                </div>
                <button
                  className={`filter-button ${filterCount ? "has-filter" : ""}`}
                  onClick={openFilters}
                >
                  <SlidersHorizontal size={16} />
                  <span>فیلترها</span>
                  {filterCount > 0 && <small>{fa(filterCount)}</small>}
                </button>
              </div>
              {page === "home" && continuing.length > 0 && (
                <section className="continue-section">
                  <SectionTitle title="داستانت هنوز ادامه دارد" />
                  <div className="continue-grid">
                    {continuing.map((m) => (
                      <button
                        className="continue-card"
                        key={m.imdb_code}
                        onClick={() => void resume(m)}
                      >
                        <img src={m.backdrop || getPoster(m)} alt="" />
                        <span className="continue-play">
                          <Play size={19} fill="currentColor" />
                        </span>
                        <div>
                          <strong>{displayTitle(m)}</strong>
                          <small>
                            {fa(
                              Math.max(
                                1,
                                Math.ceil(
                                  (progress[m.imdb_code].duration -
                                    progress[m.imdb_code].time) /
                                    60,
                                ),
                              ),
                            )}{" "}
                            دقیقه باقی‌مانده
                          </small>
                          <span className="progress-track">
                            <i
                              style={{
                                width: `${(progress[m.imdb_code].time / progress[m.imdb_code].duration) * 100}%`,
                              }}
                            />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className="catalog-section" ref={catalogRef}>
                <div className="catalog-top">
                  <SectionTitle
                    title={resultTitle}
                    subtitle={
                      page === "home" && !query && genre === "All"
                        ? "انتخاب‌های خوب، برای یک شب خوب"
                        : `${fa(filtered.length)} فیلم ${live ? "در این صفحهٔ آرشیو" : "در کالکشن تو"}`
                    }
                    action={page === "home" ? "مشاهده همه" : undefined}
                    onAction={() => navigate("explore")}
                  />
                </div>
                <div className="catalog-toolbar">
                  <div className="catalog-tabs">
                    <button
                      className={sort === "recommended" ? "active" : ""}
                      onClick={() => setSort("recommended")}
                    >
                      <Sparkles size={13} />
                      منتخب ویو
                    </button>
                    <button
                      className={sort === "newest" ? "active" : ""}
                      onClick={() => setSort("newest")}
                    >
                      تازه‌ترها
                    </button>
                    <button
                      className={sort === "rating" ? "active" : ""}
                      onClick={() => setSort("rating")}
                    >
                      بالاترین امتیاز
                    </button>
                  </div>
                  <div className="catalog-status">
                    {live ? (
                      <>
                        <span
                          className={
                            remoteSource === "live"
                              ? "status-dot"
                              : "status-dot cached"
                          }
                        />
                        {remoteLoading
                          ? "در حال دریافت…"
                          : remoteSource === "live"
                            ? "آرشیو زندهٔ YTS"
                            : "کش محلی YTS"}
                        <button
                          onClick={() => setLive(false)}
                          aria-label="بازگشت به کالکشن منتخب"
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="status-dot" />
                        با کیفیت انتخاب کن
                      </>
                    )}
                  </div>
                </div>
                {filterCount > 0 && (
                  <div className="active-filters">
                    {filters.quality !== "all" && (
                      <span dir="ltr">
                        {filters.quality === "2160p" ? "4K" : filters.quality}
                      </span>
                    )}
                    {filters.rating > 0 && (
                      <span>امتیاز {fa(filters.rating)}+</span>
                    )}
                    {filters.year !== "all" && (
                      <span>
                        {filters.year === "classic"
                          ? "پیش از ۲۰۲۰"
                          : fa(filters.year)}
                      </span>
                    )}
                    <button onClick={() => setFilters(defaultFilters)}>
                      حذف فیلترها
                      <X size={12} />
                    </button>
                  </div>
                )}
                {seedError && !live ? (
                  <EmptyState
                    title="کاتالوگ بارگذاری نشد"
                    text="ارتباط را بررسی کن و دوباره تلاش کن."
                    action="تلاش دوباره"
                    onAction={() => void init()}
                  />
                ) : remoteError ? (
                  <EmptyState
                    title="آرشیو فعلاً در دسترس نیست"
                    text={remoteError}
                    action="دیدن کالکشن منتخب"
                    onAction={() => setLive(false)}
                  />
                ) : seedLoading || (remoteLoading && remote.length === 0) ? (
                  <div className="movie-grid">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div className="card-skeleton" key={i}>
                        <div className="skeleton" />
                        <span className="skeleton" />
                        <small className="skeleton" />
                      </div>
                    ))}
                  </div>
                ) : filtered.length ? (
                  <div className="movie-grid">
                    <AnimatePresence mode="popLayout">
                      {filtered
                        .slice(0, page === "watchlist" ? 100 : showCount)
                        .map((m, i) => (
                          <MovieCard
                            key={m.imdb_code}
                            movie={m}
                            index={i}
                            saved={savedIds.includes(m.imdb_code)}
                            onSave={saveMovie}
                            onOpen={openMovie}
                          />
                        ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <EmptyState
                    title={
                      page === "watchlist" && !savedMovies.length
                        ? "فهرست تو هنوز یک صفحهٔ سفید است"
                        : "این ترکیب، فیلمی پیدا نکرد"
                    }
                    text={
                      page === "watchlist" && !savedMovies.length
                        ? "روی نشان ذخیرهٔ هر فیلم بزن تا برای شب‌های بعدی اینجا نگهش داریم."
                        : "عبارت جست‌وجو یا فیلترها را تغییر بده؛ شاید داستان بعدی یک کلیک آن‌طرف‌تر باشد."
                    }
                    action={
                      page === "watchlist" && !savedMovies.length
                        ? "کشف فیلم‌ها"
                        : "پاک کردن فیلترها"
                    }
                    onAction={() =>
                      page === "watchlist" && !savedMovies.length
                        ? navigate("explore")
                        : clearFilters()
                    }
                  />
                )}
                {!seedLoading && page !== "watchlist" && (
                  <div className="catalog-bottom">
                    {filtered.length > showCount ? (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setShowCount((c) => c + 12)}
                      >
                        فیلم‌های بیشتر
                        <ChevronDown size={16} />
                      </button>
                    ) : live &&
                      remote.length < remoteTotal &&
                      remote.length > 0 ? (
                      <button
                        className="btn btn-secondary"
                        disabled={remoteLoading}
                        onClick={() => void loadMoreRemote()}
                      >
                        {remoteLoading ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                        فیلم‌های بیشتر
                      </button>
                    ) : page === "explore" && !live ? (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setLive(true)}
                      >
                        <Layers3 size={16} />
                        کشف بیشتر در آرشیو YTS
                        <ArrowUpLeft size={16} />
                      </button>
                    ) : null}
                  </div>
                )}
              </section>
            </div>
          )}

          {(page === "home" || page === "collections") && (
            <section className="collections-section container">
              <SectionTitle
                title={
                  page === "home" ? "با حال‌وهوای تو" : "کالکشن‌های منتخب ویو"
                }
                subtitle="گاهی انتخاب یک حال‌وهوا، از انتخاب یک فیلم راحت‌تر است."
                action={page === "home" ? "همهٔ کالکشن‌ها" : undefined}
                onAction={() => navigate("collections")}
              />
              <div className="collections-grid">
                {collections.map((c) => (
                  <button
                    className={`collection-card ${c.className}`}
                    key={c.id}
                    onClick={() => collectionFilter(c.id)}
                  >
                    {c.movie && (
                      <img
                        src={
                          c.movie.backdrop && c.id !== "Drama"
                            ? c.movie.backdrop
                            : getPoster(c.movie)
                        }
                        alt=""
                      />
                    )}
                    <span className="collection-shade" />
                    <span className="collection-number" dir="ltr">
                      COLLECTION / {c.number}
                    </span>
                    <span className="collection-arrow">
                      <ArrowUpLeft size={19} />
                    </span>
                    <div className="collection-copy">
                      <span>{c.sub}</span>
                      <h3>{c.title}</h3>
                      <small>
                        {fa(
                          movies.filter((m) => m.genres.includes(c.id)).length,
                        )}{" "}
                        فیلم منتخب
                        <ArrowLeft size={14} />
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {page !== "watchlist" && !platformPage && (
            <section className="sample-section container">
              <div className="sample-card">
                <img
                  src="/images/sintel.webp"
                  className="sample-art"
                  alt="سینتل، فیلم کوتاه بنیاد بلندر"
                />
                <div className="sample-shade" />
                <div className="sample-copy">
                  <span className="eyebrow">
                    <span className="live-dot" />
                    چراغ‌ها خاموش، داستان روشن
                  </span>
                  <h2>یک سینمای کوچک، هر جا که تو هستی.</h2>
                  <p>
                    با تریلر آزاد «سینتل»، تجربهٔ پخش آنلاین ویو را امتحان کن.
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      play({
                        movie: sintel,
                        mode: "stream",
                        source: demoSource,
                      })
                    }
                  >
                    <Play size={16} fill="currentColor" />
                    تجربهٔ پخش آنلاین
                  </button>
                  <span className="sample-credit">
                    <ShieldCheck size={13} />
                    اثر آزاد بنیاد بلندر · CC BY 3.0
                  </span>
                </div>
                <span className="sample-watermark" dir="ltr">
                  SINTEL<span>A BLENDER OPEN MOVIE</span>
                </span>
              </div>
            </section>
          )}
        </main>

        <footer className="site-footer container">
          <div className="footer-top">
            <div>
              <button className="brand-button" onClick={() => navigate("home")}>
                <Brand small />
              </button>
              <p>دنیای فیلم، از نگاه تو.</p>
            </div>
            <div className="footer-links">
              <button onClick={() => setSettingsOpen(true)}>دربارهٔ ویو</button>
              <button
                onClick={() => {
                  navigate("explore");
                  setLive(true);
                }}
              >
                آرشیو YTS
              </button>
              <button onClick={() => navigate("watchlist")}>فهرست من</button>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                بازگشت به بالا
                <ArrowUpLeft size={14} />
              </button>
            </div>
            <span className="footer-tag">
              <Film size={15} />
              برای عاشقان داستان
            </span>
          </div>
          <div className="footer-bottom">
            <span>
              VIO © {fa(new Date().getFullYear())}
              <i />
              یک تجربهٔ مستقل سینمایی
            </span>
            <p>
              فقط منابعی را پخش یا دانلود کن که اجازهٔ استفاده از آن‌ها را داری.
            </p>
            <span dir="ltr">
              MADE FOR MOVIE NIGHTS<span className="tiny-star">✦</span>
            </span>
          </div>
        </footer>
        <nav className="mobile-nav" aria-label="منوی موبایل">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={page === n.id ? "active" : ""}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        <AnimatePresence>
          {account.authOpen && <AccountModal key="account" notify={setToast} />}
          {downloadDraft && (
            <DownloadConfirm
              key="download-confirm"
              draft={downloadDraft}
              onClose={() => setDownloadDraft(null)}
              onCreated={() => {
                setDownloadDraft(null);
                setDownloadRefresh((n) => n + 1);
                navigate("downloads");
                setToast("به صف واقعی aria2 اضافه شد.");
              }}
            />
          )}
          {selected && (
            <MovieDetails
              key={`detail-${selected.imdb_code}`}
              movie={selected}
              saved={savedIds.includes(selected.imdb_code)}
              onClose={() => setSelected(null)}
              onSave={saveMovie}
              onPlay={play}
              notify={setToast}
              onQueue={(movie, hash) =>
                requestDownload({
                  url: createMagnet(movie, hash),
                  title: displayTitle(movie),
                  movie,
                })
              }
            />
          )}
          {player && (
            <Player
              key={`player-${player.movie.imdb_code}`}
              player={player}
              onClose={() => setPlayer(null)}
              onProgress={updateProgress}
            />
          )}
          {filterOpen && (
            <Modal
              key="filters"
              className="compact-modal"
              titleId="filters-title"
              onClose={() => setFilterOpen(false)}
            >
              <CloseButton onClick={() => setFilterOpen(false)} />
              <span className="eyebrow">
                <SlidersHorizontal size={14} />
                انتخاب شخصی تو
              </span>
              <h2 id="filters-title">کمی دقیق‌تر انتخاب کنیم</h2>
              <p className="modal-subtitle">
                کیفیت، سال و امتیاز را به سلیقهٔ خودت تنظیم کن.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setFilters(filterDraft);
                  setShowCount(12);
                  setFilterOpen(false);
                }}
              >
                <div className="filter-form-grid">
                  <label>
                    کیفیت تصویر
                    <select
                      value={filterDraft.quality}
                      onChange={(e) =>
                        setFilterDraft({
                          ...filterDraft,
                          quality: e.target.value,
                        })
                      }
                    >
                      <option value="all">همهٔ کیفیت‌ها</option>
                      <option value="2160p">4K UHD</option>
                      <option value="1080p">Full HD · 1080p</option>
                      <option value="720p">HD · 720p</option>
                    </select>
                  </label>
                  <label>
                    سال انتشار
                    <select
                      value={filterDraft.year}
                      onChange={(e) =>
                        setFilterDraft({ ...filterDraft, year: e.target.value })
                      }
                    >
                      <option value="all">همهٔ سال‌ها</option>
                      {[2026, 2025, 2024, 2023, 2022].map((y) => (
                        <option key={y} value={y}>
                          {fa(y)}
                        </option>
                      ))}
                      <option value="classic">پیش از ۲۰۲۰</option>
                    </select>
                  </label>
                </div>
                <label className="rating-label">
                  حداقل امتیاز IMDb
                  <strong>
                    {filterDraft.rating
                      ? `${fa(filterDraft.rating)} و بالاتر`
                      : "همهٔ امتیازها"}
                  </strong>
                  <input
                    type="range"
                    min="0"
                    max="9"
                    step="1"
                    value={filterDraft.rating}
                    onChange={(e) =>
                      setFilterDraft({
                        ...filterDraft,
                        rating: Number(e.target.value),
                      })
                    }
                  />
                  <span className="range-labels">
                    <span>۰</span>
                    <span>۹</span>
                  </span>
                </label>
                <div className="filter-form-bottom">
                  <button className="btn btn-primary" type="submit">
                    دیدن فیلم‌ها
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => setFilterDraft(defaultFilters)}
                  >
                    بازنشانی
                  </button>
                </div>
              </form>
            </Modal>
          )}
          {settingsOpen && (
            <Modal
              key="settings"
              className="settings-modal compact-modal"
              titleId="settings-title"
              onClose={() => setSettingsOpen(false)}
            >
              <CloseButton onClick={() => setSettingsOpen(false)} />
              <Brand small />
              <h2 id="settings-title">سینما، به سبک تو.</h2>
              <p className="modal-subtitle">
                ویو حالا سینمای شخصی توست؛ با پلیر حرفه‌ای، حساب واقعی و اتصال
                به کتابخانه و موتور دانلود روی سرورت.
              </p>
              <div className="settings-list">
                <div>
                  <span>
                    <Layers3 size={18} />
                    کاتالوگ فیلم‌ها
                  </span>
                  <strong>YTS API + کش محلی</strong>
                </div>
                <div>
                  <span>
                    <Play size={18} />
                    پخش در مرورگر
                  </span>
                  <strong dir="ltr">Video.js 10 · MP4 / HLS</strong>
                </div>
                <div>
                  <span>
                    <Bookmark size={18} />
                    فهرست و سابقهٔ تماشا
                  </span>
                  <strong>
                    {account.user
                      ? "حساب شخصی روی سرور"
                      : "مهمان · روی این دستگاه"}
                  </strong>
                </div>
                <div>
                  <span>
                    <Library size={18} />
                    کتابخانهٔ رسانه
                  </span>
                  <ServiceBadge
                    name="Jellyfin"
                    available={services.status?.library.available}
                    configured={services.status?.library.configured}
                  />
                </div>
                <div>
                  <span>
                    <CloudDownload size={18} />
                    موتور دانلود
                  </span>
                  <ServiceBadge
                    name="aria2"
                    available={services.status?.downloads.available}
                    configured={services.status?.downloads.configured}
                  />
                </div>
                <label>
                  <span>
                    <Sparkles size={18} />
                    کاهش انیمیشن‌ها
                  </span>
                  <input
                    className="switch"
                    type="checkbox"
                    checked={reduced}
                    onChange={(e) => {
                      setReduced(e.target.checked);
                      store("reduced-motion", e.target.checked);
                    }}
                  />
                </label>
              </div>
              <p className="inline-note">
                <ShieldCheck size={16} />
                تورنت‌های YTS منبع استریم مستقیم نیستند. برای فیلم‌های دیگر،
                منبع مجاز خودت را در تب «پخش آنلاین» اضافه کن.
              </p>
              <button
                className="btn btn-primary"
                onClick={() =>
                  play({ movie: sintel, mode: "stream", source: demoSource })
                }
              >
                <Play size={15} />
                تست پخش با تریلر آزاد سینتل
              </button>
              <p className="settings-credit">
                <a
                  href="https://durian.blender.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Sintel © Blender Foundation
                </a>{" "}
                ·{" "}
                <a
                  href="https://creativecommons.org/licenses/by/3.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 3.0
                </a>
              </p>
            </Modal>
          )}
          {toast && (
            <motion.div
              key="toast"
              className="toast"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <CheckCircle2 size={19} />
              {toast}
              <button onClick={() => setToast("")} aria-label="بستن پیام">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
