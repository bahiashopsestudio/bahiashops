'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import VolverAtras from '@/components/VolverAtras';

// Cómo mostramos cada estado (nombre amigable y color).
// Preparado para los estados de pago Y los de despacho que van a venir.
const ESTADOS = {
  pendiente:  { label: 'Esperando pago',   color: '#b7791f', bg: '#fff8e1' },
  pagado:     { label: 'Pagado',           color: '#1e7e46', bg: '#e9f7ef' },
  rechazado:  { label: 'Pago rechazado',   color: '#c0392b', bg: '#fdecea' },
  preparando: { label: 'En preparación',   color: '#1a5fb4', bg: '#e6f0ff' },
  por_salir:  { label: 'Por salir',        color: '#1a5fb4', bg: '#e6f0ff' },
  despachado: { label: 'Despachado',       color: '#1e7e46', bg: '#e9f7ef' },
  franja:     { label: 'Sale pronto',     color: '#7c3aed', bg: '#f3e8ff' },
};

function EstadoChip({ estado }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#666', bg: '#f5f5f5' };
  return (
    <span style={{
      fontSize: '0.75rem', fontWeight: 500,
      background: cfg.bg, color: cfg.color,
      padding: '3px 10px', borderRadius: '20px',
    }}>
      {cfg.label}
    </span>
  );
}

function formatearFecha(iso) {
  const f = new Date(iso);
  return f.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmt(n) {
  return Number(n).toLocaleString('es-AR');
}

export default function MisPedidosPage() {
  const supabase = createClient();
  const router = useRouter();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null); // id del pedido desplegado
  const [detalles, setDetalles] = useState({}); // items ya cargados por pedido

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCargando(false); return; }

      // Traemos los pedidos del comprador y el nombre de cada vendedor de un saque.
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          id, estado, metodo_envio, subtotal_productos, costo_envio, total,
          creado_en, turno_preferido,
          vendedor:vendedores ( id, nombre_negocio ),
          direccion:direcciones ( calle, numero, piso_depto, telefono )
        `)
        .eq('comprador_id', user.id)
        .order('creado_en', { ascending: false });

      if (error) console.error('Error cargando pedidos:', error);
      else setPedidos(data || []);
      setCargando(false);
    }
    cargar();
  }, []);

  async function toggleDetalle(pedidoId) {
    // Si ya está abierto, lo cerramos.
    if (abierto === pedidoId) {
      setAbierto(null);
      return;
    }
    setAbierto(pedidoId);

    // Si nunca cargamos los items de este pedido, los pedimos ahora.
    if (!detalles[pedidoId]) {
      const { data, error } = await supabase
        .from('pedido_items')
        .select('*')
        .eq('pedido_id', pedidoId);
      if (!error) {
        setDetalles((actual) => ({ ...actual, [pedidoId]: data || [] }));
      }
    }
  }

  if (cargando) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>;
  }

  if (pedidos.length === 0) {
    return (
      <main style={{ padding: '2rem', maxWidth: '700px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
        <VolverAtras href="/perfil" texto="Volver a Mi perfil" />

        <h1>Mis pedidos</h1>
        <p style={{ color: '#666', marginTop: '1rem' }}>Todavía no hiciste ninguna compra.</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem', background: '#222', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Seguir mirando
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '700px', width: '100%', margin: '0 auto' }}>
      <VolverAtras href="/perfil" texto="Volver a Mi perfil" />
      <h1>Mis pedidos</h1>
      <p style={{ color: '#666', margin: '0.25rem 0 1.5rem' }}>
        {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}.
      </p>

      {pedidos.map((p) => {
        const estaAbierto = abierto === p.id;
        const items = detalles[p.id] || [];
        const primerItem = items[0];

        return (
          <div
            key={p.id}
            style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem' }}
          >
            {/* Cabecera clickeable */}
            <div
              onClick={() => toggleDetalle(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
            >
              {/* Miniatura del primer producto (si ya cargamos los items) */}
              <div style={{
                width: '48px', height: '48px', borderRadius: '8px', background: '#f5f5f5',
                flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#bbb', fontSize: '1.2rem',
              }}>
                {primerItem?.foto_url ? (
                  <img src={primerItem.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : '📦'}
              </div>

              {/* Info principal */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.95rem' }}>Pedido #{p.id}</strong>
                  <EstadoChip estado={p.estado} />
                </div>
                <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#666' }}>
                  {p.vendedor?.nombre_negocio || 'Vendedor'} · {formatearFecha(p.creado_en)}
                </p>
              </div>

              {/* Total y flechita */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>${fmt(p.total)}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>{estaAbierto ? 'Ocultar ▲' : 'Ver detalle ▼'}</div>
              </div>
            </div>

            {/* Detalle desplegable */}
            {estaAbierto && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                {/* Productos */}
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#888' }}>Productos</p>
                  {items.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: '#aaa' }}>Cargando productos...</p>
                  ) : (
                    items.map((it) => (
                      <div key={it.id} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '0.35rem 0', fontSize: '0.9rem', color: '#555',
                      }}>
                        <span>
                          {it.nombre}{it.variante ? ` · ${it.variante}` : ''} × {it.cantidad}
                        </span>
                        <span>${fmt(it.precio * it.cantidad)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Entrega */}
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ margin: '0 0 0.35rem', fontSize: '0.85rem', color: '#888' }}>Entrega</p>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>{p.metodo_envio}</p>
                  {p.turno_preferido && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#888' }}>
                      Preferencia: {p.turno_preferido.toLowerCase()}
                    </p>
                  )}
                  {p.direccion && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#555' }}>
                      {p.direccion.calle} {p.direccion.numero}
                      {p.direccion.piso_depto ? `, ${p.direccion.piso_depto}` : ''}<br />
                      Tel. {p.direccion.telefono}
                    </p>
                  )}
                </div>

                {/* Desglose */}
                <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.15rem 0' }}>
                    <span style={{ color: '#666' }}>Productos</span>
                    <span>${fmt(p.subtotal_productos)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.15rem 0' }}>
                    <span style={{ color: '#666' }}>Envío</span>
                    <span>${fmt(p.costo_envio)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 600, padding: '0.4rem 0 0', borderTop: '1px solid #eee', marginTop: '0.25rem' }}>
                    <span>Total</span>
                    <span>${fmt(p.total)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}