'use client';

import { useCarrito } from '@/context/CarritoContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ElegirLocalPage() {
  const { locales, subtotalLocal, listo } = useCarrito();
  const router = useRouter();

  function formatearPrecio(valor) {
    return Number(valor).toLocaleString('es-AR');
  }

  // Si hay un solo local (o ninguno), esta pantalla no tiene sentido:
  // redirigimos solos al lugar correcto.
  useEffect(() => {
    if (!listo) return;
    if (locales.length === 1) {
      router.replace(`/checkout?vendedor=${locales[0].vendedorId}`);
    } else if (locales.length === 0) {
      router.replace('/carrito');
    }
  }, [listo, locales, router]);

  if (!listo || locales.length <= 1) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>;
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', width: '100%', margin: '0 auto' }}>
      {/* Volver */}
      <button
        type="button"
        onClick={() => router.push('/carrito')}
        style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '1rem' }}
      >
        ← Volver al carrito
      </button>

      <h1 style={{ margin: '0 0 0.5rem' }}>¿Con qué local seguís?</h1>
      <p style={{ color: '#666', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
        Cada compra se paga y se coordina por separado. Con el que no elijas ahora, seguís
        después: te queda guardado en el carrito.
      </p>

      {/* Una tarjeta por local */}
      {locales.map((local) => {
        const cantidad = local.items.reduce((s, it) => s + it.cantidad, 0);
        return (
          <button
            key={local.vendedorId}
            type="button"
            onClick={() => router.push(`/checkout?vendedor=${local.vendedorId}`)}
            style={{
              width: '100%', textAlign: 'left', background: 'white',
              border: '1px solid #ddd', borderRadius: '12px', padding: '1rem',
              marginBottom: '0.75rem', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>🏪 {local.vendedorNombre}</div>
              <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '2px' }}>
                {cantidad} {cantidad === 1 ? 'producto' : 'productos'} · ${formatearPrecio(subtotalLocal(local.vendedorId))}
              </div>
            </div>
            <span style={{ color: '#bbb', fontSize: '1.2rem' }}>›</span>
          </button>
        );
      })}

      {/* Explicación del por qué */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', background: '#f7f7f7', borderRadius: '8px', padding: '0.75rem 0.9rem', marginTop: '0.5rem' }}>
        <span>ℹ️</span>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#666', lineHeight: 1.5 }}>
          Comprás de a un local por vez porque cada uno prepara y despacha su propio pedido.
        </p>
      </div>
    </main>
  );
}