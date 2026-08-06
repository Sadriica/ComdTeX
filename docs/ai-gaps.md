# Huecos `{{?}}`: dejar espacios para que la IA los rellene

Escribiendo apuntes en clase sabes que ahí va una definición, un enunciado o un
ejemplo, pero no quieres pararte a escribirlo. Dejas un hueco, sigues, y lo
rellenas después.

```markdown
:::definition
Una función es continua en $a$ cuando {{? define continuidad con épsilon-delta}}
:::

El teorema fundamental dice que {{?}}
```

---

## La sintaxis

| Forma | Uso |
|---|---|
| `{{?}}` | Hueco sin más: la IA deduce del contexto qué va ahí |
| `{{? una pista}}` | Con indicación de qué quieres |

La pista puede ser cualquier texto hasta el `}}`.

Puedes insertar uno con **Ctrl+P → "Insertar hueco {{?}}"**.

Los huecos aparecen marcados en el editor con un aviso informativo (no un
error: un hueco pendiente es un recordatorio deliberado, no un fallo). Así ves
de un vistazo cuántos te quedan en un documento largo.

Un `{{?}}` dentro de un bloque de código ` ``` ` **no** cuenta como hueco: ahí
es documentación sobre la función, no una petición.

## Rellenarlos

Requiere tener el **asistente IA activado y configurado** (Configuración →
Asistente IA). ComdTeX no trae claves ni hace ninguna petición hasta que lo
enciendes tú.

| Comando | Qué hace |
|---|---|
| **Completar hueco con IA** | Rellena el hueco donde está el cursor |
| **Completar todos los huecos con IA** | Recorre el documento entero |

Ambos desde **Ctrl+P**. Mientras trabaja, la barra inferior muestra
*Completando huecos…*.

### Qué se le envía al modelo

Solo el bloque alrededor del hueco (unas 12 líneas a cada lado) más tu pista.
No se manda el documento entero: para un hueco local no mejora el resultado y
encarece cada llamada.

### Cómo se aplica

Por `executeEdits` de Monaco, igual que toda edición de IA en ComdTeX. Esto
significa que:

- **Un Ctrl+Z deshace el relleno**, como si lo hubieras escrito tú.
- **Nunca se escribe directamente al disco.** El cambio pasa por el editor y por
  el autoguardado normal.

Si el modelo devuelve la respuesta envuelta en un bloque de código, se
desenvuelve; si repite el marcador `{{?}}`, se elimina. Si devuelve vacío, el
hueco se queda como estaba.

---

## Por qué no es autocompletado tipo Copilot

Es una decisión deliberada, no una limitación:

- **Tú decides dónde puede escribir la IA.** No aparece texto que no pediste.
- **No se genera nada hasta que lo pides.** Sin latencia ni coste mientras
  escribes.
- **Tab sigue libre** para expandir shorthands (`frac` → `\frac{}{}`), que es el
  atajo central de ComdTeX. Un autocompletado fantasma competiría por esa tecla.
