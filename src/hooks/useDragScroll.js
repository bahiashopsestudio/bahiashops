'use client'

import { useEffect } from 'react'

const DRAG_THRESHOLD = 4

export function useDragScroll(scrollRef) {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let dragging = false
    let moved = false
    let startX = 0
    let startScrollLeft = 0

    function suppressNextClick(e) {
      e.preventDefault()
      e.stopPropagation()
      el.removeEventListener('click', suppressNextClick, true)
    }

    function onPointerDown(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      dragging = true
      moved = false
      startX = e.clientX
      startScrollLeft = el.scrollLeft
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // Some environments (or synthetic events) may not have an active
        // pointer to capture — dragging still works via document-level moves.
      }
      el.style.cursor = 'grabbing'
      el.style.userSelect = 'none'
    }

    function onPointerMove(e) {
      if (!dragging) return
      const dx = e.clientX - startX
      if (Math.abs(dx) > DRAG_THRESHOLD) moved = true
      el.scrollLeft = startScrollLeft - dx
    }

    function endDrag() {
      if (!dragging) return
      dragging = false
      el.style.cursor = 'grab'
      el.style.userSelect = ''
      if (moved) {
        el.addEventListener('click', suppressNextClick, true)
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
    }
  }, [scrollRef])
}
