export const OPERATIONAL_LIST_PAGE_SIZE = 200

export function boundedOperationalRows<Row>(rows: Row[]) {
  return {
    hasMore: rows.length > OPERATIONAL_LIST_PAGE_SIZE,
    rows: rows.slice(0, OPERATIONAL_LIST_PAGE_SIZE),
  }
}
