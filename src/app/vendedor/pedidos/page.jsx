'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import VolverAtras from '@/components/VolverAtras';

const ESTADOS = {
  pendiente:  { label: 'Esperando pago',  color: 'text-amber-700',   bg: 'bg-amber-100',   orden: 0 },
  pagado:     { label: 'Pagado',           color: 'text-emerald-700', bg: 'bg-emerald-100',  orden: 1 },
  rechazado:  { label: 'Pago rechazado',   color: 'text-red-600',     bg: 'bg-red-50',       orden: -1 },
  preparando: { label: 'Preparando',       color: 'text-blue-700',    bg: 'bg-blue-50',      orden: 2 },
  franja:     { label: 'Franja avisada',   color: 'text-violet-600',  bg: 'bg-violet-100',   orden: 3 },
  por_salir:  { label: 'Por salir',        color: 'text-amber-600',   bg: 'bg-amber-50',     orden: 4 },
  despachado: { label: 'Despachado',       color: 'text-emerald-700', bg: 'bg-emerald-100',  orden: 5 },
};

const ACCIONES = {
  pagado: {
    label: 'Empezar a preparar',
    siguiente: 'preparando',
    btnClass: 'bg-blue-700 hover:bg-blue-800',
    whatsapp: true,
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! 👋 Soy ${nombre}. Ya estamos preparando tu pedido #${p.id}. ¡Te avisamos cuando esté por salir!`,
  },
  preparando: {
    label: 'Avisar franja horaria',
    siguiente: 'franja',
    btnClass: 'bg-violet-600 hover:bg-violet-700',
    whatsapp: true,
    pideFranja: true,
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! Soy ${nombre}. Tu pedido #${p.id} sale hoy por la ${franja.toLowerCase()}. Lo enviamos a ${p.direccion?.calle} ${p.direccion?.numero}. ¡Estate atento/a!`,
  },
  franja: {
    label: 'Avisar que sale',
    siguiente: 'por_salir',
    btnClass: 'bg-amber-600 hover:bg-amber-700',
    whatsapp: true,
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! 🚀 Soy ${nombre}. Tu pedido #${p.id} ya está saliendo hacia ${p.direccion?.calle} ${p.direccion?.numero}. ¡Ya llega!`,
  },
  por_salir: {
    label: 'Marcar como despachado',
    siguiente: 'despachado',
    btnClass: 'bg-emerald-700 hover:bg-emerald-800',
    whatsapp: false,
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

      if (accion.siguiente === 'despachado') {
        try {
          const resEmail = await fetch('/api/notificaciones/despacho', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pedidoId: pedido.id }),
          });
          if (!resEmail.ok) {
            alert('El pedido se marcó como despachado, pero no se pudo enviar el email al comprador. Podés avisarle por WhatsApp.');
          }
        } catch {
          alert('El pedido se marcó como despachado, pero no se pudo enviar el email al comprador. Podés avisarle por WhatsApp.');
        }
      }

      if (accion.whatsapp && pedido.direccion?.telefono) {
        const mensaje = accion.mensajeWA(pedido, franja, nombreNegocio);
        abrirWhatsApp(pedido.direccion.telefono, mensaje);
      }
    }

    setAvanzando(null);
  }

  // ── Estados de carga y error ──

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-gray-400">Cargando pedidos...</main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 max-w-[800px] mx-auto">
          <VolverAtras href="/perfil" texto="Mi perfil" />
          <p className="text-red-700">{error}</p>
        </main>
      </>
    );
  }

  const activos = pedidos.filter(p => ['pagado', 'preparando', 'franja', 'por_salir'].includes(p.estado));
  const completados = pedidos.filter(p => ['despachado', 'rechazado', 'pendiente'].includes(p.estado));

  return (
    <>
      <Navbar variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[800px] w-full mx-auto">
        <VolverAtras href="/perfil" texto="Mi perfil" />

        <h1 className="text-2xl font-semibold text-[#0a0a0a] m-0 mb-1">Pedidos de mi negocio</h1>
        <p className="text-gray-500 text-sm m-0 mb-6">
          {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'} en total
        </p>

        {/* Estado vacío */}
        {pedidos.length === 0 && (
          <div className="border border-dashed border-gray-300 rounded-xl px-8 py-12 text-center text-gray-500">
            <p className="text-3xl m-0 mb-2">📦</p>
            <p className="m-0">Todavía no recibiste pedidos. ¡Van a llegar!</p>
          </div>
        )}

        {/* Pedidos activos */}
        {activos.length > 0 && (
          <>
            <h2 className="text-base text-gray-500 font-semibold m-0 mb-3">
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

        {/* Historial */}
        {completados.length > 0 && (
          <>
            <h2 className="text-base text-gray-400 font-semibold mt-6 mb-3">
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

        {/* Modal de franja horaria */}
        {franjaModal && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000] p-4"
            onClick={() => setFranjaModal(null)}
          >
            <div onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-[380px] w-full">
              <h3 className="text-lg font-semibold text-[#0a0a0a] m-0 mb-2">¿En qué franja sale?</h3>
              <p className="text-sm text-gray-500 m-0 mb-4">
                Le avisamos al comprador en qué horario esperar el envío.
              </p>
              <div className="flex gap-2 mb-5">
                {['Mañana', 'Tarde'].map(f => (
                  <button key={f} type="button" onClick={() => setFranjaElegida(f)}
                    className={`flex-1 py-3 rounded-lg cursor-pointer text-[0.95rem] transition-colors ${
                      franjaElegida === f
                        ? 'border-2 border-violet-600 bg-violet-50 text-violet-600 font-semibold'
                        : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setFranjaModal(null)}
                  className="flex-1 py-3 border border-gray-300 rounded-lg bg-white cursor-pointer hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={() => ejecutarAvance(franjaModal, franjaElegida)}
                  className="flex-1 py-3 border-none rounded-lg bg-violet-600 text-white cursor-pointer font-medium hover:bg-violet-700 transition-colors">
                  Avisar por WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

// ══════════════════════════════════════════════════════
// TARJETA DE PEDIDO
// ══════════════════════════════════════════════════════

function PedidoCard({ pedido, abierto, items, avanzando, onToggle, onAvanzar }) {
  const p = pedido;
  const estado = ESTADOS[p.estado] || { label: p.estado, color: 'text-gray-500', bg: 'bg-gray-100' };
  const accion = ACCIONES[p.estado];
  const primerItem = items[0];

  return (
    <div className="border border-gray-200 rounded-xl px-5 py-4 mb-3 bg-white">
      {/* Header clickeable */}
      <div onClick={onToggle} className="cursor-pointer">
        <div className="flex items-center gap-3">
          {/* Miniatura */}
          <div className="w-12 h-12 rounded-lg bg-[#F5F2EC] shrink-0 overflow-hidden flex items-center justify-center text-gray-300 text-xl">
            {primerItem?.foto_url ? (
              <img src={primerItem.foto_url} alt="" className="w-full h-full object-cover" />
            ) : '📦'}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-[0.95rem] text-[#0a0a0a]">Pedido #{p.id}</strong>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${estado.bg} ${estado.color}`}>
                {estado.label}
              </span>
            </div>
            <p className="mt-0.5 mb-0 text-sm text-gray-500">
              {p.metodo_envio} · {tiempoRelativo(p.creado_en)}
            </p>
          </div>

          {/* Total */}
          <div className="text-right shrink-0">
            <div className="font-semibold text-[#0a0a0a]">${fmt(p.total)}</div>
            <div className="text-xs text-gray-400">{abierto ? 'Ocultar ▲' : 'Ver detalle ▼'}</div>
          </div>
        </div>
      </div>

      {/* Detalle expandible */}
      {abierto && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {/* Productos */}
          <div className="mb-4">
            <p className="m-0 mb-2 text-sm text-gray-400">Productos</p>
            {items.length === 0 ? (
              <p className="text-sm text-gray-300">Cargando...</p>
            ) : items.map(it => (
              <div key={it.id} className="flex justify-between py-1 text-sm text-gray-600">
                <span>{it.nombre}{it.variante ? ` · ${it.variante}` : ''} × {it.cantidad}</span>
                <span>${fmt(it.precio * it.cantidad)}</span>
              </div>
            ))}
          </div>

          {/* Entrega */}
          <div className="mb-4">
            <p className="m-0 mb-1.5 text-sm text-gray-400">Entrega</p>
            <p className="m-0 text-sm text-gray-600">{p.metodo_envio}</p>
            {p.turno_preferido && (
              <p className="m-0 text-sm text-gray-400">Preferencia del comprador: {p.turno_preferido.toLowerCase()}</p>
            )}
            {p.direccion && (
              <p className="mt-1 mb-0 text-sm text-gray-600">
                {p.direccion.calle} {p.direccion.numero}{p.direccion.piso_depto ? `, ${p.direccion.piso_depto}` : ''}<br />
                Tel. {p.direccion.telefono}
              </p>
            )}
          </div>

          {/* Resumen de cobro */}
          <div className="pt-2 border-t border-gray-100 mb-4">
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-500">Productos</span>
              <span className="text-[#0a0a0a]">${fmt(p.subtotal_productos)}</span>
            </div>
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-500">Envío</span>
              <span className="text-[#0a0a0a]">${fmt(p.costo_envio)}</span>
            </div>
            <div className="flex justify-between text-sm py-0.5 text-gray-400">
              <span>Comisión Bahía Shops (5%)</span>
              <span>-${fmt(p.comision_plataforma)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold text-[#0a0a0a] pt-2 border-t border-gray-100 mt-1">
              <span>Recibís</span>
              <span>${fmt(p.total - (p.comision_plataforma || 0))}</span>
            </div>
          </div>

          {/* Botón de acción */}
          {accion && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAvanzar(); }} disabled={avanzando}
              className={`w-full py-3 text-[0.95rem] border-none rounded-lg text-white flex items-center justify-center gap-2 transition-colors ${
                avanzando ? 'bg-gray-300 cursor-not-allowed' : `${accion.btnClass} cursor-pointer`
              }`}>
              {accion.whatsapp && (
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.564l4.72-1.236A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6c-2.07 0-4.046-.54-5.795-1.56l-.42-.25-2.8.735.747-2.73-.27-.43A9.554 9.554 0 0 1 2.4 12c0-5.302 4.298-9.6 9.6-9.6 5.302 0 9.6 4.298 9.6 9.6 0 5.302-4.298 9.6-9.6 9.6z"/>
                </svg>
              )}
              {avanzando ? 'Actualizando...' : accion.label}
            </button>
          )}

          {/* Completado */}
          {p.estado === 'despachado' && (
            <div className="text-center py-3 bg-emerald-50 rounded-lg text-emerald-700 font-medium text-sm">
              ✓ Pedido completado
            </div>
          )}
        </div>
      )}
    </div>
  );
}