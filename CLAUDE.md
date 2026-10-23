# Leo y Aprendo — contexto del proyecto (léelo antes de tocar nada)

## Qué es
App educativa **gratuita, sin anuncios y sin internet** para niños de 2 a 7 años, bilingüe español/inglés, dueño: Junior (GitHub `shadown9`). Meta declarada: "la app de aprendizaje para niños más completa de todas, todas las áreas y todas las edades". Publicada como PWA en **https://shadown9.github.io/leo-y-aprendo/** (GitHub Pages, despliegue automático con cada push a `main`; tarda ~1 min). Después se empaquetará para Play Store (Bubblewrap/TWA) y App Store (Capacitor).

## Archivos
- `index.html`, `styles.css`, `app.js` (toda la lógica, ~1.400 líneas, IIFE), `data.js` (TODO el contenido bilingüe: `window.LYA_DATA.es/en`), `sw.js` (service worker; **sube `CACHE_VERSION` y `APP_VERSION` en app.js en cada cambio**), `manifest.webmanifest`, `icons/`.
- `tools/build_manifest.js` → `voces/manifest.json` (todas las frases que la app dice, con hash). `tools/generate_voices.py` (ElevenLabs TTS → `voces/<lang>/<hash>.mp3` + `voces/index.json`), `tools/generate_sfx.py` (sonidos de animales → `sonidos/`), `tools/generate_songs.py` + `tools/songs.json` (canciones → `canciones/`).
- La app reproduce un clip grabado si existe (`Clips` en app.js, hash djb2 de `lang|texto`) y si no, usa la voz del teléfono (`speechSynthesis`). Nunca falla por falta de audio.

## Reglas de diseño (vienen de pruebas con niños reales; no las rompas)
1. **El niño no sabe leer.** Toda instrucción se dice en voz alta (la paloma 🕊️ `guideHtml`/`guideSay`). Botones de ícono, sin texto. Un objetivo por pantalla; el objetivo pulsa (`.pulse`).
2. **Todo grande y a pantalla completa**: opciones como cubos de color (`bigOpts(area, selector, cols)`), botones ≥ 64 px.
3. **Pausas y ritmo**: la voz usa `Voice.seq([texto, ms, {t, rate}, ...], onDone)`. Sonido de la letra ANTES que su nombre (ciencia de la lectura). Nunca avanzar por temporizador si la voz sigue hablando: avanzar en `onDone`.
4. **Error = pista, no castigo**: al 2.º fallo la respuesta correcta pulsa y la voz dice "Mira, es esta". Sin game over ni cronómetros.
5. **Dificultad adaptativa** por juego (`level()/adapt()`: 3 aciertos sube, 2 fallos baja, niveles 1-3). **Juego del día** = repaso espaciado (`reviewPlan`). Estadística de fallos por ítem (`miss()/hit()`) y "Practicar" en la Zona de padres (candado: multiplicación).
6. **Recompensa**: estrellas que suben como globos y el niño las toca (`balloons()`), sonido de varita (`Sfx.sparkle`). No sonido de "pop".
7. Pantalla de bienvenida (`showGate`) obligatoria: el primer toque desbloquea el audio del teléfono.
8. Sílabas con r suave interna se dicen con punto medio: `ma·ri·po·sa` (`sylSpeech`), si no la voz dice "rri".
9. Audio: voz femenina, joven, alegre, español **latinoamericano** (nunca de España). Voz elegida en ElevenLabs: **Daniela** (plan Creator). Inglés: pendiente de elegir.
10. Diagnóstico interno (`Diag`): nunca mostrar errores al niño; se ven solo en Zona de padres → "Diagnóstico" → Copiar.
11. No romper a quien ya usa la app: cada publicación se actualiza sola al volver al inicio, nunca a mitad de un juego.

## Módulos (19 puertas, 27 juegos)
Vocales · Letras · Sílabas · Palabras · Frases · Cuentos (cortos + largos con 3 preguntas) · Trazar · Juegos · Números (1-20) · Colores y formas · Sumas y restas · Emociones · Hora y calendario · Ciencia (animales/planta/planetas) · Canciones (reproductor listo; audios pendientes) · Dinero (USD: centavos y dólares) · Escribir (tocar letras en orden) · Mi cuerpo y el clima · Leer y entender (3 textos 8+, 4 preguntas) · Multiplicar (tablas 2-10) y fracciones.
Puertas: colores `.d1`-`.d20` en styles.css (añade más si pasas de 20).

## Pendiente inmediato (voces)
```
export ELEVEN_API_KEY=sk_...
python3 tools/generate_voices.py --list            # buscar el Voice ID de Daniela
python3 tools/generate_voices.py --only es --voice-es <ID_DANIELA>
git add voces && git commit -m "voces es" && git push
```
Luego inglés (elegir voz joven/alegre americana), `tools/generate_sfx.py` (sonidos de animales) y `tools/generate_songs.py --only vocales --lang es` como prueba de costo antes de generar las 10 canciones. Créditos disponibles: ~121.000/mes; voces es ≈ 52.000, en ≈ 54.000 (los dos idiomas no caben en un mes: español primero, inglés el mes siguiente o comprar créditos extra).

## Después (orden acordado)
Canciones (audios con Eleven Music, `tools/generate_songs.py`) · sonidos reales de animales (`tools/generate_sfx.py`) · empaquetado para tiendas (Bubblewrap/Capacitor) · más contenido por módulo (palabras, cuentos, textos) según feedback de niños.

## Probar
`python3 -m http.server 8080` en la carpeta y abrir http://localhost:8080. Hay pruebas automáticas con Playwright en el historial de commits (pantallas, juegos, globos). Antes de publicar: `node --check app.js data.js` y probar un juego completo.

## Quién da feedback
Eli (prueba con su hijo, manda audios por WhatsApp). Sus observaciones ya aplicadas: piezas del rompecabezas mezcladas + pieza extra; estrellas visibles y tocables; nombre y sonido de cada letra; trazar pasa solo de mayúscula a minúscula.
