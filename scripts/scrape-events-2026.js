/**
 * scrape-events-2026.js
 * 1. Scrape le calendrier depuis rallycrossfrance.com/courses/calendrier/
 * 2. Pour chaque épreuve terminée avec un lien its-results.com :
 *    → appelle l'API its-results.com pour trouver le dossier D3
 *    → stocke d3FolderId + les résultats clés (classement final + championnat)
 *
 * Règle anti-écrasement : si 0 événement extrait → exit(1), fichier non modifié.
 */

import { load } from 'cheerio';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const DATA_FILE     = join(__dirname, '..', 'data', 'events-2026.json');
const CALENDAR_URL  = 'https://rallycrossfrance.com/courses/calendrier/';
const BASE_URL      = 'https://rallycrossfrance.com';
const ITS_API       = 'https://api.its-results.com/v1';
const SEASON        = 2026;
const CATEGORY      = 'D3';
const DEFAULT_START = '09:00';
const DEFAULT_END   = '18:00';
const TZ_OFFSET     = '+02:00'; // CEST, tous les événements 2026

// ─── Fetch ─────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RXF-D3-Bot/1.0)', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('Réponse non-JSON');
  return res.json();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RXF-D3-Bot/1.0)', 'Accept': 'text/html', 'Accept-Language': 'fr-FR' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ─── its-results.com API ────────────────────────────────────────────────────

/** Extrait l'eventId depuis une URL its-results.com */
function extractItsEventId(url) {
  const m = url && url.match(/its-results\.com\/[^/]+\/[^/]+\/([a-f0-9-]{36})/);
  return m ? m[1] : null;
}

/** Trouve le dossier "Division 3" pour un eventId its-results */
async function fetchD3Folder(eventId) {
  try {
    const folders = await fetchJson(`${ITS_API}/Results/getFolders/${eventId}`);
    return folders.find(f => f.name.toUpperCase().includes('DIVISION 3') || f.name.includes('D3'))
      || null;
  } catch { return null; }
}

/** Retourne les résultats clés du dossier D3 */
async function fetchD3Results(folderId) {
  try {
    const sessions = await fetchJson(`${ITS_API}/Results/getSessions/${folderId}`);
    const results = { finalResultId: null, championshipResultId: null, allSessions: [] };

    for (const session of sessions) {
      const sessionSummary = { name: session.name, day: session.day || null, results: [] };
      for (const r of (session.results || [])) {
        if (!r.pdfUploaded && !r.xlsUploaded) continue;
        sessionSummary.results.push({ id: r.id, name: r.name });

        const n = r.name.toUpperCase();
        if (n.includes('MEETING') && n.includes('DÉFINITIF')) results.finalResultId = r.id;
        else if (n.includes('CHAMPIONNAT'))                     results.championshipResultId = r.id;
        else if (n.includes('CLASSEMENT FINALE') || n.includes('CLASSEMENT FINAL')) {
          if (!results.finalResultId) results.finalResultId = r.id;
        }
      }
      if (sessionSummary.results.length) results.allSessions.push(sessionSummary);
    }
    return results;
  } catch { return null; }
}

// ─── Parsing calendrier ──────────────────────────────────────────────────────

function absoluteUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
}

function deriveId(nameFull) {
  const first = nameFull.split(/\s*[–\-]\s*/)[0].trim();
  return first.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + `-${SEASON}`;
}

function parseName(rawText) {
  const name   = rawText.replace(/\s*\([^)]+\)\s*$/, '').trim();
  const city   = name.split(/\s*[–\-]\s*/)[0].trim();
  const region = (rawText.match(/\(([^-)]+?)\s*-\s*\d+\)/) || [])[1]?.trim() || null;
  return { name, city, region };
}

function parseDateRange(dateStr) {
  const parseOne = s => {
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? { day: m[1].padStart(2,'0'), month: m[2].padStart(2,'0'), year: m[3] } : null;
  };
  const parts = dateStr.split(/\s*[-–]\s*/);
  const start = parseOne(parts[0]);
  const end   = parts.length >= 2 ? parseOne(parts[parts.length - 1]) : start;
  if (!start) return { startIso: null, endIso: null, approximate: true };
  const s = start, e = end || start;
  return {
    startIso: `${s.year}-${s.month}-${s.day}T${DEFAULT_START}:00${TZ_OFFSET}`,
    endIso:   `${e.year}-${e.month}-${e.day}T${DEFAULT_END}:00${TZ_OFFSET}`,
    approximate: true,
  };
}

function classifyLink(text, href) {
  if (!text.includes('2026')) return null;
  const t = text.toUpperCase();
  const url = absoluteUrl(href);
  if (!url) return null;
  if (t.includes('RÉSULTAT') || t.includes('RESULTAT')) return { type: 'resultsUrl',    url };
  if (t.includes('LIVE'))                                 return { type: 'livePageUrl',  url };
  if (t.includes('REPLAY'))                               return { type: 'replayUrl',    url };
  if (t.includes('ENGAG'))                                return { type: 'entryListUrl', url };
  return null;
}

function computeStatus(startIso, endIso) {
  if (!startIso) return 'upcoming';
  const now   = Date.now();
  const start = new Date(startIso).getTime();
  const end   = endIso ? new Date(endIso).getTime() : start + 9 * 3600000;
  if (now > end + 3 * 3600000) return 'finished';
  if (now >= start - 30 * 60000) return 'live';
  return 'upcoming';
}

function parseCalendarEvents($) {
  const events = [];
  $('section.calendar_page .events_list .event').each((_, el) => {
    const roundAnchor = $(el).find('.round_number a').first();
    const round       = parseInt(roundAnchor.text().replace('#', ''), 10);
    const manheHref   = roundAnchor.attr('href') || '';

    const dateStr = $(el).find('.round_date').first().text().trim();
    const { startIso, endIso, approximate } = parseDateRange(dateStr);

    const nameAnchor  = $(el).find('.round_name a').first();
    const rawName     = nameAnchor.text().trim();
    const calendarUrl = absoluteUrl(nameAnchor.attr('href') || manheHref);
    const { name, city, region } = parseName(rawName);
    const id = deriveId(name);

    const links = { resultsUrl: null, livePageUrl: null, liveEmbedUrl: null, replayUrl: null, entryListUrl: null };
    $(el).find('.round_links a').each((_, a) => {
      const c = classifyLink($(a).text().trim(), $(a).attr('href') || '');
      if (c) links[c.type] = c.url;
    });

    const status = computeStatus(startIso, endIso);

    events.push({
      id, round: round || events.length + 1, name, city, region,
      startDateTime: startIso, endDateTime: endIso, approximate, status,
      category: CATEGORY, calendarUrl,
      livePageUrl:  links.livePageUrl,
      liveUrl:      links.livePageUrl,
      liveEmbedUrl: null,
      replayUrl:    links.replayUrl,
      resultsUrl:   links.resultsUrl,
      entryListUrl: links.entryListUrl,
      // Champs its-results.com (remplis ensuite)
      itsEventId:          null,
      d3FolderId:          null,
      finalResultId:       null,
      championshipResultId: null,
      notes: `Manche calendrier officiel Rallycross France ${SEASON} ; présence D3 à confirmer via liste engagés. Horaires approx. (${DEFAULT_START}–${DEFAULT_END} Europe/Paris).`,
    });
  });
  return events;
}

// ─── Enrichissement via its-results API ─────────────────────────────────────

async function enrichWithItsResults(events) {
  for (const ev of events) {
    if (ev.status !== 'finished') continue;
    const eventId = extractItsEventId(ev.resultsUrl);
    if (!eventId) continue;

    ev.itsEventId = eventId;
    console.log(`  [M${ev.round}] Récupération résultats D3 (its-results)…`);

    const folder = await fetchD3Folder(eventId);
    if (!folder) { console.warn(`    ⚠ Dossier D3 non trouvé pour ${ev.name}`); continue; }

    ev.d3FolderId = folder.id;
    console.log(`    Dossier D3 : "${folder.name}" (${folder.id})`);

    const d3res = await fetchD3Results(folder.id);
    if (d3res) {
      ev.finalResultId        = d3res.finalResultId;
      ev.championshipResultId = d3res.championshipResultId;
      const count = d3res.allSessions.reduce((a, s) => a + s.results.length, 0);
      console.log(`    ${count} résultats trouvés | finalId=${ev.finalResultId ? '✓' : '—'} | champId=${ev.championshipResultId ? '✓' : '—'}`);
    }
  }
  return events;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Scrape calendrier Rallycross France ${SEASON} ===`);
  console.log(`URL : ${CALENDAR_URL}`);

  let html;
  try {
    html = await fetchHtml(CALENDAR_URL);
    console.log('Page chargée.');
  } catch (err) {
    console.error(`✗ Erreur réseau : ${err.message}`);
    console.error('  events-2026.json NON modifié (anti-écrasement).');
    process.exit(1);
  }

  const $ = load(html);
  let events = parseCalendarEvents($);
  console.log(`Événements trouvés : ${events.length}`);

  if (events.length === 0) {
    console.error('✗ Aucun événement extrait. Structure HTML modifiée ?');
    console.error('  events-2026.json NON modifié (anti-écrasement).');
    process.exit(1);
  }

  events.sort((a, b) => (a.startDateTime || '').localeCompare(b.startDateTime || ''));

  console.log('\nEnrichissement via its-results.com API…');
  events = await enrichWithItsResults(events);

  writeFileSync(DATA_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    season: SEASON, category: CATEGORY, sourceUrl: CALENDAR_URL, events,
  }, null, 2), 'utf-8');

  console.log(`\n✓ events-2026.json mis à jour (${events.length} événements)`);
}

main().catch(err => { console.error('Erreur fatale :', err); process.exit(1); });
