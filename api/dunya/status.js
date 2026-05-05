// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Vérifie le statut d'une donation PayDunya
// ─────────────────────────────────────────────────────────────────────────────
// Appelé par la page de retour ?p=dunya-return après que le donateur ait
// terminé son paiement sur PayDunya. Permet d'afficher l'état réel sans
// attendre que le webhook ait fini.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAYDUNYA_MASTER_KEY  = process.env.PAYDUNYA_MASTER_KEY;
const PAYDUNYA_PRIVATE_KEY = process.env.PAYDUNYA_PRIVATE_KEY;
const PAYDUNYA_TOKEN       = process.env.PAYDUNYA_TOKEN;
const PAYDUNYA_MODE        = (process.env.PAYDUNYA_MODE || "test").toLowerCase();
const PAYDUNYA_API_BASE    = PAYDUNYA_MODE === "live"
  ? "https://app.paydunya.com/api/v1"
  : "https://app.paydunya.com/sandbox-api/v1";

const ALLOWED_ORIGINS = new Set([
  "https://ayyadci.com",
  "https://www.ayyadci.com",
  "https://ayyad.vercel.app",
]);

const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://ayyadci.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "Server config missing" });

  try {
    const donationId = (req.query.id || "").toString();
    if (!isUuid(donationId)) return res.status(400).json({ error: "id invalid" });

    // 1) Récupérer la donation depuis Supabase
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/donations?id=eq.${donationId}&select=id,status,amount,amount_fcfa,case_id,reference`,
      { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
    );
    const rows = await r.json().catch(() => []);
    const donation = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!donation) return res.status(404).json({ error: "Donation not found" });

    // 2) Si déjà confirmé/cancelled côté DB → on retourne directement
    if (donation.status !== "pending") {
      return res.status(200).json({
        status: donation.status,
        amount: donation.amount_fcfa || donation.amount,
        case_id: donation.case_id,
      });
    }

    // 3) Si encore pending : on demande à PayDunya l'état actuel
    // (le webhook a peut-être pas encore tourné, ou PayDunya n'a pas envoyé l'IPN)
    const token = donation.reference;
    if (token && PAYDUNYA_MASTER_KEY) {
      const dunyaRes = await fetch(`${PAYDUNYA_API_BASE}/checkout-invoice/confirm/${encodeURIComponent(token)}`, {
        headers: {
          "PAYDUNYA-MASTER-KEY": PAYDUNYA_MASTER_KEY,
          "PAYDUNYA-PRIVATE-KEY": PAYDUNYA_PRIVATE_KEY,
          "PAYDUNYA-TOKEN": PAYDUNYA_TOKEN,
        },
      });
      const dunyaData = await dunyaRes.json().catch(() => ({}));
      const dunyaStatus = (dunyaData?.status || "").toLowerCase();

      // Si PayDunya dit completed → on flippe la donation (rattrapage si webhook a raté)
      if (dunyaStatus === "completed") {
        await fetch(`${SUPABASE_URL}/rest/v1/donations?id=eq.${donationId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": SERVICE_KEY,
            "Authorization": `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ status: "confirmed" }),
        });
        return res.status(200).json({
          status: "confirmed",
          amount: donation.amount_fcfa || donation.amount,
          case_id: donation.case_id,
        });
      }
      if (dunyaStatus === "cancelled" || dunyaStatus === "failed") {
        await fetch(`${SUPABASE_URL}/rest/v1/donations?id=eq.${donationId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": SERVICE_KEY,
            "Authorization": `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ status: "cancelled" }),
        });
        return res.status(200).json({ status: "cancelled" });
      }
    }

    return res.status(200).json({ status: "pending" });

  } catch (err) {
    console.error("[dunya/status] handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
