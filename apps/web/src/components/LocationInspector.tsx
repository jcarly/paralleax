import { EntityNameInput } from './EntityNameInput';
import type {
  ItemDefinition,
  Location,
  MoveItemInstanceInput,
  StatDefinition,
} from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import {
  InspectorCommentField,
  InspectorCommentSlot,
  type InspectorSemanticCommentProps,
  type InspectorTextCommentProps,
} from '../features/comments/InspectorCommentField';
import { CategoryField } from './CategoryField';
import { ImageUrlField } from './ImageUrlField';
import { ItemInstanceTree } from './ItemInstanceTree';

type LocationInspectorProps = {
  location: Location;
  categorySuggestions?: string[];
  onLocalChange: (location: Location) => void;
  onPatch: (
    locationId: string,
    patch: Partial<Pick<Location, 'name' | 'description' | 'category' | 'imageUrl'>>,
  ) => Promise<void>;
  itemDefinitions: ItemDefinition[];
  statDefinitions: StatDefinition[];
  onMoveItem: (itemId: string, placement: MoveItemInstanceInput) => Promise<void>;
} & InspectorTextCommentProps &
  InspectorSemanticCommentProps;
export function LocationInspector(props: LocationInspectorProps) {
  const { t } = useTranslation();
  return (
    <div>
      <h3>{t('inspector.location')}</h3>
      <LocationImageSection {...props} />
      <LocationNameSection {...props} />
      <LocationCategorySection {...props} />
      <LocationItemsSection {...props} />
      <LocationDescriptionSection {...props} />
    </div>
  );
}

function LocationImageSection({
  location,
  onLocalChange,
  onPatch,
  semanticCommentCounts,
  onOpenSemanticComments,
}: Pick<
  LocationInspectorProps,
  'location' | 'onLocalChange' | 'onPatch' | 'semanticCommentCounts' | 'onOpenSemanticComments'
>) {
  const { t } = useTranslation();
  return (
    <InspectorCommentSlot
      slot={{ kind: 'field', field: 'imageUrl' }}
      label={t('inspector.imageUrl')}
      semanticCommentCounts={semanticCommentCounts}
      onOpenSemanticComments={onOpenSemanticComments}
    >
      <ImageUrlField
        imageUrl={location.imageUrl}
        onChange={(imageUrl) => onLocalChange({ ...location, imageUrl })}
        onBlur={(imageUrl) => void onPatch(location.id, { imageUrl })}
      />
    </InspectorCommentSlot>
  );
}

function LocationNameSection({
  location,
  onLocalChange,
  onPatch,
  textCommentCounts,
  onOpenTextComments,
}: Pick<
  LocationInspectorProps,
  'location' | 'onLocalChange' | 'onPatch' | 'textCommentCounts' | 'onOpenTextComments'
>) {
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
          value={location.name}
          onChange={(name) => onLocalChange({ ...location, name })}
          onCommit={(name) => onPatch(location.id, { name })}
        />
      </label>
    </InspectorCommentField>
  );
}

function LocationCategorySection({
  location,
  categorySuggestions = [],
  onLocalChange,
  onPatch,
  semanticCommentCounts,
  onOpenSemanticComments,
}: Pick<
  LocationInspectorProps,
  | 'location'
  | 'categorySuggestions'
  | 'onLocalChange'
  | 'onPatch'
  | 'semanticCommentCounts'
  | 'onOpenSemanticComments'
>) {
  const { t } = useTranslation();
  return (
    <InspectorCommentSlot
      slot={{ kind: 'field', field: 'category' }}
      label={t('inspector.category')}
      semanticCommentCounts={semanticCommentCounts}
      onOpenSemanticComments={onOpenSemanticComments}
    >
      <CategoryField
        category={location.category}
        suggestions={categorySuggestions}
        onChange={(category) => onLocalChange({ ...location, category })}
        onBlur={(category) => void onPatch(location.id, { category })}
      />
    </InspectorCommentSlot>
  );
}

function LocationItemsSection({
  location,
  itemDefinitions,
  statDefinitions,
  onMoveItem,
  semanticCommentCounts,
  onOpenSemanticComments,
}: Pick<
  LocationInspectorProps,
  | 'location'
  | 'itemDefinitions'
  | 'statDefinitions'
  | 'onMoveItem'
  | 'semanticCommentCounts'
  | 'onOpenSemanticComments'
>) {
  const { t } = useTranslation();
  return (
    <InspectorCommentSlot
      slot={{ kind: 'section', section: 'items' }}
      label={t('inspector.items')}
      semanticCommentCounts={semanticCommentCounts}
      onOpenSemanticComments={onOpenSemanticComments}
    >
      <h3>{t('inspector.items')}</h3>
      {(location.items ?? []).length === 0 ? (
        <p className="hint">{t('inspector.noLocationItems')}</p>
      ) : (
        <ItemInstanceTree
          items={location.items ?? []}
          itemDefinitions={itemDefinitions}
          statDefinitions={statDefinitions}
          rootPlacement={{ locationId: location.id }}
          onMove={onMoveItem}
        />
      )}
    </InspectorCommentSlot>
  );
}

function LocationDescriptionSection({
  location,
  onLocalChange,
  onPatch,
  textCommentCounts,
  onOpenTextComments,
}: Pick<
  LocationInspectorProps,
  'location' | 'onLocalChange' | 'onPatch' | 'textCommentCounts' | 'onOpenTextComments'
>) {
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
          value={location.description}
          onChange={(event) => onLocalChange({ ...location, description: event.target.value })}
          onBlur={(event) => void onPatch(location.id, { description: event.target.value })}
        />
      </label>
    </InspectorCommentField>
  );
}
