"use client"

import { useState, type FormEvent } from "react"
import type { UrgentDeliveryPlan } from "@workspace/db/urgent-delivery"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  FormGrid,
  FormSection,
  RecordDetails,
  StandardState,
} from "@/components/ui/golden-patterns"
import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"

type Row = Record<string, unknown>
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value : [])
const text = (value: unknown) => String(value ?? "").trim()
const date = (value: unknown) =>
  value ? formatCalendarDate(value) : "Unavailable"

export function UrgentDeliveryPlannerForm({
  productionControl,
  floor,
}: {
  productionControl: Row
  floor: string
}) {
  const [searchBy, setSearchBy] = useState("job")
  const [partCode, setPartCode] = useState("")
  const [jcNo, setJcNo] = useState("")
  const [preferredDate, setPreferredDate] = useState("")
  const [plan, setPlan] = useState<UrgentDeliveryPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const work = rows(productionControl.workOrders).filter(
    (row) =>
      row.dispatchStatus !== "Shifted to dispatch" &&
      Number(row.orderPcs) > (Number(row.finalSetupGoodPieces) || 0)
  )
  const parts = [...new Set(work.map((row) => text(row.partCode)))].sort()
  const jobs =
    searchBy === "part" ? work.filter((row) => row.partCode === partCode) : work
  const selected = work.find((row) => row.jcNo === jcNo)
  const current = rows(productionControl.productionDashboardRows).find(
    (row) => row.jcNo === jcNo
  )
  const remaining = selected
    ? Math.max(
        0,
        Number(selected.orderPcs) - (Number(selected.finalSetupGoodPieces) || 0)
      )
    : 0

  function invalidate() {
    setPlan(null)
    setError("")
    setMessage("")
  }

  async function run(action: "simulate" | "apply") {
    if (busy || !jcNo || !preferredDate) return
    setBusy(true)
    setError("")
    setMessage("")
    if (action === "simulate") setPlan(null)
    try {
      const response = await fetch("/api/urgent-delivery", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          jobCardNumber: jcNo,
          preferredDate,
          productionFloorCode: floor,
          ...(action === "apply" ? { fingerprint: plan?.fingerprint } : {}),
        }),
      })
      const body: {
        plan?: UrgentDeliveryPlan
        applied?: boolean
        error?: string
      } = await response.json()
      if (!response.ok || !body.plan)
        throw new Error(body.error || "Unable to complete this planning check.")
      setPlan(body.plan)
      if (body.applied) {
        setMessage(
          "Approved plan applied. Production planning is refreshing. Saved actions appear in Decision History."
        )
        setPlan(null)
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to complete this planning check."
      )
      if (action === "apply") setPlan(null)
    } finally {
      setBusy(false)
    }
  }

  function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run("simulate")
  }

  return (
    <div className="grid gap-4" aria-busy={busy}>
      <FormSection
        title="Delivery request"
        width="wide"
        description="Check a faster finish for the full remaining quantity. Planning changes only after you approve the proposed plan."
      >
        <form onSubmit={simulate} className="grid gap-4">
          <FieldGroup>
            <FormGrid>
              <Field>
                <FieldLabel htmlFor="urgent-search-by">Search by</FieldLabel>
                <NativeSelect
                  id="urgent-search-by"
                  value={searchBy}
                  disabled={busy}
                  onValueChange={(value) => {
                    setSearchBy(value)
                    setPartCode("")
                    setJcNo("")
                    invalidate()
                  }}
                >
                  <NativeSelectOption value="job">
                    Job Card Number
                  </NativeSelectOption>
                  <NativeSelectOption value="part">
                    Part Code
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              {searchBy === "part" ? (
                <Field>
                  <FieldLabel htmlFor="urgent-part">Part Code</FieldLabel>
                  <NativeSelect
                    id="urgent-part"
                    value={partCode}
                    disabled={busy}
                    searchPlaceholder="Search part code"
                    onValueChange={(value) => {
                      setPartCode(value)
                      setJcNo("")
                      invalidate()
                    }}
                  >
                    <NativeSelectOption value="">
                      Select Part Code
                    </NativeSelectOption>
                    {parts.map((part) => (
                      <NativeSelectOption key={part} value={part}>
                        {part}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="urgent-job">Job Card Number</FieldLabel>
                <NativeSelect
                  id="urgent-job"
                  value={jcNo}
                  disabled={busy || (searchBy === "part" && !partCode)}
                  searchPlaceholder="Search job card"
                  onValueChange={(value) => {
                    setJcNo(value)
                    invalidate()
                  }}
                >
                  <NativeSelectOption value="">
                    Select Job Card
                  </NativeSelectOption>
                  {jobs.map((job) => (
                    <NativeSelectOption
                      key={text(job.jcNo)}
                      value={text(job.jcNo)}
                    >
                      {text(job.jcNo)} · {text(job.partCode)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </FormGrid>
          </FieldGroup>
          {selected ? (
            <>
              <RecordDetails
                items={[
                  { label: "Part Code", value: text(selected.partCode) },
                  {
                    label: "Remaining quantity",
                    value: remaining.toLocaleString("en-IN") + " pcs",
                  },
                  {
                    label: "Current probable finish",
                    value: date(
                      plan?.currentFinish ||
                        current?.currentProbableDispatchDate
                    ),
                  },
                  {
                    label: "Raw material",
                    value: text(selected.rmStatus) || "Unknown",
                  },
                ]}
              />
              <FieldGroup>
                <Field className="max-w-xs">
                  <FieldLabel htmlFor="urgent-preferred-date">
                    Preferred finish date
                  </FieldLabel>
                  <Input
                    id="urgent-preferred-date"
                    type="date"
                    required
                    value={preferredDate}
                    disabled={busy}
                    onChange={(event) => {
                      setPreferredDate(event.target.value)
                      invalidate()
                    }}
                  />
                  <FieldDescription>
                    Machining completion. Allow separately for inspection,
                    packing and dispatch.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </>
          ) : null}
          <Button
            type="submit"
            className="w-fit"
            disabled={busy || !jcNo || !preferredDate}
          >
            {busy
              ? "Checking production…"
              : plan
                ? "Simulate again"
                : "Simulate"}
          </Button>
        </form>
      </FormSection>
      {busy ? (
        <StandardState
          variant="loading"
          title="Checking the production plan"
          description="Comparing queue positions, machine moves and parallel machines."
        />
      ) : null}
      {error ? (
        <StandardState
          variant="error"
          title="Plan could not be completed"
          description={error}
        />
      ) : null}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      {plan ? (
        <FormSection
          title="Proposed plan"
          description="Review the actions and affected jobs before approval."
        >
          <div className="grid gap-4">
            <StatusBadge
              value={
                plan.blockers.length
                  ? "Needs attention"
                  : plan.meetsDate
                    ? "Preferred date achievable"
                    : "Preferred date not reached"
              }
              tone={
                plan.blockers.length || !plan.meetsDate ? "warning" : "positive"
              }
            />
            <RecordDetails
              items={[
                {
                  label: "Current probable finish",
                  value: date(plan.currentFinish),
                },
                { label: "Preferred finish", value: date(plan.preferredDate) },
                {
                  label: "Proposed probable finish",
                  value: date(plan.proposedFinish),
                },
                {
                  label: "Quantity covered",
                  value: `${plan.remainingQuantity.toLocaleString("en-IN")} pcs (full balance)`,
                },
              ]}
            />
            {plan.blockers.length ? (
              <StandardState
                variant="error"
                title="Resolve before applying"
                description={plan.blockers.join(" ")}
              />
            ) : (
              <>
                {!plan.meetsDate ? (
                  <p className="text-sm">
                    The plans tested did not meet the preferred date. This is
                    the earliest finish found.
                  </p>
                ) : null}
                <div className="grid gap-2">
                  <h3 className="font-medium">Actions required</h3>
                  {!plan.priorityChange && !plan.actions.length ? (
                    <p className="text-sm">
                      {plan.meetsDate
                        ? "The current plan already meets the date. No changes needed."
                        : "No safe planning changes were found to improve the current finish."}
                    </p>
                  ) : (
                    <ul className="list-disc pl-5 text-sm">
                      {plan.priorityChange ? (
                        <li>
                          Bring this Job Card forward in idle machine queues.
                          Keep current setups running.
                        </li>
                      ) : null}
                      {plan.actions.map((action, index) => (
                        <li key={index}>
                          Setup {action.setupNumber}:{" "}
                          {action.assignmentMode === "move"
                            ? `move from ${action.fromMachineNumber} to ${action.toMachineNumber}`
                            : `add ${action.toMachineNumber} to run in parallel`}
                          . Keep current work on the target machine ahead of
                          this setup.
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Machine plan and quantities
                  </summary>
                  <OperationalTable filterStorageKey="urgent-delivery-machines">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Setup</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead>Remaining pcs</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>Finish</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plan.machines.map((machine, index) => (
                        <TableRow key={index}>
                          <TableCell>{machine.setup}</TableCell>
                          <TableCell>{machine.machine}</TableCell>
                          <TableCell>
                            {machine.remaining.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell>{date(machine.start)}</TableCell>
                          <TableCell>{date(machine.finish)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </OperationalTable>
                </details>
                <div className="grid gap-2">
                  <h3 className="font-medium">
                    Other jobs affected ({plan.impacts.length})
                  </h3>
                  {plan.impacts.length ? (
                    <OperationalTable filterStorageKey="urgent-delivery-impacts">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job Card</TableHead>
                          <TableHead>Part Code</TableHead>
                          <TableHead>Current finish</TableHead>
                          <TableHead>Revised finish</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plan.impacts.map((impact) => (
                          <TableRow key={impact.jobCardNumber}>
                            <TableCell>{impact.jobCardNumber}</TableCell>
                            <TableCell>{impact.partCode}</TableCell>
                            <TableCell>{date(impact.currentFinish)}</TableCell>
                            <TableCell>{date(impact.proposedFinish)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </OperationalTable>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No other Job Card finish dates change in this simulation.
                    </p>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Planning assumptions
                  </summary>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {plan.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </details>
                {plan.priorityChange || plan.actions.length ? (
                  <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void run("apply")}
                    >
                      Approve and Apply
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setPlan(null)}
                    >
                      Discard plan
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Production status is checked again before saving.
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </FormSection>
      ) : null}
    </div>
  )
}
