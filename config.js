// Configuration du projet Supabase (Project Settings → API).
// La clé "publishable" (ex-anon) est publique par conception : la sécurité repose sur les
// politiques RLS définies dans supabase/schema.sql.
window.APP_CONFIG = {
  SUPABASE_URL: "https://tsogtbktlaxeribatzcb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_6efs75sIAXAUFdvZKwO9kw_JmjSgsY7",
  // URL publique du site (utilisée dans les QR codes et les extraits Canvas)
  SITE_URL: "https://master-exec-aigp.github.io",
};
