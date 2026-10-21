-- ============================================================================
-- Bahía Shops · 040 · Probar la tarea diaria en local
-- Cada PASO se corre por separado en el SQL Editor de Supabase, en orden.
-- Sin bloques do $$. La base es la real (hay una sola): todo lo de prueba
-- lleva 'PRUEBA TAREA' en vendedor_nombre y comprador_nombre, y el PASO 5 lo
-- borra.
-- ============================================================================


-- ── PASO 1 · Los cuatro pedidos de prueba (tienda 18, tu cuenta compra) ─────
-- Si tu cuenta de compradora tiene otro mail, cambialo abajo.
--   a. día 15, sin entregar      → aviso de los 14 días + aviso en el panel
--   b. día 25, sin entregar      → sin aviso (pasó el día 21); sí en el panel
--   c. invitación hace 8 días    → recordatorio
--   d. invitación hace 8 días, con 1,5 días de ventana → sin recordatorio
insert into public.pedidos
  (comprador_id, vendedor_id, estado, metodo_envio, subtotal_productos, costo_envio, total, comision_plataforma,
   comprador_nombre, vendedor_nombre, creado_en, pagado_en, entregado_at, aviso_resena_en, aviso_resena_via)
select u.id, 18, x.estado, 'retiro', 1000, 0, 1000, 50, 'PRUEBA TAREA', 'PRUEBA TAREA',
       now() - x.pago, now() - x.pago, now() - x.entrega, now() - x.invitacion, x.via
  from public.usuarios u,
       (values
         ('preparando', interval '15 days',          null::interval,   null::interval,   null::text),
         ('preparando', interval '25 days',          null,             null,             null),
         ('entregado',  interval '10 days',          interval '8 days', interval '8 days', 'entregado'),
         ('despachado', interval '42 days 12 hours', null,             interval '8 days', '14_dias')
       ) as x(estado, pago, entrega, invitacion, via)
 where u.email = 'rosario.fuhr@gmail.com'
returning id, estado, pagado_en, entregado_at, aviso_resena_en, aviso_resena_via;


-- ── PASO 2 · Simular una renovación fallida de MercadoPago en la tienda 18 ──
-- Guarda el refresh_token y el vencimiento reales en privado.respaldo_mp_prueba
-- (no se ve desde la API) y pone un refresh_token inválido con el vencimiento
-- a 10 días. El access_token NO se toca: la tienda sigue cobrando (con 10 días,
-- la compra no intenta renovar). Si lo corrés dos veces, el respaldo sigue
-- siendo el original.
create table if not exists privado.respaldo_mp_prueba as
  select vendedor_id, refresh_token, token_expira_en
    from public.mercadopago_cuentas
   where vendedor_id = 18;

update public.mercadopago_cuentas
   set refresh_token = 'PRUEBA-TAREA-INVALIDO',
       token_expira_en = now() + interval '10 days'
 where vendedor_id = 18
   and exists (select 1 from privado.respaldo_mp_prueba where vendedor_id = 18);

select m.vendedor_id, m.refresh_token = 'PRUEBA-TAREA-INVALIDO' as simulada, m.token_expira_en,
       m.renovacion_fallida_en, m.aviso_renovacion_en, r.token_expira_en as vencimiento_real
  from public.mercadopago_cuentas m
  join privado.respaldo_mp_prueba r using (vendedor_id);


-- ── PASO 3 · Ver cómo quedó (después de correr la tarea) ─────────────────────
select id, estado, pagado_en::date, entregado_at::date, aviso_resena_en, aviso_resena_via, recordatorio_resena_en
  from public.pedidos
 where vendedor_nombre = 'PRUEBA TAREA' and comprador_nombre = 'PRUEBA TAREA'
 order by pagado_en desc;

select vendedor_id, renovacion_fallida_en, renovacion_error, aviso_renovacion_en
  from public.mercadopago_cuentas
 where vendedor_id = 18;


-- ── PASO 4 · Deshacer la simulación de MercadoPago ───────────────────────────
-- Vuelve a poner el refresh_token y el vencimiento reales. Como cambia el
-- refresh_token, la base limpia sola la marca (y el aviso de Mi negocio se
-- va). Si la tienda reconectó mientras tanto, no pisa nada.
update public.mercadopago_cuentas m
   set refresh_token = r.refresh_token,
       token_expira_en = r.token_expira_en
  from privado.respaldo_mp_prueba r
 where m.vendedor_id = r.vendedor_id
   and m.refresh_token = 'PRUEBA-TAREA-INVALIDO';

-- Tiene que dar: restaurada true, sin marca.
select m.vendedor_id,
       m.refresh_token = r.refresh_token and m.token_expira_en = r.token_expira_en as restaurada,
       m.renovacion_fallida_en, m.aviso_renovacion_en
  from public.mercadopago_cuentas m
  join privado.respaldo_mp_prueba r using (vendedor_id);

-- Recién con restaurada = true, borrar el respaldo (guarda un token):
-- drop table privado.respaldo_mp_prueba;


-- ── PASO 5 · Borrar todo lo de prueba y confirmar que quedó en 0 ─────────────
-- (Si dejaste una reseña en algún pedido de prueba, se borra con el pedido.)
-- El respaldo de MercadoPago NO se borra acá: se borra en el PASO 4, después
-- de restaurar (si se borrara sin restaurar, se perdería el refresh_token real).
delete from public.pedidos
 where vendedor_nombre = 'PRUEBA TAREA' and comprador_nombre = 'PRUEBA TAREA';

-- Tiene que dar todo 0 / false. Si cuentas_simuladas da 1, falta el PASO 4.
select
  (select count(*) from public.pedidos
    where vendedor_nombre = 'PRUEBA TAREA' or comprador_nombre = 'PRUEBA TAREA') as pedidos_de_prueba,
  (select count(*) from public.mercadopago_cuentas
    where refresh_token = 'PRUEBA-TAREA-INVALIDO') as cuentas_simuladas,
  (select count(*) from public.mercadopago_cuentas
    where vendedor_id = 18 and (renovacion_fallida_en is not null or aviso_renovacion_en is not null)) as marca_mp_18,
  to_regclass('privado.respaldo_mp_prueba') is not null as respaldo_sigue;
