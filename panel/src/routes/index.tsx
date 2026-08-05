import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { KvBanner, KvHeader, Semaforo } from "@/components/kineview/shell";
import { BotonSalir, PortalKine, usePacientes } from "@/components/kineview/sesion";
import { etiquetaRiesgo } from "@/lib/kineview-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Panel del kinesiólogo — KineView Continuidad" },
      {
        name: "description",
        content:
          "Cola de pacientes post-ACV y post-quirúrgicos ordenada por prioridad de riesgo, con adherencia semanal y alertas del agente.",
      },
      { property: "og:title", content: "Panel del kinesiólogo — KineView Continuidad" },
      {
        property: "og:description",
        content:
          "Seguimiento a distancia: prioridad de riesgo, adherencia y alertas asistidas por IA.",
      },
    ],
  }),
  component: () => (
    <PortalKine>
      <Panel />
    </PortalKine>
  ),
});

function Panel() {
  const { pacientes, error, destello } = usePacientes();

  return (
    <div className="min-h-screen bg-background">
      <KvHeader vista="panel" />
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold">Cola de pacientes</h1>
            <p className="text-sm text-muted-foreground">
              Ordenada por prioridad de riesgo. Se actualiza sola cuando el agente levanta una
              alerta.
            </p>
          </div>
          <BotonSalir />
        </div>

        {/* El destello es el momento de la demo: la alerta entra por Realtime y
            la fila aparece sin que nadie recargue nada. */}
        {destello && (
          <div className="rounded-xl border border-electric bg-electric/10 px-4 py-3 text-sm font-semibold text-navy">
            El agente acaba de levantar una alerta.
          </div>
        )}

        <KvBanner />

        {error && (
          <p className="rounded-xl border border-border px-4 py-3 text-sm text-risk-high">
            {error}
          </p>
        )}

        <section className="overflow-hidden card-clinic">
          <div className="hidden grid-cols-[auto_1.6fr_0.7fr_0.9fr_2fr_auto] items-center gap-4 border-b border-border surface-ice px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground md:grid">
            <span className="w-2.5" aria-hidden />
            <span>Paciente</span>
            <span>Días de alta</span>
            <span>Adherencia semanal</span>
            <span>Última alerta del agente</span>
            <span />
          </div>

          {pacientes === null && (
            <p className="px-5 py-8 text-sm text-muted-foreground">Cargando pacientes…</p>
          )}

          {pacientes?.length === 0 && (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Todavía no tienes pacientes asignados. Entrégale tu código de invitación a la
              persona en su última sesión presencial y aparecerá acá cuando lo canjee.
            </p>
          )}

          <ul>
            {(pacientes ?? []).map((p) => (
              <li key={p.id} className="border-b border-border last:border-b-0">
                <Link
                  to="/paciente/$pacienteId"
                  params={{ pacienteId: p.id }}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/40 md:grid-cols-[auto_1.6fr_0.7fr_0.9fr_2fr_auto]"
                >
                  <Semaforo riesgo={p.riesgo} />

                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-navy">{p.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.motivo}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-electric md:hidden">
                      {etiquetaRiesgo[p.riesgo]} · {p.adherenciaSemana}% adherencia · día{" "}
                      {p.diasDesdeAlta}
                    </p>
                  </div>

                  <p className="hidden text-sm font-semibold text-navy md:block">
                    {p.diasDesdeAlta} días
                  </p>

                  <div className="hidden md:block">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-navy">{p.adherenciaSemana}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full bg-electric"
                        style={{ width: `${p.adherenciaSemana}%` }}
                      />
                    </div>
                  </div>

                  <p className="hidden text-[13px] leading-snug text-muted-foreground md:block">
                    {p.ultimaAlerta}
                  </p>

                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
