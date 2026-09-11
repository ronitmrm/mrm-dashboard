-- Expand the physical Artifact locator for private Google Cloud Storage.
ALTER TABLE core.file_objects
  ALTER COLUMN public_url DROP NOT NULL;

ALTER TABLE core.file_objects
  ADD CONSTRAINT file_objects_provider_check
  CHECK (provider IN ('uploadthing', 'google-cloud-storage')) NOT VALID;
