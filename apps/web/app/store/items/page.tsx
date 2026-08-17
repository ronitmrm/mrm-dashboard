import { redirect } from "next/navigation"

export default function LegacyStoreItemsPage() {
  redirect("/?tab=dataEntryTab&entry=store_masters")
}
