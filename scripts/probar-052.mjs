// Prueba de la migración 052 (los pausados por el plan vuelven cuando sube el
// tope) contra una base local (PGlite: Postgres real en WebAssembly). No toca
// Supabase ni Mercado Pago.
//
//   npm run probar:052
//
// La base es la de probar-050 (con la 033, la 042 y de la 046 a la 050).
// Corre la 052 DOS veces y prueba, como service_role:
//   · el tope de los que ya estaban pausados por el plan (de la 050);
//   · 50 → Gratis → Básico → 50: vuelven los que entran, los demás quedan con
//     el tope de hoy; eliminar productos no devuelve ninguno; cargar
//     condiciones con más lugar los devuelve en el momento;
//   · una caída sobre otra: cada uno vuelve solo si el tope supera el suyo;
//   · reactivar a mano borra la marca y el tope;
//   · el disparador: un pausado por el plan que se rechaza (denuncia o
//     moderación) o se publica pierde la marca; uno que se edita y sigue
//     pausado, no.

import { readFileSync } from "node:fs"
import { baseDeTiendas } from "./base-tiendas-prueba.mjs"
import { ESTADOS_A_LA_VISTA, sePausarianAlBajar } from "../src/lib/planes.js"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log("  ✗ FALLA:", m) } else console.log("  ✓", m) }

const { db, q } = await baseDeTiendas()
await db.exec(`
  alter table public.productos
    add column descripcion text, add column marca text, add column precio numeric, add column precio_anterior numeric,
    add column tiempo_preparacion text, add column categoria_id integer, add column subcategoria_id integer,
    add column subcategoria_personalizada text, add column categoria_secundaria_id integer,
    add column subcategoria_secundaria_id integer, add column subcategoria_secundaria_personalizada text,
    add column genero text[], add column tiene_variantes boolean not null default false, add column propiedad_1_nombre text,
    add column moderacion_avisos jsonb default '[]', add column actualizado_en timestamptz default now(),
    add column creado_en timestamptz default now(), add column destacado boolean default false;
  alter table public.producto_media
    add column tipo text not null default 'foto', add column orden integer not null default 0, add column es_principal boolean not null default false;
  alter table public.producto_variantes add column propiedad_1_valor text;
  alter table public.producto_sellos add column sello_id integer;
  create table public.sellos (id serial primary key);
  alter table public.pedido_items
    alter column producto_id type bigint, alter column producto_id set not null,
    add column variante text, add column precio numeric, add column cantidad integer, add column foto_url text;
  create table public.denuncias_productos (id serial primary key,
    producto_id integer not null references public.productos on delete cascade, motivo text);
`)
for (const f of ["033_productos_por_el_servidor.sql", "042_comisiones_especiales.sql", "046_planes.sql", "047_tope_guardados.sql",
  "048_suscripciones.sql", "049_error_suscripcion.sql", "050_cuando_deja_de_pagar.sql"]) await db.exec(leer(f))

let s = 0
const uid = () => `00000000-0000-0000-0000-${String(++s).padStart(12, "0")}`
async function tienda() {
  const id = uid()
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@mail.com`])
  await db.query(`insert into public.usuarios (id, email, nombre, apellido) values ($1, $2, 'A', 'B')`, [id, `${id}@mail.com`])
  return (await q(`insert into public.vendedores (usuario_id, nombre_negocio, slug) values ($1, $2, $2) returning id`, [id, `t-${++s}`]))[0].id
}
async function servicio(sql, p) { await db.exec("set role service_role"); try { return (await db.query(sql, p)).rows } finally { await db.exec("reset role") } }
const DIA = 864e5
const hace = (d) => new Date(Date.now() - d * DIA).toISOString()
async function productos(v, n) { for (let i = 0; i < n; i++) await q(`insert into public.productos (vendedor_id, nombre, estado, creado_en) values ($1, $2, 'activo', $3)`, [v, `p${i}`, hace(200 - i)]) }
const cuenta = async (v) => Object.fromEntries((await q(`select estado || coalesce('*' || pausado_con_tope, '') as e, count(*)::int as n from public.productos where vendedor_id = $1 group by 1`, [v])).map((r) => [r.e, r.n]))
const plan = async (v) => (await servicio(`select public.rpc_plan_de_tienda($1) as r`, [v]))[0].r
let n = 0
const cobro = async (sus, dias, monto = 10000) => (await servicio(`select public.rpc_registrar_cobro_suscripcion($1, $2, $3, 'processed', 'approved', $4, $5) as r`, [sus, `c${++n}`, `p${n}`, monto, hace(dias)]))[0].r
const suscripcion = async (v, monto = 10000) => (await servicio(`insert into public.vendedor_suscripciones (vendedor_id, plan_clave, monto, estado, mp_preapproval_id) values ($1, 'basico', $2, 'authorized', $3) returning id`, [v, monto, `pre-${++s}`]))[0].id
async function pasarElTiempo(sus, pagadoHace) {
  const seg = Number((await q(`select extract(epoch from (pagado_hasta - (now() - make_interval(secs => $2::float8 * 86400)))) as s from public.vendedor_suscripciones where id = $1`, [sus, pagadoHace]))[0].s)
  await q(`update public.suscripcion_cobros set cobrado_en = cobrado_en - make_interval(secs => $2::float8) where suscripcion_id = $1`, [sus, seg])
  await q(`update public.vendedor_suscripciones set pagado_hasta = pagado_hasta - make_interval(secs => $2::float8), ultimo_cobro_en = ultimo_cobro_en - make_interval(secs => $2::float8), primer_cobro_en = primer_cobro_en - make_interval(secs => $2::float8) where id = $1`, [sus, seg])
}
const ajustar = async (v, motivo = null, topeAntes = null) => (await servicio(`select public.rpc_ajustar_productos_al_plan($1, $2, $3) as r`, [v, motivo, topeAntes]))[0].r
const especial = (v, tope, precio) => q(`insert into public.vendedor_planes (vendedor_id, plan_clave, tope_productos, precio_especial, motivo, creado_por)
  values ($1, 'basico', $2, $3, 'x', (select usuario_id from public.vendedores where id = $1))
  on conflict (vendedor_id) do update set tope_productos = excluded.tope_productos, precio_especial = excluded.precio_especial`, [v, tope, precio])

// Antes de la 052: una tienda que cayó con la 050 (para el relleno del tope).
const VIEJA = await tienda()
await productos(VIEJA, 15)
const susV = await suscripcion(VIEJA)
await cobro(susV, 3)
await pasarElTiempo(susV, 10.1)
await servicio(`select public.rpc_aplicar_caidas_vencidas()`)

console.log("1. Corre dos veces y rellena el tope de los que ya estaban pausados")
const M = leer("052_volver_cuando_sube_el_tope.sql")
let error = null, verif = null
try { await db.exec(M); const r = await db.exec(M); verif = r.flatMap((x) => x.rows || []).find((x) => x.verificacion)?.verificacion } catch (e) { error = e }
ok(!error, "corre dos veces" + (error ? ": " + error.message : ""))
ok(verif && Object.values(verif).every((x) => x === true), `verificación ${JSON.stringify(verif)}`)
ok((await cuenta(VIEJA))["pausado*10"] === 5, `los 5 pausados de antes quedan con el tope 10 (${JSON.stringify(await cuenta(VIEJA))})`)

console.log("\n2. 50 → Gratis → Básico → 50 (el caso que quedaba para siempre)")
const T = await tienda()
await productos(T, 40)
await especial(T, 50, 10000)
const sus1 = await suscripcion(T)
await cobro(sus1, 3)
ok((await plan(T)).tope_productos === 50 && (await cuenta(T)).activo === 40, "con el plan a medida de 50 pago: 40 publicados")
await pasarElTiempo(sus1, 10.1)
await servicio(`select public.rpc_aplicar_caidas_vencidas()`)
let c = await cuenta(T)
ok(c.activo === 10 && c["pausado*10"] === 30, `deja de pagar: quedan 10, 30 pausados con el tope 10 (${JSON.stringify(c)})`)
// Vuelve con el Básico común (sin las condiciones).
await q(`delete from public.vendedor_planes where vendedor_id = $1`, [T])
await servicio(`update public.vendedor_suscripciones set estado = 'cancelled' where id = $1`, [sus1])
const sus2 = await suscripcion(T)
const r2 = await cobro(sus2, 0)
c = await cuenta(T)
ok(r2.ajuste.restaurados === 15 && c.activo === 25 && c["pausado*25"] === 15, `con el Básico (25): vuelven 15, los 15 que no entran quedan con el tope 25 (${JSON.stringify(c)})`)
ok((await plan(T)).caida === null, "la caída se cierra")
// Elimina 3: el lugar es suyo, no vuelve ninguno.
await q(`delete from public.productos where id in (select id from public.productos where vendedor_id = $1 and estado = 'activo' order by creado_en desc limit 3)`, [T])
await servicio(`select public.rpc_registrar_cobro_suscripcion($1, $2, null, null, null, null, null)`, [sus2, `c${n}`])
c = await cuenta(T)
ok(c.activo === 22 && c["pausado*25"] === 15, `elimina 3 y sincroniza: no vuelve ninguno (${JSON.stringify(c)})`)
// Le cargo de nuevo el plan a medida de 50 (con el precio que ya paga).
await especial(T, 50, 10000)
const r3 = await ajustar(T)
c = await cuenta(T)
ok(r3.restaurados === 15 && c.activo === 37 && !c["pausado*25"], `con condiciones de 50: vuelven los 15 en el momento (${JSON.stringify(c)})`)

console.log("\n3. Una caída sobre otra")
const U = await tienda()
await productos(U, 40)
await especial(U, 50, 20000)
const susU = await suscripcion(U, 20000)
await cobro(susU, 3, 20000)
await q(`delete from public.vendedor_planes where vendedor_id = $1`, [U])
await ajustar(U, "condiciones_quitadas", 50)
c = await cuenta(U)
ok(c.activo === 25 && c["pausado*25"] === 15, `quitar el plan a medida: 15 pausados con el tope 25 (${JSON.stringify(c)})`)
await pasarElTiempo(susU, 10.1)
await servicio(`select public.rpc_aplicar_caidas_vencidas()`)
c = await cuenta(U)
ok(c.activo === 10 && c["pausado*25"] === 15 && c["pausado*10"] === 15, `y después deja de pagar: los de antes conservan el 25, los nuevos el 10 (${JSON.stringify(c)})`)
await servicio(`update public.vendedor_suscripciones set estado = 'cancelled' where id = $1`, [susU])
const susU2 = await suscripcion(U)
await cobro(susU2, 0)
c = await cuenta(U)
ok(c.activo === 25 && c["pausado*25"] === 15 && !c["pausado*10"], `vuelve al Básico: vuelven los 15 del Gratis; los del 25 no (no entraban en 25) (${JSON.stringify(c)})`)

console.log("\n4. Reactivar a mano borra la marca y el tope")
// Baja al tope (25 guardados): elimina 1 publicado y 14 pausados.
await q(`delete from public.productos where id in (select id from public.productos where vendedor_id = $1 and estado = 'activo' order by creado_en desc limit 1)`, [U])
await q(`delete from public.productos where id in (select id from public.productos where vendedor_id = $1 and pausado_por_plan_en is not null order by creado_en desc limit 14)`, [U])
const unoU = (await q(`select id from public.productos where vendedor_id = $1 and pausado_por_plan_en is not null limit 1`, [U]))[0].id
const rr = (await servicio(`select privado.cambiar_estado_producto($1, $2, 'activo') as r`, [U, unoU]))[0].r
const pr = (await q(`select estado, pausado_por_plan_en, pausado_con_tope from public.productos where id = $1`, [unoU]))[0]
ok(rr.ok && pr.estado === "activo" && pr.pausado_por_plan_en === null && pr.pausado_con_tope === null, "activo, sin marca y sin tope")

console.log("\n4b. La confirmación cuenta lo mismo que la base (9 activos + 17 en revisión)")
{
  const def = (await q(`select pg_get_functiondef('privado.ajustar_productos_al_plan(integer, text, integer)'::regprocedure) as d`))[0].d
  const lista = ESTADOS_A_LA_VISTA.map((e) => `'${e}'`).join(', ')
  const usos = def.split(`estado in (${lista})`).length - 1
  ok(usos === 2, `ESTADOS_A_LA_VISTA (${lista}) es la lista que usa ajustar_productos_al_plan en la base para contar y para pausar (${usos} usos)`)
  const V = await tienda()
  await productos(V, 9)
  for (let i = 0; i < 17; i++) await q(`insert into public.productos (vendedor_id, nombre, estado, creado_en) values ($1, $2, 'en_revision', $3)`, [V, `r${i}`, hace(50 - i)])
  await q(`insert into public.productos (vendedor_id, nombre, estado, creado_en) values ($1, 'suyo', 'pausado', $2)`, [V, hace(1)])
  await especial(V, 30, 200)
  const susV2 = await suscripcion(V, 200)
  await cobro(susV2, 3, 200)
  // Lo que cuenta el GET de la ficha (admin/…/plan/route.js), con la misma lista.
  const aLaVista = (await q(`select count(*)::int as n from public.productos where vendedor_id = $1 and estado = any($2)`, [V, ESTADOS_A_LA_VISTA]))[0].n
  const anuncia = sePausarianAlBajar({ aLaVista, tope: 25 })
  ok(aLaVista === 26 && anuncia === 1, `la confirmación anuncia 1 (26 a la vista: 9 activos y 17 en revisión; el pausado suyo no cuenta)`)
  await q(`delete from public.vendedor_planes where vendedor_id = $1`, [V])
  const hecho = await ajustar(V, "condiciones_quitadas", 30)
  ok(hecho.pausados === anuncia, `y la base pausa exactamente esos (${hecho.pausados})`)
}

console.log("\n5. El disparador: la marca solo vive en un pausado")
{
  const D = await tienda()
  await productos(D, 14)
  const susD = await suscripcion(D)
  await cobro(susD, 3)
  await pasarElTiempo(susD, 10.1)
  await servicio(`select public.rpc_aplicar_caidas_vencidas()`)
  const [a, b, c2] = (await q(`select id from public.productos where vendedor_id = $1 and pausado_por_plan_en is not null order by id`, [D])).map((x) => x.id)
  await q(`update public.productos set estado = 'rechazado' where id = $1`, [a])
  const ra = (await q(`select pausado_por_plan_en, estado_antes_del_plan, pausado_con_tope from public.productos where id = $1`, [a]))[0]
  ok(ra.pausado_por_plan_en === null && ra.estado_antes_del_plan === null && ra.pausado_con_tope === null, "rechazado (como la denuncia de la 035): pierde la marca")
  await q(`update public.productos set estado = 'activo' where id = $1`, [b])
  ok((await q(`select pausado_por_plan_en from public.productos where id = $1`, [b]))[0].pausado_por_plan_en === null, "publicado por otro camino: pierde la marca")
  await q(`update public.productos set nombre = 'editado', estado = 'pausado' where id = $1`, [c2])
  const rc = (await q(`select pausado_por_plan_en, pausado_con_tope from public.productos where id = $1`, [c2]))[0]
  ok(rc.pausado_por_plan_en !== null && rc.pausado_con_tope === 10, "editado y sigue pausado: conserva la marca y el tope")
  let violacion = null
  try { await q(`update public.productos set pausado_por_plan_en = null where id = $1`, [c2]) } catch (e) { violacion = e }
  ok(violacion !== null, "el check frena un tope sin marca")
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
