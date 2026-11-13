import type {
  ItemDefinition,
  Location,
  MoveItemInstanceInput,
  StatDefinition,
} from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import {
  InspectorCommentSlot,
  type InspectorSemanticCommentProps,
  type InspectorTextCommentProps,
} from '../features/comments/InspectorCommentField';
import { ItemInstanceTree } from './ItemInstanceTree';
import {
  InspectorCategoryField,
  InspectorDescriptionField,
  InspectorImageField,
  InspectorNameField,
} from './InspectorEntityFields';

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
  return (
    <InspectorImageField
      imageUrl={location.imageUrl}
      semanticCommentCounts={semanticCommentCounts}
      onOpenSemanticComments={onOpenSemanticComments}
      onChange={(imageUrl) => onLocalChange({ ...location, imageUrl })}
      onCommit={(imageUrl) => void onPatch(location.id, { imageUrl })}
    />
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
  return (
    <InspectorNameField
      value={location.name}
      textCommentCounts={textCommentCounts}
      onOpenTextComments={onOpenTextComments}
      onChange={(name) => onLocalChange({ ...location, name })}
      onCommit={(name) => void onPatch(location.id, { name })}
    />
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
  return (
    <InspectorCategoryField
      category={location.category}
      suggestions={categorySuggestions}
      semanticCommentCounts={semanticCommentCounts}
      onOpenSemanticComments={onOpenSemanticComments}
      onChange={(category) => onLocalChange({ ...location, category })}
      onCommit={(category) => void onPatch(location.id, { category })}
    />
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
  return (
    <InspectorDescriptionField
      value={location.description}
      textCommentCounts={textCommentCounts}
      onOpenTextComments={onOpenTextComments}
      onChange={(description) => onLocalChange({ ...location, description })}
      onCommit={(description) => void onPatch(location.id, { description })}
    />
  );
}
