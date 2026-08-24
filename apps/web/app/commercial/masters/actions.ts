"use server"

import {
  createCommercialMasterRepository,
  createCustomerRepository,
  createMasterDataLifecycleRepository,
  isMasterDataKind,
  type CommercialTermType,
  type WebsiteFieldType,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as XLSX from "xlsx"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import {
  commercialMasterSelection,
  commercialMasterViewHref,
  commercialMasterWorkspaceKind,
  isCustomerDefaultCommercialTerm,
} from "@/lib/commercial-master-workspace"

import { parseMastersWorkbook } from "./workbook"

const mastersPath = "/commercial/masters"
const csvSheetNameByEntryKind = {
  application: "Applications",
  category: "Categories",
  certification: "Certifications",
  commercialTerm: "Commercial Terms",
  machineType: "Machine Types",
  materialGrade: "Grades",
  materialRate: "Material Rates",
  packagingOption: "Packaging",
  process: "Processes",
  quoteTerm: "Quote PDF Terms",
  rodType: "Rod Types",
  shippingTerm: "Shipping",
  subcategory: "Sub Categories",
  websiteField: "Website Fields",
} as const

function mastersReturnPath(formData: FormData) {
  const view = formData.get("master_view")?.toString()
  return view === "dataEntry" || view === "masterTables"
    ? commercialMasterViewHref(
        view,
        commercialMasterWorkspaceKind(
          commercialMasterSelection(
            formData.get("workspace_kind")?.toString() ??
              formData.get("kind")?.toString() ??
              formData.get("master_kind")?.toString()
          )
        )
      )
    : mastersPath
}

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
  capability: string | readonly string[],
  operation: (
    repository: ReturnType<typeof createCommercialMasterRepository>,
    actorUserId: string,
    organizationId: string
  ) => Promise<T>
) {
  const session =
    typeof capability === "string"
      ? await requireCapability(capability, mastersPath)
      : await (async () => {
          const authenticatedSession = await requireAuthenticatedSession(
            mastersPath
          )
          const granted = await listGrantedCapabilities(
            authenticatedSession.user.id,
            capability
          )
          if (granted.length === 0) redirect("/unauthorized")
          return authenticatedSession
        })()
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
  const termType =
    kind === "commercialTerm" ? required(formData, "term_type") : null
  await withMasters(
    termType && isCustomerDefaultCommercialTerm(termType)
      ? [
          commercialTaskCapabilities.updateCustomerDefaultTerm,
          commercialTaskCapabilities.updateMaster,
        ]
      : commercialTaskCapabilities.updateMaster,
    async (repository, actorUserId, organizationId) => {
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
            termType: termType as CommercialTermType,
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
    }
  )
  revalidatePath(mastersPath)
}

async function commercialLifecycleAction(
  capability: string,
  formData: FormData,
  operation: (
    repository: ReturnType<typeof createMasterDataLifecycleRepository>,
    actorUserId: string,
    organizationId: string
  ) => Promise<unknown>,
  success: string
) {
  const returnPath = mastersReturnPath(formData)
  const session = await requireCapability(capability, returnPath)
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const lifecycle = createMasterDataLifecycleRepository({ connectionString })
  let outcome: { error?: string; success?: string }
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    await operation(lifecycle, session.user.id, organizationId)
    outcome = { success }
  } catch (error) {
    outcome = {
      error:
        error instanceof Error
          ? error.message
          : "Commercial master change failed.",
    }
  } finally {
    await lifecycle.close()
    await customers.close()
  }
  revalidatePath(mastersPath)
  redirect(
    `${returnPath}${returnPath.includes("?") ? "&" : "?"}${new URLSearchParams(outcome)}`
  )
}

export async function renameCommercialMasterAction(formData: FormData) {
  const kind = required(formData, "master_kind")
  if (!isMasterDataKind(kind) || !kind.startsWith("commercial_")) {
    throw new Error("Commercial master is invalid.")
  }
  await commercialLifecycleAction(
    commercialTaskCapabilities.renameMaster,
    formData,
    (repository, actorUserId, organizationId) =>
      repository.renameMaster({
        actorUserId,
        kind,
        name: required(formData, "name"),
        organizationId,
        recordId: required(formData, "master_id"),
      }),
    "Master renamed everywhere."
  )
}

export async function deleteCommercialMasterAction(formData: FormData) {
  const kind = required(formData, "master_kind")
  if (!isMasterDataKind(kind) || !kind.startsWith("commercial_")) {
    throw new Error("Commercial master is invalid.")
  }
  await commercialLifecycleAction(
    commercialTaskCapabilities.deleteMaster,
    formData,
    (repository, actorUserId, organizationId) =>
      repository.deleteMaster({
        actorUserId,
        kind,
        organizationId,
        reason: required(formData, "deletion_reason"),
        recordId: required(formData, "master_id"),
        replacementRecordId: optional(formData, "replacement_master_id"),
      }),
    "Master deleted successfully."
  )
}

export async function importMastersWorkbookAction(formData: FormData) {
  const returnPath = mastersReturnPath(formData)
  const file = formData.get("masters_file")
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `${returnPath}${returnPath.includes("?") ? "&" : "?"}error=Masters%20workbook%20is%20required`
    )
  }
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
    redirect(
      `${returnPath}${returnPath.includes("?") ? "&" : "?"}error=Only%20CSV%2C%20XLSX%20or%20XLS%20files%20are%20accepted`
    )
  }

  let outcome: string
  try {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
      type: "buffer",
    })
    if (/\.csv$/i.test(file.name)) {
      const selection = commercialMasterSelection(
        formData.get("workspace_kind")?.toString()
      )
      const source = workbook.SheetNames[0]
      const target = csvSheetNameByEntryKind[selection.entryKind]
      const sheet = source ? workbook.Sheets[source] : undefined
      if (sheet) {
        workbook.SheetNames = [target]
        workbook.Sheets = { [target]: sheet }
      }
    }
    const result = await withMasters(
      commercialTaskCapabilities.importMasters,

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
    redirect(
      `${returnPath}${returnPath.includes("?") ? "&" : "?"}error=${encodeURIComponent(outcome)}`
    )
  }

  revalidatePath(mastersPath)
  redirect(
    `${returnPath}${returnPath.includes("?") ? "&" : "?"}success=${encodeURIComponent(outcome)}`
  )
}
