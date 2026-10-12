// La base de prueba de las tiendas: una imitación del esquema de auth y de
// public (como la de probar-016), con las migraciones reales 016, 007, 030 y
// 031 corridas encima. La usan probar-031 (la migración) y probar-eliminar-
// tienda (las rutas).
//
// Las claves foráneas hacia productos y vendedores van SIN cascade a propósito
// (lo más estricto): la 031 no puede depender de que lo sean. PGlite es
// Postgres real en WebAssembly: no toca Supabase ni ninguna base real.

import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const leer = (f) => readFileSync(new URL(`../sql/migrations/${f}`, import.meta.url), "utf8")
export const M031 = leer("031_eliminar_tienda.sql")

const ESQUEMA = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema privado;
  grant usage on schema privado to anon, authenticated;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create table auth.users (id uuid primary key, email text, phone text unique,
    raw_user_meta_data jsonb, raw_app_meta_data jsonb, encrypted_password text,
    email_change text, phone_change text, last_sign_in_at timestamptz,
    banned_until timestamptz, updated_at timestamptz);
  create table auth.identities (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.sessions (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.refresh_tokens (id serial primary key, user_id character varying(255));
  create table auth.flow_state (id serial primary key, user_id uuid);
  create table auth.one_time_tokens (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.mfa_factors (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.oauth_consents (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.oauth_authorizations (id serial primary key, user_id uuid references auth.users on delete cascade);
  create table auth.webauthn_credentials (id serial primary key, user_id uuid not null references auth.users on delete cascade);
  create table auth.webauthn_challenges (id serial primary key, user_id uuid references auth.users on delete cascade);

  create table public.usuarios (id uuid primary key references auth.users on delete cascade,
    email text not null unique, nombre text not null, apellido text not null,
    nombre_usuario text unique, telefono text, avatar_url text, email_verificado boolean,
    actualizado_en timestamptz, es_admin boolean, cerrada_en timestamptz);

  -- Parecida a la real: contenido, contacto, ubicación y estructura.
  create table public.vendedores (
    id serial primary key,
    usuario_id uuid not null references public.usuarios on delete cascade,
    validado_por uuid references public.usuarios,
    nombre_negocio text not null unique,               -- obligatorio y único: prueba 'cerrada-<id>'
    slug text not null unique,
    descripcion_corta text, descripcion_larga text, instagram text,
    sitio_web text, telefono_contacto text, email_contacto text,
    logo_url text, portada_url text, direccion text, latitud numeric, longitud numeric,
    horarios_estructurados jsonb, notas_horarios text, notas_validacion text,
    direccion_visible boolean not null default false,
    costos_envio_zona jsonb not null default '{}',
    metodos_entrega_default text[] not null default '{}',
    mercadopago_conectado boolean default false,
    categoria_id integer, subcategoria_id integer, barrio_id integer, localidad_id integer,
    estado_validacion text default 'aprobado', bloqueado boolean default false,
    creado_en timestamptz not null default now()
  );
  create table public.direcciones (id bigserial primary key,
    usuario_id uuid not null references public.usuarios on delete cascade, calle text);
  create table public.pedidos (id bigserial primary key,
    comprador_id uuid not null references public.usuarios,
    vendedor_id integer not null references public.vendedores,              -- NO ACTION
    direccion_id bigint references public.direcciones,
    estado text not null, cancelado_motivo text, mp_payment_id text, mp_preference_id text, vendedor_nombre text,
    actualizado_en timestamptz default now(),
    comprador_nombre text, comprador_apellido text, comprador_telefono text, direccion_copia jsonb);
  create table public.productos (id serial primary key,
    vendedor_id integer not null references public.vendedores,              -- NO ACTION
    nombre text, estado text default 'activo');
  create table public.pedido_items (id serial primary key,
    pedido_id bigint not null references public.pedidos on delete cascade,
    producto_id integer references public.productos, nombre text);         -- NO ACTION
  create table public.pagos_dobles (pedido_id bigint references public.pedidos on delete cascade, pago_id text);
  create table public.producto_media (id serial primary key, producto_id integer not null references public.productos, url text);
  create table public.producto_variantes (id serial primary key, producto_id integer not null references public.productos, imagen_url text);
  create table public.producto_sellos (id serial primary key, producto_id integer not null references public.productos);
  create table public.coleccion_productos (id serial primary key, producto_id integer not null references public.productos);
  create table public.tesoros (id serial primary key, producto_id integer references public.productos on delete cascade);
  create table public.mercadopago_cuentas (vendedor_id integer primary key references public.vendedores, access_token text, refresh_token text, token_expira_en timestamptz, mp_user_id text);
  create table public.vendedor_sellos (id serial primary key, vendedor_id integer not null references public.vendedores);
  create table public.envio_zona_fallas (id serial primary key, vendedor_id integer references public.vendedores);
  create table public.favoritos (id serial primary key, usuario_id uuid not null references auth.users on delete cascade,
    producto_id integer references public.productos);                       -- NO ACTION
  create table public.votos_funciones (id bigserial primary key, usuario_id uuid not null references auth.users on delete cascade);
  create table public.mensajes_contacto (id serial primary key, email text not null, usuario_id uuid references auth.users on delete set null);
  create table public.waitlist (id serial primary key, email text not null unique);
  create table public.leads_gastronomia (id serial primary key, email text);

  alter table public.vendedores enable row level security;
  alter table public.productos enable row level security;
  alter table public.producto_media enable row level security;
  alter table public.producto_variantes enable row level security;
  alter table public.producto_sellos enable row level security;
  alter table public.pedidos enable row level security;
  grant select on public.pedidos to authenticated;
  create policy "comprador ve sus pedidos" on public.pedidos for select to authenticated using (comprador_id = auth.uid());
`

// Devuelve { db, q, n }. Con { veces: 2 } corre la 031 dos veces (tiene que
// poder correrse de nuevo).
export async function baseDeTiendas({ veces = 1 } = {}) {
  const db = new PGlite()
  await db.exec(ESQUEMA)
  await db.exec(leer("016_eliminar_cuenta.sql"))
  await db.exec(leer("007_vendedores_publicacion_automatica.sql"))
  await db.exec(leer("030_pausar_tienda.sql"))
  for (let i = 0; i < veces; i++) await db.exec(M031)
  const q = async (sql, p) => (await db.query(sql, p)).rows
  const n = async (sql, p) => Number((await q(sql, p))[0].n)
  return { db, q, n }
}
