import type { Interaction, Story, TriggerCondition } from '@paralleax/shared';

export function TriggerInspector({
  story,
  interaction,
  trigger,
  selectedInputInteractionId,
  onSaveTrigger,
  onDeleteTrigger,
  onDeleteTriggerInput,
  showInputs = true,
}: {
  story: Story;
  interaction: Interaction;
  trigger: Interaction['triggers'][number];
  selectedInputInteractionId?: string;
  onSaveTrigger: (
    interactionId: string,
    triggerId: string,
    inputInteractionIds: string[],
    conditions: TriggerCondition[],
  ) => Promise<void>;
  onDeleteTrigger: (interactionId: string, triggerId: string) => Promise<void>;
  onDeleteTriggerInput: (
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) => Promise<void>;
  showInputs?: boolean;
}) {
  async function updateTrigger(inputIds: string[], conditions: TriggerCondition[]) {
    await onSaveTrigger(interaction.id, trigger.id, inputIds, conditions);
  }

  return (
    <div>
      <h2>Trigger</h2>
      <p className="hint">Output interaction: {interaction.title}</p>
      {showInputs ? (
        <>
          <h3>Trigger inputs</h3>
          <p className="hint">No input means the interaction can start the story.</p>
          <div className="check-list">
            {story.interactions
              .filter((item) => item.id !== interaction.id)
              .map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={trigger.inputInteractionIds.includes(item.id)}
                    onChange={(e) =>
                      void updateTrigger(
                        e.target.checked
                          ? [...trigger.inputInteractionIds, item.id]
                          : trigger.inputInteractionIds.filter((id) => id !== item.id),
                        trigger.conditions,
                      )
                    }
                  />
                  {item.title}
                </label>
              ))}
          </div>
        </>
      ) : (
        <p className="hint">
          This root trigger has no input; select an edge to edit linked trigger inputs.
        </p>
      )}
      <h3>Path conditions</h3>
      <div className="conditions">
        {trigger.conditions.map((condition, index) => (
          <div className="condition" key={`${condition.interactionId}-${index}`}>
            <select
              value={condition.interactionId}
              onChange={(e) => {
                const next = [...trigger.conditions];
                next[index] = { ...condition, interactionId: e.target.value };
                void updateTrigger(trigger.inputInteractionIds, next);
              }}
            >
              {story.interactions
                .filter((item) => item.id !== interaction.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
            <select
              value={condition.hasBeenVisited ? 'visited' : 'not-visited'}
              onChange={(e) => {
                const next = [...trigger.conditions];
                next[index] = { ...condition, hasBeenVisited: e.target.value === 'visited' };
                void updateTrigger(trigger.inputInteractionIds, next);
              }}
            >
              <option value="visited">has been visited</option>
              <option value="not-visited">has not been visited</option>
            </select>
            <button
              className="ghost danger"
              onClick={() =>
                void updateTrigger(
                  trigger.inputInteractionIds,
                  trigger.conditions.filter((_, i) => i !== index),
                )
              }
            >
              x
            </button>
          </div>
        ))}
      </div>
      <button
        className="secondary"
        disabled={story.interactions.length < 2}
        onClick={() => {
          const candidate = story.interactions.find((item) => item.id !== interaction.id);
          if (candidate) {
            void updateTrigger(trigger.inputInteractionIds, [
              ...trigger.conditions,
              { interactionId: candidate.id, hasBeenVisited: true },
            ]);
          }
        }}
      >
        Add condition
      </button>
      <hr />
      {selectedInputInteractionId ? (
        <button
          className="danger"
          onClick={() =>
            void onDeleteTriggerInput(interaction.id, trigger.id, selectedInputInteractionId)
          }
        >
          Delete link
        </button>
      ) : (
        <button className="danger" onClick={() => void onDeleteTrigger(interaction.id, trigger.id)}>
          Delete trigger
        </button>
      )}
    </div>
  );
}
