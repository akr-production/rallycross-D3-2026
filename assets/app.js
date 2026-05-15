/**
 * app.js – Frontend index.html
 * Embed YouTube replay et its-live.net live dans une modale plein écran.
 */

(function () {
  'use strict';

  const DATA_URL = 'data/events-2026.json';
  const TZ = 'Europe/Paris';

  // ── Utilitaires ──────────────────────────────────────────────────────────

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

  // ── Embed URLs ────────────────────────────────────────────────────────────

  /** Extrait l'ID YouTube depuis une URL watch?v= ou youtu.be */
  function youtubeEmbedUrl(url) {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : null;
  }

  /**
   * URL embed pour its-live.net.
   * Format page : https://www.its-live.net/live/rallycrossfr/2026/lessay/live
   * Le site its-live.net ne propose pas d'iframe officiel, mais on peut tenter
   * d'afficher la page elle-même en iframe. Si bloqué (X-Frame-Options), on
   * ouvre dans un nouvel onglet à la place.
   */
  function liveEmbedUrl(url) {
    if (!url) return null;
    return url; // tentative d'embed direct — géré par la modale avec fallback
  }

  // ── Modale player ─────────────────────────────────────────────────────────

  let overlay, iframeWrap;

  function initModal() {
    overlay = document.createElement('div');
    overlay.className = 'player-overlay';
    overlay.innerHTML = `
      <div class="player-box">
        <button class="player-close" title="Fermer">✕</button>
        <div class="player-iframe-wrap" id="player-iframe-wrap"></div>
      </div>`;
    document.body.appendChild(overlay);
    iframeWrap = document.getElementById('player-iframe-wrap');

    overlay.querySelector('.player-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  function openModal(embedUrl, title) {
    if (!overlay) return;
    iframeWrap.innerHTML = `<iframe src="${escHtml(embedUrl)}" allowfullscreen allow="autoplay; fullscreen" title="${escHtml(title || '')}"></iframe>`;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('open');
    iframeWrap.innerHTML = '';          // stop la vidéo
    document.body.style.overflow = '';
  }

  // ── Boutons ───────────────────────────────────────────────────────────────

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
      return modalBtn(ev.liveUrl || ev.livePageUrl, 'btn-live', '🔴 Live');
    }
    if (s === 'finished' || s === 'done') {
      return [
        replayBtn(ev.replayUrl),
        modalBtn(ev.resultsUrl, 'btn-results', '📊 Résultats'),
      ].filter(Boolean).join(' ');
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

  // ── Calendrier ───────────────────────────────────────────────────────────

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

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    initModal();

    // Expose openPlayer globalement pour les boutons onclick inline
    window.__openPlayer = openModal;

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
