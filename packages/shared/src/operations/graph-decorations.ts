import type { GraphDecoration, Story, UpdateGraphDecorationInput } from '../model/index.js';

export function updateGraphDecorationInStory(
  story: Story,
  decorationId: string,
  patch: UpdateGraphDecorationInput,
): Story {
  return {
    ...story,
    graphDecorations: (story.graphDecorations ?? []).map((decoration) =>
      decoration.id === decorationId ? patchGraphDecoration(decoration, patch) : decoration,
    ),
  };
}

export function deleteGraphDecorationFromStory(story: Story, decorationId: string): Story {
  return {
    ...story,
    graphDecorations: (story.graphDecorations ?? []).filter(({ id }) => id !== decorationId),
  };
}

function patchGraphDecoration(
  decoration: GraphDecoration,
  patch: UpdateGraphDecorationInput,
): GraphDecoration {
  const common = {
    ...decoration,
    ...(patch.position === undefined ? {} : { position: patch.position }),
    ...(patch.color === undefined ? {} : { color: patch.color }),
  };

  if (decoration.kind === 'frame') {
    return {
      ...common,
      kind: 'frame',
      width: patch.width ?? decoration.width,
      height: patch.height ?? decoration.height,
    };
  }

  return {
    ...common,
    kind: 'text',
    text: patch.text ?? decoration.text,
    fontSize: patch.fontSize ?? decoration.fontSize,
    fontFamily: patch.fontFamily ?? decoration.fontFamily,
    fontWeight: patch.fontWeight ?? decoration.fontWeight,
    fontStyle: patch.fontStyle ?? decoration.fontStyle,
  };
}
