// ═══════════════════════════════════════════════════════════════════════════
// Contrato de datos del agente `coach`, en Zod.
//
// Estos schemas hacen dos trabajos a la vez:
//   1. Validan lo que entra desde el teléfono (nada de landmarks crudos).
//   2. Definen el tool `emitir_informe` — el agente no devuelve texto libre,
//      llama a una herramienta con esquema estricto. Eso es lo que convierte
//      los guardrails en algo verificable en código en vez de una promesa
//      escrita en el prompt.
// ═══════════════════════════════════════════════════════════════════════════

// Zod v4: el helper `betaZodTool` del SDK inspecciona el interno `_zod.def`,
// que solo existe en v4. Pasarle un esquema v3 falla con
// "Cannot read properties of undefined (reading 'def')".
import { z } from "npm:zod@^4.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// ENTRADA — lo que la app manda al terminar una sesión
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Métricas de UNA repetición, ya agregadas on-device.
 * El video y los 33 puntos de BlazePose nunca salen del teléfono: acá llegan
 * cuatro números por repetición, no una nube de coordenadas.
 */
export const RepMetric = z.object({
  n: z.number().int().min(1),
  rom_deg: z.number().min(0).max(360),
  tiempo_s: z.number().min(0).max(120),
  /**
   * Segundos que la persona SOSTUVO el brazo en el rango alto. Es el criterio
   * clínico que hace válida la repetición: lo que rehabilita es el trabajo
   * isométrico arriba, no el recorrido. Una repetición con `tiempo_s` alto y
   * `sosten_s` bajo es un movimiento balístico, no terapia.
   */
  sosten_s: z.number().min(0).max(120).nullable().default(null),
  simetria_pct: z.number().min(0).max(100).nullable().default(null),
});

export const EntradaSesion = z.object({
  session_id: z.string().uuid().optional(),

  ejercicio: z.string().min(1).max(80),
  numero_sesion: z.number().int().min(1).nullable().default(null),
  dias_desde_alta: z.number().int().min(0).nullable().default(null),

  reps: z.number().int().min(0).max(500),
  rom_promedio_deg: z.number().min(0).max(360).nullable().default(null),
  rom_max_deg: z.number().min(0).max(360).nullable().default(null),
  simetria_pct: z.number().min(0).max(100).nullable().default(null),
  tiempo_bajo_tension_s: z.number().min(0).nullable().default(null),
  duracion_s: z.number().min(0).nullable().default(null),

  dolor_pre: z.number().int().min(0).max(10).nullable().default(null),
  dolor_post: z.number().int().min(0).max(10).nullable().default(null),
  sintomas: z.array(z.string().max(200)).max(20).default([]),

  // Tope duro de 60: el límite de 2 s de CPU de las Edge Functions se revienta
  // solo con el JSON.parse de un arreglo grande.
  metricas_por_rep: z.array(RepMetric).max(60).default([]),
});

export type EntradaSesion = z.infer<typeof EntradaSesion>;

// ─────────────────────────────────────────────────────────────────────────────
// SALIDA — el tool `emitir_informe`
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ Sobre los topes de largo de acá abajo: son holgados a propósito.
// Un informe se rechaza por razones CLÍNICAS (afirmación sin fuente, lenguaje
// de diagnóstico dirigido al paciente, triaje incoherente), nunca por haberse
// pasado de caracteres. La concisión se pide en el prompt, que es donde
// corresponde; estos números solo atajan una salida desbocada.

export const NivelTriaje = z.enum(["verde", "ambar", "rojo"]);

/**
 * Lo que ve la PERSONA. Segunda persona, sin jerga, sin diagnóstico.
 * Deliberadamente separado de lo que ve el kinesiólogo: son dos lectores
 * distintos y mezclarlos es como se filtra lenguaje clínico a un paciente.
 */
export const BloquePaciente = z.object({
  resumen: z.string().max(900)
    .describe("Máximo 3 frases, en segunda persona, cálido, sin jerga clínica."),
  lo_hiciste_bien: z.array(z.string().max(400)).max(3)
    .describe("Máximo 2 cosas concretas que la persona hizo bien."),
  a_corregir: z.array(z.string().max(400)).max(3)
    .describe("Máximo 2 correcciones, cada una una instrucción ejecutable."),
  proxima_sesion: z.string().max(500)
    .describe("Qué hacer en la próxima sesión. Sin cambiar cargas ni progresiones."),
});

export const BloqueTriaje = z.object({
  nivel: NivelTriaje,
  puntaje: z.number().int().min(0).max(100)
    .describe("0 = sin riesgo, 100 = riesgo máximo."),
  motivos: z.array(z.string().max(700)).min(1).max(8)
    .describe("Por qué se asignó este nivel. Cada motivo apoyado en datos de la sesión o del historial."),
  banderas_rojas: z.array(z.string().max(700)).max(10)
    .describe("Signos de derivación inmediata detectados. Vacío si no hay."),
  contactar_kine_en: z.enum(["inmediato", "24h", "72h", "proxima_sesion", "no_requiere"]),
});

/**
 * Nota SOAP para el kinesiólogo. SIEMPRE borrador: el agente propone, el
 * profesional revisa, edita y firma.
 */
export const NotaClinicaBorrador = z.object({
  subjetivo: z.string().max(2500),
  objetivo: z.string().max(2500),
  analisis: z.string().max(2500),
  plan: z.string().max(2500),
});

/**
 * El guardrail hecho dato. Cada afirmación clínica general viaja con su fuente.
 * Si `fuente` viene vacía, el código RECHAZA el informe completo — no es una
 * sugerencia del prompt, es una validación que corre antes de tocar la base.
 */
export const Evidencia = z.object({
  afirmacion: z.string().max(1000),
  fuente: z.string().min(3).max(500)
    .describe("Documento y sección exactos. Nunca inventar una referencia."),
  pagina: z.string().max(300).nullable().default(null),
});

/**
 * Lo que el agente NO pudo determinar, y por qué. Un agente clínico que nunca
 * declara incertidumbre está mintiendo por omisión.
 */
export const NoSe = z.object({
  pregunta: z.string().max(600),
  motivo: z.string().max(1000),
});

export const Informe = z.object({
  paciente: BloquePaciente,
  triaje: BloqueTriaje,
  nota_clinica_borrador: NotaClinicaBorrador,
  evidencia: z.array(Evidencia).max(12),
  no_se: z.array(NoSe).max(8),
});

export type Informe = z.infer<typeof Informe>;

// ─────────────────────────────────────────────────────────────────────────────
// Validación de guardrails en código (corre DESPUÉS del modelo)
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoValidacion =
  | { ok: true; informe: Informe }
  | { ok: false; errores: string[] };

/**
 * Un guardrail que solo vive en el prompt no es demostrable ante un jurado.
 * Este sí: se le puede mostrar el código y el informe rechazado.
 */
export function validarGuardrails(candidato: unknown): ResultadoValidacion {
  const parsed = Informe.safeParse(candidato);
  if (!parsed.success) {
    return {
      ok: false,
      errores: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  const informe = parsed.data;
  const errores: string[] = [];

  // 1. Ninguna afirmación clínica sin fuente.
  informe.evidencia.forEach((e, i) => {
    if (!e.fuente || e.fuente.trim().length < 3) {
      errores.push(`evidencia[${i}]: afirmación clínica sin fuente citada.`);
    }
  });

  // 2. Un triaje rojo sin motivos ni banderas rojas es una alarma sin sustento.
  if (
    informe.triaje.nivel === "rojo" &&
    informe.triaje.motivos.length === 0 &&
    informe.triaje.banderas_rojas.length === 0
  ) {
    errores.push("triaje: nivel rojo sin motivos ni banderas rojas.");
  }

  // 3. Coherencia entre nivel y plazo de contacto: un rojo no puede esperar
  //    a la próxima sesión.
  const plazo = informe.triaje.contactar_kine_en;
  if (informe.triaje.nivel === "rojo" && (plazo === "proxima_sesion" || plazo === "no_requiere")) {
    errores.push(`triaje: nivel rojo con plazo de contacto "${plazo}".`);
  }

  // 4. Si hay banderas rojas, el contacto no puede ser diferido.
  if (informe.triaje.banderas_rojas.length > 0 && plazo !== "inmediato" && plazo !== "24h") {
    errores.push("triaje: hay banderas rojas pero el contacto no es inmediato ni en 24h.");
  }

  // 5. El mensaje al paciente no puede contener lenguaje de diagnóstico.
  //    Filtro grueso y deliberadamente conservador: prefiere un falso positivo
  //    (rechazar un informe correcto) a dejar pasar un diagnóstico al paciente.
  const textoPaciente = [
    informe.paciente.resumen,
    ...informe.paciente.lo_hiciste_bien,
    ...informe.paciente.a_corregir,
    informe.paciente.proxima_sesion,
  ].join(" ").toLowerCase();

  const prohibidas = [
    "diagnóstico", "diagnostico", "diagnostico es", "te diagnostico",
    "tienes una lesión", "tienes una lesion", "padeces",
    "aumenta la carga", "sube la carga", "baja la carga",
    "cambia tu tratamiento", "suspende el tratamiento",
  ];
  for (const termino of prohibidas) {
    if (textoPaciente.includes(termino)) {
      errores.push(`paciente: contiene lenguaje prohibido ("${termino}").`);
    }
  }

  return errores.length === 0 ? { ok: true, informe } : { ok: false, errores };
}

/**
 * La decisión de escribir una alerta la toma EL CÓDIGO, no el modelo.
 * El modelo describe el riesgo; esta función decide si eso amerita encender
 * la bandeja del kinesiólogo.
 */
export function ameritaAlerta(informe: Informe): boolean {
  if (informe.triaje.banderas_rojas.length > 0) return true;
  if (informe.triaje.nivel === "rojo") return true;
  if (informe.triaje.nivel === "ambar" && informe.triaje.puntaje >= 50) return true;
  if (informe.triaje.contactar_kine_en === "inmediato") return true;
  if (informe.triaje.contactar_kine_en === "24h") return true;
  return false;
}
