// Prueba de la migración 031 (eliminar la cuenta con tienda, y borrar tiendas
// de prueba) contra una base local (PGlite: Postgres real en WebAssembly, sin
// instalar nada). No toca Supabase ni ninguna base real.
//
//   npm run probar:031
//
// La base (imitación del esquema, con las 016, 007 y 030 reales) está en
// base-tiendas-prueba.mjs. Acá la 031 se corre dos veces. Las claves foráneas
// hacia productos y vendedores van SIN cascade a propósito (lo más estricto).
// Lo que no prueba: el esquema real (las columnas de vendedores se leen de
// information_schema, y la verificación de la migración las lista).

import { baseDeTiendas, M031 as MIG } from "./base-tiendas-prueba.mjs"

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const { db, q, n } = await baseDeTiendas({ veces: 2 })
console.log("Migración corrida dos veces sin errores.\n")

let seq = 0
const uid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`
async function cuenta(email) {
  const id = uid()
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email])
  await db.query(`insert into auth.sessions (user_id) values ($1)`, [id])
  await db.query(`insert into public.usuarios (id, email, nombre, apellido) values ($1, $2, 'Ana', 'Pérez')`, [id, email])
  await db.query(`insert into public.direcciones (usuario_id, calle) values ($1, 'Alsina')`, [id])
  return id
}
async function tienda(usuario, { pausada = true, nombre } = {}) {
  const id = (await q(`insert into public.vendedores (usuario_id, nombre_negocio, slug, descripcion_corta, instagram,
      telefono_contacto, email_contacto, logo_url, portada_url, direccion, latitud, longitud, direccion_visible,
      costos_envio_zona, metodos_entrega_default, mercadopago_conectado, notas_horarios,
      categoria_id, subcategoria_id, barrio_id, localidad_id)
    values ($1, $2, $3, 'Juegos', '@ludo', '2915551234', 'ludo@mail.com', 'logos/x.webp', 'portadas/x.webp',
      'Alsina 235', -38.7, -62.2, true, '{"1": 2000}', '{retiro,correo}', true, 'De 9 a 18', 4, 7, 12, 1)
    returning id`, [usuario, nombre || `Tienda ${seq}`, `tienda-${seq}`]))[0].id
  if (pausada) await db.query(`update public.vendedores set pausada_en = now(), mensaje_pausa = 'Vacaciones' where id = $1`, [id])
  await db.query(`insert into public.mercadopago_cuentas values ($1, 'TOKEN')`, [id])
  await db.query(`insert into public.vendedor_sellos (vendedor_id) values ($1)`, [id])
  await db.query(`insert into public.envio_zona_fallas (vendedor_id) values ($1)`, [id])
  return id
}
async function producto(vendedor) {
  const id = (await q(`insert into public.productos (vendedor_id, nombre) values ($1, 'Taza') returning id`, [vendedor]))[0].id
  for (const t of ["producto_media", "producto_variantes", "producto_sellos", "coleccion_productos", "tesoros"]) {
    await db.query(`insert into public.${t} (producto_id) values ($1)`, [id])
  }
  return id
}
// Si la tienda está pausada, el pedido se crea "de antes de pausarla": el
// disparador de la 030 rechaza pedidos nuevos a una tienda pausada.
async function pedido(comprador, vendedor, estado, { producto: prod = null, pago = null } = {}) {
  const pausa = (await q(`select pausada_en, mensaje_pausa from public.vendedores where id = $1`, [vendedor]))[0]
  if (pausa?.pausada_en) await db.query(`update public.vendedores set pausada_en = null, mensaje_pausa = null where id = $1`, [vendedor])
  const id = (await q(`insert into public.pedidos (comprador_id, vendedor_id, estado, mp_payment_id) values ($1, $2, $3, $4) returning id`,
    [comprador, vendedor, estado, pago]))[0].id
  if (pausa?.pausada_en) await db.query(`update public.vendedores set pausada_en = $2, mensaje_pausa = $3 where id = $1`, [vendedor, pausa.pausada_en, pausa.mensaje_pausa])
  await db.query(`insert into public.pedido_items (pedido_id, producto_id, nombre) values ($1, $2, 'Taza')`, [id, prod])
  return id
}
const evaluar = async (id) => (await q(`select public.rpc_evaluar_eliminar_cuenta($1) as r`, [id]))[0].r
const cerrar = async (id) => (await q(`select public.rpc_cerrar_cuenta($1) as r`, [id]))[0].r
const fila = async (id) => (await q(`select * from public.vendedores where id = $1`, [id]))[0]

// Una tienda "ajena" con la que compran las personas de las pruebas.
const otraDuena = await cuenta("otra@mail.com")
const otra = await tienda(otraDuena, { pausada: false })
const prodOtra = await producto(otra)

console.log("1. evaluar_eliminar_cuenta")
{
  const u = await cuenta("activa@mail.com")
  await tienda(u, { pausada: false })
  const e = await evaluar(u)
  ok(e.motivos.includes("TIENDA_ACTIVA") && !e.motivos.includes("TIENDA"), "tienda activa -> TIENDA_ACTIVA (ya no TIENDA)")
  ok(e.tienda?.estado === "activa" && e.tienda?.nombre, "y devuelve la tienda: { id, nombre, estado: 'activa' }")
  const r = await cerrar(u)
  ok(r.ok === false && r.motivos.includes("TIENDA_ACTIVA"), "cerrar_cuenta también la frena")
}
for (const estado of ["pagado", "preparando", "franja", "por_salir", "algo_nuevo"]) {
  const u = await cuenta(`ventas-${estado}@mail.com`)
  const t = await tienda(u)
  const comprador = await cuenta(`comprador-${estado}@mail.com`)
  await pedido(comprador, t, estado)
  const e = await evaluar(u)
  ok(e.motivos.includes("VENTA_EN_CURSO") && !e.motivos.includes("TIENDA_ACTIVA"), `pausada con una venta "${estado}" -> VENTA_EN_CURSO`)
}
{
  const u = await cuenta("cupon@mail.com")
  const t = await tienda(u)
  await pedido(otraDuena, t, "pendiente", { pago: "501" })
  ok((await evaluar(u)).motivos.includes("VENTA_EN_CURSO"), "pausada con un pago en efectivo en proceso -> VENTA_EN_CURSO")
}
let pausadaSinVentas
{
  const u = await cuenta("pausada@mail.com")
  const t = await tienda(u)
  const c = await cuenta("c-pausada@mail.com")
  for (const estado of ["despachado", "reembolsado", "cancelado", "rechazado", "pendiente"]) await pedido(c, t, estado)
  const e = await evaluar(u)
  ok(e.motivos.length === 0, "pausada con ventas terminadas (y pendientes sin pago) -> sin bloqueo")
  ok(e.tienda?.estado === "pausada", "tienda: estado 'pausada'")
  pausadaSinVentas = u
}
{
  const u = await cuenta("yacerrada@mail.com")
  const t = await tienda(u)
  await db.query(`update public.vendedores set cerrada_en = now(), pausada_en = null, mensaje_pausa = null where id = $1`, [t])
  const e = await evaluar(u)
  ok(e.motivos.length === 0 && e.tienda === null && e.tiendas === 0, "tienda ya cerrada -> no bloquea, y no cuenta como tienda")
}

console.log("\n2. Tienda pausada sin pedidos, cuenta sin pedidos -> tienda borrada, cuenta borrada")
{
  const u = await cuenta("sola@mail.com")
  const t = await tienda(u, { nombre: "Ludoméstica" })
  const p = await producto(t)
  await db.query(`insert into public.favoritos (usuario_id, producto_id) values ($1, $2)`, [otraDuena, p])
  const r = await cerrar(u)
  ok(r.ok && r.resultado === "borrada", "resultado: borrada")
  ok(r.tienda?.id === t && r.tienda.accion === "borrada" && r.tienda.nombre === "Ludoméstica", "devuelve la tienda: id, nombre (leído antes) y accion borrada")
  ok(await n(`select count(*) n from public.vendedores where id = $1`, [t]) === 0, "la fila de la tienda ya no está")
  ok(await n(`select count(*) n from public.productos where vendedor_id = $1`, [t]) === 0, "ni sus productos")
  for (const tabla of ["producto_media", "producto_variantes", "producto_sellos", "coleccion_productos", "tesoros", "favoritos"])
    ok(await n(`select count(*) n from public.${tabla} where producto_id = $1`, [p]) === 0, `${tabla}: sin filas del producto (aunque la FK no sea cascade)`)
  for (const tabla of ["mercadopago_cuentas", "vendedor_sellos", "envio_zona_fallas", "vendedor_bloqueos"])
    ok(await n(`select count(*) n from public.${tabla} where vendedor_id = $1`, [t]) === 0, `${tabla}: sin filas`)
  ok(await n(`select count(*) n from auth.users where id = $1`, [u]) === 0, "la cuenta se borró entera")
}

console.log("\n3. Tienda pausada sin pedidos, pero con compras como comprador -> tienda borrada, cuenta cáscara")
{
  const u = await cuenta("compradora@mail.com")
  const t = await tienda(u)
  const pv = await pedido(u, otra, "despachado", { producto: prodOtra })
  const pp = await pedido(u, otra, "pendiente", { producto: prodOtra })
  const r = await cerrar(u)
  ok(r.ok && r.resultado === "anonimizada" && r.tienda?.accion === "borrada", "anonimizada, tienda borrada")
  ok(await n(`select count(*) n from public.vendedores where id = $1`, [t]) === 0, "la tienda no está")
  const pend = (await q(`select estado, cancelado_motivo from public.pedidos where id = $1`, [pp]))[0]
  ok(pend.estado === "cancelado" && pend.cancelado_motivo === "cuenta_eliminada", "su pendiente de comprador: cancelado con cuenta_eliminada")
  ok((await q(`select estado from public.pedidos where id = $1`, [pv]))[0].estado === "despachado", "su compra despachada sigue igual")
  ok(r.pedidos_cancelados.length === 1, "devuelve el pedido cancelado")
}

console.log("\n4. Tienda pausada con pedidos -> tienda cerrada")
let cerrada1, duenaCerrada
{
  const u = await cuenta("conventas@mail.com")
  duenaCerrada = u
  const t = await tienda(u, { nombre: "La Cerrada" })
  cerrada1 = t
  const vendido = await producto(t)
  const sinVender = await producto(t)
  const c = await cuenta("cliente@mail.com")
  const pDesp = await pedido(c, t, "despachado", { producto: vendido })
  const pPend = await pedido(c, t, "pendiente", { producto: vendido })
  await db.query(`insert into public.favoritos (usuario_id, producto_id) values ($1, $2)`, [c, sinVender])
  const r = await cerrar(u)
  ok(r.ok && r.resultado === "anonimizada", "la cuenta va por la cáscara (no se puede borrar: los pedidos apuntan a la tienda)")
  ok(r.tienda?.id === t && r.tienda.accion === "cerrada" && r.tienda.nombre === "La Cerrada", "devuelve la tienda: accion cerrada, con el nombre de antes")
  const v = await fila(t)
  ok(v && v.cerrada_en && v.pausada_en === null && v.mensaje_pausa === null, "cerrada_en puesto, sin pausa ni mensaje")
  ok(v.slug && v.usuario_id === u && v.categoria_id === 4 && v.subcategoria_id === 7 && v.barrio_id === 12 && v.localidad_id === 1 && v.estado_validacion === "aprobado", "conserva slug, usuario_id, categoría, subcategoría, barrio, localidad y estado_validacion")
  ok(v.nombre_negocio === `cerrada-${t}`, `nombre_negocio (obligatorio y único): "cerrada-${t}"`)
  ok([v.descripcion_corta, v.instagram, v.telefono_contacto, v.email_contacto, v.logo_url, v.portada_url, v.direccion, v.latitud, v.longitud, v.notas_horarios].every((x) => x === null), "contenido, contacto, imágenes, dirección y coordenadas en NULL")
  ok(v.direccion_visible === false && JSON.stringify(v.costos_envio_zona) === "{}" && v.metodos_entrega_default.length === 0 && v.mercadopago_conectado === null, "las obligatorias, a su valor por defecto")
  ok(await n(`select count(*) n from public.mercadopago_cuentas where vendedor_id = $1`, [t]) === 0 && await n(`select count(*) n from public.vendedor_sellos where vendedor_id = $1`, [t]) === 0, "sin cuenta de MercadoPago ni sellos")
  ok(await n(`select count(*) n from public.productos where id = $1`, [sinVender]) === 0, "el producto que nunca se vendió: borrado (y su favorito)")
  ok(await n(`select count(*) n from public.productos where id = $1`, [vendido]) === 1, "el que se vendió: conservado")
  ok((await q(`select estado from public.pedidos where id = $1`, [pDesp]))[0].estado === "despachado", "la venta despachada sigue igual")
  const pend = (await q(`select estado, cancelado_motivo from public.pedidos where id = $1`, [pPend]))[0]
  ok(pend.estado === "cancelado" && pend.cancelado_motivo === "tienda_cerrada", "el pendiente de la tienda: cancelado con tienda_cerrada")
  ok((await q(`select cerrada_en from public.usuarios where id = $1`, [u]))[0].cerrada_en, "la cuenta quedó marcada como eliminada")
  ok((await cerrar(u)).resultado === "ya_cerrada", "segunda vez: ya_cerrada")

  // Otra tienda cerrada: el texto obligatorio no choca con el índice único.
  const u2 = await cuenta("conventas2@mail.com")
  const t2 = await tienda(u2)
  await pedido(c, t2, "despachado")
  const r2 = await cerrar(u2)
  ok(r2.ok && r2.tienda.accion === "cerrada" && (await fila(t2)).nombre_negocio === `cerrada-${t2}`, "una segunda tienda cerrada no choca con la primera")

  // Mis pedidos: la compradora sabe cuáles de sus tiendas cerraron (y nada más).
  await db.exec(`select set_config('test.uid', '${c}', false); set role authenticated`)
  const ids = (await q(`select public.mis_tiendas_cerradas() as r`))[0].r
  await db.exec("reset role")
  ok(ids.sort().join(",") === [t, t2].sort().join(","), "mis_tiendas_cerradas: las dos tiendas cerradas a las que les compró")
  await db.exec(`select set_config('test.uid', '${otraDuena}', false); set role authenticated`)
  const ninguna = (await q(`select public.mis_tiendas_cerradas() as r`))[0].r
  await db.exec("reset role")
  ok(ninguna.length === 0, "a otra persona no le dice nada de tiendas ajenas")
}

console.log("\n5. Sin tienda: igual que antes")
{
  const u = await cuenta("sintienda@mail.com")
  const r = await cerrar(u)
  ok(r.ok && r.resultado === "borrada" && r.tienda === null, "sin pedidos: borrada, tienda null")
  const u2 = await cuenta("sintienda2@mail.com")
  const p = await pedido(u2, otra, "rechazado")
  const r2 = await cerrar(u2)
  ok(r2.ok && r2.resultado === "anonimizada" && r2.tienda === null, "con pedidos: anonimizada")
  ok((await q(`select cancelado_motivo from public.pedidos where id = $1`, [p]))[0].cancelado_motivo === "cuenta_eliminada", "el rechazado: cancelado con cuenta_eliminada")
  const u3 = await cuenta("pagando@mail.com")
  await pedido(u3, otra, "pagado")
  ok((await cerrar(u3)).motivos?.includes("PEDIDO_ACTIVO"), "una compra en camino sigue frenando (PEDIDO_ACTIVO)")
  ok((await cerrar(pausadaSinVentas)).ok, "y la pausada sin ventas de la sección 1 se elimina")
}

console.log("\n6. borrar_tienda_de_prueba")
{
  const u = await cuenta("prueba@mail.com")
  const t = await tienda(u, { pausada: false, nombre: "Tienda de prueba" })
  const p1 = await producto(t)
  const c = await cuenta("comprador-prueba@mail.com")
  const ped = await pedido(c, t, "pagado", { producto: p1 })
  await db.query(`insert into public.pagos_dobles values ($1, 'x')`, [ped])
  // Un ítem de un pedido de OTRA tienda que apunta a un producto de esta.
  await pedido(c, otra, "despachado", { producto: p1 })
  let error = null
  try { await db.exec("set role authenticated"); await db.query(`select public.rpc_borrar_tienda_de_prueba($1)`, [t]) } catch (e) { error = e } finally { await db.exec("reset role") }
  ok(error && /permission denied/.test(error.message), "authenticated no puede")
  await db.exec("set role service_role")
  const r = (await q(`select public.rpc_borrar_tienda_de_prueba($1) as r`, [t]))[0].r
  await db.exec("reset role")
  ok(r.ok && r.id === t && r.nombre === "Tienda de prueba" && r.pedidos_borrados === 1, "service_role sí: devuelve id, nombre y cuántos pedidos borró")
  ok(await n(`select count(*) n from public.vendedores where id = $1`, [t]) === 0, "la tienda no está")
  ok(await n(`select count(*) n from public.pedidos where vendedor_id = $1`, [t]) === 0, "ni sus pedidos")
  ok(await n(`select count(*) n from public.pedido_items where producto_id = $1`, [p1]) === 0, "ni los ítems de sus productos")
  ok(await n(`select count(*) n from public.pagos_dobles where pedido_id = $1`, [ped]) === 0, "ni sus pagos dobles")
  ok(await n(`select count(*) n from public.usuarios where id = $1`, [u]) === 1, "la cuenta de la dueña queda")
  ok((await q(`select public.rpc_borrar_tienda_de_prueba(99999) as r`))[0].r.ok === false, "una tienda que no existe: ok false")
}

console.log("\n7. waitlist y la verificación")
ok(await n(`select count(*) n from pg_class where relname = 'waitlist'`) === 0, "la tabla waitlist no existe")
const verif = await q(MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length))
const v = JSON.parse(verif[0].verificacion)
ok(Object.values(v.funciones).every(Boolean) && v.waitlist_existe === false, "funciones creadas y waitlist borrada")
ok(v.permisos_borrar_de_prueba.service_role && !v.permisos_borrar_de_prueba.anon && !v.permisos_borrar_de_prueba.authenticated, "permisos de borrar_tienda_de_prueba")
ok(v.permisos_mis_tiendas_cerradas.authenticated && !v.permisos_mis_tiendas_cerradas.anon, "permisos de mis_tiendas_cerradas")
ok(v.columnas_que_se_borran.includes("nombre_negocio -> vacio") && v.columnas_que_se_borran.includes("instagram -> null"), "lista lo que se borra")
ok(v.tiendas.some((t) => t.motivos.includes("TIENDA_ACTIVA")), "y lo que diría evaluar de cada tienda")

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
