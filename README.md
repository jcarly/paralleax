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

## Vérifications

```bash
npm run typecheck
npm run build
```

## Choix volontairement reportés

La persistance SQL, l’authentification, la collaboration temps réel et le modèle narratif avancé ne font pas partie de cette première refonte.
