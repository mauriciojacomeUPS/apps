# Referencia de Spotify para la biblioteca personal de Onda

Revisión: 4 de noviembre de 2026. Fuentes públicas oficiales consultadas sin iniciar sesión. Las cinco páginas de ayuda respondieron HTTP 200 a GET; el reproductor público respondió 200 tras redirigir de `/intl-es` a `/` y mostró contenido en inglés en esta sesión.

## Lo que aporta Spotify a este flujo

| Área             | Comportamiento documentado                                                                                                                       | Aplicación recomendada para Onda                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Biblioteca       | Lateral en escritorio/web y barra de menú en móvil; admite filtros y búsqueda. Guardar una canción no guarda automáticamente su álbum o artista. | Separar «Mis canciones», «Tus me gusta» y playlists; permitir encontrar los archivos locales por título, artista y álbum. |
| Playlists        | Crear, nombrar, añadir canciones desde su menú, quitar canciones, reordenar y eliminar listas.                                                   | Usar el menú de canción y conservar las listas localmente, separadas por cuenta, según la decisión del usuario.           |
| Cola             | Abrir desde el reproductor inferior; añadir, reordenar, quitar y vaciar canciones pendientes.                                                    | Mantener visible qué suena y qué sigue; incorporar edición de la cola gradualmente.                                       |
| Búsqueda         | Encuentra canciones, álbumes, artistas, listas, géneros y estados de ánimo; soporta filtros `track:`, `album:` y `artist:`.                      | Buscar metadatos de las canciones seleccionadas del dispositivo. Los filtros avanzados son una posible mejora posterior.  |
| Archivos propios | «Archivos locales» lee audio guardado en el dispositivo, con permisos y rutas específicos para iOS, Android y ordenador.                         | Ofrecer una sección explícita para seleccionar archivos o carpetas del dispositivo, sin subirlos a un servidor.           |

Estas son recomendaciones de producto, no una afirmación de que Onda ya implementa todas las funciones de Spotify.

## Archivos locales y biblioteca en internet

El artículo oficial de Spotify describe archivos del dispositivo y transferencia de archivos entre dispositivos. **No documenta una nube personal de archivos subidos que pueda reproducirse desde cualquier navegador.** Tampoco documenta un procedimiento de archivos locales para el reproductor web.

La decisión final del usuario para Onda es reproducir música del dispositivo, reservando Supabase exclusivamente para las cuentas. Onda permite seleccionar archivos o carpetas y conserva copias en IndexedDB, dentro del navegador. Los favoritos y playlists también son locales y se separan por cuenta. Los archivos no se suben a Supabase ni se sincronizan entre dispositivos. El sitio puede estar online en GitHub Pages y reproducir esos archivos mediante URLs locales de tipo blob.

Esta implementación web de archivos locales es una decisión de Onda; no se afirma que Spotify Web ofrezca ese mismo flujo. La autorización del navegador se limita a los archivos seleccionados por la persona.

La experiencia pública de Spotify muestra Inicio, Buscar y Tu biblioteca, secciones de descubrimiento, creación de playlists y entrada a la cuenta. Sirve como referencia para la jerarquía y navegación de Onda; esta revisión no verificó funciones de una cuenta autenticada ni la infraestructura interna de Spotify.

## Fuentes verificadas

- [Archivos locales](https://support.spotify.com/es/article/local-files/)
- [Tu biblioteca](https://support.spotify.com/es/article/your-library/)
- [Crear y editar listas](https://support.spotify.com/es/article/create-playlists/)
- [Cola de reproducción](https://support.spotify.com/es/article/play-queue/)
- [Buscar](https://support.spotify.com/es/article/search/)
- [Reproductor web público](https://open.spotify.com/intl-es)

La inspección del reproductor se realizó también en Chromium, sin sesión. No se descargó música de Spotify ni se reutilizaron sus credenciales, recursos privados o catálogo.
