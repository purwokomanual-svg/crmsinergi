/* =========================================================
   KONFIGURASI SUPABASE
   1. Salin file ini menjadi "config.js" (di folder yang sama)
   2. Isi SUPABASE_URL dan SUPABASE_ANON_KEY dengan nilai dari:
      Supabase Dashboard > Project Settings > API
   3. "anon key" AMAN untuk ditaruh di kode sisi klien —
      keamanan data diatur lewat Row Level Security (RLS)
      yang sudah didefinisikan di supabase/schema.sql.
      JANGAN PERNAH menaruh "service_role key" di sini.
   ========================================================= */

const SUPABASE_URL = 'https://wzmyoaqojazaiggfztlt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bXlvYXFvamF6YWlnZ2Z6dGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2Njg4NDcsImV4cCI6MjA5OTI0NDg0N30.7cj_ya0ZXmt6IvLZTDBeof7l_okKmSvPa210a9w-h4c';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
