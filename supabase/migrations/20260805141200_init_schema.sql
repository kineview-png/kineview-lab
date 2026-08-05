-- ═══════════════════════════════════════════════════════════════════════════
-- KineView · Claude Impact Lab Longevidad 2026 · Línea 03 (Continuidad)
-- Esquema base del prototipo de continuidad kinesiológica post-ACV.
--
-- Escrito dentro de la ventana válida (5 ago 2026).
-- Principio de datos: SOLO datos sintéticos o anonimizados. Ninguna columna
-- almacena PII (sin RUT, sin nombre legal, sin dirección, sin teléfono).
-- `display_name` es un alias de pantalla, no la identidad civil de nadie.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tipos
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type public.user_role as enum ('patient', 'clinician');
exception when duplicate_object then null; end $$;

-- Valores en español: son el contrato literal del tool `emitir_informe`
-- que ejecuta el agente. Un solo vocabulario del prompt a la base de datos.
do $$ begin
  create type public.triage_level as enum ('verde', 'ambar', 'rojo');
exception when duplicate_object then null; end $$;

-- Ninguna alerta nace aprobada: el agente propone, el kinesiólogo decide.
do $$ begin
  create type public.alert_status as enum ('borrador', 'revisada', 'descartada');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles — un registro por usuario autenticado
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         public.user_role not null default 'patient',
  display_name text not null default 'Paciente',
  -- Canal de adopción: el kinesiólogo entrega este código en la última sesión
  -- presencial antes del alta. El paciente lo canjea y queda vinculado.
  invite_code  text unique,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil de usuario. NO contiene PII: display_name es un alias de pantalla.';

-- Perfil automático al registrarse (evita el estado "usuario sin perfil").
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  begin
    v_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'patient');
  exception when others then
    v_role := 'patient';
  end;

  insert into public.profiles (id, display_name, role, invite_code)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Paciente'),
    v_role,
    case when v_role = 'clinician'
         then upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))
         else null end
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- care_links — qué kinesiólogo supervisa a qué paciente
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.care_links (
  id           uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.profiles(id) on delete cascade,
  patient_id   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (clinician_id, patient_id),
  constraint care_links_distinct_parties check (clinician_id <> patient_id)
);

create index if not exists care_links_clinician_idx on public.care_links (clinician_id);
create index if not exists care_links_patient_idx   on public.care_links (patient_id);

-- Helpers SECURITY DEFINER: las políticas RLS de `sessions`, `coach_reports` y
-- `alerts` necesitan leer `care_links`, que a su vez tiene RLS. Consultarla
-- directamente desde una política produce recursión infinita; encapsularla en
-- una función STABLE la corta y además la hace legible de un vistazo.
create or replace function public.is_my_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_links cl
    where cl.clinician_id = auth.uid() and cl.patient_id = p_patient
  );
$$;

create or replace function public.is_my_clinician(p_clinician uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_links cl
    where cl.patient_id = auth.uid() and cl.clinician_id = p_clinician
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- sessions — una sesión de ejercicio hecha en casa frente a la cámara
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid not null references public.profiles(id) on delete cascade,
  exercise_key         text not null,
  session_number       int,
  days_since_discharge int,

  -- Métricas agregadas ON-DEVICE por el detector de pose.
  reps                 int     not null default 0,
  rom_avg_deg          numeric(5,1),
  rom_peak_deg         numeric(5,1),
  symmetry_pct         numeric(5,1),
  time_under_tension_s numeric(7,1),
  duration_s           numeric(7,1),

  -- Reportado por la persona (escala EVA 0-10).
  pain_pre             smallint check (pain_pre  between 0 and 10),
  pain_post            smallint check (pain_post between 0 and 10),
  symptoms             text[] not null default '{}',

  -- Una fila por repetición, NUNCA landmarks crudos. El video y los 33 puntos
  -- no salen del teléfono: la agregación ocurre on-device, donde ya corre
  -- BlazePose. Mandar 30 s × 30 fps × 33 puntos (2-4 MB) reventaría el límite
  -- de 2 s de CPU de las Edge Functions y costaría ~80k tokens por sesión.
  rep_metrics          jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),

  constraint sessions_rep_metrics_is_array check (jsonb_typeof(rep_metrics) = 'array'),
  constraint sessions_rep_metrics_max_60   check (jsonb_array_length(rep_metrics) <= 60)
);

create index if not exists sessions_patient_created_idx
  on public.sessions (patient_id, created_at desc);

comment on column public.sessions.rep_metrics is
  'Métricas agregadas por repetición (máx 60). Nunca landmarks crudos: el video nunca sale del dispositivo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- coach_reports — la salida del agente para una sesión
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_reports (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null unique references public.sessions(id) on delete cascade,
  patient_id   uuid not null references public.profiles(id) on delete cascade,

  triage_level public.triage_level not null,
  risk_score   int not null check (risk_score between 0 and 100),

  -- Informe completo devuelto por el tool `emitir_informe` (schema estricto).
  payload      jsonb not null,

  -- Resumen del razonamiento (extended thinking, display: summarized).
  -- Alimenta el "¿por qué se levantó esta alerta?" del panel del kinesiólogo.
  reasoning_summary text,

  model        text not null,
  input_tokens  int,
  output_tokens int,
  cache_read_input_tokens     int,
  cache_creation_input_tokens int,
  latency_ms   int,
  created_at   timestamptz not null default now(),

  -- Guardrail como invariante de base de datos, no solo como instrucción del
  -- prompt: todo informe debe traer los arreglos `evidencia` y `no_se`.
  -- Que cada afirmación clínica traiga fuente se valida además en el código
  -- de la Edge Function ANTES de llegar acá.
  constraint coach_reports_has_evidence
    check (jsonb_typeof(payload -> 'evidencia') = 'array'),
  constraint coach_reports_has_no_se
    check (jsonb_typeof(payload -> 'no_se') = 'array')
);

create index if not exists coach_reports_patient_created_idx
  on public.coach_reports (patient_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- alerts — la cola priorizada del kinesiólogo
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.alerts (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.profiles(id) on delete cascade,
  session_id     uuid references public.sessions(id)      on delete set null,
  report_id      uuid references public.coach_reports(id) on delete set null,

  level          public.triage_level not null,
  title          text not null,
  reasons        text[] not null default '{}',
  red_flags      text[] not null default '{}',
  contact_within text,

  -- Humano en el circuito: nace SIEMPRE en 'borrador'.
  status         public.alert_status not null default 'borrador',
  reviewed_by    uuid references public.profiles(id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists alerts_open_idx
  on public.alerts (status, level, created_at desc);
create index if not exists alerts_patient_idx
  on public.alerts (patient_id, created_at desc);

comment on table public.alerts is
  'Alertas propuestas por el agente. Solo la Edge Function (service_role) inserta; ningún cliente puede escribir acá.';

-- Realtime: la alerta se enciende en el panel del kinesiólogo en vivo.
-- ALTER PUBLICATION no es idempotente → se comprueba antes de agregar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'alerts'
  ) then
    alter publication supabase_realtime add table public.alerts;
  end if;
end $$;
