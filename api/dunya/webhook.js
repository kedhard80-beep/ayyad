// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Webhook IPN PayDunya
// ─────────────────────────────────────────────────────────────────────────────
// PayDunya appelle cet endpoint quand un paiement change de statut.
// On vérifie la signature SHA-512 (anti-fraude), on récupère la donation
// correspondante via le token PayDunya, et on flippe son statut.
//
// Si paiement OK → status="confirmed" + recompute cases.collected
//                + envoi email caseFunded si l'objectif vient d'être atteint
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYDUNYA_MASTER_KEY = process.env.PAYDUNYA_MASTER_KEY;

// On accepte le format form-encoded ET JSON (PayDunya utilise form-data)
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  // Vercel parse normalement le body via headers Content-Type. Fallback brut.
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => raw += c);
    req.on("end", () => {
      try {
        if (raw.startsWith("{")) return resolve(JSON.parse(raw));
        // form-encoded → on parse
        const params = new URLSearchParams(raw);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        resolve(obj);
      } catch(e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// PayDunya envoie souvent les params en notation pointée: data[invoice][token].
// On reconstitue un objet propre.
function flattenPayDunya(body) {
  if (body.data && typeof body.data === "object") return body.data;
  // Formats type "data[invoice][token]" dans form-encoded
  const out = {};
  for (const key of Object.keys(body)) {
    const m = key.match(/^data\[([^\]]+)\](?:\[([^\]]+)\])?(?:\[([^\]]+)\])?/);
    if (!m) continue;
    const [, k1, k2, k3] = m;
    if (k1 && !k2) out[k1] = body[key];
    else if (k1 && k2 && !k3) {
      out[k1] = out[k1] || {};
      out[k1][k2] = body[key];
    } else if (k1 && k2 && k3) {
      out[k1] = out[k1] || {};
      out[k1][k2] = out[k1][k2] || {};
      out[k1][k2][k3] = body[key];
    }
  }
  return out;
}

export default async function handler(req, res) {
  // PayDunya appelle en POST. On accepte aussi GET pour healthcheck.
  if (req.method === "GET") return res.status(200).send("OK");
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  if (!SUPABASE_URL || !SERVICE_KEY || !PAYDUNYA_MASTER_KEY) {
    console.error("[dunya/webhook] config missing");
    return res.status(500).send("Server config missing");
  }

  try {
    const body = await readBody(req);
    const data = flattenPayDunya(body);

    const token = data?.invoice?.token || data?.token || null;
    const status = (data?.status || "").toLowerCase();
    const receivedHash = data?.hash || null;
    const customData = data?.custom_data || {};

    if (!token) {
      console.warn("[dunya/webhook] missing token, body:", body);
      return res.status(400).send("Missing token");
    }

    // ── Vérification de signature SHA-512 ──
    // PayDunya: sha512(MASTER_KEY + token) doit matcher data.hash
    if (receivedHash) {
      const expected = crypto.createHash("sha512")
        .update(PAYDUNYA_MASTER_KEY + token)
        .digest("hex");
      if (expected !== receivedHash) {
        console.warn("[dunya/webhook] hash mismatch — possible fraud attempt");
        return res.status(401).send("Invalid hash");
      }
    } else {
      console.warn("[dunya/webhook] no hash provided, refusing");
      return res.status(401).send("Missing hash");
    }

    // ── Mapping statut PayDunya → statut Ayyad ──
    let donationStatus = null;
    if (status === "completed") donationStatus = "confirmed";
    else if (status === "cancelled") donationStatus = "cancelled";
    else {
      // pending, failed, etc. — on ignore (pas d'update)
      return res.status(200).send("Status ignored");
    }

    // ── Trouver la donation via le token PayDunya stocké dans reference ──
    // (on l'a stocké dans /api/dunya/create-invoice après réception du token)
    let donationId = customData?.donation_id || null;
    let donation = null;

    // 1ère tentative: par donation_id custom_data
    if (donationId) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/donations?id=eq.${donationId}&select=id,case_id,status`, {
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
      });
      const rows = await r.json().catch(() => []);
      if (Array.isArray(rows) && rows[0]) donation = rows[0];
    }

    // 2ème tentative: par reference = token PayDunya
    if (!donation) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/donations?reference=eq.${encodeURIComponent(token)}&select=id,case_id,status`, {
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
      });
      const rows = await r.json().catch(() => []);
      if (Array.isArray(rows) && rows[0]) donation = rows[0];
    }

    if (!donation) {
      console.warn("[dunya/webhook] donation not found for token:", token);
      // On répond 200 quand même pour que PayDunya ne retente pas en boucle
      return res.status(200).send("Donation not found (ignored)");
    }

    // Idempotence : si déjà au bon statut, on ne fait rien
    if (donation.status === donationStatus) {
      return res.status(200).send("Already up to date");
    }

    // ── Update du statut ──
    const updRes = await fetch(`${SUPABASE_URL}/rest/v1/donations?id=eq.${donation.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ status: donationStatus }),
    });

    if (!updRes.ok) {
      const errBody = await updRes.text().catch(() => "");
      console.error("[dunya/webhook] update failed:", updRes.status, errBody);
      return res.status(500).send("Update failed");
    }

    // ── Si paiement confirmé : recompute cases.collected + email caseFunded ──
    if (donationStatus === "confirmed" && donation.case_id) {
      try {
        await recomputeCaseTotals(donation.case_id);
      } catch(e) {
        console.warn("[dunya/webhook] recompute échec (non bloquant):", e);
      }
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("[dunya/webhook] handler error:", err);
    return res.status(500).send("Internal server error");
  }
}

// ── Helper : recalcule cases.collected + envoie email caseFunded si premier passage ──
async function recomputeCaseTotals(caseId) {
  // 1) Total des dons confirmés
  const r1 = await fetch(
    `${SUPABASE_URL}/rest/v1/donations?case_id=eq.${caseId}&status=eq.confirmed&select=amount_fcfa,amount,donor_email,donor_name`,
    { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
  );
  const donations = await r1.json().catch(() => []);
  if (!Array.isArray(donations)) return;
  const total = donations.reduce((s, d) => s + Number(d.amount_fcfa || d.amount || 0), 0);
  const donorsCount = donations.length;

  // 2) État actuel du dossier
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?id=eq.${caseId}&select=amount,goal_reached_at,title,full_name,beneficiary,tracking_id`,
    { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
  );
  const cases = await r2.json().catch(() => []);
  const c = Array.isArray(cases) && cases[0] ? cases[0] : null;
  if (!c) return;

  const target = Number(c.amount || 0);
  const justReached = total >= target && target > 0 && !c.goal_reached_at;

  // 3) Update cases.collected/donors/goal_reached_at
  const updates = { collected: total, donors: donorsCount };
  if (justReached) updates.goal_reached_at = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/cases?id=eq.${caseId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(updates),
  });

  // 4) Email caseFunded à tous les donateurs si premier passage
  if (justReached) {
    const beneficiaryName = c.full_name || c.beneficiary || "le bénéficiaire";
    const caseTitleStr = typeof c.title === "object" ? (c.title?.fr || c.title?.en) : c.title;
    for (const d of donations) {
      if (!d.donor_email) continue;
      try {
        await fetch(`https://ayyadci.com/api/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "caseFunded",
            to: d.donor_email,
            data: {
              donorName: d.donor_name || "Donateur",
              caseTitle: caseTitleStr,
              beneficiary: beneficiaryName,
              totalRaised: total,
              trackingId: c.tracking_id,
            },
          }),
        });
      } catch(e) { console.warn("[dunya/webhook] caseFunded email échec:", e); }
    }
  }
}
