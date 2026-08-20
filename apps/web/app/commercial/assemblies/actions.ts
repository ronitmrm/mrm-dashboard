"use server"

import { createProductRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const assembliesPath = "/commercial/assemblies"

function text(formData: FormData, name: string) {
  const value = formData.get(name)
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

export async function addBomLineAction(formData: FormData) {
  const session = await requireCapability(
    "pricing.assemblies.write",
    assembliesPath
  )
  const quantity = Number(text(formData, "quantity"))
  const repository = createProductRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    await repository.addBomLine({
      actorUserId: session.user.id,
      componentItemId: text(formData, "component_item_id"),
      notes: String(formData.get("notes") ?? "").trim() || null,
      parentItemId: text(formData, "parent_item_id"),
      quantity,
    })
  } finally {
    await repository.close()
  }
  revalidatePath(assembliesPath)
  revalidatePath("/commercial/costing")
}
