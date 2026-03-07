import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ──────────────────────────────────────────
const supabase = createClient(
  "https://xodgubvgvsnbpheusggm.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvZGd1YnZndnNuYnBoZXVzZ2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MzE0NDIsImV4cCI6MjA4NjMwNzQ0Mn0.Kx9gQtLBp8frC5iE08303pgbsV6paDIpWvyeLOg4MHU"
);

// ── Resend Email ─────────────────────────────────────────────
const RESEND_API_KEY = "re_6BaGYjac_7myZjmXxBi4RTB6VeeqxSgss";
const ADMIN_EMAIL = "kedhard80@gmail.com";

const sendEmail = async ({ to, subject, html }) => {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: "Ayyad <onboarding@resend.dev>", to, subject, html })
    });
  } catch(e) { console.log("Email error:", e); }
};

const emailDonConfirm = ({ donorEmail, donorName, amount, beneficiary, caseTitle }) =>
  sendEmail({
    to: donorEmail || ADMIN_EMAIL,
    subject: `✅ Votre don de ${amount} FCFA a été enregistré — Ayyad`,
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
          <p style="margin:4px 0"><strong>Montant :</strong> ${amount} FCFA</p>
        </div>
        <a href="https://ayyad.vercel.app" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Voir le dashboard →</a>
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
    register: { title: "Créer un compte", roleQ: "Je souhaite...", roles: [{ id:"donor",icon:"💚",title:"Faire des dons",desc:"Aider des patients dans le besoin" },{ id:"beneficiary",icon:"🏥",title:"Recevoir des soins",desc:"Financer une intervention médicale" }], fields: [{ key:"name",label:"Nom complet",p:"Aminata Koné",type:"text" },{ key:"email",label:"Email",p:"vous@exemple.ci",type:"email" },{ key:"phone",label:"Numéro Wave / Orange Money",p:"+225 07 XX XX XX XX",type:"tel" },{ key:"password",label:"Mot de passe (min. 6 caractères)",p:"••••••••",type:"password" }], terms: "J'accepte les", termsLink: "conditions d'utilisation", and: "et la", privacyLink: "politique de confidentialité", btn: "Créer mon compte", continue: "Continuer →", back: "← Retour", hasAccount: "Déjà un compte ?", signin: "Se connecter", error: "Erreur lors de la création du compte." },
    admin: {
      title: "Administration Ayyad", sub: "Tableau de bord opérationnel", status: "Système opérationnel",
      tabs: [{ id:"overview",label:"Vue d'ensemble",icon:"📊" },{ id:"cases",label:"Dossiers",icon:"📋" },{ id:"fraud",label:"Fraude",icon:"🔍" },{ id:"payouts",label:"Virements",icon:"🏦" }],
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
    supportAyyad: { title: "Soutenir Ayyad directement", sub: "Votre don aide à financer les opérations de la plateforme : vérification des dossiers, partenariats hospitaliers, et accompagnement des patients.", wave: "🌊 Payer via Wave", orange: "🟠 Payer via Orange Money", number: "+225 07 48 05 61 28", copied: "✓ Numéro copié !", copy: "Copier le numéro", thanks: "Merci pour votre soutien !", thanksSub: "Chaque contribution aide Ayyad à rester gratuit pour les patients.", directDonation: "Don direct à Ayyad" },
    video: { title: "Message du patient", watch: "▶ Voir la vidéo", noVideo: "Aucune vidéo disponible pour ce dossier." },
    progress: { collected: "collectés sur", donors: "donateurs", daysLeft: "jours restants", intervention: "✓ Intervention planifiée", progressTitle: "Progression de la collecte", of: "de l'objectif" },
    back: "← Retour aux collectes",
    footer: { tagline: "Financer la santé pour tous en Afrique.", platform: "Plateforme", trust: "Confiance", legal: "Légal", platformLinks: ["Collectes actives","Comment ça marche","Soumettre un dossier"], trustLinks: ["Vérification dossiers","Sécurité des paiements","Rapport d'impact"], legalLinks: ["Mentions légales","Confidentialité","Conformité BCEAO"], rights: "© 2025 Ayyad CI — Tous droits réservés" },
    howPage: { title: "Comment fonctionne Ayyad ?", sub: "Transparent, sécurisé, conçu pour l'Afrique", forDonors: { icon:"💚",title:"Pour les donateurs",steps:["Parcourez les collectes vérifiées actives","Choisissez librement votre montant","Payez via Wave, Orange Money ou carte","Vous êtes débité exactement du montant choisi","L'argent arrive directement à l'hôpital"] }, forBenef: { icon:"🏥",title:"Pour les bénéficiaires",steps:["Créez un compte et soumettez votre dossier médical","Téléchargez rapport médical, devis, pièce d'identité","Notre équipe vérifie avec l'hôpital partenaire","Votre collecte est mise en ligne sous 48h","Les fonds sont versés directement à l'hôpital"] }, feeTitle: "La règle des 5% — Toujours silencieuse", feeSub: "Ayyad prélève une commission opérationnelle de 5% sur chaque don. Cette commission est totalement invisible pour vous.", youGive: "Vous donnez", collectReceives: "Collecte reçoit", ayyadFee: "Frais Ayyad (5%)" },
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
    register: { title: "Create an account", roleQ: "I want to...", roles: [{ id:"donor",icon:"💚",title:"Make donations",desc:"Help patients in need" },{ id:"beneficiary",icon:"🏥",title:"Receive care",desc:"Fund a medical procedure" }], fields: [{ key:"name",label:"Full name",p:"Aminata Koné",type:"text" },{ key:"email",label:"Email",p:"you@example.ci",type:"email" },{ key:"phone",label:"Wave / Orange Money number",p:"+225 07 XX XX XX XX",type:"tel" },{ key:"password",label:"Password (min. 6 characters)",p:"••••••••",type:"password" }], terms: "I accept the", termsLink: "terms of service", and: "and the", privacyLink: "privacy policy", btn: "Create my account", continue: "Continue →", back: "← Back", hasAccount: "Already have an account?", signin: "Sign in", error: "Error creating account." },
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
    supportAyyad: { title: "Support Ayyad directly", sub: "Your donation helps fund platform operations: case verification, hospital partnerships, and patient support.", wave: "🌊 Pay via Wave", orange: "🟠 Pay via Orange Money", number: "+225 07 48 05 61 28", copied: "✓ Number copied!", copy: "Copy number", thanks: "Thank you for your support!", thanksSub: "Every contribution helps Ayyad stay free for patients.", directDonation: "Direct donation to Ayyad" },
    video: { title: "Patient's message", watch: "▶ Watch video", noVideo: "No video available for this case." },
    progress: { collected: "raised out of", donors: "donors", daysLeft: "days left", intervention: "✓ Procedure scheduled", progressTitle: "Campaign progress", of: "of goal" },
    back: "← Back to campaigns",
    footer: { tagline: "Funding healthcare for all in Africa.", platform: "Platform", trust: "Trust", legal: "Legal", platformLinks: ["Active campaigns","How it works","Submit a case"], trustLinks: ["Case verification","Payment security","Impact report"], legalLinks: ["Legal notice","Privacy policy","BCEAO compliance"], rights: "© 2025 Ayyad CI — All rights reserved" },
    howPage: { title: "How does Ayyad work?", sub: "Transparent, secure, built for Africa", forDonors: { icon:"💚",title:"For donors",steps:["Browse verified active campaigns","Freely choose your amount","Pay via Wave, Orange Money or card","You are charged exactly the amount you chose","The money goes directly to the hospital"] }, forBenef: { icon:"🏥",title:"For beneficiaries",steps:["Create an account and submit your medical case","Upload medical report, quote, identity document","Our team verifies with the partner hospital","Your campaign goes live within 48h","Funds are transferred directly to the hospital"] }, feeTitle: "The 5% rule — Always silent", feeSub: "Ayyad charges a 5% operational fee on each donation. This fee is completely invisible to you.", youGive: "You give", collectReceives: "Campaign receives", ayyadFee: "Ayyad fee (5%)" },
  }
};

// ── Static mock cases for homepage display ───────────────────
const MOCK_CASES = [
  { id:1, trackingId:"AYD-2025-001", title:{fr:"Opération cardiaque urgente pour Aminata",en:"Urgent heart surgery for Aminata"}, beneficiary:"Aminata Koné", age:34, city:"Abidjan", hospital:"CHU de Cocody", category:{fr:"Cardiologie",en:"Cardiology"}, required:1800000, collected:1260000, donors:87, daysLeft:2, image:"🫀", urgent:true, videoUrl:"https://www.youtube.com/embed/dQw4w9WgXcQ", photos:["https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&q=80","https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&q=80"], desc:{fr:"Aminata souffre d'une cardiopathie valvulaire sévère nécessitant un remplacement de valve urgent. Sans cette intervention, son pronostic vital est engagé dans les 3 prochains mois.",en:"Aminata suffers from severe valvular heart disease requiring urgent valve replacement. Without this procedure, her life is at risk within 3 months."}, status:"COLLECTING" },
  { id:2, trackingId:"AYD-2025-002", title:{fr:"Dialyse rénale pour Kofi Asante",en:"Kidney dialysis for Kofi Asante"}, beneficiary:"Kofi Asante", age:52, city:"Bouaké", hospital:"CHU de Bouaké", category:{fr:"Néphrologie",en:"Nephrology"}, required:997500, collected:1150000, donors:74, daysLeft:0, image:"🫘", urgent:false, videoUrl:null, desc:{fr:"Kofi est en insuffisance rénale chronique terminale. Il a besoin de 3 séances de dialyse par semaine pendant 6 mois en attente de greffe.",en:"Kofi has end-stage chronic kidney failure. He needs 3 dialysis sessions per week for 6 months while awaiting a transplant."}, status:"FUNDED" },
  { id:3, trackingId:"AYD-2025-003", title:{fr:"Chimiothérapie pour Fatou Diallo",en:"Chemotherapy for Fatou Diallo"}, beneficiary:"Fatou Diallo", age:28, city:"Abidjan", hospital:"Institut National d'Oncologie", category:{fr:"Oncologie",en:"Oncology"}, required:2400000, collected:480000, donors:31, daysLeft:45, image:"🎗️", urgent:false, videoUrl:null, desc:{fr:"Fatou, jeune maman de 2 enfants, a reçu un diagnostic de cancer du sein au stade II. Un protocole de chimiothérapie de 6 cycles est nécessaire.",en:"Fatou, a young mother of 2, was diagnosed with stage II breast cancer. A 6-cycle chemotherapy protocol is needed."}, status:"COLLECTING" },
  { id:4, trackingId:"AYD-2025-004", title:{fr:"Prothèse orthopédique pour Ibrahim",en:"Orthopedic prosthesis for Ibrahim"}, beneficiary:"Ibrahim Coulibaly", age:19, city:"Daloa", hospital:"CHR de Daloa", category:{fr:"Orthopédie",en:"Orthopedics"}, required:620000, collected:620000, donors:62, daysLeft:0, image:"🦾", urgent:false, videoUrl:null, desc:{fr:"Ibrahim a perdu sa jambe droite suite à un accident de la route. Grâce à votre générosité, l'objectif est atteint !",en:"Ibrahim lost his right leg in a road accident. Thanks to your generosity, the goal has been reached!"}, status:"FUNDED" },
  { id:5, trackingId:"AYD-2025-005", title:{fr:"Traitement neurologique pour Mariam",en:"Neurological treatment for Mariam"}, beneficiary:"Mariam Ouédraogo", age:41, city:"Abidjan", hospital:"CHU de Yopougon", category:{fr:"Neurologie",en:"Neurology"}, required:1100000, collected:330000, donors:22, daysLeft:4, image:"🧠", urgent:true, videoUrl:null, photos:["https://images.unsplash.com/photo-1584515933487-779824d29309?w=600&q=80"], desc:{fr:"Mariam souffre d'une sclérose en plaques progressivement invalidante.",en:"Mariam suffers from progressively disabling multiple sclerosis."}, status:"COLLECTING" },
  { id:6, trackingId:"AYD-2025-006", title:{fr:"Opération de la vue pour Kouassi",en:"Eye surgery for Kouassi"}, beneficiary:"Kouassi Yao", age:67, city:"San-Pédro", hospital:"Clinique Vision CI", category:{fr:"Oncologie",en:"Oncology"}, required:380000, collected:285000, donors:41, daysLeft:8, image:"👁️", urgent:false, videoUrl:null, desc:{fr:"Kouassi souffre de glaucome bilatéral avancé. Sans une opération urgente, il risque de perdre définitivement la vue.",en:"Kouassi suffers from advanced bilateral glaucoma. Without urgent surgery, he risks permanently losing his sight."}, status:"COLLECTING" },
  { id:7, trackingId:"AYD-2025-007", title:{fr:"Amputation évitable pour Seydou",en:"Avoidable amputation for Seydou"}, beneficiary:"Seydou Bah", age:23, city:"Korhogo", hospital:"CHR de Korhogo", category:{fr:"Orthopédie",en:"Orthopedics"}, required:750000, collected:120000, donors:14, daysLeft:1, image:"🦴", urgent:true, videoUrl:null, desc:{fr:"Seydou a une infection osseuse grave au pied gauche. Sans traitement immédiat, les médecins devront amputer. Il reste moins de 24h pour agir.",en:"Seydou has a serious bone infection in his left foot. Without immediate treatment, doctors will have to amputate. Less than 24 hours to act."}, status:"COLLECTING" },
  { id:8, trackingId:"AYD-2025-008", title:{fr:"Accouchement d'urgence pour Rokia",en:"Emergency delivery for Rokia"}, beneficiary:"Rokia Soro", age:26, city:"Yamoussoukro", hospital:"CHR de Yamoussoukro", category:{fr:"Gynécologie",en:"Gynecology"}, required:420000, collected:85000, donors:9, daysLeft:1, image:"🌸", urgent:true, videoUrl:null, desc:{fr:"Rokia est enceinte de 8 mois avec une grossesse à haut risque. Une césarienne d'urgence est nécessaire dans les prochaines heures.",en:"Rokia is 8 months pregnant with a high-risk pregnancy. An emergency C-section is needed in the coming hours."}, status:"COLLECTING" },
  { id:9, trackingId:"AYD-2025-009", title:{fr:"Greffe de cornée pour Abou",en:"Cornea transplant for Abou"}, beneficiary:"Abou Diomandé", age:15, city:"Man", hospital:"CHR de Man", category:{fr:"Neurologie",en:"Neurology"}, required:890000, collected:220000, donors:18, daysLeft:3, image:"👀", urgent:true, videoUrl:null, desc:{fr:"Abou, 15 ans, perd la vue progressivement. La cornée donneuse est disponible mais l'opération doit se faire avant 72h sinon elle sera perdue.",en:"Abou, 15, is progressively losing his sight. The donor cornea is available but surgery must happen within 72h or it will be lost."}, status:"COLLECTING" },
  { id:10, trackingId:"AYD-2025-010", title:{fr:"Dialyse pédiatrique pour Bintou",en:"Pediatric dialysis for Bintou"}, beneficiary:"Bintou Koné", age:8, city:"Abidjan", hospital:"CHU de Yopougon", category:{fr:"Pédiatrie",en:"Pediatrics"}, required:1200000, collected:310000, donors:27, daysLeft:5, image:"👶", urgent:true, videoUrl:null, desc:{fr:"Bintou, 8 ans, est en insuffisance rénale aiguë. Elle nécessite une dialyse d'urgence pour survivre. Chaque heure compte pour cette petite fille.",en:"Bintou, 8, is in acute kidney failure. She needs emergency dialysis to survive. Every hour counts for this little girl."}, status:"COLLECTING" },
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
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm">{(user.name||user.email||"U")[0].toUpperCase()}</div>
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
  return (
    <div onClick={onClick} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden group">
      <div className="h-32 flex items-center justify-center text-6xl bg-gradient-to-br from-emerald-50 to-teal-50 group-hover:from-emerald-100 transition-colors">{c.image}</div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-gray-900 text-sm leading-snug group-hover:text-emerald-700 transition-colors">{c.title[lang]}</h3>
          <div className="flex flex-col gap-1 flex-shrink-0">
            {c.urgent && <Badge color="red">{t.badges.urgent}</Badge>}
            <Badge color={funded?"green":"blue"}>{funded?t.badges.funded:c.category[lang]}</Badge>
          </div>
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
  const intervalRef = React.useRef(null);

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
                    <div className="h-32 bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center text-7xl relative">
                      {c.image}
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
      {c.videoUrl && (
        <div>
          {photos.length > 0 && <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-2 text-sm font-semibold text-gray-700"><span>🎥</span>{t.video.title}</div>}
          {!photos.length && <div className="px-4 py-2 flex items-center gap-2 text-sm font-semibold text-gray-700"><span>🎥</span>{t.video.title}</div>}
          <div className="relative w-full" style={{paddingBottom:"56.25%"}}>
            <iframe src={c.videoUrl} className="absolute inset-0 w-full h-full" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Patient video" />
          </div>
        </div>
      )}
    </div>
  );
};

// ── MobilePay Widget — Wave / Orange Money / MTN ──────────────
const MobilePayWidget = ({ amount, caseData, lang, onSuccess }) => {
  const [step, setStep] = useState("choose"); // choose | enter | waiting | done
  const [provider, setProvider] = useState(null);
  const [phone, setPhone] = useState("");
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (step !== "waiting") return;
    if (countdown <= 0) { setStep("done"); return; }
    const t = setTimeout(() => setCountdown(c => c-1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown]);

  const providers = [
    { id:"WAVE", emoji:"🌊", label:"Wave", color:"bg-blue-600 hover:bg-blue-700", prefix:"+225 01" },
    { id:"ORANGE", emoji:"🟠", label:"Orange Money", color:"bg-orange-500 hover:bg-orange-600", prefix:"+225 07" },
    { id:"MTN", emoji:"🟡", label:"MTN MoMo", color:"bg-yellow-400 hover:bg-yellow-500 text-gray-900", prefix:"+225 05" },
  ];

  const selectedProvider = providers.find(p => p.id === provider);

  const handlePay = () => {
    if (!phone.trim() || phone.length < 8) return;
    setStep("waiting");
    setCountdown(30);
    setTimeout(() => { setStep("done"); onSuccess && onSuccess(); }, 30000);
  };

  if (step === "choose") return (
    <div className="space-y-2">
      <div className="text-xs font-bold text-gray-600 mb-3">{lang==="fr" ? "Choisissez votre opérateur :" : "Choose your operator:"}</div>
      {providers.map(pv => (
        <button key={pv.id} onClick={() => { setProvider(pv.id); setStep("enter"); }}
          className={"w-full "+pv.color+" text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-3 text-sm shadow-sm"}>
          <span className="text-xl">{pv.emoji}</span>
          <span>{pv.label}</span>
          <span className="ml-auto text-white/70 text-xs">{lang==="fr" ? "Payer " : "Pay "}{new Intl.NumberFormat("fr").format(amount)} FCFA →</span>
        </button>
      ))}
      <p className="text-center text-[10px] text-gray-400 pt-1">🔒 {lang==="fr" ? "Paiement sécurisé · Aucuns frais cachés" : "Secure payment · No hidden fees"}</p>
    </div>
  );

  if (step === "enter") return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setStep("choose")} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
        <span className="text-xl">{selectedProvider?.emoji}</span>
        <span className="font-bold text-gray-900 text-sm">{selectedProvider?.label}</span>
      </div>
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
        <div className="text-xs text-gray-500 mb-0.5">{lang==="fr" ? "Montant à débiter" : "Amount to charge"}</div>
        <div className="font-black text-xl text-emerald-700">{new Intl.NumberFormat("fr").format(amount)} FCFA</div>
        <div className="text-xs text-gray-400 mt-0.5">{lang==="fr" ? "Pour : " : "For: "}{caseData?.beneficiary}</div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1.5">{lang==="fr" ? "Votre numéro "+selectedProvider?.label : "Your "+selectedProvider?.label+" number"}</label>
        <div className="flex gap-2">
          <div className="bg-gray-100 border border-gray-200 rounded-xl px-3 py-3 text-xs text-gray-500 font-mono flex-shrink-0">+225</div>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))} maxLength={10}
            placeholder="07 00 00 00 00"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        </div>
      </div>
      <button onClick={handlePay} disabled={phone.length < 8}
        className={"w-full font-bold py-3.5 rounded-xl text-sm shadow-md disabled:bg-gray-200 disabled:text-gray-400 "+selectedProvider?.color+" text-white"}>
        {lang==="fr" ? "Confirmer et payer →" : "Confirm and pay →"}
      </button>
      <p className="text-center text-[10px] text-gray-400">{lang==="fr" ? "Une notification sera envoyée sur votre téléphone." : "A notification will be sent to your phone."}</p>
    </div>
  );

  if (step === "waiting") return (
    <div className="text-center space-y-4 py-4">
      <div className="relative w-16 h-16 mx-auto">
        <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-lg">{selectedProvider?.emoji}</div>
      </div>
      <div>
        <div className="font-black text-gray-900">{lang==="fr" ? "En attente de paiement..." : "Waiting for payment..."}</div>
        <div className="text-sm text-gray-500 mt-1">{lang==="fr" ? "Vérifiez votre téléphone" : "Check your phone"}</div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 text-sm">
        <div className="text-gray-500 text-xs mb-1">{lang==="fr" ? "Numéro" : "Number"}: <span className="font-mono font-bold">+225 {phone}</span></div>
        <div className="text-gray-500 text-xs">{lang==="fr" ? "Montant" : "Amount"}: <span className="font-bold text-emerald-700">{new Intl.NumberFormat("fr").format(amount)} FCFA</span></div>
      </div>
      <div className="text-xs text-gray-400">{lang==="fr" ? "Expiration dans" : "Expires in"} <span className="font-bold text-amber-600">{countdown}s</span></div>
    </div>
  );

  if (step === "done") return (
    <div className="text-center space-y-4 py-2">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">🎉</div>
      <div className="font-black text-xl text-gray-900">{lang==="fr" ? "Merci infiniment !" : "Thank you so much!"}</div>
      <div className="text-sm text-gray-500">{lang==="fr" ? "Votre don a bien été enregistré." : "Your donation has been recorded."}</div>
      <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-800 border border-emerald-100">
        <p className="font-semibold mb-1">{lang==="fr" ? "Ce que vous venez de faire :" : "What you just did:"}</p>
        <p>{lang==="fr" ? "Rapprocher " : "Brought "}{caseData?.beneficiary}{lang==="fr" ? " d'une vie meilleure." : " closer to a better life."}</p>
      </div>
      <button onClick={() => { setStep("choose"); setPhone(""); setCountdown(30); }}
        className="w-full border border-emerald-200 text-emerald-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-50">
        {lang==="fr" ? "Refaire un don" : "Donate again"}
      </button>
    </div>
  );

  return null;
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
              ? "Wave, Orange Money et MTN Money seront intégrés très prochainement. Merci pour votre patience et votre soutien."
              : "Wave, Orange Money and MTN Money will be integrated very soon. Thank you for your patience and support."}
          </p>
          <div className="flex justify-center gap-4 mt-6 text-2xl opacity-60">
            <span>🌊</span><span>🟠</span><span>💛</span>
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
              <div className="text-4xl">{c.image}</div>
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
  const cases = MOCK_CASES.filter(c => c.status !== "FUNDED" && c.category[lang] === specialite);
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
                    {c.image}
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
  const active = MOCK_CASES.filter(c => c.status !== "FUNDED");
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
                <div className="text-4xl">{c.image}</div>
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
  const [heroMenu, setHeroMenu] = useState(false);
  const t = T[lang];
  const catMap = lang==="fr" ? ["Tous","Cardiologie","Oncologie","Néphrologie","Orthopédie"] : ["All","Cardiology","Oncology","Nephrology","Orthopedics"];
  const filtered = filter==="all"||filter===catMap[0] ? MOCK_CASES : MOCK_CASES.filter(c => c.category[lang].toLowerCase()===filter.toLowerCase());
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
            {[["142",t.stats.patients],["89M",t.stats.collected],["18",t.stats.hospitals]].map(([v,l]) => (
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
  const presets = [1000,5000,10000,25000,50000];

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
  const DonateForm = () => (
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
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="15 000" className="w-full border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 pr-16" />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">FCFA</span>
        </div>
        {amount&&Number(amount)>=500&&<div className="text-xs text-center text-gray-400 mt-1.5">{lang==="fr"?"Débité : ":"Charged: "}<span className="font-bold text-gray-700">{fmt(Number(amount))}</span></div>}
      </div>
      <div className="mb-4">
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={td.message} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400" />
      </div>
      {/* Widget paiement mobile — Wave / Orange Money / MTN */}
      {amount && Number(amount) >= 500 ? (
        <MobilePayWidget
          amount={Number(amount)}
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
            <div className="h-52 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 flex items-center justify-center text-9xl">{c.image}</div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2 mb-3"><Badge color="blue">{c.category[lang]}</Badge><Badge color="green">{t.badges.verified}</Badge>{funded&&<Badge color="green">{t.badges.funded}</Badge>}{c.urgent&&<Badge color="red">{t.badges.urgent}</Badge>}</div>
              <h1 className="text-2xl font-black text-gray-900 mb-3">{c.title[lang]}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4"><span>🏥 {c.hospital}</span><span>📍 {c.city}</span><span>👤 {c.age} {lang==="fr"?"ans":"years"}</span></div>
              {c.trackingId && (
                <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-xl px-3 py-2 w-fit">
                  <span className="text-xs text-gray-400">{lang==="fr"?"ID de suivi :":"Tracking ID:"}</span>
                  <span className="text-xs font-mono font-bold text-emerald-700">{c.trackingId}</span>
                  <button onClick={() => navigator.clipboard.writeText(c.trackingId)} className="text-xs text-gray-400 hover:text-emerald-600">📋</button>
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
            {(donMode==="anonymous" || donMode==="logged") && !funded && <DonateForm />}

            {/* ÉTAPE 3 — Confirmation */}
            {donMode==="confirm" && <div className="space-y-5">
              <div className="text-center"><div className="text-4xl mb-2">💚</div><h3 className="font-black text-lg text-gray-900">{td.confirm}</h3><p className="text-sm text-gray-500">{td.verifyDon}</p></div>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3 text-sm">
                {[[td.debited,fmt(Number(amount))],[td.beneficiary,c.beneficiary],[td.via,provider==="WAVE"?"🌊 Wave":provider==="ORANGE_MONEY"?"🟠 Orange Money":"💳 "+(lang==="fr"?"Carte":"Card")],[td.anonymity, anonymous ? "🕵️ "+(lang==="fr"?"Anonyme":"Anonymous") : "👤 "+(lang==="fr"?"Avec compte":"With account")]].map(([k,v],i) => (
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
    const isAdmin = email === "kedhard80@gmail.com"; // Set your admin email here
    setUser({ id: data.user.id, name: meta.full_name || email, email, isAdmin });
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
          <button onClick={()=>role&&setStep(2)} disabled={!role} className="w-full bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">{t.continue}</button>
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
  const [form, setForm] = useState({title:"",description:"",hospital:"",city:"",amount:"",category:""});
  const [fileStates, setFileStates] = useState({medical:"idle",quote:"idle",id:"idle",consent:"idle"});
  const [fileUrls, setFileUrls] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const t = T[lang].submit;
  const allUploaded = Object.values(fileStates).every(s => s==="done");

  const handleFileUpload = async (key, file) => {
    if (!file) return;
    setFileStates(prev => ({...prev, [key]: "uploading"}));
    const fileName = `${Date.now()}_${key}_${file.name}`;
    const { error } = await supabase.storage.from("medical-documents").upload(fileName, file);
    if (error) {
      setFileStates(prev => ({...prev, [key]: "error"}));
      return;
    }
    const { data: urlData } = supabase.storage.from("medical-documents").getPublicUrl(fileName);
    setFileUrls(prev => ({...prev, [key]: urlData.publicUrl}));
    setFileStates(prev => ({...prev, [key]: "done"}));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    const { error } = await supabase.from("cases").insert({
      title: form.title,
      description: form.description,
      hospital: form.hospital,
      city: form.city,
      amount: parseFloat(form.amount),
      category: form.category,
      full_name: user?.name || "Anonyme",
      photo_url: fileUrls.medical || null,
      status: "PENDING",
      user_id: user?.id || null,
    });
    if (error) { setSubmitError(lang==="fr"?"Erreur lors de la soumission. Réessayez.":"Submission error. Please try again."); setSubmitting(false); return; }
    emailNewCase({ caseTitle: form.title, hospital: form.hospital, city: form.city, amount: form.amount });
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
          <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.titleField}</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
          <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.descField}</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={4} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" /></div>
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
            <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.amountField}</label><input value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
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
                <input
                  value={form.categoryOther || ""}
                  onChange={e => setForm({...form, categoryOther: e.target.value})}
                  placeholder={lang==="fr" ? "Précisez la spécialité médicale..." : "Specify the medical specialty..."}
                  className="w-full border-2 border-emerald-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50"
                />
              </div>
            )}
          </div>
          <button onClick={()=>setStep(2)} disabled={!form.title||!form.description||!form.hospital||!form.amount} className="w-full bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">{t.next}</button>
        </div>}
        {step===2&&<div className="space-y-4">
          <h2 className="font-black text-xl text-gray-900">{t.docsTitle}</h2>
          <p className="text-sm text-gray-500">{t.docsSub}</p>
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
        <div className="bg-white/10 rounded-2xl p-6 text-sm max-w-xs mx-auto border border-white/20">
          <div className="text-gray-400 mb-1 text-xs uppercase tracking-wider">{t.youGive}</div>
          <div className="text-3xl font-black my-2">10 000 FCFA</div>
          <div className="border-t border-white/20 my-4"/>
          <div className="flex justify-between items-center mb-2"><span className="text-emerald-400 text-sm">{t.collectReceives}</span><span className="font-black text-lg">9 500 FCFA</span></div>
          <div className="flex justify-between items-center text-gray-400 text-xs"><span>{t.ayyadFee}</span><span>500 FCFA</span></div>
        </div>
      </div>
    </div>
  );
};

// ── Admin Page — Real Supabase data ───────────────────────────
const AdminPage = ({ user, setPage, lang }) => {
  const [tab, setTab] = useState("overview");
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [payMethods, setPayMethods] = useState({}); // { caseId: "WAVE"|"ORANGE"|"MTN"|"BANK" }
  const [confirmingId, setConfirmingId] = useState(null); // caseId en cours de confirmation
  const [expandedPayoutId, setExpandedPayoutId] = useState(null); // collecte expand dans virements
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
      .update({ status: "APPROVED" })
      .eq("id", id);
    if (!error) setCases(prev => prev.map(c => c.id===id ? {...c, status:"APPROVED"} : c));
  };

  // ── Reject a case ──
  const rejectCase = async (id) => {
    const { error } = await supabase
      .from("cases")
      .update({ status: "REJECTED", rejection_reason: rejectReason })
      .eq("id", id);
    if (!error) {
      setCases(prev => prev.map(c => c.id===id ? {...c, status:"REJECTED"} : c));
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
                        {c.photo_url&&(
                          <a href={c.photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline font-medium">
                            📎 {lang==="fr"?"Voir document":"View document"}
                          </a>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          {lang==="fr"?"Soumis le ":"Submitted: "}{new Date(c.created_at).toLocaleDateString(lang==="fr"?"fr-FR":"en-US")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge color="yellow">{t.statusLabels.PENDING}</Badge>
                        <button onClick={() => toggleUrgent(c.id, c.urgent)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${c.urgent || isAutoUrgent(c) ? "bg-red-600 text-white border-red-600" : "border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600"}`}>
                          {c.urgent || isAutoUrgent(c) ? "🚨 Urgent" : "⚪ Urgent"}
                        </button>
                        <button onClick={() => { setRejectModal(c.id); }} className="px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50">{t.reject}</button>
                        <button onClick={() => approveCase(c.id)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm">{t.approve}</button>
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
                const map = { WAVE:"🌊 Wave", ORANGE:"🟠 Orange Money", MTN:"🟡 MTN MoMo", BANK:"🏦 Virement bancaire" };
                return <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{map[method]||method}</span>;
              };

              return (
                <div className="space-y-4">

                  {/* Collectes 100% — en attente de virement */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🟡</span>
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
                                          {id:"ORANGE",emoji:"🟠",label:"Orange Money",bg:"bg-orange-500 hover:bg-orange-600",ring:"ring-orange-400"},
                                          {id:"MTN",emoji:"🟡",label:"MTN MoMo",bg:"bg-yellow-400 hover:bg-yellow-500 text-gray-900",ring:"ring-yellow-400"},
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
                                          <span className="text-emerald-200 text-xs">via {payMethod==="WAVE"?"🌊 Wave":payMethod==="ORANGE"?"🟠 Orange":payMethod==="MTN"?"🟡 MTN":"🏦 Banque"}</span>
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    /* Modal confirmation */
                                    <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 space-y-4">
                                      <div className="flex items-center gap-2 text-amber-700 font-black"><span className="text-xl">⚠️</span>Confirmer le virement ?</div>
                                      <div className="bg-white rounded-xl p-4 space-y-2 text-sm">
                                        <div className="flex justify-between"><span className="text-gray-500">Bénéficiaire</span><span className="font-bold">{c.hospital}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Référence</span><span className="font-mono font-bold text-emerald-700">{c.tracking_id||"AYD-"+c.id}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Devis hôpital</span><span className="font-black text-emerald-700 text-base">{fin.devisHopital.toLocaleString()} FCFA</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Frais Ayyad</span><span className="font-bold text-amber-600">{fin.fraisAyyadBase.toLocaleString()} FCFA ✓</span></div>
                                        {hasSurplus && (
                                          <div className="border-t border-dashed border-gray-200 pt-2 space-y-1">
                                            <div className="text-xs text-emerald-700 font-bold">🎉 Surcollecte +{fin.surplus.toLocaleString()} FCFA</div>
                                            <div className="flex justify-between text-xs"><span className="text-gray-500">→ Bénéficiaire (70%)</span><span className="font-bold text-blue-600">{fin.partBeneficiaire.toLocaleString()} FCFA</span></div>
                                            <div className="flex justify-between text-xs"><span className="text-gray-500">→ 5 cas urgents (25%)</span><span className="font-bold text-purple-600">{fin.partRedistrib.toLocaleString()} FCFA</span></div>
                                            <div className="flex justify-between text-xs"><span className="text-gray-500">→ Ayyad 5% surplus</span><span className="font-bold text-amber-600">{fin.fraisAyyadSurplus.toLocaleString()} FCFA</span></div>
                                          </div>
                                        )}
                                        <div className="flex justify-between border-t border-gray-100 pt-2"><span className="text-gray-500">Via</span>
                                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{payMethod==="WAVE"?"🌊 Wave":payMethod==="ORANGE"?"🟠 Orange Money":payMethod==="MTN"?"🟡 MTN MoMo":"🏦 Virement bancaire"}</span>
                                        </div>
                                        <div className="flex justify-between"><span className="text-gray-500">Patient</span><span className="font-semibold">{c.full_name||c.beneficiary||"—"}</span></div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => setConfirmingId(null)} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm">Annuler</button>
                                        <button onClick={async () => {
                                          await supabase.from("cases").update({
                                            payout_status: "initiated", payout_method: payMethod,
                                            payout_initiated_at: new Date().toISOString(),
                                            payout_amount_hospital: fin.devisHopital, payout_amount_ayyad: fin.totalAyyad,
                                          }).eq("id", c.id);
                                          setCases(prev => prev.map(x => x.id===c.id ? {...x, payout_status:"initiated", payout_method: payMethod, payout_amount_hospital: fin.devisHopital, payout_amount_ayyad: fin.totalAyyad} : x));
                                          emailNewCase({ caseTitle: "VIREMENT "+payMethod+" - "+(c.title||c.id)+" - "+fin.devisHopital.toLocaleString()+" FCFA - Ayyad: "+fin.totalAyyad.toLocaleString()+" FCFA"+(fin.surplus>0?" - Surplus: "+fin.surplus.toLocaleString()+" FCFA":""), hospital: c.hospital, city: c.city, amount: fin.devisHopital });
                                          setConfirmingId(null);
                                          setExpandedPayoutId(null);
                                        }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-sm shadow-md">
                                          ✅ Confirmer le virement
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
                          return (
                            <div key={c.id} className="p-4 space-y-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                  <div className="font-semibold text-gray-900 text-sm">{c.title}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">🏥 {c.hospital} · Via {c.payout_method==="WAVE"?"🌊 Wave":c.payout_method==="ORANGE"?"🟠 Orange Money":c.payout_method==="MTN"?"🟡 MTN MoMo":"🏦 Banque"}</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-black text-emerald-700">{montantHopital.toLocaleString()} FCFA</div>
                                  <div className="text-xs text-amber-500">+{fraisAyyad.toLocaleString()} FCFA Ayyad</div>
                                </div>
                              </div>
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
                                <div className="text-xs text-gray-400 mt-0.5">🏥 {c.hospital} · {c.payout_method==="WAVE"?"🌊 Wave":c.payout_method==="ORANGE"?"🟠 Orange":c.payout_method==="MTN"?"🟡 MTN":"🏦 Banque"}</div>
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

// ── Footer ────────────────────────────────────────────────────
const Footer = ({ setPage, lang }) => {
  const t = T[lang].footer;
  return (
    <footer className="bg-gray-950 text-white mt-16">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1"><div className="flex items-center gap-2 mb-4"><svg width="36" height="36" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="35" cy="35" r="33" fill="#1a6b3a"/><circle cx="35" cy="35" r="33" fill="none" stroke="#C9A84C" strokeWidth="2.5"/><rect x="29" y="18" width="12" height="34" rx="3" fill="#C9A84C"/><rect x="18" y="29" width="34" height="12" rx="3" fill="#C9A84C"/><path d="M31 32 C31 30.5, 32.5 29.5, 35 31.5 C37.5 29.5, 39 30.5, 39 32 C39 34, 35 37, 35 37 C35 37, 31 34, 31 32Z" fill="#0d5c2e"/></svg><span className="font-black text-xl" style={{fontFamily:"Georgia, serif", letterSpacing:"1px"}}>AYYAD</span></div><p className="text-gray-400 text-xs leading-relaxed">{t.tagline}</p></div>
          {[[t.platform,t.platformLinks],[t.trust,t.trustLinks],[t.legal,t.legalLinks]].map(([title,links])=><div key={title}><div className="font-bold text-sm mb-4 text-gray-300">{title}</div><ul className="space-y-2.5">{links.map(l=><li key={l}><a href="#" className="text-gray-500 text-xs hover:text-emerald-400 transition-colors">{l}</a></li>)}</ul></div>)}
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
const TrackingPage = ({ setPage, lang }) => {
  const [trackingId, setTrackingId] = useState("");
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const search = async (id) => {
    if (!id.trim()) return;
    setLoading(true); setNotFound(false); setCaseData(null);
    const { data } = await supabase.from("cases").select("*").eq("id", id.trim()).single();
    if (data) setCaseData(data);
    else setNotFound(true);
    setLoading(false);
  };

  const pct = (c) => c.required > 0 ? Math.min(100, Math.round((c.collected||0)/c.required*100)) : 0;

  const steps = lang==="fr"
    ? ["Dossier reçu","Vérification Ayyad","En ligne","Financé","Virement hôpital"]
    : ["Case received","Ayyad review","Live","Funded","Hospital payout"];

  const statusToStep = (s, ps) => {
    if (ps === "confirmed") return 4;
    if (ps === "initiated") return 4;
    if (s === "FUNDED") return 3;
    if (s === "APPROVED") return 2;
    if (s === "PENDING") return 1;
    return 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔍</div>
          <h1 className="text-2xl font-black text-gray-900">{lang==="fr" ? "Suivi de collecte" : "Campaign tracking"}</h1>
          <p className="text-gray-500 text-sm mt-2">{lang==="fr" ? "Entrez l'identifiant de la collecte pour voir son statut en temps réel." : "Enter the campaign ID to see its real-time status."}</p>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <label className="text-sm font-semibold text-gray-700 block mb-2">{lang==="fr" ? "Identifiant de collecte" : "Campaign ID"}</label>
          <div className="flex gap-2">
            <input value={trackingId} onChange={e=>setTrackingId(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search(trackingId)}
              placeholder={lang==="fr" ? "Ex: abc123..." : "Ex: abc123..."} className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <button onClick={() => search(trackingId)} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-xl text-sm">
              {loading ? "..." : lang==="fr" ? "Rechercher" : "Search"}
            </button>
          </div>
          {notFound && <p className="text-red-500 text-sm mt-2">{lang==="fr" ? "Aucune collecte trouvée avec cet identifiant." : "No campaign found with this ID."}</p>}
        </div>

        {/* Results */}
        {caseData && (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-black text-lg text-gray-900">{caseData.title}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{caseData.hospital} · {caseData.city}</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-bold flex-shrink-0 ${
                  caseData.payout_status==="confirmed" ? "bg-emerald-100 text-emerald-700" :
                  caseData.status==="FUNDED" ? "bg-blue-100 text-blue-700" :
                  caseData.status==="APPROVED" ? "bg-emerald-100 text-emerald-700" :
                  "bg-yellow-100 text-yellow-700"
                }`}>
                  {caseData.payout_status==="confirmed" ? "✅ "+(lang==="fr"?"Virement effectué":"Payout done") :
                   caseData.status==="FUNDED" ? "💰 "+(lang==="fr"?"Financé":"Funded") :
                   caseData.status==="APPROVED" ? "🟢 "+(lang==="fr"?"En ligne":"Live") :
                   "🟡 "+(lang==="fr"?"En vérification":"Under review")}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{(caseData.collected||0).toLocaleString()} FCFA {lang==="fr"?"collectés":"collected"}</span>
                  <span>{lang==="fr"?"Objectif":"Goal"}: {(caseData.required||caseData.amount||0).toLocaleString()} FCFA</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{width: pct(caseData)+"%"}} />
                </div>
                <div className="text-right text-xs text-emerald-600 font-bold mt-1">{pct(caseData)}%</div>
              </div>

              {/* Steps */}
              <div className="relative">
                <div className="flex justify-between items-center">
                  {steps.map((s, i) => {
                    const current = statusToStep(caseData.status, caseData.payout_status);
                    const done = i <= current;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 ${done ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                          {done ? "✓" : i+1}
                        </div>
                        <div className={`text-center text-xs mt-1 leading-tight ${done ? "text-emerald-600 font-semibold" : "text-gray-400"}`} style={{fontSize:"10px"}}>{s}</div>
                        {i < steps.length-1 && (
                          <div className={`absolute h-0.5 ${done && i < statusToStep(caseData.status, caseData.payout_status) ? "bg-emerald-400" : "bg-gray-200"}`}
                            style={{top:"14px", left:`${(i+0.5)*20}%`, width:"20%"}} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Reçu virement */}
            {caseData.payout_receipt && (
              <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5 flex items-center gap-4">
                <div className="text-3xl">📄</div>
                <div className="flex-1">
                  <div className="font-bold text-emerald-800 text-sm">{lang==="fr" ? "Reçu de virement disponible" : "Transfer receipt available"}</div>
                  <div className="text-xs text-emerald-600 mt-0.5">{lang==="fr" ? "Les fonds ont été versés directement à l'hôpital." : "Funds were sent directly to the hospital."}</div>
                </div>
                <a href={caseData.payout_receipt} target="_blank" rel="noreferrer" className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl">
                  {lang==="fr" ? "Voir →" : "View →"}
                </a>
              </div>
            )}

            {/* Info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-3">{lang==="fr" ? "Informations" : "Information"}</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">{lang==="fr"?"Bénéficiaire":"Beneficiary"}</span><span className="font-semibold text-gray-900">{caseData.full_name||"—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{lang==="fr"?"Hôpital":"Hospital"}</span><span className="font-semibold text-gray-900">{caseData.hospital}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{lang==="fr"?"Catégorie":"Category"}</span><span className="font-semibold text-gray-900">{caseData.category||"—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{lang==="fr"?"Soumis le":"Submitted"}</span><span className="font-semibold text-gray-900">{caseData.created_at ? new Date(caseData.created_at).toLocaleDateString(lang==="fr"?"fr-FR":"en-US") : "—"}</span></div>
              </div>
            </div>

            <button onClick={() => { setCaseData(null); setTrackingId(""); }} className="w-full text-gray-400 text-sm hover:text-gray-600 py-2">
              {lang==="fr" ? "← Nouvelle recherche" : "← New search"}
            </button>
          </div>
        )}

        <div className="text-center mt-8">
          <button onClick={() => setPage("home")} className="text-sm text-gray-400 hover:text-emerald-600">{lang==="fr" ? "← Retour à l'accueil" : "← Back to home"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Change Password Page ──────────────────────────────────────
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
  const [lang, setLang] = useState("fr");
  const [user, setUser] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [specialite, setSpecialite] = useState("");

  // Restore session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const isAdmin = session.user.email === "kedhard80@gmail.com";
        setUser({ id: session.user.id, name: meta.full_name || session.user.email, email: session.user.email, isAdmin });
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
        {page==="urgents"&&<UrgentsPage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} />}
        {page==="login"&&<LoginPage setPage={setPage} setUser={setUser} lang={lang} />}
        {page==="register"&&<RegisterPage setPage={setPage} setUser={setUser} lang={lang} />}
        {page==="submit"&&<SubmitPage setPage={setPage} user={user} lang={lang} />}
        {page==="admin"&&<AdminPage user={user} setPage={setPage} lang={lang} />}
        {page==="tracking"&&<TrackingPage setPage={setPage} lang={lang} />}
        {page==="changepassword"&&<ChangePasswordPage setPage={setPage} lang={lang} />}
      </main>
      {showFooter&&<Footer setPage={setPage} lang={lang} />}
    </div>
  );
}
