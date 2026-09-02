import Link from "next/link"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
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
import { Textarea } from "@workspace/ui/components/textarea"

import { BoundedResultNotice } from "@/components/bounded-result-notice"
import {
  SalesWorkspaceTabs,
  salesWorkspaceViews,
  type SalesWorkspaceView,
} from "@/components/sales-workspace-tabs"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import { requireCapability } from "@/lib/auth/require-capability"
import { salesTaskRows } from "@/lib/sales-task-rows"

import {
  completeFollowupAction,
  completeSalesClarificationAction,
  handOverEnquiryAction,
} from "../enquiries/actions"

export const dynamic = "force-dynamic"

function salesView(value: string | undefined): SalesWorkspaceView {
  return salesWorkspaceViews.some((view) => view.id === value)
    ? (value as SalesWorkspaceView)
    : "tasks"
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    candidate?: string
    candidate_item?: string
    followup?: string
    view?: string
  }>
}) {
  const session = await requireCapability(
    "pricing.sales.read",
    "/commercial/sales"
  )
  const salesScope = { originatingSalespersonUserId: session.user.id }
  const params = await searchParams
  const candidateSearch = params.candidate?.trim() ?? ""
  const requestedCandidateItemId = params.candidate_item?.trim() ?? ""
  const requestedFollowupId = params.followup?.trim() ?? ""
  const activeView = salesView(params.view)
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const [
      clarificationResults,
      followupResults,
      handoverResults,
      quoteReadyResults,
      sentQuoteResults,
    ] = await Promise.all([
      workflow.listSalesClarificationQueueBounded("MRMPL", 200, salesScope),
      workflow.listFollowupsBounded("MRMPL", 200, salesScope),
      workflow.listSalesHandoverQueueBounded("MRMPL", 200, salesScope),
      workflow.listSalesQuoteReadyQueueBounded("MRMPL", 200, salesScope),
      workflow.listSalesSentQuoteQueueBounded("MRMPL", salesScope),
    ])
    const clarificationTasks = clarificationResults.rows
    const followups = followupResults.rows
    const selectedFollowup = followups.find(
      (followup) => followup.id === requestedFollowupId
    )
    const handoverTasks = handoverResults.rows
    const quoteReadyTasks = quoteReadyResults.rows
    const sentQuoteTasks = sentQuoteResults.rows
    const selectedClarification = clarificationTasks.find(
      (task) => task.enquiryItemId === requestedCandidateItemId
    )
    const candidateItemId = selectedClarification?.enquiryItemId ?? ""
    const candidateResults =
      await workflow.listSalesMatchCandidatesForItemsBounded(
        selectedClarification ? [selectedClarification.enquiryItemId] : []
      )
    const searchedCandidates =
      candidateItemId && candidateSearch
        ? await workflow.searchSalesMatchCandidates(
            candidateItemId,
            candidateSearch
          )
        : null
    const candidatesFor = (enquiryItemId: string) => {
      const base = candidateResults.get(enquiryItemId)?.rows ?? []
      if (enquiryItemId !== candidateItemId || !searchedCandidates) return base
      const seen = new Set<string>()
      return [...searchedCandidates.rows, ...base].filter((candidate) => {
        if (seen.has(candidate.quoteItemId)) return false
        seen.add(candidate.quoteItemId)
        return true
      })
    }
    const taskRows = salesTaskRows({
      clarifications: clarificationTasks,
      followups,
      handovers: handoverTasks,
      quoteReady: quoteReadyTasks,
    })

    return (
      <div className="grid gap-6">
        <section className="grid gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Sales</h2>
        </section>

        <SalesWorkspaceTabs activeView={activeView} />

        <MetricSummary
          scope="Your loaded sales view · before table filters"
          items={
            activeView === "sent-quotes"
              ? [
                  {
                    label: "Quoted Enquiries",
                    value: sentQuoteTasks.length,
                    tone: "information"
                  },
                  {
                    label: "Quote Items Sent",
                    value: sentQuoteTasks.reduce(
                      (total, row) => total + row.sentQuoteItems,
                      0
                    ),
                    tone: "positive"
                  },
                  {
                    label: "Pending Follow-ups",
                    value: sentQuoteTasks.reduce(
                      (total, row) => total + row.pendingFollowups,
                      0
                    ),
                    tone: "warning"
                  }
                ]
              : activeView === "followup-history"
                ? [
                    {
                      label: "Follow-ups",
                      value: followups.length,
                      tone: "information"
                    },
                    {
                      label: "Pending",
                      value: followups.filter((row) => row.status === "Pending")
                        .length,
                      tone: "warning"
                    }
                  ]
                : [
                    {
                      label: "Open Tasks",
                      value: taskRows.length,
                      tone: "information"
                    },
                    {
                      label: "Clarifications",
                      value: clarificationTasks.length,
                      tone: "warning"
                    },
                    {
                      label: "Quote Ready",
                      value: quoteReadyTasks.length,
                      tone: "positive"
                    }
                  ]
          }
        />

        {activeView === "tasks" ? (
 <SectionCard>
            <CardHeader>
              <CardTitle>Sales Task List</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[70vh] overflow-auto rounded-md border">
 <OperationalTable excelFilters>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead data-filterable="true">Date / Due</TableHead>
                      <TableHead data-filterable="true">Task</TableHead>
                      <TableHead data-filterable="true">Enq</TableHead>
                      <TableHead data-filterable="true">Line</TableHead>
                      <TableHead data-filterable="true">Customer UID</TableHead>
                      <TableHead data-filterable="true">Customer</TableHead>
                      <TableHead data-filterable="true">Details</TableHead>
                      <TableHead data-filterable="true">Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taskRows.map((task) => (
                      <TableRow key={task.key}>
                        <TableCell>{task.taskDate || "—"}</TableCell>
                        <TableCell className="font-medium">
                          {task.taskType}
                        </TableCell>
                        <TableCell>{task.enquiryNumber}</TableCell>
                        <TableCell>{task.line}</TableCell>
                        <TableCell>{task.customerUid}</TableCell>
                        <TableCell>{task.companyName}</TableCell>
                        <TableCell className="max-w-96 whitespace-normal">
                          {task.details || "—"}
                        </TableCell>
                        <TableCell data-filter-value={task.status}>
                          <Badge variant="outline">{task.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {task.action === "handover" ? (
                              <form action={handOverEnquiryAction}>
                                <input
                                  name="enquiry_id"
                                  type="hidden"
                                  value={task.enquiryId}
                                />
                                <Button
                                  disabled={task.status === "Blocked"}
                                  size="sm"
                                  type="submit"
                                >
                                  Hand Over
                                </Button>
                              </form>
                            ) : task.action === "quote" ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href="/commercial/quotes">
                                  Open Quotes
                                </Link>
                              </Button>
                            ) : (
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={{
                                    pathname: "/commercial/sales",
                                    query: {
                                      view: "tasks",
                                      ...(task.action === "clarification"
                                        ? { candidate_item: task.sourceId }
                                        : { followup: task.sourceId }),
                                    },
                                  }}
                                >
                                  Open
                                </Link>
                              </Button>
                            )}
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/commercial/enquiries/${task.enquiryId}`}
                              >
                                Open Enquiry
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!taskRows.length ? (
                      <TableRow>
                        <TableCell
                          className="py-10 text-center text-muted-foreground"
                          colSpan={9}
                        >
                          No Open Sales Tasks.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
 </OperationalTable>
              </div>
            </CardContent>
 </SectionCard>
        ) : null}

        {activeView === "tasks" && selectedClarification ? (
 <SectionCard>
            <CardHeader>
              <CardTitle>Sales Clarification</CardTitle>
              <CardDescription>
                Choose New Work, A Commercial Requote, Or A Technical Revision.
                Quote Candidates Are Scoped To The Same Customer.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {clarificationTasks.length ? (
                <form
                  className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[minmax(12rem,18rem)_minmax(14rem,1fr)_auto] md:items-end"
                  id="sales-candidate-search"
                >
                  <input name="view" type="hidden" value="tasks" />
                  <Field>
                    <FieldLabel htmlFor="candidate-item">
                      Clarification Line
                    </FieldLabel>
                    <NativeSelect
                      defaultValue={candidateItemId}
                      id="candidate-item"
                      name="candidate_item"
                    >
                      {clarificationTasks.map((task) => (
                        <NativeSelectOption
                          key={task.enquiryItemId}
                          value={task.enquiryItemId}
                        >
                          {task.enquiryNumber} / Line {task.lineNumber}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="candidate-query">
                      Find Quote Candidate
                    </FieldLabel>
                    <Input
                      defaultValue={candidateSearch}
                      id="candidate-query"
                      name="candidate"
                      placeholder="Part, Quote Number, Uid, Or Description"
                    />
                  </Field>
                  <Button type="submit" variant="outline">
                    Search
                  </Button>
                </form>
              ) : null}
              {selectedClarification ? (
                [selectedClarification].map((task) => (
                  <form
                    action={completeSalesClarificationAction}
                    className="rounded-3xl border p-5"
                    key={task.clarificationTaskId}
                  >
                    <input
                      type="hidden"
                      name="clarification_task_id"
                      value={task.clarificationTaskId}
                    />
                    <input
                      type="hidden"
                      name="enquiry_id"
                      value={task.enquiryId}
                    />
                    <input
                      type="hidden"
                      name="enquiry_item_id"
                      value={task.enquiryItemId}
                    />
                    <input
                      type="hidden"
                      name="organization_id"
                      value={task.organizationId}
                    />
                    <FieldGroup>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">
                            {task.enquiryNumber} / Line {task.lineNumber}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {task.customerUid} · {task.companyName}
                          </p>
                        </div>
                        <Badge variant="outline">{task.question}</Badge>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Field>
                          <FieldLabel
                            htmlFor={`${task.enquiryItemId}-sales-part`}
                          >
                            Part
                          </FieldLabel>
                          <Input
                            id={`${task.enquiryItemId}-sales-part`}
                            name="part"
                            defaultValue={task.customerPartCode}
                            required
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`${task.enquiryItemId}-sales-description`}
                          >
                            Description
                          </FieldLabel>
                          <Input
                            id={`${task.enquiryItemId}-sales-description`}
                            name="description"
                            defaultValue={task.description}
                            required
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`${task.enquiryItemId}-sales-grade`}
                          >
                            Grade
                          </FieldLabel>
                          <Input
                            id={`${task.enquiryItemId}-sales-grade`}
                            name="grade"
                            defaultValue={task.grade ?? ""}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`${task.enquiryItemId}-sales-quantity`}
                          >
                            Quantity
                          </FieldLabel>
                          <Input
                            id={`${task.enquiryItemId}-sales-quantity`}
                            name="quantity"
                            type="number"
                            min="0"
                            step="0.00000001"
                            defaultValue={task.quantity}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`${task.enquiryItemId}-sales-target`}
                          >
                            Target Price
                          </FieldLabel>
                          <Input
                            id={`${task.enquiryItemId}-sales-target`}
                            name="target_price"
                            type="number"
                            min="0"
                            step="0.000001"
                            defaultValue={task.targetPrice ?? 0}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`${task.enquiryItemId}-sales-drawing-ref`}
                          >
                            Drawing Reference
                          </FieldLabel>
                          <Input
                            id={`${task.enquiryItemId}-sales-drawing-ref`}
                            name="drawing_reference"
                            defaultValue={task.drawingReference ?? ""}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`${task.enquiryItemId}-sales-drawing`}
                          >
                            Replacement Drawing
                          </FieldLabel>
                          <Input
                            id={`${task.enquiryItemId}-sales-drawing`}
                            name="drawing_file"
                            type="file"
                            accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`${task.enquiryItemId}-sales-decision`}
                          >
                            Match Decision
                          </FieldLabel>
                          <NativeSelect
                            id={`${task.enquiryItemId}-sales-decision`}
                            name="sales_match_decision"
                            defaultValue="new"
                          >
                            <NativeSelectOption value="new">
                              New Item — Return To Technical
                            </NativeSelectOption>
                            {candidatesFor(task.enquiryItemId).flatMap(
                              (candidate) => [
                                <NativeSelectOption
                                  key={`quote:${candidate.quoteItemId}`}
                                  value={`quote:${candidate.quoteItemId}`}
                                >
                                  Commercial · {candidate.productUid} ·{" "}
                                  {candidate.quoteNumber}
                                </NativeSelectOption>,
                                <NativeSelectOption
                                  key={`technical:${candidate.quoteItemId}`}
                                  value={`technical:${candidate.quoteItemId}`}
                                >
                                  Technical Revision · {candidate.productUid} ·{" "}
                                  {candidate.quoteNumber}
                                </NativeSelectOption>,
                              ]
                            )}
                          </NativeSelect>
                        </Field>
                      </div>
                      <BoundedResultNotice
                        actionHref="#sales-candidate-search"
                        actionLabel="Search Quote Candidates"
                        coverage={
                          task.enquiryItemId === candidateItemId &&
                          searchedCandidates
                            ? searchedCandidates.coverage
                            : candidateResults.get(task.enquiryItemId)?.coverage
                        }
                        searchQuery={
                          task.enquiryItemId === candidateItemId &&
                          searchedCandidates
                            ? candidateSearch
                            : undefined
                        }
                        section={`Quote candidates for ${task.enquiryNumber} / Line ${task.lineNumber}`}
                      />
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-remarks`}
                        >
                          Line Remarks
                        </FieldLabel>
                        <Textarea
                          id={`${task.enquiryItemId}-sales-remarks`}
                          name="remarks"
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`${task.enquiryItemId}-sales-response`}
                        >
                          Sales Response
                        </FieldLabel>
                        <Textarea
                          id={`${task.enquiryItemId}-sales-response`}
                          name="response"
                          required
                        />
                      </Field>
                      <Button className="w-fit" type="submit">
                        Complete Clarification
                      </Button>
                    </FieldGroup>
                  </form>
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No Sales Clarifications Are Open.
                </p>
              )}
            </CardContent>
 </SectionCard>
        ) : null}

        {activeView === "tasks" && selectedFollowup?.status === "Pending" ? (
 <SectionCard>
            <CardHeader>
              <CardTitle>Complete Follow-Up</CardTitle>
              <CardDescription>
                {selectedFollowup.enquiryNumber} ·{" "}
                {selectedFollowup.companyName}
                {" · "}
                {selectedFollowup.dueOn}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={completeFollowupAction}>
                <input
                  name="followup_id"
                  type="hidden"
                  value={selectedFollowup.id}
                />
                <input name="status" type="hidden" value="Completed" />
                <FieldGroup>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="task-followup-note">
                        Completion Notes
                      </FieldLabel>
                      <Input
                        defaultValue={selectedFollowup.note}
                        id="task-followup-note"
                        name="note"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-followup-channel">
                        Next Channel
                      </FieldLabel>
                      <NativeSelect
                        defaultValue={selectedFollowup.channel}
                        id="task-followup-channel"
                        name="channel"
                      >
                        {["Email", "Phone", "WhatsApp"].map((channel) => (
                          <NativeSelectOption key={channel} value={channel}>
                            {channel}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-followup-next-due">
                        Next Due Date
                      </FieldLabel>
                      <Input
                        id="task-followup-next-due"
                        name="next_due_on"
                        type="date"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-followup-next-note">
                        Next Reminder
                      </FieldLabel>
                      <Input id="task-followup-next-note" name="next_note" />
                    </Field>
                  </div>
                  <Button className="w-fit" type="submit">
                    Complete Follow-Up
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
 </SectionCard>
        ) : null}

        {activeView === "followup-history" ? (
 <SectionCard>
            <CardHeader>
              <CardTitle>Follow-Up History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[70vh] overflow-auto rounded-md border">
 <OperationalTable excelFilters>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead data-filterable="true">Due</TableHead>
                      <TableHead data-filterable="true">Enq</TableHead>
                      <TableHead data-filterable="true">Quote</TableHead>
                      <TableHead data-filterable="true">Customer UID</TableHead>
                      <TableHead data-filterable="true">Customer</TableHead>
                      <TableHead data-filterable="true">Channel</TableHead>
                      <TableHead data-filterable="true">Status</TableHead>
                      <TableHead data-filterable="true">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followups.map((followup) => (
                      <TableRow key={followup.id}>
                        <TableCell>{followup.dueOn}</TableCell>
                        <TableCell>{followup.enquiryNumber}</TableCell>
                        <TableCell>{followup.quoteNumber ?? "—"}</TableCell>
                        <TableCell>{followup.customerUid}</TableCell>
                        <TableCell>{followup.companyName}</TableCell>
                        <TableCell>{followup.channel}</TableCell>
                        <TableCell data-filter-value={followup.status}>
                          <Badge variant="outline">{followup.status}</Badge>
                        </TableCell>
                        <TableCell className="max-w-96 whitespace-normal">
                          {followup.note || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!followups.length ? (
                      <TableRow>
                        <TableCell
                          className="py-10 text-center text-muted-foreground"
                          colSpan={8}
                        >
                          No Follow-Up History.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
 </OperationalTable>
              </div>
            </CardContent>
 </SectionCard>
        ) : null}

        {activeView === "sent-quotes" ? (
 <SectionCard>
            <CardHeader>
              <CardTitle>Sent Quotes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[70vh] overflow-auto rounded-md border">
 <OperationalTable excelFilters>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead data-filterable="true">Sent At</TableHead>
                      <TableHead data-filterable="true">Enq</TableHead>
                      <TableHead data-filterable="true">Customer UID</TableHead>
                      <TableHead data-filterable="true">Customer</TableHead>
                      <TableHead data-filterable="true">Currency</TableHead>
                      <TableHead data-filterable="true">Total Lines</TableHead>
                      <TableHead data-filterable="true">
                        Quote Items Sent
                      </TableHead>
                      <TableHead data-filterable="true">
                        Next Follow-Up
                      </TableHead>
                      <TableHead data-filterable="true">
                        Pending Follow-Ups
                      </TableHead>
                      <TableHead>Quote PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentQuoteTasks.map((task) => (
                      <TableRow key={task.enquiryId}>
                        <TableCell>{task.latestSentAt.toISOString()}</TableCell>
                        <TableCell>{task.enquiryNumber}</TableCell>
                        <TableCell>{task.customerUid}</TableCell>
                        <TableCell>{task.companyName}</TableCell>
                        <TableCell>{task.currency}</TableCell>
                        <TableCell>{task.totalLines}</TableCell>
                        <TableCell>{task.sentQuoteItems}</TableCell>
                        <TableCell>{task.nextFollowupDue ?? "—"}</TableCell>
                        <TableCell>{task.pendingFollowups}</TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/commercial/quotes/enquiry/${task.enquiryId}/pdf`}
                            >
                              Open PDF
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!sentQuoteTasks.length ? (
                      <TableRow>
                        <TableCell
                          className="py-10 text-center text-muted-foreground"
                          colSpan={10}
                        >
                          No Sent Quotes Saved.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
 </OperationalTable>
              </div>
            </CardContent>
 </SectionCard>
        ) : null}
      </div>
    )
  } finally {
    await workflow.close()
  }
}
