# Apêndice D — Código 4: catenária com força concentrada numa posição do arco.
# TCC "Modelos Analíticos, Numéricos e Experimentais para Análise de Estruturas Formadas por Cabos"
# (Armellini & Rüher Vicente, Escola Politécnica da USP, 2026). Código como publicado no texto.

import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import fsolve

def resolver_catenaria_com_carga(pA, pB, L, m, P, q):
    xa, ya = pA
    xb, yb = pB
    
    def sistema(vars):
        beta, c11, c12, xc = vars
        c21 = beta * ya - np.cosh(beta * xa + c11)
        c22 = beta * yb - np.cosh(beta * xb + c12)
        
        eq3 = (1/beta) * (np.sinh(beta * xc + c11) - np.sinh(beta * xa + c11)) - m
        eq4 = (1/beta) * (np.sinh(beta * xb + c12) - np.sinh(beta * xc + c12)) - (L - m)
        eq5 = (np.cosh(beta * xc + c11) + c21) - (np.cosh(beta * xc + c12) + c22)
        eq6 = (np.sinh(beta * xc + c12) - np.sinh(beta * xc + c11)) - (beta * P / q)
        
        return [eq3, eq4, eq5, eq6]

    fator_m = m / L
    xc_chute = xa + fator_m * (xb - xa)
    
    beta_chute = 0.15
    c11_chute = -beta_chute * xc_chute
    c12_chute = -beta_chute * xc_chute
    
    chute = [beta_chute, c11_chute, c12_chute, xc_chute]
    sol, info, ier, mesg = fsolve(sistema, chute, full_output=True, maxfev=2000)
    
    if ier != 1:
        print(f"Atenção: fsolve falhou - {mesg}")

    beta, c11, c12, xc = sol
    c21 = beta * ya - np.cosh(beta * xa + c11)
    c22 = beta * yb - np.cosh(beta * xb + c12)

    return beta, c11, c21, c12, c22, xc

# --- Execução ---
p1, p2 = (0, 10), (30, 20)
comprimento_total = 35.0
m_pos = 17.5    
forca_P = 150.0   
peso_q = 10.0

solucao = resolver_catenaria_com_carga(p1, p2, comprimento_total, m_pos, forca_P, peso_q)
beta, c11, c21, c12, c22, xc = solucao

T0 = peso_q / beta
yc = (np.cosh(beta * xc + c11) + c21) / beta

# --- Cálculo do Vértice (Ponto Mais Baixo) ---
x01 = -c11 / beta
x02 = -c12 / beta

# Criamos uma lista com os pontos "candidatos" a serem o mais baixo:
# Os apoios, o ponto da carga P, e os vértices teóricos (se existirem no vão físico)
candidatos_minimo = [ (p1[0], p1[1]), (p2[0], p2[1]), (xc, yc) ]

if p1[0] <= x01 <= xc:
    y01 = (np.cosh(beta * x01 + c11) + c21) / beta
    candidatos_minimo.append((x01, y01))

if xc < x02 <= p2[0]:
    y02 = (np.cosh(beta * x02 + c12) + c22) / beta
    candidatos_minimo.append((x02, y02))

# Busca o ponto com a menor coordenada Y
x0, y0 = min(candidatos_minimo, key=lambda ponto: ponto[1])

print("-" * 40)
print("RESULTADOS DA CATENÁRIA COM CARGA CONCENTRADA")
print("-" * 40)
print(f"Tração Horizontal Constante (T0): {T0:.2f} N")
print(f"Posição do nó carregado (xc, yc): ({xc:.2f}, {yc:.2f})")
print(f"Ponto mais baixo absoluto (x0, y0): ({x0:.2f}, {y0:.2f})")
print("-" * 40)

# --- Plotagem ---
x1 = np.linspace(p1[0], xc, 100)
y1 = (np.cosh(beta * x1 + c11) + c21) / beta

x2 = np.linspace(xc, p2[0], 100)
y2 = (np.cosh(beta * x2 + c12) + c22) / beta

plt.figure(figsize=(9, 6))
plt.plot(x1, y1, 'b-', linewidth=2, label=f'Segmento 1')
plt.plot(x2, y2, 'g-', linewidth=2, label=f'Segmento 2')

# Marcações
plt.plot([xc], [yc], 'ro', markersize=8, label=f'Carga P = {forca_P}N')
plt.annotate('', xy=(xc, yc - 2), xytext=(xc, yc),
             arrowprops=dict(facecolor='red', shrink=0, width=2, headwidth=8))

# Marcando o vértice absoluto com uma estrela preta
plt.plot([x0], [y0], 'k*', markersize=12, label='Ponto mais baixo')

plt.title(f'Catenária com Carga P={forca_P}N | $T_0$={T0:.1f}N')
plt.xlabel('Distância Horizontal')
plt.ylabel('Elevação')
plt.legend()
plt.grid(True)
plt.axis('equal') 
plt.show()
