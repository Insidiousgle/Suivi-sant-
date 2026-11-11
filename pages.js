// Suivi Santé — écrans
import {
  html, useState, useEffect, useMemo, useData, Etat, go, params, toast, Icon, Nav, Hero, OngletsPersonne,
  FormSheet, Champ, Section, DateBloc, Tag, Vide, Texte, Courbe, Sparkline,
} from './ui.js';
import {
  db, q, pick, store, THEMES, themeStyle, personneParSlot, personneParId, personnesOptions, rechargerPersonnes,
  fmt, D, cap, isoDate, ajouterJours, joursAvant, relatif, age, syncRdv, syncTache, syncMedicament, resyncTout,
  envoyerFichier, ouvrirFichier, nomFichier, supprimerFichier, etatNotifications, activerNotifications,
  notificationTest, estInstallee, MARQUEURS, statutValeur, libStatut, nombre,
} from './core.js';

export { Nav };

const lignes = (t) => (t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const MOMENTS = [
  ['matin', 'Matin', 'au petit-déjeuner', 'sun'],
  ['midi', 'Midi', 'au déjeuner', 'plate'],
  ['soir', 'Soir', 'au dîner', 'moon'],
  ['coucher', 'Au coucher', '', 'bed'],
  ['si_besoin', 'Si besoin', '', 'drop'],
];
const posologie = (m) => MOMENTS.filter(([k]) => m[k]).map(([k, l]) => `${l} : ${m[k]}`).join(' · ');
const ouvrir = (path) => ouvrirFichier(path).catch((e) => toast(e.message));
const iconeSpecialite = (nom = '') => {
  const n = nom.toLowerCase();
  if (n.includes('cardio')) return 'heart';
  if (n.includes('ophtalm') || n.includes('yeux')) return 'eye';
  if (n.includes('sang') || n.includes('labo') || n.includes('néphro') || n.includes('nephro')) return 'drop';
  return 'cross';
};
function PasTrouve() {
  return html`<div class="page"><${Vide}>Cette page n'existe pas. <a href="#/">Retour à l'accueil</a><//></div>`;
}

// =====================================================================
// Formulaires
// =====================================================================
export function TacheSheet({ value = {}, onClose, onSaved }) {
  const fields = [
    { k: 'titre', label: 'Tâche', required: true, placeholder: "Ex. : renouveler l'ordonnance" },
    { k: 'personne_id', label: 'Pour', type: 'select', options: personnesOptions(), empty: 'Les deux / personne en particulier' },
    { k: 'echeance', label: 'À faire pour le', type: 'date' },
    { k: 'rappels_jours', label: 'Me prévenir', type: 'jours', defaut: store.reglages.tache_jours, when: (d) => !!d.echeance },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ];
  return html`<${FormSheet} titre=${value.id ? 'Modifier la tâche' : 'Nouvelle tâche'} fields=${fields} value=${value} onClose=${onClose}
    onSave=${async (d) => {
      const row = pick(d, ['titre', 'personne_id', 'echeance', 'rappels_jours', 'notes', 'rdv_id']);
      const t = d.id
        ? await q(db.from('taches').update(row).eq('id', d.id).select().single())
        : await q(db.from('taches').insert(row).select().single());
      await syncTache(t);
      onSaved && onSaved();
    }}
    onDelete=${value.id ? async () => { await q(db.from('taches').delete().eq('id', value.id)); onSaved && onSaved(); } : null} />`;
}

export function RappelSheet({ value = {}, onClose, onSaved }) {
  const fields = [
    { k: 'titre', label: 'Rappel', required: true, placeholder: 'Ex. : vaccin grippe, commander les bas de contention' },
    { k: 'message', label: 'Détail (affiché dans la notification)', type: 'textarea', rows: 2 },
    { k: 'personne_id', label: 'Pour', type: 'select', options: personnesOptions(), empty: 'Personne en particulier' },
    { k: 'quand', label: 'Quand', type: 'datetime', required: true },
    { k: 'repetition', label: 'Répéter', type: 'select', empty: false, options: [
      { value: 'aucune', label: 'Une seule fois' }, { value: 'semaine', label: 'Chaque semaine' },
      { value: 'mois', label: 'Chaque mois' }, { value: 'annee', label: 'Chaque année' },
    ] },
  ];
  return html`<${FormSheet} titre=${value.id ? 'Modifier le rappel' : 'Nouveau rappel'} fields=${fields}
    value=${{ repetition: 'aucune', ...value }} onClose=${onClose}
    onSave=${async (d) => {
      const row = { ...pick(d, ['titre', 'message', 'personne_id', 'quand', 'repetition']), origine: 'perso', envoye_le: null };
      if (d.id) await q(db.from('rappels').update(row).eq('id', d.id));
      else await q(db.from('rappels').insert(row));
      onSaved && onSaved();
    }}
    onDelete=${value.id ? async () => { await q(db.from('rappels').delete().eq('id', value.id)); onSaved && onSaved(); } : null} />`;
}

const CHAMPS_RDV = ['personne_id', 'specialite_id', 'titre', 'date', 'lieu', 'accompagnant', 'transport', 'a_jeun', 'questions',
  'a_apporter', 'rappels_jours', 'statut', 'compte_rendu', 'a_transmettre', 'a_surveiller', 'fichier_path'];

async function sauverRdv(d) {
  const x = { ...d };
  if (x.fichier_path instanceof File) x.fichier_path = await envoyerFichier(x.fichier_path);
  const row = pick(x, CHAMPS_RDV);
  const r = x.id
    ? await q(db.from('rendez_vous').update(row).eq('id', x.id).select().single())
    : await q(db.from('rendez_vous').insert(row).select().single());
  await syncRdv(r);
  return r;
}

export function RdvSheet({ value = {}, mode = 'avant', onClose, onSaved }) {
  const [specs] = useData(() => q(db.from('specialites').select('id, nom, personne_id').order('nom')));
  const avant = [
    { k: 'personne_id', label: 'Pour', type: 'select', options: personnesOptions(), empty: false, required: true },
    { k: 'titre', label: 'Rendez-vous', required: true, placeholder: 'Cardiologue, prise de sang…' },
    { k: 'specialite_id', label: 'Spécialité', type: 'select', empty: 'Aucune',
      options: (d) => (specs || []).filter((s) => s.personne_id === d.personne_id).map((s) => ({ value: s.id, label: s.nom })) },
    { k: 'date', label: 'Date et heure', type: 'datetime', required: true },
    { k: 'lieu', label: 'Lieu / médecin', placeholder: 'Dr Martin · Clinique du Parc' },
    { k: 'accompagnant', label: 'Qui accompagne ?' },
    { k: 'transport', label: 'Transport', placeholder: 'Taxi conventionné, voiture…' },
    { k: 'a_jeun', label: 'À jeun', type: 'checkbox' },
    { k: 'questions', label: 'Questions à poser', type: 'textarea', help: 'Une question par ligne' },
    { k: 'a_apporter', label: 'À apporter', type: 'textarea', help: 'Une chose par ligne : carte vitale, ordonnances, derniers examens…' },
    { k: 'rappels_jours', label: 'Me prévenir', type: 'jours', defaut: store.reglages.rdv_jours, zero: '2 h avant' },
  ];
  const apres = [
    { k: 'statut', label: 'Statut', type: 'select', empty: false, options: [
      { value: 'prevu', label: 'Prévu' }, { value: 'fait', label: 'Fait' }, { value: 'annule', label: 'Annulé' }] },
    { k: 'compte_rendu', label: 'Compte rendu', type: 'textarea', rows: 6 },
    { k: 'a_transmettre', label: 'À transmettre', type: 'textarea', help: 'Ex. : Dr Leroy — envoyer le compte rendu' },
    { k: 'a_surveiller', label: 'À surveiller', type: 'textarea', help: 'Une chose par ligne' },
    { k: 'fichier_path', label: 'Compte rendu (PDF ou photo)', type: 'file' },
  ];
  const titres = { avant: value.id ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous', apres: 'Après le rendez-vous' };
  return html`<${FormSheet} titre=${titres[mode]} fields=${mode === 'apres' ? apres : avant}
    value=${{ statut: 'prevu', a_jeun: false, ...value }} onClose=${onClose}
    onSave=${async (d) => { const r = await sauverRdv(d); return onSaved ? onSaved(r) : undefined; }}
    onDelete=${value.id && mode === 'avant' ? async () => {
      await q(db.from('rendez_vous').delete().eq('id', value.id));
      await supprimerFichier(value.fichier_path);
      const p = personneParId(value.personne_id);
      location.replace(p ? `#/p/${p.slot}/rdv` : '#/');
    } : null} />`;
}

function PersonneSheet({ p, onClose, onSaved }) {
  const fields = [
    { k: 'prenom', label: 'Prénom', required: true },
    { k: 'date_naissance', label: 'Date de naissance', type: 'date' },
    { k: 'medecin_traitant', label: 'Médecin traitant' },
    { k: 'medecin_tel', label: 'Téléphone du médecin', inputmode: 'tel' },
    { k: 'groupe_sanguin', label: 'Groupe sanguin', placeholder: 'A+' },
    { k: 'personne_confiance', label: 'Personne de confiance', placeholder: 'Prénom — 06 …' },
    { k: 'num_secu', label: 'N° de sécurité sociale', inputmode: 'numeric' },
    { k: 'mutuelle', label: 'Mutuelle', placeholder: 'Nom — n° adhérent' },
    { k: 'infos_urgence', label: 'Autres infos pour les urgences', type: 'textarea', placeholder: 'Ex. : porte des lunettes, malentendant…' },
  ];
  return html`<${FormSheet} titre=${'Infos de ' + p.prenom} fields=${fields} value=${p} onClose=${onClose}
    onSave=${async (d) => {
      await q(db.from('personnes').update(pick(d, fields.map((f) => f.k))).eq('id', p.id));
      await rechargerPersonnes();
      onSaved && onSaved();
    }} />`;
}

function SpecialiteSheet({ value = {}, onClose, onSaved, onDeleted }) {
  const fields = [
    { k: 'nom', label: 'Spécialité', required: true, placeholder: 'Cardiologie, kiné, ophtalmologie…' },
    { k: 'medecin', label: 'Médecin / praticien', placeholder: 'Dr Martin' },
    { k: 'telephone', label: 'Téléphone', inputmode: 'tel' },
    { k: 'adresse', label: 'Adresse' },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ];
  return html`<${FormSheet} titre=${value.id ? 'Modifier la spécialité' : 'Nouvelle spécialité'} fields=${fields} value=${value} onClose=${onClose}
    onSave=${async (d) => {
      const row = pick(d, ['nom', 'medecin', 'telephone', 'adresse', 'notes', 'personne_id']);
      if (d.id) await q(db.from('specialites').update(row).eq('id', d.id));
      else await q(db.from('specialites').insert(row));
      onSaved && onSaved();
    }}
    onDelete=${value.id ? async () => { await q(db.from('specialites').delete().eq('id', value.id)); onDeleted && onDeleted(); } : null} />`;
}

function SimpleSheet({ table, titre, fields, value, onClose, onSaved }) {
  return html`<${FormSheet} titre=${titre} fields=${fields} value=${value} onClose=${onClose}
    onSave=${async (d) => {
      const row = pick(d, [...fields.map((f) => f.k), 'personne_id']);
      if (d.id) await q(db.from(table).update(row).eq('id', d.id));
      else await q(db.from(table).insert(row));
      onSaved && onSaved();
    }}
    onDelete=${value.id ? async () => { await q(db.from(table).delete().eq('id', value.id)); onSaved && onSaved(); } : null} />`;
}

// =====================================================================
// Éléments de liste
// =====================================================================
function TacheLigne({ t, onChange, onEdit }) {
  const p = personneParId(t.personne_id);
  const n = t.echeance ? joursAvant(t.echeance) : null;
  async function cocher() {
    try {
      const fait = !t.fait;
      await q(db.from('taches').update({ fait }).eq('id', t.id));
      await syncTache({ ...t, fait });
      onChange();
    } catch (e) { toast(e.message); }
  }
  return html`<div class="task">
    <button type="button" class=${'check-btn' + (t.fait ? ' on' : '')} aria-label=${t.fait ? 'Marquer comme à faire' : 'Marquer comme fait'} onClick=${cocher}>${t.fait && Icon('check', 16, 3)}</button>
    <button type="button" class="task-body" onClick=${onEdit}>
      <span class=${'task-title' + (t.fait ? ' done' : '')}>${t.titre}</span>
      <span class="task-meta">
        ${p && html`<${Tag} slot=${p.slot}>${p.prenom}<//>`}
        ${t.echeance && html`<span class=${n < 0 && !t.fait ? 'late' : 'muted'}>${relatif(t.echeance)}</span>`}
      </span>
    </button>
  </div>`;
}

function RdvLigne({ r, montrerPersonne = true }) {
  const p = personneParId(r.personne_id);
  return html`<a class="rdv-row" href=${'#/rdv/' + r.id}>
    <${DateBloc} date=${r.date} slot=${p?.slot} />
    <span class="rdv-main">
      <span class="rdv-title">${r.titre}</span>
      <span class="muted small">${[montrerPersonne && p?.prenom, r.lieu].filter(Boolean).join(' · ') || cap(fmt.date(r.date))}</span>
    </span>
    <span class="rdv-side">
      <strong>${fmt.heure(r.date)}</strong>
      ${r.statut === 'fait' ? html`<span class="mini-chip">Fait</span>` : r.statut === 'annule' ? html`<span class="mini-chip">Annulé</span>`
        : html`<span class="dot" style=${`background:${THEMES[p?.slot]?.c || '#999'}`}></span>`}
    </span>
  </a>`;
}

// =====================================================================
// Connexion
// =====================================================================
export function Login({ onDone }) {
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErreur('');
    const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password: mdp });
    setBusy(false);
    if (error) setErreur('E-mail ou mot de passe incorrect.');
    else onDone(data.session);
  }
  return html`<div class="login">
    <div class="login-logo"><span class="bubble big" style="background:#1F7A4D;color:#fff">S</span><span class="bubble big" style="background:#EE7B30;color:#2B1303;margin-left:-12px">S</span></div>
    <h1 class="display big">Suivi Santé</h1>
    <form class="form card" onSubmit=${submit}>
      <div class="field"><label for="email">E-mail</label><input id="email" type="email" autocomplete="username" value=${email} onInput=${(e) => setEmail(e.target.value)} /></div>
      <div class="field"><label for="mdp">Mot de passe</label><input id="mdp" type="password" autocomplete="current-password" value=${mdp} onInput=${(e) => setMdp(e.target.value)} /></div>
      ${erreur && html`<p class="error-txt">${erreur}</p>`}
      <button class="btn primary" disabled=${busy}>${busy ? 'Connexion…' : 'Se connecter'}</button>
    </form>
  </div>`;
}

export function ConfigManquante() {
  return html`<div class="login"><h1 class="display big">Presque prêt</h1>
    <div class="card"><p>Il reste à remplir <strong>config.js</strong> avec l'adresse et la clé de ton projet Supabase (étape 5 du guide).</p></div></div>`;
}

// =====================================================================
// Accueil
// =====================================================================
export function Accueil() {
  const [data, reload, s] = useData(async () => {
    const [rdv, taches, meds] = await Promise.all([
      q(db.from('rendez_vous').select('*').eq('statut', 'prevu').gte('date', new Date(Date.now() - 3 * 3600e3).toISOString()).order('date').limit(8)),
      q(db.from('taches').select('*').eq('fait', false).order('echeance', { ascending: true, nullsFirst: false }).limit(12)),
      q(db.from('medicaments').select('*').eq('actif', true).not('fin_ordonnance', 'is', null)
        .lte('fin_ordonnance', isoDate(ajouterJours(new Date(), store.reglages.ordonnance_jours + 5)))),
    ]);
    return { rdv, taches, meds: meds.filter((m) => m.fin_ordonnance) };
  });
  const [sheet, setSheet] = useState(null);
  return html`<div class="page">
    <header class="top">
      <div><p class="kicker">${cap(fmt.jour(new Date()))}</p><h1 class="display big">Cette semaine</h1></div>
      <div class="top-actions">
        <a class="icon-btn" href="#/rappels" aria-label="Mes rappels">${Icon('bell')}</a>
        <a class="icon-btn" href="#/reglages" aria-label="Réglages">${Icon('gear')}</a>
      </div>
    </header>

    <div class="grid2">
      ${store.personnes.map((p) => {
        const next = data?.rdv.find((r) => r.personne_id === p.id);
        return html`<a class="person-card" href=${'#/p/' + p.slot} style=${themeStyle(p.slot)}>
          <span class="bubble big inverse">${p.prenom[0]}</span>
          <span class="display person-name">${p.prenom}</span>
          <span class="person-next">${next
            ? html`Prochain RDV<br /><strong>${cap(fmt.court(next.date))} · ${next.titre}</strong>`
            : 'Aucun rendez-vous prévu'}</span>
        </a>`;
      })}
    </div>

    <div class="quick">
      <a class="btn primary" href="#/rdv/nouveau">+ Rendez-vous</a>
      <button type="button" class="btn outline" onClick=${() => setSheet({ tache: {} })}>+ Tâche</button>
      <button type="button" class="btn outline" onClick=${() => setSheet({ rappel: {} })}>+ Rappel</button>
    </div>

    ${!data ? html`<${Etat} s=${s} />` : html`
      ${data.meds.length > 0 && html`<div class="alert amber">
        ${Icon('clock', 24, 2)}
        <div><strong>Ordonnance à renouveler</strong>
          ${data.meds.map((m) => html`<p>${personneParId(m.personne_id)?.prenom} · ${m.nom} — fin le ${fmt.dateCourte(m.fin_ordonnance)}</p>`)}
        </div>
      </div>`}

      <${Section} titre="À ne pas oublier" action=${html`<a class="link" href="#/taches">Tout voir</a>`}>
        ${data.taches.length
          ? data.taches.map((t) => html`<${TacheLigne} key=${t.id} t=${t} onChange=${reload} onEdit=${() => setSheet({ tache: t })} />`)
          : html`<${Vide}>Rien en attente.<//>`}
      <//>

      <div class="list-head">
        <h2 class="display">Prochains rendez-vous</h2>
        <a class="link" href="#/agenda">Agenda</a>
      </div>
      ${data.rdv.length ? data.rdv.map((r) => html`<${RdvLigne} key=${r.id} r=${r} />`) : html`<${Vide}>Aucun rendez-vous à venir.<//>`}
    `}

    ${sheet?.tache && html`<${TacheSheet} value=${sheet.tache} onClose=${() => setSheet(null)} onSaved=${reload} />`}
    ${sheet?.rappel && html`<${RappelSheet} value=${sheet.rappel} onClose=${() => setSheet(null)} onSaved=${() => toast('Rappel enregistré')} />`}
  </div>`;
}

// =====================================================================
// Agenda commun
// =====================================================================
export function Agenda() {
  const [mois, setMois] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [filtre, setFiltre] = useState('tous');
  const [jour, setJour] = useState(null);
  const [data, , s] = useData(() => q(db.from('rendez_vous').select('*').neq('statut', 'annule')
    .gte('date', mois.toISOString()).lt('date', new Date(mois.getFullYear(), mois.getMonth() + 1, 1).toISOString()).order('date')), [mois.getTime()]);

  const visibles = (data || []).filter((r) => filtre === 'tous' || personneParId(r.personne_id)?.slot === filtre);
  const decalage = (mois.getDay() + 6) % 7;
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const aujourdhui = isoDate(new Date());
  const cases = [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => i + 1)];
  const parJour = {};
  for (const r of visibles) {
    const k = isoDate(new Date(r.date));
    (parJour[k] = parJour[k] || new Set()).add(personneParId(r.personne_id)?.slot);
  }
  const liste = jour ? visibles.filter((r) => isoDate(new Date(r.date)) === jour)
    : visibles.filter((r) => new Date(r.date) >= new Date(new Date().setHours(0, 0, 0, 0)) || mois > new Date());
  const changerMois = (n) => { setJour(null); setMois(new Date(mois.getFullYear(), mois.getMonth() + n, 1)); };

  return html`<div class="page">
    <header class="top">
      <h1 class="display big">Agenda</h1>
      <div class="top-actions">
        <button type="button" class="icon-btn" aria-label="Mois précédent" onClick=${() => changerMois(-1)}>${Icon('back')}</button>
        <button type="button" class="icon-btn" aria-label="Mois suivant" onClick=${() => changerMois(1)}>${Icon('next')}</button>
      </div>
    </header>
    <div class="chips" role="group" aria-label="Filtrer">
      <button type="button" class=${'chip dark' + (filtre === 'tous' ? ' on' : '')} aria-pressed=${filtre === 'tous'} onClick=${() => setFiltre('tous')}>Tous</button>
      ${store.personnes.map((p) => html`<button type="button" class=${'chip person' + (filtre === p.slot ? ' on' : '')} style=${themeStyle(p.slot)}
        aria-pressed=${filtre === p.slot} onClick=${() => setFiltre(p.slot)}><span class="dot"></span>${p.prenom}</button>`)}
    </div>

    <section class="card">
      <h2 class="display cal-title">${cap(fmt.mois(mois))}</h2>
      <div class="cal">
        ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j) => html`<span class="cal-dow" aria-hidden="true">${j}</span>`)}
        ${cases.map((n) => {
          if (!n) return html`<span></span>`;
          const k = isoDate(new Date(mois.getFullYear(), mois.getMonth(), n));
          const slots = parJour[k];
          const cls = 'cal-day' + (k === aujourdhui ? ' today' : '') + (k === jour ? ' sel' : '') + (k < aujourdhui ? ' past' : '');
          return html`<button type="button" class=${cls} aria-label=${fmt.jour(k) + (slots ? ', rendez-vous' : '')} onClick=${() => setJour(jour === k ? null : k)}>
            <span class="cal-num">${n}</span>
            <span class="cal-dots">${slots && [...slots].map((sl) => html`<span class="dot" style=${`background:${THEMES[sl]?.c}`}></span>`)}</span>
          </button>`;
        })}
      </div>
    </section>

    <div class="list-head">
      <h2 class="display">${jour ? cap(fmt.jour(jour)) : 'À venir ce mois-ci'}</h2>
      ${jour && html`<button type="button" class="link" onClick=${() => setJour(null)}>Tout le mois</button>`}
    </div>
    ${!data ? html`<${Etat} s=${s} />` : liste.length ? liste.map((r) => {
      const p = personneParId(r.personne_id);
      return html`<a class="event" href=${'#/rdv/' + r.id} style=${themeStyle(p?.slot)}>
        <span class="event-when"><span class="event-date">${cap(fmt.court(r.date))}</span><strong>${fmt.heure(r.date)}</strong></span>
        <span class="event-main"><strong>${r.titre}</strong><span class="small">${r.lieu || ''}</span></span>
        <span class="event-who">${p?.prenom}</span>
      </a>`;
    }) : html`<${Vide}>Aucun rendez-vous.<//>`}

    <a class="fab" href=${'#/rdv/nouveau' + (jour ? '?d=' + jour : '')} aria-label="Ajouter un rendez-vous">${Icon('plus', 28, 2.2)}</a>
  </div>`;
}

// =====================================================================
// Espace d'une personne : synthèse
// =====================================================================
function lignesUrgence(p, ants, meds) {
  const cat = (c) => ants.filter((a) => a.categorie === c).map((a) => a.titre + (c === 'allergie' && a.details ? ` (${a.details})` : ''));
  const fl = meds.filter((m) => m.fluidifiant).map((m) => m.nom);
  return [
    { k: 'Allergies', v: cat('allergie').join(' · ') || 'Aucune connue', alerte: cat('allergie').length > 0 },
    { k: 'Matériel implanté', v: cat('materiel').join(' · ') || 'Aucun' },
    { k: 'Sang fluidifié', v: fl.length ? 'Oui — ' + fl.join(', ') : 'Non', alerte: fl.length > 0 },
    { k: 'Maladies', v: cat('maladie').join(' · ') || '—' },
    { k: 'Groupe sanguin', v: p.groupe_sanguin || '—' },
    { k: 'Personne de confiance', v: p.personne_confiance || '—' },
    { k: 'Médecin traitant', v: [p.medecin_traitant, p.medecin_tel].filter(Boolean).join(' — ') || '—' },
  ];
}

export function Personne({ slot }) {
  const p = personneParSlot(slot);
  const [data, reload, s] = useData(async () => {
    if (!p) return null;
    const [specs, surv, notes, ants, meds, rdvs] = await Promise.all([
      q(db.from('specialites').select('*').eq('personne_id', p.id).order('nom')),
      q(db.from('surveillances').select('*').eq('personne_id', p.id).order('created_at')),
      q(db.from('journal').select('*').eq('personne_id', p.id).order('date', { ascending: false }).limit(1)),
      q(db.from('antecedents').select('*').eq('personne_id', p.id)),
      q(db.from('medicaments').select('*').eq('personne_id', p.id).eq('actif', true)),
      q(db.from('rendez_vous').select('id, specialite_id, date, statut').eq('personne_id', p.id).neq('statut', 'annule').order('date')),
    ]);
    return { specs, surv, notes, ants, meds, rdvs };
  }, [slot]);
  const [sheet, setSheet] = useState(null);
  const [, forcer] = useState(0);
  if (!p) return html`<${PasTrouve} />`;
  const a = age(p.date_naissance);
  const now = new Date();

  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} titre=${p.prenom}
      sousTitre=${[a != null && `${a} ans`, p.medecin_traitant && `Médecin traitant : ${p.medecin_traitant}`].filter(Boolean).join(' · ') || 'Touche le crayon pour compléter ses infos'}
      action=${html`<button type="button" class="icon-btn on-color" aria-label="Modifier les infos" onClick=${() => setSheet({ personne: true })}>${Icon('edit', 20)}</button>`}>
      <${OngletsPersonne} slot=${slot} actif="synthese" />
    <//>
    <div class="page">
      ${!data ? html`<${Etat} s=${s} />` : html`
        <section class="card urgence-card">
          <div class="urgence-head">
            <h2 class="display">${Icon('alert', 20, 2.2)} Fiche urgence</h2>
            <a class="btn small red" href=${'#/urgence/' + slot}>Plein écran</a>
          </div>
          <dl class="kv">
            ${lignesUrgence(p, data.ants, data.meds).map((l) => html`<div><dt>${l.k}</dt><dd class=${l.alerte ? 'alerte' : ''}>${l.v}</dd></div>`)}
          </dl>
        </section>

        <div class="list-head"><h2 class="display">Spécialités</h2><span class="muted small">${data.specs.length} suivi${data.specs.length > 1 ? 's' : ''}</span></div>
        <div class="grid2">
          ${data.specs.map((sp) => {
            const rs = data.rdvs.filter((r) => r.specialite_id === sp.id);
            const next = rs.find((r) => r.statut === 'prevu' && new Date(r.date) >= now);
            const last = [...rs].reverse().find((r) => new Date(r.date) < now);
            return html`<a class="spec-card" href=${`#/p/${slot}/specialite/${sp.id}`}>
              <span class="spec-icon">${Icon(iconeSpecialite(sp.nom), 20)}</span>
              <strong>${sp.nom}</strong>
              <span class="muted small">${sp.medecin || ''}${sp.medecin && html`<br />`}
                ${next ? `Prochain : ${fmt.dateCourte(next.date)}` : last ? `Dernier : ${fmt.dateCourte(last.date)}` : 'Aucun RDV'}</span>
            </a>`;
          })}
          <button type="button" class="spec-add" onClick=${() => setSheet({ spec: { personne_id: p.id } })}>+ Ajouter une spécialité</button>
        </div>

        <${Section} titre="À surveiller" action=${html`<button type="button" class="link" onClick=${() => setSheet({ surv: { personne_id: p.id } })}>+ Ajouter</button>`}>
          ${data.surv.length ? data.surv.map((x) => html`<button type="button" class="line-btn" onClick=${() => setSheet({ surv: x })}>
            <span class="bullet"></span><span><strong>${x.titre}</strong>${x.details && html`<span class="muted small block">${x.details}</span>`}</span>
          </button>`) : html`<${Vide}>Rien à surveiller pour l'instant.<//>`}
        <//>

        <a class="note-card" href=${`#/p/${slot}/journal`}>
          <span class="note-head"><strong class="display">Dernière note du journal</strong>${data.notes[0] && html`<span>${fmt.dateCourte(data.notes[0].date)}</span>`}</span>
          <span class="pre">${data.notes[0]?.texte || 'Aucune note. Touche ici pour en écrire une.'}</span>
        </a>
      `}
    </div>
    ${sheet?.personne && html`<${PersonneSheet} p=${p} onClose=${() => setSheet(null)} onSaved=${() => { forcer((x) => x + 1); reload(); }} />`}
    ${sheet?.spec && html`<${SpecialiteSheet} value=${sheet.spec} onClose=${() => setSheet(null)} onSaved=${reload} />`}
    ${sheet?.surv && html`<${SimpleSheet} table="surveillances" titre="À surveiller" value=${sheet.surv} onClose=${() => setSheet(null)} onSaved=${reload}
      fields=${[{ k: 'titre', label: 'Quoi', required: true, placeholder: 'Tension, chevilles gonflées…' }, { k: 'details', label: 'Détails / quand alerter', type: 'textarea' }]} />`}
  </div>`;
}

// =====================================================================
// Spécialité
// =====================================================================
export function Specialite({ slot, id }) {
  const p = personneParSlot(slot);
  const [data, reload, s] = useData(async () => {
    const sp = await q(db.from('specialites').select('*').eq('id', id).single());
    const rdvs = await q(db.from('rendez_vous').select('*').eq('specialite_id', id).order('date', { ascending: false }));
    return { sp, rdvs };
  }, [id]);
  const [edit, setEdit] = useState(false);
  if (!p) return html`<${PasTrouve} />`;
  if (!data) return html`<div class="page"><${Etat} s=${s} /></div>`;
  const { sp, rdvs } = data;
  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} retour=${'#/p/' + slot} retourLabel=${p.prenom} titre=${sp.nom} sousTitre=${sp.medecin}
      action=${html`<button type="button" class="icon-btn on-color" aria-label="Modifier" onClick=${() => setEdit(true)}>${Icon('edit', 20)}</button>`} />
    <div class="page">
      <section class="card">
        <dl class="kv">
          <div><dt>Téléphone</dt><dd>${sp.telephone ? html`<a href=${'tel:' + sp.telephone.replace(/\s/g, '')}>${sp.telephone}</a>` : '—'}</dd></div>
          <div><dt>Adresse</dt><dd>${sp.adresse || '—'}</dd></div>
          ${sp.notes && html`<div><dt>Notes</dt><dd class="pre">${sp.notes}</dd></div>`}
        </dl>
      </section>
      <a class="btn primary" href=${`#/rdv/nouveau?p=${slot}&s=${sp.id}&t=${encodeURIComponent(sp.nom)}`}>+ Rendez-vous</a>
      <div class="list-head"><h2 class="display">Comptes rendus</h2></div>
      ${rdvs.length ? rdvs.map((r) => html`<a class="cr-card" href=${'#/rdv/' + r.id}>
        <span class="cr-head"><strong>${cap(fmt.date(r.date))}</strong><span class="mini-chip">${{ prevu: 'Prévu', fait: 'Fait', annule: 'Annulé' }[r.statut]}</span></span>
        <span class="muted small clamp">${r.compte_rendu || (r.statut === 'prevu' ? 'À venir' : 'Pas de compte rendu')}</span>
      </a>`) : html`<${Vide}>Aucun rendez-vous pour cette spécialité.<//>`}
    </div>
    ${edit && html`<${SpecialiteSheet} value=${sp} onClose=${() => setEdit(false)} onSaved=${reload} onDeleted=${() => location.replace('#/p/' + slot)} />`}
  </div>`;
}

// =====================================================================
// Rendez-vous
// =====================================================================
export function RdvListe({ slot }) {
  const p = personneParSlot(slot);
  const [data, , s] = useData(() => (p ? q(db.from('rendez_vous').select('*').eq('personne_id', p.id).order('date')) : Promise.resolve([])), [slot]);
  if (!p) return html`<${PasTrouve} />`;
  const limite = new Date(Date.now() - 3 * 3600e3);
  const avenir = (data || []).filter((r) => r.statut === 'prevu' && new Date(r.date) >= limite);
  const passes = (data || []).filter((r) => !avenir.includes(r)).reverse();
  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} titre=${p.prenom} sousTitre="Rendez-vous"><${OngletsPersonne} slot=${slot} actif="rdv" /><//>
    <div class="page">
      <a class="btn primary" href=${'#/rdv/nouveau?p=' + slot}>+ Rendez-vous</a>
      ${!data ? html`<${Etat} s=${s} />` : html`
        <div class="list-head"><h2 class="display">À venir</h2></div>
        ${avenir.length ? avenir.map((r) => html`<${RdvLigne} key=${r.id} r=${r} montrerPersonne=${false} />`) : html`<${Vide}>Aucun rendez-vous prévu.<//>`}
        <div class="list-head"><h2 class="display">Passés</h2></div>
        ${passes.length ? passes.map((r) => html`<${RdvLigne} key=${r.id} r=${r} montrerPersonne=${false} />`) : html`<${Vide}>Rien pour l'instant.<//>`}
      `}
    </div>
  </div>`;
}

export function RdvNouveau() {
  const pr = params();
  const p = personneParSlot(pr.get('p')) || store.personnes[0];
  const jour = pr.get('d');
  const preset = {
    personne_id: p.id,
    specialite_id: pr.get('s') || null,
    titre: pr.get('t') || '',
    date: jour ? new Date(`${jour}T09:00`).toISOString() : null,
  };
  return html`<div class="page">
    <${RdvSheet} value=${preset} mode="avant" onClose=${() => history.back()}
      onSaved=${(r) => { location.replace('#/rdv/' + r.id); return false; }} />
  </div>`;
}

export function RdvFiche({ id }) {
  const [data, reload, s] = useData(async () => {
    const rdv = await q(db.from('rendez_vous').select('*, specialites(nom)').eq('id', id).single());
    const [taches, rappels] = await Promise.all([
      q(db.from('taches').select('*').eq('rdv_id', id).order('created_at')),
      q(db.from('rappels').select('*').eq('rdv_id', id).is('envoye_le', null).order('quand')),
    ]);
    return { rdv, taches, rappels };
  }, [id]);
  const [vue, setVue] = useState(null);
  const [sheet, setSheet] = useState(null);
  if (!data) return html`<div class="page"><${Etat} s=${s} /></div>`;
  const r = data.rdv;
  const p = personneParId(r.personne_id);
  const slot = p?.slot;
  const passe = new Date(r.date) < new Date();
  const v = vue || (r.statut === 'fait' || passe ? 'apres' : 'avant');
  const valeur = { ...r };
  delete valeur.specialites;

  async function marquerFait() {
    try { await sauverRdv({ ...valeur, statut: 'fait' }); reload(); } catch (e) { toast(e.message); }
  }

  const liste = (t, vide) => (lignes(t).length
    ? html`<ul class="bullets">${lignes(t).map((l) => html`<li>${l}</li>`)}</ul>`
    : html`<p class="muted">${vide}</p>`);

  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} retour=${`#/p/${slot}/rdv`} retourLabel=${p?.prenom + (r.specialites ? ' · ' + r.specialites.nom : '')}
      titre=${r.titre} sousTitre=${`${cap(fmt.jour(r.date))} · ${fmt.heure(r.date)}${r.lieu ? '\n' + r.lieu : ''}`}
      action=${html`<span class="status-chip">${{ prevu: 'Prévu', fait: 'Fait', annule: 'Annulé' }[r.statut]}</span>`}>
      <div class="seg" role="group" aria-label="Avant ou après le rendez-vous">
        <button type="button" class=${v === 'avant' ? 'on' : ''} aria-pressed=${v === 'avant'} onClick=${() => setVue('avant')}>Avant</button>
        <button type="button" class=${v === 'apres' ? 'on' : ''} aria-pressed=${v === 'apres'} onClick=${() => setVue('apres')}>Après</button>
      </div>
    <//>
    <div class="page">
      ${v === 'avant' ? html`
        <section class="card">
          <dl class="kv">
            <div><dt>Lieu</dt><dd>${r.lieu || '—'}</dd></div>
            <div><dt>Accompagnant</dt><dd>${r.accompagnant || '—'}</dd></div>
            <div><dt>Transport</dt><dd>${r.transport || '—'}</dd></div>
            <div><dt>À jeun</dt><dd class=${r.a_jeun ? 'alerte' : ''}>${r.a_jeun ? 'Oui' : 'Non'}</dd></div>
          </dl>
        </section>
        <${Section} titre="Questions à poser">${liste(r.questions, 'Aucune question notée.')}<//>
        <${Section} titre="À apporter">${liste(r.a_apporter, 'Rien de noté.')}<//>
        <${Section} titre="Rappels prévus">
          ${data.rappels.length ? data.rappels.map((x) => html`<p class="line">${Icon('bell', 18)} ${cap(fmt.court(x.quand))} à ${fmt.heure(x.quand)}</p>`)
            : html`<p class="muted">${r.statut === 'prevu' ? 'Aucun rappel à venir.' : 'Pas de rappel : le rendez-vous est passé.'}</p>`}
        <//>
        <button type="button" class="btn primary" onClick=${() => setSheet({ rdv: 'avant' })}>Modifier le rendez-vous</button>
      ` : html`
        ${r.statut === 'prevu' && html`<button type="button" class="btn primary" onClick=${marquerFait}>${Icon('check', 18, 2.6)} Marquer comme fait</button>`}
        <${Section} titre="Compte rendu">
          <${Texte}>${r.compte_rendu}<//>
          ${r.fichier_path && html`<button type="button" class="file-btn" onClick=${() => ouvrir(r.fichier_path)}>${Icon('file', 20)} ${nomFichier(r.fichier_path)}</button>`}
        <//>
        <${Section} titre="À transmettre">${liste(r.a_transmettre, 'Rien à transmettre.')}<//>
        <${Section} titre="À surveiller" classe="amber">${liste(r.a_surveiller, 'Rien de particulier.')}<//>
        <${Section} titre="Prochaines étapes">
          <p class="muted small">Chaque étape devient une tâche avec rappel.</p>
          ${data.taches.map((t) => html`<${TacheLigne} key=${t.id} t=${t} onChange=${reload} onEdit=${() => setSheet({ tache: t })} />`)}
          <div class="btn-row">
            <button type="button" class="btn outline" onClick=${() => setSheet({ tache: { rdv_id: r.id, personne_id: r.personne_id } })}>+ Ajouter une étape</button>
            <a class="btn outline" href=${`#/rdv/nouveau?p=${slot}${r.specialite_id ? '&s=' + r.specialite_id : ''}&t=${encodeURIComponent(r.titre)}`}>+ Prochain RDV</a>
          </div>
        <//>
        <button type="button" class="btn primary" onClick=${() => setSheet({ rdv: 'apres' })}>Remplir le compte rendu</button>
      `}
    </div>
    ${sheet?.rdv && html`<${RdvSheet} value=${valeur} mode=${sheet.rdv} onClose=${() => setSheet(null)} onSaved=${() => { reload(); }} />`}
    ${sheet?.tache && html`<${TacheSheet} value=${sheet.tache} onClose=${() => setSheet(null)} onSaved=${reload} />`}
  </div>`;
}

// =====================================================================
// Traitement
// =====================================================================
const CHAMPS_MED = ['nom', 'pourquoi', 'prescripteur', 'matin', 'midi', 'soir', 'coucher', 'si_besoin', 'fin_ordonnance', 'fluidifiant', 'actif'];

function MedicamentSheet({ value, onClose, onSaved }) {
  const nouveau = !value.id;
  const fields = [
    { k: 'nom', label: 'Médicament et dosage', required: true, placeholder: 'Kardégic 75 mg' },
    { k: 'pourquoi', label: 'Pour quoi ?', placeholder: 'Fluidifie le sang, tension…' },
    { k: 'prescripteur', label: 'Prescrit par', placeholder: 'Dr Martin' },
    { section: 'Quand le prendre (laisser vide si non)' },
    { k: 'matin', label: 'Matin', placeholder: '1 comprimé' },
    { k: 'midi', label: 'Midi', placeholder: '1 comprimé' },
    { k: 'soir', label: 'Soir', placeholder: '1 comprimé' },
    { k: 'coucher', label: 'Au coucher' },
    { k: 'si_besoin', label: 'Si besoin', placeholder: 'Ex. : 1 si douleur, max 3 / jour' },
    { section: 'Suivi' },
    { k: 'fin_ordonnance', label: "Fin de l'ordonnance", type: 'date', help: 'Pour être prévenu(e) avant de la renouveler.' },
    { k: 'fluidifiant', label: 'Fluidifie le sang (anticoagulant / antiagrégant) — affiché dans la fiche urgence', type: 'checkbox' },
    { k: 'actif', label: 'Toujours pris (décoche si arrêté)', type: 'checkbox', when: () => !nouveau },
    { k: 'raison', label: nouveau ? 'Pourquoi ce traitement ? (ajouté à l’historique)' : 'Pourquoi ce changement ? (ajouté à l’historique)', type: 'textarea', rows: 2 },
  ];
  async function sauver(d) {
    const row = pick({ ...d, actif: d.actif ?? true }, [...CHAMPS_MED, 'personne_id']);
    const m = nouveau
      ? await q(db.from('medicaments').insert(row).select().single())
      : await q(db.from('medicaments').update(row).eq('id', d.id).select().single());
    let changement = null;
    if (nouveau) changement = `Début : ${m.nom}${posologie(m) ? ' — ' + posologie(m) : ''}`;
    else if (value.actif && !m.actif) changement = `Arrêt : ${m.nom}`;
    else if (!value.actif && m.actif) changement = `Reprise : ${m.nom}`;
    else {
      const diffs = [];
      if ((value.nom || '') !== (m.nom || '')) diffs.push(`${value.nom} → ${m.nom}`);
      for (const [k, l] of MOMENTS) if ((value[k] || '') !== (m[k] || '')) diffs.push(`${l} : ${value[k] || '—'} → ${m[k] || '—'}`);
      if (diffs.length) changement = `${m.nom} — ${diffs.join(', ')}`;
    }
    if (changement || d.raison) {
      await q(db.from('traitement_historique').insert({
        personne_id: m.personne_id, medicament: m.nom, changement: changement || `${m.nom} — note`,
        pourquoi: d.raison || null, prescripteur: m.prescripteur || null,
      }));
    }
    await syncMedicament(m);
    onSaved && onSaved();
  }
  return html`<${FormSheet} titre=${nouveau ? 'Nouveau médicament' : 'Modifier le médicament'} fields=${fields}
    value=${{ actif: true, fluidifiant: false, ...value }} onClose=${onClose} onSave=${sauver}
    onDelete=${!nouveau ? async () => { await q(db.from('medicaments').delete().eq('id', value.id)); onSaved && onSaved(); } : null} />`;
}

export function Traitement({ slot }) {
  const p = personneParSlot(slot);
  const [data, reload, s] = useData(async () => {
    if (!p) return null;
    const [meds, hist] = await Promise.all([
      q(db.from('medicaments').select('*').eq('personne_id', p.id).order('nom')),
      q(db.from('traitement_historique').select('*').eq('personne_id', p.id).order('date', { ascending: false }).order('created_at', { ascending: false })),
    ]);
    return { meds, hist };
  }, [slot]);
  const [sheet, setSheet] = useState(null);
  if (!p) return html`<${PasTrouve} />`;
  const actifs = (data?.meds || []).filter((m) => m.actif);
  const arretes = (data?.meds || []).filter((m) => !m.actif);
  const seuil = store.reglages.ordonnance_jours + 5;
  const aRenouveler = actifs.filter((m) => m.fin_ordonnance && joursAvant(m.fin_ordonnance) <= seuil);
  const changeRecent = (m) => (data?.hist || []).find((h) => h.medicament === m.nom && joursAvant(h.date) >= -30);

  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} titre=${p.prenom} sousTitre=${`Traitement actuel · ${actifs.length} médicament${actifs.length > 1 ? 's' : ''}`}>
      <${OngletsPersonne} slot=${slot} actif="traitement" />
    <//>
    <div class="page">
      ${!data ? html`<${Etat} s=${s} />` : html`
        ${aRenouveler.map((m) => html`<div class="alert amber">${Icon('clock', 24, 2)}<p><strong>Ordonnance à renouveler</strong> — ${m.nom}, fin le ${fmt.dateCourte(m.fin_ordonnance)}</p></div>`)}

        ${MOMENTS.map(([k, label, hint, icone]) => {
          const liste = actifs.filter((m) => m[k]);
          if (!liste.length && (k === 'coucher' || k === 'si_besoin')) return null;
          return html`<section class="moment">
            <div class="moment-head">
              ${Icon(icone, 24, 2)}
              <span><h2 class="display">${label}</h2>${hint && html`<span class="small">${hint}</span>`}</span>
              <span class="moment-count">${liste.length ? `${liste.length} médicament${liste.length > 1 ? 's' : ''}` : '—'}</span>
            </div>
            ${liste.length ? liste.map((m) => {
              const ch = changeRecent(m);
              const fin = m.fin_ordonnance && joursAvant(m.fin_ordonnance) <= seuil;
              return html`<button type="button" class="med" onClick=${() => setSheet({ med: m })}>
                <span class="med-icon">${Icon('pill', 20)}</span>
                <span class="med-main"><strong>${m.nom}</strong><span class="muted small">${m[k]}${m.pourquoi ? ' · ' + m.pourquoi : ''}</span></span>
                ${fin ? html`<span class="flag amber">À renouveler</span>` : ch ? html`<span class="flag tint">Changé le ${fmt.dateCourte(ch.date)}</span>` : null}
              </button>`;
            }) : html`<p class="moment-empty">Rien à prendre</p>`}
          </section>`;
        })}

        <div class="btn-row">
          <button type="button" class="btn primary" onClick=${() => setSheet({ med: { personne_id: p.id } })}>+ Médicament</button>
          <button type="button" class="btn outline" onClick=${() => setSheet({ hist: { personne_id: p.id, date: isoDate(new Date()) } })}>Noter un changement</button>
        </div>

        <${Section} titre="Historique des changements">
          ${data.hist.length ? data.hist.map((h) => html`<button type="button" class="hist" onClick=${() => setSheet({ hist: h })}>
            <span class="hist-head"><strong>${h.changement}</strong><span class="muted small">${fmt.dateCourte(h.date)}</span></span>
            ${h.prescripteur && html`<span class="muted small">${h.prescripteur}</span>`}
            ${h.pourquoi && html`<span class="why"><strong>Pourquoi :</strong> ${h.pourquoi}</span>`}
          </button>`) : html`<${Vide}>Les changements apparaîtront ici, avec leur raison.<//>`}
        <//>

        ${arretes.length > 0 && html`<${Section} titre="Médicaments arrêtés">
          ${arretes.map((m) => html`<button type="button" class="line-btn" onClick=${() => setSheet({ med: m })}><span class="bullet"></span><span>${m.nom}</span></button>`)}
        <//>`}
      `}
    </div>
    ${sheet?.med && html`<${MedicamentSheet} value=${sheet.med} onClose=${() => setSheet(null)} onSaved=${reload} />`}
    ${sheet?.hist && html`<${SimpleSheet} table="traitement_historique" titre="Changement de traitement" value=${sheet.hist} onClose=${() => setSheet(null)} onSaved=${reload}
      fields=${[
        { k: 'date', label: 'Date', type: 'date', required: true },
        { k: 'medicament', label: 'Médicament', placeholder: 'Bisoprolol' },
        { k: 'changement', label: 'Changement', required: true, placeholder: '5 mg → 2,5 mg' },
        { k: 'pourquoi', label: 'Pourquoi ?', type: 'textarea', required: true },
        { k: 'prescripteur', label: 'Décidé par', placeholder: 'Dr Martin · cardiologue' },
      ]} />`}
  </div>`;
}

// =====================================================================
// Antécédents
// =====================================================================
const CATEGORIES = [
  { value: 'operation', label: 'Opération' }, { value: 'maladie', label: 'Maladie' },
  { value: 'materiel', label: 'Matériel implanté' }, { value: 'allergie', label: 'Allergie' },
  { value: 'familial', label: 'Antécédent familial' },
];
const libCat = (c) => CATEGORIES.find((x) => x.value === c)?.label || c;

export function Antecedents({ slot }) {
  const p = personneParSlot(slot);
  const [data, reload, s] = useData(() => (p ? q(db.from('antecedents').select('*').eq('personne_id', p.id)) : Promise.resolve([])), [slot]);
  const [filtre, setFiltre] = useState('tout');
  const [sheet, setSheet] = useState(null);
  if (!p) return html`<${PasTrouve} />`;
  const parAnnee = (a, b) => (b.annee || '').localeCompare(a.annee || '');
  const de = (c) => (data || []).filter((a) => a.categorie === c).sort(parAnnee);
  const montre = (c) => filtre === 'tout' || filtre === c;
  const histo = (data || []).filter((a) => a.categorie === 'operation' || a.categorie === 'maladie').sort(parAnnee);
  const filtres = [['tout', 'Tout'], ['operation', 'Opérations'], ['maladie', 'Maladies'], ['materiel', 'Matériel'], ['allergie', 'Allergies'], ['familial', 'Familial']];
  const edit = (a) => setSheet(a);

  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} titre=${p.prenom} sousTitre="Antécédents"
      action=${html`<button type="button" class="btn small white" onClick=${() => setSheet({ personne_id: p.id, categorie: filtre === 'tout' ? 'operation' : filtre })}>+ Ajouter</button>`}>
      <${OngletsPersonne} slot=${slot} actif="antecedents" />
    <//>
    <div class="page">
      <div class="chips">
        ${filtres.map(([k, l]) => html`<button type="button" class=${'chip' + (filtre === k ? ' on' : '')} aria-pressed=${filtre === k} onClick=${() => setFiltre(k)}>${l}</button>`)}
      </div>
      ${!data ? html`<${Etat} s=${s} />` : html`
        ${montre('materiel') && html`<section class="card dark">
          <div class="card-head"><h2 class="display">${Icon('cross', 20)} Matériel implanté</h2></div>
          ${de('materiel').length ? de('materiel').map((a) => html`<button type="button" class="implant" onClick=${() => edit(a)}>
            <span><strong>${a.titre}</strong>${a.details && html`<span class="small block">${a.details}</span>`}</span><strong>${a.annee}</strong>
          </button>`) : html`<p class="small">Aucun matériel noté (stent, prothèse, pacemaker…).</p>`}
          <p class="small">À signaler avant une IRM, une opération ou des soins dentaires.</p>
        </section>`}

        ${montre('allergie') && (de('allergie').length
          ? de('allergie').map((a) => html`<button type="button" class="alert red" onClick=${() => edit(a)}><strong>Allergie</strong><span>${a.titre}${a.details ? ' — ' + a.details : ''}${a.annee ? ` (${a.annee})` : ''}</span></button>`)
          : filtre === 'allergie' && html`<${Vide}>Aucune allergie notée.<//>`)}

        ${(montre('operation') || montre('maladie')) && html`
          <div class="list-head"><h2 class="display">Historique</h2></div>
          ${histo.filter((a) => montre(a.categorie)).length ? histo.filter((a) => montre(a.categorie)).map((a) => html`<div class="tl">
            <div class="tl-year"><strong>${a.annee || '—'}</strong><span class="tl-line"></span></div>
            <button type="button" class="tl-card" onClick=${() => edit(a)}>
              <span class="tag soft">${libCat(a.categorie)}</span>
              <strong>${a.titre}</strong>
              ${a.details && html`<span class="muted small">${a.details}</span>`}
            </button>
          </div>`) : html`<${Vide}>Ajoute les opérations et maladies avec leur année.<//>`}
        `}

        ${montre('familial') && html`<${Section} titre="Antécédents familiaux">
          ${de('familial').length ? de('familial').map((a) => html`<button type="button" class="line-btn" onClick=${() => edit(a)}><span class="bullet"></span><span>${a.titre}${a.details ? ' — ' + a.details : ''}</span></button>`)
            : html`<p class="muted">—</p>`}
        <//>`}
      `}
    </div>
    ${sheet && html`<${SimpleSheet} table="antecedents" titre=${sheet.id ? 'Modifier' : 'Nouvel antécédent'} value=${sheet} onClose=${() => setSheet(null)} onSaved=${reload}
      fields=${[
        { k: 'categorie', label: 'Type', type: 'select', options: CATEGORIES, empty: false, required: true },
        { k: 'titre', label: 'Quoi', required: true, placeholder: '2 stents coronaires, prothèse de hanche…' },
        { k: 'annee', label: 'Année', inputmode: 'numeric', placeholder: '2019' },
        { k: 'details', label: 'Détails', type: 'textarea', placeholder: 'Hôpital, médecin, réaction…' },
      ]} />`}
  </div>`;
}

// =====================================================================
// Prises de sang
// =====================================================================
const ordreMarqueur = (n) => { const i = MARQUEURS.findIndex((m) => m[0] === n); return i < 0 ? 99 : i; };

export function Bilans({ slot }) {
  const p = personneParSlot(slot);
  const [data, , s] = useData(() => (p ? q(db.from('bilans').select('*, bilan_valeurs(*)').eq('personne_id', p.id).order('date')) : Promise.resolve([])), [slot]);
  const [sel, setSel] = useState(null);
  const series = useMemo(() => {
    const m = new Map();
    for (const b of data || []) {
      for (const v of b.bilan_valeurs) {
        if (!m.has(v.marqueur)) m.set(v.marqueur, []);
        m.get(v.marqueur).push({ date: b.date, v: Number(v.valeur), min: v.ref_min != null ? Number(v.ref_min) : null, max: v.ref_max != null ? Number(v.ref_max) : null, unite: v.unite || '' });
      }
    }
    return m;
  }, [data]);
  if (!p) return html`<${PasTrouve} />`;
  const noms = [...series.keys()].sort((a, b) => ordreMarqueur(a) - ordreMarqueur(b) || a.localeCompare(b));
  const actif = sel && series.has(sel) ? sel : noms[0];
  const couleur = THEMES[slot].line;
  const pts = actif ? series.get(actif) : [];
  const der = pts[pts.length - 1];
  const prec = pts[pts.length - 2];
  const st = der ? statutValeur(der.v, der.min, der.max) : '';
  const tendance = der && prec ? (der.v > prec.v ? '↗ En hausse' : der.v < prec.v ? '↘ En baisse' : '→ Stable') : '';

  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} titre=${p.prenom} sousTitre="Prises de sang"><${OngletsPersonne} slot=${slot} actif="bilans" /><//>
    <div class="page">
      <a class="upload-btn" href=${`#/p/${slot}/bilans/nouveau`}>${Icon('upload', 22, 2)} Ajouter un bilan</a>
      ${!data ? html`<${Etat} s=${s} />` : !noms.length ? html`<${Vide}>Ajoute un premier bilan : tu joins le PDF et tu notes les valeurs. Les courbes se construisent toutes seules.<//>` : html`
        <div class="chips">
          ${noms.map((n) => html`<button type="button" class=${'chip' + (n === actif ? ' on' : '')} aria-pressed=${n === actif} onClick=${() => setSel(n)}>${n}</button>`)}
        </div>
        <section class="card">
          <div class="chart-head">
            <div>
              <h2 class="display">${actif}</h2>
              <p class="muted small">${der.min != null || der.max != null ? `Norme : ${fmt.num(der.min ?? '…')} – ${fmt.num(der.max ?? '…')} ${der.unite}` : 'Norme non renseignée'}</p>
            </div>
            <div class="chart-last">
              <p class="display chart-big">${fmt.num(der.v)}<span class="small muted"> ${der.unite}</span></p>
              <p class=${'small strong ' + (st === 'normal' ? 'ok' : st ? 'bad' : 'muted')}>${[tendance, libStatut[st]].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <${Courbe} points=${pts} min=${der.min} max=${der.max} couleur=${couleur} />
        </section>

        ${noms.length > 1 && html`<div class="list-head"><h2 class="display">Autres marqueurs</h2></div>
        <div class="grid2">
          ${noms.filter((n) => n !== actif).map((n) => {
            const sr = series.get(n); const l = sr[sr.length - 1]; const stt = statutValeur(l.v, l.min, l.max);
            return html`<button type="button" class="mk-card" onClick=${() => { setSel(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <span class="mk-head"><strong>${n}</strong>${stt && html`<span class=${'flag ' + (stt === 'normal' ? 'neutral' : 'red')}>${libStatut[stt]}</span>`}</span>
              <span class="display mk-val">${fmt.num(l.v)} <span class="small muted">${l.unite}</span></span>
              <${Sparkline} valeurs=${sr.map((x) => x.v)} couleur=${couleur} />
              <span class="muted small">${l.min != null || l.max != null ? `Norme ${fmt.num(l.min ?? '…')}–${fmt.num(l.max ?? '…')}` : fmt.dateCourte(l.date)}</span>
            </button>`;
          })}
        </div>`}
      `}
      ${data && data.length > 0 && html`<${Section} titre="Bilans enregistrés">
        ${[...data].reverse().map((b) => html`<a class="file-row" href=${`#/p/${slot}/bilans/${b.id}`}>
          <span class="file-icon">${Icon('file', 20)}</span>
          <span class="grow"><strong>${cap(fmt.date(b.date))}</strong><span class="muted small block">${[b.labo, `${b.bilan_valeurs.length} marqueur${b.bilan_valeurs.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</span></span>
          ${Icon('next', 18)}
        </a>`)}
      <//>`}
    </div>
  </div>`;
}

export function BilanDetail({ slot, id }) {
  const p = personneParSlot(slot);
  const [b, , s] = useData(() => q(db.from('bilans').select('*, bilan_valeurs(*)').eq('id', id).single()), [id]);
  if (!p) return html`<${PasTrouve} />`;
  if (!b) return html`<div class="page"><${Etat} s=${s} /></div>`;
  const vals = [...b.bilan_valeurs].sort((x, y) => ordreMarqueur(x.marqueur) - ordreMarqueur(y.marqueur));
  async function supprimer() {
    if (!confirm('Supprimer ce bilan et toutes ses valeurs ?')) return;
    try {
      await q(db.from('bilans').delete().eq('id', id));
      await supprimerFichier(b.fichier_path);
      location.replace(`#/p/${slot}/bilans`);
    } catch (e) { toast(e.message); }
  }
  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} retour=${`#/p/${slot}/bilans`} retourLabel="Prises de sang" titre=${cap(fmt.date(b.date))} sousTitre=${b.labo}
      action=${html`<a class="icon-btn on-color" href=${`#/p/${slot}/bilans/${id}/modifier`} aria-label="Modifier">${Icon('edit', 20)}</a>`} />
    <div class="page">
      ${b.fichier_path && html`<button type="button" class="file-btn big" onClick=${() => ouvrir(b.fichier_path)}>${Icon('file', 22)} Ouvrir le PDF / la photo</button>`}
      <section class="card">
        ${vals.length ? vals.map((v) => {
          const st = statutValeur(Number(v.valeur), v.ref_min, v.ref_max);
          return html`<div class="val-line">
            <span class="grow"><strong>${v.marqueur}</strong>${(v.ref_min != null || v.ref_max != null) && html`<span class="muted small block">Norme ${fmt.num(v.ref_min ?? '…')} – ${fmt.num(v.ref_max ?? '…')}</span>`}</span>
            <span class="val-num">${fmt.num(v.valeur)} <span class="muted small">${v.unite || ''}</span></span>
            ${st && st !== 'normal' && html`<span class="flag red">${libStatut[st]}</span>`}
          </div>`;
        }) : html`<${Vide}>Aucune valeur saisie.<//>`}
      </section>
      ${b.notes && html`<${Section} titre="Notes"><p class="pre">${b.notes}</p><//>`}
      <button type="button" class="btn ghost danger" onClick=${supprimer}>Supprimer ce bilan</button>
    </div>
  </div>`;
}

export function BilanForm({ slot, id }) {
  const p = personneParSlot(slot);
  const [base, , s] = useData(async () => {
    const bilan = id ? await q(db.from('bilans').select('*, bilan_valeurs(*)').eq('id', id).single()) : null;
    const passees = await q(db.from('bilans').select('date, bilan_valeurs(marqueur, unite, ref_min, ref_max)').eq('personne_id', p.id).order('date'));
    return { bilan, passees };
  }, [id]);
  if (!p) return html`<${PasTrouve} />`;
  if (!base) return html`<div class="page"><${Etat} s=${s} /></div>`;
  return html`<${BilanEditeur} slot=${slot} p=${p} base=${base} />`;
}

function BilanEditeur({ slot, p, base }) {
  const { bilan, passees } = base;
  const [info, setInfo] = useState(() => ({
    date: bilan?.date || isoDate(new Date()), labo: bilan?.labo || '', notes: bilan?.notes || '', fichier_path: bilan?.fichier_path || null,
  }));
  const [rows, setRows] = useState(() => {
    const derniers = new Map();
    for (const b of passees) for (const v of b.bilan_valeurs) derniers.set(v.marqueur, v);
    const existants = bilan?.bilan_valeurs || [];
    const noms = [...new Set([...existants.map((v) => v.marqueur), ...MARQUEURS.map((m) => m[0]), ...derniers.keys()])];
    return noms.map((n) => {
      const ex = existants.find((v) => v.marqueur === n);
      const last = derniers.get(n);
      const def = MARQUEURS.find((m) => m[0] === n);
      return {
        marqueur: n,
        valeur: ex ? fmt.num(ex.valeur) : '',
        unite: ex?.unite ?? last?.unite ?? def?.[1] ?? '',
        ref_min: fmt.num(ex?.ref_min ?? last?.ref_min ?? ''),
        ref_max: fmt.num(ex?.ref_max ?? last?.ref_max ?? ''),
      };
    });
  });
  const [nouveau, setNouveau] = useState('');
  const [busy, setBusy] = useState(false);
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setI = (k, v) => setInfo((x) => ({ ...x, [k]: v }));

  async function sauver(e) {
    e.preventDefault();
    if (!info.date) { toast('La date est obligatoire'); return; }
    setBusy(true);
    try {
      const fichier = info.fichier_path instanceof File ? await envoyerFichier(info.fichier_path) : info.fichier_path;
      const row = { personne_id: p.id, date: info.date, labo: info.labo || null, notes: info.notes || null, fichier_path: fichier || null };
      const b = bilan
        ? await q(db.from('bilans').update(row).eq('id', bilan.id).select().single())
        : await q(db.from('bilans').insert(row).select().single());
      if (bilan) await q(db.from('bilan_valeurs').delete().eq('bilan_id', b.id));
      const vals = rows.filter((r) => nombre(r.valeur) != null).map((r) => ({
        bilan_id: b.id, marqueur: r.marqueur, valeur: nombre(r.valeur), unite: r.unite || null, ref_min: nombre(r.ref_min), ref_max: nombre(r.ref_max),
      }));
      if (vals.length) await q(db.from('bilan_valeurs').insert(vals));
      location.replace(`#/p/${slot}/bilans/${b.id}`);
    } catch (err) {
      toast(err.message);
      setBusy(false);
    }
  }

  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} retour=${`#/p/${slot}/bilans`} retourLabel="Prises de sang" titre=${bilan ? 'Modifier le bilan' : 'Nouveau bilan'} sousTitre=${p.prenom} />
    <form class="page" onSubmit=${sauver}>
      <section class="card form">
        <${Champ} f=${{ k: 'date', label: 'Date du prélèvement', type: 'date' }} v=${info.date} set=${(v) => setI('date', v)} d=${info} />
        <${Champ} f=${{ k: 'labo', label: 'Laboratoire', placeholder: 'Labo du centre' }} v=${info.labo} set=${(v) => setI('labo', v)} d=${info} />
        <${Champ} f=${{ k: 'fichier_path', label: 'Résultats (PDF ou photo)', type: 'file' }} v=${info.fichier_path} set=${(v) => setI('fichier_path', v)} d=${info} />
      </section>
      <div class="alert soft"><p>Remplis seulement les marqueurs présents sur le bilan. Recopie aussi les normes écrites par le labo : elles seront pré-remplies la fois suivante.</p></div>
      <section class="card">
        ${rows.map((r, i) => html`<div class=${'val-row' + (nombre(r.valeur) != null ? ' filled' : '')}>
          <label class="val-name" for=${'v' + i}>${r.marqueur}</label>
          <div class="val-inputs">
            <input id=${'v' + i} class="val-input" inputmode="decimal" placeholder="Valeur" value=${r.valeur} onInput=${(e) => setRow(i, 'valeur', e.target.value)} />
            <input class="val-unit" aria-label=${'Unité ' + r.marqueur} placeholder="Unité" value=${r.unite} onInput=${(e) => setRow(i, 'unite', e.target.value)} />
            <span class="val-ref">
              <input aria-label=${'Norme minimum ' + r.marqueur} inputmode="decimal" placeholder="min" value=${r.ref_min} onInput=${(e) => setRow(i, 'ref_min', e.target.value)} />
              <span aria-hidden="true">–</span>
              <input aria-label=${'Norme maximum ' + r.marqueur} inputmode="decimal" placeholder="max" value=${r.ref_max} onInput=${(e) => setRow(i, 'ref_max', e.target.value)} />
            </span>
          </div>
        </div>`)}
        <div class="add-row">
          <input aria-label="Nom d'un autre marqueur" placeholder="Autre marqueur (ex. : Albumine)" value=${nouveau} onInput=${(e) => setNouveau(e.target.value)} />
          <button type="button" class="btn outline small" onClick=${() => {
            const n = nouveau.trim();
            if (n && !rows.find((r) => r.marqueur.toLowerCase() === n.toLowerCase())) setRows([...rows, { marqueur: n, valeur: '', unite: '', ref_min: '', ref_max: '' }]);
            setNouveau('');
          }}>Ajouter</button>
        </div>
      </section>
      <section class="card form">
        <${Champ} f=${{ k: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Ex. : remonte depuis le début du fer' }} v=${info.notes} set=${(v) => setI('notes', v)} d=${info} />
      </section>
      <button class="btn primary" disabled=${busy}>${busy ? 'Enregistrement…' : 'Enregistrer le bilan'}</button>
    </form>
  </div>`;
}

// =====================================================================
// Journal
// =====================================================================
export function Journal({ slot }) {
  const p = personneParSlot(slot);
  const [data, reload, s] = useData(() => (p ? q(db.from('journal').select('*').eq('personne_id', p.id).order('date', { ascending: false }).order('created_at', { ascending: false })) : Promise.resolve([])), [slot]);
  const [sheet, setSheet] = useState(null);
  if (!p) return html`<${PasTrouve} />`;
  return html`<div style=${themeStyle(slot)}>
    <${Hero} slot=${slot} titre=${p.prenom} sousTitre="Journal"><${OngletsPersonne} slot=${slot} actif="journal" /><//>
    <div class="page">
      <button type="button" class="btn primary" onClick=${() => setSheet({ personne_id: p.id, date: isoDate(new Date()) })}>+ Nouvelle note</button>
      ${!data ? html`<${Etat} s=${s} />` : data.length ? data.map((n) => html`<button type="button" class="note" onClick=${() => setSheet(n)}>
        <span class="note-date">${cap(fmt.date(n.date))}</span>
        <span class="pre">${n.texte}</span>
      </button>`) : html`<${Vide}>Note ici ce que tu remarques : fatigue, chute, appétit… C'est précieux à relire avant un rendez-vous.<//>`}
    </div>
    ${sheet && html`<${SimpleSheet} table="journal" titre=${sheet.id ? 'Modifier la note' : 'Nouvelle note'} value=${sheet} onClose=${() => setSheet(null)} onSaved=${reload}
      fields=${[{ k: 'date', label: 'Date', type: 'date', required: true }, { k: 'texte', label: 'Note', type: 'textarea', rows: 6, required: true }]} />`}
  </div>`;
}

// =====================================================================
// Fiche urgence plein écran
// =====================================================================
export function Urgence({ slot }) {
  const p = slot && personneParSlot(slot);
  const [data, , s] = useData(async () => {
    if (!p) return null;
    const [ants, meds] = await Promise.all([
      q(db.from('antecedents').select('*').eq('personne_id', p.id)),
      q(db.from('medicaments').select('*').eq('personne_id', p.id).eq('actif', true).order('nom')),
    ]);
    return { ants, meds };
  }, [slot]);
  if (!p) {
    return html`<div class="page">
      <header class="top"><h1 class="display big">Urgence</h1></header>
      <p class="muted">Quelle fiche afficher ?</p>
      ${store.personnes.map((x) => html`<a class="person-card wide" href=${'#/urgence/' + x.slot} style=${themeStyle(x.slot)}>
        <span class="bubble big inverse">${x.prenom[0]}</span><span class="display person-name">${x.prenom}</span>
      </a>`)}
      <a class="btn red big" href="tel:15">${Icon('phone', 22)} Appeler le 15 (SAMU)</a>
    </div>`;
  }
  if (!data) return html`<div class="page"><${Etat} s=${s} /></div>`;
  const a = age(p.date_naissance);
  const histo = data.ants.filter((x) => x.categorie === 'operation' || x.categorie === 'maladie').sort((x, y) => (y.annee || '').localeCompare(x.annee || ''));
  return html`<div class="urgence-page">
    <header class="urgence-top">
      <a class="back" href="#/urgence">${Icon('back', 18, 2.4)} Retour</a>
      <h1 class="display">${p.prenom}</h1>
      <p>${[a != null && `${a} ans`, p.date_naissance && `né(e) le ${fmt.date(p.date_naissance)}`].filter(Boolean).join(' · ')}</p>
    </header>
    <div class="page">
      <dl class="kv big">
        ${lignesUrgence(p, data.ants, data.meds).map((l) => html`<div><dt>${l.k}</dt><dd class=${l.alerte ? 'alerte' : ''}>${l.v}</dd></div>`)}
        ${p.num_secu && html`<div><dt>N° sécu</dt><dd>${p.num_secu}</dd></div>`}
        ${p.mutuelle && html`<div><dt>Mutuelle</dt><dd>${p.mutuelle}</dd></div>`}
      </dl>
      <${Section} titre="Traitement en cours">
        ${data.meds.length ? data.meds.map((m) => html`<div class="u-med"><strong>${m.nom}</strong><span class="small">${posologie(m)}</span></div>`) : html`<p class="muted">Aucun</p>`}
      <//>
      ${histo.length > 0 && html`<${Section} titre="Antécédents">
        ${histo.map((x) => html`<p class="u-ant"><strong>${x.annee || ''}</strong> ${x.titre}</p>`)}
      <//>`}
      ${p.infos_urgence && html`<${Section} titre="À savoir"><p class="pre">${p.infos_urgence}</p><//>`}
      <div class="btn-row">
        <a class="btn red" href="tel:15">${Icon('phone', 20)} Appeler le 15</a>
        ${p.medecin_tel && html`<a class="btn outline" href=${'tel:' + p.medecin_tel.replace(/\s/g, '')}>${Icon('phone', 20)} Médecin traitant</a>`}
      </div>
    </div>
  </div>`;
}

// =====================================================================
// Tâches
// =====================================================================
export function Taches() {
  const [data, reload, s] = useData(async () => {
    const [ouvertes, faites] = await Promise.all([
      q(db.from('taches').select('*').eq('fait', false).order('echeance', { ascending: true, nullsFirst: false })),
      q(db.from('taches').select('*').eq('fait', true).order('created_at', { ascending: false }).limit(30)),
    ]);
    return { ouvertes, faites };
  });
  const [sheet, setSheet] = useState(null);
  const [voirFaites, setVoirFaites] = useState(false);
  return html`<div class="page">
    <header class="top"><div><a class="back dark" href="#/">${Icon('back', 18, 2.4)} Accueil</a><h1 class="display big">Tâches</h1></div></header>
    <button type="button" class="btn primary" onClick=${() => setSheet({})}>+ Tâche</button>
    ${!data ? html`<${Etat} s=${s} />` : html`
      <${Section} titre="À faire">
        ${data.ouvertes.length ? data.ouvertes.map((t) => html`<${TacheLigne} key=${t.id} t=${t} onChange=${reload} onEdit=${() => setSheet(t)} />`) : html`<${Vide}>Tout est fait.<//>`}
      <//>
      <button type="button" class="link" onClick=${() => setVoirFaites(!voirFaites)}>${voirFaites ? 'Masquer' : 'Voir'} les tâches faites (${data.faites.length})</button>
      ${voirFaites && html`<${Section} titre="Faites">${data.faites.map((t) => html`<${TacheLigne} key=${t.id} t=${t} onChange=${reload} onEdit=${() => setSheet(t)} />`)}<//>`}
    `}
    ${sheet && html`<${TacheSheet} value=${sheet} onClose=${() => setSheet(null)} onSaved=${reload} />`}
  </div>`;
}

// =====================================================================
// Mes rappels
// =====================================================================
const ORIGINES = { perso: 'Perso', rdv: 'Rendez-vous', tache: 'Tâche', ordonnance: 'Ordonnance' };
const REPET = { semaine: 'chaque semaine', mois: 'chaque mois', annee: 'chaque année' };

export function Rappels() {
  const [data, reload, s] = useData(() => q(db.from('rappels').select('*').is('envoye_le', null).order('quand').limit(150)));
  const [sheet, setSheet] = useState(null);
  function ouvrirRappel(r) {
    if (r.origine === 'perso') setSheet(r);
    else if (r.rdv_id) go('#/rdv/' + r.rdv_id);
    else if (r.origine === 'tache') go('#/taches');
    else if (r.origine === 'ordonnance') go(`#/p/${personneParId(r.personne_id)?.slot}/traitement`);
  }
  async function supprimer(r) {
    if (!confirm('Supprimer ce rappel ?')) return;
    try { await q(db.from('rappels').delete().eq('id', r.id)); reload(); } catch (e) { toast(e.message); }
  }
  return html`<div class="page">
    <header class="top"><div><a class="back dark" href="#/">${Icon('back', 18, 2.4)} Accueil</a><h1 class="display big">Mes rappels</h1></div></header>
    <button type="button" class="btn primary" onClick=${() => setSheet({})}>+ Nouveau rappel</button>
    <div class="alert soft"><p>Les rappels des rendez-vous, tâches et ordonnances se créent tout seuls. Leurs délais se règlent dans <a href="#/reglages">Réglages</a>, ou rendez-vous par rendez-vous.</p></div>
    ${!data ? html`<${Etat} s=${s} />` : data.length ? data.map((r) => {
      const p = personneParId(r.personne_id);
      return html`<div class="rappel">
        <button type="button" class="rappel-body" onClick=${() => ouvrirRappel(r)}>
          <span class="rappel-when">${cap(fmt.court(r.quand))} · ${fmt.heure(r.quand)}</span>
          <strong>${r.titre}</strong>
          ${r.message && html`<span class="muted small">${r.message}</span>`}
          <span class="task-meta">
            <span class="mini-chip">${ORIGINES[r.origine]}${r.repetition !== 'aucune' ? ' · ' + REPET[r.repetition] : ''}</span>
            ${p && html`<${Tag} slot=${p.slot}>${p.prenom}<//>`}
          </span>
        </button>
        <button type="button" class="icon-btn plain" aria-label="Supprimer ce rappel" onClick=${() => supprimer(r)}>${Icon('x', 18)}</button>
      </div>`;
    }) : html`<${Vide}>Aucun rappel à venir.<//>`}
    ${sheet && html`<${RappelSheet} value=${sheet} onClose=${() => setSheet(null)} onSaved=${reload} />`}
  </div>`;
}

// =====================================================================
// Réglages
// =====================================================================
export function Reglages() {
  const [notif, setNotif] = useState('…');
  const [r, setR] = useState(() => ({ ...store.reglages }));
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [, forcer] = useState(0);
  useEffect(() => { etatNotifications().then(setNotif); }, []);

  async function activer() {
    try { await activerNotifications(); setNotif('actif'); toast('Notifications activées sur cet appareil'); } catch (e) { toast(e.message); etatNotifications().then(setNotif); }
  }
  async function tester() {
    try {
      const res = await notificationTest();
      toast(res?.envoyes ? 'Notification envoyée' : "Aucun appareil n'a reçu la notification. Réactive-les.");
    } catch (e) { toast('Échec du test : ' + e.message); }
  }
  async function sauver() {
    setBusy(true);
    try {
      const row = { heure_rappel: r.heure_rappel, rdv_jours: r.rdv_jours, tache_jours: r.tache_jours, ordonnance_jours: r.ordonnance_jours };
      store.reglages = await q(db.from('reglages').update(row).eq('owner', store.user.id).select().single());
      await resyncTout();
      toast('Réglages enregistrés, rappels mis à jour');
    } catch (e) { toast(e.message); }
    setBusy(false);
  }
  const set = (k) => (v) => setR((x) => ({ ...x, [k]: v }));
  const heures = Array.from({ length: 16 }, (_, i) => i + 6).map((h) => ({ value: h, label: `${h} h` }));

  const texteNotif = {
    'non-supporte': estInstallee()
      ? 'Ce navigateur ne gère pas les notifications.'
      : "Pour recevoir les notifications sur iPhone, installe d'abord l'appli : dans Safari, bouton Partager → « Sur l'écran d'accueil », puis ouvre-la depuis son icône.",
    refuse: 'Les notifications sont bloquées. Va dans Réglages de l’iPhone > Notifications > Suivi Santé pour les autoriser.',
    inactif: 'Pas encore activées sur cet appareil.',
    actif: 'Activées sur cet appareil.',
    '…': '…',
  }[notif];

  return html`<div class="page">
    <header class="top"><div><a class="back dark" href="#/">${Icon('back', 18, 2.4)} Accueil</a><h1 class="display big">Réglages</h1></div></header>

    <${Section} titre="Notifications">
      <p class=${notif === 'actif' ? 'ok strong' : ''}>${texteNotif}</p>
      <p class="muted small">À faire sur chaque appareil (iPhone, iPad, ordinateur).</p>
      <div class="btn-row">
        ${notif === 'inactif' && html`<button type="button" class="btn primary" onClick=${activer}>${Icon('bell', 18)} Activer</button>`}
        ${notif === 'actif' && html`<button type="button" class="btn outline" onClick=${tester}>Envoyer une notification test</button>`}
      </div>
    <//>

    <${Section} titre="Rappels par défaut">
      <div class="form">
        <${Champ} f=${{ k: 'heure_rappel', label: 'Heure des rappels', type: 'select', options: heures, empty: false, numeric: true }} v=${r.heure_rappel} set=${set('heure_rappel')} d=${r} />
        <${Champ} f=${{ k: 'rdv_jours', label: 'Rendez-vous : me prévenir', type: 'jours', zero: '2 h avant' }} v=${r.rdv_jours} set=${set('rdv_jours')} d=${r} />
        <${Champ} f=${{ k: 'tache_jours', label: 'Tâches : me prévenir', type: 'jours' }} v=${r.tache_jours} set=${set('tache_jours')} d=${r} />
        <${Champ} f=${{ k: 'ordonnance_jours', label: "Ordonnances : me prévenir avant la fin", type: 'select', empty: false, numeric: true,
          options: [3, 5, 7, 10, 14, 21, 30].map((j) => ({ value: j, label: `${j} jours avant` })) }} v=${r.ordonnance_jours} set=${set('ordonnance_jours')} d=${r} />
        <p class="help">Chaque rendez-vous ou tâche peut avoir ses propres rappels : ouvre-le et change « Me prévenir ».</p>
        <button type="button" class="btn primary" disabled=${busy} onClick=${sauver}>${busy ? 'Mise à jour…' : 'Enregistrer'}</button>
      </div>
    <//>

    <${Section} titre="Prénoms et infos">
      ${store.personnes.map((p) => html`<button type="button" class="line-btn" onClick=${() => setSheet(p)}>
        <span class="bubble" style=${`background:${THEMES[p.slot].c};color:${THEMES[p.slot].ink}`}>${p.prenom[0]}</span>
        <span class="grow"><strong>${p.prenom}</strong><span class="muted small block">${p.slot === 'p1' ? 'Couleur verte' : 'Couleur orange'}</span></span>
        ${Icon('edit', 18)}
      </button>`)}
    <//>

    <${Section} titre="Compte">
      <p class="muted small">${store.user?.email}</p>
      <button type="button" class="btn outline" onClick=${() => db.auth.signOut()}>${Icon('logout', 18)} Se déconnecter</button>
    <//>
    ${sheet && html`<${PersonneSheet} p=${sheet} onClose=${() => setSheet(null)} onSaved=${() => forcer((x) => x + 1)} />`}
  </div>`;
}
