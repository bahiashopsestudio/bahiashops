// Prueba de la migración 022 (vencimiento de los links de pago) contra una base
// local (PGlite: Postgres real en WebAssembly, sin instalar nada). No toca
// Supabase ni ninguna base real.
//
//   npm run probar:022
//
// La tabla pedidos imita la de producción en lo que importa acá. Se corre dos
// veces la prueba entera, con los dos regímenes de permisos que podría tener
// pedidos para authenticated (select de tabla y select por columna), porque no
// se sabe cuál es el de producción: Mis pedidos tiene que poder leer las
// columnas nuevas en los dos. Lo que NO prueba: RLS ni PostgREST.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const MIG = readFileSync(new URL("../sql/migrations/022_pedidos_vencimiento.sql", import.meta.url), "utf8")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const q = async (db, sql, p) => (await db.query(sql, p)).rows
const n = async (db, sql, p) => Number((await q(db, sql, p))[0].n)

// Corre sql con un rol y devuelve el mensaje de error (o null).
async function como(db, rol, sql, p) {
  try {
    await db.exec(`set role ${rol}`)
    await db.query(sql, p)
    return null
  } catch (e) {
    return e.message
  } finally {
    await db.exec("reset role")
  }
}

const COLUMNAS_VIEJAS = "id, vendedor_id, estado, mp_payment_id, creado_en, actualizado_en"

async function correr(titulo, permisosDeAuthenticated) {
  console.log(`\n════ ${titulo} ════`)
  const db = new PGlite()
  await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema privado;
  grant usage on schema privado to anon, authenticated;   -- como 007

  create table public.pedidos (
    id bigserial primary key,
    vendedor_id bigint not null,
    estado text not null,
    mp_payment_id text,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
  );
  revoke all on public.pedidos from anon, authenticated;
  grant all on public.pedidos to service_role;
  grant usage on all sequences in schema public to service_role;
  ${permisosDeAuthenticated}
  `)

  // La migración, dos veces (tiene que poder correrse de nuevo)
  await db.exec(MIG)
  await db.exec(MIG)
  console.log("Migración corrida dos veces sin errores.\n")

  console.log("1. Columnas, constraint e índice")
  ok(await n(db, `select count(*) n from information_schema.columns where table_name = 'pedidos' and column_name in ('vence_en', 'cancelado_motivo')`) === 2, "las dos columnas existen")
  ok(await n(db, `select count(*) n from pg_indexes where indexname = 'pedidos_pendientes_por_vencer'`) === 1, "el índice parcial existe (una sola vez)")
  const indice = (await q(db, `select indexdef from pg_indexes where indexname = 'pedidos_pendientes_por_vencer'`))[0].indexdef
  ok(/pendiente/.test(indice) && /vence_en IS NOT NULL/i.test(indice), "el índice es parcial: pendientes con vencimiento")
  for (const motivo of ["pago_vencido", "cuenta_eliminada", "tienda_cerrada", null]) {
    const e = await como(db, "service_role", `insert into public.pedidos (vendedor_id, estado, cancelado_motivo) values (1, 'cancelado', $1)`, [motivo])
    ok(e === null, `cancelado_motivo acepta ${motivo === null ? "null" : motivo}`)
  }
  const mal = await como(db, "service_role", `insert into public.pedidos (vendedor_id, estado, cancelado_motivo) values (1, 'cancelado', 'porque_si')`)
  ok(!!mal && /pedidos_cancelado_motivo_valido/.test(mal), "cancelado_motivo rechaza un valor desconocido")
  await db.exec(`delete from public.pedidos`)

  // ── Pedidos de prueba ──
  async function pedido(vendedor, estado, { pago = null, vence = "now() - interval '1 hour'" } = {}) {
    return (await q(db, `insert into public.pedidos (vendedor_id, estado, mp_payment_id, vence_en, actualizado_en)
                         values ($1, $2, $3, ${vence}, now() - interval '2 days') returning id`, [vendedor, estado, pago]))[0].id
  }
  const estado = async (id) => (await q(db, `select estado, cancelado_motivo, actualizado_en > now() - interval '1 minute' as tocado from public.pedidos where id = $1`, [id]))[0]
  const cancelar = async (tienda) => (await q(db, `select public.rpc_cancelar_pedidos_vencidos($1) as r`, tienda === undefined ? [null] : [tienda]))[0].r

  console.log("\n2. Cancela SOLO los pendientes, sin pago, con vencimiento pasado")
  const aNull = await pedido(1, "pendiente")
  const aVacio = await pedido(1, "pendiente", { pago: "" })
  const aTextoNull = await pedido(1, "pendiente", { pago: "null" })
  const aTextoUndef = await pedido(1, "pendiente", { pago: "undefined" })
  const aEspacios = await pedido(1, "pendiente", { pago: "   " })
  const conPago = await pedido(1, "pendiente", { pago: "123456" })
  const futuro = await pedido(1, "pendiente", { vence: "now() + interval '2 days'" })
  const sinVence = await pedido(1, "pendiente", { vence: "null" })
  const pagado = await pedido(1, "pagado", { pago: "777" })
  const preparando = await pedido(1, "preparando", { pago: "778" })
  const rechazado = await pedido(1, "rechazado")
  const yaCancelado = await pedido(1, "cancelado")

  const cantidad = await cancelar()
  ok(cantidad === 5, `devuelve cuántos canceló (5): ${cantidad}`)
  for (const [nombre, id] of [["sin pago (null)", aNull], ["pago vacío", aVacio], ["pago 'null'", aTextoNull], ["pago 'undefined'", aTextoUndef], ["pago con espacios", aEspacios]]) {
    const e = await estado(id)
    ok(e.estado === "cancelado" && e.cancelado_motivo === "pago_vencido" && e.tocado, `${nombre}: cancelado con pago_vencido y actualizado_en al día`)
  }
  for (const [nombre, id, esperado] of [
    ["con un pago en proceso", conPago, "pendiente"],
    ["con vencimiento futuro", futuro, "pendiente"],
    ["sin vencimiento (pedido viejo)", sinVence, "pendiente"],
    ["pagado", pagado, "pagado"],
    ["preparando", preparando, "preparando"],
    ["rechazado", rechazado, "rechazado"],
  ]) {
    const e = await estado(id)
    ok(e.estado === esperado && e.cancelado_motivo === null && !e.tocado, `${nombre}: intacto`)
  }
  const yc = await estado(yaCancelado)
  ok(yc.estado === "cancelado" && yc.cancelado_motivo === null && !yc.tocado, "ya cancelado por otro motivo: no se le pone pago_vencido")
  ok(await cancelar() === 0, "segunda vez: no hay nada más que cancelar (devuelve 0)")

  console.log("\n3. El filtro por tienda")
  const t1 = await pedido(10, "pendiente")
  const t2 = await pedido(20, "pendiente")
  ok(await cancelar(10) === 1, "con la tienda 10 cancela uno")
  ok((await estado(t1)).estado === "cancelado" && (await estado(t2)).estado === "pendiente", "solo el de la tienda 10; el de la 20 sigue pendiente")
  ok(await cancelar(99) === 0, "una tienda sin vencidos: 0")
  ok((await estado(t2)).estado === "pendiente", "y no toca a las demás")
  ok(await cancelar() === 1 && (await estado(t2)).estado === "cancelado", "sin tienda cancela el resto")

  console.log("\n4. Permisos: solo service_role")
  for (const rol of ["anon", "authenticated"]) {
    for (const f of ["public.rpc_cancelar_pedidos_vencidos", "privado.cancelar_pedidos_vencidos"]) {
      const e = await como(db, rol, `select ${f}(1)`)
      ok(!!e && /permission denied/.test(e), `${rol} no puede ejecutar ${f}`)
    }
  }
  ok(await como(db, "service_role", `select public.rpc_cancelar_pedidos_vencidos()`) === null, "service_role sí puede (sin argumento)")
  ok(await como(db, "service_role", `select public.rpc_cancelar_pedidos_vencidos(1)`) === null, "service_role sí puede (con tienda)")

  console.log("\n5. Mis pedidos puede leer las columnas nuevas (authenticated)")
  ok(await como(db, "authenticated", `select vence_en, cancelado_motivo from public.pedidos`) === null, "authenticated lee vence_en y cancelado_motivo")
  ok(await como(db, "authenticated", `select ${COLUMNAS_VIEJAS} from public.pedidos`) === null, "y sigue leyendo las columnas de siempre")
  const e = await como(db, "authenticated", `update public.pedidos set vence_en = now()`)
  ok(!!e && /permission denied/.test(e), "pero no las escribe")
  ok(await n(db, `select count(*) n from information_schema.table_privileges where table_name = 'pedidos' and grantee = 'anon'`) === 0, "anon sigue sin ningún permiso sobre pedidos")

  console.log("\n6. Deshacer (el bloque comentado al final de la migración)")
  const bloque = MIG.split("-- Para deshacer")[1].split("\n").filter((l) => l.startsWith("-- ") && !l.startsWith("-- (") && !l.startsWith("-- =")).map((l) => l.slice(3)).filter((l) => /^(begin|commit|drop|alter)/.test(l)).join("\n")
  await db.exec(bloque)
  ok(await n(db, `select count(*) n from pg_proc where proname in ('cancelar_pedidos_vencidos', 'rpc_cancelar_pedidos_vencidos')`) === 0, "sin funciones")
  ok(await n(db, `select count(*) n from information_schema.columns where table_name = 'pedidos' and column_name in ('vence_en', 'cancelado_motivo')`) === 0, "sin columnas nuevas")
  ok(await n(db, `select count(*) n from pg_indexes where indexname = 'pedidos_pendientes_por_vencer'`) === 0, "sin índice")
  await db.exec(MIG)
  ok(true, "y se puede volver a aplicar después de deshacer")
}

await correr("authenticated con select de TABLA sobre pedidos", `grant select on public.pedidos to authenticated;`)
await correr("authenticated con select POR COLUMNA sobre pedidos (solo las de siempre)", `grant select (${COLUMNAS_VIEJAS}) on public.pedidos to authenticated;`)

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
