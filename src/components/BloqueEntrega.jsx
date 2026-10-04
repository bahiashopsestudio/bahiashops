'use client'

// "Cómo entregás": qué formas de entrega ofrece la tienda y, en las que van
// por zona, cuánto cobra en cada una. Es el mismo bloque en el alta (paso 3,
// obligatorio) y en /vendedor/envios.
//
// No escribe en la base: le cuenta al padre lo que hay (onChange) y el padre
// lo guarda con guardarEntrega(), que va a /api/vendedor/entrega. Los métodos,
// las zonas y las reglas salen de src/lib/metodosEntrega.js.

import {
  METODOS, ORDEN_METODOS, metodosGuardados, validarEntrega, precioDeZona,
} from '@/lib/metodosEntrega'
import { fuenteAyuda, ayudaClasses } from '@/lib/estilosVendedor'

const inputPrecioClasses =
  'w-[120px] py-2 pr-3 pl-6 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors'

// Lo que el bloque necesita a partir de la fila de vendedores. Los nombres
// viejos se traducen; los precios pasan a texto para los campos.
export function entregaDesdeVendedor(vendedor) {
  const costos = {}
  for (const id of ORDEN_METODOS) {
    for (const zona of METODOS[id].zonas || []) {
      const precio = precioDeZona(vendedor?.costos_envio_zona, zona.clave)
      costos[zona.clave] = precio === null ? '' : String(precio)
    }
  }
  return { metodos: metodosGuardados(vendedor?.metodos_entrega_default), costos }
}

export const ENTREGA_VACIA = entregaDesdeVendedor(null)

// Lo que se le manda al servidor: los precios como números.
function paraMandar(valor) {
  const costos = {}
  for (const [clave, texto] of Object.entries(valor.costos || {})) {
    if (texto !== '' && texto !== null && texto !== undefined) costos[clave] = Number(texto)
  }
  return { metodos: valor.metodos, costos }
}

// Revisa antes de mandar, con la misma regla que el servidor. Devuelve el
// error para mostrar, o null.
export function errorEntrega(valor, { tienePunto }) {
  const resultado = validarEntrega({ ...paraMandar(valor), tienePunto })
  return resultado.ok ? null : resultado.error
}

// Guarda lo que armó el bloque. Devuelve { ok, error }.
export async function guardarEntrega(valor) {
  try {
    const res = await fetch('/api/vendedor/entrega', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paraMandar(valor)),
    })
    const cuerpo = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: cuerpo.error || 'No pudimos guardar tus formas de entrega.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'No pudimos guardar tus formas de entrega. Revisá tu conexión.' }
  }
}

// "Retiro · Envío de la tienda (zonas 1 a 3)": cómo lo va a ver quien compra.
function resumen(valor) {
  const partes = []
  for (const id of ORDEN_METODOS) {
    if (!valor.metodos.includes(id)) continue
    const metodo = METODOS[id]
    if (metodo.costo !== 'por_zona') { partes.push(metodo.comprador); continue }
    const conPrecio = metodo.zonas.filter((z) => (valor.costos[z.clave] ?? '') !== '').map((z) => z.zona)
    if (conPrecio.length === 0) continue
    const zonas = conPrecio.length === 1 ? `zona ${conPrecio[0]}` : `zonas ${conPrecio.join(', ')}`
    partes.push(`${metodo.comprador} (${zonas})`)
  }
  return partes.join(' · ')
}

function formatear(texto) {
  if (texto === '' || texto === null || texto === undefined) return ''
  return Number(texto).toLocaleString('es-AR')
}

function Tarjeta({ activo, deshabilitado, onToggle, titulo, detalle, etiqueta, children }) {
  return (
    <div className={`rounded-2xl mb-3 transition-all ${
      activo ? 'border-2 border-[#0a0a0a]' : 'border border-[#0a0a0a]/10 hover:border-[#0a0a0a]/20'
    } ${deshabilitado ? 'opacity-60' : ''}`}>
      <label className={`flex items-start gap-3 px-4 py-3.5 ${deshabilitado ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input type="checkbox" checked={activo} disabled={deshabilitado} onChange={onToggle}
          className="w-[18px] h-[18px] mt-0.5 accent-[#0a0a0a]" />
        <span className="flex-1">
          <span className="block text-sm font-medium text-[#0a0a0a]">{titulo}</span>
          <span className={`block mt-0.5 ${ayudaClasses} text-[#0a0a0a]/60`} style={fuenteAyuda}>{detalle}</span>
        </span>
        {etiqueta && <span className="text-xs text-emerald-700 font-medium shrink-0 mt-0.5">{etiqueta}</span>}
      </label>
      {children}
    </div>
  )
}

function Zonas({ metodo, valor, onPrecio, nombreZona }) {
  const sinPrecios = metodo.zonas.every((z) => (valor.costos[z.clave] ?? '') === '')
  return (
    <div className="px-4 pb-4 ml-[30px]">
      {metodo.zonas.map((zona) => {
        const texto = valor.costos[zona.clave] ?? ''
        return (
          <div key={zona.clave} className="flex items-center gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#0a0a0a]">Zona {zona.zona} · {nombreZona(zona).titulo}</div>
              {(nombreZona(zona).detalle || texto === '0') && (
                <div className="text-[12px] text-[#0a0a0a]/45 font-light">
                  {nombreZona(zona).detalle}
                  {texto === '0' && (
                    <span className="text-emerald-700">{nombreZona(zona).detalle ? ' · ' : ''}Envío gratis</span>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#0a0a0a]/30 text-sm">$</span>
              <input type="text" inputMode="numeric" aria-label={`Precio zona ${zona.zona}`}
                value={formatear(texto)}
                onChange={(e) => onPrecio(zona.clave, e.target.value.replace(/\D/g, ''))}
                placeholder="No llego" className={inputPrecioClasses} />
            </div>
          </div>
        )
      })}
      {sinPrecios && (
        <p className="mt-2 mb-0 p-2.5 rounded-lg bg-amber-50 text-[12px] text-amber-800 font-light">
          Cargá al menos un precio: sin precios no se puede guardar esta opción.
        </p>
      )}
    </div>
  )
}

// valor: { metodos: [...ids], costos: { clave: 'texto' } }
// tienda: { direccionVisible, direccion, tienePunto }
//   tienePunto: la tienda tiene su punto en el mapa (desde ahí se mide).
// enlaceUbicacion: muestra el link a /vendedor/ubicacion (en el panel sí, en
//   el alta no: la ubicación es el paso anterior).
export default function BloqueEntrega({ valor, onChange, tienda = {}, enlaceUbicacion = false }) {
  const { direccionVisible, direccion, tienePunto } = tienda

  function alternar(id) {
    const metodos = valor.metodos.includes(id)
      ? valor.metodos.filter((m) => m !== id)
      : ORDEN_METODOS.filter((m) => m === id || valor.metodos.includes(m))
    onChange({ ...valor, metodos })
  }

  function cambiarPrecio(clave, texto) {
    onChange({ ...valor, costos: { ...valor.costos, [clave]: texto.replace(/^0+(?=\d)/, '') } })
  }

  const detalleRetiro = direccionVisible === false
    ? 'Tu dirección no se muestra en Bahía Shops: coordinás por WhatsApp dónde y cuándo lo retiran.'
    : direccionVisible === true && direccion
      ? `Quien compra lo busca en ${direccion}.`
      : 'Quien compra lo busca en tu local o domicilio.'

  // "Zona 2 · Hasta 30 cuadras": a la tienda se le habla en cuadras.
  const zonaTienda = (zona) => ({ titulo: zona.nombre, detalle: '' })
  const zonaCorreo = (zona) => ({ titulo: zona.detalle, detalle: '' })

  const textoResumen = resumen(valor)

  return (
    <div>
      <p className={`mt-0 mb-5 ${ayudaClasses}`} style={fuenteAyuda}>
        Elegí cómo le llegan tus pedidos a quien compra. Podés marcar más de una.
      </p>

      {/* ═══ RETIRO ═══ */}
      <Tarjeta
        activo={valor.metodos.includes('retiro')}
        onToggle={() => alternar('retiro')}
        titulo="Retiro"
        detalle={detalleRetiro}
        etiqueta="Gratis"
      >
        {enlaceUbicacion && (
          <a href="/vendedor/ubicacion" className="block px-4 pb-3 ml-[30px] -mt-1 text-[12px] text-[#0a0a0a]/50 underline underline-offset-2">
            Cambiar cómo se ve tu ubicación
          </a>
        )}
      </Tarjeta>

      {/* ═══ ENVÍO DE LA TIENDA ═══ */}
      <Tarjeta
        activo={valor.metodos.includes('envio_tienda')}
        deshabilitado={!tienePunto && !valor.metodos.includes('envio_tienda')}
        onToggle={() => alternar('envio_tienda')}
        titulo="Envío de la tienda"
        detalle="Lo llevás vos o lo mandás con quien quieras: un cadete, Uber Flash, PedidosYa… Cobrás según la distancia, dentro de Bahía Blanca."
      >
        {!tienePunto && (
          <p className="mx-4 mb-4 ml-[46px] mt-0 p-2.5 rounded-lg bg-amber-50 text-[12px] text-amber-800 font-light">
            Para medir distancias necesitamos tu ubicación en el mapa.{' '}
            {enlaceUbicacion
              ? <a href="/vendedor/ubicacion" className="underline underline-offset-2">Cargar mi ubicación</a>
              : 'Completala en el paso anterior.'}
          </p>
        )}
        {valor.metodos.includes('envio_tienda') && (
          <>
            <p className={`px-4 ml-[30px] mt-0 mb-3 text-[12px] text-[#0a0a0a]/55 font-light leading-relaxed`}>
              Medimos aproximando el recorrido por calles; poné los precios que te parezcan justos.
              Dejá vacía una zona si no llegás: a quien vive ahí no le aparece esta opción. Si ponés $0, es envío gratis.
            </p>
            <Zonas metodo={METODOS.envio_tienda} valor={valor} onPrecio={cambiarPrecio} nombreZona={zonaTienda} />
          </>
        )}
      </Tarjeta>

      {/* ═══ CORREO ═══ */}
      <Tarjeta
        activo={valor.metodos.includes('correo')}
        onToggle={() => alternar('correo')}
        titulo="Correo"
        detalle="Despachás por correo a otras localidades."
      >
        {valor.metodos.includes('correo') && (
          <>
            <p className="px-4 ml-[30px] mt-0 mb-3 text-[12px] text-[#0a0a0a]/55 font-light leading-relaxed">
              Un precio por zona. Por ahora, quien compra elige su zona. Dejá vacía una zona si no enviás ahí.
            </p>
            <Zonas metodo={METODOS.correo} valor={valor} onPrecio={cambiarPrecio} nombreZona={zonaCorreo} />
          </>
        )}
      </Tarjeta>

      {/* ═══ COORDINAR ═══ */}
      <Tarjeta
        activo={valor.metodos.includes('coordinar')}
        onToggle={() => alternar('coordinar')}
        titulo="Coordinar por WhatsApp"
        detalle="Pagan los productos y arreglan la entrega por WhatsApp. Sin costo fijo."
      >
        <p className="px-4 pb-3 ml-[30px] mt-0 mb-0 text-[12px] text-[#0a0a0a]/45 font-light leading-relaxed">
          Si para alguien no queda ninguna otra opción (por ejemplo, no llegás a su dirección), también ve esta.
        </p>
      </Tarjeta>

      {textoResumen && (
        <p className="mt-4 mb-0 text-[13px] text-[#0a0a0a]/60 font-light">
          Así te ven: <span className="text-[#0a0a0a]">{textoResumen}</span>
        </p>
      )}
    </div>
  )
}
