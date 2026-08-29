import { ProductParameterCostingView } from "./costing-workspace"

export const dynamic = "force-dynamic"

export default function ProductParameterCostingPage(props: {
  searchParams: Promise<{ item?: string; task?: string }>
}) {
  return ProductParameterCostingView(props)
}
