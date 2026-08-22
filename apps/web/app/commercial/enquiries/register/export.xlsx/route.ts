import { createCommercialWorkflowRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildEnquiryRegisterExport,
  enquiryRegisterExportFilename,
} from "../../enquiry-workbook"

export async function GET() {
  const session = await requireCapability(
    "pricing.enquiries.read",
    "/commercial/enquiries"
  )
  const repository = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    return xlsxResponse(
      buildEnquiryRegisterExport(
        await repository.listEnquiriesForExport("MRMPL", 500, {
          originatingSalespersonUserId: session.user.id,
        })
      ),
      enquiryRegisterExportFilename()
    )
  } finally {
    await repository.close()
  }
}
