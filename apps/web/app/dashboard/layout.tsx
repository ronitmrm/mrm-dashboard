import type { ReactNode } from "react"

import { requireCapability } from "@/lib/auth/require-capability"

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  await requireCapability("operations.dashboard.read", "/dashboard")
  return children
}
