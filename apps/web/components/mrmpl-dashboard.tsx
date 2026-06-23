"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
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
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  UserRoundCheck,
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
  formatNumber,
  formatPercent,
  toDashboardViewModel,
  type DashboardRankedRow,
  type DashboardTrendPoint,
} from "@/lib/dashboard-view-model";
import { machineFamilyKey } from "@/lib/planning-rules";
import { api } from "@/convex/_generated/api";

type DashboardPayload = Record<string, unknown>;

type LegacyFilters = {
  operatorId: string;
  machineType: string;
  machine: string;
  month: string;
  startDate: string;
  endDate: string;
};

type ActionStatus = {
  tone: "default" | "destructive";
  message: string;
} | null;

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
  | "planningControlTab"
  | "shopFloorTab";

const emptyFilters: LegacyFilters = {
  operatorId: "",
  machineType: "",
  machine: "",
  month: "",
  startDate: "",
  endDate: "",
};

const workbookFiltersStorageKey = "mrmpl-dashboard:workbook-filters";
const workbookFilterListeners = new Set<() => void>();
let workbookFiltersSnapshot = emptyFilters;
let workbookFiltersSerialized = "";

function normalizeWorkbookFilters(value: unknown): LegacyFilters {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Partial<Record<keyof LegacyFilters, unknown>>
    : {};

  return {
    operatorId: typeof record.operatorId === "string" ? record.operatorId : "",
    machineType: typeof record.machineType === "string" ? record.machineType : "",
    machine: typeof record.machine === "string" ? record.machine : "",
    month: typeof record.month === "string" ? record.month : "",
    startDate: typeof record.startDate === "string" ? record.startDate : "",
    endDate: typeof record.endDate === "string" ? record.endDate : "",
  };
}

function parseStoredWorkbookFilters(serialized: string) {
  if (!serialized) return emptyFilters;

  try {
    return normalizeWorkbookFilters(JSON.parse(serialized));
  } catch {
    return emptyFilters;
  }
}

function workbookFiltersAreEmpty(filters: LegacyFilters) {
  return Object.values(filters).every((value) => value === "");
}

function getWorkbookFiltersSnapshot() {
  if (typeof window === "undefined") return emptyFilters;

  let serialized = "";
  try {
    serialized = window.localStorage.getItem(workbookFiltersStorageKey) ?? "";
  } catch {
    return workbookFiltersSnapshot;
  }

  if (serialized !== workbookFiltersSerialized) {
    workbookFiltersSerialized = serialized;
    workbookFiltersSnapshot = parseStoredWorkbookFilters(serialized);
  }

  return workbookFiltersSnapshot;
}

function getWorkbookFiltersServerSnapshot() {
  return emptyFilters;
}

function subscribeWorkbookFilters(listener: () => void) {
  workbookFilterListeners.add(listener);

  function onStorage(event: StorageEvent) {
    if (event.key === workbookFiltersStorageKey) {
      listener();
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    workbookFilterListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function writeWorkbookFilters(nextFilters: LegacyFilters) {
  const normalized = normalizeWorkbookFilters(nextFilters);
  const serialized = workbookFiltersAreEmpty(normalized) ? "" : JSON.stringify(normalized);

  try {
    if (serialized) {
      window.localStorage.setItem(workbookFiltersStorageKey, serialized);
    } else {
      window.localStorage.removeItem(workbookFiltersStorageKey);
    }
  } catch {
    // The in-memory snapshot still updates if storage is unavailable.
  }

  workbookFiltersSerialized = serialized;
  workbookFiltersSnapshot = normalized;
  workbookFilterListeners.forEach((listener) => listener());
}

function useStoredWorkbookFilters() {
  const filters = useSyncExternalStore(
    subscribeWorkbookFilters,
    getWorkbookFiltersSnapshot,
    getWorkbookFiltersServerSnapshot,
  );
  const setFilters = useCallback<React.Dispatch<React.SetStateAction<LegacyFilters>>>((value) => {
    const current = getWorkbookFiltersSnapshot();
    const next = typeof value === "function" ? value(current) : value;
    writeWorkbookFilters(next);
  }, []);

  return [filters, setFilters] as const;
}

const navItems: Array<{ id: DashboardTabId; title: string; subtitle: string; icon: typeof LayoutDashboard }> = [
  { id: "productionControlTab", title: "Planner Actions", subtitle: "priority, route, dispatch", icon: ClipboardList },
  { id: "jobCardStatusTab", title: "Job Cards", subtitle: "running and completed", icon: PackageCheck },
  { id: "machineDetailTab", title: "Machine Detail", subtitle: "setup planning", icon: Factory },
  { id: "masterGapsTab", title: "Master Readiness", subtitle: "missing planning data", icon: Database },
  { id: "dataEntryTab", title: "Data Entry", subtitle: "imports and manual entry", icon: ListChecks },
  { id: "planningControlTab", title: "Planning Control", subtitle: "route and plan checks", icon: Route },
  { id: "shopFloorTab", title: "Shop Floor", subtitle: "output and downtime", icon: LayoutDashboard },
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
    entryType: "setup_checklist",
    title: "Setup checklist",
    description: "Daily setup readiness and QC control record.",
    fields: [
      { name: "jcNo", label: "JC no.", required: true },
      { name: "setupDate", label: "Setup date", type: "date", required: true },
      { name: "machineNo", label: "Machine no.", required: true },
      { name: "partNo", label: "Part no.", required: true },
      { name: "setupNo", label: "Setup no.", required: true },
      { name: "shift", label: "Shift" },
      { name: "setterCode", label: "Setter code" },
      { name: "helperCode", label: "Helper code" },
      { name: "settingStartTime", label: "Start time", type: "time" },
      { name: "settingEndTime", label: "End time", type: "time" },
      { name: "qcController", label: "QC controller" },
      { name: "rimmerAvailability", label: "Rimmer availability" },
      { name: "modhiyu", label: "Modhiyu" },
      { name: "remarks", label: "Remarks" },
    ],
  },
];

const subscribeToHydration = () => () => {};
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

export function MrmplDashboard() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <AuthScreen />;

  return <DashboardShell />;
}

function DashboardShell() {
  const [filters, setFilters] = useStoredWorkbookFilters();
  const [activeTab, setActiveTab] = useState<DashboardTabId>("productionControlTab");
  const [preferredDataEntryType, setPreferredDataEntryType] = useState(dataEntrySpecs[0]?.entryType ?? "route");
  const [preferredDataEntryDefaults, setPreferredDataEntryDefaults] = useState<Record<string, unknown>>({});
  const [actionStatus, setActionStatus] = useState<ActionStatus>(null);
  const snapshotArgs = useMemo(() => ({
    operatorId: filters.operatorId || undefined,
    machineType: filters.machineType || undefined,
    machine: filters.machine || undefined,
    month: filters.month || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  }), [filters]);
  const dashboardPayload = useQuery(api.dashboard.snapshot, snapshotArgs);
  const saveRouteSelection = useMutation(api.dashboard.saveRouteSelection);
  const savePlannerPriority = useMutation(api.dashboard.savePlannerPriority);
  const saveMachineConstraint = useMutation(api.dashboard.saveMachineConstraint);
  const savePlanOverride = useMutation(api.dashboard.savePlanOverride);
  const saveRouteChange = useMutation(api.dashboard.saveRouteChange);
  const saveDispatchApproval = useMutation(api.dashboard.saveDispatchApproval);
  const markComplete = useMutation(api.dashboard.markComplete);
  const saveProductionEntry = useMutation(api.dashboard.saveProductionEntry);
  const saveDataEntry = useMutation(api.dashboard.saveDataEntry);

  async function submitAction(path: string, body: Record<string, unknown>) {
    setActionStatus(null);
    try {
      const message = path === "data-import"
        ? await postDashboardApi(path, body)
        : await runDashboardAction(path, body, {
            saveRouteSelection,
            savePlannerPriority,
            saveMachineConstraint,
            savePlanOverride,
            saveRouteChange,
            saveDispatchApproval,
            markComplete,
            saveProductionEntry,
            saveDataEntry,
          });
      setActionStatus({
        tone: "default",
        message,
      });
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

  const isDashboardLoading = dashboardPayload === undefined;
  const payload = isDashboardLoading ? {} : asRecord(dashboardPayload);
  const selectedTab = navItems.find((item) => item.id === activeTab) ?? navItems[0]!;

  const view = useMemo(
    () => toDashboardViewModel(dashboardPayload),
    [dashboardPayload],
  );

  function clearDates() {
    setFilters((current) => ({ ...current, month: "", startDate: "", endDate: "" }));
  }

  function clearOperator() {
    setFilters((current) => ({ ...current, operatorId: "" }));
  }

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
          <HeaderActions />
        </header>
        <main className="@container/main flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          <DashboardFiltersBar
            payload={payload}
            filters={filters}
            setFilters={setFilters}
            clearDates={clearDates}
            clearOperator={clearOperator}
          />
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
              openDataEntry={openDataEntry}
              openMasterReadiness={openMasterReadiness}
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

function HeaderActions() {
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
  openDataEntry,
  openMasterReadiness,
  preferredDataEntryType,
  preferredDataEntryDefaults,
}: {
  activeTab: DashboardTabId;
  payload: DashboardPayload;
  view: ReturnType<typeof toDashboardViewModel>;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void;
  openMasterReadiness: () => void;
  preferredDataEntryType: string;
  preferredDataEntryDefaults: Record<string, unknown>;
}) {
  const productionControl = asRecord(payload.productionControl);

  if (activeTab === "jobCardStatusTab") {
    return <JobCardsPanel productionControl={productionControl} submitAction={submitAction} openMasterReadiness={openMasterReadiness} />;
  }

  if (activeTab === "machineDetailTab") {
    return <MachineDetailPanel productionControl={productionControl} view={view} />;
  }

  if (activeTab === "masterGapsTab") {
    return <MasterReadinessPanel productionControl={productionControl} submitAction={submitAction} openDataEntry={openDataEntry} />;
  }

  if (activeTab === "dataEntryTab") {
    return <DataEntryPanel payload={payload} submitAction={submitAction} preferredEntryType={preferredDataEntryType} preferredDefaults={preferredDataEntryDefaults} />;
  }

  if (activeTab === "planningControlTab") {
    return <PlanningControlPanel payload={payload} productionControl={productionControl} submitAction={submitAction} />;
  }

  if (activeTab === "shopFloorTab") {
    return <ShopFloorPanel payload={payload} view={view} submitAction={submitAction} />;
  }

  return <ProductionControlPanel productionControl={productionControl} view={view} submitAction={submitAction} />;
}

function DashboardFiltersBar({
  payload,
  filters,
  setFilters,
  clearDates,
  clearOperator,
}: {
  payload: DashboardPayload;
  filters: LegacyFilters;
  setFilters: React.Dispatch<React.SetStateAction<LegacyFilters>>;
  clearDates: () => void;
  clearOperator: () => void;
}) {
  const sourceFilters = asRecord(payload.filters);
  const operators = asArray(sourceFilters.operators);
  const machineTypes = stringArray(sourceFilters.machineTypes);
  const machines = stringArray(sourceFilters.activeMachines).length
    ? stringArray(sourceFilters.activeMachines)
    : stringArray(sourceFilters.machines);
  const months = asArray(sourceFilters.months);

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="size-4" />
          Workbook filters
        </CardTitle>
        <CardDescription>Same filter contract as the legacy dashboard: operator, machine, month, and date range.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Field label="Operator">
          <Input
            list="operator-options"
            placeholder="OP-1"
            value={filters.operatorId}
            onChange={(event) => setFilters((current) => ({ ...current, operatorId: event.target.value }))}
          />
          <datalist id="operator-options">
            {operators.map((operator) => {
              const record = asRecord(operator);
              const id = str(record.operatorId);
              return <option key={id || str(record.name)} value={id} label={str(record.name)} />;
            })}
          </datalist>
        </Field>
        <Field label="Machine type">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={filters.machineType}
            onChange={(event) => setFilters((current) => ({ ...current, machineType: event.target.value, machine: "" }))}
          >
            <option value="">All types</option>
            {machineTypes.map((machineType) => (
              <option key={machineType} value={machineType}>
                {machineType}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Machine no.">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={filters.machine}
            onChange={(event) => setFilters((current) => ({ ...current, machine: event.target.value }))}
          >
            <option value="">All machines</option>
            {machines.map((machine) => (
              <option key={machine} value={machine}>
                {machine}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Month">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={filters.month}
            onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
          >
            <option value="">All months</option>
            {months.map((month) => {
              const record = asRecord(month);
              const key = str(record.key);
              return (
                <option key={key} value={key}>
                  {str(record.label) || key}
                </option>
              );
            })}
          </select>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={filters.startDate}
            onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={filters.endDate}
            onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
          />
        </Field>
        <div className="flex gap-2 md:col-span-2 xl:col-span-6">
          <Button type="button" variant="outline" size="sm" onClick={clearOperator}>
            All operators
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearDates}>
            Clear dates
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductionControlPanel({
  productionControl,
  view,
  submitAction,
}: {
  productionControl: DashboardPayload;
  view: ReturnType<typeof toDashboardViewModel>;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <>
      <OverviewMetrics view={view} />
      <PlannerDecisionConsole submitAction={submitAction} />
      <ActionLogTable rows={asArray(productionControl.plannerActionLog)} />
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Route selections" rows={asArray(productionControl.routeOptions)} empty="No route selections yet" />
        <DataRowsCard title="Machine issues" rows={asArray(productionControl.machineConstraintRows)} empty="No machine constraints yet" />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Work-order readiness" rows={asArray(productionControl.workOrders)} empty="No work-order readiness rows returned" />
        <DataRowsCard title="Dispatch loss" rows={asArray(productionControl.dispatchLoss)} empty="No dispatch loss rows returned" />
      </section>
      <DataRowsCard title="Combined job cards" rows={asArray(productionControl.combinedBatches)} empty="No combined job-card rows returned" />
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
      <section className="grid gap-4 @5xl/main:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Production trend</CardTitle>
            <CardDescription>Output, target, and rejection volume by month</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart points={view.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Planning focus</CardTitle>
            <CardDescription>Highest-impact records from the current workbook</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <FocusRow icon={Factory} label="Machines tracked" value={view.machines.length} />
            <FocusRow icon={UserRoundCheck} label="Operators tracked" value={view.operators.length} />
            <FocusRow icon={AlertTriangle} label="Rejection buckets" value={view.rejections.length} />
            <FocusRow icon={CalendarClock} label="Downtime buckets" value={view.downtime.length} />
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function PlannerDecisionConsole({
  submitAction,
}: {
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Planner decision console</CardTitle>
        <CardDescription>Priority changes, machine breakdowns, part-specific machine switches, and mid-route changes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LegacyActionForm
          title="1. Priority change"
          description="Use when a job card or part becomes urgent without changing the machine route."
          fields={[
            { name: "target", label: "Job card or part code", placeholder: "JC-003 or R29", required: true },
            { name: "priority", label: "Priority", options: ["Urgent", "High", "Normal", "Low"], defaultValue: "Urgent" },
            { name: "remark", label: "Reason", placeholder: "Customer urgent / dispatch commitment" },
          ]}
          buttonLabel="Add priority"
          onSubmit={(body) => submitAction("planner-priority", body)}
        />
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
        <LegacyActionForm
          title="4. Mid-route change"
          description="Use when production has started and remaining setups need a different route option."
          fields={[
            { name: "target", label: "Job card / part", placeholder: "Prefer JC No.", required: true },
            { name: "changeAfterSetup", label: "Change after setup", placeholder: "10" },
            { name: "newOption", label: "New route option", placeholder: "Option B", required: true },
            { name: "applyFromSetup", label: "Continue from setup", placeholder: "20" },
            { name: "wipQty", label: "WIP qty carried", type: "number", placeholder: "optional" },
            { name: "reason", label: "Reason", placeholder: "Why route is changing midway", required: true },
          ]}
          buttonLabel="Change route"
          onSubmit={(body) => submitAction("route-change", body)}
        />
        <Button type="button" variant="outline" onClick={() => void submitAction("reschedule", {})}>
          <Settings2 className="size-4" />
          Reschedule
        </Button>
      </CardContent>
    </Card>
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
      <Card>
        <CardHeader>
          <CardTitle>Job card status</CardTitle>
          <CardDescription>Selected routes, running setup completion, and dispatch approval use the same endpoint contract as legacy.</CardDescription>
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
      <JobCardTileBoard
        rows={asArray(productionControl.jobCardStatusTiles)}
        plannedRows={asArray(productionControl.machinePlanDetailRows)}
        machineRows={asArray(productionControl.machinePlanningRows)}
        actionNeededCount={asArray(productionControl.allWorkOrderGaps).length}
        openMasterReadiness={openMasterReadiness}
      />
      <DataRowsCard title="Running parts" rows={asArray(productionControl.runningParts)} empty="No running job cards returned" />
      <DataRowsCard title="Dispatch handoff" rows={asArray(productionControl.dispatchHandoff)} empty="No dispatch handoff rows returned" />
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard
          title="Setup completions"
          rows={asArray(productionControl.jobCardSetupProgressRows).length ? asArray(productionControl.jobCardSetupProgressRows) : asArray(productionControl.jobCardSetupProgress)}
          empty="No completions saved yet"
        />
        <DataRowsCard title="Dispatch approvals" rows={asArray(productionControl.dispatchRows)} empty="No dispatch approvals saved yet" />
      </section>
    </section>
  );
}

function MachineDetailPanel({
  productionControl,
  view,
}: {
  productionControl: DashboardPayload;
  view: ReturnType<typeof toDashboardViewModel>;
}) {
  return (
    <>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <RankedTable title="Machine performance" rows={view.machines} valueLabel="Output" />
        <RankedTable title="Operator performance" rows={view.operators} valueLabel="Output" />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Part-specific machine switches" rows={asArray(productionControl.planOverrideRows)} empty="No plan switches saved yet" />
        <DataRowsCard title="Machine unavailable / breakdown" rows={asArray(productionControl.machineConstraintRows)} empty="No machine issues saved yet" />
      </section>
      <MachinePlanningBoard rows={asArray(productionControl.machinePlanningRows)} plannedRows={asArray(productionControl.machinePlanDetailRows)} />
      <DataRowsCard title="Machine setup plan" rows={asArray(productionControl.machinePlanDetailRows)} empty="No machine setup plan rows returned" />
    </>
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
        description="Planner view for every work order with missing route option, route master, cycle time, or tooling."
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
      || (gapFilter === "tooling" && Boolean(row.toolingPlanMissing));
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
          <div className="grid gap-2 sm:grid-cols-3">
            {row.routeMasterMissing ? (
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openDataEntry("route", dataEntryDefaultsFromGap(row, "route"))}>Add routing</Button>
            ) : null}
            {row.cycleTimeMissing ? (
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openDataEntry("cycle", dataEntryDefaultsFromGap(row, "cycle"))}>Add cycle time</Button>
            ) : null}
            {row.toolingPlanMissing ? (
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openDataEntry("tooling", dataEntryDefaultsFromGap(row, "tooling"))}>Add tooling</Button>
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
  ].filter(Boolean);
}

function workOrderNeedsAction(row: DashboardPayload) {
  return Boolean(row.routeSelectionMissing || row.routeMasterMissing || row.cycleTimeMissing || row.toolingPlanMissing);
}

function dataEntryDefaultsFromGap(row: DashboardPayload, entryType: "route" | "cycle" | "tooling") {
  const optionNumber = str(row.optionNumber || row.selectedOption);
  const setupNo = str(row.missingSetupNo || row.setupNo);
  const setupName = str(row.setupName || row.missingSetupName);
  const machineUsed = str(row.machineUsed || row.routeMachine || row.machineFamily || row.machineType);
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
    form.reset();
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
          onSubmit={(body) => void submitAction("data-entry", { entryType: spec.entryType, payload: body })}
        />
      </CardContent>
    </Card>
  );
}

function PlanningControlPanel({
  payload,
  productionControl,
  submitAction,
}: {
  payload: DashboardPayload;
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const setupAnalytics = asRecord(payload.setupAnalytics);
  const toolFixtureNumbers = asRecord(payload.toolFixtureNumbers);
  const routingStatus = asRecord(payload.routingStatus);

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Route selection</CardTitle>
          <CardDescription>Planner route decisions are written through the same legacy-compatible endpoint.</CardDescription>
        </CardHeader>
        <CardContent>
          <LegacyActionForm
            title="Save selected route"
            description="Choose the route option for a job card."
            fields={[
              { name: "jcNo", label: "Job card", placeholder: "JC-1001", required: true },
              { name: "optionNumber", label: "Route option", placeholder: "1", required: true },
            ]}
            buttonLabel="Save route"
            onSubmit={(body) => submitAction("route-selection", body)}
          />
        </CardContent>
      </Card>
      <MachineTypeKpiGrid rows={asArray(payload.machineTypeRows)} />
      <section className="grid gap-4 @5xl/main:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <MonthlyMachineUsagePanel rows={asArray(payload.monthlyMachineUsage)} />
        <SetupSummaryPanel setupAnalytics={setupAnalytics} />
      </section>
      <RoutingStatusPanel routingStatus={routingStatus} />
      <RouteSelectionQueue rows={asArray(productionControl.routeSelectionRequired)} submitAction={submitAction} />
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Route selections" rows={asArray(productionControl.routeOptions)} empty="No route options saved yet" />
        <DataRowsCard title="Route changes" rows={asArray(productionControl.routeChangeRows)} empty="No route changes saved yet" />
      </section>
      <SetupTrendPanel setupAnalytics={setupAnalytics} />
      <RejectionAnalysisPanel payload={payload} />
      <DowntimeAnalysisPanel payload={payload} />
      <ToolFixturePanel rows={asArray(toolFixtureNumbers.rows)} />
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Routing status" rows={asArray(asRecord(payload.routingStatus).rows)} empty="No routing status rows returned" />
        <DataRowsCard title="Monthly machine usage" rows={asArray(payload.monthlyMachineUsage)} empty="No monthly machine usage rows returned" />
      </section>
      <section className="grid gap-4 @5xl/main:grid-cols-2">
        <DataRowsCard title="Tool and fixture numbers" rows={asArray(asRecord(payload.toolFixtureNumbers).rows)} empty="No tool/fixture rows returned" />
        <DataRowsCard title="Setup analytics" rows={asArray(asRecord(payload.setupAnalytics).rows)} empty="No setup analytics rows returned" />
      </section>
    </section>
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
        <DataRowsCard title="Tool / fixture detail" rows={rows} empty="No tool/fixture rows returned" />
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
      (trackingState === "all" || jobCardTrackingState(row) === trackingState),
    ),
    [itemCodeFilter, jobCardFilter, machineFilter, plannedByJobCard, plannedByPart, query, rows, searchField, trackingState],
  );
  const needsAction = actionNeededCount;
  const pendingRm = rows.filter((row) => displayValue(row.rmStatus) !== "Received").length;
  const ready = rows.filter((row) => jobCardTrackingState(row) === "Ready").length;
  const inProduction = rows.filter((row) => jobCardTrackingState(row) === "In production").length;

  function clearJobCardFilters() {
    setQuery("");
    setSearchField("all");
    setTrackingState("all");
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
                  <JobCardTile key={`${str(row.jcNo || row.JobCardNo || row.jobCard) || "job-card"}-${index}`} row={row} />
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

function JobCardTile({ row }: { row: DashboardPayload }) {
  const jcNo = displayValue(row.jcNo || row.JobCardNo || row.jobCard);
  const partCode = displayValue(row.partCode || row["PART CODE"] || row.itemCode);
  const option = displayValue(row.optionNumber || row.selectedOption || row.option);
  const blocker = displayValue(row.planningBlocker || row.nextAction || row.routeStatus);
  const trackingState = jobCardTrackingState(row);

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
          <StatusBadge value={row.dispatchStatus} />
        </div>
      </div>
      <TileField label="Description" value={row.description || row.DESCRIPTION} />
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
      <TileField label="Planning action" value={blocker} important />
    </article>
  );
}

function MachinePlanningBoard({ rows, plannedRows }: { rows: DashboardPayload[]; plannedRows: DashboardPayload[] }) {
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const boardRows = useMemo(() => machineBoardRows(rows, plannedRows), [plannedRows, rows]);
  const machineTypes = useMemo(() => uniqueValues(boardRows.map((row) => machineValue(row, "machineType")).filter((value) => value !== "-")), [boardRows]);
  const [machineType, setMachineType] = useState("all");
  const [machineFilter, setMachineFilter] = useState("");
  const [jobCardFilter, setJobCardFilter] = useState("");
  const [runningFilter, setRunningFilter] = useState("all");
  const [selectedMachine, setSelectedMachine] = useState("");
  const plannedByMachine = useMemo(() => groupPlannedRowsByMachine(plannedRows), [plannedRows]);
  const jobCardOptions = useMemo(() => uniqueValues(plannedRows.map(jobCardNumber).filter((value) => value !== "-")), [plannedRows]);
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
        (machineType === "all" || machineValue(row, "machineType") === machineType) &&
        (runningFilter === "all" || (runningFilter === "running" ? isRunning : !isRunning))
      );
    }),
    [boardRows, jobCardFilter, machineFilter, machineType, plannedByMachine, query, runningFilter, searchField],
  );
  const runningRows = boardRows.filter((row) => machineIsRunning(machineValue(row, "machine"), plannedByMachine)).length;
  const selectedPlans = selectedMachine ? plannedByMachine.get(machineKey(selectedMachine)) ?? [] : [];

  function clearMachineFilters() {
    setQuery("");
    setSearchField("all");
    setMachineType("all");
    setMachineFilter("");
    setJobCardFilter("");
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
              ]}
            />
            <div>
              <Button type="button" variant="outline" size="sm" onClick={clearMachineFilters}>
                Clear filters
              </Button>
            </div>
            {filteredRows.length ? (
              <div className="grid max-h-[42rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 @7xl/main:grid-cols-3">
                {filteredRows.map((row, index) => (
                  <MachinePlanningTile
                    key={`${machineValue(row, "machine")}-${index}`}
                    row={row}
                    plannedCount={plannedByMachine.get(machineKey(machineValue(row, "machine")))?.length ?? 0}
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
  plannedCount,
  isRunning,
  selected,
  onSelect,
}: {
  row: DashboardPayload;
  plannedCount: number;
  isRunning: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const machine = machineValue(row, "machine");
  const machineType = machineValue(row, "machineType");
  const status = machineMasterStatusText(row);
  const planningStatus = plannedCount > 0 ? "Planned" : "No plan";

  return (
    <button
      type="button"
      className={`grid gap-3 rounded-lg border bg-background p-3 text-left transition hover:border-primary/60 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 ${selected ? "border-primary bg-muted/40" : ""}`}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold">{machine}</div>
          <div className="break-words text-xs text-muted-foreground">{machineType}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <MachineStateBadge label="Run" value={isRunning ? "Running" : "Not running"} tone={isRunning ? "success" : "neutral"} />
          <MachineStateBadge label="Plan" value={planningStatus} tone={plannedCount > 0 ? "planning" : "neutral"} />
          <MachineStateBadge label="Master" value={status} tone={status === "Active" ? "success" : status === "Inactive" ? "danger" : "warning"} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TileField label="Location" value={row.location || row.LOCATION || row.Location} />
        <TileField label="Capacity" value={row.capacity || row.CAPACITY || row.Capacity} numeric />
        <TileField label="Operator" value={row.operator || row.operatorName || row["OPERATOR NAME"]} />
        <TileField label="Planned setups" value={plannedCount} numeric />
        <TileField label="Priority" value={row.priority || row.PRIORITY} />
        <TileField label="Current job card" value={row.jcNo || row.jobCard || row.JobCardNo} />
        <TileField label="Current part" value={row.partCode || row["PART CODE"] || row.itemCode} />
        <TileField label="Remarks" value={row.remark || row.remarks || row.REMARKS} important />
      </div>
    </button>
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
  const variant: "destructive" | "outline" | "secondary" = normalized.includes("missing") || normalized.includes("waiting") || normalized.includes("required") || normalized.includes("breakdown")
    ? "destructive"
    : normalized === "-"
      ? "outline"
      : "secondary";

  return <Badge variant={variant}>{text}</Badge>;
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
  savePlannerPriority: (args: { target: string; priority: string; remark?: string }) => Promise<unknown>;
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
  saveDataEntry: (args: { entryType: string; key?: string; payload: unknown }) => Promise<unknown>;
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
      priority: text(body.priority) || "Normal",
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

    await mutations.saveDataEntry({ entryType, payload });
    return "Saved to Convex.";
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

async function postDashboardApi(path: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(str(payload.error) || `Request failed with status ${response.status}`);
  }
  return str(payload.message || payload.savedText) || "Import complete.";
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

function FocusRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Factory;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <div className="grid size-9 place-items-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </div>
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{formatNumber(value)}</span>
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

function machineValue(row: DashboardPayload, type: "machine" | "machineType") {
  if (type === "machine") {
    return displayValue(row.machine || row.machineNo || row["MACHINE NO"] || row["M/C NO"] || row["MACHINE NO."]);
  }
  return displayValue(row.machineType || row["MACHINE TYPE"] || row.type || row.TYPE);
}

function machineBoardRows(machineRows: DashboardPayload[], plannedRows: DashboardPayload[]) {
  const rowsByMachine = new Map<string, DashboardPayload>();
  for (const row of machineRows) {
    const key = machineKey(machineValue(row, "machine"));
    if (!key) continue;
    rowsByMachine.set(key, row);
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

  if (Number(row.rawRows) > 0 || Number(row.rawOutputQty) > 0 || Number(row.rawActualQty) > 0) {
    return "In production";
  }

  if (statuses.some((value) => value.includes("ready") || value.includes("all checks"))) {
    return "Ready";
  }

  return "Pending";
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
  return grouped;
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
  return grouped;
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
  return grouped;
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

function machineIsRunning(machine: string, plannedByMachine: Map<string, DashboardPayload[]>) {
  const rows = plannedByMachine.get(machineKey(machine)) ?? [];
  return rows.some((row) => str(row.runningStatus).toLowerCase() === "running" || Number(row.rawRows) > 0 || Number(row.rawOutputQty) > 0 || Number(row.rawActualQty) > 0);
}

function machineKey(value: unknown) {
  return str(value).toLowerCase();
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
