-- Guarda el texto EXACTO que se le envió al agente.
--
-- Hasta ahora se guardaba solo la salida. Mostrar el input reconstruyéndolo
-- desde la fila de la sesión sería una representación fiel, pero seguiría
-- siendo una reconstrucción: si mañana cambia el formato del mensaje, la
-- pantalla mostraría algo que nunca se envió.
--
-- Con la columna, el panel puede poner lado a lado lo que entró y lo que salió,
-- y ambas cosas son el registro real de esa llamada.

alter table public.coach_reports
  add column if not exists agent_input text;

comment on column public.coach_reports.agent_input is
  'Texto literal del turno de usuario enviado al modelo. Es el input auditable de esta llamada.';
