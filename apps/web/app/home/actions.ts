"use server"

import {
  createUserDashboardRepository,
  withRepositoryTransaction,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import { isCncDashboardCard } from "@/lib/cnc-dashboard"
import {
  addMetricToDashboard,
  availableDashboardMetricIds,
  resolveDashboardAnalyticsConfiguration,
} from "@/lib/dashboard-analytics"
import {
  availablePersonalDashboardWidgets,
  resolvePersonalDashboardSelection,
} from "@/lib/personal-dashboard"

export async function savePersonalDashboard(formData: FormData) {
  const session = await requireAuthenticatedSession("/home")
  const access = await getUnifiedNavigationAccess(session.user.id)
  const available = availablePersonalDashboardWidgets(access)
  let requestedIds: string[] = []
  let requestedAnalytics: unknown = null

  try {
    const parsed: unknown = JSON.parse(
      String(formData.get("widgetIds") ?? "[]")
    )
    if (Array.isArray(parsed)) {
      requestedIds = parsed.filter(
        (value): value is string => typeof value === "string"
      )
    }
    requestedAnalytics = JSON.parse(String(formData.get("analytics") ?? "null"))
  } catch {
    throw new Error("The dashboard selection could not be read")
  }

  const selectedIds = resolvePersonalDashboardSelection(
    requestedIds,
    available
  ).map(({ id }) => id)
  const availableMetricIds = availableDashboardMetricIds(
    available.map(({ id }) => id)
  )
  const analytics = resolveDashboardAnalyticsConfiguration(
    requestedAnalytics,
    availableMetricIds
  )
  const repository = createUserDashboardRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    await Promise.all([
      repository.save(session.user.id, selectedIds),
      repository.saveAnalytics(session.user.id, analytics),
    ])
  } finally {
    await repository.close()
  }

  revalidatePath("/home")
  const query = new URLSearchParams({ saved: "1" })
  for (const key of ["from", "to", "shift"]) {
    const value = formData.get(key)
    if (typeof value === "string" && value) query.set(key, value)
  }
  redirect(`/home?${query}`)
}

export async function pinDashboardMetric(
  _previous: { message: string; status: string },
  formData: FormData
) {
  const session = await requireAuthenticatedSession("/home")
  const access = await getUnifiedNavigationAccess(session.user.id)
  const availableWidgets = availablePersonalDashboardWidgets(access)
  const availableMetricIds = availableDashboardMetricIds(
    availableWidgets.map(({ id }) => id)
  )
  const metricId = String(formData.get("metricId") ?? "")
  const availableMetricId = availableMetricIds.find((id) => id === metricId)
  if (!availableMetricId) {
    return {
      message: "This metric is not available for your account",
      status: "error",
    }
  }

  const repository = createUserDashboardRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const saved = await repository.loadAnalytics(session.user.id)
    const current = resolveDashboardAnalyticsConfiguration(
      saved,
      availableMetricIds
    )
    const next = addMetricToDashboard(
      current,
      availableMetricId,
      availableMetricIds
    )
    const alreadyPinned = next.widgets.length === current.widgets.length
    if (!alreadyPinned) {
      await repository.saveAnalytics(session.user.id, next)
      revalidatePath("/home")
    }
    return {
      message: alreadyPinned
        ? "Already on My Dashboard"
        : "Added to My Dashboard",
      status: alreadyPinned ? "already-pinned" : "pinned",
    }
  } finally {
    await repository.close()
  }
}

export async function pinCncDashboardCard(
  _previous: { message: string; status: string },
  formData: FormData
) {
  const session = await requireAuthenticatedSession("/home")
  const available = availablePersonalDashboardWidgets(
    await getUnifiedNavigationAccess(session.user.id)
  )
  const id = String(formData.get("cardId") ?? "")
  if (
    !isCncDashboardCard(id) ||
    !available.some((widget) => widget.id === id)
  ) {
    return {
      message: "This card is not available for your account",
      status: "error",
    }
  }
  const options = { connectionString: readAuthEnvironment().connectionString }
  const state = await withRepositoryTransaction(options, async () => {
    const repository = createUserDashboardRepository(options)
    const saved = await repository.load(session.user.id, { forUpdate: true })
    const selected = resolvePersonalDashboardSelection(saved, available).map(
      ({ id }) => id
    )
    if (selected.includes(id))
      return { message: "Already on My Dashboard", status: "already-pinned" }
    if (selected.length >= 24)
      return {
        message:
          "Remove a dashboard card first. Your dashboard can hold 24 cards.",
        status: "error",
      }
    await repository.save(session.user.id, [...selected, id])
    return { message: "Added to My Dashboard", status: "pinned" }
  })
  if (state.status === "pinned") {
    revalidatePath("/home")
    revalidatePath("/home/[department]", "page")
  }
  return state
}
