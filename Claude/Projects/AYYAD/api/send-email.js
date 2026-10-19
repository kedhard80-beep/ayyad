// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — /api/send-email
// Gère tous les emails transactionnels AYYAD CI via Resend
// Types: donConfirm | newCase | caseApproved | caseRejected | welcomePatient | caseFunded | manual
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = "AYYAD CI <contact@ayyadci.com>";
const REPLY_TO       = "contact@ayyadci.com";
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || "kedhard80@gmail.com";
const SITE_URL       = "https://www.ayyadci.com";

const ALLOWED_ORIGINS = new Set([
  "https://ayyadci.com",
  "https://www.ayyadci.com",
]);

// ── Helpers ────────────────────────────────────────────────────────────────

const esc = (v) => {
  if (!v) return "";
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};

const isEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

const fmtAmount = (a) => {
  if (!a && a !== 0) return "";
  const n = Number(a);
  if (isNaN(n)) return esc(String(a).slice(0, 50));
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, n)) + " FCFA";
};

const normTitle = (t) => {
  if (!t) return "Dossier médical";
  if (typeof t === "object") return esc(String(t.fr || t.en || Object.values(t)[0] || "Dossier médical").slice(0, 200));
  return esc(String(t).slice(0, 200));
};

// ── Header / Footer HTML réutilisables ─────────────────────────────────────

const header = `
  <div style="background:#0d5c2e;padding:24px 32px;text-align:center;border-radius:14px 14px 0 0">
    <h1 style="color:#C9A84C;margin:0;font-size:28px;letter-spacing:2px;font-family:Georgia,serif">AYYAD</h1>
    <p style="color:#a7f3d0;margin:4px 0 0;font-size:13px;letter-spacing:0.5px">Financement médical participatif · Côte d'Ivoire</p>
  </div>`;

const footer = `
  <div style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:20px;text-align:center">
    <p style="color:#9ca3af;font-size:12px;margin:0">
      &copy; ${new Date().getFullYear()} AYYAD CI &nbsp;·&nbsp;
      <a href="${SITE_URL}" style="color:#9ca3af;text-decoration:none">www.ayyadci.com</a>
      &nbsp;·&nbsp;
      <a href="mailto:${REPLY_TO}" style="color:#9ca3af;text-decoration:none">${REPLY_TO}</a>
    </p>
  </div>`;

const wrap = (body) => `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
    ${header}
    <div style="padding:28px 32px">
      ${body}
      ${footer}
    </div>
  </div>`;

const btnGreen = (label, url) =>
  `<a href="${esc(url)}" style="display:inline-block;background:#0d5c2e;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;margin-top:16px">${label} →</a>`;

// ── Templates ──────────────────────────────────────────────────────────────

const templates = {

  // 1. Confirmation de don (envoyé au donateur)
  donConfirm: (d) => ({
    subject: `✅ Merci pour votre don — AYYAD CI`,
    html: wrap(`
      <h2 style="color:#0d5c2e;margin-top:0">Merci pour votre générosité 💚</h2>
      <p style="color:#374151;font-size:15px">
        Votre don de <strong>${fmtAmount(d.amount)}</strong> en faveur de
        <strong>${normTitle(d.caseTitle || d.caseName)}</strong> a bien été reçu.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin:20px 0">
        <p style="margin:0 0 6px;color:#065f46;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Récapitulatif</p>
        ${d.donorName ? `<p style="margin:4px 0;color:#374151">👤 ${esc(String(d.donorName).slice(0,80))}</p>` : ""}
        <p style="margin:4px 0;color:#374151">💰 Montant : <strong>${fmtAmount(d.amount)}</strong></p>
        ${d.caseId ? `<p style="margin:4px 0;color:#374151">📋 Dossier : <strong>${esc(String(d.caseId).slice(0,40))}</strong></p>` : ""}
        ${d.paymentMethod ? `<p style="margin:4px 0;color:#374151">💳 Méthode : ${esc(String(d.paymentMethod).slice(0,40))}</p>` : ""}
      </div>
      <p style="color:#6b7280;font-size:14px">
        Les fonds seront versés directement à l'établissement de santé partenaire.
        Aucune déduction sur votre don — la commission AYYAD est incluse dans l'objectif de collecte.
      </p>
      ${btnGreen("Suivre la collecte", d.caseId ? `${SITE_URL}/case/${d.caseId}` : SITE_URL)}
      <p style="color:#9ca3af;font-size:13px;margin-top:20px">
        Une question ? Répondez à cet email ou écrivez-nous à
        <a href="mailto:${REPLY_TO}" style="color:#0d5c2e">${REPLY_TO}</a>
      </p>`),
  }),

  // 2. Nouveau dossier soumis (envoyé à l'admin)
  newCase: (d) => ({
    subject: `🆕 Nouveau dossier soumis — ${normTitle(d.caseTitle || d.caseName)}`,
    html: wrap(`
      <h2 style="color:#b45309;margin-top:0">Nouveau dossier en attente de validation</h2>
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:18px;margin:16px 0">
        <p style="margin:0 0 6px;color:#92400e;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Détails du dossier</p>
        <p style="margin:4px 0;color:#374151">📋 Titre : <strong>${normTitle(d.caseTitle || d.caseName)}</strong></p>
        ${d.beneficiaryName ? `<p style="margin:4px 0;color:#374151">👤 Bénéficiaire : ${esc(String(d.beneficiaryName).slice(0,80))}</p>` : ""}
        ${d.amount ? `<p style="margin:4px 0;color:#374151">💰 Objectif : ${fmtAmount(d.amount)}</p>` : ""}
        ${d.hospital ? `<p style="margin:4px 0;color:#374151">🏥 Établissement : ${esc(String(d.hospital).slice(0,100))}</p>` : ""}
        ${d.caseId ? `<p style="margin:4px 0;color:#374151">🆔 ID : ${esc(String(d.caseId).slice(0,40))}</p>` : ""}
      </div>
      ${btnGreen("Valider dans le tableau de bord", `${SITE_URL}/?admin=true`)}
      <p style="color:#9ca3af;font-size:13px;margin-top:16px">Connectez-vous en tant qu'administrateur pour approuver ou rejeter ce dossier.</p>`),
  }),

  // 3. Dossier approuvé (envoyé au bénéficiaire)
  caseApproved: (d) => ({
    subject: `🎉 Votre dossier a été approuvé — AYYAD CI`,
    html: wrap(`
      <h2 style="color:#0d5c2e;margin-top:0">Votre dossier est approuvé ! 🎉</h2>
      <p style="color:#374151;font-size:15px">
        Bonne nouvelle ! Votre dossier <strong>${normTitle(d.caseTitle || d.caseName)}</strong>
        a été validé par notre équipe et votre collecte est maintenant <strong>en ligne</strong>.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin:20px 0">
        <p style="margin:0;color:#065f46;font-size:14px">
          🔗 Votre page de collecte est accessible ici :<br>
          <a href="${d.caseId ? `${SITE_URL}/case/${d.caseId}` : SITE_URL}" style="color:#0d5c2e;font-weight:700;word-break:break-all">
            ${d.caseId ? `${SITE_URL}/case/${d.caseId}` : SITE_URL}
          </a>
        </p>
      </div>
      <p style="color:#374151;font-size:14px">
        <strong>Prochaine étape :</strong> Partagez ce lien sur Facebook, WhatsApp et Instagram
        pour maximiser vos chances de collecte. Plus vous partagez, plus vous êtes aidé rapidement !
      </p>
      ${btnGreen("Voir ma page de collecte", d.caseId ? `${SITE_URL}/case/${d.caseId}` : SITE_URL)}`),
  }),

  // 4. Dossier rejeté (envoyé au bénéficiaire)
  caseRejected: (d) => ({
    subject: `ℹ️ Mise à jour de votre dossier — AYYAD CI`,
    html: wrap(`
      <h2 style="color:#b91c1c;margin-top:0">Votre dossier n'a pas pu être validé</h2>
      <p style="color:#374151;font-size:15px">
        Nous avons étudié votre dossier <strong>${normTitle(d.caseTitle || d.caseName)}</strong>
        avec attention. Malheureusement, nous ne sommes pas en mesure de le valider en l'état.
      </p>
      ${d.reason ? `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:18px;margin:16px 0">
        <p style="margin:0;color:#374151;font-size:14px"><strong>Motif :</strong> ${esc(String(d.reason).slice(0, 500))}</p>
      </div>` : ""}
      <p style="color:#374151;font-size:14px">
        Vous pouvez nous contacter pour plus d'informations ou soumettre un nouveau dossier
        avec les documents manquants.
      </p>
      ${btnGreen("Contacter l'équipe AYYAD", `mailto:${REPLY_TO}`)}`),
  }),

  // 5. Bienvenue patient (envoyé après création de compte bénéficiaire)
  welcomePatient: (d) => ({
    subject: `🙏 Bienvenue sur AYYAD CI — Votre dossier est en cours de traitement`,
    html: wrap(`
      <h2 style="color:#0d5c2e;margin-top:0">Bienvenue sur AYYAD CI 🙏</h2>
      <p style="color:#374151;font-size:15px">
        ${d.name ? `Bonjour <strong>${esc(String(d.name).slice(0,60))}</strong>,` : "Bonjour,"}
      </p>
      <p style="color:#374151;font-size:15px">
        Nous avons bien reçu votre demande. Notre équipe va examiner votre dossier
        et vous recontactera sous <strong>48 heures ouvrées</strong>.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin:20px 0">
        <p style="margin:0;color:#065f46;font-size:14px">
          ✅ Dossier reçu<br>
          ⏳ Vérification en cours par notre équipe<br>
          📢 Publication de la collecte sous 48h si validé
        </p>
      </div>
      <p style="color:#374151;font-size:14px">
        Si vous avez des questions, n'hésitez pas à nous écrire à
        <a href="mailto:${REPLY_TO}" style="color:#0d5c2e">${REPLY_TO}</a>
      </p>
      ${btnGreen("Accéder à la plateforme", SITE_URL)}`),
  }),

  // 6. Collecte 100% financée (envoyé aux donateurs)
  caseFunded: (d) => ({
    subject: `🎊 Objectif atteint ! ${normTitle(d.caseTitle || d.caseName)} est financé`,
    html: wrap(`
      <h2 style="color:#0d5c2e;margin-top:0">L'objectif est atteint ! 🎊</h2>
      <p style="color:#374151;font-size:15px">
        ${d.donorName ? `Merci <strong>${esc(String(d.donorName).slice(0,60))}</strong>,` : "Merci à tous,"}
        grâce à votre soutien, la collecte <strong>${normTitle(d.caseTitle || d.caseName)}</strong>
        a atteint son objectif de <strong>${fmtAmount(d.amount)}</strong> !
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin:20px 0;text-align:center">
        <p style="font-size:36px;margin:0">🎉</p>
        <p style="color:#0d5c2e;font-weight:700;font-size:20px;margin:8px 0">Objectif atteint !</p>
        <p style="color:#374151;font-size:15px;margin:0">${fmtAmount(d.amount)}</p>
      </div>
      <p style="color:#374151;font-size:14px">
        Les fonds vont être transférés directement à l'établissement de santé partenaire.
        Votre générosité a fait une vraie différence dans la vie de cette personne.
      </p>
      <p style="color:#374151;font-size:14px">
        <strong>Merci d'avoir fait partie de cette aventure humaine.</strong>
      </p>
      ${btnGreen("Voir les autres collectes", SITE_URL)}`),
  }),

  // 7. Email manuel (pour l'équipe AYYAD — envoi libre)
  manual: (d) => ({
    subject: d.subject || "Message de AYYAD CI",
    html: wrap(`
      <div style="color:#374151;font-size:15px;line-height:1.7">
        ${d.htmlBody || `<p>${esc(d.body || "")}</p>`}
      </div>`),
  }),
};

// ── Handler principal ──────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.ayyadci.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!RESEND_API_KEY) {
    console.error("[send-email] RESEND_API_KEY manquante");
    return res.status(500).json({ error: "Email config error" });
  }

  const { type, to, data = {} } = req.body || {};

  // Validation
  const validTypes = Object.keys(templates);
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Allowed: ${validTypes.join(", ")}` });
  }

  // Résolution du destinataire
  const recipient = (type === "newCase" || type === "manual" && !to)
    ? ADMIN_EMAIL
    : (to || ADMIN_EMAIL);

  if (!isEmail(recipient)) {
    return res.status(400).json({ error: "Invalid recipient email" });
  }

  // Construction du template
  const { subject, html } = templates[type](data);

  // Envoi via Resend
  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient],
        reply_to: REPLY_TO,
        subject,
        html,
      }),
    });

    const result = await resendRes.json();

    if (!resendRes.ok) {
      console.error("[send-email] Resend error:", resendRes.status, result);
      return res.status(502).json({ error: "Email provider error", details: result });
    }

    console.log(`[send-email] ✅ ${type} → ${recipient} | id:${result.id}`);
    return res.status(200).json({ success: true, id: result.id });

  } catch (err) {
    console.error("[send-email] Fetch error:", err);
    return res.status(500).json({ error: "Network error sending email" });
  }
}
