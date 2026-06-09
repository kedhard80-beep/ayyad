import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY


if (!supabaseUrl || !supabaseKey) {
  throw new Error("Variables d'environnement Supabase manquantes (VITE_SUPABASE_URL, VITE_SUPABASE_KEY)")
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Désactive le renouvellement automatique du token JWT pour éviter les
    // déconnexions forcées quand le réseau bloque temporairement Supabase
    autoRefreshToken: false,
    persistSession: true,
  }
})