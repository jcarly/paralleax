import { useTranslation } from 'react-i18next';
import {
  InspectorCommentField,
  InspectorCommentSlot,
  type InspectorSemanticCommentProps,
  type InspectorTextCommentProps,
} from '../features/comments/InspectorCommentField';
import { CategoryField } from './CategoryField';
import { EntityNameInput } from './EntityNameInput';
import { ImageUrlField } from './ImageUrlField';

type InspectorImageFieldProps = {
  imageUrl?: string;
  onChange: (imageUrl: string) => void;
  onCommit: (imageUrl: string) => void;
} & InspectorSemanticCommentProps;

export function InspectorImageField({
  imageUrl,
  onChange,
  onCommit,
  semanticCommentCounts,
  onOpenSemanticComments,
}: InspectorImageFieldProps) {
  const { t } = useTranslation();
  return (
    <InspectorCommentSlot
      slot={{ kind: 'field', field: 'imageUrl' }}
      label={t('inspector.imageUrl')}
      semanticCommentCounts={semanticCommentCounts}
      onOpenSemanticComments={onOpenSemanticComments}
    >
      <ImageUrlField imageUrl={imageUrl} onChange={onChange} onBlur={onCommit} />
    </InspectorCommentSlot>
  );
}

type InspectorNameFieldProps = {
  value: string;
  onChange: (name: string) => void;
  onCommit: (name: string) => void;
} & InspectorTextCommentProps;

export function InspectorNameField({
  value,
  onChange,
  onCommit,
  textCommentCounts,
  onOpenTextComments,
}: InspectorNameFieldProps) {
  const { t } = useTranslation();
  return (
    <InspectorCommentField
      field="name"
      label={t('inspector.name')}
      textCommentCounts={textCommentCounts}
      onOpenTextComments={onOpenTextComments}
    >
      <label className="form-field form-field--compact">
        {t('inspector.name')}
        <EntityNameInput
          data-comment-field="name"
          value={value}
          onChange={onChange}
          onCommit={onCommit}
        />
      </label>
    </InspectorCommentField>
  );
}

type InspectorCategoryFieldProps = {
  category?: string;
  suggestions?: string[];
  onChange: (category: string) => void;
  onCommit: (category: string) => void;
} & InspectorSemanticCommentProps;

export function InspectorCategoryField({
  category,
  suggestions = [],
  onChange,
  onCommit,
  semanticCommentCounts,
  onOpenSemanticComments,
}: InspectorCategoryFieldProps) {
  const { t } = useTranslation();
  return (
    <InspectorCommentSlot
      slot={{ kind: 'field', field: 'category' }}
      label={t('inspector.category')}
      semanticCommentCounts={semanticCommentCounts}
      onOpenSemanticComments={onOpenSemanticComments}
    >
      <CategoryField
        category={category}
        suggestions={suggestions}
        onChange={onChange}
        onBlur={onCommit}
      />
    </InspectorCommentSlot>
  );
}

type InspectorDescriptionFieldProps = {
  value: string;
  onChange: (description: string) => void;
  onCommit: (description: string) => void;
} & InspectorTextCommentProps;

export function InspectorDescriptionField({
  value,
  onChange,
  onCommit,
  textCommentCounts,
  onOpenTextComments,
}: InspectorDescriptionFieldProps) {
  const { t } = useTranslation();
  return (
    <InspectorCommentField
      field="description"
      label={t('inspector.description')}
      textCommentCounts={textCommentCounts}
      onOpenTextComments={onOpenTextComments}
    >
      <label className="form-field form-field--compact">
        {t('inspector.description')}
        <textarea
          className="form-control form-control--compact form-control--multiline"
          data-comment-field="description"
          rows={7}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onCommit(event.target.value)}
        />
      </label>
    </InspectorCommentField>
  );
}
