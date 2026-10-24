#!/usr/bin/env python3
"""Clasificador de sonidos de animales (AudioSet) para elegir, por animal, la grabación que de verdad suena a ese animal.

Modelo: AST "MIT/ast-finetuned-audioset-10-10-0.4593" (transformers + torch, 527 etiquetas AudioSet). Para cada candidata
se miran las probabilidades de las etiquetas esperadas (p. ej. perro → Dog, Bark, Bow-wow) y se descarta todo lo que suene
a voz humana, música o ruido. Animales sin etiqueta propia en AudioSet (elefante, mono, delfín, conejo, pingüino, zorro,
tortuga) se aceptan si el modelo oye "Animal"/"Wild animals"/"Bird"… y NO habla ni música. Scribe (verificar_sonidos.py)
queda como segunda opinión; aquí mandan las probabilidades.

Uso:  python3 tools/clasificar_sonidos.py --cand DIR [DIR2 ...] [--aplicar] [--only "dog bark" ...]
  --aplicar copia la elegida a sonidos/<clave>.mp3, apunta la autoría en sonidos/creditos.json y rehace sonidos/index.json
"""
import argparse, glob, json, os, shutil, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'sonidos')
MODELO = 'MIT/ast-finetuned-audioset-10-10-0.4593'
ANIMAL = ['Animal', 'Domestic animals, pets', 'Livestock, farm animals, working animals', 'Wild animals']
AVE = ['Bird', 'Bird vocalization, bird call, bird song', 'Chirp, tweet', 'Squawk', 'Fowl', 'Goose', 'Honk', 'Caw']
# Etiquetas AudioSet que confirman cada animal (específicas) y las de familia que valen cuando no hay etiqueta propia
ESPERADO = {
  'dog bark': (['Dog', 'Bark', 'Bow-wow', 'Yip', 'Howl', 'Growling'], []),
  'cat meow': (['Cat', 'Meow', 'Caterwaul'], []),
  'cow moo': (['Cattle, bovinae', 'Moo'], []),
  'pig oink': (['Pig', 'Oink'], []),
  'chicken cluck': (['Chicken, rooster', 'Cluck', 'Crowing, cock-a-doodle-doo', 'Fowl'], []),
  'sheep bleat': (['Sheep', 'Bleat', 'Goat'], []),
  'horse neigh': (['Horse', 'Neigh, whinny'], []),
  'duck quack': (['Duck', 'Quack'], []),
  'frog croak': (['Frog', 'Croak'], []),
  'lion roar': (['Roaring cats (lions, tigers)', 'Roar', 'Growling'], []),
  'elephant trumpet': ([], ANIMAL + ['Roar', 'Growling', 'Trumpet', 'Screaming', 'Squeal', 'Neigh, whinny']),
  'monkey': ([], ANIMAL + ['Screaming', 'Squeal', 'Howl']),
  'wolf howl': (['Howl', 'Canidae, dogs, wolves', 'Dog'], []),
  'owl hoot': (['Owl', 'Hoot'], AVE),
  'bee buzz': (['Bee, wasp, etc.', 'Buzz', 'Insect', 'Fly, housefly', 'Mosquito'], []),
  'bird chirp': (['Bird', 'Bird vocalization, bird call, bird song', 'Chirp, tweet'], []),
  'dolphin click': ([], ANIMAL + ['Whale vocalization', 'Squeak', 'Whistle', 'Chirp, tweet']),
  'whale song': (['Whale vocalization'], ANIMAL),
  'rabbit': ([], ANIMAL + ['Squeak', 'Oink', 'Grunt', 'Purr']),
  'penguin': ([], ANIMAL + AVE + ['Screaming', 'Squeal']),
  'fox': (['Canidae, dogs, wolves', 'Bark', 'Yip', 'Howl'], ANIMAL + ['Screaming', 'Squeal']),
  'turtle': ([], ANIMAL + ['Hiss', 'Breathing', 'Snort']),
  'butterfly': (['Flap', 'Insect'], ['Rustle', 'Whoosh, swoosh, swish']),
}
RECHAZO = ['Speech', 'Music', 'Male speech, man speaking', 'Female speech, woman speaking', 'Child speech, kid speaking', 'Narration, monologue', 'Conversation', 'Singing', 'Musical instrument', 'Laughter', 'Vehicle', 'Noise', 'Static', 'White noise']

def cargar():
    import torch
    from transformers import AutoFeatureExtractor, ASTForAudioClassification
    fe = AutoFeatureExtractor.from_pretrained(MODELO); m = ASTForAudioClassification.from_pretrained(MODELO).eval()
    return torch, fe, m

def onda(path):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(pcm, dtype=np.float32)

def probs(torch, fe, m, path):
    x = onda(path)
    if len(x) < 1600: return {}
    with torch.no_grad():
        out = m(**fe(x, sampling_rate=16000, return_tensors='pt'))
    p = torch.sigmoid(out.logits[0]).numpy()
    return {m.config.id2label[i]: float(p[i]) for i in range(len(p))}

def duracion(path):
    try: return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).strip())
    except Exception: return 0.0

TODAS_ESP = {k for esp, _ in ESPERADO.values() for k in esp} - set(ANIMAL) - set(AVE) - {'Growling', 'Howl', 'Insect', 'Bird', 'Roar', 'Screaming'}
def puntuar(clave, pr):
    esp, fam = ESPERADO[clave]
    s_esp = max([pr.get(k, 0) for k in esp] or [0]); s_fam = max([pr.get(k, 0) for k in fam] or [0])
    malo = max(pr.get(k, 0) for k in RECHAZO)
    otro = max([pr.get(k, 0) for k in TODAS_ESP if k not in esp] or [0])  # etiqueta propia de OTRO animal
    score = s_esp if esp else s_fam
    if esp and not fam and s_esp < 0.10: score = 0  # con etiqueta propia, exigimos que suene a eso
    if not esp and s_fam < 0.08: score = 0
    if esp and fam and s_esp < 0.10 and s_fam >= 0.08: score = s_fam * 0.5  # vale la familia, pero puntúa menos
    if malo > score or malo > 0.2: score = 0  # suena a voz/música/ruido
    if otro > max(score, 0.3) or (not esp and otro > 0.3): score = 0  # suena más a otro animal (una "ballena" que maúlla, un "mono" que ladra)
    return score, s_esp, s_fam, max(malo, otro)

VENTANA = {'whale song': 6.0}
def ventanas(torch, fe, m, clave, raw, largo):
    """Clasifica ventanas deslizantes del original y devuelve (score, inicio, dur, pr) de la mejor."""
    x = onda(raw); sr = 16000; n = int(largo * sr); hop = n // 2
    if len(x) <= n + sr // 2: return None
    mejor = None
    for ini in range(0, min(len(x) - n, 90 * sr), hop):
        seg = x[ini:ini + n]
        if float(np.abs(seg).max()) < 0.01: continue  # silencio
        with torch.no_grad(): out = m(**fe(seg, sampling_rate=sr, return_tensors='pt'))
        p = torch.sigmoid(out.logits[0]).numpy(); pr = {m.config.id2label[i]: float(p[i]) for i in range(len(p))}
        score = puntuar(clave, pr)[0]
        if mejor is None or score > mejor[0]: mejor = (score, ini / sr, largo, pr)
    return mejor

def recortar_en(raw, dst, ini, dur):
    import re
    med = subprocess.run(['ffmpeg', '-v', 'info', '-ss', f'{ini:.2f}', '-t', f'{dur:.2f}', '-i', raw, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mm = re.search(r'max_volume: (-?[\d.]+) dB', med); gain = (-3.0 - float(mm.group(1))) if mm else 0.0
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{ini:.2f}', '-t', f'{dur:.2f}', '-i', raw, '-af', f'afade=t=in:d=0.04,afade=t=out:st={max(dur - 0.25, 0):.2f}:d=0.25,volume={gain:.2f}dB', '-ac', '1', '-ar', '44100', '-b:a', '80k', '-f', 'mp3', dst], check=True)

def doblar_si_corto(path, minimo=1.2):
    """Un sonido de medio segundo se pierde: si dura menos de `minimo`, se repite dos veces con una pausa corta."""
    if duracion(path) >= minimo: return
    tmp = path + '.dbl.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-i', path, '-filter_complex', '[0:a]apad=pad_dur=0.3[a];[a][1:a]concat=n=2:v=0:a=1,aformat=sample_fmts=s16p:sample_rates=44100:channel_layouts=mono[o]', '-map', '[o]', '-b:a', '80k', '-f', 'mp3', tmp], check=True)
    shutil.move(tmp, path)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--cand', nargs='+', required=True); ap.add_argument('--aplicar', action='store_true'); ap.add_argument('--only', nargs='*'); ap.add_argument('--desde-resultado', help='JSON _resultado_ast.json de una pasada anterior: aplica sin volver a clasificar'); a = ap.parse_args()
    if a.desde_resultado:
        r = json.load(open(a.desde_resultado)); elegidos, pendientes = r['elegidos'], r['pendientes']; print('Elegidos:', len(elegidos), '| Pendientes:', pendientes); aplicar(a, elegidos); return
    torch, fe, m = cargar(); print('modelo cargado:', MODELO, file=sys.stderr)
    elegidos, pendientes = {}, []
    for clave in ESPERADO:
        if a.only and clave not in a.only: continue
        base = clave.replace(' ', '_'); cands = sorted(c for d in a.cand for c in glob.glob(os.path.join(d, base + '.*.mp3')) if '.raw.' not in c)  # los .raw. son originales, no recortes
        print(f'\n== {clave}: {len(cands)} candidatas'); mejor = None
        for c in cands:
            meta = json.load(open(c[:-4] + '.json')) if os.path.exists(c[:-4] + '.json') else {}
            raw = os.path.join(os.path.dirname(c), meta.get('raw', '')) if meta.get('raw') else None
            largo = VENTANA.get(clave, 3.5)
            if raw and os.path.exists(raw):
                v = ventanas(torch, fe, m, clave, raw, largo)
                if v and v[0] > 0: recortar_en(raw, c, v[1], v[2]); meta.update(inicio=v[1], dur=v[2]); json.dump(meta, open(c[:-4] + '.json', 'w'), ensure_ascii=False, indent=1)
            pr = probs(torch, fe, m, c)
            if not pr: print('   · (vacío)', os.path.basename(c)); continue
            score, se, sf, malo = puntuar(clave, pr); dur = duracion(c)
            top = sorted(pr.items(), key=lambda kv: -kv[1])[:3]
            print(f"   {'✔' if score > 0 else '·'} {os.path.basename(c):<22} {dur:4.1f}s  score {score:.2f} (propio {se:.2f}, familia {sf:.2f}, malo {malo:.2f})  top: " + ', '.join(f'{k} {v:.2f}' for k, v in top))
            # Mejor = mayor puntuación efectiva; un recorte de menos de 1,2 s puntúa menos (se queda corto para un niño)
            efectiva = score if dur >= 1.2 else score * 0.6
            if score > 0 and (mejor is None or efectiva > mejor[0]): mejor = (efectiva, dur, c)
        if mejor: elegidos[clave] = mejor[2]; print(f'   → elegido {os.path.basename(mejor[2])}')
        else: pendientes.append(clave)
    print('\nElegidos:', len(elegidos), '| Pendientes:', pendientes)
    json.dump({'elegidos': elegidos, 'pendientes': pendientes}, open(os.path.join(a.cand[0], '_resultado_ast.json'), 'w'), indent=1)
    if a.aplicar: aplicar(a, elegidos)

def aplicar(a, elegidos):
    if True:
        os.makedirs(OUT, exist_ok=True); cred_path = os.path.join(OUT, 'creditos.json')
        cred = json.load(open(cred_path)) if os.path.exists(cred_path) else {}
        for clave, c in elegidos.items():
            dst = os.path.join(OUT, clave.replace(' ', '_') + '.mp3'); shutil.copy(c, dst); doblar_si_corto(dst)
            meta = json.load(open(c[:-4] + '.json')); cred[clave] = {k: meta.get(k) for k in ('title', 'author', 'license', 'page')}
        json.dump(cred, open(cred_path, 'w'), ensure_ascii=False, indent=1)
        idx = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.mp3')); json.dump(idx, open(os.path.join(OUT, 'index.json'), 'w'))
        print('sonidos/index.json:', len(idx), 'sonidos; créditos:', len(cred))

if __name__ == '__main__': main()
