
/*
    SCRIPT LIMPIO Y UNIFICADO
    Plataforma Web Académica Multiinstitución
    SQL Server / AWS RDS
    Base de datos: PROFESOR

    Incluye:
    - Multiinstitución y comercial
    - Seguridad y acceso
    - Académico base
    - Calendario y horarios
    - Comunicación
    - Asistencia
    - Evaluación
    - Rúbricas
    - Trabajo cotidiano y tareas
    - Archivos y evidencias
    - Incidencias, bitácora y recuperación
    - Diagnóstico, EPI y adecuaciones
    - Notificaciones, comunicados y documentos
    - Centro de ayuda
    - Índices básicos
    - Catálogos semilla
*/

IF DB_ID(N'PROFESOR') IS NULL
BEGIN
    CREATE DATABASE [PROFESOR];
END
GO

USE [PROFESOR];
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* =========================================================
   1. LIMPIEZA COMPLETA EN ORDEN SEGURO
   ========================================================= */

IF OBJECT_ID('dbo.VideoAyuda', 'U') IS NOT NULL DROP TABLE dbo.VideoAyuda;
IF OBJECT_ID('dbo.RecursoAyuda', 'U') IS NOT NULL DROP TABLE dbo.RecursoAyuda;
IF OBJECT_ID('dbo.FAQ', 'U') IS NOT NULL DROP TABLE dbo.FAQ;
IF OBJECT_ID('dbo.DocumentoAcademico', 'U') IS NOT NULL DROP TABLE dbo.DocumentoAcademico;
IF OBJECT_ID('dbo.DocumentoNormativo', 'U') IS NOT NULL DROP TABLE dbo.DocumentoNormativo;
IF OBJECT_ID('dbo.Comunicado', 'U') IS NOT NULL DROP TABLE dbo.Comunicado;
IF OBJECT_ID('dbo.HistorialEnvio', 'U') IS NOT NULL DROP TABLE dbo.HistorialEnvio;
IF OBJECT_ID('dbo.Notificacion', 'U') IS NOT NULL DROP TABLE dbo.Notificacion;
IF OBJECT_ID('dbo.ApoyoEstudiante', 'U') IS NOT NULL DROP TABLE dbo.ApoyoEstudiante;
IF OBJECT_ID('dbo.Adecuacion', 'U') IS NOT NULL DROP TABLE dbo.Adecuacion;
IF OBJECT_ID('dbo.SeguimientoEPI', 'U') IS NOT NULL DROP TABLE dbo.SeguimientoEPI;
IF OBJECT_ID('dbo.EPI', 'U') IS NOT NULL DROP TABLE dbo.EPI;
IF OBJECT_ID('dbo.ResultadoDiagnostico', 'U') IS NOT NULL DROP TABLE dbo.ResultadoDiagnostico;
IF OBJECT_ID('dbo.Diagnostico', 'U') IS NOT NULL DROP TABLE dbo.Diagnostico;
IF OBJECT_ID('dbo.EvidenciaArchivo', 'U') IS NOT NULL DROP TABLE dbo.EvidenciaArchivo;
IF OBJECT_ID('dbo.EntregaRecuperacion', 'U') IS NOT NULL DROP TABLE dbo.EntregaRecuperacion;
IF OBJECT_ID('dbo.Recuperacion', 'U') IS NOT NULL DROP TABLE dbo.Recuperacion;
IF OBJECT_ID('dbo.BitacoraEstudiante', 'U') IS NOT NULL DROP TABLE dbo.BitacoraEstudiante;
IF OBJECT_ID('dbo.SeguimientoIncidencia', 'U') IS NOT NULL DROP TABLE dbo.SeguimientoIncidencia;
IF OBJECT_ID('dbo.Incidencia', 'U') IS NOT NULL DROP TABLE dbo.Incidencia;
IF OBJECT_ID('dbo.TipoIncidencia', 'U') IS NOT NULL DROP TABLE dbo.TipoIncidencia;
IF OBJECT_ID('dbo.PuntajeRubrica', 'U') IS NOT NULL DROP TABLE dbo.PuntajeRubrica;
IF OBJECT_ID('dbo.RubricaAplicada', 'U') IS NOT NULL DROP TABLE dbo.RubricaAplicada;
IF OBJECT_ID('dbo.ArchivoRelacionado', 'U') IS NOT NULL DROP TABLE dbo.ArchivoRelacionado;
IF OBJECT_ID('dbo.Archivo', 'U') IS NOT NULL DROP TABLE dbo.Archivo;
IF OBJECT_ID('dbo.EntregaTarea', 'U') IS NOT NULL DROP TABLE dbo.EntregaTarea;
IF OBJECT_ID('dbo.EntregableTarea', 'U') IS NOT NULL DROP TABLE dbo.EntregableTarea;
IF OBJECT_ID('dbo.Tarea', 'U') IS NOT NULL DROP TABLE dbo.Tarea;
IF OBJECT_ID('dbo.EntregaActividad', 'U') IS NOT NULL DROP TABLE dbo.EntregaActividad;
IF OBJECT_ID('dbo.EntregableActividad', 'U') IS NOT NULL DROP TABLE dbo.EntregableActividad;
IF OBJECT_ID('dbo.ObjetivoActividad', 'U') IS NOT NULL DROP TABLE dbo.ObjetivoActividad;
IF OBJECT_ID('dbo.ActividadCotidiano', 'U') IS NOT NULL DROP TABLE dbo.ActividadCotidiano;
IF OBJECT_ID('dbo.NotaInstrumento', 'U') IS NOT NULL DROP TABLE dbo.NotaInstrumento;
IF OBJECT_ID('dbo.InstrumentoEvaluacion', 'U') IS NOT NULL DROP TABLE dbo.InstrumentoEvaluacion;
IF OBJECT_ID('dbo.NivelRubrica', 'U') IS NOT NULL DROP TABLE dbo.NivelRubrica;
IF OBJECT_ID('dbo.CriterioRubrica', 'U') IS NOT NULL DROP TABLE dbo.CriterioRubrica;
IF OBJECT_ID('dbo.Rubrica', 'U') IS NOT NULL DROP TABLE dbo.Rubrica;
IF OBJECT_ID('dbo.EstadoEntrega', 'U') IS NOT NULL DROP TABLE dbo.EstadoEntrega;
IF OBJECT_ID('dbo.ResumenPeriodo', 'U') IS NOT NULL DROP TABLE dbo.ResumenPeriodo;
IF OBJECT_ID('dbo.ResumenRubro', 'U') IS NOT NULL DROP TABLE dbo.ResumenRubro;
IF OBJECT_ID('dbo.GrupoPlantillaEvaluacion', 'U') IS NOT NULL DROP TABLE dbo.GrupoPlantillaEvaluacion;
IF OBJECT_ID('dbo.PlantillaEvaluacionDetalle', 'U') IS NOT NULL DROP TABLE dbo.PlantillaEvaluacionDetalle;
IF OBJECT_ID('dbo.RubroEvaluacion', 'U') IS NOT NULL DROP TABLE dbo.RubroEvaluacion;
IF OBJECT_ID('dbo.PlantillaEvaluacion', 'U') IS NOT NULL DROP TABLE dbo.PlantillaEvaluacion;
IF OBJECT_ID('dbo.ResumenAsistencia', 'U') IS NOT NULL DROP TABLE dbo.ResumenAsistencia;
IF OBJECT_ID('dbo.DetalleAsistencia', 'U') IS NOT NULL DROP TABLE dbo.DetalleAsistencia;
IF OBJECT_ID('dbo.AsistenciaSesion', 'U') IS NOT NULL DROP TABLE dbo.AsistenciaSesion;
IF OBJECT_ID('dbo.ReglaNotificacionAsistencia', 'U') IS NOT NULL DROP TABLE dbo.ReglaNotificacionAsistencia;
IF OBJECT_ID('dbo.EstadoAsistencia', 'U') IS NOT NULL DROP TABLE dbo.EstadoAsistencia;
IF OBJECT_ID('dbo.PlantillaMensaje', 'U') IS NOT NULL DROP TABLE dbo.PlantillaMensaje;
IF OBJECT_ID('dbo.CanalNotificacion', 'U') IS NOT NULL DROP TABLE dbo.CanalNotificacion;
IF OBJECT_ID('dbo.FechaClase', 'U') IS NOT NULL DROP TABLE dbo.FechaClase;
IF OBJECT_ID('dbo.HorarioGrupo', 'U') IS NOT NULL DROP TABLE dbo.HorarioGrupo;
IF OBJECT_ID('dbo.BloqueHorario', 'U') IS NOT NULL DROP TABLE dbo.BloqueHorario;
IF OBJECT_ID('dbo.ExcepcionCalendario', 'U') IS NOT NULL DROP TABLE dbo.ExcepcionCalendario;
IF OBJECT_ID('dbo.CalendarioLectivo', 'U') IS NOT NULL DROP TABLE dbo.CalendarioLectivo;
IF OBJECT_ID('dbo.Matricula', 'U') IS NOT NULL DROP TABLE dbo.Matricula;
IF OBJECT_ID('dbo.EstudianteEncargado', 'U') IS NOT NULL DROP TABLE dbo.EstudianteEncargado;
IF OBJECT_ID('dbo.Encargado', 'U') IS NOT NULL DROP TABLE dbo.Encargado;
IF OBJECT_ID('dbo.Estudiante', 'U') IS NOT NULL DROP TABLE dbo.Estudiante;
IF OBJECT_ID('dbo.DocenteGrupoMateria', 'U') IS NOT NULL DROP TABLE dbo.DocenteGrupoMateria;
IF OBJECT_ID('dbo.Docente', 'U') IS NOT NULL DROP TABLE dbo.Docente;
IF OBJECT_ID('dbo.GrupoMateria', 'U') IS NOT NULL DROP TABLE dbo.GrupoMateria;
IF OBJECT_ID('dbo.Grupo', 'U') IS NOT NULL DROP TABLE dbo.Grupo;
IF OBJECT_ID('dbo.Materia', 'U') IS NOT NULL DROP TABLE dbo.Materia;
IF OBJECT_ID('dbo.Periodo', 'U') IS NOT NULL DROP TABLE dbo.Periodo;
IF OBJECT_ID('dbo.AnioLectivo', 'U') IS NOT NULL DROP TABLE dbo.AnioLectivo;
IF OBJECT_ID('dbo.TransaccionPago', 'U') IS NOT NULL DROP TABLE dbo.TransaccionPago;
IF OBJECT_ID('dbo.Pago', 'U') IS NOT NULL DROP TABLE dbo.Pago;
IF OBJECT_ID('dbo.Suscripcion', 'U') IS NOT NULL DROP TABLE dbo.Suscripcion;
IF OBJECT_ID('dbo.BitacoraAuditoria', 'U') IS NOT NULL DROP TABLE dbo.BitacoraAuditoria;
IF OBJECT_ID('dbo.SesionUsuario', 'U') IS NOT NULL DROP TABLE dbo.SesionUsuario;
IF OBJECT_ID('dbo.RolPermiso', 'U') IS NOT NULL DROP TABLE dbo.RolPermiso;
IF OBJECT_ID('dbo.UsuarioRol', 'U') IS NOT NULL DROP TABLE dbo.UsuarioRol;
IF OBJECT_ID('dbo.Permiso', 'U') IS NOT NULL DROP TABLE dbo.Permiso;
IF OBJECT_ID('dbo.Rol', 'U') IS NOT NULL DROP TABLE dbo.Rol;
IF OBJECT_ID('dbo.Usuario', 'U') IS NOT NULL DROP TABLE dbo.Usuario;
IF OBJECT_ID('dbo.Sede', 'U') IS NOT NULL DROP TABLE dbo.Sede;
IF OBJECT_ID('dbo.Institucion', 'U') IS NOT NULL DROP TABLE dbo.Institucion;
IF OBJECT_ID('dbo.EstadoSuscripcion', 'U') IS NOT NULL DROP TABLE dbo.EstadoSuscripcion;
IF OBJECT_ID('dbo.PlanComercial', 'U') IS NOT NULL DROP TABLE dbo.PlanComercial;
IF OBJECT_ID('dbo.TipoCliente', 'U') IS NOT NULL DROP TABLE dbo.TipoCliente;
GO

/* =========================================================
   2. MULTIINSTITUCION Y COMERCIAL
   ========================================================= */

CREATE TABLE dbo.TipoCliente (
    TipoClienteId        INT IDENTITY(1,1) PRIMARY KEY,
    Nombre               NVARCHAR(50) NOT NULL,
    Descripcion          NVARCHAR(250) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL
);
GO

CREATE TABLE dbo.PlanComercial (
    PlanId               INT IDENTITY(1,1) PRIMARY KEY,
    Nombre               NVARCHAR(100) NOT NULL,
    Descripcion          NVARCHAR(500) NULL,
    TipoCobro            NVARCHAR(30) NOT NULL,
    PrecioBase           DECIMAL(18,2) NOT NULL DEFAULT 0,
    MaxUsuarios          INT NULL,
    MaxInstituciones     INT NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL
);
GO

CREATE TABLE dbo.EstadoSuscripcion (
    EstadoSuscripcionId  INT IDENTITY(1,1) PRIMARY KEY,
    Nombre               NVARCHAR(50) NOT NULL,
    Descripcion          NVARCHAR(250) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL
);
GO

CREATE TABLE dbo.Institucion (
    InstitucionId        INT IDENTITY(1,1) PRIMARY KEY,
    TipoClienteId        INT NOT NULL,
    Nombre               NVARCHAR(200) NOT NULL,
    NombreComercial      NVARCHAR(200) NULL,
    CedulaJuridica       NVARCHAR(50) NULL,
    CorreoPrincipal      NVARCHAR(150) NULL,
    TelefonoPrincipal    NVARCHAR(50) NULL,
    Direccion            NVARCHAR(500) NULL,
    LogoUrl              NVARCHAR(500) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Institucion_TipoCliente FOREIGN KEY (TipoClienteId) REFERENCES dbo.TipoCliente(TipoClienteId)
);
GO

CREATE TABLE dbo.Sede (
    SedeId               INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Nombre               NVARCHAR(150) NOT NULL,
    Codigo               NVARCHAR(50) NULL,
    Direccion            NVARCHAR(500) NULL,
    Telefono             NVARCHAR(50) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Sede_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

/* =========================================================
   3. SEGURIDAD Y ACCESO
   ========================================================= */

CREATE TABLE dbo.Usuario (
    UsuarioId            INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NULL,
    SedeId               INT NULL,
    Correo               NVARCHAR(150) NOT NULL,
    HashPassword         NVARCHAR(500) NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    PrimerApellido       NVARCHAR(100) NULL,
    SegundoApellido      NVARCHAR(100) NULL,
    Telefono             NVARCHAR(50) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    UltimoAcceso         DATETIME2 NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_Usuario_Correo UNIQUE (Correo),
    CONSTRAINT FK_Usuario_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_Usuario_Sede FOREIGN KEY (SedeId) REFERENCES dbo.Sede(SedeId)
);
GO

CREATE TABLE dbo.Rol (
    RolId                INT IDENTITY(1,1) PRIMARY KEY,
    Nombre               NVARCHAR(100) NOT NULL,
    Descripcion          NVARCHAR(250) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_Rol_Nombre UNIQUE (Nombre)
);
GO

CREATE TABLE dbo.Permiso (
    PermisoId            INT IDENTITY(1,1) PRIMARY KEY,
    Codigo               NVARCHAR(100) NOT NULL,
    Nombre               NVARCHAR(150) NOT NULL,
    Descripcion          NVARCHAR(300) NULL,
    Modulo               NVARCHAR(100) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_Permiso_Codigo UNIQUE (Codigo)
);
GO

CREATE TABLE dbo.UsuarioRol (
    UsuarioRolId         INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId            INT NOT NULL,
    RolId                INT NOT NULL,
    FechaAsignacion      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_UsuarioRol UNIQUE (UsuarioId, RolId),
    CONSTRAINT FK_UsuarioRol_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId),
    CONSTRAINT FK_UsuarioRol_Rol FOREIGN KEY (RolId) REFERENCES dbo.Rol(RolId)
);
GO

CREATE TABLE dbo.RolPermiso (
    RolPermisoId         INT IDENTITY(1,1) PRIMARY KEY,
    RolId                INT NOT NULL,
    PermisoId            INT NOT NULL,
    Permitido            BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_RolPermiso UNIQUE (RolId, PermisoId),
    CONSTRAINT FK_RolPermiso_Rol FOREIGN KEY (RolId) REFERENCES dbo.Rol(RolId),
    CONSTRAINT FK_RolPermiso_Permiso FOREIGN KEY (PermisoId) REFERENCES dbo.Permiso(PermisoId)
);
GO

CREATE TABLE dbo.SesionUsuario (
    SesionUsuarioId      BIGINT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId            INT NOT NULL,
    TokenHash            NVARCHAR(500) NOT NULL,
    Ip                   NVARCHAR(100) NULL,
    Agente               NVARCHAR(500) NULL,
    FechaInicio          DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    FechaFin             DATETIME2 NULL,
    Activa               BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_SesionUsuario_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.BitacoraAuditoria (
    BitacoraAuditoriaId  BIGINT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId            INT NULL,
    Modulo               NVARCHAR(100) NOT NULL,
    Accion               NVARCHAR(100) NOT NULL,
    Entidad              NVARCHAR(100) NULL,
    EntidadId            NVARCHAR(100) NULL,
    Detalle              NVARCHAR(MAX) NULL,
    FechaHora            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_BitacoraAuditoria_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.Suscripcion (
    SuscripcionId        INT IDENTITY(1,1) PRIMARY KEY,
    PlanId               INT NOT NULL,
    InstitucionId        INT NULL,
    UsuarioId            INT NULL,
    EstadoSuscripcionId  INT NOT NULL,
    FechaInicio          DATE NOT NULL,
    FechaFin             DATE NULL,
    Monto                DECIMAL(18,2) NOT NULL DEFAULT 0,
    Moneda               NVARCHAR(10) NOT NULL DEFAULT N'CRC',
    RenovacionAutomatica BIT NOT NULL DEFAULT 0,
    Observacion          NVARCHAR(500) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Suscripcion_PlanComercial FOREIGN KEY (PlanId) REFERENCES dbo.PlanComercial(PlanId),
    CONSTRAINT FK_Suscripcion_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_Suscripcion_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId),
    CONSTRAINT FK_Suscripcion_Estado FOREIGN KEY (EstadoSuscripcionId) REFERENCES dbo.EstadoSuscripcion(EstadoSuscripcionId),
    CONSTRAINT CK_Suscripcion_InstitucionOUsuario CHECK (
        (InstitucionId IS NOT NULL AND UsuarioId IS NULL) OR
        (InstitucionId IS NULL AND UsuarioId IS NOT NULL)
    )
);
GO

CREATE TABLE dbo.Pago (
    PagoId               INT IDENTITY(1,1) PRIMARY KEY,
    SuscripcionId        INT NOT NULL,
    FechaPago            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Monto                DECIMAL(18,2) NOT NULL,
    Moneda               NVARCHAR(10) NOT NULL DEFAULT N'CRC',
    Metodo               NVARCHAR(50) NULL,
    Estado               NVARCHAR(50) NOT NULL DEFAULT N'Pendiente',
    ReferenciaExterna    NVARCHAR(150) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Pago_Suscripcion FOREIGN KEY (SuscripcionId) REFERENCES dbo.Suscripcion(SuscripcionId)
);
GO

CREATE TABLE dbo.TransaccionPago (
    TransaccionPagoId    INT IDENTITY(1,1) PRIMARY KEY,
    PagoId               INT NOT NULL,
    Proveedor            NVARCHAR(50) NOT NULL,
    RequestId            NVARCHAR(150) NULL,
    TransactionId        NVARCHAR(150) NULL,
    LinkPago             NVARCHAR(500) NULL,
    PayloadRespuesta     NVARCHAR(MAX) NULL,
    FechaWebhook         DATETIME2 NULL,
    EstadoConciliado     BIT NOT NULL DEFAULT 0,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_TransaccionPago_Pago FOREIGN KEY (PagoId) REFERENCES dbo.Pago(PagoId)
);
GO

/* =========================================================
   4. ACADEMICO BASE
   ========================================================= */

CREATE TABLE dbo.AnioLectivo (
    AnioLectivoId        INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Nombre               NVARCHAR(50) NOT NULL,
    FechaInicio          DATE NOT NULL,
    FechaFin             DATE NOT NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_AnioLectivo_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.Periodo (
    PeriodoId            INT IDENTITY(1,1) PRIMARY KEY,
    AnioLectivoId        INT NOT NULL,
    Nombre               NVARCHAR(50) NOT NULL,
    NumeroOrden          INT NOT NULL,
    FechaInicio          DATE NOT NULL,
    FechaFin             DATE NOT NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Periodo_AnioLectivo FOREIGN KEY (AnioLectivoId) REFERENCES dbo.AnioLectivo(AnioLectivoId)
);
GO

CREATE TABLE dbo.Materia (
    MateriaId            INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Codigo               NVARCHAR(50) NULL,
    Nombre               NVARCHAR(150) NOT NULL,
    Descripcion          NVARCHAR(300) NULL,
    Activa               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Materia_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.Grupo (
    GrupoId              INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    SedeId               INT NULL,
    AnioLectivoId        INT NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    Nivel                NVARCHAR(100) NULL,
    Jornada              NVARCHAR(50) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Grupo_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_Grupo_Sede FOREIGN KEY (SedeId) REFERENCES dbo.Sede(SedeId),
    CONSTRAINT FK_Grupo_AnioLectivo FOREIGN KEY (AnioLectivoId) REFERENCES dbo.AnioLectivo(AnioLectivoId)
);
GO

CREATE TABLE dbo.GrupoMateria (
    GrupoMateriaId       INT IDENTITY(1,1) PRIMARY KEY,
    GrupoId              INT NOT NULL,
    MateriaId            INT NOT NULL,
    PeriodoId            INT NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_GrupoMateria_Grupo FOREIGN KEY (GrupoId) REFERENCES dbo.Grupo(GrupoId),
    CONSTRAINT FK_GrupoMateria_Materia FOREIGN KEY (MateriaId) REFERENCES dbo.Materia(MateriaId),
    CONSTRAINT FK_GrupoMateria_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId)
);
GO

CREATE TABLE dbo.Docente (
    DocenteId            INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId            INT NOT NULL,
    CodigoDocente        NVARCHAR(50) NULL,
    Especialidad         NVARCHAR(150) NULL,
    EsGuia               BIT NOT NULL DEFAULT 0,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_Docente_Usuario UNIQUE (UsuarioId),
    CONSTRAINT FK_Docente_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.DocenteGrupoMateria (
    DocenteGrupoMateriaId INT IDENTITY(1,1) PRIMARY KEY,
    DocenteId             INT NOT NULL,
    GrupoMateriaId        INT NOT NULL,
    EsTitular             BIT NOT NULL DEFAULT 1,
    FechaAsignacion       DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    Activo                BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_DocenteGrupoMateria UNIQUE (DocenteId, GrupoMateriaId),
    CONSTRAINT FK_DGM_Docente FOREIGN KEY (DocenteId) REFERENCES dbo.Docente(DocenteId),
    CONSTRAINT FK_DGM_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId)
);
GO

CREATE TABLE dbo.Estudiante (
    EstudianteId         INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Identificacion       NVARCHAR(50) NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    PrimerApellido       NVARCHAR(100) NULL,
    SegundoApellido      NVARCHAR(100) NULL,
    FechaNacimiento      DATE NULL,
    Sexo                 NVARCHAR(20) NULL,
    Correo               NVARCHAR(150) NULL,
    Telefono             NVARCHAR(50) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_Estudiante_Institucion_Identificacion UNIQUE (InstitucionId, Identificacion),
    CONSTRAINT FK_Estudiante_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.Encargado (
    EncargadoId          INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    UsuarioId            INT NULL,
    Identificacion       NVARCHAR(50) NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    PrimerApellido       NVARCHAR(100) NULL,
    SegundoApellido      NVARCHAR(100) NULL,
    Correo               NVARCHAR(150) NULL,
    Telefono             NVARCHAR(50) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Encargado_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_Encargado_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.EstudianteEncargado (
    EstudianteEncargadoId INT IDENTITY(1,1) PRIMARY KEY,
    EstudianteId          INT NOT NULL,
    EncargadoId           INT NOT NULL,
    Parentesco            NVARCHAR(50) NULL,
    EsPrincipal           BIT NOT NULL DEFAULT 0,
    RecibeNotificaciones  BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_EstudianteEncargado UNIQUE (EstudianteId, EncargadoId),
    CONSTRAINT FK_EstudianteEncargado_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_EstudianteEncargado_Encargado FOREIGN KEY (EncargadoId) REFERENCES dbo.Encargado(EncargadoId)
);
GO

CREATE TABLE dbo.Matricula (
    MatriculaId          INT IDENTITY(1,1) PRIMARY KEY,
    EstudianteId         INT NOT NULL,
    GrupoId              INT NOT NULL,
    AnioLectivoId        INT NOT NULL,
    Estado               NVARCHAR(50) NOT NULL DEFAULT N'Activa',
    FechaMatricula       DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    Observacion          NVARCHAR(500) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_Matricula UNIQUE (EstudianteId, GrupoId, AnioLectivoId),
    CONSTRAINT FK_Matricula_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_Matricula_Grupo FOREIGN KEY (GrupoId) REFERENCES dbo.Grupo(GrupoId),
    CONSTRAINT FK_Matricula_AnioLectivo FOREIGN KEY (AnioLectivoId) REFERENCES dbo.AnioLectivo(AnioLectivoId)
);
GO

/* =========================================================
   5. CALENDARIO, HORARIOS Y MENSAJERIA BASE
   ========================================================= */

CREATE TABLE dbo.CalendarioLectivo (
    CalendarioLectivoId  INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    PeriodoId            INT NOT NULL,
    FechaInicio          DATE NOT NULL,
    FechaFin             DATE NOT NULL,
    DiasLectivosPatron   NVARCHAR(20) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_CalendarioLectivo_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_CalendarioLectivo_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId)
);
GO

CREATE TABLE dbo.ExcepcionCalendario (
    ExcepcionCalendarioId INT IDENTITY(1,1) PRIMARY KEY,
    CalendarioLectivoId   INT NOT NULL,
    Fecha                 DATE NOT NULL,
    TipoExcepcion         NVARCHAR(50) NOT NULL,
    Descripcion           NVARCHAR(300) NULL,
    AfectaClases          BIT NOT NULL DEFAULT 1,
    CreatedAt             DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt             DATETIME2 NULL,
    CONSTRAINT FK_ExcepcionCalendario_Calendario FOREIGN KEY (CalendarioLectivoId) REFERENCES dbo.CalendarioLectivo(CalendarioLectivoId)
);
GO

CREATE TABLE dbo.BloqueHorario (
    BloqueHorarioId      INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    HoraInicio           TIME NOT NULL,
    HoraFin              TIME NOT NULL,
    OrdenVisual          INT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_BloqueHorario_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.HorarioGrupo (
    HorarioGrupoId       INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    BloqueHorarioId      INT NOT NULL,
    DiaSemana            INT NOT NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_HorarioGrupo_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_HorarioGrupo_BloqueHorario FOREIGN KEY (BloqueHorarioId) REFERENCES dbo.BloqueHorario(BloqueHorarioId)
);
GO

CREATE TABLE dbo.FechaClase (
    FechaClaseId         INT IDENTITY(1,1) PRIMARY KEY,
    HorarioGrupoId       INT NOT NULL,
    Fecha                DATE NOT NULL,
    PeriodoId            INT NOT NULL,
    EsExtraordinaria     BIT NOT NULL DEFAULT 0,
    Observacion          NVARCHAR(300) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_FechaClase UNIQUE (HorarioGrupoId, Fecha),
    CONSTRAINT FK_FechaClase_HorarioGrupo FOREIGN KEY (HorarioGrupoId) REFERENCES dbo.HorarioGrupo(HorarioGrupoId),
    CONSTRAINT FK_FechaClase_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId)
);
GO

CREATE TABLE dbo.CanalNotificacion (
    CanalNotificacionId  INT IDENTITY(1,1) PRIMARY KEY,
    Nombre               NVARCHAR(50) NOT NULL,
    Codigo               NVARCHAR(30) NOT NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_CanalNotificacion_Codigo UNIQUE (Codigo)
);
GO

CREATE TABLE dbo.PlantillaMensaje (
    PlantillaMensajeId   INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NULL,
    CanalNotificacionId  INT NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    Asunto               NVARCHAR(200) NULL,
    Contenido            NVARCHAR(MAX) NOT NULL,
    Activa               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_PlantillaMensaje_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_PlantillaMensaje_Canal FOREIGN KEY (CanalNotificacionId) REFERENCES dbo.CanalNotificacion(CanalNotificacionId)
);
GO

/* =========================================================
   6. ASISTENCIA
   ========================================================= */

CREATE TABLE dbo.EstadoAsistencia (
    EstadoAsistenciaId   INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    Codigo               NVARCHAR(30) NOT NULL,
    PorcentajeAsistencia DECIMAL(5,2) NOT NULL,
    ColorHex             NVARCHAR(20) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_EstadoAsistencia UNIQUE (InstitucionId, Codigo),
    CONSTRAINT FK_EstadoAsistencia_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.ReglaNotificacionAsistencia (
    ReglaNotificacionAsistenciaId INT IDENTITY(1,1) PRIMARY KEY,
    EstadoAsistenciaId   INT NOT NULL,
    CanalNotificacionId  INT NOT NULL,
    EnviarAutomaticamente BIT NOT NULL DEFAULT 1,
    PlantillaMensajeId   INT NULL,
    CONSTRAINT UQ_ReglaNotificacionAsistencia UNIQUE (EstadoAsistenciaId, CanalNotificacionId),
    CONSTRAINT FK_RNA_EstadoAsistencia FOREIGN KEY (EstadoAsistenciaId) REFERENCES dbo.EstadoAsistencia(EstadoAsistenciaId),
    CONSTRAINT FK_RNA_CanalNotificacion FOREIGN KEY (CanalNotificacionId) REFERENCES dbo.CanalNotificacion(CanalNotificacionId),
    CONSTRAINT FK_RNA_PlantillaMensaje FOREIGN KEY (PlantillaMensajeId) REFERENCES dbo.PlantillaMensaje(PlantillaMensajeId)
);
GO

CREATE TABLE dbo.AsistenciaSesion (
    AsistenciaSesionId   INT IDENTITY(1,1) PRIMARY KEY,
    FechaClaseId         INT NOT NULL,
    DocenteId            INT NOT NULL,
    FechaRegistro        DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    ObservacionGeneral   NVARCHAR(500) NULL,
    CONSTRAINT UQ_AsistenciaSesion_FechaClase UNIQUE (FechaClaseId),
    CONSTRAINT FK_AsistenciaSesion_FechaClase FOREIGN KEY (FechaClaseId) REFERENCES dbo.FechaClase(FechaClaseId),
    CONSTRAINT FK_AsistenciaSesion_Docente FOREIGN KEY (DocenteId) REFERENCES dbo.Docente(DocenteId)
);
GO

CREATE TABLE dbo.DetalleAsistencia (
    DetalleAsistenciaId  INT IDENTITY(1,1) PRIMARY KEY,
    AsistenciaSesionId   INT NOT NULL,
    EstudianteId         INT NOT NULL,
    EstadoAsistenciaId   INT NOT NULL,
    Observacion          NVARCHAR(300) NULL,
    FechaHoraRegistro    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_DetalleAsistencia UNIQUE (AsistenciaSesionId, EstudianteId),
    CONSTRAINT FK_DetalleAsistencia_AsistenciaSesion FOREIGN KEY (AsistenciaSesionId) REFERENCES dbo.AsistenciaSesion(AsistenciaSesionId),
    CONSTRAINT FK_DetalleAsistencia_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_DetalleAsistencia_EstadoAsistencia FOREIGN KEY (EstadoAsistenciaId) REFERENCES dbo.EstadoAsistencia(EstadoAsistenciaId)
);
GO

CREATE TABLE dbo.ResumenAsistencia (
    ResumenAsistenciaId  INT IDENTITY(1,1) PRIMARY KEY,
    EstudianteId         INT NOT NULL,
    PeriodoId            INT NOT NULL,
    PorcentajeAcumulado  DECIMAL(6,2) NOT NULL DEFAULT 0,
    LeccionesTotales     INT NOT NULL DEFAULT 0,
    LeccionesEfectivas   DECIMAL(10,2) NOT NULL DEFAULT 0,
    UpdatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ResumenAsistencia UNIQUE (EstudianteId, PeriodoId),
    CONSTRAINT FK_ResumenAsistencia_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_ResumenAsistencia_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId)
);
GO

/* =========================================================
   7. EVALUACION Y RUBRICAS
   ========================================================= */

CREATE TABLE dbo.PlantillaEvaluacion (
    PlantillaEvaluacionId INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Nombre               NVARCHAR(150) NOT NULL,
    Descripcion          NVARCHAR(500) NULL,
    EsBase               BIT NOT NULL DEFAULT 0,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_PlantillaEvaluacion_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.RubroEvaluacion (
    RubroEvaluacionId    INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    Codigo               NVARCHAR(30) NOT NULL,
    TipoRubro            NVARCHAR(50) NOT NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_RubroEvaluacion UNIQUE (InstitucionId, Codigo),
    CONSTRAINT FK_RubroEvaluacion_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.PlantillaEvaluacionDetalle (
    PlantillaEvaluacionDetalleId INT IDENTITY(1,1) PRIMARY KEY,
    PlantillaEvaluacionId INT NOT NULL,
    RubroEvaluacionId    INT NOT NULL,
    PeriodoId            INT NOT NULL,
    Porcentaje           DECIMAL(6,2) NOT NULL,
    OrdenVisual          INT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_PlantillaEvaluacionDetalle UNIQUE (PlantillaEvaluacionId, RubroEvaluacionId, PeriodoId),
    CONSTRAINT FK_PED_Plantilla FOREIGN KEY (PlantillaEvaluacionId) REFERENCES dbo.PlantillaEvaluacion(PlantillaEvaluacionId),
    CONSTRAINT FK_PED_Rubro FOREIGN KEY (RubroEvaluacionId) REFERENCES dbo.RubroEvaluacion(RubroEvaluacionId),
    CONSTRAINT FK_PED_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId)
);
GO

CREATE TABLE dbo.GrupoPlantillaEvaluacion (
    GrupoPlantillaEvaluacionId INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    PlantillaEvaluacionId INT NOT NULL,
    FechaAsignacion      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    OrigenClonacion      NVARCHAR(200) NULL,
    CONSTRAINT UQ_GrupoPlantillaEvaluacion UNIQUE (GrupoMateriaId, PlantillaEvaluacionId),
    CONSTRAINT FK_GPE_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_GPE_Plantilla FOREIGN KEY (PlantillaEvaluacionId) REFERENCES dbo.PlantillaEvaluacion(PlantillaEvaluacionId)
);
GO

CREATE TABLE dbo.Rubrica (
    RubricaId            INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Nombre               NVARCHAR(150) NOT NULL,
    Descripcion          NVARCHAR(500) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Rubrica_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.CriterioRubrica (
    CriterioRubricaId    INT IDENTITY(1,1) PRIMARY KEY,
    RubricaId            INT NOT NULL,
    Nombre               NVARCHAR(150) NOT NULL,
    Descripcion          NVARCHAR(500) NULL,
    PuntajeMaximo        DECIMAL(10,2) NOT NULL DEFAULT 0,
    OrdenVisual          INT NOT NULL DEFAULT 1,
    CONSTRAINT FK_CriterioRubrica_Rubrica FOREIGN KEY (RubricaId) REFERENCES dbo.Rubrica(RubricaId)
);
GO

CREATE TABLE dbo.NivelRubrica (
    NivelRubricaId       INT IDENTITY(1,1) PRIMARY KEY,
    RubricaId            INT NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    ValorNumerico        DECIMAL(10,2) NOT NULL DEFAULT 0,
    Descripcion          NVARCHAR(300) NULL,
    OrdenVisual          INT NOT NULL DEFAULT 1,
    CONSTRAINT FK_NivelRubrica_Rubrica FOREIGN KEY (RubricaId) REFERENCES dbo.Rubrica(RubricaId)
);
GO

CREATE TABLE dbo.InstrumentoEvaluacion (
    InstrumentoEvaluacionId INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    PeriodoId            INT NOT NULL,
    RubroEvaluacionId    INT NOT NULL,
    RubricaId            INT NULL,
    Nombre               NVARCHAR(150) NOT NULL,
    TipoInstrumento      NVARCHAR(50) NOT NULL,
    FechaAplicacion      DATE NULL,
    PuntajeMaximo        DECIMAL(10,2) NOT NULL DEFAULT 100,
    PorcentajeEspecifico DECIMAL(6,2) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_InstrumentoEvaluacion_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_InstrumentoEvaluacion_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
    CONSTRAINT FK_InstrumentoEvaluacion_RubroEvaluacion FOREIGN KEY (RubroEvaluacionId) REFERENCES dbo.RubroEvaluacion(RubroEvaluacionId),
    CONSTRAINT FK_InstrumentoEvaluacion_Rubrica FOREIGN KEY (RubricaId) REFERENCES dbo.Rubrica(RubricaId)
);
GO

CREATE TABLE dbo.NotaInstrumento (
    NotaInstrumentoId    INT IDENTITY(1,1) PRIMARY KEY,
    InstrumentoEvaluacionId INT NOT NULL,
    EstudianteId         INT NOT NULL,
    NotaObtenida         DECIMAL(10,2) NOT NULL DEFAULT 0,
    PorcentajeObtenido   DECIMAL(6,2) NULL,
    Observacion          NVARCHAR(500) NULL,
    FechaRegistro        DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_NotaInstrumento UNIQUE (InstrumentoEvaluacionId, EstudianteId),
    CONSTRAINT FK_NotaInstrumento_Instrumento FOREIGN KEY (InstrumentoEvaluacionId) REFERENCES dbo.InstrumentoEvaluacion(InstrumentoEvaluacionId),
    CONSTRAINT FK_NotaInstrumento_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId)
);
GO

CREATE TABLE dbo.ResumenRubro (
    ResumenRubroId       INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    PeriodoId            INT NOT NULL,
    EstudianteId         INT NOT NULL,
    RubroEvaluacionId    INT NOT NULL,
    PorcentajeAcumulado  DECIMAL(6,2) NOT NULL DEFAULT 0,
    UpdatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ResumenRubro UNIQUE (GrupoMateriaId, PeriodoId, EstudianteId, RubroEvaluacionId),
    CONSTRAINT FK_ResumenRubro_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_ResumenRubro_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
    CONSTRAINT FK_ResumenRubro_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_ResumenRubro_RubroEvaluacion FOREIGN KEY (RubroEvaluacionId) REFERENCES dbo.RubroEvaluacion(RubroEvaluacionId)
);
GO

CREATE TABLE dbo.ResumenPeriodo (
    ResumenPeriodoId     INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    PeriodoId            INT NOT NULL,
    EstudianteId         INT NOT NULL,
    NotaFinal            DECIMAL(10,2) NOT NULL DEFAULT 0,
    ObservacionFinal     NVARCHAR(500) NULL,
    UpdatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ResumenPeriodo UNIQUE (GrupoMateriaId, PeriodoId, EstudianteId),
    CONSTRAINT FK_ResumenPeriodo_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_ResumenPeriodo_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
    CONSTRAINT FK_ResumenPeriodo_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId)
);
GO

CREATE TABLE dbo.RubricaAplicada (
    RubricaAplicadaId    INT IDENTITY(1,1) PRIMARY KEY,
    RubricaId            INT NOT NULL,
    InstrumentoEvaluacionId INT NULL,
    ActividadCotidianoId INT NULL,
    TareaId              INT NULL,
    CONSTRAINT FK_RubricaAplicada_Rubrica FOREIGN KEY (RubricaId) REFERENCES dbo.Rubrica(RubricaId)
);
GO

/* =========================================================
   8. COTIDIANO, TAREAS Y EVIDENCIAS
   ========================================================= */

CREATE TABLE dbo.EstadoEntrega (
    EstadoEntregaId      INT IDENTITY(1,1) PRIMARY KEY,
    Nombre               NVARCHAR(100) NOT NULL,
    Codigo               NVARCHAR(30) NOT NULL,
    GeneraAlerta         BIT NOT NULL DEFAULT 0,
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_EstadoEntrega_Codigo UNIQUE (Codigo)
);
GO

CREATE TABLE dbo.ActividadCotidiano (
    ActividadCotidianoId INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    PeriodoId            INT NOT NULL,
    RubricaId            INT NULL,
    Titulo               NVARCHAR(200) NOT NULL,
    ObjetivoGeneral      NVARCHAR(MAX) NULL,
    Alcance              NVARCHAR(MAX) NULL,
    Instrucciones        NVARCHAR(MAX) NULL,
    FechaAsignacion      DATE NOT NULL,
    FechaEntrega         DATE NULL,
    PuntajeMaximo        DECIMAL(10,2) NOT NULL DEFAULT 100,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_ActividadCotidiano_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_ActividadCotidiano_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
    CONSTRAINT FK_ActividadCotidiano_Rubrica FOREIGN KEY (RubricaId) REFERENCES dbo.Rubrica(RubricaId)
);
GO

ALTER TABLE dbo.RubricaAplicada
ADD CONSTRAINT FK_RubricaAplicada_Instrumento FOREIGN KEY (InstrumentoEvaluacionId) REFERENCES dbo.InstrumentoEvaluacion(InstrumentoEvaluacionId);
GO
ALTER TABLE dbo.RubricaAplicada
ADD CONSTRAINT FK_RubricaAplicada_ActividadCotidiano FOREIGN KEY (ActividadCotidianoId) REFERENCES dbo.ActividadCotidiano(ActividadCotidianoId);
GO

CREATE TABLE dbo.ObjetivoActividad (
    ObjetivoActividadId  INT IDENTITY(1,1) PRIMARY KEY,
    ActividadCotidianoId INT NOT NULL,
    Descripcion          NVARCHAR(MAX) NOT NULL,
    OrdenVisual          INT NOT NULL DEFAULT 1,
    CONSTRAINT FK_ObjetivoActividad_ActividadCotidiano FOREIGN KEY (ActividadCotidianoId) REFERENCES dbo.ActividadCotidiano(ActividadCotidianoId)
);
GO

CREATE TABLE dbo.EntregableActividad (
    EntregableActividadId INT IDENTITY(1,1) PRIMARY KEY,
    ActividadCotidianoId INT NOT NULL,
    Descripcion          NVARCHAR(MAX) NOT NULL,
    EsObligatorio        BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_EntregableActividad_ActividadCotidiano FOREIGN KEY (ActividadCotidianoId) REFERENCES dbo.ActividadCotidiano(ActividadCotidianoId)
);
GO

CREATE TABLE dbo.EntregaActividad (
    EntregaActividadId   INT IDENTITY(1,1) PRIMARY KEY,
    ActividadCotidianoId INT NOT NULL,
    EstudianteId         INT NOT NULL,
    EstadoEntregaId      INT NOT NULL,
    FechaEntrega         DATETIME2 NULL,
    Calificacion         DECIMAL(10,2) NULL,
    ObservacionDocente   NVARCHAR(500) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_EntregaActividad UNIQUE (ActividadCotidianoId, EstudianteId),
    CONSTRAINT FK_EntregaActividad_ActividadCotidiano FOREIGN KEY (ActividadCotidianoId) REFERENCES dbo.ActividadCotidiano(ActividadCotidianoId),
    CONSTRAINT FK_EntregaActividad_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_EntregaActividad_EstadoEntrega FOREIGN KEY (EstadoEntregaId) REFERENCES dbo.EstadoEntrega(EstadoEntregaId)
);
GO

CREATE TABLE dbo.Tarea (
    TareaId              INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    PeriodoId            INT NOT NULL,
    RubricaId            INT NULL,
    Titulo               NVARCHAR(200) NOT NULL,
    Descripcion          NVARCHAR(MAX) NULL,
    FechaAsignacion      DATE NOT NULL,
    FechaEntrega         DATE NULL,
    PuntajeMaximo        DECIMAL(10,2) NOT NULL DEFAULT 100,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Tarea_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_Tarea_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
    CONSTRAINT FK_Tarea_Rubrica FOREIGN KEY (RubricaId) REFERENCES dbo.Rubrica(RubricaId)
);
GO

ALTER TABLE dbo.RubricaAplicada
ADD CONSTRAINT FK_RubricaAplicada_Tarea FOREIGN KEY (TareaId) REFERENCES dbo.Tarea(TareaId);
GO

CREATE TABLE dbo.EntregableTarea (
    EntregableTareaId    INT IDENTITY(1,1) PRIMARY KEY,
    TareaId              INT NOT NULL,
    Descripcion          NVARCHAR(MAX) NOT NULL,
    EsObligatorio        BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_EntregableTarea_Tarea FOREIGN KEY (TareaId) REFERENCES dbo.Tarea(TareaId)
);
GO

CREATE TABLE dbo.EntregaTarea (
    EntregaTareaId       INT IDENTITY(1,1) PRIMARY KEY,
    TareaId              INT NOT NULL,
    EstudianteId         INT NOT NULL,
    EstadoEntregaId      INT NOT NULL,
    FechaEntrega         DATETIME2 NULL,
    Calificacion         DECIMAL(10,2) NULL,
    ObservacionDocente   NVARCHAR(500) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_EntregaTarea UNIQUE (TareaId, EstudianteId),
    CONSTRAINT FK_EntregaTarea_Tarea FOREIGN KEY (TareaId) REFERENCES dbo.Tarea(TareaId),
    CONSTRAINT FK_EntregaTarea_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_EntregaTarea_EstadoEntrega FOREIGN KEY (EstadoEntregaId) REFERENCES dbo.EstadoEntrega(EstadoEntregaId)
);
GO

CREATE TABLE dbo.Archivo (
    ArchivoId            INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Proveedor            NVARCHAR(50) NOT NULL,
    UrlArchivo           NVARCHAR(1000) NOT NULL,
    PublicIdExterno      NVARCHAR(300) NULL,
    NombreOriginal       NVARCHAR(255) NOT NULL,
    Extension            NVARCHAR(20) NULL,
    TamanoBytes          BIGINT NULL,
    FechaCarga           DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UsuarioCargaId       INT NULL,
    CONSTRAINT FK_Archivo_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_Archivo_UsuarioCarga FOREIGN KEY (UsuarioCargaId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.ArchivoRelacionado (
    ArchivoRelacionadoId INT IDENTITY(1,1) PRIMARY KEY,
    ArchivoId            INT NOT NULL,
    Entidad              NVARCHAR(100) NOT NULL,
    EntidadId            INT NOT NULL,
    Descripcion          NVARCHAR(300) NULL,
    CONSTRAINT FK_ArchivoRelacionado_Archivo FOREIGN KEY (ArchivoId) REFERENCES dbo.Archivo(ArchivoId)
);
GO

/* =========================================================
   9. INCIDENCIAS, BITACORA, RECUPERACION Y DIAGNOSTICO
   ========================================================= */

CREATE TABLE dbo.TipoIncidencia (
    TipoIncidenciaId     INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    Nombre               NVARCHAR(100) NOT NULL,
    Severidad            NVARCHAR(30) NULL,
    GeneraNotificacion   BIT NOT NULL DEFAULT 0,
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_TipoIncidencia_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.Incidencia (
    IncidenciaId         INT IDENTITY(1,1) PRIMARY KEY,
    TipoIncidenciaId     INT NOT NULL,
    EstudianteId         INT NOT NULL,
    GrupoMateriaId       INT NULL,
    UsuarioReportaId     INT NOT NULL,
    FechaIncidencia      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Detalle              NVARCHAR(MAX) NOT NULL,
    Estado               NVARCHAR(50) NOT NULL DEFAULT N'Abierta',
    CONSTRAINT FK_Incidencia_TipoIncidencia FOREIGN KEY (TipoIncidenciaId) REFERENCES dbo.TipoIncidencia(TipoIncidenciaId),
    CONSTRAINT FK_Incidencia_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_Incidencia_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_Incidencia_UsuarioReporta FOREIGN KEY (UsuarioReportaId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.SeguimientoIncidencia (
    SeguimientoIncidenciaId INT IDENTITY(1,1) PRIMARY KEY,
    IncidenciaId         INT NOT NULL,
    UsuarioId            INT NOT NULL,
    FechaSeguimiento     DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Comentario           NVARCHAR(MAX) NOT NULL,
    EstadoNuevo          NVARCHAR(50) NULL,
    CONSTRAINT FK_SeguimientoIncidencia_Incidencia FOREIGN KEY (IncidenciaId) REFERENCES dbo.Incidencia(IncidenciaId),
    CONSTRAINT FK_SeguimientoIncidencia_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.BitacoraEstudiante (
    BitacoraEstudianteId INT IDENTITY(1,1) PRIMARY KEY,
    EstudianteId         INT NOT NULL,
    UsuarioId            INT NOT NULL,
    FechaEvento          DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    TipoEvento           NVARCHAR(100) NOT NULL,
    Descripcion          NVARCHAR(MAX) NOT NULL,
    CONSTRAINT FK_BitacoraEstudiante_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_BitacoraEstudiante_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.Recuperacion (
    RecuperacionId       INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    PeriodoId            INT NOT NULL,
    RubroEvaluacionId    INT NULL,
    Titulo               NVARCHAR(200) NOT NULL,
    Descripcion          NVARCHAR(MAX) NULL,
    FechaProgramada      DATE NULL,
    PuntajeMaximo        DECIMAL(10,2) NOT NULL DEFAULT 100,
    Activo               BIT NOT NULL DEFAULT 1,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Recuperacion_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_Recuperacion_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
    CONSTRAINT FK_Recuperacion_RubroEvaluacion FOREIGN KEY (RubroEvaluacionId) REFERENCES dbo.RubroEvaluacion(RubroEvaluacionId)
);
GO

CREATE TABLE dbo.EntregaRecuperacion (
    EntregaRecuperacionId INT IDENTITY(1,1) PRIMARY KEY,
    RecuperacionId       INT NOT NULL,
    EstudianteId         INT NOT NULL,
    EstadoEntregaId      INT NOT NULL,
    FechaEntrega         DATETIME2 NULL,
    Calificacion         DECIMAL(10,2) NULL,
    Observacion          NVARCHAR(500) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT UQ_EntregaRecuperacion UNIQUE (RecuperacionId, EstudianteId),
    CONSTRAINT FK_EntregaRecuperacion_Recuperacion FOREIGN KEY (RecuperacionId) REFERENCES dbo.Recuperacion(RecuperacionId),
    CONSTRAINT FK_EntregaRecuperacion_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_EntregaRecuperacion_EstadoEntrega FOREIGN KEY (EstadoEntregaId) REFERENCES dbo.EstadoEntrega(EstadoEntregaId)
);
GO

CREATE TABLE dbo.EvidenciaArchivo (
    EvidenciaArchivoId   INT IDENTITY(1,1) PRIMARY KEY,
    ArchivoId            INT NOT NULL,
    EntregaActividadId   INT NULL,
    EntregaTareaId       INT NULL,
    EntregaRecuperacionId INT NULL,
    CONSTRAINT FK_EvidenciaArchivo_Archivo FOREIGN KEY (ArchivoId) REFERENCES dbo.Archivo(ArchivoId),
    CONSTRAINT FK_EvidenciaArchivo_EntregaActividad FOREIGN KEY (EntregaActividadId) REFERENCES dbo.EntregaActividad(EntregaActividadId),
    CONSTRAINT FK_EvidenciaArchivo_EntregaTarea FOREIGN KEY (EntregaTareaId) REFERENCES dbo.EntregaTarea(EntregaTareaId),
    CONSTRAINT FK_EvidenciaArchivo_EntregaRecuperacion FOREIGN KEY (EntregaRecuperacionId) REFERENCES dbo.EntregaRecuperacion(EntregaRecuperacionId)
);
GO

CREATE TABLE dbo.PuntajeRubrica (
    PuntajeRubricaId     INT IDENTITY(1,1) PRIMARY KEY,
    RubricaAplicadaId    INT NOT NULL,
    CriterioRubricaId    INT NOT NULL,
    EstudianteId         INT NOT NULL,
    NivelRubricaId       INT NULL,
    PuntajeAsignado      DECIMAL(10,2) NOT NULL DEFAULT 0,
    Observacion          NVARCHAR(300) NULL,
    CONSTRAINT FK_PuntajeRubrica_RubricaAplicada FOREIGN KEY (RubricaAplicadaId) REFERENCES dbo.RubricaAplicada(RubricaAplicadaId),
    CONSTRAINT FK_PuntajeRubrica_CriterioRubrica FOREIGN KEY (CriterioRubricaId) REFERENCES dbo.CriterioRubrica(CriterioRubricaId),
    CONSTRAINT FK_PuntajeRubrica_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_PuntajeRubrica_NivelRubrica FOREIGN KEY (NivelRubricaId) REFERENCES dbo.NivelRubrica(NivelRubricaId)
);
GO

CREATE TABLE dbo.Diagnostico (
    DiagnosticoId        INT IDENTITY(1,1) PRIMARY KEY,
    GrupoMateriaId       INT NOT NULL,
    PeriodoId            INT NOT NULL,
    Nombre               NVARCHAR(150) NOT NULL,
    Descripcion          NVARCHAR(MAX) NULL,
    FechaAplicacion      DATE NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_Diagnostico_GrupoMateria FOREIGN KEY (GrupoMateriaId) REFERENCES dbo.GrupoMateria(GrupoMateriaId),
    CONSTRAINT FK_Diagnostico_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId)
);
GO

CREATE TABLE dbo.ResultadoDiagnostico (
    ResultadoDiagnosticoId INT IDENTITY(1,1) PRIMARY KEY,
    DiagnosticoId        INT NOT NULL,
    EstudianteId         INT NOT NULL,
    CategoriaRiesgo      NVARCHAR(50) NULL,
    Puntaje              DECIMAL(10,2) NULL,
    Observacion          NVARCHAR(500) NULL,
    CONSTRAINT UQ_ResultadoDiagnostico UNIQUE (DiagnosticoId, EstudianteId),
    CONSTRAINT FK_ResultadoDiagnostico_Diagnostico FOREIGN KEY (DiagnosticoId) REFERENCES dbo.Diagnostico(DiagnosticoId),
    CONSTRAINT FK_ResultadoDiagnostico_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId)
);
GO

CREATE TABLE dbo.EPI (
    EPIId                INT IDENTITY(1,1) PRIMARY KEY,
    EstudianteId         INT NOT NULL,
    PeriodoId            INT NOT NULL,
    UsuarioResponsableId INT NOT NULL,
    Situacion            NVARCHAR(MAX) NULL,
    AccionRealizada      NVARCHAR(MAX) NULL,
    FechaRegistro        DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_EPI_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_EPI_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
    CONSTRAINT FK_EPI_UsuarioResponsable FOREIGN KEY (UsuarioResponsableId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.SeguimientoEPI (
    SeguimientoEPIId     INT IDENTITY(1,1) PRIMARY KEY,
    EPIId                INT NOT NULL,
    UsuarioId            INT NOT NULL,
    FechaSeguimiento     DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Comentario           NVARCHAR(MAX) NOT NULL,
    CONSTRAINT FK_SeguimientoEPI_EPI FOREIGN KEY (EPIId) REFERENCES dbo.EPI(EPIId),
    CONSTRAINT FK_SeguimientoEPI_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.Adecuacion (
    AdecuacionId         INT IDENTITY(1,1) PRIMARY KEY,
    EstudianteId         INT NOT NULL,
    PeriodoId            INT NOT NULL,
    TipoAdecuacion       NVARCHAR(100) NOT NULL,
    Fortalezas           NVARCHAR(MAX) NULL,
    Debilidades          NVARCHAR(MAX) NULL,
    Resultados           NVARCHAR(MAX) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt            DATETIME2 NULL,
    CONSTRAINT FK_Adecuacion_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_Adecuacion_Periodo FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId)
);
GO

CREATE TABLE dbo.ApoyoEstudiante (
    ApoyoEstudianteId    INT IDENTITY(1,1) PRIMARY KEY,
    AdecuacionId         INT NOT NULL,
    TipoApoyo            NVARCHAR(100) NOT NULL,
    Descripcion          NVARCHAR(MAX) NULL,
    Responsable          NVARCHAR(150) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_ApoyoEstudiante_Adecuacion FOREIGN KEY (AdecuacionId) REFERENCES dbo.Adecuacion(AdecuacionId)
);
GO

/* =========================================================
   10. NOTIFICACIONES, DOCUMENTOS Y AYUDA
   ========================================================= */

CREATE TABLE dbo.Notificacion (
    NotificacionId       BIGINT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    EstudianteId         INT NULL,
    EncargadoId          INT NULL,
    CanalNotificacionId  INT NOT NULL,
    PlantillaMensajeId   INT NULL,
    TipoEvento           NVARCHAR(100) NOT NULL,
    ReferenciaEntidad    NVARCHAR(100) NULL,
    ReferenciaEntidadId  INT NULL,
    FechaGeneracion      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Estado               NVARCHAR(50) NOT NULL DEFAULT N'Pendiente',
    CONSTRAINT FK_Notificacion_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_Notificacion_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_Notificacion_Encargado FOREIGN KEY (EncargadoId) REFERENCES dbo.Encargado(EncargadoId),
    CONSTRAINT FK_Notificacion_Canal FOREIGN KEY (CanalNotificacionId) REFERENCES dbo.CanalNotificacion(CanalNotificacionId),
    CONSTRAINT FK_Notificacion_Plantilla FOREIGN KEY (PlantillaMensajeId) REFERENCES dbo.PlantillaMensaje(PlantillaMensajeId)
);
GO

CREATE TABLE dbo.HistorialEnvio (
    HistorialEnvioId     BIGINT IDENTITY(1,1) PRIMARY KEY,
    NotificacionId       BIGINT NOT NULL,
    FechaIntento         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Resultado            NVARCHAR(50) NOT NULL,
    Proveedor            NVARCHAR(100) NULL,
    CodigoRespuesta      NVARCHAR(100) NULL,
    DetalleRespuesta     NVARCHAR(MAX) NULL,
    CONSTRAINT FK_HistorialEnvio_Notificacion FOREIGN KEY (NotificacionId) REFERENCES dbo.Notificacion(NotificacionId)
);
GO

CREATE TABLE dbo.Comunicado (
    ComunicadoId         INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    UsuarioCreadorId     INT NOT NULL,
    Titulo               NVARCHAR(200) NOT NULL,
    Contenido            NVARCHAR(MAX) NOT NULL,
    FechaPublicacion     DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    FechaExpiracion      DATETIME2 NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_Comunicado_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_Comunicado_UsuarioCreador FOREIGN KEY (UsuarioCreadorId) REFERENCES dbo.Usuario(UsuarioId)
);
GO

CREATE TABLE dbo.DocumentoNormativo (
    DocumentoNormativoId INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    EstudianteId         INT NOT NULL,
    TipoDocumento        NVARCHAR(100) NOT NULL,
    FechaGeneracion      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    RutaArchivo          NVARCHAR(1000) NULL,
    Estado               NVARCHAR(50) NOT NULL DEFAULT N'Generado',
    CONSTRAINT FK_DocumentoNormativo_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_DocumentoNormativo_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId)
);
GO

CREATE TABLE dbo.DocumentoAcademico (
    DocumentoAcademicoId INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NOT NULL,
    EstudianteId         INT NOT NULL,
    TipoDocumento        NVARCHAR(100) NOT NULL,
    FechaGeneracion      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    RutaArchivo          NVARCHAR(1000) NULL,
    Estado               NVARCHAR(50) NOT NULL DEFAULT N'Generado',
    CONSTRAINT FK_DocumentoAcademico_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_DocumentoAcademico_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId)
);
GO

CREATE TABLE dbo.FAQ (
    FAQId                INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NULL,
    Pregunta             NVARCHAR(500) NOT NULL,
    Respuesta            NVARCHAR(MAX) NOT NULL,
    Activa               BIT NOT NULL DEFAULT 1,
    OrdenVisual          INT NOT NULL DEFAULT 1,
    CONSTRAINT FK_FAQ_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.RecursoAyuda (
    RecursoAyudaId       INT IDENTITY(1,1) PRIMARY KEY,
    InstitucionId        INT NULL,
    Categoria            NVARCHAR(100) NULL,
    Titulo               NVARCHAR(200) NOT NULL,
    Descripcion          NVARCHAR(MAX) NULL,
    Activo               BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_RecursoAyuda_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
);
GO

CREATE TABLE dbo.VideoAyuda (
    VideoAyudaId         INT IDENTITY(1,1) PRIMARY KEY,
    RecursoAyudaId       INT NOT NULL,
    Titulo               NVARCHAR(200) NOT NULL,
    UrlYoutube           NVARCHAR(1000) NOT NULL,
    Destacado            BIT NOT NULL DEFAULT 0,
    CONSTRAINT FK_VideoAyuda_RecursoAyuda FOREIGN KEY (RecursoAyudaId) REFERENCES dbo.RecursoAyuda(RecursoAyudaId)
);
GO

/* =========================================================
   11. INDICES BASICOS
   ========================================================= */

CREATE INDEX IX_Usuario_InstitucionId ON dbo.Usuario(InstitucionId);
CREATE INDEX IX_Sede_InstitucionId ON dbo.Sede(InstitucionId);
CREATE INDEX IX_AnioLectivo_InstitucionId ON dbo.AnioLectivo(InstitucionId);
CREATE INDEX IX_Periodo_AnioLectivoId ON dbo.Periodo(AnioLectivoId);
CREATE INDEX IX_Grupo_InstitucionId ON dbo.Grupo(InstitucionId);
CREATE INDEX IX_Grupo_AnioLectivoId ON dbo.Grupo(AnioLectivoId);
CREATE INDEX IX_GrupoMateria_GrupoId ON dbo.GrupoMateria(GrupoId);
CREATE INDEX IX_GrupoMateria_MateriaId ON dbo.GrupoMateria(MateriaId);
CREATE INDEX IX_Matricula_GrupoId ON dbo.Matricula(GrupoId);
CREATE INDEX IX_Matricula_EstudianteId ON dbo.Matricula(EstudianteId);
CREATE INDEX IX_FechaClase_Fecha ON dbo.FechaClase(Fecha);
CREATE INDEX IX_AsistenciaSesion_FechaClaseId ON dbo.AsistenciaSesion(FechaClaseId);
CREATE INDEX IX_DetalleAsistencia_EstudianteId ON dbo.DetalleAsistencia(EstudianteId);
CREATE INDEX IX_InstrumentoEvaluacion_GrupoMateriaId ON dbo.InstrumentoEvaluacion(GrupoMateriaId);
CREATE INDEX IX_NotaInstrumento_EstudianteId ON dbo.NotaInstrumento(EstudianteId);
CREATE INDEX IX_ActividadCotidiano_GrupoMateriaId ON dbo.ActividadCotidiano(GrupoMateriaId);
CREATE INDEX IX_Tarea_GrupoMateriaId ON dbo.Tarea(GrupoMateriaId);
CREATE INDEX IX_Incidencia_EstudianteId ON dbo.Incidencia(EstudianteId);
CREATE INDEX IX_Recuperacion_GrupoMateriaId ON dbo.Recuperacion(GrupoMateriaId);
CREATE INDEX IX_Notificacion_EncargadoId ON dbo.Notificacion(EncargadoId);
CREATE INDEX IX_Notificacion_EstudianteId ON dbo.Notificacion(EstudianteId);
CREATE INDEX IX_Pago_SuscripcionId ON dbo.Pago(SuscripcionId);
GO

/* =========================================================
   12. CATALOGOS SEMILLA
   ========================================================= */

INSERT INTO dbo.TipoCliente (Nombre, Descripcion) VALUES
(N'Institucional', N'Institución completa'),
(N'Individual', N'Profesor individual');
GO

INSERT INTO dbo.EstadoSuscripcion (Nombre, Descripcion) VALUES
(N'Activa', N'Suscripción vigente'),
(N'Pendiente', N'Pendiente de pago o activación'),
(N'Vencida', N'Vigencia finalizada'),
(N'Suspendida', N'Acceso suspendido');
GO

INSERT INTO dbo.Rol (Nombre, Descripcion) VALUES
(N'SUPER_ADMIN', N'Administrador global del sistema'),
(N'ADMIN_INSTITUCIONAL', N'Administrador del colegio o institución'),
(N'PROFESOR', N'Docente regular'),
(N'PROFESOR_GUIA', N'Docente guía'),
(N'ADMINISTRATIVO', N'Usuario administrativo'),
(N'PADRE_FAMILIA', N'Padre o encargado');
GO

INSERT INTO dbo.CanalNotificacion (Nombre, Codigo) VALUES
(N'Correo electrónico', N'EMAIL'),
(N'WhatsApp', N'WHATSAPP');
GO

INSERT INTO dbo.EstadoEntrega (Nombre, Codigo, GeneraAlerta) VALUES
(N'Pendiente', N'PENDIENTE', 0),
(N'Entregada', N'ENTREGADA', 0),
(N'No entregada', N'NO_ENTREGADA', 1),
(N'Atrasada', N'ATRASADA', 1),
(N'Revisada', N'REVISADA', 0);
GO

INSERT INTO dbo.PlanComercial (Nombre, Descripcion, TipoCobro, PrecioBase, MaxUsuarios, MaxInstituciones, Activo) VALUES
(N'Plan Institucional Básico', N'Plan para una institución educativa', N'MENSUAL', 0, 100, 1, 1),
(N'Plan Profesor Individual', N'Plan para uso individual por docente', N'MENSUAL', 0, 1, 1, 1);
GO

PRINT 'Script limpio y unificado ejecutado correctamente en la base PROFESOR';
GO
