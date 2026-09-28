// Guarda nombre, apellido y celular de quien compra, desde el paso "Tus datos"
// del checkout.
//
// Por qué una ruta y no un update desde el navegador: nadie puede escribir
// 'usuarios' con el cliente de sesión (así se cerró la tabla). Acá la
// identidad sale de la cookie, nunca del body, y se tocan SÓLO tres columnas:
// no hay forma de mandar es_admin ni nombre_usuario por esta puerta.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { normalizarTelefonoAR } from '@/lib/telefono';

const LARGO_MAXIMO = 60;

// Cualquier cosa que no sea texto cuenta como vacío.
function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// "a", "a y b", "a, b y c"
function enumerar(partes) {
  if (partes.length <= 1) return partes.join('');
  return partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
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

  const nombre = texto(body?.nombre);
  const apellido = texto(body?.apellido);
  const caracteristica = texto(body?.caracteristica);
  const numero = texto(body?.numero);
  const telefono = normalizarTelefonoAR(caracteristica + numero);

  const faltan = [];
  if (!nombre) faltan.push('tu nombre');
  if (!apellido) faltan.push('tu apellido');
  if (!telefono) faltan.push('un celular válido (característica sin el 0 y número sin el 15, 10 números en total)');

  if (faltan.length > 0) {
    return NextResponse.json({ error: `Falta ${enumerar(faltan)}.` }, { status: 400 });
  }

  const nombreLargo = nombre.length > LARGO_MAXIMO;
  const apellidoLargo = apellido.length > LARGO_MAXIMO;

  if (nombreLargo || apellidoLargo) {
    const cual = nombreLargo && apellidoLargo
      ? 'El nombre y el apellido pueden'
      : nombreLargo ? 'El nombre puede' : 'El apellido puede';
    return NextResponse.json(
      { error: `${cual} tener hasta ${LARGO_MAXIMO} caracteres.` },
      { status: 400 }
    );
  }

  const admin = getServiceRoleClient();

  const { data: cuenta, error } = await admin
    .from('usuarios')
    .update({
      nombre,
      apellido,
      telefono,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('nombre, apellido, telefono')
    .maybeSingle();

  if (error) {
    console.error('No se pudieron guardar los datos de la cuenta', user.id, error.message);
    return NextResponse.json({ error: 'No pudimos guardar tus datos. Probá de nuevo.' }, { status: 500 });
  }

  // La fila la crea el disparador del alta: si no está, no hay qué actualizar.
  if (!cuenta) {
    console.error('Datos de la cuenta: no existe la fila en usuarios', user.id);
    return NextResponse.json({ error: 'No pudimos guardar tus datos. Probá de nuevo.' }, { status: 500 });
  }

  return NextResponse.json(cuenta);
}
