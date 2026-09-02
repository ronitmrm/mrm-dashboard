UPDATE recruitment.designations
SET name = 'HOD', updated_at = now(), row_version = row_version + 1
WHERE upper(btrim(name)) = 'HOD'
  AND name IS DISTINCT FROM 'HOD';
