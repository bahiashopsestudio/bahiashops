'use client';

import { useState } from 'react';

export default function VistaProducto({
  producto,
  fotos = [],
  variantes = [],
  vendedor = null,
  categoria = null,
  modoPrevia = false,
}) {
  const [fotoActiva, setFotoActiva] = useState(0);
  const [varianteElegida, setVarianteElegida] = useState('');

  function formatearPrecio(valor) {
    if (!valor) return '';
    return Number(valor).toLocaleString('es-AR');
  }

  if (!producto) return null;

  const hayOferta =
    producto.precio_anterior &&
    Number(producto.precio_anterior) > Number(producto.precio);

  return (
    <div>
      {/* Dos columnas: fotos | info */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>

        {/* COLUMNA IZQUIERDA: galería */}
        <div style={{ flex: '1 1 360px', minWidth: '300px' }}>
          {fotos.length > 0 ? (
            <>
              <img
                src={fotos[fotoActiva]?.url}
                alt={producto.nombre}
                style={{ width: '100%', borderRadius: '8px', border: '1px solid #eee', aspectRatio: '1 / 1', objectFit: 'cover' }}
              />
              {fotos.length > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  {fotos.map((foto, index) => (
                    <img
                      key={foto.url}
                      src={foto.url}
                      alt={`Vista ${index + 1}`}
                      onClick={() => setFotoActiva(index)}
                      style={{
                        width: '70px', height: '70px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer',
                        border: index === fotoActiva ? '2px solid #222' : '1px solid #ddd',
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f5f5f5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              Sin foto
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: info */}
        <div style={{ flex: '1 1 320px', minWidth: '280px' }}>
          {/* Migas de pan */}
          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 1rem' }}>
            {modoPrevia ? (
              <>
                Inicio
                {categoria && <>{' · '}{categoria.nombre}</>}
                {' · '}{producto.nombre}
              </>
            ) : (
              <>
                <a href="/" style={{ color: '#666', textDecoration: 'none' }}>Inicio</a>
                {categoria && (
                  <>
                    {' · '}
                    <a href={`/categoria/${categoria.slug}`} style={{ color: '#666', textDecoration: 'underline' }}>
                      {categoria.nombre}
                    </a>
                  </>
                )}
                {' · '}{producto.nombre}
              </>
            )}
          </p>

          {vendedor && (
            <p style={{ fontSize: '0.9rem', color: '#666', margin: '0 0 0.5rem' }}>
              {vendedor.nombre_negocio}
            </p>
          )}

          <h1 style={{ margin: '0 0 1rem', fontSize: '1.8rem' }}>{producto.nombre}</h1>

          {/* Precio */}
          <div style={{ marginBottom: '1.5rem' }}>
            {hayOferta && (
              <span style={{ textDecoration: 'line-through', color: '#999', marginRight: '0.5rem' }}>
                ${formatearPrecio(producto.precio_anterior)}
              </span>
            )}
            <span style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>
              ${formatearPrecio(producto.precio)}
            </span>
            {hayOferta && (
              <span style={{ marginLeft: '0.5rem', background: '#e63946', color: 'white', fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px' }}>
                Oferta
              </span>
            )}
          </div>

          {/* Marca */}
          {producto.marca && (
            <p style={{ margin: '0 0 1rem', color: '#444' }}>
              <strong>Marca:</strong> {producto.marca}
            </p>
          )}

          {/* Variantes */}
          {variantes.length > 0 && producto.propiedad_1_nombre && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                {producto.propiedad_1_nombre}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {variantes.map((v) => (
                  <button
                    key={v.propiedad_1_valor}
                    type="button"
                    onClick={() => setVarianteElegida(v.propiedad_1_valor)}
                    style={{
                      padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer',
                      border: varianteElegida === v.propiedad_1_valor ? '2px solid #222' : '1px solid #ccc',
                      background: varianteElegida === v.propiedad_1_valor ? '#222' : 'white',
                      color: varianteElegida === v.propiedad_1_valor ? 'white' : '#222',
                    }}
                  >
                    {v.propiedad_1_valor}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Botón de comprar */}
          <button
            type="button"
            disabled={modoPrevia}
            onClick={() => {
              if (modoPrevia) return;
              alert('El carrito todavía no está listo — lo armamos próximamente.');
            }}
            style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem', background: '#222', color: 'white', border: 'none', borderRadius: '8px', cursor: modoPrevia ? 'default' : 'pointer', opacity: modoPrevia ? 0.55 : 1 }}
          >
            Comprar
          </button>

          {/* Tiempo de preparación */}
          {producto.tiempo_preparacion && (
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555' }}>
              ⏱ Tiempo de preparación: {producto.tiempo_preparacion.replaceAll('_', ' ')}
            </p>
          )}
        </div>
      </div>

      {/* Descripción (abajo, ancho completo) */}
      <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' }}>
        <h2 style={{ fontSize: '1.2rem' }}>Descripción</h2>
        <p style={{ whiteSpace: 'pre-line', lineHeight: 1.6, color: '#333' }}>
          {producto.descripcion}
        </p>
      </div>
    </div>
  );
}