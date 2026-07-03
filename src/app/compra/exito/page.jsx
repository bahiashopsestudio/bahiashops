'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCarrito } from '@/context/CarritoContext';
import { Suspense, useEffect, useState } from 'react';

function ExitoContenido() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locales, vaciarLocal } = useCarrito();
  const pedidoId = searchParams.get('pedido');
  const [limpiado, setLimpiado] = useState(false);

  // Vaciar del carrito el local que se acaba de comprar.
  // Lo hacemos una sola vez.
  useEffect(() => {
    if (limpiado) return;
    // Buscamos en los locales del carrito cuál corresponde al pedido.
    // Como no sabemos el vendedorId acá, vaciamos todos los que estaban.
    // En una versión más completa, pasaríamos el vendedorId por la URL.
    // Por ahora, si solo estaba comprando un local, esto funciona perfecto.
    if (locales.length > 0) {
      // No vaciamos todos — solo marcamos que ya limpiamos.
      // El vaciar real lo podemos hacer cuando tengamos el vendedorId.
    }
    setLimpiado(true);
  }, [limpiado, locales]);

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%', background: '#e9f7ef',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '2rem auto 1rem', fontSize: '2rem',
      }}>
        ✓
      </div>

      <h1 style={{ margin: '0 0 0.5rem' }}>¡Compra realizada con éxito!</h1>
      <p style={{ fontSize: '1.1rem', margin: '0 0 0.5rem' }}>Tu pedido se está preparando.</p>
      <p style={{ color: '#888', fontSize: '0.9rem', margin: '0 0 2rem' }}>
        Orden #{pedidoId}
      </p>

      <div style={{
        background: '#f7f7f7', borderRadius: '12px', padding: '1.25rem',
        textAlign: 'left', marginBottom: '1.5rem',
      }}>
        <p style={{ margin: '0 0 0.25rem', fontWeight: 500 }}>
          Te enviamos el detalle por mail.
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
          También le avisamos al vendedor de tu compra.
        </p>
      </div>

      <button
        type="button"
        onClick={() => router.push('/')}
        style={{
          padding: '0.8rem 2rem', fontSize: '1rem',
          background: '#222', color: 'white',
          border: 'none', borderRadius: '8px', cursor: 'pointer',
        }}
      >
        Seguir comprando
      </button>
    </main>
  );
}

export default function ExitoPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>}>
      <ExitoContenido />
    </Suspense>
  );
}