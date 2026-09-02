"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Eye,
  FileText,
  Gauge,
  GripVertical,
  LayoutDashboard,
  ListChecks,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Search,
  Sun,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import type { MaintenanceRequestRow } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
  type MetricCardTone,
} from "@workspace/ui/components/card"
import { Empty } from "@workspace/ui/components/empty"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  DashboardErrorState,
  DashboardGrid,
  DashboardLoadingSkeleton,
  DashboardPageHeader,
  DashboardSection,
  DataTableCard,
} from "@/components/dashboard/dashboard-components"

import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import { DataDownloadButton } from "@/components/data-download-button"
import {
  MasterDataCsvClientImportButton,
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import { importStoreMasterCsvAction } from "@/app/store/master-transfer-action"

import {
  dashboardCoverageNotice,
  dashboardDeliveryNotice,
} from "@/lib/dashboard-delivery-client"
import { useDashboardDelivery } from "@/hooks/use-dashboard-delivery"
import {
  dashboardPayloadFromState,
  dashboardPayloadForProductionFloor,
  dashboardRefreshStatusFromState,
  dateSortValue,
  defaultProductionFloorCode,
  formatNumber,
  jobCardScheduleSummary,
  normalizeProductionFloorCode,
  productionFloors,
  toDashboardViewModel,
  universalProductionDashboardRows,
  type ProductionFloorCode,
} from "@/lib/dashboard-view-model"
import { formatIstDateTime, formatIstTime, istDateValue } from "@/lib/date-time"
import {
  checklistWorkspaceEntryTypes,
  columnsForProductionMaster,
  dataEntryRowsForProductionMaster,
  productionMasterTableEntryTypes,
  productionMasterRowSources,
  qualityWorkspaceEntryTypes,
  rowsForProductionMaster,
} from "@/lib/production-master-tables"
import {
  isCompanyWideMasterEntryType,
  masterDataDashboardHref,
} from "@/lib/master-data-navigation"
import { masterSelectionFromContext } from "@/lib/master-module"
import {
  immutableMasterFields,
  masterDataEntryTypes,
  masterEditDefaults,
  operationalDataEntryTypes,
  operationalEntryRows,
} from "@/lib/master-data-workspaces"
import {
  externalOperationalEntryOptions,
  operationalDataDashboardHref,
  type ExternalOperationalEntryOption,
} from "@/lib/operational-entry-navigation"
import { operationalEntrySelectionFromContext } from "@/lib/operational-entry-module"
import {
  refreshLockFromStatus,
  refreshLockHasSettled,
  type PlanningRefreshLock,
} from "@/lib/dashboard-live-state"
import {
  mergeFirstPieceInspectionTasks as mergeStoredFirstPieceInspectionTasks,
  readFirstPieceInspectionDraft as readFirstPieceInspectionDraftFromStorage,
  readFirstPieceInspectionTasks as readFirstPieceInspectionTasksFromStorage,
  removeFirstPieceInspectionDraft as removeFirstPieceInspectionDraftFromStorage,
  writeFirstPieceInspectionDraft as writeFirstPieceInspectionDraftToStorage,
  writeFirstPieceInspectionTasks as writeFirstPieceInspectionTasksToStorage,
  type FirstPieceInspectionDraft,
} from "@/lib/first-piece-inspection-draft"
import {
  compatibleDestinationMachineOptions,
  machineConstraintQueueReview,
  type MachineConstraintQueueReviewGroup,
} from "@/lib/machine-constraint-review"
import {
  dispatchReadyJobCards,
  jobCardActionAssignments,
} from "@/lib/job-card-action-planning"
import {
  maintenanceChecklistRowsForSchedule,
  maintenanceMasterRowsForMachineAssignment,
} from "@/lib/maintenance-schedule-options"
import { unifiedMechanicalWorkRows } from "@/lib/maintenance-work-list"
import { MachineStoreAssets } from "@/components/machine-store-assets"
import {
  StoreMasterWorkspace,
  type StoreMasterData,
} from "@/app/store/masters/master-workspace"
import {
  planningRefreshStatusMessage,
  shouldQueuePlanningRefresh,
  shouldRefreshStalePlanningSnapshot,
  stalePlanningRefreshKey,
} from "@/lib/planning-refresh-policy"
import { plannerActionHistoryRows } from "@/lib/planner-action-history"
import { plannerPendingMachineIssueRows } from "@/lib/planner-pending-review"
import { productionPieceWeightGrams } from "@/lib/production-session-entry"
import {
  duplicateQualityParameterCombination,
  mergeQualityInspectionParameterRows,
} from "@/lib/quality-parameter-set"
import {
  productionDispatchApproverOptions,
  productionMachinistOptions,
  productionQualityOptions,
  productionShopFloorOptions,
  productionWorkerOptions,
  type EmployeeOption,
} from "@/lib/shared-employee-master"
import {
  setupChecklistItemAppliesToPhase,
  shopFloorNoPendingActionLabel,
} from "@/lib/shop-floor-workflow"
import {
  priorityChangePlan,
  priorityPlanHeldBlockers,
  priorityPlanQueueBeforeSetups,
  priorityPlanStepPreviewState,
  priorityPlanStepWindows,
  type PriorityPlanStep,
} from "@/lib/priority-change-plan"
import type { PriorityPlanWindow } from "@/lib/priority-plan-scenarios"
import {
  applyShopFloorStatusPatches,
  retainUnconfirmedShopFloorStatusPatches,
  shopFloorStatusPatchFromAction,
  upsertShopFloorStatusPatch,
  type ShopFloorStatusPatch,
} from "@/lib/shop-floor-optimistic"
import { useTheme } from "@/components/theme-provider"
import { UnifiedSidebarNavigation } from "@/components/unified-sidebar-navigation"
import { OperationalWorkspaceTabs } from "@/components/operational-workspace-tabs"
import { UserAccountFooter } from "@/components/user-account-footer"
import { JobCardRegister } from "@/components/job-card-register"
import {
  PlannerDecisionWorkspace,
  type PlannerDecisionAction,
  type PlannerDecisionView,
} from "@/components/planner-decision-workspace"
import type { UnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  externalMasterDataOptions,
  type ExternalMasterDataOption,
} from "@/lib/master-data-navigation"
import {
  dashboardNavigation as navItems,
  dashboardTabHref,
  dashboardNavigationDestination,
  type DashboardTabId,
  jobCardWorkspaceHref,
} from "@/lib/unified-navigation"
import { normalizeUserEnteredPayload } from "@workspace/db/user-entry-text"
import {
  machineFamilyOptions,
  planningMasterPayload,
  routeMasterLineKey,
  routeMasterLineOptions,
  setupNameOptions,
} from "@/lib/planning-master-contract"

type DashboardPayload = Record<string, unknown>

type ActionStatus = { tone: "default" | "destructive"; message: string } | null

type DashboardApiResult = {
  message: string
  queued?: boolean
  skipped?: boolean
}

type DataEntrySpec = {
  entryType: string
  title: string
  description: string
  fields: LegacyField[]
}
type QualityParameterDraft = {
  draftId: string
  persisted?: boolean
  parameterCode?: string
  sequence: string
  parameterName: string
  specification: string
  instrumentUsed: string
  tolerancePlus: string
  toleranceMinus: string
  inputType: string
  remark: string
}

type MaintenanceChecklistStepDraft = {
  draftId: string
  persisted?: boolean
  sequence: string
  stepDescription: string
  inputType: string
  remark: string
}

type SetupChecklistStepDraft = {
  draftId: string
  persisted?: boolean
  sequence: string
  checkPoint: string
  inputType: string
  required: string
  section: string
  remark: string
}

function productionFloorFromLocation(): ProductionFloorCode {
  if (typeof window === "undefined") return defaultProductionFloorCode
  return normalizeProductionFloorCode(
    new URLSearchParams(window.location.search).get("floor")
  )
}

function machineMasterQueryFromLocation() {
  if (typeof window === "undefined") return { machineNo: "" }
  return {
    machineNo: str(new URLSearchParams(window.location.search).get("machine")),
  }
}

function dashboardReturnHref(defaultTab: DashboardTabId) {
  if (typeof window === "undefined") {
    return dashboardTabHref(defaultTab, defaultProductionFloorCode)
  }
  const returnTab = new URLSearchParams(window.location.search).get(
    "returnTab"
  ) as DashboardTabId | null
  return dashboardTabHref(
    validDashboardTab(returnTab) ?? defaultTab,
    productionFloorFromLocation()
  )
}

function validDashboardTab(tab: DashboardTabId | null) {
  return tab && navItems.some((item) => item.id === tab) ? tab : undefined
}

function dataEntryDestination(entryType: string): DashboardTabId {
  if ((operationalDataEntryTypes as readonly string[]).includes(entryType)) {
    return "operationalEntryTab"
  }
  return "dataEntryTab"
}

const storeMasterCsvColumns = {
  ASSET_NAME: ["asset_name", "asset_subcategory_id"],
  CATEGORY: ["asset_category_name"],
  ITEM_TYPE: [
    "applicable_item_code",
    "asset_category_id",
    "asset_name_id",
    "asset_subcategory_id",
    "asset_type",
    "drawing_number",
    "identification_name",
    "minimum_stock",
    "unit",
  ],
  LOCATION: ["location_code", "location_name", "location_type"],
  SUBCATEGORY: ["asset_category_id", "asset_subcategory_name"],
  SUPPLIER: [
    "supplier_name",
    "supplier_address",
    "supplier_email",
    "gst_number",
    "contact_details",
  ],
  SUPPLIER_PRICE: [
    "supplier_id",
    "item_type_id",
    "unit_price",
    "valid_from",
    "quote_reference",
  ],
  VENDOR: ["vendor_code", "vendor_name", "contact_details"],
} as const

function storeMasterCsvTemplate(selectedMaster: string | null) {
  const key =
    selectedMaster && Object.hasOwn(storeMasterCsvColumns, selectedMaster)
      ? (selectedMaster as keyof typeof storeMasterCsvColumns)
      : "ITEM_TYPE"
  return {
    columns: storeMasterCsvColumns[key],
    fileName: `${key.toLowerCase()}-master-template.csv`,
  }
}

function MasterDataTabs({
  activeView,
  csvImportAction,
  entryType,
  exportDisabled,
  onExport,
  productionFloorCode,
}: {
  activeView: "dataEntry" | "masterTables"
  csvImportAction?: ReactNode
  entryType: string
  exportDisabled?: boolean
  onExport?: () => void
  productionFloorCode: ProductionFloorCode
}) {
  const searchParams = useSearchParams()
  const selectedStoreMaster = searchParams.get("storeMaster")
  return (
    <MasterDataViewTabs
      activeView={activeView}
      csvDownloadAction={
        entryType === "store_masters" ? (
          <MasterDataCsvDownloadButton
            {...storeMasterCsvTemplate(selectedStoreMaster)}
          />
        ) : (
          <MasterDataCsvDownloadButton
            href={`/api/data-template?entryType=${encodeURIComponent(entryType)}`}
          />
        )
      }
      csvImportAction={csvImportAction}
      dataEntryHref={masterDataDashboardHref(
        "dataEntry",
        productionFloorCode,
        entryType,
        selectedStoreMaster
      )}
      exportAction={
        entryType === "store_masters" ? (
          <DataDownloadButton
            href={`/store/masters/export.csv?storeMaster=${selectedStoreMaster ?? "ITEM_TYPE"}`}
            label="Download CSV"
          />
        ) : null
      }
      exportDisabled={exportDisabled}
      masterTablesHref={masterDataDashboardHref(
        "masterTables",
        productionFloorCode,
        entryType,
        selectedStoreMaster
      )}
      onExport={entryType === "store_masters" ? undefined : onExport}
    />
  )
}

const dataEntrySpecs: DataEntrySpec[] = [
  {
    entryType: "setup_name_master",
    title: "Setup Name Master",
    description: "Reusable Setup Names Selected By Route Master.",
    fields: [{ name: "setupName", label: "Setup Name", required: true }],
  },
  {
    entryType: "route",
    title: "Route Master",
    description: "Part Route, Option, Setup, And Route-Level Machine Family.",
    fields: [
      { name: "partNo", label: "Part No.", required: true },
      { name: "optionNumber", label: "Option No.", required: true },
      { name: "setupNo", label: "Setup No.", required: true },
      { name: "numberOfSetups", label: "No. Of Setup", type: "number" },
      { name: "setupName", label: "Setup Name", required: true },
      { name: "machineFamily", label: "Machine Family", required: true },
      { name: "machineType", label: "Machine Type" },
      {
        name: "stageWeight",
        label: "Stage Weight Gram",
        type: "number",
        step: "0.01",
      },
    ],
  },
  {
    entryType: "cycle",
    title: "Cycle Time",
    description: "Select A Route Master Line And Enter Only Its Cycle Time.",
    fields: [
      { name: "partNo", label: "Part No.", required: true },
      { name: "optionNumber", label: "Option No.", required: true },
      { name: "setupNo", label: "Setup No.", required: true },
      {
        name: "cycleTime",
        label: "Cycle Time Sec",
        type: "number",
        step: "0.01",
        required: true,
      },
      { name: "setupName", label: "Setup Name" },
      { name: "machineFamily", label: "Machine Family" },
      { name: "machineType", label: "Machine Type" },
      { name: "stageWeight", label: "Stage Weight Gram" },
    ],
  },
  {
    entryType: "tooling",
    title: "Tooling",
    description:
      "Record Existing Store Asset Codes Used To Manufacture This Item.",
    fields: [
      { name: "partNo", label: "Part No.", required: true },
      { name: "optionNumber", label: "Option No.", required: true },
      { name: "setupNo", label: "Setup No.", required: true },
      { name: "setupName", label: "Setup Name" },
      { name: "machineFamily", label: "Machine Family" },
      { name: "machineType", label: "Machine Type" },
      { name: "fixture", label: "Fixture" },
      { name: "tooling", label: "Tooling" },
      { name: "foamTool", label: "Foam Tool" },
      { name: "remarks", label: "Remarks" },
    ],
  },
  {
    entryType: "work_order",
    title: "Work Order",
    description: "Jc, Part, Po, And Order Quantities.",
    fields: [
      { name: "jcNo", label: "Jc No.", required: true },
      { name: "partCode", label: "Part Code", required: true },
      { name: "fgPoNo", label: "Fg Po No." },
      { name: "rmPoNo", label: "Rm Po No." },
      { name: "poDate", label: "Po Date", type: "date" },
      { name: "orderPcs", label: "Order Pcs", type: "number", required: true },
      { name: "orderKg", label: "Order Kg", type: "number", step: "0.01" },
    ],
  },
  {
    entryType: "rm_inward",
    title: "Rm Inward",
    description: "Raw-Material Inward Status Against Job Card.",
    fields: [
      { name: "jcNo", label: "Jc No.", required: true },
      {
        name: "rmInwardDate",
        label: "Rm Inward Date",
        type: "date",
        required: true,
      },
      {
        name: "rmInwardKg",
        label: "Rm Inward Kg",
        type: "number",
        step: "0.01",
      },
    ],
  },
  {
    entryType: "machine_master",
    title: "Machine Master",
    description:
      "Machines For The Currently Selected Production Unit. Each Machine Is Kept Separate By Production Unit And Location.",
    fields: [
      { name: "machineNo", label: "Machine No.", required: true },
      {
        name: "productionFloorCode",
        label: "Production Unit",
        options: productionFloors.map((floor) => floor.code),
        required: true,
      },
      { name: "machineFamily", label: "Machine Family", required: true },
      { name: "machineType", label: "Machine Type", required: true },
      { name: "machineName", label: "Machine Name" },
      {
        name: "location",
        label: "Machine Location Within Unit",
        required: true,
      },
      {
        name: "status",
        label: "Status",
        options: ["Active", "Maintenance"],
        defaultValue: "Active",
      },
      { name: "remarks", label: "Remarks" },
    ],
  },
  {
    entryType: "maintenance_master",
    title: "Maintenance Schedule Master",
    description:
      "Reusable Weekly, Monthly, Or Custom Maintenance Schedules. Machine Numbers Are Assigned Later From Machine Master.",
    fields: [
      { name: "maintenanceCode", label: "Maintenance Code", required: true },
      {
        name: "maintenanceTitle",
        label: "Maintenance Schedule Title",
        required: true,
      },
      {
        name: "frequencyDays",
        label: "Frequency Days",
        type: "number",
        min: "1",
        required: true,
      },
      {
        name: "frequencyBasis",
        label: "Frequency Basis",
        options: ["Calendar days", "Running days"],
        defaultValue: "Calendar days",
      },
      { name: "checklistCode", label: "Checklist Code" },
      {
        name: "estimatedMinutes",
        label: "Estimated Minutes",
        type: "number",
        min: "0",
      },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "maintenance_checklist_master",
    title: "Maintenance Checklist",
    description:
      "Reusable Maintenance Checklist Steps Assigned To Machine Maintenance Schedules.",
    fields: [
      { name: "checklistCode", label: "Checklist Code", required: true },
      { name: "checklistTitle", label: "Checklist Title", required: true },
      {
        name: "sequence",
        label: "Step No.",
        type: "number",
        min: "1",
        required: true,
      },
      { name: "stepDescription", label: "Step Description", required: true },
      {
        name: "inputType",
        label: "Input Type",
        options: ["checkbox", "text", "number"],
        defaultValue: "checkbox",
      },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "planning_holiday",
    title: "Planning Holiday",
    description:
      "Plant Shutdown Dates And Vacation Days That Planning Should Skip.",
    fields: [
      { name: "date", label: "Holiday Date", type: "date", required: true },
      {
        name: "reason",
        label: "Reason",
        options: ["Plant holiday", "Vacation", "Maintenance shutdown", "Other"],
        defaultValue: "Plant holiday",
      },
      {
        name: "scope",
        label: "Scope",
        options: ["Factory", "Department"],
        defaultValue: "Factory",
      },
      { name: "department", label: "Department" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "setup_checklist_master",
    title: "Setup Checklist",
    description:
      "Coded Machinist Checklists Used From Pre Setting Start Through Setting Completion.",
    fields: [
      {
        name: "checklistCode",
        label: "Checklist Code",
        required: true,
        readOnly: true,
      },
      { name: "checklistTitle", label: "Checklist Title", required: true },
      { name: "sequence", label: "Sequence", type: "number", required: true },
      { name: "checkPoint", label: "Check Point", required: true },
      {
        name: "inputType",
        label: "Input Type",
        options: ["checkbox", "text", "number"],
        defaultValue: "checkbox",
      },
      {
        name: "required",
        label: "Required",
        options: ["Yes", "No"],
        defaultValue: "Yes",
      },
      {
        name: "section",
        label: "Section",
        defaultValue: "Pre setting / setting",
      },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "rejection_type_master",
    title: "Rejection Type Master",
    description: "Quality Rejection Type Codes Used In Qc Rejection Entry.",
    fields: [
      { name: "code", label: "Code", required: true, readOnly: true },
      { name: "typeOfRejection", label: "Type Of Rejection", required: true },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "rejection_remark_master",
    title: "Rejection Remark Master",
    description: "Quality Rejection Remark Codes Used In Qc Rejection Entry.",
    fields: [
      { name: "code", label: "Code", required: true, readOnly: true },
      { name: "rejectionRemark", label: "Rejection Remark", required: true },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "rejection_reason_master",
    title: "Defect / Downtime Reason Master",
    description:
      "Shared Defect And Downtime Reason Codes Used By Qc Rejection And Downtime Entries.",
    fields: [
      { name: "code", label: "Code", required: true, readOnly: true },
      {
        name: "rejectionReason",
        label: "Defect / Downtime Reason",
        required: true,
      },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "quality_parameter_master",
    title: "Quality Inspection Parameter Master",
    description:
      "Shared Fpir And Hourly Quality Check Parameters By Item, Option, And Setup.",
    fields: [
      { name: "partNo", label: "Part No.", required: true },
      { name: "optionNumber", label: "Option No.", required: true },
      { name: "setupNo", label: "Setup No.", required: true },
      { name: "sequence", label: "Sequence", type: "number", min: "1" },
      { name: "parameterName", label: "Parameter Name", required: true },
      { name: "specification", label: "Specification", required: true },
      { name: "instrumentUsed", label: "Instrument Used" },
      {
        name: "tolerancePlus",
        label: "Tolerance +",
        type: "number",
        step: "0.001",
      },
      {
        name: "toleranceMinus",
        label: "Tolerance -",
        type: "number",
        step: "0.001",
      },
      {
        name: "inputType",
        label: "Input Type",
        options: ["number", "text", "pass_fail"],
        defaultValue: "number",
      },
      { name: "remark", label: "Remark" },
    ],
  },
  {
    entryType: "software_raw",
    title: "Software Production Output",
    description: "Daily Production Rows From The Shop-Floor Software.",
    fields: [
      {
        name: "prodDate",
        label: "Production Date",
        type: "date",
        required: true,
      },
      { name: "operatorId", label: "Operator Id", required: true },
      { name: "operatorName", label: "Operator Name" },
      { name: "machineType", label: "Machine Type" },
      { name: "machine", label: "Machine No.", required: true },
      { name: "partCode", label: "Part Code", required: true },
      { name: "jobCard", label: "Jc No." },
      { name: "setupNo", label: "Setup No." },
      {
        name: "outputQty",
        label: "Output Qty",
        type: "number",
        required: true,
      },
      { name: "actualQty", label: "Actual Qty", type: "number" },
      { name: "targetQty", label: "Target Qty", type: "number" },
      { name: "rejectQty", label: "Reject Qty", type: "number" },
      { name: "rejectionType", label: "Rejection Type" },
      { name: "rejectionRemark", label: "Rejection Remark" },
      { name: "downtimeMinutes", label: "Downtime Minutes", type: "number" },
      { name: "downtimeReason", label: "Downtime Reason" },
    ],
  },
  {
    entryType: "store_masters",
    title: "Store Masters",
    description:
      "Store Item Types, Classification, Locations, Suppliers, And Vendors.",
    fields: [],
  },
]
const maintenanceMasterEntryTypes = ["maintenance_master"] as const

function masterTableSpecs() {
  const allowed = new Set<string>([
    ...productionMasterTableEntryTypes,
    "store_masters",
  ])
  return dataEntrySpecs.filter((spec) => allowed.has(spec.entryType))
}
const subscribeToHydration = () => () => {}
const clientHydrationSnapshot = () => true
const serverHydrationSnapshot = () => false

function usePostgresOperationalPage(
  url: string | null,
  pollIntervalMs = 0,
  onData?: (data: DashboardPayload) => void,
  activePollIntervalMs = pollIntervalMs,
  reloadKey = 0
) {
  const [result, setResult] = useState<{
    data?: DashboardPayload
    error?: string
    url: string
  }>({ url: "" })
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    let nextLoad: number | undefined
    let loading = false
    const load = async () => {
      if (loading || document.visibilityState === "hidden") return
      loading = true
      let nextPollIntervalMs = pollIntervalMs
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        })
        const body = asRecord(await response.json().catch(() => ({})))
        if (!response.ok) {
          throw new Error(
            str(body.error) || "Dashboard data could not be loaded."
          )
        }
        setResult({ data: body, url })
        onData?.(body)
        if (asRecord(body.status).isRefreshing === true) {
          nextPollIntervalMs = activePollIntervalMs
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) return
        setResult({
          error:
            error instanceof Error
              ? error.message
              : "Dashboard data could not be loaded.",
          url,
        })
      } finally {
        loading = false
        const nextDelay =
          nextPollIntervalMs > 0 && !document.hidden ? nextPollIntervalMs : null
        if (!controller.signal.aborted && nextDelay !== null) {
          nextLoad = window.setTimeout(load, nextDelay)
        }
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        if (nextLoad !== undefined) window.clearTimeout(nextLoad)
        nextLoad = undefined
        return
      }
      void load()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    void load()
    return () => {
      controller.abort()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (nextLoad !== undefined) window.clearTimeout(nextLoad)
    }
  }, [activePollIntervalMs, onData, pollIntervalMs, reloadKey, url])

  return result.url === url ? result : { url: url ?? "" }
}

async function savePostgresDashboardEntry(
  entryType: string,
  payload: DashboardPayload
) {
  const productionFloorCode = productionFloorFromLocation()
  const normalizedPayload = normalizeUserEnteredPayload(payload)
  const response = await fetch("/api/data-entry", {
    body: JSON.stringify({
      entryType,
      productionFloorCode,
      payload: { ...normalizedPayload, productionFloorCode },
    }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const body = asRecord(await response.json().catch(() => ({})))
  if (!response.ok) {
    throw new Error(str(body.error) || "Dashboard entry could not be saved.")
  }
  return body
}

export function MrmplDashboard({
  canDeleteMasters = false,
  canManageStoreMasters = false,
  initialDashboardTab = "productionControlTab",
  initialDataEntryType,
  initialProductionFloor = defaultProductionFloorCode,
  navigationAccess,
  storeMasterData,
  user,
}: {
  canDeleteMasters?: boolean
  canManageStoreMasters?: boolean
  initialDashboardTab?: DashboardTabId
  initialDataEntryType?: string
  initialProductionFloor?: ProductionFloorCode
  navigationAccess: UnifiedNavigationAccess
  storeMasterData?: StoreMasterData | null
  user: { email: string; name: string }
}) {
  return (
    <DashboardShell
      key={`${initialDashboardTab}|${initialDataEntryType ?? ""}|${initialProductionFloor}`}
      canDeleteMasters={canDeleteMasters}
      canManageStoreMasters={canManageStoreMasters}
      initialDashboardTab={initialDashboardTab}
      initialDataEntryType={initialDataEntryType}
      initialProductionFloor={initialProductionFloor}
      navigationAccess={navigationAccess}
      storeMasterData={storeMasterData}
      user={user}
    />
  )
}

export function HourlyQualityCheckPage({
  productionFloorCode = defaultProductionFloorCode,
}: {
  productionFloorCode?: ProductionFloorCode
}) {
  return <HourlyQualityCheckShell productionFloorCode={productionFloorCode} />
}

export function FirstPieceInspectionPage({
  productionFloorCode = defaultProductionFloorCode,
}: {
  productionFloorCode?: ProductionFloorCode
}) {
  return <FirstPieceInspectionShell productionFloorCode={productionFloorCode} />
}

function FirstPieceInspectionShell({
  productionFloorCode,
}: {
  productionFloorCode: ProductionFloorCode
}) {
  const { state: dashboardDeliveryState } = useDashboardDelivery({
    floor: productionFloorCode,
  })
  const [storedTasks, setStoredTasks] = useState<DashboardPayload[]>([])
  const [completedTaskKeys, setCompletedTaskKeys] = useState<Set<string>>(
    () => new Set()
  )
  const [processingAction, setProcessingAction] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<ActionStatus>(null)
  const dashboardPayload = dashboardPayloadFromState(
    dashboardDeliveryState.data ?? undefined
  )
  const payload = useMemo(
    () =>
      dashboardDeliveryState.data === null
        ? ({} as DashboardPayload)
        : dashboardPayloadForProductionFloor(
            dashboardPayload,
            productionFloorCode
          ),
    [dashboardDeliveryState.data, dashboardPayload, productionFloorCode]
  )
  const productionControl = asRecord(payload.productionControl)
  const liveTasks = useMemo(
    () =>
      shopFloorQueueRows(productionControl)
        .filter((row) => roleTaskMatches(row, "quality"))
        .map((row) => row.next),
    [productionControl]
  )
  const tasks = useMemo(
    () =>
      mergeFirstPieceInspectionTasks(liveTasks, storedTasks).filter(
        (task) => !completedTaskKeys.has(shopFloorPlanKey(task))
      ),
    [completedTaskKeys, liveTasks, storedTasks]
  )

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setStoredTasks(readStoredFirstPieceInspectionTasks()),
      0
    )
    return () => window.clearTimeout(timeout)
  }, [])

  async function submitAction(path: string, body: Record<string, unknown>) {
    const normalizedBody = normalizeUserEnteredPayload(body)
    setProcessingAction(dashboardActionProcessingMessage(path, normalizedBody))
    setActionStatus(null)
    try {
      const result = await postDashboardApi(path, normalizedBody)
      setActionStatus({ tone: "default", message: result.message })
    } catch (error) {
      const actionError =
        error instanceof Error ? error : new Error("Inspection save failed.")
      setActionStatus({ tone: "destructive", message: actionError.message })
      throw actionError
    } finally {
      setProcessingAction(null)
    }
  }

  function completeTask(row: DashboardPayload) {
    const taskKey = shopFloorPlanKey(row)
    setCompletedTaskKeys((current) => new Set(current).add(taskKey))
    setStoredTasks((current) => {
      const remaining = current.filter(
        (task) => shopFloorPlanKey(task) !== taskKey
      )
      writeStoredFirstPieceInspectionTasks(remaining)
      return remaining
    })
  }

  const isLoading =
    dashboardDeliveryState.data === null &&
    dashboardDeliveryState.request !== "error"

  return (
    <section className="grid w-full min-w-0 gap-4 text-foreground">
      <div className="grid gap-3 @3xl/main:grid-cols-[minmax(0,1fr)_auto] @3xl/main:items-start">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">First Piece Inspection</h1>
        </div>
        <Button
          className="w-full @3xl/main:w-auto"
          type="button"
          variant="outline"
          onClick={() =>
            window.location.assign(
              dashboardTabHref("qualityControlTasksTab", productionFloorCode)
            )
          }
        >
          <LayoutDashboard className="size-4" />
          Quality Control
        </Button>
      </div>

      <div className="grid gap-3 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        <MetricCard
          label="Pending Reports"
          value={formatNumber(tasks.length)}
        />
        <MetricCard
          label="Inspection Parameters"
          value={formatNumber(
            combinedQualityInspectionMasterRows(productionControl).length
          )}
        />
        <MetricCard label="Required Readings" value="5 Per Dimension" />
      </div>

      {processingAction ? (
        <ProcessingNotice message={processingAction} />
      ) : null}
      {actionStatus ? (
        <AlertMessage tone={actionStatus.tone}>
          {actionStatus.message}
        </AlertMessage>
      ) : null}
      {isLoading ? <Skeleton className="h-64 w-full" /> : null}
      {dashboardDeliveryState.request === "error" ? (
        <AlertMessage tone="destructive">
          Live Inspection Tasks Could Not Be Loaded. Refresh And Try Again.
        </AlertMessage>
      ) : null}
      {!isLoading ? (
        <FirstPieceInspectionPanel
          tasks={tasks}
          productionControl={productionControl}
          submitAction={submitAction}
          openDataEntry={() =>
            window.location.assign(
              `${dashboardTabHref("dataEntryTab", productionFloorCode)}&entry=quality_parameter_master`
            )
          }
          onTaskComplete={completeTask}
        />
      ) : null}
    </section>
  )
}

function HourlyQualityCheckShell({
  productionFloorCode,
}: {
  productionFloorCode: ProductionFloorCode
}) {
  const hourlyQualityPage = usePostgresOperationalPage(
    `/api/hourly-quality?floor=${encodeURIComponent(productionFloorCode)}`
  )
  const hourlyQualityPageData = hourlyQualityPage.data
  const [prodDate, setProdDate] = useState(() => istDateValue())
  const [shift, setShift] = useState("Day")
  const [hourSlot, setHourSlot] = useState(() => currentHourSlot())
  const [selectedKey, setSelectedKey] = useState("")
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<ActionStatus>(null)

  const hourlyQualityPageRecord = asRecord(hourlyQualityPageData)
  const currentDashboardUserRecord = asRecord(
    hourlyQualityPageRecord.currentDashboardUser
  )
  const performerId = str(currentDashboardUserRecord.userId)
  const performerDisplay = str(
    currentDashboardUserRecord.displayId ||
      currentDashboardUserRecord.email ||
      currentDashboardUserRecord.name ||
      performerId
  )
  const runningRows = useMemo(
    () => asArray(hourlyQualityPageRecord.runningRows),
    [hourlyQualityPageRecord.runningRows]
  )
  const selectedRow = useMemo(
    () => runningRows.find((row) => shopFloorPlanKey(row) === selectedKey),
    [runningRows, selectedKey]
  )
  const qualityParameterRows = useMemo(
    () => asArray(hourlyQualityPageRecord.qualityParameterMasterRows),
    [hourlyQualityPageRecord.qualityParameterMasterRows]
  )

  const parameters = useMemo(
    () =>
      selectedRow
        ? sortQualityParameterRows(
            qualityParameterRows.filter((row) =>
              qualityParameterMatchesSetup(row, selectedRow)
            )
          )
        : [],
    [qualityParameterRows, selectedRow]
  )
  const selectedCheckKey = selectedRow
    ? hourlyQualityCheckId(selectedRow, prodDate, shift, hourSlot)
    : ""
  const existingCheckPage = usePostgresOperationalPage(
    selectedCheckKey
      ? `/api/hourly-quality?checkKey=${encodeURIComponent(selectedCheckKey)}&floor=${encodeURIComponent(productionFloorCode)}`
      : null
  )
  const existingCheck = selectedCheckKey
    ? (existingCheckPage.data?.existingCheck as
        | DashboardPayload
        | null
        | undefined)
    : undefined

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!existingCheck) {
        setReadings({})
        setRemarks({})
        return
      }
      const nextReadings: Record<string, string> = {}
      const nextRemarks: Record<string, string> = {}
      for (const reading of asArray(existingCheck.readings)) {
        const code = qualityParameterCode(reading)
        if (!code) continue
        nextReadings[code] = normalizeQualityReadingInput(
          reading.actualReading || reading.value
        )
        nextRemarks[code] = str(reading.remark)
      }
      setReadings(nextReadings)
      setRemarks(nextRemarks)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [existingCheck])

  async function saveHourlyCheck() {
    if (!selectedRow || !performerId || !parameters.length) return
    const payload = {
      ...hourlyQualityCheckPayload(selectedRow, parameters, readings, remarks, {
        prodDate,
        shift,
        hourSlot,
        checkedBy: performerId,
      }),
      productionFloorCode,
    }
    setIsSaving(true)
    setStatus(null)
    try {
      await savePostgresDashboardEntry("hourly_quality_check", payload)
      setStatus({ tone: "default", message: "Hourly quality check saved." })
      window.location.assign(dashboardReturnHref("qualityControlTasksTab"))
    } catch (err) {
      setStatus({
        tone: "destructive",
        message:
          err instanceof Error
            ? err.message
            : "Hourly quality check save failed.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const canSave = Boolean(
    selectedRow &&
    performerId &&
    parameters.length &&
    parameters.every((parameter) => {
      if (str(parameter.required).toLowerCase() === "no") return true
      return str(readings[qualityParameterCode(parameter)])
    })
  )

  return (
    <section className="grid w-full gap-4 text-foreground">
      <div className="mx-auto grid w-full max-w-7xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Hourly Quality Check</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.location.assign(
                dashboardReturnHref("qualityControlTasksTab")
              )
            }}
          >
            <LayoutDashboard className="size-4" />
            Quality Control
          </Button>
        </div>
        {isSaving ? (
          <ProcessingNotice message="Saving hourly quality check..." />
        ) : null}
        <fieldset aria-busy={isSaving} className="contents" disabled={isSaving}>
          <Card>
            <CardContent className="grid gap-3 pt-4 md:grid-cols-5">
              <LabeledInput
                label="Date"
                value={prodDate}
                onChange={setProdDate}
                type="date"
              />
              <LabeledSelect
                label="Shift"
                value={shift}
                onChange={setShift}
                options={["Day", "Night"]}
              />
              <LabeledSelect
                label="Machine No."
                value={selectedKey}
                onChange={setSelectedKey}
                options={runningRows.map((row) => ({
                  value: shopFloorPlanKey(row),
                  label: `${displayValue(row.machine)} - ${itemCode(row)} / setup ${displayValue(row.setupNo)}`,
                }))}
                placeholder="Select Machine"
              />
              <LabeledSelect
                label="Hour Slot"
                value={hourSlot}
                onChange={setHourSlot}
                options={hourSlotOptions()}
              />
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Checked By
                <Input value={performerDisplay || "Loading user..."} readOnly />
              </label>
            </CardContent>
          </Card>
          {selectedRow ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {displayValue(selectedRow.machine)} Running Details
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm md:grid-cols-5">
                <TileField label="Item Code" value={itemCode(selectedRow)} />
                <TileField label="Jc No." value={jobCardNumber(selectedRow)} />
                <TileField label="Option" value={selectedRow.optionNumber} />
                <TileField label="Setup No." value={selectedRow.setupNo} />
                <TileField label="Setup Name" value={selectedRow.setupName} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Inspection Readings</CardTitle>
              <CardDescription>
                {existingCheck
                  ? "Existing Hourly Card Loaded For Editing."
                  : "Readings Are Saved Against The Selected Date, Shift, Hour, Machine, Item, And Setup."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {selectedRow &&
              existingCheck === undefined &&
              selectedCheckKey ? (
                <Skeleton className="h-24 w-full" />
              ) : selectedRow && parameters.length ? (
                <div className="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-24">Code</TableHead>
                        <TableHead className="min-w-56">Parameter</TableHead>
                        <TableHead className="min-w-36">
                          Specification
                        </TableHead>
                        <TableHead className="min-w-32">Tolerance</TableHead>
                        <TableHead className="min-w-40">Instrument</TableHead>
                        <TableHead className="min-w-44">
                          Actual Reading
                        </TableHead>
                        <TableHead className="min-w-24">Result</TableHead>
                        <TableHead className="min-w-56">Remark</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parameters.map((parameter) => {
                        const code = qualityParameterCode(parameter)
                        const result = qualityReadingResult(
                          parameter,
                          readings[code]
                        )
                        const resultTone = qualityResultTone(result)
                        const readingClass = qualityReadingInputClass(result)
                        return (
                          <TableRow
                            key={code || qualityParameterName(parameter)}
                            className={
                              resultTone === "bad"
                                ? "bg-red-50/70 dark:bg-red-950/20"
                                : ""
                            }
                          >
                            <TableCell className="font-medium">
                              {code}
                            </TableCell>
                            <TableCell>
                              {qualityParameterName(parameter)}
                            </TableCell>
                            <TableCell>
                              {displayValue(parameter.specification)}
                            </TableCell>
                            <TableCell>
                              {qualityParameterTolerance(parameter)}
                            </TableCell>
                            <TableCell>
                              {displayValue(parameter.instrumentUsed)}
                            </TableCell>
                            <TableCell>
                              {qualityParameterInputType(parameter) ===
                              "pass_fail" ? (
                                <SearchableSelect
                                  className={`h-9 w-full rounded-md border bg-background px-3 text-sm ${readingClass}`}
                                  value={readings[code] ?? ""}
                                  onChange={(event) =>
                                    setReadings((current) => ({
                                      ...current,
                                      [code]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Select</option>
                                  <option value="OK">Ok</option>
                                  <option value="Not OK">Not Ok</option>
                                </SearchableSelect>
                              ) : (
                                <Input
                                  className={readingClass}
                                  value={readings[code] ?? ""}
                                  onChange={(event) =>
                                    setReadings((current) => ({
                                      ...current,
                                      [code]: event.target.value,
                                    }))
                                  }
                                  type={
                                    qualityParameterInputType(parameter) ===
                                    "number"
                                      ? "number"
                                      : "text"
                                  }
                                  step="0.001"
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusBadge value={result || "Pending"} />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={remarks[code] ?? ""}
                                onChange={(event) =>
                                  setRemarks((current) => ({
                                    ...current,
                                    [code]: event.target.value,
                                  }))
                                }
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : selectedRow ? (
                <EmptyRowsMessage>
                  No Active Quality Parameter Master Rows Match This Item,
                  Option, And Setup.
                </EmptyRowsMessage>
              ) : (
                <EmptyRowsMessage>
                  Select A Machine To Start The Hourly Check.
                </EmptyRowsMessage>
              )}
              {hourlyQualityPage.error || existingCheckPage.error ? (
                <AlertMessage tone="destructive">
                  {hourlyQualityPage.error || existingCheckPage.error}
                </AlertMessage>
              ) : null}
              {status ? (
                <AlertMessage tone={status.tone}>{status.message}</AlertMessage>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!canSave || isSaving}
                  onClick={saveHourlyCheck}
                >
                  <CheckCircle2 className="size-4" />
                  {isSaving ? "Saving" : "Save Hourly Check"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </fieldset>
      </div>
    </section>
  )
}

export function SetupChecklistPage({
  productionFloorCode = defaultProductionFloorCode,
}: {
  productionFloorCode?: ProductionFloorCode
}) {
  return <SetupChecklistShell productionFloorCode={productionFloorCode} />
}

function setupChecklistQueryFromLocation() {
  if (typeof window === "undefined")
    return {
      sessionId: "",
      phase: "",
      selectedMachinist: "",
      row: {} as DashboardPayload,
    }
  const params = new URLSearchParams(window.location.search)
  return {
    sessionId: params.get("sessionId") ?? "",
    phase: params.get("phase") ?? "",
    selectedMachinist: params.get("doneBy") ?? "",
    row: {
      jcNo: params.get("jcNo") ?? "",
      jobCard: params.get("jcNo") ?? "",
      partCode: params.get("partCode") ?? "",
      itemCode: params.get("partCode") ?? "",
      optionNumber: params.get("optionNumber") ?? "",
      setupNo: params.get("setupNo") ?? "",
      setupName: params.get("setupName") ?? "",
      machine: params.get("machine") ?? "",
      machineType: params.get("machineType") ?? "",
      productionFloorCode: params.get("floor") ?? "",
    } as DashboardPayload,
  }
}

function SetupChecklistShell({
  productionFloorCode,
}: {
  productionFloorCode: ProductionFloorCode
}) {
  const isClientHydrated = useSyncExternalStore(
    subscribeToHydration,
    clientHydrationSnapshot,
    serverHydrationSnapshot
  )
  const { sessionId, phase, selectedMachinist, row } = isClientHydrated
    ? setupChecklistQueryFromLocation()
    : {
        sessionId: "",
        phase: "",
        selectedMachinist: "",
        row: {} as DashboardPayload,
      }
  const checklistPage = usePostgresOperationalPage(
    sessionId
      ? `/api/setup-checklist?sessionId=${encodeURIComponent(sessionId)}&floor=${encodeURIComponent(productionFloorCode)}`
      : null
  )
  const checklistPageData = checklistPage.data
  const [localChecklistSession, setLocalChecklistSession] = useState<
    DashboardPayload | undefined
  >(undefined)
  const [doneBy, setDoneBy] = useState("")
  const [remark, setRemark] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [itemRemarks, setItemRemarks] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<ActionStatus>(null)

  const pageRecord = asRecord(checklistPageData)
  const activeChecklistMasters = useMemo(
    () =>
      activeSetupChecklistMasterRows(
        asArray(pageRecord.setupChecklistMasterRows)
      ),
    [pageRecord.setupChecklistMasterRows]
  )
  const snapshotChecklistSessionRecord = asRecord(
    pageRecord.setupChecklistSession
  )
  const snapshotChecklistSession = Object.keys(snapshotChecklistSessionRecord)
    .length
    ? snapshotChecklistSessionRecord
    : undefined
  const currentChecklistSession =
    localChecklistSession ?? snapshotChecklistSession
  const checklistItems = Array.isArray(currentChecklistSession?.items)
    ? (currentChecklistSession.items as DashboardPayload[])
    : setupChecklistItemsFromMaster(activeChecklistMasters)
  const phaseChecklistItems = setupChecklistItemsForPhase(checklistItems, phase)
  const canSave =
    Boolean(
      sessionId &&
      doneBy &&
      (phase === "start" || phase === "end") &&
      phaseChecklistItems.length
    ) &&
    (phase === "start" || Boolean(currentChecklistSession))
  const isComplete =
    canSave && setupChecklistValuesComplete(phaseChecklistItems, values, phase)

  useEffect(() => {
    if (!isClientHydrated || !sessionId) return
    const timeout = window.setTimeout(() => {
      setLocalChecklistSession(readStoredSetupChecklistSession(sessionId))
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [isClientHydrated, sessionId])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!currentChecklistSession) {
        setValues({})
        setItemRemarks({})
        setDoneBy(selectedMachinist)
        setRemark("")
        return
      }
      const nextValues: Record<string, string> = {}
      const nextItemRemarks: Record<string, string> = {}
      for (const item of asArray(currentChecklistSession.items)) {
        const itemKey = setupChecklistItemKey(item)
        nextValues[itemKey] = setupChecklistExistingValue(item, phase)
        nextItemRemarks[itemKey] = setupChecklistExistingItemRemark(item, phase)
      }
      setValues(nextValues)
      setItemRemarks(nextItemRemarks)
      setDoneBy(
        str(
          phase === "start"
            ? currentChecklistSession.startedBy
            : currentChecklistSession.endedBy
        ) || selectedMachinist
      )
      setRemark(
        str(
          phase === "start"
            ? currentChecklistSession.startRemark
            : currentChecklistSession.endRemark
        )
      )
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [currentChecklistSession, phase, selectedMachinist])

  function updateValue(item: DashboardPayload, value: string) {
    const itemKey = setupChecklistItemKey(item)
    setValues((currentValues) => ({ ...currentValues, [itemKey]: value }))
  }

  function updateItemRemark(item: DashboardPayload, value: string) {
    const itemKey = setupChecklistItemKey(item)
    setItemRemarks((currentRemarks) => ({
      ...currentRemarks,
      [itemKey]: value,
    }))
  }

  async function saveProgress() {
    if (!row || !canSave || isSaving) return
    const session = setupChecklistSessionForStage({
      row,
      phase,
      values,
      itemRemarks,
      items: checklistItems,
      masterRows: activeChecklistMasters,
      existingSession: currentChecklistSession,
      doneBy,
      remark,
      completedAt: new Date().toISOString(),
    })
    const payload = setupChecklistSessionPayload(row, session)
    setIsSaving(true)
    setStatus(null)
    try {
      await savePostgresDashboardEntry("setup_checklist_session", payload)
      setLocalChecklistSession(payload)
      writeStoredSetupChecklistSession(payload)
      setStatus({ tone: "default", message: "Checklist progress saved." })
      window.location.assign(dashboardReturnHref("machinistTasksTab"))
    } catch (err) {
      setStatus({
        tone: "destructive",
        message: err instanceof Error ? err.message : "Checklist save failed.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="grid w-full gap-4 text-foreground">
      <div className="mx-auto grid w-full max-w-6xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Setup Checklist</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.location.assign(dashboardReturnHref("machinistTasksTab"))
            }}
          >
            <LayoutDashboard className="size-4" />
            Machinist
          </Button>
        </div>
        {isSaving ? (
          <ProcessingNotice message="Saving checklist progress..." />
        ) : null}
        <fieldset aria-busy={isSaving} className="contents" disabled={isSaving}>
          {sessionId ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {phase === "end"
                      ? "Setting Completion"
                      : "Pre Setting Start"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <TileField label="Item Code" value={itemCode(row)} />
                    <TileField label="Jc No." value={jobCardNumber(row)} />
                    <TileField label="Option" value={row.optionNumber} />
                    <TileField label="Setup No." value={row.setupNo} />
                    <TileField label="Machine" value={row.machine} />
                    <TileField
                      label="Phase"
                      value={phase === "end" ? "Completion" : "Start"}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                      Pre Setting Done By
                      <Input
                        value={
                          phase === "start"
                            ? doneBy
                            : str(currentChecklistSession?.startedBy)
                        }
                        readOnly
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                      Setting Done By
                      <Input
                        value={
                          phase === "end"
                            ? doneBy
                            : str(currentChecklistSession?.endedBy)
                        }
                        readOnly
                      />
                    </label>
                    <LabeledInput
                      label="Remark"
                      value={remark}
                      onChange={setRemark}
                    />
                  </div>
                </CardContent>
              </Card>
              {checklistPageData === undefined && !checklistItems.length ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <SetupChecklistForm
                  row={row}
                  phase={phase}
                  items={phaseChecklistItems}
                  session={currentChecklistSession}
                  values={values}
                  itemRemarks={itemRemarks}
                  onValueChange={updateValue}
                  onItemRemarkChange={updateItemRemark}
                />
              )}
              {checklistPage.error ? (
                <AlertMessage tone="destructive">
                  {checklistPage.error}
                </AlertMessage>
              ) : null}
              {status ? (
                <AlertMessage tone={status.tone}>{status.message}</AlertMessage>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge
                  value={
                    isComplete ? "Checklist complete" : "Progress can be saved"
                  }
                />
                <Button
                  type="button"
                  disabled={!canSave || isSaving}
                  onClick={() => void saveProgress()}
                >
                  <CheckCircle2 className="size-4" />
                  {isSaving ? "Saving" : "Save Checklist Progress"}
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <EmptyRowsMessage>
                  Checklist Setup Was Not Found. Open This Page From A Machinist
                  Task Row.
                </EmptyRowsMessage>
              </CardContent>
            </Card>
          )}
        </fieldset>
      </div>
    </section>
  )
}

function DashboardShell({
  canDeleteMasters,
  canManageStoreMasters,
  initialDashboardTab,
  initialDataEntryType,
  initialProductionFloor,
  navigationAccess,
  storeMasterData,
  user,
}: {
  canDeleteMasters: boolean
  canManageStoreMasters: boolean
  initialDashboardTab: DashboardTabId
  initialDataEntryType?: string
  initialProductionFloor: ProductionFloorCode
  navigationAccess: UnifiedNavigationAccess
  storeMasterData?: StoreMasterData | null
  user: { email: string; name: string }
}) {
  const [activeTab, setActiveTab] =
    useState<DashboardTabId>(initialDashboardTab)
  const [activeProductionFloor] = useState<ProductionFloorCode>(
    initialProductionFloor
  )
  const [preferredDataEntryType, setPreferredDataEntryType] = useState(
    initialDataEntryType ?? dataEntrySpecs[0]?.entryType ?? "route"
  )
  const [preferredDataEntryDefaults, setPreferredDataEntryDefaults] = useState<
    Record<string, unknown>
  >({})
  const [firstPieceInspectionTasks, setFirstPieceInspectionTasks] = useState<
    DashboardPayload[]
  >([])
  const [optimisticShopFloorStatuses, setOptimisticShopFloorStatuses] =
    useState<ShopFloorStatusPatch[]>([])
  const [
    optimisticSetupChecklistSessions,
    setOptimisticSetupChecklistSessions,
  ] = useState<DashboardPayload[]>([])
  const [optimisticProductionCards, setOptimisticProductionCards] = useState<
    DashboardPayload[]
  >([])
  const [planningRefreshLock, setPlanningRefreshLock] =
    useState<PlanningRefreshLock | null>(null)
  const lastStalePlanningRefreshKeyRef = useRef<string | undefined>(undefined)
  const lastSnapshotUpdatedAtRef = useRef<string | undefined>(undefined)
  const actionInFlightRef = useRef(false)
  const [actionStatus, setActionStatus] = useState<ActionStatus>(null)
  const [processingAction, setProcessingAction] = useState<string | null>(null)
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false)
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0)
  const handleDashboardStateData = useCallback((state: DashboardPayload) => {
    const status = asRecord(state.status)
    setPlanningRefreshLock((current) =>
      current && refreshLockHasSettled(current, status) ? null : current
    )
  }, [])
  const {
    refreshFailed: markDashboardRefreshFailed,
    refreshRequested: markDashboardRefreshRequested,
    retry: retryDashboardDelivery,
    state: dashboardDeliveryState,
  } = useDashboardDelivery({
    floor: activeProductionFloor,
    onData: handleDashboardStateData,
  })
  const correctionCandidatesPage = usePostgresOperationalPage(
    activeTab === "correctionsTab"
      ? "/api/correction-candidates?limit=200"
      : null,
    5_000,
    undefined,
    5_000,
    dashboardReloadKey
  )
  const dashboardPayload = dashboardPayloadFromState(
    dashboardDeliveryState.data ?? undefined
  )
  const dashboardRefreshStatus = dashboardRefreshStatusFromState(
    dashboardDeliveryState.data ?? undefined
  )
  const correctionCandidates = asArray(correctionCandidatesPage.data?.rows)
  const isPlanningRefreshLockActive = planningRefreshLock
    ? !refreshLockHasSettled(planningRefreshLock, dashboardRefreshStatus)
    : false

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFirstPieceInspectionTasks((currentTasks) =>
        mergeFirstPieceInspectionTasks(
          readStoredFirstPieceInspectionTasks(),
          currentTasks
        )
      )
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    const dashboardRecord = asRecord(dashboardPayload)
    if (!shouldRefreshStalePlanningSnapshot(dashboardRecord)) return
    if (isPlanningRefreshLockActive || dashboardRefreshStatus?.isRefreshing)
      return
    const staleRefreshKey = stalePlanningRefreshKey(dashboardRecord)
    if (lastStalePlanningRefreshKeyRef.current === staleRefreshKey) return
    lastStalePlanningRefreshKeyRef.current = staleRefreshKey
    void postDashboardApi("dashboard-refresh", {})
      .then(() => markDashboardRefreshRequested())
      .catch((error: unknown) =>
        markDashboardRefreshFailed(
          error instanceof Error
            ? error.message
            : "Planning recalculation could not be queued."
        )
      )
  }, [
    dashboardPayload,
    dashboardRefreshStatus?.isRefreshing,
    isPlanningRefreshLockActive,
    markDashboardRefreshFailed,
    markDashboardRefreshRequested,
  ])

  async function refreshDashboardSnapshot(force = true) {
    setPlanningRefreshLock(refreshLockFromStatus(dashboardRefreshStatus))
    setIsRefreshingSnapshot(true)
    setActionStatus(null)
    try {
      const result = await postDashboardApi("dashboard-refresh", { force })
      setDashboardReloadKey((current) => current + 1)
      markDashboardRefreshRequested()
      setActionStatus({
        tone: "default",
        message: result.queued
          ? "Planning recalculation queued."
          : result.skipped
            ? "Planning is already up to date."
            : "Planning recalculated from latest data.",
      })
      if (!result.skipped) {
        setOptimisticShopFloorStatuses((current) =>
          retainUnconfirmedShopFloorStatusPatches(basePayload, current)
        )
        setOptimisticSetupChecklistSessions([])
        setOptimisticProductionCards([])
      }
      if (result.skipped) setPlanningRefreshLock(null)
    } catch (err) {
      setPlanningRefreshLock(null)
      markDashboardRefreshFailed(
        err instanceof Error ? err.message : "Snapshot refresh failed."
      )
      setActionStatus({
        tone: "destructive",
        message:
          err instanceof Error ? err.message : "Snapshot refresh failed.",
      })
    } finally {
      setIsRefreshingSnapshot(false)
    }
  }

  async function submitAction(
    path: string,
    body: Record<string, unknown>,
    options: { throwOnError?: boolean } = {}
  ) {
    if (actionInFlightRef.current) return
    const normalizedBody = normalizeUserEnteredPayload(body)
    actionInFlightRef.current = true
    setProcessingAction(dashboardActionProcessingMessage(path, normalizedBody))
    setActionStatus(null)
    const queuePlanningRefresh = shouldQueuePlanningRefresh(
      path,
      normalizedBody
    )
    if (queuePlanningRefresh) {
      setPlanningRefreshLock(refreshLockFromStatus(dashboardRefreshStatus))
    }
    try {
      const apiResult = await postDashboardApi(path, normalizedBody)
      const message = apiResult.message
      const shopFloorPatch = shopFloorStatusPatchFromAction(
        path,
        normalizedBody
      )
      if (shopFloorPatch) {
        setOptimisticShopFloorStatuses((current) =>
          upsertShopFloorStatusPatch(current, shopFloorPatch)
        )
      }
      const setupChecklistSessionPatch = setupChecklistSessionPatchFromAction(
        path,
        normalizedBody
      )
      if (setupChecklistSessionPatch) {
        setOptimisticSetupChecklistSessions((current) =>
          upsertSetupChecklistSessionPatch(current, setupChecklistSessionPatch)
        )
      }
      const productionCardPatch = productionCardPatchFromAction(
        path,
        normalizedBody
      )
      if (productionCardPatch) {
        setOptimisticProductionCards((current) =>
          upsertProductionCardPatch(current, productionCardPatch)
        )
      }
      setActionStatus({
        tone: "default",
        message: `${message} ${planningRefreshStatusMessage(queuePlanningRefresh, path, normalizedBody)}`,
      })
      if (queuePlanningRefresh) markDashboardRefreshRequested()
      const returnTab = str(normalizedBody.returnTab) as DashboardTabId
      if (returnTab && navItems.some((item) => item.id === returnTab)) {
        setActiveTab(returnTab)
      }
    } catch (err) {
      if (queuePlanningRefresh) setPlanningRefreshLock(null)
      const actionError =
        err instanceof Error ? err : new Error("Action failed.")
      setActionStatus({ tone: "destructive", message: actionError.message })
      if (options.throwOnError) throw actionError
    } finally {
      actionInFlightRef.current = false
      setProcessingAction(null)
    }
  }

  function openDataEntry(
    entryType: string,
    defaults: Record<string, unknown> = {}
  ) {
    setPreferredDataEntryType(entryType)
    setPreferredDataEntryDefaults({
      productionFloorCode: activeProductionFloor,
      ...defaults,
    })
    setActiveTab(dataEntryDestination(entryType))
  }

  function openMasterReadiness() {
    setActiveTab("masterGapsTab")
  }

  function openFirstPieceInspection(row: DashboardPayload) {
    const scopedRow = { ...row, productionFloorCode: activeProductionFloor }
    setFirstPieceInspectionTasks((openTasks) => {
      const key = shopFloorPlanKey(scopedRow)
      if (openTasks.some((task) => shopFloorPlanKey(task) === key))
        return openTasks
      const nextTasks = [...openTasks, scopedRow]
      writeStoredFirstPieceInspectionTasks(nextTasks)
      return nextTasks
    })
    window.location.assign(
      `/dashboard/first-piece-inspection?${new URLSearchParams({ floor: activeProductionFloor }).toString()}`
    )
  }

  function selectDashboardDestination(
    tab: DashboardTabId,
    productionFloorCode: ProductionFloorCode
  ) {
    const destination = dashboardNavigationDestination(tab, productionFloorCode)
    if (destination.interaction === "route") {
      window.location.assign(destination.href)
      return
    }
    if (
      tab === "machineMasterTab" ||
      tab === "maintenanceTab" ||
      tab === "correctionsTab" ||
      tab === "productionDashboardTab"
    ) {
      setActiveTab(tab)
      window.history.replaceState({}, "", destination.href)
      return
    }
    if (productionFloorCode !== activeProductionFloor) {
      window.location.assign(dashboardTabHref(tab, productionFloorCode))
      return
    }
    setActiveTab(tab)
    window.history.replaceState({}, "", destination.href)
  }

  function closeFirstPieceInspection(row: DashboardPayload) {
    const key = shopFloorPlanKey(row)
    setFirstPieceInspectionTasks((openTasks) => {
      const nextTasks = openTasks.filter(
        (task) => shopFloorPlanKey(task) !== key
      )
      writeStoredFirstPieceInspectionTasks(nextTasks)
      return nextTasks
    })
  }

  const hasDashboardData = dashboardDeliveryState.data !== null
  const isDashboardLoading =
    !hasDashboardData && dashboardDeliveryState.request !== "error"
  const isDashboardUnavailable =
    !hasDashboardData && dashboardDeliveryState.request === "error"
  const basePayload = useMemo(
    () =>
      !hasDashboardData
        ? ({} as DashboardPayload)
        : dashboardPayloadForProductionFloor(
            dashboardPayload,
            activeProductionFloor
          ),
    [activeProductionFloor, dashboardPayload, hasDashboardData]
  )
  const snapshotUpdatedAt = str(basePayload.updatedAt)
  const planningRecalculatedAt =
    str(basePayload.snapshotCacheUpdatedAt) ||
    (typeof dashboardRefreshStatus?.completedAtMs === "number"
      ? new Date(dashboardRefreshStatus.completedAtMs).toISOString()
      : "")
  useEffect(() => {
    if (
      !snapshotUpdatedAt ||
      lastSnapshotUpdatedAtRef.current === snapshotUpdatedAt
    )
      return
    lastSnapshotUpdatedAtRef.current = snapshotUpdatedAt
    setOptimisticShopFloorStatuses((current) =>
      retainUnconfirmedShopFloorStatusPatches(basePayload, current)
    )
    setOptimisticSetupChecklistSessions((current) =>
      current.length ? [] : current
    )
    setOptimisticProductionCards((current) => (current.length ? [] : current))
  }, [basePayload, snapshotUpdatedAt])

  const payload = useMemo(
    () =>
      applyProductionCardPatches(
        applySetupChecklistSessionPatches(
          applyShopFloorStatusPatches(basePayload, optimisticShopFloorStatuses),
          optimisticSetupChecklistSessions
        ),
        optimisticProductionCards
      ),
    [
      basePayload,
      optimisticShopFloorStatuses,
      optimisticSetupChecklistSessions,
      optimisticProductionCards,
    ]
  )
  const selectedTab =
    navItems.find((item) => item.id === activeTab) ?? navItems[0]!
  const selectedProductionFloor =
    productionFloors.find((floor) => floor.code === activeProductionFloor) ??
    productionFloors[0]
  const isAllProductionUnitsTab =
    activeTab === "machineMasterTab" ||
    activeTab === "maintenanceTab" ||
    activeTab === "productionDashboardTab"
  const isSnapshotRefreshActive =
    isRefreshingSnapshot ||
    dashboardRefreshStatus?.isRefreshing === true ||
    isPlanningRefreshLockActive
  const dashboardStatusNotice = dashboardDeliveryNotice(dashboardDeliveryState)
  const dashboardPartialCoverageNotice =
    activeTab === "masterTablesTab"
      ? null
      : dashboardCoverageNotice(
          dashboardDeliveryState.data,
          selectedProductionFloor.shortLabel
        )

  const view = useMemo(() => toDashboardViewModel(payload), [payload])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "19rem",
          "--header-height": "4rem",
        } as React.CSSProperties
      }
    >
      <Sidebar variant="sidebar">
        <SidebarHeader className="border-b border-black/10 bg-[var(--color-logo-surface)] px-3 py-3">
          <Link
            className="flex items-center px-2 py-2"
            href={dashboardTabHref(
              "productionControlTab",
              activeProductionFloor
            )}
          >
            <Image
              src="/mrm-green.svg"
              alt="Mrmpl"
              width={792}
              height={176}
              priority
              className="h-8 w-auto max-w-full object-contain"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <UnifiedSidebarNavigation
            activeDashboardTab={activeTab}
            activeMasterEntryType={preferredDataEntryType}
            activeProductionFloor={activeProductionFloor}
            navigationAccess={navigationAccess}
            onDashboardTabSelect={selectDashboardDestination}
          />
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <UserAccountFooter user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-(--header-height) items-center gap-3 border-b bg-card/95 px-4 backdrop-blur lg:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              {selectedTab.title}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              <span>
                {isAllProductionUnitsTab
                  ? "All Production Units"
                  : `${selectedProductionFloor.label} · ${planningRecalculatedAt ? `Planning recalculated ${formatDate(planningRecalculatedAt)}` : view.updatedAt ? `Workbook updated ${formatDate(view.updatedAt)}` : "Live Postgresql Records"}`}
              </span>
              {planningRecalculatedAt && view.updatedAt ? (
                <span> - Workbook Updated {formatDate(view.updatedAt)}</span>
              ) : null}
            </p>
          </div>

          <HeaderActions
            canRefreshSnapshot={hasDashboardData}
            isRefreshingSnapshot={isSnapshotRefreshActive}
            onRefreshSnapshot={() => void refreshDashboardSnapshot(true)}
          />
        </header>
        <main className="@container/main flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          {processingAction ? (
            <ProcessingNotice message={processingAction} />
          ) : actionStatus ? (
            <Badge
              variant={
                actionStatus.tone === "destructive" ? "destructive" : "outline"
              }
              className="w-fit"
            >
              {actionStatus.message}
            </Badge>
          ) : null}
          {dashboardStatusNotice || dashboardPartialCoverageNotice ? (
            <div
              className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/35 px-3 py-2 text-sm"
              role="status"
              aria-atomic="true"
              aria-live="polite"
            >
              <div className="min-w-0 flex-1 space-y-1">
                {dashboardStatusNotice ? <p>{dashboardStatusNotice}</p> : null}
                {dashboardPartialCoverageNotice ? (
                  <p className="text-muted-foreground">
                    {dashboardPartialCoverageNotice}
                  </p>
                ) : null}
              </div>
              {dashboardDeliveryState.lastError ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retryDashboardDelivery}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
          {isDashboardUnavailable ? (
            <DashboardErrorState
              action={
                <Button type="button" onClick={retryDashboardDelivery}>
                  Retry Dashboard Load
                </Button>
              }
              description={
                dashboardDeliveryState.lastError ??
                "Dashboard data could not be loaded."
              }
              title="Dashboard Unavailable"
            />
          ) : isDashboardLoading ? (
            <DashboardSkeleton />
          ) : (
            <fieldset
              aria-busy={Boolean(processingAction)}
              className="contents"
              disabled={Boolean(processingAction)}
            >
              <DashboardContent
                activeTab={activeTab}
                canDeleteMasters={canDeleteMasters}
                canManageStoreMasters={canManageStoreMasters}
                payload={payload}
                submitAction={submitAction}
                correctionCandidates={correctionCandidates}
                openDataEntry={openDataEntry}
                openMasterReadiness={openMasterReadiness}
                openFirstPieceInspection={openFirstPieceInspection}
                closeFirstPieceInspection={closeFirstPieceInspection}
                firstPieceInspectionTasks={firstPieceInspectionTasks}
                navigationAccess={navigationAccess}
                onMasterEntryTypeChange={setPreferredDataEntryType}
                preferredDataEntryType={preferredDataEntryType}
                preferredDataEntryDefaults={preferredDataEntryDefaults}
                productionFloorCode={activeProductionFloor}
                storeMasterData={storeMasterData}
                onProductionFloorChange={(floorCode) =>
                  selectDashboardDestination(activeTab, floorCode)
                }
              />
            </fieldset>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function setupChecklistSessionPatchFromAction(
  path: string,
  body: Record<string, unknown>
) {
  if (path !== "data-entry") return undefined
  if (str(body.entryType) !== "setup_checklist_session") return undefined
  const payload = asRecord(body.payload)
  return setupChecklistSessionPatchKey(payload) ? payload : undefined
}

function upsertSetupChecklistSessionPatch(
  current: DashboardPayload[],
  patch: DashboardPayload
) {
  const patchKey = setupChecklistSessionPatchKey(patch)
  return [
    ...current.filter(
      (item) => setupChecklistSessionPatchKey(item) !== patchKey
    ),
    patch,
  ]
}

function applySetupChecklistSessionPatches(
  payload: DashboardPayload,
  patches: DashboardPayload[]
) {
  if (!patches.length) return payload
  const productionControl = asRecord(payload.productionControl)
  if (!Object.keys(productionControl).length) return payload
  const rows = asArray(productionControl.setupChecklistSessionRows)
  const rowsByKey = new Map(
    rows.map((row) => [setupChecklistSessionPatchKey(row), row])
  )
  let changed = false
  for (const patch of patches) {
    const patchKey = setupChecklistSessionPatchKey(patch)
    if (!patchKey) continue
    rowsByKey.set(patchKey, patch)
    changed = true
  }
  if (!changed) return payload
  return {
    ...payload,
    productionControl: {
      ...productionControl,
      setupChecklistSessionRows: [...rowsByKey.values()],
    },
  }
}

function productionCardPatchFromAction(
  path: string,
  body: Record<string, unknown>
) {
  if (path !== "data-entry") return undefined
  if (str(body.entryType) !== "production_card") return undefined
  const payload = asRecord(body.payload)
  return productionCardPatchKey(payload) ? payload : undefined
}

function productionCardPatchKey(row: DashboardPayload) {
  return optionalText(row.cardId) || dataEntryKey("production_card", row)
}

function upsertProductionCardPatch(
  current: DashboardPayload[],
  patch: DashboardPayload
) {
  const patchKey = productionCardPatchKey(patch)
  return [
    ...current.filter((item) => productionCardPatchKey(item) !== patchKey),
    patch,
  ]
}

function applyProductionCardPatches(
  payload: DashboardPayload,
  patches: DashboardPayload[]
) {
  if (!patches.length) return payload
  const productionControl = asRecord(payload.productionControl)
  if (!Object.keys(productionControl).length) return payload
  const rows = asArray(productionControl.productionCardRows)
  const rowsByKey = new Map(
    rows.map((row) => [productionCardPatchKey(row), row])
  )
  let changed = false
  for (const patch of patches) {
    const patchKey = productionCardPatchKey(patch)
    if (!patchKey) continue
    rowsByKey.set(patchKey, { ...(rowsByKey.get(patchKey) ?? {}), ...patch })
    changed = true
  }
  if (!changed) return payload
  return {
    ...payload,
    productionControl: {
      ...productionControl,
      productionCardRows: [...rowsByKey.values()],
    },
  }
}
function setupChecklistSessionPatchKey(row: DashboardPayload) {
  const sessionId = str(row.sessionId)
  if (sessionId) return sessionId.toLowerCase()
  const parts = [
    row.jcNo || row.jobCard,
    row.partCode || row.partNo,
    row.optionNumber,
    row.setupNo,
    row.machine || row.machineNo,
  ]
    .map((value) => displayValue(value).toLowerCase())
    .filter((value) => value && value !== "-")
  return parts.length >= 5 ? parts.join("|") : ""
}
function HeaderActions({
  canRefreshSnapshot,
  isRefreshingSnapshot,
  onRefreshSnapshot,
}: {
  canRefreshSnapshot: boolean
  isRefreshingSnapshot: boolean
  onRefreshSnapshot: () => void
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    clientHydrationSnapshot,
    serverHydrationSnapshot
  )
  const isDark = mounted && resolvedTheme === "dark"

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={!canRefreshSnapshot || isRefreshingSnapshot}
        onClick={onRefreshSnapshot}
      >
        <RefreshCw
          className={`size-4${isRefreshingSnapshot ? "animate-spin" : ""}`}
        />
        <span className="hidden sm:inline">
          {isRefreshingSnapshot ? "Recalculating" : "Recalculate Planning"}
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={isDark ? "Switch To Light Mode" : "Switch To Dark Mode"}
        title={isDark ? "Switch To Light Mode" : "Switch To Dark Mode"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </div>
  )
}

function DashboardContent({
  activeTab,
  canDeleteMasters,
  canManageStoreMasters,
  payload,
  submitAction,
  correctionCandidates,
  openDataEntry,
  openMasterReadiness,
  openFirstPieceInspection,
  closeFirstPieceInspection,
  firstPieceInspectionTasks,
  navigationAccess,
  onMasterEntryTypeChange,
  preferredDataEntryType,
  preferredDataEntryDefaults,
  productionFloorCode,
  storeMasterData,
  onProductionFloorChange,
}: {
  activeTab: DashboardTabId
  canDeleteMasters: boolean
  canManageStoreMasters: boolean
  payload: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  correctionCandidates: DashboardPayload[]
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
  openMasterReadiness: () => void
  openFirstPieceInspection: (row: DashboardPayload) => void
  closeFirstPieceInspection: (row: DashboardPayload) => void
  firstPieceInspectionTasks: DashboardPayload[]
  navigationAccess: UnifiedNavigationAccess
  onMasterEntryTypeChange: (entryType: string) => void
  preferredDataEntryType: string
  preferredDataEntryDefaults: Record<string, unknown>
  productionFloorCode: ProductionFloorCode
  storeMasterData?: StoreMasterData | null
  onProductionFloorChange: (floorCode: ProductionFloorCode) => void
}) {
  const productionControl = asRecord(payload.productionControl)

  if (activeTab === "productionDashboardTab") {
    return <ProductionDashboardPanel payload={payload} />
  }

  if (activeTab === "jobCardStatusTab") {
    return (
      <JobCardsPanel
        productionControl={productionControl}
        productionFloorCode={productionFloorCode}
        submitAction={submitAction}
        openMasterReadiness={openMasterReadiness}
      />
    )
  }

  if (activeTab === "machineDetailTab") {
    return <MachineDetailPanel productionControl={productionControl} />
  }

  if (activeTab === "machineMasterTab") {
    return (
      <CentralMachineMasterWorkspace
        payload={payload}
        submitAction={submitAction}
        openDataEntry={openDataEntry}
      />
    )
  }

  if (activeTab === "masterGapsTab") {
    return (
      <MasterReadinessPanel
        productionControl={productionControl}
        submitAction={submitAction}
        openDataEntry={openDataEntry}
      />
    )
  }

  if (activeTab === "dataEntryTab") {
    return (
      <div className="grid gap-4">
        <DataEntryPanel
          key={preferredDataEntryType}
          payload={payload}
          submitAction={submitAction}
          preferredEntryType={preferredDataEntryType}
          preferredDefaults={preferredDataEntryDefaults}
          allowedEntryTypes={masterDataEntryTypes}
          productionFloorCode={productionFloorCode}
          onProductionFloorChange={onProductionFloorChange}
          onEntryTypeChange={onMasterEntryTypeChange}
          canManageStoreMasters={canManageStoreMasters}
          storeMasterData={storeMasterData}
          externalOptions={externalMasterDataOptions(
            navigationAccess,
            "dataEntry"
          )}
          title="Master Data Entry"
        />
      </div>
    )
  }

  if (activeTab === "operationalEntryTab") {
    return (
      <div className="grid gap-4">
        <DataEntryPanel
          key={`operational-${preferredDataEntryType}`}
          payload={payload}
          submitAction={submitAction}
          preferredEntryType={preferredDataEntryType}
          preferredDefaults={preferredDataEntryDefaults}
          allowedEntryTypes={operationalDataEntryTypes}
          productionFloorCode={productionFloorCode}
          onProductionFloorChange={onProductionFloorChange}
          onEntryTypeChange={onMasterEntryTypeChange}
          operationalTabs={{
            dataEntryHref: operationalDataDashboardHref(
              "dataEntry",
              productionFloorCode,
              preferredDataEntryType
            ),
            masterTablesHref: operationalDataDashboardHref(
              "masterTables",
              productionFloorCode,
              preferredDataEntryType
            ),
          }}
          externalOptions={externalOperationalEntryOptions(
            navigationAccess,
            "dataEntry"
          )}
          title="Operational Entry"
        />
      </div>
    )
  }

  if (activeTab === "operationalTablesTab") {
    return (
      <div className="grid gap-4">
        <OperationalTablesPanel
          payload={payload}
          productionControl={productionControl}
          openDataEntry={openDataEntry}
          preferredEntryType={preferredDataEntryType}
          productionFloorCode={productionFloorCode}
          onProductionFloorChange={onProductionFloorChange}
          onEntryTypeChange={onMasterEntryTypeChange}
          operationalTabs={{
            dataEntryHref: operationalDataDashboardHref(
              "dataEntry",
              productionFloorCode,
              preferredDataEntryType
            ),
            masterTablesHref: operationalDataDashboardHref(
              "masterTables",
              productionFloorCode,
              preferredDataEntryType
            ),
          }}
          externalOptions={externalOperationalEntryOptions(
            navigationAccess,
            "masterTables"
          )}
        />
      </div>
    )
  }

  if (activeTab === "masterTablesTab") {
    return (
      <div className="grid gap-4">
        <MasterTablesPanel
          payload={payload}
          productionControl={productionControl}
          submitAction={submitAction}
          openDataEntry={openDataEntry}
          preferredEntryType={preferredDataEntryType}
          productionFloorCode={productionFloorCode}
          canDeleteMasters={canDeleteMasters}
          canManageStoreMasters={canManageStoreMasters}
          storeMasterData={storeMasterData}
        />
      </div>
    )
  }

  if (activeTab === "planningHolidayTab") {
    return (
      <PlanningHolidayPanel
        productionControl={productionControl}
        submitAction={submitAction}
      />
    )
  }

  if (activeTab === "setupChecklistMasterTab") {
    return (
      <DataEntryPanel
        key={`checklists-${preferredDataEntryType}`}
        payload={payload}
        submitAction={submitAction}
        preferredEntryType={preferredDataEntryType}
        preferredDefaults={preferredDataEntryDefaults}
        allowedEntryTypes={checklistWorkspaceEntryTypes}
        title="Checklist Workspace"
      />
    )
  }

  if (activeTab === "maintenanceMastersTab") {
    return (
      <DataEntryPanel
        key={`maintenance-${preferredDataEntryType}`}
        payload={payload}
        submitAction={submitAction}
        preferredEntryType={preferredDataEntryType}
        preferredDefaults={preferredDataEntryDefaults}
        allowedEntryTypes={maintenanceMasterEntryTypes}
        title="Maintenance Master Workspace"
      />
    )
  }

  if (activeTab === "qualityMastersTab") {
    return (
      <DataEntryPanel
        key={`quality-${preferredDataEntryType}`}
        payload={payload}
        submitAction={submitAction}
        preferredEntryType={preferredDataEntryType}
        preferredDefaults={preferredDataEntryDefaults}
        allowedEntryTypes={qualityWorkspaceEntryTypes}
        title="Quality Master Workspace"
      />
    )
  }

  if (activeTab === "maintenanceTab") {
    return (
      <UniversalMaintenanceWorkspace
        payload={payload}
        submitAction={submitAction}
      />
    )
  }

  if (activeTab === "planningControlTab") {
    return (
      <PlanningControlPanel
        payload={payload}
        productionControl={productionControl}
        submitAction={submitAction}
      />
    )
  }

  if (activeTab === "shopFloorStatusTab") {
    return (
      <ShopFloorStatusPanel
        productionControl={productionControl}
        submitAction={submitAction}
      />
    )
  }

  if (activeTab === "shopFloorTasksTab") {
    return (
      <RoleTaskPanel
        productionControl={productionControl}
        submitAction={submitAction}
        role="shopFloor"
      />
    )
  }

  if (activeTab === "machinistTasksTab") {
    return (
      <RoleTaskPanel
        productionControl={productionControl}
        submitAction={submitAction}
        role="machinist"
      />
    )
  }

  if (activeTab === "qualityControlTasksTab") {
    return (
      <RoleTaskPanel
        productionControl={productionControl}
        submitAction={submitAction}
        role="quality"
        onStartFirstPieceInspection={openFirstPieceInspection}
      />
    )
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
    )
  }

  if (activeTab === "correctionsTab") {
    return (
      <CorrectionsPanel
        rows={correctionCandidates}
        submitAction={submitAction}
      />
    )
  }

  return (
    <ProductionControlPanel
      productionControl={productionControl}
      submitAction={submitAction}
    />
  )
}

function UniversalMaintenanceWorkspace({
  payload,
  submitAction,
}: {
  payload: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const [reloadKey, setReloadKey] = useState(0)
  const conventional = usePostgresOperationalPage(
    "/api/dashboard?floor=conventional",
    0,
    undefined,
    0,
    reloadKey
  )
  const conventional02 = usePostgresOperationalPage(
    "/api/dashboard?floor=conventional-02",
    0,
    undefined,
    0,
    reloadKey
  )
  const cnc = usePostgresOperationalPage(
    "/api/dashboard?floor=cnc",
    0,
    undefined,
    0,
    reloadKey
  )
  const forging = usePostgresOperationalPage(
    "/api/dashboard?floor=forging",
    0,
    undefined,
    0,
    reloadKey
  )
  const floorPages = useMemo(
    () =>
      [conventional.data, conventional02.data, cnc.data, forging.data].filter(
        (page): page is DashboardPayload => Boolean(page)
      ),
    [cnc.data, conventional.data, conventional02.data, forging.data]
  )
  const productionControl = useMemo(
    () =>
      combinedMachineMasterProductionControl(
        floorPages.length ? floorPages : [payload]
      ),
    [floorPages, payload]
  )

  async function saveAndReload(path: string, body: Record<string, unknown>) {
    await submitAction(path, body)
    setReloadKey((current) => current + 1)
  }

  return (
    <MaintenancePanel
      productionControl={productionControl}
      submitAction={saveAndReload}
    />
  )
}

function ProductionDashboardPanel({ payload }: { payload: DashboardPayload }) {
  const conventional = usePostgresOperationalPage(
    "/api/dashboard?floor=conventional",
    30_000,
    undefined,
    3_000
  )
  const conventional02 = usePostgresOperationalPage(
    "/api/dashboard?floor=conventional-02",
    30_000,
    undefined,
    3_000
  )
  const cnc = usePostgresOperationalPage(
    "/api/dashboard?floor=cnc",
    30_000,
    undefined,
    3_000
  )
  const forging = usePostgresOperationalPage(
    "/api/dashboard?floor=forging",
    30_000,
    undefined,
    3_000
  )
  const floorPayloads = useMemo(
    () =>
      [
        {
          productionFloorCode: "conventional",
          payload:
            conventional.data ??
            (payload.productionFloorCode === "conventional"
              ? payload
              : undefined),
        },
        {
          productionFloorCode: "conventional-02",
          payload:
            conventional02.data ??
            (payload.productionFloorCode === "conventional-02"
              ? payload
              : undefined),
        },
        {
          productionFloorCode: "cnc",
          payload:
            cnc.data ??
            (payload.productionFloorCode === "cnc" ? payload : undefined),
        },
        {
          productionFloorCode: "forging",
          payload:
            forging.data ??
            (payload.productionFloorCode === "forging" ? payload : undefined),
        },
      ] as const,
    [cnc.data, conventional.data, conventional02.data, forging.data, payload]
  )
  const rows = useMemo(
    () => universalProductionDashboardRows(floorPayloads),
    [floorPayloads]
  )
  const pending = rows.filter(
    (row) => displayValue(row.status) === "Pending"
  ).length
  const dispatched = rows.filter(
    (row) => displayValue(row.status) === "Dispatched"
  ).length
  const rmReceived = rows.filter(
    (row) => displayValue(row.rmReceivedDate) !== "-"
  ).length
  const floorLoadErrors = [
    conventional.error,
    conventional02.error,
    cnc.error,
    forging.error,
  ].filter(Boolean)

  return (
    <section className="grid gap-6">
      <DashboardPageHeader
        description={
          <>
            {formatNumber(rmReceived)} Work Orders Have Received Raw Material.
            Current Probable Dates Recalculate With Live Production Progress.
          </>
        }
        icon={LayoutDashboard}
        title="Production Dashboard"
      />

      <DashboardSection
        description="Work-order volume and dispatch position across every production unit."
        title="Key Performance Indicators"
      >
        <DashboardGrid columns="three">
          <MetricCard
            description="Across all production units"
            icon={<ListChecks aria-hidden="true" />}
            label="Total Work Orders"
            tone="brand"
            value={formatNumber(rows.length)}
          />
          <MetricCard
            description="Awaiting dispatch completion"
            icon={<Activity aria-hidden="true" />}
            label="Pending Dispatch"
            tone={pending ? "warning" : "success"}
            value={formatNumber(pending)}
          />
          <MetricCard
            description="Completed dispatches"
            icon={<CheckCircle2 aria-hidden="true" />}
            label="Dispatched"
            tone="success"
            value={formatNumber(dispatched)}
          />
        </DashboardGrid>
      </DashboardSection>

      <DashboardSection
        description="Current probable dispatch dates based on live production progress."
        title="Operational Detail"
      >
        <DataTableCard
          description="All Production Units In One Dispatch View."
          icon={LayoutDashboard}
          title="Work Order Dispatch Overview"
        >
          <div className="grid gap-4">
            {floorLoadErrors.length ? (
              <div
                className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] px-3 py-2 text-sm text-[var(--color-warning-text)]"
                role="status"
              >
                Some Production Units Could Not Be Loaded. The Table Will Retry
                Automatically.
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-lg border">
              <Table excelFilters>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="min-w-28">JC No.</TableHead>
                    <TableHead className="min-w-32">FG PO No.</TableHead>
                    <TableHead className="min-w-28">Part Code</TableHead>
                    <TableHead className="min-w-36">Production Unit</TableHead>
                    <TableHead className="min-w-28 text-right">
                      Ordered Qty
                    </TableHead>
                    <TableHead className="min-w-20">Unit</TableHead>
                    <TableHead className="min-w-36">RM Received Date</TableHead>
                    <TableHead className="min-w-52">
                      Planned Dispatch Date During RM Receipt
                    </TableHead>
                    <TableHead className="min-w-52">
                      Current Probable Dispatch Date
                    </TableHead>
                    <TableHead className="min-w-28">Status</TableHead>
                    <TableHead className="min-w-36">Dispatched Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length ? (
                    rows.map((row) => (
                      <TableRow
                        key={[
                          displayValue(row.jcNo),
                          displayValue(row.partCode),
                        ].join("-")}
                      >
                        <TableCell>
                          <Link
                            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
                            href={jobCardWorkspaceHref(
                              displayValue(row.jcNo),
                              normalizeProductionFloorCode(
                                row.productionFloorCode
                              )
                            )}
                            title={"Open Job Card " + displayValue(row.jcNo)}
                          >
                            {displayValue(row.jcNo)}
                          </Link>
                        </TableCell>
                        <TableCell>{displayValue(row.fgPoNo)}</TableCell>
                        <TableCell>{displayValue(row.partCode)}</TableCell>
                        <TableCell>
                          {displayValue(row.productionUnit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(Number(row.orderedQty) || 0)}
                        </TableCell>
                        <TableCell>{displayValue(row.unit)}</TableCell>
                        <TableCell>
                          {displayValue(row.rmReceivedDate)}
                        </TableCell>
                        <TableCell>
                          {displayValue(row.plannedDispatchDateAtRmReceipt)}
                        </TableCell>
                        <TableCell>
                          {displayValue(row.currentProbableDispatchDate)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={row.status} />
                        </TableCell>
                        <TableCell>
                          {displayValue(row.dispatchedDate)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        className="h-28 text-center text-sm text-muted-foreground"
                      >
                        No Work Orders Available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DataTableCard>
      </DashboardSection>
    </section>
  )
}

function ProductionControlPanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  return (
    <PlannerDecisionConsole
      productionControl={productionControl}
      submitAction={submitAction}
    />
  )
}

function PlannerDecisionConsole({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const [activeView, setActiveView] = useState<PlannerDecisionView>("new")
  const [activeAction, setActiveAction] =
    useState<PlannerDecisionAction | null>(null)
  const conflicts = asArray(productionControl.plannerActionConflicts)
  const history = asArray(productionControl.plannerActionLog)
  const machineIssues = asArray(productionControl.machineConstraintRows)

  return (
    <PlannerDecisionWorkspace
      activeAction={activeAction}
      activeView={activeView}
      historyCount={history.length}
      pendingCount={conflicts.length}
      onActionChange={setActiveAction}
      onRecalculate={() => void submitAction("reschedule", {})}
      onViewChange={setActiveView}
      panels={{
        priority: (
          <PlannerPriorityForm
            productionControl={productionControl}
            submitAction={submitAction}
          />
        ),
        machineUnavailable: (
          <MachineConstraintPlannerForm
            productionControl={productionControl}
            submitAction={submitAction}
          />
        ),
        machineSwitch: (
          <PartMachineSwitchPlannerForm
            productionControl={productionControl}
            submitAction={submitAction}
          />
        ),
        routeChange: (
          <RouteChangePlannerForm
            productionControl={productionControl}
            submitAction={submitAction}
          />
        ),
        pending: (
          <div className="grid gap-4">
            {conflicts.length ? (
              <PlannerActionConflictPanel
                productionControl={productionControl}
                submitAction={submitAction}
              />
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/10 p-6 text-center">
                <div className="font-medium">
                  No conflicting decisions require review.
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  New conflicts will appear here before they affect the live
                  plan.
                </div>
              </div>
            )}
            <PlannerPendingMachineIssues rows={machineIssues} />
          </div>
        ),
        history: <ActionLogTable rows={history} />,
      }}
    />
  )
}

function MachineConstraintPlannerForm({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const plannedRows = asArray(productionControl.machinePlanDetailRows)
  const machineRows = asArray(productionControl.machinePlanningRows)
  const machineOptions = useMemo(
    () =>
      plannedMachineOptions(
        plannedRows,
        machineBoardRows(machineRows, plannedRows)
      ),
    [machineRows, plannedRows]
  )
  const [machineNo, setMachineNo] = useState("")
  const [unavailableFrom, setUnavailableFrom] = useState("")
  const [unavailableTo, setUnavailableTo] = useState("")
  const [rescheduleAction, setRescheduleAction] = useState("shift_required")
  const [planningMode, setPlanningMode] = useState("system_recalculate")
  const [reason, setReason] = useState("")
  const [reviewReady, setReviewReady] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resolvedMachineConflictIds, setResolvedMachineConflictIds] = useState<
    Set<string>
  >(() => new Set())
  const [queueReviewConfirmed, setQueueReviewConfirmed] = useState(false)
  const [queueAfterByRow, setQueueAfterByRow] = useState<
    Record<string, string>
  >({})
  const affectedRows = useMemo(
    () =>
      machineIssueAffectedRows(plannedRows, {
        machineNo,
        unavailableFrom,
        unavailableTo,
      }),
    [machineNo, plannedRows, unavailableFrom, unavailableTo]
  )
  const queueReviewGroups = useMemo(
    () =>
      machineConstraintQueueReview({
        plannedRows,
        machineRows,
        affectedRows,
        machineNo,
        rescheduleAction,
        includeSameMachineLater: machineKey(rescheduleAction) === "delay",
        includeDownstream: false,
      }),
    [affectedRows, machineNo, machineRows, plannedRows, rescheduleAction]
  )
  const runningRows = affectedRows.filter(machineIssueRowNeedsProducedQty)
  const lockedCount = affectedRows.filter(machineIssueRowIsLocked).length
  const plannedCount = affectedRows.length - lockedCount
  const queueReviewRequired = planningMode === "review_then_plan"
  const movableAffectedRows = useMemo(
    () => machineConstraintMovableRows(affectedRows, rescheduleAction),
    [affectedRows, rescheduleAction]
  )
  const proposedMachineQueuePlacements = useMemo(
    () =>
      machineConstraintQueuePlacements(
        queueReviewGroups,
        movableAffectedRows,
        queueAfterByRow
      ),
    [movableAffectedRows, queueAfterByRow, queueReviewGroups]
  )
  const machineConstraintConflicts = useMemo(
    () =>
      machineConstraintPreSaveConflicts(
        asArray(productionControl.machineConstraintRows),
        {
          machineNo,
          unavailableFrom,
          unavailableTo,
          rescheduleAction,
          planningMode,
          queuePlacements: proposedMachineQueuePlacements,
          resolvedIds: resolvedMachineConflictIds,
        }
      ),
    [
      machineNo,
      planningMode,
      productionControl.machineConstraintRows,
      proposedMachineQueuePlacements,
      resolvedMachineConflictIds,
      rescheduleAction,
      unavailableFrom,
      unavailableTo,
    ]
  )
  const canReview = Boolean(machineNo.trim() && unavailableFrom)
  const canSave =
    canReview &&
    Boolean(reason.trim()) &&
    reviewReady &&
    !machineConstraintConflicts.length &&
    (!queueReviewRequired || queueReviewConfirmed)

  function updateField(
    setter: Dispatch<SetStateAction<string>>,
    value: string
  ) {
    setter(value)
    setReviewReady(false)
    setQueueReviewConfirmed(false)
    setQueueAfterByRow({})
    setResolvedMachineConflictIds(new Set())
  }

  function updatePlanningInput(
    setter: Dispatch<SetStateAction<string>>,
    value: string
  ) {
    setter(value)
    setQueueReviewConfirmed(false)
    setQueueAfterByRow({})
    setResolvedMachineConflictIds(new Set())
  }

  async function reverseMachineConstraintConflict(conflict: DashboardPayload) {
    const targetId = displayValue(conflict.targetId)
    if (!targetId || targetId === "-") return
    await submitAction("reverse-entry", {
      targetTable: "machineConstraints",
      targetId,
      targetKey:
        displayValue(conflict.targetKey) !== "-"
          ? displayValue(conflict.targetKey)
          : "",
      targetLabel:
        displayValue(conflict.targetLabel) !== "-"
          ? displayValue(conflict.targetLabel)
          : "",
      reason: `Planner replacing conflicting machine unavailable action for ${machineNo}`,
      correctedBy: "Planner",
    })
    setResolvedMachineConflictIds((current) => new Set([...current, targetId]))
  }
  async function saveMachineIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewReady) {
      setReviewReady(true)
      return
    }
    if (!canSave || isSubmitting) return
    setIsSubmitting(true)
    try {
      const interruptedSetups = runningRows.map((row) => ({
        jcNo: jobCardNumber(row),
        setupNo: displayValue(row.setupNo),
        machine: machineValue(row, "machine"),
      }))
      const queuePlacements = proposedMachineQueuePlacements
      await submitAction("machine-constraint", {
        machineNo,
        unavailableFrom,
        unavailableTo,
        rescheduleAction,
        planningMode,
        interruptedSetups,
        queuePlacements,
        reason,
        remark: `Reviewed ${affectedRows.length} affected setup rows; ${lockedCount} locked; ${plannedCount} planned; ${runningRows.length} running rows require canonical session handling; ${queueReviewGroups.length} queue review groups; ${queuePlacements.length} queue placements; ${planningMode}`,
      })
      setMachineNo("")
      setUnavailableFrom("")
      setUnavailableTo("")
      setRescheduleAction("shift_required")
      setPlanningMode("system_recalculate")
      setReason("")
      setQueueAfterByRow({})
      setQueueReviewConfirmed(false)
      setReviewReady(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      className="grid gap-3 rounded-xl border bg-background p-3"
      onSubmit={saveMachineIssue}
    >
      <div>
        <div className="text-sm font-medium">Machine Unavailable Details</div>
        <div className="text-xs text-muted-foreground">
          Running Work Uses Its Production Session Output. Planner Actions Never
          Ask For A Second Quantity.
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
        <Field label="Machine Unavailable">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={machineNo}
            required
            onChange={(event) => updateField(setMachineNo, event.target.value)}
          >
            <option value="">Select Machine</option>
            {machineOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SearchableSelect>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={unavailableFrom}
            required
            onChange={(event) =>
              updateField(setUnavailableFrom, event.target.value)
            }
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={unavailableTo}
            onChange={(event) =>
              updateField(setUnavailableTo, event.target.value)
            }
          />
        </Field>
        <Field label="Plan Action">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={rescheduleAction}
            onChange={(event) =>
              updateField(setRescheduleAction, event.target.value)
            }
          >
            <option value="shift_required">Shift Required</option>
            <option value="shift_all">Shift All</option>
            <option value="delay">Delay Plan</option>
          </SearchableSelect>
        </Field>
        <Field label="Planning Confirmation">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={planningMode}
            onChange={(event) =>
              updatePlanningInput(setPlanningMode, event.target.value)
            }
          >
            <option value="system_recalculate">
              System Recalculation (All Planning Rules)
            </option>
            <option value="review_then_plan">Review Queue Before Saving</option>
          </SearchableSelect>
        </Field>
        <Field label="Reason">
          <Input
            value={reason}
            placeholder="Breakdown / Quality Hold"
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
      {reviewReady ? (
        <div className="grid gap-2 rounded-md border bg-muted/15 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatNumber(affectedRows.length)} Affected Setup Rows</span>
            <span>{formatNumber(lockedCount)} Locked On Machine</span>
            <span>{formatNumber(plannedCount)} Planned/Unlocked</span>
            <span>
              {formatNumber(runningRows.length)} Running Session Checks
            </span>
          </div>
          {runningRows.length ? (
            <PlannerSessionSettlementNotice
              mode={
                machineKey(rescheduleAction) === "delay" ? "downtime" : "close"
              }
              rows={runningRows}
              sessionRows={asArray(productionControl.productionCardRows)}
            />
          ) : null}
          {affectedRows.length ? (
            <div className="grid gap-2 @5xl/main:grid-cols-2">
              {affectedRows.map((row, index) => {
                const needsSessionAction = machineIssueRowNeedsProducedQty(row)
                return (
                  <div
                    key={`${jobCardNumber(row)}-${displayValue(row.setupNo)}-${index}`}
                    className="grid gap-2 rounded-md border bg-background p-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {itemCode(row)} / {jobCardNumber(row)} / Setup{" "}
                        {displayValue(row.setupNo)}
                      </div>
                      <StatusBadge
                        value={
                          needsSessionAction
                            ? machineKey(rescheduleAction) === "delay"
                              ? "Downtime required"
                              : "Session close required"
                            : machineIssueRowIsLocked(row)
                              ? "Delay locked setup"
                              : "Shift if alternate exists"
                        }
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {machineValue(row, "machine")} | Order{" "}
                      {displayValue(row.orderPcs, true)} Of{" "}
                      {displayValue(row.totalOrderPcs || row.orderPcs, true)} |
                      Production {displayValue(row.plannedProductionStartDate)}{" "}
                      To {displayValue(row.plannedProductionEndDate)} |{" "}
                      {displayValue(row.runningStatus)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
              No Planned Setup Rows Overlap This Unavailable Window.
            </div>
          )}
          <PlannerPreSaveConflictReview
            conflicts={machineConstraintConflicts}
            title="Conflicting Machine Action Found"
            description="This Machine Action Cannot Be Saved While Another Active Unavailable/Breakdown Decision Overlaps The Same Machine With A Different Action Or Queue Choice."
            onKeepExisting={() => {
              setReviewReady(false)
              setQueueReviewConfirmed(false)
            }}
            onReverseExisting={reverseMachineConstraintConflict}
          />
          {queueReviewRequired ? (
            <>
              <MachineConstraintQueueReviewPanel
                groups={queueReviewGroups}
                movableRows={movableAffectedRows}
                queueAfterByRow={queueAfterByRow}
                onQueueAfterChange={(rowKey, value) =>
                  setQueueAfterByRow((current) => {
                    const next = { ...current }
                    if (value) next[rowKey] = value
                    else delete next[rowKey]
                    return next
                  })
                }
              />
              <label className="flex items-start gap-2 rounded-md border bg-background p-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={queueReviewConfirmed}
                  onChange={(event) =>
                    setQueueReviewConfirmed(event.target.checked)
                  }
                />
                <span>
                  Queue Reviewed; Save This Breakdown And Recalculate Planning.
                </span>
              </label>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          className="w-fit"
          type="submit"
          disabled={!canReview || isSubmitting || (reviewReady && !canSave)}
        >
          <Wrench className="size-4" />
          {reviewReady
            ? queueReviewRequired
              ? "Save After Queue Review"
              : "Save And Replan Remaining Qty"
            : "Review Affected Queue"}
        </Button>
        {reviewReady ? (
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => {
              setReviewReady(false)
              setQueueReviewConfirmed(false)
            }}
          >
            Recheck Inputs
          </Button>
        ) : null}
      </div>
    </form>
  )
}
function PartMachineSwitchPlannerForm({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const plannedRows = asArray(productionControl.machinePlanDetailRows)
  const machineRows = asArray(productionControl.machinePlanningRows)
  const itemOptions = useMemo(
    () =>
      uniqueValues(
        plannedRows.map((row) => itemCode(row)).filter((value) => value !== "-")
      ),
    [plannedRows]
  )
  const [selectedItem, setSelectedItem] = useState("")
  const [target, setTarget] = useState("")
  const [setupNo, setSetupNo] = useState("")
  const [fromMachine, setFromMachine] = useState("")
  const [toMachine, setToMachine] = useState("")
  const [reason, setReason] = useState("")
  const [reviewReady, setReviewReady] = useState(false)
  const [queueReviewConfirmed, setQueueReviewConfirmed] = useState(false)
  const [queueAfterByRow, setQueueAfterByRow] = useState<
    Record<string, string>
  >({})
  const [selectedTargetInterruptions, setSelectedTargetInterruptions] =
    useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resolvedConflictIds, setResolvedConflictIds] = useState<Set<string>>(
    () => new Set()
  )
  const jobCardOptions = useMemo(
    () =>
      uniqueValues(
        plannedRows
          .filter(
            (row) => machineKey(itemCode(row)) === machineKey(selectedItem)
          )
          .map((row) => jobCardNumber(row))
          .filter((value) => value !== "-")
      ),
    [plannedRows, selectedItem]
  )
  const setupOptions = useMemo(
    () =>
      uniqueValues(
        plannedRows
          .filter((row) => partMachineSwitchTargetMatches(row, target))
          .map((row) => displayValue(row.setupNo))
          .filter((value) => value !== "-")
      ),
    [plannedRows, target]
  )
  const fromMachineOptions = useMemo(
    () =>
      uniqueValues(
        plannedRows
          .filter((row) => partMachineSwitchTargetMatches(row, target))
          .filter(
            (row) =>
              !setupNo.trim() ||
              machineKey(displayValue(row.setupNo)) === machineKey(setupNo)
          )
          .map((row) => machineValue(row, "machine"))
          .filter((value) => value !== "-")
      ),
    [plannedRows, setupNo, target]
  )
  const selectedRows = useMemo(
    () =>
      partMachineSwitchAffectedRows(plannedRows, {
        target,
        setupNo,
        fromMachine,
      }),
    [fromMachine, plannedRows, setupNo, target]
  )
  const targetMachineOptions = useMemo(
    () =>
      compatibleDestinationMachineOptions({
        affectedRows: selectedRows,
        machineRows,
        plannedRows,
        sourceMachine: fromMachine,
      }),
    [fromMachine, machineRows, plannedRows, selectedRows]
  )
  const runningRows = selectedRows.filter(machineIssueRowNeedsProducedQty)
  const queueReviewGroups = useMemo(
    () =>
      machineConstraintQueueReview({
        plannedRows,
        machineRows,
        affectedRows: selectedRows,
        machineNo: fromMachine,
        rescheduleAction: "shift_required",
        explicitDestinationMachines: toMachine.trim() ? [toMachine] : [],
        includeSameMachineLater: false,
        includeDownstream: false,
      }),
    [fromMachine, machineRows, plannedRows, selectedRows, toMachine]
  )
  const proposedQueuePlacements = useMemo(
    () =>
      machineConstraintQueuePlacements(
        queueReviewGroups,
        selectedRows,
        queueAfterByRow
      ),
    [queueAfterByRow, queueReviewGroups, selectedRows]
  )
  const switchConflicts = useMemo(
    () =>
      partMachineSwitchPreSaveConflicts(
        asArray(productionControl.planOverrideRows),
        {
          target,
          setupNo,
          selectedItem,
          toMachine,
          queuePlacements: proposedQueuePlacements,
          resolvedIds: resolvedConflictIds,
        }
      ),
    [
      productionControl.planOverrideRows,
      proposedQueuePlacements,
      resolvedConflictIds,
      selectedItem,
      setupNo,
      target,
      toMachine,
    ]
  )
  const targetInterruptionRows = useMemo(
    () =>
      partMachineSwitchTargetInterruptionRows(queueReviewGroups, selectedRows),
    [queueReviewGroups, selectedRows]
  )
  const canReview =
    Boolean(
      selectedItem.trim() &&
      target.trim() &&
      setupNo.trim() &&
      fromMachine.trim() &&
      toMachine.trim()
    ) && machineKey(fromMachine) !== machineKey(toMachine)
  const canSave =
    canReview &&
    Boolean(reason.trim()) &&
    reviewReady &&
    selectedRows.length > 0 &&
    !switchConflicts.length &&
    queueReviewConfirmed

  function updateField(
    setter: Dispatch<SetStateAction<string>>,
    value: string
  ) {
    setter(value)
    setReviewReady(false)
    setQueueReviewConfirmed(false)
    setQueueAfterByRow({})
    setSelectedTargetInterruptions({})
    setResolvedConflictIds(new Set())
  }

  async function reverseSwitchConflict(conflict: DashboardPayload) {
    const targetId = displayValue(conflict.targetId)
    if (!targetId || targetId === "-" || isSubmitting) return
    setIsSubmitting(true)
    try {
      await submitAction("reverse-entry", {
        targetTable: "planOverrides",
        targetId,
        targetKey:
          displayValue(conflict.targetKey) !== "-"
            ? displayValue(conflict.targetKey)
            : "",
        targetLabel:
          displayValue(conflict.targetLabel) !== "-"
            ? displayValue(conflict.targetLabel)
            : "",
        reason: `Planner replacing conflicting machine switch with ${target} setup ${setupNo} to ${toMachine}`,
        correctedBy: "Planner",
      })
      setResolvedConflictIds((current) => new Set([...current, targetId]))
    } finally {
      setIsSubmitting(false)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewReady) {
      setReviewReady(true)
      return
    }
    if (!canSave || isSubmitting) return
    setIsSubmitting(true)
    try {
      const sourceInterruptions = runningRows.map((row) => ({
        jcNo: jobCardNumber(row),
        setupNo: displayValue(row.setupNo),
        machine: machineValue(row, "machine"),
      }))
      const targetInterruptions = targetInterruptionRows
        .filter((row) => selectedTargetInterruptions[machineIssueRowKey(row)])
        .map((row) => ({
          jcNo: jobCardNumber(row),
          setupNo: displayValue(row.setupNo),
          machine: machineValue(row, "machine"),
        }))
      const interruptedSetups = [...sourceInterruptions, ...targetInterruptions]
      const queuePlacements = proposedQueuePlacements
      await submitAction("plan-override", {
        target,
        setupNo,
        fromMachine,
        toMachine,
        interruptedSetups,
        queuePlacements,
        reason,
      })
      setSelectedItem("")
      setTarget("")
      setSetupNo("")
      setFromMachine("")
      setToMachine("")
      setReason("")
      setQueueAfterByRow({})
      setSelectedTargetInterruptions({})
      setResolvedConflictIds(new Set())
      setReviewReady(false)
      setQueueReviewConfirmed(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      className="grid gap-3 rounded-xl border bg-background p-3"
      onSubmit={submit}
    >
      <div>
        <div className="text-sm font-medium">Move Setup Details</div>
        <div className="text-xs text-muted-foreground">
          Move Only The Selected Part/Setup To Another Machine After Reviewing
          That Target Queue And Downstream Wip Queues.
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
        <Field label="Item Code">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={selectedItem}
            required
            onChange={(event) => {
              updateField(setSelectedItem, event.target.value)
              setTarget("")
              setSetupNo("")
              setFromMachine("")
              setToMachine("")
            }}
          >
            <option value="">Select Item</option>
            {itemOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SearchableSelect>
        </Field>
        <Field label="Job Card">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={target}
            required
            onChange={(event) => {
              updateField(setTarget, event.target.value)
              setSetupNo("")
              setFromMachine("")
              setToMachine("")
            }}
          >
            <option value="">Select Job Card</option>
            {jobCardOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SearchableSelect>
        </Field>
        <Field label="Setup No.">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={setupNo}
            required
            onChange={(event) => {
              updateField(setSetupNo, event.target.value)
              setFromMachine("")
              setToMachine("")
            }}
          >
            <option value="">Select Setup</option>
            {setupOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SearchableSelect>
        </Field>
        <Field label="From Machine">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={fromMachine}
            required
            onChange={(event) => {
              updateField(setFromMachine, event.target.value)
              setToMachine("")
            }}
          >
            <option value="">Select Source Machine</option>
            {fromMachineOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SearchableSelect>
        </Field>
        <Field label="Plan On Machine">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={toMachine}
            required
            onChange={(event) => updateField(setToMachine, event.target.value)}
          >
            <option value="">Select Target Machine</option>
            {targetMachineOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SearchableSelect>
        </Field>
        <Field label="Reason">
          <Input
            value={reason}
            placeholder="Planner Approved Machine Switch"
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
      {reviewReady ? (
        <div className="grid gap-2 rounded-md border bg-muted/15 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatNumber(selectedRows.length)} Selected Setup Rows</span>
            <span>
              {displayValue(fromMachine)} To {displayValue(toMachine)}
            </span>
            <span>
              {formatNumber(runningRows.length)} Source Session Checks
            </span>
            <span>
              {formatNumber(targetInterruptionRows.length)} Target Running
              Blockers
            </span>
          </div>
          {runningRows.length ? (
            <PlannerSessionSettlementNotice
              mode="close"
              rows={runningRows}
              sessionRows={asArray(productionControl.productionCardRows)}
            />
          ) : null}
          {selectedRows.length ? (
            <div className="grid gap-2 @5xl/main:grid-cols-2">
              {selectedRows.map((row, index) => {
                const needsSessionClose = machineIssueRowNeedsProducedQty(row)
                return (
                  <div
                    key={`${jobCardNumber(row)}-${displayValue(row.setupNo)}-${machineValue(row, "machine")}-${index}`}
                    className="grid gap-2 rounded-md border bg-background p-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {itemCode(row)} / {jobCardNumber(row)} / Setup{" "}
                        {displayValue(row.setupNo)}
                      </div>
                      <StatusBadge
                        value={
                          needsSessionClose
                            ? "Session close required"
                            : "Selected setup"
                        }
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {machineValue(row, "machine")} | Order{" "}
                      {displayValue(row.orderPcs, true)} Of{" "}
                      {displayValue(row.totalOrderPcs || row.orderPcs, true)} |
                      Production {displayValue(row.plannedProductionStartDate)}{" "}
                      To {displayValue(row.plannedProductionEndDate)} |{" "}
                      {displayValue(row.runningStatus)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
              No Planned Setup Row Matches This Job Card/Part, Setup Number, And
              Source Machine.
            </div>
          )}
          {targetInterruptionRows.length ? (
            <div className="grid gap-2 rounded-md border bg-background p-3">
              <div>
                <div className="text-sm font-medium">
                  Target Machine Running Setup
                </div>
                <div className="text-xs text-muted-foreground">
                  Choose Whether To Stop It. If Selected, Close Its Production
                  Session Normally Before Saving.
                </div>
              </div>
              {targetInterruptionRows.map((row) => {
                const rowKey = machineIssueRowKey(row)
                const selected = Boolean(selectedTargetInterruptions[rowKey])
                return (
                  <div
                    key={rowKey}
                    className="grid gap-2 rounded-md border bg-muted/10 p-2 md:grid-cols-[1fr_auto] md:items-end"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {itemCode(row)} / {jobCardNumber(row)} / Setup{" "}
                        {displayValue(row.setupNo)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {machineValue(row, "machine")} | Production{" "}
                        {displayValue(row.plannedProductionStartDate)} To{" "}
                        {displayValue(row.plannedProductionEndDate)} |{" "}
                        {displayValue(row.runningStatus)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={selected ? "default" : "outline"}
                        onClick={() =>
                          setSelectedTargetInterruptions((current) => ({
                            ...current,
                            [rowKey]: !selected,
                          }))
                        }
                      >
                        {selected
                          ? "Stop Selected"
                          : "Do Not Stop / Click To Stop"}
                      </Button>
                      {selected ? (
                        <StatusBadge value="Session close required" />
                      ) : null}
                    </div>
                  </div>
                )
              })}
              {targetInterruptionRows.some(
                (row) => selectedTargetInterruptions[machineIssueRowKey(row)]
              ) ? (
                <PlannerSessionSettlementNotice
                  mode="close"
                  rows={targetInterruptionRows.filter(
                    (row) =>
                      selectedTargetInterruptions[machineIssueRowKey(row)]
                  )}
                  sessionRows={asArray(productionControl.productionCardRows)}
                />
              ) : null}
            </div>
          ) : null}
          <MachineConstraintQueueReviewPanel
            groups={queueReviewGroups}
            movableRows={selectedRows}
            queueAfterByRow={queueAfterByRow}
            onQueueAfterChange={(rowKey, value) =>
              setQueueAfterByRow((current) => {
                const next = { ...current }
                if (value) next[rowKey] = value
                else delete next[rowKey]
                return next
              })
            }
          />
          {switchConflicts.length ? (
            <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <div className="text-sm font-medium text-destructive">
                  Conflicting Planner Action Found
                </div>
                <div className="text-xs text-muted-foreground">
                  This Switch Cannot Be Saved While Another Active Switch Exists
                  For The Same Setup With A Different Target Or Queue Position.
                </div>
              </div>
              {switchConflicts.map((conflict, index) => (
                <div
                  key={`${displayValue(conflict.targetId)}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {displayValue(conflict.targetLabel)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {displayValue(conflict.targetKey)} |{" "}
                      {displayValue(conflict.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => {
                        setReviewReady(false)
                        setQueueReviewConfirmed(false)
                      }}
                    >
                      Keep Existing
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => void reverseSwitchConflict(conflict)}
                    >
                      <Undo2 className="size-4" />
                      Reverse Existing
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
              onChange={(event) =>
                setQueueReviewConfirmed(event.target.checked)
              }
            />
            <span>
              Queue Reviewed; Save This Part-Specific Machine Switch And
              Recalculate Planning.
            </span>
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          className="w-fit"
          type="submit"
          disabled={!canReview || isSubmitting || (reviewReady && !canSave)}
        >
          <Route className="size-4" />
          {reviewReady ? "Save Machine Switch" : "Review Switch Queue"}
        </Button>
        {reviewReady ? (
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => {
              setReviewReady(false)
              setQueueReviewConfirmed(false)
            }}
          >
            Recheck Inputs
          </Button>
        ) : null}
      </div>
    </form>
  )
}
function MachineConstraintQueueReviewPanel({
  groups,
  movableRows = [],
  queueAfterByRow = {},
  onQueueAfterChange,
}: {
  groups: MachineConstraintQueueReviewGroup[]
  movableRows?: DashboardPayload[]
  queueAfterByRow?: Record<string, string>
  onQueueAfterChange?: (rowKey: string, value: string) => void
}) {
  const destinationGroups = groups.filter(
    (group) => group.kind === "destination"
  )
  const defaultDestinationMachine = destinationGroups[0]?.machine ?? ""
  const canPlaceTiles = Boolean(
    onQueueAfterChange && movableRows.length && destinationGroups.length
  )

  return (
    <div className="grid gap-2 rounded-md border border-dashed bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Replanned Queue Review</div>
          {canPlaceTiles ? (
            <div className="text-xs text-muted-foreground">
              Drag Each Affected Setup Tile To The Planned Position Before
              Saving.
            </div>
          ) : null}
        </div>
        <StatusBadge value={`${formatNumber(groups.length)} queue groups`} />
      </div>
      {groups.length ? (
        <div className="grid gap-2">
          {groups.map((group) => (
            <div
              key={`${group.kind}-${group.machine}`}
              className="grid gap-2 rounded-md border bg-muted/10 p-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{group.title}</div>
                <StatusBadge
                  value={
                    group.kind === "destination"
                      ? "Destination queue"
                      : group.kind === "downstream"
                        ? "Downstream WIP queue"
                        : "Same machine queue"
                  }
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {group.description}
              </div>
              {canPlaceTiles &&
              group.kind === "destination" &&
              onQueueAfterChange ? (
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
        <div className="rounded-md border border-dashed bg-background p-2 text-sm text-muted-foreground">
          No Destination Or Downstream Queues Were Identified From The Current
          Plan.
        </div>
      )}
    </div>
  )
}

function MachineConstraintQueuePlacementBoard({
  group,
  movableRows,
  queueAfterByRow,
  defaultDestinationMachine,
  onQueueAfterChange,
}: {
  group: MachineConstraintQueueReviewGroup
  movableRows: DashboardPayload[]
  queueAfterByRow: Record<string, string>
  defaultDestinationMachine: string
  onQueueAfterChange: (rowKey: string, value: string) => void
}) {
  const groupMachineKey = machineKey(group.machine)
  const movableKeys = new Set(movableRows.map(machineIssueRowKey))
  const placedRows = movableRows.filter((row) => {
    const placement = machineConstraintPlacementParts(
      queueAfterByRow[machineIssueRowKey(row)],
      defaultDestinationMachine
    )
    return placement.machineKey === groupMachineKey
  })
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function placeRow(rowKey: string, index: number) {
    const boundedIndex = Math.max(0, Math.min(index, group.rows.length))
    const afterKey =
      boundedIndex > 0
        ? machineConstraintQueueRowKey(group.rows[boundedIndex - 1]!)
        : ""
    onQueueAfterChange(
      rowKey,
      machineConstraintPlacementValue(group.machine, afterKey)
    )
  }

  function allowDrop(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }

  function dropMoveTile(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    const sourceKey = event.dataTransfer.getData("text/plain")
    setDragOverIndex(null)
    if (!sourceKey || !movableKeys.has(sourceKey)) return
    placeRow(sourceKey, index)
  }

  return (
    <div className="grid gap-1 rounded-md border bg-background p-2">
      {Array.from({ length: group.rows.length + 1 }, (_, index) => {
        const slotRows = placedRows.filter(
          (row) =>
            machineConstraintQueuePlacementIndex(
              group.rows,
              machineConstraintPlacementParts(
                queueAfterByRow[machineIssueRowKey(row)],
                defaultDestinationMachine
              ).afterKey
            ) === index
        )
        const slotPreviewWindows = machineConstraintSlotPreviewWindows(
          group.rows,
          slotRows,
          index
        )
        return (
          <Fragment key={`${group.machine}-slot-${index}`}>
            <PriorityQueueDropZone
              active={dragOverIndex === index}
              current={slotRows.length > 0}
              label={machineConstraintQueueDropLabel(index, group.rows)}
              onClick={() => undefined}
              onDragOver={(event) => allowDrop(event, index)}
              onDragLeave={() =>
                setDragOverIndex((current) =>
                  current === index ? null : current
                )
              }
              onDrop={(event) => dropMoveTile(event, index)}
            />
            {slotRows.map((row) => (
              <MachineConstraintMoveTile
                key={`${group.machine}-${machineIssueRowKey(row)}`}
                row={row}
                targetMachine={group.machine}
                previewWindow={slotPreviewWindows.get(machineIssueRowKey(row))}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData(
                    "text/plain",
                    machineIssueRowKey(row)
                  )
                }}
                onDragEnd={() => setDragOverIndex(null)}
              />
            ))}
            {index < group.rows.length ? (
              <MachineConstraintQueueRowTile row={group.rows[index]!} />
            ) : null}
          </Fragment>
        )
      })}
    </div>
  )
}

function machineConstraintSlotPreviewWindows(
  rows: DashboardPayload[],
  slotRows: DashboardPayload[],
  slotIndex: number
) {
  const windows = new Map<string, { startDate: string; endDate: string }>()
  let nextStart =
    slotIndex > 0
      ? nextCalendarDateLabelForReview(
          rows[slotIndex - 1]?.plannedProductionEndDate ||
            rows[slotIndex - 1]?.setupPlannedDate ||
            rows[slotIndex - 1]?.plannedDate
        )
      : ""

  for (const row of slotRows) {
    const originalStart = parseReviewDateLabel(
      row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate
    )
    const originalEnd = parseReviewDateLabel(
      row.plannedProductionEndDate ||
        row.plannedProductionStartDate ||
        row.setupPlannedDate ||
        row.plannedDate
    )
    const durationDays =
      originalStart && originalEnd
        ? Math.max(
            1,
            Math.round(
              (originalEnd.getTime() - originalStart.getTime()) / 86400000
            ) + 1
          )
        : 1
    const startDate =
      nextStart ||
      displayValue(
        row.plannedProductionStartDate ||
          row.setupPlannedDate ||
          row.plannedDate
      )
    const endDate =
      addCalendarDaysLabelForReview(startDate, durationDays - 1) ||
      displayValue(
        row.plannedProductionEndDate ||
          row.plannedProductionStartDate ||
          row.setupPlannedDate ||
          row.plannedDate
      )
    windows.set(machineIssueRowKey(row), { startDate, endDate })
    nextStart = nextCalendarDateLabelForReview(endDate)
  }

  return windows
}

function nextCalendarDateLabelForReview(value: unknown) {
  return addCalendarDaysLabelForReview(value, 1)
}

function addCalendarDaysLabelForReview(value: unknown, days: number) {
  const date = parseReviewDateLabel(value)
  if (!date) return ""
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return formatReviewDateLabel(next)
}

function parseReviewDateLabel(value: unknown) {
  const textValue = str(value)
  if (!textValue || textValue === "-") return undefined
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(textValue)
  if (iso?.[1] && iso[2] && iso[3])
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const dashboard = /^(\d{1,2})-([A-Za-z]+)-(\d{2,4})$/.exec(textValue)
  if (dashboard?.[1] && dashboard[2] && dashboard[3]) {
    const month = reviewMonthNumber(dashboard[2])
    const year = Number(
      dashboard[3].length === 2 ? `20${dashboard[3]}` : dashboard[3]
    )
    if (month) return new Date(year, month - 1, Number(dashboard[1]))
  }
  const parsed = new Date(textValue)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function formatReviewDateLabel(date: Date) {
  const month =
    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][date.getMonth()] ?? ""
  return `${date.getDate()}-${month}-${String(date.getFullYear()).slice(-2)}`
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
  }
  return months[value.toLowerCase()] ?? 0
}
function MachineConstraintMoveTile({
  row,
  targetMachine,
  previewWindow,
  onDragStart,
  onDragEnd,
}: {
  row: DashboardPayload
  targetMachine: string
  previewWindow?: { startDate: string; endDate: string }
  onDragStart: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
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
        <div className="text-sm font-semibold">
          {itemCode(row)} / {jobCardNumber(row)} / Setup{" "}
          {displayValue(row.setupNo)}
        </div>
        <div className="text-xs text-muted-foreground">
          Move Remaining/Planned Quantity To {targetMachine} | Current{" "}
          {machineValue(row, "machine")} | Preview{" "}
          {displayValue(
            previewWindow?.startDate || row.plannedProductionStartDate
          )}{" "}
          To{" "}
          {displayValue(previewWindow?.endDate || row.plannedProductionEndDate)}
        </div>
      </div>
      <Badge>Move</Badge>
    </div>
  )
}

function MachineConstraintQueueRowTile({ row }: { row: DashboardPayload }) {
  return (
    <div className="grid gap-1 rounded border bg-background px-2 py-1">
      <div className="text-xs font-medium">
        {itemCode(row)} / {jobCardNumber(row)} / Setup{" "}
        {displayValue(row.setupNo)}
      </div>
      <div className="text-xs text-muted-foreground">
        {machineValue(row, "machine")} | Order{" "}
        {displayValue(row.orderPcs, true)} Of{" "}
        {displayValue(row.totalOrderPcs || row.orderPcs, true)} | Production{" "}
        {displayValue(row.plannedProductionStartDate)} To{" "}
        {displayValue(row.plannedProductionEndDate)} |{" "}
        {displayValue(row.runningStatus)}
      </div>
    </div>
  )
}

function MachineConstraintStaticQueueRows({
  group,
}: {
  group: MachineConstraintQueueReviewGroup
}) {
  return group.rows.length ? (
    <div className="grid gap-1">
      {group.rows.map((row, index) => (
        <MachineConstraintQueueRowTile
          key={`${group.machine}-${jobCardNumber(row)}-${displayValue(row.setupNo)}-${index}`}
          row={row}
        />
      ))}
    </div>
  ) : (
    <div className="rounded border border-dashed bg-background px-2 py-1 text-xs text-muted-foreground">
      {group.emptyMessage || "No current planned rows in this queue."}
    </div>
  )
}
function PlannerActionConflictPanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const conflicts = asArray(productionControl.plannerActionConflicts)
  const [resolvingKey, setResolvingKey] = useState("")
  if (!conflicts.length) return null

  async function keepChoice(
    conflict: DashboardPayload,
    choice: DashboardPayload
  ) {
    const choices = asArray(conflict.choices)
    const keepId = displayValue(choice.targetId)
    if (!keepId || keepId === "-") return
    setResolvingKey(
      `${displayValue(conflict.jcNo)}-${displayValue(conflict.setupNo)}-${keepId}`
    )
    try {
      for (const other of choices) {
        const targetId = displayValue(other.targetId)
        if (!targetId || targetId === "-" || targetId === keepId) continue
        await submitAction("reverse-entry", {
          targetTable:
            displayValue(other.targetTable) !== "-"
              ? displayValue(other.targetTable)
              : "planOverrides",
          targetId,
          targetKey:
            displayValue(other.targetKey) !== "-"
              ? displayValue(other.targetKey)
              : "",
          targetLabel:
            displayValue(other.targetLabel) !== "-"
              ? displayValue(other.targetLabel)
              : "",
          reason: `Planner resolved conflicting machine switch and kept ${displayValue(choice.targetLabel)}`,
          correctedBy: "Planner",
        })
      }
    } finally {
      setResolvingKey("")
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <div>
        <div className="text-sm font-semibold text-destructive">
          Planner Action Conflicts
        </div>
        <div className="text-xs text-muted-foreground">
          Choose Which Active Planner Decision Should Remain. Other Conflicting
          Switch Rows Will Be Reversed With History Preserved.
        </div>
      </div>
      {conflicts.map((conflict, index) => (
        <div
          key={`${displayValue(conflict.jcNo)}-${displayValue(conflict.setupNo)}-${index}`}
          className="grid gap-2 rounded-md border bg-background p-3"
        >
          <div className="text-sm font-medium">
            {displayValue(conflict.message)}
          </div>
          <div className="text-xs text-muted-foreground">
            {displayValue(conflict.partCode)} / {displayValue(conflict.jcNo)} /
            Setup {displayValue(conflict.setupNo)}
          </div>
          <div className="flex flex-wrap gap-2">
            {asArray(conflict.choices).map((choice, choiceIndex) => {
              const key = `${displayValue(conflict.jcNo)}-${displayValue(conflict.setupNo)}-${displayValue(choice.targetId)}`
              return (
                <Button
                  key={`${displayValue(choice.targetId)}-${choiceIndex}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void keepChoice(conflict, choice)}
                  disabled={Boolean(resolvingKey)}
                >
                  <CheckCircle2 className="size-4" />
                  {resolvingKey === key
                    ? "Resolving"
                    : displayValue(choice.targetLabel)}
                </Button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function PlannerPendingMachineIssues({ rows }: { rows: DashboardPayload[] }) {
  return (
    <div className="grid gap-2">
      {rows.length ? (
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-sm font-medium">
            Active machine issues are context only
          </div>
          <div className="text-xs text-muted-foreground">
            These decisions are already saved. They are shown here only to
            explain machine constraints while resolving a pending conflict.
          </div>
        </div>
      ) : null}
      <DataRowsCard
        title="Active Machine Issues"
        rows={plannerPendingMachineIssueRows(rows)}
        empty="No active machine constraints"
      />
    </div>
  )
}

function PlannerPreSaveConflictReview({
  conflicts,
  title,
  description,
  onKeepExisting,
  onReverseExisting,
}: {
  conflicts: DashboardPayload[]
  title: string
  description: string
  onKeepExisting: () => void
  onReverseExisting: (conflict: DashboardPayload) => void | Promise<void>
}) {
  if (!conflicts.length) return null
  return (
    <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div>
        <div className="text-sm font-medium text-destructive">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {conflicts.map((conflict, index) => (
        <div
          key={`${displayValue(conflict.targetId)}-${index}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2"
        >
          <div>
            <div className="text-sm font-medium">
              {displayValue(conflict.targetLabel)}
            </div>
            <div className="text-xs text-muted-foreground">
              {displayValue(conflict.targetKey)} |{" "}
              {displayValue(conflict.createdAt)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onKeepExisting}
            >
              Keep Existing
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onReverseExisting(conflict)}
            >
              <Undo2 className="size-4" />
              Reverse Existing
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function PlannerSessionSettlementNotice({
  mode,
  rows,
  sessionRows,
}: {
  mode: "close" | "downtime"
  rows: DashboardPayload[]
  sessionRows: DashboardPayload[]
}) {
  const sessions = rows
    .flatMap((row) => {
      const session = plannerOpenSessionForRow(sessionRows, row)
      return session ? [session] : []
    })
    .filter(
      (session, index, all) =>
        all.findIndex((candidate) => str(candidate.id) === str(session.id)) ===
        index
    )
  const actionLabel = mode === "close" ? "Close session" : "Start downtime"
  return (
    <div className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">
            Production Session Action Required
          </div>
          <div className="text-xs">
            {mode === "close"
              ? "Close running work through its Weight or Machine Counter form. Saved good pieces will update the Production Entry and Job Card; do not enter output again here."
              : "Keep the session open and start downtime at the actual interruption time before saving this same-machine delay."}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const params = new URLSearchParams({
              floor: productionFloorFromLocation(),
            })
            window.open(
              `/dashboard/production-sessions?${params.toString()}`,
              "_blank",
              "noopener,noreferrer"
            )
          }}
        >
          <Activity className="size-4" />
          Open Production Sessions
        </Button>
      </div>
      <div className="grid gap-1 text-xs">
        {sessions.length ? (
          sessions.map((session) => (
            <div
              key={str(session.id)}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-background px-2 py-1.5 text-foreground dark:border-amber-900"
            >
              <span>
                {displayValue(session.sessionReference || session.id)} ·{" "}
                {displayValue(session.machineNumber || session.machine)} ·{" "}
                {displayValue(
                  session.jobCardNumber || session.jobCard || session.jcNo
                )}{" "}
                / Setup {displayValue(session.setupNumber || session.setupNo)}
              </span>
              <StatusBadge
                value={`${actionLabel} · ${displayValue(session.measurementMethod)}`}
              />
            </div>
          ))
        ) : (
          <div>
            Open Production Sessions, complete the required action for the
            running machine, then retry Save. The server checks the live session
            before applying the planner decision.
          </div>
        )}
      </div>
    </div>
  )
}

function plannerOpenSessionForRow(
  sessionRows: DashboardPayload[],
  row: DashboardPayload
) {
  return sessionRows.find(
    (session) =>
      str(session.status).toLowerCase() === "open" &&
      sameProductionCardText(
        session.machineNumber || session.machine,
        row.machineNumber || row.machine
      ) &&
      sameProductionCardText(
        session.jobCardNumber || session.jobCard || session.jcNo,
        row.jobCardNumber || row.jobCard || row.jcNo
      ) &&
      sameProductionCardText(
        session.setupNumber || session.setupNo,
        row.setupNumber || row.setupNo
      )
  )
}

function PlannerPriorityForm({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const workOrders = asArray(productionControl.workOrders)
  const itemOptions = useMemo(
    () =>
      uniqueValues(workOrders.map(itemCode).filter((value) => value !== "-")),
    [workOrders]
  )
  const [partCode, setPartCode] = useState("")
  const [jcNo, setJcNo] = useState("")
  const [priority, setPriority] = useState("High")
  const [remark, setRemark] = useState("")
  const [planReady, setPlanReady] = useState(false)
  const [selectedInterruptions, setSelectedInterruptions] = useState<
    Record<string, boolean>
  >({})
  const [queueAfterByStep, setQueueAfterByStep] = useState<
    Record<string, string>
  >({})
  const [confirmedPrioritySteps, setConfirmedPrioritySteps] = useState<
    Record<string, boolean>
  >({})
  const [resolvedPriorityConflictIds, setResolvedPriorityConflictIds] =
    useState<Set<string>>(() => new Set())
  const jobCardOptions = useMemo(
    () =>
      uniqueValues(
        workOrders
          .filter(
            (row) =>
              !partCode || machineKey(itemCode(row)) === machineKey(partCode)
          )
          .map(jobCardNumber)
          .filter((value) => value !== "-")
      ),
    [partCode, workOrders]
  )
  const selectedPart = partCode || itemOptions[0] || ""
  const selectedJc = jcNo && jobCardOptions.includes(jcNo) ? jcNo : ""
  const priorityPlan = useMemo(
    () => priorityChangePlan(productionControl, selectedPart, selectedJc),
    [productionControl, selectedPart, selectedJc]
  )
  const priorityStepWindows = useMemo(
    () =>
      priorityPlanStepWindows(
        priorityPlan.steps,
        selectedInterruptions,
        queueAfterByStep
      ),
    [priorityPlan.steps, selectedInterruptions, queueAfterByStep]
  )
  const selectedBlockers = priorityPlan.steps
    .flatMap((step) => step.blockers)
    .filter((blocker) => selectedInterruptions[blocker.key])
  const confirmedSteps = priorityPlan.steps.filter(
    (step) => confirmedPrioritySteps[step.key]
  )
  const firstUnconfirmedStepIndex = priorityPlan.steps.findIndex(
    (step) => !confirmedPrioritySteps[step.key]
  )
  const allStepsConfirmed =
    priorityPlan.steps.length > 0 && firstUnconfirmedStepIndex === -1
  const activeStepIndex = allStepsConfirmed ? -1 : firstUnconfirmedStepIndex
  const activePriorityStep =
    activeStepIndex >= 0 ? priorityPlan.steps[activeStepIndex] : undefined
  const confirmedWindows = confirmedSteps
    .map((step) => priorityStepWindows.get(step.key))
    .filter((window): window is PriorityPlanWindow => Boolean(window))
  const itemPlanWindow =
    allStepsConfirmed && confirmedWindows.length
      ? {
          startDate: confirmedWindows[0]?.startDate ?? "",
          endDate: confirmedWindows.at(-1)?.endDate ?? "",
        }
      : undefined
  const priorityConflicts = useMemo(
    () =>
      plannerPriorityPreSaveConflicts(
        asArray(productionControl.plannerActionLog).filter(
          (row) => displayValue(row.actionType) === "Priority"
        ),
        {
          target: selectedJc || selectedPart,
          jcNo: selectedJc,
          partCode: selectedPart,
          priority,
          queueBeforeSetups: priorityPlanQueueBeforeSetups(
            priorityPlan.steps,
            queueAfterByStep
          ),
          resolvedIds: resolvedPriorityConflictIds,
        }
      ),
    [
      productionControl.plannerActionLog,
      priority,
      priorityPlan.steps,
      queueAfterByStep,
      resolvedPriorityConflictIds,
      selectedJc,
      selectedPart,
    ]
  )

  function resetPlanReview() {
    setPlanReady(false)
    setSelectedInterruptions({})
    setQueueAfterByStep({})
    setConfirmedPrioritySteps({})
    setResolvedPriorityConflictIds(new Set())
  }

  function confirmPriorityStep(stepKey: string) {
    setConfirmedPrioritySteps((current) => ({ ...current, [stepKey]: true }))
  }

  function editPriorityStep(stepKey: string) {
    const stepIndex = priorityPlan.steps.findIndex(
      (step) => step.key === stepKey
    )
    if (stepIndex < 0) return
    const keepKeys = new Set(
      priorityPlan.steps.slice(0, stepIndex).map((step) => step.key)
    )
    const downstreamBlockerKeys = new Set(
      priorityPlan.steps
        .slice(stepIndex + 1)
        .flatMap((step) => step.blockers.map((blocker) => blocker.key))
    )
    setConfirmedPrioritySteps((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key, confirmed]) => confirmed && keepKeys.has(key)
        )
      )
    )
    setSelectedInterruptions((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !downstreamBlockerKeys.has(key)
        )
      )
    )
    setQueueAfterByStep((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => keepKeys.has(key))
      )
    )
  }

  async function reversePriorityConflict(conflict: DashboardPayload) {
    const targetId = displayValue(conflict.targetId)
    if (!targetId || targetId === "-") return
    await submitAction("reverse-entry", {
      targetTable: "plannerPriorities",
      targetId,
      targetKey:
        displayValue(conflict.targetKey) !== "-"
          ? displayValue(conflict.targetKey)
          : "",
      targetLabel:
        displayValue(conflict.targetLabel) !== "-"
          ? displayValue(conflict.targetLabel)
          : "",
      reason: `Planner replacing conflicting priority action with ${selectedJc || selectedPart} ${priority}`,
      correctedBy: "Planner",
    })
    setResolvedPriorityConflictIds((current) => new Set([...current, targetId]))
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!planReady) {
      setPlanReady(true)
      return
    }
    if (
      (!selectedPart && !selectedJc) ||
      !allStepsConfirmed ||
      priorityConflicts.length > 0
    )
      return
    const queueBeforeSetups = priorityPlanQueueBeforeSetups(
      priorityPlan.steps,
      queueAfterByStep
    )
    const interruptedSetups = selectedBlockers.map((blocker) => ({
      jcNo: blocker.jcNo,
      setupNo: blocker.setupNo,
      machine: blocker.machine,
    }))
    const firstInterruption = interruptedSetups[0]
    const approvalMode = selectedBlockers.some(
      (blocker) => blocker.state === "running"
    )
      ? "allow_stop_running"
      : selectedBlockers.some(
            (blocker) => blocker.state === "started_not_running"
          )
        ? "allow_started_not_running"
        : "idle_queue_only"

    submitAction("planner-priority", {
      target: selectedJc || selectedPart,
      jcNo: selectedJc,
      partCode: selectedPart,
      priority,
      approvalMode,
      confirmedSetupNumbers: priorityPlan.steps.map((step) => step.setupNo),
      interruptedJcNo: firstInterruption?.jcNo || "",
      interruptedSetupNo: firstInterruption?.setupNo || "",
      interruptedMachine: firstInterruption?.machine || "",
      interruptedSetups,
      queueBeforeSetups,
      remark,
    })
    setRemark("")
    resetPlanReview()
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <section
        className="grid gap-4 rounded-xl border bg-background p-4 sm:p-5"
        aria-labelledby="priority-input-heading"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            1
          </span>
          <div>
            <div id="priority-input-heading" className="font-semibold">
              Select the work to reprioritize
            </div>
            <div className="text-sm text-muted-foreground">
              Choose an item, optionally narrow it to one job card, then set the
              required priority.
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Item Code">
            <SearchableSelect
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={partCode}
              required
              onChange={(event) => {
                setPartCode(event.target.value)
                setJcNo("")
                resetPlanReview()
              }}
            >
              <option value="">Select Item</option>
              {itemOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field label="Jc Number">
            <SearchableSelect
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={jcNo}
              onChange={(event) => {
                setJcNo(event.target.value)
                resetPlanReview()
              }}
            >
              <option value="">All Jcs For Item</option>
              {jobCardOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field label="Priority">
            <SearchableSelect
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value)
                resetPlanReview()
              }}
            >
              {["Urgent", "High", "Normal", "Low"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field label="Reason">
            <Input
              value={remark}
              placeholder="Customer Urgent / Dispatch Commitment"
              onChange={(event) => setRemark(event.target.value)}
            />
          </Field>
        </div>
        {!planReady ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span className="text-sm text-muted-foreground">
              Nothing is changed until you review and confirm every affected
              setup.
            </span>
            <Button type="submit">
              <Eye className="size-4" />
              Review Probable Plan
            </Button>
          </div>
        ) : null}
      </section>

      {planReady ? (
        <section
          className="grid gap-4 rounded-xl border bg-muted/15 p-4 sm:p-5"
          aria-labelledby="priority-review-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                2
              </span>
              <div>
                <div id="priority-review-heading" className="font-semibold">
                  Review the setup sequence
                </div>
                <div className="text-sm text-muted-foreground">
                  {priorityPlan.steps.length} target setup
                  {priorityPlan.steps.length === 1 ? "" : "s"}. Confirm the
                  current setup to unlock the next one.
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetPlanReview}
            >
              Change Inputs
            </Button>
          </div>
          {itemPlanWindow ? (
            <div className="grid gap-1 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Complete item plan
                  </div>
                  <div className="text-base font-semibold">
                    {itemPlanWindow.startDate || "-"} to{" "}
                    {itemPlanWindow.endDate || "-"}
                  </div>
                </div>
                <Badge>
                  <CheckCircle2 className="size-3" /> Ready to apply
                </Badge>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
              The complete item dates will appear after all setup actions are
              confirmed.
            </div>
          )}
          {priorityPlan.steps.length ? (
            <>
              <PrioritySetupPreviewSummary
                steps={priorityPlan.steps}
                windows={priorityStepWindows}
                confirmedSteps={confirmedPrioritySteps}
                activeStepKey={
                  activeStepIndex >= 0
                    ? (priorityPlan.steps[activeStepIndex]?.key ?? "")
                    : ""
                }
                onEdit={editPriorityStep}
              />
              {activePriorityStep ? (
                <PriorityPlanStepReview
                  key={activePriorityStep.key}
                  step={activePriorityStep}
                  plannedWindow={
                    priorityStepWindows.get(activePriorityStep.key) ?? {
                      startDate: activePriorityStep.startDate,
                      endDate: activePriorityStep.endDate,
                    }
                  }
                  selectedInterruptions={selectedInterruptions}
                  queueAfterKey={queueAfterByStep[activePriorityStep.key] ?? ""}
                  sessionRows={asArray(productionControl.productionCardRows)}
                  setSelectedInterruptions={setSelectedInterruptions}
                  onQueueAfterChange={(value) =>
                    setQueueAfterByStep((current) => {
                      const next = { ...current }
                      if (value) next[activePriorityStep.key] = value
                      else delete next[activePriorityStep.key]
                      return next
                    })
                  }
                  onConfirm={() => confirmPriorityStep(activePriorityStep.key)}
                />
              ) : null}
            </>
          ) : (
            <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
              No Planned Setup Was Found For This Item / Jc In The Current
              Machine Plan.
            </div>
          )}
          <PlannerPreSaveConflictReview
            conflicts={priorityConflicts}
            title="Conflicting Priority Action Found"
            description="This Priority Cannot Be Applied While Another Active Priority Decision Exists For The Same Item Or Job Card With Different Priority Or Queue Choices."
            onKeepExisting={resetPlanReview}
            onReverseExisting={reversePriorityConflict}
          />
        </section>
      ) : null}

      {planReady ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4">
          <div>
            <div className="font-semibold">3. Apply the decision</div>
            <div className="text-sm text-muted-foreground">
              {allStepsConfirmed
                ? "All setup actions are confirmed."
                : "Confirm every setup above before applying this priority."}
            </div>
          </div>
          <Button
            type="submit"
            disabled={
              priorityPlan.steps.length === 0 ||
              !allStepsConfirmed ||
              priorityConflicts.length > 0
            }
          >
            <Wrench className="size-4" />
            Apply Confirmed Priority
          </Button>
        </div>
      ) : null}
    </form>
  )
}

function PrioritySetupPreviewSummary({
  steps,
  windows,
  confirmedSteps,
  activeStepKey,
  onEdit,
}: {
  steps: PriorityPlanStep[]
  windows: Map<string, PriorityPlanWindow>
  confirmedSteps: Record<string, boolean>
  activeStepKey: string
  onEdit: (stepKey: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="border-b bg-muted/20 px-4 py-3">
        <div className="text-sm font-semibold">Setup progress</div>
        <div className="text-xs text-muted-foreground">
          One setup is open at a time. Confirmed setups can be edited from this
          list.
        </div>
      </div>
      <ol className="divide-y">
        {steps.map((step, index) => {
          const window = windows.get(step.key) ?? {
            startDate: step.startDate,
            endDate: step.endDate,
          }
          const previewState = priorityPlanStepPreviewState(
            step.key,
            confirmedSteps,
            activeStepKey
          )
          const isConfirmed = Boolean(confirmedSteps[step.key])
          const isActive = step.key === activeStepKey
          return (
            <li
              key={step.key}
              className={isActive ? "bg-primary/5" : undefined}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,auto)_auto] sm:items-center">
                <span
                  className={[
                    "grid size-8 place-items-center rounded-full border text-sm font-semibold",
                    isConfirmed
                      ? "border-primary bg-primary text-primary-foreground"
                      : isActive
                        ? "border-primary text-primary"
                        : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {isConfirmed ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    index + 1
                  )}
                </span>
                <div className="min-w-0">
                  <div className="font-medium">Setup {step.setupNo}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {step.machine} · {step.itemCode} / {step.jcNo}
                  </div>
                </div>
                <div className="col-start-2 sm:col-start-auto">
                  <div className="text-xs text-muted-foreground">
                    Probable dates
                  </div>
                  <div className="text-sm font-medium">
                    {previewState.datesVisible
                      ? `${window.startDate || "-"} to ${window.endDate || "-"}`
                      : "Waiting for previous setup"}
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                  <Badge
                    variant={
                      isActive
                        ? "default"
                        : isConfirmed
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {previewState.label}
                  </Badge>
                  {isConfirmed ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(step.key)}
                    >
                      Edit
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
function PriorityPlanStepReview({
  step,
  plannedWindow,
  selectedInterruptions,
  queueAfterKey,
  sessionRows,
  setSelectedInterruptions,
  onQueueAfterChange,
  onConfirm,
}: {
  step: PriorityPlanStep
  plannedWindow: PriorityPlanWindow
  selectedInterruptions: Record<string, boolean>
  queueAfterKey: string
  sessionRows: DashboardPayload[]
  setSelectedInterruptions: Dispatch<SetStateAction<Record<string, boolean>>>
  onQueueAfterChange: (value: string) => void
  onConfirm: () => void
}) {
  const selectedRunningKeys = step.blockers
    .filter(
      (blocker) =>
        blocker.state === "running" && selectedInterruptions[blocker.key]
    )
    .map((blocker) => blocker.key)
  const selectedRunningCount = selectedRunningKeys.length
  const runningBlockerCount = step.blockers.filter(
    (blocker) => blocker.state === "running"
  ).length
  const selectedStartedCount = step.blockers.filter(
    (blocker) =>
      blocker.state === "started_not_running" &&
      selectedInterruptions[blocker.key]
  ).length
  const queuedBlockers = step.blockers.filter(
    (blocker) => blocker.state === "queued"
  )
  const heldQueueBlockers = priorityPlanHeldBlockers(step, queueAfterKey)

  const interruptMode = selectedRunningCount
    ? `Stop ${selectedRunningCount} running setup${selectedRunningCount === 1 ? "" : "s"}`
    : selectedStartedCount
      ? `Move ${selectedStartedCount} started setup${selectedStartedCount === 1 ? "" : "s"}`
      : runningBlockerCount
        ? "Do not stop running machine"
        : ""
  const queueMode = queuedBlockers.length
    ? heldQueueBlockers.length === 0
      ? "Position 1 on queued machine work"
      : heldQueueBlockers.length === queuedBlockers.length
        ? "Current queue position"
        : `After ${heldQueueBlockers.length} queued setup${heldQueueBlockers.length === 1 ? "" : "s"}`
    : "No queued setup ahead"
  const planMode = [interruptMode, queueMode].filter(Boolean).join("; ")

  return (
    <div className="grid gap-4 rounded-lg border-2 border-primary/25 bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <ListChecks className="size-5" />
          </span>
          <div>
            <div className="font-semibold">Decide Setup {step.setupNo}</div>
            <div className="text-sm text-muted-foreground">
              {step.itemCode} / {step.jcNo} on {step.machine}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge>Current setup</Badge>
          <Badge variant={step.blockers.length ? "secondary" : "outline"}>
            {step.blockers.length
              ? `${step.blockers.length} queue impact${step.blockers.length === 1 ? "" : "s"}`
              : "No queue impact"}
          </Badge>
        </div>
      </div>

      <PriorityScenarioCard
        title="Probable setup plan"
        window={plannedWindow}
        detail={planMode || "No queue impact"}
      />

      {queuedBlockers.length ? (
        <PriorityQueuePlacementBoard
          step={step}
          queueAfterKey={queueAfterKey}
          plannedWindow={plannedWindow}
          onQueueAfterChange={onQueueAfterChange}
        />
      ) : null}

      {step.blockers.some((blocker) => blocker.requiresApproval) ? (
        <div className="grid gap-3 rounded-lg border bg-muted/10 p-3">
          <div>
            <div className="text-sm font-semibold">
              Work that may be interrupted
            </div>
            <div className="text-xs text-muted-foreground">
              Choose explicitly whether each running or started setup may be
              stopped or moved.
            </div>
          </div>
          {step.blockers
            .filter((blocker) => blocker.requiresApproval)
            .map((blocker) => {
              const selected = Boolean(selectedInterruptions[blocker.key])
              return (
                <div
                  key={blocker.key}
                  className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {blocker.itemCode} / {blocker.jcNo} / Setup{" "}
                      {blocker.setupNo}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {blocker.machine} - {blocker.startDate} To{" "}
                      {blocker.endDate} - {blocker.label}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={selected ? "default" : "outline"}
                      onClick={() =>
                        setSelectedInterruptions((current) => ({
                          ...current,
                          [blocker.key]: !selected,
                        }))
                      }
                    >
                      {blocker.state === "running"
                        ? selected
                          ? "Stop Selected"
                          : "Stop This Setup"
                        : selected
                          ? "Move Approved"
                          : "Approve Queue Move"}
                    </Button>
                    {selected && blocker.state === "running" ? (
                      <StatusBadge value="Session close required" />
                    ) : null}
                  </div>
                </div>
              )
            })}
        </div>
      ) : null}

      {selectedRunningCount ? (
        <PlannerSessionSettlementNotice
          mode="close"
          rows={step.blockers
            .filter(
              (blocker) =>
                blocker.state === "running" &&
                selectedInterruptions[blocker.key]
            )
            .map((blocker) => ({
              jcNo: blocker.jcNo,
              machine: blocker.machine,
              setupNo: blocker.setupNo,
            }))}
          sessionRows={sessionRows}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-sm text-muted-foreground">
          {runningBlockerCount
            ? "Running work left unselected will continue running."
            : "No running setup blocks this target."}
        </span>
        <Button type="button" onClick={onConfirm}>
          Confirm Setup {step.setupNo}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function PriorityQueuePlacementBoard({
  step,
  queueAfterKey,
  plannedWindow,
  onQueueAfterChange,
}: {
  step: PriorityPlanStep
  queueAfterKey: string
  plannedWindow: PriorityPlanWindow
  onQueueAfterChange: (value: string) => void
}) {
  const queuedBlockers = step.blockers.filter(
    (blocker) => blocker.state === "queued"
  )
  const placementIndex = priorityQueuePlacementIndex(
    queuedBlockers,
    queueAfterKey
  )
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function placeAt(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, queuedBlockers.length))
    const afterKey =
      boundedIndex > 0 ? (queuedBlockers[boundedIndex - 1]?.key ?? "") : ""
    onQueueAfterChange(afterKey)
  }

  function dragPriority(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", step.key)
  }

  function allowDrop(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }

  function dropPriority(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    const sourceKey = event.dataTransfer.getData("text/plain")
    setDragOverIndex(null)
    if (sourceKey && sourceKey !== step.key) return
    placeAt(index)
  }

  return (
    <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            Choose the position on {step.machine}
          </div>
          <div className="text-xs text-muted-foreground">
            Click a placement row or drag the highlighted priority setup.
            Planned dates: {plannedWindow.startDate || "-"} to{" "}
            {plannedWindow.endDate || "-"}.
          </div>
        </div>
        <Badge variant="secondary">
          Selected position: {placementIndex + 1}
        </Badge>
      </div>
      <div className="grid gap-2 rounded-lg border bg-background p-2">
        {Array.from({ length: queuedBlockers.length + 1 }, (_, index) => (
          <Fragment key={`${step.key}-slot-${index}`}>
            <PriorityQueueDropZone
              active={dragOverIndex === index}
              current={placementIndex === index}
              label={priorityQueueDropLabel(index, queuedBlockers)}
              onClick={() => placeAt(index)}
              onDragOver={(event) => allowDrop(event, index)}
              onDragLeave={() =>
                setDragOverIndex((current) =>
                  current === index ? null : current
                )
              }
              onDrop={(event) => dropPriority(event, index)}
            />
            {placementIndex === index ? (
              <PriorityQueuePriorityTile
                step={step}
                plannedWindow={plannedWindow}
                position={placementIndex + 1}
                onDragStart={dragPriority}
                onDragEnd={() => setDragOverIndex(null)}
              />
            ) : null}
            {index < queuedBlockers.length ? (
              <PriorityQueueBlockerTile
                blocker={queuedBlockers[index]!}
                keptAhead={index < placementIndex}
                position={index >= placementIndex ? index + 2 : index + 1}
                onPlaceBefore={() => placeAt(index)}
                onPlaceAfter={() => placeAt(index + 1)}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  )
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
  active: boolean
  current: boolean
  label: string
  onClick: () => void
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void
  onDragLeave: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
}) {
  const className = [
    "flex min-h-8 w-full items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors",
    current
      ? "border-primary bg-primary/10 text-primary"
      : "border-dashed border-border bg-muted/10 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary",
    active ? "border-primary bg-primary/20" : "",
  ]
    .filter(Boolean)
    .join(" ")

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
      <span>{current ? "Priority position selected" : label}</span>
    </button>
  )
}

function PriorityQueuePriorityTile({
  step,
  plannedWindow,
  position,
  onDragStart,
  onDragEnd,
}: {
  step: PriorityPlanStep
  plannedWindow: PriorityPlanWindow
  position: number
  onDragStart: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}) {
  return (
    <div
      className="grid cursor-grab grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 rounded-md border-2 border-primary/50 bg-primary/10 p-3 active:cursor-grabbing md:grid-cols-[auto_auto_1fr_auto]"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <GripVertical className="size-4 text-primary" aria-hidden="true" />
      <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {position}
      </span>
      <div>
        <div className="text-sm font-semibold">
          {step.itemCode} / {step.jcNo} / Setup {step.setupNo}
        </div>
        <div className="text-xs text-muted-foreground">
          {step.machine} · {plannedWindow.startDate || "-"} to{" "}
          {plannedWindow.endDate || "-"}
        </div>
      </div>
      <Badge className="col-start-3 md:col-start-auto">New priority</Badge>
    </div>
  )
}

function PriorityQueueBlockerTile({
  blocker,
  keptAhead,
  position,
  onPlaceBefore,
  onPlaceAfter,
}: {
  blocker: PriorityPlanStep["blockers"][number]
  keptAhead: boolean
  position: number
  onPlaceBefore: () => void
  onPlaceAfter: () => void
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border bg-background p-3 md:grid-cols-[auto_1fr_auto]">
      <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {position}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {blocker.itemCode} / {blocker.jcNo} / Setup {blocker.setupNo}
        </div>
        <div className="text-xs text-muted-foreground">
          {blocker.machine} · {blocker.startDate} to {blocker.endDate}
        </div>
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 md:col-span-1">
        <Badge variant={keptAhead ? "secondary" : "outline"}>
          {keptAhead ? "Ahead of priority" : "After priority"}
        </Badge>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Place priority before ${blocker.itemCode} ${blocker.jcNo} setup ${blocker.setupNo}`}
            title="Place Priority Before This Setup"
            onClick={onPlaceBefore}
          >
            <ArrowUp className="size-3" />
            Before
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Place priority after ${blocker.itemCode} ${blocker.jcNo} setup ${blocker.setupNo}`}
            title="Place Priority After This Setup"
            onClick={onPlaceAfter}
          >
            <ArrowDown className="size-3" />
            After
          </Button>
        </div>
      </div>
    </div>
  )
}

function priorityQueuePlacementIndex(
  queuedBlockers: PriorityPlanStep["blockers"],
  queueAfterKey: string
) {
  if (!queueAfterKey) return 0
  const blockerIndex = queuedBlockers.findIndex(
    (blocker) => blocker.key === queueAfterKey
  )
  return blockerIndex < 0 ? 0 : blockerIndex + 1
}

function priorityQueueDropLabel(
  index: number,
  queuedBlockers: PriorityPlanStep["blockers"]
) {
  if (index === 0) return "Place priority at position 1"
  const blocker = queuedBlockers[index - 1]
  return blocker
    ? `Place priority after ${blocker.itemCode} / ${blocker.jcNo} / setup ${blocker.setupNo}`
    : "Place priority at current queue position"
}
function PriorityScenarioCard({
  title,
  window,
  detail,
}: {
  title: string
  window: PriorityPlanWindow
  detail: string
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/15 p-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center">
      <div>
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </div>
        <div className="mt-1 text-base font-semibold">
          {window.startDate || "-"} to {window.endDate || "-"}
        </div>
      </div>
      <div className="rounded-md bg-background p-3 text-sm text-muted-foreground">
        {detail}
      </div>
    </div>
  )
}

function RouteChangePlannerForm({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const workOrders = asArray(productionControl.workOrders)
  const routeRows = asArray(productionControl.routeMasterRows)
  const [target, setTarget] = useState("")
  const [newOption, setNewOption] = useState("")
  const [reason, setReason] = useState("")
  const [setupPlan, setSetupPlan] = useState<
    Record<string, { plan: boolean; quantity: string; remark: string }>
  >({})

  const selectedWorkOrder = useMemo(() => {
    const targetKey = target.toLowerCase()
    return workOrders.find(
      (row) =>
        str(row.jcNo).toLowerCase() === targetKey ||
        str(row.partCode).toLowerCase() === targetKey
    )
  }, [target, workOrders])
  const partCode = str(selectedWorkOrder?.partCode)
  const defaultOrderQty = str(selectedWorkOrder?.orderPcs)
  const optionRows = useMemo(
    () =>
      routeRows.filter(
        (row) => str(row.partNo).toLowerCase() === partCode.toLowerCase()
      ),
    [partCode, routeRows]
  )
  const optionNumbers = useMemo(
    () => uniqueValues(optionRows.map((row) => str(row.optionNumber))),
    [optionRows]
  )
  const selectedOption = optionNumbers.includes(newOption)
    ? newOption
    : optionNumbers[0] || ""
  const selectedSetups = useMemo(
    () =>
      optionRows
        .filter((row) => str(row.optionNumber) === selectedOption)
        .sort((a, b) =>
          str(a.displaySetupNo || a.setupNo).localeCompare(
            str(b.displaySetupNo || b.setupNo),
            undefined,
            { numeric: true }
          )
        ),
    [optionRows, selectedOption]
  )
  const selectedSetupPlan = useMemo(() => {
    const next: Record<
      string,
      { plan: boolean; quantity: string; remark: string }
    > = {}
    for (const setup of selectedSetups) {
      const setupNo = str(setup.displaySetupNo || setup.setupNo)
      next[setupNo] = setupPlan[setupNo] ?? {
        plan: true,
        quantity: defaultOrderQty,
        remark: "",
      }
    }
    return next
  }, [defaultOrderQty, selectedSetups, setupPlan])

  function updateSetup(
    setupNo: string,
    patch: Partial<{ plan: boolean; quantity: string; remark: string }>
  ) {
    setSetupPlan((current) => ({
      ...current,
      [setupNo]: {
        ...(current[setupNo] ?? { plan: true, quantity: "", remark: "" }),
        ...patch,
      },
    }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const remainingSetups = selectedSetups.map((setup) => {
      const setupNo = str(setup.displaySetupNo || setup.setupNo)
      const state = selectedSetupPlan[setupNo] ?? {
        plan: false,
        quantity: "",
        remark: "",
      }
      return {
        setupNo,
        plan: state.plan,
        quantity: state.plan ? Number(state.quantity) || 0 : 0,
        remark: state.remark || undefined,
      }
    })
    await submitAction("route-change", {
      target,
      newOption: selectedOption,
      remainingSetups,
      reason,
    })
    setReason("")
  }

  return (
    <form
      className="grid gap-3 rounded-xl border bg-background p-3"
      onSubmit={submit}
    >
      <div>
        <div className="text-sm font-medium">Route Change Details</div>
        <div className="text-xs text-muted-foreground">
          Planner Selects The New Route Option And Enters Remaining Setup
          Quantities.
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Job Card / Part">
          <Input
            list="route-change-targets"
            value={target}
            placeholder="Jc-003 Or M6"
            required
            onChange={(event) => setTarget(event.target.value)}
          />
          <datalist id="route-change-targets">
            {workOrders.map((row) => (
              <option
                key={`${str(row.jcNo)}-${str(row.partCode)}`}
                value={str(row.jcNo)}
              >
                {str(row.partCode)}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="New Route Option">
          <SearchableSelect
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={selectedOption}
            required
            onChange={(event) => setNewOption(event.target.value)}
          >
            {optionNumbers.length ? (
              optionNumbers.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))
            ) : (
              <option value="">Select Job Card First</option>
            )}
          </SearchableSelect>
        </Field>
        <Field label="Reason">
          <Input
            value={reason}
            placeholder="Why Route Is Changing"
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Setup</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Qty To Plan</TableHead>
              <TableHead>Remark</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedSetups.length ? (
              selectedSetups.map((setup) => {
                const setupNo = str(setup.displaySetupNo || setup.setupNo)
                const state = selectedSetupPlan[setupNo] ?? {
                  plan: true,
                  quantity: str(selectedWorkOrder?.orderPcs),
                  remark: "",
                }
                return (
                  <TableRow key={setupNo}>
                    <TableCell>
                      <div className="font-medium">{setupNo}</div>
                      <div className="text-xs text-muted-foreground">
                        {displayValue(setup.setupName)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{displayValue(setup.machineUsed)}</div>
                      <div className="text-xs text-muted-foreground">
                        {displayValue(setup.machineType)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <input
                        className="size-4"
                        type="checkbox"
                        checked={state.plan}
                        onChange={(event) =>
                          updateSetup(setupNo, { plan: event.target.checked })
                        }
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
                        onChange={(event) =>
                          updateSetup(setupNo, { quantity: event.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={state.remark}
                        placeholder="Optional"
                        onChange={(event) =>
                          updateSetup(setupNo, { remark: event.target.value })
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Select A Job Card And Route Option To Load Setups.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Button
        className="w-fit"
        type="submit"
        disabled={!target || !selectedOption || !selectedSetups.length}
      >
        <Route className="size-4" />
        Save Route Change Plan
      </Button>
    </form>
  )
}

function SetupCompleteActionForm({
  plannedRows,
  shopFloorOptions,
  onSubmit,
}: {
  plannedRows: DashboardPayload[]
  shopFloorOptions: EmployeeOption[]
  onSubmit: (body: Record<string, unknown>) => void | Promise<void>
}) {
  const assignments = useMemo(
    () => jobCardActionAssignments(plannedRows),
    [plannedRows]
  )
  const [machine, setMachine] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const assignment = assignments.find((row) => row.machine === machine)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assignment || isSubmitting) return
    const form = event.currentTarget
    const formData = new FormData(form)
    setIsSubmitting(true)
    try {
      await onSubmit({
        completedBy: String(formData.get("completedBy") ?? "").trim(),
        jcNo: assignment.jobCard,
        machine: assignment.machine,
        remark: String(formData.get("remark") ?? "").trim(),
        setupNo: assignment.setupNo,
      })
      form.reset()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      aria-busy={isSubmitting}
      className="grid gap-3 rounded-xl border bg-background p-3"
      onSubmit={(event) => void submit(event)}
    >
      <fieldset className="contents" disabled={isSubmitting}>
        <div>
          <div className="text-sm font-medium">Mark Setup Complete</div>
          <div className="text-xs text-muted-foreground">
            Select A Machine. Its Current Job Card And Setup Come From Planning.
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
          <Field label="Machine Number">
            <SearchableSelect
              className="h-9 rounded-md border bg-background px-3 text-sm"
              required
              value={machine}
              onChange={(event) => setMachine(event.target.value)}
            >
              <option value="">Select Machine Number</option>
              {assignments.map((row) => (
                <option key={row.machine} value={row.machine}>
                  {row.machine}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field label="Job Card">
            <Input
              readOnly
              value={assignment?.jobCard ?? ""}
              placeholder="From planning"
            />
          </Field>
          <Field label="Setup No.">
            <Input
              readOnly
              value={assignment?.setupNo ?? ""}
              placeholder="From planning"
            />
          </Field>
          <Field label="Completed By">
            <SearchableSelect
              className="h-9 rounded-md border bg-background px-3 text-sm"
              name="completedBy"
              required
            >
              <option value="">
                {shopFloorOptions.length
                  ? "Select Shop Floor Employee"
                  : "No Shop Floor Employees In This Production Unit"}
              </option>
              {shopFloorOptions.map((employee) => (
                <option key={employee.code} value={employee.name}>
                  {employee.code} - {employee.name}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field label="Completion Remark">
            <Input name="remark" placeholder="Optional" />
          </Field>
        </div>
        {!assignments.length ? (
          <p className="text-xs text-muted-foreground">
            No current machine assignments are available in planning.
          </p>
        ) : null}
        <Button
          className="w-fit"
          type="submit"
          disabled={!assignment || isSubmitting}
        >
          <Wrench className="size-4" />
          {isSubmitting ? "Processing..." : "Mark complete"}
        </Button>
      </fieldset>
    </form>
  )
}

function DispatchApprovalActionForm({
  approverOptions,
  jobCards,
  onSubmit,
}: {
  approverOptions: EmployeeOption[]
  jobCards: string[]
  onSubmit: (body: Record<string, unknown>) => void | Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    const form = event.currentTarget
    const formData = new FormData(form)
    setIsSubmitting(true)
    try {
      await onSubmit({
        approvedBy: String(formData.get("approvedBy") ?? "").trim(),
        jcNo: String(formData.get("jcNo") ?? "").trim(),
        remark: String(formData.get("remark") ?? "").trim(),
      })
      form.reset()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      aria-busy={isSubmitting}
      className="grid gap-3 rounded-xl border bg-background p-3"
      onSubmit={(event) => void submit(event)}
    >
      <fieldset className="contents" disabled={isSubmitting}>
        <div>
          <div className="text-sm font-medium">Dispatch Approval</div>
          <div className="text-xs text-muted-foreground">
            Only Job Cards With Every Planned Setup Completed Are Ready For
            Approval.
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
          <Field label="Job Card">
            <SearchableSelect
              className="h-9 rounded-md border bg-background px-3 text-sm"
              name="jcNo"
              required
            >
              <option value="">
                {jobCards.length
                  ? "Select Ready Job Card"
                  : "No Job Cards Ready For Dispatch"}
              </option>
              {jobCards.map((jobCard) => (
                <option key={jobCard} value={jobCard}>
                  {jobCard}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field label="Approved By">
            <SearchableSelect
              className="h-9 rounded-md border bg-background px-3 text-sm"
              name="approvedBy"
              required
            >
              <option value="">
                {approverOptions.length
                  ? "Select Planner Or Shop Floor Employee"
                  : "No Eligible Approvers In This Production Unit"}
              </option>
              {approverOptions.map((employee) => (
                <option key={employee.code} value={employee.name}>
                  {employee.code} - {employee.name}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field label="Dispatch Remark">
            <Input name="remark" placeholder="Optional" />
          </Field>
        </div>
        <Button
          className="w-fit"
          type="submit"
          disabled={!jobCards.length || !approverOptions.length || isSubmitting}
        >
          <Wrench className="size-4" />
          {isSubmitting ? "Processing..." : "Approve dispatch"}
        </Button>
      </fieldset>
    </form>
  )
}

function JobCardsPanel({
  productionControl,
  productionFloorCode,
  submitAction,
  openMasterReadiness,
}: {
  productionControl: DashboardPayload
  productionFloorCode: ProductionFloorCode
  storeMasterData?: StoreMasterData | null
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  openMasterReadiness: () => void
}) {
  const { dispatchApproverOptions, shopFloorOptions } =
    useProductionEmployeeDirectory(productionFloorCode)
  const plannedRows = useMemo(
    () => asArray(productionControl.machinePlanDetailRows),
    [productionControl.machinePlanDetailRows]
  )
  const jobCardRows = useMemo(
    () => asArray(productionControl.jobCardStatusTiles),
    [productionControl.jobCardStatusTiles]
  )
  const readyJobCards = useMemo(
    () => dispatchReadyJobCards(jobCardRows, plannedRows),
    [jobCardRows, plannedRows]
  )

  return (
    <section className="grid gap-4">
      <JobCardRegister
        rows={jobCardRows}
        floor={productionFloorCode}
        actionNeededCount={asArray(productionControl.allWorkOrderGaps).length}
        onOpenMasterReadiness={openMasterReadiness}
      />
      <Card>
        <CardHeader>
          <CardTitle>Job Card Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 @5xl/main:grid-cols-2">
          <SetupCompleteActionForm
            plannedRows={plannedRows}
            shopFloorOptions={shopFloorOptions}
            onSubmit={(body) => submitAction("mark-complete", body)}
          />
          <DispatchApprovalActionForm
            approverOptions={dispatchApproverOptions}
            jobCards={readyJobCards}
            onSubmit={(body) => submitAction("dispatch-approval", body)}
          />
        </CardContent>
      </Card>
    </section>
  )
}

function MachineDetailPanel({
  productionControl,
}: {
  productionControl: DashboardPayload
}) {
  return (
    <>
      <MachinePlanningBoard
        rows={asArray(productionControl.machinePlanningRows)}
        plannedRows={asArray(productionControl.machinePlanDetailRows)}
      />
      <section className="grid gap-4">
        <DataRowsCard
          title="Machine Unavailable / Breakdown"
          rows={asArray(productionControl.machineConstraintRows)}
          empty="No machine issues saved yet"
        />
      </section>
    </>
  )
}

type ShopFloorStageId =
  | "raw_material_at_machine"
  | "presetting"
  | "setting"
  | "quality_approval"
  | "operator_started"
  | "item_complete"

const shopFloorStages: Array<{
  id: ShopFloorStageId
  label: string
  role: string
  button: string
}> = [
  {
    id: "raw_material_at_machine",
    label: "Raw Material At The Machine",
    role: "Shop floor",
    button: "RM at machine",
  },
  {
    id: "presetting",
    label: "Pre Setting Started",
    role: "Assistant machinist",
    button: "Start pre setting",
  },
  {
    id: "setting",
    label: "Setting Done",
    role: "Assistant machinist",
    button: "Setting done",
  },
  {
    id: "quality_approval",
    label: "Quality Approval",
    role: "Quality",
    button: "Quality approved",
  },
  {
    id: "operator_started",
    label: "Operator Assigned And Machine Started",
    role: "Machinist",
    button: "Start machine",
  },
]

type RoleTaskKind = "shopFloor" | "machinist" | "quality"

const roleTaskCopy: Record<RoleTaskKind, { title: string; empty: string }> = {
  shopFloor: {
    title: "Shop Floor Tasks",
    empty: "No raw-material placement tasks are pending.",
  },
  machinist: {
    title: "Machinist Tasks",
    empty: "No machinist tasks are pending.",
  },
  quality: {
    title: "Quality Control Tasks",
    empty: "First-piece tasks are available only in First Piece Inspection.",
  },
}

function useProductionEmployeeDirectory(
  productionFloorCode?: ProductionFloorCode
) {
  const employeeMasterPage = usePostgresOperationalPage("/api/employee-master")
  const rows = useMemo(
    () => asArray(employeeMasterPage.data?.rows),
    [employeeMasterPage.data?.rows]
  )
  const floor = productionFloorCode ?? productionFloorFromLocation()
  const machinistOptions = useMemo(
    () => productionMachinistOptions(rows, floor),
    [floor, rows]
  )
  const qualityOptions = useMemo(
    () => productionQualityOptions(rows, floor),
    [floor, rows]
  )
  const shopFloorOptions = useMemo(
    () => productionShopFloorOptions(rows, floor),
    [floor, rows]
  )
  const dispatchApproverOptions = useMemo(
    () => productionDispatchApproverOptions(rows, floor),
    [floor, rows]
  )
  const workerOptions = useMemo(
    () => productionWorkerOptions(rows, floor),
    [floor, rows]
  )

  return {
    error: employeeMasterPage.error,
    dispatchApproverOptions,
    loaded: employeeMasterPage.data !== undefined,
    machinistOptions,
    qualityOptions,
    shopFloorOptions,
    workerOptions,
  }
}

function ShopFloorStatusPanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const { machinistOptions, qualityOptions, shopFloorOptions, workerOptions } =
    useProductionEmployeeDirectory()
  const [machineFilter, setMachineFilter] = useState("")
  const [locationFilter, setLocationFilter] = useState("")
  const [currentFilter, setCurrentFilter] = useState("")
  const [nextFilter, setNextFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const plannedRows = asArray(productionControl.machinePlanDetailRows)
  const boardRows = useMemo(
    () =>
      machineBoardRows(
        asArray(productionControl.machinePlanningRows),
        plannedRows
      ),
    [plannedRows, productionControl.machinePlanningRows]
  )
  const productionCardRows = useMemo(
    () => asArray(productionControl.productionCardRows),
    [productionControl.productionCardRows]
  )
  const plannedByMachine = useMemo(
    () => groupPlannedRowsByMachine(plannedRows),
    [plannedRows]
  )
  const machineOptions = useMemo(
    () => plannedMachineOptions(plannedRows, boardRows),
    [boardRows, plannedRows]
  )
  const locationOptions = useMemo(
    () =>
      uniqueValues(
        boardRows
          .map(machineMasterLocationValue)
          .filter((value) => value !== "-")
      ),
    [boardRows]
  )
  const floorRows = useMemo(
    () =>
      boardRows
        .map((machineRow) => {
          const machine = machineValue(machineRow, "machine")
          const plans = plannedByMachine.get(machineKey(machine)) ?? []
          const current = currentShopFloorStatusItem(plans, productionCardRows)
          const next = nextShopFloorStatusItem(
            plans,
            current,
            productionCardRows
          )
          const actionCurrent =
            current &&
            (shopFloorItemIsProductionCurrent(current) ||
              shopFloorItemHasActiveProductionCard(current, productionCardRows))
              ? current
              : undefined
          const actionNext = actionCurrent ? next : (current ?? next)
          const status = shopFloorRowStatus(current, next, productionCardRows)
          return {
            machineRow,
            machine,
            location: machineMasterLocationValue(machineRow),
            current,
            next,
            actionCurrent,
            actionNext,
            status,
          }
        })
        .filter(
          (row) =>
            typedFilterMatches(row.machine, machineFilter) &&
            typedFilterMatches(row.location, locationFilter) &&
            shopFloorItemMatchesFilter(row.current, currentFilter) &&
            shopFloorItemMatchesFilter(row.next, nextFilter) &&
            typedFilterMatches(row.status, statusFilter)
        ),
    [
      boardRows,
      currentFilter,
      locationFilter,
      machineFilter,
      nextFilter,
      plannedByMachine,
      productionCardRows,
      statusFilter,
    ]
  )
  const currentOptions = useMemo(
    () =>
      uniqueValues(
        floorRows.map((row) =>
          row.current ? shopFloorItemLabel(row.current) : "Empty"
        )
      ),
    [floorRows]
  )
  const nextOptions = useMemo(
    () =>
      uniqueValues(
        floorRows.map((row) =>
          row.next ? shopFloorItemLabel(row.next) : "No plan"
        )
      ),
    [floorRows]
  )
  const statusOptions = useMemo(
    () => uniqueValues(floorRows.map((row) => row.status)),
    [floorRows]
  )
  const currentCount = floorRows.filter((row) => row.current).length
  const nextCount = floorRows.filter((row) => row.next).length
  const waitingSetupCount = floorRows.filter(
    (row) => !row.current && row.next
  ).length

  async function saveStage(
    row: DashboardPayload,
    stage: ShopFloorStageId,
    extra: Record<string, unknown> = {}
  ) {
    const stageSpec = shopFloorStages.find((item) => item.id === stage)
    const payload = {
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
      productionFloorCode: normalizeProductionFloorCode(
        row.productionFloorCode ?? productionFloorFromLocation()
      ),
      stage,
      stageLabel: stageSpec?.label ?? "Item complete",
      role: stageSpec?.role ?? "Shop floor",
      doneBy: "",
      worker: "",
      remark: "",
      completedAt: new Date().toISOString(),
      ...extra,
    }
    await submitAction("data-entry", {
      entryType: "shop_floor_status",
      key: dataEntryKey("shop_floor_status", payload),
      payload,
    })
  }

  async function saveSetupChecklistSession(
    row: DashboardPayload,
    session: DashboardPayload
  ) {
    const payload = setupChecklistSessionPayload(row, session)
    await submitAction("data-entry", {
      entryType: "setup_checklist_session",
      key: dataEntryKey("setup_checklist_session", payload),
      payload,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shop Floor Status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <TrackingSummary
          tones={["brand", "success", "info", "warning"]}
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
              label: "Machine No.",
              value: machineFilter,
              placeholder: "Type or select machine",
              options: machineOptions,
              onChange: setMachineFilter,
            },
            {
              id: "shop-floor-status-location",
              label: "Master Location",
              value: locationFilter,
              placeholder: "Type or select master location",
              options: locationOptions,
              onChange: setLocationFilter,
            },
            {
              id: "shop-floor-status-current",
              label: "Current Item",
              value: currentFilter,
              placeholder: "Type or select current item",
              options: currentOptions,
              onChange: setCurrentFilter,
            },
            {
              id: "shop-floor-status-next",
              label: "Next Item",
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
            <Table containerClassName="max-h-none overflow-visible">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="min-w-32">Machine No.</TableHead>
                  <TableHead className="min-w-36">Master Location</TableHead>
                  <TableHead className="min-w-64">
                    Current Item Running
                  </TableHead>
                  <TableHead className="min-w-64">Next Item Planned</TableHead>
                  <TableHead className="min-w-80">Status / Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {floorRows.map((row) => (
                  <TableRow
                    key={row.machine}
                    className={
                      !row.current && row.next
                        ? "bg-amber-50/45 dark:bg-amber-950/15"
                        : ""
                    }
                  >
                    <TableCell className="align-middle">
                      <div className="font-semibold">{row.machine}</div>
                      <div className="text-xs text-muted-foreground">
                        {machineValue(row.machineRow, "machineType")}
                      </div>
                    </TableCell>
                    <TableCell className="align-middle text-sm">
                      {row.location}
                    </TableCell>
                    <TableCell className="align-middle">
                      {row.current ? (
                        <ShopFloorItemSummary
                          row={row.current}
                          tone="current"
                          productionCardRows={productionCardRows}
                        />
                      ) : (
                        <EmptyShopFloorSlot
                          label={
                            row.next ? "Setup Required" : "No Running Item"
                          }
                          compact
                        />
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      {row.next ? (
                        <ShopFloorItemSummary row={row.next} tone="next" />
                      ) : (
                        <EmptyShopFloorSlot label="No Next Plan" compact />
                      )}
                    </TableCell>
                    <TableCell
                      className="align-middle"
                      data-filter-value={row.status}
                    >
                      <ShopFloorRowAction
                        current={row.actionCurrent}
                        next={row.actionNext}
                        machinistOptions={machinistOptions}
                        onSaveStage={saveStage}
                        onSaveSetupChecklistSession={saveSetupChecklistSession}
                        qualityOptions={qualityOptions}
                        setupChecklistMasters={asArray(
                          productionControl.setupChecklistMasterRows
                        )}
                        setupChecklistSessions={asArray(
                          productionControl.setupChecklistSessionRows
                        )}
                        shopFloorOptions={shopFloorOptions}
                        workerOptions={workerOptions}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRowsMessage>
            No Machines Match The Current Filter
          </EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  )
}

function RoleTaskPanel({
  productionControl,
  submitAction,
  openDataEntry,
  enableFirstPieceInspection = false,
  onStartFirstPieceInspection,
  role,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  openDataEntry?: (
    entryType: string,
    defaults?: Record<string, unknown>
  ) => void
  enableFirstPieceInspection?: boolean
  onStartFirstPieceInspection?: (row: DashboardPayload) => void
  role: RoleTaskKind
}) {
  const { machinistOptions, qualityOptions, shopFloorOptions, workerOptions } =
    useProductionEmployeeDirectory()
  const copy = enableFirstPieceInspection
    ? {
        title: "First Piece Inspection",
        empty: "No first-piece inspection tasks are pending.",
      }
    : roleTaskCopy[role]
  const queueRows = useMemo(
    () => shopFloorQueueRows(productionControl),
    [productionControl]
  )
  const roleRows = useMemo(
    () =>
      role === "quality"
        ? []
        : queueRows.filter((row) => roleTaskMatches(row, role)),
    [queueRows, role]
  )
  async function saveStage(
    row: DashboardPayload,
    stage: ShopFloorStageId,
    extra: Record<string, unknown> = {}
  ) {
    const stageSpec = shopFloorStages.find((item) => item.id === stage)
    const payload = {
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
      productionFloorCode: normalizeProductionFloorCode(
        row.productionFloorCode ?? productionFloorFromLocation()
      ),
      stage,
      stageLabel: stageSpec?.label ?? "Item complete",
      role: stageSpec?.role ?? "Shop floor",
      doneBy: "",
      worker: "",
      remark: "",
      completedAt: new Date().toISOString(),
      ...extra,
    }
    await submitAction("data-entry", {
      entryType: "shop_floor_status",
      key: dataEntryKey("shop_floor_status", payload),
      payload,
    })
  }

  async function saveFirstPieceReport(
    row: DashboardPayload,
    report: DashboardPayload
  ) {
    const payload = {
      ...report,
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
      productionFloorCode: normalizeProductionFloorCode(
        row.productionFloorCode ?? productionFloorFromLocation()
      ),
    }
    await submitAction("data-entry", {
      entryType: "first_piece_inspection_report",
      key: dataEntryKey("first_piece_inspection_report", payload),
      payload,
    })
  }
  async function saveSetupChecklistSession(
    row: DashboardPayload,
    session: DashboardPayload
  ) {
    const payload = setupChecklistSessionPayload(row, session)
    await submitAction("data-entry", {
      entryType: "setup_checklist_session",
      key: dataEntryKey("setup_checklist_session", payload),
      payload,
    })
  }

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {role === "quality" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams({
                    floor: productionFloorFromLocation(),
                  })
                  window.location.assign(
                    `/dashboard/first-piece-inspection?${params.toString()}`
                  )
                }}
              >
                <ListChecks className="size-4" />
                First Piece Inspection
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams({
                    floor: productionFloorFromLocation(),
                    returnTab: "qualityControlTasksTab",
                  })
                  window.location.assign(
                    `/dashboard/hourly-quality-check?${params.toString()}`
                  )
                }}
              >
                <Gauge className="size-4" />
                Hourly Quality Check
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            className="h-11 w-fit"
            onClick={() => {
              const params = new URLSearchParams({
                floor: productionFloorFromLocation(),
              })
              window.location.assign(
                `/dashboard/production-sessions?${params.toString()}`
              )
            }}
          >
            <Activity className="size-4" />
            Open Production Sessions
          </Button>
          <TrackingSummary
            tones={["warning", "brand", "info"]}
            items={[
              ["Pending", formatNumber(roleRows.length)],
              [
                "Machines",
                formatNumber(
                  uniqueValues(roleRows.map((row) => row.machine)).length
                ),
              ],
              [
                "Locations",
                formatNumber(
                  uniqueValues(
                    roleRows
                      .map((row) => row.location)
                      .filter((value) => value !== "-")
                  ).length
                ),
              ],
            ]}
          />
          {roleRows.length ? (
            <div className="max-h-[72vh] overflow-auto rounded-lg border">
              <Table containerClassName="max-h-none overflow-visible">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="min-w-32">Machine No.</TableHead>
                    <TableHead className="min-w-36">Master Location</TableHead>
                    <TableHead className="min-w-72">Item Setup</TableHead>
                    <TableHead className="min-w-52">Pending Task</TableHead>
                    <TableHead className="min-w-80">Entry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleRows.map((row) => (
                    <TableRow
                      key={`${row.machine}-${shopFloorPlanKey(row.next)}`}
                    >
                      <TableCell className="align-middle">
                        <div className="font-semibold">{row.machine}</div>
                        <div className="text-xs text-muted-foreground">
                          {machineValue(row.machineRow, "machineType")}
                        </div>
                      </TableCell>
                      <TableCell className="align-middle text-sm">
                        {row.location}
                      </TableCell>
                      <TableCell className="align-middle">
                        <ShopFloorItemSummary row={row.next} tone="next" />
                      </TableCell>
                      <TableCell className="align-middle">
                        <StatusBadge value={pendingTaskLabel(row.next)} />
                      </TableCell>
                      <TableCell className="align-middle">
                        {role === "quality" && onStartFirstPieceInspection ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              onStartFirstPieceInspection(row.next)
                            }
                          >
                            <CheckCircle2 className="size-4" />
                            Start Quality Approval
                          </Button>
                        ) : (
                          <ShopFloorRowAction
                            next={row.next}
                            onSaveStage={saveStage}
                            onSaveFirstPieceReport={
                              enableFirstPieceInspection
                                ? saveFirstPieceReport
                                : undefined
                            }
                            inspectionMasters={
                              enableFirstPieceInspection
                                ? combinedQualityInspectionMasterRows(
                                    productionControl
                                  )
                                : []
                            }
                            setupChecklistMasters={asArray(
                              productionControl.setupChecklistMasterRows
                            )}
                            setupChecklistSessions={asArray(
                              productionControl.setupChecklistSessionRows
                            )}
                            machinistOptions={machinistOptions}
                            qualityOptions={qualityOptions}
                            shopFloorOptions={shopFloorOptions}
                            workerOptions={workerOptions}
                            onSaveSetupChecklistSession={
                              saveSetupChecklistSession
                            }
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
          <DataRowsCard
            title="First Piece Inspection Reports"
            rows={asArray(productionControl.firstPieceInspectionReportRows)}
            empty="No first-piece reports saved yet"
          />
          <DataRowsCard
            title="Quality Inspection Parameter Master"
            rows={combinedQualityInspectionMasterRows(productionControl)}
            empty="No quality inspection parameters saved yet"
          />
        </>
      ) : null}
    </section>
  )
}

function FirstPieceInspectionPanel({
  tasks,
  productionControl,
  submitAction,
  openDataEntry,
  onTaskComplete,
}: {
  tasks: DashboardPayload[]
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
  onTaskComplete: (row: DashboardPayload) => void
}) {
  const { qualityOptions } = useProductionEmployeeDirectory()
  const masters = combinedQualityInspectionMasterRows(productionControl)
  const reportRows = asArray(productionControl.firstPieceInspectionReportRows)
  const [activeView, setActiveView] = useState<"tasks" | "reports">("tasks")
  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null)
  const defaultExpandedTaskKey = tasks[0] ? shopFloorPlanKey(tasks[0]) : ""
  const activeExpandedTaskKey = expandedTaskKey ?? defaultExpandedTaskKey

  async function saveStage(
    row: DashboardPayload,
    stage: ShopFloorStageId,
    extra: Record<string, unknown> = {}
  ) {
    const stageSpec = shopFloorStages.find((item) => item.id === stage)
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
    }
    await submitAction("data-entry", {
      entryType: "shop_floor_status",
      key: dataEntryKey("shop_floor_status", payload),
      payload,
    })
    if (stage === "quality_approval") onTaskComplete(row)
  }

  async function saveFirstPieceReport(
    row: DashboardPayload,
    report: DashboardPayload
  ) {
    const payload = {
      ...report,
      jcNo: jobCardNumber(row),
      partCode: itemCode(row),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
      setupName: displayValue(row.setupName),
      machine: displayValue(row.machine),
      machineType: displayValue(row.machineType),
      productionFloorCode: normalizeProductionFloorCode(
        row.productionFloorCode ?? productionFloorFromLocation()
      ),
    }
    await submitAction("data-entry", {
      entryType: "first_piece_inspection_report",
      key: dataEntryKey("first_piece_inspection_report", payload),
      payload,
    })
  }
  return (
    <section className="grid min-w-0 gap-4">
      <div
        aria-label="First Piece Inspection Views"
        className="grid w-full grid-cols-2 items-center gap-1 rounded-xl border bg-muted/40 p-1 @2xl/main:flex @2xl/main:w-fit"
        role="tablist"
      >
        <Button
          aria-controls="first-piece-task-list"
          aria-selected={activeView === "tasks"}
          className="min-w-0 justify-center gap-2 rounded-lg"
          onClick={() => setActiveView("tasks")}
          role="tab"
          size="sm"
          type="button"
          variant={activeView === "tasks" ? "default" : "ghost"}
        >
          <ListChecks className="size-4" />
          Task List
          <Badge variant="secondary">{tasks.length}</Badge>
        </Button>
        <Button
          aria-controls="first-piece-saved-reports"
          aria-selected={activeView === "reports"}
          className="min-w-0 justify-center gap-2 rounded-lg"
          onClick={() => setActiveView("reports")}
          role="tab"
          size="sm"
          type="button"
          variant={activeView === "reports" ? "default" : "ghost"}
        >
          <FileText className="size-4" />
          Saved Reports
          <Badge variant="secondary">{reportRows.length}</Badge>
        </Button>
      </div>

      {activeView === "tasks" ? (
        <Card
          aria-labelledby="first-piece-task-list-title"
          id="first-piece-task-list"
          role="tabpanel"
        >
          <CardHeader>
            <CardTitle id="first-piece-task-list-title">
              First Piece Inspection Task List
            </CardTitle>
            <CardDescription>
              Open Reports Stay On This Page Until They Are Submitted. Partially
              Completed Readings Are Saved Automatically In This Browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {tasks.length ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14"></TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Job Card</TableHead>
                      <TableHead className="hidden @3xl/main:table-cell">
                        Machine
                      </TableHead>
                      <TableHead className="hidden @4xl/main:table-cell">
                        Setup
                      </TableHead>
                      <TableHead className="hidden @5xl/main:table-cell">
                        Option
                      </TableHead>
                      <TableHead className="hidden @6xl/main:table-cell">
                        Task Assigned
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => {
                      const taskKey = shopFloorPlanKey(task)
                      const expanded = activeExpandedTaskKey === taskKey
                      return (
                        <Fragment key={taskKey}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() =>
                              setExpandedTaskKey(expanded ? "" : taskKey)
                            }
                          >
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="size-10 p-0"
                                aria-label={
                                  expanded ? "Collapse Report" : "Expand Report"
                                }
                              >
                                {expanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="font-medium">
                              {itemCode(task)}
                            </TableCell>
                            <TableCell>{jobCardNumber(task)}</TableCell>
                            <TableCell className="hidden @3xl/main:table-cell">
                              {displayValue(task.machine)}
                            </TableCell>
                            <TableCell className="hidden @4xl/main:table-cell">
                              {displayValue(task.setupNo)}
                            </TableCell>
                            <TableCell className="hidden @5xl/main:table-cell">
                              {displayValue(task.optionNumber)}
                            </TableCell>
                            <TableCell className="hidden @6xl/main:table-cell">
                              {displayValue(task.shopFloorUpdatedAt)}
                            </TableCell>
                          </TableRow>
                          {expanded ? (
                            <TableRow>
                              <TableCell
                                colSpan={7}
                                className="bg-muted/15 p-2 @2xl/main:p-4"
                              >
                                <ShopFloorRowAction
                                  next={task}
                                  onSaveStage={saveStage}
                                  onSaveFirstPieceReport={saveFirstPieceReport}
                                  inspectionMasters={masters}
                                  qualityOptions={qualityOptions}
                                  openDataEntry={openDataEntry}
                                />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyRowsMessage>
                Start A Quality Approval Task From The Quality Control Tab To
                Open Its First-Piece Report Here.
              </EmptyRowsMessage>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          aria-label="Saved First Piece Inspection Reports"
          id="first-piece-saved-reports"
          role="tabpanel"
        >
          <DataRowsCard
            title="Saved First Piece Inspection Reports"
            rows={reportRows}
            empty="No first-piece reports saved yet"
          />
        </div>
      )}
    </section>
  )
}

function ShopFloorItemSummary({
  row,
  tone,
  compact = false,
  productionCardRows = [],
}: {
  row: DashboardPayload
  tone: "current" | "next"
  compact?: boolean
  productionCardRows?: DashboardPayload[]
}) {
  const statusLabel =
    tone === "current"
      ? shopFloorCurrentStatusLabel(row, productionCardRows)
      : str(row.shopFloorStageLabel) || "Planned"
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="text-sm font-medium text-foreground">
          {itemCode(row)}
        </span>
        <StatusBadge value={statusLabel} />
        <span>{jobCardNumber(row)}</span>
        <span>Setup {displayValue(row.setupNo)}</span>
        <span>Option {displayValue(row.optionNumber)}</span>
        <span>Rm: {displayValue(row.rmStatus)}</span>
      </div>
    )
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{itemCode(row)}</span>
        <StatusBadge value={statusLabel} />
      </div>
      <div className="text-xs text-muted-foreground">
        {jobCardNumber(row)} | Setup {displayValue(row.setupNo)} | Option{" "}
        {displayValue(row.optionNumber)}
      </div>
      <div className="text-xs text-muted-foreground">
        Setup: {displayValue(row.setupPlannedDate || row.plannedDate)} |
        Production: {displayValue(row.plannedProductionStartDate)} -{" "}
        {displayValue(row.plannedProductionEndDate)}
      </div>
      <div className="text-xs text-muted-foreground">
        Rm: {displayValue(row.rmStatus)}
      </div>
    </div>
  )
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
  machinistOptions = [],
  qualityOptions = [],
  shopFloorOptions = [],
  workerOptions = [],
  openDataEntry,
}: {
  current?: DashboardPayload
  next?: DashboardPayload
  onSaveStage: (
    row: DashboardPayload,
    stage: ShopFloorStageId,
    extra?: Record<string, unknown>
  ) => Promise<void>
  onSaveFirstPieceReport?: (
    row: DashboardPayload,
    report: DashboardPayload
  ) => Promise<void>
  onSaveSetupChecklistSession?: (
    row: DashboardPayload,
    session: DashboardPayload
  ) => Promise<void>
  inspectionMasters?: DashboardPayload[]
  setupChecklistMasters?: DashboardPayload[]
  setupChecklistSessions?: DashboardPayload[]
  machinistOptions?: Array<{ code: string; name: string }>
  qualityOptions?: Array<{ code: string; name: string }>
  shopFloorOptions?: Array<{ code: string; name: string }>
  workerOptions?: Array<{ code: string; name: string }>
  openDataEntry?: (
    entryType: string,
    defaults?: Record<string, unknown>
  ) => void
}) {
  const [doneBy, setDoneBy] = useState("")
  const [worker, setWorker] = useState("")
  const [remark, setRemark] = useState("")
  const [inspectionReadings, setInspectionReadings] = useState<
    Record<string, string[]>
  >({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const row = next ?? current
  const stage = str(row?.shopFloorStage) as ShopFloorStageId
  const stageIndex = shopFloorStageIndex(stage)
  const nextStage = next
    ? shopFloorStages.find((_, index) => index === stageIndex + 1)
    : undefined
  const checklistSessionId = next ? setupChecklistSessionId(next) : ""
  const snapshotChecklistSession = useMemo(
    () =>
      next
        ? setupChecklistSessionForRow(setupChecklistSessions, next)
        : undefined,
    [next, setupChecklistSessions]
  )
  const [localChecklistSession, setLocalChecklistSession] = useState<
    DashboardPayload | undefined
  >(undefined)
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLocalChecklistSession(
        checklistSessionId
          ? readStoredSetupChecklistSession(checklistSessionId)
          : undefined
      )
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [checklistSessionId])
  const matchingLocalChecklistSession =
    str(localChecklistSession?.sessionId) === checklistSessionId
      ? localChecklistSession
      : undefined
  const currentChecklistSession = mostCompleteSetupChecklistSession(
    snapshotChecklistSession,
    matchingLocalChecklistSession,
    nextStage?.id
  )
  const activeChecklistMasters = useMemo(
    () => activeSetupChecklistMasterRows(setupChecklistMasters),
    [setupChecklistMasters]
  )
  const checklistPhase =
    nextStage?.id === "presetting"
      ? "start"
      : nextStage?.id === "setting"
        ? "end"
        : ""
  const needsSetupChecklist = Boolean(
    checklistPhase && onSaveSetupChecklistSession
  )
  const needsWorkerSelection = nextStage?.id === "operator_started"
  const doneByOptions =
    nextStage?.id === "raw_material_at_machine"
      ? shopFloorOptions
      : nextStage?.id === "quality_approval"
        ? qualityOptions
        : machinistOptions
  const doneByRole =
    nextStage?.id === "raw_material_at_machine"
      ? "Shop Floor Employee"
      : nextStage?.id === "quality_approval"
        ? "Quality Employee"
        : "Machinist"
  const hasEligibleDoneBy = doneByOptions.some(
    (employee) => employee.name === doneBy
  )
  const hasEligibleWorker = workerOptions.some(
    (employee) => employee.name === worker
  )
  const setupChecklistReady =
    !needsSetupChecklist ||
    (Boolean(currentChecklistSession) &&
      setupChecklistValuesComplete(
        setupChecklistItemsForPhase(
          asArray(currentChecklistSession?.items),
          checklistPhase
        ),
        {},
        checklistPhase
      ))
  const checklistPageHref =
    next && checklistPhase
      ? setupChecklistPageHref(next, checklistPhase, doneBy)
      : ""
  const setupChecklistStatus = !needsSetupChecklist
    ? "Not required"
    : setupChecklistReady
      ? checklistPhase === "end"
        ? "Completion saved"
        : "Start saved"
      : currentChecklistSession
        ? "Saved progress"
        : "Checklist pending"
  useEffect(() => {
    if (!currentChecklistSession || !checklistPhase) return
    const savedMachinist = str(
      checklistPhase === "start"
        ? currentChecklistSession.startedBy
        : currentChecklistSession.endedBy
    )
    if (!savedMachinist) return
    const timeout = window.setTimeout(() => {
      setDoneBy((current) => current || savedMachinist)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [checklistPhase, currentChecklistSession])
  const firstPieceMasters = useMemo(
    () =>
      next && nextStage?.id === "quality_approval"
        ? matchingFirstPieceInspectionMasters(inspectionMasters, next)
        : [],
    [inspectionMasters, next, nextStage?.id]
  )
  const needsFirstPieceInspection =
    nextStage?.id === "quality_approval" && Boolean(onSaveFirstPieceReport)
  const firstPieceDraftKey =
    needsFirstPieceInspection && next ? firstPieceReportKey(next) : ""
  const [loadedFirstPieceDraftKey, setLoadedFirstPieceDraftKey] = useState("")
  const canSubmitInspection =
    !needsFirstPieceInspection ||
    (firstPieceMasters.length > 0 &&
      firstPieceMasters.every((master) =>
        firstPieceReadingsFor(inspectionReadings, master).every(Boolean)
      ))

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!firstPieceDraftKey) {
        setLoadedFirstPieceDraftKey("")
        return
      }
      const draft = readStoredFirstPieceInspectionDraft(firstPieceDraftKey)
      setDoneBy(draft?.approvedBy ?? "")
      setRemark(draft?.remark ?? "")
      setInspectionReadings(draft?.readings ?? {})
      setLoadedFirstPieceDraftKey(firstPieceDraftKey)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [firstPieceDraftKey])

  useEffect(() => {
    if (!firstPieceDraftKey || loadedFirstPieceDraftKey !== firstPieceDraftKey)
      return
    writeStoredFirstPieceInspectionDraft(firstPieceDraftKey, {
      approvedBy: doneBy,
      readings: inspectionReadings,
      remark,
    })
  }, [
    doneBy,
    firstPieceDraftKey,
    inspectionReadings,
    loadedFirstPieceDraftKey,
    remark,
  ])

  function updateInspectionReading(
    master: DashboardPayload,
    pieceIndex: number,
    value: string
  ) {
    const masterKey = firstPieceMasterKey(master)
    setInspectionReadings((currentReadings) => {
      const readings = [
        ...(currentReadings[masterKey] ?? Array.from({ length: 5 }, () => "")),
      ]
      readings[pieceIndex] = value
      return { ...currentReadings, [masterKey]: readings }
    })
  }

  async function submitNextStage() {
    if (!next || !nextStage || isSubmitting) return
    if (!hasEligibleDoneBy || (needsWorkerSelection && !hasEligibleWorker))
      return
    if (nextStage.id === "quality_approval" && !canSubmitInspection) return
    if (needsSetupChecklist && !setupChecklistReady) return
    setIsSubmitting(true)
    try {
      const taskCompletedAt = new Date().toISOString()
      const firstPieceInspection = needsFirstPieceInspection
        ? {
            reportId: firstPieceReportKey(next),
            taskAssignedAt: str(next.shopFloorUpdatedAt),
            taskCompletedAt,
            checkedPieces: 5,
            dimensions: firstPieceMasters.map((master) => ({
              parameterCode: qualityParameterCode(master),
              parameterName: qualityParameterName(master),
              uid: str(master.uid),
              description: str(master.description),
              instrumentUsed: str(master.instrumentUsed),
              specification: str(master.specification),
              tolerancePlus: optionalNumber(master.tolerancePlus),
              toleranceMinus: optionalNumber(master.toleranceMinus),
              readings: firstPieceReadingsFor(inspectionReadings, master).map(
                (value) => optionalNumber(value) ?? value
              ),
            })),
          }
        : undefined
      if (
        needsFirstPieceInspection &&
        firstPieceInspection &&
        onSaveFirstPieceReport
      ) {
        await onSaveFirstPieceReport(next, {
          ...firstPieceInspection,
          approvedBy: doneBy,
          remark,
        })
      }
      const setupChecklist = needsSetupChecklist
        ? currentChecklistSession
        : undefined
      await onSaveStage(next, nextStage.id, {
        doneBy,
        worker: nextStage.id === "operator_started" ? worker : "",
        remark,
        firstPieceInspection,
        setupChecklist,
      })
      if (firstPieceDraftKey)
        removeStoredFirstPieceInspectionDraft(firstPieceDraftKey)
      setDoneBy("")
      setWorker("")
      setRemark("")
      setInspectionReadings({})
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitCurrentStageComplete() {
    if (!current || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSaveStage(current, "item_complete")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (current) {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value="Running" />
          <span className="text-sm text-muted-foreground">
            Worker: {displayValue(current.shopFloorWorker)}
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={isSubmitting}
          onClick={() => void submitCurrentStageComplete()}
        >
          <CheckCircle2 className="size-4" />
          Item Finished
        </Button>
      </div>
    )
  }

  if (!next) {
    return (
      <span className="text-sm text-muted-foreground">No Action Pending</span>
    )
  }

  if (nextStage && next.shopFloorTaskReady === false) {
    return (
      <div className="grid gap-2">
        <ShopFloorProgress activeIndex={stageIndex} />
        <StatusBadge value="Task not ready" />
        <div className="text-sm text-muted-foreground">
          {displayValue(next.shopFloorTaskBlocker) ||
            "Previous setup WIP buffer is not ready"}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <ShopFloorProgress activeIndex={stageIndex} />
      {nextStage ? (
        <>
          <div className="text-sm font-medium">{nextStage.label}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <SearchableSelect
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={doneBy}
              onChange={(event) => setDoneBy(event.target.value)}
            >
              <option value="">
                {doneByOptions.length
                  ? `Select ${doneByRole}`
                  : `No ${doneByRole}s In This Production Unit`}
              </option>
              {doneByOptions.map((employee) => (
                <option key={employee.code} value={employee.name}>
                  {employee.code} - {employee.name}
                </option>
              ))}
            </SearchableSelect>
            {nextStage.id === "operator_started" ? (
              <SearchableSelect
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={worker}
                onChange={(event) => setWorker(event.target.value)}
              >
                <option value="">
                  {workerOptions.length
                    ? "Select Worker"
                    : "No Workers In This Production Unit's Shop Floor"}
                </option>
                {workerOptions.map((workerOption) => (
                  <option key={workerOption.code} value={workerOption.name}>
                    {workerOption.code} - {workerOption.name}
                  </option>
                ))}
              </SearchableSelect>
            ) : (
              <Input
                className="h-8"
                value={remark}
                placeholder="Remark"
                onChange={(event) => setRemark(event.target.value)}
              />
            )}
          </div>
          {nextStage.id === "operator_started" ? (
            <Input
              className="h-8"
              value={remark}
              placeholder="Remark"
              onChange={(event) => setRemark(event.target.value)}
            />
          ) : null}
          {needsSetupChecklist ? (
            <div className="grid gap-2 rounded-md border bg-background p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">Setup Checklist</div>
                <StatusBadge value={setupChecklistStatus} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  disabled={!hasEligibleDoneBy}
                  onClick={() => {
                    window.location.href = checklistPageHref
                  }}
                >
                  Open Checklist
                </Button>
                {checklistPhase === "start" &&
                !activeChecklistMasters.length &&
                openDataEntry ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    onClick={() =>
                      openDataEntry(
                        "setup_checklist_master",
                        setupChecklistMasterDefaults()
                      )
                    }
                  >
                    Add Setup Checklist
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
              showDraftSaved={loadedFirstPieceDraftKey === firstPieceDraftKey}
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={
              !canSubmitInspection ||
              !setupChecklistReady ||
              !hasEligibleDoneBy ||
              (needsWorkerSelection && !hasEligibleWorker) ||
              isSubmitting
            }
            onClick={() => void submitNextStage()}
          >
            <CheckCircle2 className="size-4" />
            {nextStage.button}
          </Button>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          {shopFloorNoPendingActionLabel(next.shopFloorStage)}
        </div>
      )}
    </div>
  )
}

const DEFAULT_CRATE_WEIGHT_KG = 1.1
const CRATE_WEIGHT_OPTIONS_KG = [1.1, 1.25, 1.5, 2]

const DEFAULT_REJECTION_TYPE_OPTIONS = [
  { code: "T1", label: "Quality Process Rejection" },
  { code: "T2", label: "Quality Control Rejection" },
  { code: "T3", label: "Setup Rejection" },
  { code: "T4", label: "In Process Setup Rejection" },
]

const DEFAULT_REJECTION_REMARK_OPTIONS = [
  { code: "R1", label: "Machine Malfunction" },
  { code: "R2", label: "Machine Setting Issue" },
  { code: "R3", label: "Operator Error" },
  { code: "R4", label: "Drawing Error" },
  { code: "R5", label: "Parameter Missed" },
  { code: "R6", label: "Measuring Instrument Issue" },
  { code: "R7", label: "Qc Inspection Error" },
]

const DEFAULT_REJECTION_REASON_OPTIONS = [
  { code: "D1", label: "Length Short" },
  { code: "D2", label: "Raw Material Defect" },
  { code: "D3", label: "Thread Missing" },
  { code: "D4", label: "Operation Incomplete" },
  { code: "D5", label: "Tap Marks" },
  { code: "D6", label: "Flat Barb" },
  { code: "D7", label: "Hex Bent" },
  { code: "D8", label: "Step In Hole" },
  { code: "D9", label: "Incomplete Hole" },
  { code: "D10", label: "Dent On Thread" },
  { code: "D11", label: "Forging Defect" },
  { code: "D12", label: "Thread Gauge Fail" },
  { code: "D13", label: "Hole Missing" },
  { code: "D14", label: "Dent On Degree" },
  { code: "D15", label: "Plating Defect" },
  { code: "D16", label: "Knurling Defect" },
  { code: "D17", label: "Broken Part" },
  { code: "D18", label: "Dent On Face" },
  { code: "D19", label: "Coating Defect" },
  { code: "D20", label: "Hole Shifted" },
  { code: "D21", label: "Thread Not Straight" },
  { code: "D22", label: "Vibration On Thread" },
  { code: "D23", label: "Incomplete Thread" },
  { code: "D24", label: "Flat Thread" },
  { code: "D25", label: "Face Uneven" },
  { code: "D26", label: "Turning Bent" },
  { code: "D27", label: "Vibration On Face" },
  { code: "D28", label: "Dent On Hex" },
  { code: "D29", label: "Burr On Hex" },
  { code: "D30", label: "Vibration On Barb" },
  { code: "D31", label: "Dent On Barb" },
  { code: "D32", label: "Barb Deformed" },
  { code: "D33", label: "Burr On Barb" },
  { code: "D34", label: "Dent On Turning" },
  { code: "D35", label: "Vibration On Turning" },
  { code: "D36", label: "Burr In Hole" },
  { code: "D37", label: "Vibration In Hole" },
  { code: "D38", label: "Die Marks" },
  { code: "D39", label: "Vibration On Degree" },
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
  { code: "D59", label: "Electricity Failure" },
  { code: "D60", label: "No Raw Material" },
  { code: "D61", label: "No Operator" },
]

function codedMasterOptions(
  rows: DashboardPayload[],
  defaults: Array<{ code: string; label: string }>,
  labelFields: string[]
) {
  const options = new Map(defaults.map((option) => [option.code, option]))
  for (const row of rows) {
    if (displayValue(row.status).toLowerCase() === "inactive") continue
    const code = displayValue(row.code)
    if (!code || code === "-") continue
    const label =
      labelFields
        .map((field) => displayValue(row[field]))
        .find((value) => value && value !== "-") ?? code
    options.set(code, { code, label })
  }
  return [...options.values()]
}

function codedMasterLabel(
  options: Array<{ code: string; label: string }>,
  code: string
) {
  return options.find((option) => option.code === code)?.label ?? code
}

function CompactEntryField({
  label,
  children,
  className = "",
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <Label
      className={`grid min-w-0 gap-0.5 text-[11px] font-medium text-muted-foreground ${className}`}
    >
      <span>{label}</span>
      {children}
    </Label>
  )
}

function ProductionCardRoleEntryForm({
  role,
  rows,
  existingCardRows: sessionRows = [],
  employeeMasterError,
  employeeMasterLoaded = false,
  employeeOptions = [],
  rejectionTypeRows = [],
  rejectionReasonRows = [],
  rejectionRemarkRows = [],
  onSaveProductionCard,
}: {
  role: RoleTaskKind
  rows: DashboardPayload[]
  existingCardRows?: DashboardPayload[]
  employeeMasterError?: string
  employeeMasterLoaded?: boolean
  employeeOptions?: Array<{ code: string; name: string }>
  bulkRows?: DashboardPayload[]
  rejectionTypeRows?: DashboardPayload[]
  rejectionReasonRows?: DashboardPayload[]
  rejectionRemarkRows?: DashboardPayload[]
  onSaveProductionCard: (
    row: DashboardPayload,
    card: DashboardPayload
  ) => Promise<void>
}) {
  type EntryKind = "session" | "downtime" | "rejection" | "close"
  const floor = productionFloorFromLocation()
  const isCnc = floor === "cnc"
  const today = istDateValue()
  const [entryKind, setEntryKind] = useState<EntryKind>(
    role === "machinist"
      ? "downtime"
      : role === "quality"
        ? isCnc
          ? "close"
          : "downtime"
        : "session"
  )
  const [selectedKey, setSelectedKey] = useState("")
  const [prodDate, setProdDate] = useState(today)
  const [shift, setShift] = useState("Day")
  const [operatorCode, setOperatorCode] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [measurementMethod, setMeasurementMethod] = useState<
    "" | "counter" | "weight"
  >(isCnc ? "" : "weight")
  const [startCount, setStartCount] = useState("")
  const [endCount, setEndCount] = useState("")
  const [endReason, setEndReason] = useState("shift_change")
  const [grossWeightKg, setGrossWeightKg] = useState("")
  const [crateCount, setCrateCount] = useState("")
  const [crateWeightKg, setCrateWeightKg] = useState(
    String(DEFAULT_CRATE_WEIGHT_KG)
  )
  const [downtimeCode, setDowntimeCode] = useState("")
  const [rejectionTypeCode, setRejectionTypeCode] = useState("")
  const [rejectionReasonCode, setRejectionReasonCode] = useState("")
  const [rejectionRemarkCode, setRejectionRemarkCode] = useState("")
  const [rejectedPieces, setRejectedPieces] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const rowOptions = useMemo(
    () =>
      rows.map((row) => ({
        key: shopFloorPlanKey(row),
        label: `${displayValue(row.machine)} - ${itemCode(row)} / setup ${displayValue(row.setupNo)}`,
      })),
    [rows]
  )
  const selectedRow = rows.find((row) => shopFloorPlanKey(row) === selectedKey)
  const matchingSessions = useMemo(
    () =>
      selectedRow
        ? sessionRows.filter((session) =>
            productionSessionMatchesPlan(session, selectedRow)
          )
        : [],
    [selectedRow, sessionRows]
  )
  const openSession = matchingSessions.find(
    (session) => str(session.status) === "open"
  )
  const previousClosedSession = sessionRows
    .filter((session) => str(session.status) === "closed")
    .filter((session) =>
      sameProductionCardText(
        session.machineNumber || session.machine,
        selectedRow?.machine
      )
    )
    .sort((left, right) =>
      str(right.endedAt).localeCompare(str(left.endedAt))
    )[0]
  const carriedStartCount =
    selectedRow &&
    previousClosedSession &&
    productionSessionMatchesPlan(previousClosedSession, selectedRow) &&
    str(previousClosedSession.measurementMethod) === "counter" &&
    optionalNumber(previousClosedSession.endCount) !== undefined
      ? (optionalNumber(previousClosedSession.endCount) ?? null)
      : null
  const effectiveStartCount =
    carriedStartCount ?? optionalNumber(startCount) ?? 0
  const effectiveMethod = openSession
    ? (str(openSession.measurementMethod) as "counter" | "weight")
    : measurementMethod
  const pieceWeightGrams = selectedRow
    ? productionPieceWeightGrams(selectedRow)
    : 0
  const rejectionTypeOptions = useMemo(
    () =>
      codedMasterOptions(rejectionTypeRows, DEFAULT_REJECTION_TYPE_OPTIONS, [
        "typeOfRejection",
        "rejectionType",
        "name",
      ]),
    [rejectionTypeRows]
  )
  const rejectionReasonOptions = useMemo(
    () =>
      codedMasterOptions(
        rejectionReasonRows,
        DEFAULT_REJECTION_REASON_OPTIONS,
        ["rejectionReason", "reason", "name", "downtimeReason", "description"]
      ),
    [rejectionReasonRows]
  )
  const rejectionRemarkOptions = useMemo(
    () =>
      codedMasterOptions(
        rejectionRemarkRows,
        DEFAULT_REJECTION_REMARK_OPTIONS,
        ["rejectionRemark", "remark", "name"]
      ),
    [rejectionRemarkRows]
  )
  const selectedDowntime = rejectionReasonOptions.find(
    (option) => option.code === downtimeCode
  )
  const selectedType = rejectionTypeOptions.find(
    (option) => option.code === rejectionTypeCode
  )
  const selectedReason = rejectionReasonOptions.find(
    (option) => option.code === rejectionReasonCode
  )
  const selectedRemark = rejectionRemarkOptions.find(
    (option) => option.code === rejectionRemarkCode
  )
  const netWeightKg = Math.max(
    numeric(grossWeightKg) - numeric(crateCount) * numeric(crateWeightKg),
    0
  )
  const totalPieces =
    effectiveMethod === "counter"
      ? Math.max(
          numeric(endCount) -
            (optionalNumber(openSession?.startCount) ?? effectiveStartCount),
          0
        )
      : pieceWeightGrams > 0
        ? Math.floor((netWeightKg * 1000) / pieceWeightGrams)
        : 0
  const sessionRejectedPieces = optionalNumber(openSession?.rejectedPieces) ?? 0
  const goodPieces = Math.max(totalPieces - sessionRejectedPieces, 0)
  const compactInputClass = "h-8 text-xs"
  const compactSelectClass =
    "h-8 w-full min-w-0 rounded-md border bg-background px-2 text-xs"
  const selectedEmployee = employeeOptions.find(
    (employee) => employee.code === operatorCode
  )
  const isSessionEntry = entryKind === "session" || entryKind === "close"
  const isClosing = isSessionEntry && Boolean(openSession)
  const canQualityClose = role === "quality" && isCnc && entryKind === "close"
  const canSave =
    Boolean(selectedRow) &&
    (entryKind === "downtime"
      ? Boolean(openSession && downtimeCode && startTime && endTime)
      : entryKind === "rejection"
        ? Boolean(
            openSession &&
            rejectionTypeCode &&
            rejectionReasonCode &&
            rejectionRemarkCode &&
            numeric(rejectedPieces) > 0
          )
        : isClosing
          ? Boolean(
              endTime &&
              endReason &&
              (effectiveMethod === "counter"
                ? numeric(endCount) >=
                  (optionalNumber(openSession?.startCount) ?? 0)
                : grossWeightKg !== "" &&
                  crateCount !== "" &&
                  numeric(grossWeightKg) >= 0 &&
                  pieceWeightGrams > 0)
            )
          : role === "shopFloor" &&
            Boolean(
              operatorCode &&
              startTime &&
              shift &&
              pieceWeightGrams > 0 &&
              effectiveMethod &&
              (effectiveMethod !== "counter" ||
                carriedStartCount !== null ||
                startCount !== "")
            ))

  function selectMachine(key: string) {
    setSelectedKey(key)
    setMeasurementMethod(floor === "cnc" ? "" : "weight")
    setStartCount("")
    setEndCount("")
    setStartTime("")
    setEndTime("")
    setGrossWeightKg("")
    setCrateCount("")
  }

  async function save() {
    if (!selectedRow || !canSave || isSaving) return
    setIsSaving(true)
    try {
      if (entryKind === "downtime" && openSession) {
        await onSaveProductionCard(selectedRow, {
          endedAt: productionSessionTimestamp(prodDate, endTime, startTime),
          enteredRole: productionSessionRole(role),
          entryType: "production_session_downtime",
          reasonCode: downtimeCode,
          reasonName: selectedDowntime?.label ?? "",
          sessionId: openSession.id,
          startedAt: productionSessionTimestamp(prodDate, startTime),
        })
        setDowntimeCode("")
        setStartTime("")
        setEndTime("")
        return
      }
      if (entryKind === "rejection" && openSession) {
        await onSaveProductionCard(selectedRow, {
          entryType: "production_session_rejection",
          quantity: numeric(rejectedPieces),
          reasonCode: rejectionReasonCode,
          reasonName: selectedReason?.label ?? "",
          remarkCode: rejectionRemarkCode,
          remarkName: selectedRemark?.label ?? "",
          sessionId: openSession.id,
          typeCode: rejectionTypeCode,
          typeName: selectedType?.label ?? "",
        })
        setRejectedPieces("")
        setRejectionTypeCode("")
        setRejectionReasonCode("")
        setRejectionRemarkCode("")
        return
      }
      if (isClosing && openSession) {
        const started = new Date(str(openSession.startedAt))
        await onSaveProductionCard(selectedRow, {
          crateCount:
            effectiveMethod === "weight" ? numeric(crateCount) : undefined,
          crateWeightKg:
            effectiveMethod === "weight" ? numeric(crateWeightKg) : undefined,
          endCount:
            effectiveMethod === "counter" ? numeric(endCount) : undefined,
          endedAt: productionSessionTimestamp(
            isoDateValue(openSession.productionDate) || prodDate,
            endTime,
            undefined,
            started
          ),
          endReason,
          entryType: "production_session_close",
          grossWeightKg:
            effectiveMethod === "weight" ? numeric(grossWeightKg) : undefined,
          sessionId: openSession.id,
        })
        setEndTime("")
        setEndCount("")
        setGrossWeightKg("")
        setCrateCount("")
        return
      }
      await onSaveProductionCard(selectedRow, {
        entryType: "production_session_start",
        measurementMethod: effectiveMethod,
        operatorCode,
        operatorName: selectedEmployee?.name ?? "",
        prodDate,
        productionDate: prodDate,
        shift,
        startCount:
          effectiveMethod === "counter" && carriedStartCount === null
            ? numeric(startCount)
            : undefined,
        startedAt: productionSessionTimestamp(prodDate, startTime),
      })
      setOperatorCode("")
      setStartTime("")
      setStartCount("")
    } finally {
      setIsSaving(false)
    }
  }

  const availableKinds: Array<{ id: EntryKind; label: string }> =
    role === "shopFloor"
      ? [
          {
            id: "session",
            label: openSession ? "End Session" : "Start Session",
          },
          { id: "downtime", label: "Downtime" },
        ]
      : role === "quality"
        ? [
            ...(isCnc
              ? [{ id: "close" as const, label: "Close CNC Session" }]
              : []),
            { id: "downtime", label: "Downtime" },
            { id: "rejection", label: "Rejection" },
          ]
        : [{ id: "downtime", label: "Downtime" }]

  return (
    <div className="grid gap-3 rounded-md border bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Production Sessions</div>
          <div className="text-xs text-muted-foreground">
            Planning And Master Data Are Filled Automatically.
          </div>
        </div>
        <StatusBadge
          value={
            openSession
              ? `Running / ${displayValue(openSession.operatorCode)}`
              : "No open session"
          }
        />
      </div>
      <div
        className="inline-flex w-fit flex-wrap gap-1 rounded-md border bg-background p-1"
        role="group"
        aria-label="Production session action"
      >
        {availableKinds.map((kind) => (
          <Button
            key={kind.id}
            type="button"
            size="sm"
            className="h-7 px-3 text-xs"
            variant={entryKind === kind.id ? "default" : "ghost"}
            onClick={() => setEntryKind(kind.id)}
          >
            {kind.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-6">
        <CompactEntryField className="lg:col-span-2" label="Machine No.">
          <SearchableSelect
            className={compactSelectClass}
            value={selectedKey}
            onChange={(event) => selectMachine(event.target.value)}
          >
            <option value="">Select Machine</option>
            {rowOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </SearchableSelect>
        </CompactEntryField>
        <CompactEntryField label="Date">
          <Input
            className={compactInputClass}
            type="date"
            value={prodDate}
            onChange={(event) => setProdDate(event.target.value)}
          />
        </CompactEntryField>
        <CompactEntryField label="Shift">
          <SearchableSelect
            className={compactSelectClass}
            value={shift}
            onChange={(event) => setShift(event.target.value)}
            disabled={
              isClosing || entryKind === "downtime" || entryKind === "rejection"
            }
          >
            <option value="Day">Day</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="Night">Night</option>
            <option value="General">General</option>
          </SearchableSelect>
        </CompactEntryField>
        {selectedRow ? (
          <div className="flex min-h-8 items-center rounded-md border bg-background px-2 lg:col-span-2">
            <ShopFloorItemSummary row={selectedRow} tone="current" compact />
          </div>
        ) : null}
      </div>

      {selectedRow ? (
        <div className="grid gap-1.5 rounded-md border bg-background p-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Job Card: </span>
            {jobCardNumber(selectedRow)}
          </div>
          <div>
            <span className="text-muted-foreground">Part: </span>
            {itemCode(selectedRow)}
          </div>
          <div>
            <span className="text-muted-foreground">Option / Setup: </span>
            {displayValue(selectedRow.optionNumber)} /{" "}
            {displayValue(selectedRow.setupNo)}
          </div>
          <div>
            <span className="text-muted-foreground">
              Cycle / Piece Weight:{" "}
            </span>
            {formatNumber(productionCycleSeconds(selectedRow))} sec /{" "}
            {formatNumber(pieceWeightGrams)} g
          </div>
        </div>
      ) : null}

      {isSessionEntry && !isClosing && role === "shopFloor" ? (
        <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <CompactEntryField label="Operator Code">
            <SearchableSelect
              className={compactSelectClass}
              disabled={!employeeOptions.length}
              value={operatorCode}
              onChange={(event) => setOperatorCode(event.target.value)}
            >
              <option value="">
                {employeeMasterError
                  ? "Employee Master Unavailable"
                  : !employeeMasterLoaded
                    ? "Loading Employee Master"
                    : "Select Operator"}
              </option>
              {employeeOptions.map((employee) => (
                <option key={employee.code} value={employee.code}>
                  {employee.code} - {employee.name}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Machine Start">
            <Input
              className={compactInputClass}
              value={startTime}
              placeholder="HH:mm"
              onChange={(event) =>
                setStartTime(time24Input(event.target.value))
              }
            />
          </CompactEntryField>
          {isCnc ? (
            <CompactEntryField label="Production Method">
              <SearchableSelect
                className={compactSelectClass}
                value={measurementMethod}
                onChange={(event) =>
                  setMeasurementMethod(
                    event.target.value as "" | "counter" | "weight"
                  )
                }
              >
                <option value="">Select Method</option>
                <option value="counter">Machine Counter</option>
                <option value="weight">Weight</option>
              </SearchableSelect>
            </CompactEntryField>
          ) : null}
          {effectiveMethod === "counter" ? (
            <CompactEntryField label="Machine Start Count">
              <Input
                className={compactInputClass}
                type="number"
                min="0"
                value={carriedStartCount ?? startCount}
                readOnly={carriedStartCount !== null}
                onChange={(event) => setStartCount(event.target.value)}
              />
            </CompactEntryField>
          ) : null}
          {carriedStartCount !== null ? (
            <div className="flex items-end pb-1 text-xs text-muted-foreground">
              Previous end count carried automatically.
            </div>
          ) : null}
        </div>
      ) : null}

      {isSessionEntry &&
      isClosing &&
      (role === "shopFloor" || canQualityClose) ? (
        <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <CompactEntryField label="Operator">
            <Input
              className={compactInputClass}
              readOnly
              value={`${displayValue(openSession?.operatorCode)} - ${displayValue(openSession?.operatorName)}`}
            />
          </CompactEntryField>
          <CompactEntryField label="Machine End">
            <Input
              className={compactInputClass}
              value={endTime}
              placeholder="HH:mm"
              onChange={(event) => setEndTime(time24Input(event.target.value))}
            />
          </CompactEntryField>
          <CompactEntryField label="End Reason">
            <SearchableSelect
              className={compactSelectClass}
              value={endReason}
              onChange={(event) => setEndReason(event.target.value)}
            >
              <option value="shift_change">Shift Change</option>
              <option value="operator_change">Operator Change</option>
              <option value="item_complete">Item Complete</option>
              <option value="job_change">Job / Setup Change</option>
              <option value="manual_stop">Manual Stop</option>
            </SearchableSelect>
          </CompactEntryField>
          {effectiveMethod === "counter" ? (
            <CompactEntryField label="Machine End Count">
              <Input
                className={compactInputClass}
                type="number"
                min={optionalNumber(openSession?.startCount) ?? 0}
                value={endCount}
                onChange={(event) => setEndCount(event.target.value)}
              />
            </CompactEntryField>
          ) : (
            <>
              <CompactEntryField label="Gross Produced Kg">
                <Input
                  className={compactInputClass}
                  type="number"
                  min="0"
                  step="0.001"
                  value={grossWeightKg}
                  onChange={(event) => setGrossWeightKg(event.target.value)}
                />
              </CompactEntryField>
              <CompactEntryField label="Crates Used">
                <Input
                  className={compactInputClass}
                  type="number"
                  min="0"
                  step="1"
                  value={crateCount}
                  onChange={(event) => setCrateCount(event.target.value)}
                />
              </CompactEntryField>
              <CompactEntryField label="Crate Weight Kg">
                <SearchableSelect
                  className={compactSelectClass}
                  value={crateWeightKg}
                  onChange={(event) => setCrateWeightKg(event.target.value)}
                >
                  {CRATE_WEIGHT_OPTIONS_KG.map((weight) => (
                    <option key={weight} value={String(weight)}>
                      {formatNumber(weight)} Kg
                    </option>
                  ))}
                </SearchableSelect>
              </CompactEntryField>
            </>
          )}
          <CompactEntryField label="Total Produced">
            <Input
              className={compactInputClass}
              readOnly
              value={formatNumber(totalPieces)}
            />
          </CompactEntryField>
          <CompactEntryField label="QC Rejected">
            <Input
              className={compactInputClass}
              readOnly
              value={formatNumber(sessionRejectedPieces)}
            />
          </CompactEntryField>
          <CompactEntryField label="Good Pieces">
            <Input
              className={compactInputClass}
              readOnly
              value={formatNumber(goodPieces)}
            />
          </CompactEntryField>
        </div>
      ) : null}

      {entryKind === "downtime" ? (
        <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <CompactEntryField label="Downtime Code">
            <SearchableSelect
              className={compactSelectClass}
              value={downtimeCode}
              onChange={(event) => setDowntimeCode(event.target.value)}
            >
              <option value="">Select Code</option>
              {rejectionReasonOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} - {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Start">
            <Input
              className={compactInputClass}
              value={startTime}
              placeholder="HH:mm"
              onChange={(event) =>
                setStartTime(time24Input(event.target.value))
              }
            />
          </CompactEntryField>
          <CompactEntryField label="End">
            <Input
              className={compactInputClass}
              value={endTime}
              placeholder="HH:mm"
              onChange={(event) => setEndTime(time24Input(event.target.value))}
            />
          </CompactEntryField>
          <CompactEntryField label="Minutes">
            <Input
              className={compactInputClass}
              readOnly
              value={formatNumber(
                productionCardRuntimeMinutes(prodDate, startTime, endTime)
              )}
            />
          </CompactEntryField>
        </div>
      ) : null}

      {entryKind === "rejection" ? (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          <CompactEntryField label="Rejection Type">
            <SearchableSelect
              className={compactSelectClass}
              value={rejectionTypeCode}
              onChange={(event) => setRejectionTypeCode(event.target.value)}
            >
              <option value="">Select Type</option>
              {rejectionTypeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} - {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Rejection Reason">
            <SearchableSelect
              className={compactSelectClass}
              value={rejectionReasonCode}
              onChange={(event) => setRejectionReasonCode(event.target.value)}
            >
              <option value="">Select Reason</option>
              {rejectionReasonOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} - {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Rejection Remark">
            <SearchableSelect
              className={compactSelectClass}
              value={rejectionRemarkCode}
              onChange={(event) => setRejectionRemarkCode(event.target.value)}
            >
              <option value="">Select Remark</option>
              {rejectionRemarkOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} - {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Rejected Pcs">
            <Input
              className={compactInputClass}
              type="number"
              min="1"
              step="1"
              value={rejectedPieces}
              onChange={(event) => setRejectedPieces(event.target.value)}
            />
          </CompactEntryField>
        </div>
      ) : null}

      {!openSession &&
      (entryKind === "downtime" ||
        entryKind === "rejection" ||
        entryKind === "close") &&
      selectedRow ? (
        <div className="text-xs text-amber-700 dark:text-amber-300">
          Start the production session before recording this action.
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="h-8 w-fit"
        disabled={!canSave || isSaving}
        onClick={() => void save()}
      >
        <CheckCircle2 className="size-4" />
        {entryKind === "downtime"
          ? "Save Downtime"
          : entryKind === "rejection"
            ? "Save Rejection"
            : isClosing
              ? "Close Session"
              : "Start Session"}
      </Button>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium">Current Production Sessions</div>
          <div className="text-[11px] text-muted-foreground">
            Running sessions appear against their machine.
          </div>
        </div>
        <div className="max-h-64 overflow-auto rounded-md border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead>Job / Setup</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const session = sessionRows.find(
                  (candidate) =>
                    str(candidate.status) === "open" &&
                    productionSessionMatchesPlan(candidate, row)
                )
                return (
                  <TableRow key={shopFloorPlanKey(row)}>
                    <TableCell className="font-medium">
                      {displayValue(row.machine)}
                    </TableCell>
                    <TableCell>
                      {jobCardNumber(row)} / {displayValue(row.setupNo)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        value={session ? "Running" : "Not Started"}
                      />
                    </TableCell>
                    <TableCell>
                      {session
                        ? `${displayValue(session.operatorCode)} - ${displayValue(session.operatorName)}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => selectMachine(shopFloorPlanKey(row))}
                      >
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium">Stored Sessions</div>
            <div className="text-[11px] text-muted-foreground">
              Open sessions and completed sessions from the last 7 days.
            </div>
          </div>
          <StatusBadge value={`${formatNumber(sessionRows.length)} saved`} />
        </div>
        {sessionRows.length ? (
          <div className="max-h-72 overflow-auto rounded-md border bg-background">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Job / Setup</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Start / End</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Good</TableHead>
                  <TableHead className="text-right">Downtime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionRows.map((session) => (
                  <TableRow key={str(session.id)}>
                    <TableCell>
                      <StatusBadge
                        value={
                          str(session.status) === "open" ? "Running" : "Closed"
                        }
                      />
                      <div
                        className="mt-1 font-mono text-[10px] text-muted-foreground"
                        title={str(session.id)}
                      >
                        {str(session.id).slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {displayValue(session.machineNumber)}
                    </TableCell>
                    <TableCell>
                      <div>
                        {displayValue(session.jobCardNumber)} /{" "}
                        {displayValue(session.setupNumber)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {displayValue(session.partCode)} · Option{" "}
                        {displayValue(session.optionNumber)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {displayValue(session.operatorCode)} -{" "}
                      {displayValue(session.operatorName)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <div>
                        {str(session.startedAt)
                          ? formatDate(str(session.startedAt))
                          : "-"}
                      </div>
                      <div className="text-muted-foreground">
                        {str(session.endedAt)
                          ? formatDate(str(session.endedAt))
                          : "Still running"}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {displayValue(session.measurementMethod)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(optionalNumber(session.totalPieces) ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(
                        optionalNumber(session.rejectedPieces) ?? 0
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatNumber(optionalNumber(session.goodPieces) ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(
                        optionalNumber(session.downtimeMinutes) ?? 0
                      )}{" "}
                      min
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-background p-4 text-center text-xs text-muted-foreground">
            No sessions stored yet. Shop Floor must start the first session for
            a running machine.
          </div>
        )}
      </div>
    </div>
  )
}

function productionSessionRole(role: RoleTaskKind) {
  return role === "shopFloor" ? "shop_floor" : role
}

function productionSessionMatchesPlan(
  session: DashboardPayload,
  row: DashboardPayload
) {
  return (
    sameProductionCardText(
      session.machineNumber || session.machine,
      row.machine
    ) &&
    sameProductionCardText(
      session.jobCardNumber || session.jobCard || session.jcNo,
      jobCardNumber(row)
    ) &&
    sameProductionCardText(session.partCode, itemCode(row)) &&
    sameProductionCardText(session.optionNumber, row.optionNumber) &&
    sameProductionCardText(session.setupNumber || session.setupNo, row.setupNo)
  )
}

function productionSessionTimestamp(
  date: string,
  time: string,
  startTime?: string,
  notBefore?: Date
) {
  const timestamp = new Date(`${date}T${time}:00`)
  const start = startTime ? new Date(`${date}T${startTime}:00`) : notBefore
  if (start && timestamp < start) timestamp.setDate(timestamp.getDate() + 1)
  return timestamp.toISOString()
}

export function LegacyProductionCardRoleEntryForm({
  role,
  rows,
  existingCardRows = [],
  employeeMasterError,
  employeeMasterLoaded = false,
  employeeOptions = [],
  bulkRows = [],
  rejectionTypeRows = [],
  rejectionReasonRows = [],
  rejectionRemarkRows = [],
  onSaveProductionCard,
}: {
  role: RoleTaskKind
  rows: DashboardPayload[]
  existingCardRows?: DashboardPayload[]
  employeeMasterError?: string
  employeeMasterLoaded?: boolean
  employeeOptions?: Array<{ code: string; name: string }>
  bulkRows?: DashboardPayload[]
  rejectionTypeRows?: DashboardPayload[]
  rejectionReasonRows?: DashboardPayload[]
  rejectionRemarkRows?: DashboardPayload[]
  onSaveProductionCard: (
    row: DashboardPayload,
    card: DashboardPayload
  ) => Promise<void>
}) {
  const today = istDateValue()
  const [selectedKey, setSelectedKey] = useState("")
  const [prodDate, setProdDate] = useState(today)
  const [shift, setShift] = useState("Day")
  const [operatorNumber, setOperatorNumber] = useState("")

  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [cycleSecondsByKey, setCycleSecondsByKey] = useState<
    Record<string, string>
  >({})
  const [pieceWeightByKey, setPieceWeightByKey] = useState<
    Record<string, string>
  >({})
  const [producedGrossKg, setProducedGrossKg] = useState("")
  const [cratesUsed, setCratesUsed] = useState("")
  const [crateWeightKg, setCrateWeightKg] = useState("1.1")
  const [downtimeCode, setDowntimeCode] = useState("")
  const [bulkDowntimeCode, setBulkDowntimeCode] = useState("")
  const [bulkDowntimeStart, setBulkDowntimeStart] = useState("")
  const [bulkDowntimeEnd, setBulkDowntimeEnd] = useState("")
  const [shopFloorEntryKind, setShopFloorEntryKind] = useState<
    "" | "production" | "bulkDowntime"
  >("")
  const [qualityEntryKind, setQualityEntryKind] = useState<
    "" | "downtime" | "rejection"
  >("")
  const [rejectionTypeCode, setRejectionTypeCode] = useState("")
  const [rejectionReasonCode, setRejectionReasonCode] = useState("")
  const [rejectionRemarkCode, setRejectionRemarkCode] = useState("")
  const [rejectedPieces, setRejectedPieces] = useState("")

  const [remarks, setRemarks] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const hydratedProductionCardKeyRef = useRef("")
  const rowOptions = useMemo(
    () =>
      rows.map((row) => ({
        key: shopFloorPlanKey(row),
        label: `${displayValue(row.machine)} - ${itemCode(row)} / setup ${displayValue(row.setupNo)}`,
      })),
    [rows]
  )
  const selectedEmployee = employeeOptions.find(
    (employee) => employee.code === operatorNumber
  )
  const rejectionTypeOptions = useMemo(
    () =>
      codedMasterOptions(rejectionTypeRows, DEFAULT_REJECTION_TYPE_OPTIONS, [
        "typeOfRejection",
        "rejectionType",
        "name",
      ]),
    [rejectionTypeRows]
  )
  const rejectionReasonOptions = useMemo(
    () =>
      codedMasterOptions(
        rejectionReasonRows,
        DEFAULT_REJECTION_REASON_OPTIONS,
        ["rejectionReason", "reason", "name", "downtimeReason", "description"]
      ),
    [rejectionReasonRows]
  )
  const downtimeReasonOptions = useMemo(
    () =>
      rejectionReasonOptions
        .map((option) => ({
          code: option.code,
          reason: option.label,
          label: `${option.code} - ${option.label}`,
        }))
        .sort((a, b) =>
          a.code.localeCompare(b.code, undefined, { numeric: true })
        ),
    [rejectionReasonOptions]
  )
  const downtimeReasonByCode = useMemo(
    () => new Map(downtimeReasonOptions.map((row) => [row.code, row.reason])),
    [downtimeReasonOptions]
  )
  const rejectionRemarkOptions = useMemo(
    () =>
      codedMasterOptions(
        rejectionRemarkRows,
        DEFAULT_REJECTION_REMARK_OPTIONS,
        ["rejectionRemark", "remark", "name"]
      ),
    [rejectionRemarkRows]
  )
  const selectedRow = rows.find((row) => shopFloorPlanKey(row) === selectedKey)
  const selectedOptionKey = selectedRow ? shopFloorPlanKey(selectedRow) : ""
  const selectedCardKind =
    role === "shopFloor"
      ? shopFloorEntryKind === "production"
        ? "production"
        : shopFloorEntryKind === "bulkDowntime"
          ? "bulk_downtime"
          : ""
      : role === "quality"
        ? qualityEntryKind
        : "downtime"
  const existingProductionCard = useMemo(() => {
    if (
      !selectedCardKind ||
      selectedCardKind === "bulk_downtime" ||
      !selectedRow
    )
      return undefined
    return existingCardRows
      .filter((card) =>
        productionCardMatchesSelection(
          card,
          selectedRow,
          role,
          selectedCardKind,
          prodDate,
          shift
        )
      )
      .sort((left, right) =>
        str(right.savedAt).localeCompare(str(left.savedAt))
      )[0]
  }, [existingCardRows, prodDate, role, selectedCardKind, selectedRow, shift])
  const defaultCycleSeconds = selectedRow
    ? productionCycleSeconds(selectedRow)
    : 0
  const defaultPieceWeightGram = selectedRow
    ? productionPieceWeightGrams(selectedRow)
    : 0
  const cycleSecondsInput =
    cycleSecondsByKey[selectedOptionKey] ??
    (defaultCycleSeconds ? String(defaultCycleSeconds) : "")
  const pieceWeightInput =
    pieceWeightByKey[selectedOptionKey] ??
    (defaultPieceWeightGram ? String(defaultPieceWeightGram) : "")
  const cycleSeconds = numeric(cycleSecondsInput) || defaultCycleSeconds
  const pieceWeightGram = numeric(pieceWeightInput) || defaultPieceWeightGram
  const grossKg = numeric(producedGrossKg)
  const crateCount = numeric(cratesUsed)
  const crateTareKg = numeric(crateWeightKg) || DEFAULT_CRATE_WEIGHT_KG
  const netProducedKg = Math.max(grossKg - crateCount * crateTareKg, 0)
  const producedPcs =
    pieceWeightGram > 0
      ? Math.floor((netProducedKg * 1000) / pieceWeightGram)
      : 0
  const shopFloorRuntimeMinutes = productionCardRuntimeMinutes(
    prodDate,
    startTime,
    endTime
  )
  const downtimeDurationMinutes = productionCardRuntimeMinutes(
    prodDate,
    startTime,
    endTime
  )
  const bulkDowntimeMinutes = productionCardRuntimeMinutes(
    prodDate,
    bulkDowntimeStart,
    bulkDowntimeEnd
  )
  const roleLabel =
    role === "shopFloor"
      ? "Shop floor production entry"
      : role === "quality"
        ? "Quality control entry"
        : "Machinist downtime entry"
  const hasEditedCycleSeconds =
    cycleSecondsByKey[selectedOptionKey] !== undefined &&
    cycleSecondsInput !== ""
  const hasEditedPieceWeight =
    pieceWeightByKey[selectedOptionKey] !== undefined && pieceWeightInput !== ""
  const hasChangedCrateWeight =
    crateWeightKg !== String(DEFAULT_CRATE_WEIGHT_KG)
  const hasShopFloorProductionEntry = Boolean(
    operatorNumber.trim() ||
    startTime ||
    endTime ||
    producedGrossKg ||
    cratesUsed ||
    hasEditedCycleSeconds ||
    hasEditedPieceWeight ||
    hasChangedCrateWeight
  )
  const hasShopFloorProductionOutput =
    grossKg > 0 && pieceWeightGram > 0 && producedPcs > 0
  const selectedDowntimeReason =
    downtimeReasonByCode.get(downtimeCode) ?? downtimeCode
  const selectedBulkDowntimeReason =
    downtimeReasonByCode.get(bulkDowntimeCode) ?? bulkDowntimeCode
  const selectedRejectionType = codedMasterLabel(
    rejectionTypeOptions,
    rejectionTypeCode
  )
  const selectedRejectionReason = codedMasterLabel(
    rejectionReasonOptions,
    rejectionReasonCode
  )
  const selectedRejectionRemark = codedMasterLabel(
    rejectionRemarkOptions,
    rejectionRemarkCode
  )
  const rejectQty = numeric(rejectedPieces)
  const isShopFloorProductionEntry =
    role === "shopFloor" && shopFloorEntryKind === "production"
  const isShopFloorBulkDowntimeEntry =
    role === "shopFloor" && shopFloorEntryKind === "bulkDowntime"
  const isQualityDowntimeEntry =
    role === "quality" && qualityEntryKind === "downtime"
  const isQualityRejectionEntry =
    role === "quality" && qualityEntryKind === "rejection"
  const isDowntimeEntry = role === "machinist" || isQualityDowntimeEntry
  const isRejectionEntry = isQualityRejectionEntry
  const hasDowntimeDetails = Boolean(
    downtimeCode && startTime && endTime && downtimeDurationMinutes > 0
  )
  const hasQualityRejectionDetails =
    role === "quality" &&
    Boolean(
      rejectionTypeCode &&
      rejectionReasonCode &&
      rejectionRemarkCode &&
      rejectQty > 0
    )

  const canSave =
    Boolean(selectedRow) &&
    (role === "shopFloor"
      ? isShopFloorProductionEntry && hasShopFloorProductionEntry
      : role === "quality"
        ? isQualityDowntimeEntry
          ? hasDowntimeDetails
          : isQualityRejectionEntry
            ? hasQualityRejectionDetails
            : false
        : hasDowntimeDetails)
  const canSaveBulkDowntime =
    isShopFloorBulkDowntimeEntry &&
    bulkRows.length > 0 &&
    Boolean(
      bulkDowntimeCode &&
      bulkDowntimeStart &&
      bulkDowntimeEnd &&
      bulkDowntimeMinutes > 0
    )
  const showSaveButton =
    role === "shopFloor"
      ? isShopFloorProductionEntry
      : role === "quality"
        ? Boolean(qualityEntryKind)
        : true

  useEffect(() => {
    if (
      !selectedCardKind ||
      selectedCardKind === "bulk_downtime" ||
      !selectedOptionKey
    )
      return
    const hydrationKey = existingProductionCard
      ? `${productionCardPatchKey(existingProductionCard)}|${optionalText(existingProductionCard.savedAt)}`
      : `${role}|${selectedCardKind}|${prodDate}|${shift}|${selectedOptionKey}|empty`
    if (hydratedProductionCardKeyRef.current === hydrationKey) return
    hydratedProductionCardKeyRef.current = hydrationKey
    const savedOperator = optionalText(existingProductionCard?.operatorId) ?? ""
    const savedStartTime = optionalText(existingProductionCard?.startTime) ?? ""
    const savedEndTime = optionalText(existingProductionCard?.endTime) ?? ""
    const savedGrossWeight =
      optionalNumber(existingProductionCard?.grossWeight) ?? 0
    const savedCratesUsed =
      optionalNumber(existingProductionCard?.cratesUsed) ?? 0
    const savedCrateWeight =
      optionalNumber(existingProductionCard?.crateWeightKg) ??
      DEFAULT_CRATE_WEIGHT_KG
    const savedCycleTime =
      optionalNumber(existingProductionCard?.cycleTime) ?? 0
    const savedPieceWeight =
      optionalNumber(existingProductionCard?.pieceWeight) ?? 0
    const savedDowntimeCode =
      optionalText(existingProductionCard?.downtimeCode) ?? ""
    const savedRejectionTypeCode =
      optionalText(existingProductionCard?.rejectionTypeCode) ?? ""
    const savedRejectionReasonCode =
      optionalText(existingProductionCard?.rejectionReasonCode) ?? ""
    const savedRejectionRemarkCode =
      optionalText(existingProductionCard?.rejectionRemarkCode) ?? ""
    const savedRejectQty =
      optionalNumber(existingProductionCard?.rejectQty) ?? 0
    const savedRemarks = optionalText(existingProductionCard?.remarks) ?? ""
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setOperatorNumber(savedOperator === "Unassigned" ? "" : savedOperator)
      setStartTime(savedStartTime)
      setEndTime(savedEndTime)
      setProducedGrossKg(savedGrossWeight > 0 ? String(savedGrossWeight) : "")
      setCratesUsed(savedCratesUsed > 0 ? String(savedCratesUsed) : "")
      setCrateWeightKg(String(savedCrateWeight))
      setCycleSecondsByKey((current) =>
        savedCycleTime > 0
          ? { ...current, [selectedOptionKey]: String(savedCycleTime) }
          : omitRecordKey(current, selectedOptionKey)
      )
      setPieceWeightByKey((current) =>
        savedPieceWeight > 0
          ? { ...current, [selectedOptionKey]: String(savedPieceWeight) }
          : omitRecordKey(current, selectedOptionKey)
      )
      setDowntimeCode(savedDowntimeCode)
      setRejectionTypeCode(savedRejectionTypeCode)
      setRejectionReasonCode(savedRejectionReasonCode)
      setRejectionRemarkCode(savedRejectionRemarkCode)
      setRejectedPieces(savedRejectQty > 0 ? String(savedRejectQty) : "")
      setRemarks(savedRemarks === "Bulk downtime" ? "" : savedRemarks)
    })
    return () => {
      cancelled = true
    }
  }, [
    existingProductionCard,
    prodDate,
    role,
    selectedCardKind,
    selectedOptionKey,
    shift,
  ])

  async function submitProductionCard() {
    if (!selectedRow || !canSave || isSaving) return
    setIsSaving(true)
    try {
      await onSaveProductionCard(selectedRow, {
        cardRole: role,
        writeProductionOutput:
          role === "shopFloor" && hasShopFloorProductionOutput,
        prodDate,
        shift,
        operatorId: role === "shopFloor" ? operatorNumber : "",
        operatorName:
          role === "shopFloor" ? (selectedEmployee?.name ?? "") : "",
        qcName: "",
        cycleTime: role === "shopFloor" ? cycleSeconds : 0,
        loadingUnloading: 0,
        startTime,
        endTime,
        runtimeMinutes:
          role === "shopFloor"
            ? shopFloorRuntimeMinutes
            : isDowntimeEntry && hasDowntimeDetails
              ? downtimeDurationMinutes
              : 0,
        breakMinutes: 0,
        downtimeMinutes:
          isDowntimeEntry && hasDowntimeDetails ? downtimeDurationMinutes : 0,
        downtimeReason:
          isDowntimeEntry && hasDowntimeDetails ? selectedDowntimeReason : "",
        downtimeCode: isDowntimeEntry && hasDowntimeDetails ? downtimeCode : "",
        outputQty: role === "shopFloor" ? producedPcs : 0,
        actualQty: role === "shopFloor" ? producedPcs : 0,
        targetQty:
          role === "shopFloor" &&
          cycleSeconds > 0 &&
          shopFloorRuntimeMinutes > 0
            ? Math.floor((shopFloorRuntimeMinutes * 60) / cycleSeconds)
            : 0,
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
      })
      setRemarks("")
      if (role === "quality" || role === "machinist") {
        setDowntimeCode("")
        setStartTime("")
        setEndTime("")
        setRejectionTypeCode("")
        setRejectionReasonCode("")
        setRejectionRemarkCode("")
        setRejectedPieces("")
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function submitBulkDowntime() {
    if (!canSaveBulkDowntime || isBulkSaving) return
    setIsBulkSaving(true)
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
        })
      }
      setBulkDowntimeCode("")
      setBulkDowntimeStart("")
      setBulkDowntimeEnd("")
    } finally {
      setIsBulkSaving(false)
    }
  }

  const entryTabClass = "h-7 rounded px-3 text-xs shadow-none"
  const compactInputClass = "h-8 text-xs"
  const compactSelectClass =
    "h-8 w-full min-w-0 rounded-md border bg-background px-2 text-xs"

  return (
    <div className="grid gap-2 rounded-md border bg-muted/10 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{roleLabel}</div>
          <div className="hidden text-[11px] text-muted-foreground sm:block">
            Select A Machine; Item And Setup Details Come From The Current Plan.
          </div>
        </div>
        {role === "shopFloor" ? (
          <StatusBadge
            value={
              isShopFloorProductionEntry && producedPcs > 0
                ? `${formatNumber(producedPcs)} pcs`
                : isShopFloorBulkDowntimeEntry
                  ? `${formatNumber(bulkRows.length)} machines`
                  : "Select entry"
            }
          />
        ) : null}
        {role === "quality" ? (
          <StatusBadge
            value={
              isQualityRejectionEntry && rejectQty > 0
                ? `${formatNumber(rejectQty)} rejected pcs`
                : isQualityDowntimeEntry && downtimeDurationMinutes > 0
                  ? `${formatNumber(downtimeDurationMinutes)} min downtime`
                  : qualityEntryKind
                    ? "Quality pending"
                    : "Select entry"
            }
          />
        ) : null}
        {role === "machinist" ? (
          <StatusBadge
            value={
              downtimeDurationMinutes > 0
                ? `${formatNumber(downtimeDurationMinutes)} min downtime`
                : "Downtime pending"
            }
          />
        ) : null}
      </div>

      {role === "shopFloor" ? (
        <div
          aria-label="Shop Floor Entry Type"
          className="inline-flex w-fit gap-0.5 rounded-md border bg-background p-0.5"
          role="group"
        >
          <Button
            aria-pressed={shopFloorEntryKind === "production"}
            className={entryTabClass}
            onClick={() => setShopFloorEntryKind("production")}
            type="button"
            variant={shopFloorEntryKind === "production" ? "default" : "ghost"}
          >
            Production
          </Button>
          <Button
            aria-pressed={shopFloorEntryKind === "bulkDowntime"}
            className={entryTabClass}
            onClick={() => setShopFloorEntryKind("bulkDowntime")}
            type="button"
            variant={
              shopFloorEntryKind === "bulkDowntime" ? "default" : "ghost"
            }
          >
            Bulk Downtime
          </Button>
        </div>
      ) : null}

      {role !== "shopFloor" ? (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-6">
          <CompactEntryField className="lg:col-span-2" label="Machine No.">
            <SearchableSelect
              className={compactSelectClass}
              value={selectedOptionKey}
              onChange={(event) => setSelectedKey(event.target.value)}
            >
              <option value="">Select Machine</option>
              {rowOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Date">
            <Input
              className={compactInputClass}
              type="date"
              value={prodDate}
              onChange={(event) => setProdDate(event.target.value)}
            />
          </CompactEntryField>
          <CompactEntryField label="Shift">
            <SearchableSelect
              className={compactSelectClass}
              value={shift}
              onChange={(event) => setShift(event.target.value)}
            >
              <option value="Day">Day</option>
              <option value="Night">Night</option>
              <option value="General">General</option>
            </SearchableSelect>
          </CompactEntryField>
          {selectedRow ? (
            <div className="flex min-h-8 items-center rounded-md border bg-background px-2 sm:col-span-2 lg:col-span-2">
              <ShopFloorItemSummary row={selectedRow} tone="current" compact />
            </div>
          ) : null}
        </div>
      ) : null}

      {role === "shopFloor" && isShopFloorProductionEntry ? (
        <>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-6">
            <CompactEntryField className="lg:col-span-2" label="Machine No.">
              <SearchableSelect
                className={compactSelectClass}
                value={selectedOptionKey}
                onChange={(event) => setSelectedKey(event.target.value)}
              >
                <option value="">Select Machine</option>
                {rowOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </SearchableSelect>
            </CompactEntryField>
            <CompactEntryField label="Date">
              <Input
                className={compactInputClass}
                type="date"
                value={prodDate}
                onChange={(event) => setProdDate(event.target.value)}
              />
            </CompactEntryField>
            <CompactEntryField label="Shift">
              <SearchableSelect
                className={compactSelectClass}
                value={shift}
                onChange={(event) => setShift(event.target.value)}
              >
                <option value="Day">Day</option>
                <option value="Night">Night</option>
                <option value="General">General</option>
              </SearchableSelect>
            </CompactEntryField>
            {selectedRow ? (
              <div className="flex min-h-8 items-center rounded-md border bg-background px-2 sm:col-span-2 lg:col-span-2">
                <ShopFloorItemSummary
                  row={selectedRow}
                  tone="current"
                  compact
                />
              </div>
            ) : null}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
            <CompactEntryField label="Cycle Time Sec">
              <Input
                className={compactInputClass}
                type="number"
                step="0.01"
                value={cycleSecondsInput}
                onChange={(event) =>
                  setCycleSecondsByKey((current) => ({
                    ...current,
                    [selectedOptionKey]: event.target.value,
                  }))
                }
              />
            </CompactEntryField>
            <CompactEntryField label="Piece Weight Gm">
              <Input
                className={compactInputClass}
                type="number"
                step="0.01"
                value={pieceWeightInput}
                onChange={(event) =>
                  setPieceWeightByKey((current) => ({
                    ...current,
                    [selectedOptionKey]: event.target.value,
                  }))
                }
              />
            </CompactEntryField>
            <CompactEntryField label="Operator No.">
              <SearchableSelect
                className={compactSelectClass}
                disabled={!employeeOptions.length}
                value={operatorNumber}
                onChange={(event) => setOperatorNumber(event.target.value)}
              >
                <option value="">
                  {employeeMasterError
                    ? "Employee Master Unavailable"
                    : !employeeMasterLoaded
                      ? "Loading Employee Master"
                      : employeeOptions.length
                        ? "Select Shop Floor Employee"
                        : "No Shop Floor Employees In This Production Unit"}
                </option>
                {operatorNumber && !selectedEmployee ? (
                  <option value={operatorNumber}>{operatorNumber}</option>
                ) : null}
                {employeeOptions.map((employee) => (
                  <option key={employee.code} value={employee.code}>
                    {employee.code} - {employee.name}
                  </option>
                ))}
              </SearchableSelect>
            </CompactEntryField>
            <CompactEntryField label="Machine Start">
              <Input
                className={compactInputClass}
                type="text"
                inputMode="numeric"
                placeholder="HH:mm"
                pattern="[0-2][0-9]:[0-5][0-9]"
                title="Use 24-Hour Time As Hh:Mm"
                value={startTime}
                onChange={(event) =>
                  setStartTime(time24Input(event.target.value))
                }
              />
            </CompactEntryField>
            <CompactEntryField label="Machine End">
              <Input
                className={compactInputClass}
                type="text"
                inputMode="numeric"
                placeholder="HH:mm"
                pattern="[0-2][0-9]:[0-5][0-9]"
                title="Use 24-Hour Time As Hh:Mm"
                value={endTime}
                onChange={(event) =>
                  setEndTime(time24Input(event.target.value))
                }
              />
            </CompactEntryField>
            <CompactEntryField label="Gross Produced Kg">
              <Input
                className={compactInputClass}
                type="number"
                step="0.001"
                value={producedGrossKg}
                onChange={(event) => setProducedGrossKg(event.target.value)}
              />
            </CompactEntryField>
            <CompactEntryField label="Crates Used">
              <Input
                className={compactInputClass}
                type="number"
                step="1"
                value={cratesUsed}
                onChange={(event) => setCratesUsed(event.target.value)}
              />
            </CompactEntryField>
            <CompactEntryField label="Crate Weight Kg">
              <SearchableSelect
                className={compactSelectClass}
                value={crateWeightKg}
                onChange={(event) => setCrateWeightKg(event.target.value)}
              >
                {CRATE_WEIGHT_OPTIONS_KG.map((weight) => (
                  <option key={weight} value={String(weight)}>
                    {formatNumber(weight)} Kg
                  </option>
                ))}
              </SearchableSelect>
            </CompactEntryField>
            <CompactEntryField label="Net Produced Kg">
              <Input
                className={compactInputClass}
                value={formatNumber(netProducedKg)}
                readOnly
              />
            </CompactEntryField>
            <CompactEntryField label="Produced Pcs">
              <Input
                className={compactInputClass}
                value={formatNumber(producedPcs)}
                readOnly
              />
            </CompactEntryField>
          </div>
        </>
      ) : null}

      {role === "shopFloor" && isShopFloorBulkDowntimeEntry ? (
        <div className="grid gap-2 rounded-md border bg-background p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium">Running-Machine Downtime</div>
            <StatusBadge value={`${formatNumber(bulkRows.length)} machines`} />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <CompactEntryField label="Date">
              <Input
                className={compactInputClass}
                type="date"
                value={prodDate}
                onChange={(event) => setProdDate(event.target.value)}
              />
            </CompactEntryField>
            <CompactEntryField label="Downtime Code">
              <SearchableSelect
                className={compactSelectClass}
                value={bulkDowntimeCode}
                disabled={!downtimeReasonOptions.length}
                onChange={(event) => setBulkDowntimeCode(event.target.value)}
              >
                <option value="">
                  {downtimeReasonOptions.length
                    ? "Select Code"
                    : "Add Downtime Reason Master"}
                </option>
                {downtimeReasonOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </SearchableSelect>
            </CompactEntryField>
            <CompactEntryField label="Start">
              <Input
                className={compactInputClass}
                type="text"
                inputMode="numeric"
                placeholder="HH:mm"
                pattern="[0-2][0-9]:[0-5][0-9]"
                title="Use 24-Hour Time As Hh:Mm"
                value={bulkDowntimeStart}
                onChange={(event) =>
                  setBulkDowntimeStart(time24Input(event.target.value))
                }
              />
            </CompactEntryField>
            <CompactEntryField label="End">
              <Input
                className={compactInputClass}
                type="text"
                inputMode="numeric"
                placeholder="HH:mm"
                pattern="[0-2][0-9]:[0-5][0-9]"
                title="Use 24-Hour Time As Hh:Mm"
                value={bulkDowntimeEnd}
                onChange={(event) =>
                  setBulkDowntimeEnd(time24Input(event.target.value))
                }
              />
            </CompactEntryField>
            <CompactEntryField label="Minutes">
              <Input
                className={compactInputClass}
                value={formatNumber(bulkDowntimeMinutes)}
                readOnly
              />
            </CompactEntryField>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-fit px-2.5 text-xs"
            disabled={!canSaveBulkDowntime || isBulkSaving}
            onClick={() => void submitBulkDowntime()}
          >
            <CheckCircle2 className="size-3.5" />
            Save Running-Machine Downtime
          </Button>
        </div>
      ) : null}

      {role === "quality" ? (
        <div
          aria-label="Quality Entry Type"
          className="inline-flex w-fit gap-0.5 rounded-md border bg-background p-0.5"
          role="group"
        >
          <Button
            aria-pressed={qualityEntryKind === "downtime"}
            className={entryTabClass}
            onClick={() => setQualityEntryKind("downtime")}
            type="button"
            variant={qualityEntryKind === "downtime" ? "default" : "ghost"}
          >
            Downtime
          </Button>
          <Button
            aria-pressed={qualityEntryKind === "rejection"}
            className={entryTabClass}
            onClick={() => setQualityEntryKind("rejection")}
            type="button"
            variant={qualityEntryKind === "rejection" ? "default" : "ghost"}
          >
            Rejection
          </Button>
        </div>
      ) : null}

      {isDowntimeEntry ? (
        <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <CompactEntryField label="Date">
            <Input
              className={compactInputClass}
              type="date"
              value={prodDate}
              onChange={(event) => setProdDate(event.target.value)}
            />
          </CompactEntryField>
          <CompactEntryField label="Downtime Code">
            <SearchableSelect
              className={compactSelectClass}
              value={downtimeCode}
              disabled={!downtimeReasonOptions.length}
              onChange={(event) => setDowntimeCode(event.target.value)}
            >
              <option value="">
                {downtimeReasonOptions.length
                  ? "Select Code"
                  : "Add Downtime Reason Master"}
              </option>
              {downtimeReasonOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Start">
            <Input
              className={compactInputClass}
              type="text"
              inputMode="numeric"
              placeholder="HH:mm"
              pattern="[0-2][0-9]:[0-5][0-9]"
              title="Use 24-Hour Time As Hh:Mm"
              value={startTime}
              onChange={(event) =>
                setStartTime(time24Input(event.target.value))
              }
            />
          </CompactEntryField>
          <CompactEntryField label="End">
            <Input
              className={compactInputClass}
              type="text"
              inputMode="numeric"
              placeholder="HH:mm"
              pattern="[0-2][0-9]:[0-5][0-9]"
              title="Use 24-Hour Time As Hh:Mm"
              value={endTime}
              onChange={(event) => setEndTime(time24Input(event.target.value))}
            />
          </CompactEntryField>
          <CompactEntryField label="Minutes">
            <Input
              className={compactInputClass}
              value={formatNumber(downtimeDurationMinutes)}
              readOnly
            />
          </CompactEntryField>
        </div>
      ) : null}

      {isRejectionEntry ? (
        <div className="grid gap-1.5 rounded-md border bg-background p-2 sm:grid-cols-2 lg:grid-cols-4">
          <CompactEntryField label="Rejection Type">
            <SearchableSelect
              className={compactSelectClass}
              value={rejectionTypeCode}
              onChange={(event) => setRejectionTypeCode(event.target.value)}
            >
              <option value="">Select Type</option>
              {rejectionTypeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} - {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Rejection Reason">
            <SearchableSelect
              className={compactSelectClass}
              value={rejectionReasonCode}
              onChange={(event) => setRejectionReasonCode(event.target.value)}
            >
              <option value="">Select Reason</option>
              {rejectionReasonOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} - {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Rejection Remark">
            <SearchableSelect
              className={compactSelectClass}
              value={rejectionRemarkCode}
              onChange={(event) => setRejectionRemarkCode(event.target.value)}
            >
              <option value="">Select Remark</option>
              {rejectionRemarkOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} - {option.label}
                </option>
              ))}
            </SearchableSelect>
          </CompactEntryField>
          <CompactEntryField label="Rejected Pcs">
            <Input
              className={compactInputClass}
              type="number"
              step="1"
              min="0"
              value={rejectedPieces}
              onChange={(event) => setRejectedPieces(event.target.value)}
            />
          </CompactEntryField>
        </div>
      ) : null}

      {showSaveButton ? (
        <Button
          type="button"
          size="sm"
          className="h-7 w-fit px-2.5 text-xs"
          disabled={!canSave || isSaving}
          onClick={() => void submitProductionCard()}
        >
          <CheckCircle2 className="size-3.5" />
          {role === "shopFloor"
            ? "Save Production"
            : isQualityRejectionEntry
              ? "Save Rejection"
              : "Save Downtime"}
        </Button>
      ) : null}
    </div>
  )
}

function SetupChecklistForm({
  row,
  phase,
  items,
  session,
  values,
  itemRemarks,
  onValueChange,
  onItemRemarkChange,
  onAddMaster,
}: {
  row: DashboardPayload
  phase: string
  items: DashboardPayload[]
  session?: DashboardPayload
  values: Record<string, string>
  itemRemarks: Record<string, string>
  onValueChange: (item: DashboardPayload, value: string) => void
  onItemRemarkChange: (item: DashboardPayload, value: string) => void
  onAddMaster?: (entryType: string, defaults?: Record<string, unknown>) => void
}) {
  const defaults = setupChecklistMasterDefaults()
  if (phase === "start" && !items.length) {
    return (
      <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <div className="font-medium text-amber-900 dark:text-amber-100">
          Setup Checklist Missing
        </div>
        <div className="text-amber-800 dark:text-amber-200">
          Create An Active Setup Checklist Before Pre Setting Can Start.
        </div>
        {onAddMaster ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => onAddMaster("setup_checklist_master", defaults)}
          >
            Add Setup Checklist
          </Button>
        ) : null}
      </div>
    )
  }
  if (phase === "end" && !session) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        Pre Setting Checklist Session Is Missing. Start Pre Setting For This
        Setup Before Saving Setting Done.
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">
            Setup Checklist {phase === "start" ? "start" : "completion"}
          </div>
          <div className="text-xs text-muted-foreground">
            {itemCode(row)} / Jc {jobCardNumber(row)} / Option{" "}
            {displayValue(row.optionNumber)} / Setup {displayValue(row.setupNo)}{" "}
            / Machine {displayValue(row.machine)} /{" "}
            {formatDate(new Date().toISOString())}
          </div>
        </div>
        <StatusBadge
          value={`Version ${displayValue(session?.masterVersion || items[0]?.version)}`}
        />
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-12">Seq</TableHead>
              <TableHead className="min-w-72">Check Point</TableHead>
              <TableHead className="min-w-36">Entry</TableHead>
              <TableHead className="min-w-52">Remark</TableHead>
              <TableHead className="min-w-28">Required</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const itemKey = setupChecklistItemKey(item, index)
              const inputType = str(item.inputType || "checkbox").toLowerCase()
              const existingValue = setupChecklistExistingValue(item, phase)
              const value = values[itemKey] ?? existingValue
              const itemRemark =
                itemRemarks[itemKey] ??
                setupChecklistExistingItemRemark(item, phase)
              return (
                <TableRow key={itemKey}>
                  <TableCell>
                    {displayValue(item.sequence || index + 1)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {displayValue(item.checkPoint)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {displayValue(item.section)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {inputType === "checkbox" ? (
                      <SearchableSelect
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={value}
                        onChange={(event) =>
                          onValueChange(item, event.target.value)
                        }
                      >
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </SearchableSelect>
                    ) : (
                      <Input
                        className="h-8 min-w-28"
                        type={inputType === "number" ? "number" : "text"}
                        value={value}
                        onChange={(event) =>
                          onValueChange(item, event.target.value)
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 min-w-48"
                      value={itemRemark}
                      onChange={(event) =>
                        onItemRemarkChange(item, event.target.value)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {setupChecklistItemRequired(item) ? "Yes" : "No"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
function FirstPieceInspectionForm({
  row,
  masters,
  readings,
  onReadingChange,
  onAddMaster,
  showDraftSaved = false,
}: {
  row: DashboardPayload
  masters: DashboardPayload[]
  readings: Record<string, string[]>
  onReadingChange: (
    master: DashboardPayload,
    pieceIndex: number,
    value: string
  ) => void
  onAddMaster?: (entryType: string, defaults?: Record<string, unknown>) => void
  showDraftSaved?: boolean
}) {
  const defaults = firstPieceMasterDefaults(row)
  if (!masters.length) {
    return (
      <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <div className="font-medium text-amber-900 dark:text-amber-100">
          First Piece Inspection Master Missing
        </div>
        <div className="text-amber-800 dark:text-amber-200">
          Add Dimensions For This Part, Option, And Setup Before Quality
          Approval.
        </div>
        {onAddMaster ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => onAddMaster("quality_parameter_master", defaults)}
          >
            Add Inspection Master
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">
            First Piece Inspection Report
          </div>
          <div className="text-xs text-muted-foreground">
            Task Assigned: {displayValue(row.shopFloorUpdatedAt)}
          </div>
          {showDraftSaved ? (
            <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Unfinished Readings Are Saved Automatically.
            </div>
          ) : null}
        </div>
        {onAddMaster ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onAddMaster("quality_parameter_master", defaults)}
          >
            Add Dimension
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 @5xl/main:hidden">
        {masters.map((master) => (
          <div
            className="grid gap-3 rounded-lg border bg-background p-3"
            key={`mobile-${firstPieceMasterKey(master)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">
                  {qualityParameterName(master)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {qualityParameterCode(master)} /{" "}
                  {displayValue(master.instrumentUsed)}
                </div>
              </div>
              <Badge variant="outline">
                {displayValue(master.specification)} (
                {qualityParameterTolerance(master)})
              </Badge>
            </div>
            <div className="grid gap-2 @lg/main:grid-cols-2 @2xl/main:grid-cols-3 @4xl/main:grid-cols-5">
              {[0, 1, 2, 3, 4].map((pieceIndex) => (
                <label
                  className="grid gap-1 text-xs font-medium"
                  key={pieceIndex}
                >
                  Piece {pieceIndex + 1}
                  <FirstPieceReadingControl
                    master={master}
                    value={
                      firstPieceReadingsFor(readings, master)[pieceIndex] ?? ""
                    }
                    onChange={(value) =>
                      onReadingChange(master, pieceIndex, value)
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-auto @5xl/main:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">Dimension</TableHead>
              <TableHead className="min-w-28">Instrument</TableHead>
              <TableHead className="min-w-28">Spec</TableHead>
              <TableHead className="min-w-24">Tol +</TableHead>
              <TableHead className="min-w-24">Tol -</TableHead>
              {[1, 2, 3, 4, 5].map((piece) => (
                <TableHead key={piece} className="min-w-24">
                  P{piece}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {masters.map((master) => (
              <TableRow key={firstPieceMasterKey(master)}>
                <TableCell>
                  <div className="font-medium">
                    {qualityParameterCode(master) || displayValue(master.uid)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {qualityParameterName(master)}
                  </div>
                </TableCell>
                <TableCell>{displayValue(master.instrumentUsed)}</TableCell>
                <TableCell>{displayValue(master.specification)}</TableCell>
                <TableCell>{displayValue(master.tolerancePlus)}</TableCell>
                <TableCell>{displayValue(master.toleranceMinus)}</TableCell>
                {[0, 1, 2, 3, 4].map((pieceIndex) => {
                  const value =
                    firstPieceReadingsFor(readings, master)[pieceIndex] ?? ""
                  return (
                    <TableCell key={pieceIndex}>
                      <FirstPieceReadingControl
                        master={master}
                        value={value}
                        onChange={(nextValue) =>
                          onReadingChange(master, pieceIndex, nextValue)
                        }
                      />
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function FirstPieceReadingControl({
  master,
  onChange,
  value,
}: {
  master: DashboardPayload
  onChange: (value: string) => void
  value: string
}) {
  const result = qualityReadingResult(master, value)
  return (
    <div
      className={`grid gap-1 rounded-md ${qualityResultTone(result) === "bad" ? "bg-red-50/70 dark:bg-red-950/20" : ""}`}
    >
      {qualityParameterInputType(master) === "pass_fail" ? (
        <SearchableSelect
          className={`h-11 min-w-20 rounded-md border bg-background px-2 text-sm @5xl/main:h-8 ${qualityReadingInputClass(result)}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        >
          <option value="">Select</option>
          <option value="OK">Ok</option>
          <option value="Not OK">Not Ok</option>
        </SearchableSelect>
      ) : (
        <Input
          className={`h-11 min-w-20 @5xl/main:h-8 ${qualityReadingInputClass(result)}`}
          type={
            qualityParameterInputType(master) === "number" ? "number" : "text"
          }
          inputMode={
            qualityParameterInputType(master) === "number"
              ? "decimal"
              : undefined
          }
          step="0.001"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      )}
      <StatusBadge value={result || "Pending"} />
    </div>
  )
}

function ShopFloorProgress({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {shopFloorStages.map((stage, index) => {
        const done = index <= activeIndex
        return (
          <Badge
            key={stage.id}
            variant="outline"
            className={
              done
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "text-muted-foreground"
            }
          >
            {index + 1}
          </Badge>
        )
      })}
    </div>
  )
}

function EmptyShopFloorSlot({
  label,
  compact,
}: {
  label: string
  compact?: boolean
}) {
  return (
    <div
      className={`grid place-items-center rounded-lg border border-dashed bg-muted/20 p-3 text-center text-sm text-muted-foreground ${compact ? "min-h-16" : "min-h-32"}`}
    >
      {label}
    </div>
  )
}

function MasterReadinessPanel({
  productionControl,
  submitAction,
  openDataEntry,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
}) {
  const masterGaps = asArray(productionControl.masterGaps)
  const allWorkOrderGaps = asArray(productionControl.allWorkOrderGaps)
  return (
    <section className="grid gap-4">
      <WorkOrderGapTable
        title="Production Validation"
        rows={masterGaps}
        submitAction={submitAction}
        openDataEntry={openDataEntry}
      />
      <WorkOrderGapTable
        title="Whole Work-Order Missing Details"
        rows={allWorkOrderGaps}
        submitAction={submitAction}
        openDataEntry={openDataEntry}
      />
    </section>
  )
}

function WorkOrderGapTable({
  title,
  rows,
  submitAction,
  openDataEntry,
}: {
  title: string
  rows: DashboardPayload[]
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
}) {
  const [visibleRowCount, setVisibleRowCount] = useState(rows.length)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <Badge variant="outline">
          {formatNumber(visibleRowCount)} / {formatNumber(rows.length)} Rows
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="overflow-hidden rounded-md border">
          <Table onFilteredRowCountChange={setVisibleRowCount}>
            <TableHeader>
              <TableRow>
                <TableHead>Job Card</TableHead>
                <TableHead>Item</TableHead>
                <TableHead data-filter-all-label="All Work Orders">
                  Rm
                </TableHead>
                <TableHead data-filter-all-label="All Gaps">
                  Missing Details
                </TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row, index) => (
                  <WorkOrderGapRow
                    key={`${title}-${jobCardNumber(row)}-${index}`}
                    row={row}
                    submitAction={submitAction}
                    openDataEntry={openDataEntry}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No Work-Order Gaps Match The Selected Filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function WorkOrderGapRow({
  row,
  submitAction,
  openDataEntry,
}: {
  row: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
}) {
  const jcNo = str(row.jcNo || row.jobCard)
  const options = asArray(row.availableOptions)
  const gaps = workOrderGapLabels(row)

  async function submitRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const optionNumber = String(
      new FormData(event.currentTarget).get("optionNumber") || ""
    ).trim()
    if (!jcNo || !optionNumber) return
    await submitAction("route-selection", { jcNo, optionNumber })
  }

  return (
    <TableRow>
      <TableCell className="min-w-32 font-medium">{jcNo || "-"}</TableCell>
      <TableCell className="min-w-40">
        <div>{itemCode(row)}</div>
        <div className="text-xs text-muted-foreground">
          {displayValue(row.description)}
        </div>
      </TableCell>
      <TableCell
        data-filter-value={
          str(row.rmStatus) === "Received" ? "Rm Received" : "Waiting Rm"
        }
      >
        {displayValue(row.rmStatus)}
      </TableCell>
      <TableCell className="min-w-44" data-filter-values={JSON.stringify(gaps)}>
        <div className="flex flex-wrap gap-1.5">
          {gaps.map((gap) => (
            <Badge key={gap} variant="outline">
              {gap}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="min-w-80">
        <div className="grid gap-2">
          {row.routeSelectionMissing ? (
            <form
              className="grid gap-1.5"
              onSubmit={(event) => void submitRoute(event)}
            >
              <Label className="text-xs text-muted-foreground">
                Select Option Number
              </Label>
              <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_7.5rem]">
                <SearchableSelect
                  className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm"
                  name="optionNumber"
                  defaultValue=""
                  required
                >
                  <option value="">Select Option</option>
                  {options.map((option, optionIndex) => {
                    const record = asRecord(option)
                    const value =
                      str(record.optionNumber || record.option || option) ||
                      String(optionIndex + 1)
                    return (
                      <option key={`${jcNo}-${value}`} value={value}>
                        {routeOptionText(record, value)}
                      </option>
                    )
                  })}
                </SearchableSelect>
                <Button type="submit" size="sm" className="w-full">
                  Save Option
                </Button>
              </div>
            </form>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-4">
            {row.routeMasterMissing ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() =>
                  openDataEntry("route", dataEntryDefaultsFromGap(row, "route"))
                }
              >
                {row.planningItemMissing
                  ? "Create Product Route"
                  : "Add Routing"}
              </Button>
            ) : null}
            {row.cycleTimeMissing ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() =>
                  openDataEntry("cycle", dataEntryDefaultsFromGap(row, "cycle"))
                }
              >
                Add Cycle Time
              </Button>
            ) : null}
            {row.toolingPlanMissing ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() =>
                  openDataEntry(
                    "tooling",
                    dataEntryDefaultsFromGap(row, "tooling")
                  )
                }
              >
                Add Tooling
              </Button>
            ) : null}
            {row.machineMasterMissing ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() =>
                  openDataEntry(
                    "machine_master",
                    dataEntryDefaultsFromGap(row, "machine_master")
                  )
                }
              >
                Add Machine
              </Button>
            ) : null}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

function workOrderGapLabels(row: DashboardPayload) {
  return [
    row.planningItemMissing ? "Planning item" : "",
    row.routeSelectionMissing ? "Route option" : "",
    row.routeMasterMissing ? "Route master" : "",
    row.cycleTimeMissing ? "Cycle time" : "",
    row.toolingPlanMissing ? "Tooling" : "",
    row.machineMasterMissing ? "Machine master" : "",
  ].filter(Boolean)
}

function dataEntryDefaultsFromGap(
  row: DashboardPayload,
  entryType: "route" | "cycle" | "tooling" | "machine_master"
) {
  const optionNumber = str(row.optionNumber || row.selectedOption)
  const setupNo = str(row.missingSetupNo || row.setupNo)
  const setupName = str(row.setupName || row.missingSetupName)
  const machineUsed = str(
    row.machineUsed || row.routeMachine || row.machineFamily || row.machineType
  )
  if (entryType === "machine_master") {
    return {
      machineNo: "",
      machineFamily: machineUsed,
      machineType: str(row.machineType),
      status: "Active",
      remarks: machineUsed
        ? `Active machine required for route family ${machineUsed}`
        : "Active machine required for route family",
      __returnTab: "masterGapsTab",
    }
  }
  const defaults: Record<string, unknown> = {
    partNo: itemCode(row) !== "-" ? itemCode(row) : "",
    optionNumber:
      optionNumber && optionNumber !== "Not selected" ? optionNumber : "",
    setupNo,
    setupName,
  }

  if (entryType === "route") {
    return {
      ...defaults,
      machineFamily: machineUsed,
      machineType: str(row.machineType),
      numberOfSetups: str(row.numberOfSetups),
    }
  }

  if (entryType === "cycle") {
    return {
      ...defaults,
      cycleTime: "",
      loading: "",
      unloading: "",
      totalTime: "",
    }
  }

  return { ...defaults, fixture: "", tooling: "", foamTool: "", remarks: "" }
}

function DataEntryPanel({
  canManageStoreMasters = false,
  payload,
  submitAction,
  preferredEntryType,
  preferredDefaults,
  allowedEntryTypes,
  productionFloorCode,
  onProductionFloorChange,
  onEntryTypeChange,
  operationalTabs,
  storeMasterData,
  title = "Production data entry",
  externalOptions = [],
}: {
  canManageStoreMasters?: boolean
  payload: DashboardPayload
  submitAction: (
    path: string,
    body: Record<string, unknown>,
    options?: { throwOnError?: boolean }
  ) => Promise<void>
  preferredEntryType: string
  preferredDefaults: Record<string, unknown>
  allowedEntryTypes?: readonly string[]
  productionFloorCode?: ProductionFloorCode
  onProductionFloorChange?: (floorCode: ProductionFloorCode) => void
  onEntryTypeChange?: (entryType: string) => void
  operationalTabs?: { dataEntryHref: string; masterTablesHref: string }
  storeMasterData?: StoreMasterData | null
  title?: string
  externalOptions?: ExternalMasterDataOption[]
}) {
  const dataEntry = asRecord(payload.dataEntry)
  const productionControl = asRecord(payload.productionControl)
  const searchParams = useSearchParams()
  const operationalSelection =
    operationalEntrySelectionFromContext(searchParams)
  const selectionLocked = Boolean(
    masterSelectionFromContext(searchParams) || operationalSelection
  )
  const availableSpecs = useMemo(
    () =>
      (allowedEntryTypes?.length
        ? dataEntrySpecs.filter((spec) =>
            allowedEntryTypes.includes(spec.entryType)
          )
        : dataEntrySpecs
      ).filter((spec) => spec.entryType !== "store_masters" || storeMasterData),
    [allowedEntryTypes, storeMasterData]
  )
  const initialEntryType = availableSpecs.some(
    (spec) => spec.entryType === preferredEntryType
  )
    ? preferredEntryType
    : availableSpecs[0]?.entryType || "route"
  const [bulkEntryType, setBulkEntryType] = useState(initialEntryType)
  const [isImporting, setIsImporting] = useState(false)
  const selectedSpec =
    availableSpecs.find((spec) => spec.entryType === bulkEntryType) ??
    availableSpecs[0]
  const selectedMasterIsCompanyWide =
    isCompanyWideMasterEntryType(bulkEntryType)
  const selectedMasterRows = useMemo(
    () =>
      selectedSpec
        ? masterTableRows(selectedSpec.entryType, payload, productionControl)
        : [],
    [payload, productionControl, selectedSpec]
  )

  async function importEntryFile(file: File) {
    if (isImporting || !file.name) return
    setIsImporting(true)
    try {
      const fileBase64 = await readFileAsDataUrl(file)
      await submitAction(
        "data-import",
        {
          entryType: bulkEntryType,
          fileName: file.name,
          fileBase64,
          ...(selectedMasterIsCompanyWide ? {} : { productionFloorCode }),
        },
        { throwOnError: true }
      )
    } catch {
      // submitAction already shows the import error; keep the file selected for correction.
    } finally {
      setIsImporting(false)
    }
  }

  const csvImportAction =
    bulkEntryType === "store_masters" ? (
      <MasterDataCsvImportButton
        action={importStoreMasterCsvAction}
        fields={{
          store_master: searchParams.get("storeMaster") ?? "ITEM_TYPE",
        }}
      />
    ) : (
      <MasterDataCsvClientImportButton
        disabled={isImporting}
        onFile={importEntryFile}
      />
    )

  return (
    <section className="grid gap-4">
      {productionFloorCode ? (
        operationalTabs ? (
          <OperationalWorkspaceTabs
            activeView="dataEntry"
            csvDownloadAction={
              <MasterDataCsvDownloadButton
                href={`/api/data-template?entryType=${encodeURIComponent(bulkEntryType)}`}
              />
            }
            csvImportAction={csvImportAction}
            dataEntryHref={operationalTabs.dataEntryHref}
            masterTablesHref={operationalTabs.masterTablesHref}
          />
        ) : (
          <MasterDataTabs
            activeView="dataEntry"
            csvImportAction={csvImportAction}
            entryType={bulkEntryType}
            productionFloorCode={productionFloorCode}
          />
        )
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        {isImporting ? (
          <div className="px-6">
            <ProcessingNotice message="Reading and importing the CSV file..." />
          </div>
        ) : null}
        <fieldset
          aria-busy={isImporting}
          className="contents"
          disabled={isImporting}
        >
          <CardContent className="grid gap-4">
            {productionFloorCode &&
            onProductionFloorChange &&
            !selectionLocked &&
            !selectedMasterIsCompanyWide ? (
              <div className="grid gap-2 @3xl/main:grid-cols-[minmax(240px,360px)_1fr] @3xl/main:items-end">
                <Field label="Production Unit">
                  <SearchableSelect
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    required
                    value={productionFloorCode}
                    onChange={(event) =>
                      onProductionFloorChange(
                        normalizeProductionFloorCode(event.target.value)
                      )
                    }
                  >
                    {productionFloors.map((floor) => (
                      <option key={floor.code} value={floor.code}>
                        {floor.label}
                      </option>
                    ))}
                  </SearchableSelect>
                </Field>
                <p className="pb-2 text-sm text-muted-foreground">
                  Uploads and manual entries are saved for the selected
                  Production Unit.
                </p>
              </div>
            ) : null}
            <div
              className={`grid gap-3 ${bulkEntryType === "store_masters" ? (selectionLocked ? "" : "@3xl/main:grid-cols-[220px]") : selectionLocked ? "@3xl/main:grid-cols-[minmax(0,1fr)_auto]" : "@3xl/main:grid-cols-[220px_minmax(0,1fr)_auto]"}`}
            >
              {!selectionLocked ? (
                <Field label="Select Entry Form">
                  <SearchableSelect
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={bulkEntryType}
                    onChange={(event) => {
                      const external = externalOptions.find(
                        (option) => option.id === event.target.value
                      )
                      if (external) {
                        window.location.assign(external.href)
                        return
                      }
                      setBulkEntryType(event.target.value)
                      onEntryTypeChange?.(event.target.value)
                    }}
                  >
                    {availableSpecs.map((spec) => (
                      <option key={spec.entryType} value={spec.entryType}>
                        {spec.title}
                      </option>
                    ))}
                    {externalOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </SearchableSelect>
                </Field>
              ) : null}
            </div>
          </CardContent>
        </fieldset>
      </Card>
      {selectedSpec?.entryType === "store_masters" && storeMasterData ? (
        <StoreMasterWorkspace
          canManage={canManageStoreMasters}
          data={storeMasterData}
          mode="entry"
        />
      ) : selectedSpec ? (
        <DataEntryForm
          key={selectedSpec.entryType}
          spec={selectedSpec}
          submitAction={submitAction}
          defaults={
            selectedSpec.entryType === preferredEntryType
              ? preferredDefaults
              : {}
          }
          dataEntry={dataEntry}
          masterRows={selectedMasterRows}
          productionControl={productionControl}
          productionFloorCode={
            selectedMasterIsCompanyWide ? undefined : productionFloorCode
          }
          storeMasterData={storeMasterData}
        />
      ) : null}
    </section>
  )
}

function OperationalTablesPanel({
  payload,
  productionControl,
  openDataEntry,
  preferredEntryType,
  productionFloorCode,
  onProductionFloorChange,
  onEntryTypeChange,
  operationalTabs,
  externalOptions = [],
}: {
  payload: DashboardPayload
  productionControl: DashboardPayload
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
  preferredEntryType?: string
  productionFloorCode: ProductionFloorCode
  onProductionFloorChange: (floorCode: ProductionFloorCode) => void
  onEntryTypeChange: (entryType: string) => void
  operationalTabs: { dataEntryHref: string; masterTablesHref: string }
  externalOptions?: ExternalOperationalEntryOption[]
}) {
  const searchParams = useSearchParams()
  const selectionLocked = Boolean(
    operationalEntrySelectionFromContext(searchParams)
  )
  const specs = useMemo(
    () =>
      dataEntrySpecs.filter((spec) =>
        (operationalDataEntryTypes as readonly string[]).includes(
          spec.entryType
        )
      ),
    []
  )
  const [entryType, setEntryType] = useState(() =>
    specs.some((spec) => spec.entryType === preferredEntryType)
      ? (preferredEntryType ?? "")
      : (specs[0]?.entryType ?? "")
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [tableResetKey, setTableResetKey] = useState(0)
  const selectedSpec =
    specs.find((spec) => spec.entryType === entryType) ?? specs[0]
  const dataEntry = asRecord(payload.dataEntry)
  const rows = useMemo(
    () =>
      selectedSpec
        ? operationalEntryRows(
            selectedSpec.entryType,
            dataEntry,
            productionControl
          )
        : [],
    [dataEntry, productionControl, selectedSpec]
  )
  const columns = useMemo(
    () => (selectedSpec ? masterTableColumns(selectedSpec) : []),
    [selectedSpec]
  )
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => masterTableRowMatches(row, columns, searchQuery)),
    [columns, rows, searchQuery]
  )

  if (!selectedSpec) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Master Tables</CardTitle>
          <CardDescription>
            No Operational Entry Definitions Are Configured.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <section className="grid gap-4">
      <OperationalWorkspaceTabs
        activeView="masterTables"
        dataEntryHref={operationalTabs.dataEntryHref}
        exportAction={
          <DataDownloadButton
            disabled={!rows.length || !columns.length}
            label="Download CSV"
            onClick={() =>
              downloadMasterTableCsv(selectedSpec, rows, columns, "all-rows")
            }
          />
        }
        masterTablesHref={operationalTabs.masterTablesHref}
      />
      <Card>
        <CardHeader>
          <CardTitle>Entry Tables</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 @4xl/main:grid-cols-[minmax(220px,320px)_minmax(220px,320px)_minmax(260px,1fr)]">
          {!selectionLocked ? (
            <>
              <Field label="Production Unit">
                <SearchableSelect
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  required
                  value={productionFloorCode}
                  onChange={(event) =>
                    onProductionFloorChange(
                      normalizeProductionFloorCode(event.target.value)
                    )
                  }
                >
                  {productionFloors.map((floor) => (
                    <option key={floor.code} value={floor.code}>
                      {floor.label}
                    </option>
                  ))}
                </SearchableSelect>
              </Field>
              <Field label="Entry Table">
                <SearchableSelect
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={selectedSpec.entryType}
                  onChange={(event) => {
                    const external = externalOptions.find(
                      (option) => option.id === event.target.value
                    )
                    if (external) {
                      window.location.assign(external.href)
                      return
                    }
                    setEntryType(event.target.value)
                    onEntryTypeChange(event.target.value)
                    setSearchQuery("")
                    setTableResetKey((current) => current + 1)
                  }}
                >
                  {specs.map((spec) => (
                    <option key={spec.entryType} value={spec.entryType}>
                      {spec.title}
                    </option>
                  ))}
                  {externalOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </SearchableSelect>
              </Field>
            </>
          ) : null}
          <Field label="Search All Visible Columns">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search Saved Rows"
                value={searchQuery}
              />
            </div>
          </Field>
          <div className="flex flex-wrap items-end gap-2 @4xl/main:col-span-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchQuery("")
                setTableResetKey((current) => current + 1)
              }}
            >
              Clear Filters
            </Button>

            <Button
              type="button"
              onClick={() => openDataEntry(selectedSpec.entryType)}
            >
              <Plus className="size-4" />
              Add Entry
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{selectedSpec.title}</CardTitle>
            </div>
            <Badge variant="outline">
              {formatNumber(filteredRows.length)} / {formatNumber(rows.length)}{" "}
              Rows
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!rows.length ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No Saved Rows Found For This Operational Entry.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table key={`${selectedSpec.entryType}-${tableResetKey}`}>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead
                        key={column.key}
                        className="h-10 min-w-28 px-2 py-1 text-xs"
                      >
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, index) => (
                    <TableRow
                      key={masterTableRowKey(
                        selectedSpec.entryType,
                        row,
                        index
                      )}
                    >
                      {columns.map((column) => (
                        <TableCell
                          key={column.key}
                          className="max-w-64 px-2 py-1.5 align-top text-xs leading-5 whitespace-normal"
                        >
                          {masterTableCellText(row, column.key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function MasterTablesPanel({
  canDeleteMasters,
  canManageStoreMasters,
  payload,
  productionControl,
  submitAction,
  openDataEntry,
  preferredEntryType,
  productionFloorCode,
  storeMasterData,
}: {
  canDeleteMasters: boolean
  canManageStoreMasters: boolean
  payload: DashboardPayload
  productionControl: DashboardPayload
  submitAction: (
    path: string,
    body: Record<string, unknown>,
    options?: { throwOnError?: boolean }
  ) => Promise<void>
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
  preferredEntryType?: string
  productionFloorCode: ProductionFloorCode
  storeMasterData?: StoreMasterData | null
}) {
  const specs = useMemo(
    () =>
      masterTableSpecs().filter(
        (spec) => spec.entryType !== "store_masters" || storeMasterData
      ),
    [storeMasterData]
  )
  const selectedSpec =
    specs.find((spec) => spec.entryType === preferredEntryType) ?? specs[0]

  const [deleteRow, setDeleteRow] = useState<DashboardPayload | null>(null)
  const [replacementRecordId, setReplacementRecordId] = useState("")
  const [deleteReason, setDeleteReason] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const dataEntry = asRecord(payload.dataEntry)
  const rows = useMemo(
    () =>
      selectedSpec
        ? masterTableRows(selectedSpec.entryType, payload, productionControl)
        : [],
    [payload, productionControl, selectedSpec]
  )
  const columns = useMemo(
    () => (selectedSpec ? masterTableColumns(selectedSpec) : []),
    [selectedSpec]
  )
  const filteredRows = rows
  const summaryRows = useMemo(
    () =>
      selectedSpec
        ? masterTableKeySummaryRows(selectedSpec, dataEntry, rows, filteredRows)
        : [],
    [selectedSpec, dataEntry, rows, filteredRows]
  )
  const deleteRecordId = deleteRow ? masterTableRecordId(deleteRow) : ""
  const replacementRows = rows.filter(
    (row) =>
      masterTableRecordId(row) && masterTableRecordId(row) !== deleteRecordId
  )

  async function deleteSelectedMaster() {
    if (!deleteRow || !deleteRecordId || !deleteReason.trim() || !selectedSpec)
      return
    setIsDeleting(true)
    try {
      await submitAction(
        "master-delete",
        {
          kind: selectedSpec.entryType,
          reason: deleteReason.trim(),
          recordId: deleteRecordId,
          replacementRecordId: replacementRecordId || undefined,
          returnTab: "masterTablesTab",
        },
        { throwOnError: true }
      )
      setDeleteRow(null)
      setReplacementRecordId("")
      setDeleteReason("")
    } finally {
      setIsDeleting(false)
    }
  }

  if (!selectedSpec) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Master Tables</CardTitle>
          <CardDescription>
            No Master Definitions Are Configured.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <section className="grid gap-4">
      <MasterDataTabs
        activeView="masterTables"
        entryType={selectedSpec.entryType}
        exportDisabled={!rows.length || !columns.length}
        onExport={() =>
          downloadMasterTableCsv(selectedSpec, rows, columns, "all-rows")
        }
        productionFloorCode={productionFloorCode}
      />
      {selectedSpec.entryType === "store_masters" && storeMasterData ? (
        <StoreMasterWorkspace
          canManage={canManageStoreMasters}
          data={storeMasterData}
          mode="table"
        />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{selectedSpec.title}</CardTitle>
              </div>
              <Badge variant="outline">
                {formatNumber(filteredRows.length)} /{" "}
                {formatNumber(rows.length)} Rows
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!rows.length ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No Saved Rows Found For This Master.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table key={selectedSpec.entryType}>
                  <TableHeader>
                    <TableRow>
                      {columns.map((column) => (
                        <TableHead
                          key={column.key}
                          className="h-10 min-w-28 px-2 py-1 text-xs"
                        >
                          {column.label}
                        </TableHead>
                      ))}
                      <TableHead className="h-10 w-24 px-2 py-1 text-right text-xs">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, index) => (
                      <TableRow
                        key={masterTableRowKey(
                          selectedSpec.entryType,
                          row,
                          index
                        )}
                      >
                        {columns.map((column) => (
                          <TableCell
                            key={column.key}
                            className="max-w-64 px-2 py-1.5 align-top text-xs leading-5 whitespace-normal"
                          >
                            {masterTableCellText(row, column.key)}
                          </TableCell>
                        ))}
                        <TableCell className="px-2 py-1.5 align-top">
                          <div className="flex justify-end gap-1">
                            <Button
                              onClick={() =>
                                openDataEntry(
                                  selectedSpec.entryType,
                                  masterEditDefaults(
                                    selectedSpec.entryType,
                                    row
                                  )
                                )
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </Button>
                            {canDeleteMasters ? (
                              <Button
                                aria-label={`Delete ${masterTableRowLabel(row, columns)}`}
                                disabled={!masterTableRecordId(row)}
                                onClick={() => {
                                  setDeleteRow(row)
                                  setReplacementRecordId("")
                                  setDeleteReason("")
                                }}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Trash2 className="size-3.5" />
                                Delete
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {selectedSpec.entryType !== "store_masters" && summaryRows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedSpec.title} Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {tableColumns(summaryRows).map((column) => (
                      <TableHead key={column}>
                        {humanizeMasterTableColumn(column)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryRows.map((row, index) => (
                    <TableRow
                      key={`${selectedSpec.entryType}-summary-${index}`}
                    >
                      {tableColumns(summaryRows).map((column) => (
                        <TableCell key={column} className="text-xs">
                          {formatCell(row[column])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog
        open={canDeleteMasters && Boolean(deleteRow)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteRow(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedSpec.title} Row</DialogTitle>
            <DialogDescription>
              Unused rows delete immediately. If this row is used, select the
              correct replacement so linked records remain valid.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Selected: </span>
              <span className="font-medium">
                {deleteRow ? masterTableRowLabel(deleteRow, columns) : ""}
              </span>
            </div>
            <Field label="Select Replacement (Required Only If Used)">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                disabled={isDeleting}
                value={replacementRecordId}
                onChange={(event) => setReplacementRecordId(event.target.value)}
              >
                <option value="">No replacement — row must be unused</option>
                {replacementRows.map((row, index) => (
                  <option
                    key={masterTableRowKey(selectedSpec.entryType, row, index)}
                    value={masterTableRecordId(row)}
                  >
                    {masterTableRowLabel(row, columns)}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
            <Field label="Reason For Deletion">
              <Input
                disabled={isDeleting}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Example: Duplicate master"
                required
                value={deleteReason}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={isDeleting}
              onClick={() => setDeleteRow(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!deleteReason.trim() || !deleteRecordId || isDeleting}
              onClick={deleteSelectedMaster}
              type="button"
              variant="destructive"
            >
              {isDeleting
                ? "Deleting..."
                : replacementRecordId
                  ? "Replace And Delete"
                  : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

type MasterTableColumn = {
  key: string
  label: string
}

function masterTableKeySummaryRows(
  spec: DataEntrySpec,
  dataEntry: DashboardPayload,
  rows: DashboardPayload[],
  filteredRows: DashboardPayload[]
) {
  const existingRows = asArray(dataEntry.keySummary).filter((row) => {
    const rowType = str(
      row.entryType || row.type || row.master || row.table || row.name
    )
    return (
      rowType.toLowerCase() === spec.entryType.toLowerCase() ||
      rowType.toLowerCase() === spec.title.toLowerCase()
    )
  })
  if (existingRows.length) return existingRows
  return [
    {
      master: spec.title,
      entryType: spec.entryType,
      totalRows: rows.length,
      filteredRows: filteredRows.length,
      uniqueKeys: uniqueValues(
        rows.map(
          (row, index) =>
            dataEntryKey(spec.entryType, row) ||
            masterTableRowKey(spec.entryType, row, index)
        )
      ).length,
    },
  ]
}
function masterTableRows(
  entryType: string,
  payload: DashboardPayload,
  productionControl: DashboardPayload,
  directRows?: DashboardPayload[]
) {
  const dataEntry = asRecord(payload.dataEntry)
  const rows: DashboardPayload[] = []
  if (directRows) {
    rows.push(...directRows)
  } else {
    for (const source of productionMasterRowSources[entryType] ?? []) {
      rows.push(...asArray(productionControl[source]))
      rows.push(...asArray(dataEntry[source]))
    }
    rows.push(...dataEntryRowsForProductionMaster(entryType, dataEntry))
  }

  const matchingRows = rowsForProductionMaster(entryType, rows)
  if (entryType === "quality_parameter_master")
    return mergeQualityParameterRows(matchingRows)
  if (entryType === "maintenance_master")
    return activeMaintenanceMasterRows(
      dedupeMasterTableRows(entryType, matchingRows)
    )
  if (entryType === "maintenance_checklist_master")
    return mergeMaintenanceChecklistRows(matchingRows)
  if (entryType === "setup_checklist_master")
    return mergeSetupChecklistRows(matchingRows)
  return dedupeMasterTableRows(entryType, matchingRows)
}

function dedupeMasterTableRows(entryType: string, rows: DashboardPayload[]) {
  const byKey = new Map<string, DashboardPayload>()
  rows.forEach((row, index) => {
    const key =
      dataEntryKey(entryType, row) || JSON.stringify(row) || String(index)
    byKey.set(key, row)
  })
  return [...byKey.values()].sort((a, b) =>
    masterTableRowKey(entryType, a, 0).localeCompare(
      masterTableRowKey(entryType, b, 0),
      undefined,
      { numeric: true }
    )
  )
}

function masterTableColumns(spec: DataEntrySpec): MasterTableColumn[] {
  return columnsForProductionMaster(spec.fields)
}

function humanizeMasterTableColumn(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function masterTableCellText(row: DashboardPayload, key: string) {
  return displayValue(row[key])
}

function masterTableRecordId(row: DashboardPayload) {
  return str(row._id || row.sourceId || row.id)
}

function masterTableRowLabel(
  row: DashboardPayload,
  columns: MasterTableColumn[]
) {
  return (
    columns
      .slice(0, 3)
      .map((column) => masterTableCellText(row, column.key))
      .filter((value) => value && value !== "-")
      .join(" — ") ||
    masterTableRecordId(row) ||
    "Master row"
  )
}

function downloadMasterTableCsv(
  spec: DataEntrySpec,
  rows: DashboardPayload[],
  columns: MasterTableColumn[],
  scope: "all-rows" | "visible-rows"
) {
  const header = columns.map((column) => csvCell(column.label)).join(",")
  const body = rows.map((row) =>
    columns
      .map((column) => csvCell(masterTableCellText(row, column.key)))
      .join(",")
  )
  const blob = new Blob(["\ufeff", [header, ...body].join("\r\n"), "\r\n"], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${safeExportFileName(spec.title)}-${istDateValue()}-${scope}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown) {
  const textValue = str(value)
  const doubleQuote = String.fromCharCode(34)
  const escaped = textValue.replaceAll(
    doubleQuote,
    `${doubleQuote}${doubleQuote}`
  )
  return /[",\r\n]/.test(textValue)
    ? `${doubleQuote}${escaped}${doubleQuote}`
    : textValue
}

function safeExportFileName(value: unknown) {
  return (
    str(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "master-table"
  )
}
function masterTableRowMatches(
  row: DashboardPayload,
  columns: MasterTableColumn[],
  searchQuery: string
) {
  const query = searchQuery.trim().toLowerCase()
  return (
    !query ||
    columns.some((column) =>
      masterTableCellText(row, column.key).toLowerCase().includes(query)
    )
  )
}

function masterTableRowKey(
  entryType: string,
  row: DashboardPayload,
  index: number
) {
  return `${entryType}|${dataEntryKey(entryType, row) || JSON.stringify(row) || index}`
}

const centralMachineMasterRowKeys = [
  "machinePlanningRows",
  "maintenanceScheduleRows",
  "maintenanceTaskRows",
  "maintenanceMasterRows",
  "maintenanceChecklistMasterRows",
  "productionRunRows",
] as const

function combinedMachineMasterProductionControl(pages: DashboardPayload[]) {
  const controls = pages.map((page) => asRecord(page.productionControl))
  return Object.fromEntries(
    centralMachineMasterRowKeys.map((key) => [
      key,
      key === "maintenanceMasterRows"
        ? maintenanceMasterRowsForMachineAssignment(pages)
        : controls.flatMap((control) => asArray(control[key])),
    ])
  )
}

function CentralMachineMasterWorkspace({
  payload,
  submitAction,
  openDataEntry,
}: {
  payload: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
}) {
  const [reloadKey, setReloadKey] = useState(0)
  const conventional = usePostgresOperationalPage(
    "/api/dashboard?floor=conventional",
    0,
    undefined,
    0,
    reloadKey
  )
  const conventional02 = usePostgresOperationalPage(
    "/api/dashboard?floor=conventional-02",
    0,
    undefined,
    0,
    reloadKey
  )
  const cnc = usePostgresOperationalPage(
    "/api/dashboard?floor=cnc",
    0,
    undefined,
    0,
    reloadKey
  )
  const forging = usePostgresOperationalPage(
    "/api/dashboard?floor=forging",
    0,
    undefined,
    0,
    reloadKey
  )
  const floorPages = useMemo(
    () =>
      [conventional.data, conventional02.data, cnc.data, forging.data].filter(
        (page): page is DashboardPayload => Boolean(page)
      ),
    [cnc.data, conventional.data, conventional02.data, forging.data]
  )
  const productionControl = useMemo(
    () =>
      combinedMachineMasterProductionControl(
        floorPages.length ? floorPages : [payload]
      ),
    [floorPages, payload]
  )
  async function saveAndReload(path: string, body: Record<string, unknown>) {
    await submitAction(path, body)
    setReloadKey((current) => current + 1)
  }

  return (
    <MachineMasterPanel
      productionControl={productionControl}
      submitAction={saveAndReload}
      openDataEntry={openDataEntry}
    />
  )
}

function MachineMasterPanel({
  productionControl,
  submitAction,
  openDataEntry,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  openDataEntry: (entryType: string, defaults?: Record<string, unknown>) => void
}) {
  const isClientHydrated = useSyncExternalStore(
    subscribeToHydration,
    clientHydrationSnapshot,
    serverHydrationSnapshot
  )
  const machineRows = useMemo(
    () =>
      maintenanceMachineRows(asArray(productionControl.machinePlanningRows)),
    [productionControl.machinePlanningRows]
  )
  const scheduleRows = useMemo(
    () => asArray(productionControl.maintenanceScheduleRows),
    [productionControl.maintenanceScheduleRows]
  )
  const completionRows = asArray(productionControl.maintenanceTaskRows)
  const maintenanceMasterRows = useMemo(
    () =>
      activeMaintenanceMasterRows(
        asArray(productionControl.maintenanceMasterRows)
      ),
    [productionControl.maintenanceMasterRows]
  )
  const checklistRows = asArray(
    productionControl.maintenanceChecklistMasterRows
  )
  const activeChecklistRows = useMemo(
    () => activeMaintenanceChecklistRows(checklistRows),
    [checklistRows]
  )
  const checklistOptions = useMemo(
    () => maintenanceChecklistOptions(activeChecklistRows),
    [activeChecklistRows]
  )
  const [selectedMaintenanceCode, setSelectedMaintenanceCode] = useState("")
  const { machineNo: selectedMachineNo } = isClientHydrated
    ? machineMasterQueryFromLocation()
    : { machineNo: "" }
  const [selectedChecklistCode, setSelectedChecklistCode] = useState("")
  const [historyQuery, setHistoryQuery] = useState("")
  const [historyTypeFilter, setHistoryTypeFilter] = useState("")
  const [historyCodeFilter, setHistoryCodeFilter] = useState("")
  const [historyResultFilter, setHistoryResultFilter] = useState("")
  const [selectedReportKey, setSelectedReportKey] = useState("")
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false)
  const [visibleScheduleCount, setVisibleScheduleCount] = useState(0)

  const selectedMaintenance = maintenanceMasterRows.find(
    (row) =>
      machineKey(row.maintenanceCode) === machineKey(selectedMaintenanceCode)
  )
  const selectedMachine = machineRows.find(
    (row) => machineKey(row.machineNo) === machineKey(selectedMachineNo)
  )
  const machineSchedules = selectedMachineNo
    ? maintenanceSchedulesForMachine(scheduleRows, selectedMachineNo)
    : []
  const machineHistory = selectedMachineNo
    ? maintenanceHistoryRowsForMachine(completionRows, selectedMachineNo)
    : []
  const filteredHistory = machineHistory.filter((row) =>
    maintenanceHistoryMatches(
      row,
      historyQuery,
      historyTypeFilter,
      historyCodeFilter,
      historyResultFilter
    )
  )
  const selectedReport =
    filteredHistory.find(
      (row) => maintenanceRecordKey(row) === selectedReportKey
    ) ??
    machineHistory.find(
      (row) => maintenanceRecordKey(row) === selectedReportKey
    )
  const selectedChecklistRows = selectedChecklistCode
    ? maintenanceChecklistRowsForCode(
        activeChecklistRows,
        selectedChecklistCode
      )
    : []
  const typeOptions = uniqueValues(
    machineHistory.map((row) => displayValue(row.maintenanceType || "Planned"))
  )
  const codeOptions = uniqueValues(
    machineHistory
      .map((row) => displayValue(row.maintenanceCode))
      .filter((value) => value !== "-")
  )
  const resultOptions = uniqueValues(
    machineHistory
      .map((row) => displayValue(row.result))
      .filter((value) => value !== "-")
  )

  function closeMachine() {
    window.location.assign(dashboardTabHref("machineMasterTab"))
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMachine) return
    const form = event.currentTarget
    const body = formPayload(new FormData(form), maintenanceScheduleFields())
    if (!selectedMaintenance) return
    const checklistCode =
      displayValue(selectedMaintenance.checklistCode) !== "-"
        ? displayValue(selectedMaintenance.checklistCode)
        : ""
    const payload = {
      ...body,
      machineNo: displayValue(selectedMachine.machineNo),
      maintenanceCode: displayValue(selectedMaintenance.maintenanceCode),
      maintenanceTitle: displayValue(selectedMaintenance.maintenanceTitle),
      checklistCode,
      checklistTitle: maintenanceChecklistTitle(
        activeChecklistRows,
        checklistCode
      ),
      frequencyDays:
        optionalNumber(selectedMaintenance.frequencyDays) ??
        displayValue(selectedMaintenance.frequencyDays),
      frequencyBasis:
        displayValue(selectedMaintenance.frequencyBasis) !== "-"
          ? displayValue(selectedMaintenance.frequencyBasis)
          : "Calendar days",
      estimatedMinutes:
        optionalNumber(selectedMaintenance.estimatedMinutes) ??
        displayValue(selectedMaintenance.estimatedMinutes),
      machineFamily:
        displayValue(selectedMachine.machineFamily) !== "-"
          ? displayValue(selectedMachine.machineFamily)
          : "",
      machineType:
        displayValue(selectedMachine.machineType) !== "-"
          ? displayValue(selectedMachine.machineType)
          : "",
      machineName:
        displayValue(selectedMachine.machineName) !== "-"
          ? displayValue(selectedMachine.machineName)
          : "",
      productionFloorCode: normalizeProductionFloorCode(
        selectedMachine.productionFloorCode
      ),
      location:
        displayValue(selectedMachine.location) !== "-"
          ? displayValue(selectedMachine.location)
          : "",
      updatedAt: new Date().toISOString(),
    }
    await submitAction("data-entry", {
      entryType: "maintenance_schedule",
      key: dataEntryKey("maintenance_schedule", payload),
      payload,
    })
    form.reset()
    setSelectedMaintenanceCode("")
    setSelectedChecklistCode("")
    setIsScheduleFormOpen(false)
  }

  if (!selectedMachineNo) {
    return (
      <section className="grid gap-4">
        <TrackingSummary
          tones={["brand", "info", "accent", "success"]}
          items={[
            ["Machines", formatNumber(machineRows.length)],
            ["Schedule master", formatNumber(maintenanceMasterRows.length)],
            ["Schedules", formatNumber(scheduleRows.length)],
            ["Records", formatNumber(completionRows.length)],
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>All Machines</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {formatNumber(machineRows.length)} Machines
              </div>
              <Button asChild type="button" size="sm" variant="outline">
                <Link
                  href={masterDataDashboardHref(
                    "dataEntry",
                    defaultProductionFloorCode,
                    "machine_master"
                  )}
                >
                  Open Machine Master
                </Link>
              </Button>
            </div>
            <div className="max-h-[72vh] overflow-auto rounded-lg border">
              <Table containerClassName="max-h-none overflow-visible">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Machine No.</TableHead>
                    <TableHead>Machine Family</TableHead>
                    <TableHead>Machine Type</TableHead>
                    <TableHead>Machine Name</TableHead>
                    <TableHead>Production Unit</TableHead>
                    <TableHead>Machine Location</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machineRows.length ? (
                    machineRows.map((row) => {
                      const machineNo = displayValue(row.machineNo)
                      return (
                        <TableRow key={machineNo}>
                          <TableCell>
                            <Link
                              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
                              href={`${dashboardTabHref("machineMasterTab")}&machine=${encodeURIComponent(machineNo)}`}
                              title={`Open Machine ${machineNo}`}
                            >
                              {machineNo}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {displayValue(row.machineFamily)}
                          </TableCell>
                          <TableCell>{displayValue(row.machineType)}</TableCell>
                          <TableCell>{displayValue(row.machineName)}</TableCell>
                          <TableCell>
                            {machineProductionUnitLabel(row)}
                          </TableCell>
                          <TableCell>{displayValue(row.location)}</TableCell>
                          <TableCell>
                            <StatusBadge value={row.status || "Active"} />
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        No Machines Match The Selected Filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    )
  }

  if (!selectedMachine) {
    return (
      <section className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Machine Not Found</CardTitle>
            <CardDescription>
              The Selected Machine Is Not Available In Machine Master.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={closeMachine}>
              Back To Machines
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Machine {displayValue(selectedMachine.machineNo)}
          </h2>
        </div>
        <Button type="button" variant="outline" onClick={closeMachine}>
          Back To Machines
        </Button>
      </div>
      <TrackingSummary
        tones={["accent", "success", "info", "brand"]}
        items={[
          ["Schedules", formatNumber(machineSchedules.length)],
          ["Records", formatNumber(machineHistory.length)],
          ["Filtered", formatNumber(filteredHistory.length)],
          ["Schedule master", formatNumber(maintenanceMasterRows.length)],
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{displayValue(selectedMachine.machineNo)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-4">
            <TileField
              label="Machine Family"
              value={selectedMachine.machineFamily}
              important
            />
            <TileField
              label="Machine Type"
              value={selectedMachine.machineType}
            />
            <TileField
              label="Machine Name"
              value={selectedMachine.machineName}
            />
            <TileField
              label="Production Unit"
              value={machineProductionUnitLabel(selectedMachine)}
            />
            <TileField
              label="Machine Location"
              value={selectedMachine.location}
            />
            <TileField
              label="Machine Status"
              value={selectedMachine.status || "Active"}
            />
            <TileField label="Remarks" value={selectedMachine.remarks} />
            <TileField
              label="Maintenance Records"
              value={machineHistory.length}
              numeric
            />
          </div>
        </CardContent>
      </Card>
      <MachineStoreAssets
        machineNumber={displayValue(selectedMachine.machineNo)}
      />
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Assigned Maintenance Schedules</CardTitle>
            <CardDescription>
              {machineSchedules.length
                ? `${formatNumber(visibleScheduleCount)} of ${formatNumber(machineSchedules.length)} schedules shown`
                : "No Schedules Assigned Yet"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={isScheduleFormOpen ? "secondary" : "default"}
              onClick={() => setIsScheduleFormOpen((open) => !open)}
            >
              <CalendarDays className="size-4" />
              {isScheduleFormOpen ? "Close Entry" : "Assign Schedule"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isScheduleFormOpen ? (
            <div className="grid gap-4 rounded-lg border p-3">
              {!maintenanceMasterRows.length ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                  <span>No Maintenance Schedule Master Saved Yet.</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openDataEntry("maintenance_master", {})}
                  >
                    Open Maintenance Masters
                  </Button>
                </div>
              ) : null}
              {!checklistOptions.length ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                  <span>No Maintenance Checklist Saved Yet.</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      openDataEntry(
                        "maintenance_checklist_master",
                        maintenanceChecklistMasterDefaults("machineMasterTab")
                      )
                    }
                  >
                    Open Checklists
                  </Button>
                </div>
              ) : null}
              {selectedChecklistRows.length ? (
                <MaintenanceChecklistPreview rows={selectedChecklistRows} />
              ) : null}
              <form className="grid gap-3" onSubmit={saveSchedule}>
                <input
                  type="hidden"
                  name="machineNo"
                  value={displayValue(selectedMachine.machineNo)}
                />
                <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
                  <Field label="Maintenance Schedule">
                    <SearchableSelect
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      value={selectedMaintenanceCode}
                      onChange={(event) => {
                        const code = event.target.value
                        setSelectedMaintenanceCode(code)
                        const master = maintenanceMasterRows.find(
                          (row) =>
                            machineKey(row.maintenanceCode) === machineKey(code)
                        )
                        setSelectedChecklistCode(
                          displayValue(master?.checklistCode) !== "-"
                            ? displayValue(master?.checklistCode)
                            : ""
                        )
                      }}
                      required
                    >
                      <option value="">Select Schedule</option>
                      {maintenanceMasterRows.map((row) => (
                        <option
                          key={displayValue(row.maintenanceCode)}
                          value={displayValue(row.maintenanceCode)}
                        >
                          {displayValue(row.maintenanceTitle)}
                        </option>
                      ))}
                    </SearchableSelect>
                  </Field>
                  <Field label="Schedule Code">
                    <Input
                      value={displayValue(selectedMaintenance?.maintenanceCode)}
                      readOnly
                    />
                  </Field>
                  <Field label="Frequency Days">
                    <Input
                      value={displayValue(selectedMaintenance?.frequencyDays)}
                      readOnly
                    />
                  </Field>
                  <Field label="Checklist Code">
                    <Input
                      value={displayValue(selectedMaintenance?.checklistCode)}
                      readOnly
                    />
                  </Field>
                  <Field label="First Due Date">
                    <Input
                      name="firstDueDate"
                      type="date"
                      defaultValue={todayIsoDate()}
                      required
                    />
                  </Field>
                  <Field label="Estimated Minutes">
                    <Input
                      value={displayValue(
                        selectedMaintenance?.estimatedMinutes
                      )}
                      readOnly
                    />
                  </Field>
                  <Field label="Status">
                    <SearchableSelect
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      name="status"
                      defaultValue="Active"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </SearchableSelect>
                  </Field>
                  <Field label="Remark">
                    <Input name="remark" />
                  </Field>
                </div>
                <Button
                  type="submit"
                  className="w-fit"
                  disabled={!selectedMaintenance}
                >
                  <CalendarDays className="size-4" />
                  Save Schedule
                </Button>
              </form>
            </div>
          ) : null}
          {machineSchedules.length ? (
            <div className="overflow-auto rounded-lg border">
              <Table
                onFilteredRowCountChange={(visible) =>
                  setVisibleScheduleCount(visible)
                }
              >
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>First Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machineSchedules.length ? (
                    machineSchedules.map((row) => (
                      <TableRow key={maintenanceScheduleKey(row)}>
                        <TableCell>
                          {displayValue(row.maintenanceCode)}
                        </TableCell>
                        <TableCell>
                          {displayValue(row.maintenanceTitle)}
                        </TableCell>
                        <TableCell>{displayValue(row.checklistCode)}</TableCell>
                        <TableCell>{maintenanceFrequencyLabel(row)}</TableCell>
                        <TableCell>{displayValue(row.firstDueDate)}</TableCell>
                        <TableCell>
                          <StatusBadge value={row.status || "Active"} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        No Machine Schedules Match The Selected Filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyRowsMessage>
              No Maintenance Schedules Saved For This Machine.
            </EmptyRowsMessage>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Maintenance History</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 @4xl/main:grid-cols-[minmax(0,1fr)_repeat(3,180px)]">
            <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
              <span>Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={historyQuery}
                  placeholder="Search Maintenance Report"
                  onChange={(event) => setHistoryQuery(event.target.value)}
                />
              </div>
            </Label>
            <FilterSelect
              label="Type"
              value={historyTypeFilter}
              onChange={setHistoryTypeFilter}
              options={[
                ["", "All types"],
                ...typeOptions.map(
                  (value) => [value, value] as [string, string]
                ),
              ]}
            />
            <FilterSelect
              label="Code"
              value={historyCodeFilter}
              onChange={setHistoryCodeFilter}
              options={[
                ["", "All codes"],
                ...codeOptions.map(
                  (value) => [value, value] as [string, string]
                ),
              ]}
            />
            <FilterSelect
              label="Result"
              value={historyResultFilter}
              onChange={setHistoryResultFilter}
              options={[
                ["", "All results"],
                ...resultOptions.map(
                  (value) => [value, value] as [string, string]
                ),
              ]}
            />
          </div>
          {filteredHistory.length ? (
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Maintenance</TableHead>
                    <TableHead>Changed Parts</TableHead>
                    <TableHead>Done By</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((row) => {
                    const key = maintenanceRecordKey(row)
                    return (
                      <TableRow
                        key={key}
                        className={
                          key === selectedReportKey ? "bg-muted/50" : ""
                        }
                      >
                        <TableCell>{displayValue(row.completedDate)}</TableCell>
                        <TableCell>
                          <StatusBadge
                            value={row.maintenanceType || "Planned"}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {displayValue(row.maintenanceCode)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {displayValue(row.maintenanceTitle)}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-64 truncate">
                          {displayValue(row.partsChanged)}
                        </TableCell>
                        <TableCell>{displayValue(row.completedBy)}</TableCell>
                        <TableCell>
                          <StatusBadge value={row.result} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedReportKey(key)}
                          >
                            Report
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyRowsMessage>
              No Maintenance Records Match This Machine And Filter.
            </EmptyRowsMessage>
          )}
          {selectedReport ? (
            <MaintenanceReportDetail row={selectedReport} />
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

function MaintenancePanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const [requestRows, setRequestRows] = useState<MaintenanceRequestRow[]>([])
  const [requestReloadKey, setRequestReloadKey] = useState(0)
  const machineRows = useMemo(
    () =>
      maintenanceMachineRows(asArray(productionControl.machinePlanningRows)),
    [productionControl.machinePlanningRows]
  )
  const scheduleRows = useMemo(
    () => asArray(productionControl.maintenanceScheduleRows),
    [productionControl.maintenanceScheduleRows]
  )
  const completionRows = asArray(productionControl.maintenanceTaskRows)
  const checklistRows = asArray(
    productionControl.maintenanceChecklistMasterRows
  )
  const activeChecklistRows = useMemo(
    () => activeMaintenanceChecklistRows(checklistRows),
    [checklistRows]
  )
  const productionRunRows = useMemo(
    () => asArray(productionControl.productionRunRows),
    [productionControl.productionRunRows]
  )
  const dueRows = useMemo(
    () =>
      maintenanceDueRows(
        scheduleRows,
        completionRows,
        machineRows,
        activeChecklistRows,
        productionRunRows
      ),
    [
      scheduleRows,
      completionRows,
      machineRows,
      activeChecklistRows,
      productionRunRows,
    ]
  )
  const dueNowRows = dueRows.filter((row) => row.status !== "Upcoming")
  const workRows = useMemo(
    () => unifiedMechanicalWorkRows(dueRows, requestRows),
    [dueRows, requestRows]
  )
  const breakdownRows = completionRows.filter(
    (row) => str(row.maintenanceType).toLowerCase() === "breakdown"
  )

  useEffect(() => {
    let active = true
    void fetch("/api/maintenance/requests", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return { rows: [] }
        return (await response.json()) as { rows?: MaintenanceRequestRow[] }
      })
      .then((result) => {
        if (active) setRequestRows(result.rows ?? [])
      })
      .catch(() => {
        if (active) setRequestRows([])
      })
    return () => {
      active = false
    }
  }, [requestReloadKey])

  async function advanceRequest(
    requestId: string,
    action: "start" | "complete"
  ) {
    const response = await fetch("/api/maintenance/requests", {
      body: JSON.stringify({ action, requestId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    if (!response.ok) throw new Error("Maintenance request update failed.")
    setRequestReloadKey((current) => current + 1)
  }

  async function markMaintenanceDone(row: DashboardPayload) {
    const completedBy = window.prompt("Completed by")?.trim()
    if (!completedBy) return
    const actualMinutesText =
      window
        .prompt(
          "Actual minutes",
          displayValue(row.estimatedMinutes) !== "-"
            ? displayValue(row.estimatedMinutes)
            : ""
        )
        ?.trim() ?? ""
    const partsChanged = window.prompt("Parts changed", "")?.trim() ?? ""
    const workDone = window.prompt("Work done / remarks", "")?.trim() ?? ""
    const completedDate = todayIsoDate()
    const frequencyDays = optionalNumber(row.frequencyDays) ?? 0
    const payload = {
      taskId: maintenanceTaskId(row, completedDate),
      maintenanceType: "Planned",
      scheduleKey: maintenanceScheduleKey(row),
      machineNo: displayValue(row.machineNo),
      machineType:
        displayValue(row.machineType) !== "-"
          ? displayValue(row.machineType)
          : "",
      maintenanceCode: displayValue(row.maintenanceCode),
      maintenanceTitle: displayValue(row.maintenanceTitle),
      frequencyBasis: maintenanceFrequencyBasis(row),
      checklistCode:
        displayValue(row.checklistCode) !== "-"
          ? displayValue(row.checklistCode)
          : "",
      checklistTitle:
        displayValue(row.checklistTitle) !== "-"
          ? displayValue(row.checklistTitle)
          : "",
      checklistSteps: maintenanceChecklistCompletionSteps(
        row,
        activeChecklistRows
      ),
      completedDate,
      completedAt: new Date().toISOString(),
      completedBy,
      actualMinutes: optionalNumber(actualMinutesText) ?? actualMinutesText,
      result: "Completed",
      partsChanged,
      workDone,
      nextDueDate:
        maintenanceFrequencyBasis(row) === "running"
          ? ""
          : frequencyDays > 0
            ? addIsoDays(completedDate, frequencyDays)
            : "",
      remark: workDone || "Completed from maintenance task list.",
    }
    await submitAction("data-entry", {
      entryType: "maintenance_task",
      key: dataEntryKey("maintenance_task", payload),
      payload,
    })
  }

  async function saveBreakdownMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const machineNo = str(formData.get("machineNo"))
    const machine = machineRows.find(
      (row) => machineKey(row.machineNo) === machineKey(machineNo)
    )
    const completedDate = str(formData.get("completedDate")) || todayIsoDate()
    const payload = {
      taskId: breakdownMaintenanceTaskId(machineNo, completedDate),
      maintenanceType: "Breakdown",
      machineNo,
      machineType:
        displayValue(machine?.machineType) !== "-"
          ? displayValue(machine?.machineType)
          : "",
      machineName:
        displayValue(machine?.machineName) !== "-"
          ? displayValue(machine?.machineName)
          : "",
      location:
        displayValue(machine?.location) !== "-"
          ? displayValue(machine?.location)
          : "",
      maintenanceCode: str(formData.get("maintenanceCode")) || "BREAKDOWN",
      maintenanceTitle:
        str(formData.get("maintenanceTitle")) || "Breakdown maintenance",
      completedDate,
      completedAt: new Date().toISOString(),
      completedBy: str(formData.get("completedBy")),
      actualMinutes:
        optionalNumber(formData.get("actualMinutes")) ??
        str(formData.get("actualMinutes")),
      result: str(formData.get("result")) || "Completed",
      breakdownReason: str(formData.get("breakdownReason")),
      workDone: str(formData.get("workDone")),
      partsChanged: str(formData.get("partsChanged")),
      remark: str(formData.get("remark")),
    }
    await submitAction("data-entry", {
      entryType: "maintenance_task",
      key: dataEntryKey("maintenance_task", payload),
      payload,
    })
    form.reset()
  }

  return (
    <section className="grid gap-4">
      <TrackingSummary
        tones={["brand", "success", "warning", "info", "error"]}
        items={[
          ["Machines", formatNumber(machineRows.length)],
          ["Saved schedules", formatNumber(scheduleRows.length)],
          ["Due now", formatNumber(dueNowRows.length)],
          ["Request work", formatNumber(requestRows.length)],
          ["Breakdowns", formatNumber(breakdownRows.length)],
        ]}
      />
      <Card className={dueNowRows.length ? "border-amber-300/80" : ""}>
        <CardHeader>
          <CardTitle>Maintenance Pending Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {workRows.length ? (
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Machine / Location</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Relevant Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workRows.map((work) => {
                    const scheduled =
                      work.workType === "Scheduled"
                        ? (work.scheduled as DashboardPayload)
                        : null
                    return (
                      <TableRow
                        className={
                          work.priority === "Urgent"
                            ? "bg-[var(--color-error-bg)]/55 hover:bg-[var(--color-error-bg)]/75"
                            : undefined
                        }
                        key={
                          work.workType === "Scheduled"
                            ? `scheduled:${maintenanceScheduleKey(
                                work.scheduled as DashboardPayload
                              )}`
                            : `request:${work.requestId}`
                        }
                      >
                        <TableCell>
                          <Badge variant="outline">{work.workType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              work.priority === "Urgent"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {work.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {work.machineOrLocation}
                          </div>
                          {scheduled ? (
                            <div className="text-xs text-muted-foreground">
                              {displayValue(scheduled.machineType)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-96">
                          {scheduled ? (
                            <>
                              <div className="font-medium">
                                {displayValue(scheduled.maintenanceCode)} -{" "}
                                {displayValue(scheduled.maintenanceTitle)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Every {maintenanceFrequencyLabel(scheduled)} ·{" "}
                                {formatNumber(
                                  asArray(scheduled.checklistSteps).length
                                )}{" "}
                                checklist steps
                              </div>
                            </>
                          ) : (
                            <div className="line-clamp-3">
                              {work.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            {work.date ? formatIstDateTime(work.date) : "—"}
                          </div>
                          {scheduled &&
                          displayValue(scheduled.dueProgress) !== "-" ? (
                            <div className="text-xs text-muted-foreground">
                              {displayValue(scheduled.dueProgress)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={work.status} />
                        </TableCell>
                        <TableCell>{work.assignee ?? "Unassigned"}</TableCell>
                        <TableCell>
                          {scheduled ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                scheduled.status === "Upcoming"
                                  ? "outline"
                                  : "default"
                              }
                              onClick={() =>
                                void markMaintenanceDone(scheduled)
                              }
                            >
                              <CheckCircle2 className="size-4" />
                              Mark Done
                            </Button>
                          ) : work.workType === "Request" &&
                            (work.status === "Approved" ||
                              work.status === "In Progress") ? (
                            <Button
                              onClick={() =>
                                void advanceRequest(
                                  work.requestId,
                                  work.status === "Approved"
                                    ? "start"
                                    : "complete"
                                )
                              }
                              size="sm"
                              type="button"
                            >
                              {work.status === "Approved"
                                ? "Start"
                                : "Complete"}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyRowsMessage>
              No Maintenance Schedules Saved Yet. Add Schedules From Machine
              Master.
            </EmptyRowsMessage>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Breakdown Maintenance Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={saveBreakdownMaintenance}>
            <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
              <Field label="Machine No.">
                <SearchableSelect
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  name="machineNo"
                  required
                >
                  <option value="">Select Machine</option>
                  {machineRows.map((row) => (
                    <option
                      key={displayValue(row.machineNo)}
                      value={displayValue(row.machineNo)}
                    >
                      {displayValue(row.machineNo)}
                    </option>
                  ))}
                </SearchableSelect>
              </Field>
              <Field label="Date">
                <Input
                  name="completedDate"
                  type="date"
                  defaultValue={todayIsoDate()}
                  required
                />
              </Field>
              <Field label="Completed By">
                <Input name="completedBy" required />
              </Field>
              <Field label="Actual Minutes">
                <Input name="actualMinutes" type="number" min="0" />
              </Field>
              <Field label="Maintenance Code">
                <Input name="maintenanceCode" defaultValue="BREAKDOWN" />
              </Field>
              <Field label="Maintenance Title">
                <Input
                  name="maintenanceTitle"
                  defaultValue="Breakdown maintenance"
                />
              </Field>
              <Field label="Result">
                <SearchableSelect
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  name="result"
                  defaultValue="Completed"
                >
                  <option value="Completed">Completed</option>
                  <option value="Needs follow up">Needs Follow Up</option>
                  <option value="Skipped">Skipped</option>
                </SearchableSelect>
              </Field>
              <Field label="Breakdown Reason">
                <Input name="breakdownReason" required />
              </Field>
              <Field label="Parts Changed">
                <Input name="partsChanged" />
              </Field>
              <Field label="Work Done">
                <Input name="workDone" />
              </Field>
              <Field label="Remark">
                <Input name="remark" />
              </Field>
            </div>
            <Button
              type="submit"
              className="w-fit"
              disabled={!machineRows.length}
            >
              <Wrench className="size-4" />
              Save Breakdown
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}

function MaintenanceReportDetail({ row }: { row: DashboardPayload }) {
  const checklistSteps = asArray(row.checklistSteps)
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Maintenance Report</div>
          <div className="text-xs text-muted-foreground">
            {displayValue(row.machineNo)} / {displayValue(row.completedDate)} /{" "}
            {displayValue(row.maintenanceCode)}
          </div>
        </div>
        <StatusBadge value={row.maintenanceType || "Planned"} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <TileField
          label="Maintenance"
          value={`${displayValue(row.maintenanceCode)} - ${displayValue(row.maintenanceTitle)}`}
          important
        />
        <TileField label="Completed By" value={row.completedBy} />
        <TileField label="Actual Minutes" value={row.actualMinutes} numeric />
        <TileField label="Result" value={row.result} />
        <TileField label="Parts Changed" value={row.partsChanged} />
        <TileField label="Breakdown Reason" value={row.breakdownReason} />
        <TileField label="Work Done" value={row.workDone} />
        <TileField label="Next Due" value={row.nextDueDate} />
      </div>
      {displayValue(row.remark) !== "-" ? (
        <div className="text-sm text-muted-foreground">
          {displayValue(row.remark)}
        </div>
      ) : null}
      {checklistSteps.length ? (
        <div className="overflow-auto rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checklistSteps.map((step, index) => (
                <TableRow key={`${displayValue(step.sequence)}-${index}`}>
                  <TableCell>{displayValue(step.sequence)}</TableCell>
                  <TableCell>{displayValue(step.stepDescription)}</TableCell>
                  <TableCell>{displayValue(step.value)}</TableCell>
                  <TableCell>
                    <StatusBadge value={step.result || "Recorded"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
function MaintenanceChecklistPreview({ rows }: { rows: DashboardPayload[] }) {
  return (
    <div className="grid gap-2 rounded-md border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {displayValue(rows[0]?.checklistCode)} -{" "}
          {displayValue(rows[0]?.checklistTitle)}
        </div>
        <StatusBadge value={`${formatNumber(rows.length)} steps`} />
      </div>
      <div className="grid gap-1 text-sm">
        {rows.slice(0, 6).map((row) => (
          <div
            key={maintenanceChecklistStepKey(row)}
            className="flex gap-2 text-muted-foreground"
          >
            <span className="min-w-10 font-medium text-foreground">
              {displayValue(row.sequence)}
            </span>
            <span>{displayValue(row.stepDescription)}</span>
          </div>
        ))}
        {rows.length > 6 ? (
          <div className="text-xs text-muted-foreground">
            {formatNumber(rows.length - 6)} More Steps
          </div>
        ) : null}
      </div>
    </div>
  )
}
function PlanningHolidayPanel({
  productionControl,
  submitAction,
}: {
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const holidayRows = asArray(productionControl.planningHolidayRows)
  const calendar = asRecord(productionControl.planningCalendar)
  const [isSaving, setIsSaving] = useState(false)

  async function saveHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const coverage = str(formData.get("coverage"))
    const targets =
      coverage === "all"
        ? productionFloors
        : productionFloors.filter((floor) => floor.code === coverage)
    setIsSaving(true)
    try {
      for (const floor of targets) {
        await submitAction("data-entry", {
          entryType: "planning_holiday",
          productionFloorCode: floor.code,
          returnTab: "planningHolidayTab",
          payload: {
            date: str(formData.get("date")),
            reason: str(formData.get("reason")) || "Plant holiday",
            scope: coverage === "all" ? "Factory" : "Department",
            department: floor.code,
            departmentLabel: floor.shortLabel,
            factoryWide: coverage === "all",
            remark: str(formData.get("remark")),
          },
        })
      }
      form.reset()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="grid gap-4">
      <TrackingSummary
        tones={["accent", "brand", "info"]}
        items={[
          ["Weekly shutdown", displayValue(calendar.weeklyHoliday || "Friday")],
          ["Manual holidays", formatNumber(holidayRows.length)],
          ["Next saved date", nextPlanningHolidayLabel(holidayRows)],
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Plan A Holiday</CardTitle>
          <CardDescription>
            All Factory Applies The Date To Every Production Department. A
            Department Choice Affects Only That Production Floor.
          </CardDescription>
        </CardHeader>
        {isSaving ? (
          <div className="px-6">
            <ProcessingNotice message="Saving the planning holiday..." />
          </div>
        ) : null}
        <fieldset aria-busy={isSaving} className="contents" disabled={isSaving}>
          <CardContent>
            <form className="grid gap-3" onSubmit={saveHoliday}>
              <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-4">
                <Field label="Holiday Date">
                  <Input name="date" type="date" required />
                </Field>
                <Field label="Reason">
                  <SearchableSelect
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    name="reason"
                    defaultValue="Plant holiday"
                  >
                    <option value="Plant holiday">Plant Holiday</option>
                    <option value="Vacation">Vacation</option>
                    <option value="Maintenance shutdown">
                      Maintenance Shutdown
                    </option>
                    <option value="Other">Other</option>
                  </SearchableSelect>
                </Field>
                <Field label="Applies To">
                  <SearchableSelect
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    name="coverage"
                    defaultValue="all"
                  >
                    <option value="all">All Factory</option>
                    {productionFloors.map((floor) => (
                      <option key={floor.code} value={floor.code}>
                        {floor.shortLabel}
                      </option>
                    ))}
                  </SearchableSelect>
                </Field>
                <Field label="Remark">
                  <Input name="remark" />
                </Field>
              </div>
              <Button className="w-fit" type="submit" disabled={isSaving}>
                <CalendarDays className="size-4" />
                {isSaving ? "Saving..." : "Save Holiday"}
              </Button>
            </form>
          </CardContent>
        </fieldset>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Saved Planning Holidays</CardTitle>
        </CardHeader>
        <CardContent>
          {holidayRows.length ? (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidayRows.map((row, index) => (
                    <TableRow
                      key={`${displayValue(row.dateValue || row.date)}-${index}`}
                    >
                      <TableCell>{displayValue(row.date)}</TableCell>
                      <TableCell>{displayValue(row.reason)}</TableCell>
                      <TableCell>{planningHolidayCoverageLabel(row)}</TableCell>
                      <TableCell>{displayValue(row.remark)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyRowsMessage>
              No Manual Planning Holidays Saved Yet.
            </EmptyRowsMessage>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function DataEntryForm({
  spec,
  submitAction,
  defaults,
  dataEntry,
  masterRows = [],
  productionControl = {},
  productionFloorCode,
  storeMasterData,
}: {
  spec: DataEntrySpec
  submitAction: (
    path: string,
    body: Record<string, unknown>,
    options?: { throwOnError?: boolean }
  ) => Promise<void>
  defaults: Record<string, unknown>
  dataEntry?: DashboardPayload
  masterRows?: DashboardPayload[]
  productionControl?: DashboardPayload
  productionFloorCode?: ProductionFloorCode
  storeMasterData?: StoreMasterData | null
}) {
  const [locallyGeneratedCodes, setLocallyGeneratedCodes] = useState<string[]>(
    []
  )
  const generatedCode = nextAutomaticMasterCode(spec.entryType, [
    ...masterRows,
    ...locallyGeneratedCodes.map((code) => ({ code })),
  ])
  const resolvedDefaults = generatedCode
    ? { ...defaults, code: generatedCode }
    : defaults
  const toolingAssetCodes =
    storeMasterData?.items.map((item) => item.typeCode) ?? []
  const setupNames = setupNameOptions([
    ...dataEntryRowsForProductionMaster("setup_name_master", dataEntry ?? {}),
    ...asArray(productionControl.setupNameMasterRows),
  ])
  const routeMachineFamilies = machineFamilyOptions([
    ...asArray(productionControl.machinePlanningRows),
    ...asArray(productionControl.routeMasterRows),
  ])
  const lockedFields = new Set(
    defaults.__editingMaster ? immutableMasterFields(spec.entryType) : []
  )
  const resolvedFields = spec.fields.map((field) => {
    const routeOptions =
      spec.entryType === "route" && field.name === "setupName"
        ? { ...field, options: ["", ...setupNames] }
        : spec.entryType === "route" && field.name === "machineFamily"
          ? { ...field, options: ["", ...routeMachineFamilies] }
          : field
    const withOptions =
      spec.entryType === "tooling" &&
      toolingAssetCodes.length &&
      ["fixture", "tooling", "foamTool"].includes(field.name)
        ? { ...routeOptions, options: ["", ...toolingAssetCodes] }
        : routeOptions
    return lockedFields.has(field.name)
      ? { ...withOptions, readOnly: true }
      : withOptions
  })
  const defaultsKey = JSON.stringify(resolvedDefaults)
  if (spec.entryType === "maintenance_master") {
    return (
      <MaintenanceMasterForm
        spec={spec}
        submitAction={submitAction}
        defaults={defaults}
        dataEntry={dataEntry}
        productionControl={productionControl}
      />
    )
  }
  if (spec.entryType === "maintenance_checklist_master") {
    return (
      <MaintenanceChecklistMasterForm
        spec={spec}
        submitAction={submitAction}
        defaults={defaults}
        dataEntry={dataEntry}
      />
    )
  }
  if (spec.entryType === "setup_checklist_master") {
    return (
      <SetupChecklistMasterForm
        spec={spec}
        submitAction={submitAction}
        defaults={defaults}
        rows={masterRows}
      />
    )
  }
  if (spec.entryType === "quality_parameter_master") {
    return (
      <QualityParameterMasterForm
        spec={spec}
        submitAction={submitAction}
        defaults={defaults}
        dataEntry={dataEntry}
        masterRows={masterRows}
        productionControl={productionControl}
      />
    )
  }
  if (spec.entryType === "cycle" || spec.entryType === "tooling") {
    return (
      <PlanningMasterRelationForm
        defaults={resolvedDefaults}
        kind={spec.entryType}
        routeRows={asArray(productionControl.routeMasterRows)}
        submitAction={submitAction}
        productionFloorCode={productionFloorCode}
        toolingAssetCodes={toolingAssetCodes}
      />
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <LegacyActionForm
          key={`${spec.entryType}-${defaultsKey}`}
          title={`Save ${spec.title}`}
          fields={resolvedFields}
          defaults={resolvedDefaults}
          buttonLabel={`Save ${spec.title}`}
          onSubmit={async (body) => {
            await submitAction("data-entry", {
              entryType: spec.entryType,
              id: defaults.__entryId,
              key: defaults.__entryKey,
              returnTab: defaults.__returnTab,
              payload: {
                ...body,
                ...(productionFloorCode ? { productionFloorCode } : {}),
              },
            })
            if (generatedCode)
              setLocallyGeneratedCodes((current) => [...current, generatedCode])
          }}
        />
      </CardContent>
    </Card>
  )
}

function PlanningMasterRelationForm({
  defaults,
  kind,
  productionFloorCode,
  routeRows,
  submitAction,
  toolingAssetCodes,
}: {
  defaults: Record<string, unknown>
  kind: "cycle" | "tooling"
  productionFloorCode?: ProductionFloorCode
  routeRows: DashboardPayload[]
  submitAction: (
    path: string,
    body: Record<string, unknown>,
    options?: { throwOnError?: boolean }
  ) => Promise<void>
  toolingAssetCodes: string[]
}) {
  const options = useMemo(() => routeMasterLineOptions(routeRows), [routeRows])
  const defaultKey = routeMasterLineKey(defaults)
  const [selectedKey, setSelectedKey] = useState(
    options.some((option) => option.key === defaultKey) ? defaultKey : ""
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const selected = options.find((option) => option.key === selectedKey)?.value
  const title = kind === "cycle" ? "Cycle Time Master" : "Tooling Master"

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || isSubmitting) return
    setIsSubmitting(true)
    try {
      const input = Object.fromEntries(
        new FormData(event.currentTarget).entries()
      )
      await submitAction("data-entry", {
        entryType: kind,
        id: defaults.__entryId,
        key: defaults.__entryKey,
        returnTab: defaults.__returnTab,
        payload: {
          ...planningMasterPayload(kind, selected, input),
          ...(productionFloorCode ? { productionFloorCode } : {}),
        },
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Select One Existing Route Master Line. Its Part, Option, Setup, Setup
          Name, And Machine Family Cannot Be Retyped Here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-busy={isSubmitting}
          className="grid gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <fieldset className="contents" disabled={isSubmitting}>
            <Field label="Route Master Line">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                onChange={(event) => setSelectedKey(event.target.value)}
                required
                value={selectedKey}
              >
                <option value="">Select Part · Option · Setup</option>
                {options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
            {selected ? (
              <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 md:grid-cols-2 @5xl/main:grid-cols-4">
                <TileField
                  label="Part No."
                  value={selected.partNo || selected.partCode}
                />
                <TileField label="Option No." value={selected.optionNumber} />
                <TileField label="Setup No." value={selected.setupNo} />
                <TileField label="Setup Name" value={selected.setupName} />
                <TileField
                  label="Machine Family"
                  value={selected.machineFamily}
                />
                <TileField label="Machine Type" value={selected.machineType} />
              </div>
            ) : null}
            {kind === "cycle" ? (
              <Field label="Cycle Time Sec">
                <Input
                  name="cycleTime"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={str(defaults.cycleTime)}
                />
              </Field>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
                {(
                  [
                    ["fixture", "Fixture"],
                    ["tooling", "Tooling"],
                    ["foamTool", "Foam Tool"],
                  ] as const
                ).map(([name, label]) => (
                  <Field key={name} label={label}>
                    <SearchableSelect
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      name={name}
                      defaultValue={str(defaults[name])}
                    >
                      <option value="">Not Required</option>
                      {toolingAssetCodes.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </SearchableSelect>
                  </Field>
                ))}
                <Field label="Remarks">
                  <Input name="remarks" defaultValue={str(defaults.remarks)} />
                </Field>
              </div>
            )}
            <Button
              className="w-fit"
              disabled={!selected || isSubmitting}
              type="submit"
            >
              <Wrench className="size-4" />
              {isSubmitting ? "Processing..." : `Save ${title}`}
            </Button>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  )
}

function QualityParameterMasterForm({
  spec,
  submitAction,
  defaults,
  dataEntry,
  masterRows,
  productionControl,
}: {
  spec: DataEntrySpec
  submitAction: (
    path: string,
    body: Record<string, unknown>,
    options?: { throwOnError?: boolean }
  ) => Promise<void>
  defaults: Record<string, unknown>
  dataEntry?: DashboardPayload
  masterRows: DashboardPayload[]
  productionControl: DashboardPayload
}) {
  const hourlyQualityPageData = usePostgresOperationalPage(
    "/api/hourly-quality",
    5_000
  ).data
  const hourlyQualityPageRecord = asRecord(hourlyQualityPageData)
  const [localRows, setLocalRows] = useState<DashboardPayload[]>([])
  const [removedRows, setRemovedRows] = useState<DashboardPayload[]>([])
  const [status, setStatus] = useState<ActionStatus>(null)
  const [isSaving, setIsSaving] = useState(false)
  const persistedRows = useMemo(() => {
    return mergeQualityParameterRows([
      ...masterRows,
      ...qualityParameterRowsFromDataEntry(dataEntry),
      ...asArray(hourlyQualityPageRecord.qualityParameterMasterRows),
    ])
  }, [
    dataEntry,
    hourlyQualityPageRecord.qualityParameterMasterRows,
    masterRows,
  ])
  const savedRows = useMemo(
    () => mergeQualityParameterRows([...persistedRows, ...localRows]),
    [persistedRows, localRows]
  )
  const [setupFields, setSetupFields] = useState(() => ({
    partNo: str(defaults.partNo),
    optionNumber: str(defaults.optionNumber),
    setupNo: str(defaults.setupNo),
  }))
  const selectedSetupKey = qualityParameterSetupKey(setupFields)
  const selectedRows = useMemo(
    () =>
      selectedSetupKey.replaceAll("|", "")
        ? sortQualityParameterRows(
            savedRows.filter(
              (row) =>
                qualityParameterSetupKey(row) === selectedSetupKey &&
                str(row.status || "Active").toLowerCase() !== "inactive"
            )
          )
        : [],
    [savedRows, selectedSetupKey]
  )
  const [drafts, setDrafts] = useState<QualityParameterDraft[]>(() =>
    selectedRows.length
      ? selectedRows.map(qualityParameterDraftFromRow)
      : [newQualityParameterDraft(1)]
  )
  const loadedParameterSetRef = useRef("")

  useEffect(() => {
    const nextSignature = `${selectedSetupKey}|${qualityParameterRowsSignature(selectedRows)}`
    if (loadedParameterSetRef.current === nextSignature) return
    loadedParameterSetRef.current = nextSignature
    const timeout = window.setTimeout(() => {
      setDrafts(
        selectedRows.length
          ? selectedRows.map(qualityParameterDraftFromRow)
          : [newQualityParameterDraft(1)]
      )
      setRemovedRows([])
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [selectedRows, selectedSetupKey])

  const routeLines = useMemo(
    () =>
      qualityParameterRouteLines(asArray(productionControl.routeMasterRows)),
    [productionControl.routeMasterRows]
  )
  const itemOptions = useMemo(
    () => uniqueValues(routeLines.map((row) => row.partNo)),
    [routeLines]
  )
  const optionOptions = useMemo(
    () =>
      uniqueValues(
        routeLines
          .filter(
            (row) => machineKey(row.partNo) === machineKey(setupFields.partNo)
          )
          .map((row) => row.optionNumber)
      ),
    [routeLines, setupFields.partNo]
  )
  const setupNumberOptions = useMemo(
    () =>
      uniqueValues(
        routeLines
          .filter(
            (row) =>
              machineKey(row.partNo) === machineKey(setupFields.partNo) &&
              machineKey(row.optionNumber) ===
                machineKey(setupFields.optionNumber)
          )
          .map((row) => row.setupNo)
      ),
    [routeLines, setupFields.optionNumber, setupFields.partNo]
  )
  const selectedRouteLineExists = routeLines.some(
    (row) =>
      qualityParameterSetupKey(row) === qualityParameterSetupKey(setupFields)
  )

  function updateDraft(
    draftId: string,
    field: keyof QualityParameterDraft,
    value: string
  ) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.draftId === draftId ? { ...draft, [field]: value } : draft
      )
    )
  }

  function addDraft() {
    setDrafts((current) => [
      ...current,
      newQualityParameterDraft(current.length + 1),
    ])
  }

  function removeDraft(draft: QualityParameterDraft) {
    if (draft.persisted)
      setRemovedRows((current) => [
        ...current,
        qualityParameterPayload(draft, setupFields, "Inactive"),
      ])
    setDrafts((current) =>
      current.filter((item) => item.draftId !== draft.draftId)
    )
  }

  async function saveParameterSet() {
    const activeDrafts = drafts.filter((draft) => draft.parameterName.trim())
    const duplicateSequences = activeDrafts
      .map((draft, index) => str(optionalNumber(draft.sequence) ?? index + 1))
      .filter(
        (sequence, index, sequences) =>
          sequence && sequences.indexOf(sequence) !== index
      )
    const duplicateParameter =
      duplicateQualityParameterCombination(activeDrafts)
    if (!selectedRouteLineExists) {
      setStatus({
        tone: "destructive",
        message:
          "Select an item, option, and setup that already exists in Route Master.",
      })
      return
    }
    if (!activeDrafts.length) {
      setStatus({
        tone: "destructive",
        message: "Add at least one parameter row.",
      })
      return
    }
    if (duplicateSequences.length) {
      setStatus({
        tone: "destructive",
        message:
          "Step numbers must be unique for this item, option, and setup.",
      })
      return
    }
    if (duplicateParameter) {
      setStatus({
        tone: "destructive",
        message:
          "The same parameter and specification cannot be repeated for one item, option, and setup.",
      })
      return
    }
    setIsSaving(true)
    setStatus(null)
    try {
      const activePayloads = activeDrafts.map((draft, index) =>
        normalizeUserEnteredPayload(
          qualityParameterPayload(
            { ...draft, sequence: draft.sequence || String(index + 1) },
            setupFields,
            "Active"
          )
        )
      )
      const inactivePayloads = removedRows
        .filter(
          (row) =>
            !activePayloads.some(
              (payload) =>
                dataEntryKey(spec.entryType, payload) ===
                dataEntryKey(spec.entryType, row)
            )
        )
        .map((row) => normalizeUserEnteredPayload(row))
      for (const payload of [...activePayloads, ...inactivePayloads]) {
        await submitAction(
          "data-entry",
          {
            entryType: spec.entryType,
            key: dataEntryKey(spec.entryType, payload),
            returnTab: "qualityParameterMasterTab",
            payload,
          },
          { throwOnError: true }
        )
      }
      setLocalRows((current) =>
        mergeQualityParameterRows([
          ...current,
          ...activePayloads,
          ...inactivePayloads,
        ])
      )
      setDrafts(activePayloads.map(qualityParameterDraftFromRow))
      setRemovedRows([])
      setStatus({
        tone: "default",
        message: "Quality inspection parameter set saved.",
      })
    } catch (err) {
      setStatus({
        tone: "destructive",
        message:
          err instanceof Error ? err.message : "Quality parameter save failed.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
      </CardHeader>
      {isSaving ? (
        <div className="px-6">
          <ProcessingNotice message="Saving quality inspection parameters..." />
        </div>
      ) : null}
      <fieldset aria-busy={isSaving} className="contents" disabled={isSaving}>
        <CardContent className="grid gap-4">
          {!routeLines.length ? (
            <AlertMessage tone="destructive">
              Create The Item, Option, And Setup Line In Route Master Before
              Adding Quality Inspection Parameters.
            </AlertMessage>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Item Code">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={setupFields.partNo}
                onChange={(event) => {
                  setSetupFields({
                    partNo: event.target.value,
                    optionNumber: "",
                    setupNo: "",
                  })
                  setStatus(null)
                }}
                required
              >
                <option value="">Select Route Master Item</option>
                {itemOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
            <Field label="Option No.">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={setupFields.optionNumber}
                onChange={(event) => {
                  setSetupFields((current) => ({
                    ...current,
                    optionNumber: event.target.value,
                    setupNo: "",
                  }))
                  setStatus(null)
                }}
                required
                disabled={!setupFields.partNo}
              >
                <option value="">Select Option</option>
                {optionOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
            <Field label="Setup No.">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={setupFields.setupNo}
                onChange={(event) => {
                  setSetupFields((current) => ({
                    ...current,
                    setupNo: event.target.value,
                  }))
                  setStatus(null)
                }}
                required
                disabled={!setupFields.optionNumber}
              >
                <option value="">Select Setup</option>
                {setupNumberOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
          </div>
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-20">Seq</TableHead>
                  <TableHead className="min-w-52">Parameter</TableHead>
                  <TableHead className="min-w-32">Spec</TableHead>
                  <TableHead className="min-w-40">Instrument</TableHead>
                  <TableHead className="min-w-28">Tol +</TableHead>
                  <TableHead className="min-w-28">Tol -</TableHead>
                  <TableHead className="min-w-32">Input</TableHead>
                  <TableHead className="min-w-44">Remark</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft, index) => (
                  <TableRow key={draft.draftId}>
                    <TableCell>
                      <Input
                        className="h-8 min-w-16"
                        type="number"
                        min="1"
                        value={draft.sequence || String(index + 1)}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "sequence",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-48"
                        value={draft.parameterName}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "parameterName",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-28"
                        value={draft.specification}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "specification",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-36"
                        value={draft.instrumentUsed}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "instrumentUsed",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-24"
                        type={draft.inputType === "number" ? "number" : "text"}
                        step={
                          draft.inputType === "number" ? "0.001" : undefined
                        }
                        value={draft.tolerancePlus}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "tolerancePlus",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-24"
                        type={draft.inputType === "number" ? "number" : "text"}
                        step={
                          draft.inputType === "number" ? "0.001" : undefined
                        }
                        value={draft.toleranceMinus}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "toleranceMinus",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <SearchableSelect
                        className="h-8 min-w-28 rounded-md border bg-background px-2 text-sm"
                        value={draft.inputType}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "inputType",
                            event.target.value
                          )
                        }
                      >
                        <option value="number">Number</option>
                        <option value="text">Text</option>
                        <option value="pass_fail">Ok / Not Ok</option>
                      </SearchableSelect>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-40"
                        value={draft.remark}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "remark",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        aria-label="Remove Parameter"
                        onClick={() => removeDraft(draft)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={addDraft}>
              <Plus className="size-4" />
              Add Parameter
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {status ? (
                <AlertMessage tone={status.tone}>{status.message}</AlertMessage>
              ) : null}
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => void saveParameterSet()}
              >
                <CheckCircle2 className="size-4" />
                {isSaving ? "Saving" : "Save Parameter Set"}
              </Button>
            </div>
          </div>
        </CardContent>
      </fieldset>
    </Card>
  )
}
function MaintenanceMasterForm({
  spec,
  submitAction,
  defaults,
  dataEntry,
  productionControl,
}: {
  spec: DataEntrySpec
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  defaults: Record<string, unknown>
  dataEntry?: DashboardPayload
  productionControl?: DashboardPayload
}) {
  const [localRows, setLocalRows] = useState<DashboardPayload[]>([])
  const persistedRows = useMemo(
    () => maintenanceMasterRowsFromDataEntry(dataEntry),
    [dataEntry]
  )
  const savedRows = useMemo(() => {
    const persistedKeys = new Set(persistedRows.map(maintenanceMasterKey))
    return [
      ...persistedRows,
      ...localRows.filter(
        (row) => !persistedKeys.has(maintenanceMasterKey(row))
      ),
    ]
  }, [persistedRows, localRows])
  const scheduleOptions = useMemo(
    () => activeMaintenanceMasterRows(savedRows),
    [savedRows]
  )
  const checklistRows = useMemo(
    () =>
      activeMaintenanceChecklistRows(
        maintenanceChecklistRowsForSchedule(dataEntry, productionControl)
      ),
    [dataEntry, productionControl]
  )
  const checklistOptions = useMemo(
    () => maintenanceChecklistOptions(checklistRows),
    [checklistRows]
  )
  const defaultCode =
    displayValue(defaults.maintenanceCode) !== "-"
      ? displayValue(defaults.maintenanceCode)
      : nextMaintenanceMasterCode(savedRows)
  const [selectedCode, setSelectedCode] = useState(defaultCode)
  const selectedMaster = savedRows.find(
    (row) => maintenanceMasterKey(row) === machineKey(selectedCode)
  )
  const isExistingSchedule = Boolean(selectedMaster)
  const selectedChecklistCode = displayValue(
    selectedMaster?.checklistCode ?? defaults.checklistCode
  )
  const [checklistCodeOverride, setChecklistCodeOverride] = useState("")
  const previewChecklistCode =
    checklistCodeOverride ||
    (selectedChecklistCode !== "-" ? selectedChecklistCode : "")
  const previewChecklistRows = previewChecklistCode
    ? maintenanceChecklistRowsForCode(checklistRows, previewChecklistCode)
    : []

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const checklistCode = str(formData.get("checklistCode"))
    const payload = {
      maintenanceCode: selectedCode || nextMaintenanceMasterCode(savedRows),
      maintenanceTitle: str(formData.get("maintenanceTitle")),
      frequencyDays:
        optionalNumber(formData.get("frequencyDays")) ??
        str(formData.get("frequencyDays")),
      frequencyBasis: str(formData.get("frequencyBasis")) || "Calendar days",
      checklistCode,
      checklistTitle: maintenanceChecklistTitle(checklistRows, checklistCode),
      estimatedMinutes:
        optionalNumber(formData.get("estimatedMinutes")) ??
        str(formData.get("estimatedMinutes")),
      status: "Active",
      remark: str(formData.get("remark")),
    }
    void submitAction("data-entry", {
      entryType: spec.entryType,
      id: defaults.__entryId,
      key: dataEntryKey(spec.entryType, payload),
      returnTab: defaults.__returnTab,
      payload,
    })
    setLocalRows((current) => [
      ...current.filter(
        (row) => maintenanceMasterKey(row) !== maintenanceMasterKey(payload)
      ),
      payload,
    ])
    setSelectedCode(
      str(payload.maintenanceCode) || nextMaintenanceMasterCode(savedRows)
    )
  }

  const selectedTitle = displayValue(
    selectedMaster?.maintenanceTitle ?? defaults.maintenanceTitle
  )
  const selectedFrequency = displayValue(
    selectedMaster?.frequencyDays ?? defaults.frequencyDays
  )
  const selectedFrequencyBasis = displayValue(
    selectedMaster?.frequencyBasis ?? defaults.frequencyBasis
  )
  const selectedEstimatedMinutes = displayValue(
    selectedMaster?.estimatedMinutes ?? defaults.estimatedMinutes
  )
  const selectedRemark = displayValue(selectedMaster?.remark ?? defaults.remark)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="Maintenance Schedule">
            <SearchableSelect
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={selectedCode}
              onChange={(event) => {
                setSelectedCode(event.target.value)
                setChecklistCodeOverride("")
              }}
            >
              <option value={nextMaintenanceMasterCode(savedRows)}>
                New Schedule ({nextMaintenanceMasterCode(savedRows)})
              </option>
              {scheduleOptions.map((row) => (
                <option
                  key={displayValue(row.maintenanceCode)}
                  value={displayValue(row.maintenanceCode)}
                >
                  {displayValue(row.maintenanceCode)} -{" "}
                  {displayValue(row.maintenanceTitle)}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <TileField
            label="Saved Schedules"
            value={scheduleOptions.length}
            numeric
          />
        </div>
        {previewChecklistRows.length ? (
          <MaintenanceChecklistPreview rows={previewChecklistRows} />
        ) : null}
        <form
          key={`${spec.entryType}-${selectedCode}`}
          className="grid gap-3 rounded-xl border bg-background p-3"
          onSubmit={submit}
        >
          <div>
            <div className="text-sm font-medium">
              {isExistingSchedule
                ? "Update Maintenance Schedule"
                : "Create Maintenance Schedule"}
            </div>
            <div className="text-xs text-muted-foreground">
              The Generated Code Identifies This Reusable Schedule; The Title Is
              What Users Select When Assigning It To Machines.
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
            <Field label="Maintenance Code">
              <Input name="maintenanceCode" value={selectedCode} readOnly />
            </Field>
            <Field label="Maintenance Schedule Title">
              <Input
                name="maintenanceTitle"
                defaultValue={selectedTitle !== "-" ? selectedTitle : ""}
                required
              />
            </Field>
            <Field label="Frequency">
              <Input
                name="frequencyDays"
                type="number"
                min="1"
                defaultValue={
                  selectedFrequency !== "-" ? selectedFrequency : ""
                }
                required
              />
            </Field>
            <Field label="Frequency Basis">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                name="frequencyBasis"
                defaultValue={
                  selectedFrequencyBasis !== "-"
                    ? selectedFrequencyBasis
                    : "Calendar Days"
                }
              >
                <option value="Calendar days">Calendar Days</option>
                <option value="Running days">Running Days</option>
              </SearchableSelect>
            </Field>
            <Field label="Checklist">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                name="checklistCode"
                value={previewChecklistCode}
                onChange={(event) =>
                  setChecklistCodeOverride(event.target.value)
                }
              >
                <option value="">No Checklist</option>
                {checklistOptions.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.code} - {row.title}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
            <Field label="Estimated Minutes">
              <Input
                name="estimatedMinutes"
                type="number"
                min="0"
                defaultValue={
                  selectedEstimatedMinutes !== "-"
                    ? selectedEstimatedMinutes
                    : ""
                }
              />
            </Field>
            <Field label="Remark">
              <Input
                name="remark"
                defaultValue={selectedRemark !== "-" ? selectedRemark : ""}
              />
            </Field>
          </div>
          <Button className="w-fit" type="submit">
            <Wrench className="size-4" />
            {isExistingSchedule ? "Update Schedule" : "Create Schedule"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
function MaintenanceChecklistMasterForm({
  spec,
  submitAction,
  defaults,
  dataEntry,
}: {
  spec: DataEntrySpec
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  defaults: Record<string, unknown>
  dataEntry?: DashboardPayload
}) {
  const [localRows, setLocalRows] = useState<DashboardPayload[]>([])
  const [removedRows, setRemovedRows] = useState<DashboardPayload[]>([])
  const [status, setStatus] = useState<ActionStatus>(null)
  const [isSaving, setIsSaving] = useState(false)
  const persistedRows = useMemo(
    () => maintenanceChecklistMasterRowsFromDataEntry(dataEntry),
    [dataEntry]
  )
  const savedRows = useMemo(
    () => mergeMaintenanceChecklistRows([...persistedRows, ...localRows]),
    [persistedRows, localRows]
  )
  const checklistOptions = useMemo(
    () => maintenanceChecklistOptions(savedRows),
    [savedRows]
  )
  const defaultCode =
    displayValue(defaults.checklistCode) !== "-"
      ? displayValue(defaults.checklistCode)
      : nextMaintenanceChecklistCode(savedRows)
  const [selectedCode, setSelectedCode] = useState(defaultCode)
  const selectedRows = useMemo(
    () =>
      selectedCode
        ? maintenanceChecklistRowsForCode(savedRows, selectedCode)
        : [],
    [savedRows, selectedCode]
  )
  const selectedChecklist = checklistOptions.find(
    (row) => machineKey(row.code) === machineKey(selectedCode)
  )
  const defaultTitle =
    selectedChecklist?.title ||
    (displayValue(defaults.checklistTitle) !== "-"
      ? displayValue(defaults.checklistTitle)
      : "")
  const [checklistTitle, setChecklistTitle] = useState(defaultTitle)
  const [drafts, setDrafts] = useState<MaintenanceChecklistStepDraft[]>(() =>
    selectedRows.length
      ? selectedRows.map(maintenanceChecklistDraftFromRow)
      : [newMaintenanceChecklistDraft(1)]
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const rows = selectedCode
        ? maintenanceChecklistRowsForCode(savedRows, selectedCode)
        : []
      const option = checklistOptions.find(
        (item) => machineKey(item.code) === machineKey(selectedCode)
      )
      setChecklistTitle(
        option?.title ||
          (displayValue(defaults.checklistTitle) !== "-"
            ? displayValue(defaults.checklistTitle)
            : "")
      )
      setDrafts(
        rows.length
          ? rows.map(maintenanceChecklistDraftFromRow)
          : [newMaintenanceChecklistDraft(1)]
      )
      setRemovedRows([])
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [checklistOptions, defaults.checklistTitle, savedRows, selectedCode])

  function startNewChecklist() {
    const nextCode = nextMaintenanceChecklistCode(savedRows)
    setSelectedCode(nextCode)
    setChecklistTitle("")
    setDrafts([newMaintenanceChecklistDraft(1)])
    setRemovedRows([])
    setStatus(null)
  }

  function updateDraft(
    draftId: string,
    field: keyof MaintenanceChecklistStepDraft,
    value: string
  ) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.draftId === draftId ? { ...draft, [field]: value } : draft
      )
    )
  }

  function addDraft() {
    setDrafts((current) => [
      ...current,
      newMaintenanceChecklistDraft(current.length + 1),
    ])
  }

  function removeDraft(draft: MaintenanceChecklistStepDraft) {
    if (draft.persisted)
      setRemovedRows((current) => [
        ...current,
        maintenanceChecklistPayload(
          draft,
          selectedCode,
          checklistTitle,
          "Inactive"
        ),
      ])
    setDrafts((current) =>
      current.filter((item) => item.draftId !== draft.draftId)
    )
  }

  async function saveChecklist() {
    const code = selectedCode || nextMaintenanceChecklistCode(savedRows)
    const title = checklistTitle.trim()
    const activeDrafts = drafts.filter((draft) => draft.stepDescription.trim())
    const duplicateSequences = activeDrafts
      .map((draft, index) => str(optionalNumber(draft.sequence) ?? index + 1))
      .filter(
        (sequence, index, sequences) =>
          sequence && sequences.indexOf(sequence) !== index
      )
    if (!title) {
      setStatus({
        tone: "destructive",
        message: "Checklist title is required.",
      })
      return
    }
    if (!activeDrafts.length) {
      setStatus({
        tone: "destructive",
        message: "Add at least one checklist step.",
      })
      return
    }
    if (duplicateSequences.length) {
      setStatus({
        tone: "destructive",
        message: "Step numbers must be unique in one checklist.",
      })
      return
    }
    setIsSaving(true)
    setStatus(null)
    try {
      const activePayloads = activeDrafts.map((draft, index) =>
        normalizeUserEnteredPayload(
          maintenanceChecklistPayload(
            { ...draft, sequence: draft.sequence || String(index + 1) },
            code,
            title,
            "Active"
          )
        )
      )
      const inactivePayloads = removedRows
        .filter(
          (row) =>
            !activePayloads.some(
              (payload) =>
                dataEntryKey(spec.entryType, payload) ===
                dataEntryKey(spec.entryType, row)
            )
        )
        .map((row) => normalizeUserEnteredPayload(row))
      for (const payload of [...activePayloads, ...inactivePayloads]) {
        await submitAction("data-entry", {
          entryType: spec.entryType,
          id: defaults.__entryId,
          key: dataEntryKey(spec.entryType, payload),
          returnTab: defaults.__returnTab,
          payload,
        })
      }
      setLocalRows((current) =>
        mergeMaintenanceChecklistRows([
          ...current,
          ...activePayloads,
          ...inactivePayloads,
        ])
      )
      setChecklistTitle(str(activePayloads[0]?.checklistTitle))
      setDrafts(activePayloads.map(maintenanceChecklistDraftFromRow))
      setRemovedRows([])
      setSelectedCode(code)
      setStatus({ tone: "default", message: "Maintenance checklist saved." })
    } catch (err) {
      setStatus({
        tone: "destructive",
        message:
          err instanceof Error
            ? err.message
            : "Maintenance checklist save failed.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
      </CardHeader>
      {isSaving ? (
        <div className="px-6">
          <ProcessingNotice message="Saving maintenance checklist..." />
        </div>
      ) : null}
      <fieldset aria-busy={isSaving} className="contents" disabled={isSaving}>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_140px_140px]">
            <Field label="Checklist">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={selectedCode}
                onChange={(event) => setSelectedCode(event.target.value)}
              >
                <option value={nextMaintenanceChecklistCode(savedRows)}>
                  New Checklist ({nextMaintenanceChecklistCode(savedRows)})
                </option>
                {checklistOptions.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.code} - {row.title}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={startNewChecklist}
              >
                <Plus className="size-4" />
                New Checklist
              </Button>
            </div>
            <TileField
              label="Checklists"
              value={checklistOptions.length}
              numeric
            />
            <TileField
              label="Steps"
              value={
                drafts.filter((draft) => draft.stepDescription.trim()).length
              }
              numeric
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Field label="Checklist Code">
              <Input value={selectedCode} readOnly />
            </Field>
            <Field label="Checklist Title">
              <Input
                value={checklistTitle}
                onChange={(event) => setChecklistTitle(event.target.value)}
                required
              />
            </Field>
          </div>
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-20">Step No.</TableHead>
                  <TableHead className="min-w-80">Step Description</TableHead>
                  <TableHead className="min-w-32">Input</TableHead>
                  <TableHead className="min-w-44">Remark</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft, index) => (
                  <TableRow key={draft.draftId}>
                    <TableCell>
                      <Input
                        className="h-8 min-w-16"
                        type="number"
                        min="1"
                        value={draft.sequence || String(index + 1)}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "sequence",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-72"
                        value={draft.stepDescription}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "stepDescription",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <SearchableSelect
                        className="h-8 min-w-28 rounded-md border bg-background px-2 text-sm"
                        value={draft.inputType}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "inputType",
                            event.target.value
                          )
                        }
                      >
                        <option value="checkbox">Checkbox</option>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                      </SearchableSelect>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-40"
                        value={draft.remark}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "remark",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        aria-label="Remove Checklist Step"
                        onClick={() => removeDraft(draft)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={addDraft}>
              <Plus className="size-4" />
              Add Step
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {status ? (
                <AlertMessage tone={status.tone}>{status.message}</AlertMessage>
              ) : null}
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => void saveChecklist()}
              >
                <CheckCircle2 className="size-4" />
                {isSaving ? "Saving" : "Save Checklist"}
              </Button>
            </div>
          </div>
        </CardContent>
      </fieldset>
    </Card>
  )
}

function SetupChecklistMasterForm({
  spec,
  submitAction,
  defaults,
  rows,
}: {
  spec: DataEntrySpec
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
  defaults: Record<string, unknown>
  rows: DashboardPayload[]
}) {
  const [localRows, setLocalRows] = useState<DashboardPayload[]>([])
  const [removedRows, setRemovedRows] = useState<DashboardPayload[]>([])
  const [status, setStatus] = useState<ActionStatus>(null)
  const [isSaving, setIsSaving] = useState(false)
  const savedRows = useMemo(
    () => mergeSetupChecklistRows([...rows, ...localRows]),
    [localRows, rows]
  )
  const checklistOptions = useMemo(
    () => setupChecklistOptions(savedRows),
    [savedRows]
  )
  const defaultCode =
    displayValue(defaults.checklistCode) !== "-"
      ? displayValue(defaults.checklistCode)
      : nextSetupChecklistCode(savedRows)
  const [selectedCode, setSelectedCode] = useState(defaultCode)
  const selectedRows = useMemo(
    () => setupChecklistRowsForCode(savedRows, selectedCode),
    [savedRows, selectedCode]
  )
  const selectedChecklist = checklistOptions.find(
    (row) => machineKey(row.code) === machineKey(selectedCode)
  )
  const [checklistTitle, setChecklistTitle] = useState(
    selectedChecklist?.title || str(defaults.checklistTitle)
  )
  const [effectiveFrom, setEffectiveFrom] = useState(
    displayValue(selectedRows[0]?.effectiveFrom ?? defaults.effectiveFrom) !==
      "-"
      ? displayValue(selectedRows[0]?.effectiveFrom ?? defaults.effectiveFrom)
      : todayIsoDate()
  )
  const [drafts, setDrafts] = useState<SetupChecklistStepDraft[]>(() =>
    selectedRows.length
      ? selectedRows.map(setupChecklistDraftFromRow)
      : [newSetupChecklistDraft(1)]
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const matchingRows = setupChecklistRowsForCode(savedRows, selectedCode)
      const option = checklistOptions.find(
        (item) => machineKey(item.code) === machineKey(selectedCode)
      )
      setChecklistTitle(option?.title || "")
      setEffectiveFrom(
        displayValue(matchingRows[0]?.effectiveFrom) !== "-"
          ? displayValue(matchingRows[0]?.effectiveFrom)
          : todayIsoDate()
      )
      setDrafts(
        matchingRows.length
          ? matchingRows.map(setupChecklistDraftFromRow)
          : [newSetupChecklistDraft(1)]
      )
      setRemovedRows([])
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [checklistOptions, savedRows, selectedCode])

  function startNewChecklist() {
    setSelectedCode(nextSetupChecklistCode(savedRows))
    setChecklistTitle("")
    setEffectiveFrom(todayIsoDate())
    setDrafts([newSetupChecklistDraft(1)])
    setRemovedRows([])
    setStatus(null)
  }

  function updateDraft(
    draftId: string,
    field: keyof SetupChecklistStepDraft,
    value: string
  ) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.draftId === draftId ? { ...draft, [field]: value } : draft
      )
    )
  }

  function removeDraft(draft: SetupChecklistStepDraft) {
    if (draft.persisted)
      setRemovedRows((current) => [
        ...current,
        setupChecklistPayload(
          draft,
          selectedCode,
          checklistTitle,
          effectiveFrom,
          "Inactive"
        ),
      ])
    setDrafts((current) =>
      current.filter((item) => item.draftId !== draft.draftId)
    )
  }

  async function saveChecklist() {
    const code = selectedCode || nextSetupChecklistCode(savedRows)
    const title = checklistTitle.trim()
    const activeDrafts = drafts.filter((draft) => draft.checkPoint.trim())
    const duplicateSequences = activeDrafts
      .map((draft, index) => str(optionalNumber(draft.sequence) ?? index + 1))
      .filter(
        (sequence, index, sequences) =>
          sequence && sequences.indexOf(sequence) !== index
      )
    if (!title) {
      setStatus({
        tone: "destructive",
        message: "Checklist title is required.",
      })
      return
    }
    if (!activeDrafts.length) {
      setStatus({
        tone: "destructive",
        message: "Add at least one checklist step.",
      })
      return
    }
    if (duplicateSequences.length) {
      setStatus({
        tone: "destructive",
        message: "Step numbers must be unique in one checklist.",
      })
      return
    }
    setIsSaving(true)
    setStatus(null)
    try {
      const activePayloads = activeDrafts.map((draft, index) =>
        normalizeUserEnteredPayload(
          setupChecklistPayload(
            { ...draft, sequence: draft.sequence || String(index + 1) },
            code,
            title,
            effectiveFrom,
            "Active"
          )
        )
      )
      const inactivePayloads = removedRows
        .filter(
          (row) =>
            !activePayloads.some(
              (payload) =>
                dataEntryKey(spec.entryType, payload) ===
                dataEntryKey(spec.entryType, row)
            )
        )
        .map((row) => normalizeUserEnteredPayload(row))
      for (const payload of [...activePayloads, ...inactivePayloads]) {
        await submitAction("data-entry", {
          entryType: spec.entryType,
          key: dataEntryKey(spec.entryType, payload),
          returnTab: "setupChecklistMasterTab",
          payload,
        })
      }
      setLocalRows((current) =>
        mergeSetupChecklistRows([
          ...current,
          ...activePayloads,
          ...inactivePayloads,
        ])
      )
      setChecklistTitle(str(activePayloads[0]?.checklistTitle))
      setDrafts(activePayloads.map(setupChecklistDraftFromRow))
      setRemovedRows([])
      setSelectedCode(code)
      setStatus({ tone: "default", message: "Setup checklist saved." })
    } catch (err) {
      setStatus({
        tone: "destructive",
        message:
          err instanceof Error ? err.message : "Setup checklist save failed.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
      </CardHeader>
      {isSaving ? (
        <div className="px-6">
          <ProcessingNotice message="Saving setup checklist..." />
        </div>
      ) : null}
      <fieldset aria-busy={isSaving} className="contents" disabled={isSaving}>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_140px_140px]">
            <Field label="Checklist">
              <SearchableSelect
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={selectedCode}
                onChange={(event) => setSelectedCode(event.target.value)}
              >
                <option value={nextSetupChecklistCode(savedRows)}>
                  New Checklist ({nextSetupChecklistCode(savedRows)})
                </option>
                {checklistOptions.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.code} - {row.title}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={startNewChecklist}
              >
                <Plus className="size-4" />
                New Checklist
              </Button>
            </div>
            <TileField
              label="Checklists"
              value={checklistOptions.length}
              numeric
            />
            <TileField
              label="Steps"
              value={drafts.filter((draft) => draft.checkPoint.trim()).length}
              numeric
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_180px]">
            <Field label="Checklist Code">
              <Input value={selectedCode} readOnly />
            </Field>
            <Field label="Checklist Title">
              <Input
                value={checklistTitle}
                onChange={(event) => setChecklistTitle(event.target.value)}
                required
              />
            </Field>
            <Field label="Effective From">
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </Field>
          </div>
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-20">Step</TableHead>
                  <TableHead className="min-w-72">Check Point</TableHead>
                  <TableHead className="min-w-32">Input</TableHead>
                  <TableHead className="min-w-28">Required</TableHead>
                  <TableHead className="min-w-52">Section</TableHead>
                  <TableHead className="min-w-44">Remark</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft, index) => (
                  <TableRow key={draft.draftId}>
                    <TableCell>
                      <Input
                        className="h-8 min-w-16"
                        type="number"
                        min="1"
                        value={draft.sequence || String(index + 1)}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "sequence",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-64"
                        value={draft.checkPoint}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "checkPoint",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <SearchableSelect
                        className="h-8 min-w-28 rounded-md border bg-background px-2 text-sm"
                        value={draft.inputType}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "inputType",
                            event.target.value
                          )
                        }
                      >
                        <option value="checkbox">Checkbox</option>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                      </SearchableSelect>
                    </TableCell>
                    <TableCell>
                      <SearchableSelect
                        className="h-8 min-w-24 rounded-md border bg-background px-2 text-sm"
                        value={draft.required}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "required",
                            event.target.value
                          )
                        }
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </SearchableSelect>
                    </TableCell>
                    <TableCell>
                      <SearchableSelect
                        className="h-8 min-w-48 rounded-md border bg-background px-2 text-sm"
                        value={draft.section}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "section",
                            event.target.value
                          )
                        }
                      >
                        <option value="Pre setting">Pre Setting</option>
                        <option value="Setting">Setting</option>
                        {draft.section === "Pre setting / setting" ? (
                          <option value="Pre setting / setting">
                            Both Phases (Legacy)
                          </option>
                        ) : null}
                      </SearchableSelect>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-40"
                        value={draft.remark}
                        onChange={(event) =>
                          updateDraft(
                            draft.draftId,
                            "remark",
                            event.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        aria-label="Remove Setup Checklist Step"
                        onClick={() => removeDraft(draft)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDrafts((current) => [
                  ...current,
                  newSetupChecklistDraft(current.length + 1),
                ])
              }
            >
              <Plus className="size-4" />
              Add Step
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {status ? (
                <AlertMessage tone={status.tone}>{status.message}</AlertMessage>
              ) : null}
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => void saveChecklist()}
              >
                <CheckCircle2 className="size-4" />
                {isSaving ? "Saving" : "Save Checklist"}
              </Button>
            </div>
          </div>
        </CardContent>
      </fieldset>
    </Card>
  )
}
function PlanningControlPanel({
  payload,
  productionControl,
  submitAction,
}: {
  payload: DashboardPayload
  productionControl: DashboardPayload
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const toolFixtureNumbers = asRecord(payload.toolFixtureNumbers)

  return (
    <section className="grid gap-4">
      <PlannerWorkflowExceptionPanel
        rows={asArray(productionControl.workflowExceptionRows)}
        submitAction={submitAction}
      />
      <ToolFixturePanel rows={asArray(toolFixtureNumbers.rows)} />
    </section>
  )
}

function PlannerWorkflowExceptionPanel({
  rows,
  submitAction,
}: {
  rows: DashboardPayload[]
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
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
      worker:
        displayValue(row.shopFloorWorker) !== "-"
          ? displayValue(row.shopFloorWorker)
          : "",
      remark: "Resolved from raw production entry.",
      completedAt: new Date().toISOString(),
    }
    await submitAction("data-entry", {
      entryType: "shop_floor_status",
      key: dataEntryKey("shop_floor_status", payload),
      payload,
    })
  }

  return (
    <Card className={rows.length ? "border-amber-300/80" : ""}>
      <CardHeader>
        <CardTitle>Workflow Exceptions</CardTitle>
        <CardDescription>
          Raw Production Exists, But The Machinist Task Workflow Has Not
          Recorded Operator Assignment And Machine Start.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead>Item Setup</TableHead>
                  <TableHead>Raw Production</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${shopFloorPlanKey(row)}-${index}`}>
                    <TableCell className="font-medium">
                      {displayValue(row.machine)}
                    </TableCell>
                    <TableCell>
                      <ShopFloorItemSummary row={row} tone="next" />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatNumber(numValue(row, "rawRows"))} Row
                        {numValue(row, "rawRows") === 1 ? "" : "s"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Output {displayValue(row.rawOutputQty, true)} / Actual{" "}
                        {displayValue(row.rawActualQty, true)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void resolveWorkflow(row)}
                      >
                        <CheckCircle2 className="size-4" />
                        Resolve Workflow
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRowsMessage>No Workflow Exceptions Found</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  )
}

function CorrectionsPanel({
  rows,
  submitAction,
}: {
  rows: DashboardPayload[]
  submitAction: (path: string, body: Record<string, unknown>) => Promise<void>
}) {
  const [tableFilter, setTableFilter] = useState("")
  const [entryTypeFilter, setEntryTypeFilter] = useState("")
  const [productionUnitFilter, setProductionUnitFilter] = useState("")
  const [query, setQuery] = useState("")
  const [correctedBy, setCorrectedBy] = useState("Planner")
  const [reasonById, setReasonById] = useState<Record<string, string>>({})
  const tableOptions = useMemo(
    () =>
      uniqueValues(
        rows
          .map((row) => displayValue(row.targetTable))
          .filter((value) => value !== "-")
      ),
    [rows]
  )
  const entryTypeOptions = useMemo(
    () =>
      uniqueValues(
        rows
          .map((row) => displayValue(row.entryType))
          .filter((value) => value !== "-")
      ),
    [rows]
  )
  const productionUnitOptions = useMemo(
    () => uniqueValues(rows.map(correctionProductionUnitLabel)),
    [rows]
  )
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          typedFilterMatches(displayValue(row.targetTable), tableFilter) &&
          typedFilterMatches(displayValue(row.entryType), entryTypeFilter) &&
          typedFilterMatches(
            correctionProductionUnitLabel(row),
            productionUnitFilter
          ) &&
          correctionRowMatchesQuery(row, query)
      ),
    [entryTypeFilter, productionUnitFilter, query, rows, tableFilter]
  )

  async function reverseRow(row: DashboardPayload) {
    const targetId = displayValue(row.targetId)
    const reason = str(reasonById[targetId])
    await submitAction("reverse-entry", {
      targetTable: displayValue(row.targetTable),
      targetId,
      targetKey:
        displayValue(row.targetKey) !== "-" ? displayValue(row.targetKey) : "",
      targetLabel:
        displayValue(row.targetLabel) !== "-"
          ? displayValue(row.targetLabel)
          : "",
      reason,
      correctedBy,
    })
    setReasonById((current) => ({ ...current, [targetId]: "" }))
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Corrections</CardTitle>
        <CardDescription>
          Review Every Production Unit In One Place. Reverse Wrong Entries
          Without Deleting History; Reversed Entries Stop Affecting Live Status
          And Task Queues.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <TrackingSummary
          tones={["brand", "info", "accent", "neutral"]}
          items={[
            ["Active entries", formatNumber(filteredRows.length)],
            ["Production units", formatNumber(productionUnitOptions.length)],
            ["Modules", formatNumber(tableOptions.length)],
            ["Entry types", formatNumber(entryTypeOptions.length)],
          ]}
        />
        <div className="grid gap-3 @4xl/main:grid-cols-[minmax(0,1fr)_180px_180px_200px_220px]">
          <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
            <span>Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                placeholder="Search Entry, Machine, Job Card, Setup, Remark..."
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </Label>
          <FilterSelect
            label="Production Unit"
            value={productionUnitFilter}
            onChange={setProductionUnitFilter}
            options={[
              ["", "All production units"],
              ...productionUnitOptions.map(
                (value) => [value, value] as [string, string]
              ),
            ]}
          />
          <FilterSelect
            label="Module"
            value={tableFilter}
            onChange={setTableFilter}
            options={[
              ["", "All modules"],
              ...tableOptions.map(
                (value) => [value, value] as [string, string]
              ),
            ]}
          />
          <FilterSelect
            label="Entry Type"
            value={entryTypeFilter}
            onChange={setEntryTypeFilter}
            options={[
              ["", "All entry types"],
              ...entryTypeOptions.map(
                (value) => [value, value] as [string, string]
              ),
            ]}
          />
          <Field label="Corrected By">
            <Input
              value={correctedBy}
              placeholder="Planner/Admin Name"
              onChange={(event) => setCorrectedBy(event.target.value)}
            />
          </Field>
        </div>
        {filteredRows.length ? (
          <div className="max-h-[72vh] overflow-auto rounded-lg border">
            <Table containerClassName="max-h-none overflow-visible">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="min-w-40">Production Unit</TableHead>
                  <TableHead className="min-w-44">Module</TableHead>
                  <TableHead className="min-w-80">Entry</TableHead>
                  <TableHead className="min-w-44">Created</TableHead>
                  <TableHead className="min-w-80">Reason</TableHead>
                  <TableHead className="min-w-36">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const targetId = displayValue(row.targetId)
                  const reason = reasonById[targetId] ?? ""
                  return (
                    <TableRow
                      key={`${displayValue(row.targetTable)}-${targetId}`}
                    >
                      <TableCell>
                        {correctionProductionUnitLabel(row)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {displayValue(row.targetTable)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {displayValue(row.entryType)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {displayValue(row.targetLabel)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {displayValue(row.targetKey)}
                        </div>
                      </TableCell>
                      <TableCell>{displayValue(row.createdAt)}</TableCell>
                      <TableCell>
                        <Input
                          value={reason}
                          placeholder="Mandatory Correction Reason"
                          onChange={(event) =>
                            setReasonById((current) => ({
                              ...current,
                              [targetId]: event.target.value,
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void reverseRow(row)}
                          disabled={!str(reason)}
                        >
                          <Undo2 className="size-4" />
                          Reverse
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyRowsMessage>
            No Active Entries Match The Current Filters
          </EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  )
}

function correctionProductionUnitLabel(row: DashboardPayload) {
  const floorCode = str(row.productionFloorCode)
  return (
    productionFloors.find((floor) => floor.code === floorCode)?.shortLabel ??
    "Unassigned"
  )
}

function ToolFixturePanel({ rows }: { rows: DashboardPayload[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next Tool / Fixture Number</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <section className="grid gap-3 sm:grid-cols-2 @5xl/main:grid-cols-5">
          {rows.map((row) => (
            <MetricCard
              description={`${str(row.recommendationType || "Next Number")} | ${formatNumber(numValue(row, "usedCount"))} Used`}
              key={str(row.category)}
              label={str(row.category)}
              value={str(row.recommendedNumber || row.nextNew)}
            />
          ))}
        </section>
      </CardContent>
    </Card>
  )
}

type LegacyField = {
  name: string
  label: string
  placeholder?: string
  type?: "text" | "date" | "number" | "time"
  options?: string[]
  defaultValue?: string
  required?: boolean
  min?: string
  step?: string
  readOnly?: boolean
}

function LegacyActionForm({
  title,
  fields,
  defaults = {},
  buttonLabel,
  onSubmit,
}: {
  title: string
  fields: LegacyField[]
  defaults?: Record<string, unknown>
  buttonLabel: string
  onSubmit: (body: Record<string, unknown>) => void | Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    const form = event.currentTarget
    setIsSubmitting(true)
    try {
      await onSubmit(formPayload(new FormData(form), fields))
      form.reset()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      aria-busy={isSubmitting}
      className="grid gap-3 rounded-xl border bg-background p-3"
      onSubmit={(event) => void submit(event)}
    >
      <fieldset className="contents" disabled={isSubmitting}>
        <div>
          <div className="text-sm font-medium">{title}</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 @5xl/main:grid-cols-3">
          {fields.map((field) => (
            <Field key={field.name} label={field.label}>
              {field.options ? (
                <SearchableSelect
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  name={field.name}
                  defaultValue={
                    str(defaults[field.name]) ||
                    field.defaultValue ||
                    field.options[0]
                  }
                  required={field.required}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {field.name === "productionFloorCode"
                        ? (productionFloors.find(
                            (floor) => floor.code === option
                          )?.label ?? option)
                        : option
                          ? option.replaceAll("_", " ")
                          : ["setupName", "machineFamily"].includes(field.name)
                            ? `Select ${field.label}`
                            : ["fixture", "tooling", "foamTool"].includes(
                                  field.name
                                )
                              ? "Select Store Asset Code"
                              : "Normal"}
                    </option>
                  ))}
                </SearchableSelect>
              ) : (
                <Input
                  name={field.name}
                  type={field.type ?? "text"}
                  placeholder={field.placeholder}
                  required={field.required}
                  min={field.min}
                  step={field.step}
                  readOnly={field.readOnly}
                  defaultValue={str(defaults[field.name])}
                />
              )}
            </Field>
          ))}
        </div>
        <Button className="w-fit" type="submit" disabled={isSubmitting}>
          <Wrench className="size-4" />
          {isSubmitting ? "Processing..." : buttonLabel}
        </Button>
      </fieldset>
    </form>
  )
}

function ActionLogTable({ rows }: { rows: DashboardPayload[] }) {
  return (
    <DataRowsCard
      title="Planner Action Log"
      rows={plannerActionHistoryRows(rows)}
      empty="No planner actions saved yet"
    />
  )
}

function JobCardTileBoard({
  rows,
  plannedRows,
  machineRows,
  actionNeededCount,
  openMasterReadiness,
}: {
  rows: DashboardPayload[]
  plannedRows: DashboardPayload[]
  machineRows: DashboardPayload[]
  actionNeededCount: number
  openMasterReadiness: () => void
}) {
  const [query, setQuery] = useState("")
  const [searchField, setSearchField] = useState("all")
  const [trackingState, setTrackingState] = useState("all")
  const [rmStatusFilter, setRmStatusFilter] = useState("all")
  const [productionStatusFilter, setProductionStatusFilter] = useState("all")
  const [jobCardFilter, setJobCardFilter] = useState("")
  const [itemCodeFilter, setItemCodeFilter] = useState("")
  const [machineFilter, setMachineFilter] = useState("")
  const plannedByJobCard = useMemo(
    () => groupPlannedRowsByJobCard(plannedRows),
    [plannedRows]
  )
  const plannedByPart = useMemo(
    () => groupPlannedRowsByPart(plannedRows),
    [plannedRows]
  )
  const jobCardOptions = useMemo(
    () => uniqueValues(rows.map(jobCardNumber).filter(Boolean)),
    [rows]
  )
  const itemCodeOptions = useMemo(
    () => uniqueValues(rows.map(itemCode).filter(Boolean)),
    [rows]
  )
  const machineOptions = useMemo(
    () =>
      plannedMachineOptions(
        plannedRows,
        machineBoardRows(machineRows, plannedRows)
      ),
    [machineRows, plannedRows]
  )
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const setupRows = plannedRowsForJobCard(
          row,
          plannedByJobCard,
          plannedByPart
        )
        const hasProduction = jobCardHasProduction(row, setupRows)
        return (
          rowMatchesFieldQuery(row, query, searchField, setupRows) &&
          typedFilterMatches(jobCardNumber(row), jobCardFilter) &&
          typedFilterMatches(itemCode(row), itemCodeFilter) &&
          jobCardMatchesMachine(
            row,
            machineFilter,
            plannedByJobCard,
            plannedByPart
          ) &&
          (trackingState === "all" ||
            jobCardTrackingState(row, setupRows) === trackingState) &&
          (rmStatusFilter === "all" ||
            (rmStatusFilter === "received"
              ? displayValue(row.rmStatus) === "Received"
              : displayValue(row.rmStatus) !== "Received")) &&
          (productionStatusFilter === "all" ||
            (productionStatusFilter === "in-production"
              ? hasProduction
              : !hasProduction))
        )
      }),
    [
      itemCodeFilter,
      jobCardFilter,
      machineFilter,
      plannedByJobCard,
      plannedByPart,
      productionStatusFilter,
      query,
      rmStatusFilter,
      rows,
      searchField,
      trackingState,
    ]
  )
  const needsAction = actionNeededCount
  const pendingRm = rows.filter(
    (row) => displayValue(row.rmStatus) !== "Received"
  ).length
  const ready = rows.filter(
    (row) =>
      jobCardTrackingState(
        row,
        plannedRowsForJobCard(row, plannedByJobCard, plannedByPart)
      ) === "Ready"
  ).length
  const inProduction = rows.filter(
    (row) =>
      jobCardTrackingState(
        row,
        plannedRowsForJobCard(row, plannedByJobCard, plannedByPart)
      ) === "In production"
  ).length

  useEffect(() => {
    const linkedJobCard =
      new URLSearchParams(window.location.search).get("jcNo")?.trim() ?? ""
    if (!linkedJobCard) return
    const timeout = window.setTimeout(() => setJobCardFilter(linkedJobCard), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  function clearJobCardFilters() {
    setQuery("")
    setSearchField("all")
    setTrackingState("all")
    setRmStatusFilter("all")
    setProductionStatusFilter("all")
    setJobCardFilter("")
    setItemCodeFilter("")
    setMachineFilter("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job-Card Tiles</CardTitle>
        <CardDescription>
          {rows.length
            ? `${formatNumber(filteredRows.length)} of ${formatNumber(rows.length)} job cards shown`
            : "No Job-Card Status Rows Returned"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.length ? (
          <>
            <TrackingSummary
              tones={["warning", "success", "error", "brand", "info"]}
              items={[
                ["Pending RM", formatNumber(pendingRm)],
                ["Ready", formatNumber(ready)],
                [
                  "Action needed",
                  formatNumber(needsAction),
                  openMasterReadiness,
                ],
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
                label="Rm Status"
                value={rmStatusFilter}
                onChange={setRmStatusFilter}
                options={[
                  ["all", "All RM status"],
                  ["received", "RM received"],
                  ["waiting", "Waiting RM"],
                ]}
              />
              <FilterSelect
                label="Production Status"
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
                  label: "Job Card No.",
                  value: jobCardFilter,
                  placeholder: "Type or select job card",
                  options: jobCardOptions,
                  onChange: setJobCardFilter,
                },
                {
                  id: "item-code-filter",
                  label: "Item Code",
                  value: itemCodeFilter,
                  placeholder: "Type or select item code",
                  options: itemCodeOptions,
                  onChange: setItemCodeFilter,
                },
                {
                  id: "job-card-machine-filter",
                  label: "Machine No.",
                  value: machineFilter,
                  placeholder: "Type or select planned/running machine",
                  options: machineOptions,
                  onChange: setMachineFilter,
                },
              ]}
            />
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearJobCardFilters}
              >
                Clear Filters
              </Button>
            </div>
            {filteredRows.length ? (
              <div className="grid max-h-[42rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 @7xl/main:grid-cols-3">
                {filteredRows.map((row, index) => (
                  <JobCardTile
                    key={`${str(row.jcNo || row.JobCardNo || row.jobCard) || "job-card"}-${index}`}
                    row={row}
                    setupRows={plannedRowsForJobCard(
                      row,
                      plannedByJobCard,
                      plannedByPart
                    )}
                  />
                ))}
              </div>
            ) : (
              <EmptyRowsMessage>
                No Job Cards Match The Current Filters
              </EmptyRowsMessage>
            )}
          </>
        ) : (
          <EmptyRowsMessage>No Job-Card Status Rows Returned</EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  )
}

function JobCardTile({
  row,
  setupRows,
}: {
  row: DashboardPayload
  setupRows: DashboardPayload[]
}) {
  const jcNo = displayValue(row.jcNo || row.JobCardNo || row.jobCard)
  const partCode = displayValue(
    row.partCode || row["PART CODE"] || row.itemCode
  )
  const option = displayValue(
    row.optionNumber || row.selectedOption || row.option
  )
  const blocker = displayValue(
    row.planningBlocker || row.nextAction || row.routeStatus
  )
  const trackingState = jobCardTrackingState(row, setupRows)
  const schedule = jobCardScheduleSummary(row, setupRows)

  return (
    <article className="grid gap-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold break-words">{jcNo}</div>
          <div className="text-xs break-words text-muted-foreground">
            {partCode}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusBadge value={trackingState} />
          <StatusBadge value={row.rmStatus} />
        </div>
      </div>
      <TileField
        label="Description"
        value={row.description || row.DESCRIPTION}
      />
      <div className="grid gap-2 rounded-md border bg-muted/20 p-2 sm:grid-cols-2">
        <TileField
          label="Planned Production Start"
          value={schedule.plannedStart}
        />
        <TileField label="Planned Production End" value={schedule.plannedEnd} />
        <TileField
          label="Actual Production Start"
          value={schedule.actualStart}
        />
        <TileField label="Actual Production End" value={schedule.actualEnd} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TileField label="Fg Po" value={row.fgPoNo || row["FG PO NO."]} />
        <TileField
          label="Order Pcs"
          value={row.orderPcs || row["ORD. PCS."]}
          numeric
        />
        <TileField label="Route Option" value={option} />
        <TileField label="Option Source" value={row.optionSource} />
        <TileField label="Route" value={row.routeStatus} />
        <TileField label="Cycle" value={row.cycleStatus} />
        <TileField label="Tooling" value={row.toolingStatus} />
        <TileField
          label="Actual / Output"
          value={`${displayValue(row.rawActualQty, true)} / ${displayValue(row.rawOutputQty, true)}`}
        />
        <TileField label="Rejected" value={row.rawRejectQty} numeric />
        <TileField label="Raw Rows" value={row.rawRows} numeric />
      </div>
      {setupRows.length ? (
        <div className="grid gap-2">
          <div className="text-[11px] font-medium text-muted-foreground">
            Setup Jobs
          </div>
          <div className="grid max-h-48 gap-2 overflow-y-auto pr-1">
            {setupRows.map((setup, index) => (
              <div
                key={`${displayValue(setup.setupNo)}-${displayValue(setup.machine)}-${index}`}
                className="rounded-md border bg-muted/10 p-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    Setup {displayValue(setup.setupNo)} /{" "}
                    {displayValue(setup.machine)}
                  </div>
                  <StatusBadge value={setup.runningStatus} />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <TileField
                    label="Setup Planned Date"
                    value={setup.setupPlannedDate || setup.plannedDate}
                  />
                  <TileField
                    label="Setup Completion Date"
                    value={setup.setupCompletionDate || setup.completionDate}
                  />
                  <TileField
                    label="Plan Vs Actual"
                    value={setup.planVsActual}
                  />
                  <TileField
                    label="Planned Production Start"
                    value={setup.plannedProductionStartDate}
                  />
                  <TileField
                    label="Planned Production End"
                    value={setup.plannedProductionEndDate}
                  />
                  <TileField
                    label="Actual Production Start"
                    value={setup.actualProductionStartDate}
                  />
                  <TileField
                    label="Actual Production End"
                    value={setup.actualProductionEndDate}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <TileField label="Planning Action" value={blocker} important />
    </article>
  )
}

function MachinePlanningBoard({
  rows,
  plannedRows,
}: {
  rows: DashboardPayload[]
  plannedRows: DashboardPayload[]
}) {
  const [query, setQuery] = useState("")
  const [searchField, setSearchField] = useState("all")
  const boardRows = useMemo(
    () => machineBoardRows(rows, plannedRows),
    [plannedRows, rows]
  )
  const machineTypes = useMemo(
    () =>
      uniqueValues(
        boardRows
          .map((row) => machineValue(row, "machineType"))
          .filter((value) => value !== "-")
      ),
    [boardRows]
  )
  const [machineType, setMachineType] = useState("all")
  const [machineFilter, setMachineFilter] = useState("")
  const [jobCardFilter, setJobCardFilter] = useState("")
  const [itemCodeFilter, setItemCodeFilter] = useState("")
  const [runningFilter, setRunningFilter] = useState("all")
  const [selectedMachine, setSelectedMachine] = useState("")
  const plannedByMachine = useMemo(
    () => groupPlannedRowsByMachine(plannedRows),
    [plannedRows]
  )
  const jobCardOptions = useMemo(
    () =>
      uniqueValues(
        plannedRows.map(jobCardNumber).filter((value) => value !== "-")
      ),
    [plannedRows]
  )
  const itemCodeOptions = useMemo(
    () =>
      uniqueValues(plannedRows.map(itemCode).filter((value) => value !== "-")),
    [plannedRows]
  )
  const machineOptions = useMemo(
    () => plannedMachineOptions(plannedRows, boardRows),
    [boardRows, plannedRows]
  )
  const filteredRows = useMemo(
    () =>
      boardRows.filter((row) => {
        const machine = machineValue(row, "machine")
        const isRunning = machineIsRunning(machine, plannedByMachine)
        return (
          rowMatchesMachineQuery(row, query, searchField, plannedByMachine) &&
          typedFilterMatches(machine, machineFilter) &&
          machineMatchesJobCard(machine, jobCardFilter, plannedByMachine) &&
          machineMatchesItemCode(machine, itemCodeFilter, plannedByMachine) &&
          (machineType === "all" ||
            machineValue(row, "machineType") === machineType) &&
          (runningFilter === "all" ||
            (runningFilter === "running" ? isRunning : !isRunning))
        )
      }),
    [
      boardRows,
      itemCodeFilter,
      jobCardFilter,
      machineFilter,
      machineType,
      plannedByMachine,
      query,
      runningFilter,
      searchField,
    ]
  )
  const runningRows = boardRows.filter((row) =>
    machineIsRunning(machineValue(row, "machine"), plannedByMachine)
  ).length
  const selectedPlans = selectedMachine
    ? (plannedByMachine.get(machineKey(selectedMachine)) ?? [])
    : []

  function clearMachineFilters() {
    setQuery("")
    setSearchField("all")
    setMachineType("all")
    setMachineFilter("")
    setJobCardFilter("")
    setItemCodeFilter("")
    setRunningFilter("all")
    setSelectedMachine("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Machine Planning Board</CardTitle>
        <CardDescription>
          {boardRows.length
            ? `${formatNumber(filteredRows.length)} of ${formatNumber(boardRows.length)} machines shown`
            : "No Machine Planning Board Rows Returned"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {boardRows.length ? (
          <>
            <TrackingSummary
              tones={["info", "success", "brand", "accent"]}
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
              options={[
                ["all", "All machine types"],
                ...machineTypes.map(
                  (value) => [value, value] as [string, string]
                ),
              ]}
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
                  label: "Machine No.",
                  value: machineFilter,
                  placeholder: "Type or select planned/running machine",
                  options: machineOptions,
                  onChange: setMachineFilter,
                },
                {
                  id: "machine-job-card-filter",
                  label: "Job Card No.",
                  value: jobCardFilter,
                  placeholder: "Type or select job card",
                  options: jobCardOptions,
                  onChange: setJobCardFilter,
                },
                {
                  id: "machine-item-code-filter",
                  label: "Item Code",
                  value: itemCodeFilter,
                  placeholder: "Type or select item code",
                  options: itemCodeOptions,
                  onChange: setItemCodeFilter,
                },
              ]}
            />
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearMachineFilters}
              >
                Clear Filters
              </Button>
            </div>
            {filteredRows.length ? (
              <div className="grid max-h-[42rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-4">
                {filteredRows.map((row, index) => (
                  <MachinePlanningTile
                    key={`${machineValue(row, "machine")}-${index}`}
                    row={row}
                    plannedRows={
                      plannedByMachine.get(
                        machineKey(machineValue(row, "machine"))
                      ) ?? []
                    }
                    isRunning={machineIsRunning(
                      machineValue(row, "machine"),
                      plannedByMachine
                    )}
                    selected={
                      machineKey(selectedMachine) ===
                      machineKey(machineValue(row, "machine"))
                    }
                    onSelect={() =>
                      setSelectedMachine(machineValue(row, "machine"))
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyRowsMessage>
                No Machines Match The Current Filters
              </EmptyRowsMessage>
            )}
            <MachinePlannedPartsPanel
              machine={selectedMachine}
              rows={selectedPlans}
            />
          </>
        ) : (
          <EmptyRowsMessage>
            No Machine Planning Board Rows Returned
          </EmptyRowsMessage>
        )}
      </CardContent>
    </Card>
  )
}

function MachinePlanningTile({
  row,
  plannedRows,
  isRunning,
  selected,
  onSelect,
}: {
  row: DashboardPayload
  plannedRows: DashboardPayload[]
  isRunning: boolean
  selected: boolean
  onSelect: () => void
}) {
  const machine = machineValue(row, "machine")
  const machineType = machineValue(row, "machineType")
  const status = machineMasterStatusText(row)
  const plannedCount = plannedRows.length
  const planningStatus = machinePlanningStatus(plannedRows)
  const currentSetup = currentShopFloorItem(plannedRows)
  const nextSetup = nextShopFloorItem(plannedRows, currentSetup)
  const focusSetup =
    currentSetup ?? nextSetup ?? machineTileFocusSetup(plannedRows)
  const focusIsCurrent = Boolean(
    currentSetup &&
    focusSetup &&
    shopFloorPlanKey(focusSetup) === shopFloorPlanKey(currentSetup)
  )

  return (
    <button
      type="button"
      className={`grid gap-2 rounded-md border bg-background p-2 text-left transition hover:border-primary/60 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 ${selected ? "border-primary bg-muted/40" : ""}`}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold break-words">{machine}</div>
          <div className="text-xs break-words text-muted-foreground">
            {machineType}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <MachineStateBadge
            label="Run"
            value={isRunning ? "Running" : "Not running"}
            tone={isRunning ? "success" : "neutral"}
          />
          <MachineStateBadge
            label="Plan"
            value={planningStatus}
            tone={machinePlanningTone(planningStatus)}
          />
          <MachineStateBadge
            label="Master"
            value={status}
            tone={
              status === "Active"
                ? "success"
                : status === "Inactive"
                  ? "danger"
                  : "warning"
            }
          />
        </div>
      </div>
      <div className="grid gap-x-2 gap-y-1.5 sm:grid-cols-2">
        <TileField
          label="Location"
          value={row.location || row.LOCATION || row.Location}
        />
        <TileField
          label="Operator"
          value={row.operator || row.operatorName || row["OPERATOR NAME"]}
        />
        <TileField label="Planned Setups" value={plannedCount} numeric />
        <TileField label="Priority" value={row.priority || row.PRIORITY} />
        <TileField
          label={focusIsCurrent ? "Current Job Card" : "Next Job Card"}
          value={focusSetup?.jcNo || row.jcNo || row.jobCard || row.JobCardNo}
        />
        <TileField
          label={focusIsCurrent ? "Current Part" : "Next Part To Setup"}
          value={
            focusSetup?.partCode ||
            row.partCode ||
            row["PART CODE"] ||
            row.itemCode
          }
        />
        <TileField
          label="Setup"
          value={
            focusSetup
              ? `${displayValue(focusSetup.setupNo)} / Option ${displayValue(focusSetup.optionNumber)}`
              : "-"
          }
        />
        <TileField
          label={
            focusIsCurrent ? "Setup Completion Date" : "Setup Planned Date"
          }
          value={
            focusIsCurrent
              ? focusSetup?.setupCompletionDate || focusSetup?.completionDate
              : focusSetup?.setupPlannedDate || focusSetup?.plannedDate
          }
        />
        <TileField
          label="Remarks"
          value={row.remark || row.remarks || row.REMARKS}
          important
        />
      </div>
    </button>
  )
}

function MachinePlannedPartsPanel({
  machine,
  rows,
}: {
  machine: string
  rows: DashboardPayload[]
}) {
  return (
    <section className="grid gap-3 rounded-lg border bg-muted/20 p-3">
      <div>
        <div className="text-sm font-semibold">
          {machine
            ? `Planned parts on ${machine}`
            : "Select A Machine To See Planned Parts"}
        </div>
        <div className="text-xs text-muted-foreground">
          {machine
            ? `${formatNumber(rows.length)} planned setup rows`
            : "Click Any Machine Tile Above To Open Its Route-Level Part Plan."}
        </div>
      </div>
      {machine ? (
        rows.length ? (
          <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <article
                key={`${displayValue(row.jcNo)}-${displayValue(row.setupNo)}-${index}`}
                className="grid gap-2 rounded-lg border bg-background p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold break-words">
                      {displayValue(row.partCode)}
                    </div>
                    <div className="text-xs break-words text-muted-foreground">
                      {displayValue(row.description)}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <StatusBadge value={row.runningStatus} />
                    <StatusBadge value={row.rmStatus} />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 @6xl/main:grid-cols-4">
                  <TileField label="Job Card" value={row.jcNo} />
                  <TileField label="Fg Po" value={row.fgPoNo} />
                  <TileField label="Option" value={row.optionNumber} />
                  <TileField
                    label="Setup"
                    value={`${displayValue(row.setupNo)} ${displayValue(row.setupName) !== "-" ? displayValue(row.setupName) : ""}`}
                  />
                  <TileField label="Order Pcs" value={row.orderPcs} numeric />
                  <TileField
                    label="Actual / Output"
                    value={`${displayValue(row.rawActualQty, true)} / ${displayValue(row.rawOutputQty, true)}`}
                  />
                  <TileField
                    label="Setup Planned Date"
                    value={row.setupPlannedDate || row.plannedDate}
                  />
                  <TileField
                    label="Setup Completion Date"
                    value={row.setupCompletionDate || row.completionDate}
                  />
                  <TileField
                    label="Planned Production Start"
                    value={row.plannedProductionStartDate}
                  />
                  <TileField
                    label="Planned Production End"
                    value={row.plannedProductionEndDate}
                  />
                  <TileField
                    label="Actual Production Start"
                    value={row.actualProductionStartDate}
                  />
                  <TileField
                    label="Actual Production End"
                    value={row.actualProductionEndDate}
                  />
                  <TileField label="Plan Vs Actual" value={row.planVsActual} />
                  <TileField label="Cycle" value={row.cycleStatus} />
                  <TileField label="Tooling" value={row.toolingStatus} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyRowsMessage>
            No Planned Parts Found For This Machine
          </EmptyRowsMessage>
        )
      ) : null}
    </section>
  )
}

function TrackingSummary({
  items,
  tones,
}: {
  items: Array<[string, string, (() => void)?]>
  tones?: MetricCardTone[]
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 @4xl/main:grid-cols-5">
      {items.map(([label, value, onClick], index) => (
        <MetricCard
          key={label}
          label={label}
          onClick={onClick}
          tone={tones?.[index]}
          value={value}
        />
      ))}
    </div>
  )
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
  query: string
  queryPlaceholder: string
  onQueryChange: (value: string) => void
  searchFieldLabel: string
  searchFieldValue: string
  onSearchFieldChange: (value: string) => void
  searchFieldOptions: Array<[string, string]>
  selectLabel: string
  selectValue: string
  onSelectChange: (value: string) => void
  options: Array<[string, string]>
  secondarySelectLabel?: string
  secondarySelectValue?: string
  onSecondarySelectChange?: (value: string) => void
  secondaryOptions?: Array<[string, string]>
}) {
  return (
    <div className="grid gap-3 @4xl/main:grid-cols-[minmax(0,1fr)_180px_220px_180px]">
      <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
        <span>Search</span>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            placeholder={queryPlaceholder}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </Label>
      <FilterSelect
        label={searchFieldLabel}
        value={searchFieldValue}
        onChange={onSearchFieldChange}
        options={searchFieldOptions}
      />
      <FilterSelect
        label={selectLabel}
        value={selectValue}
        onChange={onSelectChange}
        options={options}
      />
      {secondarySelectLabel &&
      secondarySelectValue &&
      onSecondarySelectChange &&
      secondaryOptions ? (
        <FilterSelect
          label={secondarySelectLabel}
          value={secondarySelectValue}
          onChange={onSecondarySelectChange}
          options={secondaryOptions}
        />
      ) : null}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <SearchableSelect
        className="h-9 rounded-3xl border border-input bg-background px-3 text-sm shadow-xs transition-colors outline-none hover:border-primary/45 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 dark:bg-input/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SearchableSelect>
    </Label>
  )
}

function ExcelStyleFilters({
  filters,
}: {
  filters: Array<{
    id: string
    label: string
    value: string
    placeholder: string
    options: string[]
    onChange: (value: string) => void
  }>
}) {
  return (
    <div className="grid gap-3 @4xl/main:grid-cols-3">
      {filters.map((filter) => (
        <Label
          key={filter.id}
          className="grid gap-1 text-xs font-medium text-muted-foreground"
        >
          <span>{filter.label}</span>
          <SearchableSelect
            className="h-9 rounded-3xl border border-input bg-background px-3 text-sm shadow-xs transition-colors outline-none hover:border-primary/45 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 dark:bg-input/20"
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
          >
            <option value="">All {filter.label.toLowerCase()}</option>
            {filter.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SearchableSelect>
        </Label>
      ))}
    </div>
  )
}

function TileField({
  label,
  value,
  numeric,
  important,
}: {
  label: string
  value: unknown
  numeric?: boolean
  important?: boolean
}) {
  const text = displayValue(value, numeric)
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        className={
          important ? "text-sm font-medium break-words" : "text-sm break-words"
        }
      >
        {text}
      </div>
    </div>
  )
}

function StatusBadge({ value }: { value: unknown }) {
  const text = displayValue(value)
  const normalized = text.toLowerCase()
  const toneClass = statusBadgeToneClass(normalized)

  return (
    <Badge variant="outline" className={toneClass}>
      {text}
    </Badge>
  )
}

function statusBadgeToneClass(normalized: string) {
  if (normalized === "-") return "border-slate-300 bg-slate-50 text-slate-700"
  if (normalized.includes("in production") || normalized.includes("running"))
    return "border-sky-300 bg-sky-50 text-sky-800"
  if (normalized === "ok")
    return "border-emerald-300 bg-emerald-50 text-emerald-800"
  if (
    normalized.includes("ready") ||
    normalized.includes("received") ||
    normalized.includes("dispatch") ||
    normalized.includes("setup complete") ||
    normalized.includes("on time")
  )
    return "border-emerald-300 bg-emerald-50 text-emerald-800"
  if (normalized.includes("early"))
    return "border-sky-300 bg-sky-50 text-sky-800"
  if (normalized === "not ok" || normalized === "ng")
    return "border-red-300 bg-red-50 text-red-800"
  if (
    normalized.includes("waiting") ||
    normalized.includes("pending") ||
    normalized.includes("shifted")
  )
    return "border-amber-300 bg-amber-50 text-amber-800"
  if (
    normalized.includes("delayed") ||
    normalized.includes("need") ||
    normalized.includes("action") ||
    normalized.includes("missing") ||
    normalized.includes("required") ||
    normalized.includes("breakdown")
  ) {
    return "border-red-300 bg-red-50 text-red-800"
  }
  return "border-slate-300 bg-slate-50 text-slate-700"
}

function MachineStateBadge({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "success" | "planning" | "warning" | "danger" | "neutral"
}) {
  const toneClass = {
    success: "border-emerald-300 bg-emerald-50 text-emerald-800",
    planning: "border-sky-300 bg-sky-50 text-sky-800",
    warning: "border-amber-300 bg-amber-50 text-amber-800",
    danger: "border-red-300 bg-red-50 text-red-800",
    neutral: "border-slate-300 bg-slate-50 text-slate-700",
  }[tone]
  return (
    <Badge variant="outline" className={`gap-1 ${toneClass}`}>
      <span className="text-[10px] font-semibold opacity-75">{label}</span>
      <span>{value}</span>
    </Badge>
  )
}

function EmptyRowsMessage({ children }: { children: ReactNode }) {
  return (
    <Empty className="h-28 flex-none p-4 text-sm text-muted-foreground">
      {children}
    </Empty>
  )
}

function DataRowsCard({
  title,
  rows,
  empty,
}: {
  title: string
  rows: DashboardPayload[]
  empty: string
}) {
  const columns = tableColumns(rows)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {rows.length
            ? `${formatNumber(rows.length)} ${rows.length === 1 ? "row" : "rows"}`
            : empty}
        </CardDescription>
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
                      <TableCell
                        key={column}
                        className="max-w-[18rem] truncate"
                      >
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
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="grid gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </Label>
  )
}

async function postDashboardApi(
  path: string,
  body: Record<string, unknown>
): Promise<DashboardApiResult> {
  const bodyPayload = asRecord(body.payload)
  const productionFloorCode = normalizeProductionFloorCode(
    body.productionFloorCode ??
      bodyPayload.productionFloorCode ??
      productionFloorFromLocation()
  )
  const scopedBody = {
    ...body,
    productionFloorCode,
    ...(Object.keys(bodyPayload).length
      ? { payload: { ...bodyPayload, productionFloorCode } }
      : {}),
  }
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scopedBody),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    throw new Error(
      str(payload.error) || `Request failed with status ${response.status}`
    )
  }
  return {
    message: str(payload.message || payload.savedText) || "Import complete.",
    queued: payload.queued === true,
    skipped: payload.skipped === true,
  }
}

function formPayload(form: FormData, fields: LegacyField[]) {
  const payload: Record<string, unknown> = {}
  for (const field of fields) {
    const value = String(form.get(field.name) ?? "").trim()
    if (!value) continue
    payload[field.name] = field.type === "number" ? Number(value) : value
  }
  return payload
}

function text(value: unknown) {
  return str(value)
}

function optionalText(value: unknown) {
  const cleaned = text(value)
  return cleaned || undefined
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function numeric(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function routeOptionText(option: DashboardPayload, fallback: string) {
  return [
    `Option ${str(option.optionNumber) || fallback}`,
    str(option.machineUsed || option.machine || option.machineFamily),
    str(option.setupName),
    str(option.setupCount || option.numberOfSetups)
      ? `${str(option.setupCount || option.numberOfSetups)} setups`
      : "",
  ]
    .filter(Boolean)
    .join(" / ")
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read selected file"))
    reader.readAsDataURL(file)
  })
}

function DashboardSkeleton() {
  return <DashboardLoadingSkeleton />
}

function formatDate(value: Date | string) {
  return formatIstDateTime(value)
}

function asRecord(value: unknown): DashboardPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  return value as DashboardPayload
}

function asArray(value: unknown): DashboardPayload[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
    )
    .map((item) => item as DashboardPayload)
}

function str(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (value === null || value === undefined) return ""
  return String(value)
}

function displayValue(value: unknown, numeric = false) {
  const textValue = str(value)
  if (!textValue) return "-"
  if (numeric && typeof value === "number") return formatNumber(value)
  if (numeric && Number.isFinite(Number(textValue)))
    return formatNumber(Number(textValue))
  return formatCell(value)
}

function nextPlanningHolidayLabel(rows: DashboardPayload[]) {
  const today = istDateValue()
  const next = rows
    .map((row) => ({
      label: displayValue(row.date),
      value: str(row.dateValue || row.date),
    }))
    .filter((row) => row.value && row.value >= today)
    .sort((a, b) => a.value.localeCompare(b.value))[0]
  return next?.label ?? "-"
}

function planningHolidayCoverageLabel(row: DashboardPayload) {
  if (row.factoryWide === true || str(row.scope).toLowerCase() === "factory")
    return "All factory"
  const department = str(row.departmentLabel || row.department)
  const floor = productionFloors.find((item) => item.code === department)
  return floor?.shortLabel || department || "Selected production floor"
}

type MachineConstraintQueuePlacementPayload = {
  targetJcNo: string
  targetPartCode: string
  targetSetupNo: string
  targetSourceMachine: string
  targetMachine: string
  queueBeforeSetups: Array<{ jcNo: string; setupNo: string; machine: string }>
}

const machineConstraintPlacementSeparator = "::after::"

function machineConstraintMovableRows(
  rows: DashboardPayload[],
  rescheduleAction: string
) {
  if (machineKey(rescheduleAction) === "delay") return []
  return rows.filter(
    (row) =>
      machineIssueRowNeedsProducedQty(row) || !machineIssueRowIsLocked(row)
  )
}

function machineConstraintQueuePlacements(
  groups: MachineConstraintQueueReviewGroup[],
  movableRows: DashboardPayload[],
  queueAfterByRow: Record<string, string>
): MachineConstraintQueuePlacementPayload[] {
  const destinationGroups = groups.filter(
    (group) => group.kind === "destination"
  )
  const defaultDestinationMachine = destinationGroups[0]?.machine ?? ""
  if (!defaultDestinationMachine) return []
  const placements: MachineConstraintQueuePlacementPayload[] = []
  const seen = new Set<string>()
  for (const row of movableRows) {
    const rowKey = machineIssueRowKey(row)
    const placement = machineConstraintPlacementParts(
      queueAfterByRow[rowKey],
      defaultDestinationMachine
    )
    const group = destinationGroups.find(
      (candidate) => machineKey(candidate.machine) === placement.machineKey
    )
    if (!group) continue
    const placementIndex = machineConstraintQueuePlacementIndex(
      group.rows,
      placement.afterKey
    )
    const queueBeforeSetups = group.rows
      .slice(0, placementIndex)
      .map((queueRow) => ({
        jcNo: jobCardNumber(queueRow),
        setupNo: displayValue(queueRow.setupNo),
        machine: machineValue(queueRow, "machine"),
      }))
      .filter(
        (queueRow) => queueRow.jcNo && queueRow.setupNo && queueRow.machine
      )
    const payload = {
      targetJcNo: jobCardNumber(row),
      targetPartCode: itemCode(row),
      targetSetupNo: displayValue(row.setupNo),
      targetSourceMachine: machineValue(row, "machine"),
      targetMachine: group.machine,
      queueBeforeSetups,
    }
    const key = [
      payload.targetJcNo,
      payload.targetSetupNo,
      payload.targetSourceMachine,
      payload.targetMachine,
    ]
      .map(machineKey)
      .join("|")
    if (
      !payload.targetJcNo ||
      !payload.targetSetupNo ||
      !payload.targetMachine ||
      seen.has(key)
    )
      continue
    seen.add(key)
    placements.push(payload)
  }
  return placements
}

function partMachineSwitchPreSaveConflicts(
  rows: DashboardPayload[],
  proposed: {
    target: string
    selectedItem: string
    setupNo: string
    toMachine: string
    queuePlacements: MachineConstraintQueuePlacementPayload[]
    resolvedIds: Set<string>
  }
) {
  const targetKey = machineKey(proposed.target)
  const itemKey = machineKey(proposed.selectedItem)
  const setupKey = machineKey(proposed.setupNo)
  const proposedSignature = partMachineSwitchDecisionSignature(
    proposed.toMachine,
    proposed.queuePlacements
  )
  if (!targetKey || !setupKey || !proposedSignature) return []
  return rows
    .filter((row) => {
      const targetId = displayValue(row._id || row.targetId)
      if (proposed.resolvedIds.has(targetId)) return false
      const rowTargetKey = machineKey(displayValue(row.target))
      if (rowTargetKey !== targetKey && (!itemKey || rowTargetKey !== itemKey))
        return false
      const rowSetupKey = machineKey(displayValue(row.setupNo))
      if (rowSetupKey && rowSetupKey !== setupKey) return false
      const existingSignature = partMachineSwitchDecisionSignature(
        displayValue(row.toMachine),
        asArray(row.queuePlacements) as MachineConstraintQueuePlacementPayload[]
      )
      return Boolean(
        existingSignature && existingSignature !== proposedSignature
      )
    })
    .map((row) => ({
      ...row,
      targetTable: "planOverrides",
      targetId: displayValue(row._id || row.targetId),
      targetKey: [
        displayValue(row.target),
        displayValue(row.setupNo),
        displayValue(row.fromMachine),
        displayValue(row.toMachine),
      ]
        .filter((value) => value !== "-")
        .join(" / "),
      targetLabel: `Existing switch to ${displayValue(row.toMachine)}`,
      createdAt: displayValue(row.createdAt),
    }))
}

function partMachineSwitchDecisionSignature(
  toMachine: string,
  queuePlacements: MachineConstraintQueuePlacementPayload[]
) {
  const targetMachine = machineKey(toMachine)
  if (!targetMachine) return ""
  const placementSignature = queuePlacements
    .map((placement) => ({
      targetMachine: machineKey(placement.targetMachine || toMachine),
      before: asArray(placement.queueBeforeSetups)
        .map((row) =>
          [
            displayValue(row.jcNo),
            displayValue(row.setupNo),
            displayValue(row.machine),
          ]
            .map(machineKey)
            .join("/")
        )
        .sort()
        .join(","),
    }))
    .sort((left, right) =>
      `${left.targetMachine}|${left.before}`.localeCompare(
        `${right.targetMachine}|${right.before}`
      )
    )
    .map((placement) => `${placement.targetMachine}:${placement.before}`)
    .join("|")
  return `${targetMachine}|${placementSignature}`
}
function plannerPriorityPreSaveConflicts(
  rows: DashboardPayload[],
  proposed: {
    target: string
    jcNo: string
    partCode: string
    priority: string
    queueBeforeSetups: Array<{
      targetSetupNo: string
      jcNo: string
      setupNo: string
      machine: string
    }>
    resolvedIds: Set<string>
  }
) {
  const targetKeys = new Set(
    [proposed.target, proposed.jcNo, proposed.partCode]
      .map(machineKey)
      .filter(Boolean)
  )
  const proposedSignature = plannerPriorityDecisionSignature(
    proposed.priority,
    proposed.queueBeforeSetups
  )
  if (!targetKeys.size || !proposedSignature) return []
  return rows
    .filter((row) => {
      const targetId = displayValue(row._id || row.targetId)
      if (proposed.resolvedIds.has(targetId)) return false
      const rowKeys = [row.target, row.jcNo, row.partCode]
        .map((value) => machineKey(displayValue(value)))
        .filter(Boolean)
      if (!rowKeys.some((key) => targetKeys.has(key))) return false
      const existingSignature = plannerPriorityDecisionSignature(
        displayValue(row.priority),
        asArray(row.queueBeforeSetups).map((queueRow) => ({
          targetSetupNo: displayValue(queueRow.targetSetupNo),
          jcNo: displayValue(queueRow.jcNo),
          setupNo: displayValue(queueRow.setupNo),
          machine: displayValue(queueRow.machine),
        }))
      )
      return Boolean(
        existingSignature && existingSignature !== proposedSignature
      )
    })
    .map((row) => ({
      ...row,
      targetTable: "plannerPriorities",
      targetId: displayValue(row._id || row.targetId),
      targetKey: [
        displayValue(row.target),
        displayValue(row.jcNo),
        displayValue(row.partCode),
        displayValue(row.priority),
      ]
        .filter((value) => value !== "-")
        .join(" / "),
      targetLabel: `Existing priority ${displayValue(row.priority)} for ${displayValue(row.target)}`,
      createdAt: displayValue(row.createdAt),
    }))
}

function plannerPriorityDecisionSignature(
  priority: string,
  queueBeforeSetups: Array<{
    targetSetupNo: string
    jcNo: string
    setupNo: string
    machine: string
  }>
) {
  const priorityKey = machineKey(priority || "Normal")
  const queueSignature = queueBeforeSetups
    .map((row) =>
      [row.targetSetupNo, row.jcNo, row.setupNo, row.machine]
        .map(machineKey)
        .join("/")
    )
    .sort()
    .join(",")
  return `${priorityKey}|${queueSignature}`
}

function machineConstraintPreSaveConflicts(
  rows: DashboardPayload[],
  proposed: {
    machineNo: string
    unavailableFrom: string
    unavailableTo: string
    rescheduleAction: string
    planningMode: string
    queuePlacements: MachineConstraintQueuePlacementPayload[]
    resolvedIds: Set<string>
  }
) {
  const machine = machineKey(proposed.machineNo)
  const proposedSignature = machineConstraintDecisionSignature(
    proposed.rescheduleAction,
    proposed.planningMode,
    proposed.queuePlacements
  )
  if (!machine || !proposed.unavailableFrom || !proposedSignature) return []
  return rows
    .filter((row) => {
      const targetId = displayValue(row._id || row.targetId)
      if (proposed.resolvedIds.has(targetId)) return false
      if (machineKey(displayValue(row.machineNo)) !== machine) return false
      if (
        !dateRangesOverlap(
          proposed.unavailableFrom,
          proposed.unavailableTo || proposed.unavailableFrom,
          displayValue(row.unavailableFrom),
          displayValue(row.unavailableTo || row.unavailableFrom)
        )
      )
        return false
      const existingSignature = machineConstraintDecisionSignature(
        displayValue(row.rescheduleAction),
        displayValue(row.planningMode),
        asArray(row.queuePlacements) as MachineConstraintQueuePlacementPayload[]
      )
      return Boolean(
        existingSignature && existingSignature !== proposedSignature
      )
    })
    .map((row) => ({
      ...row,
      targetTable: "machineConstraints",
      targetId: displayValue(row._id || row.targetId),
      targetKey: [
        displayValue(row.machineNo),
        displayValue(row.unavailableFrom),
        displayValue(row.unavailableTo),
        displayValue(row.rescheduleAction),
      ]
        .filter((value) => value !== "-")
        .join(" / "),
      targetLabel: `Existing ${displayValue(row.rescheduleAction || "machine action")} on ${displayValue(row.machineNo)}`,
      createdAt: displayValue(row.createdAt),
    }))
}

function machineConstraintDecisionSignature(
  rescheduleAction: string,
  planningMode: string,
  queuePlacements: MachineConstraintQueuePlacementPayload[]
) {
  const actionKey = machineKey(rescheduleAction || "shift_required")
  const modeKey = machineKey(planningMode || "system_recalculate")
  const placementSignature = queuePlacements
    .map((placement) =>
      [
        placement.targetJcNo,
        placement.targetSetupNo,
        placement.targetSourceMachine,
        placement.targetMachine,
        ...(placement.queueBeforeSetups ?? []).map(
          (row) => `${row.jcNo}/${row.setupNo}/${row.machine}`
        ),
      ]
        .map(machineKey)
        .join("/")
    )
    .sort()
    .join("|")
  return `${actionKey}|${modeKey}|${placementSignature}`
}

function dateRangesOverlap(
  leftFrom: string,
  leftTo: string,
  rightFrom: string,
  rightTo: string
) {
  if (!leftFrom || !rightFrom) return false
  const leftEnd = leftTo || leftFrom
  const rightEnd = rightTo || rightFrom
  return leftFrom <= rightEnd && rightFrom <= leftEnd
}
function machineConstraintPlacementValue(machine: string, afterKey: string) {
  return `${machineKey(machine)}${machineConstraintPlacementSeparator}${afterKey}`
}

function machineConstraintPlacementParts(
  value: string | undefined,
  defaultMachine: string
) {
  const [machineValuePart = "", ...afterParts] = (value || "").split(
    machineConstraintPlacementSeparator
  )
  return {
    machineKey: machineValuePart || machineKey(defaultMachine),
    afterKey: afterParts.join(machineConstraintPlacementSeparator),
  }
}

function machineConstraintQueuePlacementIndex(
  rows: DashboardPayload[],
  afterKey: string
) {
  if (!afterKey) return 0
  const rowIndex = rows.findIndex(
    (row) => machineConstraintQueueRowKey(row) === afterKey
  )
  return rowIndex < 0 ? 0 : rowIndex + 1
}

function machineConstraintQueueRowKey(row: DashboardPayload) {
  return [
    jobCardNumber(row),
    displayValue(row.setupNo),
    machineValue(row, "machine"),
  ]
    .map(machineKey)
    .join("|")
}

function machineConstraintQueueDropLabel(
  index: number,
  rows: DashboardPayload[]
) {
  if (index === 0) return "Place moved setup at position 1"
  const row = rows[index - 1]
  return row
    ? `Place moved setup after ${itemCode(row)} / ${jobCardNumber(row)} / setup ${displayValue(row.setupNo)}`
    : "Place moved setup at the end of this queue"
}
function machineIssueAffectedRows(
  rows: DashboardPayload[],
  issue: { machineNo: string; unavailableFrom: string; unavailableTo: string }
) {
  const targetMachine = machineKey(issue.machineNo)
  if (!targetMachine) return []
  const windowStart = dateSortValue(issue.unavailableFrom)
  const rawWindowEnd = dateSortValue(
    issue.unavailableTo || issue.unavailableFrom
  )
  const hasWindow = windowStart !== Number.MAX_SAFE_INTEGER
  const windowEnd =
    rawWindowEnd === Number.MAX_SAFE_INTEGER ? windowStart : rawWindowEnd
  const start = Math.min(windowStart, windowEnd)
  const end = Math.max(windowStart, windowEnd)
  return rows
    .filter((row) => machineKey(machineValue(row, "machine")) === targetMachine)
    .filter((row) => !hasWindow || machineIssueRowOverlaps(row, start, end))
    .sort(machinePlanDisplaySort)
}

function machineIssueRowOverlaps(
  row: DashboardPayload,
  windowStart: number,
  windowEnd: number
) {
  const rowStart = dateSortValue(
    row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate
  )
  if (rowStart === Number.MAX_SAFE_INTEGER) return true
  const rawRowEnd = dateSortValue(
    row.plannedProductionEndDate ||
      row.plannedProductionStartDate ||
      row.setupPlannedDate ||
      row.plannedDate
  )
  const rowEnd = rawRowEnd === Number.MAX_SAFE_INTEGER ? rowStart : rawRowEnd
  return rowStart <= windowEnd && rowEnd >= windowStart
}

function machineIssueRowIsLocked(row: DashboardPayload) {
  const stage = str(row.shopFloorStage)
  const runningStatus = str(row.runningStatus).toLowerCase()
  return (
    shopFloorItemIsCurrent(row) ||
    runningStatus === "setup complete" ||
    [
      "raw_material_at_machine",
      "presetting",
      "setting",
      "quality_approval",
    ].includes(stage)
  )
}
function partMachineSwitchTargetInterruptionRows(
  groups: MachineConstraintQueueReviewGroup[],
  selectedRows: DashboardPayload[]
) {
  const selectedKeys = new Set(selectedRows.map(machineIssueRowKey))
  const rows: DashboardPayload[] = []
  const seen = new Set<string>()
  for (const group of groups.filter(
    (candidate) => candidate.kind === "destination"
  )) {
    for (const row of group.rows) {
      const key = machineIssueRowKey(row)
      if (
        !key ||
        selectedKeys.has(key) ||
        seen.has(key) ||
        !machineIssueRowNeedsProducedQty(row)
      )
        continue
      seen.add(key)
      rows.push(row)
    }
  }
  return rows
}

function machineIssueRowNeedsProducedQty(row: DashboardPayload) {
  const runningStatus = str(row.runningStatus).toLowerCase()
  const stage = str(row.shopFloorStage)
  return (
    runningStatus === "running" ||
    ["operator_started", "worker_start"].includes(stage) ||
    Number(row.rawRows) > 0 ||
    Number(row.rawOutputQty) > 0 ||
    Number(row.rawActualQty) > 0
  )
}

function machineIssueRowKey(row: DashboardPayload) {
  return [
    jobCardNumber(row),
    displayValue(row.setupNo),
    machineValue(row, "machine"),
  ]
    .map(machineKey)
    .join("|")
}

function partMachineSwitchAffectedRows(
  rows: DashboardPayload[],
  issue: { target: string; setupNo: string; fromMachine: string }
) {
  const setupKey = machineKey(issue.setupNo)
  const fromMachineKey = machineKey(issue.fromMachine)
  if (!machineKey(issue.target) || !setupKey || !fromMachineKey) return []
  return rows
    .filter((row) => partMachineSwitchTargetMatches(row, issue.target))
    .filter((row) => machineKey(displayValue(row.setupNo)) === setupKey)
    .filter(
      (row) => machineKey(machineValue(row, "machine")) === fromMachineKey
    )
    .sort(machinePlanDisplaySort)
}

function partMachineSwitchTargetMatches(row: DashboardPayload, target: string) {
  const targetKey = machineKey(target)
  if (!targetKey) return true
  return (
    machineKey(jobCardNumber(row)) === targetKey ||
    machineKey(itemCode(row)) === targetKey
  )
}

function machineValue(row: DashboardPayload, type: "machine" | "machineType") {
  if (type === "machine") {
    return displayValue(
      row.machine ||
        row.machineNo ||
        row["MACHINE NO"] ||
        row["M/C NO"] ||
        row["MACHINE NO."]
    )
  }
  return displayValue(
    row.machineType || row["MACHINE TYPE"] || row.type || row.TYPE
  )
}

function machineMasterLocationValue(row: DashboardPayload) {
  return displayValue(row.location || row.Location || row.LOCATION)
}

function machineBoardRows(
  machineRows: DashboardPayload[],
  plannedRows: DashboardPayload[]
) {
  const rowsByMachine = new Map<string, DashboardPayload>()
  for (const row of machineRows) {
    const key = machineKey(machineValue(row, "machine"))
    if (!key) continue
    rowsByMachine.set(key, row)
  }
  for (const row of plannedRows) {
    const machine = machineValue(row, "machine")
    const key = machineKey(machine)
    if (!key || rowsByMachine.has(key)) continue
    rowsByMachine.set(key, {
      machine,
      machineNo: machine,
      machineType: machineValue(row, "machineType"),
      status: "Planned",
      remarks: "Machine is planned but missing from machine master",
    })
  }

  return [...rowsByMachine.values()].sort((a, b) =>
    machineValue(a, "machine").localeCompare(
      machineValue(b, "machine"),
      undefined,
      { numeric: true }
    )
  )
}

function jobCardNumber(row: DashboardPayload) {
  return displayValue(row.jcNo || row.JobCardNo || row.jobCard)
}

function itemCode(row: DashboardPayload) {
  return displayValue(row.partCode || row["PART CODE"] || row.itemCode)
}

function machineMasterStatusText(row: DashboardPayload) {
  const rawStatus = str(
    row.status ||
      row.STATUS ||
      row.activeStatus ||
      row.isActive ||
      row.ACTIVE ||
      row.active ||
      row.Active
  )
  const normalized = rawStatus.toLowerCase()
  if (!rawStatus) return "Active"
  if (normalized === "planned") return "Not in master"
  if (["active", "yes", "true", "running", "available"].includes(normalized))
    return "Active"
  if (
    [
      "inactive",
      "no",
      "false",
      "deactive",
      "deactivated",
      "disabled",
      "unavailable",
    ].includes(normalized)
  )
    return "Inactive"
  return rawStatus
}

function jobCardTrackingState(
  row: DashboardPayload,
  setupRows: DashboardPayload[] = []
) {
  const dispatchStatus = str(row.dispatchStatus).toLowerCase()
  if (dispatchStatus.includes("dispatch")) return "Dispatch"

  const statuses = [
    row.planningBlocker,
    row.routeStatus,
    row.cycleStatus,
    row.toolingStatus,
    row.optionSource,
    row.rmStatus,
  ].map((value) => str(value).toLowerCase())

  if (
    statuses.some(
      (value) =>
        value.includes("missing") ||
        value.includes("waiting") ||
        value.includes("required")
    )
  ) {
    return "Needs action"
  }

  if (jobCardHasProduction(row, setupRows)) {
    return "In production"
  }

  if (
    statuses.some(
      (value) => value.includes("ready") || value.includes("all checks")
    )
  ) {
    return "Ready"
  }

  return "Pending"
}

function jobCardHasProduction(
  row: DashboardPayload,
  setupRows: DashboardPayload[] = []
) {
  return shopFloorItemIsCurrent(row) || setupRows.some(shopFloorItemIsCurrent)
}

function rowMatchesFieldQuery(
  row: DashboardPayload,
  query: string,
  field: string,
  setupRows: DashboardPayload[] = []
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return rowFieldSearchText(row, field, setupRows).includes(normalizedQuery)
}

function rowMatchesMachineQuery(
  row: DashboardPayload,
  query: string,
  field: string,
  plannedByMachine: Map<string, DashboardPayload[]>
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  const machinePlans =
    plannedByMachine.get(machineKey(machineValue(row, "machine"))) ?? []
  const machineText = rowFieldSearchText(row, field)
  const planText = machinePlans
    .map((plan) => rowFieldSearchText(plan, field))
    .join(" ")
  return `${machineText} ${planText}`.includes(normalizedQuery)
}

function rowFieldSearchText(
  row: DashboardPayload,
  field: string,
  setupRows: DashboardPayload[] = []
) {
  const values =
    field === "jobCard"
      ? [row.jcNo, row.JobCardNo, row.jobCard]
      : field === "part"
        ? [
            row.partCode,
            row["PART CODE"],
            row.itemCode,
            row.description,
            row.DESCRIPTION,
          ]
        : field === "po"
          ? [row.fgPoNo, row["FG PO NO."]]
          : field === "route"
            ? [
                row.optionNumber,
                row.selectedOption,
                row.option,
                row.routeStatus,
                row.cycleStatus,
                row.toolingStatus,
                row.setupNo,
                row.setupName,
              ]
            : field === "status"
              ? [
                  jobCardTrackingState(row, setupRows),
                  row.rmStatus,
                  row.dispatchStatus,
                  row.runningStatus,
                  row.routeStatus,
                  row.cycleStatus,
                  row.toolingStatus,
                ]
              : field === "machine"
                ? [
                    row.machine,
                    row.machineNo,
                    row["MACHINE NO"],
                    row["M/C NO"],
                    row["MACHINE NO."],
                  ]
                : field === "machineType"
                  ? [row.machineType, row["MACHINE TYPE"], row.type, row.TYPE]
                  : field === "operator"
                    ? [
                        row.operator,
                        row.operatorName,
                        row["OPERATOR NAME"],
                        row.operatorId,
                      ]
                    : Object.values(row)
  return values
    .map((value) => formatCell(value))
    .join(" ")
    .toLowerCase()
}

function groupPlannedRowsByMachine(rows: DashboardPayload[]) {
  const grouped = new Map<string, DashboardPayload[]>()
  for (const row of rows) {
    const machine = machineValue(row, "machine")
    const key = machineKey(machine)
    if (!key) continue
    const machineRowsForKey = grouped.get(key) ?? []
    machineRowsForKey.push(row)
    grouped.set(key, machineRowsForKey)
  }
  return sortGroupedRows(grouped, machinePlanDisplaySort)
}

function groupPlannedRowsByJobCard(rows: DashboardPayload[]) {
  const grouped = new Map<string, DashboardPayload[]>()
  for (const row of rows) {
    const key = machineKey(row.jcNo || row.JobCardNo || row.jobCard)
    if (!key) continue
    const existing = grouped.get(key) ?? []
    existing.push(row)
    grouped.set(key, existing)
  }
  return sortGroupedRows(grouped, jobCardSetupSort)
}

function plannedRowsForJobCard(
  row: DashboardPayload,
  plannedByJobCard: Map<string, DashboardPayload[]>,
  plannedByPart: Map<string, DashboardPayload[]>
) {
  return (
    plannedByJobCard.get(machineKey(jobCardNumber(row))) ??
    plannedByPart.get(machineKey(itemCode(row))) ??
    []
  )
}

function groupPlannedRowsByPart(rows: DashboardPayload[]) {
  const grouped = new Map<string, DashboardPayload[]>()
  for (const row of rows) {
    const key = machineKey(row.partCode || row["PART CODE"] || row.itemCode)
    if (!key) continue
    const existing = grouped.get(key) ?? []
    existing.push(row)
    grouped.set(key, existing)
  }
  return sortGroupedRows(grouped, jobCardSetupSort)
}

function sortGroupedRows(
  grouped: Map<string, DashboardPayload[]>,
  sorter: (a: DashboardPayload, b: DashboardPayload) => number
) {
  for (const [key, rows] of grouped) {
    grouped.set(key, [...rows].sort(sorter))
  }
  return grouped
}

function machinePlanDisplaySort(a: DashboardPayload, b: DashboardPayload) {
  return (
    shopFloorDisplayBucket(a) - shopFloorDisplayBucket(b) ||
    shopFloorPlanSort(a, b)
  )
}

function jobCardSetupSort(a: DashboardPayload, b: DashboardPayload) {
  return (
    displayValue(a.setupNo).localeCompare(displayValue(b.setupNo), undefined, {
      numeric: true,
    }) || shopFloorPlanSort(a, b)
  )
}

function shopFloorDisplayBucket(row: DashboardPayload) {
  if (shopFloorItemIsFinished(row)) return 2
  if (shopFloorItemIsCurrent(row)) return 0
  return 1
}

function shopFloorItemIsFinished(row: DashboardPayload) {
  return (
    str(row.shopFloorStage) === "item_complete" ||
    str(row.runningStatus).toLowerCase() === "complete"
  )
}

function plannedMachineOptions(
  rows: DashboardPayload[],
  machineRows: DashboardPayload[] = []
) {
  const boardOptions = machineRows
    .map((row) => machineValue(row, "machine"))
    .filter((value) => value !== "-")
  if (boardOptions.length) return uniqueValues(boardOptions)
  return uniqueValues(
    rows
      .map((row) => machineValue(row, "machine"))
      .filter((value) => value !== "-")
  )
}

function typedFilterMatches(value: string, filter: string) {
  const normalizedFilter = filter.trim().toLowerCase()
  if (!normalizedFilter) return true
  return value.toLowerCase() === normalizedFilter
}

function shopFloorItemLabel(row: DashboardPayload) {
  return [
    itemCode(row),
    jobCardNumber(row),
    `Setup ${displayValue(row.setupNo)}`,
    `Option ${displayValue(row.optionNumber)}`,
  ]
    .filter((value) => value && value !== "-")
    .join(" / ")
}

function shopFloorItemMatchesFilter(
  row: DashboardPayload | undefined,
  filter: string
) {
  const normalizedFilter = filter.trim().toLowerCase()
  if (!normalizedFilter) return true
  if (!row)
    return ["empty", "no running item", "no plan"].includes(normalizedFilter)
  return shopFloorItemLabel(row).toLowerCase() === normalizedFilter
}

function correctionRowMatchesQuery(row: DashboardPayload, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return [
    row.targetTable,
    row.entryType,
    row.targetKey,
    row.targetLabel,
    row.createdAt,
    JSON.stringify(row.details ?? {}),
  ]
    .map((value) => formatCell(value))
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery)
}

function shopFloorRowStatus(
  current: DashboardPayload | undefined,
  next: DashboardPayload | undefined,
  productionCardRows: DashboardPayload[] = []
) {
  if (current) return shopFloorCurrentStatusLabel(current, productionCardRows)
  if (!next) return "No plan"
  return str(next.shopFloorStageLabel) || "Setup required"
}

function shopFloorCurrentStatusLabel(
  row: DashboardPayload,
  productionCardRows: DashboardPayload[] = []
) {
  if (
    shopFloorItemIsProductionCurrent(row) ||
    shopFloorItemHasActiveProductionCard(row, productionCardRows)
  )
    return "Running"
  return (
    str(row.shopFloorStageLabel) || str(row.runningStatus) || "Setup complete"
  )
}

function jobCardMatchesMachine(
  row: DashboardPayload,
  machineFilter: string,
  plannedByJobCard: Map<string, DashboardPayload[]>,
  plannedByPart: Map<string, DashboardPayload[]>
) {
  const normalizedFilter = machineFilter.trim().toLowerCase()
  if (!normalizedFilter) return true
  const plannedRows = [
    ...(plannedByJobCard.get(machineKey(jobCardNumber(row))) ?? []),
    ...(plannedByPart.get(machineKey(itemCode(row))) ?? []),
  ]
  return plannedRows.some(
    (plannedRow) =>
      machineValue(plannedRow, "machine").toLowerCase() === normalizedFilter
  )
}

function machineMatchesJobCard(
  machine: string,
  jobCardFilter: string,
  plannedByMachine: Map<string, DashboardPayload[]>
) {
  const normalizedFilter = jobCardFilter.trim().toLowerCase()
  if (!normalizedFilter) return true
  const plannedRows = plannedByMachine.get(machineKey(machine)) ?? []
  return plannedRows.some(
    (plannedRow) => jobCardNumber(plannedRow).toLowerCase() === normalizedFilter
  )
}

function machineMatchesItemCode(
  machine: string,
  itemCodeFilter: string,
  plannedByMachine: Map<string, DashboardPayload[]>
) {
  const normalizedFilter = itemCodeFilter.trim().toLowerCase()
  if (!normalizedFilter) return true
  const plannedRows = plannedByMachine.get(machineKey(machine)) ?? []
  return plannedRows.some(
    (plannedRow) => itemCode(plannedRow).toLowerCase() === normalizedFilter
  )
}

function machineIsRunning(
  machine: string,
  plannedByMachine: Map<string, DashboardPayload[]>
) {
  const rows = plannedByMachine.get(machineKey(machine)) ?? []
  return rows.some((row) => {
    if (
      planningRowIsBreakdownStopped(row) ||
      planningRowIsShiftedAfterBreakdown(row) ||
      planningRowHasUnavailableBreakdown(row)
    )
      return false
    return (
      str(row.runningStatus).toLowerCase() === "running" ||
      Number(row.rawRows) > 0 ||
      Number(row.rawOutputQty) > 0 ||
      Number(row.rawActualQty) > 0
    )
  })
}

function currentShopFloorItem(rows: DashboardPayload[]) {
  return rows
    .filter((row) => str(row.shopFloorStage) !== "item_complete")
    .filter((row) => shopFloorItemIsProductionCurrent(row))
    .sort(shopFloorPlanSort)[0]
}

function nextShopFloorItem(
  rows: DashboardPayload[],
  current: DashboardPayload | undefined
) {
  const currentKey = current ? shopFloorPlanKey(current) : ""
  return rows
    .filter((row) => shopFloorPlanKey(row) !== currentKey)
    .filter((row) => str(row.shopFloorStage) !== "item_complete")
    .filter((row) => !shopFloorItemIsProductionCurrent(row))
    .sort(shopFloorPlanSort)[0]
}

function currentShopFloorStatusItem(
  rows: DashboardPayload[],
  productionCardRows: DashboardPayload[] = []
) {
  return rows
    .filter((row) => str(row.shopFloorStage) !== "item_complete")
    .filter(
      (row) =>
        shopFloorItemIsStatusCurrent(row) ||
        shopFloorItemHasActiveProductionCard(row, productionCardRows)
    )
    .sort(shopFloorPlanSort)[0]
}

function nextShopFloorStatusItem(
  rows: DashboardPayload[],
  current: DashboardPayload | undefined,
  productionCardRows: DashboardPayload[] = []
) {
  const currentKey = current ? shopFloorPlanKey(current) : ""
  return rows
    .filter((row) => shopFloorPlanKey(row) !== currentKey)
    .filter((row) => str(row.shopFloorStage) !== "item_complete")
    .filter(
      (row) =>
        !shopFloorItemIsStatusCurrent(row) &&
        !shopFloorItemHasActiveProductionCard(row, productionCardRows)
    )
    .sort(shopFloorPlanSort)[0]
}

function shopFloorQueueRows(productionControl: DashboardPayload) {
  const plannedRows = asArray(productionControl.machinePlanDetailRows)
  const boardRows = machineBoardRows(
    asArray(productionControl.machinePlanningRows),
    plannedRows
  )
  const plannedByMachine = groupPlannedRowsByMachine(plannedRows)
  return boardRows
    .map((machineRow) => {
      const machine = machineValue(machineRow, "machine")
      const plans = plannedByMachine.get(machineKey(machine)) ?? []
      const current = currentShopFloorItem(plans)
      const next = nextShopFloorItem(plans, current)
      return {
        machineRow,
        machine,
        location: machineMasterLocationValue(machineRow),
        current,
        next,
      }
    })
    .filter(
      (
        row
      ): row is {
        machineRow: DashboardPayload
        machine: string
        location: string
        current: DashboardPayload | undefined
        next: DashboardPayload
      } => Boolean(row.next)
    )
}

function currentShopFloorRows(productionControl: DashboardPayload) {
  const plannedRows = asArray(productionControl.machinePlanDetailRows)
  const boardRows = machineBoardRows(
    asArray(productionControl.machinePlanningRows),
    plannedRows
  )
  const plannedByMachine = groupPlannedRowsByMachine(plannedRows)
  return boardRows
    .map((machineRow) => {
      const machine = machineValue(machineRow, "machine")
      const plans = plannedByMachine.get(machineKey(machine)) ?? []
      return currentShopFloorItem(plans)
    })
    .filter((row): row is DashboardPayload => Boolean(row))
}

function roleTaskMatches(
  row: { current: DashboardPayload | undefined; next: DashboardPayload },
  role: RoleTaskKind
) {
  const nextStage = nextShopFloorStage(row.next)
  if (!nextStage) return false
  if (row.next.shopFloorTaskReady === false) return false
  if (role === "shopFloor") {
    return nextStage.id === "raw_material_at_machine" && !row.current
  }
  if (role === "quality") return nextStage.id === "quality_approval"
  return (
    nextStage.id === "presetting" ||
    nextStage.id === "setting" ||
    nextStage.id === "operator_started"
  )
}

function nextShopFloorStage(row: DashboardPayload) {
  const nextIndex = shopFloorStageIndex(str(row.shopFloorStage)) + 1
  return shopFloorStages[nextIndex]
}

function pendingTaskLabel(row: DashboardPayload) {
  return nextShopFloorStage(row)?.label ?? "No pending task"
}

function shopFloorItemHasActiveProductionCard(
  row: DashboardPayload,
  productionCardRows: DashboardPayload[] = []
) {
  return productionCardRows.some((card) => {
    const role = optionalText(card.cardRole) ?? ""
    const entryKind =
      optionalText(card.cardEntryKind) || inferredProductionCardEntryKind(card)
    if (role && !sameProductionCardText(role, "shopFloor")) return false
    if (entryKind !== "production") return false
    if (!optionalText(card.startTime)) return false
    if (optionalText(card.endTime)) return false
    if (!sameProductionCardText(card.machine, displayValue(row.machine)))
      return false
    if (!sameProductionCardText(card.partCode || card.partNo, itemCode(row)))
      return false
    if (!sameProductionCardText(card.jobCard || card.jcNo, jobCardNumber(row)))
      return false
    return sameProductionCardText(card.setupNo, displayValue(row.setupNo))
  })
}
function shopFloorItemIsCurrent(row: DashboardPayload) {
  return shopFloorItemIsProductionCurrent(row)
}

function shopFloorItemIsProductionCurrent(row: DashboardPayload) {
  if (
    planningRowIsBreakdownStopped(row) ||
    planningRowIsShiftedAfterBreakdown(row)
  )
    return false
  return (
    ["operator_started", "worker_start"].includes(str(row.shopFloorStage)) ||
    str(row.runningStatus).toLowerCase() === "running" ||
    Number(row.rawRows) > 0 ||
    Number(row.rawOutputQty) > 0 ||
    Number(row.rawActualQty) > 0
  )
}

function shopFloorItemIsStatusCurrent(row: DashboardPayload) {
  if (shopFloorItemIsProductionCurrent(row)) return true
  const stageIndex = shopFloorStageIndex(str(row.shopFloorStage))
  const qualityApprovedIndex = shopFloorStageIndex("quality_approval")
  return stageIndex >= qualityApprovedIndex
}

function shopFloorStageIndex(stage: string) {
  const normalizedStage =
    {
      shop_floor_rm: "raw_material_at_machine",
      tools_drawing: "presetting",
      qc_approval: "quality_approval",
      worker_start: "operator_started",
    }[stage] ?? stage
  return shopFloorStages.findIndex((item) => item.id === normalizedStage)
}

function shopFloorPlanSort(a: DashboardPayload, b: DashboardPayload) {
  return (
    dateSortValue(plannedSetupDate(a)) - dateSortValue(plannedSetupDate(b)) ||
    displayValue(a.setupNo).localeCompare(displayValue(b.setupNo), undefined, {
      numeric: true,
    }) ||
    itemCode(a).localeCompare(itemCode(b), undefined, { numeric: true })
  )
}

function shopFloorPlanKey(row: DashboardPayload) {
  return [
    jobCardNumber(row),
    itemCode(row),
    displayValue(row.optionNumber),
    displayValue(row.setupNo),
    displayValue(row.machine),
  ]
    .map(machineKey)
    .join("|")
}

function machinePlanningStatus(rows: DashboardPayload[]) {
  if (!rows.length) return "No plan"
  if (
    rows.some(
      (row) =>
        planningRowIsBreakdownStopped(row) ||
        planningRowHasUnavailableBreakdown(row)
    )
  )
    return "Breakdown"
  if (
    rows.some(
      (row) => str(row.runningStatus).toLowerCase() === "setup complete"
    )
  )
    return "Setup complete"
  return "Planned"
}

function machineTileFocusSetup(rows: DashboardPayload[]) {
  const completed = rows.filter(
    (row) =>
      str(row.runningStatus).toLowerCase() === "setup complete" ||
      displayValue(row.completionDate) !== "-"
  )
  if (completed.length)
    return completed.sort(
      (a, b) =>
        dateSortValue(completedSetupDate(b)) -
          dateSortValue(completedSetupDate(a)) ||
        dateSortValue(plannedSetupDate(b)) - dateSortValue(plannedSetupDate(a))
    )[0]
  const pending = rows.filter((row) => displayValue(row.completionDate) === "-")
  return (pending.length ? pending : rows).sort(
    (a, b) =>
      dateSortValue(plannedSetupDate(a)) - dateSortValue(plannedSetupDate(b)) ||
      displayValue(a.setupNo).localeCompare(
        displayValue(b.setupNo),
        undefined,
        { numeric: true }
      )
  )[0]
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Input
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<string | { value: string; label: string }>
  placeholder?: string
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <SearchableSelect
        className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value
          const optionLabel = typeof option === "string" ? option : option.label
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          )
        })}
      </SearchableSelect>
    </label>
  )
}

function AlertMessage({
  tone,
  children,
}: {
  tone: NonNullable<ActionStatus>["tone"]
  children: ReactNode
}) {
  return (
    <Badge
      variant={tone === "destructive" ? "destructive" : "outline"}
      className="w-fit"
    >
      {children}
    </Badge>
  )
}

function ProcessingNotice({ message }: { message: string }) {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="flex w-fit items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
      role="status"
    >
      <span aria-hidden="true" className="animate-spin text-primary">
        <RefreshCw className="size-4" />
      </span>
      <div>
        <div className="font-medium">{message}</div>
        <div className="text-xs text-muted-foreground">
          Please Wait. Data-Entry Controls Are Locked Until Processing Finishes.
        </div>
      </div>
    </div>
  )
}

function dashboardActionProcessingMessage(
  path: string,
  body: Record<string, unknown>
) {
  if (path === "data-import") return "Importing entered data..."
  if (path === "reverse-entry") return "Applying the correction..."
  if (path === "data-entry") {
    const entryType = str(body.entryType)
    const title = dataEntrySpecs.find(
      (spec) => spec.entryType === entryType
    )?.title
    return title ? `Saving ${title.toLowerCase()}...` : "Saving entered data..."
  }
  return "Processing entered data..."
}

function hourSlotOptions() {
  return Array.from({ length: 24 }, (_, hour) => {
    const start = `${String(hour).padStart(2, "0")}:00`
    const end = `${String((hour + 1) % 24).padStart(2, "0")}:00`
    return `${start}-${end}`
  })
}

function currentHourSlot() {
  const hour = Number(formatIstTime(new Date()).slice(0, 2))
  return `${String(hour).padStart(2, "0")}:00-${String((hour + 1) % 24).padStart(2, "0")}:00`
}

function qualityParameterCode(row: DashboardPayload) {
  return str(row.code || row.parameterCode || row["CODE"])
}

function qualityParameterName(row: DashboardPayload) {
  return str(
    row.parameterName ||
      row.description ||
      row["PARAMETER"] ||
      row["DESCRIPTION"] ||
      row.specification ||
      qualityParameterCode(row)
  )
}

function qualityParameterInputType(row: DashboardPayload) {
  const inputType = str(row.inputType).toLowerCase()
  if (inputType === "pass_fail" || inputType === "pass/fail") return "pass_fail"
  if (inputType === "text") return "text"
  return "number"
}

function qualityParameterTolerance(row: DashboardPayload) {
  const plus = str(row.tolerancePlus || row["TOLERANCE +"] || row["TOL +"])
  const minus = str(row.toleranceMinus || row["TOLERANCE -"] || row["TOL -"])
  if (!plus && !minus) return "-"
  return `+${plus || "0"} / -${minus || "0"}`
}

function qualityParameterMatchesSetup(
  parameter: DashboardPayload,
  row: DashboardPayload
) {
  if (str(parameter.status).toLowerCase() === "inactive") return false
  const parameterPart = machineKey(
    parameter.partNo ||
      parameter.partCode ||
      parameter["PART NO"] ||
      parameter["PART CODE"]
  )
  const parameterOption = machineKey(
    parameter.optionNumber ||
      parameter["OPTION NUMBER"] ||
      parameter["OPTION NO"]
  )
  const parameterSetup = machineKey(
    parameter.setupNo ||
      parameter["SETUP NO."] ||
      parameter["SETUP NO"] ||
      parameter["SET UP"]
  )
  return (
    parameterPart === machineKey(itemCode(row)) &&
    parameterOption === machineKey(displayValue(row.optionNumber)) &&
    parameterSetup === machineKey(displayValue(row.setupNo))
  )
}

function qualityReadingResult(parameter: DashboardPayload, value: unknown) {
  const reading = str(value)
  if (!reading) return ""
  if (qualityParameterInputType(parameter) === "pass_fail")
    return qualityPassFailResult(reading)
  if (qualityParameterInputType(parameter) !== "number") return "Recorded"
  const numericReading = Number(reading)
  const specification = Number(str(parameter.specification))
  if (!Number.isFinite(numericReading) || !Number.isFinite(specification))
    return "Recorded"
  const plus = Number(str(parameter.tolerancePlus || 0))
  const minus = Number(str(parameter.toleranceMinus || 0))
  const lower = specification - (Number.isFinite(minus) ? minus : 0)
  const upper = specification + (Number.isFinite(plus) ? plus : 0)
  return numericReading >= lower && numericReading <= upper ? "OK" : "Not OK"
}

function normalizeQualityReadingInput(value: unknown) {
  const reading = str(value)
  return reading.toLowerCase() === "ng" ? "Not OK" : reading
}

function qualityPassFailResult(value: unknown) {
  const reading = str(value).toLowerCase()
  if (!reading) return ""
  return reading === "ok" || reading === "pass" ? "OK" : "Not OK"
}

function qualityResultTone(result: unknown) {
  const normalized = str(result).toLowerCase()
  if (normalized === "not ok" || normalized === "ng") return "bad"
  if (normalized === "ok") return "good"
  return "neutral"
}

function qualityReadingInputClass(result: unknown) {
  const tone = qualityResultTone(result)
  if (tone === "bad")
    return "border-red-400 bg-red-50 text-red-900 focus-visible:border-red-500 focus-visible:ring-red-200 dark:bg-red-950/30 dark:text-red-100"
  if (tone === "good")
    return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100"
  return ""
}

function hourlyQualityCheckId(
  row: DashboardPayload,
  prodDate: string,
  shift: string,
  hourSlot: string
) {
  return [
    "hourly-quality",
    prodDate,
    shift,
    hourSlot,
    displayValue(row.machine),
    itemCode(row),
    displayValue(row.optionNumber),
    displayValue(row.setupNo),
  ]
    .map(machineKey)
    .join("|")
}

function hourlyQualityCheckPayload(
  row: DashboardPayload,
  parameters: DashboardPayload[],
  readings: Record<string, string>,
  remarks: Record<string, string>,
  meta: { prodDate: string; shift: string; hourSlot: string; checkedBy: string }
) {
  const readingRows = parameters.map((parameter) => {
    const code = qualityParameterCode(parameter)
    const actualReading = str(readings[code])
    const result = qualityReadingResult(parameter, actualReading)
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
    }
  })
  return {
    checkId: hourlyQualityCheckId(
      row,
      meta.prodDate,
      meta.shift,
      meta.hourSlot
    ),
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
    ngCount: readingRows.filter(
      (reading) => qualityResultTone(reading.result) === "bad"
    ).length,
    readings: readingRows,
    savedAt: new Date().toISOString(),
  }
}
function plannedSetupDate(row: DashboardPayload | undefined) {
  return (
    row?.plannedProductionStartDate || row?.setupPlannedDate || row?.plannedDate
  )
}

function completedSetupDate(row: DashboardPayload | undefined) {
  return row?.setupCompletionDate || row?.completionDate
}

function machinePlanningTone(
  status: string
): "success" | "planning" | "warning" | "danger" | "neutral" {
  if (status === "Breakdown") return "danger"
  if (status === "Setup complete") return "success"
  if (status === "Planned") return "planning"
  return "neutral"
}

function planningRowIsBreakdownStopped(row: DashboardPayload) {
  return str(row.runningStatus).toLowerCase() === "breakdown stopped"
}

function planningRowIsShiftedAfterBreakdown(row: DashboardPayload) {
  const status = str(row.runningStatus).toLowerCase()
  return status === "plan shifted" || status === "plan delayed"
}

function planningRowHasUnavailableBreakdown(row: DashboardPayload) {
  const text = [row.machineUnavailableReason, row.plannerActionRequired]
    .map(str)
    .join(" ")
    .toLowerCase()
  return text.includes("breakdown") || text.includes("unavailable")
}

function machineKey(value: unknown) {
  return str(value).toLowerCase()
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
    ]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "first_piece_inspection_report") {
    return [
      payload.jcNo,
      payload.partCode,
      payload.optionNumber,
      payload.setupNo,
      payload.machine,
      "fpi",
    ]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "quality_parameter_master") {
    return [
      payload.partNo || payload.partCode,
      payload.optionNumber,
      payload.setupNo,
      payload.code || payload.parameterCode,
    ]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "hourly_quality_check") {
    return (
      str(payload.checkId) ||
      [
        payload.prodDate || payload.date,
        payload.shift,
        payload.hourSlot,
        payload.machine || payload.machineNo,
        payload.partCode || payload.partNo,
        payload.optionNumber,
        payload.setupNo,
      ]
        .map((value) => str(value).toLowerCase())
        .join("|")
    )
  }
  if (entryType === "production_card" || entryType === "software_raw") {
    return [
      payload.cardId,
      payload.prodDate,
      payload.jobCard || payload.jcNo,
      payload.partCode,
      payload.setupNo,
      payload.machine,
    ]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "setup_checklist_master") {
    return [payload.checklistCode || payload.version, payload.sequence]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "setup_checklist_session") {
    return (
      str(payload.sessionId) ||
      [
        payload.jcNo,
        payload.partCode,
        payload.optionNumber,
        payload.setupNo,
        payload.machine,
      ]
        .map((value) => str(value).toLowerCase())
        .join("|")
    )
  }
  if (entryType === "setup_checklist") {
    return [
      payload.jcNo,
      payload.partNo,
      payload.optionNumber,
      payload.setupNo,
      payload.machineNo,
    ]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "shop_floor_status") {
    return [
      payload.jcNo,
      payload.partCode,
      payload.optionNumber,
      payload.setupNo,
      payload.machine,
    ]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "maintenance_master") {
    return str(payload.maintenanceCode || payload.code).toLowerCase()
  }
  if (entryType === "maintenance_checklist_master") {
    return [payload.checklistCode, payload.sequence]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "maintenance_schedule") {
    return [payload.machineNo || payload.machine, payload.maintenanceCode]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "maintenance_task") {
    return (
      str(payload.taskId) ||
      [
        payload.machineNo || payload.machine,
        payload.maintenanceType,
        payload.maintenanceCode,
        payload.completedDate,
        payload.completedAt,
      ]
        .map((value) => str(value).toLowerCase())
        .join("|")
    )
  }
  if (
    entryType === "downtime_reason_master" ||
    entryType === "rejection_type_master" ||
    entryType === "rejection_reason_master" ||
    entryType === "rejection_remark_master"
  )
    return str(payload.code).toLowerCase()
  if (entryType === "planning_holiday") {
    return [payload.date, payload.scope, payload.machine, payload.department]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "work_order" || entryType === "rm_inward")
    return str(payload.jcNo)
  if (
    entryType === "route" ||
    entryType === "cycle" ||
    entryType === "tooling"
  ) {
    return [payload.partNo, payload.optionNumber, payload.setupNo]
      .map((value) => str(value).toLowerCase())
      .join("|")
  }
  if (entryType === "setup_name_master")
    return str(payload.setupName).toLowerCase()
  if (entryType === "machine_master") return str(payload.machineNo)
  if (entryType === "employee") return str(payload.empId)
  return ""
}

function qualityParameterRowsFromDataEntry(
  dataEntry: DashboardPayload | undefined
) {
  const record = asRecord(dataEntry)
  return mergeQualityParameterRows([
    ...asArray(record.qualityParameterMasterRows),
    ...asArray(record.rows).filter(
      (row) => str(row.entryType) === "quality_parameter_master"
    ),
    ...asArray(record.templates).filter(
      (row) => str(row.entryType) === "quality_parameter_master"
    ),
  ])
}

function qualityParameterSetupKey(row: DashboardPayload) {
  return [row.partNo || row.partCode, row.optionNumber, row.setupNo]
    .map((value) => machineKey(value))
    .join("|")
}

function qualityParameterMasterKey(row: DashboardPayload) {
  return [
    row.partNo || row.partCode,
    row.optionNumber,
    row.setupNo,
    row.code || row.parameterCode,
  ]
    .map((value) => machineKey(value))
    .join("|")
}

function sortQualityParameterRows(rows: DashboardPayload[]) {
  return [...rows].sort(
    (a, b) =>
      (optionalNumber(a.sequence) ?? 9999) -
        (optionalNumber(b.sequence) ?? 9999) ||
      qualityParameterCode(a).localeCompare(
        qualityParameterCode(b),
        undefined,
        { numeric: true }
      ) ||
      qualityParameterName(a).localeCompare(
        qualityParameterName(b),
        undefined,
        { numeric: true }
      )
  )
}

function mergeQualityParameterRows(rows: DashboardPayload[]) {
  const byKey = new Map<string, DashboardPayload>()
  for (const row of rows) {
    const key = qualityParameterMasterKey(row)
    if (!key.replaceAll("|", "")) continue
    byKey.set(key, row)
  }
  return sortQualityParameterRows([...byKey.values()])
}

function qualityParameterRowsSignature(rows: DashboardPayload[]) {
  return rows
    .map((row) =>
      [
        qualityParameterMasterKey(row),
        row.sequence,
        qualityParameterName(row),
        row.specification,
        row.instrumentUsed,
        row.tolerancePlus,
        row.toleranceMinus,
        qualityParameterInputType(row),
        row.status,
        row.remark,
      ]
        .map((value) => str(value))
        .join("|")
    )
    .join("||")
}

function newQualityParameterDraft(sequence: number): QualityParameterDraft {
  return {
    draftId: `quality-param-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sequence: String(sequence),
    parameterName: "",
    specification: "",
    instrumentUsed: "",
    tolerancePlus: "",
    toleranceMinus: "",
    inputType: "number",
    remark: "",
  }
}

function qualityParameterDraftFromRow(
  row: DashboardPayload
): QualityParameterDraft {
  return {
    draftId:
      qualityParameterMasterKey(row) ||
      `quality-param-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    persisted: true,
    parameterCode: qualityParameterCode(row),
    sequence:
      displayValue(row.sequence) !== "-" ? displayValue(row.sequence) : "",
    parameterName: qualityParameterName(row),
    specification: str(row.specification),
    instrumentUsed: str(row.instrumentUsed),
    tolerancePlus: str(row.tolerancePlus),
    toleranceMinus: str(row.toleranceMinus),
    inputType: qualityParameterInputType(row),
    remark: str(row.remark),
  }
}

function qualityParameterAutoCode(
  draft: QualityParameterDraft | DashboardPayload
) {
  const existingCode = str(
    (draft as DashboardPayload).code || draft.parameterCode
  )
  if (existingCode) return existingCode
  const sequence = optionalNumber(draft.sequence) ?? 1
  return `P${sequence}`
}

function qualityParameterPayload(
  draft: QualityParameterDraft | DashboardPayload,
  setupFields: DashboardPayload,
  status: string
): DashboardPayload {
  const draftRecord = draft as QualityParameterDraft & DashboardPayload
  return {
    partNo: str(setupFields.partNo || setupFields.partCode),
    optionNumber: str(setupFields.optionNumber),
    setupNo: str(setupFields.setupNo),
    code: qualityParameterAutoCode(draft),
    sequence: optionalNumber(draft.sequence) ?? str(draft.sequence),
    parameterName: str(draftRecord.parameterName || draftRecord.description),
    specification: str(draft.specification),
    instrumentUsed: str(draft.instrumentUsed),
    tolerancePlus: str(draft.tolerancePlus),
    toleranceMinus: str(draft.toleranceMinus),
    inputType: qualityParameterInputType(draft),
    required: "Yes",
    status,
    remark: str(draft.remark),
  }
}

function combinedQualityInspectionMasterRows(
  productionControl: DashboardPayload
) {
  return mergeQualityInspectionParameterRows(
    asArray(productionControl.qualityParameterMasterRows),
    asArray(productionControl.firstPieceInspectionMasterRows)
  )
}

function qualityParameterRouteLines(rows: DashboardPayload[]) {
  const byKey = new Map<
    string,
    { partNo: string; optionNumber: string; setupNo: string }
  >()
  for (const row of rows) {
    const line = {
      partNo: displayValue(row.partNo || row.partCode),
      optionNumber: displayValue(row.optionNumber),
      setupNo: displayValue(row.setupNo),
    }
    if (Object.values(line).some((value) => value === "-")) continue
    byKey.set(qualityParameterSetupKey(line), line)
  }
  return [...byKey.values()].sort((a, b) =>
    qualityParameterSetupKey(a).localeCompare(
      qualityParameterSetupKey(b),
      undefined,
      { numeric: true }
    )
  )
}

function automaticMasterCodePrefix(entryType: string) {
  return (
    {
      rejection_type_master: "RT",
      rejection_remark_master: "RR",
      rejection_reason_master: "DC",
    }[entryType] ?? ""
  )
}

function nextAutomaticMasterCode(entryType: string, rows: DashboardPayload[]) {
  const prefix = automaticMasterCodePrefix(entryType)
  if (!prefix) return ""
  const expression = new RegExp(`^${prefix}(\\d+)$`, "i")
  const max = rows.reduce((highest, row) => {
    const match = expression.exec(displayValue(row.code))
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `${prefix}${String(max + 1).padStart(3, "0")}`
}

function setupChecklistCode(row: DashboardPayload) {
  const explicitCode = displayValue(row.checklistCode)
  if (explicitCode !== "-") return explicitCode
  const version = displayValue(row.version)
  return version === "-"
    ? ""
    : /^(SC\d+|SETUP-)/i.test(version)
      ? version
      : `SETUP-${version}`
}

function nextSetupChecklistCode(rows: DashboardPayload[]) {
  const max = rows.reduce((highest, row) => {
    const match = /^SC(\d+)$/i.exec(setupChecklistCode(row))
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `SC${String(max + 1).padStart(3, "0")}`
}

function setupChecklistRowKey(row: DashboardPayload) {
  return [setupChecklistCode(row), row.sequence]
    .map((value) => str(value).toLowerCase())
    .join("|")
}

function mergeSetupChecklistRows(rows: DashboardPayload[]) {
  const byKey = new Map<string, DashboardPayload>()
  for (const row of rows) {
    const key = setupChecklistRowKey(row)
    if (!key.replaceAll("|", "")) continue
    byKey.set(key, row)
  }
  return [...byKey.values()]
    .filter((row) => str(row.status || "Active").toLowerCase() !== "inactive")
    .sort(
      (a, b) =>
        setupChecklistCode(a).localeCompare(setupChecklistCode(b), undefined, {
          numeric: true,
        }) ||
        (optionalNumber(a.sequence) ?? 0) - (optionalNumber(b.sequence) ?? 0)
    )
}

function setupChecklistRowsForCode(
  rows: DashboardPayload[],
  checklistCode: unknown
) {
  const code = machineKey(checklistCode)
  return code
    ? rows.filter((row) => machineKey(setupChecklistCode(row)) === code)
    : []
}

function setupChecklistOptions(rows: DashboardPayload[]) {
  const byCode = new Map<
    string,
    { code: string; title: string; steps: number }
  >()
  for (const row of rows) {
    const code = setupChecklistCode(row)
    if (!code) continue
    const existing = byCode.get(machineKey(code))
    if (existing) existing.steps += 1
    else
      byCode.set(machineKey(code), {
        code,
        title: displayValue(
          row.checklistTitle || row.title || "Setup checklist"
        ),
        steps: 1,
      })
  }
  return [...byCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true })
  )
}

function newSetupChecklistDraft(sequence: number): SetupChecklistStepDraft {
  return {
    draftId: `setup-checklist-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sequence: String(sequence),
    checkPoint: "",
    inputType: "checkbox",
    required: "Yes",
    section: "Pre setting",
    remark: "",
  }
}

function setupChecklistDraftFromRow(
  row: DashboardPayload
): SetupChecklistStepDraft {
  return {
    draftId:
      setupChecklistRowKey(row) ||
      `setup-checklist-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    persisted: true,
    sequence:
      displayValue(row.sequence) !== "-" ? displayValue(row.sequence) : "",
    checkPoint: str(row.checkPoint),
    inputType: str(row.inputType || "checkbox"),
    required: str(row.required || "Yes"),
    section: str(row.section || "Pre setting / setting"),
    remark: str(row.remark),
  }
}

function setupChecklistPayload(
  draft: SetupChecklistStepDraft,
  checklistCode: string,
  checklistTitle: string,
  effectiveFrom: string,
  status: string
): DashboardPayload {
  return {
    checklistCode,
    checklistTitle,
    version: checklistCode,
    title: checklistTitle,
    sequence: optionalNumber(draft.sequence) ?? str(draft.sequence),
    checkPoint: str(draft.checkPoint),
    inputType: str(draft.inputType || "checkbox"),
    required: str(draft.required || "Yes"),
    section: str(draft.section || "Pre setting / setting"),
    effectiveFrom,
    status,
    remark: str(draft.remark),
  }
}
function maintenanceMasterRowsFromDataEntry(
  dataEntry: DashboardPayload | undefined
) {
  return asArray(asRecord(dataEntry).maintenanceMasterRows).filter(
    (row) => displayValue(row.maintenanceCode || row.code) !== "-"
  )
}

function maintenanceMasterKey(row: DashboardPayload) {
  return machineKey(row.maintenanceCode || row.code)
}

function nextMaintenanceMasterCode(rows: DashboardPayload[]) {
  const max = rows.reduce((highest, row) => {
    const code = displayValue(row.maintenanceCode || row.code)
    const match = /^MM(\d+)$/i.exec(code)
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `MM${String(max + 1).padStart(3, "0")}`
}
function maintenanceScheduleFields(): LegacyField[] {
  return [
    { name: "maintenanceCode", label: "Maintenance Code", required: true },
    {
      name: "maintenanceTitle",
      label: "Maintenance Schedule Title",
      required: true,
    },
    { name: "checklistCode", label: "Checklist Code" },
    {
      name: "frequencyDays",
      label: "Frequency Days",
      type: "number",
      min: "1",
      required: true,
    },
    {
      name: "firstDueDate",
      label: "First Due Date",
      type: "date",
      required: true,
    },
    {
      name: "estimatedMinutes",
      label: "Estimated Minutes",
      type: "number",
      min: "0",
    },
    { name: "status", label: "Status" },
    { name: "remark", label: "Remark" },
  ]
}

function activeMaintenanceMasterRows(rows: DashboardPayload[]) {
  return rows
    .filter((row) => str(row.status || "Active").toLowerCase() !== "inactive")
    .sort(
      (a, b) =>
        displayValue(a.maintenanceTitle).localeCompare(
          displayValue(b.maintenanceTitle),
          undefined,
          { numeric: true }
        ) ||
        displayValue(a.maintenanceCode).localeCompare(
          displayValue(b.maintenanceCode),
          undefined,
          { numeric: true }
        )
    )
}
function maintenanceChecklistMasterRowsFromDataEntry(
  dataEntry: DashboardPayload | undefined
) {
  const rows = [
    ...asArray(asRecord(dataEntry).maintenanceChecklistMasterRows),
    ...asArray(asRecord(dataEntry).rows),
    ...asArray(asRecord(dataEntry).templates),
  ]
  return rows.filter(
    (row) =>
      str(row.entryType) === "maintenance_checklist_master" ||
      displayValue(row.checklistCode) !== "-"
  )
}

function nextMaintenanceChecklistCode(rows: DashboardPayload[]) {
  const max = rows.reduce((highest, row) => {
    const code = displayValue(row.checklistCode)
    const match = /^MC(\d+)$/i.exec(code)
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `MC${String(max + 1).padStart(3, "0")}`
}

function newMaintenanceChecklistDraft(
  sequence: number
): MaintenanceChecklistStepDraft {
  return {
    draftId: `maintenance-checklist-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sequence: String(sequence),
    stepDescription: "",
    inputType: "checkbox",
    remark: "",
  }
}

function maintenanceChecklistDraftFromRow(
  row: DashboardPayload
): MaintenanceChecklistStepDraft {
  return {
    draftId:
      maintenanceChecklistStepKey(row) ||
      `maintenance-checklist-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    persisted: true,
    sequence:
      displayValue(row.sequence) !== "-" ? displayValue(row.sequence) : "",
    stepDescription: str(row.stepDescription),
    inputType: str(row.inputType || "checkbox"),
    remark: str(row.remark),
  }
}

function maintenanceChecklistPayload(
  draft: MaintenanceChecklistStepDraft | DashboardPayload,
  checklistCode: string,
  checklistTitle: string,
  status: string
): DashboardPayload {
  const payload: DashboardPayload = {
    checklistCode,
    checklistTitle,
    sequence: optionalNumber(draft.sequence) ?? str(draft.sequence),
    stepDescription: str(draft.stepDescription),
    inputType: str(draft.inputType || "checkbox"),
    remark: str(draft.remark),
  }
  if (status.toLowerCase() === "inactive") payload.status = status
  return payload
}

function mergeMaintenanceChecklistRows(rows: DashboardPayload[]) {
  const byKey = new Map<string, DashboardPayload>()
  for (const row of rows) {
    const key = maintenanceChecklistStepKey(row)
    if (!key.replaceAll("|", "")) continue
    byKey.set(key, row)
  }
  return activeMaintenanceChecklistRows([...byKey.values()])
}
function maintenanceChecklistMasterDefaults(returnTab = "maintenanceTab") {
  return {
    checklistCode: "",
    checklistTitle: "Preventive maintenance",
    sequence: "1",
    stepDescription: "",
    inputType: "checkbox",
    __returnTab: returnTab,
  }
}

function activeMaintenanceChecklistRows(rows: DashboardPayload[]) {
  return rows
    .filter((row) => str(row.status || "Active").toLowerCase() !== "inactive")
    .sort(
      (a, b) =>
        displayValue(a.checklistCode).localeCompare(
          displayValue(b.checklistCode),
          undefined,
          { numeric: true }
        ) ||
        (optionalNumber(a.sequence) ?? 0) - (optionalNumber(b.sequence) ?? 0) ||
        displayValue(a.stepDescription).localeCompare(
          displayValue(b.stepDescription),
          undefined,
          { numeric: true }
        )
    )
}

function maintenanceChecklistOptions(rows: DashboardPayload[]) {
  const byCode = new Map<
    string,
    { code: string; title: string; steps: number }
  >()
  for (const row of rows) {
    const code = displayValue(row.checklistCode)
    if (code === "-") continue
    const existing = byCode.get(machineKey(code))
    if (existing) {
      existing.steps += 1
    } else {
      byCode.set(machineKey(code), {
        code,
        title: displayValue(row.checklistTitle),
        steps: 1,
      })
    }
  }
  return [...byCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true })
  )
}

function maintenanceChecklistRowsForCode(
  rows: DashboardPayload[],
  checklistCode: unknown
) {
  const code = machineKey(checklistCode)
  if (!code) return []
  return rows.filter((row) => machineKey(row.checklistCode) === code)
}

function maintenanceChecklistTitle(
  rows: DashboardPayload[],
  checklistCode: unknown
) {
  const checklistRow = maintenanceChecklistRowsForCode(rows, checklistCode)[0]
  return displayValue(checklistRow?.checklistTitle) !== "-"
    ? displayValue(checklistRow?.checklistTitle)
    : ""
}

function maintenanceChecklistStepKey(row: DashboardPayload) {
  return [row.checklistCode, row.sequence]
    .map((value) => str(value).toLowerCase())
    .join("|")
}

function maintenanceChecklistCompletionSteps(
  schedule: DashboardPayload,
  checklistRows: DashboardPayload[]
) {
  const rows = maintenanceChecklistRowsForCode(
    checklistRows,
    schedule.checklistCode
  )
  return rows.map((row) => {
    const inputType = str(row.inputType || "checkbox").toLowerCase()
    const promptLabel = displayValue(row.stepDescription)
    const defaultValue = inputType === "checkbox" ? "OK" : ""
    const value = window.prompt(promptLabel, defaultValue)?.trim() ?? ""
    return {
      checklistCode: displayValue(row.checklistCode),
      checklistTitle: displayValue(row.checklistTitle),
      sequence: displayValue(row.sequence),
      stepDescription: displayValue(row.stepDescription),
      inputType: displayValue(row.inputType || "checkbox"),
      required: displayValue(row.required || "Yes"),
      value,
      result:
        inputType === "checkbox"
          ? value.toLowerCase() === "ok" || value.toLowerCase() === "yes"
            ? "OK"
            : value
          : "Recorded",
    }
  })
}

function maintenanceMachineRows(rows: DashboardPayload[]) {
  const byMachine = new Map<string, DashboardPayload>()
  for (const row of rows) {
    const machineNo = displayValue(
      row.machineNo ||
        row.machine ||
        row["MACHINE NO"] ||
        row["M/C NO"] ||
        row["MACHINE NO."]
    )
    if (machineNo === "-") continue
    if (str(row.status || "Active").toLowerCase() === "inactive") continue
    const key = machineKey(machineNo)
    if (byMachine.has(key)) continue
    byMachine.set(key, {
      ...row,
      machineNo,
      machineFamily: displayValue(row.machineFamily || row["MACHINE FAMILY"]),
      machineType: displayValue(row.machineType || row["MACHINE TYPE"]),
      machineName: displayValue(row.machineName || row["MACHINE NAME"]),
      location: displayValue(
        row.location || row["MACHINE LOCATION"] || row["LOCATION"]
      ),
    })
  }
  return [...byMachine.values()].sort((a, b) =>
    displayValue(a.machineNo).localeCompare(
      displayValue(b.machineNo),
      undefined,
      { numeric: true }
    )
  )
}

function machineProductionUnitLabel(row: DashboardPayload) {
  const floorCode = normalizeProductionFloorCode(row.productionFloorCode)
  return (
    productionFloors.find((floor) => floor.code === floorCode)?.label ??
    floorCode
  )
}

function maintenanceScheduleKey(row: DashboardPayload) {
  return [row.machineNo || row.machine, row.maintenanceCode]
    .map((value) => str(value).toLowerCase())
    .join("|")
}

function maintenanceTaskId(row: DashboardPayload, completedDate: string) {
  return [
    "planned",
    row.machineNo || row.machine,
    row.maintenanceCode,
    completedDate,
  ]
    .map((value) => str(value).toLowerCase())
    .join("|")
}

function breakdownMaintenanceTaskId(machineNo: unknown, completedDate: string) {
  return ["breakdown", machineNo, completedDate, Date.now()]
    .map((value) => str(value).toLowerCase())
    .join("|")
}

function maintenanceRecordKey(row: DashboardPayload) {
  return (
    str(row.taskId) ||
    [
      row.maintenanceType || "Planned",
      row.machineNo || row.machine,
      row.maintenanceCode,
      row.completedDate,
      row.completedAt,
    ]
      .map((value) => str(value).toLowerCase())
      .join("|")
  )
}

function maintenanceSchedulesForMachine(
  rows: DashboardPayload[],
  machineNo: unknown
) {
  const key = machineKey(machineNo)
  return rows
    .filter((row) => machineKey(row.machineNo || row.machine) === key)
    .sort((a, b) =>
      displayValue(a.maintenanceCode).localeCompare(
        displayValue(b.maintenanceCode),
        undefined,
        { numeric: true }
      )
    )
}

function maintenanceHistoryRowsForMachine(
  rows: DashboardPayload[],
  machineNo: unknown
) {
  const key = machineKey(machineNo)
  return rows
    .filter((row) => machineKey(row.machineNo || row.machine) === key)
    .sort(
      (a, b) =>
        dateSortValue(isoDateValue(b.completedDate || b.completedAt)) -
        dateSortValue(isoDateValue(a.completedDate || a.completedAt))
    )
}

function maintenanceHistoryMatches(
  row: DashboardPayload,
  query: string,
  typeFilter: string,
  codeFilter: string,
  resultFilter: string
) {
  const type = displayValue(row.maintenanceType || "Planned")
  const code = displayValue(row.maintenanceCode)
  const result = displayValue(row.result)
  const haystack = [
    row.machineNo,
    type,
    code,
    row.maintenanceTitle,
    row.completedDate,
    row.completedBy,
    row.partsChanged,
    row.workDone,
    row.breakdownReason,
    row.remark,
  ]
    .map(str)
    .join(" ")
    .toLowerCase()
  const queryMatch = !str(query) || haystack.includes(str(query).toLowerCase())
  return (
    queryMatch &&
    typedFilterMatches(type, typeFilter) &&
    typedFilterMatches(code, codeFilter) &&
    typedFilterMatches(result, resultFilter)
  )
}

function maintenanceDueRows(
  scheduleRows: DashboardPayload[],
  completionRows: DashboardPayload[],
  machineRows: DashboardPayload[],
  checklistRows: DashboardPayload[],
  productionRunRows: DashboardPayload[]
): DashboardPayload[] {
  const machinesByKey = new Map(
    machineRows.map((row) => [machineKey(row.machineNo), row])
  )
  const today = todayIsoDate()
  return scheduleRows
    .filter((row) => str(row.status || "Active").toLowerCase() !== "inactive")
    .map((row) => {
      const machine = machinesByKey.get(machineKey(row.machineNo))
      const latestCompletion = latestMaintenanceCompletion(row, completionRows)
      const scheduleChecklistRows = maintenanceChecklistRowsForCode(
        checklistRows,
        row.checklistCode
      )
      const lastCompletedDate = isoDateValue(
        latestCompletion?.completedDate ||
          latestCompletion?.completedAt ||
          row.lastCompletedDate
      )
      const firstDueDate = isoDateValue(
        row.firstDueDate || row.nextDueDate || today
      )
      const frequencyDays = optionalNumber(row.frequencyDays) ?? 0
      const frequencyBasis = maintenanceFrequencyBasis(row)
      const dueInfo =
        frequencyBasis === "running"
          ? runningMaintenanceDueInfo(
              row,
              productionRunRows,
              lastCompletedDate || firstDueDate,
              frequencyDays,
              today
            )
          : calendarMaintenanceDueInfo(
              latestCompletion,
              lastCompletedDate,
              firstDueDate,
              frequencyDays,
              today
            )
      return {
        ...row,
        machineType: displayValue(row.machineType || machine?.machineType),
        machineName: displayValue(row.machineName || machine?.machineName),
        location: displayValue(row.location || machine?.location),
        checklistTitle:
          displayValue(row.checklistTitle) !== "-"
            ? displayValue(row.checklistTitle)
            : maintenanceChecklistTitle(checklistRows, row.checklistCode),
        checklistSteps: scheduleChecklistRows,
        frequencyDays,
        frequencyBasis,
        nextDueDate: dueInfo.nextDueDate,
        dueProgress: dueInfo.dueProgress,
        runningDaysSinceMaintenance: dueInfo.runningDaysSinceMaintenance,
        runningDaysRemaining: dueInfo.runningDaysRemaining,
        lastCompletedDate,
        status: dueInfo.status,
      } as DashboardPayload
    })
    .sort(
      (a, b) =>
        maintenanceStatusRank(a.status) - maintenanceStatusRank(b.status) ||
        dateSortValue(a.nextDueDate) - dateSortValue(b.nextDueDate) ||
        displayValue(a.machineNo).localeCompare(
          displayValue(b.machineNo),
          undefined,
          { numeric: true }
        ) ||
        displayValue(a.maintenanceCode).localeCompare(
          displayValue(b.maintenanceCode),
          undefined,
          { numeric: true }
        )
    )
}

function calendarMaintenanceDueInfo(
  latestCompletion: DashboardPayload | undefined,
  lastCompletedDate: string,
  firstDueDate: string,
  frequencyDays: number,
  today: string
) {
  const nextDueDate =
    isoDateValue(latestCompletion?.nextDueDate) ||
    (lastCompletedDate && frequencyDays > 0
      ? addIsoDays(lastCompletedDate, frequencyDays)
      : firstDueDate)
  const status = !nextDueDate
    ? "Unscheduled"
    : nextDueDate < today
      ? "Overdue"
      : nextDueDate === today
        ? "Due today"
        : "Upcoming"
  return {
    nextDueDate,
    status,
    dueProgress: "",
    runningDaysSinceMaintenance: 0,
    runningDaysRemaining: 0,
  }
}

function runningMaintenanceDueInfo(
  schedule: DashboardPayload,
  productionRunRows: DashboardPayload[],
  startDate: string,
  frequencyDays: number,
  today: string
) {
  if (!frequencyDays)
    return {
      nextDueDate: "",
      status: "Unscheduled",
      dueProgress: "",
      runningDaysSinceMaintenance: 0,
      runningDaysRemaining: 0,
    }
  const runningDates = runningDatesForMachine(
    productionRunRows,
    schedule.machineNo,
    startDate,
    today
  )
  const runningDaysSinceMaintenance = runningDates.length
  const runningDaysRemaining = Math.max(
    frequencyDays - runningDaysSinceMaintenance,
    0
  )
  const dueDate = runningDates[frequencyDays - 1] || ""
  const status =
    runningDaysSinceMaintenance >= frequencyDays
      ? dueDate && dueDate < today
        ? "Overdue"
        : "Due today"
      : "Upcoming"
  return {
    nextDueDate: dueDate || `After ${runningDaysRemaining} running days`,
    status,
    dueProgress: `${runningDaysSinceMaintenance}/${frequencyDays} running days`,
    runningDaysSinceMaintenance,
    runningDaysRemaining,
  }
}

function runningDatesForMachine(
  rows: DashboardPayload[],
  machineNo: unknown,
  startDate: string,
  today: string
) {
  const machine = machineKey(machineNo)
  const dates = new Set<string>()
  for (const row of rows) {
    if (machineKey(row.machine || row.machineNo) !== machine) continue
    const date = isoDateValue(row.prodDate || row.productionDate || row.date)
    if (!date || date <= startDate || date > today) continue
    dates.add(date)
  }
  return [...dates].sort()
}

function maintenanceFrequencyBasis(row: DashboardPayload | undefined) {
  const value = str(
    row?.frequencyBasis || row?.frequencyType || row?.frequencyMode
  ).toLowerCase()
  return value.includes("running") ? "running" : "calendar"
}

function maintenanceFrequencyLabel(row: DashboardPayload | undefined) {
  const days = formatNumber(optionalNumber(row?.frequencyDays) ?? 0)
  return maintenanceFrequencyBasis(row) === "running"
    ? `${days} running days`
    : `${days} calendar days`
}
function latestMaintenanceCompletion(
  schedule: DashboardPayload,
  completionRows: DashboardPayload[]
) {
  return completionRows
    .filter(
      (row) => maintenanceScheduleKey(row) === maintenanceScheduleKey(schedule)
    )
    .sort(
      (a, b) =>
        dateSortValue(isoDateValue(b.completedDate || b.completedAt)) -
        dateSortValue(isoDateValue(a.completedDate || a.completedAt))
    )[0]
}

function maintenanceStatusRank(status: unknown) {
  const value = str(status).toLowerCase()
  if (value.includes("overdue")) return 0
  if (value.includes("due")) return 1
  if (value.includes("unscheduled")) return 2
  return 3
}

function todayIsoDate() {
  return istDateValue()
}

function addIsoDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return ""
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function isoDateValue(value: unknown) {
  const text = str(value)
  if (!text || text === "-") return ""
  const isoMatch = text.match(/^\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? "" : istDateValue(parsed)
}
function omitRecordKey<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

function productionCardMatchesSelection(
  card: DashboardPayload,
  row: DashboardPayload,
  role: RoleTaskKind,
  cardEntryKind: string,
  prodDate: string,
  shift: string
) {
  if (!sameProductionCardText(card.cardRole, role)) return false
  if (
    !sameProductionCardText(
      card.cardEntryKind || inferredProductionCardEntryKind(card),
      cardEntryKind
    )
  )
    return false
  if (!sameProductionCardText(card.prodDate, prodDate)) return false
  if (!sameProductionCardText(card.shift, shift)) return false
  if (!sameProductionCardText(card.machine, displayValue(row.machine)))
    return false
  if (!sameProductionCardText(card.partCode || card.partNo, itemCode(row)))
    return false
  if (!sameProductionCardText(card.jobCard || card.jcNo, jobCardNumber(row)))
    return false
  return sameProductionCardText(card.setupNo, displayValue(row.setupNo))
}

function inferredProductionCardEntryKind(card: DashboardPayload) {
  if (optionalText(card.rejectionReasonCode) || optionalNumber(card.rejectQty))
    return "rejection"
  if (optionalText(card.downtimeCode) || optionalNumber(card.downtimeMinutes))
    return "downtime"
  if (optionalText(card.bulkDowntime)) return "bulk_downtime"
  return "production"
}

function sameProductionCardText(left: unknown, right: unknown) {
  return str(left).toLowerCase() === str(right).toLowerCase()
}
function productionCycleSeconds(row: DashboardPayload) {
  return (
    (optionalNumber(row.cycleTime) ?? 0) +
    (optionalNumber(row.loadingUnloading) ?? 0)
  )
}

function time24Input(value: string) {
  return value.replace(/[^0-9:]/g, "").slice(0, 5)
}

function productionCardRuntimeMinutes(
  prodDate: string,
  startTime: string,
  endTime: string
) {
  if (!prodDate || !startTime || !endTime) return 0
  const start = new Date(`${prodDate}T${startTime}:00`)
  let end = new Date(`${prodDate}T${endTime}:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  return Math.max(Math.round((end.getTime() - start.getTime()) / 60000), 0)
}

function storedSetupChecklistSessionKey(sessionId: string) {
  return `mrmpl:setup-checklist:fresh-2026-08-11:${sessionId}`
}

function readStoredFirstPieceInspectionTasks() {
  if (typeof window === "undefined") return []
  return readFirstPieceInspectionTasksFromStorage(window.localStorage).filter(
    (task) =>
      Boolean(shopFloorPlanKey(task)) &&
      normalizeProductionFloorCode(task.productionFloorCode) ===
        productionFloorFromLocation()
  )
}

function writeStoredFirstPieceInspectionTasks(tasks: DashboardPayload[]) {
  if (typeof window === "undefined") return
  const activeFloor = productionFloorFromLocation()
  const otherFloorTasks = readFirstPieceInspectionTasksFromStorage(
    window.localStorage
  ).filter(
    (task) =>
      normalizeProductionFloorCode(task.productionFloorCode) !== activeFloor
  )
  writeFirstPieceInspectionTasksToStorage(window.localStorage, [
    ...otherFloorTasks,
    ...tasks,
  ])
}

function mergeFirstPieceInspectionTasks(...taskGroups: DashboardPayload[][]) {
  return mergeStoredFirstPieceInspectionTasks(shopFloorPlanKey, ...taskGroups)
}

function readStoredFirstPieceInspectionDraft(
  reportId: string
): FirstPieceInspectionDraft | undefined {
  if (typeof window === "undefined" || !reportId) return undefined
  return readFirstPieceInspectionDraftFromStorage(window.localStorage, reportId)
}

function writeStoredFirstPieceInspectionDraft(
  reportId: string,
  draft: FirstPieceInspectionDraft
) {
  if (typeof window === "undefined" || !reportId) return
  writeFirstPieceInspectionDraftToStorage(window.localStorage, reportId, draft)
}

function removeStoredFirstPieceInspectionDraft(reportId: string) {
  if (typeof window === "undefined" || !reportId) return
  removeFirstPieceInspectionDraftFromStorage(window.localStorage, reportId)
}

function readStoredSetupChecklistSession(sessionId: string) {
  if (typeof window === "undefined" || !sessionId) return undefined
  try {
    const stored = asRecord(
      JSON.parse(
        window.localStorage.getItem(
          storedSetupChecklistSessionKey(sessionId)
        ) || "null"
      )
    )
    return str(stored.sessionId) ? stored : undefined
  } catch {
    return undefined
  }
}

function writeStoredSetupChecklistSession(session: DashboardPayload) {
  const sessionId = str(session.sessionId)
  if (typeof window === "undefined" || !sessionId) return
  window.localStorage.setItem(
    storedSetupChecklistSessionKey(sessionId),
    JSON.stringify(session)
  )
}
function setupChecklistPageHref(
  row: DashboardPayload,
  phase: string,
  doneBy = ""
) {
  const params = new URLSearchParams({
    sessionId: setupChecklistSessionId(row),
    phase,
    jcNo: jobCardNumber(row),
    partCode: itemCode(row),
    optionNumber: displayValue(row.optionNumber),
    setupNo: displayValue(row.setupNo),
    setupName: displayValue(row.setupName),
    machine: displayValue(row.machine),
    machineType: displayValue(row.machineType),
    doneBy,
    floor: normalizeProductionFloorCode(
      row.productionFloorCode ?? productionFloorFromLocation()
    ),
    returnTab: "machinistTasksTab",
  })
  return `/dashboard/setup-checklist?${params.toString()}`
}

function setupChecklistSessionId(row: DashboardPayload) {
  return [
    jobCardNumber(row),
    itemCode(row),
    displayValue(row.optionNumber),
    displayValue(row.setupNo),
    displayValue(row.machine),
  ]
    .map((value) => str(value).toLowerCase())
    .join("|")
}

function setupChecklistSessionPayload(
  row: DashboardPayload,
  session: DashboardPayload
) {
  return {
    jcNo: jobCardNumber(row),
    partCode: itemCode(row),
    optionNumber: displayValue(row.optionNumber),
    setupNo: displayValue(row.setupNo),
    setupName: displayValue(row.setupName),
    machine: displayValue(row.machine),
    machineType: displayValue(row.machineType),
    productionFloorCode: normalizeProductionFloorCode(
      row.productionFloorCode ?? productionFloorFromLocation()
    ),
    sessionId: setupChecklistSessionId(row),
    ...session,
  }
}

function setupChecklistSessionForRow(
  sessions: DashboardPayload[],
  row: DashboardPayload
) {
  const sessionId = setupChecklistSessionId(row)
  return (
    sessions.find((session) => str(session.sessionId) === sessionId) ??
    sessions.find((session) => setupChecklistSessionId(session) === sessionId)
  )
}

function mostCompleteSetupChecklistSession(
  snapshotSession: DashboardPayload | undefined,
  localSession: DashboardPayload | undefined,
  stageId: string | undefined
) {
  const phase =
    stageId === "presetting" ? "start" : stageId === "setting" ? "end" : ""
  if (!phase) return snapshotSession ?? localSession
  if (
    localSession &&
    setupChecklistValuesComplete(
      setupChecklistItemsForPhase(asArray(localSession.items), phase),
      {},
      phase
    )
  )
    return localSession
  return snapshotSession ?? localSession
}
function activeSetupChecklistMasterRows(rows: DashboardPayload[]) {
  const activeRows = rows.filter(
    (row) => str(row.status || "Active").toLowerCase() !== "inactive"
  )
  const latestChecklistCode = activeRows
    .map((row) => setupChecklistCode(row))
    .sort(
      (a, b) =>
        Number(/^SC\d+$/i.test(a)) - Number(/^SC\d+$/i.test(b)) ||
        a.localeCompare(b, undefined, { numeric: true })
    )
    .at(-1)
  return activeRows
    .filter((row) => setupChecklistCode(row) === latestChecklistCode)
    .sort(
      (a, b) =>
        (optionalNumber(a.sequence) ?? 0) - (optionalNumber(b.sequence) ?? 0)
    )
}

function setupChecklistItemsFromMaster(rows: DashboardPayload[]) {
  return rows.map((row, index) => ({
    checklistCode: setupChecklistCode(row),
    checklistTitle: displayValue(
      row.checklistTitle || row.title || "Setup checklist"
    ),
    version: setupChecklistCode(row),
    sequence: optionalNumber(row.sequence) ?? index + 1,
    checkPoint: displayValue(row.checkPoint),
    inputType: displayValue(row.inputType || "checkbox"),
    required: displayValue(row.required || "Yes"),
    section: displayValue(row.section || "Pre setting / setting"),
    masterCreatedAt: displayValue(row.createdAt),
  }))
}

function setupChecklistItemKey(item: DashboardPayload, fallbackIndex = 0) {
  return [
    item.checklistCode || item.version,
    item.sequence ?? fallbackIndex + 1,
    item.checkPoint,
  ]
    .map((value) => str(value).toLowerCase())
    .join("|")
}

function setupChecklistItemRequired(item: DashboardPayload) {
  return str(item.required || "Yes").toLowerCase() !== "no"
}

function setupChecklistExistingValue(item: DashboardPayload, phase: string) {
  return displayValue(phase === "start" ? item.startValue : item.endValue) ===
    "-"
    ? ""
    : displayValue(phase === "start" ? item.startValue : item.endValue)
}

function setupChecklistExistingItemRemark(
  item: DashboardPayload,
  phase: string
) {
  return str(phase === "start" ? item.startItemRemark : item.endItemRemark)
}

function setupChecklistItemsForPhase(items: DashboardPayload[], phase: string) {
  const normalizedPhase = phase === "end" ? "end" : "start"
  return items.filter((item) =>
    setupChecklistItemAppliesToPhase(item.section, normalizedPhase)
  )
}

function setupChecklistValuesComplete(
  items: DashboardPayload[],
  values: Record<string, string>,
  phase: string
) {
  if (!items.length) return false
  return items.every((item, index) => {
    if (!setupChecklistItemRequired(item)) return true
    const value =
      values[setupChecklistItemKey(item, index)] ??
      setupChecklistExistingValue(item, phase)
    return Boolean(str(value))
  })
}

function setupChecklistSessionForStage({
  row,
  phase,
  values,
  itemRemarks,
  items,
  masterRows,
  existingSession,
  doneBy,
  remark,
  completedAt,
}: {
  row: DashboardPayload
  phase: string
  values: Record<string, string>
  itemRemarks: Record<string, string>
  items: DashboardPayload[]
  masterRows: DashboardPayload[]
  existingSession?: DashboardPayload
  doneBy: string
  remark: string
  completedAt: string
}) {
  const masterVersion = str(
    existingSession?.masterVersion ||
      items[0]?.version ||
      masterRows[0]?.version ||
      "1"
  )
  const sessionItems = items.map((item, index) => {
    if (
      !setupChecklistItemAppliesToPhase(
        item.section,
        phase === "end" ? "end" : "start"
      )
    )
      return item
    const itemKey = setupChecklistItemKey(item, index)
    const value = values[itemKey] ?? setupChecklistExistingValue(item, phase)
    const itemRemark =
      itemRemarks[itemKey] ?? setupChecklistExistingItemRemark(item, phase)
    return phase === "start"
      ? { ...item, startValue: value, startItemRemark: itemRemark }
      : { ...item, endValue: value, endItemRemark: itemRemark }
  })
  return {
    ...(existingSession ?? {}),
    sessionId: setupChecklistSessionId(row),
    masterVersion,
    masterEffectiveFrom: displayValue(
      masterRows[0]?.effectiveFrom || existingSession?.masterEffectiveFrom
    ),
    status: phase === "start" ? "In progress" : "Completed",
    startedAt: phase === "start" ? completedAt : existingSession?.startedAt,
    startedBy: phase === "start" ? doneBy : existingSession?.startedBy,
    startRemark: phase === "start" ? remark : existingSession?.startRemark,
    endedAt: phase === "end" ? completedAt : existingSession?.endedAt,
    endedBy: phase === "end" ? doneBy : existingSession?.endedBy,
    endRemark: phase === "end" ? remark : existingSession?.endRemark,
    items: sessionItems,
  }
}

function setupChecklistMasterDefaults() {
  return {
    checklistCode: "",
    checklistTitle: "",
    sequence: "",
    checkPoint: "",
    inputType: "checkbox",
    required: "Yes",
    section: "Pre setting",
    effectiveFrom: istDateValue(),
    status: "Active",
  }
}
function firstPieceMasterDefaults(row: DashboardPayload) {
  return {
    partNo: itemCode(row) !== "-" ? itemCode(row) : "",
    optionNumber:
      displayValue(row.optionNumber) !== "-"
        ? displayValue(row.optionNumber)
        : "",
    setupNo: displayValue(row.setupNo) !== "-" ? displayValue(row.setupNo) : "",
    parameterName: "",
    instrumentUsed: "",
    specification: "",
    tolerancePlus: "",
    toleranceMinus: "",
    inputType: "number",
    __returnTab: "firstPieceInspectionTab",
  }
}

function matchingFirstPieceInspectionMasters(
  masters: DashboardPayload[],
  row: DashboardPayload
) {
  const sharedRows = sortQualityParameterRows(
    masters.filter((master) => qualityParameterMatchesSetup(master, row))
  )
  if (sharedRows.length) return sharedRows
  const part = machineKey(itemCode(row))
  const jcNo = machineKey(jobCardNumber(row))
  const option = machineKey(row.optionNumber)
  const setup = machineKey(row.setupNo)
  return masters
    .filter((master) => {
      const masterJcNo = machineKey(
        master.jcNo || master.jobCard || master.jobCardNumber
      )
      const masterPart = machineKey(
        master.uid || master.partNo || master.partCode
      )
      return (
        !qualityParameterCode(master) &&
        (!masterJcNo || masterJcNo === jcNo) &&
        masterPart === part &&
        machineKey(master.optionNumber) === option &&
        machineKey(master.setupNo) === setup
      )
    })
    .sort(
      (a, b) =>
        displayValue(a.uid).localeCompare(displayValue(b.uid), undefined, {
          numeric: true,
        }) ||
        displayValue(a.description).localeCompare(
          displayValue(b.description),
          undefined,
          { numeric: true }
        )
    )
}

function firstPieceMasterKey(master: DashboardPayload) {
  return [
    master._id,
    master.jcNo || master.jobCard || master.jobCardNumber,
    master.partNo || master.partCode || master.uid,
    master.optionNumber,
    master.setupNo,
    qualityParameterCode(master) || master.uid,
    qualityParameterName(master) || master.description,
  ]
    .map((value) => str(value).toLowerCase())
    .filter(Boolean)
    .join("|")
}

function firstPieceReportKey(row: DashboardPayload) {
  return [
    jobCardNumber(row),
    itemCode(row),
    displayValue(row.optionNumber),
    displayValue(row.setupNo),
    displayValue(row.machine),
    "fpi",
  ]
    .map((value) => str(value).toLowerCase())
    .join("|")
}

function firstPieceReadingsFor(
  readings: Record<string, string[]>,
  master: DashboardPayload
) {
  return (
    readings[firstPieceMasterKey(master)] ?? Array.from({ length: 5 }, () => "")
  )
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map(str).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  )
}

function numValue(row: DashboardPayload, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key])
    if (Number.isFinite(value)) return value
  }
  return 0
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
  ]
  const seen = new Set<string>()

  for (const key of priority) {
    if (rows.some((row) => row[key] !== undefined && row[key] !== "")) {
      seen.add(key)
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "_id" || key === "_creationTime" || key === "ownerId")
        continue
      seen.add(key)
      if (seen.size >= 12) return [...seen]
    }
  }

  return [...seen]
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-"
  if (Array.isArray(value)) return value.map(formatCell).join(", ") || "-"
  if (typeof value === "number") return formatNumber(value)
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "string") {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? formatDate(value) : value
  }
  return JSON.stringify(value)
}
