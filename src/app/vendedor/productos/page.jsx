'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';
import CopiarLink from '@/components/CopiarLink';
import { textoMotivoRechazo } from '@/lib/productos';
import { linkPropio } from '@/lib/marcaLink';
import CartelPlan from '@/components/CartelPlan';
import ModalSuscripcion from '@/components/ModalSuscripcion';
import { cargarPlan } from '@/lib/planDelPanel';
import { cantidad, estadoDelContador, notaDelContador, etiquetaDelPlan } from '@/lib/planes';

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage'];

// porElPlan: lo pausó el sistema cuando el plan volvió al Gratis (050). Va en
// celeste, distinto del «Pausado» que pone ella: vuelve solo al reactivar el plan.
function infoEstado(estado, { porElPlan = false } = {}) {
  if (estado === 'pausado' && porElPlan) return { texto: 'Pausado por tu plan', fondo: 'bg-[#eef3f8]', color: 'text-[#24425f]', punto: 'bg-[#5f8fbd]' };
  if (estado === 'en_revision') return { texto: 'En revisión', fondo: 'bg-amber-100', color: 'text-amber-700', punto: 'bg-amber-500' };
  if (estado === 'activo')     return { texto: 'Publicado',   fondo: 'bg-emerald-100', color: 'text-emerald-700', punto: 'bg-emerald-500' };
  if (estado === 'pausado')    return { texto: 'Pausado',     fondo: 'bg-[#fffbeb]', color: 'text-[#b45309]', punto: 'bg-[#f59e0b]' };
  if (estado === 'agotado')    return { texto: 'Agotado',     fondo: 'bg-red-100', color: 'text-red-700', punto: 'bg-red-400' };
  if (estado === 'rechazado')  return { texto: 'No publicado', fondo: 'bg-[#fbe8da]', color: 'text-[#8a3410]', punto: 'bg-[#8a3410]' };
  return { texto: estado, fondo: 'bg-gray-100', color: 'text-gray-500', punto: 'bg-gray-400' };
}

function formatearPrecio(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-AR');
}

// El link propio del producto, al pie de la tarjeta. Si el portapapeles falla,
// aparece el link ya seleccionado para copiarlo a mano.
function FranjaCompartir({ productoId }) {
  const link = linkPropio({ productoId });
  const [mostrarLink, setMostrarLink] = useState(false);
  const campo = useRef(null);

  useEffect(() => {
    if (mostrarLink) campo.current?.select();
  }, [mostrarLink]);

  function alFallar() {
    setMostrarLink(true);
    campo.current?.select();
  }

  return (
    <div className="mt-3.5 pt-3" style={{ borderTop: '1px solid rgba(10,10,10,0.05)' }}>
      <div className="flex items-center flex-wrap gap-2">
        <span className="mr-1" style={{ fontSize: '11px', color: 'rgba(10,10,10,0.35)' }}>Compartir</span>
        <CopiarLink link={link} variante="claro" onFallo={alFallar} onCopiado={() => setMostrarLink(false)} />
        <span className="w-full md:w-auto md:ml-auto" style={{ fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.3)' }}>
          Si compran por acá, pagás 2,5%
        </span>
      </div>
      {mostrarLink && (
        <input
          ref={campo}
          type="text"
          readOnly
          value={link}
          aria-label="Link del producto"
          onFocus={(e) => e.target.select()}
          className="w-full mt-2 rounded-lg"
          style={{ fontSize: '12px', padding: '8px 10px', color: '#0a0a0a', border: '1px solid rgba(10,10,10,0.12)', outline: 'none' }}
        />
      )}
    </div>
  );
}

// El contador del plan debajo del título (tanda F1): «6 de 10 productos», la
// etiqueta del plan y una barrita (ámbar faltando 2 o menos, negra en el tope
// o por encima). Sin tope, solo «N productos». Cuentan todos los productos
// guardados, también los pausados (migración 047).
// onReactivar: abre el alta de la suscripción (el link de «Tu plan volvió al
// Gratis… hacé click acá», 050).
function ContadorPlan({ plan, onReactivar }) {
  const contador = estadoDelContador(plan);
  const etiqueta = etiquetaDelPlan(plan);
  const nota = notaDelContador({ ...plan, contador });
  if (contador === 'sin_tope') {
    return (
      <p className="text-sm font-semibold text-[#0a0a0a] mt-1.5 mb-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {plan.usados} {plan.usados === 1 ? 'producto' : 'productos'}
      </p>
    );
  }
  const cerca = contador === 'cerca';
  const lleno = contador === 'en_el_tope' || contador === 'por_encima';
  const pct = Math.min(100, Math.round((plan.usados / plan.tope) * 100));
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline gap-2 flex-wrap text-[13px] text-[#0a0a0a]/55">
        <b className={`font-semibold ${cerca ? 'text-[#8a6410]' : 'text-[#0a0a0a]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {plan.usados} de {plan.tope} productos
        </b>
        {etiqueta && (
          <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${plan.especial ? 'bg-[#dcebf7] text-[#015444]' : 'bg-[#f1efe9] text-[#0a0a0a]/60'}`}>
            {etiqueta}
          </span>
        )}
      </div>
      <div className="w-[180px] max-w-full h-1 rounded bg-[#0a0a0a]/[0.08] overflow-hidden" aria-hidden="true">
        <span className={`block h-full rounded ${cerca ? 'bg-[#d9a520]' : lleno ? 'bg-[#0a0a0a]' : 'bg-[#015444]'}`} style={{ width: `${pct}%` }} />
      </div>
      {nota && (
        <p className="m-0 text-xs text-[#0a0a0a]/50" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300 }}>
          {nota.texto}
          {nota.link && (
            <>
              {' '}
              {nota.link.modal ? (
                <button type="button" onClick={onReactivar} className="bg-transparent border-0 p-0 cursor-pointer text-[#015444] font-medium underline underline-offset-2" style={{ font: 'inherit', fontWeight: 500 }}>{nota.link.texto}</button>
              ) : (
                <Link href={nota.link.href} className="text-[#015444] font-medium underline underline-offset-2">{nota.link.texto}</Link>
              )}.
            </>
          )}
          {nota.despues && <> {nota.despues}</>}
        </p>
      )}
    </div>
  );
}

export default function MisProductosPage() {
  const supabase = createClient();
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [productos, setProductos] = useState([]);
  const [nombreCategoria, setNombreCategoria] = useState('');
  const [error, setError] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);
  // El link solo sirve con la tienda publicada y sin pausa.
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  // El plan (contador y cartel). Si no se pudo leer, queda null: sin
  // contador, y la lista sale igual.
  const [plan, setPlan] = useState(null);
  // El cartel de reactivar por encima del tope: { tope, usados } del 409.
  const [cartel, setCartel] = useState(null);
  // El alta de la suscripción, desde el link del contador (050).
  const [altaAbierta, setAltaAbierta] = useState(false);
  const refCartel = useRef(null);

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen]);

  useEffect(() => {
    async function cargarCats() {
      const { data } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden');
      if (data) setCategorias(data);
    }
    cargarCats();
  }, []);

  useEffect(() => {
    async function cargarProductos() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace('/entrar?next=%2Fvendedor%2Fproductos'); return; }

        // El plan va en paralelo; si falla, sin contador (la lista sale igual).
        const lecturaPlan = cargarPlan();

        const { data: vendedor, error: errVendedor } = await supabase
          .from('vendedores')
          .select('id, categoria_id, estado_validacion, bloqueado, pausada_en')
          .eq('usuario_id', user.id)
          .single();

        if (errVendedor || !vendedor) {
          setError('No se pudo identificar tu cuenta de vendedor.');
          setCargando(false);
          return;
        }

        setPuedeCompartir(vendedor.estado_validacion === 'aprobado' && !vendedor.bloqueado && !vendedor.pausada_en);

        const { data: categoria } = await supabase
          .from('categorias')
          .select('nombre')
          .eq('id', vendedor.categoria_id)
          .single();
        if (categoria) setNombreCategoria(categoria.nombre);

        const { data: lista, error: errProductos } = await supabase
          .from('productos')
          .select('id, nombre, precio, precio_anterior, estado, motivo_rechazo, subcategoria_id, pausado_por_plan_en, pausado_con_tope')
          .eq('vendedor_id', vendedor.id)
          .order('id', { ascending: false });

        if (errProductos) { setError('No se pudieron cargar tus productos.'); setCargando(false); return; }
        const { plan: delPlan } = await lecturaPlan;
        if (delPlan) setPlan(delPlan);
        if (!lista || lista.length === 0) { setProductos([]); setCargando(false); return; }

        const ids = lista.map((p) => p.id);
        const subIds = [...new Set(lista.map((p) => p.subcategoria_id).filter(Boolean))];

        const { data: medias } = await supabase
          .from('producto_media')
          .select('producto_id, url, es_principal, orden')
          .in('producto_id', ids)
          .eq('tipo', 'foto');

        const nombresSub = {};
        if (subIds.length > 0) {
          const { data: subs } = await supabase.from('subcategorias').select('id, nombre').in('id', subIds);
          if (subs) subs.forEach((s) => { nombresSub[s.id] = s.nombre; });
        }

        const completos = lista.map((p) => {
          const fotosDeEste = (medias || []).filter((m) => m.producto_id === p.id);
          const principal = fotosDeEste.find((m) => m.es_principal) || fotosDeEste.sort((a, b) => a.orden - b.orden)[0];
          return { ...p, foto: principal ? principal.url : null, subcategoria: p.subcategoria_id ? nombresSub[p.subcategoria_id] : null };
        });

        setProductos(completos);
        setCargando(false);
      } catch (err) {
        console.error(err);
        setError('Hubo un error al cargar la página.');
        setCargando(false);
      }
    }
    cargarProductos();
  }, []);

  // Pausar, reactivar y borrar van por el servidor (migración 033: el
  // navegador no puede escribir en productos). El servidor verifica el estado
  // actual y borra también las fotos de Storage (menos las que usa un pedido:
  // desde la migración 047 se puede eliminar un producto con ventas).
  async function toggleEstado(producto) {
    const nuevoEstado = producto.estado === 'activo' ? 'pausado' : 'activo';
    try {
      const res = await fetch(`/api/vendedor/productos/${producto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const datos = await res.json().catch(() => ({}));
      // Al cambiar de estado a mano pierde la marca de «Pausado por tu plan» (050).
      if (datos.estado) setProductos(prev => prev.map(p => p.id === producto.id ? { ...p, estado: datos.estado, pausado_por_plan_en: null, pausado_con_tope: null } : p));
      // Por encima del tope: el cartel arriba de la lista, en vez del alert.
      if (res.status === 409 && datos.motivo === 'tope_superado') {
        // El plan pudo cambiar con la página abierta (por ejemplo, una
        // condición especial nueva): se vuelve a leer para el cartel.
        const { plan: fresco } = await cargarPlan();
        if (fresco) setPlan(fresco);
        setCartel({ tope: datos.tope, usados: datos.usados });
        requestAnimationFrame(() => refCartel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return;
      }
      if (!res.ok) alert(datos.error || 'No se pudo cambiar el estado del producto.');
    } catch {
      alert('No se pudo cambiar el estado del producto.');
    }
  }

  async function eliminarProducto(producto) {
    const confirmar = window.confirm(`¿Seguro que querés eliminar “${producto.nombre}”? Desaparece de tu tienda y no se puede deshacer. Si alguien ya lo compró, lo sigue viendo en sus pedidos.`);
    if (!confirmar) return;

    setEliminando(producto.id);
    try {
      const res = await fetch(`/api/vendedor/productos/${producto.id}`, { method: 'DELETE' });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(datos.error || 'Hubo un error al eliminar. Intentá de nuevo.');
        return;
      }
      setProductos(prev => prev.filter(p => p.id !== producto.id));
      // Eliminar hace lugar: el contador baja uno, y si ya no está por encima
      // del tope, el cartel de reactivar se va.
      const usados = plan ? Math.max(0, plan.usados - 1) : null;
      if (plan) setPlan({ ...plan, usados, contador: estadoDelContador({ ...plan, usados }) });
      if (cartel && (usados === null || plan.tope === null || usados <= plan.tope)) setCartel(null);
      else if (cartel) setCartel({ ...cartel, usados });
    } catch (err) {
      console.error(err);
      alert('Hubo un error al eliminar. Intentá de nuevo.');
    } finally {
      setEliminando(null);
    }
  }

  function puedeToggle(estado) { return estado === 'activo' || estado === 'pausado' || estado === 'agotado'; }
  function textoToggle(estado) { return estado === 'activo' ? 'Pausar' : 'Reactivar'; }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean);

  if (cargando) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&family=Poppins:wght@300&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando tus productos...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&family=Poppins:wght@300&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />

            <div className="flex justify-between items-start gap-3 mb-6">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight m-0">Mis productos</h1>
                {!error && (plan ? <ContadorPlan plan={plan} onReactivar={() => setAltaAbierta(true)} /> : (
                  <p className="text-sm text-[#0a0a0a]/30 font-light mt-1 mb-0">
                    {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
                  </p>
                ))}
              </div>
              {productos.length > 0 && (
                <Link
                  href="/vendedor/productos/nuevo"
                  className="shrink-0 whitespace-nowrap bg-[#0a0a0a] text-white rounded-full px-5 py-2.5 text-sm font-medium no-underline hover:bg-[#1a1a1a] transition-colors"
                >
                  + Cargar producto
                </Link>
              )}
            </div>

            {error && <p className="text-red-700 text-sm">{error}</p>}

            {cartel && (
              <div ref={refCartel}>
                <CartelPlan motivo="superado" accion="activar" datos={plan} tope={cartel.tope} usados={cartel.usados}
                  onCerrar={() => setCartel(null)} />
              </div>
            )}

            {/* Lista de productos */}
            {!error && productos.map((p) => {
              const estado = infoEstado(p.estado, { porElPlan: !!p.pausado_por_plan_en });
              const estaEliminando = eliminando === p.id;
              const rechazado = p.estado === 'rechazado';
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-4 mb-3 transition-opacity ${
                    rechazado ? 'border-[#ecd2bf]' : 'border-[#0a0a0a]/5'
                  } ${estaEliminando ? 'opacity-50' : ''}`}
                >
                <div className="flex gap-4 items-center">
                  {/* Foto */}
                  <div className="w-[80px] h-[80px] rounded-xl shrink-0 bg-[#F5F2EC] overflow-hidden">
                    {p.foto && <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#0a0a0a] m-0 mb-0.5 truncate">{p.nombre}</p>
                    <p className="text-[11px] text-[#0a0a0a]/25 font-light m-0 mb-1.5">
                      {[nombreCategoria, p.subcategoria].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-sm font-semibold text-[#0a0a0a] m-0">
                      {p.precio_anterior && (
                        <span className="text-[#0a0a0a]/25 font-light line-through text-xs mr-1.5">
                          ${formatearPrecio(p.precio_anterior)}
                        </span>
                      )}
                      ${formatearPrecio(p.precio)}
                    </p>
                    {p.estado === 'en_revision' && (
                      <p className="text-xs text-[#0a0a0a]/40 m-0 mt-1" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300 }}>
                        Lo estamos revisando.
                      </p>
                    )}
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5 ${estado.fondo} ${estado.color}`}>
                      <span className={`w-[6px] h-[6px] rounded-full ${estado.punto}`} />
                      {estado.texto}
                    </span>
                    {/* Pausado por el plan (052): cuándo vuelve solo, con el tope con que se pausó. */}
                    {p.estado === 'pausado' && p.pausado_por_plan_en && Number.isInteger(p.pausado_con_tope) && (
                      <p className="text-xs text-[#0a0a0a]/45 m-0 mt-1" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300 }}>
                        Vuelve solo si tu plan pasa a más de {cantidad(p.pausado_con_tope, 'producto', 'productos')}. Si tenés lugar, podés activarlo vos.
                      </p>
                    )}
                  </div>

                  {/* Acciones (un rechazado tiene las suyas en el recuadro de abajo) */}
                  {!rechazado && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Link
                      href={`/vendedor/productos/${p.id}/editar`}
                      className="bg-white border border-[#0a0a0a]/10 rounded-full px-4 py-1.5 text-xs text-[#0a0a0a]/60 font-light no-underline whitespace-nowrap text-center hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-all"
                    >
                      Editar
                    </Link>

                    {puedeToggle(p.estado) && (
                      <button
                        onClick={() => toggleEstado(p)}
                        className={`bg-white rounded-full px-4 py-1.5 text-xs cursor-pointer whitespace-nowrap transition-colors ${
                          p.estado === 'activo'
                            ? 'border border-amber-400 text-amber-600 hover:bg-amber-50'
                            : 'border border-emerald-400 text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {textoToggle(p.estado)}
                      </button>
                    )}

                    <Link
                      href={`/producto/${p.id}`}
                      className="bg-white border border-[#0a0a0a]/10 rounded-full px-4 py-1.5 text-xs text-[#0a0a0a]/40 font-light no-underline whitespace-nowrap text-center hover:border-[#0a0a0a]/30 transition-all"
                    >
                      Ver
                    </Link>

                    <button
                      onClick={() => eliminarProducto(p)}
                      disabled={estaEliminando}
                      className={`bg-white border border-red-200 rounded-full px-4 py-1.5 text-xs text-red-400 whitespace-nowrap transition-colors ${
                        estaEliminando ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-red-50 hover:text-red-600'
                      }`}
                    >
                      {estaEliminando ? '...' : 'Eliminar'}
                    </button>
                  </div>
                  )}
                </div>

                {puedeCompartir && p.estado === 'activo' && <FranjaCompartir productoId={p.id} />}

                {/* Por qué no se publicó (solo mientras está rechazado: al
                    reenviarlo pasa a en revisión y esto deja de verse) */}
                {rechazado && (
                  <div className="mt-3 rounded-xl bg-[#fdf3ec] p-4">
                    <p className="m-0 text-[13px] font-semibold text-[#6e2a0c]">Por qué no lo publicamos</p>
                    <p className="m-0 mt-1 text-[15px] text-[#2b1a10] whitespace-pre-line" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300 }}>
                      {textoMotivoRechazo(p.motivo_rechazo)}
                    </p>
                    <div className="flex gap-2 flex-wrap mt-3">
                      <Link
                        href={`/vendedor/productos/${p.id}/editar`}
                        className="bg-[#0a0a0a] text-white rounded-full px-5 py-2.5 text-sm font-medium no-underline hover:bg-[#1a1a1a] transition-colors"
                      >
                        Corregir y reenviar
                      </Link>
                      <button
                        onClick={() => eliminarProducto(p)}
                        disabled={estaEliminando}
                        className={`bg-white border border-[#0a0a0a]/10 rounded-full px-5 py-2.5 text-sm text-[#0a0a0a]/60 font-light transition-all ${
                          estaEliminando ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a]'
                        }`}
                      >
                        {estaEliminando ? '...' : 'Borrar'}
                      </button>
                    </div>
                  </div>
                )}
                </div>
              );
            })}

            {/* Estado vacío */}
            {!error && productos.length === 0 && (
              <div className="border border-dashed border-[#0a0a0a]/10 rounded-2xl px-8 py-12 text-center">
                <div className="text-4xl mb-2">📦</div>
                <h2 className="text-xl font-black text-[#0a0a0a] tracking-tight m-0 mb-1.5">Todavía no cargaste productos</h2>
                <p className="text-sm text-[#0a0a0a]/30 font-light m-0 mb-6">Cargá tu primer producto y va a aparecer acá.</p>
                <Link
                  href="/vendedor/productos/nuevo"
                  className="bg-[#0a0a0a] text-white rounded-full px-6 py-2.5 text-sm font-medium no-underline hover:bg-[#1a1a1a] transition-colors"
                >
                  + Cargar mi primer producto
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <ModalSuscripcion abierto={altaAbierta} onClose={() => setAltaAbierta(false)} />
    </>
  );
}