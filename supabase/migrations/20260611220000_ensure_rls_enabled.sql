-- Ensure RLS is enabled on lessons table
alter table lessons enable row level security;

-- Ensure policy exists (drop and recreate to be safe)
drop policy if exists "public lesson read" on lessons;

create policy "public lesson read" on lessons
for select using (true);

-- Verify the policy
select tablename, policyname, cmd, qual, with_check
from pg_policies 
where tablename = 'lessons'
order by tablename, policyname;
