#!/usr/bin/env python3
"""Elige, para cada animal, la grabación candidata que un reconocedor identifica como ese animal.

Usa Scribe (ElevenLabs speech-to-text, scribe_v1) con etiquetado de eventos de audio: para un ladrido devuelve
texto tipo "(dog barking)". No gasta créditos de caracteres. Si ninguna candidata se reconoce, el animal queda
PENDIENTE (no se publica basura: mejor avisar que degradar).

Uso:  python3 tools/verificar_sonidos.py --cand /ruta/candidatas [--aplicar]
  --aplicar copia la elegida a sonidos/<clave>.mp3, añade su autoría a sonidos/creditos.json y reconstruye sonidos/index.json
"""
import argparse, glob, json, os, re, shutil, sys, time, urllib.request, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'sonidos')
KEY = open(os.path.join(ROOT, 'tools', '.eleven_key')).read().strip()
# Palabras que debe contener la etiqueta de Scribe para dar por bueno el sonido
ESPERADO = {
  'dog bark': ['dog', 'bark', 'woof'], 'cat meow': ['cat', 'meow', 'kitten'], 'cow moo': ['cow', 'moo', 'cattle'], 'pig oink': ['pig', 'oink', 'grunt', 'squeal', 'hog'],
  'chicken cluck': ['chicken', 'hen', 'cluck', 'rooster', 'crow'], 'sheep bleat': ['sheep', 'bleat', 'baa', 'goat', 'lamb'], 'horse neigh': ['horse', 'neigh', 'whinn'],
  'duck quack': ['duck', 'quack'], 'frog croak': ['frog', 'croak', 'toad'], 'lion roar': ['lion', 'roar', 'growl'], 'elephant trumpet': ['elephant', 'trumpet'],
  'monkey': ['monkey', 'chimp', 'ape', 'primate', 'macaque', 'howl'], 'wolf howl': ['wolf', 'howl'], 'owl hoot': ['owl', 'hoot'], 'bee buzz': ['bee', 'buzz', 'insect', 'fly'],
  'bird chirp': ['bird', 'chirp', 'tweet', 'sing', 'song'], 'dolphin click': ['dolphin', 'click', 'whistle', 'squeak', 'chirp'], 'whale song': ['whale', 'moan', 'song', 'underwater'],
  'rabbit': ['rabbit', 'bunny', 'squeak', 'purr', 'grunt', 'animal'], 'penguin': ['penguin', 'bird', 'squawk', 'call', 'honk'], 'fox': ['fox', 'bark', 'scream', 'animal', 'yelp'],
  'turtle': ['turtle', 'tortoise', 'hiss', 'animal', 'breath'], 'butterfly': ['flutter', 'wing', 'flap', 'rustl'],
}

def scribe(path):
    b = uuid.uuid4().hex; data = open(path, 'rb').read()
    body = (f'--{b}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n--{b}\r\nContent-Disposition: form-data; name="tag_audio_events"\r\n\r\ntrue\r\n'
            f'--{b}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\nen\r\n--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + data + f'\r\n--{b}--\r\n'.encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/speech-to-text', data=body, headers={'xi-api-key': KEY, 'Content-Type': f'multipart/form-data; boundary={b}'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r: return json.load(r).get('text', '')
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(3 * (attempt + 1)); continue
            return 'ERROR %s %s' % (e.code, e.read()[:120])
        except Exception as e: err = e; time.sleep(2)
    return 'ERROR'

def duracion(path):
    import subprocess
    try: return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).strip())
    except Exception: return 0.0

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--cand', required=True); ap.add_argument('--aplicar', action='store_true'); ap.add_argument('--only', nargs='*'); a = ap.parse_args()
    elegidos, pendientes = {}, []
    for clave, palabras in ESPERADO.items():
        if a.only and clave not in a.only: continue
        base = clave.replace(' ', '_'); cands = sorted(glob.glob(os.path.join(a.cand, base + '.*.mp3')))
        print(f'\n== {clave}: {len(cands)} candidatas')
        buenos = []
        for c in cands:
            txt = scribe(c); low = txt.lower()
            hit = [w for w in palabras if w in low]
            print(f"   {'✔' if hit else '·'} {os.path.basename(c)}  → {txt[:90]!r}")
            if hit: buenos.append(c)
        # Entre las reconocidas, la más larga (hasta 3,5 s): un ladrido de 1 s se queda corto para un niño
        ok = max(buenos, key=duracion) if buenos else None
        if ok: elegidos[clave] = ok
        else: pendientes.append(clave)
    print('\nElegidos:', len(elegidos), '| Pendientes:', pendientes)
    if a.aplicar:
        os.makedirs(OUT, exist_ok=True); cred_path = os.path.join(OUT, 'creditos.json')
        cred = json.load(open(cred_path)) if os.path.exists(cred_path) else {}
        for clave, c in elegidos.items():
            shutil.copy(c, os.path.join(OUT, clave.replace(' ', '_') + '.mp3'))
            meta = json.load(open(c[:-4] + '.json'))
            cred[clave] = {k: meta.get(k) for k in ('title', 'author', 'license', 'page')}
        json.dump(cred, open(cred_path, 'w'), ensure_ascii=False, indent=1)
        idx = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.mp3')); json.dump(idx, open(os.path.join(OUT, 'index.json'), 'w'))
        print('sonidos/index.json:', len(idx), 'sonidos; créditos:', len(cred))
    json.dump({'elegidos': elegidos, 'pendientes': pendientes}, open(os.path.join(a.cand, '_resultado.json'), 'w'), indent=1)

if __name__ == '__main__': main()
