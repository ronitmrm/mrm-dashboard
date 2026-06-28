export type CorrectionTargetRow = {
  targetTable: string;
  targetId: string;
  action: string;
};

export type CorrectableRow = {
  _id: unknown;
  createdAt?: string;
};

const activeCorrectionActions = new Set(["reverse", "replace", "close"]);

export function activeCorrectionTargetKeys(corrections: CorrectionTargetRow[]) {
  return new Set(corrections
    .filter((row) => activeCorrectionActions.has(row.action))
    .map((row) => `${row.targetTable}:${row.targetId}`));
}

export function latestUncorrectedRow<T extends CorrectableRow>(
  rows: T[],
  targetTable: string,
  correctionTargets: Set<string>,
) {
  return rows
    .filter((row) => !correctionTargets.has(`${targetTable}:${String(row._id)}`))
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))
    .at(-1);
}
