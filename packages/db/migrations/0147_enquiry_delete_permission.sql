-- Enquiry deletion enforces Sales ownership and unstarted work in the repository.
-- The application role also needs the underlying table privilege.
GRANT DELETE ON sales.enquiries TO mrmpl_web;
