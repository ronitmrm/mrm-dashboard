import { createProductPortfolioRepository } from "@workspace/db"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { masterCsvResponse } from "@/lib/master-data-csv"

export async function GET() {
  await requireCapability(
    masterCapability("products", "rename"),
    "/masters/products"
  )
  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await repository
    .listForOrganization("MRMPL")
    .finally(() => repository.close())
  return masterCsvResponse(
    rows.map((row) => ({ current_part_code: row.uid, new_part_code: "" })),
    "universal-part-code-renames.csv",
    ["current_part_code", "new_part_code"]
  )
}
