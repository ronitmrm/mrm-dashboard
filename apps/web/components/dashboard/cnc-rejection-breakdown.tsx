import type { ReactNode } from "react"

import {
  CardDescription,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { PanelBody } from "./cnc-reference-controls"

type Rows = { label: string; value: number }[]

const number = new Intl.NumberFormat("en-IN").format
const section = "min-w-0 rounded-[20px] shadow-none"

function Breakdown({ rows, cause }: { rows: Rows; cause?: boolean }) {
  const maximum = Math.max(1, ...rows.map(({ value }) => value))
  return rows.length ? (
    <ul className="grid gap-4">
      {rows.map(({ label, value }) => (
        <li className="grid gap-1.5" key={label}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{label}</span>
            <b className="shrink-0 font-semibold">{number(value)} pcs</b>
          </div>
          <div
            aria-hidden="true"
            className="h-[7px] overflow-hidden rounded-full bg-[#edf1e4] dark:bg-primary/15"
          >
            <div
              className={cn(
                "h-full rounded-full",
                cause ? "bg-[#b8d446]" : "bg-primary"
              )}
              style={{ width: `${(100 * value) / maximum}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      No rejection recorded in this selection.
    </p>
  )
}

/** Defects + recorded causes cards, shared by the Quality and Production views. */
export function CncRejectionBreakdown({
  reasons,
  causes,
  rejected,
  shift,
  reasonsPin,
  causesPin,
}: {
  reasons: Rows
  causes: Rows
  rejected: number
  shift: string
  reasonsPin?: ReactNode
  causesPin?: ReactNode
}) {
  return (
    <div className="grid gap-[22px] lg:grid-cols-2">
      <SectionCard className={section}>
        <PanelBody
          action={
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-[var(--color-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-warning-text)]">
                {number(rejected)} pcs
              </span>
              {reasonsPin}
            </div>
          }
          heading={
            <div>
              <CardTitle className="text-xl">Defects recorded</CardTitle>
              <CardDescription>
                Rejected quantity by defect · {shift}
              </CardDescription>
            </div>
          }
        >
          <Breakdown rows={reasons} />
        </PanelBody>
      </SectionCard>
      <SectionCard className={section}>
        <PanelBody
          action={causesPin}
          heading={
            <div>
              <CardTitle className="text-xl">Recorded defect causes</CardTitle>
              <CardDescription>
                Causes entered against the rejection events
              </CardDescription>
            </div>
          }
        >
          <Breakdown rows={causes} cause />
        </PanelBody>
      </SectionCard>
    </div>
  )
}
