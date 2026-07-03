'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const CarritoContext = createContext(null);

const CLAVE = 'bahiashops_carrito';

export function CarritoProvider({ children }) {
  // La canasta ahora es una lista de LOCALES.
  // Cada local: { vendedorId, vendedorNombre, items: [...] }
  const [locales, setLocales] = useState([]);
  const [listo, setListo] = useState(false);

  // Al arrancar, recupera la canasta guardada en el navegador.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado) setLocales(JSON.parse(guardado));
    } catch (e) {
      console.error('No se pudo leer el carrito', e);
    }
    setListo(true);
  }, []);

  // Cada vez que cambia, lo vuelve a guardar (para que no se pierda al recargar).
  useEffect(() => {
    if (listo) localStorage.setItem(CLAVE, JSON.stringify(locales));
  }, [locales, listo]);

  // Agrega un producto al local que corresponde. Nunca borra otros locales.
  function agregar(producto, vendedor) {
    setLocales((actual) => {
      const copia = actual.map((l) => ({ ...l, items: [...l.items] }));
      let local = copia.find((l) => l.vendedorId === vendedor.id);

      if (!local) {
        local = { vendedorId: vendedor.id, vendedorNombre: vendedor.nombre, items: [] };
        copia.push(local);
      }

      const i = local.items.findIndex((it) => it.productoId === producto.productoId);
      if (i >= 0) {
        local.items[i] = { ...local.items[i], cantidad: local.items[i].cantidad + producto.cantidad };
      } else {
        local.items.push(producto);
      }
      return copia;
    });
  }

  function cambiarCantidad(vendedorId, productoId, cantidad) {
    setLocales((actual) =>
      actual.map((l) =>
        l.vendedorId !== vendedorId
          ? l
          : {
              ...l,
              items: l.items.map((it) =>
                it.productoId === productoId ? { ...it, cantidad: Math.max(1, cantidad) } : it
              ),
            }
      )
    );
  }

  // Quita un producto. Si un local se queda sin productos, desaparece de la canasta.
  function quitar(vendedorId, productoId) {
    setLocales((actual) =>
      actual
        .map((l) =>
          l.vendedorId !== vendedorId
            ? l
            : { ...l, items: l.items.filter((it) => it.productoId !== productoId) }
        )
        .filter((l) => l.items.length > 0)
    );
  }

  // Vacía un local entero (lo usamos después de que se compró ese local).
  function vaciarLocal(vendedorId) {
    setLocales((actual) => actual.filter((l) => l.vendedorId !== vendedorId));
  }

  function vaciarTodo() {
    setLocales([]);
  }

  // Datos útiles ya calculados para las pantallas.
  const cantidadTotal = locales.reduce((s, l) => s + l.items.reduce((x, it) => x + it.cantidad, 0), 0);

  function subtotalLocal(vendedorId) {
    const l = locales.find((v) => v.vendedorId === vendedorId);
    if (!l) return 0;
    return l.items.reduce((s, it) => s + it.precio * it.cantidad, 0);
  }

  return (
    <CarritoContext.Provider
      value={{
        locales,
        agregar,
        quitar,
        cambiarCantidad,
        vaciarLocal,
        vaciarTodo,
        cantidadTotal,
        subtotalLocal,
        listo,
      }}
    >
      {children}
    </CarritoContext.Provider>
  );
}

export function useCarrito() {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error('useCarrito debe usarse dentro de CarritoProvider');
  return ctx;
}