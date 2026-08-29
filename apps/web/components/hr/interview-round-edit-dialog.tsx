"use client"

import type { RecruitmentJobInterviewRow } from "@workspace/db"
import { recruitmentInterviewRound } from "@workspace/db/recruitment-interview-workflow"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { Pencil } from "lucide-react"
import { useId } from "react"

import { updateInterviewRoundAction } from "@/app/hr/actions"
import { formatIstTime, istDateValue } from "@/lib/date-time"

const scoreOptions = [
  ["1", "1 - Poor"],
  ["2", "2 - Needs improvement"],
  ["3", "3 - Satisfactory"],
  ["4", "4 - Good"],
  ["5", "5 - Excellent"],
] as const

export function InterviewRoundEditDialog({
  interview,
  interviewerOptions,
  returnJobId,
}: {
  interview: RecruitmentJobInterviewRow
  interviewerOptions: Array<{ code: string; name: string }>
  returnJobId: string
}) {
  const fieldId = useId()
  const round = recruitmentInterviewRound(interview.roundName)
  const hasCurrentInterviewer = interviewerOptions.some(
    (option) => option.name === interview.interviewerName
  )

  if (!round || interview.status === "Scheduled") return null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Pencil data-icon="inline-start" />
          Edit Round
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Interview Round</DialogTitle>
          <DialogDescription>
            Update The Schedule And Assessment. The Saved Decision Stays Locked
            To Preserve Later Interview Rounds.
          </DialogDescription>
        </DialogHeader>
        <form action={updateInterviewRoundAction} className="grid gap-5">
          <input name="interview_id" type="hidden" value={interview.id} />
          <input name="round_name" type="hidden" value={round.name} />
          <input name="return_job_id" type="hidden" value={returnJobId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${fieldId}-candidate`}>
                Candidate
              </FieldLabel>
              <Input
                id={`${fieldId}-candidate`}
                readOnly
                value={interview.candidateName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-round`}>Round</FieldLabel>
              <Input id={`${fieldId}-round`} readOnly value={round.name} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-date`}>
                Interview Date
              </FieldLabel>
              <Input
                defaultValue={istDateValue(interview.scheduledAt)}
                id={`${fieldId}-date`}
                name="interview_date"
                required
                type="date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-time`}>
                Interview Time (IST)
              </FieldLabel>
              <Input
                defaultValue={formatIstTime(interview.scheduledAt)}
                id={`${fieldId}-time`}
                name="interview_time"
                pattern="[0-2][0-9]:[0-5][0-9]"
                required
                type="text"
              />
            </Field>
          </div>

          <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4 md:grid-cols-2">
            {round.questions.map((question, index) => (
              <Field key={question.id}>
                <FieldLabel htmlFor={`${fieldId}-${question.id}`}>
                  {index + 1}. {question.prompt}
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  defaultValue={String(
                    interview.questionScores[question.id] ?? ""
                  )}
                  id={`${fieldId}-${question.id}`}
                  name={`question_${question.id}`}
                  required
                >
                  <NativeSelectOption value="">Select Score</NativeSelectOption>
                  {scoreOptions.map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${fieldId}-decision`}>Decision</FieldLabel>
              <Input
                id={`${fieldId}-decision`}
                readOnly
                value={interview.status}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-interviewer`}>
                Interviewer
              </FieldLabel>
              <SearchableSelect
                defaultValue={interview.interviewerName ?? ""}
                id={`${fieldId}-interviewer`}
                name="interviewer_name"
                required
                searchPlaceholder="Search interviewer..."
              >
                <option value="">Select Interviewer</option>
                {!hasCurrentInterviewer && interview.interviewerName ? (
                  <option value={interview.interviewerName}>
                    {interview.interviewerName}
                  </option>
                ) : null}
                {interviewerOptions.map((interviewer) => (
                  <option key={interviewer.code} value={interviewer.name}>
                    {interviewer.code} - {interviewer.name}
                  </option>
                ))}
              </SearchableSelect>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={`${fieldId}-comments`}>Comments</FieldLabel>
            <Textarea
              defaultValue={interview.comments ?? ""}
              id={`${fieldId}-comments`}
              name="comments"
            />
          </Field>
          <DialogFooter>
            <Button type="submit">Save Round Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
