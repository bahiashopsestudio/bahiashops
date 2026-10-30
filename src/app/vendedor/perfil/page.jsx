'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Cropper from 'react-easy-crop';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';
import EstadoValidacion from '@/components/EstadoValidacion';
import BloqueLinkPropio from '@/components/LinkPropio';
import { usePausaTienda, SeccionPausar, TarjetaPausada } from '@/components/PausaTienda';
import { entregaConfigurada, correoSinPrecios } from '@/lib/metodosEntrega';


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


// Lo que ve el vendedor al volver del OAuth de MercadoPago. Sin códigos ni
// tecnicismos: qué pasó y qué puede hacer.
const MENSAJES_MP = {
  sin_codigo: 'MercadoPago no nos devolvió la autorización, así que la conexión quedó sin hacer. Puede pasar si cancelaste la pantalla de MercadoPago. Probá conectar de nuevo.',
  sin_vendedor: 'No encontramos tu cuenta de vendedor, así que no pudimos guardar la conexión. Si recién te sumaste, completá primero los datos de tu emprendimiento.',
  canje_rechazado: 'MercadoPago no aceptó la conexión. Suele pasar cuando la pantalla quedó abierta demasiado tiempo. Probá conectar de nuevo desde el principio.',
  no_guardado: 'Nos conectamos con MercadoPago pero no pudimos guardar la conexión de tu lado. Esperá un momento y probá de nuevo.',
  state_invalido: 'No pudimos verificar que la conexión la empezaste vos desde este navegador. Puede pasar si la pantalla de MercadoPago quedó abierta mucho tiempo. Probá conectar de nuevo desde el principio.',
};

const MENSAJE_MP_GENERICO = 'No pudimos completar la conexión con MercadoPago. Probá de nuevo.';

// El link propio y lo vendido por él. Nunca lanza: si falla, el texto de error
// de la ruta va en el lugar del bloque.
const ERROR_LINK = 'No pudimos cargar tu link. Probá de nuevo en un rato.';

async function cargarLinkPropio() {
  try {
    const res = await fetch('/api/vendedor/link-propio');
    const datos = await res.json().catch(() => ({}));
    return res.ok ? datos : { error: datos.error || ERROR_LINK };
  } catch (err) {
    console.error('No se pudo cargar el link propio:', err);
    return { error: ERROR_LINK };
  }
}

// El cartel cerrado y el link minimizado. Si no se guarda, en esta visita queda
// igual y la próxima vuelve como estaba.
async function guardarPreferencia(cambio) {
  try {
    const res = await fetch('/api/vendedor/preferencias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambio),
    });
    if (!res.ok) throw new Error('respuesta ' + res.status);
  } catch (err) {
    console.error('No se pudo guardar la preferencia:', err);
  }
}

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
  const [estadoValidacion, setEstadoValidacion] = useState(null);
  const [notasValidacion, setNotasValidacion] = useState(null);
  const [errorNotas, setErrorNotas] = useState(false);
  const [slugTienda, setSlugTienda] = useState(null);
  const [bloqueado, setBloqueado] = useState(false);
  // El cartel de "publicada" cerrado y el link minimizado (migración 043).
  const [cartelCerrado, setCartelCerrado] = useState(false);
  const [linkMinimizado, setLinkMinimizado] = useState(false);
  // Lo de /api/vendedor/link-propio, o { error }. Null si la tienda está bloqueada.
  const [linkPropio, setLinkPropio] = useState(null);
  // Sin punto, la tienda no aparece en el mapa (por ejemplo, si en el alta
  // no se pudo guardar la ubicación).
  const [sinUbicacion, setSinUbicacion] = useState(false);
  // Sin formas de entrega listas, quien compra sólo ve "Coordinar".
  const [sinEntrega, setSinEntrega] = useState(false);
  // Correo tildado sin ningún precio: no se ofrece (por ejemplo, después de
  // que la 021 borró los precios por provincia).
  const [correoSinPrecio, setCorreoSinPrecio] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [recorte, setRecorte] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);

  const [resultadoMp, setResultadoMp] = useState(null);
  // La cuenta de MercadoPago conectada: { id, nickname, conectado_en, dias_restantes,
  // renovacion_fallida, vence_en }.
  const [cuentaMp, setCuentaMp] = useState(null);
  const [antesDeConectar, setAntesDeConectar] = useState(false);
  const [confirmarDesconexion, setConfirmarDesconexion] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [errorDesconexion, setErrorDesconexion] = useState(null);
  const [avisoDesconectado, setAvisoDesconectado] = useState(false);
  // Cuántos pedidos pendientes se cancelarían al desconectar o cambiar la cuenta:
  // 'cargando', un número, o null si no se pudo saber (el cartel avisa sin el número).
  const [pendientesMp, setPendientesMp] = useState('cargando');
  // Cuántos se cancelaron al desconectar (para el aviso de después).
  const [canceladosAlDesconectar, setCanceladosAlDesconectar] = useState(0);
  // La pausa de la tienda (/api/vendedor/pausa).
  const pausaTienda = usePausaTienda();
  const pausa = pausaTienda.pausa;

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen]);

  useEffect(() => {
    // El callback de MercadoPago vuelve con ?mp=exito o ?mp=error&motivo=...
    // Lo leemos una vez y limpiamos la URL para que no quede pegado.
    function leerResultadoMp() {
      const params = new URLSearchParams(window.location.search);
      const mp = params.get('mp');
      if (!mp) return;

      // 'cambio' viene solo cuando se conectó OTRA cuenta de MercadoPago.
      // 'cancelados' viene cuando se cancelaron pedidos pendientes de la cuenta anterior.
      const cancelados = Number(params.get('cancelados'));
      setResultadoMp(mp === 'exito'
        ? { ok: true, cambio: params.get('cambio') === '1', cancelados: Number.isInteger(cancelados) && cancelados > 0 ? cancelados : 0 }
        : { ok: false, motivo: params.get('motivo') });

      params.delete('mp');
      params.delete('motivo');
      params.delete('cambio');
      params.delete('cancelados');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : ''));
    }

    async function cargar() {
      leerResultadoMp();
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden');
      if (cats) setCategorias(cats);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/entrar?next=%2Fvendedor%2Fperfil'); return; }
      const { data, error } = await supabase
        .from('vendedores')
        .select('id, nombre_negocio, slug, logo_url, portada_url, mercadopago_conectado, estado_validacion, bloqueado, latitud, metodos_entrega_default, costos_envio_zona, cartel_publicada_cerrado, link_propio_minimizado')
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

        // Qué cuenta es: no se puede leer desde el navegador (la tabla guarda
        // los tokens), va por una ruta. Si falla, el panel sale igual.
        if (data.mercadopago_conectado) {
          try {
            const res = await fetch('/api/mercadopago/cuenta');
            const cuenta = res.ok ? await res.json() : null;
            if (cuenta?.conectada) setCuentaMp(cuenta);
          } catch (err) {
            console.error('No se pudo cargar la cuenta de MercadoPago:', err);
          }
        }
        setEstadoValidacion(data.estado_validacion || 'aprobado');
        // Si falla la pausa, el panel sale igual, sin su sección. Se espera
        // también el link, para que el bloque no aparezca de golpe.
        const [, datosLink] = await Promise.all([
          pausaTienda.cargar(),
          data.bloqueado === true ? null : cargarLinkPropio(),
        ]);
        setLinkPropio(datosLink);
        setCartelCerrado(data.cartel_publicada_cerrado === true);
        setLinkMinimizado(data.link_propio_minimizado === true);
        setSlugTienda(data.slug || null);
        setBloqueado(data.bloqueado === true);
        setSinUbicacion(data.latitud === null);
        setSinEntrega(!entregaConfigurada(data));
        setCorreoSinPrecio(correoSinPrecios(data));

        // El mensaje del admin sólo se muestra cuando pide cambios, y no se
        // puede leer desde el navegador: va por la ruta de datos privados. Si
        // falla, el cartel sale igual, sin el detalle y con un aviso.
        if (data.estado_validacion === 'necesita_cambios') {
          try {
            const res = await fetch('/api/vendedor/datos-privados');
            if (!res.ok) throw new Error('respuesta ' + res.status);
            const privados = await res.json();
            setNotasValidacion(privados.notas_validacion);
          } catch (err) {
            console.error('No se pudo cargar el mensaje de la revisión:', err);
            setErrorNotas(true);
          }
        }
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
      // El tipo real: si el navegador no genera WebP (Safari puede devolver
      // PNG), no se sube diciendo que es WebP.
      const { error: errorUpload } = await supabase.storage.from(bucket).upload(ruta, blob, { upsert: true, contentType: blob.type || 'image/webp' });
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

  // Vuelve a pedir la cuenta justo antes de mostrar un cartel: la cantidad de
  // pedidos pendientes cambia mientras el panel está abierto.
  async function revisarPendientes() {
    setPendientesMp('cargando');
    try {
      const res = await fetch('/api/mercadopago/cuenta');
      const cuenta = res.ok ? await res.json() : null;
      if (cuenta?.conectada) setCuentaMp(cuenta);
      setPendientesMp(Number.isInteger(cuenta?.pendientes) ? cuenta.pendientes : null);
    } catch (err) {
      console.error('No se pudieron contar los pedidos pendientes:', err);
      setPendientesMp(null);
    }
  }

  function abrirDesconexion() {
    setErrorDesconexion(null);
    setConfirmarDesconexion(true);
    revisarPendientes();
  }

  function abrirAntesDeConectar() {
    setAntesDeConectar(true);
    if (mpConectado) revisarPendientes();
  }

  async function desconectarMercadoPago() {
    setDesconectando(true);
    setErrorDesconexion(null);
    try {
      const respuesta = await fetch('/api/mercadopago/oauth/disconnect', { method: 'POST' });
      const datos = await respuesta.json().catch(() => ({}));

      if (!respuesta.ok) {
        setErrorDesconexion(datos.error || 'No pudimos desconectar tu cuenta. Probá de nuevo.');
        return;
      }

      setMpConectado(false);
      setCuentaMp(null);
      setConfirmarDesconexion(false);
      setCanceladosAlDesconectar(Number(datos.pedidosCancelados) || 0);
      setAvisoDesconectado(true);
    } catch {
      setErrorDesconexion('No pudimos conectarnos con el servidor. Revisá tu conexión y probá de nuevo.');
    } finally {
      setDesconectando(false);
    }
  }

  function cerrarCartel() {
    setCartelCerrado(true);
    guardarPreferencia({ cartelPublicadaCerrado: true });
  }

  function cambiarLinkMinimizado(minimizado) {
    setLinkMinimizado(minimizado);
    guardarPreferencia({ linkMinimizado: minimizado });
  }

  // Por qué el link no anda. Sin publicar va primero: reactivar no alcanzaría.
  let linkApagado = null;
  if (estadoValidacion !== 'aprobado') linkApagado = 'Tu link se activa cuando publiquemos tu tienda. Desde ese día lo vas a poder copiar.';
  else if (pausa?.pausada) linkApagado = 'Tu tienda está en pausa. Tu link vuelve a funcionar cuando la reactives.';

  function cerrarConfirmacion() {
    if (desconectando) return;
    setConfirmarDesconexion(false);
    setErrorDesconexion(null);
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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/perfil" texto="Volver a Mi perfil" />

            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)', marginBottom: '10px' }}>
              Tu tienda
            </p>
            <h1 className="text-[26px] md:text-[30px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', marginBottom: '4px' }}>
              Mi negocio
            </h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.45)', marginBottom: '24px' }}>
              {nombreNegocio}
            </p>

            {/* ═══ ESTADO DE LA TIENDA ═══ */}
            {/* En pausa, la tarjeta de la pausa reemplaza al cartel de
                "publicada". Si además está bloqueada, va el cartel del bloqueo
                y la pausa abajo (la puede reactivar igual). */}
            <div className="mb-6">
              {(!pausa?.pausada || bloqueado) && (
                <EstadoValidacion
                  estado={estadoValidacion}
                  notas={notasValidacion}
                  slug={slugTienda}
                  bloqueado={bloqueado}
                  cerrado={cartelCerrado}
                  onCerrar={cerrarCartel}
                />
              )}
              {pausa?.pausada && (
                <div className={bloqueado ? 'mt-4' : ''}>
                  <TarjetaPausada
                    pausa={pausa}
                    onReactivar={pausaTienda.reactivar}
                    onGuardarMensaje={pausaTienda.guardarMensaje}
                  />
                </div>
              )}
              {errorNotas && (
                <p className="m-0 mt-2 text-xs text-[#0a0a0a]/40 font-light">
                  No pudimos cargar el detalle de lo que hay que ajustar. Recargá la página para verlo.
                </p>
              )}
            </div>

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

            {/* ═══ TU LINK ═══ */}
            {!bloqueado && (
              <div className="mt-8">
                <BloqueLinkPropio
                  datos={linkPropio}
                  textoApagado={linkApagado}
                  minimizado={linkMinimizado}
                  onCambiarMinimizado={cambiarLinkMinimizado}
                />
              </div>
            )}

            {/* ═══ AVISO: SIN UBICACIÓN ═══ */}
            {sinUbicacion && (
              <Link href="/vendedor/ubicacion" className="mt-10 flex items-center gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 no-underline text-amber-900 hover:bg-amber-100/60 transition-colors">
                <span className="text-lg">📍</span>
                <span className="flex-1 text-[13px] font-light leading-relaxed">
                  Tu tienda todavía no aparece en el mapa. Completá tu ubicación (tu dirección, o tu calle y entrecalles) para que te encuentren.
                </span>
                <Chevron />
              </Link>
            )}

            {/* ═══ AVISO: SIN FORMAS DE ENTREGA ═══ */}
            {sinEntrega && (
              <Link href="/vendedor/envios" className={`${sinUbicacion ? 'mt-4' : 'mt-10'} flex items-center gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 no-underline text-amber-900 hover:bg-amber-100/60 transition-colors`}>
                <span className="text-lg">🚚</span>
                <span className="flex-1 text-[13px] font-light leading-relaxed">
                  <span className="font-medium">Elegí cómo entregás tus pedidos.</span> Mientras tanto, quien compra solo puede coordinar la entrega con vos por WhatsApp.
                </span>
                <Chevron />
              </Link>
            )}

            {/* ═══ AVISO: CORREO SIN PRECIOS ═══ */}
            {correoSinPrecio && (
              <Link href="/vendedor/envios" className={`${sinUbicacion || sinEntrega ? 'mt-4' : 'mt-10'} flex items-center gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 no-underline text-amber-900 hover:bg-amber-100/60 transition-colors`}>
                <span className="text-lg">📦</span>
                <span className="flex-1 text-[13px] font-light leading-relaxed">
                  <span className="font-medium">Cargá los precios del correo.</span> Las zonas ahora van por distancia desde tu tienda. Hasta que pongas al menos un precio, el correo no se ofrece.
                </span>
                <Chevron />
              </Link>
            )}

            {/* ═══ MENÚ DEL NEGOCIO ═══ */}
            <div className={`${sinUbicacion || sinEntrega || correoSinPrecio ? 'mt-4' : 'mt-10'} rounded-2xl border border-[#0a0a0a]/5 divide-y divide-[#0a0a0a]/5 overflow-hidden`}>
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
              <Link href="/vendedor/resenas" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-[#0a0a0a]/[0.02] transition-colors">
                <span className="text-lg">⭐</span>
                <span className="flex-1 text-sm font-light">Reseñas</span>
                <Chevron />
              </Link>
              <Link href="/vendedor/envios" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-[#0a0a0a]/[0.02] transition-colors">
                <span className="text-lg">🚚</span>
                <span className="flex-1 text-sm font-light">Cómo entregás</span>
                <Chevron />
              </Link>
              <Link href="/vendedor/ubicacion" className="flex items-center gap-3 px-5 py-4 no-underline text-[#0a0a0a] hover:bg-[#0a0a0a]/[0.02] transition-colors">
                <span className="text-lg">📍</span>
                <span className="flex-1 text-sm font-light">Mi ubicación</span>
                <Chevron />
              </Link>
            </div>

            {/* ═══ RESULTADO DE LA CONEXIÓN CON MERCADOPAGO ═══ */}
            {resultadoMp?.ok && (
              <div className="mt-4 p-4 rounded-2xl border border-emerald-200 bg-emerald-50">
                <p className="text-sm font-medium text-emerald-800 m-0">¡Listo! Conectaste tu cuenta de MercadoPago.</p>
                <p className="text-[13px] text-emerald-700 font-light mt-1 mb-0 leading-relaxed">
                  Ya podés recibir el dinero de tus ventas en tu cuenta.
                  {resultadoMp.cambio && ' Como cambiaste de cuenta, te mandamos un mail con el detalle.'}
                </p>
                {resultadoMp.cancelados > 0 && (
                  <p className="text-[13px] text-emerald-700 font-light mt-1 mb-0 leading-relaxed">
                    {resultadoMp.cancelados === 1
                      ? 'Se canceló 1 pedido pendiente de pago de la cuenta anterior y le avisamos a quien compró.'
                      : `Se cancelaron ${resultadoMp.cancelados} pedidos pendientes de pago de la cuenta anterior y les avisamos a los compradores.`}
                  </p>
                )}
              </div>
            )}

            {resultadoMp && !resultadoMp.ok && (
              <div className="mt-4 p-4 rounded-2xl border border-red-200 bg-red-50">
                <p className="text-sm font-medium text-red-800 m-0">No pudimos conectar tu cuenta de MercadoPago.</p>
                <p className="text-[13px] text-red-700 font-light mt-1 mb-0 leading-relaxed">
                  {MENSAJES_MP[resultadoMp.motivo] || MENSAJE_MP_GENERICO}
                </p>
              </div>
            )}

            {/* ═══ COBROS ═══ */}
            <div className="mt-4 rounded-2xl border border-[#0a0a0a]/5 overflow-hidden">
              {mpConectado ? (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">💳</span>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-[#0a0a0a]">MercadoPago conectado</span>
                      <p className="text-[11px] text-[#0a0a0a]/30 font-light mt-0.5 mb-0">
                        {cuentaMp
                          ? <>Cuenta conectada: <span className="text-[#0a0a0a]/60">{cuentaMp.nickname || 'sin nombre'}</span> · N° {cuentaMp.id}</>
                          : 'Recibís el dinero de tus ventas en tu cuenta.'}
                      </p>
                      {cuentaMp && (
                        <p className="text-[11px] text-[#0a0a0a]/30 font-light mt-0.5 mb-0">
                          {cuentaMp.conectado_en
                            ? `Conectada el ${new Date(cuentaMp.conectado_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}. `
                            : ''}
                          Recibís el dinero de tus ventas en esa cuenta.
                        </p>
                      )}
                      {cuentaMp && (
                        <p className="text-[11px] text-[#0a0a0a]/30 font-light mt-1 mb-0">
                          ¿No es la que querías?{' '}
                          <button
                            type="button"
                            onClick={abrirAntesDeConectar}
                            className="text-[#0a0a0a]/50 underline underline-offset-2 hover:text-[#0a0a0a]/80 transition-colors cursor-pointer bg-transparent border-none p-0 text-[11px] font-light"
                          >
                            Cambiar de cuenta
                          </button>
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                      Activo
                    </span>
                  </div>
                  {/* La renovación del permiso falló (migración 040). Se va
                      sola cuando se renueva o se vuelve a conectar. */}
                  {cuentaMp?.renovacion_fallida && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 font-light leading-relaxed">
                      <p className="m-0">
                        {cuentaMp.vence_en
                          ? `No pudimos renovar la conexión con Mercado Pago. Volvé a conectarla antes del ${new Date(cuentaMp.vence_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })} para seguir cobrando.`
                          : 'No pudimos renovar la conexión con Mercado Pago. Volvé a conectarla para seguir cobrando.'}
                      </p>
                      <button
                        type="button"
                        onClick={abrirAntesDeConectar}
                        className="mt-3 inline-block bg-[#009ee3] text-white border-none cursor-pointer hover:bg-[#008dd0] transition-colors"
                        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '10px 20px' }}
                      >
                        Conectar Mercado Pago
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={abrirDesconexion}
                    className="mt-3 text-[11px] text-[#0a0a0a]/30 font-light underline underline-offset-2 hover:text-[#0a0a0a]/60 transition-colors cursor-pointer bg-transparent border-none p-0"
                  >
                    Desconectar cuenta
                  </button>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-lg">💳</span>
                    <span className="text-sm font-medium text-[#0a0a0a]">Cobros</span>
                  </div>
                  {avisoDesconectado && (
                    <div className="mb-3">
                      <p className="text-[11px] text-[#0a0a0a]/40 font-light m-0">
                        Desconectamos tu cuenta de MercadoPago.
                      </p>
                      <p className="text-[11px] text-[#0a0a0a]/40 font-light mt-1 mb-0 leading-relaxed">
                        Tus productos siguen publicados pero nadie va a poder pagarlos hasta que vincules una cuenta de nuevo.
                      </p>
                      {canceladosAlDesconectar > 0 && (
                        <p className="text-[11px] text-[#0a0a0a]/40 font-light mt-1 mb-0 leading-relaxed">
                          {canceladosAlDesconectar === 1
                            ? 'Se canceló 1 pedido pendiente de pago y le avisamos a quien compró.'
                            : `Se cancelaron ${canceladosAlDesconectar} pedidos pendientes de pago y les avisamos a los compradores.`}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-[#0a0a0a]/30 font-light mb-4 leading-relaxed">
                    Conectá tu cuenta de MercadoPago para recibir el dinero de tus ventas.
                  </p>
                  <button
                    type="button"
                    onClick={abrirAntesDeConectar}
                    className="inline-block bg-[#009ee3] text-white border-none cursor-pointer hover:bg-[#008dd0] transition-colors"
                    style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }}
                  >
                    Conectar con MercadoPago
                  </button>
                </div>
              )}
            </div>

            {/* ═══ PAUSAR LA TIENDA ═══ */}
            {pausa && !pausa.pausada && (
              <SeccionPausar pausa={pausa} onPausar={pausaTienda.pausar} reactivada={pausaTienda.reactivada} />
            )}
          </div>
        </div>
      </div>

      {/* ═══ MODAL: ANTES DE CONECTAR (también al cambiar de cuenta) ═══ */}
      {antesDeConectar && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000]"
          onClick={() => setAntesDeConectar(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[440px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[#0a0a0a]/5">
              <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>
                Antes de conectar
              </p>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed m-0">
                Se conecta la cuenta de MercadoPago con la que estés ingresado en este navegador.
                Si tenés más de una, cerrá sesión en MercadoPago o abrí esta página en una ventana de incógnito.
              </p>
              {cuentaMp && (
                <p className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed mt-3 mb-0">
                  Hoy tenés conectada <span className="text-[#0a0a0a]">{cuentaMp.nickname || 'una cuenta sin nombre'}</span> (N° {cuentaMp.id}).
                  Si conectás otra, el dinero de tus ventas nuevas va a la cuenta nueva.
                </p>
              )}
              {mpConectado && cuentaMp && pendientesMp !== 'cargando' && pendientesMp !== 0 && (
                <p className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed mt-3 mb-0">
                  {pendientesMp === null
                    ? 'Si conectás otra cuenta, los pedidos pendientes de pago se van a cancelar y los compradores van a recibir un aviso de que su pedido ya no se puede pagar.'
                    : pendientesMp === 1
                      ? 'Si conectás otra cuenta, tu pedido pendiente de pago se va a cancelar y quien compró va a recibir un aviso de que su pedido ya no se puede pagar.'
                      : `Si conectás otra cuenta, tus ${pendientesMp} pedidos pendientes de pago se van a cancelar y los compradores van a recibir un aviso de que su pedido ya no se puede pagar.`}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#0a0a0a]/5">
              <button
                type="button"
                onClick={() => setAntesDeConectar(false)}
                className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 transition-all"
              >
                Cancelar
              </button>
              <a
                href="/api/mercadopago/oauth/start"
                className="px-5 py-2.5 rounded-full bg-[#009ee3] text-white text-sm font-medium no-underline hover:bg-[#008dd0] transition-colors"
              >
                Conectar MercadoPago
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: CONFIRMAR DESCONEXIÓN DE MERCADOPAGO ═══ */}
      {confirmarDesconexion && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000]"
          onClick={cerrarConfirmacion}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[440px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[#0a0a0a]/5">
              <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>
                ¿Desconectar MercadoPago?
              </p>
            </div>

            <div className="px-6 py-4">
              {pendientesMp === 'cargando' ? (
                <p className="text-sm text-[#0a0a0a]/40 font-light leading-relaxed m-0">
                  Revisando tus pedidos pendientes…
                </p>
              ) : pendientesMp === 0 ? (
                <p className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed m-0">
                  Tus productos siguen publicados pero nadie va a poder pagarlos hasta que vincules una cuenta de nuevo.
                </p>
              ) : (
                <>
                  <p className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed m-0">
                    {pendientesMp === null
                      ? 'Si tenés pedidos pendientes de pago y desconectás ahora:'
                      : `Tenés ${pendientesMp === 1 ? '1 pedido pendiente' : `${pendientesMp} pedidos pendientes`} de pago. Si desconectás ahora:`}
                  </p>
                  <ul className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed mt-2 mb-0 pl-5 list-disc">
                    <li>
                      {pendientesMp === 1
                        ? 'Ese pedido se va a cancelar y quien compró va a recibir un aviso de que su pedido ya no se puede pagar.'
                        : 'Esos pedidos se van a cancelar y los compradores van a recibir un aviso de que su pedido ya no se puede pagar.'}
                    </li>
                    <li className="mt-1">
                      Tus productos siguen publicados pero nadie va a poder pagarlos hasta que vincules una cuenta de nuevo.
                    </li>
                  </ul>
                </>
              )}

              {errorDesconexion && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  {errorDesconexion}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#0a0a0a]/5">
              <button
                type="button"
                onClick={cerrarConfirmacion}
                disabled={desconectando}
                className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 transition-all disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={desconectarMercadoPago}
                disabled={desconectando || pendientesMp === 'cargando'}
                className={`px-5 py-2.5 border-none rounded-full text-white text-sm font-medium transition-colors ${
                  desconectando || pendientesMp === 'cargando' ? 'bg-[#0a0a0a]/30 cursor-not-allowed' : 'bg-[#dc2626] cursor-pointer hover:bg-[#b91c1c]'
                }`}
              >
                {desconectando ? 'Desconectando...' : pendientesMp === 0 ? 'Desconectar' : 'Desconectar y cancelar pedidos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL DE RECORTE ═══ */}
      {recorte && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000]">
          <div className="bg-white rounded-2xl w-full max-w-[520px] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#0a0a0a]/5">
              <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>
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
