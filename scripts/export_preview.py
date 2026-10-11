"""Export the built VIO interface as one network-independent HTML preview.

Run after npm run build. No Python dependencies required.
Live API calls deliberately use the bundled catalog in this export.
"""
from pathlib import Path
import base64
import json
import mimetypes
import re

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / '.arena/offline-build'
PUBLIC = ROOT / 'public'
html = (DIST / 'index.html').read_text()
js_path = re.search(r'<script[^>]*src="([^"]+)"', html).group(1)
css_path = re.search(r'<link[^>]*href="([^"]+\.css)"', html).group(1)
js = (DIST / js_path.lstrip('/')).read_text()
css = (DIST / css_path.lstrip('/')).read_text()
seed = json.loads((PUBLIC / 'movie-seed.json').read_text())


def data_uri(path):
    mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
    if path.suffix == '.vtt':
        mime = 'text/vtt'
    if path.suffix == '.ttf':
        mime = 'font/ttf'
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()


needed = {'/images/sintel.webp', '/images/movie-placeholder.svg', '/videos/sintel-trailer.mp4', '/captions/sintel.fa.vtt'}
for movie in seed['movies']:
    needed.add(movie['poster'])
    backdrop = movie.get('backdrop', '')
    if backdrop.startswith('/images/'):
        needed.add(backdrop)
for path in re.findall(r'/images/[\w.-]+|/videos/[\w.-]+', js):
    if (PUBLIC / path.lstrip('/')).exists():
        needed.add(path)
assets = {name: data_uri(PUBLIC / name.lstrip('/')) for name in sorted(needed)}
for name in assets:
    # A reference expression prevents duplicating large video/image data URIs.
    for quote in ['"', "'"]:
        js = js.replace(quote + name + quote, 'globalThis.__VIO_ASSETS[' + json.dumps(name) + ']')

# The lazy HLS module is embedded too, so a downloaded HTML remains standalone.
for module in re.findall(r'import\("(\./[^"\s]+\.js)"\)', js):
    path = DIST / 'assets' / Path(module).name
    if path.exists():
        module_uri = 'data:text/javascript;base64,' + base64.b64encode(path.read_bytes()).decode()
        js = js.replace(json.dumps(module), json.dumps(module_uri))

for path in (PUBLIC / 'fonts').glob('*.ttf'):
    css = css.replace('/fonts/' + path.name, data_uri(path))

bootstrap = '''
globalThis.__VIO_ASSETS = ASSETS;
globalThis.__VIO_SEED = SEED;
for (const movie of __VIO_SEED.movies) {
  movie.poster = __VIO_ASSETS[movie.poster] || movie.poster;
  movie.backdrop = __VIO_ASSETS[movie.backdrop] || movie.poster;
}
// Sandboxed viewers may deny persistent storage. Keep this visit functional.
try { void localStorage.length; }
catch {
  const memory = new Map();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: key => memory.get(String(key)) ?? null,
    setItem: (key,value) => memory.set(String(key),String(value)),
    removeItem: key => memory.delete(String(key)),
    clear: () => memory.clear(),
    key: i => [...memory.keys()][i] ?? null,
    get length() { return memory.size; }
  }});
}
const originalFetch = window.fetch.bind(window);
const response = (value,status=200) => Promise.resolve(new Response(JSON.stringify(value), {
  status, headers: {'Content-Type': 'application/json'}
}));
window.fetch = (resource, options) => {
  const raw = typeof resource === 'string' ? resource : resource.url;
  const url = new URL(raw, 'https://vio.local/');
  const path = url.pathname;
  if (path === '/movie-seed.json') return response(__VIO_SEED);
  if (path === '/api/auth/me') return response({user:null,registration:false,mode:'preview'});
  if (path === '/api/platform/status') return response({version:'2.0.0',mode:'preview',player:{name:'Video.js',version:'10.0.1',available:true},accounts:{available:false,storage:'backend-required',registration:false},downloads:{configured:false,available:false,message:'Backend required'},library:{configured:false,available:false,message:'Backend required'}});
  if (/^\\/api\\/(auth|account|downloads|library)(\\/|$)/.test(path)) return response({error:'این قابلیت به نسخهٔ زنده و بک‌اند نیاز دارد؛ در HTML مستقل شبیه‌سازی نشده است.',code:'BACKEND_REQUIRED'},503);
  if (path === '/api/status') return response({provider:'YTS',mode:'offline-preview'});
  if (path.startsWith('/api/streams/')) {
    return response({ sources: path.endsWith('tt1727587') ? [{
      url: __VIO_ASSETS['/videos/sintel-trailer.mp4'], type:'mp4',
      label:'Sintel official trailer • 480p',
      textTracks:[{url:__VIO_ASSETS['/captions/sintel.fa.vtt'],language:'fa',label:'راهنمای نمونه · فارسی (نه ترجمهٔ گفتگو)'}],
      license:'© Blender Foundation | durian.blender.org | CC BY 3.0'
    }] : [] });
  }
  if (/^\\/api\\/movies\\/\\d+$/.test(path)) {
    return response({movie:__VIO_SEED.movies.find(m=>String(m.id)===path.split('/').pop()),source:'cache'});
  }
  if (path === '/api/movies') {
    const p=url.searchParams, q=(p.get('query_term')||'').toLowerCase();
    let list=__VIO_SEED.movies.filter(m=>
      (!q || [m.title,m.title_fa,m.imdb_code].some(t=>t?.toLowerCase().includes(q))) &&
      (!p.get('genre') || m.genres.some(g=>g.toLowerCase()===p.get('genre').toLowerCase())) &&
      (!p.get('minimum_rating') || m.rating >= Number(p.get('minimum_rating'))) &&
      (!p.get('quality') || m.torrents.some(t=>t.quality===p.get('quality')))
    );
    const sort=p.get('sort_by');
    if (sort==='rating'||sort==='year') list=[...list].sort((a,b)=>b[sort]-a[sort]);
    const count=list.length, limit=Number(p.get('limit')||24), page=Number(p.get('page')||1);
    return response({movies:list.slice((page-1)*limit,page*limit),movie_count:count,page_number:page,source:'cache'});
  }
  return originalFetch(resource,options);
};
'''.replace('ASSETS;', json.dumps(assets, ensure_ascii=False, separators=(',', ':')) + ';', 1)
bootstrap = bootstrap.replace('SEED;', json.dumps(seed, ensure_ascii=False, separators=(',', ':')) + ';', 1)

html = re.sub(r'\s*<script[^>]*src="[^"]+"[^>]*></script>', '', html)
html = re.sub(r'\s*<link[^>]*href="[^"]+\.css"[^>]*>', '', html)
html = html.replace('/favicon.svg', data_uri(PUBLIC / 'favicon.svg'))
html = html.replace('</head>', '<style>' + css + '</style>\n</head>')
script = (bootstrap + '\n' + js).replace('</script', '<\\/script')
html = html.replace('</body>', '<script type="module">' + script + '</script>\n</body>')
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- VIO offline UI preview. Live YTS requests use bundled cache here. See README and ASSET-CREDITS. -->')
output = ROOT / 'VIO-preview.html'
output.write_text(html)
print('Saved', output, '—', round(output.stat().st_size / 1024 / 1024, 2), 'MB')
