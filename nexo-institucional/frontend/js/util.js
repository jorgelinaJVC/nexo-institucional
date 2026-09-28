/* util.js — funciones pequeñas compartidas por el panel, el login y la vista pública. */
window.Nexo = window.Nexo || {};

(function () {
  "use strict";

  const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
  const MESES_LARGOS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const dos = (n) => String(n).padStart(2, "0");

  const util = {
    /** Escapa texto para insertarlo de forma segura dentro de HTML. */
    esc(texto) {
      return String(texto ?? "").replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
      ));
    },

    /** Minúsculas y sin tildes, para comparar búsquedas. */
    normalizar(texto) {
      return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    },

    /** 18 de sept de 2026 */
    fechaCorta(iso) {
      const f = new Date(iso);
      if (Number.isNaN(f.getTime())) return "—";
      return `${dos(f.getDate())} de ${MESES_CORTOS[f.getMonth()]} de ${f.getFullYear()}`;
    },

    /** 17 de septiembre de 2026 */
    fechaLarga(iso) {
      const f = new Date(iso);
      if (Number.isNaN(f.getTime())) return "—";
      return `${f.getDate()} de ${MESES_LARGOS[f.getMonth()]} de ${f.getFullYear()}`;
    },

    iniciales(nombre) {
      const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
      if (!partes.length) return "?";
      const primera = partes[0][0];
      const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
      return (primera + ultima).toUpperCase();
    },

    /** "Convocatoria de Becas 2026" -> "convocatoria-de-becas-2026" */
    slugify(texto) {
      return util.normalizar(texto)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    },

    /** 932864 -> "911 KB" */
    tamano(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    },
  };

  window.Nexo.util = util;
})();
