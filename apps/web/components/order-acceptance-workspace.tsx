"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  Plus,
  Upload,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { Input } from "@workspace/ui/components/input"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  ActionToolbar,
  FormGrid,
  FormSection,
} from "@/components/ui/golden-patterns"
import { PageActions } from "@/components/ui/page-actions"
import {
  type PlanningContext,
  type ProposalInput,
  type ProposalPlan,
} from "@/lib/order-acceptance"
import { formatIstDate, istDateValue } from "@/lib/date-time"
import { groupWorkloadBlockers } from "@/lib/order-acceptance-review"
import {
  proposalTemplate,
  importProposedOrder,
  exportRmDates,
  importRmDates,
  exportProposalResult,
} from "@/lib/order-acceptance-workbook"

type SavedProposal = {
  id: string
  reference: string
  version: number
  state: "draft" | "approved"
  input: ProposalInput
  result: ProposalPlan | null
}
function emptyInput(): ProposalInput {
  const startDate = istDateValue()
  const deadline = new Date(`${startDate}T00:00:00Z`)
  const day = deadline.getUTCDate()
  deadline.setUTCDate(1)
  deadline.setUTCMonth(deadline.getUTCMonth() + 2)
  const lastDay = new Date(
    Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth() + 1, 0)
  ).getUTCDate()
  deadline.setUTCDate(Math.min(day, lastDay))
  return {
    reference: "",
    revisionOf: "",
    startDate,
    deadline: deadline.toISOString().slice(0, 10),
    hoursPerDay: 8,
    efficiency: 100,
    setupHours: 0,
    dispatchDays: 0,
    mode: "deadline",
    lines: [],
    existingRmDates: {},
  }
}
export function OrderAcceptanceWorkspace({
  floor,
  canWrite,
}: {
  floor: string
  canWrite: boolean
}) {
  const [input, setInput] = useState(emptyInput)
  const [saved, setSaved] = useState<SavedProposal | null>(null)
  const [register, setRegister] = useState<SavedProposal[]>([])
  const [context, setContext] = useState<PlanningContext | null>(null)
  const [plan, setPlan] = useState<ProposalPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [excelOpen, setExcelOpen] = useState(false)
  const productUploadRef = useRef<HTMLInputElement>(null)
  const rmUploadRef = useRef<HTMLInputElement>(null)
  const endpoint = `/api/order-acceptance?floor=${encodeURIComponent(floor)}`
  const locked = !canWrite || saved?.state === "approved" || busy
  async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options)
    const data: unknown = await response.json()
    const error =
      data !== null && typeof data === "object" && "error" in data
        ? String(data.error)
        : "Unable to load proposals."
    if (!response.ok) throw new Error(error)
    return data as T
  }
  useEffect(() => {
    let active = true
    void fetch(endpoint)
      .then(async (response) => {
        const data = (await response.json()) as {
          error?: string
          proposals: SavedProposal[]
          context: PlanningContext
        }
        if (!response.ok)
          throw new Error(data.error || "Unable to load proposals.")
        if (active) {
          setRegister(data.proposals)
          setContext(data.context)
        }
      })
      .catch((error) => {
        if (active) setError(String(error.message))
      })
    return () => {
      active = false
    }
  }, [endpoint])
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to process proposal."
      )
    } finally {
      setBusy(false)
    }
  }
  function change(next: ProposalInput) {
    setInput(next)
    setPlan(null)
  }
  async function mutate(action: "save" | "calculate" | "approve") {
    await run(async () => {
      const data = await request<{ proposal: SavedProposal }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id: saved?.id,
          version: saved?.version ?? 0,
          input,
        }),
      })
      const proposal: SavedProposal = data.proposal
      setSaved(proposal)
      setInput(proposal.input)
      setPlan(proposal.result)
      const refreshed = await request<{
        proposals: SavedProposal[]
        context: PlanningContext
      }>(endpoint)
      setRegister(refreshed.proposals)
      setContext(refreshed.context)
    })
  }
  const dateFields = [
    ["startDate", "Machining start date"],
    [
      "deadline",
      input.mode === "deadline"
        ? "Machining deadline"
        : "Capacity review end date",
    ],
  ] as const
  const machineFields = [
    ["hoursPerDay", "Working hours per day"],
    ["efficiency", "Usable machine time (%)"],
    ["setupHours", "Setup/changeover hours per operation"],
  ] as const
  const groups = groupWorkloadBlockers(
    plan?.blockers ?? [],
    context?.existing ?? []
  )
  const selected = plan?.lines.filter((line) => line.selected).length ?? 0
  const blocked = !!plan?.blockers.length
  const productIssues = blocked
    ? plan.lines.filter(
        (line) => line.reason !== "Resolve existing workload blockers"
      )
    : []
  return (
    <div className="grid min-w-0 gap-5">
      {error ? (
        <StandardState
          variant="error"
          title="Proposal needs attention"
          description={error}
        />
      ) : null}
      {!context && !error ? (
        <StandardState
          variant="loading"
          title="Loading existing workload"
          description="Reading the selected unit's latest production plan."
        />
      ) : null}
      <input
        ref={productUploadRef}
        type="file"
        accept=".xlsx"
        hidden
        disabled={locked}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file)
            void run(async () =>
              change({ ...input, lines: await importProposedOrder(file) })
            )
          event.target.value = ""
        }}
      />
      <input
        ref={rmUploadRef}
        type="file"
        accept=".xlsx"
        hidden
        disabled={locked || !context || input.mode !== "dates"}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file && context)
            void run(async () =>
              change(await importRmDates(file, input, context))
            )
          event.target.value = ""
        }}
      />
      <PageActions>
        <ActionToolbar className="justify-start max-sm:w-full">
          <label className="w-full min-w-0 sm:w-60">
            <span className="sr-only">Open a saved proposal</span>
            <SearchableSelect
              aria-label="Saved proposals"
              className="h-9 w-full rounded-md border bg-background px-3"
              value={saved?.id ?? ""}
              disabled={busy}
              onChange={(event) => {
                const id = event.target.value
                if (id)
                  void run(async () => {
                    const data = await request<{ proposal?: SavedProposal }>(
                      `${endpoint}&id=${encodeURIComponent(id)}`
                    )
                    if (!data.proposal) throw new Error("Proposal not found.")
                    setSaved(data.proposal)
                    setInput(data.proposal.input)
                    setPlan(data.proposal.result)
                  })
              }}
            >
              <option value="">Open saved proposal</option>
              {register.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.reference} — {row.state}
                </option>
              ))}
            </SearchableSelect>
          </label>
          {canWrite ? (
            <Button
              className="h-9"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSaved(null)
                setPlan(null)
                setInput(emptyInput())
              }}
            >
              <Plus aria-hidden="true" />
              New Proposal
            </Button>
          ) : null}
          {saved?.state === "approved" && canWrite ? (
            <Button
              className="h-9"
              variant="outline"
              disabled={busy}
              onClick={() => {
                change({
                  ...input,
                  reference: `${input.reference} revision`,
                  revisionOf: saved.id,
                })
                setSaved(null)
              }}
            >
              Create Revised Proposal
            </Button>
          ) : null}
          {canWrite ? (
            <Button
              className="h-9"
              disabled={locked}
              onClick={() => productUploadRef.current?.click()}
            >
              <Upload aria-hidden="true" />
              Upload Products
            </Button>
          ) : null}
          <Popover open={excelOpen} onOpenChange={setExcelOpen}>
            <PopoverTrigger asChild>
              <Button className="h-9" variant="outline" disabled={busy}>
                <FileSpreadsheet aria-hidden="true" />
                Excel Files
                <ChevronDown aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              aria-label="Excel files"
              className="w-72 gap-1 p-2"
            >
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  proposalTemplate()
                  setExcelOpen(false)
                }}
              >
                <Download aria-hidden="true" />
                Download Product Template
              </Button>
              {input.mode === "dates" ? (
                <>
                  <p className="mt-1 border-t px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                    Raw material dates
                  </p>
                  <Button
                    variant="ghost"
                    className="justify-start"
                    disabled={!context || !input.lines.length || busy}
                    onClick={() => {
                      if (context) exportRmDates(input, context)
                      setExcelOpen(false)
                    }}
                  >
                    <Download aria-hidden="true" />
                    Download RM Workbook
                  </Button>
                  {canWrite ? (
                    <Button
                      variant="ghost"
                      className="justify-start"
                      disabled={locked || !context}
                      onClick={() => {
                        rmUploadRef.current?.click()
                        setExcelOpen(false)
                      }}
                    >
                      <Upload aria-hidden="true" />
                      Upload RM Dates
                    </Button>
                  ) : null}
                </>
              ) : null}
            </PopoverContent>
          </Popover>
        </ActionToolbar>
      </PageActions>
      {saved?.state === "approved" ? (
        <StandardState
          variant="empty"
          title="Proposal approved — planning flow complete"
          description="Obtain Purchase approval separately. Enter the confirmed PO through Purchase Order flow. This proposal reserves no capacity."
        />
      ) : null}
      <FormSection
        title="Order details"
        description="Check which products can be machined using this unit's available capacity."
      >
        <div className="grid min-w-0 gap-4">
          <FormGrid className="xl:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Proposal reference
              <Input
                disabled={locked}
                value={input.reference}
                onChange={(event) =>
                  change({ ...input, reference: event.target.value })
                }
              />
            </label>
            {dateFields.map(([key, label]) => (
              <label className="grid gap-1 text-sm" key={key}>
                {label}
                <Input
                  type="date"
                  disabled={locked}
                  value={input[key]}
                  onChange={(event) =>
                    change({
                      ...input,
                      [key]: event.target.value,
                    })
                  }
                />
              </label>
            ))}
            <label className="grid gap-1 text-sm">
              What do you want to check?
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3"
                disabled={locked}
                value={input.mode}
                onChange={(event) =>
                  change({
                    ...input,
                    mode:
                      event.target.value === "deadline" ? "deadline" : "dates",
                  })
                }
              >
                <option value="dates">
                  When will machining finish after RM arrives?
                </option>
                <option value="deadline">
                  Which products fit before the deadline?
                </option>
              </SearchableSelect>
            </label>
          </FormGrid>
          <p className="text-sm text-muted-foreground">
            {input.mode === "deadline"
              ? `Machining can run from ${formatIstDate(input.startDate)} to ${formatIstDate(input.deadline)}. The whole period is available for machining.`
              : "Enter RM-ready dates to estimate when machining will finish. The review end date sets the period for the machine-capacity summary."}{" "}
            Fridays and plant holidays are excluded.
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Machine time settings — {input.hoursPerDay} hours/day,{" "}
              {input.efficiency}% usable
            </summary>
            <FormGrid className="mt-4">
              {machineFields.map(([key, label]) => (
                <label key={key} className="grid gap-1 text-sm">
                  {label}
                  <Input
                    type="number"
                    step="any"
                    disabled={locked}
                    value={input[key]}
                    onChange={(event) =>
                      change({ ...input, [key]: Number(event.target.value) })
                    }
                  />
                </label>
              ))}
            </FormGrid>
            <p className="mt-3 text-sm text-muted-foreground">
              Usable time allows for normal lost machine time. Each setup runs
              as one complete batch on one compatible machine. Existing job
              plans keep their machine dates.
            </p>
          </details>
        </div>
      </FormSection>
      <SectionCard>
        <CardHeader>
          <CardTitle>Proposed products ({input.lines.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4">
          <p className="text-sm text-muted-foreground">
            {input.mode === "deadline"
              ? "Upload your product list. This check assumes RM is ready when needed; selected lines show the required RM date."
              : "Upload your product list and enter expected RM-ready dates, directly or using the RM workbook."}
          </p>
          <details open={!plan}>
            <summary className="mb-3 cursor-pointer text-sm font-medium">
              View uploaded products ({input.lines.length})
            </summary>
            <OperationalTable
              filterStorageKey={`proposed-lines-${floor}`}
              containerClassName="max-h-96 border rounded-md"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Route option</TableHead>
                  <TableHead>Quantity pcs</TableHead>
                  {input.mode === "dates" ? (
                    <TableHead>Expected RM-ready date</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {input.lines.map((line, index) => (
                  <TableRow key={`${line.id}-${index}`}>
                    <TableCell>{line.id}</TableCell>
                    <TableCell>{line.part}</TableCell>
                    <TableCell>
                      {line.option || "Auto if single route"}
                    </TableCell>
                    <TableCell>
                      {line.quantity.toLocaleString("en-IN")}
                    </TableCell>
                    {input.mode === "dates" ? (
                      <TableCell>
                        <Input
                          aria-label={`RM date for proposed line ${line.id}`}
                          type="date"
                          disabled={locked}
                          value={line.rmDate}
                          onChange={(event) =>
                            change({
                              ...input,
                              lines: input.lines.map((row, rowIndex) =>
                                rowIndex === index
                                  ? { ...row, rmDate: event.target.value }
                                  : row
                              ),
                            })
                          }
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
            {input.mode === "dates" &&
            context?.existing.some((line) => !line.rmDate) ? (
              <OperationalTable
                filterStorageKey={`proposal-existing-rm-${floor}`}
                containerClassName="max-h-72 border rounded-md"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Existing job card</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Expected RM-ready date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {context.existing
                    .filter((line) => !line.rmDate)
                    .map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.id}</TableCell>
                        <TableCell>{line.part}</TableCell>
                        <TableCell>
                          <Input
                            aria-label={`RM date for existing ${line.id}`}
                            type="date"
                            disabled={locked}
                            value={input.existingRmDates[line.id] ?? ""}
                            onChange={(event) =>
                              change({
                                ...input,
                                existingRmDates: {
                                  ...input.existingRmDates,
                                  [line.id]: event.target.value,
                                },
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </OperationalTable>
            ) : null}
          </details>
          <ActionToolbar>
            <Button
              variant="outline"
              disabled={locked || !input.lines.length}
              onClick={() => void mutate("save")}
            >
              Save Draft
            </Button>
            <Button
              disabled={locked || !input.lines.length || !context}
              onClick={() => void mutate("calculate")}
            >
              {input.mode === "deadline"
                ? "Check Capacity"
                : "Calculate Machining Dates"}
            </Button>
          </ActionToolbar>
        </CardContent>
      </SectionCard>
      {plan ? (
        <SectionCard>
          <CardHeader>
            <CardTitle>Capacity result</CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4">
            <StatusBadge
              value={
                blocked
                  ? "Needs attention"
                  : `${selected} of ${plan.lines.length} lines can be machined`
              }
              tone={blocked ? "warning" : selected ? "positive" : "warning"}
            />
            {blocked ? (
              <StandardState
                variant="error"
                title="Resolve existing work before checking this order"
                description={`${plan.blockers.length} production checks are preventing the capacity calculation. Capacity for the ${plan.lines.length} proposed lines has not been assessed yet. Resolve the checks below, then click Check Capacity again.`}
                action={
                  <ActionToolbar>
                    <Button variant="outline" asChild>
                      <Link href={`/?tab=productionControlTab&floor=${floor}`}>
                        Open Planner Actions
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/?tab=masterGapsTab&floor=${floor}`}>
                        Open Part Readiness
                      </Link>
                    </Button>
                  </ActionToolbar>
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {input.mode === "deadline"
                  ? `These complete product lines fit the machining deadline of ${formatIstDate(input.deadline)}. RM must be ready by the dates below.`
                  : "Completion dates show when machining finishes, based on the entered RM-ready dates."}
              </p>
            )}
            {groups.map((group) => (
              <details key={group.title}>
                <summary className="cursor-pointer text-sm font-medium">
                  {group.title} ({group.rows.length})
                  <span className="mt-1 block text-sm font-normal text-muted-foreground">
                    {group.action}
                  </span>
                </summary>
                <OperationalTable
                  filterStorageKey={`proposal-checks-${floor}-${group.title}`}
                  containerClassName="max-h-64 rounded-md border"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job card</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>What needs attention</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow key={`${row.job}-${row.detail}`}>
                        <TableCell>{row.job}</TableCell>
                        <TableCell>{row.part}</TableCell>
                        <TableCell>{row.detail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </OperationalTable>
              </details>
            ))}
            {productIssues.length ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Proposed product masters need attention (
                  {productIssues.length})
                  <span className="mt-1 block text-sm font-normal text-muted-foreground">
                    Complete these product masters in Part Readiness before
                    checking capacity again.
                  </span>
                </summary>
                <OperationalTable
                  filterStorageKey={`proposal-product-checks-${floor}`}
                  containerClassName="max-h-64 rounded-md border"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>What needs attention</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productIssues.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.id}</TableCell>
                        <TableCell>{line.part}</TableCell>
                        <TableCell>{line.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </OperationalTable>
              </details>
            ) : null}
            {!blocked ? (
              <>
                <OperationalTable
                  filterStorageKey={`proposal-decisions-${floor}`}
                  containerClassName="max-h-96 border rounded-md"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Can be machined</TableHead>
                      <TableHead>Machining finishes</TableHead>
                      <TableHead>RM needed by</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.id}</TableCell>
                        <TableCell>{line.part}</TableCell>
                        <TableCell>
                          <StatusBadge
                            value={line.selected ? "Yes" : "No"}
                            tone={line.selected ? "positive" : "warning"}
                          />
                        </TableCell>
                        <TableCell>
                          {line.completion
                            ? formatIstDate(line.completion)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {line.rmRequiredBy
                            ? formatIstDate(line.rmRequiredBy)
                            : "—"}
                        </TableCell>
                        <TableCell>{line.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </OperationalTable>
              </>
            ) : null}
            <details>
              <summary className="mb-3 cursor-pointer text-sm font-medium">
                Machine family capacity
              </summary>
              <OperationalTable
                filterStorageKey={`proposal-families-${floor}`}
                containerClassName="max-h-72 border rounded-md"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Family</TableHead>
                    <TableHead>Machines</TableHead>
                    <TableHead>Available hours</TableHead>
                    <TableHead>Existing job hours</TableHead>
                    <TableHead>Hours for this order</TableHead>
                    <TableHead>Utilisation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.families.map((row) => (
                    <TableRow key={row.family}>
                      <TableCell>{row.family}</TableCell>
                      <TableCell>{row.machines}</TableCell>
                      <TableCell>{row.available.toFixed(1)}</TableCell>
                      <TableCell>{row.committed.toFixed(1)}</TableCell>
                      <TableCell>{row.proposed.toFixed(1)}</TableCell>
                      <TableCell>
                        {(row.utilisation * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </OperationalTable>
            </details>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                How this check works
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                {input.mode === "deadline"
                  ? "We compare four scheduling orders and keep the one that fits the most complete lines. This is an estimate; it does not guarantee the best possible combination."
                  : "Products are planned in the uploaded order, after their expected RM-ready dates."}{" "}
                RM needed by is the first machining date in this schedule.
                Approval saves the reviewed proposal; it does not create a PO or
                reserve machines.
              </p>
            </details>
            <ActionToolbar>
              <Button
                variant="outline"
                onClick={() => exportProposalResult(input, plan)}
              >
                Export Reviewed Plan
              </Button>
              <Button
                disabled={
                  locked ||
                  !!plan.blockers.length ||
                  !plan.lines.some((line) => line.selected)
                }
                onClick={() => void mutate("approve")}
              >
                Approve Reviewed Proposal
              </Button>
            </ActionToolbar>
          </CardContent>
        </SectionCard>
      ) : null}
    </div>
  )
}
