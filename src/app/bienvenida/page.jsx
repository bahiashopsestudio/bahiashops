// La bienvenida: la primera vez que entra una cuenta nueva, antes de seguir a
// next. Acá elige cómo la van a ver (apodo e imagen) y, si faltan, completa
// nombre y apellido. Al tocar "Listo, seguir" se marca bienvenida_vista_en y
// no vuelve a aparecer.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { rutaInterna } from '@/lib/rutas'
import BienvenidaFormulario from './BienvenidaFormulario'

export const metadata = {
  title: 'Bienvenida — Bahía Shops',
  robots: { index: false, follow: false },
}

// Qué datos pedir. Con Google a veces llega todo junto en nombre: se sugiere
// la primera palabra como nombre y el resto como apellido, editable.
function datosFaltantes(nombreCuenta, apellidoCuenta) {
  const nombre = (nombreCuenta || '').trim()
  const apellido = (apellidoCuenta || '').trim()

  if (nombre && apellido) return null
  if (!nombre && apellido) return { pedirNombre: true, pedirApellido: false, nombre: '', apellido: '' }
  if (nombre && !apellido) {
    const palabras = nombre.split(/\s+/)
    if (palabras.length > 1) {
      return { pedirNombre: true, pedirApellido: true, nombre: palabras[0], apellido: palabras.slice(1).join(' ') }
    }
    return { pedirNombre: false, pedirApellido: true, nombre: '', apellido: '' }
  }
  return { pedirNombre: true, pedirApellido: true, nombre: '', apellido: '' }
}

export default async function BienvenidaPage({ searchParams }) {
  const { next: nextCrudo } = await searchParams
  const next = rutaInterna(typeof nextCrudo === 'string' ? nextCrudo : null)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Sin sesión: a entrar, con vuelta acá (y a donde iba después).
  if (!user) {
    const vuelta = next === '/' ? '/bienvenida' : `/bienvenida?next=${encodeURIComponent(next)}`
    redirect(`/entrar?next=${encodeURIComponent(vuelta)}`)
  }

  const { data: cuenta } = await supabase
    .from('usuarios')
    .select('nombre, apellido, nombre_usuario, imagen_perfil, bienvenida_vista_en')
    .eq('id', user.id)
    .maybeSingle()

  // Ya la vio (por ejemplo, volvió con el botón de atrás): sigue de largo.
  if (cuenta?.bienvenida_vista_en) redirect(next)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />
      <BienvenidaFormulario
        next={next}
        apodoInicial={cuenta?.nombre_usuario || ''}
        imagenInicial={cuenta?.imagen_perfil === 'foto' ? 'foto' : 'dibujo'}
        faltantes={datosFaltantes(cuenta?.nombre, cuenta?.apellido)}
      />
    </>
  )
}
