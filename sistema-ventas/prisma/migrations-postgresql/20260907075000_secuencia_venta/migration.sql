-- El número de venta sale de una secuencia y no de una fila de contador.
--
-- Una fila actualizada dentro de una transacción Serializable es un punto
-- caliente: todas las ventas tocan la misma fila y PostgreSQL las aborta entre
-- sí con 40001. Con veinte ventas simultáneas se agotan los reintentos.
-- `nextval` no participa de la transacción, así que no genera conflicto.
--
-- La tabla `contador` se deja: la usa SQLite, que no tiene secuencias.
CREATE SEQUENCE IF NOT EXISTS venta_numero_seq AS INTEGER START WITH 1 OWNED BY NONE;
