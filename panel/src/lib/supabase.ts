import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

if (!url || !key) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_KEY. Copia .env.example a .env.",
  );
}

/**
 * Llave `publishable`: va en el cliente a propósito. Por sí sola no puede leer
 * nada — las políticas RLS solo dejan ver los pacientes que este kinesiólogo
 * tiene asignados, y `alerts` no tiene política de INSERT para nadie que no sea
 * la Edge Function. La llave secreta no aparece en este proyecto.
 */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
