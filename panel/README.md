# KineView Continuidad

Herramienta clínica para kinesiólogos que siguen pacientes post-ACV y
post-quirúrgicos a distancia.

**Identidad KineView:** aplicación blanca (fondo `#FFFFFF`, secciones con tinte
hielo `#F2F8FD`, nunca fondos oscuros), azul marino `#1B2A6B` para títulos, azul
eléctrico `#1E90FF` para botones y estados activos, cyan `#00CFFF` para brillos y
acentos, Plus Jakarta Sans, bordes redondeados 16px. Español de Chile, tuteo,
tono clínico sobrio (la usan profesionales, no es marketing).

## Vistas

1. **Panel del kinesiólogo** (la principal):
   - Cola de pacientes ordenada por prioridad de riesgo, con semáforo
     (rojo/ámbar/verde), nombre, días desde el alta, adherencia de la semana
     (%) y la última alerta del agente.
   - Al abrir un paciente: curva de adherencia y de rango de movimiento
     (gráfico simple), las alertas de la IA con su explicación y la etiqueta
     "BORRADOR — requiere revisión profesional", y botón "Generar borrador de
     nota clínica".
   - Banner permanente: "Este agente asiste al profesional. No diagnostica ni
     indica tratamiento. Toda decisión clínica es del kinesiólogo."
2. **Vista del paciente** (simple, letra grande, para adultos mayores):
   - Plan de ejercicios de hoy y racha.
   - Chat "Pregúntale a KineView" con la nota: "Respuestas orientativas con
     fuentes. Ante cualquier duda de salud, consulta a tu kinesiólogo."

Los datos son placeholders con nombres genéricos ("Paciente 01"). La base de
datos (Supabase) y el motor de IA (Claude) se conectan después. No se inventan
datos de pacientes reales.

## Stack

TanStack Start (React 19 + TanStack Router/Query), Vite 8, Tailwind CSS 4,
shadcn/ui sobre Radix, Recharts, Nitro para el build de servidor.

## Desarrollo

Requiere Node.js 20+ (o Bun).

```sh
npm install
npm run dev      # http://localhost:8888
```

Otros comandos:

```sh
npm run build    # build de producción
npm run preview  # sirve el build
npm run lint     # eslint
npm run format   # prettier --write .
```

El puerto del servidor de desarrollo está fijado en `vite.config.ts`
(`server.port = 8888`, `strictPort`).
