"use client"

import type { ReactNode } from "react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"

type FormType = "MAINTENANCE" | "COMPLETE"

export function StoreAssetMaintenanceSection({
  children,
  completionForm,
  maintenanceForm,
}: {
  children: ReactNode
  completionForm: ReactNode
  maintenanceForm: ReactNode
}) {
  const [activeForm, setActiveForm] = useState<FormType | null>(null)
  const availableForms = ([
    ["MAINTENANCE", maintenanceForm],
    ["COMPLETE", completionForm],
  ] as const).filter(([, form]) => form !== null)

  function formLabel(type: FormType) {
    if (type === "MAINTENANCE") return "Assign Maintenance Schedule"
    return "Complete Maintenance"
  }

  return (
    <SectionCard>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <CardTitle>Assigned Maintenance Schedules</CardTitle>
        {availableForms.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {availableForms.map(([scheduleType]) => (
              <Button
                aria-controls={activeForm === scheduleType ? "asset-maintenance-form" : undefined}
                aria-expanded={activeForm === scheduleType}
                key={scheduleType}
                onClick={() => setActiveForm((current) => current === scheduleType ? null : scheduleType)}
                size="sm"
                type="button"
                variant={activeForm === scheduleType ? "secondary" : "default"}
              >
                {formLabel(scheduleType)}
              </Button>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {activeForm && availableForms.some(([type]) => type === activeForm) ? (
          <section
            aria-label={formLabel(activeForm)}
            className="grid w-full max-w-2xl gap-4 rounded-lg border p-4"
            id="asset-maintenance-form"
          >
            <h3 className="font-semibold">{formLabel(activeForm)}</h3>
            {activeForm === "MAINTENANCE"
              ? maintenanceForm
              : completionForm}
          </section>
        ) : null}
        {children}
      </CardContent>
    </SectionCard>
  )
}

export function StoreAssetCalibrationScheduleSection({
  children,
  form,
  canAssign,
}: {
  children: ReactNode
  form: ReactNode
  canAssign: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <SectionCard>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <CardTitle>Assigned Calibration Schedules</CardTitle>
        {canAssign ? (
          <Button aria-expanded={open} onClick={() => setOpen((value) => !value)} size="sm" type="button" variant={open ? "secondary" : "default"}>
            {open ? "Close Entry" : "Assign Calibration Schedule"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {open && canAssign ? <div className="grid w-full max-w-2xl gap-4 rounded-lg border p-4">{form}</div> : null}
        {children}
      </CardContent>
    </SectionCard>
  )
}

export function StoreAssetAcquisitionSection({
  children,
}: {
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <SectionCard width="standard">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <CardTitle>Historical Acquisition</CardTitle>
        <Button
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          size="sm"
          type="button"
          variant={open ? "secondary" : "outline"}
        >
          {open ? "Close Entry" : "Record Supplier & Price"}
        </Button>
      </CardHeader>
      {open ? <CardContent>{children}</CardContent> : null}
    </SectionCard>
  )
}
