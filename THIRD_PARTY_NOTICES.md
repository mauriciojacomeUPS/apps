# Componentes del servidor de descargas

La imagen experimental incorpora Cobalt 11.7.1 sin modificaciones como un proceso privado separado.

- Proyecto: <https://github.com/imputnet/cobalt>.
- Código fuente correspondiente: commit `a636575b09de1fc55d9b8cd98cac88f5f2f16b42`.
- API: <https://github.com/imputnet/cobalt/tree/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api>.
- Licencia de la API: GNU Affero General Public License v3.0, disponible en <https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api/LICENSE>.
- Imagen oficial: `ghcr.io/imputnet/cobalt@sha256:28540f81d2cffbd9d089c08438e39a7689a7cee7e9a5b0f60de93a22d19f5dbe`.

El código de la API incorporada se conserva en `/app/src` dentro de la imagen. Su licencia y las licencias de sus dependencias se conservan en sus archivos originales. La documentación del proyecto explica el funcionamiento y las condiciones de sus instancias alojadas; esta integración ejecuta su propia instancia y no utiliza la API pública de Cobalt.

Los demás componentes conservan sus propias licencias: [yt-dlp](https://github.com/yt-dlp/yt-dlp#license), [FFmpeg](https://ffmpeg.org/legal.html), Node.js y las dependencias registradas en el archivo de bloqueo de npm.
