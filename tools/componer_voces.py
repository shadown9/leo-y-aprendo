#!/usr/bin/env python3
"""Compone las frases-lista ("ba, be, bi", "A, E, I, O, U", "A, B, C, D, E, F, G") pegando los audios de sus partes,
que ya están verificados (cada sílaba o nombre de letra se grabó dentro de una frase portadora). Así suenan igual que
cuando el niño toca cada parte, y no dependen de que el modelo lea bien una lista.

  python3 tools/componer_voces.py --lang es
Las partes que falten (p. ej. "ka" o "ye", que no son sílabas de la app) se generan con portadora en una carpeta temporal."""
import argparse, base64, json, os, re, subprocess, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.join(ROOT, 'tools'))
import voz_comun as VC
ap = argparse.ArgumentParser(); ap.add_argument('--lang', default='es'); ap.add_argument('--voice', default='Daniela - Energetic'); ap.add_argument('--pausa', type=float, default=0.28); args = ap.parse_args()
key = os.environ.get('ELEVEN_API_KEY') or open(os.path.join(ROOT, 'tools', '.eleven_key')).read().strip()
m = json.load(open(os.path.join(ROOT, 'voces', 'manifest.json'), encoding='utf-8'))[args.lang]
def djb2(s):
    x = 5381
    for ch in s: x = ((x << 5) + x + ord(ch)) & 0xFFFFFFFF
    return format(x, '08x')
def api(path, body=None, accept='application/json'):
    req = urllib.request.Request('https://api.elevenlabs.io/v1' + path, data=json.dumps(body).encode() if body is not None else None, headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': accept})
    with urllib.request.urlopen(req, timeout=90) as r: return r.read()
voice = None
def voice_id():
    global voice
    if voice: return voice
    if re.fullmatch(r'[A-Za-z0-9]{15,}', args.voice): voice = args.voice; return voice  # ya es un voice_id
    vs = json.loads(api('/voices'))['voices']; q = args.voice.lower(); voice = ([v for v in vs if v['name'].lower() == q] or [v for v in vs if q in v['name'].lower()])[0]['voice_id']; return voice
TMP = os.path.join(ROOT, 'voces', '_partes_' + args.lang); os.makedirs(TMP, exist_ok=True)
def part_file(p):
    """Audio de una parte: el del manifest si existe; si no, se genera con portadora en la carpeta temporal."""
    if p in m and os.path.exists(os.path.join(ROOT, 'voces', args.lang, m[p] + '.mp3')): return os.path.join(ROOT, 'voces', args.lang, m[p] + '.mp3')
    dest = os.path.join(TMP, djb2(args.lang + '|' + p) + '.mp3')
    if os.path.exists(dest): return dest
    target = VC.spoken(args.lang, p); carrier = VC.CARRIER[args.lang].replace('{x}', target)
    body = {'text': carrier, 'model_id': 'eleven_turbo_v2_5', 'language_code': args.lang, 'voice_settings': {'stability': 0.8, 'similarity_boost': 0.8, 'style': 0.15, 'use_speaker_boost': True, 'speed': 0.9}}
    j = json.loads(api(f'/text-to-speech/{voice_id()}/with-timestamps?output_format=mp3_22050_32', body)); al = j.get('alignment') or j.get('normalized_alignment')
    s = ''.join(al['characters']); i = s.rfind(target); t0 = max(0, al['character_start_times_seconds'][i] - 0.04); t1 = al['character_end_times_seconds'][i + len(target) - 1] + 0.08
    open(dest + '.full', 'wb').write(base64.b64decode(j['audio_base64']))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', dest + '.full', '-ss', f'{t0:.3f}', '-to', f'{t1:.3f}', '-c:a', 'libmp3lame', '-b:a', '32k', '-ar', '22050', '-f', 'mp3', dest], check=True); os.remove(dest + '.full'); print(f'  parte generada: "{p}"'); return dest
def compose(parts, dest):
    files = [part_file(p) for p in parts]; n = len(files)
    filt = ''.join(f'[{i}:a]apad=pad_dur={args.pausa}[a{i}];' for i in range(n - 1)) + ''.join(f'[a{i}]' for i in range(n - 1)) + f'[{n - 1}:a]concat=n={n}:v=0:a=1[out]'
    cmd = ['ffmpeg', '-y', '-loglevel', 'error'] + sum([['-i', f] for f in files], []) + ['-filter_complex', filt, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '32k', '-ar', '22050', '-f', 'mp3', dest]
    subprocess.run(cmd, check=True)
# Qué frases se componen: las que son listas separadas por comas y cuyas partes son letras, nombres de letra o sílabas.
def letter_parts(text):
    """'A, B, C' → nombres de letra en el idioma; 'ba, be, bi' → las sílabas tal cual."""
    sp = VC.spoken(args.lang, text)  # pronunciacion.json ya convierte "A, B, C" en "a, be, ce"
    parts = [p.strip() for p in re.split(r',\s*', sp) if p.strip()]
    return parts if len(parts) >= 2 and all(len(p) <= 7 and ' ' not in p or p == 'doble u' for p in parts) else None
n = 0
for text, hsh in m.items():
    if text in (VC.PRON.get(args.lang) or {}): continue  # tiene escritura fonética propia: se graba entera, no se compone
    parts = letter_parts(text)
    if not parts: continue
    dest = os.path.join(ROOT, 'voces', args.lang, hsh + '.mp3')
    try: compose(parts, dest); n += 1; print(f'✓ "{text}" ← {parts}')
    except Exception as e: print(f'✗ "{text}": {e}')
print(f'{n} frases compuestas')
