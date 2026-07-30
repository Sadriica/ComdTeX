# Reglas por carpeta y archivos generados

Una carpeta puede llevar sus propias convenciones: la plantilla con la que
empiezan sus notas, cómo se nombran, qué frontmatter traen por defecto, y qué
vistas (tareas, calendario, índice) se generan a partir de ellas.

Está pensado para el caso "una carpeta por materia": abres la carpeta, creas una
nota, y ya viene con la plantilla, el nombre con fecha y el `materia:` puesto.

---

## Dónde viven las reglas

En un archivo **`.comdtex-folder.json` dentro de la propia carpeta**. Empieza por
punto, así que ComdTeX lo oculta del árbol de archivos y de la búsqueda del
vault; lo ves desde el gestor de archivos del sistema y viaja con la carpeta si
la mueves o la subes a git.

```
mi-vault/
  algebra/
    .comdtex-folder.json      ← las reglas de esta carpeta
    2026-03-04-derivadas.md
    2026-03-11-integrales.md
    _tareas.md                ← generado
```

## Cómo se crean

Clic derecho sobre la carpeta → **Reglas de la carpeta…**

El diálogo tiene cuatro partes. Ninguna es obligatoria: puedes usar solo el
patrón de nombre, o solo los archivos generados.

### Plantilla por defecto

Qué contenido trae una nota nueva creada en esta carpeta. La lista incluye las
plantillas de fábrica y las tuyas (ver *Crear una plantilla desde un archivo*).

> Si creas la nota con **Nuevo desde plantilla…** y eliges una plantilla a mano,
> gana tu elección: la de la carpeta solo se aplica cuando no dices otra cosa.

### Patrón de nombre

Cómo se nombra el archivo a partir de lo que escribes. Con el patrón
`{{date:YYYY-MM-DD}}-{{title}}`, teclear `derivadas` crea
`2026-03-04-derivadas.md`.

Variables disponibles:

| Variable | Resultado |
|---|---|
| `{{title}}` | lo que escribiste |
| `{{date}}` | `2026-03-04` |
| `{{date:YYYY-MM-DD}}` | fecha con formato propio (`YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`) |
| `{{year}}` | `2026` |
| `{{time}}` | `15:42` |

Si escribes la extensión (`derivadas.md`), se respeta.

### Frontmatter por defecto (YAML)

Claves que se añaden al frontmatter de las notas nuevas:

```yaml
materia: Álgebra II
tags: ["algebra"]
```

**Solo se añaden las claves que el documento no defina ya.** Si la plantilla ya
trae `title:`, el de la carpeta no lo pisa.

### Archivos generados

Ver la sección siguiente.

## Herencia

Las subcarpetas heredan **campo a campo**, y gana la carpeta más cercana:

```
mate/            defaultTemplate: "clase"     frontmatter: {profesor: Ruiz}
mate/algebra/    filenamePattern: "{{date}}-{{title}}"
```

Una nota creada en `mate/algebra/` usa la plantilla `clase` (heredada), el patrón
de nombre de `algebra`, y `profesor: Ruiz` (heredado).

**Los archivos generados NO se heredan.** Nombran un archivo concreto dentro de
la carpeta que los declaró; si se heredasen, cada subcarpeta acabaría con una
copia del índice del padre.

---

## Archivos generados

Son vistas construidas a partir de las notas de alrededor. Se declaran en el
diálogo de reglas con tres campos: **nombre del archivo**, **tipo** y **alcance**.

| Tipo | Qué produce |
|---|---|
| **Tareas** | Todas las `- [ ]` agrupadas por archivo, con enlace `[[nota]]`, pendientes primero y un recuento arriba |
| **Calendario** | Las notas agrupadas por mes y fecha, de más reciente a más antigua |
| **Índice** | Lista alfabética de las notas con su título |

El **alcance** es `Solo esta carpeta` (por defecto) o `Todo el vault`.

La fecha de una nota para el calendario sale de su frontmatter `date:` o del
prefijo del nombre (`2026-03-04-clase.md`). Las que no tienen fecha se agrupan al
final bajo *Sin fecha* — no se descartan.

### Cómo se regeneran

No es automático. Se ejecuta cuando tú lo pides:

- **Menú Vault → Regenerar archivos de carpeta**
- **Ctrl+P → "Regenerar archivos de carpeta"**

Regenera las reglas de la carpeta del archivo que tengas abierto.

### La protección contra sobrescritura

Cada archivo generado empieza así:

```markdown
<!-- comdtex:generated -->
<!-- Este archivo se regenera automáticamente. Los cambios manuales se perderán. -->
```

**ComdTeX solo sobrescribe un archivo si está vacío o si lleva esa marca.** Si
borras la marca y escribes ahí, la regeneración se salta ese archivo y te avisa,
en vez de destruir lo que escribiste. Es la vía para "adoptar" un archivo
generado y hacerlo tuyo.

---

## Crear una plantilla desde un archivo

Clic derecho sobre un archivo → **Guardar como plantilla…**

Toma el contenido actual y sustituye por variables lo que es propio de *esa* nota
en concreto:

- el `title:` del frontmatter → `{{title}}`
- las fechas ISO del frontmatter → `{{date}}`
- el `# H1`, **solo si repite el título o el nombre del archivo** → `{{title}}`

El cuerpo no se toca. Una fecha mencionada dentro de un párrafo es contenido, no
un campo, y reescribirla corrompería la plantilla en silencio.

La plantilla queda disponible en el diálogo de plantillas y en la lista de
plantilla por defecto de las reglas de carpeta.

---

## Formato del archivo, para editarlo a mano

```json
{
  "version": 1,
  "defaultTemplate": "clase",
  "filenamePattern": "{{date:YYYY-MM-DD}}-{{title}}",
  "frontmatter": {
    "materia": "Álgebra II",
    "tags": ["algebra"]
  },
  "generated": [
    { "file": "_tareas.md", "type": "tasks", "scope": "folder" },
    { "file": "_calendario.md", "type": "calendar", "scope": "folder" }
  ]
}
```

El parser es tolerante: una entrada mal escrita se descarta y el resto se aplica
igual. Un `file` con `/`, `\` o `..` se rechaza — un archivo generado no puede
escribir fuera de su propia carpeta.
