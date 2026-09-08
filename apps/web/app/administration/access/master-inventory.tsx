import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { scopedMasters } from "@/lib/auth/master-capabilities"

export function MasterInventory() {
  const universalCount = scopedMasters.filter(
    ({ unit }) => unit === "universal"
  ).length
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Included masters — {scopedMasters.length} entries
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        {universalCount} Universal masters and 7 masters in each of the 4
        production units. Setup Checklist, Maintenance Checklist and Maintenance
        Master are shared by all units. This is the master inventory. Individual
        master permissions are not active yet; the role editor below still
        controls the existing grouped permissions.
      </p>
      <OperationalTable filterStorageKey="access-master-inventory">
        <TableHeader>
          <TableRow>
            <TableHead>Scope</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Master</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scopedMasters.map((master) => (
            <TableRow key={`${master.unit}:${master.master}`}>
              <TableCell>{master.scopeLabel}</TableCell>
              <TableCell>{master.category}</TableCell>
              <TableCell>{master.label}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </OperationalTable>
    </details>
  )
}
