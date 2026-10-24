#!/usr/bin/env python3
"""Sonidos REALES de animales desde Wikimedia Commons (grabaciones con licencia libre) → sonidos/<clave>.mp3

Pasos por animal (clave = campo 7 de data.js, p. ej. "dog bark"):
  1. busca grabaciones en Commons con varios términos, se queda con audio de licencia libre (CC0 / dominio público / CC BY / CC BY-SA)
  2. descarga hasta N candidatas, recorta el tramo más sonoro (≤ 4 s) con fundidos y lo normaliza a pico −3 dB
  3. deja el recorte en la carpeta de candidatas junto con un JSON de autoría (título, autor, licencia, enlace)
El script verificar_sonidos.py elige después la candidata que un reconocedor identifica como ese animal.

Uso:  python3 tools/sonidos_reales.py --out /ruta/candidatas [--only "dog bark" ...] [--buscar]  (solo lista, no descarga)
"""
import argparse, json, os, re, subprocess, sys, time, urllib.parse, urllib.request, audioop

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Política de agentes de Wikimedia: hay que identificarse con URL del proyecto y contacto; si no, las descargas de originales devuelven 429.
UA = {'User-Agent': 'LeoYAprendo/1.0 (app educativa infantil; https://github.com/shadown9/leo-y-aprendo; deivyespinosa07@gmail.com)'}
API = 'https://commons.wikimedia.org/w/api.php'
# Categorías de Commons por animal (lo fiable): [categorías], y un filtro opcional de título (regex) para categorías mixtas
CATEGORIAS = {
  'dog bark': (['Dogs barking', 'Audio of dogs'], None),
  'cat meow': (['Cats meowing', 'Audio files of Felis silvestris catus'], None),
  'cow moo': (['Audio files of Bos taurus'], None),
  'pig oink': (['Audio files of Suidae', 'Audio files of Sus'], r'pig|oink|grunt|sus |swine|hog|schwein'),
  'chicken cluck': (['Audio files of chickens', 'Roosters crowing'], None),
  'sheep bleat': (['Audio files of Bovidae'], r'sheep|lamb|bleat|m[ée]+|ovis|schaf'),
  'horse neigh': (['Audio files of Equus'], r'horse|neigh|whinn|equus|wiehern|pferd|caballo'),
  'duck quack': (['Audio files of Anas platyrhynchos', 'Audio files of Anatidae'], r'duck|anas|mallard|quack'),
  'frog croak': (['Audio files of Anura', 'Audio files of Ranidae'], r'frog|toad|rana|hyla|bufo|croak|frosch'),
  'lion roar': (['Audio files of Felidae'], r'lion'),
  'elephant trumpet': (['Audio files of Elephantidae'], r'elephant|loxodonta|elephas'),
  'monkey': (['Audio files of Primates'], r'monkey|macaque|macaca|gibbon|hylobates|howler|alouatta|chimp|pan trog|orangutan|pongo|baboon|papio|affe|mono|primate'),
  'wolf howl': (['Audio files of Canis lupus'], None),
  'owl hoot': (['Audio files of Strix aluco', 'Audio files of Strigiformes'], r'owl|strix|bubo|tyto|eule|hoot'),
  'bee buzz': (['Audio files of Apidae', 'Audio files of Bombus', 'Audio files of Insecta'], r'bee|bumble|apis|bombus|buzz|hive'),
  'bird chirp': (['Audio files of Erithacus rubecula', 'Audio files of Parus major', 'Audio files of Turdus merula'], None),
  'dolphin click': (['Audio files of Delphinidae'], r'dolphin|delphin|tursiops|orca|orcinus'),
  'whale song': (['Audio files of Megaptera novaeangliae', 'Audio files of Cetacea'], r'whale|humpback|megaptera|hump'),
  'rabbit': (['Audio files of Oryctolagus cuniculus', 'Rabbit sounds'], r'rabbit|bunny|oryctolagus|hare|lepus'),
  'penguin': (['Audio files of Spheniscidae'], r'penguin|spheniscus|eudyptula|aptenodytes|pygoscelis'),
  'fox': (['Audio files of Vulpes vulpes'], r'fox|vulpes|fuchs'),
  'turtle': ([], r'tortoise|turtle|testud|chelon'),
  'butterfly': (['Audio files of Lepidoptera'], r'butterfl|wing|flutter|papilio'),
}
# Términos de búsqueda libre (respaldo cuando la categoría no da nada)
TERMINOS = {
  'dog bark': ['dog barking', 'barking of a dog', 'Canis familiaris bark'],
  'cat meow': ['cat meow', 'meow domestic cat', 'Felis catus meow'],
  'cow moo': ['single cow moo', 'cow mooing', 'cattle lowing'],
  'pig oink': ['pig grunting', 'pig oink', 'domestic pig sound', 'Sus scrofa domesticus'],
  'chicken cluck': ['hen clucking', 'chicken clucking', 'Gallus gallus domesticus clucking', 'rooster crowing'],
  'sheep bleat': ['sheep bleating', 'sheep baa', 'Ovis aries bleat'],
  'horse neigh': ['horse neigh', 'horse whinny', 'horse neighing'],
  'duck quack': ['duck quacking', 'mallard quack', 'Anas platyrhynchos quack'],
  'frog croak': ['single frog croak', 'frog croaking', 'frog call'],
  'lion roar': ['lion roaring', 'Panthera leo roar', 'lion roar sound', 'lion growl'],
  'elephant trumpet': ['elephant trumpeting', 'elephant voice', 'Loxodonta trumpet'],
  'monkey': ['monkey calls', 'chimpanzee vocalization', 'macaque call', 'howler monkey call', 'Pan troglodytes sound'],
  'wolf howl': ['wolf howls', 'wolf howling', 'Canis lupus howl'],
  'owl hoot': ['owl hooting', 'Strix aluco', 'Bubo bubo call', 'tawny owl'],
  'bee buzz': ['bee buzzing', 'bumblebee buzzing', 'honeybee sound', 'Apis mellifera sound'],
  'bird chirp': ['bird chirping', 'songbird singing', 'Erithacus rubecula song', 'Turdus merula song'],
  'dolphin click': ['dolphin sounds', 'dolphin clicks', 'dolphin whistle', 'bottlenose dolphin', 'Tursiops truncatus', 'Delphinus delphis'],
  'whale song': ['humpback whale song', 'whale song', 'Megaptera novaeangliae'],
  'rabbit': ['rabbit sounds', 'rabbit vocalization', 'Oryctolagus cuniculus sound', 'hare call'],
  'penguin': ['penguin call', 'penguin sounds', 'Spheniscus call', 'Aptenodytes call'],
  'fox': ['fox call', 'red fox vulpes vulpes sound', 'fox bark', 'fox scream'],
  'turtle': ['tortoise hiss', 'turtle sound', 'tortoise sound', 'Testudo sound'],
  'butterfly': ['butterfly wings sound', 'butterfly fluttering'],
}
LIC_OK = re.compile(r'^(cc0|cc[- ]by([- ]sa)?\b|public domain|pd\b)', re.I)  # Commons escribe "CC BY-SA 4.0", "CC0", "Public domain"
# Fuera: pronunciaciones de palabras (Lingua Libre "LL-Q…", "De-Eule.ogg", "Fr-…", "Ja-…"), midis, imitaciones humanas, tórtolas ("turtle dove") y títulos impropios para una app infantil
MALOS = re.compile(r'(^File:(LL-|[A-Z][a-z]{1,2}(-[a-z]{2,3})?-\S)|\b(en-au|en-us|en-gb|pronunciation|man howls|\.mid$|song by|rag|remix|ringtone|sampl|synth|imitat|human|turtle dove|turtur|streptopelia|sex|toy)\b)', re.I)
AUDIO_EXT = ('.ogg', '.oga', '.wav', '.flac', '.mp3', '.opus', '.webm')

def api(params):
    params.update(format='json'); url = API + '?' + urllib.parse.urlencode(params)
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: j = json.load(r)
            time.sleep(1.0); return j
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(4 * (i + 1)); continue
            raise
    raise RuntimeError('Commons: demasiados intentos')

def buscar(term):
    j = api({'action': 'query', 'list': 'search', 'srsearch': term + ' filetype:audio', 'srnamespace': 6, 'srlimit': 12})
    return [x['title'] for x in j.get('query', {}).get('search', [])]

def info(titles):
    out = []
    for i in range(0, len(titles), 10):
        j = api({'action': 'query', 'titles': '|'.join(titles[i:i + 10]), 'prop': 'videoinfo', 'viprop': 'url|size|mime|extmetadata'})
        for p in j.get('query', {}).get('pages', {}).values():
            vi = (p.get('videoinfo') or [None])[0]
            if not vi: continue
            md = vi.get('extmetadata', {})
            g = lambda k: re.sub('<[^>]+>', '', md.get(k, {}).get('value', '') or '').strip()
            out.append({'title': p['title'], 'url': vi['url'], 'mime': vi.get('mime', ''), 'size': vi.get('size', 0), 'duration': vi.get('duration'),
                        'license': g('LicenseShortName'), 'author': g('Artist')[:80], 'page': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(p['title'].replace(' ', '_'))})
    return out

def miembros(cat, hondo=1):
    """Archivos de una categoría de Commons (y de sus subcategorías hasta `hondo` niveles)."""
    j = api({'action': 'query', 'list': 'categorymembers', 'cmtitle': 'Category:' + cat, 'cmtype': 'file|subcat', 'cmlimit': 200})
    out = []
    for m in j.get('query', {}).get('categorymembers', []):
        if m['title'].startswith('File:'): out.append(m['title'])
        elif hondo > 0: out += miembros(m['title'][9:], hondo - 1)
    return out

def candidatas(clave, max_dur=120):
    vistos, titulos = set(), []
    cats, filtro = CATEGORIAS.get(clave, ([], None))
    def add(ti):
        if ti in vistos or not ti.lower().endswith(AUDIO_EXT) or MALOS.search(ti): return
        if filtro and not re.search(filtro, ti, re.I): return
        vistos.add(ti); titulos.append(ti)
    for c in cats:
        for ti in miembros(c): add(ti)
    if len(titulos) < 3:
        for t in TERMINOS[clave]:
            for ti in buscar(t): add(ti)
    res = [c for c in info(titulos) if c['mime'].startswith(('audio', 'application/ogg', 'video/webm')) and LIC_OK.match(c['license'] or '') and (c['duration'] or 0) <= max_dur and c['size'] <= 25_000_000]
    # Preferimos cortas (una llamada limpia) y públicas/CC0
    res.sort(key=lambda c: (0 if re.match(r'^(cc0|public|pd)', c['license'], re.I) else 1, c['duration'] or 999))
    return res

def descargar(c, dest):
    # Commons limita las descargas de originales: despacio y con espera larga si devuelve 429
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(c['url'], headers=UA), timeout=180) as r, open(dest, 'wb') as f: f.write(r.read())
            time.sleep(3.0); return
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(25 * (i + 1)); continue
            raise
    raise RuntimeError('429 persistente')

def mejor_tramo(src, largo=3.5):
    """Devuelve (inicio, dur) del tramo de `largo` s con más energía, empezando un poco antes del ataque."""
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    paso = 1600  # 100 ms
    rms = [audioop.rms(pcm[i:i + paso * 2], 2) for i in range(0, len(pcm) - paso * 2 + 1, paso * 2)]
    if not rms: return 0, largo
    total = len(rms) / 10.0
    if total <= largo + 0.3: return 0, total
    n = int(largo * 10); mejor, best = 0, -1
    acc = sum(rms[:n])
    for i in range(0, len(rms) - n):
        if acc > best: best, mejor = acc, i
        acc += rms[i + n] - rms[i]
    # retrocede hasta donde el nivel empieza a subir (ataque), máx. 0,8 s
    umbral = max(rms[mejor:mejor + n]) * 0.12; i = mejor
    while i > 0 and i > mejor - 8 and rms[i - 1] > umbral: i -= 1
    return i / 10.0, largo

def recortar(src, dst, largo=3.5):
    ini, dur = mejor_tramo(src, largo)
    # fundidos cortos, pico a −3 dB en dos pasadas (medir + aplicar), mono 44,1 kHz
    med = subprocess.run(['ffmpeg', '-v', 'info', '-ss', f'{ini:.2f}', '-t', f'{dur:.2f}', '-i', src, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.search(r'max_volume: (-?[\d.]+) dB', med); gain = (-3.0 - float(m.group(1))) if m else 0.0
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{ini:.2f}', '-t', f'{dur:.2f}', '-i', src, '-af', f'afade=t=in:d=0.04,afade=t=out:st={max(dur - 0.25, 0):.2f}:d=0.25,volume={gain:.2f}dB', '-ac', '1', '-ar', '44100', '-b:a', '80k', '-f', 'mp3', dst], check=True)
    return ini, dur

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--only', nargs='*'); ap.add_argument('--buscar', action='store_true'); ap.add_argument('--n', type=int, default=4); a = ap.parse_args()
    claves = a.only or list(TERMINOS)
    os.makedirs(a.out, exist_ok=True)
    for clave in claves:
        cs = candidatas(clave); print(f'\n== {clave}: {len(cs)} candidatas libres')
        for c in cs[:8]: print(f"   {c['duration'] or '?':>5}s  {c['license']:<14} {c['title'][5:70]}  ({c['author'][:30]})")
        if a.buscar: continue
        base = clave.replace(' ', '_'); k = 0
        for c in cs:
            if k >= a.n: break
            raw = os.path.join(a.out, f'{base}.{k}.raw{os.path.splitext(c["title"])[1].lower()}'); mp3 = os.path.join(a.out, f'{base}.{k}.mp3')
            try:
                if not os.path.exists(raw): descargar(c, raw)
                ini, dur = recortar(raw, mp3, 3.5)
                json.dump(dict(c, inicio=ini, dur=dur, clave=clave, raw=os.path.basename(raw)), open(mp3[:-4] + '.json', 'w'), ensure_ascii=False, indent=1)
                print(f'   ✔ {os.path.basename(mp3)}  tramo {ini:.1f}s+{dur:.1f}s'); k += 1
            except Exception as e: print('   ✖', c['title'][:60], e)
            except KeyboardInterrupt: raise
            # el original se conserva junto al recorte: clasificar_sonidos.py busca en él el tramo que más suena al animal

if __name__ == '__main__': main()
