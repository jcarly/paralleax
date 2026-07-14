import {
  updateInteractionInStory,
  type Interaction,
  type Story,
  type TriggerCondition,
} from '@paralleax/shared';
import { findRootTrigger } from '../storySelection';
import { TriggerInspector } from './TriggerInspector';

export function InteractionInspector({
  story,
  interaction,
  onChange,
  onSaveTrigger,
  onPatch,
  onDelete,
  onDeleteTrigger,
  onDeleteTriggerInput,
}: {
  story: Story;
  interaction: Interaction;
  onChange: (story: Story) => void;
  onSaveTrigger: (
    interactionId: string,
    triggerId: string,
    inputInteractionIds: string[],
    conditions: TriggerCondition[],
  ) => Promise<void>;
  onPatch: (id: string, patch: Partial<Interaction>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDeleteTrigger: (interactionId: string, triggerId: string) => Promise<void>;
  onDeleteTriggerInput: (
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) => Promise<void>;
}) {
  const rootTrigger = findRootTrigger(interaction);

  function updateLocalInteraction(patch: Partial<Interaction>) {
    onChange(updateInteractionInStory(story, interaction.id, patch));
  }

  return (
    <div>
      <h2>Interaction</h2>
      <label>
        Title
        <input
          value={interaction.title}
          onChange={(e) => updateLocalInteraction({ title: e.target.value })}
          onBlur={(e) => void onPatch(interaction.id, { title: e.target.value })}
        />
      </label>
      <label>
        Content
        <textarea
          rows={7}
          value={interaction.body}
          onChange={(e) => updateLocalInteraction({ body: e.target.value })}
          onBlur={(e) => void onPatch(interaction.id, { body: e.target.value })}
        />
      </label>
      {rootTrigger ? (
        <TriggerInspector
          story={story}
          interaction={interaction}
          trigger={rootTrigger}
          onSaveTrigger={onSaveTrigger}
          onDeleteTrigger={onDeleteTrigger}
          onDeleteTriggerInput={onDeleteTriggerInput}
          showInputs={false}
        />
      ) : (
        <p className="hint">Select an edge to edit path conditions for linked triggers.</p>
      )}
      <hr />
      <button className="danger" onClick={() => void onDelete()}>
        Delete interaction
      </button>
    </div>
  );
}
