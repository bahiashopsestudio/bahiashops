'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';
import AvatarApodo from '@/components/AvatarApodo';
import { ChipForma, BarraPasos, FlechaDesplegar, fechaYHora } from '@/components/PasosPedido';
import { linkWhatsApp } from '@/lib/telefono';
import {
  etiquetaMetodo, zonaDe, EMPRESAS_ENVIO, validarSeguimiento, seguimientoDe,
} from '@/lib/metodosEntrega';
import { calleNumeroDepto, ciudadProvinciaCodigo } from '@/lib/direcciones';
import {
  pestanaEnElPanel, siguientePaso, pasosDe, formaDeEntrega, NOMBRE_PASO, ESTADO_ENTREGADO, ESTADO_REEMBOLSADO,
} from '@/lib/pedidos';
import { diasSinMarcarEntregado, textoPedidosSinMarcar } from '@/lib/resenas';

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage'];

const VERDE = '#2e6b4f';

// Las pestañas del panel (mismo estilo que Moderación). Qué pedido va en cada
// una lo decide pestanaDePedido en el servidor (manda `pestana` en cada pedido)
// y acá pestanaEnElPanel (src/lib/pedidos.js). En "Entregados" los
// reembolsados van aparte, debajo, y no suman al contador. `pro`: el badge
// decorativo, no limita nada.
const PESTANAS = [
  { clave: 'nuevos', label: 'Nuevos pedidos', vacio: 'No tenés pedidos para preparar ni entregar.' },
  { clave: 'entregados', label: 'Entregados', vacio: 'Todavía no marcaste ningún pedido como entregado.' },
  { clave: 'carritos', label: 'Carritos abandonados', pro: true, vacio: 'No tenés carritos abandonados.' },
];

// Lo que se ve en lugar de los datos de contacto de un pago en efectivo en
// proceso: todavía no se pagó.
function textoDatosOcultos() {
  return 'Los datos de contacto de quien compra (nombre, teléfono y dirección) aparecen cuando se acredite el pago.';
}

// "Envío de la tienda · zona 2", para el detalle.
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

// Cómo nombrar a quien compró en los textos del pedido: siempre el apodo,
// nunca el nombre real. Sin apodo (cuenta eliminada), "quien compró" en medio
// de la frase y "Quien compró" al empezarla.
function apodoDe(p, { alEmpezar = false } = {}) {
  const apodo = p.comprador_eliminado ? '' : String(p.comprador_apodo ?? '').trim();
  if (apodo) return apodo;
  return alEmpezar ? 'Quien compró' : 'quien compró';
}

// Lo que hace cada paso, según a cuál se va. El paso siguiente lo decide
// siguientePaso (src/lib/pedidos.js), igual que el servidor.
//   ayuda      el texto gris al lado del botón
//   whatsapp   después de avanzar se abre WhatsApp con mensajeWA
//   pideFranja antes de avanzar se elige la franja (modal)
//   confirmar  antes de avanzar se pide confirmación dentro de la tarjeta
const ACCIONES = {
  preparando: {
    label: 'Empezar a preparar',
    ayuda: () => 'Abre WhatsApp con el mensaje armado',
    whatsapp: true,
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! Te escribimos de ${nombre}. Ya estamos preparando tu pedido con el código número #${p.id}. ` +
      ({
        retiro: '¡Te avisamos cuando esté listo para retirar!',
        correo: '¡Te avisamos cuando lo despachemos por correo!',
        envio: '¡Te avisamos en qué franja llega!',
        coordinar: 'Te escribimos para acordar la entrega.',
      })[formaDeEntrega(p.metodo_envio)],
  },
  listo: {
    label: 'Avisar que está listo',
    ayuda: () => 'Le llega el mail y se abre WhatsApp',
    whatsapp: true,
    // Dos renglones: el salto viaja en el link como %0A (linkWhatsApp).
    mensajeWA: (p, franja, nombre) =>
      `¡Hola! Te escribimos de ${nombre}. También te llegó un mail de Bahía Shops con el detalle de tu pedido.\n` +
      `Tu pedido #${p.id} ya está listo para retirar. ¿Cuándo te queda cómodo pasar?`,
  },
  franja: {
    label: 'Avisar la franja',
    ayuda: () => 'Elegís la franja y se abre WhatsApp',
    whatsapp: true,
    pideFranja: true,
    mensajeWA: (p, franja, nombre) => {
      const destino = calleYNumero(p);
      return `¡Hola! Te escribimos de ${nombre}. Tu pedido #${p.id} sale hoy por la ${franja.toLowerCase()}` +
        (destino ? ` hacia ${destino}` : '') +
        '.';
    },
  },
  despachado: {
    label: 'Despachar',
    // Con el correo, despachar pide la empresa y el número de seguimiento.
    ayuda: (p) => formaDeEntrega(p.metodo_envio) === 'correo'
      ? 'Cargás el seguimiento; le llega el mail de despacho'
      : 'Le llega el mail de despacho',
  },
  acordado: {
    label: 'Marcar como acordado',
    ayuda: () => 'Para cuando ya arreglaron cuándo y dónde',
  },
  entregado: {
    label: 'Marcar como entregado',
    ayuda: (p) => `Pasa a Entregados y ${apodoDe(p)} puede dejarte una reseña`,
    confirmar: true,
    verde: true,
  },
};

// El paso siguiente de este pedido y lo que hace, o null si no hay.
function accionDe(p) {
  // Un pago en efectivo en proceso no tiene botones: todavía no se pagó.
  if (p.estado === 'pendiente') return null;
  const destino = siguientePaso(p);
  return destino && ACCIONES[destino] ? { destino, ...ACCIONES[destino] } : null;
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

// Para ordenar: los entregados, el más reciente arriba.
function msDe(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
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
  // El pedido con la confirmación de "Marcar como entregado" abierta.
  const [confirmando, setConfirmando] = useState(null);
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
  const [pestana, setPestana] = useState('nuevos');
  // La hora a la que se cargó la lista: de ella depende en qué pestaña cae un
  // pago en efectivo (si el cupón sigue vigente). Va en el estado para que el
  // render sea puro.
  const [ahora, setAhora] = useState(0);
  // Los carritos a los que se les está mandando el recordatorio ahora mismo.
  const [enviandoRecordatorio, setEnviandoRecordatorio] = useState({});
  // Si la tienda tiene MercadoPago conectado (lo dice el servidor). Sin cuenta,
  // "Recordarle" muestra un cartel en vez de mandar el mail. null = no se sabe:
  // se deja intentar y decide el servidor.
  const [mpConectado, setMpConectado] = useState(null);
  const [sinMpModal, setSinMpModal] = useState(false);

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
        setMpConectado(typeof datos.mp_conectado === 'boolean' ? datos.mp_conectado : null);
        setAhora(Date.now());

        // El link del mail de venta trae ?pedido=N: si ese pedido está en la
        // lista (o sea, es de esta tienda), se abre su pestaña, se despliega y
        // se baja hasta él. Si no está, la lista se muestra normal, sin error.
        const pedidoDelLink = Number(new URLSearchParams(window.location.search).get('pedido'));
        const delLink = (datos.pedidos || []).find((p) => p.id === pedidoDelLink);
        if (pedidoDelLink && delLink) {
          setPestana(pestanaEnElPanel(delLink, Date.now()) || 'nuevos');
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
    setConfirmando(null);
  }

  function iniciarAvance(pedido) {
    const accion = accionDe(pedido);
    if (!accion) return;
    if (accion.pideFranja) { setFranjaModal(pedido); setFranjaElegida('Mañana'); return; }
    if (accion.destino === 'despachado' && formaDeEntrega(pedido.metodo_envio) === 'correo') {
      abrirSeguimiento(pedido, 'despachar');
      return;
    }
    if (accion.confirmar) { setConfirmando(pedido.id); return; }
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
    const accion = accionDe(pedido);
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
          destino: accion.destino,
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

      // Un pedido entregado pasa a la pestaña "Entregados".
      setPedidos(prev => prev.map(p => (
        p.id === pedido.id
          ? { ...p, ...datos.pedido, ...(datos.pedido.estado === ESTADO_ENTREGADO ? { pestana: 'entregados' } : {}) }
          : p
      )));
      setConfirmando(null);

      // Los mails a quien compró los manda la misma ruta. Si no salieron, se
      // avisa: el pedido ya quedó en su paso igual.
      if (datos.pedido.estado === 'despachado' && datos.aviso && !datos.aviso.enviado) {
        alert('El pedido se marcó como despachado, pero no se pudo enviar el email al comprador.');
      }
      if (datos.pedido.estado === 'listo' && datos.aviso && !datos.aviso.enviado && datos.aviso.motivo !== 'ya_enviado') {
        alert('El pedido quedó como listo para retirar, pero no se pudo enviar el email a quien compró. El WhatsApp se abre igual.');
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

  // "Recordarle": el mail lo manda el servidor, una sola vez por pedido. Si sale
  // bien, el carrito queda marcado y el botón no vuelve.
  // Sin MercadoPago conectado, quien compró llegaría a una tienda donde no puede
  // pagar: en vez del mail, el cartel para ir a conectar la cuenta.
  async function enviarRecordatorio(pedidoId) {
    if (mpConectado === false) {
      setSinMpModal(true);
      return;
    }
    setEnviandoRecordatorio((prev) => ({ ...prev, [pedidoId]: true }));
    try {
      const res = await fetch('/api/vendedor/pedidos/recordar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId }),
      });
      const datos = await res.json().catch(() => ({}));
      if (res.status === 400 && datos.codigo === 'SIN_MP') {
        // Se desconectó con el panel abierto: el servidor lo frenó.
        setMpConectado(false);
        setSinMpModal(true);
      } else if (!res.ok) {
        alert(datos.error || 'No se pudo enviar el recordatorio.');
      } else {
        const enviadoEn = datos.recordatorio_enviado_en || new Date().toISOString();
        setPedidos((prev) => prev.map((p) => (p.id === pedidoId ? { ...p, recordatorio_enviado_en: enviadoEn } : p)));
      }
    } catch (err) {
      console.error('Error de red al mandar el recordatorio', err);
      alert('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
    }
    setEnviandoRecordatorio((prev) => ({ ...prev, [pedidoId]: false }));
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

  // Cada pedido en su pestaña. Un pago en efectivo cuyo cupón venció con el panel
  // abierto sale de la lista (pestanaEnElPanel devuelve null). En "Entregados",
  // los reembolsados van aparte (cancelados).
  const porPestana = { nuevos: [], entregados: [], carritos: [] };
  const cancelados = [];
  for (const p of pedidos) {
    const clave = pestanaEnElPanel(p, ahora);
    if (!clave) continue;
    if (clave === 'entregados' && p.estado === ESTADO_REEMBOLSADO) cancelados.push(p);
    else porPestana[clave].push(p);
  }
  porPestana.entregados.sort((a, b) => msDe(b.entregado_at) - msDe(a.entregado_at));
  cancelados.sort((a, b) => msDe(b.actualizado_en) - msDe(a.actualizado_en));

  // Los carritos abandonados no son pedidos: no suman al total, pero si hay
  // alguno las pestañas se muestran igual.
  const totalPedidos = porPestana.nuevos.length + porPestana.entregados.length + cancelados.length;
  const hayAlgo = totalPedidos + porPestana.carritos.length > 0;
  const actual = PESTANAS.find((t) => t.clave === pestana) || PESTANAS[0];
  const lista = porPestana[actual.clave];

  // Los pagados hace 14 días o más que la tienda no marcó entregados (el mismo
  // criterio del aviso de los 14 días a quien compró). Se calcula al mostrar.
  const sinMarcar = textoPedidosSinMarcar(
    porPestana.nuevos.filter((p) => diasSinMarcarEntregado(p, ahora) !== null).length
  );

  const tarjeta = (p) => (
    <PedidoCard key={p.id} pedido={p} abierto={abierto === p.id} ahora={ahora}
      items={p.items || []} avanzando={avanzando === p.id}
      confirmando={confirmando === p.id}
      onToggle={() => toggleDetalle(p.id)} onAvanzar={() => iniciarAvance(p)}
      onConfirmarEntrega={() => ejecutarAvance(p)} onCancelarEntrega={() => setConfirmando(null)}
      onCorregirSeguimiento={() => abrirSeguimiento(p, 'corregir')} />
  );

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
              {totalPedidos} {totalPedidos === 1 ? 'pedido' : 'pedidos'} en total
            </p>
            {sinMarcar && (
              <p className="text-[13px] text-[#0a0a0a]/45 font-light m-0 -mt-4 mb-6">{sinMarcar}</p>
            )}

            {!hayAlgo ? (
              <div className="border border-dashed border-[#0a0a0a]/10 rounded-2xl px-8 py-12 text-center">
                <p className="text-3xl m-0 mb-2">📦</p>
                <p className="text-sm text-[#0a0a0a]/30 font-light m-0">Todavía no recibiste pedidos. ¡Van a llegar!</p>
              </div>
            ) : (
              <>
                {/* Las pestañas, con el estilo de Moderación: subrayado en la
                    activa y el contador al lado. */}
                <div role="tablist" className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto whitespace-nowrap no-scrollbar">
                  {PESTANAS.map((t) => {
                    const activa = t.clave === actual.clave;
                    const cantidad = porPestana[t.clave].length;
                    return (
                      <button key={t.clave} type="button" role="tab" aria-selected={activa}
                        onClick={() => { setPestana(t.clave); setAbierto(null); setConfirmando(null); }}
                        className={`flex items-center gap-2 px-3 md:px-4 py-2.5 -mb-px border-0 border-b-2 border-solid bg-transparent text-sm cursor-pointer transition-colors ${
                          activa ? 'border-[#0a0a0a] text-[#0a0a0a] font-semibold' : 'border-transparent text-gray-500 hover:text-[#0a0a0a]'
                        }`}>
                        {t.label}
                        <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                          t.clave === 'nuevos' && cantidad > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {cantidad}
                        </span>
                        {t.pro && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Pro</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {actual.clave === 'carritos' ? (
                  lista.length === 0 ? (
                    <p className="text-sm text-[#0a0a0a]/30 font-light m-0 py-6">{actual.vacio}</p>
                  ) : lista.map(p => (
                    <CarritoCard key={p.id} pedido={p} enviando={!!enviandoRecordatorio[p.id]}
                      onRecordar={() => enviarRecordatorio(p.id)} />
                  ))
                ) : (
                  <>
                    {lista.length === 0
                      ? <p className="text-sm text-[#0a0a0a]/30 font-light m-0 py-6">{actual.vacio}</p>
                      : lista.map(tarjeta)}

                    {actual.clave === 'entregados' && cancelados.length > 0 && (
                      <>
                        <h2 className="m-0 mt-8 mb-3 text-[11px] text-[#0a0a0a]/40 font-medium uppercase tracking-wider">
                          Cancelados · dinero devuelto
                        </h2>
                        {cancelados.map(tarjeta)}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {franjaModal && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000] p-4"
                onClick={() => setFranjaModal(null)}>
                <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="franja-titulo"
                  className="bg-white rounded-2xl p-6 max-w-[380px] w-full">
                  <h3 id="franja-titulo" className="text-lg font-black text-[#0a0a0a] tracking-tight m-0 mb-2">
                    ¿En qué franja horaria sale?
                  </h3>
                  <p className="text-sm text-[#0a0a0a]/30 font-light m-0 mb-4">
                    Le avisamos al comprador en qué horario esperar el envío.
                  </p>
                  <div className="flex gap-2 mb-5">
                    {['Mañana', 'Tarde'].map(f => (
                      <button key={f} type="button" onClick={() => setFranjaElegida(f)} aria-pressed={franjaElegida === f}
                        className={`flex-1 py-3 rounded-xl cursor-pointer text-sm transition-all ${
                          franjaElegida === f
                            ? 'border-2 border-[#0a0a0a] bg-[#0a0a0a]/[0.03] text-[#0a0a0a] font-semibold'
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
                      className="flex-1 py-3 border-none rounded-full bg-[#0a0a0a] text-white cursor-pointer text-sm font-medium hover:bg-[#0a0a0a]/80 transition-colors">
                      Avisar por WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mismo estilo que los carteles de MercadoPago de Mi negocio (perfil). */}
            {sinMpModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000]"
                onClick={() => setSinMpModal(false)}>
                <div role="dialog" aria-modal="true" aria-labelledby="sin-mp-titulo"
                  className="bg-white rounded-2xl w-full max-w-[440px] overflow-hidden"
                  onClick={(e) => e.stopPropagation()}>
                  <div className="px-6 py-4 border-b border-[#0a0a0a]/5">
                    <p id="sin-mp-titulo" className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>
                      Conectá MercadoPago
                    </p>
                  </div>
                  <div className="px-6 py-4">
                    <p className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed m-0">
                      No tenés ninguna cuenta de MercadoPago conectada. Conectá tu cuenta de MercadoPago para poder recordarle al comprador que haga su compra.
                    </p>
                  </div>
                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#0a0a0a]/5">
                    <button type="button" onClick={() => setSinMpModal(false)}
                      className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 transition-all">
                      Cancelar
                    </button>
                    <Link href="/vendedor/perfil"
                      className="px-5 py-2.5 rounded-full bg-[#009ee3] text-white text-sm font-medium no-underline hover:bg-[#008dd0] transition-colors">
                      Conectar MercadoPago
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {seguimientoModal && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000] p-4"
                onClick={() => !segGuardando && setSeguimientoModal(null)}>
                <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="seguimiento-titulo"
                  className="bg-white rounded-2xl p-6 max-w-[400px] w-full">
                  <h3 id="seguimiento-titulo" className="text-lg font-black text-[#0a0a0a] tracking-tight m-0 mb-2">
                    {seguimientoModal.modo === 'despachar' ? '¿Con qué lo despachaste?' : 'Corregir el seguimiento'}
                  </h3>
                  <p className="text-sm text-[#0a0a0a]/30 font-light m-0 mb-4">
                    {seguimientoModal.modo === 'despachar'
                      ? 'Quien compra recibe el número por mail y lo ve en Mis pedidos.'
                      : 'Se actualiza en Mis pedidos. No se vuelve a mandar el mail.'}
                  </p>
                  <label className="block text-sm text-[#0a0a0a]/50 font-light mb-1" htmlFor="seg-empresa">Empresa</label>
                  <select id="seg-empresa" value={segEmpresa} onChange={(e) => { setSegError(''); setSegEmpresa(e.target.value); }}
                    className="w-full mb-3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:border-[#0a0a0a]">
                    {Object.entries(EMPRESAS_ENVIO).map(([clave, e]) => <option key={clave} value={clave}>{e.nombre}</option>)}
                  </select>
                  {segEmpresa === 'otra' && (
                    <>
                      <label className="block text-sm text-[#0a0a0a]/50 font-light mb-1" htmlFor="seg-otra">Nombre de la empresa</label>
                      <input id="seg-otra" value={segOtra} maxLength={60} onChange={(e) => { setSegError(''); setSegOtra(e.target.value); }}
                        className="w-full mb-3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#0a0a0a]" />
                    </>
                  )}
                  <label className="block text-sm text-[#0a0a0a]/50 font-light mb-1" htmlFor="seg-numero">Número de seguimiento</label>
                  <input id="seg-numero" value={segNumero} maxLength={60} onChange={(e) => { setSegError(''); setSegNumero(e.target.value); }}
                    className="w-full mb-3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#0a0a0a]" />
                  {segError && <p className="m-0 mb-3 text-sm text-red-700">{segError}</p>}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setSeguimientoModal(null)} disabled={segGuardando}
                      className="flex-1 py-3 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 transition-all">
                      Cancelar
                    </button>
                    <button type="button" onClick={confirmarSeguimiento} disabled={segGuardando}
                      className="flex-1 py-3 border-none rounded-full bg-[#0a0a0a] text-white cursor-pointer text-sm font-medium hover:bg-[#0a0a0a]/80 transition-colors disabled:opacity-50">
                      {segGuardando ? 'Guardando...' : (seguimientoModal.modo === 'despachar' ? 'Despachar' : 'Guardar')}
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

// Un carrito abandonado: quién (solo el apodo: no se pagó, así que no hay datos
// de contacto), qué había elegido y cuándo. Sin estados ni pasos: lo único que
// se puede hacer es mandarle el recordatorio, una vez. Con la cuenta eliminada
// no hay a quién mandárselo.
function CarritoCard({ pedido, enviando, onRecordar }) {
  const p = pedido;
  const items = p.items || [];

  return (
    <div id={`pedido-${p.id}`} className="scroll-mt-24 border border-[#0a0a0a]/5 rounded-2xl px-5 py-4 mb-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0 text-sm text-[#0a0a0a] inline-flex items-center gap-2">
          {p.comprador_eliminado ? (
            <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: '28px', height: '28px', backgroundColor: '#e8e5df' }} />
          ) : (
            <AvatarApodo apodo={p.comprador_apodo} tamano={28} />
          )}
          <strong className="truncate">{p.comprador_eliminado ? 'Cuenta eliminada' : (p.comprador_apodo || 'Comprador')}</strong>
        </span>
        <span className="shrink-0 text-[11px] text-[#0a0a0a]/25 font-light">{tiempoRelativo(p.creado_en)}</span>
      </div>

      <div className="mt-3 pt-3 border-t border-[#0a0a0a]/5">
        {items.length === 0 ? (
          <p className="m-0 text-sm text-[#0a0a0a]/20 font-light">Este carrito no tiene productos registrados.</p>
        ) : items.map(it => (
          <div key={it.id} className="flex justify-between gap-3 py-1 text-sm">
            <span className="text-[#0a0a0a]/60 font-light">{it.cantidad} × {it.nombre}{it.variante ? ` · ${it.variante}` : ''}</span>
            <span className="text-[#0a0a0a] shrink-0">${fmt(it.precio * it.cantidad)}</span>
          </div>
        ))}
      </div>

      {!p.comprador_eliminado && (
        <div className="mt-3 pt-3 border-t border-[#0a0a0a]/5">
          {p.recordatorio_enviado_en ? (
            <p className="m-0 text-sm text-emerald-700 font-light">
              Recordatorio enviado ✓ <span className="text-[#0a0a0a]/30">· {tiempoRelativo(p.recordatorio_enviado_en)}</span>
            </p>
          ) : (
            <button type="button" onClick={onRecordar} disabled={enviando}
              className={`px-5 py-2 text-sm border-none rounded-full text-white font-medium transition-colors ${
                enviando ? 'bg-[#0a0a0a]/20 cursor-not-allowed' : 'bg-[#0a0a0a] hover:bg-[#0a0a0a]/80 cursor-pointer'
              }`}>
              {enviando ? 'Enviando...' : 'Recordarle'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// El paso, tal como se lee en la franja cerrada.
function textoPaso(p) {
  if (p.estado === 'pendiente') return 'Pago en efectivo pendiente';
  if (p.estado === ESTADO_REEMBOLSADO) return 'Cancelado · dinero devuelto';
  return NOMBRE_PASO[p.estado] || p.estado;
}

function Etiqueta({ children }) {
  return <p className="m-0 mb-1.5 text-[11px] text-[#0a0a0a]/25 font-light uppercase tracking-wider">{children}</p>;
}

function PedidoCard({
  pedido, abierto, ahora, items, avanzando, confirmando,
  onToggle, onAvanzar, onConfirmarEntrega, onCancelarEntrega, onCorregirSeguimiento,
}) {
  const p = pedido;
  // Pagado hace 14 días o más y sin marcar entregado: los días, o null.
  const diasSinMarcar = diasSinMarcarEntregado(p, ahora);
  const accion = accionDe(p);
  const direccion = direccionDe(p);
  const seguimiento = seguimientoDe(p);
  const forma = formaDeEntrega(p.metodo_envio);
  const entregado = p.estado === ESTADO_ENTREGADO;
  const reembolsado = p.estado === ESTADO_REEMBOLSADO;
  const idDetalle = `pedido-${p.id}-detalle`;

  return (
    // scroll-mt: que la barra fija de arriba no tape el pedido al bajar.
    <div id={`pedido-${p.id}`} className="scroll-mt-24 border border-[#0a0a0a]/5 rounded-2xl mb-3">
      {/* La franja entera despliega y pliega. */}
      <button type="button" onClick={onToggle} aria-expanded={abierto} aria-controls={idDetalle}
        className="w-full flex items-center gap-3 px-5 py-4 bg-transparent border-0 text-left cursor-pointer rounded-2xl">
        {p.comprador_eliminado ? (
          // Cuenta eliminada: círculo gris claro, sin letra.
          <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: '36px', height: '36px', backgroundColor: '#e8e5df' }} />
        ) : (
          <AvatarApodo apodo={p.comprador_apodo} tamano={36} />
        )}
        <span className="flex-1 min-w-0">
          {/* Afuera va el apodo; nombre real y teléfono, sólo en el detalle. */}
          <span className="block truncate text-[#0a0a0a]" style={{ fontWeight: 600, fontSize: '15px' }}>
            {p.comprador_eliminado ? 'Cuenta eliminada' : (p.comprador_apodo || 'Comprador')}
          </span>
          <span className="mt-1 flex items-center gap-2 min-w-0">
            <ChipForma metodoEnvio={p.metodo_envio} />
            <span className="truncate" style={{ fontWeight: 500, fontSize: '12.5px', color: reembolsado ? '#dc2626' : '#0a0a0a' }}>
              #{p.id} · {textoPaso(p)}
              {!abierto && diasSinMarcar !== null && <span className="text-amber-700"> · ¿Ya lo entregaste?</span>}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-[#0a0a0a] text-sm tabular-nums" style={{ fontWeight: 600 }}>$ {fmt(p.total)}</span>
        <FlechaDesplegar abierto={abierto} />
      </button>

      {abierto && (
        <div id={idDetalle} className="px-5 pb-5">
          <div className="pt-4 border-t border-[#0a0a0a]/5">
            <p className="m-0 mb-4 text-sm text-[#0a0a0a] font-medium">{textoEntrega(p)}</p>

            <div className="mb-4">
              <Etiqueta>Productos</Etiqueta>
              {items.length === 0 ? (
                <p className="m-0 text-sm text-[#0a0a0a]/20 font-light">Este pedido no tiene productos registrados.</p>
              ) : items.map(it => (
                <div key={it.id} className="flex justify-between gap-3 py-1 text-sm">
                  <span className="text-[#0a0a0a]/60 font-light">{it.nombre}{it.variante ? ` · ${it.variante}` : ''} × {it.cantidad}</span>
                  <span className="text-[#0a0a0a] shrink-0 tabular-nums">$ {fmt(it.precio * it.cantidad)}</span>
                </div>
              ))}
            </div>

            <div className="mb-4 text-sm text-[#0a0a0a]/60 font-light space-y-0.5">
              <p className="m-0">Compró: {fechaYHora(p.creado_en)}</p>
              {Number(p.costo_envio) > 0 && <p className="m-0">Incluye envío: $ {fmt(p.costo_envio)}</p>}
              {entregado && p.entregado_at && <p className="m-0" style={{ color: VERDE }}>Entregado el {fechaYHora(p.entregado_at)}</p>}
            </div>

            <div className="mb-4">
              <Etiqueta>Entrega</Etiqueta>
              {p.datos_de_contacto === 'ocultos' ? (
                // Sin pagar: la ruta ni siquiera manda nombre, teléfono ni dirección.
                <p className="m-0 text-sm text-[#0a0a0a]/40 font-light leading-relaxed">{textoDatosOcultos()}</p>
              ) : p.comprador_eliminado ? (
                // Cuenta eliminada: el método de entrega queda a la vista; el nombre,
                // el teléfono y la dirección ya no existen.
                <p className="m-0 text-sm text-[#0a0a0a]/40 font-light">Quien hizo esta compra eliminó su cuenta.</p>
              ) : (
                <>
                  {(p.comprador_nombre || p.comprador_apellido || p.comprador_telefono) && (
                    <p className="m-0 text-sm text-[#0a0a0a]/60 font-light">
                      {[p.comprador_nombre, p.comprador_apellido].filter(Boolean).join(' ')}
                      {(p.comprador_nombre || p.comprador_apellido) && p.comprador_telefono && <br />}
                      {p.comprador_telefono && <>Tel. {p.comprador_telefono}</>}
                    </p>
                  )}
                  {/* Envío: dirección y barrio. Correo: el destino completo. */}
                  {direccion && (forma === 'envio' || forma === 'correo') && (
                    <p className="mt-1 mb-0 text-sm text-[#0a0a0a]/60 font-light">
                      {calleNumeroDepto(direccion)}
                      {forma === 'envio' && p.barrio_nombre && <><br />{p.barrio_nombre}</>}
                      {forma === 'correo' && ciudadProvinciaCodigo(direccion) && <><br />{ciudadProvinciaCodigo(direccion)}</>}
                    </p>
                  )}
                </>
              )}
              {forma === 'envio' && p.turno_preferido && (
                <p className="mt-1 mb-0 text-[11px] text-[#0a0a0a]/30 font-light">Preferencia: {p.turno_preferido.toLowerCase()}</p>
              )}
              {forma === 'envio' && p.franja_horaria && (
                <p className="m-0 text-[11px] text-[#0a0a0a]/40 font-light">Franja avisada: {p.franja_horaria.toLowerCase()}</p>
              )}
              {seguimiento && (
                <p className="mt-1 mb-0 text-sm text-[#0a0a0a]/60 font-light">
                  {seguimiento.empresa} · N° {seguimiento.numero}
                  {forma === 'correo' && (
                    <button type="button" onClick={onCorregirSeguimiento}
                      className="ml-2 text-[11px] text-[#0a0a0a]/40 underline underline-offset-2 cursor-pointer bg-transparent border-none p-0">
                      Corregir
                    </button>
                  )}
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-[#0a0a0a]/5 mb-5">
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-[#0a0a0a]/40 font-light">Productos</span>
                <span className="text-[#0a0a0a] tabular-nums">$ {fmt(p.subtotal_productos)}</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-[#0a0a0a]/40 font-light">Envío</span>
                <span className="text-[#0a0a0a] tabular-nums">$ {fmt(p.costo_envio)}</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-[#0a0a0a]/25 font-light">Comisión Bahía Shops (5%)</span>
                <span className="text-[#0a0a0a]/25 tabular-nums">-$ {fmt(p.comision_plataforma)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-[#0a0a0a] pt-2 border-t border-[#0a0a0a]/5 mt-1">
                <span>Recibís</span>
                <span className="tabular-nums">$ {fmt(p.total - (p.comision_plataforma || 0))}</span>
              </div>
            </div>

            <div className="mb-4">
              <BarraPasos pasos={pasosDe(p)} estado={p.estado} />
            </div>

            {!entregado && diasSinMarcar !== null && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 font-light leading-relaxed">
                Este pedido se pagó hace {diasSinMarcar} días y todavía no figura como entregado. Si ya lo entregaste, marcalo.
                {' '}Desde el día 14, {apodoDe(p)} ya puede dejarte una reseña.
              </div>
            )}

            {entregado ? (
              <p className="m-0 text-sm font-medium" style={{ color: VERDE }}>
                ✓ Entregado · {apodoDe(p, { alEmpezar: true })} ya puede dejarte una reseña
              </p>
            ) : accion && !confirmando ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button type="button" onClick={onAvanzar} disabled={avanzando}
                  className="px-5 py-2.5 text-sm border-none rounded-full text-white font-medium transition-opacity cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-85"
                  style={{ backgroundColor: accion.verde ? VERDE : '#0a0a0a' }}>
                  {avanzando ? 'Actualizando...' : accion.label}
                </button>
                <span className="text-[12px] text-[#0a0a0a]/45 font-light">{accion.ayuda(p)}</span>
              </div>
            ) : null}

            {/* La confirmación de "Marcar como entregado", dentro de la tarjeta. */}
            {confirmando && accion?.destino === ESTADO_ENTREGADO && (
              <div role="group" aria-labelledby={`confirmar-${p.id}`} className="border border-[#0a0a0a]/10 rounded-xl p-4">
                <p id={`confirmar-${p.id}`} className="m-0 mb-1 text-sm text-[#0a0a0a] font-semibold">
                  ¿{apodoDe(p, { alEmpezar: true })} ya lo tiene?
                </p>
                <p className="m-0 mb-4 text-sm text-[#0a0a0a]/60 font-light leading-relaxed">
                  Al marcarlo como entregado, el pedido pasa a «Entregados» y {apodoDe(p)} puede dejarte una reseña.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <button type="button" onClick={onConfirmarEntrega} disabled={avanzando}
                    className="px-5 py-2.5 text-sm border-none rounded-full text-white font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-85"
                    style={{ backgroundColor: VERDE }}>
                    {avanzando ? 'Guardando...' : 'Sí, ya lo entregué'}
                  </button>
                  <button type="button" onClick={onCancelarEntrega} disabled={avanzando}
                    className="text-sm text-[#0a0a0a]/45 font-light bg-transparent border-none p-0 cursor-pointer hover:text-[#0a0a0a]/70 underline underline-offset-2">
                    Todavía no
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
