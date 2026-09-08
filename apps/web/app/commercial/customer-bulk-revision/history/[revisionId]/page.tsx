import { BulkRevisionHistoryDetail } from "../../../revisions/bulk-revision-history"
export const dynamic = "force-dynamic"
export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ revisionId: string }>
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const { revisionId } = await params
  const search = await searchParams
  return (
    <BulkRevisionHistoryDetail
      origin="customer"
      revisionId={revisionId}
      page={Number(search.page) || 1}
      query={search.q}
    />
  )
}
