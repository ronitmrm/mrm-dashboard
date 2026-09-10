-- No enquiry write triggers: application save paths resolve active master IDs.
ALTER TABLE sales.commercial_terms ADD COLUMN cost_per_kg numeric(20,8);
ALTER TABLE sales.enquiries
  ADD COLUMN packaging_term_id uuid REFERENCES sales.commercial_terms(id),
  ADD COLUMN incoterm_id uuid REFERENCES sales.commercial_terms(id);

-- Only exact Incoterms matches receive legacy shipping rates. Other shipping
-- names could describe transport modes and must be reviewed, not guessed.
UPDATE sales.commercial_terms term SET cost_per_kg = shipping.amount
FROM sales.shipping_terms shipping
WHERE term.organization_id = shipping.organization_id
  AND term.term_type = 'incoterms' AND shipping.active
  AND lower(term.name) = lower(shipping.name);

-- Packaging names are consolidated without deleting original source records.
-- Per-100-piece rates cannot be interpreted as INR/kg without a product weight.
INSERT INTO sales.commercial_terms
  (organization_id, name, value, active, term_type, cost_per_kg,
   source_system, source_table, source_id)
SELECT organization_id, name, name, active, 'packaging_terms',
  CASE WHEN lower(trim(cost_basis)) IN ('per kg', 'inr/kg', 'inr / kg')
    THEN amount ELSE NULL END,
  'mrm-dashboard', 'unified_packaging_migration', id::text
FROM sales.packaging_options
ON CONFLICT (organization_id, term_type, lower(name)) DO UPDATE
SET cost_per_kg = EXCLUDED.cost_per_kg;

UPDATE sales.enquiries enquiry SET packaging_term_id = term.id
FROM sales.commercial_terms term
WHERE term.organization_id = enquiry.organization_id AND term.active
  AND term.term_type = 'packaging_terms'
  AND lower(term.name) = lower(enquiry.packaging_terms);
UPDATE sales.enquiries enquiry SET incoterm_id = term.id
FROM sales.commercial_terms term
WHERE term.organization_id = enquiry.organization_id AND term.active
  AND term.term_type = 'incoterms'
  AND lower(term.name) = lower(enquiry.incoterms);
