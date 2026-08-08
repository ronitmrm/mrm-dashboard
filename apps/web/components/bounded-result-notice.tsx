import {
  OPERATIONAL_LIST_PAGE_SIZE,
  boundedOperationalRows,
} from "@/lib/bounded-operational-rows"

export { OPERATIONAL_LIST_PAGE_SIZE, boundedOperationalRows }

export function BoundedResultNotice({ hasMore }: { hasMore: boolean }) {
  if (!hasMore) return null
  return (
    <p className="text-xs text-muted-foreground" role="status">
      Showing the newest {OPERATIONAL_LIST_PAGE_SIZE} operational records. Use
      the register export for complete history.
    </p>
  )
}
