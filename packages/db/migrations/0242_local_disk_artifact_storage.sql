-- Self-hosted deployments keep retained files on the server's local disk.
ALTER TABLE core.file_objects
  DROP CONSTRAINT file_objects_provider_check,
  ADD CONSTRAINT file_objects_provider_check
    CHECK (provider IN ('uploadthing', 'google-cloud-storage', 'local-disk')) NOT VALID;
