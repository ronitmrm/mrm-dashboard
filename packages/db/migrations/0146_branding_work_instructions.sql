BEGIN;
ALTER TABLE branding.documents DROP CONSTRAINT documents_type_check;
ALTER TABLE branding.documents ADD CONSTRAINT documents_type_check CHECK (type IN ('sop','notice','policy','work-instruction'));
ALTER TABLE branding.counters DROP CONSTRAINT counters_type_check;
ALTER TABLE branding.counters ADD CONSTRAINT counters_type_check CHECK (type IN ('sop','notice','policy','work-instruction'));
ALTER TABLE branding.revisions ALTER COLUMN template_version SET DEFAULT 'mrm-brand-v2';
INSERT INTO identity.permissions(key,module,name,description) VALUES
 ('branding.work-instruction.read','branding','Work Instructions read','View work instructions and PDFs.'),
 ('branding.work-instruction.write','branding','Work Instructions write','Save and issue work instructions.');
INSERT INTO identity.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM identity.roles r CROSS JOIN identity.permissions p
WHERE r.key='administrator' AND p.key LIKE 'branding.work-instruction.%' ON CONFLICT DO NOTHING;
COMMIT;
