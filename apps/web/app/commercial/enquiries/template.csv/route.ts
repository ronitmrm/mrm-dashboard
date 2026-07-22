import * as XLSX from "xlsx"

import { requireCapability } from "@/lib/auth/require-capability"

import {
  buildEnquiryLinesTemplate,
  enquiryLinesTemplateFilename,
} from "../enquiry-workbook"

export async function GET() {
  await requireCapability("pricing.enquiries.read", "/commercial/enquiries")
  const workbook = buildEnquiryLinesTemplate()
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  const csv = XLSX.utils.sheet_to_csv(sheet!)
  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${enquiryLinesTemplateFilename()}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  })
}
