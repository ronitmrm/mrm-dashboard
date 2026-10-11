import Link from "next/link"
import { withSipoc } from "@/lib/iso-document/sipoc-server"
import { PageHeader, MetricSummary } from "@/components/ui/golden-patterns"
import { Button } from "@workspace/ui/components/button"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@workspace/ui/components/table"
import { DataDownloadButton } from "@/components/data-download-button"
import { sipocToday } from "@workspace/db/sipoc-domain"
export default async function SipocPage() {
  return withSipoc(async ({ repository, access }) => {
    const records = await repository.list(access)
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader
          title="SIPOC Process Maps"
          description="Define process boundaries and handoffs. Prepare with the process owner, obtain QA review and retain approved revisions."
          actions={
            <>
              <DataDownloadButton
                href="/iso-document/sipoc/export.xlsx"
                label="Download Excel"
              />
              {access.canManage ? (
                <Button asChild>
                  <Link href="/iso-document/sipoc/new">New process map</Link>
                </Button>
              ) : null}
            </>
          }
        />
        <MetricSummary
          scope="All SIPOC process maps"
          items={[
            { label: "Processes", value: records.length, tone: "information" },
            {
              label: "Awaiting QA",
              value: records.filter((row) => row.status === "Submitted").length,
              tone: "warning",
            },
            {
              label: "Approved maps available",
              value: records.filter((row) => row.approvedRevision !== null)
                .length,
              tone: "positive",
            },
          ]}
        />
        <OperationalTable
          excelFilters
          filterStorageKey="iso-sipoc-register"
          containerClassName="max-h-[65vh] rounded-xl border"
          state={records.length ? "ready" : "empty"}
          stateTitle="No process maps"
          stateDescription="Prepare a new SIPOC map for a process."
        >
          <TableHeader>
            <TableRow>
              {[
                "Map",
                "Process",
                "Department",
                "Owner",
                "Working status",
                "Revision",
                "Approved revision",
                "Next review",
                "Approved map review",
                "QA findings",
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    className="underline"
                    href={`/iso-document/sipoc/${row.id}`}
                  >
                    SIPOC-{row.number}
                  </Link>
                </TableCell>
                <TableCell className="min-w-56">{row.fields.name}</TableCell>
                <TableCell>
                  {row.fields.department || "Needs assessment"}
                </TableCell>
                <TableCell>{row.ownerName || "Unassigned"}</TableCell>
                <TableCell>
                  <StatusBadge value={row.status} />
                </TableCell>
                <TableCell>{row.revision}</TableCell>
                <TableCell>{row.approvedRevision ?? "—"}</TableCell>
                <TableCell>
                  {row.fields.nextReviewOn || "Not scheduled"}
                </TableCell>
                <TableCell>
                  {row.approvedReviewOn ? (
                    <StatusBadge
                      value={
                        row.approvedReviewOn <= sipocToday()
                          ? `Review due · ${row.approvedReviewOn}`
                          : `Scheduled · ${row.approvedReviewOn}`
                      }
                      tone={
                        row.approvedReviewOn <= sipocToday()
                          ? "warning"
                          : "information"
                      }
                    />
                  ) : (
                    "Not approved"
                  )}
                </TableCell>
                <TableCell className="max-w-96 min-w-56 whitespace-pre-wrap">
                  {row.decisionNotes || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </OperationalTable>
      </div>
    )
  })
}
