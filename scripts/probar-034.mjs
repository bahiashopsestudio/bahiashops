// Prueba de la migración 034 (lo nuevo nace cerrado) contra una base local
// (PGlite: Postgres real en WebAssembly, sin instalar nada). No toca Supabase
// ni ninguna base real.
//
//   npm run probar:034
//
// El estado de antes imita al de producción (relevado el 16/10/2026):
//   · los permisos por defecto de Supabase para lo que crea postgres en public
//     (todo para anon, authenticated y service_role), con la 027 real encima;
//   · las 27 tablas de public con los permisos que dejan la 032 y la 033
//     (vendedores por columna; usuarios y vendedores todavía con MAINTAIN).
// Prueba que cada rol tiene solo lo de la matriz, y que una tabla, secuencia o
// función nueva nace sin nada para anon y authenticated.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("034_permisos_por_defecto.sql")
const M027 = leer("027_endurecer_permisos.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

// La matriz: tabla -> [anon, authenticated] (permisos de tabla).
const MATRIZ = {
  barrios: ["SELECT", "SELECT"], categorias: ["SELECT", "SELECT"], localidades: ["SELECT", "SELECT"],
  subcategorias: ["SELECT", "SELECT"], sellos: ["SELECT", "SELECT"], colecciones: ["SELECT", "SELECT"],
  coleccion_productos: ["SELECT", "SELECT"], tesoros: ["SELECT", "SELECT"],
  productos: ["SELECT", "SELECT"], producto_media: ["SELECT", "SELECT"], producto_variantes: ["SELECT", "SELECT"],
  producto_sellos: ["SELECT", "SELECT"], vendedor_sellos: ["SELECT", "DELETE,INSERT,SELECT"],
  favoritos: ["", "DELETE,INSERT,SELECT"], direcciones: ["", "DELETE,INSERT,SELECT,UPDATE"],
  pedidos: ["", "SELECT"], pedido_items: ["", "SELECT"],
  usuarios: ["SELECT", "SELECT"], vendedores: ["", ""],
  mercadopago_cuentas: ["", ""], vendedor_bloqueos: ["", ""], ideas_admin: ["", ""], pagos_dobles: ["", ""],
  mensajes_contacto: ["", ""], leads_gastronomia: ["", ""], envio_zona_fallas: ["", ""], votos_funciones: ["", ""],
  denuncias_productos: ["", ""], // 035
}
const priv = { SELECT: "select", INSERT: "insert", UPDATE: "update", DELETE: "delete" }

async function base({ conSpatial = false } = {}) {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; create role supabase_admin;
    create schema privado;
    -- Los permisos por defecto de Supabase (consulta 10 del relevamiento, antes de la 027).
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
  `)
  await db.exec(M027.split("\ncommit;")[0] + "\ncommit;")
  const tablas = Object.keys(MATRIZ).map((t) => `create table public.${t} (id serial primary key, nombre text);`).join("\n")
  await db.exec(tablas)
  for (const [t, [anon, auth]] of Object.entries(MATRIZ)) {
    await db.exec(`revoke all on public.${t} from anon, authenticated`)
    if (anon) await db.exec(`grant ${anon.split(",").map((p) => priv[p]).join(", ")} on public.${t} to anon`)
    if (auth) await db.exec(`grant ${auth.split(",").map((p) => priv[p]).join(", ")} on public.${t} to authenticated`)
  }
  // Como hoy: vendedores por columna, y usuarios y vendedores con MAINTAIN.
  await db.exec(`
    grant select (id, nombre) on public.vendedores to anon, authenticated;
    grant insert (nombre), update (nombre) on public.vendedores to authenticated;
    grant maintain on public.usuarios, public.vendedores to anon, authenticated;
  `)
  if (conSpatial) {
    await db.exec(`
      create table public.spatial_ref_sys (srid integer primary key);
      alter table public.spatial_ref_sys owner to supabase_admin;
      grant all on public.spatial_ref_sys to anon, authenticated;
    `)
  }
  return db
}

async function permisos(db, tabla, rol) {
  const r = await db.query(`select coalesce(string_agg(a.privilege_type, ',' order by a.privilege_type), '') as p
    from pg_class c, aclexplode(c.relacl) a where c.oid = ('public.' || $1)::regclass and a.grantee = $2::regrole`, [tabla, rol])
  return r.rows[0].p
}
const verificacion = async (db) => JSON.parse((await db.query(
  MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length))).rows[0].verificacion)

const db = await base()
const vendedoresAntes = (await db.query(`select attname, attacl::text as a from pg_attribute
  where attrelid = 'public.vendedores'::regclass and attnum > 0 and attacl is not null order by 1`)).rows
const antes = await verificacion(db)
await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

console.log("1. Cada rol tiene solo lo de la matriz")
ok(antes.con_maintain.join() === "usuarios,vendedores", "antes: usuarios y vendedores con MAINTAIN para anon y authenticated (como en producción)")
for (const [t, [anon, auth]] of Object.entries(MATRIZ)) {
  const a = await permisos(db, t, "anon")
  const u = await permisos(db, t, "authenticated")
  ok(a === anon && u === auth, `${t}: anon [${a}] · authenticated [${u}]`)
}
const vendedoresDespues = (await db.query(`select attname, attacl::text as a from pg_attribute
  where attrelid = 'public.vendedores'::regclass and attnum > 0 and attacl is not null order by 1`)).rows
ok(JSON.stringify(vendedoresDespues) === JSON.stringify(vendedoresAntes), "vendedores: sus permisos por columna no cambian")

console.log("\n2. Lo nuevo nace cerrado")
await db.exec(`
  create table public.registro_nuevo (id serial primary key, texto text);
  create function public.funcion_nueva() returns int language sql as $$ select 1 $$;
  create function privado.funcion_privada() returns int language sql as $$ select 2 $$;
  create sequence public.secuencia_nueva;
`)
ok((await permisos(db, "registro_nuevo", "anon")) === "" && (await permisos(db, "registro_nuevo", "authenticated")) === "", "una tabla nueva: nada para anon ni authenticated")
ok((await permisos(db, "registro_nuevo", "service_role")).includes("INSERT"), "y todo para service_role")
const seq = (await db.query(`select has_sequence_privilege('anon', 'public.secuencia_nueva', 'usage') as a,
  has_sequence_privilege('authenticated', 'public.registro_nuevo_id_seq', 'usage') as u,
  has_sequence_privilege('service_role', 'public.secuencia_nueva', 'usage') as s`)).rows[0]
ok(!seq.a && !seq.u && seq.s, "una secuencia nueva: nada para anon ni authenticated, sí para service_role")
const fn = (await db.query(`select has_function_privilege('anon', 'public.funcion_nueva()', 'execute') as a,
  has_function_privilege('authenticated', 'public.funcion_nueva()', 'execute') as u,
  has_function_privilege('service_role', 'public.funcion_nueva()', 'execute') as s,
  has_function_privilege('authenticated', 'privado.funcion_privada()', 'execute') as p`)).rows[0]
ok(!fn.a && !fn.u && fn.s, "una función nueva en public: nadie la ejecuta salvo service_role")
ok(!fn.p, "una función nueva en otro esquema: tampoco la ejecuta PUBLIC")
const sinTocar = (await db.query(`select has_table_privilege('anon', 'public.categorias', 'select') as c`)).rows[0]
ok(sinTocar.c, "lo que ya existía no cambia (anon sigue leyendo el catálogo)")

console.log("\n3. La verificación")
await db.exec(`drop table public.registro_nuevo`)
const v = await verificacion(db)
ok(Object.keys(v.diferencias_con_la_matriz).length === 0, "diferencias_con_la_matriz: {}")
ok(v.con_maintain.length === 0, "con_maintain: []")
ok(v.funciones_publicas_por_defecto === true, "las funciones nuevas nacen sin EXECUTE para PUBLIC")
ok(!/anon|authenticated/.test(JSON.stringify(v.por_defecto_public)), "por_defecto_public: sin anon ni authenticated")
await db.exec(`create table public.otra_nueva (id int); grant select on public.otra_nueva to anon`)
const v2 = await verificacion(db)
ok(v2.diferencias_con_la_matriz.otra_nueva?.deberia === "no está en la matriz", "una tabla que no está en la matriz aparece en las diferencias")

console.log("\n4. spatial_ref_sys")
const db2 = await base({ conSpatial: true })
await db2.exec(MIG)
ok((await permisos(db2, "spatial_ref_sys", "anon")) === "" && (await permisos(db2, "spatial_ref_sys", "authenticated")) === "", "si está en public: queda sin permisos para anon y authenticated")
const bloque = MIG.slice(MIG.indexOf("-- spatial_ref_sys: inicio"), MIG.indexOf("-- spatial_ref_sys: fin"))
await db2.exec(`grant all on public.spatial_ref_sys to anon, authenticated; create role sin_permisos;`)
let error = null
try {
  await db2.exec(`begin; set local role sin_permisos; ${bloque} reset role; create table public.despues_del_bloque (id int); commit;`)
} catch (e) { error = e.message; await db2.exec("rollback").catch(() => {}) }
ok(error === null && (await db2.query(`select to_regclass('public.despues_del_bloque') as t`)).rows[0].t !== null,
  "si el REVOKE falla (sin permisos sobre la tabla), avisa y la transacción sigue")
ok((await permisos(db2, "spatial_ref_sys", "anon")) !== "", "(y la tabla queda como estaba)")
const db3 = await base()
await db3.exec(MIG)
ok(true, "sin spatial_ref_sys en public (como hoy): no hace nada")

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
