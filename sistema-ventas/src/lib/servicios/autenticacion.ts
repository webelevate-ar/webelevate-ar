import bcrypt from 'bcryptjs';
import { CODIGOS, ErrorApp } from '../error-app';
import * as usuarios from '../repositorios/usuarios';
import { vencimientoDeTurno, type SesionUsuario } from '../sesion';
import { esquemaRol, type Rol } from '../validacion/enums';

/**
 * Login por PIN.
 *
 * Un PIN de cuatro dígitos son diez mil combinaciones: el hash no lo salva de
 * un ataque por fuerza bruta, lo salva el bloqueo. Por eso cinco intentos
 * fallidos bloquean el usuario cinco minutos, y ese bloqueo vive en la base y
 * no en memoria: si viviera en memoria, reiniciar el servidor lo borraría.
 */

const MAXIMO_INTENTOS = 5;
const MINUTOS_BLOQUEO = 5;
export const COSTO_BCRYPT = 11;

export async function ingresar(usuarioId: string, pin: string): Promise<SesionUsuario> {
  const usuario = await usuarios.buscarPorId(usuarioId);

  // Mismo mensaje para usuario inexistente y PIN equivocado: decir cuál de las
  // dos falló es contarle a quien prueba cuáles son los usuarios que existen.
  if (!usuario || !usuario.activo) throw pinIncorrecto();

  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
    const minutos = Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60_000);
    throw new ErrorApp(
      CODIGOS.USUARIO_BLOQUEADO,
      `El usuario está bloqueado por intentos fallidos. Probá en ${minutos} minuto(s).`,
      423,
    );
  }

  const coincide = await bcrypt.compare(pin, usuario.pinHash);
  if (!coincide) {
    const resultado = await usuarios.registrarIntentoFallido(
      usuario.id,
      MAXIMO_INTENTOS,
      MINUTOS_BLOQUEO,
    );
    if (resultado.bloqueadoHasta) {
      throw new ErrorApp(
        CODIGOS.USUARIO_BLOQUEADO,
        `Cinco intentos fallidos. El usuario queda bloqueado ${MINUTOS_BLOQUEO} minutos.`,
        423,
      );
    }
    throw pinIncorrecto(MAXIMO_INTENTOS - resultado.intentos);
  }

  await usuarios.limpiarIntentos(usuario.id);

  return {
    usuarioId: usuario.id,
    nombre: usuario.nombre,
    rol: esquemaRol.parse(usuario.rol),
    vence: vencimientoDeTurno(),
  };
}

/**
 * Autorización puntual de un supervisor sin cerrar la sesión del cajero:
 * es lo que pide el descuento manual del `F8`. Devuelve quién autorizó, para
 * que quede en la auditoría con nombre y apellido.
 */
export async function autorizarConPinDeSupervisor(
  pin: string,
): Promise<{ usuarioId: string; nombre: string; rol: Rol }> {
  const candidatos = await usuarios.buscarPorRoles(['ADMIN', 'SUPERVISOR']);
  for (const candidato of candidatos) {
    if (await bcrypt.compare(pin, candidato.pinHash)) {
      return {
        usuarioId: candidato.id,
        nombre: candidato.nombre,
        rol: esquemaRol.parse(candidato.rol),
      };
    }
  }
  throw ErrorApp.sinPermiso('El PIN de supervisor no es correcto.');
}

export function listarUsuariosParaElegir() {
  return usuarios.listarActivos();
}

export function hashearPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, COSTO_BCRYPT);
}

function pinIncorrecto(intentosRestantes?: number): ErrorApp {
  const detalle =
    intentosRestantes !== undefined && intentosRestantes > 0
      ? ` Te quedan ${intentosRestantes} intento(s).`
      : '';
  return new ErrorApp(CODIGOS.PIN_INCORRECTO, `El PIN no es correcto.${detalle}`, 401);
}
