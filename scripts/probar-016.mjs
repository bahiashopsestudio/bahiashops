// Prueba de la migración 016 contra una base local (PGlite: Postgres real en
// WebAssembly, sin instalar nada). No toca Supabase ni ninguna base real.
//
//   npm run probar:sql
//
// El esquema de auth y de public es una imitación: las reglas de clave foránea
// salen del resultado real (informe A); refresh_tokens.user_id es character
// varying, como en Supabase. Lo que NO prueba: el esquema real de auth, RLS ni
// PostgREST. Eso se confirma con la primera cuenta de prueba.
//
// Se corre dos veces: con flow_state.user_id como uuid y como varchar, porque
// sin FK no sabemos cuál es en cada versión de Supabase.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const MIG = readFileSync(new URL("../sql/migrations/016_eliminar_cuenta.sql", import.meta.url), "utf8")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

async function correr(titulo, flowStateTipo) {
  console.log(`\n════ ${titulo} ════\n`)
  const db = new PGlite()
  const q = async (sql, p) => (await db.query(sql, p)).rows
  const n = async (sql, p) => Number((await q(sql, p))[0].n)

  // ── Esquema parecido al de Supabase (FKs con las reglas reales del resultado A) ──
  await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema privado;
  grant usage on schema privado to anon, authenticated;   -- como 007
  create table auth.users (id uuid primary key, email text, phone text unique,
    raw_user_meta_data jsonb, raw_app_meta_data jsonb, encrypted_password text,
    email_change text, phone_change text, last_sign_in_at timestamptz,
    banned_until timestamptz, updated_at timestamptz);
  create unique index users_email_partial_key on auth.users (email);
  create table auth.identities (id serial primary key, user_id uuid not null references auth.users on delete cascade, email text, identity_data jsonb);
  create table auth.sessions (id serial primary key, user_id uuid not null references auth.users on delete cascade, ip text, user_agent text);
  create table auth.refresh_tokens (id serial primary key, user_id character varying(255), session_id int references auth.sessions on delete cascade);
  create table auth.flow_state (id serial primary key, user_id ${flowStateTipo});
  create table auth.one_time_tokens (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.mfa_factors (id serial primary key, user_id uuid not null references auth.users on delete cascade, phone text);
  create table auth.oauth_consents (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.oauth_authorizations (id serial primary key, user_id uuid references auth.users on delete cascade);
  create table auth.webauthn_credentials (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.webauthn_challenges (id serial primary key, user_id uuid references auth.users on delete cascade);

  create table public.usuarios (id uuid primary key references auth.users on delete cascade,
    email text not null unique, nombre text not null, apellido text not null,
    nombre_usuario text unique, telefono text, avatar_url text, email_verificado boolean,
    creado_en timestamptz, actualizado_en timestamptz, es_admin boolean,
    imagen_perfil text not null default 'dibujo', bienvenida_vista_en timestamptz);
  create table public.vendedores (id serial primary key,
    usuario_id uuid not null references public.usuarios on delete cascade,
    validado_por uuid references public.usuarios, nombre_negocio text);
  create table public.direcciones (id bigserial primary key,
    usuario_id uuid not null references public.usuarios on delete cascade,
    calle text not null, numero text not null, telefono text not null);
  create table public.pedidos (id bigserial primary key,
    comprador_id uuid not null references public.usuarios,           -- NO ACTION
    vendedor_id bigint not null default 1,
    direccion_id bigint references public.direcciones,              -- NO ACTION (lo más estricto)
    estado text not null, mp_payment_id text, mp_preference_id text, total numeric default 0,
    actualizado_en timestamptz default now(),
    comprador_nombre text, comprador_apellido text, comprador_telefono text, direccion_copia jsonb);
  create table public.pedido_items (id serial primary key, pedido_id bigint not null references public.pedidos on delete cascade, nombre text);
  create table public.favoritos (id serial primary key, usuario_id uuid not null references auth.users on delete cascade, producto_id int);
  create table public.votos_funciones (id bigserial primary key, usuario_id uuid not null references auth.users on delete cascade, funcion text);
  create table public.mensajes_contacto (id serial primary key, email text not null, mensaje text not null,
    usuario_id uuid references auth.users on delete set null);
  create table public.waitlist (id serial primary key, email text not null unique);
  create table public.leads_gastronomia (id serial primary key, nombre text, email text);
  `)

  // La migración, dos veces (tiene que poder correrse de nuevo)
  await db.exec(MIG)
  await db.exec(MIG)
  console.log('Migración corrida dos veces sin errores.\n')

  let seq = 0
  const uid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`

  async function crearCuenta({ email, google = false, admin = false }) {
    const id = uid()
    await db.query(`insert into auth.users values ($1,$2,'+549291555'||lpad('${seq}',4,'0'),$3,$4,'hash','x','y',now(),null,now())`,
      [id, email, JSON.stringify({ full_name: 'Ana Pérez', picture: 'http://g/x.png', sub: '123' }), JSON.stringify({ provider: google ? 'google' : 'email' })])
    await db.query(`insert into auth.identities (user_id,email,identity_data) values ($1,$2,'{"sub":"123"}')`, [id, email])
    const s = (await q(`insert into auth.sessions (user_id,ip,user_agent) values ($1,'1.2.3.4','Mozilla') returning id`, [id]))[0].id
    await db.query(`insert into auth.refresh_tokens (user_id, session_id) values ($1,$2)`, [id, s])
    await db.query(`insert into auth.flow_state (user_id) values ($1)`, [id])
    await db.query(`insert into public.usuarios (id,email,nombre,apellido,nombre_usuario,telefono,avatar_url,es_admin)
                    values ($1,$2,'Ana','Pérez',$3,'2915550000','http://g/x.png',$4)`, [id, email, 'Zorro ' + seq, admin])
    await db.query(`insert into public.direcciones (usuario_id,calle,numero,telefono) values ($1,'Alsina','235','2915550000')`, [id])
    await db.query(`insert into public.favoritos (usuario_id,producto_id) values ($1,1)`, [id])
    await db.query(`insert into public.votos_funciones (usuario_id,funcion) values ($1,'foto_perfil')`, [id])
    await db.query(`insert into public.mensajes_contacto (email,mensaje,usuario_id) values ($1,'hola',$2)`, [email, id])
    await db.query(`insert into public.mensajes_contacto (email,mensaje,usuario_id) values ($1,'sin sesión',null)`, [email.toUpperCase()])
    await db.query(`insert into public.mensajes_contacto (email,mensaje,usuario_id) values ('otra@x.com','de otra persona',null)`)
    await db.query(`insert into public.waitlist (email) values ($1)`, [email])
    await db.query(`insert into public.leads_gastronomia (nombre,email) values ('Ana',$1)`, [email])
    return id
  }
  async function pedido(comprador, estado, { pago = null, pref = null, conDir = false } = {}) {
    const dir = conDir ? (await q(`select id from public.direcciones where usuario_id=$1 limit 1`, [comprador]))[0].id : null
    const id = (await q(`insert into public.pedidos (comprador_id,estado,mp_payment_id,mp_preference_id,total,direccion_id,
        comprador_nombre,comprador_apellido,comprador_telefono,direccion_copia)
        values ($1,$2,$3,$4,1000,$5,'Ana','Pérez','2915550000','{"calle":"Alsina","referencia":"timbre","lat":1,"lng":2}') returning id`,
      [comprador, estado, pago, pref, dir]))[0].id
    await db.query(`insert into public.pedido_items (pedido_id,nombre) values ($1,'Taza')`, [id])
    return id
  }
  const cerrar = async (id) => (await q(`select public.rpc_cerrar_cuenta($1) as r`, [id]))[0].r
  const evaluar = async (id) => (await q(`select public.rpc_evaluar_eliminar_cuenta($1) as r`, [id]))[0].r

  // ─────────────────────────────────────────────
  console.log('1. Cuenta SIN pedidos -> borrado completo')
  {
    const id = await crearCuenta({ email: 'Sin.Pedidos@mail.com' })
    const e = await evaluar(id)
    ok(e.motivos.length === 0 && e.pedidos_total === 0, 'evaluar: se puede eliminar, 0 pedidos')
    const r = await cerrar(id)
    ok(r.ok && r.resultado === 'borrada', 'resultado borrada')
    ok(r.emails.includes('sin.pedidos@mail.com') && r.nombre === 'Ana', 'devuelve mail y nombre para el mail final')
    for (const t of ['auth.users', 'public.usuarios', 'auth.identities', 'auth.sessions', 'public.direcciones', 'public.favoritos', 'public.votos_funciones'])
      ok(await n(`select count(*) n from ${t} where ${t === 'auth.users' || t === 'public.usuarios' ? 'id' : 'user_id'.replace('user_id', t.startsWith('auth') ? 'user_id' : 'usuario_id')} = $1`, [id]) === 0, `${t}: sin filas`)
    ok(await n(`select count(*) n from auth.refresh_tokens where user_id = $1`, [id]) === 0, 'refresh_tokens (sin FK a user): sin filas')
    ok(await n(`select count(*) n from auth.flow_state where user_id = $1`, [id]) === 0, 'flow_state (sin FK): sin filas')
    ok(await n(`select count(*) n from public.mensajes_contacto where mensaje in ('hola','sin sesión')`) === 0, 'mensajes: los de la cuenta y los del mismo mail sin sesión, borrados')
    ok(await n(`select count(*) n from public.mensajes_contacto where email='otra@x.com'`) === 1, 'mensajes de otra persona: intactos')
    ok(await n(`select count(*) n from public.waitlist`) === 0 && await n(`select count(*) n from public.leads_gastronomia`) === 0, 'waitlist y leads por mail: borrados')
    // el mail se puede volver a usar
    await db.query(`insert into auth.users (id,email) values ($1,'sin.pedidos@mail.com')`, [uid()])
    ok(true, 'el mismo mail se puede volver a registrar')
    ok((await cerrar(id)).resultado === 'ya_cerrada', 'segunda vez: ya_cerrada')
  }

  console.log('\n2. Cuenta CON pedidos -> cáscara anónima')
  let shell, pDesp, pAband, pRech, pOtra
  {
    const otra = await crearCuenta({ email: 'otra.cuenta@mail.com' })
    shell = await crearCuenta({ email: 'Con.Pedidos@gmail.com', google: true })
    pDesp = await pedido(shell, 'despachado', { pago: '111', conDir: true })
    pAband = await pedido(shell, 'pendiente', { pref: 'pref-1' })
    pRech = await pedido(shell, 'rechazado', { pago: '222', pref: 'pref-2' })
    pOtra = await pedido(otra, 'despachado', { pago: '333', conDir: true })
    const e = await evaluar(shell)
    ok(e.motivos.length === 0 && e.pedidos_total === 3 && e.abandonados.length === 2, 'evaluar: se puede; 2 abandonados a cancelar')
    const r = await cerrar(shell)
    ok(r.ok && r.resultado === 'anonimizada', 'resultado anonimizada')
    ok(r.pedidos_cancelados.map(p => p.id).sort().join() === [pAband, pRech].sort().join(), 'devuelve los pedidos cancelados (con mp_preference_id)')
    ok(r.pedidos_cancelados.every(p => p.mp_preference_id), 'con la preferencia a vencer')
    const u = (await q(`select * from public.usuarios where id=$1`, [shell]))[0]
    ok(u.email === `eliminada-${shell}@cuenta-eliminada.invalid` && u.nombre === '' && u.apellido === '' && u.nombre_usuario === null && u.telefono === null && u.avatar_url === null && u.cerrada_en && u.es_admin === false, 'usuarios: vaciado y marcado')
    const a = (await q(`select * from auth.users where id=$1`, [shell]))[0]
    ok(a.email === u.email && a.phone === null && JSON.stringify(a.raw_user_meta_data) === '{}' && new Date(a.banned_until) > new Date(Date.now() + 3e10), 'auth.users: mail reemplazado, sin metadata, baneada')
    for (const t of ['identities', 'sessions', 'refresh_tokens', 'flow_state']) ok(await n(`select count(*) n from auth.${t} where user_id::text = $1`, [shell]) === 0, `auth.${t}: sin filas`)
    ok(await n(`select count(*) n from public.direcciones where usuario_id=$1`, [shell]) === 0, 'direcciones borradas (aunque un pedido apuntaba a una)')
    ok(await n(`select count(*) n from public.favoritos where usuario_id=$1`, [shell]) + await n(`select count(*) n from public.votos_funciones where usuario_id=$1`, [shell]) === 0, 'favoritos y votos borrados')
    const p = await q(`select * from public.pedidos where comprador_id=$1 order by id`, [shell])
    ok(p.length === 3 && p.every(x => x.comprador_nombre === null && x.comprador_apellido === null && x.comprador_telefono === null && x.direccion_copia === null && x.direccion_id === null), '3 pedidos conservados, copias y dirección_id en null')
    ok(p.find(x => x.id == pDesp).estado === 'despachado' && Number(p[0].total) === 1000, 'el despachado sigue despachado, con su total')
    ok(p.find(x => x.id == pAband).estado === 'cancelado' && p.find(x => x.id == pRech).estado === 'cancelado', 'abandonado y rechazado: cancelados')
    ok(await n(`select count(*) n from public.pedido_items`) === 4, 'los ítems de los pedidos se conservan')
    const o = (await q(`select comprador_nombre, direccion_id from public.pedidos where id=$1`, [pOtra]))[0]
    ok(o.comprador_nombre === 'Ana' && o.direccion_id !== null, 'pedidos de otra cuenta: intactos')
    ok(await n(`select count(*) n from public.usuarios where id <> $1`, [shell]) === 1, 'otra cuenta: intacta')
    // el mail original queda libre: otra cuenta (p. ej. Google de nuevo) entra como NUEVA
    const nuevo = uid()
    await db.query(`insert into auth.users (id,email) values ($1,'con.pedidos@gmail.com')`, [nuevo])
    await db.query(`insert into public.usuarios (id,email,nombre,apellido) values ($1,'con.pedidos@gmail.com','','')`, [nuevo])
    ok(true, 'el mail original se puede volver a registrar (cuenta nueva, otro id)')
    ok((await cerrar(shell)).resultado === 'ya_cerrada', 'segunda vez: ya_cerrada, sin tocar nada')
  }

  console.log('\n3. Lo que impide eliminar (no se toca nada)')
  async function foto() {
    return JSON.stringify([
      await q(`select id, estado from public.pedidos order by id`), await n(`select count(*) n from auth.users`),
      await n(`select count(*) n from public.mensajes_contacto`), await n(`select count(*) n from public.favoritos`)])
  }
  for (const [nombre, prep, motivo] of [
    ['con tienda', async id => db.query(`insert into public.vendedores (usuario_id,nombre_negocio) values ($1,'T')`, [id]), 'TIENDA'],
    ['pedido pagado', async id => pedido(id, 'pagado', { pago: '9' }), 'PEDIDO_ACTIVO'],
    ['pedido preparando', async id => pedido(id, 'preparando', { pago: '9' }), 'PEDIDO_ACTIVO'],
    ['pedido franja', async id => pedido(id, 'franja', { pago: '9' }), 'PEDIDO_ACTIVO'],
    ['pedido por_salir', async id => pedido(id, 'por_salir', { pago: '9' }), 'PEDIDO_ACTIVO'],
    ['estado desconocido', async id => pedido(id, 'algo_nuevo'), 'PEDIDO_ACTIVO'],
    ['pago en curso (pendiente con pago)', async id => pedido(id, 'pendiente', { pago: '555' }), 'PAGO_EN_CURSO'],
    ['es admin', async id => db.query(`update public.usuarios set es_admin=true where id=$1`, [id]), 'ES_ADMIN'],
  ]) {
    const id = await crearCuenta({ email: `bloq${seq}@mail.com` })
    await prep(id)
    const antes = await foto()
    const r = await cerrar(id)
    ok(r.ok === false && r.motivos.includes(motivo), `${nombre}: bloquea (${motivo})`)
    ok(await foto() === antes, `${nombre}: no cambió nada`)
    ok((await evaluar(id)).motivos.includes(motivo), `${nombre}: el precheck también lo ve`)
  }
  {
    const id = await crearCuenta({ email: 'multi@mail.com' })
    await db.query(`insert into public.vendedores (usuario_id,nombre_negocio) values ($1,'T')`, [id])
    await pedido(id, 'pagado', { pago: '9' })
    const m = (await evaluar(id)).motivos
    ok(m.includes('TIENDA') && m.includes('PEDIDO_ACTIVO'), 'varios motivos a la vez se listan todos')
  }

  console.log('\n4. Cuenta que figura como validadora (sin pedidos) va por la cáscara, no por el borrado')
  {
    const id = await crearCuenta({ email: 'validador@mail.com' })
    const due = await crearCuenta({ email: 'dueno@mail.com' })
    await db.query(`insert into public.vendedores (usuario_id,validado_por,nombre_negocio) values ($1,$2,'T')`, [due, id])
    const r = await cerrar(id)
    ok(r.ok && r.resultado === 'anonimizada', 'anonimizada (un DELETE habría chocado con validado_por)')
    ok(await n(`select count(*) n from public.vendedores where validado_por=$1`, [id]) === 1, 'la tienda de otra persona conserva su referencia')
  }

  console.log('\n5. Todo o nada: si el borrado falla a mitad, no queda nada a medias')
  {
    await db.exec(`create table public.bloqueo_prueba (id serial primary key, usuario_id uuid references public.usuarios)`)
    const id = await crearCuenta({ email: 'atomica@mail.com' })
    await db.query(`insert into public.bloqueo_prueba (usuario_id) values ($1)`, [id])
    let error = null
    try { await cerrar(id) } catch (e) { error = e }
    ok(error !== null, 'el borrado falla por la FK inesperada')
    ok(await n(`select count(*) n from public.mensajes_contacto where usuario_id=$1`, [id]) === 1, 'mensajes siguen ahí (se revirtió)')
    ok(await n(`select count(*) n from public.waitlist where email='atomica@mail.com'`) === 1, 'waitlist sigue ahí')
    ok(await n(`select count(*) n from auth.sessions where user_id=$1`, [id]) === 1, 'sesiones siguen ahí')
    ok(await n(`select count(*) n from auth.flow_state where user_id=$1`, [id]) === 1, 'flow_state sigue ahí')
    await db.exec(`drop table public.bloqueo_prueba`)
    ok((await cerrar(id)).resultado === 'borrada', 'quitada la causa, reintentar funciona')
  }

  console.log('\n6. Disparadores: nada nuevo a nombre de una cuenta eliminada')
  for (const [t, sql] of [
    ['vendedores', `insert into public.vendedores (usuario_id,nombre_negocio) values ($1,'x')`],
    ['direcciones', `insert into public.direcciones (usuario_id,calle,numero,telefono) values ($1,'a','1','1')`],
    ['favoritos', `insert into public.favoritos (usuario_id,producto_id) values ($1,1)`],
    ['votos_funciones', `insert into public.votos_funciones (usuario_id,funcion) values ($1,'x')`],
    ['pedidos', `insert into public.pedidos (comprador_id,estado) values ($1,'pendiente')`],
  ]) {
    let e = null
    try { await db.query(sql, [shell]) } catch (x) { e = x }
    ok(e && /cuenta_cerrada/.test(e.message), `${t}: rechazado para la cuenta eliminada`)
  }
  {
    const viva = await crearCuenta({ email: 'viva@mail.com' })
    await db.query(`insert into public.favoritos (usuario_id,producto_id) values ($1,2)`, [viva])
    await pedido(viva, 'pendiente')
    ok(true, 'una cuenta normal sigue pudiendo insertar')

    // Lo que importa en producción: el disparador corre cuando inserta una
    // persona con sesión (rol authenticated), que NO tiene permiso de ejecutar
    // la función. Si eso rompiera los inserts normales, se caería el sitio.
    await db.exec('grant insert, select on public.favoritos to authenticated; grant usage on all sequences in schema public to authenticated')
    let errViva = null, errCerrada = null
    try {
      await db.exec('set role authenticated')
      try { await db.query(`insert into public.favoritos (usuario_id,producto_id) values ($1,3)`, [viva]) } catch (x) { errViva = x }
      try { await db.query(`insert into public.favoritos (usuario_id,producto_id) values ($1,3)`, [shell]) } catch (x) { errCerrada = x }
    } finally { await db.exec('reset role') }
    ok(errViva === null, 'authenticated: el insert de una cuenta normal pasa (el disparador no necesita permiso de ejecución)')
    ok(errCerrada && /cuenta_cerrada/.test(errCerrada.message), 'authenticated: el de una cuenta eliminada se rechaza con cuenta_cerrada')
  }

  console.log('\n7. Permisos: solo service_role')
  for (const rol of ['anon', 'authenticated']) {
    for (const f of ['public.rpc_cerrar_cuenta', 'public.rpc_evaluar_eliminar_cuenta', 'privado.cerrar_cuenta', 'privado.evaluar_eliminar_cuenta']) {
      let e = null
      try { await db.exec(`set role ${rol}`); await db.query(`select ${f}($1)`, [uid()]) } catch (x) { e = x } finally { await db.exec('reset role') }
      ok(e && /permission denied/.test(e.message), `${rol} no puede ejecutar ${f}`)
    }
  }
  {
    let e = null
    try { await db.exec('set role service_role'); await db.query(`select public.rpc_cerrar_cuenta($1)`, [uid()]) } catch (x) { e = x } finally { await db.exec('reset role') }
    ok(e === null, 'service_role sí puede (cuenta inexistente -> ya_cerrada)')
  }

  console.log('\n8. Deshacer (el bloque comentado al final de la migración)')
  {
    const bloque = MIG.split('-- Para deshacer')[1].split('\n').filter(l => l.startsWith('-- ') && !l.startsWith('-- (') && !l.startsWith('-- =')).map(l => l.slice(3)).filter(l => /^(begin|commit|drop|alter)/.test(l)).join('\n')
    await db.exec(bloque)
    ok(await n(`select count(*) n from information_schema.triggers where trigger_name='rechazar_cuenta_cerrada'`) === 0, 'sin disparadores')
    ok(await n(`select count(*) n from pg_proc where proname in ('cerrar_cuenta','evaluar_eliminar_cuenta','rpc_cerrar_cuenta','rpc_evaluar_eliminar_cuenta','rechazar_cuenta_cerrada')`) === 0, 'sin funciones')
    ok(await n(`select count(*) n from information_schema.columns where column_name in ('cerrada_en','aviso_pago_tardio_en')`) === 0, 'sin columnas nuevas')
    await db.exec(MIG)
    ok(true, 'y se puede volver a aplicar después de deshacer')
  }

}

await correr("flow_state.user_id uuid", "uuid")
await correr("flow_state.user_id character varying", "character varying(255)")

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
