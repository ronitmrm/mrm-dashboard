import type { ComponentProps } from "react"

import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { Button } from "@workspace/ui/components/button"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { StoreTransferConfirmation } from "./store-transfer-confirmation"

type Confirmation = ComponentProps<typeof StoreTransferConfirmation>

export function StoreTransferRequests({
  action,
  groups,
  reviewRequestNumber,
  storageLocations,
}: {
  action: Confirmation["action"]
  reviewRequestNumber?: string
  groups: Array<{
    choices: Confirmation["choices"]
    department: string
    destinationStoreCode: string
    destinationStoreName: string
    lines: Confirmation["lines"]
    requestedAt: string
    requestedBy: string
    requestNumber: string
  }>
  storageLocations: Confirmation["storageLocations"]
}) {
  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Store Requests · Review Assigned Units</CardTitle>
        <CardDescription>
          Unit IDs are already assigned. Open a request to check or change them
          and confirm its transfer.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <OperationalTable
          filterStorageKey="store-assigned-request-queue"
          containerClassName="max-h-[50dvh] rounded-lg border"
        >
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Receiving Store</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>Assignment</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const assigned = group.lines.filter((line) =>
                group.choices.some(
                  (unit) =>
                    unit.assetCode === line.requestedUnitCode &&
                    unit.itemTypeId === line.itemTypeId
                )
              ).length
              const items = new Map<
                string,
                { name: string; quantity: number }
              >()
              for (const line of group.lines) {
                items.set(line.typeCode, {
                  name: line.assetName,
                  quantity: (items.get(line.typeCode)?.quantity ?? 0) + 1,
                })
              }
              return (
                <TableRow
                  id={`assigned-request-${group.requestNumber}`}
                  key={group.requestNumber}
                >
                  <TableCell className="whitespace-nowrap">
                    <span className="block font-medium">
                      {group.requestNumber}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {group.requestedAt}
                    </span>
                  </TableCell>
                  <TableCell>{group.destinationStoreName}</TableCell>
                  <TableCell>
                    <span className="block">{group.requestedBy}</span>
                    <span className="block text-xs text-muted-foreground">
                      {group.department}
                    </span>
                  </TableCell>
                  <TableCell>
                    {[...items].map(([code, item]) => (
                      <span className="block" key={code}>
                        {code} · {item.name} × {item.quantity}
                      </span>
                    ))}
                  </TableCell>
                  <TableCell>{group.lines.length}</TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={
                        assigned === group.lines.length ? "positive" : "warning"
                      }
                      value={
                        assigned === group.lines.length
                          ? "Ready to review"
                          : "Needs replacement"
                      }
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {assigned} of {group.lines.length} assigned units
                      available
                    </span>
                  </TableCell>
                  <TableCell>
                    <Dialog
                      defaultOpen={reviewRequestNumber === group.requestNumber}
                      key={`${group.requestNumber}-${reviewRequestNumber ?? ""}`}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          aria-label={`Review units for ${group.requestNumber}`}
                        >
                          Review Units
                        </Button>
                      </DialogTrigger>
                      <StandardDialogContent
                        className="max-w-6xl"
                        title={`Review ${group.requestNumber}`}
                        description={`${group.destinationStoreName} · ${group.lines.length} ${group.lines.length === 1 ? "unit" : "units"} · requested by ${group.requestedBy}`}
                      >
                        <StoreTransferConfirmation
                          action={action}
                          choices={group.choices}
                          destinationStoreCode={group.destinationStoreCode}
                          destinationStoreName={group.destinationStoreName}
                          lines={group.lines}
                          storageLocations={storageLocations}
                        />
                      </StandardDialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
  )
}
