# Onda

Una aplicación de música en español, inspirada en las experiencias de streaming, con identidad visual propia. Construida con React, Vite y Lucide.

## Desarrollo

Requiere Node.js 24.22.1 o una versión compatible con Vite 6.

```sh
npm ci
npm run dev -- --port 5173
```

El servidor escucha en todas las interfaces. Para generar y servir una compilación de producción:

```sh
npm run build
npm run preview -- --port 4173
```

## Qué puedes hacer

- Explorar seis playlists y buscar canciones, artistas, álbumes o estados de ánimo.
- Reproducir audio local, pausar, avanzar, retroceder, cambiar posición y volumen, repetir y activar aleatorio.
- Consultar la cola y cambiar la canción desde ella.
- Guardar canciones en «Tus me gusta» y playlists en la biblioteca.
- Crear playlists y añadirles canciones desde el menú de opciones de cada canción.
- Compartir enlaces a playlists del catálogo y abrirlos directamente.
- Usar Ctrl/Cmd + K para buscar y Escape para cerrar diálogos.

Los favoritos, la biblioteca y las playlists personales se conservan en `localStorage`, en este navegador. Las playlists personales no se sincronizan entre dispositivos; sus enlaces requieren que la playlist exista en el navegador de destino.

## Contenido de muestra

Las tres pistas instrumentales son composiciones sintetizadas originales, incluidas localmente en `public/audio`. Las seis canciones del catálogo reutilizan estas tres pistas. Las fotografías de Unsplash y las fuentes se sirven localmente. La aplicación no necesita credenciales ni servicios externos para reproducir el contenido.

Esta versión es una demo funcional de frontend: no incluye cuentas, pagos, backend ni el catálogo de Spotify. No está afiliada a Spotify.

## REA

REA se encuentra en `/workspace/rea`, separado del proyecto. Para analizar el código estático:

```sh
node /workspace/rea/scripts/rea.mjs analyze-javascript-application /workspace/apps/src --json
```

La CLI funciona en este entorno; los motores nativos Ghidra/IDA no están instalados.
