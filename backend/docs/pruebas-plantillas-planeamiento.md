# Pruebas de plantillas de planeamiento

Cada referencia Word nueva debe verificarse antes de utilizarse masivamente:

1. Crear un planeamiento de prueba con habilidades distintas a las del ejemplo.
2. Guardarlo y exportar el Word.
3. Confirmar que conserva tablas, filas y columnas de la referencia.
4. Confirmar que el contenido nuevo aparece y que no quedó contenido pedagógico anterior.

La validación automática revisa la topología física del DOCX y normaliza espacios, saltos de línea, tabulaciones y celdas combinadas al comprobar el contenido. Por ello, cambios internos de serialización de Word no bloquean una exportación válida.

Si una plantilla falla, se registra el diagnóstico de tablas, filas por tabla, firma de columnas, contenido esperado/encontrado y residuos de referencia. El diagnóstico debe usarse para añadir un caso de regresión al módulo antes de cambiar reglas universales.
