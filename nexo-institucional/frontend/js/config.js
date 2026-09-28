/* config.js — modo de funcionamiento del frontend.
 *  "demo"     : todo se guarda en el navegador (localStorage); sirve para abrir los archivos sin servidor.
 *  "servidor" : habla con la API real. El backend entrega su propio /js/config.js con este modo,
 *               así no hace falta tocar este archivo para pasar a producción.
 */
window.Nexo = window.Nexo || {};
window.Nexo.config = { modo: "demo", urlApi: "/api" };
