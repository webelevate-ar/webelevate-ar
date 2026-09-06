-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" DATETIME,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "cuit" TEXT,
    "notas" TEXT
);

-- CreateTable
CREATE TABLE "producto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "codigo_barras" TEXT,
    "nombre" TEXT NOT NULL,
    "nombre_busqueda" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "proveedor_id" TEXT,
    "precio_venta_centavos" INTEGER NOT NULL,
    "precio_costo_centavos" INTEGER NOT NULL,
    "stock_milesimas" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo_milesimas" INTEGER NOT NULL DEFAULT 0,
    "unidad" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "imagen_url" TEXT,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL,
    CONSTRAINT "producto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "producto_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "movimiento_stock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "producto_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad_milesimas" INTEGER NOT NULL,
    "stock_resultante_milesimas" INTEGER NOT NULL,
    "motivo" TEXT,
    "usuario_id" TEXT NOT NULL,
    "venta_id" TEXT,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimiento_stock_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "movimiento_stock_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "movimiento_stock_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "caja_sesion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caja_numero" INTEGER NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "abierta_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" DATETIME,
    "monto_inicial_centavos" INTEGER NOT NULL,
    "monto_declarado_centavos" INTEGER,
    "monto_esperado_centavos" INTEGER,
    "diferencia_centavos" INTEGER,
    "estado" TEXT NOT NULL,
    CONSTRAINT "caja_sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "movimiento_caja" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caja_sesion_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto_centavos" INTEGER NOT NULL,
    "motivo" TEXT,
    "usuario_id" TEXT NOT NULL,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimiento_caja_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "movimiento_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "venta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "clave_idempotencia" TEXT NOT NULL,
    "caja_sesion_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "subtotal_centavos" INTEGER NOT NULL,
    "descuento_centavos" INTEGER NOT NULL DEFAULT 0,
    "total_centavos" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulada_en" DATETIME,
    "anulada_por_id" TEXT,
    "motivo_anulacion" TEXT,
    CONSTRAINT "venta_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "venta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "venta_anulada_por_id_fkey" FOREIGN KEY ("anulada_por_id") REFERENCES "usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "venta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "venta_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venta_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "nombre_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT NOT NULL,
    "unidad_snapshot" TEXT NOT NULL,
    "precio_unitario_centavos" INTEGER NOT NULL,
    "cantidad_milesimas" INTEGER NOT NULL,
    "subtotal_centavos" INTEGER NOT NULL,
    CONSTRAINT "venta_item_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "venta_item_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pago" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venta_id" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "monto_centavos" INTEGER NOT NULL,
    "vuelto_centavos" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "pago_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "saldo_cuenta_corriente_centavos" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "devolucion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venta_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "monto_centavos" INTEGER NOT NULL,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devolucion_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devolucion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuario_id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "datos_antes" TEXT,
    "datos_despues" TEXT,
    "ip" TEXT,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contador" (
    "nombre" TEXT NOT NULL PRIMARY KEY,
    "valor" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "usuario_activo_idx" ON "usuario"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nombre_key" ON "categoria"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_nombre_key" ON "proveedor"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "producto_sku_key" ON "producto"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "producto_codigo_barras_key" ON "producto"("codigo_barras");

-- CreateIndex
CREATE INDEX "producto_nombre_busqueda_idx" ON "producto"("nombre_busqueda");

-- CreateIndex
CREATE INDEX "producto_categoria_id_idx" ON "producto"("categoria_id");

-- CreateIndex
CREATE INDEX "producto_activo_idx" ON "producto"("activo");

-- CreateIndex
CREATE INDEX "movimiento_stock_producto_id_idx" ON "movimiento_stock"("producto_id");

-- CreateIndex
CREATE INDEX "movimiento_stock_creado_en_idx" ON "movimiento_stock"("creado_en");

-- CreateIndex
CREATE INDEX "movimiento_stock_venta_id_idx" ON "movimiento_stock"("venta_id");

-- CreateIndex
CREATE INDEX "caja_sesion_estado_idx" ON "caja_sesion"("estado");

-- CreateIndex
CREATE INDEX "caja_sesion_abierta_en_idx" ON "caja_sesion"("abierta_en");

-- CreateIndex
CREATE INDEX "caja_sesion_caja_numero_estado_idx" ON "caja_sesion"("caja_numero", "estado");

-- CreateIndex
CREATE INDEX "movimiento_caja_caja_sesion_id_idx" ON "movimiento_caja"("caja_sesion_id");

-- CreateIndex
CREATE UNIQUE INDEX "venta_numero_key" ON "venta"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "venta_clave_idempotencia_key" ON "venta"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "venta_creado_en_idx" ON "venta"("creado_en");

-- CreateIndex
CREATE INDEX "venta_caja_sesion_id_idx" ON "venta"("caja_sesion_id");

-- CreateIndex
CREATE INDEX "venta_estado_idx" ON "venta"("estado");

-- CreateIndex
CREATE INDEX "venta_usuario_id_idx" ON "venta"("usuario_id");

-- CreateIndex
CREATE INDEX "venta_item_venta_id_idx" ON "venta_item"("venta_id");

-- CreateIndex
CREATE INDEX "venta_item_producto_id_idx" ON "venta_item"("producto_id");

-- CreateIndex
CREATE INDEX "pago_venta_id_idx" ON "pago"("venta_id");

-- CreateIndex
CREATE INDEX "devolucion_venta_id_idx" ON "devolucion"("venta_id");

-- CreateIndex
CREATE INDEX "audit_log_creado_en_idx" ON "audit_log"("creado_en");

-- CreateIndex
CREATE INDEX "audit_log_entidad_entidad_id_idx" ON "audit_log"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "audit_log_usuario_id_idx" ON "audit_log"("usuario_id");
