/**
 * app.js – Logique frontend pour index.html
 * Charge data/events-2026.json et met à jour le DOM.
 */

(function () {
  'use strict';

  const DATA_URL = 'data/events-2026.json';
  const TZ = 'Europe/Paris';

  // ── Utilitaires ──────────────────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', {
      timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
      timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function formatDateShort(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', {
      timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function statusLabel(status) {
    const map = {
      upcoming: { cls: 'status-upcoming', icon: '🕐', text: 'À venir' },
      live:     { cls: 'status-live',     icon: '🔴', text: 'En cours' },
      done:     { cls: 'status-done',     icon: '✓',  text: 'Terminé'  },
      finished: { cls: 'status-done',     icon: '✓',  text: 'Terminé'  },
    };
    return map[status] || map.upcoming;
  }

  function linkBtn(url, cls, icon, label) {
    if (!url) return '';
    return `<a href="${escHtml(url)}" target="_blank" rel="noopener" class="btn ${cls}">${icon} ${label}</a>`;
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Compte à rebours ─────────────────────────────────────────────────────

  function startCountdown(targetIso, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    function tick() {
      const diff = new Date(targetIso) - Date.now();
      if (diff <= 0) {
        el.innerHTML = '<span class="countdown-value">LIVE</span>';
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      if (d > 0) {
        el.innerHTML = `
          <span class="countdown-value">${d}j ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m</span>
          <span class="countdown-label">avant le départ</span>`;
      } else {
        el.innerHTML = `
          <span class="countdown-value">${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}</span>
          <span class="countdown-label">avant le départ</span>`;
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  // ── Prochaine épreuve ────────────────────────────────────────────────────

  function renderNextEvent(event) {
    const card = document.getElementById('next-event-card');
    if (!card) return;

    if (!event) {
      card.innerHTML = `
        <div class="no-data">
          <div class="no-data-icon">🏁</div>
          <p>Aucune épreuve à venir trouvée.</p>
          <small>Le calendrier sera mis à jour automatiquement.</small>
        </div>`;
      return;
    }

    const liveBtn    = linkBtn(event.liveUrl,    'btn-live',    '📺', 'Direct');
    const replayBtn  = linkBtn(event.replayUrl,  'btn-replay',  '🎬', 'Replay');
    const resultsBtn = linkBtn(event.resultsUrl, 'btn-results', '📊', 'Résultats');
    const noLive     = !event.liveUrl
      ? '<span class="btn btn-disabled">📺 Lien live non encore disponible</span>'
      : '';

    card.innerHTML = `
      <div>
        <div class="label">Prochaine épreuve D3 • Saison 2026</div>
        <div class="event-name">${escHtml(event.name)}</div>
        <div class="event-meta">
          ${event.startDateTime ? `<span>📅 ${formatDate(event.startDateTime)}${event.approximate ? ' <em style="font-size:.85em">(heure approx.)</em>' : ` à ${new Date(event.startDateTime).toLocaleTimeString('fr-FR', { timeZone: TZ, hour:'2-digit', minute:'2-digit' })}`}</span>` : ''}
          ${event.circuit  ? `<span>🏟️ ${escHtml(event.circuit)}</span>` : ''}
          ${event.location ? `<span>📍 ${escHtml(event.location)}</span>` : ''}
          ${event.round    ? `<span>Manche ${event.round}</span>` : ''}
        </div>
      </div>
      <div>
        ${event.startDateTime ? `<div class="countdown" id="countdown"></div>` : ''}
        <div class="next-event-card__links" style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem;justify-content:flex-end">
          ${liveBtn}${noLive}${replayBtn}${resultsBtn}
        </div>
      </div>`;

    if (event.startDateTime) {
      startCountdown(event.startDateTime, 'countdown');
    }
  }

  // ── Calendrier complet ───────────────────────────────────────────────────

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
      const st = statusLabel(ev.status);
      const liveBtn    = linkBtn(ev.liveUrl,    'btn-live btn',    '📺', 'Direct');
      const replayBtn  = linkBtn(ev.replayUrl,  'btn-replay btn',  '🎬', 'Replay');
      const resultsBtn = linkBtn(ev.resultsUrl, 'btn-results btn', '📊', 'Résultats');
      const links = [liveBtn, replayBtn, resultsBtn].filter(Boolean).join(' ') || '<span style="color:#9ca3af;font-size:.82rem">—</span>';

      return `<tr>
        <td style="font-weight:600;color:var(--blue)">${ev.round ? `M${ev.round}` : '—'}</td>
        <td>
          <strong>${escHtml(ev.name)}</strong>
          ${ev.circuit ? `<br><small style="color:var(--text-muted)">${escHtml(ev.circuit)}</small>` : ''}
        </td>
        <td>
          ${ev.startDateTime ? formatDateShort(ev.startDateTime) : '—'}
          ${ev.approximate ? '<br><small style="color:var(--text-muted)">heure approx.</small>' : ''}
        </td>
        <td>${ev.location ? escHtml(ev.location) : '—'}</td>
        <td><span class="status-badge ${st.cls}">${st.icon} ${st.text}</span></td>
        <td>${links}</td>
      </tr>`;
    }).join('');
  }

  // ── Mise à jour info ─────────────────────────────────────────────────────

  function renderUpdateBar(lastUpdated) {
    const bar = document.getElementById('update-bar');
    if (!bar) return;
    if (!lastUpdated) {
      bar.textContent = 'Données non encore synchronisées.';
      return;
    }
    const d = new Date(lastUpdated);
    bar.innerHTML = `🔄 Dernière synchronisation : <strong>${d.toLocaleString('fr-FR', { timeZone: TZ })}</strong>`;
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    try {
      const res = await fetch(DATA_URL + '?t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      renderUpdateBar(data.lastUpdated);

      const now = Date.now();
      const upcoming = (data.events || []).filter(ev => {
        if (!ev.startDateTime) return false;
        return new Date(ev.startDateTime).getTime() > now - 3 * 3600000;
      });

      // Prochaine = premier upcoming ou live
      const next = upcoming[0] || null;
      renderNextEvent(next);
      renderCalendar(data.events || []);

    } catch (err) {
      console.error('Erreur chargement données :', err);

      const card = document.getElementById('next-event-card');
      if (card) {
        card.innerHTML = `
          <div class="no-data">
            <div class="no-data-icon">⚠️</div>
            <p>Impossible de charger les données.</p>
            <small>Vérifiez votre connexion ou relancez la synchronisation.</small>
          </div>`;
      }

      const empty = document.getElementById('calendar-empty');
      if (empty) empty.hidden = false;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
