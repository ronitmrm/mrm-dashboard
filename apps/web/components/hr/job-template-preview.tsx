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
import {
  SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { RecordDetails } from "@/components/ui/golden-patterns"

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

function TemplateDetails({ template }: { template: RecruitmentTemplateRow }) {
  return (
    <div className="grid gap-5">
      <RecordDetails
        items={[
          { label: "Designation", value: template.designation },
          {
            label: "Template for",
            value: template.combinedRoleName
              ? `Combined: ${template.combinedRoleName}`
              : "Individual posts",
          },
          { label: "Education", value: template.education || "—" },
          {
            label: "Experience",
            value: template.experienceRequirement || "—",
          },
          {
            label: "Salary range",
            value: `${template.minimumSalary ?? "—"} – ${template.maximumSalary ?? "—"}`,
          },
          {
            label: "Shift",
            value: `${template.shiftType ?? "—"} · ${template.shiftStartTime ?? "—"} – ${template.shiftEndTime ?? "—"}`,
          },
        ]}
      />
      <SectionCard>
        <CardHeader>
          <CardTitle>Job Description</CardTitle>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">
          {template.roleResponsibilities || "No job description added."}
        </CardContent>
      </SectionCard>
      <SectionCard>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">
          {template.questions || "No questions added."}
        </CardContent>
      </SectionCard>
    </div>
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
  const selectedTemplate = templates.find(
    (row) => row.templateCode === selectedCode
  )
  const availableCodes = new Set(templates.map((row) => row.templateCode))

  return (
    <Context.Provider
      value={{ availableCodes, openTemplate: setSelectedCode, templates }}
    >
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
                  <SheetTitle>
                    Job Description Template {selectedTemplate.templateCode}
                  </SheetTitle>
                  <SheetDescription>{selectedTemplate.name}</SheetDescription>
                </SheetHeader>
                <div className="grid gap-6 px-6 pb-6">
                  <TemplateDetails template={selectedTemplate} />
                  {edit ? (
                    <Button
                      className="w-fit"
                      onClick={() => setEditing(true)}
                      type="button"
                      variant="outline"
                    >
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

export function JobTemplateReference({ code }: { code: string | null }) {
  const context = useContext(Context)
  const template = context?.templates.find((row) => row.templateCode === code)

  return (
    <SectionCard aria-label="Job description template">
      <CardHeader>
        <CardTitle>Job Description Template {code ?? "—"}</CardTitle>
      </CardHeader>
      <CardContent>
        {template ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {template.name}
            </p>
            <TemplateDetails template={template} />
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No job description template assigned.
          </p>
        )}
      </CardContent>
    </SectionCard>
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
