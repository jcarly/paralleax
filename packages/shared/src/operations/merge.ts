import type { InteractionContentPatch, Story } from '../model/index.js';

function hasOwn<T extends object, K extends PropertyKey>(
  item: T,
  key: K,
): item is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(item, key);
}

export function mergeServerStory(
  current: Story,
  incoming: Story,
  edited?: { interactionId: string; patch: InteractionContentPatch },
  options: {
    preserveCurrentTriggers?: boolean;
    deletedTriggerIds?: ReadonlySet<string>;
    deletedTriggerInputKeys?: ReadonlySet<string>;
  } = {},
): Story {
  return {
    ...incoming,
    interactions: incoming.interactions.map((item) => {
      const currentItem = current.interactions.find((candidate) => candidate.id === item.id);
      const triggers = (
        options.preserveCurrentTriggers && currentItem ? currentItem.triggers : item.triggers
      )
        .filter((trigger) => !options.deletedTriggerIds?.has(trigger.id))
        .map((trigger) => ({
          ...trigger,
          inputInteractionIds: trigger.inputInteractionIds.filter(
            (inputId) => !options.deletedTriggerInputKeys?.has(`${trigger.id}:${inputId}`),
          ),
        }));
      if (!currentItem) return { ...item, triggers };
      const patch = item.id === edited?.interactionId ? edited.patch : undefined;

      return {
        ...item,
        title: hasOwn(patch ?? {}, 'title') ? (patch?.title ?? '') : currentItem.title,
        body: hasOwn(patch ?? {}, 'body') ? (patch?.body ?? '') : currentItem.body,
        position: hasOwn(patch ?? {}, 'position')
          ? (patch?.position ?? currentItem.position)
          : currentItem.position,
        locationId: hasOwn(patch ?? {}, 'locationId')
          ? (patch?.locationId ?? null)
          : currentItem.locationId,
        characterIds: hasOwn(patch ?? {}, 'characterIds')
          ? (patch?.characterIds ?? [])
          : currentItem.characterIds,
        statEffects: hasOwn(patch ?? {}, 'statEffects')
          ? (patch?.statEffects ?? [])
          : currentItem.statEffects,
        itemEffects: hasOwn(patch ?? {}, 'itemEffects')
          ? (patch?.itemEffects ?? [])
          : currentItem.itemEffects,
        conditionalTextBlocks: hasOwn(patch ?? {}, 'conditionalTextBlocks')
          ? (patch?.conditionalTextBlocks ?? [])
          : currentItem.conditionalTextBlocks,
        durationMinutes: hasOwn(patch ?? {}, 'durationMinutes')
          ? (patch?.durationMinutes ?? 0)
          : currentItem.durationMinutes,
        triggers,
      };
    }),
  };
}
