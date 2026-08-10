import Link from "next/link"
import { notFound } from "next/navigation"

import { createRecruitmentRepository } from "@workspace/db"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
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
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"
import { ArrowLeft, FileText } from "lucide-react"

import { saveCandidateAction } from "@/app/hr/actions"
import { ConversationLogsTable } from "@/components/hr/conversation-logs-table"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function CandidateWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const feedback = await searchParams
  const session = await requireCapability(
    "hr.recruitment.read",
    "/hr?panel=candidatesPanel"
  )
  const canWrite = (
    await listGrantedCapabilities(session.user.id, ["hr.recruitment.write"])
  ).includes("hr.recruitment.write")
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const loaded = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const [workspace, masters] = await Promise.all([
        repository.getCandidateWorkspace(organizationId, id),
        repository.listMasters(organizationId),
      ])
      return { masters, workspace }
    } finally {
      await repository.close()
    }
  })()
  const { masters, workspace } = loaded
  if (!workspace) notFound()

  const { applications, candidate, events } = workspace
  return (
    <div className="grid gap-6">
      {feedback.error || feedback.success ? (
        <Alert variant={feedback.error ? "destructive" : "default"}>
          <AlertDescription>
            {feedback.error ?? feedback.success}
          </AlertDescription>
        </Alert>
      ) : null}
      <Button asChild className="w-fit" size="sm" variant="ghost">
        <Link href="/hr?panel=candidatesPanel">
          <ArrowLeft data-icon="inline-start" />
          Back to candidates
        </Link>
      </Button>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {candidate.name}
            </h2>
            <Badge variant="outline">{candidate.status}</Badge>
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {candidate.phone} · {candidate.email ?? "No email"}
          </p>
        </div>
        {candidate.hasResume ? (
          <Button asChild>
            <a
              href={`/hr/candidates/${candidate.id}/resume`}
              rel="noreferrer"
              target="_blank"
            >
              <FileText data-icon="inline-start" />
              View resume
            </a>
          </Button>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Departments", candidate.departments.join(", ") || "—"],
          ["Designation", candidate.preferredDesignation ?? "—"],
          ["Current company", candidate.currentCompany ?? "—"],
          ["Experience", candidate.experience ?? "—"],
          ["Source", candidate.source ?? "—"],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
            </CardHeader>
            <CardContent className="font-medium">{value}</CardContent>
          </Card>
        ))}
      </section>

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit candidate</CardTitle>
            <CardDescription>
              Update candidate details, department, designation, or replace
              the resume PDF.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={saveCandidateAction}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              <input name="candidate_id" type="hidden" value={candidate.id} />
              <input
                name="return_to"
                type="hidden"
                value={`/hr/candidates/${candidate.id}`}
              />
              <Field>
                <FieldLabel htmlFor="edit-candidate-name">Name</FieldLabel>
                <Input
                  defaultValue={candidate.name}
                  id="edit-candidate-name"
                  name="name"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-candidate-phone">Phone</FieldLabel>
                <Input
                  defaultValue={candidate.phone}
                  id="edit-candidate-phone"
                  name="phone"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-candidate-email">Email</FieldLabel>
                <Input
                  defaultValue={candidate.email ?? ""}
                  id="edit-candidate-email"
                  name="email"
                  type="email"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-candidate-department">
                  Preferred department
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  defaultValue={candidate.preferredDepartmentCode ?? ""}
                  id="edit-candidate-department"
                  name="department_code"
                >
                  <NativeSelectOption value="">Not selected</NativeSelectOption>
                  {masters.departments.map((department) => (
                    <NativeSelectOption
                      key={department.id}
                      value={department.code}
                    >
                      {department.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-candidate-designation">
                  Designation
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  defaultValue={candidate.preferredDesignationCode ?? ""}
                  id="edit-candidate-designation"
                  name="designation_code"
                >
                  <NativeSelectOption value="">Not selected</NativeSelectOption>
                  {masters.designations.map((designation) => (
                    <NativeSelectOption
                      key={designation.id}
                      value={designation.code}
                    >
                      {designation.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-candidate-company">
                  Current company
                </FieldLabel>
                <Input
                  defaultValue={candidate.currentCompany ?? ""}
                  id="edit-candidate-company"
                  name="current_company"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-candidate-experience">
                  Experience
                </FieldLabel>
                <Input
                  defaultValue={candidate.experience ?? ""}
                  id="edit-candidate-experience"
                  name="experience"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-candidate-source">Source</FieldLabel>
                <Input
                  defaultValue={candidate.source ?? ""}
                  id="edit-candidate-source"
                  name="source"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-candidate-resume">
                  Resume PDF
                </FieldLabel>
                <Input
                  accept="application/pdf,.pdf"
                  id="edit-candidate-resume"
                  name="resume"
                  type="file"
                />
              </Field>
              <Field className="md:col-span-2 xl:col-span-3">
                <FieldLabel htmlFor="edit-candidate-notes">
                  Change note
                </FieldLabel>
                <Textarea id="edit-candidate-notes" name="notes" />
              </Field>
              <Button className="md:col-span-2 xl:col-span-3" type="submit">
                Save candidate changes
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Job application history</CardTitle>
          <CardDescription>
            Every job this candidate has been assigned to.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Interview rounds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => (
                <TableRow key={application.applicationId}>
                  <TableCell className="font-mono">
                    <Button
                      asChild
                      className="h-auto p-0 font-mono"
                      variant="link"
                    >
                      <Link href={`/hr/jobs/${application.jobId}`}>
                        {application.jobNumber}
                      </Link>
                    </Button>
                  </TableCell>
                  <TableCell>{application.jobTitle}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{application.status}</Badge>
                  </TableCell>
                  <TableCell>{application.interviewCount}</TableCell>
                </TableRow>
              ))}
              {!applications.length ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    No job applications yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConversationLogsTable
        canWrite={canWrite}
        events={events}
        returnCandidateId={candidate.id}
        showCandidate={false}
        title="Candidate conversation history"
      />
    </div>
  )
}
