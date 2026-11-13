# Onda

Aplicación de música en español inspirada en los patrones de navegación, biblioteca, playlists y cola de Spotify, con una diferencia central: reproduce la música que seleccionas de tu propio dispositivo.

## Cómo funciona

- La web se puede publicar en GitHub Pages.
- Supabase se utiliza **solo para registro, inicio de sesión y cierre de sesión**.
- Los archivos de audio y sus metadatos se conservan localmente en IndexedDB, dentro del navegador.
- Favoritos y playlists se guardan localmente, separados por cuenta. La cuenta no transfiere archivos ni playlists a otros dispositivos.
- No se sube música a Supabase, GitHub ni a otro servidor.
- Puedes usar la biblioteca local sin iniciar sesión. El acceso con cuenta se habilita al configurar Supabase.

Selecciona archivos o una carpeta en «En este dispositivo». La aplicación solo puede leer lo que selecciones. Se conserva una copia local para poder reproducirla después de recargar; no modifica ni borra tus archivos originales. Los cambios posteriores en el archivo original no se sincronizan automáticamente.

## Desarrollo

Requiere Node.js 24.

```sh
npm ci
npm run dev -- --port 5173
```

Para compilar:

```sh
npm run build
npm run preview -- --port 4173
```

## GitHub Pages

El workflow manual de `.github/workflows/pages.yml` compila y publica `main`. Actualizar la rama no publica la web automáticamente.

1. En GitHub, abre **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Para habilitar las cuentas, configura las variables de repositorio de la sección siguiente.
3. Ejecuta manualmente el workflow **Publish Onda to GitHub Pages** cuando quieras publicar.
4. Confirma que el job de publicación termina correctamente. La página pública no está publicada hasta que ese job finalice.

El workflow usa la ruta `/apps/` para este repositorio. Para ejecutar una compilación local equivalente:

```sh
npm run build -- --base=/apps/
npm run preview -- --port 4173 --base=/apps/
```

La navegación utiliza rutas hash para no depender de reescrituras de servidor.

## Configurar Supabase solo para usuarios

No hacen falta tablas de canciones, buckets, migraciones de biblioteca ni claves privadas de servidor.

1. Crea un proyecto en Supabase y habilita el proveedor **Email** en Authentication.
2. En **Authentication → URL Configuration**, establece como Site URL la URL de GitHub Pages y añádela a Redirect URLs. Para desarrollo, añade también `http://localhost:5173/`.
3. En GitHub, abre **Settings → Secrets and variables → Actions → Variables** y crea:
   - `VITE_SUPABASE_URL`: URL de tu proyecto.
   - `VITE_SUPABASE_ANON_KEY`: clave **Publishable** o la clave pública **anon**.
4. Vuelve a ejecutar el workflow de publicación, porque estas variables se incluyen durante la compilación.
5. Si la confirmación de correo está habilitada, cada usuario debe confirmar su correo antes de entrar. Configura el servicio de correo y sus límites en Supabase antes de ofrecer registro público a muchos usuarios.

**Nunca uses una clave secret o service_role en una variable `VITE_*`.** Las variables `VITE_*` se incluyen en el JavaScript público. La aplicación rechaza claves que no parezcan públicas.

Para desarrollo, copia `.env.example` a `.env` y completa solo las dos variables públicas. Sin ellas se puede seguir utilizando la biblioteca local y las cuentas muestran un estado de configuración pendiente.

## Biblioteca local

- MP3, AAC, M4A, M4B, FLAC, WAV, Ogg (incluido `.oga`), Opus y archivos MP4 y WebM de solo audio. La reproducción depende de los códecs del navegador. MP3 ofrece la compatibilidad más amplia.
- Hasta 100 MB por archivo.
- Los duplicados se detectan por SHA-256 del contenido.
- Los archivos no musicales de una carpeta se omiten; los archivos de audio ilegibles se identifican en el resultado de importación.
- Puedes buscar, reproducir, editar título, artista, álbum, artista del álbum, año y géneros, guardar favoritos y añadir canciones a playlists y a la cola.
- **Biblioteca → Álbumes / Artistas** organiza tus archivos según sus etiquetas. Discos del mismo nombre y distintos artistas permanecen separados; las etiquetas de disco y número de pista definen el orden del álbum.
- **Buscar → Filtros** combina artista, álbum, género y año, con resultados separados en canciones, álbumes, artistas y playlists. La búsqueda ignora mayúsculas y tildes.
- Quitar una canción de la biblioteca elimina la copia del navegador, nunca el archivo original.
- El navegador puede limitar o borrar su almacenamiento local, especialmente en navegación privada o si falta espacio. Conserva tus originales para volver a seleccionar la colección.
- Cada navegador, perfil y dispositivo tiene su propia biblioteca. Iniciar sesión en otro dispositivo no descarga tus archivos.
- El reproductor usa los formatos que admite el navegador.

## Playlists y cola

En una playlist personal, el menú de opciones permite editar el nombre, la descripción y la portada (JPG, PNG o WebP hasta 5 MB), crear una copia o eliminarla con confirmación. Las flechas de cada canción cambian su orden; su menú permite quitarla de la lista sin borrar el archivo local. Los detalles y el orden se conservan en este navegador, separados por cuenta.

El mismo menú exporta **JSON** o **M3U**. Usa **Biblioteca → Importar** para recuperar una lista: primero selecciona las canciones en ese navegador. La vista previa informa de archivos encontrados, ausentes y ambiguos. JSON identifica los archivos de Onda por su contenido; M3U usa rutas o nombres únicos. Estos archivos contienen la selección y sus detalles, nunca el audio ni la cuenta. Las URLs remotas de una M3U se omiten.

La cola muestra las canciones pendientes junto a lo que suena ahora. Puedes añadir varias veces una canción, subir o bajar cada entrada y quitarla individualmente. «Vaciar cola» pide confirmación y conserva la canción actual. Al terminar la última canción, la reproducción se detiene salvo que actives «Repetir canción».

Los patrones de referencia y los límites de la observación de Spotify están documentados en [la revisión con REA](docs/rea-spotify-observations.md).

## Panel de inicio

Sin cuenta, la cabecera muestra **Iniciar sesión** y **Opciones de Onda**. El avatar aparece solamente con una cuenta conectada y usa una inicial del nombre o correo de esa cuenta. Entrar es opcional para escuchar archivos locales.

El inicio prioriza añadir música del dispositivo. Sus filtros **Todo**, **Mi música** y **Demo** separan tu biblioteca de los instrumentales de muestra. El reproductor también identifica el origen local o demo. Las selecciones de muestra no se guardan automáticamente en bibliotecas nuevas; los favoritos y playlists existentes se conservan.

El lateral permite buscar sin distinguir tildes y ordenar playlists por **Nombre** o **Recientes** (últimas aperturas, con el orden de guardado como respaldo). Estos ajustes se conservan por perfil. El menú de opciones se cierra al pulsar Escape o fuera de él; la instalación/offline se encuentra allí y no requiere entrar a una cuenta.

## Continuar escuchando y usar sin conexión

El reproductor conserva canción, posición, orden de la cola (incluidas entradas repetidas), volumen, aleatorio y repetición para cada perfil de este navegador. Al recargar se restaura **en pausa**: pulsa reproducir para continuar. El inicio muestra las escuchadas recientemente, las recién añadidas y las más reproducidas según el uso local, sin enviar historial a un servidor.

Los controles multimedia del sistema y auriculares usan Media Session cuando el navegador la admite. Su disponibilidad en la pantalla bloqueada depende del dispositivo.

La compilación de producción es una PWA. Abre la web una vez con internet para preparar sus archivos y después podrás reabrirla y escuchar las canciones locales sin conexión. **Opciones de Onda → Usar sin conexión** (o desde el perfil si has iniciado sesión) muestra el estado; **Instalar Onda** aparece cuando el navegador ofrece instalación. Las nuevas versiones piden una actualización manual y esperan a que pauses la música. Más detalles y pasos de prueba en [uso sin conexión](docs/offline.md).

## Descargas y conversión en Onda local

En **En este dispositivo → Descargas y conversión**, pega un enlace a un video o una playlist de YouTube, o elige un archivo de audio o video. Selecciona MP3, M4A, FLAC o WAV y guarda el resultado. Puedes añadir un audio individual directamente a la biblioteca. Para una playlist, guarda el ZIP, extráelo y selecciona la carpeta resultante en Onda. Si YouTube omite algún video, el ZIP incluye un informe.

- Abre la app desde `http://localhost:5173/` o `http://127.0.0.1:5173/` con `npm run dev -- --port 5173`. La herramienta se ejecuta en ese equipo. La versión estática de GitHub Pages conserva el reproductor y la importación de archivos.
- Instala [FFmpeg](https://ffmpeg.org/download.html) para convertir y [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest) para YouTube. Puedes poner los ejecutables en el `PATH`, en `%LOCALAPPDATA%\Onda\bin` en Windows, o indicar sus rutas absolutas en `.env.local` mediante `ONDA_FFMPEG_PATH` y `ONDA_YTDLP_PATH`.
- El audio y los archivos de entrada se procesan en una carpeta temporal local. El límite es de 100 MB por archivo y 1 GB por ZIP. Guarda el resultado antes de iniciar otra operación o cerrar el servidor.

## Contenido de muestra

El catálogo inicial contiene seis títulos que reutilizan tres instrumentales originales de muestra. Las fotografías, fuentes y audio de la demo se sirven desde el sitio; los archivos que selecciona el usuario permanecen locales. Créditos en `public/ASSETS.md`.

## Referencias y REA

Consulta `docs/spotify-reference.md` para las fuentes oficiales y los patrones revisados. Onda es una aplicación independiente y no está afiliada a Spotify.

REA se encuentra separado en `/workspace/rea`. La referencia pública se observó con capturas de navegador de REA; el código fuente de Onda se revisa con herramientas ordinarias y sus pruebas. Las capturas no verifican un proyecto real de Supabase ni las funciones privadas de una cuenta de Spotify.

## Verificación

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Las pruebas de navegador usan Chromium del sistema si está disponible, o el navegador instalado por Playwright. Puedes seleccionar un ejecutable con `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Incluyen la ruta `/apps/` en escritorio y móvil, reproducción real, álbumes y artistas, filtros, importación/exportación de playlists, portadas, persistencia de la cola y reapertura offline con audio local.

La prueba de cuentas simula el servicio de autenticación de Supabase para verificar la integración y el cambio entre bibliotecas locales. No valida una conexión real a un proyecto ni el envío de correos; eso requiere configurar tu proyecto.
