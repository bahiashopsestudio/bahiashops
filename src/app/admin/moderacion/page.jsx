'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { leerDelAdmin } from '@/lib/moderarProducto';
import Navbar from '@/components/Navbar';
import ProductosNuevos from './ProductosNuevos';
import RevisarDespues from './RevisarDespues';

// Dos pestañas: "Productos nuevos" (la cola de siempre) y "Revisar después"
// (ya aprobados que se editaron con algo dudoso). Las dos leen del servidor
// (/api/admin/moderacion): desde el navegador el admin no ve las fotos de un
// producto que no está publicado (RLS). ?pestana=revisar abre la segunda.
const PESTANAS = [
  { id: 'nuevos', titulo: 'Productos nuevos' },
  { id: 'revisar', titulo: 'Revisar después' },
];

export default function ModeracionPage() {
  const supabase = createClient();

  const [esAdmin, setEsAdmin] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState('nuevos');
  const [listas, setListas] = useState({ nuevos: [], revisar: [] });
  const [errores, setErrores] = useState({ nuevos: null, revisar: null });

  useEffect(() => {
    async function iniciar() {
      try {
        if (new URLSearchParams(window.location.search).get('pestana') === 'revisar') setPestana('revisar');
      } catch { /* sin URL: queda la primera */ }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEsAdmin(false); setCargando(false); return; }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single();

      if (!perfil?.es_admin) { setEsAdmin(false); setCargando(false); return; }

      setEsAdmin(true);
      await Promise.all([cargar('nuevos'), cargar('revisar')]);
      setCargando(false);
    }
    iniciar();
  }, []);

  async function cargar(cual) {
    const url = cual === 'revisar' ? '/api/admin/moderacion?vista=revisar' : '/api/admin/moderacion';
    const { datos, error } = await leerDelAdmin(url, 'No se pudo cargar la cola de moderación.');
    setErrores((e) => ({ ...e, [cual]: error || null }));
    if (!error) setListas((l) => ({ ...l, [cual]: datos.productos || [] }));
  }

  function elegir(id) {
    setPestana(id);
    try {
      const url = new URL(window.location.href);
      if (id === 'revisar') url.searchParams.set('pestana', 'revisar');
      else url.searchParams.delete('pestana');
      window.history.replaceState(null, '', url);
    } catch { /* no importa */ }
  }

  const quitar = (cual) => (id) => setListas((l) => ({ ...l, [cual]: l[cual].filter((p) => p.id !== id) }));
  const reintentar = (cual) => async () => { setCargando(true); await cargar(cual); setCargando(false); };

  // ── Estados de carga ──

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
        <h1 className="text-2xl font-semibold text-[#0a0a0a] m-0">Moderación</h1>

        {/* Pestañas */}
        <div role="tablist" className="flex gap-1 mt-5 border-b border-gray-200">
          {PESTANAS.map((t) => {
            const activa = pestana === t.id;
            const cantidad = errores[t.id] ? null : listas[t.id].length;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => elegir(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 bg-transparent text-sm cursor-pointer transition-colors ${
                  activa ? 'border-[#0a0a0a] text-[#0a0a0a] font-semibold' : 'border-transparent text-gray-500 hover:text-[#0a0a0a]'
                }`}
              >
                {t.titulo}
                {cantidad !== null && (
                  <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                    t.id === 'revisar' ? 'bg-[#e8ecff] text-[#2a3fb8]' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {cantidad}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {pestana === 'nuevos' ? (
          <ProductosNuevos productos={listas.nuevos} error={errores.nuevos} onReintentar={reintentar('nuevos')} onQuitar={quitar('nuevos')} />
        ) : (
          <RevisarDespues productos={listas.revisar} error={errores.revisar} onReintentar={reintentar('revisar')} onQuitar={quitar('revisar')} />
        )}
      </main>
    </>
  );
}
