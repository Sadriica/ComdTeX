# Archivos largos: una materia, un archivo

El caso: vas escribiendo una asignatura clase a clase sobre el mismo `.md`, y a
los dos meses tiene 3000 líneas. Estas son las herramientas para que siga siendo
manejable.

---

## Plegado por secciones

Cada encabezado se pliega desde su línea hasta justo antes del siguiente
encabezado del mismo nivel o superior. Plegar `## Clase 3` esconde esa clase y
nada más.

Se usa desde la flecha del margen izquierdo, o con los atajos de Monaco:

| Atajo | Acción |
|---|---|
| `Ctrl+Shift+[` | Plegar la sección del cursor |
| `Ctrl+Shift+]` | Desplegar |
| `Ctrl+K Ctrl+0` | Plegar todo |
| `Ctrl+K Ctrl+J` | Desplegar todo |

Los encabezados dentro de bloques de código se ignoran: un `# comentario` en un
script de shell no es una sección.

**El plegado se recuerda por archivo**, junto con el cursor y el scroll. Cambias
de pestaña y vuelves, y todo sigue como lo dejaste. (En versiones anteriores se
perdía en cada cambio de pestaña, que es por lo que los bloques parecían
desplegarse solos.)

Los bloques `:::excalidraw` se pliegan solos la primera vez que abres un archivo,
porque su escena es una única línea de base64 que ocupa media pantalla. Se puede
desactivar en Configuración → Editor.

## El outline como índice

El panel **Vistas → Esquema** lista los encabezados y ahora tiene **filtro**:
escribe "clase 7" y saltas directo. Con el filtro activo se desactiva el arrastrar
para reordenar, porque reordenar una lista filtrada movería secciones que no ves.

## Dividir el archivo cuando ya pesa demasiado

**Ctrl+P → "Dividir documento en secciones (##)"**

Corta el documento por sus `##` y crea un archivo por sección junto al original.
El original se queda con su preámbulo (frontmatter, introducción) y una lista de
transclusiones:

```markdown
---
title: Álgebra II
---

![[algebra-clase-1]]

![[algebra-clase-2]]

![[algebra-clase-3]]
```

**La vista previa no cambia**: las transclusiones incluyen el contenido, así que
el documento renderizado es el mismo de antes. Lo que ganas es que cada clase es
un archivo independiente, enlazable con `[[…]]` y buscable por separado.

Salvaguardas:

- Pide confirmación antes de tocar nada.
- Si alguno de los nombres destino ya existe, **no divide nada** y te avisa. No
  sobrescribe.
- Nada se pierde: el preámbulo más las secciones reconstruyen el original.

## Vistas derivadas en vez de mantenidas a mano

Para no llevar a mano una lista de tareas o un calendario de la materia, declara
un archivo generado en las reglas de la carpeta, ver
[folder-rules.md](folder-rules.md).

## Continuación de listas y tablas

Al pulsar Enter se mantiene la estructura: el guion, el número (que se
incrementa), la casilla `- [ ]`, la cita `>` o una fila de tabla con el mismo
número de columnas. Sobre un marcador vacío, Enter sale de la lista en vez de
añadir otro vacío; si estaba anidado, sube un nivel.

Se puede desactivar en Configuración → Editor.

Para tablas descuadradas (filas con menos columnas que la cabecera) hay un aviso
en el editor y el comando **Normalizar tabla**, que rellena las celdas que faltan
y realinea los `|` en un solo paso de deshacer.
