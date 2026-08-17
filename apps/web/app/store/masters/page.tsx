import { redirect } from "next/navigation"

export default function LegacyStoreMastersPage() {
  redirect("/?tab=dataEntryTab&entry=store_masters")
}
