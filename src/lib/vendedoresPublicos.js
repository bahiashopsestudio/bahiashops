// Única regla de qué vendedor se muestra en público: tienda publicada, no
// bloqueada, no pausada por su dueño y no cerrada. Vive acá para que sea una
// sola línea de verdad y para que se pueda encontrar de un grep quién la
// aplica y quién se la olvidó.
//
// La base también lo hace cumplir (migraciones 007 y 030, policies
// RESTRICTIVE), pero eso protege sólo lo que pasa por RLS: las lecturas con
// service_role la esquivan. Estos filtros son los que valen en el código.
//
// Una excepción a propósito: la fila de una tienda PAUSADA sigue legible en la
// base (la ficha en pausa muestra su nombre, logo y mensaje). Por eso que no
// aparezca en los listados depende de estos filtros, no de RLS. Sus productos
// sí los oculta la base.

export const ESTADO_PUBLICADO = 'aprobado'

// Columnas mínimas para poder decidir en el navegador.
export const CAMPOS_VISIBILIDAD = 'estado_validacion, bloqueado, pausada_en, cerrada_en'

// Para queries sobre la tabla 'vendedores'.
export function soloVendedoresPublicados(query) {
  return soloVendedoresConFicha(query)
    .is('pausada_en', null)
}

// La ficha de una tienda (/tienda/[slug]): también la de una tienda pausada,
// que se muestra con el cartel de pausa y sin productos. Una cerrada no.
export function soloVendedoresConFicha(query) {
  return query
    .eq('estado_validacion', ESTADO_PUBLICADO)
    .eq('bloqueado', false)
    .is('cerrada_en', null)
}

// Para queries sobre 'productos' que embeben al vendedor con !inner.
// El alias es el nombre con el que se embebió (vendedor:vendedores!inner(...)).
export function soloProductosPublicados(query, alias = 'vendedor') {
  return query
    .eq(`${alias}.estado_validacion`, ESTADO_PUBLICADO)
    .eq(`${alias}.bloqueado`, false)
    .is(`${alias}.pausada_en`, null)
    .is(`${alias}.cerrada_en`, null)
}

// Para listas que ya vienen armadas y se filtran en el cliente, cuando el
// vendedor está embebido dos niveles adentro y no se puede filtrar en la query.
// Un vendedor oculto por RLS llega como null: eso también es "no publicado".
// La consulta tiene que pedir CAMPOS_VISIBILIDAD.
export function vendedorPublicado(vendedor) {
  return (
    !!vendedor &&
    vendedor.bloqueado === false &&
    vendedor.estado_validacion === ESTADO_PUBLICADO &&
    !vendedor.pausada_en &&
    !vendedor.cerrada_en
  )
}

// ¿Está en pausa? (para la ficha pública)
export function tiendaPausada(vendedor) {
  return !!vendedor?.pausada_en
}
