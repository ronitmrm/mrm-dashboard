"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type DragEvent, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Database,
  Factory,
  Gauge,
  GripVertical,
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
  jobCardScheduleSummary,
  toDashboardViewModel,
} from "@/lib/dashboard-view-model";
import { compatibleDestinationMachineOptions, machineConstraintQueueReview, type MachineConstraintQueueReviewGroup } from "@/lib/machine-constraint-review";
import { planningRefreshStatusMessage, shouldQueuePlanningRefresh, shouldRefreshStalePlanningSnapshot } from "@/lib/planning-refresh-policy";
import { priorityChangePlan, priorityPlanHeldBlockers, priorityPlanQueueBeforeSetups, priorityPlanStepWindows, type PriorityPlanStep } from "@/lib/priority-change-plan";
import type { PriorityPlanWindow } from "@/lib/priority-plan-scenarios";
import {
  applyShopFloorStatusPatches,
  shopFloorStatusPatchFromAction,
  upsertShopFloorStatusPatch,
  type ShopFloorStatusPatch,
} from "@/lib/shop-floor-optimistic";
import { useTheme } from "@/components/theme-provider";
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

type PlanningRefreshLock = {
  baselineRequestedAtMs: number | null;
  baselineCompletedAtMs: number | null;
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
    entryType: "setup_checklist_master",
    title: "Setup checklist master",
    description: "Versioned machinist checklist used from pre setting start through setting completion.",
    fields: [
      { name: "version", label: "Version", required: true },
      { name: "sequence", label: "Sequence", type: "number", required: true },
      { name: "checkPoint", label: "Check point", required: true },
      { name: "inputType", label: "Input type", options: ["checkbox", "text", "number"], defaultValue: "checkbox" },
      { name: "required", label: "Required", options: ["Yes", "No"], defaultValue: "Yes" },
      { name: "section", label: "Section", defaultValue: "Pre setting / setting" },
      { name: "effectiveFrom", label: "Effective from", type: "date" },
      { name: "status", label: "Status", options: ["Active", "Inactive"], defaultValue: "Active" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "downtime_reason_master",
    title: "Downtime reason master",
    description: "Downtime reason codes used by shop floor, quality, and machinist downtime entries.",
    fields: [
      { name: "code", label: "Downtime code", required: true },
      { name: "reason", label: "Reason", required: true },
      { name: "category", label: "Category" },
      { name: "status", label: "Status", options: ["Active", "Inactive"], defaultValue: "Active" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "rejection_type_master",
    title: "Rejection type master",
    description: "Quality rejection type codes used in QC rejection entry.",
    fields: [
      { name: "code", label: "Code", required: true },
      { name: "typeOfRejection", label: "Type of rejection", required: true },
      { name: "status", label: "Status", options: ["Active", "Inactive"], defaultValue: "Active" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "rejection_remark_master",
    title: "Rejection remark master",
    description: "Quality rejection remark codes used in QC rejection entry.",
    fields: [
      { name: "code", label: "Code", required: true },
      { name: "rejectionRemark", label: "Rejection remark", required: true },
      { name: "status", label: "Status", options: ["Active", "Inactive"], defaultValue: "Active" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "rejection_reason_master",
    title: "Rejection reason master",
    description: "Defect/rejection reason codes used in QC rejection entry.",
    fields: [
      { name: "code", label: "Code", required: true },
      { name: "rejectionReason", label: "Rejection reason", required: true },
      { name: "status", label: "Status", options: ["Active", "Inactive"], defaultValue: "Active" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "quality_parameter_master",
    title: "Quality parameter master",
    description: "Hourly quality check parameters by item, option, and setup.",
    fields: [
      { name: "partNo", label: "Part no.", required: true },
      { name: "optionNumber", label: "Option no.", required: true },
      { name: "setupNo", label: "Setup no.", required: true },
      { name: "code", label: "Parameter code", required: true },
      { name: "parameterName", label: "Parameter name", required: true },
      { name: "specification", label: "Specification", required: true },
      { name: "instrumentUsed", label: "Instrument used" },
      { name: "tolerancePlus", label: "Tolerance +", type: "number", step: "0.001" },
      { name: "toleranceMinus", label: "Tolerance -", type: "number", step: "0.001" },
      { name: "inputType", label: "Input type", options: ["number", "text", "pass_fail"], defaultValue: "number" },
      { name: "required", label: "Required", options: ["Yes", "No"], defaultValue: "Yes" },
      { name: "status", label: "Status", options: ["Active", "Inactive"], defaultValue: "Active" },
      { name: "remark", label: "Remark" },
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
    const timeout = window.setTimeout(
      () => setAuthCheckTimedOut(isLoading),
      isLoading ? 4000 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  if (isLoading && !authCheckTimedOut) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <AuthScreen />;

  return <DashboardShell />;
}


export function HourlyQualityCheckPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [authCheckTimedOut, setAuthCheckTimedOut] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setAuthCheckTimedOut(isLoading),
      isLoading ? 4000 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  if (isLoading && !authCheckTimedOut) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <AuthScreen />;

  return <HourlyQualityCheckShell />;
}

function HourlyQualityCheckShell() {
  const dashboardPayload = useQuery(api.dashboard.snapshot, {});
  const saveDataEntry = useMutation(api.dashboard.saveDataEntry);
  const [prodDate, setProdDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState("Day");
  const [hourSlot, setHourSlot] = useState(() => currentHourSlot());
  const [selectedKey, setSelectedKey] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<ActionStatus>(null);

  const snapshot = asRecord(dashboardPayload);
  const productionControl = asRecord(snapshot.productionControl);
  const runningRows = useMemo(() => currentShopFloorRows(productionControl), [productionControl]);
  const selectedRow = useMemo(() => runningRows.find((row) => shopFloorPlanKey(row) === selectedKey), [runningRows, selectedKey]);
  const qualityParameterRows = useMemo(() => asArray(productionControl.qualityParameterMasterRows), [productionControl]);
  const hourlyRows = useMemo(() => asArray(productionControl.hourlyQualityCheckRows), [productionControl]);
  const parameters = useMemo(
    () => selectedRow ? qualityParameterRows.filter((row) => qualityParameterMatchesSetup(row, selectedRow)) : [],
    [qualityParameterRows, selectedRow],
  );
  const existingCheck = useMemo(
    () => selectedRow ? hourlyRows.find((row) => hourlyQualityCheckMatchesSelection(row, selectedRow, prodDate, shift, hourSlot)) : undefined,
    [hourSlot, hourlyRows, prodDate, selectedRow, shift],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!existingCheck) {
        setReadings({});
        setRemarks({});
        setCheckedBy("");
        return;
      }
      const nextReadings: Record<string, string> = {};
      const nextRemarks: Record<string, string> = {};
      for (const reading of asArray(existingCheck.readings)) {
        const code = qualityParameterCode(reading);
        if (!code) continue;
        nextReadings[code] = str(reading.actualReading || reading.value);
        nextRemarks[code] = str(reading.remark);
      }
      setReadings(nextReadings);
      setRemarks(nextRemarks);
      setCheckedBy(str(existingCheck.checkedBy));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [existingCheck]);

  async function saveHourlyCheck() {
    if (!selectedRow || !checkedBy.trim() || !parameters.length) return;
    const payload = hourlyQualityCheckPayload(selectedRow, parameters, readings, remarks, {
      prodDate,
      shift,
      hourSlot,
      checkedBy,
    });
    setIsSaving(true);
    setStatus(null);
    try {
      await saveDataEntry({
        entryType: "hourly_quality_check",
        key: dataEntryKey("hourly_quality_check", payload),
        payload,
      });
      setStatus({ tone: "default", message: "Hourly quality check saved." });
    } catch (err) {
      setStatus({ tone: "destructive", message: err instanceof Error ? err.message : "Hourly quality check save failed." });
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = Boolean(selectedRow && checkedBy.trim() && parameters.length && parameters.every((parameter) => {
    if (str(parameter.required).toLowerCase() === "no") return true;
    return str(readings[qualityParameterCode(parameter)]);
  }));

  return (
    <main className="min-h-screen bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto grid max-w-7xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Hourly quality check</h1>
            <p className="text-sm text-muted-foreground">Select the running machine, then record the hourly inspection against the active item, option, and setup.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => { window.location.href = "/"; }}>
            <LayoutDashboard className="size-4" />
            Dashboard
          </Button>
        </div>
        <Card>
          <CardContent className="grid gap-3 pt-4 md:grid-cols-5">
            <LabeledInput label="Date" value={prodDate} onChange={setProdDate} type="date" />
            <LabeledSelect label="Shift" value={shift} onChange={setShift} options={["Day", "Night"]} />
            <LabeledSelect label="Machine no." value={selectedKey} onChange={setSelectedKey} options={runningRows.map((row) => ({ value: shopFloorPlanKey(row), label: `${displayValue(row.machine)} - ${itemCode(row)} / setup ${displayValue(row.setupNo)}` }))} placeholder="Select machine" />
            <LabeledSelect label="Hour slot" value={hourSlot} onChange={setHourSlot} options={hourSlotOptions()} />
            <LabeledInput label="Checked by" value={checkedBy} onChange={setCheckedBy} />
          </CardContent>
        </Card>
        {selectedRow ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{displayValue(selectedRow.machine)} running details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-5">
              <TileField label="Item code" value={itemCode(selectedRow)} />
              <TileField label="JC no." value={jobCardNumber(selectedRow)} />
              <TileField label="Option" value={selectedRow.optionNumber} />
              <TileField label="Setup no." value={selectedRow.setupNo} />
              <TileField label="Setup name" value={selectedRow.setupName} />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Inspection readings</CardTitle>
            <CardDescription>{existingCheck ? "Existing hourly card loaded for editing." : "Readings are saved against the selected date, shift, hour, machine, item, and setup."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {dashboardPayload === undefined ? (
              <Skeleton className="h-36 w-full" />
            ) : selectedRow && parameters.length ? (
              <div className="overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-24">Code</TableHead>
                      <TableHead className="min-w-56">Parameter</TableHead>
                      <TableHead className="min-w-36">Specification</TableHead>
                      <TableHead className="min-w-32">Tolerance</TableHead>
                      <TableHead className="min-w-40">Instrument</TableHead>
                      <TableHead className="min-w-44">Actual reading</TableHead>
                      <TableHead className="min-w-24">Result</TableHead>
                      <TableHead className="min-w-56">Remark</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parameters.map((parameter) => {
                      const code = qualityParameterCode(parameter);
                      const result = qualityReadingResult(parameter, readings[code]);
                      return (
                        <TableRow key={code || qualityParameterName(parameter)}>
                          <TableCell className="font-medium">{code}</TableCell>
                          <TableCell>{qualityParameterName(parameter)}</TableCell>
                          <TableCell>{displayValue(parameter.specification)}</TableCell>
                          <TableCell>{qualityParameterTolerance(parameter)}</TableCell>
                          <TableCell>{displayValue(parameter.instrumentUsed)}</TableCell>
                          <TableCell>
                            {qualityParameterInputType(parameter) === "pass_fail" ? (
                              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={readings[code] ?? ""} onChange={(event) => setReadings((current) => ({ ...current, [code]: event.target.value }))}>
                                <option value="">Select</option>
                                <option value="OK">OK</option>
                                <option value="NG">NG</option>
                              </select>
                            ) : (
                              <Input value={readings[code] ?? ""} onChange={(event) => setReadings((current) => ({ ...current, [code]: event.target.value }))} type={qualityParameterInputType(parameter) === "number" ? "number" : "text"} step="0.001" />
                            )}
                          </TableCell>
                          <TableCell><StatusBadge value={result || "Pending"} /></TableCell>
                          <TableCell><Input value={remarks[code] ?? ""} onChange={(event) => setRemarks((current) => ({ ...current, [code]: event.target.value }))} /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : selectedRow ? (
              <EmptyRowsMessage>No active quality parameter master rows match this item, option, and setup.</EmptyRowsMessage>
            ) : (
              <EmptyRowsMessage>Select a machine to start the hourly check.</EmptyRowsMessage>
            )}
            {status ? <AlertMessage tone={status.tone}>{status.message}</AlertMessage> : null}
            <div className="flex justify-end">
              <Button type="button" disabled={!canSave || isSaving} onClick={saveHourlyCheck}>
                <CheckCircle2 className="size-4" />
                {isSaving ? "Saving" : "Save hourly check"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}


export function SetupChecklistPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [authCheckTimedOut, setAuthCheckTimedOut] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setAuthCheckTimedOut(isLoading),
      isLoading ? 4000 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  if (isLoading && !authCheckTimedOut) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <AuthScreen />;

  return <SetupChecklistShell />;
}

function setupChecklistQueryFromLocation() {
  if (typeof window === "undefined") return { sessionId: "", phase: "" };
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get("sessionId") ?? "",
    phase: params.get("phase") ?? "",
  };
}

function SetupChecklistShell() {
  const dashboardPayload = useQuery(api.dashboard.snapshot, {});
  const saveDataEntry = useMutation(api.dashboard.saveDataEntry);
  const isClientHydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const { sessionId, phase } = isClientHydrated ? setupChecklistQueryFromLocation() : { sessionId: "", phase: "" };
  const [localChecklistSession, setLocalChecklistSession] = useState<DashboardPayload | undefined>(undefined);
  const [doneBy, setDoneBy] = useState("");
  const [remark, setRemark] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<ActionStatus>(null);

  const snapshot = asRecord(dashboardPayload);
  const productionControl = asRecord(snapshot.productionControl);
  const setupChecklistSessions = useMemo(() => asArray(productionControl.setupChecklistSessionRows), [productionControl]);
  const activeChecklistMasters = useMemo(() => activeSetupChecklistMasterRows(asArray(productionControl.setupChecklistMasterRows)), [productionControl]);
  const setupRows = useMemo(() => setupChecklistCandidateRows(productionControl), [productionControl]);
  const row = useMemo(() => setupRows.find((candidate) => setupChecklistSessionId(candidate) === sessionId), [sessionId, setupRows]);
  const snapshotChecklistSession = useMemo(() => row ? setupChecklistSessionForRow(setupChecklistSessions, row) : undefined, [row, setupChecklistSessions]);
  const currentChecklistSession = localChecklistSession ?? snapshotChecklistSession;
  const checklistItems = useMemo(() => {
    if (phase === "end" && Array.isArray(currentChecklistSession?.items)) return currentChecklistSession.items as DashboardPayload[];
    if (phase === "start" && Array.isArray(currentChecklistSession?.items)) return currentChecklistSession.items as DashboardPayload[];
    return setupChecklistItemsFromMaster(activeChecklistMasters);
  }, [activeChecklistMasters, currentChecklistSession, phase]);
  const canSave = Boolean(row && (phase === "start" || phase === "end") && checklistItems.length)
    && (phase === "start" || Boolean(currentChecklistSession));
  const isComplete = canSave && setupChecklistValuesComplete(checklistItems, values, phase);

  useEffect(() => {
    if (!isClientHydrated || !sessionId) return;
    const timeout = window.setTimeout(() => {
      setLocalChecklistSession(readStoredSetupChecklistSession(sessionId));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isClientHydrated, sessionId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!currentChecklistSession) {
        setValues({});
        setDoneBy("");
        setRemark("");
        return;
      }
      const nextValues: Record<string, string> = {};
      for (const item of asArray(currentChecklistSession.items)) {
        nextValues[setupChecklistItemKey(item)] = setupChecklistExistingValue(item, phase);
      }
      setValues(nextValues);
      setDoneBy(str(phase === "start" ? currentChecklistSession.startedBy : currentChecklistSession.endedBy));
      setRemark(str(phase === "start" ? currentChecklistSession.startRemark : currentChecklistSession.endRemark));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [currentChecklistSession, phase]);

  function updateValue(item: DashboardPayload, value: string) {
    const itemKey = setupChecklistItemKey(item);
    setValues((currentValues) => ({ ...currentValues, [itemKey]: value }));
  }

  async function saveProgress() {
    if (!row || !canSave || isSaving) return;
    const session = setupChecklistSessionForStage({
      row,
      phase,
      values,
      items: checklistItems,
      masterRows: activeChecklistMasters,
      existingSession: currentChecklistSession,
      doneBy,
      remark,
      completedAt: new Date().toISOString(),
    });
    const payload = setupChecklistSessionPayload(row, session);
    setIsSaving(true);
    setStatus(null);
    try {
      await saveDataEntry({
        entryType: "setup_checklist_session",
        key: dataEntryKey("setup_checklist_session", payload),
        payload,
      });
      setLocalChecklistSession(payload);
      writeStoredSetupChecklistSession(payload);
      setStatus({ tone: "default", message: "Checklist progress saved." });
    } catch (err) {
      setStatus({ tone: "destructive", message: err instanceof Error ? err.message : "Checklist save failed." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto grid max-w-6xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Setup checklist</h1>
            <p className="text-sm text-muted-foreground">Save pre setting and setting checklist progress outside the machinist task list.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => { window.location.href = "/"; }}>
            <LayoutDashboard className="size-4" />
            Dashboard
          </Button>
        </div>
        {dashboardPayload === undefined ? (
          <Skeleton className="h-56 w-full" />
        ) : row ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{phase === "end" ? "Setting completion" : "Pre setting start"}</CardTitle>
                <CardDescription>Running setup details</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <TileField label="Item code" value={itemCode(row)} />
                  <TileField label="JC no." value={jobCardNumber(row)} />
                  <TileField label="Option" value={row.optionNumber} />
                  <TileField label="Setup no." value={row.setupNo} />
                  <TileField label="Machine" value={row.machine} />
                  <TileField label="Phase" value={phase === "end" ? "Completion" : "Start"} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <LabeledInput label={phase === "end" ? "Completed by" : "Started by"} value={doneBy} onChange={setDoneBy} />
                  <LabeledInput label="Remark" value={remark} onChange={setRemark} />
                </div>
              </CardContent>
            </Card>
            <SetupChecklistForm
              row={row}
              phase={phase}
              items={checklistItems}
              session={currentChecklistSession}
              values={values}
              onValueChange={updateValue}
            />
            {status ? <AlertMessage tone={status.tone}>{status.message}</AlertMessage> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge value={isComplete ? "Checklist complete" : "Progress can be saved"} />
              <Button type="button" disabled={!canSave || isSaving} onClick={() => void saveProgress()}>
                <CheckCircle2 className="size-4" />
                {isSaving ? "Saving" : "Save checklist progress"}
              </Button>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <EmptyRowsMessage>Checklist setup was not found. Open this page from a machinist task row.</EmptyRowsMessage>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function DashboardShell() {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("productionControlTab");
  const [preferredDataEntryType, setPreferredDataEntryType] = useState(dataEntrySpecs[0]?.entryType ?? "route");
  const [preferredDataEntryDefaults, setPreferredDataEntryDefaults] = useState<Record<string, unknown>>({});
  const [firstPieceInspectionTasks, setFirstPieceInspectionTasks] = useState<DashboardPayload[]>([]);
  const [optimisticShopFloorStatuses, setOptimisticShopFloorStatuses] = useState<ShopFloorStatusPatch[]>([]);
  const [optimisticSetupChecklistSessions, setOptimisticSetupChecklistSessions] = useState<DashboardPayload[]>([]);
  const [optimisticProductionCards, setOptimisticProductionCards] = useState<DashboardPayload[]>([]);
  const [planningRefreshLock, setPlanningRefreshLock] = useState<PlanningRefreshLock | null>(null);
  const lastStalePlanningRefreshKeyRef = useRef<string | undefined>(undefined);
  const lastSnapshotUpdatedAtRef = useRef<string | undefined>(undefined);
  const [actionStatus, setActionStatus] = useState<ActionStatus>(null);
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);
  const dashboardPayload = useQuery(api.dashboard.snapshot, {});
  const dashboardRefreshStatus = useQuery(api.dashboard.refreshStatus, {});
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
  const isPlanningRefreshLockActive = planningRefreshLock
    ? !refreshLockHasSettled(planningRefreshLock, dashboardRefreshStatus)
    : false;

  useEffect(() => {
    const dashboardRecord = asRecord(dashboardPayload);
    if (!shouldRefreshStalePlanningSnapshot(dashboardRecord)) return;
    if (isPlanningRefreshLockActive || dashboardRefreshStatus?.isRefreshing) return;
    const staleRefreshKey = str(dashboardRecord.snapshotCacheUpdatedAt) || str(dashboardRecord.updatedAt) || str(dashboardRecord.cacheStatus) || "missing";
    if (lastStalePlanningRefreshKeyRef.current === staleRefreshKey) return;
    lastStalePlanningRefreshKeyRef.current = staleRefreshKey;
    void refreshSnapshot({});
  }, [dashboardPayload, dashboardRefreshStatus?.isRefreshing, isPlanningRefreshLockActive, refreshSnapshot]);

  async function refreshDashboardSnapshot(force = true) {
    setPlanningRefreshLock(refreshLockFromStatus(dashboardRefreshStatus));
    setIsRefreshingSnapshot(true);
    setActionStatus(null);
    try {
      const result = await refreshSnapshot({ force });
      setActionStatus({
        tone: "default",
        message: result.queued
          ? "Planning recalculation queued."
          : result.skipped
          ? "Planning is already up to date."
          : "Planning recalculated from latest data.",
      });
      if (!result.skipped) {
        setOptimisticShopFloorStatuses([]);
        setOptimisticSetupChecklistSessions([]);
        setOptimisticProductionCards([]);
      }
      if (result.skipped) setPlanningRefreshLock(null);
    } catch (err) {
      setPlanningRefreshLock(null);
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
    if (queuePlanningRefresh) {
      setPlanningRefreshLock(refreshLockFromStatus(dashboardRefreshStatus));
    }
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
      const setupChecklistSessionPatch = setupChecklistSessionPatchFromAction(path, body);
      if (setupChecklistSessionPatch) {
        setOptimisticSetupChecklistSessions((current) => upsertSetupChecklistSessionPatch(current, setupChecklistSessionPatch));
      }
      const productionCardPatch = productionCardPatchFromAction(path, body);
      if (productionCardPatch) {
        setOptimisticProductionCards((current) => upsertProductionCardPatch(current, productionCardPatch));
      }
      setActionStatus({
        tone: "default",
        message: `${message} ${planningRefreshStatusMessage(queuePlanningRefresh, path, body)}`,
      });
      const returnTab = str(body.returnTab) as DashboardTabId;
      if (returnTab && navItems.some((item) => item.id === returnTab)) {
        setActiveTab(returnTab);
      }
    } catch (err) {
      if (queuePlanningRefresh) setPlanningRefreshLock(null);
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
  const basePayload = useMemo(
    () => (isDashboardLoading ? {} : asRecord(dashboardPayload)),
    [dashboardPayload, isDashboardLoading],
  );
  const snapshotUpdatedAt = str(basePayload.updatedAt);
  const planningRecalculatedAt = str(basePayload.snapshotCacheUpdatedAt)
    || (typeof dashboardRefreshStatus?.completedAtMs === "number" ? new Date(dashboardRefreshStatus.completedAtMs).toISOString() : "");
  useEffect(() => {
    if (!snapshotUpdatedAt || lastSnapshotUpdatedAtRef.current === snapshotUpdatedAt) return;
    lastSnapshotUpdatedAtRef.current = snapshotUpdatedAt;
    setOptimisticShopFloorStatuses((current) => current.length ? [] : current);
    setOptimisticSetupChecklistSessions((current) => current.length ? [] : current);
    setOptimisticProductionCards((current) => current.length ? [] : current);
  }, [snapshotUpdatedAt]);

  const payload = useMemo(
    () => applyProductionCardPatches(applySetupChecklistSessionPatches(applyShopFloorStatusPatches(basePayload, optimisticShopFloorStatuses), optimisticSetupChecklistSessions), optimisticProductionCards),
    [basePayload, optimisticShopFloorStatuses, optimisticSetupChecklistSessions, optimisticProductionCards],
  );
  const selectedTab = navItems.find((item) => item.id === activeTab) ?? navItems[0]!;
  const isRefreshStatusLoading = dashboardRefreshStatus === undefined;
  const isSnapshotRefreshActive = isRefreshingSnapshot || isRefreshStatusLoading || dashboardRefreshStatus?.isRefreshing === true || isPlanningRefreshLockActive;

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
              <span>{planningRecalculatedAt ? `Planning recalculated ${formatDate(planningRecalculatedAt)}` : view.updatedAt ? `Workbook updated ${formatDate(view.updatedAt)}` : "Live workbook snapshot"}</span>
              {planningRecalculatedAt && view.updatedAt ? <span> - Workbook updated {formatDate(view.updatedAt)}</span> : null}
            </p>
          </div>
          <Badge variant="outline">
            {isDashboardLoading ? "Loading" : "Connected"}
          </Badge>
          <HeaderActions
            isRefreshingSnapshot={isSnapshotRefreshActive}
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
      {isSnapshotRefreshActive ? (
        <PlanningRecalculationOverlay status={str(dashboardRefreshStatus?.status)} />
      ) : null}
    </SidebarProvider>
  );
}

function PlanningRecalculationOverlay({ status }: { status: string }) {
  const title = status === "queued"
    ? "Planning recalculation queued"
    : status === "running"
    ? "Recalculating planning"
    : "Checking planning recalculation";
  return (
    <div className="fixed inset-0 z-50 grid cursor-wait place-items-center bg-background/70 p-4 backdrop-blur-sm" aria-live="polite" aria-busy="true">
      <div className="flex max-w-sm items-center gap-3 rounded-md border bg-background px-4 py-3 shadow-lg">
        <RefreshCw className="size-5 shrink-0 animate-spin text-primary" />
        <div className="grid gap-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">Please wait before saving another task.</div>
        </div>
      </div>
    </div>
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

function setupChecklistSessionPatchFromAction(path: string, body: Record<string, unknown>) {
  if (path !== "data-entry") return undefined;
  if (str(body.entryType) !== "setup_checklist_session") return undefined;
  const payload = asRecord(body.payload);
  return setupChecklistSessionPatchKey(payload) ? payload : undefined;
}

function upsertSetupChecklistSessionPatch(current: DashboardPayload[], patch: DashboardPayload) {
  const patchKey = setupChecklistSessionPatchKey(patch);
  return [
    ...current.filter((item) => setupChecklistSessionPatchKey(item) !== patchKey),
    patch,
  ];
}

function applySetupChecklistSessionPatches(payload: DashboardPayload, patches: DashboardPayload[]) {
  if (!patches.length) return payload;
  const productionControl = asRecord(payload.productionControl);
  if (!Object.keys(productionControl).length) return payload;
  const rows = asArray(productionControl.setupChecklistSessionRows);
  const rowsByKey = new Map(rows.map((row) => [setupChecklistSessionPatchKey(row), row]));
  let changed = false;
  for (const patch of patches) {
    const patchKey = setupChecklistSessionPatchKey(patch);
    if (!patchKey) continue;
    rowsByKey.set(patchKey, patch);
    changed = true;
  }
  if (!changed) return payload;
  return {
    ...payload,
    productionControl: {
      ...productionControl,
      setupChecklistSessionRows: [...rowsByKey.values()],
    },
  };
}

function productionCardPatchFromAction(path: string, body: Record<string, unknown>) {
  if (path !== "data-entry") return undefined;
  if (str(body.entryType) !== "production_card") return undefined;
  const payload = asRecord(body.payload);
  return productionCardPatchKey(payload) ? payload : undefined;
}

function productionCardPatchKey(row: DashboardPayload) {
  return optionalText(row.cardId) || dataEntryKey("production_card", row);
}

function upsertProductionCardPatch(current: DashboardPayload[], patch: DashboardPayload) {
  const patchKey = productionCardPatchKey(patch);
  return [
    ...current.filter((item) => productionCardPatchKey(item) !== patchKey),
    patch,
  ];
}

function applyProductionCardPatches(payload: DashboardPayload, patches: DashboardPayload[]) {
  if (!patches.length) return payload;
  const productionControl = asRecord(payload.productionControl);
  if (!Object.keys(productionControl).length) return payload;
  const rows = asArray(productionControl.productionCardRows);
  const rowsByKey = new Map(rows.map((row) => [productionCardPatchKey(row), row]));
  let changed = false;
  for (const patch of patches) {
    const patchKey = productionCardPatchKey(patch);
    if (!patchKey) continue;
    rowsByKey.set(patchKey, { ...(rowsByKey.get(patchKey) ?? {}), ...patch });
    changed = true;
  }
  if (!changed) return payload;
  return {
    ...payload,
    productionControl: {
      ...productionControl,
      productionCardRows: [...rowsByKey.values()],
    },
  };
}
function setupChecklistSessionPatchKey(row: DashboardPayload) {
  const sessionId = str(row.sessionId);
  if (sessionId) return sessionId.toLowerCase();
  const parts = [
    row.jcNo || row.jobCard,
    row.partCode || row.partNo,
    row.optionNumber,
    row.setupNo,
    row.machine || row.machineNo,
  ].map((value) => displayValue(value).toLowerCase()).filter((value) => value && value !== "-");
  return parts.length >= 5 ? parts.join("|") : "";
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
    return <DataEntryPanel key={preferredDataEntryType} payload={payload} submitAction={submitAction} preferredEntryType={preferredDataEntryType} preferredDefaults={preferredDataEntryDefaults} />;
  }

  if (activeTab === "planningHolidayTab") {
    return <PlanningHolidayPanel productionControl={productionControl} submitAction={submitAction} />;
  }

  if (activeTab === "planningControlTab") {
    return <PlanningControlPanel payload={payload} productionControl={productionControl} submitAction={submitAction} />;
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
        <PlannerActionConflictPanel productionControl={productionControl} submitAction={submitAction} />
        <PlannerPriorityForm productionControl={productionControl} submitAction={submitAction} />
        <MachineConstraintPlannerForm productionControl={productionControl} submitAction={submitAction} />
        <PartMachineSwitchPlannerForm productionControl={productionControl} submitAction={submitAction} />
        <RouteChangePlannerForm productionControl={productionControl} submitAction={submitAction} />
        <Button type="button" variant="outline" onClick={() => void submitAction("reschedule", {})}>
          <Settings2 className="size-4" />
          Reschedule
        </Button>
      </CardContent>
    </Card>
  );
}

function MachineConstraintPlannerForm({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const plannedRows = asArray(productionControl.machinePlanDetailRows);
  const machineRows = asArray(productionControl.machinePlanningRows);
  const machineOptions = useMemo(() => plannedMachineOptions(plannedRows, machineBoardRows(machineRows, plannedRows)), [machineRows, plannedRows]);
  const [machineNo, setMachineNo] = useState("");
  const [unavailableFrom, setUnavailableFrom] = useState("");
  const [unavailableTo, setUnavailableTo] = useState("");
  const [rescheduleAction, setRescheduleAction] = useState("shift_required");
  const [planningMode, setPlanningMode] = useState("system_recalculate");
  const [reason, setReason] = useState("");
  const [reviewReady, setReviewReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedMachineConflictIds, setResolvedMachineConflictIds] = useState<Set<string>>(() => new Set());
  const [producedQtyByRow, setProducedQtyByRow] = useState<Record<string, string>>({});
  const [queueReviewConfirmed, setQueueReviewConfirmed] = useState(false);
  const [queueAfterByRow, setQueueAfterByRow] = useState<Record<string, string>>({});
  const affectedRows = useMemo(() => machineIssueAffectedRows(plannedRows, {
    machineNo,
    unavailableFrom,
    unavailableTo,
  }), [machineNo, plannedRows, unavailableFrom, unavailableTo]);
  const queueReviewGroups = useMemo(() => machineConstraintQueueReview({
    plannedRows,
    machineRows,
    affectedRows,
    machineNo,
    rescheduleAction,
    includeSameMachineLater: machineKey(rescheduleAction) === "delay",
    includeDownstream: false,
  }), [affectedRows, machineNo, machineRows, plannedRows, rescheduleAction]);
  const runningRows = affectedRows.filter(machineIssueRowNeedsProducedQty);
  const lockedCount = affectedRows.filter(machineIssueRowIsLocked).length;
  const plannedCount = affectedRows.length - lockedCount;
  const missingProducedQty = runningRows.some((row) => {
    const rawValue = producedQtyByRow[machineIssueRowKey(row)]?.trim() ?? "";
    const value = Number(rawValue);
    const orderQty = Number(row.totalOrderPcs || row.orderPcs);
    return rawValue === "" || !Number.isFinite(value) || value < 0 || (Number.isFinite(orderQty) && orderQty > 0 && value > orderQty);
  });
  const queueReviewRequired = planningMode === "review_then_plan";
  const movableAffectedRows = useMemo(
    () => machineConstraintMovableRows(affectedRows, rescheduleAction),
    [affectedRows, rescheduleAction],
  );
  const proposedMachineQueuePlacements = useMemo(() => machineConstraintQueuePlacements(queueReviewGroups, movableAffectedRows, queueAfterByRow), [movableAffectedRows, queueAfterByRow, queueReviewGroups]);
  const machineConstraintConflicts = useMemo(() => machineConstraintPreSaveConflicts(asArray(productionControl.machineConstraintRows), {
    machineNo,
    unavailableFrom,
    unavailableTo,
    rescheduleAction,
    planningMode,
    queuePlacements: proposedMachineQueuePlacements,
    resolvedIds: resolvedMachineConflictIds,
  }), [machineNo, planningMode, productionControl.machineConstraintRows, proposedMachineQueuePlacements, resolvedMachineConflictIds, rescheduleAction, unavailableFrom, unavailableTo]);
  const canReview = Boolean(machineNo.trim() && unavailableFrom);
  const canSave = canReview && Boolean(reason.trim()) && reviewReady && !missingProducedQty && !machineConstraintConflicts.length && (!queueReviewRequired || queueReviewConfirmed);

  function updateField(setter: Dispatch<SetStateAction<string>>, value: string) {
    setter(value);
    setReviewReady(false);
    setQueueReviewConfirmed(false);
    setQueueAfterByRow({});
    setResolvedMachineConflictIds(new Set());
  }

  function updatePlanningInput(setter: Dispatch<SetStateAction<string>>, value: string) {
    setter(value);
    setQueueReviewConfirmed(false);
    setQueueAfterByRow({});
    setResolvedMachineConflictIds(new Set());
  }

  function updateProducedQty(row: DashboardPayload, value: string) {
    const key = machineIssueRowKey(row);
    setProducedQtyByRow((current) => ({ ...current, [key]: value }));
  }

  async function reverseMachineConstraintConflict(conflict: DashboardPayload) {
    const targetId = displayValue(conflict.targetId);
    if (!targetId || targetId === "-") return;
    await submitAction("reverse-entry", {
      targetTable: "machineConstraints",
      targetId,
      targetKey: displayValue(conflict.targetKey) !== "-" ? displayValue(conflict.targetKey) : "",
      targetLabel: displayValue(conflict.targetLabel) !== "-" ? displayValue(conflict.targetLabel) : "",
      reason: `Planner replacing conflicting machine unavailable action for ${machineNo}`,
      correctedBy: "Planner",
    });
    setResolvedMachineConflictIds((current) => new Set([...current, targetId]));
  }
  async function saveMachineIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewReady) {
      setReviewReady(true);
      return;
    }
    if (!canSave || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const interruptedSetups = runningRows.map((row) => ({
        jcNo: jobCardNumber(row),
        setupNo: displayValue(row.setupNo),
        machine: machineValue(row, "machine"),
        finishedQty: Number(producedQtyByRow[machineIssueRowKey(row)] ?? 0),
      }));
      const queuePlacements = proposedMachineQueuePlacements;
      await submitAction("machine-constraint", {
        machineNo,
        unavailableFrom,
        unavailableTo,
        rescheduleAction,
        planningMode,
        interruptedSetups,
        queuePlacements,
        reason,
        remark: `Reviewed ${affectedRows.length} affected setup rows; ${lockedCount} locked; ${plannedCount} planned; ${runningRows.length} running rows captured with produced quantity; ${queueReviewGroups.length} queue review groups; ${queuePlacements.length} queue placements; ${planningMode}`,
      });
      setMachineNo("");
      setUnavailableFrom("");
      setUnavailableTo("");
      setRescheduleAction("shift_required");
      setPlanningMode("system_recalculate");
      setReason("");
      setProducedQtyByRow({});
      setQueueAfterByRow({});
      setQueueReviewConfirmed(false);
      setReviewReady(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-xl border bg-background p-3" onSubmit={saveMachineIssue}>
      <div>
        <div className="text-sm font-medium">2. Machine unavailable / breakdown</div>
        <div className="text-xs text-muted-foreground">Running rows need produced quantity before remaining quantity is planned elsewhere.</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
        <Field label="Machine unavailable">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={machineNo}
            required
            onChange={(event) => updateField(setMachineNo, event.target.value)}
          >
            <option value="">Select machine</option>
            {machineOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <Input type="date" value={unavailableFrom} required onChange={(event) => updateField(setUnavailableFrom, event.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={unavailableTo} onChange={(event) => updateField(setUnavailableTo, event.target.value)} />
        </Field>
        <Field label="Plan action">
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={rescheduleAction} onChange={(event) => updateField(setRescheduleAction, event.target.value)}>
            <option value="shift_required">shift required</option>
            <option value="shift_all">shift all</option>
            <option value="delay">delay plan</option>
          </select>
        </Field>
        <Field label="Planning confirmation">
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={planningMode} onChange={(event) => updatePlanningInput(setPlanningMode, event.target.value)}>
            <option value="system_recalculate">System recalculation (all planning rules)</option>
            <option value="review_then_plan">Review queue before saving</option>
          </select>
        </Field>
        <Field label="Reason">
          <Input value={reason} placeholder="Breakdown / quality hold" required onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
      {reviewReady ? (
        <div className="grid gap-2 rounded-md border bg-muted/15 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatNumber(affectedRows.length)} affected setup rows</span>
            <span>{formatNumber(lockedCount)} locked on machine</span>
            <span>{formatNumber(plannedCount)} planned/unlocked</span>
            <span>{formatNumber(runningRows.length)} running quantity inputs</span>
          </div>
          {affectedRows.length ? (
            <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
              {affectedRows.map((row, index) => {
                const needsProducedQty = machineIssueRowNeedsProducedQty(row);
                const producedKey = machineIssueRowKey(row);
                const orderQty = Number(row.totalOrderPcs || row.orderPcs);
                return (
                  <div key={`${jobCardNumber(row)}-${displayValue(row.setupNo)}-${index}`} className="grid gap-2 rounded-md border bg-background p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">{itemCode(row)} / {jobCardNumber(row)} / Setup {displayValue(row.setupNo)}</div>
                      <StatusBadge value={needsProducedQty ? "Produced qty required" : machineIssueRowIsLocked(row) ? "Delay locked setup" : "Shift if alternate exists"} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {machineValue(row, "machine")} | Order {displayValue(row.orderPcs, true)} of {displayValue(row.totalOrderPcs || row.orderPcs, true)} | Production {displayValue(row.plannedProductionStartDate)} to {displayValue(row.plannedProductionEndDate)} | {displayValue(row.runningStatus)}
                    </div>
                    {needsProducedQty ? (
                      <Field label="Produced qty">
                        <Input
                          type="number"
                          min="0"
                          max={Number.isFinite(orderQty) && orderQty > 0 ? orderQty : undefined}
                          step="1"
                          value={producedQtyByRow[producedKey] ?? ""}
                          placeholder="0"
                          required
                          onChange={(event) => updateProducedQty(row, event.target.value)}
                        />
                      </Field>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">No planned setup rows overlap this unavailable window.</div>
          )}
          <PlannerPreSaveConflictReview
            conflicts={machineConstraintConflicts}
            title="Conflicting machine action found"
            description="This machine action cannot be saved while another active unavailable/breakdown decision overlaps the same machine with a different action or queue choice."
            onKeepExisting={() => { setReviewReady(false); setQueueReviewConfirmed(false); }}
            onReverseExisting={reverseMachineConstraintConflict}
          />
          {queueReviewRequired ? (
            <>
              <MachineConstraintQueueReviewPanel
                groups={queueReviewGroups}
                movableRows={movableAffectedRows}
                queueAfterByRow={queueAfterByRow}
                onQueueAfterChange={(rowKey, value) => setQueueAfterByRow((current) => {
                  const next = { ...current };
                  if (value) next[rowKey] = value;
                  else delete next[rowKey];
                  return next;
                })}
              />
              <label className="flex items-start gap-2 rounded-md border bg-background p-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={queueReviewConfirmed}
                  onChange={(event) => setQueueReviewConfirmed(event.target.checked)}
                />
                <span>Queue reviewed; save this breakdown and recalculate planning.</span>
              </label>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button className="w-fit" type="submit" disabled={!canReview || isSubmitting || (reviewReady && !canSave)}>
          <Wrench className="size-4" />
          {reviewReady ? queueReviewRequired ? "Save after queue review" : "Save and replan remaining qty" : "Review affected queue"}
        </Button>
        {reviewReady ? (
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => { setReviewReady(false); setQueueReviewConfirmed(false); }}>
            Recheck inputs
          </Button>
        ) : null}
      </div>
    </form>
  );
}
function PartMachineSwitchPlannerForm({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const plannedRows = asArray(productionControl.machinePlanDetailRows);
  const machineRows = asArray(productionControl.machinePlanningRows);
  const itemOptions = useMemo(() => uniqueValues(plannedRows
    .map((row) => itemCode(row))
    .filter((value) => value !== "-")), [plannedRows]);
  const [selectedItem, setSelectedItem] = useState("");
  const [target, setTarget] = useState("");
  const [setupNo, setSetupNo] = useState("");
  const [fromMachine, setFromMachine] = useState("");
  const [toMachine, setToMachine] = useState("");
  const [reason, setReason] = useState("");
  const [reviewReady, setReviewReady] = useState(false);
  const [queueReviewConfirmed, setQueueReviewConfirmed] = useState(false);
  const [producedQtyByRow, setProducedQtyByRow] = useState<Record<string, string>>({});
  const [queueAfterByRow, setQueueAfterByRow] = useState<Record<string, string>>({});
  const [selectedTargetInterruptions, setSelectedTargetInterruptions] = useState<Record<string, boolean>>({});
  const [targetFinishedQtyByRow, setTargetFinishedQtyByRow] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedConflictIds, setResolvedConflictIds] = useState<Set<string>>(() => new Set());
  const jobCardOptions = useMemo(() => uniqueValues(plannedRows
    .filter((row) => machineKey(itemCode(row)) === machineKey(selectedItem))
    .map((row) => jobCardNumber(row))
    .filter((value) => value !== "-")), [plannedRows, selectedItem]);
  const setupOptions = useMemo(() => uniqueValues(plannedRows
    .filter((row) => partMachineSwitchTargetMatches(row, target))
    .map((row) => displayValue(row.setupNo))
    .filter((value) => value !== "-")), [plannedRows, target]);
  const fromMachineOptions = useMemo(() => uniqueValues(plannedRows
    .filter((row) => partMachineSwitchTargetMatches(row, target))
    .filter((row) => !setupNo.trim() || machineKey(displayValue(row.setupNo)) === machineKey(setupNo))
    .map((row) => machineValue(row, "machine"))
    .filter((value) => value !== "-")), [plannedRows, setupNo, target]);
  const selectedRows = useMemo(() => partMachineSwitchAffectedRows(plannedRows, {
    target,
    setupNo,
    fromMachine,
  }), [fromMachine, plannedRows, setupNo, target]);
  const targetMachineOptions = useMemo(() => compatibleDestinationMachineOptions({
    affectedRows: selectedRows,
    machineRows,
    plannedRows,
    sourceMachine: fromMachine,
  }), [fromMachine, machineRows, plannedRows, selectedRows]);
  const runningRows = selectedRows.filter(machineIssueRowNeedsProducedQty);
  const missingProducedQty = runningRows.some((row) => {
    const rawValue = producedQtyByRow[machineIssueRowKey(row)]?.trim() ?? "";
    const value = Number(rawValue);
    const orderQty = Number(row.totalOrderPcs || row.orderPcs);
    return rawValue === "" || !Number.isFinite(value) || value < 0 || (Number.isFinite(orderQty) && orderQty > 0 && value > orderQty);
  });
  const queueReviewGroups = useMemo(() => machineConstraintQueueReview({
    plannedRows,
    machineRows,
    affectedRows: selectedRows,
    machineNo: fromMachine,
    rescheduleAction: "shift_required",
    explicitDestinationMachines: toMachine.trim() ? [toMachine] : [],
    includeSameMachineLater: false,
    includeDownstream: false,
  }), [fromMachine, machineRows, plannedRows, selectedRows, toMachine]);
  const proposedQueuePlacements = useMemo(() => machineConstraintQueuePlacements(queueReviewGroups, selectedRows, queueAfterByRow), [queueAfterByRow, queueReviewGroups, selectedRows]);
  const switchConflicts = useMemo(() => partMachineSwitchPreSaveConflicts(asArray(productionControl.planOverrideRows), {
    target,
    setupNo,
    selectedItem,
    toMachine,
    queuePlacements: proposedQueuePlacements,
    resolvedIds: resolvedConflictIds,
  }), [productionControl.planOverrideRows, proposedQueuePlacements, resolvedConflictIds, selectedItem, setupNo, target, toMachine]);
  const targetInterruptionRows = useMemo(() => partMachineSwitchTargetInterruptionRows(queueReviewGroups, selectedRows), [queueReviewGroups, selectedRows]);
  const missingTargetFinishedQty = targetInterruptionRows.some((row) => {
    const rowKey = machineIssueRowKey(row);
    if (!selectedTargetInterruptions[rowKey]) return false;
    const rawValue = targetFinishedQtyByRow[rowKey]?.trim() ?? "";
    const value = Number(rawValue);
    const orderQty = Number(row.totalOrderPcs || row.orderPcs);
    return rawValue === "" || !Number.isFinite(value) || value <= 0 || (Number.isFinite(orderQty) && orderQty > 0 && value > orderQty);
  });
  const canReview = Boolean(selectedItem.trim() && target.trim() && setupNo.trim() && fromMachine.trim() && toMachine.trim())
    && machineKey(fromMachine) !== machineKey(toMachine);
  const canSave = canReview && Boolean(reason.trim()) && reviewReady && selectedRows.length > 0 && !missingProducedQty && !missingTargetFinishedQty && !switchConflicts.length && queueReviewConfirmed;

  function updateField(setter: Dispatch<SetStateAction<string>>, value: string) {
    setter(value);
    setReviewReady(false);
    setQueueReviewConfirmed(false);
    setQueueAfterByRow({});
    setSelectedTargetInterruptions({});
    setTargetFinishedQtyByRow({});
    setResolvedConflictIds(new Set());
  }

  function updateProducedQty(row: DashboardPayload, value: string) {
    const key = machineIssueRowKey(row);
    setProducedQtyByRow((current) => ({ ...current, [key]: value }));
  }

  function updateTargetFinishedQty(row: DashboardPayload, value: string) {
    const key = machineIssueRowKey(row);
    setTargetFinishedQtyByRow((current) => ({ ...current, [key]: value }));
  }

  async function reverseSwitchConflict(conflict: DashboardPayload) {
    const targetId = displayValue(conflict.targetId);
    if (!targetId || targetId === "-" || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitAction("reverse-entry", {
        targetTable: "planOverrides",
        targetId,
        targetKey: displayValue(conflict.targetKey) !== "-" ? displayValue(conflict.targetKey) : "",
        targetLabel: displayValue(conflict.targetLabel) !== "-" ? displayValue(conflict.targetLabel) : "",
        reason: `Planner replacing conflicting machine switch with ${target} setup ${setupNo} to ${toMachine}`,
        correctedBy: "Planner",
      });
      setResolvedConflictIds((current) => new Set([...current, targetId]));
    } finally {
      setIsSubmitting(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewReady) {
      setReviewReady(true);
      return;
    }
    if (!canSave || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sourceInterruptions = runningRows.map((row) => ({
        jcNo: jobCardNumber(row),
        setupNo: displayValue(row.setupNo),
        machine: machineValue(row, "machine"),
        finishedQty: Number(producedQtyByRow[machineIssueRowKey(row)] ?? 0),
      }));
      const targetInterruptions = targetInterruptionRows
        .filter((row) => selectedTargetInterruptions[machineIssueRowKey(row)])
        .map((row) => ({
          jcNo: jobCardNumber(row),
          setupNo: displayValue(row.setupNo),
          machine: machineValue(row, "machine"),
          finishedQty: Number(targetFinishedQtyByRow[machineIssueRowKey(row)] ?? 0),
        }));
      const interruptedSetups = [...sourceInterruptions, ...targetInterruptions];
      const queuePlacements = proposedQueuePlacements;
      await submitAction("plan-override", {
        target,
        setupNo,
        fromMachine,
        toMachine,
        interruptedSetups,
        queuePlacements,
        reason,
      });
      setSelectedItem("");
      setTarget("");
      setSetupNo("");
      setFromMachine("");
      setToMachine("");
      setReason("");
      setProducedQtyByRow({});
      setQueueAfterByRow({});
      setSelectedTargetInterruptions({});
      setTargetFinishedQtyByRow({});
    setResolvedConflictIds(new Set());
      setReviewReady(false);
      setQueueReviewConfirmed(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-xl border bg-background p-3" onSubmit={submit}>
      <div>
        <div className="text-sm font-medium">3. Part-specific machine switch</div>
        <div className="text-xs text-muted-foreground">Move only the selected part/setup to another machine after reviewing that target queue and downstream WIP queues.</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-6">
        <Field label="Item code">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={selectedItem}
            required
            onChange={(event) => {
              updateField(setSelectedItem, event.target.value);
              setTarget("");
              setSetupNo("");
              setFromMachine("");
              setToMachine("");
            }}
          >
            <option value="">Select item</option>
            {itemOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Job card">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={target}
            required
            onChange={(event) => {
              updateField(setTarget, event.target.value);
              setSetupNo("");
              setFromMachine("");
              setToMachine("");
            }}
          >
            <option value="">Select job card</option>
            {jobCardOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Setup no.">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={setupNo}
            required
            onChange={(event) => {
              updateField(setSetupNo, event.target.value);
              setFromMachine("");
              setToMachine("");
            }}
          >
            <option value="">Select setup</option>
            {setupOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="From machine">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={fromMachine}
            required
            onChange={(event) => {
              updateField(setFromMachine, event.target.value);
              setToMachine("");
            }}
          >
            <option value="">Select source machine</option>
            {fromMachineOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Plan on machine">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={toMachine}
            required
            onChange={(event) => updateField(setToMachine, event.target.value)}
          >
            <option value="">Select target machine</option>
            {targetMachineOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Reason">
          <Input value={reason} placeholder="Planner approved machine switch" required onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
      {reviewReady ? (
        <div className="grid gap-2 rounded-md border bg-muted/15 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatNumber(selectedRows.length)} selected setup rows</span>
            <span>{displayValue(fromMachine)} to {displayValue(toMachine)}</span>
            <span>{formatNumber(runningRows.length)} source running quantity inputs</span>
            <span>{formatNumber(targetInterruptionRows.length)} target running blockers</span>
          </div>
          {selectedRows.length ? (
            <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
              {selectedRows.map((row, index) => {
                const needsProducedQty = machineIssueRowNeedsProducedQty(row);
                const producedKey = machineIssueRowKey(row);
                const orderQty = Number(row.totalOrderPcs || row.orderPcs);
                return (
                  <div key={`${jobCardNumber(row)}-${displayValue(row.setupNo)}-${machineValue(row, "machine")}-${index}`} className="grid gap-2 rounded-md border bg-background p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">{itemCode(row)} / {jobCardNumber(row)} / Setup {displayValue(row.setupNo)}</div>
                      <StatusBadge value={needsProducedQty ? "Produced qty required" : "Selected setup"} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {machineValue(row, "machine")} | Order {displayValue(row.orderPcs, true)} of {displayValue(row.totalOrderPcs || row.orderPcs, true)} | Production {displayValue(row.plannedProductionStartDate)} to {displayValue(row.plannedProductionEndDate)} | {displayValue(row.runningStatus)}
                    </div>
                    {needsProducedQty ? (
                      <Field label="Produced qty">
                        <Input
                          type="number"
                          min="0"
                          max={Number.isFinite(orderQty) && orderQty > 0 ? orderQty : undefined}
                          step="1"
                          value={producedQtyByRow[producedKey] ?? ""}
                          placeholder="0"
                          required
                          onChange={(event) => updateProducedQty(row, event.target.value)}
                        />
                      </Field>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">No planned setup row matches this job card/part, setup number, and source machine.</div>
          )}
          {targetInterruptionRows.length ? (
            <div className="grid gap-2 rounded-md border bg-background p-3">
              <div>
                <div className="text-sm font-medium">Target machine running setup</div>
                <div className="text-xs text-muted-foreground">Choose whether to stop the running setup on the target machine before saving this switch.</div>
              </div>
              {targetInterruptionRows.map((row) => {
                const rowKey = machineIssueRowKey(row);
                const selected = Boolean(selectedTargetInterruptions[rowKey]);
                const orderQty = Number(row.totalOrderPcs || row.orderPcs);
                return (
                  <div key={rowKey} className="grid gap-2 rounded-md border bg-muted/10 p-2 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <div className="text-sm font-medium">{itemCode(row)} / {jobCardNumber(row)} / Setup {displayValue(row.setupNo)}</div>
                      <div className="text-xs text-muted-foreground">{machineValue(row, "machine")} | Production {displayValue(row.plannedProductionStartDate)} to {displayValue(row.plannedProductionEndDate)} | {displayValue(row.runningStatus)}</div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <Button
                        type="button"
                        variant={selected ? "default" : "outline"}
                        onClick={() => setSelectedTargetInterruptions((current) => ({ ...current, [rowKey]: !selected }))}
                      >
                        {selected ? "Stop selected" : "Do not stop / click to stop"}
                      </Button>
                      {selected ? (
                        <Field label="Produced qty">
                          <Input
                            className="w-28"
                            type="number"
                            min="0"
                            max={Number.isFinite(orderQty) && orderQty > 0 ? orderQty : undefined}
                            step="1"
                            value={targetFinishedQtyByRow[rowKey] ?? ""}
                            required
                            onChange={(event) => updateTargetFinishedQty(row, event.target.value)}
                          />
                        </Field>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <MachineConstraintQueueReviewPanel
            groups={queueReviewGroups}
            movableRows={selectedRows}
            queueAfterByRow={queueAfterByRow}
            onQueueAfterChange={(rowKey, value) => setQueueAfterByRow((current) => {
              const next = { ...current };
              if (value) next[rowKey] = value;
              else delete next[rowKey];
              return next;
            })}
          />
          {missingTargetFinishedQty ? (
            <div className="text-xs text-destructive">Enter produced quantity for every target running setup selected to stop.</div>
          ) : null}
          {switchConflicts.length ? (
            <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <div className="text-sm font-medium text-destructive">Conflicting planner action found</div>
                <div className="text-xs text-muted-foreground">This switch cannot be saved while another active switch exists for the same setup with a different target or queue position.</div>
              </div>
              {switchConflicts.map((conflict, index) => (
                <div key={`${displayValue(conflict.targetId)}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2">
                  <div>
                    <div className="text-sm font-medium">{displayValue(conflict.targetLabel)}</div>
                    <div className="text-xs text-muted-foreground">{displayValue(conflict.targetKey)} | {displayValue(conflict.createdAt)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={() => { setReviewReady(false); setQueueReviewConfirmed(false); }}>
                      Keep existing
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={() => void reverseSwitchConflict(conflict)}>
                      <Undo2 className="size-4" />
                      Reverse existing
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <label className="flex items-start gap-2 rounded-md border bg-background p-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={queueReviewConfirmed}
              onChange={(event) => setQueueReviewConfirmed(event.target.checked)}
            />
            <span>Queue reviewed; save this part-specific machine switch and recalculate planning.</span>
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button className="w-fit" type="submit" disabled={!canReview || isSubmitting || (reviewReady && !canSave)}>
          <Route className="size-4" />
          {reviewReady ? "Save machine switch" : "Review switch queue"}
        </Button>
        {reviewReady ? (
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => { setReviewReady(false); setQueueReviewConfirmed(false); }}>
            Recheck inputs
          </Button>
        ) : null}
      </div>
    </form>
  );
}
function MachineConstraintQueueReviewPanel({
  groups,
  movableRows = [],
  queueAfterByRow = {},
  onQueueAfterChange,
}: {
  groups: MachineConstraintQueueReviewGroup[];
  movableRows?: DashboardPayload[];
  queueAfterByRow?: Record<string, string>;
  onQueueAfterChange?: (rowKey: string, value: string) => void;
}) {
  const destinationGroups = groups.filter((group) => group.kind === "destination");
  const defaultDestinationMachine = destinationGroups[0]?.machine ?? "";
  const canPlaceTiles = Boolean(onQueueAfterChange && movableRows.length && destinationGroups.length);

  return (
    <div className="grid gap-2 rounded-md border border-dashed bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Replanned queue review</div>
          {canPlaceTiles ? <div className="text-xs text-muted-foreground">Drag each affected setup tile to the planned position before saving.</div> : null}
        </div>
        <StatusBadge value={`${formatNumber(groups.length)} queue groups`} />
      </div>
      {groups.length ? (
        <div className="grid gap-2">
          {groups.map((group) => (
            <div key={`${group.kind}-${group.machine}`} className="grid gap-2 rounded-md border bg-muted/10 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{group.title}</div>
                <StatusBadge value={group.kind === "destination" ? "Destination queue" : group.kind === "downstream" ? "Downstream WIP queue" : "Same machine queue"} />
              </div>
              <div className="text-xs text-muted-foreground">{group.description}</div>
              {canPlaceTiles && group.kind === "destination" && onQueueAfterChange ? (
                <MachineConstraintQueuePlacementBoard
                  group={group}
                  movableRows={movableRows}
                  queueAfterByRow={queueAfterByRow}
                  defaultDestinationMachine={defaultDestinationMachine}
                  onQueueAfterChange={onQueueAfterChange}
                />
              ) : (
                <MachineConstraintStaticQueueRows group={group} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background p-2 text-sm text-muted-foreground">No destination or downstream queues were identified from the current plan.</div>
      )}
    </div>
  );
}

function MachineConstraintQueuePlacementBoard({
  group,
  movableRows,
  queueAfterByRow,
  defaultDestinationMachine,
  onQueueAfterChange,
}: {
  group: MachineConstraintQueueReviewGroup;
  movableRows: DashboardPayload[];
  queueAfterByRow: Record<string, string>;
  defaultDestinationMachine: string;
  onQueueAfterChange: (rowKey: string, value: string) => void;
}) {
  const groupMachineKey = machineKey(group.machine);
  const movableKeys = new Set(movableRows.map(machineIssueRowKey));
  const placedRows = movableRows.filter((row) => {
    const placement = machineConstraintPlacementParts(queueAfterByRow[machineIssueRowKey(row)], defaultDestinationMachine);
    return placement.machineKey === groupMachineKey;
  });
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function placeRow(rowKey: string, index: number) {
    const boundedIndex = Math.max(0, Math.min(index, group.rows.length));
    const afterKey = boundedIndex > 0 ? machineConstraintQueueRowKey(group.rows[boundedIndex - 1]!) : "";
    onQueueAfterChange(rowKey, machineConstraintPlacementValue(group.machine, afterKey));
  }

  function allowDrop(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }

  function dropMoveTile(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    const sourceKey = event.dataTransfer.getData("text/plain");
    setDragOverIndex(null);
    if (!sourceKey || !movableKeys.has(sourceKey)) return;
    placeRow(sourceKey, index);
  }

  return (
    <div className="grid gap-1 rounded-md border bg-background p-2">
      {Array.from({ length: group.rows.length + 1 }, (_, index) => {
        const slotRows = placedRows.filter((row) => machineConstraintQueuePlacementIndex(group.rows, machineConstraintPlacementParts(queueAfterByRow[machineIssueRowKey(row)], defaultDestinationMachine).afterKey) === index);
        const slotPreviewWindows = machineConstraintSlotPreviewWindows(group.rows, slotRows, index);
        return (
          <Fragment key={`${group.machine}-slot-${index}`}>
            <PriorityQueueDropZone
              active={dragOverIndex === index}
              current={slotRows.length > 0}
              label={machineConstraintQueueDropLabel(index, group.rows)}
              onClick={() => undefined}
              onDragOver={(event) => allowDrop(event, index)}
              onDragLeave={() => setDragOverIndex((current) => current === index ? null : current)}
              onDrop={(event) => dropMoveTile(event, index)}
            />
            {slotRows.map((row) => (
              <MachineConstraintMoveTile
                key={`${group.machine}-${machineIssueRowKey(row)}`}
                row={row}
                targetMachine={group.machine}
                previewWindow={slotPreviewWindows.get(machineIssueRowKey(row))}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", machineIssueRowKey(row));
                }}
                onDragEnd={() => setDragOverIndex(null)}
              />
            ))}
            {index < group.rows.length ? (
              <MachineConstraintQueueRowTile row={group.rows[index]!} />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function machineConstraintSlotPreviewWindows(rows: DashboardPayload[], slotRows: DashboardPayload[], slotIndex: number) {
  const windows = new Map<string, { startDate: string; endDate: string }>();
  let nextStart = slotIndex > 0
    ? nextCalendarDateLabelForReview(rows[slotIndex - 1]?.plannedProductionEndDate || rows[slotIndex - 1]?.setupPlannedDate || rows[slotIndex - 1]?.plannedDate)
    : "";

  for (const row of slotRows) {
    const originalStart = parseReviewDateLabel(row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate);
    const originalEnd = parseReviewDateLabel(row.plannedProductionEndDate || row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate);
    const durationDays = originalStart && originalEnd
      ? Math.max(1, Math.round((originalEnd.getTime() - originalStart.getTime()) / 86400000) + 1)
      : 1;
    const startDate = nextStart || displayValue(row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate);
    const endDate = addCalendarDaysLabelForReview(startDate, durationDays - 1) || displayValue(row.plannedProductionEndDate || row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate);
    windows.set(machineIssueRowKey(row), { startDate, endDate });
    nextStart = nextCalendarDateLabelForReview(endDate);
  }

  return windows;
}

function nextCalendarDateLabelForReview(value: unknown) {
  return addCalendarDaysLabelForReview(value, 1);
}

function addCalendarDaysLabelForReview(value: unknown, days: number) {
  const date = parseReviewDateLabel(value);
  if (!date) return "";
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return formatReviewDateLabel(next);
}

function parseReviewDateLabel(value: unknown) {
  const textValue = str(value);
  if (!textValue || textValue === "-") return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(textValue);
  if (iso?.[1] && iso[2] && iso[3]) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dashboard = /^(\d{1,2})-([A-Za-z]+)-(\d{2,4})$/.exec(textValue);
  if (dashboard?.[1] && dashboard[2] && dashboard[3]) {
    const month = reviewMonthNumber(dashboard[2]);
    const year = Number(dashboard[3].length === 2 ? `20${dashboard[3]}` : dashboard[3]);
    if (month) return new Date(year, month - 1, Number(dashboard[1]));
  }
  const parsed = new Date(textValue);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatReviewDateLabel(date: Date) {
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][date.getMonth()] ?? "";
  return `${date.getDate()}-${month}-${String(date.getFullYear()).slice(-2)}`;
}

function reviewMonthNumber(value: string) {
  const months: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };
  return months[value.toLowerCase()] ?? 0;
}
function MachineConstraintMoveTile({
  row,
  targetMachine,
  previewWindow,
  onDragStart,
  onDragEnd,
}: {
  row: DashboardPayload;
  targetMachine: string;
  previewWindow?: { startDate: string; endDate: string };
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className="grid cursor-grab gap-2 rounded-md border border-primary/50 bg-primary/10 p-2 active:cursor-grabbing md:grid-cols-[auto_1fr_auto] md:items-center"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <GripVertical className="size-4 text-primary" aria-hidden="true" />
      <div>
        <div className="text-sm font-semibold">{itemCode(row)} / {jobCardNumber(row)} / Setup {displayValue(row.setupNo)}</div>
        <div className="text-xs text-muted-foreground">Move remaining/planned quantity to {targetMachine} | Current {machineValue(row, "machine")} | Preview {displayValue(previewWindow?.startDate || row.plannedProductionStartDate)} to {displayValue(previewWindow?.endDate || row.plannedProductionEndDate)}</div>
      </div>
      <Badge>Move</Badge>
    </div>
  );
}

function MachineConstraintQueueRowTile({ row }: { row: DashboardPayload }) {
  return (
    <div className="grid gap-1 rounded border bg-background px-2 py-1">
      <div className="text-xs font-medium">{itemCode(row)} / {jobCardNumber(row)} / Setup {displayValue(row.setupNo)}</div>
      <div className="text-xs text-muted-foreground">
        {machineValue(row, "machine")} | Order {displayValue(row.orderPcs, true)} of {displayValue(row.totalOrderPcs || row.orderPcs, true)} | Production {displayValue(row.plannedProductionStartDate)} to {displayValue(row.plannedProductionEndDate)} | {displayValue(row.runningStatus)}
      </div>
    </div>
  );
}

function MachineConstraintStaticQueueRows({ group }: { group: MachineConstraintQueueReviewGroup }) {
  return group.rows.length ? (
    <div className="grid gap-1">
      {group.rows.map((row, index) => (
        <MachineConstraintQueueRowTile key={`${group.machine}-${jobCardNumber(row)}-${displayValue(row.setupNo)}-${index}`} row={row} />
      ))}
    </div>
  ) : (
    <div className="rounded border border-dashed bg-background px-2 py-1 text-xs text-muted-foreground">{group.emptyMessage || "No current planned rows in this queue."}</div>
  );
}
function PlannerActionConflictPanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const conflicts = asArray(productionControl.plannerActionConflicts);
  const [resolvingKey, setResolvingKey] = useState("");
  if (!conflicts.length) return null;

  async function keepChoice(conflict: DashboardPayload, choice: DashboardPayload) {
    const choices = asArray(conflict.choices);
    const keepId = displayValue(choice.targetId);
    if (!keepId || keepId === "-") return;
    setResolvingKey(`${displayValue(conflict.jcNo)}-${displayValue(conflict.setupNo)}-${keepId}`);
    try {
      for (const other of choices) {
        const targetId = displayValue(other.targetId);
        if (!targetId || targetId === "-" || targetId === keepId) continue;
        await submitAction("reverse-entry", {
          targetTable: displayValue(other.targetTable) !== "-" ? displayValue(other.targetTable) : "planOverrides",
          targetId,
          targetKey: displayValue(other.targetKey) !== "-" ? displayValue(other.targetKey) : "",
          targetLabel: displayValue(other.targetLabel) !== "-" ? displayValue(other.targetLabel) : "",
          reason: `Planner resolved conflicting machine switch and kept ${displayValue(choice.targetLabel)}`,
          correctedBy: "Planner",
        });
      }
    } finally {
      setResolvingKey("");
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <div>
        <div className="text-sm font-semibold text-destructive">Planner action conflicts</div>
        <div className="text-xs text-muted-foreground">Choose which active planner decision should remain. Other conflicting switch rows will be reversed with history preserved.</div>
      </div>
      {conflicts.map((conflict, index) => (
        <div key={`${displayValue(conflict.jcNo)}-${displayValue(conflict.setupNo)}-${index}`} className="grid gap-2 rounded-md border bg-background p-3">
          <div className="text-sm font-medium">{displayValue(conflict.message)}</div>
          <div className="text-xs text-muted-foreground">
            {displayValue(conflict.partCode)} / {displayValue(conflict.jcNo)} / setup {displayValue(conflict.setupNo)}
          </div>
          <div className="flex flex-wrap gap-2">
            {asArray(conflict.choices).map((choice, choiceIndex) => {
              const key = `${displayValue(conflict.jcNo)}-${displayValue(conflict.setupNo)}-${displayValue(choice.targetId)}`;
              return (
                <Button key={`${displayValue(choice.targetId)}-${choiceIndex}`} type="button" size="sm" variant="outline" onClick={() => void keepChoice(conflict, choice)} disabled={Boolean(resolvingKey)}>
                  <CheckCircle2 className="size-4" />
                  {resolvingKey === key ? "Resolving" : displayValue(choice.targetLabel)}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
function PlannerPreSaveConflictReview({
  conflicts,
  title,
  description,
  onKeepExisting,
  onReverseExisting,
}: {
  conflicts: DashboardPayload[];
  title: string;
  description: string;
  onKeepExisting: () => void;
  onReverseExisting: (conflict: DashboardPayload) => void | Promise<void>;
}) {
  if (!conflicts.length) return null;
  return (
    <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div>
        <div className="text-sm font-medium text-destructive">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {conflicts.map((conflict, index) => (
        <div key={`${displayValue(conflict.targetId)}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2">
          <div>
            <div className="text-sm font-medium">{displayValue(conflict.targetLabel)}</div>
            <div className="text-xs text-muted-foreground">{displayValue(conflict.targetKey)} | {displayValue(conflict.createdAt)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onKeepExisting}>Keep existing</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void onReverseExisting(conflict)}>
              <Undo2 className="size-4" />
              Reverse existing
            </Button>
          </div>
        </div>
      ))}
    </div>
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
  const [queueAfterByStep, setQueueAfterByStep] = useState<Record<string, string>>({});
  const [finishedQtyByInterruption, setFinishedQtyByInterruption] = useState<Record<string, string>>({});
  const [confirmedPrioritySteps, setConfirmedPrioritySteps] = useState<Record<string, boolean>>({});
  const [resolvedPriorityConflictIds, setResolvedPriorityConflictIds] = useState<Set<string>>(() => new Set());
  const jobCardOptions = useMemo(() => uniqueValues(workOrders
    .filter((row) => !partCode || machineKey(itemCode(row)) === machineKey(partCode))
    .map(jobCardNumber)
    .filter((value) => value !== "-")), [partCode, workOrders]);
  const selectedPart = partCode || itemOptions[0] || "";
  const selectedJc = jcNo && jobCardOptions.includes(jcNo) ? jcNo : "";
  const priorityPlan = useMemo(() => priorityChangePlan(productionControl, selectedPart, selectedJc), [productionControl, selectedPart, selectedJc]);
  const priorityStepWindows = useMemo(() => priorityPlanStepWindows(priorityPlan.steps, selectedInterruptions, queueAfterByStep), [priorityPlan.steps, selectedInterruptions, queueAfterByStep]);
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
  const confirmedWindows = confirmedSteps
    .map((step) => priorityStepWindows.get(step.key))
    .filter((window): window is PriorityPlanWindow => Boolean(window));
  const itemPlanWindow = allStepsConfirmed && confirmedWindows.length
    ? { startDate: confirmedWindows[0]?.startDate ?? "", endDate: confirmedWindows.at(-1)?.endDate ?? "" }
    : undefined;
  const priorityConflicts = useMemo(() => plannerPriorityPreSaveConflicts(asArray(productionControl.plannerActionLog).filter((row) => displayValue(row.actionType) === "Priority"), {
    target: selectedJc || selectedPart,
    jcNo: selectedJc,
    partCode: selectedPart,
    priority,
    queueBeforeSetups: priorityPlanQueueBeforeSetups(priorityPlan.steps, queueAfterByStep),
    resolvedIds: resolvedPriorityConflictIds,
  }), [productionControl.plannerActionLog, priority, priorityPlan.steps, queueAfterByStep, resolvedPriorityConflictIds, selectedJc, selectedPart]);

  function resetPlanReview() {
    setPlanReady(false);
    setSelectedInterruptions({});
    setQueueAfterByStep({});
    setFinishedQtyByInterruption({});
    setConfirmedPrioritySteps({});
    setResolvedPriorityConflictIds(new Set());
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
    setQueueAfterByStep((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => keepKeys.has(key)),
    ));
    setFinishedQtyByInterruption((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !downstreamBlockerKeys.has(key)),
    ));
  }

  async function reversePriorityConflict(conflict: DashboardPayload) {
    const targetId = displayValue(conflict.targetId);
    if (!targetId || targetId === "-") return;
    await submitAction("reverse-entry", {
      targetTable: "plannerPriorities",
      targetId,
      targetKey: displayValue(conflict.targetKey) !== "-" ? displayValue(conflict.targetKey) : "",
      targetLabel: displayValue(conflict.targetLabel) !== "-" ? displayValue(conflict.targetLabel) : "",
      reason: `Planner replacing conflicting priority action with ${selectedJc || selectedPart} ${priority}`,
      correctedBy: "Planner",
    });
    setResolvedPriorityConflictIds((current) => new Set([...current, targetId]));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planReady) {
      setPlanReady(true);
      return;
    }
    if ((!selectedPart && !selectedJc) || hasSelectedRunningWithoutQty || !allStepsConfirmed || priorityConflicts.length > 0) return;
    const queueBeforeSetups = priorityPlanQueueBeforeSetups(priorityPlan.steps, queueAfterByStep);
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
      queueBeforeSetups,
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
            <>
              <PrioritySetupPreviewSummary
                steps={priorityPlan.steps}
                windows={priorityStepWindows}
                confirmedSteps={confirmedPrioritySteps}
                activeStepKey={activeStepIndex >= 0 ? priorityPlan.steps[activeStepIndex]?.key ?? "" : ""}
              />
              <div className="grid gap-2">
              {priorityPlan.steps.map((step, index) => (
                <PriorityPlanStepReview
                  key={step.key}
                  step={step}
                  state={confirmedPrioritySteps[step.key] ? "confirmed" : index === activeStepIndex ? "active" : "locked"}
                  previousSetupLabel={index > 0 ? `Setup ${priorityPlan.steps[index - 1]?.setupNo}` : ""}
                  plannedWindow={priorityStepWindows.get(step.key) ?? { startDate: step.startDate, endDate: step.endDate }}
                  selectedInterruptions={selectedInterruptions}
                  queueAfterKey={queueAfterByStep[step.key] ?? ""}
                  finishedQtyByInterruption={finishedQtyByInterruption}
                  setSelectedInterruptions={setSelectedInterruptions}
                  onQueueAfterChange={(value) => setQueueAfterByStep((current) => {
                    const next = { ...current };
                    if (value) next[step.key] = value;
                    else delete next[step.key];
                    return next;
                  })}
                  setFinishedQtyByInterruption={setFinishedQtyByInterruption}
                  onConfirm={() => confirmPriorityStep(step.key)}
                  onEdit={() => editPriorityStep(step.key)}
                />
              ))}
              </div>
            </>
          ) : (
            <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">No planned setup was found for this item / JC in the current machine plan.</div>
          )}
          {hasSelectedRunningWithoutQty ? (
            <div className="text-xs text-destructive">Enter finished quantity for every running setup selected to stop.</div>
          ) : null}
          <PlannerPreSaveConflictReview
            conflicts={priorityConflicts}
            title="Conflicting priority action found"
            description="This priority cannot be applied while another active priority decision exists for the same item or job card with different priority or queue choices."
            onKeepExisting={resetPlanReview}
            onReverseExisting={reversePriorityConflict}
          />
        </div>
      ) : null}

      <Button className="w-fit" type="submit" disabled={planReady && (priorityPlan.steps.length === 0 || hasSelectedRunningWithoutQty || !allStepsConfirmed || priorityConflicts.length > 0)}>
        <Wrench className="size-4" />
        {planReady ? "Apply confirmed priority" : "Show probable plan"}
      </Button>
    </form>
  );
}

function PrioritySetupPreviewSummary({
  steps,
  windows,
  confirmedSteps,
  activeStepKey,
}: {
  steps: PriorityPlanStep[];
  windows: Map<string, PriorityPlanWindow>;
  confirmedSteps: Record<string, boolean>;
  activeStepKey: string;
}) {
  return (
    <div className="grid gap-2 rounded-md border bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">Probable setup dates</div>
      <div className="grid gap-2 md:grid-cols-3">
        {steps.map((step) => {
          const window = windows.get(step.key) ?? { startDate: step.startDate, endDate: step.endDate };
          const stateLabel = confirmedSteps[step.key]
            ? "Confirmed"
            : step.key === activeStepKey
              ? "Editing"
              : "Queued preview";
          return (
            <div key={step.key} className="grid gap-1 rounded-md border bg-muted/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Setup {step.setupNo}</div>
                <Badge variant={confirmedSteps[step.key] ? "outline" : "secondary"}>{stateLabel}</Badge>
              </div>
              <div className="text-sm font-semibold">{window.startDate || "-"} to {window.endDate || "-"}</div>
              <div className="text-xs text-muted-foreground">{step.machine} - {step.itemCode} / {step.jcNo}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function PriorityPlanStepReview({
  step,
  state,
  previousSetupLabel,
  plannedWindow,
  selectedInterruptions,
  queueAfterKey,
  finishedQtyByInterruption,
  setSelectedInterruptions,
  onQueueAfterChange,
  setFinishedQtyByInterruption,
  onConfirm,
  onEdit,
}: {
  step: PriorityPlanStep;
  state: "active" | "confirmed" | "locked";
  previousSetupLabel: string;
  plannedWindow: PriorityPlanWindow;
  selectedInterruptions: Record<string, boolean>;
  queueAfterKey: string;
  finishedQtyByInterruption: Record<string, string>;
  setSelectedInterruptions: Dispatch<SetStateAction<Record<string, boolean>>>;
  onQueueAfterChange: (value: string) => void;
  setFinishedQtyByInterruption: Dispatch<SetStateAction<Record<string, string>>>;
  onConfirm: () => void;
  onEdit: () => void;
}) {
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
  const queuedBlockers = step.blockers.filter((blocker) => blocker.state === "queued");
  const heldQueueBlockers = priorityPlanHeldBlockers(step, queueAfterKey);

  const interruptMode = selectedRunningCount
    ? `Stop ${selectedRunningCount} running setup${selectedRunningCount === 1 ? "" : "s"}`
    : selectedStartedCount
      ? `Move ${selectedStartedCount} started setup${selectedStartedCount === 1 ? "" : "s"}`
      : runningBlockerCount
        ? "Do not stop running machine"
        : "";
  const queueMode = queuedBlockers.length
    ? heldQueueBlockers.length === 0
      ? "Position 1 on queued machine work"
      : heldQueueBlockers.length === queuedBlockers.length
        ? "Current queue position"
        : `After ${heldQueueBlockers.length} queued setup${heldQueueBlockers.length === 1 ? "" : "s"}`
    : "No queued setup ahead";
  const planMode = [interruptMode, queueMode].filter(Boolean).join("; ");

  return (
    <div className="grid gap-2 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{step.itemCode} / {step.jcNo} / Setup {step.setupNo}</div>
          <div className="text-xs text-muted-foreground">
            {state === "confirmed"
              ? `Confirmed on ${step.machine} - ${plannedWindow.startDate || "-"} to ${plannedWindow.endDate || "-"}`
              : `Preview on ${step.machine} - ${plannedWindow.startDate || "-"} to ${plannedWindow.endDate || "-"}`}
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
        <PriorityScenarioCard
          title="Probable setup plan"
          window={plannedWindow}
          detail={planMode || "No queue impact"}
        />
      ) : null}

      {state === "active" && queuedBlockers.length ? (
        <PriorityQueuePlacementBoard
          step={step}
          queueAfterKey={queueAfterKey}
          plannedWindow={plannedWindow}
          onQueueAfterChange={onQueueAfterChange}
        />
      ) : null}

      {state === "active" && step.blockers.some((blocker) => blocker.requiresApproval) ? (
        <div className="grid gap-2">
          {step.blockers.filter((blocker) => blocker.requiresApproval).map((blocker) => {
            const selected = Boolean(selectedInterruptions[blocker.key]);
            return (
              <div key={blocker.key} className="grid gap-2 rounded-md border p-2 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="text-sm font-medium">{blocker.itemCode} / {blocker.jcNo} / Setup {blocker.setupNo}</div>
                  <div className="text-xs text-muted-foreground">{blocker.machine} - {blocker.startDate} to {blocker.endDate} - {blocker.label}</div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    type="button"
                    variant={selected ? "default" : "outline"}
                    onClick={() => setSelectedInterruptions((current) => ({ ...current, [blocker.key]: !selected }))}
                  >
                    {blocker.state === "running" ? (selected ? "Stop selected" : "Stop this setup") : (selected ? "Move approved" : "Approve queue move")}
                  </Button>
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


function PriorityQueuePlacementBoard({
  step,
  queueAfterKey,
  plannedWindow,
  onQueueAfterChange,
}: {
  step: PriorityPlanStep;
  queueAfterKey: string;
  plannedWindow: PriorityPlanWindow;
  onQueueAfterChange: (value: string) => void;
}) {
  const queuedBlockers = step.blockers.filter((blocker) => blocker.state === "queued");
  const placementIndex = priorityQueuePlacementIndex(queuedBlockers, queueAfterKey);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function placeAt(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, queuedBlockers.length));
    const afterKey = boundedIndex > 0 ? queuedBlockers[boundedIndex - 1]?.key ?? "" : "";
    onQueueAfterChange(afterKey);
  }

  function dragPriority(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", step.key);
  }

  function allowDrop(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }

  function dropPriority(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    const sourceKey = event.dataTransfer.getData("text/plain");
    setDragOverIndex(null);
    if (sourceKey && sourceKey !== step.key) return;
    placeAt(index);
  }

  return (
    <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{step.machine} queue placement</div>
          <div className="text-sm font-semibold">{plannedWindow.startDate || "-"} to {plannedWindow.endDate || "-"}</div>
        </div>
        <Badge variant="secondary">{placementIndex === 0 ? "Position 1" : `After ${placementIndex} setup${placementIndex === 1 ? "" : "s"}`}</Badge>
      </div>
      <div className="grid gap-1">
        {Array.from({ length: queuedBlockers.length + 1 }, (_, index) => (
          <Fragment key={`${step.key}-slot-${index}`}>
            <PriorityQueueDropZone
              active={dragOverIndex === index}
              current={placementIndex === index}
              label={priorityQueueDropLabel(index, queuedBlockers)}
              onClick={() => placeAt(index)}
              onDragOver={(event) => allowDrop(event, index)}
              onDragLeave={() => setDragOverIndex((current) => current === index ? null : current)}
              onDrop={(event) => dropPriority(event, index)}
            />
            {placementIndex === index ? (
              <PriorityQueuePriorityTile
                step={step}
                plannedWindow={plannedWindow}
                onDragStart={dragPriority}
                onDragEnd={() => setDragOverIndex(null)}
              />
            ) : null}
            {index < queuedBlockers.length ? (
              <PriorityQueueBlockerTile
                blocker={queuedBlockers[index]!}
                keptAhead={index < placementIndex}
                onPlaceBefore={() => placeAt(index)}
                onPlaceAfter={() => placeAt(index + 1)}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function PriorityQueueDropZone({
  active,
  current,
  label,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  active: boolean;
  current: boolean;
  label: string;
  onClick: () => void;
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  const className = [
    "h-3 rounded-full border transition-colors",
    current ? "border-primary bg-primary/25" : "border-dashed border-transparent bg-transparent hover:border-primary/50 hover:bg-primary/10",
    active ? "border-primary bg-primary/20" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className="sr-only">{label}</span>
    </button>
  );
}

function PriorityQueuePriorityTile({
  step,
  plannedWindow,
  onDragStart,
  onDragEnd,
}: {
  step: PriorityPlanStep;
  plannedWindow: PriorityPlanWindow;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className="grid cursor-grab gap-2 rounded-md border border-primary/50 bg-primary/10 p-2 active:cursor-grabbing md:grid-cols-[auto_1fr_auto] md:items-center"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <GripVertical className="size-4 text-primary" aria-hidden="true" />
      <div>
        <div className="text-sm font-semibold">{step.itemCode} / {step.jcNo} / Setup {step.setupNo}</div>
        <div className="text-xs text-muted-foreground">{step.machine} - {plannedWindow.startDate || "-"} to {plannedWindow.endDate || "-"}</div>
      </div>
      <Badge>Priority</Badge>
    </div>
  );
}

function PriorityQueueBlockerTile({
  blocker,
  keptAhead,
  onPlaceBefore,
  onPlaceAfter,
}: {
  blocker: PriorityPlanStep["blockers"][number];
  keptAhead: boolean;
  onPlaceBefore: () => void;
  onPlaceAfter: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border bg-background p-2 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="text-sm font-medium">{blocker.itemCode} / {blocker.jcNo} / Setup {blocker.setupNo}</div>
        <div className="text-xs text-muted-foreground">{blocker.machine} - {blocker.startDate} to {blocker.endDate}</div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={keptAhead ? "secondary" : "outline"}>{keptAhead ? "Ahead of priority" : "After priority"}</Badge>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon-xs" aria-label={`Place priority before ${blocker.itemCode} ${blocker.jcNo} setup ${blocker.setupNo}`} title="Place priority before this setup" onClick={onPlaceBefore}>
            <ArrowUp className="size-3" />
          </Button>
          <Button type="button" variant="outline" size="icon-xs" aria-label={`Place priority after ${blocker.itemCode} ${blocker.jcNo} setup ${blocker.setupNo}`} title="Place priority after this setup" onClick={onPlaceAfter}>
            <ArrowDown className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function priorityQueuePlacementIndex(queuedBlockers: PriorityPlanStep["blockers"], queueAfterKey: string) {
  if (!queueAfterKey) return 0;
  const blockerIndex = queuedBlockers.findIndex((blocker) => blocker.key === queueAfterKey);
  return blockerIndex < 0 ? 0 : blockerIndex + 1;
}

function priorityQueueDropLabel(index: number, queuedBlockers: PriorityPlanStep["blockers"]) {
  if (index === 0) return "Place priority at position 1";
  const blocker = queuedBlockers[index - 1];
  return blocker ? `Place priority after ${blocker.itemCode} / ${blocker.jcNo} / setup ${blocker.setupNo}` : "Place priority at current queue position";
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
  const selectedSetupPlan = useMemo(() => {
    const next: Record<string, { plan: boolean; quantity: string; remark: string }> = {};
    for (const setup of selectedSetups) {
      const setupNo = str(setup.displaySetupNo || setup.setupNo);
      next[setupNo] = setupPlan[setupNo] ?? { plan: true, quantity: defaultOrderQty, remark: "" };
    }
    return next;
  }, [defaultOrderQty, selectedSetups, setupPlan]);

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
      const state = selectedSetupPlan[setupNo] ?? { plan: false, quantity: "", remark: "" };
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
              const state = selectedSetupPlan[setupNo] ?? { plan: true, quantity: str(selectedWorkOrder?.orderPcs), remark: "" };
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
  { id: "presetting", label: "Pre setting started", role: "Assistant machinist", button: "Start pre setting" },
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



  async function saveSetupChecklistSession(row: DashboardPayload, session: DashboardPayload) {
    const payload = setupChecklistSessionPayload(row, session);
    await submitAction("data-entry", {
      entryType: "setup_checklist_session",
      key: dataEntryKey("setup_checklist_session", payload),
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
                      <ShopFloorRowAction
                        current={row.current}
                        next={row.next}
                        onSaveStage={saveStage}
                        onSaveSetupChecklistSession={saveSetupChecklistSession}
                        setupChecklistMasters={asArray(productionControl.setupChecklistMasterRows)}
                        setupChecklistSessions={asArray(productionControl.setupChecklistSessionRows)}
                      />
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
  const runningRows = useMemo(() => currentShopFloorRows(productionControl), [productionControl]);
  const existingProductionCardRows = useMemo(() => asArray(productionControl.productionCardRows), [productionControl]);
  const productionCardRows = useMemo(() => {
    const taskRows = roleRows.map((row) => row.next).filter((row): row is DashboardPayload => Boolean(row));
    if (role === "shopFloor" || role === "quality" || role === "machinist") return runningRows;
    return taskRows;
  }, [role, roleRows, runningRows]);
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


  async function saveProductionCard(row: DashboardPayload, card: DashboardPayload) {
    const payload = productionCardPayload(row, card);
    await submitAction("data-entry", {
      entryType: "production_card",
      key: dataEntryKey("production_card", payload),
      payload,
    });
    if (card.writeProductionOutput) {
      await submitAction("data-entry", {
        entryType: "software_raw",
        key: dataEntryKey("software_raw", payload),
        payload,
      });
      if (productionCycleMasterChanged(row, card)) {
        const cyclePayload = productionCycleMasterPayload(row, card);
        await submitAction("data-entry", {
          entryType: "cycle",
          key: dataEntryKey("cycle", cyclePayload),
          payload: cyclePayload,
        });
      }
    }
  }

  async function saveSetupChecklistSession(row: DashboardPayload, session: DashboardPayload) {
    const payload = setupChecklistSessionPayload(row, session);
    await submitAction("data-entry", {
      entryType: "setup_checklist_session",
      key: dataEntryKey("setup_checklist_session", payload),
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
          {role === "quality" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { window.location.href = "/dashboard/hourly-quality-check"; }}>
                <Gauge className="size-4" />
                Hourly quality check
              </Button>
            </div>
          ) : null}
          <ProductionCardRoleEntryForm
            role={role}
            rows={productionCardRows}
            existingCardRows={existingProductionCardRows}
            onSaveProductionCard={saveProductionCard}
            downtimeReasonRows={asArray(productionControl.downtimeReasonMasterRows)}
            rejectionTypeRows={asArray(productionControl.rejectionTypeMasterRows)}
            rejectionReasonRows={asArray(productionControl.rejectionReasonMasterRows)}
            rejectionRemarkRows={asArray(productionControl.rejectionRemarkMasterRows)}
            bulkRows={role === "shopFloor" ? runningRows : []}
          />
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
                            setupChecklistMasters={asArray(productionControl.setupChecklistMasterRows)}
                            setupChecklistSessions={asArray(productionControl.setupChecklistSessionRows)}
                            onSaveSetupChecklistSession={saveSetupChecklistSession}
                            openDataEntry={openDataEntry}
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
  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null);
  const defaultExpandedTaskKey = tasks[0] ? shopFloorPlanKey(tasks[0]) : "";
  const activeExpandedTaskKey = expandedTaskKey ?? defaultExpandedTaskKey;

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
                    const expanded = activeExpandedTaskKey === taskKey;
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
  compact = false,
}: {
  row: DashboardPayload;
  tone: "current" | "next";
  compact?: boolean;
}) {
  const statusLabel = tone === "current" ? "Running" : (str(row.shopFloorStageLabel) || "Planned");
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="text-sm font-medium text-foreground">{itemCode(row)}</span>
        <StatusBadge value={statusLabel} />
        <span>{jobCardNumber(row)}</span>
        <span>Setup {displayValue(row.setupNo)}</span>
        <span>Option {displayValue(row.optionNumber)}</span>
        <span>RM: {displayValue(row.rmStatus)}</span>
      </div>
    );
  }
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
  onSaveSetupChecklistSession,
  inspectionMasters = [],
  setupChecklistMasters = [],
  setupChecklistSessions = [],
  openDataEntry,
}: {
  current?: DashboardPayload;
  next?: DashboardPayload;
  onSaveStage: (row: DashboardPayload, stage: ShopFloorStageId, extra?: Record<string, unknown>) => Promise<void>;
  onSaveFirstPieceReport?: (row: DashboardPayload, report: DashboardPayload) => Promise<void>;
  onSaveSetupChecklistSession?: (row: DashboardPayload, session: DashboardPayload) => Promise<void>;
  inspectionMasters?: DashboardPayload[];
  setupChecklistMasters?: DashboardPayload[];
  setupChecklistSessions?: DashboardPayload[];
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
  const currentChecklistSession = useMemo(() => next ? setupChecklistSessionForRow(setupChecklistSessions, next) : undefined, [next, setupChecklistSessions]);
  const activeChecklistMasters = useMemo(() => activeSetupChecklistMasterRows(setupChecklistMasters), [setupChecklistMasters]);
  const checklistPhase = nextStage?.id === "presetting" ? "start" : nextStage?.id === "setting" ? "end" : "";
  const needsSetupChecklist = Boolean(checklistPhase && onSaveSetupChecklistSession);
  const setupChecklistReady = !needsSetupChecklist
    || (Boolean(currentChecklistSession) && setupChecklistValuesComplete(asArray(currentChecklistSession?.items), {}, checklistPhase));
  const checklistPageHref = next && checklistPhase ? setupChecklistPageHref(next, checklistPhase) : "";
  const setupChecklistStatus = !needsSetupChecklist
    ? "Not required"
    : setupChecklistReady
      ? checklistPhase === "end" ? "Completion saved" : "Start saved"
      : currentChecklistSession
        ? "Saved progress"
        : "Checklist pending";
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
    if (needsSetupChecklist && !setupChecklistReady) return;
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
      const setupChecklist = needsSetupChecklist ? currentChecklistSession : undefined;
      await onSaveStage(next, nextStage.id, {
        doneBy,
        worker: nextStage.id === "operator_started" ? worker : "",
        remark,
        firstPieceInspection,
        setupChecklist,
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
      <div className="grid gap-3">
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
          {needsSetupChecklist ? (
            <div className="grid gap-2 rounded-md border bg-background p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">Setup checklist</div>
                <StatusBadge value={setupChecklistStatus} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => { window.location.href = checklistPageHref; }}>
                  Open checklist
                </Button>
                {checklistPhase === "start" && !activeChecklistMasters.length && openDataEntry ? (
                  <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => openDataEntry("setup_checklist_master", setupChecklistMasterDefaults())}>
                    Add checklist master
                  </Button>
                ) : null}
              </div>
            </div>
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
          <Button type="button" size="sm" className="w-fit" disabled={!canSubmitInspection || !setupChecklistReady || isSubmitting} onClick={() => void submitNextStage()}>
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

const DEFAULT_CRATE_WEIGHT_KG = 1.1;
const CRATE_WEIGHT_OPTIONS_KG = [1.1, 1.25, 1.5, 2];

const DEFAULT_REJECTION_TYPE_OPTIONS = [
  { code: "T1", label: "Quality Process Rejection" },
  { code: "T2", label: "Quality Control Rejection" },
  { code: "T3", label: "Setup Rejection" },
  { code: "T4", label: "In Process Setup Rejection" },
];

const DEFAULT_REJECTION_REMARK_OPTIONS = [
  { code: "R1", label: "Machine Malfunction" },
  { code: "R2", label: "Machine Setting Issue" },
  { code: "R3", label: "Operator Error" },
  { code: "R4", label: "Drawing Error" },
  { code: "R5", label: "Parameter Missed" },
  { code: "R6", label: "Measuring Instrument Issue" },
  { code: "R7", label: "QC Inspection Error" },
];

const DEFAULT_REJECTION_REASON_OPTIONS = [
  { code: "D1", label: "Length Short" },
  { code: "D2", label: "Raw Material Defect" },
  { code: "D3", label: "Thread Missing" },
  { code: "D4", label: "Operation Incomplete" },
  { code: "D5", label: "Tap Marks" },
  { code: "D6", label: "Flat Barb" },
  { code: "D7", label: "Hex Bent" },
  { code: "D8", label: "Step in Hole" },
  { code: "D9", label: "Incomplete Hole" },
  { code: "D10", label: "Dent on Thread" },
  { code: "D11", label: "Forging Defect" },
  { code: "D12", label: "Thread Gauge Fail" },
  { code: "D13", label: "Hole Missing" },
  { code: "D14", label: "Dent on Degree" },
  { code: "D15", label: "Plating Defect" },
  { code: "D16", label: "Knurling Defect" },
  { code: "D17", label: "Broken Part" },
  { code: "D18", label: "Dent on Face" },
  { code: "D19", label: "Coating Defect" },
  { code: "D20", label: "Hole Shifted" },
  { code: "D21", label: "Thread Not Straight" },
  { code: "D22", label: "Vibration on Thread" },
  { code: "D23", label: "Incomplete Thread" },
  { code: "D24", label: "Flat Thread" },
  { code: "D25", label: "Face Uneven" },
  { code: "D26", label: "Turning Bent" },
  { code: "D27", label: "Vibration on Face" },
  { code: "D28", label: "Dent on Hex" },
  { code: "D29", label: "Burr on Hex" },
  { code: "D30", label: "Vibration on Barb" },
  { code: "D31", label: "Dent on Barb" },
  { code: "D32", label: "Barb Deformed" },
  { code: "D33", label: "Burr on Barb" },
  { code: "D34", label: "Dent on Turning" },
  { code: "D35", label: "Vibration on Turning" },
  { code: "D36", label: "Burr in Hole" },
  { code: "D37", label: "Vibration in Hole" },
  { code: "D38", label: "Die Marks" },
  { code: "D39", label: "Vibration on Degree" },
  { code: "D40", label: "Degree Bent" },
  { code: "D41", label: "Outer Diameter Plus" },
  { code: "D42", label: "Outer Diameter Minus" },
  { code: "D43", label: "Cross Cutting" },
  { code: "D44", label: "Degree Plus" },
  { code: "D45", label: "Degree Minus" },
  { code: "D46", label: "Burr On Thread" },
  { code: "D47", label: "Burr On Degree" },
  { code: "D48", label: "Width Plus" },
  { code: "D49", label: "Lining Mark In Hole" },
  { code: "D50", label: "Step Length Short" },
  { code: "D51", label: "Width Minus" },
  { code: "D52", label: "Length Plus" },
  { code: "D53", label: "Barb Diameter Plus" },
  { code: "D54", label: "Barb Diameter Minus" },
  { code: "D55", label: "Barb Length Plus" },
  { code: "D56", label: "Barb Length Minus" },
  { code: "D57", label: "Inner Diameter Plus" },
  { code: "D58", label: "Inner Diameter Minus" },
];

function codedMasterOptions(rows: DashboardPayload[], defaults: Array<{ code: string; label: string }>, labelFields: string[]) {
  const options = new Map(defaults.map((option) => [option.code, option]));
  for (const row of rows) {
    if (displayValue(row.status).toLowerCase() === "inactive") continue;
    const code = displayValue(row.code);
    if (!code || code === "-") continue;
    const label = labelFields.map((field) => displayValue(row[field])).find((value) => value && value !== "-") ?? code;
    options.set(code, { code, label });
  }
  return [...options.values()];
}

function codedMasterLabel(options: Array<{ code: string; label: string }>, code: string) {
  return options.find((option) => option.code === code)?.label ?? code;
}

function ProductionCardRoleEntryForm({
  role,
  rows,
  existingCardRows = [],
  bulkRows = [],
  downtimeReasonRows = [],
  rejectionTypeRows = [],
  rejectionReasonRows = [],
  rejectionRemarkRows = [],
  onSaveProductionCard,
}: {
  role: RoleTaskKind;
  rows: DashboardPayload[];
  existingCardRows?: DashboardPayload[];
  bulkRows?: DashboardPayload[];
  downtimeReasonRows?: DashboardPayload[];
  rejectionTypeRows?: DashboardPayload[];
  rejectionReasonRows?: DashboardPayload[];
  rejectionRemarkRows?: DashboardPayload[];
  onSaveProductionCard: (row: DashboardPayload, card: DashboardPayload) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedKey, setSelectedKey] = useState("");
  const [prodDate, setProdDate] = useState(today);
  const [shift, setShift] = useState("Day");
  const [operatorNumber, setOperatorNumber] = useState("");

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [cycleSecondsByKey, setCycleSecondsByKey] = useState<Record<string, string>>({});
  const [pieceWeightByKey, setPieceWeightByKey] = useState<Record<string, string>>({});
  const [producedGrossKg, setProducedGrossKg] = useState("");
  const [cratesUsed, setCratesUsed] = useState("");
  const [crateWeightKg, setCrateWeightKg] = useState("1.1");
  const [downtimeCode, setDowntimeCode] = useState("");
  const [bulkDowntimeCode, setBulkDowntimeCode] = useState("");
  const [bulkDowntimeStart, setBulkDowntimeStart] = useState("");
  const [bulkDowntimeEnd, setBulkDowntimeEnd] = useState("");
  const [shopFloorEntryKind, setShopFloorEntryKind] = useState<"" | "production" | "bulkDowntime">("");
  const [qualityEntryKind, setQualityEntryKind] = useState<"" | "downtime" | "rejection">("");
  const [rejectionTypeCode, setRejectionTypeCode] = useState("");
  const [rejectionReasonCode, setRejectionReasonCode] = useState("");
  const [rejectionRemarkCode, setRejectionRemarkCode] = useState("");
  const [rejectedPieces, setRejectedPieces] = useState("");





  const [remarks, setRemarks] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const hydratedProductionCardKeyRef = useRef("");
  const rowOptions = useMemo(() => rows.map((row) => ({
    key: shopFloorPlanKey(row),
    label: `${displayValue(row.machine)} - ${itemCode(row)} / setup ${displayValue(row.setupNo)}`,
  })), [rows]);
  const downtimeReasonOptions = useMemo(() => downtimeReasonRows
    .filter((row) => displayValue(row.status).toLowerCase() !== "inactive")
    .map((row) => {
      const code = displayValue(row.code || row.downtimeCode);
      const reason = displayValue(row.reason || row.downtimeReason || row.description);
      return { code, reason, label: reason !== "-" ? `${code} - ${reason}` : code };
    })
    .filter((row) => row.code && row.code !== "-"), [downtimeReasonRows]);
  const downtimeReasonByCode = useMemo(() => new Map(downtimeReasonOptions.map((row) => [row.code, row.reason])), [downtimeReasonOptions]);
  const rejectionTypeOptions = useMemo(() => codedMasterOptions(rejectionTypeRows, DEFAULT_REJECTION_TYPE_OPTIONS, ["typeOfRejection", "rejectionType", "name"]), [rejectionTypeRows]);
  const rejectionReasonOptions = useMemo(() => codedMasterOptions(rejectionReasonRows, DEFAULT_REJECTION_REASON_OPTIONS, ["rejectionReason", "reason", "name"]), [rejectionReasonRows]);
  const rejectionRemarkOptions = useMemo(() => codedMasterOptions(rejectionRemarkRows, DEFAULT_REJECTION_REMARK_OPTIONS, ["rejectionRemark", "remark", "name"]), [rejectionRemarkRows]);
  const selectedRow = rows.find((row) => shopFloorPlanKey(row) === selectedKey);
  const selectedOptionKey = selectedRow ? shopFloorPlanKey(selectedRow) : "";
  const selectedCardKind = role === "shopFloor"
    ? shopFloorEntryKind === "production" ? "production" : shopFloorEntryKind === "bulkDowntime" ? "bulk_downtime" : ""
    : role === "quality" ? qualityEntryKind : "downtime";
  const existingProductionCard = useMemo(() => {
    if (!selectedCardKind || selectedCardKind === "bulk_downtime" || !selectedRow) return undefined;
    return existingCardRows
      .filter((card) => productionCardMatchesSelection(card, selectedRow, role, selectedCardKind, prodDate, shift))
      .sort((left, right) => str(right.savedAt).localeCompare(str(left.savedAt)))[0];
  }, [existingCardRows, prodDate, role, selectedCardKind, selectedRow, shift]);
  const defaultCycleSeconds = selectedRow ? productionCycleSeconds(selectedRow) : 0;
  const defaultPieceWeightGram = selectedRow ? productionPieceWeightGrams(selectedRow) : 0;
  const cycleSecondsInput = cycleSecondsByKey[selectedOptionKey] ?? (defaultCycleSeconds ? String(defaultCycleSeconds) : "");
  const pieceWeightInput = pieceWeightByKey[selectedOptionKey] ?? (defaultPieceWeightGram ? String(defaultPieceWeightGram) : "");
  const cycleSeconds = numeric(cycleSecondsInput) || defaultCycleSeconds;
  const pieceWeightGram = numeric(pieceWeightInput) || defaultPieceWeightGram;
  const grossKg = numeric(producedGrossKg);
  const crateCount = numeric(cratesUsed);
  const crateTareKg = numeric(crateWeightKg) || DEFAULT_CRATE_WEIGHT_KG;
  const netProducedKg = Math.max(grossKg - (crateCount * crateTareKg), 0);
  const producedPcs = pieceWeightGram > 0 ? Math.floor((netProducedKg * 1000) / pieceWeightGram) : 0;
  const shopFloorRuntimeMinutes = productionCardRuntimeMinutes(prodDate, startTime, endTime);
  const downtimeDurationMinutes = productionCardRuntimeMinutes(prodDate, startTime, endTime);
  const bulkDowntimeMinutes = productionCardRuntimeMinutes(prodDate, bulkDowntimeStart, bulkDowntimeEnd);
  const roleLabel = role === "shopFloor" ? "Shop floor production entry" : role === "quality" ? "Quality control entry" : "Machinist downtime entry";
  const hasEditedCycleSeconds = cycleSecondsByKey[selectedOptionKey] !== undefined && cycleSecondsInput !== "";
  const hasEditedPieceWeight = pieceWeightByKey[selectedOptionKey] !== undefined && pieceWeightInput !== "";
  const hasChangedCrateWeight = crateWeightKg !== String(DEFAULT_CRATE_WEIGHT_KG);
  const hasShopFloorProductionEntry = Boolean(operatorNumber.trim() || startTime || endTime || producedGrossKg || cratesUsed || hasEditedCycleSeconds || hasEditedPieceWeight || hasChangedCrateWeight);
  const hasShopFloorProductionOutput = grossKg > 0 && pieceWeightGram > 0 && producedPcs > 0;
  const selectedDowntimeReason = downtimeReasonByCode.get(downtimeCode) ?? downtimeCode;
  const selectedBulkDowntimeReason = downtimeReasonByCode.get(bulkDowntimeCode) ?? bulkDowntimeCode;
  const selectedRejectionType = codedMasterLabel(rejectionTypeOptions, rejectionTypeCode);
  const selectedRejectionReason = codedMasterLabel(rejectionReasonOptions, rejectionReasonCode);
  const selectedRejectionRemark = codedMasterLabel(rejectionRemarkOptions, rejectionRemarkCode);
  const rejectQty = numeric(rejectedPieces);
  const isShopFloorProductionEntry = role === "shopFloor" && shopFloorEntryKind === "production";
  const isShopFloorBulkDowntimeEntry = role === "shopFloor" && shopFloorEntryKind === "bulkDowntime";
  const isQualityDowntimeEntry = role === "quality" && qualityEntryKind === "downtime";
  const isQualityRejectionEntry = role === "quality" && qualityEntryKind === "rejection";
  const isDowntimeEntry = role === "machinist" || isQualityDowntimeEntry;
  const isRejectionEntry = isQualityRejectionEntry;
  const hasDowntimeDetails = Boolean(downtimeCode && startTime && endTime && downtimeDurationMinutes > 0);
  const hasQualityRejectionDetails = role === "quality" && Boolean(rejectionTypeCode && rejectionReasonCode && rejectionRemarkCode && rejectQty > 0);

  const canSave = Boolean(selectedRow)
    && (role === "shopFloor" ? isShopFloorProductionEntry && hasShopFloorProductionEntry : role === "quality" ? (isQualityDowntimeEntry ? hasDowntimeDetails : isQualityRejectionEntry ? hasQualityRejectionDetails : false) : hasDowntimeDetails);
  const canSaveBulkDowntime = isShopFloorBulkDowntimeEntry && bulkRows.length > 0 && Boolean(bulkDowntimeCode && bulkDowntimeStart && bulkDowntimeEnd && bulkDowntimeMinutes > 0);
  const showSaveButton = role === "shopFloor" ? isShopFloorProductionEntry : role === "quality" ? Boolean(qualityEntryKind) : true;

useEffect(() => {
    if (!selectedCardKind || selectedCardKind === "bulk_downtime" || !selectedOptionKey) return;
    const hydrationKey = existingProductionCard
      ? `${productionCardPatchKey(existingProductionCard)}|${optionalText(existingProductionCard.savedAt)}`
      : `${role}|${selectedCardKind}|${prodDate}|${shift}|${selectedOptionKey}|empty`;
    if (hydratedProductionCardKeyRef.current === hydrationKey) return;
    hydratedProductionCardKeyRef.current = hydrationKey;
    const savedOperator = optionalText(existingProductionCard?.operatorId) ?? "";
    const savedStartTime = optionalText(existingProductionCard?.startTime) ?? "";
    const savedEndTime = optionalText(existingProductionCard?.endTime) ?? "";
    const savedGrossWeight = optionalNumber(existingProductionCard?.grossWeight) ?? 0;
    const savedCratesUsed = optionalNumber(existingProductionCard?.cratesUsed) ?? 0;
    const savedCrateWeight = optionalNumber(existingProductionCard?.crateWeightKg) ?? DEFAULT_CRATE_WEIGHT_KG;
    const savedCycleTime = optionalNumber(existingProductionCard?.cycleTime) ?? 0;
    const savedPieceWeight = optionalNumber(existingProductionCard?.pieceWeight) ?? 0;
    const savedDowntimeCode = optionalText(existingProductionCard?.downtimeCode) ?? "";
    const savedRejectionTypeCode = optionalText(existingProductionCard?.rejectionTypeCode) ?? "";
    const savedRejectionReasonCode = optionalText(existingProductionCard?.rejectionReasonCode) ?? "";
    const savedRejectionRemarkCode = optionalText(existingProductionCard?.rejectionRemarkCode) ?? "";
    const savedRejectQty = optionalNumber(existingProductionCard?.rejectQty) ?? 0;
    const savedRemarks = optionalText(existingProductionCard?.remarks) ?? "";
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setOperatorNumber(savedOperator === "Unassigned" ? "" : savedOperator);
      setStartTime(savedStartTime);
      setEndTime(savedEndTime);
      setProducedGrossKg(savedGrossWeight > 0 ? String(savedGrossWeight) : "");
      setCratesUsed(savedCratesUsed > 0 ? String(savedCratesUsed) : "");
      setCrateWeightKg(String(savedCrateWeight));
      setCycleSecondsByKey((current) => savedCycleTime > 0
        ? { ...current, [selectedOptionKey]: String(savedCycleTime) }
        : omitRecordKey(current, selectedOptionKey));
      setPieceWeightByKey((current) => savedPieceWeight > 0
        ? { ...current, [selectedOptionKey]: String(savedPieceWeight) }
        : omitRecordKey(current, selectedOptionKey));
      setDowntimeCode(savedDowntimeCode);
      setRejectionTypeCode(savedRejectionTypeCode);
      setRejectionReasonCode(savedRejectionReasonCode);
      setRejectionRemarkCode(savedRejectionRemarkCode);
      setRejectedPieces(savedRejectQty > 0 ? String(savedRejectQty) : "");
      setRemarks(savedRemarks === "Bulk downtime" ? "" : savedRemarks);
    });
    return () => {
      cancelled = true;
    };
  }, [existingProductionCard, prodDate, role, selectedCardKind, selectedOptionKey, shift]);


  async function submitProductionCard() {
    if (!selectedRow || !canSave || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveProductionCard(selectedRow, {
        cardRole: role,
        writeProductionOutput: role === "shopFloor" && hasShopFloorProductionOutput,
        prodDate,
        shift,
        operatorId: role === "shopFloor" ? operatorNumber : "",
        operatorName: "",
        qcName: "",
        cycleTime: role === "shopFloor" ? cycleSeconds : 0,
        loadingUnloading: 0,
        startTime,
        endTime,
        runtimeMinutes: role === "shopFloor" ? shopFloorRuntimeMinutes : isDowntimeEntry && hasDowntimeDetails ? downtimeDurationMinutes : 0,
        breakMinutes: 0,
        downtimeMinutes: isDowntimeEntry && hasDowntimeDetails ? downtimeDurationMinutes : 0,
        downtimeReason: isDowntimeEntry && hasDowntimeDetails ? selectedDowntimeReason : "",
        downtimeCode: isDowntimeEntry && hasDowntimeDetails ? downtimeCode : "",
        outputQty: role === "shopFloor" ? producedPcs : 0,
        actualQty: role === "shopFloor" ? producedPcs : 0,
        targetQty: role === "shopFloor" && cycleSeconds > 0 && shopFloorRuntimeMinutes > 0 ? Math.floor((shopFloorRuntimeMinutes * 60) / cycleSeconds) : 0,
        rejectQty: isRejectionEntry ? rejectQty : 0,
        rejectionType: isRejectionEntry ? selectedRejectionType : "",
        rejectionTypeCode: isRejectionEntry ? rejectionTypeCode : "",
        rejectionReason: isRejectionEntry ? selectedRejectionReason : "",
        rejectionReasonCode: isRejectionEntry ? rejectionReasonCode : "",
        rejectionRemark: isRejectionEntry ? selectedRejectionRemark : "",
        rejectionRemarkCode: isRejectionEntry ? rejectionRemarkCode : "",
        grossWeight: role === "shopFloor" ? grossKg : 0,
        netWeight: role === "shopFloor" ? netProducedKg : 0,
        pieceWeight: role === "shopFloor" ? pieceWeightGram : 0,
        cratesUsed: role === "shopFloor" ? crateCount : 0,
        crateWeightKg: role === "shopFloor" ? crateTareKg : 0,
        producedPcs: role === "shopFloor" ? producedPcs : 0,
        settingQty: 0,
        toolingCheck: {},
        shopFloorChecks: {},
        qcApproval: "",
        remarks,
        efficiency: 0,
      });
      setRemarks("");
      if (role === "quality" || role === "machinist") {
        setDowntimeCode("");
        setStartTime("");
        setEndTime("");
        setRejectionTypeCode("");
        setRejectionReasonCode("");
        setRejectionRemarkCode("");
        setRejectedPieces("");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function submitBulkDowntime() {
    if (!canSaveBulkDowntime || isBulkSaving) return;
    setIsBulkSaving(true);
    try {
      for (const row of bulkRows) {
        await onSaveProductionCard(row, {
          cardRole: "shopFloor",
          bulkDowntime: true,
          writeProductionOutput: false,
          prodDate: today,
          shift: "Bulk",
          operatorId: "",
          operatorName: "",
          qcName: "",
          startTime: bulkDowntimeStart,
          endTime: bulkDowntimeEnd,
          runtimeMinutes: bulkDowntimeMinutes,
          breakMinutes: 0,
          downtimeMinutes: bulkDowntimeMinutes,
          downtimeReason: selectedBulkDowntimeReason,
          downtimeCode: bulkDowntimeCode,
          outputQty: 0,
          actualQty: 0,
          targetQty: 0,
          rejectQty: 0,
          rejectionType: "",
          rejectionReason: "",
          rejectionRemark: "",
          grossWeight: 0,
          netWeight: 0,
          pieceWeight: productionPieceWeightGrams(row),
          cratesUsed: 0,
          producedPcs: 0,
          settingQty: 0,
          toolingCheck: {},
          shopFloorChecks: {},
          qcApproval: "",
          remarks: "Bulk downtime",
          efficiency: 0,
        });
      }
      setBulkDowntimeCode("");
      setBulkDowntimeStart("");
      setBulkDowntimeEnd("");
    } finally {
      setIsBulkSaving(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{roleLabel}</div>
          <div className="text-xs text-muted-foreground">Select the machine first; item and setup details are filled from the current plan.</div>
        </div>
        {role === "shopFloor" ? <StatusBadge value={isShopFloorProductionEntry && producedPcs > 0 ? `${formatNumber(producedPcs)} pcs` : isShopFloorBulkDowntimeEntry ? `${formatNumber(bulkRows.length)} machines` : "Select entry"} /> : null}
        {role === "quality" ? <StatusBadge value={isQualityRejectionEntry && rejectQty > 0 ? `${formatNumber(rejectQty)} rejected pcs` : isQualityDowntimeEntry && downtimeDurationMinutes > 0 ? `${formatNumber(downtimeDurationMinutes)} min downtime` : qualityEntryKind ? "Quality pending" : "Select entry"} /> : null}
        {role === "machinist" ? <StatusBadge value={downtimeDurationMinutes > 0 ? `${formatNumber(downtimeDurationMinutes)} min downtime` : "Downtime pending"} /> : null}
      </div>
      {role !== "shopFloor" ? (
        <div className="grid gap-2 md:grid-cols-3">
          <Field label={role === "quality" || role === "machinist" ? "Machine no." : "Machine / item"}>
            <select className="h-8 rounded-md border bg-background px-2 text-sm" value={selectedOptionKey} onChange={(event) => setSelectedKey(event.target.value)}>
              <option value="">Select machine</option>
              {rowOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </Field>
<Field label="Date"><Input className="h-8" type="date" value={prodDate} onChange={(event) => setProdDate(event.target.value)} /></Field>
          <Field label="Shift">
            <select className="h-8 rounded-md border bg-background px-2 text-sm" value={shift} onChange={(event) => setShift(event.target.value)}>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
              <option value="General">General</option>
            </select>
          </Field>        </div>
      ) : null}
      {role === "shopFloor" ? (
        <>
          <div className="grid gap-2 rounded-md border bg-background p-2.5 sm:grid-cols-2">
            <Button
              type="button"
              size="sm"
              variant={shopFloorEntryKind === "production" ? "default" : "outline"}
              onClick={() => setShopFloorEntryKind("production")}
            >
              Production entry
            </Button>
            <Button
              type="button"
              size="sm"
              variant={shopFloorEntryKind === "bulkDowntime" ? "default" : "outline"}
              onClick={() => setShopFloorEntryKind("bulkDowntime")}
            >
              Bulk downtime entry
            </Button>
          </div>
          {isShopFloorProductionEntry ? (
            <>
              <div className="grid gap-2 md:grid-cols-3">
                <Field label="Machine no.">
                  <select className="h-8 rounded-md border bg-background px-2 text-sm" value={selectedOptionKey} onChange={(event) => setSelectedKey(event.target.value)}>
                    <option value="">Select machine</option>
                    {rowOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </Field>
<Field label="Date"><Input className="h-8" type="date" value={prodDate} onChange={(event) => setProdDate(event.target.value)} /></Field>
                <Field label="Shift">
                  <select className="h-8 rounded-md border bg-background px-2 text-sm" value={shift} onChange={(event) => setShift(event.target.value)}>
                    <option value="Day">Day</option>
                    <option value="Night">Night</option>
                    <option value="General">General</option>
                  </select>
                </Field>
                {selectedRow ? (
                  <div className="self-end md:col-span-3">
                    <ShopFloorItemSummary row={selectedRow} tone="current" compact />
                  </div>
                ) : null}            <Field label="Cycle time sec"><Input className="h-8" type="number" step="0.01" value={cycleSecondsInput} onChange={(event) => setCycleSecondsByKey((current) => ({ ...current, [selectedOptionKey]: event.target.value }))} /></Field>
            <Field label="1 piece weight gm"><Input className="h-8" type="number" step="0.01" value={pieceWeightInput} onChange={(event) => setPieceWeightByKey((current) => ({ ...current, [selectedOptionKey]: event.target.value }))} /></Field>
            <Field label="Operator number"><Input className="h-8" value={operatorNumber} onChange={(event) => setOperatorNumber(event.target.value)} /></Field>
            <Field label="Machine start"><Input className="h-8" type="text" inputMode="numeric" placeholder="HH:mm" pattern="[0-2][0-9]:[0-5][0-9]" title="Use 24-hour time as HH:mm" value={startTime} onChange={(event) => setStartTime(time24Input(event.target.value))} /></Field>
            <Field label="Machine end"><Input className="h-8" type="text" inputMode="numeric" placeholder="HH:mm" pattern="[0-2][0-9]:[0-5][0-9]" title="Use 24-hour time as HH:mm" value={endTime} onChange={(event) => setEndTime(time24Input(event.target.value))} /></Field>
            <Field label="Produced kg gross"><Input className="h-8" type="number" step="0.001" value={producedGrossKg} onChange={(event) => setProducedGrossKg(event.target.value)} /></Field>
            <Field label="Crates used"><Input className="h-8" type="number" step="1" value={cratesUsed} onChange={(event) => setCratesUsed(event.target.value)} /></Field>
            <Field label="Crate weight kg">
              <select className="h-8 rounded-md border bg-background px-2 text-sm" value={crateWeightKg} onChange={(event) => setCrateWeightKg(event.target.value)}>
                {CRATE_WEIGHT_OPTIONS_KG.map((weight) => <option key={weight} value={String(weight)}>{formatNumber(weight)} kg</option>)}
              </select>
            </Field>
            <Field label="Net produced kg"><Input className="h-8" value={formatNumber(netProducedKg)} readOnly /></Field>
            <Field label="Produced pcs"><Input className="h-8" value={formatNumber(producedPcs)} readOnly /></Field>
              </div>
            </>
          ) : null}
          {isShopFloorBulkDowntimeEntry ? (
            <div className="grid gap-3 rounded-md border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Bulk downtime for running machines</div>
              <StatusBadge value={`${formatNumber(bulkRows.length)} machines`} />
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <Field label="Date"><Input className="h-8" type="date" value={prodDate} onChange={(event) => setProdDate(event.target.value)} /></Field>
              <Field label="Downtime code">
                <select className="h-8 rounded-md border bg-background px-2 text-sm" value={bulkDowntimeCode} disabled={!downtimeReasonOptions.length} onChange={(event) => setBulkDowntimeCode(event.target.value)}>
                  <option value="">{downtimeReasonOptions.length ? "Select downtime code" : "Add downtime reason master"}</option>
                  {downtimeReasonOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Downtime start"><Input className="h-8" type="text" inputMode="numeric" placeholder="HH:mm" pattern="[0-2][0-9]:[0-5][0-9]" title="Use 24-hour time as HH:mm" value={bulkDowntimeStart} onChange={(event) => setBulkDowntimeStart(time24Input(event.target.value))} /></Field>
              <Field label="Downtime end"><Input className="h-8" type="text" inputMode="numeric" placeholder="HH:mm" pattern="[0-2][0-9]:[0-5][0-9]" title="Use 24-hour time as HH:mm" value={bulkDowntimeEnd} onChange={(event) => setBulkDowntimeEnd(time24Input(event.target.value))} /></Field>
              <Field label="Downtime minutes"><Input className="h-8" value={formatNumber(bulkDowntimeMinutes)} readOnly /></Field>
            </div>
            <Button type="button" size="sm" variant="outline" className="w-fit" disabled={!canSaveBulkDowntime || isBulkSaving} onClick={() => void submitBulkDowntime()}>
              <CheckCircle2 className="size-4" />
              Save downtime for running machines
            </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {role === "quality" || role === "machinist" ? (
        <>
          {selectedRow ? (
            <div className="rounded-md border bg-background px-2.5 py-2">
              <ShopFloorItemSummary row={selectedRow} tone="current" compact />
            </div>
          ) : null}
          {role === "quality" ? (
            <div className="grid gap-2 rounded-md border bg-background p-2.5 sm:grid-cols-2">
              <Button
                type="button"
                size="sm"
                variant={qualityEntryKind === "downtime" ? "default" : "outline"}
                onClick={() => setQualityEntryKind("downtime")}
              >
                Downtime entry
              </Button>
              <Button
                type="button"
                size="sm"
                variant={qualityEntryKind === "rejection" ? "default" : "outline"}
                onClick={() => setQualityEntryKind("rejection")}
              >
                Rejection entry
              </Button>
            </div>
          ) : null}
          {isDowntimeEntry ? (
            <div className="grid gap-2 md:grid-cols-4">
              <Field label="Date"><Input className="h-8" type="date" value={prodDate} onChange={(event) => setProdDate(event.target.value)} /></Field>
              <Field label="Downtime code">
                <select className="h-8 rounded-md border bg-background px-2 text-sm" value={downtimeCode} disabled={!downtimeReasonOptions.length} onChange={(event) => setDowntimeCode(event.target.value)}>
                  <option value="">{downtimeReasonOptions.length ? "Select downtime code" : "Add downtime reason master"}</option>
                  {downtimeReasonOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Downtime start"><Input className="h-8" type="text" inputMode="numeric" placeholder="HH:mm" pattern="[0-2][0-9]:[0-5][0-9]" title="Use 24-hour time as HH:mm" value={startTime} onChange={(event) => setStartTime(time24Input(event.target.value))} /></Field>
              <Field label="Downtime end"><Input className="h-8" type="text" inputMode="numeric" placeholder="HH:mm" pattern="[0-2][0-9]:[0-5][0-9]" title="Use 24-hour time as HH:mm" value={endTime} onChange={(event) => setEndTime(time24Input(event.target.value))} /></Field>
              <Field label="Downtime minutes"><Input className="h-8" value={formatNumber(downtimeDurationMinutes)} readOnly /></Field>
            </div>
          ) : null}
          {isRejectionEntry ? (
            <div className="grid gap-2 rounded-md border bg-background p-2.5 md:grid-cols-4">
              <Field label="Rejection type">
                <select className="h-8 rounded-md border bg-background px-2 text-sm" value={rejectionTypeCode} onChange={(event) => setRejectionTypeCode(event.target.value)}>
                  <option value="">Select type</option>
                  {rejectionTypeOptions.map((option) => <option key={option.code} value={option.code}>{option.code} - {option.label}</option>)}
                </select>
              </Field>
              <Field label="Rejection reason">
                <select className="h-8 rounded-md border bg-background px-2 text-sm" value={rejectionReasonCode} onChange={(event) => setRejectionReasonCode(event.target.value)}>
                  <option value="">Select reason</option>
                  {rejectionReasonOptions.map((option) => <option key={option.code} value={option.code}>{option.code} - {option.label}</option>)}
                </select>
              </Field>
              <Field label="Rejection remark">
                <select className="h-8 rounded-md border bg-background px-2 text-sm" value={rejectionRemarkCode} onChange={(event) => setRejectionRemarkCode(event.target.value)}>
                  <option value="">Select remark</option>
                  {rejectionRemarkOptions.map((option) => <option key={option.code} value={option.code}>{option.code} - {option.label}</option>)}
                </select>
              </Field>
              <Field label="Rejected pcs"><Input className="h-8" type="number" step="1" min="0" value={rejectedPieces} onChange={(event) => setRejectedPieces(event.target.value)} /></Field>
            </div>
          ) : null}
        </>
      ) : null}
      {showSaveButton ? (
        <Button type="button" size="sm" className="w-fit" disabled={!canSave || isSaving} onClick={() => void submitProductionCard()}>
          <CheckCircle2 className="size-4" />
          {role === "shopFloor" ? "Save production" : isQualityRejectionEntry ? "Save rejection" : "Save downtime"}
        </Button>
      ) : null}
    </div>
  );
}

function SetupChecklistForm({
  row,
  phase,
  items,
  session,
  values,
  onValueChange,
  onAddMaster,
}: {
  row: DashboardPayload;
  phase: string;
  items: DashboardPayload[];
  session?: DashboardPayload;
  values: Record<string, string>;
  onValueChange: (item: DashboardPayload, value: string) => void;
  onAddMaster?: (entryType: string, defaults?: Record<string, unknown>) => void;
}) {
  const defaults = setupChecklistMasterDefaults();
  if (phase === "start" && !items.length) {
    return (
      <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <div className="font-medium text-amber-900 dark:text-amber-100">Setup checklist master missing</div>
        <div className="text-amber-800 dark:text-amber-200">Add active checklist master rows before pre setting can start.</div>
        {onAddMaster ? (
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => onAddMaster("setup_checklist_master", defaults)}>
            Add checklist master
          </Button>
        ) : null}
      </div>
    );
  }
  if (phase === "end" && !session) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        Pre setting checklist session is missing. Start pre setting for this setup before saving setting done.
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Setup checklist {phase === "start" ? "start" : "completion"}</div>
          <div className="text-xs text-muted-foreground">
            {itemCode(row)} / JC {jobCardNumber(row)} / Option {displayValue(row.optionNumber)} / Setup {displayValue(row.setupNo)} / Machine {displayValue(row.machine)} / {formatDate(new Date().toISOString())}
          </div>
        </div>
        <StatusBadge value={`Version ${displayValue(session?.masterVersion || items[0]?.version)}`} />
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-12">Seq</TableHead>
              <TableHead className="min-w-72">Check point</TableHead>
              <TableHead className="min-w-36">Entry</TableHead>
              <TableHead className="min-w-28">Required</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const itemKey = setupChecklistItemKey(item, index);
              const inputType = str(item.inputType || "checkbox").toLowerCase();
              const existingValue = setupChecklistExistingValue(item, phase);
              const value = values[itemKey] ?? existingValue;
              return (
                <TableRow key={itemKey}>
                  <TableCell>{displayValue(item.sequence || index + 1)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{displayValue(item.checkPoint)}</div>
                    <div className="text-xs text-muted-foreground">{displayValue(item.section)}</div>
                  </TableCell>
                  <TableCell>
                    {inputType === "checkbox" ? (
                      <select className="h-8 rounded-md border bg-background px-2 text-sm" value={value} onChange={(event) => onValueChange(item, event.target.value)}>
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : (
                      <Input className="h-8 min-w-28" type={inputType === "number" ? "number" : "text"} value={value} onChange={(event) => onValueChange(item, event.target.value)} />
                    )}
                  </TableCell>
                  <TableCell>{setupChecklistItemRequired(item) ? "Yes" : "No"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
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
  const [bulkEntryType, setBulkEntryType] = useState(preferredEntryType || dataEntrySpecs[0]?.entryType || "route");
  const selectedSpec = dataEntrySpecs.find((spec) => spec.entryType === bulkEntryType) ?? dataEntrySpecs[0];

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
            <Field label="Select entry form">
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
      {selectedSpec ? (
        <DataEntryForm
          key={selectedSpec.entryType}
          spec={selectedSpec}
          submitAction={submitAction}
          defaults={selectedSpec.entryType === preferredEntryType ? preferredDefaults : {}}
        />
      ) : null}
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
}: {
  payload: DashboardPayload;
  productionControl: DashboardPayload;
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>;
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
    () => rows.filter((row) => {
      const setupRows = plannedRowsForJobCard(row, plannedByJobCard, plannedByPart);
      const hasProduction = jobCardHasProduction(row, setupRows);
      return rowMatchesFieldQuery(row, query, searchField, setupRows) &&
        typedFilterMatches(jobCardNumber(row), jobCardFilter) &&
        typedFilterMatches(itemCode(row), itemCodeFilter) &&
        jobCardMatchesMachine(row, machineFilter, plannedByJobCard, plannedByPart) &&
        (trackingState === "all" || jobCardTrackingState(row, setupRows) === trackingState) &&
        (rmStatusFilter === "all" || (rmStatusFilter === "received" ? displayValue(row.rmStatus) === "Received" : displayValue(row.rmStatus) !== "Received")) &&
        (productionStatusFilter === "all" || (productionStatusFilter === "in-production" ? hasProduction : !hasProduction));
    }),
    [itemCodeFilter, jobCardFilter, machineFilter, plannedByJobCard, plannedByPart, productionStatusFilter, query, rmStatusFilter, rows, searchField, trackingState],
  );
  const needsAction = actionNeededCount;
  const pendingRm = rows.filter((row) => displayValue(row.rmStatus) !== "Received").length;
  const ready = rows.filter((row) => jobCardTrackingState(row, plannedRowsForJobCard(row, plannedByJobCard, plannedByPart)) === "Ready").length;
  const inProduction = rows.filter((row) => jobCardTrackingState(row, plannedRowsForJobCard(row, plannedByJobCard, plannedByPart)) === "In production").length;

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
                    setupRows={plannedRowsForJobCard(row, plannedByJobCard, plannedByPart)}
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
  const trackingState = jobCardTrackingState(row, setupRows);
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
                  <div className="text-sm font-medium">Setup {displayValue(setup.setupNo)} Ãƒâ€šÃ‚Â· {displayValue(setup.machine)}</div>
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
  if (normalized.includes("waiting") || normalized.includes("pending") || normalized.includes("shifted")) return "border-amber-300 bg-amber-50 text-amber-800";
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
    queueBeforeSetups?: Array<{ targetSetupNo: string; jcNo: string; setupNo: string; machine: string }>;
    remark?: string;
  }) => Promise<unknown>;
  saveMachineConstraint: (args: {
    machineNo: string;
    unavailableFrom: string;
    unavailableTo: string;
    reason: string;
    remark?: string;
    rescheduleAction?: string;
    planningMode?: string;
    interruptedSetups?: Array<{ jcNo: string; setupNo: string; machine: string; finishedQty?: number }>;
    queuePlacements?: Array<{
      targetJcNo: string;
      targetPartCode?: string;
      targetSetupNo: string;
      targetSourceMachine?: string;
      targetMachine: string;
      queueBeforeSetups?: Array<{ jcNo: string; setupNo: string; machine: string }>;
    }>;
  }) => Promise<unknown>;
  savePlanOverride: (args: {
    target: string;
    toMachine: string;
    setupNo?: string;
    fromMachine?: string;
    interruptedSetups?: Array<{ jcNo: string; setupNo: string; machine: string; finishedQty?: number }>;
    queuePlacements?: Array<{
      targetJcNo: string;
      targetPartCode?: string;
      targetSetupNo: string;
      targetSourceMachine?: string;
      targetMachine: string;
      queueBeforeSetups?: Array<{ jcNo: string; setupNo: string; machine: string }>;
    }>;
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
      queueBeforeSetups: priorityQueueBeforeSetups(body.queueBeforeSetups),
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
      planningMode: optionalText(body.planningMode),
      interruptedSetups: priorityInterruptedSetups(body.interruptedSetups),
      queuePlacements: machineConstraintQueuePlacementsInput(body.queuePlacements),
    });
    return "Machine issue saved.";
  }

  if (path === "plan-override") {
    await mutations.savePlanOverride({
      target: text(body.target),
      toMachine: text(body.toMachine),
      setupNo: optionalText(body.setupNo),
      fromMachine: optionalText(body.fromMachine),
      interruptedSetups: priorityInterruptedSetups(body.interruptedSetups),
      queuePlacements: machineConstraintQueuePlacementsInput(body.queuePlacements),
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


function machineConstraintQueuePlacementsInput(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((row) => asRecord(row))
    .map((row) => {
      const queueBeforeSetups = Array.isArray(row.queueBeforeSetups)
        ? row.queueBeforeSetups.map((queueRow) => asRecord(queueRow)).map((queueRow) => ({
          jcNo: text(queueRow.jcNo),
          setupNo: text(queueRow.setupNo),
          machine: text(queueRow.machine),
        })).filter((queueRow) => queueRow.jcNo && queueRow.setupNo && queueRow.machine)
        : [];
      return {
        targetJcNo: text(row.targetJcNo),
        targetPartCode: optionalText(row.targetPartCode),
        targetSetupNo: text(row.targetSetupNo),
        targetSourceMachine: optionalText(row.targetSourceMachine),
        targetMachine: text(row.targetMachine),
        queueBeforeSetups,
      };
    })
    .filter((row) => row.targetJcNo && row.targetSetupNo && row.targetMachine);
  return rows.length ? rows : undefined;
}
function priorityQueueBeforeSetups(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((row) => asRecord(row))
    .map((row) => ({
      targetSetupNo: text(row.targetSetupNo),
      jcNo: text(row.jcNo),
      setupNo: text(row.setupNo),
      machine: text(row.machine),
    }))
    .filter((row) => row.targetSetupNo && row.jcNo && row.setupNo && row.machine);
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

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function refreshLockFromStatus(status: { requestedAtMs?: unknown; completedAtMs?: unknown } | undefined): PlanningRefreshLock {
  return {
    baselineRequestedAtMs: numberOrNull(status?.requestedAtMs),
    baselineCompletedAtMs: numberOrNull(status?.completedAtMs),
  };
}

function refreshLockHasSettled(lock: PlanningRefreshLock, status: { status?: unknown; isRefreshing?: unknown; requestedAtMs?: unknown; completedAtMs?: unknown } | undefined) {
  if (!status || status.isRefreshing) return false;
  const currentStatus = str(status.status);
  if (currentStatus !== "idle" && currentStatus !== "failed") return false;
  const requestedAtMs = numberOrNull(status.requestedAtMs);
  const completedAtMs = numberOrNull(status.completedAtMs);
  const sawNewRequest = requestedAtMs !== lock.baselineRequestedAtMs;
  const sawNewCompletion = completedAtMs !== lock.baselineCompletedAtMs;
  return sawNewRequest && (sawNewCompletion || currentStatus === "failed");
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
    .join(" Ãƒâ€šÃ‚Â· ");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });
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

type MachineConstraintQueuePlacementPayload = {
  targetJcNo: string;
  targetPartCode: string;
  targetSetupNo: string;
  targetSourceMachine: string;
  targetMachine: string;
  queueBeforeSetups: Array<{ jcNo: string; setupNo: string; machine: string }>;
};

const machineConstraintPlacementSeparator = "::after::";

function machineConstraintMovableRows(rows: DashboardPayload[], rescheduleAction: string) {
  if (machineKey(rescheduleAction) === "delay") return [];
  return rows.filter((row) => machineIssueRowNeedsProducedQty(row) || !machineIssueRowIsLocked(row));
}

function machineConstraintQueuePlacements(
  groups: MachineConstraintQueueReviewGroup[],
  movableRows: DashboardPayload[],
  queueAfterByRow: Record<string, string>,
): MachineConstraintQueuePlacementPayload[] {
  const destinationGroups = groups.filter((group) => group.kind === "destination");
  const defaultDestinationMachine = destinationGroups[0]?.machine ?? "";
  if (!defaultDestinationMachine) return [];
  const placements: MachineConstraintQueuePlacementPayload[] = [];
  const seen = new Set<string>();
  for (const row of movableRows) {
    const rowKey = machineIssueRowKey(row);
    const placement = machineConstraintPlacementParts(queueAfterByRow[rowKey], defaultDestinationMachine);
    const group = destinationGroups.find((candidate) => machineKey(candidate.machine) === placement.machineKey);
    if (!group) continue;
    const placementIndex = machineConstraintQueuePlacementIndex(group.rows, placement.afterKey);
    const queueBeforeSetups = group.rows.slice(0, placementIndex).map((queueRow) => ({
      jcNo: jobCardNumber(queueRow),
      setupNo: displayValue(queueRow.setupNo),
      machine: machineValue(queueRow, "machine"),
    })).filter((queueRow) => queueRow.jcNo && queueRow.setupNo && queueRow.machine);
    const payload = {
      targetJcNo: jobCardNumber(row),
      targetPartCode: itemCode(row),
      targetSetupNo: displayValue(row.setupNo),
      targetSourceMachine: machineValue(row, "machine"),
      targetMachine: group.machine,
      queueBeforeSetups,
    };
    const key = [payload.targetJcNo, payload.targetSetupNo, payload.targetSourceMachine, payload.targetMachine].map(machineKey).join("|");
    if (!payload.targetJcNo || !payload.targetSetupNo || !payload.targetMachine || seen.has(key)) continue;
    seen.add(key);
    placements.push(payload);
  }
  return placements;
}

function partMachineSwitchPreSaveConflicts(
  rows: DashboardPayload[],
  proposed: {
    target: string;
    selectedItem: string;
    setupNo: string;
    toMachine: string;
    queuePlacements: MachineConstraintQueuePlacementPayload[];
    resolvedIds: Set<string>;
  },
) {
  const targetKey = machineKey(proposed.target);
  const itemKey = machineKey(proposed.selectedItem);
  const setupKey = machineKey(proposed.setupNo);
  const proposedSignature = partMachineSwitchDecisionSignature(proposed.toMachine, proposed.queuePlacements);
  if (!targetKey || !setupKey || !proposedSignature) return [];
  return rows
    .filter((row) => {
      const targetId = displayValue(row._id || row.targetId);
      if (proposed.resolvedIds.has(targetId)) return false;
      const rowTargetKey = machineKey(displayValue(row.target));
      if (rowTargetKey !== targetKey && (!itemKey || rowTargetKey !== itemKey)) return false;
      const rowSetupKey = machineKey(displayValue(row.setupNo));
      if (rowSetupKey && rowSetupKey !== setupKey) return false;
      const existingSignature = partMachineSwitchDecisionSignature(displayValue(row.toMachine), asArray(row.queuePlacements) as MachineConstraintQueuePlacementPayload[]);
      return Boolean(existingSignature && existingSignature !== proposedSignature);
    })
    .map((row) => ({
      ...row,
      targetTable: "planOverrides",
      targetId: displayValue(row._id || row.targetId),
      targetKey: [displayValue(row.target), displayValue(row.setupNo), displayValue(row.fromMachine), displayValue(row.toMachine)].filter((value) => value !== "-").join(" / "),
      targetLabel: `Existing switch to ${displayValue(row.toMachine)}`,
      createdAt: displayValue(row.createdAt),
    }));
}

function partMachineSwitchDecisionSignature(toMachine: string, queuePlacements: MachineConstraintQueuePlacementPayload[]) {
  const targetMachine = machineKey(toMachine);
  if (!targetMachine) return "";
  const placementSignature = queuePlacements
    .map((placement) => ({
      targetMachine: machineKey(placement.targetMachine || toMachine),
      before: asArray(placement.queueBeforeSetups)
        .map((row) => [displayValue(row.jcNo), displayValue(row.setupNo), displayValue(row.machine)].map(machineKey).join("/"))
        .sort()
        .join(","),
    }))
    .sort((left, right) => `${left.targetMachine}|${left.before}`.localeCompare(`${right.targetMachine}|${right.before}`))
    .map((placement) => `${placement.targetMachine}:${placement.before}`)
    .join("|");
  return `${targetMachine}|${placementSignature}`;
}
function plannerPriorityPreSaveConflicts(
  rows: DashboardPayload[],
  proposed: {
    target: string;
    jcNo: string;
    partCode: string;
    priority: string;
    queueBeforeSetups: Array<{ targetSetupNo: string; jcNo: string; setupNo: string; machine: string }>;
    resolvedIds: Set<string>;
  },
) {
  const targetKeys = new Set([proposed.target, proposed.jcNo, proposed.partCode].map(machineKey).filter(Boolean));
  const proposedSignature = plannerPriorityDecisionSignature(proposed.priority, proposed.queueBeforeSetups);
  if (!targetKeys.size || !proposedSignature) return [];
  return rows
    .filter((row) => {
      const targetId = displayValue(row._id || row.targetId);
      if (proposed.resolvedIds.has(targetId)) return false;
      const rowKeys = [row.target, row.jcNo, row.partCode].map((value) => machineKey(displayValue(value))).filter(Boolean);
      if (!rowKeys.some((key) => targetKeys.has(key))) return false;
      const existingSignature = plannerPriorityDecisionSignature(displayValue(row.priority), asArray(row.queueBeforeSetups).map((queueRow) => ({
        targetSetupNo: displayValue(queueRow.targetSetupNo),
        jcNo: displayValue(queueRow.jcNo),
        setupNo: displayValue(queueRow.setupNo),
        machine: displayValue(queueRow.machine),
      })));
      return Boolean(existingSignature && existingSignature !== proposedSignature);
    })
    .map((row) => ({
      ...row,
      targetTable: "plannerPriorities",
      targetId: displayValue(row._id || row.targetId),
      targetKey: [displayValue(row.target), displayValue(row.jcNo), displayValue(row.partCode), displayValue(row.priority)].filter((value) => value !== "-").join(" / "),
      targetLabel: `Existing priority ${displayValue(row.priority)} for ${displayValue(row.target)}`,
      createdAt: displayValue(row.createdAt),
    }));
}

function plannerPriorityDecisionSignature(priority: string, queueBeforeSetups: Array<{ targetSetupNo: string; jcNo: string; setupNo: string; machine: string }>) {
  const priorityKey = machineKey(priority || "Normal");
  const queueSignature = queueBeforeSetups
    .map((row) => [row.targetSetupNo, row.jcNo, row.setupNo, row.machine].map(machineKey).join("/"))
    .sort()
    .join(",");
  return `${priorityKey}|${queueSignature}`;
}

function machineConstraintPreSaveConflicts(
  rows: DashboardPayload[],
  proposed: {
    machineNo: string;
    unavailableFrom: string;
    unavailableTo: string;
    rescheduleAction: string;
    planningMode: string;
    queuePlacements: MachineConstraintQueuePlacementPayload[];
    resolvedIds: Set<string>;
  },
) {
  const machine = machineKey(proposed.machineNo);
  const proposedSignature = machineConstraintDecisionSignature(proposed.rescheduleAction, proposed.planningMode, proposed.queuePlacements);
  if (!machine || !proposed.unavailableFrom || !proposedSignature) return [];
  return rows
    .filter((row) => {
      const targetId = displayValue(row._id || row.targetId);
      if (proposed.resolvedIds.has(targetId)) return false;
      if (machineKey(displayValue(row.machineNo)) !== machine) return false;
      if (!dateRangesOverlap(proposed.unavailableFrom, proposed.unavailableTo || proposed.unavailableFrom, displayValue(row.unavailableFrom), displayValue(row.unavailableTo || row.unavailableFrom))) return false;
      const existingSignature = machineConstraintDecisionSignature(displayValue(row.rescheduleAction), displayValue(row.planningMode), asArray(row.queuePlacements) as MachineConstraintQueuePlacementPayload[]);
      return Boolean(existingSignature && existingSignature !== proposedSignature);
    })
    .map((row) => ({
      ...row,
      targetTable: "machineConstraints",
      targetId: displayValue(row._id || row.targetId),
      targetKey: [displayValue(row.machineNo), displayValue(row.unavailableFrom), displayValue(row.unavailableTo), displayValue(row.rescheduleAction)].filter((value) => value !== "-").join(" / "),
      targetLabel: `Existing ${displayValue(row.rescheduleAction || "machine action")} on ${displayValue(row.machineNo)}`,
      createdAt: displayValue(row.createdAt),
    }));
}

function machineConstraintDecisionSignature(rescheduleAction: string, planningMode: string, queuePlacements: MachineConstraintQueuePlacementPayload[]) {
  const actionKey = machineKey(rescheduleAction || "shift_required");
  const modeKey = machineKey(planningMode || "system_recalculate");
  const placementSignature = queuePlacements
    .map((placement) => [
      placement.targetJcNo,
      placement.targetSetupNo,
      placement.targetSourceMachine,
      placement.targetMachine,
      ...(placement.queueBeforeSetups ?? []).map((row) => `${row.jcNo}/${row.setupNo}/${row.machine}`),
    ].map(machineKey).join("/"))
    .sort()
    .join("|");
  return `${actionKey}|${modeKey}|${placementSignature}`;
}

function dateRangesOverlap(leftFrom: string, leftTo: string, rightFrom: string, rightTo: string) {
  if (!leftFrom || !rightFrom) return false;
  const leftEnd = leftTo || leftFrom;
  const rightEnd = rightTo || rightFrom;
  return leftFrom <= rightEnd && rightFrom <= leftEnd;
}
function machineConstraintPlacementValue(machine: string, afterKey: string) {
  return `${machineKey(machine)}${machineConstraintPlacementSeparator}${afterKey}`;
}

function machineConstraintPlacementParts(value: string | undefined, defaultMachine: string) {
  const [machineValuePart = "", ...afterParts] = (value || "").split(machineConstraintPlacementSeparator);
  return {
    machineKey: machineValuePart || machineKey(defaultMachine),
    afterKey: afterParts.join(machineConstraintPlacementSeparator),
  };
}

function machineConstraintQueuePlacementIndex(rows: DashboardPayload[], afterKey: string) {
  if (!afterKey) return 0;
  const rowIndex = rows.findIndex((row) => machineConstraintQueueRowKey(row) === afterKey);
  return rowIndex < 0 ? 0 : rowIndex + 1;
}

function machineConstraintQueueRowKey(row: DashboardPayload) {
  return [jobCardNumber(row), displayValue(row.setupNo), machineValue(row, "machine")].map(machineKey).join("|");
}

function machineConstraintQueueDropLabel(index: number, rows: DashboardPayload[]) {
  if (index === 0) return "Place moved setup at position 1";
  const row = rows[index - 1];
  return row ? `Place moved setup after ${itemCode(row)} / ${jobCardNumber(row)} / setup ${displayValue(row.setupNo)}` : "Place moved setup at the end of this queue";
}
function machineIssueAffectedRows(
  rows: DashboardPayload[],
  issue: { machineNo: string; unavailableFrom: string; unavailableTo: string },
) {
  const targetMachine = machineKey(issue.machineNo);
  if (!targetMachine) return [];
  const windowStart = dateSortValue(issue.unavailableFrom);
  const rawWindowEnd = dateSortValue(issue.unavailableTo || issue.unavailableFrom);
  const hasWindow = windowStart !== Number.MAX_SAFE_INTEGER;
  const windowEnd = rawWindowEnd === Number.MAX_SAFE_INTEGER ? windowStart : rawWindowEnd;
  const start = Math.min(windowStart, windowEnd);
  const end = Math.max(windowStart, windowEnd);
  return rows
    .filter((row) => machineKey(machineValue(row, "machine")) === targetMachine)
    .filter((row) => !hasWindow || machineIssueRowOverlaps(row, start, end))
    .sort(machinePlanDisplaySort);
}

function machineIssueRowOverlaps(row: DashboardPayload, windowStart: number, windowEnd: number) {
  const rowStart = dateSortValue(row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate);
  if (rowStart === Number.MAX_SAFE_INTEGER) return true;
  const rawRowEnd = dateSortValue(row.plannedProductionEndDate || row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate);
  const rowEnd = rawRowEnd === Number.MAX_SAFE_INTEGER ? rowStart : rawRowEnd;
  return rowStart <= windowEnd && rowEnd >= windowStart;
}

function machineIssueRowIsLocked(row: DashboardPayload) {
  const stage = str(row.shopFloorStage);
  const runningStatus = str(row.runningStatus).toLowerCase();
  return shopFloorItemIsCurrent(row)
    || runningStatus === "setup complete"
    || ["raw_material_at_machine", "presetting", "setting", "quality_approval"].includes(stage);
}
function partMachineSwitchTargetInterruptionRows(groups: MachineConstraintQueueReviewGroup[], selectedRows: DashboardPayload[]) {
  const selectedKeys = new Set(selectedRows.map(machineIssueRowKey));
  const rows: DashboardPayload[] = [];
  const seen = new Set<string>();
  for (const group of groups.filter((candidate) => candidate.kind === "destination")) {
    for (const row of group.rows) {
      const key = machineIssueRowKey(row);
      if (!key || selectedKeys.has(key) || seen.has(key) || !machineIssueRowNeedsProducedQty(row)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function machineIssueRowNeedsProducedQty(row: DashboardPayload) {
  const runningStatus = str(row.runningStatus).toLowerCase();
  const stage = str(row.shopFloorStage);
  return runningStatus === "running"
    || ["operator_started", "worker_start"].includes(stage)
    || Number(row.rawRows) > 0
    || Number(row.rawOutputQty) > 0
    || Number(row.rawActualQty) > 0;
}

function machineIssueRowKey(row: DashboardPayload) {
  return [jobCardNumber(row), displayValue(row.setupNo), machineValue(row, "machine")].map(machineKey).join("|");
}

function partMachineSwitchAffectedRows(
  rows: DashboardPayload[],
  issue: { target: string; setupNo: string; fromMachine: string },
) {
  const setupKey = machineKey(issue.setupNo);
  const fromMachineKey = machineKey(issue.fromMachine);
  if (!machineKey(issue.target) || !setupKey || !fromMachineKey) return [];
  return rows
    .filter((row) => partMachineSwitchTargetMatches(row, issue.target))
    .filter((row) => machineKey(displayValue(row.setupNo)) === setupKey)
    .filter((row) => machineKey(machineValue(row, "machine")) === fromMachineKey)
    .sort(machinePlanDisplaySort);
}

function partMachineSwitchTargetMatches(row: DashboardPayload, target: string) {
  const targetKey = machineKey(target);
  if (!targetKey) return true;
  return machineKey(jobCardNumber(row)) === targetKey || machineKey(itemCode(row)) === targetKey;
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

function jobCardTrackingState(row: DashboardPayload, setupRows: DashboardPayload[] = []) {
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

  if (jobCardHasProduction(row, setupRows)) {
    return "In production";
  }

  if (statuses.some((value) => value.includes("ready") || value.includes("all checks"))) {
    return "Ready";
  }

  return "Pending";
}

function jobCardHasProduction(row: DashboardPayload, setupRows: DashboardPayload[] = []) {
  return shopFloorItemIsCurrent(row) || setupRows.some(shopFloorItemIsCurrent);
}

function rowMatchesFieldQuery(row: DashboardPayload, query: string, field: string, setupRows: DashboardPayload[] = []) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return rowFieldSearchText(row, field, setupRows).includes(normalizedQuery);
}

function rowMatchesMachineQuery(row: DashboardPayload, query: string, field: string, plannedByMachine: Map<string, DashboardPayload[]>) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const machinePlans = plannedByMachine.get(machineKey(machineValue(row, "machine"))) ?? [];
  const machineText = rowFieldSearchText(row, field);
  const planText = machinePlans.map((plan) => rowFieldSearchText(plan, field)).join(" ");
  return `${machineText} ${planText}`.includes(normalizedQuery);
}

function rowFieldSearchText(row: DashboardPayload, field: string, setupRows: DashboardPayload[] = []) {
  const values = field === "jobCard"
    ? [row.jcNo, row.JobCardNo, row.jobCard]
    : field === "part"
      ? [row.partCode, row["PART CODE"], row.itemCode, row.description, row.DESCRIPTION]
      : field === "po"
        ? [row.fgPoNo, row["FG PO NO."]]
        : field === "route"
          ? [row.optionNumber, row.selectedOption, row.option, row.routeStatus, row.cycleStatus, row.toolingStatus, row.setupNo, row.setupName]
          : field === "status"
            ? [jobCardTrackingState(row, setupRows), row.rmStatus, row.dispatchStatus, row.runningStatus, row.routeStatus, row.cycleStatus, row.toolingStatus]
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

function plannedRowsForJobCard(
  row: DashboardPayload,
  plannedByJobCard: Map<string, DashboardPayload[]>,
  plannedByPart: Map<string, DashboardPayload[]>,
) {
  return plannedByJobCard.get(machineKey(jobCardNumber(row))) ?? plannedByPart.get(machineKey(itemCode(row))) ?? [];
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
  return rows.some((row) => {
    if (planningRowIsBreakdownStopped(row) || planningRowIsShiftedAfterBreakdown(row) || planningRowHasUnavailableBreakdown(row)) return false;
    return str(row.runningStatus).toLowerCase() === "running" || Number(row.rawRows) > 0 || Number(row.rawOutputQty) > 0 || Number(row.rawActualQty) > 0;
  });
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

function currentShopFloorRows(productionControl: DashboardPayload) {
  const plannedRows = asArray(productionControl.machinePlanDetailRows);
  const boardRows = machineBoardRows(asArray(productionControl.machinePlanningRows), plannedRows);
  const plannedByMachine = groupPlannedRowsByMachine(plannedRows);
  return boardRows
    .map((machineRow) => {
      const machine = machineValue(machineRow, "machine");
      const plans = plannedByMachine.get(machineKey(machine)) ?? [];
      return currentShopFloorItem(plans);
    })
    .filter((row): row is DashboardPayload => Boolean(row));
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
  if (planningRowIsBreakdownStopped(row) || planningRowIsShiftedAfterBreakdown(row)) return false;
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
  if (rows.some((row) => planningRowIsBreakdownStopped(row) || planningRowHasUnavailableBreakdown(row))) return "Breakdown";
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

function LabeledInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Input value={value} type={type} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    </label>
  );
}

function AlertMessage({ tone, children }: { tone: NonNullable<ActionStatus>["tone"]; children: ReactNode }) {
  return (
    <Badge variant={tone === "destructive" ? "destructive" : "outline"} className="w-fit">
      {children}
    </Badge>
  );
}

function hourSlotOptions() {
  return Array.from({ length: 24 }, (_, hour) => {
    const start = `${String(hour).padStart(2, "0")}:00`;
    const end = `${String((hour + 1) % 24).padStart(2, "0")}:00`;
    return `${start}-${end}`;
  });
}

function currentHourSlot() {
  const hour = new Date().getHours();
  return `${String(hour).padStart(2, "0")}:00-${String((hour + 1) % 24).padStart(2, "0")}:00`;
}

function qualityParameterCode(row: DashboardPayload) {
  return str(row.code || row.parameterCode || row["CODE"]);
}

function qualityParameterName(row: DashboardPayload) {
  return str(row.parameterName || row.description || row["PARAMETER"] || row["DESCRIPTION"] || row.specification || qualityParameterCode(row));
}

function qualityParameterInputType(row: DashboardPayload) {
  const inputType = str(row.inputType).toLowerCase();
  if (inputType === "pass_fail" || inputType === "pass/fail") return "pass_fail";
  if (inputType === "text") return "text";
  return "number";
}

function qualityParameterTolerance(row: DashboardPayload) {
  const plus = str(row.tolerancePlus || row["TOLERANCE +"] || row["TOL +"]);
  const minus = str(row.toleranceMinus || row["TOLERANCE -"] || row["TOL -"]);
  if (!plus && !minus) return "-";
  return `+${plus || "0"} / -${minus || "0"}`;
}

function qualityParameterMatchesSetup(parameter: DashboardPayload, row: DashboardPayload) {
  if (str(parameter.status).toLowerCase() === "inactive") return false;
  const parameterPart = machineKey(parameter.partNo || parameter.partCode || parameter["PART NO"] || parameter["PART CODE"]);
  const parameterOption = machineKey(parameter.optionNumber || parameter["OPTION NUMBER"] || parameter["OPTION NO"]);
  const parameterSetup = machineKey(parameter.setupNo || parameter["SETUP NO."] || parameter["SETUP NO"] || parameter["SET UP"]);
  return parameterPart === machineKey(itemCode(row))
    && parameterOption === machineKey(displayValue(row.optionNumber))
    && parameterSetup === machineKey(displayValue(row.setupNo));
}

function qualityReadingResult(parameter: DashboardPayload, value: unknown) {
  const reading = str(value);
  if (!reading) return "";
  if (qualityParameterInputType(parameter) === "pass_fail") return reading.toUpperCase() === "OK" ? "OK" : "NG";
  if (qualityParameterInputType(parameter) !== "number") return "Recorded";
  const numericReading = Number(reading);
  const specification = Number(str(parameter.specification));
  if (!Number.isFinite(numericReading) || !Number.isFinite(specification)) return "Recorded";
  const plus = Number(str(parameter.tolerancePlus || 0));
  const minus = Number(str(parameter.toleranceMinus || 0));
  const lower = specification - (Number.isFinite(minus) ? minus : 0);
  const upper = specification + (Number.isFinite(plus) ? plus : 0);
  return numericReading >= lower && numericReading <= upper ? "OK" : "NG";
}

function hourlyQualityCheckId(row: DashboardPayload, prodDate: string, shift: string, hourSlot: string) {
  return [
    "hourly-quality",
    prodDate,
    shift,
    hourSlot,
    displayValue(row.machine),
    itemCode(row),
    displayValue(row.optionNumber),
    displayValue(row.setupNo),
  ].map(machineKey).join("|");
}

function hourlyQualityCheckMatchesSelection(check: DashboardPayload, row: DashboardPayload, prodDate: string, shift: string, hourSlot: string) {
  return str(check.checkId) === hourlyQualityCheckId(row, prodDate, shift, hourSlot)
    || (machineKey(check.prodDate || check.date) === machineKey(prodDate)
      && machineKey(check.shift) === machineKey(shift)
      && machineKey(check.hourSlot) === machineKey(hourSlot)
      && machineKey(check.machine || check.machineNo) === machineKey(displayValue(row.machine))
      && machineKey(check.partCode || check.partNo) === machineKey(itemCode(row))
      && machineKey(check.optionNumber) === machineKey(displayValue(row.optionNumber))
      && machineKey(check.setupNo) === machineKey(displayValue(row.setupNo)));
}

function hourlyQualityCheckPayload(
  row: DashboardPayload,
  parameters: DashboardPayload[],
  readings: Record<string, string>,
  remarks: Record<string, string>,
  meta: { prodDate: string; shift: string; hourSlot: string; checkedBy: string },
) {
  const readingRows = parameters.map((parameter) => {
    const code = qualityParameterCode(parameter);
    const actualReading = str(readings[code]);
    const result = qualityReadingResult(parameter, actualReading);
    return {
      code,
      parameterName: qualityParameterName(parameter),
      specification: str(parameter.specification),
      tolerancePlus: str(parameter.tolerancePlus),
      toleranceMinus: str(parameter.toleranceMinus),
      instrumentUsed: str(parameter.instrumentUsed),
      actualReading,
      result,
      remark: str(remarks[code]),
    };
  });
  return {
    checkId: hourlyQualityCheckId(row, meta.prodDate, meta.shift, meta.hourSlot),
    prodDate: meta.prodDate,
    shift: meta.shift,
    hourSlot: meta.hourSlot,
    machine: displayValue(row.machine),
    machineType: displayValue(row.machineType),
    partCode: itemCode(row),
    jobCard: jobCardNumber(row),
    jcNo: jobCardNumber(row),
    optionNumber: displayValue(row.optionNumber),
    setupNo: displayValue(row.setupNo),
    setupName: displayValue(row.setupName),
    checkedBy: meta.checkedBy.trim(),
    okCount: readingRows.filter((reading) => reading.result === "OK").length,
    ngCount: readingRows.filter((reading) => reading.result === "NG").length,
    readings: readingRows,
    savedAt: new Date().toISOString(),
  };
}
function plannedSetupDate(row: DashboardPayload | undefined) {
  return row?.plannedProductionStartDate || row?.setupPlannedDate || row?.plannedDate;
}

function completedSetupDate(row: DashboardPayload | undefined) {
  return row?.setupCompletionDate || row?.completionDate;
}

function machinePlanningTone(status: string): "success" | "planning" | "warning" | "danger" | "neutral" {
  if (status === "Breakdown") return "danger";
  if (status === "Setup complete") return "success";
  if (status === "Planned") return "planning";
  return "neutral";
}

function planningRowIsBreakdownStopped(row: DashboardPayload) {
  return str(row.runningStatus).toLowerCase() === "breakdown stopped";
}

function planningRowIsShiftedAfterBreakdown(row: DashboardPayload) {
  const status = str(row.runningStatus).toLowerCase();
  return status === "plan shifted" || status === "plan delayed";
}

function planningRowHasUnavailableBreakdown(row: DashboardPayload) {
  const text = [row.machineUnavailableReason, row.plannerActionRequired].map(str).join(" ").toLowerCase();
  return text.includes("breakdown") || text.includes("unavailable");
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
  if (entryType === "quality_parameter_master") {
    return [
      payload.partNo || payload.partCode,
      payload.optionNumber,
      payload.setupNo,
      payload.code || payload.parameterCode,
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "hourly_quality_check") {
    return str(payload.checkId) || [
      payload.prodDate || payload.date,
      payload.shift,
      payload.hourSlot,
      payload.machine || payload.machineNo,
      payload.partCode || payload.partNo,
      payload.optionNumber,
      payload.setupNo,
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "production_card" || entryType === "software_raw") {
    return [
      payload.cardId,
      payload.prodDate,
      payload.jobCard || payload.jcNo,
      payload.partCode,
      payload.setupNo,
      payload.machine,
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "setup_checklist_master") {
    return [
      payload.version,
      payload.sequence,
      payload.checkPoint,
    ].map((value) => str(value).toLowerCase()).join("|");
  }
  if (entryType === "setup_checklist_session") {
    return str(payload.sessionId) || [
      payload.jcNo,
      payload.partCode,
      payload.optionNumber,
      payload.setupNo,
      payload.machine,
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
  if (entryType === "downtime_reason_master" || entryType === "rejection_type_master" || entryType === "rejection_reason_master" || entryType === "rejection_remark_master") return str(payload.code).toLowerCase();
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

function productionCycleMasterChanged(row: DashboardPayload, card: DashboardPayload) {
  const nextCycle = optionalNumber(card.cycleTime) ?? productionCycleSeconds(row);
  const nextPieceWeight = optionalNumber(card.pieceWeight) ?? productionPieceWeightGrams(row);
  return Math.abs(nextCycle - productionCycleSeconds(row)) > 0.0001
    || Math.abs(nextPieceWeight - productionPieceWeightGrams(row)) > 0.0001;
}

function productionCycleMasterPayload(row: DashboardPayload, card: DashboardPayload) {
  return {
    partNo: itemCode(row),
    optionNumber: displayValue(row.optionNumber),
    setupNo: displayValue(row.setupNo),
    setupName: displayValue(row.setupName),
    machineUsed: displayValue(row.machineType),
    operationWeight: optionalNumber(card.pieceWeight) ?? productionPieceWeightGrams(row),
    cycleTime: optionalNumber(card.cycleTime) ?? productionCycleSeconds(row),
    loadingUnloading: optionalNumber(card.loadingUnloading) ?? 0,
    updatedFrom: "shop_floor_tasks",
    updatedAt: new Date().toISOString(),
  };
}
function omitRecordKey<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function productionCardMatchesSelection(card: DashboardPayload, row: DashboardPayload, role: RoleTaskKind, cardEntryKind: string, prodDate: string, shift: string) {
  if (!sameProductionCardText(card.cardRole, role)) return false;
  if (!sameProductionCardText(card.cardEntryKind || inferredProductionCardEntryKind(card), cardEntryKind)) return false;
  if (!sameProductionCardText(card.prodDate, prodDate)) return false;
  if (!sameProductionCardText(card.shift, shift)) return false;
  if (!sameProductionCardText(card.machine, displayValue(row.machine))) return false;
  if (!sameProductionCardText(card.partCode || card.partNo, itemCode(row))) return false;
  if (!sameProductionCardText(card.jobCard || card.jcNo, jobCardNumber(row))) return false;
  return sameProductionCardText(card.setupNo, displayValue(row.setupNo));
}

function inferredProductionCardEntryKind(card: DashboardPayload) {
  if (optionalText(card.rejectionReasonCode) || optionalNumber(card.rejectQty)) return "rejection";
  if (optionalText(card.downtimeCode) || optionalNumber(card.downtimeMinutes)) return "downtime";
  if (optionalText(card.bulkDowntime)) return "bulk_downtime";
  return "production";
}

function sameProductionCardText(left: unknown, right: unknown) {
  return str(left).toLowerCase() === str(right).toLowerCase();
}
function productionCardPayload(row: DashboardPayload, card: DashboardPayload) {
  const payload = {
    cardId: productionCardId(row, card),
    cardRole: optionalText(card.cardRole),
    cardEntryKind: optionalText(card.cardEntryKind) || inferredProductionCardEntryKind(card),
    prodDate: text(card.prodDate) || new Date().toISOString().slice(0, 10),
    shift: optionalText(card.shift),
    location: optionalText(row.location),
    operatorId: text(card.operatorId) || "Unassigned",
    operatorName: optionalText(card.operatorName),
    qcName: optionalText(card.qcName),
    machineType: displayValue(row.machineType),
    machine: displayValue(row.machine),
    partCode: itemCode(row),
    jobCard: jobCardNumber(row),
    jcNo: jobCardNumber(row),
    optionNumber: displayValue(row.optionNumber),
    setupNo: displayValue(row.setupNo),
    setupName: displayValue(row.setupName),
    cycleTime: optionalNumber(card.cycleTime) ?? optionalNumber(row.cycleTime) ?? 0,
    loadingUnloading: optionalNumber(card.loadingUnloading) ?? optionalNumber(row.loadingUnloading) ?? 0,
    startTime: optionalText(card.startTime),
    endTime: optionalText(card.endTime),
    runtimeMinutes: optionalNumber(card.runtimeMinutes) ?? 0,
    breakMinutes: optionalNumber(card.breakMinutes) ?? 0,
    downtimeMinutes: optionalNumber(card.downtimeMinutes) ?? 0,
    downtimeReason: optionalText(card.downtimeReason),
    downtimeCode: optionalText(card.downtimeCode),
    outputQty: optionalNumber(card.outputQty) ?? 0,
    actualQty: optionalNumber(card.actualQty) ?? optionalNumber(card.outputQty) ?? 0,
    targetQty: optionalNumber(card.targetQty) ?? 0,
    rejectQty: optionalNumber(card.rejectQty) ?? 0,
    rejectionType: optionalText(card.rejectionType),
    rejectionTypeCode: optionalText(card.rejectionTypeCode),
    rejectionReason: optionalText(card.rejectionReason),
    rejectionReasonCode: optionalText(card.rejectionReasonCode),
    rejectionRemark: optionalText(card.rejectionRemark),
    rejectionRemarkCode: optionalText(card.rejectionRemarkCode),
    grossWeight: optionalNumber(card.grossWeight) ?? 0,
    netWeight: optionalNumber(card.netWeight) ?? 0,
    pieceWeight: optionalNumber(card.pieceWeight) ?? 0,
    cratesUsed: optionalNumber(card.cratesUsed) ?? 0,
    crateWeightKg: optionalNumber(card.crateWeightKg) ?? 0,
    producedPcs: optionalNumber(card.producedPcs) ?? optionalNumber(card.actualQty) ?? optionalNumber(card.outputQty) ?? 0,
    settingQty: optionalNumber(card.settingQty) ?? 0,
    toolingCheck: asRecord(card.toolingCheck),
    shopFloorChecks: asRecord(card.shopFloorChecks),
    qcApproval: optionalText(card.qcApproval),
    remarks: optionalText(card.remarks),
    efficiency: optionalNumber(card.efficiency) ?? 0,
    savedAt: new Date().toISOString(),
  };
  return payload;
}

function productionCardId(row: DashboardPayload, card: DashboardPayload) {
  const role = optionalText(card.cardRole);
  const entryKind = optionalText(card.cardEntryKind) || inferredProductionCardEntryKind(card);
  return [
    role,
    entryKind,
    card.prodDate,
    card.shift,
    jobCardNumber(row),
    itemCode(row),
    row.setupNo,
    row.machine,
  ]
    .map((value) => str(value).toLowerCase())
    .join("|");
}

function productionCycleSeconds(row: DashboardPayload) {
  return (optionalNumber(row.cycleTime) ?? 0) + (optionalNumber(row.loadingUnloading) ?? 0);
}

function productionPieceWeightGrams(row: DashboardPayload) {
  return optionalNumber(row.operationWeight) ?? optionalNumber(row.stageWeight) ?? 0;
}

function time24Input(value: string) {
  return value.replace(/[^0-9:]/g, "").slice(0, 5);
}

function productionCardRuntimeMinutes(prodDate: string, startTime: string, endTime: string) {
  if (!prodDate || !startTime || !endTime) return 0;
  const start = new Date(`${prodDate}T${startTime}:00`);
  let end = new Date(`${prodDate}T${endTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return Math.max(Math.round((end.getTime() - start.getTime()) / 60000), 0);
}

function storedSetupChecklistSessionKey(sessionId: string) {
  return `mrmpl:setup-checklist:${sessionId}`;
}

function readStoredSetupChecklistSession(sessionId: string) {
  if (typeof window === "undefined" || !sessionId) return undefined;
  try {
    const stored = asRecord(JSON.parse(window.localStorage.getItem(storedSetupChecklistSessionKey(sessionId)) || "null"));
    return str(stored.sessionId) ? stored : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredSetupChecklistSession(session: DashboardPayload) {
  const sessionId = str(session.sessionId);
  if (typeof window === "undefined" || !sessionId) return;
  window.localStorage.setItem(storedSetupChecklistSessionKey(sessionId), JSON.stringify(session));
}
function setupChecklistPageHref(row: DashboardPayload, phase: string) {
  return `/dashboard/setup-checklist?sessionId=${encodeURIComponent(setupChecklistSessionId(row))}&phase=${encodeURIComponent(phase)}`;
}

function setupChecklistCandidateRows(productionControl: DashboardPayload) {
  const rows = [
    ...shopFloorQueueRows(productionControl).map((row) => row.next),
    ...currentShopFloorRows(productionControl),
  ].filter((row): row is DashboardPayload => Boolean(row));
  const bySessionId = new Map<string, DashboardPayload>();
  for (const row of rows) {
    const sessionId = setupChecklistSessionId(row);
    if (sessionId && !bySessionId.has(sessionId)) bySessionId.set(sessionId, row);
  }
  return [...bySessionId.values()];
}
function setupChecklistSessionId(row: DashboardPayload) {
  return [
    jobCardNumber(row),
    itemCode(row),
    displayValue(row.optionNumber),
    displayValue(row.setupNo),
    displayValue(row.machine),
  ].map((value) => str(value).toLowerCase()).join("|");
}

function setupChecklistSessionPayload(row: DashboardPayload, session: DashboardPayload) {
  return {
    jcNo: jobCardNumber(row),
    partCode: itemCode(row),
    optionNumber: displayValue(row.optionNumber),
    setupNo: displayValue(row.setupNo),
    setupName: displayValue(row.setupName),
    machine: displayValue(row.machine),
    machineType: displayValue(row.machineType),
    sessionId: setupChecklistSessionId(row),
    ...session,
  };
}

function setupChecklistSessionForRow(sessions: DashboardPayload[], row: DashboardPayload) {
  const sessionId = setupChecklistSessionId(row);
  return sessions.find((session) => str(session.sessionId) === sessionId)
    ?? sessions.find((session) => setupChecklistSessionId(session) === sessionId);
}

function activeSetupChecklistMasterRows(rows: DashboardPayload[]) {
  const activeRows = rows.filter((row) => str(row.status || "Active").toLowerCase() !== "inactive");
  const latestVersion = activeRows
    .map((row) => str(row.version || "1"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  return activeRows
    .filter((row) => str(row.version || "1") === latestVersion)
    .sort((a, b) => (optionalNumber(a.sequence) ?? 0) - (optionalNumber(b.sequence) ?? 0));
}

function setupChecklistItemsFromMaster(rows: DashboardPayload[]) {
  return rows.map((row, index) => ({
    version: displayValue(row.version || "1"),
    sequence: optionalNumber(row.sequence) ?? index + 1,
    checkPoint: displayValue(row.checkPoint),
    inputType: displayValue(row.inputType || "checkbox"),
    required: displayValue(row.required || "Yes"),
    section: displayValue(row.section || "Pre setting / setting"),
    masterCreatedAt: displayValue(row.createdAt),
  }));
}

function setupChecklistItemKey(item: DashboardPayload, fallbackIndex = 0) {
  return [item.version, item.sequence ?? fallbackIndex + 1, item.checkPoint].map((value) => str(value).toLowerCase()).join("|");
}

function setupChecklistItemRequired(item: DashboardPayload) {
  return str(item.required || "Yes").toLowerCase() !== "no";
}

function setupChecklistExistingValue(item: DashboardPayload, phase: string) {
  return displayValue(phase === "start" ? item.startValue : item.endValue) === "-" ? "" : displayValue(phase === "start" ? item.startValue : item.endValue);
}

function setupChecklistValuesComplete(items: DashboardPayload[], values: Record<string, string>, phase: string) {
  if (!items.length) return false;
  return items.every((item, index) => {
    if (!setupChecklistItemRequired(item)) return true;
    const value = values[setupChecklistItemKey(item, index)] ?? setupChecklistExistingValue(item, phase);
    return Boolean(str(value));
  });
}

function setupChecklistSessionForStage({
  row,
  phase,
  values,
  items,
  masterRows,
  existingSession,
  doneBy,
  remark,
  completedAt,
}: {
  row: DashboardPayload;
  phase: string;
  values: Record<string, string>;
  items: DashboardPayload[];
  masterRows: DashboardPayload[];
  existingSession?: DashboardPayload;
  doneBy: string;
  remark: string;
  completedAt: string;
}) {
  const masterVersion = str(existingSession?.masterVersion || items[0]?.version || masterRows[0]?.version || "1");
  const sessionItems = items.map((item, index) => {
    const itemKey = setupChecklistItemKey(item, index);
    const value = values[itemKey] ?? setupChecklistExistingValue(item, phase);
    return phase === "start"
      ? { ...item, startValue: value }
      : { ...item, endValue: value };
  });
  return {
    ...(existingSession ?? {}),
    sessionId: setupChecklistSessionId(row),
    masterVersion,
    masterEffectiveFrom: displayValue(masterRows[0]?.effectiveFrom || existingSession?.masterEffectiveFrom),
    status: phase === "start" ? "In progress" : "Completed",
    startedAt: phase === "start" ? completedAt : existingSession?.startedAt,
    startedBy: phase === "start" ? doneBy : existingSession?.startedBy,
    startRemark: phase === "start" ? remark : existingSession?.startRemark,
    endedAt: phase === "end" ? completedAt : existingSession?.endedAt,
    endedBy: phase === "end" ? doneBy : existingSession?.endedBy,
    endRemark: phase === "end" ? remark : existingSession?.endRemark,
    items: sessionItems,
  };
}

function setupChecklistMasterDefaults() {
  return {
    version: new Date().toISOString().slice(0, 10).replaceAll("-", ""),
    sequence: "",
    checkPoint: "",
    inputType: "checkbox",
    required: "Yes",
    section: "Pre setting / setting",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    status: "Active",
  };
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

function numValue(row: DashboardPayload, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
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