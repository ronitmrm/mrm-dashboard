"use server"

import { createUserDashboardRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  addMetricToDashboard,
  availableDashboardMetricIds,
  resolveDashboardAnalyticsConfiguration,
} from "@/lib/dashboard-analytics"
import {
  availablePersonalDashboardWidgets,
  resolvePersonalDashboardSelection,
} from "@/lib/personal-dashboard"
import { isQualityChartId } from "@/lib/quality-reports"

export async function pinQualityChart(
  _previous: { message: string; status: string },
  formData: FormData
) {
  const session = await requireAuthenticatedSession("/home")
  const access = await getUnifiedNavigationAccess(session.user.id)
  const available = availablePersonalDashboardWidgets(access)
  const id = String(formData.get("chartId") ?? "")
  if (!isQualityChartId(id) || !available.some((widget) => widget.id === id))
    return {
      status: "error",
      message: "This chart is not available for your account",
    }
  const repository = createUserDashboardRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const current = resolvePersonalDashboardSelection(
      await repository.load(session.user.id),
      available
    ).map((widget) => widget.id)
    if (current.includes(id))
      return { status: "already-pinned", message: "Already on My Dashboard" }
    if (current.length >= 24)
      return {
        status: "error",
        message: "Remove a dashboard item first (24 item limit).",
      }
    await repository.save(session.user.id, [...current, id])
    revalidatePath("/home")
    return { status: "pinned", message: "Added to My Dashboard" }
  } finally {
    await repository.close()
  }
}

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
  redirect("/home?saved=1")
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
