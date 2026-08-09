/*
  Script generado desde:
  C:\Users\HP\OneDrive - Colegio de Profesionales en Informática y Comp\CURSOS ONLINE\Material Profe en linea\DATOS COLEGIO DE SABALITO\Listas con teléfonos para profe 360_02_08_2026_vocacional.xlsx

  Hoja usada: Hoja1
  Registros incluidos: 77

  Registros excluidos:
  - Fila 50: Oscar Abrego Santo (Décimo), motivo: Sin cedula.

  Version v2:
  - Reemplaza la validacion agregada con COUNT por validaciones directas con NOT EXISTS/EXISTS.
  - Evita el warning "Null value is eliminated by an aggregate".

  Version v3 diagnostica:
  - Si hay estudiantes no encontrados, muestra el detalle, hace ROLLBACK y termina con RETURN sin lanzar error.

  Cambios que aplica:
  - Marca dbo.Estudiante.AutorizaWhatsAppEncargado = 1.
  - Marca el Encargado 1/principal como EsPrincipal = 1.
  - Marca dbo.EstudianteEncargado.AceptaWhatsApp = 1.
  - Marca dbo.EstudianteEncargado.AceptaCorreo = 1.
  - Marca dbo.EstudianteEncargado.RecibeNotificaciones = 1.
  - Actualiza dbo.Encargado.Telefono con el telefono normalizado de la hoja.

  Regla de telefono aplicada:
  - 8 digitos  -> +506########
  - 11 digitos -> +###########
  - 12 digitos -> +############

  Nota: el script corre en modo estricto. Si hay telefonos invalidos,
  estudiantes no encontrados, cedulas ambiguas o estudiantes sin encargado
  activo, no aplica cambios y muestra el detalle.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @InstitucionId INT = NULL;
-- Si la misma cedula puede existir en mas de una institucion, indique el id:
-- SET @InstitucionId = 1;

BEGIN TRY
  BEGIN TRAN;

  IF OBJECT_ID(N'dbo.Estudiante', N'U') IS NULL
    THROW 51000, 'No existe la tabla dbo.Estudiante.', 1;

  IF OBJECT_ID(N'dbo.EstudianteEncargado', N'U') IS NULL
    THROW 51000, 'No existe la tabla dbo.EstudianteEncargado.', 1;

  IF OBJECT_ID(N'dbo.Encargado', N'U') IS NULL
    THROW 51000, 'No existe la tabla dbo.Encargado.', 1;

  IF COL_LENGTH(N'dbo.Estudiante', N'AutorizaWhatsAppEncargado') IS NULL
    THROW 51000, 'Falta la columna dbo.Estudiante.AutorizaWhatsAppEncargado.', 1;

  IF COL_LENGTH(N'dbo.EstudianteEncargado', N'AceptaWhatsApp') IS NULL
    THROW 51000, 'Falta la columna dbo.EstudianteEncargado.AceptaWhatsApp.', 1;

  IF COL_LENGTH(N'dbo.EstudianteEncargado', N'AceptaCorreo') IS NULL
    THROW 51000, 'Falta la columna dbo.EstudianteEncargado.AceptaCorreo.', 1;

  DECLARE @Cambios TABLE (
    FilaExcel INT NOT NULL,
    Identificacion NVARCHAR(50) NOT NULL,
    TelefonoOriginal NVARCHAR(100) NULL,
    TelefonoNormalizado NVARCHAR(50) NULL,
    NombreAlumno NVARCHAR(300) NULL,
    Seccion NVARCHAR(50) NULL,
    EncargadoExcel NVARCHAR(300) NULL,
    LargoDetectado INT NOT NULL,
    PRIMARY KEY (Identificacion)
  );

  INSERT INTO @Cambios
    (FilaExcel, Identificacion, TelefonoOriginal, TelefonoNormalizado, NombreAlumno, Seccion, EncargadoExcel, LargoDetectado)
  VALUES
    (4, N'605320259', N'71594410', N'+50671594410', N'Freddy Abrego Morales', N'séptimo', N'Elisa Morales López', 8),
    (5, N'703470756', N'71594410', N'+50671594410', N'Carlos Yariel Abrego Morales', N'séptimo', N'Elisa Morales López', 8),
    (6, N'605410355', N'83812382', N'+50683812382', N'Javier Abrego Santo', N'séptimo', N'Virginia Santo Miranda', 8),
    (7, N'605360521', N'85037527', N'+50685037527', N'Patricia Abrego Santo', N'séptimo', N'Mauricio Abrego Palacio', 8),
    (8, N'487013', N'88177108', N'+50688177108', N'Ángel Agustin Bejerano', N'séptimo', N'Juana Bejarano', 8),
    (9, N'121810122', N'60107315', N'+50660107315', N'Meidany Vanessa Brenes Artavia', N'séptimo', N'Franciny Artavia Vargas', 8),
    (10, N'121860207', N'89642234', N'+50689642234', N'Keysha Camila Cordero Quiros', N'séptimo', N'Maylin Quiros Gonzales', 8),
    (11, N'605420272', N'64156672', N'+50664156672', N'Neymar Raúl Gallardo Jiménez', N'séptimo', N'Veronica Jimenez Prado', 8),
    (12, N'605460801', N'63756204', N'+50663756204', N'Bianca Julieth Jiménez Gómez', N'séptimo', N'Jeannette Comez Matarrita', 8),
    (13, N'1-2145-0578', N'86951785', N'+50686951785', N'Nataly Valeria Jiménez Zuñiga', N'', N'Karol Zuñiga Fernadez', 8),
    (14, N'306000420', N'+50765201498', N'+50765201498', N'Angelina Morales Morales', N'séptimo', N'Ilda Morales', 11),
    (15, N'605460385', N'62592134', N'+50662592134', N'María Miranda Abrego', N'séptimo', N'Alejandro Miranda Abrego', 8),
    (16, N'605430469', N'61403361', N'+50661403361', N'Paola Rios Morales', N'séptimo', N'María Bejarano Angel', 8),
    (17, N'605340239', N'63299155', N'+50663299155', N'Yamileth Sandoya Bejarano', N'séptimo', N'Nuria Granados Soto', 8),
    (18, N'605340468', N'62822710', N'+50662822710', N'Oliver Estiff Soto Mena', N'séptimo', N'Cesar Thomas Rodriguez', 8),
    (19, N'12741656', N'62822710', N'+50662822710', N'Diana Thomas Jaen', N'séptimo', N'Cesar Thomas Rodriguez', 8),
    (20, N'12741657', N'62592134', N'+50662592134', N'Yesica Thomas Jaen', N'séptimo', N'Alejandro Miranda Abrego', 8),
    (21, N'605430475', N'88494165', N'+50688494165', N'Daniel Josue Rodriguez Carpio', N'séptimo', N'Auxiliadora Carpio Jimenez', 8),
    (22, N'121500843', N'87035320', N'+50687035320', N'Wainer Alejandro Ramirez Mendoza', N'séptimo', N'Flor María Mendoza Arauz', 8),
    (23, N'605370673', N'83600988', N'+50683600988', N'Yeickel Jadanny Barquero Araya', N'Octavo 8-1', N'Mirian Araya Carranza', 8),
    (24, N'121080396', N'87753752', N'+50687753752', N'Ivon Emilse Castillo Madriz', N'Octavo 8-1', N'Adriana Madriz Alvarado', 8),
    (25, N'605400451', N'84389232', N'+50684389232', N'Barilyn Joseth García Obregon', N'Octavo 8-1', N'Arturo Vargas Alvarez', 8),
    (26, N'605400254', N'83387089', N'+50683387089', N'Engel Samuel Montoya Arauz', N'Octavo 8-1', N'Jorge Montoya Morales', 8),
    (27, N'605240960', N'85082325', N'+50685082325', N'Rishel Naomy Salas Pérez', N'Octavo 8-1', N'Helen Perez Hernandez', 8),
    (28, N'306030805', N'86019828', N'+50686019828', N'Diomeder Sirre Sirre', N'Octavo 8-1', N'Henia Morales Morales', 8),
    (29, N'605380927', N'87411760', N'+50687411760', N'Elman Leander Vega Cerdas', N'Octavo 8-1', N'Yaneth Cerdas Torres', 8),
    (30, N'605760762', N'89216694', N'+50689216694', N'Dionicio Morales Morales', N'Octavo 8-1', N'Marta Abrego Morales', 8),
    (31, N'605390342', N'88084404', N'+50688084404', N'Tayron José González González', N'Octavo 8-2', N'Marlen Gonzalez Badilla', 8),
    (32, N'YR202308820', N'86169868', N'+50686169868', N'Jairo Bejarano Quintero', N'Octavo 8-2', N'Teresa Cedeño Santo', 8),
    (33, N'605740604', N'62479098', N'+50662479098', N'Ceferino Miranda Miranda', N'Octavo 8-2', N'Elvia Miranda Abrego', 8),
    (34, N'605620753', N'86434968', N'+50686434968', N'Leonardo Molina Abrego', N'Octavo 8-2', N'Melia Abrego Morales', 8),
    (35, N'605350072', N'86449775', N'+50686449775', N'Jeremy David Mora Aleman', N'Octavo 8-2', N'Alicia Aleman Valencia', 8),
    (36, N'605410375', N'89216693', N'+50689216693', N'Yuliana Morales Abrego', N'Octavo 8-2', N'Marta Morales Abrego', 8),
    (37, N'605390427', N'84991415', N'+50684991415', N'Karen Jimena Salazar Avila', N'Octavo 8-2', N'Keilyn Avila Segura', 8),
    (38, N'120990104', N'85965744', N'+50685965744', N'Kaciey Michelle Vasquez Cruz', N'Octavo 8-2', N'Flor Mary Garbanzo Obrego', 8),
    (39, N'605370962', N'87527018', N'+50687527018', N'Camilo Montezuma Pinzon', N'Octavo 8-2', N'Bienvenido Montezuma Santos', 8),
    (40, N'121210448', N'83233191', N'+50683233191', N'Jeudyn Andrés Barahona Blanco', N'Noveno', N'Shirley Barahona Blanco', 8),
    (41, N'605260461', N'60920871', N'+50660920871', N'Yuliana Bejarano Sandoya', N'Noveno', N'Maritza Sandoya Bejarano', 8),
    (42, N'605330877', N'86893975', N'+50686893975', N'Ana Yancy Bejerano Sandoya', N'Noveno', N'Celia Sandoya Degracia', 8),
    (43, N'605230593', N'83241969', N'+50683241969', N'Ibrahin Jafeth Cambronero Arguedas', N'Noveno', N'Eduardo Cambronero artavia', 8),
    (44, N'121190031', N'88032812', N'+50688032812', N'Esteban Castrillo Gutiérrez', N'Noveno', N'Hannia Gutierez Robles', 8),
    (45, N'605280509', N'63292585', N'+50663292585', N'Ashly Arian Mora Salas', N'Noveno', N'Elizabeth Salas Hernandez', 8),
    (46, N'605320316', N'86756495', N'+50686756495', N'Ciany Lucia Valverde Baltodano', N'Noveno', N'Minerva Garcia Valverde', 8),
    (47, N'605290947', N'84173530', N'+50684173530', N'Brithany Jimena Zamora Quesada', N'Noveno', N'Lilliana Quesada Barrantes', 8),
    (48, N'120770012', N'87336925', N'+50687336925', N'Juan David Quintero Sandoya', N'Noveno', N'Minas Sandoya Degracia', 8),
    (49, N'605260462', N'85154160', N'+50685154160', N'Cecilio Sandoya Degracia', N'Noveno', N'Corina Sandoya Degracia', 8),
    (51, N'605140846', N'85174549', N'+50685174549', N'Elías Flores Matarrita', N'Décimo', N'Albertina Matarrita Parra', 8),
    (52, N'605220201', N'87815314', N'+50687815314', N'Laura María Gallardo Madrigal', N'Décimo', N'Maria Gallardo Madrigal', 8),
    (53, N'605190956', N'86169868', N'+50686169868', N'Abel Quintero Cedeño', N'Décimo', N'Teresa Cedeño Santo', 8),
    (54, N'605180992', N'84975786', N'+50684975786', N'Geiner Alonso Quiros Barahona', N'Décimo', N'Mailyn Barahona Blanco', 8),
    (55, N'605230222', N'61403361', N'+50661403361', N'José Sandoya Bejarano', N'Décimo', N'Maria Bejarano Angel', 8),
    (56, N'402500837', N'84473553', N'+50684473553', N'Kimberlyn Tatiana Porras Aguero', N'Décimo', N'Andrey Carvajal Porras', 8),
    (57, N'605140419', N'88388761', N'+50688388761', N'Yoilyn Santo Jiménez', N'Décimo', N'Viterbo Santo Franceschi', 8),
    (58, N'605190136', N'+50764156672', N'+50764156672', N'Maileth Verónica Zamora Jiménez', N'Décimo', N'Veronica Jimenez Prado', 11),
    (59, N'YR2022-24284', N'86019828', N'+50686019828', N'Wilberto Abrego Morales', N'Undécimo', N'Henia Morales Morales', 8),
    (60, N'120410118', N'72847941', N'+50672847941', N'Leonardo Bejarano Sandoya', N'Undécimo', N'Maritza Sandoya Degracia', 8),
    (61, N'119560489', N'89648970', N'+50689648970', N'Wendoly Briseth Carvajal Granados', N'Undécimo', N'Yendri Granados Valderamos', 8),
    (62, N'605210615', N'84929323', N'+50684929323', N'Fanny Criselda Franco Ovares', N'Undécimo', N'Maylin Ovares Prendas', 8),
    (63, N'120650241', N'86225442', N'+50686225442', N'Ashley Michelle González Fernández', N'Undécimo', N'Dayana Fernandez Fernandez', 8),
    (64, N'605210591', N'+507 63014825', N'+50763014825', N'Rosibel Montezuma Santo', N'Undécimo', N'Angelica Santo Jimenez', 11),
    (65, N'605150037', N'88434981', N'+50688434981', N'Mariana Sofia Mora Espinoza', N'Undécimo', N'Maribel Anchia Brenes', 8),
    (66, N'120480338', N'87293384', N'+50687293384', N'Yaslyn Scarleth Navarro Bonilla', N'Undécimo', N'Zeidy Bonilla Sandí', 8),
    (67, N'605090990', N'86257952', N'+50686257952', N'José Miguel Peralta Castillo', N'Undécimo', N'Maria Angela Castillo Sosa', 8),
    (68, N'605150104', N'83510381', N'+50683510381', N'Brenda Priscila Quiros Barahona', N'Undécimo', N'Fanny Barahona Blanco', 8),
    (69, N'605230106', N'61403361', N'+50661403361', N'Alejandro Sandoya Bejarano', N'Undécimo', N'Maria Bejarano Angel', 8),
    (70, N'605290204', N'87795300', N'+50687795300', N'Fredy Santo Santos', N'Undécimo', N'Celina Santo Gallardo', 8),
    (71, N'YR2022-29778', N'62822710', N'+50662822710', N'Emilsa Thomas Jaen', N'Undécimo', N'Cesario Thomas Jaen', 8),
    (72, N'605160076', N'86439292', N'+50686439292', N'Tifany Valeria Vargas Salazar', N'Undécimo', N'Luis Vargas Padilla', 8),
    (73, N'209170879', N'84571043', N'+50684571043', N'Kendall Javier Wilford Badilla', N'Undécimo', N'Lorena Badilla Arguedas', 8),
    (74, N'120340294', N'85225407', N'+50685225407', N'Michael Andrey Segura Serrrano', N'Undécimo', N'Irene Segura Serrano', 8),
    (75, N'120170300', N'61184366', N'+50661184366', N'Carlos Jaykel Ampie Santamaria', N'Duodécimo', N'Vivian Santamaria Suarez', 8),
    (76, N'605060175', N'87515035', N'+50687515035', N'Juan David Arias González', N'Duodécimo', N'Maria Gonzales Flores', 8),
    (77, N'120150115', N'84546811', N'+50684546811', N'Emmanuel Gerardo Cambronero Chacón', N'Duodécimo', N'Vilma Chacón Jimenez', 8),
    (78, N'605100804', N'87514241', N'+50687514241', N'Sergio Yadir Casares Rivera', N'Duodécimo', N'Annette Rivera Fallas', 8),
    (79, N'119840208', N'84849694', N'+50684849694', N'Wendy Jimena Fonseca Monge', N'Duodécimo', N'Rebeca Monge Jimenez', 8),
    (80, N'YR2022-29821', N'86169868', N'+50686169868', N'Elvin Quintero Cedeño', N'Duodécimo', N'Teresa Cedeño Santo', 8),
    (81, N'605040668', N'89862215', N'+50689862215', N'Karla Mariana Sequeira Sandoval', N'Duodécimo', N'Evelyn Sandoval Chacon', 8);

  IF (SELECT COUNT(*) FROM @Cambios) <> 77
    THROW 51001, 'El script no tiene exactamente 77 registros cargados en @Cambios.', 1;

  IF EXISTS (SELECT 1 FROM @Cambios WHERE TelefonoNormalizado IS NULL)
  BEGIN
    SELECT
      FilaExcel,
      Identificacion,
      NombreAlumno,
      Seccion,
      EncargadoExcel,
      TelefonoOriginal,
      LargoDetectado
    FROM @Cambios
    WHERE TelefonoNormalizado IS NULL
    ORDER BY FilaExcel;

    THROW 51002, 'Hay registros sin telefono valido. Corrija el dato en @Cambios antes de ejecutar los cambios.', 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @Cambios c
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.Estudiante e
      WHERE e.Identificacion = c.Identificacion
        AND ISNULL(e.Activo, 1) = 1
        AND (@InstitucionId IS NULL OR e.InstitucionId = @InstitucionId)
    )
  )
  BEGIN
    SELECT
      c.FilaExcel,
      c.Identificacion,
      c.NombreAlumno,
      c.Seccion,
      c.EncargadoExcel,
      EstadoDetectado =
        CASE
          WHEN e_any.EstudianteId IS NULL THEN N'No existe en dbo.Estudiante'
          WHEN ISNULL(e_any.Activo, 1) = 0 THEN N'Existe, pero esta inactivo'
          ELSE N'Existe, pero no calza con @InstitucionId'
        END,
      e_any.EstudianteId,
      e_any.InstitucionId,
      e_any.Activo
    FROM @Cambios c
    OUTER APPLY (
      SELECT TOP 1
        e.EstudianteId,
        e.InstitucionId,
        e.Activo
      FROM dbo.Estudiante e
      WHERE e.Identificacion = c.Identificacion
      ORDER BY
        CASE WHEN ISNULL(e.Activo, 1) = 1 THEN 0 ELSE 1 END,
        e.EstudianteId DESC
    ) e_any
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.Estudiante e
      WHERE e.Identificacion = c.Identificacion
        AND ISNULL(e.Activo, 1) = 1
        AND (@InstitucionId IS NULL OR e.InstitucionId = @InstitucionId)
    )
    ORDER BY c.FilaExcel;

    SELECT
      Resultado = N'NO SE APLICARON CAMBIOS',
      Motivo = N'Hay estudiantes activos no encontrados por identificacion. Revise la tabla anterior.';

    IF @@TRANCOUNT > 0
      ROLLBACK;

    RETURN;
  END;

  IF EXISTS (
    SELECT 1
    FROM @Cambios c
    CROSS APPLY (
      SELECT Coincidencias = COUNT(1)
      FROM dbo.Estudiante e
      WHERE e.Identificacion = c.Identificacion
        AND ISNULL(e.Activo, 1) = 1
        AND (@InstitucionId IS NULL OR e.InstitucionId = @InstitucionId)
    ) x
    WHERE x.Coincidencias > 1
  )
  BEGIN
    SELECT
      c.FilaExcel,
      c.Identificacion,
      c.NombreAlumno,
      c.Seccion,
      c.EncargadoExcel,
      x.Coincidencias
    FROM @Cambios c
    CROSS APPLY (
      SELECT Coincidencias = COUNT(1)
      FROM dbo.Estudiante e
      WHERE e.Identificacion = c.Identificacion
        AND ISNULL(e.Activo, 1) = 1
        AND (@InstitucionId IS NULL OR e.InstitucionId = @InstitucionId)
    ) x
    WHERE x.Coincidencias > 1
    ORDER BY c.FilaExcel;

    THROW 51004, 'Hay cedulas con mas de un estudiante activo. Defina @InstitucionId antes de ejecutar.', 1;
  END;

  DECLARE @Objetivos TABLE (
    FilaExcel INT NOT NULL,
    Identificacion NVARCHAR(50) NOT NULL,
    TelefonoNormalizado NVARCHAR(50) NOT NULL,
    EstudianteId INT NOT NULL PRIMARY KEY,
    EstudianteEncargadoId INT NULL,
    EncargadoId INT NULL
  );

  INSERT INTO @Objetivos
    (FilaExcel, Identificacion, TelefonoNormalizado, EstudianteId, EstudianteEncargadoId, EncargadoId)
  SELECT
    c.FilaExcel,
    c.Identificacion,
    c.TelefonoNormalizado,
    e.EstudianteId,
    target.EstudianteEncargadoId,
    target.EncargadoId
  FROM @Cambios c
  INNER JOIN dbo.Estudiante e
    ON e.Identificacion = c.Identificacion
   AND ISNULL(e.Activo, 1) = 1
   AND (@InstitucionId IS NULL OR e.InstitucionId = @InstitucionId)
  OUTER APPLY (
    SELECT TOP 1
      ee.EstudianteEncargadoId,
      ee.EncargadoId
    FROM dbo.EstudianteEncargado ee
    INNER JOIN dbo.Encargado enc
      ON enc.EncargadoId = ee.EncargadoId
    WHERE ee.EstudianteId = e.EstudianteId
      AND ISNULL(ee.Activo, 1) = 1
      AND ISNULL(enc.Activo, 1) = 1
    ORDER BY
      CASE WHEN ISNULL(ee.EsPrincipal, 0) = 1 THEN 0 ELSE 1 END,
      CASE enc.TipoEncargado
        WHEN N'MADRE' THEN 1
        WHEN N'PADRE' THEN 2
        ELSE 3
      END,
      ee.EstudianteEncargadoId DESC
  ) target;

  IF EXISTS (SELECT 1 FROM @Objetivos WHERE EncargadoId IS NULL OR EstudianteEncargadoId IS NULL)
  BEGIN
    SELECT c.FilaExcel, c.Identificacion, c.NombreAlumno, c.Seccion, c.EncargadoExcel
    FROM @Cambios c
    INNER JOIN @Objetivos o
      ON o.Identificacion = c.Identificacion
    WHERE o.EncargadoId IS NULL
       OR o.EstudianteEncargadoId IS NULL
    ORDER BY c.FilaExcel;

    THROW 51005, 'Hay estudiantes sin encargado activo para actualizar.', 1;
  END;

  UPDATE ee
  SET EsPrincipal = 0,
      UpdatedAt = SYSDATETIME()
  FROM dbo.EstudianteEncargado ee
  INNER JOIN @Objetivos o
    ON o.EstudianteId = ee.EstudianteId
  WHERE ee.EstudianteEncargadoId <> o.EstudianteEncargadoId
    AND ISNULL(ee.EsPrincipal, 0) = 1
    AND ISNULL(ee.Activo, 1) = 1;

  UPDATE e
  SET AutorizaWhatsAppEncargado = 1,
      UpdatedAt = SYSDATETIME()
  FROM dbo.Estudiante e
  INNER JOIN @Objetivos o
    ON o.EstudianteId = e.EstudianteId;

  UPDATE ee
  SET EsPrincipal = 1,
      AceptaWhatsApp = 1,
      AceptaCorreo = 1,
      RecibeNotificaciones = 1,
      UpdatedAt = SYSDATETIME()
  FROM dbo.EstudianteEncargado ee
  INNER JOIN @Objetivos o
    ON o.EstudianteEncargadoId = ee.EstudianteEncargadoId;

  UPDATE enc
  SET Telefono = o.TelefonoNormalizado,
      UpdatedAt = SYSDATETIME()
  FROM dbo.Encargado enc
  INNER JOIN @Objetivos o
    ON o.EncargadoId = enc.EncargadoId;

  SELECT
    RegistrosExcel = (SELECT COUNT(*) FROM @Cambios),
    EstudiantesActualizados = (SELECT COUNT(*) FROM @Objetivos),
    EncargadosActualizados = (SELECT COUNT(*) FROM @Objetivos),
    TelefonosNormalizados = (SELECT COUNT(*) FROM @Objetivos WHERE TelefonoNormalizado IS NOT NULL);

  SELECT
    c.FilaExcel,
    c.Identificacion,
    c.NombreAlumno,
    c.Seccion,
    c.EncargadoExcel,
    o.TelefonoNormalizado,
    o.EstudianteId,
    o.EstudianteEncargadoId,
    o.EncargadoId
  FROM @Cambios c
  INNER JOIN @Objetivos o
    ON o.Identificacion = c.Identificacion
  ORDER BY c.FilaExcel;

  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK;

  DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
  DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
  DECLARE @ErrorState INT = ERROR_STATE();

  RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
