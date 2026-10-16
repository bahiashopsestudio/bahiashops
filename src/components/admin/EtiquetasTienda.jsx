// "Tienda bloqueada" / "Tienda pausada" en las tarjetas de moderación y
// denuncias. Los mismos colores que la lista de vendedores.
export default function EtiquetasTienda({ vendedor }) {
  return (
    <>
      {vendedor?.bloqueado && (
        <span className="text-[10px] font-medium text-white bg-[#cc152b] rounded-full px-[9px] py-[2px]">
          Tienda bloqueada
        </span>
      )}
      {vendedor?.pausada && (
        <span className="text-[10px] font-medium text-gray-600 bg-gray-100 rounded-full px-[9px] py-[2px]">
          Tienda pausada
        </span>
      )}
    </>
  );
}
