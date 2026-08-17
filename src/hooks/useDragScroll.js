'use client'

import { useEffect } from 'react'

const DRAG_THRESHOLD = 4

export function useDragScroll(scrollRef) {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let dragging = false
    let moved = false
    let captured = false
    let startX = 0
    let startScrollLeft = 0

    function suppressNextClick(e) {
      e.preventDefault()
      e.stopPropagation()
      el.removeEventListener('click', suppressNextClick, true)
    }

    function onPointerDown(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      // Si un arrastre anterior dejó un supresor pendiente que nunca llegó a
      // consumir su click, lo limpiamos para que no se coma este gesto.
      el.removeEventListener('click', suppressNextClick, true)
      dragging = true
      moved = false
      captured = false
      startX = e.clientX
      startScrollLeft = el.scrollLeft
      el.style.cursor = 'grabbing'
      el.style.userSelect = 'none'
    }

    function onPointerMove(e) {
      if (!dragging) return
      const dx = e.clientX - startX
      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
        moved = true
        // La captura va acá y no en el pointerdown: con pointer capture activo
        // el navegador dispara el click sobre el elemento que capturó, así que
        // capturar antes de saber si es arrastre haría que el click apunte a
        // este contenedor y los onClick de los botones internos nunca corran.
        try {
          el.setPointerCapture(e.pointerId)
          captured = true
        } catch {
          // Sin captura el arrastre sigue andando mientras el puntero esté
          // sobre el contenedor.
        }
      }
      el.scrollLeft = startScrollLeft - dx
    }

    function endDrag(e) {
      if (!dragging) return
      dragging = false
      if (captured) {
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          // El navegador ya libera la captura solo en el pointerup.
        }
        captured = false
      }
      el.style.cursor = 'grab'
      el.style.userSelect = ''
      if (moved) {
        el.addEventListener('click', suppressNextClick, true)
      }
    }

    function onDragStart(e) {
      // Las <img> son arrastrables por defecto (HTML5 drag-and-drop) una vez
      // que terminan de cargar, y eso le roba el gesto al scroll manual.
      e.preventDefault()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('dragstart', onDragStart)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('dragstart', onDragStart)
    }
  }, [scrollRef])
}
