import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { isStoryDateTime, type NativeStoryContent } from '@paralleax/shared';
import {
  CreateCharacterDto,
  CreateCharacterItemDto,
  CreateCharacterStatDto,
  CreateGraphDecorationDto,
  CreateGroupDto,
  CreateItemDefinitionDto,
  CreateLocationDto,
  CreateStatDefinitionDto,
  CreateStoryDto,
  CreateTriggerDto,
  MoveItemInstanceDto,
  UpdateInteractionDto,
} from '../dto/stories.dto';

export interface NativeStoryDtoIssue {
  path: string;
  message: string;
}

type DtoCheck = { type: ClassConstructor<object>; value: object; path: string };

/** Reuse the editor DTO constraints after structural validation and quota checks. */
export function validateNativeStoryDtoConstraints(
  story: NativeStoryContent,
): NativeStoryDtoIssue | undefined {
  if (story.startDateTime !== undefined && !isStoryDateTime(story.startDateTime)) {
    return { path: '$.story.startDateTime', message: 'Story start date and time is invalid' };
  }
  for (const check of storyChecks(story)) {
    const issue = validateCheck(check);
    if (issue !== undefined) {
      return issue;
    }
  }
  return undefined;
}

function storyChecks(story: NativeStoryContent): DtoCheck[] {
  return [
    { type: CreateStoryDto, value: { title: story.title }, path: '$.story' },
    ...entries(CreateLocationDto, story.locations ?? [], '$.story.locations'),
    ...entries(CreateCharacterDto, story.characters ?? [], '$.story.characters'),
    ...entries(CreateStatDefinitionDto, story.statDefinitions ?? [], '$.story.statDefinitions'),
    ...entries(CreateItemDefinitionDto, story.itemDefinitions ?? [], '$.story.itemDefinitions'),
    ...entries(CreateGroupDto, story.groups ?? [], '$.story.groups'),
    ...entries(CreateGraphDecorationDto, story.graphDecorations ?? [], '$.story.graphDecorations'),
    ...ownerChecks(story),
    ...graphChecks(story),
  ];
}

function ownerChecks(story: NativeStoryContent): DtoCheck[] {
  const assignments = entries(CreateCharacterStatDto, story.stats ?? [], '$.story.stats');
  const characters = (story.characters ?? []).flatMap((owner, index) =>
    ownerChecksFor(owner, `$.story.characters[${index}]`, { characterId: owner.id }),
  );
  const locations = (story.locations ?? []).flatMap((owner, index) =>
    ownerChecksFor(owner, `$.story.locations[${index}]`, { locationId: owner.id }),
  );
  return [...assignments, ...characters, ...locations];
}

function ownerChecksFor(
  owner: {
    stats?: NonNullable<NativeStoryContent['stats']>;
    items?: NonNullable<NonNullable<NativeStoryContent['characters']>[number]['items']>;
  },
  path: string,
  root: { characterId: string } | { locationId: string },
): DtoCheck[] {
  return [
    ...entries(CreateCharacterStatDto, owner.stats ?? [], `${path}.stats`),
    ...(owner.items ?? []).flatMap((item, index) => {
      const itemPath = `${path}.items[${index}]`;
      return [
        { type: CreateCharacterItemDto, value: item, path: itemPath },
        {
          type: MoveItemInstanceDto,
          value:
            item.parentItemId === undefined
              ? { ...root, relationshipType: item.relationshipType, slotKey: item.slotKey }
              : {
                  parentItemId: item.parentItemId,
                  relationshipType: item.relationshipType,
                  slotKey: item.slotKey,
                },
          path: itemPath,
        },
      ];
    }),
  ];
}

function graphChecks(story: NativeStoryContent): DtoCheck[] {
  return story.interactions.flatMap((interaction, index) => {
    const path = `$.story.interactions[${index}]`;
    return [
      { type: UpdateInteractionDto, value: interaction, path },
      ...entries(CreateTriggerDto, interaction.triggers, `${path}.triggers`),
    ];
  });
}

function entries(
  type: ClassConstructor<object>,
  values: readonly object[],
  path: string,
): DtoCheck[] {
  return values.map((value, index) => ({ type, value, path: `${path}[${index}]` }));
}

function validateCheck(check: DtoCheck): NativeStoryDtoIssue | undefined {
  const instance = plainToInstance(check.type, check.value);
  const errors = validateSync(instance, {
    whitelist: true,
    validationError: { target: false, value: false },
    stopAtFirstError: true,
  });
  return firstError(errors, check.path);
}

function firstError(errors: ValidationError[], path: string): NativeStoryDtoIssue | undefined {
  for (const error of errors) {
    const nestedPath = /^\d+$/.test(error.property)
      ? `${path}[${error.property}]`
      : `${path}.${error.property}`;
    const messages = Object.values(error.constraints ?? {});
    if (messages.length > 0) {
      return { path: nestedPath, message: messages[0] };
    }
    const nested = firstError(error.children ?? [], nestedPath);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}
