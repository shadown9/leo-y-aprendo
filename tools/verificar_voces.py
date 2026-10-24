#!/usr/bin/env python3
"""Verifica que cada audio diga lo que debe: lo transcribe con el reconocimiento de voz de ElevenLabs (Scribe)
y lo compara con el texto del manifest. Los que no coinciden quedan en voces/dudosos_<lang>.json.

  python3 tools/verificar_voces.py --lang es --cortas        # solo frases de hasta 3 palabras (las que más fallan)
  python3 tools/verificar_voces.py --lang es                 # todas
  python3 tools/verificar_voces.py --lang es --reparar       # borra los mp3 dudosos para regenerarlos (con tools/pronunciacion.json)

Normaliza acentos, mayúsculas y signos; acepta pequeñas diferencias (letras sueltas, "eh" por "e")."""
import argparse, difflib, json, os, re, sys, unicodedata, urllib.request, urllib.error, uuid
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('--lang', choices=['es', 'en'], default='es'); ap.add_argument('--cortas', action='store_true'); ap.add_argument('--reparar', action='store_true'); ap.add_argument('--limite', type=int); ap.add_argument('--workers', type=int, default=4); args = ap.parse_args()
key = os.environ.get('ELEVEN_API_KEY') or (open(os.path.join(ROOT, 'tools', '.eleven_key')).read().strip() if os.path.exists(os.path.join(ROOT, 'tools', '.eleven_key')) else None)
if not key: sys.exit('Falta ELEVEN_API_KEY')
m = json.load(open(os.path.join(ROOT, 'voces', 'manifest.json'), encoding='utf-8'))[args.lang]
dud_path = os.path.join(ROOT, 'voces', f'dudosos_{args.lang}.json')

def norm(s):
    s = unicodedata.normalize('NFD', s.lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9ñ ]+', ' ', s.replace('ñ', 'Ñ')).replace('Ñ', 'ñ'); return re.sub(r'\s+', ' ', s).strip()

LETTERS_ES = {'a': 'a', 'b': 'be', 'c': 'ce', 'd': 'de', 'e': 'e', 'f': 'efe', 'g': 'ge', 'h': 'hache', 'i': 'i', 'j': 'jota', 'k': 'ka', 'l': 'ele', 'm': 'eme', 'n': 'ene', 'ñ': 'eñe', 'o': 'o', 'p': 'pe', 'q': 'cu', 'r': 'erre', 's': 'ese', 't': 'te', 'u': 'u', 'v': 'uve', 'w': 'doble u', 'x': 'equis', 'y': 'ye', 'z': 'zeta'}
ES_U = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciseis','diecisiete','dieciocho','diecinueve','veinte']
EN_U = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty']
def numword(n):
    if n <= 20: return (ES_U if args.lang == 'es' else EN_U)[n]
    d, u = divmod(n, 10)
    if args.lang == 'es': return (['veinti' + ES_U[u]] if d == 2 else [['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'][d] + (' y ' + ES_U[u] if u else '')])[0]
    return ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'][d] + (' ' + EN_U[u] if u else '')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import voz_comun as VC
def ok(expected, heard):
    if VC.score(args.lang, expected, heard) >= 0.8: return True  # misma regla que reparar_voces.py (números y "$10,05" en palabras, pronunciacion.json)
    towords = lambda s: re.sub(r'\b(\d{1,2})\b', lambda mm: numword(int(mm.group(1))), s)  # "7" ↔ "siete" en ambos lados
    heard = re.sub(r'\$(\d+)[,.](\d{2})', lambda mm: f'{mm.group(1)} dólares con {int(mm.group(2))} centavos' if args.lang == 'es' else f'{mm.group(1)} dollars and {int(mm.group(2))} cents', heard)
    heard = re.sub(r'\$(\d+)', lambda mm: f'{mm.group(1)} dólares' if args.lang == 'es' else f'{mm.group(1)} dollars', heard)
    e, h = norm(towords(expected)), norm(towords(heard))
    if not h: return False
    if e == h or difflib.SequenceMatcher(None, e, h).ratio() >= 0.8: return True
    # letras sueltas: la transcripción suele dar el nombre ("eme") o "eh"/"ah"
    if len(e) == 1 and (h in (LETTERS_ES.get(e, ''), e, e + 'h', 'eh', 'ah', 'oh', 'uh', 'ih')): return True
    # sonidos alargados (mmm, sss) y onomatopeyas: basta con que empiece igual
    if re.fullmatch(r'(.)\1{1,}', e) and h.startswith(e[0]): return True
    return False

def stt(path):
    b = uuid.uuid4().hex; data = open(path, 'rb').read()
    body = (f'--{b}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n--{b}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\n{args.lang}\r\n--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + data + f'\r\n--{b}--\r\n'.encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/speech-to-text', data=body, headers={'xi-api-key': key, 'Content-Type': f'multipart/form-data; boundary={b}'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r: return json.load(r).get('text', '')
        except urllib.error.HTTPError as e:
            if e.code == 429: import time; time.sleep(2 * (attempt + 1)); continue
            return 'ERROR %s' % e.code
        except Exception: pass
    return 'ERROR'

if args.reparar:
    dud = json.load(open(dud_path)) if os.path.exists(dud_path) else []
    n = 0
    for d in dud:
        p = os.path.join(ROOT, 'voces', args.lang, d['hash'] + '.mp3')
        if os.path.exists(p): os.remove(p); n += 1
    print(f'{n} audios borrados; vuelve a correr generar_audio.py voces-{args.lang} (usa tools/pronunciacion.json si existe) y luego verifica otra vez.'); sys.exit(0)

items = [(t, h) for t, h in m.items() if os.path.exists(os.path.join(ROOT, 'voces', args.lang, h + '.mp3'))]
if args.cortas: items = [(t, h) for t, h in items if len(t.split()) <= 3]
if args.limite: items = items[:args.limite]
print(f'{len(items)} audios a verificar')
dud = []; done = 0
def check(it):
    t, h = it; heard = stt(os.path.join(ROOT, 'voces', args.lang, h + '.mp3')); return t, h, heard
with ThreadPoolExecutor(max_workers=args.workers) as ex:
    for t, h, heard in ex.map(check, items):
        done += 1
        if not ok(t, heard): dud.append({'text': t, 'hash': h, 'heard': heard}); print(f'  ✗ "{t}" → "{heard}"')
        if done % 100 == 0: print(f'  {done}/{len(items)} · dudosos {len(dud)}')
json.dump(dud, open(dud_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'Listo: {len(dud)} dudosos de {len(items)} → {dud_path}')
