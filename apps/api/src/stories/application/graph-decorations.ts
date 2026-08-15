import type { GraphDecoration } from '@paralleax/shared';
import type { CreateGraphDecorationDto } from '../dto/stories.dto';

export function buildGraphDecoration(
  decorationId: string,
  input: CreateGraphDecorationDto,
): GraphDecoration {
  return input.kind === 'frame'
    ? {
        id: decorationId,
        kind: 'frame',
        position: input.position,
        color: input.color ?? '#5b6ee1',
        width: input.width ?? 420,
        height: input.height ?? 240,
      }
    : {
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
