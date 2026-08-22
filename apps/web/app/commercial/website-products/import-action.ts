"use server"

import {
  createCommercialReportingRepository,
  createCustomerRepository,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import { externalMasterViewHref } from "@/lib/external-master-workspace"
import { csvValue, readMasterCsv } from "@/lib/master-data-csv"

const websiteProductsPath = "/commercial/website-products"

export async function importWebsiteProductsCsvAction(formData: FormData) {
  const session = await requireCapability(
    commercialTaskCapabilities.updateWebsiteProduct,
    websiteProductsPath
  )
  const rows = await readMasterCsv(formData.get("master_csv_file"))
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    for (const [index, row] of rows.entries()) {
      const uid = csvValue(row, "uid")
      if (!uid) throw new Error(`CSV row ${index + 2}: UID is required.`)
      const result = await repository.listWebsiteProducts(
        { organizationId, query: uid },
        2
      )
      const product = result.rows.find(
        (candidate) => candidate.uid.toLowerCase() === uid.toLowerCase()
      )
      if (!product) {
        throw new Error(`CSV row ${index + 2}: UID ${uid} was not found.`)
      }
      await repository.updateWebsiteProduct({
        actorUserId: session.user.id,
        additionalNotes:
          csvValue(row, "additional_notes", "additiol_notes") || null,
        applications: csvValue(row, "applications"),
        category: csvValue(row, "category"),
        certifications: csvValue(row, "certifications") || null,
        connections: csvValue(row, "connections") || null,
        description: csvValue(row, "description") || null,
        dimensions: csvValue(row, "dimensions") || null,
        drawingCategory: csvValue(row, "drawing_category") || null,
        entryCreatedAt: csvValue(row, "created_at", "entry_created_at") || null,
        finishPlating: csvValue(row, "finish_plating") || null,
        grade: csvValue(row, "grade"),
        isActive:
          csvValue(row, "website_active", "is_active").toUpperCase() !==
          "FALSE",
        material: csvValue(row, "material"),
        organizationId,
        pressure: csvValue(row, "pressure") || null,
        profileId: product.profileId,
        remark: csvValue(row, "remark") || null,
        sealant: csvValue(row, "sealant") || null,
        size: csvValue(row, "size"),
        subCategory: csvValue(row, "sub_category", "subcategory"),
        temperature: csvValue(row, "temperature"),
        threadSize1: csvValue(row, "thread_size_1") || null,
        threadSize2: csvValue(row, "thread_size_2") || null,
        threadSize3: csvValue(row, "thread_size_3") || null,
        threadSize4: csvValue(row, "thread_size_4") || null,
        websiteCategory: csvValue(row, "website_category") || null,
        websiteSubCategory: csvValue(row, "website_sub_category") || null,
      })
    }
  } finally {
    await repository.close()
    await customers.close()
  }
  revalidatePath(websiteProductsPath)
  redirect(externalMasterViewHref(websiteProductsPath, "dataEntry"))
}
