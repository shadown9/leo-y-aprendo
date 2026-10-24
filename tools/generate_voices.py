#!/usr/bin/env python3
"""Genera los audios de la app con ElevenLabs.

Lo normal es usar el orquestador:  python3 tools/generar_audio.py check | prueba | voces-es | voces-en | publicar
Uso directo:
 1. node tools/build_manifest.js          -> crea voces/manifest.json
 2. export ELEVEN_API_KEY=tu_clave        (o guárdala en tools/.eleven_key)
 3. python3 tools/generate_voices.py --voice-es Daniela --voice-en "Nombre o ID"
    --only es|en   un solo idioma      --dry-run   solo cuenta caracteres      --limit N   genera solo N frases (prueba)

Los archivos van a voces/es/<hash>.mp3 y voces/en/<hash>.mp3 y se escribe voces/index.json = {"es":[...],"en":[...]}.
Si se corta, vuelve a ejecutarlo: los audios ya hechos no se regeneran.
"""
import argparse, json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCES = os.path.join(ROOT, 'voces')
API = 'https://api.elevenlabs.io/v1'

ap = argparse.ArgumentParser()
ap.add_argument('--voice-es', help='ID o nombre de la voz en español (p. ej. Daniela)'); ap.add_argument('--voice-en', help='ID o nombre de la voz en inglés')
ap.add_argument('--only', choices=['es', 'en']); ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--limit', type=int, help='generar solo N frases (para escuchar antes de gastar)')
ap.add_argument('--model', default='eleven_turbo_v2_5')  # permite forzar el idioma (language_code); multilingual_v2 leía "E" o "gallina" en inglés/italiano
ap.add_argument('--stability', type=float, default=0.45)      # más bajo = más expresivo
ap.add_argument('--similarity', type=float, default=0.8)
ap.add_argument('--style', type=float, default=0.35)          # exageración de estilo (alegría)
ap.add_argument('--speed', type=float, default=0.9)           # habla dirigida a niños: un poco más despacio
ap.add_argument('--format', default='mp3_22050_32')           # ~4 KB/s: 2.700 frases ≈ 25 MB por idioma
ap.add_argument('--workers', type=int, default=3)
ap.add_argument('--list', action='store_true', help='Lista tus voces (nombre, ID, idiomas) y sale')
args = ap.parse_args()

def read_key():
    k = os.environ.get('ELEVEN_API_KEY')
    if not k:
        f = os.path.join(ROOT, 'tools', '.eleven_key')
        if os.path.exists(f): k = open(f).read().strip()
    return k
key = read_key()

def api(path, body=None, accept='application/json', timeout=60):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': accept})
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()

def list_voices():
    return json.loads(api('/voices'))['voices']

def resolve_voice(name_or_id):
    """Acepta un voice_id (20 caracteres alfanuméricos) o un nombre, sin distinguir mayúsculas."""
    if not name_or_id: return None
    if re.fullmatch(r'[A-Za-z0-9]{15,}', name_or_id): return name_or_id
    vs = list_voices(); q = name_or_id.strip().lower()
    hit = [v for v in vs if v['name'].strip().lower() == q] or [v for v in vs if v['name'].strip().lower().startswith(q)] or [v for v in vs if q in v['name'].lower()]
    if not hit: sys.exit(f'No encuentro una voz llamada "{name_or_id}" en Mis Voces. Tienes: ' + ', '.join(v['name'] for v in vs) + '. Añádela desde la biblioteca (Voces → Explorar → Añadir).')
    if len(hit) > 1: print(f'  Varias voces coinciden con "{name_or_id}"; uso "{hit[0]["name"]}". Otras: ' + ', '.join(v['name'] for v in hit[1:]))
    print(f'  Voz: {hit[0]["name"]} ({hit[0]["voice_id"]})'); return hit[0]['voice_id']

if args.list:
    if not key: sys.exit('Falta ELEVEN_API_KEY')
    for v in list_voices():
        labels = v.get('labels') or {}
        print(f"{v['name']:<28} {v['voice_id']}   {labels.get('language','')} {labels.get('accent','')} {labels.get('gender','')} {labels.get('age','')}")
    sys.exit(0)

manifest = json.load(open(os.path.join(VOCES, 'manifest.json'), encoding='utf-8'))
langs = [args.only] if args.only else ['es', 'en']
voices = {'es': args.voice_es, 'en': args.voice_en}
send_lang = bool(re.search(r'v2_5|turbo|flash', args.model))  # language_code solo lo soportan los modelos v2.5; multilingual_v2 lo ignora

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voz_comun import spoken, needs_carrier, CARRIER  # reglas compartidas: pronunciacion.json, números en palabras, qué va con portadora
def cut_from_carrier(lang, text, body, dest):
    import base64, subprocess
    target = body['text']; carrier = CARRIER[lang].replace('{x}', target)
    if re.search(r'[.!?]$', target): carrier = carrier.rstrip('.')  # "¡Oso!" ya trae su signo
    body = dict(body, text=carrier)
    j = json.loads(api(f'/text-to-speech/{voices[lang]}/with-timestamps?output_format={args.format}', body))
    al = j.get('alignment') or j.get('normalized_alignment'); s = ''.join(al['characters']); i = s.rfind(target)
    if i < 0: raise RuntimeError(f'no encuentro "{target}" en la alineación "{s}"')
    t0 = max(0, al['character_start_times_seconds'][i] - 0.04); t1 = al['character_end_times_seconds'][i + len(target) - 1] + 0.08
    if t1 - t0 < 0.12: raise RuntimeError(f'corte demasiado corto ({t1 - t0:.2f} s) para "{target}"')
    with open(dest + '.full', 'wb') as f: f.write(base64.b64decode(j['audio_base64']))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', dest + '.full', '-ss', f'{t0:.3f}', '-to', f'{t1:.3f}', '-c:a', 'libmp3lame', '-b:a', '32k', '-ar', '22050', '-f', 'mp3', dest + '.part'], check=True)
    os.remove(dest + '.full')
def synth(lang, text, dest):
    body = {'text': spoken(lang, text), 'model_id': args.model,
            'voice_settings': {'stability': args.stability, 'similarity_boost': args.similarity, 'style': args.style, 'use_speaker_boost': True, 'speed': args.speed}}
    if send_lang: body['language_code'] = lang
    last = None
    for attempt in range(4):
        try:
            if needs_carrier(text): cut_from_carrier(lang, text, body, dest); os.replace(dest + '.part', dest); return True
            data = api(f'/text-to-speech/{voices[lang]}?output_format={args.format}', body, accept='audio/mpeg')
            if len(data) < 500: raise RuntimeError(f'audio demasiado corto ({len(data)} bytes)')
            with open(dest + '.part', 'wb') as f: f.write(data)
            os.replace(dest + '.part', dest); return True
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='ignore')[:300]
            if e.code == 429: time.sleep(3 * (attempt + 1)); continue
            if e.code == 401: sys.exit('Clave de ElevenLabs rechazada (401). Revisa ELEVEN_API_KEY.')
            if e.code == 400 and 'language' in msg and 'language_code' in body: body.pop('language_code'); continue
            print(f'  ERROR {e.code} en "{text}": {msg}'); return False
        except Exception as e:
            last = e; time.sleep(2)
    print(f'  ERROR en "{text}": {last}'); return False

total_chars = 0
for lang in langs:
    items = manifest[lang]; os.makedirs(os.path.join(VOCES, lang), exist_ok=True)
    pending = [(t, hsh) for t, hsh in items.items() if not os.path.exists(os.path.join(VOCES, lang, hsh + '.mp3'))]
    if args.limit:  # muestra repartida por todo el contenido, con frases de largo medio (no "1", "2", "3")
        cands = [p for p in pending if 12 <= len(p[0]) <= 70] or pending; step = max(1, len(cands) // args.limit); pending = cands[::step][:args.limit]
    chars = sum(len(t) for t, _ in pending); total_chars += chars
    print(f'[{lang}] {len(items)} frases, {len(pending)} por generar, {chars} caracteres')
    if args.dry_run or not pending: continue
    if not key: sys.exit('Falta ELEVEN_API_KEY (export ELEVEN_API_KEY=sk_... o guárdala en tools/.eleven_key)')
    if not voices[lang]: sys.exit(f'Falta --voice-{lang} (nombre o ID de la voz)')
    voices[lang] = resolve_voice(voices[lang]); print(f'[{lang}] voz: {voices[lang]}')
    done = 0; failed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for ok in ex.map(lambda p: synth(lang, p[0], os.path.join(VOCES, lang, p[1] + '.mp3')), pending):
            done += 1; failed += 0 if ok else 1
            if done % 25 == 0: print(f'  {done}/{len(pending)}')
    have = [f[:-4] for f in os.listdir(os.path.join(VOCES, lang)) if f.endswith('.mp3')]
    print(f'[{lang}] listos: {len(have)}' + (f' · fallaron {failed} (vuelve a ejecutar para reintentar)' if failed else ''))
    if args.limit: print(f'[{lang}] prueba: ' + ' | '.join(f'"{t}" -> voces/{lang}/{h}.mp3' for t, h in pending[:5]))

index = {lang: sorted(f[:-4] for f in os.listdir(os.path.join(VOCES, lang)) if f.endswith('.mp3')) if os.path.isdir(os.path.join(VOCES, lang)) else [] for lang in ['es', 'en']}
json.dump(index, open(os.path.join(VOCES, 'index.json'), 'w'))
print(f'Total caracteres {"a usar" if args.dry_run else "usados"}: {total_chars}. index.json actualizado (es {len(index["es"])}, en {len(index["en"])}).')
