'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';

const BADGE_TIPO = {
  temporada: 'bg-amber-100 text-amber-700',
  curada: 'bg-blue-100 text-blue-700',
  tematica: 'bg-purple-100 text-purple-700',
};

const LABEL_TIPO = {
  temporada: 'Temporada',
  curada: 'Curada',
  tematica: 'Temática',
};

function formatearFecha(fecha) {
  if (!fecha) return '';
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

export default function ColeccionesAdminPage() {
  const supabase = createClient();
  const router = useRouter();

  const [esAdmin, setEsAdmin] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [colecciones, setColecciones] = useState([]);
  const [procesando, setProcesando] = useState(null);

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
      await cargar();
      setCargando(false);
    }
    iniciar();
  }, []);

  async function cargar() {
    const res = await fetch('/api/admin/colecciones');
    const data = await res.json();
    if (res.ok) setColecciones(data.colecciones || []);
  }

  async function toggleActiva(coleccion) {
    setProcesando(coleccion.id);
    const res = await fetch(`/api/admin/colecciones/${coleccion.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !coleccion.activa }),
    });
    if (res.ok) {
      setColecciones((prev) =>
        prev.map((c) => (c.id === coleccion.id ? { ...c, activa: !c.activa } : c))
      );
    } else {
      const data = await res.json();
      alert(data.error || 'No se pudo actualizar.');
    }
    setProcesando(null);
  }

  async function mover(index, direccion) {
    const destino = index + direccion;
    if (destino < 0 || destino >= colecciones.length) return;

    const actual = colecciones[index];
    const otro = colecciones[destino];

    setProcesando(actual.id);

    const [resA, resB] = await Promise.all([
      fetch(`/api/admin/colecciones/${actual.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden: otro.orden }),
      }),
      fetch(`/api/admin/colecciones/${otro.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden: actual.orden }),
      }),
    ]);

    if (resA.ok && resB.ok) {
      const nuevas = [...colecciones];
      nuevas[index] = { ...otro, orden: actual.orden };
      nuevas[destino] = { ...actual, orden: otro.orden };
      setColecciones(nuevas);
    } else {
      alert('No se pudo reordenar.');
    }
    setProcesando(null);
  }

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-[#0a0a0a]/30 text-sm font-light">Cargando...</main>
      </>
    );
  }

  if (!esAdmin) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center">
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Acceso restringido</h1>
          <p className="text-[#0a0a0a]/40 font-light">Esta página es solo para administradores.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar variant="solid" />

      <main className="pt-28 pb-16 px-6 max-w-4xl w-full mx-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight m-0">Colecciones</h1>
            <p className="text-[#0a0a0a]/40 font-light mt-1 mb-0 text-sm">
              Cápsulas y agrupaciones curadas de productos
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/admin/colecciones/nueva')}
            className="px-5 py-2.5 bg-[#0a0a0a] text-white rounded-full text-sm font-medium cursor-pointer hover:bg-[#1a1a1a] transition-colors"
          >
            Nueva colección
          </button>
        </div>

        {colecciones.length === 0 ? (
          <div className="px-8 py-14 text-center border border-dashed border-[#0a0a0a]/10 rounded-2xl">
            <p className="text-[#0a0a0a]/40 font-light">Todavía no creaste ninguna colección.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {colecciones.map((c, index) => {
              const enAccion = procesando === c.id;
              return (
                <div key={c.id} className="rounded-2xl border border-[#0a0a0a]/5 p-4 flex items-center gap-4">
                  {/* Flechas de orden */}
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => mover(index, -1)}
                      disabled={index === 0 || enAccion}
                      className="w-6 h-6 flex items-center justify-center rounded border border-[#0a0a0a]/10 text-[#0a0a0a]/40 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer hover:border-[#0a0a0a]/30"
                      aria-label="Subir"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(index, 1)}
                      disabled={index === colecciones.length - 1 || enAccion}
                      className="w-6 h-6 flex items-center justify-center rounded border border-[#0a0a0a]/10 text-[#0a0a0a]/40 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer hover:border-[#0a0a0a]/30"
                      aria-label="Bajar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>

                  {/* Miniatura */}
                  <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-[#F5F2EC] flex items-center justify-center">
                    {c.imagen_url ? (
                      <img src={c.imagen_url} alt={c.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-[#0a0a0a]/20 font-light">sin foto</span>
                    )}
                  </div>

                  {/* Info — click para editar */}
                  <Link href={`/admin/colecciones/${c.id}`} className="flex-1 min-w-0 group">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="m-0 font-medium text-[#0a0a0a] group-hover:text-[#0a0a0a]/60 transition-colors">{c.nombre}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_TIPO[c.tipo] || 'bg-gray-100 text-gray-600'}`}>
                        {LABEL_TIPO[c.tipo] || c.tipo}
                      </span>
                    </div>
                    <p className="mt-1 mb-0 text-[11px] text-[#0a0a0a]/25 font-light">
                      {c.productos_count} {c.productos_count === 1 ? 'producto' : 'productos'}
                      {c.tipo === 'temporada' && c.fecha_inicio && (
                        <> · {formatearFecha(c.fecha_inicio)}{c.fecha_fin ? ` – ${formatearFecha(c.fecha_fin)}` : ''}</>
                      )}
                    </p>
                  </Link>

                  {/* Toggle activa/inactiva */}
                  <button
                    type="button"
                    onClick={() => toggleActiva(c)}
                    disabled={enAccion}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer border ${
                      c.activa
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-[#0a0a0a]/5 text-[#0a0a0a]/40 border-transparent hover:bg-[#0a0a0a]/10'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {c.activa ? 'Activa' : 'Inactiva'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
