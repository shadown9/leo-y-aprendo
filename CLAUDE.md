# Leo y Aprendo — contexto completo del proyecto (léelo entero antes de tocar nada)

## 1. Qué es y para quién
App educativa **gratuita, sin anuncios, sin cuentas y que funciona sin internet** para que niños de 2 a 8 años aprendan a leer, contar y conocer el mundo. Bilingüe **español latinoamericano / inglés americano** (botón 🌎 arriba cambia el idioma entero). Dueño: **Junior** (GitHub `shadown9`, correo deivyespinosa07@gmail.com). Su meta, en sus palabras: *"la app de aprendizaje para niños más completa de todas, todas las áreas y todas las edades"*, y *"todo lo más real posible"* (voces humanas, sonidos reales).

- **Publicada** como PWA en https://shadown9.github.io/leo-y-aprendo/ (GitHub Pages; cada `git push` a `main` la publica solo en ~1 min vía `.github/workflows/pages.yml`).
- Repo: https://github.com/shadown9/leo-y-aprendo (público). Historial de commits = historial de versiones (v1…v25); se puede volver a cualquiera.
- Futuro: Play Store (Bubblewrap/TWA) y App Store (Capacitor). Nada de eso está hecho aún.
- Quién prueba: **Eli** (amiga de Junior) con su hijo pequeño; manda audios por WhatsApp; Junior los transcribe y los pasa. Junior también prueba en su Android.

## 2. Cómo se trabaja con Junior
- Habla español; quiere **evaluaciones directas y honestas**, sin rodeos. Si algo está mal, se dice.
- Su método: *"investiga, estudia, aprende y luego implementa"*. Antes de un módulo nuevo busca evidencia (ciencia de la lectura, UX infantil) y aplícala.
- Él decide el **qué**; tú decides el **orden y el cómo** ("tú elijes el orden"). Avanza sin pedir permiso para cada paso; publica seguido; informa en resumen corto qué cambió y qué debe probar con un niño.
- Regla de oro suya: **no romper a quien ya usa la app** (ver §5.11).
- Cuando mande capturas/quejas, primero reproduce el problema, luego corrige, prueba y publica.

## 3. Archivos
```
index.html          esqueleto (header con ⭐ padres / avatar / idioma, <main>, startGate, confetti)
styles.css          tokens de color (:root, dark mode), cubos, globos, gate, etc. Puertas .d1–.d20
app.js              TODA la lógica (IIFE, ~1.900 líneas). Ver §4
data.js             TODO el contenido bilingüe: window.LYA_DATA.es / .en (+ .avatars)
sw.js               service worker: cachea la app; voces/sonidos/canciones se cachean al primer uso
manifest.webmanifest, icons/   PWA instalable
voces/manifest.json  todas las frases que la app dice (hash → texto), generado por tools/build_manifest.js
voces/index.json     hashes que SÍ tienen mp3, con la forma {"es":[...],"en":[...]} (lo escribe generate_voices.py; Clips.load lee j.es / j.en — NO cambiar a lista plana). Hoy vacío.
voces/es|en/<hash>.mp3   audios grabados (pendiente de generar)
sonidos/index.json + <clave>.mp3   sonidos reales de animales (pendiente)
canciones/<id>.<lang>.mp3 + .json  canciones con letra sincronizada (pendiente)
tools/build_manifest.js   regenera voces/manifest.json (córrelo tras cambiar data.js)
tools/generate_voices.py  ElevenLabs TTS. --list (voces e IDs), --dry-run, --only es|en, --voice-es ID
tools/generate_sfx.py     ElevenLabs sound effects para animales (--dry-run, --index)
tools/generate_songs.py + tools/songs.json   Eleven Music; letras ya escritas (5 canciones × 2 idiomas)
README.md           instrucciones para humanos (publicar, instalar, voces)
```
**En cada cambio de código**: sube `APP_VERSION` en app.js y `CACHE_VERSION` en sw.js (mismo número), `node --check app.js data.js`, prueba, commit, push.

## 4. Arquitectura de app.js (qué hay y cómo se usa)
- `store` → localStorage con prefijo `lya:`. `settings` (lang, rate, pitch 1.3, upper, sfx, voice). `profiles[]` (varios niños por dispositivo), `P` = perfil actual: `stars, done{}, badges{}, games, errors{}, hits{}, seen{}, lvl{}, adapt{}, streak, lastReview, reviews`.
- **Audio** — `Voice.say(text, {rate,onend})` → si existe clip grabado (`Clips.file(lang,text)` por hash djb2 de `lang|texto`) lo reproduce; si no, `speechSynthesis` (prefiere voces es-US/es-MX, pitch 1.3). `Voice.seq([texto, 700, {t:'A', rate:.55}, ...], onDone)` = narración con pausas; se cancela sola al cambiar de pantalla; tiene red de seguridad por si el motor no avisa el fin. `Voice.stop()`. `Sfx` = efectos sintetizados (tap, good, bad, star, **sparkle** = varita mágica para estrellas). `Sfxfile` = sonidos reales (sonidos/). `Clips` = mp3 de voces.
- **Guía** — `guideHtml(texto)` pinta la tarjeta de la paloma 🕊️; `guideSay(texto, then)` la dice. `S()` = strings de voz (`ui.say`), `U()` = ui, `T()` = datos del idioma.
- **Pantalla de inicio** — `home()`: tarjeta "Juego del día" + puertas (`u.levels`, índice = orden en `[vowelsScreen, lettersScreen, ...]`). Saludo hablado tras el **gate** (`showGate`: primer toque desbloquea el audio del teléfono).
- **Cubos** — `bigOpts(area, selector, cols)` convierte `.grid .tile` en cubos grandes de colores que llenan la pantalla. Clase `keep` conserva el `--cube` propio del tile.
- **Juegos** — patrón común: `gameShell(title, opts, rondas)` → `round()` → `correct(sh, btn, estrellas, after, partsDeVoz)` / `wrong(sh, btn, retry, tries, selectorCorrecto)`. `correct` avanza SOLO cuando la voz termina (`onDone`), bloquea toques mientras felicita y arma un watchdog (`armWatchdog`). Al 2.º fallo, `wrong` hace pulsar la respuesta correcta y dice "Mira, es esta". `askOnce` dice la instrucción solo en la ronda 0. `done(sh, won, replay, opts)` → `finish()` (globos) o, dentro del Juego del día, siguiente segmento.
- **Adaptativo** — `level(g)` 1-3 por juego; `adapt(g, ok)`: 3 aciertos seguidos sube, 2 fallos baja; toast "¡Subes de nivel!". `hit(key)/miss(key)` = estadística por ítem; `firstSeen(key)` para repaso espaciado.
- **Juego del día** — `reviewPlan()` mezcla ítems fallados + vistos hace >2 días + variedad; 4 segmentos de 2 rondas; racha 🔥 diaria (`P.streak`). `GAME_FNS` registra cada juego por nombre.
- **Recompensa** — `award(n, key, defer)`: estrellas; en juegos `defer=true` y al final `balloons(n)`: suben como globos, el niño las toca, vuelan al contador con `Sfx.sparkle`. Las no tocadas se recogen solas. `checkBadges()` insignias.
- **Zona de padres** — `parentsScreen` (candado: multiplicación) → `parentsPanel`: progreso por puerta (`levelStars`, `totals`), nivel por juego, **"Dónde falla más"** (`weakList` + botón Practicar → `practice(key)`), insignias, ajustes (voz, velocidad, mayúsculas, sonidos), perfiles, borrar progreso, **Diagnóstico** (`Diag.report()` Copiar/Ver/Borrar).
- **Diag** — registro interno: errores JS, promesas, fallos de voz, rondas trabadas (60 s), migas de pan de pantallas, info del dispositivo. Nunca visible para el niño. `window.LYA.diag()` en consola.
- **Navegación** — botón atrás del teléfono vuelve al inicio (history API), nunca sale. Tras recargar, `openScreen(last)` reabre la misma pantalla (sessionStorage). `overscroll-behavior` evita deslizar-para-recargar. Actualización automática: el SW nuevo recarga la app solo al volver al inicio (`controllerchange` + `_pendingReload`).
- **Lectura guiada** — `readAlong(container, texto, onDone)` resalta palabra por palabra (boundary events o temporizador de respaldo).
- **Sílabas** — `sylSpeech(parts)`: si hay r suave interna (`softR`) dice `ma·ri·po·sa` en una frase (si no, la voz pronuncia "rri").

## 5. Reglas de diseño (salieron de pruebas con niños reales; NO romperlas)
1. **El niño no sabe leer.** Toda instrucción se dice en voz alta. Botones de ícono (🔊 ➡️ ✏️ ✅ 🏠), sin texto. Un objetivo por pantalla; lo que hay que tocar **pulsa** (`.pulse`). Si no toca en ~8 s, repetir la instrucción.
2. **Todo grande y a pantalla completa**: cubos de colores, botones ≥ 64 px, nada pequeño ni gris. Las puertas usan `.d1`–`.d20` (si hay más de 20 puertas, añade `.d21`…; sin clase se ven grises).
3. **Pausas y ritmo**: letra → pausa → letra → palabra. Sonido de la letra ANTES que su nombre ("Esta es la letra eme… suena así: mmm… mmm… eme de mono"). Nunca avanzar por temporizador si la voz sigue hablando.
4. **Error = pista, no castigo.** Sin game over, sin cronómetros, sin "X" rojas.
5. **Dificultad adaptativa + repaso espaciado + estadística de fallos** en todo juego nuevo (usa `level/adapt/hit/miss/firstSeen`, regístralo en `GAME_FNS`, `reviewPlan` (map), `practice`, `itemLabel`, lista de niveles del panel de padres y `totals`).
6. **Recompensa física**: globos de estrellas que el niño toca, sonido de varita. No "pop".
7. **Gate** obligatorio al abrir (desbloquea audio). Saludo por el nombre del niño.
8. **Rompecabezas**: piezas mezcladas de verdad + pieza extra que no va (un niño descubrió el patrón "derecha-izquierda" y resolvía sin leer).
9. **Audio**: voz femenina, joven, alegre, **latinoamericana** (los estudios: niños pequeños atienden más a voces agudas con "habla dirigida a niños"). Voz elegida en ElevenLabs: **Daniela** (probada por Junior: "se oye genial y fuerte"). Inglés: pendiente.
10. **Diagnóstico interno**, nunca en pantalla del niño.
11. **No interrumpir a quien ya usa la app**: cada publicación es compatible con los datos guardados; la app se actualiza sola solo en el inicio; los audios que falten caen a la voz del teléfono.
12. Perfil: 28 animales grandes, nombre opcional (si no escribe, se llama como su animal), botón Empezar fijo abajo y pulsando.
13. Después de recargar, volver a la misma pantalla. El botón atrás del teléfono no cierra la app.

## 6. Módulos (20 puertas, 28 juegos) — estado: TODOS hechos y publicados (v27)
| # | Puerta | Qué hace | Juegos asociados |
|---|---|---|---|
| 0 | Vocales | lección guiada A-E-I-O-U (letra, palabra, "toca la A", auto-avanza) | ¿Qué vocal escuchas? · La vocal perdida |
| 1 | Letras | abecedario en cubos; nombre, sonido, palabra | ¿Con qué letra empieza? |
| 2 | Sílabas | consonante + vocal, blending "m… a… ma", palabra ejemplo | Arma la palabra (rompecabezas) · ¿Qué sílaba escuchas? (nivel 1-2: misma consonante, cambia la vocal; nivel 3: misma vocal, cambia la consonante) |
| 3 | Palabras | 60 por idioma en 5 categorías, por sílabas | ¿Qué palabra escuchas? · Memoria · ¿Qué rima? · Palmadas · ¿Cuál es distinta? |
| 4 | Frases | 22 frases, lectura guiada palabra a palabra | — |
| 5 | Cuentos | 5 cortos (1 pregunta) + 4 largos (9 páginas, 3 preguntas) | — |
| 6 | Trazar | canvas; mayúscula → minúscula → siguiente letra automático; al final los números 0-9 (sin minúscula) | — |
| 7 | Juegos | menú de los 28 juegos | — |
| 8 | Números | contar tocando 1-20 | ¿Cuántos hay? · Toca el número |
| 9 | Colores y formas | 10 colores, 8 formas SVG | ¿De qué color? · Busca la forma |
| 10 | Sumas y restas | con dibujos (tachados en resta), hasta 5/10/20 | Sumar · Restar |
| 11 | Emociones | 8 emociones + respiración guiada | ¿Cómo se siente? |
| 12 | Hora y calendario | reloj SVG (en punto / y media), días, meses | ¿Qué hora es? · ¿Qué día sigue? |
| 13 | Ciencia | 23 animales (sonido real si existe), hábitat, comida; planta; planetas | ¿Qué animal suena? (tortuga y mariposa nunca son respuesta: son callados) · ¿Dónde vive? |
| 14 | Canciones | reproductor con letra resaltada (audios pendientes) | — |
| 15 | Dinero (USD) | 1¢ 5¢ 10¢ 25¢ $1 $5 | ¿Cuánto dinero hay? |
| 16 | Escribir | tocar letras en orden con distractores | Escribe la palabra |
| 17 | Mi cuerpo y el clima | 10 partes, 6 climas con ropa | ¿Qué parte es? · ¿Qué me pongo? |
| 18 | Leer y entender (8+) | 5 textos, 4 preguntas | Preguntas del texto |
| 19 | Multiplicar y fracciones | tablas 2-10 con puntitos, fracciones tipo pizza | Multiplicar · ¿Qué fracción es? |
Índices de `u.games`: 0-5 clásicos, 6 rima, 7 palmadas, 8 distinta, 9 cuántos, 10 toca número, 11 color, 12 forma, 13 sumar, 14 restar, 15 siente, 16 hora, 17 día, 18 animal, 19 vive, 20 dinero, 21 escribir, 22 cuerpo, 23 ropa, 24 lectura, 25 multiplicar, 26 fracción, 27 sílaba.
Detalles pedagógicos que no hay que deshacer: en "¿Cuál es distinta?" el sonido inicial es el dígrafo completo (ch, ll, sh, th, qu, rr); en "¿Con qué letra empieza?" solo entran letras cuya palabra de verdad empieza con ellas (en inglés "x de fox" queda fuera).

## 7. Lo que FALTA (en este orden)
1. **Voces grabadas (español)** — lo más importante; hoy la app usa la voz del teléfono y suena distinto en cada dispositivo. Junior tiene ElevenLabs **Creator** (121.000 créditos/mes, licencia comercial). Voz: Daniela. Pasos:
   ```
   cd ~/leo-y-aprendo && git pull
   export ELEVEN_API_KEY=sk_...                      # Junior la crea en elevenlabs.io → perfil → API Keys (o guardarla en tools/.eleven_key, ignorado por git)
   python3 tools/generar_audio.py check              # clave, créditos, voz Daniela, costo (es ≈ 2.724 frases / 55k caracteres)
   python3 tools/generar_audio.py prueba             # 5 frases para escuchar antes de gastar
   python3 tools/generar_audio.py voces-es           # todas; se reanuda si se corta
   python3 tools/generar_audio.py publicar           # verifica, sube APP_VERSION/CACHE_VERSION, commit y push
   ```
   `generar_audio.py todo` encadena check + voces-es + sonidos + publicar. Si una frase suena mal, bórrala de `voces/es/<hash>.mp3` y vuelve a correr. La voz va a `speed 0.9` (habla dirigida a niños). Escuchar en la app: el nombre escrito a mano del niño sigue con voz del teléfono (es normal).
2. **Inglés**: elegir voz (joven, alegre, americana; probar con "Hi! This is the letter A. A. A. A is for apple. Mmm. M is for moon. One, two, three. Great job!") y generar `python3 tools/generar_audio.py voces-en --voz-en "Nombre"` (≈57k caracteres → mes siguiente o créditos extra).
3. **Sonidos reales de animales**: `python3 tools/generate_sfx.py` (18 sonidos, ~54 s) o grabaciones CC0 (Pixabay/Freesound) guardadas con el nombre `<clave>.mp3` (`dog_bark`, `cat_meow`…) y `--index`.
4. **Canciones**: `python3 tools/generate_songs.py --only vocales --lang es` como prueba de costo; luego todas. Letras en `tools/songs.json`; `--show` imprime el prompt para generarlas a mano en la app de ElevenLabs si la API de música no está en el plan. El `.json` de letra reparte las líneas uniformemente; afinar tiempos a mano si hace falta.
5. **Tiendas**: Bubblewrap (Play) y Capacitor (iOS). Requiere cuenta de desarrollador de Junior (25 USD Google, 99 USD/año Apple).
6. **Más contenido** según feedback: más palabras/cuentos/textos; ciencia (cuerpo humano profundo, clima ya está); geografía; inglés como segunda lengua estructurado.
7. Ideas aún no hechas: mapa de progreso con historia (la paloma viaja), segunda voz infantil solo para celebraciones, grabación con actriz real si la app crece.

## 8. Investigación que respalda las decisiones (por si Junior pregunta "¿por qué?")
- Ciencia de la lectura / National Reading Panel: conciencia fonológica + fonética sistemática; en español (ortografía transparente) fonética + sílabas. Sonido antes que nombre. Programa Lundberg: rimas, sílabas y segmentación en preescolar mejoran la lectura hasta 2.º grado → juegos Rima, Palmadas, Cuál es distinta.
- Spaced learning (Seabrook 2005, Vlach 2012): sesiones cortas diarias > una larga → Juego del día de 2 minutos con racha.
- Dificultad adaptativa (~80 % de aciertos, subir al dominar, bajar con apoyo, nunca castigar) → `adapt()`.
- UX infantil (Google Building for Kids, Smashing Magazine): sin texto, íconos conocidos, objetivos grandes, feedback en todo toque, errores con pista, candado para padres, probar con niños reales.
- Voz: habla dirigida a niños (Kuhl): tono alto, entonación exagerada, lento, clara; niños pequeños prefieren voces femeninas agudas; la articulación es sagrada para enseñar sonidos.
- Competencia estudiada: ABCmouse/HOMER/Lingokids (quejas: cobros, cancelación), Duolingo ABC (poco contenido), Khan Kids (mejor valorado; falla offline), apps en español (ABC Dinos, Leo con Grin: trazo y perfiles). Diferenciadores nuestros: gratis sin cuenta, offline total, bilingüe, adaptativo, estadística de fallos con práctica dirigida.

## 9. Probar
- Local: `python3 -m http.server 8080` → http://localhost:8080 (voz del navegador puede no sonar en headless; es normal).
- Pruebas automáticas usadas durante el desarrollo (Playwright/Chromium): crear perfil, recorrer cada puerta, cada juego (tocar tiles, esperar ~8 s, comprobar que la barra avanza), Juego del día completo, globos, recarga y botón atrás. Replica ese patrón cuando toques juegos.
- En el teléfono: Zona de padres → Diagnóstico → Copiar y pegarlo al chat si algo falla.

## 10. Feedback ya aplicado de Eli / Junior (no deshacer)
Piezas mezcladas + pieza extra · estrellas que se ven y se tocan · nombre y sonido de cada letra (Z/C en latino) · trazar auto mayúscula→minúscula→siguiente · voz alegre y más aguda · felicitación completa sin cortes · botón atrás no cierra · cubos grandes · 28 animales y guía hablada al crear perfil · recarga vuelve a la misma pantalla · puertas en color · r suave con punto medio.
