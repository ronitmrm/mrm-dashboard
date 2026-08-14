import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildEnquiryRegisterTemplate,
  enquiryRegisterTemplateFilename,
} from "../../enquiry-workbook"

export async function GET() {
  await requireCapability("pricing.enquiries.read", "/commercial/enquiries")
  return xlsxResponse(
    buildEnquiryRegisterTemplate(),
    enquiryRegisterTemplateFilename()
  )
}
