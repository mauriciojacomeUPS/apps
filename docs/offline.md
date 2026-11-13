# Onda sin conexión

Onda se puede instalar como aplicación web progresiva (PWA). La música permanece en la copia local de este navegador, separada por perfil. Supabase sigue usándose únicamente para las cuentas.

## Preparar y probar

1. Publica una compilación de producción por HTTPS, por ejemplo en GitHub Pages. Para probar localmente ejecuta `npm run build -- --base=/apps/` y `npm run preview -- --port 4173 --base=/apps/`, y abre `http://localhost:4173/apps/`.
2. Con internet, abre Onda y añade canciones en **Mi música**. En **Opciones de Onda → Usar sin conexión** (o desde el perfil si has iniciado sesión), espera el estado **Lista para usar sin conexión**. La primera preparación guarda aproximadamente 4 MB de archivos públicos de la aplicación.
3. Si aparece **Instalar Onda**, úsalo. En navegadores que no muestran ese botón, busca **Instalar aplicación** o **Añadir a pantalla de inicio** en su menú. La instalación y los controles del sistema dependen del navegador y del dispositivo.
4. Reproduce una canción, pausa y desactiva la conexión. Recarga la misma dirección en el mismo navegador: debe aparecer el aviso **Sin conexión** y la biblioteca debe seguir disponible. El reproductor recupera la posición en pausa; pulsa reproducir.

El servidor de desarrollo (`npm run dev`) no registra un service worker. Usa producción/preview para verificar el funcionamiento offline. El puerto, dominio y protocolo forman parte del almacenamiento: `localhost:5173`, `localhost:4173` y GitHub Pages tienen bibliotecas independientes.

## Qué se conserva

- IndexedDB: copias de los archivos seleccionados, etiquetas y portadas incrustadas.
- Almacenamiento local por perfil: favoritos, detalles de playlists, historial de escucha y estado del reproductor. Las URLs de audio temporales se reconstruyen al abrir; no se guardan como referencias permanentes.
- Caché del service worker: únicamente HTML, JavaScript, estilos, fuentes, imágenes y audio público de muestra incluidos en la compilación. El audio local usa URLs blob de IndexedDB. No se almacenan respuestas de Supabase, sus tokens ni solicitudes de conversión en esta caché.
- Un perfil local mínimo (ID y correo) permite mantener la biblioteca del último usuario al quedarse sin conexión. Es una selección local, no una comprobación de sesión con Supabase. Para entrar, cambiar de cuenta o salir hace falta conexión; al volver internet se comprueba la sesión del cliente de autenticación. Los tokens de sesión siguen bajo la gestión del SDK de Supabase.

La aplicación no sincroniza archivos ni listas entre dispositivos. El almacenamiento es local y no cifra ni protege la biblioteca frente a otras personas con acceso al mismo perfil del navegador. Conserva los archivos originales y exporta tus listas para poder reconstruirlas si borras los datos del sitio o el navegador libera espacio.

## Actualizaciones

Una versión nueva descarga sus archivos y espera. Onda muestra **Actualizar Onda** y lo habilita al pausar la música; no recarga automáticamente una canción que esté sonando. Si hay varias ventanas abiertas, cada una muestra el aviso y permite aplicar la nueva versión sin forzar la recarga durante la reproducción.

El workflow de Pages permanece manual. Un push a `main` no publica el sitio: ejecuta **Publish Onda to GitHub Pages** cuando quieras actualizarlo.

## Verificación automatizada

`npm run test:e2e` compila bajo `/apps/` y prueba en Chromium de escritorio y móvil la instalación del service worker, el manifiesto, los recursos precargados, la recarga con la red desactivada, la conservación del volumen y la reanudación de un archivo local. También verifica que no hay URLs de Supabase, blobs ni API de conversión en la caché. La prueba de autenticación usa respuestas simuladas para comprobar aislamiento y continuidad del perfil al perder conexión; no sustituye la prueba con un proyecto real.
