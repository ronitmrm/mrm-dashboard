import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCsvResponse } from "@/lib/master-data-csv"

export async function GET() {
  await requireCapability(
    commercialCapabilities.purchaseOrders.read,
    "/commercial/orders"
  )
  return masterCsvResponse(
    [
      {
        "Customer UID": "",
        "PO Number": "",
        "PO Date": "",
        Currency: "USD",
        Notes: "",
        "Line Number": "",
        "Customer Part Code": "",
        Description: "",
        Quantity: "",
        "PO Price": "",
      },
    ],
    "purchase-order-import-template.csv"
  )
}
