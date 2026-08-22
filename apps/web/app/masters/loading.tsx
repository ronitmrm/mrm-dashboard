import { Skeleton } from "@workspace/ui/components/skeleton"

export default function MasterSelectionLoading() {
  return (
    <div aria-label="Loading Master Selection" className="grid gap-6">
      <Skeleton className="h-16 w-80 max-w-full" />
      <Skeleton className="mx-auto h-80 w-full max-w-3xl" />
    </div>
  )
}
