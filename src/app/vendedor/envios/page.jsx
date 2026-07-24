'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import VolverAtras from '@/components/VolverAtras';

const ZONAS = [
  { key: 'zona_1', nombre: 'Tu barrio', descripcion: 'Mismo barrio que tu negocio' },
  { key: 'zona_2', nombre: 'Barrios cercanos', descripcion: 'Hasta 3 km' },
  { key: 'zona_3', nombre: 'Zona media', descripcion: 'Hasta 7 km' },
  { key: 'zona_4', nombre: 'Zona lejana', descripcion: 'Más de 7 km' },
];

const ZONAS_CORREO = [
  { key: 'correo_1', nombre: 'Zona 1', descripcion: 'Buenos Aires, Córdoba, Entre Ríos, La Pampa, Santa Fe' },
  { key: 'correo_2', nombre: 'Zona 2', descripcion: 'Mendoza, San Luis, San Juan, Neuquén, Río Negro, La Rioja' },
  { key: 'correo_3', nombre: 'Zona 3', descripcion: 'Tucumán, Salta, Jujuy, Catamarca, Chaco, Corrientes, Formosa, Misiones, Sgo. del Estero' },
  { key: 'correo_4', nombre: 'Zona 4', descripcion: 'Chubut, Santa Cruz, Tierra del Fuego' },
];

const inputPrecioClasses =
  'w-[120px] py-2 pr-3 pl-6 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors';

export default function EnviosPage() {
  const supabase = createClient();

  const [vendedorId, setVendedorId] = useState(null);
  const [cargando, setCargando] = useState(true);

  const [metodosActivos, setMetodosActivos] = useState([]);
  const [costosZona, setCostosZona] = useState({});
  const [costosCorreo, setCostosCorreo] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCargando(false); return; }

      const { data, error } = await supabase
        .from('vendedores')
        .select('id, metodos_entrega_default, costos_envio_zona')
        .eq('usuario_id', user.id)
        .single();

      if (error) {
        console.error('Error cargando vendedor:', error);
        setCargando(false);
        return;
      }

      if (data) {
        setVendedorId(data.id);
        setMetodosActivos(data.metodos_entrega_default || []);

        const costos = data.costos_envio_zona || {};
        setCostosZona({
          zona_1: costos.zona_1 != null ? String(costos.zona_1) : '',
          zona_2: costos.zona_2 != null ? String(costos.zona_2) : '',
          zona_3: costos.zona_3 != null ? String(costos.zona_3) : '',
          zona_4: costos.zona_4 != null ? String(costos.zona_4) : '',
        });
        setCostosCorreo({
          correo_1: costos.correo_1 != null ? String(costos.correo_1) : '',
          correo_2: costos.correo_2 != null ? String(costos.correo_2) : '',
          correo_3: costos.correo_3 != null ? String(costos.correo_3) : '',
          correo_4: costos.correo_4 != null ? String(costos.correo_4) : '',
        });
      }

      setCargando(false);
    }
    cargar();
  }, []);

  function toggleMetodo(metodo) {
    setGuardado(false);
    setMetodosActivos(prev =>
      prev.includes(metodo) ? prev.filter(m => m !== metodo) : [...prev, metodo]
    );
  }

  function actualizarCostoZona(zona, valor) {
    setGuardado(false);
    setCostosZona(prev => ({ ...prev, [zona]: valor.replace(/\D/g, '') }));
  }

  function formatearPrecio(valor) {
    if (!valor) return '';
    return Number(valor).toLocaleString('es-AR');
  }

  async function guardar() {
    setGuardando(true);

    const costosParaGuardar = {};

    if (metodosActivos.includes('cadeteria')) {
      ZONAS.forEach(z => {
        const valor = costosZona[z.key];
        costosParaGuardar[z.key] = valor !== '' ? Number(valor) : null;
      });
    }

    if (metodosActivos.includes('correo')) {
      ZONAS_CORREO.forEach(z => {
        const valor = costosCorreo[z.key];
        costosParaGuardar[z.key] = valor !== '' ? Number(valor) : null;
      });
    }

    const { error } = await supabase
      .from('vendedores')
      .update({
        metodos_entrega_default: metodosActivos,
        costos_envio_zona: costosParaGuardar,
      })
      .eq('id', vendedorId);

    if (error) {
      alert('No se pudieron guardar los costos de envío: ' + error.message);
    } else {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
    }
    setGuardando(false);
  }

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-gray-500">Cargando...</main>
      </>
    );
  }

  if (!vendedorId) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-gray-500">No encontramos tu cuenta de vendedor.</main>
      </>
    );
  }

  return (
    <>
      <Navbar variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[700px] w-full mx-auto">
        <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />
        <h1 className="text-2xl font-semibold text-[#0a0a0a] mt-2">Costos de envío</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8 leading-relaxed">
          Elegí qué métodos de envío ofrecés y cuánto cobrás. Los costos de cadetería se calculan automáticamente según la distancia entre tu barrio y el del comprador.
        </p>

        {/* ═══ RETIRO ═══ */}
        <div
          onClick={() => toggleMetodo('retiro')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer mb-3 transition-colors ${
            metodosActivos.includes('retiro')
              ? 'border-2 border-[#0a0a0a]'
              : 'border border-gray-200 hover:border-gray-300'
          }`}
        >
          <input type="checkbox" checked={metodosActivos.includes('retiro')} readOnly
            className="w-[18px] h-[18px] accent-[#0a0a0a]" />
          <div className="flex-1">
            <div className="font-medium text-[#0a0a0a]">Retiro en el local</div>
            <div className="text-xs text-gray-400">El comprador retira en tu dirección</div>
          </div>
          <span className="text-sm text-emerald-700 font-medium">Gratis</span>
        </div>

        {/* ═══ CADETERÍA ═══ */}
        <div className={`rounded-lg mb-3 transition-colors ${
          metodosActivos.includes('cadeteria')
            ? 'border-2 border-[#0a0a0a]'
            : 'border border-gray-200 hover:border-gray-300'
        }`}>
          <div onClick={() => toggleMetodo('cadeteria')}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer">
            <input type="checkbox" checked={metodosActivos.includes('cadeteria')} readOnly
              className="w-[18px] h-[18px] accent-[#0a0a0a]" />
            <div className="flex-1">
              <div className="font-medium text-[#0a0a0a]">Cadetería</div>
              <div className="text-xs text-gray-400">Envíos dentro de Bahía Blanca. Vos elegís con quién envías, con una app de envíos o cadetería propia.</div>
            </div>
          </div>

          {metodosActivos.includes('cadeteria') && (
            <div className="px-4 pb-4 ml-10">
              <p className="text-xs text-gray-400 mb-3">
                Definí el costo para cada zona. Dejá vacío si no enviás a alguna de ellas.
              </p>
              {ZONAS.map(zona => (
                <div key={zona.key} className="flex items-center gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#0a0a0a]">{zona.nombre}</div>
                    <div className="text-xs text-gray-400">{zona.descripcion}</div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatearPrecio(costosZona[zona.key])}
                      onChange={(e) => actualizarCostoZona(zona.key, e.target.value)}
                      placeholder="—"
                      className={inputPrecioClasses}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ CORREO ═══ */}
        <div className={`rounded-lg mb-3 transition-colors ${
          metodosActivos.includes('correo')
            ? 'border-2 border-[#0a0a0a]'
            : 'border border-gray-200 hover:border-gray-300'
        }`}>
          <div onClick={() => toggleMetodo('correo')}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer">
            <input type="checkbox" checked={metodosActivos.includes('correo')} readOnly
              className="w-[18px] h-[18px] accent-[#0a0a0a]" />
            <div className="flex-1">
              <div className="font-medium text-[#0a0a0a]">Envíos a otras localidades por Correo</div>
              <div className="text-xs text-gray-400">Pueblos y ciudades de la zona</div>
            </div>
          </div>

          {metodosActivos.includes('correo') && (
            <div className="px-4 pb-4 ml-10">
              <p className="text-xs text-gray-400 mb-3">
                Definí el costo para cada zona. Dejá vacío si no enviás a esa zona.
              </p>
              {ZONAS_CORREO.map(zona => (
                <div key={zona.key} className="flex items-center gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#0a0a0a]">{zona.nombre}</div>
                    <div className="text-xs text-gray-400">{zona.descripcion}</div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatearPrecio(costosCorreo[zona.key])}
                      onChange={(e) => {
                        setGuardado(false);
                        setCostosCorreo(prev => ({ ...prev, [zona.key]: e.target.value.replace(/\D/g, '') }));
                      }}
                      placeholder="—"
                      className={inputPrecioClasses}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ ACORDAR ═══ */}
        <div
          onClick={() => toggleMetodo('acordar')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer mb-8 transition-colors ${
            metodosActivos.includes('acordar')
              ? 'border-2 border-[#0a0a0a]'
              : 'border border-gray-200 hover:border-gray-300'
          }`}
        >
          <input type="checkbox" checked={metodosActivos.includes('acordar')} readOnly
            className="w-[18px] h-[18px] accent-[#0a0a0a]" />
          <div className="flex-1">
            <div className="font-medium text-[#0a0a0a]">Acordar con el comprador</div>
            <div className="text-xs text-gray-400">Coordinás el envío por WhatsApp después de la compra</div>
          </div>
          <span className="text-sm text-gray-400">Sin costo fijo</span>
        </div>

        {/* ═══ GUARDAR ═══ */}
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className={`px-6 py-3 text-base text-white border-none rounded-lg transition-colors ${
            guardado
              ? 'bg-emerald-700 cursor-default'
              : guardando
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
          }`}
        >
          {guardando ? 'Guardando...' : (guardado ? '✓ Guardado' : 'Guardar cambios')}
        </button>
      </main>
    </>
  );
}
