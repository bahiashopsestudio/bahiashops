// Prueba de la migración 053 contra una base local (PGlite: Postgres real en
// WebAssembly, sin instalar nada). No toca Supabase ni ninguna base real.
//
//   npm run probar:053
//
// El esquema de auth y de usuarios es una imitación mínima, con la cascada de
// producción (usuarios.id -> auth.users ON DELETE CASCADE, consulta 6 del
// 09/11). Lo que NO prueba: RLS con PostgREST.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { validarInteresServicios, MAX_RUBRO } from "../src/lib/formulariosPublicos.js"
import { normalizarRubro, contarPorRubro } from "../src/lib/serviciosInteresados.js"

const MIG = readFileSync(new URL("../sql/migrations/053_servicios_interesados.sql", import.meta.url), "utf8")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const db = new PGlite()
const q = async (sql, p) => (await db.query(sql, p)).rows
const falla = async (sql, p) => { try { await db.query(sql, p); return null } catch (e) { return e.message } }
const registrar = async (email, rubro) => (await q("select public.rpc_registrar_interes_servicios($1, $2) as r", [email, rubro]))[0].r
const hay = async (email) => (await q("select 1 from public.servicios_interesados where email = $1", [email])).length

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema privado;
  create table auth.users (id uuid primary key, email text);
  create table public.usuarios (id uuid primary key references auth.users on delete cascade,
    email text, cerrada_en timestamptz);
`)

const cuenta = async (id, email, emailAuth = email) => {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, emailAuth])
  await db.query("insert into public.usuarios (id, email) values ($1, $2)", [id, email])
}
const A = "00000000-0000-0000-0000-00000000000a"
const B = "00000000-0000-0000-0000-00000000000b"
const C = "00000000-0000-0000-0000-00000000000c"
const D = "00000000-0000-0000-0000-00000000000d"

console.log("1. La migración corre, y corre dos veces")
await db.exec(MIG)
await db.exec(MIG)
ok(true, "corrió dos veces sin error")
const [v] = await q("select relrowsecurity as rls from pg_class where oid = 'public.servicios_interesados'::regclass")
ok(v.rls === true, "RLS activado")
const disparadores = await q("select tgname from pg_trigger where tgrelid = 'public.usuarios'::regclass and not tgisinternal order by 1")
ok(disparadores.length === 2, "dos disparadores en usuarios (no se duplican al correrla de nuevo)")

console.log("\n2. Nace cerrada")
for (const rol of ["anon", "authenticated"]) {
  for (const permiso of ["select", "insert", "update", "delete"]) {
    const [r] = await q(`select has_table_privilege('${rol}', 'public.servicios_interesados', '${permiso}') as puede`)
    ok(r.puede === false, `${rol} no tiene ${permiso}`)
  }
  const [f] = await q(`select has_function_privilege('${rol}', 'public.rpc_registrar_interes_servicios(text, text)', 'execute') as puede`)
  ok(f.puede === false, `${rol} no ejecuta el rpc`)
}
const [sr] = await q(`select has_table_privilege('service_role', 'public.servicios_interesados', 'insert') as t,
  has_function_privilege('service_role', 'public.rpc_registrar_interes_servicios(text, text)', 'execute') as f`)
ok(sr.t && sr.f, "service_role escribe y ejecuta el rpc")

console.log("\n3. Guardar: un email, una fila")
ok((await registrar("ana@mail.com", "Gasista")).ok === true, "nuevo: ok")
ok((await registrar("  ANA@mail.com ", "Masajes")).ok === true, "repetido (con mayúsculas y espacios): la misma respuesta")
const filas = await q("select email, rubro from public.servicios_interesados")
ok(filas.length === 1 && filas[0].rubro === "Gasista", "queda una sola fila, con el rubro original")

console.log("\n4. Las reglas de la tabla")
const INS = "insert into public.servicios_interesados (email, rubro) values ($1, $2)"
ok(await falla(INS, ["Ana2@mail.com", "x"]), "email con mayúscula: rechazado")
ok(await falla(INS, [" b@mail.com", "x"]), "email sin recortar: rechazado")
ok(await falla(INS, ["b@c", "x"]) === null, "3 caracteres: entra (la forma la valida el servidor)")
ok(await falla(INS, ["bc", "x"]), "2 caracteres: rechazado")
ok(await falla(INS, ["c@mail.com", ""]), "rubro vacío: rechazado")
ok(await falla(INS, ["c@mail.com", " Gas"]), "rubro sin recortar: rechazado")
ok(await falla(INS, ["c@mail.com", "x".repeat(81)]), "rubro de 81: rechazado")
ok(await falla(INS, ["c@mail.com", "x".repeat(80)]) === null, "rubro de 80: entra")
await db.exec("delete from public.servicios_interesados")

console.log("\n5. El tope por día (bajado a 3 para la prueba)")
const MIG_TOPE = MIG.replace("v_tope constant integer := 100;", "v_tope constant integer := 3;")
ok(MIG_TOPE !== MIG, "se encontró la constante del tope")
await db.exec(MIG_TOPE)
for (const n of [1, 2, 3]) await registrar(`t${n}@mail.com`, "Clases")
const pasado = await registrar("t4@mail.com", "Clases")
ok(pasado.ok === false && pasado.motivo === "tope", "la cuarta del día: tope")
ok(!(await hay("t4@mail.com")), "y no se guardó")
ok((await registrar("t1@mail.com", "Clases")).ok === false, "con el tope lleno, un repetido también da tope (no revela nada)")
await db.exec("update public.servicios_interesados set creado_en = now() - interval '2 days'")
ok((await registrar("t4@mail.com", "Clases")).ok === true, "las de otro día no cuentan")
await db.exec(MIG)
await db.exec("delete from public.servicios_interesados")

console.log("\n6. Eliminar la cuenta, en los dos caminos")
await cuenta(A, "a@mail.com")
await cuenta(B, "b@mail.com")
await cuenta(C, "c@mail.com", "c.nuevo@mail.com")
await cuenta(D, "d@mail.com")
for (const e of ["a@mail.com", "b@mail.com", "c@mail.com", "c.nuevo@mail.com", "d@mail.com", "otra@mail.com"]) await registrar(e, "Fotografía")

await db.query("delete from auth.users where id = $1", [B])
ok(!(await hay("b@mail.com")), "borrado completo (cascada desde auth.users): se borra la anotación")
ok((await q("select 1 from public.usuarios where id = $1", [B])).length === 0, "y la cuenta se borró igual")

// Como privado.cerrar_cuenta (031): una sola actualización pone cerrada_en y
// cambia el email; auth.users se actualiza después.
await db.query(`update public.usuarios set email = 'eliminada-' || id || '@cuenta-eliminada.invalid',
  cerrada_en = now() where id = $1`, [C])
ok(!(await hay("c@mail.com")) && !(await hay("c.nuevo@mail.com")), "cáscara anónima: se borran las del email de usuarios y el de auth")
ok((await q("select 1 from public.usuarios where id = $1", [C])).length === 1, "y la cuenta sigue (por sus pedidos)")

await db.query("update public.usuarios set email = 'a.otro@mail.com' where id = $1", [A])
ok(await hay("a@mail.com"), "cambiar el email sin cerrar la cuenta no borra nada")
await db.query("update public.usuarios set cerrada_en = cerrada_en where id = $1", [D])
ok(await hay("d@mail.com"), "tocar cerrada_en sin cerrar la cuenta no borra nada")
ok(await hay("otra@mail.com"), "la de otra persona queda")

console.log("\n7. La validación del servidor")
const bien = validarInteresServicios({ email: "  Ana@Mail.com ", rubro: "  Gasista matriculado " })
ok(bien.ok && bien.email === "ana@mail.com" && bien.rubro === "Gasista matriculado", "normaliza el email y recorta el rubro")
ok(validarInteresServicios({ email: "ana@mail", rubro: "x" }).campo === "email", "email sin dominio completo: rechazado")
ok(validarInteresServicios({ email: "", rubro: "x" }).campo === "email", "email vacío: rechazado")
ok(validarInteresServicios({ email: "a@b.co", rubro: "   " }).campo === "rubro", "rubro con solo espacios: rechazado")
ok(validarInteresServicios({ email: "a@b.co" }).campo === "rubro", "sin rubro: rechazado")
ok(validarInteresServicios({ email: "a@b.co", rubro: 5 }).campo === "rubro", "rubro numérico: rechazado")
ok(validarInteresServicios({ email: "a@b.co", rubro: "a\nb" }).campo === "rubro", "rubro con salto de línea: rechazado")
ok(!validarInteresServicios({ email: "a@b.co", rubro: "x".repeat(MAX_RUBRO + 1) }).ok, `rubro de ${MAX_RUBRO + 1}: rechazado`)
ok(validarInteresServicios({ email: "a@b.co", rubro: "x".repeat(MAX_RUBRO) }).ok, `rubro de ${MAX_RUBRO}: entra`)
ok(!validarInteresServicios(null).ok, "cuerpo vacío: rechazado")

console.log("\n8. El conteo por rubro")
ok(normalizarRubro("  Fotografía   de  BODAS ") === "fotografia de bodas", "minúsculas, sin tildes, espacios colapsados")
const conteo = contarPorRubro([{ rubro: "Gasista" }, { rubro: "gasista " }, { rubro: "Gas" }, { rubro: "Masajes" }, { rubro: "GASISTA" }])
ok(conteo[0].rubro === "gasista" && conteo[0].cantidad === 3, "«Gasista», «gasista » y «GASISTA» cuentan juntos, primero")
ok(conteo.length === 3 && conteo[1].rubro === "gas", "«gas» queda aparte; a igual cantidad, alfabético")

await db.close()
console.log(fallas ? `\n✗ ${fallas} fallas` : "\n✓ Todo bien")
process.exitCode = fallas ? 1 : 0
