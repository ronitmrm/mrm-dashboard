"use server"

import { createUserDashboardRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  availablePersonalDashboardWidgets,
  resolvePersonalDashboardSelection,
} from "@/lib/personal-dashboard"

export async function savePersonalDashboard(formData: FormData) {
  const session = await requireAuthenticatedSession("/home")
  const access = await getUnifiedNavigationAccess(session.user.id)
  const available = availablePersonalDashboardWidgets(access)
  let requestedIds: string[] = []

  try {
    const parsed: unknown = JSON.parse(String(formData.get("widgetIds") ?? "[]"))
    if (Array.isArray(parsed)) {
      requestedIds = parsed.filter(
        (value): value is string => typeof value === "string"
      )
    }
  } catch {
    throw new Error("The dashboard selection could not be read")
  }

  const selectedIds = resolvePersonalDashboardSelection(
    requestedIds,
    available
  ).map(({ id }) => id)
  const repository = createUserDashboardRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    await repository.save(session.user.id, selectedIds)
  } finally {
    await repository.close()
  }

  revalidatePath("/home")
  redirect("/home?saved=1")
}
