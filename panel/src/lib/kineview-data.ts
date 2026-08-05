// Datos de ejemplo (placeholders). No corresponden a pacientes reales.
// Se reemplazan al conectar la base de datos.

export type Riesgo = "alto" | "medio" | "bajo";

export type Paciente = {
  id: string;
  nombre: string;
  motivo: string;
  diasDesdeAlta: number;
  adherenciaSemana: number;
  riesgo: Riesgo;
  ultimaAlerta: string;
  serie: { semana: string; adherencia: number; rango: number }[];
  alertas: { titulo: string; explicacion: string; fecha: string; riesgo: Riesgo }[];
};

export const pacientes: Paciente[] = [
  {
    id: "p01",
    nombre: "Paciente 01",
    motivo: "Post-ACV isquémico · hemiparesia derecha",
    diasDesdeAlta: 24,
    adherenciaSemana: 38,
    riesgo: "alto",
    ultimaAlerta: "Caída sostenida de adherencia y reporte de dolor al elevar el hombro.",
    serie: [
      { semana: "S1", adherencia: 82, rango: 74 },
      { semana: "S2", adherencia: 76, rango: 78 },
      { semana: "S3", adherencia: 58, rango: 76 },
      { semana: "S4", adherencia: 38, rango: 69 },
    ],
    alertas: [
      {
        titulo: "Adherencia bajo el umbral por dos semanas",
        explicacion:
          "El registro muestra 38% de sesiones completadas esta semana, frente a 76% dos semanas atrás. El patrón se concentra en las sesiones de la tarde.",
        fecha: "Hace 1 día",
        riesgo: "alto",
      },
      {
        titulo: "Reporte de dolor asociado a flexión de hombro",
        explicacion:
          "En tres registros consecutivos el paciente marcó dolor 6/10 al ejercicio de elevación. El rango autoreportado cayó de 78° a 69°.",
        fecha: "Hace 3 días",
        riesgo: "medio",
      },
    ],
  },
  {
    id: "p02",
    nombre: "Paciente 02",
    motivo: "Post-quirúrgico · artroplastia total de rodilla",
    diasDesdeAlta: 11,
    adherenciaSemana: 64,
    riesgo: "medio",
    ultimaAlerta: "Progresión de rango más lenta que lo esperado para el día 11.",
    serie: [
      { semana: "S1", adherencia: 70, rango: 55 },
      { semana: "S2", adherencia: 64, rango: 62 },
      { semana: "S3", adherencia: 66, rango: 66 },
      { semana: "S4", adherencia: 64, rango: 68 },
    ],
    alertas: [
      {
        titulo: "Progresión de rango bajo la curva de referencia",
        explicacion:
          "El rango autoreportado avanzó 13° en tres semanas. El paciente omite la sesión de movilidad pasiva en 4 de 7 días.",
        fecha: "Hace 2 días",
        riesgo: "medio",
      },
    ],
  },
  {
    id: "p03",
    nombre: "Paciente 03",
    motivo: "Post-ACV · marcha asistida",
    diasDesdeAlta: 47,
    adherenciaSemana: 91,
    riesgo: "bajo",
    ultimaAlerta: "Sin señales de alerta en los últimos 14 días.",
    serie: [
      { semana: "S1", adherencia: 84, rango: 70 },
      { semana: "S2", adherencia: 88, rango: 76 },
      { semana: "S3", adherencia: 90, rango: 82 },
      { semana: "S4", adherencia: 91, rango: 86 },
    ],
    alertas: [
      {
        titulo: "Sin desviaciones relevantes",
        explicacion:
          "Adherencia estable sobre 84% durante cuatro semanas y progresión de rango sostenida. No se detectan patrones que requieran contacto anticipado.",
        fecha: "Hace 5 días",
        riesgo: "bajo",
      },
    ],
  },
  {
    id: "p04",
    nombre: "Paciente 04",
    motivo: "Post-quirúrgico · manguito rotador",
    diasDesdeAlta: 6,
    adherenciaSemana: 52,
    riesgo: "medio",
    ultimaAlerta: "Registros incompletos en los últimos tres días.",
    serie: [
      { semana: "S1", adherencia: 60, rango: 42 },
      { semana: "S2", adherencia: 52, rango: 48 },
      { semana: "S3", adherencia: 52, rango: 50 },
      { semana: "S4", adherencia: 52, rango: 53 },
    ],
    alertas: [
      {
        titulo: "Registros incompletos",
        explicacion:
          "Tres días seguidos sin cierre de sesión en la app del paciente. No es posible estimar adherencia real del período.",
        fecha: "Hace 1 día",
        riesgo: "medio",
      },
    ],
  },
  {
    id: "p05",
    nombre: "Paciente 05",
    motivo: "Post-ACV · rehabilitación de miembro superior",
    diasDesdeAlta: 33,
    adherenciaSemana: 78,
    riesgo: "bajo",
    ultimaAlerta: "Adherencia estable; consulta frecuente sobre dosificación.",
    serie: [
      { semana: "S1", adherencia: 72, rango: 64 },
      { semana: "S2", adherencia: 74, rango: 68 },
      { semana: "S3", adherencia: 80, rango: 72 },
      { semana: "S4", adherencia: 78, rango: 75 },
    ],
    alertas: [
      {
        titulo: "Consultas repetidas sobre número de repeticiones",
        explicacion:
          "El paciente preguntó cuatro veces por la dosificación del ejercicio 2. Puede indicar que la indicación escrita no es clara.",
        fecha: "Hace 4 días",
        riesgo: "bajo",
      },
    ],
  },
];

const orden: Record<Riesgo, number> = { alto: 0, medio: 1, bajo: 2 };

export const colaPorRiesgo = [...pacientes].sort(
  (a, b) => orden[a.riesgo] - orden[b.riesgo] || a.adherenciaSemana - b.adherenciaSemana,
);

export const etiquetaRiesgo: Record<Riesgo, string> = {
  alto: "Riesgo alto",
  medio: "Riesgo medio",
  bajo: "Riesgo bajo",
};

export const ejerciciosHoy = [
  {
    nombre: "Movilidad de hombro asistida",
    detalle: "3 series de 10 repeticiones, con pausa de 1 minuto",
    hecho: true,
  },
  {
    nombre: "Fortalecimiento de mano con pelota",
    detalle: "2 series de 15 repeticiones, suave",
    hecho: true,
  },
  {
    nombre: "Equilibrio de pie junto a la silla",
    detalle: "4 repeticiones de 30 segundos, con apoyo cerca",
    hecho: false,
  },
  {
    nombre: "Caminata dentro de la casa",
    detalle: "10 minutos, a ritmo cómodo",
    hecho: false,
  },
];

export const chatEjemplo = [
  {
    de: "paciente" as const,
    texto: "¿Puedo hacer los ejercicios si tengo un poco de molestia en el hombro?",
  },
  {
    de: "kineview" as const,
    texto:
      "Una molestia leve que baja al terminar suele ser esperable en esta etapa. Si el dolor pasa de 5 sobre 10, si aparece de golpe o si te dura más de dos horas, detén el ejercicio y avísale a tu kinesiólogo.",
    fuentes: ["Plan indicado por tu kinesiólogo", "Guía de rehabilitación post-quirúrgica"],
  },
];
