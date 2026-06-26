'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import VistaProducto from '@/components/VistaProducto';
import { ETIQUETAS_MODERACION } from '@/lib/moderacion';

// ┌────────────────────────────────────────────────────────────┐
// │ MOTIVOS DE RECHAZO                                          │
// │ Para cambiar, sumar o sacar un motivo, editá esta lista.    │
// │ Es el único lugar que toca: el resto se acomoda solo.       │
// └────────────────────────────────────────────────────────────┘
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

  const [esAdmin, setEsAdmin] = useState(null); // null = chequeando
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(null); // id del producto en acción
  const [rechazandoId, setRechazandoId] = useState(null); // id con el motivo abierto
  const [motivoElegido, setMotivoElegido] = useState(''); // motivo de la lista
  const [nota, setNota] = useState(''); // aclaración opcional
  const [previa, setPrevia] = useState(null); // datos completos para el modal "Ver"

  // 1. Verificar que el usuario sea admin y, si lo es, traer la cola
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

  // Trae los productos en revisión, con su vendedor, foto principal y categoría
  async function cargarCola() {
    const { data, error } = await supabase
      .from('productos')
      .select(`
        id, nombre, descripcion, precio, precio_anterior, marca,
        propiedad_1_nombre, tiempo_preparacion, categoria_id, moderacion_avisos,
        vendedores ( nombre_negocio ),
        producto_media ( url, orden ),
        producto_variantes ( propiedad_1_valor ),
        categorias ( nombre, slug )
      `)
      .eq('estado', 'en_revision')
      .order('creado_en', { ascending: true }); // los más viejos primero

    if (error) {
      console.error('Error cargando la cola:', error);
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

  // Aprobar: pasa el producto a 'activo' y limpia cualquier motivo previo
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
    setProductos((prev) => prev.filter((p) => p.id !== id));
    setProcesando(null);
  }

  // Arma el texto final que se guarda: motivo + nota (si hay)
  function construirMotivoFinal() {
    const base = motivoElegido;
    const aclaracion = nota.trim();
    if (aclaracion) {
      return `${base} — ${aclaracion}`;
    }
    return base;
  }

  // Rechazar: pasa a 'rechazado' y guarda el motivo elegido (+ nota opcional)
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

  // Prepara los datos del producto para el modal "Ver" (formato de VistaProducto)
  function verProducto(p) {
    setPrevia({
      producto: {
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: p.precio,
        precio_anterior: p.precio_anterior,
        marca: p.marca,
        propiedad_1_nombre: p.propiedad_1_nombre,
        tiempo_preparacion: p.tiempo_preparacion,
      },
      fotos: (p.producto_media || []).map((m) => ({ url: m.url })),
      variantes: (p.producto_variantes || []).map((v) => ({ propiedad_1_valor: v.propiedad_1_valor })),
      vendedor: p.vendedores ? { nombre_negocio: p.vendedores.nombre_negocio } : null,
      categoria: p.categorias ? { nombre: p.categorias.nombre, slug: p.categorias.slug } : null,
    });
  }

  // --- Render ---

  if (cargando) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>;
  }

  if (!esAdmin) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Acceso restringido</h1>
        <p style={{ color: '#666' }}>Esta página es solo para administradores.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '820px', width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Productos en revisión</h1>
          <p style={{ color: '#666', margin: '0.25rem 0 0' }}>Aprobá o rechazá lo que cargan los vendedores</p>
        </div>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0.25rem 0.8rem', background: '#fff3cd', color: '#856404', borderRadius: '999px' }}>
          {productos.length} {productos.length === 1 ? 'pendiente' : 'pendientes'}
        </span>
      </div>

      {productos.length === 0 ? (
        <div style={{ marginTop: '2rem', padding: '3rem 2rem', textAlign: 'center', border: '1px dashed #ccc', borderRadius: '12px', color: '#666' }}>
          <p style={{ fontSize: '1.1rem', margin: 0 }}>No hay productos esperando revisión 🎉</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Cuando un vendedor cargue algo nuevo, va a aparecer acá.</p>
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {productos.map((p) => {
            const foto = p.producto_media?.[0]?.url;
            const enAccion = procesando === p.id;
            // Avisos de moderación: puede venir null, [], o con cosas adentro.
            const avisos = Array.isArray(p.moderacion_avisos) ? p.moderacion_avisos : [];
            // Juntamos las etiquetas únicas, sin repetir (ej: dos "animales" → uno solo).
            const etiquetasAviso = [...new Set(avisos.map((a) => ETIQUETAS_MODERACION[a.tipo] || a.tipo))];
            return (
              <div key={p.id} style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '1rem' }}>
                {/* Cartelito ámbar: solo si el filtro automático marcó algo dudoso */}
                {etiquetasAviso.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.85rem', padding: '0.55rem 0.8rem', background: '#fff8e1', border: '1px solid #f5d98b', borderRadius: '8px', color: '#7a5b00', fontSize: '0.82rem' }}>
                    <span aria-hidden="true" style={{ lineHeight: 1.2 }}>⚠</span>
                    <span>
                      <strong>Revisar con cuidado:</strong> {etiquetasAviso.join(' · ')}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem' }}>
                  {/* Miniatura */}
                  <div style={{ width: '90px', height: '90px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
                    {foto ? (
                      <img src={foto} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '0.7rem' }}>Sin foto</span>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{p.nombre}</p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#666' }}>
                      {p.vendedores?.nombre_negocio || 'Vendedor desconocido'}
                      {p.categorias?.nombre ? ` · ${p.categorias.nombre}` : ''}
                    </p>
                    <p style={{ margin: '0.4rem 0 0', fontWeight: 600 }}>${formatearPrecio(p.precio)}</p>
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.descripcion}
                    </p>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => aprobar(p.id)}
                      disabled={enAccion}
                      style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '8px', background: '#1a7f37', color: 'white', cursor: enAccion ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirRechazo(p.id)}
                      disabled={enAccion}
                      style={{ padding: '0.5rem 1rem', border: '1px solid #c1121f', borderRadius: '8px', background: 'white', color: '#c1121f', cursor: enAccion ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => verProducto(p)}
                      style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      Ver
                    </button>
                  </div>
                </div>

                {/* Zona de rechazo (se abre al tocar Rechazar) */}
                {rechazandoId === p.id && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #eee' }}>
                    <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.6rem' }}>
                      ¿Por qué lo rechazás? El vendedor lo va a ver para corregir.
                    </p>

                    {/* Lista de motivos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {MOTIVOS_RECHAZO.map((motivo) => {
                        const elegido = motivoElegido === motivo;
                        return (
                          <label
                            key={motivo}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.7rem',
                              borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem',
                              border: elegido ? '1.5px solid #2563eb' : '1px solid #ddd',
                              background: elegido ? '#eff6ff' : 'white',
                              color: elegido ? '#1d4ed8' : '#333',
                            }}
                          >
                            <input
                              type="radio"
                              name={`motivo-${p.id}`}
                              checked={elegido}
                              onChange={() => setMotivoElegido(motivo)}
                              style={{ margin: 0 }}
                            />
                            {motivo}
                          </label>
                        );
                      })}
                    </div>

                    {/* Nota opcional */}
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', margin: '0.8rem 0 0.3rem' }}>
                      Nota para el vendedor (opcional)
                    </label>
                    <textarea
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      rows={2}
                      placeholder='Aclarale el caso puntual, ej: "el teléfono está en la última foto".'
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc', resize: 'vertical' }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.7rem' }}>
                      <button
                        type="button"
                        onClick={cancelarRechazo}
                        disabled={enAccion}
                        style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmarRechazo(p.id)}
                        disabled={enAccion || !motivoElegido}
                        style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '8px', background: (enAccion || !motivoElegido) ? '#e0a3a8' : '#c1121f', color: 'white', cursor: (enAccion || !motivoElegido) ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
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

      {/* Modal "Ver": el mismo VistaProducto de siempre */}
      {previa && (
        <div
          onClick={() => setPrevia(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto', zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '12px', maxWidth: '760px', width: '100%', margin: 'auto', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #eee' }}>
              <p style={{ fontWeight: 600, margin: 0 }}>Vista del producto</p>
              <button
                type="button"
                onClick={() => setPrevia(null)}
                aria-label="Cerrar"
                style={{ width: '32px', height: '32px', border: '1px solid #ddd', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '1.5rem' }}>
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
  );
}