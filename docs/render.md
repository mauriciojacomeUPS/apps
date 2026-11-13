# Servidor gratuito de descargas en Render

GitHub Pages sigue sirviendo Onda. Este servicio separado prepara audio a partir de enlaces públicos; no recibe los archivos que importas desde tu dispositivo ni usa Supabase. Puedes acceder desde casa, desde el iPhone o desde otra red, sin mantener encendido tu PC.

La imagen actual incorpora [Cobalt experimental para YouTube](cobalt.md) dentro del mismo servicio. Consulta esa guía para actualizar un servicio existente, comprobar el motor activo o volver a yt-dlp. Cobalt procesa por ahora un video por operación; el acceso real a YouTube se verifica después del despliegue.

## Desplegar

1. Entra en tu cuenta de Render y abre [Deploy to Render](https://render.com/deploy?repo=https://github.com/mauriciojacomeUPS/apps).
2. Revisa el Blueprint del repositorio: servicio **onda-media**, rama **main**, runtime **Docker**, plan **Free**. No hace falta una base de datos ni un disco de pago.
3. Crea el servicio y espera a que aparezca **Live**. El primer build instala FFmpeg y yt-dlp y puede tardar varios minutos.
4. Copia su dirección HTTPS, por ejemplo `https://onda-media-xxxx.onrender.com`.
5. En **Environment**, copia para tu uso privado el valor generado de `ONDA_API_KEY`. No lo publiques en GitHub ni lo envíes por el chat.

El Blueprint configura automáticamente el origen permitido, la clave aleatoria, los límites y la comprobación de YouTube. Las actualizaciones del servicio se despliegan manualmente: **Manual Deploy → Deploy latest commit**.

### Si ya abriste «New Web Service»

Conecta `https://github.com/mauriciojacomeUPS/apps.git`. La URL de GitHub Pages no es un repositorio. Selecciona **Docker** como runtime, rama `main`, nombre `onda-media`, directorio raíz vacío, Dockerfile `./Dockerfile` y plan **Free**. Los comandos de build y arranque los define el Dockerfile; no uses los comandos Node autocompletados del formulario.

En **Environment Variables** añade:

| Variable                | Valor                                    |
| ----------------------- | ---------------------------------------- |
| `ONDA_ALLOWED_ORIGINS`  | `https://mauriciojacomeups.github.io`    |
| `ONDA_API_KEY`          | Usa **Generate**, al menos 32 caracteres |
| `ONDA_RUN_SOURCE_CHECK` | `true`                                   |

En **Advanced**, la ruta de salud es `/healthz`. Los demás límites ya tienen los mismos valores predeterminados que el Blueprint. Si Render sigue detectando Node, vuelve a conectar el repositorio después de actualizar `main` o usa el enlace del Blueprint.

## Conectar Onda en el iPhone o PC

1. Abre [Onda](https://mauriciojacomeups.github.io/apps/) y entra en **Mi música → Descargas y conversión → Conectar servidor Render**.
2. Comprueba la dirección HTTPS del servicio e introduce tu `ONDA_API_KEY`. La publicación de este repositorio precarga `https://onda-media.onrender.com`; puedes cambiarla si utilizas otro servicio. Pulsa **Guardar y conectar**.
3. Por defecto, la clave dura solo esta sesión del navegador. **Recordar la clave en este navegador** permite conservarla en ese dispositivo si así lo decides. Cada perfil de Onda guarda su propia conexión.
4. En **YouTube** o **Otros sitios**, pega un enlace y prepara el audio. En iPhone se recomienda M4A o MP3.
5. Cuando termine, pulsa **Añadir a biblioteca** para escucharlo offline en ese dispositivo. También puedes usar **Guardar archivo** o **Preparar para compartir → Compartir / Guardar en Archivos**, cuando el navegador lo admita.

La clave nunca se añade al JavaScript de GitHub Pages. No crees una variable `VITE_*` para esa clave. La variable opcional de repositorio `VITE_MEDIA_API_URL` permite cambiar la dirección pública predeterminada en el workflow de Pages; también puedes cambiarla desde el formulario.

## Comprobar YouTube desde Render

Al arrancar, el servicio intenta obtener y convertir un video público de prueba. **Live** solo confirma que el servidor arrancó. Abre `https://TU-SERVICIO.onrender.com/healthz` para consultar `sourceCheck.status`:

| Estado     | Resultado                                                                         |
| ---------- | --------------------------------------------------------------------------------- |
| `checking` | La prueba sigue en curso; espera antes de preparar una descarga.                  |
| `passed`   | Ese servidor obtuvo audio y terminó la conversión. No garantiza todos los videos. |
| `blocked`  | La fuente rechazó o bloqueó el acceso desde ese servidor.                         |
| `failed`   | La prueba no terminó correctamente.                                               |
| `disabled` | Falta activar `ONDA_RUN_SOURCE_CHECK=true`.                                       |

Onda también muestra este resultado en la configuración del servidor. Para consultarlo desde un equipo con Node 24:

```sh
npm run check:sources -- https://TU-SERVICIO.onrender.com
```

Este comando consulta el resultado del arranque sin pedir la clave. Un reinicio o nuevo despliegue vuelve a ejecutar la prueba. Para comprobar desde el equipo local, con FFmpeg y yt-dlp instalados, usa `npm run check:sources` sin URL.

Si falla, `sourceCheck.code` y su mensaje distinguen el tiempo agotado (`probe-timeout`), límites de solicitudes (`rate-limit`), acceso requerido, rechazo 403, errores de red, falta de formatos o problemas de conversión. `elapsedMs` indica la duración. Render registra el mismo diagnóstico sin claves, rutas locales ni la salida privada del extractor.

`source-challenge` significa que YouTube pidió una verificación contra bots; es distinto de un límite HTTP 429. Onda detiene la lista ante estas restricciones y no vuelve a solicitar el video con otro formato tras un rechazo. Con «Descargar toda la playlist» desmarcado, elimina `list`, `start_radio` y otros parámetros y procesa únicamente el video. Cambiar MP3 por M4A no elimina una restricción de acceso. El panel permite seleccionar audio del dispositivo o probar otra fuente, sin dar por garantizada su disponibilidad.

YouTube puede rechazar direcciones de centros de datos, pedir autenticación o limitar solicitudes. Si ocurre, Render Free no garantiza resolverlo. La prueba de este entorno de desarrollo encontró un bloqueo de red hacia YouTube; no demuestra que Render esté bloqueado ni que allí funcione.

## Fuentes y límites

Para la fase de pruebas, consulta la [ronda de descargas reales](download-testing.md). Con `ONDA_RUN_DOWNLOAD_TESTS=true` y `ONDA_RUN_SOURCE_CHECK=true`, el arranque ejecuta la ronda completa y muestra sus resultados en Onda y en `/healthz.downloadChecks`. Al terminar la fase, desactiva `ONDA_RUN_DOWNLOAD_TESTS` para evitar repetirla tras cada despertar del servicio gratuito.

El servicio admite enlaces públicos de YouTube, SoundCloud (pistas/listas), Bandcamp (pistas/álbumes), Vimeo e Internet Archive (`/details/…`). Se utilizan extractores específicos; no es un proxy para cualquier URL. Su disponibilidad real depende de cada enlace y del acceso que permita la fuente desde Render. Spotify se mantiene como importación de CSV y coincidencias con tus archivos locales, sin descarga del audio de Spotify.

Render Free tiene recursos limitados y suspende el servicio tras un periodo sin uso. La primera conexión puede tardar alrededor de un minuto; si caduca, pulsa **Reintentar conexión**. No hay sondeos permanentes para mantenerlo despierto.

- Una operación de descarga a la vez, con una conversión simultánea.
- Hasta 32 MB por audio, 128 MB de audio por playlist y 25 pistas por lista.
- Cinco minutos máximos por operación. Empieza probando un video corto, en M4A.
- Seis operaciones por hora por perfil/dispositivo y veinte por hora en total.
- Resultados temporales durante diez minutos desde que están listos. Guarda o importa el audio dentro de ese plazo; reinicios y nuevos despliegues también pueden borrarlo.
- Los enlaces de resultado incluyen un permiso temporal para ese resultado, nunca la clave general. Evita compartirlos si quieres conservar el audio privado.

La biblioteca queda en el navegador del dispositivo donde la añadiste. Supabase continúa siendo solo para cuentas; iniciar sesión desde otro dispositivo no transfiere las canciones.

## Verificación de la implementación

Las pruebas del servicio verifican autorización, orígenes, separación de trabajos, caducidad, límites, cancelación y entrega de audio con FFmpeg y un extractor controlado. Las pruebas de navegador verifican la conexión HTTPS simulada, los encabezados privados, el guardado y la reproducción local del archivo recibido. Estas pruebas no certifican acceso a YouTube desde un servicio Render hasta consultar la comprobación de ese despliegue.
