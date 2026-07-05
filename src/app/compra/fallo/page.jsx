'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function FalloContenido() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pedidoId = searchParams.get('pedido');

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%', background: '#fdecea',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '2rem auto 1rem', fontSize: '2rem', color: '#c0392b',
      }}>
        ✕
      </div>

      <h1 style={{ margin: '0 0 0.5rem' }}>No se pudo completar el pago</h1>
      <p style={{ fontSize: '1rem', color: '#555', margin: '0 0 0.5rem', lineHeight: 1.5 }}>
        Tu compra no se procesó y no se realizó ningún cobro.
      </p>
      {pedidoId && (
        <p style={{ color: '#888', fontSize: '0.9rem', margin: '0 0 2rem' }}>
          Pedido #{pedidoId}
        </p>
      )}

      <div style={{
        background: '#f7f7f7', borderRadius: '12px', padding: '1.25rem',
        textAlign: 'left', marginBottom: '1.5rem',
      }}>
        <p style={{ margin: '0 0 0.4rem', fontWeight: 500 }}>
          Podés intentarlo de nuevo.
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: 1.5 }}>
          A veces pasa que la tarjeta rechaza el pago o hay que confirmar algún dato.
          Los productos siguen guardados en tu carrito.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => router.push('/carrito')}
          style={{
            padding: '0.8rem 1.5rem', fontSize: '1rem',
            background: '#222', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
          }}
        >
          Volver al carrito
        </button>
        <button
          type="button"
          onClick={() => router.push('/')}
          style={{
            padding: '0.8rem 1.5rem', fontSize: '1rem',
            background: 'none', color: '#666',
            border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer',
          }}
        >
          Ir al inicio
        </button>
      </div>
    </main>
  );
}

export default function FalloPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>}>
      <FalloContenido />
    </Suspense>
  );
}