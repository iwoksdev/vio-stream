import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpLeft,
  CheckCircle2,
  CloudDownload,
  Download,
  HardDrive,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { apiRequest, bytes, fa, sintel } from "./api";
import { useAccount, useServices } from "./platform";
import { ConnectionPanel, ServiceBadge } from "./LibraryPage";
import type { DownloadDraft, DownloadJob, PlayerState } from "./types";

const labels: Record<string, string> = {
  active: "در حال دانلود",
  waiting: "در صف",
  paused: "متوقف‌شده",
  complete: "آماده",
  error: "خطای دانلود",
  removed: "حذف‌شده",
  unknown: "نامشخص",
};
export default function DownloadsPage({
  onRequest,
  onPlay,
  notify,
  refreshKey,
}: {
  onRequest: (draft: DownloadDraft) => void;
  onPlay: (p: PlayerState) => void;
  notify: (text: string) => void;
  refreshKey: number;
}) {
  const account = useAccount(),
    services = useServices();
  const [jobs, setJobs] = useState<DownloadJob[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [url, setUrl] = useState(""),
    [working, setWorking] = useState(""),
    [revision, setRevision] = useState(0);
  const [jobOwner, setJobOwner] = useState<string | undefined>();
  const visibleJobs = account.user && jobOwner === account.user.id ? jobs : [];
  const ready = services.status?.downloads.available;
  useEffect(() => {
    if (!account.user || !ready) return;
    let active = true,
      pending = false;
    const abort = new AbortController();
    async function load() {
      if (pending || document.hidden) return;
      pending = true;
      if (active && !visibleJobs.length) setBusy(true);
      try {
        const data = await apiRequest<{ downloads: DownloadJob[] }>(
          "/api/downloads",
          { signal: abort.signal },
        );
        if (active) {
          setJobs(data.downloads);
          setJobOwner(account.user?.id);
          setError("");
        }
      } catch (e) {
        if (active && !abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "موتور دانلود پاسخ نمی‌دهد.",
          );
      } finally {
        pending = false;
        if (active) setBusy(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
      abort.abort();
    };
  }, [account.user?.id, ready, refreshKey, revision]);
  async function action(job: DownloadJob, name: string) {
    if (
      name === "remove" &&
      !window.confirm(
        "از فهرست دانلود حذف شود؟ فایل‌های دانلودشده پاک نمی‌شوند.",
      )
    )
      return;
    setWorking(job.gid);
    try {
      await apiRequest(`/api/downloads/${job.gid}/${name}`, { method: "POST" });
      setRevision((n) => n + 1);
      notify(
        name === "remove"
          ? "از فهرست دانلود حذف شد."
          : name === "pause"
            ? "دانلود متوقف شد."
            : "دانلود ادامه پیدا کرد.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "عملیات انجام نشد.");
    } finally {
      setWorking("");
    }
  }
  const active = visibleJobs.filter((j) =>
      ["active", "waiting"].includes(j.status),
    ).length,
    complete = visibleJobs.filter((j) => j.status === "complete").length,
    totalBytes = visibleJobs.reduce((sum, j) => sum + j.completed, 0);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    onRequest({ url: url.trim(), title: "دانلود با لینک شخصی" });
  }
  return (
    <section className="platform-page container downloads-page">
      <div className="platform-intro">
        <div>
          <span className="eyebrow">
            <CloudDownload size={14} /> مرکز دانلود
          </span>
          <h1>صف دانلود، بدون معطلی.</h1>
          <p>
            روی سرورت دانلود کن. از هر دستگاهی ادامه بده. وقتی آماده شد، تماشا
            کن.
          </p>
        </div>
        <ServiceBadge
          name="aria2"
          available={ready}
          configured={services.status?.downloads.configured}
        />
      </div>
      <div className="platform-summary">
        <div>
          <span className="summary-icon">
            <ArrowDownToLine size={21} />
          </span>
          <span>
            <small>در حال دانلود / در صف</small>
            <strong>{fa(active)}</strong>
          </span>
        </div>
        <div>
          <span className="summary-icon green">
            <CheckCircle2 size={21} />
          </span>
          <span>
            <small>فایل‌های آماده</small>
            <strong>{fa(complete)}</strong>
          </span>
        </div>
        <div>
          <span className="summary-icon">
            <HardDrive size={21} />
          </span>
          <span>
            <small>دریافت‌شده در این فهرست</small>
            <strong dir="ltr">{bytes(totalBytes)}</strong>
          </span>
        </div>
      </div>
      {!ready ? (
        <ConnectionPanel kind="downloads" />
      ) : !account.user ? (
        <div className="platform-empty">
          <ShieldCheck size={32} />
          <h3>دانلودها، فقط برای خودت.</h3>
          <p>وارد حساب شو تا صف خصوصی‌ات را روی سرور داشته باشی.</p>
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
          <form className="download-add" onSubmit={submit}>
            <label htmlFor="download-url">
              <Plus size={17} /> دانلود جدید
            </label>
            <div>
              <input
                id="download-url"
                aria-label="لینک دانلود جدید"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                dir="ltr"
                placeholder="https://… or magnet:?xt=…"
                required
                maxLength={2000}
              />
              <button className="btn btn-primary btn-sm" type="submit">
                <Plus size={16} />
                افزودن
              </button>
            </div>
            <small>
              فقط لینک‌های مجاز · دامنه‌های HTTPS باید در تنظیمات سرور تأیید شده
              باشند.
            </small>
          </form>
          <div className="queue-heading">
            <h2>
              صف شخصی تو <small>{fa(visibleJobs.length)}</small>
            </h2>
            <button
              className="icon-btn"
              aria-label="تازه‌سازی صف دانلود"
              disabled={busy}
              onClick={() => setRevision((n) => n + 1)}
            >
              <RefreshCw className={busy ? "spin" : ""} size={18} />
            </button>
          </div>
          {error && (
            <p className="platform-error" role="alert">
              {error}{" "}
              <span>تا اتصال دوباره، وضعیت‌های قبلی نمایش داده می‌شوند.</span>
            </p>
          )}
          {busy && !visibleJobs.length ? (
            <div className="platform-empty">
              <LoaderCircle className="spin" size={30} />
              <p>دریافت وضعیت واقعی دانلودها…</p>
            </div>
          ) : visibleJobs.length ? (
            <div className="download-queue">
              {visibleJobs.map((job) => (
                <article className={`download-job ${job.status}`} key={job.gid}>
                  <div className="download-job-icon">
                    {job.status === "complete" ? (
                      <CheckCircle2 size={23} />
                    ) : job.status === "paused" ? (
                      <Pause size={23} />
                    ) : (
                      <ArrowDownToLine size={23} />
                    )}
                  </div>
                  <div className="download-job-content">
                    <div className="download-job-title">
                      <h3>{job.title}</h3>
                      <span>{labels[job.status] || job.status}</span>
                    </div>
                    <div
                      className="download-progress"
                      role="progressbar"
                      aria-label={`پیشرفت ${job.title}`}
                      aria-valuenow={job.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <i style={{ width: `${job.progress}%` }} />
                    </div>
                    <div className="download-job-meta">
                      <span dir="ltr">
                        {bytes(job.completed)} / {bytes(job.total)}
                      </span>
                      <span>{fa(job.progress)}٪</span>
                      {job.speed > 0 && (
                        <span dir="ltr">{bytes(job.speed)}/s</span>
                      )}
                      {job.status === "active" && (
                        <span>{fa(job.peers)} اتصال</span>
                      )}
                    </div>
                    {job.error && <p className="form-error">{job.error}</p>}
                  </div>
                  <div className="download-job-actions">
                    {working === job.gid ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <>
                        {["active", "waiting"].includes(job.status) && (
                          <button
                            className="icon-btn"
                            aria-label={`توقف ${job.title}`}
                            disabled={!!error}
                            onClick={() => void action(job, "pause")}
                          >
                            <Pause size={18} />
                          </button>
                        )}
                        {job.status === "paused" && (
                          <button
                            className="icon-btn"
                            aria-label={`ادامه ${job.title}`}
                            disabled={!!error}
                            onClick={() => void action(job, "resume")}
                          >
                            <Play size={18} />
                          </button>
                        )}
                        {job.status === "complete" && (
                          <a
                            className="icon-btn"
                            href={`/api/downloads/${job.gid}/file`}
                            aria-label={`دریافت فایل ${job.title}`}
                          >
                            <Download size={18} />
                          </a>
                        )}
                        {job.playable && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              onPlay({
                                movie: job.movie || {
                                  id: 0,
                                  title: job.title,
                                  title_fa: job.title,
                                  imdb_code: `dl-${job.gid}`,
                                  downloadGid: job.gid,
                                  year: 0,
                                  rating: 0,
                                  runtime: 0,
                                  genres: [],
                                  source: "aria2",
                                  torrents: [],
                                  description_fa:
                                    "فایل دانلودشده با لینک شخصی روی سرور.",
                                },
                                mode: "stream",
                                source: {
                                  url: `/api/downloads/${job.gid}/media`,
                                  type: "mp4",
                                  label: "فایل کامل‌شده روی سرور",
                                },
                              })
                            }
                          >
                            <Play size={14} />
                            پخش
                          </button>
                        )}
                        <button
                          className="icon-btn"
                          aria-label={`حذف ${job.title}`}
                          disabled={!!error}
                          onClick={() => void action(job, "remove")}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="platform-empty queue-empty">
              <ArrowDownToLine size={33} />
              <h3>جا برای داستان بعدی خالی‌ست.</h3>
              <p>
                یک لینک مجاز اضافه کن؛ وضعیت واقعی آن اینجا نمایش داده می‌شود.
              </p>
            </div>
          )}
        </>
      )}
      <div className="download-demo">
        <span className="download-demo-icon">
          <ShieldCheck size={23} />
        </span>
        <div>
          <strong>اول، یک دانلود کوچک و آزاد.</strong>
          <p>تریلر رسمی سینتل · حدود ۴٫۲ مگابایت · مجوز CC BY 3.0</p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() =>
            onRequest({
              url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
              title: "سینتل · تریلر رسمی",
              movie: sintel,
            })
          }
        >
          <CloudDownload size={16} />
          دانلود نمونهٔ آزاد
        </button>
      </div>
      <p className="download-footnote">
        دانلود تورنت، پخش مستقیم نیست. پخش فایل‌های کامل‌شده به فرمت و کدک
        مرورگر بستگی دارد؛ برای فرمت‌های دیگر از ترنسکد Jellyfin استفاده کن.
      </p>
    </section>
  );
}
