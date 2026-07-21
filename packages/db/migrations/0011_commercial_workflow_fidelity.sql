ALTER TABLE sales.enquiries
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'Email',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS delivery_terms text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS conversion_rate numeric(18,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS incoterms text,
  ADD COLUMN IF NOT EXISTS shipment_mode text,
  ADD COLUMN IF NOT EXISTS packaging_terms text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS technical_handover_status text NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS technical_handover_at timestamptz;

ALTER TABLE sales.enquiries
  ADD CONSTRAINT enquiries_conversion_rate_positive
  CHECK (conversion_rate > 0);

ALTER TABLE sales.enquiry_items
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS drawing_reference text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS technical_review_status text NOT NULL DEFAULT 'Pending Review',
  ADD COLUMN IF NOT EXISTS technical_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_information text,
  ADD COLUMN IF NOT EXISTS feasibility_reason text,
  ADD COLUMN IF NOT EXISTS technical_remarks text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS linked_enquiry_item_id uuid
    REFERENCES sales.enquiry_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link_type text,
  ADD COLUMN IF NOT EXISTS revision_type text,
  ADD COLUMN IF NOT EXISTS revision_reason text;

ALTER TABLE sales.clarification_tasks
  ADD COLUMN IF NOT EXISTS source_stage text NOT NULL DEFAULT 'Technical Review',
  ADD COLUMN IF NOT EXISTS target_stage text NOT NULL DEFAULT 'Sales';

CREATE UNIQUE INDEX clarification_tasks_one_open_target
  ON sales.clarification_tasks (enquiry_item_id, target_stage)
  WHERE status = 'Open' AND enquiry_item_id IS NOT NULL;

ALTER TABLE sales.enquiry_import_reviews
  ADD COLUMN IF NOT EXISTS enquiry_id uuid
    REFERENCES sales.enquiries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

CREATE INDEX enquiry_import_reviews_enquiry_idx
  ON sales.enquiry_import_reviews (enquiry_id, created_at DESC);

ALTER TABLE sales.enquiry_import_review_rows
  ADD COLUMN IF NOT EXISTS suggested_action text,
  ADD COLUMN IF NOT EXISTS applied_action text,
  ADD COLUMN IF NOT EXISTS matched_enquiry_item_id uuid
    REFERENCES sales.enquiry_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_product_id uuid
    REFERENCES catalog.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_enquiry_item_id uuid
    REFERENCES sales.enquiry_items(id) ON DELETE SET NULL;

ALTER TABLE sales.design_tasks
  ADD COLUMN IF NOT EXISTS portfolio_match_status text,
  ADD COLUMN IF NOT EXISTS matched_product_id uuid
    REFERENCES catalog.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS design_status text NOT NULL DEFAULT 'Pending Design',
  ADD COLUMN IF NOT EXISTS quoted_part_uid text,
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'List',
  ADD COLUMN IF NOT EXISTS design_bom_completed text NOT NULL DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS next_stage_status text NOT NULL DEFAULT 'Not Started',
  ADD COLUMN IF NOT EXISTS assigned_date timestamptz,
  ADD COLUMN IF NOT EXISTS actual_completion_date timestamptz,
  ADD COLUMN IF NOT EXISTS internal_drawing_no text,
  ADD COLUMN IF NOT EXISTS manufacturing_process text,
  ADD COLUMN IF NOT EXISTS package_process_required text,
  ADD COLUMN IF NOT EXISTS design_remarks text;

CREATE UNIQUE INDEX design_tasks_enquiry_item_unique
  ON sales.design_tasks (enquiry_item_id);

ALTER TABLE sales.design_bom_lines
  ADD COLUMN IF NOT EXISTS line_number integer,
  ADD COLUMN IF NOT EXISTS parent_line_number integer,
  ADD COLUMN IF NOT EXISTS component_source text NOT NULL DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS existing_product_id uuid
    REFERENCES catalog.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS component_item_type text NOT NULL DEFAULT 'List',
  ADD COLUMN IF NOT EXISTS package_part_uid text,
  ADD COLUMN IF NOT EXISTS package_part text,
  ADD COLUMN IF NOT EXISTS bom_item text,
  ADD COLUMN IF NOT EXISTS rod_size text,
  ADD COLUMN IF NOT EXISTS rod_type text,
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS manufacturing_process text,
  ADD COLUMN IF NOT EXISTS casting numeric(18,8),
  ADD COLUMN IF NOT EXISTS piece_weight numeric(18,8),
  ADD COLUMN IF NOT EXISTS process_required text,
  ADD COLUMN IF NOT EXISTS design_notes text;

CREATE UNIQUE INDEX design_bom_lines_task_line_unique
  ON sales.design_bom_lines (design_task_id, line_number)
  WHERE line_number IS NOT NULL;
