'use client';

// Las ciudades que nos piden, desde el alta de tienda y desde Local Shops. Solo
// se miran: las del alta se borran cuando la persona elimina su cuenta.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';

const FECHA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
});

// Las columnas, iguales en el encabezado y en las filas. En el celular cada fila
// se apila, y cada dato lleva su nombre.
const COLUMNAS = 'md:grid md:grid-cols-[105px_1.2fr_0.8fr_1.6fr_105px] md:gap-3 md:items-baseline';

function Dato({ nombre, children, className = '' }) {
  return (
    <p className={`m-0 text-sm break-words ${className}`}>
      <span className="md:hidden text-gray-400">{nombre}: </span>
      {children || <span className="text-gray-300">—</span>}
    </p>
  );
}

export default function CiudadesPedidasPage() {
  const supabase = createClient();

  const [esAdmin, setEsAdmin] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ciudades, setCiudades] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEsAdmin(false); setCargando(false); return; }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single();

      if (!perfil?.es_admin) { setEsAdmin(false); setCargando(false); return; }

      setEsAdmin(true);
      try {
        const res = await fetch('/api/admin/ciudades');
        const cuerpo = await res.json().catch(() => ({}));
        if (res.ok) setCiudades(cuerpo.ciudades || []);
        else setError(cuerpo.error || 'No pudimos cargar las ciudades.');
      } catch {
        setError('No pudimos cargar las ciudades.');
      }
      setCargando(false);
    }
    iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-gray-400">Cargando...</main>
      </>
    );
  }

  if (!esAdmin) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center">
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Acceso restringido</h1>
          <p className="text-gray-500">Esta página es solo para administradores.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[820px] w-full mx-auto">
        <div>
          <h1 className="text-2xl font-semibold text-[#0a0a0a] m-0">Ciudades pedidas</h1>
          <p className="text-gray-500 mt-1 mb-0 text-sm">Desde dónde nos piden: el alta de tienda y el formulario de Local Shops.</p>
        </div>

        {error && (
          <p className="mt-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {!error && ciudades.length === 0 ? (
            <p className="text-sm text-gray-400">Todavía nadie anotó una ciudad.</p>
          ) : (
            <>
              {ciudades.length > 0 && (
                <div className={`hidden ${COLUMNAS} px-4 text-xs text-gray-400`}>
                  <span>Origen</span>
                  <span>Ciudad</span>
                  <span>Provincia</span>
                  <span>Mail</span>
                  <span>Fecha</span>
                </div>
              )}
              {ciudades.map((c) => (
                <div key={c.clave} className={`border border-gray-200 rounded-xl p-4 flex flex-col gap-1 ${COLUMNAS}`}>
                  <Dato nombre="Origen" className="text-gray-500">{c.origen}</Dato>
                  <Dato nombre="Ciudad" className="font-medium text-[#0a0a0a]">{c.ciudad}</Dato>
                  <Dato nombre="Provincia" className="text-gray-500">{c.provincia}</Dato>
                  <Dato nombre="Mail" className="text-gray-500 break-all">{c.email}</Dato>
                  <Dato nombre="Fecha" className="text-xs text-gray-400 whitespace-nowrap">{FECHA.format(new Date(c.fecha))}</Dato>
                </div>
              ))}
            </>
          )}
        </div>
      </main>
    </>
  );
}
