import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Flame, Send } from "lucide-react";
import { KvHeader } from "@/components/kineview/shell";
import { Button } from "@/components/ui/button";
import { chatEjemplo, ejerciciosHoy } from "@/lib/kineview-data";

export const Route = createFileRoute("/mi-plan")({
  head: () => ({
    meta: [
      { title: "Mi plan de hoy — KineView Continuidad" },
      {
        name: "description",
        content: "Tus ejercicios de hoy, tu racha y respuestas orientativas de KineView.",
      },
      { property: "og:title", content: "Mi plan de hoy — KineView Continuidad" },
      {
        property: "og:description",
        content: "Plan de ejercicios diario y apoyo entre controles con tu kinesiólogo.",
      },
    ],
  }),
  component: VistaPaciente,
});

function VistaPaciente() {
  const [ejercicios, setEjercicios] = useState(ejerciciosHoy);
  const [mensaje, setMensaje] = useState("");
  const hechos = ejercicios.filter((e) => e.hecho).length;

  return (
    <div className="min-h-screen bg-background">
      <KvHeader vista="paciente" />
      <main className="mx-auto max-w-2xl space-y-7 px-5 py-8 text-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Hola, Paciente 01</h1>
            <p className="mt-1 text-muted-foreground">Este es tu plan de hoy.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl surface-ice px-5 py-3">
            <Flame className="size-7 text-electric" />
            <div>
              <p className="text-2xl font-extrabold leading-none text-navy">12 días</p>
              <p className="text-sm text-muted-foreground">de racha seguida</p>
            </div>
          </div>
        </div>

        <section className="card-clinic p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Ejercicios de hoy</h2>
            <span className="text-base font-semibold text-electric">
              {hechos} de {ejercicios.length} listos
            </span>
          </div>

          <ul className="mt-5 space-y-3">
            {ejercicios.map((e, i) => (
              <li key={e.nombre}>
                <button
                  type="button"
                  onClick={() =>
                    setEjercicios((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, hecho: !x.hecho } : x)),
                    )
                  }
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
                    e.hecho ? "border-electric surface-ice" : "border-border hover:bg-accent/40"
                  }`}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full border-2 ${
                      e.hecho
                        ? "border-electric bg-electric text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {e.hecho && <Check className="size-5" />}
                  </span>
                  <span>
                    <span className="block text-lg font-bold text-navy">{e.nombre}</span>
                    <span className="block text-base text-muted-foreground">{e.detalle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-clinic p-6">
          <h2 className="text-xl font-bold">Pregúntale a KineView</h2>
          <p className="mt-1 text-base text-muted-foreground">
            Respuestas orientativas con fuentes. Ante cualquier duda de salud, consulta a tu
            kinesiólogo.
          </p>

          <div className="mt-5 space-y-4">
            {chatEjemplo.map((m, i) => (
              <div
                key={i}
                className={m.de === "paciente" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed ${
                    m.de === "paciente"
                      ? "bg-primary text-primary-foreground"
                      : "surface-ice text-navy"
                  }`}
                >
                  <p>{m.texto}</p>
                  {"fuentes" in m && m.fuentes && (
                    <ul className="mt-3 space-y-1 border-t border-border pt-2 text-sm text-muted-foreground">
                      {m.fuentes.map((f) => (
                        <li key={f}>Fuente: {f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form
            className="mt-5 flex items-center gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              setMensaje("");
            }}
          >
            <input
              value={mensaje}
              onChange={(ev) => setMensaje(ev.target.value)}
              placeholder="Escribe tu pregunta…"
              className="h-14 flex-1 rounded-2xl border border-border px-4 text-base outline-none focus:border-electric focus:ring-2 focus:ring-ring/30"
            />
            <Button type="submit" className="h-14 rounded-2xl px-5 text-base">
              <Send className="size-5" />
              Enviar
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
