// ── /api/confirm.js ──────────────────────────────────────────────────────────
// Endpoint POST /api/confirm
// Appelé quand le donateur revient après avoir payé via Wave ou MTN.
// Met à jour le don de "initiated" → "pending" et enregistre la référence
// de transaction fournie par le donateur.
//
// Corps attendu :
//   { donation_id, tx_reference }     ← tx_reference = référence SMS Wave/MTN
//
// Réponse :
//   { ok: true, payRef }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function ok(res, data) { return res.status(200).json(data); }
function err(res, status, msg) { return res.status(status).json({ error: msg }); }

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return err(res, 405, "Method not allowed");

  const supabaseUrl = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return err(res, 500, "Config serveur manquante");

  const { donation_id, tx_reference } = req.body || {};
  if (!donation_id) return err(res, 400, "donation_id requis");

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Vérifier que le don existe et est bien en statut "initiated" ──────────
  const { data: existing, error: fetchErr } = await supabase
    .from("donations")
    .select("id, status, reference, amount_fcfa, case_id")
    .eq("id", donation_id)
    .maybeSingle();

  if (fetchErr || !existing) return err(res, 404, "Don introuvable");
  if (!["initiated", "pending"].includes(existing.status))
    return err(res, 409, "Ce don a déjà été traité");

  // ── Mettre à jour : status pending + référence transaction du donateur ────
  const updatePayload = {
    status:     "pending",     // en attente de vérification côté admin
    updated_at: new Date().toISOString(),
  };
  // Si le donateur a fourni sa référence de transaction (SMS Wave/MTN), on la stocke
  if (tx_reference && tx_reference.trim().length >= 3) {
    updatePayload.reference = tx_reference.trim();
  }

  const { error: updErr } = await supabase
    .from("donations")
    .update(updatePayload)
    .eq("id", donation_id);

  if (updErr) {
    console.error("[confirm] update:", updErr);
    return err(res, 500, "Erreur confirmation: " + updErr.message);
  }

  // ── Mettre à jour le compteur de dons sur le dossier ─────────────────────
  // On incrémente le nombre de donateurs pour que la barre de progression
  // soit visible immédiatement (le montant sera mis à jour manuellement).
  if (existing.case_id) {
    await supabase.rpc("increment_donors", { case_uuid: existing.case_id })
      .catch(() => {}); // silencieux si la fonction n'existe pas encore
  }

  console.log(`[confirm] Don ${donation_id} confirmé — ref: ${tx_reference || existing.reference}`);

  return ok(res, {
    ok: true,
    payRef: existing.reference,
    amount: existing.amount_fcfa,
  });
}
