ALTER TABLE recruitment.requirement_templates
  ADD COLUMN questions text NOT NULL DEFAULT '';

-- Keep structured source columns intact; current templates use two text areas.
WITH converted AS (
  SELECT template.id, template.organization_id,
    jsonb_build_object(
      'roleResponsibilities', template.role_responsibilities,
      'roleProfile', template.role_profile,
      'interviewQuestions', template.interview_questions
    ) AS before_state,
    nullif(concat_ws(E'\n\n',
      nullif(template.role_responsibilities, ''), profile.description
    ), '') AS description,
    COALESCE(bank.questions, '') AS questions
  FROM recruitment.requirement_templates template
  CROSS JOIN LATERAL (
    SELECT string_agg(field.label || E'\n' || field.content, E'\n\n' ORDER BY field.position) AS description
    FROM (VALUES
      (1, 'Role purpose', template.role_profile->>'purpose'),
      (2, 'Reports to / accountability', template.role_profile->>'reportsTo'),
      (3, 'Decision authority', template.role_profile->>'authority'),
      (4, 'Authority limits / required approvals', template.role_profile->>'limits'),
      (5, 'Escalation and handoffs', template.role_profile->>'escalation'),
      (6, 'Accountability / expected results', template.role_profile->>'measures'),
      (7, 'Required competence / training', template.role_profile->>'competence')
    ) AS field(position, label, content)
    WHERE btrim(field.content) <> ''
  ) profile
  CROSS JOIN LATERAL (
    SELECT string_agg(concat_ws(E'\n',
      question->>'prompt',
      CASE WHEN btrim(question->>'evidence') <> ''
        THEN 'Evidence to seek: ' || (question->>'evidence') END
    ), E'\n\n' ORDER BY position) AS questions
    FROM jsonb_array_elements(template.interview_questions) WITH ORDINALITY AS item(question, position)
  ) bank
), saved AS (
  UPDATE recruitment.requirement_templates template
  SET role_responsibilities = converted.description,
    questions = converted.questions,
    row_version = template.row_version + 1,
    updated_at = now()
  FROM converted
  WHERE template.id = converted.id
  RETURNING template.id, template.organization_id, converted.before_state,
    template.role_responsibilities, template.questions
)
INSERT INTO audit.events (
  organization_id, event_type, target_schema, target_table, target_id,
  reason, before_state, after_state, metadata, source_system, source_table, source_id
)
SELECT organization_id, 'recruitment.template.text_areas', 'recruitment',
  'requirement_templates', id,
  'Simplified job description and questions to separate free-text areas; structured source retained.',
  before_state,
  jsonb_build_object('roleResponsibilities', role_responsibilities, 'questions', questions),
  '{"actorName":"Source migration"}'::jsonb,
  'mrm-dashboard', 'job-template-text-migration', id::text
FROM saved;
