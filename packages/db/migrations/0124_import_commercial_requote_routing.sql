-- Repair only untouched CSV requotes whose existing handoff already bypasses
-- Design and Product Costing. Preserve subsequent technical decisions/work.
UPDATE sales.enquiry_items AS item
SET technical_review_status = 'Duplicate / Existing Product',
    item_id = design.matched_product_id,
    link_type = 'Matched Quote - Commercial Requote',
    updated_at = now(),
    row_version = item.row_version + 1
FROM sales.enquiry_import_review_rows AS imported,
     sales.design_tasks AS design
WHERE imported.created_enquiry_item_id = item.id
  AND imported.organization_id = item.organization_id
  AND imported.applied_action = 'Commercial Requote'
  AND imported.matched_product_id = design.matched_product_id
  AND design.enquiry_item_id = item.id
  AND design.organization_id = item.organization_id
  AND design.design_status = 'Not Required'
  AND design.next_stage_status = 'Product Costing Complete'
  AND item.technical_review_status = 'Pending Review'
  AND item.reviewed_at IS NULL
  AND item.item_id IS NULL
  AND item.revision_type IS NULL
  AND item.linked_enquiry_item_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sales.clarification_tasks AS clarification
    WHERE clarification.enquiry_item_id = item.id
  );
