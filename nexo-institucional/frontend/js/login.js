/* login.js — inicio de sesión.
 *  - Modo demo: el botón entra con la cuenta de la administradora de ejemplo.
 *  - Modo servidor: pide correo y contraseña y los valida el backend (ver js/config.js).
 */
(function () {
  "use strict";

  const { api, config } = Nexo;
  const servidor = config.modo === "servidor";

  const formulario = document.getElementById("form-login");
  const boton = document.getElementById("btn-ingresar");
  const texto = boton.querySelector(".btn__texto");
  const error = document.getElementById("error-login");
  const campos = document.getElementById("campos-login");
  const textoOriginal = texto.textContent;

  campos.hidden = !servidor;

  function cargando(activo) {
    boton.disabled = activo;
    boton.classList.toggle("cargando", activo);
    boton.setAttribute("aria-busy", String(activo));
    texto.textContent = activo ? "Ingresando…" : textoOriginal;
  }

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.hidden = false;
  }

  async function ingresar(evento) {
    evento.preventDefault();
    error.hidden = true;

    let credenciales = "u1"; // cuenta de ejemplo del modo demo
    if (servidor) {
      const email = document.getElementById("l-email").value.trim();
      const password = document.getElementById("l-password").value;
      if (!email || !password) {
        mostrarError("Ingresá tu correo institucional y tu contraseña.");
        return;
      }
      credenciales = { email, password };
    }

    cargando(true);
    try {
      await api.iniciarSesion(credenciales);
      location.assign("panel.html");
    } catch (err) {
      mostrarError(err.message || "No pudimos iniciar sesión. Probá de nuevo.");
      cargando(false);
    }
  }

  formulario.addEventListener("submit", ingresar);

  // Si ya hay una sesión activa, se salta el login.
  api.sesion().then((usuario) => {
    if (usuario) location.replace("panel.html");
  }).catch(() => { /* sin servidor o sin sesión: se queda en el login */ });
})();
