// Prueba de la migración 026 (limpieza: funciones de cancelar por tienda y
// columna link_de_pago) contra una base local (PGlite). No toca Supabase.
//
//   npm run probar:026
//
// Va DESPUÉS de publicar el código nuevo. Se corren antes la 022 a la 025.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("026_limpieza_modelo_pagos.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

async function correr() {
const db = new PGlite()
const q = async (sql, p) => (await db.query(sql, p)).rows
const n = async (sql, p) => Number((await q(sql, p))[0].n)

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema privado;
  grant usage on schema privado to anon, authenticated;
  create table public.pedidos (
    id bigserial primary key, vendedor_id bigint not null, estado text not null,
    mp_payment_id text, mp_preference_id text,
    creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now()
  );
  revoke all on public.pedidos from anon, authenticated;
  grant all on public.pedidos to service_role;
  grant select on public.pedidos to authenticated;
  create table public.mercadopago_cuentas (
    vendedor_id bigint primary key, mp_user_id text, access_token text, refresh_token text,
    public_key text, token_expira_en timestamptz, actualizado_en timestamptz,
    conectado_en timestamptz not null default now()
  );
  alter table public.mercadopago_cuentas enable row level security;
  grant all on public.mercadopago_cuentas to anon, authenticated, service_role;
`)
for (const f of ["022_pedidos_vencimiento.sql", "023_pedidos_link_de_pago.sql", "024_mp_cuenta_de_cobro.sql", "025_pago_en_efectivo.sql"]) await db.exec(leer(f))
await db.exec(`insert into public.pedidos (vendedor_id, estado, link_de_pago, cancelado_motivo) values (1, 'cancelado', 'https://mp.com/x', 'cuenta_mp_cambiada'), (1, 'pagado', null, null)`)

await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

console.log("1. Las funciones")
ok(await n(`select count(*) n from pg_proc where proname in ('cancelar_pedidos_de_tienda', 'rpc_cancelar_pedidos_de_tienda')`) === 0, "las dos de cancelar por tienda ya no existen")
ok(await n(`select count(*) n from pg_proc where proname in ('cancelar_pedidos_vencidos', 'rpc_cancelar_pedidos_vencidos')`) === 2, "las de vencidos siguen")

console.log("\n2. link_de_pago")
ok(await n(`select count(*) n from information_schema.columns where table_name = 'pedidos' and column_name = 'link_de_pago'`) === 0, "la columna ya no existe")
ok(await n(`select count(*) n from pg_constraint where conname = 'pedidos_link_de_pago_valido'`) === 0, "su CHECK tampoco")

console.log("\n3. Lo demás queda como estaba")
ok(await n(`select count(*) n from public.pedidos`) === 2, "los pedidos siguen")
ok(await n(`select count(*) n from public.pedidos where cancelado_motivo = 'cuenta_mp_cambiada'`) === 1, "el pedido con cuenta_mp_cambiada sigue igual")
ok((await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'pedidos_cancelado_motivo_valido'`))[0].d.includes("cuenta_mp_cambiada"), "el CHECK de motivos conserva cuenta_mp_cambiada")
ok(await n(`select count(*) n from information_schema.columns where table_name = 'pedidos' and column_name in ('vence_en', 'cancelado_motivo', 'mp_user_id_cobro', 'efectivo_vence_en')`) === 4, "las columnas de las migraciones 022 a 025 siguen")

console.log("\n4. La consulta de verificación")
const v = JSON.parse((await q(MIG.slice(MIG.indexOf("select jsonb_pretty")).trim().replace(/;$/, "")))[0].verificacion)
ok(v.funciones_de_tienda_eliminadas && v.columna_link_de_pago_eliminada && v.constraint_link_de_pago_eliminada && v.funciones_de_vencidos_siguen, "verificación: todo en true")
ok(v.columnas_pedidos_que_siguen.length === 5 && v.motivos_validos.includes("cuenta_mp_cambiada"), "verificación: columnas y motivos")
ok(!/^\s*--/m.test(MIG), "la migración no tiene comentarios")
}

await correr()
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
