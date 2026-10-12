// ¿Esta tienda puede vender ahora? Una sola regla para todas las rutas que
// arman una compra: /api/pedidos/crear, /api/envio/cotizar y «Pagar ahora»
// (src/lib/pagarAhora.js). Antes cada una tenía sus condiciones sueltas.
//
// Una tienda vende si existe, no está bloqueada, está publicada, no está
// cerrada (etapa 3), no está pausada por su dueño y tiene una cuenta de
// MercadoPago conectada. "Conectada" es que exista su fila en
// mercadopago_cuentas (los tokens), no vendedores.mercadopago_conectado: la
// fila es lo que de verdad permite cobrar (igual que el cartel de «Recordarle»).
//
// Es una función pura: quien la llama lee la tienda y la cuenta (con
// service_role) y se las pasa. La base también lo hace cumplir donde importa:
// un disparador rechaza pedidos nuevos a una tienda pausada o cerrada
// (migración 030).

import { ESTADO_PUBLICADO } from '@/lib/vendedoresPublicos'

// Las columnas de vendedores que hacen falta para decidir.
export const CAMPOS_VENDIBLE = 'id, bloqueado, estado_validacion, pausada_en, cerrada_en'

export const MOTIVOS_NO_VENDIBLE = {
  NO_EXISTE: 'NO_EXISTE',
  BLOQUEADA: 'BLOQUEADA',
  NO_PUBLICADA: 'NO_PUBLICADA',
  CERRADA: 'CERRADA',
  PAUSADA: 'PAUSADA',
  SIN_MP: 'SIN_MP',
}

// El mensaje para quien compra. Una tienda pausada o cerrada se dice tal cual
// (es lo mismo que ve en la ficha); bloqueada, despublicada o inexistente son
// "no disponible" y nada más: el motivo es entre Bahía Shops y la tienda.
export const MENSAJE_NO_RECIBE_PEDIDOS = 'Esta tienda no está recibiendo pedidos.'
const MENSAJES = {
  NO_EXISTE: 'Esta tienda no está disponible.',
  BLOQUEADA: 'Esta tienda no está disponible.',
  NO_PUBLICADA: 'Esta tienda no está disponible.',
  CERRADA: MENSAJE_NO_RECIBE_PEDIDOS,
  PAUSADA: MENSAJE_NO_RECIBE_PEDIDOS,
  SIN_MP: 'Este vendedor no tiene MercadoPago conectado.',
}

export function mensajeNoVendible(motivo) {
  return MENSAJES[motivo] || MENSAJES.NO_EXISTE
}

//   vendedor  la fila de vendedores (con CAMPOS_VENDIBLE), o null
//   cuentaMp  la fila de mercadopago_cuentas de esa tienda, o null
//
// Devuelve { vendible: true, motivo: null } o { vendible: false, motivo }.
// El orden importa: sale el primer motivo, del más grave al más común.
export function vendedorVendible(vendedor, cuentaMp) {
  const no = (motivo) => ({ vendible: false, motivo })
  if (!vendedor) return no(MOTIVOS_NO_VENDIBLE.NO_EXISTE)
  if (vendedor.bloqueado) return no(MOTIVOS_NO_VENDIBLE.BLOQUEADA)
  if (vendedor.estado_validacion !== ESTADO_PUBLICADO) return no(MOTIVOS_NO_VENDIBLE.NO_PUBLICADA)
  if (vendedor.cerrada_en) return no(MOTIVOS_NO_VENDIBLE.CERRADA)
  if (vendedor.pausada_en) return no(MOTIVOS_NO_VENDIBLE.PAUSADA)
  if (!cuentaMp) return no(MOTIVOS_NO_VENDIBLE.SIN_MP)
  return { vendible: true, motivo: null }
}
