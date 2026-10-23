#!/usr/bin/env node
/* Genera voces/manifest.json: TODO lo que la app dice en voz alta, por idioma, con su nombre de archivo.
   Uso: node tools/build_manifest.js   (desde la carpeta del proyecto) */
const fs = require('fs'), path = require('path');
global.window = {}; require(path.join(__dirname, '..', 'data.js')); const D = window.LYA_DATA;

// Mismo hash que usa app.js para encontrar el archivo de una frase.
function h(str) { let x = 5381; for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) >>> 0; return x.toString(16).padStart(8, '0'); }
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => o[k] != null ? o[k] : m);

const out = {};
for (const L of ['es', 'en']) {
  const t = D[L], u = t.ui, s = u.say; const set = new Set(); const add = x => { if (x && String(x).trim()) set.add(String(x).trim()); };
  // Instrucciones y frases fijas
  Object.values(s).forEach(v => { if (typeof v === 'string' && !v.includes('{')) add(v); });
  u.good.forEach(add); add(u.bad); add(u.hear); u.numbers.forEach(add); add(u.welcome); add(u.reviewT);
  for (let n = 0; n <= 14; n++) add(fmt(u.done, { n }));
  // Vocales
  t.vowels.forEach(v => { add(v[0]); add(v[0].toLowerCase()); add(v[1]); add(fmt(s.thisIs, { L: v[0] })); add(fmt(s.ofWord, { L: v[0], w: v[1] })); add(fmt(s.tapIt, { L: v[0] })); });
  // Letras: nombre, sonido, "esta es la letra", "X de palabra"
  t.letters.forEach(l => { add(l[0]); add(l[0].toUpperCase()); add(l[1]); add(l[3]); add(fmt(s.letterIs, { name: l[3] })); add(fmt(s.ofWord, { L: l[3], w: l[1] })); const snd = (t.sounds || {})[l[0]]; add(snd); if (snd) add(snd.split(',')[0]); });
  Object.values(t.sounds || {}).forEach(x => { add(x); if (x) add(x.split(',')[0].trim()); });
  // Sílabas
  t.cons.forEach(c => { add(c); ['a', 'e', 'i', 'o', 'u'].forEach(v => add(u.sylOf(c, v))); });
  const softR = parts => parts.some((p, i) => i > 0 && /^r[^r]/i.test(p));
  const addSyl = str => { const parts = str.split('-').filter(Boolean); if (parts.length < 2) return; if (softR(parts)) add(parts.join('·')); else parts.forEach(add); };
  // Palabras y categorías, con sus sílabas
  t.wordCats.forEach(cat => { add(cat[0]); cat[2].forEach(w => { add(w[0]); addSyl(t.syllabify[w[0]] || ''); }); });
  // Rompecabezas, vocal perdida, rimas, palmadas
  t.build.forEach(b => { const parts = b.slice(0, -1); parts.forEach(add); add(parts.join('')); if (softR(parts)) add(parts.join('·')); });
  t.missing.forEach(m => add(m[0]));
  t.rhymes.forEach(set2 => set2.forEach(w => { add(w[0]); add(fmt(s.rhymeQ, { w: w[0] })); }));
  t.claps.forEach(c => { add(c[0]); addSyl(c[3]); });
  // "¿Cuál empieza diferente?" frases dinámicas
  t.wordCats.flatMap(c => c[2]).forEach(w => add(fmt(s.startsDiff, { w: w[0], L: w[0][0] })));
  // Frases y cuentos: la frase entera y cada palabra
  t.phrases.forEach(p => { add(p[0]); p[0].split(' ').forEach(w => add(w.replace(/[.,!?—"¡¿]/g, ''))); });
  t.stories.forEach(st => { add(st.title); st.pages.forEach(pg => { add(pg[0]); pg[0].split(' ').forEach(w => add(w.replace(/[.,!?—"¡¿]/g, ''))); }); (st.qs || [st.q]).forEach(q => { add(q[0]); q[1].forEach(o => add(o[0])); }); });
  add(u.theEnd);
  // Emociones
  (t.emotions || []).forEach(e => { add(e[0]); add(e[2]); add(fmt(s.emoIs, { e: e[0] })); add(fmt(s.emoAsk, { e: e[0] })); add(fmt(s.feelIs, { e: e[0] })); });
  (t.feelings || []).forEach(f => add(f[0])); if (s.breathe) { add(s.breathe); add(s.gFeel.split('.').slice(1).join('.')); }
  // Números: palabras, dígitos, "este es el", "hay N cosas"
  u.numbers.forEach((w, i) => { add(w); add(String(i + 1)); add(fmt(s.numberIs, { n: w })); (t.countThings || []).forEach(th => add(fmt(s.allCounted, { n: w, things: th[0] }))); });
  (t.countThings || []).forEach(th => add(th[0]));
  // Sumas y restas: todas las combinaciones hasta 10+10 y 20-10 (frases cortas)
  if (s.addQ) { const N = n => n === 0 ? '0' : u.numbers[n - 1]; for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) { if (a + b <= 20) { add(fmt(s.addQ, { a: N(a), b: N(b) })); add(fmt(s.addAns, { a: N(a), b: N(b), c: N(a + b) })); } }
    for (let a = 2; a <= 20; a++) for (let b = 1; b < a && b <= 10; b++) { add(fmt(s.subQ, { a: N(a), b: N(b) })); add(fmt(s.subAns, { a: N(a), b: N(b), c: N(a - b) })); } }
  // Colores y formas
  (t.colors || []).forEach(c => { add(c[0]); add(fmt(s.colorIs, { c: c[0] })); add(fmt(s.thingsOfColor, { c: c[0] })); });
  (t.shapes || []).forEach(x => { add(x[0]); add(fmt(s.shapeIs, { s: x[0] })); add(fmt(s.gShape, { s: x[0] })); });
  // Hora y calendario
  if (t.days) { t.days.forEach(d => { add(d); add(fmt(s.dayIs, { d })); add(fmt(s.gDay, { d })); }); add(t.days.join(', ')); for (let i = 0; i < 7; i++) add(fmt(s.afterIs, { a: t.days[i], b: t.days[(i + 1) % 7] }));
    t.months.forEach(mo => add(mo[0])); add(s.oneOclock); add(s.oneHalf); for (let h = 2; h <= 12; h++) { add(fmt(s.oclock, { h: u.numbers[h - 1] })); add(fmt(s.half, { h: u.numbers[h - 1] })); } }
  // Animales del perfil
  Object.values(t.avatarNames || {}).forEach(n => { add(n); add(fmt(s.animalIs, { a: n })); });
  // Saludo sin nombre (el nombre del niño se dice con la voz del teléfono)
  add(L === 'es' ? '¡Hola!' : 'Hi!'); add(s.home);
  out[L] = {}; [...set].sort().forEach(x => out[L][x] = h(L + '|' + x));
}
fs.mkdirSync(path.join(__dirname, '..', 'voces'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'voces', 'manifest.json'), JSON.stringify(out, null, 1));
const chars = L => Object.keys(out[L]).reduce((a, x) => a + x.length, 0);
console.log(`es: ${Object.keys(out.es).length} frases, ${chars('es')} caracteres · en: ${Object.keys(out.en).length} frases, ${chars('en')} caracteres`);
