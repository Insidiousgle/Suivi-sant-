// =====================================================================
// Suivi Santé — configuration (les 3 seules valeurs à remplir)
// Ces valeurs sont publiques par nature : elles ne donnent accès à rien
// sans ton e-mail et ton mot de passe. Ne mets JAMAIS ici une clé "secret"
// ou "service_role".
// =====================================================================

// Supabase > Project Settings > Data API (ou API) : "Project URL"
export const SUPABASE_URL = 'https://ocnixjyatxptbnlitfnq.supabase.co/rest/v1/';

// Supabase > Project Settings > API Keys : la clé "publishable" (sb_publishable_…)
// ou, à défaut, la clé "anon" de l'onglet "Legacy API keys"
export const SUPABASE_KEY = 'sb_publishable_4XXPC0oUFl7Pg7WEtN6G0A_sBMaPBYu';

// La "clé publique" affichée par la page cles-vapid.html
export const VAPID_PUBLIC_KEY = 'BHYftyajPgk5c_OL3mxXM0QXNNPvTEUlh5ZrU-z6RIceb-ViJ_y3umDjEVS9AnSS75y1Z5At7q_f7qjJ5V2oV9M';
