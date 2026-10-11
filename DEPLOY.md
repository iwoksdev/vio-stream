# نصب VIO 2 روی VPS / Docker

این راهنما پروژه را روی **سرور خودتان** راه‌اندازی می‌کند. فایل‌های استقرار آماده‌اند؛ در محیط توسعه Docker daemon موجود نبود و build/run کانتینرها عملاً اجرا نشده است. نسخهٔ Node، حساب‌ها و موتور واقعی aria2 آزمایش شده‌اند؛ اتصال Jellyfin در تست‌ها با fixture پروتکل بررسی شده و به سرور واقعی شما نیاز دارد.

## معماری

```text
مرورگر → HTTPS / Caddy → VIO (Express + React)
                           ├─ SQLite: حساب / نشست / فهرست / پیشرفت
                           ├─ aria2: JSON-RPC خصوصی → /downloads
                           └─ Jellyfin: API خصوصی → پخش مستقیم / HLS / زیرنویس
```

همهٔ درخواست‌های مرورگر هم‌مبدأ هستند. کلید Jellyfin و رمز RPC فقط در سرور هستند. کاربران VIO صف دانلود، فهرست و سابقهٔ جداگانه دارند؛ کتابخانهٔ Jellyfin در این نسخه **بین کاربران مجاز VIO مشترک** است. این پروژه ورود مستقیم با حساب‌های Jellyfin یا نگاشت خودکار کاربران آن را انجام نمی‌دهد.

## ۱. پیش‌نیاز

- VPS لینوکسی، Docker Engine و **Docker Compose v2**؛ برای Jellyfin/ترنسکد حداقل ۴ GB RAM پیشنهادی است.
- فضای کافی برای فایل‌های رسانه، ترافیک مجاز و محتوا با حق استفاده.
- برای انتشار اینترنتی: دامنهٔ متعلق به خودتان با DNS صحیح، پورت‌های 80/443 باز و HTTPS.
- Node.js 24 LTS فقط برای اجرای اسکریپت آماده‌سازی روی میزبان مفید است؛ راه جایگزین بدون Node پایین آمده است.

سورس را روی VPS استخراج کرده و وارد پوشهٔ `vio-stream` شوید.

## ۲. ساخت تنظیمات و رمز امن

با Node روی میزبان:

```bash
npm run setup:docker
```

بدون Node روی میزبان:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work node:24-alpine \
  node scripts/setup-docker.mjs
```

این دستور `.env.docker` را با رمز تصادفی ۶۴ کاراکتری و مجوز فایل `0600` می‌سازد؛ رمز چاپ نمی‌شود و فایل موجود بازنویسی نمی‌شود. پوشهٔ `media` نیز ساخته می‌شود.

```bash
chmod 600 .env.docker
nano .env.docker
```

برای سایت HTTPS واقعی:

```dotenv
VIO_DOMAIN=cinema.your-domain.com
APP_ORIGIN=https://cinema.your-domain.com
COOKIE_SECURE=true
ALLOW_REGISTRATION=true
```

دامنهٔ بالا نمونه است؛ با دامنهٔ متعلق به خودتان جایگزین کنید. `ARIA2_RPC_SECRET` تولیدشده را نگه دارید. از `VITE_` برای هیچ رمز یا کلید سرور استفاده نکنید.

## ۳. اجرای حساب‌ها و دانلود

```bash
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=60 app aria2
```

پورت VIO فقط روی loopback میزبان، پیش‌فرض `127.0.0.1:8080` است. **6800 برای RPC منتشر نمی‌شود.** کانتینر آماده‌سازی، مالکیت volumeها را برای UID 1000 تنظیم می‌کند؛ برنامه و aria2 بدون root و با root filesystem فقط‌خواندنی اجرا می‌شوند.

برای تست موقت با SSH tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 user@YOUR_VPS
```

سپس `http://localhost:8080` را روی رایانهٔ خود باز کنید. اگر برای تست لوکال HTTP مرورگر کوکی Secure را نپذیرفت، موقتاً `COOKIE_SECURE=false` و `APP_ORIGIN=http://localhost:8080` تنظیم کرده، کانتینر app را recreate کنید. **این حالت را برای سایت اینترنتی استفاده نکنید؛ قبل از انتشار دوباره Secure=true کنید.**

## ۴. فعال‌سازی HTTPS

با دامنه/DNS و تنظیمات مرحلهٔ ۲:

```bash
docker compose --env-file .env.docker --profile https up -d --build
```

Caddy گواهی را از ACME دریافت و روی 443 سرو می‌کند. Volumeهای Caddy گواهی‌ها را نگه می‌دارند. API و فرانت‌اند روی یک origin خواهند بود. در این حالت کوکی نشست `HttpOnly; Secure; SameSite=Strict` است. اگر reverse proxy موجود دارید، به `127.0.0.1:8080` پراکسی کنید و Host اصلی را حفظ کنید؛ پورت app را عمومی نکنید.

برای کنترل HTTP سریع:

```bash
curl -I https://YOUR_DOMAIN
curl https://YOUR_DOMAIN/api/platform/status
```

## ۵. اتصال کتابخانهٔ Jellyfin

اگر از قبل Jellyfin دارید، URL قابل‌دسترسی **از کانتینر app** و یک API key معتبر آن را در `.env.docker` تنظیم کنید. `localhost` در کانتینر، خود کانتینر است؛ برای سرویس هم‌پروژه از نام `jellyfin` استفاده کنید.

برای Jellyfin همراه این پروژه:

```bash
# فایل‌های دارای مجوز را در ./media قرار دهید.
docker compose --env-file .env.docker --profile library up -d --build
ssh -L 8096:127.0.0.1:8096 user@YOUR_VPS
```

۱. `http://localhost:8096` را باز کنید و wizard رسمی Jellyfin را تکمیل کنید.
۲. در داشبورد Jellyfin، کتابخانهٔ فیلم/سریال را با مسیر `/media` بسازید. برای فایل‌های دانلودشده، `/downloads` هم قابل انتخاب است؛ این mount برای Jellyfin فقط‌خواندنی است.
۳. دسترسی خواندن فایل‌های میزبان برای UID 1000 را بررسی کنید. app فایل‌های رسانهٔ `/media` را مستقیماً نمی‌خواند.
۴. از **Dashboard → Advanced → API Keys** کلید بسازید.
۵. در `.env.docker`:

```dotenv
JELLYFIN_URL=http://jellyfin:8096
JELLYFIN_API_KEY=YOUR_REAL_API_KEY
# اختیاری: شناسهٔ واقعی کاربر Jellyfin برای محدودکردن دید کتابخانه
JELLYFIN_USER_ID=
```

۶. app را با env جدید recreate کنید:

```bash
docker compose --env-file .env.docker --profile library --profile https up -d app
```

به VIO وارد شوید و در «کتابخانه» اتصال را بررسی کنید. هیچ فیلم ساختگی به کتابخانه اضافه نمی‌شود. پوشهٔ خالی، کلید نامعتبر و سرویس غیرفعال، حالت‌های واضح دارند.

MP4/WebM قابل‌پخش در مرورگر، مستقیم و فایل‌های ناسازگار در صورت پشتیبانی سرور، با HLS ترنسکد می‌شوند. زیرنویس‌ها از API Jellyfin به WebVTT تبدیل و پشت URLهای نشست ارائه می‌شوند. کلیدها در HTML/JS یا URLهای مرورگر نیستند. URLهای نشست در حافظه نگه‌داری می‌شوند؛ بعد از restart بک‌اند، فیلم را دوباره باز کنید تا منبع تازه ساخته شود. GPU/hardware acceleration به‌طور پیش‌فرض تنظیم نشده؛ برای VPS ضعیف، ترنسکد سنگین ممکن است کند باشد. قالب‌ها، codec، زیرنویس‌های تصویری و تنظیمات سرور تعیین می‌کنند چه چیزی قابل‌پخش است.

## ۶. تست واقعی دانلود

- در VIO حساب بسازید و به «دانلودها» بروید.
- «دانلود نمونهٔ آزاد» را بزنید؛ نمونه، تریلر رسمی سینتل از `media.w3.org` با مجوز CC BY 3.0 است.
- اجازهٔ استفاده را تأیید کنید؛ فقط پس از تأیید، دانلود واقعاً به aria2 افزوده می‌شود.
- پیشرفت، سرعت، توقف، ادامه و تکمیل از RPC واقعی خوانده می‌شوند.
- پس از تکمیل، «پخش» برای فرمت‌های MP4/WebM/M4V و «دریافت فایل» فعال است. پخش نیازمند codec سازگار مرورگر است.
- «حذف» فقط job را از صف/فهرست حذف می‌کند؛ فایل دانلودشده پاک نمی‌شود.

لینک HTTPS فقط برای دامنه‌های مشخص‌شده در `DOWNLOAD_ALLOWED_HOSTS` پذیرفته می‌شود؛ `file://`، آدرس خصوصی و اعتبارنامه در URL پذیرفته نیست. برای افزودن دامنه، فقط یک دامنهٔ مطمئن و تحت کنترل انتخاب کنید. محدودیت پیش‌فرض ۳۰ ایجاد job در ساعت/کاربر و ۳ دانلود هم‌زمان موتور است. Magnet فقط با infohash معتبر پذیرفته شده و trackerهای ورودی دلخواه حذف می‌شوند.

**پخش تورنتِ در حال دریافت پیاده نشده است.** خواندن فایل کامل‌شده انجام می‌شود؛ MKV/codec ناسازگار را از Jellyfin پخش کنید. دانلود با مگنت وابسته به peerهای واقعی است و قابل‌تضمین نیست. ایمپورت/اسکن رسانه تابع تنظیمات خود Jellyfin است؛ VIO فایل را خودکار با هویت یک فیلم دیگر جا نمی‌زند.

## ۷. مدیریت حساب توسط صاحب سرور

پس از ساخت حساب‌های موردنیاز، برای سرور شخصی می‌توانید `ALLOW_REGISTRATION=false` قرار داده و app را recreate کنید؛ ورود حساب‌های موجود باقی می‌ماند.

```bash
docker compose --env-file .env.docker exec app node scripts/manage-user.mjs list
```

ساخت حساب دستی یا بازنشانی رمز (رمز داخل command history نوشته نمی‌شود):

```bash
read -s -p 'New password (10+ chars): ' VIO_NEW_PASSWORD; echo
export VIO_NEW_PASSWORD
docker compose --env-file .env.docker exec -e VIO_NEW_PASSWORD app \
  node scripts/manage-user.mjs create you@example.com 'نام شما'
# به‌جای create برای بازنشانی:
# ... node scripts/manage-user.mjs reset you@example.com
unset VIO_NEW_PASSWORD
```

بازنشانی رمز، نشست‌های قبلی آن کاربر را باطل می‌کند. در این نسخه ارسال ایمیل، تأیید ایمیل، بازیابی رمز از طریق ایمیل، OAuth، صورتحساب و پنل مدیریتی عمومی وجود ندارد.

## ۸. نگهداری و بکاپ

Volumeهای `vio_data` (SQLite)، `downloads` (فایل‌ها)، `aria_data` (جلسهٔ موتور)، `jellyfin_config` و `jellyfin_cache` مجزا هستند. `docker compose down` معمولی آن‌ها را حذف نمی‌کند؛ **`down -v` داده‌ها را پاک می‌کند.** از `.env.docker` هم به‌صورت امن نسخهٔ پشتیبان بگیرید.

برای کپی سازگار SQLite، app را موقتاً متوقف کنید و کل volume داده را بکاپ بگیرید؛ یا از API آنلاین backup خود SQLite استفاده کنید. فایل WAL را هنگام کپی خام از دیتابیس فعال نادیده نگیرید. فایل‌های دانلود کامل حتی بعد از حذف history موتور، با snapshot محفوظ در SQLite در فهرست باقی می‌مانند؛ مشروط به اینکه خود فایل موجود باشد.

- فضای دیسک/ترافیک را پایش کنید. این نسخه **quota دیسک به‌ازای کاربر ندارد**؛ برای سرویس عمومی، quota فایل‌سیستم و سیاست شبکه ضروری است.
- برای کنترل پهنای‌باند مثلاً `ARIA2_DOWNLOAD_LIMIT=10M` تنظیم کنید.
- RPC aria2، کلید Jellyfin و SQLite را در اینترنت، Git یا بکاپ عمومی منتشر نکنید.
- در iframe پیش‌نمایش ممکن است مرورگر کوکی شخص ثالث را مسدود کند؛ برای ورود واقعی صفحه را در پنجرهٔ مستقل باز کنید.
- نام/تگ تصاویر Docker در زمان توسعه بررسی شده‌اند؛ قبل از انتشار به‌روز بودن امنیتی و سازگاری نسخه‌ها را دوباره بررسی کنید.

## رفع اشکال

| نشانه | بررسی |
|---|---|
| ورود بعد از refresh از بین می‌رود | HTTPS / Cookie Secure / APP_ORIGIN / مسدودبودن کوکی شخص ثالث |
| aria2 متصل نیست | secret یکسان در app و aria2؛ RPC داخلی `http://aria2:6800/jsonrpc` |
| Jellyfin پاسخ 401/403 می‌دهد | API key واقعی، مسیر کتابخانه و `JELLYFIN_USER_ID` درست |
| فیلم دیده می‌شود اما پخش نمی‌شود | codec، مجوز فایل، پروفایل ترنسکد و توان CPU/GPU Jellyfin |
| permission denied در SQLite/دانلود | volume-init، مالکیت UID 1000، volume و mountهای میزبان |
| مگنت روی «در صف» مانده | نبود peer/metadata یا سیاست شبکهٔ VPS؛ وضعیت جعلی تولید نمی‌شود |
