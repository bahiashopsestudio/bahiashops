'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function FormularioDireccion({ onGuardada, onCancelar, esPrimera = false }) {
  const supabase = createClient();

  const [etiqueta, setEtiqueta] = useState('');
  const [calle, setCalle] = useState('');
  const [numero, setNumero] = useState('');
  const [pisoDepto, setPisoDepto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [telefono, setTelefono] = useState('');
  const [guardar, setGuardar] = useState(true);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(e) {
    e.preventDefault();

    // Validación mínima: lo imprescindible para una entrega.
    if (!calle.trim() || !numero.trim() || !telefono.trim()) {
      alert('Completá al menos calle, número y teléfono.');
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
        es_principal: esPrimera, // la primera dirección queda como principal
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

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.9rem' }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Calle *</label>
          <input style={inputStyle} value={calle} onChange={(e) => setCalle(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Número *</label>
          <input style={inputStyle} value={numero} onChange={(e) => setNumero(e.target.value)} />
        </div>
      </div>

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