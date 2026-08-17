// src/app/local-shops/layout.jsx

export const metadata = {
  title: 'Local Shops — Bahía Shops',
  description: 'Local Shops es el proyecto que busca llevar el modelo de Bahía Shops a otras ciudades. Todavía se está construyendo.',
}

export default function LocalShopsLayout({ children }) {
  return (
    <div className="min-h-screen flex items-start justify-center bg-gray-50 px-4 pt-24 pb-16">
      {children}
    </div>
  )
}
