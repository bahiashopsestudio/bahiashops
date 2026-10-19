'use client';

// Lo que va debajo de cada reseña en el panel de la tienda (/vendedor/resenas):
// la respuesta de la tienda, "Responder" o "Editar respuesta", y "Pedir
// revisión" (PedirRevision). La respuesta se publica y se edita por el
// servidor (/api/vendedor/resenas/[id]/respuesta), que pasa el filtro de
// respuestas y vuelve a comprobar todo; la base (migración 039) también. Sin
// mails.
//
// Con respuesta:
//   · dentro de los 7 días: "Editar respuesta" y "Te quedan {n} días"
//   · después: "Tu respuesta ya no se puede editar"
//   · oculta por la moderación: la etiqueta "Oculta" y por qué, sin editar
//
// Props:
//   resena         la reseña del panel (con respuesta, estado_revision)
//   tienda         el nombre de la tienda (firma la respuesta)
//   onRespondida() se publicó una respuesta nueva (para el contador)

import { useState } from 'react';
import { RespuestaPublica } from '@/components/ListaResenas';
import { CartelBloqueo } from '@/components/ResenaPedido';
import PedirRevision from '@/components/PedirRevision';
import {
  LARGO_MAXIMO_RESPUESTA, largoTexto, limpiarTexto, moderarTextoRespuesta, textoDiasEdicion, FIRMA_CUENTA_ELIMINADA,
} from '@/lib/resenas';

const INTER = "'Inter', sans-serif";
const EXPLICACION_BLOQUEO = 'Las respuestas no pueden tener datos de contacto ni insultos. Sacá esto de tu respuesta:';

// El recuadro para escribir o editar la respuesta.
function FormularioRespuesta({ resena, tienda, inicial, editando, onGuardada, onCancelar }) {
  const [texto, setTexto] = useState(inicial || '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [bloqueos, setBloqueos] = useState(null);

  const largo = largoTexto(texto);
  const largoDeMas = largo > LARGO_MAXIMO_RESPUESTA;
  const vacio = !limpiarTexto(texto);
  const id = `respuesta-${resena.id}`;

  async function guardar() {
    if (vacio || largoDeMas || enviando) return;
    setError('');
    setBloqueos(null);
    const limpio = limpiarTexto(texto);
    // Aviso rápido antes de ir al servidor; el que decide es la ruta.
    const revision = moderarTextoRespuesta(limpio);
    if (revision.nivel === 'bloqueo') { setBloqueos(revision.bloqueos); return; }

    setEnviando(true);
    try {
      const res = await fetch(`/api/vendedor/resenas/${resena.id}/respuesta`, {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: limpio }),
      });
      const datos = await res.json().catch(() => null);
      if (res.ok && datos?.respuesta) { onGuardada(datos.respuesta); return; }
      if (res.status === 422 && datos?.moderacion?.bloqueos) setBloqueos(datos.moderacion.bloqueos);
      else setError(datos?.error || 'No pudimos guardar tu respuesta. Probá de nuevo en un rato.');
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
    }
    setEnviando(false);
  }

  return (
    <div className="mt-3 border border-[#0a0a0a]/10 rounded-xl p-4">
      <label htmlFor={id} className="block text-sm text-[#0a0a0a] mb-1.5" style={{ fontFamily: INTER, fontWeight: 600 }}>
        {editando ? 'Editá tu respuesta' : `Tu respuesta a ${resena.apodo || FIRMA_CUENTA_ELIMINADA}`}
      </label>
      <textarea id={id} value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
        placeholder="Por ejemplo: qué pasó y cómo lo resolviste."
        className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#4164fe]/60 bg-white font-[inherit] resize-y" />
      <p className={`m-0 mt-1 text-right text-xs tabular-nums ${largoDeMas ? 'text-[#dc2626]' : 'text-[#0a0a0a]/40'}`}>
        {largo} / {LARGO_MAXIMO_RESPUESTA}
      </p>
      {bloqueos && <CartelBloqueo bloqueos={bloqueos} explicacion={EXPLICACION_BLOQUEO} />}

      <p className="m-0 mt-2 text-xs text-[#0a0a0a]/45 font-light leading-relaxed">
        {editando
          ? 'Si la cambiás, se va a ver «editada».'
          : <>Se publica debajo de la reseña, firmada como <strong className="font-semibold text-[#0a0a0a]/70">{tienda}</strong>. La podés editar durante 7 días; después queda fija.</>}
      </p>
      {error && <p className="m-0 mt-2 text-sm text-[#dc2626] font-light">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button type="button" onClick={guardar} disabled={vacio || largoDeMas || enviando}
          className="bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0a0a0a] disabled:hover:text-white"
          style={{ fontFamily: INTER, fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '10px 20px' }}>
          {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Publicar respuesta'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}
          className="text-sm text-[#0a0a0a]/45 font-light bg-transparent border-none p-0 cursor-pointer hover:text-[#0a0a0a]/70 underline underline-offset-2">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function AccionesResena({ resena, tienda, onRespondida }) {
  const [respuesta, setRespuesta] = useState(resena.respuesta || null);
  // null | 'responder' | 'editar' | 'revision'
  const [abierto, setAbierto] = useState(null);
  const [aviso, setAviso] = useState('');
  const [estadoRevision, setEstadoRevision] = useState(resena.estado_revision || null);

  const oculta = respuesta?.estado === 'oculta_por_moderacion';
  const diasEdicion = respuesta && !oculta ? (respuesta.dias_edicion || 0) : 0;

  function guardada(nueva) {
    const eraNueva = !respuesta;
    setRespuesta(nueva);
    setAbierto(null);
    setAviso(eraNueva ? 'Tu respuesta ya está publicada' : 'Respuesta actualizada');
    if (eraNueva) onRespondida?.();
  }

  const revision = (
    <PedirRevision resena={resena}
      estado={estadoRevision}
      onPedida={() => setEstadoRevision('en_revision')}
      abierto={abierto === 'revision'}
      onAbrir={(si) => { setAviso(''); setAbierto(si ? 'revision' : null); }}
      onResponder={respuesta ? null : () => setAbierto('responder')}
      soloLink={!respuesta && abierto !== 'revision'} />
  );

  return (
    <div>
      {respuesta && (
        <RespuestaPublica tienda={tienda} respuesta={respuesta}
          marca={oculta ? (
            <span className="text-[11px] font-medium text-[#8a3410] bg-[#fbe8da] rounded-full px-2 py-0.5">Oculta</span>
          ) : null} />
      )}

      {respuesta && abierto !== 'editar' && (
        <p className="m-0 mt-2 ml-2 md:ml-8 text-xs text-[#0a0a0a]/45 font-light flex flex-wrap items-center gap-x-2">
          {oculta ? (
            'La ocultamos porque no cumple las reglas de las reseñas.'
          ) : diasEdicion > 0 ? (
            <>
              <button type="button" onClick={() => { setAviso(''); setAbierto('editar'); }}
                className="text-xs text-[#0a0a0a]/60 underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer hover:text-[#0a0a0a]">
                Editar respuesta
              </button>
              <span>{textoDiasEdicion(diasEdicion)}</span>
            </>
          ) : (
            'Tu respuesta ya no se puede editar'
          )}
        </p>
      )}

      {aviso && (
        <p role="status" className="m-0 mt-3 text-sm font-medium text-[#2e6b4f] bg-[#e9f3ec] rounded-lg px-3.5 py-2.5">{aviso}</p>
      )}

      {(abierto === 'responder' || abierto === 'editar') && (
        <FormularioRespuesta resena={resena} tienda={tienda}
          editando={abierto === 'editar'}
          inicial={abierto === 'editar' ? respuesta?.texto : ''}
          onGuardada={guardada}
          onCancelar={() => setAbierto(null)} />
      )}

      {/* Sin respuesta: "Responder" y "Pedir revisión" en la misma fila. */}
      {!respuesta && abierto !== 'responder' && abierto !== 'revision' ? (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => { setAviso(''); setAbierto('responder'); }}
            className="bg-white text-[#0a0a0a] border border-[#0a0a0a] hover:bg-[#0a0a0a]/[0.04] transition-colors cursor-pointer"
            style={{ fontFamily: INTER, fontWeight: 500, fontSize: '13px', borderRadius: '4px', padding: '8px 16px' }}>
            Responder
          </button>
          {revision}
        </div>
      ) : (
        abierto !== 'responder' && abierto !== 'editar' && <div>{revision}</div>
      )}
    </div>
  );
}
