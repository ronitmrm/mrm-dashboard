import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { CardContent, CardDescription, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { StandardState } from "@workspace/ui/components/standard-state"

import { PageHeader } from "@/components/ui/golden-patterns"
import { requireCapability } from "@/lib/auth/require-capability"
import { storeAssetCalibrationHref } from "@/lib/store-asset-workspace"

export default async function CalibrationDispatchPage({ searchParams }: {
  searchParams: Promise<{ unitId?: string | string[] }>
}) {
  await requireCapability("store.asset_history.read", "/store/calibration-dispatch")
  const { unitId } = await searchParams
  const units = [...new Set((Array.isArray(unitId) ? unitId : unitId ? [unitId] : [])
    .filter((value) => /^[A-Z0-9-]{1,50}$/i.test(value)))].slice(0, 100)

  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title="Send for Calibration" description="Complete the Store supplier calibration flow for each selected Unit ID." />
    <SectionCard width="standard">
      <CardHeader>
        <CardTitle>Selected Unit IDs</CardTitle>
        <CardDescription>Open each Unit ID to record its Supplier offer and dispatch. Each visit has its own service order and certificate.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {units.map((unit) => <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0" key={unit}>
          <span className="font-medium">{unit}</span>
          <Button asChild size="sm"><Link href={storeAssetCalibrationHref(unit)}>Open Store Calibration</Link></Button>
        </div>)}
        {!units.length ? <StandardState title="No Unit IDs selected" description="Select one or more rows in the Calibration Plan." /> : null}
      </CardContent>
    </SectionCard>
  </div>
}
