// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Ayyad transactional emails (via Resend)
// ─────────────────────────────────────────────────────────────────────────────
// La clé RESEND_API_KEY est lue côté SERVEUR uniquement (jamais exposée au client).
// Le frontend appelle POST /api/send-email avec { type, to, data }.
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || "kedhard80@gmail.com";
const FROM_EMAIL = "Ayyad <noreply@ayyadci.com>";
const REPLY_TO = "contact@ayyadci.com";
const SITE_URL = "https://ayyadci.com";

// ── Header HTML commun à tous les emails ─────────────────────────────────────
const header = () => `
  <div style="background:#0d5c2e;padding:24px;text-align:center;border-radius:12px 12px 0 0">
    <h1 style="color:#C9A84C;margin:0;font-size:24px;letter-spacing:1px">AYYAD</h1>
    <p style="color:#a7f3d0;margin:4px 0 0;font-size:13px">Financement médical solidaire</p>
  </div>`;

const footer = () => `
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;text-align:center">
    © ${new Date().getFullYear()} Ayyad CI · <a href="${SITE_URL}" style="color:#9ca3af">ayyadci.com</a><br/>
    Pour toute question : <a href="mailto:${REPLY_TO}" style="color:#0d5c2e">${REPLY_TO}</a>
  </p>`;

const wrap = (inner) => `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;background:#fff">
    ${header()}
    <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      ${inner}
      ${footer()}
    </div>
  </div>`;

// ── Helpers pour normaliser les valeurs envoyées par le frontend ─────────────
// title peut arriver comme string OU comme objet { fr, en } selon le call site
const normTitle = (t) => {
  if (!t) return "—";
  if (typeof t === "string") return t;
  if (typeof t === "object") return t.fr || t.en || Object.values(t)[0] || "—";
  return String(t);
};

// amount peut arriver formaté ("1 000 FCFA"), brut (1000), ou string numérique ("5000000")
// On évite la duplication "FCFA FCFA" et on formate les nombres avec espaces
const normAmount = (a) => {
  if (a === null || a === undefined || a === "") return "—";
  // Déjà un nombre → format français + FCFA
  if (typeof a === "number") return new Intl.NumberFormat("fr-FR").format(a) + " FCFA";
  if (typeof a === "string") {
    // Déjà formaté avec une devise → on retourne tel quel
    if (/FCFA|EUR|USD|€|\$/i.test(a)) return a;
    // String purement numérique (avec ou sans espaces) → on parse et reformate
    const cleaned = a.replace(/\s/g, "");
    if (/^\d+(\.\d+)?$/.test(cleaned)) {
      return new Intl.NumberFormat("fr-FR").format(Number(cleaned)) + " FCFA";
    }
    // Sinon on append FCFA brut
    return a + " FCFA";
  }
  return String(a);
};

// Nom : peut arriver en object aussi (rare mais on sécurise)
const normName = (n) => {
  if (!n) return "";
  if (typeof n === "string") return n;
  if (typeof n === "object") return n.fr || n.en || Object.values(n)[0] || "";
  return String(n);
};

// ── Templates ────────────────────────────────────────────────────────────────
const templates = {

  // 1) Confirmation de don envoyée au donateur
  donConfirm: ({ donorName, amount, beneficiary, caseTitle, trackingId }) => ({
    subject: `✅ Don de ${normAmount(amount)} enregistré — Ayyad`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">Merci ${normName(donorName)} pour votre don 💚</h2>
      <p style="color:#6b7280">Votre don a bien été enregistré :</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>Montant :</strong> ${normAmount(amount)}</p>
        <p style="margin:4px 0"><strong>Bénéficiaire :</strong> ${normName(beneficiary) || "—"}</p>
        <p style="margin:4px 0"><strong>Collecte :</strong> ${normTitle(caseTitle)}</p>
      </div>
      <p style="color:#6b7280;font-size:14px">Les fonds seront versés directement à l'hôpital partenaire. Aucuns frais cachés.</p>
      <p style="color:#6b7280;font-size:14px">Merci de soutenir la vie. 🙏</p>
      <a href="${SITE_URL}${trackingId ? `/?case=${trackingId}` : ""}" style="background:#0d5c2e;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px;font-size:13px">Suivre la collecte →</a>
    `)
  }),

  // 2) Notification admin : nouveau dossier soumis
  newCase: ({ caseTitle, hospital, city, amount, trackingId }) => ({
    subject: `📋 Nouveau dossier soumis : ${normTitle(caseTitle)}`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">📋 Nouveau dossier à vérifier</h2>
      <div style="background:#fefce8;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #fde047">
        <p style="margin:4px 0"><strong>Titre :</strong> ${normTitle(caseTitle)}</p>
        <p style="margin:4px 0"><strong>Hôpital :</strong> ${hospital || "—"}</p>
        <p style="margin:4px 0"><strong>Ville :</strong> ${city || "—"}</p>
        <p style="margin:4px 0"><strong>Montant demandé :</strong> ${normAmount(amount)}</p>
        ${trackingId ? `<p style="margin:4px 0"><strong>Tracking :</strong> <span style="font-family:monospace">${trackingId}</span></p>` : ""}
      </div>
      <a href="${SITE_URL}/admin" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Ouvrir le dashboard Admin →</a>
    `)
  }),

  // 3) Dossier approuvé : envoyé au patient
  caseApproved: ({ beneficiaryName, caseTitle, trackingId }) => ({
    subject: `🎉 Votre dossier a été approuvé — Ayyad`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">🎉 Bonne nouvelle, ${normName(beneficiaryName)}!</h2>
      <p style="color:#6b7280">Votre dossier <strong>${normTitle(caseTitle)}</strong> a été vérifié et approuvé par l'équipe Ayyad. La collecte est maintenant en ligne.</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>ID de suivi :</strong> <span style="font-family:monospace;color:#0d5c2e">${trackingId || "—"}</span></p>
        <p style="margin:4px 0;font-size:13px;color:#6b7280">Conservez cet identifiant pour suivre votre collecte.</p>
      </div>
      <p style="color:#6b7280;font-size:14px">Partagez le lien de votre collecte avec vos proches pour maximiser les dons.</p>
      <a href="${SITE_URL}/?case=${trackingId || ""}" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Voir ma collecte →</a>
    `)
  }),

  // 4) Dossier rejeté : envoyé au patient
  caseRejected: ({ beneficiaryName, caseTitle, reason }) => ({
    subject: `ℹ️ Mise à jour de votre dossier — Ayyad`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">Mise à jour de votre dossier${beneficiaryName ? ", " + normName(beneficiaryName) : ""}</h2>
      <p style="color:#6b7280">Après vérification, votre dossier <strong>${normTitle(caseTitle)}</strong> n'a pas pu être approuvé en l'état.</p>
      ${reason ? `<div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #fecaca"><p style="margin:0;color:#b91c1c"><strong>Motif :</strong> ${reason}</p></div>` : ""}
      <p style="color:#6b7280;font-size:14px">Vous pouvez soumettre un nouveau dossier avec des documents complets et conformes.</p>
      <p style="color:#6b7280;font-size:14px">Pour toute question, contactez-nous à <a href="mailto:${REPLY_TO}" style="color:#0d5c2e">${REPLY_TO}</a>.</p>
      <a href="${SITE_URL}" style="background:#6b7280;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Soumettre un nouveau dossier →</a>
    `)
  }),

  // 5) Bienvenue patient : envoyé juste après soumission (avant validation admin)
  welcomePatient: ({ beneficiaryName, caseTitle, trackingId }) => ({
    subject: `📨 Votre dossier a bien été reçu — Ayyad`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">Bonjour ${normName(beneficiaryName)}, merci pour votre confiance 🙏</h2>
      <p style="color:#6b7280">Votre dossier <strong>${normTitle(caseTitle)}</strong> a bien été reçu par notre équipe.</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>ID de suivi :</strong> <span style="font-family:monospace;color:#0d5c2e">${trackingId || "—"}</span></p>
        <p style="margin:4px 0;font-size:13px;color:#6b7280">Notez bien cet identifiant — il vous permettra de suivre l'avancement.</p>
      </div>
      <h3 style="color:#111;font-size:16px;margin-top:24px">📋 Prochaines étapes</h3>
      <ol style="color:#6b7280;font-size:14px;padding-left:20px;line-height:1.7">
        <li><strong>Vérification</strong> : notre équipe contrôle vos documents médicaux et hospitaliers (24-72h ouvrées)</li>
        <li><strong>Validation</strong> : si tout est conforme, votre collecte sera mise en ligne et vous recevrez un email de confirmation</li>
        <li><strong>Mise en ligne</strong> : la collecte sera diffusée sur la plateforme et nos réseaux</li>
      </ol>
      <p style="color:#6b7280;font-size:14px">Si nous avons besoin de pièces complémentaires, nous vous contacterons à cette adresse.</p>
      <a href="${SITE_URL}" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Retour à Ayyad →</a>
    `)
  }),

  // 6) Collecte atteinte : envoyé à chaque donateur quand l'objectif est atteint
  caseFunded: ({ donorName, caseTitle, beneficiary, totalRaised, trackingId }) => ({
    subject: `🎯 Objectif atteint pour ${normName(beneficiary) || normTitle(caseTitle) || "la collecte"} ! Merci 💚`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">🎯 Objectif atteint, ${normName(donorName)}!</h2>
      <p style="color:#6b7280">Grâce à votre soutien et celui de la communauté, la collecte a atteint son objectif.</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:20px;margin:16px 0;text-align:center;border:2px solid #0d5c2e">
        <p style="margin:0;color:#6b7280;font-size:13px">Collecte</p>
        <p style="margin:4px 0 12px;font-weight:600;color:#111;font-size:16px">${normTitle(caseTitle)}</p>
        <p style="margin:0;color:#0d5c2e;font-size:28px;font-weight:700">${normAmount(totalRaised)}</p>
        <p style="margin:4px 0 0;color:#6b7280;font-size:12px">collectés au total</p>
      </div>
      <p style="color:#6b7280;font-size:14px">Les fonds vont être versés à l'hôpital partenaire pour la prise en charge de <strong>${normName(beneficiary)}</strong>.</p>
      <p style="color:#6b7280;font-size:14px">Vous recevrez une mise à jour avec un retour sur l'opération dès qu'elle sera disponible.</p>
      <p style="color:#6b7280;font-size:14px">Merci de transformer une vie. 💚</p>
      <a href="${SITE_URL}/?case=${trackingId || ""}" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Voir le détail →</a>
    `)
  }),
};

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS (utile pour vercel dev local)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante dans les variables d'environnement");
    return res.status(500).json({ error: "Server email config missing" });
  }

  try {
    const { type, to, data } = req.body || {};

    if (!type || !templates[type]) {
      return res.status(400).json({ error: `Unknown template type: ${type}` });
    }

    const { subject, html } = templates[type](data || {});

    // Destinataires : si vide, fallback admin (pour les notifications internes)
    let recipients = Array.isArray(to) ? to : (to ? [to] : [ADMIN_EMAIL]);
    recipients = recipients.filter(Boolean);

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients provided" });
    }

    // Appel Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipients,
        reply_to: REPLY_TO,
        subject,
        html,
      }),
    });

    const result = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend API error:", result);
      return res.status(resendRes.status).json({ error: "Resend API error", details: result });
    }

    return res.status(200).json({ success: true, id: result.id, type, recipients });

  } catch (err) {
    console.error("Email handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
