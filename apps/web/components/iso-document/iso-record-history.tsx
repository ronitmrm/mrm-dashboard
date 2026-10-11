import type { ManagementReviewHistory } from "@workspace/db"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const hiddenFields = new Set([
  "id",
  "organization_id",
  "organizationId",
  "created_by_user_id",
  "source",
  "source_payload",
  "source_key",
  "sourceKey",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
])
function label(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase())
}
function retainedValue(value: unknown): string {
  if (value == null || value === "") return "Not recorded"
  if (Array.isArray(value)) return value.map(retainedValue).join("\n\n")
  if (typeof value === "object")
    return Object.entries(value)
      .filter(
        ([key]) =>
          !hiddenFields.has(key) && !key.endsWith("Id") && !key.endsWith("_id")
      )
      .map(([key, entry]) => `${label(key)}: ${retainedValue(entry)}`)
      .join("\n")
  return String(value)
}

export function IsoRecordHistoryTable({
  history,
  filterStorageKey,
}: {
  history: ManagementReviewHistory[]
  filterStorageKey: string
}) {
  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Complete history</CardTitle>
        <CardDescription>
          Every saved change and decision, newest first, with its before and
          after records.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OperationalTable
          key={history[0]?.id}
          excelFilters
          filterStorageKey={filterStorageKey}
          containerClassName="max-h-[55vh] rounded-xl border"
          state={history.length ? "ready" : "empty"}
          stateTitle="No history"
          stateDescription="Saved updates will appear here."
        >
          <TableHeader>
            <TableRow>
              <TableHead data-filterable="true">When (India)</TableHead>
              <TableHead data-filterable="true">Action</TableHead>
              <TableHead data-filterable="true">By</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead>Retained records</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  {new Date(event.occurredAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </TableCell>
                <TableCell>
                  {event.eventType.replace(/^[^.]+\./, "").replaceAll("_", " ")}
                </TableCell>
                <TableCell>{event.actorName}</TableCell>
                <TableCell className="max-w-96 min-w-56 whitespace-pre-wrap">
                  {event.remarks}
                </TableCell>
                <TableCell className="min-w-56">
                  <details>
                    <summary className="cursor-pointer">
                      View changes and saved record
                    </summary>
                    <div className="grid max-h-96 max-w-2xl gap-3 overflow-auto pt-2">
                      {[
                        ...new Set([
                          ...Object.keys(event.before ?? {}),
                          ...Object.keys(event.after ?? {}),
                        ]),
                      ]
                        .filter(
                          (key) =>
                            !hiddenFields.has(key) &&
                            !key.endsWith("Id") &&
                            !key.endsWith("_id") &&
                            JSON.stringify(event.before?.[key]) !==
                              JSON.stringify(event.after?.[key])
                        )
                        .map((key) => (
                          <div key={key} className="grid gap-1 border-b pb-2">
                            <p className="text-sm font-medium">{label(key)}</p>
                            <p className="text-xs break-words whitespace-pre-wrap">
                              Before: {retainedValue(event.before?.[key])}
                            </p>
                            <p className="text-xs break-words whitespace-pre-wrap">
                              After: {retainedValue(event.after?.[key])}
                            </p>
                          </div>
                        ))}
                    </div>
                  </details>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
  )
}
