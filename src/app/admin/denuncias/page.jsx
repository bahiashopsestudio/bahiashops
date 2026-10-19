'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { moderarProducto, leerDelAdmin } from '@/lib/moderarProducto';
import { haceCuanto } from '@/lib/denuncias';
import Navbar from '@/components/Navbar';
import RechazoProducto from '@/components/admin/RechazoProducto';
import VistaPreviaProducto, { previaDe } from '@/components/admin/VistaPreviaProducto';
import EtiquetasTienda from '@/components/admin/EtiquetasTienda';
import { ErrorDeLista, BOTON_NEGRO, BOTON_BORDE_NEGRO, BOTON_BORDE_GRIS } from '@/components/admin/comun';
import ResenasDenunciadas from './ResenasDenunciadas';

// Dos pestañas:
//   Productos  las denuncias pendientes, una tarjeta por producto
//              (/api/admin/denuncias). Rechazar el producto usa el mismo
//              rechazo de la moderación, y resuelve sus denuncias;
//              descartarlas deja el producto como está.
//   Reseñas    las marcadas por el filtro, las ocultas y todas
//              (ResenasDenunciadas). ?pestana=resenas abre esta.
const PESTANAS = [
  { id: 'productos', titulo: 'Productos' },
  { id: 'resenas', titulo: 'Reseñas' },
];

export default function DenunciasPage() {
  const supabase = createClient();

  const [esAdmin, setEsAdmin] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [productos, setProductos] = useState([]);
  const [error, setError] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [rechazandoId, setRechazandoId] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [pestana, setPestana] = useState('productos');
  // Reseñas por revisar (null: todavía no se sabe o no se pudo leer).
  const [porRevisar, setPorRevisar] = useState(null);

  function elegir(id) {
    setPestana(id);
    try {
      const url = new URL(window.location.href);
      if (id === 'resenas') url.searchParams.set('pestana', 'resenas');
      else url.searchParams.delete('pestana');
      window.history.replaceState(null, '', url);
    } catch { /* no importa */ }
  }

  useEffect(() => {
    async function iniciar() {
      try {
        if (new URLSearchParams(window.location.search).get('pestana') === 'resenas') setPestana('resenas');
      } catch { /* sin URL: queda la primera */ }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEsAdmin(false); setCargando(false); return; }
      const { data: perfil } = await supabase.from('usuarios').select('es_admin').eq('id', user.id).single();
      if (!perfil?.es_admin) { setEsAdmin(false); setCargando(false); return; }
      setEsAdmin(true);
      // El número de la pestaña Reseñas, aunque se abra en Productos.
      leerDelAdmin('/api/admin/resenas?conteo=1', '').then(({ datos }) => {
        if (datos) setPorRevisar(datos.por_revisar ?? null);
      });
      await cargar();
      setCargando(false);
    }
    iniciar();
  }, []);

  async function cargar() {
    const { datos, error: fallo } = await leerDelAdmin('/api/admin/denuncias', 'No se pudieron cargar las denuncias.');
    setError(fallo || null);
    if (!fallo) setProductos(datos.productos || []);
  }

  function quitar(id) {
    setProductos((prev) => prev.filter((p) => p.id !== id));
    setRechazandoId(null);
  }

  async function rechazar(id, motivo) {
    setProcesando(id);
    const fallo = await moderarProducto(id, { accion: 'rechazar', motivo });
    setProcesando(null);
    if (fallo) { alert('No se pudo rechazar: ' + fallo); return; }
    quitar(id);
  }

  async function descartar(id) {
    setProcesando(id);
    let fallo = null;
    try {
      const res = await fetch(`/api/admin/denuncias/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'descartar' }),
      });
      if (!res.ok) fallo = (await res.json().catch(() => ({}))).error || 'Error inesperado.';
    } catch {
      fallo = 'No pudimos conectarnos.';
    }
    setProcesando(null);
    if (fallo) { alert('No se pudo descartar: ' + fallo); return; }
    quitar(id);
  }

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-gray-400">Cargando...</main>
      </>
    );
  }

  if (!esAdmin) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center">
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Acceso restringido</h1>
          <p className="text-gray-500">Esta página es solo para administradores.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[820px] w-full mx-auto">
        <h1 className="text-2xl font-semibold text-[#0a0a0a] m-0">Denuncias</h1>

        {/* Pestañas */}
        <div role="tablist" className="flex gap-1 mt-5 border-b border-gray-200">
          {PESTANAS.map((t) => {
            const activa = pestana === t.id;
            const cantidad = t.id === 'productos' ? (error ? null : productos.length) : porRevisar;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={activa} onClick={() => elegir(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 bg-transparent text-sm cursor-pointer transition-colors ${
                  activa ? 'border-[#0a0a0a] text-[#0a0a0a] font-semibold' : 'border-transparent text-gray-500 hover:text-[#0a0a0a]'
                }`}>
                {t.titulo}
                {cantidad !== null && (
                  <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                    t.id === 'resenas' ? 'bg-[#e8ecff] text-[#2a3fb8]' : 'bg-[#fbe8da] text-[#8a3410]'
                  }`}>
                    {cantidad}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {pestana === 'resenas' ? (
          <ResenasDenunciadas onCambioConteo={setPorRevisar} />
        ) : (
        <>
        <p className="text-gray-500 mt-6 mb-0 text-sm">
          Lo que denunció la gente. Los productos siguen publicados hasta que decidas.
          Si varias personas denuncian el mismo producto, se agrupan acá.
        </p>

        {error ? (
          <ErrorDeLista titulo="No pudimos cargar las denuncias" error={error}
            onReintentar={async () => { setCargando(true); await cargar(); setCargando(false); }} />
        ) : productos.length === 0 ? (
          <div className="mt-8 px-8 py-12 text-center border border-dashed border-gray-300 rounded-xl text-gray-500">
            <p className="text-lg m-0">No hay denuncias pendientes.</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {productos.map((p) => {
              const enAccion = procesando === p.id;
              return (
                <div key={p.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex gap-4">
                    <div className="w-[90px] h-[90px] shrink-0 rounded-lg overflow-hidden bg-[#F5F2EC] flex items-center justify-center text-gray-400">
                      {p.fotos[0] ? <img src={p.fotos[0]} alt={p.nombre} className="w-full h-full object-cover" /> : <span className="text-xs">Sin foto</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="m-0 font-semibold text-[#0a0a0a]">{p.nombre}</p>
                        <span className="shrink-0 text-[11px] font-medium text-[#8a3410] bg-[#fbe8da] rounded-full px-2.5 py-0.5">
                          {p.denuncias} {p.denuncias === 1 ? 'denuncia' : 'denuncias'}
                        </span>
                      </div>
                      <p className="mt-0.5 mb-0 text-sm text-gray-500 flex items-center flex-wrap gap-x-1.5 gap-y-1">
                        <span>
                          {p.vendedor?.nombre_negocio || 'Vendedor desconocido'}
                          {p.vendedor?.barrio ? ` · ${p.vendedor.barrio}` : ''}
                        </span>
                        <EtiquetasTienda vendedor={p.vendedor} />
                      </p>
                      <p className="mt-2 mb-0 text-sm text-[#0a0a0a]">
                        {p.motivos.map((m) => (m.cantidad > 1 ? `${m.texto} ×${m.cantidad}` : m.texto)).join(' · ')}
                      </p>
                      <p className="mt-1 mb-0 text-xs text-gray-400">Primera denuncia {haceCuanto(p.primera_en)}</p>
                    </div>
                  </div>

                  {p.comentarios.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {p.comentarios.map((c, i) => (
                        <p key={i} className="m-0 text-sm text-gray-600 bg-[#f6f3ee] rounded-lg px-3 py-2 whitespace-pre-line break-words">“{c}”</p>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap mt-4">
                    <button type="button" disabled={enAccion} className={BOTON_NEGRO} onClick={() => setRechazandoId(p.id)}>
                      Rechazar producto
                    </button>
                    <button type="button" disabled={enAccion} className={BOTON_BORDE_NEGRO} onClick={() => descartar(p.id)}>
                      {enAccion && rechazandoId !== p.id ? 'Descartando...' : 'Descartar denuncia'}
                    </button>
                    <button type="button" className={BOTON_BORDE_GRIS} onClick={() => setPrevia(previaDe(p))}>
                      Ver producto
                    </button>
                  </div>

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
        )}
      </main>
    </>
  );
}
