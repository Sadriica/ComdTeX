---
title: "Notas sobre grafos expansores"
tags: [grafos, notas]
---

# Notas sobre grafos expansores

Un grafo es _expansor_ si todo subconjunto pequeño tiene muchos vecinos. El tiempo de mezcla satisface

$$
t_{\mathrm{mez}} \le \frac{\log n}{\gamma}
$$ {#eq:mez}

:::definition[Brecha espectral]{#def:brecha}
La brecha espectral de $G$ es $\gamma = 1-\lambda_2$.
:::

:::theorem[Desigualdad de Cheeger]{#thm:cheeger}
Para todo grafo regular, $\gamma/2 \le h(G) \le \sqrt{2\gamma}$.
:::

> [!TIP]
> Revisa también [[mixing-times]] y la ecuación @eq:mez.

- [ ] Traducir el resumen al español
$$
