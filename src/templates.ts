import { STORAGE_KEYS } from "./storageKeys"
import { getUiLanguage, type DocLang } from "./docLang"

export interface Template {
  id: string
  name: string
  description: string
  /** Key into the TemplateModal icon map (Lucide); unknown keys fall back to a file icon. */
  icon: string
  /** Spanish body (the original language of the built-ins). */
  content: string
  /** English body of a built-in, same structure as `content`. Absent for journal templates (English already). */
  contentEn?: string
  custom?: boolean
  // Journal templates target a real LaTeX class on export (see
  // `comdtex.texclass` in exporter.ts); they render in a separate section
  // of the template picker. Undefined means the classic basics section.
  category?: "journal"
}

const today = () => new Date().toISOString().split("T")[0]
const todayFormatted = (lang: DocLang = "es") =>
  new Date().toLocaleDateString(lang === "en" ? "en-US" : "es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
const currentYear = () => new Date().getFullYear().toString()
const now = () => new Date().toISOString()
const time = (lang: DocLang = "es") =>
  new Date().toLocaleTimeString(lang === "en" ? "en-US" : "es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  })

function formatDate(pattern: string, date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  return pattern
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()))
}

/** The body of a template in the interface language (Spanish when it has no English one). */
export function templateBody(tpl: Template, lang: DocLang = getUiLanguage()): string {
  return lang === "en" && tpl.contentEn !== undefined ? tpl.contentEn : tpl.content
}

export function processTemplateVariables(
  content: string,
  filename?: string,
  lang: DocLang = getUiLanguage(),
): string {
  const fileBasename = filename?.replace(/\.[^.]+$/, "") ?? ""
  return content
    .replace(/\{\{date:formatted\}\}/g, todayFormatted(lang))
    .replace(/\{\{date:([^}]+)\}\}/g, (_, pat) => formatDate(pat))
    .replace(/\{\{date\}\}/g, today())
    .replace(/\{\{year\}\}/g, currentYear())
    .replace(/\{\{time\}\}/g, time(lang))
    .replace(/\{\{datetime\}\}/g, now())
    .replace(/\{\{title\}\}/g, fileBasename || (lang === "en" ? "Untitled" : "Sin título"))
    .replace(/\{\{filename\}\}/g, fileBasename)
    .replace(/\{\{author\}\}/g, "")
    .replace(/\{\{today\}\}/g, today())
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Vacío",
    description: "Archivo en blanco",
    icon: "file",
    content: "",
  },
  {
    id: "article",
    name: "Artículo",
    description: "Documento académico con abstract y secciones",
    icon: "file-text",
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
    contentEn: `---
title: Article title
author:
date: ${today()}
tags: []
---

## Abstract

A short description of the contents.

## 1. Introduction

## 2. Development

## 3. Results

## 4. Conclusions

## References
`,
  },
  {
    id: "notes",
    name: "Apuntes de clase",
    description: "Notas con definiciones, teoremas y ejemplos",
    icon: "notebook",
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
    contentEn: `---
title:
author:
date: ${today()}
tags: []
---

:::definition
**Definition:**
:::

:::theorem
**Theorem:**
:::

:::proof

:::

:::example
**Example:**
:::
`,
  },
  {
    id: "problemset",
    name: "Tarea / Problem set",
    description: "Hoja de ejercicios numerados",
    icon: "pencil",
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
    contentEn: `---
title: Problem set
author:
date: ${today()}
tags: []
---

:::exercise
**Problem 1.**
:::

:::exercise
**Problem 2.**
:::

:::exercise
**Problem 3.**
:::
`,
  },
  {
    id: "theoremsheet",
    name: "Hoja de teoremas",
    description: "Referencia rápida de resultados matemáticos",
    icon: "sigma",
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
    contentEn: `---
title: Theorem sheet
author:
date: ${today()}
tags: []
---

:::theorem[Name]
**Statement:**
:::

:::lemma
**Auxiliary lemma:**
:::

:::corollary
**Corollary:**
:::
`,
  },
  {
    id: "research",
    name: "Nota de investigación",
    description: "Con BibTeX y referencias",
    icon: "flask-conical",
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
    contentEn: `---
title:
author:
date: ${today()}
tags: []
---

## Background

## Main idea

## Development

$$
% main equation
$$ {#eq:main}

As shown in @eq:main...

## References

[@key]
`,
  },
  {
    id: "paper-overleaf",
    name: "Paper Overleaf-ready",
    description: "Artículo con labels, figuras, tablas y estructura exportable",
    icon: "file-code",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper]
comdtex.main: true
---

# Abstract {#sec:abstract}

Resumen del resultado principal.

# Introduction {#sec:introduction}

Motivación y contribuciones.

# Main Result {#sec:main-result}

:::theorem[Resultado principal]{#thm:main}
Enunciado del resultado principal.
:::

:::proof
Demostración del resultado principal.
:::

$$
E = mc^2
$$ {#eq:main}

La ecuación @eq:main se usa en @thm:main.

| Símbolo | Significado |
|---|---|
| $E$ | Energía |
| $m$ | Masa |
{#tbl:notation}

# References {#sec:references}

[@key]
`,
    contentEn: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper]
comdtex.main: true
---

# Abstract {#sec:abstract}

A summary of the main result.

# Introduction {#sec:introduction}

Motivation and contributions.

# Main Result {#sec:main-result}

:::theorem[Main result]{#thm:main}
Statement of the main result.
:::

:::proof
Proof of the main result.
:::

$$
E = mc^2
$$ {#eq:main}

Equation @eq:main is used in @thm:main.

| Symbol | Meaning |
|---|---|
| $E$ | Energy |
| $m$ | Mass |
{#tbl:notation}

# References {#sec:references}

[@key]
`,
  },
  {
    id: "thesis",
    name: "Tesis / documento largo",
    description: "Documento principal con transclusiones por capítulos",
    icon: "book-open",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [tesis]
comdtex.main: true
---

# Introducción {#sec:intro}

![[chapters/01-introduccion]]

# Marco teórico {#sec:theory}

![[chapters/02-marco-teorico]]

# Resultados {#sec:results}

![[chapters/03-resultados]]

# Conclusiones {#sec:conclusions}

![[chapters/04-conclusiones]]

# Bibliografía {#sec:bibliography}

[@key]
`,
    contentEn: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [thesis]
comdtex.main: true
---

# Introduction {#sec:intro}

![[chapters/01-introduction]]

# Theoretical framework {#sec:theory}

![[chapters/02-theoretical-framework]]

# Results {#sec:results}

![[chapters/03-results]]

# Conclusions {#sec:conclusions}

![[chapters/04-conclusions]]

# Bibliography {#sec:bibliography}

[@key]
`,
  },
  {
    id: "journal-ieee",
    name: "Paper IEEE",
    description: "Conferencia IEEE (IEEEtran); exporta con la clase real",
    icon: "newspaper",
    category: "journal",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper, ieee]
comdtex.main: true
comdtex.texclass: ieeetran
---

# Abstract {#sec:abstract}

One-paragraph summary of the contribution.

# Introduction {#sec:introduction}

Motivation, related work and contributions.

# Method {#sec:method}

$$
y = f(x)
$$ {#eq:model}

# Results {#sec:results}

| Metric | Value |
|---|---|
| Accuracy | 0.0 |
{#tbl:results}

# Conclusion {#sec:conclusion}

# References {#sec:references}

[@key]
`,
  },
  {
    id: "journal-acm",
    name: "Paper ACM",
    description: "Conferencia ACM (acmart sigconf); exporta con la clase real",
    icon: "newspaper",
    category: "journal",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper, acm]
comdtex.main: true
comdtex.texclass: acmart
---

# Abstract {#sec:abstract}

One-paragraph summary of the contribution.

# Introduction {#sec:introduction}

# Background {#sec:background}

:::definition[Key concept]{#def:key}
Definition the paper builds on.
:::

# Approach {#sec:approach}

:::theorem[Main result]{#thm:main}
Statement of the main result, using @def:key.
:::

:::proof
Proof sketch.
:::

# Evaluation {#sec:evaluation}

# Conclusion {#sec:conclusion}

# References {#sec:references}

[@key]
`,
  },
  {
    id: "journal-elsevier",
    name: "Paper Elsevier",
    description: "Revista Elsevier (elsarticle); exporta con la clase real",
    icon: "newspaper",
    category: "journal",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper, elsevier]
comdtex.main: true
comdtex.texclass: elsarticle
---

# Abstract {#sec:abstract}

One-paragraph summary.

# Introduction {#sec:introduction}

# Materials and methods {#sec:methods}

$$
y = f(x)
$$ {#eq:model}

# Results {#sec:results}

# Discussion {#sec:discussion}

# Conclusions {#sec:conclusions}

# References {#sec:references}

[@key]
`,
  },
  {
    id: "journal-apa",
    name: "Manuscrito APA",
    description: "Manuscrito estilo APA 7 (apa7); exporta con la clase real",
    icon: "newspaper",
    category: "journal",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper, apa]
comdtex.main: true
comdtex.texclass: apa7
---

# Abstract {#sec:abstract}

One-paragraph summary (150-250 words).

# Introduction {#sec:introduction}

# Method {#sec:method}

## Participants {#sec:participants}

## Procedure {#sec:procedure}

# Results {#sec:results}

# Discussion {#sec:discussion}

# References {#sec:references}

[@key]
`,
  },
  {
    id: "journal-plos",
    name: "Paper PLOS",
    description:
      "PLOS ONE / PLOS Computational Biology; exporta sobre article con el preámbulo de PLOS",
    icon: "newspaper",
    category: "journal",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper, plos]
comdtex.main: true
comdtex.texclass: plos
comdtex.citestyle: vancouver
comdtex.domain: biology
---

# Abstract {#sec:abstract}

One-paragraph summary of the study (maximum 300 words).

# Author summary {#sec:author-summary}

Plain-language summary for a broad audience (PLOS Computational Biology only; delete for PLOS ONE).

# Introduction {#sec:introduction}

Background, the gap in knowledge and the aim of the study [@key].

# Materials and methods {#sec:methods}

Cultures of *Escherichia coli* were grown for si(16, h) in si(5, mL) of LB medium at si(37, degC), then diluted to a final concentration of si(10, mM) glucose.

# Results {#sec:results}

| Strain | Growth rate (1/h) | n |
|---|---|---|
| Wild type | 0.0 | 3 |
| Knockout | 0.0 | 3 |
{#tbl:growth}

As shown in @tbl:growth, the strains differ in growth rate. The pipeline is summarized in @fig:workflow.

![Overview of the analysis workflow](figures/workflow.png){#fig:workflow}

# Discussion {#sec:discussion}

# Supporting information {#sec:supporting}

S1 Fig. Caption of the first supporting figure.

# Acknowledgments {#sec:acknowledgments}

# References {#sec:references}

[@key]
`,
  },
  {
    id: "journal-bioinformatics",
    name: "Paper Bioinformatics",
    description: "Bioinformatics (OUP); exporta sobre article a dos columnas",
    icon: "newspaper",
    category: "journal",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper, bioinformatics]
comdtex.main: true
comdtex.texclass: bioinformatics
comdtex.citestyle: author-year
comdtex.domain: biology
---

# Abstract {#sec:abstract}

**Motivation:** Why the problem matters.

**Results:** What the method achieves.

**Availability and implementation:** Where to get the software (URL, license).

**Contact:** name@institution.org

**Supplementary information:** Supplementary data are available at *Bioinformatics* online.

# Introduction {#sec:introduction}

Background and related work [@key].

# Methods {#sec:methods}

Cultures of *Escherichia coli* were grown for si(16, h) in si(5, mL) of LB medium at si(37, degC), then diluted to a final concentration of si(10, mM) glucose.

# Results {#sec:results}

| Strain | Growth rate (1/h) | n |
|---|---|---|
| Wild type | 0.0 | 3 |
| Knockout | 0.0 | 3 |
{#tbl:growth}

As shown in @tbl:growth, the strains differ in growth rate. The pipeline is summarized in @fig:workflow.

![Overview of the analysis workflow](figures/workflow.png){#fig:workflow}

# Discussion {#sec:discussion}

# Funding {#sec:funding}

This work was supported by ...

# References {#sec:references}

[@key]
`,
  },
  {
    id: "journal-biorxiv",
    name: "Preprint bioRxiv",
    description: "Preprint de biología con afiliaciones (authblk) y números de línea",
    icon: "newspaper",
    category: "journal",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper, biorxiv]
comdtex.main: true
comdtex.texclass: biorxiv
comdtex.citestyle: vancouver
comdtex.domain: biology
---

# Abstract {#sec:abstract}

One-paragraph summary of the study.

# Introduction {#sec:introduction}

Background, the gap in knowledge and the aim of the study [@key].

# Methods {#sec:methods}

Cultures of *Escherichia coli* were grown for si(16, h) in si(5, mL) of LB medium at si(37, degC), then diluted to a final concentration of si(10, mM) glucose.

# Results {#sec:results}

| Strain | Growth rate (1/h) | n |
|---|---|---|
| Wild type | 0.0 | 3 |
| Knockout | 0.0 | 3 |
{#tbl:growth}

As shown in @tbl:growth, the strains differ in growth rate. The pipeline is summarized in @fig:workflow.

![Overview of the analysis workflow](figures/workflow.png){#fig:workflow}

# Discussion {#sec:discussion}

# Data availability {#sec:data-availability}

Where the data are deposited (accession numbers, DOI).

# Code availability {#sec:code-availability}

Repository URL and the version used in the paper.

# Author contributions {#sec:contributions}

# Competing interests {#sec:competing}

The authors declare no competing interests.

# References {#sec:references}

[@key]
`,
  },
  {
    id: "journal-bmc",
    name: "Paper BMC",
    description: "BMC Bioinformatics / Genome Biology; artículo con números de línea",
    icon: "newspaper",
    category: "journal",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [paper, bmc]
comdtex.main: true
comdtex.texclass: bmc
comdtex.citestyle: vancouver
comdtex.domain: biology
---

# Abstract {#sec:abstract}

**Background:** Why the problem matters.

**Results:** What the study found or the software does.

**Conclusions:** What follows from it.

# Background {#sec:background}

Context and aim of the study [@key].

# Methods {#sec:methods}

Cultures of *Escherichia coli* were grown for si(16, h) in si(5, mL) of LB medium at si(37, degC), then diluted to a final concentration of si(10, mM) glucose.

# Results {#sec:results}

| Strain | Growth rate (1/h) | n |
|---|---|---|
| Wild type | 0.0 | 3 |
| Knockout | 0.0 | 3 |
{#tbl:growth}

As shown in @tbl:growth, the strains differ in growth rate. The pipeline is summarized in @fig:workflow.

![Overview of the analysis workflow](figures/workflow.png){#fig:workflow}

# Discussion {#sec:discussion}

# Conclusions {#sec:conclusions}

# Declarations {#sec:declarations}

## Availability of data and materials {#sec:availability}

## Competing interests {#sec:competing}

The authors declare that they have no competing interests.

## Funding {#sec:funding}

## Authors' contributions {#sec:contributions}

# References {#sec:references}

[@key]
`,
  },
  {
    id: "lecture-notes-book",
    name: "Libro de apuntes",
    description: "Capítulo con definiciones, teoremas, ejercicios y backlinks matemáticos",
    icon: "library",
    content: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [apuntes, libro]
---

# Objetivos {#sec:goals}

- Objetivo 1
- Objetivo 2

# Definiciones {#sec:definitions}

:::definition[Concepto central]{#def:central}
Definición del concepto central.
:::

# Teoremas {#sec:theorems}

:::theorem[Teorema clave]{#thm:key}
Enunciado que usa @def:central.
:::

:::proof
Demostración.
:::

# Ejercicios {#sec:exercises}

:::exercise{#exc:one}
Aplica @thm:key a un caso concreto.
:::
`,
    contentEn: `---
title: "{{title}}"
author: "{{author}}"
date: {{date}}
tags: [notes, book]
---

# Goals {#sec:goals}

- Goal 1
- Goal 2

# Definitions {#sec:definitions}

:::definition[Central concept]{#def:central}
Definition of the central concept.
:::

# Theorems {#sec:theorems}

:::theorem[Key theorem]{#thm:key}
A statement that uses @def:central.
:::

:::proof
Proof.
:::

# Exercises {#sec:exercises}

:::exercise{#exc:one}
Apply @thm:key to a concrete case.
:::
`,
  },
]

const CUSTOM_TEMPLATES_KEY = STORAGE_KEYS.CUSTOM_TEMPLATES

export function loadCustomTemplates(): Template[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((tpl) => typeof tpl?.name === "string" && typeof tpl?.content === "string")
      .map((tpl, index) => ({
        id: String(tpl.id || `custom-${index}`),
        name: tpl.name,
        description: String(tpl.description || "Plantilla personalizada"),
        icon: String(tpl.icon || "◇"),
        content: tpl.content,
        custom: true,
      }))
  } catch {
    return []
  }
}

/**
 * Turn an existing document into a reusable template by replacing the parts that
 * are specific to *that* note with template variables.
 *
 * Deliberately conservative: it only rewrites things that are unambiguously
 * per-note metadata (the frontmatter `title`/`date`, the H1 when it matches the
 * title, and ISO dates in the frontmatter block). Body prose is left alone: a
 * date mentioned inside a paragraph is content, not a field, and rewriting it
 * would corrupt the template silently.
 */
export function parameterizeDocument(content: string, filename?: string): string {
  const stem = filename?.replace(/\.[^.]+$/, "") ?? ""
  const fmEnd = /^---\r?\n[\s\S]*?\r?\n---/.exec(content)
  let title: string | null = null

  let out = content
  if (fmEnd) {
    let block = fmEnd[0]
    const titleMatch = /^title:[ \t]*(.+)$/m.exec(block)
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, "")
      block = block.replace(/^title:[ \t]*.+$/m, "title: {{title}}")
    }
    // Any ISO date inside the frontmatter is a field value, safe to template.
    block = block.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "{{date}}")
    out = block + content.slice(fmEnd[0].length)
  }

  // The H1 only becomes {{title}} when it restates the note's identity:
  // otherwise it is a real heading that belongs in the template as-is.
  const h1 = /^#[ \t]+(.+)$/m.exec(out)
  if (h1) {
    const heading = h1[1].trim()
    if ((title && heading === title) || (stem && heading === stem)) {
      out = out.replace(/^#[ \t]+.+$/m, "# {{title}}")
    }
  }
  return out
}

export function saveCustomTemplate(template: Omit<Template, "id" | "custom">): Template[] {
  const templates = loadCustomTemplates()
  const next: Template = {
    ...template,
    id: `custom-${Date.now()}`,
    custom: true,
  }
  const updated = [...templates, next]
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated))
  return updated
}
