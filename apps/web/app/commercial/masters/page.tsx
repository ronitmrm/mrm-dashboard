import { createCatalogMasterRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

const definitions = [
  { kind: "materialGrade", label: "Material grades" },
  { kind: "rodType", label: "Rod types" },
  { kind: "machineType", label: "Machine types" },
] as const

export default async function MastersPage() {
  await requireCapability("pricing.masters.read", "/commercial/masters")
  const connectionString = readAuthEnvironment().connectionString
  const repositories = definitions.map((definition) => ({
    ...definition,
    repository: createCatalogMasterRepository({
      connectionString,
      kind: definition.kind,
    }),
  }))

  const groups = await Promise.all(
    repositories.map(async (group) => ({
      ...group,
      rows: await group.repository.listForOrganization("MRMPL"),
    }))
  ).finally(() =>
    Promise.all(repositories.map((group) => group.repository.close()))
  )

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {groups.map((group) => (
        <Card key={group.kind}>
          <CardHeader>
            <CardTitle>{group.label}</CardTitle>
            <CardDescription>
              Canonical values used by product costing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-3xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.length ? (
                    group.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {row.sourceTable}:{row.sourceId}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-24 text-center text-muted-foreground"
                        colSpan={2}
                      >
                        No values loaded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
