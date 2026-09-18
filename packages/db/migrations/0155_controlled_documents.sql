BEGIN;
ALTER TABLE branding.documents DROP CONSTRAINT documents_type_check;
ALTER TABLE branding.documents ADD CONSTRAINT documents_type_check
  CHECK (type IN ('sop','notice','policy','work-instruction','controlled-document'));
ALTER TABLE branding.revisions ADD COLUMN uploaded_pdf bytea
  CHECK (uploaded_pdf IS NULL OR octet_length(uploaded_pdf) BETWEEN 1 AND 5242880);
INSERT INTO identity.permissions(key,module,name,description) VALUES
 ('branding.controlled-document.read','branding','Controlled Documents read','View uploaded documents and revision history.'),
 ('branding.controlled-document.write','branding','Controlled Documents write','Upload, revise and release controlled PDFs.');
INSERT INTO identity.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM identity.roles r CROSS JOIN identity.permissions p
WHERE r.key='administrator' AND p.key LIKE 'branding.controlled-document.%' ON CONFLICT DO NOTHING;
COMMIT;
