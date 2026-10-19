'use client';

// "Pedir revisión" de una reseña, en el panel de la tienda (/vendedor/resenas).
// Una sola vez por reseña: la decide el servidor
// (/api/vendedor/resenas/[id]/revision) y la base (migración 038). Mientras se
// revisa, la reseña sigue visible. Sin mails.
//
// Lo que se ve debajo de la reseña:
//   sin pedir     el link gris "Pedir revisión" (despliega el formulario)
//   en_revision   la etiqueta "En revisión"
//   revisada      "Revisada: sigue publicada"
//
// Lo abre y lo cierra AccionesResena (la tarjeta de la reseña en el panel),
// que también guarda en qué está la revisión (para que no se pierda si este
// bloque se desmonta):
//   estado         null | 'en_revision' | 'revisada'
//   onPedida()     se pidió (o ya estaba pedida)
//   abierto        si el formulario está desplegado
//   onAbrir(bool)  abrirlo o cerrarlo
//   onResponder    solo si la reseña no tiene respuesta: el recuadro celeste
//                  "¿Ya probaste responderle?" con su link "Responder"
//   soloLink       el link sin margen de arriba (va en la fila de "Responder")

import { useState } from 'react';
import { MOTIVOS_REVISION, LARGO_MAXIMO_COMENTARIO_REVISION, largoTexto, limpiarTexto } from '@/lib/resenas';

const INTER = "'Inter', sans-serif";

export default function PedirRevision({ resena, estado, onPedida, abierto, onAbrir, onResponder = null, soloLink = false }) {
  const [motivo, setMotivo] = useState('');
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const largo = largoTexto(comentario);
  const largoDeMas = largo > LARGO_MAXIMO_COMENTARIO_REVISION;
  const idMotivo = `revision-${resena.id}-motivo`;
  const idComentario = `revision-${resena.id}-comentario`;

  if (estado === 'en_revision') {
    return (
      <p className={`m-0 ${soloLink ? '' : 'mt-2'}`}>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full" style={{ fontFamily: INTER, fontWeight: 600, backgroundColor: '#e8ecff', color: '#2a3fb8' }}>
          En revisión
        </span>
      </p>
    );
  }
  if (estado === 'revisada') {
    return <p className={`m-0 ${soloLink ? '' : 'mt-2'} text-xs text-[#0a0a0a]/45 font-light`}>Revisada: sigue publicada</p>;
  }

  async function enviar() {
    if (!motivo || enviando || largoDeMas) return;
    setEnviando(true);
    setError('');
    try {
      const res = await fetch(`/api/vendedor/resenas/${resena.id}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo, comentario: limpiarTexto(comentario) }),
      });
      const datos = await res.json().catch(() => null);
      if (res.ok || (res.status === 409 && datos?.motivo === 'ya_pedida')) {
        // Ya estaba pedida (otra pestaña): se muestra como pedida.
        onPedida();
        onAbrir(false);
        return;
      }
      setError(datos?.error || 'No pudimos pedir la revisión. Probá de nuevo en un rato.');
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
    }
    setEnviando(false);
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => onAbrir(true)}
        className={`${soloLink ? '' : 'mt-2'} text-xs text-[#0a0a0a]/45 font-light underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer hover:text-[#0a0a0a]/70`}>
        Pedir revisión
      </button>
    );
  }

  return (
    <div className="mt-3 border border-[#0a0a0a]/10 rounded-xl p-4">
      {onResponder && (
        <p className="m-0 mb-3 text-sm text-[#0a0a0a]/70 font-light leading-relaxed rounded-lg px-3.5 py-3 bg-[#eaf3ff] border border-[#d3e5fb]">
          ¿Ya probaste responderle? Una respuesta tranquila suele decir más que la reseña.{' '}
          <button type="button" onClick={onResponder}
            className="text-[#2a3fb8] font-medium underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer">
            Responder
          </button>
        </p>
      )}

      <label htmlFor={idMotivo} className="block text-sm text-[#0a0a0a] mb-1.5" style={{ fontFamily: INTER, fontWeight: 600 }}>
        ¿Por qué querés que la revisemos?
      </label>
      <select id={idMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)}
        className="block w-full px-3 py-2.5 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#4164fe]/60">
        <option value="">Elegí un motivo</option>
        {MOTIVOS_REVISION.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
      </select>

      <label htmlFor={idComentario} className="block text-sm text-[#0a0a0a]/60 font-light mt-3 mb-1.5">Un comentario, si querés (opcional)</label>
      <textarea id={idComentario} value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3}
        className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#4164fe]/60 bg-white font-[inherit] resize-y" />
      <p className={`m-0 mt-1 text-right text-xs tabular-nums ${largoDeMas ? 'text-[#dc2626]' : 'text-[#0a0a0a]/40'}`}>
        {largo} / {LARGO_MAXIMO_COMENTARIO_REVISION}
      </p>

      <p className="m-0 mt-2 text-xs text-[#0a0a0a]/45 font-light leading-relaxed">
        Mientras la revisamos sigue visible. Una reseña negativa no es motivo para ocultarla.
      </p>
      {error && <p className="m-0 mt-2 text-sm text-[#dc2626] font-light">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button type="button" onClick={enviar} disabled={!motivo || enviando || largoDeMas}
          className="bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0a0a0a] disabled:hover:text-white"
          style={{ fontFamily: INTER, fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '10px 20px' }}>
          {enviando ? 'Enviando…' : 'Pedir revisión'}
        </button>
        <button type="button" onClick={() => { onAbrir(false); setError(''); }} disabled={enviando}
          className="text-sm text-[#0a0a0a]/45 font-light bg-transparent border-none p-0 cursor-pointer hover:text-[#0a0a0a]/70 underline underline-offset-2">
          Cancelar
        </button>
      </div>
    </div>
  );
}
