// Prueba de la migración 050 (cuando una tienda deja de pagar, tanda F4a)
// contra una base local (PGlite: Postgres real en WebAssembly). No toca
// Supabase ni Mercado Pago.
//
//   npm run probar:050
//
// La base es la de probar-048 (base-tiendas-prueba.mjs con la 033, la 042,
// la 046, la 047, la 048 y la 049). Corre la 050 DOS veces y prueba, como
// service_role (como el servidor):
//   · las suscripciones de antes (F3) quedan con una caída cerrada y no
//     pausan nada;
//   · el cobro rechazado anota cobro_fallido_desde; en la gracia no pasa nada;
//   · terminada la gracia cae: quedan los 10 primeros (por creado_en) entre
//     los que se ven o están por verse, los demás se pausan con la marca y lo
//     que ella pausó no cambia; correrla de nuevo no hace nada;
//   · por encima del tope no se reactiva a mano; en el tope sí, y uno que
//     estaba en revisión vuelve a revisión;
//   · al volver a pagar se restaura todo lo que entra, a su estado de antes;
//   · la baja cae al terminar el mes pago (sin gracia), un cobro devuelto cae
//     en el momento, y las condiciones de $0 no caen;
//   · quitar un plan a medida pago pausa lo que pasa de 25, y si después deja
//     de pagar, esa caída se reemplaza por la nueva;
//   · los permisos y la verificación de la migración.

import { readFileSync } from "node:fs"
import { baseDeTiendas } from "./base-tiendas-prueba.mjs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("050_cuando_deja_de_pagar.sql")

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
for (const f of ["033_productos_por_el_servidor.sql", "042_comisiones_especiales.sql", "046_planes.sql",
  "047_tope_guardados.sql", "048_suscripciones.sql", "049_error_suscripcion.sql"]) await db.exec(leer(f))

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
async function servicio(sql, params) {
  await db.exec("set role service_role")
  try { return (await db.query(sql, params)).rows } finally { await db.exec("reset role") }
}
const DIA = 24 * 3600 * 1000
const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString()
// n productos, del más viejo (hace desdeDias) al más nuevo.
async function productos(v, n, { estado = "activo", desdeDias = 100 } = {}) {
  const ids = []
  for (let i = 0; i < n; i++) {
    ids.push((await q(`insert into public.productos (vendedor_id, nombre, estado, creado_en) values ($1, $2, $3, $4) returning id`,
      [v, `p${i}`, estado, hace(desdeDias - i * 0.5)]))[0].id)
  }
  return ids
}
// { activo: n, pausado: n, 'pausado*': n (pausados por el plan), ... }
const cuenta_ = async (v) => Object.fromEntries((await q(`select estado || case when pausado_por_plan_en is not null then '*' else '' end as e, count(*)::int as n
  from public.productos where vendedor_id = $1 group by 1`, [v])).map((r) => [r.e, r.n]))
const plan = async (v) => (await servicio(`select public.rpc_plan_de_tienda($1) as r`, [v]))[0].r
const caidas = async () => (await servicio(`select public.rpc_aplicar_caidas_vencidas() as n`))[0].n
async function suscripcion(v, { estado = "authorized", monto = 10000 } = {}) {
  return (await servicio(`insert into public.vendedor_suscripciones (vendedor_id, plan_clave, monto, estado, mp_preapproval_id)
    values ($1, 'basico', $2, $3, $4) returning id`, [v, monto, estado, `pre-${++s}`]))[0].id
}
let n = 0
const cobro = async (sus, dias, { estadoPago = "approved", estadoCobro = "processed", monto = 10000 } = {}) => (await servicio(
  `select public.rpc_registrar_cobro_suscripcion($1, $2, $3, $4, $5, $6, $7) as r`,
  [sus, `c${++n}`, `p${n}`, estadoCobro, estadoPago, monto, hace(dias)]))[0].r
const fila = async (sus) => (await q(`select * from public.vendedor_suscripciones where id = $1`, [sus]))[0]
const cambiarEstado = async (v, id, destino) => (await servicio(`select privado.cambiar_estado_producto($1, $2, $3) as r`, [v, id, destino]))[0].r

// Una suscripción de antes de la 050 (como las pruebas de F3): cobró, se
// canceló y ya no da el plan.
const VIEJA = await tienda()
await productos(VIEJA, 15)
const susVieja = await suscripcion(VIEJA, { estado: "cancelled" })
await cobro(susVieja, 60)

console.log("1. La migración corre, y se puede correr dos veces")
let error = null
let verificacion = null
try {
  await db.exec(MIG)
  const r = await db.exec(MIG)
  verificacion = r.flatMap((x) => x.rows || []).find((x) => x.verificacion)?.verificacion
} catch (e) { error = e }
ok(!error, `la 050 corre dos veces sin error${error ? ": " + error.message : ""}`)
ok(verificacion && Object.values(verificacion).every((x) => x === true), `la verificación da todo true (${JSON.stringify(verificacion)})`)
ok((await q(`select count(*)::int as n from public.plan_caidas where vendedor_id = $1 and restaurada_en is not null`, [VIEJA]))[0].n === 1,
  "la suscripción de antes quedó con una caída cerrada (una sola, aunque se corra dos veces)")
await caidas()
ok((await cuenta_(VIEJA)).activo === 15 && (await plan(VIEJA)).caida === null, "y sus productos no se tocan, sin caída abierta")

console.log("\n2. El cobro rechazado y la gracia")
const T = await tienda()
await productos(T, 19)                                   // los 19 más viejos, publicados
const enRevision = (await productos(T, 1, { estado: "en_revision", desdeDias: 50 }))[0]
await productos(T, 5, { estado: "pausado", desdeDias: 40 }) // los pausó ella
const sus = await suscripcion(T)
await cobro(sus, 35)                                     // pagado hasta hace 5 días: en la gracia
let p = await plan(T)
ok(p.plan === "basico" && p.caida === null && p.suscripcion.cobro_fallido_desde === null, "en la gracia sigue en el Básico, sin cobro fallido")
let r = await cobro(sus, 4, { estadoPago: "rejected", estadoCobro: "recycling" })
ok(r.cobro_fallido_desde !== null && (await plan(T)).suscripcion.cobro_fallido_desde !== null, "un cobro en reintento anota cobro_fallido_desde")
await servicio(`update public.vendedor_suscripciones set aviso_rechazo_en = now() where id = $1`, [sus])
ok(await caidas() === 0 && (await cuenta_(T)).activo === 19, "en la gracia no cae ni se pausa nada")

console.log("\n3. Termina la gracia: cae")
await servicio(`update public.vendedor_suscripciones set pagado_hasta = $2 where id = $1`, [sus, hace(10.1)])
ok(await caidas() === 1, "aplicar_caidas_vencidas encuentra la tienda")
let c = await cuenta_(T)
ok(c.activo === 10 && c["pausado*"] === 10 && c.pausado === 5,
  `quedan los 10 primeros publicados; 10 pausados por el plan (9 + el en revisión); los 5 de ella igual (${JSON.stringify(c)})`)
const masNuevoPublicado = (await q(`select max(creado_en) as m from public.productos where vendedor_id = $1 and estado = 'activo'`, [T]))[0].m
const masViejoPausado = (await q(`select min(creado_en) as m from public.productos where vendedor_id = $1 and pausado_por_plan_en is not null`, [T]))[0].m
ok(new Date(masNuevoPublicado) < new Date(masViejoPausado), "los que quedan son los más viejos")
p = await plan(T)
ok(p.plan === "gratis" && p.caida?.motivo === "falta_de_pago" && p.caida.pausados === 10 && p.caida.tope_antes === 25 && p.caida.nombre === "Básico"
  && p.pausados_por_plan === 10, `plan_de_tienda trae la caída (${JSON.stringify(p.caida)})`)
ok(await caidas() === 0 && (await cuenta_(T))["pausado*"] === 10, "correrla de nuevo no hace nada")

console.log("\n4. Reactivar a mano")
const unPausado = (await q(`select id from public.productos where vendedor_id = $1 and pausado_por_plan_en is not null and estado_antes_del_plan = 'activo' limit 1`, [T]))[0].id
r = await cambiarEstado(T, unPausado, "activo")
ok(r.ok === false && r.motivo === "tope_superado", "con 25 de 10 no se puede")

console.log("\n5. Vuelve a pagar: se restaura")
r = await cobro(sus, 0)
c = await cuenta_(T)
p = await plan(T)
ok(r.cobro_fallido_desde === null && (await fila(sus)).aviso_rechazo_en === null, "el cobro aprobado borra el cobro fallido y suelta la marca del mail")
ok(p.plan === "basico" && p.caida === null, "vuelve al Básico y la caída se cierra")
ok(c.activo === 19 && c.en_revision === 1 && c.pausado === 5 && !c["pausado*"],
  `vuelven los del sistema a su estado (el en revisión, a revisión); los 5 de ella siguen pausados (${JSON.stringify(c)})`)
const cerrada = (await q(`select * from public.plan_caidas where suscripcion_id = $1`, [sus]))[0]
ok(cerrada.restaurada_en !== null && cerrada.restaurados === 10, "la caída queda con la fecha y cuántos se restauraron")

console.log("\n6. En el tope, reactivar a mano uno que estaba en revisión")
const R = await tienda()
await productos(R, 10)
const rRev = (await productos(R, 1, { estado: "en_revision", desdeDias: 10 }))[0]
const susR = await suscripcion(R)
await cobro(susR, 45)
await caidas()
await q(`delete from public.productos where vendedor_id = $1 and estado = 'activo' and id = (select min(id) from public.productos where vendedor_id = $1)`, [R])
r = await cambiarEstado(R, rRev, "activo")
const prodR = (await q(`select estado, pausado_por_plan_en from public.productos where id = $1`, [rRev]))[0]
ok(r.ok && prodR.estado === "en_revision" && prodR.pausado_por_plan_en === null, "vuelve a revisión (no se publica sin aprobar) y pierde la marca")

console.log("\n7. La baja: cae al terminar el mes pago, sin gracia")
const B = await tienda()
await productos(B, 12)
const susB = await suscripcion(B)
await cobro(susB, 20)
await servicio(`update public.vendedor_suscripciones set estado = 'cancelled', cancelada_en = now() where id = $1`, [susB])
ok(await caidas() === 0 && (await cuenta_(B)).activo === 12, "cancelada con días pagos: nada")
await servicio(`update public.vendedor_suscripciones set pagado_hasta = $2 where id = $1`, [susB, hace(0.01)])
await caidas()
p = await plan(B)
ok(p.caida?.motivo === "baja" && (await cuenta_(B)).activo === 10, "pasado el mes pago: cae por baja y quedan 10")

console.log("\n8. Un cobro devuelto cae en el momento")
const D = await tienda()
await productos(D, 11)
const susD = await suscripcion(D)
await servicio(`select public.rpc_registrar_cobro_suscripcion($1, 'cd', 'pd', 'processed', 'approved', 10000, $2)`, [susD, hace(3)])
r = (await servicio(`select public.rpc_registrar_cobro_suscripcion($1, 'cd', 'pd', 'processed', 'refunded', 10000, $2) as r`, [susD, hace(3)]))[0].r
ok(r.ajuste?.caida !== null && (await plan(D)).caida?.motivo === "devolucion" && (await cuenta_(D))["pausado*"] === 1,
  "registrar el reembolso hace caer en el momento (devolucion, 1 pausado)")

console.log("\n9. Las condiciones de $0 no caen")
const P = await tienda()
await productos(P, 30)
await q(`insert into public.vendedor_planes (vendedor_id, plan_clave, sin_tope, precio_especial, motivo, creado_por)
  values ($1, 'basico', true, 0, 'tienda propia', (select usuario_id from public.vendedores where id = $1))`, [P])
const susP = await suscripcion(P)
await cobro(susP, 60)
await caidas()
ok((await plan(P)).caida === null && (await cuenta_(P)).activo === 30, "una tienda propia ($0) con una suscripción vieja no cae")

console.log("\n10. Quitar un plan a medida pago")
const M = await tienda()
await productos(M, 40)
await q(`insert into public.vendedor_planes (vendedor_id, plan_clave, tope_productos, precio_especial, motivo, creado_por)
  values ($1, 'basico', 50, 20000, 'x', (select usuario_id from public.vendedores where id = $1))`, [M])
const susM = await suscripcion(M, { monto: 20000 })
await cobro(susM, 3, { monto: 20000 })
ok((await plan(M)).especial === true, "con el plan a medida pago")
await q(`delete from public.vendedor_planes where vendedor_id = $1`, [M])
r = (await servicio(`select public.rpc_ajustar_productos_al_plan($1, 'condiciones_quitadas', 50) as r`, [M]))[0].r
c = await cuenta_(M)
p = await plan(M)
ok(r.pausados === 15 && c.activo === 25 && c["pausado*"] === 15, `quedan 25 (el Básico) y 15 pausados por el plan (${JSON.stringify(c)})`)
ok(p.plan === "basico" && p.caida?.motivo === "condiciones_quitadas" && p.caida.tope_antes === 50 && p.caida.tope_despues === 25 && p.caida.a_medida === true,
  "la caída dice 50 → 25, a medida")
ok((await servicio(`select public.rpc_ajustar_productos_al_plan($1, 'condiciones_quitadas', 50) as r`, [M]))[0].r.pausados === 0, "llamarla de nuevo no hace nada")
// Después deja de pagar: la caída nueva reemplaza la de condiciones quitadas.
await servicio(`update public.vendedor_suscripciones set pagado_hasta = $2 where id = $1`, [susM, hace(10.1)])
await caidas()
c = await cuenta_(M)
p = await plan(M)
const reemplazada = (await q(`select * from public.plan_caidas where vendedor_id = $1 and motivo = 'condiciones_quitadas'`, [M]))[0]
ok(p.caida?.motivo === "falta_de_pago" && c.activo === 10 && c["pausado*"] === 30 && reemplazada.restaurada_en !== null && reemplazada.reemplazada_por !== null,
  `si después deja de pagar, cae al Gratis y la caída anterior queda reemplazada (${JSON.stringify(c)})`)

console.log("\n11. Una tienda sin suscripción, o con una que nunca cobró, no cae")
const G = await tienda()
await productos(G, 15)
await suscripcion(G, { estado: "pending" })
await caidas()
ok((await plan(G)).caida === null && (await cuenta_(G)).activo === 15, "sin ningún cobro aprobado, nada")

console.log("\n12. Permisos")
async function como(rol, sql) {
  await db.exec(`set role ${rol}`)
  try { await db.query(sql); return null } catch (e) { return e } finally { await db.exec("reset role") }
}
ok(await como("authenticated", "select public.rpc_aplicar_caidas_vencidas()") !== null, "authenticated no puede correr las caídas")
ok(await como("anon", "select public.rpc_ajustar_productos_al_plan(1)") !== null, "anon no puede ajustar productos")
ok(await como("authenticated", "select * from public.plan_caidas") !== null, "authenticated no lee plan_caidas")
let motivoMalo = null
try { await servicio(`select public.rpc_ajustar_productos_al_plan($1, 'baja')`, [T]) } catch (e) { motivoMalo = e }
ok(motivoMalo !== null, "un motivo que no es condiciones_quitadas se rechaza")

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
