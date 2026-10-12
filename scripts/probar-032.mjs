// Prueba de la migración 032 (limpieza: zona_* y permisos de tabla) contra una
// base local (PGlite: Postgres real en WebAssembly, sin instalar nada). No toca
// Supabase ni ninguna base real.
//
//   npm run probar:032
//
// El estado de antes imita al de producción:
//   · vendedores con sus permisos por columna (como probar-018) y las
//     migraciones reales 006, 017 y 018 (que crean zona_*, el disparador
//     redondear_zona y la restricción vendedores_zona_largo);
//   · el resto de las tablas con los permisos que Supabase da por defecto
//     (todo para anon y authenticated) y la 027 real encima (que ya sacó
//     TRUNCATE, REFERENCES y TRIGGER, y la escritura de anon salvo en
//     mensajes_contacto);
//   · usuarios, envio_zona_fallas y votos_funciones cerradas como antes.
// Sí prueba RLS en lo que importa acá (anon y pedidos).

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("032_limpieza.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const CATALOGO = ["barrios", "categorias", "localidades", "subcategorias", "sellos", "colecciones", "coleccion_productos", "tesoros"]
const TIENDA = ["productos", "producto_media", "producto_variantes", "producto_sellos", "vendedor_sellos"]
const SOLO_SERVIDOR = ["mercadopago_cuentas", "vendedor_bloqueos", "ideas_admin", "pagos_dobles", "mensajes_contacto", "leads_gastronomia"]
const ESPERADO = {
  ...Object.fromEntries(CATALOGO.map((t) => [t, { anon: "SELECT", auth: "SELECT" }])),
  ...Object.fromEntries(TIENDA.map((t) => [t, { anon: "SELECT", auth: "DELETE,INSERT,SELECT,UPDATE" }])),
  favoritos: { anon: "", auth: "DELETE,INSERT,SELECT" },
  direcciones: { anon: "", auth: "DELETE,INSERT,SELECT,UPDATE" },
  pedidos: { anon: "", auth: "SELECT" },
  pedido_items: { anon: "", auth: "SELECT" },
  ...Object.fromEntries(SOLO_SERVIDOR.map((t) => [t, { anon: "", auth: "" }])),
}
const NO_SE_TOCAN = ["vendedores", "usuarios", "envio_zona_fallas", "votos_funciones"]

async function base({ conDependencia = false } = {}) {
  const db = new PGlite()
  await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema privado;
  grant usage on schema privado to anon, authenticated, service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;

  create table public.localidades (id serial primary key, nombre text, activa boolean default true);
  insert into public.localidades (nombre) values ('Bahía Blanca');
  create table public.barrios (id serial primary key, nombre text, localidad_id int references public.localidades);
  insert into public.barrios (nombre, localidad_id) values ('Centro', 1);
  create table public.direcciones (id serial primary key, usuario_id uuid, calle text, barrio_id int);

  -- vendedores como en producción: todo por columna (018 y siguientes).
  create table public.vendedores (
    id serial primary key, usuario_id uuid, nombre_negocio text, slug text,
    recibe_publico boolean, direccion text, barrio_id integer, barrio_detectado_automaticamente boolean,
    latitud numeric(10,7), longitud numeric(10,7), localidad_id integer,
    estado_validacion text default 'aprobado', bloqueado boolean default false
  );
  revoke all on public.vendedores from anon, authenticated;
  grant select (id, usuario_id, nombre_negocio, slug, recibe_publico, direccion, barrio_id,
                barrio_detectado_automaticamente, latitud, longitud, localidad_id,
                estado_validacion, bloqueado) on public.vendedores to anon, authenticated;
  grant insert (usuario_id, nombre_negocio, slug) on public.vendedores to authenticated;
  grant update (nombre_negocio) on public.vendedores to authenticated;
  grant all on public.vendedores to service_role;
  insert into public.vendedores (id, nombre_negocio, recibe_publico, direccion, latitud, longitud, localidad_id, barrio_id)
    values (15, 'Ludoméstica', false, null, null, null, 1, 1), (16, 'Plan Material', true, 'Alsina 45', -38.7182645, -62.2665811, 1, 1);
  `)
  await db.exec(leer("006_vendedores_vuelta_a_revision.sql"))
  await db.exec(leer("017_localidades_activa.sql"))
  await db.exec(leer("018_vendedores_zona.sql"))

  // El resto, con los permisos por defecto de Supabase (todo).
  await db.exec(`
  create table public.categorias (id serial primary key, nombre text);
  create table public.subcategorias (id serial primary key, nombre text);
  create table public.sellos (id serial primary key, nombre text);
  create table public.colecciones (id serial primary key, nombre text);
  create table public.productos (id serial primary key, vendedor_id integer, nombre text);
  create table public.coleccion_productos (id serial primary key, producto_id integer);
  create table public.tesoros (id serial primary key, producto_id integer);
  create table public.producto_media (id serial primary key, producto_id integer);
  create table public.producto_variantes (id serial primary key, producto_id integer);
  create table public.producto_sellos (id serial primary key, producto_id integer);
  create table public.vendedor_sellos (id serial primary key, vendedor_id integer);
  create table public.favoritos (id serial primary key, usuario_id uuid, producto_id integer);
  create table public.pedidos (id serial primary key, comprador_id uuid, vendedor_id integer);
  create table public.pedido_items (id serial primary key, pedido_id integer);
  create table public.mercadopago_cuentas (vendedor_id integer primary key);
  create table public.vendedor_bloqueos (id serial primary key, vendedor_id integer);
  create table public.ideas_admin (id serial primary key, idea text);
  create table public.pagos_dobles (pedido_id integer, pago_id text);
  create table public.mensajes_contacto (id serial primary key, email text, mensaje text, usuario_id uuid);
  create table public.leads_gastronomia (id serial primary key, nombre text, email text);
  create table public.barrios_csv (id serial primary key, nombre text);
  create table public.usuarios (id uuid primary key, email text);
  create table public.envio_zona_fallas (id serial primary key, vendedor_id integer);
  create table public.votos_funciones (id serial primary key, funcion text);

  do $$ declare t text; begin
    for t in select tablename from pg_tables where schemaname = 'public'
             and tablename not in ('vendedores', 'direcciones', 'localidades', 'barrios') loop
      execute format('grant all on public.%I to anon, authenticated, service_role', t);
    end loop;
  end $$;
  grant all on public.direcciones, public.localidades, public.barrios to anon, authenticated, service_role;
  grant usage on all sequences in schema public to anon, authenticated, service_role;

  -- Lo que ya se cerró antes: usuarios (010), direcciones (021), fallas y votos.
  revoke all on public.usuarios from anon, authenticated;
  grant select on public.usuarios to anon, authenticated;
  revoke all on public.direcciones from anon;
  revoke all on public.envio_zona_fallas, public.votos_funciones from anon, authenticated;
  grant select, insert, delete on public.votos_funciones to authenticated;

  -- RLS de pedidos: cada persona lee los suyos.
  alter table public.pedidos enable row level security;
  create policy "comprador ve sus pedidos" on public.pedidos for select to authenticated using (comprador_id = auth.uid());
  insert into public.pedidos (comprador_id, vendedor_id) values ('11111111-1111-1111-1111-111111111111', 15);
  insert into public.categorias (nombre) values ('Juegos');
  ${conDependencia ? "create table public.usa_csv (id serial primary key, barrio_csv_id integer references public.barrios_csv);" : ""}
  `)
  await db.exec(leer("027_endurecer_permisos.sql").split("\ncommit;")[0] + "\ncommit;")
  return db
}

async function permisos(db, tabla, rol) {
  const r = await db.query(`select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), '') as p
    from information_schema.role_table_grants where table_schema = 'public' and table_name = $1 and grantee = $2`, [tabla, rol])
  return r.rows[0].p
}
// Los permisos dados POR COLUMNA (attacl). information_schema.column_privileges
// no sirve acá: también lista los que vienen del permiso de tabla.
async function porColumna(db, tabla, rol) {
  return Number((await db.query(`select count(*) as n from pg_attribute
    where attrelid = ('public.' || $1)::regclass and attnum > 0 and not attisdropped
      and attacl::text like '%' || $2 || '=%'`, [tabla, rol])).rows[0].n)
}
async function acl(db, tabla) {
  return JSON.stringify((await db.query(`select relacl::text as a from pg_class where oid = ('public.' || $1)::regclass`, [tabla])).rows[0].a)
    + JSON.stringify((await db.query(`select grantee, column_name, privilege_type from information_schema.column_privileges
        where table_schema = 'public' and table_name = $1 and grantee in ('anon','authenticated')
          and column_name not in ('zona_calle','zona_entre','zona_y','recibe_publico')
        order by 1, 2, 3`, [tabla])).rows)
}
async function como(db, rol, sql, uid = null) {
  try {
    await db.exec(`select set_config('test.uid', '${uid || ""}', false); set role ${rol}`)
    return { filas: (await db.query(sql)).rows, error: null }
  } catch (e) {
    return { filas: [], error: e.message }
  } finally {
    await db.exec("reset role")
  }
}

const db = await base()
const antes = Object.fromEntries(await Promise.all(NO_SE_TOCAN.map(async (t) => [t, await acl(db, t)])))
const vendedorAntes = (await db.query(`select direccion_visible, latitud from public.vendedores where id = 16`)).rows[0]
await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

console.log("1. h8: zona_* y recibe_publico")
const cols = (await db.query(`select column_name from information_schema.columns where table_name = 'vendedores' and column_name in ('zona_calle','zona_entre','zona_y','recibe_publico')`)).rows
ok(cols.length === 0, "las cuatro columnas no existen en vendedores")
ok((await db.query(`select count(*) as n from pg_trigger where tgname = 'redondear_zona'`)).rows[0].n == 0, "el disparador redondear_zona no existe")
ok((await db.query(`select to_regprocedure('privado.vendedores_redondear_zona()') as f`)).rows[0].f === null, "la función privado.vendedores_redondear_zona no existe")
ok((await db.query(`select count(*) as n from pg_constraint where conname = 'vendedores_zona_largo'`)).rows[0].n == 0, "la restricción vendedores_zona_largo no existe")
const vendedorDespues = (await db.query(`select direccion_visible, latitud from public.vendedores where id = 16`)).rows[0]
ok(vendedorDespues.direccion_visible === vendedorAntes.direccion_visible && vendedorDespues.direccion_visible === true, "direccion_visible sigue, con su valor")
ok(String(vendedorDespues.latitud) === String(vendedorAntes.latitud), "los datos de la tienda no cambian")
let r = await como(db, "service_role", `update public.vendedores set latitud = -38.7111111 where id = 15 returning latitud`)
ok(!r.error && String(r.filas[0].latitud) === "-38.7111111", "sin el disparador, un punto se guarda tal cual (el redondeo lo hace la ruta)")

console.log("\n2. h7: los permisos de cada tabla")
for (const [tabla, esperado] of Object.entries(ESPERADO)) {
  const a = await permisos(db, tabla, "anon")
  const u = await permisos(db, tabla, "authenticated")
  ok(a === esperado.anon && u === esperado.auth, `${tabla}: anon [${a}] · authenticated [${u}]`)
}
for (const tabla of Object.keys(ESPERADO)) {
  if ((await porColumna(db, tabla, "anon")) + (await porColumna(db, tabla, "authenticated")) > 0) ok(false, `${tabla}: quedaron permisos por columna`)
}
ok(true, "ninguna tabla de la lista quedó con permisos por columna")
for (const tabla of NO_SE_TOCAN) ok((await acl(db, tabla)) === antes[tabla], `${tabla}: sus permisos no cambiaron`)

console.log("\n3. Lo que tiene que pasar y lo que no")
r = await como(db, "authenticated", `insert into public.mensajes_contacto (email, mensaje) values ('a@b.c', 'hola')`)
ok(r.error && /permission denied/.test(r.error), "mensajes_contacto: authenticated NO puede insertar")
r = await como(db, "anon", `insert into public.mensajes_contacto (email, mensaje) values ('a@b.c', 'hola')`)
ok(r.error && /permission denied/.test(r.error), "mensajes_contacto: anon tampoco (la 027 se lo había dejado)")
r = await como(db, "service_role", `insert into public.mensajes_contacto (email, mensaje) values ('a@b.c', 'hola') returning id`)
ok(!r.error && r.filas.length === 1, "mensajes_contacto: service_role sí")
r = await como(db, "authenticated", `insert into public.leads_gastronomia (nombre) values ('Ana')`)
ok(r.error && /permission denied/.test(r.error), "leads_gastronomia: authenticated NO puede insertar")
r = await como(db, "service_role", `insert into public.leads_gastronomia (nombre) values ('Ana') returning id`)
ok(!r.error && r.filas.length === 1, "leads_gastronomia: service_role sí")
for (const tabla of CATALOGO) {
  r = await como(db, "anon", `select * from public.${tabla}`)
  if (r.error) ok(false, `${tabla}: anon no puede leer (${r.error})`)
}
ok(true, "anon lee todas las tablas del catálogo")
r = await como(db, "anon", `select * from public.categorias`)
ok(r.filas.length === 1, "y ve sus filas")
r = await como(db, "anon", `select * from public.pedidos`)
ok(r.error && /permission denied/.test(r.error), "pedidos: anon no puede leer (sin permiso; antes eran 0 filas por la política)")
r = await como(db, "authenticated", `select * from public.pedidos`, "11111111-1111-1111-1111-111111111111")
ok(!r.error && r.filas.length === 1, "pedidos: authenticated lee los suyos (la política sigue decidiendo las filas)")
r = await como(db, "authenticated", `select * from public.pedidos`, "22222222-2222-2222-2222-222222222222")
ok(!r.error && r.filas.length === 0, "y no los ajenos")
r = await como(db, "authenticated", `insert into public.pedidos (comprador_id, vendedor_id) values ('11111111-1111-1111-1111-111111111111', 15)`, "11111111-1111-1111-1111-111111111111")
ok(r.error && /permission denied/.test(r.error), "pedidos: authenticated no puede escribir")
r = await como(db, "authenticated", `insert into public.favoritos (usuario_id, producto_id) values ('11111111-1111-1111-1111-111111111111', 1) returning id`)
ok(!r.error, "favoritos: authenticated inserta")
r = await como(db, "authenticated", `update public.favoritos set producto_id = 2`)
ok(r.error && /permission denied/.test(r.error), "favoritos: pero no actualiza (no lo usa nadie)")
r = await como(db, "authenticated", `insert into public.productos (vendedor_id, nombre) values (15, 'Taza') returning id`)
ok(!r.error, "productos: authenticated inserta (las políticas deciden de quién)")
r = await como(db, "anon", `insert into public.productos (vendedor_id, nombre) values (15, 'Taza')`)
ok(r.error && /permission denied/.test(r.error), "productos: anon no")
const todas = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((x) => x.tablename)
const truncables = []
for (const tabla of todas) {
  for (const rol of ["anon", "authenticated"]) {
    r = await como(db, rol, `truncate public.${tabla} cascade`)
    if (!r.error) truncables.push(`${tabla} (${rol})`)
  }
}
ok(truncables.length === 0, `TRUNCATE como anon o authenticated falla en todas las tablas${truncables.length ? ": " + truncables.join(", ") : ""}`)

console.log("\n4. barrios_csv")
ok((await db.query(`select to_regclass('public.barrios_csv') as t`)).rows[0].t === null, "sin nada que dependa de ella: se borró")
const db2 = await base({ conDependencia: true })
await db2.exec(MIG)
ok((await db2.query(`select to_regclass('public.barrios_csv') as t`)).rows[0].t !== null, "con una clave foránea que la apunta: NO se borra (la migración no falla)")
ok((await permisos(db2, "barrios_csv", "anon")) === "" && (await permisos(db2, "barrios_csv", "authenticated")) === "", "y queda sin permisos")

console.log("\n5. La verificación corre")
const v = JSON.parse((await db.query(MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length))).rows[0].verificacion)
ok(v.columnas_zona_que_quedan.length === 0 && !v.disparador_redondear_zona && !v.funcion_vendedores_redondear_zona && !v.restriccion_vendedores_zona_largo && !v.barrios_csv_existe && v.direccion_visible_sigue, "todo en su lugar")

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
