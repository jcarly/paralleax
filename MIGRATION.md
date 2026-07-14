# Meteor Prototype Refactor Notes

## Mappings

| Meteor prototype        | Refactor                                 |
| ----------------------- | ---------------------------------------- |
| `StoryCollection`       | NestJS `StoriesService`                  |
| `InteractionCollection` | `Story.interactions` in the shared model |
| `TriggerCollection`     | `Interaction.triggers`                   |
| Meteor methods          | REST routes in `StoriesController`       |
| `react-xarrows`         | React Flow edges                         |
| `StoryEditor`           | `apps/web/src/pages/StoryEditor.tsx`     |
| `StoryViewer`           | `apps/web/src/pages/StoryPlayer.tsx`     |

## Deliberate Simplifications

- Triggers are embedded in interactions: they do not need a standalone collection in the MVP.
- A newly created interaction has an initial trigger.
- The edit panel currently edits the interaction's first trigger as the MVP's main path.
- The service uses in-memory storage to isolate and validate behavior before choosing a database.

## Recommended Next Step

Add lightweight persistence, ideally SQLite with Prisma in development, without changing the shared contracts or the reader interface.
