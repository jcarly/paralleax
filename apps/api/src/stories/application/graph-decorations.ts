import type { GraphDecoration } from '@paralleax/shared';
import type { CreateGraphDecorationDto } from '../dto/stories.dto';

export function buildGraphDecoration(
  decorationId: string,
  input: CreateGraphDecorationDto,
): GraphDecoration {
  if (input.kind === 'frame') {
    return buildFrameDecoration(decorationId, input);
  }
  return buildTextDecoration(decorationId, input);
}

function buildFrameDecoration(
  decorationId: string,
  input: CreateGraphDecorationDto,
): Extract<GraphDecoration, { kind: 'frame' }> {
  return {
    id: decorationId,
    kind: 'frame',
    position: input.position,
    color: input.color ?? '#5b6ee1',
    width: input.width ?? 420,
    height: input.height ?? 240,
  };
}

function buildTextDecoration(
  decorationId: string,
  input: CreateGraphDecorationDto,
): Extract<GraphDecoration, { kind: 'text' }> {
  return {
    id: decorationId,
    kind: 'text',
    position: input.position,
    color: input.color ?? '#273043',
    text: input.text ?? 'Aa',
    fontSize: input.fontSize ?? 32,
    fontFamily: input.fontFamily ?? 'sans',
    fontWeight: input.fontWeight ?? 'normal',
    fontStyle: input.fontStyle ?? 'normal',
  };
}
