'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Cropper from 'react-easy-crop';
import VolverAtras from '@/components/VolverAtras';


// --- Utilidades de recorte ---

function crearImagen(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (err) => reject(err));
    img.src = url;
  });
}

async function recortarImagen(src, areaPixels, anchoSalida, altoSalida) {
  const imagen = await crearImagen(src);
  const canvas = document.createElement('canvas');
  canvas.width = anchoSalida;
  canvas.height = altoSalida;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imagen, areaPixels.x, areaPixels.y, areaPixels.width, areaPixels.height, 0, 0, anchoSalida, altoSalida);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.9);
  });
}

const CONFIG = {
  logo: { aspect: 1, anchoSalida: 600, altoSalida: 600, minLado: 400, etiqueta: 'logo' },
  portada: { aspect: 16 / 9, anchoSalida: 1600, altoSalida: 900, minLado: 0, etiqueta: 'portada' },
};

const TIPOS_VALIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 3 * 1024 * 1024;

// --- Zonas de envío ---
const ZONAS = [
  { key: 'zona_1', nombre: 'Tu barrio', descripcion: 'Mismo barrio que tu negocio' },
  { key: 'zona_2', nombre: 'Barrios cercanos', descripcion: 'Hasta 3 km' },
  { key: 'zona_3', nombre: 'Zona media', descripcion: 'Hasta 7 km' },
  { key: 'zona_4', nombre: 'Zona lejana', descripcion: 'Más de 7 km' },
];

const ZONAS_CORREO = [
  { key: 'correo_1', nombre: 'Zona 1', descripcion: 'Buenos Aires, Córdoba, Entre Ríos, La Pampa, Santa Fe' },
  { key: 'correo_2', nombre: 'Zona 2', descripcion: 'Mendoza, San Luis, San Juan, Neuquén, Río Negro, La Rioja' },
  { key: 'correo_3', nombre: 'Zona 3', descripcion: 'Tucumán, Salta, Jujuy, Catamarca, Chaco, Corrientes, Formosa, Misiones, Sgo. del Estero' },
  { key: 'correo_4', nombre: 'Zona 4', descripcion: 'Chubut, Santa Cruz, Tierra del Fuego' },
];

export default function PerfilVendedorPage() {
  const supabase = createClient();
  const router = useRouter();

  const [vendedorId, setVendedorId] = useState(null);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [portadaUrl, setPortadaUrl] = useState(null);
  const [mpConectado, setMpConectado] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Recorte de imágenes
  const [recorte, setRecorte] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  // Envíos
  const [metodosActivos, setMetodosActivos] = useState([]);
  const [costosZona, setCostosZona] = useState({});
  const [costosCorreo, setCostosCorreo] = useState({});
  const [guardandoEnvios, setGuardandoEnvios] = useState(false);
  const [enviosGuardados, setEnviosGuardados] = useState(false);

  useEffect(() => {
    async function cargarVendedor() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCargando(false); return; }
      const { data, error } = await supabase
        .from('vendedores')
        .select('id, nombre_negocio, logo_url, portada_url, mercadopago_conectado, metodos_entrega_default, costos_envio_zona')
        .eq('usuario_id', user.id)
        .single();
      if (error) {
        console.error('Error cargando el vendedor:', error);
      } else if (data) {
        setVendedorId(data.id);
        setNombreNegocio(data.nombre_negocio || '');
        setLogoUrl(data.logo_url);
        setPortadaUrl(data.portada_url);
        setMpConectado(data.mercadopago_conectado || false);

        // Cargar métodos de envío activos
        setMetodosActivos(data.metodos_entrega_default || []);

        // Cargar costos por zona
        const costos = data.costos_envio_zona || {};
        setCostosZona({
          zona_1: costos.zona_1 !== undefined && costos.zona_1 !== null ? String(costos.zona_1) : '',
          zona_2: costos.zona_2 !== undefined && costos.zona_2 !== null ? String(costos.zona_2) : '',
          zona_3: costos.zona_3 !== undefined && costos.zona_3 !== null ? String(costos.zona_3) : '',
          zona_4: costos.zona_4 !== undefined && costos.zona_4 !== null ? String(costos.zona_4) : '',
        });
        setCostosCorreo({
    correo_1: costos.correo_1 != null ? String(costos.correo_1) : '',
    correo_2: costos.correo_2 != null ? String(costos.correo_2) : '',
    correo_3: costos.correo_3 != null ? String(costos.correo_3) : '',
    correo_4: costos.correo_4 != null ? String(costos.correo_4) : '',
      });
      }
      setCargando(false);
    }
    cargarVendedor();
  }, []);

  // --- Métodos de envío ---

  function toggleMetodo(metodo) {
    setEnviosGuardados(false);
    setMetodosActivos(prev =>
      prev.includes(metodo)
        ? prev.filter(m => m !== metodo)
        : [...prev, metodo]
    );
  }

  function actualizarCostoZona(zona, valor) {
    setEnviosGuardados(false);
    setCostosZona(prev => ({ ...prev, [zona]: valor.replace(/\D/g, '') }));
  }

  async function guardarEnvios() {
    setGuardandoEnvios(true);

    // Armar el JSONB de costos
    const costosParaGuardar = {};

    if (metodosActivos.includes('cadeteria')) {
      ZONAS.forEach(z => {
        const valor = costosZona[z.key];
        costosParaGuardar[z.key] = valor !== '' ? Number(valor) : null;
      });
    }

    if (metodosActivos.includes('correo')) {
      ZONAS_CORREO.forEach(z => {
        const valor = costosCorreo[z.key];
        costosParaGuardar[z.key] = valor !== '' ? Number(valor) : null;
      });
    }

    const { error } = await supabase
      .from('vendedores')
      .update({
        metodos_entrega_default: metodosActivos,
        costos_envio_zona: costosParaGuardar,
      })
      .eq('id', vendedorId);

    if (error) {
      alert('No se pudieron guardar los costos de envío: ' + error.message);
    } else {
      setEnviosGuardados(true);
      setTimeout(() => setEnviosGuardados(false), 3000);
    }
    setGuardandoEnvios(false);
  }

  // --- Recorte de imágenes (sin cambios) ---

  const alCompletarRecorte = useCallback((_, pixels) => {
    setAreaPixels(pixels);
  }, []);

  async function elegirArchivo(e, destino) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!TIPOS_VALIDOS.includes(archivo.type)) { alert('La imagen tiene que ser JPG, PNG o WEBP.'); return; }
    if (archivo.size > MAX_BYTES) { alert('La imagen no puede pesar más de 3 MB.'); return; }
    const src = URL.createObjectURL(archivo);
    if (CONFIG[destino].minLado > 0) {
      const img = await crearImagen(src);
      if (img.naturalWidth < CONFIG[destino].minLado || img.naturalHeight < CONFIG[destino].minLado) {
        URL.revokeObjectURL(src);
        alert(`El logo tiene que ser de al menos ${CONFIG[destino].minLado}×${CONFIG[destino].minLado} px.`);
        return;
      }
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAreaPixels(null);
    setRecorte({ src, destino });
  }

  function cerrarRecorte() {
    if (recorte?.src) URL.revokeObjectURL(recorte.src);
    setRecorte(null);
  }

  async function recortarYSubir() {
    if (!recorte || !areaPixels || !vendedorId) return;
    const config = CONFIG[recorte.destino];
    setSubiendo(true);
    try {
      const blob = await recortarImagen(recorte.src, areaPixels, config.anchoSalida, config.altoSalida);
      const bucket = recorte.destino === 'logo' ? 'logos' : 'portadas';
      const ruta = `${vendedorId}/${config.etiqueta}.webp`;
      const { error: errorUpload } = await supabase.storage.from(bucket).upload(ruta, blob, { upsert: true, contentType: 'image/webp' });
      if (errorUpload) throw new Error('No se pudo subir la imagen: ' + errorUpload.message);
      const { data: dataUrl } = supabase.storage.from(bucket).getPublicUrl(ruta);
      const urlFinal = `${dataUrl.publicUrl}?v=${Date.now()}`;
      const columna = recorte.destino === 'logo' ? 'logo_url' : 'portada_url';
      const { error: errorUpdate } = await supabase.from('vendedores').update({ [columna]: urlFinal }).eq('id', vendedorId);
      if (errorUpdate) throw new Error('La imagen se subió pero no se pudo guardar: ' + errorUpdate.message);
      if (recorte.destino === 'logo') setLogoUrl(urlFinal);
      else setPortadaUrl(urlFinal);
      cerrarRecorte();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Hubo un error. Probá de nuevo.');
    } finally {
      setSubiendo(false);
    }
  }

  function formatearPrecio(valor) {
    if (!valor) return '';
    return Number(valor).toLocaleString('es-AR');
  }

  // --- Render ---

  if (cargando) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>;
  }

  if (!vendedorId) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>No encontramos tu cuenta de vendedor.</main>;
  }

  const inputPrecioStyle = {
    width: '120px', padding: '0.45rem 0.6rem', paddingLeft: '1.4rem',
    border: '1px solid #ccc', borderRadius: '8px', fontSize: '0.9rem',
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '700px', width: '100%', margin: '0 auto' }}>
      <VolverAtras href="/perfil" texto="Volver a Mi perfil" />
      <h1>Mi negocio</h1>
      <p style={{ color: '#666', marginTop: '0.25rem' }}>{nombreNegocio}</p>

      {/* ═══ IDENTIDAD VISUAL ═══ */}
      <section style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Identidad visual</h2>

        <div style={{ position: 'relative', marginTop: '1rem' }}>
          <div style={{ aspectRatio: '16 / 9', maxHeight: '240px', background: '#f5f5f5', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
            {portadaUrl ? (
              <img src={portadaUrl} alt="Portada" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '0.9rem' }}>Sin portada (opcional)</span>
            )}
          </div>
          <div style={{ position: 'absolute', left: '20px', bottom: '-28px', width: '96px', height: '96px', borderRadius: '8px', overflow: 'hidden', background: '#eee', boxShadow: '0 0 0 4px white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '0.7rem' }}>Sin logo</span>
            )}
          </div>
        </div>

        <div style={{ paddingTop: '44px', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ padding: '0.6rem 1.2rem', border: '1px solid #222', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>
            {logoUrl ? 'Cambiar logo' : 'Subir logo *'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => elegirArchivo(e, 'logo')} style={{ display: 'none' }} />
          </label>
          <label style={{ padding: '0.6rem 1.2rem', border: '1px solid #222', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>
            {portadaUrl ? 'Cambiar portada' : 'Subir portada'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => elegirArchivo(e, 'portada')} style={{ display: 'none' }} />
          </label>
        </div>

        <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#666', lineHeight: 1.7 }}>
          <div>Logo: obligatorio · cuadrado · mínimo 400×400 px</div>
          <div>Portada: opcional · panorámica 16:9</div>
          <div>JPG, PNG o WEBP · hasta 3 MB</div>
        </div>
      </section>

      {/* ═══ COSTOS DE ENVÍO ═══ */}
      <section style={{ marginTop: '1.5rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.25rem' }}>Costos de envío</h2>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
          Elegí qué métodos de envío ofrecés y cuánto cobrás. Los costos de cadetería se calculan automáticamente según la distancia entre tu barrio y el del comprador.
        </p>

        {/* Retiro */}
        <div
          onClick={() => toggleMetodo('retiro')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
            marginBottom: '0.5rem',
            border: metodosActivos.includes('retiro') ? '2px solid #222' : '1px solid #ddd',
          }}
        >
          <input type="checkbox" checked={metodosActivos.includes('retiro')} readOnly
            style={{ width: '18px', height: '18px', accentColor: '#222' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Retiro en el local</div>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>El comprador retira en tu dirección</div>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#1e7e46', fontWeight: 500 }}>Gratis</span>
        </div>

        {/* Cadetería */}
        <div
          style={{
            borderRadius: '8px', marginBottom: '0.5rem',
            border: metodosActivos.includes('cadeteria') ? '2px solid #222' : '1px solid #ddd',
          }}
        >
          <div
            onClick={() => toggleMetodo('cadeteria')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', cursor: 'pointer' }}
          >
            <input type="checkbox" checked={metodosActivos.includes('cadeteria')} readOnly
              style={{ width: '18px', height: '18px', accentColor: '#222' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Cadetería</div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>Envíos dentro de Bahía Blanca. Vos elegís con quién envías, con una app de envíos o cadetería propia.</div>
            </div>
          </div>

          {metodosActivos.includes('cadeteria') && (
            <div style={{ padding: '0 1rem 1rem', marginLeft: '2.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 0.75rem' }}>
                Definí el costo para cada zona. Dejá vacío si no enviás a alguna de ellas.
              </p>
              {ZONAS.map(zona => (
                <div key={zona.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{zona.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: '#999' }}>{zona.descripcion}</div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '0.9rem' }}>$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatearPrecio(costosZona[zona.key])}
                      onChange={(e) => actualizarCostoZona(zona.key, e.target.value)}
                      placeholder="—"
                      style={inputPrecioStyle}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Correo */}
        <div
          style={{
            borderRadius: '8px', marginBottom: '0.5rem',
            border: metodosActivos.includes('correo') ? '2px solid #222' : '1px solid #ddd',
          }}
        >
          <div
            onClick={() => toggleMetodo('correo')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', cursor: 'pointer' }}
          >
            <input type="checkbox" checked={metodosActivos.includes('correo')} readOnly
              style={{ width: '18px', height: '18px', accentColor: '#222' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Envíos a otras localidades por Correo</div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>Pueblos y ciudades de la zona</div>
            </div>
          </div>

          {metodosActivos.includes('correo') && (
            <div style={{ padding: '0 1rem 1rem', marginLeft: '2.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 0.75rem' }}>
                Definí el costo para cada zona. Dejá vacío si no enviás a esa zona.
              </p>
              {ZONAS_CORREO.map(zona => (
                <div key={zona.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{zona.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: '#999' }}>{zona.descripcion}</div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '0.9rem' }}>$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatearPrecio(costosCorreo[zona.key])}
                      onChange={(e) => {
                        setEnviosGuardados(false);
                        setCostosCorreo(prev => ({ ...prev, [zona.key]: e.target.value.replace(/\D/g, '') }));
                      }}
                      placeholder="—"
                      style={inputPrecioStyle}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acordar */}
        <div
          onClick={() => toggleMetodo('acordar')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
            marginBottom: '0.75rem',
            border: metodosActivos.includes('acordar') ? '2px solid #222' : '1px solid #ddd',
          }}
        >
          <input type="checkbox" checked={metodosActivos.includes('acordar')} readOnly
            style={{ width: '18px', height: '18px', accentColor: '#222' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Acordar con el comprador</div>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>Coordinás el envío por WhatsApp después de la compra</div>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#888' }}>Sin costo fijo</span>
        </div>

        {/* Guardar envíos */}
        <button
          type="button"
          onClick={guardarEnvios}
          disabled={guardandoEnvios}
          style={{
            padding: '0.6rem 1.2rem', fontSize: '0.9rem', border: 'none', borderRadius: '8px',
            background: enviosGuardados ? '#1e7e46' : (guardandoEnvios ? '#999' : '#222'),
            color: 'white', cursor: guardandoEnvios ? 'not-allowed' : 'pointer',
          }}
        >
          {guardandoEnvios ? 'Guardando...' : (enviosGuardados ? '✓ Guardado' : 'Guardar envíos')}
        </button>
      </section>

      {/* ═══ COBROS ═══ */}
      <section style={{ marginTop: '1.5rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Cobros</h2>

        {mpConectado ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#e9f7ef', borderRadius: '8px', padding: '0.9rem 1rem', marginTop: '0.75rem' }}>
            <span style={{ fontSize: '1.4rem' }}>✓</span>
            <div>
              <div style={{ fontWeight: 600, color: '#1e7e46' }}>MercadoPago conectado</div>
              <div style={{ fontSize: '0.85rem', color: '#1e7e46' }}>Vas a recibir el dinero de tus ventas en tu cuenta.</div>
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0 1rem', lineHeight: 1.6 }}>
              Conectá tu cuenta de MercadoPago para recibir el dinero de tus ventas.
            </p>
            <a href="/api/mercadopago/oauth/start"
              style={{ display: 'inline-block', padding: '0.75rem 1.5rem', fontSize: '1rem', background: '#009ee3', color: 'white', border: 'none', borderRadius: '8px', textDecoration: 'none' }}
            >
              Conectar con MercadoPago
            </a>
          </>
        )}
      </section>

      {/* Botón general */}
      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => router.push('/vendedor/productos')}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', background: '#222', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Volver a mis productos
        </button>
      </div>

      {/* MODAL DE RECORTE */}
      {recorte && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '520px', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #eee' }}>
              <p style={{ fontWeight: 600, margin: 0 }}>Recortá tu {CONFIG[recorte.destino].etiqueta}</p>
              <p style={{ fontSize: '0.85rem', color: '#666', margin: '2px 0 0' }}>Arrastrá para mover y usá el zoom para ajustar</p>
            </div>
            <div style={{ position: 'relative', width: '100%', height: '320px', background: '#333' }}>
              <Cropper image={recorte.src} crop={crop} zoom={zoom} aspect={CONFIG[recorte.destino].aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={alCompletarRecorte} />
            </div>
            <div style={{ padding: '1rem 1.5rem' }}>
              <label style={{ fontSize: '0.85rem', color: '#666', display: 'block', marginBottom: '0.4rem' }}>Zoom</label>
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #eee', background: '#fafafa' }}>
              <button type="button" onClick={cerrarRecorte} disabled={subiendo}
                style={{ padding: '0.6rem 1.2rem', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="button" onClick={recortarYSubir} disabled={subiendo || !areaPixels}
                style={{ padding: '0.6rem 1.2rem', border: 'none', borderRadius: '8px', background: subiendo ? '#999' : '#222', color: 'white', cursor: subiendo ? 'not-allowed' : 'pointer' }}>
                {subiendo ? 'Subiendo...' : 'Recortar y subir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
