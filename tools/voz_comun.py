"""Reglas compartidas por generate_voices.py, reparar_voces.py y verificar_voces.py (cómo se habla y cómo se compara)."""
import difflib, json, os, re, unicodedata
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
try: PRON = json.load(open(os.path.join(ROOT, 'tools', 'pronunciacion.json'), encoding='utf-8'))
except Exception: PRON = {}
ES_U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte']
EN_U = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
def numword(lang, n):
    U = ES_U if lang == 'es' else EN_U
    if n <= 20: return U[n]
    d, u = divmod(n, 10)
    if lang == 'es':
        if d == 2: return ['veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'][u - 1]
        return ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'][d] + (' y ' + U[u] if u else '')
    return ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'][d] + ('-' + U[u] if u else '')
def digits_to_words(lang, s): return re.sub(r'(?<![\d,])(\d{1,2})(?!\d|,\d)', lambda m: numword(lang, int(m.group(1))), s)  # "12." sí; "10,05" no
def spoken(lang, text):
    """Cómo se ESCRIBE la frase para que la voz la PRONUNCIE bien (el archivo sigue llamándose por el texto original):
    sustituciones de tools/pronunciacion.json y números en palabras (las cifras al final de frase hacían balbucear al modelo)."""
    for k, v in (PRON.get(lang) or {}).items(): text = re.sub(r'(?<!\w)' + re.escape(k) + r'(?!\w)', v, text, flags=re.I)
    return digits_to_words(lang, text)
def needs_carrier(text):
    """Letras, sílabas, números y palabras cortas sueltas se generan dentro de una frase ("Escucha: ma.") y se recortan."""
    t = text.strip(); return (' ' not in t and len(t) <= 5) or t in ('doble u',)
CARRIER = {'es': 'Escucha: {x}.', 'en': 'Listen: {x}.'}
def norm(s):
    s = unicodedata.normalize('NFD', s.lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9ñ ]+', ' ', s)).strip()
def heard_words(lang, s):
    """Lo que escribe el reconocedor ("$10,05", "19") pasado a palabras para compararlo con el texto."""
    if lang == 'es':
        s = re.sub(r'\$(\d+)[,.](\d{2})', lambda m: f'{m.group(1)} dólares con {int(m.group(2))} centavos', s); s = re.sub(r'\$(\d+)', r'\1 dólares', s)
    else:
        s = re.sub(r'\$(\d+)[,.](\d{2})', lambda m: f'{m.group(1)} dollars and {int(m.group(2))} cents', s); s = re.sub(r'\$(\d+)', r'\1 dollars', s)
    return digits_to_words(lang, s)
def score(lang, text, heard):
    """0..1: parecido entre lo esperado (como se escribe o como se pronuncia) y lo oído."""
    h = norm(heard_words(lang, heard))
    if not h: return 0.0
    return max(difflib.SequenceMatcher(None, norm(heard_words(lang, spoken(lang, text))), h).ratio(), difflib.SequenceMatcher(None, norm(heard_words(lang, text)), h).ratio())
