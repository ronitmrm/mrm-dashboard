"use client"
import { useId, useState } from "react"
import Link from "next/link"
import type { InterestedPartyRequirement } from "@workspace/db"
import {
  monitoringToday,
  requirementAttention,
  requirementReference,
} from "@workspace/db/interested-parties-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import { DataDownloadButton } from "@/components/data-download-button"
import { MetricSummary, PageHeader } from "@/components/ui/golden-patterns"
import { requirementTone } from "@/lib/iso-document/interested-parties-display"
export function InterestedPartiesRegister({
  records,
  canManage,
  allRecords,
}: {
  records: InterestedPartyRequirement[]
  canManage: boolean
  allRecords: boolean
}) {
  const prefix = useId(),
    [view, setView] = useState("Needs attention"),
    today = monitoringToday()
  const visible = records.filter(
    (record) =>
      view === "All" ||
      (view === "Needs attention"
        ? !["Inactive", "Monitoring current"].includes(
            requirementAttention(record, today)
          )
        : view === "Active" || view === "Inactive" || view === "Draft"
          ? record.lifecycle === view
          : requirementAttention(record, today) === view)
  )
  return (
    <div className="grid min-w-0 gap-6">
      <MetricSummary
        scope={`${allRecords ? "All" : "Your assigned"} requirements · before table filters`}
        items={[
          { label: "Requirements", value: records.length, tone: "information" },
          {
            label: "Draft plans",
            value: records.filter((record) => record.lifecycle === "Draft")
              .length,
            tone: "warning",
          },
          {
            label: "Awaiting QA",
            value: records.filter((record) => record.pendingReviewId).length,
            tone: "warning",
          },
          {
            label: "Follow-ups",
            value: records.filter(
              (record) =>
                record.lifecycle === "Active" &&
                record.verifiedOutcome &&
                record.verifiedOutcome !== "Met"
            ).length,
            tone: "warning",
          },
        ]}
      />
      <PageHeader
        title="Interested Parties Requirements"
        description="Assess relevant needs, maintain monitoring plans and record evidence-based checks. Ongoing requirements stay active after a Met result."
        actions={
          <>
            {canManage && (
              <Button asChild>
                <Link href="/iso-document/interested-parties/new">
                  New requirement
                </Link>
              </Button>
            )}
            <DataDownloadButton
              href="/iso-document/interested-parties/export.xlsx"
              label="Download Excel"
            />
          </>
        }
      />
      <SectionCard>
        <CardHeader>
          <CardTitle>Requirements and monitoring register</CardTitle>
          <CardDescription>
            Open a requirement to fill its plan, record monitoring, review QA
            decisions and see earlier versions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="mb-4 max-w-72">
            <FieldLabel htmlFor={prefix}>Show</FieldLabel>
            <NativeSelect
              id={prefix}
              value={view}
              onChange={(event) => setView(event.target.value)}
            >
              {[
                "Needs attention",
                "All",
                "Draft",
                "Active",
                "Inactive",
                "Awaiting QA",
                "Follow-up required",
                "Follow-up overdue",
                "Review due",
                "Review overdue",
                "Monitoring current",
                "Monitoring returned",
              ].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <OperationalTable
            excelFilters
            filterStorageKey="iso-interested-party-requirements"
            containerClassName="max-h-[65vh] rounded-xl border"
            state={visible.length ? "ready" : "empty"}
            stateTitle="No matching requirements"
            stateDescription="Choose another view or add a requirement."
          >
            <TableHeader>
              <TableRow>
                {[
                  "Reference",
                  "Interested party",
                  "Requirement / scope",
                  "Identified on",
                  "Relevance",
                  "Responsible",
                  "State",
                  "Monitoring position",
                  "Last verified result",
                  "Last checked",
                  "Next review",
                  "Follow-up / target",
                ].map((label) => (
                  <TableHead key={label} data-filterable="true">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((record) => {
                const attention = requirementAttention(record, today)
                return (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        href={`/iso-document/interested-parties/${record.id}`}
                      >
                        {requirementReference(record.number)}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-40">
                      {record.partyGroup}
                      <p className="text-xs text-muted-foreground">
                        {record.partyType}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-96 min-w-64 whitespace-pre-wrap">
                      {record.requirement}
                      {record.scope && (
                        <p className="text-xs text-muted-foreground">
                          {record.scope}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.identifiedOn || "Not recorded"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        value={record.relevance}
                        tone={
                          record.relevance === "Not assessed"
                            ? "warning"
                            : "information"
                        }
                      />
                    </TableCell>
                    <TableCell className="min-w-44">
                      {record.ownerName || "Not assigned"}
                      <p className="text-xs text-muted-foreground">
                        {record.department || "Department not recorded"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        value={record.lifecycle}
                        tone={
                          record.lifecycle === "Inactive"
                            ? "inactive"
                            : "information"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        value={attention}
                        tone={requirementTone(attention)}
                      />
                    </TableCell>
                    <TableCell>
                      {record.verifiedOutcome || "Not verified"}
                      {record.verifiedPlanRevision !== null &&
                        record.verifiedPlanRevision !== record.planRevision && (
                          <p className="text-xs text-muted-foreground">
                            Earlier plan
                          </p>
                        )}
                    </TableCell>
                    <TableCell>{record.verifiedOn || "Not recorded"}</TableCell>
                    <TableCell>
                      {record.nextReviewOn || "Not planned"}
                    </TableCell>
                    <TableCell className="max-w-80 min-w-56 whitespace-pre-wrap">
                      {record.verifiedOutcome &&
                      record.verifiedOutcome !== "Met" ? (
                        <>
                          {record.followUp}
                          <p className="text-xs text-muted-foreground">
                            {record.followUpDueOn || "Not set"}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
    </div>
  )
}
