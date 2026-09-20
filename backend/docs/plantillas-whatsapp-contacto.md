# Contactos de consultas en notificaciones

## Orden de activación

1. Ejecutar `backend/sql/2026-09-14_whatsapp_contacto_institucion.sql` en la base de datos de Profe360. Se puede repetir; agrega únicamente la columna opcional `Institucion.WhatsAppContacto`.
2. Desplegar backend y frontend actualizados.
3. En Instituciones, guardar el teléfono principal y el nuevo «WhatsApp del colegio para consultas» de cada colegio. Este campo es independiente del número del canal de envío.
4. Preparar las tres plantillas en Meta/2Chat con el texto de abajo. Conservar las variables 1 a 8 en su posición actual. Las nuevas son {{9}} = teléfono principal y {{10}} = WhatsApp de consultas.
5. Cuando estén aprobadas, actualizar en Profe360 el UUID y la cantidad de parámetros a 10 de cada asociación correspondiente. La plantilla académica se utiliza para TAREA, PROYECTO, COTIDIANO, EXAMENES y COMUNICADO: actualizar todas las asociaciones que la utilicen, en el canal compartido o propio que corresponda. COMUNICADO conserva el nombre `notificacion_academica_general`.
6. Realizar un envío controlado de cada tipo antes de enviar masivamente.

No cambiar a 10 una asociación que todavía apunte a una plantilla de 8 variables. Las asociaciones de 8 siguen enviando los mismos datos y el texto anterior. Coordinar la aprobación externa y el cambio del UUID/cantidad para evitar que el proveedor y Profe360 usen cantidades diferentes.

En WABA, un contacto vacío se envía como «No registrado». Completar los contactos antes de activar las nuevas plantillas. En canales QR el pie se agrega automáticamente y omite el medio que no esté registrado. Los correos y los PDF no cambian.

## Asistencia

```text
Estimad@ Padre/Madre o Encargado:

Por este medio le informamos la situación de asistencia del estudiante {{1}}, de la sección {{2}}, en la materia {{3}}, para la fecha {{4}}.

Detalle del reporte por lección(es):

{{5}}

Total de lecciones reportadas en el día: {{6}}.

Atentamente,

{{7}}
{{8}}

Para consultas, favor de llamar al teléfono {{9}} o al WhatsApp del colegio {{10}}.

Este número es solo informativo.

Gracias por su atención.
```

## Boleta de conducta

El colegio conserva la variable {{3}}; no renumerar por orden visual.

```text
Estimad@ Padre/Madre o Encargado:

BOLETA DE REPORTE DE CONDUCTA

Número: {{1}}
Fecha: {{2}}
Estudiante: {{4}}
Sección: {{5}}
Lugar del acontecimiento: {{6}}
Persona funcionaria: {{7}}

Detalle de los hechos:

{{8}}

Atentamente,
Colegio: {{3}}

Para consultas, favor de llamar al teléfono {{9}} o al WhatsApp del colegio {{10}}.

Este número es solo informativo.

La institución educativa agradece su atención.
```

## notificacion_academica_general

```text
Estimad@ Padre/Madre o Encargado:

Por este medio le informamos sobre un registro de {{1}} correspondiente al estudiante {{2}}, de la sección {{3}}, en la materia {{4}}, para la fecha {{5}}.

Detalle:

{{6}}

Atentamente,

{{7}}
{{8}}

Para consultas, favor de llamar al teléfono {{9}} o al WhatsApp del colegio {{10}}.

Este número es solo informativo.

Gracias por su atención.
```

## Verificación local

Compilar ambos proyectos. Con backend compilado, ejecutar `node --test tests/whatsapp-comunicados.test.cjs` dentro de backend. Las pruebas usan proveedor y base de datos simulados; no envían mensajes reales.
