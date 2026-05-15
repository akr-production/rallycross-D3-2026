# Rallycross D3 France 2026

Site statique de suivi du Rallycross France 2026, catégorie **D3**.

- Calendrier avec prochaine épreuve et compte à rebours
- Liens live / replay / résultats automatiquement récupérés
- Classement général D3 mis à jour automatiquement
- Notifications email via [Resend](https://resend.com) (24 h, 12 h, 1 h avant chaque épreuve + live)
- Synchronisation automatique toutes les 6 heures via GitHub Actions
- Hébergement gratuit sur GitHub Pages

---

## Installation locale

### Prérequis

- [Node.js 20+](https://nodejs.org/)
- npm (inclus avec Node.js)

```bash
git clone https://github.com/<votre-username>/rallycross-d3-2026.git
cd rallycross-d3-2026
npm install
```

### Lancer la synchronisation en local

```bash
# Scraper le calendrier (réécrit data/events-2026.json)
npm run scrape

# Mettre à jour le classement (réécrit data/rankings-2026.json)
npm run rankings

# Envoyer les notifications (nécessite les secrets ci-dessous)
npm run notify

# Tout en une commande
npm run sync
```

### Variables d'environnement pour les notifications (test local)

Créez un fichier `.env` **non commité** à la racine :

```
RESEND_API_KEY=re_xxxxxxxxxxxx
TARGET_EMAIL=votre@email.com
FROM_EMAIL=rallycross@votredomaine.com
NOTIF_MARGIN_MIN=30
```

Puis chargez-le avant npm run notify :

```bash
# Linux/macOS
export $(cat .env | xargs) && npm run notify

# Windows PowerShell
Get-Content .env | ForEach-Object { $k,$v = $_ -split '=',2; [System.Environment]::SetEnvironmentVariable($k,$v) }
npm run notify
```

> **Important :** `.env` ne doit jamais être commité. Il n'est pas dans ce repo.

### Serveur de développement local

Aucun build nécessaire. Ouvrez simplement `index.html` avec un serveur statique :

```bash
# Option 1 – npx serve (recommandé)
npx serve .

# Option 2 – Python
python -m http.server 8080

# Option 3 – VS Code Live Server extension
```

Puis ouvrez : http://localhost:3000 (ou le port affiché)

---

## Créer le dépôt GitHub

```bash
# Depuis la racine du projet
git init
git add .
git commit -m "feat: init rallycross-d3-2026"

# Créez le repo sur github.com (sans initialiser avec README)
# puis :
git remote add origin https://github.com/<votre-username>/rallycross-d3-2026.git
git branch -M main
git push -u origin main
```

---

## Activer GitHub Pages

1. Allez dans **Settings** → **Pages** de votre dépôt
2. Dans **Source**, choisissez **GitHub Actions**
3. Sauvegardez

Le workflow `pages.yml` se déclenchera automatiquement à chaque push sur `main`.
L'URL sera : `https://<votre-username>.github.io/rallycross-d3-2026/`

---

## Configurer les secrets Resend (notifications email)

1. Créez un compte sur [resend.com](https://resend.com) (gratuit)
2. Créez une API key dans **API Keys**
3. Ajoutez un domaine vérifié (ou utilisez `onboarding@resend.dev` pour les tests)
4. Dans votre dépôt GitHub : **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Ajoutez ces 3 secrets :

| Nom | Description | Exemple |
|-----|-------------|---------|
| `RESEND_API_KEY` | Clé API Resend | `re_abc123...` |
| `TARGET_EMAIL` | Email destinataire des notifications | `votre@email.com` |
| `FROM_EMAIL` | Email expéditeur (doit être vérifié dans Resend) | `rallycross@votredomaine.com` |

> Si les secrets ne sont pas configurés, le script affiche un avertissement et continue sans planter.

---

## Lancer le workflow manuellement

```
GitHub → onglet "Actions" → "Sync données D3 2026" → "Run workflow"
```

Ou via GitHub CLI :

```bash
gh workflow run sync.yml
```

Pour déclencher sans notifications email :

```bash
gh workflow run sync.yml -f skip_notifications=true
```

---

## Structure du projet

```
.
├── index.html               # Page calendrier + prochaine épreuve
├── classement.html          # Page classement général + résultats
├── assets/
│   ├── styles.css           # Styles globaux (responsive)
│   ├── app.js               # JS frontend – calendrier
│   └── classement.js        # JS frontend – classement
├── data/
│   ├── events-2026.json     # Calendrier D3 2026 (mis à jour par scrape)
│   ├── rankings-2026.json   # Classement D3 2026 (mis à jour automatiquement)
│   └── notifications-log.json # Journal des notifications envoyées
├── scripts/
│   ├── scrape-events-2026.js    # Scraper calendrier (rallycrossfrance.com)
│   ├── update-rankings-2026.js  # Mise à jour classement
│   └── run-notifications.js     # Envoi emails via Resend
├── .github/workflows/
│   ├── sync.yml             # Cron toutes les 6h + dispatch manuel
│   └── pages.yml            # Déploiement GitHub Pages
├── package.json
└── README.md
```

---

## Notes techniques

- **Node.js 18+ requis** (fetch natif utilisé, pas de node-fetch)
- **Scraping** : si la structure HTML de rallycrossfrance.com change, le fichier `scripts/scrape-events-2026.js` devra être adapté à la nouvelle structure
- **Heure par défaut** : si l'heure exacte d'une épreuve n'est pas trouvée, `09:00 Europe/Paris` est utilisé et `approximate: true` est inscrit dans le JSON
- **Liens live** : aucun lien live n'est inventé ; s'il n'est pas trouvé sur le site source, il reste `null`
- **Doublons notifications** : le journal `data/notifications-log.json` est commité à chaque sync pour persister l'état entre les runs GitHub Actions
- **Fenêtre de notification** : ±30 minutes par défaut, configurable via `NOTIF_MARGIN_MIN`
