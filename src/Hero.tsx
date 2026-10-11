import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpLeft,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { displayTitle, fa, getPoster, runtime } from "./api";
import type { Movie } from "./types";

export default function Hero({
  movies,
  saved,
  onSave,
  onOpen,
  onTrailer,
}: {
  movies: Movie[];
  saved: string[];
  onSave: (m: Movie) => void;
  onOpen: (m: Movie) => void;
  onTrailer: (m: Movie) => void;
}) {
  const features = ["tt15239678", "tt0816692", "tt15398776"]
    .map((id) => movies.find((m) => m.imdb_code === id))
    .filter(Boolean) as Movie[];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const movie = features[index] || features[0];
  useEffect(() => {
    if (
      paused ||
      hovered ||
      features.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % features.length),
      12000,
    );
    return () => clearInterval(timer);
  }, [paused, hovered, features.length]);
  if (!movie) return <div className="hero-skeleton skeleton" />;
  const isDune = movie.imdb_code === "tt15239678";
  return (
    <section
      className="hero"
      aria-label="فیلم‌های ویژه"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <AnimatePresence initial={false}>
        <motion.img
          className="hero-image"
          key={movie.imdb_code}
          src={movie.backdrop || getPoster(movie)}
          alt=""
          initial={{ opacity: 0, scale: 1.025 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.15, ease: "easeInOut" }}
        />
      </AnimatePresence>
      <div className="hero-gradient" />
      <div className="hero-bottom-gradient" />
      <div className="hero-inner container">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="hero-content"
            key={movie.imdb_code}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="hero-eyebrow">
              <span>
                <Sparkles size={13} />
                انتخاب ویژهٔ ویو
              </span>
              <i /> یک تجربهٔ سینمایی متفاوت
            </div>
            {isDune ? (
              <div
                className="dune-wordmark"
                dir="ltr"
                aria-label="Dune Part Two"
              >
                <span>DUNE</span>
                <small>PART TWO</small>
              </div>
            ) : (
              <div className="hero-wordmark" dir="ltr">
                {movie.title}
              </div>
            )}
            <h1>{displayTitle(movie)}</h1>
            <div className="hero-meta">
              <span className="imdb-score" dir="ltr">
                <b>IMDb</b>
                <strong>{movie.rating.toFixed(1)}</strong>
              </span>
              <span className="meta-dot" />
              <span>{fa(movie.year)}</span>
              <span className="meta-dot" />
              <span>{runtime(movie.runtime)}</span>
              <span className="hero-quality">4K UHD</span>
            </div>
            <p className="hero-description">{movie.description_fa}</p>
            <div className="hero-actions">
              <button
                className="btn btn-primary"
                onClick={() => onTrailer(movie)}
              >
                <Play size={17} fill="currentColor" />
                تماشای تریلر
              </button>
              <button className="btn btn-glass" onClick={() => onOpen(movie)}>
                جزئیات و دانلود
                <ArrowUpLeft size={17} />
              </button>
              <button
                className={`btn hero-save ${saved.includes(movie.imdb_code) ? "saved" : ""}`}
                onClick={() => onSave(movie)}
                aria-label={
                  saved.includes(movie.imdb_code)
                    ? "حذف از فهرست من"
                    : "افزودن به فهرست من"
                }
                aria-pressed={saved.includes(movie.imdb_code)}
              >
                {saved.includes(movie.imdb_code) ? (
                  <Check size={19} />
                ) : (
                  <Bookmark size={19} />
                )}
              </button>
            </div>
            <div className="hero-small-note">
              <span />
              داستان بعدی تو، از همین‌جا شروع می‌شود.
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="hero-slider" dir="ltr">
          <div className="slide-thumbnails">
            {features.map((m, i) => (
              <button
                key={m.id}
                className={`slide-thumbnail ${index === i ? "active" : ""}`}
                aria-label={`نمایش ${displayTitle(m)}`}
                aria-pressed={index === i}
                onClick={() => setIndex(i)}
              >
                <img src={m.backdrop || getPoster(m)} alt="" />
                <span>{String(i + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
          <div className="slider-controls">
            <button
              className="icon-btn"
              onClick={() =>
                setIndex((i) => (i + features.length - 1) % features.length)
              }
              aria-label="فیلم ویژهٔ قبلی"
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <i /> {String(features.length).padStart(2, "0")}
            </span>
            <button
              className="icon-btn"
              onClick={() => setIndex((i) => (i + 1) % features.length)}
              aria-label="فیلم ویژهٔ بعدی"
            >
              <ChevronRight size={17} />
            </button>
            <button
              className="slider-pause"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "ادامهٔ نمایش خودکار" : "توقف نمایش خودکار"}
            >
              {paused ? <Play size={12} /> : <Pause size={12} />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
