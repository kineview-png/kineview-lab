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
  porQue: 'Recupera el rango del hombro y ayuda a que vuelvas a alcanzar cosas sobre tu cabeza.',
  repsSugeridas: 10,
  segundosSosten: 3,
};

export type EstadoPersona = {
  nombre: string;
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
    supabase.from('profiles').select('display_name').eq('id', id!).maybeSingle(),
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

/** "Hoy", "Ayer", "Hace 3 días" — nadie piensa en timestamps. */
export function cuandoFue(fecha: Date | null): string {
  if (!fecha) return 'Todavía no has hecho ninguna sesión.';
  const dias = Math.floor((aDia(new Date()) - aDia(fecha)) / DIA_MS);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return `Hace ${Math.floor(dias / 7)} semana${dias >= 14 ? 's' : ''}`;
}
