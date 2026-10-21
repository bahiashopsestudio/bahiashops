// La tarea diaria (src/lib/tareaDiaria.js). La llama Vercel Cron una vez por
// día (vercel.json: "0 13 * * *" UTC, las 10 de Argentina; en el plan Hobby
// corre en algún momento de esa hora).
//
// Protegida con CRON_SECRET: Vercel la manda sola como
// "Authorization: Bearer <CRON_SECRET>". Sin el secreto (o sin la variable
// cargada), 401.
//
//   GET /api/cron/diaria            corre en serio
//   GET /api/cron/diaria?prueba=1   devuelve lo que HARÍA, sin mandar ni
//                                   cambiar nada
//
// Para correrla a mano: scripts/correr-tarea-diaria.mjs.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { correrTareaDiaria, resumenParaElLog } from '@/lib/tareaDiaria';

// Hasta 40 mails con una pausa entre cada uno, más las renovaciones.
export const maxDuration = 120;

function autorizado(request) {
  const secreto = String(process.env.CRON_SECRET || '');
  if (!secreto) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get('authorization') || '');
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

export async function GET(request) {
  if (!autorizado(request)) {
    if (!process.env.CRON_SECRET) console.error('[tarea-diaria] CRON_SECRET no está cargada: la tarea no corre.');
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const prueba = new URL(request.url).searchParams.get('prueba') === '1';
  const resumen = await correrTareaDiaria({ admin: getServiceRoleClient(), prueba });

  const linea = JSON.stringify(resumenParaElLog(resumen));
  if (resumen.errores.length > 0) console.error('[tarea-diaria]', linea);
  else console.log('[tarea-diaria]', linea);

  return NextResponse.json(resumen);
}
