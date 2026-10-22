'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  sinElLocal, guardarCarrito, normalizarCarrito, agregarLinea, cambiarCantidadLinea, quitarLinea, asignarVariante,
} from '@/lib/carrito';
import { comprasRecientes, sinLoYaComprado } from '@/lib/compraReciente';
import { createClient } from '@/lib/supabase/client';

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
      if (guardado) setLocales(normalizarCarrito(JSON.parse(guardado)));
    } catch (e) {
      console.error('No se pudo leer el carrito', e);
    }
    setListo(true);
  }, []);

  // Respaldo del vaciado de /compra/exito y /compra/pendiente: si la persona no
  // volvió de MercadoPago (cerró la pestaña, pagó desde otro dispositivo, se le
  // venció la sesión), lo que ya compró sigue acá. Con sesión, se cruza contra
  // sus pedidos recientes y sale (src/lib/compraReciente.js). Corre al cargar y
  // al iniciar sesión. Sin sesión no consulta nada.
  useEffect(() => {
    if (!listo) return;
    const supabase = createClient();
    let vigente = true;
    async function cruzar() {
      const ahora = Date.now();
      const pedidos = await comprasRecientes(supabase, ahora);
      if (vigente && pedidos) setLocales((actual) => sinLoYaComprado(actual, pedidos, ahora));
    }
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      // Fuera del aviso: supabase-js no deja llamarse a sí mismo desde adentro.
      if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') setTimeout(cruzar, 0);
    });
    return () => {
      vigente = false;
      data?.subscription?.unsubscribe();
    };
  }, [listo]);

  // Cada vez que cambia, lo vuelve a guardar (para que no se pierda al recargar).
  // Vacío no se guarda nada: la clave se borra.
  useEffect(() => {
    if (listo) guardarCarrito(localStorage, CLAVE, locales);
  }, [locales, listo]);

  // Agrega un producto al local que corresponde. Nunca borra otros locales.
  // agregadoEn: cuándo se eligió por última vez. Con eso, el cruce contra los
  // pedidos saca solo lo que estaba antes de una compra, no lo que vino después.
  // Cada talle es una línea aparte: la identidad es producto + variante
  // (claveLinea, src/lib/carrito.js).
  function agregar(producto, vendedor) {
    const agregadoEn = Date.now();
    setLocales((actual) => agregarLinea(actual, producto, vendedor, agregadoEn));
  }

  // 'clave' es claveLinea(item): cambia UNA línea, no todos los talles.
  function cambiarCantidad(vendedorId, clave, cantidad) {
    setLocales((actual) => cambiarCantidadLinea(actual, vendedorId, clave, cantidad));
  }

  // Quita una línea. Si un local se queda sin productos, desaparece de la canasta.
  function quitar(vendedorId, clave) {
    setLocales((actual) => quitarLinea(actual, vendedorId, clave));
  }

  // Elige el talle de una línea que no lo tenía (asignarVariante: si ya había
  // una línea con ese talle, se juntan).
  function elegirVariante(vendedorId, clave, variante) {
    setLocales((actual) => asignarVariante(actual, vendedorId, clave, variante));
  }

  // Pone los precios que confirmó el servidor. Se usa cuando el checkout
  // rechaza la compra porque algún precio cambió desde que se agregó al
  // carrito: el servidor manda los precios de verdad y acá se corrigen, para
  // que la persona vea el total nuevo antes de volver a confirmar.
  // 'precios' es { [productoId]: precioNuevo }.
  function actualizarPrecios(vendedorId, precios) {
    setLocales((actual) =>
      actual.map((l) =>
        l.vendedorId !== vendedorId
          ? l
          : {
              ...l,
              items: l.items.map((it) =>
                precios[it.productoId] !== undefined
                  ? { ...it, precio: Number(precios[it.productoId]) }
                  : it
              ),
            }
      )
    );
  }

  // Vacía un local entero (lo usamos después de que se pagó ese local). Los de
  // las demás tiendas no se tocan.
  function vaciarLocal(vendedorId) {
    setLocales((actual) => sinElLocal(actual, vendedorId));
  }

  // Estable entre renders: lo usa LimpiezaDeSesion al cerrar sesión.
  const vaciarTodo = useCallback(() => {
    setLocales([]);
  }, []);

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
        elegirVariante,
        cambiarCantidad,
        actualizarPrecios,
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