-- ═══════════════════════════════════════════════════════════════════════════
-- KineView · Políticas RLS
--
-- Este archivo ES el entregable de "datos responsables": el guardrail de acceso
-- no vive en el frontend ni en una promesa del prompt, vive en la base de datos.
--
-- Las tres reglas que resumen todo:
--   1. El paciente lee y escribe SOLO sus propias sesiones.
--   2. El kinesiólogo lee SOLO los pacientes que tiene asignados.
--   3. NADIE escribe `alerts` desde un cliente — solo la Edge Function `coach`
--      con `service_role`, que salta RLS por diseño de PostgREST.
--
-- RLS se activa ANTES del primer insert: no existe ventana de tabla abierta.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles      enable row level security;
alter table public.care_links    enable row level security;
alter table public.sessions      enable row level security;
alter table public.coach_reports enable row level security;
alter table public.alerts        enable row level security;

-- Sin políticas de INSERT/UPDATE/DELETE, RLS deniega por defecto. Lo que no
-- está escrito abajo, está prohibido.

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists profiles_select_self_or_linked on public.profiles;
create policy profiles_select_self_or_linked
  on public.profiles for select to authenticated
  using (
    id = auth.uid()                 -- el propio
    or public.is_my_patient(id)     -- kine → sus pacientes
    or public.is_my_clinician(id)   -- paciente → su kinesiólogo
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Nadie inserta ni borra perfiles desde el cliente: los crea el trigger
-- `on_auth_user_created` al registrarse.

-- ─────────────────────────────────────────────────────────────────────────────
-- care_links
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists care_links_select_own on public.care_links;
create policy care_links_select_own
  on public.care_links for select to authenticated
  using (clinician_id = auth.uid() or patient_id = auth.uid());

-- El vínculo lo crea el PACIENTE al canjear el código de invitación que su
-- kinesiólogo le entregó en la sesión presencial. Nunca puede vincular a otra
-- persona: `patient_id` está forzado a su propio uid.
drop policy if exists care_links_insert_by_patient on public.care_links;
create policy care_links_insert_by_patient
  on public.care_links for insert to authenticated
  with check (
    patient_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = clinician_id and p.role = 'clinician'
    )
  );

drop policy if exists care_links_delete_own on public.care_links;
create policy care_links_delete_own
  on public.care_links for delete to authenticated
  using (clinician_id = auth.uid() or patient_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- sessions
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists sessions_select_own_or_linked on public.sessions;
create policy sessions_select_own_or_linked
  on public.sessions for select to authenticated
  using (patient_id = auth.uid() or public.is_my_patient(patient_id));

drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own
  on public.sessions for insert to authenticated
  with check (patient_id = auth.uid());

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own
  on public.sessions for update to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

-- El kinesiólogo NO puede editar ni borrar la sesión medida: es el registro
-- objetivo de lo que la persona hizo en su casa.

-- ─────────────────────────────────────────────────────────────────────────────
-- coach_reports
-- ─────────────────────────────────────────────────────────────────────────────

-- Lectura para ambos; escritura para nadie. El informe lo produce el agente y
-- lo inserta la Edge Function con `service_role`.
drop policy if exists coach_reports_select_own_or_linked on public.coach_reports;
create policy coach_reports_select_own_or_linked
  on public.coach_reports for select to authenticated
  using (patient_id = auth.uid() or public.is_my_patient(patient_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- alerts — la tabla más restringida del sistema
-- ─────────────────────────────────────────────────────────────────────────────

-- Solo el kinesiólogo tratante ve las alertas de SUS pacientes.
-- El paciente no las ve: son un artefacto de triaje clínico, y mostrarle un
-- "riesgo rojo" sin un profesional que lo interprete sería hacer justo lo que
-- el agente tiene prohibido — diagnosticar.
drop policy if exists alerts_select_by_clinician on public.alerts;
create policy alerts_select_by_clinician
  on public.alerts for select to authenticated
  using (public.is_my_patient(patient_id));

-- El kinesiólogo revisa o descarta. Es el único que cambia el estado, y solo
-- puede tocar el flujo de revisión: no puede reescribir el contenido clínico
-- que el agente propuso (eso lo garantiza el trigger de abajo).
drop policy if exists alerts_update_status_by_clinician on public.alerts;
create policy alerts_update_status_by_clinician
  on public.alerts for update to authenticated
  using (public.is_my_patient(patient_id))
  with check (public.is_my_patient(patient_id));

-- SIN política de INSERT y SIN política de DELETE:
-- ningún cliente autenticado puede crear ni borrar una alerta. Punto.

-- Congela el contenido propuesto por el agente: un cliente solo puede mover
-- `status`, `reviewed_by` y `reviewed_at`. Sin esto, la política de UPDATE
-- dejaría al kinesiólogo reescribir los motivos de la alerta y el registro
-- perdería su valor como evidencia de lo que el agente realmente dijo.
create or replace function public.alerts_freeze_agent_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;  -- la Edge Function sí puede escribir el contenido
  end if;

  new.id             := old.id;
  new.patient_id     := old.patient_id;
  new.session_id     := old.session_id;
  new.report_id      := old.report_id;
  new.level          := old.level;
  new.title          := old.title;
  new.reasons        := old.reasons;
  new.red_flags      := old.red_flags;
  new.contact_within := old.contact_within;
  new.created_at     := old.created_at;

  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;

  return new;
end $$;

drop trigger if exists alerts_freeze_agent_content_trg on public.alerts;
create trigger alerts_freeze_agent_content_trg
  before update on public.alerts
  for each row execute function public.alerts_freeze_agent_content();

-- ─────────────────────────────────────────────────────────────────────────────
-- Superficie pública mínima
-- ─────────────────────────────────────────────────────────────────────────────

-- `anon` (usuario sin autenticar) no toca nada. Sin esto, PostgREST le concede
-- el GRANT por defecto y solo RLS lo frena; acá se cierra también el GRANT.
revoke all on public.profiles, public.care_links, public.sessions,
              public.coach_reports, public.alerts
  from anon;
