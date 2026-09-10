import type { PoolClient } from "pg"

// Runs only inside an application enquiry-save transaction, not a DB trigger.
export async function linkEnquiryCostMasters(client: PoolClient, enquiryId: string) {
  const { rows } = await client.query<{
    packaging_terms: string | null; incoterms: string | null
    packaging_id: string | null; incoterm_id: string | null
  }>(`
    SELECT enquiry.packaging_terms, enquiry.incoterms,
      packaging.id AS packaging_id, incoterm.id AS incoterm_id
    FROM sales.enquiries enquiry
    LEFT JOIN sales.commercial_terms packaging
      ON packaging.organization_id = enquiry.organization_id
      AND packaging.term_type = 'packaging_terms' AND packaging.active
      AND lower(packaging.name) = lower(trim(enquiry.packaging_terms))
    LEFT JOIN sales.commercial_terms incoterm
      ON incoterm.organization_id = enquiry.organization_id
      AND incoterm.term_type = 'incoterms' AND incoterm.active
      AND lower(incoterm.name) = lower(trim(enquiry.incoterms))
    WHERE enquiry.id = $1`, [enquiryId])
  const row = rows[0]
  if (!row) throw new Error("Enquiry was not found.")
  if (row.packaging_terms?.trim() && !row.packaging_id)
    throw new Error("Select an active Packaging master value.")
  if (row.incoterms?.trim() && !row.incoterm_id)
    throw new Error("Select an active Incoterms master value.")
  await client.query(`UPDATE sales.enquiries SET packaging_term_id = $2,
    incoterm_id = $3,
    packaging_terms = COALESCE((SELECT name FROM sales.commercial_terms WHERE id = $2), packaging_terms),
    incoterms = COALESCE((SELECT name FROM sales.commercial_terms WHERE id = $3), incoterms),
    delivery_terms = COALESCE((SELECT name FROM sales.commercial_terms WHERE id = $3), delivery_terms)
    WHERE id = $1`, [enquiryId, row.packaging_id, row.incoterm_id])
}

export async function enquiryMasterCosts(client: PoolClient, enquiryId: string) {
  const { rows } = await client.query<{
    packaging: string | null; incoterms: string | null
    packing_cost: string | null; shipping_cost: string | null
  }>(`
    SELECT packaging.name AS packaging, incoterm.name AS incoterms,
      packaging.cost_per_kg::text AS packing_cost,
      incoterm.cost_per_kg::text AS shipping_cost
    FROM sales.enquiries enquiry
    JOIN sales.commercial_terms packaging
      ON packaging.id = enquiry.packaging_term_id
      AND packaging.organization_id = enquiry.organization_id
      AND packaging.term_type = 'packaging_terms' AND packaging.active
    JOIN sales.commercial_terms incoterm
      ON incoterm.id = enquiry.incoterm_id
      AND incoterm.organization_id = enquiry.organization_id
      AND incoterm.term_type = 'incoterms' AND incoterm.active
    WHERE enquiry.id = $1 FOR SHARE OF packaging, incoterm`, [enquiryId])
  const row = rows[0]
  if (!row?.packaging || !row.incoterms)
    throw new Error("Select active Packaging and Incoterms masters on the enquiry before costing.")
  if (row.packing_cost === null || row.shipping_cost === null)
    throw new Error("Set Packing and Shipping INR/kg costs in the Packaging and Incoterms masters before costing.")
  const packingCost = Number(row.packing_cost)
  const shippingCost = Number(row.shipping_cost)
  if (![packingCost, shippingCost].every(value => Number.isFinite(value) && value >= 0))
    throw new Error("Master costs must be nonnegative INR/kg amounts.")
  return { packaging: row.packaging, shippingTerms: row.incoterms, packingCost, shippingCost }
}
