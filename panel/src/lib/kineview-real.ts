// ═══════════════════════════════════════════════════════════════════════════
// Datos reales para el panel del kinesiólogo.
//
// Reemplaza a `kineview-data.ts` (la maqueta) conservando EXACTAMENTE sus tipos,
// para que la UI no cambie: el diseño de Paulina se queda como está y solo
// cambia de dónde salen los números.
//
// Todo lo que se lee acá pasa por RLS. Este archivo no puede ver un paciente
// que no esté asignado a quien inició sesión, aunque se lo pidiera.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "./supabase";
import type { Paciente, Riesgo } from "./kineview-data";

export type { Paciente, Riesgo };

/** El agente habla en verde/ámbar/rojo; la UI de Paulina en bajo/medio/alto. */
const RIESGO: Record<string, Riesgo> = {
  rojo: "alto",
  ambar: "medio",
  verde: "bajo",
};

const ORDEN: Record<Riesgo, number> = { alto: 0, medio: 1, bajo: 2 };

type FilaSesion = {
  patient_id: string;
  created_at: string;
  days_since_discharge: number | null;
  rom_avg_deg: number | null;
  exercise_key: string;
};

type FilaAlerta = {
  id: string;
  patient_id: string;
  level: string;
  title: string;
  reasons: string[];
  red_flags: string[];
  status: string;
  contact_within: string | null;
  created_at: string;
};

// ─────────────────────────────────────────────────────────────────────────────

function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Hace 1 día";
  return `Hace ${dias} días`;
}

/**
 * Adherencia: sesiones registradas en los últimos 7 días sobre una meta de una
 * diaria. Se topa en 100 — hacer dos sesiones un día no compensa faltar otro,
 * y presentarlo como 140% le mentiría al kinesiólogo.
 */
function adherencia7d(sesiones: FilaSesion[]): number {
  const corte = Date.now() - 7 * 86_400_000;
  const hechas = sesiones.filter((s) => new Date(s.created_at).getTime() >= corte).length;
  return Math.min(100, Math.round((hechas / 7) * 100));
}

/** Cuatro semanas hacia atrás: adherencia y ROM promedio por semana. */
function serieSemanal(sesiones: FilaSesion[]) {
  const ahora = Date.now();
  return [3, 2, 1, 0].map((atras, i) => {
    const fin = ahora - atras * 7 * 86_400_000;
    const inicio = fin - 7 * 86_400_000;
    const dentro = sesiones.filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t > inicio && t <= fin;
    });
    const roms = dentro.map((s) => s.rom_avg_deg).filter((r): r is number => r !== null);
    return {
      semana: `S${i + 1}`,
      adherencia: Math.min(100, Math.round((dentro.length / 7) * 100)),
      rango: roms.length ? Math.round(roms.reduce((a, b) => a + b, 0) / roms.length) : 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trae la cola completa. Tres consultas, no una por paciente: con RLS de por
 * medio, N+1 consultas serían N+1 evaluaciones de política.
 */
export async function cargarPacientes(): Promise<Paciente[]> {
  const { data: vinculos, error: eV } = await supabase
    .from("care_links")
    .select("patient_id, profiles!care_links_patient_id_fkey(id, display_name)");
  if (eV) throw eV;

  const ids = (vinculos ?? []).map((v: any) => v.patient_id);
  if (ids.length === 0) return [];

  const [{ data: sesiones }, { data: alertas }] = await Promise.all([
    supabase
      .from("sessions")
      .select("patient_id, created_at, days_since_discharge, rom_avg_deg, exercise_key")
      .in("patient_id", ids)
      .order("created_at", { ascending: false })
      .limit(400),
    supabase
      .from("alerts")
      .select("id, patient_id, level, title, reasons, red_flags, status, contact_within, created_at")
      .in("patient_id", ids)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const porPaciente = <T extends { patient_id: string }>(filas: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const f of filas ?? []) {
      const lista = m.get(f.patient_id) ?? [];
      lista.push(f);
      m.set(f.patient_id, lista);
    }
    return m;
  };

  const sesionesDe = porPaciente<FilaSesion>(sesiones as FilaSesion[] | null);
  const alertasDe = porPaciente<FilaAlerta>(alertas as FilaAlerta[] | null);

  const pacientes: Paciente[] = (vinculos ?? []).map((v: any) => {
    const perfil = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
    const ss = sesionesDe.get(v.patient_id) ?? [];
    const aa = alertasDe.get(v.patient_id) ?? [];

    // El riesgo lo manda la alerta abierta más grave; si no hay ninguna
    // pendiente de revisión, el paciente está en verde.
    const abiertas = aa.filter((a) => a.status === "borrador");
    const peor = abiertas.sort(
      (a, b) => ORDEN[RIESGO[a.level] ?? "bajo"] - ORDEN[RIESGO[b.level] ?? "bajo"],
    )[0];

    return {
      id: v.patient_id,
      nombre: perfil?.display_name ?? "Paciente",
      motivo: "Post-ACV · rehabilitación domiciliaria",
      diasDesdeAlta: ss[0]?.days_since_discharge ?? 0,
      adherenciaSemana: adherencia7d(ss),
      riesgo: peor ? (RIESGO[peor.level] ?? "bajo") : "bajo",
      ultimaAlerta: aa[0]?.title ?? "Sin alertas del agente.",
      serie: serieSemanal(ss),
      alertas: aa.slice(0, 6).map((a) => ({
        titulo: a.title,
        explicacion: [...(a.red_flags ?? []), ...(a.reasons ?? [])].join(" · "),
        fecha: haceCuanto(a.created_at),
        riesgo: RIESGO[a.level] ?? "bajo",
      })),
    };
  });

  return pacientes.sort((a, b) => ORDEN[a.riesgo] - ORDEN[b.riesgo]);
}

/**
 * La nota clínica que escribió el agente, en SOAP, más el resumen de su
 * razonamiento — el "por qué se levantó esta alerta" del panel.
 */
export async function cargarUltimoInforme(pacienteId: string) {
  const { data } = await supabase
    .from("coach_reports")
    .select(
      "payload, reasoning_summary, agent_input, model, created_at, triage_level, risk_score, " +
        "latency_ms, input_tokens, output_tokens, cache_read_input_tokens",
    )
    .eq("patient_id", pacienteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Marca la alerta como revisada. El trigger congela todo lo demás. */
export async function revisarAlerta(alertaId: string) {
  const { error } = await supabase
    .from("alerts")
    .update({ status: "revisada" })
    .eq("id", alertaId);
  if (error) throw error;
}

/**
 * Realtime: cuando el agente inserta una alerta, el panel se entera solo.
 * Este es el plano final de la demo — nadie recarga nada.
 */
export function escucharAlertas(alCambiar: () => void) {
  const canal = supabase
    .channel("alertas-panel")
    .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, alCambiar)
    .subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}
