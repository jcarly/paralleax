import type { Interaction, Story } from '@paralleax/shared';

/** The Interactions offered as choices after `sourceId`, in Story order. */
export function getOptionDestinations(
  story: Pick<Story, 'interactions'>,
  sourceId: string,
): Interaction[] {
  return story.interactions.filter((candidate) =>
    candidate.triggers.some((trigger) => trigger.inputInteractionIds.includes(sourceId)),
  );
}

/**
 * Interactions offered as one of several choices without a title of their own.
 * Readers would see a numbered fallback (`Option N`), so authors are warned; the
 * label is not enforced before a future version publication.
 */
export function getInteractionsNeedingChoiceLabel(
  story: Pick<Story, 'interactions'>,
): ReadonlySet<string> {
  const needsLabel = new Set<string>();
  for (const sourceId of new Set(
    story.interactions.flatMap(({ triggers }) =>
      triggers.flatMap(({ inputInteractionIds }) => inputInteractionIds),
    ),
  )) {
    const destinations = getOptionDestinations(story, sourceId);
    if (destinations.length > 1) {
      destinations.filter(({ title }) => !title.trim()).forEach(({ id }) => needsLabel.add(id));
    }
  }
  return needsLabel;
}
