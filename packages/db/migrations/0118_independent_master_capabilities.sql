-- Split existing master rights into independent scope/action permissions.
-- No legacy grants, role assignments, or business records are removed or changed.
-- The migration runner owns the transaction and checksum ledger.
CREATE TEMP TABLE master_capability_mapping (
  new_key text PRIMARY KEY,
  name text NOT NULL,
  old_keys text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO master_capability_mapping (new_key, name, old_keys)
VALUES
  ('masters.conventional.setup_name_master.read', 'Conventional-01 / Setup Name / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional.setup_name_master.save', 'Conventional-01 / Setup Name / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.setup_name_master.import', 'Conventional-01 / Setup Name / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.setup_name_master.delete', 'Conventional-01 / Setup Name / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional-02.setup_name_master.read', 'Conventional-02 / Setup Name / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional-02.setup_name_master.save', 'Conventional-02 / Setup Name / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.setup_name_master.import', 'Conventional-02 / Setup Name / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.setup_name_master.delete', 'Conventional-02 / Setup Name / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.cnc.setup_name_master.read', 'CNC-01 / Setup Name / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.cnc.setup_name_master.save', 'CNC-01 / Setup Name / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.setup_name_master.import', 'CNC-01 / Setup Name / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.setup_name_master.delete', 'CNC-01 / Setup Name / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.forging.setup_name_master.read', 'Forging / Setup Name / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.forging.setup_name_master.save', 'Forging / Setup Name / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.setup_name_master.import', 'Forging / Setup Name / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.setup_name_master.delete', 'Forging / Setup Name / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional.route.read', 'Conventional-01 / Process Route / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional.route.save', 'Conventional-01 / Process Route / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.route.import', 'Conventional-01 / Process Route / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.route.delete', 'Conventional-01 / Process Route / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional-02.route.read', 'Conventional-02 / Process Route / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional-02.route.save', 'Conventional-02 / Process Route / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.route.import', 'Conventional-02 / Process Route / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.route.delete', 'Conventional-02 / Process Route / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.cnc.route.read', 'CNC-01 / Process Route / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.cnc.route.save', 'CNC-01 / Process Route / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.route.import', 'CNC-01 / Process Route / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.route.delete', 'CNC-01 / Process Route / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.forging.route.read', 'Forging / Process Route / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.forging.route.save', 'Forging / Process Route / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.route.import', 'Forging / Process Route / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.route.delete', 'Forging / Process Route / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional.cycle.read', 'Conventional-01 / Cycle Time / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional.cycle.save', 'Conventional-01 / Cycle Time / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.cycle.import', 'Conventional-01 / Cycle Time / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.cycle.delete', 'Conventional-01 / Cycle Time / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional-02.cycle.read', 'Conventional-02 / Cycle Time / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional-02.cycle.save', 'Conventional-02 / Cycle Time / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.cycle.import', 'Conventional-02 / Cycle Time / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.cycle.delete', 'Conventional-02 / Cycle Time / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.cnc.cycle.read', 'CNC-01 / Cycle Time / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.cnc.cycle.save', 'CNC-01 / Cycle Time / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.cycle.import', 'CNC-01 / Cycle Time / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.cycle.delete', 'CNC-01 / Cycle Time / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.forging.cycle.read', 'Forging / Cycle Time / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.forging.cycle.save', 'Forging / Cycle Time / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.cycle.import', 'Forging / Cycle Time / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.cycle.delete', 'Forging / Cycle Time / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional.tooling.read', 'Conventional-01 / Tooling / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional.tooling.save', 'Conventional-01 / Tooling / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.tooling.import', 'Conventional-01 / Tooling / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.tooling.delete', 'Conventional-01 / Tooling / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional-02.tooling.read', 'Conventional-02 / Tooling / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional-02.tooling.save', 'Conventional-02 / Tooling / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.tooling.import', 'Conventional-02 / Tooling / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.tooling.delete', 'Conventional-02 / Tooling / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.cnc.tooling.read', 'CNC-01 / Tooling / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.cnc.tooling.save', 'CNC-01 / Tooling / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.tooling.import', 'CNC-01 / Tooling / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.tooling.delete', 'CNC-01 / Tooling / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.forging.tooling.read', 'Forging / Tooling / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.forging.tooling.save', 'Forging / Tooling / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.tooling.import', 'Forging / Tooling / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.tooling.delete', 'Forging / Tooling / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional.machine_master.read', 'Conventional-01 / Machine / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional.machine_master.save', 'Conventional-01 / Machine / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.machine_master.import', 'Conventional-01 / Machine / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.machine_master.delete', 'Conventional-01 / Machine / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional-02.machine_master.read', 'Conventional-02 / Machine / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional-02.machine_master.save', 'Conventional-02 / Machine / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.machine_master.import', 'Conventional-02 / Machine / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.machine_master.delete', 'Conventional-02 / Machine / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.cnc.machine_master.read', 'CNC-01 / Machine / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.cnc.machine_master.save', 'CNC-01 / Machine / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.machine_master.import', 'CNC-01 / Machine / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.machine_master.delete', 'CNC-01 / Machine / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.forging.machine_master.read', 'Forging / Machine / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.forging.machine_master.save', 'Forging / Machine / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.machine_master.import', 'Forging / Machine / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.machine_master.delete', 'Forging / Machine / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional.quality_parameter_master.read', 'Conventional-01 / Quality Inspection Parameter / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional.quality_parameter_master.save', 'Conventional-01 / Quality Inspection Parameter / save', ARRAY['quality.parameters.manage']::text[]),
  ('masters.conventional.quality_parameter_master.import', 'Conventional-01 / Quality Inspection Parameter / import', ARRAY['quality.parameters.manage']::text[]),
  ('masters.conventional.quality_parameter_master.delete', 'Conventional-01 / Quality Inspection Parameter / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional-02.quality_parameter_master.read', 'Conventional-02 / Quality Inspection Parameter / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional-02.quality_parameter_master.save', 'Conventional-02 / Quality Inspection Parameter / save', ARRAY['quality.parameters.manage']::text[]),
  ('masters.conventional-02.quality_parameter_master.import', 'Conventional-02 / Quality Inspection Parameter / import', ARRAY['quality.parameters.manage']::text[]),
  ('masters.conventional-02.quality_parameter_master.delete', 'Conventional-02 / Quality Inspection Parameter / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.cnc.quality_parameter_master.read', 'CNC-01 / Quality Inspection Parameter / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.cnc.quality_parameter_master.save', 'CNC-01 / Quality Inspection Parameter / save', ARRAY['quality.parameters.manage']::text[]),
  ('masters.cnc.quality_parameter_master.import', 'CNC-01 / Quality Inspection Parameter / import', ARRAY['quality.parameters.manage']::text[]),
  ('masters.cnc.quality_parameter_master.delete', 'CNC-01 / Quality Inspection Parameter / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.forging.quality_parameter_master.read', 'Forging / Quality Inspection Parameter / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.forging.quality_parameter_master.save', 'Forging / Quality Inspection Parameter / save', ARRAY['quality.parameters.manage']::text[]),
  ('masters.forging.quality_parameter_master.import', 'Forging / Quality Inspection Parameter / import', ARRAY['quality.parameters.manage']::text[]),
  ('masters.forging.quality_parameter_master.delete', 'Forging / Quality Inspection Parameter / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional.planning_holiday.read', 'Conventional-01 / Planning Holiday / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional.planning_holiday.save', 'Conventional-01 / Planning Holiday / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.planning_holiday.import', 'Conventional-01 / Planning Holiday / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional.planning_holiday.delete', 'Conventional-01 / Planning Holiday / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.conventional-02.planning_holiday.read', 'Conventional-02 / Planning Holiday / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.conventional-02.planning_holiday.save', 'Conventional-02 / Planning Holiday / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.planning_holiday.import', 'Conventional-02 / Planning Holiday / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.conventional-02.planning_holiday.delete', 'Conventional-02 / Planning Holiday / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.cnc.planning_holiday.read', 'CNC-01 / Planning Holiday / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.cnc.planning_holiday.save', 'CNC-01 / Planning Holiday / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.planning_holiday.import', 'CNC-01 / Planning Holiday / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.cnc.planning_holiday.delete', 'CNC-01 / Planning Holiday / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.forging.planning_holiday.read', 'Forging / Planning Holiday / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.forging.planning_holiday.save', 'Forging / Planning Holiday / save', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.planning_holiday.import', 'Forging / Planning Holiday / import', ARRAY['operations.shop_floor.write']::text[]),
  ('masters.forging.planning_holiday.delete', 'Forging / Planning Holiday / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.universal.setup_checklist_master.read', 'Universal / Setup Checklist / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.universal.setup_checklist_master.save', 'Universal / Setup Checklist / save', ARRAY['quality.parameters.manage']::text[]),
  ('masters.universal.setup_checklist_master.import', 'Universal / Setup Checklist / import', ARRAY['quality.parameters.manage']::text[]),
  ('masters.universal.setup_checklist_master.delete', 'Universal / Setup Checklist / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.universal.maintenance_checklist_master.read', 'Universal / Maintenance Checklist / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.universal.maintenance_checklist_master.save', 'Universal / Maintenance Checklist / save', ARRAY['maintenance.definitions.manage']::text[]),
  ('masters.universal.maintenance_checklist_master.import', 'Universal / Maintenance Checklist / import', ARRAY['maintenance.definitions.manage']::text[]),
  ('masters.universal.maintenance_checklist_master.delete', 'Universal / Maintenance Checklist / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.universal.maintenance_master.read', 'Universal / Maintenance Master / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.universal.maintenance_master.save', 'Universal / Maintenance Master / save', ARRAY['maintenance.definitions.manage']::text[]),
  ('masters.universal.maintenance_master.import', 'Universal / Maintenance Master / import', ARRAY['maintenance.definitions.manage']::text[]),
  ('masters.universal.maintenance_master.delete', 'Universal / Maintenance Master / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.universal.rejection_type_master.read', 'Universal / Rejection Type / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.universal.rejection_type_master.save', 'Universal / Rejection Type / save', ARRAY['quality.parameters.manage']::text[]),
  ('masters.universal.rejection_type_master.import', 'Universal / Rejection Type / import', ARRAY['quality.parameters.manage']::text[]),
  ('masters.universal.rejection_type_master.delete', 'Universal / Rejection Type / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.universal.rejection_remark_master.read', 'Universal / Rejection Remark / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.universal.rejection_remark_master.save', 'Universal / Rejection Remark / save', ARRAY['quality.parameters.manage']::text[]),
  ('masters.universal.rejection_remark_master.import', 'Universal / Rejection Remark / import', ARRAY['quality.parameters.manage']::text[]),
  ('masters.universal.rejection_remark_master.delete', 'Universal / Rejection Remark / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.universal.rejection_reason_master.read', 'Universal / Rejection Reason / read', ARRAY['operations.master_data_entry.read', 'operations.master_tables.read']::text[]),
  ('masters.universal.rejection_reason_master.save', 'Universal / Rejection Reason / save', ARRAY['quality.parameters.manage']::text[]),
  ('masters.universal.rejection_reason_master.import', 'Universal / Rejection Reason / import', ARRAY['quality.parameters.manage']::text[]),
  ('masters.universal.rejection_reason_master.delete', 'Universal / Rejection Reason / delete', ARRAY['operations.corrections.write']::text[]),
  ('masters.universal.ITEM_TYPE.read', 'Universal / Store Item Type / read', ARRAY['store.masters.read']::text[]),
  ('masters.universal.ITEM_TYPE.save', 'Universal / Store Item Type / save', ARRAY['store.masters.write']::text[]),
  ('masters.universal.ITEM_TYPE.import', 'Universal / Store Item Type / import', ARRAY['store.masters.write']::text[]),
  ('masters.universal.ITEM_TYPE.delete', 'Universal / Store Item Type / delete', ARRAY['store.masters.write']::text[]),
  ('masters.universal.CATEGORY.read', 'Universal / Asset Category / read', ARRAY['store.masters.read']::text[]),
  ('masters.universal.CATEGORY.save', 'Universal / Asset Category / save', ARRAY['store.masters.write']::text[]),
  ('masters.universal.CATEGORY.import', 'Universal / Asset Category / import', ARRAY['store.masters.write']::text[]),
  ('masters.universal.CATEGORY.delete', 'Universal / Asset Category / delete', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUBCATEGORY.read', 'Universal / Asset Subcategory / read', ARRAY['store.masters.read']::text[]),
  ('masters.universal.SUBCATEGORY.save', 'Universal / Asset Subcategory / save', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUBCATEGORY.import', 'Universal / Asset Subcategory / import', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUBCATEGORY.delete', 'Universal / Asset Subcategory / delete', ARRAY['store.masters.write']::text[]),
  ('masters.universal.ASSET_NAME.read', 'Universal / Asset Name / read', ARRAY['store.masters.read']::text[]),
  ('masters.universal.ASSET_NAME.save', 'Universal / Asset Name / save', ARRAY['store.masters.write']::text[]),
  ('masters.universal.ASSET_NAME.import', 'Universal / Asset Name / import', ARRAY['store.masters.write']::text[]),
  ('masters.universal.ASSET_NAME.delete', 'Universal / Asset Name / delete', ARRAY['store.masters.write']::text[]),
  ('masters.universal.LOCATION.read', 'Universal / Store Location / read', ARRAY['store.masters.read']::text[]),
  ('masters.universal.LOCATION.save', 'Universal / Store Location / save', ARRAY['store.masters.write']::text[]),
  ('masters.universal.LOCATION.import', 'Universal / Store Location / import', ARRAY['store.masters.write']::text[]),
  ('masters.universal.LOCATION.delete', 'Universal / Store Location / delete', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUPPLIER.read', 'Universal / Supplier / read', ARRAY['store.masters.read']::text[]),
  ('masters.universal.SUPPLIER.save', 'Universal / Supplier / save', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUPPLIER.import', 'Universal / Supplier / import', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUPPLIER.delete', 'Universal / Supplier / delete', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUPPLIER_PRICE.read', 'Universal / Supplier Price / read', ARRAY['store.masters.read']::text[]),
  ('masters.universal.SUPPLIER_PRICE.save', 'Universal / Supplier Price / save', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUPPLIER_PRICE.import', 'Universal / Supplier Price / import', ARRAY['store.masters.write']::text[]),
  ('masters.universal.SUPPLIER_PRICE.delete', 'Universal / Supplier Price / delete', ARRAY['store.masters.write']::text[]),
  ('masters.universal.VENDOR.read', 'Universal / Vendor / read', ARRAY['store.masters.read']::text[]),
  ('masters.universal.VENDOR.save', 'Universal / Vendor / save', ARRAY['store.masters.write']::text[]),
  ('masters.universal.VENDOR.import', 'Universal / Vendor / import', ARRAY['store.masters.write']::text[]),
  ('masters.universal.VENDOR.delete', 'Universal / Vendor / delete', ARRAY['store.masters.write']::text[]),
  ('masters.universal.department.read', 'Universal / Department / read', ARRAY['hr.masters.read']::text[]),
  ('masters.universal.department.save', 'Universal / Department / save', ARRAY['hr.masters.create']::text[]),
  ('masters.universal.department.rename', 'Universal / Department / rename', ARRAY['hr.masters.rename']::text[]),
  ('masters.universal.department.delete', 'Universal / Department / delete', ARRAY['hr.masters.delete']::text[]),
  ('masters.universal.designation.read', 'Universal / Designation / read', ARRAY['hr.masters.read']::text[]),
  ('masters.universal.designation.save', 'Universal / Designation / save', ARRAY['hr.masters.create']::text[]),
  ('masters.universal.designation.rename', 'Universal / Designation / rename', ARRAY['hr.masters.rename']::text[]),
  ('masters.universal.designation.delete', 'Universal / Designation / delete', ARRAY['hr.masters.delete']::text[]),
  ('masters.universal.approved_posts.read', 'Universal / Approved Posts / read', ARRAY['hr.approved_posts.read']::text[]),
  ('masters.universal.approved_posts.create', 'Universal / Approved Posts / create', ARRAY['hr.approved_posts.create']::text[]),
  ('masters.universal.approved_posts.update', 'Universal / Approved Posts / update', ARRAY['hr.approved_posts.update']::text[]),
  ('masters.universal.approved_posts.delete', 'Universal / Approved Posts / delete', ARRAY['hr.approved_posts.delete']::text[]),
  ('masters.universal.combined_approved_posts.read', 'Universal / Combined Approved Posts / read', ARRAY['hr.approved_posts.read']::text[]),
  ('masters.universal.combined_approved_posts.create', 'Universal / Combined Approved Posts / create', ARRAY['hr.combined_roles.create']::text[]),
  ('masters.universal.combined_approved_posts.update', 'Universal / Combined Approved Posts / update', ARRAY['hr.combined_roles.update']::text[]),
  ('masters.universal.candidates.read', 'Universal / Candidates / read', ARRAY['hr.candidate_entry.read']::text[]),
  ('masters.universal.candidates.save', 'Universal / Candidates / save', ARRAY['hr.candidates.save']::text[]),
  ('masters.universal.employee_assignments.read', 'Universal / Employee Master / read', ARRAY['hr.employees.read']::text[]),
  ('masters.universal.employee_assignments.save', 'Universal / Employee Master / save', ARRAY['hr.employees.assign']::text[]),
  ('masters.universal.employee_assignments.import', 'Universal / Employee Master / import', ARRAY['hr.employees.bulk_assign']::text[]),
  ('masters.universal.job_templates.read', 'Universal / HR Job Templates / read', ARRAY['hr.job_templates.read']::text[]),
  ('masters.universal.job_templates.save', 'Universal / HR Job Templates / save', ARRAY['hr.job_templates.save']::text[]),
  ('masters.universal.job_templates.delete', 'Universal / HR Job Templates / delete', ARRAY['hr.masters.delete']::text[]),
  ('masters.universal.rodType.read', 'Universal / Rod type / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.rodType.save', 'Universal / Rod type / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.rodType.import', 'Universal / Rod type / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.rodType.rename', 'Universal / Rod type / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.rodType.delete', 'Universal / Rod type / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.machineType.read', 'Universal / Machine type / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.machineType.save', 'Universal / Machine type / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.machineType.import', 'Universal / Machine type / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.machineType.rename', 'Universal / Machine type / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.machineType.delete', 'Universal / Machine type / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.process.read', 'Universal / Manufacturing process / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.process.save', 'Universal / Manufacturing process / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.process.import', 'Universal / Manufacturing process / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.process.rename', 'Universal / Manufacturing process / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.process.delete', 'Universal / Manufacturing process / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.materialRate.read', 'Universal / Material rate / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.materialRate.save', 'Universal / Material rate / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.materialRate.import', 'Universal / Material rate / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.materialRate.delete', 'Universal / Material rate / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.shippingTerm.read', 'Universal / Shipping term / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.shippingTerm.save', 'Universal / Shipping term / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.shippingTerm.import', 'Universal / Shipping term / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.shippingTerm.rename', 'Universal / Shipping term / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.shippingTerm.delete', 'Universal / Shipping term / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.packagingOption.read', 'Universal / Packaging option / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.packagingOption.save', 'Universal / Packaging option / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.packagingOption.import', 'Universal / Packaging option / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.packagingOption.rename', 'Universal / Packaging option / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.packagingOption.delete', 'Universal / Packaging option / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.buyer.read', 'Universal / Buyer / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.buyer.save', 'Universal / Buyer / save', ARRAY['pricing.masters.update', 'pricing.customer_default_terms.update']::text[]),
  ('masters.universal.buyer.import', 'Universal / Buyer / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.buyer.rename', 'Universal / Buyer / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.buyer.delete', 'Universal / Buyer / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.incoterms.read', 'Universal / Incoterms / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.incoterms.save', 'Universal / Incoterms / save', ARRAY['pricing.masters.update', 'pricing.customer_default_terms.update']::text[]),
  ('masters.universal.incoterms.import', 'Universal / Incoterms / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.incoterms.rename', 'Universal / Incoterms / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.incoterms.delete', 'Universal / Incoterms / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.payment_terms.read', 'Universal / Payment terms / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.payment_terms.save', 'Universal / Payment terms / save', ARRAY['pricing.masters.update', 'pricing.customer_default_terms.update']::text[]),
  ('masters.universal.payment_terms.import', 'Universal / Payment terms / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.payment_terms.rename', 'Universal / Payment terms / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.payment_terms.delete', 'Universal / Payment terms / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.shipment_mode.read', 'Universal / Shipment mode / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.shipment_mode.save', 'Universal / Shipment mode / save', ARRAY['pricing.masters.update', 'pricing.customer_default_terms.update']::text[]),
  ('masters.universal.shipment_mode.import', 'Universal / Shipment mode / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.shipment_mode.rename', 'Universal / Shipment mode / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.shipment_mode.delete', 'Universal / Shipment mode / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.packaging_terms.read', 'Universal / Packaging terms / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.packaging_terms.save', 'Universal / Packaging terms / save', ARRAY['pricing.masters.update', 'pricing.customer_default_terms.update']::text[]),
  ('masters.universal.packaging_terms.import', 'Universal / Packaging terms / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.packaging_terms.rename', 'Universal / Packaging terms / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.packaging_terms.delete', 'Universal / Packaging terms / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.quoteTerm.read', 'Universal / Quote PDF term / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.quoteTerm.save', 'Universal / Quote PDF term / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.quoteTerm.import', 'Universal / Quote PDF term / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.quoteTerm.rename', 'Universal / Quote PDF term / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.quoteTerm.delete', 'Universal / Quote PDF term / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.commercial_customers.read', 'Universal / Customers / read', ARRAY['pricing.customers.read']::text[]),
  ('masters.universal.commercial_customers.create', 'Universal / Customers / create', ARRAY['pricing.customers.create']::text[]),
  ('masters.universal.commercial_customers.update', 'Universal / Customers / update', ARRAY['pricing.customers.update']::text[]),
  ('masters.universal.commercial_customers.import', 'Universal / Customers / import', ARRAY['pricing.customers.create']::text[]),
  ('masters.universal.commercial_website_products.read', 'Universal / Website Product Data / read', ARRAY['pricing.website_products.read']::text[]),
  ('masters.universal.commercial_website_products.save', 'Universal / Website Product Data / save', ARRAY['pricing.website_products.update']::text[]),
  ('masters.universal.materialGrade.read', 'Universal / Material Grade / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.materialGrade.save', 'Universal / Material Grade / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.materialGrade.import', 'Universal / Material Grade / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.materialGrade.rename', 'Universal / Material Grade / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.materialGrade.delete', 'Universal / Material Grade / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.category.read', 'Universal / Design Category / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.category.save', 'Universal / Design Category / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.category.import', 'Universal / Design Category / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.category.rename', 'Universal / Design Category / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.category.delete', 'Universal / Design Category / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.subcategory.read', 'Universal / Design Subcategory / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.subcategory.save', 'Universal / Design Subcategory / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.subcategory.import', 'Universal / Design Subcategory / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.subcategory.rename', 'Universal / Design Subcategory / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.subcategory.delete', 'Universal / Design Subcategory / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.application.read', 'Universal / Website Application / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.application.save', 'Universal / Website Application / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.application.import', 'Universal / Website Application / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.application.rename', 'Universal / Website Application / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.application.delete', 'Universal / Website Application / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.certification.read', 'Universal / Website Certification / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.certification.save', 'Universal / Website Certification / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.certification.import', 'Universal / Website Certification / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.certification.rename', 'Universal / Website Certification / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.certification.delete', 'Universal / Website Certification / delete', ARRAY['pricing.masters.delete']::text[]),
  ('masters.universal.websiteField.read', 'Universal / Website Field Option / read', ARRAY['pricing.masters.read']::text[]),
  ('masters.universal.websiteField.save', 'Universal / Website Field Option / save', ARRAY['pricing.masters.update']::text[]),
  ('masters.universal.websiteField.import', 'Universal / Website Field Option / import', ARRAY['pricing.masters.import']::text[]),
  ('masters.universal.websiteField.rename', 'Universal / Website Field Option / rename', ARRAY['pricing.masters.rename']::text[]),
  ('masters.universal.websiteField.delete', 'Universal / Website Field Option / delete', ARRAY['pricing.masters.delete']::text[]);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.permissions WHERE key LIKE 'masters.%') THEN
    RAISE EXCEPTION 'Master permissions already exist; review the existing configuration before this cutover.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM master_capability_mapping m
    CROSS JOIN LATERAL unnest(m.old_keys) AS source(key)
    LEFT JOIN identity.permissions p ON p.key = source.key
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A legacy master permission is missing; refusing an incomplete backfill.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM identity.user_permission_overrides u
    JOIN identity.permissions p ON p.id = u.permission_id
    JOIN master_capability_mapping m ON p.key = ANY(m.old_keys)
  ) THEN
    RAISE EXCEPTION 'Master permission overrides require explicit per-user migration before cutover.';
  END IF;
  -- Legacy page guards allowed these umbrella reads only when an account had
  -- no granular page grant. A role-level check is deliberately conservative:
  -- do not silently remove that access when converting exact source keys.
  IF EXISTS (
    SELECT rp.role_id
    FROM identity.role_permissions rp
    JOIN identity.permissions p ON p.id = rp.permission_id
    GROUP BY rp.role_id
    HAVING bool_or(p.key = 'hr.recruitment.read')
      AND NOT bool_or(p.key = ANY(ARRAY[
        'hr.masters.read', 'hr.job_templates.read', 'hr.approved_posts.read',
        'hr.candidate_entry.read', 'hr.jobs.read', 'hr.candidate_search.read',
        'hr.conversations.read', 'hr.interview_schedule.read',
        'hr.interview_workspace.read'
      ]::text[]))
  ) THEN
    RAISE EXCEPTION 'A legacy-only HR reader needs explicit master read mapping before cutover.';
  END IF;
  IF EXISTS (
    SELECT rp.role_id
    FROM identity.role_permissions rp
    JOIN identity.permissions p ON p.id = rp.permission_id
    GROUP BY rp.role_id
    HAVING bool_or(p.key = 'operations.dashboard.read')
      AND NOT bool_or(
        p.key = ANY(ARRAY[
          'operations.master_data_entry.read', 'quality.first_piece_page.read',
          'operations.job_cards.read', 'planning.machine_detail.read',
          'operations.machines.read', 'operations.machinist_tasks.read',
          'maintenance.workspace.read', 'planning.part_readiness.read',
          'operations.master_tables.read', 'operations.operational_entry.read',
          'planning.control.read', 'planning.planner_actions.read',
          'operations.production_dashboard.read', 'operations.production_sessions.read',
          'quality.control_tasks.read', 'operations.shop_floor_status.read',
          'operations.shop_floor_tasks.read'
        ]::text[])
        OR p.key ~ (
          '^operations[.]floors[.](conventional|conventional-02|cnc|forging)[.]'
          || '(first_piece_inspection|job_cards|machine_detail|machinist_tasks|part_readiness|planning_control|planner_actions|production_sessions|quality_control_tasks|shop_floor_status|shop_floor_tasks)[.]read$'
        )
      )
  ) THEN
    RAISE EXCEPTION 'A legacy-only production reader needs explicit master read mapping before cutover.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM identity.role_permissions rp
    JOIN identity.permissions p ON p.id = rp.permission_id
    WHERE p.key = 'pricing.masters.import'
      AND NOT EXISTS (
        SELECT 1 FROM identity.role_permissions customer_grant
        JOIN identity.permissions customer_permission ON customer_permission.id = customer_grant.permission_id
        WHERE customer_grant.role_id = rp.role_id
          AND customer_permission.key IN ('pricing.customers.create', 'pricing.customers.update')
        GROUP BY customer_grant.role_id HAVING count(DISTINCT customer_permission.key) = 2
      )
  ) THEN
    RAISE EXCEPTION 'A workbook importer needs explicit customer import mapping before cutover.';
  END IF;
END $$;

CREATE TEMP TABLE master_role_backfill ON COMMIT DROP AS
SELECT DISTINCT rp.role_id, m.new_key
FROM identity.role_permissions rp
JOIN identity.permissions p ON p.id = rp.permission_id
JOIN master_capability_mapping m ON p.key = ANY(m.old_keys);

INSERT INTO identity.permissions (key, module, name, description)
SELECT new_key, 'masters', name,
  'Independent access to this master and scope; grants no sibling master or legacy umbrella permission.'
FROM master_capability_mapping;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT planned.role_id, p.id
FROM master_role_backfill planned
JOIN identity.permissions p ON p.key = planned.new_key;

DO $$
BEGIN
  IF EXISTS (
    (SELECT rp.role_id, p.key AS new_key
     FROM identity.role_permissions rp
     JOIN identity.permissions p ON p.id = rp.permission_id
     WHERE p.key LIKE 'masters.%'
     EXCEPT SELECT role_id, new_key FROM master_role_backfill)
    UNION ALL
    (SELECT role_id, new_key FROM master_role_backfill
     EXCEPT SELECT rp.role_id, p.key
     FROM identity.role_permissions rp
     JOIN identity.permissions p ON p.id = rp.permission_id)
  ) THEN
    RAISE EXCEPTION 'Master role grants differ from their existing permission sources.';
  END IF;
END $$;
