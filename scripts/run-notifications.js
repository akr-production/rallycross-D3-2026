/**
 * run-notifications.js
 * Envoie des emails de notification via Resend avant les épreuves D3 2026.
 *
 * Fenêtres : 24h, 12h, 1h avant startDateTime + live-start.
 * Anti-doublons : data/notifications-log.json
 * Secrets requis (GitHub Actions / .env local) :
 *   RESEND_API_KEY, TARGET_EMAIL, FROM_EMAIL
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_FILE   = join(__dirname, '..', 'data', 'events-2026.json');
const LOG_FILE      = join(__dirname, '..', 'data', 'notifications-log.json');

const RESEND_API_URL = 'https://api.resend.com/emails';
const MARGIN_MIN     = parseInt(process.env.NOTIF_MARGIN_MIN || '30', 10); // ±minutes

const WINDOWS = [
  { key: '24h',        offsetH: 24,  label: '24 heures avant' },
  { key: '12h',        offsetH: 12,  label: '12 heures avant' },
  { key: '1h',         offsetH:  1,  label: '1 heure avant'   },
  { key: 'live-start', offsetH:  0,  label: 'Départ live'     },
];

// ─── Secrets ───────────────────────────────────────────────────────────────
function loadSecrets() {
  const apiKey     = process.env.RESEND_API_KEY  || null;
  const targetEmail = process.env.TARGET_EMAIL   || null;
  const fromEmail   = process.env.FROM_EMAIL     || null;

  const missing = [];
  if (!apiKey)      missing.push('RESEND_API_KEY');
  if (!targetEmail) missing.push('TARGET_EMAIL');
  if (!fromEmail)   missing.push('FROM_EMAIL');

  return { apiKey, targetEmail, fromEmail, missing };
}

// ─── Log ───────────────────────────────────────────────────────────────────
function loadLog() {
  try {
    return JSON.parse(readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    return { sent: [] };
  }
}

function saveLog(log) {
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
}

function alreadySent(log, eventId, windowKey) {
  return log.sent.some(e => e.eventId === eventId && e.window === windowKey);
}

function markSent(log, eventId, windowKey, eventName) {
  log.sent.push({
    eventId,
    window: windowKey,
    eventName,
    sentAt: new Date().toISOString(),
  });
}

// ─── Email ─────────────────────────────────────────────────────────────────
function buildEmailBody(event, windowLabel) {
  const dateStr = event.startDateTime
    ? new Date(event.startDateTime).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' })
    : 'Date inconnue';

  const lines = [
    `<h2>Rallycross France 2026 – Catégorie D3</h2>`,
    `<p><strong>${event.name}</strong></p>`,
    `<p>🏁 Départ prévu : <strong>${dateStr}</strong>${event.approximate ? ' <em>(heure approximative)</em>' : ''}</p>`,
  ];

  if (event.circuit)  lines.push(`<p>🗺️ Circuit : ${event.circuit}</p>`);
  if (event.location) lines.push(`<p>📍 Lieu : ${event.location}</p>`);
  if (event.liveUrl)  lines.push(`<p>📺 <a href="${event.liveUrl}">Suivre en direct</a></p>`);
  else                lines.push(`<p>📺 Lien live non encore disponible.</p>`);

  if (event.replayUrl)  lines.push(`<p>🎬 <a href="${event.replayUrl}">Voir le replay</a></p>`);
  if (event.resultsUrl) lines.push(`<p>📊 <a href="${event.resultsUrl}">Résultats</a></p>`);

  lines.push(`<hr><p style="color:#888;font-size:0.85em">Notification envoyée ${windowLabel} – RallycrossD3 2026</p>`);

  return lines.join('\n');
}

async function sendEmail({ apiKey, fromEmail, targetEmail }, subject, htmlBody) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [targetEmail],
      subject,
      html: htmlBody,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API ${res.status} : ${body}`);
  }
  return res.json();
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Notifications Rallycross D3 2026 ===');

  const secrets = loadSecrets();
  if (secrets.missing.length > 0) {
    console.warn(`⚠ Secrets manquants : ${secrets.missing.join(', ')}`);
    console.warn('  Les emails ne seront pas envoyés.');
    console.warn('  Configurez ces secrets dans GitHub Actions (Settings → Secrets → Actions).');
    return;
  }

  let eventsData;
  try {
    eventsData = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'));
  } catch {
    console.error('✗ Impossible de lire events-2026.json. Lancez d\'abord npm run scrape.');
    process.exit(1);
  }

  const log = loadLog();
  const now = Date.now();
  const marginMs = MARGIN_MIN * 60 * 1000;

  let sent = 0;
  let skipped = 0;

  for (const event of eventsData.events || []) {
    if (!event.startDateTime) continue;
    if (event.status === 'done') continue;

    const startMs = new Date(event.startDateTime).getTime();

    for (const win of WINDOWS) {
      const triggerMs = startMs - win.offsetH * 3600 * 1000;
      const inWindow = Math.abs(now - triggerMs) <= marginMs;

      if (!inWindow) continue;
      if (alreadySent(log, event.id, win.key)) {
        console.log(`  [skip] ${event.id} – ${win.key} (déjà envoyé)`);
        skipped++;
        continue;
      }

      const subject = `[RX D3 2026] ${event.name} – ${win.label}`;
      const html = buildEmailBody(event, win.label);

      try {
        await sendEmail(secrets, subject, html);
        markSent(log, event.id, win.key, event.name);
        saveLog(log);
        console.log(`  ✓ Email envoyé : ${event.id} – ${win.key}`);
        sent++;
      } catch (err) {
        console.error(`  ✗ Erreur envoi (${event.id} – ${win.key}) : ${err.message}`);
      }
    }
  }

  console.log(`\nRécapitulatif : ${sent} envoyé(s), ${skipped} ignoré(s) (doublon)`);
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
