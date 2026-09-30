// Guarda el apodo y la imagen de la cuenta (y nombre/apellido si faltaban),
// desde la bienvenida y desde el perfil.
//
// Por qué una ruta: nadie escribe 'usuarios' desde el navegador. La identidad
// sale de la cookie, nunca del body, y se tocan sólo estas columnas.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { validarApodo } from '@/lib/apodos';

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
  if (body?.marcarBienvenida === true) campos.bienvenida_vista_en = new Date().toISOString();

  const { data: cuenta, error } = await admin
    .from('usuarios')
    .update(campos)
    .eq('id', user.id)
    .select('nombre_usuario, imagen_perfil, nombre, apellido, bienvenida_vista_en')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: APODO_OCUPADO }, { status: 409 });
    }
    console.error('No se pudo guardar el apodo', user.id, error.message);
    return NextResponse.json({ error: 'No pudimos guardar tu apodo. Probá de nuevo.' }, { status: 500 });
  }

  if (!cuenta) {
    console.error('Apodo: no existe la fila en usuarios', user.id);
    return NextResponse.json({ error: 'No pudimos guardar tu apodo. Probá de nuevo.' }, { status: 500 });
  }

  return NextResponse.json(cuenta);
}
