/* Leo y Aprendo — app principal */
(function () {
'use strict';
const DATA = window.LYA_DATA;
const main = document.getElementById('main');
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const pick = (a, n) => shuffle(a).slice(0, n);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('lya:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lya:' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('lya:' + k); } catch (e) {} },
};
/* ---------- Diag: registro interno de errores (nunca visible para el niño) ---------- */
const APP_VERSION = 'v36';
const Diag = {
  max: 300, crumbs: [],
  log(type, msg, extra) { try { const list = store.get('diag', []); list.push({ t: new Date().toISOString(), type, msg: String(msg).slice(0, 300), screen: this.crumbs[this.crumbs.length - 1] || '', crumbs: this.crumbs.slice(-6).join(' > '), extra: extra ? JSON.stringify(extra).slice(0, 300) : undefined }); while (list.length > this.max) list.shift(); store.set('diag', list); } catch (e) {} },
  crumb(name) { this.crumbs.push(name); if (this.crumbs.length > 30) this.crumbs.shift(); },
  device() { let voices = []; try { voices = speechSynthesis.getVoices().map(v => v.name + ' [' + v.lang + ']' + (v.localService ? '' : ' (online)')); } catch (e) {}
    return { app: APP_VERSION, ua: navigator.userAgent, lang: navigator.language, standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches) || !!navigator.standalone, online: navigator.onLine, screen: screen.width + 'x' + screen.height, speech: 'speechSynthesis' in window, voices, settings: { lang: settings.lang, rate: settings.rate, voice: settings.voice } }; },
  report() { const list = store.get('diag', []); const counts = {}; list.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
    return ['=== Leo y Aprendo — diagnóstico ===', JSON.stringify(this.device(), null, 1), 'Totales: ' + JSON.stringify(counts), '--- últimos eventos (más reciente al final) ---']
      .concat(list.slice(-80).map(e => `${e.t} [${e.type}] ${e.screen ? '(' + e.screen + ') ' : ''}${e.msg}${e.extra ? ' ' + e.extra : ''}${e.crumbs ? '\n    ← ' + e.crumbs : ''}`)).join('\n'); },
  clear() { store.del('diag'); },
};
window.addEventListener('error', e => Diag.log('js-error', (e.message || 'error') + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => Diag.log('promise', (e.reason && (e.reason.message || e.reason)) || 'rejection'));
window.LYA = { diag: () => console.log(Diag.report()), diagClear: () => Diag.clear(), version: APP_VERSION };
let settings = Object.assign({ lang: 'es', rate: 0.8, upper: false, sfx: true, voice: {}, pause: 0.5 }, store.get('settings', {}));
/* Las pausas fijas de las secuencias se pensaron para la voz lenta del teléfono; con voz grabada se acortan (ajustable en la zona de padres). */
const pauseScale = () => (Clips.index[T().code] && Clips.index[T().code].size) ? (settings.pause || 0.5) : 1;
let profiles = store.get('profiles', []);
let currentId = store.get('current', null);
let P = null; // current profile
function saveSettings() { store.set('settings', settings); }
function saveProfiles() { store.set('profiles', profiles); }
const T = () => DATA[settings.lang];
const U = () => DATA[settings.lang].ui;
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => o[k] != null ? o[k] : m);
const cls = ['vA', 'vE', 'vI', 'vO', 'vU'];
const vcolor = v => 'var(--' + v.toLowerCase() + ')';
const caseIt = s => settings.upper ? s.toUpperCase() : s;
/* Nombre hablado de una letra ("j" → "jota"): una letra sola la voz la lee mal; vocales y números se dicen tal cual. */
const letterName = ch => { const l = (T().letters || []).find(x => x[0] === String(ch).toLowerCase()); return l ? l[3] : String(ch); };

/* ---------- audio: speech + sfx ---------- */
/* Voces grabadas (voces/<lang>/<hash>.mp3). Si existe el archivo de una frase se usa; si no, la voz del teléfono. */
const Clips = {
  index: { es: null, en: null }, cache: {},
  hash(str) { let x = 5381; for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) >>> 0; return x.toString(16).padStart(8, '0'); },
  ready: null,
  load() { this.ready = fetch('voces/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { if (j) { this.index = { es: new Set(j.es || []), en: new Set(j.en || []) }; Diag.log('clips', 'voces: es ' + (j.es || []).length + ', en ' + (j.en || []).length); } }).catch(() => {}); },
  /* Guarda todas las voces del idioma en el teléfono (la caché del service worker) para que suenen sin internet desde la primera vez. */
  async downloadAll(lang, onProgress) { const idx = this.index[lang]; if (!idx || !idx.size) return 0; const list = [...idx]; let n = 0;
    for (let i = 0; i < list.length; i += 8) { await Promise.all(list.slice(i, i + 8).map(h => fetch(`voces/${lang}/${h}.mp3`).then(r => { if (r.ok) n++; }).catch(() => {}))); if (onProgress) onProgress(Math.min(i + 8, list.length), list.length); } return n; },
  file(lang, text) { const t = String(text).trim(); const idx = this.index[lang]; if (!idx || !idx.size) return null; const h = this.hash(lang + '|' + t); return idx.has(h) ? `voces/${lang}/${h}.mp3` : null; },
  /* Una frase pegada ("¡Hola! ¿Quién juega hoy? Toca tu animal.") se parte en oraciones y se buscan los trozos grabados más largos; si todos existen, se encadenan. */
  segments(lang, text) { const sents = (String(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map(s => s.trim()).filter(Boolean); if (sents.length < 2) return null;
    const out = []; let i = 0; while (i < sents.length) { let found = null; for (let j = sents.length; j > i; j--) { const f = this.file(lang, sents.slice(i, j).join(' ')); if (f) { found = f; i = j; break; } } if (!found) return null; out.push(found); } return out; },
  playList(list, opts) { let k = 0; const next = () => { if (k >= list.length) { if (opts.onend) opts.onend(); return; } this.play(list[k++], { rate: opts.rate, onend: () => setTimeout(next, 120), onerror: opts.onerror }); }; next(); },
  missing: {}, // frases que cayeron a la voz del teléfono (diagnóstico para completar el manifest)
  current: null,
  // Un reproductor nuevo por frase y se suelta al terminar: guardar uno por cada frase sonada acababa en "error creating media player" (el navegador limita los reproductores vivos). La caché de red la lleva el service worker.
  play(src, opts) { this.stop(); const a = new Audio(src); this.current = a; a.playbackRate = opts.rate && opts.rate < .7 ? .82 : 1; try { a.preservesPitch = true; } catch (e) {}
    // Cada reproducción lleva su ficha: si otra la interrumpe (stop o el mismo clip otra vez), sus avisos tardíos ("interrupted by pause") se ignoran y no disparan la voz del teléfono.
    const tk = {}; a._tk = tk; const live = () => a._tk === tk;
    const release = () => { try { a.onended = a.onerror = null; a.removeAttribute('src'); a.load(); } catch (e) {} };
    let ended = false; const end = () => { if (ended || !live()) return; ended = true; if (this.current === a) this.current = null; release(); if (opts.onend) opts.onend(); };
    // Si el mp3 no se puede reproducir (sin internet y aún no guardado), se avisa para que hable la voz del teléfono en vez de quedarse mudo.
    // Fallos de carga esporádicos (vistos en clips muy cortos bajo mucha carga): un reintento con reproductor nuevo antes de caer a la voz del teléfono.
    const fail = why => { if (!live()) return;
      if (!opts._retry && !ended) { opts._retry = 1; a._tk = null; if (this.current === a) this.current = null; release(); setTimeout(() => { if (!this.current) this.play(src, opts); }, 60); return; }
      Diag.log('clips', why + ' ' + src); if (opts.onerror && !ended) { ended = true; if (this.current === a) this.current = null; release(); opts.onerror(); } else end(); };
    a.onended = end; a.onerror = () => fail('error al reproducir'); a.currentTime = 0;
    const pr = a.play(); if (pr && pr.catch) pr.catch(e => fail('play() rechazado: ' + e.message)); },
  stop() { if (this.current) { const a = this.current; try { a._tk = null; a.onended = a.onerror = null; a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {} this.current = null; } },
};
const Voice = {
  voices: [], unlocked: false, warned: false,
  load() { try { this.voices = speechSynthesis.getVoices() || []; } catch (e) { this.voices = []; } },
  init() {
    this.load();
    try { speechSynthesis.onvoiceschanged = () => this.load(); } catch (e) {}
    // iOS/Android need a user gesture before any audio; the first tap anywhere unlocks both speech and the sfx context.
    const unlock = () => { if (this.unlocked) return; this.unlocked = true;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
      Sfx.ctx(); };
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
  },
  supported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; },
  best() {
    const code = T().code, want = T().bcp.toLowerCase();
    const chosen = settings.voice[code];
    if (chosen) { const v = this.voices.find(v => v.voiceURI === chosen); if (v) return v; }
    const list = this.voices.filter(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(code));
    const pref = code === 'es' ? ['es-us', 'es-mx', 'es-419', 'es-do', 'es-co', 'es-ar', 'es-cl', 'es-pe'] : ['en-us', 'en-gb'];
    for (const tag of pref) { const v = list.find(v => v.lang.toLowerCase().replace('_', '-') === tag && /natural|enhanced|premium|neural/i.test(v.name)) || list.find(v => v.lang.toLowerCase().replace('_', '-') === tag); if (v) return v; }
    return list.find(v => v.lang.toLowerCase().replace('_', '-') === want && /natural|enhanced|premium|neural/i.test(v.name))
      || list.find(v => v.lang.toLowerCase().replace('_', '-') === want)
      || list.find(v => /natural|enhanced|premium|neural/i.test(v.name)) || list[0] || null;
  },
  say(text, opts) {
    opts = opts || {};
    const clip = Clips.file(T().code, text); const withFallback = Object.assign({}, opts, { onerror: () => this.tts(text, opts) });
    if (clip) { try { speechSynthesis.cancel(); } catch (e) {} Clips.play(clip, withFallback); return; }
    const segs = Clips.segments(T().code, text);
    if (segs) { try { speechSynthesis.cancel(); } catch (e) {} Clips.playList(segs, withFallback); return; }
    if (Clips.index[T().code] && Clips.index[T().code].size && !Clips.missing[text]) { Clips.missing[text] = 1; Diag.log('sin-voz', text.slice(0, 80)); }
    this.tts(text, opts);
  },
  /* Voz del teléfono: solo cuando no hay audio grabado (o no se pudo reproducir). */
  tts(text, opts) { opts = opts || {};
    if (!this.supported()) { Diag.log('speech', 'speechSynthesis no soportado'); showBanner(U().noVoice); return; }
    try {
      Clips.stop(); speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.best();
      u.lang = T().bcp; u.rate = opts.rate || settings.rate; u.pitch = settings.pitch || 1.3;
      if (v) u.voice = v; else if (this.voices.length && !this.warned) { this.warned = true; Diag.log('speech', 'sin voz para ' + T().bcp, { voices: this.voices.length }); showBanner(U().noVoice); }
      else if (!this.voices.length && !this._noVoicesLogged) { this._noVoicesLogged = true; Diag.log('speech', 'lista de voces vacía al hablar'); }
      if (opts.onboundary) u.onboundary = opts.onboundary;
      if (opts.onend) u.onend = opts.onend;
      u.onerror = ev => { if (ev && ev.error !== 'interrupted' && ev.error !== 'canceled') Diag.log('speech', 'utterance error: ' + (ev && ev.error), { text: text.slice(0, 40) }); if (opts.onend) opts.onend(); };
      // Chrome on Android sometimes needs resume() after cancel()
      speechSynthesis.speak(u); try { speechSynthesis.resume(); } catch (e) {}
      // if nothing starts within 2.5s, assume a silent engine and tell the parent once
      if (!this.warned) setTimeout(() => { if (!speechSynthesis.speaking && !speechSynthesis.pending && !u._started) {} }, 2500);
      u.onstart = () => { u._started = true; };
    } catch (e) { Diag.log('speech', 'speak() lanzó: ' + e.message); showBanner(U().noVoice); }
  },
  stop() { this._seq++; Clips.stop(); try { speechSynthesis.cancel(); } catch (e) {} },
  _seq: 0,
  /* Narración con pausas: parts = ['A', 1200, {t:'avión', rate:.6}, 800, ...]. Se cancela sola al cambiar de pantalla. */
  seq(parts, onDone) {
    const id = ++this._seq; let i = 0;
    const step = () => { if (id !== this._seq) return; if (i >= parts.length) { if (onDone) onDone(); return; }
      const p = parts[i++];
      if (typeof p === 'number') { setTimeout(step, Math.round(p * pauseScale())); return; }
      const t = typeof p === 'string' ? p : p.t, rate = typeof p === 'string' ? undefined : p.rate;
      if (!this.supported()) { setTimeout(step, 600); return; }
      let ended = false, byTimer = true; const done = () => { if (ended) return; ended = true; byTimer = false; setTimeout(step, Math.round(60 + 60 * pauseScale())); };
      this.say(t, { rate, onend: done }); setTimeout(() => { if (!ended) { if (id === this._seq) Diag.log('speech-timeout', 'la voz no avisó que terminó', { text: t.slice(0, 40) }); done(); } }, 1200 + t.length * 220); };
    step();
  },
};
const Sfx = {
  _ctx: null,
  ctx() { if (!this._ctx) { try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this._ctx && this._ctx.state === 'suspended') { try { this._ctx.resume(); } catch (e) {} } return this._ctx; },
  tone(f, t, dur, type, gain) { const c = this.ctx(); if (!c || !settings.sfx) return; const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.value = 0; o.connect(g); g.connect(c.destination); const now = c.currentTime + t; g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(gain || .18, now + .01); g.gain.exponentialRampToValueAtTime(.001, now + dur); o.start(now); o.stop(now + dur + .02); },
  good() { this.tone(660, 0, .15); this.tone(880, .12, .18); this.tone(1320, .26, .3); },
  bad() { this.tone(220, 0, .18, 'square', .08); this.tone(180, .16, .22, 'square', .08); },
  tap() { this.tone(520, 0, .08, 'triangle', .1); },
  star() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * .09, .25)); },
  /* Varita mágica: cascada rápida de campanitas agudas que suben y brillan. k sube el tono en cada estrella recogida. */
  sparkle(k) { const c = this.ctx(); if (!c || !settings.sfx) return; const base = 1046 * Math.pow(2, ((k || 0) % 5) / 12);
    const notes = [1, 1.25, 1.5, 2, 2.5, 3]; // arpegio mayor en subida
    notes.forEach((m, i) => { const t = i * .045; this.tone(base * m, t, .5, 'sine', .14); this.tone(base * m * 2, t + .01, .25, 'triangle', .035); });
    // "brillo": un glissando agudo muy suave que sube al final
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; const now = c.currentTime + .18; o.frequency.setValueAtTime(base * 3, now); o.frequency.exponentialRampToValueAtTime(base * 6, now + .35);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(.05, now + .05); g.gain.exponentialRampToValueAtTime(.001, now + .5); o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + .55); },
};
function showBanner(text) { const b = $('#audioBanner'); $('#audioBannerText').textContent = text; b.hidden = false; }
$('#audioBannerClose').onclick = () => { $('#audioBanner').hidden = true; };
function toast(text, ms) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2200); }
function confetti() { const c = $('#confetti'); const cols = ['#ff6b6b', '#ffb400', '#2ec4b6', '#5b8def', '#b56fe3'];
  for (let i = 0; i < 40; i++) { const s = document.createElement('i'); s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % 5]; s.style.animationDelay = (Math.random() * .4) + 's'; c.appendChild(s); setTimeout(() => s.remove(), 1800); } }
const cheer = () => U().good[Math.floor(Math.random() * U().good.length)];

/* ---------- progress ---------- */
function stars() { return P ? P.stars : 0; }
let pendingStars = 0; // estrellas ganadas en el juego actual que el niño aún no ha "recogido" (globos)
function award(n, key, defer) {
  if (!P) return;
  if (key) { if (P.done[key]) return; P.done[key] = true; }
  P.stars += n; saveProfiles(); if (defer) pendingStars += n; else Sfx.star(); $('#starCount').textContent = P.stars - pendingStars; checkBadges();
}
/* Estadística de fallos/aciertos por ítem, para que los padres vean dónde falla y repitan solo eso. */
function miss(key) { if (!P) return; P.errors = P.errors || {}; P.errors[key] = (P.errors[key] || 0) + 1; saveProfiles(); }
function hit(key) { if (!P) return; P.hits = P.hits || {}; P.hits[key] = (P.hits[key] || 0) + 1; saveProfiles(); }
function mark(key) { if (P && !P.done[key]) { P.done[key] = true; saveProfiles(); } }
function has(key) { return !!(P && P.done[key]); }
const BADGES = ['first', 'ten', 'fifty', 'hundred', 'vowels', 'abc', 'story', 'trace', 'games'];
function badgeEarned(b) {
  if (!P) return false; const d = P.done, L = settings.lang;
  switch (b) {
    case 'first': return P.stars >= 1; case 'ten': return P.stars >= 10; case 'fifty': return P.stars >= 50; case 'hundred': return P.stars >= 100;
    case 'vowels': return ['A', 'E', 'I', 'O', 'U'].every(v => d['vowel:' + L + ':' + v]);
    case 'abc': return T().letters.every(l => d['letter:' + L + ':' + l[0]]);
    case 'story': return Object.keys(d).some(k => k.startsWith('story:'));
    case 'trace': return Object.keys(d).filter(k => k.startsWith('trace:')).length >= 5;
    case 'games': return (P.games || 0) >= 10;
  }
}
function checkBadges() { if (!P) return; P.badges = P.badges || {}; BADGES.forEach(b => { if (!P.badges[b] && badgeEarned(b)) { P.badges[b] = true; saveProfiles(); toast('🏅 ' + U().badgeNames[b]); confetti(); } }); }

/* ---------- UI helpers ---------- */
function topbar(title) { return `<div class="topbar"><button class="back" type="button" data-home aria-label="${esc(U().back)}">←</button><div class="title">${esc(title)}</div></div>`; }
function wire() { $$('[data-home]', main).forEach(b => b.onclick = () => { Voice.stop(); home(); }); }
function setHeader() { $('#langBtn').textContent = '🌎 ' + T().toggle; $('#starCount').textContent = stars(); $('#profileBtn').textContent = P ? P.avatar : '🕊️'; document.documentElement.lang = settings.lang; }
function levelStars(i) {
  if (!P) return 0; const d = P.done, L = settings.lang, pre = ['vowel:', 'letter:', 'syl:', 'word:', 'phrase:', 'story:', 'trace:', 'game:', 'num:', 'color:', 'math:', 'emo:', 'time:', 'sci:', 'song:', 'money:', 'write:', 'body:', 'read:', 'mult:'][i];
  return Object.keys(d).filter(k => k.startsWith(pre) && (pre === 'trace:' || k.includes(':' + L + ':'))).length;
}

/* ---------- profiles ---------- */
function profileScreen() { Diag.crumb('profileScreen');
  const u = U();
  main.innerHTML = `<section class="screen">
    ${guideHtml(u.welcome)}
    <div class="profiles">${profiles.map(p => `<button class="profile" type="button" data-id="${p.id}"><span class="av">${p.avatar}</span>${esc(p.name)}<small>⭐ ${p.stars}</small></button>`).join('')}
      <button class="profile add" type="button" id="addProfile"><span class="av">➕</span>${esc(u.newProfile)}</button></div>
  </section>`;
  $$('[data-id]', main).forEach(b => b.onclick = () => { Sfx.tap(); selectProfile(b.dataset.id); });
  $('#addProfile').onclick = newProfileScreen;
  const intro = () => guideSay(u.welcome + ' ' + S().tapYours);
  if (!Voice.unlocked) showGate(intro); else intro();
}
function newProfileScreen() { Diag.crumb('newProfileScreen');
  const u = U(), s = S(); let av = null; const names = T().avatarNames || {};
  main.innerHTML = `<section class="screen">${topbar(u.newProfile)}${guideHtml(s.pickAnimal)}
    <div class="avgrid" id="avgrid">${DATA.avatars.map(a => `<button type="button" data-av="${a}" aria-label="${esc(names[a] || a)}">${a}</button>`).join('')}</div>
    <div class="stage" style="gap:12px"><input type="text" id="pname" maxlength="14" placeholder="${esc(u.yourNameOpt)}" autocomplete="off"></div>
    <div style="height:110px"></div>
    <div class="bottombar"><button class="btn big" id="go" type="button" disabled>${esc(u.start)} ▶</button></div></section>`;
  // Guía por voz: elige animal → lo nombra → el botón Empezar parpadea y la voz dice que lo toque.
  $$('[data-av]', main).forEach(b => b.onclick = () => { av = b.dataset.av; $$('[data-av]', main).forEach(x => x.classList.toggle('on', x === b)); Sfx.sparkle(1);
    const go = $('#go'); go.disabled = false; go.classList.add('pulse'); const nm = names[av] || '';
    $('#guideText').textContent = s.nowStart; Voice.seq([nm ? fmt(s.animalIs, { a: nm }) : '', 500, s.nowStart]); });
  $('#go').onclick = () => { if (!av) return; const name = $('#pname').value.trim() || names[av] || (settings.lang === 'es' ? 'Amigo' : 'Friend');
    const p = { id: String(Date.now()), name, avatar: av, stars: 0, done: {}, badges: {}, games: 0 }; profiles.push(p); saveProfiles(); Sfx.star(); selectProfile(p.id); };
  $$('[data-home]', main).forEach(b => b.onclick = profiles.length ? profileScreen : newProfileScreen);
  const intro = () => { guideSay(s.pickAnimal, () => { if (!av) setTimeout(() => { if (!av && document.contains($('#avgrid'))) Voice.seq([s.pickAnimal]); }, 9000); }); };
  if (!Voice.unlocked) showGate(intro); else intro();
}
function selectProfile(id) { P = profiles.find(p => p.id === id) || null; currentId = id; store.set('current', id); setHeader(); home(); }

/* ---------- home ---------- */
function home() { if (window._pendingReload) { location.reload(); return; } Diag.crumb('home'); clearTimeout(roundWatch); inReview = false; pendingStars = 0; $$('.balloons').forEach(l => l.remove()); if (P) $('#starCount').textContent = P.stars;
  if (!P) { profileScreen(); return; }
  Voice.stop(); const t = T(), u = U();
  main.innerHTML = `<section class="screen">
    ${guideHtml(fmt(u.hello, { name: P.name }))}
    <button class="door review ${reviewDoneToday() ? 'donetoday' : ''}" type="button" id="reviewBtn"><span class="big">${reviewDoneToday() ? '✅' : '🎯'}</span>${esc(u.reviewT)}<small>${reviewDoneToday() ? esc(u.reviewDone) : esc(u.reviewSub)}</small><span class="lvstars">🔥 ${P.streak || 0}</span></button>
    <div class="home">${u.levels.map((d, i) => `<button class="door d${i + 1}" type="button" data-go="${i}"><span class="lvstars">⭐ ${levelStars(i)}</span><span class="big">${d[2]}</span>${esc(d[0])}<small>${esc(d[1])}</small></button>`).join('')}</div>
  </section>`;
  $$('[data-go]', main).forEach(b => b.onclick = () => { Sfx.tap(); [vowelsScreen, lettersScreen, sylScreen, wordsScreen, phrasesScreen, storiesScreen, traceScreen, gamesScreen, numbersScreen, colorsScreen, mathScreen, emotionsScreen, timeScreen, scienceScreen, songsScreen, moneyScreen, writeScreen, bodyScreen, readScreen, multScreen][+b.dataset.go](); });
  $('#reviewBtn').onclick = () => { Sfx.tap(); reviewGame(); };
  const greeting = fmt(u.hello, { name: P.name }) + ' ' + S().home;
  const sayGreeting = () => { $('#guideText').textContent = greeting; Voice.seq([settings.lang === 'es' ? '¡Hola!' : 'Hi!', 150, P.name, 400, S().home]); };
  if (!Voice.unlocked) { $('#guideText').textContent = greeting; showGate(() => { home._welcomed = true; sayGreeting(); }); }
  else if (!home._welcomed) { home._welcomed = true; sayGreeting(); } else guideSay(S().home);
}

/* ---------- guide (búho que habla) ---------- */
function guideHtml(text) { return `<div class="mascot"><span class="owl">🕊️</span><p id="guideText">${esc(text)}</p></div>`; }
function guideSay(text, then) { const g = $('#guideText'); if (g) g.textContent = text; Voice.seq([text, 400], then); }
const S = () => U().say;

/* ---------- 1. vowels: lección guiada paso a paso ---------- */
function vowelsScreen(startAt) { Diag.crumb('vowelsScreen');
  const t = T(), s = S(); let i = startAt || 0; const L = settings.lang; let waiting = false;
  main.innerHTML = `<section class="screen">${topbar(U().vowelsT)}
    ${guideHtml(s.vowels)}
    <div class="chips">${t.vowels.map((v, k) => `<button class="chip" type="button" data-k="${k}" aria-label="${v[0]}">${v[0]} ${v[0].toLowerCase()}</button>`).join('')}</div>
    <div class="stage" id="stage"></div>
    <div class="row"><button class="btn big icon" id="listen" type="button" aria-label="${esc(U().listen)}">🔊</button><button class="btn alt icon" id="trace" type="button" aria-label="${esc(U().traceT)}">✏️</button><button class="btn icon" id="next" type="button" aria-label="${esc(U().next)}">➡️</button></div>
  </section>`;
  const v = () => t.vowels[i];
  function render(stepText) {
    $$('.chip', main).forEach((c, k) => c.classList.toggle('on', k === i));
    const w = v()[1]; const hi = esc(caseIt(w)).replace(new RegExp(caseIt(v()[0].toLowerCase()), 'gi'), m => `<b>${m}</b>`);
    $('#stage').innerHTML = `<button class="letter big-tap" id="bigL" type="button" style="color:${vcolor(v()[0])}" aria-label="${v()[0]}">${v()[0]} ${v()[0].toLowerCase()}</button><div class="pic" id="pic">${v()[2]}</div><div class="word" id="wd">${hi}</div>`;
    $('#bigL').onclick = () => { if (waiting) tapped(); else Voice.seq([{ t: v()[0], rate: .6 }]); };
    $('#pic').onclick = () => Voice.seq([{ t: w, rate: .7 }]);
    $('#wd').onclick = () => Voice.seq([{ t: w, rate: .7 }]); }
  function lesson() { waiting = false; render(); const L0 = v()[0], w = v()[1]; const pic = $('#pic'), wd = $('#wd'); pic.style.opacity = .25; wd.style.opacity = .25;
    // 1) la letra sola, despacio, dos veces  2) la palabra de ejemplo  3) "toca la A" y espera
    $('#guideText').textContent = fmt(s.thisIs, { L: L0 });
    Voice.seq([fmt(s.thisIs, { L: L0 }), 700, { t: L0, rate: .55 }, 900, { t: L0, rate: .55 }, 1100], () => {
      pic.style.opacity = 1; wd.style.opacity = 1; $('#guideText').textContent = fmt(s.ofWord, { L: L0, w });
      Voice.seq([fmt(s.ofWord, { L: L0, w }), 900, { t: w, rate: .65 }, 1100], () => {
        waiting = true; $('#bigL').classList.add('pulse'); $('#guideText').textContent = fmt(s.tapIt, { L: L0 }); Voice.seq([fmt(s.tapIt, { L: L0 })]);
        // pista si no toca en 8 s
        setTimeout(() => { if (waiting) Voice.seq([fmt(s.tapIt, { L: L0 })]); }, 8000); }); }); }
  function tapped() { waiting = false; $('#bigL').classList.remove('pulse'); $('#bigL').classList.add('good'); Sfx.good(); confetti(); award(1, 'vowel:' + L + ':' + v()[0]);
    $('#guideText').textContent = cheer(); Voice.seq([cheer(), 900, { t: v()[0], rate: .6 }, 1200], () => { if (i < 4) { i++; Voice.seq([s.next, 500], lesson); } else { Voice.seq([s.next], home); } }); }
  $$('.chip', main).forEach(c => c.onclick = () => { i = +c.dataset.k; Sfx.tap(); lesson(); });
  $('#listen').onclick = () => Voice.seq([{ t: v()[0], rate: .55 }, 900, fmt(s.ofWord, { L: v()[0], w: v()[1] })]);
  $('#trace').onclick = () => { Voice.stop(); traceScreen(v()[0]); };
  $('#next').onclick = () => { i = (i + 1) % 5; Sfx.tap(); lesson(); };
  wire(); lesson();
}

/* ---------- 2. letters ---------- */
function lettersScreen(focus) { Diag.crumb('lettersScreen');
  const t = T(), u = U(), L = settings.lang; const all = t.vowels.map(v => [v[0].toLowerCase(), v[1], v[2], v[0]]).concat(t.letters).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  main.innerHTML = `<section class="screen">${topbar(u.lettersT)}${guideHtml(S().letters)}
    <div class="stage" id="stage" hidden></div>
    <div class="grid" id="abc">${all.map(l => `<button class="tile ${'AEIOU'.includes(l[0].toUpperCase()) ? 'v' + l[0].toUpperCase() : ''} ${has('letter:' + L + ':' + l[0]) ? 'done' : ''}" type="button" data-l="${l[0]}">${caseIt(l[0])}</button>`).join('')}</div>
  </section>`;
  bigOpts(main, '#abc', 4);
  function teach(l, b) { const st = $('#stage'); st.hidden = false; const w = l[1], name = l[3], snd = (t.sounds || {})[l[0]] || l[0];
    const hi = esc(caseIt(w)).replace(new RegExp('^' + caseIt(l[0]), 'i'), m => `<b>${m}</b>`);
    st.innerHTML = `<button class="letter big-tap" id="bigL" type="button" ${'AEIOU'.includes(l[0].toUpperCase()) ? `style="color:${vcolor(l[0])}"` : ''}>${l[0].toUpperCase()} ${l[0]}</button><div class="pic" id="pic">${l[2]}</div><div class="word" id="wd">${hi}</div>
      <div class="row"><button class="btn big icon" id="say" type="button" aria-label="${esc(u.listen)}">🔊</button><button class="btn alt icon" id="tr" type="button" aria-label="${esc(u.traceT)}">✏️</button></div>`;
    // Ciencia de la lectura: primero el SONIDO (dos veces, despacio), luego el nombre, luego la palabra que empieza con él.
    const parts = [fmt(S().letterIs, { name }), 500, { t: name, rate: .6 }, 700];
    if (snd) parts.push(S().soundsLike, 400, { t: snd, rate: .55 }, 700, { t: snd, rate: .55 }, 900);
    parts.push(fmt(S().ofWord, { L: name, w }), 800, { t: w, rate: .65 });
    $('#guideText').textContent = fmt(S().ofWord, { L: name, w }); Voice.seq(parts); award(1, 'letter:' + L + ':' + l[0]); b.classList.add('done');
    $('#say').onclick = () => Voice.seq(parts); $('#bigL').onclick = () => Voice.seq([{ t: snd || name, rate: .55 }, 500, name]); $('#pic').onclick = () => Voice.seq([{ t: w, rate: .65 }]);
    $('#tr').onclick = () => { Voice.stop(); traceScreen(l[0].toUpperCase()); };
    st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  $$('[data-l]', main).forEach(b => b.onclick = () => { Sfx.tap(); teach(all.find(x => x[0] === b.dataset.l), b); });
  wire(); if (focus) { const b = $$('[data-l]', main).find(x => x.dataset.l === focus); if (b) { teach(all.find(x => x[0] === focus), b); return; } } guideSay(S().letters);
}

/* ---------- 3. syllables ---------- */
function sylScreen() { Diag.crumb('sylScreen');
  const t = T(), u = U(), L = settings.lang; let c = t.cons[0]; const vs = ['a', 'e', 'i', 'o', 'u'];
  main.innerHTML = `<section class="screen">${topbar(u.sylT)}${guideHtml(S().syl)}
    <div class="chips" id="cons">${t.cons.map(x => `<button class="chip" type="button" data-c="${x}">${caseIt(x)}</button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div>
    <div class="grid" id="syl"></div>
  </section>`;
  const snd = x => (t.sounds || {})[x] || x;
  function render() { $$('#cons .chip', main).forEach(b => b.classList.toggle('on', b.dataset.c === c));
    $('#syl').innerHTML = vs.map((v, k) => `<button class="tile ${cls[k]}" type="button" data-v="${v}" data-s="${u.sylOf(c, v)}">${caseIt(u.sylOf(c, v))}</button>`).join(''); bigOpts(main, '#syl', 2);
    $$('[data-s]', main).forEach(b => b.onclick = () => { const s = b.dataset.s, v = b.dataset.v; Sfx.tap(); award(1, 'syl:' + L + ':' + s);
      $$('[data-s]', main).forEach(x => x.classList.remove('good')); b.classList.add('good');
      const w = t.wordCats.flatMap(cat => cat[2]).find(x => x[0].startsWith(s)); const st = $('#stage'); st.hidden = false;
      st.innerHTML = `<div class="word" style="font-size:3rem"><span style="opacity:.5">${caseIt(c)}</span> <span style="color:var(--muted)">+</span> <span style="opacity:.5">${caseIt(v)}</span> <span style="color:var(--muted)">=</span> <b>${caseIt(s)}</b></div>${w ? `<div class="pic">${w[1]}</div><div class="word">${esc(caseIt(w[0])).replace(new RegExp('^' + caseIt(s), 'i'), m => `<b>${m}</b>`)}</div>` : ''}`;
      // Unir sonidos (blending): consonante... vocal... sílaba, dos veces; luego la palabra.
      const parts = [{ t: snd(c).split(',')[0], rate: .55 }, 500, { t: v, rate: .55 }, 500, { t: s, rate: .6 }, 800, { t: s, rate: .75 }];
      if (w) parts.push(900, { t: w[0], rate: .7 });
      $('#guideText').textContent = c + ' + ' + v + ' = ' + s; Voice.seq(parts); }); }
  $$('#cons .chip', main).forEach(b => b.onclick = () => { c = b.dataset.c; Sfx.tap(); Voice.seq([{ t: snd(c), rate: .55 }]); render(); });
  wire(); render(); guideSay(S().syl);
}

/* ---------- 4. words ---------- */
function wordsScreen() { Diag.crumb('wordsScreen');
  const t = T(), u = U(), L = settings.lang; let cat = 0;
  main.innerHTML = `<section class="screen">${topbar(u.wordsT)}${guideHtml(S().words)}
    <div class="chips" id="cats">${t.wordCats.map((c, k) => `<button class="chip" type="button" data-k="${k}">${c[1]} ${esc(c[0])}</button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div>
    <div class="grid wide" id="words"></div>
  </section>`;
  function render() { $$('#cats .chip', main).forEach((b, k) => b.classList.toggle('on', k === cat));
    $('#words').innerHTML = t.wordCats[cat][2].map(w => `<button class="tile ${has('word:' + L + ':' + w[0]) ? 'done' : ''}" type="button" data-w="${esc(w[0])}"><span class="pic">${w[1]}</span><span class="lbl">${esc(caseIt(w[0]))}</span></button>`).join('');
    $$('[data-w]', main).forEach(b => b.onclick = () => showWord(b.dataset.w, b)); bigOpts(main, '#words', 3); }
  function showWord(word, b) { const w = t.wordCats[cat][2].find(x => x[0] === word); const syl = (t.syllabify[word] || word).split('-'); const st = $('#stage'); st.hidden = false;
    st.innerHTML = `<div class="pic">${w[1]}</div><div class="word" id="wd">${syl.map((s, i) => `<span data-i="${i}">${esc(caseIt(s))}</span>`).join('<span style="color:var(--muted)">·</span>')}</div>
      <div class="row"><button class="btn big icon" id="say" type="button" aria-label="${esc(u.listen)}">🔊</button><button class="btn alt icon" id="bysyl" type="button" aria-label="${esc(u.bySyl)}">🧩</button></div>`;
    award(1, 'word:' + L + ':' + word); b.classList.add('done');
    // Palabra entera → pausa → sílaba por sílaba (resaltando) → palabra entera otra vez.
    const spans = $$('#wd span[data-i]'); const clear = () => spans.forEach(s => s.style.color = '');
    const bySyl = () => { if (softR(syl)) { spans.forEach(sp => sp.style.color = 'var(--a)'); Voice.seq(sylSpeech(syl).concat([500, { t: word, rate: .8 }]), clear); return; }
      let i = 0; const step = () => { clear(); if (i < syl.length) { spans[i].style.color = 'var(--a)'; const k = i; i++; Voice.seq([{ t: syl[k], rate: .55 }, 350], step); } else Voice.seq([{ t: word, rate: .8 }]); }; step(); };
    Voice.seq([{ t: word, rate: .75 }, 900], bySyl);
    $('#say').onclick = () => Voice.seq([{ t: word, rate: .75 }]); $('#bysyl').onclick = bySyl; $('#wd').onclick = bySyl;
    st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  $$('#cats .chip', main).forEach(b => b.onclick = () => { cat = +b.dataset.k; Sfx.tap(); Voice.seq([t.wordCats[cat][0]]); render(); });
  wire(); render(); guideSay(S().words);
}

/* Sílabas en voz alta. Una sílaba interna que empieza con r suave ("ri" de mariposa) suena fuerte si se dice sola,
   así que esas palabras se dicen como una sola frase con punto medio: "ma·ri·po·sa" (la voz mantiene la r suave). */
function softR(parts) { return parts.some((p, i) => i > 0 && /^r[^r]/i.test(p)); }
function sylSpeech(parts, rate) { return softR(parts) ? [{ t: parts.join('·'), rate: rate || .6 }] : parts.flatMap(p => [{ t: p, rate: rate || .55 }, 350]); }
/* ---------- read-along engine (used by phrases & stories) ---------- */
function readAlong(container, text, onDone) {
  const words = $$('.w', container); const tokens = text.split(' '); let starts = [], pos = 0;
  tokens.forEach(tk => { starts.push(pos); pos += tk.length + 1; });
  let boundaryWorked = false, timer = null;
  const hl = i => words.forEach((w, k) => w.classList.toggle('hl', k === i));
  Voice.say(text, {
    onboundary: e => { if (e.name && e.name !== 'word') return; boundaryWorked = true; const ci = e.charIndex || 0; let i = 0; while (i + 1 < starts.length && starts[i + 1] <= ci) i++; hl(i); },
    onend: () => { clearTimeout(timer); hl(-1); if (onDone) onDone(); },
  });
  // fallback when the engine gives no boundary events (iOS Safari): time-based highlighting
  const per = (60 / (settings.rate * 150)) * 1000 * 1.15; let i = 0;
  const tick = () => { if (boundaryWorked) return; if (i < words.length) { hl(i); i++; timer = setTimeout(tick, per * Math.max(.7, tokens[i - 1].length / 4)); } };
  timer = setTimeout(tick, 250);
}

/* ---------- 5. phrases ---------- */
function phrasesScreen() { Diag.crumb('phrasesScreen');
  const t = T(), u = U(), L = settings.lang; let i = 0;
  main.innerHTML = `<section class="screen">${topbar(u.phrasesT)}${guideHtml(S().phrases)}
    <div class="stage" id="stage"></div>
    <div class="row"><button class="btn alt icon" id="prev" type="button" aria-label="${esc(u.prev)}">⬅️</button><button class="btn big icon" id="read" type="button" aria-label="${esc(u.readAll)}">🔊</button><button class="btn icon" id="next" type="button" aria-label="${esc(u.next)}">➡️</button></div>
    <div class="pager" id="pager">${t.phrases.map((p, k) => `<i data-k="${k}"></i>`).join('')}</div>
  </section>`;
  function show() { const p = t.phrases[i]; const words = p[0].split(' ');
    $('#stage').innerHTML = `<div class="pagepic">${p[1]}</div><div class="sentence" id="sent">${words.map(w => `<button class="w" type="button" data-w="${esc(w.replace(/[.,!?—"]/g, ''))}">${esc(caseIt(w))}</button>`).join('')}</div>`;
    $$('#pager i').forEach((d, k) => d.classList.toggle('on', k === i));
    $$('.w', main).forEach(b => b.onclick = () => { $$('.w', main).forEach(x => x.classList.remove('hl')); b.classList.add('hl'); Voice.say(b.dataset.w, { rate: .75, onend: () => b.classList.remove('hl') }); });
    read(); }
  function read() { Voice.stop(); setTimeout(() => readAlong($('#sent'), t.phrases[i][0], () => award(1, 'phrase:' + L + ':' + i)), 100); }
  $('#read').onclick = read; $('#next').onclick = () => { Sfx.tap(); i = (i + 1) % t.phrases.length; show(); }; $('#prev').onclick = () => { Sfx.tap(); i = (i - 1 + t.phrases.length) % t.phrases.length; show(); };
  wire(); guideSay(S().phrases, show);
}

/* ---------- 6. stories ---------- */
function storiesScreen() { Diag.crumb('storiesScreen');
  const t = T(), u = U(), L = settings.lang;
  const card = (s, k) => `<button class="tile storycard ${has('story:' + L + ':' + k) ? 'done' : ''}" type="button" data-k="${k}"><span class="pic">${s.cover}</span><span class="lbl">${esc(s.title)}</span></button>`;
  main.innerHTML = `<section class="screen">${topbar(u.storiesT)}${guideHtml(S().stories)}
    <div class="grid wide" id="shortS">${t.stories.map((s, k) => s.long ? '' : card(s, k)).join('')}</div>
    <p class="prompt">📚 ${esc(u.longT)}</p>
    <div class="grid wide" id="longS">${t.stories.map((s, k) => s.long ? card(s, k) : '').join('')}</div>
  </section>`;
  $$('[data-k]', main).forEach(b => b.onclick = () => { Sfx.tap(); storyScreen(+b.dataset.k); }); bigOpts(main, '#shortS', 2); bigOpts(main, '#longS', 2);
  wire(); guideSay(S().stories);
}
function storyScreen(k) { Diag.crumb('story:' + k);
  const t = T(), u = U(), L = settings.lang; const s = t.stories[k]; let pg = 0; const n = s.pages.length;
  main.innerHTML = `<section class="screen">${topbar(s.title)}
    <div class="progress"><i id="bar"></i></div>
    <div class="stage" id="stage"></div>
    <div class="row"><button class="btn alt icon" id="prev" type="button" aria-label="${esc(u.prev)}">⬅️</button><button class="btn big icon" id="read" type="button" aria-label="${esc(u.readAll)}">🔊</button><button class="btn icon" id="next" type="button" aria-label="${esc(u.next)}">➡️</button></div>
    <div class="feedback" id="fb"></div>
  </section>`;
  function show() { $('#bar').style.width = (pg / n * 100) + '%';
    if (pg < n) { const p = s.pages[pg]; const words = p[0].split(' ');
      $('#stage').innerHTML = `<div class="pagepic">${p[1]}</div><div class="sentence" id="sent">${words.map(w => `<button class="w" type="button" data-w="${esc(w.replace(/[.,!?—"¡¿]/g, ''))}">${esc(caseIt(w))}</button>`).join('')}</div><div class="sub">${pg + 1} / ${n}</div>`;
      $$('.w', main).forEach(b => b.onclick = () => { Voice.say(b.dataset.w, { rate: .75 }); });
      $('#next').textContent = '➡️'; if (first) { first = false; Voice.seq([s.title, 700], read); } else read(); }
    else quiz(); }
  function read() { if (pg < n) { Voice.stop(); setTimeout(() => readAlong($('#sent'), s.pages[pg][0], () => { if (pg === n - 1) return; setTimeout(() => { const nx = $('#next'); if (nx) nx.classList.add('pulse'); }, 600); }), 100); } }
  const qs = s.qs || [s.q]; let qi = 0;
  function quiz() { const q = qs[qi]; const opts = q[1].map((o, i) => [o, i]); const last = qi === qs.length - 1;
    $('#stage').innerHTML = `<div class="sub">${esc(u.question)} ${qs.length > 1 ? (qi + 1) + '/' + qs.length : ''}</div><div class="word" style="font-size:1.5rem;letter-spacing:0">${esc(q[0])}</div>
      <div class="grid" style="width:100%">${shuffle(opts).map(o => `<button class="tile" type="button" data-i="${o[1]}"><span class="pic">${o[0][1]}</span><span class="lbl">${esc(o[0][0])}</span></button>`).join('')}</div>`;
    bigOpts($('#stage'), '.grid'); Voice.seq([q[0], 900, q[0]]); $('#next').textContent = last ? '🏠' : '➡️'; $('#next').onclick = () => { if (last) home(); else { qi++; quiz(); } };
    $$('[data-i]', main).forEach(b => b.onclick = () => { if (+b.dataset.i === q[2]) { markGood(b); Sfx.good(); hit('story:' + k); confetti(); $('#stage').style.pointerEvents = 'none';
        if (last) { $('#fb').textContent = u.theEnd; award(3, 'story:' + L + ':' + k); Voice.seq([cheer(), 500, u.theEnd]); }
        else { award(1); Voice.seq([cheer(), 600], () => { if (document.contains($('#stage'))) { $('#stage').style.pointerEvents = ''; qi++; quiz(); } }); } }
      else { b.classList.add('bad'); Sfx.bad(); miss('story:' + k); $('#fb').textContent = u.bad; setTimeout(() => b.classList.remove('bad'), 400); const ok = $$('[data-i]', main).find(x => +x.dataset.i === q[2]); Voice.seq([u.bad, 600, q[0]]); setTimeout(() => ok.classList.add('pulse'), 1500); } }); }
  $('#read').onclick = read; $('#next').onclick = () => { Sfx.tap(); $('#next').classList.remove('pulse'); if (pg < n) { pg++; show(); } else home(); }; $('#prev').onclick = () => { Sfx.tap(); if (pg > 0) { pg--; show(); } };
  let first = true; wire(); show();
}

/* ---------- 7. trace ---------- */
function traceScreen(startLetter) { Diag.crumb('traceScreen');
  // Letras ordenadas y, al final, los números del 0 al 9 (preescritura de cifras; no tienen minúscula).
  const t = T(), u = U(); const letters = t.vowels.map(v => v[0]).concat(t.letters.map(l => l[0].toUpperCase())).sort((a, b) => a.localeCompare(b, 'es')).concat('0123456789'.split(''));
  let L = startLetter || letters[0], upper = true; const isDigit = () => /^\d$/.test(L);
  main.innerHTML = `<section class="screen">${topbar(u.traceT)}
    <div class="chips" style="overflow-x:auto;flex-wrap:nowrap;justify-content:flex-start;padding:4px 2px" id="lchips">${letters.map(l => `<button class="chip ${has('trace:' + l) ? 'on' : ''}" type="button" data-l="${l}">${l}</button>`).join('')}</div>
    ${guideHtml(S().trace)}
    <div class="tracewrap">
      <div class="row"><button class="chip" id="caseU" type="button">${esc(u.upper)}</button><button class="chip" id="caseL" type="button">${esc(u.lower)}</button></div>
      <div class="palette" id="palette"></div>
      <canvas class="trace" id="cv" width="600" height="600"></canvas>
      <div class="row"><button class="btn alt icon" id="clear" type="button" aria-label="${esc(u.clear)}">🧽</button><button class="btn big icon" id="say" type="button" aria-label="${esc(u.listen)}">🔊</button></div>
      <div class="feedback" id="fb"></div></div>
  </section>`;
  const cv = $('#cv'), ctx = cv.getContext('2d'); const guide = document.createElement('canvas'); guide.width = guide.height = 600; const gctx = guide.getContext('2d');
  const colors = ['#ff6b6b', '#ffb400', '#2ec4b6', '#5b8def', '#b56fe3', '#ff7ac8', '#38d9a9', '#ffffff']; let strokeColor = colors[0];
  // Paleta: el niño elige el color (antes salía al azar). Mezclar colores en la misma letra está permitido.
  $('#palette').innerHTML = colors.map((c, i) => `<button class="swatchbtn ${i === 0 ? 'on' : ''}" type="button" data-col="${c}" style="background:${c}" aria-label="color"></button>`).join('');
  $$('#palette .swatchbtn').forEach(b => b.onclick = () => { strokeColor = b.dataset.col; $$('#palette .swatchbtn').forEach(x => x.classList.toggle('on', x === b)); Sfx.tone(600 + colors.indexOf(strokeColor) * 50, 0, .12, 'triangle', .1); });
  // Máscara de la letra (un poco más ancha que la letra) para que el pincel NO pinte fuera: como un libro de colorear mágico.
  const mask = document.createElement('canvas'); mask.width = mask.height = 600; const mctx = mask.getContext('2d');
  const ink = document.createElement('canvas'); ink.width = ink.height = 600; const ictx = ink.getContext('2d');
  function draw() { const ch = upper ? L : L.toLowerCase();
    $$('#lchips .chip').forEach(b => b.classList.toggle('on', b.dataset.l === L)); $('#caseU').classList.toggle('on', upper); $('#caseL').classList.toggle('on', !upper); $('#caseU').hidden = $('#caseL').hidden = isDigit();
    // La guía usa el color del texto del tema (en oscuro, claro): si no, en modo oscuro no se ve por dónde trazar.
    const fg = (getComputedStyle(document.documentElement).getPropertyValue('--fg') || '#2b2340').trim();
    gctx.clearRect(0, 0, 600, 600); gctx.font = '700 420px Fredoka, Nunito, Arial, sans-serif'; gctx.textAlign = 'center'; gctx.textBaseline = 'middle'; gctx.fillStyle = fg; gctx.fillText(ch, 300, 320);
    mctx.clearRect(0, 0, 600, 600); mctx.font = gctx.font; mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillStyle = '#000'; mctx.strokeStyle = '#000'; mctx.lineWidth = 26; mctx.lineJoin = 'round'; mctx.fillText(ch, 300, 320); mctx.strokeText(ch, 300, 320);
    ictx.clearRect(0, 0, 600, 600); ictx.lineCap = 'round'; ictx.lineJoin = 'round'; ictx.lineWidth = 34;
    ctx.clearRect(0, 0, 600, 600); ctx.save(); ctx.globalAlpha = .22; ctx.drawImage(guide, 0, 0); ctx.restore();
    // dashed outline so the child sees the path
    ctx.save(); ctx.globalAlpha = .65; ctx.font = gctx.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 5; ctx.setLineDash([14, 10]); ctx.strokeStyle = fg; ctx.strokeText(ch, 300, 320); ctx.restore();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 34; $('#fb').textContent = ''; }
  // Pinta en la capa de tinta, la recorta con la máscara de la letra y la compone sobre la guía.
  function stroke(a, b) { ictx.strokeStyle = strokeColor; ictx.beginPath(); ictx.moveTo(a.x, a.y); ictx.lineTo(b.x, b.y); ictx.stroke();
    ictx.save(); ictx.globalCompositeOperation = 'destination-in'; ictx.drawImage(mask, 0, 0); ictx.restore();
    const ch = upper ? L : L.toLowerCase(); const fg = (getComputedStyle(document.documentElement).getPropertyValue('--fg') || '#2b2340').trim();
    ctx.clearRect(0, 0, 600, 600); ctx.save(); ctx.globalAlpha = .22; ctx.drawImage(guide, 0, 0); ctx.restore();
    ctx.save(); ctx.globalAlpha = .65; ctx.font = gctx.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 5; ctx.setLineDash([14, 10]); ctx.strokeStyle = fg; ctx.strokeText(ch, 300, 320); ctx.restore();
    ctx.drawImage(ink, 0, 0); }
  let drawing = false, last = null; const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 600 / r.width, y: (e.clientY - r.top) * 600 / r.height }; };
  cv.onpointerdown = e => { drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); stroke(last, { x: last.x + .1, y: last.y }); };
  cv.onpointermove = e => { if (!drawing) return; const p = pt(e); stroke(last, p); last = p; };
  let checkTimer = null, nudges = 0, locked = false;
  cv.onpointerup = cv.onpointercancel = () => { drawing = false; clearTimeout(checkTimer); checkTimer = setTimeout(check, 700); };
  function coverage() { const g = gctx.getImageData(0, 0, 600, 600).data, d = ictx.getImageData(0, 0, 600, 600).data; let tot = 0, hit = 0;
    for (let i = 3; i < g.length; i += 4 * 3) { if (g[i] > 128) { tot++; if (d[i] > 120) hit++; } }
    return { cov: tot ? hit / tot : 0, outside: 0 }; }
  // Al levantar el dedo la app decide sola (la niña de 5 años de Junior pintó la letra y no supo qué más hacer con el ✅):
  // si la letra está cubierta, celebra y sigue; si falta, anima con voz; nunca "casi".
  function check() { if (locked || !document.contains(cv)) return; const r = coverage();
    if (r.cov > .35 && r.outside < .6) { locked = true; nudges = 0; $('#fb').textContent = cheer(); Sfx.good(); confetti(); cv.classList.add('good'); award(1, 'trace:' + L + (upper ? '' : ':min'));
      const go = () => { locked = false; cv.classList.remove('good'); draw(); Voice.seq([{ t: letterName(L), rate: .6 }]); };
      if (upper && !isDigit()) { Voice.seq([cheer(), 700, { t: letterName(L), rate: .6 }, 500, S().nowLower, 400], () => { upper = false; go(); }); }
      else { const idx = letters.indexOf(L); Voice.seq([cheer(), 700, S().next, 300], () => { L = letters[(idx + 1) % letters.length]; upper = true; go(); const c = $$('#lchips .chip').find(b => b.dataset.l === L); if (c) c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }); } }
    else if (r.cov > .08) { nudges++; if (nudges <= 2) Voice.seq([S().keepGoing]); else if (nudges === 3) { miss('trace:' + L); Voice.seq([S().traceHelp]); } }
    else { nudges++; if (nudges <= 3) Voice.seq([S().traceInside]); } }
  $('#clear').onclick = () => { Sfx.tap(); nudges = 0; draw(); }; $('#say').onclick = () => Voice.say(letterName(L));
  $('#caseU').onclick = () => { upper = true; draw(); }; $('#caseL').onclick = () => { upper = false; draw(); };
  $$('#lchips .chip').forEach(b => b.onclick = () => { L = b.dataset.l; Sfx.tap(); Voice.seq([{ t: letterName(L), rate: .6 }]); draw(); });
  wire(); draw(); document.fonts && document.fonts.ready.then(draw); Voice.seq([S().trace, 500, { t: letterName(L), rate: .6 }]);
}

/* ---------- 8. games ---------- */
function gamesScreen() { Diag.crumb('gamesScreen');
  const u = U();
  main.innerHTML = `<section class="screen">${topbar(u.gamesT)}
    ${guideHtml(S().games)}
    <div class="home">${u.games.map((g, i) => `<button class="door d${(i % 8) + 1}" type="button" data-g="${i}"><span class="big">${g[2]}</span>${esc(g[0])}<small>${esc(g[1])}</small></button>`).join('')}</div></section>`;
  $$('[data-g]', main).forEach(b => b.onclick = () => { Sfx.tap(); [gameVowel, gameWord, gameBuild, gameFirst, gameMemory, gameMissing, gameRhyme, gameClap, gameOdd, gameCount, gameTapNum, gameColor, gameShape, gameAdd, gameSub, gameFeel, gameClock, gameDay, gameAnimalSound, gameHabitat, gameMoney, gameWrite, gameBody, gameWeather, gameRead, gameMult, gameFrac, gameSyl][+b.dataset.g](); });
  wire(); guideSay(S().games);
}
let roundWatch = null;
function armWatchdog(name) { clearTimeout(roundWatch); const started = Date.now(); roundWatch = setTimeout(() => { if (document.contains(main.querySelector('#area'))) Diag.log('stall', name + ': 60 s sin cambio de ronda', { locked: main.querySelector('#area').style.pointerEvents === 'none' }); }, 60000); }
let inReview = false;
function roundShell(title, n) { if (!inReview) { pendingStars = 0; if (P) $('#starCount').textContent = P.stars; } $$('.balloons').forEach(l => l.remove());
  main.innerHTML = `<section class="screen">${topbar(title)}${guideHtml(title)}<div class="progress"><i id="bar"></i></div><div id="area"></div><div class="feedback" id="fb"></div></section>`; wire();
  return { area: $('#area'), fb: $('#fb'), bar: $('#bar'), n };
}
function finish(sh, won, replay) {
  clearTimeout(roundWatch); sh.bar.style.width = '100%'; P.games = (P.games || 0) + 1; saveProfiles(); mark('game:' + settings.lang + ':' + (P.games)); checkBadges();
  sh.area.innerHTML = `<div class="stage"><div class="pic">🏆</div><div class="word" style="font-size:1.4rem;letter-spacing:0">${esc(fmt(U().done, { n: won }))}</div>
    <div class="row"><button class="btn big icon" id="again" type="button" aria-label="${esc(U().again)}">🔁</button><button class="btn alt icon" id="hm" type="button" aria-label="${esc(U().home)}">🏠</button></div></div>`;
  sh.fb.textContent = ''; confetti();
  if (won > 0) { Voice.seq([S().catchStars]); balloons(won); } else Voice.seq([fmt(U().done, { n: won })]); $('#hm').onclick = home; $('#again').onclick = replay;
}
/* Globos: las estrellas suben flotando; el niño toca cada una y vuela al contador. Las que no toque se recogen solas. */
function balloons(n) {
  const layer = document.createElement('div'); layer.className = 'balloons'; document.body.appendChild(layer);
  const nums = U().numbers; let caught = 0, left = n; const target = $('#starsBtn');
  const collect = (el) => { if (el._done) return; el._done = true; caught++; left--; Sfx.sparkle(caught);
    const r = el.getBoundingClientRect(), tr = target.getBoundingClientRect(); let m = { e: 0, f: 0 }; try { m = new DOMMatrix(getComputedStyle(el).transform); } catch (e) {}
    el.style.transform = `translate(${m.e}px, ${m.f}px)`; el.classList.add('fly');
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform .6s cubic-bezier(.4,0,.2,1), opacity .6s'; el.style.transform = `translate(${m.e + tr.left + tr.width / 2 - r.left - r.width / 2}px, ${m.f + tr.top + tr.height / 2 - r.top - r.height / 2}px) scale(.35)`; el.style.opacity = '.2'; }));
    setTimeout(() => { el.remove(); pendingStars = Math.max(0, pendingStars - 1); $('#starCount').textContent = P.stars - pendingStars; target.classList.add('bump'); setTimeout(() => target.classList.remove('bump'), 300); }, 600);
    Voice.seq([{ t: nums[Math.min(caught, nums.length) - 1], rate: .95 }]);
    if (left === 0) setTimeout(() => { layer.remove(); Sfx.star(); Voice.seq([400, fmt(U().done, { n }), 300, cheer()]); checkBadges(); }, 700); };
  for (let i = 0; i < n; i++) { const el = document.createElement('button'); el.type = 'button'; el.className = 'balloon'; el.textContent = '⭐'; el.setAttribute('aria-label', '⭐');
    el.style.left = (8 + Math.random() * 76) + '%'; el.style.animationDelay = (i * .45) + 's'; el.style.animationDuration = (10 + Math.random() * 4) + 's'; el.style.setProperty('--sway', (Math.random() * 40 - 20) + 'px');
    el.onpointerdown = e => { e.preventDefault(); el.style.animationPlayState = 'paused'; collect(el); }; layer.appendChild(el); }
  // Las que lleguen arriba sin ser tocadas se recogen solas; así nunca se bloquea.
  layer.querySelectorAll('.balloon').forEach(el => el.addEventListener('animationend', () => collect(el)));
  setTimeout(() => { if (document.contains(layer)) layer.querySelectorAll('.balloon').forEach((el, i) => setTimeout(() => collect(el), i * 250)); }, 22000);
}
/* Cubos grandes: las opciones de los juegos llenan la pantalla y cada una tiene su color. */
const CUBE_COLORS = ['var(--a)', 'var(--e)', 'var(--i)', 'var(--o)', 'var(--u)', '#ff8e53'];
function bigOpts(area, sel, forceCols) { const g = area.querySelector(sel || '.grid'); if (!g) return; const tiles = $$('.tile', g); const n = tiles.length; if (!n) return;
  g.classList.add('cubes'); const cols = forceCols || (n <= 3 ? 1 : n <= 8 ? 2 : 3); const rows = Math.ceil(n / cols); g.style.setProperty('--cols', cols);
  const top = g.getBoundingClientRect().top; const avail = Math.max(0, window.innerHeight - top - 70); const h = Math.max(104, Math.min(240, avail / rows - 14)); g.style.setProperty('--h', h + 'px');
  tiles.forEach((t, i) => { const v = (t.className.match(/\bv([AEIOU])\b/) || [])[1]; if (!t.classList.contains('keep')) t.style.setProperty('--cube', v ? 'var(--' + v.toLowerCase() + ')' : CUBE_COLORS[i % CUBE_COLORS.length]); t.style.animationDelay = (i * .07) + 's'; }); }
/* Marca la respuesta correcta de forma inconfundible: verde propio, marco blanco, ✓ y las otras opciones atenuadas. */
function markGood(b) { b.classList.add('good'); const g = b.closest('.grid, .memo, .pieces'); if (g) g.classList.add('answered'); }
function correct(sh, b, n, after, parts) { markGood(b); Sfx.good(); const c = cheer(); sh.fb.textContent = c; if (n) award(n, null, true); confetti();
  // Avanza cuando la voz TERMINA de felicitar, nunca por reloj (si no, la ronda siguiente corta la frase).
  armWatchdog('correct'); sh.area.style.pointerEvents = 'none'; // un toque extra no debe cancelar la felicitación ni trabar la ronda
  Voice.seq((parts || []).concat([c, 500]), () => { sh.area.style.pointerEvents = ''; if (document.contains(sh.area)) after(); }); }
function wrong(sh, b, retry, tries, okSel) { b.classList.add('bad'); Sfx.bad(); sh.fb.textContent = U().bad; setTimeout(() => b.classList.remove('bad'), 400);
  if (tries >= 2 && okSel) { const ok = sh.area.querySelector(okSel); if (ok) { ok.classList.add('pulse'); Voice.seq([U().bad, 500, S().hint]); return; } }
  if (retry) setTimeout(() => { if (sh.area.style.pointerEvents !== 'none') retry(); }, 500); }
/* ---------- dificultad adaptativa (meta ~80 % de aciertos; sube con 3 aciertos seguidos, baja con 2 fallos) ---------- */
function level(g) { return (P && P.lvl && P.lvl[g]) || 1; }
function adapt(g, ok) { if (!P) return; P.lvl = P.lvl || {}; P.adapt = P.adapt || {}; const a = P.adapt[g] || (P.adapt[g] = { s: 0, m: 0 }); const before = level(g);
  if (ok) { a.s++; a.m = 0; if (a.s >= 3 && before < 3) { P.lvl[g] = before + 1; a.s = 0; } }
  else { a.m++; a.s = 0; if (a.m >= 2 && before > 1) { P.lvl[g] = before - 1; a.m = 0; } }
  saveProfiles(); if (level(g) > before) { Diag.log('level', g + ' sube a ' + level(g)); setTimeout(() => { Sfx.star(); toast('⬆️ ' + U().levelUp); }, 1200); } else if (level(g) < before) Diag.log('level', g + ' baja a ' + level(g)); }
function firstSeen(key) { if (!P) return; P.seen = P.seen || {}; if (!P.seen[key]) { P.seen[key] = Date.now(); saveProfiles(); } }
/* Cierre de un juego: si forma parte del Juego del día, pasa al siguiente segmento; si no, pantalla final con globos. */
function done(sh, won, replay, opts) { if (opts && opts.next) { clearTimeout(roundWatch); opts.next(won); } else finish(sh, won, replay); }
function gameShell(title, opts, def) { const n = (opts && opts.rounds) || def; const sh = roundShell(title, n); if (opts && opts.part) { const p = $('#guideText'); if (p) p.textContent = title; } return sh; }
/* La pregunta de la ronda se dice tras una pausa; si el niño ya acertó (área bloqueada por correct()), no se dice: cortaría la felicitación y la ronda quedaría trabada. */
function areaFree() { const a = main.querySelector('#area'); return !a || a.style.pointerEvents !== 'none'; }
function askOnce(opts, r, intro, hear) { const safe = () => { if (areaFree()) hear(); }; if (r === 0 && !(opts && opts.quiet)) Voice.seq([intro, 600], safe); else setTimeout(safe, 300); }

function gameVowel(focus, opts) { Diag.crumb('gameVowel'); opts = opts || {};
  const t = T(), u = U(); const sh = gameShell(u.games[0][0], opts, 6); let r = 0, won = 0; const L = level('vowel');
  function round() { if (r === sh.n) { done(sh, won, () => gameVowel(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const k = (focus != null && r % 2 === 0) ? focus : Math.floor(Math.random() * 5), v = t.vowels[k]; let tries = 0; firstSeen('vowel:' + v[0]);
    // Nivel 1: 3 opciones. Nivel 2: las 5. Nivel 3: las 5 y mezcla mayúscula/minúscula.
    const idx = L === 1 ? shuffle([k].concat(pick([0, 1, 2, 3, 4].filter(i => i !== k), 2))) : [0, 1, 2, 3, 4];
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(u.hear)}</p>
      <div class="grid">${idx.map(i => `<button class="tile ${cls[i]}" type="button" data-i="${i}">${L === 3 ? (Math.random() < .5 ? t.vowels[i][0] : t.vowels[i][0].toLowerCase()) : caseIt(t.vowels[i][0].toLowerCase())}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([{ t: v[0], rate: .55 }, 700, { t: v[0], rate: .55 }]); $('#hear').onclick = hear; askOnce(opts, r, S().gVowel, hear);
    $$('[data-i]', sh.area).forEach(b => b.onclick = () => { if (+b.dataset.i === k) { if (tries === 0) hit('vowel:' + v[0]); adapt('vowel', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: v[0], rate: .6 }, 300]); if (tries === 0) won++; } else { tries++; miss('vowel:' + v[0]); if (tries === 1) adapt('vowel', false); wrong(sh, b, hear, tries, `[data-i="${k}"]`); } }); }
  $('#guideText').textContent = S().gVowel; round();
}
function gameWord(focus, opts) { Diag.crumb('gameWord'); opts = opts || {};
  const t = T(), u = U(); const all = t.wordCats.flatMap(c => c[2]); const sh = gameShell(u.games[1][0], opts, 6); let r = 0, won = 0; const L = level('word'); const nOpts = [3, 4, 6][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameWord(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; let ans = all[Math.floor(Math.random() * all.length)]; let tries = 0;
    if (focus && r % 2 === 0) { const f = all.find(w => w[0] === focus); if (f) ans = f; }
    // Nivel 3: distractores que empiezan con la misma letra (hay que escuchar la palabra completa).
    let others = all.filter(w => w[0] !== ans[0]); if (L === 3) { const same = others.filter(w => w[0][0] === ans[0][0]); others = same.length >= 2 ? same.concat(others.filter(w => w[0][0] !== ans[0][0])) : others; }
    const opts3 = shuffle([ans].concat(L === 3 ? others.slice(0, nOpts - 1) : pick(others, nOpts - 1))); firstSeen('word:' + ans[0]);
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(u.hear)}</p>
      <div class="grid ${nOpts > 4 ? '' : 'wide'}">${opts3.map(w => `<button class="tile" type="button" data-w="${esc(w[0])}"><span class="pic">${w[1]}</span></button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([{ t: ans[0], rate: .7 }]); $('#hear').onclick = hear; askOnce(opts, r, S().gWord, hear);
    $$('[data-w]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.w === ans[0]) { b.innerHTML += `<span class="lbl">${esc(caseIt(ans[0]))}</span>`; if (tries === 0) hit('word:' + ans[0]); adapt('word', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: ans[0], rate: .7 }, 400]); if (tries === 0) won++; } else { tries++; miss('word:' + ans[0]); if (tries === 1) adapt('word', false); wrong(sh, b, hear, tries, `[data-w="${ans[0].replace(/"/g, '')}"]`); } }); }
  $('#guideText').textContent = S().gWord; round();
}
function gameBuild(focus, opts) { Diag.crumb('gameBuild'); opts = opts || {};
  const t = T(), u = U(); const sh = gameShell(u.games[2][0], opts, 6); let r = 0, won = 0; const L = level('build');
  // Nivel 1: solo palabras de 2 piezas y 1 pieza extra. Nivel 2: cualquier largo. Nivel 3: 2 piezas extra.
  const poolW = L === 1 ? t.build.filter(x => x.length === 3) : t.build; let items = pick(poolW.length >= 6 ? poolW : t.build, sh.n);
  if (focus) { const f = t.build.find(x => x.slice(0, -1).join('') === focus); if (f) items = [f].concat(items.filter(x => x !== f)).slice(0, sh.n); }
  function round() { if (r === sh.n) { done(sh, won, () => gameBuild(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const it = items[r], parts = it.slice(0, -1), pic = it[it.length - 1], word = parts.join(''); let placed = [], bad = false; firstSeen('build:' + word);
    // Piezas extra que NO van (así no se puede resolver por patrón sin leer) y orden realmente aleatorio, nunca el correcto.
    const pool = shuffle(t.build.filter(x => x !== it).flatMap(x => x.slice(0, -1)).filter(x => !parts.includes(x))); const extras = pool.slice(0, L === 3 ? 2 : 1);
    const all = parts.map((p, i) => i).concat(extras.map((e, j) => -1 - j)); let order; do { order = shuffle(all); } while (order.slice(0, parts.length).join() === parts.map((p, i) => i).join());
    sh.area.innerHTML = `<div class="stage"><div class="pic">${pic}</div><button class="btn big icon" id="hear" type="button" aria-label="${esc(u.listen)}">🔊</button>
      <div class="slots">${parts.map(() => `<div class="slot jig"></div>`).join('')}</div>
      <div class="pieces">${order.map(i => `<button class="piece jig" type="button" data-i="${i}">${esc(caseIt(i < 0 ? extras[-1 - i] : parts[i]))}</button>`).join('')}</div></div>`;
    const hear = () => Voice.seq([{ t: word, rate: .7 }, 600].concat(sylSpeech(parts), [{ t: word, rate: .8 }])); $('#hear').onclick = hear; askOnce(opts, r, S().gBuild, hear);
    const slots = $$('.slot', sh.area);
    $$('.piece', sh.area).forEach(b => b.onclick = () => { const i = +b.dataset.i;
      if (i === placed.length) { b.disabled = true; slots[i].textContent = caseIt(parts[i]); slots[i].classList.add('full'); placed.push(i); Sfx.tap();
        if (placed.length < parts.length) Voice.seq([{ t: parts[i], rate: .7 }]);
        else { const c = cheer(); sh.fb.textContent = c; Sfx.good(); $$('.slot', sh.area).forEach(x => x.classList.add('good')); if (!bad) { award(2, null, true); won += 2; hit('build:' + word); } adapt('build', !bad); confetti();
          sh.area.style.pointerEvents = 'none'; armWatchdog('build');
          Voice.seq([{ t: parts[i], rate: .7 }, 500, { t: word, rate: .7 }, 600, c, 600], () => { sh.area.style.pointerEvents = ''; if (document.contains(sh.area)) { r++; round(); } }); } }
      else { if (!bad) { miss('build:' + word); adapt('build', false); } bad = true; wrong(sh, b, null, 2, `.piece[data-i="${placed.length}"]`); } }); }
  $('#guideText').textContent = S().gBuild; round();
}
function gameFirst(focus, opts) { Diag.crumb('gameFirst'); opts = opts || {};
  // Solo letras cuya palabra empieza de verdad con ellas (en inglés "x de fox" no sirve para "¿con qué letra empieza?")
  const t = T(), u = U(); const all = t.letters.concat(t.vowels.map(v => [v[0].toLowerCase(), v[1], v[2], v[0]])).filter(x => x[1].toLowerCase().startsWith(x[0])); const sh = gameShell(u.games[3][0], opts, 6); let r = 0, won = 0; const L = level('first'); const nOpts = [3, 4, 6][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameFirst(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const ans = (focus && r % 2 === 0 && all.find(x => x[0] === focus)) || all[Math.floor(Math.random() * all.length)]; let tries = 0; firstSeen('letter:' + ans[0]);
    const opts3 = shuffle([ans].concat(pick(all.filter(x => x[0] !== ans[0]), nOpts - 1)));
    sh.area.innerHTML = `<div class="stage"><div class="pic">${ans[2]}</div>${L < 3 ? `<div class="word">${esc(caseIt(ans[1]))}</div>` : ''}<button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${opts3.map(o => `<button class="tile" type="button" data-l="${o[0]}">${caseIt(o[0])}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([{ t: ans[1], rate: .65 }, 500, { t: ans[1], rate: .55 }]); $('#hear').onclick = hear; askOnce(opts, r, S().gFirst, hear);
    $$('[data-l]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.l === ans[0]) { if (tries === 0) hit('letter:' + ans[0]); adapt('first', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: ans[1], rate: .7 }, 400]); if (tries === 0) won++; } else { tries++; miss('letter:' + ans[0]); if (tries === 1) adapt('first', false); wrong(sh, b, hear, tries, `[data-l="${ans[0]}"]`); } }); }
  $('#guideText').textContent = S().gFirst; round();
}
function gameMemory() { Diag.crumb('gameMemory');
  const t = T(), u = U(); const all = t.wordCats.flatMap(c => c[2]).filter(w => w[0].length <= 6); const sh = roundShell(u.games[4][0], 1); let won = 0;
  const pairs = pick(all, 4); const cards = shuffle(pairs.flatMap((w, i) => [{ k: i, kind: 'pic', v: w[1], w: w[0] }, { k: i, kind: 'txt', v: caseIt(w[0]), w: w[0] }]));
  let open = [], matched = 0, lock = false;
  $('#guideText').textContent = S().gMemory; Voice.seq([S().gMemory]);
  sh.area.innerHTML = `<div class="memo">${cards.map((c, i) => `<button class="tile face" type="button" data-i="${i}">❔</button>`).join('')}</div>`; bigOpts(sh.area);
  $$('[data-i]', sh.area).forEach(b => b.onclick = () => { const i = +b.dataset.i, c = cards[i]; if (lock || open.includes(i) || b.classList.contains('matched')) return;
    b.classList.remove('face'); b.innerHTML = c.kind === 'pic' ? `<span class="pic">${c.v}</span>` : `<span class="lbl">${esc(c.v)}</span>`; Voice.seq([{ t: c.w, rate: .75 }]); open.push(i);
    if (open.length === 2) { lock = true; const [a, bI] = open; const A = $$('[data-i]', sh.area)[a], B = $$('[data-i]', sh.area)[bI];
      if (cards[a].k === cards[bI].k) { setTimeout(() => { A.classList.add('matched'); B.classList.add('matched'); Sfx.good(); matched++; award(1, null, true); won++; open = []; lock = false; sh.bar.style.width = (matched / 4 * 100) + '%'; if (matched === 4) setTimeout(() => { if (document.contains(sh.area)) finish(sh, won, gameMemory); }, 600); }, 400); }
      else setTimeout(() => { [A, B].forEach(x => { x.classList.add('face'); x.innerHTML = '❔'; }); Sfx.bad(); open = []; lock = false; }, 900); } });
}
function gameMissing(focus, opts) { Diag.crumb('gameMissing'); opts = opts || {};
  const t = T(), u = U(); const sh = gameShell(u.games[5][0], opts, 6); let r = 0, won = 0; let items = pick(t.missing, sh.n); const L = level('missing'); const nOpts = [3, 5, 5][L - 1];
  if (focus) { const f = t.missing.find(x => x[0] === focus); if (f) items = [f].concat(items.filter(x => x !== f)).slice(0, sh.n); }
  function round() { if (r === sh.n) { done(sh, won, () => gameMissing(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const [word, pic, idx] = items[r]; const ans = word[idx]; let tries = 0; firstSeen('missing:' + word);
    const shown = word.split('').map((ch, i) => i === idx ? `<span id="gap" style="color:var(--a);border-bottom:4px solid var(--a)">&nbsp;&nbsp;</span>` : esc(caseIt(ch))).join('');
    const vs = nOpts === 5 ? ['a', 'e', 'i', 'o', 'u'] : shuffle([ans].concat(pick(['a', 'e', 'i', 'o', 'u'].filter(v => v !== ans), 2)));
    sh.area.innerHTML = `<div class="stage"><div class="pic">${pic}</div><div class="word" id="wd">${shown}</div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${vs.map(v => `<button class="tile ${cls['aeiou'.indexOf(v)]}" type="button" data-v="${v}">${caseIt(v)}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([{ t: word, rate: .6 }, 500, { t: word, rate: .75 }]); $('#hear').onclick = hear; askOnce(opts, r, S().gMissing, hear);
    $$('[data-v]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.v === ans) { $('#gap').textContent = caseIt(ans); $('#gap').style.borderBottom = 'none'; if (tries === 0) hit('missing:' + word); adapt('missing', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: word, rate: .7 }, 400]); if (tries === 0) won++; } else { tries++; miss('missing:' + word); if (tries === 1) adapt('missing', false); wrong(sh, b, hear, tries, `[data-v="${ans}"]`); } }); }
  $('#guideText').textContent = S().gMissing; round();
}
/* ¿Qué sílaba escuchas? El paso entre las letras y las palabras: oír "ma" y distinguirla de "me" (vocal) o de "pa" (consonante). */
function gameSyl(focus, opts) { Diag.crumb('gameSyl'); opts = opts || {};
  const t = T(), u = U(); const vs = ['a', 'e', 'i', 'o', 'u']; const sh = gameShell(u.games[27][0], opts, 6); let r = 0, won = 0; const L = level('syl');
  // Blending solo con consonantes continuas ("mmm… a… ma"); las oclusivas (b, p, t…) no se alargan: se repite la sílaba.
  const snd = x => (t.sounds || {})[x] || ''; const blend = (c, v, s) => snd(c) && !snd(c).includes(',') ? [{ t: snd(c), rate: .55 }, 400, { t: v, rate: .55 }, 400, { t: s, rate: .65 }] : [{ t: s, rate: .55 }, 500, { t: s, rate: .65 }];
  function round() { if (r === sh.n) { done(sh, won, () => gameSyl(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; let tries = 0;
    let c = t.cons[Math.floor(Math.random() * t.cons.length)], v = vs[Math.floor(Math.random() * 5)];
    if (focus && r % 2 === 0) { const m = t.cons.find(x => focus.startsWith(x) && vs.includes(focus.slice(x.length))); if (m) { c = m; v = focus.slice(m.length); } }
    const ans = u.sylOf(c, v); firstSeen('syl:' + ans);
    // Nivel 1: misma consonante, 3 vocales. Nivel 2: misma consonante, las 5. Nivel 3: misma vocal, consonantes distintas (hay que oír el inicio).
    const optsS = L === 3 ? shuffle([c].concat(pick(t.cons.filter(x => x !== c), 3))).map(x => u.sylOf(x, v)) : (L === 1 ? shuffle([v].concat(pick(vs.filter(x => x !== v), 2))) : vs).map(x => u.sylOf(c, x));
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(u.hear)}</p>
      <div class="grid">${optsS.map(s => `<button class="tile ${L === 3 ? '' : cls[vs.indexOf(s.slice(c.length))] || ''}" type="button" data-s="${esc(s)}">${caseIt(s)}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([{ t: ans, rate: .6 }, 700, { t: ans, rate: .6 }]); $('#hear').onclick = hear; askOnce(opts, r, S().gSyl, hear);
    $$('[data-s]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.s === ans) { if (tries === 0) hit('syl:' + ans); adapt('syl', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, blend(c, v, ans).concat([300])); if (tries === 0) won++; } else { tries++; miss('syl:' + ans); if (tries === 1) adapt('syl', false); Voice.seq([{ t: b.dataset.s, rate: .6 }]); wrong(sh, b, null, tries, `[data-s="${ans}"]`); } }); }
  $('#guideText').textContent = S().gSyl; round();
}

/* ---------- conciencia fonológica (rimas, sílabas, sonido inicial): lo que más predice la lectura ---------- */
function gameRhyme(focus, opts) { Diag.crumb('gameRhyme'); opts = opts || {};
  const t = T(), u = U(); const sets = t.rhymes; const sh = gameShell(u.games[6][0], opts, 6); let r = 0, won = 0; const L = level('rhyme'); const nOpts = L === 1 ? 2 : 3;
  function round() { if (r === sh.n) { done(sh, won, () => gameRhyme(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const set = sets[Math.floor(Math.random() * sets.length)]; const [target, ans] = pick(set, 2); let tries = 0;
    const others = pick(sets.filter(s => s !== set).map(s => s[Math.floor(Math.random() * s.length)]), nOpts - 1); const opts3 = shuffle([ans].concat(others)); firstSeen('rhyme:' + target[0]);
    sh.area.innerHTML = `<div class="stage"><div class="pic">${target[1]}</div><div class="word">${esc(caseIt(target[0]))}</div><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(fmt(S().rhymeQ, { w: target[0] }))}</p>
      <div class="grid wide">${opts3.map(w => `<button class="tile" type="button" data-w="${esc(w[0])}"><span class="pic">${w[1]}</span><span class="lbl">${esc(caseIt(w[0]))}</span></button>`).join('')}</div>`;
    // Se escuchan TODAS las opciones: el niño compara sonidos, no lee.
    bigOpts(sh.area); const hear = () => Voice.seq([{ t: target[0], rate: .7 }, 500, fmt(S().rhymeQ, { w: target[0] }), 500].concat(opts3.flatMap(w => [{ t: w[0], rate: .7 }, 450]))); $('#hear').onclick = hear; askOnce(opts, r, S().gRhyme, hear);
    $$('[data-w]', sh.area).forEach(b => { b.onclick = () => { if (b.dataset.w === ans[0]) { if (tries === 0) hit('rhyme:' + target[0]); adapt('rhyme', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: target[0], rate: .7 }, 250, { t: ans[0], rate: .7 }, 300, S().theyRhyme, 300]); if (tries === 0) won++; } else { tries++; miss('rhyme:' + target[0]); if (tries === 1) adapt('rhyme', false); Voice.seq([{ t: target[0], rate: .7 }, 200, { t: b.dataset.w, rate: .7 }, 300, S().noRhyme]); wrong(sh, b, null, tries, `[data-w="${ans[0]}"]`); } }; }); }
  $('#guideText').textContent = S().gRhyme; round();
}
function gameClap(focus, opts) { Diag.crumb('gameClap'); opts = opts || {};
  const t = T(), u = U(); const sh = gameShell(u.games[7][0], opts, 6); let r = 0, won = 0; const L = level('clap');
  const pool = t.claps.filter(x => L === 1 ? x[2] <= 2 : L === 2 ? x[2] <= 3 : true); const items = pick(pool, sh.n);
  function round() { if (r === sh.n) { done(sh, won, () => gameClap(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const [word, pic, n, syl] = items[r]; let taps = 0, timer = null, tries = 0, locked = false; firstSeen('clap:' + word);
    sh.area.innerHTML = `<div class="stage"><div class="pic">${pic}</div><div class="word">${esc(caseIt(word))}</div><button class="btn big icon" id="hear" type="button">🔊</button>
      <div class="claps" id="claps"></div><button class="drum" id="drum" type="button" aria-label="🥁">🥁</button></div><p class="prompt">${esc(S().clapHow)}</p>`;
    const parts = syl.split('-');
    const model = () => Voice.seq([{ t: word, rate: .7 }, 500].concat(sylSpeech(parts))); // dice la palabra y luego sílaba por sílaba
    const hear = () => { model(); }; $('#hear').onclick = hear; askOnce(opts, r, S().gClap, hear);
    const drum = $('#drum'), claps = $('#claps');
    const evaluate = () => { locked = true; Voice.stop();
      if (taps === n) { if (tries === 0) hit('clap:' + word); adapt('clap', tries === 0); correct(sh, drum, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: word, rate: .7 }, 300, { t: U().numbers[n - 1], rate: .9 }, 300]); if (tries === 0) won++; }
      else { tries++; miss('clap:' + word); if (tries === 1) adapt('clap', false); Sfx.bad(); sh.fb.textContent = u.bad;
        // Modelado: el tambor pulsa una vez por sílaba mientras la voz la dice; luego el niño vuelve a intentar.
        let i = 0; const show = () => { if (i < parts.length) { drum.classList.add('pulse'); claps.innerHTML += '👏'; Voice.seq([{ t: parts[i], rate: .55 }, 250], () => { drum.classList.remove('pulse'); i++; setTimeout(show, 150); }); } else { setTimeout(() => { taps = 0; claps.innerHTML = ''; locked = false; sh.fb.textContent = ''; if (tries >= 2) { r++; round(); } }, 900); } };
        taps = 0; claps.innerHTML = ''; Voice.seq([u.bad, 400, S().clapWatch, 300], show); } };
    drum.onpointerdown = e => { e.preventDefault(); if (locked) return; taps++; claps.innerHTML += '👏'; Sfx.tone(180, 0, .15, 'sine', .3); Sfx.tone(90, 0, .25, 'triangle', .25); drum.classList.add('bump'); setTimeout(() => drum.classList.remove('bump'), 200);
      clearTimeout(timer); timer = setTimeout(evaluate, 1500); }; }
  $('#guideText').textContent = S().gClap; round();
}
function gameOdd(focus, opts) { Diag.crumb('gameOdd'); opts = opts || {};
  const t = T(), u = U(); const all = t.wordCats.flatMap(c => c[2]); const sh = gameShell(u.games[8][0], opts, 6); let r = 0, won = 0;
  // El sonido inicial es el dígrafo completo: "chico" no empieza igual que "casa", ni "llave" como "luna".
  const onset = w => (w.match(/^(ch|ll|sh|th|qu|rr)/) || [w[0]])[0];
  const byFirst = {}; all.forEach(w => { const f = onset(w[0]); (byFirst[f] = byFirst[f] || []).push(w); }); const groups = Object.keys(byFirst).filter(f => byFirst[f].length >= 2);
  function round() { if (r === sh.n) { done(sh, won, () => gameOdd(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const f = groups[Math.floor(Math.random() * groups.length)]; const same = pick(byFirst[f], 2); const odd = pick(all.filter(w => onset(w[0]) !== f), 1)[0]; const opts3 = shuffle(same.concat([odd])); let tries = 0; firstSeen('odd:' + odd[0]);
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(S().gOdd)}</p>
      <div class="grid wide">${opts3.map(w => `<button class="tile" type="button" data-w="${esc(w[0])}"><span class="pic">${w[1]}</span><span class="lbl">${esc(caseIt(w[0]))}</span></button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq(opts3.flatMap(w => [{ t: w[0], rate: .65 }, 500]).concat([S().gOdd])); $('#hear').onclick = hear; askOnce(opts, r, S().gOddIntro, hear);
    $$('[data-w]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.w === odd[0]) { if (tries === 0) hit('odd:' + odd[0]); adapt('odd', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: odd[0], rate: .7 }, 300, fmt(S().startsDiff, { w: odd[0], L: onset(odd[0]) }), 300]); if (tries === 0) won++; } else { tries++; miss('odd:' + odd[0]); if (tries === 1) adapt('odd', false); Voice.seq([{ t: b.dataset.w, rate: .7 }, 200, { t: same.find(w => w[0] !== b.dataset.w)[0], rate: .7 }, 300, S().sameStart]); wrong(sh, b, null, tries, `[data-w="${odd[0]}"]`); } }); }
  $('#guideText').textContent = S().gOdd; round();
}

/* ---------- Juego del día: repaso espaciado (lo que falló + lo que aprendió hace días), corto, con racha ---------- */
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function reviewDoneToday() { return !!(P && P.lastReview === todayKey()); }
function reviewPlan() {
  const e = (P && P.errors) || {}, seen = (P && P.seen) || {}, now = Date.now(), old = 2 * 86400000;
  const weak = Object.keys(e).filter(k => e[k] > 0).sort((a, b) => e[b] - e[a]);
  const stale = Object.keys(seen).filter(k => now - seen[k] > old && !weak.includes(k)).sort(() => Math.random() - .5);
  const keys = weak.slice(0, 4).concat(stale.slice(0, 4));
  const map = { vowel: ['gameVowel', k => T().vowels.findIndex(v => v[0] === k)], word: ['gameWord', k => k], letter: ['gameFirst', k => k], missing: ['gameMissing', k => k], syl: ['gameSyl', k => k], build: ['gameBuild', k => k], rhyme: ['gameRhyme', k => null], clap: ['gameClap', k => null], odd: ['gameOdd', k => null], num: ['gameCount', k => k], color: ['gameColor', k => k], math: [null, k => null], emo: ['gameFeel', k => null], time: ['gameClock', k => null], sci: ['gameAnimalSound', k => null], money: ['gameMoney', k => null], write: ['gameWrite', k => null], body: ['gameBody', k => null], read: ['gameRead', k => null], mult: ['gameMult', k => null] };
  const segs = []; const used = new Set();
  keys.forEach(key => { const [kind, id] = key.split(/:(.+)/); let m = map[kind]; if (kind === 'math') m = [id.includes('+') ? 'gameAdd' : 'gameSub', () => null]; if (m && m[0] && !used.has(m[0])) { used.add(m[0]); segs.push({ fn: m[0], focus: m[1](id) }); } });
  // Rellena hasta 4 segmentos con juegos variados (siempre hay repaso, aunque no haya fallos todavía)
  ['gameVowel', 'gameFirst', 'gameSyl', 'gameRhyme', 'gameCount', 'gameWord', 'gameClap', 'gameMissing', 'gameOdd', 'gameTapNum', 'gameColor', 'gameShape', 'gameAdd', 'gameSub', 'gameFeel', 'gameClock', 'gameDay', 'gameAnimalSound', 'gameHabitat', 'gameMoney', 'gameWrite', 'gameBody', 'gameWeather', 'gameMult', 'gameFrac'].forEach(fn => { if (segs.length < 4 && !used.has(fn)) { used.add(fn); segs.push({ fn, focus: null }); } });
  return segs.slice(0, 4);
}
const GAME_FNS = {};
function reviewGame() { Diag.crumb('reviewGame'); const segs = reviewPlan(); let i = 0, total = 0; pendingStars = 0; inReview = true;
  const next = won => { total += won; i++; if (i < segs.length) run(); else {
      P.lastReview = todayKey(); P.streak = (P.streakDay && (Date.now() - P.streakDay) < 2 * 86400000) ? (P.streak || 0) + 1 : 1; P.streakDay = Date.now(); saveProfiles(); P.reviews = (P.reviews || 0) + 1; saveProfiles();
      const sh = roundShell(U().reviewT, 1); inReview = false; finish(sh, total, reviewGame); const st = $('#guideText'); if (st) st.textContent = '🔥 ' + P.streak; } };
  const run = () => { const sgm = segs[i]; GAME_FNS[sgm.fn](sgm.focus, { rounds: 2, next, part: true, quiet: i > 0 }); const p = $('#guideText'); if (p) p.textContent = (i + 1) + '/' + segs.length + ' · ' + p.textContent; };
  Voice.seq([S().reviewIntro, 400], run);
}
Object.assign(GAME_FNS, { gameVowel, gameWord, gameBuild, gameFirst, gameMissing, gameSyl, gameRhyme, gameClap, gameOdd });

/* ---------- Números: contar tocando (correspondencia uno a uno), del 1 al 20 ---------- */
function countedText(k, thing) { const s = S(); return k === 1 ? fmt(s.allCounted1, { one: thing[2] || thing[0] }) : fmt(s.allCounted, { n: U().numbers[k - 1], things: thing[0] }); }
function numbersScreen(startAt) { Diag.crumb('numbersScreen');
  const t = T(), u = U(), s = S(), L = settings.lang; const nums = u.numbers; let n = startAt || 1;
  main.innerHTML = `<section class="screen">${topbar(u.numbersT)}${guideHtml(s.numbers)}
    <div class="grid" id="numgrid">${nums.map((w, i) => `<button class="tile ${has('num:' + L + ':' + (i + 1)) ? 'done' : ''}" type="button" data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div></section>`;
  bigOpts(main, '#numgrid', 5);
  function show(k) { n = k; const thing = t.countThings[(k - 1) % t.countThings.length]; const st = $('#stage'); st.hidden = false; let counted = 0;
    st.innerHTML = `<div class="numbig" style="color:${CUBE_COLORS[(k - 1) % CUBE_COLORS.length]}">${k}</div><div class="word" style="font-size:1.6rem;letter-spacing:0">${esc(nums[k - 1])}</div>
      <div class="countrow" id="countrow">${Array.from({ length: k }, (_, i) => `<button class="cnt" type="button" data-i="${i}">${thing[1]}</button>`).join('')}</div>
      <div class="row"><button class="btn big icon" id="say" type="button">🔊</button><button class="btn icon" id="next" type="button">➡️</button></div>`;
    $$('#numgrid .tile').forEach(b => b.classList.toggle('good', +b.dataset.n === k));
    // Contar tocando: cada dibujo se cuenta una sola vez, en voz alta, y al final se dice el total.
    $$('.cnt', st).forEach(b => b.onclick = () => { if (b.classList.contains('on')) return; b.classList.add('on'); counted++; b.insertAdjacentHTML('beforeend', `<small>${counted}</small>`); Sfx.tone(440 + counted * 40, 0, .15);
      if (counted < k) Voice.seq([{ t: nums[counted - 1], rate: .9 }]);
      else { award(1, 'num:' + L + ':' + k); confetti(); Voice.seq([{ t: nums[counted - 1], rate: .9 }, 400, countedText(k, thing), 300, cheer()]); $('#next').classList.add('pulse'); } });
    $('#say').onclick = () => Voice.seq([fmt(s.numberIs, { n: nums[k - 1] }), 500, { t: String(k), rate: .8 }, 300, s.countThem]);
    $('#next').onclick = () => { Sfx.tap(); if (k < nums.length) show(k + 1); else home(); };
    $('#guideText').textContent = s.countThem; Voice.seq([fmt(s.numberIs, { n: nums[k - 1] }), 500, s.countThem]); st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  $$('#numgrid .tile').forEach(b => b.onclick = () => { Sfx.tap(); show(+b.dataset.n); });
  wire(); if (startAt) show(startAt); else guideSay(s.numbers);
}
function gameCount(focus, opts) { Diag.crumb('gameCount'); opts = opts || {};
  const t = T(), u = U(), s = S(); const nums = u.numbers; const sh = gameShell(u.games[9][0], opts, 6); let r = 0, won = 0; const L = level('count'); const max = [5, 10, 20][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameCount(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const k = (focus && r % 2 === 0) ? +focus : 1 + Math.floor(Math.random() * max); const thing = t.countThings[Math.floor(Math.random() * t.countThings.length)]; let tries = 0; firstSeen('num:' + k);
    const cands = []; for (let i = Math.max(1, k - 3); i <= Math.min(Math.max(max, k), k + 3); i++) if (i !== k) cands.push(i); const optsN = shuffle([k].concat(pick(cands, 2)));
    sh.area.innerHTML = `<div class="stage"><div class="countrow big">${Array.from({ length: k }, () => `<span>${thing[1]}</span>`).join('')}</div><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(s.howMany)}</p>
      <div class="grid">${optsN.map(v => `<button class="tile" type="button" data-n="${v}">${v}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([s.howMany]); $('#hear').onclick = hear; askOnce(opts, r, s.gCount, hear);
    $$('[data-n]', sh.area).forEach(b => b.onclick = () => { if (+b.dataset.n === k) { if (tries === 0) hit('num:' + k); adapt('count', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: nums[k - 1], rate: .85 }, 300, countedText(k, thing), 300]); if (tries === 0) won++; } else { tries++; miss('num:' + k); if (tries === 1) adapt('count', false); wrong(sh, b, hear, tries, `[data-n="${k}"]`); } }); }
  $('#guideText').textContent = s.gCount; round();
}
function gameTapNum(focus, opts) { Diag.crumb('gameTapNum'); opts = opts || {};
  const u = U(), s = S(); const nums = u.numbers; const sh = gameShell(u.games[10][0], opts, 6); let r = 0, won = 0; const L = level('tapnum'); const max = [5, 10, 20][L - 1]; const nOpts = L === 1 ? 3 : 4;
  function round() { if (r === sh.n) { done(sh, won, () => gameTapNum(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const k = (focus && r % 2 === 0) ? +focus : 1 + Math.floor(Math.random() * max); let tries = 0; firstSeen('num:' + k);
    const cands = []; for (let i = 1; i <= max; i++) if (i !== k) cands.push(i); const optsN = shuffle([k].concat(pick(cands, nOpts - 1)));
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(u.hear)}</p>
      <div class="grid">${optsN.map(v => `<button class="tile" type="button" data-n="${v}">${v}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([{ t: nums[k - 1], rate: .85 }, 600, { t: nums[k - 1], rate: .85 }]); $('#hear').onclick = hear; askOnce(opts, r, s.gTapNum, hear);
    $$('[data-n]', sh.area).forEach(b => b.onclick = () => { if (+b.dataset.n === k) { if (tries === 0) hit('num:' + k); adapt('tapnum', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: nums[k - 1], rate: .85 }, 300]); if (tries === 0) won++; } else { tries++; miss('num:' + k); if (tries === 1) adapt('tapnum', false); wrong(sh, b, hear, tries, `[data-n="${k}"]`); } }); }
  $('#guideText').textContent = s.gTapNum; round();
}
Object.assign(GAME_FNS, { gameCount, gameTapNum });

/* ---------- Colores y formas (2-4 años): ver, oír y tocar ---------- */
function shapeSvg(kind, color, size) { size = size || 120; const c = color || 'currentColor'; const m = {
  circle: `<circle cx="60" cy="60" r="50" fill="${c}"/>`, square: `<rect x="12" y="12" width="96" height="96" rx="10" fill="${c}"/>`, triangle: `<polygon points="60,10 112,108 8,108" fill="${c}"/>`,
  rect: `<rect x="6" y="30" width="108" height="60" rx="8" fill="${c}"/>`, star: `<polygon points="60,8 74,44 112,46 82,70 92,108 60,86 28,108 38,70 8,46 46,44" fill="${c}"/>`,
  heart: `<path d="M60 108 L18 64 C2 46 14 16 40 18 C50 19 57 26 60 32 C63 26 70 19 80 18 C106 16 118 46 102 64 Z" fill="${c}"/>`, oval: `<ellipse cx="60" cy="60" rx="36" ry="52" fill="${c}"/>`, diamond: `<polygon points="60,8 108,60 60,112 12,60" fill="${c}"/>` }[kind] || '';
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${m}</svg>`; }
function colorsScreen() { Diag.crumb('colorsScreen');
  const t = T(), u = U(), s = S(), L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.colorsT)}${guideHtml(s.colors)}
    <div class="grid" id="colgrid">${t.colors.map((c, i) => `<button class="tile swatch keep ${has('color:' + L + ':' + c[0]) ? 'done' : ''} ${c[0] === 'blanco' || c[0] === 'white' ? 'light' : ''}" type="button" data-c="${i}" style="--cube:${c[1]}"><span class="lbl">${esc(caseIt(c[0]))}</span></button>`).join('')}</div>
    <div class="grid" id="shapegrid">${t.shapes.map((sh, i) => `<button class="tile keep ${has('color:' + L + ':' + sh[0]) ? 'done' : ''}" type="button" data-s="${i}" style="--cube:var(--card);color:${CUBE_COLORS[i % CUBE_COLORS.length]}">${shapeSvg(sh[1], 'currentColor', 70)}<span class="lbl" style="color:var(--fg)">${esc(caseIt(sh[0]))}</span></button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div></section>`;
  bigOpts(main, '#colgrid', 2); bigOpts(main, '#shapegrid', 2);
  $$('#colgrid .tile').forEach(b => b.onclick = () => { const c = t.colors[+b.dataset.c]; Sfx.tap(); const st = $('#stage'); st.hidden = false; award(1, 'color:' + L + ':' + c[0]); b.classList.add('done');
    st.innerHTML = `<div class="swatchbig" style="background:${c[1]}"></div><div class="word">${esc(caseIt(c[0]))}</div><div class="countrow big" id="things">${c[2].map(e => `<button class="cnt" type="button">${e}</button>`).join('')}</div><button class="btn big icon" id="say" type="button">🔊</button>`;
    const parts = [fmt(s.colorIs, { c: c[0] }), 600, { t: c[0], rate: .7 }, 500, fmt(s.thingsOfColor, { c: c[0] })]; $('#guideText').textContent = fmt(s.colorIs, { c: c[0] }); Voice.seq(parts); $('#say').onclick = () => Voice.seq(parts);
    $$('#things .cnt').forEach((x, i) => x.onclick = () => { x.classList.toggle('on'); Sfx.tone(500 + i * 60, 0, .15); Voice.seq([{ t: c[0], rate: .8 }]); }); st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  $$('#shapegrid .tile').forEach(b => b.onclick = () => { const sh = t.shapes[+b.dataset.s]; Sfx.tap(); const st = $('#stage'); st.hidden = false; award(1, 'color:' + L + ':' + sh[0]); b.classList.add('done');
    st.innerHTML = `<div style="color:${CUBE_COLORS[+b.dataset.s % CUBE_COLORS.length]}">${shapeSvg(sh[1], 'currentColor', 170)}</div><div class="word">${esc(caseIt(sh[0]))}</div><div class="countrow big">${sh[2].map(e => `<span>${e}</span>`).join('')}</div><button class="btn big icon" id="say" type="button">🔊</button>`;
    const parts = [fmt(s.shapeIs, { s: sh[0] }), 600, { t: sh[0], rate: .7 }]; $('#guideText').textContent = fmt(s.shapeIs, { s: sh[0] }); Voice.seq(parts); $('#say').onclick = () => Voice.seq(parts); st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  wire(); guideSay(s.colors);
}
function gameColor(focus, opts) { Diag.crumb('gameColor'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[11][0], opts, 6); let r = 0, won = 0; const L = level('color'); const nOpts = [3, 4, 6][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameColor(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const ans = (focus && r % 2 === 0 && t.colors.find(c => c[0] === focus)) || t.colors[Math.floor(Math.random() * t.colors.length)]; const thing = ans[2][Math.floor(Math.random() * ans[2].length)]; let tries = 0; firstSeen('color:' + ans[0]);
    const optsC = shuffle([ans].concat(pick(t.colors.filter(c => c !== ans), nOpts - 1)));
    sh.area.innerHTML = `<div class="stage"><div class="pic" style="font-size:5rem">${thing}</div><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(s.whichColor)}</p>
      <div class="grid">${optsC.map(c => `<button class="tile swatch keep ${c[0] === 'blanco' || c[0] === 'white' ? 'light' : ''}" type="button" data-c="${esc(c[0])}" style="--cube:${c[1]}">${L === 3 ? '' : `<span class="lbl">${esc(caseIt(c[0]))}</span>`}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([s.whichColor]); $('#hear').onclick = hear; askOnce(opts, r, s.gColor, hear);
    $$('[data-c]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.c === ans[0]) { if (tries === 0) hit('color:' + ans[0]); adapt('color', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: ans[0], rate: .8 }, 300]); if (tries === 0) won++; } else { tries++; miss('color:' + ans[0]); if (tries === 1) adapt('color', false); Voice.seq([{ t: b.dataset.c, rate: .8 }]); wrong(sh, b, null, tries, `[data-c="${ans[0]}"]`); } }); }
  $('#guideText').textContent = s.gColor; round();
}
function gameShape(focus, opts) { Diag.crumb('gameShape'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[12][0], opts, 6); let r = 0, won = 0; const L = level('shape'); const nOpts = [3, 4, 6][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameShape(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const ans = (focus && r % 2 === 0 && t.shapes.find(x => x[0] === focus)) || t.shapes[Math.floor(Math.random() * t.shapes.length)]; let tries = 0; firstSeen('color:' + ans[0]);
    const optsS = shuffle([ans].concat(pick(t.shapes.filter(x => x !== ans), nOpts - 1)));
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(fmt(s.gShape, { s: ans[0] }))}</p>
      <div class="grid">${optsS.map((x, i) => `<button class="tile keep" type="button" data-s="${esc(x[0])}" style="--cube:var(--card);color:${CUBE_COLORS[i % CUBE_COLORS.length]}">${shapeSvg(x[1], 'currentColor', 90)}${L === 1 ? `<span class="lbl" style="color:var(--fg)">${esc(caseIt(x[0]))}</span>` : ''}</button>`).join('')}</div>`;
    bigOpts(sh.area); if (!opts.part) $('#guideText').textContent = fmt(s.gShape, { s: ans[0] }); const hear = () => Voice.seq([fmt(s.gShape, { s: ans[0] })]); $('#hear').onclick = hear; askOnce(opts, r, fmt(s.gShape, { s: ans[0] }), hear);
    $$('[data-s]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.s === ans[0]) { if (tries === 0) hit('color:' + ans[0]); adapt('shape', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [{ t: ans[0], rate: .8 }, 300]); if (tries === 0) won++; } else { tries++; miss('color:' + ans[0]); if (tries === 1) adapt('shape', false); Voice.seq([{ t: b.dataset.s, rate: .8 }]); wrong(sh, b, null, tries, `[data-s="${ans[0]}"]`); } }); }
  $('#guideText').textContent = fmt(s.gShape, { s: '…' }); round();
}
Object.assign(GAME_FNS, { gameColor, gameShape });

/* ---------- Sumas y restas con objetos (5-7 años) ---------- */
function mathScreen() { Diag.crumb('mathScreen');
  const u = U(), s = S();
  main.innerHTML = `<section class="screen">${topbar(u.mathT)}${guideHtml(s.math)}
    <div class="home"><button class="door d3" type="button" id="goAdd"><span class="big">➕</span>${esc(u.games[13][0])}<small>${esc(u.games[13][1])}</small></button>
    <button class="door d1" type="button" id="goSub"><span class="big">➖</span>${esc(u.games[14][0])}<small>${esc(u.games[14][1])}</small></button></div></section>`;
  $('#goAdd').onclick = () => { Sfx.tap(); gameAdd(); }; $('#goSub').onclick = () => { Sfx.tap(); gameSub(); }; wire(); guideSay(s.math);
}
function mathGame(kind, focus, opts) { opts = opts || {}; const t = T(), u = U(), s = S(); const nums = u.numbers; const add = kind === 'add';
  const sh = gameShell(u.games[add ? 13 : 14][0], opts, 6); let r = 0, won = 0; const L = level(kind); const max = [5, 10, 20][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => mathGame(kind, focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; let a, b, c;
    if (add) { c = 2 + Math.floor(Math.random() * (max - 1)); a = 1 + Math.floor(Math.random() * (c - 1)); b = c - a; } else { a = 2 + Math.floor(Math.random() * (max - 1)); b = 1 + Math.floor(Math.random() * (a - 1)); c = a - b; }
    const thing = t.countThings[Math.floor(Math.random() * t.countThings.length)]; let tries = 0; const key = 'math:' + (add ? a + '+' + b : a + '-' + b); firstSeen(key);
    const cands = []; for (let i = Math.max(add ? 1 : 0, c - 3); i <= Math.min(max, c + 3); i++) if (i !== c) cands.push(i); const optsN = shuffle([c].concat(pick(cands, 2)));
    const pics = add ? `<div class="countrow big">${Array.from({ length: a }, () => `<span>${thing[1]}</span>`).join('')}<span class="op">+</span>${Array.from({ length: b }, () => `<span>${thing[1]}</span>`).join('')}</div>`
      : `<div class="countrow big">${Array.from({ length: a }, (_, i) => `<span class="${i >= a - b ? 'gone' : ''}">${thing[1]}</span>`).join('')}</div>`;
    sh.area.innerHTML = `<div class="stage">${pics}<div class="word" style="font-size:2.4rem;letter-spacing:4px">${a} ${add ? '+' : '−'} ${b} = <span style="color:var(--a)">?</span></div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsN.map(v => `<button class="tile" type="button" data-n="${v}">${v}</button>`).join('')}</div>`;
    bigOpts(sh.area); const q = fmt(add ? s.addQ : s.subQ, { a: nums[a - 1], b: nums[b - 1] });
    const hear = () => Voice.seq([q]); $('#hear').onclick = hear; askOnce(opts, r, add ? s.gAdd : s.gSub, hear);
    $$('[data-n]', sh.area).forEach(btn => btn.onclick = () => { if (+btn.dataset.n === c) { if (tries === 0) hit(key); adapt(kind, tries === 0); correct(sh, btn, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(add ? s.addAns : s.subAns, { a: nums[a - 1], b: nums[b - 1], c: c === 0 ? '0' : nums[c - 1] }), 300]); if (tries === 0) won++; } else { tries++; miss(key); if (tries === 1) adapt(kind, false); wrong(sh, btn, hear, tries, `[data-n="${c}"]`); } }); }
  $('#guideText').textContent = add ? s.gAdd : s.gSub; round();
}
function gameAdd(focus, opts) { Diag.crumb('gameAdd'); mathGame('add', focus, opts); }
function gameSub(focus, opts) { Diag.crumb('gameSub'); mathGame('sub', focus, opts); }
Object.assign(GAME_FNS, { gameAdd, gameSub });

/* ---------- Emociones: reconocerlas, nombrarlas y un respiro para calmarse ---------- */
function emotionsScreen() { Diag.crumb('emotionsScreen');
  const t = T(), u = U(), s = S(), L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.emoT)}${guideHtml(s.emotions)}
    <div class="grid" id="emogrid">${t.emotions.map((e, i) => `<button class="tile keep ${has('emo:' + L + ':' + e[0]) ? 'done' : ''}" type="button" data-e="${i}" style="--cube:var(--card)"><span class="pic" style="font-size:3.4rem">${e[1]}</span><span class="lbl" style="color:var(--fg)">${esc(caseIt(e[0]))}</span></button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div></section>`;
  bigOpts(main, '#emogrid', 2);
  $$('#emogrid .tile').forEach(b => b.onclick = () => { const e = t.emotions[+b.dataset.e]; Sfx.tap(); const st = $('#stage'); st.hidden = false; award(1, 'emo:' + L + ':' + e[0]); b.classList.add('done');
    st.innerHTML = `<div class="pic" style="font-size:6rem">${e[1]}</div><div class="word">${esc(caseIt(e[0]))}</div><div class="sub" style="font-size:1.1rem">${esc(e[2])}</div>
      <div class="row"><button class="btn big icon" id="say" type="button">🔊</button>${e[0] === t.emotions[6][0] ? `<button class="btn alt icon" id="breathe" type="button" aria-label="${esc(s.breathe)}">🫧</button>` : ''}</div>`;
    const parts = [fmt(s.emoIs, { e: e[0] }), 500, e[2], 700, fmt(s.emoAsk, { e: e[0] })]; $('#guideText').textContent = fmt(s.emoAsk, { e: e[0] }); Voice.seq(parts); $('#say').onclick = () => Voice.seq(parts);
    const br = $('#breathe'); if (br) br.onclick = () => { const pic = st.querySelector('.pic'); pic.style.transition = 'transform 3s ease-in-out'; Voice.seq([s.breathe]); pic.style.transform = 'scale(1.5)'; setTimeout(() => pic.style.transform = 'scale(1)', 3200); };
    st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  wire(); guideSay(s.emotions);
}
function gameFeel(focus, opts) { Diag.crumb('gameFeel'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[15][0], opts, 6); let r = 0, won = 0; const L = level('feel'); const nOpts = [3, 4, 6][L - 1]; const items = pick(t.feelings, 6);
  function round() { if (r === sh.n) { done(sh, won, () => gameFeel(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const [text, pic, ans] = items[r]; const ansE = t.emotions.find(e => e[0] === ans); let tries = 0; firstSeen('emo:' + ans);
    const optsE = shuffle([ansE].concat(pick(t.emotions.filter(e => e !== ansE), nOpts - 1)));
    sh.area.innerHTML = `<div class="stage"><div class="pic" style="font-size:4rem">${pic.slice(0, pic.length - 2)}</div><div class="word" style="font-size:1.5rem;letter-spacing:0">${esc(text)}</div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsE.map(e => `<button class="tile keep" type="button" data-e="${esc(e[0])}" style="--cube:var(--card)"><span class="pic">${e[1]}</span>${L < 3 ? `<span class="lbl" style="color:var(--fg)">${esc(caseIt(e[0]))}</span>` : ''}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([text, 600, s.gFeel.split('.').slice(1).join('.')]); $('#hear').onclick = hear; askOnce(opts, r, s.gFeel, hear);
    $$('[data-e]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.e === ans) { if (tries === 0) hit('emo:' + ans); adapt('feel', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.feelIs, { e: ans }), 300]); if (tries === 0) won++; } else { tries++; miss('emo:' + ans); if (tries === 1) adapt('feel', false); wrong(sh, b, hear, tries, `[data-e="${ans}"]`); } }); }
  $('#guideText').textContent = s.gFeel; round();
}
Object.assign(GAME_FNS, { gameFeel });

/* ---------- Hora y calendario ---------- */
function clockSvg(h, m, size) { size = size || 220; const ha = ((h % 12) + m / 60) * 30, ma = m * 6;
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" aria-hidden="true"><circle cx="100" cy="100" r="92" fill="var(--card)" stroke="var(--o)" stroke-width="8"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = (i + 1) * 30 * Math.PI / 180; return `<text x="${100 + 72 * Math.sin(a)}" y="${100 - 72 * Math.cos(a) + 7}" text-anchor="middle" font-family="Fredoka,Nunito,sans-serif" font-weight="700" font-size="20" fill="var(--fg)">${i + 1}</text>`; }).join('')}
    <line x1="100" y1="100" x2="${100 + 58 * Math.sin(ma * Math.PI / 180)}" y2="${100 - 58 * Math.cos(ma * Math.PI / 180)}" stroke="var(--i)" stroke-width="7" stroke-linecap="round"/>
    <line x1="100" y1="100" x2="${100 + 40 * Math.sin(ha * Math.PI / 180)}" y2="${100 - 40 * Math.cos(ha * Math.PI / 180)}" stroke="var(--a)" stroke-width="10" stroke-linecap="round"/><circle cx="100" cy="100" r="7" fill="var(--fg)"/></svg>`; }
function timeText(h, m) { const s = S(), n = U().numbers; if (h === 1) return m === 0 ? s.oneOclock : s.oneHalf; return fmt(m === 0 ? s.oclock : s.half, { h: n[h - 1] }); }
function timeScreen() { Diag.crumb('timeScreen');
  const t = T(), u = U(), s = S(), L = settings.lang; const todayIdx = (new Date().getDay() + 6) % 7;
  main.innerHTML = `<section class="screen">${topbar(u.timeT)}${guideHtml(s.time)}
    <p class="prompt">🕒 ${esc(u.clockT)}</p><div class="stage" id="clock">${clockSvg(3, 0)}<div class="word" id="ctext" style="font-size:1.6rem;letter-spacing:0">${esc(timeText(3, 0))}</div></div>
    <div class="row" style="margin:6px 0"><button class="chip on" id="chipO" type="button">${esc(u.onTheHour)}</button><button class="chip" id="chipH" type="button">${esc(u.halfPast)}</button></div>
    <div class="grid" id="hours">${Array.from({ length: 12 }, (_, i) => `<button class="tile" type="button" data-h="${i + 1}">${i + 1}</button>`).join('')}</div>
    <p class="prompt">📅 ${esc(u.daysT)}</p><div class="grid" id="days">${t.days.map((d, i) => `<button class="tile ${has('time:' + L + ':' + d) ? 'done' : ''}" type="button" data-d="${i}"><span class="pic" style="font-size:1.3rem;opacity:.85">${i + 1}${i === todayIdx ? ' ⭐ ' + esc(u.today) : ''}</span><span class="lbl">${esc(caseIt(d))}</span></button>`).join('')}</div>
    <p class="prompt">🗓️ ${esc(u.monthsT)}</p><div class="grid" id="months">${t.months.map((m, i) => `<button class="tile keep" type="button" data-m="${i}" style="--cube:var(--card)"><span class="pic">${m[1]}</span><span class="lbl" style="color:var(--fg)">${esc(caseIt(m[0]))}</span></button>`).join('')}</div></section>`;
  bigOpts(main, '#hours', 4); bigOpts(main, '#days', 2); bigOpts(main, '#months', 3); $('#hours').style.setProperty('--h', '84px'); $('#days').style.setProperty('--h', '84px'); $('#months').style.setProperty('--h', '104px');
  let half = false, curH = 3;
  const showClock = () => { const m = half ? 30 : 0; $('#clock').innerHTML = clockSvg(curH, m) + `<div class="word" id="ctext" style="font-size:1.6rem;letter-spacing:0">${esc(timeText(curH, m))}</div>`; $('#guideText').textContent = timeText(curH, m); Voice.seq([timeText(curH, m)]); };
  const setHalf = v => { half = v; $('#chipO').classList.toggle('on', !v); $('#chipH').classList.toggle('on', v); Sfx.tap(); showClock(); };
  $('#chipO').onclick = () => setHalf(false); $('#chipH').onclick = () => setHalf(true);
  $$('#hours .tile').forEach(b => b.onclick = () => { curH = +b.dataset.h; Sfx.tap(); $$('#hours .tile').forEach(x => x.classList.toggle('good', x === b)); award(1, 'time:' + L + ':h' + curH); showClock(); $('#clock').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  // Los días se tocan en orden (lunes → domingo); si se salta uno, la pista dice qué día viene después. Siempre se oye el día tocado.
  let nextDay = 0;
  $$('#days .tile').forEach(b => b.onclick = () => { const i = +b.dataset.d, d = t.days[i]; Sfx.tap(); b.classList.add('done'); b.classList.remove('pulse'); award(1, 'time:' + L + ':' + d); $('#guideText').textContent = d;
    if (i === nextDay) { b.classList.add('good'); nextDay++; const parts = [{ t: d, rate: .8 }].concat(i === todayIdx ? [500, fmt(s.dayIs, { d })] : []); if (nextDay === 7) { confetti(); parts.push(600, cheer()); nextDay = 0; setTimeout(() => $$('#days .tile').forEach(x => x.classList.remove('good')), 3000); } Voice.seq(parts); }
    else { b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 400); $$('#days .tile')[nextDay].classList.add('pulse'); Voice.seq([{ t: d, rate: .8 }, 400, nextDay ? fmt(s.afterIs, { a: t.days[nextDay - 1], b: t.days[nextDay] }) : s.daysHow]); } });
  $$('#months .tile').forEach(b => b.onclick = () => { const m = t.months[+b.dataset.m]; Sfx.tap(); award(1, 'time:' + L + ':' + m[0]); $('#guideText').textContent = m[0]; Voice.seq([{ t: m[0], rate: .8 }]); });
  wire(); guideSay(s.time + ' ' + s.clockHow);
}
function gameClock(focus, opts) { Diag.crumb('gameClock'); opts = opts || {};
  const u = U(), s = S(); const sh = gameShell(u.games[16][0], opts, 6); let r = 0, won = 0; const L = level('clock');
  function round() { if (r === sh.n) { done(sh, won, () => gameClock(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const h = 1 + Math.floor(Math.random() * 12), m = L >= 2 && Math.random() < .5 ? 30 : 0; let tries = 0; firstSeen('time:h' + h);
    const others = []; while (others.length < 2) { const oh = 1 + Math.floor(Math.random() * 12), om = L >= 2 && Math.random() < .5 ? 30 : 0; if ((oh !== h || om !== m) && !others.some(o => o[0] === oh && o[1] === om)) others.push([oh, om]); }
    const optsT = shuffle([[h, m]].concat(others));
    sh.area.innerHTML = `<div class="stage">${clockSvg(h, m, 200)}<button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsT.map(o => `<button class="tile" type="button" data-t="${o[0]}:${o[1]}" style="font-size:2.4rem">${o[0]}:${o[1] === 0 ? '00' : '30'}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([s.gClock]); $('#hear').onclick = hear; askOnce(opts, r, s.gClock, hear);
    $$('[data-t]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.t === h + ':' + m) { if (tries === 0) hit('time:h' + h); adapt('clock', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [timeText(h, m), 300]); if (tries === 0) won++; } else { tries++; miss('time:h' + h); if (tries === 1) adapt('clock', false); const [oh, om] = b.dataset.t.split(':').map(Number); Voice.seq([timeText(oh, om)]); wrong(sh, b, null, tries, `[data-t="${h}:${m}"]`); } }); }
  $('#guideText').textContent = s.gClock; round();
}
function gameDay(focus, opts) { Diag.crumb('gameDay'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[17][0], opts, 6); let r = 0, won = 0; const L = level('day'); const nOpts = [2, 3, 4][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameDay(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const i = Math.floor(Math.random() * 7), a = t.days[i], b = t.days[(i + 1) % 7]; let tries = 0; firstSeen('time:' + a);
    const optsD = shuffle([b].concat(pick(t.days.filter(d => d !== b && d !== a), nOpts - 1)));
    sh.area.innerHTML = `<div class="stage"><div class="word" style="font-size:2rem;letter-spacing:0">${esc(caseIt(a))} → <span style="color:var(--a)">?</span></div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsD.map(d => `<button class="tile" type="button" data-d="${esc(d)}" style="font-size:1.6rem">${esc(caseIt(d))}</button>`).join('')}</div>`;
    bigOpts(sh.area); if (!opts.part) $('#guideText').textContent = fmt(s.gDay, { d: a }); const hear = () => Voice.seq([fmt(s.gDay, { d: a })]); $('#hear').onclick = hear; askOnce(opts, r, fmt(s.gDay, { d: a }), hear);
    $$('[data-d]', sh.area).forEach(btn => btn.onclick = () => { if (btn.dataset.d === b) { if (tries === 0) hit('time:' + a); adapt('day', tries === 0); correct(sh, btn, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.afterIs, { a, b }), 300]); if (tries === 0) won++; } else { tries++; miss('time:' + a); if (tries === 1) adapt('day', false); Voice.seq([{ t: t.days.join(', '), rate: .85 }]); wrong(sh, btn, null, tries, `[data-d="${b}"]`); } }); }
  $('#guideText').textContent = fmt(s.gDay, { d: '…' }); round();
}
Object.assign(GAME_FNS, { gameClock, gameDay });

/* ---------- Ciencia: animales (sonido real si existe el archivo), planta, planetas ---------- */
const Sfxfile = { index: null, load() { fetch('sonidos/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { this.index = new Set(j || []); }).catch(() => {}); },
  has(key) { return !!(this.index && this.index.has(key)); }, play(key, onend) { if (!this.has(key)) { if (onend) onend(); return false; } Clips.play('sonidos/' + key + '.mp3', { onend }); return true; } };
const cap = str => str.charAt(0).toUpperCase() + str.slice(1);
function withArt(name) { if (settings.lang === 'en') return 'the ' + name; const fem = ['vaca', 'gallina', 'oveja', 'rana', 'abeja', 'ballena', 'tortuga', 'mariposa']; return (fem.includes(name) ? 'la ' : 'el ') + name; }
function animalKey(a) { return a[6].replace(/\s+/g, '_'); }
/* Planetas con tamaño relativo (Júpiter el más grande, Mercurio el más pequeño) y color parecido al real; la Tierra con continentes, Júpiter con bandas, Saturno con anillo. */
function planetSvg(i, size) { size = size || 90; const [c, r] = [['#b5a28c', 13], ['#e8c37a', 20], ['#3d7bff', 21], ['#d9532b', 16], ['#e0a35a', 46], ['#e9d29a', 38], ['#8fd8e8', 30], ['#3f5fd6', 29]][i];
  const extra = i === 2 ? `<path d="M38 42c6-8 16-8 22-2-4 6-14 8-22 2z M52 58c6-2 12 0 14 6-6 2-12 0-14-6z" fill="#3cb371"/>` : i === 4 ? `<path d="M${50 - r + 3} 42h${2 * r - 6}M${50 - r + 6} 58h${2 * r - 12}" stroke="#b9743a" stroke-width="4" opacity=".7"/>` : i === 5 ? `<ellipse cx="50" cy="52" rx="${r + 10}" ry="7" fill="none" stroke="#c9b27a" stroke-width="5" transform="rotate(-15 50 52)"/>` : '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="${c}"/>${extra}</svg>`; }
/* Dibujo de la planta con sus cuatro partes (raíz, tallo, hojas, flor); cada parte se ilumina al tocarla. */
function plantSvg(size) { size = size || 140; return `<svg viewBox="0 0 120 160" width="${size}" height="${size * 4 / 3}" aria-hidden="true" class="plant">
  <rect x="0" y="118" width="120" height="42" rx="6" fill="#7a5230" opacity=".35"/>
  <g class="pp" data-p="0" stroke="#c9975f" stroke-width="4" fill="none" stroke-linecap="round"><path d="M60 120v24M60 128l-18 14M60 128l18 14M60 138l-9 14M60 138l9 14"/></g>
  <g class="pp" data-p="1"><path d="M60 120V46" stroke="#3fa34d" stroke-width="8" stroke-linecap="round"/></g>
  <g class="pp" data-p="2" fill="#4cc25c"><path d="M60 98c-24 2-36-10-38-26 18-2 32 8 38 26z"/><path d="M60 78c24 2 36-10 38-26-18-2-32 8-38 26z"/></g>
  <g class="pp" data-p="3"><circle cx="60" cy="42" r="23" fill="#ff7ac8"/><circle cx="60" cy="42" r="9" fill="#ffd000"/></g></svg>`; }
function animalSound(a, then) { // sonido real si está; si no, la voz hace la onomatopeya
  if (Sfxfile.has(animalKey(a))) { Voice.stop(); Sfxfile.play(animalKey(a), then); } else Voice.seq([{ t: a[2], rate: .8 }], then); }
function scienceScreen() { Diag.crumb('scienceScreen');
  const t = T(), u = U(), s = S(), L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.sciT)}${guideHtml(s.science)}
    <p class="prompt">🐾 ${esc(u.animalsT)}</p><div class="grid" id="animals">${t.animals.map((a, i) => `<button class="tile keep ${has('sci:' + L + ':' + a[0]) ? 'done' : ''}" type="button" data-a="${i}" style="--cube:var(--card)"><span class="pic">${a[1]}</span><span class="lbl" style="color:var(--fg)">${esc(caseIt(a[0]))}</span></button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div>
    <p class="prompt">🌱 ${esc(u.plantT)}</p><div id="plantpic" style="text-align:center">${plantSvg(150)}</div><div class="grid" id="plant">${t.plant.map((pp, i) => `<button class="tile keep" type="button" data-p="${i}" style="--cube:var(--card)"><span class="pic">${pp[1]}</span><span class="lbl" style="color:var(--fg)">${esc(pp[0])}</span></button>`).join('')}</div>
    <div class="row"><button class="btn" id="grow" type="button">🌱→🌸 ${esc(s.plantGrow.split('.')[0])}</button></div>
    <p class="prompt">🪐 ${esc(u.spaceT)}</p><div class="grid" id="planets">${t.planets.map((pl, i) => `<button class="tile keep" type="button" data-pl="${i}" style="--cube:var(--card)">${planetSvg(i, 64)}<span class="lbl" style="color:var(--fg)">${esc(pl[0])}</span></button>`).join('')}</div>
    <div class="stage" id="plstage" hidden></div></section>`;
  bigOpts(main, '#animals', 3); bigOpts(main, '#plant', 2); bigOpts(main, '#planets', 2); $('#animals').style.setProperty('--h', '104px'); $('#plant').style.setProperty('--h', '100px'); $('#planets').style.setProperty('--h', '104px');
  $$('#animals .tile').forEach(b => b.onclick = () => { const a = t.animals[+b.dataset.a]; Sfx.tap(); const st = $('#stage'); st.hidden = false; award(1, 'sci:' + L + ':' + a[0]); b.classList.add('done'); const hab = t.habitats.find(h => h[0] === a[5]);
    st.innerHTML = `<div class="pic" style="font-size:6rem">${a[1]}</div><div class="word">${esc(caseIt(a[0]))}</div><div class="countrow big"><span>${hab ? hab[1] : ''}</span><span>🍽️</span></div>
      <div class="row"><button class="btn big icon" id="snd" type="button" aria-label="${esc(a[2])}">🔊</button><button class="btn alt icon" id="info" type="button">ℹ️</button></div>`;
    const info = () => Voice.seq([fmt(s.livesIn, { a: cap(withArt(a[0])), h: a[3] }), 500, fmt(s.eats, { a: cap(withArt(a[0])), f: a[4] })]);
    $('#guideText').textContent = fmt(s.animalSays, { a: cap(withArt(a[0])), s: a[2] });
    Voice.seq([{ t: a[0], rate: .8 }, 300], () => animalSound(a, () => Voice.seq([400, fmt(s.animalSays, { a: cap(withArt(a[0])), s: a[2] }), 600], info)));
    $('#snd').onclick = () => animalSound(a); $('#info').onclick = info; st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  const showPart = i => { const pp = t.plant[i]; Sfx.tap(); award(1, 'sci:' + L + ':' + pp[0]); const svg = $('#plantpic svg'); svg.classList.add('sel'); $$('.pp', svg).forEach(g => g.classList.toggle('on', +g.dataset.p === i)); $$('#plant .tile').forEach((x, k) => x.classList.toggle('good', k === i));
    $('#guideText').textContent = fmt(s.partIs, { p: pp[0], d: pp[2] }); Voice.seq([fmt(s.partIs, { p: pp[0], d: pp[2] })]); };
  $$('#plant .tile').forEach(b => b.onclick = () => showPart(+b.dataset.p)); $$('#plantpic .pp').forEach(g => g.onclick = () => showPart(+g.dataset.p));
  $('#grow').onclick = () => { Sfx.tap(); const stages = ['🌰', '🌱', '🌿', '🌸']; const st = $('#stage'); st.hidden = false; st.innerHTML = `<div class="pic" id="gpic" style="font-size:6rem">🌰</div>`; let i = 0; const step = () => { if (!$('#gpic')) return; if (i < stages.length) { $('#gpic').textContent = stages[i]; $('#gpic').classList.add('pulse'); setTimeout(() => { const g = $('#gpic'); if (g) g.classList.remove('pulse'); }, 600); i++; setTimeout(step, 1100); } }; step(); Voice.seq([s.plantGrow]); award(1, 'sci:' + L + ':grow'); st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  $$('#planets .tile').forEach(b => b.onclick = () => { const i = +b.dataset.pl, pl = t.planets[i]; Sfx.tap(); award(1, 'sci:' + L + ':' + pl[0]); $$('#planets .tile').forEach((x, k) => x.classList.toggle('good', k === i));
    const ps = $('#plstage'); ps.hidden = false; ps.innerHTML = `${planetSvg(i, 170)}<div class="word">${esc(pl[0])}</div><div class="sub" style="font-size:1.1rem">${esc(pl[2])}</div><div class="sub">☀️ ${t.planets.map((q, k) => k === i ? '<b>' + (k + 1) + '</b>' : (k + 1)).join(' · ')}</div>`;
    $('#guideText').textContent = fmt(s.planetIs, { p: pl[0], d: pl[2] }); Voice.seq([fmt(s.planetIs, { p: pl[0], d: pl[2] })]); ps.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  wire(); guideSay(s.science);
}
function gameAnimalSound(focus, opts) { Diag.crumb('gameAnimalSound'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[18][0], opts, 6); let r = 0, won = 0; const L = level('animal'); const nOpts = [3, 4, 6][L - 1];
  // Los animales callados (tortuga, mariposa) pueden ser opción, pero nunca la respuesta: no hay sonido que adivinar.
  const quiet = ['tortuga', 'mariposa', 'turtle', 'butterfly']; const pool = t.animals.filter(a => !quiet.includes(a[0]));
  function round() { if (r === sh.n) { done(sh, won, () => gameAnimalSound(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const ans = pool[Math.floor(Math.random() * pool.length)]; let tries = 0; firstSeen('sci:' + ans[0]);
    const optsA = shuffle([ans].concat(pick(t.animals.filter(a => a !== ans), nOpts - 1)));
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(u.hear)}</p>
      <div class="grid">${optsA.map(a => `<button class="tile keep" type="button" data-a="${esc(a[0])}" style="--cube:var(--card)"><span class="pic">${a[1]}</span>${L < 3 ? `<span class="lbl" style="color:var(--fg)">${esc(caseIt(a[0]))}</span>` : ''}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => animalSound(ans); $('#hear').onclick = hear; askOnce(opts, r, s.gAnimalSound, hear);
    $$('[data-a]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.a === ans[0]) { if (tries === 0) hit('sci:' + ans[0]); adapt('animal', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.animalSays, { a: cap(withArt(ans[0])), s: ans[2] }), 300]); if (tries === 0) won++; } else { tries++; miss('sci:' + ans[0]); if (tries === 1) adapt('animal', false); wrong(sh, b, hear, tries, `[data-a="${ans[0]}"]`); } }); }
  $('#guideText').textContent = s.gAnimalSound; round();
}
function gameHabitat(focus, opts) { Diag.crumb('gameHabitat'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[19][0], opts, 6); let r = 0, won = 0; const L = level('habitat'); const nOpts = [3, 4, 6][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameHabitat(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const ans = t.animals[Math.floor(Math.random() * t.animals.length)]; const hab = t.habitats.find(h => h[0] === ans[5]); let tries = 0; firstSeen('sci:' + ans[0]);
    const optsH = shuffle([hab].concat(pick(t.habitats.filter(h => h !== hab), nOpts - 1)));
    sh.area.innerHTML = `<div class="stage"><div class="pic" style="font-size:5rem">${ans[1]}</div><div class="word">${esc(caseIt(ans[0]))}</div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsH.map(h => `<button class="tile keep" type="button" data-h="${esc(h[0])}" style="--cube:var(--card)"><span class="pic">${h[1]}</span>${L < 3 ? `<span class="lbl" style="color:var(--fg)">${esc(caseIt(h[2] || h[0]))}</span>` : ''}</button>`).join('')}</div>`;
    bigOpts(sh.area); if (!opts.part) $('#guideText').textContent = fmt(s.gHabitat, { a: withArt(ans[0]) }); const hear = () => Voice.seq([fmt(s.gHabitat, { a: withArt(ans[0]) })]); $('#hear').onclick = hear; askOnce(opts, r, fmt(s.gHabitat, { a: withArt(ans[0]) }), hear);
    $$('[data-h]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.h === hab[0]) { if (tries === 0) hit('sci:' + ans[0]); adapt('habitat', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.livesIn, { a: cap(withArt(ans[0])), h: ans[3] }), 300]); if (tries === 0) won++; } else { tries++; miss('sci:' + ans[0]); if (tries === 1) adapt('habitat', false); wrong(sh, b, hear, tries, `[data-h="${hab[0]}"]`); } }); }
  $('#guideText').textContent = fmt(s.gHabitat, { a: '…' }); round();
}
/* ---------- Canciones: reproduce canciones/<id>.mp3 con la letra (canciones/<id>.<lang>.json) ---------- */
function songsScreen() { Diag.crumb('songsScreen');
  const t = T(), u = U(), s = S(), L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.songsT)}${guideHtml(s.songs)}
    <div class="grid" id="songs">${t.songs.map((sg, i) => `<button class="tile keep ${has('song:' + L + ':' + sg[2]) ? 'done' : ''}" type="button" data-s="${i}" style="--cube:var(--card)"><span class="pic">${sg[1]}</span><span class="lbl" style="color:var(--fg)">${esc(sg[0])}</span></button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div></section>`;
  bigOpts(main, '#songs', 2);
  $$('#songs .tile').forEach(b => b.onclick = () => { const sg = t.songs[+b.dataset.s]; Sfx.tap(); const st = $('#stage'); st.hidden = false; st.innerHTML = `<div class="pic" style="font-size:4rem">${sg[1]}</div><div class="word" style="font-size:1.6rem;letter-spacing:0">${esc(sg[0])}</div><div class="lyrics" id="lyrics"></div><div class="row"><button class="btn big icon" id="play" type="button">▶️</button><button class="btn alt icon" id="stop" type="button">⏹️</button></div>`;
    fetch(`canciones/${sg[2]}.${L}.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => {
      if (!j) { $('#lyrics').innerHTML = `<p class="prompt">${esc(u.noSongs)}</p>`; Voice.seq([u.noSongs]); return; }
      $('#lyrics').innerHTML = j.lines.map((ln, i) => `<p class="line" data-i="${i}">${esc(ln.text)}</p>`).join('');
      const audio = new Audio(`canciones/${sg[2]}.${L}.mp3`); let timer = null; const lines = $$('.line', st); const hl = cur => lines.forEach((el, i) => el.classList.toggle('hl', i === cur));
      const sync = () => { const ct = audio.currentTime; let cur = -1; j.lines.forEach((ln, i) => { if (ct >= ln.t) cur = i; }); hl(cur); if (cur >= 0) lines[cur].scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      // Mientras no exista el mp3 (o la letra no tenga tiempos), la voz "canta" la letra línea a línea con resaltado.
      const sing = () => { let i = 0; const step = () => { if (!document.contains(st)) return; if (i >= j.lines.length) { hl(-1); confetti(); Voice.seq([cheer()]); return; } hl(i); lines[i].scrollIntoView({ block: 'center', behavior: 'smooth' }); const k = i++; Voice.seq([{ t: j.lines[k].text, rate: .85 }, 250], step); }; step(); };
      const stop = () => { audio.pause(); audio.currentTime = 0; clearInterval(timer); Voice.stop(); hl(-1); };
      $('#play').onclick = () => { stop(); award(1, 'song:' + L + ':' + sg[2]); if (j.lines.some(ln => ln.t == null)) { sing(); return; } audio.play().then(() => { timer = setInterval(sync, 250); }).catch(sing); };
      $('#stop').onclick = stop; $$('.line', st).forEach((el, i) => el.onclick = () => { Voice.stop(); hl(i); Voice.seq([{ t: j.lines[i].text, rate: .85 }], () => hl(-1)); });
      audio.onended = () => { clearInterval(timer); hl(-1); confetti(); Voice.seq([cheer()]); };
    }).catch(() => { $('#lyrics').innerHTML = `<p class="prompt">${esc(u.noSongs)}</p>`; });
    st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  wire(); guideSay(s.songs);
}
Object.assign(GAME_FNS, { gameAnimalSound, gameHabitat });

/* ---------- Dinero (USD) ---------- */
function centsText(n) { const s = S(); return n === 1 ? s.cent1 : fmt(s.cents, { n: U().numWord(n) }); }
function moneyText(cents) { const s = S(); if (cents < 100) return centsText(cents); const d = Math.floor(cents / 100), c = cents % 100; const dt = d === 1 ? s.dollar1 : fmt(s.dollars, { n: U().numWord(d) }); return c ? dt + (settings.lang === 'es' ? ' con ' : ' and ') + centsText(c) : dt; }
/* Monedas y billetes dibujados como los de verdad: el centavo cobrizo, las demás plateadas; tamaños reales (la de 10 es la más pequeña, la de 25 la más grande). */
function coinSvg(v, size) { size = size || 96;
  if (v >= 100) { const n = v / 100; return `<svg viewBox="0 0 160 76" width="${size * 1.45}" height="${size * .7}" aria-hidden="true"><rect x="3" y="3" width="154" height="70" rx="8" fill="#5fae72" stroke="#2f6b3f" stroke-width="4"/><rect x="14" y="14" width="132" height="48" rx="4" fill="none" stroke="#2f6b3f" stroke-width="2"/><circle cx="80" cy="38" r="20" fill="#cfe8d4"/><text x="80" y="47" text-anchor="middle" font-family="Fredoka,Nunito,sans-serif" font-weight="700" font-size="26" fill="#2f6b3f">${n}</text><text x="22" y="32" font-family="Fredoka,Nunito,sans-serif" font-size="15" font-weight="700" fill="#2f6b3f">$${n}</text><text x="138" y="60" text-anchor="end" font-family="Fredoka,Nunito,sans-serif" font-size="15" font-weight="700" fill="#2f6b3f">$${n}</text></svg>`; }
  const [fill, edge, d] = { 1: ['#d08a4a', '#7d3f14', 76], 5: ['#dfe3e8', '#6f7680', 84], 10: ['#dfe3e8', '#6f7680', 70], 25: ['#dfe3e8', '#6f7680', 96] }[v]; const s = size * d / 96;
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-hidden="true"><circle cx="50" cy="50" r="47" fill="${fill}" stroke="${edge}" stroke-width="5"/><circle cx="50" cy="50" r="38" fill="none" stroke="${edge}" stroke-width="2" ${v === 1 ? '' : 'stroke-dasharray="3 3"'}/><text x="50" y="61" text-anchor="middle" font-family="Fredoka,Nunito,sans-serif" font-weight="700" font-size="${v >= 10 ? 28 : 34}" fill="${edge}">${v}¢</text></svg>`; }
function coinHtml(c, big) { return `<span class="coin">${coinSvg(c[1], big ? 96 : 56)}</span>`; }
/* Cada moneda se "cuenta" con monedas más pequeñas: [moneda que se usa, cuántas]. Así el valor se aprende contando (de 5 en 5, de 25 en 25). */
const COIN_EQUIV = { 1: [1, 1], 5: [1, 5], 10: [5, 2], 25: [5, 5], 100: [25, 4], 500: [100, 5] };
function moneyScreen() { Diag.crumb('moneyScreen');
  const t = T(), u = U(), s = S(), L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.moneyT)}${guideHtml(s.money)}
    <div class="grid" id="coins">${t.coins.map((c, i) => `<button class="tile keep ${has('money:' + L + ':' + c[1]) ? 'done' : ''}" type="button" data-c="${i}" style="--cube:var(--card)">${coinHtml(c, true)}<span class="lbl" style="color:var(--fg)">${esc(c[0])}</span></button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div></section>`;
  bigOpts(main, '#coins', 2);
  $$('#coins .tile').forEach(b => b.onclick = () => { const c = t.coins[+b.dataset.c]; Sfx.tap(); award(1, 'money:' + L + ':' + c[1]); b.classList.add('done'); const st = $('#stage'); st.hidden = false;
    const [unit, n] = COIN_EQUIV[c[1]]; let counted = 0;
    st.innerHTML = `<div class="countrow big">${coinHtml(c, true)}</div><div class="word" style="font-size:1.6rem;letter-spacing:0">${esc(c[0])} = ${c[3]}</div>
      <p class="prompt">${esc(s.countCoins)}</p><div class="countrow" id="coinrow">${Array.from({ length: n }, (_, i) => `<button class="cnt coin" type="button" data-i="${i}" aria-label="${esc(moneyText(unit))}">${coinSvg(unit, unit >= 100 ? 40 : 50)}</button>`).join('')}</div><button class="btn big icon" id="say" type="button">🔊</button>`;
    const parts = [fmt(s.coinIs, { c: c[0], v: moneyText(c[1]) }), 500, s.countCoins]; $('#guideText').textContent = parts[0]; Voice.seq(parts); $('#say').onclick = () => Voice.seq(parts);
    // Contar tocando: cada moneda suma su valor en voz alta (uno, dos… / cinco, diez, quince…) y al final se repite cuánto vale.
    $$('#coinrow .cnt').forEach(x => x.onclick = () => { if (x.classList.contains('on')) return; x.classList.add('on'); counted++; Sfx.tone(440 + counted * 40, 0, .15); const v = unit * counted;
      if (counted < n) Voice.seq([{ t: moneyText(v), rate: .9 }]); else { confetti(); Voice.seq([{ t: moneyText(v), rate: .9 }, 400, fmt(s.coinIs, { c: c[0], v: moneyText(c[1]) }), 300, cheer()]); } });
    st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  wire(); guideSay(s.money);
}
function gameMoney(focus, opts) { Diag.crumb('gameMoney'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[20][0], opts, 6); let r = 0, won = 0; const L = level('money');
  function round() { if (r === sh.n) { done(sh, won, () => gameMoney(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const pool = L === 1 ? t.coins.slice(0, 2) : L === 2 ? t.coins.slice(0, 4) : t.coins; const n = L === 1 ? 2 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
    const set = Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]); const total = set.reduce((a, c) => a + c[1], 0); let tries = 0; firstSeen('money:' + total);
    const cands = new Set(); while (cands.size < 2) { const alt = total + [-25, -10, -5, 5, 10, 25, 100][Math.floor(Math.random() * 7)]; if (alt > 0 && alt !== total) cands.add(alt); } const optsM = shuffle([total].concat([...cands]));
    sh.area.innerHTML = `<div class="stage"><div class="countrow big">${set.map(c => coinHtml(c, false)).join('')}</div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsM.map(v => `<button class="tile" type="button" data-v="${v}" style="font-size:1.9rem">${v >= 100 ? '$' + (v / 100).toFixed(v % 100 ? 2 : 0) : v + '¢'}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([s.gMoney]); $('#hear').onclick = hear; askOnce(opts, r, s.gMoney, hear);
    $$('[data-v]', sh.area).forEach(b => b.onclick = () => { if (+b.dataset.v === total) { if (tries === 0) hit('money:' + total); adapt('money', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.totalIs, { v: moneyText(total) }), 300]); if (tries === 0) won++; } else { tries++; miss('money:' + total); if (tries === 1) adapt('money', false); wrong(sh, b, hear, tries, `[data-v="${total}"]`); } }); }
  $('#guideText').textContent = s.gMoney; round();
}
/* ---------- Escribir palabras (tocar letras en orden) ---------- */
function writeScreen() { Diag.crumb('writeScreen'); const s = S(); Voice.seq([s.write, 300], () => gameWrite()); }
function gameWrite(focus, opts) { Diag.crumb('gameWrite'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[21][0], opts, 6); let r = 0, won = 0; const L = level('write');
  const pool = t.writeWords.filter(w => L === 1 ? w[0].length <= 3 : L === 2 ? w[0].length <= 4 : true); const items = pick(pool.length >= 6 ? pool : t.writeWords, 6);
  function round() { if (r === sh.n) { done(sh, won, () => gameWrite(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const [word, pic] = items[r]; const letters = word.split(''); let pos = 0, bad = false; firstSeen('write:' + word);
    const extra = pick('abcdefghijlmnoprstuv'.split('').filter(ch => !letters.includes(ch)), L === 3 ? 3 : 2); const tiles = shuffle(letters.concat(extra));
    sh.area.innerHTML = `<div class="stage"><div class="pic" style="font-size:4.5rem">${pic}</div><div class="slots">${letters.map(() => `<div class="slot"></div>`).join('')}</div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid" id="keys">${tiles.map((ch, i) => `<button class="tile" type="button" data-ch="${ch}" data-i="${i}">${caseIt(ch)}</button>`).join('')}</div>`;
    bigOpts(sh.area, '#keys', tiles.length <= 6 ? 3 : 4); $('#keys').style.setProperty('--h', '84px');
    const hear = () => Voice.seq([{ t: word, rate: .7 }, 500].concat(sylSpeech((t.syllabify[word] || word).split('-')))); $('#hear').onclick = hear; askOnce(opts, r, s.gWrite, hear);
    const slots = $$('.slot', sh.area);
    $$('[data-ch]', sh.area).forEach(b => b.onclick = () => { if (b.disabled) return;
      if (b.dataset.ch === letters[pos]) { b.disabled = true; slots[pos].textContent = caseIt(letters[pos]); slots[pos].classList.add('full'); pos++; Sfx.tap(); const snd = (t.sounds || {})[b.dataset.ch] || b.dataset.ch;
        if (pos < letters.length) Voice.seq([{ t: snd.split(',')[0], rate: .6 }]);
        else { $$('.slot', sh.area).forEach(x => x.classList.add('good')); if (!bad) { hit('write:' + word); won += 2; } adapt('write', !bad); correct(sh, b, bad ? 0 : 2, () => { r++; round(); }, [{ t: word, rate: .75 }, 300, fmt(s.wroteIt, { w: word }), 300]); } }
      else { if (!bad) { miss('write:' + word); adapt('write', false); } bad = true; const ok = $$('[data-ch]', sh.area).find(x => !x.disabled && x.dataset.ch === letters[pos]); wrong(sh, b, null, 2, ok ? `[data-i="${ok.dataset.i}"]` : null); Voice.seq([u.bad, 400, fmt(s.nextLetter, { l: letterName(letters[pos]) })]); } }); }
  $('#guideText').textContent = s.gWrite; round();
}
/* ---------- Mi cuerpo y el clima ---------- */
/* Niño dibujado; cada parte (data-b = índice de bodyParts) se ilumina al tocarla, en el dibujo o en el cubo. Así aprende DÓNDE está cada parte, no solo el nombre. */
function bodySvg(size) { size = size || 150; return `<svg viewBox="0 0 160 260" width="${size}" height="${size * 260 / 160}" aria-hidden="true" class="body">
  <g class="bp" data-b="4" fill="#f2c79a"><ellipse cx="44" cy="48" rx="8" ry="11"/><ellipse cx="116" cy="48" rx="8" ry="11"/></g>
  <g class="bp" data-b="0"><circle cx="80" cy="46" r="34" fill="#f2c79a"/><path d="M48 36q32-26 64 0v-6q-32-22-64 0z" fill="#5a3a1e"/></g>
  <g class="bp" data-b="1" fill="#2b2340"><circle cx="67" cy="42" r="4.5"/><circle cx="93" cy="42" r="4.5"/></g>
  <g class="bp" data-b="2"><path d="M80 46v10h6" stroke="#c98a5a" stroke-width="3" fill="none" stroke-linecap="round"/></g>
  <g class="bp" data-b="9"><rect x="70" y="63" width="20" height="5" rx="1.5" fill="#fff"/></g>
  <g class="bp" data-b="3"><path d="M66 62q14 14 28 0" stroke="#c0392b" stroke-width="4" fill="none" stroke-linecap="round"/></g>
  <g fill="#5b8def"><rect x="18" y="90" width="22" height="72" rx="11"/><rect x="120" y="90" width="22" height="72" rx="11"/></g>
  <g class="bp" data-b="7"><rect x="46" y="84" width="68" height="86" rx="22" fill="#5b8def"/><ellipse cx="80" cy="142" rx="22" ry="16" fill="#7fa6ff"/></g>
  <g class="bp" data-b="8"><path d="M68 110c-7-9 7-18 12-8 5-10 19-1 12 8l-12 13z" fill="#ff5252"/></g>
  <g class="bp" data-b="5" fill="#f2c79a"><circle cx="29" cy="170" r="12"/><circle cx="131" cy="170" r="12"/></g>
  <g fill="#3b3f73"><rect x="52" y="168" width="22" height="66" rx="10"/><rect x="86" y="168" width="22" height="66" rx="10"/></g>
  <g class="bp" data-b="6" fill="#2b2340"><ellipse cx="60" cy="242" rx="17" ry="9"/><ellipse cx="100" cy="242" rx="17" ry="9"/></g></svg>`; }
function bodyScreen() { Diag.crumb('bodyScreen');
  const t = T(), u = U(), s = S(), L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.bodyT + ' · ' + u.weatherT)}${guideHtml(s.body)}
    <p class="prompt">🧍 ${esc(u.bodyT)}</p><div id="bodypic" style="text-align:center">${bodySvg(150)}</div><div class="grid" id="body">${t.bodyParts.map((bp, i) => `<button class="tile keep ${has('body:' + L + ':' + bp[0]) ? 'done' : ''}" type="button" data-b="${i}" style="--cube:var(--card)"><span class="pic">${bp[1]}</span><span class="lbl" style="color:var(--fg)">${esc(bp[0])}</span></button>`).join('')}</div>
    <p class="prompt">🌤️ ${esc(u.weatherT)}</p><div class="grid" id="weather">${t.weatherKinds.map((w, i) => `<button class="tile keep ${has('body:' + L + ':' + w[0]) ? 'done' : ''}" type="button" data-w="${i}" style="--cube:var(--card)"><span class="pic">${w[1]}</span><span class="lbl" style="color:var(--fg)">${esc(caseIt(w[0]))}</span></button>`).join('')}</div></section>`;
  bigOpts(main, '#body', 2); bigOpts(main, '#weather', 2); $('#body').style.setProperty('--h', '96px'); $('#weather').style.setProperty('--h', '100px');
  const showBody = i => { const bp = t.bodyParts[i]; Sfx.tap(); award(1, 'body:' + L + ':' + bp[0]); const svg = $('#bodypic svg'); svg.classList.add('sel'); $$('.bp', svg).forEach(g => g.classList.toggle('on', +g.dataset.b === i)); $$('#body .tile').forEach((x, k) => { x.classList.toggle('good', k === i); if (k === i) x.classList.add('done'); });
    $('#guideText').textContent = fmt(s.bodyPart, { p: bp[0], d: bp[2] }); Voice.seq([fmt(s.bodyPart, { p: bp[0], d: bp[2] })]); };
  $$('#body .tile').forEach(b => b.onclick = () => showBody(+b.dataset.b)); $$('#bodypic .bp').forEach(g => g.onclick = () => { showBody(+g.dataset.b); $('#bodypic').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  $$('#weather .tile').forEach(b => b.onclick = () => { const w = t.weatherKinds[+b.dataset.w]; Sfx.tap(); award(1, 'body:' + L + ':' + w[0]); b.classList.add('done'); $('#guideText').textContent = fmt(s.weatherIs, { w: w[0], d: w[2] }); Voice.seq([fmt(s.weatherIs, { w: w[0], d: w[2] })]); });
  wire(); guideSay(s.body);
}
function gameBody(focus, opts) { Diag.crumb('gameBody'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[22][0], opts, 6); let r = 0, won = 0; const L = level('body'); const nOpts = [3, 4, 6][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameBody(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const ans = t.bodyParts[Math.floor(Math.random() * t.bodyParts.length)]; let tries = 0; firstSeen('body:' + ans[0]);
    const optsB = shuffle([ans].concat(pick(t.bodyParts.filter(x => x !== ans), nOpts - 1)));
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big icon" id="hear" type="button">🔊</button></div><p class="prompt">${esc(fmt(s.tapPart, { p: ans[0] }))}</p>
      <div class="grid">${optsB.map(bp => `<button class="tile keep" type="button" data-b="${esc(bp[0])}" style="--cube:var(--card)"><span class="pic">${bp[1]}</span>${L < 3 ? `<span class="lbl" style="color:var(--fg)">${esc(bp[0])}</span>` : ''}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([fmt(s.tapPart, { p: ans[0] })]); $('#hear').onclick = hear; askOnce(opts, r, s.gBody + ' ' + fmt(s.tapPart, { p: ans[0] }), hear);
    $$('[data-b]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.b === ans[0]) { if (tries === 0) hit('body:' + ans[0]); adapt('body', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.bodyPart, { p: ans[0], d: ans[2] }), 300]); if (tries === 0) won++; } else { tries++; miss('body:' + ans[0]); if (tries === 1) adapt('body', false); wrong(sh, b, hear, tries, `[data-b="${ans[0]}"]`); } }); }
  $('#guideText').textContent = s.gBody; round();
}
function gameWeather(focus, opts) { Diag.crumb('gameWeather'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[23][0], opts, 6); let r = 0, won = 0; const L = level('weather'); const nOpts = [3, 4, 6][L - 1];
  function round() { if (r === sh.n) { done(sh, won, () => gameWeather(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const w = t.weatherKinds[Math.floor(Math.random() * t.weatherKinds.length)]; const ans = t.wearOptions.find(o => o[0] === w[3]); let tries = 0; firstSeen('body:' + w[0]);
    const optsW = shuffle([ans].concat(pick(t.wearOptions.filter(o => o !== ans && o[1] !== ans[1]), nOpts - 1)));
    sh.area.innerHTML = `<div class="stage"><div class="pic" style="font-size:5rem">${w[1]}</div><div class="word">${esc(caseIt(w[0]))}</div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsW.map(o => `<button class="tile keep" type="button" data-o="${esc(o[0])}" style="--cube:var(--card)"><span class="pic">${o[1]}</span>${L < 3 ? `<span class="lbl" style="color:var(--fg)">${esc(o[0])}</span>` : ''}</button>`).join('')}</div>`;
    bigOpts(sh.area); if (!opts.part) $('#guideText').textContent = fmt(s.gWeather, { w: w[0] }); const hear = () => Voice.seq([fmt(s.gWeather, { w: w[0] })]); $('#hear').onclick = hear; askOnce(opts, r, fmt(s.gWeather, { w: w[0] }), hear);
    $$('[data-o]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.o === ans[0]) { if (tries === 0) hit('body:' + w[0]); adapt('weather', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.wearIt, { w: w[0], c: ans[0] }), 300]); if (tries === 0) won++; } else { tries++; miss('body:' + w[0]); if (tries === 1) adapt('weather', false); wrong(sh, b, hear, tries, `[data-o="${ans[0]}"]`); } }); }
  $('#guideText').textContent = fmt(s.gWeather, { w: '…' }); round();
}
/* ---------- Leer y entender (8+): texto corto + 4 preguntas ---------- */
function readScreen() { Diag.crumb('readScreen');
  const t = T(), u = U(), s = S(), L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.readT)}${guideHtml(s.read)}
    <div class="grid" id="reads">${t.readings.map((rd, i) => `<button class="tile keep ${has('read:' + L + ':' + i) ? 'done' : ''}" type="button" data-r="${i}" style="--cube:var(--card)"><span class="pic">📖</span><span class="lbl" style="color:var(--fg)">${esc(rd.title)}</span></button>`).join('')}</div></section>`;
  bigOpts(main, '#reads', 1); $('#reads').style.setProperty('--h', '96px');
  $$('#reads .tile').forEach(b => b.onclick = () => { Sfx.tap(); gameRead(+b.dataset.r); }); wire(); guideSay(s.read);
}
function gameRead(focus, opts) { Diag.crumb('gameRead'); opts = opts || {};
  const t = T(), u = U(), s = S(), L = settings.lang; const idx = typeof focus === 'number' ? focus : Math.floor(Math.random() * t.readings.length); const rd = t.readings[idx];
  const sh = gameShell(rd.title, opts, rd.qs.length); let r = 0, won = 0; let phase = 'read';
  const words = rd.text.split(' ');
  sh.area.innerHTML = `<div class="stage"><div class="reading" id="rtext">${words.map(w => `<button class="w" type="button" data-w="${esc(w.replace(/[.,!?—"¡¿]/g, ''))}">${esc(w)}</button>`).join(' ')}</div>
    <div class="row"><button class="btn big icon" id="readAll" type="button">🔊</button><button class="btn icon" id="goQ" type="button">➡️</button></div></div>`;
  $$('.w', sh.area).forEach(b => b.onclick = () => Voice.seq([{ t: b.dataset.w, rate: .8 }]));
  const readAll = () => { Voice.stop(); setTimeout(() => readAlong($('#rtext'), rd.text, () => { const g = $('#goQ'); if (g) g.classList.add('pulse'); }), 100); };
  $('#readAll').onclick = readAll; $('#goQ').onclick = () => { Voice.stop(); question(); };
  Voice.seq([s.read, 300, s.readTap], () => { if (level('read') === 1) readAll(); else $('#goQ').classList.add('pulse'); });
  function question() { if (r === rd.qs.length) { mark('read:' + L + ':' + idx); done(sh, won, () => gameRead(idx), opts); return; }
    sh.bar.style.width = (r / rd.qs.length * 100) + '%'; const q = rd.qs[r]; let tries = 0; const optsQ = shuffle(q[1].map((o, i) => [o, i]));
    sh.area.innerHTML = `<div class="stage"><div class="sub">${esc(fmt(s.readQ, { n: r + 1 }))}</div><div class="word" style="font-size:1.4rem;letter-spacing:0">${esc(q[0])}</div><button class="btn icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsQ.map(o => `<button class="tile" type="button" data-i="${o[1]}" style="font-size:1.25rem;padding:10px">${esc(o[0])}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([q[0]].concat(optsQ.flatMap(o => [400, { t: o[0], rate: .85 }]))); $('#hear').onclick = hear; setTimeout(() => { if (areaFree()) hear(); }, 200);
    $$('[data-i]', sh.area).forEach(b => b.onclick = () => { if (+b.dataset.i === q[2]) { if (tries === 0) hit('read:' + idx); adapt('read', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; question(); }, [{ t: q[1][q[2]], rate: .85 }, 300]); if (tries === 0) won++; } else { tries++; miss('read:' + idx); if (tries === 1) adapt('read', false); wrong(sh, b, hear, tries, `[data-i="${q[2]}"]`); } }); }
  $('#guideText').textContent = s.read;
}
/* ---------- Multiplicar y fracciones ---------- */
function multScreen() { Diag.crumb('multScreen');
  const u = U(), s = S(), L = settings.lang; const t = T();
  main.innerHTML = `<section class="screen">${topbar(u.multT + ' · ' + u.fracT)}${guideHtml(s.mult)}
    <p class="prompt">✖️ ${esc(u.multT)}</p><div class="grid" id="tables">${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="tile" type="button" data-n="${n}">×${n}</button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div>
    <p class="prompt">✨ ${esc(u.trickT)}</p><div class="grid" id="tricks">${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="tile" type="button" data-k="${n}">×${n}</button>`).join('')}<button class="tile keep" type="button" data-k="hands" style="--cube:var(--e);grid-column:1/-1">🖐️🖐️ ${esc(u.trickHands)}</button></div>
    <div class="stage" id="tstage" hidden></div>
    <p class="prompt">🍕 ${esc(u.fracT)}</p><div class="grid" id="fracs">${t.fractions.map((f, i) => `<button class="tile keep ${has('mult:' + L + ':' + f[1]) ? 'done' : ''}" type="button" data-f="${i}" style="--cube:var(--card)">${fracSvg(f[2], f[3], 70)}<span class="lbl" style="color:var(--fg)">${f[1]}</span></button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><button class="btn" id="goMult" type="button">▶ ${esc(u.games[25][0])}</button><button class="btn alt" id="goFrac" type="button">▶ ${esc(u.games[26][0])}</button></div></section>`;
  bigOpts(main, '#tables', 3); bigOpts(main, '#fracs', 3); bigOpts(main, '#tricks', 3); $('#tables').style.setProperty('--h', '84px'); $('#tricks').style.setProperty('--h', '84px'); $('#fracs').style.setProperty('--h', '110px');
  $$('#tricks .tile').forEach(b => b.onclick = () => { Sfx.tap(); trickLesson(b.dataset.k === 'hands' ? 'hands' : +b.dataset.k); });
  $$('#tables .tile').forEach(b => b.onclick = () => { const n = +b.dataset.n; Sfx.tap(); award(1, 'mult:' + L + ':t' + n); const st = $('#stage'); st.hidden = false; const nums = u.numbers;
    st.innerHTML = `<div class="word" style="font-size:1.4rem;letter-spacing:0">${esc(fmt(s.multTable, { n }))}</div><div class="tablerows">${Array.from({ length: 10 }, (_, i) => `<button class="trow" type="button" data-a="${i + 1}">${n} × ${i + 1} = <b>${n * (i + 1)}</b><span>${Array.from({ length: i + 1 }, (_, k) => '●' + ((k + 1) % 5 === 0 ? ' ' : '')).join('').trim()}</span></button>`).join('')}</div><div id="mlesson" style="width:100%;display:flex;flex-direction:column;gap:10px;align-items:center"></div>`;
    // Lección de la fila "n × i" con el método de las líneas (japonés): n líneas azules cruzadas por i amarillas; cada cruce es un punto.
    // El niño toca cada línea amarilla, se encienden sus n cruces y se cuenta de n en n; luego la suma repetida y el resultado.
    const plus = L === 'es' ? ' más ' : ' plus ';
    const lesson = i => { $$('.trow', st).forEach(y => y.classList.toggle('hl', +y.dataset.a === i)); let k = 0; const box = $('#mlesson'); const intro = fmt(i === 1 ? s.multGroups1 : s.multGroups, { a: i, b: n });
      const W = 40 + i * 34, H = 44 + n * 30, xs = g => 20 + g * 34, ys = j => 20 + j * 30;
      box.innerHTML = `<div class="sub" style="font-size:1.3rem">${esc(intro)}</div>
        <svg class="mlines" viewBox="0 0 ${W} ${H}" width="${Math.min(W, 380)}" style="max-width:100%;height:auto" aria-label="${n} × ${i}">
          ${Array.from({ length: n }, (_, j) => `<line x1="4" y1="${ys(j)}" x2="${W - 4}" y2="${ys(j)}" stroke="var(--o)" stroke-width="5" stroke-linecap="round"/>`).join('')}
          ${Array.from({ length: i }, (_, g) => `<g class="vline" data-g="${g}" style="cursor:pointer"><rect x="${xs(g) - 17}" y="0" width="34" height="${H}" fill="transparent"/><line x1="${xs(g)}" y1="4" x2="${xs(g)}" y2="${H - 22}" stroke="var(--e)" stroke-width="5" stroke-linecap="round"/>
            ${Array.from({ length: n }, (_, j) => `<circle cx="${xs(g)}" cy="${ys(j)}" r="7" fill="var(--card)" stroke="var(--fg)" stroke-width="2"/>`).join('')}<text x="${xs(g)}" y="${H - 4}" text-anchor="middle" font-family="Fredoka,Nunito,sans-serif" font-weight="700" font-size="15" fill="var(--fg)"></text></g>`).join('')}
        </svg>
        <div class="sumline" id="msum">${Array.from({ length: i }, () => n).join(' + ')} = <b>?</b></div><div class="word" style="font-size:2.2rem;letter-spacing:3px">${n} × ${i} = <b id="mres">?</b></div>`;
      $('#guideText').textContent = intro; Voice.seq([intro]);
      $$('.vline', box).forEach(g => g.onclick = () => { if (g.classList.contains('on')) return; g.classList.add('on'); k++; const v = n * k; $$('circle', g).forEach(c => { c.setAttribute('fill', '#22c55e'); c.setAttribute('stroke', '#fff'); c.setAttribute('r', '9'); }); $('line', g).setAttribute('stroke-width', '8'); $('text', g).textContent = v; Sfx.tone(440 + k * 40, 0, .15);
        if (k < i) Voice.seq([{ t: u.numWord(v), rate: .9 }]);
        else { $('#msum').innerHTML = `${Array.from({ length: i }, () => n).join(' + ')} = <b>${v}</b>`; $('#mres').textContent = v; confetti(); award(1, 'mult:' + L + ':' + n + 'x' + i);
          const sum = fmt(s.multSum, { sum: Array.from({ length: i }, () => u.numWord(n)).join(plus), c: u.numWord(v) }); $('#guideText').textContent = sum;
          Voice.seq([{ t: u.numWord(v), rate: .9 }, 400, sum, 400, fmt(s.multAns, { a: n, b: i, c: v }), 300, cheer()]); } });
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    $$('.trow', st).forEach(x => x.onclick = () => { Sfx.tap(); lesson(+x.dataset.a); });
    $('#guideText').textContent = s.multPick; Voice.seq([fmt(s.multTable, { n }), 400, s.multLines, 400, s.multPick]); st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  $$('#fracs .tile').forEach(b => b.onclick = () => { const f = t.fractions[+b.dataset.f]; Sfx.tap(); award(1, 'mult:' + L + ':' + f[1]); b.classList.add('done'); $('#guideText').textContent = fmt(s.fracIs, { f: f[0], d: f[4] }); Voice.seq([fmt(s.fracIs, { f: f[0], d: f[4] })]); });
  $('#goMult').onclick = () => gameMult(); $('#goFrac').onclick = () => gameFrac(); wire(); guideSay(s.mult);
}
/* ---------- Trucos de las tablas (los virales de TikTok, explicados simple y con práctica) ----------
   Cada truco es una vista interactiva: trickView(box, k, a, b, onDone) pinta el truco para k × a (o a × b en "hands"),
   el niño toca y la voz explica paso a paso; al terminar llama onDone(resultado). La misma vista sirve de andamio en gameTrick.
   Trucos: 2/4/8 = doblar (1, 2 o 3 veces) · 3 = doble + 1 vez · 6 = 5 veces + 1 · 7 = 5 veces + 2 · 5 = manos de 5 dedos ·
   9 = bajar el dedo (izquierda decenas, derecha unidades) · 10 = ponerle un cero · hands = dedos 6-10 (tocan+abajo = decenas; arriba × arriba = unidades). */
function dotsHtml(n, cls) { return `<span class="tkdots ${cls || ''}">${Array.from({ length: n }, () => '<i></i>').join('')}</span>`; }
function trickIntro(k, a, b) { const s = S(); if (k === 'hands') return fmt(s.trickHands, { a, b }); if (k === 9) return fmt(s.trick9, { a }); return s['trick' + k]; }
function trickView(box, k, a, b, onDone, onEnd) { const s = S(), u = U(), N = n => u.numWord(n); const say = (parts, then) => { $('#guideText').textContent = typeof parts[0] === 'string' ? parts[0] : $('#guideText').textContent; Voice.seq(parts, then); };
  const finish = (c, parts) => { confetti(); if (onDone) onDone(c); say(parts, () => { if (onEnd && document.contains(box)) onEnd(c); }); };
  if (k === 2 || k === 4 || k === 8) { const times = k === 2 ? 1 : k === 4 ? 2 : 3; let cur = a, t = 0;
    box.innerHTML = `<div class="tkrow"><div class="tkbig" id="tkcur">${a}</div><button class="btn big" id="tkdbl" type="button" style="font-size:1.6rem">×2 ✨</button></div><div id="tkd">${dotsHtml(a)}</div><div class="tksteps" id="tksteps"></div>`;
    $('#tkdbl').onclick = () => { if (t >= times) return; t++; const prev = cur; cur *= 2; Sfx.tone(500 + t * 80, 0, .15); $('#tkcur').textContent = cur; $('#tkd').innerHTML = dotsHtml(prev) + dotsHtml(prev, 'new'); $('#tksteps').innerHTML += `<span>${prev} + ${prev} = <b>${cur}</b></span>`;
      if (t < times) say([fmt(s.doubleOf, { a: N(prev), c: N(cur) }), 300, s.tapDouble]); else { $('#tkdbl').disabled = true; finish(cur, [fmt(s.doubleOf, { a: N(prev), c: N(cur) }), 400, fmt(s.multAns, { a: k, b: a, c: cur })]); } };
    return; }
  if (k === 3 || k === 6 || k === 7) { const chunks = k === 3 ? [2, 1] : k === 6 ? [5, 1] : [5, 2]; let i = 0, sub = [];
    box.innerHTML = `<div class="tkchunks">${chunks.map((g, j) => `<button class="tkchunk ${j ? 'c2' : 'c1'}" type="button" data-j="${j}">${Array.from({ length: g }, () => dotsHtml(a)).join('')}<b>?</b></button>`).join('')}</div><div class="sumline" id="tksum">? + ? = <b>?</b></div>`;
    $$('.tkchunk', box).forEach(ch => ch.onclick = () => { const j = +ch.dataset.j; if (j !== i) return; const g = chunks[j], v = g * a; sub.push(v); ch.classList.add('on'); $('b', ch).textContent = v; i++; Sfx.tone(520 + j * 90, 0, .15);
      if (i < chunks.length) say([fmt(s.chunkIs, { k: N(g), a: N(a), c: N(v) })]);
      else { const c = sub[0] + sub[1]; $('#tksum').innerHTML = `${sub[0]} + ${sub[1]} = <b>${c}</b>`; finish(c, [g === 1 ? fmt(s.chunkIs1, { a: N(a) }) : fmt(s.chunkIs, { k: N(g), a: N(a), c: N(v) }), 300, fmt(s.chunkAdd, { x: N(sub[0]), y: N(sub[1]), c: N(c) }), 400, fmt(s.multAns, { a: k, b: a, c })]); } });
    return; }
  if (k === 5) { let n = 0; box.innerHTML = `<div class="tkhands">${Array.from({ length: a }, (_, j) => `<button class="tkhand" type="button" data-j="${j}">🖐️<b></b></button>`).join('')}</div><div class="tkbig" id="tkcur">?</div>`;
    $$('.tkhand', box).forEach(h => h.onclick = () => { if (h.classList.contains('on')) return; h.classList.add('on'); n++; const v = n * 5; $('b', h).textContent = v; $('#tkcur').textContent = v; Sfx.tone(440 + n * 40, 0, .15);
      if (n < a) say([{ t: N(v), rate: .9 }]); else finish(v, [{ t: N(v), rate: .9 }, 400, fmt(s.multAns, { a: 5, b: a, c: v })]); });
    return; }
  if (k === 9) { const c = 9 * a, l = a - 1, r = 10 - a;
    box.innerHTML = `<div class="tknine">${[0, 1].map(h => `<div class="tkpalm ${h ? 'r' : 'l'}">${Array.from({ length: 5 }, (_, j) => { const f = h * 5 + j + 1; return `<button class="tkfinger" type="button" data-f="${f}"><span>${f}</span></button>`; }).join('')}<i></i></div>`).join('')}</div><div class="tkbig" id="tkcur"><span class="tkl">?</span><span class="tkr">?</span></div>`;
    $$('.tkfinger', box).forEach(f => f.onclick = () => { const n = +f.dataset.f; if (n !== a) { Sfx.bad(); say([fmt(s.tapFinger, { a: N(a) })]); return; } Sfx.good(); f.classList.add('down'); $$('.tkfinger', box).forEach(x => { const m = +x.dataset.f; if (m < a) x.classList.add('tens'); if (m > a) x.classList.add('units'); x.disabled = true; });
      $('#tkcur').innerHTML = `<span class="tkl">${l || ''}</span><span class="tkr">${r}</span>`; finish(c, [l ? fmt(s.nineIs, { l: N(l), r: N(r), c: N(c) }) : fmt(s.nineIs0, { r: N(r) }), 400, fmt(s.multAns, { a: 9, b: a, c })]); });
    return; }
  if (k === 10) { const c = a * 10; box.innerHTML = `<button class="tkbig tkten" id="tkten" type="button">${a}<span class="zero">0</span></button>`;
    $('#tkten').onclick = () => { const bt = $('#tkten'); if (bt.classList.contains('on')) return; bt.classList.add('on'); Sfx.good(); finish(c, [fmt(s.tenIs, { a: N(a), c: N(c) }), 400, fmt(s.multAns, { a: 10, b: a, c })]); };
    return; }
  if (k === 'hands') { const pick = [null, null]; const c = a * b;
    box.innerHTML = `<div class="tk610">${[0, 1].map(h => `<div class="tkcol ${h ? 'r' : 'l'}">${[10, 9, 8, 7, 6].map(f => `<button class="tkbar" type="button" data-h="${h}" data-f="${f}"><span>${f}</span></button>`).join('')}</div>`).join('')}</div><div class="sumline" id="tksum"><span class="tkl">?</span> + <span class="tkr">?</span> = <b>?</b></div>`;
    say([fmt(s.trickHands, { a, b })]);
    $$('.tkbar', box).forEach(bar => bar.onclick = () => { const h = +bar.dataset.h, f = +bar.dataset.f; if (pick[h] != null) return; const want = h === 0 ? a : b; if (f !== want) { Sfx.bad(); return; } pick[h] = f; bar.classList.add('pick'); Sfx.tone(h ? 620 : 520, 0, .15);
      if (pick[0] == null || pick[1] == null) { say([s.tapOther]); return; }
      $$('.tkbar', box).forEach(x => { const hh = +x.dataset.h, ff = +x.dataset.f; if (ff <= pick[hh]) x.classList.add('tens'); else x.classList.add('units'); x.disabled = true; });
      const t = (a - 5) + (b - 5), tens = t * 10, lu = 10 - a, ru = 10 - b, un = lu * ru; $('#tksum').innerHTML = `<span class="tkl">${tens}</span> + <span class="tkr">${un}</span> = <b>${c}</b>`;
      finish(c, [fmt(s.handsTens, { t: N(t), tens: N(tens) }), 400, un ? fmt(s.handsUnits, { l: N(lu), r: N(ru), u: N(un) }) : s.handsUnits0, 400, fmt(s.handsTotal, { tens: N(tens), u: N(un), c: N(c) }), 400, fmt(s.multAns, { a, b, c })]); });
    return; }
}
function trickPick(k) { if (k === 'hands') { const a = 6 + Math.floor(Math.random() * 5), b = 6 + Math.floor(Math.random() * 5); return [a, b]; } return [2 + Math.floor(Math.random() * 8), k]; }
function trickLesson(k) { Diag.crumb('trickLesson:' + k); const u = U(), s = S(), L = settings.lang; const st = $('#tstage'); if (!st) return; st.hidden = false; award(1, 'mult:' + L + ':trick' + k);
  const show = () => { const [a, b] = trickPick(k); const title = k === 'hands' ? u.trickHands : fmt(s.trickOf, { n: k }); const q = k === 'hands' ? `${a} × ${b}` : `${k} × ${a}`;
    st.innerHTML = `<div class="word" style="font-size:1.4rem;letter-spacing:0">✨ ${esc(title)}</div><div class="word" style="font-size:2.2rem;letter-spacing:3px">${q} = <b id="tkres">?</b></div><div class="tk" id="tkbox"></div><div class="row" style="margin-top:8px"><button class="btn big icon" id="tkre" type="button" title="otro">🔄</button><button class="btn big" id="tkgo" type="button">▶ ${esc(u.games[25][0])}</button></div>`;
    $('#tkre').onclick = () => { Sfx.tap(); show(); }; $('#tkgo').onclick = () => gameTrick(k);
    trickView($('#tkbox'), k, a, b, c => { $('#tkres').textContent = c; }, () => { $('#tkre').classList.add('pulse'); $('#guideText').textContent = s.trickAgain; Voice.seq([s.trickAgain]); });
    const intro = trickIntro(k, a, b); $('#guideText').textContent = intro; if (k !== 'hands') Voice.seq([intro]); st.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  show();
}
/* Práctica del truco: 4 rondas; el truco está en pantalla como andamio (el niño puede tocarlo o responder directo). Misma estadística que Multiplicar. */
function gameTrick(k, opts) { Diag.crumb('gameTrick:' + k); opts = opts || {}; const u = U(), s = S(); const sh = gameShell(k === 'hands' ? u.trickHands : fmt(s.trickOf, { n: k }), opts, 4); let r = 0, won = 0;
  function round() { if (r === sh.n) { done(sh, won, () => gameTrick(k), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const [a, b] = trickPick(k); const c = a * b; let tries = 0; const key = 'mult:' + Math.min(a, b) + 'x' + Math.max(a, b); firstSeen(key);
    const cands = new Set(); while (cands.size < 2) { const alt = c + [-b, b, -a, a, -10, 10][Math.floor(Math.random() * 6)]; if (alt > 0 && alt !== c) cands.add(alt); } const optsM = shuffle([c].concat([...cands]));
    sh.area.innerHTML = `<div class="stage"><div class="word" style="font-size:2.2rem;letter-spacing:4px">${k === 'hands' ? a + ' × ' + b : k + ' × ' + a} = <span style="color:var(--a)">?</span></div><div class="tk" id="tkbox"></div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsM.map(v => `<button class="tile" type="button" data-v="${v}">${v}</button>`).join('')}</div>`;
    bigOpts(sh.area); trickView($('#tkbox'), k, a, b, null);
    const q = fmt(s.multQ, { a: k === 'hands' ? a : k, b: k === 'hands' ? b : a }); const hear = () => Voice.seq([q]); $('#hear').onclick = hear; askOnce(opts, r, s.trickPractice + ' ' + q, hear);
    $$('[data-v]', sh.area).forEach(btn => btn.onclick = () => { if (+btn.dataset.v === c) { if (tries === 0) hit(key); adapt('mult', tries === 0); correct(sh, btn, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.multAns, { a: k === 'hands' ? a : k, b: k === 'hands' ? b : a, c }), 300]); if (tries === 0) won++; } else { tries++; miss(key); if (tries === 1) adapt('mult', false); wrong(sh, btn, hear, tries, `[data-v="${c}"]`); } }); }
  $('#guideText').textContent = s.trickPractice; round();
}
function fracSvg(parts, filled, size) { const r = 50, cx = 60, cy = 60; let d = ''; for (let i = 0; i < parts; i++) { const a0 = (i / parts) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / parts) * 2 * Math.PI - Math.PI / 2; const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1); d += `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${parts === 2 ? 1 : 0},1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${i < filled ? 'var(--a)' : 'var(--bg)'}" stroke="var(--fg)" stroke-width="3"/>`; } return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${d}</svg>`; }
function gameMult(focus, opts) { Diag.crumb('gameMult'); opts = opts || {};
  const u = U(), s = S(); const sh = gameShell(u.games[25][0], opts, 6); let r = 0, won = 0; const L = level('mult'); const tables = L === 1 ? [2, 5, 10] : L === 2 ? [2, 3, 4, 5, 10] : [2, 3, 4, 5, 6, 7, 8, 9, 10]; const maxB = L === 1 ? 5 : 10;
  function round() { if (r === sh.n) { done(sh, won, () => gameMult(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const b = tables[Math.floor(Math.random() * tables.length)], a = 1 + Math.floor(Math.random() * maxB), c = a * b; let tries = 0; firstSeen('mult:' + a + 'x' + b);
    const cands = new Set(); while (cands.size < 2) { const alt = c + [-b, b, -a, a, -1, 1][Math.floor(Math.random() * 6)]; if (alt > 0 && alt !== c) cands.add(alt); } const optsM = shuffle([c].concat([...cands]));
    const thing = T().countThings[Math.floor(Math.random() * T().countThings.length)][1];
    const da = Math.min(a, 5), db = Math.min(b, 6), overflow = a > 5 || b > 6;
    sh.area.innerHTML = `<div class="stage"><div class="groups">${Array.from({ length: da }, () => `<span class="grp">${thing.repeat(db)}</span>`).join('')}${overflow ? `<span class="grp" style="opacity:.55;font-size:1.1rem">…+${a*b - da*db}</span>` : ''}</div><div class="word" style="font-size:2.2rem;letter-spacing:4px">${a} × ${b} = <span style="color:var(--a)">?</span></div><button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsM.map(v => `<button class="tile" type="button" data-v="${v}">${v}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([fmt(a === 1 ? s.multQ1 : s.multQ, { a, b })]); $('#hear').onclick = hear; askOnce(opts, r, s.mult.split('.')[0] + '. ' + fmt(a === 1 ? s.multQ1 : s.multQ, { a, b }), hear);
    $$('[data-v]', sh.area).forEach(btn => btn.onclick = () => { if (+btn.dataset.v === c) { if (tries === 0) hit('mult:' + a + 'x' + b); adapt('mult', tries === 0); correct(sh, btn, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.multAns, { a, b, c }), 300]); if (tries === 0) won++; } else { tries++; miss('mult:' + a + 'x' + b); if (tries === 1) adapt('mult', false); wrong(sh, btn, hear, tries, `[data-v="${c}"]`); } }); }
  $('#guideText').textContent = s.mult; round();
}
function gameFrac(focus, opts) { Diag.crumb('gameFrac'); opts = opts || {};
  const t = T(), u = U(), s = S(); const sh = gameShell(u.games[26][0], opts, 6); let r = 0, won = 0; const L = level('frac'); const pool = L === 1 ? t.fractions.slice(0, 3) : t.fractions; const nOpts = L === 3 ? 4 : 3;
  function round() { if (r === sh.n) { done(sh, won, () => gameFrac(focus), opts); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const ans = pool[Math.floor(Math.random() * pool.length)]; let tries = 0; firstSeen('mult:' + ans[1]);
    const optsF = shuffle([ans].concat(pick(t.fractions.filter(f => f !== ans), nOpts - 1)));
    sh.area.innerHTML = `<div class="stage">${fracSvg(ans[2], ans[3], 170)}<button class="btn big icon" id="hear" type="button">🔊</button></div>
      <div class="grid">${optsF.map(f => `<button class="tile" type="button" data-f="${f[1]}" style="font-size:2.4rem">${f[1]}</button>`).join('')}</div>`;
    bigOpts(sh.area); const hear = () => Voice.seq([s.gFrac]); $('#hear').onclick = hear; askOnce(opts, r, s.gFrac, hear);
    $$('[data-f]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.f === ans[1]) { if (tries === 0) hit('mult:' + ans[1]); adapt('frac', tries === 0); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }, [fmt(s.fracIs, { f: ans[0], d: ans[4] }), 300]); if (tries === 0) won++; } else { tries++; miss('mult:' + ans[1]); if (tries === 1) adapt('frac', false); const o = t.fractions.find(f => f[1] === b.dataset.f); Voice.seq([{ t: o[0], rate: .85 }]); wrong(sh, b, null, tries, `[data-f="${ans[1]}"]`); } }); }
  $('#guideText').textContent = s.gFrac; round();
}
Object.assign(GAME_FNS, { gameMoney, gameWrite, gameBody, gameWeather, gameRead, gameMult, gameFrac });

/* ---------- parents ---------- */
function parentsScreen() { Diag.crumb('parentsScreen');
  const u = U(); const a = 3 + Math.floor(Math.random() * 6), b = 2 + Math.floor(Math.random() * 7);
  main.innerHTML = `<section class="screen">${topbar(u.parentsT)}<div class="stage"><div class="word" style="font-size:1.4rem;letter-spacing:0">${esc(fmt(u.parentsGate, { a, b }))}</div>
    <input type="text" inputmode="numeric" id="gate" maxlength="3" autocomplete="off"><button class="btn" id="ok" type="button">OK</button><div class="feedback" id="fb"></div></div></section>`;
  const check = () => { if (+$('#gate').value === a * b) parentsPanel(); else { $('#fb').textContent = u.wrongGate; $('#fb').style.color = 'var(--bad)'; } };
  $('#ok').onclick = check; $('#gate').onkeydown = e => { if (e.key === 'Enter') check(); }; wire(); setTimeout(() => $('#gate').focus(), 50);
}
function parentsPanel() { Diag.crumb('parentsPanel');
  const t = T(), u = U(); const L = settings.lang; const lv = u.levels;
  const totals = [5, t.letters.length + 5, t.cons.length * 5, t.wordCats.reduce((s, c) => s + c[2].length, 0), t.phrases.length, t.stories.length, t.letters.length + 5 + 10, 10, 20, t.colors.length + t.shapes.length, 20, t.emotions.length, 12 + 7 + 12, t.animals.length + t.plant.length + 1 + t.planets.length, t.songs.length, t.coins.length, t.writeWords.length, t.bodyParts.length + t.weatherKinds.length, t.readings.length, 5 + 50 + t.fractions.length];
  const vs = Voice.voices.filter(v => (v.lang || '').toLowerCase().startsWith(T().code));
  main.innerHTML = `<section class="screen">${topbar(u.parentsT)}
    <div class="card"><h3>${esc(u.progress)} · ${P.avatar} ${esc(P.name)} · ⭐ ${P.stars}</h3>
      <div class="bars">${lv.map((l, i) => { const n = Math.min(levelStars(i), totals[i]); return `<div class="bar"><span>${l[2]} ${esc(l[0])}</span><div class="progress"><i style="width:${n / totals[i] * 100}%"></i></div><em>${n}/${totals[i]}</em></div>`; }).join('')}</div></div>
    <div class="card"><h3>${esc(u.levelsT)}</h3><div class="badgerow">${['vowel', 'word', 'build', 'first', 'missing', 'syl', 'rhyme', 'clap', 'odd', 'count', 'tapnum', 'color', 'shape', 'add', 'sub', 'feel', 'clock', 'day', 'animal', 'habitat', 'money', 'write', 'body', 'weather', 'read', 'mult', 'frac'].map((g, i) => `<span class="badge on">${esc(u.games[[0, 1, 2, 3, 5, 27, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26][i]][0])}: ${level(g)}/3</span>`).join('')}</div><small style="color:var(--muted)">${esc(u.levelsHelp)} · 🔥 ${P.streak || 0} · ${esc(u.reviewsN)}: ${P.reviews || 0}</small></div>
    <div class="card"><h3>${esc(u.weakT)}</h3>${weakList()}</div>
    <div class="card"><h3>${esc(u.badges)}</h3><div class="badgerow">${BADGES.map(b => `<span class="badge ${P.badges && P.badges[b] ? 'on' : ''}">🏅 ${esc(u.badgeNames[b])}</span>`).join('')}</div></div>
    <div class="card"><h3>${esc(u.settings)}</h3>
      <div class="setting"><label for="voiceSel">${esc(u.voice)} (${T().name})</label><select id="voiceSel"><option value="">Auto</option>${vs.map(v => `<option value="${esc(v.voiceURI)}" ${settings.voice[L] === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>${vs.length ? '' : `<small style="color:var(--bad)">${esc(u.noVoice)}</small>`}</div>
      <div class="setting"><label for="rate">${esc(u.speed)}: <span id="rateV">${settings.rate}</span></label><input type="range" id="rate" min="0.5" max="1.2" step="0.05" value="${settings.rate}"></div>
      <div class="setting"><label>${esc(u.pace)}</label><div class="row">${[[0.3, u.paceFast], [0.5, u.paceNormal], [0.9, u.paceSlow]].map(([v, lbl]) => `<button class="chip ${(settings.pause || 0.5) === v ? 'on' : ''}" type="button" data-pace="${v}">${esc(lbl)}</button>`).join('')}</div></div>
      <div class="setting"><label>${esc(u.letterCase)}</label><div class="row"><button class="chip ${settings.upper ? 'on' : ''}" id="cU" type="button">ABC</button><button class="chip ${settings.upper ? '' : 'on'}" id="cL" type="button">abc</button></div></div>
      <div class="setting"><label>${esc(u.sfx)}</label><div class="row"><button class="chip ${settings.sfx ? 'on' : ''}" id="sfxOn" type="button">🔔 On</button><button class="chip ${settings.sfx ? '' : 'on'}" id="sfxOff" type="button">🔕 Off</button></div></div>
      <div class="row"><button class="btn alt" id="testVoice" type="button">🔊 ${esc(u.listen)}</button><button class="btn alt" id="dlVoices" type="button">⬇️ ${esc(u.downloadVoices)}</button><button class="btn alt" id="install" type="button" hidden>📲 ${esc(u.install)}</button></div><small id="dlInfo" style="color:var(--muted)"></small></div>
    <div class="card"><h3>${esc(u.profiles)}</h3><div class="row" style="justify-content:flex-start"><button class="btn alt" id="switch" type="button">👥 ${esc(u.profiles)}</button><button class="btn alt" id="reset" type="button">🧹 ${esc(fmt(u.reset, { name: P.name }))}</button><button class="btn" style="background:var(--bad)" id="resetAll" type="button">${esc(u.resetAll)}</button></div>
      <small style="color:var(--muted)">${esc(u.about)}</small></div>
    <div class="card"><h3>🛠 ${esc(u.diagT)}</h3><small style="color:var(--muted)">${esc(u.diagHelp)}</small>
      <div class="row" style="justify-content:flex-start"><button class="btn alt" id="diagCopy" type="button">📋 ${esc(u.copy)}</button><button class="btn alt" id="diagShow" type="button">👁 ${esc(u.show)}</button><button class="btn alt" id="diagClear" type="button">🧹 ${esc(u.clear)}</button></div>
      <pre id="diagOut" hidden style="white-space:pre-wrap;font-size:.7rem;max-height:40vh;overflow:auto;background:var(--bg);border-radius:12px;padding:10px;user-select:text;-webkit-user-select:text"></pre></div>
  </section>`;
  $('#diagShow').onclick = () => { const o = $('#diagOut'); o.textContent = Diag.report(); o.hidden = !o.hidden; };
  $('#diagClear').onclick = () => { Diag.clear(); $('#diagOut').textContent = ''; toast('🧹'); };
  $('#diagCopy').onclick = () => { const txt = Diag.report(); const fallback = () => { const o = $('#diagOut'); o.textContent = txt; o.hidden = false; const r = document.createRange(); r.selectNodeContents(o); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast(u.copyManual); };
    try { navigator.clipboard.writeText(txt).then(() => toast('📋 ✓'), fallback); } catch (e) { fallback(); } };
  $$('[data-practice]', main).forEach(b => b.onclick = () => practice(b.dataset.practice));
  $('#voiceSel').onchange = e => { settings.voice[L] = e.target.value; saveSettings(); Voice.say(t.vowels[0][1]); };
  $('#rate').oninput = e => { settings.rate = +e.target.value; $('#rateV').textContent = settings.rate; saveSettings(); };
  $('#rate').onchange = () => Voice.say(t.phrases[0][0]);
  $('#cU').onclick = () => { settings.upper = true; saveSettings(); parentsPanel(); }; $('#cL').onclick = () => { settings.upper = false; saveSettings(); parentsPanel(); };
  $$('[data-pace]', main).forEach(b => b.onclick = () => { settings.pause = +b.dataset.pace; saveSettings(); parentsPanel(); Voice.seq([t.vowels[0][0], 700, t.vowels[0][1]]); });
  $('#sfxOn').onclick = () => { settings.sfx = true; saveSettings(); Sfx.good(); parentsPanel(); }; $('#sfxOff').onclick = () => { settings.sfx = false; saveSettings(); parentsPanel(); };
  $('#testVoice').onclick = () => Voice.say(t.phrases[1][0]);
  $('#dlVoices').onclick = async () => { const b = $('#dlVoices'), info = $('#dlInfo'); b.disabled = true; const n = await Clips.downloadAll(L, (i, tot) => { info.textContent = i + ' / ' + tot; }); info.textContent = n ? '✓ ' + n : u.noVoiceFiles; b.disabled = false; };
  $('#switch').onclick = profileScreen;
  let confirmReset = 0; $('#reset').onclick = () => { if (++confirmReset < 2) { toast('⚠️ ' + fmt(u.reset, { name: P.name }) + '?'); return; } P.stars = 0; P.done = {}; P.badges = {}; P.games = 0; saveProfiles(); setHeader(); parentsPanel(); };
  let confirmAll = 0; $('#resetAll').onclick = () => { if (++confirmAll < 2) { toast('⚠️ ' + u.resetAll + '?'); return; } profiles = []; P = null; store.del('profiles'); store.del('current'); setHeader(); profileScreen(); };
  if (deferredInstall) { const b = $('#install'); b.hidden = false; b.onclick = () => { deferredInstall.prompt(); deferredInstall = null; b.hidden = true; }; }
  wire();
}

/* Lista de ítems con más fallos y botón para practicar solo eso */
function itemLabel(key) { const t = T(); const [kind, id] = key.split(/:(.+)/); const lv = U().levels;
  const find = arr => arr.find(w => w[0] === id);
  switch (kind) { case 'vowel': { const v = find(t.vowels); return [lv[0][0], (v ? v[0] + ' ' + v[2] : id)]; }
    case 'letter': { const l = find(t.letters) || t.vowels.map(v => [v[0].toLowerCase(), v[1], v[2]]).find(x => x[0] === id); return [lv[1][0], l ? l[0].toUpperCase() + ' ' + l[2] : id]; }
    case 'word': { const w = find(t.wordCats.flatMap(c => c[2])); return [lv[3][0], w ? w[0] + ' ' + w[1] : id]; }
    case 'build': { const b = t.build.find(x => x.slice(0, -1).join('') === id); return [U().games[2][0], b ? id + ' ' + b[b.length - 1] : id]; }
    case 'missing': { const m = find(t.missing); return [U().games[5][0], m ? id + ' ' + m[1] : id]; }
    case 'syl': return [U().games[27][0], id];
    case 'trace': return [lv[6][0], id];
    case 'story': { const st = t.stories[+id]; return [lv[5][0], st ? st.title + ' ' + st.cover : id]; }
    case 'num': return [U().games[9][0], id]; case 'color': return [U().games[11][0], id]; case 'math': return [U().games[id.includes('+') ? 13 : 14][0], id.replace('-', ' − ').replace('+', ' + ')]; case 'emo': return [U().games[15][0], id]; case 'time': return [U().games[id.startsWith('h') ? 16 : 17][0], id.replace(/^h/, '🕒 ')]; case 'sci': return [U().games[18][0], id]; case 'money': return [U().games[20][0], id + '¢']; case 'write': return [U().games[21][0], id]; case 'body': return [U().games[22][0], id]; case 'read': return [U().games[24][0], (T().readings[+id] || {}).title || id]; case 'mult': return [U().games[id.includes('/') ? 26 : 25][0], id]; case 'rhyme': return [U().games[6][0], id]; case 'clap': { const c = t.claps.find(x => x[0] === id); return [U().games[7][0], c ? id + ' ' + c[1] : id]; } case 'odd': return [U().games[8][0], id];
    default: return [kind, id]; } }
function weakList() { const e = (P && P.errors) || {}, h = (P && P.hits) || {};
  const rows = Object.keys(e).map(k => ({ k, e: e[k], h: h[k] || 0 })).filter(r => r.e > 0).sort((a, b) => (b.e / (b.e + b.h)) - (a.e / (a.e + a.h)) || b.e - a.e).slice(0, 10);
  if (!rows.length) return `<small style="color:var(--muted)">${esc(U().noWeak)}</small>`;
  return `<div class="weak">${rows.map(r => { const [lvl, lbl] = itemLabel(r.k); const pct = Math.round(r.e / (r.e + r.h) * 100);
    return `<div class="weakrow"><div><b>${esc(lbl)}</b><small>${esc(lvl)} · ${r.e} ${esc(U().errorsW)} · ${pct}% ${esc(U().failRate)}</small></div><button class="btn" type="button" data-practice="${esc(r.k)}">▶ ${esc(U().practice)}</button></div>`; }).join('')}</div>`; }
function practice(key) { const [kind, id] = key.split(/:(.+)/); const t = T(); Voice.stop();
  switch (kind) { case 'vowel': gameVowel(t.vowels.findIndex(v => v[0] === id)); break; case 'letter': gameFirst(id); break; case 'word': gameWord(id); break;
    case 'build': gameBuild(id); break; case 'missing': gameMissing(id); break; case 'syl': gameSyl(id); break; case 'trace': traceScreen(id); break; case 'story': storyScreen(+id); break;
    case 'rhyme': gameRhyme(); break; case 'clap': gameClap(); break; case 'odd': gameOdd(); break; case 'num': gameCount(id); break; case 'color': { if (T().shapes.find(x => x[0] === id)) gameShape(id); else gameColor(id); break; } case 'math': { if (id.includes('+')) gameAdd(); else gameSub(); break; } case 'emo': gameFeel(); break; case 'time': { if (id.startsWith('h')) gameClock(); else gameDay(); break; } case 'sci': gameAnimalSound(); break; case 'money': gameMoney(); break; case 'write': gameWrite(); break; case 'body': { if (T().weatherKinds.find(w => w[0] === id)) gameWeather(); else gameBody(); break; } case 'read': gameRead(+id); break; case 'mult': { if (id.includes('/')) gameFrac(); else gameMult(); break; } default: home(); } }

/* Pantalla de bienvenida: el primer toque desbloquea el audio del teléfono; después la paloma saluda. */
function showGate(then) { const g = $('#startGate'); if (!g) { then(); return; } g.hidden = false; $('#startName').textContent = P ? P.name : ''; $('#startText').textContent = U().tapStart;
  // Antes de hablar, esperar (máx. 1,5 s) a que cargue el índice de voces: si no, el saludo saldría con la voz del teléfono.
  g.onclick = () => { g.hidden = true; Sfx.ctx(); Sfx.sparkle(1); Promise.race([Clips.ready || Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(() => setTimeout(then, 200)); }; }
/* ---------- boot ---------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
$('#langBtn').onclick = () => { settings.lang = settings.lang === 'es' ? 'en' : 'es'; saveSettings(); Voice.stop(); setHeader(); home(); };
$('#profileBtn').onclick = () => { Voice.stop(); profileScreen(); };
$('#starsBtn').onclick = () => { Voice.stop(); parentsScreen(); };
/* Botón "atrás" del teléfono: vuelve al inicio en vez de salir de la app. Desde el inicio, no hace nada. */
let current = 'home';
const origCrumb = Diag.crumb.bind(Diag);
Diag.crumb = name => { origCrumb(name); const prev = current; current = name; try { sessionStorage.setItem('lya:last', name); } catch (e) {} if (name !== 'home' && prev === 'home') { try { history.pushState({ lya: 1 }, ''); } catch (e) {} } };
try { history.replaceState({ lya: 0 }, ''); } catch (e) {}
window.addEventListener('popstate', () => { if (current !== 'home' && current !== 'profileScreen' && current !== 'newProfileScreen') { Voice.stop(); home(); } else { try { history.pushState({ lya: 0 }, ''); } catch (e) {} } });
Diag.log('session', 'inicio ' + APP_VERSION, { lang: settings.lang });
Clips.load(); Sfxfile.load(); Voice.init();
P = profiles.find(p => p.id === currentId) || null;
setHeader();
function openScreen(name) { const map = { vowelsScreen, lettersScreen, sylScreen, wordsScreen, phrasesScreen, storiesScreen, traceScreen, gamesScreen, parentsScreen, gameVowel, gameWord, gameBuild, gameFirst, gameMemory, gameMissing, gameRhyme, gameClap, gameOdd, reviewGame, numbersScreen, gameCount, gameTapNum, colorsScreen, gameColor, gameShape, mathScreen, gameAdd, gameSub, emotionsScreen, gameFeel, timeScreen, gameClock, gameDay, scienceScreen, gameAnimalSound, gameHabitat, songsScreen, moneyScreen, writeScreen, bodyScreen, readScreen, multScreen, gameMoney, gameWrite, gameBody, gameWeather, gameRead, gameMult, gameFrac, gameSyl };
  if (name && name.startsWith('story:')) { const k = +name.slice(6); if (T().stories[k]) { storyScreen(k); return true; } }
  if (map[name]) { map[name](); return true; } return false; }
let last = null; try { last = sessionStorage.getItem('lya:last'); } catch (e) {}
if (P && last && last !== 'home' && last !== 'profileScreen' && last !== 'newProfileScreen' && last !== 'parentsPanel') {
  // Tras una recarga, volver a la misma pantalla (el gate pide el toque que desbloquea el audio y luego la abre)
  $('#guideText') ; showGate(() => { if (!openScreen(last)) home(); });
} else if (P) home(); else if (profiles.length) profileScreen(); else newProfileScreen();
if ('serviceWorker' in navigator && location.protocol !== 'file:') { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(reg => { try { reg.update(); } catch (e) {} }).catch(e => Diag.log('sw', 'registro falló: ' + e.message)));
  // Cuando llega una versión nueva, la app se recarga sola una vez (solo en el inicio, nunca a mitad de un juego).
  let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; Diag.log('sw', 'versión nueva activa'); if (current === 'home' || current === 'profileScreen') location.reload(); else window._pendingReload = true; }); }
})();
