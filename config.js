// Configuration du projet Supabase (Project Settings → API).
// La clé "anon" est publique par conception : la sécurité repose sur les
// politiques RLS définies dans supabase/schema.sql.
window.APP_CONFIG = {
  SUPABASE_URL: "https://VOTRE-PROJET.supabase.co",
  SUPABASE_ANON_KEY: "VOTRE_CLE_ANON",
  // URL publique du site (utilisée dans les QR codes et les extraits Canvas)
  SITE_URL: "https://master-exec-aigp.github.io",
};
