import { inject } from "@vercel/analytics";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ──────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ── Resend Email ─────────────────────────────────────────────
const RESEND_API_KEY = import.meta.env.VITE_RESEND_KEY || "";
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "kedhard80@gmail.com";

const sendEmail = async ({ to, subject, html }) => {
  if (!RESEND_API_KEY) { console.warn("Resend key manquante"); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: "Ayyad <onboarding@resend.dev>", to: [ADMIN_EMAIL], subject, html })
      // ⚠️ En mode test Resend, tous les emails sont redirigés vers ADMIN_EMAIL
      // Quand le domaine ayyad.ci sera vérifié sur Resend, remplacer "to: [ADMIN_EMAIL]" par "to: Array.isArray(to) ? to : [to]"
    });
    const data = await res.json();
    if (!res.ok) console.error("Resend error:", data);
    else console.log("Email envoyé:", data.id);
  } catch(e) { console.log("Email error:", e); }
};

const emailDonConfirm = ({ donorEmail, donorName, amount, beneficiary, caseTitle }) =>
  sendEmail({
    to: donorEmail || ADMIN_EMAIL,
    subject: `✅ Don de ${amount} FCFA enregistré — Ayyad`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:auto">
      <div style="background:#0d5c2e;padding:24px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="color:#C9A84C;margin:0;font-size:24px">AYYAD</h1>
        <p style="color:#a7f3d0;margin:4px 0 0">Financement médical solidaire</p>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="color:#111">Merci ${donorName || ""} pour votre don 💚</h2>
        <p style="color:#6b7280">Votre don a bien été enregistré :</p>
        <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:4px 0"><strong>Montant :</strong> ${amount} FCFA</p>
          <p style="margin:4px 0"><strong>Bénéficiaire :</strong> ${beneficiary}</p>
          <p style="margin:4px 0"><strong>Collecte :</strong> ${caseTitle}</p>
        </div>
        <p style="color:#6b7280;font-size:14px">Les fonds seront versés directement à l'hôpital partenaire. Aucuns frais cachés.</p>
        <p style="color:#6b7280;font-size:14px">Merci de soutenir la vie. 🙏</p>
        <a href="https://ayyad.vercel.app" style="background:#0d5c2e;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px;font-size:13px">Suivre la collecte →</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">© 2025 Ayyad CI · ayyad.vercel.app</p>
      </div>
    </div>`
  });

const emailNewCase = ({ caseTitle, hospital, city, amount }) =>
  sendEmail({
    to: ADMIN_EMAIL,
    subject: `📋 Nouveau dossier soumis : ${caseTitle}`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:auto">
      <div style="background:#0d5c2e;padding:24px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="color:#C9A84C;margin:0">AYYAD — Admin</h1>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="color:#111">📋 Nouveau dossier à vérifier</h2>
        <div style="background:#fefce8;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #fde047">
          <p style="margin:4px 0"><strong>Titre :</strong> ${caseTitle}</p>
          <p style="margin:4px 0"><strong>Hôpital :</strong> ${hospital}</p>
          <p style="margin:4px 0"><strong>Ville :</strong> ${city}</p>
          <p style="margin:4px 0"><strong>Montant demandé :</strong> ${amount} FCFA</p>
        </div>
        <a href="https://ayyad.vercel.app" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Voir le dashboard Admin →</a>
      </div>
    </div>`
  });

const emailCaseApproved = ({ beneficiaryEmail, beneficiaryName, caseTitle, trackingId }) =>
  sendEmail({
    to: beneficiaryEmail || ADMIN_EMAIL,
    subject: `🎉 Votre dossier a été approuvé — Ayyad`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:auto">
      <div style="background:#0d5c2e;padding:24px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="color:#C9A84C;margin:0">AYYAD</h1>
        <p style="color:#a7f3d0;margin:4px 0 0">Financement médical solidaire</p>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="color:#111">🎉 Bonne nouvelle, ${beneficiaryName || ""}!</h2>
        <p style="color:#6b7280">Votre dossier <strong>${caseTitle}</strong> a été vérifié et approuvé par l'équipe Ayyad. La collecte est maintenant en ligne.</p>
        <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:4px 0"><strong>ID de suivi :</strong> <span style="font-family:monospace;color:#0d5c2e">${trackingId || "—"}</span></p>
          <p style="margin:4px 0;font-size:13px;color:#6b7280">Conservez cet identifiant pour suivre votre collecte.</p>
        </div>
        <p style="color:#6b7280;font-size:14px">Partagez le lien de votre collecte avec vos proches pour maximiser les dons.</p>
        <a href="https://ayyad.vercel.app/?case=${trackingId}" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Voir ma collecte →</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">© 2025 Ayyad CI · ayyad.vercel.app</p>
      </div>
    </div>`
  });

const emailCaseRejected = ({ beneficiaryEmail, beneficiaryName, caseTitle, reason }) =>
  sendEmail({
    to: beneficiaryEmail || ADMIN_EMAIL,
    subject: `ℹ️ Mise à jour de votre dossier — Ayyad`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:auto">
      <div style="background:#0d5c2e;padding:24px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="color:#C9A84C;margin:0">AYYAD</h1>
        <p style="color:#a7f3d0;margin:4px 0 0">Financement médical solidaire</p>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="color:#111">Mise à jour de votre dossier</h2>
        <p style="color:#6b7280">Après vérification, votre dossier <strong>${caseTitle}</strong> n'a pas pu être approuvé en l'état.</p>
        ${reason ? `<div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #fecaca"><p style="margin:0;color:#b91c1c"><strong>Motif :</strong> ${reason}</p></div>` : ""}
        <p style="color:#6b7280;font-size:14px">Vous pouvez soumettre un nouveau dossier avec des documents complets et conformes.</p>
        <p style="color:#6b7280;font-size:14px">Pour toute question : <a href="mailto:support@ayyad.ci" style="color:#0d5c2e">support@ayyad.ci</a></p>
        <a href="https://ayyad.vercel.app" style="background:#6b7280;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Soumettre un nouveau dossier →</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">© 2025 Ayyad CI · ayyad.vercel.app</p>
      </div>
    </div>`
  });
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
    hero: { badge: "Plateforme vérifiée & sécurisée", title1: "Donner de la force à ceux", title2: "qui en ont besoin", sub: "Parce que soutenir une vie, c'est en sauver une. Ensemble, nous donnons de la force à ceux qui gardent encore espoir.", cta1: "Collectes terminées & témoignages", cta2: "Soumettre un dossier" },
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
      tabs: [{ id:"overview",label:"Vue d'ensemble",icon:"📊" },{ id:"cases",label:"Dossiers",icon:"📋" },{ id:"fraud",label:"Fraude",icon:"🔍" },{ id:"payouts",label:"Virements",icon:"🏦" },{ id:"team",label:"Équipe",icon:"👥" }],
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
    footer: { tagline: "Financer la santé pour tous en Afrique.", platform: "Plateforme", trust: "Confiance", legal: "Légal", platformLinks: ["Collectes actives","Comment ça marche","Soumettre un dossier"], trustLinks: ["Vérification dossiers","Sécurité des paiements","Rapport d'impact"], legalLinks: ["Mentions légales","FAQ","Conformité BCEAO"], rights: "© 2025 Ayyad CI — Tous droits réservés" },
    howPage: { title: "Comment fonctionne Ayyad ?", sub: "Transparent, sécurisé, conçu pour l'Afrique", forDonors: { icon:"💚",title:"Pour les donateurs",steps:["Parcourez les collectes vérifiées actives","Choisissez librement votre montant","Payez via Wave CI ou carte bancaire","Vous êtes débité exactement du montant choisi","L'argent arrive directement à l'hôpital"] }, forBenef: { icon:"🏥",title:"Pour les bénéficiaires",steps:["Créez un compte et soumettez votre dossier médical","Téléchargez rapport médical, devis, pièce d'identité","Notre équipe vérifie avec l'hôpital partenaire","Votre collecte est mise en ligne sous 48h","Les fonds sont versés directement à l'hôpital"] }, feeTitle: "La règle des 5% — Incluse dans l'objectif", feeSub: "Ayyad intègre sa commission de 5% directement dans l'objectif de collecte. Vous donnez 10 000 FCFA, l'hôpital reçoit 10 000 FCFA. Rien n'est prélevé sur votre don.", youGive: "Vous donnez", collectReceives: "L'hôpital reçoit", ayyadFee: "Frais Ayyad (inclus dans l'objectif)" },
  },
  en: {
    nav: { collections: "Campaigns", how: "How it works", admin: "Administration", login: "Login", start: "Get started", logout: "Logout", medicalFinancing: "Medical funding" },
    hero: { badge: "Verified & secure platform", title1: "Giving strength to those", title2: "who need it most", sub: "Because supporting a life means saving one. Together, we give strength to those who still hold on to hope.", cta1: "Completed campaigns & testimonials", cta2: "Submit a case" },
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
      tabs: [{ id:"overview",label:"Overview",icon:"📊" },{ id:"cases",label:"Cases",icon:"📋" },{ id:"fraud",label:"Fraud",icon:"🔍" },{ id:"payouts",label:"Payouts",icon:"🏦" }],
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
    footer: { tagline: "Funding healthcare for all in Africa.", platform: "Platform", trust: "Trust", legal: "Legal", platformLinks: ["Active campaigns","How it works","Submit a case"], trustLinks: ["Case verification","Payment security","Impact report"], legalLinks: ["Legal notice","Privacy policy","BCEAO compliance"], rights: "© 2025 Ayyad CI — All rights reserved" },
    howPage: { title: "How does Ayyad work?", sub: "Transparent, secure, built for Africa", forDonors: { icon:"💚",title:"For donors",steps:["Browse verified active campaigns","Freely choose your amount","Pay via Wave CI or card","You are charged exactly the amount you chose","The money goes directly to the hospital"] }, forBenef: { icon:"🏥",title:"For beneficiaries",steps:["Create an account and submit your medical case","Upload medical report, quote, identity document","Our team verifies with the partner hospital","Your campaign goes live within 48h","Funds are transferred directly to the hospital"] }, feeTitle: "The 5% rule — Built into the goal", feeSub: "Ayyad includes its 5% fee directly in the campaign goal. You give 10,000 FCFA, the hospital receives 10,000 FCFA. Nothing is deducted from your donation.", youGive: "You give", collectReceives: "Hospital receives", ayyadFee: "Ayyad fee (included in goal)" },
  }
};

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
  { id:1, type:{fr:"Devis dupliqué",en:"Duplicate quote"}, sev:"high", case:{fr:"Dossier #1042 & #1038",en:"Case #1042 & #1038"}, time:"14:32", resolved:false },
  { id:2, type:{fr:"Multi-comptes détecté",en:"Multi-account detected"}, sev:"critical", case:{fr:"User #552 (3 comptes)",en:"User #552 (3 accounts)"}, time:"11:15", resolved:false },
  { id:3, type:{fr:"Don suspect > 500k FCFA",en:"Suspicious donation > 500k FCFA"}, sev:"medium", case:{fr:"Donation #7821 — anonyme",en:"Donation #7821 — anonymous"}, time:"09:47", resolved:true },
];

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("fr-CI").format(n) + " FCFA";
const pct = (c, r) => Math.min(100, Math.round((c / r) * 100));

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

// ── Navbar ────────────────────────────────────────────────────
const Navbar = ({ page, setPage, user, setUser, lang, setLang }) => {
  const t = T[lang].nav;
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPage("home");
  };

  const AyyadLogo = () => (
    <svg width="42" height="42" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="35" cy="35" r="33" fill="#0d5c2e"/>
      <circle cx="35" cy="35" r="33" fill="none" stroke="#C9A84C" strokeWidth="2.5"/>
      <rect x="29" y="18" width="12" height="34" rx="3" fill="#C9A84C"/>
      <rect x="18" y="29" width="34" height="12" rx="3" fill="#C9A84C"/>
      <path d="M31 32 C31 30.5, 32.5 29.5, 35 31.5 C37.5 29.5, 39 30.5, 39 32 C39 34, 35 37, 35 37 C35 37, 31 34, 31 32Z" fill="#0d5c2e"/>
    </svg>
  );

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm" onClick={() => setDropdownOpen(null)}>
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16 gap-4">
        {/* Logo */}
        <button onClick={() => setPage("home")} className="flex items-center gap-3 flex-shrink-0">
          <AyyadLogo />
          <div className="hidden sm:block">
            <div className="font-black text-xl text-gray-900 leading-tight" style={{fontFamily:"Georgia, serif", letterSpacing:"1px"}}>AYYAD</div>
            <div className="text-xs font-semibold" style={{color:"#C9A84C", letterSpacing:"1px"}}>Financement médical solidaire</div>
          </div>
        </button>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {user?.isAdmin && (
            <button onClick={() => setPage("admin")} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${page==="admin" ? "text-emerald-600 bg-emerald-50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}`}>{t.admin}</button>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <LangToggle lang={lang} setLang={setLang} />
          {user ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage("profile")} className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm hover:bg-emerald-200 transition-colors">{(user.name||user.email||"U")[0].toUpperCase()}</button>
              <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">{user.name||user.email}</span>
              <button onClick={() => setPage("changepassword")} className="text-xs text-gray-400 hover:text-emerald-600 ml-1">🔑</button>
              <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-500">{t.logout}</button>
            </div>
          ) : (
            <>
              <button onClick={() => setPage("login")} className="text-sm font-medium text-gray-600 hover:text-gray-900">{t.login}</button>
              <button onClick={() => setPage("submit")} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm">{lang==="fr" ? "Soumettre un dossier" : "Submit a case"}</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

// ── Case Card ─────────────────────────────────────────────────
const CaseCard = ({ c, lang, t, onClick }) => {
  const percent = pct(c.collected, c.required);
  const funded = c.status==="FUNDED";
  const tc = t.card;
  const photo = c.photo_url || (c.photos && c.photos[0]) || null;
  return (
    <div onClick={onClick} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden group">
      {/* Photo bénéficiaire */}
      <div className="h-48 relative overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50">
        {photo ? (
          <img src={photo} alt={c.beneficiary} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div className="text-4xl opacity-30">📷</div>
            <span className="text-xs text-gray-400 font-medium">Photo à venir</span>
          </div>
        )}
        {/* Badge spécialité en overlay bas-gauche */}
        <div className="absolute bottom-2 left-2">
          <span className="bg-white/90 backdrop-blur-sm text-gray-700 text-xs font-bold px-2 py-1 rounded-full shadow-sm">{c.image && !c.image.startsWith("http") ? c.image : "🏥"} {c.category[lang]}</span>
        </div>
        {/* Badge urgent */}
        {c.urgent && (
          <div className="absolute top-2 left-2">
            <span className="bg-red-600 text-white text-xs font-black px-2 py-1 rounded-full animate-pulse">🚨 URGENT</span>
          </div>
        )}
        {funded && (
          <div className="absolute top-2 right-2">
            <span className="bg-emerald-600 text-white text-xs font-bold px-2 py-1 rounded-full">✅ Financé</span>
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="mb-2">
          <h3 className="font-bold text-gray-900 text-sm leading-snug group-hover:text-emerald-700 transition-colors">{c.title[lang]}</h3>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-4">🏥 <span className="truncate">{c.hospital}</span> · 📍 <span>{c.city}</span></div>
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-bold text-emerald-700">{fmt(c.collected)}</span>
            <span className="text-gray-400">{tc.on} {fmt(c.required)}</span>
          </div>
          <ProgressBar percent={percent} />
          <div className="text-right text-xs text-emerald-600 font-semibold mt-0.5">{percent}%</div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>👥 {c.donors} {tc.donors}</span>
          {funded?<span className="text-emerald-600 font-bold">{tc.funded}</span>:<span className="text-amber-600 font-medium">⏳ {c.daysLeft} {tc.daysLeft}</span>}
        </div>
        {c.trackingId && (
          <div className="mt-3 flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
            <span className="text-[10px] text-gray-400 font-medium">ID Suivi</span>
            <span className="text-xs font-mono font-bold text-emerald-700">{c.trackingId}</span>
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <ShareButton c={c} lang={lang} size="small" />
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
      <div className="max-w-6xl mx-auto px-4 py-6">
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

        {/* Carousel — slide horizontal */}
        <div style={{position:"relative", overflow:"hidden", borderRadius:"16px"}}>
          <div style={{
            display:"flex",
            transform: "translateX(-" + (current * 100) + "%)",
            transition: "transform 700ms cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}>
            {urgentCases.map((c, i) => {
              const percent = pct(c.collected, c.required);
              return (
                <div key={c.id} style={{minWidth:"100%", boxSizing:"border-box"}}>
                  <button onClick={() => { setSelectedCase(c); setPage("case"); }}
                    className="w-full bg-white border-2 border-red-200 hover:border-red-400 rounded-2xl overflow-hidden text-left transition-all group shadow-sm hover:shadow-md">
                    <div className="h-52 relative overflow-hidden bg-gradient-to-br from-red-50 to-orange-50">
                      {(c.photos && c.photos[0]) ? (
                        <img src={c.photos[0]} alt={c.beneficiary} className="w-full h-full object-cover object-top" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                          <span className="text-6xl">{c.image && (c.image.startsWith("http") ? <img src={c.image} alt="" className="w-full h-32 object-cover rounded-t-2xl" /> : c.image)}</span>
                        </div>
                      )}
                      <div className="absolute top-3 left-3 flex gap-2">
                        <span className="bg-red-600 text-white text-xs font-black px-2 py-1 rounded-full animate-pulse">🚨 URGENT</span>
                        <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-full">⏱️ {c.daysLeft}j</span>
                      </div>
                      <div className="absolute top-3 right-3">
                        <span className="bg-white text-gray-500 text-[10px] font-mono px-2 py-1 rounded-full border border-gray-200">{c.trackingId}</span>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="font-bold text-gray-900 text-sm leading-snug group-hover:text-red-700 mb-1">{c.title[lang]}</div>
                      <div className="text-xs text-gray-400 mb-3">🏥 {c.hospital} · 📍 {c.city}</div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="font-semibold text-gray-800">{fmt(c.collected)}</span>
                        <span className="text-gray-400">sur {fmt(c.required)}</span>
                      </div>
                      <div className="h-2 bg-red-100 rounded-full overflow-hidden mb-1">
                        <div className="h-full bg-red-500 rounded-full" style={{width: percent+"%", transition:"width 700ms"}} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">👥 {c.donors} {lang==="fr"?"donateurs":"donors"}</span>
                        <span className="font-bold text-red-600">{percent}%</span>
                      </div>
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
  WAVE:   { numero: "07 00 00 00 00", nom: "AYYAD SOLIDARITE", prefix: "🌊" },

};

// QR code placeholder (image base64 simple — à remplacer par vrai QR Ayyad)
const QR_PLACEHOLDER = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=";

const MobilePayWidget = ({ amount, caseData, lang, onSuccess }) => {
  if (!amount || !caseData) return null;
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
          <span className="ml-auto text-white/70 text-xs">{currency === "FCFA" ? amountFmt + " FCFA" : amountFmt} →</span>
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
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
      <p className="text-yellow-800 font-semibold text-sm">
        {lang==="fr" ? "🚧 Bientôt disponible" : "🚧 Coming soon"}
      </p>
      <p className="text-yellow-700 text-xs mt-1">
        {lang==="fr"
          ? "Le paiement par carte internationale sera disponible très prochainement. En attendant, utilisez Wave CI."
          : "International card payment will be available very soon. In the meantime, please use Wave CI."}
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

      {/* QR Code */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 text-center space-y-3">
        <div className="text-xs font-bold text-gray-600">📱 {lang==="fr" ? "Scannez avec " : "Scan with "}{pv?.label}</div>
        <div className="flex justify-center">
          <div className="relative">
            <img
              src={QR_PLACEHOLDER + encodeURIComponent(pv?.qrData||"")}
              alt="QR Code"
              className="w-44 h-44 rounded-xl border border-gray-100"
              onError={e => { e.target.style.display="none"; }}
            />
            <div className="absolute -bottom-2 -right-2 bg-white border border-gray-200 rounded-full p-1 text-lg">{pv?.emoji}</div>
          </div>
        </div>
        <div className="text-[10px] text-gray-400">{lang==="fr" ? "Ouvrez " : "Open "}
          <span className="font-bold">{pv?.label}</span>
          {lang==="fr" ? " → Payer → Scanner → Confirmez" : " → Pay → Scan → Confirm"}
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
        <span className="font-black text-emerald-700">{amountFmt} FCFA</span>
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
  const shareUrl = "https://ayyad.vercel.app/?case=" + trackingId;
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
              <div className="text-[10px] text-gray-400 font-mono truncate">ayyad.vercel.app/?case={trackingId}</div>
            </div>
          </button>

          <button onClick={() => setOpen(false)} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 text-xs">✕</button>
        </div>
      )}
    </div>
  );
};

// ── Support Ayyad Section ─────────────────────────────────────
const SupportAyyadSection = ({ lang }) => {
  const t = T[lang].supportAyyad;
  return (
    <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-14 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-5 text-sm font-medium">
          <span>💚</span> {t.directDonation}
        </div>
        <h2 className="text-3xl font-black mb-4">{t.title}</h2>
        <p className="text-emerald-200 text-sm max-w-lg mx-auto mb-8 leading-relaxed">{t.sub}</p>
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8 max-w-sm mx-auto">
          <div className="text-5xl mb-4">🔜</div>
          <div className="font-black text-xl mb-2">
            {lang === "fr" ? "Paiements bientôt disponibles" : "Payments coming soon"}
          </div>
          <p className="text-emerald-300 text-sm leading-relaxed">
            {lang === "fr"
              ? "Wave CI et le paiement par carte bancaire sont disponibles. D'autres moyens arrivent bientôt."
              : "Wave CI and card payment are available. More payment methods coming soon."}
          </p>
          <div className="flex justify-center gap-4 mt-6 text-2xl opacity-60">
            <span>🌊</span><span>💳</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── HomePage
// ── Cas Urgents Page ──────────────────────────────────────────
const UrgentsPage = ({ setPage, setSelectedCase, lang }) => {
  const urgents = MOCK_CASES.filter(c => c.urgent || c.daysLeft <= 7);
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
    supabase.from("cases").select("*").eq("status", "COLLECTING").then(({ data }) => {
      if (data && data.length > 0) setDbCases(data);
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
    ...MOCK_CASES.filter(c => c.status !== "FUNDED"),
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
    supabase.from("cases").select("*").eq("status", "COLLECTING").then(({ data }) => {
      if (data && data.length > 0) setDbCases(data);
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
  const mockActive = MOCK_CASES.filter(c => c.status !== "FUNDED");
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
  const funded = MOCK_CASES.filter(c => c.status === "FUNDED");

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
            {TEMOIGNAGES.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">{t.image}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="font-black text-gray-900">{t.name}</div>
                          <div className="text-xs text-gray-400">{t.age} {lang==="fr"?"ans":"years old"} · {t.city} · {t.hospital}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-emerald-600 font-bold text-sm">{t.amount.toLocaleString()} FCFA</div>
                          <div className="text-xs text-gray-400">{t.date}</div>
                        </div>
                      </div>
                      <div className="flex mt-1">{"⭐".repeat(t.stars)}</div>
                    </div>
                  </div>
                  <div className="mt-4 bg-emerald-50 rounded-xl p-4 border-l-4 border-emerald-400">
                    <p className="text-gray-700 text-sm leading-relaxed italic">"{t.message[lang]}"</p>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{t.category[lang]}</span>
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

const HomePage = ({ setPage, setSelectedCase, lang }) => {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [heroStats, setHeroStats] = useState({ patients: "142", collected: "89M", hospitals: "18" });
  useEffect(() => {
    const loadStats = async () => {
      const { data } = await supabase.from("cases").select("collected, status, amount");
      if (data && data.length > 0) {
        const funded = data.filter(c => c.status === "FUNDED");
        const totalCollected = data.reduce((s, c) => s + (c.collected || 0), 0);
        const fmt = totalCollected >= 1000000 ? Math.round(totalCollected/1000000) + "M" : totalCollected >= 1000 ? Math.round(totalCollected/1000) + "k" : String(totalCollected);
        setHeroStats(prev => ({ ...prev, patients: String(funded.length || 142), collected: fmt || "89M" }));
      }
    };
    loadStats();
  }, []);
  const [heroMenu, setHeroMenu] = useState(false);
  const [dbCases, setDbCases] = useState([]);
  const t = T[lang];

  useEffect(() => {
    supabase.from("cases").select("*").eq("status", "COLLECTING").then(({ data }) => {
      if (data && data.length > 0) {
        const calcDaysLeft = (c) => {
          if (c.deadline) { const diff = new Date(c.deadline) - new Date(); return Math.max(0, Math.ceil(diff / (1000*60*60*24))); }
          return 30;
        };
        const normalized = data.map(c => ({
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
  const allCases = dbCases.length > 0 ? [...dbCases, ...MOCK_CASES.filter(c => c.status !== "FUNDED")] : MOCK_CASES;
  const filtered = (filter==="all"||filter===catMap[0] ? allCases : allCases.filter(c => c.category[lang].toLowerCase()===filter.toLowerCase()))
    .filter(c => !search.trim() || (c.title||"").toLowerCase().includes(search.toLowerCase()) || (c.hospital||"").toLowerCase().includes(search.toLowerCase()) || (c.city||"").toLowerCase().includes(search.toLowerCase()));
  return (
    <div onClick={() => setHeroMenu(false)}>
      <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
            <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />{t.hero.badge}
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-5 leading-tight">{t.hero.title1}<br /><span className="text-emerald-200">{t.hero.title2}</span></h1>
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
          <div className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-3 text-center gap-4">
            {[[heroStats.patients,t.stats.patients],[heroStats.collected,t.stats.collected],[heroStats.hospitals,t.stats.hospitals]].map(([v,l]) => (
              <div key={l}><div className="text-2xl font-black">{v}</div><div className="text-emerald-200 text-xs mt-0.5">{l}</div></div>
            ))}
          </div>
        </div>
      </div>

      {/* Urgent Cases Banner — mock + auto-detection */}
      <UrgentBanner cases={MOCK_CASES} setSelectedCase={setSelectedCase} setPage={setPage} lang={lang} />

      <div id="collectes" className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-black text-gray-900">{t.collections.title}</h2>
            <p className="text-gray-500 text-sm mt-1">{MOCK_CASES.filter(c=>c.status==="COLLECTING").length} {t.collections.sub}</p>
          </div>
          <div className="flex gap-2 flex-wrap">{catMap.map((c,i) => <button key={c} onClick={() => setFilter(i===0?"all":c)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${(filter==="all"&&i===0)||filter===c?"bg-emerald-600 text-white shadow-md":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{c}</button>)}</div>
        </div>
        <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === "fr" ? "🔍 Rechercher par nom, hôpital, ville..." : "🔍 Search by name, hospital, city..."}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white shadow-sm"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(c => <CaseCard key={c.id} c={c} lang={lang} t={t} onClick={() => { setSelectedCase(c); setPage("case"); }} />)}
        </div>
      </div>

      <div className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-black text-gray-900 mb-2">{t.how.title}</h2>
          <p className="text-gray-500 mb-10">{t.how.sub}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {t.how.steps.map(s => (
              <div key={s.n} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-left hover:shadow-md transition-shadow">
                <div className="w-11 h-11 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center text-2xl mb-4">{s.icon}</div>
                <div className="text-xs font-bold text-emerald-600 mb-1">STEP {s.n}</div>
                <div className="font-bold text-gray-900 text-sm mb-1">{s.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Support Ayyad Section */}
      <SupportAyyadSection lang={lang} />
    </div>
  );
};

// ── Case Detail + Donation Widget ─────────────────────────────
const CasePage = ({ c, setPage, lang }) => {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("FCFA");
  const [provider, setProvider] = useState("WAVE");
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  // donMode: "choose" | "anonymous" | "logged" | "confirm" | "success"
  const [donMode, setDonMode] = useState("choose");
  const percent = pct(c.collected, c.required);
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
  const donateFormJSX = (
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
      {/* Widget paiement mobile — Wave / Carte bancaire */}
      {amount && amountInFcfa >= 500 ? (
        <MobilePayWidget
          amount={amountInFcfa}
          caseData={c}
          lang={lang}
          onSuccess={() => {
            setDonMode("success");
            emailDonConfirm({ donorEmail: null, donorName: anonymous ? "" : "Donateur", amount: fmt(Number(amount)), beneficiary: c.beneficiary, caseTitle: c.title });
          }}
        />
      ) : (
        <button disabled className="w-full bg-gray-200 text-gray-400 font-bold py-3.5 rounded-xl text-sm">
          {lang==="fr" ? "Entrez un montant ≥ 500 FCFA" : "Enter an amount ≥ 500 FCFA"}
        </button>
      )}
    </>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
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
            <h3 className="font-bold text-gray-900 mb-4">{t.progress.progressTitle}</h3>
            <div className="flex justify-between items-end mb-3">
              <div><div className="text-3xl font-black text-emerald-700">{fmt(c.collected)}</div><div className="text-sm text-gray-500">{t.progress.collected} {fmt(c.required)}</div></div>
              <div className="text-right"><div className="text-3xl font-black text-gray-900">{percent}%</div><div className="text-sm text-gray-500">{t.progress.of}</div></div>
            </div>
            <ProgressBar percent={percent} />
            <div className="flex justify-between mt-3 text-sm text-gray-500">
              <span>👥 {c.donors} {t.progress.donors}</span>
              {funded?<span className="text-emerald-600 font-semibold">{t.progress.intervention}</span>:<span className="text-amber-600 font-medium">⏳ {c.daysLeft} {t.progress.daysLeft}</span>}
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3">
            <span className="text-2xl flex-shrink-0">🔒</span>
            <div><div className="font-bold text-emerald-800 text-sm">{t.guarantee.title}</div><div className="text-emerald-700 text-xs mt-1">{t.guarantee.desc}</div></div>
          </div>

          {/* Médias — Photos + Vidéo */}
          <MediaSection c={c} lang={lang} t={t} />
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
            {(donMode==="anonymous" || donMode==="logged") && !funded && donateFormJSX}

            {/* ÉTAPE 3 — Confirmation */}
            {donMode==="confirm" && <div className="space-y-5">
              <div className="text-center"><div className="text-4xl mb-2">💚</div><h3 className="font-black text-lg text-gray-900">{td.confirm}</h3><p className="text-sm text-gray-500">{td.verifyDon}</p></div>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3 text-sm">
                {[[td.debited,fmt(Number(amount))],[td.beneficiary,c.beneficiary],[td.via,provider==="WAVE"?"🌊 Wave":"💳 "+(lang==="fr"?"Carte":"Card")],[td.anonymity, anonymous ? "👤"+(lang==="fr"?"Anonyme":"Anonymous") : "👤 "+(lang==="fr"?"Avec compte":"With account")]].map(([k,v],i) => (
                  <div key={i} className="flex justify-between items-center"><span className="text-gray-500">{k}</span><span className={`font-semibold ${k===td.anonymity?"text-emerald-600":""}`}>{v}</span></div>
                ))}
              </div>
              {message&&<div className="bg-emerald-50 rounded-xl p-3 text-sm text-emerald-700 italic border border-emerald-100">"{message}"</div>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setDonMode(anonymous?"anonymous":"logged")} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm">{td.modify}</button>
                <button onClick={() => {
                  setDonMode("success");
                  emailDonConfirm({ donorEmail: null, donorName: anonymous ? "" : "Donateur", amount: fmt(Number(amount)), beneficiary: c.beneficiary, caseTitle: c.title });
                }} className="bg-emerald-600 text-white font-bold py-3 rounded-xl text-sm shadow-md">{td.confirmBtn}</button>
              </div>
            </div>}

            {/* ÉTAPE 4 — Succès */}
            {donMode==="success" && <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">🎉</div>
              <h3 className="font-black text-xl text-gray-900">{td.thanks}</h3>
              <p className="text-sm text-gray-600">{td.thanksSub}</p>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 text-sm text-emerald-800 border border-emerald-100">
                <p className="font-semibold mb-1">{td.impact}</p><p>{td.impactSub} {c.beneficiary} {td.impactEnd}</p>
              </div>
              <button onClick={() => { setDonMode("choose"); setAmount(""); setMessage(""); }} className="w-full border border-emerald-200 text-emerald-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-50">{td.again}</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Login Page ────────────────────────────────────────────────
const LoginPage = ({ setPage, setUser, lang }) => {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const t = T[lang].login;

  const handleLogin = async () => {
    if (!email || !pwd) return;
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pwd });
    if (err) {
      setError(t.error);
      setLoading(false);
      return;
    }
    const meta = data.user?.user_metadata || {};
    const { data: adminData } = await supabase.from("admin_users").select("role, is_active").eq("email", email).single();
    const isAdmin = !!(adminData && adminData.is_active);
    const adminRole = adminData?.role || null;
    setUser({ id: data.user.id, name: meta.full_name || email, email, isAdmin, adminRole });
    setPage(isAdmin ? "admin" : "home");
    setLoading(false);
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
  const t = T[lang].register;

  const handleSubmit = async () => {
    if (!form.email || !form.password) return;
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name, phone: form.phone, role } }
    });
    if (err) { setError(t.error); setLoading(false); return; }
    setUser({ id: data.user?.id, name: form.name||form.email, email: form.email, isAdmin: false });
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
          <button onClick={()=>role&&form.title.trim().length>=3&&setStep(2)} disabled={!role||form.title.trim().length<3} className="w-full bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">{t.continue}</button>
          <div className="text-center"><span className="text-sm text-gray-500">{t.hasAccount} </span><button onClick={()=>setPage("login")} className="text-sm text-emerald-600 font-bold hover:underline">{t.signin}</button></div>
        </div>}
        {step===2&&<div className="space-y-4">
          {error&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 text-center">{error}</div>}
          {t.fields.map(f=><div key={f.key}><label className="text-xs font-semibold text-gray-600 mb-1.5 block">{f.label}</label><input value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} type={f.type} placeholder={f.p} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>)}
          <div className="flex items-start gap-2 text-xs text-gray-500"><input type="checkbox" className="mt-0.5 accent-emerald-600" /><span>{t.terms} <a href="#" className="text-emerald-600 underline font-medium">{t.termsLink}</a> {t.and} <a href="#" className="text-emerald-600 underline font-medium">{t.privacyLink}</a>.</span></div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>setStep(1)} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm">{t.back}</button>
            <button onClick={handleSubmit} disabled={loading} className="bg-emerald-600 disabled:bg-emerald-400 text-white font-bold py-3 rounded-xl text-sm shadow-md">{loading?"...":t.btn}</button>
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

  const handlePhotoSelect = (file) => {
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return null;
    setPhotoUploading(true);
    const fileName = Date.now()+"_photo_"+photoFile.name;
    const { error } = await supabase.storage.from("medical-documents").upload(fileName, photoFile);
    if (error) { setPhotoUploading(false); return null; }
    const { data: urlData } = supabase.storage.from("medical-documents").getPublicUrl(fileName);
    setPhotoUrl(urlData.publicUrl);
    setPhotoUploading(false);
    return urlData.publicUrl;
  };

  const handleFileUpload = async (key, file) => {
    if (!file) return;
    setFileStates(prev => ({...prev, [key]: "uploading"}));
    const fileName = Date.now()+"_"+key+"_"+file.name;
    const { error } = await supabase.storage.from("medical-documents").upload(fileName, file);
    if (error) { setFileStates(prev => ({...prev, [key]: "error"})); return; }
    const { data: urlData } = supabase.storage.from("medical-documents").getPublicUrl(fileName);
    setFileUrls(prev => ({...prev, [key]: urlData.publicUrl}));
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
      tracking_id: "AYD-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random() * 900) + 100).padStart(3, "0"),
      user_id: user?.id || null,
      deadline_requested: form.deadlineRequested || null,
      document_urls: fileUrls || {},
    });
    if (error) { setSubmitError(lang==="fr"?"Erreur lors de la soumission. Réessayez.":"Submission error. Please try again."); setSubmitting(false); return; }
    try { emailNewCase({ caseTitle: form.title, hospital: form.hospital, city: form.city, amount: form.amount }); } catch(e) { console.warn("Email non envoyé:", e); }
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
                  onChange={e => e.target.files[0] && handlePhotoSelect(e.target.files[0])} />
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
              <div key={doc.key} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${state==="done"?"border-emerald-300 bg-emerald-50":state==="error"?"border-red-200 bg-red-50":"border-gray-200"}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${state==="done"?"bg-emerald-100":"bg-gray-100"}`}>{doc.icon}</div>
                <div className="flex-1 min-w-0"><div className="font-semibold text-sm text-gray-900">{doc.title} <span className="text-red-400">*</span></div><div className="text-xs text-gray-500">{doc.desc}</div></div>
                <label className={`px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 cursor-pointer transition-colors ${state==="done"?"bg-emerald-600 text-white":state==="uploading"?"bg-gray-300 text-gray-500 cursor-wait":state==="error"?"bg-red-100 text-red-600":"bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                  {state==="done"?t.uploaded:state==="uploading"?t.uploading:state==="error"?t.error:t.upload}
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>e.target.files[0]&&handleFileUpload(doc.key,e.target.files[0])} disabled={state==="uploading"||state==="done"} />
                </label>
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
  const [showAdd, setShowAdd] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [newRole, setNewRole] = React.useState("operator");
  const [adding, setAdding] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const ROLES = [
    { value: "super_admin", label: fr ? "Super Admin" : "Super Admin", color: "bg-purple-100 text-purple-700" },
    { value: "finance",     label: fr ? "Finance"     : "Finance",     color: "bg-blue-100 text-blue-700" },
    { value: "operator",   label: fr ? "Opérateur"   : "Operator",   color: "bg-green-100 text-green-700" },
  ];

  const getRoleStyle = (role) => ROLES.find(r => r.value === role)?.color || "bg-gray-100 text-gray-600";
  const getRoleLabel = (role) => ROLES.find(r => r.value === role)?.label || role;

  React.useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_users")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error) setAdmins(data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newEmail.includes("@")) return setMsg(fr ? "Email invalide" : "Invalid email");
    setAdding(true);
    setMsg("");
    const { error } = await supabase
      .from("admin_users")
      .insert({ email: newEmail.trim().toLowerCase(), role: newRole, is_active: true });
    if (error) {
      setMsg(fr ? "Erreur : " + error.message : "Error: " + error.message);
    } else {
      setMsg(fr ? "Membre ajouté ✓" : "Member added ✓");
      setNewEmail("");
      setNewRole("operator");
      setShowAdd(false);
      fetchAdmins();
    }
    setAdding(false);
  };

  const toggleActive = async (admin) => {
    if (admin.email === user.email) return;
    await supabase
      .from("admin_users")
      .update({ is_active: !admin.is_active })
      .eq("id", admin.id);
    fetchAdmins();
  };

  const changeRole = async (admin, newRole) => {
    if (admin.email === user.email) return;
    await supabase
      .from("admin_users")
      .update({ role: newRole })
      .eq("id", admin.id);
    fetchAdmins();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">{fr ? "Chargement..." : "Loading..."}</div>;

  return (
    <div className="space-y-4">
      {/* Formulaire ajout */}
      {user.adminRole === "super_admin" && (
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
                {adding ? "..." : (fr ? "Ajouter" : "Add")}
              </button>
            </div>
          )}
          {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
        </div>
      )}

      {/* Liste */}
      {admins.map(admin => (
        <div key={admin.id} className={`flex items-center justify-between p-4 rounded-xl border ${admin.is_active ? "bg-white border-gray-100" : "bg-gray-50 border-gray-200 opacity-60"}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
              {admin.email[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{admin.email}</p>
              <p className="text-xs text-gray-400">{admin.is_active ? (fr ? "Actif" : "Active") : (fr ? "Désactivé" : "Disabled")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user.adminRole === "super_admin" && admin.email !== user.email ? (
              <>
                <select
                  value={admin.role}
                  onChange={e => changeRole(admin, e.target.value)}
                  className={`text-xs font-semibold px-2 py-1 rounded-full border-0 ${getRoleStyle(admin.role)}`}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button
                  onClick={() => toggleActive(admin)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold ${admin.is_active ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-green-100 text-green-600 hover:bg-green-200"}`}
                >
                  {admin.is_active ? (fr ? "Désactiver" : "Disable") : (fr ? "Réactiver" : "Enable")}
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

const AdminPage = ({ user, setPage, lang }) => {
  const [tab, setTab] = useState("overview");
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [rejectModal, setRejectModal] = useState(null);
  const [editDeadline, setEditDeadline] = useState({});
  const [editVideoUrl, setEditVideoUrl] = useState({}); // { caseId: "https://..." }
  const [rejectReason, setRejectReason] = useState("");
  const [payMethods, setPayMethods] = useState({}); // { caseId: "WAVE"|"ORANGE"|"MTN"|"BANK" }
  const [confirmingId, setConfirmingId] = useState(null); // caseId en cours de confirmation
  const [expandedPayoutId, setExpandedPayoutId] = useState(null); // collecte expand dans virements
  const [groupedPayout, setGroupedPayout] = useState({}); // { caseId: true|false } — virement groupé hôpital + 70% bénéficiaire
  const t = T[lang].admin;
  const unresolved = alerts.filter(a=>!a.resolved).length;

  // ── Load all cases from Supabase ──
  const loadCases = async () => {
    setLoadingCases(true);
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });
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
    if (!error) setCases([demoFunded, ...(data || [])]);
    setLoadingCases(false);
  };

  useEffect(() => { loadCases(); }, []);

  // Auto-passage en FUNDED : collectes ayant atteint leur objectif la veille ou avant
  useEffect(() => {
    const autoFund = async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      // Cherche les dossiers COLLECTING dont collected >= amount et goal_reached_at <= hier
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
        // Si objectif atteint aujourd'hui mais pas encore marqué, on note la date
        if ((c.collected||0) >= (c.amount||1) && !c.goal_reached_at) {
          await supabase.from("cases").update({ goal_reached_at: new Date().toISOString() }).eq("id", c.id);
        }
      }
      loadCases();
    };
    autoFund();
  }, []);

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
    const { error } = await supabase
      .from("cases")
      .update({ status: "COLLECTING" })
      .eq("id", id);
    if (!error) {
      const c = cases.find(x => x.id === id);
      setCases(prev => prev.map(x => x.id===id ? {...x, status:"COLLECTING"} : x));
      // Email notification au bénéficiaire + admin
      if (c) {
        emailCaseApproved({ beneficiaryEmail: c.email || null, beneficiaryName: c.full_name || c.beneficiary, caseTitle: c.title, trackingId: c.tracking_id });
        emailNewCase({ caseTitle: "✅ APPROUVÉ — " + (c.title || id), hospital: c.hospital, city: c.city, amount: c.amount });
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
      // Email notification au bénéficiaire + admin
      if (c) {
        emailCaseRejected({ beneficiaryEmail: c.email || null, beneficiaryName: c.full_name || c.beneficiary, caseTitle: c.title, reason: rejectReason });
        emailNewCase({ caseTitle: "❌ REJETÉ — " + (c.title || id) + " — " + rejectReason, hospital: c.hospital, city: c.city, amount: c.amount });
      }
      setRejectModal(null);
      setRejectReason("");
    }
  };

  const pendingCases = cases.filter(c => c.status==="PENDING");
  const activeCases = cases.filter(c => ["APPROVED","COLLECTING"].includes(c.status));

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

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div><h1 className="text-2xl font-black text-gray-900">{t.title}</h1><p className="text-sm text-gray-500 mt-0.5">{t.sub}</p></div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/><span className="text-xs font-semibold text-emerald-700">{t.status}</span></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 mb-6 overflow-x-auto shadow-sm">
          {t.tabs.map(tab_=>(
            <button key={tab_.id} onClick={()=>setTab(tab_.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${tab===tab_.id?"bg-emerald-600 text-white shadow-sm":"text-gray-600 hover:bg-gray-100"}`}>
              {tab_.icon} {tab_.label}
              {tab_.id==="cases"&&pendingCases.length>0&&<span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{pendingCases.length}</span>}
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
                              {c.document_urls?.medical&&<a href={c.document_urls.medical} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">🏥 Rapport médical</a>}
                              {c.document_urls?.quote&&<a href={c.document_urls.quote} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">💊 Devis</a>}
                              {c.document_urls?.id&&<a href={c.document_urls.id} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">🪪 Pièce d'identité</a>}
                              {c.document_urls?.consent&&<a href={c.document_urls.consent} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">✍️ Consentement</a>}
                            <button className="px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50">{t.reject}</button>
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
                    <div key={c.id} className="p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-900 truncate">{c.title||c.full_name||"—"}</div>
                        <div className="text-xs text-gray-500">🏥 {c.hospital||"—"} · 💰 {c.amount?fmt(c.amount):"—"}</div>
                      </div>
                      <Badge color={statusColor(c.status)}>{t.statusLabels[c.status]||c.status}</Badge>
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
                <div key={a.id} className={`p-5 flex items-center gap-4 ${a.resolved?"opacity-40":""}`}>
                  <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${a.sev==="critical"?"bg-red-500":a.sev==="high"?"bg-amber-500":"bg-yellow-400"}`}/>
                  <div className="flex-1 min-w-0"><div className="font-semibold text-sm text-gray-900">{a.type[lang]}</div><div className="text-xs text-gray-500 mt-0.5">{a.case[lang]} · {a.time}</div></div>
                  <Badge color={a.sev==="critical"?"red":a.sev==="high"?"yellow":"gray"}>{a.sev}</Badge>
                  {!a.resolved?<button onClick={()=>setAlerts(al=>al.map(x=>x.id===a.id?{...x,resolved:true}:x))} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex-shrink-0">{t.resolve}</button>:<Badge color="green">{t.resolved}</Badge>}
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
                                    {hasSurplus && (
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
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {[
                                          {id:"WAVE",emoji:"🌊",label:"Wave CI",bg:"bg-blue-600 hover:bg-blue-700",ring:"ring-blue-500"},
                                          
                {id:"CARD",emoji:"💳",label:"Carte bancaire",bg:"bg-gray-800 hover:bg-gray-900",ring:"ring-gray-500"},
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
            <a href="mailto:support@ayyad.ci" className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl">
              support@ayyad.ci
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

        {tab === "team" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">{fr ? "Équipe & Accès" : "Team & Access"}</h2>
              {user.adminRole === "super_admin" && (
                <button
                  onClick={() => setShowAddAdmin(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700"
                >
                  + {fr ? "Ajouter un membre" : "Add member"}
                </button>
              )}
            </div>

            {/* Liste des admins */}
            <AdminTeamList user={user} fr={fr} />
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {tab === "mentions" && (
            <div>
              <div className="text-[11px] text-gray-400 mb-4">{fr ? "Dernière mise à jour : mars 2025" : "Last updated: March 2025"}</div>

              <Heading>{fr ? "1. Éditeur de la plateforme" : "1. Platform editor"}</Heading>
              <P>
                {fr ? "La plateforme Ayyad (accessible à l'adresse " : "The Ayyad platform (accessible at "}
                <strong>ayyad.vercel.app</strong>
                {fr ? ") est éditée par :" : ") is published by:"}
              </P>
              <div className="bg-gray-50 rounded-xl p-4 text-xs space-y-1.5 mb-3">
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Dénomination":"Name"}</span><strong>Ayyad CI</strong> <Placeholder>{fr?"À compléter après enregistrement":"To complete after registration"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Forme juridique":"Legal form"}</span><Placeholder>{fr?"SARL / SAS / ONG — À définir":"SARL / SAS / NGO — To define"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Capital social":"Share capital"}</span><Placeholder>{fr?"Montant — À compléter":"Amount — To complete"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">RCCM</span><Placeholder>{fr?"Numéro RCCM — À compléter":"RCCM number — To complete"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Siège social":"Registered office"}</span>Abidjan, Côte d'Ivoire <Placeholder>{fr?"Commune — À préciser":"District — To specify"}</Placeholder></div>
                <div><span className="text-gray-400 w-32 inline-block">{fr?"Directeur de pub.":"Publisher"}</span><strong>Bly Kedhard Serge Ismael</strong></div>
                <div><span className="text-gray-400 w-32 inline-block">Email</span><a href="mailto:contact@ayyad.ci" className="text-emerald-600">contact@ayyad.ci</a></div>
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
                ? "Les dons sont effectués via des opérateurs de paiement mobile (Wave CI, carte bancaire). Chaque don est définitif sauf dans les cas prévus par la politique de remboursement d'Ayyad. Ayyad prélève une commission opérationnelle de 5%, intégrée dans l'objectif de collecte et invisible pour le donateur."
                : "Donations are made via Wave CI or international card payment. Each donation is final except in cases provided for by Ayyad's refund policy. Ayyad charges a 5% operational fee, included in the campaign goal and invisible to the donor."}</P>

              <Heading>{fr ? "5. Soumission de dossiers" : "5. Case submission"}</Heading>
              <P>{fr
                ? "Tout bénéficiaire soumettant un dossier s'engage à fournir des documents médicaux authentiques et véridiques. La soumission de faux documents constitue une fraude passible de poursuites judiciaires conformément au droit ivoirien. Ayyad se réserve le droit de rejeter tout dossier sans justification."
                : "Any beneficiary submitting a case agrees to provide authentic and truthful medical documents. Submission of false documents constitutes fraud subject to legal action under Ivorian law. Ayyad reserves the right to reject any case without justification."}</P>

              <Heading>{fr ? "6. Protection des données personnelles" : "6. Personal data protection"}</Heading>
              <P>{fr
                ? "Les données personnelles collectées sont traitées conformément à la loi ivoirienne n°2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel et aux directives de l'ARTCI. Les utilisateurs disposent d'un droit d'accès, de rectification et de suppression de leurs données en contactant contact@ayyad.ci."
                : "Personal data collected is processed in accordance with Ivorian law n°2013-450 of June 19, 2013 on personal data protection and ARTCI guidelines. Users have the right to access, correct and delete their data by contacting contact@ayyad.ci."}</P>

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
              <a href="mailto:legal@ayyad.ci" className="text-emerald-600 text-xs font-bold">legal@ayyad.ci</a>
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

// ── Footer ────────────────────────────────────────────────────
const Footer = ({ setPage, lang }) => {
  const t = T[lang].footer;
  return (
    <footer className="bg-gray-950 text-white mt-16">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1"><div className="flex items-center gap-2 mb-4"><svg width="36" height="36" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="35" cy="35" r="33" fill="#1a6b3a"/><circle cx="35" cy="35" r="33" fill="none" stroke="#C9A84C" strokeWidth="2.5"/><rect x="29" y="18" width="12" height="34" rx="3" fill="#C9A84C"/><rect x="18" y="29" width="34" height="12" rx="3" fill="#C9A84C"/><path d="M31 32 C31 30.5, 32.5 29.5, 35 31.5 C37.5 29.5, 39 30.5, 39 32 C39 34, 35 37, 35 37 C35 37, 31 34, 31 32Z" fill="#0d5c2e"/></svg><span className="font-black text-xl" style={{fontFamily:"Georgia, serif", letterSpacing:"1px"}}>AYYAD</span></div><p className="text-gray-400 text-xs leading-relaxed">{t.tagline}</p></div>
          {[[t.platform, t.platformLinks, ["collectesactives","how","submit"]], [t.trust, t.trustLinks, ["how","how","refund"]], [t.legal, t.legalLinks, ["legal","faq","legal"]]].map(([title, links, pages]) =>
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
    if (data) setCaseData(data);
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
      const { data } = await supabase.from("cases").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setUserCases(data || []);
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
  };

  const saveEdit = async () => {
    setSaving(true);
    const { error } = await supabase.from("cases").update({
      title: editForm.title,
      description: editForm.description,
      video_url: editForm.video_url || null,
      beneficiary_phone: editForm.beneficiary_phone || null,
    }).eq("id", editingCase);
    setSaving(false);
    if (!error) {
      setUserCases(prev => prev.map(c => c.id === editingCase ? { ...c, ...editForm } : c));
      setSaveMsg(lang === "fr" ? "✅ Modifications enregistrées" : "✅ Changes saved");
      setTimeout(() => { setEditingCase(null); setSaveMsg(""); }, 1500);
    } else {
      setSaveMsg(lang === "fr" ? "❌ Erreur lors de la sauvegarde" : "❌ Error saving");
    }
  };

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
  const [page, setPage] = useState("home");

  useEffect(() => {
    window.scrollTo(0, 0);
    window.history.pushState({ page }, "", "?p=" + page);
  }, [page]);
  const [lang, setLang] = useState("fr");
  const [user, setUser] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [specialite, setSpecialite] = useState("");

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

  // Restore session on load
  useEffect(() => {
    inject();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const { data: adminData2 } = await supabase.from("admin_users").select("role, is_active").eq("email", session.user.email).single();
        const isAdmin = !!(adminData2 && adminData2.is_active);
        const adminRole = adminData2?.role || null;
        setUser({ id: session.user.id, name: meta.full_name || session.user.email, email: session.user.email, isAdmin, adminRole });
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const isAdmin = session.user.email === "kedhard80@gmail.com";
        setUser({ id: session.user.id, name: meta.full_name || session.user.email, email: session.user.email, isAdmin });
      } else {
        setUser(null);
      }
    });

    // Deep-link: ?case=AYD-2025-001
    const params = new URLSearchParams(window.location.search);
    const caseId = params.get("case");
    if (caseId) {
      // Try MOCK_CASES first, then Supabase
      const mockMatch = MOCK_CASES.find(c => c.trackingId === caseId);
      if (mockMatch) {
        setSelectedCase(mockMatch);
        setPage("case");
      } else {
        supabase.from("cases").select("*").eq("tracking_id", caseId).single().then(({ data }) => {
          if (data) { setSelectedCase(data); setPage("case"); }
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
        {page==="case"&&selectedCase&&<CasePage c={selectedCase} setPage={setPage} lang={lang} />}
        {page==="how"&&<HowPage lang={lang} setPage={setPage} />}
        {page==="refund"&&<RefundPage lang={lang} setPage={setPage} />}
        {page==="legal"&&<LegalPage lang={lang} setPage={setPage} />}
        {page==="urgents"&&<UrgentsPage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} />}
        {page==="login"&&<LoginPage setPage={setPage} setUser={setUser} lang={lang} />}
        {page==="register"&&<RegisterPage setPage={setPage} setUser={setUser} lang={lang} />}
        {page==="submit"&&<SubmitPage setPage={setPage} user={user} lang={lang} />}
        {page==="admin"&&<AdminPage user={user} setPage={setPage} lang={lang} />}
        {page==="tracking"&&<TrackingPage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} />}
        {page==="changepassword"&&<ChangePasswordPage setPage={setPage} lang={lang} />}
      {page === "profile" && user && <ProfilePage user={user} lang={lang} setPage={setPage} />}
        {page==="faq"&&<FAQPage setPage={setPage} lang={lang} />}
      </main>
      {showFooter&&<Footer setPage={setPage} lang={lang} />}
    </div>
  );
}
