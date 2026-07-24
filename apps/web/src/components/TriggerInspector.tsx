import type { Interaction, Story, TriggerCondition } from '@paralleax/shared';
import { getRelatedTriggerVariantIds } from '../storyGraph';

export function TriggerInspector({
  story,
  interaction,
  trigger,
  onSaveTrigger,
  onCreateTriggerVariant,
  onDeleteTrigger,
  onDeleteTriggerVariants,
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
  onCreateTriggerVariant: (interactionId: string, triggerId: string) => Promise<void>;
  onDeleteTrigger: (interactionId: string, triggerId: string) => Promise<void>;
  onDeleteTriggerVariants: (interactionId: string, triggerIds: string[]) => Promise<void>;
}) {
  const variantIds = getRelatedTriggerVariantIds(interaction, trigger);
  const variants = interaction.triggers.filter((item) => variantIds.includes(item.id));
  const hasOrVariants = variants.length > 1;

  async function updateTrigger(
    targetTrigger: Interaction['triggers'][number],
    inputIds: string[],
    conditions: TriggerCondition[],
  ) {
    await onSaveTrigger(interaction.id, targetTrigger.id, inputIds, conditions);
  }

  return (
    <div>
      <h3>Path conditions</h3>
      {hasOrVariants ? (
        <p className="hint">This visual trigger contains alternative condition groups.</p>
      ) : null}
      {variants.map((variant, variantIndex) => (
        <div className="trigger-variant" key={variant.id}>
          {variantIndex > 0 ? <div className="or-divider">OR</div> : null}
          {hasOrVariants ? <h4>Condition group {variantIndex + 1}</h4> : null}
          <div className="conditions">
            {variant.conditions.map((condition, index) => (
              <div
                className="condition"
                key={`${variant.id}-${
                  'interactionId' in condition ? condition.interactionId : condition.locationId
                }-${index}`}
              >
                {'interactionId' in condition ? (
                  <>
                    <select
                      aria-label="Condition interaction"
                      value={condition.interactionId}
                      onChange={(e) => {
                        const next = [...variant.conditions];
                        next[index] = { ...condition, interactionId: e.target.value };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
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
                      aria-label="Interaction condition operator"
                      value={condition.hasBeenVisited ? 'visited' : 'not-visited'}
                      onChange={(e) => {
                        const next = [...variant.conditions];
                        next[index] = {
                          ...condition,
                          hasBeenVisited: e.target.value === 'visited',
                        };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      <option value="visited">has been visited</option>
                      <option value="not-visited">has not been visited</option>
                    </select>
                  </>
                ) : (
                  <>
                    <select
                      aria-label="Condition location"
                      value={condition.locationId}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = { ...condition, locationId: event.target.value };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      {(story.locations ?? []).map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Location condition operator"
                      value={condition.isCurrentLocation ? 'current' : 'not-current'}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = {
                          ...condition,
                          isCurrentLocation: event.target.value === 'current',
                        };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      <option value="current">is the current location</option>
                      <option value="not-current">is not the current location</option>
                    </select>
                  </>
                )}
                <button
                  className="ghost danger"
                  onClick={() =>
                    void updateTrigger(
                      variant,
                      variant.inputInteractionIds,
                      variant.conditions.filter((_, i) => i !== index),
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
                void updateTrigger(variant, variant.inputInteractionIds, [
                  ...variant.conditions,
                  { interactionId: candidate.id, hasBeenVisited: true },
                ]);
              }
            }}
          >
            Add interaction condition
          </button>
          <button
            className="secondary"
            disabled={(story.locations?.length ?? 0) === 0}
            onClick={() => {
              const location = story.locations?.[0];
              if (location) {
                void updateTrigger(variant, variant.inputInteractionIds, [
                  ...variant.conditions,
                  { locationId: location.id, isCurrentLocation: true },
                ]);
              }
            }}
          >
            Add location condition
          </button>
          {hasOrVariants ? (
            <button
              className="ghost danger"
              onClick={() => void onDeleteTrigger(interaction.id, variant.id)}
            >
              Delete this OR group
            </button>
          ) : null}
        </div>
      ))}
      <button
        className="secondary"
        disabled={trigger.inputInteractionIds.length === 0 || story.interactions.length < 2}
        onClick={() => void onCreateTriggerVariant(interaction.id, trigger.id)}
      >
        Add OR condition group
      </button>
      <hr />
      {hasOrVariants ? (
        <button
          className="danger"
          onClick={() => void onDeleteTriggerVariants(interaction.id, variantIds)}
        >
          Delete all OR groups
        </button>
      ) : (
        <button className="danger" onClick={() => void onDeleteTrigger(interaction.id, trigger.id)}>
          Delete trigger
        </button>
      )}
    </div>
  );
}
