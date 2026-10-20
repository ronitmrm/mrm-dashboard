"use client"

import type { RecruitmentEmploymentLetterRow } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { FileText } from "lucide-react"

import { AttachmentViewerLink } from "../attachment-viewer-link"
import { AppointmentLetterEditDialog } from "./employee-letter-dialog"

export function EmployeeAppointmentLetters({
  letters,
  employeeCode,
  joiningDate,
  canEdit,
  returnPanel = "employeeMasterPanel",
  emptyLabel,
}: {
  letters: RecruitmentEmploymentLetterRow[]
  employeeCode: string | null
  joiningDate: string | null
  canEdit: boolean
  returnPanel?: "employeeMasterPanel" | "probationRemindersPanel"
  emptyLabel?: string
}) {
  const code = employeeCode?.trim().toLowerCase()
  const matching = code && joiningDate
    ? letters.filter((letter) => letter.letterType === "appointment" &&
      letter.employeeCode?.trim().toLowerCase() === code && letter.joiningDate === joiningDate)
    : []
  const supersededIds = new Set(letters.flatMap((letter) =>
    letter.supersedesLetterId ? [letter.supersedesLetterId] : []))
  const current = matching.filter((letter) => !supersededIds.has(letter.id))
  const editable = current.length === 1 && current[0]?.fileAvailable ? current[0] : undefined
  const available = matching.filter((letter) => letter.fileAvailable)

  if (!available.length) return emptyLabel ?? null

  return (
    <div className="flex flex-wrap gap-2">
      {available.map((letter) => (
        <Button asChild key={letter.id} size="sm" variant="outline">
          <AttachmentViewerLink
            fileName={`${letter.referenceNumber}-appointment-letter.pdf`}
            href={`/hr/employment-letters/${letter.id}/download`}
            mediaType="application/pdf"
          >
            <FileText data-icon="inline-start" />
            Appointment · {letter.referenceNumber}
            {supersededIds.has(letter.id) ? " (Previous)" : ""}
          </AttachmentViewerLink>
        </Button>
      ))}
      {canEdit && editable ? (
        <AppointmentLetterEditDialog letter={editable} returnPanel={returnPanel} />
      ) : null}
    </div>
  )
}
