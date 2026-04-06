# Rota Chat Generator

Application web de production pour importer un export NICE WFM, reconstruire la disponibilite reelle des agents et generer un tableau de rotation de chat equitable, exportable et editable.

## Architecture proposee

### Stack

- Backend: Node.js 22 + Express + TypeScript
- Frontend: React 18 + Vite + TypeScript + Tailwind CSS
- Coeur metier partage: package TypeScript dedie pour le parsing, les regles metier, l'algorithme et les utilitaires
- Exports: ExcelJS pour `.xlsx`, export CSV natif
- Exports: ExcelJS pour `.xlsx`, CSV natif, PDF tabulaire via `pdf-lib`
- Tests: Vitest sur le module coeur

### Pourquoi cette architecture

- Un seul service HTTP en production: plus simple a exposer dans Docker et derriere Nginx Proxy Manager
- Pas de Next.js: moins de complexite, moins de points de panne, debug plus direct sur Raspberry Pi
- Compatible ARM64: image `node:22-bookworm-slim`, dependances JS pures ou largement supportees
- Separation claire:
  - `packages/core`: parser NICE WFM, eligibility, rotation, resume
  - `apps/server`: API, extraction PDF/texte, exports, healthcheck, service des assets frontend
  - `apps/web`: interface React

## Arborescence

```text
.
+-- Dockerfile
+-- README.md
+-- docker-compose.yml
+-- package.json
+-- package-lock.json
+-- tsconfig.base.json
+-- apps
|   +-- server
|   |   +-- package.json
|   |   +-- tsconfig.json
|   |   `-- src
|   |       +-- config.ts
|   |       +-- exporters.ts
|   |       +-- file-extractor.ts
|   |       +-- index.ts
|   |       `-- types
|   |           `-- pdf-parse.d.ts
|   `-- web
|       +-- index.html
|       +-- package.json
|       +-- postcss.config.cjs
|       +-- tailwind.config.ts
|       +-- tsconfig.json
|       +-- vite.config.ts
|       `-- src
|           +-- App.tsx
|           +-- index.css
|           +-- main.tsx
|           +-- components
|           |   +-- InspectorDrawer.tsx
|           |   +-- RotationTable.tsx
|           |   +-- SettingsPanel.tsx
|           |   +-- StatusBadge.tsx
|           |   +-- SummaryPanel.tsx
|           |   `-- UploadCard.tsx
|           `-- lib
|               +-- api.ts
|               `-- download.ts
`-- packages
    `-- core
        +-- package.json
        +-- tsconfig.json
        +-- src
        |   +-- catalog.ts
        |   +-- constants.ts
        |   +-- eligibility.ts
        |   +-- index.ts
        |   +-- parser.ts
        |   +-- rotation.ts
        |   +-- types.ts
        |   `-- utils.ts
        `-- tests
            `-- rotation.test.ts
```

## Formats d'entree supportes

- PDF texte NICE WFM
- TXT
- CSV ou LOG si le contenu est textuel

Le parser gere:

- plusieurs agents dans un meme fichier
- plusieurs dates
- lignes imparfaites
- noms accentues ou multi-mots
- activites et sous-creneaux melanges
- jours `Libre`

## Regles metier appliquees

### Eligibles par defaut

- `Open Time`

### Non eligibles par defaut

- `Libre`
- `Pause repas`
- `Petite pause remuneree exclue`
- `Conge paye`
- `Brief`

### Cas particulier

- `Alternance Ecole/WH` est conditionnelle et devient eligible si l'option est activee

### Regle absolue

Un agent n'est affecte que si au moins une activite eligible couvre l'integralite du creneau et qu'aucune activite non eligible ne recouvre le creneau.

## Algorithme de rotation

Pour chaque creneau entre `startTime` et `endTime`:

1. Lister les agents eligibles sur tout le creneau.
2. Eliminer ceux qui ont une activite bloquante.
3. Classer les candidats par:
   - nombre total de creneaux deja attribues
   - nombre de creneaux deja attribues sur la journee
   - penalite de repetition consecutive si activee
   - ordre alphabetique stable en dernier recours
4. S'il n'y a personne, le creneau devient `Non couvert`.

## API

### `GET /api/health`

Retourne un statut simple de sante pour Docker, Portainer et Nginx Proxy Manager.

### `POST /api/parse`

- `multipart/form-data`
- champ fichier: `file`

Retourne:

- `parsedSchedule`
- `settings`
- `detectedActivities`

### `POST /api/generate`

Corps JSON:

```json
{
  "parsedSchedule": {},
  "settings": {
    "startTime": "09:00",
    "endTime": "18:00",
    "slotMinutes": 60,
    "avoidConsecutive": true,
    "fairnessMode": "strict",
    "allowAlternance": false,
    "eligibleActivities": ["open time"],
    "ineligibleActivities": ["libre", "pause repas", "brief"]
  }
}
```

### `POST /api/export/csv`

Corps JSON:

```json
{
  "rotation": {}
}
```

### `POST /api/export/xlsx`

Corps JSON:

```json
{
  "rotation": {}
}
```

### `POST /api/export/pdf`

Corps JSON:

```json
{
  "rotation": {}
}
```

## Lancement local

### Prerequis

- Node.js 22+
- npm 10+

### Installation

```bash
npm install
```

### Developpement

```bash
npm run dev
```

Services:

- Frontend Vite: `http://localhost:5173`
- API Express: `http://localhost:8000`

Par defaut, le backend ecoute sur `0.0.0.0`.

### Build

```bash
npm run build
```

### Lancement production local

```bash
HOST=0.0.0.0 PORT=8000 npm start
```

### Tests

```bash
npm test
```

## Docker

### Build image

```bash
docker build -t rota-chat-generator:1.0.0 .
```

### Lancement simple

```bash
docker run -d \
  --name rota-chat \
  --restart unless-stopped \
  -p 8088:8000 \
  -e HOST=0.0.0.0 \
  -e PORT=8000 \
  rota-chat-generator:1.0.0
```

### Lancement avec Compose

```bash
docker compose up -d --build
```

### Logs

```bash
docker compose logs -f rota-chat
```

### Arret

```bash
docker compose down
```

## Reverse proxy Nginx Proxy Manager

Configuration recommandee si NPM est sur le meme Raspberry Pi mais dans un autre stack Docker:

- Scheme: `http`
- Forward Hostname / IP: `IP_LAN_DU_RASPBERRY_PI`
- Forward Port: `8088`

Exemple:

- Scheme: `http`
- Forward Hostname / IP: `192.168.1.50`
- Forward Port: `8088`

Parametres NPM conseilles:

- Websockets Support: active
- Block Common Exploits: active
- Cache Assets: facultatif
- SSL: Let's Encrypt, force SSL apres validation OK

## Ports et stabilite

- Port interne du conteneur: `8000`
- Port host recommande: `8088`
- Bind reseau: `0.0.0.0`
- Pas de validation d'host specifique cote application
- Healthcheck Docker inclus
- Service unique pour eviter les `502 Bad Gateway` lies a un mauvais port ou a plusieurs conteneurs a chainer

## Modification des activites eligibles

Depuis l'interface:

- chaque activite detectee peut etre basculee en `Eligible`, `Non eligible` ou `Neutre`
- `Alternance Ecole/WH` dispose en plus d'un switch dedie

Dans le code:

- regles par defaut: `packages/core/src/constants.ts`
- resolution des categories: `packages/core/src/catalog.ts`
- verification d'eligibilite par creneau: `packages/core/src/eligibility.ts`

## Validation simple

1. Importer un PDF ou TXT NICE WFM.
2. Verifier que la liste des agents et dates detectes est correcte.
3. Generer une rotation en `60 minutes`.
4. Cliquer sur quelques cellules pour verifier la justification et les candidats bloques.
5. Modifier une cellule manuellement et verifier que le resume change.
6. Exporter en CSV, XLSX puis PDF.
7. Verifier `GET /api/health`.
8. Verifier le statut `healthy` du conteneur.
9. Configurer NPM vers `http://IP_LAN_DU_RASPBERRY_PI:8088`.
10. Tester l'acces en LAN puis via le domaine.

## Procedure de validation avant mise en production

- `npm test`
- `npm run build`
- `docker compose up -d --build`
- `curl http://IP_LAN_DU_RASPBERRY_PI:8088/api/health`
- ouverture de l'URL proxifiee
- import d'un vrai export NICE WFM
- verification d'au moins un export Excel
- verification d'au moins un export PDF

## Limites connues

- Le parser est robuste sur des exports texte NICE WFM, mais un PDF purement image sans couche texte necessiterait de l'OCR, volontairement non inclus pour garder le deploiement simple et fiable sur Raspberry Pi.
- Les resumes de charge reposent sur les creneaux generes et les retouches manuelles courantes. Si vous voulez historiser des jeux de regles ou des sessions, il faudra ajouter un stockage persistant.
