// La línea de toldo de Bahía Shops: un separador fino hecho de festones
// colgando hacia abajo (∪∪∪), como el borde de los toldos de los negocios.
// Es decorativa (aria-hidden). Tiene tres formas, según `curvas`:
//
//   · curvas="llenar": medios círculos completos, tantos como entren en el
//     ancho del contenedor, centrados (sin festones cortados en las puntas).
//     Es la de /vender, a lo ancho de la columna de texto y en verde:
//
//       <div className={MARCO}><div className={COL}>
//         <LineaToldo curvas="llenar" onda={32} color={FONDO_BAHIA} />
//       </div></div>
//
//   · curvas={n}: n medios círculos completos, centrados.
//
//   · Sin `curvas`: los festones se repiten de punta a punta del contenedor
//     (para bordes largos), centrados, con los de las puntas cortados iguales.
//
//   color   el de la línea (#0a0a0a por defecto)
//   onda    el ancho de cada festón, en px (40 por defecto)
//   alto    la profundidad de cada festón, en px. Por defecto, con `curvas`,
//           la mitad de la onda (un medio círculo exacto); sin `curvas`, 15
//           (un arco más abierto, con las puntas más marcadas)
//   grosor  el grosor de la línea, en px (0,75 por defecto)
//   curvas  (opcional) un número o "llenar"
//
// Cómo está hecha: un SVG usado como máscara sobre un div pintado del color,
// así el color es una prop sin rearmar el dibujo. Una unidad del SVG es un
// píxel, para que se vea nítida. Las uniones van redondeadas, sin cortes.
//
// Con `curvas`, el SVG es la línea entera (no se repite), con un poco de
// margen a los costados para que el trazo de las puntas no se recorte. Con
// "llenar", la cantidad se calcula en el navegador con el ancho disponible
// (y se recalcula si cambia).
//
// Sin `curvas`, el SVG es un festón que se repite a lo ancho; cada celda
// dibuja también los de los costados, y lo que se sale se recorta, así las
// puntas entre festones se ven continuas. Con un ancho impar, centrarlo deja
// los festones corridos medio píxel y se ven borrosos; por eso, ya en el
// navegador, el centro se redondea a un píxel entero.

'use client'

import { useEffect, useRef, useState } from 'react'

export default function LineaToldo({ color = '#0a0a0a', onda = 40, alto, grosor = 0.75, curvas }) {
  const profundidad = alto ?? (curvas ? onda / 2 : 15)
  // Aire alrededor del trazo, para que no se recorte.
  const aire = Math.ceil(grosor / 2) + 1
  // Redondeado hacia arriba: con medio píxel, lo que viene abajo queda corrido.
  const altoCaja = Math.ceil(aire + profundidad + aire)

  const ref = useRef(null)
  // El ancho disponible, medido en el navegador (para "llenar" y para centrar la repetición).
  const [ancho, setAncho] = useState(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof curvas === 'number') return
    const medir = () => setAncho(el.clientWidth)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [curvas])

  // Un arco de círculo de ancho `onda` y profundidad `profundidad` (el radio
  // sale de esas dos medidas), hacia abajo y relativo al punto anterior.
  const radio = (onda * onda / 4 + profundidad * profundidad) / (2 * profundidad)
  const arcos = (n) => Array.from({ length: n }, () => ` a${radio} ${radio} 0 0 0 ${onda} 0`).join('')

  const cantidad =
    curvas === 'llenar' ? (ancho ? Math.max(1, Math.floor((ancho - 2 * aire) / onda)) : 0)
    : typeof curvas === 'number' ? curvas
    : null

  let mascara = null
  let estilo = {}
  if (cantidad !== null) {
    if (cantidad > 0) {
      const anchoCaja = cantidad * onda + 2 * aire
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoCaja}" height="${altoCaja}" viewBox="0 0 ${anchoCaja} ${altoCaja}">` +
        `<path d="M${aire} ${aire}${arcos(cantidad)}" fill="none" stroke="black" stroke-width="${grosor}" stroke-linejoin="round" stroke-linecap="round"/>` +
        `</svg>`
      mascara = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
      // Centrado en píxeles enteros dentro del ancho disponible.
      const x = ancho ? Math.round((ancho - anchoCaja) / 2) : 0
      estilo = {
        ...(typeof curvas === 'number' ? { width: `${anchoCaja}px`, maxWidth: '100%', marginInline: 'auto' } : {}),
        repetir: 'no-repeat',
        tamano: `${anchoCaja}px ${altoCaja}px`,
        lugar: typeof curvas === 'number' ? '0 0' : `${x}px 0`,
      }
    }
  } else {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${onda}" height="${altoCaja}" viewBox="0 0 ${onda} ${altoCaja}">` +
      `<path d="M${-onda} ${aire}${arcos(3)}" fill="none" stroke="black" stroke-width="${grosor}" stroke-linejoin="round"/>` +
      `</svg>`
    mascara = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    estilo = {
      repetir: 'repeat-x',
      tamano: `${onda}px ${altoCaja}px`,
      lugar: ancho ? `${Math.round((ancho - onda) / 2)}px center` : 'center',
    }
  }

  const { repetir, tamano, lugar, ...caja } = estilo

  return (
    <div
      ref={ref}
      aria-hidden="true"
      role="presentation"
      style={{
        height: `${altoCaja}px`,
        ...caja,
        ...(mascara
          ? {
              backgroundColor: color,
              maskImage: mascara,
              WebkitMaskImage: mascara,
              maskRepeat: repetir,
              WebkitMaskRepeat: repetir,
              maskSize: tamano,
              WebkitMaskSize: tamano,
              maskPosition: lugar,
              WebkitMaskPosition: lugar,
            }
          : {}),
      }}
    />
  )
}
