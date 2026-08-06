import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Brain } from "lucide-react";
import { BorradorTag, KvBanner, KvHeader, Semaforo } from "@/components/kineview/shell";
import { PortalKine } from "@/components/kineview/sesion";
import { etiquetaRiesgo } from "@/lib/kineview-data";
import { cargarPacientes, cargarUltimoInforme, type Paciente } from "@/lib/kineview-real";
import { lecturaKine } from "@/lib/progreso";

export const Route = createFileRoute("/paciente/$pacienteId")({
  head: () => ({
    meta: [
      { title: "Seguimiento — KineView" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Curvas de adherencia y rango de movimiento, alertas del agente y borrador de nota clínica.",
      },
    ],
  }),
  component: () => (
    <PortalKine>
      <DetallePaciente />
    </PortalKine>
  ),
});

const bordeRiesgo = {
  alto: "border-l-risk-high",
  medio: "border-l-risk-mid",
  bajo: "border-l-risk-low",
} as const;

type Informe = {
  payload: {
    nota_clinica_borrador?: { subjetivo: string; objetivo: string; analisis: string; plan: string };
    evidencia?: { afirmacion: string; fuente: string; pagina: string | null }[];
    no_se?: { pregunta: string; motivo: string }[];
    triaje?: {
      puntaje: number;
      nivel: string;
      motivos: string[];
      contactar_kine_en: string;
    };
    paciente?: { resumen: string };
  };
  reasoning_summary: string | null;
  agent_input: string | null;
  model: string;
  created_at: string;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
};

function DetallePaciente() {
  const { pacienteId } = Route.useParams();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const [todos, ultimo] = await Promise.all([
          cargarPacientes(),
          cargarUltimoInforme(pacienteId),
        ]);
        if (!vivo) return;
        setPaciente(todos.find((p) => p.id === pacienteId) ?? null);
        setInforme((ultimo as Informe | null) ?? null);
      } catch (e: any) {
        if (vivo) setError(e?.message ?? "No se pudo cargar el paciente.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pacienteId]);

  if (error) {
    return (
      <Pantalla>
        <p className="text-sm text-risk-high">{error}</p>
      </Pantalla>
    );
  }

  if (!paciente) {
    return (
      <Pantalla>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </Pantalla>
    );
  }

  const nota = informe?.payload?.nota_clinica_borrador;

  return (
    <div className="min-h-screen bg-background">
      <KvHeader vista="panel" />
      <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-electric hover:underline"
        >
          <ArrowLeft className="size-4" />
          Volver a la cola
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Semaforo riesgo={paciente.riesgo} className="mt-1.5" />
            <div>
              <h1 className="text-2xl font-extrabold">{paciente.nombre}</h1>
              <p className="text-sm text-muted-foreground">{paciente.motivo}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { k: "Días desde el alta", v: `${paciente.diasDesdeAlta}` },
              { k: "Adherencia semanal", v: `${paciente.adherenciaSemana}%` },
              { k: "Prioridad", v: etiquetaRiesgo[paciente.riesgo] },
              ...(informe?.payload?.triaje
                ? [{ k: "Puntaje de riesgo", v: `${informe.payload.triaje.puntaje}/100` }]
                : []),
            ].map((m) => (
              <div key={m.k} className="rounded-2xl surface-ice px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {m.k}
                </p>
                <p className="text-base font-extrabold text-navy">{m.v}</p>
              </div>
            ))}
          </div>
        </div>

        <KvBanner />

        {/* ─────────────────────────────────────────────────────────────────
            El agente, de entrada a salida.
            A la izquierda, el texto LITERAL que se le envió — no una
            reconstrucción: se guarda en la misma llamada que lo envía. A la
            derecha, lo que devolvió. Poder ver las dos mitades juntas es lo
            que permite auditar al agente en vez de creerle.
            ───────────────────────────────────────────────────────────────── */}
        {informe?.agent_input && (
          <section className="card-clinic overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border surface-ice px-5 py-3">
              <h2 className="text-base font-bold">El agente, de entrada a salida</h2>
              <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-muted-foreground">
                <span>{informe.model}</span>
                {informe.latency_ms != null && <span>{Math.round(informe.latency_ms / 1000)} s</span>}
                {informe.input_tokens != null && (
                  <span>
                    {informe.input_tokens.toLocaleString("es-CL")} in ·{" "}
                    {(informe.output_tokens ?? 0).toLocaleString("es-CL")} out
                  </span>
                )}
                {!!informe.cache_read_input_tokens && (
                  <span className="text-electric">
                    {informe.cache_read_input_tokens.toLocaleString("es-CL")} desde caché
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-b border-border p-5 md:border-b-0 md:border-r">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Entrada · lo que recibió
                </p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl surface-ice p-3 font-mono text-[11.5px] leading-relaxed text-navy">
                  {informe.agent_input}
                </pre>
                <p className="mt-2 text-xs text-muted-foreground">
                  Métricas agregadas en el teléfono. El video y los 33 puntos de la pose nunca
                  salieron del dispositivo.
                </p>
              </div>

              <div className="p-5">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Salida · lo que respondió
                </p>
                {informe.payload?.triaje && (
                  <>
                    <p className="text-sm font-bold text-navy">
                      Triaje {informe.payload.triaje.nivel} · {informe.payload.triaje.puntaje}/100 ·
                      contactar {informe.payload.triaje.contactar_kine_en}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {informe.payload.triaje.motivos.slice(0, 4).map((m, i) => (
                        <li key={i} className="text-[13px] leading-snug text-muted-foreground">
                          · {m}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {informe.payload?.paciente?.resumen && (
                  <div className="mt-4 rounded-xl surface-ice p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-electric">
                      Lo que leyó el paciente
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-navy">
                      {informe.payload.paciente.resumen}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="card-clinic p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">Adherencia y rango de movimiento</h2>
            <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-electric" /> Adherencia (%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-cyan" /> Rango (°)
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={paciente.serie} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="semana"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="adherencia"
                  name="Adherencia (%)"
                  stroke="var(--electric)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="rango"
                  name="Rango (°)"
                  stroke="var(--cyan)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <ProyeccionAvance paciente={paciente} />

        <section className="space-y-3">
          <h2 className="text-base font-bold">Alertas del agente</h2>
          {paciente.alertas.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin alertas registradas.</p>
          )}
          {paciente.alertas.map((a, i) => (
            <article
              key={`${a.titulo}-${i}`}
              className={`card-clinic border-l-4 p-5 ${bordeRiesgo[a.riesgo]}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold">{a.titulo}</h3>
                <span className="text-xs text-muted-foreground">{a.fecha}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.explicacion}</p>
              <div className="mt-3">
                <BorradorTag />
              </div>
            </article>
          ))}
        </section>

        {/* El resumen del razonamiento viene de `thinking: adaptive, display:
            summarized`. Es literalmente por qué el agente levantó la alerta —
            no una explicación reconstruida después. */}
        {/*
         * El "por qué" NUNCA puede quedar vacío.
         *
         * Antes esta sección dependía solo de `reasoning_summary`, que son los
         * bloques de pensamiento del modelo — y esos no siempre vienen: en una
         * corrida real el caso más grave del panel, un rojo de 88, llegó con el
         * resumen en blanco y la pantalla escondía la sección entera. Un
         * kinesiólogo abriendo su alerta más urgente y encontrando que no dice
         * por qué es exactamente lo contrario de lo que este producto promete.
         *
         * Los `motivos` del triaje son parte del informe, no del pensamiento, y
         * siempre están. Se usan de respaldo y se rotula distinto: no es lo
         * mismo el razonamiento del modelo que su conclusión, y presentarlos
         * como equivalentes sería mentir sobre la fuente.
         */}
        {(informe?.reasoning_summary || informe?.payload?.triaje?.motivos?.length) && (
          <section className="card-clinic p-5">
            <div className="mb-2 flex items-center gap-2">
              <Brain className="size-4 text-electric" />
              <h2 className="text-base font-bold">Por qué se levantó esta alerta</h2>
            </div>

            {informe?.reasoning_summary ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {informe.reasoning_summary}
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Motivos declarados por el agente
                </p>
                <ul className="space-y-2">
                  {informe!.payload!.triaje!.motivos.map((m) => (
                    <li key={m} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-electric" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section className="card-clinic p-5">
          <div className="mb-3">
            <h2 className="text-base font-bold">Nota clínica</h2>
            <p className="text-sm text-muted-foreground">
              La escribió el agente al analizar la última sesión. Requiere tu revisión y firma.
            </p>
          </div>

          {!nota && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay nota: se genera cuando el paciente completa una sesión.
            </p>
          )}

          {nota && (
            <div className="space-y-4 rounded-2xl surface-ice p-4">
              <BorradorTag />
              {[
                ["Subjetivo", nota.subjetivo],
                ["Objetivo", nota.objetivo],
                ["Análisis", nota.analisis],
                ["Plan", nota.plan],
              ].map(([titulo, cuerpo]) => (
                <div key={titulo}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-electric">
                    {titulo}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-navy">
                    {cuerpo}
                  </p>
                </div>
              ))}
              {informe && (
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                  Generada por {informe.model} el{" "}
                  {new Date(informe.created_at).toLocaleString("es-CL")}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Cada afirmación clínica con su fuente, y lo que el agente declaró no
            saber. Es el guardrail hecho pantalla: si algo no tiene respaldo, se
            ve que no lo tiene. */}
        {(informe?.payload?.evidencia?.length || informe?.payload?.no_se?.length) && (
          <section className="grid gap-4 md:grid-cols-2">
            {!!informe?.payload?.evidencia?.length && (
              <div className="card-clinic p-5">
                <h2 className="mb-3 text-base font-bold">Evidencia citada</h2>
                <ul className="space-y-3">
                  {informe.payload.evidencia.map((e, i) => (
                    <li key={i} className="text-sm">
                      <p className="text-navy">{e.afirmacion}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.fuente}
                        {e.pagina ? ` · ${e.pagina}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!informe?.payload?.no_se?.length && (
              <div className="card-clinic p-5">
                <h2 className="mb-1 text-base font-bold">Lo que el agente no puede determinar</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Queda para tu criterio profesional.
                </p>
                <ul className="space-y-3">
                  {informe.payload.no_se.map((n, i) => (
                    <li key={i} className="text-sm">
                      <p className="text-navy">{n.pregunta}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.motivo}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * Proyección de avance.
 *
 * Deliberadamente muestra el CÁLCULO y no solo el número: pendiente, R² y
 * cuántas sesiones lo sustentan. Un kinesiólogo que va a decidir sobre esto
 * necesita poder desconfiar del dato, y para desconfiar hay que ver de dónde
 * salió. Cuando no hay evidencia para proyectar, dice por qué en vez de
 * quedarse en blanco.
 */
function ProyeccionAvance({ paciente }: { paciente: Paciente }) {
  const l = lecturaKine(paciente.progreso ?? []);
  const color = {
    alto: "text-risk-high",
    medio: "text-risk-mid",
    bajo: "text-risk-low",
  }[l.tono];

  return (
    <section className="card-clinic p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">Proyección de avance</h2>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Regresión lineal · sin modelo
        </span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{l.titular}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{l.detalle}</p>
    </section>
  );
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <KvHeader vista="panel" />
      <main className="mx-auto max-w-5xl px-5 py-16">{children}</main>
    </div>
  );
}
