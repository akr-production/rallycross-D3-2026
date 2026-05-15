/**
 * classement.js – Frontend classement.html
 */

(function () {
  'use strict';

  const RANKINGS_URL = 'data/rankings-2026.json';
  const TZ = 'Europe/Paris';

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function medalIcon(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `${pos}.`;
  }

  function renderStandings(standings, parsingNote) {
    const tbody = document.getElementById('standings-tbody');
    const empty = document.getElementById('standings-empty');
    const noteEl = document.getElementById('standings-note');

    if (noteEl && parsingNote) {
      noteEl.textContent = parsingNote;
      noteEl.hidden = false;
    }

    if (!tbody) return;

    if (!standings || standings.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    tbody.innerHTML = standings.map(p => `
      <tr>
        <td class="pos-medal">${medalIcon(p.position)}</td>
        <td><strong>${escHtml(p.driver)}</strong></td>
        <td>${p.car ? escHtml(p.car) : '—'}</td>
        <td class="points-cell">${p.points !== null && p.points !== undefined ? p.points : '—'}</td>
      </tr>`).join('');
  }

  async function init() {
    try {
      const res = await fetch(RANKINGS_URL + '?t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const bar = document.getElementById('update-bar');
      if (bar) {
        const date = data.lastChecked || data.lastUpdated;
        bar.innerHTML = date
          ? `Sync : <strong>${new Date(date).toLocaleString('fr-FR', { timeZone: TZ })}</strong>`
          : 'Données non encore synchronisées.';
      }

      renderStandings(data.generalRanking || data.standings, data.parsingNote);

    } catch (err) {
      console.error(err);
      const empty = document.getElementById('standings-empty');
      if (empty) {
        empty.querySelector('p').textContent = 'Impossible de charger le classement.';
        empty.hidden = false;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
