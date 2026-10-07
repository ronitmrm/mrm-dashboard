import { redirect } from "next/navigation"

import { requireCapability } from "@/lib/auth/require-capability"

export default async function CalibrationDispatchPage({ searchParams }: {
  searchParams: Promise<{ unitId?: string | string[] }>
}) {
  await requireCapability("quality.control.calibration.read", "/quality-control/calibration")
  const { unitId } = await searchParams
  const selected = (Array.isArray(unitId) ? unitId : unitId ? [unitId] : [])
    .find((value) => /^[A-Z0-9-]{1,50}$/i.test(value))
  redirect(selected
    ? `/quality-control/calibration?show=all&unit=${encodeURIComponent(selected)}`
    : "/quality-control/calibration")
}
