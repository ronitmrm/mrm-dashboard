import { CustomerParameterCostingView } from "./costing-workspace"

export const dynamic = "force-dynamic"

export default function CustomerParameterCostingPage(props: {
  searchParams: Promise<{ poRevision?: string; task?: string }>
}) {
  return CustomerParameterCostingView(props)
}
