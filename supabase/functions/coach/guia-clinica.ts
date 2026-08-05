// ═══════════════════════════════════════════════════════════════════════════
// Guía clínica citable.
//
// ⚠️ REGLA DEL ARCHIVO: cada fragmento de acá es una cita TEXTUAL verificada
// contra el documento oficial. No se agrega ni una frase que no se haya abierto
// y confirmado en la fuente. Si el agente pregunta algo que no está acá, la
// herramienta responde "no encontrado" y el agente debe decir "no lo sé" —
// que es exactamente el comportamiento que queremos poder demostrar.
//
// Este módulo es el paso 1. El paso 2 (día 5-6) sube la GPC completa en PDF por
// Files API con `citations: {enabled: true}` y las citas las produce la propia
// API con número de página. Este archivo es el piso, no el techo.
// ═══════════════════════════════════════════════════════════════════════════

export type Fragmento = {
  id: string;
  temas: string[];
  texto: string;
  fuente: string;
  pagina: string | null;
};

export const FRAGMENTOS: Fragmento[] = [
  {
    id: "gpc-intensidad",
    temas: ["intensidad", "frecuencia", "duración", "dosis", "cuánto ejercicio", "adherencia"],
    texto:
      "La guía clínica indica 45 a 60 minutos diarios por terapia, al menos 5 días a la semana, " +
      "y subraya la continuidad de la intervención fuera de las sesiones terapéuticas.",
    fuente: "MINSAL, Guía Clínica Accidente Cerebro Vascular Isquémico en personas de 15 años y más (2013)",
    pagina: "Algoritmo 3 — Rehabilitación Precoz, Intensiva y Multidisciplinaria",
  },
  {
    id: "plan-reingreso",
    temas: ["reingreso", "recaída", "hospitalización", "abandono", "riesgo de abandono"],
    texto:
      "El 30% de las personas reingresa al hospital dentro de los primeros 90 días posteriores al alta.",
    fuente: "MINSAL, Plan de Acción Ataque Cerebrovascular (cita a Furlan, 2011)",
    pagina: null,
  },
  {
    id: "plan-dependencia",
    temas: ["dependencia", "AVD", "actividades de la vida diaria", "beneficio de rehabilitar", "autonomía"],
    texto:
      "La rehabilitación reduce la proporción de personas con alta dependencia en actividades de la " +
      "vida diaria desde un 50% a un 25%.",
    fuente: "MINSAL, Plan de Acción Ataque Cerebrovascular",
    pagina: null,
  },
  {
    id: "plan-vacio-datos",
    temas: ["acceso a rehabilitación", "cuántos acceden", "cobertura", "estadística de acceso"],
    texto:
      "Sobre cuántas personas acceden efectivamente a rehabilitación ambulatoria en Chile, el documento " +
      'declara textualmente: "En Chile no se dispone de esta información".',
    fuente: "MINSAL, Plan de Acción Ataque Cerebrovascular",
    pagina: null,
  },
  {
    id: "ges-37",
    temas: ["GES", "garantía", "plazo", "cobertura", "copago", "derecho", "FONASA"],
    texto:
      "El ACV isquémico es el problema de salud GES N°37: garantiza rehabilitación ambulatoria dentro " +
      "de 15 días desde la indicación médica, con copago 0% para beneficiarios FONASA de los tramos A a D.",
    fuente: "Superintendencia de Salud — Ataque cerebrovascular isquémico en personas de 15 años y más",
    pagina: null,
  },
  {
    id: "espera-fisiatria",
    temas: ["lista de espera", "fisiatría", "tiempo de espera", "especialidad", "demora"],
    texto:
      "Al 31 de marzo de 2026 hay 23.917 registros en lista de espera para consulta nueva de Medicina " +
      "Física y Rehabilitación en el sistema público, con una mediana de 236 días de espera para consulta " +
      "nueva de especialidad No GES.",
    fuente: "MINSAL, Glosa 06 — Informe de listas de espera, primer trimestre 2026",
    pagina: null,
  },
  {
    id: "urgencia-signos",
    temas: ["urgencia", "banderas rojas", "signos de alarma", "derivación", "nuevo evento", "FAST"],
    texto:
      "Ante debilidad o pérdida de fuerza NUEVA en cara, brazo o pierna; dificultad NUEVA para hablar o " +
      "entender; pérdida brusca de visión; dolor de cabeza súbito e intenso; dolor en el pecho; pérdida " +
      "de conciencia; o caída con golpe en la cabeza, la conducta es acudir a urgencias o llamar al SAMU 131.",
    fuente: "MINSAL — Campaña Ataque Cerebral / Guía Clínica ACV Isquémico",
    pagina: null,
  },
];

/**
 * Bloque de texto que viaja en el prefijo cacheable del system prompt.
 * Byte-idéntico entre llamadas: nada de fechas ni IDs interpolados acá, o se
 * invalida todo el prefijo y `cache_read_input_tokens` queda en 0.
 */
export const GUIA_EN_CONTEXTO: string = [
  "## Guía clínica disponible (fragmentos verificados)",
  "",
  "Estos son los ÚNICOS fragmentos que puedes citar como evidencia clínica general.",
  "Si una pregunta clínica no se responde con ninguno de ellos, no la respondas:",
  'escribe exactamente "No lo sé; consúltalo con tu kinesiólogo" y regístralo en no_se.',
  "",
  ...FRAGMENTOS.map((f) =>
    `### [${f.id}] ${f.temas.join(", ")}\n${f.texto}\nFuente: ${f.fuente}${f.pagina ? ` · ${f.pagina}` : ""}`
  ),
].join("\n");

/** Búsqueda simple por coincidencia de términos. Determinista a propósito. */
export function buscarFragmentos(consulta: string, limite = 3): Fragmento[] {
  const termino = consulta.toLowerCase().trim();
  if (termino.length < 2) return [];

  const palabras = termino.split(/\s+/).filter((p) => p.length > 3);

  const puntuados = FRAGMENTOS.map((f) => {
    const heno = [f.id, ...f.temas, f.texto].join(" ").toLowerCase();
    let puntaje = 0;
    if (heno.includes(termino)) puntaje += 10;
    for (const p of palabras) if (heno.includes(p)) puntaje += 2;
    for (const t of f.temas) if (termino.includes(t.toLowerCase())) puntaje += 5;
    return { f, puntaje };
  }).filter((x) => x.puntaje > 0);

  puntuados.sort((a, b) => b.puntaje - a.puntaje);
  return puntuados.slice(0, limite).map((x) => x.f);
}
