/* Gestion Master Exécutif AIGP — application privée (admin.html)
   Vanilla JS, données dans Supabase. Toutes les vues sont rendues dans #view
   à partir de l'état S ; chaque écriture recharge la table concernée. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const mad = (n) => nf.format(Math.round(n || 0)) + " MAD";
  const pct = (n) => (n == null || isNaN(n) ? "—" : Math.round(n * 100) + " %");
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d, long = false) => !d ? "Date à fixer" : new Intl.DateTimeFormat("fr-FR", long ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d + "T00:00:00"));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f ? f(x) : x) || 0), 0);
  const by = (arr, f) => arr.reduce((m, x) => ((m[f(x)] ||= []).push(x), m), {});
  const uniq = (arr) => [...new Set(arr)];
  const rand4 = () => String(Math.floor(Math.random() * 10000)).padStart(4, "0");

  const CFG = window.APP_CONFIG || {};
  const configured = CFG.SUPABASE_URL && !/VOTRE-PROJET/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_ANON_KEY && !/VOTRE_CLE/.test(CFG.SUPABASE_ANON_KEY);
  const sb = configured ? supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

  const STATUTS_P = ["Actif", "Abandon", "Diplômé", "Suspendu"];
  const FINANCEMENTS = ["Individuel", "Entreprise", "Mixte", "Bourse"];
  const TYPES_REC = ["Participant", "Entreprise", "Sponsor", "Subvention"];
  const STATUTS_S = ["Planifié", "Réalisé", "Reporté", "Annulé"];
  const HORAIRES = { S1: "09:00–10:30", S2: "10:45–12:15", S3: "14:00–15:30", S4: "15:45–17:15" };

  const SPACE = document.body.dataset.space || "admin"; // "admin" (équipe), "prof" (intervenants) ou "etudiant"
  const HOME = { admin: "dash", prof: "prof", etudiant: "etu_accueil" };
  const S = { view: HOME[SPACE] || "dash", cohorte: "all", data: {}, ui: {}, role: null, me: null };
  const D = S.data;
  const views = {};
  const isAdmin = () => S.role === "admin";
  const isEtudiant = () => S.role === "etudiant";
  const PHASES = [["avant", "Avant le cours"], ["pendant", "Pendant le cours"], ["apres", "Après le cours"]];

  /* ---------- Chargement ---------- */
  async function fetchAll(table, order) {
    const out = []; let from = 0;
    for (;;) {
      let q = sb.from(table).select("*").range(from, from + 999);
      if (order) q = q.order(order);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    return out;
  }
  async function loadAll() {
    const tables = isAdmin() ? ["cohortes", "participants", "seances", "emargements", "presences", "depenses", "recettes", "config", "profils", "checklist", "documents"]
      : isEtudiant() ? ["cohortes", "participants", "seances", "emargements_min", "presences", "config", "documents"]
      : ["cohortes", "participants_min", "seances", "emargements", "presences", "config", "checklist"];
    const res = await Promise.all(tables.map((t) => fetchAll(t)));
    tables.forEach((t, i) => (D[t.replace("_min", "")] = res[i]));
    if (!isAdmin()) { D.depenses = []; D.recettes = []; D.profils = []; D.checklist ||= []; D.documents ||= []; }
    D.cfg = Object.fromEntries(D.config.map((c) => [c.cle, c.valeur]));
    D.cfg.checklist ||= [];
    D.participants.sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr"));
    D.seances.sort((a, b) => a.cohorte.localeCompare(b.cohorte) || a.jour - b.jour || a.creneau.localeCompare(b.creneau));
    D.emargements.sort((a, b) => a.cohorte.localeCompare(b.cohorte) || a.jour - b.jour || a.demi.localeCompare(b.demi));
    D.cfg.certificats ||= { C1: "AI Foundations", C2: "AI Applications", C3: "AI Analytics & Data Science", C4: "Robotics & Autonomous Systems", C5: "AI Governance", C6: "AI Transformation" };
    D.cfg.categories_depenses ||= ["Honoraires intervenants", "Logistique & salles", "Restauration", "Communication & marketing", "Autre"];
    D.cfg.seuil_presence ||= 70;
    D.cfg.checkin_url ||= (CFG.SITE_URL || "") + "/checkin.html";
    const sel = $("#cohorte"); const cur = sel.value;
    sel.innerHTML = '<option value="all">Toutes les cohortes</option>' + D.cohortes.map((c) => `<option value="${esc(c.id)}">${esc(c.libelle)}</option>`).join("");
    sel.value = D.cohortes.some((c) => c.id === cur) ? cur : "all";
    S.cohorte = sel.value;
  }
  async function reload(table) {
    if (table === "participants" && !isAdmin()) { D.participants = await fetchAll("participants_min"); render(); return; }
    D[table] = await fetchAll(table);
    if (table === "participants") D.participants.sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr"));
    if (table === "seances") D.seances.sort((a, b) => a.cohorte.localeCompare(b.cohorte) || a.jour - b.jour || a.creneau.localeCompare(b.creneau));
    if (table === "emargements") D.emargements.sort((a, b) => a.cohorte.localeCompare(b.cohorte) || a.jour - b.jour || a.demi.localeCompare(b.demi));
    if (table === "config") D.cfg = Object.assign(D.cfg, Object.fromEntries(D.config.map((c) => [c.cle, c.valeur])));
    render();
  }
  async function write(table, op, payload, match) {
    let q = sb.from(table);
    if (op === "insert") q = q.insert(payload);
    else if (op === "upsert") q = q.upsert(payload, match ? { onConflict: match } : undefined);
    else if (op === "update") q = q.update(payload).eq("id", match);
    else if (op === "delete") q = q.delete().eq("id", match);
    const { error } = await q;
    if (error) { toast(error.message, true); throw error; }
    await reload(table);
  }

  /* ---------- Helpers métier ---------- */
  const inScope = (r) => S.cohorte === "all" || r.cohorte === S.cohorte || (r.cohorte === "Commun" && S.cohorte === "all");
  const scopeLbl = () => S.cohorte === "all" ? "toutes cohortes" : (D.cohortes.find((c) => c.id === S.cohorte) || {}).libelle || S.cohorte;
  const certLbl = (c) => c ? `${c} · ${D.cfg.certificats[c] || ""}` : "—";
  const pName = (p) => p ? `${(p.nom || "").toUpperCase()} ${p.prenom || ""}`.trim() : "—";
  const pById = (id) => D.participants.find((p) => p.id === id);
  const seancesOf = (emId) => D.seances.filter((s) => s.emargement === emId);
  const tenue = (s) => s.statut === "Réalisé" || (s.statut !== "Annulé" && s.statut !== "Reporté" && s.date && s.date <= today());
  const heuresEm = (emId, onlyTenues = true) => sum(seancesOf(emId).filter((s) => !onlyTenues || tenue(s)), (s) => s.duree);
  const recStatut = (r) => {
    const f = +r.montant_facture || 0, e = +r.montant_encaisse || 0;
    if (f > 0 && e >= f) return ["Encaissée", "ok"];
    if (e > 0) return ["Partielle", "warn"];
    if (r.echeance && r.echeance < today()) return ["En retard", "bad"];
    return ["En attente", "info"];
  };
  /* Taux de présence d'un participant : {parCert:{C1:{pres,tenues}}, total:{pres,tenues}} */
  function tauxParticipant(p) {
    const ems = D.emargements.filter((e) => e.cohorte === p.cohorte);
    const pres = by(D.presences.filter((x) => x.participant === p.id), (x) => x.emargement);
    const out = { parCert: {}, total: { pres: 0, tenues: 0, exc: 0 } };
    ems.forEach((e) => {
      const h = heuresEm(e.id); if (!h) return;
      const c = (out.parCert[e.certificat] ||= { pres: 0, tenues: 0, exc: 0 });
      c.tenues += h; out.total.tenues += h;
      const st = pres[e.id] && pres[e.id][0].statut;
      if (st === "Présent") { c.pres += h; out.total.pres += h; }
      if (st === "Excusé") { c.exc += h; out.total.exc += h; }
    });
    return out;
  }
  const checkinUrl = (emId) => `${D.cfg.checkin_url}?e=${encodeURIComponent(emId)}`;
  /* Journées (cohorte + jour) : unité de la checklist intervenant */
  const monCours = (interv) => !isAdmin() && S.me && S.me.intervenant && norm(interv).includes(norm(S.me.intervenant));
  function journees() {
    const map = {};
    D.seances.filter(inScope).forEach((s) => {
      const k = `${s.cohorte}|${s.jour}`;
      const j = (map[k] ||= { key: k, cohorte: s.cohorte, jour: s.jour, date: s.date, certificat: s.certificat, seances: [], intervenants: new Set() });
      j.seances.push(s); if (s.intervenant) j.intervenants.add(s.intervenant);
    });
    return Object.values(map).map((j) => ({ ...j, intervenants: [...j.intervenants], ems: D.emargements.filter((e) => e.cohorte === j.cohorte && e.jour === j.jour), ticks: Object.fromEntries(D.checklist.filter((c) => c.cohorte === j.cohorte && c.jour === j.jour).map((c) => [c.item, c])) }))
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.jour - b.jour);
  }
  const progress = (j, phase) => { const items = D.cfg.checklist.filter((i) => !phase || i.phase === phase); return { done: items.filter((i) => j.ticks[i.id]?.fait).length, total: items.length }; };

  /* ---------- UI génériques ---------- */
  let toastT;
  function toast(msg, err = false) {
    const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 6000 : 2500);
  }
  /* openForm({title, fields:[{k,label,type,options,value,required,full,step}], submit, danger}) → Promise<values|null> */
  function openForm(cfg) {
    return new Promise((resolve) => {
      const dlg = $("#modal");
      const opt = (o, v) => { const [val, lbl] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v ?? "") ? "selected" : ""}>${esc(lbl)}</option>`; };
      dlg.innerHTML = `<form method="dialog"><h2>${esc(cfg.title)}</h2>${cfg.intro ? `<p class="muted small">${cfg.intro}</p>` : ""}<div class="fields">` +
        cfg.fields.map((f) => {
          let ctl;
          if (f.type === "select") ctl = `<select name="${f.k}" id="f_${f.k}" ${f.required ? "required" : ""}>${(f.options || []).map((o) => opt(o, f.value)).join("")}</select>`;
          else if (f.type === "textarea") ctl = `<textarea name="${f.k}" id="f_${f.k}">${esc(f.value)}</textarea>`;
          else if (f.type === "checkbox") ctl = `<input type="checkbox" name="${f.k}" id="f_${f.k}" ${f.value ? "checked" : ""}>`;
          else ctl = `<input type="${f.type || "text"}" name="${f.k}" id="f_${f.k}" value="${esc(f.value ?? "")}" ${f.required ? "required" : ""} ${f.step ? `step="${f.step}"` : ""} ${f.attrs || ""}>`;
          return `<div class="field ${f.full ? "full" : ""}"><label for="f_${f.k}">${esc(f.label)}</label>${ctl}${f.help ? `<span class="small muted">${f.help}</span>` : ""}</div>`;
        }).join("") +
        `</div><div class="form-actions">${cfg.danger ? `<button type="button" class="btn danger" value="danger" style="margin-right:auto">${esc(cfg.danger)}</button>` : ""}<button type="button" class="btn" value="cancel">Annuler</button><button type="submit" class="btn primary">${esc(cfg.submit || "Enregistrer")}</button></div></form>`;
      const form = $("form", dlg);
      const close = (v) => { dlg.close(); resolve(v); };
      $('[value="cancel"]', dlg).onclick = () => close(null);
      if (cfg.danger) $('[value="danger"]', dlg).onclick = () => close("__danger__");
      form.onsubmit = (e) => {
        e.preventDefault();
        const v = {};
        cfg.fields.forEach((f) => {
          const el = form.elements[f.k];
          if (f.type === "checkbox") v[f.k] = el.checked;
          else if (f.type === "number") v[f.k] = el.value === "" ? null : Number(el.value);
          else v[f.k] = el.value === "" && (f.type === "date") ? null : el.value;
        });
        close(v);
      };
      if (cfg.onOpen) cfg.onOpen(form);
      dlg.showModal();
    });
  }
  async function confirmDlg(msg, btn = "Supprimer") {
    const r = await openForm({ title: "Confirmation", intro: esc(msg), fields: [], submit: btn });
    return r !== null;
  }
  function table(cols, rows, foot) {
    return `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? "num" : ""}">${c.h}</th>`).join("")}</tr></thead><tbody>` +
      (rows.length ? rows.map((r) => `<tr ${r.__cls ? `class="${r.__cls}"` : ""}>${cols.map((c) => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${c.f(r)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}" class="muted" style="text-align:center;padding:20px">Aucune ligne</td></tr>`) +
      `</tbody>${foot ? `<tfoot><tr>${foot.map((x, i) => `<td class="${cols[i] && cols[i].num ? "num" : ""}">${x}</td>`).join("")}</tr></tfoot>` : ""}</table></div>`;
  }
  const copy = async (txt, ok = "Copié") => { try { await navigator.clipboard.writeText(txt); toast(ok); } catch (_) { toast("Copie impossible : sélectionnez le texte manuellement", true); } };
  const download = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };

  /* ---------- Vue : tableau de bord ---------- */
  views.dash = () => {
    const parts = D.participants.filter(inScope), actifs = parts.filter((p) => p.statut === "Actif");
    const seances = D.seances.filter(inScope), tenues = seances.filter(tenue);
    const rec = D.recettes.filter(inScope), dep = D.depenses.filter(inScope);
    const fact = sum(rec, (r) => r.montant_facture), enc = sum(rec, (r) => r.montant_encaisse), dp = sum(dep, (d) => d.montant);
    const taux = actifs.map((p) => tauxParticipant(p).total).filter((t) => t.tenues > 0);
    const tauxMoy = taux.length ? sum(taux, (t) => t.pres) / sum(taux, (t) => t.tenues) : null;
    const seuil = Number(D.cfg.seuil_presence) / 100;
    const sousSeuil = actifs.filter((p) => { const t = tauxParticipant(p).total; return t.tenues >= 6 && t.pres / t.tenues < seuil; });
    const retards = rec.filter((r) => recStatut(r)[0] === "En retard");
    const prochains = D.emargements.filter(inScope).filter((e) => e.date && e.date >= today() && e.date <= new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
    const sansInterv = prochains.filter((e) => !e.intervenant);
    const tile = (l, v, s, neg) => `<div class="tile ${neg ? "neg" : ""}"><div class="lbl">${l}</div><div class="val">${v}</div>${s ? `<div class="sub">${s}</div>` : ""}</div>`;
    let html = `<h1>Tableau de bord <span class="muted" style="font-weight:400;font-size:1rem">· ${esc(scopeLbl())}</span></h1><div class="tiles">` +
      tile("Participants actifs", actifs.length, `${parts.length} inscrits au total`) +
      tile("Séances tenues", `${tenues.length} <span class="muted" style="font-size:1rem">/ ${seances.length}</span>`, `${sum(tenues, (s) => s.duree)} h sur ${sum(seances, (s) => s.duree)} h`) +
      tile("Taux de présence moyen", pct(tauxMoy), sousSeuil.length ? `${sousSeuil.length} participant(s) sous ${D.cfg.seuil_presence} %` : "aucun participant sous le seuil") +
      tile("Recettes facturées", mad(fact), `${mad(enc)} encaissés (${pct(fact ? enc / fact : null)})`) +
      tile("Dépenses", mad(dp), `${dep.length} lignes`) +
      tile("Résultat engagé", mad(fact - dp), `trésorerie : ${mad(enc - dp)}`, fact - dp < 0) + `</div>`;
    /* Barres par cohorte */
    const cohs = S.cohorte === "all" ? D.cohortes : D.cohortes.filter((c) => c.id === S.cohorte);
    const max = Math.max(1, ...cohs.map((c) => Math.max(sum(D.recettes.filter((r) => r.cohorte === c.id), (r) => r.montant_facture), sum(D.depenses.filter((d) => d.cohorte === c.id), (d) => d.montant))));
    html += `<div class="card"><h2>Recettes facturées et dépenses par cohorte</h2><div class="bars">` + cohs.map((c) => {
      const f = sum(D.recettes.filter((r) => r.cohorte === c.id), (r) => r.montant_facture), d = sum(D.depenses.filter((x) => x.cohorte === c.id), (x) => x.montant);
      return `<div class="bar"><div>${esc(c.id)}</div><div class="track" title="Recettes ${mad(f)}"><span class="rec" style="width:${(f / max) * 100}%"></span></div><div class="num">${mad(f)}</div></div>` +
        `<div class="bar"><div class="muted small">dépenses</div><div class="track" title="Dépenses ${mad(d)}"><span class="dep" style="width:${(d / max) * 100}%"></span></div><div class="num">${mad(d)}</div></div>`;
    }).join("") + `</div><div class="legend"><span><i style="background:var(--bleu)"></i>Recettes facturées</span><span><i style="background:var(--rouge)"></i>Dépenses</span></div></div>`;
    /* Alertes */
    html += `<div class="card"><h2>À traiter</h2><ul style="margin:0;padding-left:18px">` +
      (retards.length ? `<li><strong>${retards.length} recette(s) en retard</strong> d'encaissement, ${mad(sum(retards, (r) => r.montant_facture - r.montant_encaisse))} à relancer. <a href="#" data-act="go" data-view="recettes">Voir</a></li>` : "") +
      (sousSeuil.length ? `<li><strong>${sousSeuil.length} participant(s) sous le seuil de présence</strong> : ${sousSeuil.slice(0, 5).map(pName).map(esc).join(", ")}${sousSeuil.length > 5 ? "…" : ""}. <a href="#" data-act="go" data-view="taux">Voir</a></li>` : "") +
      (sansInterv.length ? `<li><strong>${sansInterv.length} demi-journée(s) dans les 14 jours sans intervenant</strong> : ${sansInterv.map((e) => e.id).join(", ")}. <a href="#" data-act="go" data-view="seances">Voir</a></li>` : "") +
      (prochains.length ? `<li>${prochains.length} demi-journée(s) à venir dans les 14 jours. <a href="#" data-act="go" data-view="kit">Préparer le kit QR</a></li>` : "") +
      (!retards.length && !sousSeuil.length && !sansInterv.length && !prochains.length ? `<li class="muted">Rien à signaler.</li>` : "") + `</ul></div>`;
    return html;
  };

  /* ---------- Vue : participants ---------- */
  const participantFields = (p = {}) => [
    { k: "nom", label: "Nom", value: p.nom, required: true }, { k: "prenom", label: "Prénom", value: p.prenom },
    { k: "cohorte", label: "Cohorte", type: "select", options: D.cohortes.map((c) => [c.id, c.libelle]), value: p.cohorte || (S.cohorte !== "all" ? S.cohorte : D.cohortes.at(-1)?.id) },
    { k: "statut", label: "Statut", type: "select", options: STATUTS_P, value: p.statut || "Actif" },
    { k: "email", label: "E-mail", type: "email", value: p.email }, { k: "organisation", label: "Organisation", value: p.organisation },
    { k: "fonction", label: "Fonction", value: p.fonction },
    { k: "financement", label: "Financement", type: "select", options: FINANCEMENTS, value: p.financement || "Individuel" },
    { k: "frais", label: "Frais d'inscription (MAD)", type: "number", value: p.frais ?? 0, step: "1" }, { k: "remise", label: "Remise (MAD)", type: "number", value: p.remise ?? 0, step: "1" },
    { k: "financeur", label: "Organisme financeur", value: p.financeur }, { k: "financeur_contact", label: "Contact financeur", value: p.financeur_contact },
    { k: "prise_en_charge", label: "Montant pris en charge (MAD)", type: "number", value: p.prise_en_charge ?? 0, step: "1" }, { k: "convention", label: "Convention / bon de commande signé", type: "checkbox", value: p.convention },
    { k: "telephone", label: "Téléphone", value: p.telephone }, { k: "cin", label: "CIN / passeport", value: p.cin },
    { k: "date_naissance", label: "Date de naissance", type: "date", value: p.date_naissance || "" }, { k: "diplome", label: "Dernier diplôme", value: p.diplome },
    { k: "adresse", label: "Adresse", value: p.adresse, full: true },
    { k: "statut_dossier", label: "Statut du dossier", type: "select", options: ["Incomplet", "Complet"], value: p.statut_dossier || "Incomplet" },
    { k: "notes", label: "Notes", type: "textarea", value: p.notes, full: true },
  ];
  views.participants = () => {
    const q = norm(S.ui.pq || ""), st = S.ui.pst || "";
    const rows = D.participants.filter(inScope).filter((p) => (!st || p.statut === st) && (!q || norm(pName(p) + " " + p.organisation + " " + p.email).includes(q)));
    const facture = (p) => sum(D.recettes.filter((r) => r.participant === p.id), (r) => r.montant_facture);
    const encaisse = (p) => sum(D.recettes.filter((r) => r.participant === p.id), (r) => r.montant_encaisse);
    return `<h1>Participants <span class="muted" style="font-weight:400;font-size:1rem">· ${esc(scopeLbl())}</span></h1>
      <div class="toolbar"><input type="search" id="pq" placeholder="Rechercher un nom, une organisation…" value="${esc(S.ui.pq || "")}" data-ui="pq">
      <select data-ui="pst"><option value="">Tous statuts</option>${STATUTS_P.map((s) => `<option ${st === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <span class="grow"></span><button class="btn" data-act="copyNames">Copier la liste des noms</button><button class="btn" data-act="exportDossiers">Exporter les dossiers (xlsx)</button><button class="btn primary" data-act="addP">+ Participant</button></div>` +
      table([
        { h: "Nom", f: (p) => `<strong>${esc(pName(p))}</strong><br><span class="small muted">${esc(p.email || "")}</span>` },
        { h: "Cohorte", f: (p) => esc(p.cohorte) },
        { h: "Organisation / fonction", f: (p) => `${esc(p.organisation || "—")}<br><span class="small muted">${esc(p.fonction || "")}</span>` },
        { h: "Statut", f: (p) => `<span class="pill ${p.statut === "Actif" ? "ok" : p.statut === "Abandon" ? "bad" : "info"}">${esc(p.statut)}</span>` },
        { h: "Financement", f: (p) => esc(p.financement) },
        { h: "Frais nets", num: true, f: (p) => mad((p.frais || 0) - (p.remise || 0)) },
        { h: "Facturé / encaissé", num: true, f: (p) => `${mad(facture(p))}<br><span class="small muted">${mad(encaisse(p))}</span>` },
        { h: "Présence", num: true, f: (p) => { const t = tauxParticipant(p).total; return t.tenues ? `<span class="pill ${t.pres / t.tenues >= D.cfg.seuil_presence / 100 ? "ok" : "bad"}">${pct(t.pres / t.tenues)}</span>` : '<span class="muted">—</span>'; } },
        { h: "Dossier", f: (p) => { const n = D.documents.filter((d) => d.participant === p.id).length; return `<span class="pill ${p.statut_dossier === "Complet" ? "ok" : "warn"}">${esc(p.statut_dossier || "Incomplet")}</span> <span class="small muted">${n} doc.</span>`; } },
        { h: "", cls: "actions", f: (p) => `<button class="btn sm primary" data-act="dossier" data-id="${p.id}">Dossier</button>` },
      ], rows, ["Total", rows.length + " participant(s)", "", "", "", mad(sum(rows, (p) => (p.frais || 0) - (p.remise || 0))), mad(sum(rows, facture)), "", `${rows.filter((p) => p.statut_dossier === "Complet").length} complet(s)`, ""]);
  };

  /* ---------- Vue : dossier administratif d'un participant ---------- */
  const TYPES_DOC = ["CIN / Passeport", "Diplôme", "CV", "Photo", "Contrat de formation", "Convention de financement", "Bon de commande", "Attestation employeur", "Justificatif de paiement", "Autre"];
  const fmtOctets = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko";
  const lbl = (k, v) => `<tr><td style="width:38%;background:var(--peche);font-weight:600">${k}</td><td>${v || '<span class="muted">—</span>'}</td></tr>`;
  function dossierHtml(p, admin) {
    const docs = D.documents.filter((d) => d.participant === p.id).sort((a, b) => b.ajoute_le.localeCompare(a.ajoute_le));
    const rec = D.recettes.filter((r) => r.participant === p.id);
    const t = tauxParticipant(p); const coh = D.cohortes.find((c) => c.id === p.cohorte);
    const net = (p.frais || 0) - (p.remise || 0), part = Math.max(0, net - (p.prise_en_charge || 0));
    let html = `<div class="toolbar">${admin ? `<button class="btn" data-act="go" data-view="participants">← Participants</button>` : ""}<h1 style="margin:0">${esc(pName(p))}</h1><span class="pill ${p.statut === "Actif" ? "ok" : "info"}">${esc(p.statut)}</span><span class="pill ${p.statut_dossier === "Complet" ? "ok" : "warn"}">Dossier ${esc((p.statut_dossier || "Incomplet").toLowerCase())}</span><span class="grow"></span>
      ${admin ? `<button class="btn" data-act="editP" data-id="${p.id}">Modifier la fiche</button><button class="btn" data-act="exportDossier" data-id="${p.id}">Exporter (xlsx)</button>` : ""}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
      <div class="card"><h2>Identité</h2><table class="plain"><tbody>${lbl("Cohorte", esc(coh ? coh.libelle : p.cohorte))}${lbl("E-mail", esc(p.email))}${lbl("Téléphone", esc(p.telephone))}${lbl("CIN / passeport", esc(p.cin))}${lbl("Date de naissance", p.date_naissance ? fmtDate(p.date_naissance) : "")}${lbl("Adresse", esc(p.adresse))}${lbl("Organisation", esc(p.organisation))}${lbl("Fonction", esc(p.fonction))}${lbl("Dernier diplôme", esc(p.diplome))}</tbody></table></div>
      <div class="card"><h2>Financement</h2><table class="plain"><tbody>${lbl("Mode", esc(p.financement))}${lbl("Frais d'inscription", mad(p.frais))}${lbl("Remise", mad(p.remise))}${lbl("Net à facturer", `<strong>${mad(net)}</strong>`)}${lbl("Pris en charge par l'organisme", mad(p.prise_en_charge))}${lbl("Reste à charge du participant", mad(part))}${lbl("Organisme financeur", esc(p.financeur))}${lbl("Contact financeur", esc(p.financeur_contact))}${lbl("Convention / bon de commande", p.convention ? '<span class="pill ok">signé</span>' : '<span class="pill warn">en attente</span>')}</tbody></table>
        ${admin ? `<h3 style="margin-top:14px">Recettes liées</h3>` + (rec.length ? table([{ h: "Date", f: (r) => fmtDate(r.date) }, { h: "Payeur", f: (r) => `${esc(r.payeur)} <span class="pill">${esc(r.type)}</span>` }, { h: "Facturé", num: true, f: (r) => mad(r.montant_facture) }, { h: "Encaissé", num: true, f: (r) => mad(r.montant_encaisse) }, { h: "Statut", f: (r) => { const [l, c] = recStatut(r); return `<span class="pill ${c}">${l}</span>`; } }, { h: "", cls: "actions", f: (r) => `<button class="btn sm" data-act="editR" data-id="${r.id}">Modifier</button>` }], rec, ["Total", "", mad(sum(rec, (r) => r.montant_facture)), mad(sum(rec, (r) => r.montant_encaisse)), "", ""]) : '<p class="muted small">Aucune recette enregistrée pour ce participant.</p>') + `<div class="toolbar" style="margin:8px 0 0"><button class="btn sm" data-act="addRFor" data-id="${p.id}">+ Recette pour ce participant</button></div>` : ""}</div>
      <div class="card"><h2>Présence</h2><div class="tiles" style="margin-bottom:8px"><div class="tile"><div class="lbl">Global</div><div class="val">${pct(t.total.tenues ? t.total.pres / t.total.tenues : null)}</div><div class="sub">${t.total.pres} h / ${t.total.tenues} h tenues</div></div>${Object.entries(t.parCert).filter(([, x]) => x.tenues).map(([c, x]) => `<div class="tile"><div class="lbl">${c}</div><div class="val" style="font-size:1.2rem">${pct(x.pres / x.tenues)}</div><div class="sub">${x.pres} h / ${x.tenues} h</div></div>`).join("")}</div></div>
      <div class="card"><h2>Documents</h2>${admin ? `<form id="docForm" class="toolbar" data-doc-for="${p.id}" style="margin:0 0 10px"><select name="type">${TYPES_DOC.map((x) => `<option>${x}</option>`).join("")}</select><input type="file" name="fichier" required style="flex:1;min-width:160px"><button class="btn primary sm" type="submit">Ajouter</button></form><p class="small muted">PDF, images ou documents Office, 20 Mo maximum par fichier. Stockage privé : seuls l'équipe et le participant concerné y accèdent.</p>` : ""}
        ${docs.length ? `<div class="tablewrap"><table><thead><tr><th>Type</th><th>Fichier</th><th>Ajouté</th><th></th></tr></thead><tbody>` + docs.map((d) => `<tr><td>${esc(d.type)}</td><td>${esc(d.nom)}<br><span class="small muted">${fmtOctets(d.taille)}</span></td><td class="small muted">${fmtDate(d.ajoute_le.slice(0, 10))}${d.ajoute_par ? "<br>" + esc(d.ajoute_par) : ""}</td><td class="actions"><button class="btn sm" data-act="openDoc" data-id="${d.id}">Ouvrir</button>${admin ? `<button class="btn sm danger" data-act="delDoc" data-id="${d.id}">Supprimer</button>` : ""}</td></tr>`).join("") + `</tbody></table></div>` : '<p class="muted small">Aucun document.</p>'}</div>
      ${p.notes ? `<div class="card"><h2>Notes</h2><p style="white-space:pre-wrap">${esc(p.notes)}</p></div>` : ""}</div>`;
    return html;
  }
  views.dossier = () => { const p = pById(S.ui.part); return p ? dossierHtml(p, true) : `<div class="empty">Participant introuvable.</div>`; };
  views.etu_dossier = () => { const p = moi(); return p ? `<h1>Mon dossier</h1><p class="small muted">Pour toute correction de vos informations ou ajout de document, contactez l'équipe du programme.</p>` + dossierHtml(p, false) : views.etu_accueil(); };
  document.addEventListener("submit", async (e) => {
    const f = e.target.closest("form[data-doc-for]"); if (!f) return;
    e.preventDefault(); const file = f.elements.fichier.files[0]; if (!file) return;
    const btn = f.querySelector("button"); btn.disabled = true;
    const safe = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");
    const chemin = `${f.dataset.docFor}/${Date.now()}_${safe}`;
    const { error } = await sb.storage.from("dossiers").upload(chemin, file, { upsert: false });
    if (error) { btn.disabled = false; return toast("Envoi impossible : " + error.message, true); }
    const { error: e2 } = await sb.from("documents").insert({ participant: f.dataset.docFor, type: f.elements.type.value, nom: file.name, chemin, taille: file.size, ajoute_par: S.me?.nom || S.me?.email || "" });
    btn.disabled = false; if (e2) return toast(e2.message, true);
    await reload("documents"); toast("Document ajouté");
  });

  /* ---------- Vue : séances ---------- */
  views.seances = () => {
    if (S.cohorte === "all") return `<h1>Séances</h1><div class="empty">Choisissez une cohorte dans le sélecteur en haut pour afficher et modifier son planning.</div>`;
    const seances = D.seances.filter(inScope), ems = D.emargements.filter(inScope);
    const jours = by(seances, (s) => s.jour);
    let html = `<h1>Séances · ${esc(scopeLbl())}</h1><div class="toolbar"><span class="muted small">${seances.length} séances · ${sum(seances, (s) => s.duree)} h planifiées · ${seances.filter(tenue).length} tenues</span><span class="grow"></span>
      <a class="btn" href="planning.html?cohorte=${esc(S.cohorte)}" target="_blank" rel="noopener">Planning public ↗</a><button class="btn" data-act="exportCsv" data-table="seances">CSV</button><button class="btn primary" data-act="addDay">+ Journée</button></div>`;
    let lastCert = null;
    Object.keys(jours).map(Number).sort((a, b) => a - b).forEach((j) => {
      const rows = jours[j], s0 = rows[0];
      if (s0.certificat !== lastCert) { lastCert = s0.certificat; html += `<h2 style="margin-top:18px">${esc(certLbl(lastCert))}</h2>`; }
      html += `<div class="jour"><header><strong>Jour ${j}</strong><span>${esc(fmtDate(s0.date, true))}</span><span class="muted small">${esc(uniq(rows.map((r) => r.intervenant).filter(Boolean)).join(", "))}</span><span class="grow" style="flex:1"></span><button class="btn sm" data-act="editDay" data-coh="${esc(s0.cohorte)}" data-jour="${j}">Modifier la journée</button></header>`;
      ["AM", "PM"].forEach((demi) => {
        const em = ems.find((e) => e.jour === j && e.demi === demi), rs = rows.filter((r) => r.emargement === (em && em.id));
        if (!em && !rs.length) return;
        rs.forEach((s) => {
          html += `<div class="creneau"><span class="mono muted">${esc(s.creneau)}</span><span>${esc(s.cours || "—")}<span class="small muted"> · ${esc(HORAIRES[s.creneau] || "")}${s.intervenant && s.intervenant !== (em && em.intervenant) ? " · " + esc(s.intervenant) : ""}</span></span>
            <span class="pill ${s.statut === "Réalisé" ? "ok" : s.statut === "Annulé" ? "bad" : s.statut === "Reporté" ? "warn" : tenue(s) ? "ok" : ""}">${esc(tenue(s) && s.statut === "Planifié" ? "Tenue" : s.statut)}</span><button class="btn sm" data-act="editS" data-id="${esc(s.id)}">Modifier</button></div>`;
        });
        if (em) {
          const n = D.presences.filter((p) => p.emargement === em.id && p.statut === "Présent").length;
          html += `<div class="demi"><span class="mono">${esc(em.id)}</span><span>${demi === "AM" ? "Matin" : "Après-midi"} · code <span class="code">${esc(em.code)}</span></span><span>${esc(em.intervenant || '<span class="muted">intervenant à préciser</span>')}</span><span class="pill ${n ? "ok" : ""}">${n} présent(s)</span>
            ${em.ouvert ? '<span class="pill warn">pointage forcé ouvert</span>' : ""}<span style="flex:1"></span><button class="btn sm" data-act="go" data-view="pointage" data-em="${esc(em.id)}">Pointer</button><button class="btn sm" data-act="editEm" data-id="${esc(em.id)}">Code / intervenant</button></div>`;
        }
      });
      html += `</div>`;
    });
    if (!seances.length) html += `<div class="empty">Aucune séance. Ajoutez une journée ou exécutez supabase/seed.sql.</div>`;
    return html;
  };

  /* ---------- Vue : pointage ---------- */
  views.pointage = () => {
    const ems = D.emargements.filter(inScope);
    if (!S.ui.em || !ems.some((e) => e.id === S.ui.em)) {
      const t = today(); const prox = ems.filter((e) => e.date).sort((a, b) => Math.abs(new Date(a.date) - new Date(t)) - Math.abs(new Date(b.date) - new Date(t)))[0];
      S.ui.em = prox ? prox.id : ems[0]?.id;
    }
    const em = ems.find((e) => e.id === S.ui.em);
    let html = `<h1>Pointage</h1><div class="toolbar"><select data-ui="em" style="max-width:100%">${ems.map((e) => `<option value="${esc(e.id)}" ${e.id === S.ui.em ? "selected" : ""}>${esc(e.id)} · ${esc(fmtDate(e.date))} · ${e.demi === "AM" ? "matin" : "après-midi"} · ${esc(e.intervenant || "")}</option>`).join("")}</select>
      <span class="grow"></span><button class="btn" data-act="importCsv">Importer un export (Canvas / formulaire)</button></div>`;
    if (!em) return html + `<div class="empty">Aucune demi-journée pour cette sélection.</div>`;
    const parts = D.participants.filter((p) => p.cohorte === em.cohorte && p.statut === "Actif");
    const pres = Object.fromEntries(D.presences.filter((p) => p.emargement === em.id).map((p) => [p.participant, p]));
    const nP = parts.filter((p) => pres[p.id]?.statut === "Présent").length, nE = parts.filter((p) => pres[p.id]?.statut === "Excusé").length;
    const cours = seancesOf(em.id).map((s) => s.cours).filter(Boolean);
    html += `<div class="card"><div class="toolbar" style="margin:0 0 10px"><div><strong style="color:var(--rouge)">${esc(em.id)}</strong> · ${esc(fmtDate(em.date, true))} · ${esc(certLbl(em.certificat))}<br><span class="small muted">${esc(cours.join(" / ") || "")} · ${esc(em.intervenant || "")} · ${heuresEm(em.id, false)} h</span></div><span class="grow"></span>
      <span class="pill ok">${nP} présents</span><span class="pill warn">${nE} excusés</span><span class="pill bad">${parts.length - nP - nE} absents / non pointés</span></div>
      <div class="toolbar"><span class="small">Code séance <span class="code">${esc(em.code)}</span></span><button class="btn sm" data-act="copyLink" data-em="${esc(em.id)}">Copier le lien de pointage</button><button class="btn sm" data-act="toggleOpen" data-id="${esc(em.id)}">${em.ouvert ? "Fermer le pointage forcé" : "Ouvrir le pointage hors date"}</button><span class="grow"></span>
      <button class="btn sm" data-act="markAll" data-st="Présent">Tous présents</button><button class="btn sm" data-act="markAll" data-st="Absent">Non pointés → absents</button></div>
      <div class="att-grid">` + parts.map((p) => {
        const st = pres[p.id]?.statut, src = pres[p.id]?.source;
        return `<div class="att"><div><strong>${esc(pName(p))}</strong><br><span class="small muted">${st ? esc(st) + (src === "qr" ? " · QR " + new Date(pres[p.id].horodatage).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : src ? " · " + esc(src) : "") : "non pointé"}</span></div>
          <div class="seg">${[["P", "Présent"], ["A", "Absent"], ["E", "Excusé"]].map(([k, v]) => `<button data-act="mark" data-p="${p.id}" data-st="${v}" class="${k} ${st === v ? "on" : ""}" title="${v}">${k}</button>`).join("")}</div></div>`;
      }).join("") + `</div>${!parts.length ? '<div class="empty">Aucun participant actif dans cette cohorte.</div>' : ""}</div>`;
    return html;
  };

  /* ---------- Vue : taux de présence ---------- */
  views.taux = () => {
    const parts = D.participants.filter(inScope).filter((p) => p.statut === "Actif" || S.ui.tousStatuts);
    const certs = Object.keys(D.cfg.certificats);
    const seuil = D.cfg.seuil_presence / 100;
    const cell = (c) => !c || !c.tenues ? '<span class="muted">—</span>' : `<span class="pill ${c.pres / c.tenues >= seuil ? "ok" : c.pres / c.tenues >= seuil - 0.15 ? "warn" : "bad"}" title="${c.pres} h / ${c.tenues} h">${pct(c.pres / c.tenues)}</span>`;
    const rows = parts.map((p) => ({ p, t: tauxParticipant(p) }));
    return `<h1>Taux de présence <span class="muted" style="font-weight:400;font-size:1rem">· ${esc(scopeLbl())} · seuil ${D.cfg.seuil_presence} %</span></h1>
      <div class="toolbar"><label class="small"><input type="checkbox" data-ui="tousStatuts" ${S.ui.tousStatuts ? "checked" : ""}> inclure les participants non actifs</label><span class="grow"></span><button class="btn" data-act="exportTaux">Exporter (xlsx)</button></div>
      <p class="small muted">Heures de présence sur heures tenues (séances passées ou marquées « Réalisé »). Les absences excusées ne comptent pas comme présence mais sont indiquées au survol.</p>` +
      table([
        { h: "Participant", f: (r) => `<strong>${esc(pName(r.p))}</strong><br><span class="small muted">${esc(r.p.cohorte)} · ${esc(r.p.organisation || "")}</span>` },
        ...certs.map((c) => ({ h: c, num: true, f: (r) => cell(r.t.parCert[c]) })),
        { h: "Global", num: true, f: (r) => cell(r.t.total) },
        { h: "Heures", num: true, f: (r) => `${r.t.total.pres} / ${r.t.total.tenues}${r.t.total.exc ? ` <span class="small muted">(${r.t.total.exc} h exc.)</span>` : ""}` },
      ], rows);
  };

  /* ---------- Vue : kit QR ---------- */
  views.kit = () => {
    const ems = D.emargements.filter(inScope);
    const intervs = uniq(ems.map((e) => e.intervenant).filter(Boolean)).sort();
    const sel = S.ui.interv || "";
    const list = ems.filter((e) => (!sel || e.intervenant === sel) && (!S.ui.kitDay || `${e.cohorte}|${e.jour}` === S.ui.kitDay) && (S.ui.kitAll || S.ui.kitDay || !e.date || e.date >= today()));
    const html = `<h1>Kit QR intervenants <span class="muted" style="font-weight:400;font-size:1rem">· ${esc(scopeLbl())}</span></h1>
      <div class="toolbar no-print"><select data-ui="interv"><option value="">Tous les intervenants</option>${intervs.map((i) => `<option ${i === sel ? "selected" : ""}>${esc(i)}</option>`).join("")}</select>
      <label class="small"><input type="checkbox" data-ui="kitAll" ${S.ui.kitAll ? "checked" : ""}> inclure les séances passées</label>${S.ui.kitDay ? `<span class="pill info">journée ${esc(S.ui.kitDay.replace("|", " · J"))} <a href="#" data-act="kitClear" style="margin-left:6px">×</a></span>` : ""}<span class="grow"></span>
      ${isAdmin() ? `<button class="btn" data-act="mailText" ${sel ? "" : "disabled"}>Copier le texte du mail</button>` : ""}<button class="btn" data-act="dlAll" ${list.length ? "" : "disabled"}>Télécharger les PNG</button><button class="btn primary" data-act="print" ${list.length ? "" : "disabled"}>Imprimer / PDF</button></div>
      <p class="small muted no-print">Chaque slide (16:9) contient le QR code de la demi-journée et son code à 4 chiffres. L'intervenant l'affiche en début de séance ; le participant scanne, saisit le code et choisit son nom. Lien de pointage : <span class="mono">${esc(D.cfg.checkin_url)}?e=…</span></p>
      <div class="slides">${list.map((e) => `<div class="slide-card card"><canvas data-slide="${esc(e.id)}" width="1600" height="900"></canvas><div class="meta"><span><strong>${esc(e.id)}</strong> · ${esc(fmtDate(e.date))} · ${e.demi === "AM" ? "matin" : "après-midi"}<br><span class="small muted">${esc(e.intervenant || "intervenant à préciser")}</span></span><span><button class="btn sm" data-act="copyLink" data-em="${esc(e.id)}">Lien</button><button class="btn sm" data-act="dlOne" data-em="${esc(e.id)}">PNG</button></span></div></div>`).join("")}</div>
      ${!list.length ? '<div class="empty">Aucune demi-journée à venir pour cette sélection.</div>' : ""}`;
    setTimeout(() => $$("canvas[data-slide]").forEach((c) => drawSlide(c, D.emargements.find((e) => e.id === c.dataset.slide))), 0);
    return html;
  };
  const logo = new Image(); logo.src = "assets/logo.png";
  function drawSlide(cv, em) {
    const draw = () => {
      const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 70, 50, 760, 760 * logo.naturalHeight / logo.naturalWidth);
      ctx.fillStyle = "#1B75BC"; ctx.fillRect(70, 160, W - 140, 3);
      const cours = seancesOf(em.id).map((s) => s.cours).filter(Boolean);
      const coh = D.cohortes.find((c) => c.id === em.cohorte);
      ctx.fillStyle = "#1B75BC"; ctx.font = "700 60px 'Source Sans 3', Arial"; ctx.fillText("Émargement", 70, 260);
      ctx.fillStyle = "#1E2A38"; ctx.font = "600 36px 'Source Sans 3', Arial";
      ctx.fillText(`${coh ? coh.libelle : em.cohorte} · ${certLbl(em.certificat)}`, 70, 320);
      ctx.fillStyle = "#E2492F"; ctx.font = "700 40px 'Source Sans 3', Arial";
      ctx.fillText(`${fmtDate(em.date, true)} · ${em.demi === "AM" ? "Matin" : "Après-midi"}`, 70, 385);
      ctx.fillStyle = "#1E2A38"; ctx.font = "400 30px 'Source Sans 3', Arial";
      let y = 450; uniq(cours).slice(0, 4).forEach((c) => { ctx.fillText("• " + (c.length > 55 ? c.slice(0, 54) + "…" : c), 70, y); y += 42; });
      if (em.intervenant) { ctx.fillStyle = "#5B6B7E"; ctx.fillText("Intervenant : " + em.intervenant, 70, y + 10); }
      ctx.fillStyle = "#1E2A38"; ctx.font = "600 34px 'Source Sans 3', Arial"; ctx.fillText("1. Scannez le QR code", 70, 700);
      ctx.fillText("2. Saisissez le code de séance", 70, 750); ctx.fillText("3. Sélectionnez votre nom", 70, 800);
      /* QR */
      const url = checkinUrl(em.id); const qr = qrcode(0, "M"); qr.addData(url); qr.make();
      const n = qr.getModuleCount(), size = 440, x0 = W - 70 - size, y0 = 215, cell = size / n;
      ctx.fillStyle = "#fff"; ctx.fillRect(x0 - 16, y0 - 16, size + 32, size + 32);
      ctx.strokeStyle = "#D7DEE8"; ctx.lineWidth = 2; ctx.strokeRect(x0 - 16, y0 - 16, size + 32, size + 32);
      ctx.fillStyle = "#000";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(x0 + c * cell, y0 + r * cell, Math.ceil(cell), Math.ceil(cell));
      ctx.textAlign = "center";
      ctx.fillStyle = "#5B6B7E"; ctx.font = "400 26px 'Source Sans 3', Arial"; ctx.fillText("Code de séance", x0 + size / 2, y0 + size + 70);
      ctx.fillStyle = "#1B75BC"; ctx.font = "700 110px 'JetBrains Mono', monospace"; ctx.fillText(em.code.split("").join(" "), x0 + size / 2, y0 + size + 175);
      ctx.fillStyle = "#5B6B7E"; ctx.font = "400 22px 'Source Sans 3', Arial"; ctx.fillText(url.replace(/^https?:\/\//, ""), x0 + size / 2, H - 40);
      ctx.textAlign = "left";
    };
    if (logo.complete) draw(); else logo.onload = draw;
  }
  const slideBlob = (em) => new Promise((res) => { const cv = document.createElement("canvas"); cv.width = 1600; cv.height = 900; drawSlide(cv, em); setTimeout(() => cv.toBlob(res, "image/png"), 50); });
  function mailText(interv, ems) {
    const site = CFG.SITE_URL || "";
    const lignes = ems.map((e) => `  • ${e.id} — ${fmtDate(e.date, true)}, ${e.demi === "AM" ? "matin" : "après-midi"} — code ${e.code} — ${checkinUrl(e.id)}`).join("\n");
    return `Objet : Émargement par QR code — vos séances du Master Exécutif AIGP

Bonjour ${interv},

Pour vos prochaines séances du Master Exécutif en gouvernance et pratique de l'IA, l'émargement des participants se fait par QR code. Vous trouverez en pièce jointe une slide par demi-journée, à insérer dans votre présentation et à afficher environ 3 minutes en début de séance (ou à la reprise de l'après-midi).

Mode opératoire côté participants : scanner le QR code, saisir le code de séance à 4 chiffres affiché sur la slide, sélectionner son nom. Merci d'annoncer le code à l'oral pour les personnes qui ne peuvent pas scanner.

Vos demi-journées :
${lignes}

En cas de problème technique en séance, le lien de secours est ${site}/planning.html et l'équipe du programme peut enregistrer les présences manuellement.

Merci et bonne séance,
L'équipe du Master Exécutif AIGP — UM6P | AIM | UNESCO`;
  }

  /* ---------- Vue : mes journées (intervenant) / journées (admin) ---------- */
  views.prof = () => {
    let js = journees();
    if (!isAdmin()) js = js.filter((j) => j.intervenants.some(monCours));
    if (S.ui.profInterv) js = js.filter((j) => j.intervenants.some((i) => i === S.ui.profInterv));
    if (!S.ui.profAll) js = js.filter((j) => !j.date || j.date >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
    const intervs = uniq(journees().flatMap((j) => j.intervenants)).sort();
    const bar = (j) => { const p = progress(j); return `<span class="pill ${p.done === p.total && p.total ? "ok" : p.done ? "warn" : ""}">${p.done}/${p.total}</span>`; };
    let html = `<h1>${isAdmin() ? "Journées de cours" : "Mes journées"} <span class="muted" style="font-weight:400;font-size:1rem">· ${esc(scopeLbl())}</span></h1>
      <div class="toolbar">${isAdmin() ? `<select data-ui="profInterv"><option value="">Tous les intervenants</option>${intervs.map((i) => `<option ${i === S.ui.profInterv ? "selected" : ""}>${esc(i)}</option>`).join("")}</select>` : ""}
      <label class="small"><input type="checkbox" data-ui="profAll" ${S.ui.profAll ? "checked" : ""}> inclure les journées passées</label><span class="grow"></span>
      ${!isAdmin() ? `<span class="small muted">Connecté comme ${esc(S.me.nom || S.me.email)} · filtre « ${esc(S.me.intervenant)} »</span>` : ""}</div>`;
    if (!js.length) return html + `<div class="empty">${isAdmin() ? "Aucune journée pour cette sélection." : "Aucune journée ne vous est attribuée. Si vous intervenez prochainement, demandez à l'équipe de vérifier votre nom dans le planning."}</div>`;
    js.forEach((j) => {
      const open = S.ui.openDay === j.key || (!S.ui.openDay && js[0] === j);
      html += `<div class="jour"><header style="cursor:pointer" data-act="openDay" data-key="${esc(j.key)}"><strong>${esc(j.cohorte)} · Jour ${j.jour}</strong><span>${esc(fmtDate(j.date, true))}</span><span class="muted small">${esc(certLbl(j.certificat))}</span><span class="muted small">${esc(j.intervenants.join(", "))}</span><span style="flex:1"></span>${bar(j)}<span class="muted">${open ? "▾" : "▸"}</span></header>`;
      if (open) {
        html += `<div style="padding:12px"><div class="grid2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">`;
        PHASES.forEach(([ph, lbl]) => {
          const items = D.cfg.checklist.filter((i) => i.phase === ph); const p = progress(j, ph);
          html += `<div><h3 style="display:flex;justify-content:space-between">${lbl} <span class="pill ${p.done === p.total && p.total ? "ok" : ""}">${p.done}/${p.total}</span></h3>` +
            items.map((i) => { const t = j.ticks[i.id]; return `<label style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;cursor:pointer"><input type="checkbox" data-act="tick" data-key="${esc(j.key)}" data-item="${esc(i.id)}" ${t?.fait ? "checked" : ""} style="margin-top:4px"><span>${esc(i.libelle)}${t?.fait ? `<br><span class="small muted">${esc(t.fait_par || "")} · ${t.fait_le ? new Date(t.fait_le).toLocaleDateString("fr-FR") : ""}</span>` : ""}</span></label>`; }).join("") + `</div>`;
        });
        const sup = j.seances.find((s) => s.supports)?.supports || "";
        html += `</div><form class="toolbar" data-supports="${esc(j.key)}" style="margin:14px 0 0"><label class="small muted" for="sup_${esc(j.key.replace("|", "_"))}">Lien vers les supports de cours (Canvas, Drive…) visible par les participants</label><input id="sup_${esc(j.key.replace("|", "_"))}" type="url" value="${esc(sup)}" placeholder="https://…" style="flex:1;min-width:220px;padding:6px 10px;border:1px solid var(--bord);border-radius:6px;background:var(--surface)"><button class="btn sm" type="submit">Enregistrer</button>${sup ? `<a class="btn sm" href="${esc(sup)}" target="_blank" rel="noopener">Ouvrir ↗</a>` : ""}</form>
          <div class="toolbar" style="margin:10px 0 0"><span class="small muted">Séances : ${esc(uniq(j.seances.map((s) => s.cours).filter(Boolean)).join(" / ") || "intitulés à préciser")}</span><span class="grow"></span>` +
          j.ems.map((e) => `<button class="btn sm primary" data-act="projeter" data-id="${esc(e.id)}" data-key="${esc(j.key)}">▣ QR code ${e.demi === "AM" ? "matin" : "après-midi"}</button>`).join("") +
          j.ems.map((e) => `<button class="btn sm" data-act="go" data-view="pointage" data-em="${esc(e.id)}">Pointage ${e.demi === "AM" ? "matin" : "après-midi"} (${D.presences.filter((p) => p.emargement === e.id && p.statut === "Présent").length})</button>`).join("") +
          `<button class="btn sm" data-act="goKit" data-key="${esc(j.key)}">Slides à insérer</button></div></div>`;
      }
      html += `</div>`;
    });
    return html;
  };

  /* ---------- Vue : projection du QR code en séance ---------- */
  views.projeter = () => {
    const em = D.emargements.find((e) => e.id === S.ui.proj);
    if (!em) return `<div class="empty">Choisissez une demi-journée dans « Mes journées ».</div>`;
    const n = D.presences.filter((p) => p.emargement === em.id && p.statut === "Présent").length;
    const cours = uniq(seancesOf(em.id).map((s) => s.cours).filter(Boolean));
    setTimeout(() => { const cv = $("#projQr"); if (!cv) return; const ctx = cv.getContext("2d"); const qr = qrcode(0, "M"); qr.addData(checkinUrl(em.id)); qr.make(); const m = qr.getModuleCount(), size = cv.width, cell = size / m; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size); ctx.fillStyle = "#000"; for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, Math.ceil(cell), Math.ceil(cell)); }, 0);
    return `<div class="toolbar no-print"><button class="btn" data-act="go" data-view="prof">← Retour</button><span class="grow"></span><span class="pill ok" id="projCount">${n} présent(s)</span><button class="btn" data-act="refreshProj">↻ Actualiser</button><button class="btn" data-act="newCode" data-id="${esc(em.id)}">Nouveau code</button><button class="btn primary" data-act="fullscreen">Plein écran</button></div>
      <div class="card" id="projCard" style="text-align:center;padding:32px 16px">
        <img src="assets/logo.png" alt="UM6P | AIM | UNESCO" style="width:min(100%,520px)">
        <h1 style="font-size:clamp(1.6rem,4vw,2.6rem);margin-top:16px">Émargement · ${em.demi === "AM" ? "matin" : "après-midi"}</h1>
        <p style="color:var(--rouge);font-weight:600;font-size:clamp(1rem,2.5vw,1.4rem);margin:0 0 20px">${esc(fmtDate(em.date, true))} · ${esc(em.cohorte)} · ${esc(certLbl(em.certificat))}${cours.length ? "<br>" + esc(cours.join(" / ")) : ""}</p>
        <div style="display:flex;flex-wrap:wrap;gap:40px;justify-content:center;align-items:center">
          <canvas id="projQr" width="560" height="560" style="width:min(80vw,420px);height:auto;border:1px solid var(--bord);border-radius:10px;background:#fff"></canvas>
          <div style="text-align:left;max-width:420px">
            <div class="muted" style="text-transform:uppercase;letter-spacing:.1em;font-size:.9rem">Code de séance</div>
            <div class="mono" style="font-size:clamp(3rem,10vw,6.5rem);font-weight:700;color:var(--bleu);letter-spacing:.2em;line-height:1.1">${esc(em.code)}</div>
            <ol style="font-size:clamp(1rem,2.2vw,1.35rem);padding-left:22px;margin:16px 0 0"><li>Scannez le QR code</li><li>Saisissez le code de séance</li><li>Sélectionnez votre nom</li></ol>
            <p class="muted" style="margin-top:14px;word-break:break-all">${esc(checkinUrl(em.id).replace(/^https?:\/\//, ""))}</p>
          </div></div></div>`;
  };

  /* ---------- Espace étudiant ---------- */
  const moi = () => D.participants.find((p) => norm(p.email) === norm(S.me?.email)) || D.participants[0];
  const etuJours = () => { const p = moi(); if (!p) return []; return journees().filter((j) => j.cohorte === p.cohorte); };
  const presenceDe = (emId) => { const p = moi(); return D.presences.find((x) => x.emargement === emId && x.participant === p?.id); };
  const fenetre = (e) => e.ouvert || (e.date && Math.abs((new Date(e.date + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5) <= 1);
  views.etu_accueil = () => {
    const p = moi();
    if (!p) return `<div class="empty"><strong>Aucune fiche participant n'est associée à ${esc(S.me?.email || "")}.</strong><br>Contactez l'équipe du programme pour qu'elle enregistre votre adresse e-mail.</div>`;
    const coh = D.cohortes.find((c) => c.id === p.cohorte);
    const t = tauxParticipant(p); const seuil = D.cfg.seuil_presence / 100;
    const js = etuJours(); const aPointer = D.emargements.filter((e) => e.cohorte === p.cohorte && fenetre(e));
    const prochains = js.filter((j) => j.date && j.date >= today()).slice(0, 4);
    let html = `<h1>Bonjour ${esc(p.prenom)}</h1><p class="muted">${esc(coh ? coh.libelle : p.cohorte)} · Executive Master in AI Governance &amp; Practice</p>`;
    html += `<div class="card" style="border-color:var(--bleu)"><h2>Pointer ma présence</h2>` + (aPointer.length ? `<p class="small muted">Saisissez le code à 4 chiffres affiché par l'intervenant.</p><div class="att-grid">` +
      aPointer.map((e) => { const pr = presenceDe(e.id); return `<div class="att" style="flex-direction:column;align-items:stretch"><div><strong>${e.demi === "AM" ? "Matin" : "Après-midi"}</strong> · ${esc(fmtDate(e.date))}<br><span class="small muted">${esc(uniq(seancesOf(e.id).map((s) => s.cours).filter(Boolean)).join(" / ") || certLbl(e.certificat))}</span></div>` +
        (pr?.statut === "Présent" ? `<span class="pill ok" style="align-self:flex-start">✓ Présence enregistrée${pr.horodatage ? " à " + new Date(pr.horodatage).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>`
          : `<form data-etu-em="${esc(e.id)}" style="display:flex;gap:8px"><input class="mono" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Code" required style="width:110px;padding:8px;border:1px solid var(--bord);border-radius:6px;background:var(--surface);letter-spacing:.3em;text-align:center"><button class="btn primary" type="submit">Pointer</button></form>`) + `</div>`; }).join("") + `</div>`
      : `<p class="muted">Aucune séance aujourd'hui. Le pointage s'ouvre le jour de la séance.</p>`) + `</div>`;
    html += `<div class="tiles"><div class="tile"><div class="lbl">Présence globale</div><div class="val" style="color:${t.total.tenues && t.total.pres / t.total.tenues < seuil ? "var(--critique)" : "inherit"}">${pct(t.total.tenues ? t.total.pres / t.total.tenues : null)}</div><div class="sub">${t.total.pres} h sur ${t.total.tenues} h tenues · seuil ${D.cfg.seuil_presence} %</div></div>` +
      Object.entries(D.cfg.certificats).filter(([c]) => t.parCert[c]?.tenues).map(([c, l]) => { const x = t.parCert[c]; return `<div class="tile"><div class="lbl">${c} · ${esc(l)}</div><div class="val" style="font-size:1.2rem">${pct(x.pres / x.tenues)}</div><div class="sub">${x.pres} h / ${x.tenues} h</div></div>`; }).join("") + `</div>`;
    html += `<div class="card"><h2>Prochaines journées</h2>` + (prochains.length ? table([
      { h: "Date", f: (j) => fmtDate(j.date, true) }, { h: "Certificat", f: (j) => esc(certLbl(j.certificat)) },
      { h: "Cours", f: (j) => esc(uniq(j.seances.map((s) => s.cours).filter(Boolean)).join(" / ") || "—") }, { h: "Intervenant", f: (j) => esc(j.intervenants.join(", ")) },
      { h: "Supports", f: (j) => { const u = j.seances.find((s) => s.supports)?.supports; return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">Ouvrir ↗</a>` : '<span class="muted">—</span>'; } },
    ], prochains) : '<p class="muted">Aucune journée datée à venir.</p>') + `</div>`;
    return html;
  };
  views.etu_presences = () => {
    const p = moi(); if (!p) return views.etu_accueil();
    const ems = D.emargements.filter((e) => e.cohorte === p.cohorte && e.date && e.date <= today()).sort((a, b) => b.date.localeCompare(a.date) || b.demi.localeCompare(a.demi));
    return `<h1>Mes présences</h1><p class="small muted">Une ligne par demi-journée passée. Les absences excusées sont signalées à l'équipe ; elles ne comptent pas comme présence.</p>` + table([
      { h: "Date", f: (e) => `${fmtDate(e.date)} · ${e.demi === "AM" ? "matin" : "après-midi"}` }, { h: "Certificat", f: (e) => esc(e.certificat) },
      { h: "Cours", f: (e) => esc(uniq(seancesOf(e.id).map((s) => s.cours).filter(Boolean)).join(" / ") || "—") },
      { h: "Heures", num: true, f: (e) => heuresEm(e.id) || "—" },
      { h: "Statut", f: (e) => { const pr = presenceDe(e.id); const st = pr?.statut; return `<span class="pill ${st === "Présent" ? "ok" : st === "Excusé" ? "warn" : heuresEm(e.id) ? "bad" : ""}">${esc(st || (heuresEm(e.id) ? "Absent" : "—"))}</span>`; } },
    ], ems);
  };
  views.etu_planning = () => {
    const p = moi(); if (!p) return views.etu_accueil();
    const js = etuJours(); let last = null, html = `<h1>Planning · ${esc((D.cohortes.find((c) => c.id === p.cohorte) || {}).libelle || p.cohorte)}</h1>`;
    js.forEach((j) => {
      if (j.certificat !== last) { last = j.certificat; html += `<h2 style="margin-top:18px">${esc(certLbl(last))}</h2>`; }
      const u = j.seances.find((s) => s.supports)?.supports;
      html += `<div class="jour"><header><strong>Jour ${j.jour}</strong><span>${esc(fmtDate(j.date, true))}</span><span class="muted small">${esc(j.intervenants.join(", "))}</span><span style="flex:1"></span>${u ? `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">Supports ↗</a>` : ""}</header>` +
        j.seances.map((s) => `<div class="creneau"><span class="mono muted">${esc(s.creneau)}</span><span>${esc(s.cours || "—")}<span class="small muted"> · ${esc(HORAIRES[s.creneau] || "")}</span></span><span></span><span></span></div>`).join("") + `</div>`;
    });
    return html;
  };
  document.addEventListener("submit", async (e) => {
    const fs = e.target.closest("form[data-supports]");
    if (fs) {
      e.preventDefault(); const [cohorte, jour] = fs.dataset.supports.split("|"); const url = fs.querySelector("input").value.trim();
      const { error } = await sb.from("seances").update({ supports: url }).eq("cohorte", cohorte).eq("jour", +jour);
      if (error) return toast(error.message, true);
      await reload("seances"); toast(url ? "Lien des supports enregistré" : "Lien retiré"); return;
    }
    const f = e.target.closest("form[data-etu-em]"); if (!f) return;
    e.preventDefault(); const btn = f.querySelector("button"); btn.disabled = true;
    const { data, error } = await sb.rpc("checkin_me", { p_emargement: f.dataset.etuEm, p_code: f.querySelector("input").value.trim() });
    btn.disabled = false;
    if (error) return toast(/P0001|incorrect/i.test(error.code + error.message) ? "Code incorrect." : /P0002/.test(error.code + error.message) ? "Le pointage de cette séance n'est pas ouvert." : error.message, true);
    toast(`Présence enregistrée : ${data}`); D.presences = await fetchAll("presences"); render();
  });

  /* ---------- Vue : suivi intervenants (admin) ---------- */
  views.suivi = () => {
    let js = journees().filter((j) => S.ui.suiviAll || !j.date || j.date >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
    const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const cell = (j, ph) => { const p = progress(j, ph); if (!p.total) return "—"; const late = p.done < p.total && j.date && ((ph === "avant" && j.date <= soon) || (ph !== "avant" && j.date < today())); return `<span class="pill ${p.done === p.total ? "ok" : late ? "bad" : p.done ? "warn" : ""}">${p.done}/${p.total}</span>`; };
    const prof = (i) => D.profils.find((p) => p.intervenant && norm(i).includes(norm(p.intervenant)));
    return `<h1>Suivi des intervenants <span class="muted" style="font-weight:400;font-size:1rem">· ${esc(scopeLbl())}</span></h1>
      <div class="toolbar"><label class="small"><input type="checkbox" data-ui="suiviAll" ${S.ui.suiviAll ? "checked" : ""}> inclure les journées passées</label><span class="grow"></span><span class="small muted">Rouge : étape « avant » incomplète à moins de 7 jours, ou étape « pendant / après » incomplète pour une journée passée.</span></div>` +
      table([
        { h: "Journée", f: (j) => `<strong>${esc(j.cohorte)} · J${String(j.jour).padStart(2, "0")}</strong><br><span class="small muted">${esc(fmtDate(j.date))} · ${esc(j.certificat)}</span>` },
        { h: "Intervenant(s)", f: (j) => j.intervenants.map((i) => { const p = prof(i); return `${esc(i)} ${p ? '<span class="pill info" title="compte intervenant lié">compte</span>' : '<span class="pill" title="aucun compte intervenant ne correspond">sans compte</span>'}`; }).join("<br>") || '<span class="muted">—</span>' },
        { h: "Avant", f: (j) => cell(j, "avant") }, { h: "Pendant", f: (j) => cell(j, "pendant") }, { h: "Après", f: (j) => cell(j, "apres") },
        { h: "Présences", num: true, f: (j) => j.ems.map((e) => D.presences.filter((p) => p.emargement === e.id && p.statut === "Présent").length).join(" / ") || "—" },
        { h: "", cls: "actions", f: (j) => `<button class="btn sm" data-act="openDay" data-key="${esc(j.key)}" data-view="prof">Détail</button>` },
      ], js);
  };

  /* ---------- Vue : dépenses ---------- */
  const depenseFields = (d = {}) => [
    { k: "date", label: "Date", type: "date", value: d.date || today(), required: true },
    { k: "cohorte", label: "Cohorte", type: "select", options: [["Commun", "Commun (toutes cohortes)"], ...D.cohortes.map((c) => [c.id, c.libelle])], value: d.cohorte || (S.cohorte !== "all" ? S.cohorte : "Commun") },
    { k: "certificat", label: "Certificat", type: "select", options: [["", "—"], ...Object.entries(D.cfg.certificats).map(([k, v]) => [k, `${k} · ${v}`])], value: d.certificat || "" },
    { k: "categorie", label: "Catégorie", type: "select", options: D.cfg.categories_depenses, value: d.categorie || D.cfg.categories_depenses[0] },
    { k: "libelle", label: "Libellé", value: d.libelle, required: true, full: true },
    { k: "fournisseur", label: "Fournisseur / intervenant", value: d.fournisseur },
    { k: "montant", label: "Montant TTC (MAD)", type: "number", value: d.montant ?? "", step: "0.01", required: true },
    { k: "statut", label: "Statut", type: "select", options: ["À payer", "Payé"], value: d.statut || "À payer" },
    { k: "piece", label: "N° facture / pièce", value: d.piece },
    { k: "notes", label: "Notes", type: "textarea", value: d.notes, full: true },
  ];
  views.depenses = () => {
    const cat = S.ui.dcat || "", q = norm(S.ui.dq || "");
    const rows = D.depenses.filter(inScope).filter((d) => (!cat || d.categorie === cat) && (!q || norm(d.libelle + " " + d.fournisseur + " " + d.piece).includes(q))).sort((a, b) => b.date.localeCompare(a.date));
    const parCat = by(rows, (d) => d.categorie);
    return `<h1>Dépenses <span class="muted" style="font-weight:400;font-size:1rem">· ${esc(scopeLbl())}</span></h1>
      <div class="toolbar"><input type="search" placeholder="Rechercher…" value="${esc(S.ui.dq || "")}" data-ui="dq"><select data-ui="dcat"><option value="">Toutes catégories</option>${D.cfg.categories_depenses.map((c) => `<option ${c === cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <span class="grow"></span><button class="btn" data-act="exportCsv" data-table="depenses">CSV</button><button class="btn primary" data-act="addD">+ Dépense</button></div>
      <div class="tiles">${Object.entries(parCat).sort((a, b) => sum(b[1], (d) => d.montant) - sum(a[1], (d) => d.montant)).slice(0, 6).map(([c, ds]) => `<div class="tile"><div class="lbl">${esc(c)}</div><div class="val" style="font-size:1.2rem">${mad(sum(ds, (d) => d.montant))}</div><div class="sub">${ds.length} ligne(s)</div></div>`).join("")}</div>` +
      table([
        { h: "Date", f: (d) => fmtDate(d.date) }, { h: "Cohorte", f: (d) => esc(d.cohorte) + (d.certificat ? ` <span class="small muted">${esc(d.certificat)}</span>` : "") },
        { h: "Catégorie", f: (d) => esc(d.categorie) }, { h: "Libellé", f: (d) => `${esc(d.libelle)}<br><span class="small muted">${esc(d.fournisseur || "")}${d.piece ? " · " + esc(d.piece) : ""}</span>` },
        { h: "Montant", num: true, f: (d) => mad(d.montant) }, { h: "Statut", f: (d) => `<span class="pill ${d.statut === "Payé" ? "ok" : "warn"}">${esc(d.statut)}</span>` },
        { h: "", cls: "actions", f: (d) => `<button class="btn sm" data-act="editD" data-id="${d.id}">Modifier</button>` },
      ], rows, ["Total", `${rows.length} ligne(s)`, "", "", mad(sum(rows, (d) => d.montant)), `${mad(sum(rows.filter((d) => d.statut !== "Payé"), (d) => d.montant))} à payer`, ""]);
  };

  /* ---------- Vue : recettes ---------- */
  const recetteFields = (r = {}) => {
    const coh = r.cohorte || (S.cohorte !== "all" ? S.cohorte : D.cohortes.at(-1)?.id);
    return [
      { k: "date", label: "Date de facturation", type: "date", value: r.date || today(), required: true },
      { k: "cohorte", label: "Cohorte", type: "select", options: D.cohortes.map((c) => [c.id, c.libelle]), value: coh },
      { k: "type", label: "Type de payeur", type: "select", options: TYPES_REC, value: r.type || "Participant" },
      { k: "participant", label: "Participant concerné", type: "select", options: [["", "— aucun / collectif —"], ...D.participants.filter((p) => p.cohorte === coh).map((p) => [p.id, pName(p)])], value: r.participant || "", help: "La liste suit la cohorte choisie à l'ouverture du formulaire." },
      { k: "payeur", label: "Payeur (nom du participant, de l'entreprise…)", value: r.payeur, required: true, full: true },
      { k: "objet", label: "Objet", value: r.objet || "Frais d'inscription" }, { k: "facture", label: "N° facture", value: r.facture },
      { k: "montant_facture", label: "Montant facturé (MAD)", type: "number", value: r.montant_facture ?? "", step: "0.01", required: true },
      { k: "echeance", label: "Échéance", type: "date", value: r.echeance || "" },
      { k: "montant_encaisse", label: "Montant encaissé (MAD)", type: "number", value: r.montant_encaisse ?? 0, step: "0.01" },
      { k: "date_encaissement", label: "Date d'encaissement", type: "date", value: r.date_encaissement || "" },
      { k: "notes", label: "Notes", type: "textarea", value: r.notes, full: true },
    ];
  };
  views.recettes = () => {
    const typ = S.ui.rtyp || "", st = S.ui.rst || "", q = norm(S.ui.rq || "");
    const rows = D.recettes.filter(inScope).filter((r) => (!typ || r.type === typ) && (!st || recStatut(r)[0] === st) && (!q || norm(r.payeur + " " + r.objet + " " + r.facture).includes(q))).sort((a, b) => b.date.localeCompare(a.date));
    const parType = by(D.recettes.filter(inScope), (r) => r.type);
    return `<h1>Recettes <span class="muted" style="font-weight:400;font-size:1rem">· ${esc(scopeLbl())}</span></h1>
      <div class="toolbar"><input type="search" placeholder="Payeur, objet, facture…" value="${esc(S.ui.rq || "")}" data-ui="rq"><select data-ui="rtyp"><option value="">Tous types</option>${TYPES_REC.map((t) => `<option ${t === typ ? "selected" : ""}>${t}</option>`).join("")}</select>
      <select data-ui="rst"><option value="">Tous statuts</option>${["Encaissée", "Partielle", "En attente", "En retard"].map((t) => `<option ${t === st ? "selected" : ""}>${t}</option>`).join("")}</select>
      <span class="grow"></span><button class="btn" data-act="genFrais">Générer les frais d'inscription</button><button class="btn" data-act="exportCsv" data-table="recettes">CSV</button><button class="btn primary" data-act="addR">+ Recette</button></div>
      <div class="tiles">${TYPES_REC.map((t) => { const rs = parType[t] || []; return `<div class="tile"><div class="lbl">${t}</div><div class="val" style="font-size:1.2rem">${mad(sum(rs, (r) => r.montant_facture))}</div><div class="sub">${mad(sum(rs, (r) => r.montant_encaisse))} encaissés · ${rs.length} ligne(s)</div></div>`; }).join("")}</div>` +
      table([
        { h: "Date", f: (r) => fmtDate(r.date) }, { h: "Cohorte", f: (r) => esc(r.cohorte) },
        { h: "Payeur", f: (r) => `<strong>${esc(r.payeur)}</strong> <span class="pill">${esc(r.type)}</span><br><span class="small muted">${esc(r.objet || "")}${r.participant && pById(r.participant) ? " · " + esc(pName(pById(r.participant))) : ""}${r.facture ? " · " + esc(r.facture) : ""}</span>` },
        { h: "Facturé", num: true, f: (r) => mad(r.montant_facture) }, { h: "Encaissé", num: true, f: (r) => mad(r.montant_encaisse) + (r.date_encaissement ? `<br><span class="small muted">${fmtDate(r.date_encaissement)}</span>` : "") },
        { h: "Reste", num: true, f: (r) => mad(r.montant_facture - r.montant_encaisse) },
        { h: "Statut", f: (r) => { const [l, c] = recStatut(r); return `<span class="pill ${c}">${l}</span>${r.echeance ? `<br><span class="small muted">éch. ${fmtDate(r.echeance)}</span>` : ""}`; } },
        { h: "", cls: "actions", f: (r) => `<button class="btn sm" data-act="editR" data-id="${r.id}">Modifier</button>` },
      ], rows, ["Total", "", `${rows.length} ligne(s)`, mad(sum(rows, (r) => r.montant_facture)), mad(sum(rows, (r) => r.montant_encaisse)), mad(sum(rows, (r) => r.montant_facture - r.montant_encaisse)), "", ""]);
  };

  /* ---------- Vue : P&L ---------- */
  function pnlData() {
    const cols = [...D.cohortes.map((c) => c.id), "Commun"];
    const rec = (coh, f) => sum(D.recettes.filter((r) => r.cohorte === coh), f);
    const dep = (coh, cat) => sum(D.depenses.filter((d) => d.cohorte === coh && (!cat || d.categorie === cat)), (d) => d.montant);
    const lignes = [];
    TYPES_REC.forEach((t) => lignes.push({ l: `Recettes facturées · ${t}`, v: cols.map((c) => sum(D.recettes.filter((r) => r.cohorte === c && r.type === t), (r) => r.montant_facture)) }));
    lignes.push({ l: "Total recettes facturées", v: cols.map((c) => rec(c, (r) => r.montant_facture)), b: true });
    lignes.push({ l: "dont encaissées", v: cols.map((c) => rec(c, (r) => r.montant_encaisse)), i: true });
    lignes.push({ l: "dont restant à encaisser", v: cols.map((c) => rec(c, (r) => r.montant_facture - r.montant_encaisse)), i: true });
    D.cfg.categories_depenses.forEach((cat) => lignes.push({ l: `Dépenses · ${cat}`, v: cols.map((c) => dep(c, cat)) }));
    lignes.push({ l: "Total dépenses", v: cols.map((c) => dep(c)), b: true });
    lignes.push({ l: "Résultat engagé (facturé − dépenses)", v: cols.map((c) => rec(c, (r) => r.montant_facture) - dep(c)), b: true, res: true });
    lignes.push({ l: "Résultat trésorerie (encaissé − dépenses)", v: cols.map((c) => rec(c, (r) => r.montant_encaisse) - dep(c)), res: true });
    lignes.push({ l: "Marge engagée", v: cols.map((c) => { const f = rec(c, (r) => r.montant_facture); return f ? (f - dep(c)) / f : null; }), pct: true });
    lignes.push({ l: "Participants actifs", v: cols.map((c) => D.participants.filter((p) => p.cohorte === c && p.statut === "Actif").length), n: true });
    lignes.push({ l: "Recette facturée / participant actif", v: cols.map((c) => { const n = D.participants.filter((p) => p.cohorte === c && p.statut === "Actif").length; return n ? rec(c, (r) => r.montant_facture) / n : null; }) });
    lignes.push({ l: "Dépenses / participant actif", v: cols.map((c) => { const n = D.participants.filter((p) => p.cohorte === c && p.statut === "Actif").length; return n ? dep(c) / n : null; }) });
    return { cols, lignes };
  }
  views.pnl = () => {
    const { cols, lignes } = pnlData();
    const fmt = (L, v) => v == null ? "—" : L.pct ? pct(v) : L.n ? v : mad(v);
    let html = `<h1>Compte de résultat (P&amp;L)</h1><div class="toolbar"><span class="small muted">Montants en MAD TTC, toutes cohortes. « Commun » regroupe les dépenses non affectées à une cohorte.</span><span class="grow"></span><button class="btn primary" data-act="exportXlsx">Exporter le classeur Excel</button></div>
      <div class="card"><div class="tablewrap"><table><thead><tr><th></th>${cols.map((c) => `<th class="num">${esc(c)}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>` +
      lignes.map((L) => { const tot = L.pct ? (sum(lignes.find((x) => x.l === "Total recettes facturées").v) ? sum(lignes.find((x) => x.l === "Résultat engagé (facturé − dépenses)").v) / sum(lignes.find((x) => x.l === "Total recettes facturées").v) : null) : L.l.includes("/ participant") ? null : sum(L.v);
        return `<tr style="${L.b ? "font-weight:700;background:var(--surface-2)" : ""}${L.i ? "color:var(--texte-2);font-style:italic" : ""}"><td>${esc(L.l)}</td>${L.v.map((v) => `<td class="num" style="${L.res && v < 0 ? "color:var(--critique)" : ""}">${fmt(L, v)}</td>`).join("")}<td class="num">${fmt(L, tot)}</td></tr>`; }).join("") + `</tbody></table></div></div>`;
    if (S.cohorte !== "all") {
      const certs = Object.keys(D.cfg.certificats);
      html += `<div class="card"><h2>Détail par certificat · ${esc(scopeLbl())}</h2>` + table([
        { h: "Certificat", f: (c) => esc(certLbl(c)) },
        { h: "Heures planifiées", num: true, f: (c) => sum(D.seances.filter((s) => s.cohorte === S.cohorte && s.certificat === c), (s) => s.duree) + " h" },
        { h: "Heures tenues", num: true, f: (c) => sum(D.seances.filter((s) => s.cohorte === S.cohorte && s.certificat === c && tenue(s)), (s) => s.duree) + " h" },
        { h: "Dépenses affectées", num: true, f: (c) => mad(sum(D.depenses.filter((d) => d.cohorte === S.cohorte && d.certificat === c), (d) => d.montant)) },
        { h: "Coût / heure", num: true, f: (c) => { const h = sum(D.seances.filter((s) => s.cohorte === S.cohorte && s.certificat === c), (s) => s.duree); return h ? mad(sum(D.depenses.filter((d) => d.cohorte === S.cohorte && d.certificat === c), (d) => d.montant) / h) : "—"; } },
      ], certs) + `<p class="small muted">Les dépenses sans certificat (${mad(sum(D.depenses.filter((d) => d.cohorte === S.cohorte && !d.certificat), (d) => d.montant))}) ne figurent pas dans ce détail.</p></div>`;
    }
    return html;
  };

  /* ---------- Vue : paramètres & Canvas ---------- */
  views.params = () => {
    const coh = S.cohorte !== "all" ? S.cohorte : D.cohortes.at(-1)?.id || "C4";
    const site = CFG.SITE_URL || "";
    const iframe = `<p><iframe src="${site}/planning.html?cohorte=${coh}&amp;compact=1" width="100%" height="1200" style="border:0" title="Planning et émargement"></iframe></p>`;
    const ems = D.emargements.filter((e) => e.cohorte === coh);
    const jours = by(ems, (e) => e.jour);
    const tableHtml = `<table style="border-collapse:collapse;width:100%"><thead><tr style="background:#1B75BC;color:#fff"><th style="padding:6px;text-align:left">Jour</th><th style="padding:6px;text-align:left">Date</th><th style="padding:6px;text-align:left">Certificat</th><th style="padding:6px;text-align:left">Émargement</th></tr></thead><tbody>` +
      Object.keys(jours).map(Number).sort((a, b) => a - b).map((j) => { const e0 = jours[j][0]; return `<tr><td style="padding:6px;border-bottom:1px solid #ddd">J${String(j).padStart(2, "0")}</td><td style="padding:6px;border-bottom:1px solid #ddd">${fmtDate(e0.date, true)}</td><td style="padding:6px;border-bottom:1px solid #ddd">${certLbl(e0.certificat)}</td><td style="padding:6px;border-bottom:1px solid #ddd">${jours[j].map((e) => `<a href="${checkinUrl(e.id)}" target="_blank" rel="noopener">${e.demi === "AM" ? "Matin" : "Après-midi"}</a>`).join(" · ")}</td></tr>`; }).join("") + `</tbody></table>`;
    return `<h1>Paramètres &amp; intégration Canvas</h1>
      <div class="card"><h2>Paramètres</h2><div class="fields">
        <div class="field"><label for="cfg_url">URL de la page de pointage</label><input id="cfg_url" value="${esc(D.cfg.checkin_url)}"><span class="small muted">Encodée dans les QR codes. Changer cette URL invalide les slides déjà distribuées.</span></div>
        <div class="field"><label for="cfg_seuil">Seuil de présence (%)</label><input id="cfg_seuil" type="number" min="0" max="100" value="${esc(D.cfg.seuil_presence)}"></div>
        <div class="field full"><label for="cfg_cats">Catégories de dépenses (une par ligne)</label><textarea id="cfg_cats" style="min-height:120px">${esc(D.cfg.categories_depenses.join("\n"))}</textarea></div>
        <div class="field full"><label for="cfg_check">Checklist intervenant (une ligne par élément : <span class="mono">avant | libellé</span>, <span class="mono">pendant | libellé</span> ou <span class="mono">apres | libellé</span>)</label><textarea id="cfg_check" style="min-height:190px">${esc(D.cfg.checklist.map((i) => `${i.phase} | ${i.libelle}`).join("\n"))}</textarea><span class="small muted">L'ordre dans chaque phase sert d'identifiant : insérer ou supprimer une ligne décale les coches déjà faites sur les lignes suivantes de cette phase. Reformuler une ligne les conserve.</span></div>
      </div><div class="form-actions"><button class="btn primary" data-act="saveCfg">Enregistrer les paramètres</button></div></div>
      <div class="card"><h2>Comptes &amp; rôles</h2><div class="toolbar" style="margin:0 0 8px"><span class="small muted">Trois accès : <b>participants</b> sans compte (planning public et pointage par QR + code), <b>intervenants</b> (leurs journées, checklist, pointage et slides QR sur <span class="mono">prof.html</span>), <b>équipe</b> (tout, sur <span class="mono">admin.html</span>). Les comptes sont créés dans Supabase → Authentication → Users, puis déclarés ici.</span><span class="grow"></span><button class="btn primary sm" data-act="addProfil">+ Compte</button></div>` +
      table([
        { h: "E-mail", f: (p) => `<strong>${esc(p.email)}</strong>${p.email === S.me.email ? ' <span class="pill info">vous</span>' : ""}` }, { h: "Nom", f: (p) => esc(p.nom) },
        { h: "Rôle", f: (p) => `<span class="pill ${p.role === "admin" ? "ok" : "info"}">${p.role === "admin" ? "Équipe" : "Intervenant"}</span>` },
        { h: "Planning", f: (p) => p.role === "admin" ? '<span class="muted">—</span>' : p.intervenant ? `« ${esc(p.intervenant)} » · ${D.seances.filter((s) => norm(s.intervenant).includes(norm(p.intervenant))).length} séance(s)` : '<span class="pill bad">fragment manquant</span>' },
        { h: "", cls: "actions", f: (p) => `<button class="btn sm" data-act="editProfil" data-id="${esc(p.email)}">Modifier</button>` },
      ], D.profils) + `</div>
      <div class="card"><h2>Cohortes</h2><div class="toolbar" style="margin:0 0 8px"><span class="small muted">Une cohorte regroupe un planning, des participants et des finances. Le bouton « + Cohorte » en haut de page permet de répliquer le planning d'une cohorte existante.</span><span class="grow"></span><button class="btn primary sm" data-act="addCohorte">+ Cohorte</button></div>` +
      table([
        { h: "Id", f: (c) => `<strong>${esc(c.id)}</strong>` }, { h: "Libellé", f: (c) => esc(c.libelle) }, { h: "Période", f: (c) => `${fmtDate(c.debut)} → ${fmtDate(c.fin)}` },
        { h: "Participants", num: true, f: (c) => D.participants.filter((p) => p.cohorte === c.id).length }, { h: "Séances", num: true, f: (c) => D.seances.filter((s) => s.cohorte === c.id).length },
        { h: "", cls: "actions", f: (c) => `<button class="btn sm" data-act="editCohorte" data-id="${esc(c.id)}">Modifier</button>` },
      ], D.cohortes) + `</div>
      <div class="card"><h2>Pages publiques</h2><ul style="margin:0;padding-left:18px"><li>Accueil : <a href="${site}/" target="_blank" rel="noopener">${esc(site)}/</a></li>
        <li>Planning par cohorte : ${D.cohortes.map((c) => `<a href="${site}/planning.html?cohorte=${c.id}" target="_blank" rel="noopener">${c.id}</a>`).join(" · ")}</li>
        <li>Pointage : <span class="mono">${esc(D.cfg.checkin_url)}?e=&lt;id de demi-journée&gt;</span> (accès par QR code et code de séance uniquement)</li></ul></div>
      <div class="card"><h2>À coller dans une page Canvas · ${esc(coh)}</h2>
        <p class="small muted">Canvas supprime le JavaScript des pages mais accepte les iframes et le HTML statique. Option 1 : l'iframe affiche le planning vivant (mis à jour automatiquement). Option 2 : un tableau statique à recoller quand le planning change. Éditeur de page Canvas → « &lt;/&gt; » (HTML) → coller.</p>
        <h3>Option 1 · iframe (recommandée)</h3><pre class="snippet" id="snip1">${esc(iframe)}</pre><button class="btn sm" data-act="copyEl" data-el="snip1">Copier</button>
        <h3 style="margin-top:14px">Option 2 · tableau statique</h3><pre class="snippet" id="snip2">${esc(tableHtml)}</pre><button class="btn sm" data-act="copyEl" data-el="snip2">Copier</button></div>
      <div class="card"><h2>Sauvegarde</h2><p class="small muted">Export complet de la base en JSON (toutes tables), à conserver régulièrement.</p><button class="btn" data-act="exportJson">Télécharger la sauvegarde JSON</button></div>`;
  };

  /* ---------- Actions ---------- */
  const A = {};
  A.go = (d) => { if (d.em) S.ui.em = d.em; setView(d.view); };
  A.openDay = (d) => { S.ui.openDay = S.ui.openDay === d.key && !d.view ? "" : d.key; if (d.view) { const [c] = d.key.split("|"); if (S.cohorte !== "all" && S.cohorte !== c) { S.cohorte = c; $("#cohorte").value = c; } S.ui.profAll = true; setView(d.view); } else render(); };
  A.goKit = (d) => { S.ui.kitDay = d.key; S.ui.interv = ""; setView("kit"); };
  A.projeter = async (d) => {
    S.ui.proj = d.id; setView("projeter");
    /* Coche automatiquement l'étape « pendant » correspondant à la demi-journée (1re ligne = matin, 2e = après-midi). */
    const em = D.emargements.find((e) => e.id === d.id); const items = D.cfg.checklist.filter((i) => i.phase === "pendant");
    const item = items.find((i) => norm(i.libelle).includes(em.demi === "AM" ? "matin" : "apres")) || items[em.demi === "AM" ? 0 : 1];
    const [cohorte, jour] = d.key.split("|");
    if (item && !D.checklist.some((c) => c.cohorte === cohorte && c.jour === +jour && c.item === item.id && c.fait)) {
      const { error } = await sb.from("checklist").upsert({ cohorte, jour: +jour, item: item.id, fait: true, fait_par: S.me?.nom || S.me?.email || "", fait_le: new Date().toISOString() }, { onConflict: "cohorte,jour,item" });
      if (!error) D.checklist = await fetchAll("checklist");
    }
  };
  A.refreshProj = async () => { D.presences = await fetchAll("presences"); render(); toast("Présences actualisées"); };
  A.newCode = async (d) => { if (!(await confirmDlg("Générer un nouveau code pour cette demi-journée ? Les participants déjà pointés le restent ; le code imprimé sur une slide préparée à l'avance ne sera plus valable.", "Nouveau code"))) return; await write("emargements", "update", { code: rand4() }, d.id); };
  A.fullscreen = () => { const el = $("#projCard"); if (document.fullscreenElement) document.exitFullscreen(); else if (el?.requestFullscreen) el.requestFullscreen().catch(() => toast("Plein écran indisponible dans ce navigateur", true)); };
  A.kitClear = () => { S.ui.kitDay = ""; render(); };
  A.tick = async (d, el) => {
    const [cohorte, jour] = d.key.split("|"); const fait = el.checked;
    const row = { cohorte, jour: +jour, item: d.item, fait, fait_par: fait ? (S.me?.nom || S.me?.email || "") : "", fait_le: fait ? new Date().toISOString() : null };
    const { error } = await sb.from("checklist").upsert(row, { onConflict: "cohorte,jour,item" });
    if (error) { el.checked = !fait; return toast(error.message, true); }
    await reload("checklist");
  };
  A.addProfil = async () => {
    const v = await openForm({ title: "Nouveau compte", intro: "Créez d'abord le compte (e-mail + mot de passe) dans Supabase → Authentication → Users, puis déclarez ici son rôle avec le même e-mail.", fields: [
      { k: "email", label: "E-mail du compte", type: "email", required: true, full: true }, { k: "nom", label: "Nom affiché", required: true },
      { k: "role", label: "Rôle", type: "select", options: [["intervenant", "Intervenant : ses journées, checklist, pointage, slides QR"], ["admin", "Équipe : accès complet"]], value: "intervenant" },
      { k: "intervenant", label: "Fragment du nom dans le planning", help: "Ex. « Gouvier » ou « Otberdout » : l'intervenant voit toutes les journées dont le champ intervenant contient ce texte. Vide pour un compte équipe." },
    ], submit: "Créer" });
    if (!v) return; v.email = v.email.trim().toLowerCase();
    const { error } = await sb.from("profils").insert(v); if (error) return toast(error.message, true);
    await reload("profils"); toast("Compte déclaré");
  };
  A.editProfil = async (d) => {
    const p = D.profils.find((x) => x.email === d.id);
    const v = await openForm({ title: p.email, fields: [
      { k: "nom", label: "Nom affiché", value: p.nom, required: true }, { k: "role", label: "Rôle", type: "select", options: [["intervenant", "Intervenant"], ["admin", "Équipe"]], value: p.role },
      { k: "intervenant", label: "Fragment du nom dans le planning", value: p.intervenant, full: true },
    ], danger: "Retirer le rôle" });
    if (v === "__danger__") { if (p.email === S.me.email) return toast("Vous ne pouvez pas retirer votre propre rôle.", true); if (await confirmDlg(`Retirer tout accès à ${p.email} ? Le compte Supabase reste à supprimer dans Authentication.`, "Retirer")) { await sb.from("profils").delete().eq("email", p.email); await reload("profils"); } return; }
    if (!v) return; if (p.email === S.me.email && v.role !== "admin") return toast("Vous ne pouvez pas retirer votre propre rôle équipe.", true);
    const { error } = await sb.from("profils").update(v).eq("email", p.email); if (error) return toast(error.message, true);
    await reload("profils"); toast("Compte mis à jour");
  };
  A.copyLink = (d) => copy(checkinUrl(d.em), "Lien de pointage copié");
  A.copyEl = (d) => copy($("#" + d.el).textContent, "HTML copié");
  A.print = () => window.print();
  A.copyNames = () => copy(D.participants.filter(inScope).filter((p) => p.statut === "Actif").map(pName).join("\n"), "Liste copiée");
  A.addP = async () => { const v = await openForm({ title: "Nouveau participant", intro: "L'adresse e-mail saisie ici est celle avec laquelle le participant pourra créer son compte sur l'espace étudiants.", fields: participantFields() }); if (v) { v.email = (v.email || "").trim().toLowerCase(); await write("participants", "insert", v); } };
  A.dossier = (d) => { S.ui.part = d.id; setView("dossier"); };
  A.addRFor = async (d) => { const p = pById(d.id); const v = await recetteForm("Nouvelle recette", { cohorte: p.cohorte, participant: p.id, payeur: p.financement === "Entreprise" && p.financeur ? p.financeur : `${p.prenom} ${p.nom}`, type: p.financement === "Entreprise" ? "Entreprise" : "Participant", montant_facture: Math.max(0, (p.frais || 0) - (p.remise || 0)) }); if (v) { v.participant ||= null; await write("recettes", "insert", v); } };
  A.openDoc = async (d) => {
    const doc = D.documents.find((x) => x.id === d.id);
    const { data, error } = await sb.storage.from("dossiers").createSignedUrl(doc.chemin, 120);
    if (error) return toast("Ouverture impossible : " + error.message, true);
    const a = document.createElement("a"); a.href = data.signedUrl; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  };
  A.delDoc = async (d) => {
    const doc = D.documents.find((x) => x.id === d.id);
    if (!(await confirmDlg(`Supprimer définitivement « ${doc.nom} » ?`))) return;
    const { error } = await sb.storage.from("dossiers").remove([doc.chemin]); if (error) return toast(error.message, true);
    await write("documents", "delete", null, doc.id);
  };
  A.editP = async (d) => {
    const p = pById(d.id); const v = await openForm({ title: "Modifier le participant", fields: participantFields(p), danger: "Supprimer" });
    if (v === "__danger__") {
      const nd = D.documents.filter((x) => x.participant === p.id);
      if (!(await confirmDlg(`Supprimer ${pName(p)}, ses présences et ses ${nd.length} document(s) ? Les recettes liées sont conservées sans lien. Cette action est définitive.`))) return;
      if (nd.length) await sb.storage.from("dossiers").remove(nd.map((x) => x.chemin));
      await write("participants", "delete", null, p.id); await reload("documents"); if (S.view === "dossier") setView("participants");
    } else if (v) { v.email = (v.email || "").trim().toLowerCase(); v.date_naissance ||= null; await write("participants", "update", v, p.id); }
  };
  function dossierRows(parts) {
    const pn = (p) => `${p.nom} ${p.prenom}`;
    const fiche = parts.map((p) => { const t = tauxParticipant(p).total; const rec = D.recettes.filter((r) => r.participant === p.id); return {
      Cohorte: p.cohorte, Nom: p.nom, Prénom: p.prenom, Statut: p.statut, "E-mail": p.email, Téléphone: p.telephone, "CIN / passeport": p.cin, "Date de naissance": p.date_naissance || "", Adresse: p.adresse, Organisation: p.organisation, Fonction: p.fonction, "Dernier diplôme": p.diplome,
      Financement: p.financement, "Frais (MAD)": p.frais, "Remise (MAD)": p.remise, "Net (MAD)": (p.frais || 0) - (p.remise || 0), "Pris en charge (MAD)": p.prise_en_charge, "Reste à charge (MAD)": Math.max(0, (p.frais || 0) - (p.remise || 0) - (p.prise_en_charge || 0)), "Organisme financeur": p.financeur, "Contact financeur": p.financeur_contact, "Convention signée": p.convention ? "Oui" : "Non",
      "Facturé (MAD)": sum(rec, (r) => r.montant_facture), "Encaissé (MAD)": sum(rec, (r) => r.montant_encaisse), "Reste à encaisser (MAD)": sum(rec, (r) => r.montant_facture - r.montant_encaisse),
      "Présence (%)": t.tenues ? Math.round((t.pres / t.tenues) * 100) : "", "Heures présentes": t.pres, "Heures tenues": t.tenues, "Statut dossier": p.statut_dossier, "Nb documents": D.documents.filter((d) => d.participant === p.id).length, Notes: p.notes }; });
    const ids = new Set(parts.map((p) => p.id));
    const docs = D.documents.filter((d) => ids.has(d.participant)).map((d) => { const p = pById(d.participant); return { Cohorte: p?.cohorte, Participant: p ? pn(p) : "", Type: d.type, Fichier: d.nom, "Taille (Ko)": Math.round(d.taille / 1024), "Ajouté le": d.ajoute_le.slice(0, 10), "Ajouté par": d.ajoute_par, Notes: d.notes }; });
    const recs = D.recettes.filter((r) => ids.has(r.participant)).map((r) => { const p = pById(r.participant); return { Cohorte: r.cohorte, Participant: p ? pn(p) : "", Date: r.date, Payeur: r.payeur, Type: r.type, Objet: r.objet, Facture: r.facture, "Facturé (MAD)": r.montant_facture, "Encaissé (MAD)": r.montant_encaisse, Échéance: r.echeance || "", Statut: recStatut(r)[0] }; });
    return { fiche, docs, recs };
  }
  A.exportDossiers = () => {
    const parts = D.participants.filter(inScope); const { fiche, docs, recs } = dossierRows(parts);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fiche), "Dossiers"); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recs.length ? recs : [{}]), "Financement");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docs.length ? docs : [{}]), "Documents");
    download(`dossiers_${S.cohorte}_${today()}.xlsx`, new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })]));
  };
  A.exportDossier = (d) => {
    const p = pById(d.id); const { fiche, docs, recs } = dossierRows([p]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Object.entries(fiche[0])), "Dossier"); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recs.length ? recs : [{}]), "Financement");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docs.length ? docs : [{}]), "Documents");
    const ems = D.emargements.filter((e) => e.cohorte === p.cohorte && e.date && e.date <= today()).map((e) => ({ Date: e.date, "Demi-journée": e.demi, Certificat: e.certificat, Heures: heuresEm(e.id), Statut: D.presences.find((x) => x.emargement === e.id && x.participant === p.id)?.statut || (heuresEm(e.id) ? "Absent" : "") }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ems.length ? ems : [{}]), "Présences");
    download(`dossier_${norm(p.nom + "_" + p.prenom).replace(/ /g, "_")}_${today()}.xlsx`, new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })]));
  };
  A.addD = async () => { const v = await openForm({ title: "Nouvelle dépense", fields: depenseFields() }); if (v) await write("depenses", "insert", v); };
  A.editD = async (d) => {
    const x = D.depenses.find((r) => r.id === d.id); const v = await openForm({ title: "Modifier la dépense", fields: depenseFields(x), danger: "Supprimer" });
    if (v === "__danger__") { if (await confirmDlg("Supprimer cette dépense ?")) await write("depenses", "delete", null, x.id); } else if (v) await write("depenses", "update", v, x.id);
  };
  const recetteForm = (title, r) => openForm({ title, fields: recetteFields(r), danger: r && r.id ? "Supprimer" : null, onOpen: (f) => { f.elements.participant.onchange = () => { const p = pById(f.elements.participant.value); if (p && !f.elements.payeur.value) f.elements.payeur.value = `${p.prenom} ${p.nom}`; }; } });
  A.addR = async () => { const v = await recetteForm("Nouvelle recette"); if (v) { v.participant ||= null; await write("recettes", "insert", v); } };
  A.editR = async (d) => {
    const x = D.recettes.find((r) => r.id === d.id); const v = await recetteForm("Modifier la recette", x);
    if (v === "__danger__") { if (await confirmDlg("Supprimer cette recette ?")) await write("recettes", "delete", null, x.id); } else if (v) { v.participant ||= null; await write("recettes", "update", v, x.id); }
  };
  A.genFrais = async () => {
    const parts = D.participants.filter(inScope).filter((p) => p.statut !== "Abandon" && (p.frais || 0) - (p.remise || 0) > 0 && !D.recettes.some((r) => r.participant === p.id));
    if (!parts.length) return toast("Tous les participants avec des frais ont déjà une recette.");
    if (!(await confirmDlg(`Créer ${parts.length} recette(s) « Frais d'inscription » (type Participant ou Entreprise selon le financement) pour les participants sans recette ?`, "Créer"))) return;
    await write("recettes", "insert", parts.map((p) => ({ date: today(), cohorte: p.cohorte, participant: p.id, payeur: p.financement === "Entreprise" ? p.organisation || `${p.prenom} ${p.nom}` : `${p.prenom} ${p.nom}`, type: p.financement === "Entreprise" ? "Entreprise" : p.financement === "Bourse" ? "Subvention" : "Participant", objet: "Frais d'inscription", montant_facture: (p.frais || 0) - (p.remise || 0), montant_encaisse: 0 })));
    toast(`${parts.length} recette(s) créée(s)`);
  };
  A.editS = async (d) => {
    const s = D.seances.find((x) => x.id === d.id);
    const v = await openForm({ title: `Séance ${s.id}`, fields: [
      { k: "cours", label: "Intitulé du cours", value: s.cours, full: true }, { k: "intervenant", label: "Intervenant", value: s.intervenant },
      { k: "statut", label: "Statut", type: "select", options: STATUTS_S, value: s.statut }, { k: "duree", label: "Durée (h)", type: "number", value: s.duree, step: "0.25" },
      { k: "certificat", label: "Certificat", type: "select", options: Object.entries(D.cfg.certificats).map(([k, l]) => [k, `${k} · ${l}`]), value: s.certificat },
    ] });
    if (v) await write("seances", "update", v, s.id);
  };
  A.editDay = async (d) => {
    const rows = D.seances.filter((s) => s.cohorte === d.coh && s.jour === +d.jour), s0 = rows[0];
    const v = await openForm({ title: `Jour ${d.jour} · ${d.coh}`, intro: "La date, le certificat et l'intervenant s'appliquent à toutes les séances et demi-journées de ce jour.", fields: [
      { k: "date", label: "Date", type: "date", value: s0.date || "" }, { k: "certificat", label: "Certificat", type: "select", options: Object.entries(D.cfg.certificats).map(([k, l]) => [k, `${k} · ${l}`]), value: s0.certificat },
      { k: "intervenant", label: "Intervenant (laisser vide pour ne pas changer)", value: "" }, { k: "statut", label: "Statut des séances", type: "select", options: [["", "— inchangé —"], ...STATUTS_S], value: "" },
    ], danger: "Supprimer la journée" });
    if (v === "__danger__") {
      if (!(await confirmDlg(`Supprimer le jour ${d.jour} (${rows.length} séances, demi-journées et présences associées) ?`))) return;
      const emIds = uniq(rows.map((r) => r.emargement).filter(Boolean));
      await sb.from("seances").delete().in("id", rows.map((r) => r.id));
      if (emIds.length) await sb.from("emargements").delete().in("id", emIds);
      await reload("seances"); await reload("emargements"); await reload("presences"); return;
    }
    if (!v) return;
    const upd = { date: v.date || null, certificat: v.certificat }; if (v.intervenant) upd.intervenant = v.intervenant; if (v.statut) upd.statut = v.statut;
    await sb.from("seances").update(upd).eq("cohorte", d.coh).eq("jour", +d.jour);
    const updEm = { date: v.date || null, certificat: v.certificat }; if (v.intervenant) updEm.intervenant = v.intervenant;
    await sb.from("emargements").update(updEm).eq("cohorte", d.coh).eq("jour", +d.jour);
    await reload("seances"); await reload("emargements"); toast("Journée mise à jour");
  };
  A.addDay = async () => {
    const coh = S.cohorte; const max = Math.max(0, ...D.seances.filter((s) => s.cohorte === coh).map((s) => s.jour));
    const v = await openForm({ title: `Nouvelle journée · ${coh}`, fields: [
      { k: "date", label: "Date", type: "date", value: "" }, { k: "certificat", label: "Certificat", type: "select", options: Object.entries(D.cfg.certificats).map(([k, l]) => [k, `${k} · ${l}`]), value: D.seances.filter((s) => s.cohorte === coh).at(-1)?.certificat || "C1" },
      { k: "intervenant", label: "Intervenant", value: "" }, { k: "n", label: "Nombre de créneaux", type: "select", options: [["4", "4 (journée complète)"], ["2", "2 (samedi matin)"]], value: "4" },
      { k: "cours", label: "Intitulé (appliqué à tous les créneaux, modifiable ensuite)", value: "", full: true },
    ], submit: "Créer" });
    if (!v) return;
    const j = max + 1, J = `${coh}-J${String(j).padStart(2, "0")}`, n = +v.n;
    const ems = [{ id: `${J}-AM`, cohorte: coh, certificat: v.certificat, jour: j, date: v.date || null, demi: "AM", code: rand4(), intervenant: v.intervenant }];
    if (n === 4) ems.push({ ...ems[0], id: `${J}-PM`, demi: "PM", code: rand4() });
    const ss = Array.from({ length: n }, (_, i) => ({ id: `${J}-S${i + 1}`, cohorte: coh, certificat: v.certificat, jour: j, date: v.date || null, creneau: `S${i + 1}`, duree: 1.5, cours: v.cours, intervenant: v.intervenant, statut: "Planifié", emargement: i < 2 ? `${J}-AM` : `${J}-PM` }));
    await write("emargements", "insert", ems); await write("seances", "insert", ss); toast(`Jour ${j} créé`);
  };
  A.editEm = async (d) => {
    const e = D.emargements.find((x) => x.id === d.id);
    const v = await openForm({ title: `Demi-journée ${e.id}`, fields: [
      { k: "code", label: "Code de séance (4 chiffres)", value: e.code, attrs: 'pattern="[0-9]{4}" maxlength="4"', help: "Changer le code invalide la slide déjà envoyée à l'intervenant." },
      { k: "intervenant", label: "Intervenant", value: e.intervenant }, { k: "ouvert", label: "Pointage ouvert quelle que soit la date", type: "checkbox", value: e.ouvert },
    ] });
    if (v) await write("emargements", "update", v, e.id);
  };
  A.addCohorte = async () => {
    const next = "C" + (Math.max(0, ...D.cohortes.map((c) => parseInt(c.id.replace(/\D/g, ""), 10) || 0)) + 1);
    const y = new Date().getFullYear();
    const v = await openForm({ title: "Nouvelle cohorte", intro: "En choisissant une cohorte modèle, son planning (certificats, journées, créneaux, intitulés, intervenants) est répliqué sans dates et avec de nouveaux codes de séance. Les participants, présences et finances ne sont pas copiés.", fields: [
      { k: "id", label: "Identifiant court", value: next, required: true, attrs: 'pattern="[A-Za-z0-9_-]{1,12}"', help: "Ex. C5. Sert de préfixe aux séances (C5-J01-S1)." },
      { k: "libelle", label: "Libellé", value: `Cohorte ${next.replace(/\D/g, "")} (${y}-${y + 2})`, required: true },
      { k: "debut", label: "Début", type: "date", value: "" }, { k: "fin", label: "Fin", type: "date", value: "" },
      { k: "modele", label: "Répliquer le planning de", type: "select", options: [["", "— aucune (cohorte vide) —"], ...D.cohortes.map((c) => [c.id, `${c.libelle} · ${D.seances.filter((s) => s.cohorte === c.id).length} séances`])], value: D.cohortes.at(-1)?.id || "", full: true },
      { k: "intervenants", label: "Conserver les intervenants du modèle", type: "checkbox", value: true },
    ], submit: "Créer la cohorte" });
    if (!v) return;
    const id = v.id.trim().toUpperCase();
    if (D.cohortes.some((c) => c.id === id)) return toast(`La cohorte ${id} existe déjà`, true);
    const { error } = await sb.from("cohortes").insert({ id, libelle: v.libelle.trim(), debut: v.debut || null, fin: v.fin || null });
    if (error) return toast(error.message, true);
    if (v.modele) {
      const re = new RegExp("^" + v.modele + "-");
      const ems = D.emargements.filter((e) => e.cohorte === v.modele).map((e) => ({ id: e.id.replace(re, id + "-"), cohorte: id, certificat: e.certificat, jour: e.jour, date: null, demi: e.demi, code: rand4(), intervenant: v.intervenants ? e.intervenant : "", ouvert: false }));
      const ss = D.seances.filter((s) => s.cohorte === v.modele).map((s) => ({ id: s.id.replace(re, id + "-"), cohorte: id, certificat: s.certificat, jour: s.jour, date: null, creneau: s.creneau, duree: s.duree, cours: s.cours, intervenant: v.intervenants ? s.intervenant : "", statut: "Planifié", emargement: s.emargement ? s.emargement.replace(re, id + "-") : null }));
      for (let i = 0; i < ems.length; i += 200) { const { error: e1 } = await sb.from("emargements").insert(ems.slice(i, i + 200)); if (e1) return toast(e1.message, true); }
      for (let i = 0; i < ss.length; i += 200) { const { error: e2 } = await sb.from("seances").insert(ss.slice(i, i + 200)); if (e2) return toast(e2.message, true); }
    }
    await loadAll(); S.cohorte = id; $("#cohorte").value = id; S.ui.em = null; setView("seances");
    toast(`Cohorte ${id} créée${v.modele ? ` à partir de ${v.modele} : renseignez les dates journée par journée` : ""}`);
  };
  A.editCohorte = async (d) => {
    const c = D.cohortes.find((x) => x.id === d.id);
    const v = await openForm({ title: `Cohorte ${c.id}`, fields: [
      { k: "libelle", label: "Libellé", value: c.libelle, required: true, full: true }, { k: "debut", label: "Début", type: "date", value: c.debut || "" }, { k: "fin", label: "Fin", type: "date", value: c.fin || "" },
    ], danger: "Supprimer la cohorte" });
    if (v === "__danger__") {
      const n = D.participants.filter((p) => p.cohorte === c.id).length + D.recettes.filter((r) => r.cohorte === c.id).length;
      if (n) return toast(`Impossible : ${n} participant(s) ou recette(s) sont rattachés à ${c.id}. Supprimez-les ou réaffectez-les d'abord.`, true);
      if (!(await confirmDlg(`Supprimer la cohorte ${c.id} et tout son planning (${D.seances.filter((s) => s.cohorte === c.id).length} séances) ?`))) return;
      await sb.from("presences").delete().in("emargement", D.emargements.filter((e) => e.cohorte === c.id).map((e) => e.id));
      await sb.from("seances").delete().eq("cohorte", c.id); await sb.from("emargements").delete().eq("cohorte", c.id); await sb.from("depenses").delete().eq("cohorte", c.id);
      const { error } = await sb.from("cohortes").delete().eq("id", c.id); if (error) return toast(error.message, true);
      S.cohorte = "all"; await loadAll(); render(); toast(`Cohorte ${c.id} supprimée`); return;
    }
    if (!v) return;
    const { error } = await sb.from("cohortes").update({ libelle: v.libelle.trim(), debut: v.debut || null, fin: v.fin || null }).eq("id", c.id); if (error) return toast(error.message, true);
    await loadAll(); render(); toast("Cohorte mise à jour");
  };
  A.toggleOpen = async (d) => { const e = D.emargements.find((x) => x.id === d.id); await write("emargements", "update", { ouvert: !e.ouvert }, e.id); };
  A.mark = async (d) => { await write("presences", "upsert", { emargement: S.ui.em, participant: d.p, statut: d.st, source: "manuel", horodatage: new Date().toISOString() }, "emargement,participant"); };
  A.markAll = async (d) => {
    const em = D.emargements.find((e) => e.id === S.ui.em); const parts = D.participants.filter((p) => p.cohorte === em.cohorte && p.statut === "Actif");
    const done = new Set(D.presences.filter((p) => p.emargement === em.id).map((p) => p.participant));
    const rows = parts.filter((p) => d.st === "Présent" || !done.has(p.id)).map((p) => ({ emargement: em.id, participant: p.id, statut: d.st, source: "manuel", horodatage: new Date().toISOString() }));
    if (!rows.length) return toast("Rien à modifier");
    if (!(await confirmDlg(`Marquer ${rows.length} participant(s) « ${d.st} » pour ${em.id} ?`, "Confirmer"))) return;
    await write("presences", "upsert", rows, "emargement,participant");
  };
  A.importCsv = async () => {
    const v = await openForm({ title: "Importer des présences", intro: "Collez un CSV avec en-tête. Colonnes reconnues : <b>nom</b> (ou name / student), <b>date</b> (JJ/MM/AAAA ou AAAA-MM-JJ), <b>statut</b> (présent / absent / excusé, ou present / absent / late de Canvas Roll Call), et facultativement <b>emargement</b> (ex. C4-J01-AM) ou <b>demi</b> (AM / PM). Sans demi-journée, la présence est appliquée au matin et à l'après-midi de la date.", fields: [
      { k: "coh", label: "Cohorte", type: "select", options: D.cohortes.map((c) => [c.id, c.libelle]), value: S.cohorte !== "all" ? S.cohorte : D.cohortes.at(-1)?.id },
      { k: "csv", label: "Contenu CSV", type: "textarea", value: "", full: true }, { k: "fichier", label: "ou choisir un fichier", type: "file", attrs: 'accept=".csv,text/csv"' },
    ], submit: "Analyser", onOpen: (f) => { f.elements.fichier.onchange = () => { const fl = f.elements.fichier.files[0]; if (fl) fl.text().then((t) => (f.elements.csv.value = t)); }; } });
    if (!v || !v.csv.trim()) return;
    const rows = parseCsv(v.csv); if (rows.length < 2) return toast("CSV vide ou sans en-tête", true);
    const H = rows[0].map(norm); const col = (re) => H.findIndex((h) => re.test(h));
    const iN = col(/^(nom|name|student|participant|etudiant)/), iD = col(/date/), iS = col(/statut|status|attendance|presence/), iE = col(/emargement|seance|session/), iH = col(/^demi|periode|moment/), iP = col(/^prenom|first/);
    if (iN < 0) return toast("Colonne nom introuvable", true);
    const parts = D.participants.filter((p) => p.cohorte === v.coh), ems = D.emargements.filter((e) => e.cohorte === v.coh);
    const idx = {}; parts.forEach((p) => { idx[norm(p.nom + " " + p.prenom)] = p; idx[norm(p.prenom + " " + p.nom)] = p; });
    const toIso = (s) => { const m = String(s).match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; const m2 = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); return m2 ? m2[0] : ""; };
    const toSt = (s) => { const x = norm(s); if (!x || /^(p|present|oui|yes|1|late|retard|tardy)/.test(x)) return "Présent"; if (/^(a|absent|non|no|0|unmarked)/.test(x)) return "Absent"; if (/exc/.test(x)) return "Excusé"; return "Présent"; };
    const out = [], inconnus = new Set(), sansEm = new Set();
    rows.slice(1).forEach((r) => {
      if (!r.length || !r[iN]) return;
      const nomComplet = iP >= 0 ? r[iN] + " " + r[iP] : r[iN]; const p = idx[norm(nomComplet)] || Object.entries(idx).find(([k]) => k === norm(nomComplet).split(" ").reverse().join(" "))?.[1];
      if (!p) { inconnus.add(nomComplet); return; }
      let targets = [];
      if (iE >= 0 && r[iE]) targets = ems.filter((e) => e.id.toUpperCase() === r[iE].trim().toUpperCase());
      else if (iD >= 0) { const d = toIso(r[iD]); targets = ems.filter((e) => e.date === d && (iH < 0 || !r[iH] || e.demi === r[iH].trim().toUpperCase().replace("MATIN", "AM").replace(/APRES.*/, "PM"))); }
      if (!targets.length) { sansEm.add(r[iE >= 0 ? iE : iD] || "?"); return; }
      targets.forEach((e) => out.push({ emargement: e.id, participant: p.id, statut: iS >= 0 ? toSt(r[iS]) : "Présent", source: "import", horodatage: new Date().toISOString() }));
    });
    const ok = await confirmDlg(`${out.length} présence(s) prête(s) à importer pour ${uniq(out.map((o) => o.emargement)).length} demi-journée(s).` + (inconnus.size ? ` Noms non reconnus (ignorés) : ${[...inconnus].slice(0, 8).join(", ")}${inconnus.size > 8 ? "…" : ""}.` : "") + (sansEm.size ? ` Dates/séances sans correspondance : ${[...sansEm].slice(0, 6).join(", ")}.` : ""), "Importer");
    if (!ok || !out.length) return;
    const seen = new Set(); const dedup = out.filter((o) => { const k = o.emargement + o.participant; if (seen.has(k)) return false; seen.add(k); return true; });
    await write("presences", "upsert", dedup, "emargement,participant"); toast(`${dedup.length} présence(s) importée(s)`);
  };
  A.saveCfg = async () => {
    const counts = {}; const check = $("#cfg_check").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(avant|pendant|apres|après)\s*\|\s*(.+)$/i); if (!m) return null; const ph = m[1].toLowerCase().replace("après", "apres"); counts[ph] = (counts[ph] || 0) + 1; return { id: ph + counts[ph], phase: ph, libelle: m[2].trim() }; }).filter(Boolean);
    const rows = [{ cle: "checkin_url", valeur: $("#cfg_url").value.trim() }, { cle: "seuil_presence", valeur: Number($("#cfg_seuil").value) || 70 }, { cle: "categories_depenses", valeur: $("#cfg_cats").value.split("\n").map((s) => s.trim()).filter(Boolean) }, { cle: "checklist", valeur: check }];
    const { error } = await sb.from("config").upsert(rows, { onConflict: "cle" }); if (error) return toast(error.message, true);
    await reload("config"); toast("Paramètres enregistrés");
  };
  A.mailText = () => { const ems = D.emargements.filter(inScope).filter((e) => e.intervenant === S.ui.interv && (S.ui.kitAll || !e.date || e.date >= today())); copy(mailText(S.ui.interv, ems), "Texte du mail copié"); };
  A.dlOne = async (d) => { const em = D.emargements.find((e) => e.id === d.em); download(`emargement_${em.id}.png`, await slideBlob(em)); };
  A.dlAll = async () => { const ids = $$("canvas[data-slide]").map((c) => c.dataset.slide); for (const id of ids) { await A.dlOne({ em: id }); await new Promise((r) => setTimeout(r, 400)); } };
  A.exportCsv = (d) => {
    const rows = D[d.table].filter((r) => d.table === "seances" || d.table === "participants" || d.table === "depenses" || d.table === "recettes" ? inScope(r) : true);
    const cols = uniq(rows.flatMap(Object.keys)); const csv = [cols.join(";"), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
    download(`${d.table}_${today()}.csv`, new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  };
  A.exportJson = () => download(`sauvegarde_master_exec_${today()}.json`, new Blob([JSON.stringify({ exporte_le: new Date().toISOString(), cohortes: D.cohortes, participants: D.participants, seances: D.seances, emargements: D.emargements, presences: D.presences, depenses: D.depenses, recettes: D.recettes, config: D.config }, null, 1)], { type: "application/json" }));
  A.exportTaux = () => {
    const certs = Object.keys(D.cfg.certificats); const parts = D.participants.filter(inScope);
    const rows = parts.map((p) => { const t = tauxParticipant(p); const o = { Nom: p.nom, Prénom: p.prenom, Cohorte: p.cohorte, Statut: p.statut }; certs.forEach((c) => { const x = t.parCert[c]; o[c] = x && x.tenues ? Math.round((x.pres / x.tenues) * 100) / 100 : null; }); o["Global"] = t.total.tenues ? Math.round((t.total.pres / t.total.tenues) * 100) / 100 : null; o["Heures présentes"] = t.total.pres; o["Heures tenues"] = t.total.tenues; return o; });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Taux de présence");
    download(`taux_presence_${S.cohorte}_${today()}.xlsx`, new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })]));
  };
  A.exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const { cols, lignes } = pnlData();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Compte de résultat", ...cols, "Total"], ...lignes.map((L) => [L.l, ...L.v.map((v) => v == null ? "" : L.pct ? Math.round(v * 1000) / 1000 : Math.round(v)), L.pct || L.l.includes("/ participant") ? "" : Math.round(sum(L.v))])]), "P&L");
    const pn = Object.fromEntries(D.participants.map((p) => [p.id, pName(p)]));
    const dr = dossierRows(D.participants);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dr.fiche), "Participants");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dr.docs.length ? dr.docs : [{}]), "Documents");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.recettes.map(({ id, participant, ...r }) => ({ ...r, participant: pn[participant] || "", statut: recStatut({ ...r })[0] }))), "Recettes");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.depenses.map(({ id, ...d }) => d)), "Dépenses");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.seances), "Séances");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.emargements.map(({ code, ...e }) => e)), "Demi-journées");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.presences.map(({ id, participant, ...p }) => ({ ...p, participant: pn[participant] || "" }))), "Présences");
    download(`master_exec_gestion_${today()}.xlsx`, new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })]));
  };
  function parseCsv(text) {
    const sep = (text.split("\n")[0].match(/;/g) || []).length >= (text.split("\n")[0].match(/,/g) || []).length ? ";" : (text.split("\n")[0].includes("\t") ? "\t" : ",");
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }

  /* ---------- Rendu & navigation ---------- */
  function setView(v) { S.view = v; try { localStorage.setItem("me_view_" + SPACE, v); } catch (_) {} render(); }
  function render() {
    $$("#nav button").forEach((b) => { b.hidden = b.dataset.role === "admin" && !isAdmin(); b.classList.toggle("active", b.dataset.view === S.view); });
    $$("[data-role=admin]:not(button)").forEach((el) => (el.hidden = !isAdmin()));
    if (!isAdmin() && $(`#nav button[data-view="${S.view}"]`)?.dataset.role === "admin") S.view = "prof";
    try { $("#view").innerHTML = views[S.view](); } catch (e) { console.error(e); $("#view").innerHTML = `<div class="empty">Erreur d'affichage : ${esc(e.message)}</div>`; }
    const q = $("#view input[type=search]"); if (q && S.ui.focusSearch) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); S.ui.focusSearch = false; }
  }
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    e.preventDefault(); const fn = A[el.dataset.act]; if (!fn) return;
    el.disabled = true; try { await fn(el.dataset, el); } catch (err) { console.error(err); } finally { el.disabled = false; }
  });
  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-ui]"); if (!el) return;
    S.ui[el.dataset.ui] = el.type === "checkbox" ? el.checked : el.value;
    if (el.type === "search") { S.ui.focusSearch = true; clearTimeout(S.ui.t); S.ui.t = setTimeout(render, 150); } else render();
  });
  $("#nav").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) setView(b.dataset.view); });
  $("#cohorte").addEventListener("change", (e) => { S.cohorte = e.target.value; S.ui.em = null; S.ui.interv = ""; try { localStorage.setItem("me_cohorte", S.cohorte); } catch (_) {} render(); });
  $("#reload").addEventListener("click", async () => { await loadAll(); render(); toast("Données actualisées"); });
  $("#logout").addEventListener("click", () => sb.auth.signOut());

  /* ---------- Authentification ---------- */
  async function start(session) {
    $("#login").hidden = !!session; $("#app").hidden = !session;
    if (!session) return;
    $("#who").textContent = session.user.email;
    try {
      /* Rôle : lecture du profil ; sur une base vide, le premier compte connecté devient équipe. */
      let { data: prof } = await sb.from("profils").select("*").ilike("email", session.user.email).maybeSingle();
      if (!prof) {
        /* Étudiant : une fiche participant porte cette adresse (RLS ne renvoie que la sienne). */
        const { data: fiche } = await sb.from("participants").select("id,nom,prenom,email,cohorte").ilike("email", session.user.email).maybeSingle();
        if (fiche) prof = { email: session.user.email, nom: `${fiche.prenom} ${fiche.nom}`.trim(), role: "etudiant", intervenant: "" };
      }
      if (!prof) {
        const { data: created } = await sb.from("profils").insert({ email: session.user.email.toLowerCase(), nom: session.user.email.split("@")[0], role: "admin" }).select().maybeSingle();
        prof = created || null;
      }
      if (!prof) { $("#view").innerHTML = `<div class="empty"><strong>Aucun rôle n'est attribué à ${esc(session.user.email)}.</strong><br>Demandez à l'équipe du programme de déclarer votre compte (Paramètres → Comptes &amp; rôles) ou d'enregistrer votre adresse sur votre fiche participant.</div>`; $("#nav").hidden = true; $(".topbar").hidden = true; return; }
      S.me = prof; S.role = prof.role;
      const PAGE = { admin: "admin.html", intervenant: "prof.html", etudiant: "etudiant.html" };
      const allowed = S.role === "admin" || (S.role === "intervenant" && SPACE === "prof") || (S.role === "etudiant" && SPACE === "etudiant");
      if (!allowed) { location.replace(PAGE[S.role]); return; }
      if (isEtudiant()) $(".topbar .scope").hidden = true;
      $("#who").textContent = `${prof.nom || session.user.email} · ${{ admin: "équipe", intervenant: "intervenant", etudiant: "participant" }[S.role]}`;
      await loadAll();
      try { const c = localStorage.getItem("me_cohorte"); if (c && (c === "all" || D.cohortes.some((x) => x.id === c))) { S.cohorte = c; $("#cohorte").value = c; } S.view = localStorage.getItem("me_view_" + SPACE) || HOME[SPACE]; } catch (_) {}
      if (isEtudiant()) S.cohorte = "all";
      if (!views[S.view]) S.view = HOME[SPACE];
      render();
    } catch (e) { $("#view").innerHTML = `<div class="empty">Impossible de charger les données : ${esc(e.message)}.<br>Vérifiez que supabase/schema.sql a été exécuté.</div>`; }
  }
  if (!sb) { $("#login").hidden = false; $("#configWarn").hidden = false; $("#loginForm").hidden = true; return; }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#loginErr").hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
    if (error) { $("#loginErr").textContent = /Invalid/i.test(error.message) ? "E-mail ou mot de passe incorrect." : error.message; $("#loginErr").hidden = false; }
  });
  /* Création de compte (espace étudiant / intervenant) : acceptée seulement pour une adresse connue, contrôle fait en base. */
  const su = $("#signupForm");
  if (su) {
    $("#showSignup")?.addEventListener("click", (e) => { e.preventDefault(); su.hidden = false; $("#loginForm").hidden = true; });
    $("#showLogin")?.addEventListener("click", (e) => { e.preventDefault(); su.hidden = true; $("#loginForm").hidden = false; });
    su.addEventListener("submit", async (e) => {
      e.preventDefault(); const msg = $("#signupMsg"); msg.hidden = true;
      const { data, error } = await sb.auth.signUp({ email: $("#suEmail").value.trim(), password: $("#suPassword").value });
      if (error) { msg.className = "err small"; msg.textContent = /non reconnue|Database error/i.test(error.message) ? "Adresse e-mail non reconnue : utilisez l'adresse communiquée à l'équipe du programme." : error.message; msg.hidden = false; return; }
      msg.className = "small"; msg.style.color = "var(--ok)"; msg.textContent = data.session ? "Compte créé, connexion en cours…" : "Compte créé. Un e-mail de confirmation vous a été envoyé : cliquez sur le lien, puis connectez-vous."; msg.hidden = false;
    });
  }
  sb.auth.onAuthStateChange((_ev, session) => start(session));
  sb.auth.getSession().then(({ data }) => start(data.session));
})();
