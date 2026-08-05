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
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Camera } from 'react-native-vision-camera';
import {
  Delegate, MediapipeCamera, RunningMode, usePoseDetection,
  type PoseDetectionResultBundle,
} from 'react-native-mediapipe-posedetection';
import type { Session } from '@supabase/supabase-js';

import { Boton } from './components/Boton';
import { C, R } from './lib/theme';
import { supabase } from './lib/supabase';
import { dispararTriaje, pedirFeedback, type Feedback } from './lib/coach';
import {
  avanzar, estadoInicial, flexionHombro, resumirSesion, simetria,
  type EstadoContador, type Landmark,
} from './lib/pose';

const EJERCICIO = 'flexion_hombro_sentado';
const LADO_ACTIVO: 'izq' | 'der' = 'der';

type Etapa = 'dolor_pre' | 'midiendo' | 'dolor_post' | 'enviando' | 'feedback';

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
      <Text style={s.marca}>KineView</Text>
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
  const [etapa, setEtapa] = useState<Etapa>('dolor_pre');
  const [dolorPre, setDolorPre] = useState<number | null>(null);
  const [dolorPost, setDolorPost] = useState<number | null>(null);
  const [sintoma, setSintoma] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // El contador vive en un ref porque se actualiza a la velocidad de los frames
  // (~30 por segundo). Meterlo en el estado de React re-renderizaría la cámara
  // 30 veces por segundo y la app se arrastraría.
  const contador = useRef<EstadoContador>(estadoInicial());
  const inicioMs = useRef<number>(0);
  const ultimoPintado = useRef(0);

  const [reps, setReps] = useState(0);
  const [romVivo, setRomVivo] = useState<number | null>(null);
  const [puntos, setPuntos] = useState<{ x: number; y: number }[]>([]);

  const onResults = useCallback((res: PoseDetectionResultBundle, vc: any) => {
    const lm = res.results?.[0]?.landmarks?.[0] as Landmark[] | undefined;
    if (!lm || lm.length < 25) return;

    const ahora = Date.now();
    const activo = flexionHombro(lm, LADO_ACTIVO);
    const sim = simetria(flexionHombro(lm, 'izq'), flexionHombro(lm, 'der'));

    const previo = contador.current;
    const nuevo = avanzar(previo, activo, sim, ahora);
    contador.current = nuevo;

    if (nuevo.reps !== previo.reps) setReps(nuevo.reps);

    // El esqueleto se repinta a ~12 fps. Se ve fluido y evita 30 setState por
    // segundo sobre 33 vistas.
    if (ahora - ultimoPintado.current > 80) {
      ultimoPintado.current = ahora;
      setRomVivo(activo === null ? null : Math.round(activo));
      try {
        // convertPoint ya aplica rotación y espejo de la cámara frontal.
        // NO aplicar x = 1 - x a mano: se rota el esqueleto 90°.
        const dims = vc.getFrameDims(res);
        setPuntos(lm.map((p) => vc.convertPoint(dims, { x: p.x, y: p.y })));
      } catch {
        setPuntos([]);
      }
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
    contador.current = estadoInicial();
    inicioMs.current = Date.now();
    setReps(0);
    setPuntos([]);
    setEtapa('midiendo');
  };

  const enviar = async () => {
    setEtapa('enviando');
    const duracionS = (Date.now() - inicioMs.current) / 1000;
    const sesion = {
      ejercicio: EJERCICIO,
      dolor_pre: dolorPre,
      dolor_post: dolorPost,
      sintomas: sintoma.trim() ? [sintoma.trim()] : [],
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
      Alert.alert('No pudimos analizar la sesión', e?.message ?? 'Intenta de nuevo.');
      setEtapa('dolor_post');
    }
  };

  const otra = () => {
    setFeedback(null);
    setDolorPre(null);
    setDolorPost(null);
    setSintoma('');
    setEtapa('dolor_pre');
  };

  if (etapa === 'dolor_pre') {
    return (
      <ScrollView contentContainerStyle={s.pantalla}>
        <Text style={s.marca}>KineView</Text>
        <Text style={s.titulo}>Antes de empezar</Text>
        <Text style={s.parrafo}>¿Cuánto dolor sientes ahora en el hombro?</Text>
        <EscalaDolor valor={dolorPre} onChange={setDolorPre} />
        <Boton titulo="Estoy listo" onPress={comenzar} deshabilitado={dolorPre === null} />
        <Boton
          titulo="Salir" variante="secundario" estilo={{ marginTop: 12 }}
          onPress={() => supabase.auth.signOut()}
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
        {/* El esqueleto: los 33 puntos dibujados sobre la cámara. Lo que la
            persona ve es literalmente lo que la app está midiendo. */}
        {puntos.map((p, i) => (
          <View key={i} pointerEvents="none" style={[s.punto, { left: p.x - 4, top: p.y - 4 }]} />
        ))}
        <View style={s.hud} pointerEvents="none">
          <Text style={s.hudReps}>{reps}</Text>
          <Text style={s.hudEtiqueta}>repeticiones</Text>
          {romVivo !== null && <Text style={s.hudRom}>{romVivo}°</Text>}
        </View>
        <View style={s.barraInferior}>
          <Boton titulo="Terminar sesión" variante="peligro" onPress={() => setEtapa('dolor_post')} />
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
        <EscalaDolor valor={dolorPost} onChange={setDolorPost} />
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

function EscalaDolor({ valor, onChange }: { valor: number | null; onChange: (n: number) => void }) {
  const numeros = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);
  return (
    <View style={s.escala}>
      {numeros.map((n) => (
        <View key={n} style={[s.celda, valor === n && { backgroundColor: C.electrico }]}>
          <Text
            onPress={() => onChange(n)}
            style={[s.celdaTexto, valor === n && { color: C.blanco }]}
          >
            {n}
          </Text>
        </View>
      ))}
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
  pantalla: { padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' },
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
  barraInferior: { position: 'absolute', left: 24, right: 24, bottom: 34 },
  tarjeta: { backgroundColor: C.hielo, borderRadius: R, padding: 16, borderLeftWidth: 5, gap: 6 },
  tarjetaTitulo: { fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  tarjetaItem: { fontSize: 16, color: C.texto, lineHeight: 23 },
  urgencia: { backgroundColor: C.rojo, borderRadius: R, padding: 18 },
  urgenciaTexto: { color: C.blanco, fontSize: 19, fontWeight: '800', textAlign: 'center' },
});
