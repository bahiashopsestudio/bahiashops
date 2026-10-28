'use client'

// La versión del mapa público (Claro u Oscuro) que eligió quien mira. Se
// guarda en su navegador, con una sola clave para los dos mapas (home y
// /mapa). La primera vez, o si el navegador no deja guardar (modo privado,
// datos bloqueados), arranca en Claro.
//
// La usan MapaDestacado y MapaContent: la leyenda está fuera del mapa y
// tiene que cambiar de colores junto con él.

import { useCallback, useSyncExternalStore } from 'react'
import { PIELES, PIEL_INICIAL } from '@/lib/mapaEstilo'

const CLAVE = 'bahia-shops:mapa-piel'
const avisar = new Set()
// La elegida en esta visita: vale aunque el navegador no la deje guardar.
let elegida = null

function leer() {
  if (elegida) return elegida
  try {
    const guardada = window.localStorage.getItem(CLAVE)
    return PIELES[guardada] ? guardada : PIEL_INICIAL
  } catch {
    return PIEL_INICIAL
  }
}

function suscribir(aviso) {
  avisar.add(aviso)
  return () => avisar.delete(aviso)
}

export function usePielMapa() {
  // En el servidor (y al hidratar) siempre Claro; enseguida pasa a la guardada.
  const piel = useSyncExternalStore(suscribir, leer, () => PIEL_INICIAL)
  const cambiarPiel = useCallback((nueva) => {
    if (!PIELES[nueva]) return
    elegida = nueva
    try { window.localStorage.setItem(CLAVE, nueva) } catch { /* sin guardar: igual cambia */ }
    avisar.forEach((aviso) => aviso())
  }, [])
  return [piel, cambiarPiel]
}
