# Observación pública de Spotify con REA

Revisión: 11 de noviembre de 2026. Alcance: reproductor web público sin iniciar sesión, más documentación oficial de cola y playlists. No se usó una cuenta de Spotify, no se reprodujo ni descargó música y no se inspeccionaron APIs privadas.

## Evidencia obtenida con REA

Se ejecutó la CLI existente de REA 6.8.0 (`/workspace/rea/scripts/rea.mjs`), no un análisis ordinario del código fuente de Onda.

1. **Inicio público:** `capture-browser-scenario`, conectado por CDP a una instancia temporal de Chromium 155 creada para esta investigación. Evidence padre: `ev_f4e4534dcfbfec5b1e9c867f78829c9b331c7e18392ca3e604fc75725da6d231`.
2. **Solicitud de crear playlist:** REA navegó al inicio, cerró el aviso de privacidad, pulsó «Create playlist» y esperó el resultado. Los cuatro pasos declarados terminaron. Evidence padre: `ev_f49e23dc2b81de6fba9b3ca0a095b504da9130099a495edcbb091263fb37f3ad`.

Artefactos de esta sesión, fuera del repositorio:

- `/workspace/shared/onda-current-validation/rea/spotify-connected-evidence.json`: bundle completo del inicio.
- `/workspace/shared/onda-current-validation/rea/spotify-create-evidence.json`: bundle completo de la acción de crear playlist.
- En la misma carpeta: escenarios JSON, resúmenes y texto de accesibilidad extraído.

Las capturas solicitaron DOM, accesibilidad y URL. Esas secciones fueron capturadas sin truncamiento. La cobertura global informa eventos ausentes porque no se solicitaron: no es una captura de tráfico ni prueba de la infraestructura interna de Spotify. REA informó `disconnected-external` al terminar cada captura; después se cerró el Chromium temporal que pertenecía a esta investigación.

## Lo observado directamente

El inicio expone «Home», búsqueda con el campo «What do you want to play?», «Your Library» lateral, «Create», «Create playlist», entradas de registro/acceso y una barra inferior «Now playing bar». El contenido se agrupa en secciones de descubrimiento y tarjetas con acciones de reproducción.

En la sesión sin cuenta, los controles de anterior, siguiente, pausa, aleatorio, repetición y progreso aparecían deshabilitados. Esto describe únicamente ese estado público; no se interpretó como ausencia de estas funciones en cuentas autenticadas.

Al pulsar «Create playlist», la accesibilidad mostró un mensaje con «Log in to create and share playlists» y las acciones «Not now» y «Log in». **No se creó una playlist ni se verificó la edición de una lista autenticada.**

## Lo que documenta Spotify oficialmente

Fuentes recuperadas por HTTP GET durante esta revisión:

- [Cola de reproducción](https://support.spotify.com/es/article/play-queue/): en ordenador/reproductor web, se abre junto a la barra inferior; se pueden añadir canciones, cambiar su orden, quitar entradas y borrar la cola. La acción de borrar solicita confirmación. La documentación describe arrastrar para ordenar y el menú de canción para quitar.
- [Crear y editar listas](https://support.spotify.com/es/article/create-playlists/): describe crear listas, editar título y detalles, añadir canciones, quitarlas de una lista, cambiar el orden y eliminar la lista. En ordenador, la edición de canciones utiliza su menú contextual y la ordenación por arrastre.

Estas afirmaciones proceden de la ayuda oficial, no de haber ejecutado una cuenta autenticada. Las páginas de ayuda se conservaron como HTML y texto en la carpeta de evidencia indicada.

## Aplicación a Onda

Las mejoras con mejor relación entre utilidad y alcance son gestionar la cola desde el reproductor y completar la edición de playlists personales: renombrar, quitar canciones, cambiar el orden y eliminar listas con confirmación.

Onda mantiene su diferencia solicitada: reproduce archivos seleccionados del dispositivo, guarda biblioteca y preferencias localmente por cuenta y usa Supabase solo para autenticación. No necesita ni reutiliza el catálogo, las credenciales o los servicios privados de Spotify.

Ofrecer botones de subir/bajar además de, o en lugar de, arrastre es una decisión de accesibilidad de Onda; no una observación del control exacto de Spotify. El comportamiento esperado debe validarse con pruebas de Onda, especialmente que editar una lista o la cola no borre el archivo original y que quitar una entrada de la cola no interrumpa innecesariamente la canción actual.

## Incidencia de conexión y límites

El primer intento de captura en modo launch no llegó a la página; REA informó que terminó su proceso propio. Se corrigió la ruta de red usando un Chromium temporal con el proxy heredado del entorno y verificación TLS activa, y REA se conectó a su endpoint CDP loopback. No se modificó la configuración de REA ni se desactivó la verificación TLS.

La sesión fue en inglés, sin cookies personales ni sesión de usuario. No se verificaron reproducción autenticada, ordenación real por arrastre en Spotify, límites Premium, recomendaciones personalizadas, sincronización ni contratos de sus APIs. El catálogo público puede variar por región y momento.

## Continuación de Onda: 12 de noviembre de 2026

Se reutilizó la evidencia pública anterior como referencia de navegación. Los álbumes/artistas basados en etiquetas, el historial local, la reanudación, los filtros, las portadas de playlists y la PWA son decisiones de implementación de Onda. No se presentan como funciones privadas de Spotify observadas en una cuenta.

REA también ejecutó un escenario sobre la compilación local de Onda en `/apps/#search`: rellenar «Golden Hour», abrir «Filtros», seleccionar «Onda Studio» y esperar la fila de resultado. Los cinco pasos, contando la navegación inicial, terminaron correctamente. Evidence: `ev_aea4ebcdefa7c5ee341f72594e5a02241ea09cb1c422d9752df4786b1ec71c18`.

La captura final de accesibilidad y URL quedó completa, sin truncamiento; muestra los tipos de resultado, los filtros y la canción encontrada. El informe global marca eventos ausentes porque no se solicitaron. Esta evidencia comprueba ese recorrido visible: no mide reproducción, instalación ni funcionamiento offline. Esos comportamientos se verifican por separado con las pruebas automatizadas de Onda.

El bundle completo, el escenario, el resumen y el texto de accesibilidad están en `/workspace/shared/onda-current-validation/rea/onda-search-*`, fuera del repositorio. REA se desconectó del Chromium temporal al terminar; el navegador creado para esta comprobación se cerró después. No se usaron cuentas ni archivos personales.

## Panel de invitado y navegación local

Una nueva captura del inicio público solicitado en `/intl-es` terminó en `/` y mostró «Log in», «Sign up», «Install App», búsqueda, biblioteca lateral con invitación a crear una primera playlist y una barra de reproducción de vista previa. En este estado sin sesión, la captura muestra acciones de acceso y registro; no se encontró un avatar de cuenta en el árbol de accesibilidad capturado. No se recorrió una sesión autenticada.

Evidence de REA: `ev_c8c8a084756b892d49f65913da1b2082a92a802e9363cbbb25cbdbd397dbaa14`. Tanto la navegación inicial como la espera del panel finalizaron correctamente. Accesibilidad y URL finales quedaron completas y sin truncamiento. La cobertura global omite eventos porque no se solicitaron. Los archivos `spotify-guest-panel-{scenario,evidence,summary}.json` y `spotify-guest-panel-accessibility.txt` se conservan junto a la evidencia anterior fuera del repositorio. El Chromium temporal se desconectó al terminar la captura y se cerró después de la revisión.

Onda adapta estos patrones a su biblioteca del dispositivo:

- Invitado: «Iniciar sesión» y «Opciones de Onda», sin una inicial ficticia. Usuario autenticado: inicial derivada del nombre o correo reales.
- Inicio: añadir archivos tiene prioridad; «Todo», «Mi música» y «Demo» filtran el contenido que muestran. Las selecciones e instrumentales de muestra se identifican como demo. El historial sigue basándose en reproducciones locales.
- Biblioteca: búsqueda que ignora tildes, ordenación por nombre o por las últimas aperturas y estado del almacenamiento/conexión que refleja la biblioteca. Una instalación nueva empieza sin playlists de muestra guardadas; se conservan las selecciones existentes.
- Se elimina la novedad fija de muestra de la campana. El acceso a instalación/offline y las acciones locales permanecen disponibles sin tener que crear una cuenta.

Los filtros de archivos, el orden por aperturas y la identificación local/demo son decisiones de Onda, no funciones autenticadas verificadas en Spotify. No se reproducen sus servicios, anuncios, suscripciones, catálogo comercial ni su limitación de reproducción para invitados.
