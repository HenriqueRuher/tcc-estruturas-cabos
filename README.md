# Estruturas formadas por cabos — códigos do TCC

Códigos do trabalho de formatura **"Modelos Analíticos, Numéricos e Experimentais para Análise de
Estruturas Formadas por Cabos"** (Escola Politécnica da Universidade de São Paulo, 2026).

- **Autores:** Gustavo Armellini e Henrique Ayrton Rüher Vicente
- **Orientador:** Prof. Dr. Roberto Ramos Júnior

## Visualizador online

**https://henriqueruher.github.io/tcc-estruturas-cabos/**

Abre no navegador, sem instalação:

- **Analítico:** caso geral 2D (cabo com vários trechos de pesos diferentes e forças concentradas,
  com comparação com a parábola) e sistema 3D de dois cabos ligados num nó. Calculado na hora, a
  partir dos dados que você digitar.
- **Simulação (Ansys):** modelo em elementos finitos do Estudo de Caso #3, com a animação da
  convergência, 200 casos de força concentrada e a comparação com o modelo analítico.
- **Experimento:** em preparação.

## Conteúdo

| Pasta | O que tem |
|---|---|
| [`analitico/`](analitico) | Códigos Python dos Apêndices do TCC (Códigos 1 a 5): catenária simples, comparação com a parábola, cabo com dois pesos, força concentrada e sistema 3D. |
| [`ansys/`](ansys) | Modelo APDL do Estudo de Caso #3 (`catenaria3d.inp`), exportação para o visualizador, estudo da rigidez à flexão, casos de força concentrada e figuras do capítulo de elementos finitos. |
| [`visualizador/`](visualizador) | Aplicação web (HTML/CSS/JavaScript puro, sem dependências). |
| [`docs/`](docs) | `Guia_Simulacao_ANSYS.pdf`: explicação de cada parte do modelo do Ansys e do porquê de cada escolha. |

## Como rodar localmente

- **Visualizador:** abra `visualizador/index.html` no navegador (duplo clique). Não precisa de servidor.
- **Códigos analíticos:** Python 3 com `numpy`, `scipy` e `matplotlib` (ver [`analitico/README.md`](analitico/README.md)).
- **Modelo do Ansys:** Ansys Mechanical APDL (testado no Ansys Student 2026 R1) e Python 3 com `numpy`
  (ver [`ansys/README.md`](ansys/README.md)).

## Versão do texto

A tag [`v1.0-tcc`](../../tree/v1.0-tcc) corresponde à versão dos códigos citada no texto do TCC.

## Licença

[MIT](LICENSE): livre para consultar, usar e adaptar, citando a fonte.
