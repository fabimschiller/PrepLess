-- Fix RLS policy for observations table.
-- Old policy checked via lesson_id → lessons, which fails when lesson_id is NULL.
-- New policy checks via student_id → students → classes → user_id, which always works.

drop policy if exists "own observations" on observations;

create policy "own observations" on observations
for all
using (
  student_id in (
    select students.id from students
    join classes on classes.id = students.class_id
    where classes.user_id = auth.uid()
  )
)
with check (
  student_id in (
    select students.id from students
    join classes on classes.id = students.class_id
    where classes.user_id = auth.uid()
  )
);
