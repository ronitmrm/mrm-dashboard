"use server"

import {
  createPortfolioEntryRepository,
  PortfolioEntryError,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import { masterCapability } from "@/lib/auth/master-capabilities"

export async function createPortfolioProductAction(
  _state: { error: string },
  form: FormData
) {
  const masterData = form.get("master_data") === "true"
  const session = await requireCapability(
    masterData
      ? masterCapability("products", "create")
      : commercialTaskCapabilities.saveDesign,
    masterData ? "/masters/products" : "/commercial/products/new"
  )
  const text = (name: string) => String(form.get(name) ?? "").trim()
  const type = text("item_type")
  if (type !== "List" && type !== "Package" && type !== "Assembly")
    return { error: "Choose a valid item type." }
  const componentUids = form.getAll("component_uid").map(String)
  const quantities = form.getAll("component_quantity").map(Number)
  if (componentUids.length !== quantities.length)
    return { error: "BOM quantities are incomplete." }
  const repository = createPortfolioEntryRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  let uid: string
  try {
    const saved = await repository.create({
      actorUserId: session.user.id,
      organizationCode: "MRMPL",
      uid: text("uid"),
      itemType: type,
      productSize: text("product_size"),
      category: text("category"),
      subcategory: text("subcategory"),
      productType: text("product_type"),
      productionType: text("production_type"),
      grade: text("grade"),
      rodType: text("rod_type"),
      rodSize: text("rod_size"),
      pieceWeight: Number(text("piece_weight")),
      blankPieceWeight: Number(text("blank_piece_weight")),
      dieCode: text("die_code"),
      processesRequired: form.getAll("processes_required").map(String),
      remarks: text("remarks"),
      components: componentUids.map((uid, index) => ({
        uid,
        quantity: quantities[index]!,
      })),
    })
    uid = saved.uid
  } catch (error) {
    if (error instanceof PortfolioEntryError) return { error: error.message }
    throw error
  } finally {
    await repository.close()
  }
  revalidatePath("/commercial/products")
  revalidatePath("/masters/products")
  if (masterData) redirect("/masters/products?masterView=masterTables")
  redirect(`/commercial/products/${encodeURIComponent(uid)}`)
}
