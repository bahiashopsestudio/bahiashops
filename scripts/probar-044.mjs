// Prueba de la migración 044 contra una base local (PGlite: Postgres real en
// WebAssembly, sin instalar nada). No toca Supabase ni ninguna base real.
//
//   npm run probar:044
//
// El esquema de auth y de public es una imitación mínima. El disparador de
// cuentas cerradas se toma de la 016 real. Lo que NO prueba: RLS con PostgREST.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { validarCiudadPedida, MAX_CIUDAD } from "../src/lib/formulariosPublicos.js"

const MIG = readFileSync(new URL("../sql/migrations/044_ciudades_pedidas.sql", import.meta.url), "utf8")
const MIG_016 = readFileSync(new URL("../sql/migrations/016_eliminar_cuenta.sql", import.meta.url), "utf8")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

// La función de la 016, tal cual está en el archivo.
const inicio = MIG_016.indexOf("create or replace function privado.rechazar_cuenta_cerrada()")
const fin = MIG_016.indexOf("$$;", MIG_016.indexOf("as $$", inicio)) + 3
const RECHAZAR = MIG_016.slice(inicio, fin)

const db = new PGlite()
const q = async (sql, p) => (await db.query(sql, p)).rows
const falla = async (sql, p) => { try { await db.query(sql, p); return null } catch (e) { return e.message } }

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema privado;
  create table auth.users (id uuid primary key);
  create table public.usuarios (id uuid primary key references auth.users on delete cascade,
    email text, cerrada_en timestamptz);
  ${RECHAZAR}
`)

const A = "00000000-0000-0000-0000-00000000000a"
const B = "00000000-0000-0000-0000-00000000000b"
const C = "00000000-0000-0000-0000-00000000000c"
for (const id of [A, B, C]) {
  await db.query("insert into auth.users (id) values ($1)", [id])
  await db.query("insert into public.usuarios (id, email) values ($1, 'x@y.z')", [id])
}

console.log("1. La migración corre, y corre dos veces")
await db.exec(MIG)
await db.exec(MIG)
ok(true, "corrió dos veces sin error")
const [v] = await q("select relrowsecurity as rls from pg_class where oid = 'public.ciudades_pedidas'::regclass")
ok(v.rls === true, "RLS activado")

console.log("\n2. Nace cerrada")
for (const rol of ["anon", "authenticated"]) {
  for (const permiso of ["select", "insert", "update", "delete"]) {
    const [r] = await q(`select has_table_privilege('${rol}', 'public.ciudades_pedidas', '${permiso}') as puede`)
    ok(r.puede === false, `${rol} no tiene ${permiso}`)
  }
}
const [sr] = await q("select has_table_privilege('service_role', 'public.ciudades_pedidas', 'insert') as puede")
ok(sr.puede === true, "service_role escribe")
const [fn] = await q("select has_function_privilege('anon', 'privado.ciudades_pedidas_borrar_al_cerrar_cuenta()', 'execute') as puede")
ok(fn.puede === false, "anon no ejecuta la función del disparador")

console.log("\n3. Una fila por cuenta: si vuelve, se actualiza")
const UPSERT = `insert into public.ciudades_pedidas (usuario_id, ciudad, email) values ($1, $2, 'x@y.z')
  on conflict (usuario_id) do update set ciudad = excluded.ciudad, actualizado_en = now()`
await db.query(UPSERT, [A, "Neuquén, Neuquén"])
const [antes] = await q("select creado_en from public.ciudades_pedidas where usuario_id = $1", [A])
await db.query(UPSERT, [A, "Viedma, Río Negro"])
const filas = await q("select ciudad, creado_en, origen from public.ciudades_pedidas where usuario_id = $1", [A])
ok(filas.length === 1 && filas[0].ciudad === "Viedma, Río Negro", "queda una sola fila, con la ciudad nueva")
ok(filas[0].creado_en.getTime() === antes.creado_en.getTime(), "creado_en no cambia")
ok(filas[0].origen === "alta", "origen por defecto: alta")

console.log("\n4. Las reglas de la tabla")
ok(await falla(UPSERT, [B, ""]), "ciudad vacía: rechazada")
ok(await falla(UPSERT, [B, " Neuquén"]), "ciudad sin recortar: rechazada")
ok(await falla(UPSERT, [B, "x".repeat(121)]), "121 caracteres: rechazada")
ok(!(await falla(UPSERT, [B, "x".repeat(120)])), "120 caracteres: entra")
ok(await falla("update public.ciudades_pedidas set origen = 'otra' where usuario_id = $1", [B]), "origen desconocido: rechazado")

console.log("\n5. Eliminar la cuenta, en los dos caminos")
await db.query("delete from auth.users where id = $1", [B])
ok((await q("select 1 from public.ciudades_pedidas where usuario_id = $1", [B])).length === 0, "borrado completo: la cascada borra la fila")
await db.query("update public.usuarios set cerrada_en = now() where id = $1", [A])
ok((await q("select 1 from public.ciudades_pedidas where usuario_id = $1", [A])).length === 0, "cáscara anónima: el disparador borra la fila")
ok((await q("select 1 from public.usuarios where id = $1", [A])).length === 1, "y la cuenta sigue (por sus pedidos)")
ok((await falla(UPSERT, [A, "Trelew"]))?.includes("cuenta_cerrada"), "una cuenta eliminada no puede anotar nada nuevo")
await db.query(UPSERT, [C, "Junín"])
await db.query("update public.usuarios set email = 'otro@y.z' where id = $1", [C])
ok((await q("select 1 from public.ciudades_pedidas where usuario_id = $1", [C])).length === 1, "otro cambio en la cuenta no borra la fila")

console.log("\n6. La validación del servidor")
ok(validarCiudadPedida({ ciudad: "  Neuquén, Neuquén  " }).ciudad === "Neuquén, Neuquén", "recorta los espacios")
ok(validarCiudadPedida({ ciudad: "<b>Junín</b>" }).ciudad === "<b>Junín</b>", "guarda lo que escriben: se escapa al mostrarlo")
ok(!validarCiudadPedida({ ciudad: "   " }).ok, "solo espacios: rechazada")
ok(!validarCiudadPedida({}).ok, "sin ciudad: rechazada")
ok(!validarCiudadPedida(null).ok, "cuerpo vacío: rechazado")
ok(!validarCiudadPedida({ ciudad: 8000 }).ok, "un número: rechazado")
ok(!validarCiudadPedida({ ciudad: { a: 1 } }).ok, "un objeto: rechazado")
ok(!validarCiudadPedida({ ciudad: "a\nb" }).ok, "con salto de línea: rechazada")
ok(!validarCiudadPedida({ ciudad: "x".repeat(MAX_CIUDAD + 1) }).ok, `${MAX_CIUDAD + 1} caracteres: rechazada`)
ok(validarCiudadPedida({ ciudad: "x".repeat(MAX_CIUDAD) }).ok, `${MAX_CIUDAD} caracteres: entra`)

await db.close()
console.log(fallas ? `\n✗ ${fallas} fallas` : "\n✓ Todo bien")
process.exitCode = fallas ? 1 : 0
