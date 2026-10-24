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
2. **Todo grande y a pantalla completa**: cubos de colores, botones ≥ 64 px, nada pequeño ni gris. Las puertas usan `.d1`–`.d20` (si hay más de 20 puertas, añade `.d21`…; sin clase se ven grises). El Jefe lo repitió en v29: "letras grandes, todo grande, aprovechando toda la pantalla, claro y fácil"; el bloque "TODO GRANDE" al final de styles.css fija los tamaños mínimos (guía ≥1.3rem, etiquetas de cubo ≥1.3rem, preguntas con `letter-spacing:0` escalan con `clamp`). Probar siempre en 412×915 oscuro (modo del teléfono del Jefe): la guía de Trazar usa `--fg` para verse en oscuro.
3. **Pausas y ritmo**: letra → pausa → letra → palabra. Los números de pausa en `Voice.seq` están pensados para la voz del teléfono; con voz grabada se multiplican por `settings.pause` (0,5 por defecto; "Pausas entre frases" en la zona de padres: 0,3 / 0,5 / 0,9) porque al Jefe le parecían muy largas (v32). Los mp3 se recortan al final con `tools/recortar_silencio.py` (sin recodificar; generate_voices lo hace solo). Sonido de la letra ANTES que su nombre ("Esta es la letra eme… suena así: mmm… mmm… eme de mono"). Nunca avanzar por temporizador si la voz sigue hablando.
4. **Error = pista, no castigo.** Sin game over, sin cronómetros, sin "X" rojas. La respuesta correcta se marca con `markGood()`: verde propio (#22c55e, ningún cubo lo usa), marco blanco, ✓ y las demás opciones atenuadas (`.answered`); antes el verde-azulado de "correcto" era igual al cubo --i y el niño no sabía cuál era (feedback del Jefe, v31). Toda frase programada con `setTimeout` que hable (askOnce, gameRead) comprueba `areaFree()`: si el niño ya acertó, hablar cortaría la felicitación y la ronda se trabaría (bug real cazado por la E2E).
5. **Dificultad adaptativa + repaso espaciado + estadística de fallos** en todo juego nuevo (usa `level/adapt/hit/miss/firstSeen`, regístralo en `GAME_FNS`, `reviewPlan` (map), `practice`, `itemLabel`, lista de niveles del panel de padres y `totals`).
6. **Recompensa física**: globos de estrellas que el niño toca, sonido de varita. No "pop".
7. **Gate** obligatorio al abrir (desbloquea audio). Saludo por el nombre del niño.
8. **Rompecabezas**: piezas mezcladas de verdad + pieza extra que no va (un niño descubrió el patrón "derecha-izquierda" y resolvía sin leer).
9. **Audio**: voz femenina, joven, alegre, **latinoamericana** (los estudios: niños pequeños atienden más a voces agudas con "habla dirigida a niños"). Voz elegida en ElevenLabs: **"Daniela - Energetic Saleswoman"** (ID wBnAJRbu3cj93gnAm02O; probada por Junior: "se oye genial y fuerte"; comparada en 2026-10-23 con "Daniela - Tender, Young, Joyful" y el Jefe se quedó con la Energetic). Inglés: pendiente.
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
| 6 | Trazar | canvas con paleta de 8 colores; el pincel se recorta a la máscara de la letra (NO pinta fuera, como libro de colorear); al levantar el dedo la app comprueba sola (sin botón ✅): celebra y pasa mayúscula → minúscula → siguiente; si falta, anima con voz. Números 0-9 al final | — |
| 7 | Juegos | menú de los 28 juegos | — |
| 8 | Números | contar tocando 1-20; con 1 dice "¡Hay una manzana!" (countThings[2] = singular con artículo); `ui.numWord(n)` da el número en palabras hasta 99 (dinero) | ¿Cuántos hay? · Toca el número |
| 9 | Colores y formas | 10 colores, 8 formas SVG | ¿De qué color? · Busca la forma |
| 10 | Sumas y restas | con dibujos (tachados en resta), hasta 5/10/20 | Sumar · Restar |
| 11 | Emociones | 8 emociones + respiración guiada | ¿Cómo se siente? |
| 12 | Hora y calendario | reloj SVG (en punto / y media), días, meses | ¿Qué hora es? · ¿Qué día sigue? |
| 13 | Ciencia | 23 animales (sonido real si existe), hábitat, comida; planta dibujada en SVG con la parte que se ilumina al tocarla; planetas en SVG con tamaño y color reales, ficha con su orden desde el Sol | ¿Qué animal suena? (tortuga y mariposa nunca son respuesta: son callados) · ¿Dónde vive? |
| 14 | Canciones | 10 canciones reales (Eleven Music, 60 s, 5 × ES/EN) en canciones/<id>.<lang>.mp3 con letra sincronizada en canciones/<id>.<lang>.json (tiempos alineados por Scribe); si faltara el mp3 (o la letra no trae `t`) la voz canta línea a línea; tocar una línea la repite. El ABC en inglés lleva letra ORIGINAL: la clásica ("Now I know my ABCs") la rechaza ElevenLabs por derechos | — |
| 15 | Dinero (USD) | monedas y billetes dibujados (coinSvg: centavo cobrizo, 10¢ la más pequeña, 25¢ la más grande); al tocar uno se cuenta su valor con monedas menores (COIN_EQUIV: 5¢ = 5×1¢, 25¢ = 5×5¢, $1 = 4×25¢…) | ¿Cuánto dinero hay? |
| 16 | Escribir | tocar letras en orden con distractores | Escribe la palabra |
| 17 | Mi cuerpo y el clima | 10 partes, 6 climas con ropa | ¿Qué parte es? · ¿Qué me pongo? |
| 18 | Leer y entender (8+) | 5 textos, 4 preguntas | Preguntas del texto |
| 19 | Multiplicar y fracciones | tablas ×2 ×3 ×4 ×5 ×10; al tocar una fila (n × i) se abre la lección con el **método de las líneas (japonés)**, el que el Jefe vio viral: n líneas azules cruzadas por i amarillas, cada cruce es un punto; el niño toca cada línea amarilla, se encienden sus n cruces y la voz cuenta de n en n; luego la suma repetida (3 + 3 + 3 + 3 = 12) y el resultado. Antes solo recitaba "3 por 4 es 12" (crítica del Jefe, v33). **Trucos de las tablas (v36, los virales de TikTok que pidió el Jefe, "así de simples y con prácticas")**: `trickView(box,k,a,b,onDone,onEnd)` pinta cada truco interactivo y `trickLesson(k)` lo explica con un ejemplo al azar (🔄 otro número) y `gameTrick(k)` lo practica en 4 rondas con el truco en pantalla como andamio (misma estadística `mult:axb`). Trucos: ×2/×4/×8 = tocar "×2 ✨" 1/2/3 veces (los puntos se duplican) · ×3 = doble + 1 vez, ×6 = 5 veces + 1, ×7 = 5 veces + 2 (dos bloques de grupos que se tocan en orden) · ×5 = manos 🖐️ que se cuentan de 5 en 5 · ×9 = bajar el dedo n: dedos a la izquierda = decenas (verde), a la derecha = unidades (amarillo) · ×10 = tocar el número y aparece el 0 · "Del 6 al 10 con los dedos": dos columnas de dedos 6-10, toca uno en cada mano; los que tocan + los de abajo = decenas, los de arriba se multiplican = unidades. Las tablas del método de líneas ahora van del 2 al 10. Fracciones tipo pizza | Multiplicar · ¿Qué fracción es? |
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
   Letras, sílabas, números y palabras de ≤5 letras se generan DENTRO de una frase portadora ("Escucha: ma.") con el endpoint `/with-timestamps` y se recorta el trozo con ffmpeg (`needs_carrier`/`cut_from_carrier` en generate_voices.py): sueltas, el modelo las leía en otro idioma ("E" → "i", "oso" → "awesome") y ningún reconocedor de voz sirve de juez con audios tan cortos. La app encadena trozos grabados cuando una frase es suma de oraciones conocidas (`Clips.segments`), cae a la voz del teléfono si un mp3 no se puede reproducir (sin internet y aún no guardado) y registra en Diag `sin-voz` cada frase sin audio; la zona de padres tiene "Guardar las voces para usar sin internet".
   Control de calidad de voces (tools/): `voz_comun.py` (reglas compartidas: pronunciacion.json, números en palabras porque las cifras al final hacían balbucear al modelo, qué va con portadora, comparación con lo transcrito) · `verificar_voces.py` (transcribe todo con Scribe, gratis en créditos, y deja dudosos) · `reparar_voces.py` (bucle generar→transcribir→aceptar solo si coincide y dura lo razonable, hasta 4 intentos subiendo estabilidad) · `componer_voces.py` (las frases-lista "ba, be, bi", "A, B, C…" se pegan con los audios ya verificados de sus partes, con pausa de 0,28 s; crea voces/_partes_<lang>/ temporal que NO se publica). Los reconocedores no sirven para juzgar una sílaba suelta: para eso está la portadora. Resultado v30: 2.799 frases ES, las de ≥2 palabras verificadas ≥96 % exactas por transcripción.
   Modelo: `eleven_turbo_v2_5` con `language_code` (multilingual_v2 leía "E" como "i" y "gallina" como "galina": con frases cortas adivina mal el idioma; el contexto `previous_text` NO lo arregla). Verificación automática: `python3 tools/verificar_voces.py --lang es --cortas` transcribe cada audio con Scribe (ElevenLabs) y deja los que no dicen lo que deben en voces/dudosos_es.json; `--reparar` los borra para regenerarlos; `tools/pronunciacion.json` ({"es":{"palabra":"como se escribe para que suene bien"}}) corrige casos tercos sin cambiar el nombre del archivo. `generar_audio.py todo` encadena check + voces-es + sonidos + publicar. Si una frase suena mal, bórrala de `voces/es/<hash>.mp3` y vuelve a correr. La voz va a `speed 0.9` (habla dirigida a niños). Escuchar en la app: el nombre escrito a mano del niño sigue con voz del teléfono (es normal).
2. **Inglés**: HECHO (2026-10-24). Voz elegida por el Jefe: **"Gigi - Cute, Peppy, Energetic"** (ID `n7Wi4g1bhpw4Bs8HK5ph`, de la biblioteca compartida, añadida a Mis Voces). Mismo sistema que el español: turbo + `language_code=en`, portadora "Listen: {x}." para trozos cortos, listas compuestas (`componer_voces.py --lang en --voice <ID>`), verificación con Scribe y reparación. Para frases nuevas: `python3 tools/generar_audio.py voces-en --voz-en n7Wi4g1bhpw4Bs8HK5ph` y luego `reparar_voces.py --lang en --voice n7Wi4g1bhpw4Bs8HK5ph --dudosos` si la verificación marca algo.
3. **Sonidos reales de animales**: `python3 tools/generate_sfx.py` (18 sonidos, ~54 s) o grabaciones CC0 (Pixabay/Freesound) guardadas con el nombre `<clave>.mp3` (`dog_bark`, `cat_meow`…) y `--index`.
4. **Canciones**: HECHO (2026-10-24) con Eleven Music (`/v1/music`, modelo `music_v2_5`, 60 s; el plan Creator lo incluye y no descontó créditos de caracteres). La instrucción va EN EL IDIOMA de la canción ("cantada íntegramente en español latinoamericano…"): con la instrucción en inglés la voz mezclaba acento (lo notó el Jefe). Los tiempos de la letra se alinean transcribiendo la canción con Scribe (palabras con tiempo) en `generate_songs.py` (`--sync` recalcula). Para una canción nueva: añadir letra a `tools/songs.json` y correr `python3 tools/generate_songs.py --only <id>`. Campo opcional `sing` por idioma: cómo se le dicta al modelo para que lo cante bien; en pantalla se muestra `lyrics`. Cuando el modelo de música NO pronuncia bien (el ABC español: cantaba "ei, bi, si" y ni dictándole "a, be, ce" quedó claro), la canción se MONTA con los clips de Daniela sobre una pista instrumental: `python3 tools/componer_cancion.py --id abc --lang es` (pista en canciones/_pista_<id>.<lang>.mp3, generada una vez con force_instrumental; tiempos de letra exactos, sin transcribir). El mp3 de una canción regrabada se sirve con la letra fresca (el service worker pide la letra a la red primero).
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
Piezas mezcladas + pieza extra · estrellas que se ven y se tocan · nombre y sonido de cada letra (Z/C en latino) · trazar auto mayúscula→minúscula→siguiente · voz alegre y más aguda · felicitación completa sin cortes · botón atrás no cierra · cubos grandes · 28 animales y guía hablada al crear perfil · recarga vuelve a la misma pantalla · puertas en color · r suave con punto medio · Trazar sin ✅, sin pintar fuera y con paleta (video de la niña de Junior, 2026-10-24).
