#!/usr/bin/env python3
"""Quita el silencio sobrante al final de cada mp3 (la API deja 0,1-0,35 s) sin recodificar: corta en el límite de frame.
Así las secuencias de la app (letra → pausa → palabra) no suman silencios muertos.

  python3 tools/recortar_silencio.py --lang es          # todos los mp3 del idioma (idempotente)
  python3 tools/recortar_silencio.py archivo.mp3 ...    # archivos sueltos (lo usa generate_voices.py)"""
import argparse, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP = 0.07      # silencio que se deja al final
MIN_CUT = 0.06   # no vale la pena cortar menos
def trim(path):
    try:
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode().strip())
        out = subprocess.run(['ffmpeg', '-i', path, '-af', 'silencedetect=noise=-45dB:d=0.05', '-f', 'null', '-'], capture_output=True, text=True).stderr
        starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', out)]; ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', out)]
        if not starts: return 0.0
        last = starts[-1]; tail_is_silence = len(ends) < len(starts) or ends[-1] >= dur - 0.01
        if not tail_is_silence: return 0.0
        tail = dur - last
        if tail - KEEP < MIN_CUT or last + KEEP < 0.2: return 0.0  # nunca dejar un audio de menos de 0,2 s
        tmp = path + '.trim'
        # Se recodifica (mismo formato): el corte con "-c copy" dejaba frames truncados que el navegador se negaba a reproducir.
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-to', f'{last + KEEP:.3f}', '-c:a', 'libmp3lame', '-b:a', '32k', '-ar', '22050', '-f', 'mp3', tmp], check=True)
        os.replace(tmp, path); return tail - KEEP
    except Exception as e:
        print('  error', path, e); return 0.0
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--lang'); ap.add_argument('files', nargs='*'); args = ap.parse_args()
    files = args.files or [os.path.join(ROOT, 'voces', args.lang, f) for f in os.listdir(os.path.join(ROOT, 'voces', args.lang)) if f.endswith('.mp3')]
    with ThreadPoolExecutor(6) as ex: cuts = list(ex.map(trim, files))
    n = sum(1 for c in cuts if c > 0); print(f'{len(files)} archivos, {n} recortados, {sum(cuts):.1f} s de silencio quitados en total (media {sum(cuts)/max(1,len(files)):.2f} s)')
