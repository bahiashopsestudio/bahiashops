'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import FormularioDireccion from '@/components/FormularioDireccion';

export default function MisDireccionesPage() {
  const supabase = createClient();

  const [direcciones, setDirecciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargarDirecciones() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCargando(false); return; }

    const { data, error } = await supabase
      .from('direcciones')
      .select('*')
      .eq('usuario_id', user.id)
      .order('creada_en', { ascending: true });

    if (error) console.error('Error cargando direcciones:', error);
    else setDirecciones(data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargarDirecciones();
  }, []);

  // Cuando el formulario guarda una dirección, la sumamos a la lista y cerramos el form.
  function alGuardar(nueva) {
    setDirecciones((actual) => [...actual, nueva]);
    setMostrarForm(false);
  }

  if (cargando) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</main>;
  }

  const noTieneNinguna = direcciones.length === 0;

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', width: '100%', margin: '0 auto' }}>
      <h1>Mis direcciones</h1>
      <p style={{ color: '#666', margin: '0.25rem 0 1.5rem' }}>
        Guardá tus direcciones para usarlas al comprar.
      </p>

      {/* Lista de direcciones guardadas */}
      {direcciones.map((dir) => (
        <div key={dir.id} style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <strong>{dir.etiqueta || 'Sin etiqueta'}</strong>
            {dir.es_principal && (
              <span style={{ fontSize: '0.75rem', background: '#e6f0ff', color: '#1a5fb4', padding: '2px 8px', borderRadius: '20px' }}>
                Principal
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#555', lineHeight: 1.5 }}>
            {dir.calle} {dir.numero}{dir.piso_depto ? `, ${dir.piso_depto}` : ''}<br />
            {dir.referencia && <span style={{ color: '#888' }}>{dir.referencia}<br /></span>}
            Tel. {dir.telefono}
          </p>
        </div>
      ))}

      {/* Botón para agregar / formulario */}
      {mostrarForm ? (
        <div style={{ border: '1px solid #ddd', borderRadius: '12px', padding: '1.25rem', marginTop: '0.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>Nueva dirección</h2>
          <FormularioDireccion
            esPrimera={noTieneNinguna}
            onGuardada={alGuardar}
            onCancelar={() => setMostrarForm(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMostrarForm(true)}
          style={{ width: '100%', padding: '0.8rem', border: '1px dashed #aaa', borderRadius: '8px', background: 'none', color: '#1a5fb4', fontSize: '0.95rem', cursor: 'pointer', marginTop: '0.5rem' }}
        >
          + Agregar dirección
        </button>
      )}
    </main>
  );
}