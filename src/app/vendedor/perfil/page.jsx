'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Cropper from 'react-easy-crop';
import Navbar from '@/components/Navbar';
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


function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0">
      <path d="M7.5 5l5 5-5 5" />
    </svg>
  );
}


export default function PerfilVendedorPage() {
  const supabase = createClient();
  const router = useRouter();

  const [vendedorId, setVendedorId] = useState(null);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [portadaUrl, setPortadaUrl] = useState(null);
  const [mpConectado, setMpConectado] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [recorte, setRecorte] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    async function cargarVendedor() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCargando(false); return; }
      const { data, error } = await supabase
        .from('vendedores')
        .select('id, nombre_negocio, logo_url, portada_url, mercadopago_conectado')
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
      }
      setCargando(false);
    }
    cargarVendedor();
  }, []);

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

  // --- Render ---

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-gray-500">Cargando...</main>
      </>
    );
  }

  if (!vendedorId) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-gray-500">No encontramos tu cuenta de vendedor.</main>
      </>
    );
  }

  return (
    <>
      <Navbar variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[700px] w-full mx-auto">
        <VolverAtras href="/perfil" texto="Volver a Mi perfil" />
        <h1 className="text-2xl font-semibold text-[#0a0a0a] mt-2">Mi negocio</h1>
        <p className="text-gray-500 mt-1">{nombreNegocio}</p>

        {/* ═══ PORTADA + LOGO ═══ */}
        <div className="relative mt-8">
          <div className="aspect-video rounded-xl overflow-hidden bg-[#F5F2EC] flex items-center justify-center text-gray-400">
            {portadaUrl ? (
              <img src={portadaUrl} alt="Portada" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm">Sin portada (opcional)</span>
            )}
          </div>
          <div className="absolute left-5 -bottom-7 w-24 h-24 rounded-xl overflow-hidden bg-gray-100 shadow-[0_0_0_4px_white] flex items-center justify-center text-gray-400">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs">Sin logo</span>
            )}
          </div>
        </div>

        <div className="pt-11 flex gap-3 flex-wrap">
          <label className="px-5 py-2.5 border border-[#0a0a0a] rounded-lg cursor-pointer text-[0.95rem] text-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white transition-colors">
            {logoUrl ? 'Cambiar logo' : 'Subir logo *'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => elegirArchivo(e, 'logo')} className="hidden" />
          </label>
          <label className="px-5 py-2.5 border border-[#0a0a0a] rounded-lg cursor-pointer text-[0.95rem] text-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white transition-colors">
            {portadaUrl ? 'Cambiar portada' : 'Subir portada'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => elegirArchivo(e, 'portada')} className="hidden" />
          </label>
        </div>
        <div className="mt-3 text-xs text-gray-500 leading-relaxed space-y-0.5">
          <div>Logo: obligatorio · cuadrado · mínimo 400×400 px</div>
          <div>Portada: opcional · panorámica 16:9</div>
          <div>JPG, PNG o WEBP · hasta 3 MB</div>
        </div>

        {/* ═══ MENÚ DEL NEGOCIO ═══ */}
        <div className="mt-10 border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          <Link href="/vendedor/productos" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-gray-50 transition-colors">
            <span className="text-lg">📦</span>
            <span className="flex-1 font-medium">Mis productos</span>
            <Chevron />
          </Link>
          <Link href="/vendedor/pedidos" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-gray-50 transition-colors">
            <span className="text-lg">🛒</span>
            <span className="flex-1 font-medium">Mis pedidos</span>
            <Chevron />
          </Link>
          <Link href="/vendedor/envios" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-gray-50 transition-colors">
            <span className="text-lg">🚚</span>
            <span className="flex-1 font-medium">Costos de envío</span>
            <Chevron />
          </Link>
        </div>

        {/* ═══ COBROS ═══ */}
        <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
          {mpConectado ? (
            <div className="flex items-center gap-3 bg-emerald-50 px-5 py-4">
              <span className="text-xl">✓</span>
              <div className="flex-1">
                <div className="font-semibold text-emerald-700">MercadoPago conectado</div>
                <div className="text-sm text-emerald-700">Recibís el dinero de tus ventas en tu cuenta.</div>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4">
              <p className="text-sm text-gray-500 m-0 mb-3 leading-relaxed">
                Conectá tu cuenta de MercadoPago para recibir el dinero de tus ventas.
              </p>
              <a
                href="/api/mercadopago/oauth/start"
                className="inline-block px-6 py-3 text-base bg-[#009ee3] text-white rounded-lg no-underline hover:bg-[#008dd0] transition-colors"
              >
                Conectar con MercadoPago
              </a>
            </div>
          )}
        </div>
      </main>

      {/* ═══ MODAL DE RECORTE ═══ */}
      {recorte && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[1000]">
          <div className="bg-white rounded-xl w-full max-w-[520px] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="font-semibold text-[#0a0a0a] m-0">Recortá tu {CONFIG[recorte.destino].etiqueta}</p>
              <p className="text-sm text-gray-500 mt-0.5 mb-0">Arrastrá para mover y usá el zoom para ajustar</p>
            </div>
            <div className="relative w-full h-[320px] bg-[#333]">
              <Cropper
                image={recorte.src} crop={crop} zoom={zoom}
                aspect={CONFIG[recorte.destino].aspect}
                onCropChange={setCrop} onZoomChange={setZoom}
                onCropComplete={alCompletarRecorte}
              />
            </div>
            <div className="px-6 py-4">
              <label className="text-sm text-gray-500 block mb-1">Zoom</label>
              <input type="range" min={1} max={3} step={0.05} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-[#0a0a0a]" />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button type="button" onClick={cerrarRecorte} disabled={subiendo}
                className="px-5 py-2.5 border border-gray-300 rounded-lg bg-white cursor-pointer hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={recortarYSubir} disabled={subiendo || !areaPixels}
                className={`px-5 py-2.5 border-none rounded-lg text-white transition-colors ${
                  subiendo || !areaPixels ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
                }`}>
                {subiendo ? 'Subiendo...' : 'Recortar y subir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
