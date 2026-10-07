-- Preserve existing rows without rewriting large historical payloads at deploy.
-- All subsequent INSERTs use one permanent adapter; no dual writes.
ALTER TABLE derived.dashboard_read_models RENAME TO dashboard_legacy_read_models;

CREATE TABLE derived.dashboard_floor_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_floor_code text NOT NULL CHECK (production_floor_code IN
    ('conventional', 'conventional-02', 'cnc', 'forging')),
  version bigint NOT NULL CHECK (version > 0),
  source_fingerprint text,
  source_as_of timestamptz NOT NULL,
  payload jsonb NOT NULL,
  source_watermark jsonb NOT NULL,
  UNIQUE (organization_id, production_floor_code, version),
  UNIQUE (organization_id, production_floor_code, id)
);

CREATE TABLE derived.dashboard_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  version bigint NOT NULL CHECK (version > 0),
  source_watermark jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  root_from_floor boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_payload jsonb,
  UNIQUE (organization_id, version)
);

CREATE TABLE derived.dashboard_publication_floors (
  organization_id uuid NOT NULL,
  publication_version bigint NOT NULL,
  production_floor_code text NOT NULL,
  segment_id uuid NOT NULL,
  PRIMARY KEY (organization_id, publication_version, production_floor_code),
  FOREIGN KEY (organization_id, publication_version)
    REFERENCES derived.dashboard_publications(organization_id, version) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, production_floor_code, segment_id)
    REFERENCES derived.dashboard_floor_segments(organization_id, production_floor_code, id)
);
CREATE INDEX dashboard_publication_segment_idx
  ON derived.dashboard_publication_floors(segment_id);

CREATE VIEW derived.dashboard_read_model_heads AS
SELECT id, organization_id, version, created_at, published_at
FROM derived.dashboard_publications
UNION ALL
SELECT id, organization_id, version, created_at, NULL::timestamptz AS published_at
FROM derived.dashboard_legacy_read_models;

CREATE VIEW derived.dashboard_read_models AS
SELECT publication.id, publication.organization_id, publication.version,
  CASE WHEN publication.legacy_payload IS NOT NULL THEN publication.legacy_payload
  ELSE COALESCE(CASE WHEN publication.root_from_floor THEN root.payload END, '{}'::jsonb)
    || publication.metadata
    || jsonb_build_object('productionFloorSnapshots', COALESCE(floors.payload, '{}'::jsonb))
  END AS payload,
  publication.source_watermark, publication.created_at
FROM derived.dashboard_publications publication
LEFT JOIN derived.dashboard_publication_floors root_ref
  ON root_ref.organization_id = publication.organization_id
  AND root_ref.publication_version = publication.version
  AND root_ref.production_floor_code = 'conventional'
LEFT JOIN derived.dashboard_floor_segments root ON root.id = root_ref.segment_id
LEFT JOIN LATERAL (
  SELECT jsonb_object_agg(reference.production_floor_code, segment.payload) AS payload
  FROM derived.dashboard_publication_floors reference
  JOIN derived.dashboard_floor_segments segment ON segment.id = reference.segment_id
  WHERE reference.organization_id = publication.organization_id
    AND reference.publication_version = publication.version
) floors ON publication.legacy_payload IS NULL
UNION ALL
SELECT id, organization_id, version, payload, source_watermark, created_at
FROM derived.dashboard_legacy_read_models;

-- Targeted readers project metadata without reconstructing the organization JSON.
CREATE VIEW derived.dashboard_floor_read_models AS
SELECT publication.organization_id, publication.version AS publication_version,
  floor.code AS production_floor_code, segment.id AS segment_id,
  COALESCE(segment.version, publication.version) AS version,
  segment.source_fingerprint,
  COALESCE(segment.source_as_of, publication.created_at) AS created_at,
  publication.published_at,
  CASE WHEN publication.legacy_payload IS NOT NULL THEN COALESCE(
    NULLIF(publication.legacy_payload #> ARRAY['productionFloorSnapshots', floor.code], 'null'::jsonb),
    CASE WHEN floor.code = 'conventional'
      THEN publication.legacy_payload - 'productionFloorSnapshots' ELSE '{}'::jsonb END)
  ELSE COALESCE(segment.payload, CASE WHEN floor.code = 'conventional'
    AND NOT publication.root_from_floor THEN publication.metadata ELSE '{}'::jsonb END)
  END AS payload,
  COALESCE(segment.source_watermark, publication.source_watermark) AS source_watermark
FROM derived.dashboard_publications publication
CROSS JOIN (VALUES ('conventional'), ('conventional-02'), ('cnc'), ('forging')) floor(code)
LEFT JOIN derived.dashboard_publication_floors reference
  ON reference.organization_id = publication.organization_id
  AND reference.publication_version = publication.version
  AND reference.production_floor_code = floor.code
LEFT JOIN derived.dashboard_floor_segments segment ON segment.id = reference.segment_id
UNION ALL
SELECT legacy.organization_id, legacy.version AS publication_version,
  floor.code, NULL::uuid, legacy.version, NULL::text,
  legacy.created_at, NULL::timestamptz,
  COALESCE(NULLIF(legacy.payload #> ARRAY['productionFloorSnapshots', floor.code], 'null'::jsonb),
    CASE WHEN floor.code = 'conventional'
      THEN legacy.payload - 'productionFloorSnapshots' ELSE '{}'::jsonb END),
  legacy.source_watermark
FROM derived.dashboard_legacy_read_models legacy
CROSS JOIN (VALUES ('conventional'), ('conventional-02'), ('cnc'), ('forging')) floor(code);

CREATE FUNCTION derived.insert_dashboard_read_model() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  floor record;
  segment_id uuid;
  source_cutoff timestamptz := COALESCE(NEW.created_at, now());
  is_manifest boolean := NEW.payload->>'format' = 'mrm-floor-manifest-1';
BEGIN
  IF EXISTS (SELECT 1 FROM derived.dashboard_read_model_heads
    WHERE organization_id = NEW.organization_id AND version = NEW.version) THEN
    RAISE unique_violation USING MESSAGE = 'Dashboard publication version already exists';
  END IF;
  INSERT INTO derived.dashboard_publications (
    id, organization_id, version, source_watermark, created_at,
    root_from_floor, metadata, legacy_payload
  ) VALUES (COALESCE(NEW.id, gen_random_uuid()), NEW.organization_id, NEW.version,
    NEW.source_watermark, source_cutoff, COALESCE(is_manifest, false),
    CASE WHEN is_manifest THEN NEW.payload->'metadata'
      ELSE NEW.payload - 'productionFloorSnapshots' END,
    CASE WHEN NOT COALESCE(is_manifest, false)
      AND jsonb_typeof(NEW.payload->'productionFloorSnapshots') IS DISTINCT FROM 'object'
      THEN NEW.payload END);
  IF is_manifest THEN
    IF jsonb_typeof(NEW.payload->'segmentIds') IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(NEW.payload->'segmentIds')) <> 4 THEN
      RAISE EXCEPTION 'A dashboard manifest requires all four floor segments';
    END IF;
    FOR floor IN SELECT key, value FROM jsonb_each_text(NEW.payload->'segmentIds') LOOP
      INSERT INTO derived.dashboard_publication_floors
        (organization_id, publication_version, production_floor_code, segment_id)
      VALUES (NEW.organization_id, NEW.version, floor.key, floor.value::uuid);
    END LOOP;
  ELSIF jsonb_typeof(NEW.payload->'productionFloorSnapshots') = 'object' THEN
    FOR floor IN SELECT key, value FROM jsonb_each(NEW.payload->'productionFloorSnapshots') LOOP
      IF floor.key NOT IN ('conventional', 'conventional-02', 'cnc', 'forging') THEN
        RAISE EXCEPTION 'Unknown dashboard floor';
      END IF;
      INSERT INTO derived.dashboard_floor_segments (
        organization_id, production_floor_code, version, source_as_of, payload, source_watermark
      ) VALUES (NEW.organization_id, floor.key, NEW.version, source_cutoff, floor.value,
        jsonb_build_object('changedAt', NEW.source_watermark->'changedAt',
          'sourceCoverage', COALESCE(floor.value->'sourceCoverage', '{}'::jsonb)))
      RETURNING id INTO segment_id;
      INSERT INTO derived.dashboard_publication_floors
        (organization_id, publication_version, production_floor_code, segment_id)
      VALUES (NEW.organization_id, NEW.version, floor.key, segment_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER insert_dashboard_read_model INSTEAD OF INSERT ON derived.dashboard_read_models
  FOR EACH ROW EXECUTE FUNCTION derived.insert_dashboard_read_model();

-- Latest + rollback across both migrated legacy history and new manifests.
-- Each call deletes at most batch_size rows from each derived storage table.
CREATE FUNCTION derived.prune_dashboard_history(target_organization uuid, batch_size integer DEFAULT 5)
RETURNS TABLE(publications_deleted integer, legacy_deleted integer, segments_deleted integer)
LANGUAGE plpgsql AS $$
DECLARE keep_versions bigint[];
BEGIN
  IF batch_size < 1 OR batch_size > 100 THEN RAISE EXCEPTION 'Invalid retention batch'; END IF;
  SELECT array_agg(version) INTO keep_versions FROM (
    SELECT version FROM derived.dashboard_read_model_heads
    WHERE organization_id = target_organization ORDER BY version DESC LIMIT 2
  ) retained;
  DELETE FROM derived.dashboard_publications WHERE id IN (
    SELECT id FROM derived.dashboard_publications
    WHERE organization_id = target_organization AND NOT (version = ANY(keep_versions))
    ORDER BY version LIMIT batch_size
  );
  GET DIAGNOSTICS publications_deleted = ROW_COUNT;
  DELETE FROM derived.dashboard_legacy_read_models WHERE id IN (
    SELECT id FROM derived.dashboard_legacy_read_models
    WHERE organization_id = target_organization AND NOT (version = ANY(keep_versions))
    ORDER BY version LIMIT batch_size
  );
  GET DIAGNOSTICS legacy_deleted = ROW_COUNT;
  DELETE FROM derived.dashboard_floor_segments segment WHERE id IN (
    SELECT candidate.id FROM derived.dashboard_floor_segments candidate
    WHERE candidate.organization_id = target_organization
      AND NOT EXISTS (SELECT 1 FROM derived.dashboard_publication_floors reference
        WHERE reference.segment_id = candidate.id)
    ORDER BY candidate.version, candidate.id LIMIT batch_size
  );
  GET DIAGNOSTICS segments_deleted = ROW_COUNT;
  RETURN NEXT;
END $$;

ALTER TABLE derived.refresh_jobs ADD COLUMN force_full boolean NOT NULL DEFAULT false;

GRANT DELETE ON derived.dashboard_publications, derived.dashboard_legacy_read_models,
  derived.dashboard_floor_segments TO mrmpl_worker;
-- Do not depend on the deployment migrator's default-privilege owner.
GRANT SELECT ON derived.dashboard_publications, derived.dashboard_floor_segments,
  derived.dashboard_publication_floors, derived.dashboard_read_model_heads,
  derived.dashboard_floor_read_models, derived.dashboard_read_models
  TO mrmpl_web, mrmpl_worker, mrmpl_reporting;
GRANT INSERT ON derived.dashboard_publications, derived.dashboard_floor_segments,
  derived.dashboard_publication_floors, derived.dashboard_read_models
  TO mrmpl_web, mrmpl_worker;
