'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

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

export default function FormularioDireccion({ onGuardada, onCancelar, esPrimera = false, direccionExistente = null }) {
  const supabase = createClient();
  const editando = !!direccionExistente;

  const [etiqueta, setEtiqueta] = useState('');
  const [calle, setCalle] = useState('');
  const [numero, setNumero] = useState('');
  const [pisoDepto, setPisoDepto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [mostrarMapa, setMostrarMapa] = useState(false);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const [posicionBuscada, setPosicionBuscada] = useState(null);
  const [barrioId, setBarrioId] = useState(null);
  const [barrioNombre, setBarrioNombre] = useState('');
  const [latitud, setLatitud] = useState(null);
  const [longitud, setLongitud] = useState(null);

  const [barrios, setBarrios] = useState([]);
  const [mostrarFallback, setMostrarFallback] = useState(false);

  // ── Pre-llenar campos si estamos editando ──
  useEffect(() => {
    if (!direccionExistente) return;

    setEtiqueta(direccionExistente.etiqueta || '');
    setCalle(direccionExistente.calle || '');
    setNumero(direccionExistente.numero || '');
    setPisoDepto(direccionExistente.piso_depto || '');
    setReferencia(direccionExistente.referencia || '');
    setTelefono(direccionExistente.telefono || '');
    setBarrioId(direccionExistente.barrio_id || null);
    setLatitud(direccionExistente.lat || null);
    setLongitud(direccionExistente.lng || null);

    // Si tiene coordenadas, mostrar el mapa con la posición guardada
    if (direccionExistente.lat && direccionExistente.lng) {
      setMostrarMapa(true);
      setPosicionBuscada({
        lat: direccionExistente.lat,
        lng: direccionExistente.lng,
        zoom: 16,
        nonce: Date.now(),
      });
    }

    // Cargar el nombre del barrio
    if (direccionExistente.barrio_id) {
      cargarNombreBarrio(direccionExistente.barrio_id);
    }
  }, [direccionExistente]);

  async function cargarNombreBarrio(id) {
    const { data } = await supabase
      .from('barrios')
      .select('nombre')
      .eq('id', id)
      .single();
    if (data) setBarrioNombre(data.nombre);
  }

  async function buscarDireccion() {
    if (!calle.trim() || !numero.trim()) {
      alert('Completá calle y número para buscar en el mapa.');
      return;
    }

    setBuscandoDireccion(true);
    setMostrarMapa(true);

    const query = `${calle.trim()} ${numero.trim()}, Bahía Blanca, Buenos Aires, Argentina`;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
      );
      const data = await res.json();

      if (data.length > 0) {
        setPosicionBuscada({
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          zoom: 16,
          nonce: Date.now(),
        });
      } else {
        setPosicionBuscada({
          lat: -38.7183,
          lng: -62.2663,
          zoom: 13,
          nonce: Date.now(),
        });
        alert('No encontramos esa dirección exacta. Ubicá tu casa manualmente arrastrando el pin en el mapa.');
      }
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

    if (!calle.trim() || !numero.trim() || !telefono.trim()) {
      alert('Completá al menos calle, número y teléfono.');
      return;
    }

    if (!barrioId) {
      alert('Necesitamos saber tu barrio para calcular el costo de envío. Usá el botón "Ubicar en el mapa" o elegí tu barrio manualmente.');
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
        barrio_id: Number(barrioId),
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

  return (
    <form onSubmit={manejarSubmit}>
      {/* Etiqueta */}
      <div className="mb-3.5">
        <label className="block text-sm text-gray-500 mb-1">Etiqueta (personal, solo la ves vos)</label>
        <input className={inputClasses} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Casa, Trabajo, Casa de mamá" />
      </div>

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
        {buscandoDireccion ? 'Buscando...' : (editando && mostrarMapa ? 'Volver a ubicar' : 'Ubicar en el mapa')}
      </button>

      {/* Mapa */}
      {mostrarMapa && (
        <div className="mb-3.5">
          <MapaUbicacion
            posicionBuscada={posicionBuscada}
            onUbicacionChange={alCambiarUbicacion}
          />

          {barrioNombre && (
            <div className="mt-2 px-3 py-2 bg-[#F5F2EC] rounded-lg text-sm text-[#0a0a0a] flex items-center gap-1.5">
              📍 Barrio detectado: <strong>{barrioNombre}</strong>
            </div>
          )}

          {mostrarFallback && !barrioNombre && (
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