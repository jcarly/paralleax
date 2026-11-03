export interface GuideRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface GuideViewport {
  width: number;
  height: number;
}

export interface GuideCardPosition {
  left: number;
  top?: number;
  bottom?: number;
  placement: 'top' | 'right' | 'bottom' | 'left' | 'corner' | 'mobile-bottom';
}

interface PositionCandidate extends GuideCardPosition {
  top: number;
  overlapArea: number;
  distanceFromTarget: number;
}

const edgeGap = 16;
const targetGap = 12;
const safeTop = 74;

function getAdjacentCandidates(
  cardWidth: number,
  cardHeight: number,
  target: GuideRect,
): PositionCandidate[] {
  const centeredLeft = target.left + target.width / 2 - cardWidth / 2;
  const centeredTop = target.top + target.height / 2 - cardHeight / 2;
  return [
    {
      left: centeredLeft,
      top: target.top - cardHeight - targetGap,
      placement: 'top',
      overlapArea: 0,
      distanceFromTarget: 0,
    },
    {
      left: target.right + targetGap,
      top: centeredTop,
      placement: 'right',
      overlapArea: 0,
      distanceFromTarget: 0,
    },
    {
      left: centeredLeft,
      top: target.bottom + targetGap,
      placement: 'bottom',
      overlapArea: 0,
      distanceFromTarget: 0,
    },
    {
      left: target.left - cardWidth - targetGap,
      top: centeredTop,
      placement: 'left',
      overlapArea: 0,
      distanceFromTarget: 0,
    },
  ];
}

function fitsViewport(
  candidate: PositionCandidate,
  cardWidth: number,
  cardHeight: number,
  viewport: GuideViewport,
): boolean {
  return (
    candidate.left >= edgeGap &&
    candidate.left + cardWidth <= viewport.width - edgeGap &&
    candidate.top >= safeTop &&
    candidate.top + cardHeight <= viewport.height - edgeGap
  );
}

function asPosition(candidate: PositionCandidate): GuideCardPosition {
  return {
    left: candidate.left,
    top: candidate.top,
    placement: candidate.placement,
  };
}

function scoreCorner(
  corner: { left: number; top: number },
  card: Pick<GuideRect, 'width' | 'height'>,
  target: GuideRect,
): PositionCandidate {
  const { left, top } = corner;
  const { width: cardWidth, height: cardHeight } = card;
  const overlapWidth = Math.max(
    0,
    Math.min(left + cardWidth, target.right) - Math.max(left, target.left),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(top + cardHeight, target.bottom) - Math.max(top, target.top),
  );
  const cardCenterX = left + cardWidth / 2;
  const cardCenterY = top + cardHeight / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  return {
    left,
    top,
    placement: 'corner',
    overlapArea: overlapWidth * overlapHeight,
    distanceFromTarget: Math.hypot(cardCenterX - targetCenterX, cardCenterY - targetCenterY),
  };
}

function getCornerCandidates(
  cardWidth: number,
  cardHeight: number,
  target: GuideRect,
  viewport: GuideViewport,
): PositionCandidate[] {
  const corners = [
    { left: edgeGap, top: safeTop },
    { left: viewport.width - cardWidth - edgeGap, top: safeTop },
    { left: edgeGap, top: viewport.height - cardHeight - edgeGap },
    { left: viewport.width - cardWidth - edgeGap, top: viewport.height - cardHeight - edgeGap },
  ];
  return corners
    .filter((corner) =>
      fitsViewport(
        { ...corner, placement: 'corner', overlapArea: 0, distanceFromTarget: 0 },
        cardWidth,
        cardHeight,
        viewport,
      ),
    )
    .map((corner) => scoreCorner(corner, { width: cardWidth, height: cardHeight }, target));
}

function getCornerPosition(
  cardWidth: number,
  cardHeight: number,
  target: GuideRect,
  viewport: GuideViewport,
): GuideCardPosition {
  const candidates = getCornerCandidates(cardWidth, cardHeight, target, viewport).sort(
    (first, second) =>
      first.overlapArea - second.overlapArea ||
      second.distanceFromTarget - first.distanceFromTarget,
  );
  const bestCandidate = candidates[0];
  return bestCandidate
    ? asPosition(bestCandidate)
    : { left: edgeGap, top: safeTop, placement: 'corner' };
}

export function getGuideCardPosition(
  card: Pick<GuideRect, 'width' | 'height'>,
  target: GuideRect | undefined,
  viewport: GuideViewport,
): GuideCardPosition {
  const cardWidth = Math.min(
    card.width || viewport.width - edgeGap * 2,
    viewport.width - edgeGap * 2,
  );
  const cardHeight = card.height || 190;
  if (viewport.width <= 620) {
    return { left: edgeGap, bottom: edgeGap, placement: 'mobile-bottom' };
  }
  if (!target) {
    return {
      left: Math.max(edgeGap, viewport.width - cardWidth - edgeGap),
      top: safeTop,
      placement: 'corner',
    };
  }

  const fitting = getAdjacentCandidates(cardWidth, cardHeight, target).filter((candidate) =>
    fitsViewport(candidate, cardWidth, cardHeight, viewport),
  );
  const bestAdjacent = fitting[0];
  return bestAdjacent
    ? asPosition(bestAdjacent)
    : getCornerPosition(cardWidth, cardHeight, target, viewport);
}
