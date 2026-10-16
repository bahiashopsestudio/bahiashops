// Prueba de la migración 035 (denuncias de productos y rechazar un producto
// publicado) contra una base local (PGlite: Postgres real en WebAssembly, sin
// instalar nada). No toca Supabase ni ninguna base real.
//
//   npm run probar:035
//
// La base es la de probar-031 (base-tiendas-prueba.mjs: auth, usuarios,
// vendedores y productos, con las 016, 007, 030 y 031 reales), más las
// columnas de productos que usa la 035 (las de la 033). Así se prueba también
// que eliminar una cuenta (cerrar_cuenta, por sus dos caminos) deja las
// denuncias sin dueño.
//
// Lo que no prueba: dos denuncias exactamente simultáneas (PGlite tiene una
// sola conexión). La función bloquea el producto y la persona con FOR UPDATE.

import { readFileSync } from "node:fs"
import { baseDeTiendas } from "./base-tiendas-prueba.mjs"

const MIG = readFileSync(new URL("../sql/migrations/035_denuncias_productos.sql", import.meta.url), "utf8")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const { db, q, n } = await baseDeTiendas()
await db.exec(`alter table public.productos
  add column motivo_rechazo text, add column revision_posterior_desde timestamptz,
  add column actualizado_en timestamptz default now(), add column moderacion_avisos jsonb default '[]'`)
await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

let seq = 0
const uid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`
async function cuenta() {
  const id = uid()
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@mail.com`])
  await db.query(`insert into public.usuarios (id, email, nombre, apellido) values ($1, $2, 'Ana', 'Pérez')`, [id, `${id}@mail.com`])
  return id
}
async function tienda(usuario, { pausada = false } = {}) {
  const id = (await q(`insert into public.vendedores (usuario_id, nombre_negocio, slug) values ($1, $2, $2) returning id`, [usuario, `t-${++seq}`]))[0].id
  if (pausada) await db.query(`update public.vendedores set pausada_en = now() where id = $1`, [id])
  return id
}
const producto = async (v, estado = "activo") =>
  (await q(`insert into public.productos (vendedor_id, nombre, estado) values ($1, 'Taza', $2) returning id`, [v, estado]))[0].id
const denunciar = async (usuario, prod, motivo = "contacto", comentario = null) =>
  (await q(`select public.rpc_registrar_denuncia($1, $2, $3, $4) as r`, [usuario, prod, motivo, comentario]))[0].r
const rechazar = async (prod, motivo, admin = null) =>
  (await q(`select public.rpc_rechazar_producto($1, $2, $3) as r`, [prod, motivo, admin]))[0].r
async function como(rol, sql) {
  try { await db.exec(`set role ${rol}`); return { filas: (await db.query(sql)).rows, error: null } }
  catch (e) { return { filas: [], error: e.message } }
  finally { await db.exec("reset role") }
}
const negado = (r) => !!r.error && /permission denied/.test(r.error)

const duena = await cuenta()
const t1 = await tienda(duena)
const p1 = await producto(t1)
const ana = await cuenta()
const bea = await cuenta()

console.log("1. La tabla y sus permisos")
ok((await n(`select count(*) as n from pg_class where oid = 'public.denuncias_productos'::regclass and relrowsecurity`)) === 1, "RLS activo")
ok((await n(`select count(*) as n from pg_policies where tablename = 'denuncias_productos'`)) === 0, "sin políticas")
for (const rol of ["anon", "authenticated"]) {
  ok(negado(await como(rol, `select * from public.denuncias_productos`)), `${rol}: no lee`)
  ok(negado(await como(rol, `insert into public.denuncias_productos (producto_id, motivo) values (${p1}, 'otro')`)), `${rol}: no escribe`)
  ok(negado(await como(rol, `select public.rpc_registrar_denuncia('${ana}', ${p1}, 'otro', null)`)), `${rol}: no puede denunciar por la base`)
  ok(negado(await como(rol, `select public.rpc_rechazar_producto(${p1}, 'x', null)`)), `${rol}: no puede rechazar`)
  ok(negado(await como(rol, `select privado.registrar_denuncia('${ana}', ${p1}, 'otro', null)`)), `${rol}: ni llamar a la función privada`)
}
ok(!(await como("service_role", `select count(*) from public.denuncias_productos`)).error, "service_role sí")

console.log("\n2. Registrar")
let r = await denunciar(ana, p1, "contacto", "  En la segunda foto hay un teléfono.  ")
ok(r.resultado === "creada" && r.primera === true, "la primera denuncia del producto: creada, primera")
let fila = (await q(`select * from public.denuncias_productos where id = $1`, [r.id]))[0]
ok(fila.estado === "pendiente" && fila.usuario_id === ana && fila.comentario === "En la segunda foto hay un teléfono." && fila.resuelta_en === null, "pendiente, con el comentario sin espacios de más")
r = await denunciar(bea, p1, "estafa")
ok(r.resultado === "creada" && r.primera === false, "otra persona, mismo producto: creada, NO primera (no manda otro mail)")
r = await denunciar(ana, p1, "fotos")
ok(r.resultado === "ya_existia", "la misma persona otra vez: ya_existia, sin duplicar")
ok((await n(`select count(*) as n from public.denuncias_productos where producto_id = $1`, [p1])) === 2, "siguen siendo 2")
ok((await denunciar(duena, p1)).resultado === "propio", "la dueña de la tienda: propio")
const enRevision = await producto(t1, "en_revision")
ok((await denunciar(ana, enRevision)).resultado === "no_disponible", "un producto en revisión: no_disponible")
const pausada = await tienda(await cuenta(), { pausada: true })
ok((await denunciar(ana, await producto(pausada))).resultado === "no_disponible", "uno de una tienda pausada: no_disponible")
ok((await denunciar(ana, 999999)).resultado === "no_disponible", "uno que no existe: no_disponible")
r = await denunciar(bea, p1, "otro", "   ")
ok(r.resultado === "ya_existia", "(bea ya tenía una)")
const carla = await cuenta()
r = await denunciar(carla, p1, "otro", "   ")
ok(r.resultado === "creada" && (await q(`select comentario from public.denuncias_productos where id = $1`, [r.id]))[0].comentario === null, "comentario en blanco: se guarda null")

let error = null
try { await denunciar(await cuenta(), p1, "spam") } catch (e) { error = e.code }
ok(error === "23514", "un motivo que no es de los seis: rechazado por la base")
error = null
try { await denunciar(await cuenta(), p1, "otro", "x".repeat(1001)) } catch (e) { error = e.code }
ok(error === "23514", "un comentario de más de 1000: rechazado por la base")
error = null
try { await db.query(`insert into public.denuncias_productos (producto_id, usuario_id, motivo, estado) values ($1, $2, 'otro', 'descartada')`, [p1, carla]) } catch (e) { error = e.code }
ok(error === "23514", "resuelta sin fecha: rechazado (estado y resuelta_en van juntos)")

console.log("\n3. El límite diario")
const masiva = await cuenta()
const productos = []
for (let i = 0; i < 11; i++) productos.push(await producto(t1))
for (let i = 0; i < 10; i++) {
  r = await denunciar(masiva, productos[i])
  if (r.resultado !== "creada") ok(false, `la denuncia ${i + 1} debería crearse`)
}
ok(true, "10 denuncias en el día: se crean")
ok((await denunciar(masiva, productos[10])).resultado === "limite", "la 11ª: limite")
await db.query(`update public.denuncias_productos set creada_en = now() - interval '25 hours' where usuario_id = $1`, [masiva])
ok((await denunciar(masiva, productos[10])).resultado === "creada", "pasadas 24 horas, puede volver a denunciar")

console.log("\n4. Rechazar un producto (también uno publicado)")
const p2 = await producto(t1)
await denunciar(ana, p2, "fotos")
await db.query(`update public.productos set revision_posterior_desde = now() where id = $1`, [p1])
const admin = await cuenta()
r = await rechazar(p1, "  Tiene datos de contacto  ", admin)
const prod1 = (await q(`select * from public.productos where id = $1`, [p1]))[0]
ok(r.resultado === "rechazado" && r.denuncias_resueltas === 3, "activo -> rechazado, y resuelve sus 3 denuncias pendientes")
ok(prod1.estado === "rechazado" && prod1.motivo_rechazo === "Tiene datos de contacto" && prod1.revision_posterior_desde === null, "guarda el motivo y limpia la marca de revisión posterior")
ok((await n(`select count(*) as n from public.denuncias_productos where producto_id = $1 and estado = 'producto_rechazado' and resuelta_por = $2 and resuelta_en is not null`, [p1, admin])) === 3,
  "las denuncias quedan como producto_rechazado, con fecha y quién")
ok((await n(`select count(*) as n from public.denuncias_productos where producto_id = $1 and estado = 'pendiente'`, [p2])) === 1, "las de otro producto no se tocan")
ok((await rechazar(p1, "Otra vez")).resultado === "no_se_puede", "uno ya rechazado: no_se_puede")
ok((await rechazar(999999, "x")).resultado === "no_existe", "uno que no existe: no_existe")
ok((await rechazar(enRevision, "Fotos borrosas")).resultado === "rechazado", "uno en revisión: también (la cola de siempre)")
for (const estado of ["pausado", "agotado"]) {
  const p = await producto(t1, estado)
  ok((await rechazar(p, "Producto no permitido")).resultado === "rechazado", `uno ${estado}: rechazado`)
}
error = null
try { await rechazar(p2, "   ") } catch (e) { error = e.code }
ok(error === "22023" && (await q(`select estado from public.productos where id = $1`, [p2]))[0].estado === "activo", "sin motivo: error, y no cambia nada")
r = await denunciar(ana, p1)
ok(r.resultado === "no_disponible", "un producto rechazado ya no se puede denunciar")

console.log("\n5. Borrar el producto")
await db.query(`delete from public.productos where id = $1`, [p2])
ok((await n(`select count(*) as n from public.denuncias_productos where producto_id = $1`, [p2])) === 0, "sus denuncias se borran en cascada")

console.log("\n6. Eliminar la cuenta de quien denunció (Ley 25.326)")
{
  // Camino 1: sin pedidos -> la cuenta se borra entera.
  const sinPedidos = await cuenta()
  const p = await producto(t1)
  await denunciar(sinPedidos, p, "estafa")
  r = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [sinPedidos]))[0].r
  ok(r.ok && r.resultado === "borrada", "cuenta sin pedidos: se borra")
  ok((await n(`select count(*) as n from public.denuncias_productos where usuario_id = $1`, [sinPedidos])) === 0
    && (await n(`select count(*) as n from public.denuncias_productos where producto_id = $1 and usuario_id is null and estado = 'pendiente'`, [p])) === 1,
    "su denuncia sigue (para revisar el producto), sin dueño")

  // Camino 2: con pedidos -> queda la cáscara anónima de usuarios.
  const conPedidos = await cuenta()
  const otraTienda = await tienda(await cuenta())
  await db.query(`insert into public.pedidos (comprador_id, vendedor_id, estado) values ($1, $2, 'despachado')`, [conPedidos, otraTienda])
  const p3 = await producto(t1)
  await denunciar(conPedidos, p3, "contacto", "Un teléfono en la foto")
  r = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [conPedidos]))[0].r
  ok(r.ok && r.resultado !== "borrada" && (await n(`select count(*) as n from public.usuarios where id = $1`, [conPedidos])) === 1, "cuenta con pedidos: queda la cáscara anónima")
  ok((await n(`select count(*) as n from public.denuncias_productos where usuario_id = $1`, [conPedidos])) === 0, "y su denuncia ya no la apunta (el disparador)")
  ok((await n(`select count(*) as n from public.denuncias_productos where producto_id = $1 and usuario_id is null and comentario = 'Un teléfono en la foto'`, [p3])) === 1, "la denuncia sigue, con su motivo y comentario")

  // Quien resolvió (un admin) también se borra de las denuncias.
  const adminConPedidos = await cuenta()
  await db.query(`insert into public.pedidos (comprador_id, vendedor_id, estado) values ($1, $2, 'despachado')`, [adminConPedidos, otraTienda])
  await rechazar(p3, "Tiene datos de contacto", adminConPedidos)
  await q(`select public.rpc_cerrar_cuenta($1) as r`, [adminConPedidos])
  ok((await n(`select count(*) as n from public.denuncias_productos where resuelta_por = $1`, [adminConPedidos])) === 0, "resuelta_por de una cuenta cerrada: queda vacío")
  ok((await denunciar(conPedidos, await producto(t1))).resultado === "no_disponible", "una cuenta cerrada no puede denunciar")
}

console.log("\n7. Borrar y cerrar tiendas (031) siguen andando")
{
  const d = await cuenta()
  const t = await tienda(d, { pausada: false })
  const p = await producto(t)
  await denunciar(ana, p, "otro")
  await db.query(`update public.vendedores set pausada_en = now() where id = $1`, [t])
  r = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [d]))[0].r
  ok(r.ok && r.tienda?.accion === "borrada", "cuenta con tienda pausada sin pedidos: la tienda se borra")
  ok((await n(`select count(*) as n from public.denuncias_productos where producto_id = $1`, [p])) === 0, "y las denuncias de sus productos se van con ellos")
}

console.log("\n8. La verificación corre")
const v = JSON.parse((await db.query(MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length))).rows[0].verificacion)
ok(v.tabla && v.rls && v.disparador, "tabla, RLS y disparador")
ok(v.permisos_tabla.anon === "" && v.permisos_tabla.authenticated === "" && v.permisos_tabla.service_role === "DELETE, INSERT, SELECT, UPDATE", "permisos de la tabla")
ok(Object.values(v.funciones).every((f) => !f.anon && !f.authenticated && f.service_role), "las dos funciones: solo service_role")

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
