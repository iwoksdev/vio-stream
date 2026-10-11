import os, json, requests, concurrent.futures, re
from PIL import Image
from io import BytesIO

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
os.makedirs(os.path.join(PUBLIC, 'images'), exist_ok=True)
os.makedirs(os.path.join(PUBLIC, 'fonts'), exist_ok=True)
FILMS = [
 ('tt15239678', 'تلماسه: بخش دوم', 'سرنوشت، در دل شن‌ها نوشته می‌شود.', 'پل آتریدس به همراه چانی و فریمن‌ها به مسیر انتقام قدم می‌گذارد؛ سفری میان عشق، قدرت و آینده‌ای که تنها او می‌تواند آن را ببیند.', 'دنی ویلنوو'),
 ('tt15398776', 'اوپنهایمر', 'یک ذهن. یک انتخاب. جهانی برای همیشه تغییرکرده.', 'داستان جی. رابرت اوپنهایمر و پروژه‌ای که مسیر تاریخ را عوض کرد؛ روایتی نفس‌گیر از نبوغ، جاه‌طلبی و بهای یک تصمیم.', 'کریستوفر نولان'),
 ('tt14230458', 'بیچارگان', 'دنیا را برای اولین بار کشف کن.', 'بلا، زنی جوان با فرصتی دوباره برای زندگی، سفری متفاوت را برای کشف جهان و پیدا کردن جایگاه خودش آغاز می‌کند.', 'یورگوس لانتیموس'),
 ('tt1877830', 'بتمن', 'گاتهام، چیزی را پنهان می‌کند.', 'بتمن در خیابان‌های تاریک گاتهام رد یک معمای پیچیده را دنبال می‌کند؛ معمایی که مرز میان عدالت و انتقام را محو می‌کند.', 'مت ریوز'),
 ('tt0816692', 'میان‌ستاره‌ای', 'عشق، فراتر از زمان و مکان.', 'در روزهای پایانی زمین، گروهی از کاوشگران به سفری فراتر از کهکشان می‌روند تا خانه‌ای تازه برای انسان پیدا کنند.', 'کریستوفر نولان'),
 ('tt10366206', 'جان ویک: بخش چهارم', 'آزادی، بهایی دارد.', 'جان ویک برای رسیدن به آزادی با دشمنانی قدرتمند روبه‌رو می‌شود؛ نبردی که از نیویورک تا پاریس ادامه پیدا می‌کند.', 'چاد استاهلسکی'),
 ('tt9362722', 'مرد عنکبوتی: در میان دنیای عنکبوتی', 'هر کسی می‌تواند نقاب بزند.', 'مایلز مورالس وارد دنیایی از مردان و زنان عنکبوتی می‌شود و باید معنای واقعی قهرمان بودن را دوباره کشف کند.', 'خواکیم دوس سانتوس'),
 ('tt2278388', 'هتل بزرگ بوداپست', 'یک ماجرای به‌یادماندنی، با رنگ‌های وس اندرسون.', 'یک سرایدار افسانه‌ای و شاگرد جوانش درگیر ماجرایی عجیب می‌شوند که از یک تابلوی ارزشمند آغاز شده است.', 'وس اندرسون'),
 ('tt6710474', 'همه‌چیز همه‌جا به یکباره', 'جهانی به اندازهٔ تمام امکان‌ها.', 'یک زن معمولی در میان جهان‌های موازی قرار می‌گیرد و باید خانواده‌اش و تمام هستی را از خطری نامعلوم نجات دهد.', 'دنیل‌ها'),
 ('tt1856101', 'بلید رانر ۲۰۴۹', 'آیا خاطرات، ما را انسان می‌کنند؟', 'یک مأمور جوان حقیقتی پنهان را کشف می‌کند؛ حقیقتی که او را به جست‌وجوی بلید رانری گمشده و گذشته‌ای مبهم می‌کشاند.', 'دنی ویلنوو'),
 ('tt22022452', 'درون و بیرون ۲', 'احساسات تازه، ماجراهای تازه.', 'رایلی به نوجوانی قدم می‌گذارد و احساساتی جدید، کنترل مرکز فرماندهی ذهن او را به چالش می‌کشند.', 'کلسی من'),
 ('tt29623480', 'ربات وحشی', 'گاهی، برای پیدا کردن خودت باید گم شوی.', 'رباتی که در جزیره‌ای دورافتاده گرفتار شده، یاد می‌گیرد با حیوانات زندگی کند و مراقبت از یک جوجه‌غاز را به عهده می‌گیرد.', 'کریس سندرز'),
 ('tt27503384', 'روزهای عالی', 'زیبایی، در کوچک‌ترین لحظه‌هاست.', 'هیرایاما در روزمرگی آرام زندگی‌اش در توکیو، میان موسیقی، کتاب و نور خورشید، زیبایی را پیدا می‌کند.', 'ویم وندرس'),
 ('tt13238346', 'زندگی‌های گذشته', 'اگر دوباره به هم می‌رسیدیم…', 'دو دوست دوران کودکی پس از سال‌ها دوباره همدیگر را می‌بینند و با انتخاب‌ها و مسیرهایی که زندگی ساخته روبه‌رو می‌شوند.', 'سلین سونگ'),
 ('tt12037194', 'فیوریوسا: حماسهٔ مکس دیوانه', 'امید، از میان خاکستر برمی‌خیزد.', 'فیوریوسای جوان در جهانی بی‌رحم برای بازگشت به خانه می‌جنگد؛ حماسه‌ای از بقا، شجاعت و جاده‌های بی‌پایان.', 'جرج میلر'),
]

def film(entry):
    imdb, fa, tagline, description, director = entry
    try:
        r = requests.get('https://movies-api.accel.li/api/v2/list_movies.json', params={'query_term': imdb, 'limit': 1}, timeout=20)
        r.raise_for_status()
        movie = r.json()['data']['movies'][0]
        cover = requests.get(movie['large_cover_image'], timeout=20)
        cover.raise_for_status()
        img = Image.open(BytesIO(cover.content)).convert('RGB')
        img.save(os.path.join(PUBLIC, 'images', imdb+'.webp'), 'WEBP', quality=88)
        return {
            **movie, 'title_fa': fa, 'tagline': tagline,
            'description_fa': description, 'director': director,
            'poster': '/images/'+imdb+'.webp',
            'backdrop': '/images/dune-cinema.jpg' if imdb=='tt15239678' else movie.get('background_image'),
            'source': 'YTS', 'kind': 'movie',
        }
    except Exception as exc:
        print('ERROR', imdb, exc, flush=True)
        return None

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    movies = list(filter(None, pool.map(film, FILMS)))

with open(os.path.join(PUBLIC, 'movie-seed.json'), 'w', encoding='utf-8') as f:
    json.dump({'updated_at':'2026-10-11','movies': movies}, f, ensure_ascii=False, indent=2)
print('Saved', len(movies), 'films', flush=True)

css = requests.get('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap', timeout=20).text
for weight, url in re.findall(r'font-weight: (\d+);.*?src: url\((.*?)\)', css, re.S):
    content = requests.get(url, timeout=20).content
    open(os.path.join(PUBLIC, 'fonts', f'Vazirmatn-{weight}.ttf'), 'wb').write(content)
print('Saved local fonts', flush=True)

# Official Blender trailer, Creative Commons Attribution 3.0.
try:
    img = requests.get('https://media.w3.org/2010/05/sintel/poster.png', timeout=15)
    if img.ok:
        Image.open(BytesIO(img.content)).convert('RGB').save(os.path.join(PUBLIC,'images','sintel.webp'),'WEBP',quality=85)
except Exception as exc:
    print('Sintel poster:',exc)
