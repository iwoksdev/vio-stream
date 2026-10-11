import { useState } from "react";
import { CloudDownload, LoaderCircle, ShieldCheck } from "lucide-react";
import { apiRequest } from "./api";
import { CloseButton, Modal } from "./ui";
import type { DownloadDraft } from "./types";

export default function DownloadConfirm({
  draft,
  onClose,
  onCreated,
}: {
  draft: DownloadDraft;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/downloads", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "دانلود شروع نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="compact-modal download-confirm"
      titleId="download-confirm-title"
      onClose={() => !busy && onClose()}
    >
      <CloseButton onClick={() => !busy && onClose()} />
      <span className="account-symbol">
        <CloudDownload size={27} />
      </span>
      <span className="eyebrow">روی سرور خودت</span>
      <h2 id="download-confirm-title">به صف دانلود اضافه شود؟</h2>
      <p className="modal-subtitle">{draft.title}</p>
      <form className="account-form" onSubmit={create}>
        <div className="download-consent-note">
          <ShieldCheck size={21} />
          <p>
            این فایل روی سرور دریافت می‌شود و ممکن است فضا و ترافیک مصرف کند.
            فقط محتوایی را دانلود کن که حق استفاده از آن را داری.
          </p>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>تأیید می‌کنم اجازهٔ دانلود این محتوا را دارم.</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={!consent || busy}
        >
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <CloudDownload size={17} />
          )}{" "}
          {busy ? "در حال افزودن به aria2…" : "افزودن به صف شخصی"}
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          فعلاً نه
        </button>
      </form>
    </Modal>
  );
}
