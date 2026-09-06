import * as repo from '../repositorios/auditoria';

export { NOMBRE_ACCION } from '../acciones';

export function listarAuditoria(limite = 150) {
  return repo.listar(limite);
}
