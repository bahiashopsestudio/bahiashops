// Prueba de la migración 030 (pausar la tienda) contra una base local (PGlite:
// Postgres real en WebAssembly, sin instalar nada). No toca Supabase ni
// ninguna base real.
//
//   npm run probar:030
//
// Se corre antes la 007 real (la 030 reemplaza su función vendedor_visible y
// se suma a sus políticas). A diferencia de otras pruebas de migraciones, esta
// SÍ prueba RLS: entra como anon, como authenticated (con auth.uid() de
// mentira) y como service_role. Lo que no prueba es PostgREST.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const M007 = leer("007_vendedores_publicacion_automatica.sql")
const MIG = leer("030_pausar_tienda.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const DUENA = "11111111-1111-1111-1111-111111111111"
const OTRA = "22222222-2222-2222-2222-222222222222"

const db = new PGlite()
const q = async (sql, p) => (await db.query(sql, p)).rows

// Corre como un rol (y una persona, para auth.uid()). Devuelve { filas, error }.
async function como(rol, sql, uid = null) {
  try {
    await db.exec(`select set_config('test.uid', '${uid || ""}', false); set role ${rol}`)
    const r = await db.query(sql)
    return { filas: r.rows, error: null }
  } catch (e) {
    return { filas: [], error: e.message }
  } finally {
    await db.exec("reset role")
  }
}
const ids = (r) => r.filas.map((f) => f.id).join(",")

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema privado;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  -- Como en producción: el navegador lee vendedores entera y la escribe (el
  -- vendedor edita su tienda directo); RLS decide qué filas.
  create table public.vendedores (
    id serial primary key, usuario_id uuid, nombre_negocio text,
    estado_validacion text default 'aprobado', notas_validacion text, bloqueado boolean default false
  );
  alter table public.vendedores enable row level security;
  create policy "Lectura pública vendedores" on public.vendedores for select using (true);
  create policy "Vendedor edita su tienda" on public.vendedores for update to authenticated
    using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
  create policy "Vendedor crea su tienda" on public.vendedores for insert to authenticated
    with check (usuario_id = auth.uid());
  grant select, insert, update on public.vendedores to anon, authenticated;
  grant all on public.vendedores to service_role;
  grant usage on all sequences in schema public to authenticated, service_role;

  create table public.productos (id serial primary key, vendedor_id integer not null, nombre text, estado text default 'activo');
  alter table public.productos enable row level security;
  create policy "Lectura pública productos" on public.productos for select using (true);
  grant select on public.productos to anon, authenticated;
  grant all on public.productos to service_role;

  create table public.producto_media (id serial primary key, producto_id integer not null, url text);
  create table public.producto_variantes (id serial primary key, producto_id integer not null, valor text);
  create table public.producto_sellos (id serial primary key, producto_id integer not null, sello text);
  alter table public.producto_media enable row level security;
  alter table public.producto_variantes enable row level security;
  alter table public.producto_sellos enable row level security;
  create policy "Lectura pública" on public.producto_media for select using (true);
  create policy "Lectura pública" on public.producto_variantes for select using (true);
  create policy "Lectura pública" on public.producto_sellos for select using (true);
  grant select on public.producto_media, public.producto_variantes, public.producto_sellos to anon, authenticated;
  grant all on public.producto_media, public.producto_variantes, public.producto_sellos to service_role;

  create table public.pedidos (id bigserial primary key, vendedor_id bigint not null, estado text not null default 'pendiente', actualizado_en timestamptz);
  alter table public.pedidos enable row level security;
  grant all on public.pedidos to service_role;
  grant usage on all sequences in schema public to service_role;

  insert into public.vendedores (id, usuario_id, nombre_negocio) values
    (1, '${DUENA}', 'Ludoméstica'),
    (2, '${OTRA}', 'Otra tienda'),
    (3, '${OTRA}', 'Tienda que se va a cerrar');
  insert into public.productos (id, vendedor_id, nombre) values (10, 1, 'Taza'), (20, 2, 'Plato'), (30, 3, 'Mate');
  insert into public.producto_media (producto_id, url) values (10, 'a.webp'), (20, 'b.webp'), (30, 'c.webp');
  insert into public.producto_variantes (producto_id, valor) values (10, 'Azul'), (20, 'Rojo'), (30, 'Verde');
  insert into public.producto_sellos (producto_id, sello) values (10, 'hecho-a-mano'), (20, 'local'), (30, 'local');
  insert into public.pedidos (vendedor_id, estado) values (1, 'pagado');
`)
await db.exec(M007)
await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

console.log("1. Columnas y restricción del mensaje")
const cols = await q(`select column_name, data_type from information_schema.columns where table_name = 'vendedores' and column_name in ('pausada_en', 'mensaje_pausa', 'cerrada_en') order by 1`)
ok(cols.map((c) => `${c.column_name}:${c.data_type}`).join(" ") === "cerrada_en:timestamp with time zone mensaje_pausa:text pausada_en:timestamp with time zone", "pausada_en, mensaje_pausa y cerrada_en, con sus tipos")
ok((await q(`select count(*)::int n from public.vendedores where pausada_en is not null or cerrada_en is not null`))[0].n === 0, "ninguna tienda nace pausada ni cerrada")
let r = await como("service_role", `update public.vendedores set pausada_en = now(), mensaje_pausa = '${"x".repeat(201)}' where id = 1`)
ok(!!r.error, "un mensaje de 201 caracteres se rechaza")
r = await como("service_role", `update public.vendedores set mensaje_pausa = 'hola' where id = 1`)
ok(!!r.error, "un mensaje sin la tienda pausada se rechaza")

console.log("\n2. Solo el servidor pausa, reactiva o cierra")
r = await como("authenticated", `update public.vendedores set pausada_en = now() where id = 1`, DUENA)
ok(r.error && /Mi negocio/.test(r.error), "la dueña desde el navegador NO puede pausar")
r = await como("authenticated", `update public.vendedores set cerrada_en = null, mensaje_pausa = null where id = 1`, DUENA)
ok(!r.error, "mandar las columnas sin cambiarlas no falla (PostgREST manda lo que hay)")
r = await como("authenticated", `update public.vendedores set cerrada_en = now() where id = 1`, DUENA)
ok(!!r.error, "ni cerrar")
r = await como("authenticated", `update public.vendedores set nombre_negocio = 'Ludoméstica!' where id = 1 returning id`, DUENA)
ok(!r.error && r.filas.length === 1, "pero sí editar el resto de su tienda")
r = await como("authenticated", `insert into public.vendedores (usuario_id, nombre_negocio, pausada_en) values ('${DUENA}', 'x', now())`, DUENA)
ok(!!r.error, "ni dar de alta una tienda ya pausada")
r = await como("service_role", `update public.vendedores set pausada_en = now(), mensaje_pausa = 'De vacaciones' where id = 1 returning id`)
ok(!r.error && r.filas.length === 1, "service_role (las rutas de /api/vendedor/pausa) SÍ pausa")
r = await como("service_role", `update public.vendedores set cerrada_en = now() where id = 3 returning id`)
ok(!r.error, "y cierra (la 3, para probar)")
const fila = (await q(`select estado_validacion from public.vendedores where id = 1`))[0]
ok(fila.estado_validacion === "aprobado", "pausar no toca estado_validacion")

console.log("\n3. La ficha: la fila de la tienda pausada se sigue leyendo")
for (const [rol, uid] of [["anon", null], ["authenticated", OTRA]]) {
  r = await como(rol, `select id, pausada_en, mensaje_pausa from public.vendedores order by id`, uid)
  ok(ids(r) === "1,2", `${rol}: ve la pausada (1) y la activa (2); la cerrada (3) no`)
  ok(r.filas[0].pausada_en && r.filas[0].mensaje_pausa === "De vacaciones", `${rol}: lee pausada_en y mensaje_pausa`)
}

console.log("\n4. Los productos de la pausada se ocultan (menos para su dueña)")
for (const tabla of ["productos", "producto_media", "producto_variantes", "producto_sellos"]) {
  const col = tabla === "productos" ? "id" : "producto_id as id"
  const a = await como("anon", `select ${col} from public.${tabla} order by 1`)
  const otra = await como("authenticated", `select ${col} from public.${tabla} order by 1`, OTRA)
  const duena = await como("authenticated", `select ${col} from public.${tabla} order by 1`, DUENA)
  ok(ids(a) === "20" && ids(otra) === "20", `${tabla}: el público y otra cuenta solo ven los de la tienda activa`)
  ok(ids(duena) === "10,20", `${tabla}: la dueña ve los suyos (10) aunque la tienda esté pausada`)
}

console.log("\n5. Pedidos nuevos")
r = await como("service_role", `insert into public.pedidos (vendedor_id) values (1)`)
ok(r.error === "Esta tienda no está recibiendo pedidos.", "a la pausada: rechazado, con \"Esta tienda no está recibiendo pedidos.\"")
r = await como("service_role", `insert into public.pedidos (vendedor_id) values (3)`)
ok(r.error === "Esta tienda no está recibiendo pedidos.", "a la cerrada: rechazado")
r = await como("service_role", `insert into public.pedidos (vendedor_id) values (2) returning id`)
ok(!r.error && r.filas.length === 1, "a la activa: se crea")
r = await como("service_role", `update public.pedidos set estado = 'preparando', actualizado_en = now() where vendedor_id = 1 returning id`)
ok(!r.error && r.filas.length === 1, "los pedidos que la pausada ya tenía se siguen moviendo")

console.log("\n6. Reactivar")
r = await como("service_role", `update public.vendedores set pausada_en = null, mensaje_pausa = null where id = 1 returning id`)
ok(!r.error, "service_role reactiva")
r = await como("anon", `select id from public.productos order by id`)
ok(ids(r) === "10,20", "los productos vuelven a verse")
r = await como("service_role", `insert into public.pedidos (vendedor_id) values (1) returning id`)
ok(!r.error, "y vuelve a recibir pedidos")

console.log("\n7. Lo de la 007 sigue igual")
await db.exec(`update public.vendedores set bloqueado = true where id = 2`)
r = await como("anon", `select id from public.vendedores order by id`)
ok(ids(r) === "1", "una tienda bloqueada sigue sin verse")
r = await como("anon", `select id from public.productos order by id`)
ok(ids(r) === "10", "ni sus productos")
r = await como("authenticated", `select id from public.productos order by id`, OTRA)
ok(ids(r) === "10,20", "su dueña sí los ve")

console.log("\n8. La verificación corre")
const verif = await q(MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length))
const v = JSON.parse(verif[0].verificacion)
ok(v.columnas.length === 3 && Object.values(v.rls_activo).every(Boolean), "columnas y RLS activo")
ok(v.lectura_publica_pausa.anon && v.lectura_publica_pausa.authenticated, "lectura pública de la pausa")
ok(v.politicas.length === 6 && v.disparadores.length === 2, "6 políticas y 2 disparadores")

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
