// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Ayyad transactional emails (via Resend)
// ─────────────────────────────────────────────────────────────────────────────
// La clé RESEND_API_KEY est lue côté SERVEUR uniquement (jamais exposée au client).
// Le frontend appelle POST /api/send-email avec { type, to, data }.
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || "";
const FROM_EMAIL = "Ayyad <noreply@ayyadci.com>";
const REPLY_TO = "contact@ayyadci.com";
const SITE_URL = "https://ayyadci.com";

// ── CORS strict : on n'autorise que les origines de confiance ────────────────
const ALLOWED_ORIGINS = new Set([
  "https://ayyadci.com",
  "https://www.ayyadci.com",
  "https://ayyad.vercel.app", // legacy
]);

// ── Anti-XSS : escape des variables avant injection HTML ─────────────────────
const escapeHtml = (v) => {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// ── Rate-limit en mémoire (best-effort, par instance) ────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 min
const RATE_LIMIT_MAX = 10;          // 10 emails/min/IP
const ipBuckets = new Map();
const rateLimitOk = (ip) => {
  const now = Date.now();
  const bucket = ipBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  ipBuckets.set(ip, recent);
  return true;
};

// ── Validation email basique (RFC light) ─────────────────────────────────────
const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

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
// Toutes les valeurs sont escape() après normalisation pour anti-XSS dans les emails.
const normTitle = (t) => {
  if (!t) return "—";
  if (typeof t === "string") return escapeHtml(t.slice(0, 200));
  if (typeof t === "object") return escapeHtml(String(t.fr || t.en || Object.values(t)[0] || "—").slice(0, 200));
  return escapeHtml(String(t).slice(0, 200));
};

const normAmount = (a) => {
  if (a === null || a === undefined || a === "") return "—";
  if (typeof a === "number") return new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.min(1e10, a))) + " FCFA";
  if (typeof a === "string") {
    const s = a.slice(0, 50); // borne taille
    if (/FCFA|EUR|USD|€|\$/i.test(s)) return escapeHtml(s);
    const cleaned = s.replace(/\s/g, "");
    if (/^\d+(\.\d+)?$/.test(cleaned)) {
      const n = Math.max(0, Math.min(1e10, Number(cleaned)));
      return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
    }
    return escapeHtml(s) + " FCFA";
  }
  return escapeHtml(String(a));
};

const normName = (n) => {
  if (!n) return "";
  if (typeof n === "string") return escapeHtml(n.slice(0, 80));
  if (typeof n === "object") return escapeHtml(String(n.fr || n.en || Object.values(n)[0] || "").slice(0, 80));
  return escapeHtml(String(n).slice(0, 80));
};

// trackingId doit être strictement alphanumérique + tirets (format AYD-2026-MM-NNN ou hex legacy)
const normTrackingId = (t) => {
  if (!t) return "";
  const s = String(t).slice(0, 32);
  return /^[A-Z0-9-]+$/i.test(s) ? s : "";
};

// reason (motif rejet) — texte libre mais on escape + on borne taille
const normReason = (r) => escapeHtml(String(r || "").slice(0, 500));

// ── Templates ────────────────────────────────────────────────────────────────
const templates = {

  donConfirm: ({ donorName, amount, beneficiary, caseTitle, trackingId }) => ({
    subject: `Don de ${normAmount(amount)} enregistre - Ayyad`,
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
      <a href="${SITE_URL}${normTrackingId(trackingId) ? `/?case=${normTrackingId(trackingId)}` : ""}" style="background:#0d5c2e;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px;font-size:13px">Suivre la collecte →</a>
    `)
  }),

  newCase: ({ caseTitle, hospital, city, amount, trackingId }) => ({
    subject: `Nouveau dossier soumis : ${normTitle(caseTitle)}`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">📋 Nouveau dossier à vérifier</h2>
      <div style="background:#fefce8;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #fde047">
        <p style="margin:4px 0"><strong>Titre :</strong> ${normTitle(caseTitle)}</p>
        <p style="margin:4px 0"><strong>Hôpital :</strong> ${normName(hospital) || "—"}</p>
        <p style="margin:4px 0"><strong>Ville :</strong> ${normName(city) || "—"}</p>
        <p style="margin:4px 0"><strong>Montant demandé :</strong> ${normAmount(amount)}</p>
        ${normTrackingId(trackingId) ? `<p style="margin:4px 0"><strong>Tracking :</strong> <span style="font-family:monospace">${normTrackingId(trackingId)}</span></p>` : ""}
      </div>
      <a href="${SITE_URL}/admin" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Ouvrir le dashboard Admin →</a>
    `)
  }),

  caseApproved: ({ beneficiaryName, caseTitle, trackingId }) => ({
    subject: `Votre dossier a ete approuve - Ayyad`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">🎉 Bonne nouvelle, ${normName(beneficiaryName)}!</h2>
      <p style="color:#6b7280">Votre dossier <strong>${normTitle(caseTitle)}</strong> a été vérifié et approuvé par l'équipe Ayyad. La collecte est maintenant en ligne.</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>ID de suivi :</strong> <span style="font-family:monospace;color:#0d5c2e">${normTrackingId(trackingId) || "—"}</span></p>
        <p style="margin:4px 0;font-size:13px;color:#6b7280">Conservez cet identifiant pour suivre votre collecte.</p>
      </div>
      <p style="color:#6b7280;font-size:14px">Partagez le lien de votre collecte avec vos proches pour maximiser les dons.</p>
      <a href="${SITE_URL}/?case=${normTrackingId(trackingId)}" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Voir ma collecte →</a>
    `)
  }),

  caseRejected: ({ beneficiaryName, caseTitle, reason }) => ({
    subject: `Mise a jour de votre dossier - Ayyad`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">Mise à jour de votre dossier${beneficiaryName ? ", " + normName(beneficiaryName) : ""}</h2>
      <p style="color:#6b7280">Après vérification, votre dossier <strong>${normTitle(caseTitle)}</strong> n'a pas pu être approuvé en l'état.</p>
      ${reason ? `<div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #fecaca"><p style="margin:0;color:#b91c1c"><strong>Motif :</strong> ${normReason(reason)}</p></div>` : ""}
      <p style="color:#6b7280;font-size:14px">Vous pouvez soumettre un nouveau dossier avec des documents complets et conformes.</p>
      <p style="color:#6b7280;font-size:14px">Pour toute question, contactez-nous à <a href="mailto:${REPLY_TO}" style="color:#0d5c2e">${REPLY_TO}</a>.</p>
      <a href="${SITE_URL}" style="background:#6b7280;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Soumettre un nouveau dossier →</a>
    `)
  }),

  welcomePatient: ({ beneficiaryName, caseTitle, trackingId }) => ({
    subject: `Votre dossier a bien ete recu - Ayyad`,
    html: wrap(`
      <h2 style="color:#111;margin-top:0">Bonjour ${normName(beneficiaryName)}, merci pour votre confiance 🙏</h2>
      <p style="color:#6b7280">Votre dossier <strong>${normTitle(caseTitle)}</strong> a bien été reçu par notre équipe.</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>ID de suivi :</strong> <span style="font-family:monospace;color:#0d5c2e">${normTrackingId(trackingId) || "—"}</span></p>
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

  caseFunded: ({ donorName, caseTitle, beneficiary, totalRaised, trackingId }) => ({
    subject: `Objectif atteint pour ${normName(beneficiary) || normTitle(caseTitle) || "la collecte"} - Merci 💚`,
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
      <a href="${SITE_URL}/?case=${normTrackingId(trackingId)}" style="background:#0d5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">Voir le détail →</a>
    `)
  }),
};

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS strict : on autorise uniquement les origines de confiance
  const origin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://ayyadci.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Rate-limiting basique par IP
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  if (!rateLimitOk(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante dans les variables d'environnement");
    return res.status(500).json({ error: "Server email config missing" });
  }

  try {
    const body = req.body || {};
    const type = String(body.type || "").slice(0, 50);
    const data = (body.data && typeof body.data === "object") ? body.data : {};
    const to = body.to;

    if (!type || !templates[type]) {
      return res.status(400).json({ error: "Invalid template type" });
    }

    const { subject, html } = templates[type](data);

    // Destinataires : si vide, fallback admin (pour les notifications internes)
    let recipients = Array.isArray(to) ? to : (to ? [to] : (ADMIN_EMAIL ? [ADMIN_EMAIL] : []));
    recipients = recipients.filter(isEmail).slice(0, 10); // max 10 destinataires par appel

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No valid recipients" });
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

    const result = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      // On log côté serveur mais on ne renvoie PAS le détail au client
      console.error("Resend API error:", resendRes.status, result);
      return res.status(502).json({ error: "Email provider error" });
    }

    return res.status(200).json({ success: true, id: result.id });

  } catch (err) {
    console.error("Email handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
