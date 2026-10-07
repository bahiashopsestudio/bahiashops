'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';
import AvatarApodo from '@/components/AvatarApodo';
import { linkWhatsApp } from '@/lib/telefono';
import {
  grupoEntrega, etiquetaMetodo, zonaDe, EMPRESAS_ENVIO, validarSeguimiento, seguimientoDe,
} from '@/lib/metodosEntrega';
import { calleNumeroDepto, ciudadProvinciaCodigo } from '@/lib/direcciones';

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage'];

const ESTADOS = {
  pendiente:  { label: 'Esperando pago',  color: 'text-amber-700',   bg: 'bg-amber-100',   orden: 0 },
  pagado:     { label: 'Pagado',           color: 'text-emerald-700', bg: 'bg-emerald-100',  orden: 1 },
  rechazado:  { label: 'Pago rechazado',   color: 'text-red-600',     bg: 'bg-red-50',       orden: -1 },
  cancelado:  { label: 'Cancelado',        color: 'text-red-600',     bg: 'bg-red-50',       orden: -1 },
  preparando: { label: 'Preparando',       color: 'text-blue-700',    bg: 'bg-blue-50',      orden: 2 },
  franja:     { label: 'Franja horaria avisada', color: 'text-violet-600',  bg: 'bg-violet-100',   orden: 3 },
  por_salir:  { label: 'Por salir',        color: 'text-amber-600',   bg: 'bg-amber-50',     orden: 4 },
  despachado: { label: 'Despachado',       color: 'text-emerald-700', bg: 'bg-emerald-100',  orden: 5 },
  // Lo escribe sólo el webhook cuando el pago vuelve como reembolso o
  // contracargo. No tiene entrada en ACCIONES: no se muestra ningún botón.
  reembolsado: { label: 'Cancelado · dinero devuelto', color: 'text-red-600', bg: 'bg-red-50', orden: -1 },
};

// El estado a mostrar. Un pedido cancelado porque el link de pago venció sin
// que nadie pagara no es un "Cancelado" cualquiera: se dice qué pasó. (La ruta
// /api/vendedor/pedidos los cancela al abrir el panel.)
function estadoDe(p) {
  if (p.estado === 'cancelado' && p.cancelado_motivo === 'pago_vencido') {
    return { label: 'Vencido · no se pagó a tiempo', color: 'text-[#0a0a0a]/50', bg: 'bg-[#0a0a0a]/5' };
  }
  if (p.estado === 'cancelado' && p.cancelado_motivo === 'cuenta_mp_cambiada') {
    return { label: 'Cancelado · cambió tu cuenta de MercadoPago', color: 'text-red-600', bg: 'bg-red-50' };
  }
  return ESTADOS[p.estado] || { label: p.estado, color: 'text-[#0a0a0a]/40', bg: 'bg-[#0a0a0a]/5' };
}

// Lo que se ve en lugar de los datos de contacto de un pedido que no se pagó.
// Pendiente: todavía puede pagarse. Rechazado, cancelado o vencido: no se pagó
// y no va a haber datos.
function textoDatosOcultos(p) {
  if (p.estado === 'pendiente') {
    return 'Los datos de contacto de quien compra (nombre, teléfono y dirección) aparecen cuando se acredite el pago.';
  }
  return 'Este pedido no se pagó, por eso no tiene datos de contacto.';
}

// Cómo le llega el pedido a quien compra, para elegir el texto del WhatsApp:
// 'retiro', 'coordinar', 'envio' o 'correo'. La regla está en
// metodosEntrega.js. Con el correo no hay franja de entrega ni "ya llega":
// los pasos son los mismos, pero los textos dicen cuándo va al correo.
function tipoEntrega(p) {
  return grupoEntrega(p.metodo_envio);
}

// "Envío de la tienda · zona 2", para el panel.
function textoEntrega(p) {
  const etiqueta = etiquetaMetodo(p.metodo_envio, 'vendedor');
  const zona = p.zona_envio ? zonaDe(p.metodo_envio, p.zona_envio) : null;
  return zona ? `${etiqueta} · zona ${zona.zona}` : etiqueta;
}

// "Calle número" para el mensaje: primero la copia congelada en el pedido,
// después la dirección embebida. Si no hay ninguna, null y el texto va sin
// esa parte.
function calleYNumero(p) {
  for (const d of [p.direccion_copia, p.direccion]) {
    const texto = [d?.calle, d?.numero]
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean)
      .join(' ');
    if (texto) return texto;
  }
  return null;
}

const ACCIONES = {
  pagado: {
    label: 'Empezar a preparar', siguiente: 'preparando',
    btnClass: 'bg-blue-700 hover:bg-blue-800', whatsapp: true,
    // Retiro es el único método en el que el pedido no "sale": la persona lo
    // viene a buscar.
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! Te escribimos de ${nombre}. Ya estamos preparando tu pedido con el código número #${p.id}. ` +
      (tipoEntrega(p) === 'retiro'
        ? '¡Te avisamos cuando esté listo para retirar!'
        : tipoEntrega(p) === 'correo'
          ? '¡Te avisamos cuando lo despachemos por correo!'
          : '¡Te avisamos cuando esté por salir!'),
  },
  preparando: {
    label: 'Avisar franja horaria', siguiente: 'franja',
    labelCorreo: 'Avisar cuándo lo llevás al correo',
    btnClass: 'bg-violet-600 hover:bg-violet-700', whatsapp: true, pideFranja: true,
    mensajeWA: (p, franja, nombre) => {
      const f = franja.toLowerCase();
      const tipo = tipoEntrega(p);
      if (tipo === 'correo') {
        return `¡Hola! Te escribimos de ${nombre}. Tu pedido #${p.id} ya está listo: lo llevamos al correo por la ${f}.`;
      }
      if (tipo === 'retiro') {
        return `¡Hola! Te escribimos de ${nombre}. Tu pedido #${p.id} va a estar listo para retirar por la ${f}.`;
      }
      if (tipo === 'coordinar') {
        return `¡Hola! Te escribimos de ${nombre} por tu pedido #${p.id}. Lo tendríamos listo por la ${f}. ¿Cómo te queda para coordinar la entrega?`;
      }
      const destino = calleYNumero(p);
      return `¡Hola! Te escribimos de ${nombre}. Tu pedido #${p.id} sale hoy por la ${f}` +
        (destino ? ` hacia ${destino}` : '') +
        '.';
    },
  },
  franja: {
    label: 'Avisar que sale', siguiente: 'por_salir',
    labelCorreo: 'Avisar que sale para el correo',
    btnClass: 'bg-amber-600 hover:bg-amber-700', whatsapp: true,
    mensajeWA: (p, franja, nombre) => {
      const tipo = tipoEntrega(p);
      if (tipo === 'correo') {
        return `¡Hola! Te escribimos de ${nombre}. Tu pedido #${p.id} sale hoy para el correo. Apenas lo despachemos te pasamos el número de seguimiento.`;
      }
      if (tipo === 'retiro') {
        return `¡Hola! Tu pedido #${p.id} ya está listo para retirar en ${nombre}. ¡Te esperamos!`;
      }
      if (tipo === 'coordinar') {
        return `¡Hola! Tu pedido #${p.id} de ${nombre} ya está listo. Escribinos y coordinamos la entrega.`;
      }
      const destino = calleYNumero(p);
      return `¡Hola! Te escribimos de ${nombre}. Tu pedido #${p.id} ya está en camino` +
        (destino ? ` hacia ${destino}` : '') +
        '. ¡Ya llega!';
    },
  },
  por_salir: {
    // Con el correo, despachar pide la empresa y el número de seguimiento.
    label: 'Marcar como despachado', siguiente: 'despachado',
    btnClass: 'bg-emerald-700 hover:bg-emerald-800', whatsapp: false,
  },
};

function etiquetaAccion(accion, p) {
  return tipoEntrega(p) === 'correo' && accion.labelCorreo ? accion.labelCorreo : accion.label;
}

// La dirección para mostrar: la copia congelada en el pedido y, en los
// pedidos viejos, la embebida.
function direccionDe(p) {
  return p.direccion_copia || p.direccion || null;
}

function tiempoRelativo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs}h`;
  return `hace ${Math.floor(hs / 24)}d`;
}

function fmt(n) { return Number(n).toLocaleString('es-AR'); }

// Si el teléfono guardado no se puede convertir en un número de WhatsApp, no
// se abre un link roto: se muestra tal como está para que el vendedor lo copie.
// Sin ningún teléfono tampoco se queda en silencio: el paso ya avanzó, pero el
// vendedor tiene que saber que no le llegó el mensaje a nadie.
function abrirWhatsApp(telefono, mensaje) {
  if (!telefono) {
    alert('Este pedido no tiene teléfono de contacto');
    return;
  }
  const link = linkWhatsApp(telefono, mensaje);
  if (!link) {
    alert(`No pudimos armar el link de WhatsApp con el teléfono guardado. Copialo y escribile directamente: ${telefono}`);
    return;
  }
  window.open(link, '_blank');
}

export default function VendedorPedidosPage() {
  const supabase = createClient();
  const router = useRouter();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(null);
  // El pedido al que hay que bajar cuando la lista ya se dibujó (link del mail).
  const aScrollear = useRef(null);
  const [avanzando, setAvanzando] = useState(null);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [franjaModal, setFranjaModal] = useState(null);
  const [franjaElegida, setFranjaElegida] = useState('Mañana');
  // El seguimiento del correo: al despachar (modo 'despachar') o para
  // corregirlo después (modo 'corregir', no reenvía el mail).
  const [seguimientoModal, setSeguimientoModal] = useState(null);
  const [segEmpresa, setSegEmpresa] = useState('correo_argentino');
  const [segOtra, setSegOtra] = useState('');
  const [segNumero, setSegNumero] = useState('');
  const [segError, setSegError] = useState('');
  const [segGuardando, setSegGuardando] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);

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
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace(`/entrar?next=${encodeURIComponent('/vendedor/pedidos' + window.location.search)}`); return; }

      // Los pedidos vienen del servidor: el navegador no puede leer 'pedidos',
      // 'pedido_items' ni la dirección del comprador. La ruta ya verifica que
      // quien pide sea el dueño de esas ventas.
      try {
        const res = await fetch('/api/vendedor/pedidos');
        const datos = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(datos.error || 'No se pudieron cargar los pedidos.');
          console.error('Error cargando pedidos del vendedor', res.status, datos.error);
          setCargando(false);
          return;
        }

        setNombreNegocio(datos.vendedor?.nombre_negocio || '');
        setPedidos(datos.pedidos || []);

        // El link del mail de venta trae ?pedido=N: si ese pedido está en la
        // lista (o sea, es de esta tienda), se abre desplegado. Si no está, la
        // lista se muestra normal, sin error.
        const pedidoDelLink = Number(new URLSearchParams(window.location.search).get('pedido'));
        if (pedidoDelLink && (datos.pedidos || []).some((p) => p.id === pedidoDelLink)) {
          setAbierto(pedidoDelLink);
          aScrollear.current = pedidoDelLink;
        }
      } catch (err) {
        console.error('Error de red cargando los pedidos', err);
        setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
      }
      setCargando(false);
    }
    cargar();
  }, []);

  // Baja hasta el pedido del link una vez que la lista salió de "Cargando...".
  useEffect(() => {
    if (cargando || aScrollear.current === null) return;
    document.getElementById(`pedido-${aScrollear.current}`)?.scrollIntoView({ block: 'start' });
    aScrollear.current = null;
  }, [cargando]);

  // Los items ya vienen con cada pedido: desplegar es sólo abrir y cerrar.
  function toggleDetalle(pedidoId) {
    setAbierto(abierto === pedidoId ? null : pedidoId);
  }

  function iniciarAvance(pedido) {
    const accion = ACCIONES[pedido.estado];
    if (!accion) return;
    if (accion.pideFranja) { setFranjaModal(pedido); setFranjaElegida('Mañana'); return; }
    if (accion.siguiente === 'despachado' && tipoEntrega(pedido) === 'correo') {
      abrirSeguimiento(pedido, 'despachar');
      return;
    }
    ejecutarAvance(pedido);
  }

  function abrirSeguimiento(pedido, modo) {
    setSeguimientoModal({ pedido, modo });
    setSegEmpresa(pedido.envio_empresa || 'correo_argentino');
    setSegOtra(pedido.envio_empresa_otra || '');
    setSegNumero(pedido.envio_seguimiento || '');
    setSegError('');
  }

  // Revisa con la misma regla que el servidor; si está bien, despacha o
  // corrige.
  async function confirmarSeguimiento() {
    const datos = { empresa: segEmpresa, otra: segOtra, numero: segNumero };
    const validado = validarSeguimiento(datos);
    if (!validado.ok) { setSegError(validado.error); return; }
    const { pedido, modo } = seguimientoModal;

    if (modo === 'despachar') {
      setSeguimientoModal(null);
      ejecutarAvance(pedido, undefined, datos);
      return;
    }

    setSegGuardando(true);
    try {
      const res = await fetch('/api/vendedor/pedidos/seguimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedido.id, ...datos }),
      });
      const respuesta = await res.json().catch(() => ({}));
      if (!res.ok) { setSegError(respuesta.error || 'No se pudo guardar el seguimiento.'); setSegGuardando(false); return; }
      setPedidos(prev => prev.map(p => (p.id === pedido.id ? { ...p, ...respuesta.pedido } : p)));
      setSeguimientoModal(null);
    } catch {
      setSegError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
    }
    setSegGuardando(false);
  }

  async function ejecutarAvance(pedido, franja, seguimiento) {
    const accion = ACCIONES[pedido.estado];
    if (!accion) return;
    setAvanzando(pedido.id);
    setFranjaModal(null);

    // El avance lo decide el servidor: acá sólo se dice a qué paso se quiere
    // ir. Si no corresponde, la ruta lo rechaza y explica por qué.
    try {
      const res = await fetch('/api/vendedor/pedidos/avanzar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id: pedido.id,
          destino: accion.siguiente,
          ...(accion.pideFranja ? { franja } : {}),
          ...(seguimiento ? { seguimiento } : {}),
        }),
      });
      const datos = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error('Avance rechazado', res.status, datos.motivo, datos.error);
        alert(datos.error || 'No se pudo actualizar el estado del pedido.');
        setAvanzando(null);
        return;
      }

      setPedidos(prev => prev.map(p => (
        p.id === pedido.id
          ? { ...p, ...datos.pedido }
          : p
      )));

      // El mail al comprador lo manda la misma ruta. Si no salió, se avisa:
      // el pedido ya quedó despachado igual.
      if (datos.pedido.estado === 'despachado' && datos.aviso && !datos.aviso.enviado) {
        alert('El pedido se marcó como despachado, pero no se pudo enviar el email al comprador.');
      }

      // El teléfono congelado en el pedido; el de la dirección queda de
      // respaldo para los pedidos anteriores a esa columna.
      if (accion.whatsapp) {
        const telefono = pedido.comprador_telefono || pedido.direccion?.telefono;
        abrirWhatsApp(telefono, accion.mensajeWA(pedido, franja, nombreNegocio));
      }
    } catch (err) {
      console.error('Error de red al avanzar el pedido', err);
      alert('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
    }
    setAvanzando(null);
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean);

  if (cargando) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando pedidos...</span>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
          <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />
          <div className="pt-20 pb-24 px-4 md:px-8">
            <div className="max-w-xl mx-auto">
              <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const activos = pedidos.filter(p => ['pagado', 'preparando', 'franja', 'por_salir'].includes(p.estado));
  // 'cancelado' y 'reembolsado' van al historial: el pedido terminó, no hay
  // nada que preparar, pero no puede desaparecer del panel.
  const completados = pedidos.filter(p => ['despachado', 'rechazado', 'pendiente', 'cancelado', 'reembolsado'].includes(p.estado));

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />

            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight m-0 mb-1">Pedidos de mi negocio</h1>
            <p className="text-sm text-[#0a0a0a]/30 font-light m-0 mb-6">
              {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'} en total
            </p>

            {pedidos.length === 0 && (
              <div className="border border-dashed border-[#0a0a0a]/10 rounded-2xl px-8 py-12 text-center">
                <p className="text-3xl m-0 mb-2">📦</p>
                <p className="text-sm text-[#0a0a0a]/30 font-light m-0">Todavía no recibiste pedidos. ¡Van a llegar!</p>
              </div>
            )}

            {activos.length > 0 && (
              <>
                <h2 className="text-sm font-medium text-[#0a0a0a]/40 m-0 mb-3">
                  Pedidos activos ({activos.length})
                </h2>
                {activos.map(p => (
                  <PedidoCard key={p.id} pedido={p} abierto={abierto === p.id}
                    items={p.items || []} avanzando={avanzando === p.id}
                    onToggle={() => toggleDetalle(p.id)} onAvanzar={() => iniciarAvance(p)}
                    onCorregirSeguimiento={() => abrirSeguimiento(p, 'corregir')} />
                ))}
              </>
            )}

            {completados.length > 0 && (
              <>
                <h2 className="text-sm font-medium text-[#0a0a0a]/25 mt-8 mb-3">
                  Historial ({completados.length})
                </h2>
                {completados.map(p => (
                  <PedidoCard key={p.id} pedido={p} abierto={abierto === p.id}
                    items={p.items || []} avanzando={avanzando === p.id}
                    onToggle={() => toggleDetalle(p.id)} onAvanzar={() => iniciarAvance(p)}
                    onCorregirSeguimiento={() => abrirSeguimiento(p, 'corregir')} />
                ))}
              </>
            )}

            {franjaModal && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000] p-4"
                onClick={() => setFranjaModal(null)}>
                <div onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl p-6 max-w-[380px] w-full">
                  <h3 className="text-lg font-black text-[#0a0a0a] tracking-tight m-0 mb-2">
                    {tipoEntrega(franjaModal) === 'correo' ? '¿En qué franja lo llevás al correo?' : '¿En qué franja horaria sale?'}
                  </h3>
                  <p className="text-sm text-[#0a0a0a]/30 font-light m-0 mb-4">
                    {tipoEntrega(franjaModal) === 'correo'
                      ? 'Le avisamos al comprador cuándo lo llevás al correo.'
                      : 'Le avisamos al comprador en qué horario esperar el envío.'}
                  </p>
                  <div className="flex gap-2 mb-5">
                    {['Mañana', 'Tarde'].map(f => (
                      <button key={f} type="button" onClick={() => setFranjaElegida(f)}
                        className={`flex-1 py-3 rounded-xl cursor-pointer text-sm transition-all ${
                          franjaElegida === f
                            ? 'border-2 border-violet-600 bg-violet-50 text-violet-600 font-semibold'
                            : 'border border-[#0a0a0a]/5 bg-white text-[#0a0a0a]/40 hover:border-[#0a0a0a]/15'
                        }`}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setFranjaModal(null)}
                      className="flex-1 py-3 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 transition-all">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => ejecutarAvance(franjaModal, franjaElegida)}
                      className="flex-1 py-3 border-none rounded-full bg-violet-600 text-white cursor-pointer text-sm font-medium hover:bg-violet-700 transition-colors">
                      Avisar por WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            )}

            {seguimientoModal && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000] p-4"
                onClick={() => !segGuardando && setSeguimientoModal(null)}>
                <div onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl p-6 max-w-[400px] w-full">
                  <h3 className="text-lg font-black text-[#0a0a0a] tracking-tight m-0 mb-2">
                    {seguimientoModal.modo === 'despachar' ? '¿Con qué lo despachaste?' : 'Corregir el seguimiento'}
                  </h3>
                  <p className="text-sm text-[#0a0a0a]/30 font-light m-0 mb-4">
                    {seguimientoModal.modo === 'despachar'
                      ? 'Quien compra recibe el número por mail y lo ve en Mis pedidos.'
                      : 'Se actualiza en Mis pedidos. No se vuelve a mandar el mail.'}
                  </p>
                  <label className="block text-sm text-[#0a0a0a]/50 font-light mb-1">Empresa</label>
                  <select value={segEmpresa} onChange={(e) => { setSegError(''); setSegEmpresa(e.target.value); }}
                    className="w-full mb-3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:border-[#0a0a0a]">
                    {Object.entries(EMPRESAS_ENVIO).map(([clave, e]) => <option key={clave} value={clave}>{e.nombre}</option>)}
                  </select>
                  {segEmpresa === 'otra' && (
                    <>
                      <label className="block text-sm text-[#0a0a0a]/50 font-light mb-1">Nombre de la empresa</label>
                      <input value={segOtra} maxLength={60} onChange={(e) => { setSegError(''); setSegOtra(e.target.value); }}
                        className="w-full mb-3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#0a0a0a]" />
                    </>
                  )}
                  <label className="block text-sm text-[#0a0a0a]/50 font-light mb-1">Número de seguimiento</label>
                  <input value={segNumero} maxLength={60} onChange={(e) => { setSegError(''); setSegNumero(e.target.value); }}
                    className="w-full mb-3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#0a0a0a]" />
                  {segError && <p className="m-0 mb-3 text-sm text-red-700">{segError}</p>}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setSeguimientoModal(null)} disabled={segGuardando}
                      className="flex-1 py-3 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 transition-all">
                      Cancelar
                    </button>
                    <button type="button" onClick={confirmarSeguimiento} disabled={segGuardando}
                      className="flex-1 py-3 border-none rounded-full bg-emerald-700 text-white cursor-pointer text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50">
                      {segGuardando ? 'Guardando...' : (seguimientoModal.modo === 'despachar' ? 'Marcar como despachado' : 'Guardar')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function PedidoCard({ pedido, abierto, items, avanzando, onToggle, onAvanzar, onCorregirSeguimiento }) {
  const p = pedido;
  const estado = estadoDe(p);
  const accion = ACCIONES[p.estado];
  const primerItem = items[0];
  const direccion = direccionDe(p);
  const seguimiento = seguimientoDe(p);

  return (
    // scroll-mt: que la barra fija de arriba no tape el pedido al bajar.
    <div id={`pedido-${p.id}`} className="scroll-mt-24 border border-[#0a0a0a]/5 rounded-2xl px-5 py-4 mb-3">
      <div onClick={onToggle} className="cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#F5F2EC] shrink-0 overflow-hidden flex items-center justify-center text-[#0a0a0a]/15 text-xl">
            {primerItem?.foto_url ? (
              <img src={primerItem.foto_url} alt="" className="w-full h-full object-cover" />
            ) : '📦'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Afuera va el apodo; nombre real y teléfono, sólo en el detalle. */}
              <span className="text-sm text-[#0a0a0a] inline-flex items-center gap-2">
                {p.comprador_eliminado ? (
                  // Cuenta eliminada: círculo gris claro, sin letra.
                  <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: '28px', height: '28px', backgroundColor: '#e8e5df' }} />
                ) : (
                  <AvatarApodo apodo={p.comprador_apodo} tamano={28} />
                )}
                <strong>{p.comprador_eliminado ? 'Cuenta eliminada' : (p.comprador_apodo || 'Comprador')}</strong>
                <span className="text-[#0a0a0a]/50"> · Pedido #{p.id}</span>
              </span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${estado.bg} ${estado.color}`}>
                {estado.label}
              </span>
            </div>
            <p className="mt-0.5 mb-0 text-[11px] text-[#0a0a0a]/25 font-light">
              {textoEntrega(p)} · {tiempoRelativo(p.creado_en)}
            </p>
          </div>

          <div className="text-right shrink-0">
            <div className="font-semibold text-[#0a0a0a] text-sm">${fmt(p.total)}</div>
            <div className="text-[10px] text-[#0a0a0a]/20 font-light">{abierto ? 'Ocultar ▲' : 'Ver detalle ▼'}</div>
          </div>
        </div>
      </div>

      {abierto && (
        <div className="mt-4 pt-4 border-t border-[#0a0a0a]/5">
          <div className="mb-4">
            <p className="m-0 mb-2 text-[11px] text-[#0a0a0a]/25 font-light uppercase tracking-wider">Productos</p>
            {items.length === 0 ? (
              <p className="text-sm text-[#0a0a0a]/20 font-light">Este pedido no tiene productos registrados.</p>
            ) : items.map(it => (
              <div key={it.id} className="flex justify-between py-1 text-sm">
                <span className="text-[#0a0a0a]/60 font-light">{it.nombre}{it.variante ? ` · ${it.variante}` : ''} × {it.cantidad}</span>
                <span className="text-[#0a0a0a]">${fmt(it.precio * it.cantidad)}</span>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <p className="m-0 mb-1.5 text-[11px] text-[#0a0a0a]/25 font-light uppercase tracking-wider">Entrega</p>
            <p className="m-0 text-sm text-[#0a0a0a]/60 font-light">{textoEntrega(p)}</p>
            {p.turno_preferido && (
              <p className="m-0 text-[11px] text-[#0a0a0a]/25 font-light">Preferencia: {p.turno_preferido.toLowerCase()}</p>
            )}
            {p.franja_horaria && (
              <p className="m-0 text-[11px] text-[#0a0a0a]/40 font-light">
                {tipoEntrega(p) === 'correo' ? 'Lo llevás al correo a la' : 'Franja horaria avisada:'} {p.franja_horaria.toLowerCase()}
              </p>
            )}
            {seguimiento && (
              <p className="mt-1 mb-0 text-sm text-[#0a0a0a]/60 font-light">
                {seguimiento.empresa} · N° {seguimiento.numero}
                {tipoEntrega(p) === 'correo' && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onCorregirSeguimiento(); }}
                    className="ml-2 text-[11px] text-[#0a0a0a]/40 underline underline-offset-2 cursor-pointer bg-transparent border-none p-0">
                    Corregir
                  </button>
                )}
              </p>
            )}
            {p.datos_de_contacto === 'ocultos' ? (
              // Sin pagar: la ruta ni siquiera manda nombre, teléfono ni dirección.
              <p className="mt-1 mb-0 text-sm text-[#0a0a0a]/40 font-light leading-relaxed">
                {textoDatosOcultos(p)}
              </p>
            ) : p.comprador_eliminado ? (
              // Cuenta eliminada: el método de entrega queda a la vista; el nombre,
              // el teléfono y la dirección ya no existen.
              <p className="mt-1 mb-0 text-sm text-[#0a0a0a]/40 font-light">Quien hizo esta compra eliminó su cuenta.</p>
            ) : (
              <>
                {(p.comprador_nombre || p.comprador_apellido || p.comprador_telefono) && (
                  <p className="mt-1 mb-0 text-sm text-[#0a0a0a]/60 font-light">
                    {[p.comprador_nombre, p.comprador_apellido].filter(Boolean).join(' ')}
                    {(p.comprador_nombre || p.comprador_apellido) && p.comprador_telefono && <br />}
                    {p.comprador_telefono && <>Tel. {p.comprador_telefono}</>}
                  </p>
                )}
                {direccion && (
                  <p className="mt-1 mb-0 text-sm text-[#0a0a0a]/60 font-light">
                    {calleNumeroDepto(direccion)}
                    {ciudadProvinciaCodigo(direccion) && <><br />{ciudadProvinciaCodigo(direccion)}</>}
                    {direccion.telefono && <><br />Tel. {direccion.telefono}</>}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="pt-2 border-t border-[#0a0a0a]/5 mb-4">
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-[#0a0a0a]/40 font-light">Productos</span>
              <span className="text-[#0a0a0a]">${fmt(p.subtotal_productos)}</span>
            </div>
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-[#0a0a0a]/40 font-light">Envío</span>
              <span className="text-[#0a0a0a]">${fmt(p.costo_envio)}</span>
            </div>
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-[#0a0a0a]/25 font-light">Comisión Bahía Shops (5%)</span>
              <span className="text-[#0a0a0a]/25">-${fmt(p.comision_plataforma)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-[#0a0a0a] pt-2 border-t border-[#0a0a0a]/5 mt-1">
              <span>Recibís</span>
              <span>${fmt(p.total - (p.comision_plataforma || 0))}</span>
            </div>
          </div>

          {accion && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAvanzar(); }} disabled={avanzando}
              className={`w-full py-3 text-sm border-none rounded-full text-white flex items-center justify-center gap-2 font-medium transition-colors ${
                avanzando ? 'bg-[#0a0a0a]/20 cursor-not-allowed' : `${accion.btnClass} cursor-pointer`
              }`}>
              {accion.whatsapp && (
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.564l4.72-1.236A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6c-2.07 0-4.046-.54-5.795-1.56l-.42-.25-2.8.735.747-2.73-.27-.43A9.554 9.554 0 0 1 2.4 12c0-5.302 4.298-9.6 9.6-9.6 5.302 0 9.6 4.298 9.6 9.6 0 5.302-4.298 9.6-9.6 9.6z"/>
                </svg>
              )}
              {avanzando ? 'Actualizando...' : etiquetaAccion(accion, p)}
            </button>
          )}

          {p.estado === 'despachado' && (
            <div className="text-center py-3 bg-emerald-50 rounded-xl text-emerald-700 font-medium text-sm">
              ✓ Pedido completado
            </div>
          )}
        </div>
      )}
    </div>
  );
}
