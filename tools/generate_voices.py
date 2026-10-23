#!/usr/bin/env python3
"""Genera los audios de la app con ElevenLabs.

Pasos:
 1. node tools/build_manifest.js          -> crea voces/manifest.json
 2. export ELEVEN_API_KEY=tu_clave
 3. python3 tools/generate_voices.py --voice-es ID_VOZ_ES --voice-en ID_VOZ_EN
    (añade --only es  o  --only en  para un solo idioma; --dry-run para ver el costo sin generar)

Los archivos van a voces/es/<hash>.mp3 y voces/en/<hash>.mp3 y se escribe voces/index.json.
Si se corta, vuelve a ejecutarlo: los audios ya hechos no se regeneran.
"""
import argparse, json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCES = os.path.join(ROOT, 'voces')
API = 'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_22050_32'

ap = argparse.ArgumentParser()
ap.add_argument('--voice-es'); ap.add_argument('--voice-en')
ap.add_argument('--only', choices=['es', 'en']); ap.add_argument('--dry-run', action='store_true')
ap.add_argument('--model', default='eleven_multilingual_v2')
ap.add_argument('--stability', type=float, default=0.45)      # más bajo = más expresivo
ap.add_argument('--similarity', type=float, default=0.8)
ap.add_argument('--style', type=float, default=0.35)          # exageración de estilo (alegría)
ap.add_argument('--workers', type=int, default=3)
args = ap.parse_args()

key = os.environ.get('ELEVEN_API_KEY')
manifest = json.load(open(os.path.join(VOCES, 'manifest.json'), encoding='utf-8'))
langs = [args.only] if args.only else ['es', 'en']
voices = {'es': args.voice_es, 'en': args.voice_en}

def synth(lang, text, dest):
    body = json.dumps({'text': text, 'model_id': args.model, 'language_code': lang,
                       'voice_settings': {'stability': args.stability, 'similarity_boost': args.similarity, 'style': args.style, 'use_speaker_boost': True}}).encode()
    req = urllib.request.Request(API.format(voice=voices[lang]), data=body, headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(dest + '.part', 'wb') as f: f.write(data)
            os.replace(dest + '.part', dest); return True
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='ignore')[:200]
            if e.code == 429: time.sleep(3 * (attempt + 1)); continue
            print(f'  ERROR {e.code} en "{text}": {msg}'); return False
        except Exception as e:
            time.sleep(2); last = e
    print(f'  ERROR en "{text}": {last}'); return False

total_chars = 0
for lang in langs:
    items = manifest[lang]; os.makedirs(os.path.join(VOCES, lang), exist_ok=True)
    pending = [(t, hsh) for t, hsh in items.items() if not os.path.exists(os.path.join(VOCES, lang, hsh + '.mp3'))]
    chars = sum(len(t) for t, _ in pending); total_chars += chars
    print(f'[{lang}] {len(items)} frases, {len(pending)} por generar, {chars} caracteres')
    if args.dry_run: continue
    if not key: sys.exit('Falta ELEVEN_API_KEY');
    if not voices[lang]: sys.exit(f'Falta --voice-{lang}')
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for ok in ex.map(lambda p: synth(lang, p[0], os.path.join(VOCES, lang, p[1] + '.mp3')), pending):
            done += 1
            if done % 25 == 0: print(f'  {done}/{len(pending)}')
    have = [f[:-4] for f in os.listdir(os.path.join(VOCES, lang)) if f.endswith('.mp3')]
    print(f'[{lang}] listos: {len(have)}')

index = {lang: sorted(f[:-4] for f in os.listdir(os.path.join(VOCES, lang)) if f.endswith('.mp3')) for lang in ['es', 'en'] if os.path.isdir(os.path.join(VOCES, lang))}
json.dump(index, open(os.path.join(VOCES, 'index.json'), 'w'))
print(f'Total caracteres {"a usar" if args.dry_run else "usados"}: {total_chars}. index.json actualizado.')
