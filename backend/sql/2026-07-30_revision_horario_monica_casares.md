# Revision previa - horario Monica Casares Correa

Archivo fuente: `C:\Users\HP\Downloads\Horario_Profesora_Casares_Correa_Monica_Marzo_2026.xlsx`

Profesora: `monica.casares.correa@mep.go.cr`

UsuarioId en BD: `783`

Periodo asumido: `2026 / II Periodo`

Estado: revision previa. Este archivo no es un script SQL ejecutable.

## Supuestos para el script

- No crear materias nuevas.
- No crear secciones nuevas.
- No crear grupos combinados como `11-1/11-2`; en BD esas secciones existen por separado.
- Expandir las secciones combinadas del Excel a sus secciones individuales.
- No validar como error que una profesora tenga mas de una seccion en la misma leccion.
- Evitar solo duplicados exactos de `seccion + materia + dia + bloque`.
- Para Monica, dejar activas solo las combinaciones de seccion/materia derivadas del Excel.

## Mapeo de materias

| Texto en Excel | Codigo BD | Materia BD |
| --- | --- | --- |
| English oriented accounting and finance | `EOAF` | English oriented accounting and finance |
| English oriented to accounting | `EOTF` | English oriented to accounting |
| English oriented to agricultural and livestock production | `EOAL` | English oriented to agricultural and livestock production |
| English oriented to productive processes and safety inspection in food industry | `EOPS` | English oriented to productive processes and safety inspection in food industry |

## Mapa objetivo expandido

| Dia | Lecciones | Grupo en Excel | Secciones en BD | Materia | Registros HorarioGrupo |
| --- | --- | --- | --- | --- | ---: |
| Lunes | 1-6 | `11-1/11-2` | `11-1`, `11-2` | `EOAF` | 12 |
| Lunes | 7-12 | `10-3` | `10-3` | `EOPS` | 6 |
| Martes | 1-6 | `12-3` | `12-3` | `EOTF` | 6 |
| Martes | 7-12 | `10-2` | `10-2` | `EOTF` | 6 |
| Miercoles | 1-6 | `12-1/12-2` | `12-1`, `12-2` | `EOTF` | 12 |
| Miercoles | 7-12 | `10-1` | `10-1` | `EOTF` | 6 |
| Jueves | 1-6 | `11-3/11-4` | `11-3`, `11-4` | `EOAL` | 12 |
| Jueves | 7-12 | `12-1/12-2` | `12-1`, `12-2` | `EOTF` | 12 |
| Viernes | 1-6 | `12-1/12-2` | `12-1`, `12-2` | `EOPS` | 12 |
| Viernes | 7-12 | `11-2/11-1` | `11-1`, `11-2` | `EOPS` | 12 |

Total objetivo:

- `14` combinaciones activas de seccion/materia para Monica.
- `96` registros activos de horario, ya expandiendo secciones combinadas.
- `0` duplicados exactos esperados.

## Combinaciones objetivo

| Seccion | Materia |
| --- | --- |
| `10-1` | `EOTF` |
| `10-2` | `EOTF` |
| `10-3` | `EOPS` |
| `11-1` | `EOAF` |
| `11-1` | `EOPS` |
| `11-2` | `EOAF` |
| `11-2` | `EOPS` |
| `11-3` | `EOAL` |
| `11-4` | `EOAL` |
| `12-1` | `EOPS` |
| `12-1` | `EOTF` |
| `12-2` | `EOPS` |
| `12-2` | `EOTF` |
| `12-3` | `EOTF` |

## Estado actual en BD

Consulta de solo lectura contra BD:

- Combinaciones activas actuales para Monica: `13`.
- Registros activos actuales de horario visibles para Monica: `90`.
- Registros distintos actuales de horario visibles para Monica: `90`.
- Duplicados exactos actuales: `0`.

### Combinaciones faltantes

Estas deben quedar activas para Monica y no estan activas actualmente:

| Seccion | Materia | Lecciones faltantes |
| --- | --- | --- |
| `12-1` | `EOTF` | Miercoles 1-6, Jueves 7-12 |
| `12-2` | `EOTF` | Miercoles 1-6, Jueves 7-12 |

Total faltante de horario objetivo: `24` registros.

### Combinacion sobrante para Monica

Esta combinacion aparece activa para Monica, pero no esta en el Excel:

| Seccion | Materia | Lecciones actuales |
| --- | --- | --- |
| `12-2` | `GeCt` | Miercoles 1-6, Jueves 7-12, Viernes 1-6 |

Total sobrante visible para Monica: `18` registros.

## Advertencias

La combinacion `12-2 / GeCt` tambien esta activa para `marianela.valverde.padilla@mep.go.cr`.

Por eso, el script no deberia borrar ni desactivar el horario de `12-2 / GeCt` a nivel de `HorarioGrupo`, porque podria afectar a Marianela. Para que a Monica no le aparezca Gestion Contable, deberia bastar con desactivar solo la `AsignacionDocente` de Monica para `12-2 / GeCt`.

El Excel tambien menciona co-docencia en texto para algunos bloques:

- Miercoles 1-6: `Marianela Valverde / Monica Casares`.
- Jueves 7-12: `Jessica Castillo / Monica Casares`.

La revision de BD solo confirma los cambios necesarios para Monica. No propone modificar asignaciones de Marianela ni Jessica.

## Cambios propuestos para el futuro script

1. Mantener activas las 12 combinaciones que ya coinciden con el Excel.
2. Activar o crear para Monica:
   - `12-1 / EOTF`.
   - `12-2 / EOTF`.
3. Desactivar solo para Monica:
   - `12-2 / GeCt`.
4. Crear o reactivar `GrupoMateria` para `12-1 / EOTF` y `12-2 / EOTF` si no existen, sin duplicarlos.
5. Crear o reactivar los 24 horarios faltantes:
   - `12-1 / EOTF`: Miercoles 1-6 y Jueves 7-12.
   - `12-2 / EOTF`: Miercoles 1-6 y Jueves 7-12.
6. No modificar `HorarioGrupo` de `12-2 / GeCt`, por estar compartido con Marianela.
7. Dejar validaciones finales:
   - Monica con exactamente `14` combinaciones activas del Excel.
   - `96` horarios activos visibles para Monica al expandir secciones combinadas.
   - `0` combinaciones activas fuera del mapa.
   - `0` duplicados exactos de `seccion + materia + dia + bloque`.
