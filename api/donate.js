// /api/donate.js — Validation serveur stricte
import { createClient } from "@supabase/supabase-js";

const AMOUNT_MIN_FCFA = 100;
const AMOUNT_MAX_FCFA = 10_000_000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function respond(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return respond(res, 405, { error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey     = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) return respond(res, 500, { error: "Configuration serveur incomplète." });

  // Vérification JWT optionnelle
  let verifiedUserId = null;
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ") && anonKey) {
    const token = authHeader.slice(7);
    const { data: { user } } = await createClient(supabaseUrl, anonKey).auth.getUser(token).catch(() => ({ data: {} }));
    if (user) verifiedUserId = user.id;
    else if (token.length > 10) return respond(res, 401, { error: "Token invalide." });
  }

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return respond(res, 400, { error: "Body JSON invalide." }); }

  const { case_id, donor_id, donor_name, donor_email, amount, amount_fcfa,
          currency = "FCFA", payment_method = "WAVE", status = "pending", message, reference } = body || {};

  if (!case_id) return respond(res, 400, { error: "case_id requis." });
  if (!UUID_REGEX.test(case_id)) return respond(res, 400, { error: "case_id invalide." });

  const numAmount = Number(amount);
  if (!amount || isNaN(numAmount) || numAmount <= 0) return respond(res, 400, { error: "Montant invalide." });

  const fcfaAmount = Number(amount_fcfa) || numAmount;
  if (fcfaAmount < AMOUNT_MIN_FCFA) return respond(res, 400, { error: `Minimum ${AMOUNT_MIN_FCFA} FCFA.` });
  if (fcfaAmount > AMOUNT_MAX_FCFA) return respond(res, 400, { error: `Maximum ${AMOUNT_MAX_FCFA.toLocaleString()} FCFA.` });
  if (!["WAVE","CARD","CASH","BANK"].includes(payment_method)) return respond(res, 400, { error: "Méthode invalide." });
  if (status !== "pending") return respond(res, 400, { error: "Statut initial doit être 'pending'." });
  if (donor_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donor_email)) return respond(res, 400, { error: "Email invalide." });

  const supabase = createClient(supabaseUrl, serviceKey);

  // Vérifier que le dossier existe et est actif
  const { data: caseData } = await supabase.from("cases").select("id,status").eq("id", case_id).maybeSingle();
  if (!caseData) return respond(res, 404, { error: "Dossier introuvable." });
  if (caseData.status !== "COLLECTING") return respond(res, 409, { error: `Dossier non actif (${caseData.status}).` });

  const { data: donation, error: insertError } = await supabase.from("donations").insert({
    case_id,
    donor_id: donor_id || verifiedUserId || null,
    donor_name:     donor_name    ? String(donor_name).slice(0, 100)  : null,
    donor_email:    donor_email   ? String(donor_email).slice(0, 200) : null,
    amount: numAmount, amount_fcfa: fcfaAmount,
    currency: String(currency).slice(0, 10),
    payment_method, status: "pending",
    message:   message   ? String(message).slice(0, 500)   : null,
    reference: reference ? String(reference).slice(0, 100) : null,
  }).select().single();

  if (insertError) { console.error("[donate]", insertError); return respond(res, 500, { error: "Erreur enregistrement." }); }
  return respond(res, 200, { success: true, donation_id: donation.id });
}
