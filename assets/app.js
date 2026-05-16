/**
 * app.js – Frontend index.html
 */

(function () {
  'use strict';

  const DATA_URL    = 'data/events-2026.json';
  const RESULTS_URL = 'data/results-2026.json';
  const TZ = 'Europe/Paris';

  let resultsData = {};  // keyed by event id

  // ── Utilitaires ─────────────────────────────────────────────────────────

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatFullDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', {
      timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function formatDateShort(iso, approximate) {
    if (!iso) return '—';
    const d    = new Date(iso);
    const date = d.toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    return `${date} · ${approximate ? '~' : ''}${time}`;
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  }

  function statusLabel(status) {
    const map = {
      upcoming: { cls: 'status-upcoming', text: 'À venir' },
      live:     { cls: 'status-live',     text: '🔴 En cours' },
      done:     { cls: 'status-done',     text: '✓ Terminé' },
      finished: { cls: 'status-done',     text: '✓ Terminé' },
    };
    return map[status] || map.upcoming;
  }

  // ── Embed URLs ─────────────────────────────────────────────────────────

  /** Extrait l'ID YouTube depuis une URL watch?v= ou youtu.be */
  function youtubeEmbedUrl(url) {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : null;
  }

  /**
   * URL embed pour YouTube Live.
   * Si l'URL est un lien YouTube, extrait l'ID et retourne l'URL embed.
   */
  function liveEmbedUrl(url) {
    if (!url) return null;
    return youtubeEmbedUrl(url) || url;
  }

  // ── Modale (vidéo iframe + table résultats) ──────────────────────────────

  let overlay, modalInner;

  function initModal() {
    overlay = document.createElement('div');
    overlay.className = 'player-overlay';
    overlay.innerHTML = `
      <div class="player-box" id="player-box">
        <button class="player-close" title="Fermer">✕</button>
        <div id="modal-inner"></div>
      </div>`;
    document.body.appendChild(overlay);
    modalInner = document.getElementById('modal-inner');

    overlay.querySelector('.player-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  function openModal(embedUrl, title) {
    if (!overlay) return;
    const box = document.getElementById('player-box');
    if (box) { box.className = 'player-box player-box--video'; }
    modalInner.innerHTML = `<div class="player-iframe-wrap"><iframe src="${escHtml(embedUrl)}" allowfullscreen allow="autoplay; fullscreen" title="${escHtml(title || '')}"></iframe></div>`;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function openResultsModal(evId) {
    if (!overlay) return;
    const ev = resultsData[evId];
    const box = document.getElementById('player-box');
    if (box) { box.className = 'player-box player-box--results'; }

    if (!ev || !ev.results || ev.results.length === 0) {
      modalInner.innerHTML = `
        <div class="results-modal-body">
          <h3 class="results-modal-title">Résultats non disponibles</h3>
          <p style="color:#6b7280;font-size:.9rem">Les résultats D3 pour cette épreuve n'ont pas encore été saisis.</p>
        </div>`;
    } else {
      const rows = ev.results.map(r => `
        <tr>
          <td style="font-weight:800;color:#0f2847">${r.position}.</td>
          <td><strong>${escHtml(r.driver)}</strong></td>
          <td style="color:#6b7280">${r.car ? escHtml(r.car) : '—'}</td>
          <td style="font-weight:800;color:#0f2847;font-size:1rem">${r.points != null ? r.points : '—'}</td>
        </tr>`).join('');

      modalInner.innerHTML = `
        <div class="results-modal-body">
          <h3 class="results-modal-title">Résultats D3 – ${escHtml(ev.name)}</h3>
          <table class="results-modal-table">
            <thead><tr><th>#</th><th>Pilote</th><th>Voiture</th><th>Points</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('open');
    modalInner.innerHTML = '';
    document.body.style.overflow = '';
  }

  // ── Boutons ──────────────────────────────────────────────────────────

  /**
   * Construit un onclick="..." avec les guillemets correctement encodés en &quot;
   * pour éviter de casser l'attribut HTML quand JSON.stringify génère des ".
   */
  function onclickOpenPlayer(src, title) {
    const js = `window.__openPlayer(${JSON.stringify(src)},${JSON.stringify(title)})`;
    return js.replace(/"/g, '&quot;');
  }

  /** Ouvre n'importe quelle URL dans la modale iframe */
  function modalBtn(url, cls, label) {
    if (!url) return '';
    return `<button class="btn ${cls}" onclick="${onclickOpenPlayer(url, label)}">${escHtml(label)}</button>`;
  }

  /** Bouton replay : YouTube → embed URL; autre → iframe direct dans modale */
  function replayBtn(url) {
    if (!url) return '';
    const src = youtubeEmbedUrl(url) || url;
    return `<button class="btn btn-replay" onclick="${onclickOpenPlayer(src, 'Replay')}">▶ Replay</button>`;
  }

  /** Retourne les boutons selon le statut uniquement */
  function eventButtons(ev) {
    const s = ev.status;
    if (s === 'live') {
      // Utilise toujours YouTube Live
      const liveUrl = ev.liveUrl || ev.livePageUrl;
      const embedUrl = liveEmbedUrl(liveUrl);
      return modalBtn(embedUrl, 'btn-live', '🔴 Live');
    }
    if (s === 'finished' || s === 'done') {
      return replayBtn(ev.replayUrl);
    }
    return ''; // upcoming → rien
  }

  // ── Compte à rebours ─────────────────────────────────────────────────────

  function startCountdown(targetIso) {
    const el = document.getElementById('countdown');
    if (!el) return;
    function tick() {
      const diff = new Date(targetIso) - Date.now();
      if (diff <= 0) { el.innerHTML = '<span class="countdown-value">🔴 LIVE</span>'; return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const val = d > 0
        ? `${d}j ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`
        : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      el.innerHTML = `<span class="countdown-value">${val}</span><span class="countdown-label">avant le départ</span>`;
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Prochaine épreuve ────────────────────────────────────────────────────

  function renderNextEvent(ev) {
    const card = document.getElementById('next-event-card');
    if (!card) return;

    if (!ev) {
      card.innerHTML = `<div class="no-data"><div class="no-data-icon">🏁</div><p>Saison terminée ou calendrier non chargé.</p></div>`;
      return;
    }

    const lieu    = [ev.city, ev.region].filter(Boolean).join(', ');
    const heure   = formatTime(ev.startDateTime);
    const dateStr = ev.startDateTime
      ? `${formatFullDate(ev.startDateTime)} · ${ev.approximate ? '~' : ''}${heure}`
      : '—';
    const links   = eventButtons(ev);

    card.innerHTML = `
      <div class="nec-left">
        <div class="nec-label">Prochaine épreuve D3 · Manche ${ev.round || '?'} · Saison 2026</div>
        <div class="nec-name">${escHtml(ev.name)}</div>
        <div class="nec-meta">
          <span>📅 ${escHtml(dateStr)}${ev.approximate ? '<span class="approx-note"> (heure approx.)</span>' : ''}</span>
          ${lieu ? `<span>📍 ${escHtml(lieu)}</span>` : ''}
        </div>
        ${links ? `<div class="nec-links">${links}</div>` : ''}
      </div>
      <div class="nec-right">
        ${ev.startDateTime ? '<div class="countdown" id="countdown"></div>' : ''}
      </div>`;

    if (ev.startDateTime) startCountdown(ev.startDateTime);
  }

  // ── Calendrier ─────────────────────────────────────────────────────────

  function renderCalendar(events) {
    const tbody = document.getElementById('calendar-tbody');
    const empty = document.getElementById('calendar-empty');
    if (!tbody) return;

    if (!events || events.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    tbody.innerHTML = events.map(ev => {
      const st    = statusLabel(ev.status);
      const lieu  = [ev.city, ev.region].filter(Boolean).join(', ') || '—';
      const links = eventButtons(ev);

      return `<tr class="row-${ev.status}">
        <td class="td-round">M${ev.round || '?'}</td>
        <td class="td-name"><strong>${escHtml(ev.name)}</strong></td>
        <td class="td-date">${formatDateShort(ev.startDateTime, ev.approximate)}</td>
        <td class="td-lieu">${escHtml(lieu)}</td>
        <td class="td-status"><span class="status-badge ${st.cls}">${st.text}</span></td>
        <td class="td-links">${links || '<span class="no-link">—</span>'}</td>
      </tr>`;
    }).join('');
  }

  // ── Init ───────────────────────────────────────────────────────────

  async function init() {
    initModal();
    window.__openPlayer  = openModal;
    window.__openResults = openResultsModal;

    // Charge les résultats en parallèle (silencieux si absent)
    fetch(RESULTS_URL + '?t=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.eventResults) resultsData = d.eventResults; })
      .catch(() => {});

    try {
      const res = await fetch(DATA_URL + '?t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const bar = document.getElementById('update-bar');
      if (bar && data.lastUpdated) {
        bar.innerHTML = `Sync : <strong>${new Date(data.lastUpdated).toLocaleString('fr-FR', { timeZone: TZ })}</strong>`;
      }

      const now  = Date.now();
      const next = (data.events || []).find(ev =>
        ev.startDateTime && new Date(ev.startDateTime).getTime() > now - 3 * 3600000
      ) || null;

      renderNextEvent(next);
      renderCalendar(data.events || []);

    } catch (err) {
      console.error(err);
      const card = document.getElementById('next-event-card');
      if (card) card.innerHTML = `<div class="no-data"><div class="no-data-icon">⚠️</div><p>Impossible de charger les données.</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
