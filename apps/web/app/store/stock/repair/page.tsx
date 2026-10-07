import { redirect } from "next/navigation"

export default async function StoreRepairPoPage({
  searchParams,
}: {
  searchParams: Promise<{
    asset_code?: string | string[]
    issuance_id?: string | string[]
  }>
}) {
  const params = await searchParams
  const query = new URLSearchParams({ store: "MAIN" })
  const codes = Array.isArray(params.asset_code)
    ? params.asset_code
    : params.asset_code ? [params.asset_code] : []
  for (const code of codes) query.append("asset_code", code)
  const issuanceId = Array.isArray(params.issuance_id)
    ? params.issuance_id[0]
    : params.issuance_id
  if (issuanceId) query.set("issuance_id", issuanceId)
  redirect(`/department-store/repair?${query}`)
}
