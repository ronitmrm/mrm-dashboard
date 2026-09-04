import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  Info,
  LayoutTemplate,
  Pin,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react"

import {
  ActionToolbar,
  FormGrid,
  FormSection,
  MetricSummary,
  PageHeader,
  StandardDialogContent,
  StandardDrawerContent,
  StandardState,
} from "@/components/ui/golden-patterns"
import { UiReferenceThemeToggle } from "@/components/ui/ui-reference-theme-toggle"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
  SectionCard,
  type SemanticTone,
} from "@workspace/ui/components/card"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect } from "@workspace/ui/components/native-select"
import { Sheet, SheetTrigger } from "@workspace/ui/components/sheet"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const metricVariants: Array<{
  description: string
  icon: React.ReactNode
  label: string
  tone: SemanticTone
  value: string
}> = [
  {
    description: "Default operational context",
    icon: <Boxes />,
    label: "Neutral",
    tone: "neutral",
    value: "128",
  },
  {
    description: "Reference and guidance",
    icon: <Info />,
    label: "Information",
    tone: "information",
    value: "24",
  },
  {
    description: "On track or completed",
    icon: <CheckCircle2 />,
    label: "Positive",
    tone: "positive",
    value: "96%",
  },
  {
    description: "Due or needs attention",
    icon: <Clock3 />,
    label: "Warning",
    tone: "warning",
    value: "7",
  },
  {
    description: "Overdue, error, or breakdown",
    icon: <XCircle />,
    label: "Danger",
    tone: "danger",
    value: "3",
  },
  {
    description: "Unavailable or disabled",
    icon: <Clock3 />,
    label: "Inactive",
    tone: "inactive",
    value: "N/A",
  },
  {
    description: "MRMPL-owned emphasis",
    icon: <LayoutTemplate />,
    label: "Brand",
    tone: "brand",
    value: "42",
  },
  {
    description: "Approved accent emphasis",
    icon: <Plus />,
    label: "Accent",
    tone: "accent",
    value: "12",
  },
]

export default async function UiReferencePage() {
  await requireAuthenticatedSession("/ui-reference")

  return (
    <main className="mx-auto grid w-full max-w-[100rem] gap-6 p-4 lg:p-6">
      <PageHeader
        actions={
          <>
            <UiReferenceThemeToggle />
            <Button size="sm" type="button">
              <Plus data-icon="inline-start" />
              Primary action
            </Button>
          </>
        }
        badge={<StatusBadge tone="information">Internal reference</StatusBadge>}
        description="Production components, semantic states, and interaction standards for every MRMPL dashboard module."
        icon={LayoutTemplate}
        title="Golden UI Patterns"
      />

      <MetricSummary
        scope="Example register · before table filters"
        items={[
          { label: "Records", value: 1240, tone: "information" },
          { label: "Awaiting Review", value: 12, tone: "warning" },
          { label: "Completed", value: 0, tone: "positive" },
        ]}
      />

      <SectionCard size="sm">
        <CardHeader>
          <CardTitle>Action toolbar</CardTitle>
          <CardDescription>
            Compact, responsive actions with one clear primary action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionToolbar
            aria-label="Reference actions"
            className="justify-start"
          >
            <Button size="sm" type="button" variant="outline">
              <Search data-icon="inline-start" />
              Search
            </Button>
            <Button size="sm" type="button" variant="outline">
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
            <Button size="sm" type="button">
              <Plus data-icon="inline-start" />
              Create
            </Button>
          </ActionToolbar>
        </CardContent>
      </SectionCard>

      <section aria-labelledby="metric-card-reference" className="grid gap-3">
        <div>
          <h2
            className="font-heading text-lg font-semibold"
            id="metric-card-reference"
          >
            Metric cards
          </h2>
          <p className="text-sm text-muted-foreground">
            Semantic colour always accompanies a readable label.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricVariants.map((metric) => (
            <MetricCard {...metric} key={metric.tone} />
          ))}
          <MetricCard tone="inactive" label="Loading" loading value="" />
          <MetricCard
            action={
              <Button
                aria-label="Add example KPI to My Dashboard"
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Pin />
              </Button>
            }
            description="Secondary actions use the typed action slot."
            label="Pinnable KPI"
            tone="information"
            value="24"
          />
          <MetricCard
            tone="danger"
            error="Metric data could not be loaded."
            label="Error"
            value=""
          />
        </div>
      </section>

      <SectionCard size="sm">
        <CardHeader className="border-b">
          <CardTitle>Operational table</CardTitle>
          <CardDescription>
            Searchable Excel-style filters, sorting, selected and exception
            states, sticky headers, overflow, summaries, and persisted filters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperationalTable
            filterStorageKey="mrmpl:ui-reference:operational-table"
            containerClassName="max-h-96 rounded-lg border"
          >
            <TableHeader>
              <TableRow>
                <TableHead data-filterable="true">Job Card</TableHead>
                <TableHead data-filterable="true">Production Unit</TableHead>
                <TableHead data-filterable="true">Due</TableHead>
                <TableHead data-filterable="true">Status</TableHead>
                <TableHead className="text-right" data-filterable="true">
                  Quantity
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">JC-260901</TableCell>
                <TableCell>CNC</TableCell>
                <TableCell>04 Sep 2026</TableCell>
                <TableCell data-filter-value="On track">
                  <StatusBadge tone="positive">On track</StatusBadge>
                </TableCell>
                <TableCell className="text-right" data-filter-value="1200">
                  1,200
                </TableCell>
              </TableRow>
              <TableRow data-state="selected">
                <TableCell className="font-medium">JC-260902</TableCell>
                <TableCell>Conventional-01</TableCell>
                <TableCell>03 Sep 2026</TableCell>
                <TableCell data-filter-value="Selected">
                  <StatusBadge tone="information">Selected</StatusBadge>
                </TableCell>
                <TableCell className="text-right" data-filter-value="480">
                  480
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">JC-260903</TableCell>
                <TableCell>Forging</TableCell>
                <TableCell className="bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">
                  Due today
                </TableCell>
                <TableCell data-filter-value="Attention">
                  <StatusBadge tone="warning">Attention</StatusBadge>
                </TableCell>
                <TableCell className="text-right" data-filter-value="760">
                  760
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">JC-260904</TableCell>
                <TableCell>CNC</TableCell>
                <TableCell className="bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]">
                  31 Aug 2026
                </TableCell>
                <TableCell data-filter-value="Overdue">
                  <StatusBadge tone="danger">
                    <AlertTriangle aria-hidden="true" />
                    Overdue
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-right" data-filter-value="210">
                  210
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total planned quantity</TableCell>
                <TableCell className="text-right">2,650</TableCell>
              </TableRow>
            </TableFooter>
          </OperationalTable>
        </CardContent>
      </SectionCard>

      <section aria-labelledby="state-reference" className="grid gap-3">
        <h2 className="font-heading text-lg font-semibold" id="state-reference">
          Empty, loading, and error states
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <StandardState
            description="Records will appear here when they are available."
            title="No records"
          />
          <StandardState
            description="Fetching the latest operational records."
            title="Loading records"
            variant="loading"
          />
          <StandardState
            action={
              <Button size="sm" type="button" variant="outline">
                Try again
              </Button>
            }
            description="The records could not be loaded."
            title="Table unavailable"
            variant="error"
          />
        </div>
      </section>

      <FormSection
        description="Responsive fields use shared controls, labels, help, validation, and disabled states."
        title="Operational form"
      >
        <FormGrid>
          <Field>
            <FieldLabel htmlFor="reference-job-card">Job Card</FieldLabel>
            <Input defaultValue="JC-260901" id="reference-job-card" required />
            <FieldDescription>Required production reference.</FieldDescription>
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="reference-quantity">Quantity</FieldLabel>
            <Input
              aria-invalid="true"
              defaultValue="-2"
              id="reference-quantity"
              type="number"
            />
            <FieldError>Quantity must be greater than zero.</FieldError>
          </Field>
          <Field data-disabled="true">
            <FieldLabel htmlFor="reference-unit">Production Unit</FieldLabel>
            <NativeSelect disabled id="reference-unit">
              <option>CNC</option>
            </NativeSelect>
            <FieldDescription>Locked after production starts.</FieldDescription>
          </Field>
        </FormGrid>
        <ActionToolbar className="mt-5">
          <Button size="sm" type="button" variant="outline">
            Cancel
          </Button>
          <Button size="sm" type="button">
            Save
          </Button>
        </ActionToolbar>
      </FormSection>

      <SectionCard size="sm">
        <CardHeader>
          <CardTitle>Status badges and overlays</CardTitle>
          <CardDescription>
            Dialog and drawer headers use the same title and description rhythm.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["Neutral", "neutral"],
                ["Information", "information"],
                ["Positive", "positive"],
                ["Warning", "warning"],
                ["Danger", "danger"],
                ["Inactive", "inactive"],
                ["Brand", "brand"],
                ["Accent", "accent"],
              ] as const
            ).map(([label, tone]) => (
              <StatusBadge key={tone} tone={tone}>
                {label}
              </StatusBadge>
            ))}
          </div>
          <ActionToolbar className="justify-start">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" type="button" variant="outline">
                  Open dialog
                </Button>
              </DialogTrigger>
              <StandardDialogContent
                description="Use for focused decisions that do not need persistent context."
                title="Canonical dialog"
              >
                <p className="text-sm text-muted-foreground">
                  Dialog content remains concise and task focused.
                </p>
              </StandardDialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm" type="button" variant="outline">
                  Open drawer
                </Button>
              </SheetTrigger>
              <StandardDrawerContent
                description="Use for contextual detail alongside the current workspace."
                title="Canonical drawer"
              >
                <p className="px-4 text-sm text-muted-foreground">
                  Drawer content preserves the underlying operational context.
                </p>
              </StandardDrawerContent>
            </Sheet>
          </ActionToolbar>
        </CardContent>
      </SectionCard>
    </main>
  )
}
