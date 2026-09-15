"use client"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentEmploymentLetterRow,
  RecruitmentJobRow,
  RecruitmentPostRow,
  RecruitmentTemplateRow,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Dialog, DialogClose, DialogFooter } from "@workspace/ui/components/dialog"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"
import { useExcelTable } from "@workspace/ui/hooks/use-excel-table"
import {
  BriefcaseBusiness,
  FileText,
  FilterX,
  Pencil,
  Trash2,
  UserRoundCog,
} from "lucide-react"
import { useRef, useState } from "react"
import { useFormStatus } from "react-dom"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import {
  assignEmployeeAction,
  createJobAction,
  deletePostAction,
  updatePostAction,
} from "@/app/hr/actions"
import { APPROVED_POST_FILTER_COLUMNS } from "@/components/hr/approved-post-filter-columns"
import { SingleEmployeeAssignmentFields } from "@/components/hr/single-employee-assignment-fields"
import { EmployeeLetterDialog } from "@/components/hr/employee-letter-dialog"
import { MetricSummary, StandardDialogContent } from "@/components/ui/golden-patterns"
import { employeeHandoverRows } from "@/lib/employee-handover-rows"

type TemplateOption = Pick<
  RecruitmentTemplateRow,
  "id" | "name" | "templateCode" | "combinedRoleId"
>

function PostStatusBadge({ status }: { status: string }) {
  const variant =
    status === "Vacant" || status === "Occupied"
      ? "default"
      : status === "Resigned"
        ? "destructive"
        : status === "Appointed"
          ? "secondary"
          : "outline"
  return <Badge variant={variant}>{status}</Badge>
}

function CreateJobSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <BriefcaseBusiness data-icon="inline-start" />
      {pending ? "Creating…" : "Create Job"}
    </Button>
  )
}

export function ApprovedPostsTable({
  canWrite = false,
  canDelete = false,
  canCreateJob = false,
  combinedRoles = [],
  employeeManagement = false,
  employeeView = employeeManagement,
  employmentLetters = [],
  jobs = [],
  masterView,
  posts,
  templates = [],
}: {
  canWrite?: boolean
  canDelete?: boolean
  canCreateJob?: boolean
  combinedRoles?: RecruitmentCombinedRoleRow[]
  employeeManagement?: boolean
  employeeView?: boolean
  employmentLetters?: RecruitmentEmploymentLetterRow[]
  jobs?: RecruitmentJobRow[]
  masterView?: "dataEntry" | "masterTables"
  posts: RecruitmentPostRow[]
  templates?: TemplateOption[]
}) {
  const [editingPost, setEditingPost] = useState<RecruitmentPostRow | null>(
    null
  )
  const [selectedEmployeePost, setSelectedEmployeePost] =
    useState<RecruitmentPostRow | null>(null)
  const [employeeEditorOpen, setEmployeeEditorOpen] = useState(false)
  const [creatingJobPost, setCreatingJobPost] = useState<RecruitmentPostRow | null>(null)
  const createJobTrigger = useRef<HTMLButtonElement | null>(null)
  const openJobPostCodes = new Set(
    jobs
      .filter((job) => job.status === "Open" && job.postCode)
      .map((job) => job.postCode)
  )
  const showActions = canWrite || canDelete || canCreateJob || employeeManagement
  const columnCount = 10 + (employeeManagement ? 1 : 0) + (showActions ? 1 : 0)
  const rows = employeeView ? employeeHandoverRows(posts) : posts
  const table = useExcelTable({
    rows,
    columns: APPROVED_POST_FILTER_COLUMNS.map(({ key, label }) => ({
      key,
      label,
      values: (row: RecruitmentPostRow) => [
        key === "template"
          ? (row.requirementTemplateCode ?? "No template")
          : key === "employeeName" || key === "employeeCode"
            ? (row[key] ?? "Unassigned")
            : key === "joiningDate"
              ? (row.joiningDate ?? "Not appointed")
              : key === "lastWorkingDate"
                ? (row.lastWorkingDate ?? "Not applicable")
                : String(row[key]),
      ],
    })),
  })
  const hasFilters = table.hasFilters
  const filteredPosts = table.visibleRows
  const selectedEmployeeLetters = selectedEmployeePost
    ? employmentLetters.filter(
        (letter) =>
          letter.postId === selectedEmployeePost.id ||
          (letter.employeeCode &&
            letter.employeeCode === selectedEmployeePost.employeeCode)
      )
    : []
  const hasAppointmentLetter = selectedEmployeeLetters.some(
    (letter) => letter.letterType === "appointment" && letter.fileAvailable
  )
  const hasExperienceLetter = selectedEmployeeLetters.some(
    (letter) => letter.letterType === "experience" && letter.fileAvailable
  )

  return (
    <>
      <MetricSummary
        scope="Approved posts matching current table filters"
        items={[
          {
            label: "Approved Posts",
            value: new Set(filteredPosts.map((post) => post.postCode)).size,
            tone: "information"
          },
          {
            label: "Vacant Posts",
            value: filteredPosts.filter((post) => post.status === "Vacant")
              .length,
            tone: "warning"
          },
          {
            label: "Linked Employees",
            value: new Set(
              filteredPosts.flatMap((post) =>
                post.employeeCode ? [post.employeeCode] : []
              )
            ).size,
            description: "Distinct Employee IDs across these posts",
            tone: "positive"
          }
        ]}
      />
      <Sheet
        onOpenChange={(open) => {
          if (!open) setEditingPost(null)
        }}
        open={editingPost !== null}
      >
 <SectionCard>
          <CardHeader>
            <div className="space-y-1.5">
              <CardTitle>
                {employeeView ? "Employee Master" : "Approved Posts"}
              </CardTitle>
              <CardDescription>
                {employeeView ? `${filteredPosts.length} of ${rows.length} employee assignment rows` : hasFilters
                  ? `Showing ${filteredPosts.length} of ${posts.length} sanctioned staffing positions`
                  : `${posts.length} sanctioned staffing positions`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex min-h-8 items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                {employeeManagement ? (
                  <Button
                    disabled={!selectedEmployeePost}
                    onClick={() => setEmployeeEditorOpen(true)}
                    size="sm"
                    type="button"
                  >
                    <UserRoundCog data-icon="inline-start" />
                    Update Selected Employee
                  </Button>
                ) : null}
                <Button
                  disabled={!hasFilters}
                  onClick={table.clearFilters}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <FilterX data-icon="inline-start" />
                  Clear All Filters
                </Button>
              </div>
            </div>
            <div className="rounded-lg border min-w-0">
 <OperationalTable>
                <TableHeader>
                  <TableRow>
                    {employeeManagement ? <TableHead>Select</TableHead> : null}
                    <TableHead>Post Code</TableHead>
                    <TableHead>Vacancy Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Joining Date</TableHead>
                    <TableHead>Last Working Date</TableHead>
                    <TableHead>Status</TableHead>
                    {showActions ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    {employeeManagement ? <TableHead /> : null}
                    {APPROVED_POST_FILTER_COLUMNS.map((column) => (
                      <TableHead key={column.key}>
                        <ExcelColumnFilter
                          label={column.label}
                          {...table.filterProps(column.key)}
                        />
                      </TableHead>
                    ))}
                    {showActions ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPosts.length ? (
                    filteredPosts.map((row) => (
                      <TableRow key={row.id}>
                        {employeeManagement ? (
                          <TableCell>
                            <Checkbox
                              disabled={row.id.startsWith("outgoing:") || row.id.startsWith("pending:")}
                              aria-label={`Select ${row.postCode}`}
                              checked={selectedEmployeePost?.id === row.id}
                              onCheckedChange={(checked) =>
                                setSelectedEmployeePost(
                                  checked === true ? row : null
                                )
                              }
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="font-mono">
                          {row.postCode}
                        </TableCell>
                        <TableCell className="font-mono">
                          {row.vacancyCode}
                        </TableCell>
                        <TableCell>{row.department}</TableCell>
                        <TableCell>{row.designation}</TableCell>
                        <TableCell className="font-mono">
                          {row.requirementTemplateCode ?? "—"}
                        </TableCell>
                        <TableCell>
                          {row.employeeName ?? "—"}
                          {row.replacementAppointments
                            ?.filter(
                              (appointment) => appointment.status === "Pending"
                            )
                            .map((appointment) => (
                              <p
                                className="text-xs text-muted-foreground"
                                key={appointment.id}
                              >
                                Pending replacement: {appointment.employeeName}
                              </p>
                            ))}
                        </TableCell>
                        <TableCell className="font-mono">
                          {row.employeeCode ?? "—"}
                        </TableCell>
                        <TableCell>{row.joiningDate ?? "—"}</TableCell>
                        <TableCell>{row.lastWorkingDate ?? "—"}</TableCell>
                        <TableCell>
                          <PostStatusBadge status={row.status} />
                        </TableCell>
                        {showActions ? (
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {row.id.startsWith("pending:") ? <span className="text-sm text-muted-foreground">Pending joining</span> : row.id.startsWith("outgoing:") ? <span className="text-sm text-muted-foreground">Serving notice</span> : employeeManagement ? (
                                <Button
                                  onClick={() => {
                                    setSelectedEmployeePost(row)
                                    setEmployeeEditorOpen(true)
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <UserRoundCog data-icon="inline-start" />
                                  {row.joiningConfirmationDue
                                    ? "Confirm Joining"
                                    : "Employee"}
                                </Button>
                              ) : null}
                              {!row.id.startsWith("outgoing:") && !row.id.startsWith("pending:") && (canWrite || canDelete || canCreateJob) ? (
                                <>
                                  {canCreateJob && (row.status === "Vacant" ||
                                    row.status === "Resigned") &&
                                  (!row.combinedRoleId ||
                                    row.isPrimaryCombinedPost) &&
                                  !openJobPostCodes.has(row.postCode) ? (
                                      <Button size="sm" type="button" onClick={(event) => {
                                        createJobTrigger.current = event.currentTarget
                                        setCreatingJobPost(row)
                                      }}>
                                        <BriefcaseBusiness data-icon="inline-start" />
                                        Create Job
                                      </Button>
                                  ) : null}
                                  {canWrite ? <Button
                                    aria-label={`Edit ${row.postCode}`}
                                    onClick={() => setEditingPost(row)}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    <Pencil data-icon="inline-start" />
                                    Edit
                                  </Button> : null}
                                  {canDelete ? <form
                                    action={deletePostAction}
                                    onSubmit={(event) => {
                                      if (
                                        !window.confirm(
                                          `Delete approved post ${row.postCode}? This cannot be undone.`
                                        )
                                      ) {
                                        event.preventDefault()
                                      }
                                    }}
                                  >
                                    <input
                                      name="panel"
                                      type="hidden"
                                      value="approvedPostPanel"
                                    />
                                    {masterView ? (
                                      <input
                                        name="master_view"
                                        type="hidden"
                                        value={masterView}
                                      />
                                    ) : null}
                                    <input
                                      name="post_id"
                                      type="hidden"
                                      value={row.id}
                                    />
                                    <Button
                                      size="sm"
                                      type="submit"
                                      variant="destructive"
                                    >
                                      <Trash2 data-icon="inline-start" />
                                      Delete
                                    </Button>
                                  </form> : null}
                                </>
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="py-10 text-center text-muted-foreground"
                        colSpan={columnCount}
                      >
                        {posts.length
                          ? "No Approved Posts Match The Selected Filters."
                          : "No Approved Posts Found."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
 </OperationalTable>
            </div>
          </CardContent>
 </SectionCard>

        {editingPost ? (
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            <form
              action={updatePostAction}
              className="flex min-h-full flex-col"
            >
              <input name="panel" type="hidden" value="approvedPostPanel" />
              {masterView ? (
                <input name="master_view" type="hidden" value={masterView} />
              ) : null}
              <input name="post_id" type="hidden" value={editingPost.id} />
              <SheetHeader>
                <SheetTitle>Edit Approved Post</SheetTitle>
                <SheetDescription>
                  Update The Job Template Linked To {editingPost.postCode}.
                  Department And Designation Remain Locked Because They Form The
                  Software-Generated Post Code.
                </SheetDescription>
              </SheetHeader>
              <div className="grid flex-1 content-start gap-4 px-6">
                <Field>
                  <FieldLabel htmlFor="edit-post-code">Post Code</FieldLabel>
                  <Input
                    id="edit-post-code"
                    readOnly
                    value={editingPost.postCode}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-post-department">
                    Department
                  </FieldLabel>
                  <Input
                    id="edit-post-department"
                    readOnly
                    value={editingPost.department}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-post-designation">
                    Designation
                  </FieldLabel>
                  <Input
                    id="edit-post-designation"
                    readOnly
                    value={editingPost.designation}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-post-template">
                    Job Template
                  </FieldLabel>
                  <NativeSelect
                    className="w-full"
                    defaultValue={editingPost.requirementTemplateCode ?? ""}
                    id="edit-post-template"
                    name="requirement_template_code"
                  >
                    <NativeSelectOption value="">
                      No Template
                    </NativeSelectOption>
                    {templates.filter((template) => !template.combinedRoleId).map((template) => (
                      <NativeSelectOption
                        key={template.id}
                        value={template.templateCode}
                      >
                        {template.templateCode} / {template.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <SheetFooter>
                <Button type="submit">Save Changes</Button>
              </SheetFooter>
            </form>
          </SheetContent>
        ) : null}
      </Sheet>
      <Dialog open={creatingJobPost !== null} onOpenChange={(open) => {
        if (!open) setCreatingJobPost(null)
      }}>
        {creatingJobPost ? (
          <StandardDialogContent
            title="Create Job"
            description={`${creatingJobPost.postCode} · ${creatingJobPost.department} / ${creatingJobPost.designation}`}
            className="sm:max-w-md"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              createJobTrigger.current?.focus()
            }}
          >
            <form action={async (formData) => {
              await createJobAction(formData)
              setCreatingJobPost(null)
            }} className="grid gap-4">
              <input name="panel" type="hidden" value={employeeView ? "employeeMasterPanel" : "approvedPostPanel"} />
              {masterView ? <input name="master_view" type="hidden" value={masterView} /> : null}
              <input name="post_id" type="hidden" value={creatingJobPost.id} />
              <Field>
                <FieldLabel htmlFor="create-job-template">Attach a Template (optional)</FieldLabel>
                <NativeSelect id="create-job-template" name="requirement_template_code" className="w-full" defaultValue="">
                  <NativeSelectOption value="">No Template</NativeSelectOption>
                  {templates.filter((template) => !template.combinedRoleId || template.combinedRoleId === creatingJobPost.combinedRoleId).map((template) => (
                    <NativeSelectOption key={template.id} value={template.templateCode}>
                      {template.templateCode} / {template.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="create-job-target-date">Target Date</FieldLabel>
                <Input id="create-job-target-date" name="target_date" type="date" />
              </Field>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <CreateJobSubmitButton />
              </DialogFooter>
            </form>
          </StandardDialogContent>
        ) : null}
      </Dialog>
      <Sheet
        onOpenChange={setEmployeeEditorOpen}
        open={employeeEditorOpen && selectedEmployeePost !== null}
      >
        {selectedEmployeePost ? (
          <SheetContent className="!w-full overflow-y-auto sm:!w-[30rem] sm:!max-w-[30rem]">
            <SheetHeader>
              <SheetTitle>Edit Employee</SheetTitle>
              <SheetDescription>
                {selectedEmployeePost.postCode} ·{" "}
                {selectedEmployeePost.designation}
              </SheetDescription>
            </SheetHeader>
            <form
              action={assignEmployeeAction}
              className="grid gap-5 px-6 pb-2"
            >
              <input name="panel" type="hidden" value="employeeMasterPanel" />
              {employeeManagement && masterView ? (
                <>
                  <input name="master_view" type="hidden" value={masterView} />
                  <input
                    name="master_kind"
                    type="hidden"
                    value="employee-assignment"
                  />
                </>
              ) : null}
              <div className="grid gap-5">
                <SingleEmployeeAssignmentFields
                  allowIdentityCorrection
                  combinedRoles={combinedRoles}
                  initialPostId={selectedEmployeePost.id}
                  key={selectedEmployeePost.id}
                  posts={posts}
                  showTargetSelector={false}
                />
              </div>
              <SheetFooter className="px-0">
                <Button type="submit">Save Employee</Button>
              </SheetFooter>
            </form>
            <div className="grid gap-3 border-t px-6 py-5">
              <div>
                <p className="font-medium">Employment Letters</p>
                <p className="text-sm text-muted-foreground">
                  View And Download Offer, Appointment, And
                  Experience Letters Here.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedEmployeeLetters
                  .filter((letter) => letter.fileAvailable)
                  .map((letter) => (
                    <Button asChild key={letter.id} size="sm" variant="outline">
                      <AttachmentViewerLink
                        fileName={`${letter.referenceNumber}-${letter.letterType}-letter.pdf`}
                        href={`/hr/employment-letters/${letter.id}/download`}
                        mediaType="application/pdf"
                      >
                        <FileText data-icon="inline-start" />
                        {letter.letterType === "offer"
                          ? "Offer"
                          : letter.letterType === "appointment"
                            ? "Appointment"
                            : "Experience"}
                      </AttachmentViewerLink>
                    </Button>
                  ))}
                {selectedEmployeePost.status === "Occupied" &&
                !hasAppointmentLetter ? (
                  <EmployeeLetterDialog
                    post={selectedEmployeePost}
                    type="appointment"
                  />
                ) : null}
                {selectedEmployeePost.status === "Resigned" &&
                !hasExperienceLetter ? (
                  <EmployeeLetterDialog
                    post={selectedEmployeePost}
                    type="experience"
                  />
                ) : null}
              </div>
            </div>
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  )
}
