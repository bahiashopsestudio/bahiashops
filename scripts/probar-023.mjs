// Prueba de la migración 023 (link de pago del pedido) contra una base local
// (PGlite). No toca Supabase ni ninguna base real.
//
//   npm run probar:023

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const MIG = readFileSync(new URL("../sql/migrations/023_pedidos_link_de_pago.sql", import.meta.url), "utf8")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }
const n = async (db, sql) => Number((await db.query(sql)).rows[0].n)

const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.pedidos (id bigserial primary key, estado text not null, mp_preference_id text);
  revoke all on public.pedidos from anon, authenticated;
  grant all on public.pedidos to service_role;
  grant select on public.pedidos to authenticated;
  insert into public.pedidos (estado, mp_preference_id) values ('pendiente', 'pref-vieja');
`)

await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

console.log("1. La columna y su regla")
ok(await n(db, `select count(*) n from information_schema.columns where table_name = 'pedidos' and column_name = 'link_de_pago'`) === 1, "la columna existe (una sola vez)")
ok(await n(db, `select count(*) n from public.pedidos where link_de_pago is null`) === 1, "los pedidos que ya existían quedan con null (sin backfill)")
ok((await db.query(`select mp_preference_id from public.pedidos`)).rows[0].mp_preference_id === "pref-vieja", "y no se les toca nada más")
for (const [link, esperado] of [
  ["https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1-a", true],
  [null, true],
  ["http://www.mercadopago.com.ar/x", false],
  ["javascript:alert(1)", false],
  ["", false],
]) {
  let e = null
  try { await db.query(`insert into public.pedidos (estado, link_de_pago) values ('pendiente', $1)`, [link]) } catch (x) { e = x }
  ok((e === null) === esperado, `${link === null ? "null" : JSON.stringify(link)}: ${esperado ? "se acepta" : "se rechaza"}`)
}

console.log("\n2. Permisos")
ok(await n(db, `select count(*) n from information_schema.column_privileges where table_name = 'pedidos' and column_name = 'link_de_pago' and grantee = 'anon'`) === 0, "anon no tiene ningún permiso sobre la columna")
let leyo = null
try { await db.exec("set role anon"); await db.query(`select link_de_pago from public.pedidos`) } catch (e) { leyo = e } finally { await db.exec("reset role") }
ok(!!leyo && /permission denied/.test(leyo.message), "anon no puede leer el link")

console.log("\n3. Deshacer (el bloque comentado al final de la migración)")
const bloque = MIG.split("-- Para deshacer")[1].split("\n").filter((l) => l.startsWith("-- ") && !l.startsWith("-- =")).map((l) => l.slice(3)).filter((l) => /^(begin|commit|drop|alter)/.test(l)).join("\n")
await db.exec(bloque)
ok(await n(db, `select count(*) n from information_schema.columns where table_name = 'pedidos' and column_name = 'link_de_pago'`) === 0, "sin la columna")
await db.exec(MIG)
ok(true, "y se puede volver a aplicar después de deshacer")

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
