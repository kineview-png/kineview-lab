// ═══════════════════════════════════════════════════════════════════════════
// Sesión del kinesiólogo y carga de la cola en vivo.
//
// El acceso no es decorativo: sin sesión iniciada, las políticas RLS no
// devuelven ni una fila. La pantalla de entrada no protege los datos — los
// datos ya están protegidos en la base — solo le da a la persona la manera de
// identificarse.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { cargarPacientes, escucharAlertas, type Paciente } from "@/lib/kineview-real";
import { Button } from "@/components/ui/button";

export function useSesion() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { sesion, cargando };
}

/**
 * Carga la cola y se queda escuchando. Cuando el agente inserta una alerta,
 * Realtime dispara una recarga y la fila aparece sola — sin que nadie toque
 * el navegador. Ese es el momento que se muestra en la demo.
 */
export function usePacientes() {
  const [pacientes, setPacientes] = useState<Paciente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [destello, setDestello] = useState(false);

  const recargar = useCallback(async () => {
    try {
      setPacientes(await cargarPacientes());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "No se pudo cargar la cola.");
    }
  }, []);

  useEffect(() => {
    void recargar();
    return escucharAlertas(() => {
      setDestello(true);
      void recargar();
      setTimeout(() => setDestello(false), 2500);
    });
  }, [recargar]);

  return { pacientes, error, destello, recargar };
}

// ─────────────────────────────────────────────────────────────────────────────

export function PortalKine({ children }: { children: React.ReactNode }) {
  const { sesion, cargando } = useSesion();

  if (cargando) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  return sesion ? <>{children}</> : <Entrar />;
}

function Entrar() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });
    setOcupado(false);
    if (error) setError(error.message);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 card-clinic p-7">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-navy">KineView</h1>
          <p className="text-sm text-muted-foreground">Panel del kinesiólogo</p>
        </div>

        <input
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="Correo"
          autoComplete="username"
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-electric"
        />
        <input
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="Clave"
          autoComplete="current-password"
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-electric"
        />

        {error && <p className="text-sm text-risk-high">{error}</p>}

        <Button type="submit" disabled={ocupado} className="w-full">
          {ocupado ? "Entrando…" : "Entrar"}
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Solo verás los pacientes que tengas asignados. Es la base de datos la que lo
          impone, no esta pantalla.
        </p>
      </form>
    </div>
  );
}

export function BotonSalir() {
  return (
    <button
      onClick={() => void supabase.auth.signOut()}
      className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline"
    >
      Salir
    </button>
  );
}
