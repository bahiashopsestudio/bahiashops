// src/app/api/waitlist/route.js

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const { email } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('waitlist')
      .insert({ email })
      .select()
      .single()

    if (error) {
      // Unique constraint violation = email ya existe
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Email ya registrado' },
          { status: 409 }
        )
      }
      console.error('Error waitlist:', error)
      return NextResponse.json(
        { error: 'Error al guardar' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error waitlist:', err)
    return NextResponse.json(
      { error: 'Error del servidor' },
      { status: 500 }
    )
  }
}