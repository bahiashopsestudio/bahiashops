-- ============================================================================
-- Bahía Shops · 011 · Registro, apodos y datos de contacto del pedido
-- 25/9/2026 · Correr entero en el SQL Editor de Supabase. Va en transacción:
-- si algo falla, no cambia nada.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en usuarios
-- ---------------------------------------------------------------------------
alter table public.usuarios
  add column if not exists imagen_perfil text not null default 'dibujo',
  add column if not exists bienvenida_vista_en timestamptz;

alter table public.usuarios drop constraint if exists usuarios_imagen_perfil_check;
alter table public.usuarios
  add constraint usuarios_imagen_perfil_check check (imagen_perfil in ('dibujo', 'foto'));

-- ---------------------------------------------------------------------------
-- 2. Teléfono: la misma regla que src/lib/telefono.js
--    Devuelve 10 dígitos (característica + número, sin 0 ni 15) o null.
-- ---------------------------------------------------------------------------
create or replace function public.normalizar_telefono_ar(entrada text)
returns text
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(entrada, ''), '\D', '', 'g');
  k int;
begin
  if left(d, 2) = '54' then d := substr(d, 3); end if;
  if left(d, 1) = '9' and length(d) = 11 then d := substr(d, 2); end if;
  if left(d, 1) = '0' then d := substr(d, 2); end if;
  if length(d) = 12 then
    foreach k in array array[3, 4, 2] loop
      if substr(d, k + 1, 2) = '15' then
        d := left(d, k) || substr(d, k + 3);
        exit;
      end if;
    end loop;
  end if;
  if length(d) = 9 and left(d, 2) = '15' then d := '291' || substr(d, 3); end if;
  if length(d) = 7 then d := '291' || d; end if;
  if length(d) = 10 then return d; end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Generador de apodos (lista blanca de nicknames-listas.md, sin Ballena)
-- ---------------------------------------------------------------------------
create or replace function public.generar_apodo()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  animales text[] := array[
    'Jirafa:f','Cebra:f','Tortuga:f','Nutria:f','Ardilla:f','Libélula:f','Mariposa:f',
    'Luciérnaga:f','Garza:f','Abeja:f','Iguana:f','Alpaca:f','Llama:f','Golondrina:f',
    'Cigüeña:f','Gacela:f','Pantera:f','Orca:f','Vicuña:f',
    'Zorro:m','Pingüino:m','Koala:m','Delfín:m','Búho:m','Erizo:m','Castor:m','Tucán:m',
    'Camaleón:m','Pulpo:m','Caracol:m','Colibrí:m','Flamenco:m','Mapache:m','Panda:m',
    'Tigre:m','Lobo:m','Ciervo:m','Canguro:m','Elefante:m'];
  adjetivos text[] := array[
    'curioso:curiosa','valiente:valiente','brillante:brillante','elegante:elegante',
    'viajero:viajera','dormilón:dormilona','amable:amable','sereno:serena',
    'risueño:risueña','veloz:veloz','astuto:astuta','gentil:gentil',
    'luminoso:luminosa','soñador:soñadora','tranquilo:tranquila','juguetón:juguetona',
    'sabio:sabia','alegre:alegre','atento:atenta','audaz:audaz','cordial:cordial',
    'paciente:paciente','entusiasta:entusiasta','madrugador:madrugadora',
    'bailarín:bailarina','optimista:optimista','generoso:generosa',
    'simpático:simpática','aventurero:aventurera','cariñoso:cariñosa'];
  a text[];
  adj text[];
  candidato text;
  base text;
  n int;
begin
  for intento in 1..10 loop
    a := string_to_array(animales[1 + floor(random() * array_length(animales, 1))::int], ':');
    adj := string_to_array(adjetivos[1 + floor(random() * array_length(adjetivos, 1))::int], ':');
    candidato := a[1] || ' ' || case when a[2] = 'f' then adj[2] else adj[1] end;
    if not exists (select 1 from usuarios where lower(nombre_usuario) = lower(candidato)) then
      return candidato;
    end if;
  end loop;
  base := candidato;
  for n in 2..999 loop
    candidato := base || ' ' || n;
    if not exists (select 1 from usuarios where lower(nombre_usuario) = lower(candidato)) then
      return candidato;
    end if;
  end loop;
  return base || ' ' || (1000 + floor(random() * 900000))::int;
end;
$$;

revoke all on function public.generar_apodo() from public, anon;
grant execute on function public.generar_apodo() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Disparador de alta: nombre y apellido por separado, apodo asignado,
--    sin copiar la foto de Google. NUNCA debe hacer fallar un registro.
--    Lee: nombre/apellido (formulario con mail), given_name/family_name
--    (Google, si vienen), y como respaldo full_name/name/nombre_completo.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nombre text;
  v_apellido text;
begin
  v_nombre := coalesce(
    nullif(btrim(meta->>'nombre'), ''),
    nullif(btrim(meta->>'given_name'), ''),
    nullif(btrim(meta->>'full_name'), ''),
    nullif(btrim(meta->>'name'), ''),
    nullif(btrim(meta->>'nombre_completo'), ''),
    '');
  v_apellido := coalesce(
    nullif(btrim(meta->>'apellido'), ''),
    case when nullif(btrim(meta->>'given_name'), '') is not null
         then nullif(btrim(meta->>'family_name'), '') end,
    '');

  for intento in 1..5 loop
    begin
      insert into public.usuarios (id, email, nombre, apellido, nombre_usuario, email_verificado)
      values (new.id, new.email, v_nombre, v_apellido, public.generar_apodo(),
              new.email_confirmed_at is not null);
      return new;
    exception when unique_violation then
      -- dos altas simultáneas sacaron el mismo apodo: se prueba otro
      if exists (select 1 from public.usuarios where id = new.id) then
        return new;
      end if;
    end;
  end loop;

  -- último recurso: la cuenta se crea igual, sin apodo (la app se lo pide)
  insert into public.usuarios (id, email, nombre, apellido, email_verificado)
  values (new.id, new.email, v_nombre, v_apellido, new.email_confirmed_at is not null)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Arreglar las cuentas que ya existen
-- ---------------------------------------------------------------------------
-- 5a. Las creadas con mail quedaron como 'Sin nombre': el nombre estaba
--     guardado en nombre_completo y el disparador viejo no lo leía.
update public.usuarios u
   set nombre = btrim(a.raw_user_meta_data->>'nombre_completo')
  from auth.users a
 where a.id = u.id
   and u.nombre = 'Sin nombre'
   and nullif(btrim(a.raw_user_meta_data->>'nombre_completo'), '') is not null;

-- Si no había de dónde sacarlo, queda vacío: la bienvenida y el checkout lo piden.
update public.usuarios set nombre = '' where nombre = 'Sin nombre';

-- 5b. La foto de Google deja de copiarse: avatar_url pasa a ser solo la foto
--     que la persona suba a propósito.
update public.usuarios set avatar_url = null where avatar_url is not null;

-- 5c. Teléfonos guardados, al formato de 10 dígitos
update public.usuarios
   set telefono = public.normalizar_telefono_ar(telefono)
 where telefono is not null
   and public.normalizar_telefono_ar(telefono) is not null;

-- 5c-bis. Quien no tiene teléfono en la cuenta pero sí en una dirección
--         que cargó: se usa el de su dirección más reciente.
update public.usuarios u
   set telefono = x.tel
  from (select distinct on (usuario_id) usuario_id, public.normalizar_telefono_ar(telefono) as tel
          from public.direcciones
         where public.normalizar_telefono_ar(telefono) is not null
         order by usuario_id, id desc) x
 where x.usuario_id = u.id
   and u.telefono is null;

-- 5d. Un apodo para cada cuenta existente (uno por uno, para que no se repitan)
do $$
declare r record;
begin
  for r in select id from public.usuarios where nombre_usuario is null or btrim(nombre_usuario) = '' loop
    update public.usuarios set nombre_usuario = public.generar_apodo() where id = r.id;
  end loop;
end;
$$;

-- 5e. Las cuentas existentes no ven la bienvenida (para probarla, ver abajo)
update public.usuarios set bienvenida_vista_en = now() where bienvenida_vista_en is null;

-- 5f. Recién ahora, el apodo único (sin distinguir mayúsculas)
create unique index if not exists usuarios_nombre_usuario_unico
  on public.usuarios (lower(nombre_usuario));

-- ---------------------------------------------------------------------------
-- 6. El pedido guarda su propia copia de los datos de contacto y de entrega
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists comprador_nombre text,
  add column if not exists comprador_apellido text,
  add column if not exists comprador_telefono text,
  add column if not exists direccion_copia jsonb;

-- 6a. Nombre y teléfono del comprador en los pedidos existentes
--     (teléfono de la cuenta; si no hay, el de la dirección que tenía el pedido)
update public.pedidos p
   set comprador_nombre   = u.nombre,
       comprador_apellido = u.apellido,
       comprador_telefono = coalesce(
         public.normalizar_telefono_ar(u.telefono),
         (select public.normalizar_telefono_ar(d.telefono)
            from public.direcciones d where d.id = p.direccion_id))
  from public.usuarios u
 where u.id = p.comprador_id
   and p.comprador_telefono is null;

-- 6b. (Pospuesto a la entrega 3) Los pedidos viejos de retiro/acordar
--     conservan por ahora su direccion_id: el panel del vendedor todavía saca
--     el teléfono de ahí. Se limpia cuando el panel lea la copia del pedido.

-- 6c. Copia de la dirección, solo en los pedidos cuyo método la usa
update public.pedidos p
   set direccion_copia = to_jsonb(d) - 'usuario_id'
  from public.direcciones d
 where d.id = p.direccion_id
   and p.direccion_copia is null
   and coalesce(p.metodo_envio, '') not in ('retiro', 'acordar', 'coordinar');

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'usuarios', (select jsonb_agg(jsonb_build_object(
      'apodo', nombre_usuario,
      'tiene_nombre', nombre <> '',
      'tiene_apellido', apellido <> '',
      'tiene_telefono', telefono is not null,
      'telefono_ok', telefono is null or telefono ~ '^\d{10}$',
      'bienvenida_vista', bienvenida_vista_en is not null) order by creado_en)
    from public.usuarios),
  'pedidos', (select jsonb_agg(jsonb_build_object(
      'id', id, 'metodo', metodo_envio,
      'tiene_nombre', coalesce(comprador_nombre, '') <> '',
      'tiene_telefono', comprador_telefono is not null,
      'tiene_direccion', direccion_copia is not null) order by id)
    from public.pedidos),
  'prueba_apodo', public.generar_apodo(),
  'prueba_telefono', jsonb_build_object(
      '0291 15 512-3456', public.normalizar_telefono_ar('0291 15 512-3456'),
      '+54 9 291 512 3456', public.normalizar_telefono_ar('+54 9 291 512 3456'),
      '155123456', public.normalizar_telefono_ar('155123456'),
      '15512345', public.normalizar_telefono_ar('15512345'))
)) as verificacion;
