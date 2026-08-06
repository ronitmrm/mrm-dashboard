import type { RecruitmentCandidateRow, RecruitmentJobRow } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { CandidateAssignmentForm } from "@/components/hr/candidate-assignment-form"

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
  initialJobId,
  jobs = [],
}: {
  canWrite: boolean
  candidates: RecruitmentCandidateRow[]
  fixedJob?: Pick<RecruitmentJobRow, "id" | "title" | "vacancyCode">
  initialJobId?: string
  jobs?: RecruitmentJobRow[]
}) {
  return (
    <>
      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign candidate</CardTitle>
            <CardDescription>
              Select one job and assign one or more candidates together.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CandidateAssignmentForm
              candidates={candidates.map((candidate) => ({
                activeApplicationJobIds: candidate.activeApplicationJobIds,
                departments: candidate.departments,
                email: candidate.email,
                id: candidate.id,
                name: candidate.name,
                phone: candidate.phone,
              }))}
              fixedJob={fixedJob}
              initialJobId={initialJobId}
              jobs={jobs
                .filter((job) => job.status === "Open")
                .map((job) => ({
                  id: job.id,
                  title: job.title,
                  vacancyCode: job.vacancyCode,
                }))}
            />
          </CardContent>
        </Card>
      ) : null}
      <CandidatesTable candidates={candidates} />
    </>
  )
}
