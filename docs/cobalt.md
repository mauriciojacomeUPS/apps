# Cobalt experimental en Onda

Cobalt es una alternativa para preparar audio de YouTube desde el servidor en la nube. El usuario no necesita mantener encendido su PC. La web continúa en GitHub Pages y los archivos añadidos se guardan en el navegador del dispositivo.

## Activarlo en el servicio existente de Render

1. Comprueba que el servicio `onda-media` usa la rama `main` y Docker.
2. En Environment, establece `ONDA_YOUTUBE_ENGINE=cobalt` y conserva `ONDA_RUN_SOURCE_CHECK=true`. La nueva imagen ya utiliza Cobalt de forma predeterminada; la variable permite elegirlo explícitamente.
3. Conserva tu `ONDA_API_KEY` y `ONDA_ALLOWED_ORIGINS`; no hace falta crear otra clave ni otro servicio.
4. Ejecuta Manual Deploy → Deploy latest commit y espera a Live.
5. Abre `https://TU-SERVICIO.onrender.com/healthz`. Debe mostrar `youtubeEngine: "cobalt"` y `sourceCheck.engine: "cobalt"`.
6. Espera el resultado de la comprobación: solo `sourceCheck.status: "passed"` confirma que ese despliegue obtuvo audio y lo convirtió. Live confirma el arranque, no el acceso a YouTube.
7. En Onda, acepta la actualización de la PWA después de pausar la música. La configuración del servidor mostrará «Motor: Cobalt experimental».

La dirección del servicio y la clave que ya guardaste en Onda siguen siendo las del mismo servicio. El origen privado de Cobalt nunca se introduce en el navegador.

## Funcionamiento y límites

La imagen incluye la API oficial de Cobalt 11.7.1, fijada por digest. Un supervisor inicia Cobalt en `127.0.0.1:9000`, espera su disponibilidad y después inicia la API autenticada de Onda en el puerto de Render. Cobalt no se publica directamente. No se utiliza la instancia pública `api.cobalt.tools`.

Onda solicita un túnel de audio a su instancia privada, recibe el archivo con un límite de bytes y convierte con FFmpeg al formato elegido. Solo acepta túneles del mismo origen local, sin seguir redirecciones arbitrarias. La clave de Onda no se transmite al proceso ni a la API de Cobalt. Las rutas públicas conservan autorización, CORS, límites, aislamiento por perfil/dispositivo y caducidad de los resultados.

- Esta primera versión prepara **un video de YouTube por operación**. Un enlace con `list` o Mix se usa únicamente para su video; no se muestra la casilla de playlist completa. Una URL que solo identifica una playlist devuelve una explicación.
- Las otras fuentes conservan el procesamiento existente con yt-dlp.
- Se mantienen los límites del servicio online: 32 MB por audio, una operación a la vez y cinco minutos por trabajo.
- El supervisor cierra ambos procesos al apagar el servicio. Si Cobalt termina inesperadamente, cierra Onda para permitir que Render reinicie el contenedor.
- Los heaps de Node están acotados a 96 MiB para Onda y 192 MiB para Cobalt. Son límites del heap, no garantías sobre la memoria total del contenedor ni sobre la velocidad de conversión.

Cobalt puede recibir las mismas restricciones de YouTube. La integración no instala cookies de cuentas, generadores de verificaciones ni servicios de proxies. Los errores distinguen verificaciones contra bots, límites, contenido restringido, configuración de Cobalt y fallos de entrega. Nunca se presenta un MP4 como MP3 sin convertirlo.

## Volver a yt-dlp

En Render, cambia `ONDA_YOUTUBE_ENGINE` a `yt-dlp` y aplica la configuración. El supervisor iniciará únicamente Onda y el procesamiento anterior; la misma URL y clave seguirán funcionando.

## Evidencia y comprobaciones

La imagen oficial de Cobalt arranca y responde a su API en este entorno. La solicitud pública de prueba devolvió `error.api.fetch.fail`; ese resultado no demuestra acceso a YouTube desde Render. La prueba real de Render se consulta mediante `/healthz` después de desplegar.

Las pruebas de integración usan una instancia local controlada y audio original de muestra para verificar conversión M4A real, descarga autenticada, permisos temporales, límites de streams, rechazo de URLs externas, cancelación y limpieza. Las pruebas del supervisor cubren cierre, cancelación de arranque y salida inesperada del proceso hijo. Las pruebas de navegador cubren escritorio, móvil, enlace Mix como video único y el estado experimental visible.

El Docker administrado de este entorno es rootless sin cgroups: acepta parámetros de CPU/RAM, pero no los impone. La memoria se mide con RSS de los procesos; no se presenta como una prueba de límites efectivos de Render Free. Los resultados locales completos están en `/workspace/shared/onda-cobalt-validation/`.

Código y condiciones de Cobalt: [avisos de terceros](../THIRD_PARTY_NOTICES.md).
