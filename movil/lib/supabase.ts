import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_KEY. Copia .env.example a .env.',
  );
}

/**
 * Esta llave es la `publishable`, y va en el cliente a propósito: por sí sola
 * no puede hacer nada que las políticas RLS no le permitan al usuario que
 * inició sesión. La llave secreta y la de Anthropic no aparecen en ningún
 * punto de esta app — viven solo en los secrets de la Edge Function.
 */
export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // En React Native no hay URL de navegador que parsear.
    detectSessionInUrl: false,
  },
});
