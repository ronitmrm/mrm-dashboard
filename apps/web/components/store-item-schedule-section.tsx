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

type ScheduleType = "MAINTENANCE" | "CALIBRATION"

export function StoreItemScheduleSection({
  canAssign,
  calibrationForm,
  children,
  maintenanceForm,
}: {
  canAssign: boolean
  calibrationForm: ReactNode
  children: ReactNode
  maintenanceForm: ReactNode
}) {
  const [activeForm, setActiveForm] = useState<ScheduleType | null>(null)

  return (
    <SectionCard>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <CardTitle>Assigned Maintenance & Calibration Schedules</CardTitle>
        {canAssign ? (
          <div className="flex flex-wrap items-center gap-2">
            {(["MAINTENANCE", "CALIBRATION"] as const).map((scheduleType) => (
              <Button
                aria-controls={activeForm === scheduleType ? "item-schedule-assignment-form" : undefined}
                aria-expanded={activeForm === scheduleType}
                key={scheduleType}
                onClick={() => setActiveForm((current) => current === scheduleType ? null : scheduleType)}
                size="sm"
                type="button"
                variant={activeForm === scheduleType ? "secondary" : "default"}
              >
                Assign {scheduleType === "MAINTENANCE" ? "Maintenance" : "Calibration"} Schedule
              </Button>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {canAssign && activeForm ? (
          <section
            aria-label={`Assign ${activeForm === "MAINTENANCE" ? "Maintenance" : "Calibration"} Schedule`}
            className="grid w-full max-w-2xl gap-4 rounded-lg border p-4"
            id="item-schedule-assignment-form"
          >
            <h3 className="font-semibold">
              Assign {activeForm === "MAINTENANCE" ? "Maintenance" : "Calibration"} Schedule
            </h3>
            {activeForm === "MAINTENANCE" ? maintenanceForm : calibrationForm}
          </section>
        ) : null}
        {children}
      </CardContent>
    </SectionCard>
  )
}
