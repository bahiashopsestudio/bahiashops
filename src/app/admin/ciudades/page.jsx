'use client';

// Las ciudades que anotó la gente que todavía no puede abrir su tienda. Solo se
// miran: se borran cuando la persona elimina su cuenta.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';

const FECHA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
});

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
          <p className="text-gray-500 mt-1 mb-0 text-sm">Quienes quieren sumarse desde una ciudad donde todavía no estamos.</p>
        </div>

        {error && (
          <p className="mt-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {!error && ciudades.length === 0 ? (
            <p className="text-sm text-gray-400">Todavía nadie anotó una ciudad.</p>
          ) : (
            ciudades.map((c) => (
              <div key={c.usuario_id} className="border border-gray-200 rounded-xl p-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="m-0 flex-1 min-w-[180px] text-sm font-medium text-[#0a0a0a] break-words">{c.ciudad}</p>
                <p className="m-0 text-sm text-gray-500 break-all">{c.email}</p>
                <p className="m-0 text-xs text-gray-400 whitespace-nowrap">{FECHA.format(new Date(c.actualizado_en))}</p>
              </div>
            ))
          )}
        </div>
      </main>
    </>
  );
}
