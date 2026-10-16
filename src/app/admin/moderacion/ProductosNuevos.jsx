'use client';

import { useState } from 'react';
import { ETIQUETAS_MODERACION } from '@/lib/moderacion';
import { moderarProducto } from '@/lib/moderarProducto';
import RechazoProducto from '@/components/admin/RechazoProducto';
import VistaPreviaProducto, { previaDe } from '@/components/admin/VistaPreviaProducto';
import EtiquetasTienda from '@/components/admin/EtiquetasTienda';
import { ErrorDeLista, formatearPrecio } from '@/components/admin/comun';

function IconoSparkle({ activo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={activo ? 'Se agregará a Tesoros' : 'Marcar como tesoro'}
      aria-label="Marcar como tesoro"
      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer transition-transform hover:scale-110"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        fill={activo ? 'currentColor' : 'none'}
        className="transition-colors"
        style={{ color: activo ? '#b8a000' : 'rgba(10,10,10,0.2)' }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
      </svg>
    </button>
  );
}

// "Productos nuevos": la cola de siempre (productos en revisión).
//   onQuitar(id)  el producto ya se moderó: sale de la lista
export default function ProductosNuevos({ productos, error, onReintentar, onQuitar }) {
  const [procesando, setProcesando] = useState(null);
  const [rechazandoId, setRechazandoId] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [tesorosMarcados, setTesorosMarcados] = useState(new Set());

  function toggleTesoro(productoId) {
    setTesorosMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(productoId)) next.delete(productoId);
      else next.add(productoId);
      return next;
    });
  }

  async function aprobar(id) {
    setProcesando(id);
    const fallo = await moderarProducto(id, { accion: 'aprobar' });

    if (fallo) {
      alert('No se pudo aprobar: ' + fallo);
      setProcesando(null);
      return;
    }

    if (tesorosMarcados.has(id)) {
      try {
        await fetch('/api/admin/tesoros', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ producto_id: id }),
        });
      } catch {
        // Si falla, la aprobación no se revierte: se puede agregar como tesoro después desde /admin/tesoros.
      }
    }

    onQuitar(id);
    setProcesando(null);
  }

  async function rechazar(id, motivo) {
    setProcesando(id);
    const fallo = await moderarProducto(id, { accion: 'rechazar', motivo });

    if (fallo) {
      alert('No se pudo rechazar: ' + fallo);
      setProcesando(null);
      return;
    }
    onQuitar(id);
    setRechazandoId(null);
    setProcesando(null);
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2 mt-6">
        <p className="text-gray-500 m-0 text-sm">Aprobá o rechazá lo que cargan los vendedores</p>
        {!error && (
          <span className="text-sm font-semibold px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
            {productos.length} {productos.length === 1 ? 'pendiente' : 'pendientes'}
          </span>
        )}
      </div>

      {/* Error: no es lo mismo que "no hay nada para moderar" */}
      {error ? (
        <ErrorDeLista titulo="No pudimos cargar los productos en revisión" error={error} onReintentar={onReintentar} />
      ) : productos.length === 0 ? (
        <div className="mt-8 px-8 py-12 text-center border border-dashed border-gray-300 rounded-xl text-gray-500">
          <p className="text-lg m-0">No hay productos esperando revisión 🎉</p>
          <p className="mt-2 mb-0 text-sm">Cuando un vendedor cargue algo nuevo, va a aparecer acá.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {productos.map((p) => {
            const foto = p.fotos[0];
            const enAccion = procesando === p.id;
            const avisos = Array.isArray(p.moderacion_avisos) ? p.moderacion_avisos : [];
            const etiquetasAviso = [...new Set(avisos.map((a) => ETIQUETAS_MODERACION[a.tipo] || a.tipo))];

            return (
              <div key={p.id} className="border border-gray-200 rounded-xl p-4">
                {/* Cartelito de moderación automática */}
                {etiquetasAviso.length > 0 && (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-800 text-xs">
                    <span aria-hidden="true" className="leading-tight">⚠</span>
                    <span>
                      <strong>Revisar con cuidado:</strong> {etiquetasAviso.join(' · ')}
                    </span>
                  </div>
                )}

                <div className="flex gap-4">
                  {/* Miniatura */}
                  <div className="w-[90px] h-[90px] shrink-0 rounded-lg overflow-hidden bg-[#F5F2EC] flex items-center justify-center text-gray-400">
                    {foto ? (
                      <img src={foto} alt={p.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs">Sin foto</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="m-0 font-semibold text-[#0a0a0a]">{p.nombre}</p>
                    <p className="mt-0.5 mb-0 text-sm text-gray-500 flex items-center flex-wrap gap-x-1.5 gap-y-1">
                      <span>
                        {p.vendedor?.nombre_negocio || 'Vendedor desconocido'}
                        {p.categoria?.nombre ? ` · ${p.categoria.nombre}` : ''}
                      </span>
                      <EtiquetasTienda vendedor={p.vendedor} />
                    </p>
                    {p.sellos.length > 0 && (
                      <p className="mt-0.5 mb-0 text-xs text-gray-400">Sellos: {p.sellos.join(' · ')}</p>
                    )}
                    <p className="mt-1.5 mb-0 font-semibold text-[#0a0a0a]">${formatearPrecio(p.precio)}</p>
                    <p className="mt-1 mb-0 text-sm text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap">
                      {p.descripcion}
                    </p>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <IconoSparkle activo={tesorosMarcados.has(p.id)} onClick={() => toggleTesoro(p.id)} />
                      <button
                        type="button"
                        onClick={() => aprobar(p.id)}
                        disabled={enAccion}
                        className={`flex-1 px-4 py-2 border-none rounded-lg text-white text-sm transition-colors ${
                          enAccion ? 'bg-gray-300 cursor-not-allowed' : 'bg-emerald-700 cursor-pointer hover:bg-emerald-800'
                        }`}
                      >
                        Aprobar
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRechazandoId(p.id)}
                      disabled={enAccion}
                      className={`px-4 py-2 border border-red-700 rounded-lg bg-white text-red-700 text-sm transition-colors ${
                        enAccion ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-red-50'
                      }`}
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrevia(previaDe(p))}
                      className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-[#0a0a0a] text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      Ver
                    </button>
                  </div>
                </div>

                {/* Zona de rechazo */}
                {rechazandoId === p.id && (
                  <RechazoProducto
                    productoId={p.id}
                    enAccion={enAccion}
                    onConfirmar={(motivo) => rechazar(p.id, motivo)}
                    onCancelar={() => setRechazandoId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <VistaPreviaProducto previa={previa} onClose={() => setPrevia(null)} />
    </>
  );
}
