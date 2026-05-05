// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Création d'un don (bypass RLS)
// ─────────────────────────────────────────────────────────────────────────────
// Le frontend appelle POST /api/donate avec le payload du don.
// On utilise la SERVICE ROLE (côté serveur uniquement) pour insérer dans la
// table donations sans passer par les policies RLS.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// CORS strict
const ALLOWED_ORIGINS = new Set([
  "https://ayyadci.com",
  "https://www.ayyadci.com",
  "https://ayyad.vercel.app",
]);

// Rate-limiting en mémoire (best-effort, par instance Vercel)
const RATE_LIMIT_WINDOW_MS = 60_000;  // 1 min
const RATE_LIMIT_MAX = 5;             // 5 dons/min/IP — borne raisonnable
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

// ── Validations ───────────────────────────────────────────────────────────────
const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

// Plafond raisonnable : 50 millions FCFA. Au-delà, c'est probablement un abus
// (la majorité des collectes plafonnent à ~5M FCFA).
const MAX_AMOUNT_FCFA = 50_000_000;
const MIN_AMOUNT_FCFA = 100;

// ── Sanitization simple : on ne laisse que printable + retours à la ligne ────
const sanitize = (v, maxLen) => {
  if (v === null || v === undefined) return null;
  let s = String(v).slice(0, maxLen);
  // Strip control chars sauf \n et \r
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return s.trim() || null;
};

export default async function handler(req, res) {
  // CORS strict
  const origin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://ayyadci.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Rate-limiting par IP
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  if (!rateLimitOk(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Manque SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "Server config missing" });
  }

  try {
    const body = req.body || {};

    // ── Validation stricte ────────────────────────────────────────────────
    if (!isUuid(body.case_id)) {
      return res.status(400).json({ error: "case_id invalid" });
    }
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt < MIN_AMOUNT_FCFA || amt > MAX_AMOUNT_FCFA) {
      return res.status(400).json({ error: "amount invalid" });
    }
    if (body.donor_email && !isEmail(body.donor_email)) {
      return res.status(400).json({ error: "donor_email invalid" });
    }
    if (body.donor_id && !isUuid(body.donor_id)) {
      return res.status(400).json({ error: "donor_id invalid" });
    }

    // Whitelist pour les enums
    const allowedMethods = new Set(["WAVE", "CARD", "CASH", "BANK", "OTHER"]);
    const allowedStatus  = new Set(["pending", "confirmed", "cancelled"]);
    const payment_method = allowedMethods.has(body.payment_method) ? body.payment_method : "WAVE";
    const status = allowedStatus.has(body.status) ? body.status : "pending";

    // ── Payload propre ────────────────────────────────────────────────────
    const payload = {
      case_id: body.case_id,
      donor_id: body.donor_id || null,
      donor_name:  sanitize(body.donor_name, 80),
      donor_email: body.donor_email && isEmail(body.donor_email) ? body.donor_email.toLowerCase() : null,
      amount: amt,
      amount_fcfa: Number(body.amount_fcfa) || amt,
      currency: ["FCFA","EUR","USD"].includes(body.currency) ? body.currency : "FCFA",
      payment_method,
      status,
      message: sanitize(body.message, 500),
      reference: sanitize(body.reference, 100),
    };

    // Appel REST direct à PostgREST avec la service_role (bypass RLS)
    const r = await fetch(`${SUPABASE_URL}/rest/v1/donations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(payload),
    });

    const result = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Log côté serveur, on ne renvoie PAS le détail au client
      console.error("Donation insert error:", r.status, result);
      return res.status(502).json({ error: "Database error" });
    }

    return res.status(200).json({
      success: true,
      donation: { id: Array.isArray(result) ? result[0]?.id : result?.id },
    });
  } catch (err) {
    console.error("Donation handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
