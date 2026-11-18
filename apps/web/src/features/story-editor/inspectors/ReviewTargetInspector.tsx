import { useTranslation } from 'react-i18next';
import {
  getTriggerConditions,
  type Character,
  type Interaction,
  type ItemDefinition,
  type Location,
  type StatDefinition,
  type Trigger,
} from '@paralleax/shared';
import { RichTextContent } from '../../../components/RichTextContent';
import {
  InspectorCommentField,
  type InspectorTextCommentProps,
} from '../../comments/InspectorCommentField';
import { interactionTitleForDisplay } from '../../story/interactionTitlePresentation';

type ReviewTargetInspectorProps = {
  interaction?: Interaction;
  trigger?: Trigger;
  location?: Location;
  character?: Character;
  statDefinition?: StatDefinition;
  itemDefinition?: ItemDefinition;
} & InspectorTextCommentProps;

type ReviewCommentDisplayProps = Pick<
  ReviewTargetInspectorProps,
  'textCommentCounts' | 'onOpenTextComments'
>;

type ReviewNamedTarget =
  | { type: 'location'; target: Location }
  | { type: 'character'; target: Character }
  | { type: 'stat'; target: StatDefinition }
  | { type: 'item'; target: ItemDefinition };

export function ReviewTargetInspector(props: ReviewTargetInspectorProps) {
  if (props.interaction) {
    return (
      <ReviewInteractionTarget
        interaction={props.interaction}
        textCommentCounts={props.textCommentCounts}
        onOpenTextComments={props.onOpenTextComments}
      />
    );
  }
  if (props.trigger) {
    return <ReviewTriggerTarget trigger={props.trigger} />;
  }

  const target = resolveReviewNamedTarget(props);
  if (!target) {
    return null;
  }
  return (
    <ReviewNamedTarget
      {...target}
      textCommentCounts={props.textCommentCounts}
      onOpenTextComments={props.onOpenTextComments}
    />
  );
}

function resolveReviewNamedTarget(
  props: ReviewTargetInspectorProps,
): ReviewNamedTarget | undefined {
  if (props.location) {
    return { type: 'location', target: props.location };
  }
  if (props.character) {
    return { type: 'character', target: props.character };
  }
  if (props.statDefinition) {
    return { type: 'stat', target: props.statDefinition };
  }
  if (props.itemDefinition) {
    return { type: 'item', target: props.itemDefinition };
  }
  return undefined;
}

function ReviewInteractionTarget({
  interaction,
  textCommentCounts,
  onOpenTextComments,
}: ReviewCommentDisplayProps & { interaction: Interaction }) {
  const { t } = useTranslation();
  return (
    <div className="review-target-inspector">
      <InspectorCommentField
        field="title"
        label={t('interactionInspector.title')}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
      >
        <h2 data-comment-field="title">{interactionTitleForDisplay(interaction, t)}</h2>
      </InspectorCommentField>
      <InspectorCommentField
        field="body"
        label={t('richText.content')}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
      >
        <div data-comment-field="body">
          <RichTextContent html={interaction.body} />
        </div>
      </InspectorCommentField>
    </div>
  );
}

function ReviewTriggerTarget({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation();
  return (
    <div className="review-target-inspector">
      <h3>{t('inspector.trigger')}</h3>
      <p>{t('comments.triggerSummary', { count: getTriggerConditions(trigger).length })}</p>
    </div>
  );
}

function ReviewNamedTarget({
  type,
  target,
  textCommentCounts,
  onOpenTextComments,
}: ReviewCommentDisplayProps & ReviewNamedTarget) {
  const { t } = useTranslation();
  const description = 'description' in target ? target.description : undefined;
  return (
    <div className="review-target-inspector">
      <h3>{t('inspector.' + type)}</h3>
      <InspectorCommentField
        field="name"
        label={t('inspector.name')}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
      >
        <h2 data-comment-field="name">{target.name}</h2>
      </InspectorCommentField>
      {description !== undefined && description.length > 0 ? (
        <InspectorCommentField
          field="description"
          label={t('inspector.description')}
          textCommentCounts={textCommentCounts}
          onOpenTextComments={onOpenTextComments}
        >
          <p data-comment-field="description">{description}</p>
        </InspectorCommentField>
      ) : null}
    </div>
  );
}
