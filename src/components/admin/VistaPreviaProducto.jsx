'use client';

import VistaProducto from '@/components/VistaProducto';

// "Ver" en las pantallas de moderación y denuncias: la ficha armada con lo que
// trajo el servidor. No se linkea a /producto/[id]: un producto de una tienda
// pausada ahí no se ve, y como admin la ficha no trae las fotos de un
// producto que no está publicado (RLS).
//   p  un producto como lo devuelven /api/admin/moderacion y /api/admin/denuncias
export function previaDe(p) {
  return {
    producto: {
      nombre: p.nombre, descripcion: p.descripcion, precio: p.precio,
      precio_anterior: p.precio_anterior, marca: p.marca,
      propiedad_1_nombre: p.propiedad_1_nombre,
      tiempo_preparacion: p.tiempo_preparacion,
    },
    fotos: (p.fotos || []).map((url) => ({ url })),
    variantes: (p.variantes || []).map((valor) => ({ propiedad_1_valor: valor })),
    vendedor: p.vendedor ? { nombre_negocio: p.vendedor.nombre_negocio } : null,
    categoria: p.categoria || null,
  };
}

export default function VistaPreviaProducto({ previa, onClose }) {
  if (!previa) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 flex items-start justify-center p-8 overflow-y-auto z-[1000]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl max-w-[760px] w-full my-auto overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <p className="font-semibold text-[#0a0a0a] m-0">Vista del producto</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 border border-gray-200 rounded-lg bg-white cursor-pointer text-lg leading-none hover:bg-gray-50"
          >
            ×
          </button>
        </div>
        <div className="p-6">
          <VistaProducto
            producto={previa.producto}
            fotos={previa.fotos}
            variantes={previa.variantes}
            vendedor={previa.vendedor}
            categoria={previa.categoria}
            modoPrevia
          />
        </div>
      </div>
    </div>
  );
}
