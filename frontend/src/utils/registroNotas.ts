import { type SeguimientoEvaluacionContexto, type SeguimientoEvaluacionDetalle, type EstudianteGrupo, normalizarSeguimientoKey, getTipoSeguimientoFromDetalle, formatPercent, getFullName, isTipoExamenSeguimiento } from '../pages/GestionProfePage.helpers';
export const dedupeActividadesLogicas = (items: any[]) => {
    const map = new Map<string, any>();
    for (const actividad of items || []) {
      const key = [
        Number(actividad?.EstructuraGrupoDetalleId || 0),
        normalizarSeguimientoKey(String(actividad?.Nombre || "")),
        normalizarSeguimientoKey(String(actividad?.Fuente || "")),
        String(actividad?.Fecha || "").slice(0, 10),
        Number(actividad?.PuntosMaximos || 0).toFixed(2),
        Number(actividad?.PorcentajeDentroRubro || 0).toFixed(2),
      ].join("|");
      const actual = map.get(key);
      if (!actual || Number(actividad?.ActividadId || 0) > Number(actual?.ActividadId || 0)) {
        map.set(key, actividad);
      }
    }
    return Array.from(map.values());
  };
export const dedupeSeguimientosActividadIndicadorLogico = (items: any[], indicadoresCatalogo: any[]) => {
    const indicadorPorId = new Map<number, any>();
    for (const indicador of indicadoresCatalogo || []) {
      indicadorPorId.set(Number(indicador?.IndicadorGrupoId || 0), indicador);
    }
    const map = new Map<string, any>();
    for (const item of items || []) {
      const indicador = indicadorPorId.get(Number(item?.IndicadorGrupoId || 0));
      const key = [
        Number(item?.ActividadId || 0),
        Number(item?.EstudianteId || 0),
        normalizarSeguimientoKey(String(indicador?.TipoUso || "")),
        normalizarSeguimientoKey(String(indicador?.IndicadorBase || "")),
      ].join("|");
      const actual = map.get(key);
      if (!actual || Number(item?.SeguimientoIndicadorId || 0) > Number(actual?.SeguimientoIndicadorId || 0)) {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  };
export const agruparIndicadoresLogicos = (ids: Iterable<number>, indicadoresCatalogo: any[], tipo: "COTIDIANO" | "TAREAS") => {
    const indicadorPorId = new Map<number, any>();
    for (const indicador of indicadoresCatalogo || []) {
      indicadorPorId.set(Number(indicador?.IndicadorGrupoId || 0), indicador);
    }

    const columnasMap = new Map<string, { nombre: string; indicadorIds: number[] }>();
    for (const rawId of ids) {
      const id = Number(rawId || 0);
      if (id <= 0) continue;
      const indicador = indicadorPorId.get(id);
      const nombre = String(indicador?.IndicadorBase || `Indicador ${id}`);
      const key = indicador
        ? [
            tipo,
            normalizarSeguimientoKey(nombre),
          ].join("|")
        : `ID|${id}`;
      const actual = columnasMap.get(key);
      if (actual) {
        if (!actual.indicadorIds.includes(id)) actual.indicadorIds.push(id);
      } else {
        columnasMap.set(key, { nombre, indicadorIds: [id] });
      }
    }

    return Array.from(columnasMap.values()).sort((a, b) => {
      const aa = String(a.nombre || "");
      const bb = String(b.nombre || "");
      const ma = aa.match(/^(\d+)(?:\.(\d+))?/);
      const mb = bb.match(/^(\d+)(?:\.(\d+))?/);
      if (ma && mb) {
        const a1 = Number(ma[1] || 0);
        const b1 = Number(mb[1] || 0);
        if (a1 !== b1) return a1 - b1;
        const a2 = Number(ma[2] || 0);
        const b2 = Number(mb[2] || 0);
        if (a2 !== b2) return a2 - b2;
      }
      return aa.localeCompare(bb);
    });
  };

export function calcularRegistroNotas(seguimientoContexto: (SeguimientoEvaluacionContexto & { componenteAjustesManuales?: any[] }) | null, asistenciaNotificaciones: Record<string, { correoEnviado?: boolean; waEnviado?: boolean }> = {}) {
const asistenciaDraftKey = (estudianteId: number, horarioGrupoId: number) => estudianteId + '-' + horarioGrupoId;

    const detalles = seguimientoContexto?.detalles || [];
    const estudiantes = seguimientoContexto?.estudiantes || [];
    const actividades = seguimientoContexto?.actividades || [];
    const notas = seguimientoContexto?.notasActividades || [];
    const seguimientos = seguimientoContexto?.seguimientos || [];
    const indicadores = seguimientoContexto?.indicadores || [];
    const actividadIndicadores = seguimientoContexto?.actividadIndicadores || [];
    const asistencia = seguimientoContexto?.asistenciaRegistros || [];
    const ajustesManuales = seguimientoContexto?.componenteAjustesManuales || [];
    const ajustesMap = new Map<string, number>();
    for (const item of ajustesManuales) {
      const estudianteId = Number(item?.EstudianteId || 0);
      const detalleId = Number(item?.EstructuraGrupoDetalleId || 0);
      const porcentaje = Number(item?.PorcentajeObtenidoComponente);
      if (estudianteId > 0 && detalleId > 0 && Number.isFinite(porcentaje)) {
        ajustesMap.set(`${estudianteId}-${detalleId}`, porcentaje);
      }
    }

    function promedioNumeros(valores: number[]) {
      if (!valores.length) return 0;
      return valores.reduce((acc, value) => acc + value, 0) / valores.length;
    }

    function escalaArticulo37(porcentajeAusencias: number) {
      if (porcentajeAusencias >= 50) return 0;
      if (porcentajeAusencias >= 40) return 1;
      if (porcentajeAusencias >= 30) return 2;
      if (porcentajeAusencias >= 20) return 3;
      if (porcentajeAusencias >= 10) return 4;
      return 5;
    }

    function ausenciaEquivalente(estado: string) {
      const key = normalizarSeguimientoKey(estado);
      if (key.includes("AUSENTE_JUSTIFICADA")) return 0;
      if (key.includes("TARDIA_MENOR")) return 0.5;
      if (key.includes("AUSENTE_INJUSTIFICADA") || key.includes("TARDIA_MAYOR")) return 1;
      return 0;
    }

    function calcularComponente(detalleItem: SeguimientoEvaluacionDetalle, estudiante: EstudianteGrupo) {
      const tipo = getTipoSeguimientoFromDetalle(detalleItem);
      const tipoKey = normalizarSeguimientoKey(tipo);
      const porcentajeComponente = Number(detalleItem.Porcentaje || 0);
      const detalleId = Number(detalleItem.EstructuraGrupoDetalleId);
      let nota = 0;
      let porcentajeEvaluado = 0;
      let porcentajeGanado = 0;
      let porcentajeGanadoOriginal = 0;
      let evaluados = 0;
      let pendientes = 0;
      let resumen = "Sin registros";
      let detallesLista: Array<{ key: string; titulo: string; subtitulo: string; nota: number; porcentaje: number; estado?: string; correoEnviado?: boolean; waEnviado?: boolean }> = [];

      if (tipoKey.includes("ASIST")) {
        const registros = asistencia.filter((item) => Number(item.EstudianteId) === Number(estudiante.EstudianteId));
        const totalLecciones = registros.length;
        const ausencias = registros.reduce((acc, item) => acc + ausenciaEquivalente(item.Estado), 0);
        const porcentajeAusencias = totalLecciones ? (ausencias / totalLecciones) * 100 : 0;
        const puntosArticulo = escalaArticulo37(porcentajeAusencias);
        porcentajeGanado = totalLecciones
          ? Number((((puntosArticulo / 5) * porcentajeComponente).toFixed(2)))
          : 0;
        nota = porcentajeComponente ? (porcentajeGanado / porcentajeComponente) * 100 : 0;
        porcentajeEvaluado = totalLecciones > 0 ? porcentajeComponente : 0;
        evaluados = totalLecciones;
        pendientes = totalLecciones ? 0 : 1;
        resumen = totalLecciones
          ? `${totalLecciones} lecciones registradas / ${ausencias.toFixed(2)} ausencias equivalentes / ${porcentajeAusencias.toFixed(2)}% ausencias`
          : "Sin asistencia registrada";
        detallesLista = registros.map((registro) => {
          const notif = asistenciaNotificaciones[
            asistenciaDraftKey(Number(estudiante.EstudianteId), Number(registro.HorarioGrupoId || 0))
          ] || {};
          return {
            key: `asis-${registro.AsistenciaRegistroId}`,
            titulo: `${registro.BloqueNombre || "Lección"} ${registro.HoraInicio || ""}-${registro.HoraFin || ""}`.trim(),
            subtitulo: (() => {
              const fecha = new Date(String(registro.Fecha || ""));
              if (!Number.isFinite(fecha.getTime())) return String(registro.Fecha || "");
              const dd = String(fecha.getDate()).padStart(2, "0");
              const mm = String(fecha.getMonth() + 1).padStart(2, "0");
              const yyyy = String(fecha.getFullYear());
              return `${dd}-${mm}-${yyyy}`;
            })(),
            nota: ausenciaEquivalente(registro.Estado) > 0 ? 0 : 100,
            porcentaje: 0,
            estado: registro.Estado || "Presente",
            correoEnviado: Boolean((registro as any)?.CorreoEnviado || (registro as any)?.NotificacionCorreoEnviado || notif?.correoEnviado),
            waEnviado: Boolean((registro as any)?.WaEnviado || (registro as any)?.WhatsappEnviado || (registro as any)?.NotificacionWaEnviado || notif?.waEnviado)
          };
        });
        if (!detallesLista.length) {
          detallesLista.push({
            key: `asis-vacio-${estudiante.EstudianteId}`,
            titulo: "Asistencia",
            subtitulo: "No hay lecciones registradas para este estudiante",
            nota: 0,
            porcentaje: 0,
            estado: "Pendiente"
          });
        }
      } else if (tipoKey.includes("COTIDIAN") || tipoKey.includes("TAREA")) {
        const tipoUso = tipoKey.includes("TAREA") ? "TAREAS" : "COTIDIANO";
        const indicadoresTipo = indicadores.filter((indicador) => {
          const tipoIndicador = normalizarSeguimientoKey(indicador.TipoUso);
          return tipoKey.includes("COTIDIAN")
            ? tipoIndicador.includes("COTIDIAN")
            : tipoIndicador.includes("TAREA");
        });
        const seguimientosEstudiante = seguimientos.filter((item) => Number(item.EstudianteId) === Number(estudiante.EstudianteId));
        const actividadesDetalle = dedupeActividadesLogicas(
          actividades.filter((actividad) => Number(actividad.EstructuraGrupoDetalleId) === detalleId)
        );
        const indicadorIds = new Set(indicadoresTipo.map((indicador) => Number(indicador.IndicadorGrupoId)));
        const actividadesResumen = actividadesDetalle.map((actividad) => {
          const registrosActividad = dedupeSeguimientosActividadIndicadorLogico(
            seguimientosEstudiante.filter((item) =>
              Number(item.ActividadId) === Number(actividad.ActividadId)
              && indicadorIds.has(Number(item.IndicadorGrupoId))
            ),
            indicadoresTipo
          );
          const notaActividadRegistro = notas.find((n) =>
            Number((n as any).ActividadId) === Number(actividad.ActividadId)
            && Number((n as any).EstudianteId) === Number(estudiante.EstudianteId)
          );
          const indicadoresAsignados = actividadIndicadores
            .filter((item) =>
              Number(item.ActividadId) === Number(actividad.ActividadId)
              && indicadorIds.has(Number(item.IndicadorGrupoId))
              && item.Activo !== false
              && item.Activo !== 0
            )
            .map((item) => {
              const indicador = indicadoresTipo.find((indicador) => Number(indicador.IndicadorGrupoId) === Number(item.IndicadorGrupoId));
              return [
                normalizarSeguimientoKey(String(indicador?.TipoUso || "")),
                normalizarSeguimientoKey(String(indicador?.IndicadorBase || "")),
              ].join("|");
            });
          const totalAsignados = new Set(indicadoresAsignados.filter(Boolean)).size || indicadoresTipo.length;
          const puntos = registrosActividad.reduce((acc, item) => acc + Number(item.ValorSeleccionado || 0), 0);
          const indicadoresEvaluados = new Set(registrosActividad.map((item) => {
            const indicador = indicadoresTipo.find((entry) => Number(entry.IndicadorGrupoId) === Number(item.IndicadorGrupoId));
            return [
              normalizarSeguimientoKey(String(indicador?.TipoUso || "")),
              normalizarSeguimientoKey(String(indicador?.IndicadorBase || "")),
            ].join("|");
          })).size;
          const maximo = totalAsignados * 3;
          const notaActividad = maximo ? (puntos / maximo) * 100 : 0;
          const pesoActividad = Number(actividad.PorcentajeDentroRubro || 0) > 0 ? Number(actividad.PorcentajeDentroRubro || 0) / 100 : (actividadesDetalle.length ? 1 / actividadesDetalle.length : 0);
          const correoEnviadoSeguimiento = registrosActividad.some((item: any) => Boolean(item?.CorreoEnviado || item?.NotificacionCorreoEnviado));
          const waEnviadoSeguimiento = registrosActividad.some((item: any) => Boolean(item?.WaEnviado || item?.WhatsappEnviado || item?.NotificacionWaEnviado));
          const correoEnviadoNota = Boolean((notaActividadRegistro as any)?.CorreoEnviado || (notaActividadRegistro as any)?.NotificacionCorreoEnviado);
          const waEnviadoNota = Boolean((notaActividadRegistro as any)?.WaEnviado || (notaActividadRegistro as any)?.WhatsappEnviado || (notaActividadRegistro as any)?.NotificacionWaEnviado);
          const correoEnviado = correoEnviadoSeguimiento || correoEnviadoNota;
          const waEnviado = waEnviadoSeguimiento || waEnviadoNota;
          return { actividad, registrosActividad, indicadoresEvaluados, totalAsignados, notaActividad, pesoActividad, correoEnviado, waEnviado };
        });
        porcentajeGanado = actividadesResumen.reduce((acc, item) => acc + ((item.notaActividad / 100) * porcentajeComponente * item.pesoActividad), 0);
        nota = porcentajeComponente ? (porcentajeGanado / porcentajeComponente) * 100 : 0;
        porcentajeEvaluado = actividadesResumen.reduce((acc, item) => {
          const asignados = Math.max(0, Number(item.totalAsignados || 0));
          const evaluadosActividad = Math.max(0, Number(item.indicadoresEvaluados || 0));
          if (!asignados || !Number.isFinite(asignados)) return acc;
          const ratioEvaluado = Math.min(evaluadosActividad, asignados) / asignados;
          return acc + (ratioEvaluado * porcentajeComponente * item.pesoActividad);
        }, 0);
        porcentajeGanado = Math.min(porcentajeComponente, porcentajeGanado);
        porcentajeEvaluado = Math.min(porcentajeComponente, porcentajeEvaluado);
        evaluados = actividadesResumen.reduce((acc, item) => acc + item.indicadoresEvaluados, 0);
        pendientes = actividadesDetalle.length
          ? actividadesResumen.reduce((acc, item) => acc + Math.max(0, item.totalAsignados - item.indicadoresEvaluados), 0)
          : Math.max(0, indicadoresTipo.length - evaluados);
        resumen = actividadesDetalle.length
          ? `${actividadesResumen.filter((item) => item.indicadoresEvaluados > 0).length}/${actividadesDetalle.length} actividades con indicadores`
          : `${evaluados}/${indicadoresTipo.length} indicadores calificados`;

        // Tareas debe contar los mismos indicadores lógicos que su reporte.
        // Así se evita que una tarea calificada aparezca como pendiente en Registro de Notas.
        if (tipoKey.includes("TAREA")) {
          const actividadIdsDetalle = new Set(actividadesDetalle.map((actividad) => Number(actividad.ActividadId)).filter((id) => id > 0));
          const indicadorIdsAsignados = new Set(
            actividadIndicadores
              .filter((item) => actividadIdsDetalle.has(Number(item.ActividadId)) && item.Activo !== false && item.Activo !== 0)
              .map((item) => Number(item.IndicadorGrupoId))
              .filter((id) => id > 0)
          );
          const indicadorIdsConSeguimiento = new Set(
            seguimientos
              .filter((item) => Number(item.EstructuraGrupoDetalleId) === detalleId)
              .map((item) => Number(item.IndicadorGrupoId))
              .filter((id) => id > 0)
          );
          const indicadoresLogicos = agruparIndicadoresLogicos(
            new Set<number>([...indicadorIdsAsignados, ...indicadorIdsConSeguimiento]),
            indicadores,
            "TAREAS"
          );
          const registrosTarea = dedupeSeguimientosActividadIndicadorLogico(
            seguimientosEstudiante.filter((item) => Number(item.EstructuraGrupoDetalleId) === detalleId),
            indicadoresTipo
          );
          const valoresTarea = indicadoresLogicos.map((columna) => {
            const ids = new Set((columna.indicadorIds || []).map((id) => Number(id)).filter((id) => id > 0));
            const registrosIndicador = registrosTarea.filter((item) => ids.has(Number(item.IndicadorGrupoId)));
            if (!registrosIndicador.length) return null;
            return (registrosIndicador.reduce((acc, item) => acc + Number(item.ValorSeleccionado || 0), 0) / registrosIndicador.length / 3) * 100;
          }).filter((valor): valor is number => valor !== null);

          if (indicadoresLogicos.length) {
            evaluados = valoresTarea.length;
            pendientes = Math.max(0, indicadoresLogicos.length - evaluados);
            porcentajeEvaluado = Number(((evaluados / indicadoresLogicos.length) * porcentajeComponente).toFixed(2));
            const promedioTarea = valoresTarea.length ? promedioNumeros(valoresTarea) : 0;
            porcentajeGanado = Number(((promedioTarea / 100) * porcentajeEvaluado).toFixed(2));
            nota = porcentajeComponente ? Math.min(100, (porcentajeGanado / porcentajeComponente) * 100) : 0;
            resumen = `${evaluados}/${indicadoresLogicos.length} indicadores calificados`;
          }
        }
        detallesLista = actividadesResumen.map((item) => ({
          key: `act-ind-${item.actividad.ActividadId}`,
          titulo: item.actividad.Nombre || "Actividad",
          subtitulo: `${item.indicadoresEvaluados}/${item.totalAsignados} indicadores evaluados`,
          nota: item.notaActividad,
          porcentaje: (item.notaActividad / 100) * porcentajeComponente * item.pesoActividad,
          estado: item.indicadoresEvaluados ? "Calificada" : "Pendiente",
          correoEnviado: Boolean((item as any).correoEnviado),
          waEnviado: Boolean((item as any).waEnviado)
        }));
        if (!detallesLista.length) {
          detallesLista = indicadoresTipo.map((indicador) => {
            const registro = seguimientosEstudiante.find((item) => Number(item.EstructuraGrupoDetalleId) === detalleId && Number(item.IndicadorGrupoId) === Number(indicador.IndicadorGrupoId));
            const valor = Number(registro?.ValorSeleccionado ?? 0);
          return {
            key: `ind-${indicador.IndicadorGrupoId}`,
            titulo: indicador.IndicadorBase || "Indicador",
            subtitulo: indicador.PlaneamientoNombre || "Planeamiento",
            nota: valor ? (valor / 3) * 100 : 0,
            porcentaje: indicadoresTipo.length ? ((valor / 3) * porcentajeComponente) / indicadoresTipo.length : 0,
            estado: registro?.NivelNombre || (valor === 0 && registro ? "Ausente / No entregado" : "Pendiente"),
            correoEnviado: Boolean((registro as any)?.CorreoEnviado || (registro as any)?.NotificacionCorreoEnviado),
            waEnviado: Boolean((registro as any)?.WaEnviado || (registro as any)?.WhatsappEnviado || (registro as any)?.NotificacionWaEnviado)
          };
        });
        }
      } else {
        const actividadesDetalle = actividades.filter((actividad) => Number(actividad.EstructuraGrupoDetalleId) === detalleId);
        const notasEstudiante = notas.filter((notaItem) => Number(notaItem.EstudianteId) === Number(estudiante.EstudianteId));
        const notasDetalle = notasEstudiante.filter((notaItem) => actividadesDetalle.some((actividad) => Number(actividad.ActividadId) === Number(notaItem.ActividadId)));
        const getPesoActividad = (actividad: any) => Number(actividad?.PorcentajeReal || 0) > 0
          ? Number(actividad.PorcentajeReal)
          : Number(actividad?.PorcentajeDentroRubro || 0);
        const notasPorActividad = actividadesDetalle.map((actividad) => {
          const notaItem = notasDetalle.find((item) => Number(item.ActividadId) === Number(actividad.ActividadId));
          const puntosObtenidos = notaItem?.PuntosObtenidos;
          const maximo = Number(notaItem?.PuntosMaximos || actividad.PuntosMaximos || 0);
          const tieneRegistroCalificado = puntosObtenidos !== null && puntosObtenidos !== undefined && Number.isFinite(Number(puntosObtenidos));
          const notaDirecta = Number(notaItem?.NotaObtenida ?? 0);
          const notaCalculada = !tieneRegistroCalificado
            ? 0
            : (notaDirecta > 0 ? notaDirecta : (maximo ? (Number(puntosObtenidos) / maximo) * 100 : 0));
          return { actividad, notaItem, notaCalculada, tieneRegistroCalificado };
        });

        const sumaPesosConfig = notasPorActividad.reduce((acc, item) => acc + Math.max(0, getPesoActividad(item.actividad)), 0);
        const pesoDefault = actividadesDetalle.length ? (porcentajeComponente / actividadesDetalle.length) : 0;

        porcentajeGanado = notasPorActividad.reduce((acc, item) => {
          if (!item.tieneRegistroCalificado) return acc;
          const peActividad = sumaPesosConfig > 0
            ? Math.max(0, getPesoActividad(item.actividad))
            : pesoDefault;
          return acc + ((item.notaCalculada / 100) * peActividad);
        }, 0);

        // "Porcentaje Evaluado": cuánto del componente ya tiene calificación registrada.
        porcentajeEvaluado = notasPorActividad.reduce((acc, item) => {
          if (!item.tieneRegistroCalificado) return acc;
          const peActividad = sumaPesosConfig > 0
            ? Math.max(0, getPesoActividad(item.actividad))
            : pesoDefault;
          return acc + peActividad;
        }, 0);
        nota = Math.min(100, porcentajeComponente > 0 ? (porcentajeGanado / porcentajeComponente) * 100 : 0);
        evaluados = notasPorActividad.filter((item) => item.tieneRegistroCalificado).length;
        pendientes = Math.max(0, actividadesDetalle.length - evaluados);
        resumen = `${evaluados}/${actividadesDetalle.length} actividades calificadas`;
        detallesLista = notasPorActividad.map((item) => ({
          key: `act-${item.actividad.ActividadId}`,
          actividadId: Number(item.actividad.ActividadId),
          notaActividadId: Number(item.notaItem?.NotaActividadId || 0),
          fueEditado: Number((item.notaItem as { FueEditado?: number } | undefined)?.FueEditado || 0) === 1,
          porcentajeObtenido: Number(item.notaItem?.PorcentajeObtenido ?? item.notaCalculada ?? 0),
          titulo: item.actividad.Nombre || "Actividad",
          subtitulo: `Puntos: ${Number(item.notaItem?.PuntosObtenidos || 0).toFixed(2)} / ${Number(item.notaItem?.PuntosMaximos || item.actividad.PuntosMaximos || 0).toFixed(2)}`,
          nota: item.tieneRegistroCalificado ? item.notaCalculada : 0,
          porcentaje: (() => {
            if (!item.tieneRegistroCalificado) return 0;
            const peActividad = sumaPesosConfig > 0
              ? Math.max(0, getPesoActividad(item.actividad))
              : pesoDefault;
            return (item.notaCalculada / 100) * peActividad;
          })(),
          estado: item.tieneRegistroCalificado ? "Calificada" : "Pendiente",
          correoEnviado: Boolean((item.notaItem as any)?.CorreoEnviado || (item.notaItem as any)?.NotificacionCorreoEnviado),
          waEnviado: Boolean((item.notaItem as any)?.WaEnviado || (item.notaItem as any)?.WhatsappEnviado || (item.notaItem as any)?.NotificacionWaEnviado)
        }));
      }

      porcentajeGanadoOriginal = porcentajeGanado;
      const ajusteManual = ajustesMap.get(`${Number(estudiante.EstudianteId)}-${detalleId}`);
      const tieneAjusteManual = Number.isFinite(ajusteManual);
      if (tieneAjusteManual) {
        porcentajeGanado = Number(ajusteManual);
        nota = porcentajeComponente > 0 ? Math.min(100, (porcentajeGanado / porcentajeComponente) * 100) : 0;
        porcentajeEvaluado = porcentajeComponente;
        resumen = `Ajuste manual aplicado en Registro de Notas (${formatPercent(porcentajeGanado)}).`;
      }

      return {
        key: `${estudiante.EstudianteId}-${detalleItem.EstructuraGrupoDetalleId}`,
        nombre: detalleItem.Nombre || detalleItem.ComponenteCatalogoNombre || tipo,
        tipo,
        porcentajeComponente,
        porcentajeEvaluado,
        nota,
        porcentajeGanado,
        evaluados,
        pendientes,
        resumen,
        detalles: detallesLista,
        ajustadoManual: tieneAjusteManual,
        porcentajeGanadoOriginal,
        porcentajeGanadoAjustado: tieneAjusteManual ? porcentajeGanado : null
      };
    }

    return estudiantes.map((estudiante) => {
      const componentes = detalles.map((detalleItem) => calcularComponente(detalleItem, estudiante));
      const totalEvaluado = Math.min(100, componentes.reduce((acc, item) => acc + Number((item as any).porcentajeEvaluado || 0), 0));
      const totalGanado = Math.min(100, componentes.reduce((acc, item) => acc + Number(item.porcentajeGanado || 0), 0));
      const promedioGeneral = componentes.length ? (totalGanado / Math.max(1, componentes.reduce((acc, item) => acc + Number(item.porcentajeComponente || 0), 0))) * 100 : 0;
      return {
        key: String(estudiante.EstudianteId),
        estudiante,
        nombre: getFullName(estudiante),
        identificacion: estudiante.Identificacion || "",
        totalEvaluado,
        totalGanado,
        promedioGeneral,
        componentes
      };
    });

}

export function prepararContextoNotas(dataRaw: any, estudiantesPermitidos: Set<number> | null = null) {
        if (!dataRaw) return dataRaw;
        const filtrarPorEstudiante = (rows: any) => {
          const list = Array.isArray(rows) ? rows : [];
          if (!estudiantesPermitidos) return list;
          return list.filter((row: any) => estudiantesPermitidos.has(Number(row.EstudianteId)));
        };
        const detalles = Array.isArray(dataRaw.detalles) ? dataRaw.detalles : [];
        const actividades = Array.isArray(dataRaw.actividades) ? dataRaw.actividades : [];
        const examDetalleIds = new Set(
          detalles
            .filter((d: any) => isTipoExamenSeguimiento(getTipoSeguimientoFromDetalle(d)))
            .map((d: any) => Number(d.EstructuraGrupoDetalleId || 0))
            .filter((id: number) => id > 0)
        );
        const actividadesAjustadas = actividades.map((a: any) => ({ ...a }));
        const porDetalle = new Map<number, any[]>();
        for (const act of actividadesAjustadas) {
          const detalleId = Number(act.EstructuraGrupoDetalleId || 0);
          if (!examDetalleIds.has(detalleId)) continue;
          const arr = porDetalle.get(detalleId) || [];
          arr.push(act);
          porDetalle.set(detalleId, arr);
        }
        for (const [detalleId, acts] of porDetalle.entries()) {
          const detalle = detalles.find((d: any) => Number(d.EstructuraGrupoDetalleId || 0) === Number(detalleId));
          const porcentajeComponente = Number(detalle?.Porcentaje || 0);
          const n = acts.length || 1;
          const porcentajePorActividad = porcentajeComponente > 0 ? (porcentajeComponente / n) : 0;
          acts.forEach((act: any) => {
            act.PorcentajeDentroRubro = porcentajePorActividad;
          });
        }
        return {
          ...dataRaw,
          plantillas: Array.isArray(dataRaw.plantillas) ? dataRaw.plantillas : [],
          estudiantes: filtrarPorEstudiante(dataRaw.estudiantes),
          planeamientos: Array.isArray(dataRaw.planeamientos) ? dataRaw.planeamientos : [],
          detalles,
          indicadores: Array.isArray(dataRaw.indicadores) ? dataRaw.indicadores : [],
          seguimientos: filtrarPorEstudiante(dataRaw.seguimientos),
          actividades: actividadesAjustadas,
          actividadIndicadores: Array.isArray(dataRaw.actividadIndicadores) ? dataRaw.actividadIndicadores : [],
          notasActividades: filtrarPorEstudiante(dataRaw.notasActividades),
          asistenciaRegistros: filtrarPorEstudiante(dataRaw.asistenciaRegistros),
          componenteAjustesManuales: filtrarPorEstudiante(dataRaw.componenteAjustesManuales),
          mensajesSeguimiento: filtrarPorEstudiante(dataRaw.mensajesSeguimiento)
        };

}
