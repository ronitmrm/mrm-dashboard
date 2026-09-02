import { Camera, CheckCircle2, Play, RotateCcw, XCircle } from "lucide-react"

import type { MaintenanceRequestRow } from "@workspace/db"
import type { MaintenanceCategory } from "@workspace/db/maintenance-request-domain"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { MetricSummary } from "@/components/ui/golden-patterns"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  closeMaintenanceRequestAction,
  reviewMaintenanceRequestAction,
  updateMaintenanceTradeStatusAction,
} from "@/app/maintenance/actions"

function dateTime(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value))
}

function PriorityBadge({ value }: { value: string }) {
  return (
    <Badge variant={value === "Urgent" ? "destructive" : "secondary"}>
      {value}
    </Badge>
  )
}

export function MaintenanceRequestTable({
  managerReview = false,
  rows,
  trade,
}: {
  managerReview?: boolean
  rows: MaintenanceRequestRow[]
  trade?: MaintenanceCategory
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <MetricSummary
        scope="Requests in this worklist · before table filters"
        items={[
          { label: "Requests", value: rows.length, tone: "information" },
          {
            label: "Urgent",
            value: rows.filter(
              (row) => (row.finalPriority ?? row.requestedPriority) === "Urgent"
            ).length,
            description: "Urgent priority in this worklist",
            tone: "warning"
          },
          {
            label: "In Progress",
            value: rows.filter((row) => row.status === "In Progress").length,
            tone: "brand"
          }
        ]}
      />
    <div className="overflow-x-auto rounded-lg border">
 <OperationalTable>
        <TableHeader>
          <TableRow>
            <TableHead>Request</TableHead>
            <TableHead>Requester / Department</TableHead>
            <TableHead>Location / Problem</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Status / Assignee</TableHead>
            <TableHead>Photos</TableHead>
            {managerReview || trade ? <TableHead>Action</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const priority = row.finalPriority ?? row.requestedPriority
            return (
              <TableRow
                className={
                  priority === "Urgent"
                    ? "bg-[var(--color-error-bg)]/55 hover:bg-[var(--color-error-bg)]/75"
                    : undefined
                }
                key={row.id}
              >
                <TableCell className="font-medium">
                  {row.requestNumber}
                </TableCell>
                <TableCell>
                  <div>{row.requesterName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.department}
                  </div>
                </TableCell>
                <TableCell className="max-w-80">
                  <div className="font-medium">{row.location}</div>
                  <div className="line-clamp-3 text-xs text-muted-foreground">
                    {row.problemDescription}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{row.finalCategory ?? row.suggestedCategory}</div>
                  {!row.finalCategory ? (
                    <div className="text-xs text-muted-foreground">
                      Suggested
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <PriorityBadge value={priority} />
                  {row.finalPriority &&
                  row.finalPriority !== row.requestedPriority ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Requested {row.requestedPriority}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>{dateTime(row.submittedAt)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.status}</Badge>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.assigneeName ?? "Unassigned"}
                  </div>
                </TableCell>
                <TableCell>
                  {row.photos.length ? (
                    <div className="flex flex-wrap gap-1">
                      {row.photos.map((photo, index) => (
                        <Button
                          asChild
                          key={photo.url}
                          size="sm"
                          variant="ghost"
                        >
                          <a href={photo.url} rel="noreferrer" target="_blank">
                            <Camera aria-hidden="true" className="size-4" />
                            {index + 1}
                          </a>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                {managerReview ? (
                  <TableCell className="min-w-80">
                    {row.status === "Pending Approval" ? (
                      <form
                        action={reviewMaintenanceRequestAction}
                        className="grid gap-2"
                      >
                        <input name="request_id" type="hidden" value={row.id} />
                        <div className="grid grid-cols-2 gap-2">
                          <NativeSelect
                            defaultValue={row.suggestedCategory}
                            name="final_category"
                          >
                            <NativeSelectOption value="Electrical">
                              Electrical
                            </NativeSelectOption>
                            <NativeSelectOption value="Plumbing">
                              Plumbing
                            </NativeSelectOption>
                            <NativeSelectOption value="Mechanical">
                              Mechanical
                            </NativeSelectOption>
                          </NativeSelect>
                          <NativeSelect
                            defaultValue={row.requestedPriority}
                            name="final_priority"
                          >
                            <NativeSelectOption value="Urgent">
                              Urgent
                            </NativeSelectOption>
                            <NativeSelectOption value="Regular">
                              Regular
                            </NativeSelectOption>
                          </NativeSelect>
                        </div>
                        <Input name="manager_note" placeholder="Manager note" />
                        <div className="flex flex-wrap gap-2">
                          <Button name="action" size="sm" value="approve">
                            <CheckCircle2
                              aria-hidden="true"
                              className="size-4"
                            />
                            Approve
                          </Button>
                          <Button
                            name="action"
                            size="sm"
                            value="return"
                            variant="outline"
                          >
                            <RotateCcw aria-hidden="true" className="size-4" />
                            Return
                          </Button>
                          <Button
                            name="action"
                            size="sm"
                            value="reject"
                            variant="destructive"
                          >
                            <XCircle aria-hidden="true" className="size-4" />
                            Reject
                          </Button>
                        </div>
                      </form>
                    ) : row.status === "Completed" ? (
                      <form action={closeMaintenanceRequestAction}>
                        <input name="request_id" type="hidden" value={row.id} />
                        <Button size="sm" variant="outline">
                          Close
                        </Button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                ) : trade ? (
                  <TableCell>
                    {row.status === "Approved" ||
                    row.status === "In Progress" ? (
                      <form action={updateMaintenanceTradeStatusAction}>
                        <input name="request_id" type="hidden" value={row.id} />
                        <input name="trade" type="hidden" value={trade} />
                        <Button
                          name="action"
                          size="sm"
                          value={
                            row.status === "Approved" ? "start" : "complete"
                          }
                        >
                          {row.status === "Approved" ? (
                            <Play aria-hidden="true" className="size-4" />
                          ) : (
                            <CheckCircle2
                              aria-hidden="true"
                              className="size-4"
                            />
                          )}
                          {row.status === "Approved" ? "Start" : "Complete"}
                        </Button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
          {!rows.length ? (
            <TableRow>
              <TableCell
                className="h-28 text-center text-muted-foreground"
                colSpan={managerReview || trade ? 9 : 8}
              >
                No Maintenance requests in this view.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
 </OperationalTable>
    </div>
    </div>
  )
}
