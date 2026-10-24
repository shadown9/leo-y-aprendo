#!/usr/bin/env python3
"""Canciones con Eleven Music → canciones/<id>.<lang>.mp3 + canciones/<id>.<lang>.json (letra con tiempos para el karaoke).

  python3 tools/generate_songs.py --only vocales --lang es     # una
  python3 tools/generate_songs.py                              # todas las que falten
  python3 tools/generate_songs.py --sync                       # solo recalcular los tiempos de la letra de los mp3 existentes

La instrucción al modelo va en el idioma de la canción (en inglés mezclaba acento), modelo music_v2_5. Los tiempos de cada línea
se obtienen transcribiendo la canción con Scribe (palabras con tiempo) y alineando la letra; si no se puede, se reparten uniformes."""
import argparse, difflib, json, os, re, sys, unicodedata, urllib.request, urllib.error, uuid
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'canciones')
ap = argparse.ArgumentParser(); ap.add_argument('--only'); ap.add_argument('--lang', choices=['es', 'en']); ap.add_argument('--show', action='store_true'); ap.add_argument('--sync', action='store_true'); ap.add_argument('--length', type=int, default=60000, help='ms'); ap.add_argument('--model', default='music_v2_5'); args = ap.parse_args()
os.makedirs(OUT, exist_ok=True); songs = json.load(open(os.path.join(ROOT, 'tools', 'songs.json'), encoding='utf-8'))
key = os.environ.get('ELEVEN_API_KEY') or (open(os.path.join(ROOT, 'tools', '.eleven_key')).read().strip() if os.path.exists(os.path.join(ROOT, 'tools', '.eleven_key')) else None)
STYLE = {
  'es': 'Canción infantil educativa en ESPAÑOL latinoamericano, cantada íntegramente en español con pronunciación clara y neutra (sin acento inglés). Cantante femenina alegre y dulce, coro de niños en el estribillo, ukelele y palmas, tempo lento y claro, melodía sencilla y pegadiza. Letra (en español, cantar exactamente estas palabras):',
  'en': 'Educational children\'s song in clear American ENGLISH. Cheerful, sweet female singer, kids choir on the chorus, ukulele and hand claps, slow clear tempo, simple catchy melody. Lyrics (sing exactly these words):',
}
def duration(path):
    import subprocess
    try: return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode().strip())
    except Exception: return None
def norm(s): s = unicodedata.normalize('NFD', s.lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn'); return re.findall(r'[a-z0-9ñ]+', s)
def transcribe_words(path, lang):
    b = uuid.uuid4().hex; data = open(path, 'rb').read()
    fields = {'model_id': 'scribe_v1', 'language_code': lang, 'timestamps_granularity': 'word', 'tag_audio_events': 'false'}
    body = b''.join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()) + (f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + data + f'\r\n--{b}--\r\n'.encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/speech-to-text', data=body, headers={'xi-api-key': key, 'Content-Type': f'multipart/form-data; boundary={b}'})
    with urllib.request.urlopen(req, timeout=180) as r: j = json.load(r)
    return [(w['text'], float(w['start'])) for w in j.get('words', []) if w.get('type', 'word') == 'word' and 'start' in w]
def align(lines, words):
    """Para cada línea busca, desde la posición actual, la ventana de palabras que más se parece a su inicio; devuelve el tiempo de la primera."""
    toks = [(norm(w)[0] if norm(w) else '', t) for w, t in words]; toks = [(w, t) for w, t in toks if w]
    pos = 0; times = []
    for ln in lines:
        target = norm(ln)[:3]
        if not target: times.append(None); continue
        best = (0, None, pos)
        for i in range(pos, len(toks)):
            window = ' '.join(w for w, _ in toks[i:i + len(target)]); sc = difflib.SequenceMatcher(None, ' '.join(target), window).ratio()
            if sc > best[0]: best = (sc, toks[i][1], i)
            if sc >= 0.95: break
        if best[0] >= 0.6: times.append(best[1]); pos = best[2] + 1
        else: times.append(None)
    return times
def write_lyrics_json(sid, lang, lines, mp3, sing=None):
    dur = duration(mp3) or (args.length / 1000); times = [None] * len(lines); src = 'uniforme'
    try:
        times = align(sing or lines, transcribe_words(mp3, lang)); src = f'alineada ({sum(1 for t in times if t is not None)}/{len(lines)} líneas)'
    except Exception as e: print('  alineación falló:', e)
    # huecos: interpolar entre vecinos conocidos (o repartir uniforme si no hay ninguno)
    known = [(i, t) for i, t in enumerate(times) if t is not None]
    if not known: intro = min(4, dur * 0.06); times = [intro + i * (dur - intro) / len(lines) for i in range(len(lines))]
    else:
        for i in range(len(times)):
            if times[i] is None:
                prev = max([k for k in known if k[0] < i], default=(-1, 0.0)); nxt = min([k for k in known if k[0] > i], default=(len(lines), dur))
                times[i] = prev[1] + (nxt[1] - prev[1]) * (i - prev[0]) / (nxt[0] - prev[0])
    for i in range(1, len(times)): times[i] = max(times[i], times[i - 1] + 0.3)
    json.dump({'lines': [{'t': round(t, 2), 'text': ln} for t, ln in zip(times, lines)]}, open(os.path.join(OUT, f'{sid}.{lang}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'  letra {sid}.{lang}: {src}')
for sid, song in songs.items():
    for lang in ['es', 'en']:
        if args.only and sid != args.only: continue
        if args.lang and lang != args.lang: continue
        lyrics = song[lang]['lyrics']; mp3 = os.path.join(OUT, f'{sid}.{lang}.mp3')
        # "sing": cómo se le escribe al modelo para que lo CANTE bien (p. ej. "a, be, ce" en vez de "A, B, C", que canta en inglés); en pantalla se muestra "lyrics"
        sing = song[lang].get('sing', lyrics); assert len(sing) == len(lyrics), f'{sid}.{lang}: sing y lyrics deben tener las mismas líneas'
        prompt = STYLE[lang] + '\n' + '\n'.join(sing)
        if args.show: print(f'=== {sid} ({lang}) ===\n{prompt}\n'); continue
        if args.sync:
            if os.path.exists(mp3): write_lyrics_json(sid, lang, lyrics, mp3, sing)
            continue
        if os.path.exists(mp3): print('ya existe', sid, lang); write_lyrics_json(sid, lang, lyrics, mp3, sing); continue
        if not key: sys.exit('Falta ELEVEN_API_KEY')
        body = json.dumps({'prompt': prompt, 'music_length_ms': args.length, 'force_instrumental': False, 'model_id': args.model}).encode()
        req = urllib.request.Request('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', data=body, headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
        try:
            with urllib.request.urlopen(req, timeout=300) as r: audio = r.read()
            open(mp3, 'wb').write(audio); print('ok', sid, lang, len(audio) // 1024, 'KB'); write_lyrics_json(sid, lang, lyrics, mp3, sing)
        except urllib.error.HTTPError as e: print('ERROR', sid, lang, e.code, e.read().decode(errors='ignore')[:300])
        except Exception as e: print('ERROR', sid, lang, e)
