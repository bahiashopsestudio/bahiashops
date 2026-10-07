// Prueba de la migración 024 (qué cuenta de MercadoPago cobra cada pedido)
// contra una base local (PGlite: Postgres real en WebAssembly, sin instalar
// nada). No toca Supabase ni ninguna base real.
//
//   npm run probar:024
//
// Se corren antes la 022 y la 023 reales, porque la 024 cambia una restricción
// que nace en la 022 y se apoya en columnas de las dos. Lo que NO prueba: RLS
// ni PostgREST.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const M022 = leer("022_pedidos_vencimiento.sql")
const M023 = leer("023_pedidos_link_de_pago.sql")
const MIG = leer("024_mp_cuenta_de_cobro.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

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

async function correr() {
const db = new PGlite()
const q = async (sql, p) => (await db.query(sql, p)).rows
const n = async (sql, p) => Number((await q(sql, p))[0].n)

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema privado;
  grant usage on schema privado to anon, authenticated;   -- como 007

  create table public.pedidos (
    id bigserial primary key,
    vendedor_id bigint not null,
    estado text not null,
    mp_payment_id text,
    mp_preference_id text,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
  );
  revoke all on public.pedidos from anon, authenticated;
  grant all on public.pedidos to service_role;
  grant select on public.pedidos to authenticated;
  grant usage on all sequences in schema public to service_role;

  -- Como en producción: conectado_en ya existe (not null, default now()) y anon y
  -- authenticated tienen TODOS los permisos de tabla; solo los frena RLS sin políticas.
  create table public.mercadopago_cuentas (
    vendedor_id bigint primary key, mp_user_id text, access_token text, refresh_token text,
    public_key text, token_expira_en timestamptz, actualizado_en timestamptz,
    conectado_en timestamptz not null default now()
  );
  alter table public.mercadopago_cuentas enable row level security;
  grant all on public.mercadopago_cuentas to anon, authenticated, service_role;
  insert into public.mercadopago_cuentas (vendedor_id, mp_user_id, access_token, conectado_en)
    values (14, '3507656740', 'token-de-mentira', '2026-10-05T16:32:22Z');
`)
await db.exec(M022)
await db.exec(M023)

await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

console.log("1. Columnas y restricción")
ok(await n(`select count(*) n from information_schema.columns where table_name = 'pedidos' and column_name = 'mp_user_id_cobro'`) === 1, "pedidos.mp_user_id_cobro existe")
ok(await n(`select count(*) n from information_schema.columns where table_name = 'mercadopago_cuentas' and column_name = 'mp_nickname'`) === 1, "mercadopago_cuentas.mp_nickname existe")
ok(await n(`select count(*) n from information_schema.columns where table_name = 'mercadopago_cuentas' and column_name = 'conectada_en'`) === 0, "NO se creó conectada_en (la columna es conectado_en, que ya existía)")
const conectado = (await q(`select data_type, is_nullable, column_default from information_schema.columns where table_name = 'mercadopago_cuentas' and column_name = 'conectado_en'`))[0]
ok(conectado.data_type === 'timestamp with time zone' && conectado.is_nullable === 'NO' && /now\(\)/.test(conectado.column_default), "conectado_en sigue igual: timestamptz, not null, default now()")
ok(new Date((await q(`select conectado_en from public.mercadopago_cuentas where vendedor_id = 14`))[0].conectado_en).toISOString() === '2026-10-05T16:32:22.000Z', "y el valor de la fila que ya existía no se tocó")
for (const motivo of ["pago_vencido", "cuenta_eliminada", "tienda_cerrada", "cuenta_mp_cambiada", null]) {
  const e = await como(db, "service_role", `insert into public.pedidos (vendedor_id, estado, cancelado_motivo) values (1, 'cancelado', $1)`, [motivo])
  ok(e === null, `cancelado_motivo acepta ${motivo === null ? "null" : motivo}`)
}
const mal = await como(db, "service_role", `insert into public.pedidos (vendedor_id, estado, cancelado_motivo) values (1, 'cancelado', 'porque_si')`)
ok(!!mal && /pedidos_cancelado_motivo_valido/.test(mal), "sigue rechazando un motivo desconocido")
await db.exec(`delete from public.pedidos`)

// ── Pedidos de prueba ──
async function pedido(tienda, estado, { pago = null, cuenta = "AAA", pref = null } = {}) {
  return (await q(`insert into public.pedidos (vendedor_id, estado, mp_payment_id, mp_user_id_cobro, mp_preference_id, actualizado_en)
                   values ($1, $2, $3, $4, $5, now() - interval '2 days') returning id`, [tienda, estado, pago, cuenta, pref]))[0].id
}
const estado = async (id) => (await q(`select estado, cancelado_motivo, actualizado_en > now() - interval '1 minute' as tocado from public.pedidos where id = $1`, [id]))[0]
const cancelar = async (tienda, motivo = "cuenta_mp_cambiada", conservar = null) =>
  (await q(`select public.rpc_cancelar_pedidos_de_tienda($1, $2, $3) as r`, [tienda, motivo, conservar]))[0].r

console.log("\n2. Desconexión: cancela TODOS los pendientes sin pago de la tienda")
const d1 = await pedido(1, "pendiente", { pref: "pref-d1" })
const d2 = await pedido(1, "pendiente", { cuenta: "BBB", pref: "pref-d2" })
const dNull = await pedido(1, "pendiente", { cuenta: null, pref: "pref-dnull" })
const dVacio = await pedido(1, "pendiente", { pago: "", pref: "pref-dvacio" })
const dTexto = await pedido(1, "pendiente", { pago: "undefined" })
const dPago = await pedido(1, "pendiente", { pago: "555", pref: "pref-dpago" })
const dPagado = await pedido(1, "pagado", { pago: "556" })
const dPrep = await pedido(1, "preparando", { pago: "557" })
const dRech = await pedido(1, "rechazado")
const dOtraTienda = await pedido(2, "pendiente", { pref: "pref-otra" })
let r = await cancelar(1)
ok(r.cancelados.length === 5, `cancela 5 (sin pago, de cualquier cuenta, también los que no tienen cuenta): ${r.cancelados.length}`)
ok(JSON.stringify(r.cancelados.map((c) => c.id).sort((a, b) => a - b)) === JSON.stringify([d1, d2, dNull, dVacio, dTexto].sort((a, b) => a - b)), "los ids correctos")
ok(r.cancelados.find((c) => c.id === d1).mp_preference_id === "pref-d1", "devuelve la preferencia de cada uno (para vencer su link)")
ok(r.en_proceso === 1, "cuenta 1 pedido con un pago en proceso, sin tocarlo")
for (const id of [d1, d2, dNull, dVacio, dTexto]) {
  const e = await estado(id)
  ok(e.estado === "cancelado" && e.cancelado_motivo === "cuenta_mp_cambiada" && e.tocado, `pedido ${id}: cancelado con cuenta_mp_cambiada y actualizado_en al día`)
}
for (const [nombre, id, esperado] of [["con un pago en proceso", dPago, "pendiente"], ["pagado", dPagado, "pagado"], ["preparando", dPrep, "preparando"], ["rechazado", dRech, "rechazado"], ["de otra tienda", dOtraTienda, "pendiente"]]) {
  const e = await estado(id)
  ok(e.estado === esperado && e.cancelado_motivo === null && !e.tocado, `${nombre}: intacto`)
}
r = await cancelar(1)
ok(r.cancelados.length === 0 && r.en_proceso === 1, "segunda vez: no queda nada por cancelar (idempotente)")

console.log("\n3. Cambio de cuenta: conserva los pedidos de la cuenta nueva")
await db.exec(`delete from public.pedidos`)
const c1 = await pedido(5, "pendiente", { cuenta: "VIEJA", pref: "p1" })
const c2 = await pedido(5, "pendiente", { cuenta: "VIEJA", pref: "p2" })
const cNuevaCuenta = await pedido(5, "pendiente", { cuenta: "NUEVA", pref: "p3" })
const cSinDato = await pedido(5, "pendiente", { cuenta: null, pref: "p4" })
const cConPago = await pedido(5, "pendiente", { cuenta: "VIEJA", pago: "999", pref: "p5" })
r = await cancelar(5, "cuenta_mp_cambiada", "NUEVA")
ok(r.cancelados.length === 3, `cancela los de la cuenta vieja y los que no saben cuenta (3): ${r.cancelados.length}`)
ok((await estado(c1)).estado === "cancelado" && (await estado(c2)).estado === "cancelado", "los de la cuenta vieja: cancelados")
ok((await estado(cSinDato)).estado === "cancelado", "el que no guardó cuenta (no se sabe quién lo cobra): cancelado")
ok((await estado(cNuevaCuenta)).estado === "pendiente", "el que cobra la cuenta nueva: SIGUE pendiente")
ok((await estado(cConPago)).estado === "pendiente", "el pago en proceso no se toca")
ok(r.en_proceso === 1, "y se cuenta como pago en proceso (solo los que tienen un pago)")

console.log("\n4. El motivo lo valida la restricción")
const e = await como(db, "service_role", `select public.rpc_cancelar_pedidos_de_tienda(5, 'motivo_inventado', 'NUEVA')`)
ok(e === null, "la función no valida el motivo (no hay nada que cancelar)…")
await pedido(6, "pendiente")
const malMotivo = await como(db, "service_role", `select public.rpc_cancelar_pedidos_de_tienda(6, 'motivo_inventado', null)`)
ok(!!malMotivo && /pedidos_cancelado_motivo_valido/.test(malMotivo), "…pero un motivo desconocido no se puede escribir si hay algo que cancelar")
ok((await q(`select estado from public.pedidos where vendedor_id = 6`))[0].estado === "pendiente", "y entonces no se cancela nada (todo o nada)")

console.log("\n5. Permisos: solo service_role")
for (const rol of ["anon", "authenticated"]) {
  for (const f of ["public.rpc_cancelar_pedidos_de_tienda", "privado.cancelar_pedidos_de_tienda"]) {
    const err = await como(db, rol, `select ${f}(1, 'cuenta_mp_cambiada', null)`)
    ok(!!err && /permission denied/.test(err), `${rol} no puede ejecutar ${f}`)
  }
  const tabla = await como(db, rol, `select mp_nickname from public.mercadopago_cuentas`)
  ok(!!tabla && /permission denied/.test(tabla), `${rol} no puede leer mercadopago_cuentas (ni el nombre de la cuenta)`)
}
ok(await como(db, "service_role", `select public.rpc_cancelar_pedidos_de_tienda(1, 'cuenta_mp_cambiada', null)`) === null, "service_role sí puede")
ok(await como(db, "service_role", `select mp_nickname, conectado_en from public.mercadopago_cuentas`) === null, "service_role lee mp_nickname y conectado_en")
ok(await como(db, "service_role", `insert into public.mercadopago_cuentas (vendedor_id, mp_user_id) values (99, 'x')`) === null, "service_role escribe (como el callback)")
ok(await como(db, "service_role", `delete from public.mercadopago_cuentas where vendedor_id = 99`) === null, "y borra (como la desconexión)")

console.log("\n5b. mercadopago_cuentas: los tokens, fuera del alcance del navegador")
for (const rol of ["anon", "authenticated"]) {
  for (const [nombre, sql] of [
    ["leer", "select access_token from public.mercadopago_cuentas"],
    ["insertar", "insert into public.mercadopago_cuentas (vendedor_id, mp_user_id) values (98, 'x')"],
    ["actualizar", "update public.mercadopago_cuentas set mp_user_id = 'x'"],
    ["borrar", "delete from public.mercadopago_cuentas"],
    ["vaciar la tabla (TRUNCATE ignora RLS)", "truncate public.mercadopago_cuentas"],
  ]) {
    const err = await como(db, rol, sql)
    ok(!!err && /permission denied/.test(err), `${rol} no puede ${nombre}`)
  }
  for (const permiso of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
    ok((await q(`select has_table_privilege('${rol}', 'public.mercadopago_cuentas', '${permiso}') as t`))[0].t === false, `${rol}: has_table_privilege ${permiso} = false`)
  }
}
ok(await n("select count(*) n from information_schema.column_privileges where table_name = 'mercadopago_cuentas' and grantee in ('anon', 'authenticated')") === 0, "ningún permiso por columna para anon ni authenticated")
ok(await n("select count(*) n from public.mercadopago_cuentas where vendedor_id = 14") === 1, "las filas (y los tokens) siguen ahí: solo se quitaron permisos")

console.log("\n5c. La consulta de verificación de la migración")
const verificacion = MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("-- ====", MIG.indexOf("select jsonb_pretty"))).trim().replace(/;$/, "")
const v = JSON.parse((await q(verificacion))[0].verificacion)
const permisosCuentas = v.mercadopago_cuentas_permisos
ok(Object.values(permisosCuentas.anon).every((x) => x === false) && Object.keys(permisosCuentas.anon).length === 7, "verificación: anon, los siete permisos en false")
ok(Object.values(permisosCuentas.authenticated).every((x) => x === false) && Object.keys(permisosCuentas.authenticated).length === 7, "verificación: authenticated, los siete permisos en false")
ok(permisosCuentas.service_role_select === true && permisosCuentas.columnas_con_permiso_para_el_navegador === 0, "verificación: service_role conserva el acceso y ninguna columna queda abierta")
ok(v.permisos_rpc.anon === false && v.permisos_rpc.authenticated === false && v.permisos_rpc.service_role === true, "verificación: la función solo para service_role")
ok(JSON.stringify(v.columnas_cuentas) === JSON.stringify(["conectado_en", "mp_nickname"]), "verificación: mercadopago_cuentas tiene conectado_en y mp_nickname, y no conectada_en")
ok(v.conectado_en.default.includes("now()") && v.conectado_en.nulo === "NO", "verificación: conectado_en intacta")

console.log("\n6. Deshacer (el bloque comentado al final de la migración)")
const bloque = MIG.split("-- Para deshacer")[1].split("\n").filter((l) => l.startsWith("-- ") && !l.startsWith("-- (") && !l.startsWith("-- =")).map((l) => l.slice(3)).filter((l) => /^(begin|commit|drop|alter|update|grant)/.test(l)).join("\n")
await db.exec(bloque)
ok(await n(`select count(*) n from pg_proc where proname in ('cancelar_pedidos_de_tienda', 'rpc_cancelar_pedidos_de_tienda')`) === 0, "sin funciones")
ok(await n(`select count(*) n from information_schema.columns where (table_name = 'pedidos' and column_name = 'mp_user_id_cobro') or (table_name = 'mercadopago_cuentas' and column_name = 'mp_nickname')`) === 0, "sin columnas nuevas")
ok(await n(`select count(*) n from information_schema.columns where table_name = 'mercadopago_cuentas' and column_name = 'conectado_en'`) === 1, "y conectado_en sigue ahí: el deshacer no toca lo que ya existía")
ok(await como(db, "anon", "select mp_user_id from public.mercadopago_cuentas") === null, "el deshacer devuelve los permisos de la tabla (para volver exactamente a antes)")
ok(await n(`select count(*) n from public.pedidos where cancelado_motivo = 'cuenta_mp_cambiada'`) === 0, "los cancelados con el motivo nuevo pasaron a otro motivo antes de sacarlo de la restricción")

}

await correr()
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
