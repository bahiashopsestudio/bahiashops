// Piezas que comparten las pantallas de moderación y denuncias del admin.

export function formatearPrecio(valor) {
  if (!valor) return '';
  return Number(valor).toLocaleString('es-AR');
}

// Si una lista no se pudo cargar: no es lo mismo que "no hay nada".
export function ErrorDeLista({ titulo, error, onReintentar }) {
  return (
    <div className="mt-8 px-8 py-10 text-center border border-red-300 bg-red-50 rounded-xl text-red-700">
      <p className="text-lg m-0">{titulo}</p>
      <p className="mt-2 mb-4 text-sm">{error}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="px-4 py-2 border border-red-700 rounded-lg bg-white text-red-700 text-sm cursor-pointer hover:bg-red-50 transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
}

// Botones de las tarjetas de "Revisar después" y Denuncias.
export const BOTON_NEGRO = 'px-4 py-2 border-none rounded-lg bg-[#0a0a0a] text-white text-sm cursor-pointer hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const BOTON_BORDE_NEGRO = 'px-4 py-2 border border-[#0a0a0a] rounded-lg bg-white text-[#0a0a0a] text-sm cursor-pointer hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const BOTON_BORDE_GRIS = 'px-4 py-2 border border-gray-300 rounded-lg bg-white text-[#0a0a0a] text-sm cursor-pointer hover:bg-gray-50 transition-colors';
