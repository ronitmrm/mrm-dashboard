-- Sales may remove intake lines before Design or costing starts.
-- The application checks ownership and work state within the deletion transaction.
GRANT DELETE ON core.file_links, sales.design_tasks, sales.enquiry_items TO mrmpl_web;
