"use client"

import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Table,
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
  profitPercent: 20,
  rejectionPercent: 5,
  scrapRate: 100,
  weight100Pcs: 500,
}

type InputKey = keyof typeof initialInputs

const fields: { key: InputKey; label: string; suffix: string }[] = [
  { key: "weight100Pcs", label: "Weight input", suffix: "g" },
  { key: "casting", label: "Casting factor", suffix: "×" },
  { key: "scrapRate", label: "Scrap rate", suffix: "INR/kg" },
  { key: "alloyPremium", label: "Alloy premium", suffix: "INR/kg" },
  { key: "extCost", label: "Extrusion cost", suffix: "INR/kg" },
  { key: "forgingCost", label: "Forging cost", suffix: "INR/kg" },
  { key: "burningLossPercent", label: "Burning loss", suffix: "%" },
  { key: "rejectionPercent", label: "Rejection", suffix: "%" },
  { key: "profitPercent", label: "Quote profit", suffix: "%" },
  { key: "conversionRate", label: "Exchange rate", suffix: "INR/USD" },
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
          overheadCost: 0,
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
          overheadCost: 0,
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
      <Card>
        <CardHeader>
          <CardTitle>Audited workbook inputs</CardTitle>
          <CardDescription>
            This vertical slice runs the Pricing formula engine now owned by the
            canonical web app.
          </CardDescription>
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
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calculation trace</CardTitle>
          <CardDescription>
            Intermediate values remain visible for workbook reconciliation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">INR / piece</p>
              <p className="font-heading text-2xl font-medium">
                {money(result.totalRateInr, 4)}
              </p>
            </div>
            <div className="rounded-3xl bg-primary p-4 text-primary-foreground">
              <p className="text-xs opacity-70">USD / piece</p>
              <p className="font-heading text-2xl font-medium">
                {money(result.rateUsd, 4)}
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border">
            <Table>
              <TableBody>
                {[
                  ["Pieces / kg", result.piecesPerKg],
                  ["Net rate without alloy", result.netRateWithoutAlloy],
                  ["Net rate with alloy", result.netRateWithAlloy],
                  ["Raw material cost", result.rawMaterialCost],
                  ["Scrap return price", result.scrapReturnPrice],
                  ["Total rods cost", result.totalRodsCost],
                  ["Rejection cost", result.rejectionCost],
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
            </Table>
          </div>
          <Badge className="w-fit" variant="outline">
            Formula regression protected
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
}
