'use client'

// La suscripción al plan dentro de «Tu plan» (Mi negocio), migración 048.
// Sigue el mockup de F3.2 (mockup-tanda-f3-2.html, «Mi negocio · Tu plan»):
// todos los estados viven acá, debajo de los tres números. Va por
// /api/vendedor/suscripcion. Qué se muestra lo decide estadoParaPantalla
// (src/lib/suscripciones.js):
//
//   gratis       la franja de lo que trae el Básico y «Pasarme al Básico»
//   esperando    «…está esperando el pago» · Seguir con el pago · Cancelar
//   confirmando  «Estamos confirmando tu pago…» (consulta cada 5 segundos,
//                dos minutos como mucho)
//   sin_pagar    «No se completó el pago» · Volver a intentar
//   listo        «¡Listo! Ya tenés el plan Básico» (una sola vez: marca en
//                localStorage; sin marca posible, mientras el primer cobro
//                tenga menos de 48 horas)
//   al_dia       el monto, el próximo cobro y cómo darse de baja (hasta F4)
//   medida       el plan a medida sin pagar · Suscribirme por $X por mes
//   diferencia   el plan a medida y ya paga el Básico · Pagar $X
//   cancelada    cancelada con días pagos (la pantalla completa llega en F4)
//
// Con ?suscribirme=basico (desde /vender) abre el modal del alta apenas carga.
//   plan      lo de /api/vendedor/plan (para los textos del «¡Listo!»)
//   franja    la franja «Con el Básico: …» de TuPlan, que va solo en el Gratis
//   onCambio  para que la página vuelva a leer el plan cuando cambia

import { useCallback, useEffect, useRef, useState } from 'react'
import { textoPrecio } from '@/lib/planes'
import { estadoParaPantalla } from '@/lib/suscripciones'
import ModalSuscripcion, { BOTON_VERDE, Ruedita } from '@/components/ModalSuscripcion'

const ROJO = '#cc152b'
const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
const fecha = (iso) => (iso ? FECHA.format(new Date(iso)) : '')

const RECUADRO = { borderRadius: '10px', padding: '12px 14px', fontSize: '13px', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: '4px' }
const COLORES = {
  ambar: { backgroundColor: '#fff7e0', color: '#6b4e08' },
  verde: { backgroundColor: '#e6f2ee', color: '#014236' },
  celeste: { backgroundColor: '#eef3f8', color: '#24425f' },
  gris: { backgroundColor: '#f6f5f2', color: 'rgba(10,10,10,0.7)' },
}
const LINK = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontSize: '13px', color: 'rgba(10,10,10,0.5)', textDecoration: 'underline', textUnderlineOffset: '2px' }
const SUBLINEA = { fontSize: '12.5px', fontWeight: 300, lineHeight: 1.5, color: 'rgba(10,10,10,0.5)' }

const CONSULTAR_CADA_MS = 5000
const CONSULTAR_DURANTE_MS = 2 * 60 * 1000
const MARCA_LISTO = 'bs-listo-'

function Recuadro({ color, titulo, children }) {
  return (
    <div style={{ ...RECUADRO, ...COLORES[color] }}>
      <b style={{ fontWeight: 600 }}>{titulo}</b>
      {children && <span>{children}</span>}
    </div>
  )
}

function Acciones({ children }) {
  return <div className="flex flex-wrap items-center" style={{ gap: '14px' }}>{children}</div>
}

// La marca de «ya vio el ¡Listo!» de una suscripción. Sin localStorage
// (ventana privada, datos bloqueados): false, y se ve mientras dure el plazo.
function leerMarca(id) {
  try { return window.localStorage.getItem(MARCA_LISTO + id) === '1' } catch { return false }
}
function guardarMarca(id) {
  try { window.localStorage.setItem(MARCA_LISTO + id, '1') } catch { /* sin marca */ }
}

// «50 productos», «productos sin tope» o null.
function cuantosProductos(trae) {
  if (trae?.sinTope) return 'productos sin tope'
  return trae?.tope ? `${trae.tope} productos` : null
}

// ¿Llegó de Mercado Pago o de /vender? Se lee una vez, al montar.
function leerVuelta() {
  if (typeof window === 'undefined') return { volvio: false, suscribirme: false }
  const params = new URLSearchParams(window.location.search)
  return {
    volvio: params.get('suscripcion') === 'volvio' || params.get('diferencia') === 'volvio',
    suscribirme: params.get('suscribirme') === 'basico',
  }
}

// { datos } o { error }. Nunca lanza.
async function leerSuscripcion() {
  try {
    const res = await fetch('/api/vendedor/suscripcion', { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    return res.ok ? { datos: d } : { error: d.error || 'No pudimos cargar tu suscripción.' }
  } catch {
    return { error: 'No pudimos cargar tu suscripción.' }
  }
}

export default function SuscripcionPlan({ plan, franja, onCambio }) {
  const [vuelta] = useState(leerVuelta)
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [modal, setModal] = useState(false)
  const [consultaAgotada, setConsultaAgotada] = useState(false)
  // Si el navegador ya había mostrado el «¡Listo!» de cada suscripción, leído
  // la primera vez que llega: así se ve entero en esta visita.
  const [vistoAntes, setVistoAntes] = useState({})
  const ultimaFirma = useRef('')
  // Desde /vender (?suscribirme=basico) el modal arranca abierto, si corresponde.
  const [cerroElDeVender, setCerroElDeVender] = useState(false)

  const aplicar = useCallback((leido) => {
    if (leido.error) { setErrorCarga(leido.error); return }
    const d = leido.datos
    setErrorCarga('')
    setDatos(d)
    const id = d.suscripcion?.id
    if (id) setVistoAntes((v) => (id in v ? v : { ...v, [id]: leerMarca(id) }))
    // Si cambió el estado o la acción, el plan también puede haber cambiado.
    // planCambio: la ruta acaba de traer (o devolver) un cobro, aunque sea la
    // primera lectura (la página leyó el plan antes).
    const firma = JSON.stringify([d.suscripcion?.estado, d.suscripcion?.pagadoHasta, d.accion?.tipo, d.accion?.monto])
    if (d.planCambio || (ultimaFirma.current && firma !== ultimaFirma.current)) onCambio?.()
    ultimaFirma.current = firma
  }, [onCambio])
  const cargar = useCallback(async () => aplicar(await leerSuscripcion()), [aplicar])

  // Saca de la dirección lo que vino de Mercado Pago o de /vender, para que
  // recargar la página no lo repita.
  useEffect(() => {
    if (!vuelta.volvio && !vuelta.suscribirme) return
    const params = new URLSearchParams(window.location.search)
    for (const p of ['suscripcion', 'diferencia', 'suscribirme']) params.delete(p)
    const resto = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (resto ? `?${resto}` : '') + window.location.hash)
  }, [vuelta])

  useEffect(() => {
    let vigente = true
    leerSuscripcion().then((leido) => { if (vigente) aplicar(leido) })
    return () => { vigente = false }
  }, [aplicar])

  const estado = datos?.habilitada
    ? estadoParaPantalla({
        suscripcion: datos.suscripcion,
        accion: datos.accion,
        volvio: vuelta.volvio,
        consultaAgotada,
        listoVisto: !!vistoAntes[datos.suscripcion?.id],
      })
    : null
  const tipo = estado?.tipo

  // Confirmando: consultar cada 5 segundos, dos minutos como mucho.
  useEffect(() => {
    if (tipo !== 'confirmando') return undefined
    const inicio = Date.now()
    let reloj = null
    let vivo = true
    async function consultar() {
      if (!vivo) return
      if (Date.now() - inicio > CONSULTAR_DURANTE_MS) { setConsultaAgotada(true); return }
      await cargar()
      if (vivo) reloj = setTimeout(consultar, CONSULTAR_CADA_MS)
    }
    reloj = setTimeout(consultar, CONSULTAR_CADA_MS)
    return () => { vivo = false; clearTimeout(reloj) }
  }, [tipo, cargar])

  // El «¡Listo!» se ve una sola vez: queda la marca.
  const idSuscripcion = datos?.suscripcion?.id
  useEffect(() => {
    if (tipo === 'listo' && idSuscripcion) guardarMarca(idSuscripcion)
  }, [tipo, idSuscripcion])


  async function pedir(metodo, cuerpo) {
    setOcupado(true)
    setErrorAccion('')
    try {
      const res = await fetch('/api/vendedor/suscripcion', {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErrorAccion(d.error || 'No pudimos hacerlo. Probá de nuevo en un rato.'); return null }
      return d
    } catch {
      setErrorAccion('No pudimos hacerlo. Probá de nuevo en un rato.')
      return null
    } finally {
      setOcupado(false)
    }
  }

  async function pagarDiferencia() {
    const d = await pedir('POST', { accion: 'diferencia' })
    if (d?.initPoint) { setOcupado(true); window.location.href = d.initPoint }
    else if (d?.activada) { await cargar(); onCambio?.() }
  }

  async function cancelarPendiente() {
    const d = await pedir('DELETE')
    if (d?.ok) await cargar()
  }

  async function reintentar() {
    setErrorCarga('')
    await cargar()
  }

  const avisoError = errorAccion && <p className="m-0" role="alert" style={{ fontSize: '12.5px', color: ROJO }}>{errorAccion}</p>

  // Cargando o sin poder cargar: la franja del Gratis (si va) y una línea.
  if (!datos) {
    return (
      <>
        {franja}
        {errorCarga ? (
          <p className="m-0" style={{ ...SUBLINEA, color: ROJO }}>
            {errorCarga}{' '}
            <button type="button" onClick={reintentar} style={{ ...LINK, fontSize: '12.5px', color: ROJO }}>Probar de nuevo</button>
          </p>
        ) : (
          <p className="m-0 flex items-center" style={{ ...SUBLINEA, gap: '8px' }}><Ruedita /> Cargando tu suscripción…</p>
        )}
      </>
    )
  }
  if (!datos.habilitada) return franja || null

  const sus = datos.suscripcion
  const accion = datos.accion
  const nombre = plan?.plan?.nombre || 'Básico'
  const conQue = plan?.especial ? 'tu plan a medida' : `el ${nombre}`
  const abierto = modal || (vuelta.suscribirme && !cerroElDeVender && accion?.tipo === 'suscribirse')
  const modalAlta = <ModalSuscripcion abierto={abierto} onClose={() => { setModal(false); setCerroElDeVender(true) }} datos={datos} />

  if (tipo === 'gratis') {
    return (
      <>
        {franja}
        <Acciones>
          <button type="button" onClick={() => setModal(true)} style={BOTON_VERDE}>Pasarme al {accion.nombre || 'Básico'}</button>
        </Acciones>
        {estado.pendienteVieja && (
          <span style={SUBLINEA}>La suscripción de {textoPrecio(sus.monto)} que esperaba el pago se cancela al suscribirte.</span>
        )}
        {modalAlta}
      </>
    )
  }

  if (tipo === 'esperando') {
    return (
      <>
        <Recuadro color="ambar" titulo={`Tu suscripción al ${accion.nombre || nombre} está esperando el pago.`}>
          Seguís en el plan {plan?.plan?.nombre || 'Gratis'} hasta que Mercado Pago confirme el primer cobro.
        </Recuadro>
        <Acciones>
          <a href={sus.initPoint} style={BOTON_VERDE}>Seguir con el pago</a>
          <button type="button" onClick={cancelarPendiente} disabled={ocupado} style={LINK}>{ocupado ? 'Cancelando…' : 'Cancelar'}</button>
        </Acciones>
        {avisoError}
      </>
    )
  }

  if (tipo === 'confirmando') {
    return (
      <div role="status" style={{ ...RECUADRO, ...COLORES.celeste }}>
        <span className="flex items-center" style={{ gap: '8px' }}><Ruedita /><b style={{ fontWeight: 600 }}>Estamos confirmando tu pago con Mercado Pago…</b></span>
        <span>Puede tardar unos minutos. Tu plan cambia apenas se confirme.</span>
      </div>
    )
  }

  if (tipo === 'sin_pagar') {
    return (
      <>
        <Recuadro color="gris" titulo="No se completó el pago.">Seguís en el plan {plan?.plan?.nombre || 'Gratis'}.</Recuadro>
        <Acciones>
          <button type="button" onClick={() => setModal(true)} style={BOTON_VERDE}>Volver a intentar</button>
        </Acciones>
        {modalAlta}
      </>
    )
  }

  if (tipo === 'medida') {
    const cuanto = cuantosProductos(accion.trae)
    return (
      <>
        <Recuadro color="verde" titulo={cuanto
          ? `Te armamos un plan a medida: ${cuanto} por ${textoPrecio(accion.monto)} por mes.`
          : `Te armamos un plan a medida por ${textoPrecio(accion.monto)} por mes.`}>
          Se activa cuando Mercado Pago confirme el primer pago.
        </Recuadro>
        <Acciones>
          <button type="button" onClick={() => setModal(true)} style={BOTON_VERDE}>Suscribirme por {textoPrecio(accion.monto)} por mes</button>
        </Acciones>
        {estado.pendienteVieja && (
          <span style={SUBLINEA}>La suscripción de {textoPrecio(sus.monto)} que esperaba el pago se cancela al suscribirte.</span>
        )}
        {modalAlta}
      </>
    )
  }

  if (tipo === 'diferencia') {
    const cuanto = cuantosProductos(accion.trae)
    const desde = accion.proximoCobro ? ` Desde el próximo cobro (${fecha(accion.proximoCobro)}), Mercado Pago te cobra ${textoPrecio(accion.precioNuevo)}.` : ''
    const sinMonto = !Number.isInteger(accion.monto)
    return (
      <>
        <Recuadro color="verde" titulo={cuanto
          ? `Te armamos un plan a medida: ${cuanto} por ${textoPrecio(accion.precioNuevo)} por mes.`
          : `Te armamos un plan a medida por ${textoPrecio(accion.precioNuevo)} por mes.`}>
          {accion.sinCobro
            ? <>La diferencia de lo que queda de este mes es mínima: lo activamos sin cobrarte nada.{desde}</>
            : sinMonto
              ? <>Para activarlo hoy, pagás la diferencia de lo que queda de este mes.{desde}</>
              : <>Para activarlo hoy, pagás la diferencia de lo que queda de este mes: <b style={{ fontWeight: 600 }}>{textoPrecio(accion.monto)}</b>.{desde}</>}
        </Recuadro>
        <Acciones>
          <button type="button" onClick={pagarDiferencia} disabled={ocupado || (sinMonto && !accion.sinCobro)}
            style={{ ...BOTON_VERDE, opacity: ocupado ? 0.55 : 1, cursor: ocupado ? 'default' : 'pointer' }}>
            {ocupado ? <><Ruedita />Abriendo Mercado Pago…</> : accion.sinCobro ? 'Activar mi plan a medida' : sinMonto ? 'Pagar la diferencia' : `Pagar ${textoPrecio(accion.monto)}`}
          </button>
        </Acciones>
        {avisoError}
      </>
    )
  }

  if (tipo === 'listo') {
    const trae = [
      plan?.sinTope ? 'productos sin tope' : plan?.tope ? `hasta ${plan.tope} productos` : null,
    ].filter(Boolean)[0]
    const fotos = plan?.fotosPorProducto ? ` con ${plan.fotosPorProducto} fotos cada uno` : ''
    const carritos = plan?.carritos ? ', y ver tus carritos abandonados en Pedidos' : ''
    return (
      <>
        <Recuadro color="verde" titulo={plan?.especial ? '¡Listo! Ya tenés tu plan a medida.' : `¡Listo! Ya tenés el plan ${nombre}.`}>
          {trae ? `Ya podés cargar ${trae}${fotos}${carritos}.` : null}
        </Recuadro>
        {sus?.proximoCobro && <p className="m-0" style={SUBLINEA}>Próximo cobro el {fecha(sus.proximoCobro)} · {textoPrecio(sus.monto)}</p>}
      </>
    )
  }

  if (tipo === 'al_dia') {
    const hasta = sus.pagadoHasta || sus.proximoCobro
    return (
      <p className="m-0" style={SUBLINEA}>
        Tu suscripción: {textoPrecio(sus.monto)} por mes{sus.proximoCobro ? ` · próximo cobro el ${fecha(sus.proximoCobro)}` : ''}.
        {' '}Para darte de baja, cancelala desde tu cuenta de Mercado Pago{hasta ? `: seguís con ${conQue} hasta el ${fecha(hasta)}` : ''}.
      </p>
    )
  }

  if (tipo === 'cancelada') {
    return (
      <p className="m-0" style={SUBLINEA}>
        Tu suscripción está cancelada: no se te cobra más. Seguís con {conQue} hasta el {fecha(sus.pagadoHasta)}.
      </p>
    )
  }

  return null
}

