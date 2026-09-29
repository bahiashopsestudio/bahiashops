import { redirect } from 'next/navigation'

// /login ya no es una pantalla: la única puerta es /entrar. Se conserva toda
// la query (next, motivo, error) y se abre la pestaña "Ya tengo cuenta".
export default async function LoginPage({ searchParams }) {
  const query = new URLSearchParams()
  for (const [clave, valor] of Object.entries(await searchParams)) {
    for (const v of [].concat(valor)) query.append(clave, v)
  }
  query.set('modo', 'cuenta')
  redirect(`/entrar?${query}`)
}
