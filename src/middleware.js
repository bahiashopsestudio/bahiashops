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

  // Refrescar sesión (importante: no usar getSession, usar getUser)
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}