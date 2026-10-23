#!/usr/bin/env python3
"""Genera las canciones educativas con Eleven Music → canciones/<id>.<lang>.mp3 y canciones/<id>.<lang>.json (letra con tiempos).
Las letras y el estilo están en tools/songs.json. Uso:
   export ELEVEN_API_KEY=...
   python3 tools/generate_songs.py --only vocales --lang es        # una canción para probar
   python3 tools/generate_songs.py                                 # todas las que falten
Si la API de música no está disponible en tu plan, genera la canción en la app/web de ElevenLabs con el mismo prompt
(impreso con --show) y guarda el mp3 con ese nombre; luego ejecuta con --sync para crear el .json de la letra."""
import argparse, json, os, sys, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'canciones')
ap = argparse.ArgumentParser(); ap.add_argument('--only'); ap.add_argument('--lang', choices=['es', 'en']); ap.add_argument('--show', action='store_true'); ap.add_argument('--sync', action='store_true'); ap.add_argument('--length', type=int, default=75000, help='ms'); args = ap.parse_args()
os.makedirs(OUT, exist_ok=True); songs = json.load(open(os.path.join(ROOT, 'tools', 'songs.json'), encoding='utf-8'))
key = os.environ.get('ELEVEN_API_KEY')
def duration(path):
    try:
        import subprocess; return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode().strip())
    except Exception: return None
def write_lyrics_json(sid, lang, lines, path_mp3):
    # Reparte la letra uniformemente en la duración (aproximado; se puede afinar a mano editando el .json)
    dur = duration(path_mp3) or (args.length / 1000); n = len(lines); intro = min(4, dur * 0.06)
    data = {'lines': [{'t': round(intro + i * (dur - intro) / n, 2), 'text': ln} for i, ln in enumerate(lines)]}
    json.dump(data, open(os.path.join(OUT, f'{sid}.{lang}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for sid, song in songs.items():
    for lang in ['es', 'en']:
        if args.only and sid != args.only: continue
        if args.lang and lang != args.lang: continue
        lyrics = song[lang]['lyrics']; style = song['style']; mp3 = os.path.join(OUT, f'{sid}.{lang}.mp3')
        prompt = f"{style}. Lyrics:\n" + "\n".join(lyrics)
        if args.show: print(f'=== {sid} ({lang}) ===\n{prompt}\n'); continue
        if args.sync:
            if os.path.exists(mp3): write_lyrics_json(sid, lang, lyrics, mp3); print('json', sid, lang)
            continue
        if os.path.exists(mp3): print('ya existe', sid, lang); write_lyrics_json(sid, lang, lyrics, mp3); continue
        if not key: sys.exit('Falta ELEVEN_API_KEY')
        body = json.dumps({'prompt': prompt, 'music_length_ms': args.length, 'force_instrumental': False}).encode()
        req = urllib.request.Request('https://api.elevenlabs.io/v1/music', data=body, headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
        try:
            with urllib.request.urlopen(req, timeout=300) as r: audio = r.read()
            open(mp3, 'wb').write(audio); write_lyrics_json(sid, lang, lyrics, mp3); print('ok', sid, lang, len(audio) // 1024, 'KB')
        except urllib.error.HTTPError as e: print('ERROR', sid, lang, e.code, e.read().decode(errors='ignore')[:300])
        except Exception as e: print('ERROR', sid, lang, e)
