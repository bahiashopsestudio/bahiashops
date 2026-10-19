// Guarda el apodo y la imagen de la cuenta (y nombre/apellido si faltaban),
// desde la bienvenida y desde el perfil.
//
// Por qué una ruta: nadie escribe 'usuarios' desde el navegador. La identidad
// sale de la cookie, nunca del body, y se tocan sólo estas columnas.
//
// El apodo se cambia una vez cada 30 días (cambioDeApodo, en apodos.js; la
// columna es apodo_actualizado_en, migración 037). No cuenta como cambio:
//   · guardar el mismo apodo (por ejemplo, solo para marcar la bienvenida);
//   · la primera elección, mientras bienvenida_vista_en es null. Lo decide
//     la base, no el flag marcarBienvenida del navegador: con esa primera
//     elección la bienvenida queda vista, así que no se puede repetir.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { validarApodo, cambioDeApodo, DIAS_ENTRE_CAMBIOS_APODO } from '@/lib/apodos';
import { fechaLarga } from '@/lib/fechas';

const IMAGENES_PERMITIDAS = ['dibujo']; // 'foto' llega cuando se puedan subir
const LARGO_MAXIMO_NOMBRE = 60;
const APODO_OCUPADO = 'Ese apodo ya lo está usando otra persona. Probá con otro.';

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// Para comparar con ilike sin comodines: validarApodo ya no deja pasar % ni
// *, pero _ sí es un carácter válido de apodo.
function sinComodines(valor) {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'No pudimos leer los datos.' }, { status: 400 });
  }

  const validacion = validarApodo(body?.apodo);
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.motivo }, { status: 400 });
  }
  const apodo = validacion.apodo;

  const imagen = texto(body?.imagen_perfil) || 'dibujo';
  if (!IMAGENES_PERMITIDAS.includes(imagen)) {
    return NextResponse.json({ error: 'Por ahora la imagen es el dibujo de tu apodo.' }, { status: 400 });
  }

  const nombre = texto(body?.nombre);
  const apellido = texto(body?.apellido);
  if (nombre.length > LARGO_MAXIMO_NOMBRE || apellido.length > LARGO_MAXIMO_NOMBRE) {
    return NextResponse.json({ error: `El nombre y el apellido pueden tener hasta ${LARGO_MAXIMO_NOMBRE} caracteres.` }, { status: 400 });
  }

  const admin = getServiceRoleClient();

  const { data: actual, error: errorActual } = await admin
    .from('usuarios')
    .select('nombre_usuario, bienvenida_vista_en, apodo_actualizado_en')
    .eq('id', user.id)
    .maybeSingle();
  if (errorActual) {
    console.error('No se pudo leer la cuenta para el apodo', user.id, errorActual.message);
    return NextResponse.json({ error: 'No pudimos guardar tu apodo. Probá de nuevo.' }, { status: 500 });
  }
  if (!actual) {
    console.error('Apodo: no existe la fila en usuarios', user.id);
    return NextResponse.json({ error: 'No pudimos guardar tu apodo. Probá de nuevo.' }, { status: 500 });
  }

  const cambia = apodo !== actual.nombre_usuario;
  const primeraEleccion = !actual.bienvenida_vista_en;
  const cuenta30 = cambia && !primeraEleccion;
  const ahora = new Date();

  if (cuenta30) {
    const limite = cambioDeApodo(actual.apodo_actualizado_en, ahora.getTime());
    if (!limite.puede) {
      return NextResponse.json({
        error: `Lo cambiaste el ${fechaLarga(limite.cambiadoEl)}: vas a poder cambiarlo de nuevo desde el ${fechaLarga(limite.desde)}.`,
        codigo: 'APODO_LIMITE',
        apodo_actualizado_en: actual.apodo_actualizado_en,
      }, { status: 429 });
    }
  }

  // ¿Lo tiene otra persona? Sin distinguir mayúsculas, igual que el índice
  // único de la base. El índice igual tiene la última palabra (abajo), por si
  // dos lo piden a la vez.
  const { data: ocupado, error: errorBusqueda } = await admin
    .from('usuarios')
    .select('id')
    .ilike('nombre_usuario', sinComodines(apodo))
    .neq('id', user.id)
    .limit(1);

  if (errorBusqueda) {
    console.error('No se pudo verificar el apodo', user.id, errorBusqueda.message);
    return NextResponse.json({ error: 'No pudimos guardar tu apodo. Probá de nuevo.' }, { status: 500 });
  }
  if (ocupado && ocupado.length > 0) {
    return NextResponse.json({ error: APODO_OCUPADO }, { status: 409 });
  }

  const campos = { nombre_usuario: apodo, imagen_perfil: imagen };
  // Nombre y apellido sólo si llegan con texto: vacío no pisa lo que hay.
  if (nombre) campos.nombre = nombre;
  if (apellido) campos.apellido = apellido;
  // La primera elección deja la bienvenida vista: así no se puede volver a
  // usar para cambiar el apodo sin contar.
  if (body?.marcarBienvenida === true || (primeraEleccion && cambia)) campos.bienvenida_vista_en = ahora.toISOString();
  if (cuenta30) campos.apodo_actualizado_en = ahora.toISOString();

  let consulta = admin
    .from('usuarios')
    .update(campos)
    .eq('id', user.id);
  // Dos cambios a la vez: el UPDATE vuelve a pedir que el límite se cumpla.
  if (cuenta30) {
    const hace30 = new Date(ahora.getTime() - DIAS_ENTRE_CAMBIOS_APODO * 24 * 60 * 60 * 1000).toISOString();
    consulta = consulta.or(`apodo_actualizado_en.is.null,apodo_actualizado_en.lte.${hace30}`);
  }
  const { data: cuenta, error } = await consulta
    .select('nombre_usuario, imagen_perfil, nombre, apellido, bienvenida_vista_en, apodo_actualizado_en')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: APODO_OCUPADO }, { status: 409 });
    }
    console.error('No se pudo guardar el apodo', user.id, error.message);
    return NextResponse.json({ error: 'No pudimos guardar tu apodo. Probá de nuevo.' }, { status: 500 });
  }

  if (!cuenta) {
    if (cuenta30) {
      // Otro cambio entró entre la lectura y la escritura.
      return NextResponse.json({ error: 'Tu apodo ya se cambió hace un momento. Recargá la página.', codigo: 'APODO_LIMITE' }, { status: 429 });
    }
    console.error('Apodo: no existe la fila en usuarios', user.id);
    return NextResponse.json({ error: 'No pudimos guardar tu apodo. Probá de nuevo.' }, { status: 500 });
  }

  return NextResponse.json(cuenta);
}
