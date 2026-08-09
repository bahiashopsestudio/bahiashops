'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const THUMB_WIDTH_PCT = 20

export default function BarraScrollCustom({ scrollRef, deps = [], style = {} }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)
  const [thumbLeft, setThumbLeft] = useState(0)

  const updateThumb = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const ratio = max > 0 ? el.scrollLeft / max : 0
    setThumbLeft(ratio * (100 - THUMB_WIDTH_PCT))
  }, [scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateThumb, { passive: true })
    updateThumb()
    return () => el.removeEventListener('scroll', updateThumb)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateThumb, ...deps])

  function scrollToRatio(ratio) {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const clamped = Math.max(0, Math.min(1, ratio))
    el.scrollLeft = clamped * max
    setThumbLeft(clamped * (100 - THUMB_WIDTH_PCT))
  }

  function ratioFromClientX(clientX) {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const clickRatio = (clientX - rect.left) / rect.width
    const thumbRatio = THUMB_WIDTH_PCT / 100
    return (clickRatio - thumbRatio / 2) / (1 - thumbRatio)
  }

  function handleTrackClick(e) {
    if (draggingRef.current) return
    scrollToRatio(ratioFromClientX(e.clientX))
  }

  function handleThumbPointerDown(e) {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = true

    function onMove(ev) {
      scrollToRatio(ratioFromClientX(ev.clientX))
    }
    function onUp() {
      draggingRef.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      style={{
        position: 'relative',
        height: '2px',
        background: '#e2dfda',
        cursor: 'pointer',
        ...style,
      }}
    >
      <div
        onPointerDown={handleThumbPointerDown}
        style={{
          position: 'absolute',
          top: 0,
          left: `${thumbLeft}%`,
          width: `${THUMB_WIDTH_PCT}%`,
          height: '2px',
          background: '#0a0a0a',
          borderRadius: '1px',
          cursor: 'grab',
        }}
      />
    </div>
  )
}
