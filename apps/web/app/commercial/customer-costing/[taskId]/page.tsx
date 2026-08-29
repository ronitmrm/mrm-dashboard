import { CustomerParameterCostingView } from "../costing-workspace"

export const dynamic = "force-dynamic"

export default async function CustomerParameterCostingTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>
  searchParams: Promise<{ poRevision?: string }>
}) {
  const [{ taskId }, query] = await Promise.all([params, searchParams])

  return CustomerParameterCostingView({
    searchParams: Promise.resolve({
      poRevision: query.poRevision,
      task: taskId,
    }),
    standalone: true,
  })
}
