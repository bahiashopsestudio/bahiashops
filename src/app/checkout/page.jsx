{/* Botón pagar */}
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch('/api/pedidos/crear', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    vendedorId: local.vendedorId,
                    items: local.items,
                    metodoEnvio: metodoElegido,
                    direccionId: direccionElegida,
                    turnoPreferido: turno,
                    subtotalProductos: subtotal,
                    costoEnvio: costoEnvio,
                    total: total,
                  }),
                });

                const data = await res.json();

                if (!res.ok) {
                  alert('Error: ' + (data.error || 'No se pudo procesar el pago.'));
                  return;
                }

                // Mandar al comprador a MercadoPago para que pague.
                window.location.href = data.checkout_url;
              } catch (err) {
                alert('Error al conectar con el servidor. Probá de nuevo.');
              }
            }}
            style={{
              width: '100%', padding: '0.9rem', fontSize: '1.05rem',
              background: '#009ee3', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            Pagar con MercadoPago
          </button>