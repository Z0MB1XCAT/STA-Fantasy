// Public by design: this is the publishable (anon) key. Row-level security in the database
// decides what it can read or write. Never put the service-role key here.
export const SUPABASE_URL = 'https://tmqjpfqfumqfoxcyoicj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_mzYEaF8D9tDHt7-qIDxjOg_TSTqp9nr';
// Where visitors are sent if the main host (Netlify) is down or out of credits. Keep in step with BACKUP in sw.js.
export const FALLBACK_SITE = 'https://z0mb1xcat.github.io/STA-Fantasy/';
export const SUPABASE_JS ='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
