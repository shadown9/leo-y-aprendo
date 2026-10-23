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
let settings = Object.assign({ lang: 'es', rate: 0.85, upper: false, sfx: true, voice: {} }, store.get('settings', {}));
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

/* ---------- audio: speech + sfx ---------- */
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
    return list.find(v => v.lang.toLowerCase().replace('_', '-') === want && /natural|enhanced|premium|neural/i.test(v.name))
      || list.find(v => v.lang.toLowerCase().replace('_', '-') === want)
      || list.find(v => /natural|enhanced|premium|neural/i.test(v.name)) || list[0] || null;
  },
  say(text, opts) {
    opts = opts || {};
    if (!this.supported()) { showBanner(U().noVoice); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.best();
      u.lang = T().bcp; u.rate = opts.rate || settings.rate; u.pitch = 1.1;
      if (v) u.voice = v; else if (this.voices.length && !this.warned) { this.warned = true; showBanner(U().noVoice); }
      if (opts.onboundary) u.onboundary = opts.onboundary;
      if (opts.onend) u.onend = opts.onend;
      u.onerror = () => { if (opts.onend) opts.onend(); };
      // Chrome on Android sometimes needs resume() after cancel()
      speechSynthesis.speak(u); try { speechSynthesis.resume(); } catch (e) {}
      // if nothing starts within 2.5s, assume a silent engine and tell the parent once
      if (!this.warned) setTimeout(() => { if (!speechSynthesis.speaking && !speechSynthesis.pending && !u._started) {} }, 2500);
      u.onstart = () => { u._started = true; };
    } catch (e) { showBanner(U().noVoice); }
  },
  stop() { try { speechSynthesis.cancel(); } catch (e) {} },
};
const Sfx = {
  _ctx: null,
  ctx() { if (!this._ctx) { try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this._ctx && this._ctx.state === 'suspended') { try { this._ctx.resume(); } catch (e) {} } return this._ctx; },
  tone(f, t, dur, type, gain) { const c = this.ctx(); if (!c || !settings.sfx) return; const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.value = 0; o.connect(g); g.connect(c.destination); const now = c.currentTime + t; g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(gain || .18, now + .01); g.gain.exponentialRampToValueAtTime(.001, now + dur); o.start(now); o.stop(now + dur + .02); },
  good() { this.tone(660, 0, .15); this.tone(880, .12, .18); this.tone(1320, .26, .3); },
  bad() { this.tone(220, 0, .18, 'square', .08); this.tone(180, .16, .22, 'square', .08); },
  tap() { this.tone(520, 0, .08, 'triangle', .1); },
  star() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * .09, .25)); },
};
function showBanner(text) { const b = $('#audioBanner'); $('#audioBannerText').textContent = text; b.hidden = false; }
$('#audioBannerClose').onclick = () => { $('#audioBanner').hidden = true; };
function toast(text, ms) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2200); }
function confetti() { const c = $('#confetti'); const cols = ['#ff6b6b', '#ffb400', '#2ec4b6', '#5b8def', '#b56fe3'];
  for (let i = 0; i < 40; i++) { const s = document.createElement('i'); s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % 5]; s.style.animationDelay = (Math.random() * .4) + 's'; c.appendChild(s); setTimeout(() => s.remove(), 1800); } }
const cheer = () => U().good[Math.floor(Math.random() * U().good.length)];

/* ---------- progress ---------- */
function stars() { return P ? P.stars : 0; }
function award(n, key) {
  if (!P) return;
  if (key) { if (P.done[key]) return; P.done[key] = true; }
  P.stars += n; saveProfiles(); $('#starCount').textContent = P.stars; Sfx.star(); checkBadges();
}
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
function setHeader() { $('#langBtn').textContent = '🌎 ' + T().toggle; $('#starCount').textContent = stars(); $('#profileBtn').textContent = P ? P.avatar : '🦉'; document.documentElement.lang = settings.lang; }
function levelStars(i) {
  if (!P) return 0; const d = P.done, L = settings.lang, pre = ['vowel:', 'letter:', 'syl:', 'word:', 'phrase:', 'story:', 'trace:', 'game:'][i];
  return Object.keys(d).filter(k => k.startsWith(pre) && (pre === 'trace:' || k.includes(':' + L + ':'))).length;
}

/* ---------- profiles ---------- */
function profileScreen() {
  const u = U();
  main.innerHTML = `<section class="screen">
    <div class="mascot"><span class="owl">🦉</span><p>${esc(u.welcome)}</p></div>
    <div class="profiles">${profiles.map(p => `<button class="profile" type="button" data-id="${p.id}"><span class="av">${p.avatar}</span>${esc(p.name)}<small>⭐ ${p.stars}</small></button>`).join('')}
      <button class="profile add" type="button" id="addProfile"><span class="av">➕</span>${esc(u.newProfile)}</button></div>
  </section>`;
  $$('[data-id]', main).forEach(b => b.onclick = () => { Sfx.tap(); selectProfile(b.dataset.id); });
  $('#addProfile').onclick = newProfileScreen;
}
function newProfileScreen() {
  const u = U(); let av = DATA.avatars[Math.floor(Math.random() * DATA.avatars.length)];
  main.innerHTML = `<section class="screen">${topbar(u.newProfile)}
    <div class="stage">
      <input type="text" id="pname" maxlength="14" placeholder="${esc(u.yourName)}" autocomplete="off">
      <p class="prompt">${esc(u.pickAvatar)}</p>
      <div class="avgrid" id="avgrid">${DATA.avatars.map(a => `<button type="button" data-av="${a}" class="${a === av ? 'on' : ''}">${a}</button>`).join('')}</div>
      <button class="btn big" id="go" type="button">${esc(u.start)}</button>
    </div></section>`;
  $$('[data-av]', main).forEach(b => b.onclick = () => { av = b.dataset.av; $$('[data-av]', main).forEach(x => x.classList.toggle('on', x === b)); Sfx.tap(); });
  $('#go').onclick = () => { const name = $('#pname').value.trim() || (settings.lang === 'es' ? 'Amigo' : 'Friend');
    const p = { id: String(Date.now()), name, avatar: av, stars: 0, done: {}, badges: {}, games: 0 }; profiles.push(p); saveProfiles(); selectProfile(p.id); };
  $$('[data-home]', main).forEach(b => b.onclick = profiles.length ? profileScreen : newProfileScreen);
  setTimeout(() => $('#pname').focus(), 50);
}
function selectProfile(id) { P = profiles.find(p => p.id === id) || null; currentId = id; store.set('current', id); setHeader(); home(); }

/* ---------- home ---------- */
function home() {
  if (!P) { profileScreen(); return; }
  Voice.stop(); const t = T(), u = U();
  main.innerHTML = `<section class="screen">
    <div class="mascot"><span class="owl">🦉</span><p>${esc(fmt(u.hello, { name: P.name }))}</p></div>
    <div class="home">${u.levels.map((d, i) => `<button class="door d${i + 1}" type="button" data-go="${i}"><span class="lvstars">⭐ ${levelStars(i)}</span><span class="big">${d[2]}</span>${esc(d[0])}<small>${esc(d[1])}</small></button>`).join('')}</div>
  </section>`;
  $$('[data-go]', main).forEach(b => b.onclick = () => { Sfx.tap(); [vowelsScreen, lettersScreen, sylScreen, wordsScreen, phrasesScreen, storiesScreen, traceScreen, gamesScreen][+b.dataset.go](); });
}

/* ---------- 1. vowels ---------- */
function vowelsScreen() {
  const t = T(), u = U(); let i = 0; const L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.vowelsT)}
    <div class="chips">${t.vowels.map((v, k) => `<button class="chip" type="button" data-k="${k}">${v[0]} ${v[0].toLowerCase()}</button>`).join('')}</div>
    <div class="stage" id="stage"></div>
    <div class="row"><button class="btn big" id="listen" type="button">🔊 ${esc(u.listen)}</button><button class="btn alt" id="slow" type="button">🐢 ${esc(u.slow)}</button><button class="btn alt" id="trace" type="button">✏️</button><button class="btn" id="next" type="button">${esc(u.next)} ▶</button></div>
  </section>`;
  function show(speak) { const v = t.vowels[i];
    $$('.chip', main).forEach((c, k) => c.classList.toggle('on', k === i));
    const w = v[1]; const hi = esc(caseIt(w)).replace(new RegExp(caseIt(v[0].toLowerCase()), 'gi'), m => `<b>${m}</b>`);
    $('#stage').innerHTML = `<div class="letter" style="color:${vcolor(v[0])}">${v[0]} ${v[0].toLowerCase()}</div><div class="pic">${v[2]}</div><div class="word">${hi}</div><div class="sub">${v[0].toLowerCase()} · ${esc(w)}</div>`;
    if (speak !== false) Voice.say(v[0] + '. ' + v[0] + '. ' + w); award(1, 'vowel:' + L + ':' + v[0]); }
  $$('.chip', main).forEach(c => c.onclick = () => { i = +c.dataset.k; show(); });
  $('#listen').onclick = () => { const v = t.vowels[i]; Voice.say(v[0] + '. ' + v[1]); };
  $('#slow').onclick = () => { const v = t.vowels[i]; Voice.say(v[0] + '. ' + v[1], { rate: .55 }); };
  $('#trace').onclick = () => traceScreen(t.vowels[i][0]);
  $('#next').onclick = () => { i = (i + 1) % 5; show(); };
  wire(); show();
}

/* ---------- 2. letters ---------- */
function lettersScreen() {
  const t = T(), u = U(), L = settings.lang; const all = t.vowels.map(v => [v[0].toLowerCase(), v[1], v[2], v[0]]).concat(t.letters).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  main.innerHTML = `<section class="screen">${topbar(u.lettersT)}
    <div class="grid" id="abc">${all.map(l => `<button class="tile ${'AEIOU'.includes(l[0].toUpperCase()) ? 'v' + l[0].toUpperCase() : ''} ${has('letter:' + L + ':' + l[0]) ? 'done' : ''}" type="button" data-l="${l[0]}">${caseIt(l[0])}</button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div>
  </section>`;
  $$('[data-l]', main).forEach(b => b.onclick = () => { const l = all.find(x => x[0] === b.dataset.l); const st = $('#stage'); st.hidden = false;
    const w = l[1]; const hi = esc(caseIt(w)).replace(new RegExp('^' + caseIt(l[0]), 'i'), m => `<b>${m}</b>`);
    st.innerHTML = `<div class="letter" ${'AEIOU'.includes(l[0].toUpperCase()) ? `style="color:${vcolor(l[0])}"` : ''}>${l[0].toUpperCase()} ${l[0]}</div><div class="pic">${l[2]}</div><div class="word">${hi}</div>
      <div class="row"><button class="btn big" id="say" type="button">🔊</button><button class="btn alt" id="tr" type="button">✏️</button></div>`;
    const phrase = settings.lang === 'es' ? `${l[3]}. ${w}. ${w} ${u.startsWith} ${l[3]}.` : `${l[0]}. ${w}. ${w} ${u.startsWith} ${l[0]}.`;
    Voice.say(phrase); award(1, 'letter:' + L + ':' + l[0]); b.classList.add('done');
    $('#say').onclick = () => Voice.say(phrase); $('#tr').onclick = () => traceScreen(l[0].toUpperCase());
    st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  wire();
}

/* ---------- 3. syllables ---------- */
function sylScreen() {
  const t = T(), u = U(), L = settings.lang; let c = t.cons[0]; const vs = ['a', 'e', 'i', 'o', 'u'];
  main.innerHTML = `<section class="screen">${topbar(u.sylT)}
    <p class="prompt">${esc(u.sylPrompt)}</p>
    <div class="chips" id="cons">${t.cons.map(x => `<button class="chip" type="button" data-c="${x}">${caseIt(x)}</button>`).join('')}</div>
    <div class="grid" id="syl"></div>
    <div class="stage" id="stage" hidden></div>
  </section>`;
  function render() { $$('#cons .chip', main).forEach(b => b.classList.toggle('on', b.dataset.c === c));
    $('#syl').innerHTML = vs.map((v, k) => `<button class="tile ${cls[k]}" type="button" data-s="${u.sylOf(c, v)}">${caseIt(u.sylOf(c, v))}</button>`).join('');
    $$('[data-s]', main).forEach(b => b.onclick = () => { Voice.say(b.dataset.s, { rate: .7 }); award(1, 'syl:' + L + ':' + b.dataset.s);
      // show a word that contains this syllable, when one exists
      const s = b.dataset.s; const w = t.wordCats.flatMap(cat => cat[2]).find(x => x[0].startsWith(s)); const st = $('#stage');
      if (w) { st.hidden = false; st.innerHTML = `<div class="pic">${w[1]}</div><div class="word">${esc(caseIt(w[0])).replace(new RegExp('^' + caseIt(s), 'i'), m => `<b>${m}</b>`)}</div>`; setTimeout(() => Voice.say(s + '. ' + w[0]), 900); } else st.hidden = true; }); }
  $$('#cons .chip', main).forEach(b => b.onclick = () => { c = b.dataset.c; Voice.say(settings.lang === 'es' ? c : c, { rate: .7 }); render(); });
  wire(); render();
}

/* ---------- 4. words ---------- */
function wordsScreen() {
  const t = T(), u = U(), L = settings.lang; let cat = 0;
  main.innerHTML = `<section class="screen">${topbar(u.wordsT)}
    <div class="chips" id="cats">${t.wordCats.map((c, k) => `<button class="chip" type="button" data-k="${k}">${c[1]} ${esc(c[0])}</button>`).join('')}</div>
    <div class="stage" id="stage" hidden></div>
    <div class="grid wide" id="words"></div>
  </section>`;
  function render() { $$('#cats .chip', main).forEach((b, k) => b.classList.toggle('on', k === cat));
    $('#words').innerHTML = t.wordCats[cat][2].map(w => `<button class="tile ${has('word:' + L + ':' + w[0]) ? 'done' : ''}" type="button" data-w="${esc(w[0])}"><span class="pic">${w[1]}</span><span class="lbl">${esc(caseIt(w[0]))}</span></button>`).join('');
    $$('[data-w]', main).forEach(b => b.onclick = () => showWord(b.dataset.w, b)); }
  function showWord(word, b) { const w = t.wordCats[cat][2].find(x => x[0] === word); const syl = (t.syllabify[word] || word).split('-'); const st = $('#stage'); st.hidden = false;
    st.innerHTML = `<div class="pic">${w[1]}</div><div class="word" id="wd">${syl.map((s, i) => `<span data-i="${i}">${esc(caseIt(s))}</span>`).join('<span style="color:var(--muted)">·</span>')}</div>
      <div class="row"><button class="btn big" id="say" type="button">🔊 ${esc(u.listen)}</button><button class="btn alt" id="bysyl" type="button">🧩 ${esc(u.bySyl)}</button></div>`;
    Voice.say(word); award(1, 'word:' + L + ':' + word); b.classList.add('done');
    $('#say').onclick = () => Voice.say(word);
    $('#bysyl').onclick = () => { const spans = $$('#wd span[data-i]'); let i = 0; const step = () => { spans.forEach(s => s.style.color = ''); if (i < syl.length) { spans[i].style.color = 'var(--a)'; Voice.say(syl[i].replace(/-/g, ''), { rate: .6, onend: () => { i++; setTimeout(step, 150); } }); } else Voice.say(word); }; step(); };
    st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  $$('#cats .chip', main).forEach(b => b.onclick = () => { cat = +b.dataset.k; Sfx.tap(); render(); });
  wire(); render();
}

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
function phrasesScreen() {
  const t = T(), u = U(), L = settings.lang; let i = 0;
  main.innerHTML = `<section class="screen">${topbar(u.phrasesT)}
    <p class="prompt">${esc(u.phrasePrompt)}</p>
    <div class="stage" id="stage"></div>
    <div class="row"><button class="btn alt" id="prev" type="button">◀</button><button class="btn big" id="read" type="button">🔊 ${esc(u.readAll)}</button><button class="btn" id="next" type="button">▶</button></div>
    <div class="pager" id="pager">${t.phrases.map((p, k) => `<i data-k="${k}"></i>`).join('')}</div>
  </section>`;
  function show() { const p = t.phrases[i]; const words = p[0].split(' ');
    $('#stage').innerHTML = `<div class="pagepic">${p[1]}</div><div class="sentence" id="sent">${words.map(w => `<button class="w" type="button" data-w="${esc(w.replace(/[.,!?—"]/g, ''))}">${esc(caseIt(w))}</button>`).join('')}</div>`;
    $$('#pager i').forEach((d, k) => d.classList.toggle('on', k === i));
    $$('.w', main).forEach(b => b.onclick = () => { $$('.w', main).forEach(x => x.classList.remove('hl')); b.classList.add('hl'); Voice.say(b.dataset.w, { rate: .75, onend: () => b.classList.remove('hl') }); });
    read(); }
  function read() { readAlong($('#sent'), t.phrases[i][0], () => award(1, 'phrase:' + L + ':' + i)); }
  $('#read').onclick = read; $('#next').onclick = () => { i = (i + 1) % t.phrases.length; show(); }; $('#prev').onclick = () => { i = (i - 1 + t.phrases.length) % t.phrases.length; show(); };
  wire(); show();
}

/* ---------- 6. stories ---------- */
function storiesScreen() {
  const t = T(), u = U(), L = settings.lang;
  main.innerHTML = `<section class="screen">${topbar(u.storiesT)}
    <div class="grid wide">${t.stories.map((s, k) => `<button class="tile storycard ${has('story:' + L + ':' + k) ? 'done' : ''}" type="button" data-k="${k}"><span class="pic">${s.cover}</span><span class="lbl">${esc(s.title)}</span></button>`).join('')}</div>
  </section>`;
  $$('[data-k]', main).forEach(b => b.onclick = () => storyScreen(+b.dataset.k));
  wire();
}
function storyScreen(k) {
  const t = T(), u = U(), L = settings.lang; const s = t.stories[k]; let pg = 0; const n = s.pages.length;
  main.innerHTML = `<section class="screen">${topbar(s.title)}
    <div class="progress"><i id="bar"></i></div>
    <div class="stage" id="stage"></div>
    <div class="row"><button class="btn alt" id="prev" type="button">◀</button><button class="btn big" id="read" type="button">▶ 🔊</button><button class="btn" id="next" type="button">${esc(u.next)} ▶</button></div>
    <div class="feedback" id="fb"></div>
  </section>`;
  function show() { $('#bar').style.width = (pg / n * 100) + '%';
    if (pg < n) { const p = s.pages[pg]; const words = p[0].split(' ');
      $('#stage').innerHTML = `<div class="pagepic">${p[1]}</div><div class="sentence" id="sent">${words.map(w => `<button class="w" type="button" data-w="${esc(w.replace(/[.,!?—"¡¿]/g, ''))}">${esc(caseIt(w))}</button>`).join('')}</div><div class="sub">${pg + 1} / ${n}</div>`;
      $$('.w', main).forEach(b => b.onclick = () => { Voice.say(b.dataset.w, { rate: .75 }); });
      $('#next').textContent = u.next + ' ▶'; read(); }
    else quiz(); }
  function read() { if (pg < n) readAlong($('#sent'), s.pages[pg][0]); }
  function quiz() { const q = s.q; const opts = q[1].map((o, i) => [o, i]);
    $('#stage').innerHTML = `<div class="sub">${esc(u.question)}</div><div class="word" style="font-size:1.5rem;letter-spacing:0">${esc(q[0])}</div>
      <div class="grid" style="width:100%">${shuffle(opts).map(o => `<button class="tile" type="button" data-i="${o[1]}"><span class="pic">${o[0][1]}</span><span class="lbl">${esc(o[0][0])}</span></button>`).join('')}</div>`;
    Voice.say(q[0]); $('#next').textContent = u.home;
    $$('[data-i]', main).forEach(b => b.onclick = () => { if (+b.dataset.i === q[2]) { b.classList.add('good'); Sfx.good(); confetti(); $('#fb').textContent = u.theEnd; Voice.say(cheer()); award(3, 'story:' + L + ':' + k); $('#next').onclick = home; } else { b.classList.add('bad'); Sfx.bad(); $('#fb').textContent = u.bad; setTimeout(() => b.classList.remove('bad'), 400); } }); }
  $('#read').onclick = read; $('#next').onclick = () => { if (pg < n) { pg++; show(); } else home(); }; $('#prev').onclick = () => { if (pg > 0) { pg--; show(); } };
  wire(); show();
}

/* ---------- 7. trace ---------- */
function traceScreen(startLetter) {
  const t = T(), u = U(); const letters = t.vowels.map(v => v[0]).concat(t.letters.map(l => l[0].toUpperCase())).sort((a, b) => a.localeCompare(b, 'es'));
  let L = startLetter || letters[0], upper = true;
  main.innerHTML = `<section class="screen">${topbar(u.traceT)}
    <div class="chips" style="overflow-x:auto;flex-wrap:nowrap;justify-content:flex-start;padding:4px 2px" id="lchips">${letters.map(l => `<button class="chip ${has('trace:' + l) ? 'on' : ''}" type="button" data-l="${l}">${l}</button>`).join('')}</div>
    <div class="tracewrap"><p class="prompt">${esc(u.tracePrompt)}</p>
      <div class="row"><button class="chip" id="caseU" type="button">${esc(u.upper)}</button><button class="chip" id="caseL" type="button">${esc(u.lower)}</button></div>
      <canvas class="trace" id="cv" width="600" height="600"></canvas>
      <div class="row"><button class="btn alt" id="clear" type="button">🧽 ${esc(u.clear)}</button><button class="btn big" id="say" type="button">🔊</button><button class="btn good" id="done" type="button">✅ ${esc(u.ready)}</button></div>
      <div class="feedback" id="fb"></div></div>
  </section>`;
  const cv = $('#cv'), ctx = cv.getContext('2d'); const guide = document.createElement('canvas'); guide.width = guide.height = 600; const gctx = guide.getContext('2d');
  const colors = ['#ff6b6b', '#ffb400', '#2ec4b6', '#5b8def', '#b56fe3']; let strokeColor = colors[0];
  function draw() { const ch = upper ? L : L.toLowerCase();
    $$('#lchips .chip').forEach(b => b.classList.toggle('on', b.dataset.l === L)); $('#caseU').classList.toggle('on', upper); $('#caseL').classList.toggle('on', !upper);
    gctx.clearRect(0, 0, 600, 600); gctx.font = '700 420px Fredoka, Nunito, Arial, sans-serif'; gctx.textAlign = 'center'; gctx.textBaseline = 'middle'; gctx.fillStyle = '#000'; gctx.fillText(ch, 300, 320);
    ctx.clearRect(0, 0, 600, 600); ctx.save(); ctx.globalAlpha = .18; ctx.drawImage(guide, 0, 0); ctx.restore();
    // dashed outline so the child sees the path
    ctx.save(); ctx.globalAlpha = .5; ctx.font = gctx.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.strokeStyle = '#7a6f8a'; ctx.strokeText(ch, 300, 320); ctx.restore();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 34; $('#fb').textContent = ''; }
  let drawing = false, last = null; const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 600 / r.width, y: (e.clientY - r.top) * 600 / r.height }; };
  cv.onpointerdown = e => { drawing = true; last = pt(e); strokeColor = colors[Math.floor(Math.random() * 5)]; cv.setPointerCapture(e.pointerId); ctx.strokeStyle = strokeColor; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(last.x + .1, last.y); ctx.stroke(); };
  cv.onpointermove = e => { if (!drawing) return; const p = pt(e); ctx.strokeStyle = strokeColor; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; };
  cv.onpointerup = cv.onpointercancel = () => { drawing = false; };
  function coverage() { const g = gctx.getImageData(0, 0, 600, 600).data, d = ctx.getImageData(0, 0, 600, 600).data; let tot = 0, hit = 0, outside = 0, inkTotal = 0;
    for (let i = 3; i < g.length; i += 4 * 3) { const ink = d[i] > 200 && !(d[i - 3] === 0 && d[i - 2] === 0 && d[i - 1] === 0); if (ink) inkTotal++;
      if (g[i] > 128) { tot++; if (ink) hit++; } else if (ink) outside++; }
    return { cov: tot ? hit / tot : 0, outside: inkTotal ? outside / inkTotal : 0 }; }
  $('#done').onclick = () => { const r = coverage();
    if (r.cov > .35 && r.outside < .6) { $('#fb').textContent = cheer(); Sfx.good(); confetti(); Voice.say(L + '. ' + cheer()); award(2, 'trace:' + L); $$('#lchips .chip').find(b => b.dataset.l === L); }
    else { $('#fb').textContent = u.bad; Sfx.bad(); } };
  $('#clear').onclick = () => { Sfx.tap(); draw(); }; $('#say').onclick = () => Voice.say(L);
  $('#caseU').onclick = () => { upper = true; draw(); }; $('#caseL').onclick = () => { upper = false; draw(); };
  $$('#lchips .chip').forEach(b => b.onclick = () => { L = b.dataset.l; Voice.say(L); draw(); });
  wire(); draw(); document.fonts && document.fonts.ready.then(draw);
}

/* ---------- 8. games ---------- */
function gamesScreen() {
  const u = U();
  main.innerHTML = `<section class="screen">${topbar(u.gamesT)}
    <div class="home">${u.games.map((g, i) => `<button class="door d${(i % 8) + 1}" type="button" data-g="${i}"><span class="big">${g[2]}</span>${esc(g[0])}<small>${esc(g[1])}</small></button>`).join('')}</div></section>`;
  $$('[data-g]', main).forEach(b => b.onclick = () => { Sfx.tap(); [gameVowel, gameWord, gameBuild, gameFirst, gameMemory, gameMissing][+b.dataset.g](); });
  wire();
}
function roundShell(title, n) {
  main.innerHTML = `<section class="screen">${topbar(title)}<div class="progress"><i id="bar"></i></div><div id="area"></div><div class="feedback" id="fb"></div></section>`; wire();
  return { area: $('#area'), fb: $('#fb'), bar: $('#bar'), n };
}
function finish(sh, won, replay) {
  sh.bar.style.width = '100%'; P.games = (P.games || 0) + 1; saveProfiles(); mark('game:' + settings.lang + ':' + (P.games)); checkBadges();
  sh.area.innerHTML = `<div class="stage"><div class="pic">🏆</div><div class="word" style="font-size:1.4rem;letter-spacing:0">${esc(fmt(U().done, { n: won }))}</div>
    <div class="row"><button class="btn big" id="again" type="button">🔁 ${esc(U().again)}</button><button class="btn alt" id="hm" type="button">🏠 ${esc(U().home)}</button></div></div>`;
  sh.fb.textContent = ''; confetti(); Voice.say(fmt(U().done, { n: won })); $('#hm').onclick = home; $('#again').onclick = replay;
}
function correct(sh, b, n, after) { b.classList.add('good'); Sfx.good(); sh.fb.textContent = cheer(); if (n) award(n); confetti(); setTimeout(after, 1300); }
function wrong(sh, b, retry) { b.classList.add('bad'); Sfx.bad(); sh.fb.textContent = U().bad; setTimeout(() => b.classList.remove('bad'), 400); if (retry) setTimeout(retry, 500); }
function gameVowel() {
  const t = T(), u = U(); const sh = roundShell(u.games[0][0], 6); let r = 0, won = 0;
  function round() { if (r === sh.n) { finish(sh, won, gameVowel); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const k = Math.floor(Math.random() * 5), v = t.vowels[k]; let tries = 0;
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big" id="hear" type="button">🔊</button></div><p class="prompt">${esc(u.hear)}</p>
      <div class="grid">${t.vowels.map((x, i) => `<button class="tile ${cls[i]}" type="button" data-i="${i}">${caseIt(x[0].toLowerCase())}</button>`).join('')}</div>`;
    const hear = () => Voice.say(v[0] + '. ' + v[0] + '. ' + v[1]); $('#hear').onclick = hear; setTimeout(hear, 300);
    $$('[data-i]', sh.area).forEach(b => b.onclick = () => { if (+b.dataset.i === k) { Voice.say(cheer()); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }); if (tries === 0) won++; } else { tries++; wrong(sh, b, hear); } }); }
  round();
}
function gameWord() {
  const t = T(), u = U(); const all = t.wordCats.flatMap(c => c[2]); const sh = roundShell(u.games[1][0], 6); let r = 0, won = 0;
  function round() { if (r === sh.n) { finish(sh, won, gameWord); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const opts = pick(all, 3), ans = opts[Math.floor(Math.random() * 3)]; let tries = 0;
    sh.area.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn big" id="hear" type="button">🔊</button></div><p class="prompt">${esc(u.hear)}</p>
      <div class="grid wide">${opts.map(w => `<button class="tile" type="button" data-w="${esc(w[0])}"><span class="pic">${w[1]}</span></button>`).join('')}</div>`;
    const hear = () => Voice.say(ans[0]); $('#hear').onclick = hear; setTimeout(hear, 300);
    $$('[data-w]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.w === ans[0]) { b.innerHTML += `<span class="lbl">${esc(caseIt(ans[0]))}</span>`; Voice.say(ans[0] + '. ' + cheer()); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }); if (tries === 0) won++; } else { tries++; wrong(sh, b, hear); } }); }
  round();
}
function gameBuild() {
  const t = T(), u = U(); const sh = roundShell(u.games[2][0], 6); let r = 0, won = 0; const items = pick(t.build, 6);
  function round() { if (r === sh.n) { finish(sh, won, gameBuild); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const it = items[r], parts = it.slice(0, -1), pic = it[it.length - 1], word = parts.join(''); let placed = [], bad = false;
    let order = shuffle(parts.map((p, i) => i)); if (order.join() === parts.map((p, i) => i).join()) order.reverse();
    sh.area.innerHTML = `<div class="stage"><div class="pic">${pic}</div><button class="btn" id="hear" type="button">🔊 ${esc(u.listen)}</button>
      <div class="slots">${parts.map(() => `<div class="slot"></div>`).join('')}</div>
      <div class="pieces">${order.map(i => `<button class="piece" type="button" data-i="${i}">${esc(caseIt(parts[i]))}</button>`).join('')}</div></div>`;
    const hear = () => Voice.say(settings.lang === 'es' ? parts.join(', ') + '. ' + word : word, { rate: .75 }); $('#hear').onclick = hear; setTimeout(hear, 300);
    const slots = $$('.slot', sh.area);
    $$('.piece', sh.area).forEach(b => b.onclick = () => { const i = +b.dataset.i;
      if (i === placed.length) { b.disabled = true; slots[i].textContent = caseIt(parts[i]); slots[i].classList.add('full'); placed.push(i); Voice.say(parts[i], { rate: .7 }); Sfx.tap();
        if (placed.length === parts.length) { sh.fb.textContent = cheer(); Sfx.good(); setTimeout(() => Voice.say(word + '. ' + cheer()), 400); if (!bad) { award(2); won += 2; } confetti(); setTimeout(() => { r++; round(); }, 1600); } }
      else { bad = true; wrong(sh, b); } }); }
  round();
}
function gameFirst() {
  const t = T(), u = U(); const all = t.letters.concat(t.vowels.map(v => [v[0].toLowerCase(), v[1], v[2], v[0]])); const sh = roundShell(u.games[3][0], 6); let r = 0, won = 0;
  function round() { if (r === sh.n) { finish(sh, won, gameFirst); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const ans = all[Math.floor(Math.random() * all.length)]; let tries = 0;
    const opts = shuffle([ans].concat(pick(all.filter(x => x[0] !== ans[0]), 2)));
    sh.area.innerHTML = `<div class="stage"><div class="pic">${ans[2]}</div><div class="word">${esc(caseIt(ans[1]))}</div><button class="btn" id="hear" type="button">🔊</button></div><p class="prompt">${esc(u.games[3][0])}</p>
      <div class="grid">${opts.map(o => `<button class="tile" type="button" data-l="${o[0]}">${caseIt(o[0])}</button>`).join('')}</div>`;
    const hear = () => Voice.say(ans[1]); $('#hear').onclick = hear; setTimeout(hear, 300);
    $$('[data-l]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.l === ans[0]) { Voice.say(ans[1] + '. ' + cheer()); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }); if (tries === 0) won++; } else { tries++; wrong(sh, b, hear); } }); }
  round();
}
function gameMemory() {
  const t = T(), u = U(); const all = t.wordCats.flatMap(c => c[2]).filter(w => w[0].length <= 6); const sh = roundShell(u.games[4][0], 1); let won = 0;
  const pairs = pick(all, 4); const cards = shuffle(pairs.flatMap((w, i) => [{ k: i, kind: 'pic', v: w[1], w: w[0] }, { k: i, kind: 'txt', v: caseIt(w[0]), w: w[0] }]));
  let open = [], matched = 0, lock = false;
  sh.area.innerHTML = `<p class="prompt">${esc(u.games[4][1])}</p><div class="memo">${cards.map((c, i) => `<button class="tile face" type="button" data-i="${i}">❔</button>`).join('')}</div>`;
  $$('[data-i]', sh.area).forEach(b => b.onclick = () => { const i = +b.dataset.i, c = cards[i]; if (lock || open.includes(i) || b.classList.contains('matched')) return;
    b.classList.remove('face'); b.innerHTML = c.kind === 'pic' ? `<span class="pic">${c.v}</span>` : `<span class="lbl">${esc(c.v)}</span>`; Voice.say(c.w, { rate: .8 }); open.push(i);
    if (open.length === 2) { lock = true; const [a, bI] = open; const A = $$('[data-i]', sh.area)[a], B = $$('[data-i]', sh.area)[bI];
      if (cards[a].k === cards[bI].k) { setTimeout(() => { A.classList.add('matched'); B.classList.add('matched'); Sfx.good(); matched++; award(1); won++; open = []; lock = false; sh.bar.style.width = (matched / 4 * 100) + '%'; if (matched === 4) setTimeout(() => finish(sh, won, gameMemory), 600); }, 400); }
      else setTimeout(() => { [A, B].forEach(x => { x.classList.add('face'); x.innerHTML = '❔'; }); Sfx.bad(); open = []; lock = false; }, 900); } });
}
function gameMissing() {
  const t = T(), u = U(); const sh = roundShell(u.games[5][0], 6); let r = 0, won = 0; const items = pick(t.missing, 6);
  function round() { if (r === sh.n) { finish(sh, won, gameMissing); return; }
    sh.bar.style.width = (r / sh.n * 100) + '%'; const [word, pic, idx] = items[r]; const ans = word[idx]; let tries = 0;
    const shown = word.split('').map((ch, i) => i === idx ? `<span id="gap" style="color:var(--a);border-bottom:4px solid var(--a)">&nbsp;&nbsp;</span>` : esc(caseIt(ch))).join('');
    sh.area.innerHTML = `<div class="stage"><div class="pic">${pic}</div><div class="word" id="wd">${shown}</div><button class="btn" id="hear" type="button">🔊</button></div>
      <div class="grid">${['a', 'e', 'i', 'o', 'u'].map((v, i) => `<button class="tile ${cls[i]}" type="button" data-v="${v}">${caseIt(v)}</button>`).join('')}</div>`;
    const hear = () => Voice.say(word); $('#hear').onclick = hear; setTimeout(hear, 300);
    $$('[data-v]', sh.area).forEach(b => b.onclick = () => { if (b.dataset.v === ans) { $('#gap').textContent = caseIt(ans); $('#gap').style.borderBottom = 'none'; Voice.say(word + '. ' + cheer()); correct(sh, b, tries === 0 ? 1 : 0, () => { r++; round(); }); if (tries === 0) won++; } else { tries++; wrong(sh, b, hear); } }); }
  round();
}

/* ---------- parents ---------- */
function parentsScreen() {
  const u = U(); const a = 3 + Math.floor(Math.random() * 6), b = 2 + Math.floor(Math.random() * 7);
  main.innerHTML = `<section class="screen">${topbar(u.parentsT)}<div class="stage"><div class="word" style="font-size:1.4rem;letter-spacing:0">${esc(fmt(u.parentsGate, { a, b }))}</div>
    <input type="text" inputmode="numeric" id="gate" maxlength="3" autocomplete="off"><button class="btn" id="ok" type="button">OK</button><div class="feedback" id="fb"></div></div></section>`;
  const check = () => { if (+$('#gate').value === a * b) parentsPanel(); else { $('#fb').textContent = u.wrongGate; $('#fb').style.color = 'var(--bad)'; } };
  $('#ok').onclick = check; $('#gate').onkeydown = e => { if (e.key === 'Enter') check(); }; wire(); setTimeout(() => $('#gate').focus(), 50);
}
function parentsPanel() {
  const t = T(), u = U(); const L = settings.lang; const lv = u.levels;
  const totals = [5, t.letters.length + 5, t.cons.length * 5, t.wordCats.reduce((s, c) => s + c[2].length, 0), t.phrases.length, t.stories.length, 27, 10];
  const vs = Voice.voices.filter(v => (v.lang || '').toLowerCase().startsWith(T().code));
  main.innerHTML = `<section class="screen">${topbar(u.parentsT)}
    <div class="card"><h3>${esc(u.progress)} · ${P.avatar} ${esc(P.name)} · ⭐ ${P.stars}</h3>
      <div class="bars">${lv.map((l, i) => { const n = Math.min(levelStars(i), totals[i]); return `<div class="bar"><span>${l[2]} ${esc(l[0])}</span><div class="progress"><i style="width:${n / totals[i] * 100}%"></i></div><em>${n}/${totals[i]}</em></div>`; }).join('')}</div></div>
    <div class="card"><h3>${esc(u.badges)}</h3><div class="badgerow">${BADGES.map(b => `<span class="badge ${P.badges && P.badges[b] ? 'on' : ''}">🏅 ${esc(u.badgeNames[b])}</span>`).join('')}</div></div>
    <div class="card"><h3>${esc(u.settings)}</h3>
      <div class="setting"><label for="voiceSel">${esc(u.voice)} (${T().name})</label><select id="voiceSel"><option value="">Auto</option>${vs.map(v => `<option value="${esc(v.voiceURI)}" ${settings.voice[L] === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>${vs.length ? '' : `<small style="color:var(--bad)">${esc(u.noVoice)}</small>`}</div>
      <div class="setting"><label for="rate">${esc(u.speed)}: <span id="rateV">${settings.rate}</span></label><input type="range" id="rate" min="0.5" max="1.2" step="0.05" value="${settings.rate}"></div>
      <div class="setting"><label>${esc(u.letterCase)}</label><div class="row"><button class="chip ${settings.upper ? 'on' : ''}" id="cU" type="button">ABC</button><button class="chip ${settings.upper ? '' : 'on'}" id="cL" type="button">abc</button></div></div>
      <div class="setting"><label>${esc(u.sfx)}</label><div class="row"><button class="chip ${settings.sfx ? 'on' : ''}" id="sfxOn" type="button">🔔 On</button><button class="chip ${settings.sfx ? '' : 'on'}" id="sfxOff" type="button">🔕 Off</button></div></div>
      <div class="row"><button class="btn alt" id="testVoice" type="button">🔊 ${esc(u.listen)}</button><button class="btn alt" id="install" type="button" hidden>📲 ${esc(u.install)}</button></div></div>
    <div class="card"><h3>${esc(u.profiles)}</h3><div class="row" style="justify-content:flex-start"><button class="btn alt" id="switch" type="button">👥 ${esc(u.profiles)}</button><button class="btn alt" id="reset" type="button">🧹 ${esc(fmt(u.reset, { name: P.name }))}</button><button class="btn" style="background:var(--bad)" id="resetAll" type="button">${esc(u.resetAll)}</button></div>
      <small style="color:var(--muted)">${esc(u.about)}</small></div>
  </section>`;
  $('#voiceSel').onchange = e => { settings.voice[L] = e.target.value; saveSettings(); Voice.say(t.vowels[0][1]); };
  $('#rate').oninput = e => { settings.rate = +e.target.value; $('#rateV').textContent = settings.rate; saveSettings(); };
  $('#rate').onchange = () => Voice.say(t.phrases[0][0]);
  $('#cU').onclick = () => { settings.upper = true; saveSettings(); parentsPanel(); }; $('#cL').onclick = () => { settings.upper = false; saveSettings(); parentsPanel(); };
  $('#sfxOn').onclick = () => { settings.sfx = true; saveSettings(); Sfx.good(); parentsPanel(); }; $('#sfxOff').onclick = () => { settings.sfx = false; saveSettings(); parentsPanel(); };
  $('#testVoice').onclick = () => Voice.say(t.phrases[1][0]);
  $('#switch').onclick = profileScreen;
  let confirmReset = 0; $('#reset').onclick = () => { if (++confirmReset < 2) { toast('⚠️ ' + fmt(u.reset, { name: P.name }) + '?'); return; } P.stars = 0; P.done = {}; P.badges = {}; P.games = 0; saveProfiles(); setHeader(); parentsPanel(); };
  let confirmAll = 0; $('#resetAll').onclick = () => { if (++confirmAll < 2) { toast('⚠️ ' + u.resetAll + '?'); return; } profiles = []; P = null; store.del('profiles'); store.del('current'); setHeader(); profileScreen(); };
  if (deferredInstall) { const b = $('#install'); b.hidden = false; b.onclick = () => { deferredInstall.prompt(); deferredInstall = null; b.hidden = true; }; }
  wire();
}

/* ---------- boot ---------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
$('#langBtn').onclick = () => { settings.lang = settings.lang === 'es' ? 'en' : 'es'; saveSettings(); Voice.stop(); setHeader(); home(); };
$('#profileBtn').onclick = () => { Voice.stop(); profileScreen(); };
$('#starsBtn').onclick = () => { Voice.stop(); parentsScreen(); };
Voice.init();
P = profiles.find(p => p.id === currentId) || null;
setHeader();
if (P) home(); else if (profiles.length) profileScreen(); else newProfileScreen();
if ('serviceWorker' in navigator && location.protocol !== 'file:') { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {})); }
})();
