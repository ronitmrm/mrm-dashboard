import { createCommercialWorkflowRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildEnquiryLinesExport,
  enquiryLinesExportFilename,
} from "../../../enquiry-workbook"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireCapability("pricing.enquiries.read", "/commercial/enquiries")
  const { id } = await params
  const repository = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const result = await repository.getEnquiryLinesForExport(id)
    return xlsxResponse(
      buildEnquiryLinesExport(result.enquiry, result.items),
      enquiryLinesExportFilename(result.enquiry.enquiryNumber)
    )
  } finally {
    await repository.close()
  }
}
