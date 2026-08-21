// Estilos compartidos por los formularios del vendedor (alta y edición).
// Tipografía Bahía Shops: Fraunces (títulos), Poppins (texto de apoyo), Inter (interfaz).

export const inputClasses =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors'
export const selectClasses = `${inputClasses} bg-white`

export const fuenteTitulo = { fontFamily: "'Fraunces', serif", fontWeight: 500, color: '#0a0a0a', letterSpacing: '-0.02em' }
export const fuenteAyuda = { fontFamily: "'Poppins', sans-serif", fontWeight: 300 }

// Todas las frases que explican un campo: mismo tamaño, negro y Poppins
export const ayudaClasses = 'text-[13px] text-[#0a0a0a]'
export const labelClasses = 'text-sm text-[#0a0a0a]/60 font-light'

// Botón negro casi cuadrado; en hover queda con línea negra, fondo blanco y letras negras
export const btnBase =
  'inline-flex items-center justify-center border rounded-[4px] text-sm font-medium transition-colors'
export const btnNegro =
  `${btnBase} bg-[#0a0a0a] border-[#0a0a0a] text-white cursor-pointer hover:bg-white hover:text-[#0a0a0a]`
export const btnNegroInactivo =
  `${btnBase} bg-[#0a0a0a]/20 border-[#0a0a0a]/20 text-white cursor-not-allowed`
export const btnLinea =
  `${btnBase} bg-white border-[#0a0a0a] text-[#0a0a0a] cursor-pointer hover:bg-[#0a0a0a] hover:text-white`

// Pastilla chica en el amarillo de las tarjetas del panel admin
export const btnAmarillo =
  'inline-flex items-center justify-center whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-normal transition-colors cursor-pointer bg-[#f1f29f] border-[#f1f29f] text-[#6b6d00] hover:bg-white hover:border-[#6b6d00]'

// Pastillas iguales a las de categorías de la home, pero en Poppins
export const pillBase =
  'whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-normal transition-colors cursor-pointer'
export const pillActiva = `${pillBase} bg-[#0a0a0a] text-white border-[#0a0a0a]`
export const pillInactiva = `${pillBase} bg-transparent text-[#777] border-[#d5d5d5] hover:border-[#0a0a0a] hover:text-[#0a0a0a]`
export const fuentePill = { fontFamily: "'Poppins', sans-serif" }
