'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCarrito } from '@/context/CarritoContext';
import FormularioDireccion from '@/components/FormularioDireccion';

// Zonas de correo (misma definición que en el perfil del vendedor)
const ZONAS_CORREO = [
  { key: 'correo_1', nombre: 'Zona 1', descripcion: 'Buenos Aires, Córdoba, Entre Ríos, La Pampa, Santa Fe' },
  { key: 'correo_2', nombre: 'Zona 2', descripcion: 'Mendoza, San Luis, San Juan, Neuquén, Río Negro, La Rioja' },
  { key: 'correo_3', nombre: 'Zona 3', descripcion: 'Tucumán, Salta, Jujuy, Catamarca, Chaco, Corrientes, Formosa, Misiones, Sgo. del Estero' },
  { key: 'correo_4', nombre: 'Zona 4', descripcion: 'Chubut, Santa Cruz, Tierra del Fuego' },
];

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

  // === Config de envío del vendedor ===
  const [vendedorBarrioId, setVendedorBarrioId] = useState(null);
  const [metodosDisponibles, setMetodosDisponibles] = useState([]);
  const [costosVendedor, setCostosVendedor] = useState({});

  // === Costo dinámico de cadetería (depende de la zona) ===
  const [zonaCadeteria, setZonaCadeteria] = useState(null); // 1-4
  const [costoCadeteria, setCostoCadeteria] = useState(null);
  const [calculandoZona, setCalculandoZona] = useState(false);
  const [sinBarrio, setSinBarrio] = useState(false); // dirección sin barrio_id

  // === Correo: zona elegida por el comprador ===
  const [zonaCorreoElegida, setZonaCorreoElegida] = useState(null);

  // === Calcular costo de envío según método elegido ===
  function costoEnvioActual() {
    if (metodoElegido === 'retiro') return 0;
    if (metodoElegido === 'cadeteria') return costoCadeteria ?? 0;
    if (metodoElegido === 'correo' && zonaCorreoElegida) {
      return costosVendedor[zonaCorreoElegida] ?? 0;
    }
    if (metodoElegido === 'acordar') return 0;
    return 0;
  }

  const costoEnvio = costoEnvioActual();
  const subtotal = subtotalLocal(vendedorId);
  const total = subtotal + costoEnvio;

  // === ¿El paso 1 está completo? ===
  const metodoPideDir = metodoElegido === 'cadeteria' || metodoElegido === 'correo';
  const cadeteriaSinCosto = metodoElegido === 'cadeteria' && costoCadeteria === null && !calculandoZona;
  const correoSinZona = metodoElegido === 'correo' && !zonaCorreoElegida;
  const paso1Listo = metodoElegido
    && (!metodoPideDir || direccionElegida)
    && !cadeteriaSinCosto
    && !correoSinZona
    && !sinBarrio;

  // === Cargar datos iniciales ===
  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCargando(false); return; }

      // Direcciones del comprador
      const { data: dirs } = await supabase
        .from('direcciones')
        .select('*')
        .eq('usuario_id', user.id)
        .order('creada_en');
      if (dirs && dirs.length > 0) {
        setDirecciones(dirs);
        const principal = dirs.find((d) => d.es_principal);
        setDireccionElegida(principal ? principal.id : dirs[0].id);
      }

      // Config de envío del vendedor
      const { data: vendedor } = await supabase
        .from('vendedores')
        .select('barrio_id, metodos_entrega_default, costos_envio_zona')
        .eq('id', vendedorId)
        .single();

      if (vendedor) {
        setVendedorBarrioId(vendedor.barrio_id);
        setMetodosDisponibles(vendedor.metodos_entrega_default || []);
        setCostosVendedor(vendedor.costos_envio_zona || {});
      }

      setCargando(false);
    }
    cargar();
  }, []);

  // === Calcular zona de cadetería cuando cambia la dirección ===
  useEffect(() => {
    async function calcularZona() {
      if (metodoElegido !== 'cadeteria' || !direccionElegida || !vendedorBarrioId) return;

      const dir = direcciones.find(d => d.id === direccionElegida);
      if (!dir) return;

      if (!dir.barrio_id) {
        setSinBarrio(true);
        setCostoCadeteria(null);
        setZonaCadeteria(null);
        return;
      }

      setSinBarrio(false);
      setCalculandoZona(true);

      const { data: zona, error } = await supabase.rpc('calcular_zona_envio', {
        barrio_vendedor_id: vendedorBarrioId,
        barrio_comprador_id: dir.barrio_id,
      });

      if (error) {
        console.error('Error calculando zona:', error);
        setCostoCadeteria(null);
        setZonaCadeteria(null);
      } else {
        setZonaCadeteria(zona);
        const costo = costosVendedor[`zona_${zona}`];
        setCostoCadeteria(costo !== undefined && costo !== null ? costo : null);
      }

      setCalculandoZona(false);
    }
    calcularZona();
  }, [metodoElegido, direccionElegida, vendedorBarrioId, costosVendedor, direcciones]);

  // Reset zona correo cuando cambia el método
  useEffect(() => {
    if (metodoElegido !== 'correo') setZonaCorreoElegida(null);
  }, [metodoElegido]);

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

  // === Construir métodos de envío desde la config del vendedor ===
  const metodos = [];

  if (metodosDisponibles.includes('retiro')) {
    metodos.push({ id: 'retiro', label: 'Retiro en el local', sub: 'Retirás en la dirección del vendedor', costoLabel: 'Gratis', pideDireccion: false, pideTurno: false });
  }

  if (metodosDisponibles.includes('cadeteria')) {
    let costoLabel = 'Seleccioná una dirección';
    if (calculandoZona) costoLabel = 'Calculando...';
    else if (sinBarrio) costoLabel = 'Dirección sin barrio';
    else if (costoCadeteria !== null) costoLabel = `$${fmt(costoCadeteria)}`;
    else if (costoCadeteria === null && zonaCadeteria) costoLabel = 'No disponible en tu zona';

    metodos.push({ id: 'cadeteria', label: 'Cadetería', sub: 'Envío dentro de Bahía Blanca', costoLabel, pideDireccion: true, pideTurno: true });
  }

  if (metodosDisponibles.includes('correo')) {
    let costoLabel = 'Elegí tu zona';
    if (zonaCorreoElegida) {
      const costo = costosVendedor[zonaCorreoElegida];
      costoLabel = costo !== null && costo !== undefined ? `$${fmt(costo)}` : 'No disponible';
    }
    metodos.push({ id: 'correo', label: 'Envío por correo', sub: 'Otras localidades del país', costoLabel, pideDireccion: true, pideTurno: false });
  }

  if (metodosDisponibles.includes('acordar')) {
    metodos.push({ id: 'acordar', label: 'Acordar con el vendedor', sub: 'Coordinás el envío por WhatsApp', costoLabel: 'A coordinar', pideDireccion: false, pideTurno: false });
  }

  // Si el vendedor no configuró ningún método, mostrar solo "acordar" como fallback
  if (metodos.length === 0) {
    metodos.push({ id: 'acordar', label: 'Acordar con el vendedor', sub: 'El vendedor aún no configuró sus envíos', costoLabel: 'A coordinar', pideDireccion: false, pideTurno: false });
  }

  const metodoActual = metodos.find(m => m.id === metodoElegido);
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
              <span style={{ fontSize: '0.85rem', color: activo ? '#222' : '#999', fontWeight: activo ? 500 : 400 }}>
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
              return (
                <div key={m.id}>
                  <div
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
                    <span style={{ fontSize: '0.85rem', color: m.costoLabel === 'Gratis' ? '#1e7e46' : '#222' }}>
                      {m.costoLabel}
                    </span>
                  </div>

                  {/* Sub-selector de zona correo */}
                  {sel && m.id === 'correo' && (
                    <div style={{ marginLeft: '2.5rem', marginBottom: '0.75rem', padding: '0.5rem 0' }}>
                      <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 0.5rem' }}>¿En qué zona estás?</p>
                      {ZONAS_CORREO.map(zc => {
                        const costo = costosVendedor[zc.key];
                        if (costo === null || costo === undefined) return null; // vendedor no envía a esta zona
                        const selZona = zonaCorreoElegida === zc.key;
                        return (
                          <div
                            key={zc.key}
                            onClick={() => setZonaCorreoElegida(zc.key)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.5rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
                              marginBottom: '0.35rem',
                              background: selZona ? '#e6f0ff' : 'transparent',
                            }}
                          >
                            <div style={{
                              width: '14px', height: '14px', borderRadius: '50%',
                              border: `1.5px solid ${selZona ? '#009ee3' : '#ccc'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              {selZona && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#009ee3' }} />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{zc.nombre}</div>
                              <div style={{ fontSize: '0.7rem', color: '#999' }}>{zc.descripcion}</div>
                            </div>
                            <span style={{ fontSize: '0.8rem' }}>${fmt(costo)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Aviso si la dirección no tiene barrio (cadetería) */}
                  {sel && m.id === 'cadeteria' && sinBarrio && (
                    <div style={{ marginLeft: '2.5rem', marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: '#fff3d6', borderRadius: '8px', fontSize: '0.8rem', color: '#8a6d00' }}>
                      Tu dirección no tiene barrio asignado. Agregá una nueva dirección con barrio para que podamos calcular el costo de envío.
                    </div>
                  )}

                  {/* Aviso zona no disponible (cadetería) */}
                  {sel && m.id === 'cadeteria' && !sinBarrio && costoCadeteria === null && zonaCadeteria && (
                    <div style={{ marginLeft: '2.5rem', marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: '#fdecea', borderRadius: '8px', fontSize: '0.8rem', color: '#7a1f17' }}>
                      Este vendedor no hace envíos a tu zona. Probá con otro método de entrega.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* --- Turno (solo para cadetería) --- */}
          {metodoActual?.pideTurno && (
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
          {metodoActual?.pideDireccion && (
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
                            {!dir.barrio_id && (
                              <span style={{ fontSize: '0.7rem', background: '#fff3d6', color: '#8a6d00', padding: '1px 6px', borderRadius: '20px' }}>
                                Sin barrio
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
              <div key={item.productoId + (item.variante || '')} style={{
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
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', color: '#555' }}>{metodoActual?.label}</p>
            {metodoActual?.pideTurno && (
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
              <span>{metodoElegido === 'acordar' ? 'A coordinar' : (costoEnvio === 0 ? 'Gratis' : `$${fmt(costoEnvio)}`)}</span>
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

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>}>
      <CheckoutContenido />
    </Suspense>
  );
}
