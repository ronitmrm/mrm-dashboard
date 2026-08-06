import type { RecruitmentCandidateRow, RecruitmentJobRow } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
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

import { assignCandidateAction } from "@/app/hr/actions"

function CandidateStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline">{status}</Badge>
}

export function CandidatesTable({
  candidates,
}: {
  candidates: RecruitmentCandidateRow[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidates</CardTitle>
        <CardDescription>
          {candidates.length} candidate profiles
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Departments</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Applications</TableHead>
              <TableHead>Logs</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.length ? (
              candidates.map((candidate) => (
                <TableRow key={candidate.id}>
                  <TableCell>
                    {candidate.name}
                    <div className="text-xs text-muted-foreground">
                      {candidate.email ?? "No email"}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{candidate.phone}</TableCell>
                  <TableCell>
                    {candidate.departments.join(", ") || "—"}
                  </TableCell>
                  <TableCell>{candidate.currentCompany ?? "—"}</TableCell>
                  <TableCell>{candidate.applicationCount}</TableCell>
                  <TableCell>{candidate.eventCount}</TableCell>
                  <TableCell>
                    <CandidateStatusBadge status={candidate.status} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={7}
                >
                  No candidates found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function CandidateAssignmentPanel({
  canWrite,
  candidates,
  fixedJob,
  jobs = [],
}: {
  canWrite: boolean
  candidates: RecruitmentCandidateRow[]
  fixedJob?: Pick<RecruitmentJobRow, "id" | "title" | "vacancyCode">
  jobs?: RecruitmentJobRow[]
}) {
  return (
    <>
      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign candidate</CardTitle>
            <CardDescription>
              Create one candidate application for an open recruitment job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={assignCandidateAction}>
              {fixedJob ? (
                <input name="return_job_id" type="hidden" value={fixedJob.id} />
              ) : (
                <input
                  name="panel"
                  type="hidden"
                  value="candidateSearchPanel"
                />
              )}
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="assign-candidate">Candidate</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="assign-candidate"
                    name="candidate_id"
                    required
                  >
                    <NativeSelectOption value="">
                      Select candidate
                    </NativeSelectOption>
                    {candidates.map((candidate) => (
                      <NativeSelectOption
                        key={candidate.id}
                        value={candidate.id}
                      >
                        {candidate.name} · {candidate.phone}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="assign-job">Open job</FieldLabel>
                  {fixedJob ? (
                    <>
                      <input name="job_id" type="hidden" value={fixedJob.id} />
                      <Input
                        id="assign-job"
                        readOnly
                        value={`${fixedJob.vacancyCode} · ${fixedJob.title}`}
                      />
                    </>
                  ) : (
                    <NativeSelect
                      className="w-full"
                      id="assign-job"
                      name="job_id"
                      required
                    >
                      <NativeSelectOption value="">
                        Select job
                      </NativeSelectOption>
                      {jobs
                        .filter((job) => job.status === "Open")
                        .map((job) => (
                          <NativeSelectOption key={job.id} value={job.id}>
                            {job.vacancyCode} · {job.title}
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
                  )}
                </Field>
                <Button className="md:col-span-2 xl:col-span-3" type="submit">
                  Assign to job
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <CandidatesTable candidates={candidates} />
    </>
  )
}
