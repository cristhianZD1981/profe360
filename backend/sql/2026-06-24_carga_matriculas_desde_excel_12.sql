SET NOCOUNT ON;
SET XACT_ABORT OFF;

DECLARE @InstitucionId INT = 1;
DECLARE @AnioLectivoId INT = 1;
DECLARE @UsuarioId INT = NULL;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.AnioLectivo
    WHERE AnioLectivoId = @AnioLectivoId
      AND InstitucionId = @InstitucionId
)
BEGIN
    THROW 50000, 'El a?o lectivo indicado no pertenece a la instituci?n seleccionada.', 1;
END;

DECLARE @Source TABLE (
    Fila INT NOT NULL,
    Cedula NVARCHAR(50) NOT NULL,
    SeccionRaw NVARCHAR(100) NULL,
    FechaMatricula DATE NULL,
    TipoMatricula NVARCHAR(100) NULL,
    EspecialidadRaw NVARCHAR(200) NULL,
    Observacion NVARCHAR(500) NULL,
    EsRepitente BIT NOT NULL,
    PermiteExcepcionProgresion BIT NOT NULL,
    JustificacionExcepcion NVARCHAR(500) NULL
);

INSERT INTO @Source (Fila, Cedula, SeccionRaw, FechaMatricula, TipoMatricula, EspecialidadRaw, Observacion, EsRepitente, PermiteExcepcionProgresion, JustificacionExcepcion)
VALUES
(2, N'159101479912', N'10 PN', NULL, N'Regular', N'Formación Vocacional', N'', 0, 0, N''),
(3, N'YR2022-24284', N'11 PN', '2025-11-05', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(4, N'6053220259', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(5, N'703470756', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(6, N'605410355', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(7, N'120170300', N'12 PN', '2025-11-07', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(8, N'605060175', N'12 PN', '2025-11-14', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(9, N'121210448', N'9 PN', '2025-11-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(10, N'605370673', N'8 PN', '2025-11-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(11, N'120410118', N'11 PN', '2025-11-14', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(12, N'605260461', N'9 PN', '2025-11-14', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(13, N'605330877', N'9 PN', '2025-11-14', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(14, N'605360521', N'7 PN', '2026-03-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(15, N'40870013', N'7 PN', NULL, N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(16, N'605230593', N'9 PN', '2025-11-07', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(17, N'120150115', N'12 PN', '2025-11-14', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(18, N'119560489', N'11 PN', '2025-11-04', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(19, N'605100804', N'12 PN', '2025-11-07', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(20, N'121080396', N'8 PN', '2025-11-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(21, N'121190031', N'9 PN', '2026-02-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(22, N'121810122', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(23, N'605140846', N'10 PN', '2025-11-04', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(24, N'119840208', N'12 PN', '2025-12-09', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(25, N'605210615', N'11 PN', '2025-11-04', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(26, N'605220201', N'10 PN', '2025-11-14', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(27, N'121860207', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(28, N'605400451', N'8 PN', '2025-11-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(29, N'120650241', N'11 PN', '2025-11-04', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(30, N'605390342', N'8 PN', '2025-11-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(31, N'605420272', N'7 PN', '2026-02-24', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(32, N'605740604', N'8 PN', '2025-11-07', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(33, N'605620753', N'8 PN', '2025-11-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(34, N'605210591', N'11 PN', '2025-11-07', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(35, N'605370962', N'8 PN', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(36, N'605400254', N'8 PN', '2025-11-07', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(37, N'605150037', N'11 PN', '2025-11-04', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(38, N'605350072', N'8 PN', '2025-11-07', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(39, N'605280509', N'9 PN', '2025-11-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(40, N'605410375', N'8 PN', '2025-11-07', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(41, N'605460801', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(42, N'605760762', N'8 PN', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(43, N'120480338', N'11 PN', '2025-11-07', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(44, N'605090990', N'11 PN', '2025-12-09', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(45, N'605170001', N'12 PN', '2025-11-14', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(46, N'605190956', N'10 PN', '2025-12-09', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(47, N'YR2022-29821', N'12 PN', '2025-12-09', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(48, N'120770012', N'9 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(49, N'605150104', N'11 PN', '2025-11-04', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(50, N'605180992', N'10 PN', '2025-11-04', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(51, N'306000420', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(52, N'605240960', N'8 PN', '2025-11-14', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(53, N'605390427', N'8 PN', '2025-11-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(54, N'605230106', N'11 PN', '2025-11-14', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(55, N'605430469', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(56, N'605230222', N'10 PN', '2025-11-14', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(57, N'605260462', N'9 PN', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(58, N'605290204', N'11 PN', '2025-11-07', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(59, N'605140419', N'10 PN', '2025-12-09', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(60, N'605040668', N'12 PN', '2025-11-04', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(61, N'306030805', N'8 PN', '2025-11-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(62, N'605340239', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(63, N'159101483625', N'11 PN', NULL, N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(64, N'605340468', N'7 PN', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(65, N'12741656', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(66, N'605320316', N'9 PN', '2025-11-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(67, N'605160076', N'11 PN', '2025-11-07', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(68, N'120990104', N'8 PN', '2025-11-07', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(69, N'605380927', N'8 PN', '2025-11-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(70, N'209170879', N'11 PN', '2025-11-14', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(71, N'605190136', N'10 PN', '2025-11-05', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(72, N'605290947', N'9 PN', '2025-11-14', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(73, N'12741657', N'7 PN', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(74, N'402500837', N'10 PN', '2026-03-05', N'Regular', N'Formación Vocacional', NULL, 0, 0, NULL),
(75, N'YR2023-08820', N'8 PN', '2026-03-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(76, N'605460385', N'7 PN', '2026-03-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(77, N'605430475', N'7 PN', '2026-03-27', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(78, N'121500843', N'7 PN', '2026-04-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(79, N'120340294', N'11 PN', '2026-05-18', N'Regular', N'Undécimo', NULL, 0, 0, NULL),
(80, N'605330638', N'9-5', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(81, N'´159101488202', N'7-1', '2026-02-27', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(82, N'´159101420213', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(83, N'´159101420320', N'8-1', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(84, N'605220784', N'10-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(85, N'605560009', N'10-1', '2025-12-08', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(86, N'121580832', N'7-1', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(87, N'605300784', N'7-2', '00:00:00', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(88, N'605270047', N'8-3', '00:00:00', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(89, N'YR2023-00526', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(90, N'605350034', N'9-6', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(91, N'306070539', N'10-3', '2025-12-09', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(92, N'120410944', N'12-1', '2025-12-04', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(93, N'605090371', N'12-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(94, N'605330796', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(95, N'605250185', N'10-1', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(96, N'306100194', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(97, N'605460517', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(98, N'121330750', N'9-1', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(99, N'605320475', N'8-5', '2026-02-11', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(100, N'605420995', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(101, N'209420132', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(102, N'120960460', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(103, N'605320280', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(104, N'605460376', N'7-2', '00:00:00', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(105, N'120150140', N'12-1', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(106, N'605200518', N'11-3', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(107, N'120150912', N'12-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(108, N'703730106', N'8-6', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(109, N'120650884', N'10-1', '2026-02-19', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(110, N'121330752', N'8-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(111, N'121620521', N'8-5', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(112, N'121400504', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(113, N'120370347', N'10-2', '2025-12-09', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(114, N'121030824', N'9-2', '2026-02-18', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(115, N'605170950', N'11-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(116, N'120500262', N'11-1', '2025-12-05', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(117, N'605320986', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(118, N'120430304', N'11-1', '2025-12-05', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(119, N'703580284', N'8-1', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(120, N'121070076', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(121, N'504790248', N'12-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(122, N'120180844', N'12-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(123, N'605350989', N'8-5', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(124, N'605110130', N'12-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(125, N'121010837', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(126, N'´155851527534', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(127, N'605210879', N'11-4', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(128, N'121330724', N'9-2', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(129, N'120700468', N'11-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(130, N'605080953', N'12-1', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(131, N'121210606', N'9-2', '2026-05-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(132, N'121320541', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(133, N'120660336', N'11-3', '2025-12-04', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(134, N'605400856', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(135, N'605400679', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(136, N'121320210', N'7-1', '2026-03-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(137, N'605260493', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(138, N'605140500', N'12-1', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(139, N'605360406', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(140, N'605100805', N'12-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(141, N'120470353', N'11-4', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(142, N'120910578', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(143, N'120700994', N'10-3', '2026-02-17', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(144, N'120710360', N'11-1', '2025-12-08', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(145, N'121540833', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(146, N'121080383', N'9-4', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(147, N'605160460', N'11-2', '2025-12-08', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(148, N'605390384', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(149, N'605370748', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(150, N'605280212', N'9-2', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(151, N'605470356', N'7-6', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(152, N'120870488', N'9-2', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(153, N'605370844', N'8-6', '2026-02-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(154, N'605150569', N'11-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(155, N'121330808', N'8-2', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(156, N'605710233', N'7-7', '2026-02-27', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(157, N'121390440', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(158, N'120910783', N'10-4', '2025-12-09', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(159, N'121540336', N'8-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(160, N'605250878', N'10-1', '2026-03-09', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(161, N'605320477', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(162, N'605340315', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(163, N'605350347', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(164, N'605190718', N'11-1', '2025-12-08', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(165, N'605270985', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(166, N'605280367', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(167, N'605430130', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(168, N'605230221', N'9-5', '2026-02-18', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(169, N'605330094', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(170, N'120370564', N'12-1', '2025-12-08', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(171, N'120430817', N'11-2', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(172, N'605310238', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(173, N'120130261', N'12-2', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(174, N'605440829', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(175, N'605410352', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(176, N'121270094', N'8-4', '2026-03-06', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(177, N'605440590', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(178, N'121340879', N'7-4', '2026-03-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(179, N'605320531', N'9-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(180, N'605250154', N'8-3', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(181, N'605240178', N'10-1', '2026-02-24', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(182, N'´159101416323', N'8-3', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(183, N'605290200', N'8-1', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(184, N'305980180', N'7-5', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(185, N'605180612', N'10-1', '2026-02-13', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(186, N'121090047', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(187, N'605140420', N'12-3', '2025-12-08', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(188, N'605440833', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(189, N'121610402', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(190, N'121220693', N'9-5', '2026-02-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(191, N'605410373', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(192, N'605350548', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(193, N'605140824', N'12-1', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(194, N'605140945', N'12-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(195, N'605270654', N'10-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(196, N'605410463', N'8-3', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(197, N'121270177', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(198, N'121830826', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(199, N'121760393', N'7-5', '2026-02-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(200, N'605340471', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(201, N'605160452', N'10-1', '2026-02-18', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(202, N'605410700', N'8-5', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(203, N'121250380', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(204, N'121110454', N'9-2', '2026-02-19', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(205, N'605400249', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(206, N'121900878', N'7-1', '2026-02-11', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(207, N'121890708', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(208, N'402930355', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(209, N'121640184', N'7-4', '2026-03-02', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(210, N'605420303', N'7-2', '2026-05-11', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(211, N'605250155', N'9-4', '2026-02-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(212, N'605280461', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(213, N'120650092', N'11-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(214, N'121610501', N'7-6', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(215, N'121100026', N'9-1', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(216, N'121190459', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(217, N'121340408', N'9-1', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(218, N'605360614', N'8-2', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(219, N'605440271', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(220, N'120440498', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(221, N'120990693', N'10-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(222, N'605400822', N'7-1', '2026-02-11', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(223, N'121350075', N'9-1', '2026-02-19', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(224, N'120160373', N'12-1', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(225, N'605210163', N'11-3', '2026-02-19', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(226, N'901310620', N'9-5', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(227, N'901310621', N'12-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(228, N'121510987', N'7-1', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(229, N'605370753', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(230, N'305970829', N'9-6', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(231, N'305760885', N'12-1', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(232, N'605200984', N'11-3', '2025-12-03', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(233, N'605390981', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(234, N'120960724', N'10-3', '2025-12-08', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(235, N'121890915', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(236, N'605370900', N'8-1', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(237, N'120230889', N'12-2', '2026-02-16', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(238, N'120270756', N'12-2', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(239, N'605290162', N'8-4', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(240, N'605330246', N'9-1', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(241, N'121920585', N'7-5', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(242, N'605140985', N'12-1', '2026-02-10', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(243, N'605410199', N'8-2', '2026-02-10', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(244, N'605200798', N'10-2', '2026-02-24', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(245, N'121850999', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(246, N'605330091', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(247, N'121680545', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(248, N'605350561', N'9-1', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(249, N'605430551', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(250, N'605350878', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(251, N'605160453', N'10-1', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(252, N'121130533', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(253, N'605390972', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(254, N'605400918', N'8-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(255, N'306060807', N'8-6', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(256, N'121730911', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(257, N'605100999', N'12-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(258, N'402960840', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(259, N'209620449', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(260, N'605430346', N'7-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(261, N'121540743', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(262, N'121440735', N'8-4', '2026-02-06', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(263, N'605270696', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(264, N'901370804', N'9-4', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(265, N'901370803', N'7-5', '2026-03-02', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(266, N'121330889', N'8-6', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(267, N'605430373', N'7-6', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(268, N'120220540', N'12-4', '2025-12-05', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(269, N'121310559', N'9-4', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(270, N'605260433', N'10-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(271, N'605100193', N'12-1', '2025-12-08', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(272, N'605400100', N'8-1', '2026-02-10', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(273, N'605350356', N'8-1', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(274, N'121600888', N'7-1', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(275, N'121070344', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(276, N'605210611', N'11-1', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(277, N'605190831', N'11-3', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(278, N'120520690', N'10-1', '2026-02-17', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(279, N'605340470', N'8-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(280, N'121900850', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(281, N'605450591', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(282, N'605360545', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(283, N'605440370', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(284, N'120780760', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(285, N'605280086', N'9-1', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(286, N'605150981', N'12-1', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(287, N'605140374', N'11-1', '2026-02-10', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(288, N'121530297', N'8-1', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(289, N'605110996', N'12-2', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(290, N'605350919', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(291, N'120530900', N'11-1', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(292, N'605320264', N'9-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(293, N'605350780', N'9-3', '2026-02-10', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(294, N'605060115', N'12-4', '2025-12-05', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(295, N'605390050', N'8-6', '2026-02-26', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(296, N'120370488', N'12-2', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(297, N'605250959', N'10-1', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(298, N'505020093', N'7-5', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(299, N'209500460', N'8-2', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(300, N'605110511', N'12-2', '2026-02-09', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(301, N'121930202', N'7-1', '2026-01-26', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(302, N'605360798', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(303, N'605130337', N'12-1', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(304, N'121540748', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(305, N'605450493', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(306, N'605380655', N'8-2', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(307, N'605240144', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(308, N'605300304', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(309, N'605150017', N'12-4', '2025-12-04', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(310, N'605350940', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(311, N'605240222', N'10-2', '2025-12-09', N'Regular', N'contabilidad', NULL, 0, 0, NULL),
(312, N'605440093', N'7-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(313, N'605200341', N'11-4', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(314, N'120230790', N'12-2', '2026-02-16', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(315, N'121250476', N'9-5', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(316, N'605180269', N'11-4', '2026-02-16', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(317, N'605360225', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(318, N'121270804', N'9-3', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(319, N'121620481', N'8-1', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(320, N'605370958', N'8-5', '2025-12-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(321, N'605260334', N'10-4', '2025-12-09', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(322, N'121260300', N'8-2', '2026-02-19', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(323, N'901250403', N'11-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(324, N'605330212', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(325, N'120410869', N'11-1', '2025-12-09', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(326, N'605350053', N'9-5', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(327, N'605180063', N'11-4', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(328, N'605270040', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(329, N'605450382', N'7-6', '2026-02-27', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(330, N'605330090', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(331, N'605290205', N'8-1', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(332, N'121810103', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(333, N'121370062', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(334, N'605190959', N'10-2', '2026-02-09', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(335, N'119850637', N'12-1', '2026-02-16', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(336, N'120670258', N'11-1', '2025-12-05', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(337, N'120380396', N'12-1', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(338, N'120380397', N'12-4', '2025-12-05', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(339, N'605150117', N'11-3', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(340, N'121760388', N'7-5', '2026-02-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(341, N'605230339', N'10-1', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(342, N'120820973', N'10-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(343, N'605050381', N'12-2', '2026-02-24', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(344, N'120360505', N'12-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(345, N'121690972', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(346, N'306080206', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(347, N'605310745', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(348, N'605160412', N'11-3', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(349, N'605180587', N'10-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(350, N'121650994', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(351, N'605280067', N'10-1', '2026-02-10', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(352, N'605360677', N'8-3', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(353, N'605410931', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(354, N'605280082', N'7-7', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(355, N'605380595', N'7-7', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(356, N'605310592', N'9-1', '2026-02-24', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(357, N'605290500', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(358, N'605250926', N'10-1', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(359, N'605560070', N'12-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(360, N'605260407', N'10-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(361, N'120750294', N'9-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(362, N'605410795', N'8-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(363, N'120960941', N'10-5', '2026-04-07', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(364, N'605390750', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(365, N'605330541', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(366, N'605310966', N'12-2', '2025-12-03', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(367, N'605350036', N'8-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(368, N'605120562', N'12-3', '2026-02-23', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(369, N'605390731', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(370, N'120310462', N'12-4', '2026-02-20', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(371, N'YR2023-06419', N'7-1', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(372, N'121900776', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(373, N'605410354', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(374, N'120630105', N'11-1', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(375, N'YR2024-27281', N'7-6', '2026-03-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(376, N'605390191', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(377, N'121850229', N'7-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(378, N'605220156', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(379, N'605330101', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(380, N'605260684', N'9-3', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(381, N'605460829', N'7-7', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(382, N'YR202208467', N'12-4', '2025-12-08', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(383, N'121030133', N'9-3', '2026-02-11', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(384, N'605270265', N'10-1', '2025-12-09', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(385, N'605450176', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(386, N'605270051', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(387, N'605440132', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(388, N'605210440', N'11-4', '2025-12-03', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(389, N'121460143', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(390, N'901300815', N'8-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(391, N'121080702', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(392, N'605410685', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(393, N'605220654', N'9-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(394, N'605390382', N'8-1', '2026-02-26', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(395, N'120590180', N'11-2', '2026-02-26', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(396, N'120700811', N'9-4', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(397, N'120700810', N'9-4', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(398, N'121650478', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(399, N'605370555', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(400, N'605350050', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(401, N'605320253', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(402, N'605450060', N'7-3', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(403, N'605210276', N'11-4', '2026-03-03', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(404, N'605270683', N'7-5', '2026-03-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(405, N'121210036', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(406, N'605150468', N'11-4', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(407, N'605430544', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(408, N'121760397', N'´7-5', '2026-05-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(409, N'605360246', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(410, N'605200529', N'11-4', '2026-02-24', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(411, N'605370930', N'8-1', '2026-02-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(412, N'121230903', N'9-4', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(413, N'605320037', N'7-1', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(414, N'605300877', N'9-1', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(415, N'605390957', N'7-1', '2026-02-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(416, N'605310235', N'9-5', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(417, N'605440915', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(418, N'605130332', N'12-4', '2025-12-05', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(419, N'605260347', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(420, N'605440836', N'7-1', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(421, N'605350923', N'9-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(422, N'120260836', N'12-2', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(423, N'605450396', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(424, N'120530718', N'11-1', '2025-12-03', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(425, N'121850923', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(426, N'121850921', N'12-4', '2025-12-09', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(427, N'121850922', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(428, N'605310751', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(429, N'120980292', N'10-4', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(430, N'605390658', N'8-1', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(431, N'´159101447510', N'10-4', '2026-02-17', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(432, N'605420370', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(433, N'121820716', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(434, N'306120981', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(435, N'121450578', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(436, N'159101505005', N'9-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(437, N'605160883', N'11-4', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(438, N'605250956', N'10-4', '2026-02-27', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(439, N'121070335', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(440, N'605410201', N'8-4', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(441, N'605310758', N'8-1', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(442, N'605220299', N'10-2', '2026-02-23', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(443, N'605300916', N'9-6', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(444, N'605230616', N'10-3', '2025-12-09', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(445, N'605410095', N'8-2', '2026-02-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(446, N'120770724', N'10-5', '2026-02-23', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(447, N'605240030', N'10-1', '2025-12-03', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(448, N'605380653', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(449, N'305810123', N'12-2', '2025-12-04', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(450, N'605320261', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(451, N'605370469', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(452, N'605300255', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(453, N'605270053', N'9-1', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(454, N'605160450', N'11-4', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(455, N'605430609', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(456, N'901450972', N'7-5', '2026-02-10', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(457, N'901450973', N'7-5', '2026-02-10', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(458, N'605440914', N'7-7', '2026-02-26', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(459, N'605270052', N'9-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(460, N'605180279', N'11-3', '2025-12-09', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(461, N'901220658', N'12-1', '2025-12-09', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(462, N'605230219', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(463, N'YR2022-24088', N'7-5', '2026-02-27', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(464, N'121120611', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(465, N'605410950', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(466, N'121540817', N'8-4', '2026-02-19', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(467, N'605350868', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(468, N'605340111', N'8-5', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(469, N'605460248', N'7-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(470, N'605280575', N'9-4', '2026-02-10', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(471, N'605230446', N'10-2', '2026-02-16', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(472, N'120890920', N'10-1', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(473, N'605240878', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(474, N'901240030', N'12-2', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(475, N'209460237', N'9-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(476, N'209240905', N'10-4', '2026-02-18', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(477, N'605320972', N'9-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(478, N'605350606', N'9-6', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(479, N'605330611', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(480, N'605320156', N'8-4', '2026-02-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(481, N'605400754', N'8-1', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(482, N'605460335', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(483, N'605340096', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(484, N'605260597', N'8-6', '2026-02-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(485, N'605080486', N'11-2', '2026-02-13', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(486, N'605200608', N'9-1', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(487, N'605290160', N'8-3', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(488, N'605380326', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(489, N'605300016', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(490, N'605260466', N'9-5', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(491, N'605130148', N'9-6', '2026-03-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(492, N'605350563', N'8-1', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(493, N'605360704', N'7-7', '2026-02-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(494, N'605350449', N'9-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(495, N'YR2022-34924', N'8-6', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(496, N'´159101446402', N'9-4', '2026-02-11', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(497, N'403060029', N'7-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(498, N'605350067', N'9-2', '2026-02-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(499, N'605210584', N'10-4', '2025-12-08', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(500, N'121360440', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(501, N'YR2026-67637', N'8-5', '2026-03-02', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(502, N'605210177', N'10-3', '2026-02-18', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(503, N'605570270', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(504, N'901210300', N'12-2', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(505, N'605460906', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(506, N'605460907', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(507, N'605370931', N'8-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(508, N'121480922', N'8-2', '2026-02-10', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(509, N'605370206', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(510, N'159101335926', N'10-2', '2026-06-09', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(511, N'605350900', N'7-2', '2026-03-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(512, N'605300494', N'9-6', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(513, N'605240130', N'9-4', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(514, N'605340469', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(515, N'120150982', N'12-4', '2025-12-05', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(516, N'121500872', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(517, N'120600844', N'11-4', '2025-12-08', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(518, N'605430712', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(519, N'605150746', N'12-2', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(520, N'209650291', N'7-4', '2026-03-02', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(521, N'605150751', N'12-4', '2025-12-08', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(522, N'605130336', N'12-2', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(523, N'605420849', N'7-5', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(524, N'605440165', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(525, N'605370559', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(526, N'121400038', N'8-6', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(527, N'605320713', N'7-6', '2026-02-11', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(528, N'´159101422215', N'7-6', '2026-03-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(529, N'605110124', N'12-3', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(530, N'124010122', N'8-1', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(531, N'306060273', N'7-7', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(532, N'403050151', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(533, N'121000206', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(534, N'605230299', N'10-1', '2026-02-24', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(535, N'605300571', N'9-3', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(536, N'121090689', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(537, N'121600268', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(538, N'605200803', N'11-1', '2026-02-10', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(539, N'605400461', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(540, N'121540337', N'8-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(541, N'605340237', N'7-1', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(542, N'120470060', N'11-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(543, N'605610883', N'10-3', '2026-02-18', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(544, N'605390338', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(545, N'121430339', N'8-1', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(546, N'209190909', N'11-1', '2025-12-09', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(547, N'121270380', N'9-1', '2026-02-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(548, N'605120024', N'12-2', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(549, N'121780911', N'7-1', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(550, N'605280053', N'9-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(551, N'605160368', N'11-1', '2025-12-05', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(552, N'605350991', N'7-1', '2026-02-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(553, N'305890261', N'11-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(554, N'208980220', N'12-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(555, N'121470877', N'8-1', '2026-02-12', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(556, N'121370771', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(557, N'120870306', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(558, N'120600293', N'11-2', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(559, N'605120103', N'12-3', '2025-12-08', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(560, N'504890317', N'10-3', '2026-02-10', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(561, N'605120717', N'12-3', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(562, N'605450494', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(563, N'605150047', N'12-4', '2026-02-20', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(564, N'209000485', N'12-1', '2025-12-08', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(565, N'209510973', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(566, N'605180262', N'11-2', '2026-02-09', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(567, N'120490940', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(568, N'605360037', N'8-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(569, N'605430473', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(570, N'120340058', N'12-3', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(571, N'121740716', N'7-2', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(572, N'120210584', N'12-2', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(573, N'120210585', N'12-4', '2025-12-05', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(574, N'605340147', N'8-6', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(575, N'209340627', N'10-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(576, N'605410952', N'7-5', '2026-05-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(577, N'605340512', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(578, N'605440567', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(579, N'121000785', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(580, N'605260471', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(581, N'605360899', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(582, N'605430924', N'7-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(583, N'605430129', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(584, N'121440095', N'8-6', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(585, N'120230671', N'12-4', '2026-02-04', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(586, N'605390846', N'8-1', '2026-02-24', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(587, N'305850706', N'11-2', '2025-12-05', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(588, N'209020654', N'12-3', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(589, N'209400870', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(590, N'121030537', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(591, N'605360016', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(592, N'YR2026-66807', N'7-6', '2026-01-27', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(593, N'605350074', N'7-6', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(594, N'121500550', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(595, N'605460202', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(596, N'901460512', N'9-4', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(597, N'605360566', N'7-1', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(598, N'605390667', N'7-1', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(599, N'120890065', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(600, N'605130446', N'12-2', '2025-12-04', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(601, N'605310076', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(602, N'605310934', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(603, N'605390337', N'8-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(604, N'605140899', N'11-2', '2025-12-05', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(605, N'120750135', N'10-5', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(606, N'605260469', N'9-3', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(607, N'605450583', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(608, N'604960349', N'12-4', '2025-12-09', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(609, N'605320152', N'7-1', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(610, N'605160369', N'11-4', '2025-12-09', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(611, N'605360522', N'8-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(612, N'605160016', N'12-3', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(613, N'121630231', N'8-5', '2026-02-18', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(614, N'121450568', N'8-5', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(615, N'120840429', N'10-2', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(616, N'703680257', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(617, N'605120099', N'12-2', '2025-12-05', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(618, N'605150207', N'10-4', '2026-02-12', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(619, N'605320529', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(620, N'120140957', N'12-3', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(621, N'605200448', N'11-4', '2026-02-18', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(622, N'605440529', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(623, N'605450449', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(624, N'120200486', N'12-4', '2025-12-05', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(625, N'120480914', N'11-2', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(626, N'121060478', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(627, N'605300570', N'9-5', '2026-02-18', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(628, N'YR2026-66848', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(629, N'120430767', N'10-2', '2026-02-10', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(630, N'120220197', N'12-4', '2025-12-08', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(631, N'121590994', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(632, N'120970822', N'10-2', '2025-12-03', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(633, N'605300707', N'9-6', '2026-02-18', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(634, N'120740444', N'10-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(635, N'605450790', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(636, N'121630125', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(637, N'605390904', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(638, N'605450517', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(639, N'121050037', N'9-1', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(640, N'605390833', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(641, N'605350523', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(642, N'605320281', N'9-2', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(643, N'605420643', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(644, N'605300736', N'9-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(645, N'121630773', N'8-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(646, N'119880167', N'12-2', '2026-02-24', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(647, N'209500624', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(648, N'209190706', N'11-4', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(649, N'605200450', N'10-2', '2026-02-10', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(650, N'605410105', N'8-1', '2026-02-19', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(651, N'605120719', N'12-3', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(652, N'605230266', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(653, N'120280602', N'11-1', '2026-02-09', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(654, N'605160317', N'11-1', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(655, N'121760511', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(656, N'605170153', N'10-1', '2026-02-23', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(657, N'605190626', N'9-3', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(658, N'901350879', N'7-5', '2026-02-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(659, N'605330634', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(660, N'120590372', N'10-2', '2026-02-19', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(661, N'120000788', N'12-2', '2026-02-17', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(662, N'605080161', N'12-3', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(663, N'605230861', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(664, N'605440016', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(665, N'605280449', N'9-5', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(666, N'605380306', N'8-1', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(667, N'121160656', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(668, N'121030547', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(669, N'605400431', N'8-1', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(670, N'605380064', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(671, N'605330754', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(672, N'605340232', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(673, N'605110513', N'12-4', '2025-12-09', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(674, N'605270718', N'9-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(675, N'´159101446616', N'7-7', '2026-02-27', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(676, N'605310234', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(677, N'605320283', N'7-6', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(678, N'605390199', N'8-3', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(679, N'120260394', N'12-1', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(680, N'305700900', N'12-3', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(681, N'121680993', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(682, N'121160338', N'9-6', '2026-02-19', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(683, N'605450798', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(684, N'605130806', N'12-2', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(685, N'121770589', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(686, N'605450445', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(687, N'121090707', N'9-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(688, N'605090664', N'12-3', '2025-12-08', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(689, N'605460832', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(690, N'120740423', N'9-4', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(691, N'605160012', N'12-3', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(692, N'403010543', N'7-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(693, N'121260304', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(694, N'605200305', N'11-2', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(695, N'605200519', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(696, N'605410453', N'8-6', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(697, N'120870651', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(698, N'605180156', N'11-2', '2025-12-05', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(699, N'402880818', N'´10-1', '2026-05-27', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(700, N'605400122', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(701, N'605390334', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(702, N'605450357', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(703, N'209000207', N'12-2', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(704, N'209640446', N'8-3', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(705, N'306130419', N'7-2', '2026-04-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(706, N'605120965', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(707, N'605300992', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(708, N'605350073', N'8-3', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(709, N'121490044', N'8-6', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(710, N'121290406', N'8-1', '2026-02-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(711, N'121590663', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(712, N'121210688', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(713, N'605220884', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(714, N'209540485', N'9-1', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(715, N'121350218', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(716, N'605110272', N'12-4', '2026-02-11', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(717, N'605420396', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(718, N'605170158', N'11-2', '2025-12-05', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(719, N'605390378', N'7-7', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(720, N'703740241', N'8-6', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(721, N'120980291', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(722, N'120330116', N'12-1', '2025-12-05', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(723, N'605200376', N'11-3', '2025-12-04', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(724, N'605360674', N'8-5', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(725, N'605370335', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(726, N'605440863', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(727, N'605290480', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(728, N'121050092', N'9-6', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(729, N'605400251', N'8-1', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(730, N'605290479', N'9-3', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(731, N'121450752', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(732, N'121450751', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(733, N'121810967', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(734, N'605350700', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(735, N'605420250', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(736, N'605180584', N'11-2', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(737, N'120960612', N'10-2', '2025-12-09', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(738, N'605450789', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(739, N'121410654', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(740, N'306090498', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(741, N'120450723', N'9-6', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(742, N'605410651', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(743, N'605280506', N'9-4', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(744, N'120960594', N'10-3', '2025-12-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(745, N'120290248', N'12-3', '2026-02-12', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(746, N'605400395', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(747, N'605400311', N'8-6', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(748, N'605320999', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(749, N'121520796', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(750, N'605300476', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(751, N'605290158', N'9-4', '2026-02-24', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(752, N'121470832', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(753, N'605450294', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(754, N'605380005', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(755, N'605250573', N'8-4', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(756, N'121540769', N'7-7', '2026-02-18', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(757, N'605230220', N'8-6', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(758, N'121450601', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(759, N'120840058', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(760, N'605070960', N'11-2', '2025-12-08', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(761, N'604960611', N'12-4', '2026-02-17', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(762, N'605370928', N'7-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(763, N'605460575', N'7-4', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(764, N'605370794', N'8-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(765, N'605310608', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(766, N'605390194', N'8-1', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(767, N'605230409', N'9-4', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(768, N'605350282', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(769, N'120670171', N'10-2', '2026-02-23', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(770, N'605190501', N'10-2', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(771, N'120530259', N'11-2', '2025-12-05', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(772, N'605340667', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(773, N'121620910', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(774, N'604980512', N'12-4', '2025-12-08', N'Regular', N'Agroindustria Alimentaria con Tecnología Agrícola', NULL, 0, 0, NULL),
(775, N'209630622', N'7-3', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(776, N'120960915', N'10-4', '2025-12-08', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(777, N'120680996', N'11-4', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(778, N'121370741', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(779, N'605370961', N'8-4', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(780, N'121000629', N'10-3', '2026-02-04', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(781, N'605210222', N'11-4', '2026-02-04', N'Regular', N'Turismo Rural', NULL, 0, 0, NULL),
(782, N'605110295', N'12-2', '2026-02-11', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(783, N'605170595', N'10-3', '2025-12-09', N'Regular', N'Procesos productivos e inspección en la Industria Alimentaria', NULL, 0, 0, NULL),
(784, N'120830331', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(785, N'605370164', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(786, N'605290504', N'9-6', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(787, N'605450586', N'7-7', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(788, N'605350078', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(789, N'605260405', N'10-1', '2025-12-04', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(790, N'605390906', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(791, N'120780598', N'10-1', '2026-04-07', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(792, N'605350874', N'9-2', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(793, N'605420183', N'7-2', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(794, N'605350863', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(795, N'605440019', N'7-1', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(796, N'´159101469518', N'10-1', '2025-12-08', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(797, N'605330308', N'9-5', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(798, N'605460348', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(799, N'121620602', N'8-3', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(800, N'120160992', N'12-3', '2025-12-05', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(801, N'306130129', N'7-6', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(802, N'605310520', N'9-1', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(803, N'605220972', N'10-2', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(804, N'605350104', N'8-6', '2026-02-13', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(805, N'605370354', N'8-5', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(806, N'121800139', N'7-1', '2026-02-16', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(807, N'605160952', N'11-2', '2026-02-11', N'Regular', N'Contabilidad y Finanzas', NULL, 0, 0, NULL),
(808, N'121480215', N'7-1', '2026-02-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(809, N'605220787', N'9-5', '2026-02-19', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(810, N'120270552', N'12-3', '2025-12-03', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(811, N'605150744', N'12-1', '2025-12-04', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(812, N'605320535', N'9-3', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(813, N'605430221', N'2025-04-07', '2025-12-08', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(814, N'121130740', N'2026-06-09', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(815, N'605400422', N'2025-01-08', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(816, N'605380649', N'2026-05-07', '2026-02-17', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(817, N'159101484305', N'2026-02-10', '2026-02-25', N'Regular', N'Organización de empresas de Turismo Rural', NULL, 0, 0, NULL),
(818, N'605080344', N'2026-03-12', '2026-02-25', N'Regular', N'Producción Agrícola y Pecuaria', NULL, 0, 0, NULL),
(819, N'605450904', N'2026-03-07', '2026-02-27', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(820, N'209550103', N'2026-06-08', '2026-02-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(821, N'605440902', N'2026-06-07', '2026-02-25', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(822, N'605250301', N'2026-06-09', '2026-02-11', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(823, N'605310236', N'7-6', '2026-02-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(824, N'209690296', N'2026-03-08', '2026-04-09', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(825, N'605280046', N'2026-01-10', '2025-12-04', N'Regular', N'Contabilidad', NULL, 0, 0, NULL),
(826, N'605150189', N'9-1', '2026-03-06', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(827, N'703580442', N'9-6', '2026-03-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(828, N'605280177', N'8-2', '2025-12-03', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(829, N'121190969', N'7-1', '2026-02-19', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(830, N'605300386', N'7-1', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(831, N'120840457', N'8-6', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(832, N'605290831', N'9-6', '2025-12-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(833, N'605290830', N'8-5', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(834, N'121140736', N'9-5', '2025-12-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(835, N'605340078', N'8-3', '2026-02-18', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(836, N'605400757', N'8-1', '2026-03-05', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(837, N'121640048', N'8-1', '2026-02-04', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(838, N'605370959', N'7-7', '2026-02-23', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(839, N'121030681', N'7-1', '2026-02-26', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL),
(840, N'605310589', N'7-5', '2026-02-20', N'Regular', N'Sin especialidad', NULL, 0, 0, NULL);


DECLARE @Resultados TABLE (
    Fila INT NOT NULL,
    Cedula NVARCHAR(50) NULL,
    Seccion NVARCHAR(100) NULL,
    Estudiante NVARCHAR(250) NULL,
    Grupo NVARCHAR(100) NULL,
    MatriculaId INT NULL,
    Estado NVARCHAR(20) NOT NULL,
    Motivo NVARCHAR(500) NOT NULL
);

DECLARE @TieneEspecialidadId BIT = CASE WHEN COL_LENGTH('dbo.MatriculaDetalle', 'EspecialidadId') IS NULL THEN 0 ELSE 1 END;

DECLARE 
    @Fila INT,
    @Cedula NVARCHAR(50),
    @SeccionRaw NVARCHAR(100),
    @FechaMatricula DATE,
    @TipoMatricula NVARCHAR(100),
    @EspecialidadRaw NVARCHAR(200),
    @Observacion NVARCHAR(500),
    @EsRepitente BIT,
    @PermiteExcepcionProgresion BIT,
    @JustificacionExcepcion NVARCHAR(500);

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
SELECT Fila, Cedula, SeccionRaw, FechaMatricula, TipoMatricula, EspecialidadRaw, Observacion, EsRepitente, PermiteExcepcionProgresion, JustificacionExcepcion
FROM @Source
ORDER BY Fila;

OPEN cur;
FETCH NEXT FROM cur INTO @Fila, @Cedula, @SeccionRaw, @FechaMatricula, @TipoMatricula, @EspecialidadRaw, @Observacion, @EsRepitente, @PermiteExcepcionProgresion, @JustificacionExcepcion;

WHILE @@FETCH_STATUS = 0
BEGIN
    BEGIN TRY
        DECLARE @CedulaLimpia NVARCHAR(50) = REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(@Cedula, N''))), N' ', N''), N'-', N'');
        DECLARE @SeccionNormalizada NVARCHAR(100) = LTRIM(RTRIM(ISNULL(@SeccionRaw, N'')));
        DECLARE @EspecialidadNormalizada NVARCHAR(200) = LTRIM(RTRIM(ISNULL(@EspecialidadRaw, N'')));
        DECLARE @EstudianteId INT = NULL;
        DECLARE @EstudianteNombre NVARCHAR(250) = NULL;
        DECLARE @GrupoId INT = NULL;
        DECLARE @GrupoNombre NVARCHAR(100) = NULL;
        DECLARE @GrupoNivelAcademico TINYINT = NULL;
        DECLARE @GrupoEspecialidad NVARCHAR(200) = NULL;
        DECLARE @EspecialidadDetalle NVARCHAR(200) = NULL;
        DECLARE @EspecialidadId INT = NULL;
        DECLARE @MatriculaId INT = NULL;
        DECLARE @EstadoResultado NVARCHAR(20) = NULL;
        DECLARE @MotivoResultado NVARCHAR(500) = NULL;

        IF LEFT(@SeccionNormalizada, 1) IN (N'''', N'?')
            SET @SeccionNormalizada = LTRIM(RTRIM(SUBSTRING(@SeccionNormalizada, 2, 100)));

        IF TRY_CONVERT(DATE, @SeccionNormalizada) IS NOT NULL
        BEGIN
            INSERT INTO @Resultados (Fila, Cedula, Seccion, Estado, Motivo)
            VALUES (@Fila, @Cedula, @SeccionNormalizada, N'ERROR', N'La columna secci?n trae una fecha y no un grupo v?lido. Revis? esa fila en el Excel.');
            GOTO NextRow;
        END;

        IF @CedulaLimpia = N'' OR @SeccionNormalizada = N''
        BEGIN
            INSERT INTO @Resultados (Fila, Cedula, Seccion, Estado, Motivo)
            VALUES (@Fila, @Cedula, @SeccionNormalizada, N'ERROR', N'C?dula y secci?n son obligatorias.');
            GOTO NextRow;
        END;

        SELECT TOP 1
            @EstudianteId = e.EstudianteId,
            @EstudianteNombre = LTRIM(RTRIM(CONCAT(ISNULL(e.PrimerApellido, N''), N' ', ISNULL(e.SegundoApellido, N''), N' ', ISNULL(e.Nombre, N''))))
        FROM dbo.Estudiante e
        WHERE e.InstitucionId = @InstitucionId
          AND REPLACE(REPLACE(LTRIM(RTRIM(e.Identificacion)), N' ', N''), N'-', N'') = @CedulaLimpia
        ORDER BY e.Activo DESC, e.EstudianteId DESC;

        IF @EstudianteId IS NULL
        BEGIN
            INSERT INTO @Resultados (Fila, Cedula, Seccion, Estado, Motivo)
            VALUES (@Fila, @Cedula, @SeccionNormalizada, N'ERROR', N'No se encontr? el estudiante en la instituci?n indicada.');
            GOTO NextRow;
        END;

        SELECT TOP 1
            @GrupoId = g.GrupoId,
            @GrupoNombre = g.Nombre,
            @GrupoNivelAcademico = g.NivelAcademico,
            @GrupoEspecialidad = g.Especialidad
        FROM dbo.Grupo g
        WHERE g.InstitucionId = @InstitucionId
          AND g.AnioLectivoId = @AnioLectivoId
          AND g.Activo = 1
          AND (
                UPPER(LTRIM(RTRIM(g.Nombre))) = UPPER(@SeccionNormalizada)
             OR UPPER(REPLACE(LTRIM(RTRIM(g.Nombre)), N' ', N'')) = UPPER(REPLACE(@SeccionNormalizada, N' ', N''))
          )
        ORDER BY g.GrupoId;

        IF @GrupoId IS NULL
        BEGIN
            INSERT INTO @Resultados (Fila, Cedula, Seccion, Estudiante, Estado, Motivo)
            VALUES (@Fila, @Cedula, @SeccionNormalizada, @EstudianteNombre, N'ERROR', N'No existe una secci?n activa con ese nombre en el a?o lectivo indicado.');
            GOTO NextRow;
        END;

        IF @EspecialidadNormalizada IN (N'', N'Sin especialidad', N'sin especialidad', N'NINGUNA', N'Ninguna', N'NO APLICA', N'No aplica')
            SET @EspecialidadNormalizada = NULL;
        ELSE IF UPPER(@EspecialidadNormalizada) = N'CONTABILIDAD'
            SET @EspecialidadNormalizada = N'Contabilidad';

        SET @EspecialidadDetalle = COALESCE(@EspecialidadNormalizada, NULLIF(LTRIM(RTRIM(@GrupoEspecialidad)), N''));

        IF @EspecialidadDetalle IS NOT NULL
        BEGIN
            SELECT TOP 1 @EspecialidadId = EspecialidadId
            FROM dbo.Especialidad
            WHERE InstitucionId = @InstitucionId
              AND Activo = 1
              AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@EspecialidadDetalle)))
            ORDER BY EspecialidadId;
        END;

        BEGIN TRAN;

        SELECT TOP 1 @MatriculaId = m.MatriculaId
        FROM dbo.Matricula m
        WHERE m.EstudianteId = @EstudianteId
          AND m.AnioLectivoId = @AnioLectivoId
          AND m.Estado = N'Activa'
        ORDER BY m.MatriculaId DESC;

        IF @MatriculaId IS NOT NULL
        BEGIN
            UPDATE dbo.Matricula
            SET GrupoId = @GrupoId,
                FechaMatricula = ISNULL(@FechaMatricula, FechaMatricula),
                Observacion = @Observacion,
                UsuarioActualizaId = @UsuarioId,
                Estado = N'Activa',
                UpdatedAt = SYSDATETIME()
            WHERE MatriculaId = @MatriculaId;

            SET @EstadoResultado = N'ACTUALIZADO';
            SET @MotivoResultado = N'Matr?cula activa actualizada desde el Excel.';
        END
        ELSE
        BEGIN
            SELECT TOP 1 @MatriculaId = m.MatriculaId
            FROM dbo.Matricula m
            WHERE m.EstudianteId = @EstudianteId
              AND m.GrupoId = @GrupoId
              AND m.AnioLectivoId = @AnioLectivoId
            ORDER BY m.MatriculaId DESC;

            IF @MatriculaId IS NOT NULL
            BEGIN
                UPDATE dbo.Matricula
                SET Estado = N'Activa',
                    FechaMatricula = ISNULL(@FechaMatricula, FechaMatricula),
                    Observacion = @Observacion,
                    UsuarioActualizaId = @UsuarioId,
                    UpdatedAt = SYSDATETIME()
                WHERE MatriculaId = @MatriculaId;

                SET @EstadoResultado = N'REACTIVADO';
                SET @MotivoResultado = N'Matr?cula previa reactivada desde el Excel.';
            END
            ELSE
            BEGIN
                INSERT INTO dbo.Matricula
                (
                    EstudianteId,
                    GrupoId,
                    AnioLectivoId,
                    Estado,
                    FechaMatricula,
                    Observacion,
                    UsuarioRegistroId,
                    CreatedAt
                )
                VALUES
                (
                    @EstudianteId,
                    @GrupoId,
                    @AnioLectivoId,
                    N'Activa',
                    ISNULL(@FechaMatricula, CAST(GETDATE() AS DATE)),
                    @Observacion,
                    @UsuarioId,
                    SYSDATETIME()
                );

                SET @MatriculaId = SCOPE_IDENTITY();
                SET @EstadoResultado = N'CREADO';
                SET @MotivoResultado = N'Matr?cula creada correctamente.';
            END
        END;

        IF EXISTS (SELECT 1 FROM dbo.MatriculaDetalle WHERE MatriculaId = @MatriculaId)
        BEGIN
            IF @TieneEspecialidadId = 1
            BEGIN
                UPDATE dbo.MatriculaDetalle
                SET TipoMatricula = COALESCE(@TipoMatricula, N'Regular'),
                    NivelAcademico = @GrupoNivelAcademico,
                    EspecialidadId = @EspecialidadId,
                    Especialidad = @EspecialidadDetalle,
                    SeccionTexto = @GrupoNombre,
                    EsRepitente = @EsRepitente,
                    PermiteExcepcionProgresion = @PermiteExcepcionProgresion,
                    JustificacionExcepcion = @JustificacionExcepcion,
                    Observaciones = @Observacion,
                    UpdatedAt = SYSDATETIME()
                WHERE MatriculaId = @MatriculaId;
            END
            ELSE
            BEGIN
                UPDATE dbo.MatriculaDetalle
                SET TipoMatricula = COALESCE(@TipoMatricula, N'Regular'),
                    NivelAcademico = @GrupoNivelAcademico,
                    Especialidad = @EspecialidadDetalle,
                    SeccionTexto = @GrupoNombre,
                    EsRepitente = @EsRepitente,
                    PermiteExcepcionProgresion = @PermiteExcepcionProgresion,
                    JustificacionExcepcion = @JustificacionExcepcion,
                    Observaciones = @Observacion,
                    UpdatedAt = SYSDATETIME()
                WHERE MatriculaId = @MatriculaId;
            END
        END
        ELSE
        BEGIN
            IF @TieneEspecialidadId = 1
            BEGIN
                INSERT INTO dbo.MatriculaDetalle
                (
                    MatriculaId,
                    TipoMatricula,
                    NivelAcademico,
                    EspecialidadId,
                    Especialidad,
                    SeccionTexto,
                    RutaTransporte,
                    EsRepitente,
                    PermiteExcepcionProgresion,
                    JustificacionExcepcion,
                    CorreoEnvioBoleta,
                    Observaciones,
                    CreatedAt
                )
                VALUES
                (
                    @MatriculaId,
                    COALESCE(@TipoMatricula, N'Regular'),
                    @GrupoNivelAcademico,
                    @EspecialidadId,
                    @EspecialidadDetalle,
                    @GrupoNombre,
                    NULL,
                    @EsRepitente,
                    @PermiteExcepcionProgresion,
                    @JustificacionExcepcion,
                    NULL,
                    @Observacion,
                    SYSDATETIME()
                );
            END
            ELSE
            BEGIN
                INSERT INTO dbo.MatriculaDetalle
                (
                    MatriculaId,
                    TipoMatricula,
                    NivelAcademico,
                    Especialidad,
                    SeccionTexto,
                    RutaTransporte,
                    EsRepitente,
                    PermiteExcepcionProgresion,
                    JustificacionExcepcion,
                    CorreoEnvioBoleta,
                    Observaciones,
                    CreatedAt
                )
                VALUES
                (
                    @MatriculaId,
                    COALESCE(@TipoMatricula, N'Regular'),
                    @GrupoNivelAcademico,
                    @EspecialidadDetalle,
                    @GrupoNombre,
                    NULL,
                    @EsRepitente,
                    @PermiteExcepcionProgresion,
                    @JustificacionExcepcion,
                    NULL,
                    @Observacion,
                    SYSDATETIME()
                );
            END
        END;

        COMMIT TRAN;

        INSERT INTO @Resultados (Fila, Cedula, Seccion, Estudiante, Grupo, MatriculaId, Estado, Motivo)
        VALUES (@Fila, @Cedula, @SeccionNormalizada, @EstudianteNombre, @GrupoNombre, @MatriculaId, @EstadoResultado, @MotivoResultado);
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRAN;
        INSERT INTO @Resultados (Fila, Cedula, Seccion, Estado, Motivo)
        VALUES (
            @Fila,
            @Cedula,
            @SeccionRaw,
            N'ERROR',
            CONCAT(N'Error SQL: ', ERROR_MESSAGE())
        );
    END CATCH

    NextRow:
    FETCH NEXT FROM cur INTO @Fila, @Cedula, @SeccionRaw, @FechaMatricula, @TipoMatricula, @EspecialidadRaw, @Observacion, @EsRepitente, @PermiteExcepcionProgresion, @JustificacionExcepcion;
END;

CLOSE cur;
DEALLOCATE cur;

SELECT 
    COUNT(1) AS TotalRegistros,
    SUM(CASE WHEN Estado = N'CREADO' THEN 1 ELSE 0 END) AS Creados,
    SUM(CASE WHEN Estado = N'ACTUALIZADO' THEN 1 ELSE 0 END) AS Actualizados,
    SUM(CASE WHEN Estado = N'REACTIVADO' THEN 1 ELSE 0 END) AS Reactivados,
    SUM(CASE WHEN Estado = N'OMITIDO' THEN 1 ELSE 0 END) AS Omitidos,
    SUM(CASE WHEN Estado = N'ERROR' THEN 1 ELSE 0 END) AS Errores
FROM @Resultados;

SELECT *
FROM @Resultados
WHERE Estado = N'ERROR'
ORDER BY Fila;

SELECT *
FROM @Resultados
ORDER BY Fila;
