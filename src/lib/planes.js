// Los planes de las tiendas (migraciones 046 y 047), del lado del servidor:
// cómo se lee el plan que devuelve la base, qué dice el contador, cuál es el
// plan siguiente y cómo se lee el error del tope.
//
// Lo que vale de verdad lo decide la base (privado.plan_efectivo,
// privado.tope_lleno, privado.tope_superado y privado.guardar_producto):
// estas funciones solo leen lo que devuelve. No tocan la base.
//
// Desde la 047 cuentan todos los productos guardados de la tienda (también
// los pausados y los rechazados): usados es ese número.
//
//   npm run probar:planes

// Desde cuántos productos libres el contador avisa que queda poco.
export const FALTAN_PARA_CERCA = 2

// El plan tal como lo devuelve rpc_plan_de_tienda, con los nombres que usan
// las rutas. Sin el precio: el precio especial es una condición del admin.
export function planDesdeLaBase(fila) {
  const f = fila && typeof fila === 'object' ? fila : {}
  const entero = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return {
    clave: f.plan ?? null,
    nombre: f.nombre ?? null,
    // 'gratis' | 'especial' | 'suscripcion' (048)
    origen: f.origen ?? null,
    especial: f.especial === true,
    sinTope: f.sin_tope === true,
    tope: f.sin_tope === true ? null : entero(f.tope_productos),
    usados: entero(f.usados) ?? 0,
    fotosPorProducto: entero(f.fotos_por_producto),
    carritos: f.carritos_abandonados === true,
    // Lo que paga por mes (048): el monto de la suscripción, el precio
    // especial o el del plan. Las rutas lo muestran solo con una suscripción.
    precioMensual: entero(f.precio_mensual),
    // Un plan a medida que espera el pago (048): { plan, precio } o null.
    especialPendiente: f.especial_pendiente && Number.isInteger(Number(f.especial_pendiente.precio))
      ? { plan: f.especial_pendiente.plan ?? null, precio: Number(f.especial_pendiente.precio) }
      : null,
    // La caída abierta (050): su plan pago terminó y volvió a un plan más
    // chico. { motivo, nombre, aMedida, pausados } o null.
    caida: f.caida && typeof f.caida === 'object'
      ? { motivo: f.caida.motivo ?? null, nombre: f.caida.nombre ?? null, aMedida: f.caida.a_medida === true, pausados: entero(f.caida.pausados) ?? 0 }
      : null,
    // Los productos que pausó el sistema por el plan (050).
    pausadosPorPlan: entero(f.pausados_por_plan) ?? 0,
  }
}

// ¿Volvió al Gratis porque terminó su plan pago? La caída abierta, salvo la
// de condiciones quitadas (ahí sigue en el Básico).
export function volvioAlGratis(datos) {
  return !!datos?.caida && datos.caida.motivo !== 'condiciones_quitadas'
}

// «tu plan Básico» o «tu plan a medida», el de la caída.
export function planQueTenia(caida) {
  if (caida?.aMedida) return 'tu plan a medida'
  return `tu plan ${caida?.nombre || 'Básico'}`
}

// Qué dice el contador «usados de tope»:
//   'sin_tope'    sin límite de productos
//   'normal'      hay lugar de sobra
//   'cerca'       quedan FALTAN_PARA_CERCA o menos
//   'en_el_tope'  no entra ninguno más
//   'por_encima'  tiene más que el tope (se bajó el tope; no se pausó nada)
export function estadoDelContador({ tope, usados, sinTope } = {}) {
  if (sinTope || tope === null || tope === undefined) return 'sin_tope'
  const u = Number(usados) || 0
  if (u > tope) return 'por_encima'
  if (u === tope) return 'en_el_tope'
  if (tope - u <= FALTAN_PARA_CERCA) return 'cerca'
  return 'normal'
}

// El plan que sigue al actual, para el cartel del tope: el primero disponible
// de orden mayor. null si la tienda tiene condiciones especiales (las arregla
// el admin) o si no hay otro.
//   planes  filas de public.planes
export function planSiguiente(planes, claveActual, { especial = false } = {}) {
  if (especial || !Array.isArray(planes)) return null
  const actual = planes.find((p) => p?.clave === claveActual)
  if (!actual) return null
  const siguiente = planes
    .filter((p) => p?.disponible === true && Number(p.orden) > Number(actual.orden))
    .sort((a, b) => Number(a.orden) - Number(b.orden))[0]
  if (!siguiente) return null
  return {
    clave: siguiente.clave,
    nombre: siguiente.nombre,
    tope: siguiente.tope_productos,
    fotosPorProducto: siguiente.fotos_por_producto,
    carritos: siguiente.carritos_abandonados === true,
    precio: siguiente.precio_mensual,
  }
}

// El nombre del primer plan disponible que trae los carritos abandonados,
// para el cartelito de la pestaña de pedidos. null si no hay ninguno.
export function planConCarritos(planes) {
  if (!Array.isArray(planes)) return null
  const conCarritos = planes
    .filter((p) => p?.disponible === true && p.carritos_abandonados === true)
    .sort((a, b) => Number(a.orden) - Number(b.orden))[0]
  return conCarritos?.nombre ?? null
}

// El error del tope que lanza privado.guardar_producto (SQLSTATE BS409, el
// mensaje 'tope_productos', 'tope_superado' o 'tope_fotos', y { tope, usados }
// en el detalle). Devuelve { motivo, tope, usados, accion } o null si no es
// ese error. Si el detalle no llegó o no se entiende, tope y usados van null:
// el tope igual valió.
// guardar_producto solo lanza 'tope_superado' al reenviar un rechazado (por
// eso accion: 'reenviar'); al reactivar, el motivo llega de
// cambiar_estado_producto y la ruta pasa accion: 'activar'.
export function errorDeTope(error) {
  if (error?.code !== 'BS409') return null
  const motivo = ['tope_productos', 'tope_superado', 'tope_fotos'].includes(error.message) ? error.message : 'tope_productos'
  let detalle = {}
  try {
    detalle = typeof error.details === 'string' ? JSON.parse(error.details) : (error.details || {})
  } catch { /* sin detalle: el mensaje va sin los números */ }
  const numero = (v) => (Number.isInteger(Number(v)) && v !== null && v !== '' ? Number(v) : null)
  const leido = { motivo, tope: numero(detalle?.tope), usados: numero(detalle?.usados) }
  return motivo === 'tope_superado' ? { ...leido, accion: 'reenviar' } : leido
}

// El texto del 409, para mostrar tal cual (hoy, en el alert() de la pantalla).
//   'tope_productos'  cargar uno nuevo con el tope lleno (cuentan todos los
//                     guardados, también los pausados)
//   'tope_superado'   activar un pausado o reenviar un rechazado con más
//                     guardados que el tope (accion: 'activar' | 'reenviar')
//   'tope_fotos'      más fotos de las que acepta el producto
export function textoDeTope({ motivo, tope, usados, accion = 'activar' } = {}) {
  if (motivo === 'tope_fotos') {
    return tope
      ? `Este producto puede tener hasta ${tope} fotos con tu plan. Sacá alguna para poder guardarlo.`
      : 'Este producto tiene más fotos de las que permite tu plan. Sacá alguna para poder guardarlo.'
  }
  if (motivo === 'tope_superado') {
    const verbo = accion === 'reenviar' ? 'reenviar' : 'activar'
    if (tope && usados) return `Tenés ${usados} productos y tu plan guarda ${tope}. Para ${verbo} este, eliminá productos hasta tener ${tope}.`
    if (tope) return `Tenés más productos de los ${tope} que guarda tu plan. Para ${verbo} este, eliminá productos hasta tener ${tope}.`
    return `Tenés más productos de los que guarda tu plan. Para ${verbo} este, eliminá productos hasta llegar al tope.`
  }
  const inicio = tope ? `Llegaste a los ${tope} productos de tu plan.` : 'Llegaste al tope de productos de tu plan.'
  return `${inicio} Cuentan todos, también los pausados: para cargar otro, eliminá uno.`
}

// El cuerpo del 409 de las rutas: { error, motivo, tope, usados }, con el
// texto armado. Recibe { motivo, tope, usados, accion } (lo de
// validarProducto, guardarProducto o cambiar_estado_producto).
export function cuerpoDeTope({ motivo, tope = null, usados = null, accion }) {
  return { error: textoDeTope({ motivo, tope, usados, accion }), motivo, tope, usados }
}

// ── La página pública /vender ──

// Un precio en pesos como lo muestra /vender: '$0', '$10.000'. Lo usan
// también el panel de la tienda y el admin.
export function textoPrecio(pesos) {
  return `$${Number(pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

const enteroPositivo = (v) => Number.isInteger(v) && v > 0

// Los planes como los muestra /vender, desde las filas de public.planes (lo
// que lee anon). El Gratis y el Básico tienen que estar completos y
// disponibles: si falta alguno, o falta un dato, devuelve null y la página
// muestra la sección sin números (nunca un precio o un tope inventado).
//
// El Pro: si no se puede elegir o no tiene precio, «Próximamente». Si no hay
// fila, también.
export function planesParaLaVenta(filas) {
  if (!Array.isArray(filas)) return null
  const fila = (clave) => filas.find((p) => p?.clave === clave)

  const completo = (p) =>
    p && p.disponible === true && Number.isInteger(p.precio_mensual) && p.precio_mensual >= 0 &&
    enteroPositivo(p.tope_productos) && enteroPositivo(p.fotos_por_producto)
  const vendible = (p) => ({
    nombre: p.nombre,
    precio: textoPrecio(p.precio_mensual),
    tope: p.tope_productos,
    fotos: p.fotos_por_producto,
    carritos: p.carritos_abandonados === true,
  })

  const gratis = fila('gratis')
  const basico = fila('basico')
  if (!completo(gratis) || !completo(basico)) return null

  const pro = fila('pro')
  const proElegible = !!pro && pro.disponible === true && Number.isInteger(pro.precio_mensual)
  return {
    gratis: vendible(gratis),
    basico: vendible(basico),
    pro: proElegible
      ? { nombre: pro.nombre, proximamente: false, precio: textoPrecio(pro.precio_mensual),
          tope: enteroPositivo(pro.tope_productos) ? pro.tope_productos : null,
          fotos: enteroPositivo(pro.fotos_por_producto) ? pro.fotos_por_producto : null,
          carritos: pro.carritos_abandonados === true }
      : { nombre: pro?.nombre || 'Pro', proximamente: true },
  }
}

// ── El panel de la tienda (Mis productos, Nuevo, Editar, Mi negocio) ──
//
// Reciben el plan como lo devuelve /api/vendedor/plan:
//   { plan: { clave, nombre }, tope, usados, fotosPorProducto, carritos,
//     especial, sinTope, contador, siguiente }
// usados son todos los productos guardados (migración 047).

export const LINK_PLANES = '/vender#planes'

// La nota debajo del contador de Mis productos, o null si no lleva:
//   { texto, link?: { texto, href } | { texto, modal: true }, despues? }
// Por encima del tope, en el Gratis, invita al plan siguiente. Si volvió al
// Gratis porque terminó su plan pago (la caída abierta, 050): «Tu plan volvió
// al Gratis. Para reactivar tu plan Básico [hacé click acá]. Si no, eliminá
// productos hasta bajar a 10.» (el link abre el alta de la suscripción).
export function notaDelContador(datos) {
  const d = datos || {}
  const contador = d.contador ?? estadoDelContador(d)
  const tope = d.tope
  const usados = Number(d.usados) || 0
  if (contador === 'cerca') {
    const quedan = tope - usados
    return { texto: quedan === 1 ? 'Te queda 1 lugar.' : `Te quedan ${quedan} lugares.` }
  }
  if (contador === 'en_el_tope') return { texto: 'Llegaste al tope de tu plan.' }
  if (contador !== 'por_encima') return null

  const despues = `Si no, eliminá productos hasta bajar a ${tope}.`
  if (volvioAlGratis(d) && d.suscripciones === true) {
    return { texto: `Tu plan volvió al Gratis. Para reactivar ${planQueTenia(d.caida)}`, link: { texto: 'hacé click acá', modal: true }, despues }
  }
  if (d.especial) return { texto: `Tenés ${usados} productos y tu plan guarda ${tope}.`, despues }
  const nombre = d.plan?.nombre ? ` ${d.plan.nombre}` : ''
  const nota = { texto: `Tenés ${usados} productos y tu plan${nombre} guarda ${tope}.`, despues }
  if (d.siguiente?.nombre) nota.link = { texto: `Conocer el plan ${d.siguiente.nombre}`, href: LINK_PLANES }
  return nota
}

// La etiqueta del plan junto al contador: 'Plan Gratis', 'Plan a medida', o
// null sin tope (ahí el contador dice solo «N productos»).
export function etiquetaDelPlan(datos) {
  if (!datos || datos.sinTope) return null
  if (datos.especial) return 'Plan a medida'
  return datos.plan?.nombre ? `Plan ${datos.plan.nombre}` : null
}

// Los textos del cartel del plan (CartelPlan):
//   motivo  'productos'  llegó al tope y quiere cargar uno nuevo
//           'superado'   quiere activar o reenviar uno con la tienda por
//                        encima del tope (accion: 'activar' | 'reenviar')
//           'fotos'      llegó a las fotos por producto (el cartel chico)
//   tope y usados: los del 409 si llegaron; si no, los del plan.
// Devuelve { eyebrow, titulo, intro, chips, cierre, boton, secundario, contacto }:
//   intro y chips: lo que trae el plan siguiente (null / [] si no hay);
//   boton: { texto, href } al plan siguiente, o { texto, modal: true } si
//   abre el alta de la suscripción ahí mismo (F3.2: del Gratis al Básico, con
//   datos.suscripciones); secundario: { texto, href } «Ver los planes» cuando
//   el botón abre el alta; contacto: «Escribinos si necesitás más lugar»
//   (abre el formulario de contacto).
// Con condiciones especiales (el plan a medida) nunca se ofrece el plan
// siguiente, en ningún motivo: va «Escribinos». Con un plan a medida que
// espera el pago (datos.especialPendiente), en todos los motivos, el cartel
// lo ofrece: «Tu plan a medida te está esperando».
// Si volvió al Gratis porque terminó su plan pago (050), en todos los
// motivos: el cierre es el texto del contador, con el link que abre el alta:
//   cierre: { antes, link: { texto, modal: true }, despues } (un objeto, no
//   un texto).
export function textosDelCartel({ motivo = 'productos', accion = 'activar', datos, tope, usados } = {}) {
  const d = datos || {}
  const t = tope ?? d.tope ?? null
  const u = usados ?? d.usados ?? null

  if (volvioAlGratis(d) && d.suscripciones === true) {
    const verbo = accion === 'reenviar' ? 'reenviar' : 'activar'
    const titulo = motivo === 'fotos'
      ? (d.fotosPorProducto ? `Llegaste a las ${d.fotosPorProducto} fotos de tu plan` : 'Llegaste a las fotos de tu plan')
      : motivo === 'superado' ? `Para ${verbo} este producto, hacé lugar`
        : t && u && u > t ? `Tenés ${u} productos y tu plan guarda ${t}`
          : t ? `Llegaste a los ${t} productos de tu plan` : 'Llegaste al tope de productos de tu plan'
    return {
      eyebrow: d.plan?.nombre ? `Tu plan ${d.plan.nombre}` : 'Tu plan',
      titulo,
      intro: null,
      chips: [],
      cierre: {
        antes: `Tu plan volvió al Gratis. Para reactivar ${planQueTenia(d.caida)} `,
        link: { texto: 'hacé click acá', modal: true },
        despues: motivo === 'fotos' || !t ? '.' : `. Si no, eliminá productos hasta bajar a ${t}.`,
      },
      boton: null,
      secundario: null,
      contacto: false,
    }
  }

  const pendiente = d.suscripciones === true && !d.especial ? d.especialPendiente : null
  if (pendiente && Number.isInteger(pendiente.precio)) {
    const cuanto = pendiente.sinTope ? 'productos sin tope' : pendiente.tope ? `${pendiente.tope} productos` : 'un plan a medida'
    const rige = d.plan?.nombre ? `rige el plan ${d.plan.nombre}${t ? `: ${t} productos` : ''}` : 'rige tu plan de hoy'
    // Si ya paga el Básico, el plan a medida se activa pagando la diferencia,
    // desde Mi negocio.
    const yaPaga = d.origen === 'suscripcion'
    return {
      eyebrow: 'Tu plan a medida',
      titulo: 'Tu plan a medida te está esperando',
      intro: `Te armamos ${cuanto} por ${textoPrecio(pendiente.precio)} por mes. Mientras no se active, ${rige}.`,
      chips: [],
      cierre: null,
      boton: yaPaga
        ? { texto: 'Activarlo desde Mi negocio', href: '/vendedor/perfil' }
        : { texto: `Suscribirme por ${textoPrecio(pendiente.precio)} por mes`, modal: true },
      secundario: null,
      contacto: false,
    }
  }

  const sig = d.especial ? null : d.siguiente || null
  const eyebrow = d.especial ? 'Tu plan a medida' : (d.plan?.nombre ? `Tu plan ${d.plan.nombre}` : 'Tu plan')
  // Del Gratis al Básico se pasa ahí mismo, con el modal del alta.
  const alAlta = !!sig && d.suscripciones === true && d.plan?.clave === 'gratis' && sig.clave === 'basico'
  const boton = !sig ? null : alAlta
    ? { texto: `Pasarme al ${sig.nombre}`, modal: true }
    : { texto: `Conocer el plan ${sig.nombre}`, href: LINK_PLANES }
  const secundario = alAlta ? { texto: 'Ver los planes', href: LINK_PLANES } : null
  const contacto = d.especial === true

  if (motivo === 'fotos') {
    const fotos = d.fotosPorProducto
    const masFotos = !!sig && sig.fotosPorProducto > (fotos || 0)
    return {
      eyebrow,
      titulo: fotos ? `Llegaste a las ${fotos} fotos de tu plan` : 'Llegaste a las fotos de tu plan',
      intro: masFotos ? `Con el plan ${sig.nombre} podés subir hasta ${sig.fotosPorProducto} fotos por producto.` : null,
      chips: [],
      cierre: null,
      boton: masFotos ? boton : null,
      secundario: masFotos ? secundario : null,
      contacto,
    }
  }

  const intro = sig && Number.isInteger(sig.precio)
    ? `Con el plan ${sig.nombre} mostrás más, por ${textoPrecio(sig.precio)} por mes:`
    : null
  const chips = sig
    ? [
        sig.tope ? `Hasta ${sig.tope} productos` : null,
        sig.fotosPorProducto ? `Hasta ${sig.fotosPorProducto} fotos por producto` : null,
        sig.carritos ? 'Carritos abandonados' : null,
      ].filter(Boolean)
    : []

  if (motivo === 'superado') {
    const verbo = accion === 'reenviar' ? 'reenviar' : 'activar'
    return {
      eyebrow,
      titulo: `Para ${verbo} este producto, hacé lugar`,
      intro,
      chips,
      cierre: textoDeTope({ motivo: 'tope_superado', tope: t, usados: u, accion: verbo }),
      boton,
      secundario,
      contacto,
    }
  }

  // Por encima del tope (le bajaron el tope o le quitaron una especial): para
  // cargar uno nuevo tiene que quedar un lugar libre, o sea tope - 1.
  if (t && u && u > t) {
    return {
      eyebrow,
      titulo: `Tenés ${u} productos y tu plan guarda ${t}`,
      intro,
      chips,
      cierre: `Cuentan todos tus productos, también los pausados. Para cargar otro, eliminá productos hasta tener ${t - 1}.`,
      boton,
      secundario,
      contacto,
    }
  }

  return {
    eyebrow,
    titulo: t ? `Llegaste a los ${t} productos de tu plan` : 'Llegaste al tope de productos de tu plan',
    intro,
    chips,
    cierre: contacto
      ? 'Cuentan todos tus productos, también los pausados. Para cargar otro, eliminá uno.'
      : 'Cuentan todos tus productos, también los pausados. Para cargar otro ahora, eliminá uno.',
    boton,
    secundario,
    contacto,
  }
}

// ── El admin de planes (/admin/planes y la ficha de cada tienda) ──

export const MAX_MOTIVO_PLAN = 300
const TOPE_MAXIMO = 10000
const FOTOS_MAXIMO = 20
const PRECIO_MAXIMO = 100000000

// Un entero de un campo del formulario: 10000, '10000', '10.000', ' 25 '.
// '' / null / undefined -> null. Lo que no es un entero sin signo -> NaN.
export function enteroDelCampo(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : NaN
  const texto = String(v).trim().replace(/\./g, '')
  if (texto === '') return null
  return /^\d+$/.test(texto) ? Number(texto) : NaN
}

// Los cambios de un plan desde /admin/planes. Las mismas reglas que la tabla
// (migración 046), para responder con un texto claro antes de llegar a la base:
//   · el Pro no se edita todavía (sin topes hasta que lo construyamos);
//   · el Gratis vale siempre $0 y se puede elegir;
//   · precio de 0 en adelante; tope de 1 a 10.000; fotos de 1 a 20.
//   actual  la fila de public.planes que se edita
// Devuelve { ok: true, cambios } (las columnas a guardar) o { ok: false, error }.
export function validarPlanAdmin(cuerpo, actual) {
  if (!actual?.clave) return { ok: false, error: 'No encontramos ese plan.' }
  if (actual.clave === 'pro') return { ok: false, error: 'El Pro todavía no se edita: sus valores se cargan cuando lo construyamos.' }
  const c = cuerpo && typeof cuerpo === 'object' ? cuerpo : {}

  const precio = actual.clave === 'gratis' ? 0 : enteroDelCampo(c.precio_mensual)
  const tope = enteroDelCampo(c.tope_productos)
  const fotos = enteroDelCampo(c.fotos_por_producto)
  if (precio === null || Number.isNaN(precio) || precio > PRECIO_MAXIMO) {
    return { ok: false, error: 'El precio tiene que ser un número entero de pesos, sin centavos.' }
  }
  if (tope === null || Number.isNaN(tope) || tope < 1 || tope > TOPE_MAXIMO) {
    return { ok: false, error: 'El tope de productos tiene que ser un número de 1 a 10.000.' }
  }
  if (fotos === null || Number.isNaN(fotos) || fotos < 1 || fotos > FOTOS_MAXIMO) {
    return { ok: false, error: `Las fotos por producto tienen que ser un número de 1 a ${FOTOS_MAXIMO}.` }
  }
  if (typeof c.carritos_abandonados !== 'boolean') return { ok: false, error: 'Falta decir si trae los carritos abandonados.' }
  const disponible = actual.clave === 'gratis' ? true : c.disponible
  if (typeof disponible !== 'boolean') return { ok: false, error: 'Falta decir si se puede elegir.' }

  return {
    ok: true,
    cambios: {
      precio_mensual: precio,
      tope_productos: tope,
      fotos_por_producto: fotos,
      carritos_abandonados: c.carritos_abandonados,
      disponible,
    },
  }
}

// Los avisos al cambiar un plan, comparando lo guardado con lo que se está
// por guardar (los muestra /admin/planes antes de guardar).
export function avisosDePlan(actual, propuesto) {
  if (!actual || !propuesto) return []
  const avisos = []
  const tope = enteroDelCampo(propuesto.tope_productos)
  const fotos = enteroDelCampo(propuesto.fotos_por_producto)
  if (Number.isInteger(tope) && Number.isInteger(actual.tope_productos) && tope < actual.tope_productos) {
    avisos.push(`Bajaste el tope de ${actual.tope_productos} a ${tope}. Afecta solo lo que se cargue después: nada se pausa.`)
  }
  if (Number.isInteger(fotos) && Number.isInteger(actual.fotos_por_producto) && fotos < actual.fotos_por_producto) {
    avisos.push(`Bajaste las fotos de ${actual.fotos_por_producto} a ${fotos}. Afecta solo lo que se cargue después: los productos que ya tienen más las conservan.`)
  }
  if (actual.carritos_abandonados === true && propuesto.carritos_abandonados === false) {
    avisos.push('Sacaste los carritos abandonados: las tiendas de este plan dejan de verlos en el momento. No se pierde ningún dato.')
  }
  return avisos
}

// Los planes que se pueden asignar a una tienda: con tope de productos y
// fotos por producto (los mismos que acepta el disparador de la 046).
export function planesAsignables(planes) {
  if (!Array.isArray(planes)) return []
  return planes
    .filter((p) => p?.clave && Number.isInteger(p.tope_productos) && Number.isInteger(p.fotos_por_producto))
    .sort((a, b) => Number(a.orden) - Number(b.orden))
}

// Las condiciones especiales de una tienda desde la ficha del admin.
//   cuerpo  { plan_clave, tope_productos, sin_tope, precio_especial, motivo }
//           tope vacío = el del plan; precio vacío = el del plan; 0 = sin abono
//   planes  filas de public.planes
// Devuelve { ok: true, datos } (las columnas de vendedor_planes) o { ok: false, error }.
export function validarEspecial(cuerpo, planes) {
  const c = cuerpo && typeof cuerpo === 'object' ? cuerpo : {}
  const plan = planesAsignables(planes).find((p) => p.clave === c.plan_clave)
  if (!plan) return { ok: false, error: 'Elegí un plan con tope de productos y fotos cargados.' }

  const sinTope = c.sin_tope === true
  const tope = sinTope ? null : enteroDelCampo(c.tope_productos)
  if (!sinTope && (Number.isNaN(tope) || (tope !== null && (tope < 1 || tope > TOPE_MAXIMO)))) {
    return { ok: false, error: 'El tope de productos tiene que ser un número de 1 a 10.000, o tildá «Sin tope».' }
  }
  const precio = enteroDelCampo(c.precio_especial)
  if (Number.isNaN(precio) || (precio !== null && precio > PRECIO_MAXIMO)) {
    return { ok: false, error: 'El precio tiene que ser un número entero de pesos (0 = sin abono), o vacío para el del plan.' }
  }
  const motivo = typeof c.motivo === 'string' ? c.motivo.trim() : ''
  if (!motivo) return { ok: false, error: 'Escribí el motivo: es para vos, la tienda no lo ve.' }
  if (motivo.length > MAX_MOTIVO_PLAN) return { ok: false, error: `El motivo puede tener hasta ${MAX_MOTIVO_PLAN} caracteres.` }

  return { ok: true, datos: { plan_clave: plan.clave, tope_productos: tope, sin_tope: sinTope, precio_especial: precio, motivo } }
}

// Los atajos de la ficha: llenan el formulario con bloques del Básico (tope y
// precio por 2 y por 3) y la tienda propia (Básico sin tope, $0). Salen de la
// fila del Básico: si cambia, los atajos cambian solos. [] si el Básico no
// está completo.
export function atajosEspecial(planes) {
  const basico = Array.isArray(planes) ? planes.find((p) => p?.clave === 'basico') : null
  if (!basico || !enteroPositivo(basico.tope_productos) || !enteroPositivo(basico.fotos_por_producto)
      || !Number.isInteger(basico.precio_mensual)) return []
  const bloque = (n) => ({
    etiqueta: `Bloque de ${basico.tope_productos * n} · ${textoPrecio(basico.precio_mensual * n)}`,
    plan_clave: basico.clave, tope_productos: basico.tope_productos * n, sin_tope: false, precio_especial: basico.precio_mensual * n,
  })
  return [
    bloque(2),
    bloque(3),
    { etiqueta: 'Tienda propia', plan_clave: basico.clave, tope_productos: null, sin_tope: true, precio_especial: 0 },
  ]
}
