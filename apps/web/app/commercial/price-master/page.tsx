import Link from "next/link"
import {
  createCommercialMasterRepository,
  createCustomerRepository,
  priceMasterProcesses,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { masterCapability } from "@/lib/auth/master-capabilities"
import {
  requireCapability,
  listGrantedCapabilities,
} from "@/lib/auth/require-capability"
import { savePriceMasterAction } from "./actions"
import { PageHeader } from "@/components/ui/golden-patterns"

export const dynamic = "force-dynamic"
export default async function PriceMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const session = await requireCapability(
    masterCapability("priceMaster", "read"),
    "/commercial/price-master"
  )
  const saveCapability = masterCapability("priceMaster", "save")
  const canSave = (
    await listGrantedCapabilities(session.user.id, [saveCapability])
  ).includes(saveCapability)
  const connectionString = readAuthEnvironment().connectionString
  const repository = createCommercialMasterRepository({ connectionString })
  const customers = createCustomerRepository({ connectionString })
  const { prices, grades } = await (async () => {
    try {
      const organizationId = await customers.organizationIdForCode("MRMPL")
      return {
        prices: await repository.priceMaster(organizationId),
        grades: await repository.listEditableRows({
          organizationId,
          kind: "commercial_material_grade",
        }),
      }
    } finally {
      await repository.close()
      await customers.close()
    }
  })()
  return (
    <div className="grid gap-4">
      <Button asChild variant="ghost" className="w-fit">
        <Link href="/masters?unit=universal">Back to Master Selection</Link>
      </Button>
      <PageHeader
        title="Price Master"
        description="Defaults for new costing. Product Costing can override process prices. Blank means no default; zero is a price."
      />
      {(await searchParams).saved ? (
        <p role="status">Price Master saved.</p>
      ) : null}
      <form action={savePriceMasterAction} className="grid gap-6">
        <fieldset disabled={!canSave} className="grid gap-6">
          <div className="rounded-md border">
            <OperationalTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Grade</TableHead>
                  <TableHead>Market Rate (INR/kg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.map((grade) => (
                  <TableRow key={grade.id}>
                    <TableCell>{grade.label}</TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${grade.label} market rate`}
                        name={`market:${grade.id}`}
                        type="number"
                        min="0"
                        step="any"
                        defaultValue={
                          prices.marketRates.find(
                            (rate) => rate.gradeId === grade.id
                          )?.rate ?? ""
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {priceMasterProcesses.map(({ key, label, perPiece }) => (
              <Field key={key}>
                <FieldLabel htmlFor={key}>
                  {label} ({perPiece ? "INR/piece × pieces/kg" : "INR/kg"})
                </FieldLabel>
                <Input
                  id={key}
                  name={key}
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={prices.processes[key] ?? ""}
                />
              </Field>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {["USD", "EUR", "GBP"].map((currency) => (
              <Field key={currency}>
                <FieldLabel htmlFor={`exchange:${currency}`}>
                  INR per {currency}
                </FieldLabel>
                <Input
                  id={`exchange:${currency}`}
                  name={`exchange:${currency}`}
                  type="number"
                  min="0.000001"
                  step="any"
                  defaultValue={prices.exchangeRates[currency] ?? ""}
                />
              </Field>
            ))}
          </div>
          {canSave ? (
            <Button type="submit" className="w-fit">
              Save Price Master
            </Button>
          ) : null}
        </fieldset>
      </form>
    </div>
  )
}
