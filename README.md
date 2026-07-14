# Paralleax — prototype refactoré

Refonte du prototype Meteor en monorepo TypeScript minimal :

- `apps/web` : React + Vite + React Flow
- `apps/api` : NestJS
- `packages/shared` : modèle MVP et règles du lecteur partagés
- `docs/uml` : UML MVP et Vision

## Périmètre actuel

- CRUD des stories
- création, édition, déplacement et suppression d’interactions
- triggers simples fondés sur les interactions d’entrée
- conditions « interaction visitée / non visitée »
- lecteur de branches
- stockage en mémoire côté API (les données sont réinitialisées au redémarrage)

## Démarrage

Prérequis : Node.js 22+ et npm 11+.

```bash
npm install
npm run dev
```

- application : http://localhost:5173
- API : http://localhost:3000/api

## Verifications

Sous PowerShell, utiliser `npm.cmd` pour eviter le blocage possible de `npm.ps1` par la politique d'execution Windows.

### Tests automatises

```powershell
npm.cmd run test
```

Cette commande lance :

- les tests API Jest/Supertest sur les endpoints NestJS ;
- les tests unitaires web Vitest/Testing Library.

Pour lancer uniquement une partie :

```powershell
npm.cmd run test -w @paralleax/api
npm.cmd run test -w @paralleax/web
```

### Tests fonctionnels

Installer le navigateur Playwright une premiere fois :

```powershell
npm.cmd run playwright:install -w @paralleax/web
```

Puis lancer les scenarios fonctionnels :

```powershell
npm.cmd run test:e2e -w @paralleax/web
```

Playwright demarre automatiquement le serveur Vite de `apps/web` pendant les tests.

### Couverture de tests

La couverture est mesuree avec :

- Jest coverage pour l'API ;
- Vitest coverage V8 pour le web.

```powershell
npm.cmd run coverage
```

Rapports HTML generes :

- `apps/api/coverage/index.html`
- `apps/web/coverage/index.html`

Pour lancer uniquement une partie :

```powershell
npm.cmd run coverage -w @paralleax/api
npm.cmd run coverage -w @paralleax/web
```

### Typecheck et build

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Verification complete avant commit :

```powershell
npm.cmd run test
npm.cmd run test:e2e -w @paralleax/web
npm.cmd run coverage
npm.cmd run build
```

## Choix volontairement reportés

La persistance SQL, l’authentification, la collaboration temps réel et le modèle narratif avancé ne font pas partie de cette première refonte.

## Développement avec Docker

Cette configuration fixe l'environnement sur Node.js 22 et npm fourni par l'image officielle Node.

### Démarrage sans proxy

```bash
cp .env.example .env
docker compose up --build
```

Sous PowerShell, la copie s'effectue avec :

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Ouvrir ensuite <http://localhost:5173>. L'API est exposée sur <http://localhost:3000/api>.

### Démarrage derrière un proxy

Renseigner `.env` :

```dotenv
HTTP_PROXY=http://proxy.exemple:8080
HTTPS_PROXY=http://proxy.exemple:8080
NO_PROXY=localhost,127.0.0.1,api,web
```

Les identifiants éventuellement présents dans l'URL du proxy ne doivent jamais être commités. Le fichier `.env` est ignoré par Git.

Le proxy doit également être configuré dans Docker Desktop lorsque Docker ne parvient pas à télécharger l'image de base ou les dépendances pendant le build. Sous Docker Desktop : **Settings → Resources → Proxies** (l'emplacement peut varier selon la version).

### Commandes utiles

```bash
npm run docker:up
npm run docker:logs
npm run docker:down
```

Pour reconstruire complètement les dépendances :

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

> Docker stabilise les versions, mais ne contourne pas un proxy ou un pare-feu : le build doit toujours pouvoir joindre `registry.npmjs.org`.
