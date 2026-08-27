#!/bin/bash
# Instala el plugin de Cloudflare al arrancar cada sesion de Claude Code en la
# nube, para que sus servidores MCP esten disponibles sin reinstalar a mano.
#
# Por que existe este archivo:
#   El contenedor de una sesion en la nube es efimero. El 27/08/2026 se
#   instalo el plugin a mano y funciono, pero se pierde cuando el contenedor
#   se recicla. Esto lo repone solo.
#
# Que habilita:
#   Los servidores de Cloudflare (mcp.cloudflare.com y compania) dejan a la
#   sesion tocar DNS, Redirect Rules, rutas del Worker y Email Routing, que
#   hoy son pasos manuales para Nahuel en el panel.
#
# Ojo: instalar NO es autenticar. La primera vez que la sesion use una
# herramienta de Cloudflare se dispara el OAuth y Nahuel tiene que aprobarlo
# en el navegador. Eso es a proposito: el permiso queda atado a su cuenta,
# lo ve y lo revoca cuando quiera, y no hay ningun token dando vueltas.
set -euo pipefail

# Solo en la nube. En una sesion local no se toca la instalacion de nadie.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

command -v claude >/dev/null 2>&1 || exit 0

# Idempotente: si ya estan puestos, los dos comandos avisan y siguen de largo.
# Por eso el || true — que ya este instalado no es un error.
claude plugin marketplace add cloudflare/skills  >/dev/null 2>&1 || true
claude plugin install cloudflare@cloudflare      >/dev/null 2>&1 || true

echo "Cloudflare: plugin y servidores MCP listos."
