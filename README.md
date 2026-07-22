# Recomendapp

MVP personal de descubrimiento musical basado en el historial de Spotify y Last.fm.

## Abrir

## Ejecutar y generar el instalador

1. Ejecuta `npm install`.
2. Durante desarrollo usa `npm start`.
3. Genera el instalador de Windows con `npm run dist`. Quedará en `dist/`.

## Estado de las integraciones

Abre el engranaje de la app y añade tu usuario/API key de Last.fm y el Client ID de Spotify. Last.fm no necesita autorización para leer tus datos públicos. Spotify usa PKCE: autoriza una vez en el navegador y la app conservará y renovará el vínculo localmente. La API key y los tokens se cifran automáticamente mediante la protección de credenciales de Windows; una instalación anterior en texto legible se migra al abrir la app.

En Spotify Developer Dashboard registra `http://127.0.0.1:43821/callback` como Redirect URI.

## Actualizaciones

Desde la versión 0.6.0, Recomendapp consulta GitHub Releases al abrirse. Cuando existe una versión nueva muestra un popup, la descarga dentro de la app y permite reiniciar para instalarla.
