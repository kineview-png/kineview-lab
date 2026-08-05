// ═══════════════════════════════════════════════════════════════════════════
// KineView — app del paciente.
//
// El recorrido completo, una pantalla por vez:
//   entrar → dolor antes → sesión frente a la cámara → dolor después →
//   feedback de Claude
//
// Lo que NO pasa acá y es lo importante: el video y los 33 puntos de la pose
// nunca salen del teléfono. Lo único que viaja son números agregados por
// repetición. La cámara es el sensor; Claude es el cerebro.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView,
  RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Camera } from 'react-native-vision-camera';
import {
  Delegate, MediapipeCamera, RunningMode, usePoseDetection,
  type PoseDetectionResultBundle,
} from 'react-native-mediapipe-posedetection';
import type { Session } from '@supabase/supabase-js';

import { Boton } from './components/Boton';
import { Esqueleto } from './components/Esqueleto';
import { Logo } from './components/Logo';
import { CarasDolor, SelectorLado, TamizajeSignos, type ClaveSigno } from './components/Clinico';
import { DemoEjercicio } from './components/DemoEjercicio';
import { TarjetaProgreso } from './components/Progreso';
import { callar, decirInstruccionInicial, decirRepeticion, hablar } from './lib/voz';
import { C, R } from './lib/theme';
import { supabase } from './lib/supabase';
import { dispararTriaje, pedirFeedback, type Feedback } from './lib/coach';
import {
  avanzar, elevacionHombro, estadoInicial, flexionHombro, inclinacionTronco,
  resumirSesion, simetria, sostenRestanteS,
  type EstadoContador, type Landmark,
} from './lib/pose';
import {
  cargarEstado, cuandoFue, EJERCICIO_DE_HOY, guardarLadoAfectado, META_DIARIA,
  saludoPorHora, type EstadoPersona, type LadoAfectado,
} from './lib/plan';

const EJERCICIO = 'flexion_hombro_sentado';

type Etapa = 'inicio' | 'dolor_pre' | 'midiendo' | 'dolor_post' | 'enviando' | 'feedback';

export default function App() {
  const [sesionAuth, setSesionAuth] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesionAuth(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesionAuth(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (cargando) {
    return (
      <View style={s.centro}>
        <ActivityIndicator size="large" color={C.electrico} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.raiz}>
      <StatusBar barStyle="dark-content" backgroundColor={C.fondo} />
      {sesionAuth ? <PantallaSesion /> : <PantallaEntrar />}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PantallaEntrar() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const entrar = async () => {
    setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });
    setOcupado(false);
    if (error) Alert.alert('No pudimos entrar', error.message);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.pantalla}
    >
      <Logo tamano={46} />
      <Text style={s.subtitulo}>Tu rehabilitación, acompañada todos los días.</Text>

      <TextInput
        style={s.input} placeholder="Tu correo" placeholderTextColor={C.textoSuave}
        autoCapitalize="none" keyboardType="email-address"
        value={correo} onChangeText={setCorreo}
      />
      <TextInput
        style={s.input} placeholder="Tu clave" placeholderTextColor={C.textoSuave}
        secureTextEntry value={clave} onChangeText={setClave}
      />
      <Boton titulo={ocupado ? 'Entrando…' : 'Entrar'} onPress={entrar} deshabilitado={ocupado} />
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PantallaSesion() {
  const [etapa, setEtapa] = useState<Etapa>('inicio');
  const [dolorPre, setDolorPre] = useState<number | null>(null);
  const [dolorPost, setDolorPost] = useState<number | null>(null);
  const [sintoma, setSintoma] = useState('');
  const [lado, setLado] = useState<LadoAfectado | null>(null);
  const [signos, setSignos] = useState<ClaveSigno[]>([]);
  // El lado vive en un ref además del estado: el callback de la cámara corre a
  // 30 fps y captura el valor del render en que se creó.
  const ladoRef = useRef<'izq' | 'der'>('der');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // El contador vive en un ref porque se actualiza a la velocidad de los frames
  // (~30 por segundo). Meterlo en el estado de React re-renderizaría la cámara
  // 30 veces por segundo y la app se arrastraría.
  const contador = useRef<EstadoContador>(estadoInicial());
  const inicioMs = useRef<number>(0);
  const ultimoPintado = useRef(0);

  const [reps, setReps] = useState(0);
  // Un solo objeto de estado para todo lo que se repinta con la cámara. Antes
  // eran tres setState por cuadro pintado: tres reconciliaciones de React
  // encima del pipeline de video, que es justo lo que hacía sentir lenta la
  // revisión.
  const [hud, setHud] = useState<{
    rom: number | null;
    sostenFalta: number | null;
    puntos: { x: number; y: number }[];
  }>({ rom: null, sostenFalta: null, puntos: [] });

  const onResults = useCallback((res: PoseDetectionResultBundle, vc: any) => {
    const lm = res.results?.[0]?.landmarks?.[0] as Landmark[] | undefined;
    if (!lm || lm.length < 25) return;

    const ahora = Date.now();
    const activo = flexionHombro(lm, ladoRef.current);
    const sim = simetria(flexionHombro(lm, 'izq'), flexionHombro(lm, 'der'));
    const compensacion = {
      tronco: inclinacionTronco(lm),
      hombro: elevacionHombro(lm, ladoRef.current),
    };

    const previo = contador.current;
    const nuevo = avanzar(previo, activo, sim, ahora, compensacion);
    contador.current = nuevo;

    if (nuevo.reps !== previo.reps) {
      setReps(nuevo.reps);
      decirRepeticion(nuevo.reps);
    }

    // Avisa al llegar arriba y cuenta el sostén. La persona está mirando su
    // brazo, no el teléfono: si esto solo se escribiera en pantalla, no
    // llegaría.
    if (previo.fase === 'abajo' && nuevo.fase === 'arriba') {
      hablar('Mantén arriba', { interrumpe: true, minMs: 2000 });
    }

    // ~10 repintados por segundo. El conteo sigue corriendo a la velocidad de
    // los cuadros; lo que se limita es el dibujo, que es lo caro.
    if (ahora - ultimoPintado.current > 100) {
      ultimoPintado.current = ahora;
      let puntos: { x: number; y: number }[] = [];
      try {
        // convertPoint ya aplica rotación y espejo de la cámara frontal.
        // NO aplicar x = 1 - x a mano: se rota el esqueleto 90°.
        const dims = vc.getFrameDims(res);
        puntos = lm.map((p) => vc.convertPoint(dims, { x: p.x, y: p.y }));
      } catch {
        puntos = [];
      }
      setHud({
        rom: activo === null ? null : Math.round(activo),
        sostenFalta: nuevo.fase === 'arriba' ? sostenRestanteS(nuevo) : null,
        puntos,
      });
    }
  }, []);

  const onError = useCallback((e: { message: string }) => {
    console.warn('[pose]', e.message);
  }, []);

  const pose = usePoseDetection(
    { onResults, onError },
    RunningMode.LIVE_STREAM,
    'pose_landmarker_lite.task',
    { delegate: Delegate.GPU, numPoses: 1 },
  );

  // vision-camera v4 exige pedir el permiso explícitamente al montar.
  useEffect(() => {
    Camera.requestCameraPermission();
  }, []);

  const comenzar = () => {
    if (lado) decirInstruccionInicial(lado);
    contador.current = estadoInicial();
    inicioMs.current = Date.now();
    setReps(0);
    setHud({ rom: null, sostenFalta: null, puntos: [] });
    setEtapa('midiendo');
  };

  const enviar = async () => {
    setEtapa('enviando');
    const duracionS = (Date.now() - inicioMs.current) / 1000;
    const sesion = {
      ejercicio: EJERCICIO,
      lado_afectado: lado,
      dolor_pre: dolorPre,
      dolor_post: dolorPost,
      sintomas: sintoma.trim() ? [sintoma.trim()] : [],
      signos_alarma: signos,
      ...resumirSesion(contador.current, duracionS),
    };

    try {
      // El triaje se dispara ANTES de esperar el feedback: así el kinesiólogo
      // ya tiene su análisis en camino mientras la persona lee lo suyo.
      dispararTriaje(sesion);
      const fb = await pedirFeedback(sesion);
      setFeedback(fb);
      setEtapa('feedback');
    } catch (e: any) {
      const esDeRed = /failed to send|network|fetch|timeout/i.test(e?.message ?? '');
      Alert.alert(
        esDeRed ? 'Sin conexión' : 'No pudimos analizar la sesión',
        esDeRed
          ? 'Tu sesión quedó guardada. Revisa tu conexión y toca "Ver mi resultado" de nuevo.'
          : (e?.message ?? 'Intenta de nuevo.'),
      );
      setEtapa('dolor_post');
    }
  };

  const otra = () => {
    setFeedback(null);
    setDolorPre(null);
    setDolorPost(null);
    setSintoma('');
    setSignos([]);
    setEtapa('inicio');
  };

  if (etapa === 'inicio') {
    return (
      <PantallaInicio
        onComenzar={(l) => {
          setLado(l);
          ladoRef.current = l === 'izquierdo' ? 'izq' : 'der';
          setEtapa('dolor_pre');
        }}
      />
    );
  }

  if (etapa === 'dolor_pre') {
    return (
      <ScrollView contentContainerStyle={s.pantalla}>
        <Text style={s.titulo}>Antes de empezar</Text>
        <Text style={s.parrafo}>¿Cuánto dolor sientes ahora en el hombro afectado?</Text>
        <CarasDolor valor={dolorPre} onChange={setDolorPre} />
        <Boton titulo="Estoy listo" onPress={comenzar} deshabilitado={dolorPre === null} />
        <Boton
          titulo="Volver" variante="secundario" estilo={{ marginTop: 12 }}
          onPress={() => setEtapa('inicio')}
        />
      </ScrollView>
    );
  }

  if (etapa === 'midiendo') {
    return (
      <View style={s.camaraRaiz}>
        <MediapipeCamera
          style={StyleSheet.absoluteFillObject as any}
          solution={pose}
          activeCamera="front"
        />
        {/* El esqueleto: 33 puntos y 30 huesos dibujados sobre la cámara. Lo
            que la persona ve es literalmente lo que la app está midiendo. */}
        <Esqueleto puntos={hud.puntos} />
        <View style={s.hud} pointerEvents="none">
          <Text style={s.hudReps}>{reps}</Text>
          <Text style={s.hudEtiqueta}>repeticiones</Text>
          {hud.rom !== null && <Text style={s.hudRom}>{hud.rom}°</Text>}
        </View>
        {hud.sostenFalta !== null && (
          <View style={s.avisoSosten} pointerEvents="none">
            <Text style={s.avisoSostenTexto}>
              {hud.sostenFalta > 0 ? `Mantén arriba… ${hud.sostenFalta}` : '¡Ya! Baja despacio'}
            </Text>
          </View>
        )}
        <View style={s.barraInferior}>
          <Boton
            titulo="Terminar sesión"
            variante="peligro"
            onPress={() => {
              callar();
              setEtapa('dolor_post');
            }}
          />
        </View>
      </View>
    );
  }

  if (etapa === 'dolor_post') {
    return (
      <ScrollView contentContainerStyle={s.pantalla}>
        <Text style={s.titulo}>Terminaste</Text>
        <Text style={s.grande}>{reps} repeticiones</Text>
        <Text style={s.parrafo}>¿Cuánto dolor sientes ahora?</Text>
        <CarasDolor valor={dolorPost} onChange={setDolorPost} />

        <View style={s.separador} />

        <Text style={s.tituloChico}>¿Te pasó alguna de estas cosas hoy?</Text>
        <Text style={s.parrafoSuave}>
          Marca solo lo que sí te pasó. Si no te pasó ninguna, sigue sin marcar nada.
        </Text>
        <TamizajeSignos
          marcados={signos}
          onToggle={(c) =>
            setSignos((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
          }
        />

        {signos.length > 0 && (
          <View style={s.urgencia}>
            <Text style={s.urgenciaTexto}>
              Lo que marcaste necesita atención hoy. Al continuar avisaremos a tu kinesiólogo.
            </Text>
          </View>
        )}

        <TextInput
          style={s.input} placeholder="¿Sentiste algo más? (opcional)"
          placeholderTextColor={C.textoSuave} value={sintoma} onChangeText={setSintoma}
        />
        <Boton titulo="Ver mi resultado" onPress={enviar} deshabilitado={dolorPost === null} />
      </ScrollView>
    );
  }

  if (etapa === 'enviando') {
    return (
      <View style={s.centro}>
        <ActivityIndicator size="large" color={C.electrico} />
        <Text style={[s.parrafo, { marginTop: 16 }]}>Analizando tu sesión…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.pantalla}>
      {feedback?.derivar_urgencias && (
        <View style={s.urgencia}>
          <Text style={s.urgenciaTexto}>Acude a urgencias o llama al SAMU 131</Text>
        </View>
      )}
      <Text style={s.titulo}>Tu sesión</Text>
      <Text style={s.parrafo}>{feedback?.resumen}</Text>

      {!!feedback?.lo_hiciste_bien?.length && (
        <Tarjeta titulo="Lo hiciste bien" color={C.verde} items={feedback.lo_hiciste_bien} />
      )}
      {!!feedback?.a_corregir?.length && (
        <Tarjeta titulo="Para corregir" color={C.ambar} items={feedback.a_corregir} />
      )}
      {!!feedback?.proxima_sesion && (
        <Tarjeta titulo="La próxima vez" color={C.electrico} items={[feedback.proxima_sesion]} />
      )}

      <Boton titulo="Hacer otra sesión" onPress={otra} estilo={{ marginTop: 8 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo primero que ve la persona al abrir. Antes caía directo en la escala de
 * dolor, que es una pregunta clínica sin contexto: nadie sabe por qué se la
 * hacen ni qué viene después. Acá primero se le dice quién es, cómo va y qué
 * le toca hoy — y recién entonces se le pide algo.
 */
function PantallaInicio({ onComenzar }: { onComenzar: (lado: LadoAfectado) => void }) {
  const [estado, setEstado] = useState<EstadoPersona | null>(null);
  const [lado, setLado] = useState<LadoAfectado | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [detalle, setDetalle] = useState(false);
  const ej = EJERCICIO_DE_HOY;

  const cargar = useCallback(async () => {
    try {
      const e = await cargarEstado();
      setEstado(e);
      setLado((prev) => prev ?? e.ladoAfectado);
    } catch {
      setEstado(null);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  const hechoHoy = (estado?.sesionesHoy ?? 0) >= META_DIARIA;
  const avance = Math.min(1, (estado?.sesionesHoy ?? 0) / META_DIARIA);

  return (
    <ScrollView
      contentContainerStyle={[s.pantalla, { justifyContent: 'flex-start', paddingTop: 12 }]}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={C.electrico} colors={[C.electrico]} />
      }
    >
      <View style={s.encabezado}>
        <Logo />
        <Text style={s.salir} onPress={() => supabase.auth.signOut()}>Salir</Text>
      </View>

      <Text style={s.saludoChico}>{saludoPorHora()}</Text>
      <Text style={s.saludo}>{estado?.nombre || 'Bienvenido'}</Text>

      {/* La meta del día es lo primero que la persona necesita saber: si ya
          cumplió o si le falta. El resto es contexto. */}
      <View style={[s.tarjetaMeta, hechoHoy && { backgroundColor: C.verde }]}>
        <Text style={[s.metaTitulo, hechoHoy && { color: C.blanco }]}>
          {hechoHoy ? '¡Listo por hoy!' : 'Tu meta de hoy'}
        </Text>
        <Text style={[s.metaTexto, hechoHoy && { color: C.blanco }]}>
          {hechoHoy
            ? 'Ya hiciste tu sesión de hoy. Puedes hacer otra si quieres, pero no es necesario.'
            : 'Una sesión de ejercicios. Toma unos minutos.'}
        </Text>
        <View style={[s.barra, hechoHoy && { backgroundColor: 'rgba(255,255,255,0.35)' }]}>
          <View style={[s.barraLlena, { width: `${avance * 100}%` }, hechoHoy && { backgroundColor: C.blanco }]} />
        </View>
      </View>

      {estado && (
        <View style={s.filaMetricas}>
          <Metrica
            valor={estado.racha > 0 ? `🔥 ${estado.racha}` : '—'}
            etiqueta={estado.racha === 1 ? 'día seguido' : 'días seguidos'}
          />
          <Metrica valor={`${estado.sesionesEstaSemana}`} etiqueta="esta semana" />
          <Metrica valor={`${estado.totalSesiones}`} etiqueta="en total" />
        </View>
      )}

      {!!estado?.progreso?.length && <TarjetaProgreso puntos={estado.progreso} />}

      {estado?.ultimaSesion && !hechoHoy && (
        <Text style={s.parrafoSuave}>
          Tu última sesión fue {cuandoFue(estado.ultimaSesion).toLowerCase()}.
        </Text>
      )}

      {/* La animación enseña el movimiento y su ritmo. Reemplaza tres párrafos
          que el usuario real —una persona mayor, a veces con secuelas de
          lenguaje— no iba a leer. */}
      <View style={s.tarjetaPlan}>
        <Text style={s.etiquetaPlan}>Tu ejercicio de hoy</Text>
        <Text style={s.nombreEjercicio}>{ej.nombre}</Text>

        <DemoEjercicio lado={lado ?? 'derecho'} />

        <View style={s.filaDato}>
          <Text style={s.datoGrande}>{ej.repsSugeridas}</Text>
          <Text style={s.datoTexto}>veces</Text>
          <Text style={s.datoGrande}>{ej.segundosSosten}s</Text>
          <Text style={s.datoTexto}>arriba cada vez</Text>
        </View>

        <Text style={s.parrafoSuave}>{ej.porQue}</Text>

        <Text style={s.verMas} onPress={() => setDetalle((v: boolean) => !v)}>
          {detalle ? 'Ocultar indicaciones' : 'Ver indicaciones'}
        </Text>
        {detalle && <Text style={s.parrafo}>{ej.comoSeHace}</Text>}
      </View>

      {/* El lado con secuela se pregunta antes de medir. Sin esto la app medía
          siempre el derecho, que en una hemiparesia es la mitad de las veces el
          brazo sano. */}
      <View style={s.tarjetaPlan}>
        <Text style={s.etiquetaPlan}>¿Cuál es tu brazo afectado?</Text>
        <Text style={s.parrafoSuave}>
          Es el que vamos a medir. Si no estás seguro, pregúntale a tu kinesiólogo.
        </Text>
        <SelectorLado
          valor={lado}
          onChange={(l) => {
            setLado(l);
            void guardarLadoAfectado(l);
          }}
        />
      </View>

      <Boton
        titulo={
          !lado ? 'Elige tu brazo afectado'
          : hechoHoy ? 'Hacer otra sesión'
          : 'Comenzar mi sesión'
        }
        deshabilitado={!lado}
        onPress={() => lado && onComenzar(lado)}
      />

      <Text style={s.letraChica}>
        El video no sale de tu teléfono. Solo se guardan los números de tu movimiento, y los ve
        tu kinesiólogo.
      </Text>
    </ScrollView>
  );
}

function Metrica({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View style={s.metrica}>
      <Text style={s.metricaValor}>{valor}</Text>
      <Text style={s.metricaEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

function Tarjeta({ titulo, color, items }: { titulo: string; color: string; items: string[] }) {
  return (
    <View style={[s.tarjeta, { borderLeftColor: color }]}>
      <Text style={[s.tarjetaTitulo, { color }]}>{titulo}</Text>
      {items.map((t, i) => (
        <Text key={i} style={s.tarjetaItem}>{'•'} {t}</Text>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.fondo },
  pantalla: {
    paddingHorizontal: 24,
    paddingTop: 24,
    // En Android SafeAreaView no reserva ni la barra de estado ni la de
    // navegación: sin este colchón el último botón queda pegado al borde y,
    // en teléfonos con gestos, debajo de la barra del sistema.
    paddingBottom: 40,
    gap: 14,
    flexGrow: 1,
    justifyContent: 'center',
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fondo },
  marca: { fontSize: 34, fontWeight: '800', color: C.marino, letterSpacing: -0.5 },
  subtitulo: { fontSize: 16, color: C.textoSuave, marginBottom: 12 },
  titulo: { fontSize: 26, fontWeight: '800', color: C.marino },
  grande: { fontSize: 44, fontWeight: '800', color: C.electrico },
  parrafo: { fontSize: 17, color: C.texto, lineHeight: 25 },
  input: {
    borderWidth: 1, borderColor: C.borde, borderRadius: R, padding: 16,
    fontSize: 17, color: C.texto, backgroundColor: C.hielo,
  },
  escala: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  celda: {
    width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.borde,
    backgroundColor: C.hielo, alignItems: 'center', justifyContent: 'center',
  },
  celdaTexto: {
    fontSize: 18, fontWeight: '700', color: C.marino,
    width: 46, height: 46, lineHeight: 46, textAlign: 'center',
  },
  camaraRaiz: { flex: 1, backgroundColor: '#000' },
  punto: {
    position: 'absolute', width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.electrico, borderWidth: 1, borderColor: C.blanco,
  },
  hud: { position: 'absolute', top: 28, left: 24, alignItems: 'flex-start' },
  hudReps: { fontSize: 72, fontWeight: '800', color: C.blanco },
  hudEtiqueta: { fontSize: 15, color: C.blanco, marginTop: -8, opacity: 0.9 },
  hudRom: { fontSize: 22, fontWeight: '700', color: C.cyan, marginTop: 10 },
  barraInferior: { position: 'absolute', left: 24, right: 24, bottom: 48 },
  tarjeta: { backgroundColor: C.hielo, borderRadius: R, padding: 16, borderLeftWidth: 5, gap: 6 },
  tarjetaTitulo: { fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  tarjetaItem: { fontSize: 16, color: C.texto, lineHeight: 23 },
  urgencia: { backgroundColor: C.rojo, borderRadius: R, padding: 18 },
  urgenciaTexto: { color: C.blanco, fontSize: 19, fontWeight: '800', textAlign: 'center' },

  // Pantalla de inicio
  filaEntre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  salir: { fontSize: 15, fontWeight: '700', color: C.textoSuave, padding: 8 },
  saludo: { fontSize: 30, fontWeight: '800', color: C.marino, marginTop: 4 },
  filaMetricas: { flexDirection: 'row', gap: 10 },
  metrica: {
    flex: 1, backgroundColor: C.hielo, borderRadius: R, paddingVertical: 14, alignItems: 'center',
  },
  metricaValor: { fontSize: 28, fontWeight: '800', color: C.electrico },
  metricaEtiqueta: { fontSize: 12, color: C.textoSuave, marginTop: 2, textAlign: 'center' },
  tarjetaPlan: {
    backgroundColor: C.blanco, borderRadius: R, padding: 20, gap: 8,
    borderWidth: 1, borderColor: C.borde,
  },
  etiquetaPlan: {
    fontSize: 12, fontWeight: '800', color: C.electrico,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  nombreEjercicio: { fontSize: 22, fontWeight: '800', color: C.marino, marginBottom: 2 },
  separador: { height: 1, backgroundColor: C.borde, marginVertical: 6 },
  negrita: { fontWeight: '800', color: C.marino },
  letraChica: { fontSize: 13, color: C.textoSuave, lineHeight: 19, textAlign: 'center' },
  avisoSosten: {
    position: 'absolute', top: '42%', left: 24, right: 24,
    backgroundColor: 'rgba(27,42,107,0.88)', borderRadius: R, paddingVertical: 16,
  },
  avisoSostenTexto: { color: C.blanco, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  encabezado: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    // En Android SafeAreaView no reserva la barra de estado, así que el
    // encabezado quedaba pegado al borde y tapado por la hora y la señal.
    marginTop: (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0) + 8,
    marginBottom: 4,
  },
  verMas: {
    fontSize: 15, fontWeight: '700', color: C.electrico, paddingVertical: 6,
  },
  tituloChico: { fontSize: 19, fontWeight: '800', color: C.marino, marginTop: 4 },
  saludoChico: { fontSize: 17, color: C.textoSuave, marginTop: 8 },
  parrafoSuave: { fontSize: 15, color: C.textoSuave },
  tarjetaMeta: {
    backgroundColor: C.hielo, borderRadius: R, padding: 18, gap: 8,
    borderWidth: 1, borderColor: C.borde,
  },
  metaTitulo: { fontSize: 19, fontWeight: '800', color: C.marino },
  metaTexto: { fontSize: 15, color: C.texto, lineHeight: 21 },
  barra: { height: 8, borderRadius: 4, backgroundColor: C.borde, overflow: 'hidden', marginTop: 4 },
  barraLlena: { height: '100%', borderRadius: 4, backgroundColor: C.electrico },
  filaDato: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginVertical: 2 },
  datoGrande: { fontSize: 26, fontWeight: '800', color: C.electrico },
  datoTexto: { fontSize: 15, color: C.textoSuave, marginRight: 10 },
});
