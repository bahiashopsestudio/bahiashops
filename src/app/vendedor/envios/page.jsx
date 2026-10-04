'use client';

// "Cómo entregás": la única pantalla del panel donde la tienda elige sus
// formas de entrega y sus precios. El bloque es el mismo del alta
// (BloqueEntrega) y se guarda por /api/vendedor/entrega.

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';
import BloqueEntrega, { entregaDesdeVendedor, errorEntrega, guardarEntrega } from '@/components/BloqueEntrega';

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage'];

export default function EnviosPage() {
  const supabase = createClient();
  const router = useRouter();

  const [vendedorId, setVendedorId] = useState(null);
  const [cargando, setCargando] = useState(true);

  const [entrega, setEntrega] = useState(null);
  const [tienda, setTienda] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen]);

  useEffect(() => {
    async function cargarCats() {
      const { data } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden');
      if (data) setCategorias(data);
    }
    cargarCats();
  }, []);

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/entrar?next=%2Fvendedor%2Fenvios'); return; }

      const { data, error } = await supabase
        .from('vendedores')
        .select('id, metodos_entrega_default, costos_envio_zona, direccion_visible, direccion, latitud, longitud')
        .eq('usuario_id', user.id)
        .single();

      if (error) { console.error('Error cargando vendedor:', error); setCargando(false); return; }

      if (data) {
        setVendedorId(data.id);
        setEntrega(entregaDesdeVendedor(data));
        setTienda({
          direccionVisible: data.direccion_visible,
          direccion: data.direccion,
          tienePunto: data.latitud !== null && data.longitud !== null,
        });
      }
      setCargando(false);
    }
    cargar();
  }, []);

  function cambiar(valor) {
    setGuardado(false);
    setError(null);
    setEntrega(valor);
  }

  async function guardar() {
    const problema = errorEntrega(entrega, { tienePunto: tienda.tienePunto });
    if (problema) { setError(problema); return; }

    setGuardando(true);
    setError(null);
    const resultado = await guardarEntrega(entrega);
    setGuardando(false);
    if (!resultado.ok) { setError(resultado.error); return; }
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean);

  if (cargando) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    );
  }

  if (!vendedorId) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">No encontramos tu cuenta de vendedor.</span>
        </div>
      </>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />

            <h1 className="text-[26px] md:text-[30px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', marginBottom: '8px' }}>
              Cómo entregás
            </h1>

            <BloqueEntrega valor={entrega} onChange={cambiar} tienda={tienda} enlaceUbicacion />

            {error && (
              <div className="mt-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className={`mt-6 px-6 py-2.5 text-sm text-white border-none rounded-full font-medium transition-colors ${
                guardado
                  ? 'bg-emerald-600 cursor-default'
                  : guardando
                    ? 'bg-[#0a0a0a]/30 cursor-not-allowed'
                    : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
              }`}
            >
              {guardando ? 'Guardando...' : (guardado ? '✓ Guardado' : 'Guardar cambios')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
