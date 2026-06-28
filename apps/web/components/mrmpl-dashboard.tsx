"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Database,
  Factory,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Moon,
  PackageCheck,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Undo2,
  Wrench,
} from "lucide-react";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";

import {
  dateSortValue,
  formatNumber,
  formatPercent,
  jobCardScheduleSummary,
  toDashboardViewModel,
  type DashboardRankedRow,
  type DashboardTrendPoint,
} from "@/lib/dashboard-view-model";
import { machineFamilyKey } from "@/lib/planning-rules";
import { planningRefreshStatusMessage, shouldQueuePlanningRefresh } from "@/lib/planning-refresh-policy";
import { priorityPlanWindow, type PriorityPlanWindow } from "@/lib/priority-plan-scenarios";
import {
  applyShopFloorStatusPatches,
  shopFloorStatusPatchFromAction,
  upsertShopFloorStatusPatch,
  type ShopFloorStatusPatch,
} from "@/lib/shop-floor-optimistic";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type DashboardPayload = Record<string, unknown>;

type ActionStatus = {
  tone: "default" | "destructive";
  message: string;
} | null;

type DashboardApiResult = {
  message: string;
};

type DataEntrySpec = {
  entryType: string;
  title: string;
  description: string;
  fields: LegacyField[];
};

type DashboardTabId =
  | "productionControlTab"
  | "jobCardStatusTab"
  | "machineDetailTab"
  | "masterGapsTab"
  | "dataEntryTab"
  | "planningHolidayTab"
  | "planningControlTab"
  | "shopFloorStatusTab"
  | "shopFloorTasksTab"
  | "machinistTasksTab"
  | "qualityControlTasksTab"
  | "firstPieceInspectionTab"
  | "correctionsTab";

const navItems: Array<{ id: DashboardTabId; title: string; subtitle: string; icon: typeof LayoutDashboard }> = [
  { id: "productionControlTab", title: "Planner Actions", subtitle: "priority, route, dispatch", icon: ClipboardList },
  { id: "jobCardStatusTab", title: "Job Cards", subtitle: "running and completed", icon: PackageCheck },
  { id: "machineDetailTab", title: "Machine Detail", subtitle: "setup planning", icon: Factory },
  { id: "masterGapsTab", title: "Master Readiness", subtitle: "missing planning data", icon: Database },
  { id: "dataEntryTab", title: "Data Entry", subtitle: "imports and manual entry", icon: ListChecks },
  { id: "planningHolidayTab", title: "Planning Holidays", subtitle: "Friday shutdown, holidays", icon: CalendarDays },
  { id: "planningControlTab", title: "Planning Control", subtitle: "route and plan checks", icon: Route },
  { id: "shopFloorStatusTab", title: "Shop Floor Status", subtitle: "machine queue", icon: Factory },
  { id: "shopFloorTasksTab", title: "Shop Floor Tasks", subtitle: "raw material at machine", icon: PackageCheck },
  { id: "machinistTasksTab", title: "Machinist", subtitle: "pre setting, setting, start", icon: Wrench },
  { id: "qualityControlTasksTab", title: "Quality Control", subtitle: "setup approvals", icon: ShieldCheck },
  { id: "firstPieceInspectionTab", title: "First Piece Inspection", subtitle: "quality readings", icon: Gauge },
  { id: "correctionsTab", title: "Corrections", subtitle: "reverse wrong entries", icon: Undo2 },
];

const dataEntrySpecs: DataEntrySpec[] = [
  {
    entryType: "route",
    title: "Route master",
    description: "Part route, option, setup, and route-level machine details.",
    fields: [
      { name: "partNo", label: "Part no.", required: true },
      { name: "optionNumber", label: "Option no.", required: true },
      { name: "setupNo", label: "Setup no.", required: true },
      { name: "numberOfSetups", label: "No. of setup", type: "number" },
      { name: "setupName", label: "Setup name" },
      { name: "machineUsed", label: "Machine family" },
      { name: "machineType", label: "Machine type" },
      { name: "stageWeight", label: "Stage weight gram", type: "number", step: "0.01" },
      { name: "rodSize", label: "Rod size" },
      { name: "cuttingLength", label: "Cutting length" },
      { name: "finishedGoodsLength", label: "FG length" },
    ],
  },
  {
    entryType: "cycle",
    title: "Cycle time",
    description: "Setup cycle and loading/unloading timings used by planning.",
    fields: [
      { name: "partNo", label: "Part no.", required: true },
      { name: "optionNumber", label: "Option no.", required: true },
      { name: "setupNo", label: "Setup no.", required: true },
      { name: "setupName", label: "Setup name" },
      { name: "machineUsed", label: "Machine family" },
      { name: "operationWeight", label: "Operation weight gram", type: "number", step: "0.01" },
      { name: "cycleTime", label: "Cycle time sec", type: "number", step: "0.01", required: true },
      { name: "loadingUnloading", label: "Loading/unloading sec", type: "number", step: "0.01", required: true },
    ],
  },
  {
    entryType: "tooling",
    title: "Tooling",
    description: "Fixture, tooling, foam tool, and planning remarks.",
    fields: [
      { name: "partNo", label: "Part no.", required: true },
      { name: "optionNumber", label: "Option no.", required: true },
      { name: "setupNo", label: "Setup no.", required: true },
      { name: "setupName", label: "Setup name" },
      { name: "machineUsed", label: "Machine family" },
      { name: "fixture", label: "Fixture" },
      { name: "fixtureQty", label: "Fixture qty", type: "number" },
      { name: "tooling", label: "Tooling" },
      { name: "toolingQty", label: "Tooling qty", type: "number" },
      { name: "foamTool", label: "Foam tool" },
      { name: "foamToolQty", label: "Foam qty", type: "number" },
      { name: "remarks", label: "Remarks" },
    ],
  },
  {
    entryType: "work_order",
    title: "Work order",
    description: "JC, part, PO, RM inward, delivery, and priority metadata.",
    fields: [
      { name: "jcNo", label: "JC no.", required: true },
      { name: "partCode", label: "Part code", required: true },
      { name: "fgPoNo", label: "FG PO no." },
      { name: "rmPoNo", label: "RM PO no." },
      { name: "poDate", label: "PO date", type: "date" },
      { name: "orderPcs", label: "Order pcs", type: "number", required: true },
      { name: "orderKg", label: "Order kg", type: "number", step: "0.01" },
      { name: "numberOfSetups", label: "No. of setup", type: "number" },
      { name: "optionNumber", label: "Selected option" },
      { name: "rmInwardKg", label: "RM inward kg", type: "number", step: "0.01" },
      { name: "rmInwardDate", label: "RM inward date", type: "date" },
      { name: "deliveryDate", label: "Delivery date", type: "date" },
      { name: "plannerPriority", label: "Priority", options: ["", "Urgent", "High", "Low"], defaultValue: "" },
      { name: "description", label: "Description" },
      { name: "deliveryRemark", label: "Remark" },
    ],
  },
  {
    entryType: "rm_inward",
    title: "RM inward",
    description: "Raw-material inward status against job card.",
    fields: [
      { name: "jcNo", label: "JC no.", required: true },
      { name: "rmInwardDate", label: "RM inward date", type: "date", required: true },
      { name: "rmInwardKg", label: "RM inward kg", type: "number", step: "0.01" },
      { name: "status", label: "Status" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "employee",
    title: "Employee master",
    description: "Operator and shop-floor employee master data.",
    fields: [
      { name: "empId", label: "Emp ID", required: true },
      { name: "employeeType", label: "Employee type" },
      { name: "employeeName", label: "Employee name", required: true },
      { name: "location", label: "Location" },
      { name: "doj", label: "DOJ", type: "date" },
      { name: "terminatedDate", label: "Terminated date", type: "date" },
      { name: "status", label: "Status", options: ["Active", "Inactive", "Terminated"], defaultValue: "Active" },
    ],
  },
  {
    entryType: "machine_master",
    title: "Machine master",
    description: "Machine number, type, location, and active status used by planning and machine filters.",
    fields: [
      { name: "machineNo", label: "Machine no.", required: true },
      { name: "machineType", label: "Machine type", required: true },
      { name: "machineName", label: "Machine name" },
      { name: "location", label: "Location" },
      { name: "capacity", label: "Capacity", type: "number", step: "0.01" },
      { name: "status", label: "Status", options: ["Active", "Inactive", "Maintenance"], defaultValue: "Active" },
      { name: "remarks", label: "Remarks" },
    ],
  },
  {
    entryType: "planning_holiday",
    title: "Planning holiday",
    description: "Plant shutdown dates and vacation days that planning should skip.",
    fields: [
      { name: "date", label: "Holiday date", type: "date", required: true },
      { name: "reason", label: "Reason", options: ["Plant holiday", "Vacation", "Maintenance shutdown", "Other"], defaultValue: "Plant holiday" },
      { name: "scope", label: "Scope", options: ["Plant", "Machine", "Department"], defaultValue: "Plant" },
      { name: "machine", label: "Machine no." },
      { name: "department", label: "Department" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "first_piece_inspection_master",
    title: "First piece inspection master",
    description: "Dimension checklist used by quality approval for each part, option, and setup.",
    fields: [
      { name: "jcNo", label: "Job card number" },
      { name: "uid", label: "UID", required: true },
      { name: "optionNumber", label: "Option number", required: true },
      { name: "setupNo", label: "Setup number", required: true },
      { name: "description", label: "Description", required: true },
      { name: "specification", label: "Specification", required: true },
      { name: "instrumentUsed", label: "Instrument used" },
      { name: "tolerancePlus", label: "Tolerance +", type: "number", step: "0.001" },
      { name: "toleranceMinus", label: "Tolerance -", type: "number", step: "0.001" },
    ],
  },
  {
    entryType: "software_raw",
    title: "Software production output",
    description: "Daily production rows from the shop-floor software.",
    fields: [
      { name: "prodDate", label: "Production date", type: "date", required: true },
      { name: "operatorId", label: "Operator ID", required: true },
      { name: "operatorName", label: "Operator name" },
      { name: "machineType", label: "Machine type" },
      { name: "machine", label: "Machine no.", required: true },
      { name: "partCode", label: "Part code", required: true },
      { name: "jobCard", label: "JC no." },
      { name: "setupNo", label: "Setup no." },
      { name: "outputQty", label: "Output qty", type: "number", required: true },
      { name: "actualQty", label: "Actual qty", type: "number" },
      { name: "targetQty", label: "Target qty", type: "number" },
      { name: "rejectQty", label: "Reject qty", type: "number" },
      { name: "rejectionType", label: "Rejection type" },
      { name: "rejectionRemark", label: "Rejection remark" },
      { name: "downtimeMinutes", label: "Downtime minutes", type: "number" },
      { name: "downtimeReason", label: "Downtime reason" },
    ],
  },
];

const subscribeToHydration = () => () => {};
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

export function MrmplDashboard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [authCheckTimedOut, setAuthCheckTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setAuthCheckTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => setAuthCheckTimedOut(true), 4000);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  if (isLoading && !authCheckTimedOut) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <AuthScreen />;

  return <DashboardShell />;
}

function DashboardShell() {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("productionControlTab");
  const [preferredDataEntryType, setPreferredDataEntryType] = useState(dataEntrySpecs[0]?.entryType ?? "route");
  const [preferredDataEntryDefaults, setPreferredDataEntryDefaults] = useState<Record<string, unknown>>({});
  const [firstPieceInspectionTasks, setFirstPieceInspectionTasks] = useState<DashboardPayload[]>([]);
  const [optimisticShopFloorStatuses, setOptimisticShopFloorStatuses] = useState<ShopFloorStatusPatch[]>([]);
  const lastSnapshotUpdatedAtRef = useRef<string | undefined>(undefined);
  const [actionStatus, setActionStatus] = useState<ActionStatus>(null);
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);
  const dashboardPayload = useQuery(api.dashboard.snapshot, {});
  const refreshSnapshot = useAction(api.dashboard.refreshSnapshot);
  const saveRouteSelection = useMutation(api.dashboard.saveRouteSelection);
  const savePlannerPriority = useMutation(api.dashboard.savePlannerPriority);
  const saveMachineConstraint = useMutation(api.dashboard.saveMachineConstraint);
  const savePlanOverride = useMutation(api.dashboard.savePlanOverride);
  const saveRouteChange = useMutation(api.dashboard.saveRouteChange);
  const saveDispatchApproval = useMutation(api.dashboard.saveDispatchApproval);
  const markComplete = useMutation(api.dashboard.markComplete);
  const saveProductionEntry = useMutation(api.dashboard.saveProductionEntry);
  const saveDataEntry = useMutation(api.dashboard.saveDataEntry);
  const reverseEntry = useMutation(api.dashboard.reverseEntry);
  const correctionCandidates = useQuery(
    api.dashboard.correctionCandidates,
    activeTab === "correctionsTab" ? { limit: 200 } : "skip",
  );

  useEffect(() => {
    if (asRecord(dashboardPayload).cacheStatus === "missing") {
      void refreshSnapshot({});
    }
  }, [dashboardPayload, refreshSnapshot]);

  async function refreshDashboardSnapshot(force = true) {
    setIsRefreshingSnapshot(true);
    setActionStatus(null);
    try {
      const result = await refreshSnapshot({ force });
      setActionStatus({
        tone: "default",
        message: result.skipped
          ? "Planning is already up to date."
          : "Planning recalculated from latest data.",
      });
      if (!result.skipped) setOptimisticShopFloorStatuses([]);
    } catch (err) {
      setActionStatus({
        tone: "destructive",
        message: err instanceof Error ? err.message : "Snapshot refresh failed.",
      });
    } finally {
      setIsRefreshingSnapshot(false);
    }
  }

  async function submitAction(path: string, body: Record<string, unknown>) {
    setActionStatus(null);
    const queuePlanningRefresh = shouldQueuePlanningRefresh(path, body);
    try {
      const apiResult = path === "data-import"
        ? await postDashboardApi(path, body)
        : undefined;
      const message = apiResult?.message ?? (await runDashboardAction(path, body, {
            saveRouteSelection,
            savePlannerPriority,
            saveMachineConstraint,
            savePlanOverride,
            saveRouteChange,
            saveDispatchApproval,
            markComplete,
            saveProductionEntry,
            saveDataEntry,
            reverseEntry,
          }));
      const shopFloorPatch = shopFloorStatusPatchFromAction(path, body);
      if (shopFloorPatch) {
        setOptimisticShopFloorStatuses((current) => upsertShopFloorStatusPatch(current, shopFloorPatch));
      }
      setActionStatus({
        tone: "default",
        message: `${message} ${planningRefreshStatusMessage(queuePlanningRefresh)}`,
      });
      const returnTab = str(body.returnTab) as DashboardTabId;
      if (returnTab && navItems.some((item) => item.id === returnTab)) {
        setActiveTab(returnTab);
      }
    } catch (err) {
      setActionStatus({
        tone: "destructive",
        message: err instanceof Error ? err.message : "Action failed.",
      });
    }
  }

  function openDataEntry(entryType: string, defaults: Record<string, unknown> = {}) {
    setPreferredDataEntryType(entryType);
    setPreferredDataEntryDefaults(defaults);
    setActiveTab("dataEntryTab");
  }

  function openMasterReadiness() {
    setActiveTab("masterGapsTab");
  }

  function openFirstPieceInspection(row: DashboardPayload) {
    setFirstPieceInspectionTasks((openTasks) => {
      const key = shopFloorPlanKey(row);
      if (openTasks.some((task) => shopFloorPlanKey(task) === key)) return openTasks;
      return [...openTasks, row];
    });
    setActiveTab("firstPieceInspectionTab");
  }

  function closeFirstPieceInspection(row: DashboardPayload) {
    const key = shopFloorPlanKey(row);
    setFirstPieceInspectionTasks((openTasks) => openTasks.filter((task) => shopFloorPlanKey(task) !== key));
  }

  const isDashboardLoading = dashboardPayload === undefined;
  const basePayload = isDashboardLoading ? {} : asRecord(dashboardPayload);
  const snapshotUpdatedAt = str(basePayload.updatedAt);
  useEffect(() => {
    if (!snapshotUpdatedAt || lastSnapshotUpdatedAtRef.current === snapshotUpdatedAt) return;
    lastSnapshotUpdatedAtRef.current = snapshotUpdatedAt;
    setOptimisticShopFloorStatuses((current) => current.length ? [] : current);
  }, [snapshotUpdatedAt]);

  const payload = useMemo(
    () => applyShopFloorStatusPatches(basePayload, optimisticShopFloorStatuses),
    [basePayload, optimisticShopFloorStatuses],
  );
  const selectedTab = navItems.find((item) => item.id === activeTab) ?? navItems[0]!;

  const view = useMemo(
    () => toDashboardViewModel(payload),
    [payload],
  );

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "19rem",
          "--header-height": "4rem",
        } as React.CSSProperties
      }
    >
      <Sidebar variant="inset">
        <SidebarHeader>
          <div className="flex items-center px-2 py-2">
            <Image
              src="/mrm-green.svg"
              alt="MRMPL"
              width={792}
              height={176}
              priority
              className="h-8 w-auto max-w-full object-contain"
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Dashboard sections</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton isActive={item.id === activeTab} onClick={() => setActiveTab(item.id)}>
                      <item.icon />
                      <span className="grid">
                        <span>{item.title}</span>
                        <span className="text-xs font-normal text-muted-foreground">{item.subtitle}</span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-(--header-height) items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{selectedTab.title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {view.updatedAt ? `Updated ${formatDate(view.updatedAt)}` : "Live workbook snapshot"}
            </p>
          </div>
          <Badge variant="outline">
            {isDashboardLoading ? "Loading" : "Connected"}
          </Badge>
          <HeaderActions
            isRefreshingSnapshot={isRefreshingSnapshot}
            onRefreshSnapshot={() => void refreshDashboardSnapshot(true)}
          />
        </header>
        <main className="@container/main flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          {actionStatus ? (
            <Badge variant={actionStatus.tone === "destructive" ? "destructive" : "outline"} className="w-fit">
              {actionStatus.message}
            </Badge>
          ) : null}
          {isDashboardLoading ? (
            <DashboardSkeleton />
          ) : (
            <DashboardContent
              activeTab={activeTab}
              payload={payload}
              view={view}
              submitAction={submitAction}
              correctionCandidates={asArray(correctionCandidates)}
              openDataEntry={openDataEntry}
              openMasterReadiness={openMasterReadiness}
              openFirstPieceInspection={openFirstPieceInspection}
              closeFirstPieceInspection={closeFirstPieceInspection}
              firstPieceInspectionTasks={firstPieceInspectionTasks}
              preferredDataEntryType={preferredDataEntryType}
              preferredDataEntryDefaults={preferredDataEntryDefaults}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AuthLoadingScreen() {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>MRMPL Dashboard</CardTitle>
          <CardDescription>Checking your session</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-4/5" />
        </CardContent>
      </Card>
    </main>
  );
}

function AuthScreen() {
  const { signIn } = useAuthActions();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const isDark = mounted && resolvedTheme === "dark";
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [status, setStatus] = useState<ActionStatus>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      formData.set("flow", flow);
      await signIn("password", formData);
    } catch (err) {
      setStatus({
        tone: "destructive",
        message: err instanceof Error ? err.message : "Authentication failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <div className="flex items-start justify-between gap-3">
            <Image
              src="/mrm-green.svg"
              alt="MRMPL"
              width={792}
              height={176}
              priority
              className="h-10 w-auto max-w-48 object-contain"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
          <div>
            <CardTitle>{flow === "signIn" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription>Use your dashboard account to continue.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 rounded-lg border bg-background p-1">
            <Button type="button" variant={flow === "signIn" ? "secondary" : "ghost"} size="sm" onClick={() => setFlow("signIn")}>
              Sign in
            </Button>
            <Button type="button" variant={flow === "signUp" ? "secondary" : "ghost"} size="sm" onClick={() => setFlow("signUp")}>
              Sign up
            </Button>
          </div>
          <form className="grid gap-3" onSubmit={submit}>
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password">
              <Input
                name="password"
                type="password"
                autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                required
              />
            </Field>
            {status ? (
              <Badge variant={status.tone === "destructive" ? "destructive" : "outline"} className="w-fit">
                {status.message}
              </Badge>
            ) : null}
            <Button type="submit" disabled={isSubmitting}>
              {flow === "signIn" ? "Sign in" : "Sign up"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function HeaderActions({
  isRefreshingSnapshot,
  onRefreshSnapshot,
}: {
  isRefreshingSnapshot: boolean;
  onRefreshSnapshot: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={isRefreshingSnapshot}
        onClick={onRefreshSnapshot}
      >
        <RefreshCw className={`size-4${isRefreshingSnapshot ? " animate-spin" : ""}`} />
        <span className="hidden sm:inline">{isRefreshingSnapshot ? "Recalculating" : "Recalculate planning"}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
      {isAuthenticated ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      ) : null}
    </div>
  );
}

function DashboardContent({
  activeTab,
  payload,
  view,
  submitAction,
  correctionCandidates,
  openDataEntry,
  openMasterReadiness,
  openFirstPieceInspection,
  closeFirstPieceInspection,
  firstPieceInspectionTasks,
  preferredDataEntryType,
  preferredDataEntryDefaults,
}: {
  activeTab: DashboardTabId;
  payload: DashboardPayload;
  view: ReturnType<typeof toDashboardViewModel>;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  correctionCandidates: DashboardPayload[];
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void;
  openMasterReadiness: () => void;
  openFirstPieceInspection: (row: DashboardPayload) => void;
  closeFirstPieceInspection: (row: DashboardPayload) => void;
  firstPieceInspectionTasks: DashboardPayload[];
  preferredDataEntryType: string;
  preferredDataEntryDefaults: Record<string, unknown>;
}) {
  const productionControl = asRecord(payload.productionControl);

  if (activeTab === "jobCardStatusTab") {
    return <JobCardsPanel productionControl={productionControl} submitAction={submitAction} openMasterReadiness={openMasterReadiness} />;
  }

  if (activeTab === "machineDetailTab") {
    return <MachineDetailPanel productionControl={productionControl} />;
  }

  if (activeTab === "masterGapsTab") {
    return <MasterReadinessPanel productionControl={productionControl} submitAction={submitAction} openDataEntry={openDataEntry} />;
  }

  if (activeTab === "dataEntryTab") {
    return <DataEntryPanel payload={payload} submitAction={submitAction} preferredEntryType={preferredDataEntryType} preferredDefaults={preferredDataEntryDefaults} />;
  }

  if (activeTab === "planningHolidayTab") {
    return <PlanningHolidayPanel productionControl={productionControl} submitAction={submitAction} />;
  }

  if (activeTab === "planningControlTab") {
    return <PlanningControlPanel payload={payload} productionControl={productionControl} submitAction={submitAction} openDataEntry={openDataEntry} />;
  }

  if (activeTab === "shopFloorStatusTab") {
    return <ShopFloorStatusPanel productionControl={productionControl} submitAction={submitAction} />;
  }

  if (activeTab === "shopFloorTasksTab") {
    return <RoleTaskPanel productionControl={productionControl} submitAction={submitAction} role="shopFloor" />;
  }

  if (activeTab === "machinistTasksTab") {
    return <RoleTaskPanel productionControl={productionControl} submitAction={submitAction} role="machinist" />;
  }

  if (activeTab === "qualityControlTasksTab") {
    return <RoleTaskPanel productionControl={productionControl} submitAction={submitAction} role="quality" onStartFirstPieceInspection={openFirstPieceInspection} />;
  }

  if (activeTab === "firstPieceInspectionTab") {
    return (
      <FirstPieceInspectionPanel
        tasks={firstPieceInspectionTasks}
        productionControl={productionControl}
        submitAction={submitAction}
        openDataEntry={openDataEntry}
        onTaskComplete={closeFirstPieceInspection}
      />
    );
  }

  if (activeTab === "correctionsTab") {
    return <CorrectionsPanel rows={correctionCandidates} submitAction={submitAction} />;
  }

  return <ProductionControlPanel productionControl={productionControl} submitAction={submitAction} />;
}

function ProductionControlPanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <>
      <PlannerDecisionConsole productionControl={productionControl} submitAction={submitAction} />
      <ActionLogTable rows={asArray(productionControl.plannerActionLog)} />
      <section className="grid gap-4">
        <DataRowsCard title="Machine issues" rows={asArray(productionControl.machineConstraintRows)} empty="No machine constraints yet" />
      </section>
    </>
  );
}

function OverviewMetrics({ view }: { view: ReturnType<typeof toDashboardViewModel> }) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-6">
        {view.metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{metric.value}</CardTitle>
              <CardAction>
                <StatusIcon tone={metric.tone} />
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{metric.detail}</CardContent>
          </Card>
        ))}
      </section>
      <section className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Production trend</CardTitle>
            <CardDescription>Output, target, and rejection volume by month</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart points={view.trend} />
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function PlannerDecisionConsole({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Planner decision console</CardTitle>
        <CardDescription>Priority changes, machine breakdowns, part-specific machine switches, and mid-route changes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PlannerPriorityForm productionControl={productionControl} submitAction={submitAction} />
        <LegacyActionForm
          title="2. Machine unavailable / breakdown"
          description="Use when the machine itself cannot be used."
          fields={[
            { name: "machineNo", label: "Machine unavailable", placeholder: "ADB901", required: true },
            { name: "unavailableFrom", label: "From", type: "date" },
            { name: "unavailableTo", label: "To", type: "date" },
            {
              name: "rescheduleAction",
              label: "Plan action",
              options: ["shift_required", "shift_all", "delay"],
              defaultValue: "shift_required",
            },
            { name: "reason", label: "Reason", placeholder: "Breakdown / quality hold", required: true },
          ]}
          buttonLabel="Save machine issue"
          onSubmit={(body) => submitAction("machine-constraint", body)}
        />
        <LegacyActionForm
          title="3. Part-specific machine switch"
          description="Use when this job card or setup cannot run on the planned machine."
          fields={[
            { name: "target", label: "Switch job card / part", placeholder: "JC-007 or M71", required: true },
            { name: "setupNo", label: "Setup no.", placeholder: "20", required: true },
            { name: "fromMachine", label: "From machine", placeholder: "ADB901", required: true },
            { name: "toMachine", label: "Plan on machine", placeholder: "ADB902", required: true },
            { name: "reason", label: "Reason", placeholder: "Cannot set this part on planned machine", required: true },
          ]}
          buttonLabel="Switch plan"
          onSubmit={(body) => submitAction("plan-override", body)}
        />
        <RouteChangePlannerForm productionControl={productionControl} submitAction={submitAction} />
        <Button type="button" variant="outline" onClick={() => void submitAction("reschedule", {})}>
          <Settings2 className="size-4" />
          Reschedule
        </Button>
      </CardContent>
    </Card>
  );
}

function PlannerPriorityForm({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const workOrders = asArray(productionControl.workOrders);
  const itemOptions = useMemo(() => uniqueValues(workOrders.map(itemCode).filter((value) => value !== "-")), [workOrders]);
  const [partCode, setPartCode] = useState("");
  const [jcNo, setJcNo] = useState("");
  const [priority, setPriority] = useState("High");
  const [remark, setRemark] = useState("");
  const [planReady, setPlanReady] = useState(false);
  const [selectedInterruptions, setSelectedInterruptions] = useState<Record<string, boolean>>({});
  const [finishedQtyByInterruption, setFinishedQtyByInterruption] = useState<Record<string, string>>({});
  const [confirmedPrioritySteps, setConfirmedPrioritySteps] = useState<Record<string, boolean>>({});
  const jobCardOptions = useMemo(() => uniqueValues(workOrders
    .filter((row) => !partCode || machineKey(itemCode(row)) === machineKey(partCode))
    .map(jobCardNumber)
    .filter((value) => value !== "-")), [partCode, workOrders]);
  const selectedPart = partCode || itemOptions[0] || "";
  const selectedJc = jcNo && jobCardOptions.includes(jcNo) ? jcNo : "";
  const priorityPlan = useMemo(() => priorityChangePlan(productionControl, selectedPart, selectedJc), [productionControl, selectedPart, selectedJc]);
  const selectedBlockers = priorityPlan.steps
    .flatMap((step) => step.blockers)
    .filter((blocker) => selectedInterruptions[blocker.key]);
  const hasSelectedRunningWithoutQty = selectedBlockers.some((blocker) =>
    blocker.state === "running" && Number(finishedQtyByInterruption[blocker.key] || 0) <= 0,
  );
  const confirmedSteps = priorityPlan.steps.filter((step) => confirmedPrioritySteps[step.key]);
  const firstUnconfirmedStepIndex = priorityPlan.steps.findIndex((step) => !confirmedPrioritySteps[step.key]);
  const allStepsConfirmed = priorityPlan.steps.length > 0 && firstUnconfirmedStepIndex === -1;
  const activeStepIndex = allStepsConfirmed ? -1 : firstUnconfirmedStepIndex;
  const confirmedWindows = confirmedSteps.map((step) => priorityStepWindow(step, selectedInterruptions));
  const itemPlanWindow = allStepsConfirmed && confirmedWindows.length
    ? { startDate: confirmedWindows[0]?.startDate ?? "", endDate: confirmedWindows.at(-1)?.endDate ?? "" }
    : undefined;

  function resetPlanReview() {
    setPlanReady(false);
    setSelectedInterruptions({});
    setFinishedQtyByInterruption({});
    setConfirmedPrioritySteps({});
  }

  function confirmPriorityStep(stepKey: string) {
    setConfirmedPrioritySteps((current) => ({ ...current, [stepKey]: true }));
  }

  function editPriorityStep(stepKey: string) {
    const stepIndex = priorityPlan.steps.findIndex((step) => step.key === stepKey);
    if (stepIndex < 0) return;
    const keepKeys = new Set(priorityPlan.steps.slice(0, stepIndex).map((step) => step.key));
    const downstreamBlockerKeys = new Set(priorityPlan.steps
      .slice(stepIndex + 1)
      .flatMap((step) => step.blockers.map((blocker) => blocker.key)));
    setConfirmedPrioritySteps((current) => Object.fromEntries(
      Object.entries(current).filter(([key, confirmed]) => confirmed && keepKeys.has(key)),
    ));
    setSelectedInterruptions((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !downstreamBlockerKeys.has(key)),
    ));
    setFinishedQtyByInterruption((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !downstreamBlockerKeys.has(key)),
    ));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planReady) {
      setPlanReady(true);
      return;
    }
    if ((!selectedPart && !selectedJc) || hasSelectedRunningWithoutQty || !allStepsConfirmed) return;
    const interruptedSetups = selectedBlockers.map((blocker) => ({
      jcNo: blocker.jcNo,
      setupNo: blocker.setupNo,
      machine: blocker.machine,
      finishedQty: blocker.state === "running" ? Number(finishedQtyByInterruption[blocker.key] || 0) : undefined,
    }));
    const firstInterruption = interruptedSetups[0];
    const approvalMode = selectedBlockers.some((blocker) => blocker.state === "running")
      ? "allow_stop_running"
      : selectedBlockers.some((blocker) => blocker.state === "started_not_running")
        ? "allow_started_not_running"
        : "idle_queue_only";

    submitAction("planner-priority", {
      target: selectedJc || selectedPart,
      jcNo: selectedJc,
      partCode: selectedPart,
      priority,
      approvalMode,
      interruptedJcNo: firstInterruption?.jcNo || "",
      interruptedSetupNo: firstInterruption?.setupNo || "",
      interruptedMachine: firstInterruption?.machine || "",
      interruptedFinishedQty: firstInterruption?.finishedQty,
      interruptedSetups,
      remark,
    });
    setRemark("");
    resetPlanReview();
  }

  return (
    <form className="grid gap-3 rounded-xl border bg-background p-3" onSubmit={submit}>
      <div>
        <div className="text-sm font-medium">1. Priority change</div>
        <div className="text-xs text-muted-foreground">Review the setup-wise machine impact before applying a priority change.</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-4">
        <Field label="Item code">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={partCode}
            required
            onChange={(event) => {
              setPartCode(event.target.value);
              setJcNo("");
              resetPlanReview();
            }}
          >
            <option value="">Select item</option>
            {itemOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="JC number">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={jcNo}
            onChange={(event) => {
              setJcNo(event.target.value);
              resetPlanReview();
            }}
          >
            <option value="">All JCs for item</option>
            {jobCardOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value);
              resetPlanReview();
            }}
          >
            {["Urgent", "High", "Normal", "Low"].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Reason">
          <Input value={remark} placeholder="Customer urgent / dispatch commitment" onChange={(event) => setRemark(event.target.value)} />
        </Field>
      </div>

      {planReady ? (
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Probable priority plan</div>
              <div className="text-xs text-muted-foreground">{priorityPlan.steps.length} target setup{priorityPlan.steps.length === 1 ? "" : "s"} checked from the current machine queue.</div>
              <div className="text-xs text-muted-foreground">Confirm each setup in sequence. Later setup dates open only after the previous setup action is confirmed.</div>
            </div>
            <Button type="button" variant="outline" onClick={resetPlanReview}>Recheck inputs</Button>
          </div>
          {itemPlanWindow ? (
            <div className="grid gap-1 rounded-md border bg-background p-3">
              <div className="text-xs font-medium text-muted-foreground">Complete item plan</div>
              <div className="text-sm font-semibold">{itemPlanWindow.startDate || "-"} to {itemPlanWindow.endDate || "-"}</div>
            </div>
          ) : (
            <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
              Complete item dates will appear after all setup actions are confirmed.
            </div>
          )}
          {priorityPlan.steps.length ? (
            <div className="grid gap-2">
              {priorityPlan.steps.map((step, index) => (
                <PriorityPlanStepReview
                  key={step.key}
                  step={step}
                  state={confirmedPrioritySteps[step.key] ? "confirmed" : index === activeStepIndex ? "active" : "locked"}
                  previousSetupLabel={index > 0 ? `Setup ${priorityPlan.steps[index - 1]?.setupNo}` : ""}
                  selectedInterruptions={selectedInterruptions}
                  finishedQtyByInterruption={finishedQtyByInterruption}
                  setSelectedInterruptions={setSelectedInterruptions}
                  setFinishedQtyByInterruption={setFinishedQtyByInterruption}
                  onConfirm={() => confirmPriorityStep(step.key)}
                  onEdit={() => editPriorityStep(step.key)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">No planned setup was found for this item / JC in the current machine plan.</div>
          )}
          {hasSelectedRunningWithoutQty ? (
            <div className="text-xs text-destructive">Enter finished quantity for every running setup selected to stop.</div>
          ) : null}
        </div>
      ) : null}

      <Button className="w-fit" type="submit" disabled={planReady && (priorityPlan.steps.length === 0 || hasSelectedRunningWithoutQty || !allStepsConfirmed)}>
        <Wrench className="size-4" />
        {planReady ? "Apply confirmed priority" : "Show probable plan"}
      </Button>
    </form>
  );
}

function PriorityPlanStepReview({
  step,
  state,
  previousSetupLabel,
  selectedInterruptions,
  finishedQtyByInterruption,
  setSelectedInterruptions,
  setFinishedQtyByInterruption,
  onConfirm,
  onEdit,
}: {
  step: PriorityPlanStep;
  state: "active" | "confirmed" | "locked";
  previousSetupLabel: string;
  selectedInterruptions: Record<string, boolean>;
  finishedQtyByInterruption: Record<string, string>;
  setSelectedInterruptions: Dispatch<SetStateAction<Record<string, boolean>>>;
  setFinishedQtyByInterruption: Dispatch<SetStateAction<Record<string, string>>>;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const plannedWindow = priorityStepWindow(step, selectedInterruptions);
  const selectedRunningKeys = step.blockers
    .filter((blocker) => blocker.state === "running" && selectedInterruptions[blocker.key])
    .map((blocker) => blocker.key);
  const selectedRunningCount = selectedRunningKeys.length;
  const runningBlockerCount = step.blockers.filter((blocker) => blocker.state === "running").length;
  const selectedRunningWithoutQty = step.blockers.some((blocker) =>
    blocker.state === "running" && selectedInterruptions[blocker.key] && Number(finishedQtyByInterruption[blocker.key] || 0) <= 0,
  );
  const selectedStartedCount = step.blockers.filter((blocker) =>
    blocker.state === "started_not_running" && selectedInterruptions[blocker.key],
  ).length;
  const planMode = selectedRunningCount
    ? `Stop ${selectedRunningCount} running setup${selectedRunningCount === 1 ? "" : "s"}`
    : selectedStartedCount
      ? `Move ${selectedStartedCount} started setup${selectedStartedCount === 1 ? "" : "s"}`
      : "Do not stop running machine";

  return (
    <div className="grid gap-2 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{step.itemCode} / {step.jcNo} / Setup {step.setupNo}</div>
          <div className="text-xs text-muted-foreground">
            {state === "confirmed"
              ? `Confirmed on ${step.machine} - ${plannedWindow.startDate || "-"} to ${plannedWindow.endDate || "-"}`
              : `Target machine ${step.machine} - dates pending planner action`}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant={step.blockers.length ? "secondary" : "outline"}>{step.blockers.length ? step.blockers.length + " queue impact" : "No stop needed"}</Badge>
          {state === "confirmed" ? <Badge variant="outline">Confirmed</Badge> : null}
          {state === "locked" ? <Badge variant="outline">Locked</Badge> : null}
        </div>
      </div>

      {state === "locked" ? (
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          Confirm {previousSetupLabel || "the previous setup"} before planning this setup.
        </div>
      ) : null}

      {state === "confirmed" ? (
        <div className="grid gap-2">
          <PriorityScenarioCard
            title="Confirmed setup plan"
            window={plannedWindow}
            detail={planMode}
          />
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onEdit}>
            Edit setup action
          </Button>
        </div>
      ) : null}

      {state === "active" ? (
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          Choose the action for this setup, then confirm to calculate its planned start and end dates.
        </div>
      ) : null}

      {state === "active" && step.blockers.length ? (
        <div className="grid gap-2">
          {step.blockers.map((blocker) => {
            const selected = Boolean(selectedInterruptions[blocker.key]);
            return (
              <div key={blocker.key} className="grid gap-2 rounded-md border p-2 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="text-sm font-medium">{blocker.itemCode} / {blocker.jcNo} / Setup {blocker.setupNo}</div>
                  <div className="text-xs text-muted-foreground">{blocker.machine} - {blocker.startDate} to {blocker.endDate} - {blocker.label}</div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {blocker.requiresApproval ? (
                    <Button
                      type="button"
                      variant={selected ? "default" : "outline"}
                      onClick={() => setSelectedInterruptions((current) => ({ ...current, [blocker.key]: !selected }))}
                    >
                      {blocker.state === "running" ? (selected ? "Stop selected" : "Stop this setup") : (selected ? "Move approved" : "Approve queue move")}
                    </Button>
                  ) : (
                    <Badge variant="outline">Queue will move</Badge>
                  )}
                  {selected && blocker.state === "running" ? (
                    <Field label="Finished qty">
                      <Input
                        className="w-28"
                        min="0"
                        step="1"
                        type="number"
                        value={finishedQtyByInterruption[blocker.key] ?? ""}
                        required
                        onChange={(event) => setFinishedQtyByInterruption((current) => ({ ...current, [blocker.key]: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {state === "active" && selectedRunningWithoutQty ? (
        <div className="text-xs text-destructive">Enter finished quantity for every running setup selected to stop.</div>
      ) : null}

      {state === "active" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onConfirm} disabled={selectedRunningWithoutQty}>
            Confirm setup action
          </Button>
          <span className="text-xs text-muted-foreground">
            {runningBlockerCount ? "Leaving running blockers unselected keeps them running." : "No running setup blocks this target."}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PriorityScenarioCard({
  title,
  window,
  detail,
}: {
  title: string;
  window: PriorityPlanWindow;
  detail: string;
}) {
  return (
    <div className="grid gap-1 rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="text-sm font-semibold">{window.startDate || "-"} to {window.endDate || "-"}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function priorityStepWindow(step: PriorityPlanStep, selectedInterruptions: Record<string, boolean>) {
  return priorityPlanWindow({
    targetStartDate: step.startDate,
    targetEndDate: step.endDate,
    blockers: step.blockers,
    preemptedBlockerKeys: new Set(step.blockers
      .filter((blocker) => selectedInterruptions[blocker.key])
      .map((blocker) => blocker.key)),
  });
}

type PriorityPlanBlocker = {
  key: string;
  jcNo: string;
  itemCode: string;
  setupNo: string;
  machine: string;
  startDate: string;
  endDate: string;
  state: "running" | "started_not_running" | "queued";
  label: string;
  requiresApproval: boolean;
};

type PriorityPlanStep = {
  key: string;
  jcNo: string;
  itemCode: string;
  setupNo: string;
  machine: string;
  startDate: string;
  endDate: string;
  blockers: PriorityPlanBlocker[];
};

function priorityChangePlan(productionControl: DashboardPayload, partCode: string, jcNo: string): { steps: PriorityPlanStep[] } {
  const plannedRows = asArray(productionControl.machinePlanDetailRows).filter((row) => !shopFloorItemIsFinished(row));
  const targetPartKey = machineKey(partCode);
  const targetJcKey = machineKey(jcNo);
  const targetRows = plannedRows
    .filter((row) => !targetPartKey || machineKey(itemCode(row)) === targetPartKey)
    .filter((row) => !targetJcKey || machineKey(jobCardNumber(row)) === targetJcKey)
    .sort(jobCardSetupSort);

  return {
    steps: targetRows.map((targetRow) => {
      const targetMachine = machineValue(targetRow, "machine");
      const targetMachineKey = machineKey(targetMachine);
      const targetDate = dateSortValue(plannedSetupDate(targetRow));
      const blockers = plannedRows
        .filter((row) => priorityPlanRowKey(row) !== priorityPlanRowKey(targetRow))
        .filter((row) => machineKey(machineValue(row, "machine")) === targetMachineKey)
        .filter((row) => priorityPlanBlocksTarget(row, targetDate))
        .sort(machinePlanDisplaySort)
        .map(priorityPlanBlocker);
      return {
        key: priorityPlanRowKey(targetRow),
        jcNo: jobCardNumber(targetRow),
        itemCode: itemCode(targetRow),
        setupNo: displayValue(targetRow.setupNo),
        machine: targetMachine,
        startDate: displayValue(plannedSetupDate(targetRow)),
        endDate: displayValue(targetRow.plannedProductionEndDate || targetRow.endDate),
        blockers,
      };
    }),
  };
}

function priorityPlanBlocksTarget(row: DashboardPayload, targetDate: number) {
  const state = priorityPlanBlockerState(row);
  if (state === "running" || state === "started_not_running") return true;
  const rowDate = dateSortValue(plannedSetupDate(row));
  return rowDate <= targetDate;
}

function priorityPlanBlocker(row: DashboardPayload): PriorityPlanBlocker {
  const state = priorityPlanBlockerState(row);
  return {
    key: priorityPlanRowKey(row),
    jcNo: jobCardNumber(row),
    itemCode: itemCode(row),
    setupNo: displayValue(row.setupNo),
    machine: machineValue(row, "machine"),
    startDate: displayValue(plannedSetupDate(row)),
    endDate: displayValue(row.plannedProductionEndDate || row.endDate),
    state,
    label: state === "running" ? "Running now" : state === "started_not_running" ? "Started, not running" : "Planned before target",
    requiresApproval: state === "running" || state === "started_not_running",
  };
}

function priorityPlanBlockerState(row: DashboardPayload): PriorityPlanBlocker["state"] {
  if (shopFloorItemIsCurrent(row)) return "running";
  const runningStatus = str(row.runningStatus).toLowerCase();
  const stageIndex = shopFloorStageIndex(str(row.shopFloorStage));
  if (runningStatus === "setup complete" || stageIndex >= 0) return "started_not_running";
  return "queued";
}

function priorityPlanRowKey(row: DashboardPayload) {
  return [jobCardNumber(row), itemCode(row), displayValue(row.optionNumber), displayValue(row.setupNo), machineValue(row, "machine")]
    .map(machineKey)
    .join("|");
}

function RouteChangePlannerForm({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const workOrders = asArray(productionControl.workOrders);
  const routeRows = asArray(productionControl.routeMasterRows);
  const [target, setTarget] = useState("");
  const [newOption, setNewOption] = useState("");
  const [reason, setReason] = useState("");
  const [setupPlan, setSetupPlan] = useState<Record<string, { plan: boolean; quantity: string; remark: string }>>({});

  const selectedWorkOrder = useMemo(() => {
    const targetKey = target.toLowerCase();
    return workOrders.find((row) => str(row.jcNo).toLowerCase() === targetKey || str(row.partCode).toLowerCase() === targetKey);
  }, [target, workOrders]);
  const partCode = str(selectedWorkOrder?.partCode);
  const defaultOrderQty = str(selectedWorkOrder?.orderPcs);
  const optionRows = useMemo(() => routeRows.filter((row) => str(row.partNo).toLowerCase() === partCode.toLowerCase()), [partCode, routeRows]);
  const optionNumbers = useMemo(() => uniqueValues(optionRows.map((row) => str(row.optionNumber))), [optionRows]);
  const selectedOption = optionNumbers.includes(newOption) ? newOption : optionNumbers[0] || "";
  const selectedSetups = useMemo(() => optionRows
    .filter((row) => str(row.optionNumber) === selectedOption)
    .sort((a, b) => str(a.displaySetupNo || a.setupNo).localeCompare(str(b.displaySetupNo || b.setupNo), undefined, { numeric: true })), [optionRows, selectedOption]);
  const selectedSetupKey = selectedSetups.map((setup) => str(setup.displaySetupNo || setup.setupNo)).join("|");

  useEffect(() => {
    setSetupPlan((current) => {
      const next: Record<string, { plan: boolean; quantity: string; remark: string }> = {};
      for (const setup of selectedSetups) {
        const setupNo = str(setup.displaySetupNo || setup.setupNo);
        next[setupNo] = current[setupNo] ?? { plan: true, quantity: defaultOrderQty, remark: "" };
      }
      return next;
    });
  }, [selectedSetupKey, defaultOrderQty]);

  function updateSetup(setupNo: string, patch: Partial<{ plan: boolean; quantity: string; remark: string }>) {
    setSetupPlan((current) => ({
      ...current,
      [setupNo]: { ...(current[setupNo] ?? { plan: true, quantity: "", remark: "" }), ...patch },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const remainingSetups = selectedSetups.map((setup) => {
      const setupNo = str(setup.displaySetupNo || setup.setupNo);
      const state = setupPlan[setupNo] ?? { plan: false, quantity: "", remark: "" };
      return {
        setupNo,
        plan: state.plan,
        quantity: state.plan ? Number(state.quantity) || 0 : 0,
        remark: state.remark || undefined,
      };
    });
    await submitAction("route-change", {
      target,
      newOption: selectedOption,
      remainingSetups,
      reason,
    });
    setReason("");
  }

  return (
    <form className="grid gap-3 rounded-xl border bg-background p-3" onSubmit={submit}>
      <div>
        <div className="text-sm font-medium">4. Mid-route change</div>
        <div className="text-xs text-muted-foreground">Planner selects the new route option and enters remaining setup quantities.</div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Job card / part">
          <Input list="route-change-targets" value={target} placeholder="JC-003 or M6" required onChange={(event) => setTarget(event.target.value)} />
          <datalist id="route-change-targets">
            {workOrders.map((row) => (
              <option key={`${str(row.jcNo)}-${str(row.partCode)}`} value={str(row.jcNo)}>
                {str(row.partCode)}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="New route option">
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={selectedOption} required onChange={(event) => setNewOption(event.target.value)}>
            {optionNumbers.length ? optionNumbers.map((option) => (
              <option key={option} value={option}>{option}</option>
            )) : <option value="">Select job card first</option>}
          </select>
        </Field>
        <Field label="Reason">
          <Input value={reason} placeholder="Why route is changing" required onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Setup</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Qty to plan</TableHead>
              <TableHead>Remark</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedSetups.length ? selectedSetups.map((setup) => {
              const setupNo = str(setup.displaySetupNo || setup.setupNo);
              const state = setupPlan[setupNo] ?? { plan: true, quantity: str(selectedWorkOrder?.orderPcs), remark: "" };
              return (
                <TableRow key={setupNo}>
                  <TableCell>
                    <div className="font-medium">{setupNo}</div>
                    <div className="text-xs text-muted-foreground">{displayValue(setup.setupName)}</div>
                  </TableCell>
                  <TableCell>
                    <div>{displayValue(setup.machineUsed)}</div>
                    <div className="text-xs text-muted-foreground">{displayValue(setup.machineType)}</div>
                  </TableCell>
                  <TableCell>
                    <input
                      className="size-4"
                      type="checkbox"
                      checked={state.plan}
                      onChange={(event) => updateSetup(setupNo, { plan: event.target.checked })}
                      aria-label={`Plan setup ${setupNo}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-28"
                      type="number"
                      min="0"
                      step="1"
                      value={state.quantity}
                      disabled={!state.plan}
                      onChange={(event) => updateSetup(setupNo, { quantity: event.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input value={state.remark} placeholder="optional" onChange={(event) => updateSetup(setupNo, { remark: event.target.value })} />
                  </TableCell>
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Select a job card and route option to load setups.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Button className="w-fit" type="submit" disabled={!target || !selectedOption || !selectedSetups.length}>
        <Route className="size-4" />
        Save route change plan
      </Button>
    </form>
  );
}

function JobCardsPanel({
  productionControl,
  submitAction,
  openMasterReadiness,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  openMasterReadiness: () => void;
}) {
  return (
    <section className="grid gap-4">
      <JobCardTileBoard
        rows={asArray(productionControl.jobCardStatusTiles)}
        plannedRows={asArray(productionControl.machinePlanDetailRows)}
        machineRows={asArray(productionControl.machinePlanningRows)}
        actionNeededCount={asArray(productionControl.allWorkOrderGaps).length}
        openMasterReadiness={openMasterReadiness}
      />
      <Card>
        <CardHeader>
          <CardTitle>Job card actions</CardTitle>
          <CardDescription>Setup completion and dispatch approval actions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 @5xl/main:grid-cols-2">
          <LegacyActionForm
            title="Mark setup complete"
            description="Equivalent to the legacy running job-card completion action."
            fields={[
              { name: "jcNo", label: "Job card", placeholder: "JC-1001", required: true },
              { name: "setupNo", label: "Setup no.", placeholder: "10" },
              { name: "machine", label: "Machine", placeholder: "CNC-01" },
              { name: "completedBy", label: "Completed by", placeholder: "Name or code", required: true },
              { name: "remark", label: "Completion remark", placeholder: "Optional" },
            ]}
            buttonLabel="Mark complete"
            onSubmit={(body) => submitAction("mark-complete", body)}
          />
          <LegacyActionForm
            title="Dispatch approval"
            description="Only completed job cards should be approved for dispatch."
            fields={[
              { name: "jcNo", label: "Job card", placeholder: "JC-1001", required: true },
              { name: "approvedBy", label: "Approved by", placeholder: "Name or code", required: true },
              { name: "remark", label: "Dispatch remark", placeholder: "Optional" },
            ]}
            buttonLabel="Approve dispatch"
            onSubmit={(body) => submitAction("dispatch-approval", body)}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function MachineDetailPanel({
  productionControl,
}: {
  productionControl: DashboardPayload;
}) {
  return (
    <>
      <MachinePlanningBoard
        rows={asArray(productionControl.machinePlanningRows)}
        plannedRows={asArray(productionControl.machinePlanDetailRows)}
      />
      <section className="grid gap-4">
        <DataRowsCard title="Machine unavailable / breakdown" rows={asArray(productionControl.machineConstraintRows)} empty="No machine issues saved yet" />
      </section>
    </>
  );
}

type ShopFloorStageId =
  | "raw_material_at_machine"
  | "presetting"
  | "setting"
  | "quality_approval"
  | "operator_started"
  | "item_complete";

const shopFloorStages: Array<{ id: ShopFloorStageId; label: string; role: string; button: string }> = [
  { id: "raw_material_at_machine", label: "Raw material at the machine", role: "Shop floor", button: "RM at machine" },
  { id: "presetting", label: "Pre setting done", role: "Assistant machinist", button: "Pre setting done" },
  { id: "setting", label: "Setting done", role: "Assistant machinist", button: "Setting done" },
  { id: "quality_approval", label: "Quality approval", role: "Quality", button: "Quality approved" },
  { id: "operator_started", label: "Operator assigned and machine started", role: "Machinist", button: "Start machine" },
];

type RoleTaskKind = "shopFloor" | "machinist" | "quality";

const roleTaskCopy: Record<RoleTaskKind, { title: string; description: string; empty: string }> = {
  shopFloor: {
    title: "Shop Floor Tasks",
    description: "Items waiting for raw material to be placed at the planned machine.",
    empty: "No raw-material placement tasks are pending.",
  },
  machinist: {
    title: "Machinist Tasks",
    description: "Items waiting for pre setting, setting, or operator assignment after quality approval.",
    empty: "No machinist tasks are pending.",
  },
  quality: {
    title: "Quality Control Tasks",
    description: "Items waiting for quality approval after setting is complete.",
    empty: "No quality approval tasks are pending.",
  },
};

function ShopFloorStatusPanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [machineFilter, setMachineFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [currentFilter, setCurrentFilter] = useState("");
  const [nextFilter, setNextFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const plannedRows = asArray(productionControl.machinePlanDetailRows);
  const boardRows = useMemo(() => machineBoardRows(asArray(productionControl.machinePlanningRows), plannedRows), [plannedRows, productionControl.machinePlanningRows]);
  const plannedByMachine = useMemo(() => groupPlannedRowsByMachine(plannedRows), [plannedRows]);
  const machineOptions = useMemo(() => plannedMachineOptions(plannedRows, boardRows), [boardRows, plannedRows]);
  const locationOptions = useMemo(() => uniqueValues(boardRows.map(machineMasterLocationValue).filter((value) => value !== "-")), [boardRows]);
  const floorRows = useMemo(() => boardRows
    .map((machineRow) => {
      const machine = machineValue(machineRow, "machine");
      const plans = plannedByMachine.get(machineKey(machine)) ?? [];
      const current = currentShopFloorItem(plans);
      const next = nextShopFloorItem(plans, current);
      const status = shopFloorRowStatus(current, next);
      return { machineRow, machine, location: machineMasterLocationValue(machineRow), current, next, status };
    })
    .filter((row) =>
      typedFilterMatches(row.machine, machineFilter) &&
      typedFilterMatches(row.location, locationFilter) &&
      shopFloorItemMatchesFilter(row.current, currentFilter) &&
      shopFloorItemMatchesFilter(row.next, nextFilter) &&
      typedFilterMatches(row.status, statusFilter),
    ), [boardRows, currentFilter, locationFilter, machineFilter, nextFilter, plannedByMachine, statusFilter]);
  const currentOptions = useMemo(() => uniqueValues(floorRows.map((row) => row.current ? shopFloorItemLabel(row.current) : "Empty")), [floorRows]);
  const nextOptions = useMemo(() => uniqueValues(floorRows.map((row) => row.next ? shopFloorItemLabel(row.next) : "No plan")), [floorRows]);
  const statusOptions = useMemo(() => uniqueValues(floorRows.map((row) => row.status)), [floorRows]);
  const currentCount = floorRows.filter((row) => row.current).length;
  const nextCount = floorRows.filter((row) => row.next).length;
  const waitingSetupCount = floorRows.filter((row) => !row.current && row.next).length;

  async function saveStage(row: DashboardPayload, stage: ShopFloorStageId, extra: Record<string, unknown> = {}) {
    const stageSpec = shopFloorStages.find((item) => item.id === stage);
    const payload = {
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
      stage,
      stageLabel: stageSpec?.label ?? "Item complete",
      role: stageSpec?.role ?? "Shop floor",
      doneBy: "",
      worker: "",
      remark: "",
      completedAt: new Date().toISOString(),
      ...extra,
    };
    await submitAction("data-entry", {
      entryType: "shop_floor_status",
      key: dataEntryKey("shop_floor_status", payload),
      payload,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shop Floor Status</CardTitle>
        <CardDescription>Machine-wise current item and next planned setup for floor teams.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <TrackingSummary
          items={[
            ["Machines", formatNumber(floorRows.length)],
            ["Current running", formatNumber(currentCount)],
            ["Next planned", formatNumber(nextCount)],
            ["Needs setup", formatNumber(waitingSetupCount)],
          ]}
        />
        <ExcelStyleFilters
          filters={[
            {
              id: "shop-floor-status-machine",
              label: "Machine no.",
              value: machineFilter,
              placeholder: "Type or select machine",
              options: machineOptions,
              onChange: setMachineFilter,
            },
            {
              id: "shop-floor-status-location",
              label: "Master location",
              value: locationFilter,
              placeholder: "Type or select master location",
              options: locationOptions,
              onChange: setLocationFilter,
            },
            {
              id: "shop-floor-status-current",
              label: "Current item",
              value: currentFilter,
              placeholder: "Type or select current item",
              options: currentOptions,
              onChange: setCurrentFilter,
            },
            {
              id: "shop-floor-status-next",
              label: "Next item",
              value: nextFilter,
              placeholder: "Type or select next item",
              options: nextOptions,
              onChange: setNextFilter,
            },
            {
              id: "shop-floor-status-stage",
              label: "Status",
              value: statusFilter,
              placeholder: "Type or select status",
              options: statusOptions,
              onChange: setStatusFilter,
            },
          ]}
        />
        {floorRows.length ? (
          <div className="max-h-[72vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="min-w-32">Machine no.</TableHead>
                  <TableHead className="min-w-36">Master location</TableHead>
                  <TableHead className="min-w-64">Current item running</TableHead>
                  <TableHead className="min-w-64">Next item planned</TableHead>
                  <TableHead className="min-w-80">Status / action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {floorRows.map((row) => (
                  <TableRow key={row.machine} className={!row.current && row.next ? "bg-amber-50/45 dark:bg-amber-950/15" : ""}>
                    <TableCell className="align-middle">
                      <div className="font-semibold">{row.machine}</div>
                      <div className="text-xs text-muted-foreground">{machineValue(row.machineRow, "machineType")}</div>
                    </TableCell>
                    <TableCell className="align-middle text-sm">{row.location}</TableCell>
                    <TableCell className="align-middle">
                      {row.current ? (
                        <ShopFloorItemSummary row={row.current} tone="current" />
                      ) : (
                        <EmptyShopFloorSlot label={row.next ? "Setup required" : "No running item"} compact />
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      {row.next ? (
                        <ShopFloorItemSummary row={row.next} tone="next" />
                      ) : (
                        <EmptyShopFloorSlot label="No next plan" compact />
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      <ShopFloorRowAction current={row.current} next={row.next} onSaveStage={saveStage} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRowsMessage>No machines match the current filter</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  );
}

function RoleTaskPanel({
  productionControl,
  submitAction,
  openDataEntry,
  enableFirstPieceInspection = false,
  onStartFirstPieceInspection,
  role,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  openDataEntry?: (entryType: string, defaults?: Record<string, unknown>) => void;
  enableFirstPieceInspection?: boolean;
  onStartFirstPieceInspection?: (row: DashboardPayload) => void;
  role: RoleTaskKind;
}) {
  const [machineFilter, setMachineFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const copy = enableFirstPieceInspection
    ? {
        title: "First Piece Inspection",
        description: "Quality approval tasks that require a first-piece inspection report with five piece readings.",
        empty: "No first-piece inspection tasks are pending.",
      }
    : roleTaskCopy[role];
  const queueRows = useMemo(() => shopFloorQueueRows(productionControl), [productionControl]);
  const roleRows = useMemo(() => queueRows.filter((row) => roleTaskMatches(row, role)), [queueRows, role]);
  const filteredRows = useMemo(() => roleRows.filter((row) =>
    typedFilterMatches(row.machine, machineFilter) &&
    typedFilterMatches(row.location, locationFilter) &&
    shopFloorItemMatchesFilter(row.next, itemFilter) &&
    typedFilterMatches(pendingTaskLabel(row.next), taskFilter),
  ), [itemFilter, locationFilter, machineFilter, roleRows, taskFilter]);
  const machineOptions = useMemo(() => uniqueValues(roleRows.map((row) => row.machine)), [roleRows]);
  const locationOptions = useMemo(() => uniqueValues(roleRows.map((row) => row.location).filter((value) => value !== "-")), [roleRows]);
  const itemOptions = useMemo(() => uniqueValues(roleRows.map((row) => shopFloorItemLabel(row.next))), [roleRows]);
  const taskOptions = useMemo(() => uniqueValues(roleRows.map((row) => pendingTaskLabel(row.next))), [roleRows]);

  async function saveStage(row: DashboardPayload, stage: ShopFloorStageId, extra: Record<string, unknown> = {}) {
    const stageSpec = shopFloorStages.find((item) => item.id === stage);
    const payload = {
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
      stage,
      stageLabel: stageSpec?.label ?? "Item complete",
      role: stageSpec?.role ?? "Shop floor",
      doneBy: "",
      worker: "",
      remark: "",
      completedAt: new Date().toISOString(),
      ...extra,
    };
    await submitAction("data-entry", {
      entryType: "shop_floor_status",
      key: dataEntryKey("shop_floor_status", payload),
      payload,
    });
  }

  async function saveFirstPieceReport(row: DashboardPayload, report: DashboardPayload) {
    const payload = {
      ...report,
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
    };
    await submitAction("data-entry", {
      entryType: "first_piece_inspection_report",
      key: dataEntryKey("first_piece_inspection_report", payload),
      payload,
    });
  }

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TrackingSummary
            items={[
              ["Pending", formatNumber(filteredRows.length)],
              ["Machines", formatNumber(uniqueValues(filteredRows.map((row) => row.machine)).length)],
              ["Locations", formatNumber(uniqueValues(filteredRows.map((row) => row.location).filter((value) => value !== "-")).length)],
            ]}
          />
          <ExcelStyleFilters
            filters={[
              {
                id: `${role}-machine`,
                label: "Machine no.",
                value: machineFilter,
                placeholder: "Type or select machine",
                options: machineOptions,
                onChange: setMachineFilter,
              },
              {
                id: `${role}-location`,
                label: "Master location",
                value: locationFilter,
                placeholder: "Type or select master location",
                options: locationOptions,
                onChange: setLocationFilter,
              },
              {
                id: `${role}-item`,
                label: "Item setup",
                value: itemFilter,
                placeholder: "Type or select setup",
                options: itemOptions,
                onChange: setItemFilter,
              },
              {
                id: `${role}-task`,
                label: "Task",
                value: taskFilter,
                placeholder: "Type or select task",
                options: taskOptions,
                onChange: setTaskFilter,
              },
            ]}
          />
          {filteredRows.length ? (
            <div className="max-h-[72vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="min-w-32">Machine no.</TableHead>
                    <TableHead className="min-w-36">Master location</TableHead>
                    <TableHead className="min-w-72">Item setup</TableHead>
                    <TableHead className="min-w-52">Pending task</TableHead>
                    <TableHead className="min-w-80">Entry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={`${row.machine}-${shopFloorPlanKey(row.next)}`}>
                      <TableCell className="align-middle">
                        <div className="font-semibold">{row.machine}</div>
                        <div className="text-xs text-muted-foreground">{machineValue(row.machineRow, "machineType")}</div>
                      </TableCell>
                      <TableCell className="align-middle text-sm">{row.location}</TableCell>
                      <TableCell className="align-middle">
                        <ShopFloorItemSummary row={row.next} tone="next" />
                      </TableCell>
                      <TableCell className="align-middle">
                        <StatusBadge value={pendingTaskLabel(row.next)} />
                      </TableCell>
                      <TableCell className="align-middle">
                        {role === "quality" && onStartFirstPieceInspection ? (
                          <Button type="button" size="sm" onClick={() => onStartFirstPieceInspection(row.next)}>
                            <CheckCircle2 className="size-4" />
                            Start quality approval
                          </Button>
                        ) : (
                          <ShopFloorRowAction
                            next={row.next}
                            onSaveStage={saveStage}
                            onSaveFirstPieceReport={enableFirstPieceInspection ? saveFirstPieceReport : undefined}
                            inspectionMasters={enableFirstPieceInspection ? asArray(productionControl.firstPieceInspectionMasterRows) : []}
                            openDataEntry={enableFirstPieceInspection ? openDataEntry : undefined}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyRowsMessage>{copy.empty}</EmptyRowsMessage>
          )}
        </CardContent>
      </Card>
      {enableFirstPieceInspection ? (
        <>
          <DataRowsCard title="First piece inspection reports" rows={asArray(productionControl.firstPieceInspectionReportRows)} empty="No first-piece reports saved yet" />
          <DataRowsCard title="First piece inspection master" rows={asArray(productionControl.firstPieceInspectionMasterRows)} empty="No first-piece master dimensions saved yet" />
        </>
      ) : null}
    </section>
  );
}

function FirstPieceInspectionPanel({
  tasks,
  productionControl,
  submitAction,
  openDataEntry,
  onTaskComplete,
}: {
  tasks: DashboardPayload[];
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void;
  onTaskComplete: (row: DashboardPayload) => void;
}) {
  const masters = asArray(productionControl.firstPieceInspectionMasterRows);
  const [expandedTaskKey, setExpandedTaskKey] = useState(tasks[0] ? shopFloorPlanKey(tasks[0]) : "");

  useEffect(() => {
    if (!expandedTaskKey && tasks[0]) setExpandedTaskKey(shopFloorPlanKey(tasks[0]));
  }, [expandedTaskKey, tasks]);

  async function saveStage(row: DashboardPayload, stage: ShopFloorStageId, extra: Record<string, unknown> = {}) {
    const stageSpec = shopFloorStages.find((item) => item.id === stage);
    const payload = {
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
      stage,
      stageLabel: stageSpec?.label ?? "Item complete",
      role: stageSpec?.role ?? "Shop floor",
      doneBy: "",
      worker: "",
      remark: "",
      completedAt: new Date().toISOString(),
      ...extra,
    };
    await submitAction("data-entry", {
      entryType: "shop_floor_status",
      key: dataEntryKey("shop_floor_status", payload),
      payload,
    });
    if (stage === "quality_approval") onTaskComplete(row);
  }

  async function saveFirstPieceReport(row: DashboardPayload, report: DashboardPayload) {
    const payload = {
      ...report,
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
    };
    await submitAction("data-entry", {
      entryType: "first_piece_inspection_report",
      key: dataEntryKey("first_piece_inspection_report", payload),
      payload,
    });
  }

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>First Piece Inspection Report</CardTitle>
          <CardDescription>Open quality approval reports stay here until they are saved. Saving the report completes the quality approval task.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {tasks.length ? (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Job card</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Setup</TableHead>
                    <TableHead>Option</TableHead>
                    <TableHead>Task assigned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => {
                    const taskKey = shopFloorPlanKey(task);
                    const expanded = expandedTaskKey === taskKey;
                    return (
                      <Fragment key={taskKey}>
                        <TableRow className="cursor-pointer" onClick={() => setExpandedTaskKey(expanded ? "" : taskKey)}>
                          <TableCell>
                            <Button type="button" variant="ghost" size="sm" className="size-8 p-0" aria-label={expanded ? "Collapse report" : "Expand report"}>
                              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{itemCode(task)}</TableCell>
                          <TableCell>{jobCardNumber(task)}</TableCell>
                          <TableCell>{displayValue(task.machine)}</TableCell>
                          <TableCell>{displayValue(task.setupNo)}</TableCell>
                          <TableCell>{displayValue(task.optionNumber)}</TableCell>
                          <TableCell>{displayValue(task.shopFloorUpdatedAt)}</TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/15 p-4">
                              <ShopFloorRowAction
                                next={task}
                                onSaveStage={saveStage}
                                onSaveFirstPieceReport={saveFirstPieceReport}
                                inspectionMasters={masters}
                                openDataEntry={openDataEntry}
                              />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyRowsMessage>Start a quality approval task from the Quality Control tab to open its first-piece report.</EmptyRowsMessage>
          )}
        </CardContent>
      </Card>
      <DataRowsCard title="First piece inspection reports" rows={asArray(productionControl.firstPieceInspectionReportRows)} empty="No first-piece reports saved yet" />
    </section>
  );
}

function ShopFloorItemSummary({
  row,
  tone,
}: {
  row: DashboardPayload;
  tone: "current" | "next";
}) {
  const statusLabel = tone === "current" ? "Running" : (str(row.shopFloorStageLabel) || "Planned");
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{itemCode(row)}</span>
        <StatusBadge value={statusLabel} />
      </div>
      <div className="text-xs text-muted-foreground">{jobCardNumber(row)} | Setup {displayValue(row.setupNo)} | Option {displayValue(row.optionNumber)}</div>
      <div className="text-xs text-muted-foreground">Setup: {displayValue(row.setupPlannedDate || row.plannedDate)} | Production: {displayValue(row.plannedProductionStartDate)} - {displayValue(row.plannedProductionEndDate)}</div>
      <div className="text-xs text-muted-foreground">RM: {displayValue(row.rmStatus)}</div>
    </div>
  );
}

function ShopFloorRowAction({
  current,
  next,
  onSaveStage,
  onSaveFirstPieceReport,
  inspectionMasters = [],
  openDataEntry,
}: {
  current?: DashboardPayload;
  next?: DashboardPayload;
  onSaveStage: (row: DashboardPayload, stage: ShopFloorStageId, extra?: Record<string, unknown>) => Promise<void>;
  onSaveFirstPieceReport?: (row: DashboardPayload, report: DashboardPayload) => Promise<void>;
  inspectionMasters?: DashboardPayload[];
  openDataEntry?: (entryType: string, defaults?: Record<string, unknown>) => void;
}) {
  const [doneBy, setDoneBy] = useState("");
  const [worker, setWorker] = useState("");
  const [remark, setRemark] = useState("");
  const [inspectionReadings, setInspectionReadings] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const row = next ?? current;
  const stage = str(row?.shopFloorStage) as ShopFloorStageId;
  const stageIndex = shopFloorStageIndex(stage);
  const nextStage = next ? shopFloorStages.find((_, index) => index === stageIndex + 1) : undefined;
  const firstPieceMasters = useMemo(() => next && nextStage?.id === "quality_approval"
    ? matchingFirstPieceInspectionMasters(inspectionMasters, next)
    : [], [inspectionMasters, next, nextStage?.id]);
  const needsFirstPieceInspection = nextStage?.id === "quality_approval" && Boolean(onSaveFirstPieceReport);
  const canSubmitInspection = !needsFirstPieceInspection
    || (firstPieceMasters.length > 0 && firstPieceMasters.every((master) => firstPieceReadingsFor(inspectionReadings, master).every(Boolean)));

  function updateInspectionReading(master: DashboardPayload, pieceIndex: number, value: string) {
    const masterKey = firstPieceMasterKey(master);
    setInspectionReadings((currentReadings) => {
      const readings = [...(currentReadings[masterKey] ?? Array.from({ length: 5 }, () => ""))];
      readings[pieceIndex] = value;
      return { ...currentReadings, [masterKey]: readings };
    });
  }

  async function submitNextStage() {
    if (!next || !nextStage || isSubmitting) return;
    if (nextStage.id === "quality_approval" && !canSubmitInspection) return;
    setIsSubmitting(true);
    try {
      const taskCompletedAt = new Date().toISOString();
      const firstPieceInspection = needsFirstPieceInspection
        ? {
            reportId: firstPieceReportKey(next),
            taskAssignedAt: str(next.shopFloorUpdatedAt),
            taskCompletedAt,
            checkedPieces: 5,
            dimensions: firstPieceMasters.map((master) => ({
              uid: str(master.uid),
              description: str(master.description),
              instrumentUsed: str(master.instrumentUsed),
              specification: str(master.specification),
              tolerancePlus: optionalNumber(master.tolerancePlus),
              toleranceMinus: optionalNumber(master.toleranceMinus),
              readings: firstPieceReadingsFor(inspectionReadings, master).map((value) => optionalNumber(value) ?? value),
            })),
        }
        : undefined;
      if (needsFirstPieceInspection && firstPieceInspection && onSaveFirstPieceReport) {
        await onSaveFirstPieceReport(next, {
          ...firstPieceInspection,
          approvedBy: doneBy,
          remark,
        });
      }
      await onSaveStage(next, nextStage.id, {
        doneBy,
        worker: nextStage.id === "operator_started" ? worker : "",
        remark,
        firstPieceInspection,
      });
      setDoneBy("");
      setWorker("");
      setRemark("");
      setInspectionReadings({});
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitCurrentStageComplete() {
    if (!current || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSaveStage(current, "item_complete");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (current) {
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value="Running" />
          <span className="text-sm text-muted-foreground">Worker: {displayValue(current.shopFloorWorker)}</span>
        </div>
        <Button type="button" size="sm" variant="outline" className="w-fit" disabled={isSubmitting} onClick={() => void submitCurrentStageComplete()}>
          <CheckCircle2 className="size-4" />
          Item finished
        </Button>
      </div>
    );
  }

  if (!next) {
    return <span className="text-sm text-muted-foreground">No action pending</span>;
  }

  if (nextStage && next.shopFloorTaskReady === false) {
    return (
      <div className="grid gap-2">
        <ShopFloorProgress activeIndex={stageIndex} />
        <StatusBadge value="Task not ready" />
        <div className="text-sm text-muted-foreground">{displayValue(next.shopFloorTaskBlocker) || "Previous setup WIP buffer is not ready"}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <ShopFloorProgress activeIndex={stageIndex} />
      {nextStage ? (
        <>
          <div className="text-sm font-medium">{nextStage.label}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input className="h-8" value={doneBy} placeholder={`${nextStage.role} name/code`} onChange={(event) => setDoneBy(event.target.value)} />
            {nextStage.id === "operator_started" ? (
              <Input className="h-8" value={worker} placeholder="Worker name/code" onChange={(event) => setWorker(event.target.value)} />
            ) : (
              <Input className="h-8" value={remark} placeholder="Remark" onChange={(event) => setRemark(event.target.value)} />
            )}
          </div>
          {nextStage.id === "operator_started" ? (
            <Input className="h-8" value={remark} placeholder="Remark" onChange={(event) => setRemark(event.target.value)} />
          ) : null}
          {needsFirstPieceInspection ? (
            <FirstPieceInspectionForm
              row={next}
              masters={firstPieceMasters}
              readings={inspectionReadings}
              onReadingChange={updateInspectionReading}
              onAddMaster={openDataEntry}
            />
          ) : null}
          <Button type="button" size="sm" className="w-fit" disabled={!canSubmitInspection || isSubmitting} onClick={() => void submitNextStage()}>
            <CheckCircle2 className="size-4" />
            {nextStage.button}
          </Button>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Ready to start machine.</div>
      )}
    </div>
  );
}

function FirstPieceInspectionForm({
  row,
  masters,
  readings,
  onReadingChange,
  onAddMaster,
}: {
  row: DashboardPayload;
  masters: DashboardPayload[];
  readings: Record<string, string[]>;
  onReadingChange: (master: DashboardPayload, pieceIndex: number, value: string) => void;
  onAddMaster?: (entryType: string, defaults?: Record<string, unknown>) => void;
}) {
  const defaults = firstPieceMasterDefaults(row);
  if (!masters.length) {
    return (
      <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <div className="font-medium text-amber-900 dark:text-amber-100">First piece inspection master missing</div>
        <div className="text-amber-800 dark:text-amber-200">Add dimensions for this part, option, and setup before quality approval.</div>
        {onAddMaster ? (
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => onAddMaster("first_piece_inspection_master", defaults)}>
            Add inspection master
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">First piece inspection report</div>
          <div className="text-xs text-muted-foreground">Task assigned: {displayValue(row.shopFloorUpdatedAt)}</div>
        </div>
        {onAddMaster ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onAddMaster("first_piece_inspection_master", defaults)}>
            Add dimension
          </Button>
        ) : null}
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">Dimension</TableHead>
              <TableHead className="min-w-28">Instrument</TableHead>
              <TableHead className="min-w-28">Spec</TableHead>
              <TableHead className="min-w-24">Tol +</TableHead>
              <TableHead className="min-w-24">Tol -</TableHead>
              {[1, 2, 3, 4, 5].map((piece) => (
                <TableHead key={piece} className="min-w-24">P{piece}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {masters.map((master) => (
              <TableRow key={firstPieceMasterKey(master)}>
                <TableCell>
                  <div className="font-medium">{displayValue(master.uid)}</div>
                  <div className="text-xs text-muted-foreground">{displayValue(master.description)}</div>
                </TableCell>
                <TableCell>{displayValue(master.instrumentUsed)}</TableCell>
                <TableCell>{displayValue(master.specification)}</TableCell>
                <TableCell>{displayValue(master.tolerancePlus)}</TableCell>
                <TableCell>{displayValue(master.toleranceMinus)}</TableCell>
                {[0, 1, 2, 3, 4].map((pieceIndex) => (
                  <TableCell key={pieceIndex}>
                    <Input
                      className="h-8 min-w-20"
                      type="number"
                      step="0.001"
                      value={firstPieceReadingsFor(readings, master)[pieceIndex] ?? ""}
                      onChange={(event) => onReadingChange(master, pieceIndex, event.target.value)}
                      required
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ShopFloorProgress({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {shopFloorStages.map((stage, index) => {
        const done = index <= activeIndex;
        return (
          <Badge key={stage.id} variant="outline" className={done ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "text-muted-foreground"}>
            {index + 1}
          </Badge>
        );
      })}
    </div>
  );
}

function EmptyShopFloorSlot({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-dashed bg-muted/20 p-3 text-center text-sm text-muted-foreground ${compact ? "min-h-16" : "min-h-32"}`}>
      {label}
    </div>
  );
}

function MasterReadinessPanel({
  productionControl,
  submitAction,
  openDataEntry,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void;
}) {
  const masterGaps = asArray(productionControl.masterGaps);
  const allWorkOrderGaps = asArray(productionControl.allWorkOrderGaps);
  return (
    <section className="grid gap-4">
      <WorkOrderGapTable
        title="Production validation"
        description="Immediate attention: RM received and at least one planning gap exists."
        rows={masterGaps}
        submitAction={submitAction}
        openDataEntry={openDataEntry}
        showFilters={false}
      />
      <WorkOrderGapTable
        title="Whole work-order missing details"
        description="Planner view for every work order with missing route option, route master, cycle time, tooling, or machine master."
        rows={allWorkOrderGaps}
        submitAction={submitAction}
        openDataEntry={openDataEntry}
        showFilters
      />
    </section>
  );
}

function WorkOrderGapTable({
  title,
  description,
  rows,
  submitAction,
  openDataEntry,
  showFilters,
}: {
  title: string;
  description: string;
  rows: DashboardPayload[];
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void;
  showFilters: boolean;
}) {
  const [gapFilter, setGapFilter] = useState("all");
  const [rmFilter, setRmFilter] = useState("all");
  const filteredRows = rows.filter((row) => {
    const matchesGap = gapFilter === "all"
      || (gapFilter === "route_option" && Boolean(row.routeSelectionMissing))
      || (gapFilter === "route_master" && Boolean(row.routeMasterMissing))
      || (gapFilter === "cycle_time" && Boolean(row.cycleTimeMissing))
      || (gapFilter === "tooling" && Boolean(row.toolingPlanMissing))
      || (gapFilter === "machine_master" && Boolean(row.machineMasterMissing));
    const matchesRm = rmFilter === "all"
      || (rmFilter === "received" && str(row.rmStatus) === "Received")
      || (rmFilter === "waiting" && str(row.rmStatus) !== "Received");
    return matchesGap && matchesRm;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description} {formatNumber(filteredRows.length)} of {formatNumber(rows.length)} rows shown.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {showFilters ? (
          <div className="grid gap-3 md:grid-cols-2">
          <Field label="Gap type">
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={gapFilter} onChange={(event) => setGapFilter(event.target.value)}>
              <option value="all">All gaps</option>
              <option value="route_option">Route option missing</option>
              <option value="route_master">Route master missing</option>
              <option value="cycle_time">Cycle time missing</option>
              <option value="tooling">Tooling missing</option>
              <option value="machine_master">Machine master missing</option>
            </select>
          </Field>
          <Field label="RM status">
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={rmFilter} onChange={(event) => setRmFilter(event.target.value)}>
              <option value="all">All work orders</option>
              <option value="received">RM received</option>
              <option value="waiting">Waiting RM</option>
            </select>
          </Field>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job card</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>RM</TableHead>
                <TableHead>Missing details</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length ? (
                filteredRows.map((row, index) => (
                  <WorkOrderGapRow
                    key={`${title}-${jobCardNumber(row)}-${index}`}
                    row={row}
                    submitAction={submitAction}
                    openDataEntry={openDataEntry}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No work-order gaps match the selected filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkOrderGapRow({
  row,
  submitAction,
  openDataEntry,
}: {
  row: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void;
}) {
  const jcNo = str(row.jcNo || row.jobCard);
  const options = asArray(row.availableOptions);
  const gaps = workOrderGapLabels(row);

  async function submitRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const optionNumber = String(new FormData(event.currentTarget).get("optionNumber") || "").trim();
    if (!jcNo || !optionNumber) return;
    await submitAction("route-selection", { jcNo, optionNumber });
  }

  return (
    <TableRow>
      <TableCell className="min-w-32 font-medium">{jcNo || "-"}</TableCell>
      <TableCell className="min-w-40">
        <div>{itemCode(row)}</div>
        <div className="text-xs text-muted-foreground">{displayValue(row.description)}</div>
      </TableCell>
      <TableCell>{displayValue(row.rmStatus)}</TableCell>
      <TableCell className="min-w-44">
        <div className="flex flex-wrap gap-1.5">
          {gaps.map((gap) => (
            <Badge key={gap} variant="outline">{gap}</Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="min-w-80">
        <div className="grid gap-2">
          {row.routeSelectionMissing ? (
            <form className="grid gap-1.5" onSubmit={(event) => void submitRoute(event)}>
              <Label className="text-xs text-muted-foreground">Select option number</Label>
              <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_7.5rem]">
                <select className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm" name="optionNumber" defaultValue="" required>
                  <option value="">Select option</option>
                  {options.map((option, optionIndex) => {
                    const record = asRecord(option);
                    const value = str(record.optionNumber || record.option || option) || String(optionIndex + 1);
                    return (
                      <option key={`${jcNo}-${value}`} value={value}>
                        {routeOptionText(record, value)}
                      </option>
                    );
                  })}
                </select>
                <Button type="submit" size="sm" className="w-full">Save option</Button>
              </div>
            </form>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-4">
            {row.routeMasterMissing ? (
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openDataEntry("route", dataEntryDefaultsFromGap(row, "route"))}>Add routing</Button>
            ) : null}
            {row.cycleTimeMissing ? (
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openDataEntry("cycle", dataEntryDefaultsFromGap(row, "cycle"))}>Add cycle time</Button>
            ) : null}
            {row.toolingPlanMissing ? (
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openDataEntry("tooling", dataEntryDefaultsFromGap(row, "tooling"))}>Add tooling</Button>
            ) : null}
            {row.machineMasterMissing ? (
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openDataEntry("machine_master", dataEntryDefaultsFromGap(row, "machine_master"))}>Add machine</Button>
            ) : null}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function workOrderGapLabels(row: DashboardPayload) {
  return [
    row.routeSelectionMissing ? "Route option" : "",
    row.routeMasterMissing ? "Route master" : "",
    row.cycleTimeMissing ? "Cycle time" : "",
    row.toolingPlanMissing ? "Tooling" : "",
    row.machineMasterMissing ? "Machine master" : "",
  ].filter(Boolean);
}

function workOrderNeedsAction(row: DashboardPayload) {
  return Boolean(row.routeSelectionMissing || row.routeMasterMissing || row.cycleTimeMissing || row.toolingPlanMissing || row.machineMasterMissing);
}

function dataEntryDefaultsFromGap(row: DashboardPayload, entryType: "route" | "cycle" | "tooling" | "machine_master") {
  const optionNumber = str(row.optionNumber || row.selectedOption);
  const setupNo = str(row.missingSetupNo || row.setupNo);
  const setupName = str(row.setupName || row.missingSetupName);
  const machineUsed = str(row.machineUsed || row.routeMachine || row.machineFamily || row.machineType);
  if (entryType === "machine_master") {
    return {
      machineNo: "",
      machineType: str(row.machineType),
      status: "Active",
      remarks: machineUsed ? `Active machine required for route family ${machineUsed}` : "Active machine required for route family",
      __returnTab: "masterGapsTab",
    };
  }
  const defaults: Record<string, unknown> = {
    partNo: itemCode(row) !== "-" ? itemCode(row) : "",
    optionNumber: optionNumber && optionNumber !== "Not selected" ? optionNumber : "",
    setupNo,
    setupName,
    machineUsed,
  };

  if (entryType === "route") {
    return {
      ...defaults,
      machineType: str(row.machineType),
      numberOfSetups: str(row.numberOfSetups),
    };
  }

  if (entryType === "cycle") {
    return {
      ...defaults,
      operationWeight: row.operationWeight || row.stageWeight || "",
      cycleTime: "",
      loadingUnloading: "",
    };
  }

  return {
    ...defaults,
    fixture: "",
    fixtureQty: "",
    tooling: "",
    toolingQty: "",
    foamTool: "",
    foamToolQty: "",
    remarks: "",
  };
}

function setupChecklistEditDefaults(row: DashboardPayload) {
  const defaults = {
    __entryId: row._id,
    jcNo: row.jcNo,
    setupDate: row.setupDateValue || row.setupDate,
    machineNo: row.machine,
    partNo: row.partCode,
    optionNumber: row.optionNumber || row.plannedOptionNumber,
    setupNo: row.setupNo,
    shift: row.shift,
    setterCode: row.setterCode,
    helperCode: row.helperCode,
    settingStartTime: row.settingStartTime,
    settingEndTime: row.settingEndTime,
    qcController: row.qcController,
    rimmerAvailability: row.rimmerAvailability,
    modhiyu: row.modhiyu,
    remarks: row.remarks,
    __returnTab: "planningControlTab",
  };
  return {
    ...defaults,
    __entryKey: dataEntryKey("setup_checklist", defaults),
  };
}

function DataEntryPanel({
  payload,
  submitAction,
  preferredEntryType,
  preferredDefaults,
}: {
  payload: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  preferredEntryType: string;
  preferredDefaults: Record<string, unknown>;
}) {
  const dataEntry = asRecord(payload.dataEntry);
  const [bulkEntryType, setBulkEntryType] = useState(dataEntrySpecs[0]?.entryType ?? "route");

  useEffect(() => {
    if (preferredEntryType) setBulkEntryType(preferredEntryType);
  }, [preferredEntryType]);

  async function importEntryTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.name) return;
    const fileBase64 = await readFileAsDataUrl(file);
    await submitAction("data-import", { entryType: bulkEntryType, fileName: file.name, fileBase64 });
    if (typeof form.reset === "function") form.reset();
  }

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Production data entry</CardTitle>
          <CardDescription>Manual entries write through authenticated Convex mutations. Upload filled CSV templates here for small targeted imports; use the local script only for large full-workbook uploads.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="grid gap-3 @3xl/main:grid-cols-[220px_minmax(0,1fr)_auto]" onSubmit={importEntryTemplate}>
            <Field label="Entry type">
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={bulkEntryType}
                onChange={(event) => setBulkEntryType(event.target.value)}
              >
                {dataEntrySpecs.map((spec) => (
                  <option key={spec.entryType} value={spec.entryType}>
                    {spec.entryType.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Filled CSV template">
              <Input name="file" type="file" accept=".csv,text/csv" />
            </Field>
            <Button className="self-end" type="submit">Import CSV</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => downloadApi("data-template", bulkEntryType)}>
              Download template
            </Button>
            <Button type="button" variant="outline" onClick={() => downloadApi("data-export", bulkEntryType)}>
              Export current data
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = `/api/export-workbook?scope=${encodeURIComponent(bulkEntryType)}&t=${Date.now()}`;
              }}
            >
              Export selected data
            </Button>
          </div>
        </CardContent>
      </Card>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        {dataEntrySpecs.map((spec) => (
          <DataEntryForm key={spec.entryType} spec={spec} submitAction={submitAction} defaults={spec.entryType === bulkEntryType ? preferredDefaults : {}} />
        ))}
      </section>
      <DataRowsCard title="Data entry templates" rows={asArray(dataEntry.templates)} empty="No templates returned" />
      <DataRowsCard title="Data entry key summary" rows={asArray(dataEntry.keySummary)} empty="No entry summary returned" />
    </section>
  );
}

function PlanningHolidayPanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const spec = dataEntrySpecs.find((item) => item.entryType === "planning_holiday");
  const holidayRows = asArray(productionControl.planningHolidayRows);
  const calendar = asRecord(productionControl.planningCalendar);

  return (
    <section className="grid gap-4">
      <TrackingSummary
        items={[
          ["Weekly shutdown", displayValue(calendar.weeklyHoliday || "Friday")],
          ["Manual holidays", formatNumber(holidayRows.length)],
          ["Next saved date", nextPlanningHolidayLabel(holidayRows)],
        ]}
      />
      {spec ? (
        <DataEntryForm spec={spec} submitAction={submitAction} defaults={{ scope: "Plant", reason: "Plant holiday", __returnTab: "planningHolidayTab" }} />
      ) : null}
      <DataRowsCard title="Saved planning holidays" rows={holidayRows} empty="No manual planning holidays saved yet" />
    </section>
  );
}

function DataEntryForm({
  spec,
  submitAction,
  defaults,
}: {
  spec: DataEntrySpec;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  defaults: Record<string, unknown>;
}) {
  const defaultsKey = JSON.stringify(defaults);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
        <CardDescription>{spec.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <LegacyActionForm
          key={`${spec.entryType}-${defaultsKey}`}
          title={`Save ${spec.entryType.replaceAll("_", " ")}`}
          description="Writes the same entry type and payload shape used by the legacy form."
          fields={spec.fields}
          defaults={defaults}
          buttonLabel={`Save ${spec.title}`}
          onSubmit={(body) => void submitAction("data-entry", {
            entryType: spec.entryType,
            id: defaults.__entryId,
            key: defaults.__entryKey,
            returnTab: defaults.__returnTab,
            payload: body,
          })}
        />
      </CardContent>
    </Card>
  );
}

function PlanningControlPanel({
  payload,
  productionControl,
  submitAction,
  openDataEntry,
}: {
  payload: DashboardPayload;
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void;
}) {
  const toolFixtureNumbers = asRecord(payload.toolFixtureNumbers);

  return (
    <section className="grid gap-4">
      <PlannerWorkflowExceptionPanel rows={asArray(productionControl.workflowExceptionRows)} submitAction={submitAction} />
      <ToolFixturePanel rows={asArray(toolFixtureNumbers.rows)} />
    </section>
  );
}

function PlannerWorkflowExceptionPanel({
  rows,
  submitAction,
}: {
  rows: DashboardPayload[];
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  async function resolveWorkflow(row: DashboardPayload) {
    const payload = {
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
      stage: "operator_started",
      stageLabel: "Operator assigned and machine started",
      role: "Planner",
      doneBy: "Planner",
      worker: displayValue(row.shopFloorWorker) !== "-" ? displayValue(row.shopFloorWorker) : "",
      remark: "Resolved from raw production entry.",
      completedAt: new Date().toISOString(),
    };
    await submitAction("data-entry", {
      entryType: "shop_floor_status",
      key: dataEntryKey("shop_floor_status", payload),
      payload,
    });
  }

  return (
    <Card className={rows.length ? "border-amber-300/80" : ""}>
      <CardHeader>
        <CardTitle>Workflow exceptions</CardTitle>
        <CardDescription>
          Raw production exists, but the machinist task workflow has not recorded operator assignment and machine start.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead>Item setup</TableHead>
                  <TableHead>Raw production</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${shopFloorPlanKey(row)}-${index}`}>
                    <TableCell className="font-medium">{displayValue(row.machine)}</TableCell>
                    <TableCell>
                      <ShopFloorItemSummary row={row} tone="next" />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{formatNumber(numValue(row, "rawRows"))} row{numValue(row, "rawRows") === 1 ? "" : "s"}</div>
                      <div className="text-xs text-muted-foreground">Output {displayValue(row.rawOutputQty, true)} / Actual {displayValue(row.rawActualQty, true)}</div>
                    </TableCell>
                    <TableCell>
                      <Button type="button" size="sm" variant="outline" onClick={() => void resolveWorkflow(row)}>
                        <CheckCircle2 className="size-4" />
                        Resolve workflow
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRowsMessage>No workflow exceptions found</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  );
}

function CorrectionsPanel({
  rows,
  submitAction,
}: {
  rows: DashboardPayload[];
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [tableFilter, setTableFilter] = useState("");
  const [entryTypeFilter, setEntryTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [correctedBy, setCorrectedBy] = useState("Planner");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const tableOptions = useMemo(() => uniqueValues(rows.map((row) => displayValue(row.targetTable)).filter((value) => value !== "-")), [rows]);
  const entryTypeOptions = useMemo(() => uniqueValues(rows.map((row) => displayValue(row.entryType)).filter((value) => value !== "-")), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) =>
    typedFilterMatches(displayValue(row.targetTable), tableFilter) &&
    typedFilterMatches(displayValue(row.entryType), entryTypeFilter) &&
    correctionRowMatchesQuery(row, query),
  ), [entryTypeFilter, query, rows, tableFilter]);

  async function reverseRow(row: DashboardPayload) {
    const targetId = displayValue(row.targetId);
    const reason = str(reasonById[targetId]);
    await submitAction("reverse-entry", {
      targetTable: displayValue(row.targetTable),
      targetId,
      targetKey: displayValue(row.targetKey) !== "-" ? displayValue(row.targetKey) : "",
      targetLabel: displayValue(row.targetLabel) !== "-" ? displayValue(row.targetLabel) : "",
      reason,
      correctedBy,
    });
    setReasonById((current) => ({ ...current, [targetId]: "" }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Corrections</CardTitle>
        <CardDescription>Reverse wrong entries without deleting history. Reversed entries stop affecting live status and task queues.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <TrackingSummary
          items={[
            ["Active entries", formatNumber(filteredRows.length)],
            ["Modules", formatNumber(tableOptions.length)],
            ["Entry types", formatNumber(entryTypeOptions.length)],
          ]}
        />
        <div className="grid gap-3 @4xl/main:grid-cols-[minmax(0,1fr)_180px_220px_220px]">
          <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
            <span>Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} placeholder="Search entry, machine, job card, setup, remark..." onChange={(event) => setQuery(event.target.value)} />
            </div>
          </Label>
          <FilterSelect label="Module" value={tableFilter} onChange={setTableFilter} options={[["", "All modules"], ...tableOptions.map((value) => [value, value] as [string, string])]} />
          <FilterSelect label="Entry type" value={entryTypeFilter} onChange={setEntryTypeFilter} options={[["", "All entry types"], ...entryTypeOptions.map((value) => [value, value] as [string, string])]} />
          <Field label="Corrected by">
            <Input value={correctedBy} placeholder="Planner/admin name" onChange={(event) => setCorrectedBy(event.target.value)} />
          </Field>
        </div>
        {filteredRows.length ? (
          <div className="max-h-[72vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="min-w-44">Module</TableHead>
                  <TableHead className="min-w-80">Entry</TableHead>
                  <TableHead className="min-w-44">Created</TableHead>
                  <TableHead className="min-w-80">Reason</TableHead>
                  <TableHead className="min-w-36">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const targetId = displayValue(row.targetId);
                  const reason = reasonById[targetId] ?? "";
                  return (
                    <TableRow key={`${displayValue(row.targetTable)}-${targetId}`}>
                      <TableCell>
                        <div className="font-medium">{displayValue(row.targetTable)}</div>
                        <div className="text-xs text-muted-foreground">{displayValue(row.entryType)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{displayValue(row.targetLabel)}</div>
                        <div className="text-xs text-muted-foreground">{displayValue(row.targetKey)}</div>
                      </TableCell>
                      <TableCell>{displayValue(row.createdAt)}</TableCell>
                      <TableCell>
                        <Input value={reason} placeholder="Mandatory correction reason" onChange={(event) => setReasonById((current) => ({ ...current, [targetId]: event.target.value }))} />
                      </TableCell>
                      <TableCell>
                        <Button type="button" size="sm" variant="outline" onClick={() => void reverseRow(row)} disabled={!str(reason)}>
                          <Undo2 className="size-4" />
                          Reverse
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRowsMessage>No active entries match the current filters</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  );
}

function SetupChecklistPlannerReview({
  rows,
  openDataEntry,
}: {
  rows: DashboardPayload[];
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup checklist planner review</CardTitle>
        <CardDescription>
          Checklist entries that do not match planned setup by JC, part, option, setup, and machine. {formatNumber(rows.length)} row{rows.length === 1 ? "" : "s"} need review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Checklist entry</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Closest planned setup</TableHead>
                  <TableHead className="w-32">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${displayValue(row._id)}-${index}`}>
                    <TableCell>
                      <div className="grid gap-1">
                        <div className="font-medium">{displayValue(row.jcNo)} / {displayValue(row.partCode)}</div>
                        <div className="text-xs text-muted-foreground">
                          Option {displayValue(row.optionNumber)} | Setup {displayValue(row.setupNo)} | Machine {displayValue(row.machine)}
                        </div>
                        <div className="text-xs text-muted-foreground">{displayValue(row.setupDate)} | Setter {displayValue(row.setterCode)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-1">
                        <StatusBadge value={row.status} />
                        <div className="text-xs text-muted-foreground">{displayValue(row.nextAction)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {displayValue(row.plannedJobCard)} / {displayValue(row.plannedPartCode)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Option {displayValue(row.plannedOptionNumber)} | Setup {displayValue(row.plannedSetupNo)} | Machine {displayValue(row.plannedMachine)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button type="button" size="sm" variant="outline" onClick={() => openDataEntry("setup_checklist", setupChecklistEditDefaults(row))}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRowsMessage>No setup checklist mismatches found</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  );
}

function RouteSelectionQueue({
  title = "Route selection required",
  description,
  rows,
  submitAction,
}: {
  title?: string;
  description?: string;
  rows: DashboardPayload[];
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>, jcNo: string) {
    event.preventDefault();
    const optionNumber = String(new FormData(event.currentTarget).get("optionNumber") || "").trim();
    if (!jcNo || !optionNumber) return;
    await submitAction("route-selection", { jcNo, optionNumber });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description || (rows.length ? `${formatNumber(rows.length)} job cards need route decisions` : "No route decisions currently required")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="grid gap-3 @5xl/main:grid-cols-2">
            {rows.slice(0, 12).map((row, index) => {
              const jcNo = str(row.jcNo || row.jobCard);
              const options = asArray(row.availableOptions);
              const rawSelected = str(row.optionNumber || row.selectedOption);
              const selected = rawSelected && rawSelected !== "Not selected" ? rawSelected : "";
              return (
                <form
                  key={`${jcNo || "route"}-${index}`}
                  className="grid gap-3 rounded-xl border p-3"
                  onSubmit={(event) => void submit(event, jcNo)}
                >
                  <div>
                    <div className="font-medium">{jcNo || "Unassigned job card"}</div>
                    <div className="text-xs text-muted-foreground">
                      {[row.partCode, row.description, row.deliveryDate].map(str).filter(Boolean).join(" · ") || "Route master pending"}
                    </div>
                  </div>
                  <Field label="Route option">
                    <select className="h-9 rounded-md border bg-background px-3 text-sm" name="optionNumber" defaultValue={selected} required>
                      <option value="">Select option</option>
                      {options.length ? (
                        options.map((option, optionIndex) => {
                          const record = asRecord(option);
                          const value = str(record.optionNumber || record.option || option) || String(optionIndex + 1);
                          return (
                            <option key={`${jcNo}-${value}`} value={value}>
                              {routeOptionText(record, value)}
                            </option>
                          );
                        })
                      ) : (
                        <option value={selected || "1"}>{selected || "1"}</option>
                      )}
                    </select>
                  </Field>
                  <Button className="w-fit" type="submit">Save route</Button>
                </form>
              );
            })}
          </div>
        ) : (
          <div className="grid h-28 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
            No route selections currently required
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ShopFloorPanel({
  payload,
  view,
  submitAction,
}: {
  payload: DashboardPayload;
  view: ReturnType<typeof toDashboardViewModel>;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const meetingTracker = asRecord(payload.meetingTracker);

  return (
    <>
      <OverviewMetrics view={view} />
      <InsightCards payload={payload} />
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <OperatorEfficiencyBenchmark rows={asArray(payload.operatorPerformance)} />
        <AttendanceBenchmark rows={asArray(payload.attendance)} scope={str(asRecord(payload.summary).attendanceScope)} />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-3">
        <RankedList title="Parts" rows={view.parts} icon={Boxes} empty="No part data yet" />
        <RankedList title="Rejections" rows={view.rejections} icon={AlertTriangle} empty="No rejection data yet" />
        <RankedList title="Training" rows={view.training} icon={ShieldCheck} empty="No training data yet" />
      </section>
      <DataRowsCard title="Downtime reasons" rows={asArray(payload.downtimeReasons)} empty="No downtime data yet" />
      <section className="grid gap-4 @5xl/main:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <TrainingGuidancePanel guidance={asRecord(payload.trainingGuidance)} />
        <MonthlyTrainingPlanPanel rows={asArray(payload.monthlyTrainingPlan)} />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Operator attendance" rows={asArray(payload.attendance)} empty="No attendance rows yet" />
        <DataRowsCard title="Pending training" rows={asArray(payload.pendingTraining)} empty="No pending training rows yet" />
      </section>
      <MeetingSummaryPanel tracker={meetingTracker} />
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard
          title="Pending meetings"
          rows={asArray(meetingTracker.pendingOperators).length ? asArray(meetingTracker.pendingOperators) : asArray(meetingTracker.pendingMeetings)}
          empty="No pending meeting rows yet"
        />
        <DataRowsCard title="Completed meetings" rows={asArray(meetingTracker.completedMeetings)} empty="No completed meeting rows yet" />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Rejection type analysis" rows={asArray(payload.rejectionTypeAnalysis)} empty="No rejection type analysis yet" />
        <DataRowsCard title="Defect hotspots" rows={asArray(payload.defectHotspots)} empty="No defect hotspot rows yet" />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Shop-floor completion</CardTitle>
          <CardDescription>Quick completion action matching the running job-card workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <LegacyActionForm
            title="Mark production complete"
            description="Persist a setup completion from the shop-floor view."
            fields={[
              { name: "jcNo", label: "Job card", placeholder: "JC-1001", required: true },
              { name: "setupNo", label: "Setup no.", placeholder: "10" },
              { name: "machine", label: "Machine", placeholder: "CNC-01" },
              { name: "completedBy", label: "Completed by", placeholder: "Name or code", required: true },
              { name: "remark", label: "Remark", placeholder: "Optional" },
            ]}
            buttonLabel="Mark complete"
            onSubmit={(body) => submitAction("mark-complete", body)}
          />
        </CardContent>
      </Card>
    </>
  );
}

type BarDatum = {
  key: string;
  label: string;
  value: number;
  detail?: string;
  group?: string;
  tone?: "default" | "good" | "warning";
};

function InsightCards({ payload }: { payload: DashboardPayload }) {
  const machineAgg = aggregateMachines(asArray(payload.machineRows));
  const weakestMachine = machineAgg
    .filter((row) => row.target > 0)
    .sort((a, b) => a.efficiency - b.efficiency)[0];
  const bestType = aggregateMachineTypes(asArray(payload.machineTypeRows))[0];
  const topReject = asArray(payload.rejectHotspots)[0];
  const attendance = weightedAttendanceFromRows(asArray(payload.attendance));
  const trainingRows = asArray(payload.pendingTraining);

  const cards = [
    {
      label: "Highest rejection driver",
      value: topReject ? `${str(topReject.partNo)} | setup ${str(topReject.setup)}` : "No rejection data",
      detail: topReject
        ? `${formatNumber(numValue(topReject, "reject"))} rejected on ${str(topReject.machine)}, ${formatPercent(numValue(topReject, "rejectRate"))} reject rate`
        : "No rejected quantity found for this scope.",
      warning: Boolean(topReject && numValue(topReject, "reject") > 0),
    },
    {
      label: "Weakest machine efficiency",
      value: weakestMachine ? `${weakestMachine.machine} at ${formatPercent(weakestMachine.efficiency)}` : "No target data",
      detail: weakestMachine
        ? `${formatNumber(weakestMachine.output)} output vs ${formatNumber(weakestMachine.target)} target`
        : "No machine has target quantity in this scope.",
      warning: Boolean(weakestMachine && weakestMachine.efficiency < 0.9),
    },
    {
      label: "Best machine type for output",
      value: bestType ? `${bestType.machineType}: ${formatNumber(bestType.output)}` : "No machine type data",
      detail: bestType
        ? `${formatPercent(bestType.efficiency)} efficiency, ${formatPercent(bestType.rejectRate)} reject rate`
        : "Machine type appears after production entries are available.",
      warning: false,
    },
    {
      label: "People follow-up",
      value: `${attendance ? formatPercent(attendance) : "No attendance"} | ${formatNumber(trainingRows.length)} training`,
      detail: trainingRows.length ? "Pending training exists in this scope." : "No pending training currently recorded in this scope.",
      warning: trainingRows.length > 0 || (attendance > 0 && attendance < 0.9),
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className={card.warning ? "border-amber-300/70" : ""}>
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-base leading-snug">{card.value}</CardTitle>
            <CardAction>
              {card.warning ? <AlertTriangle className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-green-600" />}
            </CardAction>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{card.detail}</CardContent>
        </Card>
      ))}
    </section>
  );
}

function OperatorEfficiencyBenchmark({ rows }: { rows: DashboardPayload[] }) {
  const sourceRows = rows.filter((row) => numValue(row, "target") > 0);
  const topIds = new Set(sourceRows.slice(0, 5).map((row) => str(row.operatorId)));
  const top = sourceRows.slice(0, 5).map((row) => operatorBenchmarkDatum(row, "Top"));
  const bottom = sourceRows
    .filter((row) => !topIds.has(str(row.operatorId)))
    .sort((a, b) => numValue(a, "efficiency") - numValue(b, "efficiency"))
    .slice(0, 5)
    .map((row) => operatorBenchmarkDatum(row, "Bottom"));

  return (
    <BarChartCard
      title="Efficiency top 5 / bottom 5"
      description="Best and weakest operators by output / target"
      rows={[...top, ...bottom]}
      valueFormatter={formatPercent}
    />
  );
}

function AttendanceBenchmark({ rows, scope }: { rows: DashboardPayload[]; scope: string }) {
  const sourceRows = [...rows].sort((a, b) => numValue(b, "attendancePct") - numValue(a, "attendancePct"));
  const topIds = new Set(sourceRows.slice(0, 5).map((row) => str(row.operatorId)));
  const top = sourceRows.slice(0, 5).map((row) => attendanceBenchmarkDatum(row, "Top"));
  const bottom = sourceRows
    .filter((row) => !topIds.has(str(row.operatorId)))
    .sort((a, b) => numValue(a, "attendancePct") - numValue(b, "attendancePct"))
    .slice(0, 5)
    .map((row) => attendanceBenchmarkDatum(row, "Bottom"));

  return (
    <BarChartCard
      title="Attendance top 5 / bottom 5"
      description={scope || "Best and weakest attendance performers"}
      rows={[...top, ...bottom]}
      valueFormatter={formatPercent}
    />
  );
}

function MachineTypeKpiGrid({ rows }: { rows: DashboardPayload[] }) {
  const machineTypes = aggregateMachineTypes(rows);
  if (!machineTypes.length) return null;

  return (
    <section className="grid gap-4 md:grid-cols-2 @5xl/main:grid-cols-4">
      {machineTypes.map((row) => (
        <Card key={row.machineType}>
          <CardHeader>
            <CardDescription>{row.machineType}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatNumber(row.output)}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            <MetricMini label="Target" value={formatNumber(row.target)} />
            <MetricMini label="Eff." value={formatPercent(row.efficiency)} />
            <MetricMini label="Cards" value={formatNumber(row.runs)} />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function MonthlyMachineUsagePanel({ rows }: { rows: DashboardPayload[] }) {
  const latest = rows[rows.length - 1];
  const chartRows = rows.map((row) => ({
    key: str(row.monthKey || row.month),
    label: str(row.month),
    value: numValue(row, "machinesUsed"),
    detail: `${formatNumber(numValue(row, "cardEntries"))} cards | ${hoursLabel(numValue(row, "runtimeHours"))} production`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly machine usage</CardTitle>
        <CardDescription>Available hours exclude breaks; production hours also exclude downtime.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {latest ? (
          <SummaryCardGrid
            items={[
              ["Latest month", str(latest.month)],
              ["Machines used", formatNumber(numValue(latest, "machinesUsed"))],
              ["Card entries", formatNumber(numValue(latest, "cardEntries"))],
              ["Available time", hoursLabel(numValue(latest, "loggedHours"))],
              ["Downtime", durationLabel(numValue(latest, "downtime"))],
              ["Production time", hoursLabel(numValue(latest, "runtimeHours"))],
            ]}
          />
        ) : null}
        <MiniBarList rows={chartRows} valueFormatter={formatNumber} empty="No monthly machine usage rows returned" />
      </CardContent>
    </Card>
  );
}

function SetupSummaryPanel({ setupAnalytics }: { setupAnalytics: DashboardPayload }) {
  const summary = asRecord(setupAnalytics.summary);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Setting summary</CardTitle>
        <CardDescription>From setup checklist</CardDescription>
      </CardHeader>
      <CardContent>
        <SummaryCardGrid
          items={[
            ["Total settings", formatNumber(numValue(summary, "totalSettings"))],
            ["Avg setting time", durationLabel(numValue(summary, "avgMinutes"))],
            ["Total setting time", durationLabel(numValue(summary, "totalMinutes"))],
            ["Active machinists", formatNumber(numValue(summary, "activeSetters"))],
            ["Unique item/setup", formatNumber(numValue(summary, "uniqueItemSetups"))],
          ]}
        />
      </CardContent>
    </Card>
  );
}

function RoutingStatusPanel({ routingStatus }: { routingStatus: DashboardPayload }) {
  const routeParts = asArray(routingStatus.routeParts);
  const pending = asArray(routingStatus.pendingFromProduction);
  const rows = pending.slice(0, 8).map((row) => ({
    partCode: row.partCode,
    entries: row.entries,
    latestDate: row.latestDate,
    action: "Create routing plan",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Routing status</CardTitle>
        <CardDescription>Part-code readiness, using the same route status source as legacy.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SummaryCardGrid
          items={[
            ["Routed parts", formatNumber(routeParts.length)],
            ["Pending from production", formatNumber(pending.length)],
          ]}
        />
        <DataRowsCard title="Routing actions" rows={rows} empty="No routing actions pending" />
      </CardContent>
    </Card>
  );
}

function SetupTrendPanel({ setupAnalytics }: { setupAnalytics: DashboardPayload }) {
  const dailyRows = asArray(setupAnalytics.dailyBySetter).slice(0, 15).map((row, index) => ({
    key: `${str(row.dateKey)}-${str(row.setter)}-${index}`,
    label: `${str(row.date)} | ${str(row.setter)}`,
    value: numValue(row, "settings"),
    detail: `${formatNumber(numValue(row, "settings"))} settings | avg ${durationLabel(numValue(row, "avgMinutes"))}`,
  }));
  const monthlyRows = asArray(setupAnalytics.monthlyBySetter).slice(0, 12).map((row, index) => ({
    key: `${str(row.monthKey)}-${str(row.setter)}-${index}`,
    label: `${str(row.month)} | ${str(row.setter)}`,
    value: numValue(row, "settings"),
    detail: `${formatNumber(numValue(row, "settings"))} settings | avg ${durationLabel(numValue(row, "avgMinutes"))}`,
  }));

  return (
    <section className="grid gap-4">
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <BarChartCard title="Daily settings by machinist" description="Selected date/month scope" rows={dailyRows} valueFormatter={formatNumber} />
        <BarChartCard title="Monthly setting trend" description="Machinist wise" rows={monthlyRows} valueFormatter={formatNumber} />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Machinist setting time" rows={asArray(setupAnalytics.setterPerformance)} empty="No setter performance rows returned" />
        <DataRowsCard title="Same item setup time comparison" rows={asArray(setupAnalytics.sameSetupComparison)} empty="No same-setup comparison rows returned" />
      </section>
    </section>
  );
}

function RejectionAnalysisPanel({ payload }: { payload: DashboardPayload }) {
  const rejectionTypeRows = asArray(payload.rejectionTypeAnalysis).map((row) => ({
    key: str(row.code || row.name),
    label: str(row.name || row.code),
    value: numValue(row, "reject"),
    detail: `${formatNumber(numValue(row, "entries"))} entries | ${formatNumber(numValue(row, "operators"))} operators`,
  }));
  const defectRows = asArray(payload.defectAnalysis).slice(0, 12).map((row) => ({
    key: str(row.code || row.name),
    label: `${str(row.code)} ${str(row.name)}`.trim(),
    value: numValue(row, "reject"),
    detail: `${formatNumber(numValue(row, "entries"))} entries | ${formatNumber(numValue(row, "parts"))} parts`,
  }));
  const hotspots = asArray(payload.rejectHotspots);
  const productRows = aggregateBars(hotspots, (row) => str(row.partNo) || "Unspecified", "reject").slice(0, 10);
  const setupRows = aggregateBars(hotspots, (row) => `Setup ${str(row.setup) || "Unspecified"}`, "reject").slice(0, 10);

  return (
    <section className="grid gap-4">
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <BarChartCard title="Rejection by type" description="Process, QC, setup, and in-process setup" rows={rejectionTypeRows} valueFormatter={formatNumber} />
        <BarChartCard title="Rejection by defect code" description="Rejected pcs grouped by reason code" rows={defectRows} valueFormatter={formatNumber} />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Rejection by remark" rows={asArray(payload.rejectionRemarkAnalysis)} empty="No rejection remark rows returned" />
        <DataRowsCard title="Rejection reason hotspots" rows={asArray(payload.defectHotspots)} empty="No defect hotspot rows returned" />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <BarChartCard title="Product rejection" description="Part wise, selected scope" rows={productRows} valueFormatter={formatNumber} />
        <BarChartCard title="Setting rejection" description="Setup wise, selected machine type / machine no." rows={setupRows} valueFormatter={formatNumber} />
      </section>
      <DataRowsCard title="Rejection hotspot detail" rows={hotspots} empty="No rejection hotspot rows returned" />
    </section>
  );
}

function DowntimeAnalysisPanel({ payload }: { payload: DashboardPayload }) {
  const downtimeReasons = asArray(payload.downtimeReasons).slice(0, 10).map((row) => ({
    key: str(row.reason),
    label: str(row.reason),
    value: numValue(row, "downtime"),
    detail: `${formatNumber(numValue(row, "runs"))} records | ${formatNumber(numValue(row, "machines"))} machines`,
  }));
  const sourceRows = asArray(payload.downtimeByMachine).length ? asArray(payload.downtimeByMachine) : asArray(payload.downtimeByType);
  const downtimeRows = sourceRows.slice(0, 15).map((row, index) => ({
    key: `${str(row.machine || row.machineType)}-${index}`,
    label: str(row.machine || row.machineType),
    value: numValue(row, "downtime"),
    detail: `${formatNumber(numValue(row, "cardEntries"))} cards | ${hoursLabel(numValue(row, "runtimeHours"))} production | ${str(row.topReason) || "reason n/a"}`,
  }));

  return (
    <section className="grid gap-4">
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <BarChartCard title="Downtime reason analysis" description="Downtime grouped by reason" rows={downtimeReasons} valueFormatter={durationLabel} />
        <BarChartCard title="Machine downtime" description="Downtime by machine / type, top reason shown in each row" rows={downtimeRows} valueFormatter={durationLabel} />
      </section>
      <DataRowsCard title="Downtime reason detail" rows={asArray(payload.downtimeReasonDetails)} empty="No downtime reason detail rows returned" />
    </section>
  );
}

function ToolFixturePanel({ rows }: { rows: DashboardPayload[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next tool / fixture number</CardTitle>
        <CardDescription>First missing number, otherwise next new.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <section className="grid gap-3 sm:grid-cols-2 @5xl/main:grid-cols-5">
          {rows.map((row) => (
            <div key={str(row.category)} className="rounded-lg border p-3">
              <div className="truncate text-xs text-muted-foreground">{str(row.category)}</div>
              <div className="text-xl font-semibold tabular-nums">{str(row.recommendedNumber || row.nextNew)}</div>
              <div className="text-xs text-muted-foreground">
                {str(row.recommendationType || "Next number")} | {formatNumber(numValue(row, "usedCount"))} used
              </div>
            </div>
          ))}
        </section>
      </CardContent>
    </Card>
  );
}

function MeetingSummaryPanel({ tracker }: { tracker: DashboardPayload }) {
  const summary = asRecord(tracker.summary);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly one-to-one meeting tracker</CardTitle>
        <CardDescription>
          {str(tracker.month) || "Selected month"}: {formatNumber(numValue(tracker, "completedCount"))} completed, {formatNumber(numValue(tracker, "pendingCount"))} pending
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SummaryCardGrid
          items={[
            ["Completed", formatNumber(numValue(tracker, "completedCount"))],
            ["Pending", formatNumber(numValue(tracker, "pendingCount"))],
            ["Machine issues", formatNumber(numValue(summary, "machineIssueCount"))],
            ["Training needs", formatNumber(numValue(summary, "trainingNeedCount"))],
            ["Target concerns", formatNumber(numValue(summary, "targetConcernCount"))],
            ["Motivation notes", formatNumber(numValue(summary, "motivationCount"))],
          ]}
        />
      </CardContent>
    </Card>
  );
}

function TrainingGuidancePanel({ guidance }: { guidance: DashboardPayload }) {
  const summary = asRecord(guidance.summary);
  const rows = asArray(guidance.rows);
  const note = str(guidance.note);
  const efficiencyThreshold = numValue(summary, "efficiencyThreshold");
  const rejectThreshold = numValue(summary, "rejectThreshold");

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Training guidance</CardTitle>
          <CardDescription>
            {note || "Decision-support flags from the legacy operator analysis"}
            {efficiencyThreshold || rejectThreshold
              ? ` Thresholds: efficiency below ${formatPercent(efficiencyThreshold)}, rejection above ${formatPercent(rejectThreshold)}.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SummaryCardGrid
            items={[
              ["Training required first", formatNumber(numValue(summary, "trainingRequired"))],
              ["Training pending", formatNumber(numValue(summary, "trainingPending"))],
              ["Monitor after training", formatNumber(numValue(summary, "monitorAfterTraining"))],
              ["Management review", formatNumber(numValue(summary, "managementReviewAfterTraining"))],
              ["Improved after training", formatNumber(numValue(summary, "improvedAfterTraining"))],
            ]}
          />
        </CardContent>
      </Card>
      <DataRowsCard title="Training guidance detail" rows={rows} empty="No training guidance rows returned" />
    </section>
  );
}

function MonthlyTrainingPlanPanel({ rows }: { rows: DashboardPayload[] }) {
  return <DataRowsCard title="Monthly training plan" rows={rows} empty="No monthly training plan rows returned" />;
}

function BarChartCard({
  title,
  description,
  rows,
  valueFormatter,
}: {
  title: string;
  description: string;
  rows: BarDatum[];
  valueFormatter: (value: number) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <MiniBarList rows={rows} valueFormatter={valueFormatter} empty="No data for this filter" />
      </CardContent>
    </Card>
  );
}

function MiniBarList({
  rows,
  valueFormatter,
  empty,
}: {
  rows: BarDatum[];
  valueFormatter: (value: number) => string;
  empty: string;
}) {
  if (!rows.length) {
    return <div className="grid h-36 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">{empty}</div>;
  }

  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  return (
    <div className="grid gap-2">
      {rows.map((row) => {
        const width = `${Math.max(3, (Math.abs(row.value) / max) * 100)}%`;
        return (
          <div key={row.key} className="grid gap-1 rounded-lg border p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
              <div className="min-w-0">
                <span className="truncate font-medium">{row.label}</span>
                {row.group ? <Badge className="ml-2 align-middle" variant={row.group === "Bottom" ? "destructive" : "outline"}>{row.group}</Badge> : null}
              </div>
              <span className="font-medium tabular-nums">{valueFormatter(row.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={row.tone === "warning" ? "h-full rounded-full bg-amber-500" : row.tone === "good" ? "h-full rounded-full bg-green-600" : "h-full rounded-full bg-primary"}
                style={{ width }}
              />
            </div>
            {row.detail ? <div className="truncate text-xs text-muted-foreground">{row.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function SummaryCardGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 @5xl/main:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </section>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium tabular-nums">{value}</div>
    </div>
  );
}

type LegacyField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "date" | "number" | "time";
  options?: string[];
  defaultValue?: string;
  required?: boolean;
  min?: string;
  step?: string;
};

function LegacyActionForm({
  title,
  description,
  fields,
  defaults = {},
  buttonLabel,
  onSubmit,
}: {
  title: string;
  description: string;
  fields: LegacyField[];
  defaults?: Record<string, unknown>;
  buttonLabel: string;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    onSubmit(formPayload(new FormData(form), fields));
    form.reset();
  }

  return (
    <form className="grid gap-3 rounded-xl border bg-background p-3" onSubmit={submit}>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
        {fields.map((field) => (
          <Field key={field.name} label={field.label}>
            {field.options ? (
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                name={field.name}
                defaultValue={str(defaults[field.name]) || field.defaultValue || field.options[0]}
                required={field.required}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option ? option.replaceAll("_", " ") : "Normal"}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                name={field.name}
                type={field.type ?? "text"}
                placeholder={field.placeholder}
                required={field.required}
                min={field.min}
                step={field.step}
                defaultValue={str(defaults[field.name])}
              />
            )}
          </Field>
        ))}
      </div>
      <Button className="w-fit" type="submit">
        <Wrench className="size-4" />
        {buttonLabel}
      </Button>
    </form>
  );
}

function ActionLogTable({ rows }: { rows: DashboardPayload[] }) {
  return <DataRowsCard title="Planner action log" rows={rows} empty="No planner actions saved yet" />;
}

function JobCardTileBoard({
  rows,
  plannedRows,
  machineRows,
  actionNeededCount,
  openMasterReadiness,
}: {
  rows: DashboardPayload[];
  plannedRows: DashboardPayload[];
  machineRows: DashboardPayload[];
  actionNeededCount: number;
  openMasterReadiness: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [trackingState, setTrackingState] = useState("all");
  const [rmStatusFilter, setRmStatusFilter] = useState("all");
  const [productionStatusFilter, setProductionStatusFilter] = useState("all");
  const [jobCardFilter, setJobCardFilter] = useState("");
  const [itemCodeFilter, setItemCodeFilter] = useState("");
  const [machineFilter, setMachineFilter] = useState("");
  const plannedByJobCard = useMemo(() => groupPlannedRowsByJobCard(plannedRows), [plannedRows]);
  const plannedByPart = useMemo(() => groupPlannedRowsByPart(plannedRows), [plannedRows]);
  const jobCardOptions = useMemo(() => uniqueValues(rows.map(jobCardNumber).filter(Boolean)), [rows]);
  const itemCodeOptions = useMemo(() => uniqueValues(rows.map(itemCode).filter(Boolean)), [rows]);
  const machineOptions = useMemo(() => plannedMachineOptions(plannedRows, machineBoardRows(machineRows, plannedRows)), [machineRows, plannedRows]);
  const filteredRows = useMemo(
    () => rows.filter((row) =>
      rowMatchesFieldQuery(row, query, searchField) &&
      typedFilterMatches(jobCardNumber(row), jobCardFilter) &&
      typedFilterMatches(itemCode(row), itemCodeFilter) &&
      jobCardMatchesMachine(row, machineFilter, plannedByJobCard, plannedByPart) &&
      (trackingState === "all" || jobCardTrackingState(row) === trackingState) &&
      (rmStatusFilter === "all" || (rmStatusFilter === "received" ? displayValue(row.rmStatus) === "Received" : displayValue(row.rmStatus) !== "Received")) &&
      (productionStatusFilter === "all" || (productionStatusFilter === "in-production" ? jobCardHasProduction(row) : !jobCardHasProduction(row))),
    ),
    [itemCodeFilter, jobCardFilter, machineFilter, plannedByJobCard, plannedByPart, productionStatusFilter, query, rmStatusFilter, rows, searchField, trackingState],
  );
  const needsAction = actionNeededCount;
  const pendingRm = rows.filter((row) => displayValue(row.rmStatus) !== "Received").length;
  const ready = rows.filter((row) => jobCardTrackingState(row) === "Ready").length;
  const inProduction = rows.filter((row) => jobCardTrackingState(row) === "In production").length;

  function clearJobCardFilters() {
    setQuery("");
    setSearchField("all");
    setTrackingState("all");
    setRmStatusFilter("all");
    setProductionStatusFilter("all");
    setJobCardFilter("");
    setItemCodeFilter("");
    setMachineFilter("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job-card tiles</CardTitle>
        <CardDescription>{rows.length ? `${formatNumber(filteredRows.length)} of ${formatNumber(rows.length)} job cards shown` : "No job-card status rows returned"}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.length ? (
          <>
            <TrackingSummary
              items={[
                ["Pending RM", formatNumber(pendingRm)],
                ["Ready", formatNumber(ready)],
                ["Action needed", formatNumber(needsAction), openMasterReadiness],
                ["In production", formatNumber(inProduction)],
                ["Visible", formatNumber(filteredRows.length)],
              ]}
            />
            <TrackingFilters
              query={query}
              queryPlaceholder="Search job card, part, PO, route, status..."
              onQueryChange={setQuery}
              searchFieldLabel="Search in"
              searchFieldValue={searchField}
              onSearchFieldChange={setSearchField}
              searchFieldOptions={[
                ["all", "All fields"],
                ["jobCard", "Job card"],
                ["part", "Part"],
                ["po", "FG PO"],
                ["route", "Route / option"],
                ["status", "Status"],
              ]}
              selectLabel="Tracking state"
              selectValue={trackingState}
              onSelectChange={setTrackingState}
              options={[
                ["all", "All states"],
                ["Needs action", "Needs action"],
                ["Ready", "Ready"],
                ["In production", "In production"],
                ["Dispatch", "Dispatch"],
                ["Pending", "Pending"],
              ]}
            />
            <div className="grid gap-3 @4xl/main:grid-cols-2">
              <FilterSelect
                label="RM status"
                value={rmStatusFilter}
                onChange={setRmStatusFilter}
                options={[
                  ["all", "All RM status"],
                  ["received", "RM received"],
                  ["waiting", "Waiting RM"],
                ]}
              />
              <FilterSelect
                label="Production status"
                value={productionStatusFilter}
                onChange={setProductionStatusFilter}
                options={[
                  ["all", "All production status"],
                  ["in-production", "In production"],
                  ["not-in-production", "Not in production"],
                ]}
              />
            </div>
            <ExcelStyleFilters
              filters={[
                {
                  id: "job-card-filter",
                  label: "Job card no.",
                  value: jobCardFilter,
                  placeholder: "Type or select job card",
                  options: jobCardOptions,
                  onChange: setJobCardFilter,
                },
                {
                  id: "item-code-filter",
                  label: "Item code",
                  value: itemCodeFilter,
                  placeholder: "Type or select item code",
                  options: itemCodeOptions,
                  onChange: setItemCodeFilter,
                },
                {
                  id: "job-card-machine-filter",
                  label: "Machine no.",
                  value: machineFilter,
                  placeholder: "Type or select planned/running machine",
                  options: machineOptions,
                  onChange: setMachineFilter,
                },
              ]}
            />
            <div>
              <Button type="button" variant="outline" size="sm" onClick={clearJobCardFilters}>
                Clear filters
              </Button>
            </div>
            {filteredRows.length ? (
              <div className="grid max-h-[42rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 @7xl/main:grid-cols-3">
                {filteredRows.map((row, index) => (
                  <JobCardTile
                    key={`${str(row.jcNo || row.JobCardNo || row.jobCard) || "job-card"}-${index}`}
                    row={row}
                    setupRows={plannedByJobCard.get(machineKey(jobCardNumber(row))) ?? plannedByPart.get(machineKey(itemCode(row))) ?? []}
                  />
                ))}
              </div>
            ) : (
              <EmptyRowsMessage>No job cards match the current filters</EmptyRowsMessage>
            )}
          </>
        ) : (
          <EmptyRowsMessage>No job-card status rows returned</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  );
}

function JobCardTile({ row, setupRows }: { row: DashboardPayload; setupRows: DashboardPayload[] }) {
  const jcNo = displayValue(row.jcNo || row.JobCardNo || row.jobCard);
  const partCode = displayValue(row.partCode || row["PART CODE"] || row.itemCode);
  const option = displayValue(row.optionNumber || row.selectedOption || row.option);
  const blocker = displayValue(row.planningBlocker || row.nextAction || row.routeStatus);
  const trackingState = jobCardTrackingState(row);
  const schedule = jobCardScheduleSummary(row, setupRows);

  return (
    <article className="grid gap-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold">{jcNo}</div>
          <div className="break-words text-xs text-muted-foreground">{partCode}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusBadge value={trackingState} />
          <StatusBadge value={row.rmStatus} />
        </div>
      </div>
      <TileField label="Description" value={row.description || row.DESCRIPTION} />
      <div className="grid gap-2 rounded-md border bg-muted/20 p-2 sm:grid-cols-2">
        <TileField label="Planned production start" value={schedule.plannedStart} />
        <TileField label="Planned production end" value={schedule.plannedEnd} />
        <TileField label="Actual production start" value={schedule.actualStart} />
        <TileField label="Actual production end" value={schedule.actualEnd} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TileField label="FG PO" value={row.fgPoNo || row["FG PO NO."]} />
        <TileField label="Order pcs" value={row.orderPcs || row["ORD. PCS."]} numeric />
        <TileField label="Route option" value={option} />
        <TileField label="Option source" value={row.optionSource} />
        <TileField label="Route" value={row.routeStatus} />
        <TileField label="Cycle" value={row.cycleStatus} />
        <TileField label="Tooling" value={row.toolingStatus} />
        <TileField label="Actual / output" value={`${displayValue(row.rawActualQty, true)} / ${displayValue(row.rawOutputQty, true)}`} />
        <TileField label="Rejected" value={row.rawRejectQty} numeric />
        <TileField label="Raw rows" value={row.rawRows} numeric />
      </div>
      {setupRows.length ? (
        <div className="grid gap-2">
          <div className="text-[11px] font-medium uppercase text-muted-foreground">Setup jobs</div>
          <div className="grid max-h-48 gap-2 overflow-y-auto pr-1">
            {setupRows.map((setup, index) => (
              <div key={`${displayValue(setup.setupNo)}-${displayValue(setup.machine)}-${index}`} className="rounded-md border bg-muted/10 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">Setup {displayValue(setup.setupNo)} · {displayValue(setup.machine)}</div>
                  <StatusBadge value={setup.runningStatus} />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <TileField label="Setup planned date" value={setup.setupPlannedDate || setup.plannedDate} />
                  <TileField label="Setup completion date" value={setup.setupCompletionDate || setup.completionDate} />
                  <TileField label="Plan vs actual" value={setup.planVsActual} />
                  <TileField label="Planned production start" value={setup.plannedProductionStartDate} />
                  <TileField label="Planned production end" value={setup.plannedProductionEndDate} />
                  <TileField label="Actual production start" value={setup.actualProductionStartDate} />
                  <TileField label="Actual production end" value={setup.actualProductionEndDate} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <TileField label="Planning action" value={blocker} important />
    </article>
  );
}

function MachinePlanningBoard({
  rows,
  plannedRows,
}: {
  rows: DashboardPayload[];
  plannedRows: DashboardPayload[];
}) {
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const boardRows = useMemo(() => machineBoardRows(rows, plannedRows), [plannedRows, rows]);
  const machineTypes = useMemo(() => uniqueValues(boardRows.map((row) => machineValue(row, "machineType")).filter((value) => value !== "-")), [boardRows]);
  const [machineType, setMachineType] = useState("all");
  const [machineFilter, setMachineFilter] = useState("");
  const [jobCardFilter, setJobCardFilter] = useState("");
  const [itemCodeFilter, setItemCodeFilter] = useState("");
  const [runningFilter, setRunningFilter] = useState("all");
  const [selectedMachine, setSelectedMachine] = useState("");
  const plannedByMachine = useMemo(() => groupPlannedRowsByMachine(plannedRows), [plannedRows]);
  const jobCardOptions = useMemo(() => uniqueValues(plannedRows.map(jobCardNumber).filter((value) => value !== "-")), [plannedRows]);
  const itemCodeOptions = useMemo(() => uniqueValues(plannedRows.map(itemCode).filter((value) => value !== "-")), [plannedRows]);
  const machineOptions = useMemo(
    () => plannedMachineOptions(plannedRows, boardRows),
    [boardRows, plannedRows],
  );
  const filteredRows = useMemo(
    () => boardRows.filter((row) => {
      const machine = machineValue(row, "machine");
      const isRunning = machineIsRunning(machine, plannedByMachine);
      return (
        rowMatchesMachineQuery(row, query, searchField, plannedByMachine) &&
        typedFilterMatches(machine, machineFilter) &&
        machineMatchesJobCard(machine, jobCardFilter, plannedByMachine) &&
        machineMatchesItemCode(machine, itemCodeFilter, plannedByMachine) &&
        (machineType === "all" || machineValue(row, "machineType") === machineType) &&
        (runningFilter === "all" || (runningFilter === "running" ? isRunning : !isRunning))
      );
    }),
    [boardRows, itemCodeFilter, jobCardFilter, machineFilter, machineType, plannedByMachine, query, runningFilter, searchField],
  );
  const runningRows = boardRows.filter((row) => machineIsRunning(machineValue(row, "machine"), plannedByMachine)).length;
  const selectedPlans = selectedMachine ? plannedByMachine.get(machineKey(selectedMachine)) ?? [] : [];

  function clearMachineFilters() {
    setQuery("");
    setSearchField("all");
    setMachineType("all");
    setMachineFilter("");
    setJobCardFilter("");
    setItemCodeFilter("");
    setRunningFilter("all");
    setSelectedMachine("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Machine planning board</CardTitle>
        <CardDescription>{boardRows.length ? `${formatNumber(filteredRows.length)} of ${formatNumber(boardRows.length)} machines shown` : "No machine planning board rows returned"}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {boardRows.length ? (
          <>
            <TrackingSummary
              items={[
                ["Machine types", formatNumber(machineTypes.length)],
                ["Running", formatNumber(runningRows)],
                ["Planned parts", formatNumber(plannedRows.length)],
                ["Visible", formatNumber(filteredRows.length)],
              ]}
            />
            <TrackingFilters
              query={query}
              queryPlaceholder="Search machine, type, operator, job card..."
              onQueryChange={setQuery}
              searchFieldLabel="Search in"
              searchFieldValue={searchField}
              onSearchFieldChange={setSearchField}
              searchFieldOptions={[
                ["all", "All fields"],
                ["machine", "Machine"],
                ["machineType", "Machine type"],
                ["operator", "Operator"],
                ["jobCard", "Job card"],
                ["part", "Part"],
              ]}
              selectLabel="Machine type"
              selectValue={machineType}
              onSelectChange={setMachineType}
              options={[["all", "All machine types"], ...machineTypes.map((value) => [value, value] as [string, string])]}
              secondarySelectLabel="Running"
              secondarySelectValue={runningFilter}
              onSecondarySelectChange={setRunningFilter}
              secondaryOptions={[
                ["all", "All machines"],
                ["running", "Running only"],
                ["not-running", "Not running"],
              ]}
            />
            <ExcelStyleFilters
              filters={[
                {
                  id: "machine-number-filter",
                  label: "Machine no.",
                  value: machineFilter,
                  placeholder: "Type or select planned/running machine",
                  options: machineOptions,
                  onChange: setMachineFilter,
                },
                {
                  id: "machine-job-card-filter",
                  label: "Job card no.",
                  value: jobCardFilter,
                  placeholder: "Type or select job card",
                  options: jobCardOptions,
                  onChange: setJobCardFilter,
                },
                {
                  id: "machine-item-code-filter",
                  label: "Item code",
                  value: itemCodeFilter,
                  placeholder: "Type or select item code",
                  options: itemCodeOptions,
                  onChange: setItemCodeFilter,
                },
              ]}
            />
            <div>
              <Button type="button" variant="outline" size="sm" onClick={clearMachineFilters}>
                Clear filters
              </Button>
            </div>
            {filteredRows.length ? (
              <div className="grid max-h-[42rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-4">
                {filteredRows.map((row, index) => (
                  <MachinePlanningTile
                    key={`${machineValue(row, "machine")}-${index}`}
                    row={row}
                    plannedRows={plannedByMachine.get(machineKey(machineValue(row, "machine"))) ?? []}
                    isRunning={machineIsRunning(machineValue(row, "machine"), plannedByMachine)}
                    selected={machineKey(selectedMachine) === machineKey(machineValue(row, "machine"))}
                    onSelect={() => setSelectedMachine(machineValue(row, "machine"))}
                  />
                ))}
              </div>
            ) : (
              <EmptyRowsMessage>No machines match the current filters</EmptyRowsMessage>
            )}
            <MachinePlannedPartsPanel machine={selectedMachine} rows={selectedPlans} />
          </>
        ) : (
          <EmptyRowsMessage>No machine planning board rows returned</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  );
}

function MachinePlanningTile({
  row,
  plannedRows,
  isRunning,
  selected,
  onSelect,
}: {
  row: DashboardPayload;
  plannedRows: DashboardPayload[];
  isRunning: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const machine = machineValue(row, "machine");
  const machineType = machineValue(row, "machineType");
  const status = machineMasterStatusText(row);
  const plannedCount = plannedRows.length;
  const planningStatus = machinePlanningStatus(plannedRows);
  const currentSetup = currentShopFloorItem(plannedRows);
  const nextSetup = nextShopFloorItem(plannedRows, currentSetup);
  const focusSetup = currentSetup ?? nextSetup ?? machineTileFocusSetup(plannedRows);
  const focusIsCurrent = Boolean(currentSetup && focusSetup && shopFloorPlanKey(focusSetup) === shopFloorPlanKey(currentSetup));

  return (
    <button
      type="button"
      className={`grid gap-2 rounded-md border bg-background p-2 text-left transition hover:border-primary/60 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 ${selected ? "border-primary bg-muted/40" : ""}`}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-[13px] font-semibold">{machine}</div>
          <div className="break-words text-xs text-muted-foreground">{machineType}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <MachineStateBadge label="Run" value={isRunning ? "Running" : "Not running"} tone={isRunning ? "success" : "neutral"} />
          <MachineStateBadge label="Plan" value={planningStatus} tone={machinePlanningTone(planningStatus)} />
          <MachineStateBadge label="Master" value={status} tone={status === "Active" ? "success" : status === "Inactive" ? "danger" : "warning"} />
        </div>
      </div>
      <div className="grid gap-x-2 gap-y-1.5 sm:grid-cols-2">
        <TileField label="Location" value={row.location || row.LOCATION || row.Location} />
        <TileField label="Capacity" value={row.capacity || row.CAPACITY || row.Capacity} numeric />
        <TileField label="Operator" value={row.operator || row.operatorName || row["OPERATOR NAME"]} />
        <TileField label="Planned setups" value={plannedCount} numeric />
        <TileField label="Priority" value={row.priority || row.PRIORITY} />
        <TileField label={focusIsCurrent ? "Current job card" : "Next job card"} value={focusSetup?.jcNo || row.jcNo || row.jobCard || row.JobCardNo} />
        <TileField label={focusIsCurrent ? "Current part" : "Next part to setup"} value={focusSetup?.partCode || row.partCode || row["PART CODE"] || row.itemCode} />
        <TileField label="Setup" value={focusSetup ? `${displayValue(focusSetup.setupNo)} / Option ${displayValue(focusSetup.optionNumber)}` : "-"} />
        <TileField label={focusIsCurrent ? "Setup completion date" : "Setup planned date"} value={focusIsCurrent ? focusSetup?.setupCompletionDate || focusSetup?.completionDate : focusSetup?.setupPlannedDate || focusSetup?.plannedDate} />
        <TileField label="Remarks" value={row.remark || row.remarks || row.REMARKS} important />
      </div>
    </button>
  );
}

function SetupChecklistHistory({ rows }: { rows: DashboardPayload[] }) {
  const [query, setQuery] = useState("");
  const [machineFilter, setMachineFilter] = useState("");
  const [jobCardFilter, setJobCardFilter] = useState("");
  const [optionFilter, setOptionFilter] = useState("");
  const [setterFilter, setSetterFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const machineOptions = useMemo(() => uniqueValues(rows.map((row) => displayValue(row.machine)).filter((value) => value !== "-")), [rows]);
  const jobCardOptions = useMemo(() => uniqueValues(rows.map((row) => displayValue(row.jcNo)).filter((value) => value !== "-")), [rows]);
  const optionOptions = useMemo(() => uniqueValues(rows.map((row) => displayValue(row.optionNumber)).filter((value) => value !== "-")), [rows]);
  const setterOptions = useMemo(() => uniqueValues(rows.map((row) => displayValue(row.setterCode)).filter((value) => value !== "-")), [rows]);
  const shiftOptions = useMemo(() => uniqueValues(rows.map((row) => displayValue(row.shift)).filter((value) => value !== "-")), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) =>
    setupHistoryMatchesQuery(row, query) &&
    typedFilterMatches(displayValue(row.machine), machineFilter) &&
    typedFilterMatches(displayValue(row.jcNo), jobCardFilter) &&
    typedFilterMatches(displayValue(row.optionNumber), optionFilter) &&
    typedFilterMatches(displayValue(row.setterCode), setterFilter) &&
    typedFilterMatches(displayValue(row.shift), shiftFilter),
  ), [jobCardFilter, machineFilter, optionFilter, query, rows, setterFilter, shiftFilter]);
  const totalMinutes = filteredRows.reduce((total, row) => total + numValue(row, "settingMinutes"), 0);
  const machines = uniqueValues(filteredRows.map((row) => displayValue(row.machine)).filter((value) => value !== "-")).length;
  const setters = uniqueValues(filteredRows.map((row) => displayValue(row.setterCode)).filter((value) => value !== "-")).length;

  function clearFilters() {
    setQuery("");
    setMachineFilter("");
    setJobCardFilter("");
    setOptionFilter("");
    setSetterFilter("");
    setShiftFilter("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup checklist history</CardTitle>
        <CardDescription>{rows.length ? `${formatNumber(filteredRows.length)} of ${formatNumber(rows.length)} setup checklist entries shown` : "No setup checklist entries saved yet"}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.length ? (
          <>
            <TrackingSummary
              items={[
                ["Setup entries", formatNumber(filteredRows.length)],
                ["Machines", formatNumber(machines)],
                ["Setters", formatNumber(setters)],
                ["Setting time", durationLabel(totalMinutes)],
                ["Visible", formatNumber(filteredRows.length)],
              ]}
            />
            <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
              <span>Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={query} placeholder="Search job card, machine, part, setup, setter, remark..." onChange={(event) => setQuery(event.target.value)} />
              </div>
            </Label>
            <ExcelStyleFilters
              filters={[
                {
                  id: "setup-history-machine",
                  label: "Machine no.",
                  value: machineFilter,
                  placeholder: "Type or select machine",
                  options: machineOptions,
                  onChange: setMachineFilter,
                },
                {
                  id: "setup-history-job-card",
                  label: "Job card no.",
                  value: jobCardFilter,
                  placeholder: "Type or select job card",
                  options: jobCardOptions,
                  onChange: setJobCardFilter,
                },
                {
                  id: "setup-history-option",
                  label: "Option no.",
                  value: optionFilter,
                  placeholder: "Type or select option",
                  options: optionOptions,
                  onChange: setOptionFilter,
                },
                {
                  id: "setup-history-setter",
                  label: "Setter",
                  value: setterFilter,
                  placeholder: "Type or select setter",
                  options: setterOptions,
                  onChange: setSetterFilter,
                },
                {
                  id: "setup-history-shift",
                  label: "Shift",
                  value: shiftFilter,
                  placeholder: "Type or select shift",
                  options: shiftOptions,
                  onChange: setShiftFilter,
                },
              ]}
            />
            <div>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
            {filteredRows.length ? (
              <div className="grid max-h-[34rem] gap-3 overflow-y-auto pr-1">
                {filteredRows.map((row, index) => (
                  <article key={`${displayValue(row.jcNo)}-${displayValue(row.machine)}-${displayValue(row.setupNo)}-${index}`} className="grid gap-3 rounded-lg border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-semibold">{displayValue(row.jcNo)}</div>
                        <div className="break-words text-xs text-muted-foreground">{displayValue(row.partCode)}</div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <StatusBadge value={row.status} />
                        <MachineStateBadge label="Machine" value={displayValue(row.machine)} tone="planning" />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 @6xl/main:grid-cols-4">
                      <TileField label="Setup date" value={row.setupDate} />
                      <TileField label="Option" value={row.optionNumber} />
                      <TileField label="Setup no." value={row.setupNo} />
                      <TileField label="Shift" value={row.shift} />
                      <TileField label="Setting time" value={durationLabel(numValue(row, "settingMinutes"))} />
                      <TileField label="Setter" value={row.setterCode} />
                      <TileField label="Helper" value={row.helperCode} />
                      <TileField label="QC" value={row.qcController} />
                      <TileField label="Start / end" value={`${displayValue(row.settingStartTime)} / ${displayValue(row.settingEndTime)}`} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <TileField label="Rimmer" value={row.rimmerAvailability} />
                      <TileField label="Modhiyu" value={row.modhiyu} />
                      <TileField label="Remarks" value={row.remarks} important />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyRowsMessage>No setup checklist entries match the current filters</EmptyRowsMessage>
            )}
          </>
        ) : (
          <EmptyRowsMessage>No setup checklist entries saved yet</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  );
}

function MachinePlannedPartsPanel({ machine, rows }: { machine: string; rows: DashboardPayload[] }) {
  return (
    <section className="grid gap-3 rounded-lg border bg-muted/20 p-3">
      <div>
        <div className="text-sm font-semibold">{machine ? `Planned parts on ${machine}` : "Select a machine to see planned parts"}</div>
        <div className="text-xs text-muted-foreground">
          {machine ? `${formatNumber(rows.length)} planned setup rows` : "Click any machine tile above to open its route-level part plan."}
        </div>
      </div>
      {machine ? (
        rows.length ? (
          <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <article key={`${displayValue(row.jcNo)}-${displayValue(row.setupNo)}-${index}`} className="grid gap-2 rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold">{displayValue(row.partCode)}</div>
                    <div className="break-words text-xs text-muted-foreground">{displayValue(row.description)}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <StatusBadge value={row.runningStatus} />
                    <StatusBadge value={row.rmStatus} />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 @6xl/main:grid-cols-4">
                  <TileField label="Job card" value={row.jcNo} />
                  <TileField label="FG PO" value={row.fgPoNo} />
                  <TileField label="Option" value={row.optionNumber} />
                  <TileField label="Setup" value={`${displayValue(row.setupNo)} ${displayValue(row.setupName) !== "-" ? displayValue(row.setupName) : ""}`} />
                  <TileField label="Order pcs" value={row.orderPcs} numeric />
                  <TileField label="Actual / output" value={`${displayValue(row.rawActualQty, true)} / ${displayValue(row.rawOutputQty, true)}`} />
                  <TileField label="Setup planned date" value={row.setupPlannedDate || row.plannedDate} />
                  <TileField label="Setup completion date" value={row.setupCompletionDate || row.completionDate} />
                  <TileField label="Planned production start" value={row.plannedProductionStartDate} />
                  <TileField label="Planned production end" value={row.plannedProductionEndDate} />
                  <TileField label="Actual production start" value={row.actualProductionStartDate} />
                  <TileField label="Actual production end" value={row.actualProductionEndDate} />
                  <TileField label="Plan vs actual" value={row.planVsActual} />
                  <TileField label="Cycle" value={row.cycleStatus} />
                  <TileField label="Tooling" value={row.toolingStatus} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyRowsMessage>No planned parts found for this machine</EmptyRowsMessage>
        )
      ) : null}
    </section>
  );
}

function TrackingSummary({ items }: { items: Array<[string, string, (() => void)?]> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 @4xl/main:grid-cols-5">
      {items.map(([label, value, onClick]) => {
        const className = "rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-background to-green-100/70 p-2.5 text-left shadow-sm shadow-emerald-950/5 dark:border-emerald-900/50 dark:from-emerald-950/35 dark:via-background dark:to-green-950/25";
        const content = (
          <>
            <div className="text-[10px] font-medium uppercase text-emerald-800 dark:text-emerald-200">{label}</div>
            <div className="text-base font-semibold tabular-nums">{value}</div>
          </>
        );
        return onClick ? (
          <button key={label} type="button" className={`${className} transition hover:border-emerald-400 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30`} onClick={onClick}>
            {content}
          </button>
        ) : (
          <div key={label} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function TrackingFilters({
  query,
  queryPlaceholder,
  onQueryChange,
  searchFieldLabel,
  searchFieldValue,
  onSearchFieldChange,
  searchFieldOptions,
  selectLabel,
  selectValue,
  onSelectChange,
  options,
  secondarySelectLabel,
  secondarySelectValue,
  onSecondarySelectChange,
  secondaryOptions,
}: {
  query: string;
  queryPlaceholder: string;
  onQueryChange: (value: string) => void;
  searchFieldLabel: string;
  searchFieldValue: string;
  onSearchFieldChange: (value: string) => void;
  searchFieldOptions: Array<[string, string]>;
  selectLabel: string;
  selectValue: string;
  onSelectChange: (value: string) => void;
  options: Array<[string, string]>;
  secondarySelectLabel?: string;
  secondarySelectValue?: string;
  onSecondarySelectChange?: (value: string) => void;
  secondaryOptions?: Array<[string, string]>;
}) {
  return (
    <div className="grid gap-3 @4xl/main:grid-cols-[minmax(0,1fr)_180px_220px_180px]">
      <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
        <span>Search</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={query} placeholder={queryPlaceholder} onChange={(event) => onQueryChange(event.target.value)} />
        </div>
      </Label>
      <FilterSelect label={searchFieldLabel} value={searchFieldValue} onChange={onSearchFieldChange} options={searchFieldOptions} />
      <FilterSelect label={selectLabel} value={selectValue} onChange={onSelectChange} options={options} />
      {secondarySelectLabel && secondarySelectValue && onSecondarySelectChange && secondaryOptions ? (
        <FilterSelect label={secondarySelectLabel} value={secondarySelectValue} onChange={onSecondarySelectChange} options={secondaryOptions} />
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
      <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <select
          className="h-9 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Label>
  );
}

function ExcelStyleFilters({
  filters,
}: {
  filters: Array<{
    id: string;
    label: string;
    value: string;
    placeholder: string;
    options: string[];
    onChange: (value: string) => void;
  }>;
}) {
  return (
    <div className="grid gap-3 @4xl/main:grid-cols-3">
      {filters.map((filter) => (
        <Label key={filter.id} className="grid gap-1 text-xs font-medium text-muted-foreground">
          <span>{filter.label}</span>
          <select
            className="h-9 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
          >
            <option value="">All {filter.label.toLowerCase()}</option>
            {filter.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Label>
      ))}
    </div>
  );
}

function TileField({
  label,
  value,
  numeric,
  important,
}: {
  label: string;
  value: unknown;
  numeric?: boolean;
  important?: boolean;
}) {
  const text = displayValue(value, numeric);
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className={important ? "break-words text-sm font-medium" : "break-words text-sm"}>{text}</div>
    </div>
  );
}

function StatusBadge({ value }: { value: unknown }) {
  const text = displayValue(value);
  const normalized = text.toLowerCase();
  const toneClass = statusBadgeToneClass(normalized);

  return (
    <Badge variant="outline" className={toneClass}>
      {text}
    </Badge>
  );
}

function statusBadgeToneClass(normalized: string) {
  if (normalized === "-") return "border-slate-300 bg-slate-50 text-slate-700";
  if (normalized.includes("in production") || normalized.includes("running")) return "border-sky-300 bg-sky-50 text-sky-800";
  if (normalized.includes("ready") || normalized.includes("received") || normalized.includes("dispatch") || normalized.includes("setup complete") || normalized.includes("on time")) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (normalized.includes("early")) return "border-sky-300 bg-sky-50 text-sky-800";
  if (normalized.includes("waiting") || normalized.includes("pending")) return "border-amber-300 bg-amber-50 text-amber-800";
  if (
    normalized.includes("delayed") ||
    normalized.includes("need") ||
    normalized.includes("action") ||
    normalized.includes("missing") ||
    normalized.includes("required") ||
    normalized.includes("breakdown")
  ) {
    return "border-red-300 bg-red-50 text-red-800";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function MachineStateBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "planning" | "warning" | "danger" | "neutral";
}) {
  const toneClass = {
    success: "border-emerald-300 bg-emerald-50 text-emerald-800",
    planning: "border-sky-300 bg-sky-50 text-sky-800",
    warning: "border-amber-300 bg-amber-50 text-amber-800",
    danger: "border-red-300 bg-red-50 text-red-800",
    neutral: "border-slate-300 bg-slate-50 text-slate-700",
  }[tone];
  return (
    <Badge variant="outline" className={`gap-1 ${toneClass}`}>
      <span className="text-[10px] font-semibold uppercase opacity-75">{label}</span>
      <span>{value}</span>
    </Badge>
  );
}

function EmptyRowsMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-28 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function DataRowsCard({ title, rows, empty }: { title: string; rows: DashboardPayload[]; empty: string }) {
  const columns = tableColumns(rows);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{rows.length ? `${formatNumber(rows.length)} rows` : empty}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length && columns.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 12).map((row, index) => (
                  <TableRow key={`${title}-${index}`}>
                    {columns.map((column) => (
                      <TableCell key={column} className="max-w-[18rem] truncate">
                        {formatCell(row[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRowsMessage>{empty}</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </Label>
  );
}

type DashboardActionMutations = {
  saveRouteSelection: (args: { jcNo: string; optionNumber: string }) => Promise<unknown>;
  savePlannerPriority: (args: {
    target: string;
    jcNo?: string;
    partCode?: string;
    priority: string;
    approvalMode?: string;
    interruptedJcNo?: string;
    interruptedSetupNo?: string;
    interruptedMachine?: string;
    interruptedFinishedQty?: number;
    interruptedSetups?: Array<{ jcNo: string; setupNo: string; machine: string; finishedQty?: number }>;
    remark?: string;
  }) => Promise<unknown>;
  saveMachineConstraint: (args: {
    machineNo: string;
    unavailableFrom: string;
    unavailableTo: string;
    reason: string;
    remark?: string;
    rescheduleAction?: string;
  }) => Promise<unknown>;
  savePlanOverride: (args: {
    target: string;
    toMachine: string;
    setupNo?: string;
    fromMachine?: string;
    reason?: string;
  }) => Promise<unknown>;
  saveRouteChange: (args: {
    target: string;
    newOption: string;
    changeAfterSetup?: string;
    applyFromSetup?: string;
    wipQty?: number;
    remainingSetups?: Array<{ setupNo: string; plan: boolean; quantity: number; remark?: string }>;
    reason?: string;
  }) => Promise<unknown>;
  saveDispatchApproval: (args: { jcNo: string; approvedBy: string; remark?: string }) => Promise<unknown>;
  markComplete: (args: {
    jcNo: string;
    completedBy: string;
    remark?: string;
    setupNo?: string;
    machine?: string;
  }) => Promise<unknown>;
  saveProductionEntry: (args: {
    prodDate: string;
    operatorId: string;
    operatorName?: string;
    machineType: string;
    machine: string;
    partCode: string;
    jobCard?: string;
    setupNo?: string;
    outputQty: number;
    actualQty?: number;
    targetQty: number;
    rejectQty: number;
    rejectionType?: string;
    rejectionRemark?: string;
    downtimeMinutes?: number;
    downtimeReason?: string;
  }) => Promise<unknown>;
  saveDataEntry: (args: { id?: Id<"dataEntries">; entryType: string; key?: string; payload: unknown }) => Promise<unknown>;
  reverseEntry: (args: {
    targetTable: string;
    targetId: string;
    targetKey?: string;
    targetLabel?: string;
    reason: string;
    correctedBy: string;
  }) => Promise<unknown>;
};

async function runDashboardAction(
  path: string,
  body: Record<string, unknown>,
  mutations: DashboardActionMutations,
) {
  if (path === "route-selection") {
    await mutations.saveRouteSelection({
      jcNo: text(body.jcNo),
      optionNumber: text(body.optionNumber),
    });
    return "Route option saved.";
  }

  if (path === "planner-priority") {
    await mutations.savePlannerPriority({
      target: text(body.target),
      jcNo: optionalText(body.jcNo),
      partCode: optionalText(body.partCode),
      priority: text(body.priority) || "Normal",
      approvalMode: optionalText(body.approvalMode),
      interruptedJcNo: optionalText(body.interruptedJcNo),
      interruptedSetupNo: optionalText(body.interruptedSetupNo),
      interruptedMachine: optionalText(body.interruptedMachine),
      interruptedFinishedQty: optionalNumber(body.interruptedFinishedQty),
      interruptedSetups: priorityInterruptedSetups(body.interruptedSetups),
      remark: optionalText(body.remark),
    });
    return "Priority saved.";
  }

  if (path === "machine-constraint") {
    await mutations.saveMachineConstraint({
      machineNo: text(body.machineNo),
      unavailableFrom: text(body.unavailableFrom),
      unavailableTo: text(body.unavailableTo),
      reason: text(body.reason),
      remark: optionalText(body.remark),
      rescheduleAction: optionalText(body.rescheduleAction),
    });
    return "Machine issue saved.";
  }

  if (path === "plan-override") {
    await mutations.savePlanOverride({
      target: text(body.target),
      toMachine: text(body.toMachine),
      setupNo: optionalText(body.setupNo),
      fromMachine: optionalText(body.fromMachine),
      reason: optionalText(body.reason),
    });
    return "Plan override saved.";
  }

  if (path === "route-change") {
    await mutations.saveRouteChange({
      target: text(body.target),
      newOption: text(body.newOption),
      changeAfterSetup: optionalText(body.changeAfterSetup),
      applyFromSetup: optionalText(body.applyFromSetup),
      wipQty: optionalNumber(body.wipQty),
      remainingSetups: Array.isArray(body.remainingSetups)
        ? body.remainingSetups.map((row) => {
          const setup = asRecord(row);
          return {
            setupNo: text(setup.setupNo),
            plan: Boolean(setup.plan),
            quantity: optionalNumber(setup.quantity) ?? 0,
            remark: optionalText(setup.remark),
          };
        }).filter((row) => row.setupNo)
        : undefined,
      reason: optionalText(body.reason),
    });
    return "Route change saved.";
  }

  if (path === "dispatch-approval") {
    await mutations.saveDispatchApproval({
      jcNo: text(body.jcNo),
      approvedBy: text(body.approvedBy),
      remark: optionalText(body.remark),
    });
    return "Dispatch approved.";
  }

  if (path === "mark-complete") {
    await mutations.markComplete({
      jcNo: text(body.jcNo),
      completedBy: text(body.completedBy),
      remark: optionalText(body.remark),
      setupNo: optionalText(body.setupNo),
      machine: optionalText(body.machine),
    });
    return "Job card completion saved.";
  }

  if (path === "data-entry") {
    const entryType = text(body.entryType);
    const payload = asRecord(body.payload);
    if (entryType === "software_raw") {
      await mutations.saveProductionEntry(toProductionEntry(payload));
      return "Saved production row.";
    }
    const id = optionalText(body.id);
    const key = optionalText(body.key) || dataEntryKey(entryType, payload);

    await mutations.saveDataEntry({ id: id ? id as Id<"dataEntries"> : undefined, entryType, key: key || undefined, payload });
    return "Saved to Convex.";
  }

  if (path === "reverse-entry") {
    await mutations.reverseEntry({
      targetTable: text(body.targetTable),
      targetId: text(body.targetId),
      targetKey: optionalText(body.targetKey),
      targetLabel: optionalText(body.targetLabel),
      reason: text(body.reason),
      correctedBy: text(body.correctedBy),
    });
    return "Entry reversed. Live status recalculated.";
  }

  if (path === "reschedule") {
    throw new Error("Reschedule is not wired to a Convex mutation yet.");
  }

  if (path === "data-import") {
    throw new Error("Bulk Excel import needs an authenticated Convex upload/import action.");
  }

  throw new Error(`Unsupported dashboard action: ${path}`);
}

function downloadApi(kind: "data-template" | "data-export", entryType: string) {
  window.location.href = `/api/${kind}?entryType=${encodeURIComponent(entryType)}&t=${Date.now()}`;
}

async function postDashboardApi(path: string, body: Record<string, unknown>): Promise<DashboardApiResult> {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(str(payload.error) || `Request failed with status ${response.status}`);
  }
  return {
    message: str(payload.message || payload.savedText) || "Import complete.",
  };
}

function priorityInterruptedSetups(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((row) => asRecord(row))
    .map((row) => ({
      jcNo: text(row.jcNo),
      setupNo: text(row.setupNo),
      machine: text(row.machine),
      finishedQty: optionalNumber(row.finishedQty),
    }))
    .filter((row) => row.jcNo && row.setupNo && row.machine);
  return rows.length ? rows : undefined;
}

function formPayload(form: FormData, fields: LegacyField[]) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = String(form.get(field.name) ?? "").trim();
    if (!value) continue;
    payload[field.name] = field.type === "number" ? Number(value) : value;
  }
  return payload;
}

function text(value: unknown) {
  return str(value);
}

function optionalText(value: unknown) {
  const cleaned = text(value);
  return cleaned || undefined;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toProductionEntry(payload: DashboardPayload) {
  return {
    prodDate: text(payload.prodDate) || new Date().toISOString().slice(0, 10),
    operatorId: text(payload.operatorId) || "Unassigned",
    operatorName: optionalText(payload.operatorName),
    machineType: text(payload.machineType) || "-",
    machine: text(payload.machine) || "-",
    partCode: text(payload.partCode) || "-",
    jobCard: optionalText(payload.jobCard),
    setupNo: optionalText(payload.setupNo),
    outputQty: numeric(payload.outputQty),
    actualQty: optionalNumber(payload.actualQty),
    targetQty: numeric(payload.targetQty),
    rejectQty: numeric(payload.rejectQty),
    rejectionType: optionalText(payload.rejectionType),
    rejectionRemark: optionalText(payload.rejectionRemark),
    downtimeMinutes: optionalNumber(payload.downtimeMinutes),
    downtimeReason: optionalText(payload.downtimeReason),
  };
}

function routeOptionText(option: DashboardPayload, fallback: string) {
  return [
    `Option ${str(option.optionNumber) || fallback}`,
    str(option.machineUsed || option.machine || option.machineFamily),
    str(option.setupName),
    str(option.setupCount || option.numberOfSetups) ? `${str(option.setupCount || option.numberOfSetups)} setups` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });
}

function TrendChart({ points }: { points: DashboardTrendPoint[] }) {
  if (!points.length) {
    return (
      <div className="grid h-72 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
        No production trend available
      </div>
    );
  }

  const max = Math.max(...points.map((point) => Math.max(point.output, point.target, point.reject)), 1);
  const width = 640;
  const height = 240;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const y = (value: number) => height - (value / max) * (height - 24) - 12;
  const line = (key: "output" | "target") =>
    points.map((point, index) => `${index * step},${y(point[key])}`).join(" ");

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-xl border bg-muted/20 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-72 w-full" role="img">
          <title>Production output and target trend</title>
          {[0.25, 0.5, 0.75].map((tick) => (
            <line
              key={tick}
              x1="0"
              x2={width}
              y1={height * tick}
              y2={height * tick}
              className="stroke-border"
              strokeDasharray="4 6"
            />
          ))}
          <polyline points={line("target")} fill="none" className="stroke-muted-foreground" strokeWidth="3" />
          <polyline points={line("output")} fill="none" className="stroke-primary" strokeWidth="4" />
          {points.map((point, index) => (
            <circle key={`${point.label}-${index}`} cx={index * step} cy={y(point.output)} r="4" className="fill-primary" />
          ))}
        </svg>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        {points.slice(-3).map((point) => (
          <div key={point.label} className="rounded-lg border p-3">
            <div className="text-muted-foreground">{point.label}</div>
            <div className="font-medium tabular-nums">{formatNumber(point.output)} output</div>
            <div className="text-xs text-muted-foreground">
              {formatNumber(point.target)} target · {formatNumber(point.reject)} rejected
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedTable({
  title,
  rows,
  valueLabel,
}: {
  title: string;
  rows: DashboardRankedRow[];
  valueLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Sorted by highest recorded output</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">{valueLabel}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={`${title}-${row.label}`}>
                  <TableCell>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-xs text-muted-foreground">{row.detail}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(row.value)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatPercent(row.rate)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No records yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RankedList({
  title,
  rows,
  icon: Icon,
  empty,
}: {
  title: string;
  rows: DashboardRankedRow[];
  icon: typeof Boxes;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Top workbook rows</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length ? (
          rows.slice(0, 5).map((row) => (
            <div key={`${title}-${row.label}`} className="flex items-center gap-3 rounded-xl border p-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{row.label}</div>
                <div className="truncate text-xs text-muted-foreground">{row.detail}</div>
              </div>
              <div className="text-right text-sm font-medium tabular-nums">{formatNumber(row.value)}</div>
            </div>
          ))
        ) : (
          <div className="grid h-36 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
            {empty}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-4xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-4xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-72 rounded-4xl" />
        <Skeleton className="h-72 rounded-4xl" />
      </div>
    </div>
  );
}

function StatusIcon({ tone }: { tone: "default" | "good" | "warning" }) {
  if (tone === "good") return <CheckCircle2 className="size-4 text-green-600" />;
  if (tone === "warning") return <AlertTriangle className="size-4 text-amber-600" />;
  return <Gauge className="size-4 text-muted-foreground" />;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function asRecord(value: unknown): DashboardPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as DashboardPayload;
}

function asArray(value: unknown): DashboardPayload[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => item as DashboardPayload);
}

function str(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value);
}

function displayValue(value: unknown, numeric = false) {
  const textValue = str(value);
  if (!textValue) return "-";
  if (numeric && typeof value === "number") return formatNumber(value);
  if (numeric && Number.isFinite(Number(textValue))) return formatNumber(Number(textValue));
  return formatCell(value);
}

function nextPlanningHolidayLabel(rows: DashboardPayload[]) {
  const today = new Date().toISOString().slice(0, 10);
  const next = rows
    .map((row) => ({
      label: displayValue(row.date),
      value: str(row.dateValue || row.date),
    }))
    .filter((row) => row.value && row.value >= today)
    .sort((a, b) => a.value.localeCompare(b.value))[0];
  return next?.label ?? "-";
}

function machineValue(row: DashboardPayload, type: "machine" | "machineType") {
  if (type === "machine") {
    return displayValue(row.machine || row.machineNo || row["MACHINE NO"] || row["M/C NO"] || row["MACHINE NO."]);
  }
  return displayValue(row.machineType || row["MACHINE TYPE"] || row.type || row.TYPE);
}

function machineMasterLocationValue(row: DashboardPayload) {
  return displayValue(row.location || row.Location || row.LOCATION);
}

function machineBoardRows(machineRows: DashboardPayload[], plannedRows: DashboardPayload[]) {
  const rowsByMachine = new Map<string, DashboardPayload>();
  for (const row of machineRows) {
    const key = machineKey(machineValue(row, "machine"));
    if (!key) continue;
    rowsByMachine.set(key, row);
  }
  for (const row of plannedRows) {
    const machine = machineValue(row, "machine");
    const key = machineKey(machine);
    if (!key || rowsByMachine.has(key)) continue;
    rowsByMachine.set(key, {
      machine,
      machineNo: machine,
      machineType: machineValue(row, "machineType"),
      status: "Planned",
      remarks: "Machine is planned but missing from machine master",
    });
  }

  return [...rowsByMachine.values()].sort((a, b) => machineValue(a, "machine").localeCompare(machineValue(b, "machine"), undefined, { numeric: true }));
}

function jobCardNumber(row: DashboardPayload) {
  return displayValue(row.jcNo || row.JobCardNo || row.jobCard);
}

function itemCode(row: DashboardPayload) {
  return displayValue(row.partCode || row["PART CODE"] || row.itemCode);
}

function machineMasterStatusText(row: DashboardPayload) {
  const rawStatus = str(row.status || row.STATUS || row.activeStatus || row.isActive || row.ACTIVE || row.active || row.Active);
  const normalized = rawStatus.toLowerCase();
  if (!rawStatus) return "Active";
  if (normalized === "planned") return "Not in master";
  if (["active", "yes", "true", "running", "available"].includes(normalized)) return "Active";
  if (["inactive", "no", "false", "deactive", "deactivated", "disabled", "unavailable"].includes(normalized)) return "Inactive";
  return rawStatus;
}

function jobCardTrackingState(row: DashboardPayload) {
  const dispatchStatus = str(row.dispatchStatus).toLowerCase();
  if (dispatchStatus.includes("dispatch")) return "Dispatch";

  const statuses = [
    row.planningBlocker,
    row.routeStatus,
    row.cycleStatus,
    row.toolingStatus,
    row.optionSource,
    row.rmStatus,
  ].map((value) => str(value).toLowerCase());

  if (statuses.some((value) => value.includes("missing") || value.includes("waiting") || value.includes("required"))) {
    return "Needs action";
  }

  if (jobCardHasProduction(row)) {
    return "In production";
  }

  if (statuses.some((value) => value.includes("ready") || value.includes("all checks"))) {
    return "Ready";
  }

  return "Pending";
}

function jobCardHasProduction(row: DashboardPayload) {
  return str(row.runningStatus).toLowerCase() === "running" ||
    str(row.shopFloorStage).toLowerCase() === "operator_started" ||
    Number(row.rawRows) > 0 ||
    Number(row.rawOutputQty) > 0 ||
    Number(row.rawActualQty) > 0;
}

function rowMatchesFieldQuery(row: DashboardPayload, query: string, field: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return rowFieldSearchText(row, field).includes(normalizedQuery);
}

function rowMatchesMachineQuery(row: DashboardPayload, query: string, field: string, plannedByMachine: Map<string, DashboardPayload[]>) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const machinePlans = plannedByMachine.get(machineKey(machineValue(row, "machine"))) ?? [];
  const machineText = rowFieldSearchText(row, field);
  const planText = machinePlans.map((plan) => rowFieldSearchText(plan, field)).join(" ");
  return `${machineText} ${planText}`.includes(normalizedQuery);
}

function rowFieldSearchText(row: DashboardPayload, field: string) {
  const values = field === "jobCard"
    ? [row.jcNo, row.JobCardNo, row.jobCard]
    : field === "part"
      ? [row.partCode, row["PART CODE"], row.itemCode, row.description, row.DESCRIPTION]
      : field === "po"
        ? [row.fgPoNo, row["FG PO NO."]]
        : field === "route"
          ? [row.optionNumber, row.selectedOption, row.option, row.routeStatus, row.cycleStatus, row.toolingStatus, row.setupNo, row.setupName]
          : field === "status"
            ? [jobCardTrackingState(row), row.rmStatus, row.dispatchStatus, row.runningStatus, row.routeStatus, row.cycleStatus, row.toolingStatus]
            : field === "machine"
              ? [row.machine, row.machineNo, row["MACHINE NO"], row["M/C NO"], row["MACHINE NO."]]
              : field === "machineType"
                ? [row.machineType, row["MACHINE TYPE"], row.type, row.TYPE]
                : field === "operator"
                  ? [row.operator, row.operatorName, row["OPERATOR NAME"], row.operatorId]
                  : Object.values(row);
  return values.map((value) => formatCell(value)).join(" ").toLowerCase();
}

function groupPlannedRowsByMachine(rows: DashboardPayload[]) {
  const grouped = new Map<string, DashboardPayload[]>();
  for (const row of rows) {
    const machine = machineValue(row, "machine");
    const key = machineKey(machine);
    if (!key) continue;
    const machineRowsForKey = grouped.get(key) ?? [];
    machineRowsForKey.push(row);
    grouped.set(key, machineRowsForKey);
  }
  return sortGroupedRows(grouped, machinePlanDisplaySort);
}

function groupPlannedRowsByJobCard(rows: DashboardPayload[]) {
  const grouped = new Map<string, DashboardPayload[]>();
  for (const row of rows) {
    const key = machineKey(row.jcNo || row.JobCardNo || row.jobCard);
    if (!key) continue;
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }
  return sortGroupedRows(grouped, jobCardSetupSort);
}

function groupPlannedRowsByPart(rows: DashboardPayload[]) {
  const grouped = new Map<string, DashboardPayload[]>();
  for (const row of rows) {
    const key = machineKey(row.partCode || row["PART CODE"] || row.itemCode);
    if (!key) continue;
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }
  return sortGroupedRows(grouped, jobCardSetupSort);
}

function sortGroupedRows(
  grouped: Map<string, DashboardPayload[]>,
  sorter: (a: DashboardPayload, b: DashboardPayload) => number,
) {
  for (const [key, rows] of grouped) {
    grouped.set(key, [...rows].sort(sorter));
  }
  return grouped;
}

function machinePlanDisplaySort(a: DashboardPayload, b: DashboardPayload) {
  return shopFloorDisplayBucket(a) - shopFloorDisplayBucket(b)
    || shopFloorPlanSort(a, b);
}

function jobCardSetupSort(a: DashboardPayload, b: DashboardPayload) {
  return displayValue(a.setupNo).localeCompare(displayValue(b.setupNo), undefined, { numeric: true })
    || shopFloorPlanSort(a, b);
}

function shopFloorDisplayBucket(row: DashboardPayload) {
  if (shopFloorItemIsFinished(row)) return 2;
  if (shopFloorItemIsCurrent(row)) return 0;
  return 1;
}

function shopFloorItemIsFinished(row: DashboardPayload) {
  return str(row.shopFloorStage) === "item_complete"
    || str(row.runningStatus).toLowerCase() === "complete";
}

function plannedMachineOptions(rows: DashboardPayload[], machineRows: DashboardPayload[] = []) {
  const boardOptions = machineRows.map((row) => machineValue(row, "machine")).filter((value) => value !== "-");
  if (boardOptions.length) return uniqueValues(boardOptions);
  return uniqueValues(rows.map((row) => machineValue(row, "machine")).filter((value) => value !== "-"));
}

function typedFilterMatches(value: string, filter: string) {
  const normalizedFilter = filter.trim().toLowerCase();
  if (!normalizedFilter) return true;
  return value.toLowerCase() === normalizedFilter;
}

function shopFloorItemLabel(row: DashboardPayload) {
  return [
    itemCode(row),
    jobCardNumber(row),
    `Setup ${displayValue(row.setupNo)}`,
    `Option ${displayValue(row.optionNumber)}`,
  ].filter((value) => value && value !== "-").join(" / ");
}

function shopFloorItemMatchesFilter(row: DashboardPayload | undefined, filter: string) {
  const normalizedFilter = filter.trim().toLowerCase();
  if (!normalizedFilter) return true;
  if (!row) return ["empty", "no running item", "no plan"].includes(normalizedFilter);
  return shopFloorItemLabel(row).toLowerCase() === normalizedFilter;
}

function correctionRowMatchesQuery(row: DashboardPayload, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    row.targetTable,
    row.entryType,
    row.targetKey,
    row.targetLabel,
    row.createdAt,
    JSON.stringify(row.details ?? {}),
  ].map((value) => formatCell(value)).join(" ").toLowerCase().includes(normalizedQuery);
}

function shopFloorRowStatus(current: DashboardPayload | undefined, next: DashboardPayload | undefined) {
  if (current) return "Running";
  if (!next) return "No plan";
  return str(next.shopFloorStageLabel) || "Setup required";
}

function jobCardMatchesMachine(
  row: DashboardPayload,
  machineFilter: string,
  plannedByJobCard: Map<string, DashboardPayload[]>,
  plannedByPart: Map<string, DashboardPayload[]>,
) {
  const normalizedFilter = machineFilter.trim().toLowerCase();
  if (!normalizedFilter) return true;
  const plannedRows = [
    ...(plannedByJobCard.get(machineKey(jobCardNumber(row))) ?? []),
    ...(plannedByPart.get(machineKey(itemCode(row))) ?? []),
  ];
  return plannedRows.some((plannedRow) => machineValue(plannedRow, "machine").toLowerCase() === normalizedFilter);
}

function machineMatchesJobCard(machine: string, jobCardFilter: string, plannedByMachine: Map<string, DashboardPayload[]>) {
  const normalizedFilter = jobCardFilter.trim().toLowerCase();
  if (!normalizedFilter) return true;
  const plannedRows = plannedByMachine.get(machineKey(machine)) ?? [];
  return plannedRows.some((plannedRow) => jobCardNumber(plannedRow).toLowerCase() === normalizedFilter);
}

function machineMatchesItemCode(machine: string, itemCodeFilter: string, plannedByMachine: Map<string, DashboardPayload[]>) {
  const normalizedFilter = itemCodeFilter.trim().toLowerCase();
  if (!normalizedFilter) return true;
  const plannedRows = plannedByMachine.get(machineKey(machine)) ?? [];
  return plannedRows.some((plannedRow) => itemCode(plannedRow).toLowerCase() === normalizedFilter);
}

function machineIsRunning(machine: string, plannedByMachine: Map<string, DashboardPayload[]>) {
  const rows = plannedByMachine.get(machineKey(machine)) ?? [];
  return rows.some((row) => str(row.runningStatus).toLowerCase() === "running" || Number(row.rawRows) > 0 || Number(row.rawOutputQty) > 0 || Number(row.rawActualQty) > 0);
}

function currentShopFloorItem(rows: DashboardPayload[]) {
  return rows
    .filter((row) => str(row.shopFloorStage) !== "item_complete")
    .filter((row) => shopFloorItemIsCurrent(row))
    .sort(shopFloorPlanSort)[0];
}

function nextShopFloorItem(rows: DashboardPayload[], current: DashboardPayload | undefined) {
  const currentKey = current ? shopFloorPlanKey(current) : "";
  return rows
    .filter((row) => shopFloorPlanKey(row) !== currentKey)
    .filter((row) => str(row.shopFloorStage) !== "item_complete")
    .filter((row) => !shopFloorItemIsCurrent(row))
    .sort(shopFloorPlanSort)[0];
}

function shopFloorQueueRows(productionControl: DashboardPayload) {
  const plannedRows = asArray(productionControl.machinePlanDetailRows);
  const boardRows = machineBoardRows(asArray(productionControl.machinePlanningRows), plannedRows);
  const plannedByMachine = groupPlannedRowsByMachine(plannedRows);
  return boardRows
    .map((machineRow) => {
      const machine = machineValue(machineRow, "machine");
      const plans = plannedByMachine.get(machineKey(machine)) ?? [];
      const current = currentShopFloorItem(plans);
      const next = nextShopFloorItem(plans, current);
      return {
        machineRow,
        machine,
        location: machineMasterLocationValue(machineRow),
        current,
        next,
      };
    })
    .filter((row): row is {
      machineRow: DashboardPayload;
      machine: string;
      location: string;
      current: DashboardPayload | undefined;
      next: DashboardPayload;
    } => Boolean(row.next));
}

function roleTaskMatches(row: {
  current: DashboardPayload | undefined;
  next: DashboardPayload;
}, role: RoleTaskKind) {
  const nextStage = nextShopFloorStage(row.next);
  if (!nextStage) return false;
  if (row.next.shopFloorTaskReady === false) return false;
  if (role === "shopFloor") {
    return nextStage.id === "raw_material_at_machine" && !row.current;
  }
  if (role === "quality") return nextStage.id === "quality_approval";
  return nextStage.id === "presetting" || nextStage.id === "setting" || nextStage.id === "operator_started";
}

function nextShopFloorStage(row: DashboardPayload) {
  const nextIndex = shopFloorStageIndex(str(row.shopFloorStage)) + 1;
  return shopFloorStages[nextIndex];
}

function pendingTaskLabel(row: DashboardPayload) {
  return nextShopFloorStage(row)?.label ?? "No pending task";
}

function shopFloorItemIsCurrent(row: DashboardPayload) {
  return ["operator_started", "worker_start"].includes(str(row.shopFloorStage))
    || str(row.runningStatus).toLowerCase() === "running"
    || Number(row.rawRows) > 0
    || Number(row.rawOutputQty) > 0
    || Number(row.rawActualQty) > 0;
}

function shopFloorStageIndex(stage: string) {
  const normalizedStage = {
    shop_floor_rm: "raw_material_at_machine",
    tools_drawing: "presetting",
    qc_approval: "quality_approval",
    worker_start: "operator_started",
  }[stage] ?? stage;
  return shopFloorStages.findIndex((item) => item.id === normalizedStage);
}

function shopFloorPlanSort(a: DashboardPayload, b: DashboardPayload) {
  return dateSortValue(plannedSetupDate(a)) - dateSortValue(plannedSetupDate(b))
    || displayValue(a.setupNo).localeCompare(displayValue(b.setupNo), undefined, { numeric: true })
    || itemCode(a).localeCompare(itemCode(b), undefined, { numeric: true });
}

function shopFloorPlanKey(row: DashboardPayload) {
  return [
    jobCardNumber(row),
    itemCode(row),
    displayValue(row.optionNumber),
    displayValue(row.setupNo),
    displayValue(row.machine),
  ].map(machineKey).join("|");
}

function machinePlanningStatus(rows: DashboardPayload[]) {
  if (!rows.length) return "No plan";
  if (rows.some((row) => str(row.runningStatus).toLowerCase() === "setup complete")) return "Setup complete";
  return "Planned";
}

function machineTileFocusSetup(rows: DashboardPayload[]) {
  const completed = rows.filter((row) => str(row.runningStatus).toLowerCase() === "setup complete" || displayValue(row.completionDate) !== "-");
  if (completed.length) return completed.sort((a, b) =>
    dateSortValue(completedSetupDate(b)) - dateSortValue(completedSetupDate(a)) ||
    dateSortValue(plannedSetupDate(b)) - dateSortValue(plannedSetupDate(a)),
  )[0];
  const pending = rows.filter((row) => displayValue(row.completionDate) === "-");
  return (pending.length ? pending : rows).sort((a, b) =>
    dateSortValue(plannedSetupDate(a)) - dateSortValue(plannedSetupDate(b)) ||
    displayValue(a.setupNo).localeCompare(displayValue(b.setupNo), undefined, { numeric: true }),
  )[0];
}

function plannedSetupDate(row: DashboardPayload | undefined) {
  return row?.plannedProductionStartDate || row?.setupPlannedDate || row?.plannedDate;
}

function completedSetupDate(row: DashboardPayload | undefined) {
  return row?.setupCompletionDate || row?.completionDate;
}

function machinePlanningTone(status: string): "success" | "planning" | "warning" | "danger" | "neutral" {
  if (status === "Setup complete") return "success";
  if (status === "Planned") return "planning";
  return "neutral";
}

function allSetupsComplete(rows: DashboardPayload[]) {
  return rows.length > 0 && rows.every((row) => displayValue(row.actualCompletionDate) !== "-");
}

function setupHistoryMatchesQuery(row: DashboardPayload, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    row.setupDate,
    row.jcNo,
    row.machine,
    row.partCode,
    row.optionNumber,
    row.setupNo,
    row.shift,
    row.setterCode,
    row.helperCode,
    row.qcController,
    row.remarks,
  ].map((value) => formatCell(value)).join(" ").toLowerCase().includes(normalizedQuery);
}

function machineKey(value: unknown) {
  return str(value).toLowerCase();
}

function dataEntryKey(entryType: string, payload: Record<string, unknown>) {
  if (entryType === "first_piece_inspection_master") {
    return [
      payload.jcNo,
      payload.partNo,
      payload.uid,
      payload.optionNumber,
      payload.setupNo,
      payload.description,
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "first_piece_inspection_report") {
    return [
      payload.jcNo,
      payload.partCode,
      payload.optionNumber,
      payload.setupNo,
      payload.machine,
      "fpi",
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "setup_checklist") {
    return [
      payload.jcNo,
      payload.partNo,
      payload.optionNumber,
      payload.setupNo,
      payload.machineNo,
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "shop_floor_status") {
    return [
      payload.jcNo,
      payload.partCode,
      payload.optionNumber,
      payload.setupNo,
      payload.machine,
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "planning_holiday") {
    return [
      payload.date,
      payload.scope,
      payload.machine,
      payload.department,
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "work_order" || entryType === "rm_inward") return str(payload.jcNo);
  if (entryType === "route" || entryType === "cycle" || entryType === "tooling") {
    return [payload.partNo, payload.optionNumber, payload.setupNo].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "machine_master") return str(payload.machineNo);
  if (entryType === "employee") return str(payload.empId);
  return "";
}

function firstPieceMasterDefaults(row: DashboardPayload) {
  return {
    jcNo: jobCardNumber(row) !== "-" ? jobCardNumber(row) : "",
    optionNumber: displayValue(row.optionNumber) !== "-" ? displayValue(row.optionNumber) : "",
    setupNo: displayValue(row.setupNo) !== "-" ? displayValue(row.setupNo) : "",
    uid: itemCode(row) !== "-" ? itemCode(row) : "",
    description: "",
    instrumentUsed: "",
    specification: "",
    tolerancePlus: "",
    toleranceMinus: "",
    __returnTab: "firstPieceInspectionTab",
  };
}

function matchingFirstPieceInspectionMasters(masters: DashboardPayload[], row: DashboardPayload) {
  const part = machineKey(itemCode(row));
  const jcNo = machineKey(jobCardNumber(row));
  const option = machineKey(row.optionNumber);
  const setup = machineKey(row.setupNo);
  return masters
    .filter((master) => {
      const masterJcNo = machineKey(master.jcNo || master.jobCard || master.jobCardNumber);
      const masterPart = machineKey(master.uid || master.partNo || master.partCode);
      return (!masterJcNo || masterJcNo === jcNo) &&
        masterPart === part &&
        machineKey(master.optionNumber) === option &&
        machineKey(master.setupNo) === setup;
    })
    .sort((a, b) =>
      displayValue(a.uid).localeCompare(displayValue(b.uid), undefined, { numeric: true }) ||
      displayValue(a.description).localeCompare(displayValue(b.description), undefined, { numeric: true }),
    );
}

function firstPieceMasterKey(master: DashboardPayload) {
  return [
    master._id,
    master.jcNo || master.jobCard || master.jobCardNumber,
    master.partNo || master.partCode,
    master.uid,
    master.optionNumber,
    master.setupNo,
  ].map((value) => str(value).toLowerCase()).filter(Boolean).join("|");
}

function firstPieceReportKey(row: DashboardPayload) {
  return [
    jobCardNumber(row),
    itemCode(row),
    displayValue(row.optionNumber),
    displayValue(row.setupNo),
    displayValue(row.machine),
    "fpi",
  ].map((value) => str(value).toLowerCase()).join("|");
}

function firstPieceReadingsFor(readings: Record<string, string[]>, master: DashboardPayload) {
  return readings[firstPieceMasterKey(master)] ?? Array.from({ length: 5 }, () => "");
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map(str).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function stringArray(value: unknown) {
  return [...new Set((Array.isArray(value) ? value : []).map(str).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

function numValue(row: DashboardPayload, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function sumRows(rows: DashboardPayload[], key: string) {
  return rows.reduce((total, row) => total + numValue(row, key), 0);
}

function safeRatio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function weightedAttendanceFromRows(rows: DashboardPayload[]) {
  const present = sumRows(rows, "presentDays");
  const working = sumRows(rows, "workingDays");
  if (working) return present / working;
  const rates = rows.map((row) => numValue(row, "attendancePct")).filter((value) => value > 0);
  return rates.length ? rates.reduce((total, value) => total + value, 0) / rates.length : 0;
}

function aggregateMachines(rows: DashboardPayload[]) {
  const grouped = new Map<string, { machine: string; machineType: string; output: number; target: number; reject: number; runs: number }>();
  for (const row of rows) {
    const machine = str(row.machine) || "Unspecified";
    const current = grouped.get(machine) ?? { machine, machineType: str(row.machineType), output: 0, target: 0, reject: 0, runs: 0 };
    current.machineType = current.machineType || str(row.machineType);
    current.output += numValue(row, "output");
    current.target += numValue(row, "target");
    current.reject += numValue(row, "reject");
    current.runs += numValue(row, "runs") || 1;
    grouped.set(machine, current);
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      efficiency: safeRatio(row.output, row.target),
      rejectRate: safeRatio(row.reject, row.output),
    }))
    .sort((a, b) => b.output - a.output);
}

function aggregateMachineTypes(rows: DashboardPayload[]) {
  const grouped = new Map<string, { machineType: string; output: number; target: number; reject: number; runs: number }>();
  for (const row of rows) {
    const machineType = str(row.machineType) || "Unspecified";
    const current = grouped.get(machineType) ?? { machineType, output: 0, target: 0, reject: 0, runs: 0 };
    current.output += numValue(row, "output");
    current.target += numValue(row, "target");
    current.reject += numValue(row, "reject");
    current.runs += numValue(row, "runs") || 1;
    grouped.set(machineType, current);
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      efficiency: safeRatio(row.output, row.target),
      rejectRate: safeRatio(row.reject, row.output),
    }))
    .sort((a, b) => b.output - a.output);
}

function operatorBenchmarkDatum(row: DashboardPayload, group: string): BarDatum {
  return {
    key: `${group}-${str(row.operatorId) || str(row.name)}`,
    label: `${str(row.name) || str(row.operatorName) || "Operator"} (${str(row.operatorId) || "-"})`,
    value: numValue(row, "efficiency"),
    detail: `${formatNumber(numValue(row, "output"))} out / ${formatNumber(numValue(row, "target"))} target | ${formatPercent(numValue(row, "rejectRate"))} reject`,
    group,
    tone: group === "Bottom" ? "warning" : "good",
  };
}

function attendanceBenchmarkDatum(row: DashboardPayload, group: string): BarDatum {
  return {
    key: `${group}-${str(row.operatorId) || str(row.name)}`,
    label: `${str(row.name) || "Operator"} (${str(row.operatorId) || "-"})`,
    value: numValue(row, "attendancePct"),
    detail: `${formatNumber(numValue(row, "presentDays"))} present / ${formatNumber(numValue(row, "workingDays"))} working days`,
    group,
    tone: group === "Bottom" ? "warning" : "good",
  };
}

function aggregateBars(rows: DashboardPayload[], label: (row: DashboardPayload) => string, valueKey: string): BarDatum[] {
  const grouped = new Map<string, { label: string; value: number; rows: number }>();
  for (const row of rows) {
    const rowLabel = label(row);
    const current = grouped.get(rowLabel) ?? { label: rowLabel, value: 0, rows: 0 };
    current.value += numValue(row, valueKey);
    current.rows += 1;
    grouped.set(rowLabel, current);
  }
  return [...grouped.values()]
    .map((row) => ({
      key: row.label,
      label: row.label,
      value: row.value,
      detail: `${formatNumber(row.rows)} rows`,
    }))
    .sort((a, b) => b.value - a.value);
}

function durationLabel(minutes: number) {
  if (!minutes) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

function hoursLabel(hours: number) {
  if (!hours) return "0h";
  return `${formatNumber(hours)}h`;
}

function tableColumns(rows: DashboardPayload[]) {
  const priority = [
    "type",
    "date",
    "month",
    "jcNo",
    "target",
    "machineNo",
    "machine",
    "machineType",
    "optionNumber",
    "setupNo",
    "operatorId",
    "name",
    "manager",
    "fromMachine",
    "toMachine",
    "action",
    "reason",
    "recommendedTraining",
    "trainingStatus",
    "flags",
    "keyIssue",
    "machineIssue",
    "trainingNeed",
    "targetRealistic",
    "efficiencyIdea",
    "motivation",
    "output",
    "efficiency",
    "rejectRate",
    "remark",
    "createdAt",
  ];
  const seen = new Set<string>();

  for (const key of priority) {
    if (rows.some((row) => row[key] !== undefined && row[key] !== "")) {
      seen.add(key);
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "_id" || key === "_creationTime" || key === "ownerId") continue;
      seen.add(key);
      if (seen.size >= 12) return [...seen];
    }
  }

  return [...seen];
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.map(formatCell).join(", ") || "-";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? formatDate(value) : value;
  }
  return JSON.stringify(value);
}
