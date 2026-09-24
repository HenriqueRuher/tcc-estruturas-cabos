# Modelo em elementos finitos (Ansys Mechanical APDL)

Estudo de Caso #3 do TCC: três trechos de cabo ancorados em A, B e C e ligados num nó livre P, sob
peso próprio. A explicação completa de cada bloco do modelo e do porquê de cada escolha está no
[`Guia_Simulacao_ANSYS.pdf`](../docs/Guia_Simulacao_ANSYS.pdf).

| Arquivo | O que faz |
|---|---|
| `catenaria3d.inp` | Modelo APDL do caso principal: parâmetros, geometria, malha (`BEAM188`, 3 × 40 elementos), seção `ASEC` com EI reduzida, peso pelo comprimento de cada elemento, solução não linear e pós-processamento (posição de P, forças axiais, T₀). Pode ser rodado sozinho no Ansys. |
| `exportar_resultados.inp` | Roda o modelo e exporta coordenadas, deslocamentos e esforços de todos os subpassos para o visualizador. |
| `rodar_exportacao.ps1` | Faz tudo: roda o Ansys numa pasta temporária e gera `../visualizador/dados.js`. |
| `estudo_rigidez.py` | Estudo paramétrico da rigidez à flexão (fator do momento de inércia) comparado com o modelo analítico. |
| `casos_forca.py` | Gera, roda e converte os 200 casos de força concentrada (cabos C–P e A–P, 10 posições × 10 intensidades) em `../visualizador/casos.js`. |
| `figuras_mef.py` | Gera as figuras do capítulo de elementos finitos em `figuras/`. |

## Requisitos

- Ansys Mechanical APDL. Os scripts usam o caminho padrão do Ansys Student 2026 R1 no Windows; se o
  seu for outro, ajuste a variável `ANSYS` nos `.py` e `$ansys` no `.ps1`.
- Python 3 com `numpy` (e `matplotlib`/`scipy` para as figuras); Node.js para o conversor do visualizador.

## Uso

```powershell
.\rodar_exportacao.ps1                  # caso principal -> ../visualizador/dados.js (~30 s)
python estudo_rigidez.py 1 0.1 0.01     # estudo de rigidez (um caso a cada ~30 s)
python casos_forca.py                   # 200 casos (~75 min; um por vez, pela licença Student)
python casos_forca.py --so-converter    # só remonta o casos.js a partir de casos_forca/
python figuras_mef.py
```

Cada execução do Ansys roda numa pasta temporária, para não encher esta pasta de arquivos de
resultado. Os resultados brutos de cada caso de força ficam em `casos_forca/` (não versionados).
