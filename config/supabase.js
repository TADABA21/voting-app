const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qniznennyowmzmtzomvk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuaXpuZW5ueW93bXptdHpvbXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDI3NzgsImV4cCI6MjA2OTk3ODc3OH0.J6K45_rgNedDYn80AhmGMgbJGWdgFnk99ZxjIntBfPo';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuaXpuZW5ueW93bXptdHpvbXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQwMjc3OCwiZXhwIjoyMDY5OTc4Nzc4fQ.npen9Zf2HXOW9hqZ4XQ4lqobsibFvVORqmvL22mRvjo';

// Create Supabase clients
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

module.exports = { supabase, supabaseAdmin };