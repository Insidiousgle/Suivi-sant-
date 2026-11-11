// Suivi Santé — composants d'interface partagés
import { html, render, useState, useEffect, useMemo, useRef } from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
import {
  store, THEMES, themeStyle, fmt, D, toLocalInput, fromLocalInput, libJours, nomFichier,
} from './core.js';

export { html, render, useState, useEffect, useMemo, useRef };

// ---------- Routage (#/chemin) ----------
export function useRoute() {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => {
    const f = () => { setH(location.hash || '#/'); window.scrollTo(0, 0); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h.slice(1).split('?')[0].split('/').filter(Boolean);
}
export const go = (p) => { location.hash = p; };
export const params = () => new URLSearchParams(location.hash.split('?')[1] || '');

// ---------- Chargement de données ----------
export function useData(fn, deps = []) {
  const [s, setS] = useState({ data: null, error: null, loading: true });
  const [k, setK] = useState(0);
  useEffect(() => {
    let vivant = true;
    setS((x) => ({ ...x, loading: true }));
    fn().then(
      (data) => vivant && setS({ data, error: null, loading: false }),
      (error) => { console.error(error); vivant && setS({ data: null, error, loading: false }); },
    );
    return () => { vivant = false; };
  }, [...deps, k]);
  return [s.data, () => setK((x) => x + 1), s];
}
export function Etat({ s }) {
  if (s.error) return html`<p class="empty error">Erreur : ${s.error.message || String(s.error)}</p>`;
  return html`<p class="empty">Chargement…</p>`;
}

// ---------- Messages ----------
let afficherToast = null;
export function toast(m) { if (afficherToast) afficherToast(m); }
export function Toaster() {
  const [m, setM] = useState(null);
  const t = useRef(null);
  useEffect(() => {
    afficherToast = (x) => { setM(x); clearTimeout(t.current); t.current = setTimeout(() => setM(null), 4000); };
  }, []);
  return m ? html`<div class="toast" role="status">${m}</div>` : null;
}

// ---------- Icônes ----------
const P = {
  home: 'M3 11l9-7 9 7v9h-6v-6H9v6H3z',
  agenda: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
  alert: 'M12 3l9.5 17h-19zM12 10v4.5M12 17.5v.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 7 2 7H4s2-2 2-7M10 20a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7zM7 10l7 7',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plate: 'M3 12h18M5 12a7 7 0 0 0 14 0M12 5v3',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  bed: 'M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  notes: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
};
export function Icon(nom, taille = 22, epaisseur = 1.9) {
  return html`<svg width=${taille} height=${taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${epaisseur} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[nom] || ''} /></svg>`;
}

// ---------- Navigation du bas ----------
export function Nav({ actif }) {
  const items = [
    { k: 'home', label: 'Accueil', href: '#/', icon: 'home' },
    { k: 'agenda', label: 'Agenda', href: '#/agenda', icon: 'agenda' },
    ...store.personnes.map((p) => ({ k: p.slot, label: p.prenom, href: `#/p/${p.slot}`, person: p })),
    { k: 'urgence', label: 'Urgence', href: '#/urgence', icon: 'alert' },
  ];
  return html`<nav class="nav" aria-label="Navigation principale">
    ${items.map((it) => {
      const on = it.k === actif;
      const t = it.person && THEMES[it.person.slot];
      return html`<a href=${it.href} class=${'nav-item' + (on ? ' on' : '')} aria-current=${on ? 'page' : undefined}>
        ${it.person
          ? html`<span class="bubble" style=${`background:${t.c};color:${t.ink};${on ? `box-shadow:0 0 0 2px #fff,0 0 0 4px ${t.c}` : ''}`}>${(it.person.prenom || '?')[0].toUpperCase()}</span>`
          : Icon(it.icon, 26, 1.8)}
        <span class="nav-label">${it.label}</span>
      </a>`;
    })}
  </nav>`;
}

// ---------- En-tête coloré d'une personne ----------
export function Hero({ slot, retour, retourLabel, titre, sousTitre, action, children }) {
  return html`<header class="hero" style=${themeStyle(slot)}>
    ${retour && html`<a class="back" href=${retour}>${Icon('back', 18, 2.4)} ${retourLabel}</a>`}
    <div class="hero-row">
      <div class="hero-titles">
        <h1 class="display">${titre}</h1>
        ${sousTitre && html`<p class="hero-sub">${sousTitre}</p>`}
      </div>
      ${action}
    </div>
    ${children}
  </header>`;
}
export function OngletsPersonne({ slot, actif }) {
  const tabs = [
    ['synthese', 'Synthèse', ''], ['rdv', 'Rendez-vous', '/rdv'], ['traitement', 'Traitement', '/traitement'],
    ['antecedents', 'Antécédents', '/antecedents'], ['bilans', 'Prises de sang', '/bilans'], ['journal', 'Journal', '/journal'],
  ];
  return html`<nav class="tabs" aria-label="Sections">
    ${tabs.map(([k, l, s]) => html`<a href=${`#/p/${slot}${s}`} class=${'tab' + (k === actif ? ' on' : '')} aria-current=${k === actif ? 'page' : undefined}>${l}</a>`)}
  </nav>`;
}

// ---------- Fenêtre de formulaire ----------
export function Sheet({ titre, onClose, children }) {
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);
  return html`<div class="sheet-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${titre}>
      <div class="sheet-head">
        <h2 class="display">${titre}</h2>
        <button type="button" class="icon-btn" aria-label="Fermer" onClick=${onClose}>${Icon('x')}</button>
      </div>
      ${children}
    </div>
  </div>`;
}

const JOURS = [30, 14, 7, 3, 2, 1, 0];
function JoursPicker({ id, value, set, defaut, zero }) {
  const cur = value ?? defaut ?? [];
  const toggle = (j) => {
    const s = new Set(cur);
    if (s.has(j)) s.delete(j); else s.add(j);
    set([...s].sort((a, b) => b - a));
  };
  return html`<div id=${id}>
    <div class="chips">
      ${JOURS.map((j) => html`<button type="button" class=${'chip' + (cur.includes(j) ? ' on' : '')} aria-pressed=${cur.includes(j)} onClick=${() => toggle(j)}>${libJours(j, zero)}</button>`)}
    </div>
    ${value != null && defaut
      ? html`<button type="button" class="link" onClick=${() => set(null)}>Revenir au réglage par défaut</button>`
      : defaut && html`<p class="help">Réglage par défaut (modifiable dans Réglages).</p>`}
  </div>`;
}

function ChoixFichier({ id, value, set }) {
  const nom = value instanceof File ? value.name : nomFichier(value);
  return html`<div class="file-pick">
    <label class="btn soft" for=${id}>${Icon('upload', 18)} ${nom ? 'Remplacer' : 'Choisir un PDF ou une photo'}</label>
    <input id=${id} class="visually-hidden" type="file" accept="application/pdf,image/*" onChange=${(e) => e.target.files[0] && set(e.target.files[0])} />
    ${nom && html`<span class="file-name">${nom}</span>`}
  </div>`;
}

export function Champ({ f, v, set, d }) {
  const id = 'f_' + f.k;
  if (f.type === 'checkbox') {
    return html`<label class="check"><input type="checkbox" checked=${!!v} onChange=${(e) => set(e.target.checked)} /><span>${f.label}</span></label>`;
  }
  const options = typeof f.options === 'function' ? f.options(d) : f.options;
  let input;
  switch (f.type) {
    case 'textarea':
      input = html`<textarea id=${id} rows=${f.rows || 3} placeholder=${f.placeholder || ''} value=${v ?? ''} onInput=${(e) => set(e.target.value)} />`;
      break;
    case 'select':
      input = html`<select id=${id} value=${v ?? ''} onChange=${(e) => set(e.target.value === '' ? null : (f.numeric ? Number(e.target.value) : e.target.value))}>
        ${f.empty !== false && html`<option value="">${f.empty || '—'}</option>`}
        ${options.map((o) => html`<option value=${o.value} selected=${String(o.value) === String(v ?? '')}>${o.label}</option>`)}
      </select>`;
      break;
    case 'datetime':
      input = html`<input id=${id} type="datetime-local" value=${toLocalInput(v)} onInput=${(e) => set(fromLocalInput(e.target.value))} />`;
      break;
    case 'date':
      input = html`<input id=${id} type="date" value=${v || ''} onInput=${(e) => set(e.target.value || null)} />`;
      break;
    case 'jours':
      input = html`<${JoursPicker} id=${id} value=${v} set=${set} defaut=${f.defaut} zero=${f.zero} />`;
      break;
    case 'file':
      input = html`<${ChoixFichier} id=${id} value=${v} set=${set} />`;
      break;
    default:
      input = html`<input id=${id} type="text" inputmode=${f.inputmode} placeholder=${f.placeholder || ''} value=${v ?? ''} onInput=${(e) => set(e.target.value)} />`;
  }
  return html`<div class="field">
    <label for=${id}>${f.label}</label>
    ${input}
    ${f.help && html`<p class="help">${f.help}</p>`}
  </div>`;
}

// onSave peut renvoyer false pour garder la main sur la fermeture
export function FormSheet({ titre, fields, value = {}, onSave, onDelete, onClose, saveLabel = 'Enregistrer' }) {
  const [d, setD] = useState(() => ({ ...value }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && (d[f.k] == null || d[f.k] === '')) { toast(`« ${f.label} » est obligatoire`); return; }
    }
    setBusy(true);
    try {
      const r = await onSave(d);
      if (r !== false) onClose();
    } catch (err) {
      console.error(err);
      toast(err.message || String(err));
      setBusy(false);
    }
  }
  async function supprimer() {
    if (!confirm('Supprimer définitivement ?')) return;
    try { await onDelete(); onClose(); } catch (err) { toast(err.message || String(err)); }
  }
  return html`<${Sheet} titre=${titre} onClose=${onClose}>
    <form class="form" onSubmit=${submit}>
      ${fields.filter((f) => !f.when || f.when(d)).map((f) => f.section
        ? html`<h3 class="form-section">${f.section}</h3>`
        : html`<${Champ} key=${f.k} f=${f} v=${d[f.k]} d=${d} set=${(v) => set(f.k, v)} />`)}
      <div class="form-actions">
        ${onDelete && html`<button type="button" class="btn ghost danger" onClick=${supprimer}>Supprimer</button>`}
        <button type="submit" class="btn primary" disabled=${busy}>${busy ? 'Enregistrement…' : saveLabel}</button>
      </div>
    </form>
  <//>`;
}

// ---------- Petits éléments ----------
export function Section({ titre, action, children, classe = '' }) {
  return html`<section class=${'card ' + classe}>
    ${(titre || action) && html`<div class="card-head"><h2 class="display">${titre}</h2>${action}</div>`}
    ${children}
  </section>`;
}
export function DateBloc({ date, slot }) {
  return html`<span class="date-bloc" style=${themeStyle(slot)}>
    <span class="dow">${fmt.dow(date)}</span><span class="day">${D(date).getDate()}</span>
  </span>`;
}
export function Tag({ slot, children }) {
  return html`<span class="tag" style=${themeStyle(slot)}>${children}</span>`;
}
export function Vide({ children }) {
  return html`<p class="empty">${children}</p>`;
}
export function Texte({ children }) {
  return children ? html`<p class="pre">${children}</p>` : html`<p class="muted">—</p>`;
}

// ---------- Graphiques ----------
export function Courbe({ points, min, max, couleur = '#C9601A' }) {
  if (!points.length) return null;
  const W = 340, H = 190, L = 40, R = 18, T = 18, B = 30;
  const vals = points.map((p) => p.v);
  let lo = Math.min(...vals, min ?? Infinity), hi = Math.max(...vals, max ?? -Infinity);
  const pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.1 || 1;
  lo -= pad; hi += pad;
  const t0 = D(points[0].date).getTime(), t1 = D(points[points.length - 1].date).getTime();
  const x = (p, i) => (points.length === 1 ? (L + W - R) / 2 : t1 > t0 ? L + ((D(p.date).getTime() - t0) / (t1 - t0)) * (W - L - R) : L + (i * (W - L - R)) / (points.length - 1));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = points.map((p, i) => `${x(p, i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const der = points[points.length - 1];
  const dx = x(der, points.length - 1), dy = y(der.v);
  const hors = (v) => (min != null && v < min) || (max != null && v > max);
  const etiquettes = points.length <= 6 ? points.map((p, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  const libY = [min, max].filter((v) => v != null);
  if (!libY.length) libY.push(Math.min(...vals), Math.max(...vals));
  const desc = `Évolution : ${points.map((p) => `${fmt.dateCourte(p.date)} ${fmt.num(p.v)}`).join(', ')}`;
  return html`<svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${desc}>
    ${min != null && max != null && html`<rect x=${L} y=${y(max)} width=${W - L - R} height=${y(min) - y(max)} rx="6" fill="var(--c-tint, #EEF0EC)" />`}
    ${[min, max].filter((v) => v != null).map((v) => html`<line x1=${L} x2=${W - R} y1=${y(v)} y2=${y(v)} stroke="#B9BFB9" stroke-dasharray="4 4" />`)}
    ${libY.map((v) => html`<text x=${L - 8} y=${y(v) + 4} text-anchor="end" class="chart-txt">${fmt.num(+Number(v).toFixed(2))}</text>`)}
    <polyline points=${pts} fill="none" stroke=${couleur} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    ${points.map((p, i) => html`<circle cx=${x(p, i)} cy=${y(p.v)} r=${i === points.length - 1 ? 6 : 4.5} fill=${hors(p.v) ? '#9E211B' : i === points.length - 1 ? couleur : '#fff'} stroke=${hors(p.v) ? '#9E211B' : couleur} stroke-width="2.5" />`)}
    <rect x=${Math.min(dx - 24, W - 50)} y=${dy - 34} width="48" height="22" rx="7" fill="#17201B" />
    <text x=${Math.min(dx, W - 26)} y=${dy - 19} text-anchor="middle" class="chart-val">${fmt.num(der.v)}</text>
    ${etiquettes.map((i) => html`<text x=${x(points[i], i)} y=${H - 8} text-anchor="middle" class="chart-txt">${fmt.moisCourt(points[i].date)}</text>`)}
  </svg>`;
}
export function Sparkline({ valeurs, couleur = '#C9601A' }) {
  if (valeurs.length < 2) return html`<svg width="120" height="34" aria-hidden="true"></svg>`;
  const lo = Math.min(...valeurs), hi = Math.max(...valeurs), r = hi - lo || 1;
  const pts = valeurs.map((v, i) => `${(4 + (i * 112) / (valeurs.length - 1)).toFixed(1)},${(30 - ((v - lo) / r) * 26).toFixed(1)}`).join(' ');
  return html`<svg width="120" height="34" viewBox="0 0 120 34" aria-hidden="true"><polyline points=${pts} fill="none" stroke=${couleur} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}
