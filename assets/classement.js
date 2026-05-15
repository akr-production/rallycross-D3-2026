/**
 * classement.js – Logique frontend pour classement.html
 * Charge data/rankings-2026.json et met à jour le DOM.
 */

(function () {
  'use strict';

  const RANKINGS_URL = 'data/rankings-2026.json';
  const TZ = 'Europe/Paris';

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function medalIcon(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `${pos}.`;
  }

  // ── Classement général ───────────────────────────────────────────────────

  function renderStandings(standings, parsingNote) {
    const tbody = document.getElementById('standings-tbody');
    const empty = document.getElementById('standings-empty');
    const noteEl = document.getElementById('standings-note');

    if (!tbody) return;

    if (noteEl && parsingNote) {
      noteEl.textContent = parsingNote;
      noteEl.hidden = false;
    }

    if (!standings || standings.length === 0) {
      if (empty) empty.hidden = false;
      tbody.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;

    tbody.innerHTML = standings.map(pilot => `
      <tr>
        <td class="pos-medal">${medalIcon(pilot.position)}</td>
        <td><strong>${escHtml(pilot.driver)}</strong></td>
        <td>${pilot.car ? escHtml(pilot.car) : '—'}</td>
        <td>${pilot.nationality ? escHtml(pilot.nationality) : '—'}</td>
        <td class="points-cell">${pilot.points !== null && pilot.points !== undefined ? pilot.points : '—'}</td>
      </tr>`).join('');
  }

  // ── Résultats par épreuve ────────────────────────────────────────────────

  function renderEventResults(eventResults) {
    const container = document.getElementById('event-results-container');
    if (!container) return;

    const keys = Object.keys(eventResults || {});
    if (keys.length === 0) {
      container.innerHTML = `
        <div class="no-data">
          <div class="no-data-icon">📋</div>
          <p>Aucun résultat d'épreuve disponible pour le moment.</p>
          <small>Les résultats apparaîtront au fil de la saison.</small>
        </div>`;
      return;
    }

    container.innerHTML = keys.map(id => {
      const ev = eventResults[id];
      const hasResults = ev.results && ev.results.length > 0;

      const resultsHtml = hasResults
        ? `<table class="rankings-table" style="margin-top:.75rem">
            <thead><tr><th>#</th><th>Pilote</th><th>Voiture</th><th>Points</th></tr></thead>
            <tbody>
              ${ev.results.map((r, i) => `<tr>
                <td>${medalIcon(i + 1)}</td>
                <td>${escHtml(r.driver || '—')}</td>
                <td>${r.car ? escHtml(r.car) : '—'}</td>
                <td class="points-cell">${r.points !== null && r.points !== undefined ? r.points : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>`
        : `<p style="color:var(--text-muted);font-size:.9rem;margin-top:.5rem">
            ${ev.note || 'Résultats détaillés non disponibles.'}
            ${ev.resultsUrl ? ` <a href="${escHtml(ev.resultsUrl)}" target="_blank" rel="noopener">Voir sur rallycrossfrance.com →</a>` : ''}
          </p>`;

      return `<div class="alert alert-info" style="margin-bottom:1.25rem">
        <strong>${escHtml(ev.eventName || id)}</strong>
        ${resultsHtml}
      </div>`;
    }).join('');
  }

  // ── Mise à jour info ─────────────────────────────────────────────────────

  function renderUpdateBar(lastUpdated, sourceUrl) {
    const bar = document.getElementById('update-bar');
    if (!bar) return;
    if (!lastUpdated) {
      bar.textContent = 'Données non encore synchronisées.';
      return;
    }
    const d = new Date(lastUpdated).toLocaleString('fr-FR', { timeZone: TZ });
    bar.innerHTML = `🔄 Dernière synchronisation : <strong>${d}</strong>`
      + (sourceUrl ? ` — Source : <a href="${escHtml(sourceUrl)}" target="_blank" rel="noopener">rallycrossfrance.com</a>` : '');
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    try {
      const res = await fetch(RANKINGS_URL + '?t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      renderUpdateBar(data.lastUpdated, data.sourceUrl);
      renderStandings(data.generalRanking || data.standings, data.parsingNote);
      renderEventResults(data.eventResults);

    } catch (err) {
      console.error('Erreur chargement classement :', err);
      const container = document.getElementById('standings-empty');
      if (container) {
        container.innerHTML = `
          <div class="no-data-icon">⚠️</div>
          <p>Impossible de charger le classement.</p>
          <small>${escHtml(err.message)}</small>`;
        container.hidden = false;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
