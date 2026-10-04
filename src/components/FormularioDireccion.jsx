'use client';

// Una dirección de quien compra: en Bahía Blanca (con barrio) o en cualquier
// otra ciudad de Argentina (con ciudad y provincia, sin barrio). Siempre con
// código postal y con su punto en el mapa: el punto es lo que se usa para
// calcular el envío. Las reglas están en src/lib/direcciones.js.

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import {
  PROVINCIAS, CIUDAD_BAHIA, PROVINCIA_BAHIA, errorDireccion, esDeBahia, normalizarCodigoPostal,
} from '@/lib/direcciones';

const MapaUbicacion = dynamic(
  () => import('@/app/vendedor/nuevo/MapaUbicacion'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] bg-[#F5F2EC] rounded-lg flex items-center justify-center text-gray-400 text-sm">
        Cargando mapa...
      </div>
    ),
  }
);

const inputClasses =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[0.95rem] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors box-border';

const CENTRO_BAHIA = { lat: -38.7183, lng: -62.2663 };
const CENTRO_ARGENTINA = { lat: -38.4, lng: -63.6 };

// Búsqueda estructurada, como la de la ubicación de las tiendas: calle y
// número por un lado, ciudad y provincia por otro. Devuelve { lat, lng,
// codigoPostal } o null. addressdetails trae el código postal cuando lo sabe.
async function buscarEnNominatim({ calle, numero, ciudad, provincia }) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    country: 'Argentina',
    city: ciudad,
    state: provincia,
  });
  if (calle) params.set('street', `${numero} ${calle}`.trim());
  const respuesta = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString());
  const datos = await respuesta.json();
  if (!datos || datos.length === 0) return null;
  return {
    lat: parseFloat(datos[0].lat),
    lng: parseFloat(datos[0].lon),
    codigoPostal: datos[0].address?.postcode || null,
  };
}

export default function FormularioDireccion({ onGuardada, onCancelar, esPrimera = false, direccionExistente = null }) {
  const supabase = createClient();
  const editando = !!direccionExistente;
  const d = direccionExistente;

  // Una dirección que se edita arranca con lo guardado. Las viejas (antes de
  // la 021) no tienen ciudad: si tienen barrio, son de Bahía.
  const [enBahia, setEnBahia] = useState(d ? esDeBahia(d) || !d.ciudad : true);
  const [etiqueta, setEtiqueta] = useState(d?.etiqueta || '');
  const [calle, setCalle] = useState(d?.calle || '');
  const [numero, setNumero] = useState(d?.numero || '');
  const [ciudad, setCiudad] = useState(d && !esDeBahia(d) ? d.ciudad || '' : '');
  const [provincia, setProvincia] = useState(d && !esDeBahia(d) ? d.provincia || '' : '');
  const [codigoPostal, setCodigoPostal] = useState(d?.codigo_postal || '');
  const [pisoDepto, setPisoDepto] = useState(d?.piso_depto || '');
  const [referencia, setReferencia] = useState(d?.referencia || '');
  const [telefono, setTelefono] = useState(d?.telefono || '');
  const [enviando, setEnviando] = useState(false);

  const tienePuntoGuardado = d?.lat != null && d?.lng != null;
  const [mostrarMapa, setMostrarMapa] = useState(tienePuntoGuardado);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const [posicionBuscada, setPosicionBuscada] = useState(
    tienePuntoGuardado ? { lat: d.lat, lng: d.lng, zoom: 16, nonce: 1 } : null
  );
  const [barrioId, setBarrioId] = useState(d?.barrio_id || null);
  const [barrioNombre, setBarrioNombre] = useState('');
  const [latitud, setLatitud] = useState(d?.lat ?? null);
  const [longitud, setLongitud] = useState(d?.lng ?? null);

  const [barrios, setBarrios] = useState([]);
  const [mostrarFallback, setMostrarFallback] = useState(false);

  // El nombre del barrio guardado, para mostrarlo.
  useEffect(() => {
    if (!d?.barrio_id) return;
    let cancelado = false;
    async function cargarNombreBarrio() {
      const { data } = await supabase.from('barrios').select('nombre').eq('id', d.barrio_id).single();
      if (!cancelado && data) setBarrioNombre(data.nombre);
    }
    cargarNombreBarrio();
    return () => { cancelado = true; };
  }, [d?.barrio_id]);

  // Cambiar entre Bahía y otra ciudad borra el punto: hay que volver a ubicar.
  function cambiarEnBahia(valor) {
    if (valor === enBahia) return;
    setEnBahia(valor);
    setLatitud(null);
    setLongitud(null);
    setBarrioId(null);
    setBarrioNombre('');
    setMostrarFallback(false);
    setMostrarMapa(false);
    setPosicionBuscada(null);
  }

  async function buscarDireccion() {
    if (!calle.trim() || !numero.trim()) {
      alert('Completá calle y número para buscar en el mapa.');
      return;
    }
    if (!enBahia && (!ciudad.trim() || !provincia)) {
      alert('Completá la ciudad y la provincia para buscar en el mapa.');
      return;
    }

    setBuscandoDireccion(true);
    setMostrarMapa(true);

    const donde = enBahia
      ? { ciudad: CIUDAD_BAHIA, provincia: PROVINCIA_BAHIA }
      : { ciudad: ciudad.trim(), provincia };
    try {
      const encontrada = await buscarEnNominatim({ calle: calle.trim(), numero: numero.trim(), ...donde });
      if (encontrada) {
        setPosicionBuscada({ lat: encontrada.lat, lng: encontrada.lng, zoom: 16, nonce: Date.now() });
        if (!codigoPostal.trim() && encontrada.codigoPostal) setCodigoPostal(normalizarCodigoPostal(encontrada.codigoPostal));
        return;
      }
      // Sin la calle, al menos la ciudad, para arrastrar el pin desde ahí.
      const soloCiudad = enBahia ? null : await buscarEnNominatim({ ...donde });
      const centro = soloCiudad || (enBahia ? CENTRO_BAHIA : CENTRO_ARGENTINA);
      setPosicionBuscada({ lat: centro.lat, lng: centro.lng, zoom: soloCiudad || enBahia ? 13 : 5, nonce: Date.now() });
      alert('No encontramos esa dirección exacta. Ubicá tu casa arrastrando el pin en el mapa.');
    } catch (err) {
      console.error('Error buscando dirección:', err);
      alert('No se pudo buscar la dirección. Probá de nuevo.');
    } finally {
      setBuscandoDireccion(false);
    }
  }

  function alCambiarUbicacion({ lat, lng, barrioDetectado }) {
    setLatitud(lat);
    setLongitud(lng);
    if (!enBahia) return;

    if (barrioDetectado) {
      setBarrioId(barrioDetectado.id);
      setBarrioNombre(barrioDetectado.nombre);
      setMostrarFallback(false);
    } else {
      setBarrioId(null);
      setBarrioNombre('');
      setMostrarFallback(true);
    }
  }

  useEffect(() => {
    if (!mostrarFallback || barrios.length > 0) return;
    async function cargar() {
      const { data } = await supabase
        .from('barrios')
        .select('id, nombre')
        .order('nombre');
      if (data) setBarrios(data);
    }
    cargar();
  }, [mostrarFallback]);

  async function manejarSubmit(e) {
    e.preventDefault();

    const problema = errorDireccion({
      enBahia, calle, numero, telefono, ciudad, provincia, codigoPostal,
      barrioId, lat: latitud, lng: longitud,
    });
    if (problema) {
      alert(problema);
      return;
    }

    setEnviando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Tenés que iniciar sesión.');
        setEnviando(false);
        return;
      }

      const campos = {
        etiqueta: etiqueta.trim() || null,
        calle: calle.trim(),
        numero: numero.trim(),
        piso_depto: pisoDepto.trim() || null,
        referencia: referencia.trim() || null,
        telefono: telefono.trim(),
        // En otra ciudad no hay barrio: es lo que dice que no es de Bahía.
        barrio_id: enBahia ? Number(barrioId) : null,
        ciudad: enBahia ? CIUDAD_BAHIA : ciudad.trim().replace(/\s+/g, ' '),
        provincia: enBahia ? PROVINCIA_BAHIA : provincia,
        codigo_postal: normalizarCodigoPostal(codigoPostal),
        lat: latitud,
        lng: longitud,
      };

      let resultado;

      if (editando) {
        // Actualizar dirección existente
        const { data, error } = await supabase
          .from('direcciones')
          .update(campos)
          .eq('id', direccionExistente.id)
          .select()
          .single();
        if (error) throw error;
        resultado = data;
      } else {
        // Crear nueva
        const { data, error } = await supabase
          .from('direcciones')
          .insert({
            ...campos,
            usuario_id: user.id,
            es_principal: esPrimera,
          })
          .select()
          .single();
        if (error) throw error;
        resultado = data;
      }

      if (onGuardada) onGuardada(resultado);
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar la dirección: ' + (err.message || 'error'));
    } finally {
      setEnviando(false);
    }
  }

  const claseOpcion = (activa) =>
    `flex-1 py-2.5 rounded-lg text-sm border transition-colors cursor-pointer ${
      activa ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'bg-white text-[#0a0a0a]/60 border-gray-300 hover:border-[#0a0a0a]'
    }`;

  return (
    <form onSubmit={manejarSubmit}>
      {/* ¿Bahía u otra ciudad? */}
      <div className="mb-3.5">
        <span className="block text-sm text-gray-500 mb-1">¿La dirección es en Bahía Blanca?</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => cambiarEnBahia(true)} className={claseOpcion(enBahia)}>
            Sí, en Bahía Blanca
          </button>
          <button type="button" onClick={() => cambiarEnBahia(false)} className={claseOpcion(!enBahia)}>
            No, en otra ciudad
          </button>
        </div>
      </div>

      {/* Etiqueta */}
      <div className="mb-3.5">
        <label className="block text-sm text-gray-500 mb-1">Etiqueta (personal, solo la ves vos)</label>
        <input className={inputClasses} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Casa, Trabajo, Casa de mamá" />
      </div>

      {/* Provincia + Ciudad (otra ciudad) */}
      {!enBahia && (
        <div className="flex gap-3 mb-3.5">
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-gray-500 mb-1">Provincia *</label>
            <select className={`${inputClasses} bg-white`} value={provincia} onChange={(e) => setProvincia(e.target.value)}>
              <option value="">Elegí la provincia</option>
              {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-gray-500 mb-1">Ciudad *</label>
            <input className={inputClasses} value={ciudad} maxLength={80} onChange={(e) => setCiudad(e.target.value)} placeholder="Punta Alta" />
          </div>
        </div>
      )}

      {/* Calle + Número */}
      <div className="flex gap-3 mb-2">
        <div className="flex-[2]">
          <label className="block text-sm text-gray-500 mb-1">Calle *</label>
          <input className={inputClasses} value={calle} onChange={(e) => setCalle(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="block text-sm text-gray-500 mb-1">Número *</label>
          <input className={inputClasses} value={numero} onChange={(e) => setNumero(e.target.value)} />
        </div>
      </div>

      {/* Botón ubicar */}
      <button
        type="button"
        onClick={buscarDireccion}
        disabled={buscandoDireccion}
        className={`w-full py-2.5 border border-[#0a0a0a] rounded-lg bg-white text-[#0a0a0a] text-sm flex items-center justify-center gap-1.5 mb-3.5 transition-colors ${
          buscandoDireccion ? 'cursor-wait opacity-50' : 'cursor-pointer hover:bg-[#0a0a0a] hover:text-white'
        }`}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
        {buscandoDireccion ? 'Buscando...' : (mostrarMapa ? 'Volver a ubicar' : 'Ubicar en el mapa')}
      </button>

      {/* Mapa */}
      {mostrarMapa && (
        <div className="mb-3.5">
          <MapaUbicacion
            key={enBahia ? 'bahia' : 'otra'}
            posicionBuscada={posicionBuscada}
            onUbicacionChange={alCambiarUbicacion}
            conBarrios={enBahia}
          />

          {enBahia && barrioNombre && (
            <div className="mt-2 px-3 py-2 bg-[#F5F2EC] rounded-lg text-sm text-[#0a0a0a] flex items-center gap-1.5">
              📍 Barrio detectado: <strong>{barrioNombre}</strong>
            </div>
          )}

          {enBahia && mostrarFallback && !barrioNombre && (
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-1">
                No pudimos detectar tu barrio automáticamente. Elegilo de la lista:
              </p>
              <select
                className={`${inputClasses} bg-white`}
                value={barrioId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const barrio = barrios.find(b => b.id === id);
                  setBarrioId(id || null);
                  setBarrioNombre(barrio?.nombre || '');
                }}
              >
                <option value="">Elegí tu barrio</option>
                {barrios.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-1.5">
            Si la ubicación no es exacta, arrastrá el pin hasta tu puerta.
          </p>
        </div>
      )}

      {/* Código postal */}
      <div className="mb-3.5">
        <label className="block text-sm text-gray-500 mb-1">Código postal *</label>
        <input className={inputClasses} value={codigoPostal} maxLength={10}
          onChange={(e) => setCodigoPostal(e.target.value)} placeholder={enBahia ? '8000' : '8109 o B8109ABC'} />
      </div>

      {/* Piso / depto */}
      <div className="mb-3.5">
        <label className="block text-sm text-gray-500 mb-1">Piso / depto (opcional)</label>
        <input className={inputClasses} value={pisoDepto} onChange={(e) => setPisoDepto(e.target.value)} />
      </div>

      {/* Referencia */}
      <div className="mb-3.5">
        <label className="block text-sm text-gray-500 mb-1">Referencia (opcional)</label>
        <input className={inputClasses} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Casa de rejas verdes" />
      </div>

      {/* Teléfono */}
      <div className="mb-3.5">
        <label className="block text-sm text-gray-500 mb-1">Teléfono de contacto para esta entrega *</label>
        <input className={inputClasses} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="291 512-3456" />
      </div>

      {esPrimera && (
        <p className="text-xs text-gray-400 mb-4">
          Esta primera dirección queda como tu principal.
        </p>
      )}

      {/* Botones */}
      <div className="flex gap-3 mt-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} disabled={enviando}
            className="px-5 py-3 border border-gray-300 rounded-lg bg-white cursor-pointer hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={enviando}
          className={`flex-1 py-3 border-none rounded-lg text-white text-[0.95rem] transition-colors ${
            enviando ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
          }`}>
          {enviando ? 'Guardando...' : (editando ? 'Guardar cambios' : 'Guardar dirección')}
        </button>
      </div>
    </form>
  );
}
