"use client"

import { createContext, useContext, useState } from "react"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentMasterSnapshot,
  RecruitmentTemplateRow,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { JobTemplateEditor } from "@/components/hr/job-templates-table"

type EditTemplate = {
  combinedRoles: RecruitmentCombinedRoleRow[]
  masterView?: "dataEntry" | "masterTables"
  masters: RecruitmentMasterSnapshot
  panelId: string
}

type TemplatePreviewContext = {
  openTemplate: (code: string) => void
  availableCodes: Set<string>
  templates: RecruitmentTemplateRow[]
}

const Context = createContext<TemplatePreviewContext | null>(null)

function Detail({
  label,
  value,
}: {
  label: string
  value: string | number | null
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap font-medium">
        {value === null || value === "" ? "—" : value}
      </dd>
    </div>
  )
}

function TemplateDetails({ template }: { template: RecruitmentTemplateRow }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Detail
        label="Template For"
        value={
          template.combinedRoleName
            ? `Combined: ${template.combinedRoleName}`
            : template.department
        }
      />
      <Detail label="Designation" value={template.designation} />
      <Detail label="Gender" value={template.gender} />
      <Detail label="Education" value={template.education} />
      <Detail label="Experience Requirement" value={template.experienceRequirement} />
      <Detail label="Minimum Salary" value={template.minimumSalary} />
      <Detail label="Maximum Salary" value={template.maximumSalary} />
      <Detail label="Shift Type" value={template.shiftType} />
      <Detail label="Shift Start Time" value={template.shiftStartTime} />
      <Detail label="Shift End Time" value={template.shiftEndTime} />
      <div className="sm:col-span-2">
        <Detail label="Role Responsibilities" value={template.roleResponsibilities} />
      </div>
    </dl>
  )
}

export function JobTemplatePreviewProvider({
  children,
  edit,
  templates,
}: {
  children: React.ReactNode
  edit?: EditTemplate
  templates: RecruitmentTemplateRow[]
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const selectedTemplate = templates.find((row) => row.templateCode === selectedCode)
  const availableCodes = new Set(templates.map((row) => row.templateCode))

  return (
    <Context.Provider value={{ availableCodes, openTemplate: setSelectedCode, templates }}>
      {children}
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCode(null)
            setEditing(false)
          }
        }}
        open={!!selectedTemplate}
      >
        {selectedTemplate ? (
          <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
            {editing && edit ? (
              <JobTemplateEditor
                canWrite
                combinedRoles={edit.combinedRoles}
                masterView={edit.masterView}
                masters={edit.masters}
                panelId={edit.panelId}
                template={selectedTemplate}
              />
            ) : (
              <>
                <SheetHeader>
                  <SheetTitle>Job Description Template {selectedTemplate.templateCode}</SheetTitle>
                  <SheetDescription>{selectedTemplate.name}</SheetDescription>
                </SheetHeader>
                <div className="grid gap-6 px-6 pb-6">
                  <TemplateDetails template={selectedTemplate} />
                  {edit ? (
                    <Button className="w-fit" onClick={() => setEditing(true)} type="button" variant="outline">
                      Edit Template
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </SheetContent>
        ) : null}
      </Sheet>
    </Context.Provider>
  )
}

export function JobTemplateInline({ code }: { code: string | null }) {
  const context = useContext(Context)
  const template = context?.templates.find((row) => row.templateCode === code)
  if (!template) return <p>Job Description Template: {code ?? "—"}</p>

  return (
    <details className="mb-4 rounded-md border p-4">
      <summary className="cursor-pointer font-medium">
        Job Description Template {template.templateCode} · {template.name}
      </summary>
      <div className="pt-4">
        <TemplateDetails template={template} />
      </div>
    </details>
  )
}

export function JobTemplatePreviewLink({ code }: { code: string | null }) {
  const context = useContext(Context)
  if (!code) return "—"
  if (!context?.availableCodes.has(code)) return code

  return (
    <Button
      className="h-auto p-0 font-mono"
      onClick={() => context.openTemplate(code)}
      type="button"
      variant="link"
    >
      {code}
    </Button>
  )
}
