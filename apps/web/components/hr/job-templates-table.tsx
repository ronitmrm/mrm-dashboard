"use client"

import { useState } from "react"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentMasterSnapshot,
  RecruitmentTemplateRow,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import { useExcelTable } from "@workspace/ui/hooks/use-excel-table"
import { Textarea } from "@workspace/ui/components/textarea"
import { Trash2 } from "lucide-react"

import {
  deleteRecruitmentMasterAction,
  saveTemplateAction,
} from "@/app/hr/actions"
import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"
import { TemplateScopeFields } from "@/components/hr/template-scope-fields"

type FilterKey =
  | "code"
  | "department"
  | "designation"
  | "education"
  | "experience"
  | "name"

function JobTemplateEditor({
  combinedRoles,
  masterView,
  masters,
  panelId = "postMasterPanel",
  template,
}: {
  combinedRoles: RecruitmentCombinedRoleRow[]
  masterView?: "dataEntry" | "masterTables"
  masters: RecruitmentMasterSnapshot
  panelId?: string
  template: RecruitmentTemplateRow
}) {
  return (
    <form action={saveTemplateAction} className="flex min-h-full flex-col">
      <input name="panel" type="hidden" value={panelId} />
      {masterView ? (
        <input name="master_view" type="hidden" value={masterView} />
      ) : null}
      <input name="template_code" type="hidden" value={template.templateCode} />
      <SheetHeader>
        <SheetTitle>Edit {template.templateCode}</SheetTitle>
        <SheetDescription>
          Update The Full Job Requirement Form. The Template Code Remains Fixed.
        </SheetDescription>
      </SheetHeader>
      <div className="grid flex-1 content-start gap-4 px-6 sm:grid-cols-2">
        <Field>
          <FieldLabel>Template Code</FieldLabel>
          <Input readOnly value={template.templateCode} />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-template-name">Template Name</FieldLabel>
          <Input
            defaultValue={template.name}
            id="edit-template-name"
            name="name"
            required
          />
        </Field>
        <TemplateScopeFields
          combinedRoles={combinedRoles}
          defaultCombinedRoleId={template.combinedRoleId}
          defaultDepartmentCode={template.departmentCode}
          defaultDesignationCode={template.designationCode}
          masters={masters}
          prefix="edit-template"
        />
        <Field>
          <FieldLabel htmlFor="edit-template-gender">Gender</FieldLabel>
          <Input
            defaultValue={template.gender ?? ""}
            id="edit-template-gender"
            name="gender"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-template-education">Education</FieldLabel>
          <Input
            defaultValue={template.education ?? ""}
            id="edit-template-education"
            name="education"
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="edit-template-experience">
            Experience Requirement
          </FieldLabel>
          <Input
            defaultValue={template.experienceRequirement ?? ""}
            id="edit-template-experience"
            name="experience_requirement"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-template-minimum-salary">
            Minimum Salary
          </FieldLabel>
          <Input
            defaultValue={template.minimumSalary ?? ""}
            id="edit-template-minimum-salary"
            min="0"
            name="minimum_salary"
            type="number"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-template-maximum-salary">
            Maximum Salary
          </FieldLabel>
          <Input
            defaultValue={template.maximumSalary ?? ""}
            id="edit-template-maximum-salary"
            min="0"
            name="maximum_salary"
            type="number"
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="edit-template-responsibilities">
            Role Responsibilities
          </FieldLabel>
          <Textarea
            defaultValue={template.roleResponsibilities ?? ""}
            id="edit-template-responsibilities"
            name="role_responsibilities"
            rows={8}
          />
        </Field>
      </div>
      <SheetFooter>
        <Button type="submit">Save Template Changes</Button>
      </SheetFooter>
    </form>
  )
}

export function JobTemplatesTable({
  canWrite,
  combinedRoles,
  initialTemplateCode,
  masterView,
  masters,
  templates,
}: {
  canWrite: boolean
  combinedRoles: RecruitmentCombinedRoleRow[]
  initialTemplateCode?: string
  masterView?: "dataEntry" | "masterTables"
  masters: RecruitmentMasterSnapshot
  templates: RecruitmentTemplateRow[]
}) {
  const [editingTemplate, setEditingTemplate] =
    useState<RecruitmentTemplateRow | null>(() =>
      canWrite
        ? (templates.find((row) => row.templateCode === initialTemplateCode) ??
          null)
        : null
    )
  const [deletingTemplate, setDeletingTemplate] =
    useState<RecruitmentTemplateRow | null>(null)
  const filterKeys: Array<{ key: FilterKey; label: string }> = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "department", label: "Department / Combined Job" },
    { key: "designation", label: "Designation" },
    { key: "education", label: "Education" },
    { key: "experience", label: "Experience" },
  ]
  const table = useExcelTable({
    rows: templates,
    columns: filterKeys.map(({ key, label }) => ({
      key,
      label,
      values: (row: RecruitmentTemplateRow) => [
        key === "code"
          ? row.templateCode
          : key === "department"
            ? (row.combinedRoleName ?? row.department)
            : key === "experience"
              ? row.experienceRequirement
              : String(row[key]),
      ],
    })),
  })
  const visibleTemplates = table.visibleRows

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setEditingTemplate(null)
      }}
      open={editingTemplate !== null}
    >
 <SectionCard>
        <CardHeader>
          <CardTitle>Job Templates</CardTitle>
          <CardDescription>
            Showing {visibleTemplates.length} Of {templates.length} Reusable
            Profiles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 overflow-x-auto">
          <div className="flex justify-end">
            <Button
              disabled={!table.hasFilters}
              onClick={table.clearFilters}
              size="sm"
              type="button"
              variant="outline"
            >
              Clear All Filters
            </Button>
          </div>
 <OperationalTable>
            <TableHeader>
              <TableRow>
                {filterKeys.map(({ key, label }) => (
                  <TableHead key={key}>{label}</TableHead>
                ))}
                {canWrite ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {filterKeys.map(({ key, label }) => (
                  <TableHead key={key}>
                    <ExcelColumnFilter
                      label={label}
                      {...table.filterProps(key)}
                    />
                  </TableHead>
                ))}
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTemplates.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">
                    {canWrite ? (
                      <Button
                        className="h-auto p-0 font-mono"
                        onClick={() => setEditingTemplate(row)}
                        type="button"
                        variant="link"
                      >
                        {row.templateCode}
                      </Button>
                    ) : (
                      row.templateCode
                    )}
                  </TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    {row.combinedRoleName
                      ? `Combined: ${row.combinedRoleName}`
                      : (row.department ?? "—")}
                  </TableCell>
                  <TableCell>{row.designation}</TableCell>
                  <TableCell>{row.education ?? "—"}</TableCell>
                  <TableCell>{row.experienceRequirement ?? "—"}</TableCell>
                  {canWrite ? (
                    <TableCell className="text-right">
                      <Button
                        onClick={() => setDeletingTemplate(row)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!visibleTemplates.length ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={canWrite ? 7 : 6}
                  >
                    No Job Templates Match The Selected Filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
 </OperationalTable>
        </CardContent>
 </SectionCard>
      {editingTemplate ? (
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <JobTemplateEditor
            combinedRoles={combinedRoles}
            masterView={masterView}
            masters={masters}
            template={editingTemplate}
          />
        </SheetContent>
      ) : null}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setDeletingTemplate(null)
        }}
        open={deletingTemplate !== null}
      >
        {deletingTemplate ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Job Template</DialogTitle>
              <DialogDescription>
                Unused templates delete immediately. If used, choose a
                replacement first.
              </DialogDescription>
            </DialogHeader>
            <form action={deleteRecruitmentMasterAction} className="grid gap-4">
              <input name="panel" type="hidden" value="postMasterPanel" />
              {masterView ? (
                <input name="master_view" type="hidden" value={masterView} />
              ) : null}
              <input
                name="master_id"
                type="hidden"
                value={deletingTemplate.id}
              />
              <input name="master_kind" type="hidden" value="job_template" />
              <Field>
                <FieldLabel htmlFor="replacement-job-template">
                  Replacement (Required Only If Used)
                </FieldLabel>
                <NativeSelect
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  id="replacement-job-template"
                  name="replacement_master_id"
                >
                  <NativeSelectOption value="">
                    No replacement — template must be unused
                  </NativeSelectOption>
                  {templates
                    .filter((row) => row.id !== deletingTemplate.id)
                    .map((row) => (
                      <NativeSelectOption key={row.id} value={row.id}>
                        {row.templateCode} — {row.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="delete-template-reason">
                  Reason For Deletion
                </FieldLabel>
                <Input
                  id="delete-template-reason"
                  name="deletion_reason"
                  required
                />
              </Field>
              <DialogFooter>
                <Button
                  onClick={() => setDeletingTemplate(null)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive">
                  Delete
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </Sheet>
  )
}
