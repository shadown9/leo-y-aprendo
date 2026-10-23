#!/usr/bin/env python3
"""Genera sonidos de animales con el generador de efectos de ElevenLabs → sonidos/<clave>.mp3 + sonidos/index.json
Uso:  export ELEVEN_API_KEY=...;  python3 tools/generate_sfx.py  [--dry-run] [--seconds 3]
Las claves salen de data.js (campo 7 de cada animal, p. ej. "dog bark"). Si prefieres grabaciones reales (Pixabay/Freesound CC0),
guárdalas tú mismo con ese nombre en sonidos/ y ejecuta:  python3 tools/generate_sfx.py --index   (solo reconstruye el índice)."""
import argparse, json, os, re, subprocess, sys, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'sonidos')
ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--seconds', type=float, default=3.0); ap.add_argument('--index', action='store_true'); args = ap.parse_args()
os.makedirs(OUT, exist_ok=True)
def rebuild_index():
    idx = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.mp3')); json.dump(idx, open(os.path.join(OUT, 'index.json'), 'w')); print(f'index.json: {len(idx)} sonidos'); return idx
if args.index: rebuild_index(); sys.exit(0)
data = subprocess.check_output(['node', '-e', "global.window={};require(process.argv[1]);console.log(JSON.stringify(window.LYA_DATA.es.animals.map(a=>a[6])))", os.path.join(ROOT, 'data.js')])
prompts = json.loads(data)
key = os.environ.get('ELEVEN_API_KEY')
todo = [(p, p.replace(' ', '_')) for p in prompts if not os.path.exists(os.path.join(OUT, p.replace(' ', '_') + '.mp3'))]
print(f'{len(prompts)} sonidos, {len(todo)} por generar, ~{int(len(todo) * args.seconds)} s de audio')
if args.dry_run: sys.exit(0)
if not key: sys.exit('Falta ELEVEN_API_KEY')
for prompt, name in todo:
    body = json.dumps({'text': f'realistic single {prompt} sound, animal recording, no music', 'duration_seconds': args.seconds, 'prompt_influence': 0.5}).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation', data=body, headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r: audio = r.read()
            open(os.path.join(OUT, name + '.mp3'), 'wb').write(audio); print('ok', name); break
        except urllib.error.HTTPError as e:
            print('ERROR', name, e.code, e.read().decode(errors='ignore')[:150]);
            if e.code == 429: time.sleep(5); continue
            break
        except Exception as e: print('ERROR', name, e); time.sleep(2)
rebuild_index()
