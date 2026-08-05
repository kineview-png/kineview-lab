-- ═══════════════════════════════════════════════════════════════════════════
-- Canje del código de invitación — el canal de adopción, hecho código.
--
-- Bug que esto corrige: la política `care_links_insert_by_patient` validaba que
-- el clinician_id fuera realmente un kinesiólogo con un EXISTS sobre `profiles`.
-- Pero esa subconsulta se evalúa con los permisos del paciente, y el paciente
-- solo puede ver el perfil de un kinesiólogo con el que YA está vinculado.
-- Resultado: nadie podía crear su primer vínculo. Huevo y gallina.
--
-- Se corrige encapsulando la comprobación en una función SECURITY DEFINER, y
-- se agrega el flujo que el producto necesita de verdad: el paciente escribe el
-- código de 6 caracteres que su kinesiólogo le entregó en la última sesión
-- presencial. Nunca necesita conocer un UUID.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.es_kinesiologo(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_id and role = 'clinician'
  );
$$;

drop policy if exists care_links_insert_by_patient on public.care_links;
create policy care_links_insert_by_patient
  on public.care_links for insert to authenticated
  with check (
    patient_id = auth.uid()
    and public.es_kinesiologo(clinician_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- canjear_codigo_kine — el único camino que la app necesita
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.canjear_codigo_kine(p_codigo text)
returns table (clinician_id uuid, clinician_nombre text, ya_existia boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente  uuid := auth.uid();
  v_kine      uuid;
  v_nombre    text;
  v_existia   boolean;
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

  return query select v_kine, v_nombre, v_existia;
end $$;

revoke all on function public.canjear_codigo_kine(text) from public, anon;
grant execute on function public.canjear_codigo_kine(text) to authenticated;
