-- Add subject column to curriculum_units
-- Each curriculum unit now belongs to a specific subject,
-- enabling per-subject curriculum plans within a class.

alter table curriculum_units
  add column if not exists subject text;

-- Index for efficient subject-based filtering
create index if not exists curriculum_units_subject_idx
  on curriculum_units (class_id, subject);
