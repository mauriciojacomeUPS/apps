# Descargas, playlists e iPhone

## Por qué el iPhone solo mostraba el título

La herramienta original solo mostraba formularios cuando se abría en `localhost` y encontraba FFmpeg/yt-dlp. En GitHub Pages, el panel quedaba reducido a su título y una nota. GitHub Pages publica archivos estáticos y no ejecuta el servicio Node de conversión/descarga. `localhost` en el iPhone se refiere al propio teléfono, no al PC.

El panel ahora conserva sus opciones visibles y explica el estado. Puedes importar tus audios y listas en la web publicada sin que exista un servidor de descargas. Los archivos permanecen locales; Supabase sigue siendo solo para usuarios.

## Escuchar en iPhone hoy

1. Guarda tus audios MP3 o M4A en **Archivos** del iPhone, por ejemplo transfiriéndolos desde tu equipo.
2. Abre la app instalada de Onda. En **Mi música → Descargas y conversión**, pulsa **Añadir desde Archivos del iPhone**. También puedes usar **Elegir archivos** en la parte superior.
3. Selecciona las canciones y espera a que termine la importación. Se conserva una copia en ese navegador/app; no modifica el original.
4. Pulsa reproducir. Tras preparar la PWA con internet, podrás volver a escuchar estos archivos sin conexión. Usa la misma app/origen donde los añadiste.

Para preparar un resultado del servidor para la hoja nativa de compartir, usa **Preparar para compartir** y después **Compartir / Guardar en Archivos**. Son dos acciones para que el segundo toque pueda abrir el diálogo nativo después de cargar el archivo. Solo aparece si el navegador admite compartir archivos; el destino y las opciones de la hoja los decide el sistema. El enlace **Guardar archivo** sigue disponible.

## YouTube en el PC

1. Ejecuta Onda con su servidor local y FFmpeg/yt-dlp, según README.md. Abre su dirección `localhost` en ese equipo.
2. Pega un enlace a un video o a una playlist. Si usas un enlace de video con parámetro `list`, puedes marcar **Descargar toda la playlist** o preparar únicamente el video.
3. Elige el formato: MP3, M4A, FLAC o WAV. En iPhone se preselecciona M4A cuando la herramienta está disponible.
4. Cuando termine, guarda el archivo o pulsa **Añadir playlist a biblioteca**. La importación descarga una pista a la vez hacia la biblioteca local, detecta duplicados y permite detenerse; no extrae un ZIP completo en memoria.
5. Opcionalmente guarda el ZIP. Contiene los audios convertidos, `Playlist.m3u8` y un informe si alguna pista fue omitida. Puedes extraerlo en otro dispositivo e importar los archivos allí.

Las conversiones se limitan a 100 MB por audio y las playlists a 1 GB de audio. Se mantienen dos conversiones en paralelo. El ZIP y los audios individuales quedan disponibles durante 30 minutos sin transferencias; una operación nueva reemplaza la anterior. El servicio conserva los archivos temporalmente en el equipo que lo ejecuta.

La disponibilidad de yt-dlp/FFmpeg no garantiza el acceso a YouTube. Los errores distinguen restricciones de acceso, límites de solicitudes y bloqueos del proxy. En este entorno en la nube se observó un bloqueo CONNECT 403 hacia YouTube; no se afirma que se haya completado una descarga pública de YouTube aquí.

## Playlist de Spotify

Onda importa una selección de canciones, no los archivos de audio del catálogo ni las descargas protegidas de la app de Spotify.

1. Obtén un CSV con los metadatos de tu lista. [Exportify](https://exportify.app/) es una herramienta externa que consulta la API de Spotify con tu autorización; su disponibilidad depende de ese servicio y de Spotify. No necesitas conectar Spotify con Onda para leer el archivo.
2. Añade a Onda los audios que quieras utilizar en ese dispositivo.
3. Abre **Spotify · listas → Importar CSV de Spotify**, o **Biblioteca → Importar**.
4. Revisa las coincidencias y las canciones pendientes. Se compara título y artista, sin distinguir tildes o mayúsculas, y se conservan los sufijos de versión. Si hay varios archivos posibles no se elige uno automáticamente.
5. Importa la lista con las canciones encontradas. Para recuperar otras, añade sus archivos y vuelve a importar el CSV.

Ejemplo mínimo:

```csv
Track Name,Artist Name(s)
Mi canción,Mi artista
Otra canción,Otra banda
```

Se admiten comas, punto y coma y tabuladores, BOM UTF-8, campos entre comillas y saltos de línea escapados. Límites: 5 MB, 10 000 canciones y 128 columnas. Los nombres con comas o barras (como AC/DC) no se separan arbitrariamente. El importador no abre URLs ni ejecuta fórmulas del archivo y nunca solicita audio a Spotify.

## Descargas directamente desde la web en iPhone

Hace falta un servicio de descargas accesible por HTTPS además del sitio estático. Onda incluye un servicio independiente para **Render Free**, con Docker, FFmpeg y yt-dlp, límites para el plan gratuito y acceso mediante clave privada. Sigue [los pasos de despliegue y conexión](render.md). El servidor local del PC conserva sus protecciones de loopback; no se expone Vite a internet.

Desde **Conectar servidor Render**, introduce la dirección HTTPS y la clave generada por Render. El servicio comprueba YouTube al arrancar e informa si pudo obtener audio, si fue bloqueado o si la prueba falló. Hasta obtener ese resultado no se da por verificada una descarga real desde Render. **Otros sitios** permite probar enlaces públicos de SoundCloud, Bandcamp, Vimeo e Internet Archive; cada fuente puede restringir su disponibilidad.

Las descargas online admiten 32 MB por audio y 128 MB/25 pistas por lista, una operación a la vez y diez minutos para guardar el resultado. La conexión puede tardar mientras despierta Render Free. Los archivos que importas desde Archivos no se suben al servicio. Importar audios y CSV sigue funcionando sin servidor.

## Verificación

- Pruebas de CSV: comillas, delimitadores, versiones, nombres de artistas, duplicados, coincidencias ambiguas y límites.
- Prueba real de FFmpeg con un extractor local controlado: una playlist conserva el ZIP y sus pistas individuales, omite una pista fallida y respeta el origen de las solicitudes. No depende de disponibilidad de YouTube.
- Pruebas de navegador: host remoto con agente de usuario iPhone, selector de archivos, importación CSV, incorporación secuencial de pistas con duplicados y contrato Web Share con bytes reales. La simulación de Web Share verifica los datos entregados al navegador; no sustituye una prueba de la hoja nativa en un iPhone físico.
- Pruebas del servicio online: clave privada, CORS, separación de trabajos por perfil/dispositivo, enlaces temporales, caducidad, límites y rechazo de subida de archivos. Las pruebas de navegador con un servicio HTTPS simulado verifican guardado y reproducción local del audio recibido, sin incluir la clave en los enlaces.
