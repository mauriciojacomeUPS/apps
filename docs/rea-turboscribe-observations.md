# Revisión de TurboScribe con REA

Fecha: 13 de noviembre de 2026. Referencia solicitada: <https://turboscribe.ai/es/downloader/youtube/mp3/free>.

## Alcance y evidencia

Se observó el formulario público y se probó un video corto, «Me at the zoo» (`jNQXAC9IVRw`), sin iniciar sesión. Se utilizó un navegador temporal con el proxy configurado del entorno y el modo connect del CLI público de REA. No se modificó Onda ni se integraron endpoints de TurboScribe.

| Observación | Evidence de REA | Archivo local completo |
| --- | --- | --- |
| Formulario inicial, DOM, accesibilidad, captura y tráfico | `ev_a9c850439ecb84bfef02ac56e9acd1187f2037aae21fd89bb0acf37a284136ca` | `/workspace/shared/onda-turboscribe-review/connected-evidence.json` |
| Envío del enlace y presentación del resultado | `ev_46d9b94c216464c6d15bb6994d71778b9924bd6938b9565139dcc7543852c16f` | `/workspace/shared/onda-turboscribe-review/download-evidence.json` |
| Pulsación del enlace final de descarga | `ev_92b271d048f49de1bed2af51ee474df6778e542f024566e7841ccfcfac7f7724` | `/workspace/shared/onda-turboscribe-review/follow-evidence.json` |

Las capturas visibles están en `/workspace/shared/onda-turboscribe-review/page.png` y `result.png`. Los bundles conservan el tráfico y los enlaces temporales tal como se observaron; los enlaces firmados no se presentan como recursos permanentes ni como una API de integración.

## Flujo observado

1. La página presenta un campo de URL y el botón **Descargar MP3**, sin selector de calidad o formato en el formulario observado.
2. Al probar el enlace, se registró un POST de JSON al propio dominio, en un endpoint opaco bajo `/_htmx/…`. El cuerpo seleccionado contenía únicamente `url` con el enlace público de prueba. Los nombres de cabeceras incluían `content-type`, `x-lev-xhr` y `x-turbolinks-loaded`; no se capturaron valores de cabeceras.
3. La respuesta HTTP 200 devolvió un fragmento HTML de 5427 bytes. Esa solicitud terminó en aproximadamente 2492 ms, según la temporización expuesta por el navegador en esa ejecución.
4. El resultado mostró el título «Me at the zoo», una zona de miniatura cuya imagen no cargó, el nombre **Me at the zoo.mp4**, la resolución **320×240** y enlaces **Descargar** y **Transcribir**.
5. El enlace Descargar apunta directamente a `/videoplayback` en un subdominio de `googlevideo.com`, contiene parámetros de firma/caducidad y abre otra pestaña. El parámetro de tipo observado es `mime=video/mp4`. El HTML de ese enlace no contiene un manejador de conversión; el tráfico posterior tampoco mostró una solicitud de conversión a TurboScribe.
6. REA registró el GET al CDN y su fallo `net::ERR_TUNNEL_CONNECTION_FAILED`. No se recibieron ni verificaron los bytes del archivo final. La generación de un enlace fue observada; una descarga MP3 completada no fue demostrada.

El texto de la página indica que la herramienta no permite descargar música con derechos de autor. Esa declaración de producto fue observada en el formulario; no se probó su mecanismo de aplicación. Las menciones a tres transcripciones gratuitas al día pertenecen a la oferta de transcripción y no establecen una cuota de descargas.

## Derivaciones y límites

- **Observado:** el servidor devuelve un resultado HTML con enlaces de medios. La tarjeta y el enlace de este caso identifican un MP4, aunque la página y el botón se anuncian como MP3.
- **Derivado del flujo:** la obtención del enlace se realiza mediante un servicio de TurboScribe; el botón final apunta al CDN. No se observó una conversión de audio en el navegador ni una respuesta MP3 de TurboScribe durante esta prueba.
- **Desconocido:** el extractor que usa su servidor, su infraestructura, por qué obtiene un enlace cuando las pruebas de Onda en Render fallan, y el funcionamiento con otras canciones, playlists, dispositivos o sesiones.
- **Desconocido:** si existe una API pública documentada y disponible para Onda. El endpoint del formulario observado no establece un contrato estable de integración ni prueba que pueda usarse desde GitHub Pages o Render.
- **Límite de la captura:** los eventos reflejan recepción en el observador y no incluyen pilas de iniciadores. La prueba cubre un video y una sesión de escritorio. La transferencia final falló en la conexión del proxy; eso no prueba que falle para todos los usuarios del sitio.

## Adaptación propuesta para Onda

Se puede implementar de forma independiente una interfaz con campo de enlace, estado de preparación y tarjeta de resultado con título, origen, formato y botones para guardar y añadir a la biblioteca. Onda ya contiene la mayor parte del procesamiento y la importación local; una vista previa anterior a la descarga requiere que la fuente entregue metadatos.

Para entregar MP3/M4A reales, Onda puede conservar su conversión con FFmpeg y su descarga con nombre/tipo de audio correctos. Copiar la tarjeta o reutilizar una URL temporal de GoogleVideo no aporta el acceso a la fuente que falta en Render. Una integración con otro proveedor requeriría comprobar su interfaz disponible y realizar una prueba de entrega de audio completa, además de esta observación del formulario.

## Preguntas de la revisión

| Pregunta | Resultado |
| --- | --- |
| ¿Se pudo observar la página con REA? | Sí, mediante un navegador conectado con proxy explícito. |
| ¿Se pudo solicitar y mostrar un resultado? | Sí, para un video público corto y sin cuenta. |
| ¿Se confirmó un MP3 descargado? | No; se ofreció MP4 y la transferencia del CDN quedó bloqueada. |
| ¿Se conoce cómo funciona su servidor internamente? | No; se observó la frontera HTTP y el resultado, no su implementación privada. |
| ¿Se puede reproducir el flujo visual en Onda? | Sí, como implementación propia. El acceso a YouTube sigue siendo una cuestión separada que esta prueba no resuelve. |
