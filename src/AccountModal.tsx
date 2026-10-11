import { useState } from "react";
import {
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { apiRequest, readStored } from "./api";
import { useAccount } from "./platform";
import { Brand, CloseButton, Modal } from "./ui";
import type { AccountUser, Movie } from "./types";

export default function AccountModal({
  notify,
}: {
  notify: (text: string) => void;
}) {
  const account = useAccount();
  const [tab, setTab] = useState<"login" | "register">("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [importGuest, setImportGuest] = useState(false);
  const guest = readStored<Movie[]>("watchlist", []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await apiRequest<{ user: AccountUser }>(
        `/api/auth/${tab}`,
        { method: "POST", body: JSON.stringify({ name, email, password }) },
      );
      const session = await apiRequest<{ user: AccountUser | null }>(
        "/api/auth/me",
      );
      if (session.user?.id !== result.user.id) {
        setTab("login");
        throw new Error(
          "مرورگر کوکی نشست را نپذیرفت. صفحهٔ زنده را در پنجرهٔ مستقل باز کن و وارد شو.",
        );
      }
      let importFailed = false;
      if (importGuest && guest.length) {
        for (const movie of guest.slice(0, 60)) {
          try {
            await apiRequest("/api/account/watchlist", {
              method: "POST",
              body: JSON.stringify({ movie }),
            });
          } catch {
            importFailed = true;
          }
        }
      }
      account.acceptSession(result.user);
      notify(
        importFailed
          ? "وارد شدی؛ انتقال بعضی فیلم‌ها انجام نشد."
          : `خوش آمدی، ${result.user.name}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ورود انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  const preview = account.mode !== "live";
  return (
    <Modal
      className="compact-modal account-modal"
      titleId="account-title"
      onClose={() => !busy && account.setAuthOpen(false)}
    >
      <CloseButton onClick={() => !busy && account.setAuthOpen(false)} />
      <Brand small />
      <span className="account-symbol">
        <KeyRound size={25} />
      </span>
      <span className="eyebrow">یک حساب، همهٔ شب‌های سینمایی</span>
      <h2 id="account-title">سینمای تو، همراه تو.</h2>
      <p className="modal-subtitle">
        فهرست و نقطهٔ ادامهٔ تماشا را روی سرور خودت نگه دار؛ نه فقط در این
        مرورگر.
      </p>
      {preview ? (
        <div className="integration-notice">
          <ShieldCheck size={24} />
          <h3>این بخش به بک‌اند نیاز دارد</h3>
          <p>
            {account.mode === "preview"
              ? "در فایل HTML، حساب ساختگی ایجاد نمی‌شود. نسخهٔ زنده یا Docker پروژه را اجرا کن."
              : "اتصال به سرور برقرار نیست؛ دوباره از نسخهٔ زنده تلاش کن."}
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => account.setAuthOpen(false)}
          >
            ادامه به‌عنوان مهمان
          </button>
        </div>
      ) : (
        <>
          <div
            className="account-segment"
            role="tablist"
            aria-label="حساب کاربری"
          >
            <button
              role="tab"
              aria-selected={tab === "login"}
              className={tab === "login" ? "active" : ""}
              onClick={() => {
                setTab("login");
                setError("");
              }}
            >
              ورود به حساب
            </button>
            <button
              role="tab"
              aria-selected={tab === "register"}
              disabled={!account.registration}
              className={tab === "register" ? "active" : ""}
              onClick={() => {
                setTab("register");
                setError("");
              }}
            >
              ساخت حساب
            </button>
          </div>
          <form className="account-form" onSubmit={submit}>
            {tab === "register" && (
              <label>
                نام تو
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={60}
                  placeholder="دوست داریم چه صدایت کنیم؟"
                  required
                />
              </label>
            )}
            <label>
              ایمیل
              <input
                type="email"
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={254}
                required
              />
            </label>
            <label>
              رمز عبور
              <div className="password-field">
                <input
                  type={visible ? "text" : "password"}
                  autoComplete={
                    tab === "register" ? "new-password" : "current-password"
                  }
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={tab === "register" ? 10 : undefined}
                  maxLength={200}
                  placeholder={
                    tab === "register" ? "حداقل ۱۰ کاراکتر" : "رمز عبور حساب"
                  }
                  required
                />
                <button
                  type="button"
                  aria-label={visible ? "پنهان کردن رمز" : "نمایش رمز"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {guest.length > 0 && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={importGuest}
                  onChange={(e) => setImportGuest(e.target.checked)}
                />
                <span>فهرست مهمان این دستگاه را هم به حساب منتقل کن.</span>
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Cloud size={17} />
              )}{" "}
              {busy
                ? "در حال ارتباط…"
                : tab === "register"
                  ? "ساخت حساب و شروع"
                  : "ورود به سینمای من"}
            </button>
          </form>
          <p className="account-security">
            <ShieldCheck size={14} /> رمز هش‌شده · نشست HttpOnly · ذخیرهٔ شخصی
            روی سرور
          </p>
          {!account.registration && (
            <p className="inline-note">
              ثبت‌نام عمومی توسط صاحب سرور غیرفعال شده است.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
