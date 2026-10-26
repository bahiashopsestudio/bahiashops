'use client'

// Si se entró por el link propio de la tienda (?de=tienda), anota la marca de
// 48 horas para esta tienda (src/lib/marcaLink.js) y saca el parámetro de la
// barra, para que no viaje si la persona copia la dirección. No dibuja nada.
//
// Lee window.location y no useSearchParams: así la página no necesita
// Suspense ni cambia cómo se arma. Next sincroniza su router con
// window.history.replaceState.

import { useEffect } from 'react'
import { anotarMarca, almacenDelNavegador, PARAMETRO_LINK, VALOR_LINK } from '@/lib/marcaLink'

export default function MarcaLinkTienda({ vendedorId }) {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get(PARAMETRO_LINK) !== VALOR_LINK) return

    anotarMarca(almacenDelNavegador(), vendedorId, Date.now())

    url.searchParams.delete(PARAMETRO_LINK)
    const busqueda = url.searchParams.toString()
    window.history.replaceState(window.history.state, '', `${url.pathname}${busqueda ? `?${busqueda}` : ''}${url.hash}`)
  }, [vendedorId])

  return null
}
