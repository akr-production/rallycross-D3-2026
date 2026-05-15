/**
 * scrape-events-2026.js
 * Scrape le calendrier 2026 depuis rallycrossfrance.com/courses/calendrier/
 *
 * Structure DOM confirmée :
 *   section.calendar_page > div.events_list > div.event
 *     div.round_number > a   → #00N + href vers la page manche
 *     div.round_infos
 *       div.round_date       → "DD/MM/YYYY - DD/MM/YYYY"
 *       div.round_name > a   → nom complet + href calendarUrl
 *       div.round_links > a  → liens (Résultats 2026, LIVE 2026, Replay 2026, Engagés 2026…)
 *
 * Règle anti-écrasement : si 0 événement extrait → exit(1), fichier non modifié.
 */

import { load } from 'cheerio';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE     = join(__dirname, '..', 'data', 'events-2026.json');
const CALENDAR_URL  = 'https://rallycrossfrance.com/courses/calendrier/';
const BASE_URL      = 'https://rallycrossfrance.com';
const SEASON        = 2026;
const CATEGORY      = 'D3';
const DEFAULT_START = '09:00';
const DEFAULT_END   = '18:00';

// Tous les événements 2026 sont pendant l'heure d'été (CEST +02:00)
const TZ_OFFSET = '+02:00';

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RXF-D3-Bot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ─── Normalisation des URLs ───────────────────────────────────────────────────

function absoluteUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

// ─── ID stable depuis le nom (première partie avant « – » ou espace) ─────────

function deriveId(nameFull) {
  // "Lessay – Manche" → "lessay"
  // "Touraine – Pont de Ruan" → "touraine"
  // "Lohéac" → "loheac"
  const first = nameFull.split(/\s*[–\-]\s*/)[0].trim();
  const slug = first
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}-${SEASON}`;
}

// ─── Parsing du nom complet ───────────────────────────────────────────────────

function parseName(rawText) {
  // Retire la partie "(Région - Code)" en fin de chaîne
  const name = rawText.replace(/\s*\([^)]+\)\s*$/, '').trim();
  const city  = name.split(/\s*[–\-]\s*/)[0].trim();
  const regionMatch = rawText.match(/\(([^-)]+?)\s*-\s*\d+\)/);
  const region = regionMatch ? regionMatch[1].trim() : null;
  return { name, city, region };
}

// ─── Parsing de la plage de dates ────────────────────────────────────────────

function parseDateRange(dateStr) {
  // Format : "02/05/2026 - 03/05/2026"  ou  "28/08/2026 - 30/08/2026"
  const parseOne = (s) => {
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? { day: m[1].padStart(2, '0'), month: m[2].padStart(2, '0'), year: m[3] } : null;
  };

  const parts = dateStr.split(/\s*[-–]\s*/);
  const start = parseOne(parts[0]);
  const end   = parts.length >= 2 ? parseOne(parts[parts.length - 1]) : start;

  if (!start) return { startIso: null, endIso: null, approximate: true };

  const s = start, e = end || start;
  const startIso = `${s.year}-${s.month}-${s.day}T${DEFAULT_START}:00${TZ_OFFSET}`;
  const endIso   = `${e.year}-${e.month}-${e.day}T${DEFAULT_END}:00${TZ_OFFSET}`;

  return { startIso, endIso, approximate: true };
}

// ─── Classification des liens ─────────────────────────────────────────────────

/**
 * Retourne { type, url } uniquement pour les liens portant "2026" dans leur texte.
 * Les liens "Replay 2025", "Engagés 2025", etc. sont ignorés
 * (ce sont des références à la saison précédente).
 */
function classifyLink(text, href) {
  if (!text.includes('2026')) return null; // filtre strict : 2026 uniquement

  const t = text.toUpperCase();
  const url = absoluteUrl(href);
  if (!url) return null;

  if (t.includes('RÉSULTAT') || t.includes('RESULTAT')) return { type: 'resultsUrl',   url };
  if (t.includes('LIVE'))                                 return { type: 'livePageUrl', url };
  if (t.includes('REPLAY'))                               return { type: 'replayUrl',   url };
  if (t.includes('ENGAG'))                                return { type: 'entryListUrl', url };
  return null;
}

// ─── Statut ───────────────────────────────────────────────────────────────────

function computeStatus(startIso, endIso) {
  if (!startIso) return 'upcoming';
  const now   = Date.now();
  const start = new Date(startIso).getTime();
  const end   = endIso ? new Date(endIso).getTime() : start + 9 * 3600000;

  if (now > end + 3 * 3600000) return 'finished';
  if (now >= start - 30 * 60000) return 'live';
  return 'upcoming';
}

// ─── Parsing principal ────────────────────────────────────────────────────────

function parseEvents($) {
  const events = [];

  $('section.calendar_page .events_list .event').each((_, el) => {
    // Numéro de manche
    const roundAnchor = $(el).find('.round_number a').first();
    const roundNum    = parseInt(roundAnchor.text().replace('#', ''), 10);
    const manheHref   = roundAnchor.attr('href') || '';

    // Dates
    const dateStr = $(el).find('.round_date').first().text().trim();
    const { startIso, endIso, approximate } = parseDateRange(dateStr);

    // Nom
    const nameAnchor = $(el).find('.round_name a').first();
    const rawName    = nameAnchor.text().trim();
    const calendarUrl = absoluteUrl(nameAnchor.attr('href') || manheHref);
    const { name, city, region } = parseName(rawName);

    // ID stable
    const id = deriveId(name);

    // Liens (seulement 2026)
    const links = { resultsUrl: null, livePageUrl: null, liveEmbedUrl: null, replayUrl: null, entryListUrl: null };
    $(el).find('.round_links a').each((_, a) => {
      const classified = classifyLink($(a).text().trim(), $(a).attr('href') || '');
      if (classified) links[classified.type] = classified.url;
    });

    // Statut
    const status = computeStatus(startIso, endIso);

    events.push({
      id,
      round: roundNum || events.length + 1,
      name,
      city,
      region,
      startDateTime: startIso,
      endDateTime:   endIso,
      approximate,
      status,
      category:     CATEGORY,
      calendarUrl,
      livePageUrl:  links.livePageUrl,
      liveUrl:      links.livePageUrl,   // alias pour compatibilité frontend
      liveEmbedUrl: links.liveEmbedUrl,
      resultsUrl:   links.resultsUrl,
      replayUrl:    links.replayUrl,
      entryListUrl: links.entryListUrl,
      notes: `Manche issue du calendrier officiel Rallycross France ${SEASON} ; présence D3 à confirmer via liste des engagés/règlement particulier.`
            + (approximate ? ` Horaires approximatifs (${DEFAULT_START}–${DEFAULT_END} Europe/Paris).` : ''),
    });
  });

  return events;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Scrape calendrier Rallycross France ${SEASON} ===`);
  console.log(`URL : ${CALENDAR_URL}`);

  let html;
  try {
    html = await fetchPage(CALENDAR_URL);
    console.log('Page chargée.');
  } catch (err) {
    console.error(`✗ Erreur réseau : ${err.message}`);
    console.error('  events-2026.json NON modifié (protection anti-écrasement).');
    process.exit(1);
  }

  const $ = load(html);
  const events = parseEvents($);

  console.log(`Événements trouvés : ${events.length}`);

  if (events.length === 0) {
    console.error('✗ Aucun événement extrait. La structure HTML du site a peut-être changé.');
    console.error('  Vérifiez manuellement : ' + CALENDAR_URL);
    console.error('  events-2026.json NON modifié (protection anti-écrasement).');
    process.exit(1);
  }

  // Tri chronologique
  events.sort((a, b) => {
    if (!a.startDateTime) return 1;
    if (!b.startDateTime) return -1;
    return new Date(a.startDateTime) - new Date(b.startDateTime);
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    season:      SEASON,
    category:    CATEGORY,
    sourceUrl:   CALENDAR_URL,
    events,
  };

  writeFileSync(DATA_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`✓ events-2026.json mis à jour (${events.length} événements)`);
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
