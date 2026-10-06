/* Permite guardar el nuevo motivo sin modificar ni eliminar suspensiones existentes. */
IF OBJECT_ID(N'dbo.EstudianteSuspension', N'U') IS NULL
BEGIN
  THROW 50001, 'No existe dbo.EstudianteSuspension. Ejecute primero 2026-08-02_estudiante_suspension.sql.', 1;
END;
GO

IF EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.EstudianteSuspension')
    AND name = N'CK_EstudianteSuspension_Motivo'
)
  ALTER TABLE dbo.EstudianteSuspension DROP CONSTRAINT CK_EstudianteSuspension_Motivo;
GO

ALTER TABLE dbo.EstudianteSuspension WITH CHECK
ADD CONSTRAINT CK_EstudianteSuspension_Motivo
CHECK (Motivo IN (N'Medida Precautoria', N'Acción Correctiva', N'Accion Correctiva', N'Situación Médica'));
GO
