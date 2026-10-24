#!/usr/bin/env python3
"""Iguala el volumen de los clips: todos a un pico de -3 dB. Los recortes de la frase portadora (letras, sílabas) salían
más bajos que las frases (la "I" a -8 dB de pico casi no se oía). Idempotente: solo toca los que están a más de 1,5 dB del objetivo.

  python3 tools/normalizar_volumen.py --lang es          # todos los mp3 del idioma
  python3 tools/normalizar_volumen.py archivo.mp3 ...    # archivos sueltos (lo usa generate_voices.py)"""
import argparse, os, re, subprocess
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = -3.0
def peak(path):
    out = subprocess.run(['ffmpeg', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.search(r'max_volume: ([-\d.]+) dB', out); return float(m.group(1)) if m else None
def normalize(path):
    try:
        p = peak(path)
        if p is None: return 0.0
        gain = TARGET - p
        if abs(gain) < 1.5: return 0.0
        tmp = path + '.norm'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-af', f'volume={gain:.2f}dB', '-c:a', 'libmp3lame', '-b:a', '32k', '-ar', '22050', '-f', 'mp3', tmp], check=True)
        os.replace(tmp, path); return gain
    except Exception as e:
        print('  error', path, e); return 0.0
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--lang'); ap.add_argument('files', nargs='*'); args = ap.parse_args()
    files = args.files or [os.path.join(ROOT, 'voces', args.lang, f) for f in os.listdir(os.path.join(ROOT, 'voces', args.lang)) if f.endswith('.mp3')]
    with ThreadPoolExecutor(6) as ex: gains = list(ex.map(normalize, files))
    ch = [g for g in gains if g]; print(f'{len(files)} archivos, {len(ch)} ajustados (subidos {sum(1 for g in ch if g > 0)}, bajados {sum(1 for g in ch if g < 0)}; ajuste medio {sum(abs(g) for g in ch) / max(1, len(ch)):.1f} dB)')
