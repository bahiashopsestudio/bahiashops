// Prueba de la migración 047 (el tope cuenta todo lo guardado, y eliminar un
// producto con ventas) contra una base local (PGlite: Postgres real en
// WebAssembly, sin instalar nada). No toca Supabase ni ninguna base real.
//
//   npm run probar:047
//
// La base es la de probar-046 (base-tiendas-prueba.mjs con la 033 y la 042),
// con pedido_items como en producción (producto_id bigint NOT NULL, con
// foto_url) y denuncias_productos en cascada. Corre la 046 y después la 047
// DOS veces (se tiene que poder) y prueba, llamando como service_role (como
// el servidor):
//   · el alta: cuentan todos los guardados, también pausados y rechazados;
//     pausar no hace lugar;
//   · reactivar un pausado y reenviar un rechazado: en el tope sí, por encima
//     no (BS409 / motivo 'tope_superado');
//   · eliminar un producto con ventas: el pedido conserva nombre y foto, se
//     va todo lo que lo apunta, y devuelve qué fotos borrar de Storage;
//   · que eliminar hace lugar, que borrar y cerrar tiendas siguen andando, los
//     permisos y la verificación de la migración.
//
// Lo que no prueba: dos guardados A LA VEZ (PGlite tiene una sola conexión).
// Eso lo prueba scripts/probar-tope-paralelo.mjs contra Supabase.

import { readFileSync } from "node:fs"
import { baseDeTiendas } from "./base-tiendas-prueba.mjs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("047_tope_guardados.sql")

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
  -- pedido_items como en producción (consulta 1 de la propuesta).
  alter table public.pedido_items
    alter column producto_id type bigint, alter column producto_id set not null,
    add column variante text, add column precio numeric, add column cantidad integer, add column foto_url text;
  create table public.denuncias_productos (id serial primary key,
    producto_id integer not null references public.productos on delete cascade, motivo text);
`)
await db.exec(leer("033_productos_por_el_servidor.sql"))
await db.exec(leer("042_comisiones_especiales.sql"))
await db.exec(leer("046_planes.sql"))

const nulo = async () => (await q(`select is_nullable from information_schema.columns
  where table_schema = 'public' and table_name = 'pedido_items' and column_name = 'producto_id'`))[0].is_nullable

console.log("1. La migración corre, y se puede correr dos veces")
ok((await nulo()) === "NO", "antes: pedido_items.producto_id es NOT NULL (como en producción)")
let error = null
try { await db.exec(MIG); await db.exec(MIG) } catch (e) { error = e }
ok(!error, `corre dos veces sin error${error ? ": " + error.message : ""}`)
ok((await nulo()) === "YES", "después: acepta null")
ok((await q(`select confdeltype from pg_constraint where contype = 'f' and conrelid = 'public.pedido_items'::regclass
  and confrelid = 'public.productos'::regclass`))[0].confdeltype === "a", "la clave foránea de pedido_items sigue sin cascada")

// ── Ayudantes (los de probar-046) ──
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
const guardados = async (vendedor) => Number((await q(`select count(*) as n from public.productos where vendedor_id = $1`, [vendedor]))[0].n)
const estadoDe = async (producto) => (await q(`select estado from public.productos where id = $1`, [producto]))[0]?.estado
const cuantas = async (tabla, producto) => Number((await q(`select count(*) as n from public.${tabla} where producto_id = $1`, [producto]))[0].n)

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
const eliminar = async (vendedor, producto) =>
  (await comoServicio(`select public.rpc_eliminar_producto($1, $2) as r`, [vendedor, producto]))[0].r
const ADMIN = await cuenta()

console.log("\n2. El alta: cuentan todos los guardados")
const T1 = await tienda()
await productos(T1, "activo", 5)
await productos(T1, "pausado", 4)
let p = await plan(T1)
ok(Number(p.usados) === 9 && !("a_la_vista" in p), "plan_de_tienda: usados 9 (5 activos y 4 pausados), sin a_la_vista")
let r = await guardar(T1, null)
ok(r.ok && r.estado === "en_revision" && (await guardados(T1)) === 10, "con 9 guardados (4 pausados) entra el décimo")
r = await guardar(T1, null)
ok(!r.ok && r.code === "BS409" && r.message === "tope_productos", "el undécimo: BS409 'tope_productos'")
ok(r.detalle?.tope === 10 && r.detalle?.usados === 10 && r.detalle?.cuenta === "guardados", "con { tope: 10, usados: 10, cuenta: 'guardados' } en el detalle")
const [activoT1] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'activo' order by id limit 1`, [T1])).map((x) => x.id)
r = await cambiar(T1, activoT1, "pausado")
ok(r.ok && r.estado === "pausado", "pausar en el tope: pasa")
r = await guardar(T1, null)
ok(!r.ok && r.message === "tope_productos" && (await guardados(T1)) === 10, "pero no hace lugar: el alta sigue en BS409")
const T2 = await tienda()
await productos(T2, "activo", 6)
await productos(T2, "rechazado", 2)
await productos(T2, "agotado", 1)
await productos(T2, "en_revision", 1)
r = await guardar(T2, null)
ok(!r.ok && r.message === "tope_productos" && r.detalle?.usados === 10, "los rechazados, agotados y en revisión también cuentan: 10 guardados, BS409")

console.log("\n3. Reactivar un pausado: en el tope sí, por encima no")
const [pausadoT1] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'pausado' order by id limit 1`, [T1])).map((x) => x.id)
r = await cambiar(T1, pausadoT1, "activo")
ok(r.ok && r.estado === "activo" && (await guardados(T1)) === 10, "en el tope (10 de 10): reactiva (ya contaba, no suma)")
const T3 = await tienda()
await productos(T3, "activo", 9)
const [agotadoT3] = await productos(T3, "agotado")
const [pausadoT3] = await productos(T3, "pausado")
const [otroPausadoT3] = await productos(T3, "pausado")
r = await cambiar(T3, pausadoT3, "activo")
ok(!r.ok && r.motivo === "tope_superado" && r.tope === 10 && r.usados === 12 && r.cuenta === "guardados",
  "por encima (12 de 10): motivo 'tope_superado', con tope 10 y usados 12")
ok((await estadoDe(pausadoT3)) === "pausado", "y sigue pausado")
const [activoT3] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'activo' order by id limit 1`, [T3])).map((x) => x.id)
r = await cambiar(T3, activoT3, "pausado")
ok(r.ok, "pausar por encima: pasa")
r = await cambiar(T3, otroPausadoT3, "activo")
ok(!r.ok && r.motivo === "tope_superado", "y pausar uno no deja reactivar otro: no se puede rotar el catálogo")
r = await cambiar(T3, activoT3, "activo")
ok(!r.ok && r.motivo === "tope_superado" && (await estadoDe(activoT3)) === "pausado", "ni volver a activar el que se acaba de pausar")
r = await cambiar(T3, agotadoT3, "activo")
ok(r.ok && r.estado === "activo", "agotado -> activo por encima: pasa (ya estaba a la vista)")

console.log("\n4. Reenviar un rechazado: en el tope sí, por encima no")
const T4 = await tienda()
await productos(T4, "activo", 9)
const [rechazadoT4] = await productos(T4, "rechazado")
r = await guardar(T4, rechazadoT4)
ok(r.ok && r.estado === "en_revision" && (await guardados(T4)) === 10, "en el tope (10 de 10): se reenvía y pasa a en revisión")
const T5 = await tienda()
await productos(T5, "activo", 10)
const [rechazadoT5] = await productos(T5, "rechazado")
r = await guardar(T5, rechazadoT5)
ok(!r.ok && r.code === "BS409" && r.message === "tope_superado" && r.detalle?.tope === 10 && r.detalle?.usados === 11 && r.detalle?.cuenta === "guardados",
  "por encima (11 de 10): BS409 'tope_superado', con tope 10 y usados 11")
ok((await estadoDe(rechazadoT5)) === "rechazado", "y sigue rechazado")
const [activoT5] = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'activo' order by id limit 1`, [T5])).map((x) => x.id)
r = await guardar(T5, activoT5)
ok(r.ok && r.estado === "activo", "editar uno activo por encima: pasa y sigue activo")

console.log("\n5. Eliminar un producto con ventas")
const TV = await tienda()
const [vendido] = await productos(TV, "activo")
const [sinVentas] = await productos(TV, "pausado")
for (let i = 0; i < 3; i++) {
  await db.query(`insert into public.producto_media (producto_id, url, tipo, orden, es_principal) values ($1, $2, 'foto', $3, $4)`,
    [vendido, `https://x/storage/v1/object/public/productos/${TV}/foto-${i}.webp`, i, i === 0])
}
await db.query(`insert into public.producto_variantes (producto_id, propiedad_1_valor, imagen_url) values ($1, 'Roja', $2), ($1, 'Azul', null)`,
  [vendido, `https://x/storage/v1/object/public/productos/${TV}/variante.webp`])
await db.query(`insert into public.producto_sellos (producto_id, sello_id) values ($1, 1)`, [vendido])
await db.query(`insert into public.favoritos (usuario_id, producto_id) values ($1, $2)`, [ADMIN, vendido])
await db.query(`insert into public.tesoros (producto_id) values ($1)`, [vendido])
await db.query(`insert into public.coleccion_productos (producto_id) values ($1)`, [vendido])
await db.query(`insert into public.denuncias_productos (producto_id, motivo) values ($1, 'otro')`, [vendido])
const comprador = await cuenta()
const ped = (await q(`insert into public.pedidos (comprador_id, vendedor_id, estado) values ($1, $2, 'entregado') returning id`, [comprador, TV]))[0].id
const FOTO_PEDIDO = `https://x/storage/v1/object/public/productos/${TV}/foto-0.webp`
await db.query(`insert into public.pedido_items (pedido_id, producto_id, nombre, variante, precio, cantidad, foto_url)
  values ($1, $2, 'Taza esmaltada', 'Roja', 1500, 2, $3)`, [ped, vendido, FOTO_PEDIDO])

let e = await eliminar(TV, vendido)
ok(e.ok === true && e.con_ventas === true, "se elimina, y avisa que tenía ventas")
ok(e.fotos.length === 4 && e.fotos.includes(FOTO_PEDIDO) && e.fotos.some((u) => u.endsWith("/variante.webp")),
  "devuelve sus 3 fotos y la de la variante (sin las variantes sin foto)")
ok(JSON.stringify(e.fotos_en_pedidos) === JSON.stringify([FOTO_PEDIDO]), "y la foto que usa el pedido, para no borrarla de Storage")
ok(!(await estadoDe(vendido)), "el producto ya no existe")
const item = (await q(`select producto_id, nombre, variante, precio, cantidad, foto_url from public.pedido_items where pedido_id = $1`, [ped]))[0]
ok(item.producto_id === null && item.nombre === "Taza esmaltada" && item.variante === "Roja" && Number(item.precio) === 1500
  && item.cantidad === 2 && item.foto_url === FOTO_PEDIDO, "el pedido conserva nombre, variante, precio, cantidad y foto; producto_id en null")
const restos = []
for (const tabla of ["producto_media", "producto_variantes", "producto_sellos", "favoritos", "tesoros", "coleccion_productos", "denuncias_productos"]) {
  if ((await cuantas(tabla, vendido)) !== 0) restos.push(tabla)
}
ok(restos.length === 0, `se va todo lo que lo apuntaba (fotos, variantes, sellos, favoritos, Tesoros, cápsulas, denuncias)${restos.length ? ": quedan " + restos : ""}`)
e = await eliminar(TV, sinVentas)
ok(e.ok && e.con_ventas === false && e.fotos.length === 0 && e.fotos_en_pedidos.length === 0, "uno sin ventas ni fotos: con_ventas false y listas vacías")
const [ajeno] = await productos(T1, "activo")
e = await eliminar(TV, ajeno)
ok(e.ok === false && e.motivo === "no_existe" && (await estadoDe(ajeno)) === "activo", "un producto de otra tienda: no_existe, no se toca")
e = await eliminar(TV, 999999)
ok(e.ok === false && e.motivo === "no_existe", "uno que no existe: no_existe")
await db.query(`delete from public.productos where id = $1`, [ajeno])

console.log("\n6. Eliminar hace lugar")
// T3: 12 guardados por encima de 10.
const sobran = (await q(`select id from public.productos where vendedor_id = $1 and estado = 'activo' order by id desc limit 2`, [T3])).map((x) => x.id)
await eliminar(T3, sobran[0])
r = await cambiar(T3, pausadoT3, "activo")
ok(!r.ok && r.motivo === "tope_superado" && r.usados === 11, "con 11 de 10 todavía no reactiva")
await eliminar(T3, sobran[1])
r = await cambiar(T3, pausadoT3, "activo")
ok(r.ok && (await guardados(T3)) === 10, "con 10 de 10 (eliminó hasta el tope) reactiva")
r = await guardar(T3, null)
ok(!r.ok && r.message === "tope_productos", "pero en el tope todavía no carga uno nuevo")
await eliminar(T3, pausadoT3)
r = await guardar(T3, null)
ok(r.ok && (await guardados(T3)) === 10, "eliminando uno más, entra uno nuevo")

console.log("\n7. Condiciones especiales")
await db.query(`insert into public.vendedor_planes (vendedor_id, plan_clave, sin_tope, precio_especial, motivo, creado_por)
  values ($1, 'basico', true, 0, 'prueba', $2)`, [T5, ADMIN])
r = await guardar(T5, rechazadoT5)
ok(r.ok && r.estado === "en_revision", "sin tope: el rechazado se reenvía")
await db.query(`update public.vendedor_planes set sin_tope = false, tope_productos = 11 where vendedor_id = $1`, [T5])
const [pausadoT5] = await productos(T5, "pausado")
r = await cambiar(T5, pausadoT5, "activo")
ok(!r.ok && r.motivo === "tope_superado" && r.tope === 11 && r.usados === 12, "tope especial 11 con 12 guardados: por encima, no reactiva")
p = await plan(T5)
ok(p.especial && p.tope_productos === 11 && Number(p.usados) === 12, "plan_de_tienda con la especial: tope 11, usados 12")

console.log("\n8. Permisos")
ok(!!(await como("anon", "select public.rpc_eliminar_producto(1, 1)")) && !!(await como("authenticated", "select public.rpc_eliminar_producto(1, 1)")),
  "rpc_eliminar_producto: ni anon ni authenticated")
ok(!!(await como("authenticated", "select privado.tope_superado(1)")), "tope_superado no la llama el navegador")
ok(!(await como("anon", "select clave, tope_productos from public.planes")), "anon sigue leyendo los planes")

console.log("\n9. Borrar y cerrar tiendas, y eliminar la cuenta")
{
  const usuario = await cuenta()
  const t = await tienda(usuario)
  await productos(t, "activo", 2)
  await db.query(`update public.vendedores set pausada_en = now() where id = $1`, [t])
  const rr = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [usuario]))[0].r
  ok(rr.ok && rr.tienda?.accion === "borrada" && (await guardados(t)) === 0, "cuenta con tienda sin pedidos: se elimina y la tienda se borra")

  const conVentas = await cuenta()
  const tv = await tienda(conVentas)
  const [vendidoTv] = await productos(tv, "activo")
  await productos(tv, "activo")
  const pedTv = (await q(`insert into public.pedidos (comprador_id, vendedor_id, estado) values ($1, $2, 'despachado') returning id`, [await cuenta(), tv]))[0].id
  await db.query(`insert into public.pedido_items (pedido_id, producto_id, nombre) values ($1, $2, 'Taza')`, [pedTv, vendidoTv])
  await db.query(`update public.vendedores set pausada_en = now() where id = $1`, [tv])
  const rc = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [conVentas]))[0].r
  ok(rc.ok && rc.tienda?.accion === "cerrada", "cuenta con tienda con ventas: se elimina y la tienda se cierra")
  ok((await q(`select id from public.productos where vendedor_id = $1`, [tv])).map((x) => x.id).join() === String(vendidoTv),
    "queda solo el producto vendido (cerrar_tienda no cambió)")
  ok(Number((await q(`select producto_id from public.pedido_items where pedido_id = $1`, [pedTv]))[0].producto_id) === vendidoTv,
    "y su pedido lo sigue apuntando")

  const tp = await tienda()
  const [prodTp] = await productos(tp, "activo")
  const pedTp = (await q(`insert into public.pedidos (comprador_id, vendedor_id, estado) values ($1, $2, 'entregado') returning id`, [await cuenta(), tp]))[0].id
  await db.query(`insert into public.pedido_items (pedido_id, producto_id, nombre) values ($1, $2, 'Taza')`, [pedTp, prodTp])
  await comoServicio(`select public.rpc_borrar_tienda_de_prueba($1) as r`, [tp])
  ok(Number((await q(`select count(*) as n from public.vendedores where id = $1`, [tp]))[0].n) === 0, "borrar una tienda de prueba con pedidos (admin): sigue andando")

  error = null
  try { await db.query(`delete from public.productos where id = $1`, [vendidoTv]) } catch (err) { error = err }
  ok(error?.code === "23503", "borrar a mano un producto vendido, sin pasar por borrar_productos: sigue frenado (23503)")
}

console.log("\n10. La verificación de la migración")
{
  const consulta = MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length)
  const v = JSON.parse((await q(consulta))[0].verificacion)
  ok(v.items_sin_producto_permitido === true, "pedido_items.producto_id acepta null")
  ok(v.alta_cuenta_guardados && v.reenvio_y_reactivar_con_superado && v.plan_cuenta_guardados && v.borrar_productos_suelta_pedidos,
    "las funciones con la regla nueva")
  ok(!v.rpc_eliminar_producto.anon && !v.rpc_eliminar_producto.authenticated && v.rpc_eliminar_producto.service_role, "rpc_eliminar_producto, solo service_role")
  ok(v.clave_foranea_items === "a", "la clave foránea sin cascada")
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
