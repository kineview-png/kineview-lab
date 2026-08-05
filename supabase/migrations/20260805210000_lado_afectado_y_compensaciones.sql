-- ═══════════════════════════════════════════════════════════════════════════
-- Lado afectado, compensaciones y tamizaje de signos de alarma.
--
-- Tres correcciones clínicas que pidió Paulina, y las tres cambian lo que el
-- agente puede afirmar:
--
-- 1. LADO AFECTADO. El sistema medía siempre el lado derecho, fijo en el
--    código. En una hemiparesia eso es la mitad de las veces el brazo sano:
--    se estaba midiendo, felicitando y triando el lado equivocado.
--
-- 2. COMPENSACIONES. Solo se medía simetría entre lados. Faltaban las dos
--    compensaciones que un kinesiólogo busca de verdad: inclinar el tronco y
--    encoger el hombro para "ganar" grados que el hombro no está dando.
--
-- 3. SIGNOS DE ALARMA. El prompt manda derivar si la persona "refiere"
--    debilidad nueva, dificultad para hablar, etc. Pero nada se los preguntaba:
--    el agente solo podía reaccionar si la persona los escribía por su cuenta
--    en un campo libre. Una regla de derivación que depende de que el paciente
--    adivine qué contar no es una regla de derivación.
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.body_side as enum ('izquierdo', 'derecho');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists affected_side public.body_side;

comment on column public.profiles.affected_side is
  'Lado con secuela. Lo indica la persona o su kinesiólogo; se mide SIEMPRE este lado.';

alter table public.sessions
  add column if not exists affected_side public.body_side,
  -- Peor inclinación de tronco de la sesión, en grados respecto de la vertical.
  add column if not exists trunk_lean_max_deg numeric(5,1),
  -- Peor elevación del hombro que trabaja, en grados de desnivel.
  add column if not exists shoulder_hike_max_deg numeric(5,1),
  -- Cuántas repeticiones superaron alguno de los dos umbrales.
  add column if not exists compensated_reps int,
  -- Respuestas al tamizaje de signos de derivación inmediata.
  add column if not exists alarm_signs text[] not null default '{}';

comment on column public.sessions.alarm_signs is
  'Signos de alarma que la persona marcó al terminar. Si trae alguno, el agente deriva.';
