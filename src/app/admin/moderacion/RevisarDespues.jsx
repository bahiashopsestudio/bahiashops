'use client';

import { useState } from 'react';
import { ETIQUETAS_MODERACION } from '@/lib/moderacion';
import { moderarProducto } from '@/lib/moderarProducto';
import { haceCuanto } from '@/lib/denuncias';
import RechazoProducto from '@/components/admin/RechazoProducto';
import VistaPreviaProducto, { previaDe } from '@/components/admin/VistaPreviaProducto';
import EtiquetasTienda from '@/components/admin/EtiquetasTienda';
import { ErrorDeLista, BOTON_NEGRO, BOTON_BORDE_NEGRO, BOTON_BORDE_GRIS } from '@/components/admin/comun';

const SIGUE = { activo: 'sigue publicado', pausado: 'sigue pausado', agotado: 'sigue publicado (agotado)' };
const CAMPO = { nombre: 'Nombre', descripcion: 'Descripción', marca: 'Marca' };

// "Revisar después": productos ya aprobados que se editaron con algo dudoso
// (revision_posterior_desde, migración 033). Siguen publicados.
//   onQuitar(id)  ya se revisó o se rechazó: sale de la lista
export default function RevisarDespues({ productos, error, onReintentar, onQuitar }) {
  const [procesando, setProcesando] = useState(null);
  const [rechazandoId, setRechazandoId] = useState(null);
  const [previa, setPrevia] = useState(null);

  async function actuar(id, cuerpo, textoError) {
    setProcesando(id);
    const fallo = await moderarProducto(id, cuerpo);
    setProcesando(null);
    if (fallo) { alert(`${textoError}: ${fallo}`); return; }
    setRechazandoId(null);
    onQuitar(id);
  }

  return (
    <>
      <p className="text-gray-500 mt-6 mb-0 text-sm">
        Productos ya aprobados que se editaron con algo dudoso. Siguen publicados: miralos cuando puedas.
      </p>

      {error ? (
        <ErrorDeLista titulo="No pudimos cargar los productos para revisar" error={error} onReintentar={onReintentar} />
      ) : productos.length === 0 ? (
        <div className="mt-8 px-8 py-12 text-center border border-dashed border-gray-300 rounded-xl text-gray-500">
          <p className="text-lg m-0">Nada para revisar. Las ediciones recientes pasaron limpias.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {productos.map((p) => {
            const enAccion = procesando === p.id;
            const tipos = [...new Set(p.moderacion_avisos.map((a) => ETIQUETAS_MODERACION[a.tipo] || a.tipo))];
            const conFragmento = p.fragmentos.filter((f) => f.campo);
            return (
              <div key={p.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex gap-4">
                  <div className="w-[90px] h-[90px] shrink-0 rounded-lg overflow-hidden bg-[#F5F2EC] flex items-center justify-center text-gray-400">
                    {p.fotos[0] ? <img src={p.fotos[0]} alt={p.nombre} className="w-full h-full object-cover" /> : <span className="text-xs">Sin foto</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="m-0 font-semibold text-[#0a0a0a]">{p.nombre}</p>
                    <p className="mt-0.5 mb-0 text-sm text-gray-500 flex items-center flex-wrap gap-x-1.5 gap-y-1">
                      <span>{p.vendedor?.nombre_negocio || 'Vendedor desconocido'}</span>
                      <EtiquetasTienda vendedor={p.vendedor} />
                    </p>
                    <p className="mt-2 mb-0 flex items-center flex-wrap gap-x-2 gap-y-1">
                      {tipos.map((t) => (
                        <span key={t} className="text-[11px] font-medium text-[#2a3fb8] bg-[#e8ecff] rounded-full px-2.5 py-0.5">{t}</span>
                      ))}
                      <span className="text-xs text-gray-400">
                        Editado {haceCuanto(p.actualizado_en || p.revision_posterior_desde)} · {SIGUE[p.estado] || 'sigue publicado'}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Lo que encontró el filtro, en su contexto */}
                {conFragmento.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {conFragmento.map((f, i) => (
                      <p key={i} className="m-0 text-sm text-gray-600 bg-[#f6f3ee] rounded-lg px-3 py-2 break-words">
                        <span className="text-[11px] text-gray-400 mr-1.5">{CAMPO[f.campo]}:</span>
                        {f.antes}
                        <mark className="bg-[#ffe7a8] text-[#0a0a0a] rounded px-0.5">{f.resaltado}</mark>
                        {f.despues}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap mt-4">
                  <button type="button" disabled={enAccion} className={BOTON_NEGRO}
                    onClick={() => actuar(p.id, { accion: 'dar_por_revisado' }, 'No se pudo dar por revisado')}>
                    {enAccion && rechazandoId !== p.id ? 'Guardando...' : 'Dar por revisado'}
                  </button>
                  <button type="button" disabled={enAccion} className={BOTON_BORDE_NEGRO} onClick={() => setRechazandoId(p.id)}>
                    Rechazar producto
                  </button>
                  <button type="button" className={BOTON_BORDE_GRIS} onClick={() => setPrevia(previaDe(p))}>
                    Ver producto
                  </button>
                </div>

                {rechazandoId === p.id && (
                  <RechazoProducto
                    productoId={p.id}
                    enAccion={enAccion}
                    onConfirmar={(motivo) => actuar(p.id, { accion: 'rechazar', motivo }, 'No se pudo rechazar')}
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
