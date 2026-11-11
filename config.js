// =====================================================================
// Suivi Santé — configuration (les 3 seules valeurs à remplir)
// Ces valeurs sont publiques par nature : elles ne donnent accès à rien
// sans ton e-mail et ton mot de passe. Ne mets JAMAIS ici une clé "secret"
// ou "service_role".
// =====================================================================

// Supabase > Project Settings > Data API (ou API) : "Project URL"
export const SUPABASE_URL = 'https://XXXXXXXX.supabase.co';

// Supabase > Project Settings > API Keys : la clé "publishable" (sb_publishable_…)
// ou, à défaut, la clé "anon" de l'onglet "Legacy API keys"
export const SUPABASE_KEY = 'COLLE_ICI_TA_CLE_PUBLISHABLE';

// La "clé publique" affichée par la page cles-vapid.html
export const VAPID_PUBLIC_KEY = 'COLLE_ICI_TA_CLE_PUBLIQUE_VAPID';
