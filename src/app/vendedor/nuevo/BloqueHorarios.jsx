'use client'

import { useState } from 'react'

const DIAS = [
  { clave: 'lunes',     label: 'Lunes' },
  { clave: 'martes',    label: 'Martes' },
  { clave: 'miercoles', label: 'Miércoles' },
  { clave: 'jueves',    label: 'Jueves' },
  { clave: 'viernes',   label: 'Viernes' },
  { clave: 'sabado',    label: 'Sábado' },
  { clave: 'domingo',   label: 'Domingo' },
]

const TURNO_INICIAL = ['09:00', '18:00']
const SEGUNDO_TURNO_INICIAL = ['17:00', '20:00']

// Estado inicial: todos los días cerrados, sin turnos.
// Lo exportamos para que el padre pueda usarlo como valor inicial del useState.
export const HORARIOS_INICIALES = DIAS.reduce((acc, { clave }) => {
  acc[clave] = { abierto: false, turnos: [] }
  return acc
}, {})

export default function BloqueHorarios({ valor, onChange, notas, onNotasChange }) {
  // Estado interno: qué día tiene el panel "aplicar a otros" abierto, y qué días tildó adentro.
  const [aplicarDesde, setAplicarDesde] = useState(null)
  const [diasDestino, setDiasDestino] = useState([])

  function actualizarDia(clave, cambios) {
    onChange({ ...valor, [clave]: { ...valor[clave], ...cambios } })
  }

  function toggleAbierto(clave) {
    if (valor[clave].abierto) {
      actualizarDia(clave, { abierto: false, turnos: [] })
    } else {
      actualizarDia(clave, { abierto: true, turnos: [[...TURNO_INICIAL]] })
    }
  }

  function cambiarHora(clave, indiceTurno, indiceHora, valorNuevo) {
    const turnosNuevos = valor[clave].turnos.map((turno, i) => {
      if (i !== indiceTurno) return turno
      const turnoNuevo = [...turno]
      turnoNuevo[indiceHora] = valorNuevo
      return turnoNuevo
    })
    actualizarDia(clave, { turnos: turnosNuevos })
  }

  function agregarSegundoTurno(clave) {
    actualizarDia(clave, {
      turnos: [...valor[clave].turnos, [...SEGUNDO_TURNO_INICIAL]],
    })
  }

  function quitarTurno(clave, indice) {
    actualizarDia(clave, {
      turnos: valor[clave].turnos.filter((_, i) => i !== indice),
    })
  }

  function abrirPanelAplicar(clave) {
    setAplicarDesde(clave)
    setDiasDestino([])
  }

  function cerrarPanelAplicar() {
    setAplicarDesde(null)
    setDiasDestino([])
  }

  function toggleDestino(clave) {
    setDiasDestino((actuales) =>
      actuales.includes(clave)
        ? actuales.filter((c) => c !== clave)
        : [...actuales, clave]
    )
  }

  function confirmarAplicar() {
    if (diasDestino.length === 0) return
    const origen = valor[aplicarDesde]
    const nuevoValor = { ...valor }
    diasDestino.forEach((clave) => {
      nuevoValor[clave] = {
        abierto: true,
        turnos: origen.turnos.map((t) => [...t]),
      }
    })
    onChange(nuevoValor)
    cerrarPanelAplicar()
  }

  const filaStyle = {
    display: 'grid',
    gridTemplateColumns: '110px 1fr',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 0.75rem',
    background: '#f9f9f9',
    borderRadius: 4,
  }
  const tiempoStyle = { padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4, width: 100 }
  const botonMiniStyle = {
    padding: '0.3rem 0.6rem',
    fontSize: '0.85rem',
    background: 'white',
    border: '1px solid #ccc',
    borderRadius: 4,
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {DIAS.map(({ clave, label }) => {
          const dia = valor[clave]
          return (
            <div key={clave}>
              <div style={filaStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dia.abierto}
                    onChange={() => toggleAbierto(clave)}
                  />
                  <span>{label}</span>
                </label>

                {dia.abierto ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                    {dia.turnos.map((turno, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input
                          type="time"
                          value={turno[0]}
                          onChange={(e) => cambiarHora(clave, i, 0, e.target.value)}
                          style={tiempoStyle}
                        />
                        <span style={{ color: '#888' }}>a</span>
                        <input
                          type="time"
                          value={turno[1]}
                          onChange={(e) => cambiarHora(clave, i, 1, e.target.value)}
                          style={tiempoStyle}
                        />
                        {i === 1 && (
                          <button
                            type="button"
                            onClick={() => quitarTurno(clave, i)}
                            style={{ ...botonMiniStyle, color: '#900' }}
                            aria-label="Quitar segundo turno"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}

                    {dia.turnos.length < 2 && (
                      <button
                        type="button"
                        onClick={() => agregarSegundoTurno(clave)}
                        style={botonMiniStyle}
                      >
                        + Segundo turno
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => abrirPanelAplicar(clave)}
                      style={{ ...botonMiniStyle, color: '#2563eb' }}
                    >
                      Aplicar a otros días
                    </button>
                  </div>
                ) : (
                  <span style={{ color: '#999', fontStyle: 'italic' }}>Cerrado</span>
                )}
              </div>

              {aplicarDesde === clave && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}>
                  <span style={{ fontSize: '0.9rem' }}>
                    ¿A qué días querés aplicar el horario de <strong>{label}</strong>?
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {DIAS.filter((d) => d.clave !== clave).map((d) => (
                      <label key={d.clave} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={diasDestino.includes(d.clave)}
                          onChange={() => toggleDestino(d.clave)}
                        />
                        <span style={{ fontSize: '0.9rem' }}>{d.label}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={confirmarAplicar}
                      disabled={diasDestino.length === 0}
                      style={{
                        ...botonMiniStyle,
                        background: diasDestino.length === 0 ? '#ccc' : '#2563eb',
                        color: 'white',
                        border: 'none',
                        cursor: diasDestino.length === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={cerrarPanelAplicar}
                      style={botonMiniStyle}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span>Notas sobre horarios <small style={{ color: '#666' }}>(opcional)</small></span>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          Para excepciones tipo "feriados cerrado" o "lunes con cita previa".
        </span>
        <textarea
          rows={2}
          maxLength={300}
          value={notas}
          onChange={(e) => onNotasChange(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit' }}
        />
      </label>
    </div>
  )
}