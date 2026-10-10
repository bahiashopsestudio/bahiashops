// Prueba de la migración 028 (talles sin duplicados) contra una base local
// (PGlite: Postgres real en WebAssembly). No toca Supabase ni ninguna base real.
//
//   npm run probar:028
//
// La tabla producto_variantes y sus policies se arman con el texto REAL de la
// 001 (secciones 3 y 4). auth.uid() se simula con request.jwt.claim.sub, como
// en Supabase. Lo que NO prueba: PostgREST.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const M001 = leer("001_productos_variantes.sql")
const TABLA_Y_POLICIES = M001.slice(M001.indexOf("-- 3. Tabla producto_variantes"), M001.indexOf("-- 5. Storage"))
const MIG = leer("028_variantes_sin_duplicados.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const DUENA = "11111111-1111-1111-1111-111111111111"
const OTRA = "22222222-2222-2222-2222-222222222222"

async function correr() {
const db = new PGlite()
const q = async (sql, p) => (await db.query(sql, p)).rows

// Como una persona logueada (rol authenticated con su uid), o como visitante.
async function como(uid, sql, p) {
  try {
    await db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}'` : `set role anon; set request.jwt.claim.sub = ''`)
    return { filas: (await db.query(sql, p)).rows, error: null, afectadas: null }
  } catch (e) {
    return { filas: [], error: e.message }
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub")
  }
}
async function filasAfectadas(uid, sql) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}'`)
  try { return (await db.query(sql)).affectedRows } finally { await db.exec("reset role; reset request.jwt.claim.sub") }
}

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;

  create table public.vendedores (id serial primary key, usuario_id uuid, estado_validacion text not null);
  create table public.productos (id serial primary key, vendedor_id integer references public.vendedores(id), estado text not null);
  grant select on public.vendedores, public.productos to anon, authenticated;
`)
await db.exec(TABLA_Y_POLICIES)
await db.exec(`
  grant select on public.producto_variantes to anon;
  grant select, insert, update, delete on public.producto_variantes to authenticated;
  grant usage on all sequences in schema public to authenticated;

  insert into public.vendedores (usuario_id, estado_validacion) values ('${DUENA}', 'aprobado'), ('${OTRA}', 'aprobado');
  -- 1: la remera (activo, con la historia real: 4 talles x 4); 2: en revisión con duplicados;
  -- 3: de otra tienda; 4: con dos propiedades (talle + color), sin duplicados.
  insert into public.productos (vendedor_id, estado) values (1, 'activo'), (1, 'en_revision'), (2, 'en_revision'), (1, 'activo');
  insert into public.producto_variantes (producto_id, propiedad_1_valor)
    select 1, t from generate_series(1, 4), unnest(array['S', 'M', 'L', 'XL']) t;
  insert into public.producto_variantes (producto_id, propiedad_1_valor) values (2, 'S'), (2, 'S'), (2, 'M'), (3, 'S'), (3, 'S');
  insert into public.producto_variantes (producto_id, propiedad_1_valor, propiedad_2_valor)
    values (4, 'S', 'Blanco'), (4, 'S', 'Negro'), (4, 'M', 'Blanco');
`)

console.log("0. Antes de la 028: el problema existe")
ok((await q(`select count(*)::int n from public.producto_variantes where producto_id = 1`))[0].n === 16, "la remera tiene 16 filas (S M L XL x4): el UNIQUE de la 001 no frena con NULL")
ok((await como(DUENA, `select id from public.producto_variantes where producto_id = 2`)).filas.length === 0, "la dueña NO ve las variantes de su producto en revisión")
ok(await filasAfectadas(DUENA, `delete from public.producto_variantes where producto_id = 2`) === 0, "y su borrado no borra nada, sin error (el bug del editor)")

await db.exec(MIG)
await db.exec(MIG)
console.log("\nMigración corrida dos veces sin errores.\n")

console.log("1. Duplicados borrados: queda la fila más vieja de cada talle")
const remera = await q(`select id, propiedad_1_valor v from public.producto_variantes where producto_id = 1 order by id`)
ok(remera.length === 4 && remera.map((r) => r.v).join(",") === "S,M,L,XL", `la remera queda con S M L XL una vez (${remera.map((r) => r.v).join(" ")})`)
ok(remera.map((r) => r.id).join(",") === "1,2,3,4", "son las filas más viejas (ids 1 a 4)")
ok((await q(`select count(*)::int n from public.producto_variantes where producto_id = 2`))[0].n === 2, "producto en revisión: S y M una vez")
ok((await q(`select count(*)::int n from public.producto_variantes where producto_id = 3`))[0].n === 1, "producto de otra tienda: también se limpia")
ok((await q(`select count(*)::int n from public.producto_variantes where producto_id = 4`))[0].n === 3, "talle + color distintos NO se tocan (S/Blanco, S/Negro, M/Blanco)")

console.log("\n2. Que no vuelva a pasar")
const repetirNulo = await como(DUENA, `insert into public.producto_variantes (producto_id, propiedad_1_valor) values (1, 'S')`)
ok(repetirNulo.error?.includes("producto_variantes_sin_repetir"), "el mismo talle otra vez (propiedad 2 NULL): error, no se guarda callado")
const repetirColor = await como(DUENA, `insert into public.producto_variantes (producto_id, propiedad_1_valor, propiedad_2_valor) values (4, 'S', 'Blanco')`)
ok(/duplicate key/.test(repetirColor.error ?? ""), "la misma combinación talle + color: error (lo frena el UNIQUE de la 001 o el de la 028)")
ok((await como(DUENA, `insert into public.producto_variantes (producto_id, propiedad_1_valor) values (1, 'XXL')`)).error === null, "un talle nuevo: se guarda")

console.log("\n3. La tienda lee sus variantes en cualquier estado")
ok((await como(DUENA, `select id from public.producto_variantes where producto_id = 2`)).filas.length === 2, "la dueña ve las de su producto en revisión")
ok(await filasAfectadas(DUENA, `delete from public.producto_variantes where producto_id = 2`) === 2, "y ahora su borrado las borra (el editor reemplaza bien)")
ok((await como(OTRA, `select id from public.producto_variantes where producto_id in (1, 2, 4)`)).filas.length === 8, "otra tienda ve solo las públicas de la dueña (productos activos: 5 + 3), no las en revisión")
ok((await como(OTRA, `select id from public.producto_variantes where producto_id = 3`)).filas.length === 1, "otra tienda ve las suyas en revisión")
ok(await filasAfectadas(OTRA, `delete from public.producto_variantes where producto_id = 1`) === 0, "otra tienda no borra variantes ajenas")
ok((await como(null, `select id from public.producto_variantes where producto_id = 3`)).filas.length === 0, "un visitante no ve las de un producto en revisión")
ok((await como(null, `select id from public.producto_variantes where producto_id = 1`)).filas.length === 5, "un visitante ve las de un producto activo")

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
}

correr().catch((e) => { console.error(e); process.exit(1) })
