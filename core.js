// Suivi Santé — données, dates, rappels, notifications
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY } from './config.js';

export const configOk = !SUPABASE_URL.includes('XXXXXXXX') && !SUPABASE_KEY.startsWith('COLLE_ICI');
export const db = createClient(configOk ? SUPABASE_URL : 'https://exemple.supabase.co', configOk ? SUPABASE_KEY : 'x');

// ---------- Couleurs par personne ----------
export const THEMES = {
  p1: { c: '#1F7A4D', ink: '#FFFFFF', tint: '#E2F2E8', text: '#1F7A4D', dark: '#155C39', line: '#1F7A4D' },
  p2: { c: '#EE7B30', ink: '#2B1303', tint: '#FDEADB', text: '#9A4A10', dark: '#7A3A0B', line: '#C9601A' },
};
export function themeStyle(slot) {
  const t = THEMES[slot];
  if (!t) return '';
  return `--c:${t.c};--c-ink:${t.ink};--c-tint:${t.tint};--c-text:${t.text};--c-dark:${t.dark};--c-line:${t.line}`;
}

// ---------- Accès aux données ----------
export async function q(promesse) {
  const { data, error } = await promesse;
  if (error) throw error;
  return data;
}
export function pick(obj, cles) {
  const r = {};
  for (const k of cles) if (obj[k] !== undefined) r[k] = obj[k] === '' ? null : obj[k];
  return r;
}

export const store = { user: null, personnes: [], reglages: null };
export const personneParSlot = (slot) => store.personnes.find((p) => p.slot === slot);
export const personneParId = (id) => store.personnes.find((p) => p.id === id);
export const personnesOptions = () => store.personnes.map((p) => ({ value: p.id, label: p.prenom }));

export async function chargerBase() {
  let ps = await q(db.from('personnes').select('*').order('slot'));
  const manquants = ['p1', 'p2'].filter((s) => !ps.find((p) => p.slot === s));
  if (manquants.length) {
    await q(db.from('personnes').insert(manquants.map((s) => ({ slot: s, prenom: s === 'p1' ? 'Papi' : 'Mamie' }))));
    ps = await q(db.from('personnes').select('*').order('slot'));
  }
  store.personnes = ps;
  let r = await q(db.from('reglages').select('*').maybeSingle());
  if (!r) r = await q(db.from('reglages').insert({}).select().single());
  store.reglages = r;
}
export async function rechargerPersonnes() {
  store.personnes = await q(db.from('personnes').select('*').order('slot'));
}

// ---------- Dates ----------
export function D(x) {
  if (x instanceof Date) return new Date(x);
  if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) {
    const [y, m, d] = x.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(x);
}
const f = (o) => new Intl.DateTimeFormat('fr-FR', o);
export const fmt = {
  jour: (d) => f({ weekday: 'long', day: 'numeric', month: 'long' }).format(D(d)),
  court: (d) => f({ weekday: 'short', day: 'numeric', month: 'short' }).format(D(d)),
  date: (d) => f({ day: 'numeric', month: 'long', year: 'numeric' }).format(D(d)),
  dateCourte: (d) => f({ day: 'numeric', month: 'short' }).format(D(d)),
  heure: (d) => f({ hour: '2-digit', minute: '2-digit' }).format(D(d)),
  mois: (d) => f({ month: 'long', year: 'numeric' }).format(D(d)),
  moisCourt: (d) => f({ month: 'short', year: '2-digit' }).format(D(d)),
  dow: (d) => f({ weekday: 'short' }).format(D(d)).replace('.', '').toUpperCase(),
  num: (v) => (v == null ? '' : String(v).replace('.', ',')),
};
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export function isoDate(d) {
  d = D(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function ajouterJours(d, n) { const x = D(d); x.setDate(x.getDate() + n); return x; }
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
export function joursAvant(d) {
  const a = D(d); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}
export function relatif(d) {
  const n = joursAvant(d);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return 'Demain';
  if (n === -1) return 'Hier';
  if (n < 0) return `En retard de ${-n} j`;
  if (n < 7) return `Dans ${n} jours`;
  return cap(fmt.court(d));
}
export function age(naissance) {
  if (!naissance) return null;
  const n = D(naissance), t = new Date();
  let a = t.getFullYear() - n.getFullYear();
  if (t.getMonth() < n.getMonth() || (t.getMonth() === n.getMonth() && t.getDate() < n.getDate())) a--;
  return a;
}

// ---------- Rappels automatiques ----------
export function libJours(j, zero = 'Le jour même') {
  if (j === 0) return zero;
  if (j === 1) return 'La veille';
  if (j === 7) return '1 semaine avant';
  if (j === 14) return '2 semaines avant';
  if (j === 30) return '1 mois avant';
  return `${j} jours avant`;
}
function aHeure(date, jours, heure) {
  const x = D(date);
  x.setDate(x.getDate() - jours);
  x.setHours(heure, 0, 0, 0);
  return x;
}

export async function syncRdv(rdv) {
  await q(db.from('rappels').delete().eq('rdv_id', rdv.id).is('envoye_le', null));
  if (rdv.statut !== 'prevu') return;
  const reg = store.reglages;
  const jours = rdv.rappels_jours ?? reg.rdv_jours;
  const quand = new Date(rdv.date);
  const now = new Date();
  const fin = `${rdv.lieu ? ' · ' + rdv.lieu : ''}${rdv.a_jeun ? ' · à jeun' : ''}`;
  const rows = [];
  for (const j of jours) {
    const at = j === 0 ? new Date(quand.getTime() - 2 * 3600e3) : aHeure(quand, j, reg.heure_rappel);
    if (at <= now) continue;
    const quandTxt = j === 0 ? "Aujourd'hui" : j === 1 ? 'Demain' : `Dans ${j} jours (${fmt.court(quand)})`;
    rows.push({
      personne_id: rdv.personne_id, rdv_id: rdv.id, origine: 'rdv', titre: rdv.titre,
      message: `${quandTxt} à ${fmt.heure(quand)}${fin}`, quand: at.toISOString(),
    });
  }
  if (rows.length) await q(db.from('rappels').insert(rows));
}

export async function syncTache(t) {
  await q(db.from('rappels').delete().eq('tache_id', t.id).is('envoye_le', null));
  if (t.fait || !t.echeance) return;
  const reg = store.reglages;
  const now = new Date();
  const rows = [];
  for (const j of t.rappels_jours ?? reg.tache_jours) {
    const at = aHeure(t.echeance, j, reg.heure_rappel);
    if (at <= now) continue;
    rows.push({
      personne_id: t.personne_id, tache_id: t.id, origine: 'tache', titre: t.titre,
      message: j === 0 ? "À faire aujourd'hui" : `À faire ${j === 1 ? 'demain' : 'dans ' + j + ' jours'} (${fmt.court(t.echeance)})`,
      quand: at.toISOString(),
    });
  }
  if (rows.length) await q(db.from('rappels').insert(rows));
}

export async function syncMedicament(m) {
  await q(db.from('rappels').delete().eq('medicament_id', m.id).is('envoye_le', null));
  if (!m.actif || !m.fin_ordonnance || joursAvant(m.fin_ordonnance) < 0) return;
  const reg = store.reglages;
  let at = aHeure(m.fin_ordonnance, reg.ordonnance_jours, reg.heure_rappel);
  if (at <= new Date()) at = new Date(Date.now() + 60e3);
  await q(db.from('rappels').insert({
    personne_id: m.personne_id, medicament_id: m.id, origine: 'ordonnance',
    titre: 'Ordonnance à renouveler',
    message: `${m.nom} — l'ordonnance se termine le ${fmt.date(m.fin_ordonnance)}`,
    quand: at.toISOString(),
  }));
}

// Recalcule tous les rappels automatiques qui suivent les réglages par défaut
export async function resyncTout() {
  const rdvs = await q(db.from('rendez_vous').select('*').eq('statut', 'prevu').gte('date', new Date().toISOString()));
  for (const r of rdvs) if (r.rappels_jours == null) await syncRdv(r);
  const taches = await q(db.from('taches').select('*').eq('fait', false).gte('echeance', isoDate(new Date())));
  for (const t of taches) if (t.rappels_jours == null) await syncTache(t);
  const meds = await q(db.from('medicaments').select('*').eq('actif', true).not('fin_ordonnance', 'is', null));
  for (const m of meds) await syncMedicament(m);
}

// ---------- Fichiers (PDF, photos) ----------
export async function envoyerFichier(file) {
  const nom = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
  const path = `${store.user.id}/${Date.now()}-${nom}`;
  await q(db.storage.from('documents').upload(path, file, { contentType: file.type || undefined }));
  return path;
}
export async function ouvrirFichier(path) {
  const w = window.open('', '_blank');
  const { data, error } = await db.storage.from('documents').createSignedUrl(path, 600);
  if (error) { if (w) w.close(); throw error; }
  if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
}
export const nomFichier = (path) => (path ? path.split('/').pop().replace(/^\d+-/, '') : '');
export async function supprimerFichier(path) {
  if (path) await db.storage.from('documents').remove([path]);
}

// ---------- Notifications ----------
function cleVersOctets(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
export const estInstallee = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export async function etatNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'non-supporte';
  if (Notification.permission === 'denied') return 'refuse';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? 'actif' : 'inactif';
}

export async function activerNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error("Sur iPhone, ouvre l'appli depuis son icône sur l'écran d'accueil (pas depuis Safari).");
  }
  if (VAPID_PUBLIC_KEY.startsWith('COLLE_ICI')) throw new Error('La clé publique VAPID manque dans config.js.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Autorise-les dans Réglages iPhone > Notifications > Suivi Santé.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVersOctets(VAPID_PUBLIC_KEY) });
  }
  const j = sub.toJSON();
  await q(db.from('push_abonnements').upsert(
    { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, appareil: navigator.userAgent.slice(0, 160) },
    { onConflict: 'endpoint' },
  ));
}

export async function notificationTest() {
  const { data, error } = await db.functions.invoke('envoyer-rappels', { body: { test: true } });
  if (error) throw error;
  return data;
}

// ---------- Prises de sang ----------
export const MARQUEURS = [
  ['Hémoglobine', 'g/dL'], ['VGM', 'fL'], ['Leucocytes', 'G/L'], ['Plaquettes', 'G/L'],
  ['Ferritine', 'µg/L'], ['Créatinine', 'µmol/L'], ['DFG', 'mL/min'], ['Glycémie', 'g/L'],
  ['HbA1c', '%'], ['Cholestérol LDL', 'g/L'], ['CRP', 'mg/L'], ['Potassium', 'mmol/L'],
  ['Sodium', 'mmol/L'], ['TSH', 'mUI/L'], ['INR', ''], ['Vitamine D', 'ng/mL'],
];
export function statutValeur(v, min, max) {
  if (min != null && v < Number(min)) return 'bas';
  if (max != null && v > Number(max)) return 'haut';
  if (min != null || max != null) return 'normal';
  return '';
}
export const libStatut = { bas: 'Bas', haut: 'Haut', normal: 'Normal', '': '' };
export function nombre(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}
