import { redirect } from "next/navigation"

export default function ExistingStockBookmark() {
  redirect(
    "/masters/store/existing-stock?masterUnit=universal&masterMain=store_masters&masterSub=EXISTING_STOCK"
  )
}
