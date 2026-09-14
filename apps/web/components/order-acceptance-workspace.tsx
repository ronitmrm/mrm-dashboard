"use client"

import { useEffect, useState } from "react"
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
import { ActionToolbar, FormGrid } from "@/components/ui/golden-patterns"
import {
  type PlanningContext,
  type ProposalInput,
  type ProposalPlan,
} from "@/lib/order-acceptance"
import { istDateValue } from "@/lib/date-time"
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
    mode: "dates",
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
  const fields = [
    ["startDate", "Planning start", "date"],
    ["deadline", "Dispatch deadline / utilisation period end", "date"],
    ["hoursPerDay", "Working hours per day", "number"],
    ["efficiency", "Available time (%)", "number"],
    ["setupHours", "Setup/changeover hours per operation", "number"],
    [
      "dispatchDays",
      "Finishing, inspection and packing (calendar days)",
      "number",
    ],
  ] as const
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
      <ActionToolbar>
        {canWrite ? (
          <Button
            disabled={busy}
            onClick={() => {
              setSaved(null)
              setPlan(null)
              setInput(emptyInput())
            }}
          >
            New Proposed Order
          </Button>
        ) : null}
        <label className="grid gap-1 text-sm">
          Saved proposals (latest 100)
          <SearchableSelect
            aria-label="Saved proposals"
            className="h-9 rounded-md border bg-background px-3"
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
            <option value="">Choose a proposal</option>
            {register.map((row) => (
              <option key={row.id} value={row.id}>
                {row.reference} — {row.state}
              </option>
            ))}
          </SearchableSelect>
        </label>
        {saved?.state === "approved" && canWrite ? (
          <Button
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
      </ActionToolbar>
      {saved?.state === "approved" ? (
        <StandardState
          variant="empty"
          title="Proposal approved — planning flow complete"
          description="Obtain Purchase approval separately. Enter the confirmed PO through Purchase Order flow. This proposal reserves no capacity."
        />
      ) : null}
      <SectionCard>
        <CardHeader>
          <CardTitle>Proposed Order</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4">
          <FormGrid>
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
            {fields.map(([key, label, type]) => (
              <label className="grid gap-1 text-sm" key={key}>
                {label}
                <Input
                  type={type}
                  disabled={locked}
                  value={input[key]}
                  step={type === "number" ? "any" : undefined}
                  onChange={(event) =>
                    change({
                      ...input,
                      [key]:
                        type === "number"
                          ? Number(event.target.value)
                          : event.target.value,
                    })
                  }
                />
              </label>
            ))}
            <label className="grid gap-1 text-sm">
              Planning mode
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
                  Tentative dates using planner RM dates
                </option>
                <option value="deadline">
                  Select lines by deadline; ignore tentative RM dates
                </option>
              </SearchableSelect>
            </label>
          </FormGrid>
          <p className="text-sm text-muted-foreground">
            Friday and configured plant holidays are excluded. Each operation
            runs as a whole batch on one compatible machine. Existing scheduled
            work keeps its machine dates. Zero allowances mean no additional
            time is included.
          </p>
          <ActionToolbar>
            <Button variant="outline" onClick={proposalTemplate}>
              Download Excel Template
            </Button>
            <label className="grid gap-1 text-sm">
              Upload Proposed Order Excel
              <Input
                type="file"
                accept=".xlsx"
                disabled={locked}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file)
                    void run(async () =>
                      change({
                        ...input,
                        lines: await importProposedOrder(file),
                      })
                    )
                  event.target.value = ""
                }}
              />
            </label>
            <Button
              variant="outline"
              disabled={!context || !input.lines.length || busy}
              onClick={() => context && exportRmDates(input, context)}
            >
              Export RM Date Workbook
            </Button>
            <label className="grid gap-1 text-sm">
              Import completed RM workbook
              <Input
                type="file"
                accept=".xlsx"
                disabled={locked || !context}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file && context)
                    void run(async () =>
                      change(await importRmDates(file, input, context))
                    )
                  event.target.value = ""
                }}
              />
            </label>
          </ActionToolbar>
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
                <TableHead>Tentative RM-ready date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {input.lines.map((line, index) => (
                <TableRow key={`${line.id}-${index}`}>
                  <TableCell>{line.id}</TableCell>
                  <TableCell>{line.part}</TableCell>
                  <TableCell>{line.option || "Auto if single route"}</TableCell>
                  <TableCell>{line.quantity.toLocaleString("en-IN")}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </OperationalTable>
          {context?.existing.some((line) => !line.rmDate) ? (
            <OperationalTable
              filterStorageKey={`proposal-existing-rm-${floor}`}
              containerClassName="max-h-72 border rounded-md"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Existing job card</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Awaiting RM: tentative date</TableHead>
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
                ? "Select Feasible Lines"
                : "Calculate Tentative Dates"}
            </Button>
          </ActionToolbar>
        </CardContent>
      </SectionCard>
      {plan ? (
        <SectionCard>
          <CardHeader>
            <CardTitle>Planner Review</CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4">
            <p className="text-sm">
              {plan.lines.filter((line) => line.selected).length} of{" "}
              {plan.lines.length} complete lines selected. {plan.method}
            </p>
            <p className="text-sm text-muted-foreground">
              RM required by is the first-operation start date supporting this
              specific schedule. Dispatch remains conditional on RM, tooling,
              staffing and downstream readiness. Family figures cover the review
              period.
            </p>
            {plan.blockers.map((blocker) => (
              <StandardState
                key={blocker}
                variant="error"
                title="Existing workload needs attention"
                description={blocker}
              />
            ))}
            <OperationalTable
              filterStorageKey={`proposal-decisions-${floor}`}
              containerClassName="max-h-96 border rounded-md"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Selected</TableHead>
                  <TableHead>Tentative dispatch</TableHead>
                  <TableHead>RM required by</TableHead>
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
                        value={line.selected ? "Selected" : "Excluded"}
                        tone={line.selected ? "positive" : "warning"}
                      />
                    </TableCell>
                    <TableCell>{line.completion || "—"}</TableCell>
                    <TableCell>{line.rmRequiredBy || "—"}</TableCell>
                    <TableCell>{line.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
            <OperationalTable
              filterStorageKey={`proposal-families-${floor}`}
              containerClassName="max-h-72 border rounded-md"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Family</TableHead>
                  <TableHead>Machines</TableHead>
                  <TableHead>Available hours</TableHead>
                  <TableHead>Committed hours</TableHead>
                  <TableHead>Proposed hours</TableHead>
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
                    <TableCell>{(row.utilisation * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
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
                Approve Proposal and Finish
              </Button>
            </ActionToolbar>
          </CardContent>
        </SectionCard>
      ) : null}
    </div>
  )
}
