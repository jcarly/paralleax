# Paralleax UML

This folder deliberately separates the first MVP target model from the long-term vision.

The checked-in UML sources are Mermaid (`.mmd`) and PlantUML (`.puml`) text
files. Generated image renders are intentionally not stored so diagrams do not
drift from the editable sources.

## 1. MVP Class Diagram

The MVP only contains:

- stories;
- interactions positioned in the editor;
- triggers linking one or more input interactions to an output interaction;
- conditions based on whether some interactions have already been visited or not;
- a local, non-persisted reader state.

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

### Trigger Eligibility Rule

A trigger is offered by the reader when:

1. at the beginning of the story, it has no input interaction; or, during reading, the current interaction is part of its inputs;
2. all `COMPLETED` requirements are present in the reading history;
3. none of its `NOT_COMPLETED` requirements are present in that history.

Several input interactions on the same trigger represent an **OR**: each can lead to the same output interaction. Trigger conditions represent an **AND**: all of them must be verified.

## 2. Vision Class Diagram

This diagram is only a compass. It is not the MVP backlog and must not make the MVP model more complex.

```mermaid
classDiagram
  direction LR

  class Story
  class User
  class UserStoryPermission
  class StoryChangeProposal
  class StoryChangeEvent
  class StoryDefaultAccess {
    <<enumeration>>
  }
  class StoryPermissionLevel {
    <<enumeration>>
  }
  class ChangeProposalStatus {
    <<enumeration>>
  }
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

  User "1" --> "0..*" Story : creates
  Story --> StoryDefaultAccess
  Story "1" *-- "0..*" UserStoryPermission
  UserStoryPermission "*" --> "1" User
  UserStoryPermission --> StoryPermissionLevel
  Story "1" *-- "0..*" StoryChangeProposal
  StoryChangeProposal "*" --> "1" User : author
  StoryChangeProposal --> ChangeProposalStatus
  StoryChangeProposal "0..1" *-- "0..*" StoryChangeEvent
  Story "1" *-- "0..*" StoryChangeEvent
  StoryChangeEvent "*" --> "1" User : actor

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

## MVP Design Choices

- `Interaction` remains independent from `Trigger`, as in the prototype.
- A trigger has exactly one output interaction.
- An interaction can have several triggers: this allows several alternative condition sets.
- Inputs and conditions are shown as separate conceptual associations and map to
  the relational `trigger_inputs` and `trigger_conditions` tables.
- The reader does not persist play sessions yet.
- Characters, places, attributes, effects, media, temporal concepts, and probabilities belong only to the Vision.
- Users, story permissions, and change proposals also belong only to the Vision.
  They depend on authentication and post-MVP collaboration rules.
