// ═══════════════════════════════════════════════════════════════════════════
// Geometría de la pose y conteo de repeticiones.
//
// Todo lo de este archivo son funciones PURAS: entran números, salen números.
// Ninguna toca la cámara, la red ni el estado de React. Eso es a propósito —
// es la única parte del sistema que se puede razonar y probar sin un teléfono
// en la mano, y es donde viven las decisiones que el kinesiólogo tiene que
// poder auditar.
//
// El ejercicio MVP es FLEXIÓN DE HOMBRO SENTADO: la persona, sentada, levanta
// el brazo hacia adelante y lo baja. Se mide el ángulo entre el tronco
// (cadera→hombro) y el brazo (hombro→codo).
// ═══════════════════════════════════════════════════════════════════════════

/** Un punto de BlazePose. x/y vienen normalizados 0-1 respecto del frame. */
export type Landmark = { x: number; y: number; z?: number; visibility?: number };

/**
 * Índices de los 33 puntos de BlazePose que nos importan.
 * Trabajamos directo con los 33 — no se mapea a los 17 de COCO — así que los
 * umbrales de más abajo están calibrados para ESTA numeración.
 */
export const PUNTO = {
  hombroIzq: 11,
  hombroDer: 12,
  codoIzq: 13,
  codoDer: 14,
  munecaIzq: 15,
  munecaDer: 16,
  caderaIzq: 23,
  caderaDer: 24,
} as const;

/** Un punto solo cuenta si el detector está razonablemente seguro de verlo. */
const VISIBILIDAD_MINIMA = 0.5;

export function esVisible(p: Landmark | undefined): p is Landmark {
  return !!p && (p.visibility === undefined || p.visibility >= VISIBILIDAD_MINIMA);
}

/**
 * Ángulo en grados en el vértice `b`, entre los segmentos b→a y b→c.
 * Devuelve null si algún punto no es confiable: preferimos no medir a medir mal.
 */
export function anguloEn(a?: Landmark, b?: Landmark, c?: Landmark): number | null {
  if (!esVisible(a) || !esVisible(b) || !esVisible(c)) return null;

  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;

  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-6 || n2 < 1e-6) return null;

  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Flexión de hombro: ángulo entre el tronco y el brazo.
 * Brazo colgando ≈ 0°; brazo horizontal al frente ≈ 90°; brazo arriba ≈ 180°.
 */
export function flexionHombro(lm: Landmark[], lado: 'izq' | 'der'): number | null {
  const cadera = lm[lado === 'izq' ? PUNTO.caderaIzq : PUNTO.caderaDer];
  const hombro = lm[lado === 'izq' ? PUNTO.hombroIzq : PUNTO.hombroDer];
  const codo = lm[lado === 'izq' ? PUNTO.codoIzq : PUNTO.codoDer];
  return anguloEn(cadera, hombro, codo);
}

/**
 * Simetría entre ambos lados, 0-100.
 * 100 = ambos brazos al mismo ángulo. Es la métrica que delata la compensación
 * con el lado sano, que es justo lo que un kinesiólogo quiere ver después de
 * un ACV.
 */
export function simetria(izq: number | null, der: number | null): number | null {
  if (izq === null || der === null) return null;
  const mayor = Math.max(izq, der);
  if (mayor < 5) return 100; // ambos brazos abajo: no hay nada que comparar
  return Math.max(0, Math.min(100, (1 - Math.abs(izq - der) / mayor) * 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// Contador de repeticiones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Umbrales con HISTÉRESIS: subir requiere pasar de 70°, bajar requiere caer de
 * 35°. La banda muerta entre ambos es lo que evita que un temblor alrededor de
 * un único umbral cuente diez repeticiones en dos segundos — que es
 * exactamente lo que le pasa a una persona con secuelas de ACV, el usuario que
 * nos importa.
 */
export const UMBRAL_ARRIBA = 70;
export const UMBRAL_ABAJO = 35;

/**
 * ⚕️ Criterio clínico de Paulina: la repetición cuenta solo si la persona
 * SOSTIENE el brazo arriba durante 3 segundos.
 *
 * No es lo mismo que "que la repetición dure 3 segundos". Lo que rehabilita es
 * el trabajo isométrico en el rango alto, no el recorrido: alguien puede subir
 * y bajar el brazo en un segundo y no haber hecho nada terapéutico. Por eso se
 * mide el tiempo con el ángulo POR ENCIMA del umbral alto, y no la duración
 * total del ciclo.
 *
 * Esto además explica el hallazgo de la primera sesión real: repeticiones de
 * 0,6 s que el contador aceptaba y que clínicamente no eran repeticiones.
 */
export const SOSTEN_MINIMO_MS = 3000;

export type MetricaRep = {
  n: number;
  rom_deg: number;
  tiempo_s: number;
  /** Segundos que la persona sostuvo el brazo arriba. Es el trabajo real. */
  sosten_s: number;
  simetria_pct: number | null;
};

export type EstadoContador = {
  fase: 'abajo' | 'arriba';
  reps: number;
  /** ROM máximo alcanzado en la repetición en curso. */
  romActual: number;
  inicioRepMs: number | null;
  /** Milisegundos acumulados con el brazo por sobre el umbral alto. */
  msSostenido: number;
  /** Marca de tiempo de la muestra anterior, para acumular el sostén. */
  ultimaMuestraMs: number | null;
  simetriasRep: number[];
  metricas: MetricaRep[];
};

export function estadoInicial(): EstadoContador {
  return {
    fase: 'abajo',
    reps: 0,
    romActual: 0,
    inicioRepMs: null,
    msSostenido: 0,
    ultimaMuestraMs: null,
    simetriasRep: [],
    metricas: [],
  };
}

/**
 * Avanza el contador con una muestra. Devuelve un estado NUEVO (no muta) para
 * que React lo trate como cambio y para que sea trivial de probar.
 *
 * `anguloActivo` es el del lado que se está ejercitando; `sim` la simetría de
 * esta muestra.
 */
export function avanzar(
  estado: EstadoContador,
  anguloActivo: number | null,
  sim: number | null,
  ahoraMs: number,
): EstadoContador {
  if (anguloActivo === null) return estado;

  const romActual = Math.max(estado.romActual, anguloActivo);
  const simetriasRep = sim === null ? estado.simetriasRep : [...estado.simetriasRep, sim];

  // El sostén se acumula muestra a muestra, no se estima al final: así el
  // número que ve la persona en pantalla es el mismo que decide si la
  // repetición vale.
  const delta = estado.ultimaMuestraMs === null
    ? 0
    : Math.min(ahoraMs - estado.ultimaMuestraMs, 500); // un salto mayor es la app dormida
  const msSostenido = anguloActivo >= UMBRAL_ARRIBA
    ? estado.msSostenido + delta
    : estado.msSostenido;

  const base = { ...estado, romActual, simetriasRep, msSostenido, ultimaMuestraMs: ahoraMs };

  // Empieza a subir: arranca el cronómetro de la repetición.
  if (estado.fase === 'abajo' && anguloActivo >= UMBRAL_ARRIBA) {
    return { ...base, fase: 'arriba', inicioRepMs: estado.inicioRepMs ?? ahoraMs };
  }

  // Vuelve abajo: se cierra el ciclo y se decide si contó.
  if (estado.fase === 'arriba' && anguloActivo <= UMBRAL_ABAJO) {
    const inicio = estado.inicioRepMs ?? ahoraMs;
    const duracionMs = ahoraMs - inicio;

    // No sostuvo los 3 segundos: el ciclo se descarta entero. Es deliberado
    // que no cuente "a medias" — media repetición no existe clínicamente, y
    // un contador indulgente le reporta al kinesiólogo un trabajo que no se
    // hizo.
    if (msSostenido < SOSTEN_MINIMO_MS) {
      return {
        ...base,
        fase: 'abajo',
        romActual: 0,
        inicioRepMs: null,
        msSostenido: 0,
        simetriasRep: [],
      };
    }

    const n = estado.reps + 1;
    const promedioSim = simetriasRep.length
      ? simetriasRep.reduce((a, b) => a + b, 0) / simetriasRep.length
      : null;

    return {
      ...base,
      fase: 'abajo',
      reps: n,
      romActual: 0,
      inicioRepMs: null,
      msSostenido: 0,
      simetriasRep: [],
      // Tope de 60: es el máximo que acepta el backend, y mandar más sería
      // enviarle al modelo ruido que no puede usar.
      metricas: estado.metricas.length >= 60
        ? estado.metricas
        : [...estado.metricas, {
            n,
            rom_deg: Math.round(romActual * 10) / 10,
            tiempo_s: Math.round((duracionMs / 1000) * 10) / 10,
            sosten_s: Math.round((msSostenido / 1000) * 10) / 10,
            simetria_pct: promedioSim === null ? null : Math.round(promedioSim * 10) / 10,
          }],
    };
  }

  return base;
}

/** Cuánto le falta para que la repetición cuente, en segundos. */
export function sostenRestanteS(estado: EstadoContador): number {
  return Math.max(0, Math.ceil((SOSTEN_MINIMO_MS - estado.msSostenido) / 1000));
}

/** Resumen de la sesión, con la forma exacta que espera la Edge Function. */
export function resumirSesion(estado: EstadoContador, duracionS: number) {
  const roms = estado.metricas.map((m) => m.rom_deg);
  const sims = estado.metricas.map((m) => m.simetria_pct).filter((s): s is number => s !== null);
  const promedio = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

  return {
    reps: estado.reps,
    rom_promedio_deg: promedio(roms),
    rom_max_deg: roms.length ? Math.max(...roms) : null,
    simetria_pct: promedio(sims),
    tiempo_bajo_tension_s: Math.round(estado.metricas.reduce((a, m) => a + m.tiempo_s, 0) * 10) / 10,
    duracion_s: Math.round(duracionS * 10) / 10,
    metricas_por_rep: estado.metricas,
  };
}
