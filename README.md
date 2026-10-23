# Leo y Aprendo — PWA

App gratuita, sin anuncios y sin internet para que niños de 3 a 7 años aprendan a leer desde cero, en español e inglés.

## Qué incluye
- **Perfiles** con avatar (varios niños en el mismo dispositivo), estrellas e insignias.
- **8 niveles**: Vocales · Letras (abecedario completo con dibujo y sonido) · Sílabas (20 consonantes y dígrafos: ch, ll, ñ, qu, rr / sh, ch, th) · Palabras (60 por idioma, 5 categorías, lectura por sílabas) · Frases (16, lectura guiada palabra por palabra) · Cuentos (4 por idioma, con pregunta de comprensión) · Trazar letras (mayúscula y minúscula, con corrección) · 6 juegos.
- **Audio** con la voz del dispositivo (botón "Despacio", velocidad ajustable, elección de voz) + efectos de sonido propios.
- **Zona de padres** (candado con multiplicación): progreso por nivel, insignias, ajustes, borrar progreso, instalar app.
- **Offline**: el service worker guarda toda la app; funciona sin conexión tras la primera visita.

## Publicar (necesita HTTPS para instalarse como app)
Cualquiera de estas opciones es gratis:
1. **Netlify Drop**: arrastra la carpeta a https://app.netlify.com/drop → listo.
2. **GitHub Pages**: sube la carpeta a un repo → Settings → Pages → rama main / root.
3. **Vercel / Cloudflare Pages / Firebase Hosting**: sitio estático, sin build.

Probar en local: `python3 -m http.server 8080` dentro de la carpeta y abre http://localhost:8080

## Instalar en el teléfono
- **Android (Chrome)**: menú ⋮ → "Instalar app" (o el botón "Instalar la app" en Zona de padres).
- **iPhone (Safari)**: Compartir → "Añadir a pantalla de inicio".

## Si la voz no suena
- Android: Ajustes → Sistema/Accesibilidad → Texto a voz → descargar voz en español (Google Speech Services).
- iPhone: Ajustes → Accesibilidad → Contenido hablado → Voces → Español.
- En Zona de padres puedes elegir la voz y probarla.

## Editar contenido
Todo el contenido (palabras, frases, cuentos, dibujos) está en `data.js`. Añade una línea y listo. Cuando cambies archivos, sube `CACHE_VERSION` en `sw.js` para que los usuarios reciban la actualización.

## Voces grabadas (ElevenLabs)
1. `node tools/build_manifest.js` → crea `voces/manifest.json` con todo lo que la app dice (≈700 frases por idioma, ≈16k caracteres en total; el plan Starter de ElevenLabs da 30k/mes).
2. En ElevenLabs: Voices → Library → busca una voz alegre e infantil en español latino (filtra por idioma "Spanish", acento "Latin American", caso de uso "Characters/Animation"); añádela a "My voices" y copia su **Voice ID**. Igual para inglés.
3. Profile → API keys → crea una clave.
4. En la carpeta del proyecto:
   ```
   export ELEVEN_API_KEY=tu_clave
   python3 tools/generate_voices.py --dry-run
   python3 tools/generate_voices.py --voice-es VOICE_ID_ES --voice-en VOICE_ID_EN
   ```
5. Sube la carpeta `voces/` al repo (`git add voces && git commit && git push`). La app usa los archivos automáticamente y cae a la voz del teléfono solo si falta alguno (por ejemplo el nombre escrito del niño).
Para probar una voz antes de gastar: `python3 tools/generate_voices.py --only es --voice-es ID` genera solo español; si no gusta, borra `voces/es/` y repite con otra voz.

## Camino a tiendas (App Store / Play Store)
- **Play Store**: empaquetar la PWA con **Bubblewrap / TWA** (Trusted Web Activity). No requiere reescribir nada.
- **App Store**: envolver con **Capacitor** (Ionic). El código HTML/JS se reutiliza tal cual; se añade un plugin de TTS nativo para voces de mayor calidad.
- Opción premium: grabar audio humano real por palabra (mp3) y sustituir el sintetizador. Es la mayor mejora de calidad posible.
