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

## Camino a tiendas (App Store / Play Store)
- **Play Store**: empaquetar la PWA con **Bubblewrap / TWA** (Trusted Web Activity). No requiere reescribir nada.
- **App Store**: envolver con **Capacitor** (Ionic). El código HTML/JS se reutiliza tal cual; se añade un plugin de TTS nativo para voces de mayor calidad.
- Opción premium: grabar audio humano real por palabra (mp3) y sustituir el sintetizador. Es la mayor mejora de calidad posible.
