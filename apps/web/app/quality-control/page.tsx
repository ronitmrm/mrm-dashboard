import { randomUUID } from "node:crypto"
import { ShieldCheck } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  PageHeader,
  FormSection,
  FormGrid,
} from "@/components/ui/golden-patterns"
import { QualityControlEntry } from "@/components/quality-control-entry"
import { withRejections, rejectionUnit } from "@/lib/rejections-server"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"
import { productionFloors } from "@workspace/db/production-floors"

export default async function QualityControlPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; part?: string; job?: string }>
}) {
  const params = await searchParams
  const filters = {
    unit: rejectionUnit(params.unit),
    part: (params.part ?? "").trim().slice(0, 100),
    job: (params.job ?? "").trim().slice(0, 100),
  }
  const { options, canWrite } = await withRejections(
    "read",
    async ({ repository, organizationId, userId }) => ({
      options: await repository.entryOptions(organizationId, filters),
      canWrite:
        (await listGrantedCapabilities(userId, ["quality.control.write"]))
          .length > 0,
    })
  )
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title="Quality Control"
        icon={ShieldCheck}
        description="Record Checking, Assembly and Quality Control rejections across all units."
      />
      <form method="get">
        <FormSection title="Find Job Card" width="standard">
          <FormGrid className="xl:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="qc-filter-unit">Unit</Label>
              <NativeSelect
                id="qc-filter-unit"
                name="unit"
                defaultValue={filters.unit}
              >
                <NativeSelectOption value="">All units</NativeSelectOption>
                {productionFloors.map((floor) => (
                  <NativeSelectOption key={floor.code} value={floor.code}>
                    {floor.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qc-filter-part">Part code</Label>
              <Input
                id="qc-filter-part"
                name="part"
                defaultValue={filters.part}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qc-filter-job">Job Card number</Label>
              <Input id="qc-filter-job" name="job" defaultValue={filters.job} />
            </div>
          </FormGrid>
          <Button className="mt-4" variant="outline" type="submit">
            Find Job Cards
          </Button>
        </FormSection>
      </form>
      {options.hasMore ? (
        <p className="text-sm text-muted-foreground">
          Showing the first 100 matching Job Cards. Narrow the unit, part code
          or Job Card search to find another.
        </p>
      ) : null}
      {canWrite ? (
        <QualityControlEntry
          key={JSON.stringify(filters)}
          {...options}
          requestId={randomUUID()}
          today={new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
          }).format(new Date())}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          You have view access. Saving requires Quality Control write access.
        </p>
      )}
    </div>
  )
}
