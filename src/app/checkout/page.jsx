'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCarrito } from '@/context/CarritoContext';
import FormularioDireccion from '@/components/FormularioDireccion';

function CheckoutContenido() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const vendedorId = Number(searchParams.get('vendedor'));

  const { locales, subtotalLocal } = useCarrito();
  const local = locales.find((l) => l.vendedorId === vendedorId);

  // === Estado del wizard ===
  const [paso, setPaso] = useState(1);

  // === Estado del paso 1: Entrega ===
  const [direcciones, setDirecciones] = useState([]);
  const [direccionElegida, setDireccionElegida] = useState(null);
  const [mostrarFormDir, setMostrarFormDir] = useState(false);
  const [metodoElegido, setMetodoElegido] = useState(null);
  const [turno, setTurno] = useState('Indistinto');
  const [cargando, setCargando] = useState(true);
  const [pagando, setPagando] = useState(false);

  // === Métodos de envío (después van a venir de la config del vendedor) ===
  const metodos = [
    { id: 'retiro', label: 'Retiro en el local', costo: 0, pideDireccion: false, pideTurno: false },
    { id: 'cadeteria', label: 'Cadetería', sub: 'Dentro de Bahía Blanca', costo: 1800, pideDireccion: true, pideTurno: true },
    { id: 'correo', label: 'Envíos a otras localidades', sub: 'Pueblos de la zona', costo: 2500, pideDireccion: true, pideTurno: false },
    { id: 'acordar', label: 'Acordar con el vendedor', sub: 'Coordinás el envío por WhatsApp', costo: null, pideDireccion: false, pideTurno: false },
  ];

  const metodo = metodos.find((m) => m.id === metodoElegido);
  const costoEnvio = metodo?.costo ?? 0;
  const subtotal = subtotalLocal(vendedorId);
  const total = subtotal + costoEnvio;

  // === ¿El paso 1 está completo? ===
  const necesitaDireccion = metodo?.pideDireccion;
  const paso1Listo = metodoElegido && (!necesitaDireccion || direccionElegida);

  // === Cargar las direcciones del comprador ===
  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCargando(false); return; }
      const { data } = await supabase
        .from('direcciones')
        .select('*')
        .eq('usuario_id', user.id)
        .order('creada_en');
      if (data && data.length > 0) {
        setDirecciones(data);
        const principal = data.find((d) => d.es_principal);
        setDireccionElegida(principal ? principal.id : data[0].id);
      }
      setCargando(false);
    }
    cargar();
  }, []);

  function fmt(n) {
    return Number(n).toLocaleString('es-AR');
  }

  function alGuardarDireccion(nueva) {
    setDirecciones((actual) => [...actual, nueva]);
    setDireccionElegida(nueva.id);
    setMostrarFormDir(false);
  }

  async function pagar() {
    setPagando(true);
    try {
      const res = await fetch('/api/pedidos/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendedorId: local.vendedorId,
          items: local.items,
          metodoEnvio: metodoElegido,
          direccionId: direccionElegida,
          turnoPreferido: turno,
          subtotalProductos: subtotal,
          costoEnvio: costoEnvio,
          total: total,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert('Error: ' + (data.error || 'No se pudo procesar el pago.'));
        setPagando(false);
        return;
      }

      // Mandar al comprador a MercadoPago para que pague.
      window.location.href = data.checkout_url;
    } catch (err) {
      alert('Error al conectar con el servidor. Probá de nuevo.');
      setPagando(false);
    }
  }

  // === Cargando / error ===
  if (cargando) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>;
  }

  if (!local) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <p>No encontramos ese local en tu carrito.</p>
        <button
          onClick={() => router.push('/carrito')}
          style={{ marginTop: '1rem', padding: '0.7rem 1.5rem', background: '#222', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Volver al carrito
        </button>
      </main>
    );
  }

  const dirElegida = direcciones.find((d) => d.id === direccionElegida);

  // === Barra de progreso ===
  const pasos = ['Entrega', 'Revisar y pagar'];

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', width: '100%', margin: '0 auto' }}>

      {/* Barra de progreso */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {pasos.map((nombre, i) => {
          const num = i + 1;
          const activo = num === paso;
          const listo = num < paso;
          return (
            <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 500,
                background: listo ? '#1e7e46' : (activo ? '#009ee3' : 'transparent'),
                color: listo ? 'white' : (activo ? 'white' : '#999'),
                border: (listo || activo) ? 'none' : '1px solid #ccc',
              }}>
                {listo ? '✓' : num}
              </div>
              <span style={{
                fontSize: '0.85rem',
                color: activo ? '#222' : '#999',
                fontWeight: activo ? 500 : 400,
              }}>
                {nombre}
              </span>
              {i < pasos.length - 1 && (
                <div style={{ width: '30px', height: '1px', background: listo ? '#1e7e46' : '#ddd', margin: '0 0.3rem' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* =================== PASO 1: ENTREGA =================== */}
      {paso === 1 && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem' }}>¿Cómo lo recibís?</h2>
          <p style={{ color: '#666', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
            Comprando en {local.vendedorNombre}.
          </p>

          {/* --- Método de envío --- */}
          <div style={{ marginBottom: '1.5rem' }}>
            {metodos.map((m) => {
              const sel = metodoElegido === m.id;
              const precio = m.costo === null
                ? 'A coordinar'
                : (m.costo === 0 ? 'Gratis' : `$${fmt(m.costo)}`);
              return (
                <div
                  key={m.id}
                  onClick={() => setMetodoElegido(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.8rem 1rem', borderRadius: '8px', cursor: 'pointer',
                    marginBottom: '0.5rem',
                    border: sel ? '2px solid #009ee3' : '1px solid #ddd',
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%',
                    border: `1.5px solid ${sel ? '#009ee3' : '#bbb'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {sel && <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#009ee3' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{m.label}</div>
                    {m.sub && <div style={{ fontSize: '0.8rem', color: '#888' }}>{m.sub}</div>}
                  </div>
                  <span style={{ fontSize: '0.85rem', color: m.costo === null ? '#888' : '#222' }}>{precio}</span>
                </div>
              );
            })}
          </div>

          {/* --- Turno (solo para cadetería) --- */}
          {metodo?.pideTurno && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.4rem' }}>
                ¿Cuándo te queda mejor recibirlo?
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['Mañana', 'Tarde', 'Indistinto'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTurno(t)}
                    style={{
                      flex: 1, padding: '0.6rem',
                      border: turno === t ? '2px solid #009ee3' : '1px solid #ccc',
                      borderRadius: '8px', background: 'none', cursor: 'pointer',
                      color: turno === t ? '#009ee3' : '#666',
                      fontWeight: turno === t ? 500 : 400,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.4rem 0 0' }}>
                Es una preferencia; el vendedor la usa para coordinar la franja.
              </p>
            </div>
          )}

          {/* --- Dirección (solo si el método la pide) --- */}
          {necesitaDireccion && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                ¿A dónde lo enviamos?
              </label>

              {direcciones.length === 0 && !mostrarFormDir ? (
                <div style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', color: '#888', margin: '0 0 0.75rem' }}>
                    Es tu primera compra. Cargá una dirección de entrega.
                  </p>
                  <FormularioDireccion esPrimera={true} onGuardada={alGuardarDireccion} />
                </div>
              ) : (
                <>
                  {direcciones.map((dir) => {
                    const sel = direccionElegida === dir.id;
                    return (
                      <div
                        key={dir.id}
                        onClick={() => setDireccionElegida(dir.id)}
                        style={{
                          display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                          padding: '0.8rem 1rem', borderRadius: '8px', cursor: 'pointer',
                          marginBottom: '0.5rem',
                          border: sel ? '2px solid #009ee3' : '1px solid #ddd',
                        }}
                      >
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '50%',
                          border: `1.5px solid ${sel ? '#009ee3' : '#bbb'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: '2px',
                        }}>
                          {sel && <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#009ee3' }} />}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 500 }}>{dir.etiqueta || 'Sin etiqueta'}</span>
                            {dir.es_principal && (
                              <span style={{ fontSize: '0.7rem', background: '#e6f0ff', color: '#1a5fb4', padding: '1px 6px', borderRadius: '20px' }}>
                                Principal
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#666' }}>
                            {dir.calle} {dir.numero}{dir.piso_depto ? `, ${dir.piso_depto}` : ''}<br />
                            Tel. {dir.telefono}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {mostrarFormDir ? (
                    <div style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1rem', marginTop: '0.5rem' }}>
                      <FormularioDireccion
                        esPrimera={direcciones.length === 0}
                        onGuardada={alGuardarDireccion}
                        onCancelar={() => setMostrarFormDir(false)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMostrarFormDir(true)}
                      style={{
                        width: '100%', padding: '0.65rem', border: '1px dashed #aaa',
                        borderRadius: '8px', background: 'none', color: '#1a5fb4',
                        fontSize: '0.85rem', cursor: 'pointer',
                      }}
                    >
                      + Usar otra dirección
                    </button>
                  )}
                </>
              )}
              <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.5rem 0 0' }}>
                Tus datos se comparten solo con {local.vendedorNombre}, solo para este pedido.
              </p>
            </div>
          )}

          {/* Aviso de "acordar" */}
          {metodoElegido === 'acordar' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', background: '#f7f7f7', borderRadius: '8px', padding: '0.75rem 0.9rem', marginBottom: '1rem' }}>
              <span>💬</span>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#666', lineHeight: 1.5 }}>
                Pagás solo los productos ahora. El envío lo coordinás con {local.vendedorNombre} por WhatsApp después.
              </p>
            </div>
          )}

          {/* Botón continuar */}
          <button
            type="button"
            disabled={!paso1Listo}
            onClick={() => setPaso(2)}
            style={{
              width: '100%', padding: '0.85rem', fontSize: '1rem',
              border: 'none', borderRadius: '8px',
              cursor: paso1Listo ? 'pointer' : 'not-allowed',
              background: paso1Listo ? '#009ee3' : '#ccc',
              color: 'white', marginTop: '0.5rem',
            }}
          >
            Continuar
          </button>
        </div>
      )}

      {/* =================== PASO 2: REVISAR Y PAGAR =================== */}
      {paso === 2 && (
        <div>
          <button
            type="button"
            onClick={() => setPaso(1)}
            style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.85rem', cursor: 'pointer', padding: 0, marginBottom: '1rem' }}
          >
            ← Volver a entrega
          </button>

          <h2 style={{ margin: '0 0 1rem' }}>Revisá tu compra</h2>

          {/* Vendedor y productos */}
          <div style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>🏪 {local.vendedorNombre}</div>
            {local.items.map((item) => (
              <div key={item.productoId} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '0.4rem 0', borderTop: '1px solid #eee', fontSize: '0.9rem',
              }}>
                <span style={{ color: '#555' }}>
                  {item.nombre}{item.variante ? ` · ${item.variante}` : ''} × {item.cantidad}
                </span>
                <span>${fmt(item.precio * item.cantidad)}</span>
              </div>
            ))}
          </div>

          {/* Entrega */}
          <div style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Entrega</div>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', color: '#555' }}>{metodo?.label}</p>
            {metodo?.pideTurno && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#888' }}>
                Preferencia: {turno.toLowerCase()}
              </p>
            )}
            {dirElegida && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#555' }}>
                {dirElegida.calle} {dirElegida.numero}
                {dirElegida.piso_depto ? `, ${dirElegida.piso_depto}` : ''}<br />
                Tel. {dirElegida.telefono}
              </p>
            )}
          </div>

          {/* Totales */}
          <div style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span style={{ color: '#666' }}>Productos</span>
              <span>${fmt(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span style={{ color: '#666' }}>Envío</span>
              <span>{metodo?.costo === null ? 'A coordinar' : (metodo?.costo === 0 ? 'Gratis' : `$${fmt(costoEnvio)}`)}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 600,
              padding: '0.5rem 0 0', borderTop: '1px solid #eee', marginTop: '0.25rem',
            }}>
              <span>Total</span>
              <span>${fmt(total)}</span>
            </div>
          </div>

          {/* Botón pagar */}
          <button
            type="button"
            disabled={pagando}
            onClick={pagar}
            style={{
              width: '100%', padding: '0.9rem', fontSize: '1.05rem',
              background: pagando ? '#999' : '#009ee3', color: 'white',
              border: 'none', borderRadius: '8px',
              cursor: pagando ? 'not-allowed' : 'pointer',
            }}
          >
            {pagando ? 'Procesando...' : 'Pagar con MercadoPago'}
          </button>
        </div>
      )}
    </main>
  );
}

// Envoltorio necesario para que useSearchParams funcione bien en Next.js
export default function CheckoutPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>}>
      <CheckoutContenido />
    </Suspense>
  );
}