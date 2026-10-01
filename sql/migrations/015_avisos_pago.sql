-- 015_avisos_pago.sql
-- Marca de "mail ya enviado" para el aviso de venta (al vendedor) y la
-- confirmación de compra (a quien compró). null = todavía no se mandó.
-- Se puede correr dos veces sin romper nada.

begin;

alter table public.pedidos
  add column if not exists aviso_vendedor_en  timestamptz,
  add column if not exists aviso_comprador_en timestamptz;

-- Los pedidos que ya pasaron por el pago se marcan como avisados, para que
-- ninguno viejo dispare mails si MercadoPago reenvía un aviso atrasado.
-- Los que siguen esperando el pago quedan en null: si se pagan más tarde
-- (un carrito abandonado que vuelve), el aviso sale normalmente.
update public.pedidos
set aviso_vendedor_en  = coalesce(aviso_vendedor_en,  now()),
    aviso_comprador_en = coalesce(aviso_comprador_en, now())
where estado in ('pagado', 'preparando', 'franja', 'por_salir',
                 'despachado', 'reembolsado', 'cancelado');

commit;

-- Verificación: cuántos quedaron marcados y cuántos esperan, por estado.
select estado,
       count(*) filter (where aviso_vendedor_en is null) as sin_aviso,
       count(*) filter (where aviso_vendedor_en is not null) as avisados
from public.pedidos
group by estado
order by estado;

-- Para deshacer:
-- alter table public.pedidos drop column aviso_vendedor_en, drop column aviso_comprador_en;
