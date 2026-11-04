// Prueba de la migración 048 (suscripciones del plan con Mercado Pago) contra
// una base local (PGlite: Postgres real en WebAssembly, sin instalar nada). No
// toca Supabase ni ninguna base real, ni Mercado Pago.
//
//   npm run probar:048
//
// La base es la de probar-047 (base-tiendas-prueba.mjs con la 033, la 042,
// la 046 y la 047). Corre la 048 DOS veces (se tiene que poder) y prueba,
// llamando como service_role (como el servidor):
//   · plan_efectivo: Gratis, Básico por suscripción, la gracia de 10 días, la
//     cancelada sin gracia, la condición especial de $0, la de precio vacío
//     (= el del plan) y la de un plan a medida, con su diferencia;
//   · registrar_cobro_suscripcion: el mismo cobro dos veces, el reembolso que
//     deja de contar y pagado_hasta recalculado;
//   · registrar_pago_diferencia: pagada, repetida, monto menor, devuelta y un
//     segundo pago;
//   · una sola suscripción viva por tienda;
//   · el disparador que frena cerrar o borrar una tienda con una suscripción
//     viva, y que la deja cerrar con la suscripción cancelada;
//   · los permisos y la verificación de la migración.

import { readFileSync } from "node:fs"
import { baseDeTiendas } from "./base-tiendas-prueba.mjs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("048_suscripciones.sql")
const M049 = leer("049_error_suscripcion.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const { db, q } = await baseDeTiendas()
await db.exec(`
  alter table public.productos
    add column descripcion text, add column marca text, add column precio numeric, add column precio_anterior numeric,
    add column tiempo_preparacion text, add column categoria_id integer, add column subcategoria_id integer,
    add column subcategoria_personalizada text, add column categoria_secundaria_id integer,
    add column subcategoria_secundaria_id integer, add column subcategoria_secundaria_personalizada text,
    add column genero text[], add column tiene_variantes boolean not null default false, add column propiedad_1_nombre text,
    add column moderacion_avisos jsonb default '[]', add column actualizado_en timestamptz default now(),
    add column creado_en timestamptz default now(), add column destacado boolean default false,
    add constraint productos_estado_check check (estado = any (array['en_revision', 'activo', 'pausado', 'agotado', 'rechazado']));
  alter table public.producto_media
    add column tipo text not null default 'foto', add column orden integer not null default 0, add column es_principal boolean not null default false;
  alter table public.producto_variantes add column propiedad_1_valor text;
  alter table public.producto_sellos add column sello_id integer;
  create table public.sellos (id serial primary key);
  alter table public.pedido_items
    alter column producto_id type bigint, alter column producto_id set not null,
    add column variante text, add column precio numeric, add column cantidad integer, add column foto_url text;
  create table public.denuncias_productos (id serial primary key,
    producto_id integer not null references public.productos on delete cascade, motivo text);
`)
await db.exec(leer("033_productos_por_el_servidor.sql"))
await db.exec(leer("042_comisiones_especiales.sql"))
await db.exec(leer("046_planes.sql"))
await db.exec(leer("047_tope_guardados.sql"))

console.log("1. La migración corre, y se puede correr dos veces")
let error = null
try { await db.exec(MIG); await db.exec(MIG); await db.exec(M049); await db.exec(M049) } catch (e) { error = e }
ok(!error, `la 048 y la 049 corren dos veces sin error${error ? ": " + error.message : ""}`)

// ── Ayudantes ──
let s = 0
const uid = () => `00000000-0000-0000-0000-${String(++s).padStart(12, "0")}`
async function cuenta() {
  const id = uid()
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@mail.com`])
  await db.query(`insert into public.usuarios (id, email, nombre, apellido) values ($1, $2, 'Ana', 'Pérez')`, [id, `${id}@mail.com`])
  return id
}
async function tienda() {
  return (await q(`insert into public.vendedores (usuario_id, nombre_negocio, slug) values ($1, $2, $2) returning id`, [await cuenta(), `t-${++s}`]))[0].id
}
async function comoServicio(sql, params) {
  await db.exec("set role service_role")
  try { return (await db.query(sql, params)).rows } finally { await db.exec("reset role") }
}
async function como(rol, sql) {
  await db.exec(`set role ${rol}`)
  try { await db.query(sql); return null } catch (e) { return e } finally { await db.exec("reset role") }
}
const plan = async (vendedor) => (await comoServicio(`select public.rpc_plan_de_tienda($1) as r`, [vendedor]))[0].r
const DIA = 24 * 3600 * 1000
const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString()
// Una suscripción con su estado, sin cobros.
async function suscripcion(vendedor, { estado = "authorized", monto = 10000, plan: clave = "basico" } = {}) {
  return (await comoServicio(`insert into public.vendedor_suscripciones (vendedor_id, plan_clave, monto, estado, mp_preapproval_id, payer_email)
    values ($1, $2, $3, $4, $5, 'paga@mail.com') returning id`, [vendedor, clave, monto, estado, `pre-${++s}`]))[0].id
}
let cobroN = 0
async function cobro(sus, { dias = 0, monto = 10000, estadoPago = "approved", cobroId, pagoId } = {}) {
  cobroN++
  return (await comoServicio(`select public.rpc_registrar_cobro_suscripcion($1, $2, $3, 'processed', $4, $5, $6) as r`,
    [sus, cobroId ?? `c-${cobroN}`, pagoId ?? `p-${cobroN}`, estadoPago, monto, hace(dias)]))[0].r
}
const fila = async (sus) => (await q(`select * from public.vendedor_suscripciones where id = $1`, [sus]))[0]
async function especial(vendedor, { plan: clave = "basico", tope = 50, precio = null } = {}) {
  await q(`insert into public.vendedor_planes (vendedor_id, plan_clave, tope_productos, precio_especial, motivo, creado_por)
    values ($1, $2, $3, $4, 'prueba', $5)
    on conflict (vendedor_id) do update set plan_clave = excluded.plan_clave, tope_productos = excluded.tope_productos,
      precio_especial = excluded.precio_especial`, [vendedor, clave, tope, precio, ADMIN])
}
async function diferencia(sus, vendedor, { precio = 20000, anterior = 10000, monto = 5000, cubreDias = 20, estado = "pendiente" } = {}) {
  return (await comoServicio(`insert into public.suscripcion_diferencias
      (suscripcion_id, vendedor_id, plan_clave, precio_nuevo, monto_anterior, monto, cubre_hasta, estado)
    values ($1, $2, 'basico', $3, $4, $5, $6, $7) returning id`,
    [sus, vendedor, precio, anterior, monto, new Date(Date.now() + cubreDias * DIA).toISOString(), estado]))[0].id
}
const pagarDif = async (dif, pagoId, estadoPago = "approved", monto = 5000) =>
  (await comoServicio(`select public.rpc_registrar_pago_diferencia($1, $2, $3, $4, now()) as r`, [dif, pagoId, estadoPago, monto]))[0].r
const ADMIN = await cuenta()

console.log("\n2. plan_efectivo sin condiciones especiales")
{
  const T = await tienda()
  let p = await plan(T)
  ok(p.plan === "gratis" && p.origen === "gratis" && p.especial_pendiente === null && p.suscripcion === null,
    "sin nada: Gratis, sin especial_pendiente ni suscripción")
  const sus = await suscripcion(T, { estado: "pending" })
  p = await plan(T)
  ok(p.plan === "gratis" && p.suscripcion?.estado === "pending", "suscripción esperando el pago: sigue en el Gratis (y el panel la ve)")
  await q(`update public.vendedor_suscripciones set estado = 'authorized' where id = $1`, [sus])
  await cobro(sus, { dias: 1 })
  p = await plan(T)
  ok(p.plan === "basico" && p.origen === "suscripcion" && p.tope_productos === 25 && p.precio_mensual === 10000,
    "con un cobro aprobado: Básico, origen 'suscripcion', tope 25, $10.000")
  const f = await fila(sus)
  ok(Math.abs(new Date(f.pagado_hasta) - (new Date(f.ultimo_cobro_en).getTime())) > 27 * DIA, "pagado_hasta = el cobro + 1 mes")
}

console.log("\n3. La gracia de 10 días, y la cancelada sin gracia")
{
  const T = await tienda()
  const sus = await suscripcion(T)
  await cobro(sus, { dias: 35 }) // pagado hasta hace ~4-5 días
  ok((await plan(T)).plan === "basico", "pagado hasta hace unos días: sigue en el Básico (gracia)")
  await q(`update public.vendedor_suscripciones set estado = 'cancelled' where id = $1`, [sus])
  ok((await plan(T)).plan === "gratis", "la misma, cancelada: Gratis (sin gracia)")

  const T2 = await tienda()
  const sus2 = await suscripcion(T2)
  await cobro(sus2, { dias: 45 })
  ok((await plan(T2)).plan === "gratis", "pagado hasta hace más de 10 días: Gratis")

  const T3 = await tienda()
  const sus3 = await suscripcion(T3, { estado: "cancelled" })
  await cobro(sus3, { dias: 3 })
  ok((await plan(T3)).plan === "basico", "cancelada con el mes pago: Básico hasta pagado_hasta")
}

console.log("\n4. Los cobros: repetidos, rechazados y devueltos")
{
  const T = await tienda()
  const sus = await suscripcion(T)
  await cobro(sus, { dias: 40, cobroId: "A", pagoId: "PA" })
  await cobro(sus, { dias: 5, cobroId: "B", pagoId: "PB" })
  const antes = await fila(sus)
  await cobro(sus, { dias: 5, cobroId: "B", pagoId: "PB" })
  await cobro(sus, { dias: 5, cobroId: null, pagoId: "PB" })
  const despues = await fila(sus)
  ok(Number((await q(`select count(*) as n from public.suscripcion_cobros where suscripcion_id = $1`, [sus]))[0].n) === 2,
    "el mismo cobro tres veces (por cobro y por pago): queda uno")
  ok(String(antes.pagado_hasta) === String(despues.pagado_hasta), "y pagado_hasta no cambia")
  ok(despues.primer_pago_id === "PA", "el primer pago queda guardado (F4)")
  await cobro(sus, { dias: 5, cobroId: "B", pagoId: "PB", estadoPago: "refunded" })
  const devuelto = await fila(sus)
  ok(new Date(devuelto.pagado_hasta) < new Date(despues.pagado_hasta), "el cobro devuelto deja de contar: pagado_hasta vuelve al anterior")
  ok((await plan(T)).plan === "gratis", "y con eso la tienda vuelve al Gratis")
  await cobro(sus, { dias: 0, cobroId: "C", pagoId: "PC", estadoPago: "rejected" })
  ok((await plan(T)).plan === "gratis", "un cobro rechazado no da el plan")
  const r = (await comoServicio(`select public.rpc_registrar_cobro_suscripcion(999999, 'x', 'y', null, 'approved', 1, now()) as r`))[0].r
  ok(r.ok === false && r.motivo === "no_existe", "una suscripción que no existe: { ok: false, motivo: 'no_existe' }")
}

console.log("\n5. Condiciones especiales")
{
  const T = await tienda()
  await especial(T, { precio: 0, tope: 100 })
  let p = await plan(T)
  ok(p.origen === "especial" && p.tope_productos === 100 && p.precio_mensual === 0, "precio 0: vale sin suscripción")

  const T2 = await tienda()
  await especial(T2, { precio: null, tope: 40 })
  p = await plan(T2)
  ok(p.plan === "gratis" && p.especial_pendiente?.plan === "basico" && p.especial_pendiente?.precio === 10000,
    "precio vacío = el del plan ($10.000): sin suscripción, Gratis con especial_pendiente")
  const sus2 = await suscripcion(T2)
  await cobro(sus2, { dias: 2 })
  p = await plan(T2)
  ok(p.origen === "especial" && p.tope_productos === 40 && p.especial_pendiente === null, "con la suscripción de $10.000: la condición especial")

  const T3 = await tienda()
  await especial(T3, { precio: 20000, tope: 60 })
  const sus3 = await suscripcion(T3)
  await cobro(sus3, { dias: 2 })
  p = await plan(T3)
  ok(p.origen === "suscripcion" && p.plan === "basico" && p.tope_productos === 25 && p.especial_pendiente?.precio === 20000,
    "plan a medida de $20.000 pagando $10.000: Básico, con especial_pendiente de $20.000")

  const dif = await diferencia(sus3, T3)
  p = await plan(T3)
  ok(p.origen === "suscripcion" && p.diferencia?.estado === "pendiente" && p.diferencia?.monto === 5000,
    "diferencia esperando el pago: sigue en el Básico, y el panel la ve")
  let r = await pagarDif(dif, "D1", "rejected")
  ok(r.ok && r.estado === "pendiente" && !r.recien_pagada, "un pago rechazado no la paga")
  r = await pagarDif(dif, "D2", "approved", 4000)
  ok(r.ok && r.estado === "pendiente", "un pago aprobado por menos tampoco")
  r = await pagarDif(dif, "D3")
  ok(r.ok && r.estado === "pagada" && r.recien_pagada, "aprobado por el monto: pagada (recien_pagada)")
  r = await pagarDif(dif, "D3")
  ok(r.ok && r.estado === "pagada" && !r.recien_pagada, "el mismo aviso otra vez: sin cambios")
  r = await pagarDif(dif, "D4")
  ok(!r.ok && r.motivo === "otro_pago", "otro pago aprobado sobre la misma diferencia: 'otro_pago'")
  p = await plan(T3)
  ok(p.origen === "especial" && p.tope_productos === 60 && p.precio_mensual === 20000 && p.diferencia === null,
    "con la diferencia pagada: el plan a medida, ya")
  r = await pagarDif(dif, "D3", "refunded")
  ok(r.estado === "devuelta" && (await plan(T3)).origen === "suscripcion", "devuelta: vuelve al Básico")

  const T4 = await tienda()
  await especial(T4, { precio: 20000, tope: 60 })
  const sus4 = await suscripcion(T4)
  await cobro(sus4, { dias: 2 })
  await diferencia(sus4, T4, { estado: "sin_cobro", monto: 0 })
  ok((await plan(T4)).origen === "especial", "diferencia sin cobro (por debajo del mínimo): el plan a medida")
  await q(`update public.suscripcion_diferencias set cubre_hasta = now() - interval '11 days' where suscripcion_id = $1`, [sus4])
  ok((await plan(T4)).origen === "suscripcion", "pasada la cobertura (+10 días) sin cobrar el monto nuevo: vuelve al Básico")
  await cobro(sus4, { dias: 0, monto: 20000 })
  ok((await plan(T4)).origen === "especial", "con el cobro de $20.000: el plan a medida")

  let err = null
  try { await diferencia(sus4, T4); await diferencia(sus4, T4) } catch (e) { err = e }
  ok(err?.code === "23505", "una sola diferencia esperando el pago por suscripción")
}

console.log("\n6. Una sola suscripción viva por tienda")
{
  const T = await tienda()
  await suscripcion(T, { estado: "pending" })
  let err = null
  try { await suscripcion(T, { estado: "authorized" }) } catch (e) { err = e }
  ok(err?.code === "23505", "dos vivas: error 23505")
  await q(`update public.vendedor_suscripciones set estado = 'cancelled' where vendedor_id = $1`, [T])
  err = null
  try { await suscripcion(T, { estado: "pending" }) } catch (e) { err = e }
  ok(!err, "con la anterior cancelada, entra otra")
}

console.log("\n7. Cerrar o borrar una tienda con la suscripción viva")
{
  const T = await tienda()
  const sus = await suscripcion(T)
  let r = await comoServicio(`select public.rpc_borrar_tienda_de_prueba($1) as r`, [T]).catch((e) => e)
  ok(r?.code === "BS423", "borrar_tienda_de_prueba con la suscripción viva: BS423")
  r = await q(`select privado.cerrar_tienda($1) as r`, [T]).catch((e) => e)
  ok(r?.code === "BS423", "cerrar_tienda con la suscripción viva: BS423")
  ok((await q(`select cerrada_en from public.vendedores where id = $1`, [T]))[0].cerrada_en === null, "y la tienda sigue igual")
  await q(`update public.vendedor_suscripciones set estado = 'cancelled' where id = $1`, [sus])
  r = await comoServicio(`select public.rpc_borrar_tienda_de_prueba($1) as r`, [T]).catch((e) => e)
  ok(r?.[0]?.r?.ok !== false && !(r instanceof Error), `con la suscripción cancelada se borra${r instanceof Error ? ": " + r.message : ""}`)
  const f = await fila(sus)
  ok(f.vendedor_id === null && f.payer_email === null, "la suscripción queda sin tienda y sin mail de pago")

  const T2 = await tienda()
  const sus2 = await suscripcion(T2, { estado: "cancelled" })
  r = await q(`select privado.cerrar_tienda($1) as r`, [T2]).catch((e) => e)
  ok(!(r instanceof Error), `cerrar_tienda con la suscripción cancelada: pasa${r instanceof Error ? " — " + r.message : ""}`)
  ok((await fila(sus2)).payer_email === null, "y se borra el mail de pago")
}

console.log("\n8. Permisos")
{
  for (const rol of ["anon", "authenticated"]) {
    ok(!!(await como(rol, "select * from public.vendedor_suscripciones")), `${rol} no lee vendedor_suscripciones`)
    ok(!!(await como(rol, "select * from public.suscripcion_cobros")), `${rol} no lee suscripcion_cobros`)
    ok(!!(await como(rol, "select * from public.suscripcion_diferencias")), `${rol} no lee suscripcion_diferencias`)
    ok(!!(await como(rol, "select public.rpc_registrar_cobro_suscripcion(1, 'a', 'b', null, 'approved', 1, now())")), `${rol} no registra cobros`)
    ok(!!(await como(rol, "select public.rpc_registrar_pago_diferencia(1, 'a', 'approved', 1, now())")), `${rol} no registra diferencias`)
  }
}

console.log("\n9. La verificación de la migración")
{
  const consulta = MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length)
  const v = JSON.parse((await q(consulta))[0].verificacion)
  ok(Object.values(v.tablas).every(Boolean), "las tres tablas")
  ok(Object.values(v.navegador_sin_acceso).every((x) => x === false), "el navegador no lee ninguna")
  ok(!v.rpc_registrar_cobro_suscripcion.anon && !v.rpc_registrar_cobro_suscripcion.authenticated && v.rpc_registrar_cobro_suscripcion.service_role,
    "rpc_registrar_cobro_suscripcion, solo service_role")
  ok(!v.rpc_registrar_pago_diferencia.anon && !v.rpc_registrar_pago_diferencia.authenticated && v.rpc_registrar_pago_diferencia.service_role,
    "rpc_registrar_pago_diferencia, solo service_role")
  ok(v.disparador_cierre && v.plan_con_suscripcion, "el disparador y la plan_efectivo nueva")
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
