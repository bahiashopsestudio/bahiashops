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

export const HORARIOS_INICIALES = DIAS.reduce((acc, { clave }) => {
  acc[clave] = { abierto: false, turnos: [] }
  return acc
}, {})

const timeClasses =
  'px-1.5 py-1 border border-gray-300 rounded w-[100px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors'
const btnMiniClasses =
  'px-2.5 py-1 text-sm bg-white border border-gray-300 rounded cursor-pointer hover:bg-gray-50 transition-colors'

export default function BloqueHorarios({ valor, onChange, notas, onNotasChange }) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {DIAS.map(({ clave, label }) => {
          const dia = valor[clave]
          return (
            <div key={clave}>
              {/* Fila del día */}
              <div className="grid grid-cols-[110px_1fr] items-center gap-3 px-3 py-2.5 bg-[#F5F2EC]/60 rounded">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dia.abierto}
                    onChange={() => toggleAbierto(clave)}
                    className="accent-[#0a0a0a]"
                  />
                  <span className="text-[#0a0a0a]">{label}</span>
                </label>

                {dia.abierto ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {dia.turnos.map((turno, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={turno[0]}
                          onChange={(e) => cambiarHora(clave, i, 0, e.target.value)}
                          className={timeClasses}
                        />
                        <span className="text-gray-400">a</span>
                        <input
                          type="time"
                          value={turno[1]}
                          onChange={(e) => cambiarHora(clave, i, 1, e.target.value)}
                          className={timeClasses}
                        />
                        {i === 1 && (
                          <button
                            type="button"
                            onClick={() => quitarTurno(clave, i)}
                            className={`${btnMiniClasses} text-red-800`}
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
                        className={btnMiniClasses}
                      >
                        + Segundo turno
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => abrirPanelAplicar(clave)}
                      className={`${btnMiniClasses} text-[#0a0a0a] font-medium`}
                    >
                      Aplicar a otros días
                    </button>
                  </div>
                ) : (
                  <span className="text-gray-400 italic">Cerrado</span>
                )}
              </div>

              {/* Panel "Aplicar a otros días" */}
              {aplicarDesde === clave && (
                <div className="mt-2 p-3 bg-[#F5F2EC] border border-[#0a0a0a]/10 rounded flex flex-col gap-2">
                  <span className="text-sm text-[#0a0a0a]">
                    ¿A qué días querés aplicar el horario de <strong>{label}</strong>?
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {DIAS.filter((d) => d.clave !== clave).map((d) => (
                      <label key={d.clave} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={diasDestino.includes(d.clave)}
                          onChange={() => toggleDestino(d.clave)}
                          className="accent-[#0a0a0a]"
                        />
                        <span className="text-sm">{d.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={confirmarAplicar}
                      disabled={diasDestino.length === 0}
                      className={`px-2.5 py-1 text-sm text-white rounded transition-colors ${
                        diasDestino.length === 0
                          ? 'bg-gray-300 cursor-not-allowed'
                          : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
                      }`}
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={cerrarPanelAplicar}
                      className={btnMiniClasses}
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

      {/* Notas */}
      <label className="flex flex-col gap-1">
        <span className="text-[#0a0a0a]">
          Notas sobre horarios <span className="text-sm text-gray-500">(opcional)</span>
        </span>
        <span className="text-sm text-gray-500">
          Para excepciones tipo "feriados cerrado" o "lunes con cita previa".
        </span>
        <textarea
          rows={2}
          maxLength={300}
          value={notas}
          onChange={(e) => onNotasChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded font-[inherit] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors"
        />
      </label>
    </div>
  )
}