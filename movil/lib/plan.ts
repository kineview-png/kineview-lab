// ═══════════════════════════════════════════════════════════════════════════
// El plan del día y el estado de la persona.
//
// Todo lo que se muestra en la pantalla de inicio sale de acá. Nada de esto
// inventa nada: la racha y las sesiones de la semana se cuentan sobre las
// filas reales, y si no hay datos se dice que no hay, en vez de mostrar un
// cero que parece un fracaso.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase';

export type Ejercicio = {
  clave: string;
  nombre: string;
  comoSeHace: string;
  porQue: string;
  repsSugeridas: number;
  segundosSosten: number;
};

/**
 * El ejercicio del MVP. Vive acá y no repartido por la app para que cambiarlo
 * —cuando Paulina decida otro— sea un solo lugar.
 */
export const EJERCICIO_DE_HOY: Ejercicio = {
  clave: 'flexion_hombro_sentado',
  nombre: 'Flexión de hombro, sentado',
  comoSeHace:
    'Siéntate derecho, con la espalda apoyada. Levanta el brazo hacia adelante tan alto como puedas sin dolor, mantenlo arriba mientras cuentas hasta tres, y bájalo despacio.',
  // Paulina: el "para qué sirve" tiene que hablar de FUNCIONALIDAD, no de
  // grados. A nadie le importa recuperar 30° de rango; le importa poder
  // vestirse solo. El ejercicio es el medio, la autonomía es el fin, y decirlo
  // así es lo que sostiene la adherencia un martes a las 8 de la mañana.
  porQue: 'Para volver a peinarte, vestirte y alcanzar cosas tú mismo.',
  repsSugeridas: 10,
  segundosSosten: 3,
};

export type LadoAfectado = 'izquierdo' | 'derecho';

export type EstadoPersona = {
  nombre: string;
  ladoAfectado: LadoAfectado | null;
  racha: number;
  sesionesEstaSemana: number;
  sesionesHoy: number;
  ultimaSesion: Date | null;
  totalSesiones: number;
};

const DIA_MS = 86_400_000;

/** Fecha local a medianoche, para comparar días sin que la hora estorbe. */
function aDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Días seguidos con al menos una sesión, contando hacia atrás desde hoy.
 * Si la última sesión fue ayer la racha sigue viva — cortarla a medianoche
 * castigaría a alguien que simplemente todavía no ejercita hoy.
 */
export function calcularRacha(fechas: Date[]): number {
  if (fechas.length === 0) return 0;
  const dias = [...new Set(fechas.map(aDia))].sort((a, b) => b - a);
  const hoy = aDia(new Date());

  if (dias[0] !== hoy && dias[0] !== hoy - DIA_MS) return 0;

  let racha = 1;
  for (let i = 1; i < dias.length; i++) {
    if (dias[i - 1] - dias[i] === DIA_MS) racha++;
    else break;
  }
  return racha;
}

export async function cargarEstado(): Promise<EstadoPersona> {
  const { data: usuario } = await supabase.auth.getUser();
  const id = usuario?.user?.id;

  const [{ data: perfil }, { data: sesiones }] = await Promise.all([
    supabase.from('profiles').select('display_name, affected_side').eq('id', id!).maybeSingle(),
    supabase
      .from('sessions')
      .select('created_at')
      .eq('patient_id', id!)
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const fechas = (sesiones ?? []).map((s: { created_at: string }) => new Date(s.created_at));
  const haceUnaSemana = Date.now() - 7 * DIA_MS;
  const hoy = aDia(new Date());

  return {
    nombre: (perfil?.display_name ?? '').split(' ')[0],
    ladoAfectado: (perfil?.affected_side as LadoAfectado | null) ?? null,
    racha: calcularRacha(fechas),
    sesionesEstaSemana: fechas.filter((f) => f.getTime() >= haceUnaSemana).length,
    sesionesHoy: fechas.filter((f) => aDia(f) === hoy).length,
    ultimaSesion: fechas[0] ?? null,
    totalSesiones: fechas.length,
  };
}

/** Una sesión al día. Es la meta que el kinesiólogo indica al alta. */
export const META_DIARIA = 1;

/** Saluda según la hora. Un "Hola" seco a las 8 de la mañana suena a formulario. */
export function saludoPorHora(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Guarda el lado con secuela en el perfil, para no volver a preguntarlo. */
export async function guardarLadoAfectado(lado: LadoAfectado): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (!id) return;
  await supabase.from('profiles').update({ affected_side: lado }).eq('id', id);
}

/** "Hoy", "Ayer", "Hace 3 días" — nadie piensa en timestamps. */
export function cuandoFue(fecha: Date | null): string {
  if (!fecha) return 'Todavía no has hecho ninguna sesión.';
  const dias = Math.floor((aDia(new Date()) - aDia(fecha)) / DIA_MS);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return `Hace ${Math.floor(dias / 7)} semana${dias >= 14 ? 's' : ''}`;
}
