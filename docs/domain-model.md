# Domain Model

The model must distinguish the current MVP from the target model.

## MVP Model

### Story

A story groups the interactions of a scenario.

Main fields:

- `id`
- `title`
- `interactions`

### Interaction

An interaction is the main narrative building block. It represents what is displayed or triggered during the story flow.

Main MVP fields:

- `id`
- `title`
- `body`
- `position`
- `triggers`

The title is used for choices and editor display. The body is used by the reader.

### Trigger

A trigger determines when an interaction becomes available.

Main MVP fields:

- `id`
- `inputInteractionIds`
- `conditions`

`inputInteractionIds` can contain several interactions. An interaction is therefore not limited to a single input.

A trigger has exactly one output interaction: the interaction that owns the trigger. Its inputs are alternative sources. In other words, several input interactions on the same trigger represent an OR: any one of them can make the output interaction reachable, as long as the trigger conditions also match.

### MVP Condition

A condition checks whether an interaction has already been visited or not.

Examples:

- visited interaction;
- not visited interaction.

See [Trigger semantics](triggers.md) for deletion rules and editor behavior.

## Target Model

The long-term model may introduce the following concepts.

### World

The world contains places, characters, and the current time state.

Possible elements:

- available places;
- characters;
- current date and time.

### Character

A character can be playable or non-playable.

Possible elements:

- current place;
- attributes;
- relationships with other characters;
- own narrative path.

### Attribute

An attribute represents a statistic, item, relationship, or narrative property.

It can be modified by an interaction and used as a trigger condition.

### Place

A place represents a scene, location, or context where interactions can trigger.

### Target Interaction

Later, an interaction may contain:

- involved characters;
- visual attitude or posture;
- speaking indicator;
- place;
- delay added to the timeline;
- attribute impacts;
- media;
- conditional content or display pseudo-code.

### Target Trigger

Later, a trigger may take into account:

- triggering characters;
- place;
- time period or schedule;
- attribute values;
- input interactions;
- required or forbidden interactions in history;
- appearance probability;
- automatic trigger probability;
- availability timing.

## Target Narrative Rules

- If several interactions are available after an interaction, the reader offers a choice.
- A choice may become automatic if a trigger probability is defined.
- Timing may make an option unavailable after expiration.
- If no interaction is available, the branch ends.
- Branches without input interactions may start or resume elsewhere depending on a place, time period, or character.
