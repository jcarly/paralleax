# UML de Paralleax

Ce dossier distingue volontairement le modèle réellement ciblé par le premier MVP de la vision à long terme.

## 1. Diagramme de classes du MVP

Le MVP contient uniquement :

- des stories ;
- des interactions positionnées dans l’éditeur ;
- des triggers reliant une ou plusieurs interactions d’entrée à une interaction de sortie ;
- des conditions fondées sur le fait d’avoir déjà parcouru, ou non, certaines interactions ;
- un état de lecture local et non persisté.

```mermaid
classDiagram
  direction LR

  class Story {
    +UUID id
    +string title
    +DateTime createdAt
    +DateTime updatedAt
  }

  class Interaction {
    +UUID id
    +UUID storyId
    +string title
    +text body
    +number positionX
    +number positionY
    +DateTime createdAt
    +DateTime updatedAt
  }

  class Trigger {
    +UUID id
    +UUID storyId
    +UUID outputInteractionId
  }

  class TriggerInput {
    +UUID triggerId
    +UUID interactionId
  }

  class TriggerRequirement {
    +UUID triggerId
    +UUID interactionId
    +InteractionState expectedState
  }

  class InteractionState {
    <<enumeration>>
    COMPLETED
    NOT_COMPLETED
  }

  class PlaySession {
    <<runtime only>>
    +UUID? currentInteractionId
    +Set~UUID~ completedInteractionIds
  }

  Story "1" *-- "0..*" Interaction
  Story "1" *-- "0..*" Trigger
  Trigger "1" --> "1" Interaction : output
  Trigger "1" *-- "0..*" TriggerInput
  TriggerInput "*" --> "1" Interaction : input
  Trigger "1" *-- "0..*" TriggerRequirement
  TriggerRequirement "*" --> "1" Interaction : condition
  TriggerRequirement --> InteractionState
  PlaySession ..> Story : reads
  PlaySession ..> Interaction : progresses through
  PlaySession ..> Trigger : evaluates
```

### Règle d’éligibilité d’un trigger

Un trigger est proposé par le lecteur lorsque :

1. au début de la story, il ne possède aucune interaction d’entrée ; ou, pendant la lecture, l’interaction courante fait partie de ses entrées ;
2. toutes ses exigences `COMPLETED` figurent dans l’historique de lecture ;
3. aucune de ses exigences `NOT_COMPLETED` ne figure dans cet historique.

Plusieurs interactions d’entrée sur un même trigger représentent un **OU** : chacune peut mener à la même interaction de sortie. Les conditions d’un trigger représentent un **ET** : elles doivent toutes être vérifiées.

## 2. Diagramme de classes Vision

Ce diagramme sert uniquement de boussole. Il ne constitue pas le backlog du MVP et ne doit pas complexifier son modèle.

```mermaid
classDiagram
  direction LR

  class Story
  class World
  class Interaction
  class Trigger
  class Condition
  class Effect
  class Character
  class Place
  class AttributeDefinition
  class AttributeValue
  class Relationship
  class Goal
  class Media
  class PlaySession
  class InteractionOccurrence
  class DecisionPolicy {
    <<interface>>
  }
  class PlayerDecision
  class RandomDecision
  class CharacterDecision

  Story "1" *-- "1" World
  Story "1" *-- "0..*" Interaction
  World "1" *-- "0..*" Character
  World "1" *-- "0..*" Place
  World "1" *-- "0..*" AttributeDefinition

  Interaction "1" *-- "1..*" Trigger
  Interaction "1" *-- "0..*" Effect
  Interaction "0..*" -- "0..*" Character : participants
  Interaction "0..*" --> "0..1" Place : location
  Interaction "1" *-- "0..*" Media

  Trigger "1" *-- "0..*" Condition
  Trigger "0..*" --> "0..*" Interaction : previous interactions
  Condition "0..*" --> "0..1" Character
  Condition "0..*" --> "0..1" Place
  Condition "0..*" --> "0..1" AttributeDefinition
  Condition "0..*" --> "0..1" Interaction : history

  Effect "0..*" --> "0..1" Character : target
  Effect "0..*" --> "0..1" AttributeDefinition
  Effect "0..*" --> "0..1" Place

  Character "1" *-- "0..*" AttributeValue
  AttributeValue "*" --> "1" AttributeDefinition
  Character "1" *-- "0..*" Goal
  Relationship "*" --> "1" Character : source
  Relationship "*" --> "1" Character : target
  Relationship "1" *-- "0..*" AttributeValue

  PlaySession "*" --> "1" Story
  PlaySession "1" *-- "0..*" InteractionOccurrence
  InteractionOccurrence "*" --> "1" Interaction
  PlaySession --> DecisionPolicy
  DecisionPolicy <|.. PlayerDecision
  DecisionPolicy <|.. RandomDecision
  DecisionPolicy <|.. CharacterDecision
  CharacterDecision --> Character
  CharacterDecision --> Goal
```

## Choix de conception retenus pour le MVP

- `Interaction` reste indépendante de `Trigger`, comme dans le prototype.
- Un trigger possède exactement une interaction de sortie.
- Une interaction peut avoir plusieurs triggers : cela permet plusieurs ensembles alternatifs de conditions.
- Les entrées et les conditions sont modélisées par des tables d’association plutôt que par des tableaux d’identifiants. Cela convient à PostgreSQL et évite d’enfermer l’API dans le stockage choisi.
- Le lecteur ne sauvegarde pas encore les parties.
- Les personnages, lieux, attributs, effets, médias, temporalités et probabilités appartiennent uniquement à la Vision.
