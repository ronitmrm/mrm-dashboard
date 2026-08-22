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

const websiteProductsPath = "/commercial/website-products"

function value(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() ?? ""
}

function nullable(formData: FormData, key: string) {
  return value(formData, key) || null
}

function selected(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((entry) => entry.toString().trim())
    .filter(Boolean)
    .join("; ")
}

export async function updateWebsiteProductAction(formData: FormData) {
  const session = await requireCapability(
    commercialTaskCapabilities.updateWebsiteProduct,
    websiteProductsPath
  )
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  try {
    await repository.updateWebsiteProduct({
      actorUserId: session.user.id,
      additionalNotes: nullable(formData, "additional_notes"),
      applications: selected(formData, "applications"),
      category: value(formData, "category"),
      certifications: selected(formData, "certifications"),
      connections: nullable(formData, "connections"),
      description: nullable(formData, "description"),
      dimensions: nullable(formData, "dimensions"),
      drawingCategory: nullable(formData, "drawing_category"),
      entryCreatedAt: nullable(formData, "entry_created_at"),
      finishPlating: nullable(formData, "finish_plating"),
      grade: value(formData, "grade"),
      isActive: value(formData, "is_active").toUpperCase() !== "FALSE",
      material: value(formData, "material"),
      organizationId: await customers.organizationIdForCode("MRMPL"),
      pressure: nullable(formData, "pressure"),
      profileId: value(formData, "profile_id"),
      remark: nullable(formData, "remark"),
      sealant: nullable(formData, "sealant"),
      size: value(formData, "size"),
      subCategory: value(formData, "sub_category"),
      temperature: value(formData, "temperature"),
      threadSize1: nullable(formData, "thread_size_1"),
      threadSize2: nullable(formData, "thread_size_2"),
      threadSize3: nullable(formData, "thread_size_3"),
      threadSize4: nullable(formData, "thread_size_4"),
      websiteCategory: nullable(formData, "website_category"),
      websiteSubCategory: nullable(formData, "website_sub_category"),
    })
  } finally {
    await repository.close()
    await customers.close()
  }
  revalidatePath(websiteProductsPath)
  redirect(externalMasterViewHref(websiteProductsPath, "masterTables"))
}
