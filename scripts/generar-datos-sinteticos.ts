// ═══════════════════════════════════════════════════════════════════════════
// Generador de historia clínica sintética — Claude Agent SDK
//
// Por qué existe: el triaje de KineView se apoya en la TENDENCIA. Un ROM de 71°
// no dice nada; 71° después de 84° y 79° es una bandera roja. Con un paciente
// de una sola sesión el agente hace lo correcto — declarar que no puede
// determinar tendencia — pero eso no demuestra el producto.
//
// Este script le pide a Claude que invente trayectorias de rehabilitación
// clínicamente plausibles y las siembra en la base. Ninguna corresponde a una
// persona real: son prospección sintética, que es lo que las bases del Lab
// permiten explícitamente.
//
// Se ejecuta LOCALMENTE, no dentro de la Edge Function: el Agent SDK es Claude
// Code empaquetado y asume Node, filesystem y subprocesos — nada de eso existe
// en Deno sobre Supabase.
//
//   npx tsx scripts/generar-datos-sinteticos.ts
// ═══════════════════════════════════════════════════════════════════════════

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SB_URL ?? 'https://gggtrgnsnvbewpwfkxqg.supabase.co';
const SUPABASE_SECRET = process.env.SB_SECRET_KEY;
const MODELO = process.env.COACH_MODEL_SINTETICO ?? 'claude-sonnet-5';

if (!SUPABASE_SECRET) {
  console.error('Falta SB_SECRET_KEY en el entorno.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET);

// ─────────────────────────────────────────────────────────────────────────────

type SesionSintetica = {
  numero_sesion: number;
  dias_desde_alta: number;
  reps: number;
  rom_promedio_deg: number;
  rom_max_deg: number;
  simetria_pct: number;
  tiempo_bajo_tension_s: number;
  duracion_s: number;
  dolor_pre: number;
  dolor_post: number;
  sintomas: string[];
};

const INSTRUCCIONES = `
Eres kinesiólogo con experiencia en rehabilitación post-ACV en Chile. Vas a
generar datos SINTÉTICOS de sesiones domiciliarias para probar un sistema de
triaje. No corresponden a ninguna persona real.

Ejercicio: flexión de hombro sentado, medido con detección de pose en el
teléfono. Se registra por sesión: repeticiones, ROM promedio y máximo en grados,
índice de simetría 0-100, tiempo bajo tensión en segundos, duración total en
segundos, dolor antes y después en escala EVA 0-10, y síntomas referidos.

Rangos realistas para una persona mayor a tres semanas del alta:
- ROM promedio entre 55° y 105°; el máximo siempre por encima del promedio.
- Simetría entre 55% y 95% (el lado afectado rinde menos).
- 8 a 15 repeticiones por sesión; duración total entre 300 y 600 segundos.
- El dolor posterior suele estar entre 0 y 3 puntos por sobre el previo.
- Los síntomas son frases cortas en español de Chile, como los diría un paciente
  ("se me cansa el brazo", "siento tirantez en el hombro"). Muchas sesiones no
  tienen ninguno: deja el arreglo vacío.

Genera la trayectoria pedida como un ÚNICO arreglo JSON, sin texto alrededor y
sin bloques de código. Cada elemento debe tener exactamente estas claves:
numero_sesion, dias_desde_alta, reps, rom_promedio_deg, rom_max_deg,
simetria_pct, tiempo_bajo_tension_s, duracion_s, dolor_pre, dolor_post, sintomas.

Los números deben moverse como se mueve un paciente de verdad: con ruido, no en
línea recta. Una buena trayectoria tiene días mejores y peores dentro de la
tendencia general.
`.trim();

const TRAYECTORIAS = {
  deterioro: `
Genera 9 sesiones, de la 1 a la 9, una cada uno o dos días desde el día 12
después del alta.

La persona mejora en las primeras cuatro sesiones y a partir de la quinta
empieza a retroceder: el ROM cae de forma sostenida en las últimas tres
sesiones, la simetría se degrada y el dolor posterior sube hasta terminar
3 o más puntos por sobre el previo en la última. Es el caso que debe hacer
sonar la alarma.`,

  buena: `
Genera 9 sesiones, de la 1 a la 9, una cada uno o dos días desde el día 12
después del alta.

La persona progresa bien: el ROM sube de forma gradual, la simetría mejora
lentamente y el dolor se mantiene bajo y estable. Es el caso que NO debe
generar ninguna alerta.`,

  abandono: `
Genera 6 sesiones, de la 1 a la 6, desde el día 10 después del alta.

La persona arranca bien pero se va espaciando: las últimas dos sesiones tienen
menos repeticiones y menor duración, y entre la quinta y la sexta pasan 8 días.
Es el caso de abandono progresivo.`,
} as const;

// ─────────────────────────────────────────────────────────────────────────────

async function pedirTrayectoria(nombre: keyof typeof TRAYECTORIAS): Promise<SesionSintetica[]> {
  console.log(`\n[${nombre}] pidiéndole la trayectoria a ${MODELO}…`);

  let texto = '';
  for await (const mensaje of query({
    prompt: `${INSTRUCCIONES}\n\n${TRAYECTORIAS[nombre]}`,
    options: {
      model: MODELO,
      // Sin herramientas: acá el agente solo tiene que razonar y devolver datos.
      // Darle acceso al disco o a bash sería superficie de ataque sin ninguna
      // ganancia.
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    if (mensaje.type === 'assistant') {
      for (const bloque of mensaje.message.content) {
        if (bloque.type === 'text') texto += bloque.text;
      }
    }
  }

  const json = texto.slice(texto.indexOf('['), texto.lastIndexOf(']') + 1);
  const sesiones = JSON.parse(json) as SesionSintetica[];
  console.log(`[${nombre}] ${sesiones.length} sesiones generadas.`);
  return sesiones;
}

/** Valida lo que devolvió el modelo. Nunca se siembra a ciegas. */
function validar(nombre: string, sesiones: SesionSintetica[]): SesionSintetica[] {
  const buenas = sesiones.filter((s) => {
    const ok =
      Number.isFinite(s.rom_promedio_deg) && s.rom_promedio_deg > 0 && s.rom_promedio_deg <= 180 &&
      s.rom_max_deg >= s.rom_promedio_deg && s.rom_max_deg <= 180 &&
      s.simetria_pct >= 0 && s.simetria_pct <= 100 &&
      s.reps > 0 && s.reps <= 100 &&
      s.dolor_pre >= 0 && s.dolor_pre <= 10 &&
      s.dolor_post >= 0 && s.dolor_post <= 10;
    if (!ok) console.warn(`[${nombre}] descartada la sesión ${s.numero_sesion}: fuera de rango.`);
    return ok;
  });
  return buenas.sort((a, b) => a.numero_sesion - b.numero_sesion);
}

async function sembrar(patientId: string, sesiones: SesionSintetica[]) {
  // Las fechas se reparten hacia atrás para que la tendencia se lea en el orden
  // correcto cuando el agente pida el historial.
  const ahora = Date.now();
  const filas = sesiones.map((s, i) => ({
    patient_id: patientId,
    exercise_key: 'flexion_hombro_sentado',
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
    symptoms: s.sintomas ?? [],
    rep_metrics: [],
    created_at: new Date(ahora - (sesiones.length - i) * 36 * 3600 * 1000).toISOString(),
  }));

  const { error } = await admin.from('sessions').insert(filas);
  if (error) throw new Error(`no se pudo sembrar: ${error.message}`);
  console.log(`  → ${filas.length} sesiones sembradas.`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const [, , correo, tipo] = process.argv;
  if (!correo || !(tipo in TRAYECTORIAS)) {
    console.error('Uso: npx tsx scripts/generar-datos-sinteticos.ts <correo> <deterioro|buena|abandono>');
    process.exit(1);
  }

  const { data: usuarios, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const usuario = usuarios.users.find((u) => u.email === correo);
  if (!usuario) throw new Error(`no existe el usuario ${correo}`);

  const sesiones = validar(tipo, await pedirTrayectoria(tipo as keyof typeof TRAYECTORIAS));
  if (sesiones.length === 0) throw new Error('el modelo no devolvió ninguna sesión válida.');

  console.table(
    sesiones.map((s) => ({
      sesión: s.numero_sesion,
      ROM: s.rom_promedio_deg,
      simetría: s.simetria_pct,
      'EVA pre→post': `${s.dolor_pre}→${s.dolor_post}`,
      reps: s.reps,
    })),
  );

  await sembrar(usuario.id, sesiones);
  console.log('\nListo. Ahora el triaje tiene tendencia sobre la cual pronunciarse.');
}

main().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
