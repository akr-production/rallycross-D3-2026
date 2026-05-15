/**
 * update-rankings-2026.js
 * Tente d'extraire le classement Division 3 2026 depuis rallycrossfrance.com/courses/championnats-2026/
 *
 * Architecture réelle du site :
 *   - La page rallycrossfrance.com/courses/championnats-2026/ contient un <iframe>
 *     pointant vers ffsa.org (classement rendu côté client via JS).
 *   - ffsa.org charge les standings via des appels JS après rendu — inaccessibles en fetch statique.
 *
 * Comportement :
 *   1. Fetch la page championnats pour extraire l'URL iframe (rankingsSourceUrl).
 *   2. Tente de parser __NEXT_DATA__ de ffsa.org pour tout classement D3 disponible.
 *   3. Si le classement D3 n'est pas trouvé → conserve l'ancien rankings-2026.json, warning, exit 0.
 *   4. Ne jamais inventer de points.
 */

import { load } from 'cheerio';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname       = dirname(fileURLToPath(import.meta.url));
const RANKINGS_FILE   = join(__dirname, '..', 'data', 'rankings-2026.json');
const EVENTS_FILE     = join(__dirname, '..', 'data', 'events-2026.json');
const CHAMPIONNATS_URL = 'https://rallycrossfrance.com/courses/championnats-2026/';
const BASE_URL        = 'https://rallycrossfrance.com';
const SEASON          = 2026;
const CATEGORY        = 'D3';

// Identifiants ffsa.org pour le Championnat de France de Rallycross 2026
const FFSA_CHAMPIONSHIP_ID  = 142;
const FFSA_SEASON_ID        = 44;   // season=44 correspond à 2026 dans ffsa.org
const FFSA_SUBCATEGORY_D3   = 6510; // subCategory=6510 correspond à Division 3

const FFSA_IFRAME_URL = `https://www.ffsa.org/championnats-et-coupes/championnat-de-france-de-rallycross-${FFSA_CHAMPIONSHIP_ID}?season=${FFSA_SEASON_ID}&subCategory=${FFSA_SUBCATEGORY_D3}#classements`;

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

// ─── Extraction de l'URL iframe depuis rallycrossfrance.com ──────────────────

function extractIframeUrl(html) {
  const $ = load(html);
  const iframe = $('iframe').first();
  const src = iframe.attr('src') || null;
  return src;
}

// ─── Tentative de parsing __NEXT_DATA__ de ffsa.org ──────────────────────────

/**
 * ffsa.org est une app Next.js. Les standings sont chargés côté client
 * (via JS, après rendu). Ils ne figurent PAS dans __NEXT_DATA__.
 * Cette fonction tente quand même d'extraire toute donnée utile disponible
 * dans le HTML statique (metadata, liens, etc.).
 * Retourne null si aucun classement D3 n'est trouvé.
 */
function parseNextDataForD3(html) {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  // Les standings sont absents du SSR initial — ffsa.org les charge via JS.
  // On extrait uniquement les metadata disponibles pour confirmation.
  const champ = data?.props?.pageProps?.championship;
  if (!champ) return null;

  const seasons = champ.seasons || {};
  const seasonYear = Object.entries(seasons).find(([, year]) => year === SEASON);

  return {
    championshipName: champ.name || null,
    seasonConfirmed: !!seasonYear,
    note: 'Les classements ffsa.org sont rendus côté client (JavaScript). Données non accessibles via fetch statique.',
  };
}

// ─── Classement D3 : tentative via tables HTML (fallback championnats page) ──

function parseD3StandingsFromHtml(html) {
  const $ = load(html);
  const standings = [];

  $('table').each((_, table) => {
    const text = $(table).text().toUpperCase();
    if (!text.includes('D3') && !text.includes('DIVISION 3')) return;
    if (standings.length > 0) return;

    let headerFound = false;
    let colPos = {};

    $(table).find('tr').each((ri, row) => {
      const cells = $(row).find('td, th').map((_, c) => $(c).text().trim()).get();
      if (!cells.length) return;
      const upper = cells.map(c => c.toUpperCase());

      if (!headerFound && (upper.some(h => h.includes('PILOTE') || h.includes('DRIVER') || h === 'POS' || h === '#'))) {
        headerFound = true;
        upper.forEach((h, i) => {
          if (h === 'POS' || h === '#' || h === 'CL')       colPos.pos      = i;
          else if (h.includes('PILOTE') || h.includes('NOM')) colPos.driver  = i;
          else if (h.includes('VOITURE') || h.includes('CAR')) colPos.car    = i;
          else if (h.includes('POINT') || h === 'PTS')       colPos.points   = i;
          else if (h.includes('NAT') || h.includes('PAYS'))  colPos.nationality = i;
        });
        return;
      }

      if (headerFound) {
        const driver = colPos.driver !== undefined ? cells[colPos.driver] : cells[1] || null;
        if (!driver || driver.length < 2) return;
        const pos    = colPos.pos !== undefined ? parseInt(cells[colPos.pos], 10) : ri;
        const car    = colPos.car !== undefined ? cells[colPos.car] : null;
        const ptsRaw = colPos.points !== undefined ? cells[colPos.points] : null;
        const pts    = ptsRaw !== null ? parseInt(ptsRaw, 10) : null;
        const nat    = colPos.nationality !== undefined ? cells[colPos.nationality] : null;

        if (Number.isNaN(pos)) return;
        standings.push({
          position:    pos || ri,
          driver,
          car:         car || null,
          nationality: nat || null,
          points:      Number.isNaN(pts) ? null : pts,
        });
      }
    });
  });

  return standings;
}

// ─── Lecture du fichier existant (pour préservation) ─────────────────────────

function loadExistingRankings() {
  if (!existsSync(RANKINGS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(RANKINGS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// ─── Événements terminés avec resultsUrl ─────────────────────────────────────

function buildEventResultsMap() {
  let eventsData = { events: [] };
  try {
    eventsData = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'));
  } catch {
    // events file not found — skip
  }
  const map = {};
  for (const ev of eventsData.events || []) {
    if (ev.status === 'finished' && ev.resultsUrl) {
      map[ev.id] = {
        eventName:  ev.name,
        resultsUrl: ev.resultsUrl,
        results:    [],
        note:       'Résultats détaillés non parsés automatiquement. Voir resultsUrl.',
      };
    }
  }
  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Mise à jour classement ${SEASON} – ${CATEGORY} ===`);
  console.log(`URL source : ${CHAMPIONNATS_URL}`);

  const existing = loadExistingRankings();

  // ── Étape 1 : récupère la page championnats pour trouver l'iframe ─────────
  let iframeSrc = FFSA_IFRAME_URL;
  try {
    const html = await fetchPage(CHAMPIONNATS_URL);
    const extracted = extractIframeUrl(html);
    if (extracted) {
      iframeSrc = extracted.startsWith('http') ? extracted : `${BASE_URL}${extracted}`;
      console.log(`iframe détectée : ${iframeSrc}`);
    }
  } catch (err) {
    console.warn(`⚠ Impossible de charger la page championnats : ${err.message}`);
  }

  // ── Étape 2 : tente de lire ffsa.org ─────────────────────────────────────
  let generalRanking = [];
  let ffsameta = null;
  const ffosaBaseUrl = iframeSrc.split('#')[0];

  try {
    console.log(`Tentative ffsa.org : ${ffosaBaseUrl}`);
    const ffsaHtml = await fetchPage(ffosaBaseUrl);

    // Test parsing __NEXT_DATA__
    ffsameta = parseNextDataForD3(ffsaHtml);
    if (ffsameta) {
      console.log(`ffsa.org chargé — ${ffsameta.note}`);
    }

    // Test fallback : tableau HTML D3 dans la page (peu probable mais on essaie)
    generalRanking = parseD3StandingsFromHtml(ffsaHtml);
    console.log(`Pilotes D3 trouvés dans le classement : ${generalRanking.length}`);

  } catch (err) {
    console.warn(`⚠ Erreur accès ffsa.org : ${err.message}`);
  }

  // ── Étape 3 : pas de données → préserver l'ancien fichier ────────────────
  if (generalRanking.length === 0) {
    console.warn('⚠ Aucun classement D3 extrait.');
    console.warn('  Raison probable : les standings ffsa.org sont rendus côté client');
    console.warn(`  et ne sont pas accessibles via fetch statique.`);
    console.warn(`  Classement consultable manuellement : ${iframeSrc}`);

    if (existing) {
      console.log('  rankings-2026.json conservé (données précédentes inchangées).');
      // Met à jour les métadonnées, normalise le nom du champ standings→generalRanking
      const updated = {
        lastUpdated:       existing.lastUpdated,
        lastChecked:       new Date().toISOString(),
        season:            existing.season      || SEASON,
        category:          existing.category    || CATEGORY,
        rankingsSourceUrl: iframeSrc,
        parsingNote:       `Classement D3 non accessible automatiquement (rendu JS côté client sur ffsa.org). Consultez : ${iframeSrc}`,
        generalRanking:    existing.generalRanking || existing.standings || [],
        eventResults:      existing.eventResults || buildEventResultsMap(),
      };
      writeFileSync(RANKINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
      console.log('  lastChecked mis à jour.');
    } else {
      console.warn('  Aucun fichier rankings existant — création avec structure vide.');
      const empty = {
        lastUpdated:       new Date().toISOString(),
        lastChecked:       new Date().toISOString(),
        season:            SEASON,
        category:          CATEGORY,
        rankingsSourceUrl: iframeSrc,
        parsingNote:       `Classement D3 non accessible automatiquement (rendu JS côté client sur ffsa.org). Consultez : ${iframeSrc}`,
        generalRanking:    [],
        eventResults:      buildEventResultsMap(),
      };
      writeFileSync(RANKINGS_FILE, JSON.stringify(empty, null, 2), 'utf-8');
    }
    return; // sortie propre, pas d'exit(1)
  }

  // ── Étape 4 : données trouvées → écriture ────────────────────────────────
  const output = {
    lastUpdated:       new Date().toISOString(),
    lastChecked:       new Date().toISOString(),
    season:            SEASON,
    category:          CATEGORY,
    rankingsSourceUrl: iframeSrc,
    parsingNote:       null,
    generalRanking,
    eventResults:      buildEventResultsMap(),
  };

  writeFileSync(RANKINGS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`✓ rankings-2026.json mis à jour (${generalRanking.length} pilotes D3)`);
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
