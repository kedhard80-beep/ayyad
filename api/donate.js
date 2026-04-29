// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Création d'un don (bypass RLS)
// ─────────────────────────────────────────────────────────────────────────────
// Le frontend appelle POST /api/donate avec le payload du don.
// On utilise la SERVICE ROLE (côté serveur uniquement) pour insérer dans la
// table donations sans passer par les policies RLS — utile quand l'anon flow
// est bloqué par des subtilités RLS / GRANT côté Postgres.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Manque SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "Server config missing" });
  }

  try {
    const body = req.body || {};

    // Validation minimale (on accepte tout le reste tel quel)
    const amt = Number(body.amount);
    if (!body.case_id) return res.status(400).json({ error: "case_id required" });
    if (!amt || amt <= 0) return res.status(400).json({ error: "amount invalid" });

    // Payload propre — on ignore les champs qu'on ne veut pas exposer
    const payload = {
      case_id: body.case_id,
      donor_id: body.donor_id || null,
      donor_name: body.donor_name || null,
      donor_email: body.donor_email || null,
      amount: amt,
      amount_fcfa: Number(body.amount_fcfa || amt),
      currency: body.currency || "FCFA",
      payment_method: body.payment_method || "WAVE",
      status: body.status === "confirmed" ? "confirmed" : "pending",
      message: body.message || null,
      reference: body.reference || null,
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

    const result = await r.json();
    if (!r.ok) {
      console.error("Donation insert error:", result);
      return res.status(r.status).json({ error: "Donation insert failed", details: result });
    }

    return res.status(200).json({ success: true, donation: Array.isArray(result) ? result[0] : result });
  } catch (err) {
    console.error("Donation handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
