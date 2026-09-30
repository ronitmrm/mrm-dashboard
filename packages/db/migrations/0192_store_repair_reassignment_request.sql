ALTER TABLE store.repair_purchase_order_items
  ADD COLUMN reassignment_department_id uuid
    REFERENCES recruitment.departments(id),
  ADD COLUMN reassignment_requisition_id uuid
    REFERENCES store.requisitions(id);

CREATE UNIQUE INDEX store_repair_items_reassignment_requisition_unique
  ON store.repair_purchase_order_items (reassignment_requisition_id)
  WHERE reassignment_requisition_id IS NOT NULL;
