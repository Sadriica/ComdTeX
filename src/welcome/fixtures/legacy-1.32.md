# Mi Vault: ComdTeX

> Este archivo es tuyo. Edítalo, bórralo, o úsalo como punto de partida.
> Es tu área de juego para explorar todas las funciones de ComdTeX.

---

## Shorthands: escribe y pulsa Tab

Los shorthands son funciones cortas que se expanden a LaTeX. Cada uno se
auto-envuelve en math, así que no necesitas escribir `$` para los más comunes:

La fracción frac(1, n+1) se hace pequeña cuando n crece.

La raíz sqrt(2) es irracional.

El límite fundamental: lim(x, 0), escrito así, sin nada alrededor.

La sumatoria sum(n=1, 100) llega a 5050.

La integral int(0, 1) tiene un valor entre 0 y 1.

La derivada parcial pder(u, t) aparece en la ecuación del calor.

La derivada total der(f, x) y la inversa inv(A).

La matriz identidad 3×3:

mat(1,0,0, 0,1,0, 0,0,1)

Letras de pizarra: bb(R), bb(N), bb(Z). Caligrafía: cal(L), cal(F).

> **Tip:** para una fórmula completa con varios símbolos conectados (igualdades,
> operadores como `\cdot` o `\implies`, letras griegas como `\varepsilon`),
> envuelve **todo el bloque** en `$...$` y los shorthands siguen funcionando dentro:
>
> `$frac(1, sqrt(2 \pi)) sup(e, -sup(x, 2)/2)$`
>
> renderiza la densidad gaussiana entera como una sola expresión matemática.

---

## Entornos matemáticos

Escribe `:::tipo[Título]` para abrir un entorno y `:::` para cerrarlo.
Añade `sm` o `lg` antes del tipo para cambiar el tamaño.

:::definition[Función continua]
Una función f es **continua** en un punto x₀ cuando el límite existe y coincide
con el valor de la función:

$$lim(x, x_0) f(x) = f(x_0)$$ {#eq:continua}
:::

:::theorem[Suma de continuas]
Si f y g son continuas en x₀, entonces f + g también lo es.
:::

:::proof
Aplica @eq:continua a cada función y suma los límites. $\square$
:::

:::remark
Los entornos `proof`, `remark` y `note` no llevan número automático.
Los demás (`theorem`, `lemma`, `corollary`, `proposition`, `definition`,
`example`, `exercise`) sí.
:::

---

## Ecuaciones y referencias cruzadas

Usa `$$...$$` para ecuaciones en bloque (display math). Se numeran solas, y con
`{#eq:etiqueta}` puedes referenciarlas desde el texto:

$$sum(n=0, \infty) sup(x, n) = frac(1, 1-x)$$ {#eq:geom}

$$sup(e, i\pi) + 1 = 0$$ {#eq:euler}

La serie geométrica (@eq:geom) y la identidad de Euler (@eq:euler) son dos de las
fórmulas más elegantes de las matemáticas.

**Etiquetas en línea:** también puedes etiquetar matemáticas inline:

$lim(x, 0) frac(sin(x), x) = 1$ {#eq:limite-fundamental}

y referenciar el resultado en (@eq:limite-fundamental) desde cualquier párrafo.

---

## Bloques de código

Tres backticks abren un bloque con resaltado. El idioma va después de los backticks:

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

```haskell
factorial :: Integer -> Integer
factorial 0 = 1
factorial n = n * factorial (n - 1)
```

Para código en línea usa una sola backtick: `O(n log n)`.

También puedes usar la sintaxis uniforme `:::code` (con o sin lenguaje):

:::code python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
:::

:::code
texto plano sin resaltado
:::

---

## Pseudocódigo → flowchart automático

Escribe el algoritmo en pseudocódigo y ComdTeX lo convierte en un diagrama de
flujo Mermaid:

El bloque `:::pseudocode` muestra código numerado con sintaxis resaltada y
un flowchart Mermaid plegable. Para un **flowchart visual directamente** usa
`:::flowchart` con la misma sintaxis:

:::flowchart[Búsqueda binaria]
ALGORITHM BinarySearch(A, target)
    INPUT array A ordenado, valor target
    lo ← 0
    hi ← length(A) - 1
    WHILE lo ≤ hi
        mid ← (lo + hi) / 2
        IF A[mid] = target
            RETURN mid
        ELSE IF A[mid] < target
            lo ← mid + 1
        ELSE
            hi ← mid - 1
        ENDIF
    ENDWHILE
    RETURN -1
END
:::

Versión con código numerado:

:::pseudocode[Búsqueda binaria]
ALGORITHM BinarySearch(A, target)
    INPUT array A ordenado, valor target
    lo ← 0
    hi ← length(A) - 1
    WHILE lo ≤ hi
        mid ← (lo + hi) / 2
        IF A[mid] = target
            RETURN mid
        ELSE IF A[mid] < target
            lo ← mid + 1
        ELSE
            hi ← mid - 1
        ENDIF
    ENDWHILE
    RETURN -1
END
:::

---

## Tablas de verdad

Pasa una expresión lógica y ComdTeX genera la tabla con todas las combinaciones:

:::truth[Equivalencia: contrapositiva]
(p → q) ↔ (¬q → ¬p)
:::

Operadores soportados: `¬` `∧` `∨` `→` `↔` (también `!`, `&&`, `||`, `->`, `<->`).

---

## Grafos

Sintaxis simple para grafos dirigidos / no dirigidos / con pesos:

:::graph[Camino mínimo]
A -- B : 4
A -- C : 2
B -- C : 1
B -- D : 5
C -- D : 8
D -- E : 3
:::

`--` es no dirigido, `->` dirigido, `: peso` añade etiqueta numérica.

---

## Plot de funciones

Sin dependencias externas: el parser está integrado y NO usa `eval`:

:::plot[Densidad gaussiana]
f(x) = exp(-x^2 / 2) / sqrt(2 * pi)
xmin = -4
xmax = 4
:::

Funciones disponibles: `sin`, `cos`, `tan`, `exp`, `ln`, `log`, `sqrt`,
`abs`. Constantes: `e`, `pi`.

---

## Diagramas conmutativos

Para teoría de categorías, álgebra homológica o cualquier diagrama con flechas etiquetadas:

:::commdiag[Pullback]
A -> B [f]
A -> C [g]
B -> D [h]
C -> D [k]
:::

Estilos de flecha: `->` `<-` `<->` `->>` (epi) `>->` (mono) `==>` (doble).

---

## Wikilinks y transclusión

Enlaza otras notas del vault con `[[nombre-de-nota]]`. Haz clic en el preview para navegar.
La pestaña **←** de la barra lateral muestra qué notas enlazan a la activa.

Para **incrustar** el contenido de otra nota, usa `![[otra-nota]]`, se expande en línea
durante el render. Ideal para tesis con un archivo principal y capítulos separados.

---

## Callouts

> [!note]
> Los callouts son bloques destacados con icono. Tipos disponibles:
> `note` `tip` `warning` `important` `danger` `success` `question` `quote`.

> [!tip] Atajo
> Pulsa `Ctrl+Shift+P` para la paleta de comandos, `Ctrl+P` para abrir archivos, `Ctrl+Shift+F` para búsqueda
> en todo el vault, `Ctrl+Tab` para navegar pestañas.

---

## Tabla de ejemplo

table(Concepto, Definición, Ejemplo)

---

## Siguientes pasos

- Abre `macros.md` desde **Vault → Editar macros.md** para definir tus propios comandos LaTeX
- Añade entradas en `references.bib` y cita con `[@clave]`
- Crea nuevas notas con el botón **+** en la barra lateral
- Explora las plantillas en **Archivo → Nuevo desde plantilla**
- Compila a PDF con `Ctrl+Shift+B` (motor WASM integrado, sin LaTeX en el sistema)
