-- ============================================================================
-- Bahía Shops · 040 · Qué haría la PRIMERA corrida de la tarea diaria
-- Solo lee: no cambia nada. Una sola consulta, sin bloques. Se corre en el
-- SQL Editor de Supabase ANTES de la 040 (usa solo columnas que ya existen).
--
-- Una fila por pedido o cuenta. Columnas:
--   · que           aviso_14_dias | recordatorio | renovar_mp | vencido
--   · total         cuántas filas hay de ese «que» (sin la fecha de corte)
--   · con_corte     cuántas quedan con la fecha de corte (solo aviso_14_dias;
--                   en las otras es igual a total)
--   · cual          el pedido, o la tienda y la cuenta de MP
--   · entra_con_corte  aviso_14_dias: true si cumple 14 días justo en la
--                   primera corrida (pagado hace 14 a 15 días), o sea si le
--                   llegaría igual con la fecha de corte
--   · dias          días desde el pago (pedidos) o hasta el vencimiento del
--                   token (renovar_mp; negativo = ya venció)
--
-- Las reglas:
--   · aviso_14_dias  pagado hace 14 a 21 días, sin entregar, sin reseña,
--                    sin invitación.
--   · recordatorio   con invitación hace 7 días o más (hoy, solo puede ser
--                    el «¿Cómo te fue?»), sin reseña, y le quedan 3 días o
--                    más de ventana (la de src/lib/resenas.js: pago + 44, o
--                    entregado + 30, la que termine más tarde). Sin corte.
--   · renovar_mp     token que vence en 30 días o menos (o ya venció), de
--                    una tienda sin cerrar (las pausadas, sí).
--   · vencido        lo que cancelaría cancelar_pedidos_vencidos.
-- Quedan afuera de los mails: cancelados, reembolsados (no están en la lista
-- de estados), tiendas cerradas y cuentas eliminadas.
-- ============================================================================
with resenables as (
  select p.id, p.estado, p.pagado_en, p.entregado_at, p.aviso_resena_en,
         v.nombre_negocio as tienda,
         greatest(p.pagado_en + interval '44 days',
                  coalesce(p.entregado_at + interval '30 days', p.pagado_en + interval '44 days')) as ventana_hasta
    from public.pedidos p
    join public.vendedores v on v.id = p.vendedor_id
    join public.usuarios u on u.id = p.comprador_id
   where p.estado in ('pagado', 'preparando', 'franja', 'por_salir', 'despachado',
                      'listo', 'acordado', 'entregado')
     and p.pagado_en is not null
     and v.cerrada_en is null
     and u.cerrada_en is null
     and u.email !~* '\.invalid$'
     and not exists (select 1 from public.resenas r where r.pedido_id = p.id)
),
filas as (
  select 'aviso_14_dias' as que, id::text as cual, tienda, estado,
         pagado_en, entregado_at, aviso_resena_en, ventana_hasta as hasta,
         (pagado_en > now() - interval '15 days') as entra_con_corte,
         date_part('day', now() - pagado_en)::int as dias
    from resenables
   where entregado_at is null
     and aviso_resena_en is null
     and pagado_en <= now() - interval '14 days'
     and pagado_en >  now() - interval '21 days'

  union all
  select 'recordatorio', id::text, tienda, estado,
         pagado_en, entregado_at, aviso_resena_en, ventana_hasta,
         true,
         date_part('day', now() - pagado_en)::int
    from resenables
   where aviso_resena_en is not null
     and aviso_resena_en <= now() - interval '7 days'
     and ventana_hasta - now() >= interval '3 days'

  union all
  select 'renovar_mp', 'tienda ' || v.id || ' · cuenta ' || coalesce(m.mp_user_id::text, '?'),
         v.nombre_negocio,
         case when v.pausada_en is not null then 'pausada' else 'activa' end,
         null, null, null, m.token_expira_en,
         true,
         floor(extract(epoch from m.token_expira_en - now()) / 86400)::int
    from public.mercadopago_cuentas m
    join public.vendedores v on v.id = m.vendedor_id
   where v.cerrada_en is null
     and m.token_expira_en <= now() + interval '30 days'

  union all
  select 'vencido', p.id::text, v.nombre_negocio, p.estado,
         null, null, null, coalesce(p.efectivo_vence_en + interval '6 hours', p.vence_en),
         true,
         null
    from public.pedidos p
    join public.vendedores v on v.id = p.vendedor_id
   where p.estado = 'pendiente'
     and (
       (p.efectivo_vence_en is not null and p.efectivo_vence_en + interval '6 hours' < now())
       or (
         p.efectivo_vence_en is null
         and p.vence_en is not null
         and p.vence_en < now()
         and coalesce(btrim(p.mp_payment_id), '') in ('', 'null', 'undefined')
       )
     )
)
select que,
       count(*) over (partition by que) as total,
       count(*) filter (where entra_con_corte) over (partition by que) as con_corte,
       cual, tienda, estado, entra_con_corte, dias,
       pagado_en, entregado_at, aviso_resena_en as invitacion_en, hasta
  from filas
 order by que, dias desc nulls last, cual;
