import type { Pool, PoolClient } from "pg"

export type QuotationVersion = {
  id: string
  revision: number
  status: "Draft" | "Sent"
  sentAt: Date | null
  fileId: string | null
  terms: {
    incoterms: string | null
    payment_terms: string | null
    shipment_mode: string | null
    packaging_terms: string | null
    brass_material_specs: string | null
    reports: string | null
    taxes_and_duties: string | null
    currency: string
  } | null
  lines: Array<{
    enquiryItemId: string
    quoteItemId: string | null
    lineNumber: number
    productCode: string | null
    customerPartCode: string | null
    description: string
    quantity: number
    price: number | null
    itemRevision: number | null
  }>
}

export async function captureQuotation(client: PoolClient, id: string, quoteItemId: string | null) {
  await client.query(`UPDATE sales.quotation_versions v SET status='Sent', sent_at=now(),
    terms_snapshot=(SELECT jsonb_build_object('incoterms',e.incoterms,'payment_terms',e.payment_terms,
      'shipment_mode',e.shipment_mode,'packaging_terms',e.packaging_terms,'brass_material_specs',e.brass_material_specs,
      'reports',e.reports,'taxes_and_duties',e.taxes_and_duties,'currency',e.currency) FROM sales.enquiries e WHERE e.id=v.enquiry_id),
    lines_snapshot=COALESCE((SELECT jsonb_agg(jsonb_build_object('enquiryItemId',i.id,'quoteItemId',q.id,
      'lineNumber',i.line_number,'productCode',p.uid,'customerPartCode',i.customer_part_code,
      'description',i.description,'quantity',i.quantity,'price',CASE WHEN i.technical_review_status='NotFeasible' THEN NULL ELSE q.unit_price END,
      'itemRevision',q.revision) ORDER BY i.line_number)
      FROM sales.enquiry_items i LEFT JOIN LATERAL (SELECT * FROM sales.quote_items q WHERE q.enquiry_item_id=i.id AND q.sent_at IS NOT NULL
        ORDER BY q.sent_at DESC,q.created_at DESC,q.id DESC LIMIT 1) q ON true
      LEFT JOIN catalog.items p ON p.id=q.item_id WHERE i.enquiry_id=v.enquiry_id AND i.linked_enquiry_item_id IS NULL),'[]'::jsonb),
    quote_item_id=$2, file_id=(SELECT file_id FROM core.file_links WHERE target_id=$2 AND target_schema='sales'
      AND target_table='quote_items' AND purpose='issued_quote_pdf' ORDER BY version DESC LIMIT 1)
    WHERE v.id=$1 AND v.status='Draft'`, [id, quoteItemId])
}

// Call under the enquiry row lock. Repeated edits share the current draft.
export async function ensureQuotationDraft(client: PoolClient, enquiryId: string) {
  let latest = (await client.query<{id:string; revision:number; status:string}>(
    "SELECT id,revision,status FROM sales.quotation_versions WHERE enquiry_id=$1 ORDER BY revision DESC LIMIT 1", [enquiryId])).rows[0]
  if (!latest) {
    const previous = (await client.query<{id:string}>("SELECT id FROM sales.quote_items WHERE enquiry_id=$1 AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 1", [enquiryId])).rows[0]
    if (previous) {
      const baseline = (await client.query<{id:string}>(`INSERT INTO sales.quotation_versions(organization_id,enquiry_id,revision,status)
        SELECT organization_id,id,0,'Draft' FROM sales.enquiries WHERE id=$1 RETURNING id`, [enquiryId])).rows[0]!
      await captureQuotation(client, baseline.id, previous.id)
      await client.query("UPDATE sales.quotation_versions SET sent_at=(SELECT max(sent_at) FROM sales.quote_items WHERE enquiry_id=$2),created_at=(SELECT min(sent_at) FROM sales.quote_items WHERE enquiry_id=$2) WHERE id=$1", [baseline.id,enquiryId])
      latest = {id:baseline.id,revision:0,status:"Sent"}
    }
  }
  if (latest?.status === "Draft") return latest
  return (await client.query<{id:string;revision:number;status:string}>(`INSERT INTO sales.quotation_versions(organization_id,enquiry_id,revision,status)
    SELECT organization_id,id,$2,'Draft' FROM sales.enquiries WHERE id=$1 RETURNING id,revision,status`, [enquiryId,(latest?.revision ?? -1)+1])).rows[0]!
}

export function quotationVersionMethods(pool: Pool) {
  return {
    async listQuotationVersions(enquiryId: string, actorUserId?: string | null) {
      return (await pool.query<QuotationVersion>(`SELECT v.id,v.revision,v.status,v.sent_at AS "sentAt",v.file_id AS "fileId",
        v.terms_snapshot AS terms,v.lines_snapshot AS lines FROM sales.quotation_versions v
        JOIN sales.enquiries e ON e.id=v.enquiry_id WHERE e.id=$1
        AND ($2::uuid IS NULL OR e.created_by_user_id=$2 OR identity.has_administrative_access($2)) ORDER BY v.revision`,
        [enquiryId,actorUserId ?? null])).rows
    },
  }
}
