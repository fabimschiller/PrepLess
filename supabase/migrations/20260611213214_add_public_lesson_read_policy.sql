-- Allow public read access to lessons table
-- This enables unauthenticated users to view lessons via the QR-Code link

create policy "public lesson read" on lessons
for select using (true);
