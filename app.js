// Suivi Santé — démarrage et navigation
import { html, render, useState, useEffect, useRoute, Toaster } from './ui.js';
import { db, store, chargerBase, configOk } from './core.js';
import * as P from './pages.js';

function choisirPage([a, b, c, d, e]) {
  if (!a) return [html`<${P.Accueil} />`, 'home'];
  if (a === 'agenda') return [html`<${P.Agenda} />`, 'agenda'];
  if (a === 'p' && b) {
    if (!c) return [html`<${P.Personne} slot=${b} />`, b];
    if (c === 'rdv') return [html`<${P.RdvListe} slot=${b} />`, b];
    if (c === 'traitement') return [html`<${P.Traitement} slot=${b} />`, b];
    if (c === 'antecedents') return [html`<${P.Antecedents} slot=${b} />`, b];
    if (c === 'journal') return [html`<${P.Journal} slot=${b} />`, b];
    if (c === 'specialite' && d) return [html`<${P.Specialite} slot=${b} id=${d} />`, b];
    if (c === 'bilans') {
      if (!d) return [html`<${P.Bilans} slot=${b} />`, b];
      if (d === 'nouveau') return [html`<${P.BilanForm} slot=${b} />`, b];
      if (e === 'modifier') return [html`<${P.BilanForm} slot=${b} id=${d} />`, b];
      return [html`<${P.BilanDetail} slot=${b} id=${d} />`, b];
    }
  }
  if (a === 'rdv' && b === 'nouveau') return [html`<${P.RdvNouveau} />`, 'agenda'];
  if (a === 'rdv' && b) return [html`<${P.RdvFiche} id=${b} />`, null];
  if (a === 'urgence') return [html`<${P.Urgence} slot=${b} />`, 'urgence'];
  if (a === 'taches') return [html`<${P.Taches} />`, 'home'];
  if (a === 'rappels') return [html`<${P.Rappels} />`, 'home'];
  if (a === 'reglages') return [html`<${P.Reglages} />`, 'home'];
  return [html`<div class="page"><p class="empty">Page introuvable. <a href="#/">Accueil</a></p></div>`, null];
}

function App() {
  const [etat, setEtat] = useState('chargement');
  const [erreur, setErreur] = useState(null);
  const route = useRoute();

  async function demarrer(session) {
    if (!session) { setEtat('login'); return; }
    store.user = session.user;
    try {
      await chargerBase();
      setEtat('pret');
    } catch (e) {
      console.error(e);
      setErreur(e);
      setEtat('erreur');
    }
  }

  useEffect(() => {
    if (!configOk) { setEtat('config'); return undefined; }
    db.auth.getSession().then(({ data }) => demarrer(data.session));
    const { data } = db.auth.onAuthStateChange((evenement) => {
      if (evenement === 'SIGNED_OUT') { store.user = null; setEtat('login'); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (etat === 'config') return html`<${P.ConfigManquante} />`;
  if (etat === 'chargement') return html`<p class="boot">Chargement…</p>`;
  if (etat === 'login') return html`<${P.Login} onDone=${demarrer} /><${Toaster} />`;
  if (etat === 'erreur') {
    return html`<div class="login"><h1 class="display big">Oups</h1>
      <div class="card"><p>Impossible de charger les données : ${erreur?.message}</p>
      <p class="muted small">Vérifie que le fichier 01_schema.sql a bien été exécuté dans Supabase.</p>
      <button class="btn primary" onClick=${() => location.reload()}>Réessayer</button></div></div>`;
  }

  const [page, actif] = choisirPage(route);
  return html`<div class="app">
    ${page}
    <${P.Nav} actif=${actif} />
    <${Toaster} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('root'));
