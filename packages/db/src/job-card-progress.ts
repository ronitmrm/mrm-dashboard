/** Equal share per selected-route setup; excess output never fills another share. */
export function buildJobCardProgress(
  orderedQuantity: number,
  setups: ReadonlyArray<{ setupNumber: string; goodPieces: number }>,
) {
  const setupPerformance = setups.map(({ setupNumber, goodPieces }) => ({
    setupNumber,
    actualGoodPieces: goodPieces,
    completionPercent: orderedQuantity > 0
      ? Math.min(Math.max(goodPieces / orderedQuantity * 100, 0), 100)
      : 0,
  }))
  return {
    completionPercent: orderedQuantity > 0 && setups.length
      ? setupPerformance.reduce((sum, setup) => sum + setup.completionPercent, 0) / setups.length
      : null,
    completedSetupCount: setupPerformance.filter((setup) => setup.completionPercent >= 100).length,
    setupCount: setups.length,
    setupPerformance,
  }
}
