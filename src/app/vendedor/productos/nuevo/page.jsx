'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import imageCompression from 'browser-image-compression';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Una miniatura arrastrable
function SortableFoto({ foto, index, onQuitar }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: foto.preview });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: '90px',
    height: '90px',
    position: 'relative',
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <img
        src={foto.preview}
        alt={`Foto ${index + 1}`}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px', border: '1px solid #ddd' }}
      />
      {index === 0 && (
        <span style={{ position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px' }}>
          Principal
        </span>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onQuitar(index)}
        style={{ position: 'absolute', top: '-8px', right: '-8px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#e00', color: 'white', cursor: 'pointer', lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

export default function NuevoProductoPage() {
  const supabase = createClient();

  const [datos, setDatos] = useState({
    nombre: '',
    descripcion: '',
    subcategoria_id: '',
    marca: '',
    precio: '',
    precio_anterior: '',
  });

  const [subcategorias, setSubcategorias] = useState([]);
  const [categoriaVendedor, setCategoriaVendedor] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [comprimiendo, setComprimiendo] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    async function cargarCategoriaVendedor() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('vendedores')
        .select('categoria_id')
        .eq('usuario_id', user.id)
        .single();
      if (error) {
        console.error('Error cargando categoría del vendedor:', error);
      } else {
        setCategoriaVendedor(data.categoria_id);
      }
    }
    cargarCategoriaVendedor();
  }, []);

  useEffect(() => {
    if (!categoriaVendedor) {
      setSubcategorias([]);
      return;
    }
    async function cargarSubcategorias() {
      const { data, error } = await supabase
        .from('subcategorias')
        .select('id, nombre')
        .eq('categoria_id', categoriaVendedor)
        .eq('activa', true)
        .order('orden');
      if (error) {
        console.error('Error cargando subcategorías:', error);
      } else {
        setSubcategorias(data);
      }
    }
    cargarSubcategorias();
  }, [categoriaVendedor]);

  function actualizarCampo(campo, valor) {
    setDatos({ ...datos, [campo]: valor });
  }

  function formatearPrecio(valor) {
    if (!valor) return '';
    return Number(valor).toLocaleString('es-AR');
  }

  async function agregarFotos(e) {
    const archivos = Array.from(e.target.files);
    if (archivos.length === 0) return;
    const espacioDisponible = 5 - fotos.length;
    if (espacioDisponible <= 0) return;
    const aProcesar = archivos.slice(0, espacioDisponible);
    setComprimiendo(true);
    const opciones = { maxSizeMB: 0.2, maxWidthOrHeight: 1200, useWebWorker: true };
    const nuevas = [];
    for (const archivo of aProcesar) {
      try {
        const comprimida = await imageCompression(archivo, opciones);
        nuevas.push({ file: comprimida, preview: URL.createObjectURL(comprimida) });
      } catch (err) {
        console.error('Error comprimiendo imagen:', err);
      }
    }
    setFotos((prev) => [...prev, ...nuevas]);
    setComprimiendo(false);
    e.target.value = '';
  }

  function quitarFoto(index) {
    setFotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function alSoltarFoto(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFotos((prev) => {
      const desde = prev.findIndex((f) => f.preview === active.id);
      const hasta = prev.findIndex((f) => f.preview === over.id);
      return arrayMove(prev, desde, hasta);
    });
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
      <h1>Nuevo producto</h1>

      <section style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Datos básicos</h2>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="nombre" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Nombre del producto *
          </label>
          <input
            id="nombre"
            type="text"
            value={datos.nombre}
            onChange={(e) => actualizarCampo('nombre', e.target.value)}
            placeholder="Ej: Remera básica de algodón"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="descripcion" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Descripción *
          </label>
          <textarea
            id="descripcion"
            value={datos.descripcion}
            onChange={(e) => actualizarCampo('descripcion', e.target.value)}
            placeholder="Describí el producto: materiales, características, cuidados..."
            rows={4}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        {subcategorias.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="subcategoria" style={{ display: 'block', marginBottom: '0.25rem' }}>
              Subcategoría
            </label>
            <select
              id="subcategoria"
              value={datos.subcategoria_id}
              onChange={(e) => actualizarCampo('subcategoria_id', e.target.value)}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="">Elegí una subcategoría (opcional)</option>
              {subcategorias.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="marca" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Marca (opcional)
          </label>
          <input
            id="marca"
            type="text"
            value={datos.marca}
            onChange={(e) => actualizarCampo('marca', e.target.value)}
            placeholder="Si aplica"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="precio" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Precio *
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>
              $
            </span>
            <input
              id="precio"
              type="text"
              inputMode="numeric"
              value={formatearPrecio(datos.precio)}
              onChange={(e) => actualizarCampo('precio', e.target.value.replace(/\D/g, ''))}
              placeholder="15.000"
              style={{ width: '100%', padding: '0.5rem', paddingLeft: '1.6rem' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="precio_anterior" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Precio anterior (opcional, si está en oferta)
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>
              $
            </span>
            <input
              id="precio_anterior"
              type="text"
              inputMode="numeric"
              value={formatearPrecio(datos.precio_anterior)}
              onChange={(e) => actualizarCampo('precio_anterior', e.target.value.replace(/\D/g, ''))}
              placeholder="Si lo completás, se mostrará tachado"
              style={{ width: '100%', padding: '0.5rem', paddingLeft: '1.6rem' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            Fotos * (hasta 5, arrastrá para ordenar — la primera es la principal)
          </label>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltarFoto}>
            <SortableContext items={fotos.map((f) => f.preview)} strategy={horizontalListSortingStrategy}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {fotos.map((foto, index) => (
                  <SortableFoto key={foto.preview} foto={foto} index={index} onQuitar={quitarFoto} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {fotos.length < 5 && (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={agregarFotos}
              disabled={comprimiendo}
            />
          )}
          <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.4rem' }}>
            {comprimiendo ? 'Procesando imágenes...' : `${fotos.length} de 5 fotos`}
          </p>
        </div>
      </section>
    </main>
  );
}