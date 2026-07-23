-- Historical recruitment masters can share a display name while retaining
-- distinct stable codes referenced by approved posts.

DROP INDEX IF EXISTS recruitment.recruitment_departments_name_unique;
DROP INDEX IF EXISTS recruitment.recruitment_designations_name_unique;
