import { Link } from "@tanstack/react-router";
import { Activity, ShieldAlert } from "lucide-react";
import type { Riesgo } from "@/lib/kineview-data";

export function KvHeader({ vista }: { vista: "panel" | "paciente" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Activity className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-extrabold text-navy">KineView</span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-cyan">
              Continuidad
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 rounded-xl surface-ice p-1 text-sm font-semibold">
          <Link
            to="/"
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              vista === "panel"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-navy"
            }`}
          >
            Panel kinesiólogo
          </Link>
          <Link
            to="/mi-plan"
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              vista === "paciente"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-navy"
            }`}
          >
            Vista paciente
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function KvBanner() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border surface-ice px-4 py-3">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-electric" />
      <p className="text-[13px] leading-relaxed text-navy">
        Este agente asiste al profesional. No diagnostica ni indica tratamiento. Toda decisión
        clínica es del kinesiólogo.
      </p>
    </div>
  );
}

const estilos: Record<Riesgo, string> = {
  alto: "bg-risk-high",
  medio: "bg-risk-mid",
  bajo: "bg-risk-low",
};

export function Semaforo({ riesgo, className = "" }: { riesgo: Riesgo; className?: string }) {
  return (
    <span className={`flex flex-col gap-1 ${className}`} aria-hidden>
      {(["alto", "medio", "bajo"] as Riesgo[]).map((nivel) => (
        <span
          key={nivel}
          className={`size-2.5 rounded-full ${
            nivel === riesgo ? estilos[nivel] : "bg-border"
          }`}
        />
      ))}
    </span>
  );
}

export function BorradorTag() {
  return (
    <span className="inline-flex items-center rounded-lg border border-risk-mid/50 bg-risk-mid/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy">
      Borrador — requiere revisión profesional
    </span>
  );
}
