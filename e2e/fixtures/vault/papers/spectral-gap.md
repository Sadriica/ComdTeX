---
title: "Spectral gaps of random walks on expander graphs"
author: "Ada Okafor"
date: 2026-10-12
tags: [graph-theory, spectral, draft]
abstract: "We bound the spectral gap of lazy random walks on regular graphs."
---

# Introduction {#sec:intro}

Let $G=(V,E)$ be a $d$-regular graph on $n$ vertices. The *spectral gap* controls how fast a random walk mixes [@levin2017][@lubotzky1988]. See also [[mixing-times]] and [[expander-notes]].

> [!NOTE]
> All graphs in this draft are finite, simple and connected. Macros come from [[macros]].

The normalized adjacency matrix $A$ has eigenvalues $1=\lambda_1\ge\lambda_2\ge\dots\ge\lambda_n\ge -1$, and the gap is

$$
\gamma(G) = 1-\lambda_2 .
$$ {#eq:gap}

# Main results {#sec:main}

:::definition[Expander]{#def:expander}
A $d$-regular graph $G$ is an $\varepsilon$-expander if $\gamma(G)\ge\varepsilon$.
:::

:::lemma[Cheeger-type bound]{#lem:cheeger}
For every $S\subseteq V$ with $|S|\le n/2$ we have
$$
\frac{|E(S,\bar S)|}{d|S|} \ge \frac{\gamma(G)}{2}.
$$ {#eq:cheeger}
:::

:::proof
Apply the variational characterization of $\lambda_2$ to the test vector $f=\mathbf 1_S-\tfrac{|S|}{n}\mathbf 1$. Equation @eq:gap then gives the claim. $\square$
:::

:::theorem[Mixing time]{#thm:mixing}
If $G$ is an $\varepsilon$-expander (Definition @def:expander) then the lazy walk mixes in
$$
t_{\mathrm{mix}} \le \frac{1}{\varepsilon}\log\frac{n}{\delta}
$$ {#eq:mixing}
steps. This follows from Lemma @lem:cheeger and @eq:cheeger.
:::

:::proof
Combine @lem:cheeger with the standard bound of [@levin2017, p. 58].
:::

# Experiments {#sec:exp}

Figure @fig:spectrum shows the empirical eigenvalues, and Table @tbl:results summarizes the runs.

![Empirical spectrum of a random 4-regular graph.](figures/spectrum.svg){#fig:spectrum}

| Graph | $n$ | $d$ | $\gamma(G)$ |
|---|---|---|---|
| Petersen | 10 | 3 | 0.667 |
| Paley(13) | 13 | 6 | 0.486 |
| Random 4-reg | 200 | 4 | 0.172 |
{#tbl:results}

The sampling routine, in Python:

```python
import numpy as np

def spectral_gap(A):
    d = A.sum(axis=1)
    W = A / d[:, None]
    lam = np.sort(np.linalg.eigvals(W).real)[::-1]
    return 1 - lam[1]
```

The pipeline looks like this:

```mermaid
flowchart LR
  A[Sample graph] --> B[Build matrix]
  B --> C{Connected?}
  C -- yes --> D[Eigendecompose]
  C -- no --> A
  D --> E[Record gap]
```

:::plot[Gap against degree]
f(x) = 1 - 2*sqrt(x-1)/x
g(x) = 0.5
range: [3, 12]
:::

:::truth[De Morgan]
¬(p ∧ q)
¬p ∨ ¬q
:::

:::commdiag[Naturality square]
A -> B [f]
A -> C [g]
B -> D [h]
C -> D [k]
:::

# Todo

- [x] Prove Lemma @lem:cheeger
- [ ] Add the Ramanujan comparison
- [ ] Re-run experiments with $n=10^4$ #todo

# References {#sec:refs}

