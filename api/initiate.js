// ── /api/initiate.js ─────────────────────────────────────────────────────────
// Endpoint POST /api/initiate
// Crée un enregistrement de don (status:"initiated") dans Supabase AVANT le
// paiement, et retourne les URLs Wave/MTN avec montant + référence pré-remplis.
//
// Corps attendu :
//   { case_id, tracking_id, amount, provider, donor_name, anonymous }
//
// Réponse :
//   { donation_id, payRef, wave_url, mtn_url }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const WAVE_BASE = "https://pay.wave.com/m/M_ci_PJosg8FuvJDW/c/ci/";
const MTN_BASE  = "https://appbiz.momo.africa/momo/request-momo/2250501855991";

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

  const supabaseUrl  = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return err(res, 500, "Config serveur manquante");

  const { case_id, tracking_id, amount, provider, donor_name, anonymous } = req.body || {};

  // ── Validation ────────────────────────────────────────────────────────────
  const amt = parseInt(amount, 10);
  if (!amt || amt < 500)   return err(res, 400, "Montant minimum 500 FCFA");
  if (amt > 10_000_000)    return err(res, 400, "Montant trop élevé");
  if (!case_id && !tracking_id) return err(res, 400, "case_id ou tracking_id requis");
  const prov = (provider || "WAVE").toUpperCase();

  // ── Référence unique lisible dans l'historique Wave/MTN ──────────────────
  const rand    = Math.random().toString(36).substr(2, 5).toUpperCase();
  const payRef  = `AYD-${Date.now().toString(36).toUpperCase().slice(-5)}-${rand}`;
  // Note qui apparaît dans le relevé Wave/MTN du compte marchand
  const note    = `AYYAD ${tracking_id || "DON"} ${payRef}`;

  // ── Résoudre case_id si seulement tracking_id fourni ─────────────────────
  const supabase = createClient(supabaseUrl, serviceKey);
  let resolvedCaseId = case_id || null;
  if (!resolvedCaseId && tracking_id) {
    const { data: caseRow } = await supabase
      .from("cases")
      .select("id")
      .eq("tracking_id", tracking_id)
      .maybeSingle();
    resolvedCaseId = caseRow?.id || null;
  }

  // ── Créer le don AVANT le paiement (status = "initiated") ────────────────
  const { data: donation, error: insErr } = await supabase
    .from("donations")
    .insert({
      case_id:        resolvedCaseId,
      donor_name:     anonymous ? null : (donor_name?.trim() || null),
      amount_fcfa:    amt,
      amount:         amt,
      payment_method: prov,
      status:         "pending",   // en attente de confirmation
      reference:      payRef,
      created_at:     new Date().toISOString(),
    })
    .select()
    .single();

  if (insErr) {
    console.error("[initiate] insert:", insErr);
    return err(res, 500, "Erreur création don: " + insErr.message);
  }

  // ── Construire les URLs de paiement ──────────────────────────────────────
  // Wave : paramètres amount + note supportés officiellement
  const wave_url = `${WAVE_BASE}?amount=${amt}&note=${encodeURIComponent(note)}`;
  // MTN MoMo : paramètre amount (note/reason si supporté dans l'app)
  const mtn_url  = `${MTN_BASE}?amount=${amt}`;

  return ok(res, {
    donation_id: donation.id,
    payRef,
    wave_url,
    mtn_url,
    note,
  });
}
