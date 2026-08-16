import type { ReactNode } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Eye,
  FilePenLine,
  ListPlus,
  RefreshCw,
  Route,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export type PlannerDecisionAction =
  | "priority"
  | "machine-unavailable"
  | "machine-switch"
  | "route-change"

export type PlannerDecisionView = "new" | "pending" | "history"

type PlannerDecisionPanels = {
  history: ReactNode
  machineUnavailable: ReactNode
  machineSwitch: ReactNode
  pending: ReactNode
  priority: ReactNode
  routeChange: ReactNode
}

type PlannerDecisionWorkspaceProps = {
  activeAction: PlannerDecisionAction | null
  activeView: PlannerDecisionView
  historyCount: number
  panels: PlannerDecisionPanels
  pendingCount: number
  onActionChange: (action: PlannerDecisionAction | null) => void
  onRecalculate: () => void
  onViewChange: (view: PlannerDecisionView) => void
}

const actionChoices = [
  {
    key: "priority",
    title: "Change Priority",
    description: "Bring an urgent item or job card forward after reviewing every setup.",
    detail: "Use for dispatch commitments and customer urgency.",
    icon: ListPlus,
  },
  {
    key: "machine-unavailable",
    title: "Machine Unavailable",
    description: "Record a breakdown, maintenance window, or quality hold.",
    detail: "Shift affected work or keep it delayed on the same machine.",
    icon: AlertTriangle,
  },
  {
    key: "machine-switch",
    title: "Move Setup",
    description: "Move one selected part and setup to a compatible machine.",
    detail: "Review both source and target machine queues first.",
    icon: ArrowRightLeft,
  },
  {
    key: "route-change",
    title: "Change Route",
    description: "Change the route for the remaining production quantity.",
    detail: "Select which remaining setups and quantities must be planned.",
    icon: Route,
  },
] as const satisfies ReadonlyArray<{
  key: PlannerDecisionAction
  title: string
  description: string
  detail: string
  icon: typeof ListPlus
}>

export function PlannerDecisionWorkspace({
  activeAction,
  activeView,
  historyCount,
  panels,
  pendingCount,
  onActionChange,
  onRecalculate,
  onViewChange,
}: PlannerDecisionWorkspaceProps) {
  const activeChoice = actionChoices.find((choice) => choice.key === activeAction)
  const activePanel = activeAction
    ? {
        priority: panels.priority,
        "machine-unavailable": panels.machineUnavailable,
        "machine-switch": panels.machineSwitch,
        "route-change": panels.routeChange,
      }[activeAction]
    : null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b bg-muted/15">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Planner Actions</CardTitle>
            <CardDescription>
              Make one planning decision at a time and review its effect before saving.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={onRecalculate}>
            <RefreshCw className="size-4" />
            Recalculate Plan
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Planner workspace">
          <Button
            type="button"
            role="tab"
            aria-selected={activeView === "new"}
            variant={activeView === "new" ? "default" : "outline"}
            onClick={() => onViewChange("new")}
          >
            New Action
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeView === "pending"}
            variant={activeView === "pending" ? "default" : "outline"}
            onClick={() => onViewChange("pending")}
          >
            Pending Review
            {pendingCount ? <Badge variant="secondary">{pendingCount}</Badge> : null}
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeView === "history"}
            variant={activeView === "history" ? "default" : "outline"}
            onClick={() => onViewChange("history")}
          >
            <Clock3 className="size-4" />
            Decision History
            {historyCount ? <Badge variant="secondary">{historyCount}</Badge> : null}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 @container/planner sm:p-5">
        {activeView === "new" && !activeAction ? (
          <div className="grid gap-4">
            <div>
              <div className="text-base font-semibold">What needs to change?</div>
              <div className="text-sm text-muted-foreground">
                Choose the situation. Only the information needed for that decision will open.
              </div>
            </div>
            <div className="grid gap-3 @3xl/planner:grid-cols-2">
              {actionChoices.map((choice) => {
                const Icon = choice.icon
                return (
                  <button
                    key={choice.key}
                    type="button"
                    className="group grid min-h-36 gap-3 rounded-lg border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onActionChange(choice.key)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <span className="text-xs font-medium text-primary">Open action</span>
                    </div>
                    <div>
                      <div className="font-semibold">{choice.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{choice.description}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{choice.detail}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        {activeView === "new" && activeChoice ? (
          <div className="grid gap-4" role="tabpanel" aria-label={activeChoice.title}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Button type="button" variant="ghost" className="-ml-3 mb-1" onClick={() => onActionChange(null)}>
                  <ArrowLeft className="size-4" />
                  Back to actions
                </Button>
                <div className="text-lg font-semibold">{activeChoice.title}</div>
                <div className="text-sm text-muted-foreground">{activeChoice.description}</div>
              </div>
              <Badge variant="outline">One decision in progress</Badge>
            </div>
            <div className="grid overflow-hidden rounded-lg border bg-muted/15 @3xl/planner:grid-cols-3">
              <DecisionStage icon={FilePenLine} label="1. Enter Details" description="Choose the affected job, machine, dates, or route." />
              <DecisionStage icon={Eye} label="2. Review Impact" description="Check interruptions, queue movement, and probable dates." />
              <DecisionStage icon={CheckCircle2} label="3. Confirm Decision" description="Resolve conflicts and apply the approved plan." />
            </div>
            <div className="min-w-0">{activePanel}</div>
          </div>
        ) : null}
        {activeView === "pending" ? (
          <div className="grid gap-4" role="tabpanel" aria-label="Pending review">
            <div>
              <div className="text-base font-semibold">Decisions needing attention</div>
              <div className="text-sm text-muted-foreground">
                Resolve conflicting planner choices and review active machine constraints in one place.
              </div>
            </div>
            {panels.pending}
          </div>
        ) : null}
        {activeView === "history" ? (
          <div className="grid gap-4" role="tabpanel" aria-label="Decision history">
            <div>
              <div className="text-base font-semibold">Decision history</div>
              <div className="text-sm text-muted-foreground">
                Review saved planner actions and their preserved audit trail.
              </div>
            </div>
            {panels.history}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DecisionStage({
  description,
  icon: Icon,
  label,
}: {
  description: string
  icon: typeof FilePenLine
  label: string
}) {
  return (
    <div className="flex gap-3 border-b p-3 last:border-b-0 @3xl/planner:border-r @3xl/planner:border-b-0 @3xl/planner:last:border-r-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-background text-primary shadow-xs">
        <Icon className="size-4" />
      </span>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}
