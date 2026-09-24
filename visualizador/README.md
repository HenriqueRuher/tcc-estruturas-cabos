# Visualizador web

Aplicação em HTML, CSS e JavaScript puro, sem dependências nem servidor: abra `index.html` no
navegador. Versão online: https://henriqueruher.github.io/tcc-estruturas-cabos/

| Arquivo | O que é |
|---|---|
| `index.html` | Página inicial (Analítico, Experimento, Simulação) e créditos. |
| `analitico.html`, `analitico.js` | Modelo analítico interativo: caso geral 2D e sistema 3D. |
| `analitico_solver.js` | Solvers analíticos. O caso geral 2D reúne os Códigos 1 a 4 do TCC: como não há carga horizontal, a tração horizontal H é a mesma em todo o cabo, e cada trecho de peso constante é uma catenária com fórmula fechada; as incógnitas são só H e a componente vertical em A, resolvidas por Newton. O 3D é o sistema de 9 equações do Código 5. Conferidos contra os códigos Python da pasta `../analitico`. |
| `ansys.html`, `app.js` | Resultados do Ansys em 3D (modo análise e cena de apresentação). |
| `notas.js` | Textos explicativos dos painéis (ícone ⓘ). |
| `style.css` | Estilos (tema claro e escuro). |
| `dados.js` | Resultados do caso principal, todos os subpassos (gerado por `../ansys/rodar_exportacao.ps1`). |
| `casos.js` | 200 casos de força concentrada (gerado por `../ansys/casos_forca.py`). |
| `malhas.js` | Malhas 3D da cena de apresentação (árvores e cabana). |
| `converter_dados.mjs` | Converte a exportação do Ansys (`dados_ansys.txt`) em `dados.js` (Node.js). |
