# KineView — continuidad kinesiológica post-ACV

Prototipo construido para el **Claude Impact Lab · Longevidad** (Santiago, 5-6 de
agosto de 2026), línea **03 — Continuidad y Medicina de Precisión**.

> Todo el código de este repositorio se escribió dentro de la ventana válida del
> Lab. El historial de git lo demuestra.

## El problema

Tras un ataque cerebrovascular, recuperarse depende de hacer ejercicios cada día
en casa. Pero al salir del hospital nadie ve si la persona los hace ni si los
hace bien. Su kinesiólogo la vuelve a ver semanas después, cuando el retroceso ya
ocurrió.

El propio MINSAL lo escribió en su Plan de Acción de ACV: sobre cuántas personas
acceden efectivamente a rehabilitación ambulatoria en Chile, *"no se dispone de
esta información"*. Este prototipo no estima ese dato: lo genera, sesión por
sesión.

## Arquitectura

```
 App del paciente                Supabase                     Claude
 ─────────────────               ────────                     ──────
 cámara + pose 33 pts   ──►  sessions (métricas    ──►  ruta rápida (síncrona)
 on-device                    agregadas por rep)         feedback en lenguaje
 el video NUNCA sale                                     simple, 2-9 s
 del teléfono                                     
                              Edge Function `coach`  ──►  ruta profunda (asínc.)
                                                          adaptive thinking +
 Panel del kinesiólogo  ◄──  alerts (Realtime)  ◄──       effort high + tools
 cola priorizada             coach_reports               triaje, SOAP, evidencia
```

**La cámara es el sensor; Claude es el cerebro.** Cada sesión terminada produce
una llamada real a la API.

### Dos rutas, deliberadamente distintas

| | Ruta rápida | Ruta profunda |
|---|---|---|
| Quién la ve | La persona, con el teléfono en la mano | El kinesiólogo, cuando pueda |
| Razonamiento | Apagado explícitamente | `thinking: adaptive` + `display: summarized` |
| Effort | `low` | `high` |
| Herramientas | Una, forzada | Bucle de agente con 3 tools |
| Latencia medida | ~9 s | ~93 s |

El resumen del razonamiento alimenta el *"¿por qué se levantó esta alerta?"* del
panel del kinesiólogo.

### Las tres herramientas del agente

- `obtener_historial_paciente` — sin tendencia no hay triaje. «ROM 71°» no dice
  nada; «71° después de 84° y 79°» es una bandera roja.
- `consultar_guia_clinica` — fragmentos textuales verificados del MINSAL. Si no
  encuentra respaldo, el agente debe decir «no lo sé».
- `emitir_informe` — terminal, con esquema Zod estricto.

## Datos responsables, verificables en código

Estos no son promesas del prompt. Son comprobables:

| Guardrail | Dónde vive | Cómo se comprueba |
|---|---|---|
| Ninguna afirmación clínica sin fuente | `validarGuardrails()` | El informe se descarta antes de tocar la base |
| El agente propone, el profesional decide | `ameritaAlerta()` | La decisión de escribir la alerta la toma el código, no el modelo |
| Nadie escribe alertas desde un cliente | RLS, sin política de INSERT | `anon` y `authenticated` reciben 403 |
| El kine no reescribe lo que dijo el agente | trigger `alerts_freeze_agent_content` | Solo pasan `status`, `reviewed_by`, `reviewed_at` |
| El paciente no puede pedir el historial de otro | El id sale del JWT | El modelo nunca recibe un `patient_id` como parámetro |
| Sin PII | Esquema | Ninguna columna guarda RUT, nombre legal, dirección ni teléfono |
| El video no sale del teléfono | `sessions.rep_metrics`, máx. 60 filas | La agregación ocurre on-device |

## Estructura

```
supabase/
├── migrations/          esquema, políticas RLS y correcciones (en orden)
└── functions/coach/
    ├── index.ts         handler, rutas, validación, persistencia
    ├── contrato.ts      esquemas Zod + validación de guardrails
    ├── prompts.ts       system prompts (prefijo cacheable, byte-estable)
    └── guia-clinica.ts  fragmentos citables verificados
```

## Configuración

Secrets de la Edge Function:

```
ANTHROPIC_API_KEY      la clave; vive SOLO en el backend
COACH_MODEL_TRIAJE     modelo de la ruta profunda
COACH_MODEL_FEEDBACK   modelo de la ruta rápida
SB_URL                 URL del proyecto Supabase
SB_SECRET_KEY          llave secreta; nunca en el cliente
```

Los modelos se leen siempre de variable de entorno: cambiar de modelo es un
`supabase secrets set`, no un redeploy.

## Herramientas de Anthropic en uso

- **Extended Thinking** — `adaptive` + `display: summarized` en el triaje.
- **Tool use con Zod** — `betaZodTool` + `toolRunner`; el agente no devuelve
  texto libre.
- **Prompt Caching** — prefijo estable de 4.504 tokens; verificado con
  `cache_read_input_tokens > 0` en la segunda llamada.

## Licencia y datos

Solo se procesan datos sintéticos o anonimizados. Los usuarios de prueba de este
repositorio (`*@kineview.test`) son sintéticos.
