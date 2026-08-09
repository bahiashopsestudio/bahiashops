'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Cropper from 'react-easy-crop';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
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

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage'];


function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#0a0a0a]/20 shrink-0">
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen]);

  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden');
      if (cats) setCategorias(cats);

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
    cargar();
  }, []);

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean);

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
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    );
  }

  if (!vendedorId) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">No encontramos tu cuenta de vendedor.</span>
        </div>
      </>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/perfil" texto="Volver a Mi perfil" />

            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-1">
              Mi negocio
            </h1>
            <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">
              {nombreNegocio}
            </p>

            {/* ═══ PORTADA + LOGO ═══ */}
            <div className="relative">
              <div className="aspect-video rounded-2xl overflow-hidden bg-[#F5F2EC] flex items-center justify-center">
                {portadaUrl ? (
                  <img src={portadaUrl} alt="Portada" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm text-[#0a0a0a]/15 font-light">Sin portada (opcional)</span>
                )}
              </div>
              <div className="absolute left-4 -bottom-6 w-20 h-20 rounded-xl overflow-hidden bg-white shadow-[0_0_0_3px_white] flex items-center justify-center">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-[#0a0a0a]/20 font-light">Sin logo</span>
                )}
              </div>
            </div>

            <div className="pt-10 flex gap-3 flex-wrap">
              <label className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-all">
                {logoUrl ? 'Cambiar logo' : 'Subir logo *'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => elegirArchivo(e, 'logo')} className="hidden" />
              </label>
              <label className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-all">
                {portadaUrl ? 'Cambiar portada' : 'Subir portada'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => elegirArchivo(e, 'portada')} className="hidden" />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-[#0a0a0a]/20 font-light leading-relaxed">
              Logo: cuadrado, mín. 400×400 px · Portada: panorámica 16:9 · JPG, PNG o WEBP · hasta 3 MB
            </p>

            {/* ═══ MENÚ DEL NEGOCIO ═══ */}
            <div className="mt-10 rounded-2xl border border-[#0a0a0a]/5 divide-y divide-[#0a0a0a]/5 overflow-hidden">
              <Link href="/vendedor/productos" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-[#0a0a0a]/[0.02] transition-colors">
                <span className="text-lg">📦</span>
                <span className="flex-1 text-sm font-light">Mis productos</span>
                <Chevron />
              </Link>
              <Link href="/vendedor/pedidos" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-[#0a0a0a]/[0.02] transition-colors">
                <span className="text-lg">🛒</span>
                <span className="flex-1 text-sm font-light">Mis pedidos</span>
                <Chevron />
              </Link>
              <Link href="/vendedor/envios" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-[#0a0a0a]/[0.02] transition-colors">
                <span className="text-lg">🚚</span>
                <span className="flex-1 text-sm font-light">Costos de envío</span>
                <Chevron />
              </Link>
              <Link href="/vendedor/ubicacion" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-[#0a0a0a]/[0.02] transition-colors">
                <span className="text-lg">📍</span>
                <span className="flex-1 text-sm font-light">Mi ubicación</span>
                <Chevron />
              </Link>
            </div>

            {/* ═══ COBROS ═══ */}
            <div className="mt-4 rounded-2xl border border-[#0a0a0a]/5 overflow-hidden">
              {mpConectado ? (
                <div className="flex items-center gap-3 px-5 py-4">
                  <span className="text-lg">💳</span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-[#0a0a0a]">MercadoPago conectado</span>
                    <p className="text-[11px] text-[#0a0a0a]/30 font-light mt-0.5 mb-0">
                      Recibís el dinero de tus ventas en tu cuenta.
                    </p>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                    Activo
                  </span>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-lg">💳</span>
                    <span className="text-sm font-medium text-[#0a0a0a]">Cobros</span>
                  </div>
                  <p className="text-sm text-[#0a0a0a]/30 font-light mb-4 leading-relaxed">
                    Conectá tu cuenta de MercadoPago para recibir el dinero de tus ventas.
                  </p>
                  <a
                    href="/api/mercadopago/oauth/start"
                    className="inline-block px-6 py-2.5 text-sm bg-[#009ee3] text-white rounded-full no-underline hover:bg-[#008dd0] transition-colors font-medium"
                  >
                    Conectar con MercadoPago
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MODAL DE RECORTE ═══ */}
      {recorte && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000]">
          <div className="bg-white rounded-2xl w-full max-w-[520px] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#0a0a0a]/5">
              <p className="font-black text-[#0a0a0a] tracking-tight m-0">
                Recortá tu {CONFIG[recorte.destino].etiqueta}
              </p>
              <p className="text-sm text-[#0a0a0a]/30 font-light mt-0.5 mb-0">
                Arrastrá para mover y usá el zoom para ajustar
              </p>
            </div>
            <div className="relative w-full h-[320px] bg-[#1a1a1a]">
              <Cropper
                image={recorte.src} crop={crop} zoom={zoom}
                aspect={CONFIG[recorte.destino].aspect}
                onCropChange={setCrop} onZoomChange={setZoom}
                onCropComplete={alCompletarRecorte}
              />
            </div>
            <div className="px-6 py-4">
              <label className="text-xs text-[#0a0a0a]/30 font-light block mb-1.5">Zoom</label>
              <input type="range" min={1} max={3} step={0.05} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-[#0a0a0a]" />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#0a0a0a]/5">
              <button type="button" onClick={cerrarRecorte} disabled={subiendo}
                className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 transition-all">
                Cancelar
              </button>
              <button type="button" onClick={recortarYSubir} disabled={subiendo || !areaPixels}
                className={`px-5 py-2.5 border-none rounded-full text-white text-sm font-medium transition-colors ${
                  subiendo || !areaPixels ? 'bg-[#0a0a0a]/30 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
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
