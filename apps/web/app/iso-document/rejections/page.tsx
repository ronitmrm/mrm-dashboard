import { ShieldCheck } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { PageHeader, ActionToolbar } from "@/components/ui/golden-patterns"
import { RejectionRegister } from "@/components/rejection-register"
import {
  withRejections,
  rejectionDate,
  rejectionUnit,
} from "@/lib/rejections-server"
import { productionFloors } from "@workspace/db/production-floors"
import { StandardState } from "@workspace/ui/components/standard-state"

export default async function RejectionRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; unit?: string }>
}) {
  const params = await searchParams
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date())
  const from = rejectionDate(params.from, `${today.slice(0, 7)}-01`)
  const to = rejectionDate(params.to, today)
  const unit = rejectionUnit(params.unit)
  const rows = await withRejections(
    "register",
    ({ repository, organizationId }) =>
      from <= to
        ? repository.list(organizationId, { from, to, unit })
        : Promise.resolve([])
  )
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title="Rejection Register"
        icon={ShieldCheck}
        description="Individual production and Quality Control rejection entries across all units."
      />
      <form method="get">
        <ActionToolbar>
          <div className="grid gap-2">
            <Label htmlFor="rejection-from">From date</Label>
            <Input
              id="rejection-from"
              name="from"
              type="date"
              required
              defaultValue={from}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rejection-to">To date</Label>
            <Input
              id="rejection-to"
              name="to"
              type="date"
              required
              defaultValue={to}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rejection-unit">Unit</Label>
            <NativeSelect id="rejection-unit" name="unit" defaultValue={unit}>
              <NativeSelectOption value="">All units</NativeSelectOption>
              {productionFloors.map((floor) => (
                <NativeSelectOption key={floor.code} value={floor.code}>
                  {floor.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit">Apply Filters</Button>
        </ActionToolbar>
      </form>
      {from > to ? (
        <StandardState
          variant="error"
          title="Check date range"
          description="From date must be on or before To date."
        />
      ) : (
        <RejectionRegister key={`${from}:${to}:${unit}`} rows={rows} />
      )}
    </div>
  )
}
