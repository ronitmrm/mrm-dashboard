"use client"

import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
 SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableRow,
} from "@workspace/ui/components/table"

import { calculateCosting, money } from "@/lib/pricing/costing"

const initialInputs = {
  alloyPremium: 20,
  burningLossPercent: 10,
  casting: 2,
  conversionRate: 80,
  extCost: 10,
  forgingCost: 5,
  overheadCost: 0,
  profitPercent: 20,
  rejectionPercent: 5,
  scrapRate: 100,
  weight100Pcs: 500,
}

type InputKey = keyof typeof initialInputs

const fields: { key: InputKey; label: string; suffix: string }[] = [
  { key: "weight100Pcs", label: "Weight Input", suffix: "g" },
  { key: "casting", label: "Casting Factor", suffix: "×" },
  { key: "scrapRate", label: "Scrap Rate", suffix: "INR/kg" },
  { key: "alloyPremium", label: "Alloy Premium", suffix: "INR/kg" },
  { key: "extCost", label: "Extrusion Cost", suffix: "INR/kg" },
  { key: "forgingCost", label: "Forging Cost", suffix: "INR/kg" },
  { key: "overheadCost", label: "Product Overhead", suffix: "INR/kg" },
  { key: "burningLossPercent", label: "Burning Loss", suffix: "%" },
  { key: "rejectionPercent", label: "Rejection", suffix: "%" },
  { key: "profitPercent", label: "Quote Profit", suffix: "%" },
  { key: "conversionRate", label: "Exchange Rate", suffix: "INR/USD" },
]

export function CostingCalculator() {
  const [inputs, setInputs] = useState(initialInputs)
  const result = useMemo(
    () =>
      calculateCosting(
        {
          annealing: 0,
          assemblyOperationCost: 0,
          buffing: 0,
          burningLossPercent: inputs.burningLossPercent / 100,
          casting: inputs.casting,
          checking: 0,
          deburring: 0,
          machiningCost: 0,
          marking: 0,
          overheadCost: inputs.overheadCost,
          plating: 0,
          rejectionPercent: inputs.rejectionPercent / 100,
          sealant: 0,
          washing: 0,
          weight100Pcs: inputs.weight100Pcs,
        },
        {
          alloyPremium: inputs.alloyPremium,
          assembledPartInr: 0,
          conversionRate: inputs.conversionRate,
          extCost: inputs.extCost,
          forgingCost: inputs.forgingCost,
          packingCost: 0,
          profitPercent: inputs.profitPercent / 100,
          purchaseTimes: 0,
          scrapRate: inputs.scrapRate,
          shippingCost: 0,
        }
      ),
    [inputs]
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
 <SectionCard>
        <CardHeader>
          <CardTitle>Audited Workbook Inputs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div className="grid gap-2" key={field.key}>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={field.key}>{field.label}</Label>
                <span className="text-xs text-muted-foreground">
                  {field.suffix}
                </span>
              </div>
              <Input
                id={field.key}
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setInputs((current) => ({
                    ...current,
                    [field.key]: Number(event.target.value) || 0,
                  }))
                }
                step="any"
                type="number"
                value={inputs[field.key]}
              />
            </div>
          ))}
        </CardContent>
 </SectionCard>
 <SectionCard>
        <CardHeader>
          <CardTitle>Calculation Trace</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Inr / Piece"
              value={money(result.totalRateInr, 4)}
            />
            <MetricCard
              label="Usd / Piece"
              value={money(result.rateUsd, 4)}
            />
          </div>
          <div className="overflow-hidden rounded-3xl border">
 <OperationalTable>
              <TableBody>
                {[
                  ["Pieces / Kg", result.piecesPerKg],
                  ["Net Rate Without Alloy", result.netRateWithoutAlloy],
                  ["Net Rate With Alloy", result.netRateWithAlloy],
                  ["Raw Material Cost", result.rawMaterialCost],
                  ["Scrap Return Price", result.scrapReturnPrice],
                  ["Total Rods Cost", result.totalRodsCost],
                  ["Rejection Cost", result.rejectionCost],
                  ["Total A", result.totalA],
                  ["Profit B", result.profitB],
                ].map(([label, value]) => (
                  <TableRow key={String(label)}>
                    <TableCell className="text-muted-foreground">
                      {label}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {money(Number(value), 4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
 </OperationalTable>
          </div>
          <Badge className="w-fit" variant="outline">
            Formula Regression Protected
          </Badge>
        </CardContent>
 </SectionCard>
    </div>
  )
}
