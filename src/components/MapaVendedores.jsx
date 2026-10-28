'use client'

// El mapa público de vendedores: el de la home (MapaDestacado) y el de /mapa.
//
// Motor MapLibre con el fondo vectorial de OpenFreeMap. El estilo (las dos
// pieles, Claro y Oscuro) está en src/lib/mapaEstilo.js y sale de
// docs/mapa-mockup.html. La piel la elige quien mira y la guarda el padre
// (usePielMapa), porque la leyenda está fuera del mapa.
//
// Quien eligió mostrar su dirección exacta aparece con la casita, con la
// punta de la cola en su punto. Quien no, solo con el aro de su zona
// alrededor del punto redondeado (migración 018): nunca con un pin. El aro
// responde al mouse y al toque en todo el círculo, no solo sobre la línea. Las
// tiendas que caen en la misma celda de la grilla comparten un solo aro,
// con todas en la ventanita; correrlas un poco para separarlas sería inventar
// ubicaciones.
//
// Los nombres de barrio son texto HTML encima del mapa (para usar Inter): se
// ubican con centro() y partir() del mockup y, si dos se pisan, gana el
// barrio más grande. Antes se reserva el lugar de los nombres de localidad
// del fondo («Bahía Blanca»), que ganan siempre.
//
// Si no cargan los barrios, el mapa se ve sin nombres; si no hay tiendas, sin
// pines. Se importa siempre con dynamic(..., { ssr: false }): MapLibre
// necesita window al cargarse.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import maplibregl from 'maplibre-gl'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { textoPuntajeTarjeta } from '@/lib/resenas'
import {
  PIELES, PIEL_INICIAL, CASA, CASA_VIEWBOX, CENTRO_MAPA, TAMANO_LOCALIDAD, ESPACIADO_LOCALIDAD,
  buildStyle, centro, partir,
} from '@/lib/mapaEstilo'
import 'maplibre-gl/dist/maplibre-gl.css'

const DEMORA_CIERRE_MS = 150
// La vista con que arranca el mapa (la del mockup).
const VISTA_INICIAL = { center: CENTRO_MAPA, zoom: 13.4 }
const ZOOM_NOMBRES = 12.5
// La ventanita de un pin sale del techo de la casita (29 x 42,4 px, anclada
// abajo a la izquierda); la de una zona, del centro del círculo. Va arriba
// salvo que no entre: cerca del borde MapLibre la pone abajo o al costado
// (el mapa no se mueve al abrirla), con la cola en el borde de la casita.
const OFFSET_PIN = {
  bottom: [14, -44], 'bottom-left': [14, -44], 'bottom-right': [14, -44],
  top: [14, 0], 'top-left': [14, 0], 'top-right': [14, 0],
  left: [29, -21], right: [0, -21], center: [14, -21],
}
const OFFSET_ZONA = [0, 0]
// Lo que muestra el mapa con cooperativeGestures cuando alguien intenta
// hacer zoom o moverlo sin la tecla o sin los dos dedos. MapLibre usa ⌘ en Mac.
const MENSAJES_GESTOS = {
  'CooperativeGesturesHandler.WindowsHelpText': 'Usá Ctrl + rueda para acercar',
  'CooperativeGesturesHandler.MacHelpText': 'Usá ⌘ + rueda para acercar',
  'CooperativeGesturesHandler.MobileHelpText': 'Usá dos dedos para mover el mapa',
}

// Lo que tarda el aro de una zona en crecer o volver, como las casitas.
const DURACION_ARO_MS = 150

function iniciales(nombre) {
  if (!nombre) return ''
  const palabras = nombre.trim().split(/\s+/)
  return palabras.slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

function FichaTienda({ v, nombreBarrio, zona = false, compacta = false }) {
  const lado = compacta ? '32px' : '40px'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        {v.logo_url ? (
          <img src={v.logo_url} alt="" style={{ width: lado, height: lado, borderRadius: '8px', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: lado, height: lado, borderRadius: '8px', background: '#4164fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{iniciales(v.nombre_negocio)}</span>
          </div>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#0a0a0a' }}>{v.nombre_negocio}</div>
          {/* "{barrio} · 4,6 ★ (32)" o "{barrio} · Tienda nueva" (puntaje: migración 037),
              y "· Zona aproximada" si no muestra su dirección */}
          <div style={{ fontSize: '11px', fontWeight: 500, color: '#4164fe', marginTop: '1px' }}>
            {nombreBarrio ? `${nombreBarrio} · ` : ''}{textoPuntajeTarjeta(v.puntaje)}{zona ? ' · Zona aproximada' : ''}
          </div>
        </div>
      </div>
      {!compacta && v.descripcion_corta && (
        <p style={{ fontSize: '12px', color: 'rgba(10,10,10,0.5)', margin: '0 0 10px', lineHeight: '1.4' }}>
          {v.descripcion_corta}
        </p>
      )}
      <Link
        href={`/tienda/${v.slug}`}
        style={{
          display: 'inline-block', color: '#4164fe',
          fontSize: '12px', fontWeight: 600, textDecoration: 'none',
        }}
      >
        Ver tienda →
      </Link>
    </div>
  )
}

function ContenidoPopup({ tiendas, zona, barriosMap }) {
  const nombreBarrio = (v) => (v.barrio_id ? barriosMap[v.barrio_id] : null)
  return (
    <div style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif", minWidth: '180px' }}>
      {tiendas.length === 1 ? (
        <FichaTienda v={tiendas[0]} nombreBarrio={nombreBarrio(tiendas[0])} zona={zona} />
      ) : (
        <>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(10,10,10,0.45)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {tiendas.length} tiendas en esta zona
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '260px', overflowY: 'auto' }}>
            {tiendas.map((v) => (
              <FichaTienda key={v.id} v={v} nombreBarrio={nombreBarrio(v)} zona={zona} compacta />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// MapLibre dibuja con WebGL: sin él, el mapa no puede arrancar.
function soportaWebGL() {
  try {
    const lienzoPrueba = document.createElement('canvas')
    const gl = lienzoPrueba.getContext('webgl2') || lienzoPrueba.getContext('webgl')
    // Se suelta enseguida: el navegador permite pocos contextos a la vez.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

function svgCasa(color) {
  return `<svg viewBox="${CASA_VIEWBOX}" aria-hidden="true"><path d="${CASA}" fill="${color}"/></svg>`
}

// El borde de los nombres de barrio: una sombra en ocho direcciones.
function haloNombres(color) {
  return [[-1, -1], [0, -1.4], [1, -1], [1.4, 0], [1, 1], [0, 1.4], [-1, 1], [-1.4, 0]]
    .map(([x, y]) => `${x}px ${y}px 0 ${color}`).join(',')
}

// 11 px en zoom 12 a 14 px en zoom 16.
const TAMANO_NOMBRES_MIN = 11
function tamanoNombres(zoom) {
  return TAMANO_NOMBRES_MIN + Math.max(0, Math.min(1, (zoom - 12) / 4)) * 3
}

// Lo que ocupa en pantalla el nombre de una localidad del fondo. El motor no
// lo informa: se calcula con la misma letra (Noto Sans Bold, en mayúsculas)
// y el mismo espaciado que la capa place-label.
let lienzo = null
function anchoLocalidad(texto, tamano) {
  lienzo = lienzo || document.createElement('canvas').getContext('2d')
  lienzo.font = `700 ${tamano}px "Noto Sans", Arial, sans-serif`
  return lienzo.measureText(texto.toUpperCase()).width + texto.length * ESPACIADO_LOCALIDAD * tamano
}

function reservasLocalidades(mapa) {
  // Mientras carga el estilo la capa puede existir antes que su fuente.
  if (!mapa.getLayer('place-label') || !mapa.getSource('omt')) return []
  let rasgos
  try {
    rasgos = mapa.queryRenderedFeatures({ layers: ['place-label'] })
  } catch {
    return []
  }
  return rasgos.map((f) => {
    const p = mapa.project(f.geometry.coordinates)
    const texto = f.properties['name:es'] || f.properties.name || ''
    const tamano = TAMANO_LOCALIDAD[f.properties.class] || TAMANO_LOCALIDAD.village
    const w = anchoLocalidad(texto, tamano) / 2 + 6
    const h = tamano * 0.7 + 4
    return [p.x - w, p.y - h, p.x + w, p.y + h]
  })
}

// cooperativo: la página se scrollea pasando por encima del mapa y el zoom va
// con Ctrl (⌘ en Mac) + rueda o con dos dedos. Lo usa la home; se lee al
// montar el mapa. vista: { center, zoom } con que arranca (la home usa una
// más alejada); también se lee al montar.
export default function MapaVendedores({ vendedores = [], piel = PIEL_INICIAL, onCambiarPiel, cooperativo = false, vista = VISTA_INICIAL }) {
  const supabase = createClient()
  const contenedorRef = useRef(null)
  const mapaRef = useRef(null)
  const [barrios, setBarrios] = useState([])
  const [barriosMap, setBarriosMap] = useState({})
  const [nombresPrendidos, setNombresPrendidos] = useState(true)
  const [errorFondo, setErrorFondo] = useState(() => !soportaWebGL())
  // La ventanita abierta: { tiendas, zona }. Su contenido se dibuja con React
  // (createPortal) adentro del nodo que MapLibre pone en el popup.
  const [abierto, setAbierto] = useState(null)
  const [nodoPopup] = useState(() => document.createElement('div'))

  // Lo que leen los manejadores de MapLibre, que se registran una sola vez.
  const pielRef = useRef(piel)
  const pielAplicada = useRef(null)
  const nombresRef = useRef(nombresPrendidos)
  const zonasRef = useRef(new Map())
  const zonasGeoRef = useRef(null)
  const etiquetasRef = useRef([])
  const tamanoRef = useRef(null)
  const accionesRef = useRef(null)

  const { exactas, zonas } = useMemo(() => {
    const conPunto = vendedores.filter((v) => v.latitud && v.longitud)
    // Una entrada por celda: los puntos de la zona ya vienen redondeados, así
    // que dos tiendas de la misma celda tienen exactamente el mismo punto.
    const porCelda = new Map()
    for (const v of conPunto.filter((v) => !v.direccion_visible)) {
      const celda = `${v.latitud},${v.longitud}`
      if (!porCelda.has(celda)) porCelda.set(celda, [])
      porCelda.get(celda).push(v)
    }
    return { exactas: conPunto.filter((v) => v.direccion_visible), zonas: porCelda }
  }, [vendedores])

  const zonasGeo = useMemo(() => ({
    type: 'FeatureCollection',
    features: [...zonas].map(([celda, tiendas], i) => ({
      type: 'Feature',
      // Para feature-state (el aro que crece al pasar el mouse).
      id: i,
      properties: { celda },
      geometry: { type: 'Point', coordinates: [Number(tiendas[0].longitud), Number(tiendas[0].latitud)] },
    })),
  }), [zonas])

  // Antes que el montaje del mapa, que arranca con estas zonas.
  useEffect(() => {
    zonasRef.current = zonas
    zonasGeoRef.current = zonasGeo
    mapaRef.current?.getSource('zonas')?.setData(zonasGeo)
  }, [zonas, zonasGeo])

  // ── Montaje del mapa, la ventanita y los manejadores (una sola vez) ──
  useEffect(() => {
    if (errorFondo) return
    let mapa
    try {
      mapa = new maplibregl.Map({
        container: contenedorRef.current,
        style: buildStyle(pielRef.current, zonasGeoRef.current),
        center: vista.center, zoom: vista.zoom, minZoom: 10, maxZoom: 18,
        // La atribución va plegada en el botón (i) de abajo a la derecha:
        // tocándolo se despliega.
        attributionControl: { compact: true },
        // Sin brújula no hay cómo volver a enderezarlo: no se gira ni se inclina.
        dragRotate: false, pitchWithRotate: false, touchPitch: false,
        cooperativeGestures: cooperativo,
        locale: MENSAJES_GESTOS,
      })
    } catch (e) {
      // Queda el fondo con el color de tierra, sin mapa.
      console.error('Mapa: no se pudo iniciar', e)
      return
    }
    mapaRef.current = mapa
    pielAplicada.current = pielRef.current
    mapa.touchZoomRotate.disableRotation()
    mapa.keyboard.disableRotation()
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    // MapLibre arranca con la atribución desplegada y la pliega recién cuando
    // alguien arrastra el mapa: se pliega una vez, al terminar de cargar.
    mapa.once('idle', () => {
      mapa.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    })
    // Con un manejador propio MapLibre ya no los escribe en la consola.
    mapa.on('error', (e) => {
      console.error('Mapa:', e.error?.message || e.error || e)
      if (!mapa.loaded() && /fetch|network|failed/i.test(String(e.error?.message || e.error || ''))) setErrorFondo(true)
    })

    // La ventanita: se abre al pasar el mouse y se queda abierta mientras el
    // mouse esté sobre ella, quieta. Con clic o toque, además, el mapa se
    // desliza hasta dejar la tienda (o la zona) centrada con la ventanita
    // entera, y queda fija: no se cierra al sacar el mouse, sino con la cruz,
    // tocando otro lugar del mapa o abriendo otra. Sirve igual para un pin que
    // para un círculo.
    const popup = new maplibregl.Popup({
      className: 'mapa-popup', maxWidth: '300px',
      focusAfterOpen: false, closeOnClick: false,
    }).setDOMContent(nodoPopup)
    let cierre = null
    let claveAbierta = null
    let fija = false
    let pinActivo = null

    function marcarPin(el) {
      pinActivo?.classList.remove('on')
      pinActivo = el
      el?.classList.add('on')
    }

    // El aro de una zona crece mientras el mouse está encima o su ventanita
    // está abierta (en el celular, mientras está abierta). feature-state "g"
    // va de 0 a 1 en DURACION_ARO_MS, paso a paso: MapLibre no anima los
    // cambios de feature-state.
    const aros = new Map() // id -> { g, objetivo }
    let aroEncima = null
    let aroAbierto = null
    let cuadroAro = 0
    let ultimoCuadroAro = 0
    function actualizarAros() {
      for (const id of [aroEncima, aroAbierto]) {
        if (id !== null && !aros.has(id)) aros.set(id, { g: 0 })
      }
      aros.forEach((a, id) => { a.objetivo = id === aroEncima || id === aroAbierto ? 1 : 0 })
      if (!cuadroAro) {
        ultimoCuadroAro = performance.now()
        cuadroAro = requestAnimationFrame(pasoAros)
      }
    }
    function pasoAros(ahora) {
      cuadroAro = 0
      const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const paso = reducir ? 1 : Math.max(0, ahora - ultimoCuadroAro) / DURACION_ARO_MS
      ultimoCuadroAro = ahora
      let siguen = false
      aros.forEach((a, id) => {
        const g = a.objetivo > a.g ? Math.min(a.objetivo, a.g + paso) : Math.max(a.objetivo, a.g - paso)
        if (g !== a.g) {
          a.g = g
          // Ease-out, como la transición de las casitas.
          if (mapa.getSource('zonas')) mapa.setFeatureState({ source: 'zonas', id }, { g: 1 - (1 - g) ** 2 })
        }
        if (a.g !== a.objetivo) siguen = true
        else if (a.g === 0) aros.delete(id)
      })
      if (siguen) cuadroAro = requestAnimationFrame(pasoAros)
    }

    function cancelarCierre() { clearTimeout(cierre) }
    function cerrar() { cancelarCierre(); popup.remove() }
    function cerrarConDemora() {
      cancelarCierre()
      if (!fija) cierre = setTimeout(cerrar, DEMORA_CIERRE_MS)
    }
    // Desliza el mapa hasta que la tienda y su ventanita, juntas, queden en
    // el centro. Con "reducir movimiento" en el sistema, salta directo.
    function centrar(lngLat, zona) {
      const altoVentana = popup.getElement()?.offsetHeight || 0
      // Lo que hay debajo de la ventanita: la cola y, en un pin, la casita.
      const debajo = zona ? 10 : 54
      const altoMapa = mapa.getContainer().clientHeight
      const dy = Math.min((altoVentana + debajo) / 2, altoMapa / 2 - 12)
      const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      // offset: dónde queda el punto respecto del centro. La ventanita de un
      // pin sale 14 px a la derecha de la punta.
      mapa.easeTo({ center: lngLat, offset: [zona ? 0 : -14, dy], duration: reducir ? 0 : 500 })
    }
    // conClic: viene de un clic o un toque, no de pasar el mouse.
    // aro: el id de la zona, si la ventanita es de una zona.
    function abrir({ clave, tiendas, zona, lngLat, offset, pin = null, aro = null, conClic = false }) {
      // Mientras el mapa se desliza, otros pines pasan por debajo del mouse
      // quieto: eso no cuenta como pasar el mouse.
      if (!conClic && mapa.isEasing()) return
      cancelarCierre()
      if (claveAbierta !== clave) {
        claveAbierta = clave
        marcarPin(pin)
        aroAbierto = aro
        actualizarAros()
        // El contenido tiene que estar antes de ubicar la ventanita: MapLibre
        // decide si va arriba o abajo según lo que mide.
        flushSync(() => setAbierto({ tiendas, zona }))
        popup.setLngLat(lngLat).setOffset(offset)
        if (!popup.isOpen()) popup.addTo(mapa)
        fija = false
      }
      // Con el dedo el toque llega después del "mouse encima" que simula el
      // navegador, con la ventanita ya abierta: igual se centra.
      if (conClic) {
        fija = true
        centrar(lngLat, zona)
      }
    }
    popup.on('close', () => {
      claveAbierta = null
      fija = false
      marcarPin(null)
      aroAbierto = null
      actualizarAros()
      setAbierto(null)
    })
    nodoPopup.addEventListener('mouseenter', cancelarCierre)
    nodoPopup.addEventListener('mouseleave', cerrarConDemora)

    function abrirZona(rasgo, conClic = false) {
      const celda = rasgo?.properties?.celda
      const tiendas = zonasRef.current.get(celda)
      if (!tiendas) return
      abrir({ clave: `z:${celda}`, tiendas, zona: true, lngLat: rasgo.geometry.coordinates, offset: OFFSET_ZONA, aro: rasgo.id ?? null, conClic })
    }
    mapa.on('mousemove', 'zonas', (e) => {
      mapa.getCanvas().style.cursor = 'pointer'
      const id = e.features[0]?.id ?? null
      if (id !== aroEncima) { aroEncima = id; actualizarAros() }
      abrirZona(e.features[0])
    })
    mapa.on('mouseleave', 'zonas', () => {
      mapa.getCanvas().style.cursor = ''
      aroEncima = null
      actualizarAros()
      cerrarConDemora()
    })
    mapa.on('click', 'zonas', (e) => abrirZona(e.features[0], true))
    mapa.on('click', (e) => {
      if (e.originalEvent.target?.closest?.('.pin, .maplibregl-popup')) return
      if (mapa.getLayer('zonas') && mapa.getSource('zonas') && mapa.queryRenderedFeatures(e.point, { layers: ['zonas'] }).length) return
      cerrar()
    })

    accionesRef.current = { abrir, cerrarConDemora }

    let cuadro = 0
    mapa.on('move', () => {
      if (!cuadro) cuadro = requestAnimationFrame(() => { cuadro = 0; aplicarNombres() })
    })
    // Al terminar de moverse el motor ya ubicó los nombres del fondo.
    mapa.on('idle', aplicarNombres)

    return () => {
      cancelAnimationFrame(cuadro)
      cancelAnimationFrame(cuadroAro)
      cancelarCierre()
      nodoPopup.removeEventListener('mouseenter', cancelarCierre)
      nodoPopup.removeEventListener('mouseleave', cerrarConDemora)
      popup.remove()
      mapa.remove()
      mapaRef.current = null
      accionesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Cambio de piel ──
  useEffect(() => {
    pielRef.current = piel
    const mapa = mapaRef.current
    if (!mapa || pielAplicada.current === piel) return
    pielAplicada.current = piel
    mapa.setStyle(buildStyle(piel, zonasGeoRef.current))
    contenedorRef.current?.querySelectorAll('.pin path').forEach((p) => p.setAttribute('fill', PIELES[piel].pin))
  }, [piel])

  // ── Pines de las tiendas con dirección visible ──
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    const marcadores = exactas.map((v) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'pin'
      el.setAttribute('aria-label', v.nombre_negocio || 'Tienda')
      el.innerHTML = svgCasa(PIELES[pielRef.current].pin)
      const lngLat = [Number(v.longitud), Number(v.latitud)]
      const abrirEsta = (conClic) => accionesRef.current?.abrir({ clave: `t:${v.id}`, tiendas: [v], zona: false, lngLat, offset: OFFSET_PIN, pin: el, conClic })
      el.addEventListener('mouseenter', () => abrirEsta(false))
      el.addEventListener('mouseleave', () => accionesRef.current?.cerrarConDemora())
      el.addEventListener('click', (ev) => { ev.stopPropagation(); abrirEsta(true) })
      // La punta de la casita es la esquina de abajo a la izquierda del dibujo.
      return new maplibregl.Marker({ element: el, anchor: 'bottom-left' }).setLngLat(lngLat).addTo(mapa)
    })
    return () => marcadores.forEach((m) => m.remove())
  }, [exactas])

  // ── Barrios: nombres para el mapa y para la ventanita ──
  useEffect(() => {
    let cancelado = false
    async function cargarBarrios() {
      try {
        const { data, error } = await supabase.rpc('barrios_con_poligono')
        if (error) throw error
        if (cancelado || !data) return
        setBarrios(data)
        setBarriosMap(Object.fromEntries(data.map((b) => [b.id, b.nombre])))
      } catch (e) {
        console.error('Error cargando barrios:', e?.message || e)
        // Sin polígonos no hay nombres en el mapa, pero la ventanita puede
        // seguir diciendo el barrio.
        try {
          const { data, error } = await supabase.from('barrios').select('id, nombre')
          if (error) throw error
          if (!cancelado && data) setBarriosMap(Object.fromEntries(data.map((b) => [b.id, b.nombre])))
        } catch (e2) {
          console.error('Error cargando nombres de barrios:', e2?.message || e2)
        }
      }
    }
    cargarBarrios()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Medidas de cada nombre por píxel de letra: el tamaño depende del zoom y
  // todo el rótulo escala con él, así que se mide una vez y no en cada cuadro.
  function medirNombres() {
    const tamano = tamanoRef.current || TAMANO_NOMBRES_MIN
    etiquetasRef.current.forEach((e) => {
      e.w0 = e.el.offsetWidth / tamano
      e.h0 = e.el.offsetHeight / tamano
    })
  }

  function aplicarNombres() {
    const mapa = mapaRef.current
    const raiz = contenedorRef.current
    if (!mapa || !raiz) return
    const z = mapa.getZoom()
    const tamano = tamanoNombres(z)
    if (tamano !== tamanoRef.current) {
      tamanoRef.current = tamano
      raiz.style.setProperty('--bfs', `${tamano}px`)
    }
    const etiquetas = etiquetasRef.current
    const mostrar = nombresRef.current && z >= ZOOM_NOMBRES
    const puestos = mostrar ? reservasLocalidades(mapa) : []
    etiquetas.forEach((e) => {
      let visible = false
      if (mostrar) {
        const p = mapa.project(e.ll)
        const w = (e.w0 * tamano) / 2 + 4
        const h = (e.h0 * tamano) / 2 + 3
        const caja = [p.x - w, p.y - h, p.x + w, p.y + h]
        visible = !puestos.some((b) => !(caja[2] < b[0] || caja[0] > b[2] || caja[3] < b[1] || caja[1] > b[3]))
        if (visible) puestos.push(caja)
      }
      if (visible !== e.visible) {
        e.visible = visible
        e.el.style.opacity = visible ? 1 : 0
      }
    })
  }

  // ── Nombres de barrio ──
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !barrios.length) return
    const etiquetas = []
    for (const b of barrios) {
      if (!b.geojson || !b.nombre) continue
      try {
        const c = centro(b.geojson)
        etiquetas.push({ nombre: b.nombre.trim(), ll: c.ll, area: c.area })
      } catch {
        // Un polígono roto no impide los demás nombres.
      }
    }
    // Los barrios grandes tienen prioridad cuando dos nombres se pisan.
    etiquetas.sort((a, b) => b.area - a.area)
    etiquetas.forEach((e) => {
      // MapLibre maneja la opacidad y la posición del marcador: el rótulo va
      // adentro, en un elemento propio.
      const marco = document.createElement('div')
      marco.className = 'barrio-marco'
      marco.setAttribute('aria-hidden', 'true')
      e.el = document.createElement('div')
      e.el.className = 'barrio-lbl'
      e.el.textContent = partir(e.nombre)
      e.el.style.opacity = 0
      e.visible = false
      marco.appendChild(e.el)
      e.mk = new maplibregl.Marker({ element: marco, anchor: 'center' }).setLngLat(e.ll).addTo(mapa)
    })
    etiquetasRef.current = etiquetas
    medirNombres()
    aplicarNombres()
    // Si Inter termina de cargar después, las medidas cambian.
    let vigente = true
    document.fonts?.ready.then(() => { if (vigente) { medirNombres(); aplicarNombres() } })
    return () => {
      vigente = false
      etiquetas.forEach((e) => e.mk.remove())
      etiquetasRef.current = []
    }
  }, [barrios])

  useEffect(() => {
    nombresRef.current = nombresPrendidos
    aplicarNombres()
  }, [nombresPrendidos])

  const s = PIELES[piel] || PIELES[PIEL_INICIAL]

  // relative z-0: los controles del mapa no pueden quedar por encima de la
  // Navbar (z-900).
  return (
    <div className="mapa-vendedores relative z-0 h-full w-full" style={{ background: s.land }}>
      <div
        ref={contenedorRef}
        // En línea: el CSS de MapLibre le pone position: relative a .maplibregl-map.
        style={{ position: 'absolute', inset: 0, '--blbl': s.bLabel, '--bhalo': haloNombres(s.bHaloCss) }}
      />

      {errorFondo && (
        <div className="mapa-error">No se pudo cargar el mapa. Probá recargar la página.</div>
      )}

      <div className="mapa-modo" role="group" aria-label="Versión del mapa">
        <button type="button" aria-pressed={piel === 'claro'} onClick={() => onCambiarPiel?.('claro')}>Claro</button>
        <button type="button" aria-pressed={piel === 'oscuro'} onClick={() => onCambiarPiel?.('oscuro')}>Oscuro</button>
      </div>
      <button
        type="button"
        className="mapa-lamp"
        aria-pressed={nombresPrendidos}
        aria-label="Nombres de barrios"
        title="Nombres de barrios"
        onClick={() => setNombresPrendidos((n) => !n)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.25 18v-.19c0-.98.66-1.82 1.51-2.32a7.5 7.5 0 1 0-7.52 0c.85.5 1.51 1.34 1.51 2.32V18z" />
          <path d="M12 18v-5.25M9.75 20.25h4.5M10.5 22.5h3" />
        </svg>
      </button>

      {abierto && createPortal(
        <ContenidoPopup tiendas={abierto.tiendas} zona={abierto.zona} barriosMap={barriosMap} />,
        nodoPopup,
      )}

      <style>{`
        .mapa-vendedores .maplibregl-map { font-family: var(--font-inter), 'Inter', sans-serif; }
        .mapa-vendedores .barrio-marco { pointer-events: none; z-index: 0; }
        .mapa-vendedores .barrio-lbl {
          font: 600 var(--bfs, ${TAMANO_NOMBRES_MIN}px)/1.1 var(--font-inter), 'Inter', sans-serif;
          white-space: pre-line; text-transform: uppercase; letter-spacing: .07em;
          color: var(--blbl); text-shadow: var(--bhalo);
          max-width: 10em; text-align: center; transition: opacity .12s;
        }
        .mapa-vendedores .pin {
          z-index: 1; cursor: pointer; background: none; border: 0; padding: 0;
        }
        .mapa-vendedores .pin svg {
          display: block; width: 29px; height: 42.4px;
          transition: transform .15s ease; transform-origin: 0 100%;
        }
        .mapa-vendedores .pin:hover svg, .mapa-vendedores .pin.on svg { transform: scale(1.18); }
        .mapa-vendedores .pin:focus-visible { outline: 2px solid #4164fe; outline-offset: 2px; }
        .mapa-vendedores .maplibregl-popup.mapa-popup { z-index: 10; }
        .mapa-vendedores .mapa-popup .maplibregl-popup-content {
          border-radius: 16px;
          padding: 16px 20px 18px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          font-family: var(--font-inter), 'Inter', sans-serif;
        }
        .mapa-vendedores .mapa-popup .maplibregl-popup-close-button {
          color: rgba(10,10,10,0.3);
          font-size: 20px;
          line-height: 20px;
          top: 10px;
          right: 12px;
          width: 20px;
          height: 20px;
        }
        .mapa-vendedores .mapa-popup .maplibregl-popup-close-button:hover {
          color: rgba(10,10,10,0.6);
          background: transparent;
        }
        .mapa-vendedores .maplibregl-ctrl-group { border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.12); }
        .mapa-vendedores .mapa-modo {
          position: absolute; left: 16px; top: 16px; z-index: 3; display: flex; gap: 4px; padding: 4px;
          background: #fff; border-radius: 999px; box-shadow: 0 2px 12px rgba(0,0,0,.15);
        }
        .mapa-vendedores .mapa-modo button {
          font: 600 13px var(--font-inter), 'Inter', sans-serif; border: 0; background: transparent; color: #0a0a0a;
          padding: 8px 16px; border-radius: 999px; cursor: pointer;
        }
        .mapa-vendedores .mapa-modo button[aria-pressed="true"] { background: #0a0a0a; color: #fff; }
        .mapa-vendedores .mapa-lamp {
          position: absolute; left: 16px; top: 66px; z-index: 3; width: 44px; height: 44px; border-radius: 50%;
          border: 0; background: #fff; color: #0a0a0a; display: grid; place-items: center; cursor: pointer;
          box-shadow: 0 2px 12px rgba(0,0,0,.15);
        }
        .mapa-vendedores .mapa-lamp svg { width: 22px; height: 22px; }
        .mapa-vendedores .mapa-lamp[aria-pressed="true"] { background: #0a0a0a; color: #fff; }
        .mapa-vendedores .mapa-modo button:focus-visible,
        .mapa-vendedores .mapa-lamp:focus-visible { outline: 2px solid #4164fe; outline-offset: 2px; }
        .mapa-vendedores .mapa-error {
          position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; text-align: center;
          padding: 24px; font-size: 13px; color: rgba(10,10,10,.55); background: #faf9f7;
        }
        @media (prefers-reduced-motion: reduce) {
          .mapa-vendedores .pin svg, .mapa-vendedores .barrio-lbl { transition: none; }
        }
      `}</style>
    </div>
  )
}
