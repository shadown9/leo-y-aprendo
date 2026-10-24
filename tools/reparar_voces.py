#!/usr/bin/env python3
"""Repara audios concretos con un bucle de control de calidad: genera → transcribe (Scribe) → acepta solo si dice lo que debe
y dura lo razonable; si no, reintenta (hasta 4 veces, subiendo la estabilidad). Guarda el mejor intento.

  python3 tools/reparar_voces.py --lang es --textos lista.json      # lista JSON de textos del manifest
  python3 tools/reparar_voces.py --lang es --dudosos                # los de voces/dudosos_<lang>.json
Usa tools/pronunciacion.json igual que generate_voices.py y la misma frase portadora para trozos cortos."""
import argparse, base64, difflib, json, os, re, subprocess, sys, time, unicodedata, urllib.request, urllib.error, uuid
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('--lang', default='es'); ap.add_argument('--textos'); ap.add_argument('--dudosos', action='store_true'); ap.add_argument('--voice', default='Daniela - Energetic'); ap.add_argument('--intentos', type=int, default=4); args = ap.parse_args()
key = os.environ.get('ELEVEN_API_KEY') or open(os.path.join(ROOT, 'tools', '.eleven_key')).read().strip()
m = json.load(open(os.path.join(ROOT, 'voces', 'manifest.json'), encoding='utf-8'))[args.lang]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voz_comun as VC
CARRIER = VC.CARRIER[args.lang]
def api(path, body=None, accept='application/json', raw=None, ctype='application/json', timeout=90):
    req = urllib.request.Request('https://api.elevenlabs.io/v1' + path, data=raw if raw is not None else (json.dumps(body).encode() if body is not None else None), headers={'xi-api-key': key, 'Content-Type': ctype, 'Accept': accept})
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()
vs = json.loads(api('/voices'))['voices']; q = args.voice.lower(); voice = ([v for v in vs if v['name'].lower() == q] or [v for v in vs if q in v['name'].lower()])[0]['voice_id']
spoken = lambda t: VC.spoken(args.lang, t); needs_carrier = VC.needs_carrier
def gen(text, dest, stability):
    body = {'text': spoken(text), 'model_id': 'eleven_turbo_v2_5', 'language_code': args.lang, 'voice_settings': {'stability': stability, 'similarity_boost': 0.8, 'style': 0.35 if stability < 0.7 else 0.15, 'use_speaker_boost': True, 'speed': 0.9}}
    if needs_carrier(text):
        target = body['text']; carrier = CARRIER.replace('{x}', target)
        if re.search(r'[.!?]$', target): carrier = carrier.rstrip('.')
        j = json.loads(api(f'/text-to-speech/{voice}/with-timestamps?output_format=mp3_22050_32', dict(body, text=carrier)))
        al = j.get('alignment') or j.get('normalized_alignment'); s = ''.join(al['characters']); i = s.rfind(target)
        t0 = max(0, al['character_start_times_seconds'][i] - 0.04); t1 = al['character_end_times_seconds'][i + len(target) - 1] + 0.08
        open(dest + '.full', 'wb').write(base64.b64decode(j['audio_base64']))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', dest + '.full', '-ss', f'{t0:.3f}', '-to', f'{t1:.3f}', '-c:a', 'libmp3lame', '-b:a', '32k', '-ar', '22050', '-f', 'mp3', dest], check=True); os.remove(dest + '.full')
    else: open(dest, 'wb').write(api(f'/text-to-speech/{voice}?output_format=mp3_22050_32', body, accept='audio/mpeg'))
def stt(path):
    b = uuid.uuid4().hex; data = open(path, 'rb').read()
    raw = (f'--{b}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n--{b}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\n{args.lang}\r\n--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + data + f'\r\n--{b}--\r\n'.encode()
    try: return json.loads(api('/speech-to-text', raw=raw, ctype=f'multipart/form-data; boundary={b}')).get('text', '')
    except Exception: return ''
def dur(path): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode().strip() or 0)
score = lambda text, heard: VC.score(args.lang, text, heard)
textos = json.load(open(args.textos, encoding='utf-8')) if args.textos else [x['text'] for x in json.load(open(os.path.join(ROOT, 'voces', f'dudosos_{args.lang}.json'), encoding='utf-8'))]
textos = [t for t in textos if t in m]
print(f'{len(textos)} textos a reparar')
ok_n = 0
for text in textos:
    dest = os.path.join(ROOT, 'voces', args.lang, m[text] + '.mp3'); best = None
    maxdur = 1.6 if needs_carrier(text) else (0.075 * len(spoken(text)) + 0.4) * 1.45 + 0.6  # con los números ya en palabras
    for k in range(args.intentos):
        tmp = dest + f'.try{k}'; stab = [0.6, 0.8, 0.9, 0.95][min(k, 3)]
        try: gen(text, tmp, stab)
        except Exception as e: print(f'  error generando "{text}": {e}'); time.sleep(2); continue
        d = dur(tmp); heard = stt(tmp); sc = score(text, heard); okdur = 0.12 <= d <= maxdur
        cand = (sc if okdur else sc - 0.5, k, tmp, d, heard)
        if best is None or cand[0] > best[0]: best = cand
        if okdur and (sc >= 0.8 or (len(text.split()) == 1 and sc >= 0.5)): break
    if best:
        for k in range(args.intentos):
            p = dest + f'.try{k}'
            if p != best[2] and os.path.exists(p): os.remove(p)
        os.replace(best[2], dest); good = best[0] >= 0.8 or (len(text.split()) == 1 and best[0] >= 0.5); ok_n += good
        print(f'{"✓" if good else "?"} "{text}" → "{best[4]}" ({best[3]:.2f} s, intento {best[1] + 1}, estabilidad {[0.6, 0.8, 0.9, 0.95][min(best[1], 3)]})')
print(f'Reparados con confirmación: {ok_n} de {len(textos)}')
