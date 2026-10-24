#!/usr/bin/env python3
"""Monta una canción con la VOZ GRABADA de la app (clips ya verificados) sobre una pista instrumental de Eleven Music.
Para letras que el modelo de música no pronuncia bien (el abecedario en español: cantaba "ei, bi, si"). Los tiempos
de la letra salen exactos, sin transcribir.

  python3 tools/componer_cancion.py --id abc --lang es
Usa tools/songs.json: "lyrics" (lo que se ve) y "sing" (las partes que se dicen, separadas por comas: letras, nombres de letra o frases).
Cada parte debe existir como clip en voces/<lang>/ (está en el manifest). La pista instrumental se genera una vez en canciones/_pista_<id>.<lang>.mp3."""
import argparse, json, os, subprocess, sys, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'canciones')
ap = argparse.ArgumentParser(); ap.add_argument('--id', required=True); ap.add_argument('--lang', default='es'); ap.add_argument('--gap', type=float, default=0.42, help='silencio entre partes de una línea'); ap.add_argument('--line-gap', type=float, default=1.1); ap.add_argument('--intro', type=float, default=1.6); ap.add_argument('--music', type=float, default=0.32, help='volumen de la pista'); args = ap.parse_args()
key = os.environ.get('ELEVEN_API_KEY') or open(os.path.join(ROOT, 'tools', '.eleven_key')).read().strip()
song = json.load(open(os.path.join(ROOT, 'tools', 'songs.json'), encoding='utf-8'))[args.id]; L = args.lang
lyrics = song[L]['lyrics']; sing = song[L].get('sing', lyrics); m = json.load(open(os.path.join(ROOT, 'voces', 'manifest.json'), encoding='utf-8'))[L]
def dur(p): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip())
def find(text):
    t = text.strip().strip('¡!¿?.').strip()
    for c in [text.strip(), t, t.lower(), t.capitalize()]:
        if c in m and os.path.exists(os.path.join(ROOT, 'voces', L, m[c] + '.mp3')): return os.path.join(ROOT, 'voces', L, m[c] + '.mp3')
    return None
def clip(text):
    f = find(text)
    if not f: sys.exit(f'No hay clip grabado para "{text}" en {L}: añádelo al manifest (build_manifest) y genera la voz.')
    return f
# 1) pista instrumental (una vez)
bed = os.path.join(OUT, f'_pista_{args.id}.{L}.mp3')
if not os.path.exists(bed):
    style = {'es': 'Pista instrumental infantil alegre y suave para una canción del abecedario: ukelele, palmas, xilófono, tempo lento y constante, sin voces, melodía sencilla que se repite.', 'en': 'Gentle, cheerful children\'s instrumental for an alphabet song: ukulele, hand claps, xylophone, slow steady tempo, no vocals, simple repeating melody.'}[L]
    body = {'prompt': style, 'music_length_ms': 70000, 'force_instrumental': True, 'model_id': 'music_v2_5'}
    req = urllib.request.Request('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', data=json.dumps(body).encode(), headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    with urllib.request.urlopen(req, timeout=300) as r: open(bed, 'wb').write(r.read()); print('pista instrumental generada')
# 2) voz: partes con silencios; apuntar el inicio de cada línea
parts = []; times = []; t = args.intro
for ln, shown in zip(sing, lyrics):
    times.append(round(t, 2))
    # la frase entera grabada (lo que se ve en pantalla) manda; si no existe, se dicen las partes separadas por comas
    pieces = [shown] if find(shown) else ([p for p in ln.split(',')] if ',' in ln else [ln])
    for i, p in enumerate(pieces):
        f = clip(p); d = dur(f); gap = args.gap if i < len(pieces) - 1 else args.line_gap
        parts.append((f, gap)); t += d + gap
total = t
tmp = os.path.join(OUT, f'_voz_{args.id}.{L}.wav')
inputs = sum([['-i', f] for f, _ in parts], []); n = len(parts)
filt = f'aevalsrc=0:d={args.intro}[s0];' + ''.join(f'[{i}:a]aresample=44100,apad=pad_dur={g}[a{i}];' for i, (_, g) in enumerate(parts)) + '[s0]' + ''.join(f'[a{i}]' for i in range(n)) + f'concat=n={n + 1}:v=0:a=1[v]'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + inputs + ['-filter_complex', filt, '-map', '[v]', tmp], check=True)
# 3) mezcla: pista en bucle bajo la voz, fundido final
out = os.path.join(OUT, f'{args.id}.{L}.mp3'); end = total + 1.5
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-stream_loop', '-1', '-i', bed, '-filter_complex', f'[1:a]volume={args.music},atrim=0:{end:.2f},afade=t=out:st={end - 2:.2f}:d=2[b];[0:a]apad=pad_dur=1.5[v];[v][b]amix=inputs=2:duration=first:dropout_transition=0,volume=1.6[o]', '-map', '[o]', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', out], check=True)
os.remove(tmp)
json.dump({'lines': [{'t': tt, 'text': ln} for tt, ln in zip(times, lyrics)]}, open(os.path.join(OUT, f'{args.id}.{L}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{out}: {dur(out):.1f} s, {len(lyrics)} líneas; tiempos: {times}')
