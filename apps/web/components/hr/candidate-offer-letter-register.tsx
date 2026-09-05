import type { RecruitmentEmploymentLetterRow } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { FileText } from "lucide-react"

import { AttachmentViewerLink } from "../attachment-viewer-link"

export function CandidateOfferLetterRegister({
  letters,
}: {
  letters: RecruitmentEmploymentLetterRow[]
}) {
  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Offer Letter History</CardTitle>
        <CardDescription>
          Generated Offer Letters Retained Across This Candidate&apos;s Job
          Applications.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <OperationalTable>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Joining Date</TableHead>
              <TableHead className="text-right">File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {letters.map((letter) => (
              <TableRow key={letter.id}>
                <TableCell className="font-mono">
                  {letter.referenceNumber}
                </TableCell>
                <TableCell>{letter.issuedOn}</TableCell>
                <TableCell>{letter.designation}</TableCell>
                <TableCell>{letter.department || "—"}</TableCell>
                <TableCell>{letter.joiningDate}</TableCell>
                <TableCell className="text-right">
                  {letter.fileAvailable ? (
                    <Button asChild size="sm" variant="outline">
                      <AttachmentViewerLink
                        fileName={`${letter.referenceNumber}-offer-letter.pdf`}
                        href={`/hr/employment-letters/${letter.id}/download`}
                        mediaType="application/pdf"
                      >
                        <FileText data-icon="inline-start" />
                        View PDF
                      </AttachmentViewerLink>
                    </Button>
                  ) : (
                    <Badge variant="destructive">Generation Incomplete</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!letters.length ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={6}
                >
                  No Offer Letters Have Been Generated.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
  )
}
