"use client"

import { useMemo, useState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  Calculator,
  Database,
  Factory,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  Plus,
  Settings2,
  ShieldCheck,
  Sigma,
  Trash2,
} from "lucide-react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  MetricCard,
  type MetricCardTone,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import {
  ChartCard,
  DashboardBarChart,
  DashboardEmptyState,
  DashboardGrid,
  PageHeader,
  DashboardSection,
} from "./dashboard/dashboard-components"
import type {
  PersonalDashboardWidget,
  PersonalDashboardWidgetId,
} from "../lib/personal-dashboard"
import type { PersonalDashboardMetrics } from "../lib/personal-dashboard-data"
import {
  dashboardMetricCatalog,
  evaluateDashboardFormula,
  type DashboardAnalyticsConfiguration,
  type DashboardAnalyticsWidget,
  type DashboardFormulaOperator,
  type DashboardMetricId,
  type DashboardMetricValues,
} from "../lib/dashboard-analytics"

const moduleIcons = {
  Administration: ShieldCheck,
  Costing: Calculator,
  "HR & Recruitment": BriefcaseBusiness,
  "Master Data": Database,
  Maintenance: Settings2,
  "Operational Entry": ListChecks,
  Production: Factory,
  Store: Boxes,
} as const

const moduleTones: Record<PersonalDashboardWidget["module"], MetricCardTone> = {
  Administration: "information",
  Costing: "accent",
  "HR & Recruitment": "information",
  "Master Data": "neutral",
  Maintenance: "brand",
  "Operational Entry": "brand",
  Production: "positive",
  Store: "warning",
}

export function PersonalDashboard({
  analytics,
  availableWidgets,
  availableMetricIds,
  metricValues,
  metrics,
  onSave,
  saved,
  selectedWidgetIds,
  userName,
}: {
  analytics: DashboardAnalyticsConfiguration
  availableWidgets: PersonalDashboardWidget[]
  availableMetricIds: DashboardMetricId[]
  metrics: PersonalDashboardMetrics
  metricValues: DashboardMetricValues
  onSave: (formData: FormData) => Promise<void>
  saved: boolean
  selectedWidgetIds: PersonalDashboardWidgetId[]
  userName: string
}) {
  const [selectedIds, setSelectedIds] =
    useState<PersonalDashboardWidgetId[]>(selectedWidgetIds)
  const [analyticsWidgets, setAnalyticsWidgets] = useState<
    DashboardAnalyticsWidget[]
  >(analytics.widgets)
  const availableById = useMemo(
    () => new Map(availableWidgets.map((widget) => [widget.id, widget])),
    [availableWidgets]
  )
  const orderedSelection = selectedIds.flatMap((id) => {
    const widget = availableById.get(id)
    return widget ? [widget] : []
  })

  function toggle(id: PersonalDashboardWidgetId) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    )
  }

  function move(id: PersonalDashboardWidgetId, direction: -1 | 1) {
    setSelectedIds((current) => {
      const index = current.indexOf(id)
      const destination = index + direction
      if (index < 0 || destination < 0 || destination >= current.length) {
        return current
      }
      const next = [...current]
      ;[next[index], next[destination]] = [next[destination]!, next[index]!]
      return next
    })
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings2 aria-hidden="true" /> Customize Dashboard
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
              <form action={onSave} className="grid gap-5">
                <DialogHeader>
                  <DialogTitle>Customize My Dashboard</DialogTitle>
                  <DialogDescription>
                    Choose cards you can access, then arrange their display
                    order.
                  </DialogDescription>
                </DialogHeader>
                <input
                  name="widgetIds"
                  type="hidden"
                  value={JSON.stringify(selectedIds)}
                />
                <input
                  name="analytics"
                  type="hidden"
                  value={JSON.stringify({
                    version: 1,
                    widgets: analyticsWidgets,
                  })}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableWidgets.map((widget) => (
                    <label
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40"
                      key={widget.id}
                    >
                      <Checkbox
                        checked={selectedIds.includes(widget.id)}
                        onCheckedChange={() => toggle(widget.id)}
                      />
                      <span className="grid gap-0.5">
                        <span className="font-medium">{widget.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {widget.module}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {orderedSelection.length ? (
                  <div className="grid gap-2">
                    <p className="text-sm font-medium">Display Order</p>
                    {orderedSelection.map((widget, index) => (
                      <div
                        className="flex items-center gap-2 rounded-lg border px-3 py-2"
                        key={widget.id}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {widget.title}
                        </span>
                        <Button
                          aria-label={"Move " + widget.title + " up"}
                          disabled={index === 0}
                          onClick={() => move(widget.id, -1)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          aria-label={"Move " + widget.title + " down"}
                          disabled={index === orderedSelection.length - 1}
                          onClick={() => move(widget.id, 1)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <AnalyticsBuilder
                  availableMetricIds={availableMetricIds}
                  onChange={setAnalyticsWidgets}
                  widgets={analyticsWidgets}
                />
                <DialogFooter>
                  <SaveButton />
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
        description={
          <>
            Welcome {userName}. Keep the information and shortcuts useful to
            your work here.
          </>
        }
        icon={LayoutDashboard}
        title="My Dashboard"
      />

      {saved ? (
        <Alert>
          <AlertDescription>Your dashboard has been saved.</AlertDescription>
        </Alert>
      ) : null}

      {analytics.widgets.length ? (
        <DashboardSection
          description="Pinned measures, comparisons, and your calculated KPIs."
          title="My Analytics"
        >
          <DashboardGrid columns="three">
            {analytics.widgets.map((widget) => (
              <AnalyticsWidgetCard
                key={widget.id}
                metricValues={metricValues}
                widget={widget}
              />
            ))}
          </DashboardGrid>
        </DashboardSection>
      ) : null}

      <DashboardSection
        description="Your selected modules, live summaries, and direct work shortcuts."
        title="My Workspace"
      >
        {orderedSelection.length ? (
          <DashboardGrid columns="three">
            {orderedSelection.map((widget) => (
              <DashboardCard
                key={widget.id}
                metrics={metrics[widget.id]}
                widget={widget}
              />
            ))}
          </DashboardGrid>
        ) : (
          <DashboardEmptyState
            description="Use Customize Dashboard to add the information and shortcuts you need."
            icon={LayoutDashboard}
            title="Your Dashboard Is Empty"
          />
        )}
      </DashboardSection>
    </div>
  )
}

function AnalyticsWidgetCard({
  metricValues,
  widget,
}: {
  metricValues: DashboardMetricValues
  widget: DashboardAnalyticsWidget
}) {
  if (widget.kind === "metric") {
    const definition = dashboardMetricCatalog[widget.metricId]
    const value = metricValues[widget.metricId]
    const unavailable = !Number.isFinite(value)
    return (
      <MetricCard
        description={definition.description}
        error={unavailable ? "Metric data is unavailable" : undefined}
        label={definition.title}
        tone={definition.tone}
        value={unavailable ? "—" : Number(value).toLocaleString("en-IN")}
      />
    )
  }

  if (widget.kind === "formula") {
    const result = evaluateDashboardFormula(widget, metricValues)
    const left = dashboardMetricCatalog[widget.leftMetricId]
    const right = dashboardMetricCatalog[widget.rightMetricId]
    const operator = {
      add: "+",
      percent: "÷",
      subtract: "−",
    }[widget.operator]
    return (
      <MetricCard
        description={left.title + " " + operator + " " + right.title}
        error={result.ok ? undefined : result.error}
        label={widget.title}
        tone="brand"
        unit={result.ok && result.format === "percent" ? "%" : undefined}
        value={
          result.ok
            ? result.value.toLocaleString("en-IN", {
                maximumFractionDigits: 2,
              })
            : "—"
        }
      />
    )
  }

  const rows = widget.metricIds.flatMap((metricId) => {
    const value = metricValues[metricId]
    return Number.isFinite(value)
      ? [
          {
            label: dashboardMetricCatalog[metricId].title,
            value: Number(value),
          },
        ]
      : []
  })
  return (
    <ChartCard
      description="Live comparison using the same canonical values as the source pages."
      empty={!rows.length}
      title={widget.title}
    >
      <DashboardBarChart rows={rows} />
    </ChartCard>
  )
}
function AnalyticsBuilder({
  availableMetricIds,
  onChange,
  widgets,
}: {
  availableMetricIds: DashboardMetricId[]
  onChange: (widgets: DashboardAnalyticsWidget[]) => void
  widgets: DashboardAnalyticsWidget[]
}) {
  const firstMetric = availableMetricIds[0] ?? ""
  const secondMetric = availableMetricIds[1] ?? firstMetric
  const [metricToAdd, setMetricToAdd] = useState<DashboardMetricId | "">(
    firstMetric
  )
  const [chartTitle, setChartTitle] = useState("")
  const [chartFirst, setChartFirst] = useState<DashboardMetricId | "">(
    firstMetric
  )
  const [chartSecond, setChartSecond] = useState<DashboardMetricId | "">(
    secondMetric
  )
  const [formulaTitle, setFormulaTitle] = useState("")
  const [formulaLeft, setFormulaLeft] = useState<DashboardMetricId | "">(
    firstMetric
  )
  const [formulaOperator, setFormulaOperator] =
    useState<DashboardFormulaOperator>("percent")
  const [formulaRight, setFormulaRight] = useState<DashboardMetricId | "">(
    secondMetric
  )
  const atLimit = widgets.length >= 24

  function addMetric() {
    if (!metricToAdd || atLimit) return
    if (
      widgets.some(
        (widget) => widget.kind === "metric" && widget.metricId === metricToAdd
      )
    ) {
      return
    }
    onChange([
      ...widgets,
      {
        id: `metric:${metricToAdd}`,
        kind: "metric",
        metricId: metricToAdd,
      },
    ])
  }

  function addChart() {
    if (!chartFirst || !chartSecond || chartFirst === chartSecond || atLimit) {
      return
    }
    const title =
      chartTitle.trim() ||
      dashboardMetricCatalog[chartFirst].title +
        " vs " +
        dashboardMetricCatalog[chartSecond].title
    onChange([
      ...widgets,
      {
        id: `chart:${crypto.randomUUID()}`,
        kind: "chart",
        metricIds: [chartFirst, chartSecond],
        title,
      },
    ])
    setChartTitle("")
  }

  function addFormula() {
    const title = formulaTitle.trim()
    if (!title || !formulaLeft || !formulaRight || atLimit) return
    onChange([
      ...widgets,
      {
        id: `formula:${crypto.randomUUID()}`,
        kind: "formula",
        leftMetricId: formulaLeft,
        operator: formulaOperator,
        rightMetricId: formulaRight,
        title,
      },
    ])
    setFormulaTitle("")
  }

  function moveWidget(id: string, direction: -1 | 1) {
    const index = widgets.findIndex((widget) => widget.id === id)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= widgets.length) return
    const next = [...widgets]
    ;[next[index], next[destination]] = [next[destination]!, next[index]!]
    onChange(next)
  }

  function removeWidget(id: string) {
    onChange(widgets.filter((widget) => widget.id !== id))
  }

  const metricOptions = availableMetricIds.map((metricId) => (
    <NativeSelectOption key={metricId} value={metricId}>
      {dashboardMetricCatalog[metricId].title}
    </NativeSelectOption>
  ))

  return (
    <section className="grid gap-4 border-t pt-4">
      <div>
        <h3 className="font-heading text-base font-semibold">
          Analytics Widgets
        </h3>
        <p className="text-sm text-muted-foreground">
          Add canonical KPIs, compare values in a chart, or calculate a KPI.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="grid content-start gap-3 rounded-lg border p-3">
          <div>
            <p className="font-medium">KPI Card</p>
            <p className="text-xs text-muted-foreground">Pin one live value.</p>
          </div>
          <Label htmlFor="dashboard-metric">Metric</Label>
          <NativeSelect
            className="w-full"
            id="dashboard-metric"
            onChange={(event) =>
              setMetricToAdd(event.target.value as DashboardMetricId)
            }
            value={metricToAdd}
          >
            {metricOptions}
          </NativeSelect>
          <Button
            disabled={!metricToAdd || atLimit}
            onClick={addMetric}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" /> Add KPI
          </Button>
        </div>

        <div className="grid content-start gap-3 rounded-lg border p-3">
          <div>
            <p className="font-medium">Comparison Chart</p>
            <p className="text-xs text-muted-foreground">
              Compare two compatible counts.
            </p>
          </div>
          <Label htmlFor="dashboard-chart-title">Title</Label>
          <Input
            id="dashboard-chart-title"
            maxLength={80}
            onChange={(event) => setChartTitle(event.target.value)}
            placeholder="Optional chart title"
            value={chartTitle}
          />
          <Label htmlFor="dashboard-chart-first">First metric</Label>
          <NativeSelect
            className="w-full"
            id="dashboard-chart-first"
            onChange={(event) =>
              setChartFirst(event.target.value as DashboardMetricId)
            }
            value={chartFirst}
          >
            {metricOptions}
          </NativeSelect>
          <Label htmlFor="dashboard-chart-second">Second metric</Label>
          <NativeSelect
            className="w-full"
            id="dashboard-chart-second"
            onChange={(event) =>
              setChartSecond(event.target.value as DashboardMetricId)
            }
            value={chartSecond}
          >
            {metricOptions}
          </NativeSelect>
          <Button
            disabled={
              !chartFirst ||
              !chartSecond ||
              chartFirst === chartSecond ||
              atLimit
            }
            onClick={addChart}
            type="button"
            variant="outline"
          >
            <BarChart3 aria-hidden="true" /> Add Chart
          </Button>
        </div>

        <div className="grid content-start gap-3 rounded-lg border p-3">
          <div>
            <p className="font-medium">Calculated KPI</p>
            <p className="text-xs text-muted-foreground">
              Use approved metrics; arbitrary code is never executed.
            </p>
          </div>
          <Label htmlFor="dashboard-formula-title">Title</Label>
          <Input
            id="dashboard-formula-title"
            maxLength={80}
            onChange={(event) => setFormulaTitle(event.target.value)}
            placeholder="Example: Order conversion"
            value={formulaTitle}
          />
          <Label htmlFor="dashboard-formula-left">First metric</Label>
          <NativeSelect
            className="w-full"
            id="dashboard-formula-left"
            onChange={(event) =>
              setFormulaLeft(event.target.value as DashboardMetricId)
            }
            value={formulaLeft}
          >
            {metricOptions}
          </NativeSelect>
          <Label htmlFor="dashboard-formula-operation">Operation</Label>
          <NativeSelect
            className="w-full"
            id="dashboard-formula-operation"
            onChange={(event) =>
              setFormulaOperator(event.target.value as DashboardFormulaOperator)
            }
            value={formulaOperator}
          >
            <NativeSelectOption value="add">Add</NativeSelectOption>
            <NativeSelectOption value="subtract">Subtract</NativeSelectOption>
            <NativeSelectOption value="percent">
              First as % of second
            </NativeSelectOption>
          </NativeSelect>
          <Label htmlFor="dashboard-formula-right">Second metric</Label>
          <NativeSelect
            className="w-full"
            id="dashboard-formula-right"
            onChange={(event) =>
              setFormulaRight(event.target.value as DashboardMetricId)
            }
            value={formulaRight}
          >
            {metricOptions}
          </NativeSelect>
          <Button
            disabled={
              !formulaTitle.trim() || !formulaLeft || !formulaRight || atLimit
            }
            onClick={addFormula}
            type="button"
            variant="outline"
          >
            <Sigma aria-hidden="true" /> Add Calculation
          </Button>
        </div>
      </div>

      {widgets.length ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Analytics Display Order</p>
          {widgets.map((widget, index) => {
            const title =
              widget.kind === "metric"
                ? dashboardMetricCatalog[widget.metricId].title
                : widget.title
            return (
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
                key={widget.id}
              >
                <Badge variant="outline">
                  {widget.kind === "metric"
                    ? "KPI"
                    : widget.kind === "chart"
                      ? "Chart"
                      : "Formula"}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <Button
                  aria-label={"Move " + title + " up"}
                  disabled={index === 0}
                  onClick={() => moveWidget(widget.id, -1)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  aria-label={"Move " + title + " down"}
                  disabled={index === widgets.length - 1}
                  onClick={() => moveWidget(widget.id, 1)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  aria-label={"Remove " + title}
                  onClick={() => removeWidget(widget.id)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No analytics selected. Add a KPI, chart, or calculation above.
        </p>
      )}
      {atLimit ? (
        <Alert>
          <AlertDescription>
            The dashboard is limited to 24 analytics widgets.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  )
}

function DashboardCard({
  metrics,
  widget,
}: {
  metrics?: PersonalDashboardMetrics[PersonalDashboardWidgetId]
  widget: PersonalDashboardWidget
}) {
  const Icon = moduleIcons[widget.module]
  const tone = moduleTones[widget.module]
  return (
    <SectionCard className="h-full">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--color-brand-tint)] text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <Badge variant="outline">{widget.module}</Badge>
        </div>
        <CardTitle>{widget.title}</CardTitle>
        <CardDescription>{widget.description}</CardDescription>
      </CardHeader>
      {metrics?.length ? (
        <CardContent className="grid grid-cols-3 gap-2 pt-1">
          {metrics.slice(0, 3).map((metric) => (
            <MetricCard
              className="min-h-20 p-3"
              key={metric.label}
              label={metric.label}
              tone={tone}
              value={metric.value}
            />
          ))}
        </CardContent>
      ) : null}
      <CardFooter className="mt-auto">
        <Button asChild className="w-full justify-between" variant="outline">
          <Link href={widget.href}>
            Open {widget.title} <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </SectionCard>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button disabled={pending} type="submit">
      {pending ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <Settings2 aria-hidden="true" />
      )}
      {pending ? "Saving" : "Save Dashboard"}
    </Button>
  )
}
