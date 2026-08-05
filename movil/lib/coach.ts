// ═══════════════════════════════════════════════════════════════════════════
// Puente con la Edge Function `coach`.
//
// La app hace DOS llamadas al terminar una sesión y las trata muy distinto:
//
//   1. `feedback` — se espera. La persona está mirando el teléfono.
//   2. `triaje`   — NO se espera. Tarda ~1 minuto y su destinatario es el
//                   kinesiólogo, que la verá cuando abra su panel. Bloquear al
//                   paciente un minuto para producir algo que él nunca va a
//                   leer sería un error de diseño, no una optimización.
//
// ⚠️ La respuesta se lee COMPLETA, nunca en streaming: el `fetch` de React
// Native no soporta cuerpos de respuesta en streaming. Si alguna salida crece
// demasiado, se parte en dos llamadas — no se streamea.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase';

export type SesionParaCoach = {
  session_id?: string;
  ejercicio: string;
  numero_sesion?: number | null;
  dias_desde_alta?: number | null;
  reps: number;
  rom_promedio_deg: number | null;
  rom_max_deg: number | null;
  simetria_pct: number | null;
  tiempo_bajo_tension_s: number | null;
  duracion_s: number | null;
  dolor_pre: number | null;
  dolor_post: number | null;
  sintomas: string[];
  metricas_por_rep: { n: number; rom_deg: number; tiempo_s: number; simetria_pct: number | null }[];
};

export type Feedback = {
  resumen: string;
  lo_hiciste_bien: string[];
  a_corregir: string[];
  proxima_sesion: string;
  derivar_urgencias: boolean;
};

async function invocar(modo: 'feedback' | 'triaje', sesion: SesionParaCoach) {
  const { data, error } = await supabase.functions.invoke('coach', {
    body: { modo, sesion },
  });
  if (error) throw error;
  return data;
}

/** Ruta rápida. La persona espera esto. */
export async function pedirFeedback(sesion: SesionParaCoach): Promise<Feedback> {
  const data = await invocar('feedback', sesion);
  if (!data?.feedback) throw new Error('El coach no devolvió feedback.');
  return data.feedback as Feedback;
}

/**
 * Ruta profunda. Se dispara y se olvida: la petición ya salió, el servidor la
 * termina aunque la app cambie de pantalla. Un fallo acá no puede romperle la
 * sesión al paciente, así que se registra y se sigue.
 */
export function dispararTriaje(sesion: SesionParaCoach): void {
  invocar('triaje', sesion).catch((e) => {
    console.warn('[coach] el triaje falló:', e?.message ?? e);
  });
}
