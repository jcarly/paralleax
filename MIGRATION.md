# Notes de refonte du prototype Meteor

## Correspondances

| Prototype Meteor | Refonte |
|---|---|
| `StoryCollection` | `StoriesService` NestJS |
| `InteractionCollection` | `Story.interactions` dans le modèle partagé |
| `TriggerCollection` | `Interaction.triggers` |
| méthodes Meteor | routes REST du `StoriesController` |
| `react-xarrows` | arêtes React Flow |
| `StoryEditor` | `apps/web/src/pages/StoryEditor.tsx` |
| `StoryViewer` | `apps/web/src/pages/StoryPlayer.tsx` |

## Simplifications assumées

- Les triggers sont imbriqués dans les interactions : ils ne nécessitent pas une collection autonome dans le MVP.
- Une interaction créée possède un trigger initial.
- Le panneau d’édition modifie actuellement le premier trigger de l’interaction, comme chemin principal du MVP.
- Le service utilise un stockage en mémoire pour isoler et valider le comportement avant le choix d’une base de données.

## Prochaine étape recommandée

Ajouter une persistance légère, idéalement SQLite avec Prisma en développement, sans modifier les contrats partagés ni l’interface du lecteur.
