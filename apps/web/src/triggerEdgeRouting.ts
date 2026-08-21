export function getTriggerEdgeStepPosition(
  index: number | undefined,
  count: number | undefined,
  routesIntoTrigger: boolean,
) {
  const hasSeveralLanes =
    typeof index === 'number' &&
    typeof count === 'number' &&
    Number.isInteger(index) &&
    Number.isInteger(count) &&
    count >= 2 &&
    index >= 0 &&
    index < count;
  const firstLane = routesIntoTrigger ? 0.62 : 0.14;
  const lastLane = routesIntoTrigger ? 0.86 : 0.38;
  if (!hasSeveralLanes) return (firstLane + lastLane) / 2;
  return firstLane + ((lastLane - firstLane) * index) / (count - 1);
}
