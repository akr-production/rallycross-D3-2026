/**
 * classement.js – classement.html
 * Affiche les résultats de la dernière épreuve terminée via iframe its-results.com
 * + classement championnat si disponible dans une seconde iframe.
 */

(function () {
  'use strict';

  const EVENTS_URL = 'data/events-2026.json';
  const TZ = 'Europe/Paris';

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function showSection(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function hideSection(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  function setIframe(iframeId, url) {
    const el = document.getElementById(iframeId);
    if (el) el.src = url;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setLink(id, url) {
    const el = document.getElementById(id);
    if (el) el.href = url;
  }

  async function init() {
    try {
      const res = await fetch(EVENTS_URL + '?t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const bar = document.getElementById('update-bar');
      if (bar && data.lastUpdated) {
        bar.innerHTML = `Sync : <strong>${new Date(data.lastUpdated).toLocaleString('fr-FR', { timeZone: TZ })}</strong>`;
      }

      const finished = (data.events || []).filter(ev =>
        (ev.status === 'finished' || ev.status === 'done') && ev.resultsUrl
      );

      if (finished.length === 0) {
        showSection('no-results-msg');
        return;
      }

      // Dernière épreuve terminée → résultats de course
      const last = finished[finished.length - 1];
      setText('results-embed-title', `Résultats – ${last.name}`);
      setIframe('results-embed-iframe', last.resultsUrl);
      setLink('results-embed-link', last.resultsUrl);
      showSection('results-embed-section');

      // Si plusieurs épreuves terminées, cherche l'URL championnat
      // (its-results montre le classement championnat dans la même page via la navigation D3)
      // On utilise la même URL pour les deux iframes pour l'instant,
      // puisque c'est dans la même page its-results que se trouve le championnat.
      if (finished.length >= 1) {
        setIframe('standings-embed-iframe', last.resultsUrl);
        setLink('standings-embed-link', last.resultsUrl);
        showSection('standings-embed-section');
      }

    } catch (err) {
      console.error(err);
      showSection('no-results-msg');
      const msg = document.querySelector('#no-results-msg p');
      if (msg) msg.textContent = 'Impossible de charger les résultats.';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
