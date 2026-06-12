-- Add subject column to lessons table
-- Stores the specific subject for which a lesson was generated
-- (relevant for classes with multiple subjects)

alter table lessons
  add column if not exists subject text;
