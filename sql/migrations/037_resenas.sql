-- ============================================================================
-- Bahía Shops · 037 · Reseñas a las tiendas (tanda A) (19/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. Solo AGREGA: tres
-- columnas, dos tablas, cinco disparadores y una policy, y le SACA a anon el
-- SELECT sobre usuarios (sección 7, aparte). El código de hoy no
-- conoce nada de esto y sigue igual (el disparador de pedidos solo completa
-- pagado_en). El código nuevo la necesita: Mis pedidos lee pagado_en, y los
-- listados, la tienda y la ficha de producto embeben puntajes_tiendas. Sin la
-- migración esas consultas fallan enteras (como la home con la 030).
--
-- Por qué: quien compró deja de 1 a 5 estrellas y un comentario opcional,
-- una reseña por pedido. Se ven en la página de la tienda, en las tarjetas,
-- en la ficha de producto y en el panel del vendedor. Rosario las modera
-- desde /admin/denuncias. Toda escritura pasa por el servidor (service_role):
-- el navegador no lee ni escribe resenas. Cuándo se puede reseñar lo decide
-- src/lib/resenas.js (una sola regla, para el servidor y las pantallas); la
-- base solo garantiza lo que no puede romperse nunca.
--
-- Qué deja hecho:
--   1. pedidos.pagado_en: cuándo se confirmó el pago (para "14 días desde el
--      pago"). Lo completa un disparador cuando el pedido pasa a 'pagado', por
--      cualquier camino (la escritura del webhook, un pedido revivido). Los
--      pedidos viejos que pasaron por el pago se completan con
--      coalesce(aviso_comprador_en, creado_en) (ver la nota en la sección).
--   2. pedidos.aviso_resena_en: el mail de «¿Cómo te fue?» sale una sola vez
--      (el mismo reclamo que aviso_listo_en, 036).
--   3. usuarios.apodo_actualizado_en: el apodo se cambia una vez cada 30
--      días. NULL = nunca lo cambió desde /perfil (el que asigna la base y el
--      primero de la bienvenida no cuentan): puede cambiarlo ya.
--   4. public.resenas: una fila por reseña. RLS activo y SIN permisos para
--      anon ni authenticated (convención de la 034, como denuncias_productos).
--        · una sola por pedido (UNIQUE): dos clics en «Publicar» dejan una.
--        · vendedor_id y comprador_id salen del pedido (disparador), no de
--          quien inserta.
--        · no se edita: estrellas, texto, pedido, tienda y fecha quedan fijos
--          (disparador). Solo cambian el estado de moderación, la revisión y
--          el dueño (a null, cuando cierra su cuenta).
--        · moderacion_avisos + revision_pendiente_desde: lo dudoso del filtro
--          se guarda igual y queda para mirar en /admin/denuncias, como
--          moderacion_avisos y revision_posterior_desde de productos (033).
--        · si la cuenta de quien reseñó se cierra, la reseña queda sin dueño
--          (comprador_id = null) y sigue contando. El pedido sigue apuntando
--          a la cuenta (cáscara de la 031): "sin dueño" es de la reseña.
--        · si se borra el pedido o la tienda (solo borrar_tienda_de_prueba,
--          031: cerrar una tienda no borra filas), la reseña se borra
--          (cascada).
--   5. public.puntajes_tiendas: cantidad y promedio de cada tienda, contando
--      solo las publicadas. Una tabla aparte y NO columnas de vendedores: un
--      disparador que escriba vendedores corre como postgres y dispararía
--      trg_vendedores_vuelta_a_revision (006). promedio es NULL con menos de 5
--      reseñas: ni la API lo devuelve antes de tiempo. Lectura pública
--      (SELECT para anon y authenticated), para embeberla en los listados.
--      Una tienda sin reseñas no tiene fila: el embed da null ("Tienda
--      nueva").
--   6. Disparadores: el que mantiene puntajes_tiendas (suma y resta, sin
--      recalcular), y el de cuenta cerrada (como el de la 035).
--   7. Aparte de las reseñas: usuarios deja de ser legible para anon. Hasta
--      hoy anon tenía SELECT de tabla sobre todas las columnas (mail,
--      teléfono, nombre, es_admin); lo único que lo frenaba era la RLS (la
--      única policy de usuarios, "Cada usuario lee su fila", es para
--      authenticated). Relevado el 19/10: ninguna lectura del código toca
--      usuarios sin sesión; las dos policies que la leen ("Admin modera
--      productos" y "Admin ve todos los productos", en productos) son solo
--      para authenticated; las funciones que la leen son todas SECURITY
--      DEFINER; ninguna vista la lee. authenticated queda como está.
--
-- Lo que NO hace:
--   · No toca los permisos de authenticated sobre usuarios (SELECT de tabla,
--     con la RLS de la fila propia).
--   · No pasa pedidos a permisos por columna: aviso_resena_en queda legible
--     para quien compró, en sus propios pedidos (inofensivo; pendiente
--     aparte, igual que aviso_listo_en).
--   · No reescribe ninguna función de la 031: las cascadas cubren
--     borrar_tienda_de_prueba, y cerrar_cuenta dispara el disparador de
--     usuarios.
-- ============================================================================

-- ============================================================================
-- PASO 0 (correr ANTES, aparte; no cambia nada)
-- ============================================================================
-- 0a. El tipo de vendedores.id y de pedidos.id. Tiene que dar integer y
--     bigint (resenas y puntajes_tiendas los apuntan con el mismo tipo; la
--     sección 0 de abajo lo vuelve a comprobar y frena la migración si no):
--
-- select c.relname as tabla, format_type(a.atttypid, a.atttypmod) as tipo
--   from pg_attribute a join pg_class c on c.oid = a.attrelid
--  where c.relnamespace = 'public'::regnamespace and c.relname in ('vendedores', 'pedidos')
--    and a.attname = 'id';
-- ============================================================================

begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 0. Los tipos de las claves (vendedores.id integer, pedidos.id bigint).
--    Las columnas que los apuntan usan el mismo tipo.
-- ---------------------------------------------------------------------------
do $$
declare
  v_vendedores text;
  v_pedidos text;
begin
  select format_type(atttypid, atttypmod) into v_vendedores
    from pg_attribute where attrelid = 'public.vendedores'::regclass and attname = 'id';
  select format_type(atttypid, atttypmod) into v_pedidos
    from pg_attribute where attrelid = 'public.pedidos'::regclass and attname = 'id';
  if v_vendedores is distinct from 'integer' or v_pedidos is distinct from 'bigint' then
    raise exception '037: vendedores.id es % y pedidos.id es %; esta migración espera integer y bigint. Avisá antes de seguir.',
      v_vendedores, v_pedidos;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. pedidos.pagado_en
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists pagado_en timestamptz;

-- Los pedidos que ya pasaron por el pago (los mismos estados que
-- ESTADOS_CON_PAGO de src/lib/pedidos.js). Los que nunca se pagaron
-- (pendiente, rechazado, cancelado) quedan en null.
--
-- NOTA: no hay una fecha de pago guardada. aviso_comprador_en es la del mail
-- de confirmación, que sale segundos después del pago; a los pedidos de antes
-- de la 015 se les puso la fecha en que se corrió la 015 (30/9), no la del
-- pago (hasta 8 días después de creado_en). Para esos queda una fecha más
-- tardía que la real: solo atrasa la habilitación por los 14 días, nunca la
-- adelanta. Sin aviso, creado_en (anterior o igual al pago).
update public.pedidos
   set pagado_en = coalesce(aviso_comprador_en, creado_en)
 where pagado_en is null
   and estado in ('pagado', 'preparando', 'franja', 'por_salir', 'despachado',
                  'listo', 'acordado', 'entregado', 'reembolsado');

-- De acá en adelante, la base la completa sola: al pasar a 'pagado' por
-- primera vez. No se pisa nunca (un pedido revivido que ya la tuviera la
-- conserva).
create or replace function privado.pedidos_marcar_pagado_en()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.estado = 'pagado'
     and old.estado is distinct from 'pagado'
     and new.pagado_en is null then
    new.pagado_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists marcar_pagado_en on public.pedidos;
create trigger marcar_pagado_en
  before update of estado on public.pedidos
  for each row execute function privado.pedidos_marcar_pagado_en();

-- ---------------------------------------------------------------------------
-- 2. pedidos.aviso_resena_en
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists aviso_resena_en timestamptz;

-- ---------------------------------------------------------------------------
-- 3. usuarios.apodo_actualizado_en
-- ---------------------------------------------------------------------------
alter table public.usuarios
  add column if not exists apodo_actualizado_en timestamptz;

-- ---------------------------------------------------------------------------
-- Permisos de las columnas nuevas. pedidos y usuarios tienen hoy SELECT de
-- tabla para authenticated, así que ya se leen; el grant queda explícito para
-- el día que pasen a permisos por columna: pagado_en lo lee Mis pedidos y
-- apodo_actualizado_en lo lee /perfil, las dos desde el navegador y de la
-- fila propia. aviso_resena_en no lleva grant (lo usa solo el servidor).
-- ---------------------------------------------------------------------------
grant select (pagado_en) on public.pedidos to authenticated;
grant select (apodo_actualizado_en) on public.usuarios to authenticated;

-- ---------------------------------------------------------------------------
-- 4. La tabla de reseñas
-- ---------------------------------------------------------------------------
create table if not exists public.resenas (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos(id) on delete cascade,
  vendedor_id integer not null references public.vendedores(id) on delete cascade,
  comprador_id uuid references public.usuarios(id) on delete set null,
  estrellas smallint not null,
  texto text,
  estado text not null default 'publicada',
  oculta_motivo text,
  oculta_en timestamptz,
  oculta_por uuid references public.usuarios(id) on delete set null,
  moderacion_avisos jsonb not null default '[]'::jsonb,
  revision_pendiente_desde timestamptz,
  revisada_en timestamptz,
  revisada_por uuid references public.usuarios(id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint resenas_un_pedido unique (pedido_id),
  constraint resenas_estrellas_validas
    check (estrellas between 1 and 5),
  -- Sin texto: null. Con texto: de 1 a 500 caracteres y sin espacios,
  -- tabulaciones ni saltos de línea sueltos al principio o al final.
  constraint resenas_texto_valido
    check (texto is null
           or (char_length(texto) between 1 and 500
               and texto = btrim(texto, E' \t\r\n'))),
  constraint resenas_estado_valido
    check (estado in ('publicada', 'oculta_por_moderacion')),
  constraint resenas_motivo_valido
    check (oculta_motivo is null
           or oculta_motivo in ('insultos', 'datos_personales', 'no_es_esta_compra', 'sin_compra_real')),
  -- Publicada: sin nada de la ocultación. Oculta: con motivo y fecha
  -- (oculta_por puede quedar null si se cierra la cuenta de quien la ocultó).
  constraint resenas_oculta_coherente
    check ((estado = 'publicada' and oculta_motivo is null and oculta_en is null and oculta_por is null)
           or (estado = 'oculta_por_moderacion' and oculta_motivo is not null and oculta_en is not null)),
  constraint resenas_avisos_lista
    check (jsonb_typeof(moderacion_avisos) = 'array')
);

-- La página de la tienda y el panel: las publicadas de una tienda, la más
-- nueva primero.
create index if not exists resenas_publicadas_por_tienda
  on public.resenas (vendedor_id, creado_en desc) where estado = 'publicada';
-- Mis pedidos (las de cada persona) y el disparador de cuenta cerrada.
create index if not exists resenas_por_comprador
  on public.resenas (comprador_id);
-- /admin/denuncias: las marcadas por el filtro, y las ocultas.
create index if not exists resenas_por_revisar
  on public.resenas (revision_pendiente_desde) where revision_pendiente_desde is not null;
create index if not exists resenas_ocultas
  on public.resenas (oculta_en desc) where estado = 'oculta_por_moderacion';

alter table public.resenas enable row level security;
-- Sin políticas a propósito: solo service_role (que ignora RLS).

-- La tienda y quien compró salen del pedido, no de quien inserta. Si el
-- servidor manda un comprador_id que no es el del pedido, es un error del
-- código: se frena en vez de corregirlo en silencio.
create or replace function privado.resenas_completar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido record;
begin
  select vendedor_id, comprador_id into v_pedido
    from public.pedidos where id = new.pedido_id;
  if not found then
    raise exception 'La reseña apunta a un pedido que no existe.' using errcode = '23503';
  end if;
  if new.comprador_id is not null and new.comprador_id is distinct from v_pedido.comprador_id then
    raise exception 'La reseña no es de quien hizo el pedido.' using errcode = '22023';
  end if;
  new.vendedor_id := v_pedido.vendedor_id;
  new.comprador_id := v_pedido.comprador_id;
  return new;
end;
$$;

drop trigger if exists resenas_completar on public.resenas;
create trigger resenas_completar
  before insert on public.resenas
  for each row execute function privado.resenas_completar();

-- Una reseña publicada no se edita: ni por el servidor ni a mano. comprador_id
-- solo puede pasar a null (cuenta cerrada).
create or replace function privado.resenas_no_se_editan()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.pedido_id   is distinct from old.pedido_id
     or new.vendedor_id is distinct from old.vendedor_id
     or new.estrellas   is distinct from old.estrellas
     or new.texto       is distinct from old.texto
     or new.creado_en   is distinct from old.creado_en
     or new.moderacion_avisos is distinct from old.moderacion_avisos
     or (new.comprador_id is distinct from old.comprador_id and new.comprador_id is not null) then
    raise exception 'Una reseña no se puede editar.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists resenas_no_se_editan on public.resenas;
create trigger resenas_no_se_editan
  before update on public.resenas
  for each row execute function privado.resenas_no_se_editan();

-- ---------------------------------------------------------------------------
-- 5. El puntaje de cada tienda
-- ---------------------------------------------------------------------------
create table if not exists public.puntajes_tiendas (
  vendedor_id integer primary key references public.vendedores(id) on delete cascade,
  cantidad integer not null default 0,
  suma integer not null default 0,
  -- Un decimal, y solo desde las 5 reseñas.
  promedio numeric(2,1) generated always as (
    case when cantidad >= 5 then round(suma::numeric / cantidad, 1) end
  ) stored,
  actualizado_en timestamptz not null default now(),
  constraint puntajes_cantidad_valida check (cantidad >= 0),
  constraint puntajes_suma_valida check (suma between cantidad and cantidad * 5)
);

alter table public.puntajes_tiendas enable row level security;

-- Números públicos: se embeben debajo de vendedores, que ya filtra qué tienda
-- se muestra.
drop policy if exists "Puntajes públicos" on public.puntajes_tiendas;
create policy "Puntajes públicos" on public.puntajes_tiendas
  for select
  to anon, authenticated
  using (true);

-- Cada reseña suma o resta a su tienda; no se recalcula todo. El
-- insert ... on conflict bloquea la fila: dos reseñas a la vez de la misma
-- tienda no se pisan. Al restar, si la tienda ya no está (se está borrando
-- una tienda de prueba: la fila de puntajes cae por cascada), no hay nada que
-- restar.
create or replace function privado.resenas_actualizar_puntaje()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.estado = 'publicada'
     and (tg_op = 'DELETE' or new.estado <> 'publicada') then
    update public.puntajes_tiendas
       set cantidad = cantidad - 1,
           suma = suma - old.estrellas,
           actualizado_en = now()
     where vendedor_id = old.vendedor_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.estado = 'publicada'
     and (tg_op = 'INSERT' or old.estado <> 'publicada') then
    insert into public.puntajes_tiendas as p (vendedor_id, cantidad, suma)
    values (new.vendedor_id, 1, new.estrellas)
    on conflict (vendedor_id) do update
      set cantidad = p.cantidad + 1,
          suma = p.suma + excluded.suma,
          actualizado_en = now();
  end if;

  return null;
end;
$$;

drop trigger if exists resenas_actualizar_puntaje on public.resenas;
create trigger resenas_actualizar_puntaje
  after insert or delete or update of estado on public.resenas
  for each row execute function privado.resenas_actualizar_puntaje();

-- ---------------------------------------------------------------------------
-- 6. Cuenta cerrada: sus reseñas quedan sin dueño (y siguen contando)
-- ---------------------------------------------------------------------------
-- Como el de la 035: cerrar_cuenta (016/031) pone cerrada_en y deja la
-- cáscara anónima. Lo mismo con quien ocultó o revisó una reseña.
create or replace function privado.resenas_sin_duena_al_cerrar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.cerrada_en is not null and old.cerrada_en is null then
    update public.resenas set comprador_id = null where comprador_id = new.id;
    update public.resenas set oculta_por = null where oculta_por = new.id;
    update public.resenas set revisada_por = null where revisada_por = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists resenas_sin_duena_al_cerrar_cuenta on public.usuarios;
create trigger resenas_sin_duena_al_cerrar_cuenta
  after update of cerrada_en on public.usuarios
  for each row execute function privado.resenas_sin_duena_al_cerrar_cuenta();

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- resenas: solo el servidor.
revoke all on table public.resenas from public, anon, authenticated;
grant select, insert, update, delete on table public.resenas to service_role;

-- puntajes_tiendas: lectura pública; escribe solo el disparador.
revoke all on table public.puntajes_tiendas from public, anon, authenticated;
grant select on table public.puntajes_tiendas to anon, authenticated;
grant select, insert, update, delete on table public.puntajes_tiendas to service_role;

-- Las funciones de los disparadores no las llama nadie a mano.
revoke all on function privado.pedidos_marcar_pagado_en()            from public, anon, authenticated;
revoke all on function privado.resenas_completar()                   from public, anon, authenticated;
revoke all on function privado.resenas_no_se_editan()                from public, anon, authenticated;
revoke all on function privado.resenas_actualizar_puntaje()          from public, anon, authenticated;
revoke all on function privado.resenas_sin_duena_al_cerrar_cuenta()  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. usuarios: anon deja de poder leerla (aparte de las reseñas)
-- ---------------------------------------------------------------------------
-- Ver el punto 7 del encabezado. Si algo sin sesión la leyera, desde ahora
-- daría 42501 (permission denied) en vez de 0 filas: el error queda en el
-- log de Vercel. El apodo público de las reseñas lo lee el servidor con
-- service_role, no anon. Solo anon: authenticated queda como está.
revoke select on table public.usuarios from anon;

-- Postgres ya saca los permisos por columna con el revoke de tabla ("the
-- corresponding column privileges (if any) are automatically revoked on each
-- column of the table, as well", documentación de REVOKE). Este bucle queda
-- de resguardo: los saca columna por columna, todas las que existan, y la
-- verificación lo confirma con has_any_column_privilege.
do $$
declare
  c record;
begin
  for c in
    select attname
      from pg_attribute
     where attrelid = 'public.usuarios'::regclass
       and attnum > 0
       and not attisdropped
     order by attnum
  loop
    execute format('revoke select (%I) on public.usuarios from anon', c.attname);
  end loop;
end
$$;

-- Para que la API vea las tablas nuevas sin esperar.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · tipos: las tres columnas nuevas timestamptz; vendedores.id,
--     resenas.vendedor_id y puntajes_tiendas.vendedor_id: integer;
--     pedidos.id y resenas.pedido_id: bigint.
--   · rls: true en las cinco tablas.
--   · permisos_resenas: anon y authenticated vacíos; service_role con
--     DELETE, INSERT, SELECT, UPDATE.
--   · permisos_puntajes: anon y authenticated solo SELECT.
--   · policy_puntajes: true.
--   · disparadores: los cinco true.
--   · pagados_sin_pagado_en: 0. no_pagados_con_pagado_en: 0.
--   · resenas y puntajes: 0 (recién creadas). puntajes_descuadrados: 0.
--   · usuarios_anon_select: false. usuarios_anon_alguna_columna: false.
--     usuarios_authenticated_select: true.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'tipos', jsonb_build_object(
      'pedidos.pagado_en',               (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'pedidos'  and column_name = 'pagado_en'),
      'pedidos.aviso_resena_en',         (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'pedidos'  and column_name = 'aviso_resena_en'),
      'usuarios.apodo_actualizado_en',   (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'usuarios' and column_name = 'apodo_actualizado_en'),
      'vendedores.id',                   (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'vendedores' and column_name = 'id'),
      'pedidos.id',                      (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'pedidos' and column_name = 'id'),
      'resenas.vendedor_id',             (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'resenas' and column_name = 'vendedor_id'),
      'resenas.pedido_id',               (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'resenas' and column_name = 'pedido_id'),
      'puntajes_tiendas.vendedor_id',    (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'puntajes_tiendas' and column_name = 'vendedor_id')),
  'rls', (select jsonb_object_agg(c.relname, c.relrowsecurity)
            from pg_class c
           where c.relnamespace = 'public'::regnamespace
             and c.relname in ('usuarios', 'pedidos', 'vendedores', 'resenas', 'puntajes_tiendas')),
  'permisos_resenas', (select jsonb_object_agg(r.rol, coalesce((
        select string_agg(a.privilege_type, ', ' order by a.privilege_type)
          from pg_class c, aclexplode(c.relacl) a
         where c.oid = 'public.resenas'::regclass and a.grantee = r.rol::regrole), ''))
      from unnest(array['anon', 'authenticated', 'service_role']) as r(rol)),
  'permisos_puntajes', (select jsonb_object_agg(r.rol, coalesce((
        select string_agg(a.privilege_type, ', ' order by a.privilege_type)
          from pg_class c, aclexplode(c.relacl) a
         where c.oid = 'public.puntajes_tiendas'::regclass and a.grantee = r.rol::regrole), ''))
      from unnest(array['anon', 'authenticated', 'service_role']) as r(rol)),
  'policy_puntajes', exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'puntajes_tiendas' and policyname = 'Puntajes públicos'),
  'disparadores', (select jsonb_object_agg(t.nombre, exists (select 1 from pg_trigger where tgname = t.nombre and not tgisinternal))
                     from unnest(array['marcar_pagado_en', 'resenas_completar', 'resenas_no_se_editan',
                                       'resenas_actualizar_puntaje', 'resenas_sin_duena_al_cerrar_cuenta']) as t(nombre)),
  'pagados_sin_pagado_en', (select count(*) from public.pedidos
                             where pagado_en is null
                               and estado in ('pagado', 'preparando', 'franja', 'por_salir', 'despachado',
                                              'listo', 'acordado', 'entregado', 'reembolsado')),
  'no_pagados_con_pagado_en', (select count(*) from public.pedidos
                                where pagado_en is not null and estado in ('pendiente', 'rechazado', 'cancelado')),
  'usuarios_anon_select',          has_table_privilege('anon', 'public.usuarios', 'select'),
  'usuarios_anon_alguna_columna',  has_any_column_privilege('anon', 'public.usuarios', 'select'),
  'usuarios_authenticated_select', has_table_privilege('authenticated', 'public.usuarios', 'select'),
  'resenas', (select count(*) from public.resenas),
  'puntajes', (select count(*) from public.puntajes_tiendas),
  'puntajes_descuadrados', (select count(*) from (
        select coalesce(p.vendedor_id, r.vendedor_id) as vendedor_id
          from public.puntajes_tiendas p
          full join (select vendedor_id, count(*) as cantidad, sum(estrellas) as suma
                       from public.resenas where estado = 'publicada' group by vendedor_id) r
            on r.vendedor_id = p.vendedor_id
         where coalesce(p.cantidad, 0) <> coalesce(r.cantidad, 0)
            or coalesce(p.suma, 0) <> coalesce(r.suma, 0)) d)
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Se pierden las reseñas guardadas y
-- las fechas de pago completadas. Con el código nuevo publicado, Mis pedidos,
-- los listados con puntaje, la tienda y la ficha de producto dejan de andar
-- (con error visible): despublicar el código antes. La primera línea le
-- devuelve a anon el SELECT sobre usuarios (sección 7); se puede correr sola
-- si solo hiciera falta deshacer eso.
-- ============================================================================
-- begin;
-- grant select on table public.usuarios to anon;
-- drop trigger if exists resenas_sin_duena_al_cerrar_cuenta on public.usuarios;
-- drop trigger if exists marcar_pagado_en on public.pedidos;
-- drop table if exists public.puntajes_tiendas;
-- drop table if exists public.resenas;
-- drop function if exists privado.resenas_sin_duena_al_cerrar_cuenta();
-- drop function if exists privado.resenas_actualizar_puntaje();
-- drop function if exists privado.resenas_no_se_editan();
-- drop function if exists privado.resenas_completar();
-- drop function if exists privado.pedidos_marcar_pagado_en();
-- revoke select (apodo_actualizado_en) on public.usuarios from authenticated;
-- revoke select (pagado_en) on public.pedidos from authenticated;
-- alter table public.usuarios drop column if exists apodo_actualizado_en;
-- alter table public.pedidos drop column if exists aviso_resena_en;
-- alter table public.pedidos drop column if exists pagado_en;
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
