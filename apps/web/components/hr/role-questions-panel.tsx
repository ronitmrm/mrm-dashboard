"use client"
import { useId, useState } from "react"
import type { RecruitmentTemplateRow } from "@workspace/db"
import {
  type RecruitmentRoleQuestion,
  roleQuestionFocus,
  roleQuestionRounds,
} from "@workspace/db/recruitment-role-profile"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import {
  SectionCard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"
import {
  FormGrid,
  FormSection,
  PageHeader,
} from "@/components/ui/golden-patterns"
import { saveRoleQuestionsAction } from "@/app/hr/actions"

function QuestionsEditor({ template }: { template: RecruitmentTemplateRow }) {
  const prefix = useId(),
    [questions, setQuestions] = useState(template.interviewQuestions)
  function change(id: string, field: "prompt" | "evidence", value: string) {
    setQuestions((current) =>
      current.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    )
  }
  function classify(id: string, field: "round" | "focus", value: string) {
    setQuestions((current) =>
      current.map((question) => {
        if (question.id !== id) return question
        if (field === "round") {
          const round = roleQuestionRounds.find((round) => round === value)
          return round ? { ...question, round } : question
        }
        const focus = roleQuestionFocus.find((focus) => focus === value)
        return focus ? { ...question, focus } : question
      })
    )
  }
  return (
    <form action={saveRoleQuestionsAction} className="grid gap-5 p-6">
      <p className="text-sm text-muted-foreground">
        Include at least one Role, Responsibilities and Authority question. Use
        up to 40 questions per role.
      </p>
      <input type="hidden" name="panel" value="questionsPanel" />
      <input type="hidden" name="template_id" value={template.id} />
      <input
        type="hidden"
        name="template_version"
        value={template.rowVersion}
      />
      <input type="hidden" name="questions" value={JSON.stringify(questions)} />
      {questions.map((q, index) => (
        <FormSection width="full" key={q.id} title={`Question ${index + 1}`}>
          <FormGrid>
            <Field>
              <FieldLabel htmlFor={`${prefix}-${q.id}-round`}>
                Interview round
              </FieldLabel>
              <NativeSelect
                id={`${prefix}-${q.id}-round`}
                value={q.round}
                onChange={(e) => classify(q.id, "round", e.target.value)}
              >
                {roleQuestionRounds.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {v}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-${q.id}-focus`}>Focus</FieldLabel>
              <NativeSelect
                id={`${prefix}-${q.id}-focus`}
                value={q.focus}
                onChange={(e) => classify(q.id, "focus", e.target.value)}
              >
                {roleQuestionFocus.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {v}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </FormGrid>
          <Field>
            <FieldLabel htmlFor={`${prefix}-${q.id}-prompt`}>
              Question / scenario
            </FieldLabel>
            <Textarea
              id={`${prefix}-${q.id}-prompt`}
              required
              maxLength={4000}
              value={q.prompt}
              onChange={(e) => change(q.id, "prompt", e.target.value)}
              rows={3}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-${q.id}-evidence`}>
              Evidence / response indicators to seek
            </FieldLabel>
            <Textarea
              id={`${prefix}-${q.id}-evidence`}
              required
              maxLength={4000}
              value={q.evidence}
              onChange={(e) => change(q.id, "evidence", e.target.value)}
              rows={3}
            />
            <FieldDescription>
              Ask for examples or a demonstration. Compare the response to the
              role&apos;s confirmed duties and delegation; record evidence in
              interview comments.
            </FieldDescription>
          </Field>
          {q.originalPrompt ? (
            <details>
              <summary className="cursor-pointer text-sm">
                Original screening question
              </summary>
              <p className="text-sm whitespace-pre-wrap">{q.originalPrompt}</p>
            </details>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setQuestions((current) =>
                current.filter((item) => item.id !== q.id)
              )
            }
          >
            Remove question
          </Button>
        </FormSection>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={questions.length >= 40}
          onClick={() =>
            setQuestions((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                round: "Screening Round",
                focus: "Role",
                prompt: "",
                evidence: "",
              },
            ])
          }
        >
          Add question
        </Button>
        <Button type="submit">Save HR questions</Button>
      </div>
    </form>
  )
}
export function RoleQuestionList({
  questions,
}: {
  questions: RecruitmentRoleQuestion[]
}) {
  return (
    <OperationalTable
      excelFilters
      filterStorageKey="hr-role-questions-detail"
      containerClassName="max-h-[55vh] rounded-xl border"
      state={questions.length ? "ready" : "empty"}
      stateTitle="No questions for this round"
      stateDescription="Prepare job-related questions in HR Questions."
    >
      <TableHeader>
        <TableRow>
          {["Round", "Focus", "Question / scenario", "Evidence to seek"].map(
            (v) => (
              <TableHead key={v}>{v}</TableHead>
            )
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {questions.map((q) => (
          <TableRow key={q.id}>
            <TableCell>{q.round}</TableCell>
            <TableCell>{q.focus}</TableCell>
            <TableCell className="max-w-xl min-w-64 whitespace-pre-wrap">
              {q.prompt}
            </TableCell>
            <TableCell className="max-w-xl min-w-64 whitespace-pre-wrap">
              {q.evidence}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </OperationalTable>
  )
}
export function RoleQuestionsPanel({
  templates,
  canWrite,
}: {
  templates: RecruitmentTemplateRow[]
  canWrite: boolean
}) {
  const [editing, setEditing] = useState<RecruitmentTemplateRow | null>(null)
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="HR Questions"
        description="Role-linked interview prompts covering duties, competence, decision limits and escalation. Use evidence, examples and demonstrations alongside the interview scoring criteria."
      />
      <SectionCard>
        <CardHeader>
          <CardTitle>Question bank by role</CardTitle>
          <CardDescription>
            Evaluate examples against the confirmed role profile and interview
            criteria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperationalTable
            excelFilters
            filterStorageKey="hr-role-question-bank"
            containerClassName="max-h-[65vh] rounded-xl border"
            state={templates.length ? "ready" : "empty"}
            stateTitle="No role profiles"
            stateDescription="Create a role profile before preparing its interview questions."
          >
            <TableHeader>
              <TableRow>
                {[
                  "Role code",
                  "Role",
                  "Round",
                  "Focus",
                  "Question",
                  "Evidence to seek",
                  ...(canWrite ? ["Edit bank"] : []),
                ].map((v) => (
                  <TableHead key={v}>{v}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.flatMap((t) =>
                t.interviewQuestions.map((q) => (
                  <TableRow key={`${t.id}-${q.id}`}>
                    <TableCell>{t.templateCode}</TableCell>
                    <TableCell className="min-w-48">{t.name}</TableCell>
                    <TableCell>{q.round}</TableCell>
                    <TableCell>{q.focus}</TableCell>
                    <TableCell className="max-w-xl min-w-64 whitespace-pre-wrap">
                      {q.prompt}
                    </TableCell>
                    <TableCell className="max-w-xl min-w-64 whitespace-pre-wrap">
                      {q.evidence}
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditing(t)}
                        >
                          Edit {t.templateCode}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
      <Sheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        {editing ? (
          <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
            <SheetHeader>
              <SheetTitle>{editing.templateCode} · HR Questions</SheetTitle>
              <SheetDescription>
                {editing.name}. Saves retain the earlier question bank in the
                audit history.
              </SheetDescription>
            </SheetHeader>
            <QuestionsEditor template={editing} />
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  )
}
