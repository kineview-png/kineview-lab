-- Corrige `canjear_codigo_kine`: las columnas de salida se llamaban igual que
-- las de `care_links`, así que dentro del INSERT PL/pgSQL no sabía si
-- "clinician_id" era su parámetro de salida o la columna de la tabla y abortaba
-- con 42702 "column reference is ambiguous".
--
-- Se renombran las salidas a kine_id / kine_nombre. Además la función pasa a
-- devolver un único registro (no una tabla), que es lo que la app necesita.

drop function if exists public.canjear_codigo_kine(text);

create or replace function public.canjear_codigo_kine(p_codigo text)
returns table (kine_id uuid, kine_nombre text, ya_existia boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente uuid := auth.uid();
  v_kine     uuid;
  v_nombre   text;
  v_existia  boolean;
begin
  if v_paciente is null then
    raise exception 'No autenticado.' using errcode = '28000';
  end if;

  select p.id, p.display_name
    into v_kine, v_nombre
  from public.profiles p
  where p.role = 'clinician'
    and upper(p.invite_code) = upper(trim(p_codigo));

  if v_kine is null then
    raise exception 'Código de invitación no válido.' using errcode = 'P0002';
  end if;

  if v_kine = v_paciente then
    raise exception 'No puedes vincularte contigo mismo.' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.care_links cl
    where cl.clinician_id = v_kine and cl.patient_id = v_paciente
  ) into v_existia;

  insert into public.care_links (clinician_id, patient_id)
  values (v_kine, v_paciente)
  on conflict (clinician_id, patient_id) do nothing;

  kine_id     := v_kine;
  kine_nombre := v_nombre;
  ya_existia  := v_existia;
  return next;
end $$;

revoke all on function public.canjear_codigo_kine(text) from public, anon;
grant execute on function public.canjear_codigo_kine(text) to authenticated;
