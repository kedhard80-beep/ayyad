// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Création d'une facture PayDunya
// ─────────────────────────────────────────────────────────────────────────────
// Le frontend appelle POST /api/dunya/create-invoice avec le don à effectuer.
// On pré-insère la donation en "pending" côté Supabase, puis on crée une
// invoice PayDunya. La payment_url est renvoyée au frontend qui redirige
// le donateur vers la page de paiement hostée par PayDunya.
//
// Quand le donateur paie, PayDunya appellera notre webhook (/api/dunya/webhook)
// qui flippera la donation en "confirmed" → la jauge avancera automatiquement.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAYDUNYA_MASTER_KEY  = process.env.PAYDUNYA_MASTER_KEY;
const PAYDUNYA_PRIVATE_KEY = process.env.PAYDUNYA_PRIVATE_KEY;
const PAYDUNYA_TOKEN       = process.env.PAYDUNYA_TOKEN;
const PAYDUNYA_MODE        = (process.env.PAYDUNYA_MODE || "test").toLowerCase(); // "test" ou "live"

const PAYDUNYA_API_BASE = PAYDUNYA_MODE === "live"
  ? "https://app.paydunya.com/api/v1"
  : "https://app.paydunya.com/sandbox-api/v1";

const ALLOWED_ORIGINS = new Set([
  "https://ayyadci.com",
  "https://www.ayyadci.com",
  "https://ayyad.vercel.app",
]);

// Rate-limit en mémoire (best-effort, par instance)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const ipBuckets = new Map();
function rateLimitOk(ip) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  ipBuckets.set(ip, recent);
  return true;
}

const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

const MAX_AMOUNT = 50_000_000;
const MIN_AMOUNT = 100;

const sanitize = (v, maxLen) => {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim() || null;
};

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://ayyadci.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  if (!rateLimitOk(ip)) return res.status(429).json({ error: "Too many requests" });

  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "Server config missing" });
  if (!PAYDUNYA_MASTER_KEY || !PAYDUNYA_PRIVATE_KEY || !PAYDUNYA_TOKEN) {
    return res.status(500).json({ error: "PayDunya keys not configured" });
  }

  try {
    const body = req.body || {};

    // ── Validation ──
    if (!isUuid(body.case_id)) return res.status(400).json({ error: "case_id invalid" });
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt < MIN_AMOUNT || amt > MAX_AMOUNT) {
      return res.status(400).json({ error: "amount invalid" });
    }
    if (body.donor_email && !isEmail(body.donor_email)) {
      return res.status(400).json({ error: "donor_email invalid" });
    }
    if (body.donor_id && !isUuid(body.donor_id)) {
      return res.status(400).json({ error: "donor_id invalid" });
    }

    const donorName  = sanitize(body.donor_name, 80);
    const donorEmail = body.donor_email && isEmail(body.donor_email) ? body.donor_email.toLowerCase() : null;
    const message    = sanitize(body.message, 500);
    const caseTitle  = sanitize(body.case_title, 100) || "Don Ayyad";
    const trackingId = sanitize(body.tracking_id, 32) || null;
    const beneficiary= sanitize(body.beneficiary, 80) || null;

    // ── 1) Pré-insert de la donation côté Supabase (status pending) ──
    const reference = "AYYAD-" + (trackingId || body.case_id.slice(0, 8)) + "-" + Date.now().toString(36).toUpperCase();
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/donations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        case_id: body.case_id,
        donor_id: body.donor_id || null,
        donor_name: donorName,
        donor_email: donorEmail,
        amount: amt,
        amount_fcfa: amt,
        currency: "FCFA",
        payment_method: "PAYDUNYA",
        status: "pending",
        message,
        reference,
      }),
    });
    const insertData = await insertRes.json().catch(() => ({}));
    if (!insertRes.ok) {
      console.error("[dunya/create] supabase insert error:", insertRes.status, insertData);
      return res.status(502).json({ error: "Database error" });
    }
    const donation = Array.isArray(insertData) ? insertData[0] : insertData;
    if (!donation?.id) {
      return res.status(502).json({ error: "Donation not created" });
    }

    // ── 2) Créer l'invoice PayDunya ──
    const returnUrl = `https://ayyadci.com/?p=dunya-return&don=${donation.id}`;
    const cancelUrl = `https://ayyadci.com/?p=case&case=${trackingId || ""}`;
    const callbackUrl = `https://ayyadci.com/api/dunya/webhook`;

    const invoicePayload = {
      invoice: {
        total_amount: Math.round(amt),
        description: `Don pour ${beneficiary || caseTitle}`.slice(0, 200),
      },
      store: {
        name: "Ayyad - Financement medical solidaire",
        tagline: "Donner de la force a ceux qui en ont besoin",
        postal_address: "Abidjan, Cote d'Ivoire",
        phone: "+22500000000", // Numéro de contact (à mettre à jour)
        website_url: "https://ayyadci.com",
      },
      actions: {
        cancel_url: cancelUrl,
        callback_url: callbackUrl,
        return_url: returnUrl,
      },
      custom_data: {
        donation_id: donation.id,
        case_id: body.case_id,
        donor_id: body.donor_id || "",
        tracking_id: trackingId || "",
        reference,
      },
    };

    const dunyaRes = await fetch(`${PAYDUNYA_API_BASE}/checkout-invoice/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": PAYDUNYA_MASTER_KEY,
        "PAYDUNYA-PRIVATE-KEY": PAYDUNYA_PRIVATE_KEY,
        "PAYDUNYA-TOKEN": PAYDUNYA_TOKEN,
      },
      body: JSON.stringify(invoicePayload),
    });

    const dunyaResult = await dunyaRes.json().catch(() => ({}));

    if (dunyaResult.response_code !== "00" || !dunyaResult.token || !dunyaResult.response_text) {
      console.error("[dunya/create] PayDunya error:", dunyaRes.status, dunyaResult);
      // On rollback la donation pour ne pas laisser de pending fantôme
      await fetch(`${SUPABASE_URL}/rest/v1/donations?id=eq.${donation.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ status: "cancelled" }),
      }).catch(() => {});
      return res.status(502).json({ error: "Payment provider error" });
    }

    // ── 3) Stocker le token PayDunya dans la donation pour matching webhook ──
    await fetch(`${SUPABASE_URL}/rest/v1/donations?id=eq.${donation.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ reference: dunyaResult.token }), // on remplace la ref interne par le token PayDunya pour faciliter le matching
    });

    return res.status(200).json({
      success: true,
      payment_url: dunyaResult.response_text, // PayDunya renvoie l'URL dans response_text (oui, c'est bizarre)
      token: dunyaResult.token,
      donation_id: donation.id,
    });

  } catch (err) {
    console.error("[dunya/create] handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
