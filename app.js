/* ============================================================
   WING WAH PLATEFORME — app.js (complet)
   Noyau + Configuration + R1 Passation + R2 Pressions
   ============================================================ */

/* ---------- 1. CONFIGURATION PAR DÉFAUT ---------- */
const CONFIG_DEFAUT = {
  plateforme: "",
  puits: [],          // { nom, manos: {tubing,casing,ligne} }
  agents: [],
  equipements: [],    // séparateur, manifolds...
  cuvesActives: false,
  cuves: [],          // { nom:"#1", constante }
  regle: { debut: 20, fin: 50 },
  kHuile: 38400,
  alertesActives: true,
  seuilOrange: 20,
  seuilRouge: 40,
  delaiCorrection: 60,        // minutes (RG-2)
  motDePasseCentrale: "",     // RG-3
  heureAlerteRegistre: "21:00",
  departements: ["Production","Maintenance","HSE","Logistique"],
  motifsAcces: ["Intervention/anomalie","Maintenance","Inspection",
                "Chargement brut","Ramassage documents","Livraison",
                "Visite officielle","Autre"],
  dictionnaireLocal: []
};

/* ---------- 2. ÉTAT GLOBAL + SAUVEGARDE AUTO (RG-5) ---------- */
let ETAT = {
  config: JSON.parse(JSON.stringify(CONFIG_DEFAUT)),
  brouillons: {},
  envois: []
};

function sauvegarder() {
  localStorage.setItem("wingwah_etat", JSON.stringify(ETAT));
  const info = document.getElementById("autosave-info");
  if (info) {
    const h = new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
    info.textContent = "💾 Brouillon sauvegardé automatiquement " + h;
  }
}
function charger() {
  const brut = localStorage.getItem("wingwah_etat");
  if (brut) { try { ETAT = JSON.parse(brut); } catch(e) {} }
}

/* ---------- 3. NAVIGATION ---------- */
function ouvrirEcran(id) {
  document.querySelectorAll(".ecran").forEach(e => e.classList.remove("actif"));
  document.getElementById(id).classList.add("actif");
  window.scrollTo(0,0);
  if (id === "config") afficherConfig();
  if (id === "historique") afficherHistorique();
  if (id === "r1") afficherR1();
  if (id === "r2") afficherR2();
}

/* ---------- 4. OUTILS DATE / IDENTIFIANTS (RG-1) ---------- */
function dateDuJour() { return new Date().toLocaleDateString("fr-FR"); }

function numeroUnique(type) {
  const p = (ETAT.config.plateforme || "XXXX").replace(/[^A-Za-z0-9]/g,"").toUpperCase();
  const d = new Date();
  const stamp = d.getFullYear()
    + String(d.getMonth()+1).padStart(2,"0")
    + String(d.getDate()).padStart(2,"0")
    + "-" + String(d.getHours()).padStart(2,"0")
    + String(d.getMinutes()).padStart(2,"0");
  return p + "-" + type + "-" + stamp;
}

/* ---------- 5. ENVOI + FENÊTRE DE CORRECTION 1H (RG-2) ---------- */
function transmettreRapport(type, titre, donnees, signatureDataURL, destinataire) {
  const rapport = {
    id: numeroUnique(type),
    type: type,
    titre: titre,
    donnees: donnees,
    plateforme: ETAT.config.plateforme,
    agent: donnees.agent || ETAT.config.agents[0] || "",
    destinataire: destinataire || "CENTRALE",
    signature: signatureDataURL,
    envoyeLe: Date.now(),
    supprime: false
  };
  ETAT.envois.unshift(rapport);
  sauvegarder();
  return rapport;
}
function minutesRestantes(rapport) {
  const delai = ETAT.config.delaiCorrection * 60000;
  return Math.max(0, Math.ceil((rapport.envoyeLe + delai - Date.now()) / 60000));
}
function estVerrouille(rapport) { return minutesRestantes(rapport) <= 0; }

/* ---------- 6. MODALE ---------- */
function ouvrirModale(html) {
  document.getElementById("modale-contenu").innerHTML = html;
  document.getElementById("modale").classList.remove("modale-cache");
}
function fermerModale() {
  document.getElementById("modale").classList.add("modale-cache");
}

/* ---------- 7. MOT DE PASSE CENTRALE (RG-3) ---------- */
let accesCentraleCallback = null;
function verifierAccesCentrale(actionApresSucces) {
  accesCentraleCallback = actionApresSucces;
  ouvrirModale(`
    <h3>🔒 Accès réservé Centrale</h3>
    <label class="champ">Mot de passe centrale :
      <input type="password" id="mdp-centrale">
    </label>
    <div class="btn-ligne">
      <button class="btn btn-gris" onclick="fermerModale()">Annuler</button>
      <button class="btn btn-bleu" onclick="controleMotDePasse()">Valider</button>
    </div>
  `);
}
function controleMotDePasse() {
  const saisi = document.getElementById("mdp-centrale").value;
  if (saisi && saisi === ETAT.config.motDePasseCentrale) {
    fermerModale();
    if (accesCentraleCallback) accesCentraleCallback();
  } else {
    alert("❌ Mot de passe incorrect.");
  }
}

/* ---------- 8. SIGNATURE MANUELLE (RG-7) ---------- */
let signatureCallback = null;
let sigCtx = null, sigTrace = false;

function demanderSignature(titre, callback) {
  signatureCallback = callback;
  ouvrirModale(`
    <h3>✍️ Signature — ${titre}</h3>
    <p style="color:var(--gris);margin-bottom:8px">Signez au doigt dans le cadre :</p>
    <canvas id="zone-signature" width="360" height="180"></canvas>
    <div class="btn-ligne">
      <button class="btn btn-gris" onclick="effacerSignature()">🧹 Effacer</button>
      <button class="btn btn-vert" onclick="validerSignature()">✅ Valider</button>
    </div>
    <button class="btn btn-gris" onclick="fermerModale()">Annuler</button>
  `);
  initialiserCanvasSignature();
}
function initialiserCanvasSignature() {
  const c = document.getElementById("zone-signature");
  sigCtx = c.getContext("2d");
  sigCtx.lineWidth = 3;
  sigCtx.lineCap = "round";
  sigCtx.strokeStyle = "#0f3460";
  sigTrace = false;
  function pos(e) {
    const r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function debut(e) { sigTrace = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x,p.y); e.preventDefault(); }
  function bouge(e) { if(!sigTrace) return; const p = pos(e); sigCtx.lineTo(p.x,p.y); sigCtx.stroke(); e.preventDefault(); }
  function fin() { sigTrace = false; }
  c.onmousedown = debut; c.onmousemove = bouge; c.onmouseup = fin;
  c.ontouchstart = debut; c.ontouchmove = bouge; c.ontouchend = fin;
}
function effacerSignature() {
  const c = document.getElementById("zone-signature");
  sigCtx.clearRect(0,0,c.width,c.height);
}
function validerSignature() {
  const dataURL = document.getElementById("zone-signature").toDataURL();
  fermerModale();
  if (signatureCallback) signatureCallback(dataURL);
}

/* ---------- 9. ÉCRAN CONFIGURATION ---------- */
function afficherConfig() {
  const c = ETAT.config;
  document.getElementById("config-contenu").innerHTML = `
    <div class="carte">
      <h3>📍 Ma plateforme</h3>
      <label class="champ">Nom de la plateforme :
        <input type="text" id="cfg-plateforme" value="${c.plateforme}" placeholder="Ex : T23-36">
      </label>
      <label class="champ">Constante K huile (R3) :
        <input type="number" step="0.00001" id="cfg-khuile" value="${c.kHuile}">
      </label>
      <label class="champ">Règle séparateur — Début (cm) :
        <input type="number" id="cfg-regle-debut" value="${c.regle.debut}">
      </label>
      <label class="champ">Règle séparateur — Fin (cm) :
        <input type="number" id="cfg-regle-fin" value="${c.regle.fin}">
      </label>
    </div>

    <div class="carte">
      <h3>👷 Agents de la plateforme</h3>
      <div>${c.agents.map((a,i)=>`
        <div class="ligne-item"><span>${a}</span>
        <button class="btn btn-rouge" style="width:auto;padding:6px 12px" onclick="supprimerAgent(${i})">🗑</button></div>`).join("")}
      </div>
      <label class="champ" style="margin-top:10px">Nouvel agent :
        <input type="text" id="cfg-nouvel-agent" placeholder="Nom complet">
      </label>
      <button class="btn btn-bleu" onclick="ajouterAgent()">➕ Ajouter</button>
    </div>

    <div class="carte">
      <h3>🛢 Puits de la plateforme</h3>
      <div>${c.puits.map((p,i)=>`
        <div class="ligne-item"><span>${p.nom}</span>
        <button class="btn btn-rouge" style="width:auto;padding:6px 12px" onclick="supprimerPuits(${i})">🗑</button></div>`).join("")}
      </div>
      <label class="champ" style="margin-top:10px">Nom du puits :
        <input type="text" id="cfg-nouveau-puits" placeholder="Ex : T23-36-A">
      </label>
      <p style="font-size:0.85em;color:var(--gris)">Manomètres de ce puits (cliquer pour cocher/décocher) :</p>
      <div class="choix-groupe" id="manos-puits">
        <div class="choix selectionne" data-m="tubing">油压 Tubing</div>
        <div class="choix selectionne" data-m="casing">套压 Casing</div>
        <div class="choix selectionne" data-m="ligne">回压 Ligne</div>
      </div>
      <button class="btn btn-bleu" onclick="ajouterPuits()">➕ Ajouter le puits</button>
    </div>

    <div class="carte">
      <h3>⚙️ Équipements communs (R2)</h3>
      <div>${c.equipements.map((e,i)=>`
        <div class="ligne-item"><span>${e}</span>
        <button class="btn btn-rouge" style="width:auto;padding:6px 12px" onclick="supprimerEquipement(${i})">🗑</button></div>`).join("")}
      </div>
      <label class="champ" style="margin-top:10px">Nouvel équipement :
        <input type="text" id="cfg-nouvel-equipement" placeholder="Ex : Séparateur, Manifold Ligne 1">
      </label>
      <button class="btn btn-bleu" onclick="ajouterEquipement()">➕ Ajouter</button>
    </div>

    <div class="carte">
      <h3>🛢 Cuves de stockage</h3>
      <div class="choix-groupe">
        <div class="choix ${c.cuvesActives?'selectionne':''}" onclick="basculerCuves(true)">✅ Cette plateforme a des cuves</div>
        <div class="choix ${!c.cuvesActives?'selectionne':''}" onclick="basculerCuves(false)">❌ Pas de cuves</div>
      </div>
      <div style="display:${c.cuvesActives?'block':'none'};margin-top:10px">
        <div>${c.cuves.map((cv,i)=>`
          <div class="ligne-item"><span>Cuve ${cv.nom} — K : ${cv.constante}</span>
          <button class="btn btn-rouge" style="width:auto;padding:6px 12px" onclick="supprimerCuve(${i})">🗑</button></div>`).join("")}
        </div>
        <label class="champ" style="margin-top:10px">N° cuve (ex : #1) :
          <input type="text" id="cfg-cuve-nom" placeholder="#${c.cuves.length+1}">
        </label>
        <label class="champ">Constante de la cuve :
          <input type="number" step="0.00001" id="cfg-cuve-k" placeholder="Ex : 0.21388">
        </label>
        <button class="btn btn-bleu" onclick="ajouterCuve()">➕ Ajouter la cuve (max 20)</button>
      </div>
    </div>

    <div class="carte">
      <h3>🚨 Alertes pression (R2)</h3>
      <div class="choix-groupe">
        <div class="choix ${c.alertesActives?'selectionne':''}" onclick="basculerAlertes(true)">🟢 Activées</div>
        <div class="choix ${!c.alertesActives?'selectionne':''}" onclick="basculerAlertes(false)">⚫ Désactivées</div>
      </div>
      <label class="champ" style="margin-top:10px">Seuil 🟠 orange (%) :
        <input type="number" id="cfg-seuil-orange" value="${c.seuilOrange}">
      </label>
      <label class="champ">Seuil 🔴 rouge (%) :
        <input type="number" id="cfg-seuil-rouge" value="${c.seuilRouge}">
      </label>
    </div>

    <div class="carte">
      <h3>⏱ Fenêtre de correction (RG-2)</h3>
      <p style="color:var(--gris);font-size:0.85em">Délai actuel : <b>${c.delaiCorrection} minutes</b> — modification réservée à la centrale.</p>
      <button class="btn btn-orange" onclick="verifierAccesCentrale(modifierDelai)">🔒 Modifier le délai</button>
    </div>

    <div class="carte">
      <h3>🔐 Mot de passe centrale (RG-3)</h3>
      <p style="color:var(--gris);font-size:0.85em">${c.motDePasseCentrale ? "✅ Défini (confidentiel)" : "⚠️ Non défini — à créer par la centrale"}</p>
      <button class="btn btn-orange" onclick="definirMotDePasse()">🔑 ${c.motDePasseCentrale ? "Changer" : "Définir"} le mot de passe</button>
    </div>

    <button class="btn btn-vert" onclick="sauvegarderConfig()">💾 SAUVEGARDER LA CONFIGURATION</button>
  `;
  document.querySelectorAll("#manos-puits .choix").forEach(ch => {
    ch.onclick = function() { ch.classList.toggle("selectionne"); };
  });
}

function sauvegarderConfig() {
  const c = ETAT.config;
  c.plateforme = document.getElementById("cfg-plateforme").value.trim();
  c.kHuile = parseFloat(document.getElementById("cfg-khuile").value) || 0;
  c.regle.debut = parseFloat(document.getElementById("cfg-regle-debut").value) || 0;
  c.regle.fin = parseFloat(document.getElementById("cfg-regle-fin").value) || 50;
  c.seuilOrange = parseFloat(document.getElementById("cfg-seuil-orange").value) || 20;
  c.seuilRouge = parseFloat(document.getElementById("cfg-seuil-rouge").value) || 40;
  sauvegarder();
  rafraichirAccueil();
  alert("✅ Configuration sauvegardée !");
  ouvrirEcran("accueil");
}
function ajouterAgent() {
  const v = document.getElementById("cfg-nouvel-agent").value.trim();
  if (!v) return;
  ETAT.config.agents.push(v);
  sauvegarder(); afficherConfig();
}
function supprimerAgent(i) { ETAT.config.agents.splice(i,1); sauvegarder(); afficherConfig(); }
function ajouterPuits() {
  const nom = document.getElementById("cfg-nouveau-puits").value.trim();
  if (!nom) return;
  const manos = {};
  document.querySelectorAll("#manos-puits .choix").forEach(ch => {
    manos[ch.dataset.m] = ch.classList.contains("selectionne");
  });
  ETAT.config.puits.push({ nom: nom, manos: manos });
  sauvegarder(); afficherConfig();
}
function supprimerPuits(i) { ETAT.config.puits.splice(i,1); sauvegarder(); afficherConfig(); }
function ajouterEquipement() {
  const v = document.getElementById("cfg-nouvel-equipement").value.trim();
  if (!v) return;
  ETAT.config.equipements.push(v);
  sauvegarder(); afficherConfig();
}
function supprimerEquipement(i) { ETAT.config.equipements.splice(i,1); sauvegarder(); afficherConfig(); }
function basculerCuves(oui) {
  ETAT.config.cuvesActives = oui;
  sauvegarder(); afficherConfig(); rafraichirAccueil();
}
function ajouterCuve() {
  if (ETAT.config.cuves.length >= 20) { alert("Maximum 20 cuves."); return; }
  const nom = document.getElementById("cfg-cuve-nom").value.trim() || "#" + (ETAT.config.cuves.length + 1);
  const k = parseFloat(document.getElementById("cfg-cuve-k").value);
  if (!k) { alert("Constante obligatoire."); return; }
  ETAT.config.cuves.push({ nom: nom, constante: k });
  sauvegarder(); afficherConfig();
}
function supprimerCuve(i) { ETAT.config.cuves.splice(i,1); sauvegarder(); afficherConfig(); }
function basculerAlertes(oui) { ETAT.config.alertesActives = oui; sauvegarder(); afficherConfig(); }
function modifierDelai() {
  ouvrirModale(`
    <h3>⏱ Nouveau délai de correction</h3>
    <label class="champ">Délai (minutes) :
      <input type="number" id="nouveau-delai" value="${ETAT.config.delaiCorrection}">
    </label>
    <button class="btn btn-vert" onclick="appliquerDelai()">💾 Appliquer</button>
    <button class="btn btn-gris" onclick="fermerModale()">Annuler</button>
  `);
}
function appliquerDelai() {
  ETAT.config.delaiCorrection = parseInt(document.getElementById("nouveau-delai").value) || 60;
  sauvegarder(); fermerModale(); afficherConfig();
}
function definirMotDePasse() {
  ouvrirModale(`
    <h3>🔑 Mot de passe centrale</h3>
    <label class="champ">Nouveau mot de passe :
      <input type="password" id="nouveau-mdp">
    </label>
    <button class="btn btn-vert" onclick="appliquerMotDePasse()">💾 Enregistrer</button>
    <button class="btn btn-gris" onclick="fermerModale()">Annuler</button>
  `);
}
function appliquerMotDePasse() {
  const v = document.getElementById("nouveau-mdp").value;
  if (v.length < 4) { alert("4 caractères minimum."); return; }
  ETAT.config.motDePasseCentrale = v;
  sauvegarder(); fermerModale(); afficherConfig();
}

/* ---------- 10. HISTORIQUE + SUPPRESSION TRACÉE (RG-4) ---------- */
function afficherHistorique() {
  const zone = document.getElementById("contenu-historique");
  if (!ETAT.envois.length) {
    zone.innerHTML = '<p class="a-venir">Aucun envoi pour le moment.</p>';
    return;
  }
  zone.innerHTML = ETAT.envois.map((r, idx) => {
    let badge, actions = "";
    if (r.supprime) {
      badge = '<span class="badge badge-rouge">🗑 SUPPRIMÉ (tracé à la centrale)</span>';
    } else if (estVerrouille(r)) {
      badge = '<span class="badge badge-gris">🔒 Verrouillé — en vérification</span>';
    } else {
      badge = '<span class="badge badge-orange">⏳ Correction possible : ' + minutesRestantes(r) + ' min</span>';
      actions = '<button class="btn btn-rouge" style="padding:10px" onclick="supprimerRapport(' + idx + ')">🗑 Supprimer &amp; refaire</button>';
    }
    return `<div class="carte">
      <h3>${r.titre}</h3>
      <p><b>📍 ${r.plateforme}</b> — 👤 ${r.agent} → 📨 ${r.destinataire}</p>
      <p style="font-size:0.85em;color:var(--gris)">🔖 ${r.id}<br>
      🕓 ${new Date(r.envoyeLe).toLocaleString("fr-FR")}${r.signature ? "<br>✍️ Signé" : ""}</p>
      <p style="margin:8px 0">${badge}</p>
      ${actions}
    </div>`;
  }).join("");
}
function supprimerRapport(idx) {
  ouvrirModale(`
    <h3>🗑 Supprimer ce rapport ?</h3>
    <p style="color:var(--gris);font-size:0.9em;margin-bottom:10px">
      La mention "Rapport supprimé" restera visible à la centrale (transparence RG-4).</p>
    <label class="champ">Motif (optionnel) :
      <input type="text" id="motif-suppression" placeholder="Ex : erreur de saisie">
    </label>
    <div class="btn-ligne">
      <button class="btn btn-gris" onclick="fermerModale()">Annuler</button>
      <button class="btn btn-rouge" onclick="confirmerSuppression(${idx})">🗑 Confirmer</button>
    </div>
  `);
}
function confirmerSuppression(idx) {
  const r = ETAT.envois[idx];
  r.supprime = true;
  r.motifSuppression = document.getElementById("motif-suppression").value;
  r.supprimeLe = Date.now();
  sauvegarder(); fermerModale(); afficherHistorique();
}
function afficherHistoriqueLocal(type, zoneId) {
  const liste = ETAT.envois.filter(r => r.type === type);
  document.getElementById(zoneId).innerHTML = liste.length
    ? liste.map(r => `<div class="carte">
        <b>${r.titre}</b><br>
        <small>🔖 ${r.id} — 🕓 ${new Date(r.envoyeLe).toLocaleString("fr-FR")}</small><br>
        ${r.supprime ? '<span class="badge badge-rouge">🗑 SUPPRIMÉ</span>'
          : estVerrouille(r) ? '<span class="badge badge-gris">🔒 Verrouillé</span>'
          : '<span class="badge badge-orange">⏳ ' + minutesRestantes(r) + ' min</span>'}
      </div>`).join("")
    : '<p class="a-venir">Aucun envoi.</p>';
}

/* ============================================================
   R1 — CAHIER DE PASSATION
   ============================================================ */
const METEOS = [
  { id:"soleil",  icone:"☀️", fr:"Ensoleillé" },
  { id:"nuageux", icone:"⛅", fr:"Nuageux" },
  { id:"pluie",   icone:"🌧", fr:"Pluie" },
  { id:"orage",   icone:"⛈",  fr:"Orage" },
  { id:"vent",    icone:"💨", fr:"Vent fort" },
  { id:"sable",   icone:"🌪", fr:"Tempête de sable / poussière" },
  { id:"brume",   icone:"🌫", fr:"Brume / Brouillard" },
  { id:"chaleur", icone:"🔥", fr:"Forte chaleur" },
  { id:"autre",   icone:"✍️", fr:"Autre" }
];

function brouillonR1() {
  if (!ETAT.brouillons.r1) {
    ETAT.brouillons.r1 = {
      date: dateDuJour(),
      agentService: ETAT.config.agents[0] || "",
      agentEntrant: ETAT.config.agents[1] || "",
      meteo: [], meteoAutre: "",
      problemes: "", situation: "", proprete: "", opinion: ""
    };
  }
  return ETAT.brouillons.r1;
}

function afficherR1() {
  const b = brouillonR1();
  const c = ETAT.config;
  const jourSemaine = new Date().toLocaleDateString("fr-FR",{weekday:"long"});
  document.getElementById("contenu-r1").innerHTML = `
    <div class="carte">
      <h3>平台岗位工作记录 — ${c.plateforme || "⚠️ plateforme à configurer"}</h3>
      <p>📅 Date : <b>${b.date}</b> (${jourSemaine})</p>
    </div>

    <div class="carte">
      <h3>🌤 Météo (天气) — cocher ce qui correspond</h3>
      <div class="meteo-grille">
        ${METEOS.map(m => `
          <div class="choix ${b.meteo.includes(m.id)?'selectionne':''}" onclick="toggleMeteo('${m.id}')">
            ${m.icone} ${m.fr}</div>`).join("")}
      </div>
      <div style="display:${b.meteo.includes('autre')?'block':'none'};margin-top:8px">
        <input type="text" placeholder="Précisez la météo..." value="${b.meteoAutre}"
          oninput="majR1('meteoAutre', this.value)">
      </div>
    </div>

    <div class="carte">
      <h3>1️⃣ 上一班次工作遗留问题<br><small>Problèmes laissés par le service précédent</small></h3>
      <textarea rows="3" oninput="majR1('problemes', this.value)">${b.problemes}</textarea>
    </div>

    <div class="carte">
      <h3>2️⃣ 本班次生产情况<br><small>Situation actuelle de travail</small></h3>
      <textarea rows="3" oninput="majR1('situation', this.value)">${b.situation}</textarea>
    </div>

    <div class="carte">
      <h3>3️⃣ 本班次场地设备设施卫生情况<br><small>État de propreté des installations</small></h3>
      <textarea rows="3" oninput="majR1('proprete', this.value)">${b.proprete}</textarea>
    </div>

    <div class="carte">
      <h3>4️⃣ 交接班意见<br><small>Opinion pour la passation</small></h3>
      <textarea rows="3" oninput="majR1('opinion', this.value)">${b.opinion}</textarea>
    </div>

    <div class="carte">
      <h3>✍️ Agents</h3>
      <label class="champ">值班人 En service (agent sortant) :
        <select onchange="majR1('agentService', this.value)">
          ${c.agents.map(a=>`<option ${a===b.agentService?'selected':''}>${a}</option>`).join("")}
        </select>
      </label>
      <label class="champ">接班人 Agent entrant :
        <select onchange="majR1('agentEntrant', this.value)">
          ${c.agents.map(a=>`<option ${a===b.agentEntrant?'selected':''}>${a}</option>`).join("")}
        </select>
      </label>
    </div>

    <button class="btn btn-vert" onclick="transmettreR1()">📤 TRANSMETTRE À LA CENTRALE</button>
    <button class="btn btn-gris" onclick="afficherHistoriqueLocal('PASS','contenu-r1-hist')">📂 Historique des passations</button>
    <div id="contenu-r1-hist"></div>
  `;
}
function toggleMeteo(id) {
  const b = brouillonR1();
  const i = b.meteo.indexOf(id);
  if (i >= 0) b.meteo.splice(i,1); else b.meteo.push(id);
  sauvegarder(); afficherR1();
}
function majR1(champ, valeur) { brouillonR1()[champ] = valeur; sauvegarder(); }

function transmettreR1() {
  const b = brouillonR1();
  demanderSignature("Cahier de passation", function(sig) {
    transmettreRapport("PASS", "📘 Passation — " + b.date,
      Object.assign({}, b, { agent: b.agentService }), sig, "CENTRALE");
    delete ETAT.brouillons.r1;
    sauvegarder(); afficherR1();
    alert("✅ Passation transmise à la centrale !");
  });
}

/* ============================================================
   R2 — PRESSIONS JOURNALIÈRES
   ============================================================ */
const CRENEAUX = ["8:00","12:00","16:00","20:00","0:00","4:00"];
const MANOS_INFO = [
  { id:"tubing", zh:"油压", fr:"Tubing" },
  { id:"casing", zh:"套压", fr:"Casing" },
  { id:"ligne",  zh:"回压", fr:"Ligne" }
];

function brouillonR2() {
  if (!ETAT.brouillons.r2 || ETAT.brouillons.r2.date !== dateDuJour()) {
    ETAT.brouillons.r2 = { date: dateDuJour(), puits: {}, equipements: {} };
  }
  return ETAT.brouillons.r2;
}
function creneauActuel() {
  const h = new Date().getHours();
  const heures = [8,12,16,20,0,4];
  let meilleur = 0, diffMin = 99;
  heures.forEach((hh,i) => {
    const diff = (h - hh + 24) % 24;
    if (diff < diffMin) { diffMin = diff; meilleur = i; }
  });
  return CRENEAUX[meilleur];
}
function nbCreneauxRemplis(donnees) {
  return CRENEAUX.filter(cr => {
    const v = donnees[cr];
    return v && Object.values(v).some(x => x !== "" && x != null);
  }).length;
}
function classeEcart(nouvelle, ancienne) {
  const c = ETAT.config;
  if (!c.alertesActives) return "";
  if (ancienne === "" || ancienne == null || isNaN(ancienne) || ancienne === 0) return "";
  if (isNaN(nouvelle)) return "";
  const ecart = Math.abs(nouvelle - ancienne) / Math.abs(ancienne) * 100;
  if (ecart >= c.seuilRouge) return "ecart-rouge";
  if (ecart >= c.seuilOrange) return "ecart-orange";
  return "";
}

function afficherR2() {
  const b = brouillonR2();
  const c = ETAT.config;
  document.getElementById("contenu-r2").innerHTML = `
    <div class="carte">
      <h3>采油日报表 — ${c.plateforme}</h3>
      <p>📅 ${b.date} — Créneau actuel : <b>${creneauActuel()}</b> 🔶</p>
    </div>

    <div class="carte">
      <h3>🛢 Puits</h3>
      ${c.puits.length === 0 ? '<p style="color:var(--gris)">⚠️ Configurez vos puits dans ⚙️ d\'abord.</p>' : ""}
      ${c.puits.map(p => {
        const donnees = (b.puits[p.nom] && b.puits[p.nom].creneaux) || {};
        const n = nbCreneauxRemplis(donnees);
        return `<div class="puits-ligne" onclick="afficherFichePuits('${p.nom}')">
          <div>
            <div class="nom">🛢 ${p.nom}</div>
            <div class="progression" style="width:120px"><div style="width:${n/6*100}%"></div></div>
            <small>${n}/6 relevés ${n===6 ? "✅" : n>0 ? "🔶" : "⬜"}</small>
          </div>
          <span>→</span>
        </div>`;
      }).join("")}
    </div>

    <div class="carte">
      <h3>⚙️ Équipements communs</h3>
      ${c.equipements.length === 0 ? '<p style="color:var(--gris)">⚠️ Ajoutez vos équipements dans ⚙️ Config.</p>' : ""}
      ${c.equipements.map(eq => {
        const donnees = b.equipements[eq] || {};
        const n = nbCreneauxRemplis(donnees);
        return `<div class="puits-ligne" onclick="afficherFicheEquipement('${eq}')">
          <div><div class="nom">${eq}</div>
          <small>${n}/6 relevés</small></div><span>→</span>
        </div>`;
      }).join("")}
    </div>

    <button class="btn btn-bleu" onclick="afficherVueTableauR2()">👁 VUE TABLEAU</button>
    <button class="btn btn-vert" onclick="transmettreR2()">📤 ENVOYER À LA CENTRALE</button>
    <button class="btn btn-gris" onclick="afficherHistoriqueLocal('PROD','contenu-r2-hist')">📂 Historique</button>
    <div id="contenu-r2-hist"></div>
  `;
}

function afficherFichePuits(nomPuits) {
  const b = brouillonR2();
  const c = ETAT.config;
  const puits = c.puits.find(p => p.nom === nomPuits);
  if (!b.puits[nomPuits]) b.puits[nomPuits] = { creneaux: {}, remarque: "" };
  const donnees = b.puits[nomPuits];
  const manosActives = MANOS_INFO.filter(m => puits.manos[m.id]);
  const actuel = creneauActuel();

  document.getElementById("contenu-r2").innerHTML = `
    <div class="barre-retour" style="border-radius:10px;margin-bottom:12px">
      <button onclick="afficherR2()">← Retour</button>
      <h2>🛢 ${nomPuits}</h2>
    </div>
    ${CRENEAUX.map((cr, idx) => {
      const vals = donnees.creneaux[cr] || {};
      const crPrec = idx > 0 ? CRENEAUX[idx-1] : null;
      const valsPrec = crPrec ? (donnees.creneaux[crPrec] || {}) : {};
      const rempli = Object.values(vals).some(x => x !== "" && x != null);
      return `<div class="carte" style="${cr===actuel?'border:2px solid var(--orange)':''}">
        <h3>🕐 ${cr} ${rempli ? '<span class="badge badge-vert">✅</span>' : cr===actuel ? '<span class="badge badge-orange">🔶 en cours</span>' : '<span class="badge badge-gris">⬜</span>'}</h3>
        ${manosActives.map(m => {
          const v = vals[m.id] != null ? vals[m.id] : "";
          const vp = valsPrec[m.id];
          return `<div class="champ-pression">
            <div class="entete-champ">
              <span>${m.zh} ${m.fr} (MPa)</span>
              ${vp !== "" && vp != null ? `<span class="prec">(${crPrec} → ${vp})</span>` : ""}
            </div>
            <input type="number" step="0.01" inputmode="decimal" value="${v}"
              oninput="majR2Puits(this,'${nomPuits}','${cr}','${m.id}','${crPrec||''}')">
          </div>`;
        }).join("")}
      </div>`;
    }).join("")}
    <div class="carte">
      <h3>备注 Remarque du puits (1 par jour)</h3>
      <textarea rows="2" oninput="majR2Remarque('${nomPuits}', this.value)">${donnees.remarque}</textarea>
    </div>
    <button class="btn btn-bleu" onclick="afficherR2()">💾 OK — Retour à la liste</button>
  `;
}
function majR2Puits(input, nom, cr, champ, crPrec) {
  const b = brouillonR2();
  if (!b.puits[nom].creneaux[cr]) b.puits[nom].creneaux[cr] = {};
  b.puits[nom].creneaux[cr][champ] = input.value;
  sauvegarder();
  if (crPrec && input.value !== "") {
    const vp = b.puits[nom].creneaux[crPrec] ? b.puits[nom].creneaux[crPrec][champ] : null;
    input.className = classeEcart(parseFloat(input.value), parseFloat(vp));
  }
}
function majR2Remarque(nom, valeur) { brouillonR2().puits[nom].remarque = valeur; sauvegarder(); }

function afficherFicheEquipement(nomEq) {
  const b = brouillonR2();
  if (!b.equipements[nomEq]) b.equipements[nomEq] = {};
  const donnees = b.equipements[nomEq];
  const actuel = creneauActuel();

  document.getElementById("contenu-r2").innerHTML = `
    <div class="barre-retour" style="border-radius:10px;margin-bottom:12px">
      <button onclick="afficherR2()">← Retour</button>
      <h2>${nomEq}</h2>
    </div>
    ${CRENEAUX.map((cr, idx) => {
      const v = donnees[cr] != null ? donnees[cr] : "";
      const crPrec = idx > 0 ? CRENEAUX[idx-1] : null;
      const vp = crPrec ? donnees[crPrec] : null;
      return `<div class="carte" style="${cr===actuel?'border:2px solid var(--orange)':''}">
        <h3>🕐 ${cr} ${v !== "" ? '<span class="badge badge-vert">✅</span>' : cr===actuel ? '<span class="badge badge-orange">🔶</span>' : ""}</h3>
        <div class="champ-pression">
          <div class="entete-champ">
            <span>Pression (MPa)</span>
            ${vp ? `<span class="prec">(${crPrec} → ${vp})</span>` : ""}
          </div>
          <input type="number" step="0.01" inputmode="decimal" value="${v}"
            oninput="majR2Equipement(this,'${nomEq}','${cr}','${crPrec||''}')">
        </div>
      </div>`;
    }).join("")}
    <button class="btn btn-bleu" onclick="afficherR2()">💾 OK — Retour</button>
  `;
}
function majR2Equipement(input, nom, cr, crPrec) {
  const b = brouillonR2();
  b.equipements[nom][cr] = input.value;
  sauvegarder();
  if (crPrec && input.value !== "") {
    const vp = b.equipements[nom][crPrec];
    input.className = classeEcart(parseFloat(input.value), parseFloat(vp));
  }
}

function afficherVueTableauR2() {
  const b = brouillonR2();
  const c = ETAT.config;
  let lignes = "";
  c.puits.forEach(p => {
    const donnees = (b.puits[p.nom] && b.puits[p.nom].creneaux) || {};
    const rem = (b.puits[p.nom] && b.puits[p.nom].remarque) || "";
    const manos = MANOS_INFO.filter(m => p.manos[m.id]);
    manos.forEach((m, i) => {
      lignes += "<tr>";
      if (i === 0) lignes += `<td rowspan="${manos.length}"><b>${p.nom}</b></td>`;
      lignes += `<td>${m.zh} ${m.fr}</td>`;
      CRENEAUX.forEach((cr, idx) => {
        const v = (donnees[cr] && donnees[cr][m.id] != null) ? donnees[cr][m.id] : "";
        const vp = idx > 0 && donnees[CRENEAUX[idx-1]] ? donnees[CRENEAUX[idx-1]][m.id] : null;
        const cl = v !== "" ? classeEcart(parseFloat(v), parseFloat(vp)) : "";
        const css = cl === "ecart-rouge" ? "cellule-rouge" : cl === "ecart-orange" ? "cellule-orange" : "";
        lignes += `<td class="${css}">${v}</td>`;
      });
      if (i === 0) lignes += `<td rowspan="${manos.length}">${rem}</td>`;
      lignes += "</tr>";
    });
  });
  c.equipements.forEach(eq => {
    lignes += `<tr><td colspan="2"><b>${eq}</b></td>`;
    CRENEAUX.forEach(cr => {
      lignes += `<td>${(b.equipements[eq] && b.equipements[eq][cr] != null) ? b.equipements[eq][cr] : ""}</td>`;
    });
    lignes += "<td></td></tr>";
  });

  ouvrirModale(`
    <h3>👁 采油日报表 — ${c.plateforme} — ${b.date}</h3>
    <div class="tableau-scroll"><table class="style-papier">
      <tr><th>Puits</th><th>Pression</th>${CRENEAUX.map(cr=>`<th>${cr}</th>`).join("")}<th>备注</th></tr>
      ${lignes}
    </table></div>
    <button class="btn btn-gris" onclick="fermerModale()">Fermer</button>
  `);
}

function transmettreR2() {
  const b = brouillonR2();
  const c = ETAT.config;
  let manquants = [];
  c.puits.forEach(p => {
    const n = nbCreneauxRemplis((b.puits[p.nom] && b.puits[p.nom].creneaux) || {});
    if (n < 6) manquants.push(p.nom + " (" + n + "/6)");
  });
  if (manquants.length) {
    ouvrirModale(`
      <h3>⚠️ Relevés incomplets</h3>
      <p>Il manque des relevés :<br><b>${manquants.join(", ")}</b></p>
      <p style="color:var(--gris);font-size:0.9em">Envoyer quand même ?</p>
      <div class="btn-ligne">
        <button class="btn btn-gris" onclick="fermerModale()">Compléter</button>
        <button class="btn btn-orange" onclick="envoyerR2Direct()">Envoyer quand même</button>
      </div>
    `);
  } else {
    envoyerR2Direct();
  }
}
function envoyerR2Direct() {
  fermerModale();
  const b = brouillonR2();
  demanderSignature("Rapport pressions journalières", function(sig) {
    transmettreRapport("PROD", "🛢 Pressions journalières — " + b.date,
      Object.assign({}, b, { agent: ETAT.config.agents[0] || "" }), sig, "CENTRALE");
    delete ETAT.brouillons.r2;
    sauvegarder(); afficherR2();
    alert("✅ Rapport transmis à la centrale !");
  });
}

/* ---------- 11. DÉMARRAGE ---------- */
function rafraichirAccueil() {
  document.getElementById("nom-plateforme").textContent =
    "Plateforme : " + (ETAT.config.plateforme || "⚠️ à configurer");
  document.getElementById("date-accueil").textContent =
    "📅 " + new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const aff = ETAT.config.cuvesActives ? "" : "none";
  document.getElementById("tuile-r5").style.display = aff;
  document.getElementById("tuile-r6").style.display = aff;
}

charger();
rafraichirAccueil();
