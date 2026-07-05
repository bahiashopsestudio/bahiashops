'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function PendienteContenido() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pedidoId = searchParams.get('pedido');

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%', background: '#fff8e1',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '2rem auto 1rem', fontSize: '2rem',
      }}>
        ⏳
      </div>

      <h1 style={{ margin: '0 0 0.5rem' }}>Tu pago está en proceso</h1>
      <p style={{ fontSize: '1rem', color: '#555', margin: '0 0 0.5rem', lineHeight: 1.5 }}>
        Estamos esperando la confirmación de MercadoPago.
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
          Es normal si elegiste pago en efectivo o transferencia.
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: 1.5 }}>
          Estos métodos pueden tardar hasta 48 horas en acreditarse. Apenas se confirme,
          te avisamos por mail y el vendedor empieza a preparar tu pedido.
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
        Ir al inicio
      </button>
    </main>
  );
}

export default function PendientePage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>}>
      <PendienteContenido />
    </Suspense>
  );
}