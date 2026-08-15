function optionalFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function productionPieceWeightGrams(row: Record<string, unknown>) {
  const operationWeight = optionalFiniteNumber(row.operationWeight);
  const stageWeight = optionalFiniteNumber(row.stageWeight);
  if (operationWeight !== undefined && operationWeight > 0) return operationWeight;
  return stageWeight !== undefined && stageWeight > 0 ? stageWeight : 0;
}
