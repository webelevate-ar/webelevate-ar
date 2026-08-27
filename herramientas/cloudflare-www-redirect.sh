#!/bin/bash
# Crea la Redirect Rule de www.webelevate.com.ar al dominio pelado, por API.
#
# Por que existe:
#   Este era uno de los tres pendientes "de panel" que ninguna sesion podia
#   hacer. La suposicion era que hacia falta el MCP mcp.cloudflare.com y su
#   OAuth, que solo se aprueba en sesion interactiva. No es asi: la API REST
#   de Cloudflare llega bien desde el contenedor (medido el 27/08) y hace
#   exactamente lo mismo. Lo unico que falta es un token valido.
#
# El token:
#   Se pasa por la variable CLOUDFLARE_API_TOKEN. NO se escribe en este
#   archivo ni en ningun otro del repositorio.
#
#   Alcanza con DOS permisos, no hace falta acceso total:
#     - Zone > Single Redirect > Edit   (crear la regla)
#     - Zone > Zone > Read              (encontrar el ID de la zona)
#
#   Se crea en https://dash.cloudflare.com/profile/api-tokens
#   -> Create Token -> Create Custom Token.
#
# Uso:
#   export CLOUDFLARE_API_TOKEN='...'
#   ./cloudflare-www-redirect.sh            # solo mira y avisa que haria
#   ./cloudflare-www-redirect.sh --aplicar  # crea la regla de verdad
#
# Por defecto NO toca nada. Hay que pedirlo con --aplicar a proposito: esto
# escribe sobre la configuracion en vivo del dominio.
set -euo pipefail

DOMINIO="webelevate.com.ar"
HOST_WWW="www.${DOMINIO}"
FASE="http_request_dynamic_redirect"
API="https://api.cloudflare.com/client/v4"
APLICAR="${1:-}"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: falta la variable CLOUDFLARE_API_TOKEN." >&2
  echo "       export CLOUDFLARE_API_TOKEN='...' y volver a correr." >&2
  exit 1
fi

cf() { curl -sS --max-time 30 -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "$@"; }

# Devuelve el campo pedido, o corta con el error que mando Cloudflare.
# Se valida cada respuesta: un token sin permisos devuelve 200 con
# success:false, asi que mirar solo el codigo HTTP no alcanza.
leer() { python3 -c "
import json,sys
d=json.load(sys.stdin)
if not d.get('success'):
    errs='; '.join(f\"{e.get('code')}: {e.get('message')}\" for e in d.get('errors') or [])
    sys.exit('ERROR de Cloudflare -> ' + (errs or 'respuesta sin exito'))
$1"; }

echo "== 1. Verificando el token =="
cf "${API}/user/tokens/verify" | leer "print('   token', d['result']['status'])"

echo "== 2. Buscando la zona ${DOMINIO} =="
ZONA=$(cf "${API}/zones?name=${DOMINIO}" | leer "
r=d['result']
if not r: sys.exit('ERROR: el token no ve la zona ${DOMINIO}. Revisar Zone Resources del token.')
print(r[0]['id'])")
echo "   zona: ${ZONA}"

echo "== 3. Leyendo las reglas de redireccion que ya existen =="
# El endpoint del phase entrypoint da 404 cuando todavia no se creo ninguna
# regla. Eso no es un error: es el caso normal la primera vez.
ACTUAL=$(cf "${API}/zones/${ZONA}/rulesets/phases/${FASE}/entrypoint" || echo '{}')
REGLAS=$(printf '%s' "$ACTUAL" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: d={}
print(json.dumps((d.get('result') or {}).get('rules') or []))
")
CUANTAS=$(printf '%s' "$REGLAS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
echo "   reglas existentes: ${CUANTAS}  (se conservan todas)"

# Si ya hay una regla que menciona el host www, no se duplica.
if printf '%s' "$REGLAS" | grep -q "${HOST_WWW}"; then
  echo
  echo "Ya existe una regla que menciona ${HOST_WWW}. No se toca nada."
  exit 0
fi

echo "== 4. Armando la regla nueva =="
NUEVAS=$(printf '%s' "$REGLAS" | python3 -c "
import json,sys
reglas=json.load(sys.stdin)
reglas.append({
  'action':'redirect',
  'action_parameters':{'from_value':{
      'status_code':301,
      # concat() conserva la ruta: /pages/contacto sigue llegando a su pagina,
      # no al inicio. Sin esto, un redirect a la raiz pierde el enlace y
      # Google lo trata como pagina distinta.
      'target_url':{'expression':'concat(\"https://${DOMINIO}\", http.request.uri.path)'},
      'preserve_query_string':True}},
  'expression':'(http.host eq \"${HOST_WWW}\")',
  'description':'www -> dominio pelado (301)',
  'enabled':True,
})
print(json.dumps({'rules':reglas}))
")

if [ "$APLICAR" != "--aplicar" ]; then
  echo
  echo "MODO PRUEBA: no se escribio nada."
  echo "Esto es lo que se mandaria:"
  printf '%s' "$NUEVAS" | python3 -m json.tool
  echo
  echo "Para aplicarlo de verdad: $0 --aplicar"
  exit 0
fi

echo "== 5. Aplicando =="
printf '%s' "$NUEVAS" | cf -X PUT \
  -H "Content-Type: application/json" \
  --data-binary @- \
  "${API}/zones/${ZONA}/rulesets/phases/${FASE}/entrypoint" \
  | leer "print('   regla creada. total de reglas ahora:', len(d['result']['rules']))"

echo "== 6. Comprobando en vivo =="
# La regla tarda unos segundos en propagarse por el borde.
sleep 5
CODIGO=$(curl -sS -o /dev/null --max-time 25 -w '%{http_code}' "https://${HOST_WWW}/")
DESTINO=$(curl -sS -o /dev/null --max-time 25 -w '%{redirect_url}' "https://${HOST_WWW}/")
echo "   https://${HOST_WWW}/ -> ${CODIGO} ${DESTINO}"

case "$CODIGO" in
  301|308) echo; echo "LISTO: www redirige al dominio pelado." ;;
  200)     echo; echo "OJO: sigue devolviendo 200. La regla quedo creada pero todavia"
           echo "     no pega. Esperar un minuto y reintentar la comprobacion." ;;
  *)       echo; echo "OJO: respondio ${CODIGO}, que no se esperaba. Revisar en el panel." ;;
esac
