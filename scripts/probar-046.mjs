// Prueba de la migración 046 (planes y topes del Gratis) contra una base local
// (PGlite: Postgres real en WebAssembly, sin instalar nada). No toca Supabase
// ni ninguna base real.
//
//   npm run probar:046
//
// La base es la de las tiendas (base-tiendas-prueba.mjs: las migraciones 016,
// 007, 030 y 031 de verdad), con las columnas de productos que usa
// guardar_producto, y la 033 y la 042 corridas encima. Después corre la 046
// DOS veces (se tiene que poder) y prueba, llamando como service_role (como
// el servidor):
//   · los planes iniciales y los permisos (el público lee los planes, sin
//     quién los editó; nadie del navegador ve las condiciones especiales);
//   · el tope de productos en el alta, en el reenvío de un rechazado y al
//     reactivar un pausado (cuentan activo, en_revision y agotado);
//   · el tope de fotos en el alta y al editar (lo que tenía o el plan);
//   · las condiciones especiales (tope especial, sin tope) y que un plan
//     incompleto no se pueda asignar ni dejar incompleto si está asignado;
//   · que bajar un tope o quitar una especial no pausa nada;
//   · que borrar y cerrar una tienda se llevan vendedor_planes (y cerrar,
//     también vendedor_comisiones), y que eliminar la cuenta sigue andando;
//   · la verificación de la migración.
//
// Lo que no prueba: dos guardados A LA VEZ (PGlite tiene una sola conexión).
// Eso lo prueba scripts/probar-tope-paralelo.mjs contra Supabase.

import { readFileSync } from "node:fs"
import { baseDeTiendas } from "./base-tiendas-prueba.mjs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("046_planes.sql")

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
`)
await db.exec(leer("033_productos_por_el_servidor.sql"))
await db.exec(leer("042_comisiones_especiales.sql"))

console.log("1. La migración corre, y se puede correr dos veces")
let error = null
try { await db.exec(MIG); await db.exec(MIG) } catch (e) { error = e }
ok(!error, `corre dos veces sin error${error ? ": " + error.message : ""}`)
await db.exec(`update public.planes set tope_productos = 12 where clave = 'gratis'`)
await db.exec(MIG)
ok((await q(`select tope_productos from public.planes where clave = 'gratis'`))[0].tope_productos === 12, "correrla de nuevo no pisa un plan editado")
await db.exec(`update public.planes set tope_productos = 10 where clave = 'gratis'`)

// ── Ayudantes ──
let s = 0
const uid = () => `00000000-0000-0000-0000-${String(++s).padStart(12, "0")}`
async function cuenta() {
  const id = uid()
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@mail.com`])
  await db.query(`insert into public.usuarios (id, email, nombre, apellido) values ($1, $2, 'Ana', 'Pérez')`, [id, `${id}@mail.com`])
  return id
}
async function tienda(usuario) {
  return (await q(`insert into public.vendedores (usuario_id, nombre_negocio, slug) values ($1, $2, $2) returning id`, [usuario ?? await cuenta(), `t-${++s}`]))[0].id
}
// Productos cargados directo (sin pasar por el tope), en un estado.
async function productos(vendedor, estado, cuantos = 1) {
  const ids = []
  for (let i = 0; i < cuantos; i++) ids.push((await q(`insert into public.productos (vendedor_id, nombre, estado) values ($1, 'Taza', $2) returning id`, [vendedor, estado]))[0].id)
  return ids
}
async function fotosDirectas(producto, cuantas) {
  for (let i = 0; i < cuantas; i++) await db.query(`insert into public.producto_media (producto_id, url, tipo, orden) values ($1, $2, 'foto', $3)`, [producto, `https://x/vieja-${i}.webp`, i])
}
const contar = async (vendedor) => Number((await q(`select count(*) as n from public.productos where vendedor_id = $1 and estado in ('activo', 'en_revision', 'agotado')`, [vendedor]))[0].n)
const estados = async (vendedor) => (await q(`select estado from public.productos where vendedor_id = $1 order by id`, [vendedor])).map((x) => x.estado).join()

// Como el servidor: con el rol service_role.
async function comoServicio(sql, params) {
  await db.exec("set role service_role")
  try { return (await db.query(sql, params)).rows } finally { await db.exec("reset role") }
}
async function como(rol, sql) {
  await db.exec(`set role ${rol}`)
  try { await db.query(sql); return null } catch (e) { return e } finally { await db.exec("reset role") }
}
const DATOS = { nombre: "Taza", descripcion: "Cerámica", precio: 1500, tiempo_preparacion: "durante_el_dia", categoria_id: 1 }
const FOTOS = (n, pre = "f") => Array.from({ length: n }, (_, i) => `https://x/${pre}${i}.webp`)
async function guardar(vendedor, producto, fotos = FOTOS(1)) {
  try {
    const r = await comoServicio(`select public.rpc_guardar_producto($1, $2, $3::jsonb, array(select jsonb_array_elements_text($4::jsonb)),
      '{}'::text[], '{}'::integer[], '[]'::jsonb) as r`, [vendedor, producto, JSON.stringify(DATOS), JSON.stringify(fotos)])
    return { ok: true, ...r[0].r }
  } catch (e) {
    let detalle = null
    try { detalle = JSON.parse(e.detail) } catch { /* sin detalle */ }
    return { ok: false, code: e.code, message: e.message, detalle }
  }
}
const cambiar = async (vendedor, producto, destino) =>
  (await comoServicio(`select public.rpc_cambiar_estado_producto($1, $2, $3) as r`, [vendedor, producto, destino]))[0].r
const plan = async (vendedor) => (await comoServicio(`select public.rpc_plan_de_tienda($1) as r`, [vendedor]))[0].r
const ADMIN = await cuenta()
async function especial(vendedor, campos) {
  try {
    await db.query(`insert into public.vendedor_planes (vendedor_id, plan_clave, tope_productos, sin_tope, precio_especial, motivo, creado_por)
      values ($1, $2, $3, $4, $5, 'prueba', $6)
      on conflict (vendedor_id) do update set plan_clave = excluded.plan_clave, tope_productos = excluded.tope_productos,
        sin_tope = excluded.sin_tope, precio_especial = excluded.precio_especial`,
      [vendedor, campos.plan ?? "basico", campos.tope ?? null, campos.sinTope ?? false, campos.precio ?? null, ADMIN])
    return null
  } catch (e) { return e }
}

console.log("\n2. Los planes iniciales y los permisos")
const planes = await q(`select clave, precio_mensual, tope_productos, fotos_por_producto, carritos_abandonados, disponible from public.planes order by orden`)
ok(JSON.stringify(planes.map((p) => [p.clave, p.precio_mensual, p.tope_productos, p.fotos_por_producto, p.carritos_abandonados, p.disponible])) ===
  JSON.stringify([["gratis", 0, 10, 4, false, true], ["basico", 10000, 25, 8, true, true], ["pro", null, null, null, false, false]]),
  "Gratis $0/10/4/sin carritos, Básico $10.000/25/8/con carritos, Pro sin precio y no disponible")
ok(!(await como("anon", "select clave, precio_mensual, tope_productos, fotos_por_producto, carritos_abandonados, disponible from public.planes")), "anon lee los planes")
ok(!!(await como("anon", "select actualizado_por from public.planes")), "anon no lee quién los editó")
ok(!!(await como("authenticated", "update public.planes set precio_mensual = 1")), "authenticated no los edita")
ok(!!(await como("anon", "select * from public.vendedor_planes")) && !!(await como("authenticated", "select * from public.vendedor_planes")), "nadie del navegador lee vendedor_planes")
ok(!!(await como("authenticated", `insert into public.vendedor_planes (vendedor_id, plan_clave, sin_tope, motivo, creado_por) values (1, 'basico', true, 'x', '${ADMIN}')`)),
  "ni se carga una condición especial")
ok(!!(await como("authenticated", "select public.rpc_plan_de_tienda(1)")) && !!(await como("anon", "select public.rpc_cambiar_estado_producto(1, 1, 'activo')")),
  "las rpc nuevas no las llama el navegador")
error = await como("authenticated", "select public.rpc_guardar_producto(1, null, '{}', '{x}', '{}', '{}', '[]')")
ok(!!error, "rpc_guardar_producto tampoco")

console.log("\n3. El tope de productos en el alta")
const T1 = await tienda()
await productos(T1, "activo", 5)
await productos(T1, "en_revision", 2)
await productos(T1, "agotado", 2)
await productos(T1, "pausado", 3)
await productos(T1, "rechazado", 2)
let p = await plan(T1)
ok(p.plan === "gratis" && p.origen === "gratis" && p.tope_productos === 10 && p.fotos_por_producto === 4 && p.carritos_abandonados === false && Number(p.usados) === 9,
  "sin condiciones especiales: el Gratis; 9 que cuentan (activos, en revisión y agotados; ni pausados ni rechazados)")
let r = await guardar(T1, null)
ok(r.ok && r.estado === "en_revision" && (await contar(T1)) === 10, "el décimo entra (en revisión)")
r = await guardar(T1, null)
ok(!r.ok && r.code === "BS409" && r.message === "tope_productos", "el undécimo: BS409 'tope_productos'")
ok(r.detalle?.tope === 10 && r.detalle?.usados === 10, "con { tope: 10, usados: 10 } en el detalle")
ok((await contar(T1)) === 10 && Number((await q(`select count(*) as n from public.productos where vendedor_id = $1`, [T1]))[0].n) === 15, "y no se guardó nada")

console.log("\n4. Reenviar un rechazado y editar en el tope")
const [rechazado] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'rechazado' order by id limit 1`, [T1])).map((x) => x.id)
r = await guardar(T1, rechazado)
ok(!r.ok && r.code === "BS409" && r.message === "tope_productos" && (await q(`select estado from public.productos where id = $1`, [rechazado]))[0].estado === "rechazado",
  "reenviar un rechazado con el tope lleno: BS409, sigue rechazado")
const [enRevision] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'en_revision' order by id limit 1`, [T1])).map((x) => x.id)
r = await guardar(T1, enRevision)
ok(r.ok && r.estado === "en_revision", "editar uno en revisión con el tope lleno: pasa (ya contaba)")
const [activo] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'activo' order by id limit 1`, [T1])).map((x) => x.id)
r = await guardar(T1, activo)
ok(r.ok && r.estado === "activo", "editar uno activo con el tope lleno: pasa y sigue activo")
const [pausadoT1] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'pausado' order by id limit 1`, [T1])).map((x) => x.id)
r = await guardar(T1, pausadoT1)
ok(r.ok && r.estado === "pausado", "editar uno pausado con el tope lleno: pasa y sigue pausado")

console.log("\n5. Pausar y reactivar")
r = await cambiar(T1, pausadoT1, "activo")
ok(!r.ok && r.motivo === "tope_productos" && r.tope === 10 && r.usados === 10, "reactivar un pausado con el tope lleno: tope_productos, con tope y usados")
ok((await q(`select estado from public.productos where id = $1`, [pausadoT1]))[0].estado === "pausado", "y sigue pausado")
const [agotado] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'agotado' order by id limit 1`, [T1])).map((x) => x.id)
r = await cambiar(T1, agotado, "activo")
ok(r.ok && r.estado === "activo" && (await contar(T1)) === 10, "agotado -> activo con el tope lleno: pasa (ya contaba)")
r = await cambiar(T1, activo, "pausado")
ok(r.ok && r.estado === "pausado" && (await contar(T1)) === 9, "pausar: pasa, y libera un lugar")
r = await cambiar(T1, pausadoT1, "activo")
ok(r.ok && r.estado === "activo" && (await contar(T1)) === 10, "ahora sí se reactiva otro")
r = await cambiar(T1, enRevision, "activo")
ok(!r.ok && r.motivo === "estado" && r.estado === "en_revision", "en revisión -> activo: no (motivo 'estado')")
r = await cambiar(T1, rechazado, "pausado")
ok(!r.ok && r.motivo === "estado", "rechazado -> pausado: no")
r = await cambiar(T1, activo, "agotado")
ok(!r.ok && r.motivo === "destino", "pedir 'agotado': no (motivo 'destino')")
const T2 = await tienda()
const [ajeno] = await productos(T2, "pausado")
r = await cambiar(T1, ajeno, "activo")
ok(!r.ok && r.motivo === "no_existe" && (await q(`select estado from public.productos where id = $1`, [ajeno]))[0].estado === "pausado", "un producto de otra tienda: no_existe, no se toca")

console.log("\n6. El tope de fotos")
r = await guardar(T2, null, FOTOS(5))
ok(!r.ok && r.code === "BS409" && r.message === "tope_fotos" && r.detalle?.tope === 4 && r.detalle?.usados === 5, "alta con 5 fotos en el Gratis: BS409 'tope_fotos', tope 4, usados 5")
r = await guardar(T2, null, FOTOS(4))
ok(r.ok, "con 4: entra")
const nuevoT2 = r.id
r = await guardar(T2, nuevoT2, FOTOS(5))
ok(!r.ok && r.message === "tope_fotos" && r.detalle?.tope === 4, "editarlo con 5: BS409, tope 4")
const [conOcho] = await productos(T2, "activo")
await fotosDirectas(conOcho, 8)
r = await guardar(T2, conOcho, FOTOS(8, "e"))
ok(r.ok && Number((await q(`select count(*) as n from public.producto_media where producto_id = $1`, [conOcho]))[0].n) === 8,
  "un producto con 8 fotos (de cuando era Básico) en el Gratis: se guarda con sus 8")
r = await guardar(T2, conOcho, FOTOS(9, "e"))
ok(!r.ok && r.message === "tope_fotos" && r.detalle?.tope === 8 && r.detalle?.usados === 9, "pero no con 9: BS409, tope 8 (las que tenía)")
r = await guardar(T2, conOcho, FOTOS(3, "e"))
ok(r.ok, "si le saca fotos, guarda")
r = await guardar(T2, conOcho, FOTOS(5, "e"))
ok(!r.ok && r.detalle?.tope === 4, "y después vale lo que tiene ahora o el plan: 5 ya no entra")

console.log("\n7. Condiciones especiales")
error = await especial(T1, { plan: "pro", sinTope: true })
ok(error?.code === "23514", `asignar el Pro (incompleto): 23514 «${error?.message}»`)
error = await especial(T1, { plan: "basico", tope: 50, precio: 20000 })
ok(!error, "un plan a medida: Básico con tope 50 y $20.000")
p = await plan(T1)
ok(p.origen === "especial" && p.especial && p.plan === "basico" && p.tope_productos === 50 && p.fotos_por_producto === 8 && p.carritos_abandonados && p.precio_mensual === 20000,
  "rige la especial: tope 50, las fotos y los carritos del Básico, el precio especial")
r = await guardar(T1, null, FOTOS(8))
ok(r.ok && (await contar(T1)) === 11, "ahora entra el undécimo, con 8 fotos")
error = await especial(T1, { plan: "basico", sinTope: true, precio: 0 })
p = await plan(T1)
ok(!error && p.sin_tope && p.tope_productos === null && p.precio_mensual === 0, "la tienda propia: sin tope y $0")
for (let i = 0; i < 3; i++) r = await guardar(T1, null)
ok(r.ok && (await contar(T1)) === 14, "sin tope: entran todos")
error = await especial(T1, { plan: "basico", sinTope: true, tope: 5 })
ok(error?.code === "23514", "sin tope y con tope a la vez: no")
error = await especial(T1, { plan: "basico", precio: -1 })
ok(error?.code === "23514", "precio negativo: no")

console.log("\n8. Un plan asignado no puede quedar incompleto")
error = null
try { await db.query(`update public.planes set disponible = false, tope_productos = null where clave = 'basico'`) } catch (e) { error = e }
ok(error?.code === "23514" && (await q(`select tope_productos from public.planes where clave = 'basico'`))[0].tope_productos === 25,
  `sacarle el tope al Básico (asignado a una tienda): 23514 «${error?.message}»`)
error = null
try { await db.query(`update public.planes set disponible = false, fotos_por_producto = null where clave = 'basico'`) } catch (e) { error = e }
ok(error?.code === "23514", "ni las fotos")
error = null
try { await db.query(`update public.planes set tope_productos = 30 where clave = 'basico'`) } catch (e) { error = e }
ok(!error, "cambiarle el tope a otro número: sí")
await db.query(`update public.planes set tope_productos = 25 where clave = 'basico'`)
error = null
try { await db.query(`update public.planes set nombre = 'Pro+' where clave = 'pro'`) } catch (e) { error = e }
ok(!error, "editar el Pro (no asignado): sí")
error = null
try { await db.query(`update public.planes set precio_mensual = 100 where clave = 'gratis'`) } catch (e) { error = e }
ok(error?.code === "23514", "el Gratis con precio: no")
error = null
try { await db.query(`delete from public.planes where clave = 'basico'`) } catch (e) { error = e }
ok(!!error, "borrar un plan asignado: no")

console.log("\n9. Bajar un tope o quitar una especial no pausa nada")
let antes = await estados(T1)
await db.query(`delete from public.vendedor_planes where vendedor_id = $1`, [T1])
p = await plan(T1)
ok(p.plan === "gratis" && Number(p.usados) === 14 && (await estados(T1)) === antes, "quitar la especial con 14 productos: vuelve al Gratis, 14 de 10, y no cambia ningún estado")
r = await guardar(T1, null)
ok(!r.ok && r.message === "tope_productos" && r.detalle?.usados === 14, "pero no puede sumar (BS409 con usados 14)")
const T3 = await tienda()
await productos(T3, "activo", 8)
antes = await estados(T3)
await db.exec(`update public.planes set tope_productos = 5 where clave = 'gratis'`)
ok((await estados(T3)) === antes && Number((await plan(T3)).usados) === 8, "bajar el tope del Gratis a 5 con una tienda en 8: nada se pausa")
r = await guardar(T3, null)
ok(!r.ok && r.detalle?.tope === 5, "y no suma hasta bajar de 5")
await db.exec(`update public.planes set tope_productos = 10 where clave = 'gratis'`)

console.log("\n10. Borrar y cerrar tiendas, y eliminar la cuenta")
{
  const usuario = await cuenta()
  const t = await tienda(usuario)
  await productos(t, "activo", 2)
  await especial(t, { plan: "basico", sinTope: true, precio: 0 })
  await db.query(`update public.vendedores set pausada_en = now() where id = $1`, [t])
  let rr = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [usuario]))[0].r
  ok(rr.ok && rr.tienda?.accion === "borrada", "cuenta con tienda sin pedidos: se elimina y la tienda se borra")
  ok(Number((await q(`select count(*) as n from public.vendedor_planes where vendedor_id = $1`, [t]))[0].n) === 0, "y se lleva su vendedor_planes")

  const conVentas = await cuenta()
  const tv = await tienda(conVentas)
  const [vendido] = await productos(tv, "activo")
  await productos(tv, "activo")
  await especial(tv, { plan: "basico", tope: 50, precio: 20000 })
  await db.query(`insert into public.vendedor_comisiones (vendedor_id, comision_bp, motivo, creado_por) values ($1, 100, 'promo', $2)`, [tv, ADMIN])
  const comprador = await cuenta()
  const ped = (await q(`insert into public.pedidos (comprador_id, vendedor_id, estado) values ($1, $2, 'despachado') returning id`, [comprador, tv]))[0].id
  await db.query(`insert into public.pedido_items (pedido_id, producto_id, nombre) values ($1, $2, 'Taza')`, [ped, vendido])
  await db.query(`update public.vendedores set pausada_en = now() where id = $1`, [tv])
  rr = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [conVentas]))[0].r
  ok(rr.ok && rr.tienda?.accion === "cerrada", "cuenta con tienda con ventas: se elimina y la tienda se cierra")
  ok(Number((await q(`select count(*) as n from public.vendedor_planes where vendedor_id = $1`, [tv]))[0].n) === 0, "cerrar la tienda borra vendedor_planes")
  ok(Number((await q(`select count(*) as n from public.vendedor_comisiones where vendedor_id = $1`, [tv]))[0].n) === 0, "y vendedor_comisiones")
  ok((await q(`select id from public.productos where vendedor_id = $1`, [tv])).map((x) => x.id).join() === String(vendido), "queda solo el producto vendido")

  const tp = await tienda()
  await productos(tp, "activo")
  await especial(tp, { plan: "basico", tope: 30 })
  rr = await comoServicio(`select public.rpc_borrar_tienda_de_prueba($1) as r`, [tp])
  ok(Number((await q(`select count(*) as n from public.vendedores where id = $1`, [tp]))[0].n) === 0
    && Number((await q(`select count(*) as n from public.vendedor_planes where vendedor_id = $1`, [tp]))[0].n) === 0,
    "borrar una tienda de prueba (admin): se lleva vendedor_planes")
}

console.log("\n11. La verificación de la migración")
{
  const consulta = MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length)
  const v = JSON.parse((await q(consulta))[0].verificacion)
  ok(v.tablas.planes && v.tablas.vendedor_planes, "las dos tablas")
  ok(v.planes.gratis.tope === 10 && v.planes.basico.precio === 10000 && v.planes.pro.disponible === false, "los planes")
  ok(v.anon_lee_planes === true && v.anon_lee_actualizado_por === false && v.navegador_en_vendedor_planes === "", "los permisos de las tablas")
  ok(!v.rpc_plan_de_tienda.anon && !v.rpc_plan_de_tienda.authenticated && v.rpc_plan_de_tienda.service_role
    && !v.rpc_cambiar_estado_producto.anon && !v.rpc_cambiar_estado_producto.authenticated && v.rpc_cambiar_estado_producto.service_role, "las rpc, solo service_role")
  ok(v.borrar_tienda_planes && v.cerrar_tienda_planes && v.cerrar_tienda_comisiones && v.guardar_producto_con_tope, "borrar y cerrar con las tablas, guardar con el tope")
  ok(Number(v.disparadores) === 2, "los dos disparadores")
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
