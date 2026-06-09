// /api/promote-admin.js — Promotion admin côté serveur uniquement
import { createClient } from "@supabase/supabase-js";

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
  if (!supabaseUrl || !serviceKey || !anonKey) return respond(res, 500, { error: "Config incomplète." });

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return respond(res, 401, { error: "Authentification requise." });
  const token = authHeader.slice(7);

  const { data: { user }, error: authErr } = await createClient(supabaseUrl, anonKey).auth.getUser(token);
  if (authErr || !user) return respond(res, 401, { error: "Token invalide." });

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: caller } = await supabase.from("admin_users").select("role,is_active").eq("email", user.email).maybeSingle();
  if (!caller?.is_active) return respond(res, 403, { error: "Accès refusé." });
  if (caller.role !== "super_admin") return respond(res, 403, { error: "Réservé aux super_admin." });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return respond(res, 400, { error: "Body JSON invalide." }); }

  const { action, target_user_id, target_email, target_full_name, target_role } = body || {};
  if (!["promote","demote"].includes(action)) return respond(res, 400, { error: "Action invalide." });
  if (!target_user_id || !target_email) return respond(res, 400, { error: "target_user_id et target_email requis." });
  if (target_user_id === user.id) return respond(res, 400, { error: "Impossible de modifier son propre rôle." });

  if (action === "promote") {
    const role = ["admin","super_admin","moderator","finance","support"].includes(target_role) ? target_role : "admin";
    await supabase.from("admin_users").upsert({ email: target_email, role, is_active: true, full_name: target_full_name || target_email.split("@")[0] }, { onConflict: "email" });
    await supabase.from("profiles").update({ is_admin: true }).eq("id", target_user_id);
  } else {
    await supabase.from("admin_users").update({ is_active: false }).eq("email", target_email);
    await supabase.from("profiles").update({ is_admin: false }).eq("id", target_user_id);
  }

  await supabase.from("audit_log").insert({ user_email: user.email, user_role: caller.role, action: action === "promote" ? "ADMIN_PROMOTED" : "ADMIN_DEMOTED", target: target_email }).catch(() => {});
  return respond(res, 200, { success: true });
}
