export const commercialSelectorLimit = 50

export type CommercialCoverage = {
  limit: number
  returned: number
  total?: number
  truncated: boolean
}

export type BoundedCommercialResult<Row> = {
  coverage: CommercialCoverage
  rows: Row[]
}

export function exactPageResult<Row extends { totalCount: number }>(
  rows: Row[],
  options: { limit: number; offset: number }
): BoundedCommercialResult<Omit<Row, "totalCount">> {
  const total = rows[0]?.totalCount ?? 0
  const pageRows = rows.map(({ totalCount, ...row }) => {
    void totalCount
    return row
  })

  return {
    coverage: {
      limit: options.limit,
      returned: pageRows.length,
      total,
      truncated: options.offset + pageRows.length < total,
    },
    rows: pageRows,
  }
}

export function selectorResult<Row>(
  rows: Row[],
  limit = commercialSelectorLimit
): BoundedCommercialResult<Row> {
  const resultRows = rows.slice(0, limit)
  return {
    coverage: {
      limit,
      returned: resultRows.length,
      truncated: rows.length > limit,
    },
    rows: resultRows,
  }
}

export function selectorSearchTerm(value: string) {
  const query = value.trim().toLowerCase()
  const containsPattern =
    query.length >= 3
      ? `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
      : null

  return { containsPattern, query }
}
