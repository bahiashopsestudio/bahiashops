'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';

function IconoCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function IconoBasura() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

export default function IdeasPendientesPage() {
  const supabase = createClient();

  const [esAdmin, setEsAdmin] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ideas, setIdeas] = useState([]);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);

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
      await cargarIdeas();
      setCargando(false);
    }
    iniciar();
  }, []);

  async function cargarIdeas() {
    const res = await fetch('/api/admin/ideas');
    if (!res.ok) return;
    const { ideas } = await res.json();
    setIdeas(ideas || []);
  }

  async function agregarIdea(e) {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio || guardando) return;

    setGuardando(true);
    const res = await fetch('/api/admin/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: limpio }),
    });

    if (res.ok) {
      const { idea } = await res.json();
      setIdeas((prev) => [idea, ...prev]);
      setTexto('');
    } else {
      alert('No se pudo guardar la idea.');
    }
    setGuardando(false);
  }

  async function marcarHecha(id) {
    setProcesandoId(id);
    const res = await fetch(`/api/admin/ideas/${id}`, { method: 'PATCH' });
    if (res.ok) {
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    } else {
      alert('No se pudo marcar como hecha.');
    }
    setProcesandoId(null);
  }

  async function descartar(id) {
    setProcesandoId(id);
    const res = await fetch(`/api/admin/ideas/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    } else {
      alert('No se pudo descartar.');
    }
    setProcesandoId(null);
  }

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
          <h1 className="text-2xl font-semibold text-[#0a0a0a] m-0">Ideas pendientes</h1>
          <p className="text-gray-500 mt-1 mb-0 text-sm">Cosas para retomar más adelante, para no perderlas de vista.</p>
        </div>

        <form onSubmit={agregarIdea} className="mt-6 flex gap-2">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Anotá una idea..."
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors text-sm"
          />
          <button
            type="submit"
            disabled={!texto.trim() || guardando}
            className={`px-4 py-2 border-none rounded-lg text-white text-sm transition-colors ${
              !texto.trim() || guardando ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#0a0a0a]/80'
            }`}
          >
            Agregar
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3">
          {ideas.length === 0 ? (
            <p className="text-sm text-gray-400">No hay ideas pendientes.</p>
          ) : (
            ideas.map((idea) => {
              const enAccion = procesandoId === idea.id;
              return (
                <div key={idea.id} className="border border-gray-200 rounded-xl p-4 flex items-start gap-3">
                  <p className="m-0 flex-1 text-sm text-[#0a0a0a]">{idea.texto}</p>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => marcarHecha(idea.id)}
                      disabled={enAccion}
                      title="Marcar como hecha"
                      aria-label="Marcar como hecha"
                      className={`w-8 h-8 flex items-center justify-center rounded-lg border border-emerald-700 text-emerald-700 transition-colors ${
                        enAccion ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-emerald-50'
                      }`}
                    >
                      <IconoCheck />
                    </button>
                    <button
                      type="button"
                      onClick={() => descartar(idea.id)}
                      disabled={enAccion}
                      title="Descartar"
                      aria-label="Descartar"
                      className={`w-8 h-8 flex items-center justify-center rounded-lg border border-red-700 text-red-700 transition-colors ${
                        enAccion ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-red-50'
                      }`}
                    >
                      <IconoBasura />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </>
  );
}
