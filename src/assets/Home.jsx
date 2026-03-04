import { useState } from "react";
import { supabase } from "../supabase";

// ════════════════════════════════════════════════════════════
// TRANSLATIONS
// ════════════════════════════════════════════════════════════
const T = {
  fr: {
    nav: { collections: "Collectes", how: "Comment ça marche", admin: "Administration", login: "Connexion", start: "Démarrer", logout: "Déconnexion", medicalFinancing: "Financement médical" },
    hero: { badge: "Plateforme vérifiée & sécurisée", title1: "Ensemble, nous finançons", title2: "des vies sauvées", sub: "Chaque don arrive directement à l'hôpital. Transparence totale, zéro frais cachés.", cta1: "Voir les collectes", cta2: "Soumettre un dossier" },
    stats: { patients: "Patients aidés", collected: "FCFA collectés", hospitals: "Hôpitaux partenaires" },
    collections: { title: "Collectes en cours", sub: "dossiers vérifiés actifs", all: "Tous", filters: ["Tous","Cardiologie","Oncologie","Néphrologie","Orthopédie"] },
    card: { donors: "donateurs", daysLeft: "j restants", funded: "Objectif atteint !", on: "sur" },
    how: { title: "Comment fonctionne Ayyad ?", sub: "Simple, sécurisé, conçu pour l'Afrique", steps: [{ n:"1",icon:"📋",title:"Dossier soumis",desc:"Le patient soumet son rapport médical et devis hospitalier" },{ n:"2",icon:"🔍",title:"Vérification",desc:"Notre équipe vérifie avec l'hôpital partenaire sous 48h" },{ n:"3",icon:"💚",title:"Don direct",desc:"Vous payez exactement le montant choisi. Aucun frais caché." },{ n:"4",icon:"🏥",title:"Versement hôpital",desc:"Les fonds sont versés directement à l'établissement de santé" }] },
    donate: { title: "Faire un don", sub: "Vous serez débité exactement du montant choisi.", amount: "Montant (FCFA)", custom: "Autre", payment: "Moyen de paiement", anonymous: "Don anonyme", message: "Laisser un message...", btnFunded: "Collecte terminée", btn: "Donner", secure: "Paiement sécurisé · Aucuns frais cachés", confirm: "Confirmation", verifyDon: "Vérifiez votre don", debited: "Montant débité", beneficiary: "Bénéficiaire", via: "Via", anonymity: "Anonymat", active: "✓ Activé", modify: "Modifier", confirmBtn: "Confirmer ✓", thanks: "Merci infiniment !", thanksSub: "Votre don a bien été pris en compte.", impact: "Ce que vous venez de faire :", impactSub: "Rapprocher", impactEnd: "d'une vie meilleure.", again: "Refaire un don" },
    guarantee: { title: "Garantie Ayyad", desc: "Fonds versés directement à l'hôpital partenaire. Jamais en espèces. Chaque virement est audité." },
    submit: { title: "Soumettre un dossier", steps: ["Informations","Documents","Confirmation"], infoTitle: "Décrivez votre situation médicale", titleField: "Titre de la collecte *", descField: "Description *", hospitalField: "Hôpital *", cityField: "Ville *", amountField: "Montant du devis (FCFA) *", categoryField: "Spécialité", cats: ["Cardiologie","Oncologie","Neurologie","Orthopédie","Pédiatrie","Gynécologie","Autre"], next: "Continuer →", docsTitle: "Documents requis", docsSub: "Tous les documents sont chiffrés (AES-256).", docs: [{ key:"medical",icon:"📄",title:"Rapport médical",desc:"Compte-rendu ou ordonnance du médecin" },{ key:"quote",icon:"🏥",title:"Devis hospitalier",desc:"Devis officiel signé par l'établissement" },{ key:"id",icon:"🪪",title:"Pièce d'identité",desc:"CNI, passeport ou titre de séjour valide" },{ key:"consent",icon:"✍️",title:"Consentement données",desc:"Formulaire Ayyad de consentement" }], upload: "Uploader", uploaded: "✓ Envoyé", warning: "Tous les documents sont obligatoires pour la vérification.", back: "← Retour", submit: "Soumettre →", successTitle: "Dossier soumis !", successSub: "Votre dossier est en cours d'examen.", processSteps: ["Dossier reçu et numéroté","Vérification équipe Ayyad (< 48h)","Contact hôpital pour validation devis","Mise en ligne de la collecte"], backHome: "Retour à l'accueil" },
    login: { title: "Connexion à Ayyad", sub: "Bienvenue ! Connectez-vous à votre espace.", demoLabel: "Profil de démo", roles: [{ id:"donor",label:"Donateur",icon:"💚" },{ id:"beneficiary",label:"Patient",icon:"🏥" },{ id:"admin",label:"Admin",icon:"⚙️" }], email: "Email ou téléphone", password: "Mot de passe", btn: "Se connecter →", noAccount: "Pas encore de compte ?", register: "S'inscrire" },
    register: { title: "Créer un compte", roleQ: "Je souhaite...", roles: [{ id:"donor",icon:"💚",title:"Faire des dons",desc:"Aider des patients dans le besoin" },{ id:"beneficiary",icon:"🏥",title:"Recevoir des soins",desc:"Financer une intervention médicale" }], fields: [{ key:"name",label:"Nom complet",p:"Aminata Koné",type:"text" },{ key:"email",label:"Email",p:"vous@exemple.ci",type:"email" },{ key:"phone",label:"Numéro Wave / Orange Money",p:"+225 07 XX XX XX XX",type:"tel" },{ key:"password",label:"Mot de passe",p:"••••••••",type:"password" }], terms: "J'accepte les", termsLink: "conditions d'utilisation", and: "et la", privacyLink: "politique de confidentialité", btn: "Créer mon compte", continue: "Continuer →", back: "← Retour", hasAccount: "Déjà un compte ?", signin: "Se connecter" },
    admin: { title: "Administration Ayyad", sub: "Tableau de bord opérationnel", status: "Système opérationnel", tabs: [{ id:"overview",label:"Vue d'ensemble",icon:"📊" },{ id:"cases",label:"Dossiers",icon:"📋" },{ id:"fraud",label:"Fraude",icon:"🔍" },{ id:"payouts",label:"Virements",icon:"🏦" }], stats: [{ label:"Dossiers actifs",v:"23",icon:"📋" },{ label:"Dons ce mois",v:"12.4M FCFA",icon:"💚" },{ label:"Bénéficiaires aidés",v:"142",icon:"🏥" }], recentTitle: "Collectes récentes", revenueTitle: "Revenus opérationnels (5%)", months: [{ month:"Mars 2025",dons:"24.8M",fees:"1 240 000 FCFA" },{ month:"Fév. 2025",dons:"19.2M",fees:"960 000 FCFA" },{ month:"Jan. 2025",dons:"15.1M",fees:"755 000 FCFA" }], pendingTitle: "Dossiers en attente de validation", pending: "en attente", empty: "Tous les dossiers ont été traités", risk: "Risque", reject: "Rejeter", approve: "Approuver ✓", fraudTitle: "Alertes fraude", fraudLabels: [{ label:"Critiques",sev:"critical",c:"red" },{ label:"Élevées",sev:"high",c:"amber" },{ label:"Résolues",sev:null,c:"emerald" }], resolve: "Résoudre", resolved: "Résolu", payoutsTitle: "Virements hospitaliers", payoutsPending: "en attente", validate: "Valider →", active2: "Actif", funded: "Financé" },
    howPage: { title: "Comment fonctionne Ayyad ?", sub: "Transparent, sécurisé, conçu pour l'Afrique", forDonors: { icon:"💚",title:"Pour les donateurs",steps:["Parcourez les collectes vérifiées actives","Choisissez librement votre montant","Payez via Wave, Orange Money ou carte","Vous êtes débité exactement du montant choisi","L'argent arrive directement à l'hôpital"] }, forBenef: { icon:"🏥",title:"Pour les bénéficiaires",steps:["Créez un compte et soumettez votre dossier médical","Téléchargez rapport médical, devis, pièce d'identité","Notre équipe vérifie avec l'hôpital partenaire","Votre collecte est mise en ligne sous 48h","Les fonds sont versés directement à l'hôpital"] }, feeTitle: "La règle des 5% — Toujours silencieuse", feeSub: "Ayyad prélève une commission opérationnelle de 5% sur chaque don pour assurer le fonctionnement de la plateforme. Cette commission est totalement invisible pour vous : vous payez exactement ce que vous avez choisi.", youGive: "Vous donnez", collectReceives: "Collecte reçoit", ayyadFee: "Frais Ayyad (5%)" },
    footer: { tagline: "Financer la santé pour tous en Afrique.", platform: "Plateforme", trust: "Confiance", legal: "Légal", platformLinks: ["Collectes actives","Comment ça marche","Soumettre un dossier"], trustLinks: ["Vérification dossiers","Sécurité des paiements","Rapport d'impact"], legalLinks: ["Mentions légales","Confidentialité","Conformité BCEAO"], rights: "© 2025 Ayyad CI — Tous droits réservés" },
    badges: { verified: "✓ Dossier vérifié", collecting: "Actif", funded: "✓ Financé" },
    progress: { collected: "collectés sur", donors: "donateurs", daysLeft: "jours restants", intervention: "✓ Intervention planifiée", progressTitle: "Progression de la collecte", of: "de l'objectif" },
    back: "← Retour aux collectes",
  },
  en: {
    nav: { collections: "Campaigns", how: "How it works", admin: "Administration", login: "Login", start: "Get started", logout: "Logout", medicalFinancing: "Medical funding" },
    hero: { badge: "Verified & secure platform", title1: "Together, we fund", title2: "lives saved", sub: "Every donation goes directly to the hospital. Full transparency, zero hidden fees.", cta1: "See campaigns", cta2: "Submit a case" },
    stats: { patients: "Patients helped", collected: "FCFA raised", hospitals: "Partner hospitals" },
    collections: { title: "Active campaigns", sub: "verified active cases", all: "All", filters: ["All","Cardiology","Oncology","Nephrology","Orthopedics"] },
    card: { donors: "donors", daysLeft: "days left", funded: "Goal reached!", on: "of" },
    how: { title: "How does Ayyad work?", sub: "Simple, secure, built for Africa", steps: [{ n:"1",icon:"📋",title:"Case submitted",desc:"The patient submits their medical report and hospital quote" },{ n:"2",icon:"🔍",title:"Verification",desc:"Our team verifies with the partner hospital within 48h" },{ n:"3",icon:"💚",title:"Direct donation",desc:"You pay exactly the amount you chose. No hidden fees." },{ n:"4",icon:"🏥",title:"Hospital payment",desc:"Funds are transferred directly to the healthcare facility" }] },
    donate: { title: "Make a donation", sub: "You will be charged exactly the amount you choose.", amount: "Amount (FCFA)", custom: "Custom", payment: "Payment method", anonymous: "Anonymous donation", message: "Leave an encouraging message...", btnFunded: "Campaign closed", btn: "Donate", secure: "Secure payment · No hidden fees", confirm: "Confirmation", verifyDon: "Review your donation", debited: "Amount charged", beneficiary: "Beneficiary", via: "Via", anonymity: "Anonymity", active: "✓ Enabled", modify: "Edit", confirmBtn: "Confirm ✓", thanks: "Thank you so much!", thanksSub: "Your donation has been recorded.", impact: "What you just did:", impactSub: "Brought", impactEnd: "closer to a better life.", again: "Donate again" },
    guarantee: { title: "Ayyad Guarantee", desc: "Funds transferred directly to the partner hospital. Never in cash. Every transfer is audited." },
    submit: { title: "Submit a medical case", steps: ["Information","Documents","Confirmation"], infoTitle: "Describe your medical situation", titleField: "Campaign title *", descField: "Description *", hospitalField: "Hospital *", cityField: "City *", amountField: "Quoted amount (FCFA) *", categoryField: "Specialty", cats: ["Cardiology","Oncology","Neurology","Orthopedics","Pediatrics","Gynecology","Other"], next: "Continue →", docsTitle: "Required documents", docsSub: "All documents are encrypted (AES-256).", docs: [{ key:"medical",icon:"📄",title:"Medical report",desc:"Doctor's report or prescription" },{ key:"quote",icon:"🏥",title:"Hospital quote",desc:"Official quote signed by the institution" },{ key:"id",icon:"🪪",title:"Identity document",desc:"Valid national ID, passport or residence permit" },{ key:"consent",icon:"✍️",title:"Data consent",desc:"Ayyad consent form" }], upload: "Upload", uploaded: "✓ Uploaded", warning: "All documents are required for verification.", back: "← Back", submit: "Submit →", successTitle: "Case submitted!", successSub: "Your case is under review.", processSteps: ["Case received and numbered","Ayyad team review (< 48h)","Hospital contact for quote validation","Campaign goes live"], backHome: "Back to home" },
    login: { title: "Sign in to Ayyad", sub: "Welcome! Sign in to your account.", demoLabel: "Demo profile", roles: [{ id:"donor",label:"Donor",icon:"💚" },{ id:"beneficiary",label:"Patient",icon:"🏥" },{ id:"admin",label:"Admin",icon:"⚙️" }], email: "Email or phone", password: "Password", btn: "Sign in →", noAccount: "Don't have an account?", register: "Sign up" },
    register: { title: "Create an account", roleQ: "I want to...", roles: [{ id:"donor",icon:"💚",title:"Make donations",desc:"Help patients in need" },{ id:"beneficiary",icon:"🏥",title:"Receive care",desc:"Fund a medical procedure" }], fields: [{ key:"name",label:"Full name",p:"Aminata Koné",type:"text" },{ key:"email",label:"Email",p:"you@example.ci",type:"email" },{ key:"phone",label:"Wave / Orange Money number",p:"+225 07 XX XX XX XX",type:"tel" },{ key:"password",label:"Password",p:"••••••••",type:"password" }], terms: "I accept the", termsLink: "terms of service", and: "and the", privacyLink: "privacy policy", btn: "Create my account", continue: "Continue →", back: "← Back", hasAccount: "Already have an account?", signin: "Sign in" },
    admin: { title: "Ayyad Administration", sub: "Operational dashboard", status: "System operational", tabs: [{ id:"overview",label:"Overview",icon:"📊" },{ id:"cases",label:"Cases",icon:"📋" },{ id:"fraud",label:"Fraud",icon:"🔍" },{ id:"payouts",label:"Payouts",icon:"🏦" }], stats: [{ label:"Active cases",v:"23",icon:"📋" },{ label:"Donations this month",v:"12.4M FCFA",icon:"💚" },{ label:"Patients helped",v:"142",icon:"🏥" }], recentTitle: "Recent campaigns", revenueTitle: "Operational revenue (5%)", months: [{ month:"March 2025",dons:"24.8M",fees:"1,240,000 FCFA" },{ month:"Feb. 2025",dons:"19.2M",fees:"960,000 FCFA" },{ month:"Jan. 2025",dons:"15.1M",fees:"755,000 FCFA" }], pendingTitle: "Cases pending validation", pending: "pending", empty: "All cases have been processed", risk: "Risk", reject: "Reject", approve: "Approve ✓", fraudTitle: "Fraud alerts", fraudLabels: [{ label:"Critical",sev:"critical",c:"red" },{ label:"High",sev:"high",c:"amber" },{ label:"Resolved",sev:null,c:"emerald" }], resolve: "Resolve", resolved: "Resolved", payoutsTitle: "Hospital payouts", payoutsPending: "pending", validate: "Validate →", active2: "Active", funded: "Funded" },
    howPage: { title: "How does Ayyad work?", sub: "Transparent, secure, built for Africa", forDonors: { icon:"💚",title:"For donors",steps:["Browse verified active campaigns","Freely choose your amount","Pay via Wave, Orange Money or card","You are charged exactly the amount you chose","The money goes directly to the hospital"] }, forBenef: { icon:"🏥",title:"For beneficiaries",steps:["Create an account and submit your medical case","Upload medical report, quote, identity document","Our team verifies with the partner hospital","Your campaign goes live within 48h","Funds are transferred directly to the hospital"] }, feeTitle: "The 5% rule — Always silent", feeSub: "Ayyad charges a 5% operational fee on each donation to cover platform costs. This fee is completely invisible to you: you pay exactly what you chose.", youGive: "You give", collectReceives: "Campaign receives", ayyadFee: "Ayyad fee (5%)" },
    footer: { tagline: "Funding healthcare for all in Africa.", platform: "Platform", trust: "Trust", legal: "Legal", platformLinks: ["Active campaigns","How it works","Submit a case"], trustLinks: ["Case verification","Payment security","Impact report"], legalLinks: ["Legal notice","Privacy policy","BCEAO compliance"], rights: "© 2025 Ayyad CI — All rights reserved" },
    badges: { verified: "✓ Case verified", collecting: "Active", funded: "✓ Funded" },
    progress: { collected: "raised out of", donors: "donors", daysLeft: "days left", intervention: "✓ Procedure scheduled", progressTitle: "Campaign progress", of: "of goal" },
    back: "← Back to campaigns",
  }
};

// ════════════════════════════════════════════════════════════
// MOCK DATA
// ════════════════════════════════════════════════════════════
const CASES = [
  { id:1, title:{fr:"Opération cardiaque urgente pour Aminata",en:"Urgent heart surgery for Aminata"}, beneficiary:"Aminata Koné", age:34, city:"Abidjan", hospital:"CHU de Cocody", category:{fr:"Cardiologie",en:"Cardiology"}, required:1800000, collected:1260000, donors:87, daysLeft:12, image:"🫀", desc:{fr:"Aminata souffre d'une cardiopathie valvulaire sévère nécessitant un remplacement de valve urgent. Sans cette intervention, son pronostic vital est engagé dans les 3 prochains mois. Elle est mère de deux enfants.",en:"Aminata suffers from severe valvular heart disease requiring urgent valve replacement. Without this procedure, her life is at risk within 3 months. She is a mother of two children."}, status:"COLLECTING" },
  { id:2, title:{fr:"Dialyse rénale pour Kofi Asante",en:"Kidney dialysis for Kofi Asante"}, beneficiary:"Kofi Asante", age:52, city:"Bouaké", hospital:"Hôpital Régional de Bouaké", category:{fr:"Néphrologie",en:"Nephrology"}, required:950000, collected:712000, donors:45, daysLeft:21, image:"🫘", desc:{fr:"Kofi est en insuffisance rénale chronique terminale. Il a besoin de 3 séances de dialyse par semaine pendant 6 mois en attente de greffe. Agriculteur de 52 ans, pilier de sa famille.",en:"Kofi has end-stage chronic kidney failure. He needs 3 dialysis sessions per week for 6 months while awaiting a transplant. A 52-year-old farmer, he is the cornerstone of his family."}, status:"COLLECTING" },
  { id:3, title:{fr:"Chimiothérapie pour Fatou Diallo",en:"Chemotherapy for Fatou Diallo"}, beneficiary:"Fatou Diallo", age:28, city:"Abidjan", hospital:"Institut National d'Oncologie", category:{fr:"Oncologie",en:"Oncology"}, required:2400000, collected:480000, donors:31, daysLeft:45, image:"🎗️", desc:{fr:"Fatou, jeune maman de 2 enfants, a reçu un diagnostic de cancer du sein au stade II. Un protocole de chimiothérapie de 6 cycles est nécessaire pour maximiser ses chances de guérison.",en:"Fatou, a young mother of 2 children, was diagnosed with stage II breast cancer. A 6-cycle chemotherapy protocol is needed to maximize her chances of recovery."}, status:"COLLECTING" },
  { id:4, title:{fr:"Prothèse orthopédique pour Ibrahim",en:"Orthopedic prosthesis for Ibrahim"}, beneficiary:"Ibrahim Coulibaly", age:19, city:"Daloa", hospital:"CHR de Daloa", category:{fr:"Orthopédie",en:"Orthopedics"}, required:620000, collected:620000, donors:62, daysLeft:0, image:"🦾", desc:{fr:"Ibrahim a perdu sa jambe droite suite à un accident de la route. Grâce à votre générosité, l'objectif est atteint ! L'intervention est planifiée le mois prochain.",en:"Ibrahim lost his right leg in a road accident. Thanks to your generosity, the goal has been reached! The procedure is scheduled for next month."}, status:"FUNDED" },
  { id:5, title:{fr:"Traitement neurologique pour Mariam",en:"Neurological treatment for Mariam"}, beneficiary:"Mariam Ouédraogo", age:41, city:"Abidjan", hospital:"CHU de Yopougon", category:{fr:"Cardiologie",en:"Cardiology"}, required:1100000, collected:330000, donors:22, daysLeft:33, image:"🧠", desc:{fr:"Mariam souffre d'une sclérose en plaques progressivement invalidante. Un traitement de fond biologique est disponible mais son coût est inaccessible sans aide extérieure.",en:"Mariam suffers from progressively disabling multiple sclerosis. A biological baseline treatment is available but its cost is inaccessible without outside help."}, status:"COLLECTING" },
  { id:6, title:{fr:"Opération de la vue pour Kouassi",en:"Eye surgery for Kouassi"}, beneficiary:"Kouassi Yao", age:67, city:"San-Pédro", hospital:"Clinique Vision CI", category:{fr:"Oncologie",en:"Oncology"}, required:380000, collected:285000, donors:41, daysLeft:8, image:"👁️", desc:{fr:"Kouassi souffre de glaucome bilatéral avancé. Sans une opération urgente, il risque de perdre définitivement la vue. Il est retraité et seul.",en:"Kouassi suffers from advanced bilateral glaucoma. Without urgent surgery, he risks permanently losing his sight. He is retired and lives alone."}, status:"COLLECTING" },
];

const ADMIN_PENDING = [
  { id:10, title:{fr:"Greffe rénale - Moussa Traoré",en:"Kidney transplant - Moussa Traoré"}, submitted:{fr:"Il y a 2h",en:"2h ago"}, risk:22, hospital:"CHU Cocody", amount:3200000 },
  { id:11, title:{fr:"Opération des yeux - Awa Bamba",en:"Eye surgery - Awa Bamba"}, submitted:{fr:"Il y a 5h",en:"5h ago"}, risk:61, hospital:"Clinique Vision CI", amount:480000 },
  { id:12, title:{fr:"Traitement paludisme - Yéo Soro",en:"Malaria treatment - Yéo Soro"}, submitted:{fr:"Il y a 1j",en:"1 day ago"}, risk:15, hospital:"Hôpital Général", amount:95000 },
];

const FRAUD_ALERTS = [
  { id:1, type:{fr:"Devis dupliqué",en:"Duplicate quote"}, sev:"high", case:{fr:"Dossier #1042 & #1038",en:"Case #1042 & #1038"}, time:"14:32", resolved:false },
  { id:2, type:{fr:"Multi-comptes détecté",en:"Multi-account detected"}, sev:"critical", case:{fr:"User #552 (3 comptes)",en:"User #552 (3 accounts)"}, time:"11:15", resolved:false },
  { id:3, type:{fr:"Don suspect > 500k FCFA",en:"Suspicious donation > 500k FCFA"}, sev:"medium", case:{fr:"Donation #7821 — anonyme",en:"Donation #7821 — anonymous"}, time:"09:47", resolved:true },
];

const PAYOUTS = [
  { id:1, case:{fr:"Ibrahim Coulibaly — Prothèse orthopédique",en:"Ibrahim Coulibaly — Orthopedic prosthesis"}, hospital:"CHR de Daloa", amount:620000, status:"PENDING", date:{fr:"Aujourd'hui",en:"Today"} },
  { id:2, case:{fr:"Séni Bamba — Traitement dialyse",en:"Séni Bamba — Dialysis treatment"}, hospital:"CHU Treichville", amount:450000, status:"PROCESSING", date:{fr:"Hier",en:"Yesterday"} },
  { id:3, case:{fr:"Mariam O. — Opération appendice",en:"Mariam O. — Appendix surgery"}, hospital:"Clinique Sainte-Anne", amount:185000, status:"COMPLETED", date:{fr:"Il y a 3j",en:"3 days ago"} },
];

// ════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════
const fmt = (n) => new Intl.NumberFormat("fr-CI").format(n) + " FCFA";
const pct = (c, r) => Math.min(100, Math.round((c / r) * 100));

// ════════════════════════════════════════════════════════════
// UI ATOMS
// ════════════════════════════════════════════════════════════
const Badge = ({ children, color="green" }) => {
  const map = { green:"bg-emerald-100 text-emerald-700", yellow:"bg-amber-100 text-amber-700 border border-amber-200", red:"bg-red-100 text-red-700", blue:"bg-blue-100 text-blue-700", gray:"bg-gray-100 text-gray-600", purple:"bg-purple-100 text-purple-700" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[color]}`}>{children}</span>;
};

const ProgressBar = ({ percent }) => (
  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
    <div className="h-2.5 rounded-full transition-all duration-700" style={{ width:`${percent}%`, background: percent === 100 ? "linear-gradient(90deg,#059669,#10b981)" : "linear-gradient(90deg,#10b981,#34d399)" }} />
  </div>
);

const LangToggle = ({ lang, setLang }) => (
  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
    {["fr","en"].map(l => (
      <button key={l} onClick={() => setLang(l)} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang===l ? "bg-white shadow text-emerald-700" : "text-gray-500 hover:text-gray-700"}`}>
        {l === "fr" ? "🇫🇷 FR" : "🇬🇧 EN"}
      </button>
    ))}
  </div>
);

// ════════════════════════════════════════════════════════════
// NAVBAR
// ════════════════════════════════════════════════════════════
const Navbar = ({ page, setPage, user, setUser, lang, setLang }) => {
  const t = T[lang].nav;
  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16 gap-4">
        <button onClick={() => setPage("home")} className="flex items-center gap-2 flex-shrink-0">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black text-base shadow-md">A</div>
          <div className="hidden sm:block">
            <span className="font-black text-xl text-gray-900">Ayyad</span>
            <span className="text-xs text-gray-400 ml-1.5">{t.medicalFinancing}</span>
          </div>
        </button>

        <div className="hidden md:flex items-center gap-6">
          {[["home", t.collections], ["how", t.how]].map(([p, label]) => (
            <button key={p} onClick={() => setPage(p)} className={`text-sm font-medium transition-colors ${page === p ? "text-emerald-600" : "text-gray-600 hover:text-gray-900"}`}>{label}</button>
          ))}
          {user?.role === "admin" && (
            <button onClick={() => setPage("admin")} className={`text-sm font-medium transition-colors ${page === "admin" ? "text-emerald-600" : "text-gray-600 hover:text-gray-900"}`}>{t.admin}</button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <LangToggle lang={lang} setLang={setLang} />
          {user ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm">{user.name[0]}</div>
              <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[100px] truncate">{user.name}</span>
              <button onClick={() => { setUser(null); setPage("home"); }} className="text-xs text-gray-400 hover:text-red-500 ml-1">{t.logout}</button>
            </div>
          ) : (
            <>
              <button onClick={() => setPage("login")} className="text-sm font-medium text-gray-600 hover:text-gray-900">{t.login}</button>
              <button onClick={() => setPage("register")} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors">{t.start}</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

// ════════════════════════════════════════════════════════════
// HOME PAGE
// ════════════════════════════════════════════════════════════
const HomePage = ({ setPage, setSelectedCase, lang }) => {
  const [filter, setFilter] = useState("all");
  const t = T[lang];
  const tColl = t.collections;
  const tHow = t.how;

  const catMap = lang === "fr"
    ? ["Tous","Cardiologie","Oncologie","Néphrologie","Orthopédie"]
    : ["All","Cardiology","Oncology","Nephrology","Orthopedics"];

  const filtered = filter === "all" || filter === catMap[0]
    ? CASES
    : CASES.filter(c => c.category[lang].toLowerCase() === filter.toLowerCase());

  return (
    <div>
      {/* HERO */}
      <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
            <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
            {t.hero.badge}
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-5 leading-tight">
            {t.hero.title1}<br /><span className="text-emerald-200">{t.hero.title2}</span>
          </h1>
          <p className="text-emerald-100 text-lg max-w-xl mx-auto mb-8">{t.hero.sub}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => document.getElementById("collectes")?.scrollIntoView({ behavior:"smooth" })}
              className="bg-white text-emerald-700 font-bold px-8 py-3.5 rounded-xl hover:bg-emerald-50 transition-colors shadow-lg">
              {t.hero.cta1} →
            </button>
            <button onClick={() => setPage("submit")}
              className="bg-emerald-500/40 hover:bg-emerald-500/60 border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors">
              {t.hero.cta2}
            </button>
          </div>
        </div>
        {/* Stats bar */}
        <div className="bg-white/10 border-t border-white/20">
          <div className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-3 text-center gap-4">
            {[["142", t.stats.patients], ["89M", t.stats.collected], ["18", t.stats.hospitals]].map(([v, l]) => (
              <div key={l}><div className="text-2xl font-black">{v}</div><div className="text-emerald-200 text-xs mt-0.5">{l}</div></div>
            ))}
          </div>
        </div>
      </div>

      {/* CAMPAIGNS */}
      <div id="collectes" className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-black text-gray-900">{tColl.title}</h2>
            <p className="text-gray-500 text-sm mt-1">{CASES.filter(c => c.status==="COLLECTING").length} {tColl.sub}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {catMap.map((c, i) => (
              <button key={c} onClick={() => setFilter(i === 0 ? "all" : c)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${(filter === "all" && i === 0) || filter === c ? "bg-emerald-600 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(c => (
            <CaseCard key={c.id} c={c} lang={lang} t={t} onClick={() => { setSelectedCase(c); setPage("case"); }} />
          ))}
        </div>
      </div>

      {/* HOW IT WORKS TEASER */}
      <div className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-black text-gray-900 mb-2">{tHow.title}</h2>
          <p className="text-gray-500 mb-10">{tHow.sub}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {tHow.steps.map(s => (
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
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// CASE CARD
// ════════════════════════════════════════════════════════════
const CaseCard = ({ c, lang, t, onClick }) => {
  const percent = pct(c.collected, c.required);
  const funded = c.status === "FUNDED";
  const tc = t.card;
  return (
    <div onClick={onClick} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden group">
      <div className="h-32 flex items-center justify-center text-6xl bg-gradient-to-br from-emerald-50 to-teal-50 group-hover:from-emerald-100 transition-colors">
        {c.image}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-gray-900 text-sm leading-snug group-hover:text-emerald-700 transition-colors">{c.title[lang]}</h3>
          <Badge color={funded ? "green" : "blue"}>{funded ? t.badges.funded : c.category[lang]}</Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-4">
          🏥 <span className="truncate">{c.hospital}</span> · 📍 <span>{c.city}</span>
        </div>
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
          {funded ? <span className="text-emerald-600 font-bold">{tc.funded}</span> : <span className="text-amber-600 font-medium">⏳ {c.daysLeft} {tc.daysLeft}</span>}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// CASE DETAIL + DONATION WIDGET
// ════════════════════════════════════════════════════════════
const CasePage = ({ c, setPage, lang }) => {
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState("WAVE");
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState("donate");
  const percent = pct(c.collected, c.required);
  const funded = c.status === "FUNDED";
  const t = T[lang];
  const td = t.donate;
  const presets = [1000, 5000, 10000, 25000, 50000];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button onClick={() => setPage("home")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">{t.back}</button>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT */}
        <div className="lg:col-span-2 space-y-5">
          {/* Case header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-52 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 flex items-center justify-center text-9xl">{c.image}</div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge color="blue">{c.category[lang]}</Badge>
                <Badge color="green">{t.badges.verified}</Badge>
                {funded && <Badge color="green">{t.badges.funded}</Badge>}
              </div>
              <h1 className="text-2xl font-black text-gray-900 mb-3">{c.title[lang]}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
                <span>🏥 {c.hospital}</span><span>📍 {c.city}</span><span>👤 {c.age} {lang==="fr"?"ans":"years"}</span>
              </div>
              <p className="text-gray-600 leading-relaxed">{c.desc[lang]}</p>
            </div>
          </div>
          {/* Progress */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">{t.progress.progressTitle}</h3>
            <div className="flex justify-between items-end mb-3">
              <div>
                <div className="text-3xl font-black text-emerald-700">{fmt(c.collected)}</div>
                <div className="text-sm text-gray-500">{t.progress.collected} {fmt(c.required)}</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-gray-900">{percent}%</div>
                <div className="text-sm text-gray-500">{t.progress.of}</div>
              </div>
            </div>
            <ProgressBar percent={percent} />
            <div className="flex justify-between mt-3 text-sm text-gray-500">
              <span>👥 {c.donors} {t.progress.donors}</span>
              {funded ? <span className="text-emerald-600 font-semibold">{t.progress.intervention}</span> : <span className="text-amber-600 font-medium">⏳ {c.daysLeft} {t.progress.daysLeft}</span>}
            </div>
          </div>
          {/* Trust box */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3">
            <span className="text-2xl flex-shrink-0">🔒</span>
            <div>
              <div className="font-bold text-emerald-800 text-sm">{t.guarantee.title}</div>
              <div className="text-emerald-700 text-xs mt-1">{t.guarantee.desc}</div>
            </div>
          </div>
        </div>

        {/* DONATION WIDGET */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-6 sticky top-24">
            {step === "donate" && (
              <>
                <h3 className="font-black text-gray-900 text-lg mb-1">{td.title}</h3>
                <p className="text-xs text-gray-500 mb-5">{td.sub}</p>
                {/* Presets */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {presets.map(p => (
                    <button key={p} onClick={() => setAmount(String(p))}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${Number(amount)===p ? "bg-emerald-600 text-white border-emerald-600 shadow-md" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-400"}`}>
                      {new Intl.NumberFormat("fr").format(p)}
                    </button>
                  ))}
                  <button onClick={() => setAmount("")}
                    className={`py-2 rounded-xl text-xs font-bold border ${!presets.includes(Number(amount))&&amount ? "bg-emerald-600 text-white border-emerald-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                    {td.custom}
                  </button>
                </div>
                {/* Amount input */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{td.amount}</label>
                  <div className="relative">
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="15 000"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 pr-16" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">FCFA</span>
                  </div>
                  {amount && Number(amount)>=500 && (
                    <div className="text-xs text-center text-gray-400 mt-1.5">
                      {lang==="fr"?"Débité : ":"Charged: "}<span className="font-bold text-gray-700">{fmt(Number(amount))}</span>
                    </div>
                  )}
                </div>
                {/* Provider */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-600 mb-2 block">{td.payment}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{id:"WAVE",label:"Wave",emoji:"🌊"},{id:"ORANGE_MONEY",label:"Orange",emoji:"🟠"},{id:"STRIPE",label:lang==="fr"?"Carte":"Card",emoji:"💳"}].map(pv => (
                      <button key={pv.id} onClick={() => setProvider(pv.id)}
                        className={`flex flex-col items-center p-2.5 rounded-xl border text-xs font-bold transition-all ${provider===pv.id ? "ring-2 ring-emerald-500 bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200 opacity-60 hover:opacity-100"}`}>
                        <span className="text-lg mb-0.5">{pv.emoji}</span>{pv.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Options */}
                <div className="mb-5 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                    <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="w-4 h-4 accent-emerald-600 rounded" />
                    {td.anonymous}
                  </label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={td.message} rows={2}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <button onClick={() => setStep("confirm")} disabled={!amount||isNaN(amount)||Number(amount)<500||funded}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md text-sm">
                  {funded ? td.btnFunded : `${td.btn} ${amount ? fmt(Number(amount)) : "→"}`}
                </button>
                {!funded && <p className="text-center text-xs text-gray-400 mt-3">{td.secure}</p>}
              </>
            )}
            {step === "confirm" && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="text-4xl mb-2">💚</div>
                  <h3 className="font-black text-lg text-gray-900">{td.confirm}</h3>
                  <p className="text-sm text-gray-500">{td.verifyDon}</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3 text-sm">
                  {[
                    [td.debited, fmt(Number(amount))],
                    [td.beneficiary, c.beneficiary],
                    [td.via, provider==="WAVE"?"🌊 Wave":provider==="ORANGE_MONEY"?"🟠 Orange Money":"💳 "+(lang==="fr"?"Carte":"Card")],
                    ...(anonymous ? [[td.anonymity, td.active]] : []),
                  ].map(([k, v], i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-gray-500">{k}</span>
                      <span className={`font-semibold ${k===td.anonymity?"text-emerald-600":""}`}>{v}</span>
                    </div>
                  ))}
                </div>
                {message && <div className="bg-emerald-50 rounded-xl p-3 text-sm text-emerald-700 italic border border-emerald-100">"{message}"</div>}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setStep("donate")} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50">{td.modify}</button>
                  <button onClick={() => setStep("success")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow-md">{td.confirmBtn}</button>
                </div>
              </div>
            )}
            {step === "success" && (
              <div className="text-center space-y-4 py-2">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">🎉</div>
                <h3 className="font-black text-xl text-gray-900">{td.thanks}</h3>
                <p className="text-sm text-gray-600">{td.thanksSub}</p>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 text-sm text-emerald-800 border border-emerald-100">
                  <p className="font-semibold mb-1">{td.impact}</p>
                  <p>{td.impactSub} {c.beneficiary} {td.impactEnd}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                  {lang==="fr" ? "Un reçu vous a été envoyé par email." : "A receipt has been sent to your email."}
                </div>
                <button onClick={() => setStep("donate")} className="w-full border border-emerald-200 text-emerald-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-50 transition-colors">
                  {td.again}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// LOGIN PAGE
// ════════════════════════════════════════════════════════════
const LoginPage = ({ setPage, setUser, lang }) => {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [role, setRole] = useState("donor");
  const t = T[lang].login;
  const handleLogin = () => {
    if (!email || !pwd) return;
    const names = { donor: lang==="fr"?"Jean Dupont":"John Doe", beneficiary:"Aminata K.", admin:"Admin Ayyad" };
    setUser({ name: names[role], email, role });
    setPage(role === "admin" ? "admin" : "home");
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl mx-auto mb-4 shadow-lg">A</div>
          <h1 className="text-2xl font-black text-gray-900">{t.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{t.sub}</p>
        </div>
        <div className="mb-6">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">{t.demoLabel}</label>
          <div className="grid grid-cols-3 gap-2">
            {t.roles.map(r => (
              <button key={r.id} onClick={() => setRole(r.id)}
                className={`py-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${role===r.id ? "bg-emerald-600 text-white border-emerald-600 shadow-md" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
                <span className="text-xl">{r.icon}</span>{r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.email}</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="vous@exemple.ci"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.password}</label>
            <input value={pwd} onChange={e=>setPwd(e.target.value)} type="password" placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent" />
          </div>
        </div>
        <button onClick={handleLogin} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-md text-sm transition-colors">{t.btn}</button>
        <div className="text-center mt-5">
          <span className="text-sm text-gray-500">{t.noAccount} </span>
          <button onClick={() => setPage("register")} className="text-sm text-emerald-600 font-bold hover:underline">{t.register}</button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// REGISTER PAGE
// ════════════════════════════════════════════════════════════
const RegisterPage = ({ setPage, setUser, lang }) => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("");
  const [form, setForm] = useState({ name:"", email:"", phone:"", password:"" });
  const t = T[lang].register;
  const handleSubmit = () => { setUser({ name: form.name || (lang==="fr"?"Nouveau membre":"New member"), email: form.email, role }); setPage("home"); };
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl mx-auto mb-4 shadow-lg">A</div>
          <h1 className="text-2xl font-black text-gray-900">{t.title}</h1>
          <div className="flex justify-center gap-2 mt-3">
            {[1,2].map(s => <div key={s} className={`w-10 h-1.5 rounded-full transition-colors ${step>=s?"bg-emerald-500":"bg-gray-200"}`}/>)}
          </div>
        </div>
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 text-center font-medium">{t.roleQ}</p>
            <div className="grid grid-cols-2 gap-3">
              {t.roles.map(r => (
                <button key={r.id} onClick={() => setRole(r.id)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${role===r.id ? "border-emerald-500 bg-emerald-50 shadow-md" : "border-gray-200 hover:border-emerald-300"}`}>
                  <div className="text-3xl mb-2">{r.icon}</div>
                  <div className="font-bold text-sm text-gray-900">{r.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
                </button>
              ))}
            </div>
            <button onClick={() => role && setStep(2)} disabled={!role} className="w-full bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm transition-colors shadow-md">
              {t.continue}
            </button>
            <div className="text-center"><span className="text-sm text-gray-500">{t.hasAccount} </span><button onClick={() => setPage("login")} className="text-sm text-emerald-600 font-bold hover:underline">{t.signin}</button></div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            {t.fields.map(f => (
              <div key={f.key}>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{f.label}</label>
                <input value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} type={f.type} placeholder={f.p}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            ))}
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <input type="checkbox" className="mt-0.5 accent-emerald-600" />
              <span>{t.terms} <a href="#" className="text-emerald-600 underline font-medium">{t.termsLink}</a> {t.and} <a href="#" className="text-emerald-600 underline font-medium">{t.privacyLink}</a>.</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setStep(1)} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50">{t.back}</button>
              <button onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow-md">{t.btn}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// SUBMIT PAGE
// ════════════════════════════════════════════════════════════
const SubmitPage = ({ setPage, lang }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ title:"", description:"", hospital:"", city:"", amount:"", category:"" });
  const [uploaded, setUploaded] = useState({ medical:false, quote:false, id:false, consent:false });
  const t = T[lang].submit;
  const allUploaded = Object.values(uploaded).every(Boolean);
  const valid1 = form.title && form.description && form.hospital && form.amount;
  const handleSubmit = async () => {
  try {
    // Upload image si elle existe
    let photoUrl = null;

    if (form.photo) {
      const fileName = `${Date.now()}-${form.photo.name}`;

      const { error: uploadError } = await supabase.storage
        .from("medical-documents")
        .upload(fileName, form.photo);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("medical-documents")
        .getPublicUrl(fileName);

      photoUrl = data.publicUrl;
    }

    // Insert dans la table cases
    const { error: insertError } = await supabase
      .from("cases")
      .insert([
        {
          full_name: form.title,        // on mappe title -> full_name
          hospital: form.hospital,
          amount: form.amount,
          description: form.description,
          photo_url: photoUrl,
        },
      ]);

    if (insertError) throw insertError;

    alert("Dossier soumis avec succès 🎉");
    setPage("home");

  } catch (error) {
    console.error(error);
    alert("Erreur lors de la soumission");
  }
};

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => setPage("home")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6">{t.back}</button>
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8">
        {t.steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1 flex-1 last:flex-none">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${step>i+1?"bg-emerald-500 text-white":step===i+1?"bg-emerald-600 text-white":"bg-gray-200 text-gray-500"}`}>
              {step>i+1?"✓":i+1}
            </div>
            <span className={`text-xs font-medium flex-1 truncate ${step===i+1?"text-emerald-700":"text-gray-400"}`}>{s}</span>
            {i<2 && <div className={`h-0.5 flex-1 ${step>i+1?"bg-emerald-500":"bg-gray-200"}`}/>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {step===1 && (
          <div className="space-y-5">
            <h2 className="font-black text-xl text-gray-900">{t.infoTitle}</h2>
            {[[t.titleField,"title","text",""],[t.descField,"description","textarea",""]].map(([label,key,type]) => (
              <div key={key}>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
                {type==="textarea" ? (
                  <textarea value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} rows={4}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
                ) : (
                  <input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} type="text"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                )}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4">
              {[[t.hospitalField,"hospital"],[t.cityField,"city"]].map(([label,key]) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
                  <input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} type="text"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.amountField}</label>
                <input value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} type="number"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t.categoryField}</label>
                <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">—</option>
                  {t.cats.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => setStep(2)} disabled={!valid1}
              className="w-full bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">
              {t.next}
            </button>
          </div>
        )}
        {step===2 && (
          <div className="space-y-4">
            <h2 className="font-black text-xl text-gray-900">{t.docsTitle}</h2>
            <p className="text-sm text-gray-500">{t.docsSub}</p>
            <div className="space-y-3">
              {t.docs.map(doc => (
                <div key={doc.key} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${uploaded[doc.key]?"border-emerald-300 bg-emerald-50":"border-gray-200 hover:border-gray-300"}`}>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${uploaded[doc.key]?"bg-emerald-100":"bg-gray-100"}`}>{doc.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900">{doc.title} <span className="text-red-400">*</span></div>
                    <div className="text-xs text-gray-500">{doc.desc}</div>
                  </div>
                  <>
  <input
    type="file"
    accept=".pdf,image/*"
    className="hidden"
    id={`file-${doc.key}`}
    onChange={async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const fileName = `${Date.now()}-${file.name}`;

        const { error } = await supabase.storage
          .from("medical-documents")
          .upload(fileName, file);

        if (error) throw error;

        setUploaded(u => ({ ...u, [doc.key]: true }));
      } catch (err) {
        alert("Erreur upload");
        console.error(err);
      }
    }}
  />

  <label
    htmlFor={`file-${doc.key}`}
    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
      uploaded[doc.key]
        ? "bg-emerald-600 text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`}
  >
    {uploaded[doc.key] ? t.uploaded : t.upload}
  </label>
</>
                </div>
              ))}
            </div>
            {!allUploaded && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-xs text-amber-700">
                <span>⚠️</span><span>{t.warning}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setStep(1)} className="border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50">{t.back}</button>
              <button onClick={handleSubmit} disabled={!allUploaded}
                className="bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-xl text-sm shadow-md">
                {t.submit}
              </button>
            </div>
          </div>
        )}
        {step===3 && (
          <div className="text-center space-y-5 py-4">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-4xl">🎉</div>
            <div>
              <h2 className="font-black text-2xl text-gray-900 mb-2">{t.successTitle}</h2>
              <p className="text-gray-500 text-sm">{t.successSub}</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-5 text-left space-y-3">
              {t.processSteps.map((s,i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i===0?"bg-emerald-500 text-white":"bg-gray-200 text-gray-500"}`}>
                    {i===0?"✓":i+1}
                  </div>
                  <span className={i===0?"text-emerald-700 font-medium":"text-gray-500"}>{s}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setPage("home")} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition-colors">
              {t.backHome}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// HOW IT WORKS PAGE
// ════════════════════════════════════════════════════════════
const HowPage = ({ lang }) => {
  const t = T[lang].howPage;
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-black text-gray-900 mb-3">{t.title}</h1>
        <p className="text-gray-500">{t.sub}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {[t.forDonors, t.forBenef].map((s,i) => (
          <div key={i} className={`bg-white border-2 rounded-2xl p-6 shadow-sm ${i===0?"border-emerald-200":"border-blue-200"}`}>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl mb-5 border ${i===0?"bg-emerald-50 border-emerald-200":"bg-blue-50 border-blue-200"}`}>
              <span className="text-xl">{s.icon}</span>
              <span className="font-bold text-gray-900">{s.title}</span>
            </div>
            <ol className="space-y-3">
              {s.steps.map((step, j) => (
                <li key={j} className="flex items-start gap-3 text-sm text-gray-700">
                  <div className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{j+1}</div>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <div className="bg-gray-900 rounded-3xl p-10 text-white text-center">
        <h2 className="text-2xl font-black mb-3">{t.feeTitle}</h2>
        <p className="text-gray-300 mb-8 max-w-lg mx-auto leading-relaxed">{t.feeSub}</p>
        <div className="bg-white/10 rounded-2xl p-6 text-sm font-mono max-w-xs mx-auto border border-white/20">
          <div className="text-gray-400 mb-1 text-xs uppercase tracking-wider">{t.youGive}</div>
          <div className="text-3xl font-black my-2">10 000 FCFA</div>
          <div className="border-t border-white/20 my-4"/>
          <div className="flex justify-between items-center mb-2">
            <span className="text-emerald-400 text-sm">{t.collectReceives}</span>
            <span className="font-black text-lg">9 500 FCFA</span>
          </div>
          <div className="flex justify-between items-center text-gray-400 text-xs">
            <span>{t.ayyadFee}</span><span>500 FCFA</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ════════════════════════════════════════════════════════════
const AdminPage = ({ lang }) => {
  const [tab, setTab] = useState("overview");
  const [alerts, setAlerts] = useState(FRAUD_ALERTS);
  const [pending, setPending] = useState(ADMIN_PENDING);
  const [payouts, setPayouts] = useState(PAYOUTS);
  const t = T[lang].admin;
  const unresolved = alerts.filter(a => !a.resolved).length;

  const payoutStatusLabel = (s) => {
    if (lang==="fr") return s==="COMPLETED"?"✓ Exécuté":s==="PROCESSING"?"En cours":"En attente";
    return s==="COMPLETED"?"✓ Executed":s==="PROCESSING"?"Processing":"Pending";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-900">{t.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t.sub}</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/>
            <span className="text-xs font-semibold text-emerald-700">{t.status}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 mb-6 overflow-x-auto shadow-sm">
          {t.tabs.map(tab_ => (
            <button key={tab_.id} onClick={() => setTab(tab_.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${tab===tab_.id?"bg-emerald-600 text-white shadow-sm":"text-gray-600 hover:bg-gray-100"}`}>
              {tab_.icon} {tab_.label}
              {tab_.id==="fraud" && unresolved > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unresolved}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...t.stats, {label:lang==="fr"?"Alertes fraude actives":"Active fraud alerts",v:unresolved,icon:"🔍"}].map(s => (
                <div key={s.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                  <div className="text-3xl mb-2">{s.icon}</div>
                  <div className="text-2xl font-black text-gray-900">{s.v}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="font-bold text-gray-900 mb-4">{t.recentTitle}</h3>
                <div className="space-y-3">
                  {CASES.slice(0,4).map(c => (
                    <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <span className="text-2xl">{c.image}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{c.title[lang]}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="text-xs text-gray-400">{fmt(c.required)}</div>
                          <div className="flex-1 max-w-[80px]"><ProgressBar percent={pct(c.collected,c.required)}/></div>
                          <div className="text-xs text-emerald-600 font-bold">{pct(c.collected,c.required)}%</div>
                        </div>
                      </div>
                      <Badge color={c.status==="COLLECTING"?"blue":"green"}>
                        {c.status==="COLLECTING"?t.active2:t.funded}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              {/* Revenue */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="font-bold text-gray-900 mb-4">{t.revenueTitle}</h3>
                <div className="space-y-3">
                  {t.months.map(r => (
                    <div key={r.month} className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-sm text-gray-700">{r.month}</span>
                        <Badge color="green">{r.fees}</Badge>
                      </div>
                      <div className="text-xs text-gray-400">{lang==="fr"?"Dons totaux ":"Total donations "}{r.dons} FCFA</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <div className="text-xs text-emerald-600 font-medium mb-1">{lang==="fr"?"Revenu total 2025":"Total revenue 2025"}</div>
                  <div className="text-2xl font-black text-emerald-700">2 955 000 FCFA</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CASES ── */}
        {tab === "cases" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{t.pendingTitle}</h3>
              <Badge color="yellow">{pending.length} {t.pending}</Badge>
            </div>
            {pending.length === 0 ? (
              <div className="p-14 text-center">
                <div className="text-5xl mb-3">✅</div>
                <div className="font-bold text-gray-700">{t.empty}</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {pending.map(c => (
                  <div key={c.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 mb-1">{c.title[lang]}</div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        <span>🏥 {c.hospital}</span>
                        <span>💰 {fmt(c.amount)}</span>
                        <span>📅 {c.submitted[lang]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">{t.risk}:</span>
                        <Badge color={c.risk<30?"green":c.risk<60?"yellow":"red"}>{c.risk}/100</Badge>
                      </div>
                      <button onClick={() => setPending(p => p.filter(x=>x.id!==c.id))}
                        className="px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50">
                        {t.reject}
                      </button>
                      <button onClick={() => setPending(p => p.filter(x=>x.id!==c.id))}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm">
                        {t.approve}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FRAUD ── */}
        {tab === "fraud" && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              {t.fraudLabels.map(fl => {
                const count = fl.sev
                  ? alerts.filter(a=>!a.resolved&&a.sev===fl.sev).length
                  : alerts.filter(a=>a.resolved).length;
                return (
                  <div key={fl.label} className={`bg-${fl.c}-50 border border-${fl.c}-200 rounded-2xl p-5 text-center`}>
                    <div className={`text-3xl font-black text-${fl.c}-700`}>{count}</div>
                    <div className={`text-xs text-${fl.c}-600 font-semibold mt-1`}>{fl.label}</div>
                  </div>
                );
              })}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">{t.fraudTitle}</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {alerts.map(a => (
                  <div key={a.id} className={`p-5 flex items-center gap-4 transition-opacity ${a.resolved?"opacity-40":""}`}>
                    <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${a.sev==="critical"?"bg-red-500":a.sev==="high"?"bg-amber-500":"bg-yellow-400"}`}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900">{a.type[lang]}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{a.case[lang]} · {a.time}</div>
                    </div>
                    <Badge color={a.sev==="critical"?"red":a.sev==="high"?"yellow":"gray"}>{a.sev}</Badge>
                    {!a.resolved ? (
                      <button onClick={() => setAlerts(al => al.map(x=>x.id===a.id?{...x,resolved:true}:x))}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex-shrink-0">
                        {t.resolve}
                      </button>
                    ) : <Badge color="green">{t.resolved}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PAYOUTS ── */}
        {tab === "payouts" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 mb-2">
              {[
                {label:lang==="fr"?"Total versé (2025)":"Total paid out (2025)",v:"3.8M FCFA",icon:"🏦",c:"emerald"},
                {label:lang==="fr"?"En attente":"Pending",v:"1",icon:"⏳",c:"amber"},
                {label:lang==="fr"?"Exécutés ce mois":"Executed this month",v:"8",icon:"✅",c:"blue"},
              ].map(s => (
                <div key={s.label} className={`bg-${s.c}-50 border border-${s.c}-200 rounded-2xl p-4 text-center`}>
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className={`text-xl font-black text-${s.c}-700`}>{s.v}</div>
                  <div className={`text-xs text-${s.c}-600 font-medium mt-0.5`}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{t.payoutsTitle}</h3>
                <Badge color="yellow">{payouts.filter(p=>p.status==="PENDING").length} {t.payoutsPending}</Badge>
              </div>
              <div className="divide-y divide-gray-50">
                {payouts.map(p => (
                  <div key={p.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 truncate">{p.case[lang]}</div>
                      <div className="text-xs text-gray-500 mt-0.5">🏥 {p.hospital} · 📅 {p.date[lang]}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">{fmt(p.amount)}</span>
                      <Badge color={p.status==="COMPLETED"?"green":p.status==="PROCESSING"?"blue":"yellow"}>
                        {payoutStatusLabel(p.status)}
                      </Badge>
                      {p.status==="PENDING" && (
                        <button onClick={() => setPayouts(pv => pv.map(x=>x.id===p.id?{...x,status:"PROCESSING"}:x))}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors">
                          {t.validate}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// FOOTER
// ════════════════════════════════════════════════════════════
const Footer = ({ setPage, lang }) => {
  const t = T[lang].footer;
  return (
    <footer className="bg-gray-950 text-white mt-16">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-black">A</div>
              <span className="font-black text-xl">Ayyad</span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed mb-4">{t.tagline}</p>
            <div className="flex gap-2">
              {["🌍","📱","💬"].map((e,i)=>(
                <div key={i} className="w-8 h-8 bg-white/10 hover:bg-emerald-600 rounded-lg flex items-center justify-center text-sm cursor-pointer transition-colors">{e}</div>
              ))}
            </div>
          </div>
          {[[t.platform, t.platformLinks, "home"],[t.trust, t.trustLinks, "how"],[t.legal, t.legalLinks, "home"]].map(([title, links, page_]) => (
            <div key={title}>
              <div className="font-bold text-sm mb-4 text-gray-300">{title}</div>
              <ul className="space-y-2.5">
                {links.map(l => <li key={l}><a onClick={() => setPage(page_)} href="#" className="text-gray-500 text-xs hover:text-emerald-400 transition-colors">{l}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-gray-500 text-xs">{t.rights}</p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1">🔒 SSL</span>
            <span>·</span>
            <span className="flex items-center gap-1">🏦 BCEAO</span>
            <span>·</span>
            <span className="flex items-center gap-1">🛡️ ADPCI</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

// ════════════════════════════════════════════════════════════
// APP ROOT
// ════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("home");
  const [lang, setLang] = useState("fr");
  const [user, setUser] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);

  const showFooter = !["login","register"].includes(page);

  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar page={page} setPage={setPage} user={user} setUser={setUser} lang={lang} setLang={setLang} />
      <main>
        {page==="home"     && <HomePage setPage={setPage} setSelectedCase={setSelectedCase} lang={lang} />}
        {page==="case"     && selectedCase && <CasePage c={selectedCase} setPage={setPage} lang={lang} />}
        {page==="how"      && <HowPage lang={lang} />}
        {page==="login"    && <LoginPage setPage={setPage} setUser={setUser} lang={lang} />}
        {page==="register" && <RegisterPage setPage={setPage} setUser={setUser} lang={lang} />}
        {page==="submit"   && <SubmitPage setPage={setPage} lang={lang} />}
        {page==="admin"    && <AdminPage lang={lang} />}
      </main>
      {showFooter && <Footer setPage={setPage} lang={lang} />}
    </div>
  );
}