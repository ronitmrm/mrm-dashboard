import { requireCapability } from "@/lib/auth/require-capability"
import { masterCsvResponse } from "@/lib/master-data-csv"

export async function GET() {
  await requireCapability("pricing.enquiries.read", "/commercial/enquiries")
  return masterCsvResponse(
    [
      {
        "ENQ No.": "",
        "Customer UID": "",
        Customer: "",
        Source: "Email",
        Priority: "Normal",
        "Buyer Name": "",
        Remarks: "",
      },
    ],
    "enquiry-register-import-template.csv"
  )
}
