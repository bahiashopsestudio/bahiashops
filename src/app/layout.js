import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CarritoProvider } from "@/context/CarritoContext";
import BotonContacto from '@/components/BotonContacto';
import Footer from '@/components/Footer';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  // Dirección oficial del sitio, sin www. Todo path relativo que declare una
  // página (canónicas, imágenes de Open Graph) se resuelve contra esto.
  //
  // Acá NO va la canónica: los campos de metadata se heredan hacia abajo, así
  // que una canónica en el layout raíz haría que toda página que no declare la
  // suya diga que la original es la home. Cada ruta declara la propia; la de
  // la home está en src/app/page.js.
  metadataBase: new URL("https://bahiashops.com.ar"),
  title: "Bahía Shops",
  description: "El marketplace de Bahía Blanca. Descubrí, comprá y conectá con comercios y emprendedores de la ciudad.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CarritoProvider>
          {children}
          <Footer />
          <BotonContacto />
        </CarritoProvider>
      </body>
    </html>
  );
}
