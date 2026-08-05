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
  lado_afectado: 'izquierdo' | 'derecho' | null;
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
  signos_alarma: string[];
  tronco_max_deg: number | null;
  hombro_max_deg: number | null;
  reps_compensadas: number | null;
  metricas_por_rep: unknown[];
};

export type Feedback = {
  resumen: string;
  lo_hiciste_bien: string[];
  a_corregir: string[];
  proxima_sesion: string;
  derivar_urgencias: boolean;
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reintentos con espera creciente.
 *
 * No es paranoia: la sesión se hace en la casa de la persona, con la red que
 * tenga, y una caída momentánea de wifi no puede costarle el análisis del
 * ejercicio que acaba de hacer. Se reintenta solo cuando el fallo es de RED —
 * un rechazo del servidor (datos inválidos, sesión vencida) se propaga de
 * inmediato, porque repetirlo daría exactamente el mismo error tres veces.
 */
async function invocar(
  modo: 'feedback' | 'triaje',
  sesion: SesionParaCoach,
  intentos = 3,
): Promise<any> {
  let ultimo: unknown;

  for (let i = 0; i < intentos; i++) {
    try {
      const { data, error } = await supabase.functions.invoke('coach', {
        body: { modo, sesion },
      });
      if (!error) return data;

      // `FunctionsFetchError` es el fetch que ni siquiera salió: eso sí se
      // reintenta. Un `FunctionsHttpError` ya llegó al servidor y volvió con
      // un veredicto.
      const esDeRed = error.name === 'FunctionsFetchError' ||
        /failed to send|network|fetch/i.test(error.message ?? '');
      if (!esDeRed) throw error;
      ultimo = error;
    } catch (e: any) {
      const esDeRed = /failed to send|network|fetch|timeout/i.test(e?.message ?? '');
      if (!esDeRed) throw e;
      ultimo = e;
    }

    if (i < intentos - 1) await esperar(1200 * (i + 1));
  }

  throw ultimo ?? new Error('No se pudo contactar al servidor.');
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
 * sesión al paciente, así que se registra y se sigue — pero con más reintentos
 * que el feedback, porque nadie está mirando para volver a intentarlo a mano y
 * lo que se pierde es la alerta del kinesiólogo.
 */
export function dispararTriaje(sesion: SesionParaCoach): void {
  invocar('triaje', sesion, 4).catch((e) => {
    console.warn('[coach] el triaje falló tras reintentar:', e?.message ?? e);
  });
}
