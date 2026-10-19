import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { masterCsvResponse } from "@/lib/master-data-csv"
import { portfolioCsvColumns } from "@/lib/portfolio-csv"

export async function GET() {
  await requireCapability(
    masterCapability("products", "import"),
    "/masters/products"
  )
  return masterCsvResponse([], "products-template.csv", portfolioCsvColumns)
}
