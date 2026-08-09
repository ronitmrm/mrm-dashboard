"use client"

import type { RecruitmentInterviewRow } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ListTodo,
} from "lucide-react"
import { useState } from "react"

import { InterviewOutcomeForm } from "@/components/hr/interview-outcome-form"

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "Approved" ? "default" : "outline"}>
      {status}
    </Badge>
  )
}

export function InterviewWorkspace({
  canWrite,
  interviews,
}: {
  canWrite: boolean
  interviews: RecruitmentInterviewRow[]
}) {
  const [selectedInterview, setSelectedInterview] =
    useState<RecruitmentInterviewRow | null>(null)
  const planned = interviews.filter((row) => row.scoreableRound !== null)
  const awaitingSchedule = interviews.filter(
    (row) => row.nextRound !== null && row.scoreableRound === null
  )
  const completedRounds = interviews.filter((row) => row.latestRound !== null)
  const closed = interviews.filter((row) => row.nextRound === null)
  const summaries = [
    {
      icon: CalendarClock,
      label: "Pending interviews",
      value: planned.length,
    },
    {
      icon: ListTodo,
      label: "Need scheduling",
      value: awaitingSchedule.length,
    },
    {
      icon: ClipboardCheck,
      label: "Rounds completed",
      value: completedRounds.length,
    },
    { icon: CheckCircle2, label: "Applications closed", value: closed.length },
  ]

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setSelectedInterview(null)
      }}
      open={selectedInterview !== null}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between gap-4 pt-6">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-3xl font-semibold tabular-nums">{value}</p>
              </div>
              <Icon className="size-7 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planned interviews</CardTitle>
          <CardDescription>
            {planned.length} scheduled interviews waiting for an outcome
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Date and time</TableHead>
                <TableHead>Round</TableHead>
                {canWrite ? (
                  <TableHead className="text-right">Outcome</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {planned.length ? (
                planned.map((row) => (
                  <TableRow key={row.applicationId}>
                    <TableCell>{row.candidateName}</TableCell>
                    <TableCell>{row.jobTitle}</TableCell>
                    <TableCell>
                      {row.interviewAt
                        ? new Date(row.interviewAt).toLocaleString("en-IN")
                        : "Scheduled"}
                    </TableCell>
                    <TableCell>{row.scoreableRound}</TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <Button
                          onClick={() => setSelectedInterview(row)}
                          size="sm"
                          type="button"
                        >
                          Record outcome
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={canWrite ? 5 : 4}
                  >
                    No planned interviews are waiting for an outcome.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interview workspace</CardTitle>
          <CardDescription>
            {interviews.length} candidate applications
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Required round</TableHead>
                <TableHead>Latest outcome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interviews.length ? (
                interviews.map((row) => (
                  <TableRow key={row.applicationId}>
                    <TableCell>{row.candidateName}</TableCell>
                    <TableCell>{row.jobTitle}</TableCell>
                    <TableCell>
                      {row.interviewAt
                        ? new Date(row.interviewAt).toLocaleString("en-IN")
                        : "Not scheduled"}
                    </TableCell>
                    <TableCell>
                      {row.nextRound ??
                        (row.status === "Approved"
                          ? "All rounds approved"
                          : "Application closed")}
                    </TableCell>
                    <TableCell>
                      {row.latestRound
                        ? `${row.latestRound} · ${row.latestStatus}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>{row.joiningDate ?? "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No candidate applications found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedInterview ? (
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Interview outcome</SheetTitle>
            <SheetDescription>
              {selectedInterview.candidateName} · {selectedInterview.jobTitle} ·{" "}
              {selectedInterview.scoreableRound}
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            <InterviewOutcomeForm
              applications={[
                {
                  candidateName: `${selectedInterview.candidateName} · ${selectedInterview.jobTitle}`,
                  id: selectedInterview.applicationId,
                  scoreableRound: selectedInterview.scoreableRound,
                },
              ]}
              initialApplicationId={selectedInterview.applicationId}
              panelId="interviewsPanel"
            />
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
