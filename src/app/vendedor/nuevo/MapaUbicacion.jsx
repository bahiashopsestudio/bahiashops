'use client'

// El mapa para ubicar un punto: alta de tienda y /vendedor/ubicacion (por
// BloqueUbicacion), checkout y mis-direcciones (por FormularioDireccion). El
// diseño está en docs/mapa-ubicacion-mockup.html. Siempre en la piel Claro, con
// nombres de calles y sin polígonos de barrio.
//
// Dos modos:
//   'exacto': la casita, arrastrable; la punta de la cola marca el lugar. Tocar
//     el mapa la mueve ahí. El barrio sale del punto.
//   'zona': el aro de RADIO_ZONA_M metros, arrastrable. Al soltarlo, o al tocar
//     el mapa, se desliza (200 ms, ease-out) hasta el centro de su celda de la
//     grilla, y recién ahí se avisa al formulario: lo que se guarda es
//     exactamente lo que se ve, y el barrio se pide con ese centro. El punto
//     sin redondear no sale del navegador. Con "reducir movimiento" activado en
//     el sistema, se ubica directo, sin animación.
//
// El barrio se pide solo al soltar o al tocar, nunca durante el arrastre.
//
// conBarrios = false (direcciones de otra ciudad): no pregunta el barrio del
// punto; barrioDetectado llega siempre null.
//
// Si el mapa no puede arrancar (sin WebGL) o no carga el fondo, se ve el aviso,
// pero la búsqueda sigue informando el punto y el barrio: el checkout exige el
// punto para calcular el envío y no puede quedar trabado por el mapa.
//
// Se importa siempre con dynamic(..., { ssr: false }): MapLibre necesita window
// al cargarse.

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { createClient } from '@/lib/supabase/client'
import { RADIO_ZONA_M, redondearPunto } from '@/lib/zonaVendedor'
import {
  CASA, CASA_VIEWBOX, CLASE_ALTO_MAPA_UBICACION, MENSAJES_GESTOS, PIELES, PLAZA, estiloUbicacion, soportaWebGL,
} from '@/lib/mapaEstilo'
import 'maplibre-gl/dist/maplibre-gl.css'

const VERDE = PIELES.claro.pin
const DURACION_DESLIZ_MS = 200
const DURACION_BUSQUEDA_MS = 700
const ZOOM_SIN_POSICION = 11
const ZOOM_MAXIMO = 18
// Por debajo de este diámetro, con 4 px de borde, el aro se ve como un punto.
const DIAMETRO_MINIMO_ARO_PX = 24

const AYUDA_CASITA = 'Arrastrá la casita o tocá el mapa para moverla'
const AYUDA_ARO = 'Arrastrá el aro o tocá el mapa: se acomoda solo a su casillero'

function reducirMovimiento() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// zoomMinimo: 11 para la tienda (está en la zona de Bahía); las direcciones
// pueden ser de cualquier lugar del país y necesitan alejarse hasta verlo.
export default function MapaUbicacion({ posicionBuscada, onUbicacionChange, modo = 'exacto', conBarrios = true, zoomMinimo = ZOOM_SIN_POSICION }) {
  const supabase = createClient()
  const contenedorRef = useRef(null)
  const mapaRef = useRef(null)
  const casaRef = useRef(null)
  const aroRef = useRef(null)
  const [errorFondo, setErrorFondo] = useState(() => !soportaWebGL())

  // El punto que está en el mapa ({ lat, lng }) y lo que leen los manejadores
  // de MapLibre, que se registran una sola vez.
  const puntoRef = useRef(null)
  const modoRef = useRef(modo)
  const conBarriosRef = useRef(conBarrios)
  const avisarRef = useRef(onUbicacionChange)
  const primeraPosicion = useRef(true)
  const posicionInicial = useRef(posicionBuscada)
  const cuadro = useRef(null)
  // Si se mueve rápido, solo cuenta la respuesta del último movimiento.
  const ultimaConsulta = useRef(0)

  // Antes que el montaje del mapa y que la posición buscada, que los leen.
  useEffect(() => {
    modoRef.current = modo
    conBarriosRef.current = conBarrios
    avisarRef.current = onUbicacionChange
  })

  // barrioFallo: la consulta falló, que no es lo mismo que "no hay barrio".
  async function detectarBarrio(lat, lng) {
    try {
      const { data, error } = await supabase.rpc('barrio_en_punto', { lat, lng })
      if (error) throw error
      return { barrio: data && data.length > 0 ? data[0] : null, fallo: false }
    } catch (e) {
      console.error('Error detectando barrio:', e?.message || e)
      return { barrio: null, fallo: true }
    }
  }

  // El aro mide RADIO_ZONA_M metros en pantalla al zoom actual.
  function medirAro() {
    const mapa = mapaRef.current
    const el = aroRef.current?.getElement()
    const punto = aroRef.current?.getLngLat()
    if (!mapa || !el || !punto) return
    const metrosPorGrado = 111320 * Math.cos((punto.lat * Math.PI) / 180)
    const centro = mapa.project(punto)
    const borde = mapa.project([punto.lng + RADIO_ZONA_M / metrosPorGrado, punto.lat])
    const lado = Math.max(DIAMETRO_MINIMO_ARO_PX, 2 * Math.abs(borde.x - centro.x))
    el.style.width = `${lado}px`
    el.style.height = `${lado}px`
  }

  // Pone el marcador del modo actual en el punto y saca el otro.
  function ponerMarcador({ lat, lng }) {
    const mapa = mapaRef.current
    if (!mapa) return
    const zona = modoRef.current === 'zona'
    const usar = zona ? aroRef.current : casaRef.current
    const sacar = zona ? casaRef.current : aroRef.current
    sacar.remove()
    usar.setLngLat([lng, lat]).addTo(mapa)
    if (zona) medirAro()
  }

  // Pone el punto, detecta el barrio y le reporta todo al formulario. En modo
  // zona, el punto pasa antes a ser el centro de la celda.
  async function procesarPosicion(lat, lng) {
    const punto = modoRef.current === 'zona' ? redondearPunto(lat, lng) : { lat, lng }
    puntoRef.current = punto
    ponerMarcador(punto)
    const consulta = ++ultimaConsulta.current
    const resultado = conBarriosRef.current ? await detectarBarrio(punto.lat, punto.lng) : { barrio: null, fallo: false }
    if (consulta !== ultimaConsulta.current) return
    avisarRef.current({ lat: punto.lat, lng: punto.lng, barrioDetectado: resultado.barrio, barrioFallo: resultado.fallo })
  }

  // Durante la animación el aro se mueve directo en MapLibre, sin pasar por
  // React en cada cuadro. Recién al terminar se avisa al formulario.
  function deslizarA(celda) {
    cancelAnimationFrame(cuadro.current)
    const aro = aroRef.current
    const terminar = () => procesarPosicion(celda.lat, celda.lng)
    if (!puntoRef.current || !aro || reducirMovimiento()) { terminar(); return }
    const desde = aro.getLngLat()
    const inicio = performance.now()
    const paso = (ahora) => {
      const t = Math.min(1, Math.max(0, ahora - inicio) / DURACION_DESLIZ_MS)
      const k = 1 - (1 - t) ** 3 // ease-out
      aro.setLngLat([desde.lng + (celda.lng - desde.lng) * k, desde.lat + (celda.lat - desde.lat) * k])
      if (t < 1) cuadro.current = requestAnimationFrame(paso)
      else terminar()
    }
    cuadro.current = requestAnimationFrame(paso)
  }

  // ── Montaje del mapa y sus marcadores (una sola vez) ──
  useEffect(() => {
    if (errorFondo) return
    const inicial = posicionInicial.current
    let mapa
    try {
      mapa = new maplibregl.Map({
        container: contenedorRef.current,
        style: estiloUbicacion(),
        center: inicial ? [inicial.lng, inicial.lat] : PLAZA,
        zoom: inicial?.zoom ?? ZOOM_SIN_POSICION,
        minZoom: zoomMinimo, maxZoom: ZOOM_MAXIMO,
        // Sin brújula no hay cómo volver a enderezarlo: no se gira ni se inclina.
        dragRotate: false, pitchWithRotate: false, touchPitch: false,
        // Está dentro de formularios que se scrollean.
        cooperativeGestures: true,
        locale: MENSAJES_GESTOS,
        // La atribución va plegada en el botón (i), como en el mapa público.
        attributionControl: { compact: true },
      })
    } catch (e) {
      console.error('Mapa: no se pudo iniciar', e)
      const aviso = setTimeout(() => setErrorFondo(true), 0)
      return () => clearTimeout(aviso)
    }
    mapaRef.current = mapa
    primeraPosicion.current = true
    mapa.touchZoomRotate.disableRotation()
    mapa.keyboard.disableRotation()
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapa.once('idle', () => {
      mapa.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    })
    // Con un manejador propio MapLibre ya no los escribe en la consola.
    mapa.on('error', (e) => {
      console.error('Mapa:', e.error?.message || e.error || e)
      if (!mapa.loaded() && /fetch|network|failed/i.test(String(e.error?.message || e.error || ''))) setErrorFondo(true)
    })

    const elCasa = document.createElement('div')
    elCasa.className = 'ubicacion-casa'
    elCasa.setAttribute('aria-label', 'Tu dirección en el mapa')
    elCasa.innerHTML = `<svg viewBox="${CASA_VIEWBOX}" aria-hidden="true"><path d="${CASA}" fill="${VERDE}"/></svg>`
    // La punta de la casita es la esquina de abajo a la izquierda del dibujo.
    const casa = new maplibregl.Marker({ element: elCasa, anchor: 'bottom-left', draggable: true })

    const elAro = document.createElement('div')
    elAro.className = 'ubicacion-aro'
    elAro.setAttribute('aria-label', 'Tu zona en el mapa')
    const aro = new maplibregl.Marker({ element: elAro, anchor: 'center', draggable: true })

    casaRef.current = casa
    aroRef.current = aro

    casa.on('dragstart', () => elCasa.classList.add('arrastrando'))
    casa.on('dragend', () => {
      elCasa.classList.remove('arrastrando')
      const { lat, lng } = casa.getLngLat()
      procesarPosicion(lat, lng)
    })
    aro.on('dragstart', () => {
      cancelAnimationFrame(cuadro.current)
      elAro.classList.add('arrastrando')
    })
    aro.on('dragend', () => {
      elAro.classList.remove('arrastrando')
      const { lat, lng } = aro.getLngLat()
      deslizarA(redondearPunto(lat, lng))
    })

    mapa.on('click', (e) => {
      // Tocar la casita no la mueve: saltaría unos píxeles cada vez.
      if (e.originalEvent.target?.closest?.('.ubicacion-casa')) return
      const { lat, lng } = e.lngLat
      if (modoRef.current === 'zona') deslizarA(redondearPunto(lat, lng))
      else procesarPosicion(lat, lng)
    })
    mapa.on('zoom', medirAro)

    return () => {
      cancelAnimationFrame(cuadro.current)
      casa.remove()
      aro.remove()
      mapa.remove()
      mapaRef.current = null
      casaRef.current = null
      aroRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cuando el formulario manda una posición nueva (resultado de buscar, o de
  // cambiar de opción), mueve el mapa ahí, pone el marcador y avisa. El "nonce"
  // hace que reaccione aunque la coordenada se repita. Sin mapa también avisa.
  useEffect(() => {
    if (!posicionBuscada) return
    cancelAnimationFrame(cuadro.current)
    const { lat, lng, zoom } = posicionBuscada
    const mapa = mapaRef.current
    if (mapa) {
      // En zona, el mapa se centra en la celda, no en el punto buscado.
      const destino = modoRef.current === 'zona' ? redondearPunto(lat, lng) : { lat, lng }
      const camara = { center: [destino.lng, destino.lat], zoom: zoom ?? mapa.getZoom() }
      if (primeraPosicion.current || reducirMovimiento()) mapa.jumpTo(camara)
      else mapa.easeTo({ ...camara, duration: DURACION_BUSQUEDA_MS })
      primeraPosicion.current = false
    }
    procesarPosicion(lat, lng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicionBuscada?.nonce])

  return (
    <div className="mapa-ubicacion">
      <div
        className={`relative z-0 w-full ${CLASE_ALTO_MAPA_UBICACION}`}
        style={{ borderRadius: 8, overflow: 'hidden', background: PIELES.claro.land }}
      >
        {/* En línea: el CSS de MapLibre le pone position: relative a .maplibregl-map. */}
        <div ref={contenedorRef} style={{ position: 'absolute', inset: 0 }} />
        {errorFondo && (
          <div className="ubicacion-error">No se pudo cargar el mapa. Probá recargar la página.</div>
        )}
      </div>

      {!errorFondo && (
        <p className="ubicacion-ayuda">{modo === 'zona' ? AYUDA_ARO : AYUDA_CASITA}</p>
      )}

      <style>{`
        .mapa-ubicacion .maplibregl-map { font-family: var(--font-inter), 'Inter', sans-serif; }
        .mapa-ubicacion .ubicacion-casa { width: 29px; height: 42.4px; cursor: grab; touch-action: none; }
        .mapa-ubicacion .ubicacion-casa svg {
          display: block; width: 100%; height: 100%;
          transition: transform .15s ease; transform-origin: 0 100%;
        }
        .mapa-ubicacion .ubicacion-casa:hover svg,
        .mapa-ubicacion .ubicacion-casa.arrastrando svg { transform: scale(1.18); }
        .mapa-ubicacion .ubicacion-aro {
          box-sizing: border-box; border-radius: 50%; border: 4px solid ${VERDE}; background: rgba(1,84,68,.08);
          cursor: grab; touch-action: none; transition: border-width .15s ease;
        }
        .mapa-ubicacion .ubicacion-aro:hover,
        .mapa-ubicacion .ubicacion-aro.arrastrando { border-width: 5px; }
        .mapa-ubicacion .arrastrando { cursor: grabbing; }
        .mapa-ubicacion .maplibregl-ctrl-group { border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.12); }
        .mapa-ubicacion .ubicacion-ayuda {
          margin: 8px 0 0; font: 400 12px/1.5 var(--font-inter), 'Inter', sans-serif; color: rgba(10,10,10,.58);
        }
        .mapa-ubicacion .ubicacion-error {
          position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; text-align: center;
          padding: 24px; font-size: 13px; color: rgba(10,10,10,.55); background: #faf9f7;
        }
        @media (prefers-reduced-motion: reduce) {
          .mapa-ubicacion .ubicacion-casa svg, .mapa-ubicacion .ubicacion-aro { transition: none; }
        }
      `}</style>
    </div>
  )
}
