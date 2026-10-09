'use client'

// Cuando la sesión se cierra (en esta pestaña, en otra, o porque venció), borra
// lo que el sitio guarda de la persona en el navegador y vacía el carrito en
// memoria. Las pestañas que no pidieron el cierre se recargan. La regla está en
// src/lib/datosDelNavegador.js. Va en el layout raíz, adentro del
// CarritoProvider, así está en todas las pestañas.

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCarrito } from '@/context/CarritoContext'
import { alCerrarseLaSesion } from '@/lib/datosDelNavegador'

export default function LimpiezaDeSesion() {
  const { vaciarTodo } = useCarrito()

  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento !== 'SIGNED_OUT') return
      alCerrarseLaSesion({
        almacen: window.localStorage,
        almacenDeLaPestana: window.sessionStorage,
        vaciarMemoria: vaciarTodo,
        recargar: () => window.location.reload(),
      })
    })
    return () => data?.subscription?.unsubscribe()
  }, [vaciarTodo])

  return null
}
