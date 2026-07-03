'use client';

import { useCarrito } from '@/context/CarritoContext';
import { useRouter } from 'next/navigation';

export default function PaginaCarrito() {
  const { locales, cambiarCantidad, quitar, subtotalLocal, listo } = useCarrito();
  const router = useRouter();

  function formatearPrecio(valor) {
    return Number(valor).toLocaleString('es-AR');
  }

  // Mientras la canasta se lee del navegador, evitamos parpadeos.
  if (!listo) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>;
  }

  // Carrito vacío.
  if (locales.length === 0) {
    return (
      <main style={{ padding: '2rem', maxWidth: '700px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
        <h1>Tu carrito</h1>
        <p style={{ color: '#666', marginTop: '1rem' }}>Todavía no agregaste nada.</p>
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
      <h1>Tu carrito</h1>
      <p style={{ color: '#666', margin: '0.25rem 0 1.5rem' }}>
        Tenés productos de {locales.length} {locales.length === 1 ? 'local' : 'locales'}.
      </p>

      {/* Un bloque por local */}
      {locales.map((local) => (
        <div
          key={local.vendedorId}
          style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem' }}
        >
          {/* Nombre del local */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>🏪 {local.vendedorNombre}</span>
          </div>

          {/* Productos del local */}
          {local.items.map((item) => (
            <div
              key={item.productoId}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderTop: '1px solid #eee' }}
            >
              {/* Foto */}
              <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: '#f5f5f5', flexShrink: 0, overflow: 'hidden' }}>
                {item.foto && (
                  <img src={item.foto} alt={item.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>

              {/* Nombre, variante, precio */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 500 }}>{item.nombre}</p>
                {item.variante && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#666' }}>{item.variante}</p>
                )}
                <p style={{ margin: '2px 0 0', fontSize: '0.9rem', color: '#444' }}>${formatearPrecio(item.precio)}</p>
              </div>

              {/* Cantidad */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', border: '1px solid #ddd', borderRadius: '8px', padding: '0.25rem 0.6rem' }}>
                <button
                  type="button"
                  onClick={() => cambiarCantidad(local.vendedorId, item.productoId, item.cantidad - 1)}
                  style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#555' }}
                  aria-label="Restar"
                >−</button>
                <span style={{ minWidth: '16px', textAlign: 'center' }}>{item.cantidad}</span>
                <button
                  type="button"
                  onClick={() => cambiarCantidad(local.vendedorId, item.productoId, item.cantidad + 1)}
                  style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#555' }}
                  aria-label="Sumar"
                >+</button>
              </div>

              {/* Quitar */}
              <button
                type="button"
                onClick={() => quitar(local.vendedorId, item.productoId)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '1.1rem' }}
                aria-label="Quitar"
              >🗑</button>
            </div>
          ))}

          {/* Subtotal del local */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid #eee', marginTop: '0.25rem' }}>
            <span style={{ color: '#666' }}>Subtotal</span>
            <span style={{ fontWeight: 600 }}>${formatearPrecio(subtotalLocal(local.vendedorId))}</span>
          </div>
        </div>
      ))}

      {/* Botón de comprar: decide solo según cuántos locales haya */}
      <button
        type="button"
        onClick={() => {
          if (locales.length === 1) {
            // Un solo local: derecho al checkout de ese local.
            router.push(`/checkout?vendedor=${locales[0].vendedorId}`);
          } else {
            // Varios locales: primero elige con cuál sigue.
            router.push('/carrito/elegir');
          }
        }}
        style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem', background: '#009ee3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '0.5rem' }}
      >
        Comprar
      </button>
    </main>
  );
}