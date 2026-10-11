import {
  lazy,
  Suspense,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAccount } from "./platform";
const AdvancedVideo = lazy(() => import("./AdvancedVideo"));
import {
  ExternalLink,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  displayTitle,
  getPoster,
  progressStorageKey,
  readStored,
  store,
} from "./api";
import { CloseButton, Modal } from "./ui";
import type { PlayerState, Progress } from "./types";

export default function Player({
  player,
  onClose,
  onProgress,
}: {
  player: PlayerState;
  onClose: () => void;
  onProgress: (
    key: string,
    value: Progress,
    movie: PlayerState["movie"],
  ) => void;
}) {
  const account = useAccount();
  const storageKey = progressStorageKey(account.user?.id);
  const video = useRef<HTMLVideoElement | null>(null);
  const [mediaElement, setMediaElement] = useState<HTMLVideoElement | null>(
    null,
  );
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    setMediaElement(el);
  }, []);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(player.mode === "stream");
  const [retry, setRetry] = useState(0);
  const lastSaved = useRef(0);
  const { movie, source, mode } = player;
  const trailerId = movie.yt_trailer_code?.match(/^[a-zA-Z0-9_-]{11}$/)?.[0];
  const persist = (force = false, v = video.current) => {
    if (
      !v ||
      !Number.isFinite(v.duration) ||
      v.currentTime < 1 ||
      (!force && Date.now() - lastSaved.current < 5000)
    )
      return;
    const all = readStored<Record<string, Progress>>(storageKey, {});
    all[movie.imdb_code] = {
      time: v.currentTime,
      duration: v.duration,
      updatedAt: Date.now(),
    };
    store(storageKey, all);
    lastSaved.current = Date.now();
    onProgress(movie.imdb_code, all[movie.imdb_code], movie);
  };
  useEffect(() => {
    if (!mediaElement) return;
    let restored = false;
    const metadata = () => {
      if (mediaElement.readyState < 1) return;
      setLoading(false);
      if (!restored) {
        const saved = readStored<Record<string, Progress>>(storageKey, {})[
          movie.imdb_code
        ];
        if (
          saved &&
          saved.time < saved.duration - 3 &&
          Number.isFinite(mediaElement.duration)
        )
          mediaElement.currentTime = Math.min(
            saved.time,
            Math.max(0, mediaElement.duration - 1),
          );
        restored = true;
      }
    };
    const ready = () => setLoading(false),
      fail = () => {
        setError(true);
        setLoading(false);
      };
    const time = () => persist(false, mediaElement),
      pause = () => persist(true, mediaElement);
    mediaElement.addEventListener("loadedmetadata", metadata);
    mediaElement.addEventListener("canplay", ready);
    mediaElement.addEventListener("error", fail);
    mediaElement.addEventListener("timeupdate", time);
    mediaElement.addEventListener("pause", pause);
    mediaElement.addEventListener("ended", pause);
    metadata(); // A cached video can load before a lazy/Suspense subtree commits.
    if (mediaElement.error) fail();
    return () => {
      mediaElement.removeEventListener("loadedmetadata", metadata);
      mediaElement.removeEventListener("canplay", ready);
      mediaElement.removeEventListener("error", fail);
      mediaElement.removeEventListener("timeupdate", time);
      mediaElement.removeEventListener("pause", pause);
      mediaElement.removeEventListener("ended", pause);
    };
  }, [mediaElement, storageKey, movie.imdb_code, source?.url]);
  const close = () => {
    persist(true);
    onClose();
  };
  return (
    <Modal className="player-modal" titleId="player-title" onClose={close}>
      <div className="player-heading">
        <div>
          <span className="eyebrow">
            {mode === "trailer" ? "پیش‌نمایش فیلم" : "پخش آنلاین"}
          </span>
          <h2 id="player-title">
            {displayTitle(movie)}
            <span dir="ltr">{movie.title}</span>
          </h2>
        </div>
        <CloseButton onClick={close} />
      </div>
      <div className="video-stage" dir="ltr">
        {mode === "trailer" && trailerId ? (
          <iframe
            title={`تریلر ${displayTitle(movie)}`}
            src={`https://www.youtube-nocookie.com/embed/${trailerId}?rel=0&autoplay=0`}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : mode === "stream" && source ? (
          <>
            <Suspense
              fallback={
                <div className="player-loading">
                  <LoaderCircle className="spin" size={30} />
                  <span>آماده‌سازی پلیر…</span>
                </div>
              }
            >
              <AdvancedVideo
                source={source}
                key={retry}
                ref={attachVideo}
                playsInline
                preload="metadata"
                poster={getPoster(movie)}
              />
            </Suspense>
            {loading && !error && (
              <div className="player-loading">
                <LoaderCircle className="spin" size={30} />
                <span>آماده‌سازی پخش…</span>
              </div>
            )}
            {error && (
              <div className="video-error">
                <RotateCcw size={30} />
                <h3>این منبع در دسترس نیست</h3>
                <p>آدرس ویدیو، مجوز دسترسی یا تنظیمات CORS منبع را بررسی کن.</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setError(false);
                    setLoading(true);
                    setRetry((n) => n + 1);
                  }}
                >
                  تلاش دوباره
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="video-error">
            <Play size={30} />
            <h3>تریلر این فیلم در دسترس نیست.</h3>
          </div>
        )}
      </div>
      <div className="player-bottom">
        <span>
          <ShieldCheck size={16} />
          {mode === "stream"
            ? source?.label || "منبع پخش شخصی"
            : "تریلر رسمی در YouTube"}
        </span>
        {mode === "trailer" && trailerId && (
          <a
            href={`https://www.youtube.com/watch?v=${trailerId}`}
            target="_blank"
            rel="noreferrer"
          >
            باز کردن در YouTube
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      {mode === "stream" && (
        <p className="player-shortcuts">
          Video.js 10{" "}
          <span>Space: پخش / توقف · ← →: جابه‌جایی · F: تمام‌صفحه</span>
        </p>
      )}
      {mode === "stream" && source?.license && (
        <p className="license-note" dir="ltr">
          {source.license}
        </p>
      )}
    </Modal>
  );
}
