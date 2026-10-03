// Prueba de la migración 018 contra una base local (PGlite: Postgres real en
// WebAssembly, sin instalar nada). No toca Supabase ni ninguna base real.
//
//   npm run probar:018
//
// La tabla vendedores imita la de producción en lo que importa acá: los
// permisos por columna (resultado de attacl del 3/10/2026), los de tabla
// (DELETE, TRUNCATE, REFERENCES, TRIGGER) y los tres vendedores que hay. Se
// corren las migraciones 006 y 017 reales, porque sus disparadores conviven
// con el de la 018. Lo que NO prueba: RLS ni PostgREST.
//
// Dos caminos que tienen que terminar iguales:
//   · "a medias": el borrador de la propuesta corrido por error en producción,
//     con el disparador borrado a mano, y después la 018 dos veces.
//   · "de cero": la 018 dos veces sobre la base sin nada.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { redondearPunto } from "../src/lib/zonaVendedor.js"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("018_vendedores_zona.sql")
const M006 = leer("006_vendedores_vuelta_a_revision.sql")
const M017 = leer("017_localidades_activa.sql")

// El borrador tal como se propuso (y se corrió) el 3/10/2026.
const BORRADOR = `
begin;
alter table public.vendedores
  add column if not exists direccion_visible boolean not null default false,
  add column if not exists zona_calle text,
  add column if not exists zona_entre text,
  add column if not exists zona_y text;
alter table public.vendedores
  add constraint vendedores_zona_largo check (
    coalesce(char_length(zona_calle), 0) <= 80 and
    coalesce(char_length(zona_entre), 0) <= 80 and
    coalesce(char_length(zona_y), 0) <= 80);
alter table public.vendedores disable trigger trg_vendedores_vuelta_a_revision;
update public.vendedores set direccion_visible = true where recibe_publico is true;
alter table public.vendedores enable trigger trg_vendedores_vuelta_a_revision;
create or replace function privado.vendedores_redondear_zona() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not new.direccion_visible then
    new.direccion := null;
    if new.latitud is not null and new.longitud is not null then
      new.latitud  := round(new.latitud::numeric  / 0.0018) * 0.0018;
      new.longitud := round(new.longitud::numeric / 0.0023) * 0.0023;
    end if;
  else
    new.zona_calle := null; new.zona_entre := null; new.zona_y := null;
  end if;
  return new;
end $$;
revoke all on function privado.vendedores_redondear_zona() from public, anon, authenticated;
create trigger redondear_zona before insert or update on public.vendedores
  for each row execute function privado.vendedores_redondear_zona();
grant select (direccion_visible, zona_calle, zona_entre, zona_y) on public.vendedores to anon, authenticated;
commit;
`

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

async function baseNueva() {
  const db = new PGlite()
  await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema privado;
  grant usage on schema privado to anon, authenticated, service_role;

  create table public.localidades (id serial primary key, nombre text);
  insert into public.localidades (nombre) values ('Bahía Blanca'), ('Ingeniero White'), ('General Daniel Cerri');
  create table public.barrios (id serial primary key, nombre text, localidad_id int references public.localidades);
  insert into public.barrios (nombre, localidad_id) values ('Centro', 1), ('Universitario', 1);
  create table public.direcciones (id serial primary key, calle text, barrio_id int);

  create table public.vendedores (
    id serial primary key,
    usuario_id uuid, nombre_negocio text, slug text,
    recibe_publico boolean, direccion text,
    barrio_id integer, barrio_detectado_automaticamente boolean,
    latitud numeric(10,7), longitud numeric(10,7),
    localidad_id integer,
    estado_validacion text default 'aprobado', bloqueado boolean default false
  );

  -- Permisos como en producción: nada de SELECT/INSERT/UPDATE de tabla,
  -- todo por columna; y DELETE/TRUNCATE/REFERENCES/TRIGGER de tabla.
  revoke all on public.vendedores from anon, authenticated;
  grant delete, truncate, references, trigger on public.vendedores to anon, authenticated;
  grant select (id, usuario_id, nombre_negocio, slug, recibe_publico, direccion, barrio_id,
                barrio_detectado_automaticamente, latitud, longitud, localidad_id,
                estado_validacion, bloqueado) on public.vendedores to anon, authenticated;
  grant insert (usuario_id, nombre_negocio, slug, recibe_publico, direccion, barrio_id,
                barrio_detectado_automaticamente, latitud, longitud, localidad_id)
    on public.vendedores to authenticated;
  grant update (nombre_negocio, recibe_publico, direccion, barrio_id,
                barrio_detectado_automaticamente, latitud, longitud, localidad_id)
    on public.vendedores to authenticated;
  grant usage on all sequences in schema public to authenticated, service_role;
  grant all on public.vendedores to service_role;

  -- Los tres de producción (14 y 16 reciben público; 15 no, sin punto) y
  -- uno con cambios pedidos, para ver que la carga no lo reabre.
  insert into public.vendedores (id, nombre_negocio, recibe_publico, direccion, latitud, longitud, localidad_id, barrio_id, estado_validacion) values
    (14, 'Catorce', true,  'Donado 123', -38.7147653, -62.2601438, 1, 1, 'aprobado'),
    (15, 'Quince',  false, null,          null,        null,       1, 1, 'aprobado'),
    (16, 'Dieciséis', true, 'Alsina 45', -38.7182645, -62.2665811, 1, 2, 'aprobado'),
    (17, 'Con cambios', true, 'Chiclana 9', -38.7200000, -62.2700000, 1, 1, 'necesita_cambios');
  select setval('public.vendedores_id_seq', 17);
  `)
  await db.exec(M006)
  await db.exec(M017)
  return db
}

const q = async (db, sql, p) => (await db.query(sql, p)).rows

async function foto(db) {
  return JSON.stringify((await q(db, `select json_build_object(
    'columnas', (select json_agg(json_build_object('n', column_name, 't', data_type, 'd', column_default, 'nulo', is_nullable) order by column_name)
                 from information_schema.columns where table_schema = 'public' and table_name = 'vendedores'),
    'constraints', (select json_agg(json_build_object('n', conname, 'd', pg_get_constraintdef(oid)) order by conname)
                 from pg_constraint where conrelid = 'public.vendedores'::regclass),
    'disparadores', (select json_agg(json_build_object('n', tgname, 'd', pg_get_triggerdef(oid), 'on', tgenabled) order by tgname)
                 from pg_trigger where tgrelid = 'public.vendedores'::regclass and not tgisinternal),
    'funciones', (select json_agg(json_build_object('def', pg_get_functiondef(oid), 'acl', proacl::text) order by proname)
                 from pg_proc where pronamespace = 'privado'::regnamespace),
    'tabla', (select array_to_string(array(select x::text from unnest(relacl) x order by 1), ',')
                 from pg_class where oid = 'public.vendedores'::regclass),
    'columnas_acl', (select json_agg(json_build_object('n', attname,
                      'a', array_to_string(array(select x::text from unnest(attacl) x order by 1), ',')) order by attname)
                 from pg_attribute where attrelid = 'public.vendedores'::regclass and attnum > 0 and not attisdropped),
    'filas', (select json_agg(v order by id) from public.vendedores v)
  ) as f`))[0].f)
}

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

console.log("\n1. Estado a medias y de cero terminan iguales")
const aMedias = await baseNueva()
await aMedias.exec(BORRADOR)
await aMedias.exec("drop trigger redondear_zona on public.vendedores") // lo que se hizo a mano
await aMedias.exec(MIG)
await aMedias.exec(MIG)
const deCero = await baseNueva()
await deCero.exec(MIG)
await deCero.exec(MIG)
ok(true, "la 018 corre dos veces seguidas en los dos caminos")
const fA = await foto(aMedias), fC = await foto(deCero)
ok(fA === fC, "columnas, constraint, disparadores, función, permisos y filas: idénticos")
if (fA !== fC) {
  const a = JSON.parse(fA), c = JSON.parse(fC)
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(c[k])) console.log(`    difiere: ${k}\n      a medias: ${JSON.stringify(a[k])}\n      de cero:  ${JSON.stringify(c[k])}`)
}
ok((await q(aMedias, `select prosecdef from pg_proc where proname = 'vendedores_redondear_zona'`))[0].prosecdef === false,
  "la función del borrador (security definer) quedó como security invoker")

const db = deCero

console.log("\n2. Datos existentes")
{
  const filas = await q(db, `select id, direccion_visible, latitud::text, longitud::text, direccion, estado_validacion from public.vendedores order by id`)
  const f = Object.fromEntries(filas.map((r) => [r.id, r]))
  ok(f[14].direccion_visible && f[14].latitud === "-38.7147653" && f[14].direccion === "Donado 123", "14: dirección visible, punto exacto y dirección intactos")
  ok(f[16].direccion_visible && f[16].longitud === "-62.2665811" && f[16].direccion === "Alsina 45", "16: igual")
  ok(!f[15].direccion_visible && f[15].latitud === null, "15: sin dirección visible y sin punto")
  ok(f[17].estado_validacion === "necesita_cambios", "la carga no reabrió la revisión (006 apagada durante el UPDATE)")
  const t = await q(db, `select tgname, tgenabled from pg_trigger where tgrelid = 'public.vendedores'::regclass and not tgisinternal order by tgname`)
  ok(t.map((r) => r.tgname).join(",") === "rechazar_localidad_inactiva,redondear_zona,trg_vendedores_vuelta_a_revision"
     && t.every((r) => r.tgenabled === "O"), "disparadores presentes y todos prendidos")
}

console.log("\n3. El disparador redondea (segunda barrera)")
{
  await db.exec(`insert into public.vendedores (id, nombre_negocio, direccion_visible, direccion, latitud, longitud, zona_calle, zona_entre, zona_y, localidad_id)
                 values (30, 'Zona', false, 'Mitre 1234', -38.7147653, -62.2601438, '12 de Octubre', 'Salta', 'Mitre', 1)`)
  let r = (await q(db, `select latitud::text, longitud::text, direccion, zona_calle from public.vendedores where id = 30`))[0]
  ok(r.latitud === "-38.7144000" && r.longitud === "-62.2610000", `con "No" el punto exacto se guarda redondeado (${r.latitud}, ${r.longitud})`)
  ok(r.direccion === null && r.zona_calle === "12 de Octubre", `con "No" no queda dirección y sí las calles`)

  await db.exec(`update public.vendedores set nombre_negocio = 'Zona 2' where id = 30`)
  r = (await q(db, `select latitud::text, longitud::text from public.vendedores where id = 30`))[0]
  ok(r.latitud === "-38.7144000" && r.longitud === "-62.2610000", "redondear un punto ya redondeado no lo mueve")

  await db.exec(`update public.vendedores set direccion_visible = true, direccion = 'Mitre 1234', latitud = -38.7147653, longitud = -62.2601438 where id = 30`)
  r = (await q(db, `select latitud::text, direccion, zona_calle, zona_entre, zona_y from public.vendedores where id = 30`))[0]
  ok(r.latitud === "-38.7147653" && r.direccion === "Mitre 1234", `con "Sí" el punto exacto y la dirección quedan`)
  ok(r.zona_calle === null && r.zona_entre === null && r.zona_y === null, `con "Sí" se borran las calles`)

  await db.exec(`update public.vendedores set direccion_visible = false, zona_calle = 'A', zona_entre = 'B', zona_y = 'C' where id = 30`)
  r = (await q(db, `select latitud::text, direccion from public.vendedores where id = 30`))[0]
  ok(r.latitud === "-38.7144000" && r.direccion === null, `pasar de "Sí" a "No" redondea y borra la dirección`)

  const largo = await como(db, "service_role", `update public.vendedores set zona_calle = repeat('x', 81) where id = 30`)
  ok(largo && /vendedores_zona_largo/.test(largo), "una calle de más de 80 caracteres se rechaza")
}

console.log("\n4. La grilla de la base y la de src/lib/zonaVendedor.js son la misma")
{
  // Puntos con 7 decimales (lo que guarda numeric(10,7)) en todo el partido,
  // más algunos justo en el medio de dos celdas.
  const puntos = []
  for (let i = 0; i < 400; i++) {
    puntos.push([Number((-39.1 + Math.random() * 0.8).toFixed(7)), Number((-62.6 + Math.random() * 0.8).toFixed(7))])
  }
  puntos.push([-38.7171, -62.26265], [-38.7153, -62.25805], [38.7171, 62.26265])
  let distintos = 0
  for (const [lat, lng] of puntos) {
    const base = (await q(db, `select (round($1::numeric(10,7) / 0.0018) * 0.0018)::numeric(10,7)::float8 as lat,
                                      (round($2::numeric(10,7) / 0.0023) * 0.0023)::numeric(10,7)::float8 as lng`, [lat, lng]))[0]
    const js = redondearPunto(lat, lng)
    if (base.lat !== js.lat || base.lng !== js.lng) { distintos++; if (distintos <= 3) console.log("    distinto:", lat, lng, base, js) }
  }
  ok(distintos === 0, `${puntos.length} puntos redondeados igual en JS y en la base (incluidas las mitades)`)
}

console.log("\n5. Permisos")
{
  const negado = (e) => !!e && /permission denied/.test(e)
  ok(await como(db, "authenticated", `insert into public.vendedores (usuario_id, nombre_negocio, slug) values (gen_random_uuid(), 'Nueva', 'nueva')`) === null,
    "el alta sin columnas de ubicación sigue andando")
  ok(negado(await como(db, "authenticated", `insert into public.vendedores (nombre_negocio, latitud) values ('x', -38.7)`)), "el navegador no puede crear con latitud")
  ok(negado(await como(db, "authenticated", `insert into public.vendedores (nombre_negocio, localidad_id) values ('x', 1)`)), "ni con localidad_id")
  for (const col of ["latitud = -38.7", "longitud = -62.2", "direccion = 'x'", "barrio_id = 1", "recibe_publico = true",
                     "localidad_id = 1", "direccion_visible = true", "zona_calle = 'x'", "barrio_detectado_automaticamente = true"]) {
    ok(negado(await como(db, "authenticated", `update public.vendedores set ${col} where id = 15`)), `el navegador no puede: ${col}`)
  }
  ok(await como(db, "authenticated", `update public.vendedores set nombre_negocio = 'Quince bis' where id = 15`) === null, "el navegador sí edita el nombre")
  ok(await como(db, "anon", `select direccion_visible, zona_calle, zona_entre, zona_y, latitud from public.vendedores`) === null, "anon lee las columnas nuevas")
  for (const rol of ["anon", "authenticated"]) {
    ok(negado(await como(db, rol, `delete from public.vendedores where id = 15`)), `${rol} no puede borrar`)
    ok(negado(await como(db, rol, `truncate public.vendedores`)), `${rol} no puede vaciar la tabla`)
  }
  ok(await como(db, "service_role", `update public.vendedores set direccion_visible = false, zona_calle = 'A', zona_entre = 'B', zona_y = 'C',
       latitud = -38.71, longitud = -62.26 where id = 15`) === null, "service_role (la ruta) sí escribe la ubicación")
}

console.log("\n6. Convive con 006 y 017")
{
  await db.exec(`update public.vendedores set estado_validacion = 'necesita_cambios' where id = 16`)
  await como(db, "authenticated", `update public.vendedores set nombre_negocio = 'Dieciséis bis' where id = 16`)
  ok((await q(db, `select estado_validacion from public.vendedores where id = 16`))[0].estado_validacion === "pendiente",
    "006: si el vendedor edita algo, la tienda vuelve a revisión")
  const e = await como(db, "service_role", `update public.vendedores set localidad_id = 3 where id = 16`)
  ok(!!e && /no está disponible/.test(e), "017: la ruta tampoco puede pasar una tienda a una localidad inactiva")
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
