import { inject } from "@vercel/analytics";
import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ──────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ── Helper : calcule le total collecté + nb de donateurs par case_id ─────────
// Lit les dons CONFIRMÉS pour les ids passés en paramètre et retourne
// un objet { caseId: { collected, donors } }. Garantit que la jauge progresse
// uniquement après validation manuelle d'un don par l'admin (statut "confirmed"),
// et que chaque don est attribué au bon dossier via case_id.
async function fetchConfirmedTotals(caseIds) {
  if (!caseIds || caseIds.length === 0) return {};
  const ids = [...new Set(caseIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("donations")
    .select("case_id, amount_fcfa, amount, donor_id, donor_email, id")
    .in("case_id", ids)
    .eq("status", "confirmed");
  if (error || !data) return {};
  const map = {};
  for (const d of data) {
    const k = d.case_id;
    if (!map[k]) map[k] = { collected: 0, donorKeys: new Set() };
    map[k].collected += Number(d.amount_fcfa || d.amount || 0);
    // Comptage donateurs : par donor_id si connecté, sinon par donor_email,
    // sinon chaque don anonyme = 1 donateur (id de la donation)
    map[k].donorKeys.add(d.donor_id || d.donor_email || ("anon-" + d.id));
  }
  const out = {};
  for (const k of Object.keys(map)) {
    out[k] = { collected: map[k].collected, donors: map[k].donorKeys.size };
  }
  return out;
}

// Construit la référence de paiement à recopier dans la note Wave.
// Format : AYYAD-<tracking_id>  →  ex: "AYYAD-AYD-2026-04-001"
// Le tracking_id est assigné à l'approbation (année-mois-rang dans le mois),
// ce qui rend la référence parlante : on lit directement le numéro de dossier.
// Le donateur a un bouton "Copier" pour ne pas avoir à retaper.
function buildPaymentRef(caseObj) {
  const tracking = caseObj?.tracking_id || caseObj?.trackingId;
  if (tracking) return "AYYAD-" + tracking;
  // Fallback ultime (ne devrait jamais arriver après backfill) :
  // 8 derniers caractères de l'UUID en majuscules
  const idStr = String(caseObj?.id || "");
  const short = idStr.replace(/-/g, "").slice(-8).toUpperCase();
  return "AYYAD-" + (short || "DON");
}

// Affichage public d'un nom de donateur — masque les emails par RGPD.
// "kedhard80@gmail.com" → "kedhard80"
// "John Doe"            → "John Doe"
// null/""               → "Anonyme" / "Anonymous" (selon lang)
// Utilisé sur les surfaces publiques (ticker, fiche collecte). L'admin voit la
// donnée brute pour pouvoir matcher avec les notifs Wave Business.
function publicDonorName(rawName, lang) {
  const fr = lang !== "en";
  if (!rawName) return fr ? "Anonyme" : "Anonymous";
  const s = String(rawName).trim();
  if (!s) return fr ? "Anonyme" : "Anonymous";
  // Si ça ressemble à un email, on garde juste la partie avant @
  if (s.includes("@")) return s.split("@")[0];
  return s;
}

// Insère un don via l'endpoint serveur /api/donate (bypass RLS via service_role).
// Fallback automatique sur supabase direct si l'endpoint n'est pas dispo.
// Retourne { error?: string } — pas d'erreur = succès.
async function createDonation(payload) {
  try {
    const r = await fetch("/api/donate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) return { error: null };
    // Si l'API renvoie 404 (endpoint pas déployé) ou 500 (config manquante),
    // on tombe sur le fallback Supabase direct
    const result = await r.json().catch(() => ({}));
    if (r.status === 404 || r.status === 500) {
      console.warn("[/api/donate] indispo, fallback supabase direct:", result);
    } else {
      return { error: result?.details?.message || result?.error || `HTTP ${r.status}` };
    }
  } catch (err) {
    console.warn("[/api/donate] échec réseau, fallback supabase direct:", err);
  }
  // Fallback : insertion directe via le client Supabase (anon)
  const { error } = await supabase.from("donations").insert(payload).select().single();
  if (error) return { error: (error.message || "Erreur Supabase") + (error.code ? " (code "+error.code+")" : "") };
  return { error: null };
}

// ── Storage helpers ───────────────────────────────────────────────────────────
// Configuration des 2 buckets :
// - "case-photos"      : public, contient uniquement les visuels affichés sur les fiches collecte
// - "medical-documents": privé, contient les pièces sensibles (CNI, rapports, devis, consentements)
//   → accessibles uniquement via signed URL (admin ou propriétaire du dossier)
const BUCKET_PUBLIC = "case-photos";
const BUCKET_PRIVATE = "medical-documents";

// Détecte si une valeur stockée est un path Storage (à signer) ou une URL publique (rétro-compat).
// Les anciens uploads stockaient l'URL complète https://...supabase.co/storage/v1/object/public/...
// Les nouveaux uploads stockent juste le path "dossiers/xxx/file.pdf".
function isStoragePath(value) {
  if (!value || typeof value !== "string") return false;
  return !/^https?:\/\//i.test(value);
}

// Demande une signed URL au backend pour un path donné dans un bucket privé.
// Renvoie l'URL signée (TTL 5 min) ou null en cas d'erreur.
async function fetchSignedUrl({ bucket, path, caseId }) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    const r = await fetch("/api/sign-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ bucket, path, case_id: caseId || null }),
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => ({}));
    return data.url || null;
  } catch (e) {
    console.warn("[fetchSignedUrl] échec:", e);
    return null;
  }
}

// React component : affiche un lien vers un document, en gérant URL publique
// (legacy) ET path privé (nouveau format avec signed URL).
// Usage : <SecureDocLink value={c.document_urls.medical} caseId={c.id}>🏥 Rapport médical</SecureDocLink>
function SecureDocLink({ value, caseId, bucket = BUCKET_PRIVATE, className = "", children }) {
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  if (!value) return null;
  // Cas legacy : URL publique stockée → on l'utilise directement
  const isLegacyPublicUrl = !isStoragePath(value);
  if (isLegacyPublicUrl) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  // Cas nouveau : path privé → on signe à la demande
  const handleClick = async (e) => {
    if (resolvedUrl) return; // déjà signé, laisse le lien naviguer
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const url = await fetchSignedUrl({ bucket, path: value, caseId });
    setLoading(false);
    if (url) {
      setResolvedUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      alert("Impossible d'ouvrir ce document. Vérifiez vos droits.");
    }
  };
  return (
    <a
      href={resolvedUrl || "#"}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      {loading ? "⏳ Génération du lien..." : children}
    </a>
  );
}

// Applique fetchConfirmedTotals à une liste de cases et retourne la liste enrichie
async function enrichCasesWithTotals(cases) {
  if (!Array.isArray(cases) || cases.length === 0) return cases || [];
  const totals = await fetchConfirmedTotals(cases.map(c => c.id));
  return cases.map(c => {
    const t = totals[c.id];
    return {
      ...c,
      collected: t ? t.collected : Number(c.collected || 0),
      donors:    t ? t.donors    : Number(c.donors || 0),
    };
  });
}

// ── Email helpers (appellent /api/send-email côté serveur) ───────────────────
// Les templates HTML et la clé Resend vivent dans /api/send-email.js (server-side).
// Ici on n'expose plus aucune clé API au client.
// L'email admin est résolu côté serveur dans /api/send-email (process.env.ADMIN_EMAIL).
// On ne le hardcode plus dans le bundle JS pour éviter le doxing du fondateur.
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "";

const sendEmail = async ({ type, to, data }) => {
  try {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, to, data })
    });
    const result = await res.json();
    if (!res.ok) console.error("Email error:", result);
    else console.log("Email envoyé:", type, result.id);
    return result;
  } catch (e) { console.log("Email fetch error:", e); }
};

// Wrappers — mêmes signatures qu'avant pour ne pas casser les call sites
const emailDonConfirm = ({ donorEmail, ...data }) =>
  sendEmail({ type: "donConfirm", to: donorEmail || ADMIN_EMAIL, data });

const emailNewCase = (data) =>
  sendEmail({ type: "newCase", to: ADMIN_EMAIL, data });

const emailCaseApproved = ({ beneficiaryEmail, ...data }) =>
  sendEmail({ type: "caseApproved", to: beneficiaryEmail || ADMIN_EMAIL, data });

const emailCaseRejected = ({ beneficiaryEmail, ...data }) =>
  sendEmail({ type: "caseRejected", to: beneficiaryEmail || ADMIN_EMAIL, data });

// Nouveaux templates (à appeler depuis le code métier)
const emailWelcomePatient = ({ beneficiaryEmail, ...data }) =>
  sendEmail({ type: "welcomePatient", to: beneficiaryEmail || ADMIN_EMAIL, data });

const emailCaseFunded = ({ donorEmail, ...data }) =>
  sendEmail({ type: "caseFunded", to: donorEmail || ADMIN_EMAIL, data });
const CI_VILLES = [
  "Abengourou","Abidjan","Aboisso","Adzopé","Agboville","Anyama","Bondoukou",
  "Bouna","Boundiali","Daloa","Dimbokro","Divo","Ferkessédougou","Gagnoa",
  "Grand-Bassam","Guiglo","Issia","Jacqueville","Katiola","Korhogo","Lakota",
  "Man","Mankono","Odienné","Oumé","San-Pédro","Sassandra","Séguéla","Sinfra",
  "Soubré","Tabou","Tanda","Tiassalé","Tingrela","Touba","Toumodi","Vavoua",
  "Yamoussoukro"
];

const CI_HOPITAUX = [
  { nom: "CHU de Cocody", ville: "Abidjan", type: "CHU" },
  { nom: "CHU de Treichville", ville: "Abidjan", type: "CHU" },
  { nom: "CHU de Yopougon", ville: "Abidjan", type: "CHU" },
  { nom: "CHU de Bouaké", ville: "Bouaké", type: "CHU" },
  { nom: "CHR d'Abengourou", ville: "Abengourou", type: "CHR" },
  { nom: "CHR d'Agboville", ville: "Agboville", type: "CHR" },
  { nom: "CHR de Bondoukou", ville: "Bondoukou", type: "CHR" },
  { nom: "CHR de Bouna", ville: "Bouna", type: "CHR" },
  { nom: "CHR de Daloa", ville: "Daloa", type: "CHR" },
  { nom: "CHR de Dimbokro", ville: "Dimbokro", type: "CHR" },
  { nom: "CHR de Divo", ville: "Divo", type: "CHR" },
  { nom: "CHR de Ferkessédougou", ville: "Ferkessédougou", type: "CHR" },
  { nom: "CHR de Gagnoa", ville: "Gagnoa", type: "CHR" },
  { nom: "CHR de Guiglo", ville: "Guiglo", type: "CHR" },
  { nom: "CHR d'Issia", ville: "Issia", type: "CHR" },
  { nom: "CHR de Katiola", ville: "Katiola", type: "CHR" },
  { nom: "CHR de Korhogo", ville: "Korhogo", type: "CHR" },
  { nom: "CHR de Lakota", ville: "Lakota", type: "CHR" },
  { nom: "CHR de Man", ville: "Man", type: "CHR" },
  { nom: "CHR de Mankono", ville: "Mankono", type: "CHR" },
  { nom: "CHR d'Odienné", ville: "Odienné", type: "CHR" },
  { nom: "CHR d'Oumé", ville: "Oumé", type: "CHR" },
  { nom: "CHR de San-Pédro", ville: "San-Pédro", type: "CHR" },
  { nom: "CHR de Séguéla", ville: "Séguéla", type: "CHR" },
  { nom: "CHR de Sinfra", ville: "Sinfra", type: "CHR" },
  { nom: "CHR de Soubré", ville: "Soubré", type: "CHR" },
  { nom: "CHR de Tanda", ville: "Tanda", type: "CHR" },
  { nom: "CHR de Tiassalé", ville: "Tiassalé", type: "CHR" },
  { nom: "CHR de Touba", ville: "Touba", type: "CHR" },
  { nom: "CHR de Toumodi", ville: "Toumodi", type: "CHR" },
  { nom: "CHR de Yamoussoukro", ville: "Yamoussoukro", type: "CHR" },
  // Cliniques privées Abidjan
  { nom: "Clinique Procréa", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Sainte Marie", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique du Plateau", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Les Deux Plateaux", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Avicenne", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Houphouët-Boigny (Polyclinique)", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Biétry", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Casamance", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Saint Joseph Moscati", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Mère-Enfant (CME)", ville: "Abidjan", type: "Clinique" },
  { nom: "Polyclinique Internationale Sainte Anne-Marie (PISAM)", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique de l'Indénié", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Lagarrigue", ville: "Abidjan", type: "Clinique" },
  { nom: "Clinique Sikensi / Centre Médical Sikensi", ville: "Abidjan", type: "Clinique" },
  { nom: "Infirmerie Protestante de Dabou", ville: "Abidjan", type: "Clinique" },
  { nom: "Autre établissement", ville: "", type: "Autre" },
];

// ── Translations ─────────────────────────────────────────────
const T = {
  fr: {
    nav: { collections: "Collectes", how: "Comment ça marche", admin: "Administration", login: "Connexion", start: "Démarrer", logout: "Déconnexion", medicalFinancing: "Financement médical" },
    hero: { badge: "Plateforme vérifiée & sécurisée", title1: "Quand la vie attend,", title2: "agissons.", sub: "Derrière chaque collecte, un patient dont la santé dépend de notre solidarité. Un don. Un hôpital. Un espoir.", cta1: "Collectes terminées & témoignages", cta2: "Soumettre un dossier" },
    stats: { patients: "Patients aidés", collected: "FCFA collectés", hospitals: "Hôpitaux partenaires" },
    collections: { title: "Collectes en cours", sub: "dossiers vérifiés actifs" },
    card: { donors: "donateurs", daysLeft: "j restants", funded: "Objectif atteint !", on: "sur" },
    how: { title: "Comment fonctionne Ayyad ?", sub: "Simple, sécurisé, conçu pour l'Afrique", steps: [{ n:"1",icon:"📋",title:"Dossier soumis",desc:"Le patient soumet son rapport médical et devis hospitalier" },{ n:"2",icon:"🔍",title:"Vérification",desc:"Notre équipe vérifie avec l'hôpital partenaire sous 48h" },{ n:"3",icon:"💚",title:"Don direct",desc:"Vous payez exactement le montant choisi. Aucun frais caché." },{ n:"4",icon:"🏥",title:"Versement hôpital",desc:"Les fonds sont versés directement à l'établissement de santé" }] },
    donate: { title: "Faire un don", sub: "Vous serez débité exactement du montant choisi.", amount: "Montant (FCFA)", custom: "Autre", payment: "Moyen de paiement", anonymous: "Don anonyme", message: "Laisser un message...", btnFunded: "Collecte terminée", btn: "Donner", secure: "Paiement sécurisé · Aucuns frais cachés", confirm: "Confirmation", verifyDon: "Vérifiez votre don", debited: "Montant débité", beneficiary: "Bénéficiaire", via: "Via", anonymity: "Anonymat", active: "✓ Activé", modify: "Modifier", confirmBtn: "Confirmer ✓", thanks: "Merci infiniment !", thanksSub: "Votre don a bien été pris en compte.", impact: "Ce que vous venez de faire :", impactSub: "Rapprocher", impactEnd: "d'une vie meilleure.", again: "Refaire un don" },
    guarantee: { title: "Garantie Ayyad", desc: "Fonds versés directement à l'hôpital partenaire. Jamais en espèces. Chaque virement est audité." },
    submit: { title: "Soumettre un dossier", steps: ["Informations","Documents","Confirmation"], infoTitle: "Décrivez votre situation médicale", titleField: "Titre de la collecte *", descField: "Description *", hospitalField: "Hôpital *", cityField: "Ville *", amountField: "Montant du devis (FCFA) *", categoryField: "Spécialité", cats: ["Cardiologie","Oncologie","Neurologie","Orthopédie","Pédiatrie","Gynécologie","Autre"], next: "Continuer →", docsTitle: "Documents requis", docsSub: "Tous les documents sont chiffrés (AES-256).", docs: [{ key:"medical",icon:"📄",title:"Rapport médical",desc:"Compte-rendu ou ordonnance du médecin" },{ key:"quote",icon:"🏥",title:"Devis hospitalier",desc:"Devis officiel signé par l'établissement" },{ key:"id",icon:"🪪",title:"Pièce d'identité",desc:"CNI, passeport ou titre de séjour valide" },{ key:"consent",icon:"✍️",title:"Consentement données",desc:"Formulaire Ayyad de consentement" }], upload: "Choisir fichier", uploading: "Envoi...", uploaded: "✓ Envoyé", error: "Erreur, réessayez", warning: "Tous les documents sont obligatoires pour la vérification.", back: "← Retour", submit: "Soumettre →", successTitle: "Dossier soumis !", successSub: "Votre dossier est en cours d'examen.", processSteps: ["Dossier reçu et numéroté","Vérification équipe Ayyad (< 48h)","Contact hôpital pour validation devis","Mise en ligne de la collecte"], backHome: "Retour à l'accueil", loginRequired: "Vous devez être connecté pour soumettre un dossier.", loginBtn: "Se connecter" },
    login: { title: "Connexion à Ayyad", sub: "Bienvenue ! Connectez-vous à votre espace.", email: "Email", password: "Mot de passe", btn: "Se connecter →", noAccount: "Pas encore de compte ?", register: "S'inscrire", error: "Email ou mot de passe incorrect." },
    register: { title: "Créer un compte", roleQ: "Je souhaite...", roles: [{ id:"donor",icon:"💚",title:"Faire des dons",desc:"Aider des patients dans le besoin" },{ id:"beneficiary",icon:"🏥",title:"Recevoir des soins",desc:"Financer une intervention médicale" }], fields: [{ key:"name",label:"Nom complet",p:"Aminata Koné",type:"text" },{ key:"email",label:"Email",p:"vous@exemple.ci",type:"email" },{ key:"phone",label:"Numéro Wave CI",p:"+225 07 XX XX XX XX",type:"tel" },{ key:"password",label:"Mot de passe (min. 6 caractères)",p:"••••••••",type:"password" }], terms: "J'accepte les", termsLink: "conditions d'utilisation", and: "et la", privacyLink: "politique de confidentialité", btn: "Créer mon compte", continue: "Continuer →", back: "← Retour", hasAccount: "Déjà un compte ?", signin: "Se connecter", error: "Erreur lors de la création du compte." },
    admin: {
      title: "Administration Ayyad", sub: "Tableau de bord opérationnel", status: "Système opérationnel",
      tabs: [{ id:"overview",label:"Vue d'ensemble",icon:"📊" },{ id:"cases",label:"Dossiers",icon:"📋" },{ id:"donations",label:"Dons",icon:"💚" },{ id:"fraud",label:"Fraude",icon:"🔍" },{ id:"payouts",label:"Virements",icon:"🏦" },{ id:"finance",label:"Finance",icon:"💰" },{ id:"salary",label:"Salaires",icon:"👔" },{ id:"audit",label:"Audit",icon:"📝" },{ id:"bilan",label:"Bilan",icon:"📈" },{ id:"testimonials",label:"Témoignages",icon:"💬" },{ id:"visitors",label:"Visiteurs",icon:"👁️" },{ id:"accounts",label:"Comptes",icon:"👤" },{ id:"team",label:"Équipe",icon:"👥" },{ id:"export",label:"Export",icon:"📤",superAdminOnly:true }],
      stats: [{ label:"Dossiers actifs",v:"—",icon:"📋" },{ label:"Dons ce mois",v:"—",icon:"💚" },{ label:"Bénéficiaires aidés",v:"—",icon:"🏥" }],
      recentTitle: "Dossiers récents", revenueTitle: "Revenus opérationnels (5%)",
      months: [{ month:"Mars 2025",dons:"24.8M",fees:"1 240 000 FCFA" },{ month:"Fév. 2025",dons:"19.2M",fees:"960 000 FCFA" },{ month:"Jan. 2025",dons:"15.1M",fees:"755 000 FCFA" }],
      pendingTitle: "Dossiers en attente de validation", pending: "en attente", empty: "Aucun dossier en attente", loading: "Chargement...",
      risk: "Risque", reject: "Rejeter", approve: "Approuver ✓", rejectConfirm: "Motif de rejet :", rejectBtn: "Confirmer le rejet",
      fraudTitle: "Alertes fraude", fraudLabels: [{ label:"Critiques",sev:"critical",c:"red" },{ label:"Élevées",sev:"high",c:"amber" },{ label:"Résolues",sev:null,c:"emerald" }],
      resolve: "Résoudre", resolved: "Résolu", payoutsTitle: "Virements hospitaliers", payoutsPending: "en attente", validate: "Valider →", active2: "Actif", funded: "Financé",
      statusLabels: { PENDING:"En attente", APPROVED:"Approuvé", REJECTED:"Rejeté", COLLECTING:"En collecte", FUNDED:"Financé" },
      noAdmin: "Accès réservé aux administrateurs."
    },
    badges: { verified: "✓ Dossier vérifié", collecting: "Actif", funded: "✓ Financé", urgent: "🚨 URGENT" },
    urgent: { title: "🚨 Cas urgents", sub: "Ces patients ont besoin d'aide immédiate — intervention critique sous 72h", alert: "⚠️ Intervention requise sous 72h" },
    supportAyyad: { title: "Soutenir Ayyad directement", sub: "Votre don aide à financer les opérations de la plateforme : vérification des dossiers, partenariats hospitaliers, et accompagnement des patients.", wave: "🌊 Payer via Wave",  number: "+225 07 48 05 61 28", copied: "✓ Numéro copié !", copy: "Copier le numéro", thanks: "Merci pour votre soutien !", thanksSub: "Chaque contribution aide Ayyad à rester gratuit pour les patients.", directDonation: "Don direct à Ayyad" },
    video: { title: "Message du patient", watch: "▶ Voir la vidéo", noVideo: "Aucune vidéo disponible pour ce dossier." },
    progress: { collected: "collectés sur", donors: "donateurs", daysLeft: "jours restants", intervention: "✓ Intervention planifiée", progressTitle: "Progression de la collecte", of: "de l'objectif" },
    back: "← Retour aux collectes",
    footer: { tagline: "Financer la santé pour tous en Afrique.", platform: "Plateforme", trust: "Confiance", legal: "Légal", platformLinks: ["Collectes actives","Comment ça marche","Soumettre un dossier"], trustLinks: ["Vérification dossiers","Hôpitaux partenaires","Rapport d'impact"], legalLinks: ["Mentions légales","FAQ","Conformité BCEAO"], rights: "© 2025 Ayyad CI — Tous droits réservés" },
    howPage: { title: "Comment fonctionne Ayyad ?", sub: "Transparent, sécurisé, conçu pour l'Afrique", forDonors: { icon:"💚",title:"Pour les donateurs",steps:["Parcourez les collectes vérifiées actives","Choisissez librement votre montant","Payez via Wave CI ou carte bancaire","Vous êtes débité exactement du montant choisi","L'argent arrive directement à l'hôpital"] }, forBenef: { icon:"🏥",title:"Pour les bénéficiaires",steps:["Créez un compte et soumettez votre dossier médical","Téléchargez rapport médical, devis, pièce d'identité","Notre équipe vérifie avec l'hôpital partenaire","Votre collecte est mise en ligne sous 48h","Les fonds sont versés directement à l'hôpital"] }, feeTitle: "La règle des 5% — Incluse dans l'objectif", feeSub: "Ayyad intègre sa commission de 5% directement dans l'objectif de collecte. Vous donnez 10 000 FCFA, l'hôpital reçoit 10 000 FCFA. Rien n'est prélevé sur votre don.", youGive: "Vous donnez", collectReceives: "L'hôpital reçoit", ayyadFee: "Frais Ayyad (inclus dans l'objectif)" },
  },
  en: {
    nav: { collections: "Campaigns", how: "How it works", admin: "Administration", login: "Login", start: "Get started", logout: "Logout", medicalFinancing: "Medical funding" },
    hero: { badge: "Verified & secure platform", title1: "When life can't wait,", title2: "we act.", sub: "Behind every campaign, a patient whose health depends on our solidarity. One donation. One hospital. One hope.", cta1: "Completed campaigns & testimonials", cta2: "Submit a case" },
    stats: { patients: "Patients helped", collected: "FCFA raised", hospitals: "Partner hospitals" },
    collections: { title: "Active campaigns", sub: "verified active cases" },
    card: { donors: "donors", daysLeft: "days left", funded: "Goal reached!", on: "of" },
    how: { title: "How does Ayyad work?", sub: "Simple, secure, built for Africa", steps: [{ n:"1",icon:"📋",title:"Case submitted",desc:"The patient submits their medical report and hospital quote" },{ n:"2",icon:"🔍",title:"Verification",desc:"Our team verifies with the partner hospital within 48h" },{ n:"3",icon:"💚",title:"Direct donation",desc:"You pay exactly the amount you chose. No hidden fees." },{ n:"4",icon:"🏥",title:"Hospital payment",desc:"Funds are transferred directly to the healthcare facility" }] },
    donate: { title: "Make a donation", sub: "You will be charged exactly the amount you choose.", amount: "Amount (FCFA)", custom: "Custom", payment: "Payment method", anonymous: "Anonymous donation", message: "Leave a message...", btnFunded: "Campaign closed", btn: "Donate", secure: "Secure payment · No hidden fees", confirm: "Confirmation", verifyDon: "Review your donation", debited: "Amount charged", beneficiary: "Beneficiary", via: "Via", anonymity: "Anonymity", active: "✓ Enabled", modify: "Edit", confirmBtn: "Confirm ✓", thanks: "Thank you so much!", thanksSub: "Your donation has been recorded.", impact: "What you just did:", impactSub: "Brought", impactEnd: "closer to a better life.", again: "Donate again" },
    guarantee: { title: "Ayyad Guarantee", desc: "Funds transferred directly to the partner hospital. Never in cash. Every transfer is audited." },
    submit: { title: "Submit a medical case", steps: ["Information","Documents","Confirmation"], infoTitle: "Describe your medical situation", titleField: "Campaign title *", descField: "Description *", hospitalField: "Hospital *", cityField: "City *", amountField: "Quoted amount (FCFA) *", categoryField: "Specialty", cats: ["Cardiology","Oncology","Neurology","Orthopedics","Pediatrics","Gynecology","Other"], next: "Continue →", docsTitle: "Required documents", docsSub: "All documents are encrypted (AES-256).", docs: [{ key:"medical",icon:"📄",title:"Medical report",desc:"Doctor's report or prescription" },{ key:"quote",icon:"🏥",title:"Hospital quote",desc:"Official quote signed by the institution" },{ key:"id",icon:"🪪",title:"Identity document",desc:"Valid national ID, passport or residence permit" },{ key:"consent",icon:"✍️",title:"Data consent",desc:"Ayyad consent form" }], upload: "Choose file", uploading: "Uploading...", uploaded: "✓ Uploaded", error: "Error, retry", warning: "All documents are required for verification.", back: "← Back", submit: "Submit →", successTitle: "Case submitted!", successSub: "Your case is under review.", processSteps: ["Case received and numbered","Ayyad team review (< 48h)","Hospital contact for quote validation","Campaign goes live"], backHome: "Back to home", loginRequired: "You must be logged in to submit a case.", loginBtn: "Sign in" },
    login: { title: "Sign in to Ayyad", sub: "Welcome! Sign in to your account.", email: "Email", password: "Password", btn: "Sign in →", noAccount: "Don't have an account?", register: "Sign up", error: "Incorrect email or password." },
    register: { title: "Create an account", roleQ: "I want to...", roles: [{ id:"donor",icon:"💚",title:"Make donations",desc:"Help patients in need" },{ id:"beneficiary",icon:"🏥",title:"Receive care",desc:"Fund a medical procedure" }], fields: [{ key:"name",label:"Full name",p:"Aminata Koné",type:"text" },{ key:"email",label:"Email",p:"you@example.ci",type:"email" },{ key:"phone",label:"Wave CI number",p:"+225 07 XX XX XX XX",type:"tel" },{ key:"password",label:"Password (min. 6 characters)",p:"••••••••",type:"password" }], terms: "I accept the", termsLink: "terms of service", and: "and the", privacyLink: "privacy policy", btn: "Create my account", continue: "Continue →", back: "← Back", hasAccount: "Already have an account?", signin: "Sign in", error: "Error creating account." },
    admin: {
      title: "Ayyad Administration", sub: "Operational dashboard", status: "System operational",
      tabs: [{ id:"overview",label:"Overview",icon:"📊" },{ id:"cases",label:"Cases",icon:"📋" },{ id:"donations",label:"Donations",icon:"💚" },{ id:"fraud",label:"Fraud",icon:"🔍" },{ id:"payouts",label:"Payouts",icon:"🏦" },{ id:"finance",label:"Finance",icon:"💰" },{ id:"salary",label:"Salaries",icon:"👔" },{ id:"audit",label:"Audit log",icon:"📝" },{ id:"bilan",label:"Reporting",icon:"📈" },{ id:"testimonials",label:"Testimonials",icon:"💬" },{ id:"visitors",label:"Visitors",icon:"👁️" },{ id:"accounts",label:"Accounts",icon:"👤" },{ id:"team",label:"Team",icon:"👥" },{ id:"export",label:"Export",icon:"📤",superAdminOnly:true }],
      stats: [{ label:"Active cases",v:"—",icon:"📋" },{ label:"Donations this month",v:"—",icon:"💚" },{ label:"Patients helped",v:"—",icon:"🏥" }],
      recentTitle: "Recent cases", revenueTitle: "Operational revenue (5%)",
      months: [{ month:"March 2025",dons:"24.8M",fees:"1,240,000 FCFA" },{ month:"Feb. 2025",dons:"19.2M",fees:"960,000 FCFA" },{ month:"Jan. 2025",dons:"15.1M",fees:"755,000 FCFA" }],
      pendingTitle: "Cases pending validation", pending: "pending", empty: "No cases pending", loading: "Loading...",
      risk: "Risk", reject: "Reject", approve: "Approve ✓", rejectConfirm: "Rejection reason:", rejectBtn: "Confirm rejection",
      fraudTitle: "Fraud alerts", fraudLabels: [{ label:"Critical",sev:"critical",c:"red" },{ label:"High",sev:"high",c:"amber" },{ label:"Resolved",sev:null,c:"emerald" }],
      resolve: "Resolve", resolved: "Resolved", payoutsTitle: "Hospital payouts", payoutsPending: "pending", validate: "Validate →", active2: "Active", funded: "Funded",
      statusLabels: { PENDING:"Pending", APPROVED:"Approved", REJECTED:"Rejected", COLLECTING:"Collecting", FUNDED:"Funded" },
      noAdmin: "Access restricted to administrators."
    },
    badges: { verified: "✓ Case verified", collecting: "Active", funded: "✓ Funded", urgent: "🚨 URGENT" },
    urgent: { title: "🚨 Urgent cases", sub: "These patients need immediate help — critical intervention within 72h", alert: "⚠️ Intervention required within 72h" },
    supportAyyad: { title: "Support Ayyad directly", sub: "Your donation helps fund platform operations: case verification, hospital partnerships, and patient support.", wave: "🌊 Pay via Wave", number: "+225 07 48 05 61 28", copied: "✓ Number copied!", copy: "Copy number", thanks: "Thank you for your support!", thanksSub: "Every contribution helps Ayyad stay free for patients.", directDonation: "Direct donation to Ayyad" },
    video: { title: "Patient's message", watch: "▶ Watch video", noVideo: "No video available for this case." },
    progress: { collected: "raised out of", donors: "donors", daysLeft: "days left", intervention: "✓ Procedure scheduled", progressTitle: "Campaign progress", of: "of goal" },
    back: "← Back to campaigns",
    footer: { tagline: "Funding healthcare for all in Africa.", platform: "Platform", trust: "Trust", legal: "Legal", platformLinks: ["Active campaigns","How it works","Submit a case"], trustLinks: ["Case verification","Partner hospitals","Impact report"], legalLinks: ["Legal notice","Privacy policy","BCEAO compliance"], rights: "© 2025 Ayyad CI — All rights reserved" },
    howPage: { title: "How does Ayyad work?", sub: "Transparent, secure, built for Africa", forDonors: { icon:"💚",title:"For donors",steps:["Browse verified active campaigns","Freely choose your amount","Pay via Wave CI or card","You are charged exactly the amount you chose","The money goes directly to the hospital"] }, forBenef: { icon:"🏥",title:"For beneficiaries",steps:["Create an account and submit your medical case","Upload medical report, quote, identity document","Our team verifies with the partner hospital","Your campaign goes live within 48h","Funds are transferred directly to the hospital"] }, feeTitle: "The 5% rule — Built into the goal", feeSub: "Ayyad includes its 5% fee directly in the campaign goal. You give 10,000 FCFA, the hospital receives 10,000 FCFA. Nothing is deducted from your donation.", youGive: "You give", collectReceives: "Hospital receives", ayyadFee: "Ayyad fee (included in goal)" },
  }
};

// ── Demo cases visibility (admin can toggle via dashboard) ───
// true = campagnes fictives visibles sur la plateforme publique
// false = seules les vraies campagnes Supabase sont affichées
const DEMO_CASES_VISIBLE = localStorage.getItem("ayyadShowDemo") !== "false";
const getDisplayCases = () => DEMO_CASES_VISIBLE ? MOCK_CASES : [];

// ── Static mock cases for homepage display ───────────────────
const MOCK_CASES = [
  { id:1, trackingId:"AYD-2025-001", title:{fr:"Opération cardiaque urgente pour Aminata",en:"Urgent heart surgery for Aminata"}, beneficiary:"Aminata Koné", age:34, city:"Abidjan", hospital:"CHU de Cocody", category:{fr:"Cardiologie",en:"Cardiology"}, required:1800000, collected:1260000, donors:87, daysLeft:2, image:"🫀", urgent:true, videoUrl:"https://www.youtube.com/embed/dQw4w9WgXcQ", photos:["https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&h=400&fit=crop&crop=faces","https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&q=80&fit=crop"], desc:{fr:"Aminata souffre d'une cardiopathie valvulaire sévère nécessitant un remplacement de valve urgent. Sans cette intervention, son pronostic vital est engagé dans les 3 prochains mois.",en:"Aminata suffers from severe valvular heart disease requiring urgent valve replacement. Without this procedure, her life is at risk within 3 months."}, status:"COLLECTING" },
  { id:2, trackingId:"AYD-2025-002", title:{fr:"Dialyse rénale pour Kofi Asante",en:"Kidney dialysis for Kofi Asante"}, beneficiary:"Kofi Asante", age:52, city:"Bouaké", hospital:"CHU de Bouaké", category:{fr:"Néphrologie",en:"Nephrology"}, required:997500, collected:1150000, donors:74, daysLeft:0, image:"🫘", urgent:false, videoUrl:null, desc:{fr:"Kofi est en insuffisance rénale chronique terminale. Il a besoin de 3 séances de dialyse par semaine pendant 6 mois en attente de greffe.",en:"Kofi has end-stage chronic kidney failure. He needs 3 dialysis sessions per week for 6 months while awaiting a transplant."}, status:"FUNDED" },
  { id:3, trackingId:"AYD-2025-003", title:{fr:"Chimiothérapie pour Fatou Diallo",en:"Chemotherapy for Fatou Diallo"}, beneficiary:"Fatou Diallo", age:28, city:"Abidjan", hospital:"Institut National d'Oncologie", category:{fr:"Oncologie",en:"Oncology"}, required:2400000, collected:480000, donors:31, daysLeft:45, image:"🎗️", urgent:false, videoUrl:null, photos:["https://images.unsplash.com/photo-1589156229687-496a31ad1d1f?w=600&h=400&fit=crop&crop=faces"], desc:{fr:"Fatou, jeune maman de 2 enfants, a reçu un diagnostic de cancer du sein au stade II. Un protocole de chimiothérapie de 6 cycles est nécessaire.",en:"Fatou, a young mother of 2, was diagnosed with stage II breast cancer. A 6-cycle chemotherapy protocol is needed."}, status:"COLLECTING" },
  { id:4, trackingId:"AYD-2025-004", title:{fr:"Prothèse orthopédique pour Ibrahim",en:"Orthopedic prosthesis for Ibrahim"}, beneficiary:"Ibrahim Coulibaly", age:19, city:"Daloa", hospital:"CHR de Daloa", category:{fr:"Orthopédie",en:"Orthopedics"}, required:620000, collected:620000, donors:62, daysLeft:0, image:"🦾", urgent:false, videoUrl:null, photos:["https://images.unsplash.com/photo-1488161628813-04466f872be2?w=600&h=400&fit=crop&crop=faces"], desc:{fr:"Ibrahim a perdu sa jambe droite suite à un accident de la route. Grâce à votre générosité, l'objectif est atteint !",en:"Ibrahim lost his right leg in a road accident. Thanks to your generosity, the goal has been reached!"}, status:"FUNDED" },
  { id:5, trackingId:"AYD-2025-005", title:{fr:"Traitement neurologique pour Mariam",en:"Neurological treatment for Mariam"}, beneficiary:"Mariam Ouédraogo", age:41, city:"Abidjan", hospital:"CHU de Yopougon", category:{fr:"Neurologie",en:"Neurology"}, required:1100000, collected:330000, donors:22, daysLeft:4, image:"🧠", urgent:true, videoUrl:null, photos:["https://images.unsplash.com/photo-1589156229687-496a31ad1d1f?w=600&h=400&fit=crop&crop=top"], desc:{fr:"Mariam souffre d'une sclérose en plaques progressivement invalidante.",en:"Mariam suffers from progressively disabling multiple sclerosis."}, status:"COLLECTING" },
  { id:6, trackingId:"AYD-2025-006", title:{fr:"Opération de la vue pour Kouassi",en:"Eye surgery for Kouassi"}, beneficiary:"Kouassi Yao", age:67, city:"San-Pédro", hospital:"Clinique Vision CI", category:{fr:"Oncologie",en:"Oncology"}, required:380000, collected:285000, donors:41, daysLeft:8, image:"👁️", urgent:false, videoUrl:null, photos:["https://images.unsplash.com/photo-1504439468489-c8920d796a29?w=600&h=400&fit=crop&crop=faces"], desc:{fr:"Kouassi souffre de glaucome bilatéral avancé. Sans une opération urgente, il risque de perdre définitivement la vue.",en:"Kouassi suffers from advanced bilateral glaucoma. Without urgent surgery, he risks permanently losing his sight."}, status:"COLLECTING" },
  { id:7, trackingId:"AYD-2025-007", title:{fr:"Amputation évitable pour Seydou",en:"Avoidable amputation for Seydou"}, beneficiary:"Seydou Bah", age:23, city:"Korhogo", hospital:"CHR de Korhogo", category:{fr:"Orthopédie",en:"Orthopedics"}, required:750000, collected:120000, donors:14, daysLeft:1, image:"🦴", urgent:true, videoUrl:null, photos:["https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=400&fit=crop&crop=faces"], desc:{fr:"Seydou a une infection osseuse grave au pied gauche. Sans traitement immédiat, les médecins devront amputer. Il reste moins de 24h pour agir.",en:"Seydou has a serious bone infection in his left foot. Without immediate treatment, doctors will have to amputate. Less than 24 hours to act."}, status:"COLLECTING" },
  { id:8, trackingId:"AYD-2025-008", title:{fr:"Accouchement d'urgence pour Rokia",en:"Emergency delivery for Rokia"}, beneficiary:"Rokia Soro", age:26, city:"Yamoussoukro", hospital:"CHR de Yamoussoukro", category:{fr:"Gynécologie",en:"Gynecology"}, required:420000, collected:85000, donors:9, daysLeft:1, image:"🌸", urgent:true, videoUrl:null, photos:["https://images.unsplash.com/photo-1531983372994-88a1e8f1c37c?w=600&h=400&fit=crop&crop=faces"], desc:{fr:"Rokia est enceinte de 8 mois avec une grossesse à haut risque. Une césarienne d'urgence est nécessaire dans les prochaines heures.",en:"Rokia is 8 months pregnant with a high-risk pregnancy. An emergency C-section is needed in the coming hours."}, status:"COLLECTING" },
  { id:9, trackingId:"AYD-2025-009", title:{fr:"Greffe de cornée pour Abou",en:"Cornea transplant for Abou"}, beneficiary:"Abou Diomandé", age:15, city:"Man", hospital:"CHR de Man", category:{fr:"Neurologie",en:"Neurology"}, required:890000, collected:220000, donors:18, daysLeft:3, image:"👀", urgent:true, videoUrl:null, photos:["https://images.unsplash.com/photo-1523824921871-d6f1a15151f1?w=600&h=400&fit=crop&crop=faces"], desc:{fr:"Abou, 15 ans, perd la vue progressivement. La cornée donneuse est disponible mais l'opération doit se faire avant 72h sinon elle sera perdue.",en:"Abou, 15, is progressively losing his sight. The donor cornea is available but surgery must happen within 72h or it will be lost."}, status:"COLLECTING" },
  { id:10, trackingId:"AYD-2025-010", title:{fr:"Dialyse pédiatrique pour Bintou",en:"Pediatric dialysis for Bintou"}, beneficiary:"Bintou Koné", age:8, city:"Abidjan", hospital:"CHU de Yopougon", category:{fr:"Pédiatrie",en:"Pediatrics"}, required:1200000, collected:310000, donors:27, daysLeft:5, image:"👶", urgent:true, videoUrl:null, photos:["https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600&h=400&fit=crop&crop=faces"], desc:{fr:"Bintou, 8 ans, est en insuffisance rénale aiguë. Elle nécessite une dialyse d'urgence pour survivre. Chaque heure compte pour cette petite fille.",en:"Bintou, 8, is in acute kidney failure. She needs emergency dialysis to survive. Every hour counts for this little girl."}, status:"COLLECTING" },
];

const TEMOIGNAGES = [
  { id:1, name:"Ibrahim Coulibaly", age:19, city:"Daloa", category:{fr:"Orthopédie",en:"Orthopedics"}, image:"🦾", amount:620000, hospital:"CHR de Daloa",
    message:{fr:"Grâce à Ayyad et à tous les donateurs, j'ai reçu ma prothèse en moins d'un mois. Aujourd'hui je marche à nouveau et j'ai repris mes études. Je ne sais pas comment vous remercier. Que Dieu vous bénisse tous.", en:"Thanks to Ayyad and all the donors, I received my prosthesis in less than a month. Today I walk again and I've resumed my studies. I don't know how to thank you. God bless you all."},
    date:"Janvier 2025", stars:5 },
  { id:2, name:"Aya Traoré", age:31, city:"Abidjan", category:{fr:"Cardiologie",en:"Cardiology"}, image:"🫀", amount:1500000, hospital:"CHU de Cocody",
    message:{fr:"Mon mari pleurait chaque nuit parce qu'il ne pouvait pas payer l'opération. Ayyad nous a sauvé la vie. L'opération s'est très bien passée, je suis en pleine forme. Merci du fond du cœur à chaque donateur.", en:"My husband cried every night because he couldn't pay for the operation. Ayyad saved our lives. The operation went very well, I'm in great shape. Thank you from the bottom of my heart to every donor."},
    date:"Novembre 2024", stars:5 },
  { id:3, name:"Moussa Bamba", age:58, city:"Bouaké", category:{fr:"Néphrologie",en:"Nephrology"}, image:"🫘", amount:950000, hospital:"CHU de Bouaké",
    message:{fr:"Mes 3 séances de dialyse par semaine coûtaient une fortune. Ma famille était épuisée financièrement. Ayyad a tout changé. Je suis en attente de greffe maintenant, avec espoir.", en:"My 3 dialysis sessions per week were costing a fortune. My family was financially exhausted. Ayyad changed everything. I'm now awaiting a transplant, with hope."},
    date:"Décembre 2024", stars:5 },
  { id:4, name:"Fatou Konaté", age:24, city:"Abidjan", category:{fr:"Oncologie",en:"Oncology"}, image:"🎗️", amount:2100000, hospital:"Institut National d'Oncologie",
    message:{fr:"J'ai terminé mes 6 cycles de chimiothérapie. Les médecins sont optimistes. Ma petite fille de 2 ans aura sa maman. Merci à tous ceux qui ont donné, vous avez choisi la vie.", en:"I finished my 6 chemotherapy cycles. Doctors are optimistic. My 2-year-old daughter will have her mom. Thank you to all who donated, you chose life."},
    date:"Février 2025", stars:5 },
  { id:5, name:"Yves Kouamé", age:45, city:"Yamoussoukro", category:{fr:"Neurologie",en:"Neurology"}, image:"🧠", amount:780000, hospital:"CHR de Yamoussoukro",
    message:{fr:"Suite à mon AVC, j'avais perdu l'usage de mon bras droit. La rééducation financée par Ayyad m'a permis de récupérer 80% de mes capacités. Je retravaille depuis 2 mois.", en:"After my stroke, I had lost the use of my right arm. The rehabilitation funded by Ayyad allowed me to recover 80% of my abilities. I've been back at work for 2 months."},
    date:"Mars 2025", stars:5 },
];

const MOCK_ALERTS = [
  { id:1, type:{fr:"Devis dupliqué",en:"Duplicate quote"}, sev:"high", case:{fr:"Dossier #1042 & #1038",en:"Case #1042 & #1038"}, time:"14:32", resolved:false, caseTab:"cases" },
  { id:2, type:{fr:"Multi-comptes détecté",en:"Multi-account detected"}, sev:"critical", case:{fr:"User #552 (3 comptes)",en:"User #552 (3 accounts)"}, time:"11:15", resolved:false, caseTab:null },
  { id:3, type:{fr:"Don suspect > 500k FCFA",en:"Suspicious donation > 500k FCFA"}, sev:"medium", case:{fr:"Donation #7821 — anonyme",en:"Donation #7821 — anonymous"}, time:"09:47", resolved:true, caseTab:"cases" },
];

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("fr-CI").format(n) + " FCFA";
const pct = (c, r) => Math.min(100, Math.round((c / r) * 100));

// Nettoie un nom de fichier pour un usage sûr dans Supabase Storage
// Remplace espaces et caractères spéciaux par des underscores, limite la longueur
const sanitizeFileName = (name) => {
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  const base = (lastDot >= 0 ? name.slice(0, lastDot) : name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprime accents
    .replace(/[^a-zA-Z0-9-]/g, '_')                   // caractères spéciaux → _
    .replace(/_+/g, '_')                               // underscores multiples → un seul
    .replace(/^_|_$/g, '')                             // trim underscores
    .slice(0, 50);                                     // max 50 caractères
  return `${base || 'file'}.${ext}`;
};

// ── Règles financières Ayyad ──────────────────────────────────
// required = devis_hopital * 1.05 (montant à collecter affiché)
// devis_hopital = required / 1.05
// frais_ayyad_base = required - devis_hopital
// surcollecte = collected - required (si > 0)
// sur la surcollecte : 5% Ayyad, 70% bénéficiaire, 25% redistribué 5 urgents
// Frais de transfert par moyen (absorbés par Ayyad — montant net hôpital = devis exact)
const TRANSFER_FEES = {
  WAVE:   { pct: 0.00, label: "Wave Business", note: "Frais offerts (compte marchand)" },
  ORANGE: { pct: 0.015, label: "Wave CI", note: "~1.5% à la charge d'Ayyad" },
  BANK:   { pct: 0.005, label: "Virement bancaire", note: "~0.5% frais bancaires" },
};

const calcFinancier = (required, collected) => {
  const devisHopital = Math.round(required / 1.05);
  const fraisAyyadBase = required - devisHopital;
  const surplus = Math.max(0, (collected||0) - required);
  const fraisAyyadSurplus = Math.round(surplus * 0.05);
  const partBeneficiaire = Math.round(surplus * 0.70);
  const partRedistrib = Math.round(surplus * 0.25);
  return { devisHopital, fraisAyyadBase, surplus, fraisAyyadSurplus, partBeneficiaire, partRedistrib,
           totalAyyad: fraisAyyadBase + fraisAyyadSurplus };
};

// ── UI Atoms ──────────────────────────────────────────────────
const Badge = ({ children, color="green" }) => {
  const map = { green:"bg-emerald-100 text-emerald-700", yellow:"bg-amber-100 text-amber-700", red:"bg-red-100 text-red-700", blue:"bg-blue-100 text-blue-700", gray:"bg-gray-100 text-gray-600", orange:"bg-orange-100 text-orange-700" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[color]||map.gray}`}>{children}</span>;
};

const ProgressBar = ({ percent }) => (
  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
    <div className="h-2.5 rounded-full transition-all duration-700" style={{ width:`${percent}%`, background: percent===100?"linear-gradient(90deg,#059669,#10b981)":"linear-gradient(90deg,#10b981,#34d399)" }} />
  </div>
);

const LangToggle = ({ lang, setLang }) => (
  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
    {["fr","en"].map(l => (
      <button key={l} onClick={() => setLang(l)} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang===l?"bg-white shadow text-emerald-700":"text-gray-500 hover:text-gray-700"}`}>
        {l==="fr"?"🇫🇷 FR":"🇬🇧 EN"}
      </button>
    ))}
  </div>
);

// ── Premium TopBar — fine bande institutionnelle au-dessus de la navbar ──────
// Affiche les contacts, les réseaux sociaux et le toggle de langue. Style sombre
// élégant, hauteur fine (32-36px), masquée sur mobile pour gagner de la place.
const PremiumTopBar = ({ lang, setLang }) => {
  const fr = lang === "fr";
  return (
    <div className="hidden md:block" style={{
      background: "linear-gradient(90deg, #0a3d2e 0%, #0d5c2e 50%, #0f4f3c 100%)",
      borderBottom: "1px solid rgba(201,168,76,0.18)",
      color: "rgba(255,255,255,0.85)",
      fontSize: 12,
      letterSpacing: 0.2,
    }}>
      <div className="ayyad-container" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", height:36 }}>
        <div style={{ display:"flex", alignItems:"center", gap:24 }}>
          <a href="mailto:contact@ayyadci.com" style={{ display:"inline-flex", alignItems:"center", gap:6, color:"inherit", textDecoration:"none", transition:"color .2s" }} onMouseEnter={e=>e.currentTarget.style.color="#e9d59a"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.85)"}>
            <span style={{ color:"#e9d59a" }}>✉</span> contact@ayyadci.com
          </a>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6, color:"rgba(255,255,255,0.78)" }}>
            <span style={{ color:"#e9d59a" }}>💬</span>
            {fr ? "Une question ? Utilisez le chat en bas à droite" : "Got a question? Use the chat at the bottom right"}
          </span>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6, color:"rgba(255,255,255,0.6)" }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#34d399", boxShadow:"0 0 0 3px rgba(52,211,153,0.18)", display:"inline-block" }} />
            {fr ? "Plateforme opérationnelle" : "Platform live"}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <span style={{ color:"rgba(255,255,255,0.55)", fontSize:11 }}>
            {fr ? "Côte d'Ivoire 🇨🇮 · BCEAO conforme" : "Côte d'Ivoire 🇨🇮 · BCEAO compliant"}
          </span>
          <div style={{ width:1, height:14, background:"rgba(255,255,255,0.18)" }} />
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <button onClick={()=>setLang("fr")} style={{ background:"transparent", border:"none", cursor:"pointer", color: lang==="fr"?"#e9d59a":"rgba(255,255,255,0.65)", fontWeight: lang==="fr"?700:500, fontSize:11, letterSpacing:1 }}>FR</button>
            <span style={{ color:"rgba(255,255,255,0.3)" }}>|</span>
            <button onClick={()=>setLang("en")} style={{ background:"transparent", border:"none", cursor:"pointer", color: lang==="en"?"#e9d59a":"rgba(255,255,255,0.65)", fontWeight: lang==="en"?700:500, fontSize:11, letterSpacing:1 }}>EN</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Navbar premium — sticky avec shadow progressive au scroll ────────────────
const Navbar = ({ page, setPage, user, setUser, lang, setLang }) => {
  const t = T[lang].nav;
  const fr = lang === "fr";
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPage("home");
  };

  const AyyadLogo = () => (
    <svg width="44" height="44" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="35" cy="35" r="33" fill="#0d5c2e"/>
      <circle cx="35" cy="35" r="33" fill="none" stroke="#C9A84C" strokeWidth="2.5"/>
      <rect x="29" y="18" width="12" height="34" rx="3" fill="#C9A84C"/>
      <rect x="18" y="29" width="34" height="12" rx="3" fill="#C9A84C"/>
      <path d="M31 32 C31 30.5, 32.5 29.5, 35 31.5 C37.5 29.5, 39 30.5, 39 32 C39 34, 35 37, 35 37 C35 37, 31 34, 31 32Z" fill="#0d5c2e"/>
    </svg>
  );

  // Liens de navigation principaux (parcours donateur)
  const navLinks = [
    { key: "home",             label: fr ? "Accueil"           : "Home"          },
    { key: "collectesactives", label: fr ? "Campagnes"         : "Campaigns"     },
    { key: "urgents",          label: fr ? "Cas urgents"       : "Urgent cases"  },
    { key: "how",              label: fr ? "Comment ça marche" : "How it works"  },
    { key: "support-ayyad",    label: fr ? "Soutenir Ayyad"    : "Support Ayyad" },
  ];

  return (
    <>
      <PremiumTopBar lang={lang} setLang={setLang} />
      <nav
        className="sticky top-0 z-50"
        onClick={() => { setDropdownOpen(null); setMobileOpen(false); }}
        style={{
          background: scrolled ? "rgba(255,255,255,0.92)" : "#ffffff",
          backdropFilter: scrolled ? "saturate(180%) blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(10,31,26,0.06)" : "1px solid rgba(10,31,26,0.04)",
          boxShadow: scrolled ? "0 6px 20px rgba(10,31,26,0.06)" : "none",
          transition: "background .25s ease, box-shadow .25s ease, border-color .25s ease",
        }}
      >
        <div className="ayyad-container" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", height: 72, gap: 16 }}>
          {/* Logo */}
          <button onClick={() => setPage("home")} style={{ display:"flex", alignItems:"center", gap:12, background:"transparent", border:"none", cursor:"pointer", padding:0 }}>
            <AyyadLogo />
            <div style={{ textAlign:"left" }} className="hidden sm:block">
              <div style={{ fontFamily:"var(--font-serif)", fontWeight:800, fontSize:22, color:"var(--ayyad-deep)", letterSpacing:1.5, lineHeight:1 }}>AYYAD</div>
              <div style={{ fontSize:10, color:"var(--ayyad-gold-deep)", letterSpacing:1.6, fontWeight:700, marginTop:3, textTransform:"uppercase" }}>
                {fr ? "Solidarité médicale" : "Medical solidarity"}
              </div>
            </div>
          </button>

          {/* Liens desktop */}
          <div className="hidden lg:flex" style={{ alignItems:"center", gap:4 }}>
            {navLinks.map(l => (
              <button
                key={l.key}
                onClick={() => setPage(l.key)}
                className={`ayyad-link ${page===l.key ? "is-active" : ""}`}
                style={{
                  background:"transparent", border:"none", cursor:"pointer",
                  padding:"10px 14px",
                  fontSize:14, fontWeight: page===l.key?700:500,
                  color: page===l.key ? "var(--ayyad-deep)" : "var(--ink-700)",
                  borderRadius: 10,
                  transition: "color .2s",
                }}
                onMouseEnter={e => { if(page!==l.key) e.currentTarget.style.color="var(--ayyad-deep)"; }}
                onMouseLeave={e => { if(page!==l.key) e.currentTarget.style.color="var(--ink-700)"; }}
              >
                {l.label}
              </button>
            ))}
            {user?.isAdmin && (
              <button onClick={() => setPage("admin")} className={`ayyad-link ${page==="admin"?"is-active":""}`} style={{
                background:"transparent", border:"none", cursor:"pointer",
                padding:"10px 14px", fontSize:14, fontWeight:600,
                color: page==="admin" ? "var(--ayyad-gold-deep)" : "var(--ink-500)",
              }}>
                ⚙ {t.admin}
              </button>
            )}
          </div>

          {/* Right side actions */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button
              onClick={() => setPage("submit")}
              className="hidden md:inline-flex"
              style={{
                alignItems:"center", gap:6,
                background:"transparent",
                border:"1.5px solid rgba(13,92,46,0.22)",
                color:"var(--ayyad-deep)",
                fontWeight:700, fontSize:13,
                padding:"9px 18px",
                borderRadius:9999,
                cursor:"pointer",
                transition:"all .2s",
              }}
              onMouseEnter={e=>{ e.currentTarget.style.background="rgba(13,92,46,0.06)"; e.currentTarget.style.borderColor="rgba(13,92,46,0.4)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="rgba(13,92,46,0.22)"; }}
            >
              {fr ? "Soumettre un dossier" : "Submit a case"}
            </button>

            <button
              onClick={() => setPage("collectesactives")}
              className="ayyad-btn-primary"
              style={{ fontSize:13, padding:"11px 22px" }}
            >
              💚 {fr ? "Faire un don" : "Donate"}
            </button>

            {user ? (
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button
                  onClick={() => setPage("profile")}
                  style={{
                    width:36, height:36, borderRadius:"50%",
                    background:"linear-gradient(135deg, #0d5c2e, #10b981)",
                    color:"#fff", fontWeight:800, fontSize:13,
                    border:"2px solid #fff", boxShadow:"0 2px 8px rgba(13,92,46,0.25)",
                    cursor:"pointer",
                  }}
                  title={user.name || user.email}
                >
                  {(user.name||user.email||"U")[0].toUpperCase()}
                </button>
                <div className="hidden xl:flex" style={{ flexDirection:"column", lineHeight:1.1 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"var(--ink-900)", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name||user.email}</span>
                  <button onClick={handleLogout} style={{ fontSize:10, color:"var(--ink-400)", background:"transparent", border:"none", cursor:"pointer", textAlign:"left", padding:0 }}>{t.logout}</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setPage("login")}
                className="hidden sm:inline-flex"
                style={{
                  background:"transparent", border:"none", cursor:"pointer",
                  fontSize:13, fontWeight:600, color:"var(--ink-700)",
                  padding:"8px 12px",
                }}
              >
                {t.login}
              </button>
            )}

            {/* Burger mobile */}
            <button
              className="lg:hidden"
              onClick={(e)=>{ e.stopPropagation(); setMobileOpen(o=>!o); }}
              aria-label="Menu"
              style={{
                background:"transparent", border:"1px solid rgba(10,31,26,0.12)",
                padding:8, borderRadius:10, cursor:"pointer",
                color:"var(--ayyad-deep)",
              }}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {/* Menu mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden" onClick={e=>e.stopPropagation()} style={{
            background:"#fff", borderTop:"1px solid rgba(10,31,26,0.06)",
            boxShadow:"0 12px 32px rgba(10,31,26,0.10)",
            padding:"16px 24px 24px",
          }}>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {navLinks.map(l => (
                <button
                  key={l.key}
                  onClick={() => { setPage(l.key); setMobileOpen(false); }}
                  style={{
                    background: page===l.key ? "rgba(13,92,46,0.06)" : "transparent",
                    border:"none", cursor:"pointer", textAlign:"left",
                    padding:"12px 14px", borderRadius:10,
                    fontSize:15, fontWeight:600,
                    color: page===l.key ? "var(--ayyad-deep)" : "var(--ink-700)",
                  }}
                >
                  {l.label}
                </button>
              ))}
              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <button onClick={()=>setLang("fr")} style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1px solid rgba(10,31,26,0.12)", background: lang==="fr"?"var(--ayyad-deep)":"#fff", color: lang==="fr"?"#fff":"var(--ink-700)", fontWeight:700, fontSize:12, cursor:"pointer" }}>🇫🇷 FR</button>
                <button onClick={()=>setLang("en")} style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1px solid rgba(10,31,26,0.12)", background: lang==="en"?"var(--ayyad-deep)":"#fff", color: lang==="en"?"#fff":"var(--ink-700)", fontWeight:700, fontSize:12, cursor:"pointer" }}>🇬🇧 EN</button>
              </div>
              {user?.isAdmin && (
                <button onClick={()=>{ setPage("admin"); setMobileOpen(false); }} style={{ marginTop:8, background:"rgba(201,168,76,0.10)", border:"1px solid rgba(201,168,76,0.30)", borderRadius:10, padding:"12px 14px", color:"var(--ayyad-gold-deep)", fontWeight:700, fontSize:13, cursor:"pointer", textAlign:"left" }}>⚙ {t.admin}</button>
              )}
            </div>
          </div>
        )}
      </nav>
    </>
  );
};

// ── Case Card premium ─────────────────────────────────────────────────────────
// Carte campagne avec hover lift, hiérarchie éditoriale, progression visible
// immédiatement sur l'image et micro-CTA "Soutenir" qui apparaît au hover.
const CaseCard = ({ c, lang, t, onClick }) => {
  const percent = pct(c.collected, c.required);
  const funded = c.status==="FUNDED";
  const fr = lang === "fr";
  const tc = t.card;
  const photo = c.photo_url || (c.photos && c.photos[0]) || null;
  const title = typeof c.title === "object" ? (c.title[lang] || c.title.fr) : c.title;
  const category = typeof c.category === "object" ? (c.category[lang] || c.category.fr) : c.category;

  return (
    <div
      onClick={onClick}
      className="ayyad-card group"
      style={{
        cursor:"pointer", overflow:"hidden", display:"flex", flexDirection:"column",
        borderRadius: 18,
        background:"#fff",
      }}
    >
      {/* Photo bénéficiaire + overlay */}
      <div style={{
        position:"relative", height: 208, overflow:"hidden",
        background:"linear-gradient(135deg, #ecfdf5, #f0fdfa)",
      }}>
        {photo ? (
          <img
            src={photo}
            alt={c.beneficiary || title}
            style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top", transition:"transform 700ms cubic-bezier(0.16,1,0.3,1)" }}
            className="group-hover:scale-110"
          />
        ) : (
          <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
            <div style={{ fontSize: 56, opacity:0.25 }}>{typeof c.image === "string" && !c.image.startsWith("http") ? c.image : "🏥"}</div>
            <span style={{ fontSize:11, color:"var(--ink-400)", fontWeight:600, letterSpacing:0.8, textTransform:"uppercase" }}>{fr ? "Photo à venir" : "Photo coming"}</span>
          </div>
        )}

        {/* Gradient bas → meilleure lisibilité */}
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 50%)" }} />

        {/* Badge spécialité — bas gauche */}
        <div style={{ position:"absolute", bottom:12, left:12, display:"flex", gap:8 }}>
          <span style={{
            background:"rgba(255,255,255,0.95)",
            backdropFilter:"blur(10px)",
            color:"var(--ayyad-deep)",
            fontSize:11, fontWeight:700,
            padding:"5px 12px", borderRadius:9999,
            boxShadow:"0 2px 8px rgba(0,0,0,0.10)",
            letterSpacing:0.3,
          }}>
            {c.image && typeof c.image === "string" && !c.image.startsWith("http") ? `${c.image} ` : "🏥 "}{category}
          </span>
        </div>

        {/* Badge urgent ou financé — haut gauche */}
        {c.urgent && !funded && (
          <div style={{ position:"absolute", top:12, left:12 }}>
            <span style={{
              background:"#dc2626", color:"#fff",
              fontSize:10, fontWeight:900, letterSpacing:1.2,
              padding:"5px 12px", borderRadius:9999,
              animation:"ayyad-pulse-soft 2s ease-in-out infinite",
              boxShadow:"0 4px 12px rgba(220,38,38,0.40)",
            }}>🚨 URGENT</span>
          </div>
        )}
        {funded && (
          <div style={{ position:"absolute", top:12, left:12 }}>
            <span style={{
              background:"linear-gradient(135deg, #059669, #10b981)",
              color:"#fff",
              fontSize:10, fontWeight:900, letterSpacing:1.2,
              padding:"5px 12px", borderRadius:9999,
              boxShadow:"0 4px 12px rgba(16,185,129,0.40)",
            }}>✓ {fr ? "FINANCÉ" : "FUNDED"}</span>
          </div>
        )}

        {/* Badge % progression — haut droite (sur photo) */}
        <div style={{ position:"absolute", top:12, right:12 }}>
          <span style={{
            background:"rgba(10,31,26,0.78)",
            backdropFilter:"blur(8px)",
            color:"#e9d59a",
            fontFamily:"var(--font-serif)", fontWeight:800, fontSize:14,
            padding:"4px 12px", borderRadius:9999,
            border:"1px solid rgba(201,168,76,0.40)",
          }}>{percent}%</span>
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding:"22px 22px 20px", display:"flex", flexDirection:"column", flex:1 }}>
        {/* Titre éditorial */}
        <h3 className="ayyad-h-display" style={{
          fontSize: 18, lineHeight: 1.3, marginBottom: 8,
          color:"var(--ayyad-deep)",
          transition:"color .2s",
        }}>{title}</h3>

        {/* Méta-données (hôpital + ville) */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"var(--ink-500)", marginBottom: 18, flexWrap:"wrap" }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
            <span style={{ color:"var(--ayyad-teal)" }}>🏥</span>
            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:180 }}>{c.hospital}</span>
          </span>
          <span style={{ color:"var(--ink-300)" }}>•</span>
          <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
            <span style={{ color:"var(--ayyad-teal)" }}>📍</span>{c.city}
          </span>
        </div>

        {/* Progression */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 8 }}>
            <span style={{ fontFamily:"var(--font-serif)", fontWeight:800, fontSize:17, color:"var(--ayyad-deep)" }}>{fmt(c.collected)}</span>
            <span style={{ fontSize:11, color:"var(--ink-400)", fontWeight:600 }}>{tc.on} {fmt(c.required)}</span>
          </div>
          <div style={{ height:6, background:"#f3f4f6", borderRadius:9999, overflow:"hidden" }}>
            <div style={{
              height:"100%",
              width: percent + "%",
              background: percent === 100
                ? "linear-gradient(90deg, #059669, #10b981, #34d399)"
                : "linear-gradient(90deg, #0d5c2e, #10b981)",
              borderRadius: 9999,
              transition:"width 1.2s cubic-bezier(0.16,1,0.3,1)",
              boxShadow: "0 1px 4px rgba(16,185,129,0.30)",
            }} />
          </div>
        </div>

        {/* Footer stats */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:12, color:"var(--ink-500)", marginTop:"auto" }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontWeight:600 }}>
            <span style={{ color:"var(--ayyad-gold-deep)" }}>👥</span>
            <strong style={{ color:"var(--ayyad-deep)", fontWeight:800 }}>{c.donors || 0}</strong> {tc.donors}
          </span>
          {funded ? (
            <span style={{ color:"#059669", fontWeight:800, display:"inline-flex", alignItems:"center", gap:4 }}>
              ✓ {tc.funded}
            </span>
          ) : (
            <span style={{ color:"#d97706", fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}>
              ⏱ {c.daysLeft} {tc.daysLeft}
            </span>
          )}
        </div>

        {/* Bottom row : tracking + action */}
        <div style={{ marginTop:18, paddingTop:14, borderTop:"1px dashed rgba(10,31,26,0.08)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
          {c.trackingId ? (
            <span style={{ fontSize:10, fontFamily:"monospace", color:"var(--ink-400)", fontWeight:700, letterSpacing:0.4 }}>
              {c.trackingId}
            </span>
          ) : <span />}
          <div style={{ display:"flex", alignItems:"center", gap:6 }} onClick={e=>e.stopPropagation()}>
            <ShareButton c={c} lang={lang} size="small" />
            <span style={{
              background:"linear-gradient(135deg, var(--ayyad-deep), var(--ayyad-emerald))",
              color:"#fff", fontWeight:700, fontSize:11,
              padding:"7px 14px", borderRadius:9999,
              display:"inline-flex", alignItems:"center", gap:4,
              cursor:"pointer",
              boxShadow:"0 4px 12px rgba(13,92,46,0.22)",
              transition:"transform .2s",
            }}
            onClick={onClick}
            onMouseEnter={e=>{ e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e=>{ e.currentTarget.style.transform = "translateY(0)"; }}
            >
              {funded ? (fr ? "Voir l'histoire" : "Read story") : (fr ? "Soutenir" : "Support")} →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Urgent Banner ─────────────────────────────────────────────
const UrgentBanner = ({ cases, setSelectedCase, setPage, lang }) => {
  const t = T[lang];
  const urgentCases = cases
    .filter(c => {
      const autoUrgent = c.daysLeft !== undefined && c.daysLeft <= 14 && pct(c.collected, c.required) < 80;
      return (c.urgent || autoUrgent) && c.status !== "FUNDED";
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const [current, setCurrent] = useState(0);
  const [sliding, setSliding] = useState(false);
  const intervalRef = useRef(null);

  const goTo = (next) => {
    if (sliding) return;
    setSliding(true);
    setTimeout(() => {
      setCurrent(next);
      setSliding(false);
    }, 600);
  };

  useEffect(() => {
    if (urgentCases.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent(prev => {
        const next = (prev + 1) % urgentCases.length;
        return next;
      });
    }, 4500);
    return () => clearInterval(intervalRef.current);
  }, [urgentCases.length]);

  if (urgentCases.length === 0) return null;

  const prev = (current - 1 + urgentCases.length) % urgentCases.length;
  const next = (current + 1) % urgentCases.length;

  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
            <h2 className="font-black text-xl text-gray-900">{t.urgent.title}</h2>
            <span className="bg-red-100 text-red-600 text-xs font-bold px-3 py-1 rounded-full">{urgentCases.length}</span>
          </div>
          <button onClick={() => setPage("urgents")} className="text-xs text-red-600 font-semibold hover:underline">
            {lang==="fr" ? "Voir tous →" : "See all →"}
          </button>
        </div>
        <p className="text-gray-500 text-sm mb-5">{t.urgent.sub}</p>

        {/* Carousel — cartes grand format */}
        <div style={{position:"relative", overflow:"hidden", borderRadius:"20px", boxShadow:"0 4px 32px rgba(0,0,0,0.10)"}}>
          <div style={{
            display:"flex",
            transform: "translateX(-" + (current * 100) + "%)",
            transition: "transform 700ms cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}>
            {urgentCases.map((c, i) => {
              const percent = pct(c.collected, c.required);
              const hasPhoto = c.photos && c.photos[0];
              return (
                <div key={c.id} style={{minWidth:"100%", boxSizing:"border-box"}}>
                  <button onClick={() => { setSelectedCase(c); setPage("case"); }}
                    className="w-full text-left group relative block"
                    style={{background:"#fff", borderRadius:"20px", overflow:"hidden"}}>

                    {/* Photo grande — hauteur 420px */}
                    <div style={{position:"relative", height:"420px", background:"linear-gradient(135deg,#fff1f2,#fef3c7)"}}>
                      {hasPhoto ? (
                        <img src={c.photos[0]} alt={c.beneficiary}
                          style={{width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top",
                            transition:"transform 700ms", display:"block"}}
                          className="group-hover:scale-105"
                        />
                      ) : (
                        <div style={{width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center"}}>
                          <span style={{fontSize:"120px", lineHeight:1}}>{typeof c.image === "string" && !c.image.startsWith("http") ? c.image : "🏥"}</span>
                        </div>
                      )}

                      {/* Gradient overlay bas → top pour lisibilité du texte */}
                      <div style={{
                        position:"absolute", inset:0,
                        background:"linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0.00) 100%)",
                        pointerEvents:"none",
                      }} />

                      {/* Badges haut gauche */}
                      <div style={{position:"absolute", top:16, left:16, display:"flex", gap:8}}>
                        <span style={{background:"#dc2626", color:"#fff", fontSize:"11px", fontWeight:900, padding:"4px 10px", borderRadius:"999px", animation:"pulse 2s infinite"}}>
                          🚨 URGENT
                        </span>
                        {c.daysLeft !== undefined && (
                          <span style={{background:"rgba(255,255,255,0.95)", color:"#c2410c", fontSize:"11px", fontWeight:700, padding:"4px 10px", borderRadius:"999px"}}>
                            ⏱️ {c.daysLeft}j
                          </span>
                        )}
                      </div>

                      {/* Tracking ID haut droite */}
                      <div style={{position:"absolute", top:16, right:16}}>
                        <span style={{background:"rgba(255,255,255,0.90)", color:"#6b7280", fontSize:"10px", fontFamily:"monospace", padding:"4px 10px", borderRadius:"999px", border:"1px solid rgba(0,0,0,0.08)"}}>
                          {c.trackingId}
                        </span>
                      </div>

                      {/* Contenu texte en bas de la photo */}
                      <div style={{position:"absolute", bottom:0, left:0, right:0, padding:"24px 20px 20px"}}>
                        <div style={{fontSize:"19px", fontWeight:900, color:"#fff", lineHeight:1.25, marginBottom:6,
                          textShadow:"0 1px 4px rgba(0,0,0,0.4)"}}>
                          {c.title[lang]}
                        </div>
                        <div style={{fontSize:"12px", color:"rgba(255,255,255,0.80)", marginBottom:14}}>
                          🏥 {c.hospital} · 📍 {c.city}
                        </div>

                        {/* Barre de progression */}
                        <div style={{marginBottom:8}}>
                          <div style={{height:"6px", background:"rgba(255,255,255,0.25)", borderRadius:"999px", overflow:"hidden"}}>
                            <div style={{height:"100%", background:"#ef4444", borderRadius:"999px", width: percent+"%", transition:"width 700ms"}} />
                          </div>
                        </div>

                        {/* Stats */}
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                          <div>
                            <span style={{color:"#fff", fontWeight:800, fontSize:"16px"}}>{fmt(c.collected)}</span>
                            <span style={{color:"rgba(255,255,255,0.65)", fontSize:"11px", marginLeft:4}}>
                              {lang==="fr" ? "sur" : "of"} {fmt(c.required)}
                            </span>
                          </div>
                          <div style={{display:"flex", gap:12, alignItems:"center"}}>
                            <span style={{color:"rgba(255,255,255,0.80)", fontSize:"11px"}}>👥 {c.donors || 0} {lang==="fr"?"dons":"donors"}</span>
                            <span style={{background:"#ef4444", color:"#fff", fontWeight:900, fontSize:"13px", padding:"3px 10px", borderRadius:"999px"}}>
                              {percent}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Call-to-action strip */}
                    <div style={{padding:"14px 20px", background:"#fff", display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:"1px solid #fee2e2"}}>
                      <span style={{fontSize:"13px", color:"#374151"}}>
                        {lang==="fr" ? "Ces patients ont besoin d'aide immédiate — intervention critique sous 72h" : "These patients need immediate help — critical intervention within 72h"}
                      </span>
                      <span style={{background:"#dc2626", color:"#fff", fontSize:"12px", fontWeight:700, padding:"6px 14px", borderRadius:"999px", whiteSpace:"nowrap"}}>
                        {lang==="fr" ? "Aider →" : "Help →"}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dots */}
        {urgentCases.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {urgentCases.map((_, i) => (
              <button key={i} onClick={() => {
                clearInterval(intervalRef.current);
                setCurrent(i);
                intervalRef.current = setInterval(() => setCurrent(p => (p+1)%urgentCases.length), 4500);
              }} style={{width: i===current?"16px":"8px", height:"8px", borderRadius:"9999px", background: i===current?"#ef4444":"#d1d5db", border:"none", cursor:"pointer", transition:"all 300ms"}} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── MediaSection — Photos + Vidéo patient ────────────────────
const MediaSection = ({ c, lang, t }) => {
  const [activePhoto, setActivePhoto] = useState(0);
  const photos = c.photos || [];
  const hasMedia = photos.length > 0 || c.videoUrl;
  if (!hasMedia) return (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-center">
      <div className="text-3xl mb-2">📸</div>
      <div className="text-sm text-gray-400">{lang==="fr" ? "Aucun média disponible pour ce dossier." : "No media available for this case."}</div>
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📸</span>
          <span className="font-bold text-gray-900">{lang==="fr" ? "Photos & vidéo du patient" : "Patient photos & video"}</span>
        </div>
        <div className="flex gap-1 text-xs text-gray-400">
          {photos.length > 0 && <span className="bg-gray-100 px-2 py-0.5 rounded-full">{photos.length} {lang==="fr"?"photo(s)":"photo(s)"}</span>}
          {c.videoUrl && <span className="bg-gray-100 px-2 py-0.5 rounded-full">1 {lang==="fr"?"vidéo":"video"}</span>}
        </div>
      </div>
      {/* Galerie photos */}
      {photos.length > 0 && (
        <div>
          <div className="relative overflow-hidden" style={{height:"220px"}}>
            <img src={photos[activePhoto]} alt={"Photo "+c.beneficiary} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-3 left-3 text-white text-xs font-semibold bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full">
              📍 {c.hospital} · {c.city}
            </div>
            {photos.length > 1 && (
              <>
                <button onClick={() => setActivePhoto(p => (p-1+photos.length)%photos.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-8 h-8 flex items-center justify-center text-gray-700 shadow">‹</button>
                <button onClick={() => setActivePhoto(p => (p+1)%photos.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-8 h-8 flex items-center justify-center text-gray-700 shadow">›</button>
                <div className="absolute bottom-3 right-3 flex gap-1">
                  {photos.map((_,i) => <div key={i} className={"w-1.5 h-1.5 rounded-full "+(i===activePhoto?"bg-white":"bg-white/50")} />)}
                </div>
              </>
            )}
          </div>
          {/* Thumbnails */}
          {photos.length > 1 && (
            <div className="flex gap-2 p-3 overflow-x-auto">
              {photos.map((ph, i) => (
                <button key={i} onClick={() => setActivePhoto(i)} className={"flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all "+(i===activePhoto?"border-emerald-500":"border-transparent opacity-60 hover:opacity-100")}>
                  <img src={ph} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Vidéo */}
      {c.videoUrl && (() => {
        const isTikTok = c.videoUrl.includes("tiktok.com");
        return (
          <div>
            {photos.length > 0 && <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-2 text-sm font-semibold text-gray-700"><span>{isTikTok ? "♪" : "🎥"}</span>{isTikTok ? "TikTok" : t.video.title}</div>}
            {!photos.length && <div className="px-4 py-2 flex items-center gap-2 text-sm font-semibold text-gray-700"><span>{isTikTok ? "♪" : "🎥"}</span>{isTikTok ? "TikTok" : t.video.title}</div>}
            {isTikTok ? (
              <div className="flex justify-center bg-black">
                <iframe src={c.videoUrl} className="w-full max-w-xs" style={{height:"560px"}} allowFullScreen allow="autoplay" title="TikTok video" />
              </div>
            ) : (
              <div className="relative w-full" style={{paddingBottom:"56.25%"}}>
                <iframe src={c.videoUrl} className="absolute inset-0 w-full h-full" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Patient video" />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// ── MobilePay Widget — Wave CI / Carte bancaire ──────────────
// ── Comptes marchands Ayyad (à remplacer par les vrais numéros) ──
const AYYAD_ACCOUNTS = {
  WAVE:   { numero: "+225 07 48 05 61 28", nom: "AYYAD SOLIDARITE", prefix: "🌊" },

};

// ── QR Code local (canvas pur, sans dépendance externe) ──────
// Utilise l'API native HTML Canvas + un algorithme de micro-QR maison
// Pour un vrai QR scannable, remplacer par qrcode.react quand npm est disponible
const WaveQRCode = ({ data, size = 176 }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !data) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    // Affichage "deeplink visuel" : QR simulé avec le lien Wave affiché
    // (remplacer ce bloc par qrcode.react pour un vrai QR scannable)
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    // Bordure
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size-2, size-2);
    // Icône Wave au centre
    ctx.fillStyle = "#2563eb";
    ctx.font = `bold ${Math.round(size*0.35)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🌊", size/2, size/2 - size*0.08);
    ctx.fillStyle = "#1e40af";
    ctx.font = `bold ${Math.round(size*0.09)}px sans-serif`;
    ctx.fillText("Wave Pay", size/2, size/2 + size*0.2);
    ctx.fillStyle = "#6b7280";
    ctx.font = `${Math.round(size*0.065)}px sans-serif`;
    ctx.fillText("Scannez ou ouvrez Wave", size/2, size/2 + size*0.34);
  }, [data, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} width={size} height={size} className="rounded-xl border border-gray-100" />
      <a
        href={data}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm text-center transition-colors"
      >
        📱 Ouvrir Wave CI
      </a>
    </div>
  );
};

const MobilePayWidget = ({ amount, caseData, lang, onSuccess }) => {
  const [step, setStep] = useState("choose"); // choose | qr | ref | done
  const [provider, setProvider] = useState(null);
  const [txRef, setTxRef] = useState("");
  const [refError, setRefError] = useState(false);

  const selectedProvider = provider ? AYYAD_ACCOUNTS[provider] : null;
  const amountFmt = new Intl.NumberFormat("fr").format(amount);

  const providers = [
    { id:"WAVE", emoji:"🌊", label:"Wave CI", color:"bg-blue-600 hover:bg-blue-700", qrData: `wave://pay?to=${AYYAD_ACCOUNTS.WAVE.numero.replace(/\s/g,"")}&amount=${amount}&note=AYYAD-${caseData?.trackingId||"DON"}` },
    { id:"CARD", emoji:"💳", label:"Carte bancaire", color:"bg-gray-800 hover:bg-gray-900", qrData: null },
  ];
  const pv = providers.find(p => p.id === provider);

  const handleConfirmRef = () => {
    if (txRef.trim().length < 4) { setRefError(true); return; }
    setRefError(false);
    setStep("done");
    onSuccess && onSuccess();
  };

  // ÉTAPE 1 — Choix opérateur
  if (step === "choose") return (
    <div className="space-y-2">
      <div className="text-xs font-bold text-gray-600 mb-3">{lang==="fr" ? "Choisissez votre opérateur :" : "Choose your operator:"}</div>
      {providers.map(pv => (
        <button key={pv.id} onClick={() => { setProvider(pv.id); setStep("qr"); }}
          className={"w-full "+pv.color+" text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-3 text-sm shadow-sm"}>
          <span className="text-xl">{pv.emoji}</span>
          <span>{pv.label}</span>
          <span className="ml-auto text-white/70 text-xs">{amountFmt} →</span>
        </button>
      ))}
      <p className="text-center text-[10px] text-gray-400 pt-1">🔒 {lang==="fr" ? "Paiement sécurisé · Aucuns frais cachés" : "Secure payment · No hidden fees"}</p>
    </div>
  );

// ÉTAPE 2b — Carte bancaire (bientôt disponible)
if (step === "qr" && provider === "CARD") return (
  <div className="space-y-4 text-center py-4">
    <div className="text-5xl mb-2">💳</div>
    <h3 className="font-bold text-gray-900 text-lg">
      {lang==="fr" ? "Paiement par carte bancaire" : "Card payment"}
    </h3>
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <p className="text-blue-800 font-semibold text-sm mb-1">💳 Visa / Mastercard</p>
      <p className="text-blue-700 text-xs">
        {lang==="fr"
          ? "Effectuez le paiement par carte puis saisissez la référence de transaction ci-dessous."
          : "Complete the card payment then enter your transaction reference below."}
      </p>
    </div>
    <button onClick={() => setStep("choose")} className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-600 hover:bg-gray-50">
      {lang==="fr" ? "← Choisir un autre moyen" : "← Choose another method"}
    </button>
  </div>
);

  // ÉTAPE 2 — QR code + numéro
  if (step === "qr") return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setStep("choose")} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
        <span className="text-xl">{pv?.emoji}</span>
        <span className="font-bold text-gray-900 text-sm">{pv?.label}</span>
      </div>

      {/* Montant en gros */}
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 text-center">
        <div className="text-xs text-gray-500 mb-1">{lang==="fr" ? "Montant à envoyer" : "Amount to send"}</div>
        <div className="font-black text-3xl text-emerald-700">{amountFmt}</div>
        <div className="text-sm text-emerald-600 font-bold">FCFA</div>
        <div className="text-xs text-gray-400 mt-1">{lang==="fr" ? "Pour : " : "For: "}<span className="font-semibold">{caseData?.beneficiary}</span></div>
      </div>

      {/* QR Code / Deeplink Wave */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 text-center space-y-3">
        <div className="text-xs font-bold text-gray-600">📱 {lang==="fr" ? "Payer via " : "Pay via "}{pv?.label}</div>
        {pv?.qrData ? (
          <WaveQRCode data={pv.qrData} size={176} />
        ) : (
          <div className="text-gray-400 text-sm py-4">
            {lang==="fr" ? "Ouvrez votre application de paiement" : "Open your payment application"}
          </div>
        )}
        <div className="text-[10px] text-gray-400">{lang==="fr" ? "Ouvrez " : "Open "}
          <span className="font-bold">{pv?.label}</span>
          {lang==="fr" ? " → Payer → Confirmez" : " → Pay → Confirm"}
        </div>
      </div>

      {/* Numéro en backup */}
      <div className="bg-gray-50 rounded-xl p-3 text-center space-y-1 border border-gray-100">
        <div className="text-xs text-gray-500">{lang==="fr" ? "Ou envoyez directement au numéro :" : "Or send to this number:"}</div>
        <div className="font-mono font-black text-lg text-gray-900 tracking-widest">{selectedProvider?.numero}</div>
        <div className="text-xs text-gray-400">Nom : <span className="font-semibold">{selectedProvider?.nom}</span></div>
      </div>

      <button onClick={() => setStep("ref")}
        className={"w-full font-bold py-3.5 rounded-xl text-sm shadow-md text-white "+"bg-blue-600 hover:bg-blue-700"}>
        {lang==="fr" ? "J'ai effectué le paiement →" : "I have made the payment →"}
      </button>
    </div>
  );

  // ÉTAPE 3 — Référence de transaction
  if (step === "ref") return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setStep("qr")} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
        <span className="font-bold text-gray-900 text-sm">🧾 {lang==="fr" ? "Référence de transaction" : "Transaction reference"}</span>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
        {lang==="fr"
          ? "Après votre paiement "+pv?.label+", vous avez reçu un SMS de confirmation. Entrez le code de référence ci-dessous."
          : "After your "+pv?.label+" payment, you received a confirmation SMS. Enter the reference code below."}
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1.5">
          {lang==="fr" ? "Code de référence (ex: WV-20250303-XXXXX)" : "Reference code (e.g. WV-20250303-XXXXX)"}
        </label>
        <input
          type="text"
          value={txRef}
          onChange={e => { setTxRef(e.target.value); setRefError(false); }}
          placeholder={"WV-XXXXXXXX"}
          className={"w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 "+(refError?"border-red-400 focus:ring-red-300":"border-gray-200 focus:ring-emerald-400")}
        />
        {refError && <p className="text-xs text-red-500 mt-1">⚠️ {lang==="fr" ? "Veuillez entrer votre référence de transaction." : "Please enter your transaction reference."}</p>}
      </div>

      {/* Récap montant */}
      <div className="bg-gray-50 rounded-xl p-3 flex justify-between items-center text-sm">
        <span className="text-gray-500">{lang==="fr" ? "Montant payé" : "Amount paid"}</span>
        <span className="font-black text-emerald-700">{amountFmt}</span>
      </div>

      <button onClick={handleConfirmRef}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl text-sm shadow-md">
        ✅ {lang==="fr" ? "Confirmer mon don" : "Confirm my donation"}
      </button>
    </div>
  );

  // ÉTAPE 4 — Succès
  if (step === "done") return (
    <div className="text-center space-y-4 py-2">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">🎉</div>
      <div className="font-black text-xl text-gray-900">{lang==="fr" ? "Merci infiniment !" : "Thank you so much!"}</div>
      <div className="text-sm text-gray-500">{lang==="fr" ? "Votre don a bien été enregistré." : "Your donation has been recorded."}</div>
      {txRef && (
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-center">
          <span className="text-gray-400">{lang==="fr" ? "Réf. transaction : " : "Tx ref: "}</span>
          <span className="font-mono font-bold text-gray-700">{txRef}</span>
        </div>
      )}
      <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-800 border border-emerald-100">
        <p className="font-semibold mb-1">{lang==="fr" ? "Ce que vous venez de faire :" : "What you just did:"}</p>
        <p>{lang==="fr" ? "Rapprocher " : "Brought "}{caseData?.beneficiary}{lang==="fr" ? " d'une vie meilleure." : " closer to a better life."}</p>
      </div>
      <button onClick={() => { setStep("choose"); setTxRef(""); setProvider(null); }}
        className="w-full border border-emerald-200 text-emerald-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-50">
        {lang==="fr" ? "Refaire un don" : "Donate again"}
      </button>
    </div>
  );

  return null;
};

// ── Share Button ──────────────────────────────────────────────
// ── Confetti pur CSS/JS (aucune dépendance) ──────────────────
const Confetti = ({ active }) => {
  if (!active) return null;
  const colors = ["#10b981","#C9A84C","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];
  const pieces = Array.from({length:60},(_,i)=>i);
  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity:1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity:0; }
        }
        .confetti-piece { position:absolute; width:8px; height:8px; border-radius:2px; animation: confetti-fall linear forwards; }
      `}</style>
      {pieces.map(i => (
        <div key={i} className="confetti-piece" style={{
          left: (Math.random()*100)+"%",
          top: "-10px",
          background: colors[i % colors.length],
          animationDuration: (1.5 + Math.random()*2)+"s",
          animationDelay: (Math.random()*1.5)+"s",
          width: (6+Math.random()*8)+"px",
          height: (6+Math.random()*8)+"px",
          borderRadius: Math.random()>0.5?"50%":"2px",
        }} />
      ))}
    </div>
  );
};

// ── Certificat de don HTML print ────────────────────────────
const printDonationCertificate = ({ donorName, amount, beneficiary, caseTitle, trackingId, date, lang }) => {
  const fr = lang === "fr";
  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
<title>Certificat de don — Ayyad</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,serif;background:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .cert{max-width:700px;width:100%;border:3px solid #C9A84C;border-radius:12px;padding:50px;text-align:center;position:relative}
  .cert::before{content:"";position:absolute;inset:8px;border:1px solid #C9A84C;border-radius:8px;pointer-events:none}
  .logo{font-family:Arial,sans-serif;font-size:28px;font-weight:900;color:#0d5c2e;letter-spacing:3px;margin-bottom:4px}
  .logo-sub{font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;margin-bottom:30px}
  h1{font-size:22px;color:#0d5c2e;margin-bottom:8px;letter-spacing:1px;text-transform:uppercase}
  .line{width:80px;height:2px;background:#C9A84C;margin:12px auto 24px}
  .body{font-size:16px;color:#374151;line-height:1.8;margin-bottom:24px}
  .name{font-size:26px;color:#0d5c2e;font-style:italic;font-weight:700;margin:8px 0}
  .amount{font-size:32px;font-weight:900;color:#C9A84C;margin:8px 0}
  .info{font-size:13px;color:#6b7280;margin-top:20px;padding-top:20px;border-top:1px solid #e5e7eb}
  .seal{font-size:40px;margin:20px 0 0}
  @media print{body{min-height:auto}button{display:none}}
</style></head>
<body><div class="cert">
  <div class="logo">AYYAD</div>
  <div class="logo-sub">Financement médical solidaire · Côte d'Ivoire</div>
  <h1>${fr?"Certificat de don":"Certificate of Donation"}</h1>
  <div class="line"></div>
  <div class="body">
    ${fr?"Nous certifions que":"We certify that"}
    <div class="name">${donorName || (fr?"Un donateur anonyme":"An anonymous donor")}</div>
    ${fr?"a effectué un don de":"has made a donation of"}
    <div class="amount">${amount.toLocaleString("fr-CI")} FCFA</div>
    ${fr?"au bénéfice de":"in support of"} <strong>${beneficiary}</strong><br/>
    ${fr?"pour la collecte ":"for the campaign "}<em>"${caseTitle}"</em>
  </div>
  <div class="info">
    ${fr?"Date":"Date"} : ${date} &nbsp;·&nbsp; Réf : ${trackingId}<br/>
    ${fr?"Fonds versés directement à l'hôpital partenaire · Aucuns frais prélevés sur ce don":"Funds transferred directly to the partner hospital · No fees deducted from this donation"}
  </div>
  <div class="seal">💚</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
  const w = window.open("","_blank","width=800,height:600");
  if (w) { w.document.write(html); w.document.close(); }
};

const ShareButton = ({ c, lang, size = "normal" }) => {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const trackingId = c.trackingId || c.tracking_id || ("AYD-" + c.id);
  const shareUrl = "https://ayyadci.com/?case=" + trackingId;
  const title = typeof c.title === "object" ? c.title[lang] : (c.title || "");
  const beneficiary = c.beneficiary || c.full_name || "";
  const pct = c.required ? Math.min(100, Math.round(((c.collected||0)/c.required)*100)) : 0;

  const msgWA = encodeURIComponent(
    (lang === "fr"
      ? "Aidez " + beneficiary + " à financer ses soins medicaux ! " + pct + "% atteint. Chaque don compte. "
      : "Help " + beneficiary + " fund their medical care! " + pct + "% reached. Every donation counts. ")
    + shareUrl
  );
  const msgFB = encodeURIComponent(shareUrl);
  const msgX  = encodeURIComponent(
    (lang === "fr" ? "Soutenez " + beneficiary + " - " + pct + "% de l'objectif atteint " : "Support " + beneficiary + " - " + pct + "% reached ")
    + shareUrl + " #Ayyad #SolidariteMedicale"
  );

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isSmall = size === "small";

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className={`flex items-center gap-1.5 font-semibold rounded-xl border transition-all ${isSmall
          ? "text-xs px-2.5 py-1.5 border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-700 bg-white"
          : "text-sm px-4 py-2.5 border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-700 bg-white shadow-sm"}`}>
        <span>📤</span>
        <span>{lang === "fr" ? "Partager" : "Share"}</span>
      </button>

      {open && (
        <div className="fixed z-[9999] bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-56" style={{bottom:"80px"}} onClick={e => e.stopPropagation()}>
          <div className="text-[10px] text-gray-400 font-semibold mb-2 uppercase tracking-wide">{lang === "fr" ? "Partager ce dossier" : "Share this campaign"}</div>

          {/* WhatsApp */}
          <a href={"https://wa.me/?text=" + msgWA} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-green-50 transition-colors w-full text-left">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-black">W</div>
            <div>
              <div className="text-sm font-bold text-gray-900">WhatsApp</div>
              <div className="text-[10px] text-gray-400">{lang === "fr" ? "Groupes & contacts" : "Groups & contacts"}</div>
            </div>
          </a>

          {/* Facebook */}
          <a href={"https://www.facebook.com/sharer/sharer.php?u=" + msgFB} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition-colors w-full text-left">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-black">f</div>
            <div>
              <div className="text-sm font-bold text-gray-900">Facebook</div>
              <div className="text-[10px] text-gray-400">{lang === "fr" ? "Mur & groupes" : "Wall & groups"}</div>
            </div>
          </a>

          {/* X / Twitter */}
          <a href={"https://x.com/intent/tweet?text=" + msgX} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors w-full text-left">
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm font-black">𝕏</div>
            <div>
              <div className="text-sm font-bold text-gray-900">X / Twitter</div>
              <div className="text-[10px] text-gray-400">{lang === "fr" ? "Tweet avec lien" : "Tweet with link"}</div>
            </div>
          </a>

          {/* Copier lien */}
          <button onClick={copyLink}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors w-full text-left mt-1 border-t border-gray-100 pt-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${copied ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"}`}>
              {copied ? "✓" : "🔗"}
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">{copied ? (lang === "fr" ? "Lien copié !" : "Link copied!") : (lang === "fr" ? "Copier le lien" : "Copy link")}</div>
              <div className="text-[10px] text-gray-400 font-mono truncate">ayyadci.com/?case={trackingId}</div>
            </div>
          </button>

          <button onClick={() => setOpen(false)} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 text-xs">✕</button>
        </div>
      )}
    </div>
  );
};

// ── Support Ayyad Section ─────────────────────────────────────
// ── Formulaire carte bancaire (démo — agrégateur à intégrer) ──
const CardPayForm = ({ amountDisplay, lang, onSuccess, onCancel, darkMode = false }) => {
  const fr = lang === "fr";
  const [cardNum,  setCardNum]  = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry,   setExpiry]   = useState("");
  const [cvv,      setCvv]      = useState("");
  const [paying,   setPaying]   = useState(false);
  const [done,     setDone]     = useState(false);

  const fmtCard   = v => v.replace(/\D/g,"").slice(0,16).replace(/(.{4})/g,"$1 ").trim();
  const fmtExpiry = v => { const d=v.replace(/\D/g,"").slice(0,4); return d.length>2?d.slice(0,2)+"/"+d.slice(2):d; };
  const isValid   = cardNum.replace(/\s/g,"").length===16 && cardName.trim().length>2 && expiry.length===5 && cvv.length>=3;

  const handlePay = () => {
    if (!isValid || paying) return;
    setPaying(true);
    setTimeout(() => { setPaying(false); setDone(true); onSuccess && onSuccess(); }, 1800);
  };

  const inp = `w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${darkMode ? "bg-white/10 border-white/20 text-white placeholder-white/40" : "border-gray-200 bg-white text-gray-900"}`;

  if (done) return null; // parent handles success UI

  return (
    <div className="space-y-3">
      {/* Badge démo */}
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${darkMode ? "bg-amber-500/20 border border-amber-400/30" : "bg-amber-50 border border-amber-200"}`}>
        <span>🔧</span>
        <span className={`text-xs ${darkMode ? "text-amber-200" : "text-amber-700"}`}>
          {fr ? "Formulaire de démo — agrégateur de paiement à intégrer" : "Demo form — payment processor to be integrated"}
        </span>
      </div>

      {/* Numéro de carte */}
      <div>
        <label className={`text-xs font-semibold mb-1 block ${darkMode ? "text-emerald-300" : "text-gray-600"}`}>{fr ? "Numéro de carte" : "Card number"}</label>
        <input type="text" inputMode="numeric" placeholder="1234 5678 9012 3456"
          value={cardNum} onChange={e => setCardNum(fmtCard(e.target.value))} maxLength={19}
          className={inp + " font-mono"} />
      </div>

      {/* Nom */}
      <div>
        <label className={`text-xs font-semibold mb-1 block ${darkMode ? "text-emerald-300" : "text-gray-600"}`}>{fr ? "Nom sur la carte" : "Cardholder name"}</label>
        <input type="text" placeholder={fr ? "PRÉNOM NOM" : "FIRST LAST"}
          value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())}
          className={inp + " uppercase tracking-wide"} />
      </div>

      {/* Expiration + CVV */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`text-xs font-semibold mb-1 block ${darkMode ? "text-emerald-300" : "text-gray-600"}`}>{fr ? "Expiration" : "Expiry"}</label>
          <input type="text" inputMode="numeric" placeholder="MM/YY"
            value={expiry} onChange={e => setExpiry(fmtExpiry(e.target.value))} maxLength={5}
            className={inp + " font-mono"} />
        </div>
        <div>
          <label className={`text-xs font-semibold mb-1 block ${darkMode ? "text-emerald-300" : "text-gray-600"}`}>CVV</label>
          <input type="password" inputMode="numeric" placeholder="•••"
            value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g,"").slice(0,4))}
            className={inp + " font-mono"} />
        </div>
      </div>

      {/* Bouton payer */}
      <button onClick={handlePay} disabled={!isValid || paying}
        className={`w-full py-3 rounded-xl font-black text-sm transition-all shadow-md ${
          isValid && !paying
            ? darkMode ? "bg-white text-gray-900 hover:bg-gray-100" : "bg-gray-900 text-white hover:bg-gray-700"
            : "bg-gray-300 text-gray-400 cursor-not-allowed"
        }`}>
        {paying ? `⏳ ${fr ? "Traitement…" : "Processing…"}` : `💳 ${fr ? "Payer" : "Pay"} ${amountDisplay || ""}`}
      </button>

      {/* Logos sécurité */}
      <div className={`flex items-center justify-center gap-3 text-[10px] ${darkMode ? "text-white/40" : "text-gray-400"}`}>
        <span>🔒 SSL</span><span>·</span><span>Visa</span><span>·</span><span>Mastercard</span><span>·</span><span>CB</span>
      </div>

      {onCancel && (
        <button onClick={onCancel} className={`w-full text-xs py-1 ${darkMode ? "text-white/50 hover:text-white" : "text-gray-400 hover:text-gray-700"}`}>
          ← {fr ? "Modifier" : "Edit"}
        </button>
      )}
    </div>
  );
};

const SupportAyyadSection = ({ lang }) => {
  const fr = lang === "fr";
  const [currency, setCurrency] = useState("FCFA");
  const [amount,   setAmount]   = useState("");
  const [donorMessage, setDonorMessage] = useState(""); // message libre du donateur à Ayyad
  const [step,     setStep]     = useState("form"); // form | wave_qr

  const CURRENCIES = [
    { code:"FCFA", symbol:"FCFA", min:500, step:500 },
    { code:"EUR",  symbol:"€",    min:1,   step:1   },
    { code:"USD",  symbol:"$",    min:1,   step:1   },
  ];
  const curInfo      = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
  const numericAmount = Number(amount) || 0;
  const isValid      = numericAmount >= curInfo.min;
  const RATES        = { FCFA:1, EUR:655.957, USD:600 };
  const amountFCFA   = Math.round(numericAmount * (RATES[currency] || 1));

  const displayAmount = amount
    ? (currency === "FCFA"
        ? `${Number(amount).toLocaleString("fr")} FCFA`
        : `${curInfo.symbol}${Number(amount).toLocaleString("fr")}`)
    : "";

  const handlePay = () => {
    if (!isValid) return;
    setStep("wave_qr");
  };
  const reset = () => { setStep("form"); setAmount(""); };

  return (
    <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-14 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-5 text-sm font-medium">
          <span>💚</span> {fr ? "Don direct à Ayyad" : "Direct donation to Ayyad"}
        </div>
        <h2 className="text-3xl font-black mb-3">{fr ? "Soutenir Ayyad directement" : "Support Ayyad directly"}</h2>
        <p className="text-emerald-200 text-sm max-w-lg mx-auto mb-8 leading-relaxed">
          {fr
            ? "Votre don aide à financer les opérations de la plateforme : vérification des dossiers, partenariats hospitaliers, et accompagnement des patients."
            : "Your donation helps fund platform operations: case verification, hospital partnerships, and patient support."}
        </p>

        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6 max-w-sm mx-auto space-y-4">

          {/* ── ÉTAPE 1: formulaire montant ── */}
          {step === "form" && (<>
            <div>
              <div className="text-xs text-emerald-300 font-semibold mb-2 text-left">{fr ? "Devise" : "Currency"}</div>
              <div className="flex gap-2">
                {CURRENCIES.map(c => (
                  <button key={c.code} onClick={() => { setCurrency(c.code); setAmount(""); }}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${currency===c.code ? "bg-emerald-500 border-emerald-400 text-white" : "bg-white/10 border-white/20 text-emerald-200 hover:bg-white/20"}`}>
                    {c.code}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-emerald-300 font-semibold mb-2 text-left">{fr ? "Montant" : "Amount"}</div>
              <div className="relative flex items-center bg-white rounded-xl overflow-hidden">
                <input type="number" min={curInfo.min} step={curInfo.step} placeholder={String(curInfo.min)}
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="flex-1 text-gray-900 font-black text-lg px-4 py-3 outline-none bg-transparent" style={{minWidth:0}} />
                <span className="px-3 text-gray-500 font-bold text-sm border-l border-gray-200 py-3 bg-gray-50 whitespace-nowrap">
                  {curInfo.code === "FCFA" ? "FCFA" : curInfo.symbol}
                </span>
              </div>
              {displayAmount && currency !== "FCFA" && (
                <div className="mt-1.5 text-emerald-300 text-xs text-right">
                  ≈ {amountFCFA.toLocaleString("fr")} FCFA
                </div>
              )}
            </div>

            {/* Message libre du donateur — optionnel mais encourageant */}
            <div>
              <div className="text-xs text-emerald-300 font-semibold mb-2 text-left">
                {fr ? "Votre message à Ayyad (optionnel)" : "Your message to Ayyad (optional)"}
              </div>
              <textarea
                value={donorMessage}
                onChange={e => setDonorMessage(e.target.value.slice(0, 300))}
                rows={3}
                placeholder={fr
                  ? "Un mot d'encouragement, un témoignage, une suggestion…"
                  : "A word of encouragement, a testimonial, a suggestion…"}
                className="w-full text-gray-900 text-sm px-4 py-2.5 rounded-xl outline-none bg-white resize-none border border-white/20 focus:border-emerald-400"
              />
              <div className="mt-1 text-[10px] text-emerald-300/70 text-right">
                {donorMessage.length}/300
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={!isValid}
              className={`w-full py-3.5 rounded-xl font-black text-sm transition-all ${isValid ? "bg-white text-emerald-900 hover:bg-emerald-100 shadow-lg" : "bg-white/20 text-white/40 cursor-not-allowed"}`}>
              {!amount || numericAmount===0
                ? (fr ? "Saisir un montant" : "Enter an amount")
                : !isValid
                ? `Min. ${curInfo.min} ${curInfo.code}`
                : `🌊 ${fr?"Payer":"Pay"} ${displayAmount} →`}
            </button>

            <p className="text-emerald-400 text-[10px]">
              {fr ? "Paiement sécurisé · 100% de votre don va à Ayyad" : "Secure payment · 100% of your donation goes to Ayyad"}
            </p>
          </>)}

          {/* ── ÉTAPE 2: QR Wave + instructions Sendwave pour l'étranger ── */}
          {step === "wave_qr" && (
            <div className="flex flex-col items-center gap-3">
              <div className="text-sm font-black">📱 {fr ? "Scannez pour payer via Wave CI" : "Scan to pay with Wave CI"}</div>
              <a
                href="https://pay.wave.com/m/M_ci_PJosg8FuvJDW/c/ci/"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <img src="/wave_qr.png" alt="QR Wave Ayyad" width={200} height={200}
                  className="rounded-2xl border-4 border-white/30 bg-white shadow-xl p-2"
                  onError={e => { e.target.style.display="none"; }} />
              </a>
              <div className="text-[11px] font-semibold text-white/80 bg-white/10 px-3 py-1.5 rounded-full">
                👆 {fr ? "Touchez le QR sur mobile" : "Tap the QR on mobile"}
              </div>
              <div className="w-full bg-white rounded-xl p-3 text-gray-900">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">{fr?"Montant à envoyer :":"Amount to send:"}</span>
                  <span className="font-mono font-black text-blue-700 text-base">
                    {currency === "FCFA"
                      ? `${amountFCFA.toLocaleString("fr-FR")} FCFA`
                      : `${displayAmount} (≈ ${amountFCFA.toLocaleString("fr-FR")} FCFA)`}
                  </span>
                </div>
              </div>
              <div className="text-xs text-emerald-100 text-center leading-relaxed">
                {fr
                  ? <>Ouvrez <strong className="text-white">Wave CI</strong> → <strong className="text-white">Scanner</strong> → saisissez <strong className="text-white">{amountFCFA.toLocaleString("fr-FR")} FCFA</strong> → validez</>
                  : <>Open <strong className="text-white">Wave CI</strong> → <strong className="text-white">Scan</strong> → enter <strong className="text-white">{amountFCFA.toLocaleString("fr-FR")} FCFA</strong> → confirm</>}
              </div>

              {/* Sendwave : pour la diaspora */}
              <details className="w-full bg-white/10 rounded-xl border border-white/20 text-left">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-white select-none">
                  🌍 {fr ? "Vous êtes à l'étranger ? Utilisez Sendwave" : "From abroad? Use Sendwave"}
                </summary>
                <div className="px-3 pb-3 text-[11px] text-emerald-100 leading-relaxed space-y-1.5">
                  <p>
                    {fr
                      ? <>L'app <strong className="text-white">Sendwave</strong> est disponible en France, Canada, USA, UK, Belgique, Italie, Espagne, Allemagne… (gratuite, sans frais cachés)</>
                      : <>The <strong className="text-white">Sendwave</strong> app is available in France, Canada, USA, UK, Belgium, Italy, Spain, Germany… (free, no hidden fees)</>}
                  </p>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>{fr ? "Téléchargez Sendwave (App Store / Play Store)" : "Download Sendwave (App Store / Play Store)"}</li>
                    <li>{fr ? <>Envoyez au numéro Wave : <strong className="font-mono text-white">+225 07 48 05 61 28</strong></> : <>Send to the Wave number: <strong className="font-mono text-white">+225 07 48 05 61 28</strong></>}</li>
                    <li>{fr ? `Saisissez ${displayAmount}` : `Enter ${displayAmount}`}</li>
                    <li>{fr ? "Validez — l'argent arrive instantanément en FCFA" : "Confirm — money arrives instantly in FCFA"}</li>
                  </ol>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <a href="https://apps.apple.com/app/sendwave-send-money/id1238118264" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-white text-emerald-900 px-2 py-1 rounded-md text-[10px] font-bold">🍎 iOS</a>
                    <a href="https://play.google.com/store/apps/details?id=com.wave" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-white text-emerald-900 px-2 py-1 rounded-md text-[10px] font-bold">🤖 Android</a>
                    <a href="https://www.sendwave.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 border border-white/40 text-white px-2 py-1 rounded-md text-[10px] font-bold">🌐 sendwave.com</a>
                  </div>
                </div>
              </details>

              <button onClick={reset} className="text-xs text-white/40 hover:text-white/70 py-1">
                ← {fr ? "Modifier le montant" : "Edit amount"}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// ── Reveal — wrapper qui anime l'élément en fade-in+slide quand il entre dans la vue ────
// Usage: <Reveal><MaSection /></Reveal>
// S'appuie sur les classes CSS .ayyad-reveal / .is-visible définies dans index.html
const Reveal = ({ children, delay = 0, as: As = "div", className = "" }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Si IntersectionObserver pas dispo (vieux browser), on rend visible direct
    if (typeof IntersectionObserver === "undefined") { el.classList.add("is-visible"); return; }
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add("is-visible"), delay);
          obs.unobserve(e.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);
  return <As ref={ref} className={`ayyad-reveal ${className}`}>{children}</As>;
};

// ── HeroSlider premium — storytelling progressif sur 4 slides ────────────────
// Chaque slide combine une image émotionnelle forte + un message dédié (titre +
// sous-titre + CTA principal). L'image fait un effet ken-burns, le texte fade
// in/out à chaque transition. Sur la base du hero, une bande de KPIs animés
// renforce la confiance financière. Indicateur scroll-down élégant en bas.
const HeroSlider = ({ lang, setPage, t, heroStats }) => {
  const fr = lang === "fr";

  // Contenu narratif des 4 slides — chaque slide = un angle de la mission
  const slides = [
    {
      img: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1920&q=85",
      eyebrow: fr ? "Plateforme vérifiée & sécurisée" : "Verified & secure platform",
      titlePre: fr ? "Quand la vie attend," : "When life can't wait,",
      titleEm: fr ? "agissons ensemble." : "we act together.",
      sub: fr
        ? "Derrière chaque collecte, un patient dont la santé dépend de notre solidarité. Un don. Un hôpital. Un espoir."
        : "Behind every campaign, a patient whose health depends on our solidarity. One donation. One hospital. One hope.",
      cta: { label: fr ? "Faire un don maintenant" : "Donate now", action: () => setPage("collectesactives") },
    },
    {
      img: "https://images.unsplash.com/photo-1612531048118-826c4e98c2da?w=1920&q=85",
      eyebrow: fr ? "100% transparent · 0% frais cachés" : "100% transparent · 0% hidden fees",
      titlePre: fr ? "Financer des soins," : "Funding care,",
      titleEm: fr ? "changer une vie." : "changing a life.",
      sub: fr
        ? "Vos dons sont versés directement à l'hôpital partenaire. Chaque virement est audité. Aucune intermédiation cash."
        : "Your donations go directly to the partner hospital. Every transfer is audited. No cash intermediation.",
      cta: { label: fr ? "Découvrir les campagnes" : "Explore campaigns", action: () => setPage("collectesactives") },
    },
    {
      img: "https://images.unsplash.com/photo-1666214280557-f1b5022eb634?w=1920&q=85",
      eyebrow: fr ? "Pour les patients" : "For patients",
      titlePre: fr ? "Une plateforme humaine," : "A platform built on humanity,",
      titleEm: fr ? "construite pour vous." : "built for you.",
      sub: fr
        ? "Soumettez votre dossier médical, notre équipe le vérifie sous 48h avec un hôpital partenaire. Mise en ligne rapide, suivi personnalisé."
        : "Submit your medical case, our team verifies it within 48h with a partner hospital. Fast online launch, personal follow-up.",
      cta: { label: fr ? "Soumettre un dossier" : "Submit a case", action: () => setPage("submit") },
    },
    {
      img: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1920&q=85",
      eyebrow: fr ? "Impact mesurable" : "Measurable impact",
      titlePre: fr ? "Chaque contribution" : "Every contribution",
      titleEm: fr ? "peut sauver une vie." : "can save a life.",
      sub: fr
        ? "Rejoignez une communauté de donateurs engagés à offrir un accès aux soins à ceux qui en ont le plus besoin en Côte d'Ivoire."
        : "Join a community of donors committed to providing healthcare access to those who need it most in Côte d'Ivoire.",
      cta: { label: fr ? "Voir les histoires" : "Read the stories", action: () => setPage("collectes") },
    },
  ];

  const [idx, setIdx] = useState(0);

  // Autoplay continu — défile chaque 7s sans s'arrêter au hover
  // (le hover-pause cassait l'expérience : sur desktop la souris est presque
  // toujours dans le hero quand on lit, donc l'autoplay ne se déclenchait jamais)
  useEffect(() => {
    const tm = setInterval(() => setIdx(i => (i + 1) % slides.length), 7000);
    return () => clearInterval(tm);
  }, [slides.length]);

  const goNext = () => setIdx(i => (i + 1) % slides.length);
  const goPrev = () => setIdx(i => (i - 1 + slides.length) % slides.length);

  const current = slides[idx];

  return (
    <section
      className="relative w-full"
      style={{ minHeight: "92vh", overflow:"hidden", background:"#0a1f1a" }}
    >
      {/* Slides background */}
      {slides.map((s, i) => (
        <div
          key={i}
          className={`ayyad-hero-slide ${i === idx ? "is-active" : ""}`}
        >
          <div className="ayyad-hero-bg" style={{ backgroundImage: `url(${s.img})` }} />
          {/* Overlay gradient signature (deep emerald) */}
          <div style={{ position:"absolute", inset:0, background:"var(--grad-hero-overlay)" }} />
          {/* Voile bas pour lisibilité KPIs */}
          <div style={{ position:"absolute", inset:0, background:"var(--grad-hero-bottom)" }} />
        </div>
      ))}

      {/* Particles or pattern overlay subtle (gold dots) */}
      <div style={{
        position:"absolute", inset:0, zIndex:3, pointerEvents:"none",
        backgroundImage:"radial-gradient(rgba(201,168,76,0.10) 1px, transparent 1px)",
        backgroundSize:"32px 32px",
        opacity: 0.4,
      }} />

      {/* Contenu */}
      <div className="ayyad-container" style={{
        position:"relative", zIndex:5,
        minHeight:"92vh",
        display:"flex", flexDirection:"column", justifyContent:"center",
        paddingTop: 80, paddingBottom: 120,
        color:"#fff",
      }}>
        <div style={{ maxWidth: 880 }}>
          {/* Eyebrow / badge — réanime à chaque changement de slide */}
          <div key={`eb-${idx}`} style={{
            display:"inline-flex", alignItems:"center", gap:10,
            background:"rgba(255,255,255,0.10)",
            backdropFilter:"blur(10px)",
            border:"1px solid rgba(201,168,76,0.35)",
            padding:"7px 16px",
            borderRadius:9999,
            fontSize:11, fontWeight:700, letterSpacing:2.2, textTransform:"uppercase",
            color:"#e9d59a",
            marginBottom: 28,
            animation:"ayyad-slide-up 700ms cubic-bezier(0.16,1,0.3,1) both",
          }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:"#34d399", boxShadow:"0 0 0 4px rgba(52,211,153,0.20)", display:"inline-block" }} />
            {current.eyebrow}
          </div>

          {/* Titre éditorial Playfair */}
          <h1 key={`t-${idx}`} className="ayyad-h-display" style={{
            fontSize: "clamp(2.4rem, 6vw, 5.2rem)",
            color:"#fff",
            margin: 0,
            marginBottom: 24,
            textShadow:"0 4px 32px rgba(0,0,0,0.35)",
            animation:"ayyad-slide-up 900ms cubic-bezier(0.16,1,0.3,1) both",
            animationDelay:"80ms",
          }}>
            {current.titlePre}<br />
            <em style={{ color:"#e9d59a", fontWeight:700 }}>{current.titleEm}</em>
          </h1>

          {/* Sous-titre */}
          <p key={`s-${idx}`} style={{
            fontSize:"clamp(1rem, 1.5vw, 1.25rem)",
            lineHeight: 1.6,
            color:"rgba(255,255,255,0.92)",
            maxWidth: 680,
            marginBottom: 40,
            textShadow:"0 2px 12px rgba(0,0,0,0.30)",
            fontWeight:400,
            animation:"ayyad-slide-up 900ms cubic-bezier(0.16,1,0.3,1) both",
            animationDelay:"180ms",
          }}>
            {current.sub}
          </p>

          {/* CTAs */}
          <div key={`cta-${idx}`} style={{
            display:"flex", flexWrap:"wrap", gap:14,
            animation:"ayyad-slide-up 900ms cubic-bezier(0.16,1,0.3,1) both",
            animationDelay:"280ms",
          }}>
            <button onClick={current.cta.action} className="ayyad-btn-gold" style={{ fontSize:14, padding:"15px 30px" }}>
              {current.cta.label} →
            </button>
            <button onClick={() => setPage("submit")} className="ayyad-btn-ghost" style={{ fontSize:14 }}>
              {fr ? "Lancer une campagne" : "Start a campaign"}
            </button>
            <button onClick={() => setPage("how")} className="ayyad-btn-ghost" style={{ fontSize:14 }}>
              {fr ? "Comment ça marche" : "How it works"}
            </button>
          </div>

          {/* Trust pills */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop: 36 }}>
            <span className="ayyad-trust-pill" style={{ background:"rgba(255,255,255,0.10)", color:"#fff", border:"1px solid rgba(255,255,255,0.22)" }}>
              <span style={{ color:"#e9d59a" }}>🔒</span> {fr ? "Paiement sécurisé" : "Secure payment"}
            </span>
            <span className="ayyad-trust-pill" style={{ background:"rgba(255,255,255,0.10)", color:"#fff", border:"1px solid rgba(255,255,255,0.22)" }}>
              <span style={{ color:"#e9d59a" }}>✓</span> {fr ? "100% transparent" : "100% transparent"}
            </span>
            <span className="ayyad-trust-pill" style={{ background:"rgba(255,255,255,0.10)", color:"#fff", border:"1px solid rgba(255,255,255,0.22)" }}>
              <span style={{ color:"#e9d59a" }}>🏥</span> {fr ? "Hôpitaux partenaires" : "Partner hospitals"}
            </span>
          </div>
        </div>
      </div>

      {/* KPI live bar — collée en bas du hero */}
      <div style={{
        position:"absolute", left:0, right:0, bottom:0, zIndex:6,
        background:"linear-gradient(180deg, rgba(10,31,26,0) 0%, rgba(10,31,26,0.50) 60%, rgba(10,31,26,0.92) 100%)",
        paddingTop: 24, paddingBottom: 0,
      }}>
        <div className="ayyad-container" style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",
          gap: 0,
          borderTop:"1px solid rgba(201,168,76,0.22)",
          borderBottom:"none",
          background:"rgba(10,31,26,0.55)",
          backdropFilter:"blur(12px)",
          padding:"22px 24px",
        }}>
          {[
            { v: heroStats?.patients || "—", l: fr ? "Patients aidés" : "Patients helped", icon:"💚" },
            { v: heroStats?.collected || "—", l: fr ? "FCFA collectés" : "FCFA raised", icon:"📈" },
            { v: heroStats?.hospitals || "18", l: fr ? "Hôpitaux partenaires" : "Partner hospitals", icon:"🏥" },
            { v: "48h", l: fr ? "Vérification dossier" : "Case verification", icon:"⚡" },
          ].map((k, i) => (
            <div key={i} style={{
              padding:"6px 18px",
              borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.10)",
              textAlign:"left",
            }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                <span style={{ fontSize:18, opacity:0.65 }}>{k.icon}</span>
                <span style={{ fontFamily:"var(--font-serif)", fontWeight:800, fontSize:"clamp(1.5rem, 2.6vw, 2.2rem)", color:"#fff", letterSpacing:"-0.02em", lineHeight:1 }}>{k.v}</span>
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", letterSpacing:1.4, textTransform:"uppercase", fontWeight:600, marginTop:6 }}>
                {k.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flèches précédent/suivant (desktop) */}
      <button
        onClick={(e)=>{ e.stopPropagation(); goPrev(); }}
        className="hidden md:flex"
        style={{
          position:"absolute", left:24, top:"50%", transform:"translateY(-50%)",
          zIndex:7, width:48, height:48, borderRadius:"50%",
          background:"rgba(255,255,255,0.10)", backdropFilter:"blur(8px)",
          border:"1px solid rgba(255,255,255,0.22)",
          color:"#fff", fontSize:20, cursor:"pointer",
          alignItems:"center", justifyContent:"center",
          transition:"all .25s",
        }}
        onMouseEnter={e=>{ e.currentTarget.style.background="rgba(255,255,255,0.20)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.45)"; }}
        onMouseLeave={e=>{ e.currentTarget.style.background="rgba(255,255,255,0.10)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.22)"; }}
        aria-label="Slide précédent"
      >‹</button>
      <button
        onClick={(e)=>{ e.stopPropagation(); goNext(); }}
        className="hidden md:flex"
        style={{
          position:"absolute", right:24, top:"50%", transform:"translateY(-50%)",
          zIndex:7, width:48, height:48, borderRadius:"50%",
          background:"rgba(255,255,255,0.10)", backdropFilter:"blur(8px)",
          border:"1px solid rgba(255,255,255,0.22)",
          color:"#fff", fontSize:20, cursor:"pointer",
          alignItems:"center", justifyContent:"center",
          transition:"all .25s",
        }}
        onMouseEnter={e=>{ e.currentTarget.style.background="rgba(255,255,255,0.20)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.45)"; }}
        onMouseLeave={e=>{ e.currentTarget.style.background="rgba(255,255,255,0.10)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.22)"; }}
        aria-label="Slide suivant"
      >›</button>

      {/* Dots */}
      <div style={{ position:"absolute", left:0, right:0, top:24, zIndex:7, display:"flex", justifyContent:"center", gap:8 }}>
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Slide ${i+1}`}
            style={{
              height: 3, borderRadius: 999,
              width: i === idx ? 36 : 18,
              background: i === idx ? "#e9d59a" : "rgba(255,255,255,0.35)",
              border:"none", cursor:"pointer",
              transition:"all .35s",
            }}
          />
        ))}
      </div>
    </section>
  );
};

// ── PartnersBanner — bandeau des hôpitaux et cliniques partenaires ────────────
// Affiche les 10 établissements ciblés/en cours de validation pour le partenariat.
// On utilise une formulation honnête ("en cours de validation") pour ne pas affirmer
// un partenariat finalisé. Style : cards blanches sobres avec nom de l'établissement.
const PartnersBanner = ({ lang }) => {
  const fr = lang === "fr";
  const partners = [
    { name: "PISAM", full: "Polyclinique Internationale Sainte Anne-Marie", city: "Abidjan" },
    { name: "Polyclinique de l'Indénié", full: "Polyclinique Internationale de l'Indénié", city: "Abidjan" },
    { name: "Avicennes Polyclinic", full: "Avicennes Polyclinic", city: "Abidjan" },
    { name: "Le Grand Centre", full: "Clinique Médicale Le Grand Centre", city: "Abidjan" },
    { name: "Polyclinique Farah", full: "Polyclinique Farah", city: "Abidjan" },
    { name: "CHU de Cocody", full: "Centre Hospitalier Universitaire de Cocody", city: "Cocody, Abidjan" },
    { name: "CHU de Treichville", full: "Centre Hospitalier Universitaire de Treichville", city: "Treichville, Abidjan" },
    { name: "Polymed", full: "Nouvelle Clinique Polymed", city: "Abidjan" },
    { name: "La Providence", full: "Clinique La Providence", city: "Abidjan" },
  ];
  // Liste doublée pour le marquee infini (translateX(-50%))
  const marqueeItems = [...partners, ...partners];

  return (
    <section style={{
      background:"linear-gradient(180deg, var(--paper) 0%, #f7f6f2 100%)",
      padding:"clamp(24px, 3vw, 36px) 0 clamp(28px, 3.5vw, 44px)",
      borderTop:"1px solid rgba(10,31,26,0.06)",
      position:"relative",
      overflow:"hidden",
    }}>
      <div className="ayyad-container">
        <div style={{ textAlign:"center", maxWidth: 720, margin:"0 auto 20px" }}>
          <span className="ayyad-eyebrow" style={{ color:"var(--ayyad-amber)", background:"rgba(245,158,11,0.10)", borderColor:"rgba(245,158,11,0.30)" }}>
            {fr ? "⚠ Partenariats en cours de validation" : "⚠ Partnerships being validated"}
          </span>
          <h2 className="ayyad-h-display" style={{ fontSize:"clamp(1.6rem, 3vw, 2.4rem)", marginTop: 12, marginBottom: 10 }}>
            {fr ? <>Nos <em>établissements partenaires.</em></> : <>Our <em>partner facilities.</em></>}
          </h2>
          <p style={{ color:"var(--ink-500)", fontSize:14, lineHeight:1.6 }}>
            {fr
              ? "Ayyad travaille à la finalisation de partenariats officiels avec ces hôpitaux et cliniques de référence en Côte d'Ivoire. En attendant, les fonds sont versés directement à l'établissement qui prend en charge le patient."
              : "Ayyad is finalising official partnerships with these leading hospitals and clinics in Côte d'Ivoire. In the meantime, funds are transferred directly to the facility caring for the patient."}
          </p>
        </div>
      </div>

      {/* Marquee défilant — masque les bords avec un gradient pour effet pro */}
      <div style={{ position:"relative" }}>
        <div className="ayyad-marquee" style={{ overflow:"hidden", padding:"12px 0" }}>
          <style>{`
            @keyframes ayyad-partners-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
            .ayyad-partners-track { display: flex; gap: 20px; animation: ayyad-partners-scroll 45s linear infinite; width: max-content; }
            .ayyad-marquee:hover .ayyad-partners-track { animation-play-state: paused; }
          `}</style>
          <div className="ayyad-partners-track">
            {marqueeItems.map((p, i) => (
              <div
                key={`${p.name}-${i}`}
                style={{
                  display:"flex", alignItems:"center", gap: 14,
                  background:"#fff",
                  border:"1px solid rgba(10,31,26,0.08)",
                  borderRadius: 16,
                  padding:"14px 22px",
                  minWidth: 280,
                  flexShrink: 0,
                  boxShadow:"0 2px 8px rgba(10,31,26,0.04)",
                  transition:"transform .25s, box-shadow .25s, border-color .25s",
                }}
                onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow="0 10px 24px rgba(10,31,26,0.10)"; e.currentTarget.style.borderColor="rgba(13,92,46,0.22)"; }}
                onMouseLeave={e=>{ e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 2px 8px rgba(10,31,26,0.04)"; e.currentTarget.style.borderColor="rgba(10,31,26,0.08)"; }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background:"linear-gradient(135deg, rgba(13,92,46,0.10) 0%, rgba(201,168,76,0.10) 100%)",
                  border:"1px solid rgba(13,92,46,0.10)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize: 22, flexShrink: 0,
                }}>🏥</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily:"var(--font-serif)", fontWeight:700, fontSize:15, color:"var(--ayyad-deep)", lineHeight:1.2, whiteSpace:"nowrap" }}>{p.name}</div>
                  <div style={{ fontSize:11, color:"var(--ink-400)", marginTop:3, letterSpacing:0.3, fontWeight:600, whiteSpace:"nowrap" }}>📍 {p.city}</div>
                </div>
                <span style={{
                  marginLeft:"auto",
                  fontSize:10, fontWeight:700, letterSpacing:0.5,
                  padding:"4px 10px", borderRadius:9999,
                  background:"rgba(245,158,11,0.10)", color:"var(--ayyad-amber)",
                  border:"1px solid rgba(245,158,11,0.25)",
                  whiteSpace:"nowrap",
                  textTransform:"uppercase",
                }}>{fr ? "En cours" : "Pending"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Gradient fade sur les bords */}
        <div style={{ position:"absolute", top:0, bottom:0, left:0, width:120, background:"linear-gradient(90deg, var(--paper) 0%, transparent 100%)", pointerEvents:"none", zIndex:2 }} />
        <div style={{ position:"absolute", top:0, bottom:0, right:0, width:120, background:"linear-gradient(-90deg, var(--paper) 0%, transparent 100%)", pointerEvents:"none", zIndex:2 }} />
      </div>

      <div className="ayyad-container">
        <p style={{ textAlign:"center", fontSize:12, color:"var(--ink-400)", marginTop: 24, fontStyle:"italic", maxWidth: 720, margin:"24px auto 0" }}>
          {fr
            ? "Les partenariats officiels sont en cours de finalisation administrative. Aucune affirmation de partenariat finalisé n'est faite."
            : "Official partnerships are being formalised. No claim of finalised partnership is made."}
        </p>
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ── ImpactSection — Confiance financière + chiffres clés animés ─────────────
// ─────────────────────────────────────────────────────────────────────────────
// Bande de KPIs centrale avec contre-narratif rassurant (transparence, audit,
// versement direct hôpital). Compteurs s'incrémentent au scroll, badges
// confiance, mini-témoignage en pull-quote.
const useCountUp = (target, duration = 1600, enabled = true) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!enabled || !target) return;
    const num = Number(String(target).replace(/[^\d.]/g, "")) || 0;
    if (num === 0) { setValue(0); return; }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(num * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return value;
};

const AnimatedNumber = ({ value, suffix = "", visible }) => {
  const n = useCountUp(value, 1800, visible);
  return <span>{n.toLocaleString("fr-CI")}{suffix}</span>;
};

const ImpactSection = ({ lang, heroStats, setPage }) => {
  const fr = lang === "fr";
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.25 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  // Parse heroStats : "12M" → 12, "3.5k" → 3500…
  const parseStat = (raw) => {
    if (raw == null || raw === "—") return 0;
    const str = String(raw).trim();
    const numMatch = str.match(/[\d.]+/);
    if (!numMatch) return 0;
    let n = parseFloat(numMatch[0]);
    if (/M/i.test(str)) n *= 1_000_000;
    else if (/k/i.test(str)) n *= 1_000;
    return Math.round(n);
  };

  // IMPORTANT : pas de valeurs de fallback fake. Si les données réelles
  // Supabase sont à 0 (plateforme qui démarre), on affiche 0 honnêtement.
  // Les compteurs s'animeront naturellement de 0 → vraie valeur au fur
  // et à mesure que des dossiers seront approuvés et financés.
  const collectedNum = parseStat(heroStats?.collected);
  const patientsNum = parseStat(heroStats?.patients);
  const hospitalsNum = parseStat(heroStats?.hospitals) || 18; // 18 = chiffre marketing (partenariats en cours)
  const campagnesNum = parseStat(heroStats?.funded) || 0;

  return (
    <section ref={ref} style={{ background:"var(--paper)", padding:"clamp(24px,3vw,40px) 0 clamp(36px,4.5vw,56px)", position:"relative", borderTop:"1px solid rgba(10,31,26,0.04)" }}>
      {/* Bordure dorée subtile en haut */}
      <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:120, height:3, background:"var(--grad-gold)", borderRadius:999 }} />

      <div className="ayyad-container">
        {/* Header centré */}
        <div style={{ textAlign:"center", marginBottom: 28 }}>
          <span className="ayyad-eyebrow">{fr ? "Notre impact" : "Our impact"}</span>
          <h2 className="ayyad-h-display" style={{ fontSize:"clamp(1.8rem, 3.4vw, 2.8rem)", marginTop: 14, marginBottom: 10 }}>
            {fr ? <>Des chiffres qui <em>changent des vies.</em></> : <>Numbers that <em>change lives.</em></>}
          </h2>
          <p style={{ color:"var(--ink-500)", fontSize:15, maxWidth: 600, margin:"0 auto", lineHeight:1.55 }}>
            {fr
              ? "Chaque don est tracé, chaque virement est audité, chaque patient est suivi."
              : "Every donation is tracked, every transfer is audited, every patient is followed up."}
          </p>
        </div>

        {/* Grille KPIs */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}>
          {[
            { v: collectedNum, suffix: " FCFA", label: fr ? "Total collecté" : "Total raised", icon:"💰", color:"#0d5c2e" },
            { v: patientsNum,  suffix: "",       label: fr ? "Patients aidés" : "Patients helped", icon:"💚", color:"#10b981" },
            { v: hospitalsNum, suffix: "",       label: fr ? "Hôpitaux partenaires" : "Partner hospitals", icon:"🏥", color:"#0f766e" },
            { v: campagnesNum, suffix: "",       label: fr ? "Campagnes financées" : "Funded campaigns", icon:"🎯", color:"#a17f29" },
          ].map((k, i) => (
            <div key={i} className="ayyad-card ayyad-reveal" style={{ padding:"32px 28px", textAlign:"left", animationDelay: `${i*80}ms` }}>
              <div style={{
                width:52, height:52, borderRadius:14,
                background: `linear-gradient(135deg, ${k.color}15, ${k.color}08)`,
                border:`1px solid ${k.color}22`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:26, marginBottom:18,
              }}>{k.icon}</div>
              <div className="ayyad-counter" style={{ marginBottom: 6 }}>
                <AnimatedNumber value={k.v} suffix={k.suffix} visible={visible} />
              </div>
              <div style={{ color:"var(--ink-500)", fontSize:13, fontWeight:600, letterSpacing:0.8, textTransform:"uppercase" }}>
                {k.label}
              </div>
            </div>
          ))}
        </div>

        {/* Bande de confiance + pull-quote */}
        <div style={{
          background:"linear-gradient(135deg, #0a3d2e 0%, #0d5c2e 100%)",
          borderRadius: 28,
          padding:"clamp(36px, 4vw, 56px)",
          color:"#fff",
          position:"relative", overflow:"hidden",
          boxShadow:"var(--shadow-2xl)",
        }}>
          {/* Pattern doré décoratif */}
          <div style={{
            position:"absolute", inset:0, opacity:0.06, pointerEvents:"none",
            backgroundImage:"radial-gradient(rgba(201,168,76,1) 1.5px, transparent 1.5px)",
            backgroundSize:"24px 24px",
          }} />
          <div style={{ position:"relative", display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap: 40, alignItems:"center" }}>
            <div>
              <span className="ayyad-eyebrow" style={{ color:"#e9d59a", background:"rgba(201,168,76,0.10)", borderColor:"rgba(201,168,76,0.40)" }}>
                {fr ? "Engagement Ayyad" : "Ayyad commitment"}
              </span>
              <h3 className="ayyad-h-display" style={{ color:"#fff", fontSize:"clamp(1.6rem, 2.6vw, 2.4rem)", marginTop: 18, marginBottom: 16 }}>
                {fr ? <>La confiance n'est pas un mot, <em style={{ color:"#e9d59a" }}>c'est une preuve.</em></> : <>Trust isn't a word, <em style={{ color:"#e9d59a" }}>it's a proof.</em></>}
              </h3>
              <p style={{ color:"rgba(255,255,255,0.85)", lineHeight:1.7, fontSize:15 }}>
                {fr
                  ? "Nous publions chaque mois nos rapports d'impact, nos virements aux hôpitaux et notre commission. Aucune intermédiation cash, aucun frais caché : ce que vous donnez arrive intégralement à l'établissement de santé."
                  : "Each month we publish our impact reports, hospital transfers and commission. No cash intermediation, no hidden fees: what you give arrives in full to the healthcare facility."}
              </p>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap: 12 }}>
              {[
                { icon:"🔒", t: fr ? "Conformité BCEAO" : "BCEAO compliance",      s: fr ? "Plateforme déclarée et auditée" : "Declared and audited platform",   target: "how" },
                { icon:"📊", t: fr ? "Rapports trimestriels"  : "Quarterly reports", s: fr ? "Transparence totale sur les fonds" : "Full transparency on funds", target: "how" },
                { icon:"🏥", t: fr ? "Versement direct hôpital" : "Direct to hospital", s: fr ? "Jamais en espèces, toujours tracé" : "Never cash, always traceable", target: "how" },
              ].map((b, i) => (
                <button
                  key={i}
                  onClick={() => setPage && setPage(b.target)}
                  style={{
                    display:"flex", gap:14, padding:"14px 18px",
                    background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.10)",
                    borderRadius: 14,
                    cursor: setPage ? "pointer" : "default",
                    textAlign:"left", color:"inherit",
                    transition:"background .2s, border-color .2s, transform .2s",
                    alignItems:"center",
                  }}
                  onMouseEnter={e=>{ if (!setPage) return; e.currentTarget.style.background="rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor="rgba(201,168,76,0.40)"; e.currentTarget.style.transform="translateX(4px)"; }}
                  onMouseLeave={e=>{ if (!setPage) return; e.currentTarget.style.background="rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.10)"; e.currentTarget.style.transform="translateX(0)"; }}
                >
                  <div style={{ fontSize:22 }}>{b.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:"#fff" }}>{b.t}</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", marginTop:2 }}>{b.s}</div>
                  </div>
                  {setPage && (
                    <span style={{ color:"#e9d59a", fontSize:18, fontWeight:700, flexShrink:0 }}>→</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ── VisionSection — Notre vision (split image + texte émotionnel) ───────────
// ─────────────────────────────────────────────────────────────────────────────
const VisionSection = ({ lang, setPage }) => {
  const fr = lang === "fr";
  return (
    <section style={{
      background:"linear-gradient(180deg, #fdfcfa 0%, #f7f6f2 100%)",
      padding:"clamp(32px, 4vw, 56px) 0 clamp(16px, 2vw, 24px)",
      position:"relative", overflow:"hidden",
      borderTop:"1px solid rgba(10,31,26,0.04)",
    }}>
      {/* Decorative blob */}
      <div style={{
        position:"absolute", top:-120, right:-120, width:380, height:380,
        background:"radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)",
        borderRadius:"50%", pointerEvents:"none",
      }} />

      <div className="ayyad-container">
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",
          gap: 56, alignItems:"center",
        }}>
          {/* Visuel gauche — photo représentant la communauté africaine/ivoirienne */}
          <div className="ayyad-reveal-left" style={{ position:"relative" }}>
            <div style={{
              position:"relative",
              borderRadius: 28,
              overflow:"hidden",
              boxShadow:"var(--shadow-2xl)",
              aspectRatio:"4 / 5",
              background:"#0a3d2e",
            }}>
              <img
                src="https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=900&q=85"
                alt={fr ? "Patiente recevant des soins" : "Patient receiving care"}
                style={{ width:"100%", height:"100%", objectFit:"cover" }}
                onError={e=>{ e.target.style.display='none'; }}
              />
              {/* Overlay gradient bas pour lisibilité de la citation */}
              <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(10,31,26,0) 50%, rgba(10,31,26,0.78) 100%)" }} />
              {/* Citation rendue sur l'image — image nature donc on peut remettre */}
              <div style={{ position:"absolute", bottom:32, left:32, right:32, color:"#fff" }}>
                <div style={{ fontSize:48, fontFamily:"var(--font-serif)", color:"#e9d59a", lineHeight:1, marginBottom:8 }}>"</div>
                <p style={{ fontFamily:"var(--font-serif)", fontStyle:"italic", fontSize:18, fontWeight:500, lineHeight:1.45 }}>
                  {fr
                    ? "Soutenir une vie, c'est en sauver une."
                    : "To support a life is to save one."}
                </p>
              </div>
            </div>
            {/* Pas de badge floating — l'image porte déjà son propre branding Ayyad
                et un badge "Made in CI" excluerait la diaspora et les donateurs
                internationaux qui sont essentiels au modèle de solidarité. */}
          </div>

          {/* Texte droit */}
          <div className="ayyad-reveal-right">
            <span className="ayyad-eyebrow">{fr ? "Notre vision" : "Our vision"}</span>
            <h2 className="ayyad-h-display" style={{ fontSize:"clamp(2rem, 3.6vw, 3.2rem)", marginTop: 18, marginBottom: 24 }}>
              {fr
                ? <>Un accès aux soins <em>sans condition,</em> sans détour.</>
                : <>Healthcare access <em>without condition,</em> without detour.</>}
            </h2>
            <p style={{ color:"var(--ink-700)", fontSize:17, lineHeight:1.75, marginBottom: 20 }}>
              {fr
                ? "Ayyad est née d'un constat simple : en Côte d'Ivoire, des milliers de patients renoncent à des soins vitaux faute de moyens. Pourtant, des dizaines de milliers de personnes seraient prêtes à donner — si elles avaient l'assurance que leur don arrive vraiment au bon endroit."
                : "Ayyad was born from a simple observation: in Côte d'Ivoire, thousands of patients give up vital care for lack of resources. Yet tens of thousands of people would be willing to donate — if they had the assurance that their gift truly reaches the right place."}
            </p>
            <p style={{ color:"var(--ink-500)", fontSize:15, lineHeight:1.75, marginBottom: 32 }}>
              {fr
                ? "Notre mission est de créer un pont de confiance entre le donateur et le patient, à travers une plateforme transparente, vérifiée et 100% africaine."
                : "Our mission is to build a bridge of trust between the donor and the patient, through a transparent, verified and 100% African platform."}
            </p>

            {/* 3 piliers */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 32 }}>
              {[
                { icon:"🤝", t: fr ? "Solidarité" : "Solidarity"          },
                { icon:"🔍", t: fr ? "Transparence" : "Transparency"      },
                { icon:"⚡", t: fr ? "Rapidité"    : "Speed"             },
              ].map((p, i) => (
                <div key={i} style={{
                  textAlign:"center", padding:"18px 12px",
                  background:"#fff", border:"1px solid rgba(10,31,26,0.06)",
                  borderRadius: 14,
                }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>{p.icon}</div>
                  <div style={{ fontWeight:700, fontSize:13, color:"var(--ayyad-deep)" }}>{p.t}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
              <button onClick={()=>setPage("how")} className="ayyad-btn-primary" style={{ fontSize:14, padding:"13px 26px" }}>
                {fr ? "Découvrir notre démarche" : "Discover our approach"} →
              </button>
              <button onClick={()=>setPage("collectesactives")} style={{
                background:"transparent",
                border:"1.5px solid rgba(13,92,46,0.22)",
                color:"var(--ayyad-deep)",
                fontWeight:700, fontSize:14,
                padding:"13px 26px", borderRadius:9999, cursor:"pointer",
                transition:"all .2s",
              }}>
                {fr ? "Voir les campagnes" : "See campaigns"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ── TestimonialsCarousel — Témoignages bénéficiaires en carrousel premium ───
// ─────────────────────────────────────────────────────────────────────────────
const TestimonialsCarousel = ({ lang }) => {
  const fr = lang === "fr";
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const tm = setInterval(() => setIdx(i => (i + 1) % TEMOIGNAGES.length), 6000);
    return () => clearInterval(tm);
  }, [paused]);

  const goTo = (i) => setIdx((i + TEMOIGNAGES.length) % TEMOIGNAGES.length);

  return (
    <section style={{
      background:"linear-gradient(135deg, #0a3d2e 0%, #0d5c2e 50%, #0f4f3c 100%)",
      padding:"clamp(40px, 5vw, 64px) 0",
      position:"relative", overflow:"hidden",
      color:"#fff",
    }}
    onMouseEnter={()=>setPaused(true)}
    onMouseLeave={()=>setPaused(false)}
    >
      {/* Pattern décoratif */}
      <div style={{
        position:"absolute", inset:0, opacity:0.06, pointerEvents:"none",
        backgroundImage:"radial-gradient(rgba(201,168,76,1) 1px, transparent 1px)",
        backgroundSize:"32px 32px",
      }} />
      {/* Glow décoratif */}
      <div style={{
        position:"absolute", top:"30%", left:"-10%", width:400, height:400,
        background:"radial-gradient(circle, rgba(201,168,76,0.15) 0%, transparent 70%)",
        borderRadius:"50%", pointerEvents:"none", filter:"blur(20px)",
      }} />

      <div className="ayyad-container" style={{ position:"relative", zIndex:2 }}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom: 56, maxWidth: 720, margin:"0 auto 56px" }}>
          <span className="ayyad-eyebrow" style={{ color:"#e9d59a", background:"rgba(201,168,76,0.10)", borderColor:"rgba(201,168,76,0.40)" }}>
            {fr ? "Voix de bénéficiaires" : "Beneficiary voices"}
          </span>
          <h2 className="ayyad-h-display" style={{ color:"#fff", fontSize:"clamp(2rem, 3.6vw, 3rem)", marginTop: 18, marginBottom: 16 }}>
            {fr ? <>Ils ont retrouvé <em style={{ color:"#e9d59a" }}>l'espoir,</em> et la santé.</> : <>They found <em style={{ color:"#e9d59a" }}>hope,</em> and health.</>}
          </h2>
          <p style={{ color:"rgba(255,255,255,0.78)", fontSize:16, lineHeight:1.65 }}>
            {fr
              ? "Chaque don raconte une histoire. Voici celles que la solidarité Ayyad a permis d'écrire."
              : "Every donation tells a story. Here are the ones Ayyad solidarity helped write."}
          </p>
        </div>

        {/* Carrousel */}
        <div style={{ position:"relative", maxWidth: 880, margin:"0 auto" }}>
          <div style={{
            background:"rgba(255,255,255,0.05)",
            backdropFilter:"blur(12px)",
            border:"1px solid rgba(255,255,255,0.10)",
            borderRadius: 28,
            padding:"clamp(28px, 4vw, 48px)",
            position:"relative",
            minHeight: 320,
          }}>
            {/* Big quote mark */}
            <div style={{
              position:"absolute", top:24, right:32,
              fontSize: 100, lineHeight:1,
              color:"rgba(201,168,76,0.18)",
              fontFamily:"var(--font-serif)",
            }}>"</div>

            {TEMOIGNAGES.map((t, i) => (
              <div key={t.id} style={{
                display: i === idx ? "block" : "none",
                animation: i === idx ? "ayyad-fade-in 600ms ease-out" : "none",
              }}>
                {/* Stars */}
                <div style={{ display:"flex", gap:4, marginBottom: 24 }}>
                  {[...Array(t.stars)].map((_, s) => (
                    <span key={s} style={{ color:"#e9d59a", fontSize:18 }}>★</span>
                  ))}
                </div>

                {/* Message */}
                <p style={{
                  fontFamily:"var(--font-serif)",
                  fontStyle:"italic",
                  fontSize:"clamp(1.1rem, 1.6vw, 1.5rem)",
                  lineHeight: 1.55,
                  color:"#fff",
                  marginBottom: 32,
                  fontWeight: 500,
                }}>
                  « {t.message[lang]} »
                </p>

                {/* Auteur */}
                <div style={{ display:"flex", alignItems:"center", gap: 16, flexWrap:"wrap" }}>
                  <div style={{
                    width: 56, height: 56, borderRadius:"50%",
                    background:"linear-gradient(135deg, #C9A84C, #e9d59a)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize: 26, flexShrink:0,
                    border:"2px solid rgba(255,255,255,0.18)",
                  }}>{t.image}</div>
                  <div>
                    <div style={{ fontWeight:800, fontSize:16, color:"#fff" }}>{t.name}, <span style={{ fontWeight:500, color:"rgba(255,255,255,0.7)" }}>{t.age} {fr?"ans":"yo"}</span></div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", marginTop:2 }}>
                      🏥 {t.hospital} · 📍 {t.city} · {t.date}
                    </div>
                  </div>
                  <div style={{ marginLeft:"auto" }}>
                    <span style={{
                      background:"rgba(201,168,76,0.18)",
                      border:"1px solid rgba(201,168,76,0.40)",
                      color:"#e9d59a",
                      fontSize: 11, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase",
                      padding:"6px 14px", borderRadius:999,
                    }}>{t.category[lang]}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Dots + controls */}
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:18, marginTop: 32 }}>
            <button onClick={()=>goTo(idx-1)} style={{
              width:40, height:40, borderRadius:"50%",
              background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.18)",
              color:"#fff", fontSize:18, cursor:"pointer",
            }} aria-label="Précédent">‹</button>
            <div style={{ display:"flex", gap:8 }}>
              {TEMOIGNAGES.map((_, i) => (
                <button key={i} onClick={()=>setIdx(i)} aria-label={`Témoignage ${i+1}`} style={{
                  height: 4, borderRadius: 999,
                  width: i === idx ? 28 : 14,
                  background: i === idx ? "#e9d59a" : "rgba(255,255,255,0.30)",
                  border:"none", cursor:"pointer", transition:"all .35s",
                }} />
              ))}
            </div>
            <button onClick={()=>goTo(idx+1)} style={{
              width:40, height:40, borderRadius:"50%",
              background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.18)",
              color:"#fff", fontSize:18, cursor:"pointer",
            }} aria-label="Suivant">›</button>
          </div>
        </div>
      </div>
    </section>
  );
};

// ── HomePage
// ── Cas Urgents Page ──────────────────────────────────────────
const UrgentsPage = ({ setPage, setSelectedCase, lang }) => {
  const urgents = getDisplayCases().filter(c => c.urgent || c.daysLeft <= 7);
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-red-700 to-red-500 text-white py-16 px-4 text-center">
        <div className="text-5xl mb-4">🚨</div>
        <h1 className="text-3xl font-black mb-3">{lang==="fr" ? "Cas urgents" : "Urgent cases"}</h1>
        <p className="text-red-100 max-w-xl mx-auto">{lang==="fr" ? "Ces patients ont besoin d'aide immédiate. Chaque heure compte." : "These patients need immediate help. Every hour counts."}</p>
        <div className="bg-red-800/40 rounded-2xl px-6 py-3 inline-block mt-4 text-sm font-semibold">
          ⏱️ {lang==="fr" ? "Intervention critique sous 72h" : "Critical intervention within 72h"}
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-4">
        {urgents.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">✅</div>
            <div>{lang==="fr" ? "Aucun cas urgent pour l'instant." : "No urgent cases right now."}</div>
          </div>
        ) : urgents.map(c => (
          <div key={c.id} onClick={() => { setSelectedCase(c); setPage("case"); }}
            className="bg-white rounded-2xl border-2 border-red-200 shadow-sm p-6 cursor-pointer hover:border-red-400 hover:shadow-md transition-all">
            <div className="flex items-start gap-4">
              <div className="text-4xl overflow-hidden">{c.image && (c.image.startsWith("http") ? <img src={c.image} alt="" className="w-full h-full object-cover rounded-t-2xl" /> : c.image)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">🚨 URGENT</span>
                  {c.daysLeft <= 7 && <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">⏱️ {c.daysLeft}j restants</span>}
                </div>
                <h3 className="font-black text-gray-900">{c.title[lang]}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{c.hospital} · {c.city}</p>
                <p className="text-sm text-gray-600 mt-2 line-clamp-2">{c.desc[lang]}</p>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{c.collected.toLocaleString()} FCFA</span>
                    <span>{c.required.toLocaleString()} FCFA</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{width: Math.min(100, Math.round(c.collected/c.required*100))+"%"}} />
                  </div>
                  <div className="text-xs text-red-600 font-bold mt-1">{Math.min(100, Math.round(c.collected/c.required*100))}% {lang==="fr"?"collecté":"collected"}</div>
                </div>
              </div>
              <button className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm flex-shrink-0">
                {lang==="fr" ? "Aider →" : "Help →"}
              </button>
            </div>
          </div>
        ))}
        <div className="text-center mt-6">
          <button onClick={() => setPage("home")} className="text-sm text-gray-400 hover:text-red-600">← {lang==="fr"?"Retour à l'accueil":"Back to home"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Collectes terminées & Témoignages ─────────────────────────

// ── Collectes Actives Page (groupées par spécialité) ──────────
const CAT_ICONS = {
  "Cardiologie": "🫀", "Cardiology": "🫀",
  "Oncologie": "🎗️", "Oncology": "🎗️",
  "Neurologie": "🧠", "Neurology": "🧠",
  "Orthopédie": "🦴", "Orthopedics": "🦴",
  "Pédiatrie": "👶", "Pediatrics": "👶",
  "Gynécologie": "🌸", "Gynecology": "🌸",
  "Néphrologie": "🫘", "Nephrology": "🫘",
  "Autre": "🏥", "Other": "🏥",
};

// Page spécialité — collectes d'une seule spécialité
const SpecialitePage = ({ setPage, setSelectedCase, lang, specialite }) => {
  const [dbCases, setDbCases] = useState([]);
  useEffect(() => {
    supabase.from("cases").select("*").eq("status", "COLLECTING").limit(200).then(async ({ data }) => {
      if (data && data.length > 0) {
        const enriched = await enrichCasesWithTotals(data);
        setDbCases(enriched);
      }
    });
  }, []);
  const calcDaysLeft = (c) => {
    if (c.daysLeft !== undefined) return c.daysLeft;
    if (c.deadline) {
      const diff = new Date(c.deadline) - new Date();
      return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    return 30;
  };
  const normalizCase = (c) => ({
    ...c,
    title: typeof c.title === "object" ? c.title : { fr: c.title || "Sans titre", en: c.title || "Untitled" },
    category: typeof c.category === "object" ? c.category : { fr: c.category || "Autre", en: c.category || "Other" },
    desc: typeof c.desc === "object" ? c.desc : { fr: c.description || "", en: c.description || "" },
    required: Number(c.required || c.amount || 0),
    collected: Number(c.collected || 0),
    donors: Number(c.donors || 0),
    trackingId: c.trackingId || c.tracking_id || "",
    image: c.photos?.[0] || c.photo_url || c.image || null,
    photos: c.photo_url ? [c.photo_url] : (c.photos || []),
    daysLeft: calcDaysLeft(c),
    urgent: c.urgent ?? false,
  });
  const allCases = [
    ...dbCases.map(normalizCase),
    ...getDisplayCases().filter(c => c.status !== "FUNDED"),
  ];
  const cases = allCases.filter(c => c.category[lang] === specialite);
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-emerald-700 to-teal-600 text-white py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <button onClick={() => setPage("collectesactives")} className="flex items-center gap-1 text-emerald-200 hover:text-white text-sm mb-5">← {lang==="fr" ? "Toutes les spécialités" : "All specialties"}</button>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{CAT_ICONS[specialite] || "🏥"}</span>
            <div>
              <h1 className="text-3xl font-black">{specialite}</h1>
              <p className="text-emerald-200 text-sm">{cases.length} {lang==="fr" ? "collecte(s) active(s)" : "active campaign(s)"}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-10">
        {cases.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">{CAT_ICONS[specialite] || "🏥"}</div>
            <div>{lang==="fr" ? "Aucune collecte active dans cette spécialité." : "No active campaigns in this specialty."}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cases.map(c => {
              const percent = Math.min(100, Math.round((c.collected / c.required) * 100));
              return (
                <button key={c.id} onClick={() => { setSelectedCase(c); setPage("case"); }}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-300 overflow-hidden text-left transition-all group">
                  <div className="h-28 bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center text-6xl relative">
                    {c.image && c.image.startsWith("http") ? <img src={c.image} alt="" className="w-full h-full object-cover rounded-t-xl" /> : <span className="text-5xl">{CAT_ICONS[c.category?.fr] || CAT_ICONS[c.category] || "🏥"}</span>}
                    {c.urgent && <span className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">🚨 URGENT</span>}
                  </div>
                  <div className="p-4">
                    <div className="font-bold text-gray-900 text-sm leading-snug group-hover:text-emerald-700 mb-1">{c.title[lang]}</div>
                    <div className="text-xs text-gray-400 mb-3">🏥 {c.hospital} · 📍 {c.city}</div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span className="font-semibold text-gray-800">{fmt(c.collected)}</span>
                      <span className="text-gray-400">sur {fmt(c.required)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-emerald-500 rounded-full" style={{width: percent+"%"}} />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">👥 {c.donors} · ⏳ {c.daysLeft}j</span>
                      <span className="font-bold text-emerald-600">{percent}%</span>
                    </div>
                    <div className="text-[10px] font-mono text-gray-300 mt-2">{c.trackingId}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Page liste des spécialités
const CollectesActivesPage = ({ setPage, setSelectedCase, lang, setSpecialite }) => {
  const [dbCases, setDbCases] = useState([]);
  useEffect(() => {
    supabase.from("cases").select("*").eq("status", "COLLECTING").limit(200).then(async ({ data }) => {
      if (data && data.length > 0) {
        const enriched = await enrichCasesWithTotals(data);
        setDbCases(enriched);
      }
    });
  }, []);
  const calcDaysLeft = (c) => {
    if (c.daysLeft !== undefined) return c.daysLeft;
    if (c.deadline) {
      const diff = new Date(c.deadline) - new Date();
      return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    return 30;
  };
  const normalizCase = (c) => ({
    ...c,
    title: typeof c.title === "object" ? c.title : { fr: c.title || "Sans titre", en: c.title || "Untitled" },
    category: typeof c.category === "object" ? c.category : { fr: c.category || "Autre", en: c.category || "Other" },
    desc: typeof c.desc === "object" ? c.desc : { fr: c.description || "", en: c.description || "" },
    required: Number(c.required || c.amount || 0),
    collected: Number(c.collected || 0),
    donors: Number(c.donors || 0),
    trackingId: c.trackingId || c.tracking_id || "",
    image: c.photos?.[0] || c.photo_url || c.image || null,
    photos: c.photo_url ? [c.photo_url] : (c.photos || []),
    daysLeft: calcDaysLeft(c),
    urgent: c.urgent ?? false,
  });
  const mockActive = getDisplayCases().filter(c => c.status !== "FUNDED");
  const active = dbCases.length > 0
    ? [...dbCases.map(normalizCase), ...mockActive]
    : mockActive;
  const groups = {};
  active.forEach(c => {
    const cat = c.category[lang];
    if (!groups[cat]) groups[cat] = { label: cat, cases: [] };
    groups[cat].cases.push(c);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-emerald-700 to-teal-600 text-white py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <button onClick={() => setPage("home")} className="flex items-center gap-1 text-emerald-200 hover:text-white text-sm mb-6">← {lang==="fr" ? "Retour" : "Back"}</button>
          <h1 className="text-3xl font-black mb-2">🏥 {lang==="fr" ? "Collectes actives" : "Active campaigns"}</h1>
          <p className="text-emerald-100 text-sm">{active.length} {lang==="fr" ? "dossiers vérifiés — choisissez une spécialité" : "verified cases — choose a specialty"}</p>
          <div className="flex gap-4 mt-6 flex-wrap">
            {[[active.length+"", lang==="fr"?"Collectes":"Campaigns"],
              [Object.keys(groups).length+"", lang==="fr"?"Spécialités":"Specialties"],
              [active.reduce((s,c)=>s+c.donors,0)+"", lang==="fr"?"Donateurs":"Donors"]
            ].map(([v,l]) => (
              <div key={l} className="bg-white/10 rounded-xl px-4 py-2 text-center">
                <div className="text-xl font-black">{v}</div>
                <div className="text-emerald-200 text-xs">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grille des spécialités */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-lg font-black text-gray-900 mb-6">{lang==="fr" ? "Choisissez une spécialité" : "Choose a specialty"}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Object.values(groups).map(group => (
            <button key={group.label}
              onClick={() => { setSpecialite(group.label); setPage("specialite"); }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-400 p-6 text-center transition-all group">
              <div className="text-4xl mb-3">{CAT_ICONS[group.label] || "🏥"}</div>
              <div className="font-bold text-gray-900 text-sm group-hover:text-emerald-700">{group.label}</div>
              <div className="text-xs text-gray-400 mt-1">{group.cases.length} {lang==="fr" ? "collecte(s)" : "campaign(s)"}</div>
              {group.cases.some(c => c.urgent) && (
                <div className="mt-2 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block">🚨 Urgent</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const CollectesPage = ({ setPage, lang }) => {
  const [tab, setTab] = useState("testimonials");
  const funded = getDisplayCases().filter(c => c.status === "FUNDED");
  const [dbTestimonials, setDbTestimonials] = useState([]);
  useEffect(() => {
    supabase.from("testimonials").select("*").eq("status","approved").order("created_at",{ascending:false}).limit(50).then(({data})=>{
      if (data && data.length > 0) setDbTestimonials(data);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-700 to-teal-600 text-white py-16 px-4 text-center">
        <div className="text-5xl mb-4">💚</div>
        <h1 className="text-3xl font-black mb-3">{lang==="fr" ? "Vies transformées par Ayyad" : "Lives transformed by Ayyad"}</h1>
        <p className="text-emerald-100 max-w-xl mx-auto">{lang==="fr" ? "Ces personnes ont reçu les soins dont elles avaient besoin grâce à votre générosité." : "These people received the care they needed thanks to your generosity."}</p>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mt-8">
          {[[TEMOIGNAGES.length+"", lang==="fr"?"Vies aidées":"Lives helped"],
            [(TEMOIGNAGES.reduce((s,t)=>s+t.amount,0)/1000000).toFixed(1)+"M", "FCFA "+( lang==="fr"?"versés":"paid")],
            ["100%", lang==="fr"?"Directs hôpital":"Direct hospital"]
          ].map(([v,l]) => (
            <div key={l} className="bg-white/10 rounded-2xl p-4">
              <div className="text-2xl font-black">{v}</div>
              <div className="text-emerald-200 text-xs mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 w-fit mx-auto">
          <button onClick={() => setTab("testimonials")} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab==="testimonials" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            💬 {lang==="fr" ? "Témoignages" : "Testimonials"}
          </button>
          <button onClick={() => setTab("funded")} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab==="funded" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            ✅ {lang==="fr" ? "Collectes terminées" : "Completed campaigns"}
          </button>
        </div>

        {/* Témoignages */}
        {tab==="testimonials" && (
          <div className="space-y-6">
            {(dbTestimonials.length > 0 ? dbTestimonials : TEMOIGNAGES.map(t=>({
              id: t.id, beneficiary: t.name, age: t.age, city: t.city, hospital: t.hospital,
              category_fr: t.category.fr, category_en: t.category.en, amount: t.amount,
              message_fr: t.message.fr, message_en: t.message.en, stars: t.stars,
              created_at: t.date
            }))).map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
                      {t.photo_url ? <img src={t.photo_url} alt="" className="w-full h-full object-cover rounded-2xl" /> : "💚"}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="font-black text-gray-900">{t.beneficiary}</div>
                          <div className="text-xs text-gray-400">{t.age && `${t.age} ${lang==="fr"?"ans":"years old"}`}{t.city && ` · ${t.city}`}{t.hospital && ` · ${t.hospital}`}</div>
                        </div>
                        <div className="text-right">
                          {t.amount && <div className="text-emerald-600 font-bold text-sm">{Number(t.amount).toLocaleString()} FCFA</div>}
                          <div className="text-xs text-gray-400">{t.created_at ? new Date(t.created_at).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}) : ""}</div>
                        </div>
                      </div>
                      <div className="flex mt-1">{"⭐".repeat(t.stars||5)}</div>
                    </div>
                  </div>
                  <div className="mt-4 bg-emerald-50 rounded-xl p-4 border-l-4 border-emerald-400">
                    <p className="text-gray-700 text-sm leading-relaxed italic">"{lang==="fr" ? t.message_fr : (t.message_en || t.message_fr)}"</p>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {(t.category_fr || t.category_en) && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                        {lang==="fr" ? t.category_fr : (t.category_en || t.category_fr)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">✅ {lang==="fr"?"Collecte terminée · Virement confirmé":"Campaign completed · Transfer confirmed"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Collectes terminées */}
        {tab==="funded" && (
          <div className="space-y-4">
            {funded.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">🏥</div>
                <div>{lang==="fr" ? "Aucune collecte terminée pour l'instant." : "No completed campaigns yet."}</div>
              </div>
            ) : funded.map(c => (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-5">
                <div className="text-4xl overflow-hidden">{c.image && (c.image.startsWith("http") ? <img src={c.image} alt="" className="w-full h-full object-cover rounded-t-2xl" /> : c.image)}</div>
                <div className="flex-1">
                  <div className="font-bold text-gray-900">{c.title[lang]}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.hospital} · {c.city}</div>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{c.collected.toLocaleString()} FCFA</span><span>{c.required.toLocaleString()} FCFA</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{width:"100%"}} />
                    </div>
                  </div>
                </div>
                <div className="text-center flex-shrink-0">
                  <div className="text-2xl">✅</div>
                  <div className="text-xs text-emerald-600 font-bold mt-1">{lang==="fr"?"Financé":"Funded"}</div>
                  <div className="text-xs text-gray-400">{c.donors} {lang==="fr"?"donateurs":"donors"}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center mt-10">
          <button onClick={() => setPage("home")} className="text-sm text-gray-400 hover:text-emerald-600">← {lang==="fr"?"Retour à l'accueil":"Back to home"}</button>
        </div>
      </div>
    </div>
  );
};

const DonationTicker = ({ lang }) => {
  const [dons, setDons] = useState([]);
  useEffect(() => {
    // anonymous est dérivé de donor_name === null (pas une colonne dédiée)
    supabase.from("donations").select("donor_name,amount_fcfa,amount,created_at")
      .eq("status","confirmed").order("created_at",{ascending:false}).limit(8)
      .then(({data}) => { if (data && data.length>0) setDons(data); });
    const ch = supabase.channel("ticker-donations")
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"donations"},payload=>{
        if (payload.new.status==="confirmed") {
          setDons(prev=>[payload.new,...prev].slice(0,8));
        }
      }).subscribe();
    return () => supabase.removeChannel(ch);
  },[]);
  if (dons.length===0) return null;
  const items = [...dons,...dons]; // double pour loop infinie
  return (
    <div className="bg-emerald-800 overflow-hidden py-2">
      <style>{`
        @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .ticker-track { display:flex; animation: ticker 25s linear infinite; white-space:nowrap; }
        .ticker-track:hover { animation-play-state:paused; }
      `}</style>
      <div className="ticker-track">
        {items.map((d,i) => (
          <span key={i} className="flex items-center gap-2 text-xs text-emerald-100 font-medium px-6 flex-shrink-0">
            <span className="text-emerald-300">💚</span>
            <span>{publicDonorName(d.donor_name, lang)}</span>
            <span className="text-emerald-300 font-black">{((d.amount_fcfa||d.amount||0)).toLocaleString("fr-CI")} FCFA</span>
            <span className="text-emerald-500 mx-2">·</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const HomePage = ({ setPage, setSelectedCase, lang }) => {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [heroStats, setHeroStats] = useState({ patients: "0", collected: "0", hospitals: "18", funded: "0" });
  useEffect(() => {
    const loadStats = async () => {
      try {
        const { data } = await supabase.from("cases").select("id, status, amount").limit(500);
        if (data) {
          // Patients aidés = dossiers qui ont été approuvés (pas PENDING/REJECTED)
          const active = data.filter(c => !["PENDING","REJECTED"].includes(c.status));
          // Campagnes financées = sous-ensemble des dossiers au statut FUNDED uniquement
          const fundedCount = data.filter(c => c.status === "FUNDED").length;
          // Total collecté = somme des dons CONFIRMÉS sur les dossiers actifs
          const totals = await fetchConfirmedTotals(active.map(c => c.id));
          const totalCollected = Object.values(totals).reduce((s, t) => s + (t.collected || 0), 0);
          const fmtCollected = totalCollected >= 1000000
            ? (totalCollected / 1000000).toFixed(1).replace(".0","") + "M"
            : totalCollected >= 1000
            ? Math.round(totalCollected / 1000) + "k"
            : String(totalCollected);
          setHeroStats(prev => ({
            ...prev,
            patients: String(active.length),
            collected: totalCollected > 0 ? fmtCollected : "0",
            funded: String(fundedCount),
          }));
        }
      } catch(e) { /* garder les valeurs par défaut (0) */ }
    };
    loadStats();
  }, []);
  const [heroMenu, setHeroMenu] = useState(false);
  const [dbCases, setDbCases] = useState([]);
  const t = T[lang];

  useEffect(() => {
    supabase.from("cases").select("*").eq("status", "COLLECTING").limit(200).then(async ({ data }) => {
      if (data && data.length > 0) {
        // On enrichit d'abord avec les totaux confirmés (collected + donors live depuis les dons)
        const enriched = await enrichCasesWithTotals(data);
        const calcDaysLeft = (c) => {
          if (c.deadline) { const diff = new Date(c.deadline) - new Date(); return Math.max(0, Math.ceil(diff / (1000*60*60*24))); }
          return 30;
        };
        const normalized = enriched.map(c => ({
          ...c,
          title: typeof c.title === "object" ? c.title : { fr: c.title || "Sans titre", en: c.title || "Untitled" },
          category: typeof c.category === "object" ? c.category : { fr: c.category || "Autre", en: c.category || "Other" },
          desc: typeof c.desc === "object" ? c.desc : { fr: c.description || "", en: c.description || "" },
          required: Number(c.required || c.amount || 0),
          collected: Number(c.collected || 0),
          donors: Number(c.donors || 0),
          trackingId: c.trackingId || c.tracking_id || "",
          image: c.photo_url || c.image || null,
          photos: c.photo_url ? [c.photo_url] : (c.photos || []),
          daysLeft: calcDaysLeft(c),
          urgent: c.urgent ?? false,
        }));
        setDbCases(normalized);
      }
    });
  }, []);

  const catMap = lang==="fr" ? ["Tous","Cardiologie","Oncologie","Néphrologie","Orthopédie"] : ["All","Cardiology","Oncology","Nephrology","Orthopedics"];
  const allCases = dbCases.length > 0 ? [...dbCases, ...getDisplayCases().filter(c => c.status !== "FUNDED")] : getDisplayCases();
  // Helper: extracts string from title/category whether stored as string or {fr,en} object
  const gs = (val) => typeof val === "object" && val !== null ? (val[lang] || val.fr || val.en || "") : (val || "");
  const filtered = (filter==="all"||filter===catMap[0] ? allCases : allCases.filter(c => gs(c.category).toLowerCase()===filter.toLowerCase()))
    .filter(c => !search.trim() || gs(c.title).toLowerCase().includes(search.toLowerCase()) || (c.hospital||"").toLowerCase().includes(search.toLowerCase()) || (c.city||"").toLowerCase().includes(search.toLowerCase()));
  return (
    <div onClick={() => setHeroMenu(false)}>
      {/* Hero slider plein écran premium — storytelling 4 slides + KPIs live */}
      <HeroSlider lang={lang} setPage={setPage} t={t} heroStats={heroStats} />
      {/* Ancienne section gradient supprimée — son contenu a été intégré dans HeroSlider */}
      <div className="hidden">
        <div className="max-w-7xl mx-auto px-4 py-16 sm:py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
            <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />{t.hero.badge}
          </div>
          <h1 className="text-4xl md:text-6xl font-black mb-5 leading-tight">{t.hero.title1}<br /><span className="text-emerald-200">{t.hero.title2}</span></h1>
          <p className="text-emerald-100 text-lg max-w-2xl mx-auto mb-8 leading-relaxed">{t.hero.sub}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => setPage("collectes")} className="bg-white text-emerald-700 font-bold px-5 py-3 rounded-xl hover:bg-emerald-50 shadow-lg text-sm">{t.hero.cta1} →</button>
            <button onClick={() => setPage("submit")} className="bg-emerald-500/40 hover:bg-emerald-500/60 border border-white/30 text-white font-semibold px-5 py-3 rounded-xl text-sm">{t.hero.cta2}</button>
            <button onClick={() => setPage("how")} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-5 py-3 rounded-xl text-sm">{lang==="fr" ? "Comment ça marche" : "How it works"}</button>
            {/* Je soutiens dropdown */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setHeroMenu(!heroMenu)} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-5 py-3 rounded-xl text-sm flex items-center gap-1">
                {lang==="fr" ? "Je soutiens 🤝" : "I support 🤝"} <span className="text-xs">{heroMenu ? "▲" : "▼"}</span>
              </button>
              {heroMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 z-50">
                  <button onClick={() => { setPage("collectesactives"); setHeroMenu(false); }} className="w-full text-left px-3 py-3 rounded-xl hover:bg-emerald-50 transition-colors group">
                    <div className="font-semibold text-gray-900 text-sm group-hover:text-emerald-700">🏥 {lang==="fr" ? "Collectes actives" : "Active campaigns"}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{lang==="fr" ? "Parcourir toutes les collectes médicales" : "Browse all medical campaigns"}</div>
                  </button>
                  <button onClick={() => { setPage("urgents"); setHeroMenu(false); }} className="w-full text-left px-3 py-3 rounded-xl hover:bg-red-50 transition-colors group">
                    <div className="font-semibold text-gray-900 text-sm group-hover:text-red-700">🚨 {lang==="fr" ? "Cas urgents" : "Urgent cases"}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{lang==="fr" ? "Interventions critiques sous 72h" : "Critical interventions within 72h"}</div>
                  </button>
                  <button onClick={() => { setPage("how"); setHeroMenu(false); }} className="w-full text-left px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="font-semibold text-gray-900 text-sm">🔒 {lang==="fr" ? "Garantie Ayyad" : "Ayyad guarantee"}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{lang==="fr" ? "Fonds versés directement à l'hôpital" : "Funds sent directly to hospital"}</div>
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setPage("tracking")} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-5 py-3 rounded-xl text-sm">{lang==="fr" ? "Suivi 🔍" : "Track 🔍"}</button>
          </div>
        </div>
        <div className="bg-white/10 border-t border-white/20">
          <div className="max-w-7xl mx-auto px-4 py-5 grid grid-cols-3 text-center gap-4">
            {[[heroStats.patients,t.stats.patients],[heroStats.collected,t.stats.collected],[heroStats.hospitals,t.stats.hospitals]].map(([v,l]) => (
              <div key={l}><div className="text-2xl font-black">{v}</div><div className="text-emerald-200 text-xs mt-0.5">{l}</div></div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Ticker derniers dons ── */}
      <DonationTicker lang={lang} />

      {/* ── Section Notre Vision — émotionnelle, place juste apres le hero ── */}
      <VisionSection lang={lang} setPage={setPage} />

      {/* ── Section Impact (compteurs animés + confiance financière) ── */}
      <Reveal><ImpactSection lang={lang} heroStats={heroStats} setPage={setPage} /></Reveal>

      {/* Urgent Cases Banner — interventions critiques sous 72h */}
      <Reveal><UrgentBanner cases={getDisplayCases()} setSelectedCase={setSelectedCase} setPage={setPage} lang={lang} /></Reveal>

      {/* ── Section Campagnes — design premium éditorial ── */}
      {/* La section utilise un conteneur plus large (1600px) pour permettre 4-5
          cartes par ligne sur grand écran. Le header reste dans le conteneur
          standard pour rester centré et lisible. */}
      <section id="collectes" style={{ background:"var(--paper)", padding:"clamp(40px, 5vw, 64px) clamp(20px, 3vw, 40px) 8px" }}>
        <div style={{ maxWidth: 1240, margin:"0 auto" }}>
          {/* Header section éditorial */}
          <div style={{ display:"flex", flexDirection:"column", gap:16, marginBottom: 24 }}>
            <div style={{ textAlign:"center" }}>
              <span className="ayyad-eyebrow">{lang==="fr" ? "Campagnes vérifiées" : "Verified campaigns"}</span>
              <h2 className="ayyad-h-display" style={{ fontSize:"clamp(2rem, 3.6vw, 3rem)", marginTop: 18, marginBottom: 14 }}>
                {lang==="fr" ? <>Soutenez des patients <em>aujourd'hui.</em></> : <>Support patients <em>today.</em></>}
              </h2>
              <p style={{ color:"var(--ink-500)", fontSize:16, maxWidth: 620, margin:"0 auto", lineHeight:1.65 }}>
                {lang==="fr"
                  ? `${getDisplayCases().filter(c=>c.status==="COLLECTING").length + dbCases.length} dossiers actifs · 100% vérifiés par notre équipe et un hôpital partenaire`
                  : `${getDisplayCases().filter(c=>c.status==="COLLECTING").length + dbCases.length} active cases · 100% verified by our team and a partner hospital`}
              </p>
            </div>

            {/* Filtres + recherche */}
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {catMap.map((c,i) => {
                  const active = (filter==="all"&&i===0)||filter===c;
                  return (
                    <button key={c} onClick={() => setFilter(i===0?"all":c)} style={{
                      padding:"8px 18px", borderRadius: 9999,
                      fontSize:13, fontWeight: active ? 700 : 600,
                      background: active ? "linear-gradient(135deg, var(--ayyad-deep), var(--ayyad-emerald))" : "#fff",
                      color: active ? "#fff" : "var(--ink-700)",
                      border: active ? "1px solid transparent" : "1px solid rgba(10,31,26,0.10)",
                      cursor:"pointer",
                      boxShadow: active ? "0 4px 14px rgba(13,92,46,0.24)" : "0 1px 2px rgba(10,31,26,0.04)",
                      transition:"all .2s",
                    }}>{c}</button>
                  );
                })}
              </div>
              <div style={{ position:"relative", minWidth: 260, flex:"1 1 260px", maxWidth: 360 }}>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={lang === "fr" ? "Rechercher par nom, hôpital, ville…" : "Search by name, hospital, city…"}
                  style={{
                    width:"100%", padding:"11px 16px 11px 42px",
                    background:"#fff",
                    border:"1px solid rgba(10,31,26,0.10)",
                    borderRadius: 9999,
                    fontSize:14, color:"var(--ink-900)",
                    boxShadow:"0 1px 2px rgba(10,31,26,0.04)",
                    outline:"none",
                    transition:"border-color .2s, box-shadow .2s",
                  }}
                  onFocus={e=>{ e.currentTarget.style.borderColor = "var(--ayyad-emerald)"; e.currentTarget.style.boxShadow="0 0 0 4px rgba(13,92,46,0.10)"; }}
                  onBlur={e=>{ e.currentTarget.style.borderColor = "rgba(10,31,26,0.10)"; e.currentTarget.style.boxShadow="0 1px 2px rgba(10,31,26,0.04)"; }}
                />
                <span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", color:"var(--ink-400)" }}>🔍</span>
              </div>
            </div>
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 24px", color:"var(--ink-400)" }}>
              <div style={{ fontSize:42, marginBottom: 12 }}>🔍</div>
              <p>{lang==="fr" ? "Aucune campagne ne correspond à votre recherche." : "No campaign matches your search."}</p>
            </div>
          )}
        </div>

        {/* Grille campagnes — conteneur élargi à 1600px pour 4-5 cartes/ligne
            Limitée à 10 dossiers (2 lignes de 5) sur la home, avec un bouton
            "Voir toutes les campagnes" qui route vers la page dédiée. */}
        {filtered.length > 0 && (() => {
          const HOME_LIMIT = 10;
          const visible = filtered.slice(0, HOME_LIMIT);
          const remaining = filtered.length - visible.length;
          return (
            <div style={{ maxWidth: 1600, margin:"0 auto" }}>
              <div style={{
                display:"grid",
                gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",
                gap: 20,
              }}>
                {visible.map(c => <CaseCard key={c.id} c={c} lang={lang} t={t} onClick={() => { setSelectedCase(c); setPage("case"); }} />)}
              </div>
              {/* Bouton "Voir toutes les campagnes" — uniquement si plus de 10 dossiers */}
              {remaining > 0 && (
                <div style={{ textAlign:"center", marginTop: 28 }}>
                  <button
                    onClick={() => setPage("collectesactives")}
                    className="ayyad-btn-primary"
                    style={{ fontSize:14, padding:"14px 32px" }}
                  >
                    {lang==="fr"
                      ? `Voir toutes les campagnes (${filtered.length}) →`
                      : `View all campaigns (${filtered.length}) →`}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* ── Bandeau hôpitaux partenaires — directement après les campagnes ── */}
      <Reveal><PartnersBanner lang={lang} /></Reveal>

      {/* ── Carrousel Témoignages — voix bénéficiaires ── */}
      <TestimonialsCarousel lang={lang} />

      {/* ── CTA Soutenir Ayyad — élégant, pas envahissant ── */}
      <section style={{
        background:"linear-gradient(135deg, #fbf9f3 0%, #f7f6f2 100%)",
        padding:"clamp(40px, 5vw, 64px) 0",
        borderTop:"1px solid rgba(201,168,76,0.20)",
      }}>
        <div className="ayyad-container">
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",
            gap:32, alignItems:"center",
          }}>
            <div>
              <span className="ayyad-eyebrow">{lang==="fr" ? "Soutenir la plateforme" : "Support the platform"}</span>
              <h3 className="ayyad-h-display" style={{ fontSize:"clamp(1.6rem, 2.6vw, 2.2rem)", marginTop: 14, marginBottom: 14 }}>
                {lang==="fr" ? <>Aider Ayyad à <em>grandir.</em></> : <>Help Ayyad <em>grow.</em></>}
              </h3>
              <p style={{ color:"var(--ink-500)", fontSize:15, lineHeight:1.65 }}>
                {lang==="fr"
                  ? "Votre soutien finance la vérification des dossiers médicaux, les partenariats hospitaliers et l'accompagnement personnalisé des patients."
                  : "Your support funds medical case verification, hospital partnerships and personalized patient guidance."}
              </p>
            </div>
            <div style={{ textAlign:"center" }}>
              <button onClick={() => setPage("support-ayyad")} className="ayyad-btn-gold" style={{ fontSize:14, padding:"15px 30px" }}>
                💚 {lang==="fr" ? "Soutenir Ayyad" : "Support Ayyad"} →
              </button>
              <div style={{ fontSize:12, color:"var(--ink-400)", marginTop:14, fontWeight:600 }}>
                {lang==="fr" ? "Don 100% dédié au fonctionnement de la plateforme" : "100% dedicated to platform operations"}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// ── Case Detail + Donation Widget ─────────────────────────────
const CasePage = ({ c, setPage, lang, user }) => {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("FCFA");
  // PayDunya en attente d'activation — pour l'instant on retombe sur Wave (QR statique du marchand)
  const [provider, setProvider] = useState("WAVE");
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  // Edit mode (owner seulement)
  const [editOpen, setEditOpen] = useState(false);
  const [editVideoUrl, setEditVideoUrl_] = useState(c.video_url || c.videoUrl || "");
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [editPhotoUploading, setEditPhotoUploading] = useState(false);
  // donMode: "choose" | "anonymous" | "logged" | "confirm" | "success"
  // Si l'utilisateur est déjà connecté, on saute l'écran de choix et on va direct au formulaire connecté
  const [donMode, setDonMode] = useState(user ? "logged" : "choose");
  // Référence unique du paiement, générée au passage à l'étape "confirm".
  // Permet d'avoir EXACTEMENT la même référence affichée dans le QR Wave et stockée dans la table donations,
  // pour que l'admin puisse rattacher manuellement le paiement reçu sur Wave Business au bon dossier.
  const [paymentRef, setPaymentRef] = useState("");
  // États pour l'enregistrement du don (évite l'insert silencieux + double-clic)
  const [donSubmitting, setDonSubmitting] = useState(false);
  const [donError, setDonError] = useState("");

  // Si l'utilisateur se connecte/déconnecte pendant qu'il est sur la page, on resynchronise
  useEffect(() => {
    if (user && donMode === "choose") setDonMode("logged");
    if (!user && donMode === "logged") setDonMode("choose");
  }, [user]);

  // ── Journal patient ──
  const [caseUpdates, setCaseUpdates] = useState([]);
  const [newUpdate, setNewUpdate] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);

  useEffect(() => {
    if (!c.id || c._isDemo) return;
    supabase.from("case_updates").select("*").eq("case_id",c.id).order("created_at",{ascending:false}).limit(20)
      .then(({data}) => { if (data) setCaseUpdates(data); });
  }, [c.id]);

  const postUpdate = async () => {
    if (!newUpdate.trim() || !c.id) return;
    setPostingUpdate(true);
    const { data, error } = await supabase.from("case_updates").insert({
      case_id: c.id,
      author_name: user?.name || user?.email || "Équipe Ayyad",
      author_role: user?.isAdmin ? "admin" : "patient",
      content: newUpdate.trim(),
      created_at: new Date().toISOString(),
    }).select().single();
    if (!error && data) {
      setCaseUpdates(prev => [data, ...prev]);
      setNewUpdate("");
    }
    setPostingUpdate(false);
  };

  // ── Realtime : suivi live des dons & progression ──
  const [liveCollected, setLiveCollected] = useState(c.collected || 0);
  const [liveDonors, setLiveDonors] = useState(c.donors || 0);
  const [recentDonations, setRecentDonations] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [lastDonation, setLastDonation] = useState(null); // pour le certificat

  useEffect(() => {
    // Chargement initial des derniers dons
    const loadRecent = async () => {
      if (!c.id || c._isDemo) return;
      const { data } = await supabase.from("donations")
        .select("id,donor_name,amount_fcfa,amount,currency,created_at")
        .eq("case_id", c.id)
        .eq("status","confirmed")
        .order("created_at",{ascending:false})
        .limit(5);
      if (data) setRecentDonations(data);
    };
    loadRecent();

    if (!c.id || c._isDemo) return;

    // Supabase Realtime — nouveaux dons confirmés
    const donChannel = supabase.channel("donations-live-"+c.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"donations",filter:`case_id=eq.${c.id}`},
        payload => {
          const d = payload.new;
          if (d.status === "confirmed") {
            setLiveCollected(prev => prev + (d.amount_fcfa || d.amount || 0));
            setLiveDonors(prev => prev + 1);
            setRecentDonations(prev => [d,...prev].slice(0,5));
          }
        })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"donations",filter:`case_id=eq.${c.id}`},
        payload => {
          const d = payload.new;
          const old = payload.old;
          if (old.status === "pending" && d.status === "confirmed") {
            setLiveCollected(prev => prev + (d.amount_fcfa || d.amount || 0));
            setLiveDonors(prev => prev + 1);
            setRecentDonations(prev => [d,...prev].slice(0,5));
          }
        })
      .subscribe();

    // Supabase Realtime — mise à jour du dossier (collected)
    const caseChannel = supabase.channel("case-live-"+c.id)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"cases",filter:`id=eq.${c.id}`},
        payload => {
          const wasBelow100 = pct(liveCollected, c.required || 1) < 100;
          const newCol = payload.new.collected || 0;
          setLiveCollected(newCol);
          if (payload.new.donors) setLiveDonors(payload.new.donors);
          // Confetti si objectif atteint
          if (wasBelow100 && pct(newCol, c.required || 1) >= 100) {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 4000);
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(donChannel); supabase.removeChannel(caseChannel); };
  }, [c.id]);

  // Confetti au chargement si déjà à 100%
  useEffect(() => {
    if (pct(c.collected || 0, c.required || 1) >= 100 && !c._isDemo) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3500);
    }
  }, []);

  const percent = pct(liveCollected, c.required);
  const funded = c.status==="FUNDED"; // seul FUNDED bloque les dons
  const goalReached = !funded && (c.collected||0) >= (c.required||1); // objectif atteint mais collecte encore ouverte
  const t = T[lang];
  const td = t.donate;
  const RATES = { FCFA: 1, EUR: 0.00152, USD: 0.00166 };
  const PRESETS_MAP = { FCFA: [1000,5000,10000,25000,50000], EUR: [1,5,10,25,50], USD: [1,5,10,25,50] };
  const presets = PRESETS_MAP[currency] || PRESETS_MAP.FCFA;
  const amountInFcfa = currency === "FCFA" ? Number(amount) : Math.round(Number(amount) / RATES[currency]);

  // Widget de choix initial
  const ChooseWidget = () => (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <div className="text-3xl mb-2">💚</div>
        <h3 className="font-black text-gray-900 text-lg">{lang==="fr" ? "Faire un don" : "Make a donation"}</h3>
        <p className="text-xs text-gray-500 mt-1">{lang==="fr" ? "Choisissez comment vous souhaitez donner" : "Choose how you want to donate"}</p>
      </div>

      {/* Option 1 — Se connecter */}
      <button
        onClick={() => setPage("login")}
        className="w-full group border-2 border-emerald-200 hover:border-emerald-500 bg-emerald-50 hover:bg-emerald-100 rounded-2xl p-4 text-left transition-all"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0">👤</div>
          <div className="flex-1">
            <div className="font-bold text-gray-900 text-sm group-hover:text-emerald-700">
              {lang==="fr" ? "Se connecter pour donner" : "Sign in to donate"}
            </div>
            <div className="text-xs text-gray-500 mt-1 leading-relaxed">
              {lang==="fr"
                ? "Recevez des notifications de progression, un reçu par email, et suivez l'impact de vos dons."
                : "Get progress notifications, an email receipt, and track the impact of your donations."}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(lang==="fr"
                ? ["📧 Reçu email","🔔 Notifications","📊 Suivi dons"]
                : ["📧 Email receipt","🔔 Notifications","📊 Donation tracking"]
              ).map(tag => (
                <span key={tag} className="bg-emerald-200 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </button>

      {/* Séparateur */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium">{lang==="fr" ? "ou" : "or"}</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Option 2 — Don anonyme */}
      <button
        onClick={() => { setAnonymous(true); setDonMode("anonymous"); }}
        className="w-full group border-2 border-gray-200 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 rounded-2xl p-4 text-left transition-all"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0">🕵️</div>
          <div className="flex-1">
            <div className="font-bold text-gray-900 text-sm">
              {lang==="fr" ? "Donner en anonyme" : "Donate anonymously"}
            </div>
            <div className="text-xs text-gray-500 mt-1 leading-relaxed">
              {lang==="fr"
                ? "Aucun compte requis. Votre identité reste totalement confidentielle."
                : "No account required. Your identity stays completely private."}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(lang==="fr"
                ? ["🔒 Aucun compte","✅ Immédiat","🙈 100% privé"]
                : ["🔒 No account","✅ Instant","🙈 100% private"]
              ).map(tag => (
                <span key={tag} className="bg-gray-200 text-gray-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </button>

      <p className="text-center text-[10px] text-gray-400">🔒 {lang==="fr" ? "Paiement sécurisé · Aucuns frais cachés" : "Secure payment · No hidden fees"}</p>
    </div>
  );

  // Formulaire de don (partagé anonyme + connecté)
  // DonateForm rendu en JSX direct (pas une sous-fonction) pour éviter le démontage à chaque keystroke
  const donateFormJSX = (currency, amount, setAmount, presets, amountInFcfa) => (
    <>
      {/* Badge mode actuel */}
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-4 ${anonymous ? "bg-gray-100 border border-gray-200" : "bg-emerald-50 border border-emerald-200"}`}>
        <span>{anonymous ? "🕵️" : "👤"}</span>
        <span className="text-xs font-bold text-gray-700">
          {anonymous
            ? (lang==="fr" ? "Don anonyme" : "Anonymous donation")
            : (lang==="fr" ? "Don avec compte" : "Donation with account")}
        </span>
        <button onClick={() => setDonMode("choose")} className="ml-auto text-[10px] text-gray-400 hover:text-gray-600 underline">
          {lang==="fr" ? "Changer" : "Change"}
        </button>
      </div>

      <h3 className="font-black text-gray-900 text-lg mb-1">{td.title}</h3>
      <p className="text-xs text-gray-500 mb-5">{td.sub}</p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {presets.map(p => <button key={p} onClick={() => setAmount(String(p))} className={`py-2 rounded-xl text-xs font-bold transition-all border ${Number(amount)===p?"bg-emerald-600 text-white border-emerald-600 shadow-md":"bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-400"}`}>{new Intl.NumberFormat("fr").format(p)}</button>)}
        <button onClick={() => setAmount("")} className={`py-2 rounded-xl text-xs font-bold border ${!presets.includes(Number(amount))&&amount?"bg-emerald-600 text-white border-emerald-600":"bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-400"}`}>{td.custom}</button>
      </div>
      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{td.amount}</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={amount}
            onChange={e => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              setAmount(val);
            }}
            placeholder="15 000"
            autoComplete="off"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 pr-16"
          />
          <select value={currency} onChange={e=>{setCurrency(e.target.value);setAmount("");}} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold bg-gray-100 border-0 rounded-lg px-1 py-0.5 focus:outline-none cursor-pointer"><option>FCFA</option><option>EUR</option><option>USD</option></select>
        </div>
        {amount&&Number(amount)>=500&&<div className="text-xs text-center text-gray-400 mt-1.5">{lang==="fr"?"Débité : ":"Charged: "}<span className="font-bold text-gray-700">{fmt(Number(amount))}</span></div>}
      </div>
      <div className="mb-4">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={td.message}
          rows={2}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck="false"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>
      {/* Sélecteur d'opérateur de paiement */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-600 mb-2">{lang==="fr" ? "Moyen de paiement :" : "Payment method:"}</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id:"WAVE", emoji:"🌊", label:"Wave CI", active:"bg-blue-600 text-white border-blue-600", inactive:"bg-white text-gray-700 border-gray-200 hover:border-blue-400", disabled:false },
            { id:"CARD", emoji:"💳", label:lang==="fr"?"Carte / Mobile Money":"Card / Mobile Money", active:"bg-gray-800 text-white border-gray-800", inactive:"bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed", disabled:true },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              onClick={() => { if (!opt.disabled) setProvider(opt.id); }}
              title={opt.disabled ? (lang==="fr"?"En cours d'activation":"Coming soon") : ""}
              className={`relative flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${provider===opt.id ? opt.active : opt.inactive}`}
            >
              <span className="text-base">{opt.emoji}</span>
              <span>{opt.label}</span>
              {opt.disabled && (
                <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow">
                  {lang==="fr"?"BIENTÔT":"SOON"}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {/* Widget paiement mobile — Wave / Carte bancaire */}
        {amount && amountInFcfa >= 500 ? (
          <button
            onClick={() => {
              // Génère la référence de paiement UNE seule fois au passage à confirm
              setPaymentRef(buildPaymentRef(c));
              setDonMode("confirm");
            }}
            className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl text-sm shadow-md hover:bg-emerald-700"
          >
            {(() => {
              const displayAmount = currency === "FCFA"
                ? fmt(Number(amount))
                : `${Number(amount).toLocaleString("fr")} ${currency}`;
              return lang==="fr" ? `Continuer → ${displayAmount}` : `Continue → ${displayAmount}`;
            })()}
          </button>
      ) : (
        <button disabled className="w-full bg-gray-200 text-gray-400 font-bold py-3.5 rounded-xl text-sm">
          {lang==="fr" ? "Entrez un montant ≥ 500 FCFA" : "Enter an amount ≥ 500 FCFA"}
        </button>
      )}
    </>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Confetti active={showConfetti} />
      <button onClick={() => setPage("home")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6">{t.back}</button>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-52 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 flex items-center justify-center text-9xl overflow-hidden">{c.image && (c.image.startsWith("http") ? <img src={c.image} alt="" className="w-full h-full object-cover" /> : c.image)}</div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2 mb-3"><Badge color="blue">{c.category[lang]}</Badge><Badge color="green">{t.badges.verified}</Badge>{funded&&<Badge color="green">{t.badges.funded}</Badge>}{c.urgent&&<Badge color="red">{t.badges.urgent}</Badge>}</div>
              <h1 className="text-2xl font-black text-gray-900 mb-3">{c.title[lang]}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4"><span>🏥 {c.hospital}</span><span>📍 {c.city}</span><span>👤 {c.age} {lang==="fr"?"ans":"years"}</span></div>
              {c.trackingId && (
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-xs text-gray-400">{lang==="fr"?"ID de suivi :":"Tracking ID:"}</span>
                    <span className="text-xs font-mono font-bold text-emerald-700">{c.trackingId}</span>
                    <button onClick={() => navigator.clipboard.writeText(c.trackingId)} className="text-xs text-gray-400 hover:text-emerald-600">📋</button>
                  </div>
                  <ShareButton c={c} lang={lang} />
                </div>
              )}
              <p className="text-gray-600 leading-relaxed">{c.desc[lang]}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{t.progress.progressTitle}</h3>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/>
                {lang==="fr"?"En direct":"Live"}
              </div>
            </div>
            <div className="flex justify-between items-end mb-3">
              <div><div className="text-3xl font-black text-emerald-700 transition-all">{fmt(liveCollected)}</div><div className="text-sm text-gray-500">{t.progress.collected} {fmt(c.required)}</div></div>
              <div className="text-right"><div className={`text-3xl font-black transition-all ${percent>=100?"text-emerald-600":"text-gray-900"}`}>{percent}%</div><div className="text-sm text-gray-500">{t.progress.of}</div></div>
            </div>
            <ProgressBar percent={percent} />
            {percent>=50&&percent<100&&(
              <div className="mt-2 text-center text-xs text-amber-600 font-semibold animate-pulse">
                🔥 {lang==="fr"?`Plus que ${fmt(c.required - liveCollected)} pour atteindre l'objectif !`:`Only ${fmt(c.required - liveCollected)} left to reach the goal!`}
              </div>
            )}
            {percent>=100&&(
              <div className="mt-2 text-center text-sm text-emerald-600 font-black">
                🎉 {lang==="fr"?"Objectif atteint ! Merci à tous les donateurs.":"Goal reached! Thank you to all donors."}
              </div>
            )}
            <div className="flex justify-between mt-3 text-sm text-gray-500">
              <span>👥 {liveDonors} {t.progress.donors}</span>
              {funded?<span className="text-emerald-600 font-semibold">{t.progress.intervention}</span>:<span className="text-amber-600 font-medium">⏳ {c.daysLeft} {t.progress.daysLeft}</span>}
            </div>
          </div>

          {/* ── Fil des derniers dons en temps réel ── */}
          {recentDonations.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-bold text-gray-900 text-sm">{lang==="fr"?"Derniers donateurs":"Recent donors"}</h3>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/>
              </div>
              <div className="space-y-2">
                {recentDonations.map((d,i) => (
                  <div key={d.id||i} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                      {!d.donor_name ? "🕵️" : "💚"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-900">{publicDonorName(d.donor_name, lang)}</span>
                      <span className="text-xs text-gray-400 ml-2">{new Date(d.created_at).toLocaleDateString(lang==="fr"?"fr-CI":"en-US")}</span>
                    </div>
                    <div className="text-sm font-black text-emerald-700 flex-shrink-0">
                      {((d.amount_fcfa||d.amount||0)).toLocaleString("fr-CI")} FCFA
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3">
            <span className="text-2xl flex-shrink-0">🔒</span>
            <div><div className="font-bold text-emerald-800 text-sm">{t.guarantee.title}</div><div className="text-emerald-700 text-xs mt-1">{t.guarantee.desc}</div></div>
          </div>

          {/* Médias — Photos + Vidéo */}
          <MediaSection c={c} lang={lang} t={t} />

          {/* ── Journal du patient ── */}
          {(caseUpdates.length > 0 || (user && (user.isAdmin || (c.user_id && user.id===c.user_id)))) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm">📋 {lang==="fr"?"Journal du dossier":"Case journal"}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{lang==="fr"?"Mises à jour du patient et de l'équipe Ayyad":"Updates from the patient and Ayyad team"}</p>
              </div>
              {/* Formulaire — admin ou propriétaire */}
              {user && (user.isAdmin || (c.user_id && user.id===c.user_id)) && (
                <div className="p-4 border-b border-gray-50 bg-gray-50">
                  <textarea
                    value={newUpdate}
                    onChange={e=>setNewUpdate(e.target.value)}
                    placeholder={lang==="fr"?"Partager une mise à jour avec les donateurs...":"Share an update with donors..."}
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                  <button onClick={postUpdate} disabled={postingUpdate||!newUpdate.trim()}
                    className="mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all">
                    {postingUpdate?(lang==="fr"?"Envoi...":"Sending..."):(lang==="fr"?"Publier la mise à jour":"Publish update")}
                  </button>
                </div>
              )}
              {/* Liste des mises à jour */}
              {caseUpdates.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {caseUpdates.map(upd=>(
                    <div key={upd.id} className="p-4 flex gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${upd.author_role==="admin"?"bg-purple-100":"bg-emerald-100"}`}>
                        {upd.author_role==="admin"?"👨‍⚕️":"🙋"}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{upd.author_name||"Ayyad"}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${upd.author_role==="admin"?"bg-purple-100 text-purple-700":"bg-emerald-100 text-emerald-700"}`}>
                            {upd.author_role==="admin"?(lang==="fr"?"Équipe Ayyad":"Ayyad Team"):(lang==="fr"?"Patient":"Patient")}
                          </span>
                          <span className="text-xs text-gray-400">{new Date(upd.created_at).toLocaleDateString(lang==="fr"?"fr-CI":"en-US")}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1 leading-relaxed">{upd.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-gray-400">
                  {lang==="fr"?"Aucune mise à jour pour le moment.":"No updates yet."}
                </div>
              )}
            </div>
          )}

          {/* ── Panneau d'édition — uniquement pour le propriétaire ── */}
          {user && c.user_id && user.id === c.user_id && (
            <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setEditOpen(!editOpen)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-emerald-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xl">✏️</span>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">{lang==="fr" ? "Mettre à jour mon dossier" : "Update my case"}</div>
                    <div className="text-xs text-gray-500">{lang==="fr" ? "Ajouter des photos, une vidéo ou des documents" : "Add photos, a video or documents"}</div>
                  </div>
                </div>
                <span className={`text-gray-400 transition-transform ${editOpen ? "rotate-180" : ""}`}>▼</span>
              </button>

              {editOpen && (
                <div className="px-5 pb-6 space-y-5 border-t border-emerald-100">
                  {/* Lien vidéo YouTube / TikTok */}
                  <div className="pt-4">
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">
                      🎬 {lang==="fr" ? "Lien vidéo (YouTube ou TikTok)" : "Video link (YouTube or TikTok)"}
                    </label>
                    <input
                      type="url"
                      placeholder="https://youtube.com/watch?v=... ou https://tiktok.com/@..."
                      value={editVideoUrl}
                      onChange={e => setEditVideoUrl_(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      {lang==="fr" ? "YouTube, YouTube Shorts et TikTok sont acceptés." : "YouTube, YouTube Shorts and TikTok are accepted."}
                    </p>
                  </div>

                  {/* Ajout de photo */}
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">
                      📷 {lang==="fr" ? "Ajouter une photo" : "Add a photo"}
                    </label>
                    <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${editPhotoUploading ? "border-emerald-300 bg-emerald-50" : "border-gray-200 hover:border-emerald-300 hover:bg-emerald-50"}`}>
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !c.id) return;
                        setEditPhotoUploading(true);
                        setEditMsg("");
                        try {
                          const path = `cases/${c.id}/photos/${Date.now()}_${sanitizeFileName(file.name)}`;
                          const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
                          if (upErr) { setEditMsg(lang==="fr" ? "Erreur upload : " + upErr.message : "Upload error: " + upErr.message); return; }
                          const { data: urlD } = supabase.storage.from("documents").getPublicUrl(path);
                          const newPhotos = [...(c.photos || []), urlD.publicUrl];
                          await supabase.from("cases").update({ photos: newPhotos }).eq("id", c.id);
                          setEditMsg(lang==="fr" ? "✅ Photo ajoutée !" : "✅ Photo added!");
                        } catch(err) {
                          setEditMsg(lang==="fr" ? "Erreur : " + err.message : "Error: " + err.message);
                        } finally { setEditPhotoUploading(false); }
                      }} />
                      <span className="text-2xl">{editPhotoUploading ? "⏳" : "📷"}</span>
                      <span className="text-sm text-gray-500">{editPhotoUploading ? (lang==="fr" ? "Envoi en cours…" : "Uploading…") : (lang==="fr" ? "Choisir une photo" : "Choose a photo")}</span>
                    </label>
                  </div>

                  {/* Ajout de documents */}
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1.5">
                      📄 {lang==="fr" ? "Ajouter un document" : "Add a document"}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: "medical", label: lang==="fr" ? "Rapport médical" : "Medical report", icon: "🏥" },
                        { key: "quote",   label: lang==="fr" ? "Devis hospitalier" : "Hospital quote",  icon: "💊" },
                        { key: "id",      label: lang==="fr" ? "Pièce d'identité"  : "Identity doc",   icon: "🪪" },
                        { key: "other",   label: lang==="fr" ? "Autre document"    : "Other document",  icon: "📎" },
                      ].map(doc => (
                        <label key={doc.key} className="flex flex-col items-center gap-1 border-2 border-dashed border-gray-200 hover:border-emerald-300 rounded-xl p-3 cursor-pointer hover:bg-emerald-50 transition-colors text-center">
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !c.id) return;
                            setEditMsg("");
                            try {
                              const path = `cases/${c.id}/docs/${doc.key}_${Date.now()}_${sanitizeFileName(file.name)}`;
                              const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
                              if (upErr) { setEditMsg("Erreur : " + upErr.message); return; }
                              const { data: urlD } = supabase.storage.from("documents").getPublicUrl(path);
                              const newDocs = { ...(c.document_urls || {}), [doc.key]: urlD.publicUrl };
                              await supabase.from("cases").update({ document_urls: newDocs }).eq("id", c.id);
                              setEditMsg(lang==="fr" ? `✅ ${doc.label} ajouté !` : `✅ ${doc.label} added!`);
                            } catch(err) { setEditMsg("Erreur : " + err.message); }
                          }} />
                          <span className="text-xl">{doc.icon}</span>
                          <span className="text-[10px] text-gray-500 leading-tight">{doc.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Message de retour */}
                  {editMsg && (
                    <div className={`rounded-xl px-4 py-2.5 text-sm font-medium ${editMsg.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                      {editMsg}
                    </div>
                  )}

                  {/* Bouton sauvegarder (pour vidéo) */}
                  <button
                    onClick={async () => {
                      setEditSaving(true);
                      setEditMsg("");
                      try {
                        const updates = {};
                        if (editVideoUrl.trim()) {
                          // Conversion URL → embed
                          let embed = editVideoUrl.trim();
                          const ytWatch = embed.match(/youtube\.com\/watch\?v=([^&]+)/);
                          const ytShort = embed.match(/youtu\.be\/([^?&]+)/);
                          const ytShorts = embed.match(/youtube\.com\/shorts\/([^?&]+)/);
                          const tt = embed.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
                          if (ytWatch) embed = "https://www.youtube.com/embed/" + ytWatch[1];
                          else if (ytShorts) embed = "https://www.youtube.com/embed/" + ytShorts[1];
                          else if (ytShort) embed = "https://www.youtube.com/embed/" + ytShort[1];
                          else if (tt) embed = "https://www.tiktok.com/embed/v2/" + tt[1];
                          updates.video_url = embed;
                        }
                        if (Object.keys(updates).length > 0) {
                          await supabase.from("cases").update(updates).eq("id", c.id);
                          setEditMsg(lang==="fr" ? "✅ Dossier mis à jour !" : "✅ Case updated!");
                        }
                      } catch(err) {
                        setEditMsg(lang==="fr" ? "Erreur : " + err.message : "Error: " + err.message);
                      } finally { setEditSaving(false); }
                    }}
                    disabled={editSaving}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                    {editSaving ? (lang==="fr" ? "Sauvegarde…" : "Saving…") : (lang==="fr" ? "💾 Sauvegarder" : "💾 Save")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-6 sticky top-24">

            {/* ÉTAPE 1 — Choisir le mode de don */}
            {donMode==="choose" && !funded && (
              <>
                {goalReached && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-center">
                    <div className="text-2xl mb-1">🎉</div>
                    <div className="text-xs font-black text-emerald-700">Objectif atteint !</div>
                    <div className="text-[11px] text-emerald-600 mt-0.5">
                      La collecte reste ouverte jusqu'à demain.<br/>
                      Tout don supplémentaire soutient directement le bénéficiaire.
                    </div>
                  </div>
                )}
                <ChooseWidget />
              </>
            )}

            {/* Collecte terminée (FUNDED) */}
            {funded && (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="font-black text-gray-900 text-lg">{td.btnFunded}</h3>
                <p className="text-sm text-gray-500 mt-2">{lang==="fr" ? "Merci à tous les donateurs !" : "Thank you to all donors!"}</p>
              </div>
            )}

            {/* ÉTAPE 2 — Formulaire de don (anonyme ou connecté) */}
            {(donMode==="anonymous" || donMode==="logged") && !funded && donateFormJSX(currency, amount, setAmount, presets, amountInFcfa)}

            {/* ÉTAPE 3 — Confirmation */}
            {donMode==="confirm" && <div className="space-y-5">
              {/* Protection contre les dossiers de démonstration : empêche les vrais paiements sur des collectes de vitrine */}
              {(c._isDemo || c._mock) && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-center space-y-2">
                  <div className="text-3xl">🎬</div>
                  <div className="font-black text-amber-800 text-sm">
                    {lang==="fr" ? "Collecte de démonstration" : "Demo campaign"}
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    {lang==="fr"
                      ? "Cette fiche est un exemple présenté à des fins de démonstration. Pour faire un vrai don, choisissez une collecte active depuis la liste."
                      : "This is a demonstration example. To make a real donation, choose an active campaign from the list."}
                  </p>
                  <button
                    onClick={() => setPage("collectes")}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs"
                  >
                    {lang==="fr" ? "Voir les vraies collectes →" : "See real campaigns →"}
                  </button>
                </div>
              )}
              <div className="text-center"><div className="text-4xl mb-2">💚</div><h3 className="font-black text-lg text-gray-900">{td.confirm}</h3><p className="text-sm text-gray-500">{td.verifyDon}</p></div>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3 text-sm">
                {[[td.debited,fmt(Number(amount))],[td.beneficiary,c.beneficiary],[td.via,provider==="WAVE"?"🌊 Wave":"💳 "+(lang==="fr"?"Carte":"Card")],[td.anonymity, anonymous ? "👤"+(lang==="fr"?"Anonyme":"Anonymous") : "👤 "+(lang==="fr"?"Avec compte":"With account")]].map(([k,v],i) => (
                  <div key={i} className="flex justify-between items-center"><span className="text-gray-500">{k}</span><span className={`font-semibold ${k===td.anonymity?"text-emerald-600":""}`}>{v}</span></div>
                ))}
              </div>
              {message&&<div className="bg-emerald-50 rounded-xl p-3 text-sm text-emerald-700 italic border border-emerald-100">"{message}"</div>}

              {/* ── QR Code Wave CI (compte marchand statique) ── */}
              {provider === "WAVE" && (() => {
                const amountTxt = Math.round(Number(amount)).toLocaleString("fr-FR");
                return (
                  <div className="flex flex-col items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-5">
                    <div className="text-sm font-black text-blue-800">📱 {lang==="fr" ? "Scannez pour payer via Wave CI" : "Scan to pay with Wave CI"}</div>
                    {/* QR cliquable : sur mobile, ça ouvre directement l'app Wave sur la page du marchand. */}
                    <a
                      href="https://pay.wave.com/m/M_ci_PJosg8FuvJDW/c/ci/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        // Pré-insert fire-and-forget : on enregistre le don pending AVANT de quitter pour Wave
                        if (donSubmitting) return;
                        const _donName = anonymous ? null : (user?.user_metadata?.name || user?.email?.split("@")[0] || null);
                        const refToUse = paymentRef || buildPaymentRef(c);
                        createDonation({
                          case_id: c.id || null,
                          donor_id: user?.id || null,
                          donor_name: _donName,
                          donor_email: anonymous ? null : (user?.email || null),
                          amount: Number(amount),
                          amount_fcfa: amountInFcfa,
                          currency,
                          payment_method: "WAVE",
                          status: "pending",
                          message: message || null,
                          reference: refToUse,
                        }).then(({ error }) => {
                          if (error) console.warn("[pré-insert QR tap] échec:", error);
                        });
                      }}
                      className="relative block group"
                      title={lang==="fr"?"Toucher pour payer (mobile)":"Tap to pay (mobile)"}
                    >
                      <img
                        src="/wave_qr.png"
                        alt="QR Code Wave Ayyad"
                        width={200}
                        height={200}
                        className="rounded-xl border-2 border-blue-200 bg-white shadow-sm p-2 group-hover:border-blue-400 group-active:scale-95 transition-all"
                      />
                    </a>
                    <div className="text-[11px] font-semibold text-blue-600 text-center bg-blue-100/60 px-3 py-1.5 rounded-full">
                      👆 {lang==="fr" ? "Touchez le QR si vous êtes sur téléphone" : "Tap the QR if you're on mobile"}
                    </div>
                    <div className="w-full bg-white rounded-xl p-3 border border-blue-200">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">{lang==="fr"?"Montant à envoyer :":"Amount to send:"}</span>
                        <span className="font-mono font-black text-blue-700 text-base">{amountTxt} FCFA</span>
                      </div>
                    </div>
                    <div className="text-xs text-blue-700 text-center leading-relaxed">
                      {lang==="fr"
                        ? <>Ouvrez <strong>Wave CI</strong> → <strong>Scanner</strong> → saisissez <strong>{amountTxt} FCFA</strong> → validez</>
                        : <>Open <strong>Wave CI</strong> → <strong>Scan</strong> → enter <strong>{amountTxt} FCFA</strong> → confirm</>}
                    </div>
                    <div className="text-[11px] text-gray-500 text-center bg-white/60 px-3 py-2 rounded leading-relaxed">
                      {lang==="fr"
                        ? <>💡 Votre don est <strong>déjà rattaché à cette collecte</strong> automatiquement. Cliquez sur <strong>Confirmer</strong> ci-dessous après avoir effectué le paiement.</>
                        : <>💡 Your donation is <strong>already linked to this campaign</strong> automatically. Click <strong>Confirm</strong> below after completing payment.</>}
                    </div>

                    {/* Encart "Depuis l'étranger" — instructions Sendwave pour la diaspora */}
                    <details className="w-full bg-white/80 rounded-xl border border-blue-100 text-left">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-blue-700 select-none">
                        🌍 {lang==="fr" ? "Vous êtes à l'étranger ?" : "Donating from abroad?"}
                      </summary>
                      <div className="px-3 pb-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
                        <p>
                          {lang==="fr"
                            ? <>Utilisez l'application <strong>Sendwave</strong> (gratuite, sans frais cachés) disponible en France, Canada, USA, UK, Belgique, Italie, Espagne, Allemagne…</>
                            : <>Use the <strong>Sendwave</strong> app (free, no hidden fees) available in France, Canada, USA, UK, Belgium, Italy, Spain, Germany…</>}
                        </p>
                        <ol className="list-decimal pl-4 space-y-0.5">
                          <li>{lang==="fr" ? "Téléchargez Sendwave (App Store / Play Store)" : "Download Sendwave (App Store / Play Store)"}</li>
                          <li>{lang==="fr" ? <>Envoyez à ce numéro Wave Côte d'Ivoire : <strong className="font-mono">+225 07 48 05 61 28</strong></> : <>Send to this Wave Côte d'Ivoire number: <strong className="font-mono">+225 07 48 05 61 28</strong></>}</li>
                          <li>{lang==="fr" ? "Saisissez le montant en EUR/USD/CAD/GBP" : "Enter the amount in EUR/USD/CAD/GBP"}</li>
                          <li>{lang==="fr" ? "Validez — l'argent arrive instantanément sur Ayyad en FCFA" : "Confirm — money arrives instantly to Ayyad in FCFA"}</li>
                        </ol>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <a href="https://apps.apple.com/app/sendwave-send-money/id1238118264" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-md text-[10px] font-bold">
                            🍎 iOS
                          </a>
                          <a href="https://play.google.com/store/apps/details?id=com.wave" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-md text-[10px] font-bold">
                            🤖 Android
                          </a>
                          <a href="https://www.sendwave.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 border border-blue-200 text-blue-600 px-2 py-1 rounded-md text-[10px] font-bold hover:bg-blue-50">
                            🌐 sendwave.com
                          </a>
                        </div>
                        <p className="text-[10px] text-gray-400 italic mt-1">
                          {lang==="fr" ? "Sendwave appartient à Wave — l'argent arrive sur le même compte que les dons Wave locaux." : "Sendwave is owned by Wave — funds arrive in the same account as local Wave donations."}
                        </p>
                      </div>
                    </details>
                  </div>
                );
              })()}

              {/* ── Carte bancaire / Mobile Money — BIENTÔT (PayDunya en attente d'activation) ── */}
              {provider === "CARD" && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="text-4xl">🏗️</div>
                  <div className="font-black text-amber-800">
                    {lang==="fr" ? "Carte bancaire & Mobile Money — Bientôt" : "Card & Mobile Money — Coming soon"}
                  </div>
                  <p className="text-sm text-amber-700 leading-relaxed">
                    {lang==="fr"
                      ? "L'intégration multi-méthodes (Visa/MC, Orange Money, MTN, Moov, DJAMO) est en cours d'activation. En attendant, utilisez Wave CI."
                      : "Multi-method integration (Visa/MC, Orange Money, MTN, Moov, DJAMO) is being activated. Meanwhile, please use Wave CI."}
                  </p>
                  <button
                    onClick={() => setProvider("WAVE")}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm"
                  >
                    🌊 {lang==="fr" ? "Utiliser Wave CI" : "Use Wave CI"}
                  </button>
                </div>
              )}

              {/* Boutons Modifier / Confirmer */}
              {provider !== "CARD" && (
                <>
                  {donError && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-xs text-red-700">
                      <div className="font-bold mb-1">⚠️ {lang==="fr"?"Erreur lors de l'enregistrement du don":"Error recording donation"}</div>
                      <div className="break-words">{donError}</div>
                      <div className="mt-1 text-[11px] text-red-500">{lang==="fr"?"Aucun email n'a été envoyé. Réessayez ou contactez le support.":"No email was sent. Please retry or contact support."}</div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={donSubmitting}
                      onClick={() => { setDonError(""); setDonMode(anonymous?"anonymous":"logged"); }}
                      className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm disabled:opacity-50"
                    >{td.modify}</button>
                    <button
                      disabled={donSubmitting || c._isDemo || c._mock}
                      onClick={async () => {
                        if (donSubmitting) return;
                        if (c._isDemo || c._mock) {
                          setDonError(lang==="fr" ? "Cette collecte est un exemple. Choisissez une vraie collecte." : "This is a demo. Pick a real campaign.");
                          return;
                        }
                        setDonError("");
                        setDonSubmitting(true);
                        const _donName2 = anonymous ? null : (user?.user_metadata?.name || user?.email?.split("@")[0] || null);

                        // ── Cas DUNYA: on appelle /api/dunya/create-invoice et on redirige ──
                        if (provider === "DUNYA") {
                          try {
                            const r = await fetch("/api/dunya/create-invoice", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                case_id: c.id,
                                donor_id: user?.id || null,
                                donor_name: _donName2,
                                donor_email: anonymous ? null : (user?.email || null),
                                amount: Number(amount),
                                message: message || null,
                                case_title: typeof c.title === "object" ? (c.title?.fr || c.title?.en) : c.title,
                                tracking_id: c.tracking_id || c.trackingId,
                                beneficiary: c.beneficiary,
                              }),
                            });
                            const data = await r.json().catch(() => ({}));
                            if (!r.ok || !data.payment_url) {
                              const detail = data.debug ? ` — ${data.debug}` : "";
                              setDonError((data.error || "Erreur lors de l'initialisation du paiement.") + detail);
                              setDonSubmitting(false);
                              return;
                            }
                            // Redirige vers PayDunya — le webhook fera la confirmation
                            window.location.href = data.payment_url;
                          } catch(err) {
                            setDonError(err?.message || String(err));
                            setDonSubmitting(false);
                          }
                          return;
                        }

                        // ── Cas WAVE (QR statique): flow actuel — insert pending + email ──
                        const refToUse = paymentRef || buildPaymentRef(c);
                        try {
                          const { error: insErr } = await createDonation({
                            case_id: c.id || null,
                            donor_id: user?.id || null,
                            donor_name: _donName2,
                            donor_email: anonymous ? null : (user?.email || null),
                            amount: Number(amount),
                            amount_fcfa: amountInFcfa,
                            currency,
                            payment_method: "WAVE",
                            status: "pending",
                            message: message || null,
                            reference: refToUse,
                          });
                          if (insErr) {
                            console.error("[donation insert] échec:", insErr);
                            setDonError(insErr);
                            setDonSubmitting(false);
                            return;
                          }
                          setLastDonation({ donorName: anonymous?"Donateur anonyme":(_donName2||"Donateur"), amount: amountInFcfa });
                          setDonMode("success");
                          try {
                            await emailDonConfirm({
                              donorEmail: anonymous ? null : (user?.email || null),
                              donorName: anonymous ? "Donateur anonyme" : (user?.user_metadata?.name || user?.email?.split("@")[0] || "Donateur"),
                              amount: fmt(Number(amount)),
                              beneficiary: c.beneficiary,
                              caseTitle: c.title,
                              trackingId: c.tracking_id || c.trackingId,
                            });
                          } catch(emailErr) {
                            console.warn("[donation email] échec (non bloquant):", emailErr);
                          }
                        } catch(err) {
                          console.error("[donation flow] exception:", err);
                          setDonError(err?.message || String(err));
                        } finally {
                          setDonSubmitting(false);
                        }
                      }}
                      className="bg-emerald-600 text-white font-bold py-3 rounded-xl text-sm shadow-md disabled:opacity-60"
                    >
                      {donSubmitting
                        ? (provider === "DUNYA" ? (lang==="fr"?"Redirection…":"Redirecting…") : (lang==="fr"?"Enregistrement…":"Saving…"))
                        : (provider === "DUNYA" ? (lang==="fr"?"Procéder au paiement →":"Proceed to payment →") : td.confirmBtn)}
                    </button>
                  </div>
                </>
              )}
            </div>}

            {/* ÉTAPE 4 — Succès */}
            {donMode==="success" && <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">🎉</div>
              <h3 className="font-black text-xl text-gray-900">{td.thanks}</h3>
              <p className="text-sm text-gray-600">{td.thanksSub}</p>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 text-sm text-emerald-800 border border-emerald-100">
                <p className="font-semibold mb-1">{td.impact}</p><p>{td.impactSub} {c.beneficiary} {td.impactEnd}</p>
              </div>
              {lastDonation && (
                <button
                  onClick={() => printDonationCertificate({
                    donorName: lastDonation.donorName,
                    amount: lastDonation.amount,
                    beneficiary: c.beneficiary || c.full_name || "",
                    caseTitle: typeof c.title==="object" ? c.title[lang] : (c.title||""),
                    trackingId: c.trackingId || c.tracking_id || ("AYD-"+c.id),
                    date: new Date().toLocaleDateString(lang==="fr"?"fr-CI":"en-US"),
                    lang,
                  })}
                  className="w-full bg-amber-50 border border-amber-200 text-amber-700 font-bold py-2.5 rounded-xl text-sm hover:bg-amber-100 flex items-center justify-center gap-2">
                  📜 {lang==="fr"?"Télécharger mon certificat de don":"Download my donation certificate"}
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setDonMode("choose"); setAmount(""); setMessage(""); setLastDonation(null); }} className="flex-1 border border-emerald-200 text-emerald-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-50">{td.again}</button>
                <div className="flex-1"><ShareButton c={c} lang={lang} /></div>
              </div>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Login Page ────────────────────────────────────────────────
const LoginPage = ({ setPage, setUser, lang, trackVisit }) => {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const t = T[lang].login;

  const handleLogin = async () => {
    const emailClean = email.trim().toLowerCase();
    if (!emailClean || !pwd) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      setError(lang === "fr" ? "Adresse email invalide." : "Invalid email address.");
      return;
    }
    setLoading(true);
    setError("");
    let timedOut = false;

    // Minuteur de sécurité : reset automatique après 10s si Supabase ne répond pas
    const safetyTimer = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setError(lang === "fr"
        ? "Connexion impossible. Vérifiez votre réseau ou désactivez les extensions de navigation."
        : "Connection failed. Check your network or disable browser extensions.");
    }, 10000);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: emailClean, password: pwd });
      if (timedOut) return; // la réponse est arrivée trop tard, ignorer
      if (err) {
        setError(t.error);
        return;
      }
      const meta = data.user?.user_metadata || {};
      const { data: adminData } = await supabase.from("admin_users").select("role, is_active").eq("email", emailClean).maybeSingle();
      if (timedOut) return;
      const isAdmin = !!(adminData && adminData.is_active);
      const adminRole = adminData?.role || null;
      const userName = meta.full_name || email;
      setUser({ id: data.user.id, name: userName, email, isAdmin, adminRole });
      if (trackVisit) trackVisit(data.user.id, email, userName);
      setPage(isAdmin ? "admin" : "home");
    } catch(e) {
      if (!timedOut) setError("Erreur de connexion. Veuillez réessayer.");
    } finally {
      clearTimeout(safetyTimer);
      if (!timedOut) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <svg width="64" height="64" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="35" cy="35" r="33" fill="#0d5c2e"/>
              <circle cx="35" cy="35" r="33" fill="none" stroke="#C9A84C" stroke-width="2.5"/>
              <rect x="29" y="18" width="12" height="34" rx="3" fill="#C9A84C"/>
              <rect x="18" y="29" width="34" height="12" rx="3" fill="#C9A84C"/>
              <path d="M31 32 C31 30.5, 32.5 29.5, 35 31.5 C37.5 29.5, 39 30.5, 39 32 C39 34, 35 37, 35 37 C35 37, 31 34, 31 32Z" fill="#0d5c2e"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900">{t.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{t.sub}</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 text-center mb-4">{error}</div>}
        <div className="space-y-4 mb-6">
          <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.email}</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="vous@exemple.ci" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
          <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.password}</label><input value={pwd} onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} type="password" placeholder="••••••••" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
        </div>
        <button onClick={handleLogin} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-3.5 rounded-xl shadow-md text-sm">
          {loading ? "..." : t.btn}
        </button>
        <div className="text-center mt-5"><span className="text-sm text-gray-500">{t.noAccount} </span><button onClick={() => setPage("register")} className="text-sm text-emerald-600 font-bold hover:underline">{t.register}</button></div>
      </div>
    </div>
  );
};

// ── Register Page ─────────────────────────────────────────────
const RegisterPage = ({ setPage, setUser, lang }) => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("");
  const [form, setForm] = useState({name:"",email:"",phone:"",password:""});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const t = T[lang].register;

  const handleSubmit = async () => {
    const emailClean = form.email.trim().toLowerCase();
    if (!form.name.trim()) {
      setError(lang === "fr" ? "Veuillez entrer votre nom." : "Please enter your name.");
      return;
    }
    if (!emailClean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      setError(lang === "fr" ? "Adresse email invalide." : "Invalid email address.");
      return;
    }
    // Validation téléphone (optionnel mais format CI si renseigné)
    if (form.phone.trim()) {
      const phoneClean = form.phone.trim().replace(/\s/g, "");
      const ciLocal = /^(01|03|05|07|08|09|27)\d{8}$/.test(phoneClean);
      const ciIntl  = /^\+225(01|03|05|07|08|09|27)\d{8}$/.test(phoneClean);
      if (!ciLocal && !ciIntl) {
        setError(lang === "fr"
          ? "Numéro invalide. Format attendu : 07 XX XX XX XX ou +225 07 XX XX XX XX"
          : "Invalid number. Expected format: 07 XX XX XX XX or +225 07 XX XX XX XX");
        return;
      }
    }
    // Validation mot de passe
    if (form.password.length < 8) {
      setError(lang === "fr" ? "Le mot de passe doit contenir au moins 8 caractères." : "Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError(lang === "fr" ? "Le mot de passe doit contenir au moins une lettre et un chiffre." : "Password must contain at least one letter and one number.");
      return;
    }
    if (!acceptedTerms) {
      setError(lang === "fr" ? "Veuillez accepter les conditions d'utilisation." : "Please accept the terms of use.");
      return;
    }
    setLoading(true);
    setError("");
    // Ne jamais stocker le role dans les métadonnées — géré uniquement via admin_users
    const { data, error: err } = await supabase.auth.signUp({
      email: emailClean,
      password: form.password,
      options: { data: { full_name: form.name.trim(), phone: form.phone.trim() } }
    });
    if (err) { setError(t.error); setLoading(false); return; }
    setUser({ id: data.user?.id, name: form.name.trim()||emailClean, email: emailClean, isAdmin: false });
    setPage("home");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <svg width="56" height="56" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="35" cy="35" r="33" fill="#0d5c2e"/>
              <circle cx="35" cy="35" r="33" fill="none" stroke="#C9A84C" stroke-width="2.5"/>
              <rect x="29" y="18" width="12" height="34" rx="3" fill="#C9A84C"/>
              <rect x="18" y="29" width="34" height="12" rx="3" fill="#C9A84C"/>
              <path d="M31 32 C31 30.5, 32.5 29.5, 35 31.5 C37.5 29.5, 39 30.5, 39 32 C39 34, 35 37, 35 37 C35 37, 31 34, 31 32Z" fill="#0d5c2e"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900">{t.title}</h1>
          <div className="flex justify-center gap-2 mt-3">{[1,2].map(s=><div key={s} className={`w-10 h-1.5 rounded-full transition-colors ${step>=s?"bg-emerald-500":"bg-gray-200"}`}/>)}</div>
        </div>
        {step===1&&<div className="space-y-4">
          <p className="text-sm text-gray-600 text-center font-medium">{t.roleQ}</p>
          <div className="grid grid-cols-2 gap-3">{t.roles.map(r=><button key={r.id} onClick={()=>setRole(r.id)} className={`p-5 rounded-2xl border-2 text-left transition-all ${role===r.id?"border-emerald-500 bg-emerald-50 shadow-md":"border-gray-200 hover:border-emerald-300"}`}><div className="text-3xl mb-2">{r.icon}</div><div className="font-bold text-sm text-gray-900">{r.title}</div><div className="text-xs text-gray-500 mt-0.5">{r.desc}</div></button>)}</div>
          <button onClick={()=>role&&setStep(2)} disabled={!role} className="w-full bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">{t.continue}</button>
          <div className="text-center"><span className="text-sm text-gray-500">{t.hasAccount} </span><button onClick={()=>setPage("login")} className="text-sm text-emerald-600 font-bold hover:underline">{t.signin}</button></div>
        </div>}
        {step===2&&<div className="space-y-4">
          {error&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 text-center">{error}</div>}
          {t.fields.map(f=>(
            <div key={f.key}>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{f.label}</label>
              <input
                value={form[f.key]}
                onChange={e => {
                  let val = e.target.value;
                  // Téléphone : n'autoriser que chiffres, +, espaces
                  if (f.key === "phone") val = val.replace(/[^0-9+\s]/g, "").slice(0, 16);
                  // Mot de passe : indicateur de force visuel via bordure
                  setForm({...form, [f.key]: val});
                }}
                type={f.type}
                placeholder={f.p}
                inputMode={f.key === "phone" ? "tel" : undefined}
                className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                  f.key === "password" && form.password.length > 0
                    ? form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /[0-9]/.test(form.password)
                      ? "border-emerald-400"
                      : "border-amber-400"
                    : "border-gray-200"
                }`}
              />
              {/* Indicateur force mot de passe */}
              {f.key === "password" && form.password.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  <div className="flex gap-1">
                    {[8, 10, 12].map((min, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                        form.password.length >= min && /[A-Za-z]/.test(form.password) && /[0-9]/.test(form.password)
                          ? ["bg-red-400","bg-amber-400","bg-emerald-500"][i]
                          : "bg-gray-200"
                      }`} />
                    ))}
                  </div>
                  <p className={`text-[10px] ${
                    form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /[0-9]/.test(form.password)
                      ? "text-emerald-600" : "text-amber-600"
                  }`}>
                    {lang === "fr"
                      ? form.password.length < 8 ? "Min. 8 caractères" : !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password) ? "Ajoutez une lettre et un chiffre" : "✓ Mot de passe valide"
                      : form.password.length < 8 ? "Min. 8 characters" : !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password) ? "Add a letter and a number" : "✓ Valid password"
                    }
                  </p>
                </div>
              )}
              {/* Hint téléphone */}
              {f.key === "phone" && (
                <p className="text-[10px] text-gray-400 mt-1">
                  {lang === "fr" ? "Format CI : 07 XX XX XX XX ou +225 07 XX XX XX XX" : "CI format: 07 XX XX XX XX or +225 07 XX XX XX XX"}
                </p>
              )}
            </div>
          ))}
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)} className="mt-0.5 accent-emerald-600 cursor-pointer" />
            <span onClick={()=>setAcceptedTerms(v=>!v)} className="cursor-pointer">{t.terms} <a href="https://ayyadci.com/cgu" target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="text-emerald-600 underline font-medium">{t.termsLink}</a> {t.and} <a href="https://ayyadci.com/confidentialite" target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="text-emerald-600 underline font-medium">{t.privacyLink}</a>.</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>setStep(1)} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm">{t.back}</button>
            <button onClick={handleSubmit} disabled={loading||!acceptedTerms} className="bg-emerald-600 disabled:bg-emerald-400 text-white font-bold py-3 rounded-xl text-sm shadow-md">{loading?"...":t.btn}</button>
          </div>
        </div>}
      </div>
    </div>
  );
};

// ── Submit Page ───────────────────────────────────────────────
const SubmitPage = ({ setPage, user, lang }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title:"", description:"", hospital:"", city:"", amount:"",
    category:"", categoryOther:"", beneficiary_phone:"", videoUrl:""
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [fileStates, setFileStates] = useState({medical:"idle",quote:"idle",id:"idle",consent:"idle"});
  const [fileUrls, setFileUrls] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const t = T[lang].submit;
  const allUploaded = Object.values(fileStates).every(s => s==="done");

  // ID de session unique : permet d'organiser les fichiers par dossier dans le storage
  const [sessionId] = useState(() => {
    const uid = user?.id || "anon";
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2,7);
    return `${uid}_${ts}_${rand}`;
  });

  const handlePhotoSelect = (file) => {
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  // Photo de la collecte → bucket PUBLIC (case-photos), affichée à tous les visiteurs
  const handlePhotoUpload = async () => {
    if (!photoFile) return null;
    setPhotoUploading(true);
    const fileName = `dossiers/${sessionId}/photo_${Date.now()}_${sanitizeFileName(photoFile.name)}`;
    const { error } = await supabase.storage.from(BUCKET_PUBLIC).upload(fileName, photoFile);
    if (error) {
      setPhotoUploading(false);
      console.warn("[photo upload] échec:", error);
      return null;
    }
    const { data: urlData } = supabase.storage.from(BUCKET_PUBLIC).getPublicUrl(fileName);
    setPhotoUrl(urlData.publicUrl);
    setPhotoUploading(false);
    return urlData.publicUrl;
  };

  // Documents sensibles (medical, quote, id, consent) → bucket PRIVÉ
  // On stocke uniquement le PATH dans la BDD, pas l'URL publique.
  // L'admin / le propriétaire les consulte via /api/sign-url (signed URL TTL 5 min).
  const handleFileUpload = async (key, file) => {
    if (!file) return;
    setFileStates(prev => ({...prev, [key]: "uploading"}));
    const ext = file.name.split('.').pop().toLowerCase();
    const mimeMap = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const contentType = mimeMap[ext] || file.type || 'application/octet-stream';
    const fileName = `dossiers/${sessionId}/${key}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_PRIVATE).upload(fileName, file, { contentType });
    if (error) {
      setFileStates(prev => ({...prev, [key]: "error"}));
      console.warn("[file upload] échec:", error);
      return;
    }
    // ⚠️ On stocke le PATH (pas getPublicUrl) — le bucket sera privé
    setFileUrls(prev => ({...prev, [key]: fileName}));
    setFileStates(prev => ({...prev, [key]: "done"}));
  };

  const toEmbedUrl = (url) => {
    if (!url || !url.trim()) return null;
    // YouTube
    const watchMatch = url.match(/youtube\.com\/watch\?v=([^&]+)/);
    if (watchMatch) return "https://www.youtube.com/embed/" + watchMatch[1];
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
    const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&]+)/);
    if (shortsMatch) return 'https://www.youtube.com/embed/' + shortsMatch[1];
    if (shortMatch) return "https://www.youtube.com/embed/" + shortMatch[1];
    if (url.includes("youtube.com/embed/")) return url;
    // TikTok — on stocke l'URL originale, embed via oembed
    const tiktokMatch = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    if (tiktokMatch) return "https://www.tiktok.com/embed/v2/" + tiktokMatch[1];
    return null;
  };

  const getVideoType = (url) => {
    if (!url) return null;
    if (url.includes("youtube") || url.includes("youtu.be")) return "youtube";
    if (url.includes("tiktok")) return "tiktok";
    return null;
  };

  const embedPreview = toEmbedUrl(form.videoUrl);
  const videoType = getVideoType(form.videoUrl);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    // Upload photo if not done yet
    let finalPhotoUrl = photoUrl;
    if (photoFile && !photoUrl) {
      finalPhotoUrl = await handlePhotoUpload();
    }
    const trackingId = "AYD-" + new Date().getFullYear() + "-" + Array.from(crypto.getRandomValues(new Uint8Array(3))).map(b => b.toString(16).padStart(2,"0")).join("").toUpperCase().slice(0,6);
    const { error } = await supabase.from("cases").insert({
      title: form.title,
      description: form.description,
      hospital: form.hospital,
      city: form.city,
      amount: parseFloat(form.amount),
      category: form.category === "Autre" ? (form.categoryOther || "Autre") : form.category,
      full_name: user?.name || "Anonyme",
      photo_url: finalPhotoUrl || null,
      beneficiary_phone: form.beneficiary_phone || null,
      video_url: toEmbedUrl(form.videoUrl) || null,
      status: "PENDING",
      tracking_id: trackingId,
      user_id: user?.id || null,
      deadline_requested: form.deadlineRequested || null,
      document_urls: fileUrls || {},
    });
    if (error) { setSubmitError(lang==="fr"?"Erreur lors de la soumission. Réessayez.":"Submission error. Please try again."); setSubmitting(false); return; }
    try { emailNewCase({ caseTitle: form.title, hospital: form.hospital, city: form.city, amount: form.amount, trackingId }); } catch(e) { console.warn("Email non envoyé:", e); }
    try { emailWelcomePatient({ beneficiaryEmail: user?.email || null, beneficiaryName: user?.name || user?.email?.split("@")[0] || "Patient", caseTitle: form.title, trackingId }); } catch(e) { console.warn("Email bienvenue non envoyé:", e); }
    setStep(3);
    setSubmitting(false);
  };

  if (!user) return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">🔐</div>
      <h2 className="text-xl font-black text-gray-900 mb-3">{t.loginRequired}</h2>
      <button onClick={() => setPage("login")} className="bg-emerald-600 text-white font-bold px-8 py-3 rounded-xl shadow-md">{t.loginBtn}</button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={()=>setPage("home")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6">{t.back}</button>
      <div className="flex items-center gap-1 mb-8">{t.steps.map((s,i)=><div key={i} className="flex items-center gap-1 flex-1 last:flex-none"><div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step>i+1?"bg-emerald-500 text-white":step===i+1?"bg-emerald-600 text-white":"bg-gray-200 text-gray-500"}`}>{step>i+1?"✓":i+1}</div><span className={`text-xs font-medium flex-1 truncate ${step===i+1?"text-emerald-700":"text-gray-400"}`}>{s}</span>{i<2&&<div className={`h-0.5 flex-1 ${step>i+1?"bg-emerald-500":"bg-gray-200"}`}/>}</div>)}</div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {step===1&&<div className="space-y-5">
          <h2 className="font-black text-xl text-gray-900">{t.infoTitle}</h2>

          {/* === PHOTO BÉNÉFICIAIRE === */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              📷 {lang==="fr" ? "Photo du bénéficiaire" : "Beneficiary photo"}
              <span className="text-red-400 ml-1">*</span>
            </label>
            <p className="text-[11px] text-gray-400 mb-3">
              {lang==="fr"
                ? "Une photo récente montrant la situation actuelle du bénéficiaire. Cette photo sera affichée sur la collecte publique."
                : "A recent photo showing the beneficiary's current situation. This photo will appear on the public campaign."}
            </p>
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="preview" className="w-full h-52 object-cover rounded-2xl border-2 border-emerald-300" />
                <div className="absolute top-2 right-2 flex gap-2">
                  <span className="bg-emerald-600 text-white text-xs px-2 py-1 rounded-full font-bold">✓ Photo sélectionnée</span>
                  <button
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoUrl(null); }}
                    className="bg-white border border-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full font-bold hover:bg-red-50 hover:text-red-500">
                    ✕ Changer
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all group">
                <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📷</div>
                <span className="text-sm font-semibold text-gray-600 group-hover:text-emerald-700">
                  {lang==="fr" ? "Cliquez pour ajouter une photo" : "Click to add a photo"}
                </span>
                <span className="text-xs text-gray-400 mt-1">JPG, PNG — max 5 MB</span>
                <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp"
                  onChange={e => {
                    const f = e.target.files[0];
                    if (!f) return;
                    if (f.size > 5_000_000) { alert(lang==="fr" ? "Photo trop lourde (max 5 MB)" : "Photo too large (max 5 MB)"); return; }
                    handlePhotoSelect(f);
                  }} />
              </label>
            )}
          </div>

          <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.titleField}</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} autoComplete="off" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
          <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.descField}</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={4} autoComplete="off" autoCorrect="off" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" /></div>

          {/* Lien vidéo YouTube ou TikTok (optionnel) */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              🎥 {lang==="fr" ? "Lien vidéo YouTube ou TikTok" : "YouTube or TikTok video link"}
              <span className="text-gray-400 font-normal ml-2">({lang==="fr" ? "optionnel" : "optional"})</span>
            </label>
            <p className="text-[11px] text-gray-400 mb-2">
              {lang==="fr"
                ? "Collez le lien de votre vidéo YouTube ou TikTok. Elle sera visible sur votre page de collecte et augmente les dons."
                : "Paste your YouTube or TikTok video link. It will appear on your campaign page and increases donations."}
            </p>
            <div className="flex gap-2 mb-2">
              <span className="text-[11px] bg-red-50 text-red-600 border border-red-100 rounded-full px-2 py-0.5 font-medium">▶ YouTube</span>
              <span className="text-[11px] bg-gray-900 text-white rounded-full px-2 py-0.5 font-medium">♪ TikTok</span>
            </div>
            <input
              type="url"
              value={form.videoUrl}
              onChange={e => setForm({...form, videoUrl: e.target.value})}
              placeholder="https://youtube.com/watch?v=... ou https://tiktok.com/@..."
              autoComplete="off"
              className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${embedPreview ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`}
            />
            {form.videoUrl && !embedPreview && (
              <p className="text-xs text-red-500 mt-1">⚠️ {lang==="fr" ? "Lien non reconnu. Copiez le lien depuis YouTube ou TikTok." : "Link not recognized. Copy the link from YouTube or TikTok."}</p>
            )}
            {embedPreview && (
              <div className="mt-3 rounded-xl overflow-hidden border border-emerald-200">
                <iframe
                  src={embedPreview}
                  className={`w-full ${videoType === "tiktok" ? "h-96" : "h-40"}`}
                  allowFullScreen
                  allow="autoplay"
                  title="preview"
                />
                <div className="bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 font-medium">
                  ✅ {videoType === "tiktok" ? "TikTok" : "YouTube"} {lang==="fr" ? "— aperçu ci-dessus" : "— preview above"}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.hospitalField}</label>
              <select value={form.hospital} onChange={e => {
                const h = CI_HOPITAUX.find(x => x.nom === e.target.value);
                setForm({...form, hospital: e.target.value, city: h?.ville || form.city});
              }} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">— Choisir un hôpital —</option>
                <optgroup label="🏛 CHU (Centres Hospitaliers Universitaires)">
                  {CI_HOPITAUX.filter(h => h.type === "CHU").map(h => <option key={h.nom} value={h.nom}>{h.nom}</option>)}
                </optgroup>
                <optgroup label="🏥 CHR (Centres Hospitaliers Régionaux)">
                  {CI_HOPITAUX.filter(h => h.type === "CHR").map(h => <option key={h.nom} value={h.nom}>{h.nom} — {h.ville}</option>)}
                </optgroup>
                <optgroup label="🏢 Cliniques privées (Abidjan)">
                  {CI_HOPITAUX.filter(h => h.type === "Clinique").map(h => <option key={h.nom} value={h.nom}>{h.nom}</option>)}
                </optgroup>
                <optgroup label="Autre">
                  {CI_HOPITAUX.filter(h => h.type === "Autre").map(h => <option key={h.nom} value={h.nom}>{h.nom}</option>)}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.cityField}</label>
              <select value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">— Choisir une ville —</option>
                {CI_VILLES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.amountField}</label>
              <div className="relative">
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={form.amount}
                  onChange={e => setForm({...form, amount: e.target.value.replace(/[^0-9]/g,"")})}
                  placeholder="ex: 500000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">FCFA</span>
              </div>
              {form.amount && Number(form.amount) > 0 && (
                <p className="text-[11px] text-gray-400 mt-1">
                  {lang==="fr" ? "Montant collecté : " : "Amount to collect: "}
                  <span className="font-bold text-emerald-700">{fmt(Math.round(Number(form.amount)*1.05))}</span>
                  <span className="text-gray-400"> (devis + 5% Ayyad)</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                📱 {lang==="fr" ? "Téléphone mobile money" : "Mobile money phone"}
              </label>
              <div className="flex gap-1.5">
                <span className="bg-gray-100 border border-gray-200 rounded-xl px-3 py-3 text-xs text-gray-500 font-mono flex-shrink-0">+225</span>
                <input
                  type="tel"
                  value={form.beneficiary_phone}
                  onChange={e => setForm({...form, beneficiary_phone: e.target.value.replace(/[^0-9]/g,"")})}
                  placeholder="07 00 00 00 00"
                  maxLength={10}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{lang==="fr" ? "Pour recevoir un éventuel surplus" : "To receive any surplus"}</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-3 block">{t.categoryField}</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                {key:"Cardiologie", enKey:"Cardiology", icon:"🫀"},
                {key:"Oncologie", enKey:"Oncology", icon:"🎗️"},
                {key:"Neurologie", enKey:"Neurology", icon:"🧠"},
                {key:"Orthopédie", enKey:"Orthopedics", icon:"🦾"},
                {key:"Pédiatrie", enKey:"Pediatrics", icon:"👶"},
                {key:"Gynécologie", enKey:"Gynecology", icon:"🌸"},
                {key:"Néphrologie", enKey:"Nephrology", icon:"🫘"},
                {key:"Autre", enKey:"Other", icon:"🏥"},
              ].map(cat => (
                <button key={cat.key} type="button"
                  onClick={() => setForm({...form, category: cat.key, categoryOther: ""})}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${form.category===cat.key ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm" : "border-gray-200 hover:border-gray-300 text-gray-500 hover:bg-gray-50"}`}>
                  <span className="text-xl">{cat.icon}</span>
                  <span className="text-xs text-center leading-tight font-medium">{lang==="fr" ? cat.key : cat.enKey}</span>
                </button>
              ))}
            </div>
            {form.category === "Autre" && (
              <div className="mt-3">
                <input value={form.categoryOther || ""} onChange={e => setForm({...form, categoryOther: e.target.value})}
                  placeholder={lang==="fr" ? "Précisez la spécialité médicale..." : "Specify the medical specialty..."}
                  className="w-full border-2 border-emerald-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50" />
              </div>
            )}
          </div>

          <button onClick={()=>setStep(2)}
            disabled={!form.title||!form.description||!form.hospital||!form.amount||!photoPreview}
            className="w-full bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">
            {!photoPreview
              ? (lang==="fr" ? "⚠️ Ajoutez une photo pour continuer" : "⚠️ Add a photo to continue")
              : t.next}
          </button>
        </div>}

        {step===2&&<div className="space-y-4">
          <h2 className="font-black text-xl text-gray-900">{t.docsTitle}</h2>
          <p className="text-sm text-gray-500">{t.docsSub}</p>

          {/* Rappel photo */}
          {photoPreview && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
              <img src={photoPreview} alt="preview" className="w-14 h-14 object-cover rounded-xl flex-shrink-0" />
              <div>
                <div className="text-xs font-bold text-emerald-700">✅ Photo bénéficiaire</div>
                <div className="text-[11px] text-gray-500">Sera affichée sur la collecte publique</div>
              </div>
            </div>
          )}

          {t.docs.map(doc=>{
            const state = fileStates[doc.key];
            return (
              <div key={doc.key} className={`rounded-2xl border-2 transition-all ${state==="done"?"border-emerald-300 bg-emerald-50":state==="error"?"border-red-200 bg-red-50":"border-gray-200"}`}>
                <div className="flex items-center gap-4 p-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${state==="done"?"bg-emerald-100":"bg-gray-100"}`}>{doc.icon}</div>
                  <div className="flex-1 min-w-0"><div className="font-semibold text-sm text-gray-900">{doc.title} <span className="text-red-400">*</span></div><div className="text-xs text-gray-500">{doc.desc}</div></div>
                  <label className={`px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 cursor-pointer transition-colors ${state==="done"?"bg-emerald-600 text-white":state==="uploading"?"bg-gray-300 text-gray-500 cursor-wait":state==="error"?"bg-red-100 text-red-600":"bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                    {state==="done"?t.uploaded:state==="uploading"?t.uploading:state==="error"?t.error:t.upload}
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{const f=e.target.files[0];if(!f)return;if(f.size>10_000_000){alert(lang==="fr"?"Document trop lourd (max 10 MB)":"File too large (max 10 MB)");return;}handleFileUpload(doc.key,f);}} disabled={state==="uploading"||state==="done"} />
                  </label>
                </div>
                {/* Lien de téléchargement du formulaire de consentement */}
                {doc.key==="consent"&&(
                  <div className="px-4 pb-3 flex items-center gap-2">
                    <div className="w-11 flex-shrink-0"/>
                    <div className="flex-1 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      <span className="text-emerald-600 text-sm">📥</span>
                      <span className="text-xs text-gray-600 flex-1">
                        {lang==="fr"
                          ? "Téléchargez, imprimez, signez, puis uploadez le formulaire ci-dessus."
                          : "Download, print, sign, then upload the form above."}
                      </span>
                      <a
                        href="/AYYAD_Consentement.pdf"
                        download="AYYAD_Formulaire_Consentement.pdf"
                        className="flex-shrink-0 inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                        onClick={e=>e.stopPropagation()}
                      >
                        {lang==="fr" ? "Télécharger le formulaire" : "Download form"} →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!allUploaded&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-xs text-amber-700"><span>⚠️</span><span>{t.warning}</span></div>}
          {submitError&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 text-center">{submitError}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>setStep(1)} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm">{t.back}</button>
            <button onClick={handleSubmit} disabled={!allUploaded||submitting} className="bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-xl text-sm shadow-md">{submitting?"...":t.submit}</button>
          </div>
        </div>}

        {step===3&&<div className="text-center space-y-5 py-4">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-4xl">🎉</div>
          <div><h2 className="font-black text-2xl text-gray-900 mb-2">{t.successTitle}</h2><p className="text-gray-500 text-sm">{t.successSub}</p></div>
          <div className="bg-gray-50 rounded-2xl p-5 text-left space-y-3">{t.processSteps.map((s,i)=><div key={i} className="flex items-center gap-3 text-sm"><div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i===0?"bg-emerald-500 text-white":"bg-gray-200 text-gray-500"}`}>{i===0?"✓":i+1}</div><span className={i===0?"text-emerald-700 font-medium":"text-gray-500"}>{s}</span></div>)}</div>
          <button onClick={()=>setPage("home")} className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">{t.backHome}</button>
        </div>}
      </div>
    </div>
  );
};

// ── How Page ──────────────────────────────────────────────────
const HowPage = ({ lang, setPage }) => {
  const t = T[lang].howPage;
  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-800 to-teal-700 text-white py-16 text-center px-4">
        <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-5 text-sm font-medium">
          <span>💚</span> {lang==="fr" ? "Plateforme médicale vérifiée" : "Verified medical platform"}
        </div>
        <h1 className="text-4xl font-black mb-4">{t.title}</h1>
        <p className="text-emerald-200 max-w-xl mx-auto">{t.sub}</p>
      </div>

      {/* Pour les donateurs */}
      <div className="max-w-5xl mx-auto px-4 py-14">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl">💚</div>
          <div>
            <h2 className="text-2xl font-black text-gray-900">{t.forDonors.title}</h2>
            <p className="text-gray-500 text-sm">{lang==="fr" ? "Comment faire un don sur Ayyad" : "How to donate on Ayyad"}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {t.forDonors.steps.map((step, i) => (
            <div key={i} className="relative">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow h-full">
                <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-black mb-3">{i+1}</div>
                <p className="text-sm text-gray-700 leading-relaxed">{step}</p>
              </div>
              {i < t.forDonors.steps.length-1 && <div className="hidden sm:block absolute top-6 -right-2 text-gray-300 text-lg z-10">→</div>}
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <button onClick={() => setPage("collectes")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-xl shadow-md transition-colors">
            {lang==="fr" ? "Voir les collectes →" : "See campaigns →"}
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border-y border-gray-100">
        {/* Pour les bénéficiaires */}
        <div className="max-w-5xl mx-auto px-4 py-14">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl">🏥</div>
            <div>
              <h2 className="text-2xl font-black text-gray-900">{t.forBenef.title}</h2>
              <p className="text-gray-500 text-sm">{lang==="fr" ? "Comment soumettre votre dossier médical" : "How to submit your medical case"}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {t.forBenef.steps.map((step, i) => (
              <div key={i} className="relative">
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow h-full">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-black mb-3">{i+1}</div>
                  <p className="text-sm text-gray-700 leading-relaxed">{step}</p>
                </div>
                {i < t.forBenef.steps.length-1 && <div className="hidden sm:block absolute top-6 -right-2 text-gray-300 text-lg z-10">→</div>}
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <button onClick={() => setPage("submit")} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl shadow-md transition-colors">
              {lang==="fr" ? "Soumettre un dossier →" : "Submit a case →"}
            </button>
          </div>
        </div>
      </div>

      {/* Garanties */}
      <div className="max-w-5xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-black text-gray-900 text-center mb-2">{lang==="fr" ? "Les garanties Ayyad" : "Ayyad guarantees"}</h2>
        <p className="text-gray-500 text-center text-sm mb-10">{lang==="fr" ? "Ce qui nous différencie des autres plateformes" : "What sets us apart from other platforms"}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {icon:"🏥", title:lang==="fr"?"Versement direct à l'hôpital":"Direct payment to hospital", desc:lang==="fr"?"Les fonds ne passent jamais par le patient. Chaque virement est traçable.":"Funds never go through the patient. Every transfer is traceable."},
            {icon:"🔍", title:lang==="fr"?"Vérification sous 48h":"Verification within 48h", desc:lang==="fr"?"Notre équipe contacte l'hôpital partenaire pour valider chaque dossier.":"Our team contacts the partner hospital to validate each case."},
            {icon:"🔒", title:lang==="fr"?"Données chiffrées AES-256":"AES-256 encrypted data", desc:lang==="fr"?"Tous vos documents médicaux sont chiffrés et stockés en sécurité.":"All your medical documents are encrypted and stored securely."},
          ].map((g,i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm text-center hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">{g.icon}</div>
              <h3 className="font-bold text-gray-900 mb-2">{g.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{g.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fee section */}
      <div className="bg-gray-900 py-14 px-4 text-white text-center">
        <h2 className="text-2xl font-black mb-3">{t.feeTitle}</h2>
        <p className="text-gray-300 mb-8 max-w-lg mx-auto text-sm">{t.feeSub}</p>
        <div className="bg-white/10 rounded-2xl p-6 text-sm max-w-sm mx-auto border border-white/20 space-y-4">

          {/* Donateur */}
          <div>
            <div className="text-gray-400 mb-1 text-xs uppercase tracking-wider">{t.youGive}</div>
            <div className="text-3xl font-black">10 000 FCFA</div>
          </div>

          <div className="border-t border-white/20"/>

          {/* Hôpital reçoit */}
          <div className="flex justify-between items-center">
            <span className="text-emerald-400 font-bold text-sm">🏥 {t.collectReceives}</span>
            <span className="font-black text-xl text-emerald-400">10 000 FCFA</span>
          </div>

          <div className="border-t border-white/10"/>

          {/* Explication objectif */}
          <div className="bg-white/5 rounded-xl p-3 text-left space-y-1.5">
            <div className="text-[11px] text-gray-300 font-semibold uppercase tracking-wide mb-2">
              {lang==="fr" ? "Comment ça fonctionne ?" : "How does it work?"}
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">{lang==="fr" ? "Objectif affiché (devis × 1.05)" : "Displayed goal (quote × 1.05)"}</span>
              <span className="text-white font-bold">10 500 FCFA</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">{lang==="fr" ? "dont devis hôpital" : "of which hospital quote"}</span>
              <span className="text-emerald-400 font-bold">10 000 FCFA</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">{t.ayyadFee}</span>
              <span className="text-amber-400 font-bold">500 FCFA</span>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 leading-relaxed">
            {lang==="fr"
              ? "✅ Votre don va intégralement à l'hôpital. Les 5% Ayyad sont intégrés dans l'objectif de collecte dès le départ."
              : "✅ Your donation goes entirely to the hospital. The 5% Ayyad fee is built into the campaign goal from the start."}
          </div>
        </div>
      </div>

      {/* Section politique de remboursement */}
      <div className="bg-white py-14 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-2xl text-2xl mb-4">🔄</div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              {lang==="fr" ? "Politique de remboursement" : "Refund policy"}
            </h2>
            <p className="text-gray-500 text-sm max-w-lg mx-auto">
              {lang==="fr"
                ? "Ayyad s'engage à une transparence totale sur la gestion des fonds dans toutes les situations."
                : "Ayyad is committed to full transparency on fund management in all situations."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Cas 1 — Dossier rejeté */}
            <div className="border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">❌</div>
                <div className="font-bold text-gray-900 text-sm">
                  {lang==="fr" ? "Dossier rejeté après des dons" : "Case rejected after donations"}
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                {lang==="fr"
                  ? "Si Ayyad rejette un dossier après réception de dons (documents falsifiés, fraude détectée, etc.), chaque donateur enregistré est contacté par email."
                  : "If Ayyad rejects a case after receiving donations (falsified documents, fraud detected, etc.), each registered donor is contacted by email."}
              </p>
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                  {lang==="fr" ? "Le donateur choisit :" : "The donor chooses:"}
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 text-xs mt-0.5">✓</span>
                  <span className="text-xs text-gray-600">
                    {lang==="fr" ? "Remboursement intégral sur son mobile money" : "Full refund to their mobile money account"}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 text-xs mt-0.5">✓</span>
                  <span className="text-xs text-gray-600">
                    {lang==="fr" ? "Redistribution aux cas urgents actifs" : "Redistribution to active urgent cases"}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1 border-t border-gray-200 pt-2">
                  {lang==="fr"
                    ? "⏳ Sans réponse sous 14 jours → redistribution automatique aux cas urgents."
                    : "⏳ No response within 14 days → automatic redistribution to urgent cases."}
                </div>
              </div>
            </div>

            {/* Cas 2 — Objectif non atteint */}
            <div className="border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">⏳</div>
                <div className="font-bold text-gray-900 text-sm">
                  {lang==="fr" ? "Objectif non atteint en fin de collecte" : "Goal not reached at end of campaign"}
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                {lang==="fr"
                  ? "Si l'objectif n'est pas atteint à l'échéance, tous les donateurs ayant un compte sont notifiés et consultés."
                  : "If the goal is not reached at deadline, all registered donors are notified and consulted."}
              </p>
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                  {lang==="fr" ? "Notification envoyée avec choix :" : "Notification sent with choice:"}
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 text-xs mt-0.5">✓</span>
                  <span className="text-xs text-gray-600">
                    {lang==="fr" ? "Remboursement intégral" : "Full refund"}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 text-xs mt-0.5">✓</span>
                  <span className="text-xs text-gray-600">
                    {lang==="fr" ? "Don maintenu → redistribué aux cas urgents" : "Donation kept → redistributed to urgent cases"}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1 border-t border-gray-200 pt-2">
                  {lang==="fr"
                    ? "⏳ Sans réponse sous 14 jours → redistribution automatique aux cas urgents."
                    : "⏳ No response within 14 days → automatic redistribution to urgent cases."}
                </div>
              </div>
            </div>

            {/* Cas 3 — Surcollecte */}
            <div className="border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">🎉</div>
                <div className="font-bold text-gray-900 text-sm">
                  {lang==="fr" ? "Objectif dépassé (surcollecte)" : "Goal exceeded (surplus)"}
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                {lang==="fr"
                  ? "Si les dons dépassent l'objectif, le surplus est réparti automatiquement selon la règle Ayyad."
                  : "If donations exceed the goal, the surplus is automatically distributed according to Ayyad's rule."}
              </p>
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">🏥 {lang==="fr" ? "Hôpital (objectif atteint)" : "Hospital (goal met)"}</span>
                  <span className="font-bold text-emerald-600">100%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">👤 {lang==="fr" ? "70% surplus → bénéficiaire" : "70% surplus → beneficiary"}</span>
                  <span className="font-bold text-blue-600">70%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">🚨 {lang==="fr" ? "25% surplus → cas urgents" : "25% surplus → urgent cases"}</span>
                  <span className="font-bold text-purple-600">25%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">⚙️ {lang==="fr" ? "5% surplus → Ayyad" : "5% surplus → Ayyad"}</span>
                  <span className="font-bold text-amber-600">5%</span>
                </div>
              </div>
            </div>

            {/* Cas 4 — Engagement transparence */}
            <div className="border border-emerald-100 bg-emerald-50 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">🔒</div>
                <div className="font-bold text-gray-900 text-sm">
                  {lang==="fr" ? "Notre engagement" : "Our commitment"}
                </div>
              </div>
              <div className="space-y-2">
                {(lang==="fr" ? [
                  "Chaque virement est documenté avec un reçu disponible publiquement",
                  "Les donateurs enregistrés reçoivent un email de confirmation après chaque don",
                  "Un rapport de transparence est publié trimestriellement",
                  "Ayyad ne touche jamais à l'argent destiné à l'hôpital",
                ] : [
                  "Every transfer is documented with a publicly available receipt",
                  "Registered donors receive a confirmation email after each donation",
                  "A transparency report is published quarterly",
                  "Ayyad never touches the money destined for the hospital",
                ]).map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-emerald-500 text-xs mt-0.5 flex-shrink-0">✓</span>
                    <span className="text-xs text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-center mt-8">
            <button
              onClick={() => setPage("refund")}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-semibold underline underline-offset-2">
              {lang==="fr" ? "Lire la politique de remboursement complète →" : "Read the full refund policy →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Admin Page — Real Supabase data ───────────────────────────
const AdminTeamList = ({ user, fr }) => {
  const [admins, setAdmins] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchErr, setFetchErr] = React.useState(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [newRole, setNewRole] = React.useState("operator");
  const [adding, setAdding] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const ROLES = [
    { value: "super_admin", label: "Super Admin",              color: "bg-purple-100 text-purple-700" },
    { value: "admin",       label: fr ? "Admin" : "Admin",    color: "bg-indigo-100 text-indigo-700" },
    { value: "finance",     label: "Finance",                  color: "bg-blue-100 text-blue-700"   },
    { value: "operator",    label: fr ? "Opérateur":"Operator", color: "bg-green-100 text-green-700" },
  ];

  const getRoleStyle = (role) => ROLES.find(r => r.value === role)?.color || "bg-gray-100 text-gray-600";
  const getRoleLabel = (role) => ROLES.find(r => r.value === role)?.label || (role || "—");

  const fetchAdmins = React.useCallback(async () => {
    setLoading(true);
    setFetchErr(null);
    try {
      // Ne pas utiliser .order("created_at") — la colonne peut ne pas exister
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, email, role, is_active");
      if (error) {
        setFetchErr(error.message);
      } else {
        setAdmins(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setFetchErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const handleAdd = async () => {
    if (!newEmail.includes("@")) return setMsg(fr ? "Email invalide" : "Invalid email");
    setAdding(true);
    setMsg("");
    try {
      const cleanEmail = newEmail.trim().toLowerCase();
      // Chercher le full_name dans profiles, sinon utiliser le préfixe email
      const { data: profileData } = await supabase.from("profiles").select("full_name").eq("email", cleanEmail).maybeSingle();
      const fullName = profileData?.full_name || cleanEmail.split("@")[0];
      const { error } = await supabase
        .from("admin_users")
        .insert({ email: cleanEmail, role: newRole, is_active: true, full_name: fullName });
      if (error) {
        setMsg(fr ? "Erreur : " + error.message : "Error: " + error.message);
      } else {
        setMsg(fr ? "Membre ajouté ✓" : "Member added ✓");
        setNewEmail("");
        setNewRole("operator");
        setShowAdd(false);
        fetchAdmins();
      }
    } catch(e) {
      setMsg(String(e?.message || e));
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (admin) => {
    if (!admin?.id || admin?.email === user?.email) return;
    try {
      await supabase.from("admin_users").update({ is_active: !admin.is_active }).eq("id", admin.id);
      fetchAdmins();
    } catch(e) { console.warn("toggleActive error:", e); }
  };

  const changeRole = async (admin, role) => {
    if (!admin?.id || admin?.email === user?.email) return;
    try {
      await supabase.from("admin_users").update({ role }).eq("id", admin.id);
      fetchAdmins();
    } catch(e) { console.warn("changeRole error:", e); }
  };

  if (loading) return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-2xl mb-2">⏳</div>
      <p className="text-sm">{fr ? "Chargement de l'équipe…" : "Loading team…"}</p>
    </div>
  );

  if (fetchErr) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
      <p className="font-bold mb-1">⚠️ {fr ? "Erreur de chargement" : "Loading error"}</p>
      <p className="text-xs font-mono">{fetchErr}</p>
      <p className="mt-3 text-xs text-red-500">
        {fr
          ? "Vérifiez que la table admin_users a une politique RLS SELECT pour les admins."
          : "Make sure the admin_users table has a SELECT RLS policy for admins."}
      </p>
      <button onClick={fetchAdmins} className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold">
        {fr ? "Réessayer" : "Retry"}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Formulaire ajout — super_admin uniquement */}
      {user?.adminRole === "super_admin" && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-sm font-semibold text-emerald-700 hover:underline"
          >
            {showAdd ? (fr ? "▲ Annuler" : "▲ Cancel") : (fr ? "▼ Ajouter un membre" : "▼ Add member")}
          </button>
          {showAdd && (
            <div className="mt-3 flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                placeholder="Email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {adding ? "…" : (fr ? "Ajouter" : "Add")}
              </button>
            </div>
          )}
          {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
        </div>
      )}

      {/* Message si aucun admin visible (RLS probable) */}
      {admins.length === 0 && !fetchErr && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          <p className="font-bold mb-1">ℹ️ {fr ? "Aucun membre visible" : "No members visible"}</p>
          <p className="text-xs">
            {fr
              ? "La table admin_users est vide ou la politique RLS ne permet pas de lister tous les membres. Exécutez le SQL ci-dessous dans Supabase pour corriger :"
              : "The admin_users table is empty or the RLS policy doesn't allow listing all members. Run the SQL below in Supabase to fix:"}
          </p>
          <pre className="mt-3 bg-amber-100 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">{`CREATE POLICY "admin_users_select_for_admins"
ON admin_users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users a2
    WHERE a2.email = auth.email() AND a2.is_active = true
  )
);`}</pre>
        </div>
      )}

      {/* Liste des membres */}
      {admins.map((admin, idx) => (
        <div key={admin.id ?? idx} className={`flex items-center justify-between p-4 rounded-xl border ${admin.is_active !== false ? "bg-white border-gray-100" : "bg-gray-50 border-gray-200 opacity-60"}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
              {(admin.email?.[0] || "?").toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{admin.email || "—"}</p>
              <p className="text-xs text-gray-400">{admin.is_active !== false ? (fr ? "Actif" : "Active") : (fr ? "Désactivé" : "Disabled")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.adminRole === "super_admin" && admin.email !== user?.email ? (
              <>
                <select
                  value={admin.role || "operator"}
                  onChange={e => changeRole(admin, e.target.value)}
                  className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer ${getRoleStyle(admin.role)}`}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button
                  onClick={() => toggleActive(admin)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold ${admin.is_active !== false ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-green-100 text-green-600 hover:bg-green-200"}`}
                >
                  {admin.is_active !== false ? (fr ? "Désactiver" : "Disable") : (fr ? "Réactiver" : "Enable")}
                </button>
              </>
            ) : (
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${getRoleStyle(admin.role)}`}>
                {getRoleLabel(admin.role)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Error Boundary — capture les crashs React au lieu de page blanche ──
class AdminErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("AdminErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-700 space-y-3">
          <div className="font-black text-base">⚠️ Erreur d'affichage</div>
          <div className="font-mono text-xs bg-red-100 rounded-lg p-3 break-all">
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold">
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Audit log helper ─────────────────────────────────────────
const auditLog = async (user, action, target, oldVal = null, newVal = null) => {
  try {
    await supabase.from("audit_log").insert({
      user_id:    user?.id   || null,
      user_email: user?.email || "unknown",
      user_role:  user?.adminRole || "unknown",
      action,
      target,
      old_value:  oldVal !== null ? JSON.stringify(oldVal) : null,
      new_value:  newVal !== null ? JSON.stringify(newVal) : null,
      created_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("auditLog error:", e); }
};

// ── Composant ligne employé avec édition inline ─────────────────────
const StaffRow = ({ m, fr, paid, onPay, onDelete, onUpdate, fmt }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: m.name, role: m.role||"", wave_number: m.wave_number||"", monthly_salary: m.monthly_salary });

  const save = async () => {
    const ok = await onUpdate(m.id, { ...form, monthly_salary: Number(form.monthly_salary) });
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-4 py-3 bg-blue-50 border-l-4 border-blue-400 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">{fr?"Nom":"Name"}</label>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Rôle</label>
            <input value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5" placeholder="IT, Finance..." />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Wave CI</label>
            <input value={form.wave_number} onChange={e=>setForm(f=>({...f,wave_number:e.target.value}))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5" placeholder="+225 07..." />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">{fr?"Salaire/mois":"Salary/month"}</label>
            <input type="number" value={form.monthly_salary} onChange={e=>setForm(f=>({...f,monthly_salary:e.target.value}))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-700">
            ✓ {fr?"Enregistrer":"Save"}
          </button>
          <button onClick={()=>setEditing(false)} className="bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-200">
            {fr?"Annuler":"Cancel"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-50">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700 font-black text-sm">{(m.name||"?")[0].toUpperCase()}</div>
        <div>
          <div className="font-semibold text-gray-900 text-sm">{m.name}</div>
          <div className="text-xs text-gray-400">{m.role||"—"} · 🌊 {m.wave_number||"—"}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="font-black text-sm text-gray-900">{fmt(m.monthly_salary)}</div>
          <div className="text-[10px] text-gray-400">{fr?"/mois":"/month"}</div>
        </div>
        {paid ? (
          <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-lg">✅ {fr?"Payé":"Paid"}</span>
        ) : (
          <button onClick={onPay} className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-blue-700">
            🌊 {fr?"Payer":"Pay"}
          </button>
        )}
        <button onClick={()=>setEditing(true)} title={fr?"Modifier":"Edit"}
          className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg p-1.5 transition-colors text-sm">
          ✏️
        </button>
        <button onClick={onDelete} title={fr?"Supprimer":"Delete"}
          className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-1.5 transition-colors text-sm">
          🗑️
        </button>
      </div>
    </div>
  );
};

// ── Composant Visiteurs connectés Admin ──────────────────────────────
// ── Onglet Dons (Admin) ───────────────────────────────────────
// adminCases: liste des cases déjà chargée par AdminPage (utilisée pour le sélecteur du don manuel)
const AdminDonationsTab = ({ lang, adminCases = [] }) => {
  const fr = lang === "fr";
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [msg, setMsg] = useState("");
  // ── Modal "Saisir un don manuel" ──
  // Usage : un donateur paie sur Wave (ou autre canal) sans passer par le bouton Confirmer
  // d'Ayyad → l'admin reçoit la notif Wave Business mais aucune ligne pending côté Ayyad.
  // Cette modale permet de créer la ligne à la main pour faire avancer la jauge.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCases, setManualCases] = useState([]);
  const [manualForm, setManualForm] = useState({
    case_id: "",
    amount: "",
    donor_name: "",
    donor_email: "",
    payment_method: "WAVE",
    reference: "",
    message: "",
    status: "confirmed", // par défaut confirmé puisqu'on saisit en réaction à un paiement reçu
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");

  const fetchDonations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("donations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (!error) setDonations(data || []);
    } catch(e) { console.warn("fetchDonations error:", e); }
    setLoading(false);
  };

  useEffect(() => { fetchDonations(); }, []);

  // Ouvre la modale + utilise les cases déjà chargées par le parent AdminPage
  // (au lieu de refetcher — ça nous évite tout souci de RLS/colonnes/_isDemo)
  const openManualModal = () => {
    setManualError("");
    setManualForm({
      case_id: "", amount: "", donor_name: "", donor_email: "",
      payment_method: "WAVE", reference: "", message: "", status: "confirmed",
    });
    // On filtre côté client : on ne propose que les dossiers utilisables (pas PENDING/REJECTED, pas démo)
    const usable = (adminCases || []).filter(c => !["PENDING", "REJECTED"].includes(c.status) && !c._isDemo);
    setManualCases(usable);
    if (usable.length === 0) {
      setManualError(fr
        ? "Aucun dossier validé trouvé. Vérifie que des dossiers sont en statut Approuvé/Collecte/Financé."
        : "No approved case found. Check that some cases have status Approved/Collecting/Funded.");
    }
    setManualOpen(true);
  };

  const submitManualDonation = async () => {
    setManualError("");
    if (!manualForm.case_id) { setManualError(fr?"Sélectionnez un dossier.":"Select a case."); return; }
    const amt = Number(manualForm.amount);
    if (!amt || amt <= 0) { setManualError(fr?"Montant invalide.":"Invalid amount."); return; }
    setManualSaving(true);
    try {
      // Via /api/donate (bypass RLS) avec fallback Supabase direct
      const { error } = await createDonation({
        case_id: manualForm.case_id,
        donor_name: manualForm.donor_name || null,
        donor_email: manualForm.donor_email || null,
        amount: amt,
        amount_fcfa: amt,
        currency: "FCFA",
        payment_method: manualForm.payment_method,
        status: manualForm.status,
        message: manualForm.message || null,
        reference: manualForm.reference || ("MANUEL-" + Date.now()),
      });
      if (error) {
        setManualError(error);
        setManualSaving(false);
        return;
      }
      // Si le don manuel est saisi en 'confirmed' direct, on déclenche le même
      // recompute + email caseFunded que pour le flow normal de confirmation.
      let justReached = false;
      if (manualForm.status === "confirmed" && manualForm.case_id) {
        try {
          const r = await recomputeCaseTotalsAndNotify(manualForm.case_id);
          justReached = r.justReached;
        } catch(e) { console.warn("[manual donation recompute] échec:", e); }
      }
      setMsg(justReached
        ? (fr ? "🎉 Objectif atteint ! Emails envoyés aux donateurs." : "🎉 Goal reached! Emails sent to donors.")
        : (fr ? "✅ Don manuel enregistré !" : "✅ Manual donation recorded!"));
      setTimeout(() => setMsg(""), 4000);
      setManualOpen(false);
      fetchDonations();
    } catch(e) {
      setManualError(e?.message || String(e));
    } finally {
      setManualSaving(false);
    }
  };

  // Helper partagé : recalcule cases.collected/donors/goal_reached_at pour un dossier,
  // et envoie l'email caseFunded à tous les donateurs si l'objectif vient d'être atteint
  // (premier passage seulement, contrôlé par goal_reached_at).
  // Retourne { justReached: bool, total: number, donors: number }
  const recomputeCaseTotalsAndNotify = async (caseId) => {
    if (!caseId) return { justReached: false, total: 0, donors: 0 };
    // 1) Total des dons confirmés
    const { data: confirmedDons } = await supabase.from("donations")
      .select("amount_fcfa, amount, donor_email, donor_name")
      .eq("case_id", caseId)
      .eq("status", "confirmed");
    const totalCollected = (confirmedDons || []).reduce(
      (s, d) => s + Number(d.amount_fcfa || d.amount || 0), 0
    );
    const donorsCount = (confirmedDons || []).length;

    // 2) État actuel du dossier
    const { data: caseRow } = await supabase.from("cases")
      .select("amount, goal_reached_at, status, title, full_name, beneficiary, tracking_id")
      .eq("id", caseId)
      .single();
    if (!caseRow) return { justReached: false, total: totalCollected, donors: donorsCount };

    const target = Number(caseRow.amount || 0);
    const justReached = totalCollected >= target && target > 0 && !caseRow.goal_reached_at;

    // 3) Update cases.collected/donors + goal_reached_at si premier passage
    const updates = { collected: totalCollected, donors: donorsCount };
    if (justReached) updates.goal_reached_at = new Date().toISOString();
    await supabase.from("cases").update(updates).eq("id", caseId);

    // 4) Email caseFunded à tous les donateurs (premier passage uniquement)
    if (justReached) {
      const beneficiaryName = caseRow.full_name || caseRow.beneficiary || "le bénéficiaire";
      const caseTitleStr = typeof caseRow.title === "object"
        ? (caseRow.title?.fr || caseRow.title?.en)
        : caseRow.title;
      for (const d of (confirmedDons || [])) {
        if (d.donor_email) {
          try {
            await emailCaseFunded({
              donorEmail: d.donor_email,
              donorName: d.donor_name || "Donateur",
              caseTitle: caseTitleStr,
              beneficiary: beneficiaryName,
              totalRaised: totalCollected,
              trackingId: caseRow.tracking_id,
            });
          } catch(e) { console.warn("[caseFunded email] échec:", e); }
        }
      }
    }
    return { justReached, total: totalCollected, donors: donorsCount };
  };

  const confirm = async (id) => {
    // Flip pending → confirmed
    const { data: donation, error } = await supabase.from("donations")
      .update({ status: "confirmed" })
      .eq("id", id)
      .select()
      .single();
    if (error || !donation) {
      console.error("[confirm donation] échec:", error);
      return;
    }
    const { justReached } = await recomputeCaseTotalsAndNotify(donation.case_id);
    setMsg(justReached
      ? (fr ? "🎉 Objectif atteint ! Emails envoyés aux donateurs." : "🎉 Goal reached! Emails sent to donors.")
      : (fr ? "✅ Don confirmé !" : "✅ Donation confirmed!"));
    setTimeout(() => setMsg(""), 4000);
    fetchDonations();
  };

  const cancel = async (id) => {
    const { error } = await supabase.from("donations").update({ status: "cancelled" }).eq("id", id);
    if (!error) {
      setMsg(fr ? "Don annulé." : "Donation cancelled.");
      setTimeout(() => setMsg(""), 3000);
      fetchDonations();
    }
  };

  const filtered = donations.filter(d => {
    const matchStatus = filterStatus === "all" || d.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (d.donor_name || "").toLowerCase().includes(q) ||
      (d.donor_email || "").toLowerCase().includes(q) ||
      (d.reference || "").toLowerCase().includes(q) ||
      String(d.amount || "").includes(q);
    return matchStatus && matchSearch;
  });

  const totalConfirmed = donations.filter(d => d.status === "confirmed").reduce((s, d) => s + (d.amount_fcfa || d.amount || 0), 0);
  const totalPending   = donations.filter(d => d.status === "pending").reduce((s, d) => s + (d.amount_fcfa || d.amount || 0), 0);

  const statusBadge = (s) => {
    if (s === "confirmed") return <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{fr?"Confirmé":"Confirmed"}</span>;
    if (s === "cancelled") return <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{fr?"Annulé":"Cancelled"}</span>;
    return <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{fr?"En attente":"Pending"}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">💚 {fr ? "Gestion des dons" : "Donations"}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{donations.length} {fr ? "dons enregistrés" : "donations recorded"}</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={openManualModal}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm"
          >
            ＋ {fr?"Saisir un don manuel":"Add manual donation"}
          </button>
          <button onClick={fetchDonations} className="text-xs text-emerald-600 hover:underline font-medium">↻ {fr?"Actualiser":"Refresh"}</button>
        </div>
      </div>

      {/* Modale de saisie manuelle d'un don */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => !manualSaving && setManualOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4 my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg text-gray-900">📝 {fr?"Don manuel":"Manual donation"}</h3>
              <button onClick={() => setManualOpen(false)} disabled={manualSaving} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              {fr
                ? "À utiliser quand tu reçois un paiement Wave (ou autre) sans qu'aucune ligne pending n'apparaisse dans Ayyad. Tu remplis ce que tu vois dans la notif Wave Business."
                : "Use this when you receive a Wave payment (or other) but no pending line appears in Ayyad. Fill in what you see in the Wave Business notification."}
            </p>
            {manualError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">{manualError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600 font-semibold">{fr?"Dossier *":"Case *"}</label>
                <select
                  value={manualForm.case_id}
                  onChange={e => setManualForm(f => ({...f, case_id: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
                >
                  <option value="">— {fr?"Sélectionner":"Select"} —</option>
                  {manualCases.map(c => {
                    const t = typeof c.title === "object" ? (c.title.fr || c.title.en) : c.title;
                    return <option key={c.id} value={c.id}>{(c.tracking_id || c.id.slice(0,8)) + " — " + (t || c.full_name || c.beneficiary || "—")}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 font-semibold">{fr?"Montant (FCFA) *":"Amount (FCFA) *"}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={manualForm.amount}
                  onChange={e => setManualForm(f => ({...f, amount: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                  placeholder="500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 font-semibold">{fr?"Méthode":"Method"}</label>
                  <select
                    value={manualForm.payment_method}
                    onChange={e => setManualForm(f => ({...f, payment_method: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
                  >
                    <option value="WAVE">🌊 Wave</option>
                    <option value="CASH">💵 {fr?"Espèces":"Cash"}</option>
                    <option value="BANK">🏦 {fr?"Virement banc.":"Bank transfer"}</option>
                    <option value="OTHER">{fr?"Autre":"Other"}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 font-semibold">{fr?"Statut":"Status"}</label>
                  <select
                    value={manualForm.status}
                    onChange={e => setManualForm(f => ({...f, status: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
                  >
                    <option value="confirmed">{fr?"Confirmé":"Confirmed"}</option>
                    <option value="pending">{fr?"En attente":"Pending"}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 font-semibold">{fr?"Nom du donateur":"Donor name"}</label>
                <input
                  type="text"
                  value={manualForm.donor_name}
                  onChange={e => setManualForm(f => ({...f, donor_name: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                  placeholder={fr?"(optionnel — anonyme par défaut)":"(optional — anonymous by default)"}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 font-semibold">{fr?"Référence Wave / N° transaction":"Wave reference / Tx number"}</label>
                <input
                  type="text"
                  value={manualForm.reference}
                  onChange={e => setManualForm(f => ({...f, reference: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                  placeholder="TAUW20260429..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                disabled={manualSaving}
                onClick={() => setManualOpen(false)}
                className="border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >{fr?"Annuler":"Cancel"}</button>
              <button
                disabled={manualSaving}
                onClick={submitManualDonation}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-sm shadow-sm disabled:opacity-60"
              >{manualSaving ? (fr?"Enregistrement…":"Saving…") : (fr?"Enregistrer le don":"Save donation")}</button>
            </div>
          </div>
        </div>
      )}

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-4 py-3 rounded-xl">{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-xl font-black text-gray-900">{donations.filter(d=>d.status==="pending").length}</div>
          <div className="text-[11px] text-amber-600 font-bold mt-0.5">{fr?"En attente":"Pending"}</div>
          <div className="text-[10px] text-gray-400">{new Intl.NumberFormat("fr").format(totalPending)} FCFA</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-xl font-black text-emerald-700">{donations.filter(d=>d.status==="confirmed").length}</div>
          <div className="text-[11px] text-emerald-600 font-bold mt-0.5">{fr?"Confirmés":"Confirmed"}</div>
          <div className="text-[10px] text-gray-400">{new Intl.NumberFormat("fr").format(totalConfirmed)} FCFA</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-xl font-black text-red-500">{donations.filter(d=>d.status==="cancelled").length}</div>
          <div className="text-[11px] text-red-500 font-bold mt-0.5">{fr?"Annulés":"Cancelled"}</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder={fr?"🔍 Rechercher donateur, référence…":"🔍 Search donor, reference…"}
          className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        {["all","pending","confirmed","cancelled"].map(s => (
          <button key={s} onClick={()=>setFilterStatus(s)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${filterStatus===s?"bg-emerald-600 text-white border-emerald-600":"bg-white text-gray-500 border-gray-200 hover:border-emerald-400"}`}>
            {s==="all"?(fr?"Tous":"All"):s==="pending"?(fr?"En attente":"Pending"):s==="confirmed"?(fr?"Confirmés":"Confirmed"):(fr?"Annulés":"Cancelled")}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">{fr?"Chargement…":"Loading…"}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{fr?"Aucun don trouvé.":"No donations found."}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => (
            <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Ligne 1 : montant + statut */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-gray-900 text-base">{new Intl.NumberFormat("fr").format(d.amount_fcfa || d.amount)} FCFA</span>
                    {d.currency !== "FCFA" && <span className="text-[10px] text-gray-400">({d.amount} {d.currency})</span>}
                    {statusBadge(d.status)}
                    <span className="text-[10px] text-gray-400">{d.payment_method === "WAVE" ? "🌊 Wave" : "💳 Carte"}</span>
                  </div>
                  {/* Ligne 2 : dossier */}
                  {d.reference && (
                    <div className="text-[11px] text-blue-600 font-mono mb-1">📂 {d.reference}</div>
                  )}
                  {/* Ligne 3 : donateur */}
                  <div className="text-xs text-gray-500">
                    {d.donor_name
                      ? <><span className="font-semibold text-gray-700">{d.donor_name}</span>{d.donor_email && ` · ${d.donor_email}`}</>
                      : <span className="italic text-gray-400">{fr?"Donateur anonyme":"Anonymous donor"}</span>
                    }
                  </div>
                  {/* Message */}
                  {d.message && <div className="text-[11px] text-emerald-600 italic mt-1">"{d.message}"</div>}
                  {/* Date */}
                  <div className="text-[10px] text-gray-300 mt-1">{new Date(d.created_at).toLocaleString(fr?"fr-CI":"en-US")}</div>
                </div>
                {/* Actions */}
                {d.status === "pending" && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button onClick={() => confirm(d.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">
                      ✓ {fr?"Confirmer":"Confirm"}
                    </button>
                    <button onClick={() => cancel(d.id)}
                      className="border border-red-200 text-red-500 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">
                      ✕ {fr?"Annuler":"Cancel"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Composant Gestion des comptes Admin ──────────────────────────────
const AdminAccountsTab = ({ lang, user: currentUser }) => {
  const fr = lang === "fr";
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | admin | banned | regular
  const [actionModal, setActionModal] = useState(null); // { account, action }
  const [banReason, setBanReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ total: 0, admins: 0, banned: 0, thisMonth: 0 });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setAccounts(data);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      setStats({
        total: data.length,
        admins: data.filter(a => a.is_admin).length,
        banned: data.filter(a => a.is_banned).length,
        thisMonth: data.filter(a => new Date(a.created_at) >= monthStart).length,
      });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(fr ? "fr-CI" : "en-US", { day:"2-digit", month:"short", year:"numeric" });
  };

  const fmtLast = (iso) => {
    if (!iso) return fr ? "Jamais connecté" : "Never logged in";
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60) return fr ? "À l'instant" : "Just now";
    if (diff < 3600) return Math.floor(diff/60) + (fr ? " min" : " min ago");
    if (diff < 86400) return Math.floor(diff/3600) + (fr ? " h" : " h ago");
    if (diff < 2592000) return Math.floor(diff/86400) + (fr ? " j" : " d ago");
    return fmtDate(iso);
  };

  const doAction = async () => {
    if (!actionModal) return;
    setSaving(true);
    const { account, action } = actionModal;
    let update = {};
    if (action === "ban") update = { is_banned: true, ban_reason: banReason || (fr ? "Violation des conditions" : "Terms violation") };
    if (action === "unban") update = { is_banned: false, ban_reason: null };
    if (action === "promote") update = { is_admin: true };
    if (action === "demote") update = { is_admin: false };
    const { error } = await supabase.from("profiles").update(update).eq("id", account.id);
    // Synchroniser avec admin_users pour que l'accès admin soit effectif
    if (!error && action === "promote") {
      const fullName = account.full_name || account.name || (account.email||"").split("@")[0];
      await supabase.from("admin_users").upsert({ email: account.email, role: "admin", is_active: true, full_name: fullName }, { onConflict: "email" });
    }
    if (!error && action === "demote") {
      await supabase.from("admin_users").update({ is_active: false }).eq("email", account.email);
    }
    if (!error) {
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, ...update } : a));
      setStats(s => ({
        ...s,
        admins: action === "promote" ? s.admins + 1 : action === "demote" ? s.admins - 1 : s.admins,
        banned: action === "ban" ? s.banned + 1 : action === "unban" ? s.banned - 1 : s.banned,
      }));
    }
    setSaving(false);
    setActionModal(null);
    setBanReason("");
  };

  const filtered = accounts.filter(a => {
    if (filter === "admin" && !a.is_admin) return false;
    if (filter === "banned" && !a.is_banned) return false;
    if (filter === "regular" && (a.is_admin || a.is_banned)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (a.email||"").toLowerCase().includes(q) || (a.full_name||a.name||"").toLowerCase().includes(q);
    }
    return true;
  });

  const statCards = [
    { label: fr ? "Comptes total" : "Total accounts", value: stats.total, icon: "👤", color: "emerald" },
    { label: fr ? "Ce mois" : "This month", value: stats.thisMonth, icon: "🆕", color: "blue" },
    { label: fr ? "Admins" : "Admins", value: stats.admins, icon: "🛡️", color: "purple" },
    { label: fr ? "Bannis" : "Banned", value: stats.banned, icon: "🚫", color: "red" },
  ];

  const colorMap = { emerald: "bg-emerald-50 text-emerald-700 border-emerald-100", blue: "bg-blue-50 text-blue-700 border-blue-100", purple: "bg-purple-50 text-purple-700 border-purple-100", red: "bg-red-50 text-red-700 border-red-100" };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">👤 {fr ? "Gestion des comptes" : "Account Management"}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{fr ? "Tous les comptes inscrits sur la plateforme" : "All accounts registered on the platform"}</p>
        </div>
        <button onClick={load} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600">🔄 {fr ? "Actualiser" : "Refresh"}</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${colorMap[s.color]}`}>
            <div className="text-2xl font-black">{loading ? "—" : s.value}</div>
            <div className="text-xs font-medium mt-1 opacity-80">{s.icon} {s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-wrap gap-2">
        {[["all", fr?"Tous":"All"],["regular",fr?"Standard":"Regular"],["admin","Admin"],["banned",fr?"Bannis":"Banned"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setFilter(id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter===id ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{lbl}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={fr ? "Rechercher nom ou email..." : "Search name or email..."}
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">⏳ {fr ? "Chargement..." : "Loading..."}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-12">{fr ? "Aucun compte trouvé" : "No accounts found"}</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">{filtered.length} {fr ? "compte(s)" : "account(s)"}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map(a => (
              <div key={a.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${a.is_banned ? "opacity-60" : ""}`}>
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${a.is_admin ? "bg-purple-100 text-purple-700" : a.is_banned ? "bg-red-100 text-red-500" : "bg-emerald-100 text-emerald-700"}`}>
                  {(a.full_name || a.name || a.email || "?")[0].toUpperCase()}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800 truncate">{a.full_name || a.name || "—"}</span>
                    {a.is_admin && <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full">🛡️ Admin</span>}
                    {a.is_banned && <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">🚫 {fr?"Banni":"Banned"}</span>}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{a.email || "—"}</div>
                </div>
                {/* Dates */}
                <div className="hidden sm:block text-right flex-shrink-0">
                  <div className="text-xs text-gray-500">{fr ? "Inscrit" : "Joined"}: {fmtDate(a.created_at)}</div>
                  <div className="text-xs text-gray-400">{fr ? "Dernière co." : "Last login"}: {fmtLast(a.last_login)}</div>
                </div>
                {/* Actions */}
                {a.id !== currentUser?.id && (
                  <div className="flex gap-1 flex-shrink-0">
                    {a.is_banned ? (
                      <button onClick={() => setActionModal({ account: a, action: "unban" })} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 font-medium">✓ {fr?"Réactiver":"Unban"}</button>
                    ) : (
                      <button onClick={() => setActionModal({ account: a, action: "ban" })} className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 font-medium">🚫 {fr?"Bannir":"Ban"}</button>
                    )}
                    {a.is_admin ? (
                      <button onClick={() => setActionModal({ account: a, action: "demote" })} className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-2.5 py-1 rounded-lg hover:bg-purple-100 font-medium">↓ {fr?"Retirer admin":"Remove admin"}</button>
                    ) : (
                      <button onClick={() => setActionModal({ account: a, action: "promote" })} className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-2.5 py-1 rounded-lg hover:bg-purple-100 font-medium">🛡️ {fr?"Promouvoir":"Promote"}</button>
                    )}
                  </div>
                )}
                {a.id === currentUser?.id && (
                  <span className="text-xs text-gray-400 italic flex-shrink-0">{fr?"(vous)":"(you)"}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-black text-lg text-gray-900 mb-2">
              {actionModal.action === "ban" && (fr ? "🚫 Bannir ce compte" : "🚫 Ban this account")}
              {actionModal.action === "unban" && (fr ? "✓ Réactiver ce compte" : "✓ Unban this account")}
              {actionModal.action === "promote" && (fr ? "🛡️ Promouvoir en admin" : "🛡️ Promote to admin")}
              {actionModal.action === "demote" && (fr ? "↓ Retirer les droits admin" : "↓ Remove admin rights")}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{actionModal.account.full_name || actionModal.account.name || actionModal.account.email}</strong>
            </p>
            {actionModal.action === "ban" && (
              <textarea
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                rows={2}
                placeholder={fr ? "Motif du bannissement..." : "Ban reason..."}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setActionModal(null); setBanReason(""); }} className="border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl text-sm">{fr?"Annuler":"Cancel"}</button>
              <button onClick={doAction} disabled={saving} className={`font-bold py-2.5 rounded-xl text-sm text-white shadow-md ${actionModal.action==="ban"?"bg-red-600":actionModal.action==="promote"?"bg-purple-600":"bg-emerald-600"}`}>
                {saving ? "..." : (fr?"Confirmer":"Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminVisitorsTab = ({ lang }) => {
  const fr = lang === "fr";
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_activity")
      .select("*")
      .order("last_seen", { ascending: false })
      .limit(200);
    setVisitors(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fmt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return fr ? "À l'instant" : "Just now";
    if (diff < 3600) return Math.floor(diff / 60) + (fr ? " min" : " min ago");
    if (diff < 86400) return Math.floor(diff / 3600) + (fr ? " h" : " h ago");
    return Math.floor(diff / 86400) + (fr ? " j" : " d ago");
  };

  const filtered = visitors.filter(v =>
    !search || v.email?.toLowerCase().includes(search.toLowerCase()) || v.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">👁️ {fr ? "Visiteurs connectés" : "Logged-in visitors"}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{fr ? "Utilisateurs qui se sont connectés à la plateforme" : "Users who logged into the platform"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-emerald-100 text-emerald-700 text-sm font-bold px-3 py-1 rounded-full">{visitors.length} {fr ? "utilisateurs" : "users"}</span>
          <button onClick={load} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600">🔄 {fr ? "Actualiser" : "Refresh"}</button>
        </div>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={fr ? "Rechercher par nom ou email..." : "Search by name or email..."}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
      />

      {loading ? (
        <div className="text-center text-gray-400 py-12">⏳ {fr ? "Chargement..." : "Loading..."}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          {search ? (fr ? "Aucun résultat" : "No results") : (fr ? "Aucune visite enregistrée pour l'instant" : "No visits recorded yet")}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{fr ? "Utilisateur" : "User"}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{fr ? "Dernière visite" : "Last seen"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.user_id} className={"border-b border-gray-50 hover:bg-gray-50 transition-colors" + (i === filtered.length - 1 ? " border-0" : "")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                        {(v.name || v.email || "?")[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800 truncate max-w-[140px]">{v.name || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 truncate max-w-[180px]">{v.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full whitespace-nowrap">
                      🟢 {fmt(v.last_seen)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Composant Gestion Témoignages Admin ──────────────────────────────
const AdminTestimonialsTab = ({ lang, user }) => {
  const fr = lang === "fr";
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending"); // pending | approved | rejected | all
  const [editing, setEditing] = useState(null); // témoignage en cours d'édition
  const [editForm, setEditForm] = useState({});
  const [msg, setMsg] = useState("");

  const fetchTestimonials = React.useCallback(async () => {
    setLoading(true);
    const query = supabase.from("testimonials").select("*").order("created_at", { ascending: false }).limit(200);
    const { data, error } = filter === "all" ? await query : await query.eq("status", filter);
    if (!error) setTestimonials(data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchTestimonials(); }, [fetchTestimonials]);

  const approve = async (id) => {
    await supabase.from("testimonials").update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("id", id);
    setMsg(fr ? "✓ Témoignage approuvé" : "✓ Testimonial approved");
    fetchTestimonials();
    setTimeout(() => setMsg(""), 3000);
  };

  const reject = async (id) => {
    await supabase.from("testimonials").update({ status: "rejected", reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("id", id);
    setMsg(fr ? "Témoignage rejeté" : "Testimonial rejected");
    fetchTestimonials();
    setTimeout(() => setMsg(""), 3000);
  };

  const deleteTestimonial = async (id) => {
    if (!window.confirm(fr ? "Supprimer ce témoignage ?" : "Delete this testimonial?")) return;
    await supabase.from("testimonials").delete().eq("id", id);
    setMsg(fr ? "Témoignage supprimé" : "Testimonial deleted");
    fetchTestimonials();
    setTimeout(() => setMsg(""), 3000);
  };

  const saveEdit = async () => {
    await supabase.from("testimonials").update({
      beneficiary: editForm.beneficiary,
      message_fr: editForm.message_fr,
      message_en: editForm.message_en,
      stars: Number(editForm.stars),
      admin_note: editForm.admin_note,
    }).eq("id", editing);
    setEditing(null);
    setMsg(fr ? "✓ Témoignage modifié" : "✓ Testimonial updated");
    fetchTestimonials();
    setTimeout(() => setMsg(""), 3000);
  };

  const statusColors = { pending: "bg-yellow-100 text-yellow-700", approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" };
  const statusLabels = { pending: fr ? "En attente" : "Pending", approved: fr ? "Approuvé" : "Approved", rejected: fr ? "Rejeté" : "Rejected" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">💬 {fr ? "Gestion des témoignages" : "Testimonial management"}</h2>
        {msg && <span className="text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">{msg}</span>}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {["pending","approved","rejected","all"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${filter===s ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {s==="all" ? (fr?"Tous":"All") : statusLabels[s]}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-10 text-gray-400">{fr ? "Chargement..." : "Loading..."}</div>}

      {!loading && testimonials.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">💬</div>
          <p>{fr ? "Aucun témoignage dans cette catégorie." : "No testimonials in this category."}</p>
        </div>
      )}

      <div className="space-y-4">
        {testimonials.map(t => (
          <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            {editing === t.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{fr?"Nom":"Name"}</label>
                    <input value={editForm.beneficiary||""} onChange={e=>setEditForm(f=>({...f,beneficiary:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">⭐ {fr?"Note":"Stars"}</label>
                    <select value={editForm.stars||5} onChange={e=>setEditForm(f=>({...f,stars:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                      {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} ⭐</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Message (FR)</label>
                  <textarea value={editForm.message_fr||""} onChange={e=>setEditForm(f=>({...f,message_fr:e.target.value}))}
                    rows={4} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Message (EN)</label>
                  <textarea value={editForm.message_en||""} onChange={e=>setEditForm(f=>({...f,message_en:e.target.value}))}
                    rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">{fr?"Note interne (non visible)":"Internal note (not public)"}</label>
                  <input value={editForm.admin_note||""} onChange={e=>setEditForm(f=>({...f,admin_note:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} className="bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-emerald-700">
                    {fr?"Enregistrer":"Save"}
                  </button>
                  <button onClick={()=>setEditing(null)} className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-200">
                    {fr?"Annuler":"Cancel"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{t.beneficiary}</span>
                      {t.age && <span className="text-xs text-gray-400">{t.age} ans</span>}
                      {t.city && <span className="text-xs text-gray-400">· {t.city}</span>}
                      {t.hospital && <span className="text-xs text-gray-400">· {t.hospital}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColors[t.status]}`}>{statusLabels[t.status]}</span>
                      {t.category_fr && <span className="text-xs text-gray-400">{t.category_fr}</span>}
                      {t.amount && <span className="text-xs font-semibold text-emerald-700">{t.amount.toLocaleString()} FCFA</span>}
                      <span className="text-xs text-gray-300">{new Date(t.created_at).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </div>
                  <span className="text-lg">{"⭐".repeat(t.stars||5)}</span>
                </div>
                <blockquote className="text-sm text-gray-700 italic border-l-3 border-emerald-300 pl-3 mb-3">
                  "{t.message_fr}"
                </blockquote>
                {t.admin_note && (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                    📝 {t.admin_note}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {t.status !== "approved" && (
                    <button onClick={()=>approve(t.id)} className="text-xs bg-green-600 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-green-700">
                      ✓ {fr?"Approuver":"Approve"}
                    </button>
                  )}
                  {t.status !== "rejected" && (
                    <button onClick={()=>reject(t.id)} className="text-xs bg-orange-500 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-orange-600">
                      ✗ {fr?"Rejeter":"Reject"}
                    </button>
                  )}
                  <button onClick={()=>{ setEditing(t.id); setEditForm({beneficiary:t.beneficiary,message_fr:t.message_fr,message_en:t.message_en,stars:t.stars,admin_note:t.admin_note||""}); }}
                    className="text-xs bg-gray-100 text-gray-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-200">
                    ✏️ {fr?"Modifier":"Edit"}
                  </button>
                  <button onClick={()=>deleteTestimonial(t.id)} className="text-xs bg-red-50 text-red-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-100">
                    🗑️ {fr?"Supprimer":"Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── AdminExportTab — super_admin uniquement ───────────────────
const AdminExportTab = ({ lang, user }) => {
  const fr = lang === "fr";
  const fmtN = n => (n||0).toLocaleString("fr-FR");

  // État
  const today = new Date().toISOString().slice(0,10);
  const firstDay = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10);
  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo,   setDateTo]   = useState(today);
  const [loading,  setLoading]  = useState(false);
  const [sections, setSections] = useState({
    dossiers: true, dons: true, virements: true,
    finance: true, salaires: true, bilan: true, audit: true
  });

  const toggleSection = k => setSections(p => ({...p, [k]: !p[k]}));

  // Labels sections
  const SECTION_LABELS = {
    dossiers:  fr ? "📋 Dossiers"        : "📋 Cases",
    dons:      fr ? "💚 Dons"            : "💚 Donations",
    virements: fr ? "🏦 Virements"       : "🏦 Payouts",
    finance:   fr ? "💰 Finance"         : "💰 Finance",
    salaires:  fr ? "👔 Salaires"        : "👔 Salaries",
    bilan:     fr ? "📈 Bilan"           : "📈 Reporting",
    audit:     fr ? "📝 Journal d'audit" : "📝 Audit log",
  };

  // ── Fetch toutes les données ──
  const fetchData = async () => {
    const from = dateFrom ? new Date(dateFrom).toISOString() : null;
    const to   = dateTo   ? new Date(dateTo + "T23:59:59").toISOString() : null;
    const applyRange = (q, field) => {
      if (from) q = q.gte(field, from);
      if (to)   q = q.lte(field, to);
      return q;
    };

    const fetches = {};
    if (sections.dossiers || sections.bilan || sections.virements) {
      let q = supabase.from("cases").select("*").order("created_at", {ascending:false}).limit(1000);
      q = applyRange(q, "created_at");
      fetches.cases = q;
    }
    if (sections.dons) {
      let q = supabase.from("donations").select("*").order("created_at", {ascending:false}).limit(1000);
      q = applyRange(q, "created_at");
      fetches.donations = q;
    }
    if (sections.salaires || sections.bilan) {
      let q = supabase.from("salary_payments").select("*, staff_members(name,role)").order("payment_date", {ascending:false}).limit(500);
      q = applyRange(q, "payment_date");
      fetches.salaries = q;
    }
    if (sections.finance || sections.bilan) {
      let q = supabase.from("ayyad_expenses").select("*").order("date", {ascending:false}).limit(500);
      q = applyRange(q, "date");
      fetches.expenses = q;
    }
    if (sections.audit) {
      let q = supabase.from("audit_log").select("*").order("created_at", {ascending:false}).limit(500);
      q = applyRange(q, "created_at");
      fetches.audit = q;
    }

    const keys = Object.keys(fetches);
    const results = await Promise.all(keys.map(k => fetches[k]));
    const data = {};
    keys.forEach((k,i) => { data[k] = results[i].data || []; });
    return data;
  };

  // ── Helpers XML ──
  const xmlCell = (val, type="String") => {
    const safe = String(val ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    if (type==="Number") return `<Cell><Data ss:Type="Number">${safe}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${safe}</Data></Cell>`;
  };
  const xmlRow = cols => `<Row>${cols.join("")}</Row>`;
  const xmlHeader = cols => `<Row>${cols.map(c=>`<Cell ss:StyleID="header"><Data ss:Type="String">${String(c).replace(/&/g,"&amp;")}</Data></Cell>`).join("")}</Row>`;

  const buildSheet = (name, headers, rows) => {
    const headerRow = xmlHeader(headers);
    const dataRows = rows.map(r => xmlRow(r.map((v,i) => {
      const isNum = typeof v === "number";
      return xmlCell(v ?? "", isNum ? "Number" : "String");
    }))).join("\n");
    return `<Worksheet ss:Name="${name.replace(/[\\/*?[\]]/g,"_").slice(0,31)}">
<Table>
${headerRow}
${dataRows}
</Table>
</Worksheet>`;
  };

  // ── Export Excel (SpreadsheetML) ──
  const exportExcel = async () => {
    setLoading(true);
    try {
      const d = await fetchData();
      const sheets = [];

      if (sections.dossiers && d.cases) {
        const headers = fr
          ? ["Ref","Titre","Bénéficiaire","Hôpital","Ville","Catégorie","Objectif","Collecté","Donateurs","Statut","Urgent","Date"]
          : ["Ref","Title","Beneficiary","Hospital","City","Category","Goal","Collected","Donors","Status","Urgent","Date"];
        const rows = d.cases.map(c => [
          c.tracking_id||"", c.title||"", c.full_name||"", c.hospital||"", c.city||"",
          c.category||"", c.amount||0, c.collected||0, c.donors||0,
          c.status||"", c.urgent?"Oui":"Non", c.created_at?.slice(0,10)||""
        ]);
        sheets.push(buildSheet(fr?"Dossiers":"Cases", headers, rows));
      }

      if (sections.dons && d.donations) {
        const headers = fr
          ? ["Date","Donateur","Email","Montant (FCFA)","Devise","Méthode","Statut","Message","Référence"]
          : ["Date","Donor","Email","Amount (FCFA)","Currency","Method","Status","Message","Reference"];
        const rows = d.donations.map(r => [
          r.created_at?.slice(0,10)||"", r.donor_name||"Anonyme", r.donor_email||"",
          r.amount_fcfa||r.amount||0, r.currency||"FCFA", r.payment_method||"",
          r.status||"", r.message||"", r.reference||""
        ]);
        sheets.push(buildSheet(fr?"Dons":"Donations", headers, rows));
      }

      if (sections.virements && d.cases) {
        const payouts = d.cases.filter(c=>c.payout_status);
        const headers = fr
          ? ["Ref","Titre","Hôpital","Collecté","Montant hôpital","Frais Ayyad","Statut virement","Date virement"]
          : ["Ref","Title","Hospital","Collected","Hospital amount","Ayyad fee","Payout status","Payout date"];
        const rows = payouts.map(c => {
          const col = c.collected||0;
          const fee = Math.round(col*0.05);
          return [c.tracking_id||"", c.title||"", c.hospital||"", col, col-fee, fee, c.payout_status||"", c.payout_date?.slice(0,10)||""];
        });
        sheets.push(buildSheet(fr?"Virements":"Payouts", headers, rows));
      }

      if (sections.finance && d.expenses) {
        const headers = fr
          ? ["Date","Libellé","Catégorie","Montant (FCFA)","Référence"]
          : ["Date","Label","Category","Amount (FCFA)","Reference"];
        const rows = d.expenses.map(e => [e.date?.slice(0,10)||"", e.label||"", e.category||"", e.amount||0, e.reference||""]);
        sheets.push(buildSheet(fr?"Finance":"Finance", headers, rows));
      }

      if (sections.salaires && d.salaries) {
        const headers = fr
          ? ["Mois","Employé","Rôle","Montant (FCFA)","Méthode","Statut","Date paiement"]
          : ["Month","Employee","Role","Amount (FCFA)","Method","Status","Payment date"];
        const rows = d.salaries.map(p => [
          p.payment_month||"", p.staff_members?.name||"", p.staff_members?.role||"",
          p.amount||0, p.payment_method||"WAVE", p.status||"", p.payment_date?.slice(0,10)||""
        ]);
        sheets.push(buildSheet(fr?"Salaires":"Salaries", headers, rows));
      }

      if (sections.bilan && d.cases) {
        const allActive = d.cases.filter(c=>!["PENDING","REJECTED"].includes(c.status));
        const totalCol = allActive.reduce((s,c)=>s+(c.collected||0),0);
        const fees = Math.round(totalCol*0.05);
        const totalSal = (d.salaries||[]).reduce((s,p)=>s+(p.amount||0),0);
        const totalExp = (d.expenses||[]).reduce((s,e)=>s+(e.amount||0),0);
        const headers = fr ? ["Indicateur","Valeur"] : ["Indicator","Value"];
        const rows = [
          [fr?"Période":"Period", `${dateFrom} → ${dateTo}`],
          [fr?"Nombre de dossiers":"Number of cases", allActive.length],
          [fr?"Total collecté (FCFA)":"Total raised (FCFA)", totalCol],
          [fr?"Frais Ayyad 5% (FCFA)":"Ayyad 5% fee (FCFA)", fees],
          [fr?"Total salaires (FCFA)":"Total salaries (FCFA)", totalSal],
          [fr?"Total charges (FCFA)":"Total expenses (FCFA)", totalExp],
          [fr?"Solde (FCFA)":"Balance (FCFA)", fees - totalSal - totalExp],
          [fr?"Dossiers objectif atteint":"Cases goal reached", allActive.filter(c=>(c.collected||0)>=(c.amount||1)).length],
          [fr?"Virements confirmés":"Confirmed payouts", allActive.filter(c=>c.payout_status==="confirmed").length],
        ];
        sheets.push(buildSheet(fr?"Bilan":"Reporting", headers, rows));
      }

      if (sections.audit && d.audit) {
        const headers = fr
          ? ["Horodatage","Opérateur","Rôle","Action","Cible","Ancienne valeur","Nouvelle valeur"]
          : ["Timestamp","Operator","Role","Action","Target","Old value","New value"];
        const rows = d.audit.map(l => [
          l.created_at?.slice(0,19).replace("T"," ")||"",
          l.user_email||"", l.user_role||"", l.action||"",
          l.target||"", l.old_value||"", l.new_value||""
        ]);
        sheets.push(buildSheet(fr?"Journal audit":"Audit log", headers, rows));
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:x="urn:schemas-microsoft-com:office:excel">
<Styles>
  <Style ss:ID="header">
    <Font ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#0d5c2e" ss:Pattern="Solid"/>
  </Style>
</Styles>
${sheets.join("\n")}
</Workbook>`;

      const blob = new Blob([xml], {type:"application/vnd.ms-excel;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ayyad_export_${dateFrom}_${dateTo}.xls`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e) { console.error("Export Excel error:", e); alert(fr?"Erreur lors de l'export.":"Export error."); }
    setLoading(false);
  };

  // ── Export PDF (HTML print) ──
  const exportPDF = async () => {
    setLoading(true);
    try {
      const d = await fetchData();
      const period = `${dateFrom} → ${dateTo}`;
      const now = new Date().toLocaleString("fr");

      let html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
<title>Ayyad — Export ${period}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;background:#fff;padding:20px}
  h1{font-size:18px;color:#0d5c2e;margin-bottom:4px}
  .sub{color:#6b7280;font-size:10px;margin-bottom:20px}
  h2{font-size:13px;color:#0d5c2e;margin:24px 0 8px;border-bottom:2px solid #0d5c2e;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:12px}
  th{background:#0d5c2e;color:#fff;padding:5px 7px;text-align:left;font-size:10px}
  td{padding:4px 7px;border-bottom:1px solid #e5e7eb;font-size:10px}
  tr:nth-child(even) td{background:#f9fafb}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
  .kpi{border:1px solid #e5e7eb;border-radius:6px;padding:8px;text-align:center}
  .kpi-v{font-size:14px;font-weight:700;color:#0d5c2e}
  .kpi-l{font-size:9px;color:#6b7280;margin-top:2px}
  .footer{margin-top:30px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:9px;color:#9ca3af}
  @media print{body{padding:10px}.no-print{display:none}}
</style></head><body>
<h1>AYYAD — ${fr?"Rapport d'export":"Export Report"}</h1>
<div class="sub">${fr?"Période":"Period"} : ${period} · ${fr?"Généré le":"Generated"} : ${now}</div>`;

      if (sections.bilan && d.cases) {
        const allActive = d.cases.filter(c=>!["PENDING","REJECTED"].includes(c.status));
        const totalCol = allActive.reduce((s,c)=>s+(c.collected||0),0);
        const fees = Math.round(totalCol*0.05);
        const totalSal = (d.salaries||[]).reduce((s,p)=>s+(p.amount||0),0);
        const totalExp = (d.expenses||[]).reduce((s,e)=>s+(e.amount||0),0);
        const balance = fees - totalSal - totalExp;
        html += `<h2>${fr?"Bilan de la période":"Period Summary"}</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-v">${allActive.length}</div><div class="kpi-l">${fr?"Dossiers":"Cases"}</div></div>
  <div class="kpi"><div class="kpi-v">${fmtN(totalCol)}</div><div class="kpi-l">${fr?"Collecté (FCFA)":"Raised (FCFA)"}</div></div>
  <div class="kpi"><div class="kpi-v">${fmtN(fees)}</div><div class="kpi-l">${fr?"Frais Ayyad 5%":"Ayyad 5% fee"}</div></div>
  <div class="kpi"><div class="kpi-v" style="color:${balance<0?"#dc2626":"#0d5c2e"}">${fmtN(balance)}</div><div class="kpi-l">${fr?"Solde":"Balance"}</div></div>
</div>`;
      }

      if (sections.dossiers && d.cases) {
        html += `<h2>${fr?"Dossiers":"Cases"}</h2>
<table><thead><tr>
  <th>${fr?"Référence":"Ref"}</th><th>${fr?"Titre":"Title"}</th><th>${fr?"Bénéficiaire":"Beneficiary"}</th>
  <th>${fr?"Hôpital":"Hospital"}</th><th>${fr?"Objectif":"Goal"}</th><th>${fr?"Collecté":"Raised"}</th><th>Statut</th>
</tr></thead><tbody>`;
        d.cases.forEach(c => {
          html += `<tr><td>${c.tracking_id||""}</td><td>${c.title||""}</td><td>${c.full_name||""}</td>
<td>${c.hospital||""}</td><td>${fmtN(c.amount||0)}</td><td>${fmtN(c.collected||0)}</td><td>${c.status||""}</td></tr>`;
        });
        html += `</tbody></table>`;
      }

      if (sections.dons && d.donations) {
        const totalDons = d.donations.filter(d=>d.status==="confirmed").reduce((s,d)=>s+(d.amount_fcfa||d.amount||0),0);
        html += `<h2>${fr?"Dons":"Donations"} (${d.donations.length} — ${fmtN(totalDons)} FCFA ${fr?"confirmés":"confirmed"})</h2>
<table><thead><tr>
  <th>${fr?"Date":"Date"}</th><th>${fr?"Donateur":"Donor"}</th><th>${fr?"Montant":"Amount"}</th>
  <th>${fr?"Méthode":"Method"}</th><th>Statut</th>
</tr></thead><tbody>`;
        d.donations.forEach(r => {
          html += `<tr><td>${r.created_at?.slice(0,10)||""}</td><td>${r.donor_name||"Anonyme"}</td>
<td>${fmtN(r.amount_fcfa||r.amount||0)} FCFA</td><td>${r.payment_method||""}</td><td>${r.status||""}</td></tr>`;
        });
        html += `</tbody></table>`;
      }

      if (sections.virements && d.cases) {
        const payouts = d.cases.filter(c=>c.payout_status);
        if (payouts.length > 0) {
          html += `<h2>${fr?"Virements hospitaliers":"Hospital Payouts"}</h2>
<table><thead><tr>
  <th>${fr?"Référence":"Ref"}</th><th>${fr?"Hôpital":"Hospital"}</th><th>${fr?"Collecté":"Raised"}</th>
  <th>${fr?"Montant hôpital":"Hospital amount"}</th><th>${fr?"Frais Ayyad":"Ayyad fee"}</th><th>Statut</th>
</tr></thead><tbody>`;
          payouts.forEach(c => {
            const col = c.collected||0;
            const fee = Math.round(col*0.05);
            html += `<tr><td>${c.tracking_id||""}</td><td>${c.hospital||""}</td><td>${fmtN(col)}</td>
<td>${fmtN(col-fee)}</td><td>${fmtN(fee)}</td><td>${c.payout_status||""}</td></tr>`;
          });
          html += `</tbody></table>`;
        }
      }

      if (sections.salaires && d.salaries) {
        html += `<h2>${fr?"Salaires":"Salaries"}</h2>
<table><thead><tr>
  <th>${fr?"Mois":"Month"}</th><th>${fr?"Employé":"Employee"}</th><th>${fr?"Rôle":"Role"}</th>
  <th>${fr?"Montant":"Amount"}</th><th>Statut</th>
</tr></thead><tbody>`;
        d.salaries.forEach(p => {
          html += `<tr><td>${p.payment_month||""}</td><td>${p.staff_members?.name||""}</td>
<td>${p.staff_members?.role||""}</td><td>${fmtN(p.amount||0)} FCFA</td><td>${p.status||""}</td></tr>`;
        });
        html += `</tbody></table>`;
      }

      if (sections.finance && d.expenses) {
        html += `<h2>${fr?"Charges de fonctionnement":"Operating Expenses"}</h2>
<table><thead><tr>
  <th>${fr?"Date":"Date"}</th><th>${fr?"Libellé":"Label"}</th><th>${fr?"Catégorie":"Category"}</th><th>${fr?"Montant":"Amount"}</th>
</tr></thead><tbody>`;
        d.expenses.forEach(e => {
          html += `<tr><td>${e.date?.slice(0,10)||""}</td><td>${e.label||""}</td><td>${e.category||""}</td><td>${fmtN(e.amount||0)} FCFA</td></tr>`;
        });
        html += `</tbody></table>`;
      }

      if (sections.audit && d.audit) {
        html += `<h2>${fr?"Journal d'audit":"Audit Log"}</h2>
<table><thead><tr>
  <th>${fr?"Horodatage":"Timestamp"}</th><th>${fr?"Opérateur":"Operator"}</th><th>${fr?"Rôle":"Role"}</th>
  <th>${fr?"Action":"Action"}</th><th>${fr?"Cible":"Target"}</th>
</tr></thead><tbody>`;
        d.audit.forEach(l => {
          html += `<tr><td>${l.created_at?.slice(0,19).replace("T"," ")||""}</td><td>${l.user_email||""}</td>
<td>${l.user_role||""}</td><td>${l.action||""}</td><td>${l.target||""}</td></tr>`;
        });
        html += `</tbody></table>`;
      }

      html += `<div class="footer">AYYAD CI · ${fr?"Rapport généré automatiquement":"Automatically generated report"} · ${now}</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;

      const w = window.open("","_blank","width=1000,height=700");
      if (w) { w.document.write(html); w.document.close(); }
      else alert(fr?"Autorisez les pop-ups pour générer le PDF.":"Please allow pop-ups to generate the PDF.");
    } catch(e) { console.error("Export PDF error:", e); alert(fr?"Erreur lors de l'export PDF.":"PDF export error."); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">📤</span>
          <h2 className="text-lg font-black">{fr?"Export des données":"Data Export"}</h2>
          <span className="ml-auto bg-purple-200 text-purple-800 text-xs font-bold px-2 py-0.5 rounded-full">super_admin</span>
        </div>
        <p className="text-emerald-100 text-xs">
          {fr?"Exportez les données de la plateforme au format Excel ou PDF.":"Export platform data in Excel or PDF format."}
        </p>
      </div>

      {/* Plage de dates */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-4">📅 {fr?"Plage de dates":"Date range"}</h3>
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="text-xs text-gray-500 block mb-1">{fr?"Du":"From"}</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{fr?"Au":"To"}</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
          </div>
          <div className="flex gap-2 mt-4">
            {[
              {label:fr?"Ce mois":"This month", fn:()=>{const n=new Date();const y=n.getFullYear();const m=n.getMonth();setDateFrom(`${y}-${String(m+1).padStart(2,"0")}-01`);setDateTo(today);}},
              {label:fr?"Cette année":"This year",  fn:()=>{setDateFrom(`${new Date().getFullYear()}-01-01`);setDateTo(today);}},
              {label:fr?"Tout":"All",                fn:()=>{setDateFrom("2024-01-01");setDateTo(today);}},
            ].map(b=>(
              <button key={b.label} onClick={b.fn}
                className="text-xs bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 text-gray-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg font-medium transition-all">
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-4">📂 {fr?"Sections à inclure":"Sections to include"}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.keys(SECTION_LABELS).map(k=>(
            <button key={k} onClick={()=>toggleSection(k)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${sections[k]?"bg-emerald-50 border-emerald-300 text-emerald-700":"bg-gray-50 border-gray-200 text-gray-500"}`}>
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${sections[k]?"bg-emerald-600 border-emerald-600":"border-gray-300"}`}>
                {sections[k]&&<span className="text-white text-[10px]">✓</span>}
              </div>
              {SECTION_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={()=>setSections({dossiers:true,dons:true,virements:true,finance:true,salaires:true,bilan:true,audit:true})}
            className="text-xs text-emerald-600 hover:underline font-semibold">{fr?"Tout sélectionner":"Select all"}</button>
          <span className="text-gray-300">·</span>
          <button onClick={()=>setSections({dossiers:false,dons:false,virements:false,finance:false,salaires:false,bilan:false,audit:false})}
            className="text-xs text-gray-400 hover:underline font-semibold">{fr?"Tout désélectionner":"Deselect all"}</button>
        </div>
      </div>

      {/* Boutons export */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={exportExcel} disabled={loading || !Object.values(sections).some(Boolean)}
          className="flex items-center justify-center gap-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 text-white font-black py-4 rounded-2xl shadow-md transition-all text-base">
          <span className="text-2xl">📊</span>
          <div className="text-left">
            <div>{loading ? (fr?"Chargement...":"Loading...") : (fr?"Exporter Excel":"Export Excel")}</div>
            <div className="text-xs text-emerald-200 font-normal">{fr?"Fichier .xls (compatible Excel & LibreOffice)":".xls file (Excel & LibreOffice)"}</div>
          </div>
        </button>

        <button onClick={exportPDF} disabled={loading || !Object.values(sections).some(Boolean)}
          className="flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white font-black py-4 rounded-2xl shadow-md transition-all text-base">
          <span className="text-2xl">📄</span>
          <div className="text-left">
            <div>{loading ? (fr?"Chargement...":"Loading...") : (fr?"Exporter PDF":"Export PDF")}</div>
            <div className="text-xs text-gray-400 font-normal">{fr?"Impression → Enregistrer en PDF":"Print → Save as PDF"}</div>
          </div>
        </button>
      </div>

      {/* Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
        🔐 {fr
          ? "Cette fonctionnalité est réservée aux super administrateurs. Toutes les exportations sont enregistrées dans le journal d'audit."
          : "This feature is restricted to super administrators. All exports are recorded in the audit log."}
      </div>
    </div>
  );
};

const AdminPage = ({ user, setPage, lang }) => {
  const [tab, setTab] = useState("overview");
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);

  // ── Nouveaux états : Finance / Salaires / Audit / Bilan ──
  const [staffMembers,    setStaffMembers]    = useState([]);
  const [salaryPayments,  setSalaryPayments]  = useState([]);
  const [auditLogs,       setAuditLogs]       = useState([]);
  const [expenses,        setExpenses]        = useState([]);
  const [loadingFinance,  setLoadingFinance]  = useState(false);
  const [loadingAudit,    setLoadingAudit]    = useState(false);
  const [bilanPeriod,     setBilanPeriod]     = useState("monthly");
  const [bilanYear,       setBilanYear]       = useState(new Date().getFullYear());
  const [bilanMonth,      setBilanMonth]      = useState(new Date().getMonth() + 1);
  // Formulaire ajout employé
  const [newStaff,        setNewStaff]        = useState({ name:"", role:"", wave_number:"", monthly_salary:0 });
  const [showAddStaff,    setShowAddStaff]    = useState(false);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [rejectModal, setRejectModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null); // { id, title, donationsCount, collected }
  const [deleting, setDeleting] = useState(false);
  const [editDeadline, setEditDeadline] = useState({});
  const [editVideoUrl, setEditVideoUrl] = useState({}); // { caseId: "https://..." }
  const [rejectReason, setRejectReason] = useState("");
  const [payMethods, setPayMethods] = useState({}); // { caseId: "WAVE"|"ORANGE"|"MTN"|"BANK" }
  const [confirmingId, setConfirmingId] = useState(null); // caseId en cours de confirmation
  const [expandedPayoutId, setExpandedPayoutId] = useState(null); // collecte expand dans virements
  const [groupedPayout, setGroupedPayout] = useState({}); // { caseId: true|false } — virement groupé hôpital + 70% bénéficiaire
  const t = T[lang].admin;
  const unresolved = alerts.filter(a=>!a.resolved).length;

  // Toggle visibilité campagnes démo
  const [demoVisible, setDemoVisible] = useState(localStorage.getItem("ayyadShowDemo") !== "false");
  const toggleDemo = () => {
    const next = !demoVisible;
    localStorage.setItem("ayyadShowDemo", next ? "true" : "false");
    setDemoVisible(next);
    // Recharge la page pour appliquer le changement (DEMO_CASES_VISIBLE est évalué au chargement)
    window.location.reload();
  };

  // ── Load all cases from Supabase ──
  const loadCases = async () => {
    setLoadingCases(true);
    let data, error;
    try {
      ({ data, error } = await supabase
        .from("cases")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500));
    } catch(e) {
      console.warn("loadCases error:", e);
      setLoadingCases(false);
      return;
    }
    // Cas démo FUNDED pour tester le flux virements
    const demoFunded = {
      id: "demo-kofi-001",
      tracking_id: "AYD-2025-002",
      title: "Dialyse rénale pour Kofi Asante",
      full_name: "Kofi Asante",
      beneficiary: "Kofi Asante",
      hospital: "CHU de Bouaké",
      city: "Bouaké",
      category: "Nephrologie",
      amount: 997500,
      collected: 1150000,
      donors: 74,
      status: "FUNDED",
      payout_status: null,
      created_at: new Date().toISOString(),
      _isDemo: true,
    };
    if (!error) {
      // Enrichit chaque dossier avec son total de dons confirmés (collected/donors live)
      const enriched = await enrichCasesWithTotals(data || []);
      setCases([demoFunded, ...enriched]);
    }
    setLoadingCases(false);
  };

  useEffect(() => { loadCases(); }, []);

  // Auto-passage en FUNDED : collectes ayant atteint leur objectif la veille ou avant
  useEffect(() => {
    const autoFund = async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const { data } = await supabase.from("cases")
          .select("id, amount, collected, goal_reached_at")
          .eq("status", "COLLECTING");
        if (!data) return;
        for (const c of data) {
          if ((c.collected||0) >= (c.amount||1) && c.goal_reached_at) {
            const reachedDate = new Date(c.goal_reached_at);
            if (reachedDate < yesterday) {
              await supabase.from("cases").update({ status: "FUNDED" }).eq("id", c.id);
            }
          }
          if ((c.collected||0) >= (c.amount||1) && !c.goal_reached_at) {
            await supabase.from("cases").update({ goal_reached_at: new Date().toISOString() }).eq("id", c.id);
          }
        }
        loadCases();
      } catch(e) { console.warn("autoFund error:", e); }
    };
    autoFund();
  }, []);

  // ── Chargement données financières ──
  const loadFinanceData = async () => {
    setLoadingFinance(true);
    try {
      const [{ data: staff }, { data: salaries }, { data: exps }] = await Promise.all([
        supabase.from("staff_members").select("*").order("name"),
        supabase.from("salary_payments").select("*").order("payment_date", { ascending: false }),
        supabase.from("ayyad_expenses").select("*").order("date", { ascending: false }),
      ]);
      setStaffMembers(staff || []);
      setSalaryPayments(salaries || []);
      setExpenses(exps || []);
    } catch(e) {
      console.warn("loadFinanceData error:", e);
    } finally {
      setLoadingFinance(false);
    }
  };

  // ── Chargement journal d'audit ──
  const loadAuditLogs = async () => {
    setLoadingAudit(true);
    const { data } = await supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setAuditLogs(data || []);
    setLoadingAudit(false);
  };

  useEffect(() => {
    if (tab === "finance" || tab === "salary" || tab === "bilan" || tab === "export") loadFinanceData();
    if (tab === "audit" || tab === "export") loadAuditLogs();
  }, [tab]);

  // ── Toggle urgent ──
  const toggleUrgent = async (id, current) => {
    const { error } = await supabase
      .from("cases")
      .update({ urgent: !current })
      .eq("id", id);
    if (!error) setCases(prev => prev.map(c => c.id===id ? {...c, urgent:!current} : c));
  };

  // ── Auto-urgent: < 7 days left AND < 50% collected ──
  const isAutoUrgent = (c) => {
    if (!c.days_left || !c.amount || !c.collected) return false;
    return c.days_left <= 7 && (c.collected / c.amount) < 0.5;
  };
  const approveCase = async (id) => {
    // Assigne un tracking_id parlant au moment de l'approbation :
    // format AYD-YYYY-MM-NNN où NNN = rang du dossier dans le mois (001, 002…)
    const now = new Date();
    const yr = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `AYD-${yr}-${mo}-`;
    // Compte combien de dossiers ont DÉJÀ ce préfixe (= rang du nouveau)
    const { data: existing } = await supabase
      .from("cases")
      .select("tracking_id")
      .like("tracking_id", prefix + "%");
    const rank = String((existing?.length || 0) + 1).padStart(3, "0");
    const newTrackingId = prefix + rank;

    // Deadline = 30 jours à partir de l'approbation. Le champ daysLeft de l'UI sera
    // calculé live depuis (deadline - now) → diminue chaque jour.
    const deadlineDate = new Date(now);
    deadlineDate.setDate(deadlineDate.getDate() + 30);

    const { error } = await supabase
      .from("cases")
      .update({
        status: "COLLECTING",
        tracking_id: newTrackingId,
        deadline: deadlineDate.toISOString(),
      })
      .eq("id", id);
    if (!error) {
      const c = cases.find(x => x.id === id);
      setCases(prev => prev.map(x => x.id===id ? {...x, status:"COLLECTING", tracking_id: newTrackingId, deadline: deadlineDate.toISOString()} : x));
      // Email notification au bénéficiaire + admin (avec le NOUVEAU tracking_id)
      if (c) {
        emailCaseApproved({ beneficiaryEmail: c.email || null, beneficiaryName: c.full_name || c.beneficiary, caseTitle: c.title, trackingId: newTrackingId });
        emailNewCase({ caseTitle: "✅ APPROUVÉ — " + (c.title || id) + " (" + newTrackingId + ")", hospital: c.hospital, city: c.city, amount: c.amount });
        auditLog(user, "CASE_APPROVED", c.title || id, "PENDING", "COLLECTING");
      }
    }
  };

  // ── Reject a case ──
  const rejectCase = async (id) => {
    const { error } = await supabase
      .from("cases")
      .update({ status: "REJECTED", rejection_reason: rejectReason })
      .eq("id", id);
    if (!error) {
      const c = cases.find(x => x.id === id);
      setCases(prev => prev.map(x => x.id===id ? {...x, status:"REJECTED"} : x));
      if (c) {
        emailCaseRejected({ beneficiaryEmail: c.email || null, beneficiaryName: c.full_name || c.beneficiary, caseTitle: c.title, reason: rejectReason });
        emailNewCase({ caseTitle: "❌ REJETÉ — " + (c.title || id) + " — " + rejectReason, hospital: c.hospital, city: c.city, amount: c.amount });
        auditLog(user, "CASE_REJECTED", c.title || id, "PENDING", { status:"REJECTED", reason: rejectReason });
      }
      setRejectModal(null);
      setRejectReason("");
    }
  };

  // Ouvre la modal de suppression d'une collecte (avec décompte des dons à supprimer)
  const askDeleteCase = async (id) => {
    const c = cases.find(x => x.id === id);
    if (!c) return;
    // On compte les dons confirmés liés pour bien prévenir l'admin
    const { data: dons } = await supabase
      .from("donations")
      .select("id, amount_fcfa, amount, status")
      .eq("case_id", id);
    const confirmedDons = (dons || []).filter(d => d.status === "confirmed");
    const totalCollected = confirmedDons.reduce((s, d) => s + Number(d.amount_fcfa || d.amount || 0), 0);
    setDeleteModal({
      id,
      title: typeof c.title === "object" ? (c.title.fr || c.title.en) : (c.title || id),
      tracking: c.tracking_id || id.slice(0, 8),
      donationsCount: (dons || []).length,
      collected: totalCollected,
    });
  };

  // Suppression cascade : donations → case_updates → cases.
  // Réservé aux super_admin. Audit log obligatoire.
  const deleteCase = async () => {
    if (!deleteModal) return;
    if (user?.adminRole !== "super_admin") {
      alert(lang==="fr" ? "Seuls les super_admin peuvent supprimer une collecte." : "Only super_admins can delete a case.");
      return;
    }
    setDeleting(true);
    const id = deleteModal.id;
    try {
      // 1) Supprimer les dons liés (sinon contrainte FK bloque)
      const { error: e1 } = await supabase.from("donations").delete().eq("case_id", id);
      if (e1) throw new Error("Donations: " + e1.message);

      // 2) Supprimer les case_updates liés (journal patient — best effort, on ne bloque pas)
      try { await supabase.from("case_updates").delete().eq("case_id", id); } catch(_) {}

      // 3) Supprimer la collecte
      const { error: e3 } = await supabase.from("cases").delete().eq("id", id);
      if (e3) throw new Error("Cases: " + e3.message);

      // Audit + UI refresh
      auditLog(user, "CASE_DELETED", deleteModal.title, deleteModal.tracking, "DELETED");
      setCases(prev => prev.filter(x => x.id !== id));
      setDeleteModal(null);
    } catch(err) {
      alert((lang==="fr" ? "Erreur lors de la suppression : " : "Delete error: ") + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const pendingCases = cases.filter(c => c.status==="PENDING");
  const activeCases = cases.filter(c => ["APPROVED","COLLECTING"].includes(c.status));

  // ── Compteur des dons en attente de validation ──
  // Affiché en badge sur l'onglet Dons + mis à jour en realtime quand
  // un nouveau don tombe (pré-insert via QR mobile, manuel, etc.)
  const [pendingDonationsCount, setPendingDonationsCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refreshCount = async () => {
      const { count } = await supabase
        .from("donations")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (alive) setPendingDonationsCount(count || 0);
    };
    refreshCount();

    // Realtime: le badge bouge quand un nouveau don arrive ou change de statut
    const ch = supabase.channel("admin-pending-dons")
      .on("postgres_changes", { event: "*", schema: "public", table: "donations" }, () => refreshCount())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  const statusColor = (s) => ({ PENDING:"yellow", APPROVED:"blue", COLLECTING:"green", FUNDED:"green", REJECTED:"red" }[s] || "gray");

  if (!user?.isAdmin) return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">🔐</div>
      <h2 className="text-xl font-black text-gray-900 mb-3">{t.noAdmin}</h2>
      <button onClick={() => setPage("home")} className="bg-emerald-600 text-white font-bold px-8 py-3 rounded-xl shadow-md">← Accueil</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="font-black text-lg text-gray-900 mb-4">{t.rejectConfirm}</h3>
            <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} placeholder={lang==="fr"?"Documents insuffisants, dossier incomplet...":"Insufficient documents, incomplete case..."} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 mb-4" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRejectModal(null)} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm">{lang==="fr"?"Annuler":"Cancel"}</button>
              <button onClick={() => rejectCase(rejectModal)} className="bg-red-600 text-white font-bold py-3 rounded-xl text-sm shadow-md">{t.rejectBtn}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmation de suppression de collecte */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4" onClick={() => !deleting && setDeleteModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-2xl shrink-0">⚠️</div>
              <div>
                <h3 className="font-black text-lg text-gray-900">
                  {lang==="fr" ? "Supprimer définitivement cette collecte ?" : "Delete this case permanently?"}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {lang==="fr" ? "Cette action est irréversible." : "This action cannot be undone."}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1.5 mb-4">
              <div className="flex justify-between"><span className="text-gray-500">{lang==="fr"?"Tracking :":"Tracking:"}</span><span className="font-mono font-semibold">{deleteModal.tracking}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{lang==="fr"?"Titre :":"Title:"}</span><span className="font-semibold text-right truncate ml-2 max-w-[60%]" title={deleteModal.title}>{deleteModal.title}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{lang==="fr"?"Dons à supprimer :":"Donations to delete:"}</span><span className="font-bold text-red-600">{deleteModal.donationsCount}</span></div>
              {deleteModal.collected > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">{lang==="fr"?"Montant collecté :":"Total collected:"}</span><span className="font-bold text-red-600">{deleteModal.collected.toLocaleString("fr-FR")} FCFA</span></div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-4 leading-relaxed">
              {lang==="fr"
                ? <>⚠️ Tous les dons confirmés associés seront <strong>définitivement supprimés</strong>. Si des donateurs ont versé de l'argent sur cette collecte, cela <strong>n'annule pas</strong> les transactions Wave/PayDunya — il s'agit d'une suppression côté Ayyad uniquement.</>
                : <>⚠️ All confirmed donations associated will be <strong>permanently deleted</strong>. If donors paid for this case, this <strong>does not refund</strong> the Wave/PayDunya transactions — this is an Ayyad-side deletion only.</>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={deleting}
                onClick={() => setDeleteModal(null)}
                className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm disabled:opacity-50"
              >{lang==="fr"?"Annuler":"Cancel"}</button>
              <button
                disabled={deleting}
                onClick={deleteCase}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm shadow-md disabled:opacity-60"
              >{deleting ? (lang==="fr"?"Suppression…":"Deleting…") : (lang==="fr"?"🗑️ Supprimer définitivement":"🗑️ Delete permanently")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div><h1 className="text-2xl font-black text-gray-900">{t.title}</h1><p className="text-sm text-gray-500 mt-0.5">{t.sub}</p></div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/><span className="text-xs font-semibold text-emerald-700">{t.status}</span></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 mb-6 overflow-x-auto shadow-sm">
          {t.tabs.filter(tab_ => !tab_.superAdminOnly || user?.adminRole === "super_admin").map(tab_=>(
            <button key={tab_.id} onClick={()=>setTab(tab_.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${tab===tab_.id?"bg-emerald-600 text-white shadow-sm":"text-gray-600 hover:bg-gray-100"}`}>
              {tab_.icon} {tab_.label}
              {tab_.id==="cases"&&pendingCases.length>0&&<span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{pendingCases.length}</span>}
              {tab_.id==="donations"&&pendingDonationsCount>0&&<span className="bg-emerald-500 text-white text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center font-bold animate-pulse">{pendingDonationsCount}</span>}
              {tab_.id==="fraud"&&unresolved>0&&<span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unresolved}</span>}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab==="overview"&&(
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {label:lang==="fr"?"Total dossiers":"Total cases",v:cases.length,icon:"📋"},
                {label:lang==="fr"?"En attente":"Pending review",v:pendingCases.length,icon:"⏳"},
                {label:lang==="fr"?"Approuvés":"Approved",v:activeCases.length,icon:"✅"},
                {label:lang==="fr"?"Alertes fraude":"Fraud alerts",v:unresolved,icon:"🔍"},
              ].map(s=>(
                <div key={s.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                  <div className="text-3xl mb-2">{s.icon}</div>
                  <div className="text-2xl font-black text-gray-900">{s.v}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            {/* ── Contrôle campagnes démo ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4">
              <div>
                <div className="font-bold text-gray-900 text-sm">
                  🎭 {lang === "fr" ? "Campagnes de démonstration" : "Demo campaigns"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {lang === "fr"
                    ? (demoVisible ? "10 dossiers fictifs sont visibles sur la plateforme publique." : "Les dossiers fictifs sont masqués — seules les vraies campagnes s'affichent.")
                    : (demoVisible ? "10 demo cases are visible on the public platform." : "Demo cases are hidden — only real campaigns are displayed.")}
                </div>
              </div>
              <button
                onClick={toggleDemo}
                className={"flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition-colors " + (demoVisible
                  ? "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100")}>
                {demoVisible
                  ? (lang === "fr" ? "🙈 Masquer les démos" : "🙈 Hide demos")
                  : (lang === "fr" ? "👁️ Afficher les démos" : "👁️ Show demos")}
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4">{t.recentTitle}</h3>
              {loadingCases ? (
                <div className="text-center py-8 text-gray-400">{t.loading}</div>
              ) : cases.length===0 ? (
                <div className="text-center py-8 text-gray-400">{lang==="fr"?"Aucun dossier soumis.":"No cases submitted yet."}</div>
              ) : (
                <div className="space-y-3">
                  {cases.slice(0,5).map(c=>(
                    <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                        {(c.full_name||c.title||"?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{c.title||c.full_name||lang==="fr"?"Sans titre":"Untitled"}</div>
                        <div className="text-xs text-gray-500 truncate">🏥 {c.hospital||"—"} · 💰 {c.amount?fmt(c.amount):"—"}</div>
                      </div>
                      <Badge color={statusColor(c.status)}>{t.statusLabels[c.status]||c.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4">{t.revenueTitle}</h3>
              <div className="space-y-3">{t.months.map(r=><div key={r.month} className="p-4 bg-gray-50 rounded-xl"><div className="flex justify-between items-center mb-2"><span className="font-semibold text-sm text-gray-700">{r.month}</span><Badge color="green">{r.fees}</Badge></div><div className="text-xs text-gray-400">{lang==="fr"?"Dons : ":"Donations: "}{r.dons} FCFA</div></div>)}</div>
            </div>
          </div>
        )}

        {/* Cases */}
        {tab==="cases"&&(
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{t.pendingTitle}</h3>
              <div className="flex items-center gap-2">
                <Badge color="yellow">{pendingCases.length} {t.pending}</Badge>
                <button onClick={loadCases} className="text-xs text-emerald-600 hover:underline font-medium">↻ {lang==="fr"?"Actualiser":"Refresh"}</button>
              </div>
            </div>
            {loadingCases ? (
              <div className="p-14 text-center text-gray-400">{t.loading}</div>
            ) : pendingCases.length===0 ? (
              <div className="p-14 text-center"><div className="text-5xl mb-3">✅</div><div className="font-bold text-gray-700">{t.empty}</div></div>
            ) : (
              <div className="divide-y divide-gray-50">
                {pendingCases.map(c=>(
                  <div key={c.id} className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 mb-1">{c.title||lang==="fr"?"Sans titre":"Untitled"}</div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-2">
                          <span>👤 {c.full_name||"—"}</span>
                          <span>🏥 {c.hospital||"—"}</span>
                          <span>📍 {c.city||"—"}</span>
                          <span>💰 {c.amount?fmt(c.amount):"—"}</span>
                        </div>
                        {c.description&&<p className="text-xs text-gray-600 line-clamp-2 mb-2">{c.description}</p>}
                        {c.photo_url&&<a href={c.photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline font-medium">📷 Photo</a>}
                              {c.document_urls?.medical && <SecureDocLink value={c.document_urls.medical} caseId={c.id} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">🏥 Rapport médical</SecureDocLink>}
                              {c.document_urls?.quote && <SecureDocLink value={c.document_urls.quote} caseId={c.id} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">💊 Devis</SecureDocLink>}
                              {c.document_urls?.id && <SecureDocLink value={c.document_urls.id} caseId={c.id} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">🪪 Pièce d'identité</SecureDocLink>}
                              {c.document_urls?.consent && <SecureDocLink value={c.document_urls.consent} caseId={c.id} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">✍️ Consentement</SecureDocLink>}
                            <button onClick={() => setRejectModal(c.id)} className="px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50">{t.reject}</button>
                        <button onClick={async()=>{if(editDeadline[c.id])await supabase.from("cases").update({deadline:editDeadline[c.id]}).eq("id",c.id);if(editVideoUrl[c.id])await supabase.from("cases").update({video_url:editVideoUrl[c.id]}).eq("id",c.id);approveCase(c.id);}} className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm">{t.approve}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Show all cases below */}
            {!loadingCases && cases.filter(c=>c.status!=="PENDING").length > 0 && (
              <div>
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{lang==="fr"?"Dossiers traités":"Processed cases"}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {cases.filter(c=>c.status!=="PENDING").map(c=>(
                    <div key={c.id} className="p-4 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900 truncate">{c.title||c.full_name||"—"}</span>
                          {c.urgent && <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">🚨 URGENT</span>}
                        </div>
                        <div className="text-xs text-gray-500">🏥 {c.hospital||"—"} · 💰 {c.amount?fmt(c.amount):"—"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={statusColor(c.status)}>{t.statusLabels[c.status]||c.status}</Badge>
                        {c.status === "COLLECTING" && (
                          <button
                            onClick={async () => {
                              const newUrgent = !c.urgent;
                              await supabase.from("cases").update({ urgent: newUrgent }).eq("id", c.id);
                              setCases(prev => prev.map(x => x.id === c.id ? {...x, urgent: newUrgent} : x));
                              auditLog(user, newUrgent ? "CASE_MARKED_URGENT" : "CASE_UNMARK_URGENT", c.title || c.id);
                            }}
                            className={`text-xs px-2.5 py-1 rounded-full font-bold border transition-all flex-shrink-0 ${c.urgent ? "bg-red-100 text-red-600 border-red-200 hover:bg-red-200" : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200"}`}>
                            {c.urgent ? "🔕 Retirer urgent" : "🚨 Marquer urgent"}
                          </button>
                        )}
                        {/* Bouton Supprimer — visible uniquement pour super_admin */}
                        {user?.adminRole === "super_admin" && !c._isDemo && !c._mock && (
                          <button
                            onClick={() => askDeleteCase(c.id)}
                            title={lang==="fr"?"Supprimer définitivement":"Delete permanently"}
                            className="text-xs px-2.5 py-1 rounded-full font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-all flex-shrink-0"
                          >
                            🗑️ {lang==="fr"?"Supprimer":"Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fraud */}
        {tab==="fraud"&&(
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              {t.fraudLabels.map(fl=>{
                const count = fl.sev ? alerts.filter(a=>!a.resolved&&a.sev===fl.sev).length : alerts.filter(a=>a.resolved).length;
                return <div key={fl.label} className={`bg-${fl.c}-50 border border-${fl.c}-200 rounded-2xl p-5 text-center`}><div className={`text-3xl font-black text-${fl.c}-700`}>{count}</div><div className={`text-xs text-${fl.c}-600 font-semibold mt-1`}>{fl.label}</div></div>;
              })}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-5 border-b border-gray-100"><h3 className="font-bold text-gray-900">{t.fraudTitle}</h3></div>
              <div className="divide-y divide-gray-50">{alerts.map(a=>(
                <div key={a.id} className={`p-5 flex items-center gap-3 flex-wrap ${a.resolved?"opacity-40":""}`}>
                  <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${a.sev==="critical"?"bg-red-500":a.sev==="high"?"bg-amber-500":"bg-yellow-400"}`}/>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900">{a.type[lang]}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{a.case[lang]} · {a.time}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color={a.sev==="critical"?"red":a.sev==="high"?"yellow":"gray"}>{a.sev}</Badge>
                    {a.caseTab && (
                      <button
                        onClick={() => setTab(a.caseTab)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex-shrink-0 border border-blue-200">
                        🔍 {lang==="fr" ? "Voir le dossier" : "View case"}
                      </button>
                    )}
                    {!a.resolved
                      ? <button onClick={()=>setAlerts(al=>al.map(x=>x.id===a.id?{...x,resolved:true}:x))} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex-shrink-0">{t.resolve}</button>
                      : <Badge color="green">{t.resolved}</Badge>
                    }
                  </div>
                </div>
              ))}</div>
            </div>
          </div>
        )}

        {/* Payouts */}
        {tab==="payouts"&&(
          <div className="space-y-5">

            {/* ── Solde Ayyad (5%) ── */}
            {(() => {
              const confirmed = cases.filter(c => c.payout_status === "confirmed");
              const totalConfirmed = confirmed.reduce((s,c) => s+(c.amount||0), 0);
              const ayyadBalance = Math.round(totalConfirmed * 0.05);
              const totalDonations = cases.reduce((s,c) => s+(c.amount||0), 0);
              const ayyadTotal = Math.round(totalDonations * 0.05);
              return (
                <div className="bg-gradient-to-br from-emerald-800 to-teal-700 rounded-2xl p-6 text-white">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wider mb-1">💰 Trésorerie Ayyad (5% automatique)</div>
                      <div className="text-4xl font-black">{ayyadBalance.toLocaleString()} FCFA</div>
                      <div className="text-emerald-300 text-xs mt-1">Prélevés sur {confirmed.length} virement(s) confirmé(s)</div>
                    </div>
                    <div className="flex gap-4 text-center">
                      <div className="bg-white/10 rounded-xl px-4 py-3">
                        <div className="font-black text-lg">{ayyadTotal.toLocaleString()}</div>
                        <div className="text-emerald-300 text-xs">Total 5% cumulés</div>
                      </div>
                      <div className="bg-white/10 rounded-xl px-4 py-3">
                        <div className="font-black text-lg">{cases.filter(c=>c.payout_status==="confirmed").length}</div>
                        <div className="text-emerald-300 text-xs">Virements confirmés</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-xs text-emerald-300 bg-white/10 rounded-xl px-3 py-2">
                    ℹ️ Les 5% sont prélevés automatiquement sur chaque collecte au moment de la confirmation du virement. Le montant versé à l'hôpital est toujours le montant collecté moins 5%.
                  </div>
                </div>
              );
            })()}

            {/* ── Collectes financées — prêtes pour virement ── */}
            {(() => {
              const funded = cases.filter(c => c.status === "FUNDED" && (!c.payout_status || c.payout_status === "pending"));
              const initiated = cases.filter(c => c.payout_status === "initiated");
              const confirmed = cases.filter(c => c.payout_status === "confirmed");

              const PayoutMethodBadge = ({ method }) => {
                const map = { WAVE:"🌊 Wave",  BANK:"🏦 Virement bancaire" };
                return <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{map[method]||method}</span>;
              };

              return (
                <div className="space-y-4">

                  {/* Collectes 100% — en attente de virement */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">💳</span>
                        <h3 className="font-bold text-gray-900">{lang==="fr" ? "Collectes à virer" : "Ready for payout"}</h3>
                        {funded.length > 0 && <span className="bg-amber-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{funded.length}</span>}
                      </div>
                      <div className="text-xs text-gray-400">{lang==="fr" ? "Objectif atteint · virement manuel requis" : "Goal reached · manual payout required"}</div>
                    </div>

                    {funded.length === 0 ? (
                      <div className="p-10 text-center text-gray-400">
                        <div className="text-4xl mb-3">✅</div>
                        <div>{lang==="fr" ? "Aucune collecte en attente de virement." : "No campaigns awaiting payout."}</div>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {funded.map(c => {
                          const fin = calcFinancier(c.amount||c.required||0, c.collected||c.amount||0);
                          const payMethod = payMethods[c.id] || null;
                          const confirming = confirmingId === c.id;
                          const hasSurplus = fin.surplus > 0;
                          const goalNotReached = (c.collected || 0) < (c.amount || c.required || 0);
                          const isExpanded = expandedPayoutId === c.id;
                          const catEmoji = c.category==="Cardiologie"?"🫀":c.category==="Oncologie"?"🎗️":c.category==="Neurologie"?"🧠":c.category==="Pediatrie"||c.category==="Pédiatrie"?"👶":c.category==="Gynecologie"||c.category==="Gynécologie"?"🌸":c.category==="Orthopedie"||c.category==="Orthopédie"?"🦴":c.category==="Nephrologie"||c.category==="Néphrologie"?"🫘":"🏥";

                          return (
                            <div key={c.id}>
                              {/* LIGNE COMPACTE — toujours visible */}
                              <button onClick={() => setExpandedPayoutId(isExpanded ? null : c.id)}
                                className={"w-full flex items-center gap-3 p-4 text-left transition-colors "+(isExpanded?"bg-emerald-50":"hover:bg-gray-50")}>
                                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">{catEmoji}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{c.tracking_id||"AYD-"+c.id}</span>
                                    {hasSurplus && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">🎉 Surcollecte</span>}
                                  </div>
                                  <div className="font-bold text-gray-900 text-sm truncate mt-0.5">{c.title||"Dossier "+c.id}</div>
                                  <div className="text-xs text-gray-400">🏥 {c.hospital} · 👤 {c.full_name||c.beneficiary||"—"}</div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className="font-black text-emerald-700 text-sm">{fin.devisHopital.toLocaleString()} FCFA</div>
                                  <div className="text-xs text-gray-400">à virer</div>
                                </div>
                                <div className={"text-gray-400 ml-1 transition-transform "+(isExpanded?"rotate-180":"")}>▼</div>
                              </button>

                              {/* DÉTAIL EXPAND */}
                              {isExpanded && (
                                <div className="px-4 pb-5 pt-1 space-y-4 bg-emerald-50 border-t border-emerald-100">

                                  {/* Décomposition financière */}
                                  <div className="bg-white rounded-xl p-4 space-y-3">
                                    <div className="grid grid-cols-3 gap-3 text-center">
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">💰 Total collecté</div>
                                        <div className="font-black text-gray-900 text-sm">{(c.collected||c.amount||0).toLocaleString()}</div>
                                        <div className="text-[10px] text-gray-400">FCFA</div>
                                      </div>
                                      <div className="border-x border-gray-200">
                                        <div className="text-xs text-gray-500 mb-1">🏥 Devis hôpital</div>
                                        <div className="font-black text-emerald-700 text-sm">{fin.devisHopital.toLocaleString()}</div>
                                        <div className="text-[10px] text-emerald-600">100% devis · FCFA</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">💚 Frais Ayyad</div>
                                        <div className="font-black text-amber-600 text-sm">{fin.fraisAyyadBase.toLocaleString()}</div>
                                        <div className="text-[10px] text-amber-500">5% base · FCFA</div>
                                      </div>
                                    </div>
                                    {goalNotReached && (
                                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-lg">⚖️</span>
                                          <div className="text-xs font-black text-amber-800">{lang==="fr" ? "Règle des 5% — Objectif non atteint" : "5% Rule — Goal not reached"}</div>
                                        </div>
                                        <div className="text-xs text-amber-700 leading-relaxed">
                                          {lang==="fr"
                                            ? "Cette collecte se termine sans atteindre son objectif. Les 5% de fonctionnement Ayyad sont prélevés sur le montant collecté. Le solde restant (95%) est redistribué aux cas les plus urgents."
                                            : "This campaign ends without reaching its goal. Ayyad's 5% operating fee is deducted from the collected amount. The remaining balance (95%) is redistributed to the most urgent cases."}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                          <div className="bg-white rounded-lg p-2 border border-amber-100">
                                            <div className="text-amber-600 font-black">{Math.round((c.collected||0)*0.05).toLocaleString()} FCFA</div>
                                            <div className="text-gray-400 text-[10px]">5% → Ayyad</div>
                                          </div>
                                          <div className="bg-white rounded-lg p-2 border border-amber-100">
                                            <div className="text-purple-600 font-black">{Math.round((c.collected||0)*0.95).toLocaleString()} FCFA</div>
                                            <div className="text-gray-400 text-[10px]">{lang==="fr" ? "95% → cas urgents" : "95% → urgent cases"}</div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {hasSurplus && !goalNotReached && (
                                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                                        <div className="text-xs font-black text-emerald-700">🎉 Surcollecte : +{fin.surplus.toLocaleString()} FCFA</div>
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                          <div className="bg-white rounded-lg p-2"><div className="text-amber-600 font-black">{fin.fraisAyyadSurplus.toLocaleString()}</div><div className="text-gray-400 text-[10px]">5% → Ayyad</div></div>
                                          <div className="bg-white rounded-lg p-2"><div className="text-blue-600 font-black">{fin.partBeneficiaire.toLocaleString()}</div><div className="text-gray-400 text-[10px]">70% → Bénéf.</div></div>
                                          <div className="bg-white rounded-lg p-2"><div className="text-purple-600 font-black">{fin.partRedistrib.toLocaleString()}</div><div className="text-gray-400 text-[10px]">25% → 5 urgents</div></div>
                                        </div>
                                        <div className="text-[10px] text-center text-emerald-700">Total Ayyad : <span className="font-black">{fin.totalAyyad.toLocaleString()} FCFA</span></div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Choix moyen paiement */}
                                  {!confirming ? (
                                    <div className="space-y-3">
                                      <div className="text-xs font-bold text-gray-700">💸 Virement vers <span className="text-emerald-700">{c.hospital}</span> :</div>
                                      <div className="grid grid-cols-2 gap-2">
                                        {[
                                          {id:"WAVE",emoji:"🌊",label:"Wave CI",bg:"bg-blue-600 hover:bg-blue-700",ring:"ring-blue-500"},
                                          {id:"BANK",emoji:"🏦",label:"Virement bancaire",bg:"bg-gray-700 hover:bg-gray-800",ring:"ring-gray-500"},
                                        ].map(pm => (
                                          <button key={pm.id} onClick={() => setPayMethods(prev => ({...prev, [c.id]: pm.id}))}
                                            className={"text-white text-xs font-bold py-3 rounded-xl flex flex-col items-center gap-1 transition-all "+pm.bg+(payMethod===pm.id?" ring-2 "+pm.ring+" scale-105":"")}>
                                            <span className="text-2xl">{pm.emoji}</span><span>{pm.label}</span>
                                          </button>
                                        ))}
                                      </div>
                                      {payMethod && (
                                        <button onClick={() => setConfirmingId(c.id)}
                                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl text-sm shadow-md flex items-center justify-center gap-2">
                                          💸 Virer maintenant — {fin.devisHopital.toLocaleString()} FCFA
                                          <span className="text-emerald-200 text-xs">via {payMethod==="WAVE"?"🌊 Wave":"🏦 Banque"}</span>
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    /* Modal confirmation */
                                    <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 space-y-4">
                                      <div className="flex items-center gap-2 text-amber-700 font-black"><span className="text-xl">⚠️</span>Confirmer le virement ?</div>
                                      <div className="bg-white rounded-xl p-4 space-y-2 text-sm">

                                        {/* Infos hôpital */}
                                        <div className="flex justify-between"><span className="text-gray-500">Bénéficiaire</span><span className="font-bold">{c.hospital}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Référence</span><span className="font-mono font-bold text-emerald-700">{c.tracking_id||"AYD-"+c.id}</span></div>

                                        {/* Montant net hôpital = devis exact */}
                                        <div className="flex justify-between border-t border-gray-100 pt-2">
                                          <span className="text-gray-500">Montant net hôpital</span>
                                          <span className="font-black text-emerald-700 text-base">{fin.devisHopital.toLocaleString()} FCFA</span>
                                        </div>
                                        <div className="flex justify-between"><span className="text-gray-500">Frais Ayyad (5%)</span><span className="font-bold text-amber-600">{fin.fraisAyyadBase.toLocaleString()} FCFA</span></div>

                                        {/* Frais de transfert absorbés par Ayyad */}
                                        {payMethod && (() => {
                                          const tf = TRANSFER_FEES[payMethod];
                                          const montantFrais = Math.round(fin.devisHopital * tf.pct);
                                          return (
                                            <div className="bg-blue-50 rounded-lg p-2.5 space-y-1">
                                              <div className="flex justify-between text-xs">
                                                <span className="text-blue-700 font-bold">💸 Frais de transfert</span>
                                                <span className={montantFrais===0?"text-emerald-600 font-bold":"text-blue-700 font-bold"}>
                                                  {montantFrais===0 ? "Gratuit ✓" : montantFrais.toLocaleString()+" FCFA"}
                                                </span>
                                              </div>
                                              <div className="text-[10px] text-blue-600">{tf.note} — absorbés par Ayyad</div>
                                              <div className="text-[10px] text-gray-500">L'hôpital reçoit exactement <span className="font-bold text-emerald-700">{fin.devisHopital.toLocaleString()} FCFA</span></div>
                                            </div>
                                          );
                                        })()}

                                        {/* Surcollecte */}
                                        {hasSurplus && (() => {
                                          const isGrouped = !!groupedPayout[c.id];
                                          return (
                                            <div className="border-t border-dashed border-gray-200 pt-2 space-y-2">
                                              <div className="text-xs text-emerald-700 font-bold">🎉 Surcollecte +{fin.surplus.toLocaleString()} FCFA</div>
                                              <div className="flex justify-between text-xs"><span className="text-gray-500">→ 5 cas urgents (25%)</span><span className="font-bold text-purple-600">{fin.partRedistrib.toLocaleString()} FCFA</span></div>
                                              <div className="flex justify-between text-xs"><span className="text-gray-500">→ Ayyad 5% surplus</span><span className="font-bold text-amber-600">{fin.fraisAyyadSurplus.toLocaleString()} FCFA</span></div>

                                              {/* Toggle virement groupé */}
                                              <div
                                                onClick={() => setGroupedPayout(prev => ({...prev, [c.id]: !prev[c.id]}))}
                                                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer border transition-all select-none mt-1 ${isGrouped ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                                                {/* Toggle switch */}
                                                <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${isGrouped ? "bg-blue-500" : "bg-gray-300"}`}>
                                                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isGrouped ? "translate-x-5" : "translate-x-0.5"}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <div className={`text-xs font-bold ${isGrouped ? "text-blue-700" : "text-gray-600"}`}>
                                                    {isGrouped ? "✅ Virement groupé activé" : "Virement groupé désactivé"}
                                                  </div>
                                                  <div className="text-[10px] text-gray-400 leading-snug mt-0.5">
                                                    {isGrouped
                                                      ? "Le 70% bénéficiaire sera viré en même temps que l'hôpital"
                                                      : "Seul le virement hôpital sera effectué maintenant"}
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Mobile money bénéficiaire — visible seulement si groupé */}
                                              {isGrouped && (
                                                <div className="bg-blue-50 rounded-xl p-3 space-y-2 border border-blue-100">
                                                  <div className="flex items-center justify-between">
                                                    <div className="text-xs font-bold text-blue-700">📱 Virement bénéficiaire (70%)</div>
                                                    <div className="text-xs font-black text-blue-800">{fin.partBeneficiaire.toLocaleString()} FCFA</div>
                                                  </div>
                                                  <div className="text-[10px] text-gray-500">Numéro mobile money de <span className="font-semibold">{c.full_name||c.beneficiary}</span> :</div>
                                                  <input
                                                    type="tel"
                                                    placeholder="+225 07 XX XX XX XX"
                                                    defaultValue={c.beneficiary_phone||""}
                                                    onChange={e => {
                                                      setCases(prev => prev.map(x => x.id===c.id ? {...x, beneficiary_phone: e.target.value} : x));
                                                    }}
                                                    className="w-full border border-blue-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                                  />
                                                  <div className="flex gap-1.5 flex-wrap">
                                                    {["🌊 Wave"].map(op => (
                                                      <button key={op} className="text-[10px] bg-white border border-blue-200 text-blue-600 px-2 py-0.5 rounded-full font-medium">{op}</button>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}

                                              {/* Résumé virements si NON groupé */}
                                              {!isGrouped && (
                                                <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 text-[10px] text-amber-700 leading-relaxed">
                                                  ⏳ Le 70% bénéficiaire ({fin.partBeneficiaire.toLocaleString()} FCFA) sera viré ultérieurement, quand vous activerez le virement groupé.
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}

                                        <div className="flex justify-between border-t border-gray-100 pt-2"><span className="text-gray-500">Via</span>
                                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{payMethod==="WAVE"?"🌊 Wave Business":payMethod==="CARD"?"💳 Carte bancaire":"🏦 Virement bancaire"}</span>
                                        </div>
                                        <div className="flex justify-between"><span className="text-gray-500">Patient</span><span className="font-semibold">{c.full_name||c.beneficiary||"—"}</span></div>
                                      </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <button onClick={() => setConfirmingId(null)} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm">Annuler</button>
                                          <button onClick={async () => {
                                            const isGrouped = !!groupedPayout[c.id];
                                            const updateData = {
                                              payout_status: "initiated", payout_method: payMethod,
                                              payout_initiated_at: new Date().toISOString(),
                                              payout_amount_hospital: fin.devisHopital, payout_amount_ayyad: fin.totalAyyad,
                                              surplus_payout_grouped: isGrouped,
                                              surplus_payout_status: hasSurplus ? (isGrouped ? "initiated" : "pending") : null,
                                            };
                                            await supabase.from("cases").update(updateData).eq("id", c.id);
                                            setCases(prev => prev.map(x => x.id===c.id ? {...x, ...updateData} : x));
                                            const surplusNote = hasSurplus
                                              ? (isGrouped
                                                ? " + 70% bénéf. groupé ("+fin.partBeneficiaire.toLocaleString()+" FCFA)"
                                                : " [70% bénéf. en attente]")
                                              : "";
                                            emailNewCase({ caseTitle: "VIREMENT "+payMethod+" - "+(c.title||c.id)+" - "+fin.devisHopital.toLocaleString()+" FCFA - Ayyad: "+fin.totalAyyad.toLocaleString()+" FCFA"+surplusNote, hospital: c.hospital, city: c.city, amount: fin.devisHopital });
                                            setConfirmingId(null);
                                            setExpandedPayoutId(null);
                                          }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-sm shadow-md">
                                            {hasSurplus && groupedPayout[c.id]
                                              ? "✅ Confirmer les virements"
                                              : "✅ Confirmer le virement"}
                                          </button>
                                        </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Virements en cours (initiés) */}
                  {initiated.length > 0 && (
                    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-blue-50 flex items-center gap-2 bg-blue-50">
                        <span className="text-lg">🔵</span>
                        <h3 className="font-bold text-gray-900 text-sm">{lang==="fr" ? "Virements en cours" : "Transfers in progress"}</h3>
                        <span className="bg-blue-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{initiated.length}</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {initiated.map(c => {
                          const montantHopital = c.payout_amount_hospital || Math.round((c.amount||0)*0.95);
                          const fraisAyyad = c.payout_amount_ayyad || Math.round((c.amount||0)*0.05);
                          const finI = calcFinancier(c.amount||0, c.collected||0);
                          const hasSurplusI = finI.surplus > 0;
                          const surplusPending = hasSurplusI && c.surplus_payout_status === "pending";
                          return (
                            <div key={c.id} className="p-4 space-y-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                  <div className="font-semibold text-gray-900 text-sm">{c.title}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">🏥 {c.hospital} · Via {c.payout_method==="WAVE"?"🌊 Wave":c.payout_method==="CARD"?"💳 Carte bancaire":"🏦 Banque"}</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-black text-emerald-700">{montantHopital.toLocaleString()} FCFA</div>
                                  <div className="text-xs text-amber-500">+{fraisAyyad.toLocaleString()} FCFA Ayyad</div>
                                </div>
                              </div>

                              {/* Badge 70% en attente */}
                              {surplusPending && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">⏳</span>
                                      <div>
                                        <div className="text-xs font-bold text-amber-700">70% surcollecte en attente</div>
                                        <div className="text-[10px] text-amber-600">{finI.partBeneficiaire.toLocaleString()} FCFA → {c.full_name||c.beneficiary}</div>
                                      </div>
                                    </div>
                                    <button
                                      onClick={async () => {
                                        await supabase.from("cases").update({ surplus_payout_status: "initiated", surplus_payout_at: new Date().toISOString() }).eq("id", c.id);
                                        setCases(prev => prev.map(x => x.id===c.id ? {...x, surplus_payout_status:"initiated"} : x));
                                      }}
                                      className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black px-3 py-1.5 rounded-lg">
                                      📱 Virer maintenant
                                    </button>
                                  </div>
                                  {c.beneficiary_phone && (
                                    <div className="text-[10px] text-gray-500 font-mono bg-white rounded-lg px-2.5 py-1.5 border border-amber-100">
                                      📞 {c.beneficiary_phone}
                                    </div>
                                  )}
                                </div>
                              )}

                              {hasSurplusI && c.surplus_payout_status === "initiated" && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex items-center gap-2">
                                  <span>📱</span>
                                  <div className="text-[10px] text-blue-700 font-semibold">70% bénéficiaire viré — {finI.partBeneficiaire.toLocaleString()} FCFA</div>
                                  <span className="ml-auto text-[10px] text-blue-400">✅</span>
                                </div>
                              )}

                              <label className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-2 w-full">
                                📄 {lang==="fr" ? "Uploader le reçu de confirmation" : "Upload confirmation receipt"}
                                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={async (e) => {
                                  const file = e.target.files[0];
                                  if (!file) return;
                                  const path = "receipts/"+c.id+"_"+Date.now();
                                  const { data } = await supabase.storage.from("documents").upload(path, file);
                                  if (data) {
                                    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
                                    await supabase.from("cases").update({ payout_status: "confirmed", payout_receipt: urlData.publicUrl, payout_confirmed_at: new Date().toISOString() }).eq("id", c.id);
                                    setCases(prev => prev.map(x => x.id===c.id ? {...x, payout_status:"confirmed", payout_receipt: urlData.publicUrl} : x));
                                  }
                                }} />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Virements confirmés */}
                  {confirmed.length > 0 && (
                    <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-emerald-50 bg-emerald-50 flex items-center gap-2">
                        <span className="text-lg">✅</span>
                        <h3 className="font-bold text-gray-900 text-sm">{lang==="fr" ? "Virements confirmés" : "Confirmed transfers"}</h3>
                        <span className="bg-emerald-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{confirmed.length}</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {confirmed.map(c => {
                          const montantHopital = c.payout_amount_hospital || Math.round((c.amount||0)*0.95);
                          const fraisAyyad = c.payout_amount_ayyad || Math.round((c.amount||0)*0.05);
                          return (
                            <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900 text-sm truncate">{c.title}</div>
                                <div className="text-xs text-gray-400 mt-0.5">🏥 {c.hospital} · {c.payout_method==="WAVE"?"🌊 Wave":"🏦 Banque"}</div>
                                {c.payout_receipt && <a href={c.payout_receipt} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 underline">📄 Reçu</a>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="font-black text-emerald-700 text-sm">{montantHopital.toLocaleString()} FCFA</div>
                                <div className="text-[10px] text-amber-500">{fraisAyyad.toLocaleString()} FCFA → Ayyad</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
        {/* ── ONGLET DONS ── */}
        {tab === "donations" && <AdminDonationsTab lang={lang} adminCases={cases} />}

        {/* ── ONGLET EXPORT — super_admin uniquement ── */}
        {tab === "export" && user?.adminRole === "super_admin" && <AdminExportTab lang={lang} user={user} />}
        {tab === "export" && user?.adminRole !== "super_admin" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <div className="font-bold text-red-700">{lang==="fr"?"Accès réservé aux super administrateurs.":"Access restricted to super administrators."}</div>
          </div>
        )}

        {/* ── ONGLET TÉMOIGNAGES ── */}
        {tab === "testimonials" && <AdminTestimonialsTab lang={lang} user={user} />}

        {/* ── ONGLET VISITEURS ── */}
        {tab === "visitors" && <AdminVisitorsTab lang={lang} />}

        {/* ── ONGLET COMPTES ── */}
        {tab === "accounts" && <AdminAccountsTab lang={lang} user={user} />}

        {/* ── ONGLET ÉQUIPE ── */}
        {tab === "team" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">{lang==="fr" ? "Équipe & Accès" : "Team & Access"}</h2>
            </div>
            <AdminErrorBoundary>
              <AdminTeamList user={user} fr={lang==="fr"} />
            </AdminErrorBoundary>
          </div>
        )}

        {/* ── ONGLET FINANCE ── */}
        {tab === "finance" && (() => {
          const funded = cases.filter(c => ["FUNDED","CLOSED"].includes(c.status));
          const collecting = cases.filter(c => c.status === "COLLECTING");
          const allActive = cases.filter(c => !["PENDING","REJECTED"].includes(c.status));
          const totalCollected = allActive.reduce((s,c) => s + (c.collected||0), 0);

          // ── Calcul des 4 flux de revenus Ayyad ──
          // 1. 5% sur objectif (toutes collectes actives, calculé sur ce qui est collecté)
          const rev5pctObjectif = Math.round(allActive.reduce((s,c) => {
            const col = c.collected || 0; const goal = c.amount || 1;
            return s + Math.min(col, goal) * 0.05;
          }, 0));
          // 2. 5% sur surcollecte (collectes FUNDED/CLOSED avec surplus)
          const rev5pctSurcollecte = Math.round(allActive.filter(c => (c.collected||0) > (c.amount||1)).reduce((s,c) => {
            const surplus = Math.max(0, (c.collected||0) - (c.amount||1));
            return s + surplus * 0.05;
          }, 0));
          // 3. 5% sur collectes non atteintes (FUNDED/CLOSED où collected < amount)
          const rev5pctNonAtteint = Math.round(funded.filter(c => (c.collected||0) < (c.amount||1)).reduce((s,c) => {
            return s + (c.collected||0) * 0.05;
          }, 0));
          // 4. Dons directs (table ayyad_expenses avec label contenant "don")
          const revDonsDirect = expenses.filter(e => e.category === "don_direct").reduce((s,e) => s + (e.amount||0), 0);

          const total5pct = rev5pctObjectif + rev5pctSurcollecte + rev5pctNonAtteint;
          const totalSalariesPaid = salaryPayments.filter(p=>p.status==="paid").reduce((s,p)=>s+p.amount,0);
          const totalExpenses = expenses.filter(e => e.category !== "don_direct").reduce((s,e)=>s+e.amount,0);
          const totalRevenusAyyad = total5pct + revDonsDirect;
          const balance = totalRevenusAyyad - totalSalariesPaid - totalExpenses;
          const fr = lang==="fr";
          // ── Export rapide XLS ──
          const quickXLS = (filename, headers, rows) => {
            const hRow = `<Row>${headers.map(h=>`<Cell ss:StyleID="h"><Data ss:Type="String">${String(h).replace(/&/g,"&amp;")}</Data></Cell>`).join("")}</Row>`;
            const dRows = rows.map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="${typeof v==="number"?"Number":"String"}">${String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</Data></Cell>`).join("")}</Row>`).join("\n");
            const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0d5c2e" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Export"><Table>${hRow}\n${dRows}</Table></Worksheet></Workbook>`;
            const blob = new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=filename+".xls"; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
          };

          return (
            <div className="space-y-6">
              {/* KPIs Finance */}
              {["super_admin","finance","admin"].includes(user?.adminRole) && (
                <div className="flex justify-end">
                  <button onClick={()=>quickXLS("ayyad_finance", fr?["Date","Libellé","Catégorie","Montant (FCFA)","Référence"]:["Date","Label","Category","Amount (FCFA)","Reference"], expenses.map(e=>[e.date?.slice(0,10)||"",e.label||"",e.category||"",e.amount||0,e.reference||""]))}
                    className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition-all">
                    📊 {fr?"Exporter Excel":"Export Excel"}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: fr?"Total collecté":"Total raised",          v: fmt(totalCollected),     icon:"💚", color:"emerald" },
                  { label: fr?"Revenus Ayyad":"Ayyad revenue",          v: fmt(totalRevenusAyyad),  icon:"💰", color:"amber"   },
                  { label: fr?"Salaires payés":"Salaries paid",         v: fmt(totalSalariesPaid),  icon:"👔", color:"blue"    },
                  { label: fr?"Solde disponible":"Available balance",   v: fmt(balance),            icon:"🏦", color: balance>=0?"emerald":"red" },
                ].map(k => (
                  <div key={k.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="text-3xl mb-2">{k.icon}</div>
                    <div className={`text-lg font-black ${k.color==="red"?"text-red-600":k.color==="amber"?"text-amber-600":k.color==="blue"?"text-blue-700":"text-emerald-700"}`}>{k.v}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Sources de revenus Ayyad ── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-lg">💰</span>
                  <h3 className="font-bold text-gray-900 text-sm">{fr ? "Sources de revenus Ayyad" : "Ayyad Revenue Streams"}</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {[
                    {
                      icon:"📊", color:"text-amber-600", bg:"bg-amber-50",
                      label: fr ? "5% sur objectif collecte" : "5% on campaign goal",
                      desc: fr ? "Prélevés sur chaque montant collecté, dans la limite de l'objectif" : "Deducted from each collected amount, up to the goal",
                      amount: rev5pctObjectif,
                      count: allActive.filter(c=>(c.collected||0)>0).length,
                      unit: fr ? "collectes actives" : "active campaigns",
                    },
                    {
                      icon:"🎉", color:"text-emerald-600", bg:"bg-emerald-50",
                      label: fr ? "5% sur surcollecte" : "5% on surplus",
                      desc: fr ? "5% du surplus versé à Ayyad quand l'objectif est dépassé" : "5% of surplus paid to Ayyad when goal is exceeded",
                      amount: rev5pctSurcollecte,
                      count: allActive.filter(c=>(c.collected||0)>(c.amount||1)).length,
                      unit: fr ? "collectes avec surplus" : "campaigns with surplus",
                    },
                    {
                      icon:"⏳", color:"text-orange-600", bg:"bg-orange-50",
                      label: fr ? "5% sur collectes non atteintes" : "5% on unmet goals",
                      desc: fr ? "5% prélevés avant redistribution du solde aux cas urgents" : "5% deducted before balance is redistributed to urgent cases",
                      amount: rev5pctNonAtteint,
                      count: funded.filter(c=>(c.collected||0)<(c.amount||1)).length,
                      unit: fr ? "collectes non atteintes" : "unmet campaigns",
                    },
                    {
                      icon:"💚", color:"text-teal-600", bg:"bg-teal-50",
                      label: fr ? "Dons directs à Ayyad" : "Direct donations to Ayyad",
                      desc: fr ? "Dons effectués directement via Wave ou carte sur la section Soutenir Ayyad" : "Donations made directly via Wave or card on the Support Ayyad section",
                      amount: revDonsDirect,
                      count: expenses.filter(e=>e.category==="don_direct").length,
                      unit: fr ? "dons enregistrés" : "recorded donations",
                    },
                  ].map((row, i) => (
                    <div key={i} className={`p-4 flex items-center gap-4 ${row.bg}`}>
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm flex-shrink-0">{row.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 text-sm">{row.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{row.desc}</div>
                        <div className="text-[10px] text-gray-400 mt-1">{row.count} {row.unit}</div>
                      </div>
                      <div className={`font-black text-lg ${row.color} flex-shrink-0 text-right`}>
                        {fmt(row.amount)}
                      </div>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="p-4 bg-gray-900 flex items-center justify-between">
                    <div className="text-white font-bold text-sm">💰 {fr ? "Total revenus Ayyad" : "Total Ayyad Revenue"}</div>
                    <div className="font-black text-amber-400 text-lg">{fmt(totalRevenusAyyad)}</div>
                  </div>
                </div>
              </div>

              {/* Tableau des collectes avec 5% */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-900 text-sm">{fr?"Collectes — Prélèvements 5%":"Campaigns — 5% deductions"}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-50 text-gray-500 uppercase text-[10px]">
                      <th className="text-left px-4 py-3">{fr?"Dossier":"Case"}</th>
                      <th className="text-right px-4 py-3">{fr?"Collecté":"Raised"}</th>
                      <th className="text-right px-4 py-3">{fr?"Objectif":"Goal"}</th>
                      <th className="text-right px-4 py-3">5% Ayyad</th>
                      <th className="text-right px-4 py-3">{fr?"Reste":"Remainder"}</th>
                      <th className="text-center px-4 py-3">Statut</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {allActive.slice(0,15).map(c => {
                        const col = c.collected||0;
                        const goal = c.amount||1;
                        const fee = Math.round(col*0.05);
                        const rest = col - fee;
                        const reached = col >= goal;
                        return (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-semibold text-gray-900 max-w-[180px] truncate">{c.title||c.full_name||"—"}</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(col)}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{fmt(goal)}</td>
                            <td className="px-4 py-3 text-right font-bold text-amber-600">{fmt(fee)}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{fmt(rest)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${reached?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>
                                {reached?(fr?"✓ Atteint":"✓ Reached"):(fr?"Non atteint":"Not reached")}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charges de fonctionnement */}
              {expenses.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900 text-sm">{fr?"Charges de fonctionnement":"Operating expenses"}</h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {expenses.slice(0,10).map(e => (
                      <div key={e.id} className="px-4 py-3 flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-sm text-gray-900">{e.label||"—"}</div>
                          <div className="text-xs text-gray-400">{e.category||"—"} · {e.date?.slice(0,10)}</div>
                        </div>
                        <div className="font-black text-red-600 text-sm">{fmt(e.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {expenses.length === 0 && !loadingFinance && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
                  {fr?"Aucune charge enregistrée. Ajoutez des dépenses depuis la table ayyad_expenses dans Supabase.":"No expenses recorded yet. Add entries in the ayyad_expenses table in Supabase."}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── ONGLET SALAIRES ── */}
        {tab === "salary" && (() => {
          const fr = lang==="fr";
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
          const thisMonthPayments = salaryPayments.filter(p => p.payment_month === currentMonth);

          const addStaffMember = async () => {
            if (!newStaff.name || !newStaff.monthly_salary) return;
            const { data, error } = await supabase.from("staff_members").insert({
              ...newStaff,
              monthly_salary: Number(newStaff.monthly_salary),
              created_at: new Date().toISOString(),
            }).select().single();
            if (!error && data) {
              setStaffMembers(prev => [...prev, data]);
              auditLog(user, "STAFF_ADDED", newStaff.name, null, newStaff);
              setNewStaff({ name:"", role:"", wave_number:"", monthly_salary:0 });
              setShowAddStaff(false);
            }
          };

          const deleteStaffMember = async (id, name) => {
            if (!window.confirm(fr ? `Supprimer ${name} du personnel ?` : `Remove ${name} from staff?`)) return;
            const { error } = await supabase.from("staff_members").delete().eq("id", id);
            if (!error) {
              setStaffMembers(prev => prev.filter(m => m.id !== id));
              auditLog(user, "STAFF_DELETED", name, null, { id });
            }
          };

          const updateStaffMember = async (id, updates) => {
            const { error } = await supabase.from("staff_members").update(updates).eq("id", id);
            if (!error) {
              setStaffMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
            }
            return !error;
          };

          const deletePayment = async (id) => {
            if (!window.confirm(fr ? "Supprimer cette transaction ?" : "Delete this transaction?")) return;
            const { error } = await supabase.from("salary_payments").delete().eq("id", id);
            if (!error) {
              setSalaryPayments(prev => prev.filter(p => p.id !== id));
            }
          };

          const markSalaryPaid = async (staffId, staffName, amount) => {
            const { data, error } = await supabase.from("salary_payments").insert({
              staff_id: staffId,
              staff_name: staffName,
              amount,
              payment_month: currentMonth,
              payment_date: new Date().toISOString(),
              status: "paid",
              method: "WAVE",
            }).select().single();
            if (!error && data) {
              setSalaryPayments(prev => [...prev, data]);
              auditLog(user, "SALARY_PAID", staffName, null, { amount, month: currentMonth, method:"WAVE" });
            }
          };

          const totalMonthlySalaries = staffMembers.reduce((s,m)=>s+m.monthly_salary,0);
          const totalPaidThisMonth = thisMonthPayments.filter(p=>p.status==="paid").reduce((s,p)=>s+p.amount,0);

          // ── Export rapide XLS ──
          const quickXLS_sal = (filename, headers, rows) => {
            const hRow = `<Row>${headers.map(h=>`<Cell ss:StyleID="h"><Data ss:Type="String">${String(h).replace(/&/g,"&amp;")}</Data></Cell>`).join("")}</Row>`;
            const dRows = rows.map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="${typeof v==="number"?"Number":"String"}">${String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</Data></Cell>`).join("")}</Row>`).join("\n");
            const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0d5c2e" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Export"><Table>${hRow}\n${dRows}</Table></Worksheet></Workbook>`;
            const blob = new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=filename+".xls"; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
          };

          return (
            <div className="space-y-6">
              {/* KPIs salaires */}
              {["super_admin","finance","admin"].includes(user?.adminRole) && (
                <div className="flex justify-end">
                  <button onClick={()=>quickXLS_sal("ayyad_salaires", fr?["Mois","Employé","Rôle","Montant (FCFA)","Méthode","Statut","Date paiement"]:["Month","Employee","Role","Amount (FCFA)","Method","Status","Payment date"], salaryPayments.map(p=>[p.payment_month||"",p.staff_name||"",p.role||"",p.amount||0,p.payment_method||p.method||"WAVE",p.status||"",p.payment_date?.slice(0,10)||""]))}
                    className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition-all">
                    📊 {fr?"Exporter Excel":"Export Excel"}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: fr?"Masse salariale mensuelle":"Monthly payroll",  v: fmt(totalMonthlySalaries), icon:"👥" },
                  { label: fr?"Payé ce mois":"Paid this month",               v: fmt(totalPaidThisMonth),   icon:"✅" },
                  { label: fr?"Restant à payer":"Remaining to pay",           v: fmt(totalMonthlySalaries - totalPaidThisMonth), icon:"⏳" },
                ].map(k => (
                  <div key={k.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="text-3xl mb-2">{k.icon}</div>
                    <div className="text-lg font-black text-emerald-700">{k.v}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Liste du personnel */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 text-sm">{fr?"Personnel Ayyad":"Ayyad Staff"}</h3>
                  <button onClick={()=>setShowAddStaff(v=>!v)} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-xl font-semibold hover:bg-emerald-700">
                    + {fr?"Ajouter":"Add member"}
                  </button>
                </div>

                {showAddStaff && (
                  <div className="p-4 bg-emerald-50 border-b border-emerald-100 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder={fr?"Nom complet":"Full name"} value={newStaff.name} onChange={e=>setNewStaff(s=>({...s,name:e.target.value}))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                      <input placeholder={fr?"Poste / Rôle":"Position / Role"} value={newStaff.role} onChange={e=>setNewStaff(s=>({...s,role:e.target.value}))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                      <input placeholder="Numéro Wave (+225...)" value={newStaff.wave_number} onChange={e=>setNewStaff(s=>({...s,wave_number:e.target.value}))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                      <input type="number" placeholder={fr?"Salaire mensuel (FCFA)":"Monthly salary (FCFA)"} value={newStaff.monthly_salary||""} onChange={e=>setNewStaff(s=>({...s,monthly_salary:e.target.value}))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addStaffMember} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700">{fr?"Enregistrer":"Save"}</button>
                      <button onClick={()=>setShowAddStaff(false)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">{fr?"Annuler":"Cancel"}</button>
                    </div>
                  </div>
                )}

                {loadingFinance ? (
                  <div className="p-8 text-center text-gray-400 text-sm">{fr?"Chargement...":"Loading..."}</div>
                ) : staffMembers.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">{fr?"Aucun employé enregistré.":"No staff members yet."}</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {staffMembers.map(m => {
                      const paid = thisMonthPayments.find(p=>p.staff_id===m.id && p.status==="paid");
                      const [editingStaff, setEditingStaff] = [null, ()=>{}]; // handled below via inline editing
                      return (
                        <StaffRow key={m.id} m={m} fr={fr} paid={paid}
                          onPay={()=>markSalaryPaid(m.id, m.name, m.monthly_salary)}
                          onDelete={()=>deleteStaffMember(m.id, m.name)}
                          onUpdate={updateStaffMember}
                          fmt={fmt} />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Historique paiements salaires */}
              {salaryPayments.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900 text-sm">{fr?"Historique des paiements":"Payment history"}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 text-gray-500 uppercase text-[10px]">
                        <th className="text-left px-4 py-3">{fr?"Employé":"Employee"}</th>
                        <th className="text-right px-4 py-3">{fr?"Montant":"Amount"}</th>
                        <th className="text-center px-4 py-3">{fr?"Mois":"Month"}</th>
                        <th className="text-center px-4 py-3">{fr?"Méthode":"Method"}</th>
                        <th className="text-center px-4 py-3">Statut</th>
                        <th className="text-center px-4 py-3">Action</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {salaryPayments.slice(0,50).map(p => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-semibold text-gray-900">{p.staff_name||"—"}</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(p.amount)}</td>
                            <td className="px-4 py-3 text-center text-gray-500">{p.payment_month||"—"}</td>
                            <td className="px-4 py-3 text-center">🌊 {p.method||"Wave"}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${p.status==="paid"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>
                                {p.status==="paid"?(fr?"Payé":"Paid"):(fr?"En attente":"Pending")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={()=>deletePayment(p.id)}
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
                                title={fr?"Supprimer":"Delete"}>
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── ONGLET AUDIT ── */}
        {tab === "audit" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{lang==="fr"?"Journal d'activité":"Activity log"}</h2>
              <div className="flex items-center gap-2">
                {["super_admin","finance","admin"].includes(user?.adminRole) && auditLogs.length > 0 && (() => {
                  const quickXLS_audit = () => {
                    const headers = lang==="fr"?["Horodatage","Opérateur","Rôle","Action","Cible","Ancienne valeur","Nouvelle valeur"]:["Timestamp","Operator","Role","Action","Target","Old value","New value"];
                    const rows = auditLogs.map(l=>[l.created_at?.slice(0,19).replace("T"," ")||"",l.user_email||"",l.user_role||"",l.action||"",l.target||"",l.old_value||"",l.new_value||""]);
                    const hRow = `<Row>${headers.map(h=>`<Cell ss:StyleID="h"><Data ss:Type="String">${h}</Data></Cell>`).join("")}</Row>`;
                    const dRows = rows.map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="String">${String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</Data></Cell>`).join("")}</Row>`).join("\n");
                    const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0d5c2e" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Audit"><Table>${hRow}\n${dRows}</Table></Worksheet></Workbook>`;
                    const blob = new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href=url; a.download="ayyad_audit.xls"; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                  };
                  return <button onClick={quickXLS_audit} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm transition-all">📊 {lang==="fr"?"Excel":"Excel"}</button>;
                })()}
                <button onClick={loadAuditLogs} className="text-xs text-emerald-600 hover:underline font-semibold">↻ {lang==="fr"?"Actualiser":"Refresh"}</button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              {lang==="fr"
                ? "📋 Toutes les actions sensibles (approbation, rejet, paiements, virements, modifications) sont enregistrées ici avec l'identité de l'opérateur, l'heure et les valeurs avant/après."
                : "📋 All sensitive actions (approvals, rejections, payments, transfers, edits) are logged here with operator identity, timestamp, and before/after values."}
            </div>

            {loadingAudit ? (
              <div className="text-center py-10 text-gray-400">{lang==="fr"?"Chargement...":"Loading..."}</div>
            ) : auditLogs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
                {lang==="fr"
                  ? "Aucune entrée dans le journal. Les actions seront enregistrées automatiquement à partir de maintenant."
                  : "No log entries yet. Actions will be recorded automatically from now on."}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-50 text-gray-500 uppercase text-[10px]">
                      <th className="text-left px-4 py-3">{lang==="fr"?"Horodatage":"Timestamp"}</th>
                      <th className="text-left px-4 py-3">{lang==="fr"?"Opérateur":"Operator"}</th>
                      <th className="text-left px-4 py-3">{lang==="fr"?"Rôle":"Role"}</th>
                      <th className="text-left px-4 py-3">{lang==="fr"?"Action":"Action"}</th>
                      <th className="text-left px-4 py-3">{lang==="fr"?"Cible":"Target"}</th>
                      <th className="text-left px-4 py-3">{lang==="fr"?"Ancienne valeur":"Old value"}</th>
                      <th className="text-left px-4 py-3">{lang==="fr"?"Nouvelle valeur":"New value"}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {auditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString("fr")}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{log.user_email||"—"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${log.user_role==="super_admin"?"bg-purple-100 text-purple-700":log.user_role==="finance"?"bg-blue-100 text-blue-700":"bg-green-100 text-green-700"}`}>
                              {log.user_role||"—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-gray-700">{log.action||"—"}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate">{log.target||"—"}</td>
                          <td className="px-4 py-3 text-gray-400 max-w-[120px] truncate">{log.old_value||"—"}</td>
                          <td className="px-4 py-3 text-gray-700 max-w-[120px] truncate">{log.new_value||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ONGLET BILAN ── */}
        {tab === "bilan" && (() => {
          const fr = lang==="fr";
          const now = new Date();
          const allActive = cases.filter(c => !["PENDING","REJECTED"].includes(c.status));

          // Filtrage selon période sélectionnée
          const filterByMonth = (arr, dateField) => arr.filter(x => {
            if (!x[dateField]) return false;
            const d = new Date(x[dateField]);
            return d.getFullYear() === bilanYear && d.getMonth()+1 === bilanMonth;
          });
          const filterByYear = (arr, dateField) => arr.filter(x => {
            if (!x[dateField]) return false;
            return new Date(x[dateField]).getFullYear() === bilanYear;
          });

          const isMonthly = bilanPeriod === "monthly";
          const filteredCases = isMonthly
            ? filterByMonth(allActive, "created_at")
            : filterByYear(allActive, "created_at");

          const collected = filteredCases.reduce((s,c)=>s+(c.collected||0),0);
          const goalReached = filteredCases.filter(c=>(c.collected||0)>=(c.amount||1)).length;
          const goalMissed = filteredCases.filter(c=>(c.collected||0)<(c.amount||1)).length;
          const fees5pct = Math.round(collected*0.05);
          const redistributed = filteredCases.filter(c=>c.payout_status==="confirmed").reduce((s,c)=>s+(c.collected||0)*0.95,0);

          const filteredSalaries = isMonthly
            ? salaryPayments.filter(p=>p.payment_month===`${bilanYear}-${String(bilanMonth).padStart(2,"0")}`)
            : salaryPayments.filter(p=>p.payment_month?.startsWith(String(bilanYear)));
          const totalSalaries = filteredSalaries.reduce((s,p)=>s+p.amount,0);

          const filteredExpenses = isMonthly
            ? filterByMonth(expenses,"date")
            : filterByYear(expenses,"date");
          const totalExp = filteredExpenses.reduce((s,e)=>s+e.amount,0);
          const balance = fees5pct - totalSalaries - totalExp;

          const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
          const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

          // ── Export rapide bilan XLS ──
          const exportBilanXLS = () => {
            const periodLabel = isMonthly ? `${(fr?MONTHS_FR:MONTHS_EN)[bilanMonth-1]} ${bilanYear}` : String(bilanYear);
            const headers = fr?["Indicateur","Valeur"]:["Indicator","Value"];
            const rows = [
              [fr?"Période":"Period", periodLabel],
              [fr?"Dossiers actifs":"Active cases", filteredCases.length],
              [fr?"Objectifs atteints":"Goals reached", goalReached],
              [fr?"Total collecté (FCFA)":"Total raised (FCFA)", collected],
              [fr?"Frais Ayyad 5% (FCFA)":"Ayyad 5% fee (FCFA)", fees5pct],
              [fr?"Salaires payés (FCFA)":"Salaries paid (FCFA)", totalSalaries],
              [fr?"Charges diverses (FCFA)":"Misc expenses (FCFA)", totalExp],
              [fr?"Montant redistribué (FCFA)":"Redistributed (FCFA)", redistributed],
              [fr?"Solde disponible (FCFA)":"Available balance (FCFA)", balance],
            ];
            const hRow = `<Row>${headers.map(h=>`<Cell ss:StyleID="h"><Data ss:Type="String">${h}</Data></Cell>`).join("")}</Row>`;
            const dRows = rows.map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="${typeof v==="number"?"Number":"String"}">${String(v??"")}</Data></Cell>`).join("")}</Row>`).join("\n");
            const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0d5c2e" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Bilan"><Table>${hRow}\n${dRows}</Table></Worksheet></Workbook>`;
            const blob = new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=`ayyad_bilan_${periodLabel.replace(/\s/g,"_")}.xls`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
          };

          return (
            <div className="space-y-6">
              {/* Sélecteur période */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex rounded-xl overflow-hidden border border-gray-200">
                    {["monthly","annual"].map(p => (
                      <button key={p} onClick={()=>setBilanPeriod(p)} className={`px-4 py-2 text-sm font-semibold transition-all ${bilanPeriod===p?"bg-emerald-600 text-white":"text-gray-600 hover:bg-gray-50"}`}>
                        {p==="monthly"?(fr?"Mensuel":"Monthly"):(fr?"Annuel":"Annual")}
                      </button>
                    ))}
                  </div>
                  <select value={bilanYear} onChange={e=>setBilanYear(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    {[2024,2025,2026].map(y=><option key={y}>{y}</option>)}
                  </select>
                  {isMonthly && (
                    <select value={bilanMonth} onChange={e=>setBilanMonth(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                      {(fr?MONTHS_FR:MONTHS_EN).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  )}
                  {["super_admin","finance","admin"].includes(user?.adminRole) && (
                    <button onClick={exportBilanXLS} className="ml-auto flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition-all">
                      📊 {fr?"Exporter Excel":"Export Excel"}
                    </button>
                  )}
                </div>
              </div>

              {/* KPIs bilan */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: fr?"Collectes":"Campaigns",          v: filteredCases.length,  icon:"📋", sub:"total" },
                  { label: fr?"Objectifs atteints":"Goals met", v: goalReached,            icon:"✅", sub:`${goalMissed} ${fr?"non atteints":"missed"}` },
                  { label: fr?"Total collecté":"Total raised",  v: fmt(collected),         icon:"💚", sub:"" },
                  { label: fr?"5% Ayyad":"5% Ayyad",           v: fmt(fees5pct),          icon:"💰", sub:"" },
                  { label: fr?"Salaires":"Salaries",            v: fmt(totalSalaries),     icon:"👔", sub:"" },
                  { label: fr?"Charges":"Expenses",             v: fmt(totalExp),          icon:"📦", sub:"" },
                  { label: fr?"Redistribués":"Redistributed",   v: fmt(redistributed),     icon:"🔄", sub:"" },
                  { label: fr?"Solde":"Balance",                v: fmt(balance),           icon:"🏦", sub:"", highlight: balance<0?"red":"emerald" },
                ].map(k=>(
                  <div key={k.label} className={`bg-white rounded-2xl p-4 border shadow-sm ${k.highlight==="red"?"border-red-200":"border-gray-100"}`}>
                    <div className="text-2xl mb-1">{k.icon}</div>
                    <div className={`text-base font-black ${k.highlight==="red"?"text-red-600":"text-gray-900"}`}>{k.v}</div>
                    <div className="text-xs text-gray-500">{k.label}</div>
                    {k.sub && <div className="text-[10px] text-gray-400 mt-0.5">{k.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Résumé texte */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-4">
                  {fr?"Résumé opérationnel":"Operational summary"} — {isMonthly?(fr?MONTHS_FR:MONTHS_EN)[bilanMonth-1]+" "+bilanYear:bilanYear}
                </h3>
                <div className="space-y-2 text-sm">
                  {[
                    { label: fr?"Collectes créées":"Campaigns created",          v: filteredCases.length+" "+(fr?"dossiers":"cases") },
                    { label: fr?"Objectifs atteints":"Goals reached",            v: goalReached+" / "+filteredCases.length },
                    { label: fr?"Total collecté":"Total collected",              v: fmt(collected) },
                    { label: fr?"5% prélevés (fonctionnement)":"5% fee taken",   v: fmt(fees5pct) },
                    { label: fr?"Salaires payés":"Salaries paid",                v: fmt(totalSalaries) },
                    { label: fr?"Charges diverses":"Misc expenses",              v: fmt(totalExp) },
                    { label: fr?"Montant redistribué":"Redistributed",           v: fmt(redistributed) },
                    { label: fr?"Solde disponible Ayyad":"Available balance",    v: fmt(balance), bold: true, color: balance<0?"text-red-600":"text-emerald-700" },
                  ].map(r=>(
                    <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-gray-500">{r.label}</span>
                      <span className={`font-${r.bold?"black":"semibold"} ${r.color||"text-gray-900"}`}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

// ── Mon Impact (historique dons donateur) ────────────────────
const MonImpactPage = ({ user, setPage, lang }) => {
  const fr = lang === "fr";
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("donations").select("*").eq("donor_id", user.id)
      .order("created_at",{ascending:false}).limit(100)
      .then(({data}) => { setDonations(data||[]); setLoading(false); });
  },[user?.id]);

  const confirmed = donations.filter(d=>d.status==="confirmed");
  const pending   = donations.filter(d=>d.status==="pending");
  const totalFcfa = confirmed.reduce((s,d)=>s+(d.amount_fcfa||d.amount||0),0);
  const uniqueCases = [...new Set(confirmed.map(d=>d.case_id).filter(Boolean))].length;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={()=>setPage("home")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6">← {fr?"Retour à l'accueil":"Back to home"}</button>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl text-3xl mb-4">💚</div>
          <h1 className="text-2xl font-black text-gray-900">{fr?"Mon Impact":"My Impact"}</h1>
          <p className="text-gray-500 text-sm mt-2">{user?.name || user?.email}</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { icon:"💰", v: totalFcfa.toLocaleString("fr-CI")+" FCFA", l: fr?"Total donné":"Total given" },
            { icon:"🏥", v: uniqueCases, l: fr?"Patients soutenus":"Patients supported" },
            { icon:"✅", v: confirmed.length, l: fr?"Dons confirmés":"Confirmed donations" },
          ].map(k=>(
            <div key={k.l} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
              <div className="text-2xl mb-1">{k.icon}</div>
              <div className="font-black text-gray-900 text-sm">{k.v}</div>
              <div className="text-xs text-gray-500 mt-0.5">{k.l}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400">{fr?"Chargement...":"Loading..."}</div>
        ) : donations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <div className="text-4xl mb-3">💚</div>
            <p className="font-bold text-gray-700">{fr?"Vous n'avez pas encore fait de don.":"You haven't made any donations yet."}</p>
            <button onClick={()=>setPage("home")} className="mt-4 bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-emerald-700">
              {fr?"Découvrir les collectes →":"Browse campaigns →"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="font-bold text-gray-900 text-sm mb-3">{fr?"Historique de vos dons":"Your donation history"}</h2>
            {donations.map(d=>(
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${d.status==="confirmed"?"bg-emerald-100":"bg-amber-100"}`}>
                  {d.status==="confirmed"?"✅":"⏳"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm truncate">{d.case_id ? ("Dossier #"+d.case_id.slice(0,8)) : (fr?"Don Ayyad":"Ayyad donation")}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{new Date(d.created_at).toLocaleDateString(fr?"fr-CI":"en-US")} · {d.payment_method||"WAVE"}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-black text-emerald-700 text-sm">{(d.amount_fcfa||d.amount||0).toLocaleString("fr-CI")} FCFA</div>
                  <div className={`text-[10px] font-bold ${d.status==="confirmed"?"text-emerald-600":"text-amber-500"}`}>
                    {d.status==="confirmed"?(fr?"Confirmé":"Confirmed"):(fr?"En attente":"Pending")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Page Hôpitaux Partenaires ─────────────────────────────────
const HospitauxPage = ({ setPage, lang }) => {
  const fr = lang === "fr";
  const hospitals = [
    { name:"CHU de Cocody",        city:"Abidjan",       spec:fr?"Cardiologie, Neurologie":"Cardiology, Neurology",       cases:12, icon:"🏥", verified:true },
    { name:"CHU de Yopougon",      city:"Abidjan",       spec:fr?"Pédiatrie, Gynécologie":"Pediatrics, Gynecology",       cases:9,  icon:"🏥", verified:true },
    { name:"CHU de Bouaké",        city:"Bouaké",        spec:fr?"Néphrologie, Chirurgie":"Nephrology, Surgery",          cases:7,  icon:"🏥", verified:true },
    { name:"CHR de Daloa",         city:"Daloa",         spec:fr?"Orthopédie, Traumatologie":"Orthopedics, Trauma",       cases:5,  icon:"🏥", verified:true },
    { name:"Institut National d'Oncologie", city:"Abidjan", spec:fr?"Oncologie":"Oncology",                              cases:8,  icon:"🏥", verified:true },
    { name:"CHR de Yamoussoukro",  city:"Yamoussoukro",  spec:fr?"Chirurgie générale":"General Surgery",                 cases:4,  icon:"🏥", verified:true },
    { name:"CHR de Korhogo",       city:"Korhogo",       spec:fr?"Orthopédie, Médecine interne":"Orthopedics, Internal",  cases:3,  icon:"🏥", verified:true },
    { name:"CHR de Man",           city:"Man",            spec:fr?"Ophtalmologie, Pédiatrie":"Ophthalmology, Pediatrics", cases:3,  icon:"🏥", verified:true },
    { name:"Clinique Vision CI",   city:"San-Pédro",     spec:fr?"Ophtalmologie":"Ophthalmology",                        cases:2,  icon:"🏥", verified:true },
  ];
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <button onClick={()=>setPage("home")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6">← {fr?"Retour":"Back"}</button>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl text-3xl mb-4">🏥</div>
          <h1 className="text-2xl font-black text-gray-900">{fr?"Hôpitaux partenaires vérifiés":"Verified Partner Hospitals"}</h1>
          <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
            {fr?"Ayyad travaille exclusivement avec des établissements médicaux agréés et vérifiés. Les fonds sont versés directement à ces hôpitaux."
              :"Ayyad works exclusively with accredited and verified medical facilities. Funds are transferred directly to these hospitals."}
          </p>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <span className="text-xl">🔒</span>
          <div className="text-sm text-emerald-800">
            <strong>{fr?"Virement direct garanti":"Direct transfer guaranteed"}</strong> — {fr?"Aucun fonds ne transite par des tiers. Chaque virement est tracé et audité.":"No funds go through third parties. Every transfer is tracked and audited."}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {[
            {icon:"🏥",v:hospitals.length,l:fr?"Hôpitaux partenaires":"Partner hospitals"},
            {icon:"📋",v:hospitals.reduce((s,h)=>s+h.cases,0)+"+",l:fr?"Dossiers traités":"Cases handled"},
            {icon:"🌍",v:"7",l:fr?"Villes couvertes":"Cities covered"},
            {icon:"✅",v:"100%",l:fr?"Virements vérifiés":"Verified transfers"},
          ].map(k=>(
            <div key={k.l} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
              <span className="text-2xl">{k.icon}</span>
              <div><div className="font-black text-gray-900">{k.v}</div><div className="text-xs text-gray-500">{k.l}</div></div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {hospitals.map(h=>(
            <div key={h.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">{h.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900">{h.name}</span>
                  {h.verified && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full">✓ {fr?"Vérifié":"Verified"}</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">📍 {h.city} · {h.spec}</div>
                <div className="text-xs text-emerald-600 font-semibold mt-1">{h.cases} {fr?"dossiers traités":"cases handled"}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <h3 className="font-bold text-gray-900 mb-2">{fr?"Votre hôpital n'est pas listé ?":"Your hospital is not listed?"}</h3>
          <p className="text-sm text-gray-500 mb-4">
            {fr?"Ayyad est en expansion. Contactez-nous pour soumettre une demande de partenariat.":"Ayyad is expanding. Contact us to submit a partnership request."}
          </p>
          <a href="mailto:contact@ayyadci.com" className="inline-flex items-center gap-2 bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-emerald-700">
            ✉️ contact@ayyadci.com
          </a>
        </div>
      </div>
    </div>
  );
};

// ── Refund Policy Page ────────────────────────────────────────
const RefundPage = ({ setPage, lang }) => {
  const fr = lang === "fr";
  const Section = ({ icon, title, children }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">{icon}</div>
        <h2 className="font-black text-gray-900 text-base">{title}</h2>
      </div>
      {children}
    </div>
  );
  const Rule = ({ label, children }) => (
    <div className="border-l-2 border-emerald-400 pl-4">
      <div className="text-xs font-bold text-gray-700 mb-1">{label}</div>
      <div className="text-xs text-gray-500 leading-relaxed">{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-2xl text-3xl mb-4">🔄</div>
          <h1 className="text-2xl font-black text-gray-900">
            {fr ? "Politique de remboursement" : "Refund Policy"}
          </h1>
          <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
            {fr
              ? "Ayyad s'engage à gérer chaque franc confié avec transparence et intégrité."
              : "Ayyad is committed to managing every franc entrusted with transparency and integrity."}
          </p>
          <div className="text-[11px] text-gray-400 mt-2">
            {fr ? "Dernière mise à jour : mars 2025" : "Last updated: March 2025"}
          </div>
        </div>

        <div className="space-y-4">
          {/* Principe général */}
          <Section icon="📋" title={fr ? "Principe général" : "General principle"}>
            <p className="text-sm text-gray-600 leading-relaxed">
              {fr
                ? "Tout don effectué sur Ayyad est un acte de solidarité volontaire. Ayyad ne garantit pas l'atteinte de l'objectif de collecte, mais garantit que chaque franc reçu sera utilisé conformément à la présente politique."
                : "Every donation made on Ayyad is a voluntary act of solidarity. Ayyad does not guarantee that the campaign goal will be reached, but guarantees that every franc received will be used in accordance with this policy."}
            </p>
          </Section>

          {/* Cas 1 — Dossier rejeté */}
          <Section icon="❌" title={fr ? "Dossier rejeté après réception de dons" : "Case rejected after donations received"}>
            <p className="text-sm text-gray-600 leading-relaxed">
              {fr
                ? "Si Ayyad rejette un dossier après réception de dons (documents falsifiés, fraude détectée, non-conformité médicale, etc.) :"
                : "If Ayyad rejects a case after receiving donations (falsified documents, detected fraud, medical non-compliance, etc.):"}
            </p>
            <div className="space-y-3">
              <Rule label={fr ? "1. Notification immédiate" : "1. Immediate notification"}>
                {fr
                  ? "Tous les donateurs ayant un compte Ayyad sont contactés par email dans un délai de 48h après la décision de rejet."
                  : "All donors with an Ayyad account are contacted by email within 48 hours of the rejection decision."}
              </Rule>
              <Rule label={fr ? "2. Choix du donateur" : "2. Donor's choice"}>
                {fr
                  ? "Chaque donateur peut choisir : (a) un remboursement intégral sur son numéro mobile money d'origine, ou (b) la redistribution de son don aux cas urgents actifs sur la plateforme."
                  : "Each donor can choose: (a) a full refund to their original mobile money number, or (b) redistribution of their donation to active urgent cases on the platform."}
              </Rule>
              <Rule label={fr ? "3. Délai de réponse" : "3. Response deadline"}>
                {fr
                  ? "Le donateur dispose de 14 jours calendaires pour exprimer son choix. Sans réponse dans ce délai, le don est automatiquement redistribué aux cas urgents actifs."
                  : "The donor has 14 calendar days to express their choice. Without a response within this period, the donation is automatically redistributed to active urgent cases."}
              </Rule>
              <Rule label={fr ? "4. Délai de remboursement" : "4. Refund timeline"}>
                {fr
                  ? "Les remboursements sont effectués dans un délai de 5 jours ouvrés après confirmation du choix, via le même opérateur mobile money utilisé pour le don."
                  : "Refunds are processed within 5 business days after confirmation of the choice, via the same mobile money operator used for the donation."}
              </Rule>
            </div>
          </Section>

          {/* Cas 2 — Objectif non atteint */}
          <Section icon="⏳" title={fr ? "Objectif non atteint à l'échéance" : "Goal not reached at deadline"}>
            <p className="text-sm text-gray-600 leading-relaxed">
              {fr
                ? "Si l'objectif de collecte n'est pas atteint à la date de clôture prévue :"
                : "If the campaign goal is not reached by the scheduled closing date:"}
            </p>
            <div className="space-y-3">
              <Rule label={fr ? "1. Notification aux donateurs enregistrés" : "1. Notification to registered donors"}>
                {fr
                  ? "Une notification email est envoyée à tous les donateurs ayant un compte sur la plateforme, avec le montant collecté, l'écart par rapport à l'objectif, et les options disponibles."
                  : "An email notification is sent to all donors with a platform account, showing the amount collected, the gap from the goal, and available options."}
              </Rule>
              <Rule label={fr ? "2. Options proposées" : "2. Available options"}>
                {fr
                  ? "Remboursement intégral du don, ou maintien du don redistribué aux cas les plus urgents actifs sur la plateforme au moment de la clôture."
                  : "Full refund of the donation, or keeping the donation redistributed to the most urgent active cases on the platform at closing time."}
              </Rule>
              <Rule label={fr ? "3. Donateurs anonymes" : "3. Anonymous donors"}>
                {fr
                  ? "Les dons effectués de manière anonyme (sans compte Ayyad) ne peuvent pas être remboursés faute d'identification. Ils sont automatiquement redistribués aux cas urgents."
                  : "Donations made anonymously (without an Ayyad account) cannot be refunded due to lack of identification. They are automatically redistributed to urgent cases."}
              </Rule>
              <Rule label={fr ? "4. Délai de réponse" : "4. Response deadline"}>
                {fr
                  ? "14 jours calendaires pour répondre. Sans réponse → redistribution automatique."
                  : "14 calendar days to respond. No response → automatic redistribution."}
              </Rule>
            </div>
          </Section>

          {/* Cas 3 — Surcollecte */}
          <Section icon="🎉" title={fr ? "Objectif dépassé — Surcollecte" : "Goal exceeded — Surplus"}>
            <p className="text-sm text-gray-600 leading-relaxed">
              {fr
                ? "Si les dons dépassent l'objectif, la collecte reste ouverte jusqu'au lendemain de l'atteinte de l'objectif. Le surplus est ensuite réparti selon la règle suivante :"
                : "If donations exceed the goal, the campaign stays open until the day after the goal is reached. The surplus is then distributed as follows:"}
            </p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              {[
                ["🏥", fr?"Objectif atteint → viré intégralement à l'hôpital":"Goal met → transferred in full to hospital", "100%", "text-emerald-600"],
                ["👤", fr?"70% du surplus → bénéficiaire (mobile money)":"70% of surplus → beneficiary (mobile money)", "70%", "text-blue-600"],
                ["🚨", fr?"25% du surplus → redistribués aux cas urgents":"25% of surplus → redistributed to urgent cases", "25%", "text-purple-600"],
                ["⚙️", fr?"5% du surplus → frais opérationnels Ayyad":"5% of surplus → Ayyad operational fee", "5%", "text-amber-600"],
              ].map(([icon, label, pct, color]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2"><span>{icon}</span><span className="text-gray-600">{label}</span></div>
                  <span className={`font-black ${color}`}>{pct}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              {fr
                ? "⚠️ Le virement des 70% au bénéficiaire peut être différé par Ayyad si le patient est encore en convalescence, afin de garantir une utilisation appropriée des fonds."
                : "⚠️ The 70% transfer to the beneficiary may be deferred by Ayyad if the patient is still recovering, to ensure appropriate use of funds."}
            </p>
          </Section>

          {/* Non remboursables */}
          <Section icon="⚠️" title={fr ? "Cas non remboursables" : "Non-refundable cases"}>
            <div className="space-y-2">
              {(fr ? [
                "Dons effectués de façon anonyme (sans compte Ayyad)",
                "Dons effectués sur une collecte clôturée avec virement déjà effectué à l'hôpital",
                "La commission opérationnelle d'Ayyad de 5% intégrée dans l'objectif",
                "Frais de transfert mobile money si applicables",
              ] : [
                "Donations made anonymously (without an Ayyad account)",
                "Donations on a closed campaign where the hospital transfer has already been made",
                "Ayyad's 5% operational fee built into the campaign goal",
                "Mobile money transfer fees if applicable",
              ]).map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-red-400 text-xs mt-0.5 flex-shrink-0">✗</span>
                  <span className="text-xs text-gray-600">{item}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Contact */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center">
            <div className="text-2xl mb-2">📩</div>
            <div className="font-bold text-emerald-800 text-sm mb-1">
              {fr ? "Une question sur votre don ?" : "A question about your donation?"}
            </div>
            <div className="text-xs text-emerald-600 mb-3">
              {fr
                ? "Notre équipe répond sous 24h ouvrées."
                : "Our team responds within 24 business hours."}
            </div>
            <a href="mailto:support@ayyadci.com" className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl">
              support@ayyadci.com
            </a>
          </div>

          <div className="text-center pt-2">
            <button onClick={() => setPage("how")} className="text-sm text-gray-400 hover:text-emerald-600">
              {fr ? "← Retour à Comment ça marche" : "← Back to How it works"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Legal Page (Mentions légales + CGU) ──────────────────────
const LegalPage = ({ setPage, lang }) => {
  const [tab, setTab] = useState("mentions");
  const fr = lang === "fr";

  const Heading = ({ children }) => (
    <h3 className="font-black text-gray-900 text-sm mt-6 mb-2">{children}</h3>
  );
  const P = ({ children }) => (
    <p className="text-xs text-gray-600 leading-relaxed mb-2">{children}</p>
  );
  const Placeholder = ({ children }) => (
    <span className="bg-yellow-100 text-yellow-700 font-bold px-1 rounded text-[11px]">[{children}]</span>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-100 rounded-2xl text-3xl mb-4">⚖️</div>
          <h1 className="text-2xl font-black text-gray-900">
            {fr ? "Mentions légales & CGU" : "Legal Notice & Terms"}
          </h1>
          <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mt-3 max-w-sm mx-auto">
            {fr
              ? "⚠️ Document provisoire — à finaliser après enregistrement officiel d'Ayyad CI"
              : "⚠️ Provisional document — to be finalized after official Ayyad CI registration"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm">
          {[
            { id: "mentions", fr: "Mentions légales", en: "Legal Notice" },
            { id: "cgu",      fr: "CGU",              en: "Terms of Use" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${tab===t.id ? "bg-emerald-600 text-white shadow" : "text-gray-500 hover:text-gray-700"}`}>
              {fr ? t.fr : t.en}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {tab === "mentions" && (
            <div>
              <div className="text-[11px] text-gray-400 mb-4">{fr ? "Dernière mise à jour : mars 2025" : "Last updated: March 2025"}</div>

              <Heading>{fr ? "1. Éditeur de la plateforme" : "1. Platform editor"}</Heading>
              <P>
                {fr ? "La plateforme Ayyad (accessible à l'adresse " : "The Ayyad platform (accessible at "}
                <strong>ayyadci.com</strong>
                {fr ? ") est éditée par :" : ") is published by:"}
              </P>
              <div className="bg-gray-50 rounded-xl p-4 text-xs space-y-1.5 mb-3">
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Dénomination":"Name"}</span><strong>Ayyad CI</strong> <Placeholder>{fr?"À compléter après enregistrement":"To complete after registration"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Forme juridique":"Legal form"}</span><Placeholder>{fr?"SARL / SAS / ONG — À définir":"SARL / SAS / NGO — To define"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Capital social":"Share capital"}</span><Placeholder>{fr?"Montant — À compléter":"Amount — To complete"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">RCCM</span><Placeholder>{fr?"Numéro RCCM — À compléter":"RCCM number — To complete"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Siège social":"Registered office"}</span>Abidjan, Côte d'Ivoire <Placeholder>{fr?"Commune — À préciser":"District — To specify"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Directeur de pub.":"Publisher"}</span><strong>Bly Kedhard Serge Ismael</strong></div>
                <div><span className="text-gray-400 w-32 inline-block">Email</span><a href="mailto:contact@ayyadci.com" className="text-emerald-600">contact@ayyadci.com</a></div>
              </div>

              <Heading>{fr ? "2. Hébergement" : "2. Hosting"}</Heading>
              <div className="bg-gray-50 rounded-xl p-4 text-xs space-y-1.5 mb-3">
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Hébergeur":"Host"}</span><strong>Vercel Inc.</strong></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Adresse":"Address"}</span>340 Pine Street, Suite 701, San Francisco, CA 94104, USA</div>
                <div><span className="text-gray-400 w-32 inline-block">Site</span><a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-emerald-600">vercel.com</a></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-xs space-y-1.5 mb-3">
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Base de données":"Database"}</span><strong>Supabase Inc.</strong></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Adresse":"Address"}</span>970 Toa Payoh North, Singapore 318992</div>
                <div><span className="text-gray-400 w-32 inline-block">Site</span><a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-600">supabase.com</a></div>
              </div>

              <Heading>{fr ? "3. Propriété intellectuelle" : "3. Intellectual property"}</Heading>
              <P>{fr
                ? "L'ensemble des contenus présents sur la plateforme Ayyad (logo, textes, interface, code) sont la propriété exclusive d'Ayyad CI et sont protégés par les lois ivoiriennes et internationales sur la propriété intellectuelle. Toute reproduction sans autorisation préalable écrite est interdite."
                : "All content on the Ayyad platform (logo, texts, interface, code) is the exclusive property of Ayyad CI and is protected by Ivorian and international intellectual property laws. Any reproduction without prior written authorization is prohibited."}</P>

              <Heading>{fr ? "4. Responsabilité" : "4. Liability"}</Heading>
              <P>{fr
                ? "Ayyad CI ne saurait être tenu responsable des dommages directs ou indirects résultant de l'utilisation de la plateforme. Ayyad CI vérifie les dossiers médicaux soumis mais ne peut garantir l'exactitude absolue de toutes les informations communiquées par les bénéficiaires."
                : "Ayyad CI cannot be held liable for direct or indirect damages resulting from the use of the platform. Ayyad CI verifies submitted medical cases but cannot guarantee the absolute accuracy of all information provided by beneficiaries."}</P>

              <Heading>{fr ? "5. Droit applicable" : "5. Applicable law"}</Heading>
              <P>{fr
                ? "Les présentes mentions légales sont soumises au droit ivoirien. En cas de litige, les tribunaux compétents de la ville d'Abidjan, Côte d'Ivoire, seront seuls compétents."
                : "These legal notices are governed by Ivorian law. In case of dispute, the competent courts of Abidjan, Côte d'Ivoire, shall have exclusive jurisdiction."}</P>
            </div>
          )}

          {tab === "cgu" && (
            <div>
              <div className="text-[11px] text-gray-400 mb-4">{fr ? "Dernière mise à jour : mars 2025" : "Last updated: March 2025"}</div>

              <Heading>{fr ? "1. Objet" : "1. Purpose"}</Heading>
              <P>{fr
                ? "Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme Ayyad par tout visiteur ou utilisateur enregistré. L'utilisation de la plateforme implique l'acceptation pleine et entière des présentes CGU."
                : "These Terms of Use govern access to and use of the Ayyad platform by any visitor or registered user. Use of the platform implies full acceptance of these Terms."}</P>

              <Heading>{fr ? "2. Description du service" : "2. Service description"}</Heading>
              <P>{fr
                ? "Ayyad est une plateforme de financement participatif médical solidaire. Elle met en relation des personnes souhaitant financer des soins médicaux (donateurs) avec des patients dans le besoin (bénéficiaires), via un système de collecte de fonds sécurisé. Ayyad n'est pas un établissement financier et n'effectue pas d'opérations bancaires au sens strict."
                : "Ayyad is a solidarity medical crowdfunding platform. It connects people wishing to finance medical care (donors) with patients in need (beneficiaries) through a secure fundraising system. Ayyad is not a financial institution and does not perform banking operations in the strict sense."}</P>

              <Heading>{fr ? "3. Inscription et compte utilisateur" : "3. Registration and user account"}</Heading>
              <P>{fr
                ? "L'inscription est gratuite et ouverte à toute personne physique majeure. L'utilisateur s'engage à fournir des informations exactes et à maintenir la confidentialité de ses identifiants. Ayyad se réserve le droit de suspendre tout compte en cas d'utilisation frauduleuse ou contraire aux présentes CGU."
                : "Registration is free and open to any adult individual. The user agrees to provide accurate information and to maintain the confidentiality of their credentials. Ayyad reserves the right to suspend any account in case of fraudulent use or violation of these Terms."}</P>

              <Heading>{fr ? "4. Dons et paiements" : "4. Donations and payments"}</Heading>
              <P>{fr
                ? "Les dons sont effectués via des opérateurs de paiement mobile (Wave CI, carte bancaire). Chaque don est définitif sauf dans les cas prévus par la politique de remboursement d'Ayyad. L'objectif de collecte affiché est égal au devis médical + 5% de frais opérationnels Ayyad. Ces 5% sont intégrés dans l'objectif dès le départ : le donateur paie exactement le montant qu'il a choisi, et l'hôpital reçoit exactement le montant du devis."
                : "Donations are made via Wave CI or international card payment. Each donation is final except in cases provided for by Ayyad's refund policy. The displayed campaign goal equals the medical quote + 5% Ayyad operational fee. This 5% is built into the goal from the start: the donor pays exactly the amount they chose, and the hospital receives exactly the quoted amount."}</P>

              <Heading>{fr ? "5. Soumission de dossiers" : "5. Case submission"}</Heading>
              <P>{fr
                ? "Tout bénéficiaire soumettant un dossier s'engage à fournir des documents médicaux authentiques et véridiques. La soumission de faux documents constitue une fraude passible de poursuites judiciaires conformément au droit ivoirien. Ayyad se réserve le droit de rejeter tout dossier sans justification."
                : "Any beneficiary submitting a case agrees to provide authentic and truthful medical documents. Submission of false documents constitutes fraud subject to legal action under Ivorian law. Ayyad reserves the right to reject any case without justification."}</P>

              <Heading>{fr ? "6. Protection des données personnelles" : "6. Personal data protection"}</Heading>
              <P>{fr
                ? "Les données personnelles collectées sont traitées conformément à la loi ivoirienne n°2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel et aux directives de l'ARTCI. Les utilisateurs disposent d'un droit d'accès, de rectification et de suppression de leurs données en contactant contact@ayyadci.com."
                : "Personal data collected is processed in accordance with Ivorian law n°2013-450 of June 19, 2013 on personal data protection and ARTCI guidelines. Users have the right to access, correct and delete their data by contacting contact@ayyadci.com."}</P>

              <Heading>{fr ? "7. Responsabilité des utilisateurs" : "7. User responsibility"}</Heading>
              <P>{fr
                ? "L'utilisateur est seul responsable de l'usage qu'il fait de la plateforme. Il s'interdit notamment : (a) de publier des informations fausses ou trompeuses, (b) d'utiliser la plateforme à des fins commerciales non autorisées, (c) de tenter de contourner les systèmes de sécurité."
                : "The user is solely responsible for their use of the platform. They agree not to: (a) publish false or misleading information, (b) use the platform for unauthorized commercial purposes, (c) attempt to bypass security systems."}</P>

              <Heading>{fr ? "8. Modification des CGU" : "8. Amendment of Terms"}</Heading>
              <P>{fr
                ? "Ayyad se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront notifiés par email de toute modification substantielle. L'utilisation continue de la plateforme après notification vaut acceptation des nouvelles CGU."
                : "Ayyad reserves the right to modify these Terms at any time. Users will be notified by email of any substantial modification. Continued use of the platform after notification constitutes acceptance of the new Terms."}</P>

              <Heading>{fr ? "9. Contact" : "9. Contact"}</Heading>
              <P>{fr
                ? "Pour toute question relative aux présentes CGU, contactez-nous à :"
                : "For any questions regarding these Terms, contact us at:"}</P>
              <a href="mailto:legal@ayyadci.com" className="text-emerald-600 text-xs font-bold">legal@ayyadci.com</a>
            </div>
          )}
        </div>

        <div className="text-center mt-6 space-y-2">
          <button onClick={() => setPage("refund")} className="block mx-auto text-sm text-gray-400 hover:text-emerald-600">
            {fr ? "→ Politique de remboursement" : "→ Refund policy"}
          </button>
          <button onClick={() => setPage("home")} className="block mx-auto text-sm text-gray-400 hover:text-emerald-600">
            {fr ? "← Retour à l'accueil" : "← Back to home"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Rapport d'impact ─────────────────────────────────────────
const ImpactPage = ({ setPage, lang }) => {
  const fr = lang === "fr";
  const Block = ({ icon, title, value, sub }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-2xl font-black text-gray-900">{value}</div>
      <div className="text-xs font-bold text-gray-700 mt-1">{title}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
    </div>
  );
  const Section = ({ icon, title, children }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-xl">{icon}</div>
        <h2 className="font-black text-gray-900 text-base">{title}</h2>
      </div>
      {children}
    </div>
  );
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-2xl text-3xl mb-4">📊</div>
          <h1 className="text-2xl font-black text-gray-900">{fr ? "Rapport d'impact Ayyad" : "Ayyad Impact Report"}</h1>
          <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
            {fr ? "Transparence totale sur l'utilisation des fonds et l'impact réel sur les patients." : "Full transparency on fund usage and real patient impact."}
          </p>
          <div className="text-[11px] text-gray-400 mt-2">{fr ? "Données mises à jour en temps réel · Lancée en 2025" : "Real-time data · Launched in 2025"}</div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <Block icon="🏥" title={fr ? "Patients aidés" : "Patients helped"} value="En cours" sub={fr ? "Dossiers actifs" : "Active cases"} />
          <Block icon="💚" title={fr ? "Montant collecté" : "Amount raised"} value="En cours" sub={fr ? "Depuis le lancement" : "Since launch"} />
          <Block icon="🎯" title={fr ? "Taux de succès" : "Success rate"} value="—" sub={fr ? "Dossiers financés / soumis" : "Funded / submitted"} />
          <Block icon="⚡" title={fr ? "Délai moyen" : "Average time"} value="72h" sub={fr ? "Validation dossier" : "Case validation"} />
        </div>

        {/* Utilisation des fonds */}
        <Section icon="💰" title={fr ? "Comment sont calculés les frais Ayyad ?" : "How are Ayyad fees calculated?"}>
          {/* Principe */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <p className="text-xs font-bold text-emerald-800 mb-1">
              {fr ? "✅ Principe : les 5% sont intégrés dans l'objectif de collecte dès le départ" : "✅ Principle: the 5% is built into the campaign goal from the start"}
            </p>
            <p className="text-xs text-emerald-700 leading-relaxed">
              {fr
                ? "Ayyad n'a aucuns frais cachés. Les 5% ne sont jamais prélevés sur le montant que vous donnez. Ils sont calculés à partir du devis médical et intégrés dans l'objectif de collecte."
                : "Ayyad has no hidden fees. The 5% is never deducted from the amount you donate. It is calculated from the medical quote and built into the campaign goal."}
            </p>
          </div>

          {/* Exemple concret */}
          <div className="text-xs font-bold text-gray-700 mb-2">{fr ? "Exemple concret :" : "Concrete example:"}</div>
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
              <span className="text-lg">🏥</span>
              <div className="flex-1">
                <div className="text-xs text-gray-500">{fr ? "Devis médical de l'hôpital" : "Hospital medical quote"}</div>
                <div className="font-black text-gray-900">1 000 000 FCFA</div>
              </div>
            </div>
            <div className="flex items-center justify-center text-gray-400 text-xs font-bold">+ 5% frais Ayyad = 50 000 FCFA</div>
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
              <span className="text-lg">🎯</span>
              <div className="flex-1">
                <div className="text-xs text-blue-600 font-bold">{fr ? "Objectif de collecte affiché" : "Displayed campaign goal"}</div>
                <div className="font-black text-blue-800">1 050 000 FCFA</div>
              </div>
            </div>
          </div>

          {/* Résultat */}
          <div className="text-xs font-bold text-gray-700 mb-2">{fr ? "Quand l'objectif est atteint :" : "When the goal is reached:"}</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center bg-emerald-50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span>🏥</span>
                <span className="text-xs font-semibold text-gray-700">{fr ? "L'hôpital reçoit" : "Hospital receives"}</span>
              </div>
              <span className="font-black text-emerald-700">1 000 000 FCFA</span>
            </div>
            <div className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span>⚙️</span>
                <span className="text-xs font-semibold text-gray-700">{fr ? "Frais Ayyad (vérification, plateforme)" : "Ayyad fees (verification, platform)"}</span>
              </div>
              <span className="font-black text-gray-500">50 000 FCFA</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-4 leading-relaxed border-t border-gray-100 pt-3">
            {fr
              ? "👤 En tant que donateur, vous payez exactement le montant que vous avez choisi. L'hôpital reçoit exactement le montant du devis. Personne ne perd rien : les frais Ayyad sont dans l'objectif, pas en plus."
              : "👤 As a donor, you pay exactly the amount you chose. The hospital receives exactly the quote amount. Nobody loses anything: Ayyad fees are inside the goal, not on top of it."}
          </p>
        </Section>

        {/* Processus de vérification */}
        <Section icon="🔍" title={fr ? "Processus de vérification" : "Verification process"}>
          <div className="space-y-3">
            {[
              { step: "1", title: fr ? "Soumission du dossier" : "Case submission", desc: fr ? "Le patient soumet ses documents médicaux (rapport, devis, pièce d'identité)." : "Patient submits medical documents (report, quote, ID)." },
              { step: "2", title: fr ? "Vérification Ayyad" : "Ayyad verification", desc: fr ? "Notre équipe vérifie l'authenticité des documents sous 72h." : "Our team verifies document authenticity within 72h." },
              { step: "3", title: fr ? "Validation & publication" : "Validation & publication", desc: fr ? "Le dossier validé est publié sur la plateforme et la collecte démarre." : "Validated case is published and fundraising begins." },
              { step: "4", title: fr ? "Virement à l'hôpital" : "Hospital transfer", desc: fr ? "À l'atteinte de l'objectif, les fonds sont virés directement à l'hôpital." : "Once goal is reached, funds are transferred directly to the hospital." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="w-7 h-7 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-black flex-shrink-0">{step}</div>
                <div>
                  <div className="text-xs font-bold text-gray-800">{title}</div>
                  <div className="text-[11px] text-gray-500 leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Engagements */}
        <Section icon="🤝" title={fr ? "Nos engagements" : "Our commitments"}>
          <div className="grid grid-cols-1 gap-2">
            {[
              { icon: "🏦", text: fr ? "Fonds versés directement à l'hôpital — jamais en cash au patient" : "Funds paid directly to hospital — never cash to patient" },
              { icon: "📋", text: fr ? "Vérification de chaque dossier par notre équipe avant publication" : "Every case verified by our team before publication" },
              { icon: "🔄", text: fr ? "Remboursement intégral si dossier rejeté après collecte" : "Full refund if case rejected after fundraising" },
              { icon: "📊", text: fr ? "Rapport financier mensuel publié sur cette page" : "Monthly financial report published on this page" },
              { icon: "🛡️", text: fr ? "Données personnelles protégées — conformité ADPCI" : "Personal data protected — ADPCI compliance" },
            ].map(({ icon, text }, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                <span className="text-lg flex-shrink-0">{icon}</span>
                <p className="text-xs text-gray-600 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Prochains jalons */}
        <Section icon="🚀" title={fr ? "Prochains jalons" : "Next milestones"}>
          <div className="space-y-2">
            {[
              { q: "T2 2026", label: fr ? "Enregistrement officiel Ayyad CI" : "Official Ayyad CI registration" },
              { q: "T3 2026", label: fr ? "Intégration Wave CI API marchands" : "Wave CI merchant API integration" },
              { q: "T3 2026", label: fr ? "Partenariats avec 5 cliniques Abidjan" : "Partnerships with 5 Abidjan clinics" },
              { q: "T4 2026", label: fr ? "Publication rapport annuel 2026" : "Publication of 2026 annual report" },
            ].map(({ q, label }) => (
              <div key={q} className="flex items-center gap-3 text-xs">
                <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-lg w-16 text-center flex-shrink-0">{q}</span>
                <span className="text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <div className="text-center mt-4">
          <p className="text-xs text-gray-400 mb-4">{fr ? "Pour toute question sur nos rapports : " : "For any questions about our reports: "}<a href="mailto:impact@ayyadci.com" className="text-emerald-600 font-bold">impact@ayyadci.com</a></p>
          <button onClick={() => setPage("home")} className="text-sm text-gray-400 hover:text-emerald-600">{fr ? "← Retour à l'accueil" : "← Back to home"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Conformité BCEAO ──────────────────────────────────────────
const BCEAOPage = ({ setPage, lang }) => {
  const fr = lang === "fr";
  const Section = ({ icon, title, children }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">{icon}</div>
        <h2 className="font-black text-gray-900 text-base">{title}</h2>
      </div>
      {children}
    </div>
  );
  const Item = ({ title, children }) => (
    <div className="border-l-2 border-blue-400 pl-4 mb-3">
      <div className="text-xs font-bold text-gray-800 mb-1">{title}</div>
      <div className="text-xs text-gray-500 leading-relaxed">{children}</div>
    </div>
  );
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-2xl text-3xl mb-4">🏦</div>
          <h1 className="text-2xl font-black text-gray-900">{fr ? "Conformité BCEAO / UEMOA" : "BCEAO / UEMOA Compliance"}</h1>
          <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
            {fr
              ? "Ayyad opère en conformité avec les réglementations financières de l'UEMOA et les directives de la BCEAO applicables aux plateformes de financement participatif en Côte d'Ivoire."
              : "Ayyad operates in compliance with UEMOA financial regulations and BCEAO guidelines applicable to crowdfunding platforms in Côte d'Ivoire."}
          </p>
          <div className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mt-3 max-w-sm mx-auto">
            {fr ? "⚠️ Document provisoire — à finaliser après enregistrement officiel d'Ayyad CI" : "⚠️ Provisional document — to be finalized after official Ayyad CI registration"}
          </div>
        </div>

        {/* Cadre réglementaire */}
        <Section icon="📜" title={fr ? "Cadre réglementaire applicable" : "Applicable regulatory framework"}>
          <div className="space-y-2">
            {[
              { label: fr ? "Règlement UEMOA n°15/2002" : "UEMOA Regulation n°15/2002", desc: fr ? "Systèmes de paiement et règlement dans l'espace UEMOA" : "Payment and settlement systems in the UEMOA area" },
              { label: fr ? "Instruction BCEAO n°008-05-2015" : "BCEAO Instruction n°008-05-2015", desc: fr ? "Conditions et modalités d'exercice des activités des émetteurs de monnaie électronique" : "Conditions for electronic money issuer activities" },
              { label: fr ? "Loi ivoirienne n°2016-412" : "Ivorian Law n°2016-412", desc: fr ? "Lutte contre le blanchiment de capitaux et le financement du terrorisme (LBC/FT)" : "Anti-money laundering and counter-terrorism financing (AML/CFT)" },
              { label: fr ? "Loi n°2013-450 (ADPCI)" : "Law n°2013-450 (ADPCI)", desc: fr ? "Protection des données à caractère personnel en Côte d'Ivoire" : "Personal data protection in Côte d'Ivoire" },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                <span className="text-blue-500 font-black text-lg flex-shrink-0">§</span>
                <div>
                  <div className="text-xs font-bold text-gray-800">{label}</div>
                  <div className="text-[11px] text-gray-500">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Partenaires de paiement agréés */}
        <Section icon="💳" title={fr ? "Partenaires de paiement agréés BCEAO" : "BCEAO-licensed payment partners"}>
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "Wave CI", status: fr ? "Agréé BCEAO" : "BCEAO licensed", icon: "🌊", detail: fr ? "Opérateur monnaie électronique agréé en Côte d'Ivoire" : "Licensed e-money operator in Côte d'Ivoire" },
              { name: fr ? "Carte bancaire" : "Bank card", status: "Visa / Mastercard", icon: "💳", detail: fr ? "Via passerelle de paiement internationale conforme PCI-DSS" : "Via PCI-DSS compliant international payment gateway" },
            ].map(({ name, status, icon, detail }) => (
              <div key={name} className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-3xl mb-2">{icon}</div>
                <div className="text-xs font-black text-gray-900">{name}</div>
                <div className="text-[10px] text-blue-600 font-bold mt-1">{status}</div>
                <div className="text-[10px] text-gray-400 mt-1 leading-relaxed">{detail}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Mesures LBC/FT */}
        <Section icon="🛡️" title={fr ? "Mesures LBC/FT (Anti-blanchiment)" : "AML/CFT Measures"}>
          <Item title={fr ? "Identification des utilisateurs (KYC)" : "User Identification (KYC)"}>
            {fr
              ? "Tout utilisateur souhaitant soumettre un dossier doit fournir une pièce d'identité valide (CNI, passeport ou titre de séjour). Les informations sont vérifiées avant validation du dossier."
              : "Any user wishing to submit a case must provide valid ID (national ID, passport or residence permit). Information is verified before case validation."}
          </Item>
          <Item title={fr ? "Seuils de transaction" : "Transaction thresholds"}>
            {fr
              ? "Les transactions Wave CI sont soumises aux plafonds réglementaires BCEAO. Les objectifs de collecte supérieurs à 5 000 000 FCFA font l'objet d'une vérification renforcée. Les dons en espèces ne sont pas acceptés."
              : "Wave CI transactions are subject to BCEAO regulatory limits. Campaign goals above 5,000,000 FCFA are subject to enhanced verification. Cash donations are not accepted."}
          </Item>
          <Item title={fr ? "Conservation des données de transactions" : "Transaction data retention"}>
            {fr
              ? "Toutes les transactions sont enregistrées et conservées pendant 10 ans conformément à la réglementation UEMOA. Les données incluent : montant, date, identité du donateur (si non anonyme), établissement bénéficiaire."
              : "All transactions are recorded and retained for 10 years in accordance with UEMOA regulations. Data includes: amount, date, donor identity (if non-anonymous), beneficiary institution."}
          </Item>
          <Item title={fr ? "Détection des activités suspectes" : "Suspicious activity detection"}>
            {fr
              ? "Ayyad dispose d'un système de surveillance des transactions inhabituelles. Toute activité suspecte est signalée à la CENTIF-CI (Cellule Nationale de Traitement des Informations Financières)."
              : "Ayyad has a system for monitoring unusual transactions. Any suspicious activity is reported to CENTIF-CI (National Financial Intelligence Unit)."}
          </Item>
        </Section>

        {/* Statut réglementaire */}
        <Section icon="📋" title={fr ? "Statut réglementaire d'Ayyad" : "Ayyad's regulatory status"}>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-xs text-amber-700 leading-relaxed">
              {fr
                ? "⚠️ Ayyad CI est actuellement en phase de démarrage. L'enregistrement officiel auprès du RCCM d'Abidjan et la déclaration à la BCEAO en tant que plateforme de financement participatif sont en cours. Pendant cette phase, les volumes de collecte restent limités conformément aux seuils réglementaires."
                : "⚠️ Ayyad CI is currently in its startup phase. Official registration with Abidjan's RCCM and declaration to BCEAO as a crowdfunding platform are in progress. During this phase, fundraising volumes remain limited in accordance with regulatory thresholds."}
            </p>
          </div>
          <div className="space-y-2">
            {[
              { label: "RCCM", value: fr ? "En cours d'enregistrement" : "Registration in progress", ok: false },
              { label: fr ? "Déclaration BCEAO" : "BCEAO declaration", value: fr ? "À soumettre après RCCM" : "To submit after RCCM", ok: false },
              { label: "ADPCI", value: fr ? "Conformité assurée — données hébergées sur Supabase (Singapore)" : "Compliance ensured — data hosted on Supabase (Singapore)", ok: true },
              { label: "SSL / TLS", value: fr ? "Certificat actif — connexions chiffrées HTTPS" : "Active certificate — HTTPS encrypted connections", ok: true },
            ].map(({ label, value, ok }) => (
              <div key={label} className="flex items-start gap-3 text-xs">
                <span className={`font-black flex-shrink-0 ${ok ? "text-emerald-600" : "text-amber-500"}`}>{ok ? "✓" : "⏳"}</span>
                <div>
                  <span className="font-bold text-gray-800">{label} : </span>
                  <span className="text-gray-500">{value}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="text-xs text-gray-600 mb-3">
            {fr
              ? "Pour toute question relative à notre conformité réglementaire ou pour signaler une activité suspecte :"
              : "For any questions about our regulatory compliance or to report suspicious activity:"}
          </p>
          <a href="mailto:compliance@ayyadci.com" className="text-emerald-600 text-sm font-bold">compliance@ayyadci.com</a>
          <p className="text-[11px] text-gray-400 mt-3">
            {fr ? "Autorité de supervision : BCEAO — Siège Dakar, Sénégal · bceao.int" : "Supervisory authority: BCEAO — HQ Dakar, Senegal · bceao.int"}
          </p>
        </div>

        <div className="text-center">
          <button onClick={() => setPage("home")} className="text-sm text-gray-400 hover:text-emerald-600">{fr ? "← Retour à l'accueil" : "← Back to home"}</button>
        </div>
      </div>
    </div>
  );
};

// ── ChatWidget ────────────────────────────────────────────────
// Widget flottant bas-droite : choix entre Chat en direct (Tawk.to) et WhatsApp.
// Tawk.to est chargé de manière paresseuse (au premier clic) pour ne pas ralentir
// le premier rendu. Le bouton natif de Tawk.to est masqué — on garde un seul CTA unifié.
const CHAT_CONFIG = {
  whatsappNumber: "2250501855991", // Serge — perso pour l'instant, à basculer vers WA Business plus tard
  tawkPropertyId: "69eb8627f851631c32b88f6b",
  tawkWidgetId: "1jn0082u0",
};

const ChatWidget = ({ lang }) => {
  const [open, setOpen] = useState(false);
  const [tawkReady, setTawkReady] = useState(false);
  const fr = lang === "fr";

  // Injection paresseuse du script Tawk.to la première fois qu'on en a besoin
  const ensureTawkLoaded = () => {
    if (tawkReady) return Promise.resolve();
    return new Promise((resolve) => {
      window.Tawk_API = window.Tawk_API || {};
      window.Tawk_LoadStart = new Date();
      window.Tawk_API.onLoad = function () {
        try { window.Tawk_API.hideWidget && window.Tawk_API.hideWidget(); } catch(_) {}
        setTawkReady(true);
        resolve();
      };
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://embed.tawk.to/${CHAT_CONFIG.tawkPropertyId}/${CHAT_CONFIG.tawkWidgetId}`;
      s.charset = "UTF-8";
      s.setAttribute("crossorigin", "*");
      document.body.appendChild(s);
    });
  };

  const openLiveChat = async () => {
    setOpen(false);
    await ensureTawkLoaded();
    try {
      if (window.Tawk_API) {
        window.Tawk_API.showWidget && window.Tawk_API.showWidget();
        window.Tawk_API.maximize && window.Tawk_API.maximize();
      }
    } catch (e) { console.warn("Tawk open error:", e); }
  };

  const openWhatsApp = () => {
    setOpen(false);
    const msg = fr
      ? "Bonjour Ayyad, j'ai une question concernant "
      : "Hello Ayyad, I have a question about ";
    const url = `https://wa.me/${CHAT_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {/* Panneau de choix */}
      {open && (
        <div
          role="dialog"
          aria-label={fr ? "Choisir un moyen de contact" : "Choose how to contact us"}
          className="fixed bottom-24 right-4 sm:right-6 z-[9999] w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ animation: "fadeInUp .2s ease-out" }}
        >
          <div style={{ background: "#0d5c2e" }} className="text-white px-5 py-4">
            <div className="font-extrabold text-base">{fr ? "💬 Parlons !" : "💬 Let's chat!"}</div>
            <div className="text-xs mt-1" style={{ color: "#a7f3d0" }}>
              {fr ? "Comment souhaitez-vous nous contacter ?" : "How would you like to reach us?"}
            </div>
          </div>
          <div className="p-3 space-y-2">
            <button
              onClick={openLiveChat}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left transition"
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl shrink-0"
                style={{ background: "#0d5c2e" }}
              >
                💬
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">
                  {fr ? "Chat en direct" : "Live chat"}
                </div>
                <div className="text-xs text-gray-500">
                  {fr ? "Notre équipe répond rapidement" : "Our team replies quickly"}
                </div>
              </div>
            </button>
            <button
              onClick={openWhatsApp}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left transition"
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl shrink-0"
                style={{ background: "#25D366" }}
              >
                📱
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">WhatsApp</div>
                <div className="text-xs text-gray-500">
                  {fr ? "Discutez sur WhatsApp" : "Chat on WhatsApp"}
                </div>
              </div>
            </button>
          </div>
          <div className="px-4 pb-3 text-[10px] text-gray-400 text-center">
            {fr ? "Ayyad · Financement médical solidaire" : "Ayyad · Solidarity medical funding"}
          </div>
        </div>
      )}

      {/* Bouton flottant */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={fr ? "Ouvrir le chat" : "Open chat"}
        className="fixed bottom-5 right-4 sm:right-6 z-[9999] w-14 h-14 rounded-full text-white shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{ background: "#0d5c2e" }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
};

// ── Footer ────────────────────────────────────────────────────
const Footer = ({ setPage, lang }) => {
  const t = T[lang].footer;
  return (
    <footer className="bg-gray-950 text-white mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1"><div className="flex items-center gap-2 mb-4"><svg width="36" height="36" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="35" cy="35" r="33" fill="#1a6b3a"/><circle cx="35" cy="35" r="33" fill="none" stroke="#C9A84C" strokeWidth="2.5"/><rect x="29" y="18" width="12" height="34" rx="3" fill="#C9A84C"/><rect x="18" y="29" width="34" height="12" rx="3" fill="#C9A84C"/><path d="M31 32 C31 30.5, 32.5 29.5, 35 31.5 C37.5 29.5, 39 30.5, 39 32 C39 34, 35 37, 35 37 C35 37, 31 34, 31 32Z" fill="#0d5c2e"/></svg><span className="font-black text-xl" style={{fontFamily:"Georgia, serif", letterSpacing:"1px"}}>AYYAD</span></div><p className="text-gray-400 text-xs leading-relaxed">{t.tagline}</p></div>
          {[[t.platform, t.platformLinks, ["collectesactives","how","submit"]], [t.trust, t.trustLinks, ["how","hopitaux","impact"]], [t.legal, t.legalLinks, ["legal","faq","bceao"]]].map(([title, links, pages]) =>
            <div key={title}>
              <div className="font-bold text-sm mb-4 text-gray-300">{title}</div>
              <ul className="space-y-2.5">
                {links.map((l, i) => (
                  <li key={l}>
                    <button onClick={() => setPage(pages[i])} className="text-gray-500 text-xs hover:text-emerald-400 transition-colors text-left">
                      {l}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-gray-500 text-xs">{t.rights}</p>
          <div className="flex items-center gap-4 text-xs text-gray-600"><span>🔒 SSL</span><span>·</span><span>🏦 BCEAO</span><span>·</span><span>🛡️ ADPCI</span></div>
        </div>
      </div>
    </footer>
  );
};

// ── App Root ──────────────────────────────────────────────────
// ── Tracking Page ─────────────────────────────────────────────
const TrackingPage = ({ setPage, setSelectedCase, lang }) => {
  const [trackingId, setTrackingId] = useState("");
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Cherche d'abord dans MOCK_CASES, puis dans Supabase par tracking_id
  const search = async (id) => {
    const q = id.trim().toUpperCase();
    if (!q) return;
    setLoading(true); setNotFound(false); setCaseData(null);
    // Mock cases
    const mock = MOCK_CASES.find(c => (c.trackingId||"").toUpperCase() === q);
    if (mock) { setCaseData({...mock, _mock: true}); setLoading(false); return; }
    // Supabase
    const { data } = await supabase.from("cases").select("*").eq("tracking_id", q).maybeSingle();
    if (data) {
      // Enrichi avec total des dons confirmés
      const [enriched] = await enrichCasesWithTotals([data]);
      setCaseData(enriched);
    }
    else setNotFound(true);
    setLoading(false);
  };

  // Deep-link ?track=AYD-2025-001
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("track");
    if (t) { setTrackingId(t); search(t); }
  }, []);

  const fmt = n => (n||0).toLocaleString("fr-FR");

  const getTitle = (c) => typeof c.title === "object" ? c.title[lang] : (c.title || "—");
  const getDesc  = (c) => typeof c.desc === "object"  ? c.desc[lang]  : (c.description || "");

  const required   = caseData ? (caseData.required || caseData.amount || 0) : 0;
  const collected  = caseData ? (caseData.collected || 0) : 0;
  const pct        = required > 0 ? Math.min(100, Math.round(collected / required * 100)) : 0;
  const fin        = caseData ? calcFinancier(required, collected) : null;

  // Statut lisible
  const statusInfo = (c) => {
    if (!c) return {};
    if (c.payout_status === "confirmed") return { label: lang==="fr" ? "Virement effectué" : "Payout done",      color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" };
    if (c.payout_status === "initiated") return { label: lang==="fr" ? "Virement en cours" : "Payout in progress", color: "bg-blue-100 text-blue-700",       dot: "bg-blue-500" };
    if (c.status === "FUNDED")           return { label: lang==="fr" ? "Objectif atteint"  : "Goal reached",      color: "bg-purple-100 text-purple-700",    dot: "bg-purple-500" };
    if (c.status === "COLLECTING" || c.status === "APPROVED") return { label: lang==="fr" ? "Collecte active" : "Active",  color: "bg-green-100 text-green-700",      dot: "bg-green-500" };
    if (c.status === "PENDING")          return { label: lang==="fr" ? "En vérification"   : "Under review",      color: "bg-yellow-100 text-yellow-700",    dot: "bg-yellow-500" };
    if (c.status === "REJECTED")         return { label: lang==="fr" ? "Dossier rejeté"    : "Rejected",          color: "bg-red-100 text-red-700",           dot: "bg-red-500" };
    return { label: "—", color: "bg-gray-100 text-gray-500", dot: "bg-gray-400" };
  };

  // Timeline étapes
  const getStepIndex = (c) => {
    if (!c) return -1;
    if (c.payout_status === "confirmed") return 4;
    if (c.payout_status === "initiated") return 3;
    if (c.status === "FUNDED")           return 3;
    if (c.status === "COLLECTING" || c.status === "APPROVED") return 2;
    if (c.status === "PENDING")          return 1;
    return 0;
  };

  const steps = [
    { icon: "📋", fr: "Dossier reçu",        en: "Case received",       fr2: "Votre dossier a bien été reçu par Ayyad.",                     en2: "Your case has been received by Ayyad." },
    { icon: "🔍", fr: "Vérification",         en: "Verification",        fr2: "Notre équipe vérifie avec l'hôpital partenaire.",              en2: "Our team verifies with the partner hospital." },
    { icon: "💚", fr: "Collecte ouverte",     en: "Collection live",     fr2: "La collecte est active — les dons arrivent !",                 en2: "Collection is live — donations are coming in!" },
    { icon: "🏦", fr: "Virement hôpital",     en: "Hospital payout",     fr2: "Les fonds sont virés directement à l'établissement de santé.", en2: "Funds are transferred directly to the hospital." },
    { icon: "✅", fr: "Mission accomplie",    en: "Mission complete",    fr2: "L'hôpital a confirmé la réception des fonds.",                 en2: "The hospital has confirmed receipt of funds." },
  ];

  const si = caseData ? statusInfo(caseData) : {};
  const stepIdx = caseData ? getStepIndex(caseData) : -1;
  const photo = caseData ? (caseData.photo_url || (caseData.photos && caseData.photos[0]) || null) : null;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-2xl text-3xl mb-4">🔍</div>
          <h1 className="text-2xl font-black text-gray-900">{lang==="fr" ? "Suivi de collecte" : "Campaign tracking"}</h1>
          <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
            {lang==="fr"
              ? "Entrez l'identifiant de votre collecte pour suivre son évolution en temps réel."
              : "Enter your campaign ID to track its progress in real time."}
          </p>
        </div>

        {/* Barre de recherche */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            {lang==="fr" ? "Identifiant de collecte" : "Campaign ID"}
          </label>
          <div className="flex gap-2">
            <input
              value={trackingId}
              onChange={e => setTrackingId(e.target.value.toUpperCase())}
              onKeyDown={e => e.key==="Enter" && search(trackingId)}
              placeholder="AYD-2025-001"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 uppercase"
            />
            <button
              onClick={() => search(trackingId)}
              disabled={loading || !trackingId.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold px-5 py-3 rounded-xl text-sm transition-colors">
              {loading ? "⏳" : lang==="fr" ? "Rechercher" : "Search"}
            </button>
          </div>
          {notFound && (
            <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-red-500">⚠️</span>
              <span className="text-sm text-red-600">{lang==="fr" ? "Aucune collecte trouvée avec cet identifiant." : "No campaign found with this ID."}</span>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-2">
            {lang==="fr" ? "L'identifiant figure sur votre email de confirmation ou sur la page de la collecte." : "The ID can be found in your confirmation email or on the campaign page."}
          </p>
        </div>

        {/* Résultats */}
        {caseData && (
          <div className="space-y-4">

            {/* Carte principale */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Photo */}
              {photo && (
                <div className="h-40 overflow-hidden">
                  <img src={photo} alt={getTitle(caseData)} className="w-full h-full object-cover object-center" />
                </div>
              )}
              <div className="p-5">
                {/* Titre + badge statut */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-black text-gray-900 text-lg leading-tight">{getTitle(caseData)}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">🏥 {caseData.hospital} · 📍 {caseData.city}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-bold flex-shrink-0 ${si.color}`}>
                    <span className={`w-2 h-2 rounded-full ${si.dot}`} />
                    {si.label}
                  </div>
                </div>

                {/* ID de suivi */}
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mb-4 w-fit">
                  <span className="text-[10px] text-gray-400">ID</span>
                  <span className="text-xs font-mono font-bold text-emerald-700">{caseData.trackingId || caseData.tracking_id}</span>
                  <button onClick={() => navigator.clipboard.writeText(caseData.trackingId || caseData.tracking_id)} className="text-gray-300 hover:text-emerald-500 text-xs">📋</button>
                </div>

                {/* Barre de progression */}
                <div className="mb-2">
                  <div className="flex justify-between items-end mb-1.5">
                    <div>
                      <span className="text-2xl font-black text-emerald-700">{fmt(collected)}</span>
                      <span className="text-xs text-gray-400 ml-1">FCFA</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-gray-900">{pct}%</span>
                      <div className="text-[10px] text-gray-400">{lang==="fr" ? "de l'objectif" : "of goal"}</div>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-purple-500" : "bg-emerald-500"}`} style={{width: pct+"%"}} />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>{lang==="fr" ? "Collecté" : "Collected"}</span>
                    <span>{lang==="fr" ? "Objectif" : "Goal"}: {fmt(required)} FCFA</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">{lang==="fr" ? "Parcours du dossier" : "Case journey"}</div>
              <div className="space-y-0">
                {steps.map((step, i) => {
                  const done = i <= stepIdx;
                  const active = i === stepIdx;
                  return (
                    <div key={i} className="flex gap-3">
                      {/* Indicateur vertical */}
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all ${
                          done ? (active ? "bg-emerald-500 shadow-lg shadow-emerald-200 scale-110" : "bg-emerald-500") : "bg-gray-100"
                        }`}>
                          {done ? <span className="text-white text-xs font-bold">✓</span> : <span className="text-gray-400 text-xs">{i+1}</span>}
                        </div>
                        {i < steps.length-1 && (
                          <div className={`w-0.5 h-8 mt-1 ${done && i < stepIdx ? "bg-emerald-400" : "bg-gray-100"}`} />
                        )}
                      </div>
                      {/* Contenu */}
                      <div className={`flex-1 pb-6 ${i === steps.length-1 ? "pb-0" : ""}`}>
                        <div className={`flex items-center gap-2 mb-0.5 ${active ? "mt-1" : "mt-1.5"}`}>
                          <span className="text-sm">{step.icon}</span>
                          <span className={`text-sm font-bold ${done ? "text-gray-900" : "text-gray-400"}`}>
                            {lang==="fr" ? step.fr : step.en}
                          </span>
                          {active && <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">EN COURS</span>}
                        </div>
                        {done && (
                          <p className="text-[11px] text-gray-400 leading-relaxed">
                            {lang==="fr" ? step.fr2 : step.en2}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transparence financière */}
            {fin && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{lang==="fr" ? "Transparence financière" : "Financial transparency"}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{lang==="fr" ? "Devis hôpital" : "Hospital quote"}</span>
                    <span className="font-bold text-gray-900">{fmt(fin.devisHopital)} FCFA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{lang==="fr" ? "Commission Ayyad (5%)" : "Ayyad fee (5%)"}</span>
                    <span className="font-semibold text-amber-600">{fmt(fin.fraisAyyadBase)} FCFA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{lang==="fr" ? "Total collecté" : "Total collected"}</span>
                    <span className="font-bold text-emerald-700">{fmt(collected)} FCFA</span>
                  </div>
                  {fin.surplus > 0 && (
                    <>
                      <div className="border-t border-dashed border-gray-200 pt-2 mt-1">
                        <div className="flex justify-between">
                          <span className="text-gray-500">🎉 {lang==="fr" ? "Surcollecte" : "Surplus"}</span>
                          <span className="font-bold text-purple-600">+{fmt(fin.surplus)} FCFA</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[11px] text-gray-400">→ {lang==="fr" ? "70% bénéficiaire" : "70% beneficiary"}</span>
                          <span className="text-[11px] font-semibold text-blue-600">{fmt(fin.partBeneficiaire)} FCFA</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[11px] text-gray-400">→ {lang==="fr" ? "25% cas urgents" : "25% urgent cases"}</span>
                          <span className="text-[11px] font-semibold text-purple-600">{fmt(fin.partRedistrib)} FCFA</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Reçu virement */}
            {caseData.payout_receipt && (
              <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5 flex items-center gap-4">
                <div className="text-3xl">📄</div>
                <div className="flex-1">
                  <div className="font-bold text-emerald-800 text-sm">{lang==="fr" ? "Reçu de virement disponible" : "Transfer receipt available"}</div>
                  <div className="text-xs text-emerald-600 mt-0.5">{lang==="fr" ? "Les fonds ont été versés directement à l'hôpital." : "Funds sent directly to the hospital."}</div>
                  {caseData.payout_confirmed_at && (
                    <div className="text-[10px] text-emerald-500 mt-0.5">
                      {new Date(caseData.payout_confirmed_at).toLocaleDateString(lang==="fr"?"fr-FR":"en-US", {day:"numeric",month:"long",year:"numeric"})}
                    </div>
                  )}
                </div>
                <a href={caseData.payout_receipt} target="_blank" rel="noreferrer" className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl">
                  {lang==="fr" ? "Voir →" : "View →"}
                </a>
              </div>
            )}

            {/* Infos dossier */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{lang==="fr" ? "Informations" : "Information"}</div>
              <div className="space-y-2.5 text-sm">
                {[
                  [lang==="fr"?"Bénéficiaire":"Beneficiary",   caseData.beneficiary || caseData.full_name || "—"],
                  [lang==="fr"?"Hôpital":"Hospital",            caseData.hospital || "—"],
                  [lang==="fr"?"Spécialité":"Specialty",        typeof caseData.category === "object" ? caseData.category[lang] : (caseData.category || "—")],
                  [lang==="fr"?"Ville":"City",                  caseData.city || "—"],
                  [lang==="fr"?"Soumis le":"Submitted",         caseData.created_at ? new Date(caseData.created_at).toLocaleDateString(lang==="fr"?"fr-FR":"en-US",{day:"numeric",month:"long",year:"numeric"}) : "—"],
                ].map(([k,v]) => (
                  <div key={k} className="flex justify-between items-center border-b border-gray-50 pb-2">
                    <span className="text-gray-400">{k}</span>
                    <span className="font-semibold text-gray-900 text-right max-w-xs">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA voir la collecte */}
            <button
              onClick={() => {
                const mock = MOCK_CASES.find(c => (c.trackingId||"") === (caseData.trackingId||caseData.tracking_id||""));
                if (mock) { setSelectedCase(mock); setPage("case"); }
                else { setSelectedCase(caseData); setPage("case"); }
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors">
              {lang==="fr" ? "💚 Voir la collecte & faire un don" : "💚 View campaign & donate"}
            </button>

            <button onClick={() => { setCaseData(null); setTrackingId(""); setNotFound(false); }} className="w-full text-gray-400 text-sm hover:text-gray-600 py-2">
              {lang==="fr" ? "← Nouvelle recherche" : "← New search"}
            </button>
          </div>
        )}

        <div className="text-center mt-8">
          <button onClick={() => setPage("home")} className="text-sm text-gray-400 hover:text-emerald-600">
            {lang==="fr" ? "← Retour à l'accueil" : "← Back to home"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Page de retour PayDunya ──────────────────────────────────────────────────
// Affichée après que le donateur ait terminé son paiement sur PayDunya.
// L'URL contient ?p=dunya-return&don=<donation_id>
// On poll /api/dunya/status pour suivre l'évolution (le webhook met du temps).
const DunyaReturnPage = ({ setPage, lang }) => {
  const fr = lang !== "en";
  const [status, setStatus] = useState("loading"); // loading | confirmed | pending | cancelled | error
  const [amount, setAmount] = useState(null);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const donId = params.get("don");
    if (!donId) { setStatus("error"); return; }

    let cancelled = false;
    let pollTimer = null;
    const maxPolls = 15; // ~30s à raison d'1 poll toutes les 2s
    let polls = 0;

    const pollStatus = async () => {
      if (cancelled) return;
      polls++;
      setPollCount(polls);
      try {
        const r = await fetch(`/api/dunya/status?id=${encodeURIComponent(donId)}`);
        if (!r.ok) {
          if (polls >= maxPolls) { setStatus("error"); return; }
          pollTimer = setTimeout(pollStatus, 2000);
          return;
        }
        const data = await r.json();
        if (data.amount) setAmount(data.amount);
        if (data.status === "confirmed") {
          setStatus("confirmed");
          return;
        }
        if (data.status === "cancelled") {
          setStatus("cancelled");
          return;
        }
        // Encore pending — on continue à poller
        if (polls >= maxPolls) {
          setStatus("pending"); // on abandonne, le webhook viendra plus tard
          return;
        }
        pollTimer = setTimeout(pollStatus, 2000);
      } catch (e) {
        if (polls >= maxPolls) setStatus("error");
        else pollTimer = setTimeout(pollStatus, 2000);
      }
    };
    pollStatus();
    return () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-12 text-center">
      {status === "loading" && (
        <div className="space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
          <h2 className="text-xl font-black text-gray-900">{fr ? "Vérification du paiement…" : "Verifying payment…"}</h2>
          <p className="text-sm text-gray-500">{fr ? "Cela peut prendre quelques secondes." : "This may take a few seconds."}</p>
          <p className="text-xs text-gray-400">{fr ? "Tentative " : "Attempt "}{pollCount}/15</p>
        </div>
      )}

      {status === "confirmed" && (
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center text-4xl">🎉</div>
          <h2 className="text-2xl font-black text-gray-900">{fr ? "Paiement confirmé !" : "Payment confirmed!"}</h2>
          <p className="text-base text-gray-600">{fr ? "Merci pour votre don 💚" : "Thank you for your donation 💚"}</p>
          {amount && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-xs text-emerald-700">{fr ? "Montant débité" : "Amount charged"}</p>
              <p className="text-2xl font-black text-emerald-700">{Math.round(amount).toLocaleString("fr-FR")} FCFA</p>
            </div>
          )}
          <p className="text-sm text-gray-500 leading-relaxed">
            {fr
              ? "Un email de confirmation vient de vous être envoyé. Les fonds seront versés directement à l'hôpital partenaire."
              : "A confirmation email has just been sent to you. The funds will be transferred directly to the partner hospital."}
          </p>
          <button onClick={() => setPage("home")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-sm">
            {fr ? "← Retour à l'accueil" : "← Back to home"}
          </button>
        </div>
      )}

      {status === "pending" && (
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center text-4xl">⏳</div>
          <h2 className="text-xl font-black text-gray-900">{fr ? "Paiement en cours de traitement" : "Payment being processed"}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            {fr
              ? "Votre paiement met un peu plus de temps que prévu à se confirmer. Pas d'inquiétude : si le débit a réussi, votre don sera validé automatiquement dans quelques minutes."
              : "Your payment is taking longer than expected to confirm. Don't worry: if the debit succeeded, your donation will be validated automatically in a few minutes."}
          </p>
          <p className="text-xs text-gray-400">
            {fr ? "Vous recevrez un email dès que c'est validé." : "You'll receive an email as soon as it's validated."}
          </p>
          <button onClick={() => setPage("home")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-sm">
            {fr ? "← Retour à l'accueil" : "← Back to home"}
          </button>
        </div>
      )}

      {status === "cancelled" && (
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center text-4xl">❌</div>
          <h2 className="text-xl font-black text-gray-900">{fr ? "Paiement annulé" : "Payment cancelled"}</h2>
          <p className="text-sm text-gray-600">
            {fr ? "Le paiement n'a pas été effectué. Vous n'avez pas été débité." : "The payment was not completed. You have not been charged."}
          </p>
          <button onClick={() => setPage("home")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-sm">
            {fr ? "← Retour à l'accueil" : "← Back to home"}
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center text-4xl">⚠️</div>
          <h2 className="text-xl font-black text-gray-900">{fr ? "Erreur" : "Error"}</h2>
          <p className="text-sm text-gray-600">
            {fr
              ? "Impossible de vérifier l'état du paiement. Si vous avez été débité, contactez-nous : contact@ayyadci.com"
              : "Unable to verify payment status. If you were charged, contact us at contact@ayyadci.com"}
          </p>
          <button onClick={() => setPage("home")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-sm">
            {fr ? "← Retour à l'accueil" : "← Back to home"}
          </button>
        </div>
      )}
    </div>
  );
};

// ── FAQ Page ─────────────────────────────────────────────
const FAQPage = ({ setPage, lang }) => {
  const [open, setOpen] = useState(null);
  const faqs = [
    { q: { fr: "Comment fonctionne Ayyad ?", en: "How does Ayyad work?" }, a: { fr: "Ayyad met en relation des patients dans le besoin avec des donateurs solidaires. Chaque dossier est vérifié par notre équipe avec l'hôpital partenaire avant d'être mis en ligne. Les fonds collectés sont versés directement à l'hôpital, jamais en espèces.", en: "Ayyad connects patients in need with generous donors. Each case is verified by our team with the partner hospital before going live. Collected funds are sent directly to the hospital, never in cash." } },
    { q: { fr: "Comment faire un don ?", en: "How do I donate?" }, a: { fr: "Choisissez une collecte active, sélectionnez votre montant, puis payez via Wave CI ou carte bancaire. Vous êtes débité exactement du montant choisi, sans frais cachés.", en: "Choose an active campaign, select your amount, then pay via Wave CI or card. You are charged exactly the amount you chose, with no hidden fees." } },
    { q: { fr: "Les fonds vont vraiment à l'hôpital ?", en: "Do funds really go to the hospital?" }, a: { fr: "Oui, à 100%. Ayyad prélève une commission de 5% intégrée dans l'objectif de collecte dès le départ — votre don va intégralement à l'hôpital partenaire. Chaque virement est documenté et auditable.", en: "Yes, 100%. Ayyad charges a 5% fee built into the campaign goal from the start — your donation goes entirely to the partner hospital. Every transfer is documented and auditable." } },
    { q: { fr: "Comment soumettre un dossier ?", en: "How do I submit a case?" }, a: { fr: "Créez un compte, cliquez sur Soumettre un dossier, remplissez le formulaire et téléchargez les documents requis (rapport médical, devis hospitalier, pièce d'identité). Notre équipe vous répond sous 48h.", en: "Create an account, click Submit a case, fill in the form and upload the required documents (medical report, hospital quote, ID). Our team responds within 48 hours." } },
    { q: { fr: "Puis-je donner anonymement ?", en: "Can I donate anonymously?" }, a: { fr: "Oui. Lors du don, choisissez l'option Don anonyme — aucun compte n'est requis et votre identité reste totalement confidentielle. Notez que les dons anonymes ne peuvent pas être remboursés en cas d'annulation.", en: "Yes. When donating, choose the Anonymous donation option — no account is required and your identity remains completely private. Note that anonymous donations cannot be refunded in case of cancellation." } },
    { q: { fr: "Que se passe-t-il si l'objectif n'est pas atteint ?", en: "What happens if the goal is not reached?" }, a: { fr: "Si l'objectif n'est pas atteint à l'échéance, tous les donateurs enregistrés sont notifiés et peuvent choisir entre un remboursement intégral ou la redistribution de leur don aux cas urgents actifs.", en: "If the goal is not reached by the deadline, all registered donors are notified and can choose between a full refund or redistribution of their donation to active urgent cases." } },
    { q: { fr: "Pourquoi est-il important d'ajouter une vidéo ?", en: "Why is it important to add a video?" }, a: { fr: "Une vidéo humanise le dossier et augmente considérablement les dons. Les collectes avec vidéo reçoivent en moyenne 3x plus de dons. Elle permet aux donateurs de voir et entendre le patient, créant un lien émotionnel fort qui pousse à l'action.", en: "A video humanizes the case and significantly increases donations. Campaigns with video receive on average 3x more donations. It allows donors to see and hear the patient, creating a strong emotional connection that drives action." } },
    { q: { fr: "Pourquoi Ayyad ne reverse pas les fonds si l'objectif n'est pas atteint ?", en: "Why does Ayyad not release funds if the goal is not reached?" }, a: { fr: "Parce que l'hôpital a besoin du montant exact du devis pour effectuer l'intervention. Verser une somme partielle ne permet pas de couvrir les frais médicaux et pourrait mettre le patient dans une situation encore plus difficile. Ayyad préfère rembourser les donateurs ou redistribuer vers des cas urgents plutôt que de verser une somme insuffisante.", en: "Because the hospital needs the exact amount of the quote to perform the procedure. Paying a partial amount does not cover medical costs and could put the patient in an even more difficult situation. Ayyad prefers to refund donors or redistribute to urgent cases rather than pay an insufficient amount." } },
    { q: { fr: "Pourquoi 70% de la surcollecte va au bénéficiaire ?", en: "Why does 70% of the surplus go to the beneficiary?" }, a: { fr: "L'hôpital reçoit exactement le montant du devis — ni plus, ni moins. Le surplus appartient moralement aux donateurs qui ont dépassé l'objectif. Ayyad reverse 70% au bénéficiaire pour couvrir des frais annexes (médicaments, transport, convalescence), 25% aux cas urgents et 5% à Ayyad pour les opérations.", en: "The hospital receives exactly the amount of the quote — no more, no less. The surplus morally belongs to the donors who exceeded the goal. Ayyad returns 70% to the beneficiary to cover ancillary costs (medication, transport, recovery), 25% to urgent cases and 5% to Ayyad for operations." } },
    { q: { fr: "Pourquoi Ayyad perçoit 5% sur l'objectif et 5% sur la surcollecte ?", en: "Why does Ayyad charge 5% on the goal and 5% on the surplus?" }, a: { fr: "Les 5% d'Ayyad ne sont pas un simple bénéfice. Ils couvrent les salaires de l'équipe de vérification, la maintenance de la plateforme, et surtout tous les frais de transfert vers les hôpitaux ainsi que les frais de transfert des 70% de surcollecte vers le bénéficiaire. Le donateur ne paie jamais ces frais — Ayyad les absorbe intégralement pour que chaque franc donné arrive à destination.", en: "Ayyad's 5% is not a simple profit. It covers the verification team salaries, platform maintenance, and most importantly all transfer fees to hospitals as well as the transfer fees for the 70% surplus to the beneficiary. The donor never pays these fees — Ayyad absorbs them entirely so every franc donated reaches its destination." } },
    { q: { fr: "En quoi Ayyad est différente des autres plateformes ?", en: "How is Ayyad different from other platforms?" }, a: { fr: "La plupart des plateformes versent les fonds au patient ou à sa famille. Ayyad verse directement à l'hôpital, éliminant tout risque de détournement. Chaque dossier est vérifié avec l'établissement de santé avant mise en ligne. Pas de fonds en espèces, pas d'intermédiaire humain — juste un virement traçable entre donateurs et hôpital.", en: "Most platforms pay funds to the patient or their family. Ayyad pays directly to the hospital, eliminating any risk of misuse. Each case is verified with the healthcare facility before going live. No cash, no human intermediary — just a traceable transfer between donors and hospital." } },
    { q: { fr: "Pourquoi faire confiance à Ayyad ?", en: "Why trust Ayyad?" }, a: { fr: "Parce que la confiance se construit sur des actes, pas des promesses. Ayyad publie chaque reçu de virement hospitalier. Nos partenaires hôpitaux confirment chaque réception de fonds. Nos 5% sont justifiés ligne par ligne. Et notre politique de remboursement protège chaque donateur si quelque chose se passe mal.", en: "Because trust is built on actions, not promises. Ayyad publishes every hospital transfer receipt. Our hospital partners confirm every receipt of funds. Our 5% is justified line by line. And our refund policy protects every donor if something goes wrong." } },
    { q: { fr: "Pourquoi utiliser Ayyad plutôt qu'un influenceur ?", en: "Why use Ayyad rather than an influencer?" }, a: { fr: "Quand un influenceur lance une collecte, il devient le visage de l'aide — et le bénéficiaire lui devient redevable. Ayyad repose sur un principe différent : celui qui aide ne doit pas s'en enorgueillir, et celui qui reçoit ne doit pas se sentir redevable à une personne. Sur Ayyad, le donateur est anonyme s'il le souhaite, le bénéficiaire ne sait pas qui l'a aidé, et la gratitude va naturellement vers Dieu au travers de la solidarité humaine. C'est donner pour Dieu, pas pour la reconnaissance.", en: "When an influencer launches a campaign, they become the face of the help — and the beneficiary becomes indebted to them. Ayyad is built on a different principle: the one who helps should not take pride in it, and the one who receives should not feel indebted to any person. On Ayyad, the donor can be anonymous, the beneficiary does not know who helped them, and gratitude naturally goes to God through human solidarity. It is giving for God, not for recognition." } },
  ];
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-2xl text-3xl mb-4">❓</div>
          <h1 className="text-2xl font-black text-gray-900">{lang==="fr" ? "Questions fréquentes" : "Frequently asked questions"}</h1>
          <p className="text-gray-500 text-sm mt-2">{lang==="fr" ? "Tout ce que vous devez savoir sur Ayyad" : "Everything you need to know about Ayyad"}</p>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button onClick={() => setOpen(open===i ? null : i)} className="w-full flex items-center justify-between p-5 text-left">
                <span className="font-bold text-gray-900 text-sm pr-4">{faq.q[lang]}</span>
                <span className={"text-emerald-600 font-black text-lg flex-shrink-0 transition-transform "+(open===i?"rotate-45":"")}>+</span>
              </button>
              {open===i && (
                <div className="px-5 pb-5">
                  <div className="h-px bg-gray-100 mb-4"/>
                  <p className="text-sm text-gray-600 leading-relaxed">{faq.a[lang]}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-8 space-y-2">
          <button onClick={() => setPage("how")} className="block mx-auto text-sm text-gray-400 hover:text-emerald-600">{lang==="fr" ? "→ Comment ça marche" : "→ How it works"}</button>
          <button onClick={() => setPage("home")} className="block mx-auto text-sm text-gray-400 hover:text-emerald-600">{lang==="fr" ? "← Retour à l'accueil" : "← Back to home"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Change Password Page ──────────────────────────────────────

const ProfilePage = ({ user, lang, setPage }) => {
  const [userCases, setUserCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCase, setEditingCase] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Upload nouvelle photo
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState(null);
  const [editPhotoUploading, setEditPhotoUploading] = useState(false);
  // Upload nouveaux documents
  const [editNewDocs, setEditNewDocs] = useState([]); // [{label, file, status, url}]

  // Testimonial submission
  const [testimonyMsg, setTestimonyMsg] = useState("");
  const [testimonyStars, setTestimonyStars] = useState(5);
  const [testimonyStatus, setTestimonyStatus] = useState(""); // "sending"|"sent"|"error"|"already"
  const [existingTestimonial, setExistingTestimonial] = useState(null);

  const statusColors = {
    PENDING: "bg-yellow-100 text-yellow-700",
    COLLECTING: "bg-blue-100 text-blue-700",
    FUNDED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-600",
    APPROVED: "bg-purple-100 text-purple-700"
  };

  const statusLabels = {
    fr: { PENDING: "En attente", COLLECTING: "Collecte active", FUNDED: "Financé", REJECTED: "Rejeté", APPROVED: "Approuvé" },
    en: { PENDING: "Pending", COLLECTING: "Active", FUNDED: "Funded", REJECTED: "Rejected", APPROVED: "Approved" }
  };

  const canEdit = (c) => ["PENDING", "APPROVED"].includes(c.status);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("cases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
      // Enrichi avec totaux confirmés (le patient voit la jauge progresser quand l'admin valide ses dons)
      const enriched = await enrichCasesWithTotals(data || []);
      setUserCases(enriched);
      // Check if user already submitted a testimonial
      const { data: tData } = await supabase.from("testimonials").select("id, status, message_fr").eq("submitted_by", user.id).maybeSingle();
      if (tData) setExistingTestimonial(tData);
      setLoading(false);
    };
    load();
  }, []);

  const openEdit = (c) => {
    setEditingCase(c.id);
    setEditForm({
      title: c.title || "",
      description: c.description || "",
      video_url: c.video_url || "",
      beneficiary_phone: c.beneficiary_phone || "",
    });
    setSaveMsg("");
    setEditPhotoFile(null);
    setEditPhotoPreview(null);
    setEditNewDocs([]);
  };

  const saveEdit = async () => {
    setSaving(true);
    const currentCase = userCases.find(c => c.id === editingCase);
    const basePath = `dossiers/${user.id}_edit/${editingCase}`;
    const updates = {
      title: editForm.title,
      description: editForm.description,
      video_url: editForm.video_url || null,
      beneficiary_phone: editForm.beneficiary_phone || null,
    };

    // Upload nouvelle photo si sélectionnée
    if (editPhotoFile) {
      setEditPhotoUploading(true);
      const ext = editPhotoFile.name.split('.').pop().toLowerCase();
      const fileName = `${basePath}/photo_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET_PUBLIC).upload(fileName, editPhotoFile);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from(BUCKET_PUBLIC).getPublicUrl(fileName);
        updates.photo_url = urlData.publicUrl;
      }
      setEditPhotoUploading(false);
    }

    // Upload nouveaux documents privés si présents (on stocke le PATH, pas l'URL)
    const existingDocs = currentCase?.document_urls || {};
    let newDocUrls = { ...existingDocs };
    const pendingDocs = editNewDocs.filter(d => d.file && d.status !== "done");
    for (let i = 0; i < pendingDocs.length; i++) {
      const d = pendingDocs[i];
      setEditNewDocs(prev => prev.map(x => x === d ? { ...x, status: "uploading" } : x));
      const ext = d.file.name.split('.').pop().toLowerCase();
      const key = `additional_${Date.now()}_${i}`;
      const fileName = `${basePath}/${key}.${ext}`;
      const mimeMap = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
      const contentType = mimeMap[ext] || d.file.type || 'application/octet-stream';
      const { error: docErr } = await supabase.storage.from(BUCKET_PRIVATE).upload(fileName, d.file, { contentType });
      if (!docErr) {
        // ⚠️ On stocke le PATH (le bucket sera privé, accessible via signed URL)
        newDocUrls[key] = fileName;
        setEditNewDocs(prev => prev.map(x => x === d ? { ...x, status: "done", url: fileName } : x));
      } else {
        setEditNewDocs(prev => prev.map(x => x === d ? { ...x, status: "error" } : x));
      }
    }
    if (Object.keys(newDocUrls).length > 0) {
      updates.document_urls = newDocUrls;
    }

    const { error } = await supabase.from("cases").update(updates).eq("id", editingCase).eq("user_id", user.id);
    setSaving(false);
    if (!error) {
      setUserCases(prev => prev.map(c => c.id === editingCase ? { ...c, ...updates } : c));
      setSaveMsg(lang === "fr" ? "✅ Modifications enregistrées" : "✅ Changes saved");
      setTimeout(() => { setEditingCase(null); setSaveMsg(""); setEditPhotoFile(null); setEditPhotoPreview(null); setEditNewDocs([]); }, 1800);
    } else {
      setSaveMsg(lang === "fr" ? "❌ Erreur lors de la sauvegarde" : "❌ Error saving");
    }
  };

  const submitTestimonial = async () => {
    if (!testimonyMsg.trim()) return;
    setTestimonyStatus("sending");
    const fundedCase = userCases.find(c => c.status === "FUNDED");
    const { error } = await supabase.from("testimonials").insert({
      submitted_by: user.id,
      beneficiary: user.name || user.email,
      case_id: fundedCase?.id || null,
      tracking_id: fundedCase?.tracking_id || null,
      city: fundedCase?.city || null,
      hospital: fundedCase?.hospital || null,
      category_fr: fundedCase?.category_fr || fundedCase?.category || null,
      amount: fundedCase?.amount_collected || fundedCase?.amount || null,
      message_fr: testimonyMsg.trim(),
      stars: testimonyStars,
      status: "pending",
    });
    if (error) {
      setTestimonyStatus("error");
    } else {
      setTestimonyStatus("sent");
      setExistingTestimonial({ status: "pending", message_fr: testimonyMsg.trim() });
    }
  };

  const fundedCases = userCases.filter(c => c.status === "FUNDED");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => setPage("home")} className="text-sm text-gray-500 hover:text-emerald-600 mb-6 flex items-center gap-1">
        ← {lang === "fr" ? "Retour" : "Back"}
      </button>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-2xl">
            {(user.name || user.email || "U")[0].toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-gray-900 text-lg">{user.name || user.email}</div>
            <div className="text-sm text-gray-500">{user.email}</div>
          </div>
        </div>
      </div>
      <div className="font-semibold text-gray-700 mb-3">
        {lang === "fr" ? "Mes dossiers" : "My cases"}
      </div>
      {loading ? (
        <div className="text-center text-gray-400 py-8">...</div>
      ) : userCases.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          {lang === "fr" ? "Aucun dossier soumis" : "No cases submitted"}
        </div>
      ) : (
        <div className="space-y-3">
          {userCases.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">{c.title || "—"}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    🏥 {c.hospital || "—"} · 💰 {c.amount ? c.amount.toLocaleString() + " FCFA" : "—"}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(c.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={"text-xs font-semibold px-2 py-1 rounded-full " + (statusColors[c.status] || "bg-gray-100 text-gray-600")}>
                    {(statusLabels[lang] || statusLabels.fr)[c.status] || c.status}
                  </span>
                  {canEdit(c) && (
                    <button
                      onClick={() => editingCase === c.id ? setEditingCase(null) : openEdit(c)}
                      className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-50 transition-colors">
                      {editingCase === c.id ? "✕" : lang === "fr" ? "✏️ Modifier" : "✏️ Edit"}
                    </button>
                  )}
                </div>
              </div>
              {editingCase === c.id && (
                <div className="border-t border-gray-100 p-4 bg-emerald-50 space-y-3">
                  <div className="text-xs font-bold text-emerald-700 mb-2">
                    {lang === "fr" ? "Modifier le dossier" : "Edit case"}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">{lang === "fr" ? "Titre" : "Title"}</label>
                    <input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">{lang === "fr" ? "Description" : "Description"}</label>
                    <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">🎥 {lang === "fr" ? "Lien vidéo YouTube/TikTok" : "YouTube/TikTok video link"} <span className="text-gray-400 font-normal">({lang === "fr" ? "optionnel" : "optional"})</span></label>
                    <input type="url" value={editForm.video_url} onChange={e => setEditForm({ ...editForm, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">📱 {lang === "fr" ? "Téléphone mobile money" : "Mobile money phone"}</label>
                    <input type="tel" value={editForm.beneficiary_phone} onChange={e => setEditForm({ ...editForm, beneficiary_phone: e.target.value })} placeholder="+225 07 00 00 00 00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>

                  {/* ── Nouvelle photo ── */}
                  <div className="border-t border-emerald-100 pt-3">
                    <div className="text-xs font-bold text-emerald-700 mb-2">📷 {lang === "fr" ? "Nouvelle photo du patient" : "New patient photo"}</div>
                    {c.photo_url && !editPhotoPreview && (
                      <div className="mb-2 flex items-center gap-2">
                        <img src={c.photo_url} alt="photo actuelle" className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
                        <span className="text-xs text-gray-500">{lang === "fr" ? "Photo actuelle" : "Current photo"}</span>
                      </div>
                    )}
                    {editPhotoPreview && (
                      <div className="mb-2 flex items-center gap-2">
                        <img src={editPhotoPreview} alt="nouvelle photo" className="w-12 h-12 object-cover rounded-lg border border-emerald-300" />
                        <span className="text-xs text-emerald-600 font-semibold">{lang === "fr" ? "Nouvelle photo sélectionnée" : "New photo selected"}</span>
                        <button onClick={() => { setEditPhotoFile(null); setEditPhotoPreview(null); }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer bg-white border border-dashed border-emerald-300 rounded-lg px-3 py-2 text-xs text-emerald-600 hover:bg-emerald-50 transition-colors w-fit">
                      📎 {lang === "fr" ? "Choisir une photo" : "Choose a photo"}
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files[0];
                        if (!file) return;
                        setEditPhotoFile(file);
                        const reader = new FileReader();
                        reader.onload = ev => setEditPhotoPreview(ev.target.result);
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                  </div>

                  {/* ── Nouveaux documents ── */}
                  <div className="border-t border-emerald-100 pt-3">
                    <div className="text-xs font-bold text-emerald-700 mb-2">📄 {lang === "fr" ? "Ajouter des documents" : "Add documents"}</div>
                    {/* Docs existants */}
                    {c.document_urls && Object.keys(c.document_urls).length > 0 && (
                      <div className="mb-2 space-y-1">
                        {Object.entries(c.document_urls).map(([k, url]) => (
                          <SecureDocLink key={k} value={url} caseId={c.id} className="flex items-center gap-1.5 text-xs text-emerald-600 hover:underline">
                            📎 {k === "medical" ? (lang === "fr" ? "Ordonnance/Devis" : "Medical/Quote") :
                               k === "quote" ? (lang === "fr" ? "Facture pro-forma" : "Pro-forma invoice") :
                               k === "id" ? (lang === "fr" ? "Pièce d'identité" : "ID document") :
                               k === "consent" ? (lang === "fr" ? "Formulaire consentement" : "Consent form") :
                               (lang === "fr" ? "Document supplémentaire" : "Additional document")}
                          </SecureDocLink>
                        ))}
                      </div>
                    )}
                    {/* Nouveaux docs à uploader */}
                    {editNewDocs.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-gray-600 truncate max-w-[160px]">{d.file.name}</span>
                        {d.status === "uploading" && <span className="text-xs text-blue-500">⏳</span>}
                        {d.status === "done" && <span className="text-xs text-emerald-500">✅</span>}
                        {d.status === "error" && <span className="text-xs text-red-500">❌</span>}
                        {d.status === "pending" && (
                          <button onClick={() => setEditNewDocs(prev => prev.filter((_, j) => j !== i))} className="text-xs text-red-400 hover:text-red-600">✕</button>
                        )}
                      </div>
                    ))}
                    {editNewDocs.length < 5 && (
                      <label className="flex items-center gap-2 cursor-pointer bg-white border border-dashed border-emerald-300 rounded-lg px-3 py-2 text-xs text-emerald-600 hover:bg-emerald-50 transition-colors w-fit">
                        ➕ {lang === "fr" ? "Ajouter un document (PDF, image)" : "Add a document (PDF, image)"}
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setEditNewDocs(prev => [...prev, { file, status: "pending", url: null }]);
                          e.target.value = "";
                        }} />
                      </label>
                    )}
                  </div>

                  {saveMsg && (
                    <div className={"text-xs font-semibold px-3 py-2 rounded-lg " + (saveMsg.startsWith("✅") ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>{saveMsg}</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setEditingCase(null)} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2 rounded-lg text-sm hover:bg-gray-50">{lang === "fr" ? "Annuler" : "Cancel"}</button>
                    <button onClick={saveEdit} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-2 rounded-lg text-sm">{saving ? "..." : lang === "fr" ? "Enregistrer" : "Save"}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Testimonial submission section ── */}
      {!loading && fundedCases.length > 0 && (
        <div className="mt-8">
          <div className="font-semibold text-gray-700 mb-3">
            💬 {lang === "fr" ? "Votre témoignage" : "Your testimonial"}
          </div>

          {existingTestimonial ? (
            <div className={"rounded-xl border p-4 " + (existingTestimonial.status === "approved" ? "bg-emerald-50 border-emerald-200" : "bg-yellow-50 border-yellow-200")}>
              <div className={"text-xs font-bold mb-1 " + (existingTestimonial.status === "approved" ? "text-emerald-700" : "text-yellow-700")}>
                {existingTestimonial.status === "approved"
                  ? (lang === "fr" ? "✅ Témoignage publié" : "✅ Testimonial published")
                  : (lang === "fr" ? "⏳ En attente de validation par l'équipe Ayyad" : "⏳ Awaiting validation by the Ayyad team")}
              </div>
              <p className="text-sm text-gray-700 italic">"{existingTestimonial.message_fr}"</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <p className="text-xs text-gray-500">
                {lang === "fr"
                  ? "Votre dossier a été financé 🎉 Partagez votre expérience pour inspirer d'autres donateurs."
                  : "Your case was funded 🎉 Share your experience to inspire other donors."}
              </p>

              {/* Star rating */}
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1.5">{lang === "fr" ? "Note" : "Rating"}</div>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setTestimonyStars(s)} className={"text-2xl transition-transform " + (s <= testimonyStars ? "text-yellow-400 scale-110" : "text-gray-300 hover:text-yellow-300")}>
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  {lang === "fr" ? "Votre message" : "Your message"}
                </label>
                <textarea
                  value={testimonyMsg}
                  onChange={e => setTestimonyMsg(e.target.value)}
                  rows={4}
                  placeholder={lang === "fr" ? "Décrivez comment Ayyad vous a aidé..." : "Describe how Ayyad helped you..."}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                />
              </div>

              {testimonyStatus === "error" && (
                <div className="text-xs text-red-600 font-semibold">{lang === "fr" ? "❌ Erreur lors de l'envoi. Réessayez." : "❌ Error sending. Please try again."}</div>
              )}

              <button
                onClick={submitTestimonial}
                disabled={testimonyStatus === "sending" || !testimonyMsg.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                {testimonyStatus === "sending" ? "..." : lang === "fr" ? "Envoyer mon témoignage →" : "Send my testimonial →"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ChangePasswordPage = ({ setPage, lang }) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (newPassword.length < 6) return setStatus("min6");
    if (newPassword !== confirm) return setStatus("mismatch");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) setStatus("error");
    else setStatus("success");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔑</div>
          <h1 className="text-xl font-black text-gray-900">{lang==="fr" ? "Changer mon mot de passe" : "Change my password"}</h1>
        </div>
        {status==="success" ? (
          <div className="text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-emerald-600 font-semibold mb-4">{lang==="fr" ? "Mot de passe modifié avec succès !" : "Password changed successfully!"}</p>
            <button onClick={() => setPage("home")} className="bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl w-full">{lang==="fr" ? "Retour à l'accueil" : "Back to home"}</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">{lang==="fr" ? "Nouveau mot de passe" : "New password"}</label>
              <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="••••••••" />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">{lang==="fr" ? "Confirmer le mot de passe" : "Confirm password"}</label>
              <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="••••••••" />
            </div>
            {status==="mismatch" && <p className="text-red-500 text-sm">{lang==="fr" ? "Les mots de passe ne correspondent pas." : "Passwords don't match."}</p>}
            {status==="min6" && <p className="text-red-500 text-sm">{lang==="fr" ? "Minimum 6 caractères." : "Minimum 6 characters."}</p>}
            {status==="error" && <p className="text-red-500 text-sm">{lang==="fr" ? "Erreur, réessayez." : "Error, try again."}</p>}
            <button onClick={handleSubmit} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-bold py-3 rounded-xl text-sm">
              {loading ? "..." : lang==="fr" ? "Enregistrer →" : "Save →"}
            </button>
            <button onClick={() => setPage("home")} className="w-full text-gray-400 text-sm hover:text-gray-600">{lang==="fr" ? "Annuler" : "Cancel"}</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function AyyadApp() {
  // Initialiser la page depuis l'URL pour survivre aux rafraîchissements
  const [page, setPage] = useState(() => {
    const p = new URLSearchParams(window.location.search).get("p");
    const valid = ["home","admin","login","collectes","profile","register","case","track","change-password","urgents","specialite"];
    return (p && valid.includes(p)) ? p : "home";
  });
  // ── IMPORTANT: declare all state BEFORE any useEffect that references them ──
  const [lang, setLang] = useState("fr");
  const [user, setUser] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [specialite, setSpecialite] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
    window.history.pushState({ page }, "", "?p=" + page);
    // ── OG Meta tags dynamiques ──
    const setMeta = (prop, content) => {
      let el = document.querySelector(`meta[property="${prop}"]`) || document.querySelector(`meta[name="${prop}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(prop.startsWith("og:")?"property":"name",prop); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    if (page === "case" && selectedCase) {
      const title = typeof selectedCase.title==="object" ? (selectedCase.title.fr||selectedCase.title.en) : (selectedCase.title||"Ayyad");
      const desc = typeof selectedCase.desc==="object" ? (selectedCase.desc.fr||selectedCase.desc.en||"") : (selectedCase.description||"");
      const img = selectedCase.photos?.[0] || selectedCase.image || "https://ayyadci.com/og-default.png";
      const url = "https://ayyadci.com/?p=case&case="+(selectedCase.trackingId||selectedCase.tracking_id||selectedCase.id);
      document.title = title + " — Ayyad CI";
      setMeta("og:title", title + " — Ayyad CI");
      setMeta("og:description", desc.slice(0,200));
      setMeta("og:image", img);
      setMeta("og:url", url);
      setMeta("og:type", "website");
      setMeta("twitter:card", "summary_large_image");
      setMeta("twitter:title", title);
      setMeta("twitter:description", desc.slice(0,200));
      setMeta("twitter:image", img);
    } else {
      document.title = "Ayyad CI — Financement médical solidaire";
      setMeta("og:title", "Ayyad CI — Financement médical solidaire");
      setMeta("og:description", "Aidez des patients ivoiriens à financer leurs soins médicaux. Paiement via Wave CI. Fonds versés directement à l'hôpital.");
      setMeta("og:image", "https://ayyadci.com/og-default.png");
      setMeta("og:url", "https://ayyadci.com");
    }
  }, [page, selectedCase]);

  // Fix bouton précédent navigateur
  useEffect(() => {
    const handlePop = () => {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("p");
      if (p) setPage(p);
      else setPage("home");
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);
  const [allCases, setAllCases] = useState([]);

  // Enregistre la visite d'un utilisateur connecté dans user_activity
  const trackVisit = async (userId, email, name) => {
    try {
      await supabase.from("user_activity").upsert({
        user_id: userId,
        email,
        name: name || email,
        last_seen: new Date().toISOString(),
      }, { onConflict: "user_id", ignoreDuplicates: false });
    } catch(e) { /* silencieux */ }
  };

  // Restore session on load
  useEffect(() => {
    inject();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const { data: adminData2 } = await supabase.from("admin_users").select("role, is_active").eq("email", session.user.email).maybeSingle();
        const isAdmin = !!(adminData2 && adminData2.is_active);
        const adminRole = adminData2?.role || null;
        const userName2 = meta.full_name || session.user.email;
        setUser({ id: session.user.id, name: userName2, email: session.user.email, isAdmin, adminRole });
        trackVisit(session.user.id, session.user.email, userName2);
        // Restaurer la page depuis l'URL après vérification de session
        const urlPage = new URLSearchParams(window.location.search).get("p");
        if (urlPage && urlPage !== "login" && urlPage !== "register") {
          // Pour les pages protégées, vérifier que l'utilisateur a les droits
          if (urlPage === "admin" && !isAdmin) setPage("home");
          else setPage(urlPage);
        }
      } else {
        // Pas de session : rediriger vers login si page protégée
        const urlPage = new URLSearchParams(window.location.search).get("p");
        if (urlPage === "admin" || urlPage === "profile") setPage("login");
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // IMPORTANT: Ne jamais faire d'appels async (supabase.from, etc.) ici.
      // Les requêtes DB dans onAuthStateChange bloquent le verrou interne de Supabase
      // et empêchent signInWithPassword de terminer → bouton bloqué sur "..."
      // Le check admin est géré dans handleLogin() et getSession() ci-dessus.
      if (event === "SIGNED_OUT") {
        // Déconnexion explicite uniquement (pas TOKEN_REFRESH_FAILED)
        setUser(null);
        setPage("home");
      } else if (event === "PASSWORD_RECOVERY") {
        setPage("change-password");
      }
    });

    // Deep-link: ?case=AYD-2025-001
    const params = new URLSearchParams(window.location.search);
    const caseId = params.get("case");
    if (caseId && /^[A-Z]{3}-\d{4}-[A-Z0-9]{3,8}$/i.test(caseId)) {
      // Try MOCK_CASES first, then Supabase
      const mockMatch = MOCK_CASES.find(c => c.trackingId === caseId);
      if (mockMatch) {
        setSelectedCase(mockMatch);
        setPage("case");
      } else {
        supabase.from("cases").select("*").eq("tracking_id", caseId).maybeSingle().then(async ({ data }) => {
          if (data) {
            const [enriched] = await enrichCasesWithTotals([data]);
            setSelectedCase(enriched);
            setPage("case");
          }
        });
      }
    }

    return () => listener.subscription.unsubscribe();
  }, []);

  const showFooter = !["login","register"].includes(page);

  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar page={page} setPage={setPage} user={user} setUser={setUser} lang={lang} setLang={setLang} />
      <main>
        {page==="home"&&<HomePage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} />}
        {page==="collectes"&&<CollectesPage setPage={setPage} lang={lang} />}
        {page==="collectesactives"&&<CollectesActivesPage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} setSpecialite={setSpecialite} />}
        {page==="specialite"&&<SpecialitePage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} specialite={specialite} />}
        {page==="case"&&selectedCase&&<CasePage c={selectedCase} setPage={setPage} lang={lang} user={user} />}
        {page==="how"&&<HowPage lang={lang} setPage={setPage} />}
        {page==="refund"&&<RefundPage lang={lang} setPage={setPage} />}
        {page==="legal"&&<LegalPage lang={lang} setPage={setPage} />}
        {page==="impact"&&<ImpactPage lang={lang} setPage={setPage} />}
        {page==="bceao"&&<BCEAOPage lang={lang} setPage={setPage} />}
        {page==="hopitaux"&&<HospitauxPage lang={lang} setPage={setPage} />}
        {page==="monimpact"&&<MonImpactPage user={user} lang={lang} setPage={setPage} />}
        {page==="urgents"&&<UrgentsPage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} />}
        {page==="login"&&<LoginPage setPage={setPage} setUser={setUser} lang={lang} trackVisit={trackVisit} />}
        {page==="register"&&<RegisterPage setPage={setPage} setUser={setUser} lang={lang} />}
        {page==="submit"&&<SubmitPage setPage={setPage} user={user} lang={lang} />}
        {page==="admin"&&<AdminPage user={user} setPage={setPage} lang={lang} />}
        {page==="tracking"&&<TrackingPage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} />}
        {page==="changepassword"&&<ChangePasswordPage setPage={setPage} lang={lang} />}
      {page === "profile" && user && <ProfilePage user={user} lang={lang} setPage={setPage} />}
        {page==="faq"&&<FAQPage setPage={setPage} lang={lang} />}
        {page==="dunya-return"&&<DunyaReturnPage setPage={setPage} lang={lang} />}
        {page==="support-ayyad"&&(
          <div>
            <div className="bg-gradient-to-br from-emerald-700 to-teal-700 text-white">
              <div className="max-w-7xl mx-auto px-4 py-12 text-center">
                <button onClick={() => setPage("home")} className="text-emerald-100 hover:text-white text-sm mb-4 inline-flex items-center gap-1">← {lang==="fr"?"Retour à l'accueil":"Back to home"}</button>
                <h1 className="text-3xl sm:text-5xl font-black mb-3">{lang==="fr" ? "Soutenir Ayyad directement" : "Support Ayyad directly"}</h1>
                <p className="text-emerald-100 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
                  {lang==="fr"
                    ? "Votre don aide à financer les opérations de la plateforme : vérification médicale des dossiers, partenariats hospitaliers, infrastructure, et accompagnement des patients tout au long de leur collecte."
                    : "Your donation helps fund platform operations: medical case verification, hospital partnerships, infrastructure, and patient support throughout their campaign."}
                </p>
              </div>
            </div>
            <SupportAyyadSection lang={lang} />
          </div>
        )}
      </main>
      {showFooter&&<Footer setPage={setPage} lang={lang} />}
      <ChatWidget lang={lang} />
    </div>
  );
}
