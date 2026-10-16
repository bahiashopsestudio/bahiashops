'use client';

import { useState } from 'react';

// Los motivos predefinidos del rechazo. El vendedor ve el elegido (y la nota)
// en Mis productos y al editar.
export const MOTIVOS_RECHAZO = [
  'Tiene datos de contacto (teléfono, mail, redes o links)',
  'Las fotos no muestran el producto real',
  'La descripción no coincide con el producto',
  'Precio incorrecto o "a consultar"',
  'Está en la subcategoría equivocada',
  'Producto no permitido en la plataforma',
  'Otro motivo',
];

// La zona de rechazo de una tarjeta: el mismo rechazo en la cola de
// moderación, en "Revisar después" y en Denuncias.
//   onConfirmar(motivoFinal)  async; el motivo ya trae la nota agregada
export default function RechazoProducto({ productoId, enAccion, onConfirmar, onCancelar }) {
  const [motivoElegido, setMotivoElegido] = useState('');
  const [nota, setNota] = useState('');

  function confirmar() {
    if (!motivoElegido) {
      alert('Elegí un motivo para que el vendedor sepa qué corregir.');
      return;
    }
    const aclaracion = nota.trim();
    onConfirmar(aclaracion ? `${motivoElegido} — ${aclaracion}` : motivoElegido);
  }

  return (
    <div className="mt-4 pt-4 border-t border-dashed border-gray-100">
      <p className="text-sm text-gray-500 m-0 mb-2.5">
        ¿Por qué lo rechazás? El vendedor lo va a ver para corregir.
      </p>

      {/* Lista de motivos */}
      <div className="flex flex-col gap-1.5">
        {MOTIVOS_RECHAZO.map((motivo) => {
          const elegido = motivoElegido === motivo;
          return (
            <label
              key={motivo}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                elegido
                  ? 'border-2 border-[#0a0a0a] bg-[#F5F2EC] text-[#0a0a0a] font-medium'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name={`motivo-${productoId}`}
                checked={elegido}
                onChange={() => setMotivoElegido(motivo)}
                className="m-0 accent-[#0a0a0a]"
              />
              {motivo}
            </label>
          );
        })}
      </div>

      {/* Nota opcional */}
      <label className="block text-xs text-gray-500 mt-3 mb-1">
        Nota para el vendedor (opcional)
      </label>
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={2}
        placeholder='Aclarale el caso puntual, ej: "el teléfono está en la última foto".'
        className="w-full px-3 py-2 rounded-lg border border-gray-300 resize-y outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors text-sm"
      />

      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onCancelar}
          disabled={enAccion}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer text-sm hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={enAccion || !motivoElegido}
          className={`px-4 py-2 border-none rounded-lg text-white text-sm transition-colors ${
            enAccion || !motivoElegido
              ? 'bg-red-300 cursor-not-allowed'
              : 'bg-red-700 cursor-pointer hover:bg-red-800'
          }`}
        >
          {enAccion ? 'Rechazando...' : 'Confirmar rechazo'}
        </button>
      </div>
    </div>
  );
}
