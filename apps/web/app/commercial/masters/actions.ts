"use server"

import {
  createCommercialMasterRepository,
  createCustomerRepository,
  type CommercialTermType,
  type WebsiteFieldType,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as XLSX from "xlsx"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { parseMastersWorkbook } from "./workbook"

const mastersPath = "/commercial/masters"

function required(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim()
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`)
  return value
}

function optional(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() || null
}

function numeric(formData: FormData, key: string) {
  const value = Number(formData.get(key))
  return Number.isFinite(value) ? value : 0
}

function active(formData: FormData) {
  return formData.get("active")?.toString() !== "false"
}

async function withMasters<T>(
  operation: (
    repository: ReturnType<typeof createCommercialMasterRepository>,
    actorUserId: string,
    organizationId: string
  ) => Promise<T>
) {
  const session = await requireCapability("pricing.masters.write", mastersPath)
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialMasterRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    return await operation(repository, session.user.id, organizationId)
  } finally {
    await repository.close()
    await customers.close()
  }
}

export async function upsertMasterAction(formData: FormData) {
  const kind = required(formData, "kind")
  await withMasters(async (repository, actorUserId, organizationId) => {
    const context = { actorUserId, organizationId }
    switch (kind) {
      case "category":
        return repository.upsertNamed({
          ...context,
          code: optional(formData, "code"),
          kind,
          name: required(formData, "name"),
        })
      case "subcategory":
        return repository.upsertSubcategory({
          ...context,
          category: required(formData, "category"),
          combinationCode: optional(formData, "combination_code"),
          name: required(formData, "name"),
        })
      case "machineType":
      case "materialGrade":
      case "process":
      case "rodType":
        return repository.upsertNamed({
          ...context,
          kind,
          name: required(formData, "name"),
        })
      case "application":
      case "certification":
        return repository.upsertNamed({
          ...context,
          kind,
          name: required(formData, "name"),
          sortOrder: numeric(formData, "sort_order"),
        })
      case "websiteField":
        return repository.upsertNamed({
          ...context,
          fieldType: required(formData, "field_type") as WebsiteFieldType,
          kind,
          name: required(formData, "name"),
          sortOrder: numeric(formData, "sort_order"),
        })
      case "materialRate":
        return repository.upsertMaterialRate({
          ...context,
          active: active(formData),
          alloyPremium: numeric(formData, "alloy_premium"),
          extrusionCost: numeric(formData, "ext_cost"),
          grade: required(formData, "grade"),
          rodType: required(formData, "rod_type"),
        })
      case "shippingTerm":
        return repository.upsertShippingTerm({
          ...context,
          active: active(formData),
          name: required(formData, "name"),
          shippingCost: numeric(formData, "shipping_cost"),
        })
      case "packagingOption":
        return repository.upsertPackagingOption({
          ...context,
          active: active(formData),
          name: required(formData, "name"),
          packingCost: numeric(formData, "packing_cost"),
        })
      case "commercialTerm":
        return repository.upsertCommercialTerm({
          ...context,
          active: active(formData),
          name: required(formData, "name"),
          termType: required(formData, "term_type") as CommercialTermType,
        })
      case "quoteTerm":
        return repository.upsertQuoteTerm({
          ...context,
          active: active(formData),
          label: required(formData, "label"),
          sortOrder: numeric(formData, "sort_order"),
          termKey: required(formData, "term_key"),
          value: required(formData, "value"),
        })
      default:
        throw new Error("Unknown commercial master.")
    }
  })
  revalidatePath(mastersPath)
}

export async function setMasterActiveAction(formData: FormData) {
  const [kind, id] = required(formData, "target").split(":")
  if (!kind || !id) throw new Error("Commercial master target is invalid.")
  await withMasters((repository, actorUserId, organizationId) =>
    repository.setActive({
      active: formData.get("state")?.toString() === "active",
      actorUserId,
      id,
      kind: kind as
        | "commercialTerm"
        | "materialRate"
        | "packagingOption"
        | "quoteTerm"
        | "shippingTerm",
      organizationId,
    })
  )
  revalidatePath(mastersPath)
}

export async function importMastersWorkbookAction(formData: FormData) {
  const file = formData.get("masters_file")
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${mastersPath}?error=Masters%20workbook%20is%20required`)
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    redirect(
      `${mastersPath}?error=Only%20XLSX%20or%20XLS%20files%20are%20accepted`
    )
  }

  let outcome: string
  try {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
      type: "buffer",
    })
    const result = await withMasters(
      (repository, actorUserId, organizationId) =>
        repository.importSnapshot({
          actorUserId,
          organizationId,
          snapshot: parseMastersWorkbook(workbook),
        })
    )
    outcome = `Imported ${result.created} new and updated ${result.updated} master rows`
  } catch (error) {
    outcome =
      error instanceof Error ? error.message : "Masters workbook import failed"
    redirect(`${mastersPath}?error=${encodeURIComponent(outcome)}`)
  }

  revalidatePath(mastersPath)
  redirect(`${mastersPath}?success=${encodeURIComponent(outcome)}`)
}
