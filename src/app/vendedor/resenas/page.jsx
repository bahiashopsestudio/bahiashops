'use client';

// Las reseñas de la tienda (/api/vendedor/resenas): el puntaje como lo ve la
// gente, cuántas tiene, cuántas llegaron en los últimos 7 días, y la lista
// igual que la pública, con el pedido de cada una y "Pedir revisión"
// (PedirRevision). Las que ocultó la moderación no aparecen: si alguna se
// ocultó después de pedirla, una línea lo dice, sin el texto. Responder
// llega más adelante.

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';
import ListaResenas from '@/components/ListaResenas';
import PedirRevision from '@/components/PedirRevision';
import { textoPromedio } from '@/lib/resenas';

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage'];

function Tarjeta({ valor, texto }) {
  return (
    <div className="flex-1 min-w-[140px] rounded-2xl border border-[#0a0a0a]/5 px-4 py-4">
      <p className="m-0 text-[22px] text-[#0a0a0a] leading-tight" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>{valor}</p>
      <p className="m-0 mt-1 text-xs text-[#0a0a0a]/45 font-light leading-snug">{texto}</p>
    </div>
  );
}

export default function MisResenasPage() {
  const supabase = createClient();
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);

  async function cargar() {
    setError(null);
    try {
      const res = await fetch('/api/vendedor/resenas');
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(cuerpo?.resenas)) {
        setError(cuerpo?.error || 'No pudimos cargar tus reseñas. Probá de nuevo en un rato.');
      } else {
        setDatos(cuerpo);
      }
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
    }
  }

  useEffect(() => {
    async function iniciar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden');
      if (cats) setCategorias(cats);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/entrar?next=%2Fvendedor%2Fresenas'); return; }
      await cargar();
      setCargando(false);
    }
    iniciar();
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean);
  const puntaje = datos?.puntaje || { cantidad: 0, promedio: null };

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&family=Poppins:wght@300&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />

            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight m-0">Reseñas</h1>
            {datos?.tienda && (
              <p className="text-sm text-[#0a0a0a]/40 font-light mt-1 mb-0">{datos.tienda} · lo que dicen quienes te compraron</p>
            )}

            {cargando ? (
              <p className="mt-8 text-sm text-[#0a0a0a]/30 font-light">Cargando tus reseñas...</p>
            ) : error ? (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                <p className="m-0">{error}</p>
                <button type="button" onClick={async () => { setCargando(true); await cargar(); setCargando(false); }}
                  className="mt-3 px-4 py-2 border border-red-700 rounded-lg bg-white text-red-700 text-sm cursor-pointer">
                  Reintentar
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 mt-6">
                  {puntaje.promedio !== null ? (
                    <Tarjeta valor={`${textoPromedio(puntaje.promedio)} ★`} texto="Tu puntaje, como lo ve la gente" />
                  ) : (
                    <Tarjeta valor="Tienda nueva" texto="Tu puntaje se publica desde las 5 reseñas" />
                  )}
                  <Tarjeta valor={String(puntaje.cantidad)} texto="Reseñas" />
                  <Tarjeta valor={String(datos.nuevasSemana)} texto="Nuevas esta semana" />
                </div>

                <div className="mt-8">
                  {datos.ocultadasPedidas > 0 && (
                    <p className="m-0 mb-3 text-xs text-[#0a0a0a]/45 font-light">
                      {datos.ocultadasPedidas === 1
                        ? 'Ocultamos 1 reseña que pediste revisar.'
                        : `Ocultamos ${datos.ocultadasPedidas} reseñas que pediste revisar.`}
                    </p>
                  )}
                  {datos.resenas.length === 0 ? (
                    <div className="px-6 py-10 text-center border border-dashed border-[#0a0a0a]/10 rounded-2xl">
                      <p className="m-0 text-sm text-[#0a0a0a]/45 font-light leading-relaxed">
                        Todavía no tenés reseñas. Quien te compra puede dejar la suya cuando marcás el pedido como entregado.
                      </p>
                    </div>
                  ) : (
                    <ListaResenas inicial={datos.resenas} hayMasInicial={datos.hayMas} conPedido
                      extra={(r) => <PedirRevision resena={r} />}
                      urlPagina={(desde) => `/api/vendedor/resenas?desde=${desde}`} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
