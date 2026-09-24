# Apêndice C — Código 3: cabo híbrido com dois pesos por metro diferentes.
# TCC "Modelos Analíticos, Numéricos e Experimentais para Análise de Estruturas Formadas por Cabos"
# (Armellini & Rüher Vicente, Escola Politécnica da USP, 2026). Código como publicado no texto.

import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import fsolve

def resolver_catenaria_dois_pesos(pA, pB, l1, l2, q1, q2, xc_estimado):
    xa, ya = pA
    xb, yb = pB
    
    def sistema(vars):
        beta1, c11, c12, xc = vars
        beta2 = beta1 * (q2 / q1)
        
        c21 = beta1 * ya - np.cosh(beta1 * xa + c11)
        c22 = beta2 * yb - np.cosh(beta2 * xb + c12)
        
        eq3 = (1/beta1) * (np.sinh(beta1 * xc + c11) - np.sinh(beta1 * xa + c11)) - l1
        eq4 = (1/beta2) * (np.sinh(beta2 * xb + c12) - np.sinh(beta2 * xc + c12)) - l2
        eq5 = (np.cosh(beta1 * xc + c11) + c21)/beta1 - (np.cosh(beta2 * xc + c12) + c22)/beta2
        eq6 = (beta1 * xc + c11) - (beta2 * xc + c12)
        
        return [eq3, eq4, eq5, eq6]

    x_meio = (xa + xb) / 2.0
    beta_chute = 0.15 
    c11_chute = -beta_chute * x_meio
    c12_chute = -(beta_chute * (q2/q1)) * x_meio
    
    chute = [beta_chute, c11_chute, c12_chute, xc_estimado]
    sol, info, ier, mesg = fsolve(sistema, chute, full_output=True, maxfev=2000)
    
    if ier != 1:
        print(f"Atenção: fsolve reportou falha na convergência - {mesg}")

    beta1, c11, c12, xc = sol
    beta2 = beta1 * (q2 / q1)
    
    c21 = beta1 * ya - np.cosh(beta1 * xa + c11)
    c22 = beta2 * yb - np.cosh(beta2 * xb + c12)

    return beta1, c11, c21, c12, c22, xc

# --- Execução ---
pA, pB = (0, 10), (40, 20)
l1, l2 = 30.0, 20.0
q1, q2 = 20.0, 10.0

solucao = resolver_catenaria_dois_pesos(pA, pB, l1, l2, q1, q2, 20.0)
beta1, c11, c21, c12, c22, xc = solucao
beta2 = beta1 * (q2 / q1)

# --- Cálculos Novos: Tração e Vértice ---
# A tração horizontal é constante em todo o cabo: T0 = q / beta
T0 = q1 / beta1 

# O ponto mais baixo (derivada = 0) ocorre quando sinh(beta*x + c1) = 0 -> x = -c1/beta
x01 = -c11 / beta1
x02 = -c12 / beta2

# Verifica qual dos vértices teóricos cai no trecho real do cabo correspondente
if pA[0] <= x01 <= xc:
    x0 = x01
    y0 = (np.cosh(beta1 * x0 + c11) + c21) / beta1
elif xc < x02 <= pB[0]:
    x0 = x02
    y0 = (np.cosh(beta2 * x0 + c12) + c22) / beta2
else:
    # Caso o cabo não faça "barriga" e o ponto mais baixo seja um dos apoios
    x0, y0 = (pA[0], pA[1]) if pA[1] < pB[1] else (pB[0], pB[1])

# --- Impressão dos Resultados ---
print("-" * 30)
print("RESULTADOS DA CATENÁRIA")
print("-" * 30)
print(f"Tração Horizontal (T0): {T0:.2f}")
print(f"Ponto mais baixo (x0, y0): ({x0:.2f}, {y0:.2f})")
print(f"Ponto de transição (xc): {xc:.2f}")
print("-" * 30)

# --- Plotagem ---
x1 = np.linspace(pA[0], xc, 100)
y1 = (np.cosh(beta1 * x1 + c11) + c21) / beta1
x2 = np.linspace(xc, pB[0], 100)
y2 = (np.cosh(beta2 * x2 + c12) + c22) / beta2

plt.figure(figsize=(10, 7))
plt.plot(x1, y1, 'b-', linewidth=2, label=f'Segmento 1 (q={q1})')
plt.plot(x2, y2, 'g-', linewidth=2, label=f'Segmento 2 (q={q2})')

# Marcando os pontos de interesse
plt.plot([xc], [(np.cosh(beta1 * xc + c11) + c21) / beta1], 'ro', markersize=8, label='Nó de transição C')
plt.plot([x0], [y0], 'k*', markersize=12, label=f'Ponto mais baixo ($x_0$, $y_0$)')

plt.title(f'Catenária com variação de peso | Tração Horizontal $T_0$ = {T0:.2f}')
plt.xlabel('Distância Horizontal')
plt.ylabel('Elevação')
plt.legend()
plt.grid(True)
plt.axis('equal') 
plt.show()
