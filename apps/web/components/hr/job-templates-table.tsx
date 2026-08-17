"use client"

import { useMemo, useState } from "react"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentMasterSnapshot,
  RecruitmentTemplateRow,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { saveTemplateAction } from "@/app/hr/actions"
import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"
import { TemplateScopeFields } from "@/components/hr/template-scope-fields"

type FilterKey =
  | "code"
  | "department"
  | "designation"
  | "education"
  | "experience"
  | "name"

const emptyFilters: Record<FilterKey, string[] | null> = {
  code: null,
  department: null,
  designation: null,
  education: null,
  experience: null,
  name: null,
}

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
  const [filters, setFilters] = useState({ ...emptyFilters })
  const options = useMemo(
    () => ({
      code: uniqueFilterOptions(templates.map((row) => row.templateCode)),
      department: uniqueFilterOptions(
        templates.map((row) => row.combinedRoleName ?? row.department)
      ),
      designation: uniqueFilterOptions(templates.map((row) => row.designation)),
      education: uniqueFilterOptions(templates.map((row) => row.education)),
      experience: uniqueFilterOptions(
        templates.map((row) => row.experienceRequirement)
      ),
      name: uniqueFilterOptions(templates.map((row) => row.name)),
    }),
    [templates]
  )
  const visibleTemplates = templates.filter(
    (row) =>
      matchesColumnFilter(row.templateCode, filters.code) &&
      matchesColumnFilter(row.name, filters.name) &&
      matchesColumnFilter(
        row.combinedRoleName ?? row.department,
        filters.department
      ) &&
      matchesColumnFilter(row.designation, filters.designation) &&
      matchesColumnFilter(row.education, filters.education) &&
      matchesColumnFilter(row.experienceRequirement, filters.experience)
  )
  const filterKeys: Array<{ key: FilterKey; label: string }> = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "department", label: "Department / Combined Job" },
    { key: "designation", label: "Designation" },
    { key: "education", label: "Education" },
    { key: "experience", label: "Experience" },
  ]

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setEditingTemplate(null)
      }}
      open={editingTemplate !== null}
    >
      <Card>
        <CardHeader>
          <CardTitle>Job Templates</CardTitle>
          <CardDescription>
            Showing {visibleTemplates.length} Of {templates.length} Reusable
            Profiles
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {filterKeys.map(({ key, label }) => (
                  <TableHead key={key}>{label}</TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {filterKeys.map(({ key, label }) => (
                  <TableHead key={key}>
                    <ExcelColumnFilter
                      label={label}
                      onApply={(selected) =>
                        setFilters((current) => ({
                          ...current,
                          [key]: selected,
                        }))
                      }
                      options={options[key]}
                      selected={filters[key]}
                    />
                  </TableHead>
                ))}
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
                </TableRow>
              ))}
              {!visibleTemplates.length ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No Job Templates Match The Selected Filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
    </Sheet>
  )
}
