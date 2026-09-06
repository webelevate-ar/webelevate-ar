import { calcularArqueo } from '../dinero';
import { CODIGOS, ErrorApp } from '../error-app';
import * as auditoria from '../repositorios/auditoria';
import * as repoCaja from '../repositorios/caja';
import type { SesionUsuario } from '../sesion';

/**
 * Caja: apertura, movimientos y cierre con arqueo ciego.
 *
 * Arqueo ciego quiere decir que al cerrar no se le muestra al cajero cuánto
 * tendría que haber. Si se lo mostrás, escribe ese número y el control deja de
 * existir. La diferencia aparece recién después de declarar.
 */

export interface EstadoDeCaja {
  sesion: Awaited<ReturnType<typeof repoCaja.sesionAbiertaDeUsuario>>;
  totales: repoCaja.TotalesDeSesion | null;
}

export async function estadoActual(sesion: SesionUsuario): Promise<EstadoDeCaja> {
  const abierta = await repoCaja.sesionAbiertaDeUsuario(sesion.usuarioId);
  if (!abierta) return { sesion: null, totales: null };
  return { sesion: abierta, totales: await repoCaja.totalesDeSesion(abierta.id) };
}

export async function abrir(
  datos: { cajaNumero: number; montoInicialCentavos: number },
  sesion: SesionUsuario,
) {
  const yaAbierta = await repoCaja.sesionAbiertaDeUsuario(sesion.usuarioId);
  if (yaAbierta) {
    throw ErrorApp.conflicto(
      CODIGOS.CAJA_YA_ABIERTA,
      `Ya tenés abierta la caja ${yaAbierta.cajaNumero}. Cerrala antes de abrir otra.`,
    );
  }

  const cajaOcupada = await repoCaja.sesionAbiertaDeCaja(datos.cajaNumero);
  if (cajaOcupada) {
    throw ErrorApp.conflicto(
      CODIGOS.CAJA_YA_ABIERTA,
      `La caja ${datos.cajaNumero} ya está abierta por otro usuario.`,
    );
  }

  return repoCaja.abrirSesion({ ...datos, usuarioId: sesion.usuarioId });
}

export async function registrarMovimiento(
  datos: { tipo: 'retiro' | 'ingreso'; montoCentavos: number; motivo: string },
  sesion: SesionUsuario,
  ip: string | null,
) {
  const abierta = await exigirCajaAbierta(sesion);

  if (datos.tipo === 'retiro') {
    const totales = await repoCaja.totalesDeSesion(abierta.id);
    const disponible =
      abierta.montoInicialCentavos +
      totales.ventasEfectivoCentavos +
      totales.ingresosCentavos -
      totales.retirosCentavos -
      totales.devolucionesEfectivoCentavos;

    if (datos.montoCentavos > disponible) {
      throw ErrorApp.datosInvalidos(
        'No podés retirar más de lo que hay en la caja según el sistema.',
      );
    }
  }

  const movimiento = await repoCaja.registrarMovimiento({
    cajaSesionId: abierta.id,
    tipo: datos.tipo,
    montoCentavos: datos.montoCentavos,
    motivo: datos.motivo,
    usuarioId: sesion.usuarioId,
  });

  await auditoria.registrar({
    usuarioId: sesion.usuarioId,
    accion: datos.tipo === 'retiro' ? 'retiro_caja' : 'ingreso_caja',
    entidad: 'CajaSesion',
    entidadId: abierta.id,
    datosDespues: { montoCentavos: datos.montoCentavos, motivo: datos.motivo },
    ip,
  });

  return movimiento;
}

export async function cerrar(
  montoDeclaradoCentavos: number,
  sesion: SesionUsuario,
  ip: string | null,
) {
  const abierta = await exigirCajaAbierta(sesion);
  const totales = await repoCaja.totalesDeSesion(abierta.id);

  const arqueo = calcularArqueo(
    {
      montoInicialCentavos: abierta.montoInicialCentavos,
      ventasEfectivoCentavos: totales.ventasEfectivoCentavos,
      ingresosCentavos: totales.ingresosCentavos,
      retirosCentavos: totales.retirosCentavos,
      devolucionesEfectivoCentavos: totales.devolucionesEfectivoCentavos,
    },
    montoDeclaradoCentavos,
  );

  const cerrada = await repoCaja.cerrarSesion(abierta.id, {
    montoDeclaradoCentavos: arqueo.declaradoCentavos,
    montoEsperadoCentavos: arqueo.esperadoCentavos,
    diferenciaCentavos: arqueo.diferenciaCentavos,
  });

  // Solo se audita el cierre con diferencia: auditar los cierres exactos
  // llenaría la tabla de ruido y taparía justo lo que hay que mirar.
  if (arqueo.diferenciaCentavos !== 0) {
    await auditoria.registrar({
      usuarioId: sesion.usuarioId,
      accion: 'cierre_caja_con_diferencia',
      entidad: 'CajaSesion',
      entidadId: abierta.id,
      datosAntes: { esperadoCentavos: arqueo.esperadoCentavos },
      datosDespues: {
        declaradoCentavos: arqueo.declaradoCentavos,
        diferenciaCentavos: arqueo.diferenciaCentavos,
      },
      ip,
    });
  }

  return { sesion: cerrada, arqueo, totales };
}

export function movimientosDe(cajaSesionId: string) {
  return repoCaja.listarMovimientos(cajaSesionId);
}

export function listarSesiones() {
  return repoCaja.listarSesiones();
}

export function totalesDe(cajaSesionId: string) {
  return repoCaja.totalesDeSesion(cajaSesionId);
}

async function exigirCajaAbierta(sesion: SesionUsuario) {
  const abierta = await repoCaja.sesionAbiertaDeUsuario(sesion.usuarioId);
  if (!abierta) {
    throw ErrorApp.conflicto(CODIGOS.CAJA_CERRADA, 'No tenés una caja abierta.');
  }
  return abierta;
}
