// src/middleware.js

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// ──────────────────────────────────────────────
// Cambiá esto a false cuando quieras abrir el sitio al público
const COMING_SOON = false
// ──────────────────────────────────────────────

// Rutas que siempre quedan accesibles (sin login)
const PUBLIC_PATHS = [
  '/proximamente',
  '/login',
  '/registro',
  '/auth',
  '/api',
  '/_next',
  '/favicon',
]

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

// Cuánto esperamos a Supabase antes de dejar pasar el request sin sesión.
const TIMEOUT_SESION_MS = 2000

// Pide el usuario, pero con un tope de tiempo propio.
//
// Por qué: getUser() no tiene timeout, hereda el de la plataforma. Cuando
// Supabase responde lento, auth-js reintenta el refresh con backoff hasta 30
// segundos (AUTO_REFRESH_TICK_DURATION_MS) y el middleware de Vercel se corta
// a los ~25 — resultado, 504 MIDDLEWARE_INVOCATION_TIMEOUT y el sitio entero
// caído. Pasó el 2026-08-29 por un incidente de latencia de Supabase.
//
// Refrescar la cookie de sesión es una comodidad, no un requisito: cada página
// consulta su propia sesión. Si Supabase tarda, es mucho mejor servir la página
// como visitante anónimo que devolver un error.
//
// Nota: para un visitante sin cookies esto ni sale a la red —getUser() corta
// antes—, así que el tope no cuesta nada en el caso normal.
async function getUserConTope(supabase, pathname) {
  const empezo = Date.now()
  let vencio = false

  const porTiempo = new Promise((resolve) => {
    setTimeout(() => {
      vencio = true
      resolve({ data: { user: null } })
    }, TIMEOUT_SESION_MS)
  })

  // El catch evita que un rechazo tardío quede sin manejar cuando ya ganó el
  // reloj.
  const porSupabase = supabase.auth.getUser().catch((error) => {
    if (!vencio) {
      console.warn(`[middleware] getUser() falló en ${pathname}: ${error?.message}`)
    }
    return { data: { user: null } }
  })

  const resultado = await Promise.race([porSupabase, porTiempo])

  if (vencio) {
    // Queda en los logs de Vercel para saber si esto es de todos los días o
    // fue sólo el incidente. Buscar por "[middleware] timeout".
    console.warn(
      `[middleware] timeout de sesión tras ${Date.now() - empezo}ms en ${pathname} — sigue sin sesión`
    )
  }

  return resultado
}

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refrescar sesión (importante: no usar getSession, usar getUser).
  // Con tope de tiempo: si Supabase no contesta, el request sigue sin sesión.
  //
  // Ojo si algún día COMING_SOON vuelve a true: un timeout deja user=null, así
  // que alguien con sesión iniciada terminaría en /proximamente. Es aceptable
  // como degradación, pero conviene tenerlo presente.
  const {
    data: { user },
  } = await getUserConTope(supabase, request.nextUrl.pathname)

  // ── COMING SOON MODE ──
  if (COMING_SOON) {
    const { pathname } = request.nextUrl

    // Si ya está logueado, dejarlo pasar a todo el sitio
    if (user) {
      // Si un usuario logueado visita /proximamente, mandarlo al home
      if (pathname === '/proximamente') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    // Si NO está logueado y la ruta no es pública, redirigir a /proximamente
    if (!isPublicPath(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/proximamente'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  // 'api/' queda afuera a propósito. Las rutas de /api leen la sesión por su
  // cuenta y pueden escribir cookies solas, así que no necesitan que el
  // middleware se las refresque. Y sobre todo: el webhook de MercadoPago entra
  // por /api. Mientras el middleware estuvo caído, un aviso de pago se podía
  // perder por un problema que no tenía nada que ver con los pagos.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}