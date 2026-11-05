import { describe, expect, it } from 'vitest';
import { getGuideCardPosition } from './guidePlacement';

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe('getGuideCardPosition', () => {
  it('places the card beside the target when there is room', () => {
    expect(
      getGuideCardPosition({ width: 280, height: 140 }, rect(500, 300, 100, 80), {
        width: 1000,
        height: 700,
      }),
    ).toEqual({ left: 410, top: 148, placement: 'top' });
  });

  it('docks the card at the bottom on narrow screens', () => {
    expect(
      getGuideCardPosition({ width: 300, height: 160 }, rect(100, 220, 100, 80), {
        width: 390,
        height: 844,
      }),
    ).toEqual({ left: 16, bottom: 16, placement: 'mobile-bottom' });
  });

  it('moves the card above a target it would cover on a narrow screen', () => {
    expect(
      getGuideCardPosition({ width: 300, height: 160 }, rect(100, 710, 100, 50), {
        width: 390,
        height: 844,
      }),
    ).toEqual({ left: 16, top: 74, placement: 'mobile-top' });
  });

  it('uses a quiet viewport corner when there is no highlighted target', () => {
    expect(
      getGuideCardPosition({ width: 320, height: 160 }, undefined, {
        width: 1200,
        height: 800,
      }),
    ).toEqual({ left: 864, top: 74, placement: 'corner' });
  });
});
