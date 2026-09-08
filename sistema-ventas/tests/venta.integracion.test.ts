import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarBaseDePrueba, crearBaseDePrueba } from './preparar-base';

/**
 * Tests de integración (§9): la transacción de la venta, la idempotencia y la
 * concurrencia de dos cajas sobre el mismo producto.
 *
 * Corren contra SQLite de verdad, con las migraciones aplicadas. Un mock del
 * cliente de base no probaría nada de esto: justamente lo que puede fallar es
 * lo que hace la base.
 */

// La URL tiene que estar puesta antes de importar el módulo que crea el
// cliente, porque la lee al importarse.
crearBaseDePrueba();

const { prisma } = await import('@/lib/prisma');
const servicioVentas = await import('@/lib/servicios/ventas');
const servicioCaja = await import('@/lib/servicios/caja');

const sesionCajero = {
  usuarioId: '',
  nombre: 'Cajero',
  rol: 'CAJERO' as const,
  vence: Date.now() + 3_600_000,
};

let productoId = '';
let productoCaroId = '';

beforeAll(async () => {
  const cajero = await prisma.usuario.create({
    data: { nombre: 'Cajero', rol: 'CAJERO', pinHash: await bcrypt.hash('1111', 4) },
  });
  sesionCajero.usuarioId = cajero.id;

  const categoria = await prisma.categoria.create({
    data: { nombre: 'Almacén', color: '#c9922f', orden: 0 },
  });

  const producto = await prisma.producto.create({
    data: {
      sku: 'TEST-0001',
      codigoBarras: '7790000000017',
      nombre: 'Yerba mate 1 kg',
      nombreBusqueda: 'yerba mate 1 kg',
      categoriaId: categoria.id,
      precioVentaCentavos: 250_000,
      precioCostoCentavos: 180_000,
      stockMilesimas: 10_000,
      stockMinimoMilesimas: 5_000,
      unidad: 'unidad',
    },
  });
  productoId = producto.id;

  const caro = await prisma.producto.create({
    data: {
      sku: 'TEST-0002',
      nombre: 'Aceite de oliva 500 ml',
      nombreBusqueda: 'aceite de oliva 500 ml',
      categoriaId: categoria.id,
      precioVentaCentavos: 900_000,
      precioCostoCentavos: 600_000,
      stockMilesimas: 3_000,
      stockMinimoMilesimas: 2_000,
      unidad: 'unidad',
    },
  });
  productoCaroId = caro.id;

  await prisma.contador.create({ data: { nombre: 'venta', valor: 0 } });
  await servicioCaja.abrir({ cajaNumero: 1, montoInicialCentavos: 5_000_000 }, sesionCajero);
});

afterAll(async () => {
  await prisma.$disconnect();
  borrarBaseDePrueba();
});

describe('crear una venta', () => {
  it('escribe venta, ítems, pagos, movimiento de stock y movimiento de caja', async () => {
    const { venta, yaExistia } = await servicioVentas.crearVenta(
      {
        claveIdempotencia: crypto.randomUUID(),
        items: [{ productoId, cantidadMilesimas: 2000 }],
        pagos: [{ metodo: 'efectivo', montoCentavos: 600_000 }],
        descuentoPorcentajeCentesimas: 0,
        clienteId: null,
        pinSupervisor: null,
        cobradaSinConexionEn: null,
        totalCobradoCentavos: null,
      },
      sesionCajero,
      null,
    );

    expect(yaExistia).toBe(false);
    expect(venta.numero).toBe(1);
    expect(venta.totalCentavos).toBe(500_000);
    expect(venta.items).toHaveLength(1);
    expect(venta.pagos[0]?.vueltoCentavos).toBe(100_000);

    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect(producto.stockMilesimas).toBe(8_000);

    const movimientos = await prisma.movimientoStock.findMany({ where: { ventaId: venta.id } });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.cantidadMilesimas).toBe(-2000);
    expect(movimientos[0]?.stockResultanteMilesimas).toBe(8_000);

    // Al cajón entran $5.000, no los $6.000 que entregó el cliente.
    const caja = await prisma.movimientoCaja.findFirst({
      where: { tipo: 'venta' },
      orderBy: { creadoEn: 'desc' },
    });
    expect(caja?.montoCentavos).toBe(500_000);
  });

  it('ignora el precio que mande el cliente y usa el de la base', async () => {
    const { venta } = await servicioVentas.crearVenta(
      {
        claveIdempotencia: crypto.randomUUID(),
        // El tipo no deja mandar precio, y el servicio tampoco lo leería: el
        // precio sale del producto. Este test fija esa garantía.
        items: [{ productoId: productoCaroId, cantidadMilesimas: 1000 }],
        pagos: [{ metodo: 'debito', montoCentavos: 900_000 }],
        descuentoPorcentajeCentesimas: 0,
        clienteId: null,
        pinSupervisor: null,
        cobradaSinConexionEn: null,
        totalCobradoCentavos: null,
      },
      sesionCajero,
      null,
    );

    expect(venta.totalCentavos).toBe(900_000);
    expect(venta.items[0]?.precioUnitarioCentavos).toBe(900_000);
    expect(venta.items[0]?.nombreSnapshot).toBe('Aceite de oliva 500 ml');
  });

  it('rechaza cuando los pagos no cubren el total, sin dejar nada a medias', async () => {
    const stockAntes = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;
    const ventasAntes = await prisma.venta.count();

    await expect(
      servicioVentas.crearVenta(
        {
          claveIdempotencia: crypto.randomUUID(),
          items: [{ productoId, cantidadMilesimas: 1000 }],
          pagos: [{ metodo: 'efectivo', montoCentavos: 100 }],
          descuentoPorcentajeCentesimas: 0,
          clienteId: null,
          pinSupervisor: null,
          cobradaSinConexionEn: null,
          totalCobradoCentavos: null,
        },
        sesionCajero,
        null,
      ),
    ).rejects.toThrow();

    expect(await prisma.venta.count()).toBe(ventasAntes);
    const stockDespues = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;
    expect(stockDespues).toBe(stockAntes);
  });
});

describe('idempotencia', () => {
  it('la misma clave dos veces devuelve la venta original y no cobra de nuevo', async () => {
    const clave = crypto.randomUUID();
    const datos = {
      claveIdempotencia: clave,
      items: [{ productoId, cantidadMilesimas: 1000 }],
      pagos: [{ metodo: 'efectivo' as const, montoCentavos: 250_000 }],
      descuentoPorcentajeCentesimas: 0,
      clienteId: null,
      pinSupervisor: null,
      cobradaSinConexionEn: null,
      totalCobradoCentavos: null,
    };

    const stockAntes = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;

    const primera = await servicioVentas.crearVenta(datos, sesionCajero, null);
    const segunda = await servicioVentas.crearVenta(datos, sesionCajero, null);

    expect(primera.yaExistia).toBe(false);
    expect(segunda.yaExistia).toBe(true);
    expect(segunda.venta.id).toBe(primera.venta.id);
    expect(segunda.venta.numero).toBe(primera.venta.numero);

    // Lo que importa de verdad: el stock bajó una sola vez.
    const stockDespues = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;
    expect(stockDespues).toBe(stockAntes - 1000);
  });
});

describe('concurrencia', () => {
  it('dos cajas cobrando el mismo producto a la vez descuentan las dos veces', async () => {
    const stockAntes = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;

    const cobrar = () =>
      servicioVentas.crearVenta(
        {
          claveIdempotencia: crypto.randomUUID(),
          items: [{ productoId, cantidadMilesimas: 1000 }],
          pagos: [{ metodo: 'efectivo', montoCentavos: 250_000 }],
          descuentoPorcentajeCentesimas: 0,
          clienteId: null,
          pinSupervisor: null,
          cobradaSinConexionEn: null,
          totalCobradoCentavos: null,
        },
        sesionCajero,
        null,
      );

    const [una, otra] = await Promise.all([cobrar(), cobrar()]);

    // Con lectura-modificación-escritura en JavaScript, una de las dos pisaría
    // a la otra y el stock bajaría una sola unidad. Con `decrement` atómico,
    // bajan las dos.
    const stockDespues = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;
    expect(stockDespues).toBe(stockAntes - 2000);

    // Y los números de venta no se repiten, que es lo que rompería `count() + 1`.
    expect(una.venta.numero).not.toBe(otra.venta.numero);
  });

  it('veinte ventas simultáneas no repiten números', async () => {
    const antes = await prisma.venta.count();

    await Promise.all(
      Array.from({ length: 20 }, () =>
        servicioVentas.crearVenta(
          {
            claveIdempotencia: crypto.randomUUID(),
            items: [{ productoId: productoCaroId, cantidadMilesimas: 1000 }],
            pagos: [{ metodo: 'qr', montoCentavos: 900_000 }],
            descuentoPorcentajeCentesimas: 0,
            clienteId: null,
            pinSupervisor: null,
            cobradaSinConexionEn: null,
            totalCobradoCentavos: null,
          },
          sesionCajero,
          null,
        ),
      ),
    );

    const numeros = (await prisma.venta.findMany({ select: { numero: true } })).map(
      (fila) => fila.numero,
    );
    expect(numeros).toHaveLength(antes + 20);

    // Lo que se exige es que **no se repitan**. No que sean consecutivos: en
    // PostgreSQL el número sale de una secuencia y una transacción anulada deja
    // un hueco. Un hueco es normal en cualquier numeración; dos ventas con el
    // mismo número serían un problema de verdad.
    expect(new Set(numeros).size).toBe(numeros.length);
  });
});

describe('ventas cobradas sin conexión', () => {
  it('entra, y queda registrado que fue offline y cuánto tardó en llegar', async () => {
    const cobradaEn = new Date(Date.now() - 90 * 60_000).toISOString();

    const { venta } = await servicioVentas.crearVenta(
      {
        claveIdempotencia: crypto.randomUUID(),
        items: [{ productoId, cantidadMilesimas: 1000 }],
        pagos: [{ metodo: 'efectivo', montoCentavos: 250_000 }],
        descuentoPorcentajeCentesimas: 0,
        clienteId: null,
        pinSupervisor: null,
        cobradaSinConexionEn: cobradaEn,
        totalCobradoCentavos: 250_000,
      },
      sesionCajero,
      null,
    );

    expect(venta.totalCentavos).toBe(250_000);

    const registro = await prisma.auditLog.findFirst({
      where: { accion: 'venta_offline', entidadId: venta.id },
    });
    expect(registro).not.toBeNull();

    // La demora explica por qué una venta de hace hora y media tiene número de
    // ahora: sin ese dato, el historial parece desordenado y nadie sabe por qué.
    const despues = JSON.parse(registro?.datosDespues ?? '{}') as { demoraMinutos: number };
    expect(despues.demoraMinutos).toBeGreaterThanOrEqual(89);
  });

  it('si el precio cambió en el medio, no entra: se rechaza con los dos importes', async () => {
    /*
     * El caso: se cobró $2.400 sin conexión y hoy el producto vale $2.500.
     * Aceptarla anotando los $100 como descuento cuadraría todo, y sería un
     * agujero: cualquier cajero podría darse un descuento diciendo que la venta
     * fue offline. Se rechaza, queda visible, y la resuelve una persona.
     */
    await expect(
      servicioVentas.crearVenta(
        {
          claveIdempotencia: crypto.randomUUID(),
          items: [{ productoId, cantidadMilesimas: 1000 }],
          pagos: [{ metodo: 'efectivo', montoCentavos: 240_000 }],
          descuentoPorcentajeCentesimas: 0,
          clienteId: null,
          pinSupervisor: null,
          cobradaSinConexionEn: new Date().toISOString(),
          totalCobradoCentavos: 240_000,
        },
        sesionCajero,
        null,
      ),
    ).rejects.toMatchObject({ codigo: 'PRECIO_DESFASADO' });
  });

  it('un precio que bajó también se rechaza, y no por capricho', async () => {
    // Si entrara, el servidor calcularía un vuelto de $100 que el cliente nunca
    // recibió, y ese vuelto de mentira saldría del cajón en el arqueo.
    await expect(
      servicioVentas.crearVenta(
        {
          claveIdempotencia: crypto.randomUUID(),
          items: [{ productoId, cantidadMilesimas: 1000 }],
          pagos: [{ metodo: 'efectivo', montoCentavos: 260_000 }],
          descuentoPorcentajeCentesimas: 0,
          clienteId: null,
          pinSupervisor: null,
          cobradaSinConexionEn: new Date().toISOString(),
          totalCobradoCentavos: 260_000,
        },
        sesionCajero,
        null,
      ),
    ).rejects.toMatchObject({ codigo: 'PRECIO_DESFASADO' });
  });

  it('reenviarla no cobra dos veces ni duplica el registro de auditoría', async () => {
    // Es exactamente lo que hace la cola al reintentar: manda la misma clave.
    const clave = crypto.randomUUID();
    const cuerpo = {
      claveIdempotencia: clave,
      items: [{ productoId, cantidadMilesimas: 1000 }],
      pagos: [{ metodo: 'efectivo' as const, montoCentavos: 250_000 }],
      descuentoPorcentajeCentesimas: 0,
      clienteId: null,
      pinSupervisor: null,
      cobradaSinConexionEn: new Date().toISOString(),
      totalCobradoCentavos: 250_000,
    };

    const stockAntes = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;

    const primera = await servicioVentas.crearVenta(cuerpo, sesionCajero, null);
    const segunda = await servicioVentas.crearVenta(cuerpo, sesionCajero, null);

    expect(primera.yaExistia).toBe(false);
    expect(segunda.yaExistia).toBe(true);
    expect(segunda.venta.id).toBe(primera.venta.id);

    const stockDespues = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;
    // Una sola vez descontado: si el reintento descontara de nuevo, el stock
    // quedaría mal y nadie lo notaría hasta el recuento.
    expect(stockAntes - stockDespues).toBe(1000);

    const registros = await prisma.auditLog.count({
      where: { accion: 'venta_offline', entidadId: primera.venta.id },
    });
    expect(registros).toBe(1);
  });
});

describe('anulación', () => {
  it('devuelve el stock y genera el movimiento inverso de caja', async () => {
    const { venta } = await servicioVentas.crearVenta(
      {
        claveIdempotencia: crypto.randomUUID(),
        items: [{ productoId, cantidadMilesimas: 1000 }],
        pagos: [{ metodo: 'efectivo', montoCentavos: 250_000 }],
        descuentoPorcentajeCentesimas: 0,
        clienteId: null,
        pinSupervisor: null,
        cobradaSinConexionEn: null,
        totalCobradoCentavos: null,
      },
      sesionCajero,
      null,
    );

    const stockConVenta = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;

    const supervisor = {
      ...sesionCajero,
      rol: 'SUPERVISOR' as const,
      nombre: 'Supervisor',
    };
    const anulada = await servicioVentas.anular(venta.id, 'Prueba de anulación', supervisor, null);

    expect(anulada.estado).toBe('anulada');
    expect(anulada.motivoAnulacion).toBe('Prueba de anulación');

    const stockDespues = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }))
      .stockMilesimas;
    expect(stockDespues).toBe(stockConVenta + 1000);

    const inverso = await prisma.movimientoCaja.findFirst({
      where: { tipo: 'devolucion' },
      orderBy: { creadoEn: 'desc' },
    });
    expect(inverso?.montoCentavos).toBe(250_000);

    // La venta no se borra: sigue en la base, marcada.
    expect(await prisma.venta.findUnique({ where: { id: venta.id } })).not.toBeNull();

    // Y queda registrada en la auditoría.
    const auditoria = await prisma.auditLog.findFirst({
      where: { accion: 'anulacion_venta', entidadId: venta.id },
    });
    expect(auditoria).not.toBeNull();

    await expect(
      servicioVentas.anular(venta.id, 'Otra vez', supervisor, null),
    ).rejects.toThrow(/ya estaba anulada/i);
  });
});

describe('arqueo de caja contra la base', () => {
  it('el esperado sale de los movimientos, no de un acumulador', async () => {
    const estado = await servicioCaja.estadoActual(sesionCajero);
    expect(estado.sesion).not.toBeNull();

    const totales = estado.totales;
    if (!totales || !estado.sesion) throw new Error('Falta la sesión de caja');

    const esperado =
      estado.sesion.montoInicialCentavos +
      totales.ventasEfectivoCentavos +
      totales.ingresosCentavos -
      totales.retirosCentavos -
      totales.devolucionesEfectivoCentavos;

    const cierre = await servicioCaja.cerrar(esperado - 50_000, sesionCajero, null);

    expect(cierre.arqueo.esperadoCentavos).toBe(esperado);
    expect(cierre.arqueo.diferenciaCentavos).toBe(-50_000);
    expect(cierre.arqueo.falta).toBe(true);

    const auditoria = await prisma.auditLog.findFirst({
      where: { accion: 'cierre_caja_con_diferencia' },
    });
    expect(auditoria).not.toBeNull();
  });
});
