-- Enforce that every curriculum_unit belongs to exactly one class AND one subject.
--
-- All existing units have subject = NULL (legacy data without subject assignment)
-- and must be deleted before adding the NOT NULL constraint.

-- 1. Delete all existing curriculum units (they have subject = NULL and are invalid)
delete from curriculum_units;

-- 2. Make class_id NOT NULL
alter table curriculum_units
  alter column class_id set not null;

-- 3. Make subject NOT NULL
alter table curriculum_units
  alter column subject set not null;

-- 4. Unique constraint: within a class+subject combination, positions must be unique
alter table curriculum_units
  drop constraint if exists curriculum_units_class_subject_position_key;

alter table curriculum_units
  add constraint curriculum_units_class_subject_position_key
  unique (class_id, subject, position);

-- 5. Replace old index with a cleaner one
drop index if exists curriculum_units_subject_idx;

create index curriculum_units_class_subject_idx
  on curriculum_units (class_id, subject);
