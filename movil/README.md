# KineView — app del paciente

Expo **SDK 53** · React Native **0.79.6** · React **19** · New Architecture.

El SDK está fijado a 53 a propósito. Es la combinación donde
`react-native-mediapipe-posedetection@0.4.0` compila con New Architecture; la
versión más reciente de Expo es SDK 57, y estrenar combinaciones no era el
riesgo que tocaba correr.

## Puesta en marcha

```bash
npm install                 # .npmrc ya fija legacy-peer-deps
npm run modelo              # baja el modelo BlazePose (5,7 MB) del CDN de Google
cp .env.example .env        # y rellenar las dos variables
npx expo prebuild --platform android --clean
npx expo run:android        # con el teléfono en depuración USB
```

Después del primer build, iterar es solo JavaScript:

```bash
npx expo start --dev-client
```

> **Expo Go no sirve.** Esta app tiene módulos nativos (cámara, detección de
> pose): necesita el dev client o un build completo.

El modelo `assets/models/pose_landmarker_lite.task` **no está versionado** — son
5,7 MB de un CDN público de Google. `npm run modelo` lo baja, y el config plugin
de `react-native-mediapipe-posedetection` lo copia a `android/app/src/main/assets/`
durante el prebuild.

## Qué hay dentro

| Archivo | Qué hace |
|---|---|
| `App.tsx` | El recorrido completo: entrar → dolor antes → sesión con cámara → dolor después → feedback |
| `lib/pose.ts` | **Funciones puras**: ángulo de flexión de hombro desde los 33 puntos, simetría entre lados, contador de repeticiones. Es la única parte auditable sin un teléfono en la mano |
| `lib/coach.ts` | Las dos llamadas a la Edge Function: `feedback` se espera, `triaje` se dispara y se olvida |
| `lib/supabase.ts` | Cliente con sesión persistida en AsyncStorage |
| `components/Boton.tsx` | Patrón anti-bug de `Pressable` (ver abajo) |

## Tres trampas que ya costaron caro

1. **`vision-camera` debe quedar en 4.x.** `expo install` instala la 5.x, que
   cambió el backend de frame processors a `react-native-worklets` y choca con
   `react-native-worklets-core` (clases C++ duplicadas en el linker). La
   librería de pose envuelve la API v4.
2. **En `babel.config.js`, el plugin de `worklets-core` va ANTES que el de
   `reanimated`.** Al revés Metro arranca igual, pero las worklets no llegan al
   frame processor y la detección falla en silencio — peor que un error de
   compilación, porque parece un problema del modelo.
3. **Reanimated se queda en 3.x.** La 4.x arrastra `react-native-worklets` y
   reproduce el choque del punto 1.

## Conteo de repeticiones

Ejercicio MVP: **flexión de hombro sentado**. Se mide el ángulo entre el tronco
(cadera→hombro) y el brazo (hombro→codo).

La repetición se cuenta con **histéresis**: sube al pasar de 70°, baja al caer
de 35°, y se descarta si dura menos de 600 ms. Esa banda muerta entre los dos
umbrales es lo que evita contar diez repeticiones por un temblor alrededor de un
único umbral — que es exactamente lo que le pasa a una persona con secuelas de
un ACV, el usuario que importa.

Los umbrales están en `lib/pose.ts` y se recalibran ahí, en un solo lugar.

## Privacidad

El video y los 33 puntos **nunca salen del teléfono**. Lo único que viaja al
backend son métricas agregadas por repetición (máximo 60 filas): repeticiones,
ROM, simetría, tiempo. La agregación ocurre en el dispositivo, donde ya corre
BlazePose.
