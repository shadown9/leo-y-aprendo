#!/usr/bin/env python3
"""Un solo comando para todo el audio de Leo y Aprendo (ElevenLabs).

La clave: export ELEVEN_API_KEY=sk_...   o guardarla en tools/.eleven_key (está en .gitignore, nunca se sube).

  python3 tools/generar_audio.py check                 clave, créditos, voz Daniela, costo estimado
  python3 tools/generar_audio.py prueba                5 frases en español para escuchar antes de gastar
  python3 tools/generar_audio.py voces-es              todas las frases en español (≈55k caracteres)
  python3 tools/generar_audio.py voces-en --voz-en X   inglés, con nombre o ID de voz
  python3 tools/generar_audio.py sonidos               23 sonidos de animales (efectos de sonido)
  python3 tools/generar_audio.py canciones             5 canciones × 2 idiomas (Eleven Music; si el plan no lo incluye, lo dice)
  python3 tools/generar_audio.py publicar              verifica archivos, sube APP_VERSION/CACHE_VERSION, commit y push
  python3 tools/generar_audio.py todo                  check + voces-es + sonidos + publicar

Se puede cortar y volver a lanzar: nada ya generado se repite.
"""
import argparse, json, os, re, subprocess, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, 'tools'); PY = sys.executable
ap = argparse.ArgumentParser(description='Audio de Leo y Aprendo con ElevenLabs')
ap.add_argument('paso', choices=['check', 'prueba', 'voces-es', 'voces-en', 'sonidos', 'canciones', 'publicar', 'todo'])
ap.add_argument('--voz-es', default='Daniela'); ap.add_argument('--voz-en', default=None)
ap.add_argument('--si', action='store_true', help='no preguntar antes de gastar créditos')
args = ap.parse_args()

def key():
    k = os.environ.get('ELEVEN_API_KEY')
    if not k:
        f = os.path.join(TOOLS, '.eleven_key')
        if os.path.exists(f): k = open(f).read().strip()
    if not k: sys.exit('Falta la clave: export ELEVEN_API_KEY=sk_...  (o escríbela en tools/.eleven_key)')
    return k

def get(path):
    req = urllib.request.Request('https://api.elevenlabs.io/v1' + path, headers={'xi-api-key': key()})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 401: sys.exit('ElevenLabs rechazó la clave (401). Cópiala de nuevo desde elevenlabs.io → perfil → API Keys.')
        sys.exit(f'ElevenLabs respondió {e.code}: {e.read().decode(errors="ignore")[:200]}')

def run(cmd, **kw):
    print('$ ' + ' '.join(cmd)); r = subprocess.run(cmd, cwd=ROOT, **kw)
    if r.returncode: sys.exit(f'Falló: {" ".join(cmd)}')
    return r

def confirmar(texto):
    if args.si: return
    if input(texto + ' [s/N] ').strip().lower() not in ('s', 'si', 'sí', 'y'): sys.exit('Cancelado.')

def manifest_chars():
    node = 'node' if subprocess.run(['which', 'node'], capture_output=True).returncode == 0 else '/opt/homebrew/bin/node'
    run([node, os.path.join(TOOLS, 'build_manifest.js')])
    m = json.load(open(os.path.join(ROOT, 'voces', 'manifest.json'), encoding='utf-8'))
    out = {}
    for L in ('es', 'en'):
        pend = [t for t, h in m[L].items() if not os.path.exists(os.path.join(ROOT, 'voces', L, h + '.mp3'))]
        out[L] = (len(m[L]), len(pend), sum(map(len, pend)))
    return out

def check():
    sub = get('/user/subscription'); used, lim = sub.get('character_count', 0), sub.get('character_limit', 0)
    print(f"Plan: {sub.get('tier')} · créditos usados {used:,} de {lim:,} · quedan {lim - used:,}")
    voces = get('/voices')['voices']; names = [v['name'] for v in voces]
    dan = [v for v in voces if v['name'].strip().lower() == args.voz_es.lower()]
    print(f"Voz ES '{args.voz_es}': " + (f"OK ({dan[0]['voice_id']})" if dan else f"NO está en tu cuenta. Tus voces: {', '.join(names)}"))
    if args.voz_en: en = [v for v in voces if v['name'].strip().lower() == args.voz_en.lower() or v['voice_id'] == args.voz_en]; print(f"Voz EN '{args.voz_en}': " + ('OK' if en else 'NO encontrada'))
    mc = manifest_chars()
    for L in ('es', 'en'): print(f"[{L}] {mc[L][0]} frases, {mc[L][1]} por generar, {mc[L][2]:,} caracteres")
    falta = mc['es'][2] - (lim - used)
    print('Español: ' + ('cabe en los créditos de este mes.' if falta <= 0 else f'faltan {falta:,} caracteres; genera por partes (se reanuda solo) o espera al reinicio.'))
    return dan

def voces(lang, limit=None):
    voz = args.voz_es if lang == 'es' else args.voz_en
    if not voz: sys.exit('Para inglés indica la voz: --voz-en "Nombre o ID" (python3 tools/generate_voices.py --list para verlas)')
    mc = manifest_chars()
    if not limit: confirmar(f'Vas a generar {mc[lang][1]} frases en {lang} ({mc[lang][2]:,} caracteres de tus créditos). ¿Seguimos?')
    cmd = [PY, os.path.join(TOOLS, 'generate_voices.py'), '--only', lang, f'--voice-{lang}', voz]
    if limit: cmd += ['--limit', str(limit)]
    run(cmd, env={**os.environ, 'ELEVEN_API_KEY': key()})

def verificar():
    idx = json.load(open(os.path.join(ROOT, 'voces', 'index.json')))
    if not isinstance(idx, dict) or set(idx) != {'es', 'en'}: sys.exit('voces/index.json debe ser {"es":[...],"en":[...]}')
    malos = []
    for L in ('es', 'en'):
        for h in idx[L]:
            p = os.path.join(ROOT, 'voces', L, h + '.mp3')
            if not os.path.exists(p) or os.path.getsize(p) < 500: malos.append(p)
    if malos: sys.exit(f'{len(malos)} audios faltan o están vacíos (bórralos y vuelve a generar): ' + ', '.join(malos[:5]))
    son = json.load(open(os.path.join(ROOT, 'sonidos', 'index.json'))) if os.path.exists(os.path.join(ROOT, 'sonidos', 'index.json')) else []
    print(f"Verificado: voces es {len(idx['es'])}, en {len(idx['en'])}; sonidos {len(son)}; canciones {len([f for f in os.listdir(os.path.join(ROOT, 'canciones')) if f.endswith('.mp3')]) if os.path.isdir(os.path.join(ROOT, 'canciones')) else 0}")

def subir_version():
    app = open(os.path.join(ROOT, 'app.js'), encoding='utf-8').read(); sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
    n = int(re.search(r"APP_VERSION = 'v(\d+)'", app).group(1)) + 1
    open(os.path.join(ROOT, 'app.js'), 'w', encoding='utf-8').write(re.sub(r"APP_VERSION = 'v\d+'", f"APP_VERSION = 'v{n}'", app))
    open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8').write(re.sub(r"CACHE_VERSION = 'lya-v\d+'", f"CACHE_VERSION = 'lya-v{n}'", sw))
    print(f'Versión → v{n}'); return n

def publicar():
    verificar()
    st = subprocess.run(['git', 'status', '--porcelain', 'voces', 'sonidos', 'canciones'], cwd=ROOT, capture_output=True, text=True).stdout
    if not st.strip(): sys.exit('No hay audios nuevos que publicar.')
    n = subir_version()
    run(['git', 'add', 'voces', 'sonidos', 'canciones', 'app.js', 'sw.js'])
    idx = json.load(open(os.path.join(ROOT, 'voces', 'index.json')))
    run(['git', 'commit', '-q', '-m', f"audio v{n}: voces es {len(idx['es'])}, en {len(idx['en'])}; sonidos y canciones"])
    run(['git', 'push', '-q', 'origin', 'main'])
    print('Publicado. GitHub Pages lo sirve en ~1 min; la app lo toma al abrirse (los audios se guardan en el teléfono la primera vez que suenan).')

p = args.paso
if p == 'check': check()
elif p == 'prueba': voces('es', limit=5); print('Escucha los 5 mp3 que lista arriba (ábrelos con QuickTime o en el navegador). Si suenan bien: python3 tools/generar_audio.py voces-es')
elif p == 'voces-es': voces('es')
elif p == 'voces-en': voces('en')
elif p == 'sonidos': confirmar('Vas a generar 23 efectos de sonido (~70 s de audio). ¿Seguimos?'); run([PY, os.path.join(TOOLS, 'generate_sfx.py')], env={**os.environ, 'ELEVEN_API_KEY': key()})
elif p == 'canciones': confirmar('Vas a generar 10 canciones (5 × 2 idiomas) con Eleven Music. ¿Seguimos?'); run([PY, os.path.join(TOOLS, 'generate_songs.py')], env={**os.environ, 'ELEVEN_API_KEY': key()})
elif p == 'publicar': publicar()
elif p == 'todo':
    if not check(): sys.exit(1)
    voces('es'); run([PY, os.path.join(TOOLS, 'generate_sfx.py')], env={**os.environ, 'ELEVEN_API_KEY': key()}); publicar()
