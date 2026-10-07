"use client"

import type { ReactNode } from "react"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

type WorkOrder = Record<string, unknown>
export type RouteChangeTargetMode = "jobCard" | "partCode"

const text = (value: unknown) => String(value ?? "").trim()

function PickerField({ children, label }: { children: ReactNode; label: string }) {
  return <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
  </Label>
}

export function RouteChangeTargetPicker({
  mode,
  onModeChange,
  onPartCodeChange,
  onTargetChange,
  partCode,
  target,
  workOrders,
}: {
  mode: RouteChangeTargetMode
  onModeChange: (mode: RouteChangeTargetMode) => void
  onPartCodeChange: (partCode: string) => void
  onTargetChange: (jobCard: string) => void
  partCode: string
  target: string
  workOrders: ReadonlyArray<WorkOrder>
}) {
  const partKey = partCode.trim().toLowerCase()
  const partJobCards = partKey
    ? workOrders.filter((row) => text(row.jcNo) && text(row.partCode).toLowerCase() === partKey)
    : []
  const partCodes = [...new Set(workOrders.map((row) => text(row.partCode)).filter(Boolean))]

  return <Tabs className="min-w-0" value={mode} onValueChange={(value) => onModeChange(value === "partCode" ? "partCode" : "jobCard")}>
    <TabsList aria-label="Find route change Job Card by" className="w-full">
      <TabsTrigger value="jobCard">Job Card</TabsTrigger>
      <TabsTrigger value="partCode">Part Code</TabsTrigger>
    </TabsList>
    <TabsContent value="jobCard" className="pt-2">
      <PickerField label="Job Card">
        <Input
          list="route-change-job-cards"
          value={target}
          placeholder="Select a Job Card"
          required
          onChange={(event) => onTargetChange(event.target.value)}
        />
      </PickerField>
      <datalist id="route-change-job-cards">
        {workOrders.filter((row) => text(row.jcNo)).map((row) => <option key={text(row.jcNo)} value={text(row.jcNo)} label={text(row.partCode)} />)}
      </datalist>
    </TabsContent>
    <TabsContent value="partCode" className="grid gap-2 pt-2">
      <PickerField label="Part Code">
        <Input
          list="route-change-part-codes"
          value={partCode}
          placeholder="Select a Part Code"
          required
          onChange={(event) => onPartCodeChange(event.target.value)}
        />
      </PickerField>
      <datalist id="route-change-part-codes">
        {partCodes.map((code) => <option key={code} value={code} />)}
      </datalist>
      <PickerField label="Job Card for this part">
        <SearchableSelect
          className="h-9 rounded-md border bg-background px-3 text-sm"
          disabled={!partJobCards.length}
          required
          value={target}
          onChange={(event) => onTargetChange(event.target.value)}
        >
          <option value="">Select Job Card</option>
          {partJobCards.map((row) => <option key={text(row.jcNo)} value={text(row.jcNo)}>
            {text(row.jcNo)}{text(row.fgPoNo) ? ` · FG PO ${text(row.fgPoNo)}` : ""}
          </option>)}
        </SearchableSelect>
      </PickerField>
    </TabsContent>
  </Tabs>
}
