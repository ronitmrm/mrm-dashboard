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
import { roleProfileFields } from "@workspace/db/recruitment-role-profile"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import { RecordDetails } from "@/components/ui/golden-patterns"
import { RoleQuestionList } from "@/components/hr/role-questions-panel"

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
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">Role profile</TabsTrigger>
        <TabsTrigger value="questions">HR Questions</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="grid gap-5">
        <RecordDetails
          items={[
            { label: "Designation", value: template.designation },
            {
              label: "Template for",
              value: template.combinedRoleName
                ? `Combined: ${template.combinedRoleName}`
                : "Individual posts",
            },
            {
              label: "Responsibilities / duties",
              value: template.roleResponsibilities || "Needs assessment",
            },
            ...roleProfileFields.map(({ key, label }) => ({
              label,
              value: template.roleProfile[key] || "Needs assessment",
            })),
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
        {template.originalRoleDescription ? (
          <details>
            <summary className="cursor-pointer text-sm">
              Original job description and questions
            </summary>
            <p className="text-sm whitespace-pre-wrap">
              {template.originalRoleDescription}
            </p>
          </details>
        ) : null}
      </TabsContent>
      <TabsContent value="questions">
        <RoleQuestionList questions={template.interviewQuestions} />
      </TabsContent>
    </Tabs>
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
                  <SheetTitle>
                    Role Profile {selectedTemplate.templateCode}
                  </SheetTitle>
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

export function JobTemplateReference({ code }: { code: string | null }) {
  const context = useContext(Context)
  const template = context?.templates.find((row) => row.templateCode === code)

  return (
    <section
      aria-label="Role profile"
      className="min-w-0 rounded-lg border bg-muted/20 p-4"
    >
      <h3 className="font-medium">Role Profile {code ?? "—"}</h3>
      {template ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{template.name}</p>
          <TemplateDetails template={template} />
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No role profile assigned.
        </p>
      )}
    </section>
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
