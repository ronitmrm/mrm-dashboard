import type { RecruitmentOfferOutcomeRow } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent, CardDescription, CardHeader, CardTitle, SectionCard,
} from "@workspace/ui/components/card"
import {
  OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"
import Link from "next/link"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { StandardState } from "@/components/ui/golden-patterns"

export function OfferJoiningRegister({ rows, canViewOfferLetters }: {
  rows: RecruitmentOfferOutcomeRow[]
  canViewOfferLetters: boolean
}) {
  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Offer & Joining Register ({rows.length})</CardTitle>
        <CardDescription>
          Final HR decisions, issued Offer Letters, candidate responses and actual joining.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <OperationalTable filterStorageKey="hr-offer-joining-register" containerClassName="max-h-[38rem] rounded-md border">
          <TableHeader><TableRow>
            <TableHead>Candidate</TableHead><TableHead>Job</TableHead>
            <TableHead>Offer Letter</TableHead><TableHead>Issued</TableHead>
            <TableHead>Outcome</TableHead><TableHead>Planned Join</TableHead>
            <TableHead>Actual Join</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => <TableRow key={row.applicationId}>
              <TableCell><Link className="font-medium text-primary hover:underline" href={`/hr/candidates/${row.candidateId}`}>{row.candidateName}</Link></TableCell>
              <TableCell><Link className="text-primary hover:underline" href={`/hr/jobs/${row.jobId}`}>{row.jobNumber} · {row.jobTitle}</Link></TableCell>
              <TableCell>
                {row.offerId && row.offerFileAvailable && canViewOfferLetters ? (
                  <Button asChild size="sm" variant="outline">
                    <AttachmentViewerLink
                      fileName={`${row.offerReference}-offer-letter.pdf`}
                      href={`/hr/employment-letters/${row.offerId}/download`}
                      mediaType="application/pdf"
                    >{row.offerReference}</AttachmentViewerLink>
                  </Button>
                ) : canViewOfferLetters ? row.offerReference ?? "—" : "—"}
              </TableCell>
              <TableCell>{row.offerIssuedOn ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge
                  value={row.outcome}
                  tone={row.outcome === "Joined" ? "positive" : row.outcome === "Awaiting Response" || row.outcome === "Awaiting Joining" ? "warning" : "inactive"}
                />
                {row.didNotJoinOn ? <span className="block text-xs text-muted-foreground">{row.didNotJoinOn}</span> : null}
              </TableCell>
              <TableCell>{row.plannedJoiningOn ?? "—"}</TableCell>
              <TableCell>{row.joinedOn ?? "—"}</TableCell>
            </TableRow>)}
            {!rows.length ? <TableRow><TableCell colSpan={7}>
              <StandardState title="No Offer Decisions" description="Candidates appear after final HR approval." />
            </TableCell></TableRow> : null}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
  )
}
