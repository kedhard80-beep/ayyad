// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Broadcast "nouveau cas" aux donateurs abonnés
// Appelé par l'admin après avoir approuvé un dossier (approveCase)
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const RESEND_API_KEY    = process.env.RESEND_API_KEY;
const FROM_EMAIL        = "Ayyad <noreply@ayyadci.com>";
const SITE_URL          = "https://ayyadci.com";
const REPLY_TO          = "contact@ayyadci.com";

const ALLOWED_ORIGINS = new Set([
  "https://ayyadci.com",
  "https://www.ayyadci.com",
  "https://ayyad.vercel.app",
]);

const escapeHtml = (v) => {
  if (!v) return "";
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};

const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

const normTitle = (t) => {
  if (!t) return "—";
  if (typeof t === "object") return escapeHtml(String(t.fr || t.en || Object.values(t)[0] || "—").slice(0, 200));
  return escapeHtml(String(t).slice(0, 200));
};

const normAmount = (a) => {
  if (!a && a !== 0) return "—";
  const n = Number(a);
  if (isNaN(n)) return escapeHtml(String(a).slice(0, 50));
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, n)) + " FCFA";
};

const buildEmail = ({ donorName, caseTitle, hospital, city, amount, trackingId, beneficiary, urgent }) => {
  const tid = trackingId && /^[A-Z0-9-]+$/i.test(String(trackingId).slice(0,32)) ? String(trackingId).slice(0,32) : "";
  const caseUrl = tid ? `${SITE_URL}/?p=case&case=${tid}` : SITE_URL;

  const header = `<div style="background:#0d5c2e;padding:24px;text-align:center;border-radius:12px 12px 0 0">
    <h1 style="color:#C9A84C;margin:0;font-size:24px;letter-spacing:1px">AYYAD</h1>
    <p style="color:#a7f3d0;margin:4px 0 0;font-size:13px">Financement medical solidaire</p>
  </div>`;

  const footer = `<p style="color:#9ca3af;font-size:12px;margin-top:24px;text-align:center">
    &copy; ${new Date().getFullYear()} Ayyad CI &middot; <a href="${SITE_URL}" style="color:#9ca3af">ayyadci.com</a><br/>
    Pour ne plus recevoir ces notifications : <a href="${SITE_URL}/?p=monimpact" style="color:#9ca3af">gerer mes preferences</a>
  </p>`;

  const urgentBadge = urgent
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 16px;margin-bottom:16px;display:inline-block">
        <span style="color:#b91c1c;font-weight:700;font-size:13px">URGENT — Action requise</span>
      </div><br/>`
    : "";

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;background:#fff">
    ${header}
    <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="color:#111;margin-top:0">Un patient a besoin de vous ${donorName ? ", " + escapeHtml(donorName.slice(0,60)) : ""} &#x1F49A;</h2>
      ${urgentBadge}
      <p style="color:#6b7280;font-size:15px">Un nouveau dossier vient d'etre publie sur Ayyad. Chaque don, meme petit, fait la difference.</p>
      <div style="background:#f0fdf4;border-radius:12px;padding:20px;margin:20px 0;border:1px solid #bbf7d0">
        <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#111">${normTitle(caseTitle)}</p>
        ${beneficiary ? `<p style="margin:4px 0;color:#374151;font-size:14px">&#x1F465; ${escapeHtml(String(beneficiary).slice(0,80))}</p>` : ""}
        ${hospital ? `<p style="margin:4px 0;color:#374151;font-size:14px">&#x1F3E5; ${escapeHtml(String(hospital).slice(0,100))}${city ? " &middot; " + escapeHtml(String(city).slice(0,60)) : ""}</p>` : ""}
        <p style="margin:12px 0 0;font-size:20px;font-weight:800;color:#0d5c2e">${normAmount(amount)} <span style="font-size:13px;font-weight:400;color:#6b7280">a collecter</span></p>
      </div>
      <p style="color:#6b7280;font-size:14px">Vous recevez cet email car vous etes inscrit aux alertes de nouveaux cas sur Ayyad. Les fonds sont verses directement a l'hopital partenaire — aucun intermediaire.</p>
      <a href="${caseUrl}" style="background:#0d5c2e;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;display:inline-block;margin-top:8px;font-size:15px;font-weight:700">Voir le dossier et faire un don &#x2192;</a>
      ${footer}
    </div>
  </div>`;

  return {
    subject: urgent
      ? `URGENT : ${normTitle(caseTitle)} a besoin de vous — Ayyad`
      : `Nouveau dossier : ${normTitle(caseTitle)} — Ayyad`,
    html,
  };
};

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://ayyadci.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Vérification JWT admin
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Supabase env vars manquantes");
    return res.status(500).json({ error: "Server config error" });
  }
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante");
    return res.status(500).json({ error: "Email config error" });
  }

  // Créer un client Supabase avec le JWT de l'admin
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Vérifier que l'appelant est admin
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: "Invalid token" });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) return res.status(403).json({ error: "Admin only" });

  // Récupérer les infos du cas depuis le body
  const body = req.body || {};
  const caseData = body.case || {};

  // Récupérer tous les abonnés
  const { data: subscribers, error: subError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("notify_new_cases", true)
    .not("email", "is", null);

  if (subError) {
    console.error("Erreur lecture abonnés:", subError);
    return res.status(500).json({ error: "Could not fetch subscribers" });
  }

  const validSubs = (subscribers || []).filter(s => isEmail(s.email));
  if (validSubs.length === 0) {
    return res.status(200).json({ success: true, sent: 0, message: "No subscribers" });
  }

  // Construire les emails en batch (Resend batch API)
  const emails = validSubs.map(sub => {
    const { subject, html } = buildEmail({
      donorName: sub.full_name || "",
      ...caseData,
    });
    return { from: FROM_EMAIL, to: [sub.email], reply_to: REPLY_TO, subject, html };
  });

  // Envoyer par batch de 100 (limite Resend)
  let sent = 0;
  const BATCH_SIZE = 100;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const resendRes = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(batch),
    });
    if (resendRes.ok) {
      sent += batch.length;
    } else {
      const err = await resendRes.json().catch(() => ({}));
      console.error("Resend batch error:", resendRes.status, err);
    }
  }

  return res.status(200).json({ success: true, sent, total: validSubs.length });
}
