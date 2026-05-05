// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Génère une signed URL Supabase Storage
// ─────────────────────────────────────────────────────────────────────────────
// Permet à l'admin de visualiser un document privé (CNI, dossier médical, etc.)
// sans que le bucket soit public. La signed URL expire en 5 minutes.
//
// Body : { bucket: "medical-documents", path: "dossiers/xxx/file.pdf" }
// Header requis : Authorization: Bearer <jwt-supabase-de-l'admin>
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const ALLOWED_ORIGINS = new Set([
  "https://ayyadci.com",
  "https://www.ayyadci.com",
  "https://ayyad.vercel.app",
]);

const ALLOWED_BUCKETS = new Set(["medical-documents", "documents"]);

// Path validation : pas de path traversal, caractères raisonnables uniquement
const SAFE_PATH = /^[a-zA-Z0-9._/-]+$/;

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://ayyadci.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "Server config missing" });
  }

  // ── Vérification de l'identité de l'admin via JWT Supabase ─────────────────
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: "Unauthorized" });
    const userData = await userRes.json();
    const email = (userData?.email || "").toLowerCase();

    // Allowlist : seuls les admins déclarés peuvent demander une signed URL
    if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
      // Fallback : on vérifie aussi via la table admin_users (au cas où ADMIN_EMAILS pas configuré)
      const adminCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/admin_users?email=eq.${encodeURIComponent(email)}&is_active=eq.true&select=email`,
        { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
      );
      const rows = await adminCheck.json().catch(() => []);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // ── Validation des paramètres ────────────────────────────────────────
    const body = req.body || {};
    const bucket = String(body.bucket || "");
    const path = String(body.path || "");
    const expiresIn = Math.min(Number(body.expiresIn) || 300, 600); // 5 min par défaut, 10 min max

    if (!ALLOWED_BUCKETS.has(bucket)) return res.status(400).json({ error: "Invalid bucket" });
    if (!path || !SAFE_PATH.test(path) || path.includes("..")) return res.status(400).json({ error: "Invalid path" });
    if (path.length > 300) return res.status(400).json({ error: "Path too long" });

    // ── Génère la signed URL via Supabase Storage API ────────────────────
    const signRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ expiresIn }),
      }
    );
    const result = await signRes.json().catch(() => ({}));
    if (!signRes.ok || !result?.signedURL) {
      console.error("Sign URL error:", signRes.status, result);
      return res.status(502).json({ error: "Sign error" });
    }

    return res.status(200).json({
      url: SUPABASE_URL + result.signedURL,
      expiresIn,
    });

  } catch (err) {
    console.error("Sign URL handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
