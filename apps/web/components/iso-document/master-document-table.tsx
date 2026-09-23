import Link from "next/link"
import type { MasterDocumentRow } from "@workspace/db"
import {
  dataFrequencyLabels,
  documentRevisionLabel,
  documentTypeLabels,
} from "@workspace/db/document-control-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

function recordLocations(row: MasterDocumentRow) {
  return row.recordLocations.map(({ label }) => label).join(", ") || "None"
}

function frequency(row: MasterDocumentRow) {
  return `${dataFrequencyLabels[row.dataFrequencyType]}${
    row.dataFrequencyIntervalDays
      ? ` · every ${row.dataFrequencyIntervalDays} days`
      : row.dataFrequencyDetail
        ? ` · ${row.dataFrequencyDetail}`
        : ""
  }`
}

function workflowLabel(state: MasterDocumentRow["workflowState"]) {
  if (state === "pending-approval") return "Pending Approval"
  if (state === "approved") return "Approved"
  if (state === "draft") return "Draft"
  return state === "released" ? "Released" : "—"
}

export function MasterDocumentTable({
  rows,
  pending = false,
}: {
  rows: MasterDocumentRow[]
  pending?: boolean
}) {
  const headers = pending
    ? [
        "Draft ID",
        "Document name",
        "Document type",
        "Department",
        "Draft revision",
        "Workflow",
        "Current release",
        "Open",
      ]
    : [
        "Document number",
        "Document name",
        "Document type",
        "Department",
        "Responsible role",
        "Record location",
        "Current revision",
        "Last revision date",
        "Document review cycle",
        "Data / record frequency",
        "Data retention",
        "Status",
        "Open",
      ]
  return (
    <OperationalTable
      filterStorageKey={
        pending
          ? "iso-document:pending-documents"
          : "iso-document:master-document-list"
      }
      containerClassName="max-h-[68vh] rounded-lg border"
      toolbarStart={
        <span className="text-sm font-medium">
          {pending ? "Pending Documents" : "Master Document List"}
        </span>
      }
    >
      <TableHeader>
        <TableRow>
          {headers.map((label) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow data-row-id={row.id} key={row.id}>
              {pending ? (
                <>
                  <TableCell>{row.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell>{documentTypeLabels[row.documentType]}</TableCell>
                  <TableCell>{row.department}</TableCell>
                  <TableCell>
                    {row.draftRevision === null
                      ? "—"
                      : documentRevisionLabel(row.draftRevision)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={workflowLabel(row.workflowState)} />
                  </TableCell>
                  <TableCell>
                    {row.number && row.revision !== null
                      ? `${row.number} · ${documentRevisionLabel(row.revision)}`
                      : "Not released"}
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>{row.number}</TableCell>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell>{documentTypeLabels[row.documentType]}</TableCell>
                  <TableCell>{row.department}</TableCell>
                  <TableCell>{row.responsibleRole || "—"}</TableCell>
                  <TableCell>{recordLocations(row)}</TableCell>
                  <TableCell>
                    {row.revision === null
                      ? "—"
                      : documentRevisionLabel(row.revision)}
                  </TableCell>
                  <TableCell>{row.revisionDate?.slice(0, 10) ?? "—"}</TableCell>
                  <TableCell>
                    {row.reviewCycleMonths
                      ? `${row.reviewCycleMonths} months`
                      : "Not applicable"}
                  </TableCell>
                  <TableCell>{frequency(row)}</TableCell>
                  <TableCell>{row.dataRetention || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={
                        row.useStatus === "in-use" ? "positive" : "inactive"
                      }
                      value={
                        row.useStatus === "in-use" ? "In Use" : "Not In Use"
                      }
                    />
                  </TableCell>
                </>
              )}
              <TableCell>
                <Link
                  className="font-medium text-primary hover:underline"
                  href={`/iso-document/documents/${row.id}`}
                >
                  Dossier
                </Link>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={headers.length}>
              <StandardState
                variant="empty"
                title={
                  pending ? "No pending documents" : "No released documents"
                }
                description={
                  pending
                    ? "Drafts and revisions in progress appear here."
                    : "Documents appear after QA performs final release."
                }
              />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </OperationalTable>
  )
}
