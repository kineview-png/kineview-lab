// ═══════════════════════════════════════════════════════════════════════════
// Progreso y proyección de avance.
//
// Una proyección en salud es una afirmación, no un adorno. Decirle a alguien
// que se está recuperando de un ACV "en tres semanas vas a llegar a 120°" y
// que no ocurra tiene un costo real: abandona.
//
// Por eso acá la proyección se calcula con una regresión lineal simple —
// aritmética, auditable, sin modelo de por medio — y se NIEGA a proyectar
// cuando no hay evidencia suficiente:
//
//   · menos de 5 sesiones          → no proyecta
//   · la tendencia no explica los  → no proyecta
//     datos (R² bajo)
//   · la tendencia va a la baja    → no proyecta hacia adelante; eso lo
//                                     conversa el kinesiólogo, no una app
//
// Preferimos decir "todavía no puedo decírtelo" a inventar una promesa.
// ═══════════════════════════════════════════════════════════════════════════

export type PuntoProgreso = { fecha: Date; rom: number };

export type Proyeccion =
  | { hay: false; motivo: 'pocas_sesiones' | 'sin_tendencia' | 'a_la_baja' }
  | {
      hay: true;
      /** Grados que gana por semana según la tendencia observada. */
      porSemana: number;
      /** ROM estimado en 4 semanas si el ritmo se mantiene. */
      enCuatroSemanas: number;
      /** Qué tan bien la recta explica los datos, 0-1. */
      ajuste: number;
    };

const MINIMO_SESIONES = 5;
const AJUSTE_MINIMO = 0.35;

/**
 * Regresión lineal por mínimos cuadrados: ROM contra días transcurridos.
 * Devuelve pendiente en grados por día e intercepto.
 */
export function tendencia(
  puntos: PuntoProgreso[],
): { pendiente: number; ajuste: number } | null {
  const primero = puntos[0];
  if (!primero || puntos.length < 2) return null;

  const t0 = primero.fecha.getTime();
  const datos = puntos.map((p) => ({
    x: (p.fecha.getTime() - t0) / 86_400_000,
    y: p.rom,
  }));

  const n = datos.length;
  const mx = datos.reduce((a, d) => a + d.x, 0) / n;
  const my = datos.reduce((a, d) => a + d.y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const d of datos) {
    sxy += (d.x - mx) * (d.y - my);
    sxx += (d.x - mx) ** 2;
    syy += (d.y - my) ** 2;
  }
  // Sin variación en x (todo el mismo día) o en y (rango plano) no hay recta
  // que ajustar: R² sería 0/0.
  if (sxx === 0 || syy === 0) return null;

  return { pendiente: sxy / sxx, ajuste: (sxy * sxy) / (sxx * syy) };
}

export function proyectar(puntos: PuntoProgreso[]): Proyeccion {
  if (puntos.length < MINIMO_SESIONES) return { hay: false, motivo: 'pocas_sesiones' };

  const t = tendencia(puntos);
  if (!t || t.ajuste < AJUSTE_MINIMO) return { hay: false, motivo: 'sin_tendencia' };

  // Una tendencia a la baja no se proyecta hacia adelante. Mostrarle a la
  // persona "en cuatro semanas vas a estar peor" no ayuda a nadie: eso es
  // exactamente lo que la alerta le manda a su kinesiólogo para que él lo
  // converse.
  if (t.pendiente <= 0) return { hay: false, motivo: 'a_la_baja' };

  const ultimo = puntos[puntos.length - 1]?.rom;
  if (ultimo === undefined) return { hay: false, motivo: 'pocas_sesiones' };
  const porSemana = t.pendiente * 7;

  return {
    hay: true,
    porSemana: Math.round(porSemana * 10) / 10,
    // Tope en 180°: el hombro no pasa de ahí, y una recta sin tope proyectaría
    // 300 grados en dos meses.
    enCuatroSemanas: Math.min(180, Math.round(ultimo + porSemana * 4)),
    ajuste: Math.round(t.ajuste * 100) / 100,
  };
}

/** Cuánto ganó (o perdió) entre la primera y la última de las N más recientes. */
export function cambioReciente(puntos: PuntoProgreso[], n = 6): number | null {
  if (puntos.length < 2) return null;
  const ultimos = puntos.slice(-n);
  const fin = ultimos[ultimos.length - 1];
  const ini = ultimos[0];
  if (!fin || !ini) return null;
  return Math.round((fin.rom - ini.rom) * 10) / 10;
}

/** Frase para el paciente. En palabras, no en jerga. */
export function frasePaciente(p: Proyeccion, cambio: number | null): string {
  if (p.hay) {
    return `Vas subiendo cerca de ${p.porSemana}° por semana. Si sigues a este ritmo, en un mes tu brazo llegaría a unos ${p.enCuatroSemanas}°.`;
  }
  switch (p.motivo) {
    case 'pocas_sesiones':
      return 'Con unas pocas sesiones más vamos a poder mostrarte hacia dónde va tu progreso.';
    case 'a_la_baja':
      return 'Tu rango bajó estos días. Tu kinesiólogo ya está al tanto y te va a orientar.';
    default:
      return cambio !== null && cambio > 0
        ? `Has ganado ${cambio}° desde tus primeras sesiones. Sigue así.`
        : 'Tu progreso todavía se está estabilizando. Lo importante es no faltar.';
  }
}
