/*
  CORRECCION CONJUNTA DE HORARIOS - MARZO 2026

  Profesores:
  - andres.morun.garro@mep.go.cr
  - grettel.cruz.rojas@mep.go.cr
  - cesar.porras.elizondo@mep.go.cr

  Periodo objetivo: II Periodo, ano lectivo 2026

  SEGURIDAD:
  - @Aplicar = 0 simula y revierte toda la transaccion.
  - Cambie @Aplicar a 1 solo despues de revisar los resultados.
  - No crea grupos ni materias.
  - No borra registros fisicamente.
  - Conserva un GrupoMateria canonico por seccion/materia.
  - Usa HorarioDocente para separar horarios de materias compartidas.
  - Permite varios profesores en una misma seccion, materia y leccion.
  - Preserva asignaciones y horarios de cualquier otro profesor.

  TOTALES ESPERADOS:
  - Andres:  13 asignaciones, 60 lecciones.
  - Grettel: 12 asignaciones, 58 lecciones de clase.
  - Cesar:   13 asignaciones, 60 lecciones.
  - Total:   38 asignaciones y 178 vinculos HorarioDocente.
  - HorarioGrupo distintos: 154, porque 24 lecciones son compartidas.

  NOTA SOBRE GRETTEL:
  Las lecciones 9 y 10 del miercoles indican "Coordinacion de departamento".
  No se insertan porque no corresponden a una seccion/materia de clase.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';

DECLARE @AnioLectivoId INT;
DECLARE @PeriodoId INT;

DECLARE @Profesores TABLE (
  Correo NVARCHAR(320) NOT NULL PRIMARY KEY,
  NombreCorto NVARCHAR(50) NOT NULL,
  AsignacionesEsperadas INT NOT NULL,
  LeccionesEsperadas INT NOT NULL
);

INSERT INTO @Profesores (
  Correo, NombreCorto, AsignacionesEsperadas, LeccionesEsperadas
)
VALUES
  (N'andres.morun.garro@mep.go.cr', N'Andres', 13, 60),
  (N'grettel.cruz.rojas@mep.go.cr', N'Grettel', 12, 58),
  (N'cesar.porras.elizondo@mep.go.cr', N'Cesar', 13, 60);

DECLARE @HorarioCorrecto TABLE (
  Correo NVARCHAR(320) NOT NULL,
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL,
  PRIMARY KEY (
    Correo, GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId
  ),
  UNIQUE (Correo, DiaSemana, BloqueHorarioId)
);

/*
  DiaSemana:
    2 = lunes, 3 = martes, 4 = miercoles,
    5 = jueves, 6 = viernes.

  Leccion a BloqueHorarioId:
    1, 2, 3    -> 0, 1, 2
    4, 5, 6    -> 13, 14, 15
    7, 8, 9    -> 17, 18, 19
    10, 11, 12 -> 21, 22, 23

  Materias:
    Inco = Ingles conversacional
    Ingl = Ingles
*/

/* =========================================================
   ANDRES MORUN - 60 LECCIONES
   ========================================================= */
INSERT INTO @HorarioCorrecto
  (Correo, GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
VALUES
  /* Lunes. */
  (N'andres.morun.garro@mep.go.cr', N'7-7', N'Inco', 2, 0),
  (N'andres.morun.garro@mep.go.cr', N'7-7', N'Inco', 2, 1),
  (N'andres.morun.garro@mep.go.cr', N'7-7', N'Inco', 2, 2),
  (N'andres.morun.garro@mep.go.cr', N'7-7', N'Inco', 2, 13),
  (N'andres.morun.garro@mep.go.cr', N'7-7', N'Inco', 2, 14),
  (N'andres.morun.garro@mep.go.cr', N'7-7', N'Inco', 2, 15),
  (N'andres.morun.garro@mep.go.cr', N'7-4', N'Inco', 2, 17),
  (N'andres.morun.garro@mep.go.cr', N'7-4', N'Inco', 2, 18),
  (N'andres.morun.garro@mep.go.cr', N'7-4', N'Inco', 2, 19),
  (N'andres.morun.garro@mep.go.cr', N'7-4', N'Inco', 2, 21),
  (N'andres.morun.garro@mep.go.cr', N'7-4', N'Inco', 2, 22),
  (N'andres.morun.garro@mep.go.cr', N'7-4', N'Inco', 2, 23),

  /* Martes. */
  (N'andres.morun.garro@mep.go.cr', N'7-3', N'Inco', 3, 0),
  (N'andres.morun.garro@mep.go.cr', N'7-3', N'Inco', 3, 1),
  (N'andres.morun.garro@mep.go.cr', N'7-3', N'Inco', 3, 2),
  (N'andres.morun.garro@mep.go.cr', N'7-3', N'Inco', 3, 13),
  (N'andres.morun.garro@mep.go.cr', N'7-3', N'Inco', 3, 14),
  (N'andres.morun.garro@mep.go.cr', N'7-3', N'Inco', 3, 15),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Inco', 3, 17),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Inco', 3, 18),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Inco', 3, 19),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Inco', 3, 21),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Inco', 3, 22),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Inco', 3, 23),

  /* Miercoles. */
  (N'andres.morun.garro@mep.go.cr', N'9-3', N'Ingl', 4, 0),
  (N'andres.morun.garro@mep.go.cr', N'9-1', N'Ingl', 4, 1),
  (N'andres.morun.garro@mep.go.cr', N'9-5', N'Ingl', 4, 2),
  (N'andres.morun.garro@mep.go.cr', N'9-5', N'Ingl', 4, 13),
  (N'andres.morun.garro@mep.go.cr', N'9-3', N'Ingl', 4, 14),
  (N'andres.morun.garro@mep.go.cr', N'9-3', N'Ingl', 4, 15),
  (N'andres.morun.garro@mep.go.cr', N'9-2', N'Ingl', 4, 17),
  (N'andres.morun.garro@mep.go.cr', N'9-2', N'Ingl', 4, 18),
  (N'andres.morun.garro@mep.go.cr', N'9-4', N'Ingl', 4, 19),
  (N'andres.morun.garro@mep.go.cr', N'9-4', N'Ingl', 4, 21),
  (N'andres.morun.garro@mep.go.cr', N'9-1', N'Ingl', 4, 22),
  (N'andres.morun.garro@mep.go.cr', N'9-1', N'Ingl', 4, 23),

  /* Jueves. */
  (N'andres.morun.garro@mep.go.cr', N'7-5', N'Inco', 5, 0),
  (N'andres.morun.garro@mep.go.cr', N'7-5', N'Inco', 5, 1),
  (N'andres.morun.garro@mep.go.cr', N'7-5', N'Inco', 5, 2),
  (N'andres.morun.garro@mep.go.cr', N'7-5', N'Inco', 5, 13),
  (N'andres.morun.garro@mep.go.cr', N'7-5', N'Inco', 5, 14),
  (N'andres.morun.garro@mep.go.cr', N'7-5', N'Inco', 5, 15),
  (N'andres.morun.garro@mep.go.cr', N'7-2', N'Inco', 5, 17),
  (N'andres.morun.garro@mep.go.cr', N'7-2', N'Inco', 5, 18),
  (N'andres.morun.garro@mep.go.cr', N'7-2', N'Inco', 5, 19),
  (N'andres.morun.garro@mep.go.cr', N'7-2', N'Inco', 5, 21),
  (N'andres.morun.garro@mep.go.cr', N'7-2', N'Inco', 5, 22),
  (N'andres.morun.garro@mep.go.cr', N'7-2', N'Inco', 5, 23),

  /* Viernes. */
  (N'andres.morun.garro@mep.go.cr', N'7-1', N'Inco', 6, 0),
  (N'andres.morun.garro@mep.go.cr', N'7-1', N'Inco', 6, 1),
  (N'andres.morun.garro@mep.go.cr', N'7-1', N'Inco', 6, 2),
  (N'andres.morun.garro@mep.go.cr', N'7-1', N'Inco', 6, 13),
  (N'andres.morun.garro@mep.go.cr', N'7-1', N'Inco', 6, 14),
  (N'andres.morun.garro@mep.go.cr', N'7-1', N'Inco', 6, 15),
  (N'andres.morun.garro@mep.go.cr', N'9-4', N'Ingl', 6, 17),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Ingl', 6, 18),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Ingl', 6, 19),
  (N'andres.morun.garro@mep.go.cr', N'9-2', N'Ingl', 6, 21),
  (N'andres.morun.garro@mep.go.cr', N'9-5', N'Ingl', 6, 22),
  (N'andres.morun.garro@mep.go.cr', N'9-6', N'Ingl', 6, 23);

/* =========================================================
   GRETTEL CRUZ - 58 LECCIONES DE CLASE
   ========================================================= */
INSERT INTO @HorarioCorrecto
  (Correo, GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
VALUES
  /* Lunes. */
  (N'grettel.cruz.rojas@mep.go.cr', N'7-6', N'Inco', 2, 0),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-6', N'Inco', 2, 1),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-6', N'Inco', 2, 2),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-6', N'Inco', 2, 13),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-6', N'Inco', 2, 14),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-6', N'Inco', 2, 15),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-4', N'Inco', 2, 17),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-4', N'Inco', 2, 18),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-4', N'Inco', 2, 19),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-4', N'Inco', 2, 21),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-4', N'Inco', 2, 22),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-4', N'Inco', 2, 23),

  /* Martes. */
  (N'grettel.cruz.rojas@mep.go.cr', N'7-3', N'Inco', 3, 0),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-3', N'Inco', 3, 1),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-3', N'Inco', 3, 2),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-3', N'Inco', 3, 13),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-3', N'Inco', 3, 14),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-3', N'Inco', 3, 15),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-1', N'Inco', 3, 17),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-1', N'Inco', 3, 18),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-1', N'Inco', 3, 19),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-1', N'Inco', 3, 21),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-1', N'Inco', 3, 22),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-1', N'Inco', 3, 23),

  /* Miercoles: lecciones 9 y 10 son coordinacion, no clase. */
  (N'grettel.cruz.rojas@mep.go.cr', N'8-6', N'Ingl', 4, 0),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-6', N'Ingl', 4, 1),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-4', N'Ingl', 4, 2),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-4', N'Ingl', 4, 13),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-1', N'Ingl', 4, 14),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-1', N'Ingl', 4, 15),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-2', N'Ingl', 4, 17),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-2', N'Ingl', 4, 18),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-1', N'Ingl', 4, 22),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-2', N'Ingl', 4, 23),

  /* Jueves. */
  (N'grettel.cruz.rojas@mep.go.cr', N'7-5', N'Inco', 5, 0),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-5', N'Inco', 5, 1),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-5', N'Inco', 5, 2),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-5', N'Inco', 5, 13),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-5', N'Inco', 5, 14),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-5', N'Inco', 5, 15),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-2', N'Inco', 5, 17),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-2', N'Inco', 5, 18),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-2', N'Inco', 5, 19),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-2', N'Inco', 5, 21),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-2', N'Inco', 5, 22),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-2', N'Inco', 5, 23),

  /* Viernes. */
  (N'grettel.cruz.rojas@mep.go.cr', N'8-3', N'Ingl', 6, 0),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-3', N'Ingl', 6, 1),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-6', N'Ingl', 6, 2),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-4', N'Ingl', 6, 13),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-3', N'Ingl', 6, 14),
  (N'grettel.cruz.rojas@mep.go.cr', N'8-3', N'Ingl', 6, 15),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-7', N'Inco', 6, 17),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-7', N'Inco', 6, 18),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-7', N'Inco', 6, 19),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-7', N'Inco', 6, 21),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-7', N'Inco', 6, 22),
  (N'grettel.cruz.rojas@mep.go.cr', N'7-7', N'Inco', 6, 23);

/* =========================================================
   CESAR PORRAS - 60 LECCIONES
   ========================================================= */
INSERT INTO @HorarioCorrecto
  (Correo, GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
VALUES
  /* Lunes. */
  (N'cesar.porras.elizondo@mep.go.cr', N'9-3', N'Inco', 2, 0),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-3', N'Inco', 2, 1),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-3', N'Inco', 2, 2),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-3', N'Inco', 2, 13),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-3', N'Inco', 2, 14),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-3', N'Inco', 2, 15),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-6', N'Inco', 2, 17),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-6', N'Inco', 2, 18),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-6', N'Inco', 2, 19),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-6', N'Inco', 2, 21),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-6', N'Inco', 2, 22),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-6', N'Inco', 2, 23),

  /* Martes. */
  (N'cesar.porras.elizondo@mep.go.cr', N'9-1', N'Inco', 3, 0),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-1', N'Inco', 3, 1),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-1', N'Inco', 3, 2),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-1', N'Inco', 3, 13),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-1', N'Inco', 3, 14),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-1', N'Inco', 3, 15),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-2', N'Inco', 3, 17),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-2', N'Inco', 3, 18),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-2', N'Inco', 3, 19),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-2', N'Inco', 3, 21),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-2', N'Inco', 3, 22),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-2', N'Inco', 3, 23),

  /* Miercoles. */
  (N'cesar.porras.elizondo@mep.go.cr', N'9-4', N'Inco', 4, 0),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-4', N'Inco', 4, 1),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-4', N'Inco', 4, 2),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-4', N'Inco', 4, 13),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-4', N'Inco', 4, 14),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-4', N'Inco', 4, 15),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-2', N'Ingl', 4, 17),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-2', N'Ingl', 4, 18),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-1', N'Ingl', 4, 19),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-1', N'Ingl', 4, 21),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-4', N'Ingl', 4, 22),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-4', N'Ingl', 4, 23),

  /* Jueves. */
  (N'cesar.porras.elizondo@mep.go.cr', N'9-5', N'Inco', 5, 0),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-5', N'Inco', 5, 1),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-5', N'Inco', 5, 2),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-5', N'Inco', 5, 13),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-5', N'Inco', 5, 14),
  (N'cesar.porras.elizondo@mep.go.cr', N'9-5', N'Inco', 5, 15),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-7', N'Ingl', 5, 17),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-1', N'Ingl', 5, 18),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-1', N'Ingl', 5, 19),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-1', N'Ingl', 5, 21),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-7', N'Ingl', 5, 22),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-7', N'Ingl', 5, 23),

  /* Viernes. */
  (N'cesar.porras.elizondo@mep.go.cr', N'7-6', N'Inco', 6, 0),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-6', N'Inco', 6, 1),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-6', N'Inco', 6, 2),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-6', N'Inco', 6, 13),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-6', N'Inco', 6, 14),
  (N'cesar.porras.elizondo@mep.go.cr', N'7-6', N'Inco', 6, 15),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-3', N'Ingl', 6, 17),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-4', N'Ingl', 6, 18),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-3', N'Ingl', 6, 19),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-3', N'Ingl', 6, 21),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-2', N'Ingl', 6, 22),
  (N'cesar.porras.elizondo@mep.go.cr', N'12-1', N'Ingl', 6, 23);

DECLARE @Usuarios TABLE (
  Correo NVARCHAR(320) NOT NULL PRIMARY KEY,
  UsuarioId INT NOT NULL UNIQUE,
  NombreCorto NVARCHAR(50) NOT NULL,
  AsignacionesEsperadas INT NOT NULL,
  LeccionesEsperadas INT NOT NULL
);

DECLARE @Objetivos TABLE (
  UsuarioId INT NOT NULL,
  Correo NVARCHAR(320) NOT NULL,
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL,
  PRIMARY KEY (UsuarioId, GrupoId, MateriaId)
);

DECLARE @CombinacionesGlobales TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  PRIMARY KEY (GrupoId, MateriaId)
);

DECLARE @CombinacionesProtegidas TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  PRIMARY KEY (GrupoId, MateriaId)
);

DECLARE @GrupoMateriaCanonico TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  GrupoMateriaId INT NOT NULL UNIQUE,
  PRIMARY KEY (GrupoId, MateriaId)
);

DECLARE @HorarioGlobal TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL,
  PRIMARY KEY (GrupoId, MateriaId, DiaSemana, BloqueHorarioId)
);

DECLARE @HorarioResuelto TABLE (
  UsuarioId INT NOT NULL,
  Correo NVARCHAR(320) NOT NULL,
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL,
  HorarioGrupoId INT NOT NULL,
  PRIMARY KEY (UsuarioId, DiaSemana, BloqueHorarioId),
  UNIQUE (UsuarioId, HorarioGrupoId)
);

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.HorarioDocente', N'U') IS NULL
    THROW 51100, 'Falta dbo.HorarioDocente; no se pueden separar horarios compartidos.', 1;

  SELECT TOP (1)
    @AnioLectivoId = a.AnioLectivoId
  FROM dbo.AnioLectivo a
  WHERE a.InstitucionId = @InstitucionId
    AND a.Nombre = @AnioNombre;

  SELECT TOP (1)
    @PeriodoId = p.PeriodoId
  FROM dbo.Periodo p
  WHERE p.AnioLectivoId = @AnioLectivoId
    AND p.Nombre = @PeriodoNombre;

  IF @AnioLectivoId IS NULL
    THROW 51101, 'No se encontro el ano lectivo 2026.', 1;
  IF @PeriodoId IS NULL
    THROW 51102, 'No se encontro el II Periodo del ano lectivo 2026.', 1;

  INSERT INTO @Usuarios (
    Correo, UsuarioId, NombreCorto,
    AsignacionesEsperadas, LeccionesEsperadas
  )
  SELECT
    p.Correo,
    u.UsuarioId,
    p.NombreCorto,
    p.AsignacionesEsperadas,
    p.LeccionesEsperadas
  FROM @Profesores p
  INNER JOIN dbo.Usuario u
    ON u.InstitucionId = @InstitucionId
   AND LOWER(LTRIM(RTRIM(u.Correo))) = LOWER(p.Correo)
   AND u.Activo = 1;

  IF (SELECT COUNT(*) FROM @Usuarios) <> 3
  BEGIN
    SELECT
      p.Correo AS ProfesorFaltante
    FROM @Profesores p
    LEFT JOIN @Usuarios u ON u.Correo = p.Correo
    WHERE u.UsuarioId IS NULL;

    THROW 51103, 'No se encontraron los tres profesores activos.', 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @Profesores p
    OUTER APPLY (
      SELECT COUNT(*) AS Total
      FROM @HorarioCorrecto hc
      WHERE hc.Correo = p.Correo
    ) x
    WHERE x.Total <> p.LeccionesEsperadas
  )
  BEGIN
    SELECT
      p.Correo,
      p.LeccionesEsperadas,
      COUNT(hc.BloqueHorarioId) AS LeccionesEnMapa
    FROM @Profesores p
    LEFT JOIN @HorarioCorrecto hc ON hc.Correo = p.Correo
    GROUP BY p.Correo, p.LeccionesEsperadas
    HAVING COUNT(hc.BloqueHorarioId) <> p.LeccionesEsperadas;

    THROW 51104, 'El mapa no contiene las lecciones esperadas por profesor.', 1;
  END;

  IF (SELECT COUNT(*) FROM @HorarioCorrecto) <> 178
    THROW 51105, 'El mapa conjunto no contiene los 178 vinculos esperados.', 1;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT GrupoNombre FROM @HorarioCorrecto) hc
    LEFT JOIN dbo.Grupo g
      ON g.InstitucionId = @InstitucionId
     AND g.AnioLectivoId = @AnioLectivoId
     AND g.Nombre = hc.GrupoNombre
     AND g.Activo = 1
    WHERE g.GrupoId IS NULL
  )
  BEGIN
    SELECT hc.GrupoNombre AS SeccionFaltante
    FROM (SELECT DISTINCT GrupoNombre FROM @HorarioCorrecto) hc
    LEFT JOIN dbo.Grupo g
      ON g.InstitucionId = @InstitucionId
     AND g.AnioLectivoId = @AnioLectivoId
     AND g.Nombre = hc.GrupoNombre
     AND g.Activo = 1
    WHERE g.GrupoId IS NULL;

    THROW 51106, 'Falta una seccion requerida; el script no crea grupos.', 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT MateriaCodigo FROM @HorarioCorrecto) hc
    LEFT JOIN dbo.Materia m
      ON m.InstitucionId = @InstitucionId
     AND m.Codigo = hc.MateriaCodigo
     AND m.Activa = 1
    WHERE m.MateriaId IS NULL
  )
  BEGIN
    SELECT hc.MateriaCodigo AS MateriaFaltante
    FROM (SELECT DISTINCT MateriaCodigo FROM @HorarioCorrecto) hc
    LEFT JOIN dbo.Materia m
      ON m.InstitucionId = @InstitucionId
     AND m.Codigo = hc.MateriaCodigo
     AND m.Activa = 1
    WHERE m.MateriaId IS NULL;

    THROW 51107, 'Falta una materia requerida; el script no crea materias.', 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @HorarioCorrecto hc
    LEFT JOIN dbo.BloqueHorario bh
      ON bh.InstitucionId = @InstitucionId
     AND bh.BloqueHorarioId = hc.BloqueHorarioId
    WHERE bh.BloqueHorarioId IS NULL
  )
  BEGIN
    SELECT DISTINCT hc.BloqueHorarioId AS BloqueFaltante
    FROM @HorarioCorrecto hc
    LEFT JOIN dbo.BloqueHorario bh
      ON bh.InstitucionId = @InstitucionId
     AND bh.BloqueHorarioId = hc.BloqueHorarioId
    WHERE bh.BloqueHorarioId IS NULL;

    THROW 51108, 'Falta un bloque horario requerido.', 1;
  END;

  INSERT INTO @Objetivos (
    UsuarioId, Correo, GrupoId, MateriaId, GrupoNombre, MateriaCodigo
  )
  SELECT DISTINCT
    u.UsuarioId,
    u.Correo,
    g.GrupoId,
    m.MateriaId,
    g.Nombre,
    m.Codigo
  FROM @HorarioCorrecto hc
  INNER JOIN @Usuarios u ON u.Correo = hc.Correo
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = hc.GrupoNombre
   AND g.Activo = 1
  INNER JOIN dbo.Materia m
    ON m.InstitucionId = @InstitucionId
   AND m.Codigo = hc.MateriaCodigo
   AND m.Activa = 1;

  IF EXISTS (
    SELECT 1
    FROM @Usuarios u
    OUTER APPLY (
      SELECT COUNT(*) AS Total
      FROM @Objetivos o
      WHERE o.UsuarioId = u.UsuarioId
    ) x
    WHERE x.Total <> u.AsignacionesEsperadas
  )
  BEGIN
    SELECT
      u.Correo,
      u.AsignacionesEsperadas,
      COUNT(o.GrupoId) AS AsignacionesEnMapa
    FROM @Usuarios u
    LEFT JOIN @Objetivos o ON o.UsuarioId = u.UsuarioId
    GROUP BY u.Correo, u.AsignacionesEsperadas
    HAVING COUNT(o.GrupoId) <> u.AsignacionesEsperadas;

    THROW 51109, 'El mapa no contiene las asignaciones esperadas por profesor.', 1;
  END;

  IF (SELECT COUNT(*) FROM @Objetivos) <> 38
    THROW 51110, 'El mapa conjunto no contiene las 38 asignaciones esperadas.', 1;

  INSERT INTO @CombinacionesGlobales (GrupoId, MateriaId)
  SELECT DISTINCT GrupoId, MateriaId
  FROM @Objetivos;

  IF (SELECT COUNT(*) FROM @CombinacionesGlobales) <> 30
    THROW 51111, 'El mapa conjunto no contiene las 30 combinaciones globales esperadas.', 1;

  /*
    Las combinaciones de otros profesores se marcan como protegidas. En ellas
    se agregan los vinculos requeridos, pero no se desactiva ningun horario
    global existente.
  */
  INSERT INTO @CombinacionesProtegidas (GrupoId, MateriaId)
  SELECT DISTINCT ad.GrupoId, ad.MateriaId
  FROM dbo.AsignacionDocente ad
  INNER JOIN @CombinacionesGlobales cg
    ON cg.GrupoId = ad.GrupoId
   AND cg.MateriaId = ad.MateriaId
  LEFT JOIN @Usuarios u ON u.UsuarioId = ad.UsuarioId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
    AND u.UsuarioId IS NULL;

  /* Protege tambien vinculos docentes externos aunque su asignacion falte. */
  INSERT INTO @CombinacionesProtegidas (GrupoId, MateriaId)
  SELECT DISTINCT gm.GrupoId, gm.MateriaId
  FROM dbo.HorarioDocente hd
  INNER JOIN dbo.HorarioGrupo hg
    ON hg.HorarioGrupoId = hd.HorarioGrupoId
   AND hg.Activo = 1
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
   AND gm.PeriodoId = @PeriodoId
  INNER JOIN dbo.Grupo g
    ON g.GrupoId = gm.GrupoId
   AND g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
  INNER JOIN @CombinacionesGlobales cg
    ON cg.GrupoId = gm.GrupoId
   AND cg.MateriaId = gm.MateriaId
  LEFT JOIN @Usuarios u ON u.UsuarioId = hd.UsuarioId
  WHERE hd.Activo = 1
    AND u.UsuarioId IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM @CombinacionesProtegidas existente
      WHERE existente.GrupoId = gm.GrupoId
        AND existente.MateriaId = gm.MateriaId
    );

  /* Cualquier grupo de clase activo conserva intacto su horario global. */
  IF OBJECT_ID(N'dbo.GrupoClase', N'U') IS NOT NULL
  BEGIN
    INSERT INTO @CombinacionesProtegidas (GrupoId, MateriaId)
    SELECT DISTINCT gc.GrupoIdPrincipal, gc.MateriaId
    FROM dbo.GrupoClase gc
    INNER JOIN @CombinacionesGlobales cg
      ON cg.GrupoId = gc.GrupoIdPrincipal
     AND cg.MateriaId = gc.MateriaId
    WHERE gc.InstitucionId = @InstitucionId
      AND gc.AnioLectivoId = @AnioLectivoId
      AND gc.PeriodoId = @PeriodoId
      AND gc.Activo = 1
      AND NOT EXISTS (
        SELECT 1
        FROM @CombinacionesProtegidas existente
        WHERE existente.GrupoId = gc.GrupoIdPrincipal
          AND existente.MateriaId = gc.MateriaId
      );
  END;

  /*
    GrupoMateria: crear solo si no existe y conservar el menor id exacto
    del II Periodo como registro canonico.
  */
  INSERT INTO dbo.GrupoMateria (
    GrupoId, MateriaId, PeriodoId, Activo, CreatedAt
  )
  SELECT
    cg.GrupoId,
    cg.MateriaId,
    @PeriodoId,
    1,
    SYSDATETIME()
  FROM @CombinacionesGlobales cg
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.GrupoMateria gm
    WHERE gm.GrupoId = cg.GrupoId
      AND gm.MateriaId = cg.MateriaId
      AND gm.PeriodoId = @PeriodoId
  );

  ;WITH Canonicos AS (
    SELECT
      gm.GrupoMateriaId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, gm.PeriodoId
        ORDER BY gm.GrupoMateriaId
      ) AS Posicion
    FROM dbo.GrupoMateria gm
    INNER JOIN @CombinacionesGlobales cg
      ON cg.GrupoId = gm.GrupoId
     AND cg.MateriaId = gm.MateriaId
    LEFT JOIN @CombinacionesProtegidas cp
      ON cp.GrupoId = gm.GrupoId
     AND cp.MateriaId = gm.MateriaId
    WHERE gm.PeriodoId = @PeriodoId
      AND cp.GrupoId IS NULL
  )
  UPDATE gm
  SET
    gm.Activo = CASE WHEN c.Posicion = 1 THEN 1 ELSE 0 END,
    gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN Canonicos c
    ON c.GrupoMateriaId = gm.GrupoMateriaId;

  /* En combinaciones protegidas solo reactiva una si ninguna esta activa. */
  ;WITH ReactivarGrupoMateria AS (
    SELECT
      gm.GrupoMateriaId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, gm.PeriodoId
        ORDER BY gm.GrupoMateriaId
      ) AS Posicion
    FROM dbo.GrupoMateria gm
    INNER JOIN @CombinacionesProtegidas cp
      ON cp.GrupoId = gm.GrupoId
     AND cp.MateriaId = gm.MateriaId
    WHERE gm.PeriodoId = @PeriodoId
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.GrupoMateria activo
        WHERE activo.GrupoId = gm.GrupoId
          AND activo.MateriaId = gm.MateriaId
          AND activo.PeriodoId = @PeriodoId
          AND activo.Activo = 1
      )
  )
  UPDATE gm
  SET
    gm.Activo = 1,
    gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN ReactivarGrupoMateria r
    ON r.GrupoMateriaId = gm.GrupoMateriaId
   AND r.Posicion = 1;

  INSERT INTO @GrupoMateriaCanonico (
    GrupoId, MateriaId, GrupoMateriaId
  )
  SELECT
    cg.GrupoId,
    cg.MateriaId,
    MIN(gm.GrupoMateriaId)
  FROM @CombinacionesGlobales cg
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoId = cg.GrupoId
   AND gm.MateriaId = cg.MateriaId
   AND gm.PeriodoId = @PeriodoId
   AND gm.Activo = 1
  GROUP BY cg.GrupoId, cg.MateriaId;

  IF (SELECT COUNT(*) FROM @GrupoMateriaCanonico) <> 30
    THROW 51114, 'No se prepararon las 30 combinaciones GrupoMateria.', 1;

  /*
    AsignacionDocente: para cada profesor deja solamente las combinaciones
    que aparecen en su imagen y una fila activa por combinacion.
  */
  UPDATE ad
  SET
    ad.Activo = 0,
    ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Usuarios u ON u.UsuarioId = ad.UsuarioId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
    AND NOT EXISTS (
      SELECT 1
      FROM @Objetivos o
      WHERE o.UsuarioId = ad.UsuarioId
        AND o.GrupoId = ad.GrupoId
        AND o.MateriaId = ad.MateriaId
    );

  ;WITH Asignaciones AS (
    SELECT
      ad.AsignacionDocenteId,
      ROW_NUMBER() OVER (
        PARTITION BY ad.UsuarioId, ad.GrupoId, ad.MateriaId
        ORDER BY ad.AsignacionDocenteId
      ) AS Posicion
    FROM dbo.AsignacionDocente ad
    INNER JOIN @Objetivos o
      ON o.UsuarioId = ad.UsuarioId
     AND o.GrupoId = ad.GrupoId
     AND o.MateriaId = ad.MateriaId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
  )
  UPDATE ad
  SET
    ad.Activo = CASE WHEN a.Posicion = 1 THEN 1 ELSE 0 END,
    ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN Asignaciones a
    ON a.AsignacionDocenteId = ad.AsignacionDocenteId;

  INSERT INTO dbo.AsignacionDocente (
    InstitucionId, UsuarioId, GrupoId, MateriaId, AnioLectivoId,
    PeriodoId, TipoAsignacion, Activo, CreatedAt
  )
  SELECT
    @InstitucionId,
    o.UsuarioId,
    o.GrupoId,
    o.MateriaId,
    @AnioLectivoId,
    @PeriodoId,
    N'PROFESOR_MATERIA',
    1,
    SYSDATETIME()
  FROM @Objetivos o
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = o.UsuarioId
      AND ad.GrupoId = o.GrupoId
      AND ad.MateriaId = o.MateriaId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
  );

  /*
    Horario global: union de las tres imagenes. Las lecciones identicas de
    dos profesores comparten un solo HorarioGrupo y dos HorarioDocente.
  */
  INSERT INTO @HorarioGlobal (
    GrupoId, MateriaId, DiaSemana, BloqueHorarioId
  )
  SELECT DISTINCT
    o.GrupoId,
    o.MateriaId,
    hc.DiaSemana,
    hc.BloqueHorarioId
  FROM @HorarioCorrecto hc
  INNER JOIN @Objetivos o
    ON o.Correo = hc.Correo
   AND o.GrupoNombre = hc.GrupoNombre
   AND o.MateriaCodigo = hc.MateriaCodigo;

  IF (SELECT COUNT(*) FROM @HorarioGlobal) <> 154
    THROW 51115, 'La union no contiene los 154 HorarioGrupo esperados.', 1;

  /* Desactiva los vinculos actuales de los tres docentes para este periodo. */
  UPDATE hd
  SET
    hd.Activo = 0,
    hd.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioDocente hd
  INNER JOIN @Usuarios u ON u.UsuarioId = hd.UsuarioId
  INNER JOIN dbo.HorarioGrupo hg
    ON hg.HorarioGrupoId = hd.HorarioGrupoId
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
   AND gm.PeriodoId = @PeriodoId
  INNER JOIN dbo.Grupo g
    ON g.GrupoId = gm.GrupoId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.InstitucionId = @InstitucionId
  WHERE hd.Activo = 1;

  /*
    Reinicio logico de HorarioGrupo solo en combinaciones exclusivas de los
    tres profesores. Las combinaciones protegidas conservan todos sus horarios.
  */
  UPDATE hg
  SET
    hg.Activo = 0,
    hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
   AND gm.PeriodoId = @PeriodoId
  INNER JOIN @CombinacionesGlobales cg
    ON cg.GrupoId = gm.GrupoId
   AND cg.MateriaId = gm.MateriaId
  LEFT JOIN @CombinacionesProtegidas cp
    ON cp.GrupoId = gm.GrupoId
   AND cp.MateriaId = gm.MateriaId
  WHERE hg.Activo = 1
    AND cp.GrupoId IS NULL;

  ;WITH Reactivar AS (
    SELECT
      hg.HorarioGrupoId,
      ROW_NUMBER() OVER (
        PARTITION BY hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
        ORDER BY hg.HorarioGrupoId
      ) AS Posicion
    FROM @HorarioGlobal objetivo
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoId = objetivo.GrupoId
     AND canon.MateriaId = objetivo.MateriaId
    INNER JOIN dbo.HorarioGrupo hg
      ON hg.GrupoMateriaId = canon.GrupoMateriaId
     AND hg.DiaSemana = objetivo.DiaSemana
     AND hg.BloqueHorarioId = objetivo.BloqueHorarioId
     AND hg.Activo = 0
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.HorarioGrupo activo
      INNER JOIN dbo.GrupoMateria gmActivo
        ON gmActivo.GrupoMateriaId = activo.GrupoMateriaId
       AND gmActivo.Activo = 1
       AND gmActivo.PeriodoId = @PeriodoId
      WHERE gmActivo.GrupoId = objetivo.GrupoId
        AND gmActivo.MateriaId = objetivo.MateriaId
        AND activo.DiaSemana = objetivo.DiaSemana
        AND activo.BloqueHorarioId = objetivo.BloqueHorarioId
        AND activo.Activo = 1
    )
  )
  UPDATE hg
  SET
    hg.Activo = 1,
    hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Reactivar r
    ON r.HorarioGrupoId = hg.HorarioGrupoId
   AND r.Posicion = 1;

  INSERT INTO dbo.HorarioGrupo (
    GrupoMateriaId, BloqueHorarioId, DiaSemana, Activo, CreatedAt
  )
  SELECT
    canon.GrupoMateriaId,
    objetivo.BloqueHorarioId,
    objetivo.DiaSemana,
    1,
    SYSDATETIME()
  FROM @HorarioGlobal objetivo
  INNER JOIN @GrupoMateriaCanonico canon
    ON canon.GrupoId = objetivo.GrupoId
   AND canon.MateriaId = objetivo.MateriaId
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.HorarioGrupo hg
    INNER JOIN dbo.GrupoMateria gmExistente
      ON gmExistente.GrupoMateriaId = hg.GrupoMateriaId
     AND gmExistente.Activo = 1
     AND gmExistente.PeriodoId = @PeriodoId
    WHERE gmExistente.GrupoId = objetivo.GrupoId
      AND gmExistente.MateriaId = objetivo.MateriaId
      AND hg.DiaSemana = objetivo.DiaSemana
      AND hg.BloqueHorarioId = objetivo.BloqueHorarioId
      AND hg.Activo = 1
  );

  INSERT INTO @HorarioResuelto (
    UsuarioId, Correo, GrupoId, MateriaId, DiaSemana,
    BloqueHorarioId, HorarioGrupoId
  )
  SELECT
    o.UsuarioId,
    o.Correo,
    o.GrupoId,
    o.MateriaId,
    hc.DiaSemana,
    hc.BloqueHorarioId,
    resuelto.HorarioGrupoId
  FROM @HorarioCorrecto hc
  INNER JOIN @Objetivos o
    ON o.Correo = hc.Correo
   AND o.GrupoNombre = hc.GrupoNombre
   AND o.MateriaCodigo = hc.MateriaCodigo
  CROSS APPLY (
    SELECT TOP (1) hg.HorarioGrupoId
    FROM dbo.HorarioGrupo hg
    INNER JOIN dbo.GrupoMateria gm
      ON gm.GrupoMateriaId = hg.GrupoMateriaId
     AND gm.Activo = 1
     AND gm.PeriodoId = @PeriodoId
    WHERE gm.GrupoId = o.GrupoId
      AND gm.MateriaId = o.MateriaId
      AND hg.DiaSemana = hc.DiaSemana
      AND hg.BloqueHorarioId = hc.BloqueHorarioId
      AND hg.Activo = 1
    ORDER BY
      CASE WHEN gm.GrupoMateriaId = (
        SELECT canon.GrupoMateriaId
        FROM @GrupoMateriaCanonico canon
        WHERE canon.GrupoId = o.GrupoId
          AND canon.MateriaId = o.MateriaId
      ) THEN 0 ELSE 1 END,
      hg.HorarioGrupoId
  ) resuelto;

  IF (SELECT COUNT(*) FROM @HorarioResuelto) <> 178
    THROW 51116, 'No se resolvieron los 178 vinculos de horario.', 1;

  /* Reactiva o crea los vinculos exactos de cada profesor. */
  UPDATE hd
  SET
    hd.Activo = 1,
    hd.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioDocente hd
  INNER JOIN @HorarioResuelto hr
    ON hr.HorarioGrupoId = hd.HorarioGrupoId
   AND hr.UsuarioId = hd.UsuarioId;

  INSERT INTO dbo.HorarioDocente (
    HorarioGrupoId, UsuarioId, Activo, CreatedAt
  )
  SELECT
    hr.HorarioGrupoId,
    hr.UsuarioId,
    1,
    SYSDATETIME()
  FROM @HorarioResuelto hr
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.HorarioDocente hd
    WHERE hd.HorarioGrupoId = hr.HorarioGrupoId
      AND hd.UsuarioId = hr.UsuarioId
  );

  /* =======================================================
     VALIDACIONES FINALES
     ======================================================= */

  IF EXISTS (
    SELECT 1
    FROM @Usuarios u
    OUTER APPLY (
      SELECT COUNT(*) AS Total
      FROM dbo.AsignacionDocente ad
      WHERE ad.InstitucionId = @InstitucionId
        AND ad.UsuarioId = u.UsuarioId
        AND ad.AnioLectivoId = @AnioLectivoId
        AND ad.PeriodoId = @PeriodoId
        AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
        AND ad.Activo = 1
    ) x
    WHERE x.Total <> u.AsignacionesEsperadas
  )
    THROW 51117, 'No quedaron las asignaciones esperadas por profesor.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    INNER JOIN @Usuarios u ON u.UsuarioId = ad.UsuarioId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
      AND NOT EXISTS (
        SELECT 1
        FROM @Objetivos o
        WHERE o.UsuarioId = ad.UsuarioId
          AND o.GrupoId = ad.GrupoId
          AND o.MateriaId = ad.MateriaId
      )
  )
    THROW 51118, 'Quedo una asignacion activa fuera de las imagenes.', 1;

  IF EXISTS (
    SELECT 1
    FROM @Usuarios u
    OUTER APPLY (
      SELECT COUNT(*) AS Total
      FROM dbo.HorarioDocente hd
      INNER JOIN dbo.HorarioGrupo hg
        ON hg.HorarioGrupoId = hd.HorarioGrupoId
       AND hg.Activo = 1
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
       AND gm.Activo = 1
       AND gm.PeriodoId = @PeriodoId
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
       AND g.AnioLectivoId = @AnioLectivoId
       AND g.InstitucionId = @InstitucionId
      WHERE hd.UsuarioId = u.UsuarioId
        AND hd.Activo = 1
    ) x
    WHERE x.Total <> u.LeccionesEsperadas
  )
    THROW 51119, 'No quedaron las lecciones esperadas por profesor.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.HorarioDocente hd
    INNER JOIN @Usuarios u ON u.UsuarioId = hd.UsuarioId
    INNER JOIN dbo.HorarioGrupo hg
      ON hg.HorarioGrupoId = hd.HorarioGrupoId
     AND hg.Activo = 1
    INNER JOIN dbo.GrupoMateria gm
      ON gm.GrupoMateriaId = hg.GrupoMateriaId
     AND gm.Activo = 1
     AND gm.PeriodoId = @PeriodoId
    INNER JOIN dbo.Grupo g
      ON g.GrupoId = gm.GrupoId
     AND g.AnioLectivoId = @AnioLectivoId
     AND g.InstitucionId = @InstitucionId
    WHERE hd.Activo = 1
      AND NOT EXISTS (
        SELECT 1
        FROM @HorarioResuelto hr
        WHERE hr.UsuarioId = hd.UsuarioId
          AND hr.HorarioGrupoId = hd.HorarioGrupoId
      )
  )
    THROW 51120, 'Quedo un vinculo de horario fuera de las imagenes.', 1;

  IF EXISTS (
    SELECT hd.UsuarioId, hg.DiaSemana, hg.BloqueHorarioId
    FROM dbo.HorarioDocente hd
    INNER JOIN @Usuarios u ON u.UsuarioId = hd.UsuarioId
    INNER JOIN dbo.HorarioGrupo hg
      ON hg.HorarioGrupoId = hd.HorarioGrupoId
     AND hg.Activo = 1
    INNER JOIN dbo.GrupoMateria gm
      ON gm.GrupoMateriaId = hg.GrupoMateriaId
     AND gm.Activo = 1
     AND gm.PeriodoId = @PeriodoId
    WHERE hd.Activo = 1
    GROUP BY hd.UsuarioId, hg.DiaSemana, hg.BloqueHorarioId
    HAVING COUNT(*) > 1
  )
    THROW 51121, 'Un profesor quedo con dos clases en una misma leccion.', 1;

  IF EXISTS (
    SELECT 1
    FROM @HorarioGlobal objetivo
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.HorarioGrupo hg
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
       AND gm.Activo = 1
       AND gm.PeriodoId = @PeriodoId
      WHERE gm.GrupoId = objetivo.GrupoId
        AND gm.MateriaId = objetivo.MateriaId
        AND hg.DiaSemana = objetivo.DiaSemana
        AND hg.BloqueHorarioId = objetivo.BloqueHorarioId
        AND hg.Activo = 1
    )
  )
    THROW 51122, 'Falta un HorarioGrupo requerido por las imagenes.', 1;

  IF EXISTS (
    SELECT
      gm.GrupoId,
      gm.MateriaId,
      hg.DiaSemana,
      hg.BloqueHorarioId
    FROM dbo.HorarioGrupo hg
    INNER JOIN dbo.GrupoMateria gm
      ON gm.GrupoMateriaId = hg.GrupoMateriaId
     AND gm.PeriodoId = @PeriodoId
    INNER JOIN @CombinacionesGlobales cg
      ON cg.GrupoId = gm.GrupoId
     AND cg.MateriaId = gm.MateriaId
    LEFT JOIN @CombinacionesProtegidas cp
      ON cp.GrupoId = gm.GrupoId
     AND cp.MateriaId = gm.MateriaId
    WHERE hg.Activo = 1
      AND cp.GrupoId IS NULL
    GROUP BY gm.GrupoId, gm.MateriaId, hg.DiaSemana, hg.BloqueHorarioId
    HAVING COUNT(*) > 1
  )
    THROW 51123, 'Quedo un HorarioGrupo duplicado en las combinaciones objetivo.', 1;

  /* Verificacion 1: asignaciones finales. */
  SELECT
    u.NombreCorto AS Profesor,
    u.Correo,
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Usuarios u ON u.UsuarioId = ad.UsuarioId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY u.NombreCorto, g.Nombre, m.Nombre;

  /* Verificacion 2: horario final de los tres profesores. */
  SELECT
    u.NombreCorto AS Profesor,
    u.Correo,
    hg.DiaSemana,
    bh.OrdenVisual AS Leccion,
    bh.BloqueHorarioId,
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia,
    hg.HorarioGrupoId
  FROM dbo.HorarioDocente hd
  INNER JOIN @Usuarios u ON u.UsuarioId = hd.UsuarioId
  INNER JOIN dbo.HorarioGrupo hg
    ON hg.HorarioGrupoId = hd.HorarioGrupoId
   AND hg.Activo = 1
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
   AND gm.Activo = 1
   AND gm.PeriodoId = @PeriodoId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
  INNER JOIN dbo.BloqueHorario bh
    ON bh.BloqueHorarioId = hg.BloqueHorarioId
  WHERE hd.Activo = 1
  ORDER BY u.NombreCorto, hg.DiaSemana, bh.OrdenVisual;

  /* Verificacion 3: lecciones compartidas de forma intencional. */
  SELECT
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    hg.DiaSemana,
    bh.OrdenVisual AS Leccion,
    COUNT(DISTINCT hd.UsuarioId) AS TotalProfesores,
    STRING_AGG(u.NombreCorto, N', ') AS Profesores
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
   AND gm.Activo = 1
   AND gm.PeriodoId = @PeriodoId
  INNER JOIN @CombinacionesGlobales cg
    ON cg.GrupoId = gm.GrupoId
   AND cg.MateriaId = gm.MateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
  INNER JOIN dbo.BloqueHorario bh
    ON bh.BloqueHorarioId = hg.BloqueHorarioId
  INNER JOIN dbo.HorarioDocente hd
    ON hd.HorarioGrupoId = hg.HorarioGrupoId
   AND hd.Activo = 1
  INNER JOIN @Usuarios u ON u.UsuarioId = hd.UsuarioId
  WHERE hg.Activo = 1
  GROUP BY
    g.Nombre, m.Codigo, hg.DiaSemana,
    bh.OrdenVisual, hg.BloqueHorarioId
  HAVING COUNT(DISTINCT hd.UsuarioId) > 1
  ORDER BY hg.DiaSemana, bh.OrdenVisual, g.Nombre;

  /* Verificacion 4: combinaciones externas preservadas. */
  SELECT
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    otro.Correo AS ProfesorPreservado
  FROM dbo.AsignacionDocente ad
  INNER JOIN @CombinacionesProtegidas cp
    ON cp.GrupoId = ad.GrupoId
   AND cp.MateriaId = ad.MateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  INNER JOIN dbo.Usuario otro ON otro.UsuarioId = ad.UsuarioId
  LEFT JOIN @Usuarios u ON u.UsuarioId = ad.UsuarioId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
    AND u.UsuarioId IS NULL
  ORDER BY g.Nombre, m.Codigo, otro.Correo;

  /* Verificacion 5: resumen esperado. */
  SELECT
    u.NombreCorto AS Profesor,
    u.Correo,
    COUNT(DISTINCT ad.AsignacionDocenteId) AS AsignacionesActivas,
    COUNT(DISTINCT CASE WHEN g.GrupoId IS NOT NULL THEN hd.HorarioDocenteId END) AS LeccionesActivas,
    u.AsignacionesEsperadas,
    u.LeccionesEsperadas
  FROM @Usuarios u
  LEFT JOIN dbo.AsignacionDocente ad
    ON ad.UsuarioId = u.UsuarioId
   AND ad.InstitucionId = @InstitucionId
   AND ad.AnioLectivoId = @AnioLectivoId
   AND ad.PeriodoId = @PeriodoId
   AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
   AND ad.Activo = 1
  LEFT JOIN dbo.HorarioDocente hd
    ON hd.UsuarioId = u.UsuarioId
   AND hd.Activo = 1
  LEFT JOIN dbo.HorarioGrupo hg
    ON hg.HorarioGrupoId = hd.HorarioGrupoId
   AND hg.Activo = 1
  LEFT JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
   AND gm.Activo = 1
   AND gm.PeriodoId = @PeriodoId
  LEFT JOIN dbo.Grupo g
    ON g.GrupoId = gm.GrupoId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.InstitucionId = @InstitucionId
  GROUP BY
    u.NombreCorto, u.Correo,
    u.AsignacionesEsperadas, u.LeccionesEsperadas
  ORDER BY u.NombreCorto;

  IF @Aplicar = 1
  BEGIN
    COMMIT TRANSACTION;
    SELECT N'APLICADO: los tres horarios fueron reconstruidos correctamente.' AS Resultado;
  END
  ELSE
  BEGIN
    ROLLBACK TRANSACTION;
    SELECT N'SIMULACION: no se guardaron cambios. Cambie @Aplicar a 1 para aplicar.' AS Resultado;
  END;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
