// src/app/proximamente/layout.jsx

export const metadata = {
  title: 'Próximamente — Bahía Shops',
  description: 'Estamos preparando un nuevo espacio para descubrir y comprar en los comercios y emprendimientos de Bahía Blanca.',
}

export default function ProximamenteLayout({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      {children}
    </div>
  )
}
