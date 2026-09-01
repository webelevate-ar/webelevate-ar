# Antes de hacer nada, leé la bitácora

Este repositorio es **solo el README del perfil de GitHub**. El trabajo real de WebElevate
—las reglas, las decisiones y las trampas— vive en otro lado.

## 📖 Empezá acá, siempre

```
webelevate-ar/tiendas-base   (privado)
  CLAUDE.md      reglas y decisiones vigentes, con el indice de trampas
  TRASPASO.md    la bitacora dia por dia
  TRAMPAS.md     las 54 trampas enteras
```

Si no está clonado: `add_repo` con `webelevate-ar/tiendas-base`, y leé **`CLAUDE.md` y
`TRASPASO.md`** antes de tocar nada. Ahí está todo lo que sigue, explicado y con el porqué.

**`TRAMPAS.md` no se lee entero para empezar.** El índice que está al final de `CLAUDE.md` tiene
una línea por trampa: se barre de un vistazo, y ese archivo se abre cuando el índice señala una
que toca lo que estás por hacer, o cuando algo falla de una forma que no entendés.

⚠️ **Una trampa nueva va en `TRAMPAS.md` y además como una línea en el índice.** Las dos cosas:
una trampa que no está en el índice es una que la sesión siguiente no va a encontrar.

## Con quién trabajás

**Ignacio Nahuel Miranda Segura**, Córdoba, Argentina. Marca: **WebElevate**, diseño web para
comercios. **No es programador de formación**: explicá el *porqué*, no solo el *qué*, y dale
comandos completos con la ruta.

## Las cinco reglas que más se incumplen

1. **REGLA MADRE.** Todo cambio, regla, actualización y **decisión** se escribe en
   `CLAUDE.md` y `TRASPASO.md` de `tiendas-base`. Sin excepción. Trabaja con varias sesiones
   en paralelo y esto es lo único que las mantiene coordinadas.

2. **Solo descripción. Nada de frases.** Ni eslóganes, ni frases con gracia, ni consejos
   simpáticos — aunque sean ciertos y estén bien escritos. El criterio es una pregunta:
   *¿esto le sirve a alguien para decidir, o está para sonar bien?* Si es lo segundo, **se
   saca, no se reescribe mejor**. Lo concreto (precios, plazos, medidas) no se toca nunca.

3. **Un silencio no es un dato.** Fue el error más repetido: cinco veces en dos días. Una
   salida vacía puede ser "no hay nada" o "la herramienta no existe". `dig` y `nslookup`
   **no existen** en el contenedor. Un 404 solo vale si la raíz del mismo sitio dio 200 en la
   misma corrida. Ver trampas 37 y 38.

4. **Probar en local no es probar.** La tienda de muestra estuvo rota en producción días
   porque se probó con un servidor de archivos. Verificá contra la previsualización de rama
   en `workers.dev`, que corre con el mismo `wrangler.jsonc` que producción. Ver trampa 39.

5. **Nunca le pidas un token por chat.** Para Cloudflare y GitHub se usa OAuth. El permiso
   queda atado a su cuenta, él lo ve y lo revoca, y no hay secretos en ningún repositorio.

## Los repositorios

| | |
|---|---|
| `tiendas-base` | privado — la bitácora y las reglas. **Se lee primero.** |
| `webelevate-web` | el sitio `webelevate.com.ar` (Cloudflare Workers) |
| `carrizo-motos` | cliente que paga |
| `luffaloop-web`, `aurora-capital`, `kneescraper-garage`, `estrella-de-mar` | los demás |
| `webelevate-ar` | **este. Es PÚBLICO.** Nada interno entra acá. |

⚠️ En `webelevate-web`, **`sitio/` es generado: no se edita a mano.** Los textos se cambian
agregando una regla en `_textos.py` y corriendo `_construir.py`.
