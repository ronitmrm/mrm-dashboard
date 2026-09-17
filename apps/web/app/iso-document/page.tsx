import { redirect } from "next/navigation"
import { measuringInstrumentRegister } from "@/lib/iso-documents"

export default function IsoDocumentPage() {
  redirect(measuringInstrumentRegister.href)
}
