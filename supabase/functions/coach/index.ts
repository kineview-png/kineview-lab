// ═══════════════════════════════════════════════════════════════════════════
// Edge Function `coach` — el motor del prototipo.
//
// Claude no es un adorno acá: la cámara es el SENSOR y Claude es el CEREBRO.
// Cada sesión de ejercicio terminada entra por esta función y sale como
// feedback para la persona y como triaje priorizado para su kinesiólogo.
//
// DOS RUTAS, deliberadamente distintas:
//
//   modo="feedback"  → rápida y síncrona. La persona tiene el teléfono en la
//                      mano. Modelo de gama media, sin razonamiento extendido,
//                      max_tokens chico, una sola llamada con tool forzado.
//                      De esto depende la demo en vivo.
//
//   modo="triaje"    → profunda y asíncrona. Nadie la espera mirando. Modelo
//                      grande, adaptive thinking con resumen visible, effort
//                      alto, y un bucle de herramientas: el agente consulta el
//                      historial y la guía clínica antes de puntuar el riesgo.
//
// La app llama a "feedback" y espera; dispara "triaje" sin esperar. Cuando el
// triaje termina, la alerta aparece sola en el panel del kinesiólogo (Realtime).
//
// ⚠️ Parámetros prohibidos en TODAS las llamadas: temperature, top_p, top_k y
// budget_tokens. Los modelos con adaptive thinking devuelven 400 si llegan.
// ═══════════════════════════════════════════════════════════════════════════

import Anthropic from "npm:@anthropic-ai/sdk";
import { betaZodTool } from "npm:@anthropic-ai/sdk/helpers/beta/zod";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { z } from "npm:zod@^3.25.76";

import { SYSTEM_FEEDBACK, SYSTEM_TRIAJE, BLOQUE_GUIA } from "./prompts.ts";
import { buscarFragmentos } from "./guia-clinica.ts";
import {
  EntradaSesion,
  ameritaAlerta,
  validarGuardrails,
  type Informe,
} from "./contrato.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

// Modelos SIEMPRE por variable de entorno, jamás hardcodeados: cambiar de
// modelo debe ser `supabase secrets set`, no un redeploy. Los defaults son los
// IDs que el Lab documenta; si la key acepta modelos más nuevos, se cambia la
// env var sin tocar una línea de código.
const MODEL_TRIAJE = Deno.env.get("COACH_MODEL_TRIAJE") ?? "claude-opus-4-7";
const MODEL_FEEDBACK = Deno.env.get("COACH_MODEL_FEEDBACK") ?? "claude-sonnet-4-6";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ─────────────────────────────────────────────────────────────────────────────
// Herramientas del agente (ruta profunda)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las tools se construyen por petición porque necesitan cerrar sobre el
 * paciente autenticado. El paciente NUNCA llega como parámetro del modelo:
 * viene del JWT. Así el agente no puede pedir el historial de otra persona
 * aunque el prompt intente convencerlo.
 */
function construirTools(admin: SupabaseClient, patientId: string, recolector: {
  informe?: unknown;
  historialConsultado: boolean;
  guiaConsultada: number;
}) {
  const obtener_historial_paciente = betaZodTool({
    name: "obtener_historial_paciente",
    description:
      "Devuelve las últimas sesiones registradas de esta persona, de la más reciente a la más " +
      "antigua, con sus métricas y su dolor reportado. Llámala SIEMPRE antes de asignar un nivel " +
      "de riesgo: una sesión aislada no permite triaje, la tendencia sí. Devuelve una lista vacía " +
      "si la persona no tiene sesiones previas.",
    inputSchema: z.object({
      ultimas_n: z.number().int().min(1).max(20).default(8)
        .describe("Cuántas sesiones previas traer. 8 cubre unas dos semanas de trabajo en casa."),
    }),
    run: async ({ ultimas_n }) => {
      recolector.historialConsultado = true;
      const { data, error } = await admin
        .from("sessions")
        .select(
          "created_at, exercise_key, session_number, days_since_discharge, reps, " +
            "rom_avg_deg, rom_peak_deg, symmetry_pct, pain_pre, pain_post, symptoms, duration_s",
        )
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(ultimas_n);

      if (error) return JSON.stringify({ error: error.message, sesiones: [] });
      return JSON.stringify({ sesiones: data ?? [], total: data?.length ?? 0 });
    },
  });

  const consultar_guia_clinica = betaZodTool({
    name: "consultar_guia_clinica",
    description:
      "Busca fragmentos textuales verificados de la guía clínica y los documentos oficiales del " +
      "MINSAL. Llámala antes de hacer cualquier afirmación clínica general (dosis, frecuencia, " +
      "pronóstico, garantías, signos de alarma). Devuelve el texto exacto y su fuente para que la " +
      "cites en evidencia. Si devuelve vacío, NO afirmes: dilo en no_se.",
    inputSchema: z.object({
      consulta: z.string().min(2).max(200)
        .describe("Tema a consultar, en español. Ej: 'frecuencia semanal de ejercicio', 'signos de alarma'."),
    }),
    run: ({ consulta }) => {
      recolector.guiaConsultada += 1;
      const encontrados = buscarFragmentos(consulta);
      if (encontrados.length === 0) {
        return JSON.stringify({
          encontrado: false,
          mensaje:
            "Sin respaldo en la guía cargada para esa consulta. No afirmes nada al respecto; " +
            "regístralo en no_se.",
        });
      }
      return JSON.stringify({
        encontrado: true,
        fragmentos: encontrados.map((f) => ({
          texto: f.texto,
          fuente: f.fuente,
          pagina: f.pagina,
        })),
      });
    },
  });

  const emitir_informe = betaZodTool({
    name: "emitir_informe",
    description:
      "Herramienta TERMINAL: entrega el informe completo y cierra el análisis. Llámala una sola " +
      "vez, al final, cuando ya consultaste el historial y la guía. Cada afirmación clínica general " +
      "debe aparecer en evidencia con su fuente; lo que no pudiste determinar va en no_se.",
    inputSchema: z.object({
      paciente: z.object({
        resumen: z.string(),
        lo_hiciste_bien: z.array(z.string()),
        a_corregir: z.array(z.string()),
        proxima_sesion: z.string(),
      }),
      triaje: z.object({
        nivel: z.enum(["verde", "ambar", "rojo"]),
        puntaje: z.number().int(),
        motivos: z.array(z.string()),
        banderas_rojas: z.array(z.string()),
        contactar_kine_en: z.enum(["inmediato", "24h", "72h", "proxima_sesion", "no_requiere"]),
      }),
      nota_clinica_borrador: z.object({
        subjetivo: z.string(),
        objetivo: z.string(),
        analisis: z.string(),
        plan: z.string(),
      }),
      evidencia: z.array(z.object({
        afirmacion: z.string(),
        fuente: z.string(),
        pagina: z.string().nullable().default(null),
      })),
      no_se: z.array(z.object({
        pregunta: z.string(),
        motivo: z.string(),
      })),
    }),
    run: (input) => {
      recolector.informe = input;
      return "Informe recibido. Análisis cerrado; no llames más herramientas.";
    },
  });

  return [obtener_historial_paciente, consultar_guia_clinica, emitir_informe];
}

// Esquema del tool de la ruta rápida. JSON Schema plano porque esta ruta usa el
// endpoint estable (no beta) y una sola llamada forzada — sin bucle de agente.
const TOOL_FEEDBACK = {
  name: "emitir_feedback",
  description: "Entrega el mensaje que verá la persona apenas termina su sesión.",
  input_schema: {
    type: "object" as const,
    properties: {
      resumen: { type: "string", description: "Máximo 3 frases, segunda persona, sin jerga." },
      lo_hiciste_bien: { type: "array", items: { type: "string" }, description: "Máximo 2." },
      a_corregir: { type: "array", items: { type: "string" }, description: "Máximo 2, ejecutables." },
      proxima_sesion: { type: "string" },
      derivar_urgencias: {
        type: "boolean",
        description: "true solo si hay un signo de derivación inmediata.",
      },
    },
    required: ["resumen", "lo_hiciste_bien", "a_corregir", "proxima_sesion", "derivar_urgencias"],
    additionalProperties: false,
  },
};

const Feedback = z.object({
  resumen: z.string(),
  lo_hiciste_bien: z.array(z.string()),
  a_corregir: z.array(z.string()),
  proxima_sesion: z.string(),
  derivar_urgencias: z.boolean(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Presentación de la sesión para el modelo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Todo lo VARIABLE va acá, en el turno del usuario — después del último punto
 * de cache. Si estos datos se colaran al system prompt, invalidarían el prefijo
 * en cada llamada y el caching no serviría de nada.
 */
function describirSesion(s: EntradaSesion): string {
  const dato = (etiqueta: string, valor: unknown, unidad = "") =>
    valor === null || valor === undefined ? null : `- ${etiqueta}: ${valor}${unidad}`;

  const lineas = [
    `Ejercicio: ${s.ejercicio}`,
    dato("Número de sesión desde el alta", s.numero_sesion),
    dato("Días desde el alta", s.dias_desde_alta),
    `- Repeticiones completadas: ${s.reps}`,
    dato("ROM promedio", s.rom_promedio_deg, "°"),
    dato("ROM máximo", s.rom_max_deg, "°"),
    dato("Índice de simetría", s.simetria_pct, "%"),
    dato("Tiempo bajo tensión", s.tiempo_bajo_tension_s, " s"),
    dato("Duración total", s.duracion_s, " s"),
    dato("Dolor antes (EVA 0-10)", s.dolor_pre),
    dato("Dolor después (EVA 0-10)", s.dolor_post),
    s.sintomas.length > 0
      ? `- Síntomas referidos: ${s.sintomas.join("; ")}`
      : "- Síntomas referidos: ninguno",
  ].filter(Boolean);

  if (s.metricas_por_rep.length > 0) {
    lineas.push("", "Detalle por repetición (ROM en grados, tiempo en segundos):");
    for (const r of s.metricas_por_rep) {
      lineas.push(
        `  rep ${r.n}: ROM ${r.rom_deg}° · ${r.tiempo_s}s` +
          (r.simetria_pct !== null ? ` · simetría ${r.simetria_pct}%` : ""),
      );
    }
  }

  return lineas.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY no está configurada en los secrets." }, 500);
  }

  const t0 = Date.now();

  // ── 1. Identidad: sale del JWT, NUNCA del cuerpo de la petición ────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await comoUsuario.auth.getUser();
  if (authError || !userData?.user) {
    return json({ error: "No autenticado." }, 401);
  }
  const patientId = userData.user.id;

  // Cliente administrativo: es el ÚNICO que puede escribir en `alerts`.
  // Ningún cliente autenticado tiene política de INSERT sobre esa tabla.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── 2. Validación de entrada ──────────────────────────────────────────────
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido." }, 400);
  }

  const modo = (cuerpo as { modo?: string })?.modo ?? "feedback";
  if (modo !== "feedback" && modo !== "triaje") {
    return json({ error: 'modo debe ser "feedback" o "triaje".' }, 400);
  }

  const entrada = EntradaSesion.safeParse((cuerpo as { sesion?: unknown })?.sesion);
  if (!entrada.success) {
    return json({
      error: "Métricas de sesión inválidas.",
      detalles: entrada.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    }, 400);
  }
  const sesion = entrada.data;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // RUTA RÁPIDA — la persona está esperando
    // ═══════════════════════════════════════════════════════════════════════
    if (modo === "feedback") {
      const respuesta = await anthropic.messages.create({
        model: MODEL_FEEDBACK,
        max_tokens: 1500,
        // Sin `thinking`: acá manda la latencia. El razonamiento profundo
        // ocurre en la otra ruta, donde nadie está esperando.
        output_config: { effort: "low" },
        system: [
          { type: "text", text: SYSTEM_FEEDBACK },
          // El punto de cache va al final del prefijo estable, y como `tools`
          // se renderiza antes que `system`, esto cachea tools + system juntos.
          { type: "text", text: BLOQUE_GUIA, cache_control: { type: "ephemeral" } },
        ],
        tools: [TOOL_FEEDBACK],
        tool_choice: { type: "tool", name: "emitir_feedback" },
        messages: [{
          role: "user",
          content: `Sesión recién terminada:\n\n${describirSesion(sesion)}`,
        }],
      });

      const bloque = respuesta.content.find((b) => b.type === "tool_use");
      if (!bloque || bloque.type !== "tool_use") {
        return json({ error: "El modelo no emitió feedback estructurado." }, 502);
      }

      const fb = Feedback.safeParse(bloque.input);
      if (!fb.success) {
        return json({ error: "Feedback con forma inesperada." }, 502);
      }

      return json({
        modo: "feedback",
        feedback: fb.data,
        meta: {
          modelo: respuesta.model,
          latencia_ms: Date.now() - t0,
          uso: respuesta.usage,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RUTA PROFUNDA — el kinesiólogo la verá cuando esté lista
    // ═══════════════════════════════════════════════════════════════════════

    // La sesión se persiste antes del triaje: si el modelo falla, el registro
    // de lo que la persona hizo en su casa no se pierde.
    const sessionId = await persistirSesion(admin, patientId, sesion);

    const recolector = { informe: undefined as unknown, historialConsultado: false, guiaConsultada: 0 };
    const tools = construirTools(admin, patientId, recolector);

    const runner = anthropic.beta.messages.toolRunner({
      model: MODEL_TRIAJE,
      max_tokens: 8000,
      // Extended thinking adaptativo. `display: "summarized"` devuelve el
      // resumen del razonamiento: es lo que el panel del kinesiólogo muestra
      // como "por qué se levantó esta alerta".
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
      system: [
        { type: "text", text: SYSTEM_TRIAJE },
        { type: "text", text: BLOQUE_GUIA, cache_control: { type: "ephemeral" } },
      ],
      tools,
      messages: [{
        role: "user",
        content:
          `Analiza esta sesión y emite el informe.\n\n${describirSesion(sesion)}`,
      }],
      max_iterations: 8,
    });

    // Acumulamos uso y razonamiento a lo largo del bucle de herramientas.
    let inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheCreation = 0;
    const resumenRazonamiento: string[] = [];
    let modeloUsado = MODEL_TRIAJE;

    for await (const mensaje of runner) {
      modeloUsado = mensaje.model ?? modeloUsado;
      inputTokens += mensaje.usage?.input_tokens ?? 0;
      outputTokens += mensaje.usage?.output_tokens ?? 0;
      cacheRead += mensaje.usage?.cache_read_input_tokens ?? 0;
      cacheCreation += mensaje.usage?.cache_creation_input_tokens ?? 0;

      for (const bloque of mensaje.content ?? []) {
        if (bloque.type === "thinking" && typeof bloque.thinking === "string" && bloque.thinking.trim()) {
          resumenRazonamiento.push(bloque.thinking.trim());
        }
      }
    }

    if (recolector.informe === undefined) {
      return json({
        error: "El agente terminó sin emitir informe.",
        diagnostico: { historial_consultado: recolector.historialConsultado },
      }, 502);
    }

    // ── Guardrails en código, ANTES de tocar la base ───────────────────────
    const validacion = validarGuardrails(recolector.informe);
    if (!validacion.ok) {
      // Un informe que viola un guardrail no se guarda ni se muestra. Se
      // registra el rechazo: es evidencia de que el control funciona.
      console.error("Informe rechazado por guardrails:", validacion.errores);
      return json({
        error: "El informe no pasó la validación de guardrails y fue descartado.",
        errores: validacion.errores,
      }, 422);
    }

    const informe: Informe = validacion.informe;
    const latencia = Date.now() - t0;

    // ── Persistencia del informe ──────────────────────────────────────────
    const { data: reporte, error: errReporte } = await admin
      .from("coach_reports")
      .upsert({
        session_id: sessionId,
        patient_id: patientId,
        triage_level: informe.triaje.nivel,
        risk_score: informe.triaje.puntaje,
        payload: informe,
        reasoning_summary: resumenRazonamiento.join("\n\n") || null,
        model: modeloUsado,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreation,
        latency_ms: latencia,
      }, { onConflict: "session_id" })
      .select("id")
      .single();

    if (errReporte) {
      return json({ error: `No se pudo guardar el informe: ${errReporte.message}` }, 500);
    }

    // ── La decisión de alertar la toma el CÓDIGO, no el modelo ─────────────
    let alertaId: string | null = null;
    if (ameritaAlerta(informe)) {
      const { data: alerta, error: errAlerta } = await admin
        .from("alerts")
        .insert({
          patient_id: patientId,
          session_id: sessionId,
          report_id: reporte.id,
          level: informe.triaje.nivel,
          title: informe.triaje.motivos[0] ?? "Revisión sugerida tras la última sesión",
          reasons: informe.triaje.motivos,
          red_flags: informe.triaje.banderas_rojas,
          contact_within: informe.triaje.contactar_kine_en,
          // status queda en 'borrador' por defecto: humano en el circuito.
        })
        .select("id")
        .single();

      if (errAlerta) console.error("No se pudo insertar la alerta:", errAlerta.message);
      else alertaId = alerta.id;
    }

    return json({
      modo: "triaje",
      session_id: sessionId,
      report_id: reporte.id,
      alert_id: alertaId,
      informe,
      razonamiento_resumido: resumenRazonamiento,
      meta: {
        modelo: modeloUsado,
        latencia_ms: latencia,
        historial_consultado: recolector.historialConsultado,
        consultas_a_guia: recolector.guiaConsultada,
        uso: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_read_input_tokens: cacheRead,
          cache_creation_input_tokens: cacheCreation,
        },
      },
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("coach falló:", mensaje);
    return json({ error: mensaje }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

async function persistirSesion(
  admin: SupabaseClient,
  patientId: string,
  s: EntradaSesion,
): Promise<string> {
  if (s.session_id) {
    // Verificamos que la sesión sea de quien dice ser antes de colgarle un
    // informe: el session_id llega del cliente y el cliente no es de fiar.
    const { data } = await admin
      .from("sessions")
      .select("id")
      .eq("id", s.session_id)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data, error } = await admin
    .from("sessions")
    .insert({
      patient_id: patientId,
      exercise_key: s.ejercicio,
      session_number: s.numero_sesion,
      days_since_discharge: s.dias_desde_alta,
      reps: s.reps,
      rom_avg_deg: s.rom_promedio_deg,
      rom_peak_deg: s.rom_max_deg,
      symmetry_pct: s.simetria_pct,
      time_under_tension_s: s.tiempo_bajo_tension_s,
      duration_s: s.duracion_s,
      pain_pre: s.dolor_pre,
      pain_post: s.dolor_post,
      symptoms: s.sintomas,
      rep_metrics: s.metricas_por_rep,
    })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo guardar la sesión: ${error.message}`);
  return data.id;
}
