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
  add('0'); // trazar el cero
  // Vocales
  t.vowels.forEach(v => { add(v[0]); add(v[0].toLowerCase()); add(v[1]); add(fmt(s.thisIs, { L: v[0] })); add(fmt(s.ofWord, { L: v[0], w: v[1] })); add(fmt(s.tapIt, { L: v[0] })); add(fmt(s.letterIs, { name: v[0] })); });
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
  const onset = w => (w.match(/^(ch|ll|sh|th|qu|rr)/) || [w[0]])[0]; // igual que gameOdd
  t.wordCats.flatMap(c => c[2]).forEach(w => add(fmt(s.startsDiff, { w: w[0], L: onset(w[0]) })));
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
  // Ciencia
  const fem = ['vaca', 'gallina', 'oveja', 'rana', 'abeja', 'ballena', 'tortuga', 'mariposa']; const art = n => L === 'en' ? 'the ' + n : (fem.includes(n) ? 'la ' : 'el ') + n; const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  (t.animals || []).forEach(a => { add(a[0]); add(a[2]); add(fmt(s.animalSays, { a: cap(art(a[0])), s: a[2] })); add(fmt(s.livesIn, { a: cap(art(a[0])), h: a[3] })); add(fmt(s.eats, { a: cap(art(a[0])), f: a[4] })); add(fmt(s.gHabitat, { a: art(a[0]) })); });
  (t.plant || []).forEach(pp => add(fmt(s.partIs, { p: pp[0], d: pp[2] }))); if (s.plantGrow) add(s.plantGrow);
  (t.planets || []).forEach(pl => add(fmt(s.planetIs, { p: pl[0], d: pl[2] }))); add(u.noSongs);
  // Dinero, escribir, cuerpo/clima, lectura, multiplicar/fracciones
  if (t.coins) { const N = n => u.numWord(n); const cents = n => n === 1 ? s.cent1 : fmt(s.cents, { n: N(n) }); const money = c => c < 100 ? cents(c) : (Math.floor(c / 100) === 1 ? s.dollar1 : fmt(s.dollars, { n: N(Math.floor(c / 100)) })) + (c % 100 ? (L === 'es' ? ' con ' : ' and ') + cents(c % 100) : '');
    t.coins.forEach(c => { add(c[0]); add(fmt(s.coinIs, { c: c[0], v: money(c[1]) })); }); const totals = new Set(); const vals = t.coins.map(c => c[1]); vals.forEach(a => vals.forEach(b => { totals.add(a + b); vals.forEach(c => { totals.add(a + b + c); vals.forEach(d => totals.add(a + b + c + d)); }); })); [...totals].filter(x => x <= 2000).forEach(x => add(fmt(s.totalIs, { v: money(x) })));
    [1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 75, 100, 200, 300, 400, 500].forEach(x => add(money(x))); // contar monedas de una en una, de 5 en 5, de 25 en 25
    (t.countThings || []).forEach(th => { if (th[2]) add(fmt(s.allCounted1, { one: th[2] })); });
    try { const songs = require(path.join(__dirname, 'songs.json')); Object.values(songs).forEach(sg => (sg[L] && sg[L].lyrics || []).forEach(add)); } catch (e) {} // letras: la voz las canta mientras no haya mp3
    t.writeWords.forEach(w => { add(w[0]); add(fmt(s.wroteIt, { w: w[0] })); addSyl(t.syllabify[w[0]] || ''); }); 'abcdefghijklmnñopqrstuvwxyz'.split('').forEach(l => { const nm = (t.letters.find(x => x[0] === l) || [])[3] || l; add(fmt(s.nextLetter, { l: nm })); });
    t.bodyParts.forEach(bp => { add(bp[0]); add(fmt(s.bodyPart, { p: bp[0], d: bp[2] })); add(fmt(s.tapPart, { p: bp[0] })); });
    t.weatherKinds.forEach(w => { add(w[0]); add(fmt(s.weatherIs, { w: w[0], d: w[2] })); add(fmt(s.gWeather, { w: w[0] })); add(fmt(s.wearIt, { w: w[0], c: w[3] })); }); t.wearOptions.forEach(o => add(o[0]));
    t.readings.forEach((rd, i) => { add(rd.title); add(rd.text); rd.text.split(' ').forEach(w => add(w.replace(/[.,!?—"¡¿]/g, ''))); rd.qs.forEach(q => { add(q[0]); q[1].forEach(add); }); }); for (let n = 1; n <= 4; n++) add(fmt(s.readQ, { n }));
    [2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(b => { add(fmt(s.multTable, { n: b })); for (let a = 1; a <= 10; a++) { add(fmt(a === 1 ? s.multQ1 : s.multQ, { a, b })); add(fmt(s.multAns, { a, b, c: a * b })); add(fmt(s.multAns, { a: b, b: a, c: a * b }));
      // lección de la tabla: a grupos de b, suma repetida y conteo de b en b
      add(fmt(a === 1 ? s.multGroups1 : s.multGroups, { a, b })); const plus = L === 'es' ? ' más ' : ' plus '; add(fmt(s.multSum, { sum: Array.from({ length: a }, () => u.numWord(b)).join(plus), c: u.numWord(a * b) })); } });
    for (let k = 21; k <= 100; k++) add(u.numWord(k)); add(s.mult.split('.')[0] + '.');
    t.fractions.forEach(f => { add(f[0]); add(fmt(s.fracIs, { f: f[0], d: f[4] })); });
    // Trucos de las tablas (v36): intros, pasos con números en palabras
    if (s.trick2) { const W = n => u.numWord ? u.numWord(n) : String(n); ['tricksIntro', 'trickPractice', 'trickAgain', 'trick2', 'trick3', 'trick4', 'trick5', 'trick6', 'trick7', 'trick8', 'trick10', 'tapDouble', 'tapOther', 'handsUnits0'].forEach(k => add(s[k]));
      [2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(n => add(fmt(s.trickOf, { n }))); for (let a = 1; a <= 10; a++) { add(fmt(s.trick9, { a: W(a) })); add(fmt(s.tapFinger, { a: W(a) })); add(fmt(s.tenIs, { a: W(a), c: W(a * 10) })); add(fmt(s.chunkIs1, { a: W(a) }));
        [1, 2, 4].forEach(x => add(fmt(s.doubleOf, { a: W(a * x), c: W(a * x * 2) }))); [2, 5].forEach(k => add(fmt(s.chunkIs, { k: W(k), a: W(a), c: W(k * a) }))); add(fmt(s.chunkIs, { k: W(1), a: W(a), c: W(a) }));
        add(fmt(s.chunkAdd, { x: W(2 * a), y: W(a), c: W(3 * a) })); add(fmt(s.chunkAdd, { x: W(5 * a), y: W(a), c: W(6 * a) })); add(fmt(s.chunkAdd, { x: W(5 * a), y: W(2 * a), c: W(7 * a) }));
        if (a > 1) add(fmt(s.nineIs, { l: W(a - 1), r: W(10 - a), c: W(9 * a) })); else add(fmt(s.nineIs0, { r: W(9) })); }
      for (let a = 6; a <= 10; a++) for (let b = 6; b <= 10; b++) { add(fmt(s.trickHands, { a, b })); const t = a + b - 10, un = (10 - a) * (10 - b); add(fmt(s.handsTens, { t: W(t), tens: W(t * 10) })); if (un) add(fmt(s.handsUnits, { l: W(10 - a), r: W(10 - b), u: W(un) })); add(fmt(s.handsTotal, { tens: W(t * 10), u: W(un), c: W(a * b) })); } } }
  // Animales del perfil
  Object.values(t.avatarNames || {}).forEach(n => { add(n); add(fmt(s.animalIs, { a: n })); });
  // Saludo sin nombre (el nombre del niño se dice con la voz del teléfono)
  add(L === 'es' ? '¡Hola!' : 'Hi!'); add(s.home); add(s.keepGoing); add(s.traceHelp); add(s.traceInside);
  out[L] = {}; [...set].sort().forEach(x => out[L][x] = h(L + '|' + x));
}
fs.mkdirSync(path.join(__dirname, '..', 'voces'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'voces', 'manifest.json'), JSON.stringify(out, null, 1));
const chars = L => Object.keys(out[L]).reduce((a, x) => a + x.length, 0);
console.log(`es: ${Object.keys(out.es).length} frases, ${chars('es')} caracteres · en: ${Object.keys(out.en).length} frases, ${chars('en')} caracteres`);
