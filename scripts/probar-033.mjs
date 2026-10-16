// Prueba de la migración 033 (productos por el servidor) contra una base local
// (PGlite: Postgres real en WebAssembly, sin instalar nada). No toca Supabase
// ni ninguna base real.
//
//   npm run probar:033
//
// El estado de antes imita al de producción (relevado el 16/10/2026):
//   · productos, producto_media, producto_variantes, producto_sellos, sellos y
//     vendedor_sellos con sus columnas, restricciones y claves foráneas reales
//     (las hijas ON DELETE CASCADE; pedido_items sin cascada);
//   · sus políticas RLS reales, más las de la 007 y la 030 (corridas de verdad);
//   · los permisos que dejó la 032 (SELECT para anon; todo para authenticated).
// Prueba, como vendedor autenticado, que ya no puede escribir nada de un
// producto (ni estado, ni destacado, ni avisos, ni nada), y que todo lo
// legítimo (crear, editar, pausar, reactivar, borrar) sigue andando por el
// servidor. Al final corre la 033 sobre la base de probar-031 y prueba que
// borrar la tienda y la cuenta siguen andando.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { baseDeTiendas } from "./base-tiendas-prueba.mjs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const MIG = leer("033_productos_por_el_servidor.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const U1 = "11111111-1111-1111-1111-111111111111" // vendedora de la tienda 1
const U2 = "22222222-2222-2222-2222-222222222222" // vendedora de la tienda 2
const ADMIN = "33333333-3333-3333-3333-333333333333"
const TIENDA = ["productos", "producto_media", "producto_variantes", "producto_sellos"]

const ESQUEMA = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema privado;
  grant usage on schema privado to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create table public.usuarios (id uuid primary key, email text, es_admin boolean default false);
  create table public.vendedores (id serial primary key, usuario_id uuid references public.usuarios,
    nombre_negocio text, slug text, estado_validacion text default 'aprobado', notas_validacion text,
    bloqueado boolean default false);
  create table public.categorias (id serial primary key, nombre text, activa boolean default true);
  create table public.subcategorias (id serial primary key, categoria_id integer, nombre text);
  create table public.sellos (id serial primary key, nombre text not null unique, slug text, activa boolean default true);

  create table public.productos (
    id serial primary key,
    vendedor_id integer not null references public.vendedores(id) on delete cascade,
    nombre text not null, descripcion text not null,
    categoria_id integer not null references public.categorias(id),
    subcategoria_id integer references public.subcategorias(id),
    marca text, palabras_clave text,
    precio numeric not null check (precio > 0), precio_anterior numeric,
    stock integer not null default 0 check (stock >= 0),
    estado text not null default 'activo'
      check (estado = any (array['en_revision', 'activo', 'pausado', 'agotado', 'rechazado'])),
    tiempo_preparacion text not null
      check (tiempo_preparacion = any (array['inmediata', 'durante_el_dia', 'manana', '2_a_4_dias', '1_a_2_semanas', 'mas_2_semanas'])),
    opciones_entrega text[] not null default '{}',
    peso_gramos integer, largo_cm numeric, ancho_cm numeric, alto_cm numeric, condicion text,
    destacado boolean default false, destacado_hasta timestamptz,
    creado_en timestamptz default now(), actualizado_en timestamptz default now(),
    tiene_variantes boolean not null default false, propiedad_1_nombre text, propiedad_2_nombre text,
    motivo_rechazo text, moderacion_avisos jsonb default '[]'::jsonb,
    categoria_secundaria_id integer references public.categorias(id) on delete set null,
    subcategoria_secundaria_id integer references public.subcategorias(id) on delete set null,
    subcategoria_personalizada text, subcategoria_secundaria_personalizada text,
    genero text[] default '{}',
    constraint productos_check check (precio_anterior is null or precio_anterior > precio),
    constraint check_variantes_coherentes check (
      (tiene_variantes = false and propiedad_1_nombre is null and propiedad_2_nombre is null)
      or (tiene_variantes = true and propiedad_1_nombre is not null))
  );
  create table public.producto_media (id serial primary key,
    producto_id integer not null references public.productos(id) on delete cascade,
    url text not null, tipo text not null default 'foto' check (tipo = any (array['foto', 'video'])),
    orden integer not null default 0, es_principal boolean not null default false, creado_en timestamptz default now());
  create table public.producto_variantes (id serial primary key,
    producto_id integer not null references public.productos(id) on delete cascade,
    propiedad_1_valor text not null, propiedad_2_valor text, stock integer not null default 0, imagen_url text,
    creada_en timestamptz default now(), actualizada_en timestamptz default now(),
    constraint producto_variantes_sin_repetir unique nulls not distinct (producto_id, propiedad_1_valor, propiedad_2_valor));
  create table public.producto_sellos (
    producto_id integer not null references public.productos(id) on delete cascade,
    sello_id integer not null references public.sellos(id) on delete cascade,
    creado_en timestamptz default now(), primary key (producto_id, sello_id));
  create table public.vendedor_sellos (
    vendedor_id integer not null references public.vendedores(id) on delete cascade,
    sello_id integer not null references public.sellos(id) on delete cascade,
    creado_en timestamptz default now(), primary key (vendedor_id, sello_id));
  create table public.pedidos (id bigserial primary key, comprador_id uuid, vendedor_id integer references public.vendedores, estado text);
  create table public.pedido_items (id serial primary key,
    pedido_id bigint not null references public.pedidos on delete cascade,
    producto_id integer references public.productos(id));
  create table public.favoritos (id serial primary key, usuario_id uuid, producto_id integer references public.productos(id) on delete cascade);
  create table public.coleccion_productos (coleccion_id integer, producto_id integer references public.productos(id) on delete cascade);
  create table public.tesoros (id serial primary key, producto_id integer references public.productos(id) on delete cascade);

  alter table public.usuarios enable row level security;
  alter table public.vendedores enable row level security;
  alter table public.productos enable row level security;
  alter table public.producto_media enable row level security;
  alter table public.producto_variantes enable row level security;
  alter table public.producto_sellos enable row level security;
  alter table public.vendedor_sellos enable row level security;
  alter table public.sellos enable row level security;
  create policy "usuarios lectura" on public.usuarios for select using (true);
  create policy "vendedores lectura" on public.vendedores for select using (true);
  create policy "Lectura pública etiquetas" on public.sellos for select using (true);

  -- Las políticas reales (consulta 3 del relevamiento).
  create policy "Vendedor borra sus productos" on public.productos for delete
    using (vendedor_id in (select vendedores.id from vendedores where vendedores.usuario_id = auth.uid()));
  create policy "Vendedor crea sus productos" on public.productos for insert
    with check (vendedor_id in (select vendedores.id from vendedores where vendedores.usuario_id = auth.uid()));
  create policy "Admin ve todos los productos" on public.productos for select to authenticated
    using (exists (select 1 from usuarios where usuarios.id = auth.uid() and usuarios.es_admin = true));
  create policy "Lectura pública de productos activos" on public.productos for select
    using (estado = 'activo' and vendedor_id in (select vendedores.id from vendedores where vendedores.estado_validacion = 'aprobado'));
  create policy "Vendedor ve sus productos" on public.productos for select
    using (vendedor_id in (select vendedores.id from vendedores where vendedores.usuario_id = auth.uid()));
  create policy "Admin modera productos" on public.productos for update to authenticated
    using (exists (select 1 from usuarios where usuarios.id = auth.uid() and usuarios.es_admin = true));
  create policy "Vendedor edita sus productos" on public.productos for update
    using (vendedor_id in (select vendedores.id from vendedores where vendedores.usuario_id = auth.uid()));
  create policy "Vendedor borra media de sus productos" on public.producto_media for delete
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Vendedor sube media a sus productos" on public.producto_media for insert
    with check (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Lectura pública de media" on public.producto_media for select
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where p.estado = 'activo' and v.estado_validacion = 'aprobado'));
  create policy "Vendedor ve media de sus productos" on public.producto_media for select
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Vendedor edita media de sus productos" on public.producto_media for update
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Vendedor gestiona etiquetas de sus productos" on public.producto_sellos for all
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Lectura pública etiquetas de productos" on public.producto_sellos for select
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where p.estado = 'activo' and v.estado_validacion = 'aprobado'));
  create policy "Vendedor borra variantes de sus productos" on public.producto_variantes for delete
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Vendedor crea variantes de sus productos" on public.producto_variantes for insert
    with check (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Lectura pública variantes" on public.producto_variantes for select
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where p.estado = 'activo' and v.estado_validacion = 'aprobado'));
  create policy "Vendedor lee variantes de sus productos" on public.producto_variantes for select
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Vendedor edita variantes de sus productos" on public.producto_variantes for update
    using (producto_id in (select p.id from productos p join vendedores v on p.vendedor_id = v.id where v.usuario_id = auth.uid()));
  create policy "Vendedor gestiona sus sellos" on public.vendedor_sellos for all
    using (vendedor_id in (select vendedores.id from vendedores where vendedores.usuario_id = auth.uid()));
  create policy "Sellos de vendedor públicos" on public.vendedor_sellos for select using (true);

  -- Los permisos de hoy: los de la 032 para las cinco tablas de la tienda.
  grant select on public.usuarios, public.vendedores, public.categorias, public.subcategorias, public.sellos to anon, authenticated;
  grant all on all tables in schema public to service_role;
  grant usage on all sequences in schema public to anon, authenticated, service_role;
  do $$ declare t text; begin
    foreach t in array array['productos', 'producto_media', 'producto_variantes', 'producto_sellos', 'vendedor_sellos'] loop
      execute format('grant select on public.%I to anon', t);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
  end $$;

  insert into public.usuarios (id, email, es_admin) values
    ('${U1}', 'ana@mail.com', false), ('${U2}', 'bea@mail.com', false), ('${ADMIN}', 'admin@mail.com', true);
  insert into public.vendedores (id, usuario_id, nombre_negocio, slug) values (1, '${U1}', 'Ludoméstica', 'ludo'), (2, '${U2}', 'Plan Material', 'plan');
  select setval('vendedores_id_seq', 2);
  insert into public.categorias (nombre) values ('Juegos'), ('Hogar');
  insert into public.subcategorias (categoria_id, nombre) values (1, 'Mesa');
  insert into public.sellos (nombre) values ('Hecho en Bahía'), ('Hecho a mano'), ('Vegano');
`

// Productos de antes de la migración. "conAvisos" es un producto aprobado
// editado con avisos entre el código nuevo y la migración: la 033 lo marca.
const PRODUCTOS = `
  insert into public.productos (id, vendedor_id, nombre, descripcion, categoria_id, precio, tiempo_preparacion, estado, moderacion_avisos, motivo_rechazo) values
    (10, 1, 'Taza', 'De cerámica', 1, 1000, 'inmediata', 'activo', '[]', null),
    (11, 1, 'Plato', 'Hondo', 1, 2000, 'inmediata', 'en_revision', '[]', null),
    (12, 1, 'Jarra', 'Grande', 1, 3000, 'inmediata', 'rechazado', '[]', 'Fotos borrosas'),
    (13, 1, 'Mate', 'Calabaza', 1, 4000, 'inmediata', 'pausado', '[]', null),
    (14, 1, 'Bombilla', 'Alpaca', 1, 5000, 'inmediata', 'agotado', '[]', null),
    (15, 1, 'Vaso', 'Vidrio', 1, 6000, 'inmediata', 'activo', '[{"tipo":"contacto_telefono","texto":"291"}]', null),
    (20, 2, 'Lámpara', 'De pie', 2, 9000, 'inmediata', 'activo', '[]', null);
  select setval('productos_id_seq', 20);
  insert into public.producto_media (producto_id, url, orden, es_principal) values (10, 'https://x.supabase.co/storage/v1/object/public/productos/1/a.webp', 0, true);
  insert into public.producto_sellos (producto_id, sello_id) values (10, 1);
`

async function base() {
  const db = new PGlite()
  await db.exec(ESQUEMA)
  await db.exec(leer("007_vendedores_publicacion_automatica.sql"))
  await db.exec(leer("030_pausar_tienda.sql"))
  await db.exec(PRODUCTOS)
  return db
}

async function como(db, rol, sql, uid = null, params = []) {
  try {
    await db.exec(`select set_config('test.uid', '${uid || ""}', false); set role ${rol}`)
    return { filas: (await db.query(sql, params)).rows, error: null }
  } catch (e) {
    return { filas: [], error: e.message, codigo: e.code }
  } finally {
    await db.exec("reset role")
  }
}
const negado = (r) => !!r.error && /permission denied/.test(r.error)

async function permisos(db, tabla, rol) {
  const r = await db.query(`select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), '') as p
    from information_schema.role_table_grants where table_schema = 'public' and table_name = $1 and grantee = $2`, [tabla, rol])
  return r.rows[0].p
}
async function porColumna(db, tabla, rol) {
  return Number((await db.query(`select count(*) as n from pg_attribute
    where attrelid = ('public.' || $1)::regclass and attnum > 0 and not attisdropped
      and attacl::text like '%' || $2 || '=%'`, [tabla, rol])).rows[0].n)
}

const FOTO = (n, tienda = 1) => `https://x.supabase.co/storage/v1/object/public/productos/${tienda}/${n}.webp`
const DATOS = (extra = {}) => ({
  nombre: "Taza nueva", descripcion: "Cerámica esmaltada", marca: null, precio: 1500, precio_anterior: null,
  tiempo_preparacion: "durante_el_dia", categoria_id: 1, subcategoria_id: null, subcategoria_personalizada: null,
  categoria_secundaria_id: null, subcategoria_secundaria_id: null, subcategoria_secundaria_personalizada: null,
  genero: null, tiene_variantes: false, propiedad_1_nombre: null, ...extra,
})
const AVISO = [{ tipo: "contacto_telefono", texto: "2915" }]

// La llamada del servidor (service_role), como la hace guardarProducto.js.
async function guardar(db, { vendedor = 1, producto = null, datos = DATOS(), fotos = [FOTO("f1")], variantes = [], sellos = [], avisos = [], rol = "service_role", uid = null } = {}) {
  const r = await como(db, rol,
    `select public.rpc_guardar_producto($1, $2, $3::jsonb, $4::text[], $5::text[], $6::integer[], $7::jsonb) as r`, uid,
    [vendedor, producto, JSON.stringify(datos), fotos, variantes, sellos, JSON.stringify(avisos)])
  return { ...r, r: r.filas[0]?.r }
}
const producto = async (db, id) => (await db.query(`select * from public.productos where id = $1`, [id])).rows[0]
const hijos = async (db, tabla, id, orden = "1") =>
  (await db.query(`select * from public.${tabla} where producto_id = $1 order by ${orden}`, [id])).rows

// ─────────────────────────────────────────────────────────────────────────
const db = await base()
const vendedorSellosAntes = await permisos(db, "vendedor_sellos", "authenticated")
await db.exec(MIG)
await db.exec(MIG)
console.log("Migración corrida dos veces sin errores.\n")

console.log("1. Revisión posterior y estado por defecto")
let p = await producto(db, 15)
ok(p.revision_posterior_desde !== null && p.estado === "activo", "un producto aprobado que ya tenía avisos queda marcado (y sigue activo)")
ok((await db.query(`select count(*)::int as n from public.productos where revision_posterior_desde is not null`)).rows[0].n === 1,
  "es el único marcado (los que no tienen avisos, o no están aprobados, no)")
await db.exec(`update public.productos set revision_posterior_desde = null where id = 15`)
await db.exec(MIG)
ok((await producto(db, 15)).revision_posterior_desde === null, "si el admin lo desmarca, correr la migración de nuevo no lo vuelve a marcar")
ok((await db.query(`select column_default as d from information_schema.columns where table_name = 'productos' and column_name = 'estado'`)).rows[0].d.includes("en_revision"),
  "estado nace en 'en_revision'")

console.log("\n2. Los permisos")
for (const tabla of TIENDA) {
  const a = await permisos(db, tabla, "anon")
  const u = await permisos(db, tabla, "authenticated")
  ok(a === "SELECT" && u === "SELECT", `${tabla}: anon [${a}] · authenticated [${u}]`)
}
ok(vendedorSellosAntes.includes("UPDATE") && (await permisos(db, "vendedor_sellos", "anon")) === "SELECT"
  && (await permisos(db, "vendedor_sellos", "authenticated")) === "DELETE,INSERT,SELECT", "vendedor_sellos: anon [SELECT] · authenticated [DELETE,INSERT,SELECT] (sin UPDATE)")
let columnas = 0
for (const tabla of [...TIENDA, "vendedor_sellos"]) columnas += (await porColumna(db, tabla, "anon")) + (await porColumna(db, tabla, "authenticated"))
ok(columnas === 0, "ninguna quedó con permisos por columna")
ok((await permisos(db, "productos", "service_role")).includes("UPDATE"), "service_role conserva todo")

console.log("\n3. El vendedor, desde el navegador, ya no escribe un producto")
const sesion = (sql, params) => como(db, "authenticated", sql, U1, params)
let r = await sesion(`insert into public.productos (vendedor_id, nombre, descripcion, categoria_id, precio, tiempo_preparacion, estado) values (1, 'X', 'Y', 1, 10, 'inmediata', 'activo')`)
ok(negado(r), "INSERT con estado = 'activo': rechazado")
r = await sesion(`insert into public.productos (vendedor_id, nombre, descripcion, categoria_id, precio, tiempo_preparacion) values (1, 'X', 'Y', 1, 10, 'inmediata')`)
ok(negado(r), "INSERT sin estado: rechazado (el alta va por el servidor)")
for (const [col, val] of [["estado", "'activo'"], ["destacado", "true"], ["destacado_hasta", "now() + interval '1 year'"],
  ["motivo_rechazo", "null"], ["moderacion_avisos", "'[]'"], ["creado_en", "now() + interval '10 years'"],
  ["revision_posterior_desde", "null"], ["nombre", "'Otro'"]]) {
  r = await sesion(`update public.productos set ${col} = ${val} where id = 11`)
  ok(negado(r), `UPDATE de ${col} en su propio producto: rechazado`)
}
ok((await producto(db, 11)).estado === "en_revision", "el producto en revisión sigue en revisión")
r = await sesion(`delete from public.productos where id = 10`)
ok(negado(r) && !!(await producto(db, 10)), "DELETE de su propio producto: rechazado (va por el servidor)")
for (const [tabla, sql] of [
  ["producto_media", `insert into public.producto_media (producto_id, url) values (10, 'https://otro.sitio/x.jpg')`],
  ["producto_media", `delete from public.producto_media where producto_id = 10`],
  ["producto_variantes", `insert into public.producto_variantes (producto_id, propiedad_1_valor) values (10, 'S')`],
  ["producto_sellos", `insert into public.producto_sellos (producto_id, sello_id) values (10, 2)`],
  ["producto_sellos", `delete from public.producto_sellos where producto_id = 10`],
]) {
  r = await sesion(sql)
  ok(negado(r), `${tabla}: ${sql.split(" ")[0].toUpperCase()} rechazado`)
}
ok((await hijos(db, "producto_media", 10)).length === 1 && (await hijos(db, "producto_sellos", 10)).length === 1, "las fotos y los sellos del producto aprobado siguen intactos")

r = await sesion(`select id, estado from public.productos order by id`)
ok(!r.error && r.filas.filter((f) => f.id < 20).length === 6, "lee todos sus productos, también los que no están publicados (el panel)")
ok(r.filas.some((f) => f.id === 20), "y los publicados de otras tiendas")
r = await sesion(`select * from public.producto_media where producto_id = 10`)
ok(!r.error && r.filas.length === 1, "lee las fotos de sus productos (el editor)")
r = await como(db, "anon", `select id from public.productos order by id`)
ok(!r.error && r.filas.map((f) => f.id).join() === "10,15,20", "quien navega sin sesión ve solo los activos")
r = await como(db, "anon", `insert into public.productos (vendedor_id, nombre, descripcion, categoria_id, precio, tiempo_preparacion) values (1, 'X', 'Y', 1, 10, 'inmediata')`)
ok(negado(r), "anon tampoco escribe")
r = await como(db, "authenticated", `update public.productos set estado = 'activo' where id = 11`, ADMIN)
ok(negado(r), "un admin desde el navegador tampoco (la moderación va por /api/admin/productos/[id]/moderacion)")

r = await sesion(`select public.rpc_guardar_producto(1, null, '{}'::jsonb, '{x}'::text[], '{}'::text[], '{}'::integer[], '[]'::jsonb)`)
ok(negado(r), "authenticated no puede llamar a rpc_guardar_producto")
r = await sesion(`select privado.guardar_producto(1, null, '{}'::jsonb, '{x}'::text[], '{}'::text[], '{}'::integer[], '[]'::jsonb)`)
ok(negado(r), "ni a privado.guardar_producto")
r = await como(db, "anon", `select public.rpc_guardar_producto(1, null, '{}'::jsonb, '{x}'::text[], '{}'::text[], '{}'::integer[], '[]'::jsonb)`)
ok(negado(r), "anon tampoco")

console.log("\n4. Sellos de la tienda (autodeclarados, desde el navegador)")
r = await sesion(`insert into public.vendedor_sellos (vendedor_id, sello_id) values (1, 2) returning sello_id`)
ok(!r.error && r.filas.length === 1, "el vendedor agrega un sello a su tienda")
r = await sesion(`delete from public.vendedor_sellos where vendedor_id = 1 and sello_id = 2 returning sello_id`)
ok(!r.error && r.filas.length === 1, "y lo quita")
r = await sesion(`insert into public.vendedor_sellos (vendedor_id, sello_id) values (2, 2)`)
ok(!!r.error && /row-level security/.test(r.error), "no puede agregarle un sello a otra tienda (RLS)")
r = await sesion(`update public.vendedor_sellos set sello_id = 3 where vendedor_id = 1`)
ok(negado(r), "UPDATE: rechazado (nadie lo usa)")
r = await como(db, "anon", `insert into public.vendedor_sellos (vendedor_id, sello_id) values (1, 3)`)
ok(negado(r), "anon no escribe")
r = await como(db, "anon", `select * from public.vendedor_sellos`)
ok(!r.error, "anon lee (son públicos)")

console.log("\n5. Alta por el servidor")
r = await guardar(db, {
  datos: DATOS({ tiene_variantes: true, propiedad_1_nombre: "Talle", genero: ["mujer", "ninos"], marca: "Ludo", precio_anterior: 2000 }),
  fotos: [FOTO("a"), FOTO("b"), FOTO("c")], variantes: ["S", "M", " M ", ""], sellos: [1, 3, 99], avisos: AVISO,
})
ok(!r.error && r.r?.estado === "en_revision" && r.r?.revision_posterior === false, "nace en 'en_revision', sin marca de revisión posterior")
const nuevo = r.r.id
p = await producto(db, nuevo)
ok(p.vendedor_id === 1 && p.nombre === "Taza nueva" && p.marca === "Ludo" && Number(p.precio_anterior) === 2000, "con los datos del formulario y la tienda de la sesión")
ok(p.destacado === false && p.destacado_hasta === null && p.motivo_rechazo === null, "sin destacar y sin motivo de rechazo")
ok(Math.abs(new Date(p.creado_en) - Date.now()) < 60000, "creado_en: ahora")
ok(JSON.stringify(p.moderacion_avisos) === JSON.stringify(AVISO), "los avisos que encontró el servidor quedan guardados")
ok(JSON.stringify(p.genero) === JSON.stringify(["mujer", "ninos"]) && p.tiene_variantes && p.propiedad_1_nombre === "Talle", "género y variantes")
let media = await hijos(db, "producto_media", nuevo, "orden")
ok(media.map((m) => m.url).join() === [FOTO("a"), FOTO("b"), FOTO("c")].join() && media.map((m) => m.orden).join() === "0,1,2", "las tres fotos, en orden")
ok(media[0].es_principal && !media[1].es_principal && media.every((m) => m.tipo === "foto"), "la primera es la principal")
ok((await hijos(db, "producto_variantes", nuevo, "propiedad_1_valor")).map((v) => v.propiedad_1_valor).join() === "M,S", "variantes sin repetidas ni vacías")
ok((await hijos(db, "producto_sellos", nuevo, "sello_id")).map((s) => s.sello_id).join() === "1,3", "sellos: los que existen (el 99 se ignora)")
r = await guardar(db, { datos: DATOS({ genero: [] }) })
ok(!r.error && (await producto(db, r.r.id)).genero === null, "género vacío: null (como antes)")

const contar = async () => (await db.query(`select (select count(*) from public.productos) + (select count(*) from public.producto_media) as n`)).rows[0].n
let antes = await contar()
r = await guardar(db, { datos: DATOS({ precio: 0 }) })
ok(r.codigo === "23514" && (await contar()) === antes, "un precio inválido: error, y no queda nada a medias")
r = await guardar(db, { datos: DATOS({ categoria_id: 999 }) })
ok(r.codigo === "23503" && (await contar()) === antes, "una categoría que no existe: error, y no queda nada a medias")
r = await guardar(db, { fotos: [] })
ok(!!r.error && (await contar()) === antes, "sin fotos: error")

console.log("\n6. Edición por el servidor: qué vuelve a revisión")
r = await guardar(db, { producto: 11, datos: DATOS({ nombre: "Plato hondo" }) })
ok(r.r?.estado === "en_revision" && (await producto(db, 11)).nombre === "Plato hondo", "en_revision -> sigue en_revision")
r = await guardar(db, { producto: 12, datos: DATOS({ nombre: "Jarra corregida" }) })
p = await producto(db, 12)
ok(r.r?.estado === "en_revision" && p.estado === "en_revision", "rechazado -> vuelve a en_revision (otra vuelta de moderación)")
ok(p.motivo_rechazo === "Fotos borrosas", "el motivo del rechazo anterior no se borra")

r = await guardar(db, { producto: 10, datos: DATOS({ nombre: "Taza grande" }), fotos: [FOTO("z"), FOTO("a")], sellos: [2] })
p = await producto(db, 10)
ok(r.r?.estado === "activo" && p.estado === "activo" && p.revision_posterior_desde === null, "activo y limpio -> sigue activo, sin marca")
ok(p.nombre === "Taza grande" && Math.abs(new Date(p.actualizado_en) - Date.now()) < 60000, "guarda el cambio y actualizado_en")
media = await hijos(db, "producto_media", 10, "orden")
ok(media.map((m) => m.url).join() === [FOTO("z"), FOTO("a")].join() && media[0].es_principal, "las fotos se reemplazan (la nueva primera es la principal)")
ok((await hijos(db, "producto_sellos", 10)).map((s) => s.sello_id).join() === "2", "los sellos se reemplazan")

r = await guardar(db, { producto: 10, datos: DATOS({ descripcion: "Llamame al 2915" }), avisos: AVISO })
p = await producto(db, 10)
ok(r.r?.estado === "activo" && r.r?.revision_posterior === true && p.estado === "activo", "activo con avisos -> sigue activo (no se despublica)")
ok(p.revision_posterior_desde !== null && JSON.stringify(p.moderacion_avisos) === JSON.stringify(AVISO), "y queda marcado para revisión posterior, con sus avisos")
const marca = p.revision_posterior_desde
await new Promise((res) => setTimeout(res, 20))
await guardar(db, { producto: 10, avisos: AVISO })
ok(String((await producto(db, 10)).revision_posterior_desde) === String(marca), "otra edición con avisos: la marca conserva desde cuándo espera")
await guardar(db, { producto: 10 })
p = await producto(db, 10)
ok(p.revision_posterior_desde === null && JSON.stringify(p.moderacion_avisos) === "[]", "una edición limpia la desmarca")

r = await guardar(db, { producto: 13, avisos: AVISO })
ok(r.r?.estado === "pausado" && (await producto(db, 13)).revision_posterior_desde !== null, "pausado con avisos -> sigue pausado, marcado")
r = await guardar(db, { producto: 14 })
ok(r.r?.estado === "agotado", "agotado limpio -> sigue agotado")

r = await guardar(db, { producto: 10, datos: DATOS({ tiene_variantes: true, propiedad_1_nombre: "Color" }), variantes: ["Rojo"] })
ok((await hijos(db, "producto_variantes", 10)).length === 1, "agrega variantes")
r = await guardar(db, { producto: 10, datos: DATOS({ tiene_variantes: false, propiedad_1_nombre: "Color" }), variantes: ["Rojo"] })
p = await producto(db, 10)
ok(!p.tiene_variantes && p.propiedad_1_nombre === null && (await hijos(db, "producto_variantes", 10)).length === 0, "y las saca")

r = await guardar(db, { producto: 20 })
ok(r.codigo === "P0002" && (await producto(db, 20)).nombre === "Lámpara", "un producto de otra tienda: P0002, y no se toca")
r = await guardar(db, { producto: 9999 })
ok(r.codigo === "P0002", "uno que no existe: P0002")
const mediaAntes = JSON.stringify(await hijos(db, "producto_media", 10))
r = await guardar(db, { producto: 10, datos: DATOS({ nombre: "No se guarda", categoria_id: 999 }), fotos: [FOTO("q")] })
ok(!!r.error && (await producto(db, 10)).nombre !== "No se guarda" && JSON.stringify(await hijos(db, "producto_media", 10)) === mediaAntes,
  "una edición que falla no deja nada a medias (ni el texto ni las fotos)")

console.log("\n7. Pausar, reactivar y borrar (lo que hacen las rutas, con service_role)")
const transicion = (id, a, desde) => como(db, "service_role",
  `update public.productos set estado = $2 where id = $1 and vendedor_id = 1 and estado = any($3::text[]) returning estado`, null, [id, a, desde])
ok((await transicion(10, "pausado", ["activo"])).filas[0]?.estado === "pausado", "activo -> pausado")
ok((await transicion(10, "activo", ["pausado", "agotado"])).filas[0]?.estado === "activo", "pausado -> activo")
ok((await transicion(14, "activo", ["pausado", "agotado"])).filas[0]?.estado === "activo", "agotado -> activo")
ok((await transicion(11, "activo", ["pausado", "agotado"])).filas.length === 0 && (await producto(db, 11)).estado === "en_revision", "en_revision -> activo: no cambia nada")
ok((await transicion(20, "pausado", ["activo"])).filas.length === 0, "un producto de otra tienda: no cambia nada")
await db.exec(`insert into public.favoritos (usuario_id, producto_id) values ('${U2}', ${nuevo});
  insert into public.coleccion_productos (coleccion_id, producto_id) values (1, ${nuevo});
  insert into public.tesoros (producto_id) values (${nuevo})`)
r = await como(db, "service_role", `delete from public.productos where id = $1 and vendedor_id = 1 returning id`, null, [nuevo])
ok(!r.error && r.filas.length === 1, "borrar un producto propio")
const restos = (await db.query(`select (select count(*) from public.producto_media where producto_id = $1) + (select count(*) from public.producto_variantes where producto_id = $1)
  + (select count(*) from public.producto_sellos where producto_id = $1) + (select count(*) from public.favoritos where producto_id = $1)
  + (select count(*) from public.coleccion_productos where producto_id = $1) + (select count(*) from public.tesoros where producto_id = $1) as n`, [nuevo])).rows[0].n
ok(Number(restos) === 0, "y en cascada sus fotos, variantes, sellos, favoritos, colecciones y tesoros")
await db.exec(`insert into public.pedidos (id, comprador_id, vendedor_id, estado) values (1, '${U2}', 1, 'despachado');
  insert into public.pedido_items (pedido_id, producto_id) values (1, 13)`)
r = await como(db, "service_role", `delete from public.productos where id = 13`)
ok(r.codigo === "23503" && !!(await producto(db, 13)), "un producto con pedidos no se borra (23503: la ruta muestra el cartel de pausarlo)")

console.log("\n8. La verificación corre")
const v = JSON.parse((await db.query(MIG.slice(MIG.indexOf("select jsonb_pretty"), MIG.indexOf("as verificacion;") + "as verificacion;".length))).rows[0].verificacion)
ok(v.columna_revision_posterior && v.estado_por_defecto.includes("en_revision"), "columna y default")
ok(TIENDA.every((t) => v.permisos[t].anon === "select" && v.permisos[t].authenticated === "select"), "permisos de las cuatro tablas: select")
ok(v.permisos.vendedor_sellos.anon === "select" && v.permisos.vendedor_sellos.authenticated === "select, delete, insert", "vendedor_sellos")
ok(!v.rpc_guardar_producto.anon && !v.rpc_guardar_producto.authenticated && v.rpc_guardar_producto.service_role, "rpc_guardar_producto solo para service_role")

console.log("\n9. Borrar la tienda y la cuenta siguen andando (base de probar-031 + 033)")
{
  const { db: t, q } = await baseDeTiendas()
  await t.exec(`alter table public.productos add column moderacion_avisos jsonb default '[]', add column actualizado_en timestamptz default now(),
    add column destacado boolean default false;
    create table public.sellos (id serial primary key)`)
  await t.exec(MIG)
  ok((await permisos(t, "productos", "authenticated")) === "SELECT", "la 033 corrió sobre la base de las tiendas")
  let s = 0
  const uid = () => `00000000-0000-0000-0000-${String(++s).padStart(12, "0")}`
  async function cuenta() {
    const id = uid()
    await t.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@mail.com`])
    await t.query(`insert into public.usuarios (id, email, nombre, apellido) values ($1, $2, 'Ana', 'Pérez')`, [id, `${id}@mail.com`])
    return id
  }
  async function tienda(usuario) {
    const id = (await q(`insert into public.vendedores (usuario_id, nombre_negocio, slug) values ($1, $2, $2) returning id`, [usuario, `t-${s}`]))[0].id
    await t.query(`update public.vendedores set pausada_en = now() where id = $1`, [id])
    return id
  }
  const prod = async (v) => (await q(`insert into public.productos (vendedor_id, nombre) values ($1, 'Taza') returning id`, [v]))[0].id

  const sola = await cuenta()
  const ts = await tienda(sola)
  const p1 = await prod(ts)
  let rr = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [sola]))[0].r
  ok(rr.ok && rr.tienda?.accion === "borrada", "cuenta con tienda pausada sin pedidos: se elimina, y la tienda se borra")
  ok((await q(`select count(*)::int as n from public.productos where id = $1`, [p1]))[0].n === 0, "con sus productos")

  const conVentas = await cuenta()
  const tv = await tienda(conVentas)
  const vendido = await prod(tv)
  const sinVender = await prod(tv)
  const comprador = await cuenta()
  await t.query(`update public.vendedores set pausada_en = null where id = $1`, [tv])
  const ped = (await q(`insert into public.pedidos (comprador_id, vendedor_id, estado) values ($1, $2, 'despachado') returning id`, [comprador, tv]))[0].id
  await t.query(`insert into public.pedido_items (pedido_id, producto_id, nombre) values ($1, $2, 'Taza')`, [ped, vendido])
  await t.query(`update public.vendedores set pausada_en = now() where id = $1`, [tv])
  rr = (await q(`select public.rpc_cerrar_cuenta($1) as r`, [conVentas]))[0].r
  ok(rr.ok && rr.tienda?.accion === "cerrada", "cuenta con tienda pausada y ventas terminadas: se elimina, y la tienda se cierra")
  const quedan = (await q(`select id from public.productos where vendedor_id = $1 order by id`, [tv])).map((x) => x.id)
  ok(quedan.join() === String(vendido) && !quedan.includes(sinVender), "queda solo el producto vendido")

  const prueba = await cuenta()
  const tp = await tienda(prueba)
  await prod(tp)
  rr = await como(t, "service_role", `select public.rpc_borrar_tienda_de_prueba($1) as r`, null, [tp])
  ok(!rr.error && (await q(`select count(*)::int as n from public.vendedores where id = $1`, [tp]))[0].n === 0, "borrar una tienda de prueba (admin, service_role)")
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
