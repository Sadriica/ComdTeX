// Shared matching rules for the completion sources: case and accent
// insensitive (the same fold the palette uses: `ñ` stays its own letter), and
// a typed query is a list of terms that may come in any order and be joined by
// space, hyphen, underscore, slash or dot. So `seccion` finds "Sección",
// `gap spectral` finds `spectral-gap`.

import { foldText } from "../fuzzy"

export { foldText }

/** The terms of a typed query, folded. Empty for an empty query. */
export function foldedTerms(query: string): string[] {
  return foldText(query)
    .split(/[\s\-_/.]+/)
    .filter(Boolean)
}

/** True when every term occurs somewhere in the (already folded) haystack. */
export function includesAllTerms(foldedHaystack: string, terms: readonly string[]): boolean {
  for (const term of terms) if (!foldedHaystack.includes(term)) return false
  return true
}

/**
 * Spanish names for the English vocabulary the editor completes (block types,
 * reference kinds, shorthands). Keyed by the English label; values are folded
 * aliases a Spanish writer would type.
 */
export const SPANISH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  theorem: ["teorema"],
  lemma: ["lema"],
  corollary: ["corolario"],
  proposition: ["proposicion"],
  definition: ["definicion"],
  example: ["ejemplo"],
  exercise: ["ejercicio"],
  proof: ["demostracion", "prueba"],
  remark: ["observacion", "comentario"],
  note: ["nota"],
  flowchart: ["diagrama de flujo", "flujo"],
  pseudocode: ["pseudocodigo", "algoritmo"],
  ":::truth": ["tabla de verdad", "verdad"],
  ":::seq": ["secuencia"],
  ":::graph": ["grafo", "grafica"],
  ":::plot": ["grafica", "funcion", "grafico"],
  ":::commdiag": ["diagrama conmutativo", "conmutativo"],
  table: ["tabla"],
  mat: ["matriz"],
  matf: ["matriz"],
  frac: ["fraccion", "cociente"],
  sqrt: ["raiz"],
  root: ["raiz"],
  sum: ["suma", "sumatoria"],
  int: ["integral"],
  lim: ["limite"],
  vec: ["vector"],
  abs: ["valor absoluto"],
  norm: ["norma"],
  ceil: ["techo"],
  floor: ["piso", "suelo"],
  sup: ["superindice", "potencia", "exponente"],
  sub: ["subindice"],
  hat: ["gorro", "sombrero"],
  bar: ["barra"],
  der: ["derivada"],
  pder: ["derivada parcial", "parcial"],
  inv: ["inversa"],
  trans: ["transpuesta"],
  si: ["unidad", "cantidad"],
  unit: ["unidad"],
  num: ["numero"],
  csv: ["datos", "tabla"],
  data: ["datos"],
  dataplot: ["grafica de datos"],
}

/** Spanish names for LaTeX commands (Greek letters, common symbols), by command name. */
export const LATEX_SPANISH: Readonly<Record<string, readonly string[]>> = {
  alpha: ["alfa"],
  beta: ["beta"],
  gamma: ["gamma"],
  delta: ["delta"],
  epsilon: ["epsilon", "epsilón"],
  varepsilon: ["epsilon"],
  zeta: ["zeta"],
  eta: ["eta"],
  theta: ["teta", "zeta"],
  vartheta: ["teta"],
  iota: ["iota"],
  kappa: ["capa", "kappa"],
  lambda: ["lambda", "landa"],
  mu: ["mu"],
  nu: ["nu"],
  xi: ["xi"],
  pi: ["pi"],
  rho: ["ro", "rho"],
  sigma: ["sigma"],
  tau: ["tau"],
  upsilon: ["ipsilon"],
  phi: ["fi", "phi"],
  varphi: ["fi"],
  chi: ["ji", "chi"],
  psi: ["psi"],
  omega: ["omega"],
  Gamma: ["gamma mayuscula"],
  Delta: ["delta mayuscula"],
  Sigma: ["sigma mayuscula"],
  Omega: ["omega mayuscula"],
  infty: ["infinito"],
  sqrt: ["raiz", "raiz cuadrada"],
  sum: ["suma", "sumatoria"],
  prod: ["producto", "productoria"],
  int: ["integral"],
  oint: ["integral de contorno"],
  lim: ["limite"],
  partial: ["parcial", "derivada parcial"],
  nabla: ["nabla", "gradiente"],
  frac: ["fraccion"],
  cdot: ["producto punto", "punto"],
  times: ["por", "producto cruz", "cruz"],
  leq: ["menor o igual"],
  geq: ["mayor o igual"],
  neq: ["distinto", "no igual"],
  approx: ["aproximado", "aproximadamente"],
  equiv: ["equivalente", "congruente"],
  forall: ["para todo"],
  exists: ["existe"],
  in: ["pertenece", "elemento"],
  notin: ["no pertenece"],
  subset: ["subconjunto"],
  subseteq: ["subconjunto o igual"],
  cup: ["union"],
  cap: ["interseccion"],
  emptyset: ["vacio", "conjunto vacio"],
  varnothing: ["vacio", "conjunto vacio"],
  rightarrow: ["flecha derecha", "flecha"],
  leftarrow: ["flecha izquierda"],
  Rightarrow: ["implica"],
  Leftrightarrow: ["si y solo si", "equivalencia"],
  to: ["flecha", "tiende a"],
  mapsto: ["se aplica en", "asigna"],
  ldots: ["puntos suspensivos", "puntos"],
  cdots: ["puntos suspensivos", "puntos"],
  pm: ["mas menos"],
  mathbb: ["pizarra", "doble barra"],
  mathcal: ["caligrafica"],
  mathbf: ["negrita"],
  overline: ["barra", "linea superior"],
  hat: ["gorro", "sombrero"],
  vec: ["vector"],
  binom: ["binomial", "combinatoria"],
  begin: ["entorno", "inicio"],
  matrix: ["matriz"],
  pmatrix: ["matriz"],
  bmatrix: ["matriz"],
  cases: ["casos", "por partes"],
  text: ["texto"],
}
