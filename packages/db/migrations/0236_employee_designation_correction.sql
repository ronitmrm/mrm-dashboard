-- Designation corrections move the retained assignment explicitly in one transaction.
-- Ordinary post changes continue to create and close assignments through this trigger.
CREATE OR REPLACE TRIGGER track_employee_post_assignment
AFTER INSERT OR UPDATE OF employee_name, employee_code, status,
  joining_date, last_working_date, appointed_application_id
ON recruitment.posts
FOR EACH ROW
WHEN (coalesce(current_setting('mrm.designation_correction', true), '') <> 'true')
EXECUTE FUNCTION recruitment.track_employee_post_assignment();
