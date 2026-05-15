/**
 * classement.js
 * Lit data/results-2026.json (fichier maintenu manuellement après chaque épreuve).
 * Affiche le classement championnat + les résultats par épreuve.
 */

(function () {
  'use strict';

  const RESULTS_URL = 'data/results-2026.json';
  const TZ = 'Europe/Paris';

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function medalIcon(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return pos + '.';
  }

  function show(id) { const el = document.getElementById(id); if (el) el.hidden = false; }
  function hide(id) { const el = document.getElementById(id); if (el) el.hidden = true; }

  function renderChampionship(rows) {
    const tbody = document.getElementById('championship-tbody');
    const wrap  = document.getElementById('championship-wrap');
    const empty = document.getElementById('championship-empty');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      show('championship-empty');
      return;
    }

    hide('championship-empty');
    show('championship-wrap');
    tbody.innerHTML = rows.map(p => `
      <tr>
        <td class="pos-medal">${medalIcon(p.position)}</td>
        <td><strong>${esc(p.driver)}</strong></td>
        <td>${p.car ? esc(p.car) : '—'}</td>
        <td class="points-cell">${p.points != null ? p.points : '—'}</td>
      </tr>`).join('');
  }

  function renderEventResults(eventResults) {
    const container = document.getElementById('event-results-list');
    if (!container) return;

    const keys = Object.keys(eventResults || {});
    if (keys.length === 0) return;

    show('results-title');

    container.innerHTML = keys.map(evId => {
      const ev = eventResults[evId];
      const rows = ev.results || [];
      if (rows.length === 0) return '';

      const thead = `<tr><th>#</th><th>Pilote</th><th>Voiture</th><th>Points</th></tr>`;
      const tbody = rows.map(r => `
        <tr>
          <td class="pos-medal">${medalIcon(r.position)}</td>
          <td><strong>${esc(r.driver)}</strong></td>
          <td>${r.car ? esc(r.car) : '—'}</td>
          <td class="points-cell">${r.points != null ? r.points : '—'}</td>
        </tr>`).join('');

      return `
        <h3 class="event-result-title">Manche ${ev.round || ''} – ${esc(ev.name)}</h3>
        <div style="overflow-x:auto;margin-bottom:2rem">
          <table class="rankings-table">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>`;
    }).join('');
  }

  async function init() {
    try {
      const res = await fetch(RESULTS_URL + '?t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const bar = document.getElementById('update-bar');
      if (bar && data.lastUpdated) {
        bar.innerHTML = `Sync : <strong>${new Date(data.lastUpdated).toLocaleString('fr-FR', { timeZone: TZ })}</strong>`;
      }

      renderChampionship(data.championship || []);
      renderEventResults(data.eventResults || {});

    } catch (err) {
      console.error(err);
      show('championship-empty');
      const msg = document.querySelector('#championship-empty p');
      if (msg) msg.textContent = 'Impossible de charger le classement.';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
