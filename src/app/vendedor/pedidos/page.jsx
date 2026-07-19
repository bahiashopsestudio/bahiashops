'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import VolverAtras from '@/components/VolverAtras';

const ESTADOS = {
  pendiente:   { label: 'Esperando pago',  color: '#8a6d00', bg: '#fff3d6', orden: 0 },
  pagado:      { label: 'Pagado',          color: '#1e7e46', bg: '#e9f7ef', orden: 1 },
  rechazado:   { label: 'Pago rechazado',  color: '#c0392b', bg: '#fdecea', orden: -1 },
  preparando:  { label: 'Preparando',      color: '#1a5fb4', bg: '#e6f0ff', orden: 2 },
  franja:      { label: 'Franja avisada',  color: '#7c3aed', bg: '#f3e8ff', orden: 3 },
  por_salir:   { label: 'Por salir',       color: '#d97706', bg: '#fff8e1', orden: 4 },
  despachado:  { label: 'Despachado',      color: '#1e7e46', bg: '#e9f7ef', orden: 5 },
};

const ACCIONES = {
  pagado: {
    label: 'Empezar a preparar',
    siguiente: 'preparando',
    color: '#1a5fb4',
    whatsapp: true,
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! 👋 Soy ${nombre}. Ya estamos preparando tu pedido #${p.id}. ¡Te avisamos cuando esté por salir!`,
  },
  preparando: {
    label: 'Avisar franja horaria',
    siguiente: 'franja',
    color: '#7c3aed',
    whatsapp: true,
    pideFranja: true,
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! Soy ${nombre}. Tu pedido #${p.id} sale hoy por la ${franja.toLowerCase()}. Lo enviamos a ${p.direccion?.calle} ${p.direccion?.numero}. ¡Estate atento/a!`,
  },
  franja: {
    label: 'Avisar que sale',
    siguiente: 'por_salir',
    color: '#d97706',
    whatsapp: true,
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! 🚀 Soy ${nombre}. Tu pedido #${p.id} ya está saliendo hacia ${p.direccion?.calle} ${p.direccion?.numero}. ¡Ya llega!`,
  },
  por_salir: {
    label: 'Marcar como despachado',
    siguiente: 'despachado',
    color: '#1e7e46',
    whatsapp: false,
    // Acá iría el email cuando lo configuremos
  },
};

function tiempoRelativo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs}h`;
  const dias = Math.floor(hs / 24);
  return `hace ${dias}d`;
}

function fmt(n) {
  return Number(n).toLocaleString('es-AR');
}

function abrirWhatsApp(telefono, mensaje) {
  if (!telefono) return;
  const tel = telefono.replace(/\D/g, '');
  const telCompleto = tel.startsWith('54') ? tel : `54${tel}`;
  window.open(`https://wa.me/${telCompleto}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

export default function VendedorPedidosPage() {
  const supabase = createClient();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [detalles, setDetalles] = useState({});
  const [avanzando, setAvanzando] = useState(null);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [franjaModal, setFranjaModal] = useState(null);
  const [franjaElegida, setFranjaElegida] = useState('Mañana');

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('No hay sesión iniciada.'); setCargando(false); return; }

      const { data: vendedor } = await supabase
        .from('vendedores')
        .select('id, nombre_negocio')
        .eq('usuario_id', user.id)
        .single();

      if (!vendedor) { setError('No se encontró tu cuenta de vendedor.'); setCargando(false); return; }
      setNombreNegocio(vendedor.nombre_negocio || '');

      const { data, error: errPedidos } = await supabase
        .from('pedidos')
        .select(`
          id, estado, metodo_envio, subtotal_productos, costo_envio, total,
          comision_plataforma, turno_preferido, creado_en, actualizado_en,
          direccion:direcciones ( calle, numero, piso_depto, telefono, barrio_id )
        `)
        .eq('vendedor_id', vendedor.id)
        .order('creado_en', { ascending: false });

      if (errPedidos) { setError('No se pudieron cargar los pedidos.'); console.error(errPedidos); }
      else setPedidos(data || []);

      setCargando(false);
    }
    cargar();
  }, []);

  async function toggleDetalle(pedidoId) {
    if (abierto === pedidoId) { setAbierto(null); return; }
    setAbierto(pedidoId);

    if (!detalles[pedidoId]) {
      const { data } = await supabase
        .from('pedido_items')
        .select('*')
        .eq('pedido_id', pedidoId);
      if (data) setDetalles(prev => ({ ...prev, [pedidoId]: data }));
    }
  }

  function iniciarAvance(pedido) {
    const accion = ACCIONES[pedido.estado];
    if (!accion) return;

    if (accion.pideFranja) {
      setFranjaModal(pedido);
      setFranjaElegida('Mañana');
      return;
    }

    ejecutarAvance(pedido);
  }

  async function ejecutarAvance(pedido, franja) {
    const accion = ACCIONES[pedido.estado];
    if (!accion) return;

    setAvanzando(pedido.id);
    setFranjaModal(null);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: accion.siguiente, actualizado_en: new Date().toISOString() })
      .eq('id', pedido.id);

    if (error) {
      alert('No se pudo actualizar el estado: ' + error.message);
    } else {
      setPedidos(prev =>
        prev.map(p => p.id === pedido.id ? { ...p, estado: accion.siguiente } : p)
      );

      if (accion.whatsapp && pedido.direccion?.telefono) {
        const mensaje = accion.mensajeWA(pedido, franja, nombreNegocio);
        abrirWhatsApp(pedido.direccion.telefono, mensaje);
      }
    }

    setAvanzando(null);
  }

  if (cargando) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando pedidos...</main>;
  }

  if (error) {
    return (
      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <VolverAtras href="/perfil" texto="Mi perfil" />
        <p style={{ color: '#c00' }}>{error}</p>
      </main>
    );
  }

  const activos = pedidos.filter(p => ['pagado', 'preparando', 'franja', 'por_salir'].includes(p.estado));
  const completados = pedidos.filter(p => ['despachado', 'rechazado', 'pendiente'].includes(p.estado));

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
      <VolverAtras href="/perfil" texto="Mi perfil" />

      <h1 style={{ margin: '0 0 0.25rem' }}>Pedidos de mi negocio</h1>
      <p style={{ color: '#666', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>
        {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'} en total
      </p>

      {pedidos.length === 0 && (
        <div style={{ border: '1px dashed #ccc', borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center', color: '#666' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>📦</p>
          <p style={{ margin: 0 }}>Todavía no recibiste pedidos. ¡Van a llegar!</p>
        </div>
      )}

      {activos.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', color: '#666', margin: '0 0 0.75rem' }}>
            Pedidos activos ({activos.length})
          </h2>
          {activos.map(p => (
            <PedidoCard
              key={p.id} pedido={p} abierto={abierto === p.id}
              items={detalles[p.id] || []} avanzando={avanzando === p.id}
              onToggle={() => toggleDetalle(p.id)} onAvanzar={() => iniciarAvance(p)}
            />
          ))}
        </>
      )}

      {completados.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', color: '#999', margin: '1.5rem 0 0.75rem' }}>
            Historial ({completados.length})
          </h2>
          {completados.map(p => (
            <PedidoCard
              key={p.id} pedido={p} abierto={abierto === p.id}
              items={detalles[p.id] || []} avanzando={avanzando === p.id}
              onToggle={() => toggleDetalle(p.id)} onAvanzar={() => iniciarAvance(p)}
            />
          ))}
        </>
      )}

      {franjaModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={() => setFranjaModal(null)}
        >
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', maxWidth: '380px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>¿En qué franja sale?</h3>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 1rem' }}>
              Le avisamos al comprador en qué horario esperar el envío.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {['Mañana', 'Tarde'].map(f => (
                <button key={f} type="button" onClick={() => setFranjaElegida(f)}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer',
                    border: franjaElegida === f ? '2px solid #7c3aed' : '1px solid #ddd',
                    background: franjaElegida === f ? '#f3e8ff' : 'white',
                    color: franjaElegida === f ? '#7c3aed' : '#666',
                    fontWeight: franjaElegida === f ? 600 : 400, fontSize: '0.95rem',
                  }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => setFranjaModal(null)}
                style={{ flex: 1, padding: '0.7rem', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="button" onClick={() => ejecutarAvance(franjaModal, franjaElegida)}
                style={{ flex: 1, padding: '0.7rem', border: 'none', borderRadius: '8px', background: '#7c3aed', color: 'white', cursor: 'pointer', fontWeight: 500 }}>
                Avisar por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PedidoCard({ pedido, abierto, items, avanzando, onToggle, onAvanzar }) {
  const p = pedido;
  const estado = ESTADOS[p.estado] || { label: p.estado, color: '#666', bg: '#f5f5f5' };
  const accion = ACCIONES[p.estado];
  const primerItem = items[0];

  return (
    <div style={{ border: '1px solid #e3e3e3', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem', background: '#fff' }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#f5f5f5', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '1.2rem' }}>
            {primerItem?.foto_url ? (
              <img src={primerItem.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : '📦'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.95rem' }}>Pedido #{p.id}</strong>
              <span style={{ fontSize: '0.75rem', fontWeight: 500, padding: '3px 10px', borderRadius: '20px', background: estado.bg, color: estado.color }}>
                {estado.label}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#666' }}>
              {p.metodo_envio} · {tiempoRelativo(p.creado_en)}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>${fmt(p.total)}</div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>{abierto ? 'Ocultar ▲' : 'Ver detalle ▼'}</div>
          </div>
        </div>
      </div>

      {abierto && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#888' }}>Productos</p>
            {items.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: '#aaa' }}>Cargando...</p>
            ) : items.map(it => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', fontSize: '0.9rem', color: '#555' }}>
                <span>{it.nombre}{it.variante ? ` · ${it.variante}` : ''} × {it.cantidad}</span>
                <span>${fmt(it.precio * it.cantidad)}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.85rem', color: '#888' }}>Entrega</p>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>{p.metodo_envio}</p>
            {p.turno_preferido && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#888' }}>Preferencia del comprador: {p.turno_preferido.toLowerCase()}</p>
            )}
            {p.direccion && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#555' }}>
                {p.direccion.calle} {p.direccion.numero}{p.direccion.piso_depto ? `, ${p.direccion.piso_depto}` : ''}<br />
                Tel. {p.direccion.telefono}
              </p>
            )}
          </div>

          <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #eee', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.15rem 0' }}>
              <span style={{ color: '#666' }}>Productos</span><span>${fmt(p.subtotal_productos)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.15rem 0' }}>
              <span style={{ color: '#666' }}>Envío</span><span>${fmt(p.costo_envio)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.15rem 0', color: '#888' }}>
              <span>Comisión Bahía Shops (5%)</span><span>-${fmt(p.comision_plataforma)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 600, padding: '0.4rem 0 0', borderTop: '1px solid #eee', marginTop: '0.25rem' }}>
              <span>Recibís</span><span>${fmt(p.total - (p.comision_plataforma || 0))}</span>
            </div>
          </div>

          {accion && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAvanzar(); }} disabled={avanzando}
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', border: 'none', borderRadius: '8px', cursor: avanzando ? 'not-allowed' : 'pointer', background: avanzando ? '#ccc' : accion.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              {accion.whatsapp && (
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.564l4.72-1.236A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6c-2.07 0-4.046-.54-5.795-1.56l-.42-.25-2.8.735.747-2.73-.27-.43A9.554 9.554 0 0 1 2.4 12c0-5.302 4.298-9.6 9.6-9.6 5.302 0 9.6 4.298 9.6 9.6 0 5.302-4.298 9.6-9.6 9.6z"/>
                </svg>
              )}
              {avanzando ? 'Actualizando...' : accion.label}
            </button>
          )}

          {p.estado === 'despachado' && (
            <div style={{ textAlign: 'center', padding: '0.75rem', background: '#e9f7ef', borderRadius: '8px', color: '#1e7e46', fontWeight: 500, fontSize: '0.9rem' }}>
              ✓ Pedido completado
            </div>
          )}
        </div>
      )}
    </div>
  );
}
