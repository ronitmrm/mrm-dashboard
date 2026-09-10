import Link from "next/link"
import type { ReactNode } from "react"
import type { QuotationVersion } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { SectionCard, CardHeader, CardTitle, CardContent } from "@workspace/ui/components/card"
import { OperationalTable, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@workspace/ui/components/table"
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"

import { quotationRevisionLabel } from "@/lib/pricing/quotation-revision"

export function QuotationTabs({enquiryId,versions,selected}:{enquiryId:string;versions:QuotationVersion[];selected:number}) {
  return <nav aria-label="Quotation revisions" role="tablist" className="flex gap-2 overflow-x-auto border-b pb-2">
    {versions.map(version=><Button asChild key={version.id} variant={version.revision===selected ? "default" : "outline"} size="sm">
      <Link role="tab" aria-selected={version.revision===selected} href={`/commercial/enquiries/${enquiryId}?revision=${version.revision}`}>
        {quotationRevisionLabel(version.revision)}{version.status==='Draft' ? ' · In Progress' : ''}
      </Link>
    </Button>)}
  </nav>
}

export function QuotationHistory({enquiryId,enquiryNumber,versions,selected,action}:{
  enquiryId:string;enquiryNumber:string;versions:QuotationVersion[];selected:QuotationVersion;action?:ReactNode
}) {
  const previous=versions.find(version=>version.revision===selected.revision-1)
  const terms = [
    ['incoterms','Delivery'],['payment_terms','Payment'],['shipment_mode','Shipment Mode'],
    ['packaging_terms','Packaging'],['brass_material_specs','Brass Material Specs'],
    ['reports','Reports'],['taxes_and_duties','Taxes and Duties'],['currency','Currency'],
  ] as const
  return <div className="grid gap-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-2xl font-semibold">{enquiryNumber}</h2><p>{quotationRevisionLabel(selected.revision)} · {selected.status}</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/commercial/sales?view=sent-quotes">Back To Sent Quotes</Link></Button>{action}
        <Button asChild variant="outline"><AttachmentViewerLink fileName={`${enquiryNumber}-${selected.revision}.pdf`}
          href={`/commercial/quotes/enquiry/${enquiryId}/pdf?revision=${selected.revision}`} mediaType="application/pdf">Open PDF</AttachmentViewerLink></Button>
      </div>
    </div>
    <QuotationTabs enquiryId={enquiryId} versions={versions} selected={selected.revision}/>
    <SectionCard><CardHeader><CardTitle>Terms &amp; Conditions</CardTitle></CardHeader><CardContent>
      {selected.terms ? <OperationalTable><TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Value</TableHead><TableHead>Previous Value</TableHead></TableRow></TableHeader><TableBody>
        {terms.map(([key,label])=><TableRow key={key}><TableCell>{label}</TableCell><TableCell className="whitespace-pre-wrap">{selected.terms?.[key] || '—'}</TableCell>
          <TableCell className="whitespace-pre-wrap">{previous?.terms && previous.terms[key]!==selected.terms?.[key] ? previous.terms[key] || '—' : '—'}</TableCell></TableRow>)}
      </TableBody></OperationalTable> : <p>Historical terms were not stored separately. Open this revision’s saved PDF to review them.</p>}
    </CardContent></SectionCard>
    <SectionCard><CardHeader><CardTitle>Quotation Parts</CardTitle></CardHeader><CardContent>
      <OperationalTable><TableHeader><TableRow><TableHead>Line</TableHead><TableHead>Product</TableHead><TableHead>Customer Part</TableHead><TableHead>Description</TableHead><TableHead>Quantity</TableHead><TableHead>Unit Price</TableHead><TableHead>Item Price Revision</TableHead><TableHead>Change</TableHead></TableRow></TableHeader><TableBody>
        {selected.lines.map(line=>{
          const prior=previous?.lines.find(item=>item.enquiryItemId===line.enquiryItemId)
          return <TableRow key={line.enquiryItemId}><TableCell>{line.lineNumber}</TableCell><TableCell>{line.productCode || '—'}</TableCell><TableCell>{line.customerPartCode || '—'}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{line.price?.toFixed(4) ?? 'Cannot Quote'}</TableCell><TableCell>{line.itemRevision ?? '—'}</TableCell>
            <TableCell>{previous ? <Badge variant="outline">{!prior ? 'Added' : prior.quoteItemId!==line.quoteItemId ? 'Revised' : 'Unchanged'}</Badge> : '—'}</TableCell></TableRow>
        })}
      </TableBody></OperationalTable>
    </CardContent></SectionCard>
  </div>
}
