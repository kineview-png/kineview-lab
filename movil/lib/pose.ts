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
// Compensaciones
//
// Pregunta de Paulina: "¿cómo se medirán las compensaciones?". Hasta ahora solo
// se medía la SIMETRÍA entre lados, que detecta que el brazo sano hace más —
// pero no ve las dos compensaciones que un kinesiólogo busca de verdad cuando
// alguien post-ACV eleva el hombro:
//
//   1. Inclinación del tronco: la persona se ladea para "ganar" grados en vez
//      de moverlos desde el hombro.
//   2. Elevación escapular: sube el hombro hacia la oreja para alcanzar más.
//
// Las dos se calculan con los 33 puntos que ya tenemos, sin nada nuevo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inclinación lateral del tronco en grados respecto de la vertical.
 * 0° es tronco derecho. Se mide entre el punto medio de las caderas y el punto
 * medio de los hombros.
 */
export function inclinacionTronco(lm: Landmark[]): number | null {
  const hi = lm[PUNTO.hombroIzq], hd = lm[PUNTO.hombroDer];
  const ci = lm[PUNTO.caderaIzq], cd = lm[PUNTO.caderaDer];
  if (!esVisible(hi) || !esVisible(hd) || !esVisible(ci) || !esVisible(cd)) return null;

  const hx = (hi.x + hd.x) / 2, hy = (hi.y + hd.y) / 2;
  const cx = (ci.x + cd.x) / 2, cy = (ci.y + cd.y) / 2;

  const dx = hx - cx;
  const dy = cy - hy; // y crece hacia abajo en coordenadas de imagen
  if (Math.abs(dy) < 1e-6) return null;

  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
}

/**
 * Elevación del hombro que trabaja respecto del otro, en grados de desnivel de
 * la línea de hombros. Positivo = el hombro activo está más alto que el
 * contrario, que es el patrón de "encogerse" para alcanzar.
 */
export function elevacionHombro(lm: Landmark[], lado: 'izq' | 'der'): number | null {
  const hi = lm[PUNTO.hombroIzq], hd = lm[PUNTO.hombroDer];
  if (!esVisible(hi) || !esVisible(hd)) return null;

  const activo = lado === 'izq' ? hi : hd;
  const otro = lado === 'izq' ? hd : hi;

  const dx = Math.abs(hd.x - hi.x);
  if (dx < 1e-6) return null;

  // Cuánto más arriba está el activo (y menor = más arriba en la imagen).
  const dy = otro.y - activo.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Umbrales por sobre los cuales el movimiento se considera compensado. */
export const TRONCO_MAX_GRADOS = 12;
export const HOMBRO_MAX_GRADOS = 8;

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
  /** Inclinación máxima del tronco durante la repetición, en grados. */
  tronco_deg: number | null;
  /** Elevación máxima del hombro que trabaja, en grados. */
  hombro_deg: number | null;
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
  /** Peor inclinación de tronco vista en la repetición en curso. */
  troncoMax: number;
  /** Peor elevación de hombro vista en la repetición en curso. */
  hombroMax: number;
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
    troncoMax: 0,
    hombroMax: 0,
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
  compensacion: { tronco: number | null; hombro: number | null } = { tronco: null, hombro: null },
): EstadoContador {
  if (anguloActivo === null) return estado;

  const romActual = Math.max(estado.romActual, anguloActivo);
  const simetriasRep = sim === null ? estado.simetriasRep : [...estado.simetriasRep, sim];
  // Se guarda el PEOR valor de la repetición, no el promedio: una compensación
  // que aparece solo al final igual es una compensación, y promediarla la
  // esconde.
  const troncoMax = Math.max(estado.troncoMax, compensacion.tronco ?? 0);
  const hombroMax = Math.max(estado.hombroMax, compensacion.hombro ?? 0);

  // El sostén se acumula muestra a muestra, no se estima al final: así el
  // número que ve la persona en pantalla es el mismo que decide si la
  // repetición vale.
  const delta = estado.ultimaMuestraMs === null
    ? 0
    : Math.min(ahoraMs - estado.ultimaMuestraMs, 500); // un salto mayor es la app dormida
  const msSostenido = anguloActivo >= UMBRAL_ARRIBA
    ? estado.msSostenido + delta
    : estado.msSostenido;

  const base = { ...estado, romActual, simetriasRep, msSostenido, ultimaMuestraMs: ahoraMs, troncoMax, hombroMax };

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
        troncoMax: 0,
        hombroMax: 0,
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
      troncoMax: 0,
      hombroMax: 0,
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
            tronco_deg: Math.round(troncoMax * 10) / 10,
            hombro_deg: Math.round(hombroMax * 10) / 10,
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

  const troncos = estado.metricas.map((m) => m.tronco_deg).filter((x): x is number => x !== null);
  const hombros = estado.metricas.map((m) => m.hombro_deg).filter((x): x is number => x !== null);

  return {
    reps: estado.reps,
    rom_promedio_deg: promedio(roms),
    tronco_max_deg: troncos.length ? Math.max(...troncos) : null,
    hombro_max_deg: hombros.length ? Math.max(...hombros) : null,
    reps_compensadas: estado.metricas.filter(
      (m) => (m.tronco_deg ?? 0) > TRONCO_MAX_GRADOS || (m.hombro_deg ?? 0) > HOMBRO_MAX_GRADOS,
    ).length,
    rom_max_deg: roms.length ? Math.max(...roms) : null,
    simetria_pct: promedio(sims),
    tiempo_bajo_tension_s: Math.round(estado.metricas.reduce((a, m) => a + m.tiempo_s, 0) * 10) / 10,
    duracion_s: Math.round(duracionS * 10) / 10,
    metricas_por_rep: estado.metricas,
  };
}
