import { ProductParameterCostingView } from "../costing-workspace"

export const dynamic = "force-dynamic"

export default async function ProductParameterCostingTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>
  searchParams: Promise<{ item?: string }>
}) {
  const [{ taskId }, query] = await Promise.all([params, searchParams])

  return ProductParameterCostingView({
    searchParams: Promise.resolve({ item: query.item, task: taskId }),
    standalone: true,
  })
}
