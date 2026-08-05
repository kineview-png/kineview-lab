// ═══════════════════════════════════════════════════════════════════════════
// Tendencia y proyección de avance — versión del panel.
//
// La aritmética es LA MISMA que corre en el teléfono (`movil/lib/progreso.ts`).
// Está duplicada a propósito: son dos bundlers distintos (Vite y Metro) sin
// monorepo de por medio, e importar cruzando raíces rompería los dos. Lo que
// cambia acá es solo cómo se dice: al paciente se le habla en grados y frases,
// al kinesiólogo en pendiente, R² y motivo por el que NO se proyecta.
//
// Si esto se toca, se toca en los dos lados. El día que haya workspace, se
// unifica.
// ═══════════════════════════════════════════════════════════════════════════

export type PuntoProgreso = { fecha: Date; rom: number };

export type Proyeccion =
  | { hay: false; motivo: "pocas_sesiones" | "sin_tendencia" | "a_la_baja" }
  | { hay: true; porSemana: number; enCuatroSemanas: number; ajuste: number };

export const MINIMO_SESIONES = 5;
export const AJUSTE_MINIMO = 0.35;

/** Mínimos cuadrados: ROM contra días. Pendiente en grados/día y R². */
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
  if (puntos.length < MINIMO_SESIONES) return { hay: false, motivo: "pocas_sesiones" };

  const t = tendencia(puntos);
  if (!t || t.ajuste < AJUSTE_MINIMO) return { hay: false, motivo: "sin_tendencia" };
  if (t.pendiente <= 0) return { hay: false, motivo: "a_la_baja" };

  const ultimo = puntos[puntos.length - 1]?.rom;
  if (ultimo === undefined) return { hay: false, motivo: "pocas_sesiones" };
  const porSemana = t.pendiente * 7;

  return {
    hay: true,
    porSemana: Math.round(porSemana * 10) / 10,
    enCuatroSemanas: Math.min(180, Math.round(ultimo + porSemana * 4)),
    ajuste: Math.round(t.ajuste * 100) / 100,
  };
}

/**
 * Lo que el kinesiólogo necesita leer, incluido el caso incómodo.
 *
 * Al paciente la tendencia a la baja se le suaviza; al kinesiólogo NO. Si el
 * rango está cayendo, esa es exactamente la información por la que abrió el
 * panel, y esconderla detrás de un "aún no hay datos suficientes" sería
 * inventar un problema donde ya había una respuesta.
 */
export function lecturaKine(
  puntos: PuntoProgreso[],
): { titular: string; detalle: string; tono: "alto" | "medio" | "bajo" } {
  const p = proyectar(puntos);
  const t = tendencia(puntos);

  if (p.hay) {
    return {
      titular: `+${p.porSemana}°/semana · proyecta ${p.enCuatroSemanas}° a 4 semanas`,
      detalle: `Regresión lineal sobre ${puntos.length} sesiones con rango medido. R² = ${p.ajuste}. La proyección asume que el ritmo se mantiene y se topa en 180°.`,
      tono: "bajo",
    };
  }

  if (p.motivo === "a_la_baja") {
    const porSemana = t ? Math.round(t.pendiente * 7 * 10) / 10 : 0;
    return {
      titular: `${porSemana}°/semana · tendencia a la baja`,
      detalle: `Regresión sobre ${puntos.length} sesiones, R² = ${t ? Math.round(t.ajuste * 100) / 100 : "—"}. No se proyecta hacia adelante y al paciente no se le muestra esta curva: la conversación es suya, no de la app.`,
      tono: "alto",
    };
  }

  if (p.motivo === "sin_tendencia") {
    return {
      titular: "Sin tendencia estable",
      detalle: `${puntos.length} sesiones con rango medido, pero la recta explica menos del ${Math.round(AJUSTE_MINIMO * 100)}% de la variación (R² = ${t ? Math.round(t.ajuste * 100) / 100 : "—"}). Se prefiere no proyectar antes que proyectar ruido.`,
      tono: "medio",
    };
  }

  return {
    titular: "Datos insuficientes",
    detalle: `${puntos.length} de ${MINIMO_SESIONES} sesiones con rango medido. Bajo ese mínimo no se calcula tendencia.`,
    tono: "medio",
  };
}
