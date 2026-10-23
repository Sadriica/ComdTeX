---
title: "On the typesetting of long mathematical manuscripts"
author: "Ada Okafor, Lin Wei"
date: 2026-10-12
tags: [typography, draft]
abstract: "We examine how measure, leading and hyphenation shape the reading of a mathematical manuscript, and give a small set of defaults that hold up on screen and on paper."
---

# Introduction

Typographic quality is rarely noticed when it is present, and almost always noticed when it is absent. A reader who meets a paragraph of exceptionally uninterrupted prose, with words such as characteristically, incomprehensibility and internationalization, should not stumble over the line breaks. Inline mathematics such as $\lambda_2 \le 1-\varepsilon$ and $\sum_{k=1}^{n} k = n(n+1)/2$ must sit at the same visual size as the surrounding words, and a footnote[^1] should stay out of the way.

A second paragraph follows, to show the paragraph spacing.
This line is a soft break inside the same paragraph.

## Background

Some text with `inline code`, a [link to somewhere](https://example.org), ==a highlighted phrase==, and *emphasis* next to **strong** text.

### Third level heading

Text under a third level heading.

#### Fourth level heading

Text under a fourth level heading.

##### Fifth level heading

Text under a fifth level heading.

###### Sixth level heading

Text under a sixth level heading.

> A quotation set in the margin of the text, long enough to wrap onto a second line so the rule and indent can be judged properly.

- First item of an unordered list
- Second item, which is long enough to wrap onto another line so the hanging indent shows clearly in the preview
  - A nested item
- Third item

1. First ordered item
2. Second ordered item

> [!TIP]
> A compact callout with a short body.

> [!WARNING] Careful with this
> A warning callout that has its own title.

# Results

:::theorem[Main result]{#thm:main}
Let $G$ be a connected graph. Then for every $\varepsilon>0$ there is an $n_0$ such that
$$
\gamma(G_n) \ge \varepsilon \quad\text{for all } n \ge n_0.
$$ {#eq:main}
:::

:::proof
By Equation @eq:main and a compactness argument. $\square$
:::

:::definition[Mixing]
A walk *mixes* when its distribution is close to stationary.
:::

:::example
The cycle $C_n$ does not mix quickly.
:::

:::remark
This is an unnumbered remark.
:::

| Method | Accuracy | Time (s) |
|:---|---:|---:|
| Baseline | 0.812 | 12.4 |
| Ours | 0.874 | 9.1 |
| Ours + tuning | 0.901 | 14.0 |
{#tbl:acc}

A long display equation that must scroll rather than overflow the page:

$$
\sum_{i=1}^{n} \sum_{j=1}^{n} \sum_{k=1}^{n} a_{ijk} x_i y_j z_k + \sum_{i=1}^{n} \sum_{j=1}^{n} \sum_{k=1}^{n} b_{ijk} x_i y_j z_k + \sum_{i=1}^{n} \sum_{j=1}^{n} c_{ij} x_i y_j
$$

```ts
interface Walk {
  steps: number
  // the lazy walk stays put with probability 1/2
  lazy: boolean
}

export function mix(w: Walk): string {
  return w.lazy ? `lazy-${w.steps}` : "plain"
}
```

```python
def gap(A):
    """Spectral gap."""
    return 1 - sorted(eigs(A))[-2]
```

:::pseudocode[Power iteration]
input: matrix A, tolerance eps
repeat
  x <- A x / norm(A x)
until converged
return x
:::

[^1]: A footnote that is long enough to wrap, so that the hanging indent and the smaller size can be checked.
