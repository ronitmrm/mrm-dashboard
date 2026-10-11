ALTER TABLE document_control.analysis_records
  ADD COLUMN focus text NOT NULL DEFAULT 'Not assessed'
    CHECK (focus IN ('Not assessed', 'Risk', 'Opportunity', 'Risk and Opportunity')),
  ADD COLUMN priority text NOT NULL DEFAULT 'Not assessed'
    CHECK (priority IN ('Not assessed', 'Low', 'Medium', 'High')),
  ADD COLUMN impact text NOT NULL DEFAULT '' CHECK (length(impact) <= 4000),
  ADD COLUMN expected_outcome text NOT NULL DEFAULT '' CHECK (length(expected_outcome) <= 4000),
  ADD COLUMN effectiveness_notes text NOT NULL DEFAULT '' CHECK (length(effectiveness_notes) <= 4000);

-- Source notes and completion labels remain historical claims, not confirmations
-- recorded by assigned staff. Sample cadence cannot authorize a future schedule.
-- Only untouched imported rows are normalized; retain every original source value.
WITH previous AS (
  SELECT id, organization_id, next_review_on, completion_notes, version
  FROM document_control.analysis_records
  WHERE kind = 'SWOT' AND source_payload IS NOT NULL AND version = 1 AND completed_at IS NULL
    AND (next_review_on = (reviewed_on + interval '1 month')::date OR completion_notes <> '')
  FOR UPDATE
), updated AS (
  UPDATE document_control.analysis_records r
  SET next_review_on = CASE WHEN r.next_review_on = (r.reviewed_on + interval '1 month')::date THEN NULL ELSE r.next_review_on END,
    completion_notes = '', version = r.version + 1, updated_at = now()
  FROM previous WHERE r.id = previous.id
  RETURNING r.id, r.organization_id, r.version, r.next_review_on
)
INSERT INTO audit.events (
  organization_id, event_type, target_schema, target_table, target_id, actor_user_id,
  reason, before_state, after_state, metadata, source_system, source_table, source_id
) SELECT updated.organization_id, 'iso_analysis.edited', 'document_control', 'analysis_records',
  updated.id, NULL, 'Retained source work claims in original data; removed unconfirmed completion notes and inferred review deadlines. Staff records work; QA chooses the next review.',
  jsonb_build_object('nextReviewOn', previous.next_review_on, 'completionNotes', previous.completion_notes, 'version', previous.version),
  jsonb_build_object('nextReviewOn', updated.next_review_on, 'completionNotes', '', 'version', updated.version),
  jsonb_build_object('actorName', 'Workflow policy update'),
  'mrm-dashboard', 'iso-analysis-review-policy', updated.id::text
FROM updated JOIN previous ON previous.id = updated.id;
