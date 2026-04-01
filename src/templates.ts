export interface Template {
  id: string
  name: string
  description: string
  icon: string
  content: string
}

const today = () => new Date().toISOString().split("T")[0]

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Vacío",
    description: "Archivo en blanco",
    icon: "□",
    content: "",
  },
  {
    id: "article",
    name: "Artículo",
    description: "Documento académico con abstract y secciones",
    icon: "📄",
    content: `---
title: Título del artículo
author:
date: ${today()}
tags: []
---

## Abstract

Breve descripción del contenido.

## 1. Introducción

## 2. Desarrollo

## 3. Resultados

## 4. Conclusiones

## Referencias
`,
  },
  {
    id: "notes",
    name: "Apuntes de clase",
    description: "Notas con definiciones, teoremas y ejemplos",
    icon: "📒",
    content: `---
title:
author:
date: ${today()}
tags: []
---

:::definition
**Definición:**
:::

:::theorem
**Teorema:**
:::

:::proof

:::

:::example
**Ejemplo:**
:::
`,
  },
  {
    id: "problemset",
    name: "Tarea / Problem set",
    description: "Hoja de ejercicios numerados",
    icon: "✏️",
    content: `---
title: Tarea
author:
date: ${today()}
tags: []
---

:::exercise
**Problema 1.**
:::

:::exercise
**Problema 2.**
:::

:::exercise
**Problema 3.**
:::
`,
  },
  {
    id: "theoremsheet",
    name: "Hoja de teoremas",
    description: "Referencia rápida de resultados matemáticos",
    icon: "∑",
    content: `---
title: Hoja de teoremas
author:
date: ${today()}
tags: []
---

:::theorem[Nombre]
**Enunciado:**
:::

:::lemma
**Lema auxiliar:**
:::

:::corollary
**Corolario:**
:::
`,
  },
  {
    id: "research",
    name: "Nota de investigación",
    description: "Con BibTeX y referencias",
    icon: "🔬",
    content: `---
title:
author:
date: ${today()}
tags: []
---

## Contexto

## Idea principal

## Desarrollo

$$
% ecuación principal
$$ {#eq:main}

Como se muestra en @eq:main...

## Referencias

[@key]
`,
  },
]
