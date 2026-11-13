# Revisión de SaveFrom con REA

Fecha: 13 de noviembre de 2026. Referencia solicitada: <https://es.savefrom.net/102-youtube-music-downloader-73Yf.html>.

## Resultado observado

La solicitud HTTP mediante el proxy configurado de este entorno falló con `Tunnel connection failed: 403 Forbidden`. La política observada figura como `unrestricted` y `enforced`; eso no prueba que un destino concreto sea accesible ni permite atribuir el rechazo a la aplicación de SaveFrom.

Se intentó ejecutar el CLI público de REA, `capture-browser-scenario`, con Chromium y un perfil temporal. El resultado fue `execution_failure`, `retryable: false`. Su observación parcial indica `Scenario navigation failed before the initial state was captured`, cero pasos observados y limpieza `terminated-owned-process`.

Durante la revisión posterior de TurboScribe se identificó que REA filtra el entorno de los navegadores que lanza y no conserva `HTTP_PROXY`/`HTTPS_PROXY`; el wrapper de este intento dependía de esas variables. Por tanto, el error de navegación de REA no demuestra un rechazo de SaveFrom mediante el mismo proxy. La conexión HTTP de la sección anterior sí utilizó el proxy configurado y devolvió CONNECT 403. Para siguientes observaciones se usa el modo connect de REA con un navegador cuyo proxy se configura al crearlo.

Archivos locales de esta revisión:

- Escenario: `/workspace/shared/onda-savefrom-review/scenario.json`.
- Resultado completo del intento de REA: `/workspace/shared/onda-savefrom-review/rea-page-result.json`.
- SHA-256 del resultado: `e7ca8f63daf8b6c54efd33ea3417d7a946a88a96627d91c2f6d62f2c4c7bbecc`.

No se produjo un registro Evidence completo de la página. El JSON citado es un resultado de error con observación parcial, no una captura exitosa ni una prueba de funcionamiento del descargador.

## Preguntas y cobertura

| Pregunta | Estado | Evidencia o límite |
| --- | --- | --- |
| ¿Se puede cargar la referencia desde este entorno? | Parcial | La solicitud HTTP falló con CONNECT 403; el intento inicial de navegador no conservaba el proxy. |
| ¿Qué muestra el formulario y qué sucede al enviar un enlace? | Sin resolver | No se capturó el estado inicial ni se enviaron enlaces. |
| ¿Qué API utiliza y cómo devuelve el archivo? | Sin resolver | No se observaron solicitudes de la aplicación. |
| ¿La conversión ocurre en el navegador o en un servidor? | Sin resolver | No se dispone de tráfico ni código de la página. |
| ¿Ofrece una API documentada que podamos integrar? | Sin resolver | No se verificó documentación ni autorización de integración. |
| ¿Se puede crear un flujo parecido en Onda? | Viable como diseño independiente | La base de Onda ya admite enlaces, formatos, trabajos y resultados. No demuestra equivalencia con SaveFrom. |

## Base existente de Onda

La revisión ordinaria del código de Onda confirma que `server/media-processing.js` valida fuentes, solicita audio y convierte con FFmpeg. `src/MediaTools.jsx` permite seleccionar formato, seguir el trabajo, guardar el resultado, añadirlo a la biblioteca y preparar el archivo para compartir. Estos hechos proceden del código de Onda, no de la observación de SaveFrom.

Como propuesta independiente, se puede simplificar el formulario, detectar la fuente, mostrar título/portada/duración antes de descargar y presentar los formatos en una tarjeta. La vista previa necesita que la fuente entregue metadatos. La interfaz y el procesamiento tienen responsabilidades distintas: cambiar la interfaz no elimina el rechazo de YouTube observado en las pruebas de Render.

## Cómo continuar la revisión con REA

Desde un navegador que sí pueda abrir SaveFrom:

1. Abre DevTools → Network y activa Preserve log.
2. Realiza una prueba con un video público hasta que aparezca el resultado o el error.
3. Exporta un HAR sanitizado, sin credenciales, y adjúntalo junto con una captura del resultado.

REA puede inspeccionar ese HAR sin volver a solicitar sus URLs:

```sh
node /workspace/rea/scripts/rea.mjs inspect-web-network-capture /ruta/absoluta/savefrom.har har --detail summary --evidence_output /ruta/nueva/savefrom-har-evidence.json --format json
```

La captura permitirá identificar los orígenes observados, la secuencia de solicitudes y la entrega del resultado. No revela automáticamente la implementación privada de sus servidores ni confirma que sus endpoints estén disponibles para una integración independiente.
