// Prueba de las migraciones 019 y 020 contra una base local (PGlite: Postgres
// real en WebAssembly, sin instalar nada) y de la lista de métodos de entrega
// (src/lib/metodosEntrega.js) con el cálculo del envío (precioPedido.js). No
// toca Supabase ni ninguna base real.
//
//   npm run probar:019-020
//
// PGlite no trae PostGIS. Las funciones ST_* que usan las funciones de
// barrios se imitan acá: un "polígono" es su centro (lat, lng). Alcanza para
// ver que la 019 las crea igual y que la 020 borra calcular_zona_envio; la
// zona del envío ya no la calcula la base, y su regla (línea recta × 1,3) se
// prueba en JS, en la sección 4.
//
// metodos_entrega_default se prueba con los dos tipos posibles (text[] y
// jsonb): no se pudo confirmar cuál tiene producción y la 020 maneja los dos.
// Lo que NO prueba: RLS ni PostgREST.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { register } from "node:module"

// Node no conoce el alias '@/' de jsconfig.json: se resuelve a src/.
const raiz = new URL("../", import.meta.url)
register("data:text/javascript," + encodeURIComponent(`
const src = ${JSON.stringify(new URL("src/", raiz).href)}
export function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith('@/')) {
    const ruta = src + especificador.slice(2)
    return siguiente(/\\.[a-z]+$/.test(ruta) ? ruta : ruta + '.js', contexto)
  }
  return siguiente(especificador, contexto)
}
`))

const L = await import("../src/lib/metodosEntrega.js")
const { calcularEnvio, calcularPedido } = await import("../src/lib/precioPedido.js")

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
const M019 = leer("019_envio_zona.sql")
const M020 = leer("020_metodos_entrega.sql")
const M006 = leer("006_vendedores_vuelta_a_revision.sql")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const q = async (db, sql, p) => (await db.query(sql, p)).rows

async function como(db, rol, sql) {
  try {
    await db.exec(`set role ${rol}`)
    await db.query(sql)
    return null
  } catch (e) {
    return e.message
  } finally {
    await db.exec("reset role")
  }
}

// Las cuatro tiendas reales (valores de producción del 3/10/2026), más casos
// de borde: nombres viejos, repetidos, desconocidos, null y una tienda con
// cambios pedidos (la 020 no la tiene que reabrir).
const TIENDAS = [
  [1, ["retiro", "coordinar"], "aprobado"],
  [2, ["correo", "flash_pedidos", "envio_propio"], "aprobado"],
  [3, ["retiro", "envio_propio"], "aprobado"],
  [4, ["coordinar"], "aprobado"],
  [5, ["acordar", "cadeteria", "retiro", "retiro", "xyz"], "aprobado"],
  [6, null, "aprobado"],
  [7, ["flash_pedidos", "retiro"], "necesita_cambios"],
  [8, ["retiro", "envio_tienda", "correo", "coordinar"], "aprobado"],
]
const ESPERADO = {
  1: ["retiro", "coordinar"],
  2: ["correo", "envio_tienda"],
  3: ["retiro", "envio_tienda"],
  4: ["coordinar"],
  5: ["coordinar", "envio_tienda", "retiro"],
  6: [],
  7: ["envio_tienda", "retiro"],
  8: ["retiro", "envio_tienda", "correo", "coordinar"],
}

async function baseNueva(tipoMetodos) {
  const db = new PGlite()
  const literal = (arr) => arr === null ? "null"
    : tipoMetodos === "jsonb" ? `'${JSON.stringify(arr)}'::jsonb`
    : `array[${arr.map((m) => `'${m}'`).join(",")}]::text[]`
  await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;

  -- PostGIS de mentira: un polígono es su centro.
  create type public.geometry as (lat double precision, lng double precision);
  create type public.geography as (lat double precision, lng double precision);
  create function public.a_geography(g public.geometry) returns public.geography
    language sql immutable as $$ select row(g.lat, g.lng)::public.geography $$;
  create cast (public.geometry as public.geography) with function public.a_geography(public.geometry);
  create function public.ST_Centroid(g public.geometry) returns public.geometry
    language sql immutable as $$ select g $$;
  create function public.ST_Distance(a public.geography, b public.geography) returns double precision
    language sql immutable as $$
      select 2 * 6371000 * asin(sqrt(
        power(sin(radians(b.lat - a.lat) / 2), 2) +
        cos(radians(a.lat)) * cos(radians(b.lat)) * power(sin(radians(b.lng - a.lng) / 2), 2)))
    $$;
  create function public.ST_MakePoint(x double precision, y double precision) returns public.geometry
    language sql immutable as $$ select row(y, x)::public.geometry $$;
  create function public.ST_SetSRID(g public.geometry, srid integer) returns public.geometry
    language sql immutable as $$ select g $$;
  create function public.ST_Contains(a public.geometry, b public.geometry) returns boolean
    language sql immutable as $$ select abs(a.lat - b.lat) < 0.005 and abs(a.lng - b.lng) < 0.005 $$;
  create function public.ST_Area(g public.geometry) returns double precision
    language sql immutable as $$ select 1::double precision $$;
  create function public.ST_AsGeoJSON(g public.geometry) returns text
    language sql immutable as $$ select '{}'::text $$;

  create table public.localidades (id serial primary key, nombre text);
  insert into public.localidades (nombre) values ('Bahía Blanca');
  create table public.barrios (id serial primary key, nombre text, localidad_id int, es_oficial boolean default true, poligono public.geometry);
  -- Centro, y otros a ~2 km, ~5 km y ~10 km al norte; uno sin polígono.
  insert into public.barrios (id, nombre, localidad_id, poligono) values
    (1, 'Centro', 1, row(-38.7183, -62.2663)),
    (2, 'A dos km', 1, row(-38.7003, -62.2663)),
    (3, 'A cinco km', 1, row(-38.6733, -62.2663)),
    (4, 'A diez km', 1, row(-38.6283, -62.2663)),
    (5, 'Sin polígono', 1, null);

  create table public.vendedores (
    id serial primary key, nombre_negocio text,
    estado_validacion text default 'aprobado',
    metodos_entrega_default ${tipoMetodos},
    costos_envio_zona jsonb
  );
  insert into public.vendedores (id, nombre_negocio, metodos_entrega_default, estado_validacion, costos_envio_zona) values
    ${TIENDAS.map(([id, m, e]) => `(${id}, 'Tienda ${id}', ${literal(m)}, '${e}', ${id === 6 ? "null" : "'{}'::jsonb"})`).join(",\n    ")};

  select setval('public.vendedores_id_seq', 100);

  create table public.pedidos (id bigserial primary key, vendedor_id bigint, metodo_envio text, costo_envio numeric default 0);
  insert into public.pedidos (vendedor_id, metodo_envio) select 1, 'retiro' from generate_series(1, 16);
  insert into public.pedidos (vendedor_id, metodo_envio) values (1, 'acordar'), (1, 'cadeteria');

  -- La función de producción, como estaba (con RETURN 4), y sus permisos.
  create function public.calcular_zona_envio(barrio_vendedor_id integer, barrio_comprador_id integer)
  returns integer language plpgsql as $$
  DECLARE distancia_metros FLOAT;
  BEGIN
    IF barrio_vendedor_id = barrio_comprador_id THEN RETURN 1; END IF;
    SELECT ST_Distance(ST_Centroid(a.poligono)::geography, ST_Centroid(b.poligono)::geography)
      INTO distancia_metros FROM barrios a, barrios b
     WHERE a.id = barrio_vendedor_id AND b.id = barrio_comprador_id;
    IF distancia_metros IS NULL THEN RETURN 4; END IF;
    IF distancia_metros < 3000 THEN RETURN 2; ELSIF distancia_metros < 7000 THEN RETURN 3; ELSE RETURN 4; END IF;
  END; $$;
  -- Las de barrios, como están en producción (la 019 las pasa al repo igual).
  create function public.barrio_en_punto(lat double precision, lng double precision)
  returns table(id integer, nombre text) language sql stable as $$
    select b.id, b.nombre from public.barrios b
    where b.poligono is not null and ST_Contains(b.poligono, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
    order by b.es_oficial asc, ST_Area(b.poligono) asc limit 1; $$;
  create function public.barrios_con_poligono()
  returns table(id integer, nombre text, es_oficial boolean, localidad_id integer, geojson json) language sql stable as $$
    select b.id, b.nombre, b.es_oficial, b.localidad_id, ST_AsGeoJSON(b.poligono)::json
    from public.barrios b where b.poligono is not null; $$;
  revoke all on function public.calcular_zona_envio(integer, integer) from public;
  grant execute on function public.calcular_zona_envio(integer, integer) to anon, authenticated, service_role;
  `)
  await db.exec(M006)
  return db
}

// El borrador anterior de la 019, tal como se corrió en producción el
// 3/10/2026 (la parte de la tabla y la de calcular_zona_envio).
const BORRADOR_019 = `
begin;
alter table public.pedidos add column if not exists zona_envio smallint;
alter table public.pedidos drop constraint if exists pedidos_zona_envio_valida;
alter table public.pedidos add constraint pedidos_zona_envio_valida check (zona_envio between 1 and 4);
create table if not exists public.envio_zona_fallas (
  id bigint generated always as identity primary key,
  creado_en timestamptz not null default now(),
  vendedor_id bigint,
  direccion_id bigint,
  barrio_vendedor_id integer,
  barrio_comprador_id integer,
  origen text not null
);
alter table public.envio_zona_fallas drop constraint if exists envio_zona_fallas_origen;
alter table public.envio_zona_fallas add constraint envio_zona_fallas_origen check (origen in ('cotizar', 'crear'));
alter table public.envio_zona_fallas enable row level security;
revoke all on public.envio_zona_fallas from public, anon, authenticated;
grant select, insert on public.envio_zona_fallas to service_role;
create or replace function public.calcular_zona_envio(barrio_vendedor_id integer, barrio_comprador_id integer)
returns integer language plpgsql as $$
DECLARE distancia_metros FLOAT;
BEGIN
  IF barrio_vendedor_id IS NULL OR barrio_comprador_id IS NULL THEN RETURN NULL; END IF;
  IF barrio_vendedor_id = barrio_comprador_id THEN RETURN 1; END IF;
  SELECT ST_Distance(ST_Centroid(a.poligono)::geography, ST_Centroid(b.poligono)::geography)
    INTO distancia_metros FROM barrios a, barrios b
   WHERE a.id = barrio_vendedor_id AND b.id = barrio_comprador_id;
  IF distancia_metros IS NULL THEN RETURN NULL; END IF;
  IF distancia_metros < 3000 THEN RETURN 2; ELSIF distancia_metros < 7000 THEN RETURN 3; ELSE RETURN 4; END IF;
END; $$;
commit;
`

// Todo lo que define a envio_zona_fallas y a pedidos.zona_envio: columnas
// (en orden, con tipo, default, nulos e identidad), restricciones, RLS,
// permisos e índices.
async function fotoFallas(db) {
  return JSON.stringify((await q(db, `select json_build_object(
    'columnas', (select json_agg(json_build_object('n', a.attname, 't', format_type(a.atttypid, a.atttypmod),
                   'nulo', not a.attnotnull, 'id', a.attidentity, 'def', pg_get_expr(d.adbin, d.adrelid)) order by a.attnum)
                 from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                 where a.attrelid = 'public.envio_zona_fallas'::regclass and a.attnum > 0 and not a.attisdropped),
    'constraints', (select json_agg(json_build_object('n', conname, 'd', pg_get_constraintdef(oid)) order by conname)
                 from pg_constraint where conrelid = 'public.envio_zona_fallas'::regclass),
    'rls', (select relrowsecurity from pg_class where oid = 'public.envio_zona_fallas'::regclass),
    'acl', (select array_to_string(array(select x::text from unnest(relacl) x order by 1), ',')
                 from pg_class where oid = 'public.envio_zona_fallas'::regclass),
    'indices', (select json_agg(pg_get_indexdef(indexrelid) order by 1) from pg_index where indrelid = 'public.envio_zona_fallas'::regclass),
    'zona_envio', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'pedidos_zona_envio_valida')
  ) as f`))[0].f)
}

const zona = async (db, a, b) => (await q(db, `select public.calcular_zona_envio($1, $2) as z`, [a, b]))[0].z
const hayZonaVieja = async (db) => (await q(db, `select count(*)::int as n from pg_proc where proname = 'calcular_zona_envio'`))[0].n

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n1. 019: funciones de barrios")
{
  const db = await baseNueva("text[]")
  await db.exec(`revoke all on function public.barrios_con_poligono() from public; grant execute on function public.barrios_con_poligono() to anon`)
  await db.exec(M019)
  await db.exec(M019)
  ok(true, "la 019 corre dos veces seguidas")

  ok((await q(db, `select * from public.barrio_en_punto(-38.7183, -62.2663)`))[0]?.id === 1, "barrio_en_punto quedó igual (encuentra Centro)")
  ok((await q(db, `select count(*)::int as n from public.barrios_con_poligono()`))[0].n === 4, "barrios_con_poligono quedó igual (4 con polígono)")
  ok((await q(db, `select has_function_privilege('anon', 'public.barrios_con_poligono()', 'execute') as p`))[0].p,
    "conserva los permisos que tenía")
  ok(await hayZonaVieja(db) === 1 && await zona(db, 1, 5) === 4,
    "calcular_zona_envio sigue como estaba (el código viejo la usa hasta el deploy)")

  console.log("\n1b. 019 sobre el borrador anterior")
  {
    const deCero = await baseNueva("text[]")
    await deCero.exec(M019)
    await deCero.exec(M019)
    const esperado = await fotoFallas(deCero)

    const sobreBorrador = await baseNueva("text[]")
    await sobreBorrador.exec(BORRADOR_019)
    ok((await fotoFallas(sobreBorrador)) !== esperado, "el borrador dejó la tabla distinta (con columnas de barrios)")
    await sobreBorrador.exec(M019)
    await sobreBorrador.exec(M019)
    const obtenido = await fotoFallas(sobreBorrador)
    ok(obtenido === esperado, "corrida dos veces sobre el borrador, envio_zona_fallas queda igual que creada de cero")
    if (obtenido !== esperado) {
      const a = JSON.parse(obtenido), c = JSON.parse(esperado)
      for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(c[k])) console.log(`    difiere: ${k}\n      sobre el borrador: ${JSON.stringify(a[k])}\n      de cero:           ${JSON.stringify(c[k])}`)
    }
    const columnas = (await q(sobreBorrador, `select attname from pg_attribute where attrelid = 'public.envio_zona_fallas'::regclass and attnum > 0 and not attisdropped order by attnum`)).map((r) => r.attname)
    ok(igual(columnas, ["id", "creado_en", "vendedor_id", "direccion_id", "motivo", "origen"]), `columnas: ${columnas.join(", ")}`)
    ok(await como(sobreBorrador, "service_role", `insert into public.envio_zona_fallas (vendedor_id, direccion_id, motivo, origen)
      values (1, 2, 'direccion_sin_punto', 'crear')`) === null, "y el código nuevo puede registrar con motivo")
    await sobreBorrador.exec(M019)
    ok((await q(sobreBorrador, `select count(*)::int as n from public.envio_zona_fallas`))[0].n === 1,
      "una tercera corrida no borra la tabla nueva (ya no tiene columnas de barrios)")
    ok(await zona(sobreBorrador, 1, 5) === null, "calcular_zona_envio queda como la dejó el borrador (la 020 la borra)")

    const conFilas = await baseNueva("text[]")
    await conFilas.exec(BORRADOR_019)
    await conFilas.exec(`insert into public.envio_zona_fallas (vendedor_id, barrio_vendedor_id, origen) values (1, 1, 'cotizar')`)
    const antes = await fotoFallas(conFilas)
    let error = null
    try { await conFilas.exec(M019) } catch (e) { error = e.message; await conFilas.exec("rollback") }
    ok(!!error && /tiene filas del borrador anterior/.test(error), `si la tabla vieja tuviera filas, se frena con un mensaje claro (${error})`)
    ok((await fotoFallas(conFilas)) === antes &&
       (await q(conFilas, `select count(*)::int as n from public.envio_zona_fallas`))[0].n === 1, "y no cambia nada")
  }

  console.log("\n2. 019: pedidos.zona_envio y el registro de fallas")
  ok(await como(db, "postgres", `update public.pedidos set zona_envio = 3 where id = 1`) === null, "zona_envio acepta 1..4")
  ok(await como(db, "postgres", `update public.pedidos set zona_envio = null where id = 1`) === null, "y null")
  ok(!!(await como(db, "postgres", `update public.pedidos set zona_envio = 5 where id = 1`)), "rechaza 5")
  ok(!!(await como(db, "postgres", `update public.pedidos set zona_envio = 0 where id = 1`)), "rechaza 0")

  for (const motivo of ["tienda_sin_punto", "direccion_sin_punto", "sin_ningun_punto"]) {
    ok(await como(db, "service_role", `insert into public.envio_zona_fallas (vendedor_id, direccion_id, motivo, origen)
      values (1, 2, '${motivo}', 'cotizar')`) === null, `service_role registra una falla: ${motivo} (los motivos de zonaEnvio.js)`)
  }
  ok(!!(await como(db, "service_role", `insert into public.envio_zona_fallas (motivo, origen) values ('otro', 'crear')`)), "motivo sólo los tres conocidos")
  ok(!!(await como(db, "service_role", `insert into public.envio_zona_fallas (motivo, origen) values ('tienda_sin_punto', 'otro')`)), "origen sólo 'cotizar' o 'crear'")
  for (const rol of ["anon", "authenticated"]) {
    ok(/permission denied/.test(await como(db, rol, `select * from public.envio_zona_fallas`) || ""), `${rol} no lee las fallas`)
    ok(/permission denied/.test(await como(db, rol, `insert into public.envio_zona_fallas (motivo, origen) values ('tienda_sin_punto', 'crear')`) || ""), `${rol} no escribe fallas`)
  }
  ok((await q(db, `select relrowsecurity from pg_class where oid = 'public.envio_zona_fallas'::regclass`))[0].relrowsecurity, "con RLS")
}

// ═══════════════════════════════════════════════════════════════════════════
for (const tipo of ["text[]", "jsonb"]) {
  console.log(`\n3. 020 con metodos_entrega_default ${tipo}`)
  const db = await baseNueva(tipo)
  await db.exec(M019)
  await db.exec(M020)
  const foto1 = JSON.stringify(await q(db, `select id, to_jsonb(metodos_entrega_default) m, costos_envio_zona c, estado_validacion e from public.vendedores order by id`))
  await db.exec(M020)
  const foto2 = JSON.stringify(await q(db, `select id, to_jsonb(metodos_entrega_default) m, costos_envio_zona c, estado_validacion e from public.vendedores order by id`))
  ok(foto1 === foto2, "corre dos veces y la segunda no cambia nada")

  const filas = await q(db, `select id, to_jsonb(metodos_entrega_default) as m, costos_envio_zona as c, estado_validacion as e from public.vendedores order by id`)
  for (const f of filas) {
    ok(igual(f.m, ESPERADO[f.id]), `tienda ${f.id}: ${JSON.stringify(TIENDAS.find((t) => t[0] === f.id)[1])} → ${JSON.stringify(f.m)}`)
  }
  ok(filas.every((f) => f.c && typeof f.c === "object"), "costos_envio_zona: ninguno null")
  ok(filas.find((f) => f.id === 7).e === "necesita_cambios", "la tienda con cambios pedidos no volvió a revisión")

  // La lista de JS lee igual la tienda antes (nombres viejos) y después.
  for (const [id, viejos] of TIENDAS) {
    ok(igual(L.metodosGuardados(viejos), L.metodosGuardados(filas.find((f) => f.id === id).m)),
      `tienda ${id}: el código lee lo mismo antes y después de la 020`)
  }

  const pedidos = await q(db, `select metodo_envio, count(*)::int n from public.pedidos group by 1 order by 1`)
  ok(igual(pedidos, [{ metodo_envio: "coordinar", n: 1 }, { metodo_envio: "envio_tienda", n: 1 }, { metodo_envio: "retiro", n: 16 }]),
    "pedidos: los 16 retiro intactos; acordar → coordinar, cadeteria → envio_tienda")

  const t = await q(db, `select tgenabled from pg_trigger where tgname = 'trg_vendedores_vuelta_a_revision'`)
  ok(t[0].tgenabled === "O", "el disparador de la 006 quedó prendido")
  await db.exec(`update public.vendedores set nombre_negocio = 'Siete bis' where id = 7`)
  ok((await q(db, `select estado_validacion from public.vendedores where id = 7`))[0].estado_validacion === "pendiente",
    "y sigue funcionando: un cambio de la tienda la devuelve a revisión")

  const set = (valor) => tipo === "jsonb" ? `'${JSON.stringify(valor)}'::jsonb` : `array[${valor.map((m) => `'${m}'`).join(",")}]::text[]`
  const falla = async (sql) => !!(await como(db, "postgres", sql))
  ok(await falla(`update public.vendedores set metodos_entrega_default = ${set(["flash_pedidos"])} where id = 1`), "CHECK: rechaza 'flash_pedidos'")
  ok(await falla(`update public.vendedores set metodos_entrega_default = ${set(["acordar"])} where id = 1`), "CHECK: rechaza 'acordar'")
  ok(await falla(`update public.vendedores set metodos_entrega_default = null where id = 1`), "not null")
  ok(!(await falla(`update public.vendedores set metodos_entrega_default = ${set(L.ORDEN_METODOS)} where id = 1`)),
    "CHECK: acepta los cuatro métodos de la lista de JS (lista y base dicen lo mismo)")
  ok(!(await falla(`update public.vendedores set metodos_entrega_default = ${set([])} where id = 1`)), "acepta vacío")
  if (tipo === "jsonb") ok(await falla(`update public.vendedores set metodos_entrega_default = '"retiro"'::jsonb where id = 1`), "CHECK: rechaza un jsonb que no es lista")
  ok(!!(await como(db, "postgres", `insert into public.vendedores (nombre_negocio) values ('Nueva')`)) === false &&
     igual((await q(db, `select to_jsonb(metodos_entrega_default) m, costos_envio_zona c from public.vendedores where nombre_negocio = 'Nueva'`))[0], { m: [], c: {} }),
    "una tienda nueva nace sin métodos y sin precios (no null)")

  const todasLasZonas = Object.fromEntries([...L.ZONAS_TIENDA, ...L.ZONAS_CORREO].map((z) => [z.clave, 0]))
  ok(!(await falla(`update public.vendedores set costos_envio_zona = '${JSON.stringify(todasLasZonas)}' where id = 1`)),
    "CHECK de precios: acepta todas las zonas de la lista de JS, con $0")
  ok(!(await falla(`update public.vendedores set costos_envio_zona = '{"zona_1": 2500, "correo_4": null}' where id = 1`)), "acepta precios y null")
  ok(await falla(`update public.vendedores set costos_envio_zona = '{"zona_5": 100}' where id = 1`), "rechaza una zona que no existe")
  ok(await falla(`update public.vendedores set costos_envio_zona = '{"zona_1": -1}' where id = 1`), "rechaza un precio negativo")
  ok(await falla(`update public.vendedores set costos_envio_zona = '{"zona_1": "2500"}' where id = 1`), "rechaza un precio como texto")
  ok(await falla(`update public.vendedores set costos_envio_zona = '[]' where id = 1`), "rechaza algo que no es un objeto")

  ok(await falla(`insert into public.pedidos (metodo_envio) values ('acordar')`), "pedidos: rechaza 'acordar'")
  ok(!(await falla(`insert into public.pedidos (metodo_envio) values ${L.ORDEN_METODOS.map((m) => `('${m}')`).join(",")}`)),
    "pedidos: acepta los cuatro métodos de la lista de JS")

  ok(await hayZonaVieja(db) === 0, "borró calcular_zona_envio (la zona ya la calcula el servidor)")
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n4. Distancia y zonas del envío de la tienda")
{
  const CENTRO = { lat: -38.7183, lng: -62.2663 }
  const M_POR_GRADO = (2 * Math.PI * 6371000) / 360
  // Un punto a 'metros' en línea recta al norte del centro.
  const alNorte = (metros) => ({ lat: CENTRO.lat + metros / M_POR_GRADO, lng: CENTRO.lng })

  ok(Math.abs(L.distanciaRectaMetros(CENTRO, alNorte(1000)) - 1000) < 0.5, "haversine: 1 km al norte mide 1 km")
  const esteOeste = L.distanciaRectaMetros(CENTRO, { lat: CENTRO.lat, lng: CENTRO.lng + 0.01 })
  ok(Math.abs(esteOeste - 867) < 3, `haversine: 0,01° de longitud en Bahía Blanca son ~867 m (dio ${Math.round(esteOeste)})`)
  ok(L.distanciaRectaMetros(CENTRO, alNorte(2000)) === L.distanciaRectaMetros(alNorte(2000), CENTRO), "da lo mismo en los dos sentidos")

  ok(L.FACTOR_CALLES === 1.3, "factor de calles: 1,3")
  ok(igual(L.ZONAS_TIENDA.map((z) => z.hastaMetros), [1000, 3000, 7000, null]), "cortes: 1, 3 y 7 km, y más")
  ok(igual(L.ZONAS_TIENDA.map((z) => z.nombre), ["Hasta 10 cuadras", "Hasta 30 cuadras", "Hasta 70 cuadras", "Más de 70 cuadras"]),
    "a la tienda se le muestran en cuadras")

  // Los cortes se aplican después del × 1,3: 1000 m por calles son 769 m rectos.
  const casos = [
    [0, 1, "el mismo punto"], [760, 1, "760 m rectos (988 por calles)"], [780, 2, "780 m rectos (1014 por calles)"],
    [2300, 2, "2300 m rectos (2990 por calles)"], [2320, 3, "2320 m rectos (3016 por calles)"],
    [5380, 3, "5380 m rectos (6994 por calles)"], [5390, 4, "5390 m rectos (7007 por calles)"], [20000, 4, "20 km"],
  ]
  for (const [metros, esperada, texto] of casos) {
    ok(L.zonaEntrePuntos(CENTRO, alNorte(metros)) === esperada, `${texto}: zona ${esperada}`)
  }
  ok(L.zonaPorDistancia(1000) === 1 && L.zonaPorDistancia(3000) === 2 && L.zonaPorDistancia(7000) === 3, "el corte es 'hasta': 1000 m exactos es zona 1")

  ok(L.zonaEntrePuntos(CENTRO, { lat: null, lng: null }) === null, "dirección sin punto: null")
  ok(L.zonaEntrePuntos({ lat: null, lng: -62.2 }, CENTRO) === null, "tienda con medio punto: null")
  ok(L.zonaEntrePuntos(CENTRO, { lat: "", lng: "" }) === null, "vacío no es 0,0")
  ok(L.zonaEntrePuntos(CENTRO, { lat: 0, lng: 0 }) === 4, "0,0 sí es un punto (lejísimos): zona 4")
  ok(L.zonaEntrePuntos({ lat: "-38.7183000", lng: "-62.2663000" }, alNorte(500)) === 1, "acepta los numeric de la base como texto")
  ok(L.zonaEntrePuntos(CENTRO, { lat: 95, lng: 0 }) === null, "una latitud imposible: null")

  // zonaTiendaPara: la misma cuenta, y registra cuando falta un punto.
  const { zonaTiendaPara } = await import("../src/lib/zonaEnvio.js")
  const registro = []
  const admin = { from: (tabla) => ({ insert: async (fila) => { registro.push({ tabla, ...fila }); return { error: null } } }) }
  const avisos = console.warn
  console.warn = () => {}
  const tienda = { id: 7, latitud: CENTRO.lat, longitud: CENTRO.lng }
  const z = await zonaTiendaPara({ admin, vendedor: tienda, direccion: { id: 3, lat: alNorte(2000).lat, lng: CENTRO.lng }, origen: "cotizar" })
  ok(z === 2 && registro.length === 0, "zonaTiendaPara: 2 km rectos (2,6 km por calles) = zona 2, sin registro")
  const z2 = await zonaTiendaPara({ admin, vendedor: tienda, direccion: { id: 3, lat: null, lng: null }, origen: "crear" })
  const z3 = await zonaTiendaPara({ admin, vendedor: { id: 8, latitud: null, longitud: null }, direccion: { id: 4, lat: CENTRO.lat, lng: CENTRO.lng }, origen: "cotizar" })
  const z4 = await zonaTiendaPara({ admin, vendedor: { id: 9, latitud: null, longitud: null }, direccion: { id: 5, lat: null, lng: null }, origen: "crear" })
  console.warn = avisos
  ok(z2 === null && z3 === null && z4 === null, "zonaTiendaPara: sin alguno de los dos puntos, null")
  ok(igual(registro.map((r) => [r.tabla, r.vendedor_id, r.direccion_id, r.motivo, r.origen]), [
    ["envio_zona_fallas", 7, 3, "direccion_sin_punto", "crear"],
    ["envio_zona_fallas", 8, 4, "tienda_sin_punto", "cotizar"],
    ["envio_zona_fallas", 9, 5, "sin_ningun_punto", "crear"],
  ]), "y deja una fila en envio_zona_fallas con el motivo")
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n5. La lista: nombres, dirección y etiquetas")
{
  ok(L.normalizarMetodo("acordar") === "coordinar" && L.normalizarMetodo("cadeteria") === "envio_tienda" &&
     L.normalizarMetodo("envio_propio") === "envio_tienda" && L.normalizarMetodo("flash_pedidos") === "envio_tienda",
    "los nombres viejos se traducen")
  ok(L.normalizarMetodo("xyz") === null && L.normalizarMetodo(null) === null, "lo desconocido es null")
  ok(L.metodoPideDireccion("xyz") === false && L.metodoPideDireccion(undefined) === false, "un valor desconocido NO pide dirección")
  ok(L.metodoPideDireccion("envio_tienda") && L.metodoPideDireccion("correo") && L.metodoPideDireccion("cadeteria"), "envío de la tienda y correo piden dirección")
  ok(!L.metodoPideDireccion("retiro") && !L.metodoPideDireccion("coordinar") && !L.metodoPideDireccion("acordar"), "retiro y coordinar no")
  ok(L.etiquetaMetodo("retiro", "comprador", { direccionVisible: false }) === "Retiro" &&
     L.etiquetaMetodo("retiro", "comprador", { direccionVisible: true }) === "Retiro en el local", "retiro sin dirección visible se llama 'Retiro'")
  ok(L.etiquetaMetodo("flash_pedidos", "admin") === "Envío de la tienda (por zona)", "el admin ve el nombre nuevo de un valor viejo")
  ok(L.etiquetaMetodo("xyz", "vendedor") === "Otro (xyz)", "un valor desconocido se nota")
  ok(L.grupoEntrega("retiro") === "retiro" && L.grupoEntrega("envio_tienda") === "envio" && L.grupoEntrega("correo") === "envio" &&
     L.grupoEntrega("coordinar") === "coordinar" && L.grupoEntrega("xyz") === "coordinar", "grupos de los textos de los pasos")
  ok(L.ORDEN_METODOS.every((id) => ["retiro", "domicilio", "correo", "coordinar"].includes(L.METODOS[id].tipoEntrega)), "cada método tiene tipo de entrega")
  ok(L.textoCostoEnvio("envio_tienda", 0) === "Envío gratis" && L.textoCostoEnvio("coordinar", 0) === "A coordinar", "$0 es 'Envío gratis'")
}

console.log("\n6. Qué ve quien compra")
{
  const tienda = (metodos, costos = {}) => ({ metodos_entrega_default: metodos, costos_envio_zona: costos })
  const envio12 = tienda(["envio_tienda"], { zona_1: 0, zona_2: 2500 })

  let r = L.metodosParaComprador(tienda([]))
  ok(igual(r.disponibles, ["coordinar"]) && r.respaldo, "sin nada configurado: respaldo 'coordinar'")
  r = L.metodosParaComprador(tienda(["flash_pedidos", "envio_propio"]))
  ok(igual(r.disponibles, ["coordinar"]) && r.respaldo, "envío de la tienda sin precios (tiendas viejas): respaldo")
  r = L.metodosParaComprador(tienda(["correo"]))
  ok(igual(r.disponibles, ["coordinar"]) && r.respaldo, "correo sin precios: no se ofrece")
  r = L.metodosParaComprador(envio12)
  ok(igual(r.disponibles, ["envio_tienda"]) && !r.respaldo, "sin dirección todavía: el envío se muestra")
  r = L.metodosParaComprador(envio12, { zonaTienda: 2 })
  ok(igual(r.disponibles, ["envio_tienda"]) && r.noDisponibles.length === 0, "zona con precio: disponible")
  r = L.metodosParaComprador(envio12, { zonaTienda: 3 })
  ok(igual(r.disponibles, ["coordinar"]) && igual(r.noDisponibles, ["envio_tienda"]) && r.respaldo,
    "zona sin precio y nada más: envío deshabilitado + respaldo")
  r = L.metodosParaComprador(envio12, { zonaTienda: null })
  ok(igual(r.disponibles, ["coordinar"]) && igual(r.noDisponibles, ["envio_tienda"]), "zona sin calcular: igual")
  r = L.metodosParaComprador(tienda(["retiro", "envio_tienda"], { zona_1: 1000 }), { zonaTienda: 4 })
  ok(igual(r.disponibles, ["retiro"]) && igual(r.noDisponibles, ["envio_tienda"]) && !r.respaldo,
    "con retiro, la zona sin precio no trae el respaldo")
  r = L.metodosParaComprador(tienda(["coordinar", "retiro", "acordar"]))
  ok(igual(r.disponibles, ["retiro", "coordinar"]) && !r.respaldo, "orden fijo y sin repetidos")
}

console.log("\n7. Lo que cobra el servidor")
{
  const v = { metodos_entrega_default: ["retiro", "envio_tienda", "correo"], costos_envio_zona: { zona_1: 0, zona_2: 2500, correo_1: 4200 } }
  const env = (extra) => calcularEnvio({ vendedor: v, hayDireccion: true, ...extra })

  let r = env({ metodoEnvio: "envio_tienda", zonaTienda: 2 })
  ok(r.costo === 2500 && r.zona === 2 && r.metodo === "envio_tienda", "envío de la tienda zona 2: $2500")
  r = env({ metodoEnvio: "envio_tienda", zonaTienda: 1 })
  ok(r.costo === 0 && r.zona === 1, "zona 1 a $0: envío gratis")
  ok(env({ metodoEnvio: "envio_tienda", zonaTienda: 3 }).codigo === "ZONA_SIN_COSTO", "zona 3 sin precio: rechazo")
  ok(env({ metodoEnvio: "envio_tienda", zonaTienda: null }).codigo === "SIN_ZONA", "zona sin calcular: rechazo (no se cobra la 4)")
  ok(env({ metodoEnvio: "envio_tienda", zonaTienda: undefined }).codigo === "SIN_ZONA", "sin zona calculada: rechazo")
  ok(calcularEnvio({ vendedor: v, metodoEnvio: "envio_tienda", hayDireccion: false, zonaTienda: 2 }).codigo === "FALTA_DIRECCION", "sin dirección: rechazo")
  r = env({ metodoEnvio: "correo", zonaCorreo: "correo_1" })
  ok(r.costo === 4200 && r.zona === 1, "correo zona 1: $4200")
  ok(env({ metodoEnvio: "correo", zonaCorreo: "correo_2" }).codigo === "ZONA_SIN_COSTO", "correo zona sin precio: rechazo")
  ok(env({ metodoEnvio: "correo", zonaCorreo: "zona_1" }).codigo === "ZONA_CORREO_INVALIDA", "correo con una zona que no es de correo: rechazo")
  ok(env({ metodoEnvio: "retiro" }).costo === 0, "retiro: $0")
  ok(env({ metodoEnvio: "coordinar" }).codigo === "METODO_INVALIDO", "coordinar no elegido y con otras opciones: rechazo")
  ok(env({ metodoEnvio: "xyz" }).codigo === "METODO_INVALIDO", "un método desconocido: rechazo")

  const soloEnvio = { metodos_entrega_default: ["envio_tienda"], costos_envio_zona: { zona_1: 500 } }
  ok(calcularEnvio({ vendedor: soloEnvio, metodoEnvio: "coordinar", zonaTienda: undefined }).codigo === "METODO_INVALIDO",
    "respaldo por dirección sin dirección comprobada: rechazo")
  r = calcularEnvio({ vendedor: soloEnvio, metodoEnvio: "coordinar", zonaTienda: 3 })
  ok(r.metodo === "coordinar" && r.costo === 0, "respaldo por dirección comprobada (zona 3 sin precio): vale")
  r = calcularEnvio({ vendedor: { metodos_entrega_default: ["envio_propio"], costos_envio_zona: {} }, metodoEnvio: "acordar" })
  ok(r.metodo === "coordinar" && r.costo === 0, "pestaña vieja que manda 'acordar': se guarda 'coordinar'")
  r = calcularEnvio({ vendedor: soloEnvio, metodoEnvio: "cadeteria", hayDireccion: true, zonaTienda: 1 })
  ok(r.metodo === "envio_tienda" && r.costo === 500, "pestaña vieja que manda 'cadeteria': se cobra y guarda como envío de la tienda")

  const pedido = calcularPedido({
    items: [{ productoId: 1, cantidad: 2, precio: 1000 }],
    productos: [{ id: 1, nombre: "Taza", precio: 1000, tiene_variantes: false }],
    variantes: [], medias: [], vendedor: v,
    metodoEnvio: "envio_tienda", hayDireccion: true, zonaTienda: 2, costoEnvioVisto: 2500,
  })
  ok(pedido.ok && pedido.total === 4500 && pedido.metodo === "envio_tienda" && pedido.zonaEnvio === 2 && pedido.comision === 100,
    "pedido completo: total, método y zona para guardar; la comisión no incluye el envío")
  const cambio = calcularPedido({
    items: [{ productoId: 1, cantidad: 1, precio: 1000 }],
    productos: [{ id: 1, nombre: "Taza", precio: 1000, tiene_variantes: false }],
    variantes: [], medias: [], vendedor: v,
    metodoEnvio: "envio_tienda", hayDireccion: true, zonaTienda: 2, costoEnvioVisto: 2000,
  })
  ok(cambio.codigo === "PRECIO_CAMBIO" && cambio.envio?.nuevo === 2500, "si el envío cambió desde que lo vio: aviso, no cobro")
}

console.log("\n8. Lo que guarda el vendedor")
{
  const val = (metodos, costos = {}, tienePunto = true) => L.validarEntrega({ metodos, costos, tienePunto })
  ok(val([]).ok === false, "sin ningún método: no")
  ok(val(["coordinar"]).ok === true, "sólo coordinar, tildado a propósito: sí")
  ok(val(["envio_propio"]).ok === false, "un nombre viejo no se acepta al guardar")
  ok(val(["envio_tienda"], { zona_1: 100 }, false).ok === false, "envío de la tienda sin ubicación: no")
  ok(val(["envio_tienda"], {}).ok === false, "envío de la tienda sin precios: no")
  ok(val(["correo"], { correo_1: "" }).ok === false, "correo sin precios: no")
  ok(val(["envio_tienda"], { zona_1: 1.5 }).ok === false, "precio con decimales: no")
  ok(val(["envio_tienda"], { zona_1: -5 }).ok === false, "precio negativo: no")
  ok(val(["envio_tienda"], { zona_1: L.PRECIO_MAXIMO + 1 }).ok === false, "precio absurdo: no")
  let r = val(["coordinar", "envio_tienda", "retiro"], { zona_1: 0, zona_2: "", zona_3: 3000, correo_2: 900, xyz: 4 })
  ok(r.ok && igual(r.metodos, ["retiro", "envio_tienda", "coordinar"]), "ordena los métodos")
  ok(igual(r.costos, { zona_1: 0, zona_3: 3000, correo_2: 900 }),
    "guarda $0, omite las zonas vacías, conserva los precios del correo destildado y descarta claves desconocidas")
  ok(L.entregaConfigurada({ metodos_entrega_default: r.metodos, costos_envio_zona: r.costos }), "con eso, la tienda ya no ve el aviso")
  ok(!L.entregaConfigurada({ metodos_entrega_default: ["flash_pedidos"], costos_envio_zona: {} }), "una tienda vieja con flash y sin precios sí lo ve")
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
// exitCode y no exit(): con el cargador del alias registrado, exit() corta un hilo
// a mitad de cerrarse y Node avisa con un "Assertion failed" en Windows.
process.exitCode = fallas ? 1 : 0
