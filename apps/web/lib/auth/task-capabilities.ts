export const administrationTaskCapabilities = {
  accessPage: "administration.access.read",
  assignPostAccess: "administration.post_access.assign",
  assignStaffRole: "administration.staff_roles.assign",
  createRole: "administration.roles.create",
  deleteRole: "administration.roles.delete",
  linkStaffAccount: "administration.staff.link",
  manageDevices: "administration.devices.manage",
  managePermissionOverrides: "administration.permission_overrides.manage",
  printScreen: "administration.screen.print",
  provisionStaff: "administration.staff.provision",
  screenWithoutWatermark: "administration.screen.no_watermark",
  unfocusedScreenView: "administration.screen.unfocused_view",
  updateRolePermissions: "administration.role_permissions.update",
  useAnyDevice: "administration.devices.bypass",
} as const

export const commercialTaskCapabilities = {
  addBomLine: "pricing.assemblies.lines.add",
  addEnquiryItem: "pricing.enquiries.items.add",
  addPurchaseOrderLine: "pricing.purchase_orders.lines.add",
  applyEngineeringChangeDecision: "pricing.ecns.decision.apply",
  approveEngineeringChangeDesign: "pricing.ecns.engineering_approve",
  applyEnquiryImportReview: "pricing.enquiries.import_review.apply",
  approveProformaInvoice: "pricing.proforma_invoices.approve",
  cancelPurchaseOrder: "pricing.purchase_orders.cancel",
  completeBulkPriceRevision: "pricing.price_revisions.complete",
  completeEngineeringChangeCosting: "pricing.ecns.costing.complete",
  completeEngineeringChangeDesign: "pricing.ecns.design.complete",
  completeFollowup: "pricing.sales.followups.complete",
  completeSalesClarification: "pricing.sales.clarifications.complete",
  createBulkPriceRevision: "pricing.price_revisions.create",
  createCustomer: "pricing.customers.create",
  createEngineeringChangeNote: "pricing.ecns.create",
  createEnquiry: "pricing.enquiries.create",
  createPoQuoteRequest: "pricing.purchase_orders.quote_requests.create",
  createPurchaseOrder: "pricing.purchase_orders.create",
  decidePurchaseOrderLinePrice: "pricing.purchase_orders.prices.decide",
  deleteBulkPriceRevisionStage: "pricing.price_revisions.stages.delete",
  deleteEnquiry: "pricing.enquiries.delete",
  deleteMaster: "pricing.masters.delete",
  generateProformaInvoice: "pricing.proforma_invoices.generate",
  handOverEnquiry: "pricing.enquiries.handover",
  importEnquiryLines: "pricing.enquiries.lines.import",
  importEnquiryRegister: "pricing.enquiries.register.import",
  importMasters: "pricing.masters.import",
  importPurchaseOrder: "pricing.purchase_orders.import",
  markProformaInvoiceSent: "pricing.proforma_invoices.mark_sent",
  prepareCosting: "pricing.costing.prepare",
  recordPricingCorrection: "pricing.corrections.record",
  renameMaster: "pricing.masters.rename",
  requestDesignClarification: "pricing.design.clarifications.request",
  requestProductCostingClarification:
    "pricing.costing.design_clarifications.request",
  reverseDesignCostingHandoff: "pricing.corrections.design_handoff.reverse",
  reverseProductEntry: "pricing.corrections.product_entry.reverse",
  saveDesign: "pricing.design.save",
  saveQuote: "pricing.quotes.prepare",
  sendQuote: "pricing.quotes.send",
  sendQuoteBackToCosting: "pricing.quotes.return_to_costing",
  stageBulkPriceRevision: "pricing.price_revisions.stages.update",
  startDesignWork: "pricing.design.start",
  updateCustomer: "pricing.customers.update",
  updateCustomerDefaultTerm: "pricing.customer_default_terms.update",
  updateDrawingHistory: "pricing.drawing_history.update",
  updateEnquiry: "pricing.enquiries.update",
  updateEnquiryItem: "pricing.enquiries.items.update",
  updateMaster: "pricing.masters.update",
  updateProductCosting: "pricing.costing.update",
  updateTechnicalReview: "pricing.technical_review.update",
  updateWebsiteProduct: "pricing.website_products.update",
  uploadPurchaseOrderFile: "pricing.purchase_orders.files.upload",
} as const

export const hrTaskCapabilities = {
  assignCandidate: "hr.candidates.assign",
  assignEmployee: "hr.employees.assign",
  bulkAssignEmployees: "hr.employees.bulk_assign",
  closeJob: "hr.jobs.close",
  completeCandidateAppointment: "hr.candidates.appointments.complete",
  createCombinedRole: "hr.combined_roles.create",
  createJob: "hr.jobs.create",
  deleteCandidateEvent: "hr.candidates.events.delete",
  deleteJob: "hr.jobs.delete",
  deletePost: "hr.approved_posts.delete",
  deleteRecruitmentMaster: "hr.masters.delete",
  logCandidateEvent: "hr.candidates.events.log",
  recordInterview: "hr.interviews.record",
  renameRecruitmentMaster: "hr.masters.rename",
  saveCandidate: "hr.candidates.save",
  savePost: "hr.approved_posts.create",
  saveRecruitmentMaster: "hr.masters.create",
  saveTemplate: "hr.job_templates.save",
  scheduleInterview: "hr.interviews.schedule",
  updateCandidateEvent: "hr.candidates.events.update",
  updateCombinedRole: "hr.combined_roles.update",
  updatePost: "hr.approved_posts.update",
  withdrawCandidateApplication: "hr.candidates.applications.withdraw",
} as const

export const taskCapabilityCatalog = {
  ...administrationTaskCapabilities,
  ...commercialTaskCapabilities,
  ...hrTaskCapabilities,
} as const

export type TaskCapability =
  (typeof taskCapabilityCatalog)[keyof typeof taskCapabilityCatalog]

export const taskCapabilityLabels = {
  [administrationTaskCapabilities.accessPage]: "Access Administration",
  [administrationTaskCapabilities.assignPostAccess]: "Assign Role To A Post",
  [administrationTaskCapabilities.assignStaffRole]: "Save Direct Roles",
  [administrationTaskCapabilities.createRole]: "Create Role",
  [administrationTaskCapabilities.deleteRole]: "Delete Role Everywhere",
  [administrationTaskCapabilities.linkStaffAccount]: "Link Login To Employee",
  [administrationTaskCapabilities.manageDevices]: "Approve Device / Reject / Revoke",
  [administrationTaskCapabilities.managePermissionOverrides]:
    "Save Individual Permissions",
  [administrationTaskCapabilities.printScreen]: "Allow Printing And Print Screen",
  [administrationTaskCapabilities.provisionStaff]:
    "Create Account & Continue / Save Login ID",
  [administrationTaskCapabilities.screenWithoutWatermark]: "Hide Screen Watermark",
  [administrationTaskCapabilities.unfocusedScreenView]:
    "Keep Content Visible When Unfocused",
  [administrationTaskCapabilities.updateRolePermissions]:
    "Save Role Access",
  [administrationTaskCapabilities.useAnyDevice]: "Use Any Device",
  [commercialTaskCapabilities.addBomLine]: "Add Bom Line",
  [commercialTaskCapabilities.addEnquiryItem]: "Add Line",
  [commercialTaskCapabilities.addPurchaseOrderLine]: "Match And Add Line",
  [commercialTaskCapabilities.applyEngineeringChangeDecision]:
    "Record",
  [commercialTaskCapabilities.approveEngineeringChangeDesign]:
    "Approve Design Revision / Reject To Design",
  [commercialTaskCapabilities.applyEnquiryImportReview]:
    "Apply Reviewed Decisions",
  [commercialTaskCapabilities.approveProformaInvoice]:
    "Approve Pi And Release Order",
  [commercialTaskCapabilities.cancelPurchaseOrder]: "Cancel Purchase Order",
  [commercialTaskCapabilities.completeBulkPriceRevision]: "Send Staged Changes To Customer Costing / Complete And Create Revisions / Complete Revision / Complete And Publish Revision",
  [commercialTaskCapabilities.completeEngineeringChangeCosting]:
    "Complete Product Costing",
  [commercialTaskCapabilities.completeEngineeringChangeDesign]:
    "Save Draft / Submit For Design Approval",
  [commercialTaskCapabilities.completeFollowup]: "Complete Follow-Up",
  [commercialTaskCapabilities.completeSalesClarification]:
    "Complete Clarification",
  [commercialTaskCapabilities.createBulkPriceRevision]:
    "Send To Product Costing / Send To Costing / Create Revision",
  [commercialTaskCapabilities.createCustomer]: "Add Customer",
  [commercialTaskCapabilities.createEngineeringChangeNote]: "Create ECN",
  [commercialTaskCapabilities.createEnquiry]: "Log Enquiry",
  [commercialTaskCapabilities.createPoQuoteRequest]: "Create Quote Request",
  [commercialTaskCapabilities.createPurchaseOrder]: "Create Purchase Order",
  [commercialTaskCapabilities.decidePurchaseOrderLinePrice]:
    "Keep Our Price / Accept Po Price",
  [commercialTaskCapabilities.deleteBulkPriceRevisionStage]:
    "Remove Stage / Delete Staged Change",
  [commercialTaskCapabilities.deleteEnquiry]: "Delete Enquiry",
  [commercialTaskCapabilities.deleteMaster]:
    "Delete Commercial / Pricing Master",
  [commercialTaskCapabilities.generateProformaInvoice]:
    "Generate Pi",
  [commercialTaskCapabilities.handOverEnquiry]: "Send To Technical Review",
  [commercialTaskCapabilities.importEnquiryLines]: "Upload",
  [commercialTaskCapabilities.importEnquiryRegister]: "Upload CSV",
  [commercialTaskCapabilities.importMasters]:
    "Upload Commercial / Pricing Masters",
  [commercialTaskCapabilities.importPurchaseOrder]:
    "Import And Match Worksheet",
  [commercialTaskCapabilities.markProformaInvoiceSent]:
    "Mark Pi Sent",
  [commercialTaskCapabilities.prepareCosting]: "Prepare Costing",
  [commercialTaskCapabilities.recordPricingCorrection]:
    "Quarantine Request",
  [commercialTaskCapabilities.renameMaster]:
    "Rename Commercial / Pricing Master",
  [commercialTaskCapabilities.requestDesignClarification]: "Send To Technical",
  [commercialTaskCapabilities.requestProductCostingClarification]:
    "Send Back To Design",
  [commercialTaskCapabilities.reverseDesignCostingHandoff]:
    "Return Handoff To Not Started",
  [commercialTaskCapabilities.reverseProductEntry]: "Delete Unused Quoted Product",
  [commercialTaskCapabilities.saveDesign]: "Save Draft / Complete Design Task / Confirm Portfolio Match",
  [commercialTaskCapabilities.saveQuote]: "Calculate And Save In Progress / Calculate And Complete Costing",
  [commercialTaskCapabilities.sendQuote]: "Send Full Enquiry",
  [commercialTaskCapabilities.sendQuoteBackToCosting]:
    "Send Back To Product Costing",
  [commercialTaskCapabilities.stageBulkPriceRevision]: "Stage Products / Stage Selected Prices / Record Decision",
  [commercialTaskCapabilities.startDesignWork]: "Start Design / Continue Design",
  [commercialTaskCapabilities.updateCustomer]: "Save Customer Changes",
  [commercialTaskCapabilities.updateCustomerDefaultTerm]:
    "Save Customer Default Terms",
  [commercialTaskCapabilities.updateDrawingHistory]: "Save Drawing History",
  [commercialTaskCapabilities.updateEnquiry]: "Update Enquiry",
  [commercialTaskCapabilities.updateEnquiryItem]: "Update Line",
  [commercialTaskCapabilities.updateMaster]: "Save Commercial / Pricing Master",
  [commercialTaskCapabilities.updateProductCosting]:
    "Save In Progress / Complete Product Costing",
  [commercialTaskCapabilities.updateTechnicalReview]: "Save Technical Review",
  [commercialTaskCapabilities.updateWebsiteProduct]: "Save Website Product",
  [commercialTaskCapabilities.uploadPurchaseOrderFile]: "Retain Source File",
  [hrTaskCapabilities.assignCandidate]: "Assign Selected Candidates To Job",
  [hrTaskCapabilities.assignEmployee]: "Update Employee Status",
  [hrTaskCapabilities.bulkAssignEmployees]: "Upload Assignments",
  [hrTaskCapabilities.closeJob]: "Close Job",
  [hrTaskCapabilities.completeCandidateAppointment]: "Appointment Details / Did Not Join / Reappoint Candidate / Edit Appointment & Offer",
  [hrTaskCapabilities.createCombinedRole]: "Create Combined Role",
  [hrTaskCapabilities.createJob]: "Create Recruitment Opening",
  [hrTaskCapabilities.deleteCandidateEvent]: "Delete",
  [hrTaskCapabilities.deleteJob]: "Delete Job",
  [hrTaskCapabilities.deletePost]: "Delete Approved Post",
  [hrTaskCapabilities.deleteRecruitmentMaster]:
    "Delete HR Department / Designation / Job Description Template",
  [hrTaskCapabilities.logCandidateEvent]: "Add To Candidate Timeline",
  [hrTaskCapabilities.recordInterview]: "Save Interview Outcome",
  [hrTaskCapabilities.renameRecruitmentMaster]:
    "Rename HR Department / Designation",
  [hrTaskCapabilities.saveCandidate]: "Save Candidate",
  [hrTaskCapabilities.savePost]: "Save Approved Post",
  [hrTaskCapabilities.saveRecruitmentMaster]: "Add HR Department / Designation",
  [hrTaskCapabilities.saveTemplate]: "Save Template",
  [hrTaskCapabilities.scheduleInterview]: "Schedule Interview",
  [hrTaskCapabilities.updateCandidateEvent]: "Edit / Save Log Changes",
  [hrTaskCapabilities.updateCombinedRole]: "Save Combined Role",
  [hrTaskCapabilities.updatePost]: "Save Approved Post Changes",
  [hrTaskCapabilities.withdrawCandidateApplication]:
    "Candidate Withdrew / Confirm Candidate Withdrawal",
} satisfies Record<TaskCapability, string>

const additionalTaskCapabilityLabels: Readonly<Record<string, string>> = {
  "artifacts.delete": "Delete Stored Files",
  "operations.attendance.write": "Record Attendance",
  "operations.corrections.write": "Reverse Existing / Reverse",
  "operations.training.write": "Record Training",
  "planning.plan.read": "View Production Plans",
  "iso.documents.manage": "Create Revision / Submit for Approval / Save Draft / Save Control Details",
  "iso.documents.approve": "Approve / Reject",
  "iso.documents.release": "Final Release",
  "store.asset_lifecycle.write": "Update Status",
  "store.asset_maintenance.write":
    "Assign Schedule",
  "store.asset_movement.write": "Record Movement / Transfer responsibility / Record Unit ID loss / Upload Locations CSV",
  "store.asset_repair.write": "Make Repair PO / Record Return",
  "store.new_item_requests.resolve": "Resolve",
  "store.new_item_requests.submit": "Send New Item Request",
  "store.purchase_orders.create": "Make Purchase Order / Save Supplier Purchase Orders",
  "store.receipts.receive": "Receive Items / Receive Selected / Save Unit Details / Record Acquisition / Record Existing Stock",
  "store.requests.issue": "Allocate / Make Order / Allocate Selected / Review Units / Transfer to Store / Cancel Request",
  "store.requests.submit": "Release Request to Store",
  "maintenance.requests.manage": "Approve / Return / Reject / Close",
  "maintenance.trade.electrical.work": "Start / Complete",
  "maintenance.trade.plumbing.work": "Start / Complete",
  "maintenance.trade.mechanical.work": "Start / Complete",
  "maintenance.tasks.write":
    "Save Progress / Complete Maintenance / Start Breakdown / Complete Breakdown",
  "maintenance.schedules.manage": "Assign Schedule",
  "maintenance.definitions.manage":
    "Create Schedule / Update Schedule / Save Checklist",
}

export function taskCapabilityLabel(capability: string) {
  return (
    taskCapabilityLabels[capability as TaskCapability] ??
    additionalTaskCapabilityLabels[capability]
  )
}
