import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

type Visit = {
  id: string
  scheduleName: string
  dueOn: string
  method: "SUPPLIER" | "IN_HOUSE"
  scope: string
  status: "OPEN" | "DISPATCHED" | "RETURNED" | "PASSED" | "FAILED" | "CANCELLED"
  completedOn: string | null
  certificateNumber: string | null
  certificateFileName: string | null
  certificateHref: string | null
  offers: { id: string; supplierName: string }[]
  selectedOfferId: string | null
}

export function StoreAssetCalibrationHistory({
  unitId,
  visits,
}: {
  unitId: string
  visits: Visit[]
}) {
  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Calibration History</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        {visits.length ? (
          <OperationalTable filterStorageKey={`store-calibration-history-${unitId}`}>
            <TableHeader>
              <TableRow>
                <TableHead>Due</TableHead>
                <TableHead>Calibration</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Certificate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.map((visit) => {
                const supplier = visit.offers.find((offer) => offer.id === visit.selectedOfferId)
                const tone = visit.status === "PASSED" ? "positive"
                  : visit.status === "FAILED" ? "danger"
                    : visit.status === "CANCELLED" ? "inactive" : "warning"
                return (
                  <TableRow key={visit.id} data-row-id={visit.id}>
                    <TableCell>{visit.dueOn}</TableCell>
                    <TableCell>
                      <span className="font-medium">{visit.scheduleName}</span>
                      <span className="block text-xs text-muted-foreground">{visit.scope}</span>
                    </TableCell>
                    <TableCell>{visit.method === "IN_HOUSE" ? "In House" : "Supplier"}</TableCell>
                    <TableCell>{supplier?.supplierName || "—"}</TableCell>
                    <TableCell><StatusBadge tone={tone} value={visit.status} /></TableCell>
                    <TableCell>{visit.completedOn || "—"}</TableCell>
                    <TableCell>
                      {visit.certificateHref ? (
                        <Button asChild size="sm" variant="outline">
                          <AttachmentViewerLink
                            fileName={visit.certificateFileName || "calibration-certificate.pdf"}
                            href={visit.certificateHref}
                            mediaType="application/pdf"
                          >
                            {visit.certificateNumber || "View certificate"}
                          </AttachmentViewerLink>
                        </Button>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </OperationalTable>
        ) : (
          <StandardState title="No calibration visits" description="Completed visits and their certificates will appear here." />
        )}
      </CardContent>
    </SectionCard>
  )
}
