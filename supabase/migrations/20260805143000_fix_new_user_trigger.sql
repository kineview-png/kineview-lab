-- Corrige handle_new_user: `gen_random_bytes` la aporta pgcrypto, que en
-- Supabase vive en el esquema `extensions`. Con `search_path = public` la
-- función no resuelve y el trigger revienta el signup entero con un opaco
-- "Database error creating new user".
--
-- Se reemplaza por gen_random_uuid(), que es del core de Postgres desde la 13
-- y por lo tanto siempre resoluble. Un dígito hexadecimal menos de entropía a
-- cambio de no depender de dónde quedó instalada una extensión.

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
         then upper(substr(md5(gen_random_uuid()::text), 1, 6))
         else null end
  )
  on conflict (id) do nothing;

  return new;
end $$;
