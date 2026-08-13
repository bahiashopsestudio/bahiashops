'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import VistaProducto from '@/components/VistaProducto';
import { ETIQUETAS_MODERACION } from '@/lib/moderacion';
import Navbar from '@/components/Navbar';

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

const MOTIVOS_RECHAZO = [
  'Tiene datos de contacto (teléfono, mail, redes o links)',
  'Las fotos no muestran el producto real',
  'La descripción no coincide con el producto',
  'Precio incorrecto o "a consultar"',
  'Está en la subcategoría equivocada',
  'Producto no permitido en la plataforma',
  'Otro motivo',
];

export default function ModeracionPage() {
  const supabase = createClient();

  const [esAdmin, setEsAdmin] = useState(null);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const [rechazandoId, setRechazandoId] = useState(null);
  const [motivoElegido, setMotivoElegido] = useState('');
  const [nota, setNota] = useState('');
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

  useEffect(() => {
    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEsAdmin(false); setCargando(false); return; }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single();

      if (!perfil?.es_admin) { setEsAdmin(false); setCargando(false); return; }

      setEsAdmin(true);
      await cargarCola();
      setCargando(false);
    }
    iniciar();
  }, []);

  async function cargarCola() {
    const { data, error } = await supabase
      .from('productos')
      .select(`
        id, nombre, descripcion, precio, precio_anterior, marca,
        propiedad_1_nombre, tiempo_preparacion, categoria_id, moderacion_avisos,
        vendedores ( nombre_negocio ),
        producto_media ( url, orden ),
        producto_variantes ( propiedad_1_valor ),
        categorias!categoria_id ( nombre, slug )
      `)
      .eq('estado', 'en_revision')
      .order('creado_en', { ascending: true });

    if (error) {
      console.error('Error cargando la cola:', JSON.stringify(error));
      return;
    }

    const limpios = (data || []).map((p) => ({
      ...p,
      producto_media: [...(p.producto_media || [])].sort((a, b) => a.orden - b.orden),
    }));
    setProductos(limpios);
  }

  function formatearPrecio(valor) {
    if (!valor) return '';
    return Number(valor).toLocaleString('es-AR');
  }

  async function aprobar(id) {
    setProcesando(id);
    const { error } = await supabase
      .from('productos')
      .update({ estado: 'activo', motivo_rechazo: null })
      .eq('id', id);

    if (error) {
      alert('No se pudo aprobar: ' + error.message);
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

    setProductos((prev) => prev.filter((p) => p.id !== id));
    setProcesando(null);
  }

  function construirMotivoFinal() {
    const base = motivoElegido;
    const aclaracion = nota.trim();
    if (aclaracion) return `${base} — ${aclaracion}`;
    return base;
  }

  async function confirmarRechazo(id) {
    if (!motivoElegido) {
      alert('Elegí un motivo para que el vendedor sepa qué corregir.');
      return;
    }
    setProcesando(id);
    const { error } = await supabase
      .from('productos')
      .update({ estado: 'rechazado', motivo_rechazo: construirMotivoFinal() })
      .eq('id', id);

    if (error) {
      alert('No se pudo rechazar: ' + error.message);
      setProcesando(null);
      return;
    }
    setProductos((prev) => prev.filter((p) => p.id !== id));
    cancelarRechazo();
    setProcesando(null);
  }

  function abrirRechazo(id) {
    setRechazandoId(id);
    setMotivoElegido('');
    setNota('');
  }

  function cancelarRechazo() {
    setRechazandoId(null);
    setMotivoElegido('');
    setNota('');
  }

  function verProducto(p) {
    setPrevia({
      producto: {
        nombre: p.nombre, descripcion: p.descripcion, precio: p.precio,
        precio_anterior: p.precio_anterior, marca: p.marca,
        propiedad_1_nombre: p.propiedad_1_nombre,
        tiempo_preparacion: p.tiempo_preparacion,
      },
      fotos: (p.producto_media || []).map((m) => ({ url: m.url })),
      variantes: (p.producto_variantes || []).map((v) => ({ propiedad_1_valor: v.propiedad_1_valor })),
      vendedor: p.vendedores ? { nombre_negocio: p.vendedores.nombre_negocio } : null,
      categoria: p.categorias ? { nombre: p.categorias.nombre, slug: p.categorias.slug } : null,
    });
  }

  // ── Estados de carga ──

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
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-[#0a0a0a] m-0">Productos en revisión</h1>
            <p className="text-gray-500 mt-1 mb-0 text-sm">Aprobá o rechazá lo que cargan los vendedores</p>
          </div>
          <span className="text-sm font-semibold px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
            {productos.length} {productos.length === 1 ? 'pendiente' : 'pendientes'}
          </span>
        </div>

        {/* Estado vacío */}
        {productos.length === 0 ? (
          <div className="mt-8 px-8 py-12 text-center border border-dashed border-gray-300 rounded-xl text-gray-500">
            <p className="text-lg m-0">No hay productos esperando revisión 🎉</p>
            <p className="mt-2 mb-0 text-sm">Cuando un vendedor cargue algo nuevo, va a aparecer acá.</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {productos.map((p) => {
              const foto = p.producto_media?.[0]?.url;
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
                      <p className="mt-0.5 mb-0 text-sm text-gray-500">
                        {p.vendedores?.nombre_negocio || 'Vendedor desconocido'}
                        {p.categorias?.nombre ? ` · ${p.categorias.nombre}` : ''}
                      </p>
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
                        onClick={() => abrirRechazo(p.id)}
                        disabled={enAccion}
                        className={`px-4 py-2 border border-red-700 rounded-lg bg-white text-red-700 text-sm transition-colors ${
                          enAccion ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-red-50'
                        }`}
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        onClick={() => verProducto(p)}
                        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-[#0a0a0a] text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        Ver
                      </button>
                    </div>
                  </div>

                  {/* Zona de rechazo */}
                  {rechazandoId === p.id && (
                    <div className="mt-4 pt-4 border-t border-dashed border-gray-100">
                      <p className="text-sm text-gray-500 m-0 mb-2.5">
                        ¿Por qué lo rechazás? El vendedor lo va a ver para corregir.
                      </p>

                      {/* Lista de motivos */}
                      <div className="flex flex-col gap-1.5">
                        {MOTIVOS_RECHAZO.map((motivo) => {
                          const elegido = motivoElegido === motivo;
                          return (
                            <label
                              key={motivo}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                                elegido
                                  ? 'border-2 border-[#0a0a0a] bg-[#F5F2EC] text-[#0a0a0a] font-medium'
                                  : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`motivo-${p.id}`}
                                checked={elegido}
                                onChange={() => setMotivoElegido(motivo)}
                                className="m-0 accent-[#0a0a0a]"
                              />
                              {motivo}
                            </label>
                          );
                        })}
                      </div>

                      {/* Nota opcional */}
                      <label className="block text-xs text-gray-500 mt-3 mb-1">
                        Nota para el vendedor (opcional)
                      </label>
                      <textarea
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        rows={2}
                        placeholder='Aclarale el caso puntual, ej: "el teléfono está en la última foto".'
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 resize-y outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors text-sm"
                      />

                      <div className="flex justify-end gap-2 mt-3">
                        <button
                          type="button"
                          onClick={cancelarRechazo}
                          disabled={enAccion}
                          className="px-4 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer text-sm hover:bg-gray-50 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmarRechazo(p.id)}
                          disabled={enAccion || !motivoElegido}
                          className={`px-4 py-2 border-none rounded-lg text-white text-sm transition-colors ${
                            enAccion || !motivoElegido
                              ? 'bg-red-300 cursor-not-allowed'
                              : 'bg-red-700 cursor-pointer hover:bg-red-800'
                          }`}
                        >
                          {enAccion ? 'Rechazando...' : 'Confirmar rechazo'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal "Ver" */}
        {previa && (
          <div
            onClick={() => setPrevia(null)}
            className="fixed inset-0 bg-black/50 flex items-start justify-center p-8 overflow-y-auto z-[1000]"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl max-w-[760px] w-full my-auto overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <p className="font-semibold text-[#0a0a0a] m-0">Vista del producto</p>
                <button
                  type="button"
                  onClick={() => setPrevia(null)}
                  aria-label="Cerrar"
                  className="w-8 h-8 border border-gray-200 rounded-lg bg-white cursor-pointer text-lg leading-none hover:bg-gray-50"
                >
                  ×
                </button>
              </div>
              <div className="p-6">
                <VistaProducto
                  producto={previa.producto}
                  fotos={previa.fotos}
                  variantes={previa.variantes}
                  vendedor={previa.vendedor}
                  categoria={previa.categoria}
                  modoPrevia
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
