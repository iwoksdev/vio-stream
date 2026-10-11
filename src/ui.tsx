import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Bookmark,
  Check,
  ChevronLeft,
  Film,
  SearchX,
  Star,
  X,
} from "lucide-react";
import type { Movie } from "./types";
import { displayTitle, fa, genreNames, getPoster } from "./api";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`} dir="ltr">
      <svg
        width="34"
        height="38"
        viewBox="0 0 36 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 6v28"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".45"
        />
        <path d="M13 4.5v31L33 20 13 4.5Z" fill="currentColor" />
      </svg>
      <span>
        VIO<span className="brand-dot">.</span>
      </span>
    </span>
  );
}

export function Modal({
  children,
  onClose,
  className = "",
  titleId = "modal-title",
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  titleId?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      box.current
        ?.querySelector<HTMLElement>("button, input, a[href], select")
        ?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        latestClose.current();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const elements = [
        ...box.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select, textarea, video, iframe, [tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length > 0);
      const first = elements[0],
        last = elements.at(-1);
      if (!first) {
        e.preventDefault();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === box.current)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.23 }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal ${className}`}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="icon-btn modal-close"
      aria-label="بستن پنجره"
      onClick={onClick}
    >
      <X size={20} />
    </button>
  );
}
export function SectionTitle({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-heading">
      <div className="section-heading-copy">
        <span className="heading-line" />
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {action && (
        <button className="text-link" onClick={onAction}>
          {action}
          <ChevronLeft size={17} />
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <span>
        <SearchX size={30} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="btn btn-secondary" onClick={onAction}>
        {action}
        <ChevronLeft size={16} />
      </button>
    </div>
  );
}
export function MovieCard({
  movie,
  index,
  saved,
  onSave,
  onOpen,
}: {
  movie: Movie;
  index: number;
  saved: boolean;
  onSave: (m: Movie) => void;
  onOpen: (m: Movie) => void;
}) {
  const is4k = movie.torrents?.some((t) => t.quality === "2160p");
  const quality = movie.libraryId
    ? movie.mediaQuality || "Jellyfin"
    : is4k
      ? "4K"
      : movie.torrents?.some((t) => t.quality === "1080p")
        ? "1080p"
        : "HD";
  return (
    <motion.article
      className="movie-card"
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
        delay: Math.min(index, 5) * 0.035,
      }}
    >
      <div className="poster-wrap">
        <button
          className="poster-button"
          aria-label={`جزئیات ${displayTitle(movie)}`}
          onClick={() => onOpen(movie)}
        >
          <img
            src={getPoster(movie)}
            alt={`پوستر ${displayTitle(movie)}`}
            loading={index < 6 ? "eager" : "lazy"}
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.src.endsWith("/images/movie-placeholder.svg"))
                img.src = "/images/movie-placeholder.svg";
            }}
          />
          <span className="poster-shade" />
          <span className="card-play">
            <Film size={23} />
            <span>جزئیات و دانلود</span>
          </span>
        </button>
        <span className={`quality-badge ${is4k ? "quality-4k" : ""}`} dir="ltr">
          {quality}
        </span>
        <button
          className={`save-btn ${saved ? "is-saved" : ""}`}
          onClick={() => onSave(movie)}
          title={saved ? "حذف از فهرست من" : "افزودن به فهرست من"}
          aria-label={`${saved ? "حذف" : "ذخیره"} ${displayTitle(movie)}`}
          aria-pressed={saved}
        >
          {saved ? <Check size={17} /> : <Bookmark size={17} />}
        </button>
        <span className="card-rating" dir="ltr">
          <Star size={12} fill="currentColor" />
          {movie.rating > 0 ? movie.rating.toFixed(1) : "—"}
        </span>
      </div>
      <button className="card-title" onClick={() => onOpen(movie)}>
        {displayTitle(movie)}
      </button>
      <p className="card-english" dir="ltr">
        {movie.title}
      </p>
      <div className="card-meta">
        <span>{movie.year ? fa(movie.year) : "—"}</span>
        <span className="meta-dot" />
        <span>{genreNames[movie.genres[0]] || movie.genres[0]}</span>
      </div>
    </motion.article>
  );
}
