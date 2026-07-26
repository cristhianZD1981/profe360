/*
  INACTIVACION SEGURA DE 35 ESTUDIANTES

  Este script aplica el mismo comportamiento que la opcion "Eliminar"
  del modulo de estudiantes: Estudiante.Activo = 0.

  No borra fisicamente matriculas, asistencia, notas, adecuaciones,
  informes ni otros historicos academicos.

  @Aplicar = 0 simula y revierte todos los cambios.
  Cambie @Aplicar a 1 solamente despues de revisar los resultados.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;

DECLARE @Identificaciones TABLE (
  Identificacion NVARCHAR(50) NOT NULL PRIMARY KEY
);

INSERT INTO @Identificaciones (Identificacion)
VALUES
  (N'605430221'),
  (N'121130740'),
  (N'605400422'),
  (N'605380649'),
  (N'159101484305'),
  (N'605080344'),
  (N'605450904'),
  (N'209550103'),
  (N'605440902'),
  (N'605250301'),
  (N'605310236'),
  (N'209690296'),
  (N'605280046'),
  (N'605150189'),
  (N'703580442'),
  (N'605280177'),
  (N'121190969'),
  (N'605300386'),
  (N'120840457'),
  (N'605290831'),
  (N'605290830'),
  (N'121140736'),
  (N'605340078'),
  (N'605400757'),
  (N'121640048'),
  (N'605370959'),
  (N'121030681'),
  (N'605310589'),
  (N'605330212'),
  (N'605280506'),
  (N'605420396'),
  (N'121850229'),
  (N'703680257'),
  (N'121340879'),
  (N'605280212');

DECLARE @EstudiantesObjetivo TABLE (
  EstudianteId INT NOT NULL PRIMARY KEY,
  Identificacion NVARCHAR(50) NOT NULL,
  NombreCompleto NVARCHAR(350) NOT NULL,
  EstabaActivo BIT NOT NULL
);

BEGIN TRY
  BEGIN TRAN;

  IF (SELECT COUNT(*) FROM @Identificaciones) <> 35
    THROW 51000, 'La lista no contiene las 35 identificaciones esperadas.', 1;

  INSERT INTO @EstudiantesObjetivo (
    EstudianteId,
    Identificacion,
    NombreCompleto,
    EstabaActivo
  )
  SELECT
    e.EstudianteId,
    e.Identificacion,
    LTRIM(RTRIM(CONCAT(
      ISNULL(e.PrimerApellido, N''), N' ',
      ISNULL(e.SegundoApellido, N''), N' ',
      ISNULL(e.Nombre, N'')
    ))),
    e.Activo
  FROM dbo.Estudiante e
  INNER JOIN @Identificaciones i
    ON REPLACE(REPLACE(LTRIM(RTRIM(e.Identificacion)), N' ', N''), N'-', N'')
       = i.Identificacion
  WHERE e.InstitucionId = @InstitucionId;

  /*
    Verificacion previa:
    muestra las 35 identificaciones y si fueron encontradas.
  */
  SELECT
    i.Identificacion,
    CASE WHEN eo.EstudianteId IS NULL THEN N'NO ENCONTRADO' ELSE N'ENCONTRADO' END AS EstadoBusqueda,
    eo.EstudianteId,
    eo.NombreCompleto,
    CASE
      WHEN eo.EstudianteId IS NULL THEN NULL
      WHEN eo.EstabaActivo = 1 THEN N'Activo'
      ELSE N'Ya estaba inactivo'
    END AS EstadoActual,
    (
      SELECT COUNT(*)
      FROM dbo.Matricula ma
      WHERE ma.EstudianteId = eo.EstudianteId
    ) AS TotalMatriculas
  FROM @Identificaciones i
  LEFT JOIN @EstudiantesObjetivo eo
    ON REPLACE(REPLACE(LTRIM(RTRIM(eo.Identificacion)), N' ', N''), N'-', N'')
       = i.Identificacion
  ORDER BY i.Identificacion;

  /*
    Inactiva los estudiantes encontrados.
    No modifica tablas dependientes ni elimina historicos.
  */
  UPDATE e
  SET
    e.Activo = 0,
    e.UpdatedAt = SYSDATETIME()
  FROM dbo.Estudiante e
  INNER JOIN @EstudiantesObjetivo eo
    ON eo.EstudianteId = e.EstudianteId
  WHERE e.InstitucionId = @InstitucionId
    AND e.Activo = 1;

  DECLARE @FilasInactivadas INT = @@ROWCOUNT;

  /* Resumen de la operacion. */
  SELECT
    (SELECT COUNT(*) FROM @Identificaciones) AS IdentificacionesSolicitadas,
    (SELECT COUNT(*) FROM @EstudiantesObjetivo) AS EstudiantesEncontrados,
    (SELECT COUNT(*) FROM @Identificaciones i
     WHERE NOT EXISTS (
       SELECT 1
       FROM @EstudiantesObjetivo eo
       WHERE REPLACE(REPLACE(LTRIM(RTRIM(eo.Identificacion)), N' ', N''), N'-', N'')
             = i.Identificacion
     )) AS IdentificacionesNoEncontradas,
    @FilasInactivadas AS EstudiantesInactivadosAhora,
    (SELECT COUNT(*) FROM @EstudiantesObjetivo WHERE EstabaActivo = 0)
      AS EstudiantesQueYaEstabanInactivos;

  /*
    Esta consulta debe devolver cero filas: ningun estudiante encontrado
    puede quedar activo.
  */
  SELECT
    e.EstudianteId,
    e.Identificacion,
    e.Nombre,
    e.PrimerApellido,
    e.SegundoApellido
  FROM dbo.Estudiante e
  INNER JOIN @EstudiantesObjetivo eo
    ON eo.EstudianteId = e.EstudianteId
  WHERE e.InstitucionId = @InstitucionId
    AND e.Activo = 1;

  IF @Aplicar = 1
  BEGIN
    COMMIT TRAN;
    SELECT N'APLICADO: estudiantes inactivados, historicos conservados.' AS Resultado;
  END
  ELSE
  BEGIN
    ROLLBACK TRAN;
    SELECT N'SIMULACION: no se guardaron cambios. Cambie @Aplicar a 1 para aplicar.' AS Resultado;
  END;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0
    ROLLBACK TRAN;
  THROW;
END CATCH;
