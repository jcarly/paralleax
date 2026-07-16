import type { Interaction, Story, TriggerCondition } from '@paralleax/shared';

export function TriggerInspector({
  story,
  interaction,
  trigger,
  onSaveTrigger,
  onDeleteTrigger,
}: {
  story: Story;
  interaction: Interaction;
  trigger: Interaction['triggers'][number];
  onSaveTrigger: (
    interactionId: string,
    triggerId: string,
    inputInteractionIds: string[],
    conditions: TriggerCondition[],
  ) => Promise<void>;
  onDeleteTrigger: (interactionId: string, triggerId: string) => Promise<void>;
}) {
  async function updateTrigger(inputIds: string[], conditions: TriggerCondition[]) {
    await onSaveTrigger(interaction.id, trigger.id, inputIds, conditions);
  }

  return (
    <div>
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
      <button className="danger" onClick={() => void onDeleteTrigger(interaction.id, trigger.id)}>
        Delete trigger
      </button>
    </div>
  );
}
