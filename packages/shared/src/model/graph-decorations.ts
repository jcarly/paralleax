import type { Position } from './common.js';

export const MAX_GRAPH_DECORATION_TEXT_LENGTH = 2_000;
export const MIN_GRAPH_FRAME_WIDTH = 120;
export const MIN_GRAPH_FRAME_HEIGHT = 80;
export const MIN_GRAPH_TEXT_SIZE = 10;
export const MAX_GRAPH_TEXT_SIZE = 96;

export type GraphDecorationFontFamily = 'sans' | 'serif' | 'monospace' | 'display';
export type GraphDecorationFontWeight = 'normal' | 'bold';
export type GraphDecorationFontStyle = 'normal' | 'italic';

interface GraphDecorationBase {
  id: string;
  position: Position;
  color: string;
}

export interface GraphFrameDecoration extends GraphDecorationBase {
  kind: 'frame';
  width: number;
  height: number;
}

export interface GraphTextDecoration extends GraphDecorationBase {
  kind: 'text';
  text: string;
  fontSize: number;
  fontFamily: GraphDecorationFontFamily;
  fontWeight: GraphDecorationFontWeight;
  fontStyle: GraphDecorationFontStyle;
}

export type GraphDecoration = GraphFrameDecoration | GraphTextDecoration;

export type CreateGraphDecorationInput =
  | {
      kind: 'frame';
      position: Position;
      color?: string;
      width?: number;
      height?: number;
    }
  | {
      kind: 'text';
      position: Position;
      color?: string;
      text?: string;
      fontSize?: number;
      fontFamily?: GraphDecorationFontFamily;
      fontWeight?: GraphDecorationFontWeight;
      fontStyle?: GraphDecorationFontStyle;
    };

export interface UpdateGraphDecorationInput {
  position?: Position;
  color?: string;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: GraphDecorationFontFamily;
  fontWeight?: GraphDecorationFontWeight;
  fontStyle?: GraphDecorationFontStyle;
}
