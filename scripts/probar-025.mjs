// Prueba de la migración 025 (pago en efectivo, cancelación de vencidos y pagos
// dobles) contra una base local (PGlite: Postgres real en WebAssembly). No toca
// Supabase ni ninguna base real.
//
//   npm run probar:025
//
// Se corren antes la 022, la 023 y la 024 reales: la 025 reemplaza una función
// de la 022 y borra una de la 024. Lo que NO prueba: RLS ni PostgREST.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const M022 = leer("022_pedidos_vencimiento.sql")
const M023 = leer("023_pedidos_link_de_pago.sql")
const M024 = leer("024_mp_cuenta_de_cobro.sql")
const MIG = leer("025_pago_en_efectivo.sql")

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
  grant usage on schema privado to anon, authenticated;

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

  create table public.mercadopago_cuentas (
    vendedor_id bigint primary key, mp_user_id text, access_token text, refresh_token text,
    public_key text, token_expira_en timestamptz, actualizado_en timestamptz,
    conectado_en timestamptz not null default now()
  );
  alter table public.mercadopago_cuentas enable row level security;
  grant all on public.mercadopago_cuentas to anon, authenticated, service_role;
`)
await db.exec(M022)
await db.exec(M023)
await db.exec(M024)

await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

console.log("1. Lo de 'cancelar al cambiar de cuenta' sigue hasta la 026 (el código publicado lo llama)")
ok(await n(`select count(*) n from pg_proc where proname in ('cancelar_pedidos_de_tienda', 'rpc_cancelar_pedidos_de_tienda')`) === 2, "las dos funciones siguen existiendo: la 025 no las borra")
ok(await n(`select count(*) n from pg_proc where proname in ('cancelar_pedidos_vencidos', 'rpc_cancelar_pedidos_vencidos')`) === 2, "las de vencidos siguen")
const motivos = (await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'pedidos_cancelado_motivo_valido'`))[0].d
ok(motivos.includes("cuenta_mp_cambiada"), "el CHECK de cancelado_motivo conserva cuenta_mp_cambiada (hay pedidos con ese motivo)")
ok(await como(db, "service_role", `insert into public.pedidos (vendedor_id, estado, cancelado_motivo) values (1, 'cancelado', 'cuenta_mp_cambiada')`) === null, "y se puede seguir guardando")

console.log("\n2. efectivo_vence_en")
ok(await n(`select count(*) n from information_schema.columns where table_name = 'pedidos' and column_name = 'efectivo_vence_en'`) === 1, "la columna existe")
ok((await q(`select has_column_privilege('authenticated', 'public.pedidos', 'efectivo_vence_en', 'select') t`))[0].t === true, "authenticated la lee (Mis pedidos)")
ok((await q(`select has_column_privilege('anon', 'public.pedidos', 'efectivo_vence_en', 'select') t`))[0].t === false, "anon no")
ok(await como(db, "authenticated", `update public.pedidos set efectivo_vence_en = now()`) !== null, "authenticated no la escribe")
ok(await como(db, "service_role", `update public.pedidos set efectivo_vence_en = now() where false`) === null, "service_role sí")

console.log("\n3. cancelar_pedidos_vencidos con dos plazos")
await db.exec(`truncate public.pedidos restart identity cascade`)
const hace = (h) => `now() - interval '${h} hours'`
const en = (h) => `now() + interval '${h} hours'`
const nuevo = async (estado, { pago = null, vence = null, efectivo = null, tienda = 1 } = {}) =>
  (await q(`insert into public.pedidos (vendedor_id, estado, mp_payment_id, vence_en, efectivo_vence_en)
            values ($1, $2, $3, ${vence ?? "null"}, ${efectivo ?? "null"}) returning id`, [tienda, estado, pago]))[0].id
const estadoDe = async (id) => (await q(`select estado, cancelado_motivo m from public.pedidos where id = $1`, [id]))[0]
const cancelar = async (t) => (await q(`select public.rpc_cancelar_pedidos_vencidos($1) as r`, [t ?? null]))[0].r

const sinPagoVencido = await nuevo("pendiente", { vence: hace(3) })
const sinPagoVigente = await nuevo("pendiente", { vence: en(1) })
const efectivoVigente = await nuevo("pendiente", { pago: "111", vence: hace(5), efectivo: en(48) })
const efectivoVencido = await nuevo("pendiente", { pago: "222", vence: hace(80), efectivo: hace(30) })
const efectivoEnMargen = await nuevo("pendiente", { pago: "555", vence: hace(80), efectivo: hace(5) })
const enProcesoSinTicket = await nuevo("pendiente", { pago: "333", vence: hace(5) })
const textoNull = await nuevo("pendiente", { pago: "null", vence: hace(5) })
const pagado = await nuevo("pagado", { pago: "444", vence: hace(5), efectivo: hace(1) })
const viejo = await nuevo("pendiente")
const otraTienda = await nuevo("pendiente", { vence: hace(3), tienda: 2 })

ok(await cancelar(1) === 3, "con tienda 1 cancela 3: sin pago vencido, ticket vencido hace más de 6 h y pago en texto 'null'")
ok((await estadoDe(efectivoEnMargen)).estado === "pendiente", "ticket vencido hace 5 h: sigue pendiente (margen de 6 h para que se acredite)")
ok((await estadoDe(sinPagoVencido)).estado === "cancelado" && (await estadoDe(sinPagoVencido)).m === "pago_vencido", "sin pago y link vencido: cancelado / pago_vencido")
ok((await estadoDe(sinPagoVigente)).estado === "pendiente", "sin pago y link vigente: sigue pendiente")
ok((await estadoDe(efectivoVigente)).estado === "pendiente", "ticket en efectivo vigente: NO se cancela aunque el link ya venció")
ok((await estadoDe(efectivoVencido)).estado === "cancelado" && (await estadoDe(efectivoVencido)).m === "pago_vencido", "ticket vencido hace 30 h: cancelado / pago_vencido")
ok((await estadoDe(enProcesoSinTicket)).estado === "pendiente", "pago en proceso sin fecha de ticket: no se toca (igual que antes)")
ok((await estadoDe(textoNull)).estado === "cancelado", "mp_payment_id con el texto 'null' cuenta como sin pago")
ok((await estadoDe(pagado)).estado === "pagado", "un pedido pagado no se toca aunque tenga fechas viejas")
ok((await estadoDe(viejo)).estado === "pendiente", "pedido viejo sin vence_en: no se toca")
ok((await estadoDe(otraTienda)).estado === "pendiente", "otra tienda: no se toca")
ok(await cancelar() === 1, "sin tienda cancela el resto (la otra tienda)")
await db.exec("update public.pedidos set efectivo_vence_en = now() - interval '7 hours' where id = " + efectivoEnMargen)
ok(await cancelar() === 1 && (await estadoDe(efectivoEnMargen)).m === "pago_vencido", "pasadas las 6 h del margen (a las 7 h), el ticket sí se cancela")
ok(await cancelar() === 0, "correrla de nuevo no cancela nada más")

console.log("\n4. Permisos de las funciones")
for (const f of ["public.rpc_cancelar_pedidos_vencidos", "privado.cancelar_pedidos_vencidos"]) {
  for (const rol of ["anon", "authenticated"]) {
    ok(/permission denied/.test((await como(db, rol, `select ${f}()`)) || ""), `${rol} no puede ejecutar ${f}`)
  }
  ok(await como(db, "service_role", `select ${f}()`) === null, `service_role sí puede ejecutar ${f}`)
}

console.log("\n5. pagos_dobles")
await db.exec(`truncate public.pedidos restart identity cascade`)
const p1 = (await q(`insert into public.pedidos (vendedor_id, estado) values (1, 'pagado') returning id`))[0].id
ok(await como(db, "service_role", `insert into public.pagos_dobles (pedido_id, pago_id) values (${p1}, 'A')`) === null, "service_role registra un pago doble")
ok(/duplicate key/.test((await como(db, "service_role", `insert into public.pagos_dobles (pedido_id, pago_id) values (${p1}, 'A')`)) || ""), "el mismo pago no se registra dos veces (por eso el aviso sale una sola vez)")
ok(await como(db, "service_role", `insert into public.pagos_dobles (pedido_id, pago_id) values (${p1}, 'B')`) === null, "otro pago del mismo pedido sí")
ok(await como(db, "service_role", `insert into public.pagos_dobles (pedido_id, pago_id) values (99999, 'C')`) !== null, "no se puede registrar sobre un pedido que no existe")
ok(await como(db, "service_role", `select * from public.pagos_dobles`) === null, "service_role lee")
ok(/permission denied/.test((await como(db, "service_role", `update public.pagos_dobles set pago_id = 'Z'`)) || ""), "service_role no modifica: es un registro")
for (const rol of ["anon", "authenticated"]) {
  for (const [nombre, sql] of [
    ["leer", "select * from public.pagos_dobles"],
    ["insertar", `insert into public.pagos_dobles (pedido_id, pago_id) values (${p1}, 'X')`],
    ["borrar", "delete from public.pagos_dobles"],
    ["vaciar", "truncate public.pagos_dobles"],
  ]) {
    ok(/permission denied/.test((await como(db, rol, sql)) || ""), `${rol} no puede ${nombre}`)
  }
}
await db.exec(`delete from public.pedidos where id = ${p1}`)
ok(await n(`select count(*) n from public.pagos_dobles`) === 0, "al borrarse el pedido (eliminar cuenta) se borran sus pagos dobles")

console.log("\n6. La consulta de verificación de la migración")
const verificacion = MIG.slice(MIG.indexOf("select jsonb_pretty")).trim().replace(/;$/, "")
const v = JSON.parse((await q(verificacion))[0].verificacion)
ok(v.columna_efectivo_vence_en === true && v.authenticated_lee_efectivo_vence_en === true && v.anon_lee_efectivo_vence_en === false, "verificación: columna y permisos")
ok(v.indice === true && v.funciones_de_tienda_siguen === true, "verificación: índice, y las funciones de tienda siguen hasta la 026")
ok(v.motivos_validos.includes("cuenta_mp_cambiada"), "verificación: motivos válidos")
ok(v.permisos_rpc_vencidos.anon === false && v.permisos_rpc_vencidos.authenticated === false && v.permisos_rpc_vencidos.service_role === true, "verificación: rpc solo service_role")
ok(v.permisos_privado_vencidos.anon === false && v.permisos_privado_vencidos.authenticated === false && v.permisos_privado_vencidos.service_role === true, "verificación: privado solo service_role")
ok(v.pagos_dobles.existe === true && v.pagos_dobles.rls === true && v.pagos_dobles.service_role_select_insert === true, "verificación: pagos_dobles existe, con RLS, service_role escribe")
ok(Object.values(v.pagos_dobles.anon).every((x) => x === false) && Object.values(v.pagos_dobles.authenticated).every((x) => x === false), "verificación: anon y authenticated sin ningún permiso en pagos_dobles")
ok(!/^\s*--/m.test(MIG), "la migración no tiene comentarios")
}

await correr()
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
