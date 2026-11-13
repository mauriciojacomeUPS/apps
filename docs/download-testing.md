# Pruebas reales de descarga

La fase de pruebas compara descargas completas desde el mismo servidor de Render que usa Onda. No necesita un PC encendido. Una respuesta correcta de metadatos o una URL de descarga no cuentan como éxito.

## Activar y consultar la ronda

1. Despliega la última versión de `main` con el Dockerfile de la raíz. Conserva la URL y la clave del servicio actual.
2. Conserva `ONDA_RUN_SOURCE_CHECK=true`. La imagen de esta fase incluye `ONDA_RUN_DOWNLOAD_TESTS=true` y `ONDA_COBALT_YOUTUBE_CLIENT=ANDROID`. Si esas variables existen en Environment de Render, sus valores reemplazan los de la imagen.
3. Abre `https://onda-media.onrender.com/healthz`. `downloadChecks.status` debe pasar de `running` a `complete`. Si no aparece `downloadChecks`, ese despliegue todavía no contiene esta actualización.
4. En Onda, abre **Servidor online de descargas → Pruebas reales de descarga**. El informe distingue audio verificado, fallos y pruebas omitidas. Durante la ronda, el servidor reserva su capacidad y espera antes de aceptar descargas de usuarios.
5. Al terminar esta fase, establece `ONDA_RUN_DOWNLOAD_TESTS=false`. Con `ONDA_RUN_SOURCE_CHECK=true` se conserva la comprobación breve de YouTube. Para desactivar también esa comprobación, establece ambas variables a `false`.

La ronda se ejecuta **una vez por arranque**, no al consultar `/healthz`. No existe un endpoint público que permita disparar descargas, cambiar los ejemplos o repetir pruebas. Un nuevo despliegue, reinicio o despertar de Render Free puede iniciar otra ronda mientras la variable siga activa.

## Qué se comprueba

| Caso             | Enlace fijo                                                                                | Motor                                                         |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| YouTube          | [Me at the zoo](https://www.youtube.com/watch?v=jNQXAC9IVRw)                               | Cobalt; después yt-dlp si la fuente no ha rechazado el acceso |
| Internet Archive | [Audio de prueba](https://archive.org/details/testmp3testfile)                             | yt-dlp                                                        |
| SoundCloud       | [Lostin Powers — She So Heavy](https://soundcloud.com/ethmusic/lostin-powers-she-so-heavy) | yt-dlp                                                        |
| Bandcamp         | [youtube-dl test song](https://youtube-dl.bandcamp.com/track/youtube-dl-test-song)         | yt-dlp                                                        |
| Vimeo            | [The New Vimeo Player](https://vimeo.com/76979871)                                         | yt-dlp                                                        |

Cada caso recibe hasta 60 segundos, con un máximo total de cinco minutos y un solo audio a la vez. El archivo debe tener entre 1 byte y 8 MiB, convertirse a M4A y decodificarse por completo con FFmpeg. Solo entonces aparece `verifiedAudio: true`, con su tamaño y SHA-256. Los archivos temporales se borran al terminar; no se publican los audios de prueba ni se incorporan automáticamente a las bibliotecas.

Una restricción explícita de la fuente detiene nuevos intentos contra esa misma fuente durante la ronda. No se cambian formatos para insistir tras una verificación contra bots o un límite de solicitudes. Otras fuentes siguen sus pruebas independientes.

## Diagnóstico de YouTube

Cobalt utiliza su opción documentada `CUSTOM_INNERTUBE_CLIENT`, configurada mediante `ONDA_COBALT_YOUTUBE_CLIENT`. En esta ronda se prueba `ANDROID`; la primera integración usó `IOS`. El video de prueba se mantiene igual para comparar resultados. Esto no incorpora cookies, resolución de CAPTCHA ni servicios de proxies.

El proceso privado envía un diagnóstico limitado durante la ronda: origen, ruta sin parámetros firmados, estado HTTP y código de error de red. El informe conserva como máximo 24 eventos. No captura cabeceras, cuerpos, claves o cookies; la observación se desconecta cuando termina la ronda. `upstreamCode` permite distinguir, por ejemplo, `error.api.fetch.fail` de un HTTP 403 confirmado. Un fallo genérico de Cobalt no prueba por sí solo que YouTube haya bloqueado la IP.

## Resultados y alcance

El 13 de noviembre de 2026, las pruebas desde el **entorno administrado de desarrollo** consiguieron estos M4A reales:

| Fuente           |   Bytes | Duración | Decodificación completa |
| ---------------- | ------: | -------: | ----------------------- |
| Internet Archive |  215243 |  12,41 s | Correcta                |
| SoundCloud       | 3561589 | 143,22 s | Correcta                |
| Bandcamp         |  208680 |   9,85 s | Correcta                |

El ejemplo de Vimeo pidió acceso. Las evidencias, hashes y resultados de reproducción se guardan en `/workspace/shared/onda-download-matrix/`. Estos resultados no certifican disponibilidad desde Render ni para todos los enlaces de esas webs. Los resultados de Render deben consultarse después de desplegar mediante `downloadChecks`, con su fecha `checkedAt`.

Se corrigieron dos problemas descubiertos con Internet Archive: el filtro debe usar el nombre de extractor `archive\.org`, y un elemento con un único audio puede devolver metadatos de video sin `entries`. yt-dlp usa ahora la confianza TLS del sistema (`no-certifi`) para reconocer las CA instaladas; la verificación de certificados permanece activada.

Las pruebas automatizadas del código utilizan extractores controlados y respuestas simuladas para verificar límites, cancelación, errores, estados de la interfaz y permisos. Esos contratos no cuentan como descargas reales de las plataformas. El Docker de desarrollo sigue sin imponer cgroups; sus mediciones de RSS no certifican los límites de CPU o RAM de Render.
