'use client';

// La pestaña "Reseñas" de /admin/denuncias (/api/admin/resenas). Dos vistas:
//   Por revisar  publicadas que marcó el filtro (algo dudoso: posible
//                teléfono, mención de una red, pedido de contacto) y/o que una
//                tienda pidió revisar. Siguen publicadas. "Dar por revisada"
//                o "Ocultar".
//   Ocultas      las que ocultó la moderación. "Volver a mostrar" y, desde
//                los 45 días de ocultas, "Eliminar" (se borra el texto para
//                siempre y la fila queda: no se puede volver a reseñar ese
//                pedido).
// Arriba, "Buscar por número de pedido": esa reseña sola, esté como esté.
// Ocultar pide el motivo: una reseña negativa no es motivo. No se le avisa a
// nadie. Una oculta deja de verse en público y de contar para el puntaje.
//   onCambioConteo(n)  cuántas quedan por revisar (para la pestaña)

import { useState, useEffect } from 'react';
import { ETIQUETAS_MODERACION } from '@/lib/moderacion';
import { MOTIVOS_OCULTAR, textoMotivoOcultar, textoMotivoRevision, FIRMA_CUENTA_ELIMINADA } from '@/lib/resenas';
import { fechaCorta, fechaLarga } from '@/lib/fechas';
import { leerDelAdmin } from '@/lib/moderarProducto';
import { EstrellasFijas } from '@/components/Estrellas';
import EtiquetasTienda from '@/components/admin/EtiquetasTienda';
import { ErrorDeLista, BOTON_NEGRO, BOTON_BORDE_NEGRO, BOTON_BORDE_GRIS } from '@/components/admin/comun';

const FILTROS = [
  { id: 'por_revisar', titulo: 'Por revisar' },
  { id: 'ocultas', titulo: 'Ocultas' },
];

const VACIO = {
  por_revisar: 'Nada para revisar. Las reseñas recientes pasaron limpias y ninguna tienda pidió revisar una.',
  ocultas: 'No hay reseñas ocultas.',
};

const ETIQUETA_AZUL = 'text-[11px] font-medium text-[#2a3fb8] bg-[#e8ecff] rounded-full px-2.5 py-0.5';
const ETIQUETA_NARANJA = 'text-[11px] font-medium text-[#8a3410] bg-[#fbe8da] rounded-full px-2.5 py-0.5';

async function moderarResena(id, cuerpo) {
  try {
    const res = await fetch(`/api/admin/resenas/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const datos = await res.json().catch(() => ({}));
    if (res.ok) return { resena: datos.resena };
    return { error: datos.error || 'Error inesperado.' };
  } catch {
    return { error: 'No pudimos conectarnos.' };
  }
}

// "¿Por qué la ocultás?"
function Ocultar({ enAccion, onConfirmar, onCancelar }) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="mt-3 p-3.5 border border-gray-200 rounded-lg bg-[#faf9f7]">
      <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">
        ¿Por qué la ocultás?
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
          className="mt-1.5 block w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-normal">
          <option value="">Elegí un motivo</option>
          {MOTIVOS_OCULTAR.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
        </select>
      </label>
      <p className="m-0 mt-2 text-xs text-gray-500">Una reseña negativa no es motivo para ocultarla.</p>
      <div className="flex gap-2 flex-wrap mt-3">
        <button type="button" className={BOTON_NEGRO} disabled={!motivo || enAccion} onClick={() => onConfirmar(motivo)}>
          {enAccion ? 'Ocultando...' : 'Ocultar reseña'}
        </button>
        <button type="button" className={BOTON_BORDE_GRIS} disabled={enAccion} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

// La confirmación de "Eliminar", dentro de la tarjeta.
function Eliminar({ enAccion, onConfirmar, onCancelar }) {
  return (
    <div className="mt-3 p-3.5 border border-red-200 rounded-lg bg-red-50">
      <p className="m-0 text-sm text-red-800">
        Se borra el texto para siempre y sale de esta lista. Quien la escribió no va a poder volver a reseñar este pedido.
      </p>
      <div className="flex gap-2 flex-wrap mt-3">
        <button type="button" className={BOTON_NEGRO} disabled={enAccion} onClick={onConfirmar}>
          {enAccion ? 'Eliminando...' : 'Eliminar'}
        </button>
        <button type="button" className={BOTON_BORDE_GRIS} disabled={enAccion} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function TarjetaResena({ r, ahora, enAccion, abierto, onAbrir, onActuar }) {
  const oculta = r.estado === 'oculta_por_moderacion';
  const eliminada = !!r.eliminada_en;
  const eliminableMs = Date.parse(r.eliminable_desde);
  const puedeEliminar = oculta && !eliminada && Number.isFinite(eliminableMs) && ahora >= eliminableMs;
  const tipos = [...new Set(r.avisos.map((t) => ETIQUETAS_MODERACION[t] || t))];

  let texto;
  if (eliminada) {
    texto = <p className="mt-3 mb-0 text-sm text-gray-400 italic">El texto se borró.</p>;
  } else if (!r.texto) {
    texto = <p className="mt-3 mb-0 text-sm text-gray-400 italic">Dejó solo las estrellas.</p>;
  } else if (r.marcada_por_filtro && r.fragmentos.length > 0) {
    // Lo que encontró el filtro, resaltado en su contexto.
    texto = (
      <div className="mt-3 flex flex-col gap-1.5">
        {r.fragmentos.map((f, i) => (
          <p key={i} className="m-0 text-sm text-gray-600 bg-[#f6f3ee] rounded-lg px-3 py-2 break-words">
            {f.antes}
            <mark className="bg-[#ffe7a8] text-[#0a0a0a] rounded px-0.5">{f.resaltado}</mark>
            {f.despues}
          </p>
        ))}
      </div>
    );
  } else {
    texto = <p className="mt-3 mb-0 text-sm text-gray-600 bg-[#f6f3ee] rounded-lg px-3 py-2 whitespace-pre-line break-words">“{r.texto}”</p>;
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="m-0 flex items-center gap-2 flex-wrap">
          <span className={`font-semibold ${r.apodo ? 'text-[#0a0a0a]' : 'text-gray-400'}`}>{r.apodo || FIRMA_CUENTA_ELIMINADA}</span>
          <EstrellasFijas valor={r.estrellas} tamano={14} />
        </p>
        <span className="flex items-center gap-1.5 flex-wrap">
          {oculta && !eliminada && <span className={ETIQUETA_NARANJA}>Oculta · {textoMotivoOcultar(r.oculta_motivo)}</span>}
          {eliminada && <span className={ETIQUETA_NARANJA}>Eliminada el {fechaCorta(r.eliminada_en)} · {textoMotivoOcultar(r.oculta_motivo)}</span>}
          {!oculta && !r.por_revisar && <span className="text-[11px] font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-0.5">Publicada</span>}
        </span>
      </div>
      <p className="mt-0.5 mb-0 text-sm text-gray-500 flex items-center flex-wrap gap-x-1.5 gap-y-1">
        <span>{fechaCorta(r.creado_en)} · {r.tienda.nombre_negocio}</span>
        <EtiquetasTienda vendedor={r.tienda} />
        {r.tienda.cerrada && <span className="text-[10px] font-medium text-gray-600 bg-gray-100 rounded-full px-[9px] py-[2px]">Tienda cerrada</span>}
        <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">Pedido #{r.pedido_id}</span>
      </p>

      {/* Por qué está en "Por revisar". */}
      {r.marcada_por_filtro && (
        <p className="mt-2 mb-0 flex items-center flex-wrap gap-x-2 gap-y-1">
          <span className={ETIQUETA_AZUL}>Marcada por el filtro</span>
          {tipos.map((t) => <span key={t} className="text-xs text-gray-500">{t}</span>)}
        </p>
      )}
      {r.pedido_tienda && (
        <div className="mt-2">
          <span className={ETIQUETA_NARANJA}>La tienda pidió revisarla · {textoMotivoRevision(r.pedido_tienda.motivo)}</span>
          {r.pedido_tienda.comentario && (
            <p className="m-0 mt-1.5 text-sm text-gray-600 whitespace-pre-line break-words">
              <span className="text-[11px] text-gray-400 mr-1.5">La tienda:</span>{r.pedido_tienda.comentario}
            </p>
          )}
        </div>
      )}

      {texto}

      {!eliminada && (
        <div className="flex gap-2 flex-wrap items-center mt-4">
          {r.por_revisar && (
            <button type="button" disabled={enAccion} className={BOTON_NEGRO}
              onClick={() => onActuar({ accion: 'revisada' }, 'No se pudo dar por revisada')}>
              {enAccion && !abierto ? 'Guardando...' : 'Dar por revisada'}
            </button>
          )}
          {!oculta && (
            <button type="button" disabled={enAccion} className={BOTON_BORDE_NEGRO} onClick={() => onAbrir('ocultar')}>
              Ocultar
            </button>
          )}
          {oculta && (
            <>
              <button type="button" disabled={enAccion}
                className="text-sm text-[#0a0a0a] underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer disabled:opacity-50"
                onClick={() => onActuar({ accion: 'mostrar' }, 'No se pudo volver a mostrar')}>
                {enAccion && !abierto ? 'Guardando...' : 'Volver a mostrar'}
              </button>
              {puedeEliminar ? (
                <button type="button" disabled={enAccion} className={`${BOTON_BORDE_NEGRO} ml-2`} onClick={() => onAbrir('eliminar')}>
                  Eliminar
                </button>
              ) : (
                Number.isFinite(eliminableMs) && (
                  <span className="text-xs text-gray-400 ml-2">Podés eliminarla desde el {fechaLarga(r.eliminable_desde)}</span>
                )
              )}
            </>
          )}
        </div>
      )}

      {abierto === 'ocultar' && !oculta && (
        <Ocultar enAccion={enAccion}
          onConfirmar={(motivo) => onActuar({ accion: 'ocultar', motivo }, 'No se pudo ocultar')}
          onCancelar={() => onAbrir(null)} />
      )}
      {abierto === 'eliminar' && puedeEliminar && (
        <Eliminar enAccion={enAccion}
          onConfirmar={() => onActuar({ accion: 'eliminar' }, 'No se pudo eliminar')}
          onCancelar={() => onAbrir(null)} />
      )}
    </div>
  );
}

export default function ResenasDenunciadas({ onCambioConteo }) {
  const [filtro, setFiltro] = useState('por_revisar');
  const [resenas, setResenas] = useState([]);
  const [conteos, setConteos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ahora, setAhora] = useState(0);
  const [procesando, setProcesando] = useState(null);
  // { id, que: 'ocultar' | 'eliminar' } lo desplegado en una tarjeta.
  const [abierto, setAbierto] = useState(null);
  // La búsqueda por pedido: null mientras no se busca.
  const [busqueda, setBusqueda] = useState('');
  const [buscado, setBuscado] = useState(null);

  const pedir = (cual, pedido) => leerDelAdmin(
    pedido ? `/api/admin/resenas?pedido=${encodeURIComponent(pedido)}` : `/api/admin/resenas?filtro=${cual}`,
    pedido ? 'No se pudo buscar la reseña.' : 'No se pudieron cargar las reseñas.'
  // La hora de la respuesta: de ella depende si ya se puede eliminar.
  ).then((r) => ({ ...r, horaRespuesta: Date.now() }));

  // Lo que respondió el servidor (nunca una lista vacía si falló).
  function aplicar({ datos, error: fallo, horaRespuesta }) {
    setError(fallo || null);
    if (!fallo) {
      setResenas(datos.resenas || []);
      if (datos.conteos) {
        setConteos(datos.conteos);
        onCambioConteo?.(datos.conteos.por_revisar ?? null);
      }
      setAhora(horaRespuesta);
    }
    setCargando(false);
  }

  async function cargar(cual, pedido = null) {
    setCargando(true);
    setAbierto(null);
    aplicar(await pedir(cual, pedido));
  }

  function elegirFiltro(cual) {
    setFiltro(cual);
    setBuscado(null);
    setBusqueda('');
    cargar(cual);
  }

  function buscar(evento) {
    evento.preventDefault();
    const pedido = busqueda.trim().replace(/^#/, '');
    if (!/^\d+$/.test(pedido)) { setError(null); setBuscado(pedido || null); setResenas([]); return; }
    setBuscado(pedido);
    cargar(filtro, pedido);
  }

  function limpiarBusqueda() {
    setBuscado(null);
    setBusqueda('');
    cargar(filtro);
  }

  // La primera vista, al abrir la pestaña.
  useEffect(() => { pedir('por_revisar').then(aplicar); }, []);

  async function actuar(r, cuerpo, textoError) {
    setProcesando(r.id);
    const { error: fallo } = await moderarResena(r.id, cuerpo);
    setProcesando(null);
    if (fallo) { alert(`${textoError}: ${fallo}`); return; }
    // Se recarga lo que se está viendo: cambian la lista y los contadores.
    // Buscando, también se refrescan los contadores de la pestaña.
    if (buscado) {
      await cargar(filtro, buscado);
      pedir(filtro).then(({ datos }) => {
        if (datos?.conteos) { setConteos(datos.conteos); onCambioConteo?.(datos.conteos.por_revisar ?? null); }
      });
    } else {
      await cargar(filtro);
    }
  }

  const buscando = buscado !== null;
  const busquedaInvalida = buscando && !/^\d+$/.test(buscado);

  return (
    <>
      <p className="text-gray-500 mt-6 mb-0 text-sm">
        Las reseñas que marcó el filtro o que una tienda pidió revisar. Siguen publicadas hasta que decidas.
      </p>

      <form onSubmit={buscar} className="mt-4 flex flex-wrap items-center gap-2" role="search">
        <label htmlFor="buscar-pedido" className="sr-only">Buscar por número de pedido</label>
        <input id="buscar-pedido" type="text" inputMode="numeric" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número de pedido"
          className="w-56 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" />
        <button type="submit" className={BOTON_BORDE_GRIS}>Buscar</button>
        {buscando && (
          <button type="button" onClick={limpiarBusqueda}
            className="text-sm text-gray-500 underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer">
            Volver a la lista
          </button>
        )}
      </form>

      {!buscando && (
        <div className="flex gap-2 flex-wrap mt-4" role="group" aria-label="Qué reseñas ver">
          {FILTROS.map((f) => {
            const activo = filtro === f.id;
            const n = conteos ? conteos[f.id] : null;
            return (
              <button key={f.id} type="button" aria-pressed={activo} onClick={() => elegirFiltro(f.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
                  activo ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'bg-white text-gray-600 border-gray-300 hover:border-[#0a0a0a]'
                }`}>
                {f.titulo}{n !== null && n !== undefined ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>
      )}

      {busquedaInvalida ? (
        <p className="mt-6 text-sm text-gray-500">Escribí un número de pedido.</p>
      ) : cargando ? (
        <p className="mt-8 text-center text-gray-400">Cargando...</p>
      ) : error ? (
        <ErrorDeLista titulo={buscando ? 'No pudimos buscar la reseña' : 'No pudimos cargar las reseñas'} error={error}
          onReintentar={() => cargar(filtro, buscando ? buscado : null)} />
      ) : resenas.length === 0 ? (
        <div className="mt-8 px-8 py-12 text-center border border-dashed border-gray-300 rounded-xl text-gray-500">
          <p className="text-lg m-0">{buscando ? 'Ese pedido no tiene reseña.' : VACIO[filtro]}</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {resenas.map((r) => (
            <TarjetaResena key={r.id} r={r} ahora={ahora}
              enAccion={procesando === r.id}
              abierto={abierto?.id === r.id ? abierto.que : null}
              onAbrir={(que) => setAbierto(que ? { id: r.id, que } : null)}
              onActuar={(cuerpo, textoError) => actuar(r, cuerpo, textoError)} />
          ))}
        </div>
      )}
    </>
  );
}
