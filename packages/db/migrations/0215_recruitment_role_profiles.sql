ALTER TABLE recruitment.requirement_templates
  ADD COLUMN role_profile jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(role_profile)='object'),
  ADD COLUMN interview_questions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(interview_questions)='array'),
  ADD COLUMN original_role_description text;

-- Separate embedded screening prompts, retaining the complete source description.
DO $role_profiles$
DECLARE profile record; parts text[]; question text; questions jsonb; item integer;
BEGIN
  FOR profile IN SELECT id,organization_id,role_responsibilities FROM recruitment.requirement_templates LOOP
    parts := regexp_match(profile.role_responsibilities,
      '^(.*?)(?:Basic[ ]+)?Initial(?:[- ](?:Screening|Round))*[ -]*Questions[: ]*\s*(.*)$','is');
    questions := '[]'::jsonb; item := 0;
    IF parts IS NOT NULL THEN
      FOR question IN SELECT btrim(value) FROM regexp_split_to_table(parts[2], '(?m)^\s*\d+[.)]\s*') AS value WHERE btrim(value)<>'' LOOP
        item := item+1;
        questions := questions || jsonb_build_array(jsonb_build_object(
          'id','source-'||item,'round','Screening Round','focus','Responsibilities',
          'originalPrompt',question,
          'prompt', CASE WHEN question ~* '^Can you ' THEN
            'Explain how you would ' || regexp_replace(substr(question,9),'\?\s*(Yes\s*/\s*No)?\s*$','','i') || '. Give a specific example or demonstration.'
            ELSE 'Describe your relevant experience or demonstrate your approach: ' || regexp_replace(question,'\s*Yes\s*/\s*No\s*$','','i') END,
          'evidence','Record a specific example, demonstration or supporting evidence; a Yes/No claim alone is insufficient.'));
      END LOOP;
    END IF;
    questions := questions || '[
      {"id":"role-purpose","round":"Screening Round","focus":"Role","prompt":"Explain the purpose of this role, its main outputs and who relies on them. Give a relevant work example.","evidence":"Connect role purpose to outputs and internal or customer handoffs; verify against the role profile."},
      {"id":"responsibility-scenario","round":"Technical Round","focus":"Responsibilities","prompt":"Walk through a normal task and a quality or safety problem. What are you responsible for checking, recording and handing over?","evidence":"Task sequence, checks, records, containment and escalation; use a job-related demonstration."},
      {"id":"authority-escalation","round":"HR Round","focus":"Authority","prompt":"Which decisions could you make within this role’s authority, and which require approval? Explain how you would handle a request beyond your limits.","evidence":"Identify decision limits, approving role, escalation and evidence; confirm against the company delegation."}
    ]'::jsonb;
    UPDATE recruitment.requirement_templates SET
      original_role_description=profile.role_responsibilities,
      role_responsibilities=CASE WHEN parts IS NOT NULL THEN btrim(parts[1]) ELSE profile.role_responsibilities END,
      interview_questions=questions,row_version=row_version+1,updated_at=now()
      WHERE id=profile.id;
    INSERT INTO audit.events (organization_id,event_type,target_schema,target_table,target_id,reason,before_state,after_state,metadata,source_system,source_table,source_id)
      VALUES (profile.organization_id,'recruitment.template.structured','recruitment','requirement_templates',profile.id,
      'Separated source screening questions; role authority remains unassessed.',
      jsonb_build_object('roleResponsibilities',profile.role_responsibilities),
      jsonb_build_object('roleResponsibilities',CASE WHEN parts IS NOT NULL THEN btrim(parts[1]) ELSE profile.role_responsibilities END,'interviewQuestions',questions),
      '{"actorName":"Source migration"}','mrm-dashboard','role-profile-migration',profile.id::text);
  END LOOP;
END $role_profiles$;
