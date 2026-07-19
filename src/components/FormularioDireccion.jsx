'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

// Leaflet no funciona en SSR → importamos el mapa dinámicamente
const MapaUbicacion = dynamic(
  () => import('@/app/vendedor/nuevo/MapaUbicacion'),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: '300px', background: '#f5f5f5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '0.9rem' }}>
        Cargando mapa...
      </div>
    ),
  }
);

export default function FormularioDireccion({ onGuardada, onCancelar, esPrimera = false }) {
  const supabase = createClient();

  const [etiqueta, setEtiqueta] = useState('');
  const [calle, setCalle] = useState('');
  const [numero, setNumero] = useState('');
  const [pisoDepto, setPisoDepto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Estado del mapa y barrio
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const [posicionBuscada, setPosicionBuscada] = useState(null);
  const [barrioId, setBarrioId] = useState(null);
  const [barrioNombre, setBarrioNombre] = useState('');
  const [latitud, setLatitud] = useState(null);
  const [longitud, setLongitud] = useState(null);

  // Fallback: lista de barrios por si la detección automática no funciona
  const [barrios, setBarrios] = useState([]);
  const [mostrarFallback, setMostrarFallback] = useState(false);

  // ── Geocoding: busca la dirección con Nominatim y muestra el mapa ──
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
        // No encontró la dirección → mostrar mapa centrado en Bahía Blanca
        // para que ubique manualmente
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

  // ── Callback del mapa: recibe la ubicación y el barrio detectado ──
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
      // Si el pin cayó fuera de todos los barrios, ofrecer selector manual
      setMostrarFallback(true);
    }
  }

  // ── Cargar barrios para el fallback (solo si se necesita) ──
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

  // ── Guardar la dirección ──
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

      const nuevaDireccion = {
        usuario_id: user.id,
        etiqueta: etiqueta.trim() || null,
        calle: calle.trim(),
        numero: numero.trim(),
        piso_depto: pisoDepto.trim() || null,
        referencia: referencia.trim() || null,
        telefono: telefono.trim(),
        barrio_id: Number(barrioId),
        lat: latitud,
        lng: longitud,
        es_principal: esPrimera,
      };

      const { data, error } = await supabase
        .from('direcciones')
        .insert(nuevaDireccion)
        .select()
        .single();

      if (error) throw error;

      if (onGuardada) onGuardada(data);
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar la dirección: ' + (err.message || 'error'));
    } finally {
      setEnviando(false);
    }
  }

  const labelStyle = { display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.3rem' };
  const inputStyle = { width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #ccc', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' };

  return (
    <form onSubmit={manejarSubmit}>
      <div style={{ marginBottom: '0.9rem' }}>
        <label style={labelStyle}>Etiqueta (personal, solo la ves vos)</label>
        <input style={inputStyle} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Casa, Trabajo, Casa de mamá" />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Calle *</label>
          <input style={inputStyle} value={calle} onChange={(e) => setCalle(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Número *</label>
          <input style={inputStyle} value={numero} onChange={(e) => setNumero(e.target.value)} />
        </div>
      </div>

      {/* Botón para ubicar en el mapa */}
      <button
        type="button"
        onClick={buscarDireccion}
        disabled={buscandoDireccion}
        style={{
          width: '100%', padding: '0.6rem', border: '1px solid #2563eb',
          borderRadius: '8px', background: 'white', color: '#2563eb',
          fontSize: '0.85rem', cursor: buscandoDireccion ? 'wait' : 'pointer',
          marginBottom: '0.9rem', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '0.4rem',
        }}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
        {buscandoDireccion ? 'Buscando...' : 'Ubicar en el mapa'}
      </button>

      {/* Mapa (se muestra después de buscar) */}
      {mostrarMapa && (
        <div style={{ marginBottom: '0.9rem' }}>
          <MapaUbicacion
            posicionBuscada={posicionBuscada}
            onUbicacionChange={alCambiarUbicacion}
          />

          {/* Barrio detectado */}
          {barrioNombre && (
            <div style={{
              marginTop: '0.5rem', padding: '0.5rem 0.75rem',
              background: '#e6f0ff', borderRadius: '8px',
              fontSize: '0.85rem', color: '#1a5fb4',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
              📍 Barrio detectado: <strong>{barrioNombre}</strong>
            </div>
          )}

          {/* Si no se detectó barrio, ofrecer selector manual */}
          {mostrarFallback && !barrioNombre && (
            <div style={{ marginTop: '0.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 0.3rem' }}>
                No pudimos detectar tu barrio automáticamente. Elegilo de la lista:
              </p>
              <select
                style={inputStyle}
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

          <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.4rem 0 0' }}>
            Si la ubicación no es exacta, arrastrá el pin hasta tu puerta.
          </p>
        </div>
      )}

      <div style={{ marginBottom: '0.9rem' }}>
        <label style={labelStyle}>Piso / depto (opcional)</label>
        <input style={inputStyle} value={pisoDepto} onChange={(e) => setPisoDepto(e.target.value)} />
      </div>

      <div style={{ marginBottom: '0.9rem' }}>
        <label style={labelStyle}>Referencia (opcional)</label>
        <input style={inputStyle} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Casa de rejas verdes" />
      </div>

      <div style={{ marginBottom: '0.9rem' }}>
        <label style={labelStyle}>Teléfono de contacto para esta entrega *</label>
        <input style={inputStyle} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="291 512-3456" />
      </div>

      {esPrimera && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 1rem' }}>
          Esta primera dirección queda como tu principal.
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        {onCancelar && (
          <button type="button" onClick={onCancelar} disabled={enviando}
            style={{ padding: '0.7rem 1.2rem', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
            Cancelar
          </button>
        )}
        <button type="submit" disabled={enviando}
          style={{ flex: 1, padding: '0.7rem 1.2rem', border: 'none', borderRadius: '8px', background: enviando ? '#999' : '#222', color: 'white', cursor: enviando ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}>
          {enviando ? 'Guardando...' : 'Guardar dirección'}
        </button>
      </div>
    </form>
  );
}
