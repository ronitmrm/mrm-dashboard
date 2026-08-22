"use client"

import { useMemo, useState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Boxes,
  BriefcaseBusiness,
  Calculator,
  Database,
  Factory,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  Settings2,
  ShieldCheck,
} from "lucide-react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
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

import {
  DashboardEmptyState,
  DashboardGrid,
  DashboardPageHeader,
  DashboardSection,
} from "@/components/dashboard/dashboard-components"
import type {
  PersonalDashboardWidget,
  PersonalDashboardWidgetId,
} from "@/lib/personal-dashboard"
import type { PersonalDashboardMetrics } from "@/lib/personal-dashboard-data"

const moduleIcons = {
  Administration: ShieldCheck,
  Costing: Calculator,
  "HR & Recruitment": BriefcaseBusiness,
  "Master Data": Database,
  "Operational Entry": ListChecks,
  Production: Factory,
  Store: Boxes,
} as const

const moduleTones: Record<PersonalDashboardWidget["module"], MetricCardTone> = {
  Administration: "info",
  Costing: "accent",
  "HR & Recruitment": "info",
  "Master Data": "neutral",
  "Operational Entry": "brand",
  Production: "success",
  Store: "warning",
}

export function PersonalDashboard({
  availableWidgets,
  metrics,
  onSave,
  saved,
  selectedWidgetIds,
  userName,
}: {
  availableWidgets: PersonalDashboardWidget[]
  metrics: PersonalDashboardMetrics
  onSave: (formData: FormData) => Promise<void>
  saved: boolean
  selectedWidgetIds: PersonalDashboardWidgetId[]
  userName: string
}) {
  const [selectedIds, setSelectedIds] =
    useState<PersonalDashboardWidgetId[]>(selectedWidgetIds)
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
      <DashboardPageHeader
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings2 aria-hidden="true" /> Customize Dashboard
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
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
    <Card className="h-full">
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
          {metrics.map((metric) => (
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
    </Card>
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
