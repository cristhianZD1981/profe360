SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Cambios TABLE (
    Identificacion NVARCHAR(50) NOT NULL,
    TipoEstudianteDescripcion NVARCHAR(150) NOT NULL
);

INSERT INTO @Cambios (Identificacion, TipoEstudianteDescripcion) VALUES
    (N'159101479912', N'Plan Nacional'),
    (N'YR2022-24284', N'Plan Nacional'),
    (N'6053220259', N'Plan Nacional'),
    (N'703470756', N'Plan Nacional'),
    (N'605410355', N'Plan Nacional'),
    (N'120170300', N'Plan Nacional'),
    (N'605060175', N'Plan Nacional'),
    (N'121210448', N'Plan Nacional'),
    (N'605370673', N'Plan Nacional'),
    (N'120410118', N'Plan Nacional'),
    (N'605260461', N'Plan Nacional'),
    (N'605330877', N'Plan Nacional'),
    (N'605360521', N'Plan Nacional'),
    (N'40870013', N'Plan Nacional'),
    (N'605230593', N'Plan Nacional'),
    (N'120150115', N'Plan Nacional'),
    (N'119560489', N'Plan Nacional'),
    (N'605100804', N'Plan Nacional'),
    (N'121080396', N'Plan Nacional'),
    (N'121190031', N'Plan Nacional'),
    (N'121810122', N'Plan Nacional'),
    (N'605140846', N'Plan Nacional'),
    (N'119840208', N'Plan Nacional'),
    (N'605210615', N'Plan Nacional'),
    (N'605220201', N'Plan Nacional'),
    (N'121860207', N'Plan Nacional'),
    (N'605400451', N'Plan Nacional'),
    (N'120650241', N'Plan Nacional'),
    (N'605390342', N'Plan Nacional'),
    (N'605420272', N'Plan Nacional'),
    (N'605740604', N'Plan Nacional'),
    (N'605620753', N'Plan Nacional'),
    (N'605210591', N'Plan Nacional'),
    (N'605370962', N'Plan Nacional'),
    (N'605400254', N'Plan Nacional'),
    (N'605150037', N'Plan Nacional'),
    (N'605350072', N'Plan Nacional'),
    (N'605280509', N'Plan Nacional'),
    (N'605410375', N'Plan Nacional'),
    (N'605460801', N'Plan Nacional'),
    (N'605760762', N'Plan Nacional'),
    (N'120480338', N'Plan Nacional'),
    (N'605090990', N'Plan Nacional'),
    (N'605170001', N'Plan Nacional'),
    (N'605190956', N'Plan Nacional'),
    (N'YR2022-29821', N'Plan Nacional'),
    (N'120770012', N'Plan Nacional'),
    (N'605150104', N'Plan Nacional'),
    (N'605180992', N'Plan Nacional'),
    (N'306000420', N'Plan Nacional'),
    (N'605240960', N'Plan Nacional'),
    (N'605390427', N'Plan Nacional'),
    (N'605230106', N'Plan Nacional'),
    (N'605430469', N'Plan Nacional'),
    (N'605230222', N'Plan Nacional'),
    (N'605260462', N'Plan Nacional'),
    (N'605290204', N'Plan Nacional'),
    (N'605140419', N'Plan Nacional'),
    (N'605040668', N'Plan Nacional'),
    (N'306030805', N'Plan Nacional'),
    (N'605340239', N'Plan Nacional'),
    (N'159101483625', N'Plan Nacional'),
    (N'605340468', N'Plan Nacional'),
    (N'12741656', N'Plan Nacional'),
    (N'605320316', N'Plan Nacional'),
    (N'605160076', N'Plan Nacional'),
    (N'120990104', N'Plan Nacional'),
    (N'605380927', N'Plan Nacional'),
    (N'209170879', N'Plan Nacional'),
    (N'605190136', N'Plan Nacional'),
    (N'605290947', N'Plan Nacional'),
    (N'12741657', N'Plan Nacional'),
    (N'402500837', N'Plan Nacional'),
    (N'YR2023-08820', N'Plan Nacional'),
    (N'605460385', N'Plan Nacional'),
    (N'605430475', N'Plan Nacional'),
    (N'121500843', N'Plan Nacional'),
    (N'120340294', N'Plan Nacional'),
    (N'605330638', N'Regular'),
    (N'´159101488202', N'Regular'),
    (N'´159101420213', N'Regular'),
    (N'´159101420320', N'Regular'),
    (N'605220784', N'Regular'),
    (N'605560009', N'Regular'),
    (N'121580832', N'Regular'),
    (N'605300784', N'Regular'),
    (N'605270047', N'Regular'),
    (N'YR2023-00526', N'Regular'),
    (N'605350034', N'Regular'),
    (N'306070539', N'Regular'),
    (N'120410944', N'Regular'),
    (N'605090371', N'Regular'),
    (N'605330796', N'Regular'),
    (N'605250185', N'Regular'),
    (N'306100194', N'Regular'),
    (N'605460517', N'Regular'),
    (N'121330750', N'Regular'),
    (N'605320475', N'Regular'),
    (N'605420995', N'Regular'),
    (N'209420132', N'Regular'),
    (N'120960460', N'Regular'),
    (N'605320280', N'Regular'),
    (N'605460376', N'Regular'),
    (N'120150140', N'Regular'),
    (N'605200518', N'Regular'),
    (N'120150912', N'Regular'),
    (N'703730106', N'Regular'),
    (N'120650884', N'Regular'),
    (N'121330752', N'Regular'),
    (N'121620521', N'Regular'),
    (N'121400504', N'Regular'),
    (N'120370347', N'Regular'),
    (N'121030824', N'Regular'),
    (N'605170950', N'Regular'),
    (N'120500262', N'Regular'),
    (N'605320986', N'Regular'),
    (N'120430304', N'Regular'),
    (N'703580284', N'Regular'),
    (N'121070076', N'Regular'),
    (N'504790248', N'Regular'),
    (N'120180844', N'Regular'),
    (N'605350989', N'Regular'),
    (N'605110130', N'Regular'),
    (N'121010837', N'Regular'),
    (N'´155851527534', N'Regular'),
    (N'605210879', N'Regular'),
    (N'121330724', N'Regular'),
    (N'120700468', N'Regular'),
    (N'605080953', N'Regular'),
    (N'121210606', N'Regular'),
    (N'121320541', N'Regular'),
    (N'120660336', N'Regular'),
    (N'605400856', N'Regular'),
    (N'605400679', N'Regular'),
    (N'121320210', N'Regular'),
    (N'605260493', N'Regular'),
    (N'605140500', N'Regular'),
    (N'605360406', N'Regular'),
    (N'605100805', N'Regular'),
    (N'120470353', N'Regular'),
    (N'120910578', N'Regular'),
    (N'120700994', N'Regular'),
    (N'120710360', N'Regular'),
    (N'121540833', N'Regular'),
    (N'121080383', N'Regular'),
    (N'605160460', N'Regular'),
    (N'605390384', N'Regular'),
    (N'605370748', N'Regular'),
    (N'605280212', N'Regular'),
    (N'605470356', N'Regular'),
    (N'120870488', N'Regular'),
    (N'605370844', N'Regular'),
    (N'605150569', N'Regular'),
    (N'121330808', N'Regular'),
    (N'605710233', N'Regular'),
    (N'121390440', N'Regular'),
    (N'120910783', N'Regular'),
    (N'121540336', N'Regular'),
    (N'605250878', N'Regular'),
    (N'605320477', N'Regular'),
    (N'605340315', N'Regular'),
    (N'605350347', N'Regular'),
    (N'605190718', N'Regular'),
    (N'605270985', N'Regular'),
    (N'605280367', N'Regular'),
    (N'605430130', N'Regular'),
    (N'605230221', N'Regular'),
    (N'605330094', N'Regular'),
    (N'120370564', N'Regular'),
    (N'120430817', N'Regular'),
    (N'605310238', N'Regular'),
    (N'120130261', N'Regular'),
    (N'605440829', N'Regular'),
    (N'605410352', N'Regular'),
    (N'121270094', N'Regular'),
    (N'605440590', N'Regular'),
    (N'121340879', N'Regular'),
    (N'605320531', N'Regular'),
    (N'605250154', N'Regular'),
    (N'605240178', N'Regular'),
    (N'´159101416323', N'Regular'),
    (N'605290200', N'Regular'),
    (N'305980180', N'Regular'),
    (N'605180612', N'Regular'),
    (N'121090047', N'Regular'),
    (N'605140420', N'Regular'),
    (N'605440833', N'Regular'),
    (N'121610402', N'Regular'),
    (N'121220693', N'Regular'),
    (N'605410373', N'Regular'),
    (N'605350548', N'Regular'),
    (N'605140824', N'Regular'),
    (N'605140945', N'Regular'),
    (N'605270654', N'Regular'),
    (N'605410463', N'Regular'),
    (N'121270177', N'Regular'),
    (N'121830826', N'Regular'),
    (N'121760393', N'Regular'),
    (N'605340471', N'Regular'),
    (N'605160452', N'Regular'),
    (N'605410700', N'Regular'),
    (N'121250380', N'Regular'),
    (N'121110454', N'Regular'),
    (N'605400249', N'Regular'),
    (N'121900878', N'Regular'),
    (N'121890708', N'Regular'),
    (N'402930355', N'Regular'),
    (N'121640184', N'Regular'),
    (N'605420303', N'Regular'),
    (N'605250155', N'Regular'),
    (N'605280461', N'Regular'),
    (N'120650092', N'Regular'),
    (N'121610501', N'Regular'),
    (N'121100026', N'Regular'),
    (N'121190459', N'Regular'),
    (N'121340408', N'Regular'),
    (N'605360614', N'Regular'),
    (N'605440271', N'Regular'),
    (N'120440498', N'Regular'),
    (N'120990693', N'Regular'),
    (N'605400822', N'Regular'),
    (N'121350075', N'Regular'),
    (N'120160373', N'Regular'),
    (N'605210163', N'Regular'),
    (N'901310620', N'Regular'),
    (N'901310621', N'Regular'),
    (N'121510987', N'Regular'),
    (N'605370753', N'Regular'),
    (N'305970829', N'Regular'),
    (N'305760885', N'Regular'),
    (N'605200984', N'Regular'),
    (N'605390981', N'Regular'),
    (N'120960724', N'Regular'),
    (N'121890915', N'Regular'),
    (N'605370900', N'Regular'),
    (N'120230889', N'Regular'),
    (N'120270756', N'Regular'),
    (N'605290162', N'Regular'),
    (N'605330246', N'Regular'),
    (N'121920585', N'Regular'),
    (N'605140985', N'Regular'),
    (N'605410199', N'Regular'),
    (N'605200798', N'Regular'),
    (N'121850999', N'Regular'),
    (N'605330091', N'Regular'),
    (N'121680545', N'Regular'),
    (N'605350561', N'Regular'),
    (N'605430551', N'Regular'),
    (N'605350878', N'Regular'),
    (N'605160453', N'Regular'),
    (N'121130533', N'Regular'),
    (N'605390972', N'Regular'),
    (N'605400918', N'Regular'),
    (N'306060807', N'Regular'),
    (N'121730911', N'Regular'),
    (N'605100999', N'Regular'),
    (N'402960840', N'Regular'),
    (N'209620449', N'Regular'),
    (N'605430346', N'Regular'),
    (N'121540743', N'Regular'),
    (N'121440735', N'Regular'),
    (N'605270696', N'Regular'),
    (N'901370804', N'Regular'),
    (N'901370803', N'Regular'),
    (N'121330889', N'Regular'),
    (N'605430373', N'Regular'),
    (N'120220540', N'Regular'),
    (N'121310559', N'Regular'),
    (N'605260433', N'Regular'),
    (N'605100193', N'Regular'),
    (N'605400100', N'Regular'),
    (N'605350356', N'Regular'),
    (N'121600888', N'Regular'),
    (N'121070344', N'Regular'),
    (N'605210611', N'Regular'),
    (N'605190831', N'Regular'),
    (N'120520690', N'Regular'),
    (N'605340470', N'Regular'),
    (N'121900850', N'Regular'),
    (N'605450591', N'Regular'),
    (N'605360545', N'Regular'),
    (N'605440370', N'Regular'),
    (N'120780760', N'Regular'),
    (N'605280086', N'Regular'),
    (N'605150981', N'Regular'),
    (N'605140374', N'Regular'),
    (N'121530297', N'Regular'),
    (N'605110996', N'Regular'),
    (N'605350919', N'Regular'),
    (N'120530900', N'Regular'),
    (N'605320264', N'Regular'),
    (N'605350780', N'Regular'),
    (N'605060115', N'Regular'),
    (N'605390050', N'Regular'),
    (N'120370488', N'Regular'),
    (N'605250959', N'Regular'),
    (N'505020093', N'Regular'),
    (N'209500460', N'Regular'),
    (N'605110511', N'Regular'),
    (N'121930202', N'Regular'),
    (N'605360798', N'Regular'),
    (N'605130337', N'Regular'),
    (N'121540748', N'Regular'),
    (N'605450493', N'Regular'),
    (N'605380655', N'Regular'),
    (N'605240144', N'Regular'),
    (N'605300304', N'Regular'),
    (N'605150017', N'Regular'),
    (N'605350940', N'Regular'),
    (N'605240222', N'Regular'),
    (N'605440093', N'Regular'),
    (N'605200341', N'Regular'),
    (N'120230790', N'Regular'),
    (N'121250476', N'Regular'),
    (N'605180269', N'Regular'),
    (N'209690296', N'Regular'),
    (N'605360225', N'Regular'),
    (N'121270804', N'Regular'),
    (N'121620481', N'Regular'),
    (N'605370958', N'Regular'),
    (N'605260334', N'Regular'),
    (N'121260300', N'Regular'),
    (N'901250403', N'Regular'),
    (N'605330212', N'Regular'),
    (N'120410869', N'Regular'),
    (N'605350053', N'Regular'),
    (N'605180063', N'Regular'),
    (N'605270040', N'Regular'),
    (N'605450382', N'Regular'),
    (N'605330090', N'Regular'),
    (N'605290205', N'Regular'),
    (N'121810103', N'Regular'),
    (N'121370062', N'Regular'),
    (N'605190959', N'Regular'),
    (N'119850637', N'Regular'),
    (N'120670258', N'Regular'),
    (N'120380396', N'Regular'),
    (N'120380397', N'Regular'),
    (N'605150117', N'Regular'),
    (N'121760388', N'Regular'),
    (N'605230339', N'Regular'),
    (N'120820973', N'Regular'),
    (N'605050381', N'Regular'),
    (N'120360505', N'Regular'),
    (N'121690972', N'Regular'),
    (N'306080206', N'Regular'),
    (N'605310745', N'Regular'),
    (N'605160412', N'Regular'),
    (N'605180587', N'Regular'),
    (N'121650994', N'Regular'),
    (N'605280067', N'Regular'),
    (N'605360677', N'Regular'),
    (N'605410931', N'Regular'),
    (N'605280082', N'Regular'),
    (N'605380595', N'Regular'),
    (N'605310592', N'Regular'),
    (N'605290500', N'Regular'),
    (N'605250926', N'Regular'),
    (N'605560070', N'Regular'),
    (N'605260407', N'Regular'),
    (N'120750294', N'Regular'),
    (N'605410795', N'Regular'),
    (N'120960941', N'Regular'),
    (N'605390750', N'Regular'),
    (N'605330541', N'Regular'),
    (N'605310966', N'Regular'),
    (N'605350036', N'Regular'),
    (N'605120562', N'Regular'),
    (N'605390731', N'Regular'),
    (N'120310462', N'Regular'),
    (N'YR2023-06419', N'Regular'),
    (N'121900776', N'Regular'),
    (N'605410354', N'Regular'),
    (N'120630105', N'Regular'),
    (N'YR2024-27281', N'Regular'),
    (N'605390191', N'Regular'),
    (N'121850229', N'Regular'),
    (N'605220156', N'Regular'),
    (N'605330101', N'Regular'),
    (N'605260684', N'Regular'),
    (N'605460829', N'Regular'),
    (N'YR202208467', N'Regular'),
    (N'121030133', N'Regular'),
    (N'605270265', N'Regular'),
    (N'605450176', N'Regular'),
    (N'605270051', N'Regular'),
    (N'605440132', N'Regular'),
    (N'605210440', N'Regular'),
    (N'121460143', N'Regular'),
    (N'901300815', N'Regular'),
    (N'121080702', N'Regular'),
    (N'605410685', N'Regular'),
    (N'605220654', N'Regular'),
    (N'605390382', N'Regular'),
    (N'120590180', N'Regular'),
    (N'120700811', N'Regular'),
    (N'120700810', N'Regular'),
    (N'121650478', N'Regular'),
    (N'605370555', N'Regular'),
    (N'605350050', N'Regular'),
    (N'605320253', N'Regular'),
    (N'605450060', N'Regular'),
    (N'605210276', N'Regular'),
    (N'605270683', N'Regular'),
    (N'121210036', N'Regular'),
    (N'605150468', N'Regular'),
    (N'605430544', N'Regular'),
    (N'121760397', N'Regular'),
    (N'605360246', N'Regular'),
    (N'605200529', N'Regular'),
    (N'605370930', N'Regular'),
    (N'121230903', N'Regular'),
    (N'605320037', N'Regular'),
    (N'605300877', N'Regular'),
    (N'605390957', N'Regular'),
    (N'605310235', N'Regular'),
    (N'605440915', N'Regular'),
    (N'605130332', N'Regular'),
    (N'605260347', N'Regular'),
    (N'605440836', N'Regular'),
    (N'605350923', N'Regular'),
    (N'120260836', N'Regular'),
    (N'605450396', N'Regular'),
    (N'120530718', N'Regular'),
    (N'121850923', N'Regular'),
    (N'121850921', N'Regular'),
    (N'121850922', N'Regular'),
    (N'605310751', N'Regular'),
    (N'120980292', N'Regular'),
    (N'605390658', N'Regular'),
    (N'´159101447510', N'Regular'),
    (N'605420370', N'Regular'),
    (N'121820716', N'Regular'),
    (N'306120981', N'Regular'),
    (N'121450578', N'Regular'),
    (N'159101505005', N'Regular'),
    (N'605160883', N'Regular'),
    (N'605250956', N'Regular'),
    (N'121070335', N'Regular'),
    (N'605410201', N'Regular'),
    (N'605310758', N'Regular'),
    (N'605220299', N'Regular'),
    (N'605300916', N'Regular'),
    (N'605230616', N'Regular'),
    (N'605410095', N'Regular'),
    (N'120770724', N'Regular'),
    (N'605240030', N'Regular'),
    (N'605380653', N'Regular'),
    (N'305810123', N'Regular'),
    (N'605320261', N'Regular'),
    (N'605370469', N'Regular'),
    (N'605300255', N'Regular'),
    (N'605270053', N'Regular'),
    (N'605160450', N'Regular'),
    (N'605430609', N'Regular'),
    (N'901450972', N'Regular'),
    (N'901450973', N'Regular'),
    (N'605440914', N'Regular'),
    (N'605270052', N'Regular'),
    (N'605180279', N'Regular'),
    (N'901220658', N'Regular'),
    (N'605230219', N'Regular'),
    (N'YR2022-24088', N'Regular'),
    (N'121120611', N'Regular'),
    (N'605410950', N'Regular'),
    (N'121540817', N'Regular'),
    (N'605350868', N'Regular'),
    (N'605340111', N'Regular'),
    (N'605460248', N'Regular'),
    (N'605280575', N'Regular'),
    (N'605230446', N'Regular'),
    (N'120890920', N'Regular'),
    (N'605240878', N'Regular'),
    (N'901240030', N'Regular'),
    (N'209460237', N'Regular'),
    (N'209240905', N'Regular'),
    (N'605320972', N'Regular'),
    (N'605350606', N'Regular'),
    (N'605330611', N'Regular'),
    (N'605320156', N'Regular'),
    (N'605400754', N'Regular'),
    (N'605460335', N'Regular'),
    (N'605340096', N'Regular'),
    (N'605260597', N'Regular'),
    (N'605080486', N'Regular'),
    (N'605200608', N'Regular'),
    (N'605290160', N'Regular'),
    (N'605380326', N'Regular'),
    (N'605300016', N'Regular'),
    (N'605260466', N'Regular'),
    (N'605130148', N'Regular'),
    (N'605350563', N'Regular'),
    (N'605360704', N'Regular'),
    (N'605350449', N'Regular'),
    (N'YR2022-34924', N'Regular'),
    (N'´159101446402', N'Regular'),
    (N'403060029', N'Regular'),
    (N'605350067', N'Regular'),
    (N'605210584', N'Regular'),
    (N'121360440', N'Regular'),
    (N'YR2026-67637', N'Regular'),
    (N'605210177', N'Regular'),
    (N'605570270', N'Regular'),
    (N'901210300', N'Regular'),
    (N'605460906', N'Regular'),
    (N'605460907', N'Regular'),
    (N'605370931', N'Regular'),
    (N'121480922', N'Regular'),
    (N'605370206', N'Regular'),
    (N'159101335926', N'Regular'),
    (N'605350900', N'Regular'),
    (N'605300494', N'Regular'),
    (N'605240130', N'Regular'),
    (N'605340469', N'Regular'),
    (N'120150982', N'Regular'),
    (N'121500872', N'Regular'),
    (N'120600844', N'Regular'),
    (N'605430712', N'Regular'),
    (N'605150746', N'Regular'),
    (N'209650291', N'Regular'),
    (N'605150751', N'Regular'),
    (N'605130336', N'Regular'),
    (N'605420849', N'Regular'),
    (N'605440165', N'Regular'),
    (N'605370559', N'Regular'),
    (N'121400038', N'Regular'),
    (N'605320713', N'Regular'),
    (N'´159101422215', N'Regular'),
    (N'605110124', N'Regular'),
    (N'124010122', N'Regular'),
    (N'306060273', N'Regular'),
    (N'403050151', N'Regular'),
    (N'121000206', N'Regular'),
    (N'605230299', N'Regular'),
    (N'605300571', N'Regular'),
    (N'121090689', N'Regular'),
    (N'121600268', N'Regular'),
    (N'605200803', N'Regular'),
    (N'605400461', N'Regular'),
    (N'121540337', N'Regular'),
    (N'605340237', N'Regular'),
    (N'120470060', N'Regular'),
    (N'605610883', N'Regular'),
    (N'605390338', N'Regular'),
    (N'121430339', N'Regular'),
    (N'209190909', N'Regular'),
    (N'121270380', N'Regular'),
    (N'605120024', N'Regular'),
    (N'121780911', N'Regular'),
    (N'605280053', N'Regular'),
    (N'605160368', N'Regular'),
    (N'605350991', N'Regular'),
    (N'305890261', N'Regular'),
    (N'208980220', N'Regular'),
    (N'121470877', N'Regular'),
    (N'121370771', N'Regular'),
    (N'120870306', N'Regular'),
    (N'120600293', N'Regular'),
    (N'605120103', N'Regular'),
    (N'504890317', N'Regular'),
    (N'605120717', N'Regular'),
    (N'605450494', N'Regular'),
    (N'605150047', N'Regular'),
    (N'209000485', N'Regular'),
    (N'209510973', N'Regular'),
    (N'605180262', N'Regular'),
    (N'120490940', N'Regular'),
    (N'605360037', N'Regular'),
    (N'605430473', N'Regular'),
    (N'120340058', N'Regular'),
    (N'121740716', N'Regular'),
    (N'120210584', N'Regular'),
    (N'120210585', N'Regular'),
    (N'605340147', N'Regular'),
    (N'209340627', N'Regular'),
    (N'605410952', N'Regular'),
    (N'605340512', N'Regular'),
    (N'605440567', N'Regular'),
    (N'121000785', N'Regular'),
    (N'605260471', N'Regular'),
    (N'605360899', N'Regular'),
    (N'605430924', N'Regular'),
    (N'605430129', N'Regular'),
    (N'121440095', N'Regular'),
    (N'120230671', N'Regular'),
    (N'605390846', N'Regular'),
    (N'305850706', N'Regular'),
    (N'209020654', N'Regular'),
    (N'209400870', N'Regular'),
    (N'121030537', N'Regular'),
    (N'605360016', N'Regular'),
    (N'YR2026-66807', N'Regular'),
    (N'605350074', N'Regular'),
    (N'121500550', N'Regular'),
    (N'605460202', N'Regular'),
    (N'901460512', N'Regular'),
    (N'605360566', N'Regular'),
    (N'605390667', N'Regular'),
    (N'120890065', N'Regular'),
    (N'605130446', N'Regular'),
    (N'605310076', N'Regular'),
    (N'605310934', N'Regular'),
    (N'605390337', N'Regular'),
    (N'605140899', N'Regular'),
    (N'120750135', N'Regular'),
    (N'605260469', N'Regular'),
    (N'605450583', N'Regular'),
    (N'604960349', N'Regular'),
    (N'605320152', N'Regular'),
    (N'605160369', N'Regular'),
    (N'605360522', N'Regular'),
    (N'605160016', N'Regular'),
    (N'121630231', N'Regular'),
    (N'121450568', N'Regular'),
    (N'120840429', N'Regular'),
    (N'703680257', N'Regular'),
    (N'605120099', N'Regular'),
    (N'605150207', N'Regular'),
    (N'605320529', N'Regular'),
    (N'120140957', N'Regular'),
    (N'605200448', N'Regular'),
    (N'605440529', N'Regular'),
    (N'605450449', N'Regular'),
    (N'120200486', N'Regular'),
    (N'120480914', N'Regular'),
    (N'121060478', N'Regular'),
    (N'605300570', N'Regular'),
    (N'YR2026-66848', N'Regular'),
    (N'120430767', N'Regular'),
    (N'120220197', N'Regular'),
    (N'121590994', N'Regular'),
    (N'120970822', N'Regular'),
    (N'605300707', N'Regular'),
    (N'120740444', N'Regular'),
    (N'605450790', N'Regular'),
    (N'121630125', N'Regular'),
    (N'605390904', N'Regular'),
    (N'605450517', N'Regular'),
    (N'121050037', N'Regular'),
    (N'605390833', N'Regular'),
    (N'605350523', N'Regular'),
    (N'605320281', N'Regular'),
    (N'605420643', N'Regular'),
    (N'605300736', N'Regular'),
    (N'121630773', N'Regular'),
    (N'119880167', N'Regular'),
    (N'209500624', N'Regular'),
    (N'209190706', N'Regular'),
    (N'605200450', N'Regular'),
    (N'605410105', N'Regular'),
    (N'605120719', N'Regular'),
    (N'605230266', N'Regular'),
    (N'120280602', N'Regular'),
    (N'605160317', N'Regular'),
    (N'121760511', N'Regular'),
    (N'605170153', N'Regular'),
    (N'605190626', N'Regular'),
    (N'901350879', N'Regular'),
    (N'605330634', N'Regular'),
    (N'120590372', N'Regular'),
    (N'120000788', N'Regular'),
    (N'605080161', N'Regular'),
    (N'605230861', N'Regular'),
    (N'605440016', N'Regular'),
    (N'605280449', N'Regular'),
    (N'605380306', N'Regular'),
    (N'121160656', N'Regular'),
    (N'121030547', N'Regular'),
    (N'605400431', N'Regular'),
    (N'605380064', N'Regular'),
    (N'605330754', N'Regular'),
    (N'605340232', N'Regular'),
    (N'605110513', N'Regular'),
    (N'605270718', N'Regular'),
    (N'´159101446616', N'Regular'),
    (N'605310234', N'Regular'),
    (N'605320283', N'Regular'),
    (N'605390199', N'Regular'),
    (N'120260394', N'Regular'),
    (N'305700900', N'Regular'),
    (N'121680993', N'Regular'),
    (N'121160338', N'Regular'),
    (N'605450798', N'Regular'),
    (N'605130806', N'Regular'),
    (N'121770589', N'Regular'),
    (N'605450445', N'Regular'),
    (N'121090707', N'Regular'),
    (N'605090664', N'Regular'),
    (N'605460832', N'Regular'),
    (N'120740423', N'Regular'),
    (N'605160012', N'Regular'),
    (N'403010543', N'Regular'),
    (N'121260304', N'Regular'),
    (N'605200305', N'Regular'),
    (N'605200519', N'Regular'),
    (N'605410453', N'Regular'),
    (N'120870651', N'Regular'),
    (N'605180156', N'Regular'),
    (N'402880818', N'Regular'),
    (N'605400122', N'Regular'),
    (N'605390334', N'Regular'),
    (N'605450357', N'Regular'),
    (N'209000207', N'Regular'),
    (N'209640446', N'Regular'),
    (N'306130419', N'Regular'),
    (N'605120965', N'Regular'),
    (N'605300992', N'Regular'),
    (N'605350073', N'Regular'),
    (N'121490044', N'Regular'),
    (N'121290406', N'Regular'),
    (N'121590663', N'Regular'),
    (N'121210688', N'Regular'),
    (N'605220884', N'Regular'),
    (N'209540485', N'Regular'),
    (N'121350218', N'Regular'),
    (N'605110272', N'Regular'),
    (N'605420396', N'Regular'),
    (N'605170158', N'Regular'),
    (N'605390378', N'Regular'),
    (N'703740241', N'Regular'),
    (N'120980291', N'Regular'),
    (N'120330116', N'Regular'),
    (N'605200376', N'Regular'),
    (N'605360674', N'Regular'),
    (N'605370335', N'Regular'),
    (N'605440863', N'Regular'),
    (N'605290480', N'Regular'),
    (N'121050092', N'Regular'),
    (N'605400251', N'Regular'),
    (N'605290479', N'Regular'),
    (N'121450752', N'Regular'),
    (N'121450751', N'Regular'),
    (N'121810967', N'Regular'),
    (N'605350700', N'Regular'),
    (N'605420250', N'Regular'),
    (N'605180584', N'Regular'),
    (N'120960612', N'Regular'),
    (N'605450789', N'Regular'),
    (N'121410654', N'Regular'),
    (N'306090498', N'Regular'),
    (N'120450723', N'Regular'),
    (N'605410651', N'Regular'),
    (N'605280506', N'Regular'),
    (N'120960594', N'Regular'),
    (N'120290248', N'Regular'),
    (N'605400395', N'Regular'),
    (N'605400311', N'Regular'),
    (N'605320999', N'Regular'),
    (N'121520796', N'Regular'),
    (N'605300476', N'Regular'),
    (N'605290158', N'Regular'),
    (N'121470832', N'Regular'),
    (N'605450294', N'Regular'),
    (N'605380005', N'Regular'),
    (N'605250573', N'Regular'),
    (N'121540769', N'Regular'),
    (N'605230220', N'Regular'),
    (N'121450601', N'Regular'),
    (N'120840058', N'Regular'),
    (N'605070960', N'Regular'),
    (N'604960611', N'Regular'),
    (N'605370928', N'Regular'),
    (N'605460575', N'Regular'),
    (N'605370794', N'Regular'),
    (N'605310608', N'Regular'),
    (N'605390194', N'Regular'),
    (N'605230409', N'Regular'),
    (N'605350282', N'Regular'),
    (N'120670171', N'Regular'),
    (N'605190501', N'Regular'),
    (N'120530259', N'Regular'),
    (N'605340667', N'Regular'),
    (N'121620910', N'Regular'),
    (N'604980512', N'Regular'),
    (N'209630622', N'Regular'),
    (N'120960915', N'Regular'),
    (N'120680996', N'Regular'),
    (N'121370741', N'Regular'),
    (N'605370961', N'Regular'),
    (N'121000629', N'Regular'),
    (N'605210222', N'Regular'),
    (N'605110295', N'Regular'),
    (N'605170595', N'Regular'),
    (N'120830331', N'Regular'),
    (N'605370164', N'Regular'),
    (N'605290504', N'Regular'),
    (N'605450586', N'Regular'),
    (N'605350078', N'Regular'),
    (N'605260405', N'Regular'),
    (N'605390906', N'Regular'),
    (N'120780598', N'Regular'),
    (N'605350874', N'Regular'),
    (N'605420183', N'Regular'),
    (N'605350863', N'Regular'),
    (N'605440019', N'Regular'),
    (N'´159101469518', N'Regular'),
    (N'605330308', N'Regular'),
    (N'605460348', N'Regular'),
    (N'121620602', N'Regular'),
    (N'120160992', N'Regular'),
    (N'306130129', N'Regular'),
    (N'605310520', N'Regular'),
    (N'605220972', N'Regular'),
    (N'605350104', N'Regular'),
    (N'605370354', N'Regular'),
    (N'121800139', N'Regular'),
    (N'605160952', N'Regular'),
    (N'121480215', N'Regular'),
    (N'605220787', N'Regular'),
    (N'120270552', N'Regular'),
    (N'605150744', N'Regular'),
    (N'605320535', N'Regular'),
    (N'605430221', N'Traslados'),
    (N'121130740', N'Traslados'),
    (N'605400422', N'Traslados'),
    (N'605380649', N'Traslados'),
    (N'159101484305', N'Traslados'),
    (N'605080344', N'Traslados'),
    (N'605450904', N'Traslados'),
    (N'209550103', N'Traslados'),
    (N'605440902', N'Traslados'),
    (N'605250301', N'Traslados'),
    (N'605310236', N'Traslados'),
    (N'605280046', N'Traslados'),
    (N'605150189', N'Traslados'),
    (N'703580442', N'Traslados'),
    (N'605280177', N'Traslados'),
    (N'121190969', N'Traslados'),
    (N'605300386', N'Traslados'),
    (N'120840457', N'Traslados'),
    (N'605290831', N'Traslados'),
    (N'605290830', N'Traslados'),
    (N'121140736', N'Traslados'),
    (N'605340078', N'Traslados'),
    (N'605400757', N'Traslados'),
    (N'121640048', N'Traslados'),
    (N'605370959', N'Traslados'),
    (N'121030681', N'Traslados'),
    (N'605310589', N'Traslados');

BEGIN TRAN;

;WITH TiposNuevos AS (
    SELECT DISTINCT
        e.InstitucionId,
        c.TipoEstudianteDescripcion
    FROM @Cambios c
    INNER JOIN dbo.Estudiante e
        ON REPLACE(REPLACE(LTRIM(RTRIM(e.Identificacion)), N' ', N''), N'-', N'') = REPLACE(REPLACE(LTRIM(RTRIM(c.Identificacion)), N' ', N''), N'-', N'')
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TipoEstudiante te
        WHERE te.InstitucionId = e.InstitucionId
          AND UPPER(LTRIM(RTRIM(te.Descripcion))) = UPPER(LTRIM(RTRIM(c.TipoEstudianteDescripcion)))
    )
)
INSERT INTO dbo.TipoEstudiante
(
    InstitucionId,
    Descripcion,
    Activo,
    CreatedAt
)
SELECT
    tn.InstitucionId,
    tn.TipoEstudianteDescripcion,
    1,
    SYSDATETIME()
FROM TiposNuevos tn;

UPDATE e
SET e.TipoEstudianteId = te.TipoEstudianteId
FROM dbo.Estudiante e
INNER JOIN @Cambios c
    ON REPLACE(REPLACE(LTRIM(RTRIM(e.Identificacion)), N' ', N''), N'-', N'') = REPLACE(REPLACE(LTRIM(RTRIM(c.Identificacion)), N' ', N''), N'-', N'')
INNER JOIN dbo.TipoEstudiante te
    ON UPPER(LTRIM(RTRIM(te.Descripcion))) = UPPER(LTRIM(RTRIM(c.TipoEstudianteDescripcion)));

SELECT
    @@ROWCOUNT AS FilasActualizadas,
    (SELECT COUNT(1) FROM @Cambios) AS FilasEnExcel;

COMMIT TRAN;
