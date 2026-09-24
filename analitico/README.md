# Modelos analíticos (Python)

Códigos dos Apêndices A a E do TCC. Todos tratam o **cabo ideal**: inextensível e sem rigidez à
flexão, sob peso próprio distribuído ao longo do comprimento (catenária).

| Arquivo | Apêndice | O que resolve |
|---|---|---|
| `codigo1_catenaria_simples.py` | A | Catenária entre dois pontos: parâmetro α, tração horizontal T₀, vértice e comprimento crítico L*. |
| `codigo2_catenaria_vs_parabola.py` | B | Mesmo problema, com o mapa de tração T(x) ao longo do cabo; base da comparação com a parábola. |
| `codigo3_dois_pesos.py` | C | Cabo híbrido: dois trechos com pesos por metro diferentes (q₁, q₂). |
| `codigo4_forca_concentrada.py` | D | Cabo com uma força concentrada P aplicada a uma distância m (medida ao longo do cabo) de A. |
| `codigo5_sistema_3d.py` | E | Estudo de Caso #3: dois cabos ligados num nó P fora do plano (sistema de 9 equações), com os casos principal e extremos. |

## Como rodar

Requisitos: Python 3 com `numpy`, `scipy` e `matplotlib`.

```bash
pip install numpy scipy matplotlib
python codigo1_catenaria_simples.py
```

Cada código imprime os resultados no terminal e abre os gráficos. Os dados de entrada ficam no fim
de cada arquivo (bloco `if __name__ == "__main__":` ou `# --- Execução ---`) e podem ser alterados
à vontade. O Código 5 salva as figuras numa pasta `figuras/` ao lado do arquivo.

## Versão interativa

O visualizador ([`../visualizador`](../visualizador)) reúne os Códigos 1 a 4 num **caso geral 2D**
(qualquer número de trechos com pesos diferentes e forças concentradas em qualquer posição) e o
Código 5 numa vista 3D, calculados no navegador. Os resultados foram conferidos contra estes
códigos (mesmos valores de T₀, vértice, nó de transição e posição de P).
