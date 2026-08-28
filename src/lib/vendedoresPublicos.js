// Única regla de qué vendedor se muestra en público: tienda publicada y no
// bloqueada. Vive acá para que sea una sola línea de verdad y para que se
// pueda encontrar de un grep quién la aplica y quién se la olvidó.
//
// La base también lo hace cumplir (migración 007, policies RESTRICTIVE), pero
// eso protege sólo lo que pasa por RLS: las lecturas con service_role la
// esquivan. Estos filtros son los que valen en el código.

export const ESTADO_PUBLICADO = 'aprobado'

// Columnas mínimas para poder decidir en el navegador.
export const CAMPOS_VISIBILIDAD = 'estado_validacion, bloqueado'

// Para queries sobre la tabla 'vendedores'.
export function soloVendedoresPublicados(query) {
  return query
    .eq('estado_validacion', ESTADO_PUBLICADO)
    .eq('bloqueado', false)
}

// Para queries sobre 'productos' que embeben al vendedor con !inner.
// El alias es el nombre con el que se embebió (vendedor:vendedores!inner(...)).
export function soloProductosPublicados(query, alias = 'vendedor') {
  return query
    .eq(`${alias}.estado_validacion`, ESTADO_PUBLICADO)
    .eq(`${alias}.bloqueado`, false)
}

// Para listas que ya vienen armadas y se filtran en el cliente, cuando el
// vendedor está embebido dos niveles adentro y no se puede filtrar en la query.
// Un vendedor oculto por RLS llega como null: eso también es "no publicado".
export function vendedorPublicado(vendedor) {
  return (
    !!vendedor &&
    vendedor.bloqueado === false &&
    vendedor.estado_validacion === ESTADO_PUBLICADO
  )
}
