# Apêndice A — Código 1: catenária entre dois pontos (vértice e comprimento crítico L*).
# TCC "Modelos Analíticos, Numéricos e Experimentais para Análise de Estruturas Formadas por Cabos"
# (Armellini & Rüher Vicente, Escola Politécnica da USP, 2026). Código como publicado no texto.

import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import fsolve

def processar_catenaria(p1, p2, L, w):
    # 1. Geometria e Validação
    v = abs(p2['x'] - p1['x'])
    h = abs(p2['y'] - p1['y'])
    dist_reta = np.sqrt(v**2 + h**2)

    if L <= dist_reta:
        raise ValueError(f"Cabo curto demais. L ({L:.2f}) deve ser maior que a distância linear ({dist_reta:.2f}).")

    # 2. Encontrar Geometria (L_critico)
    # L_critico define se o vértice está entre os pontos ou fora
    if h < 1e-5:
        L_critico = v
    else:
        f_crit = lambda a: np.cosh(a * v) - a * h - 1
        alpha_crit = fsolve(f_crit, 1.0)[0]
        L_critico = (1/alpha_crit) * np.sinh(alpha_crit * v)

    print(f"--- Análise Geométrica ---")
    print(f"L_input:   {L:.4f} m")
    print(f"L_critico: {L_critico:.4f} m")

    # Resolver para Alpha real baseado no L de entrada
    # Equação: (2/a) * sinh(a*v/2) = sqrt(L^2 - h^2)
    s_eq = np.sqrt(L**2 - h**2)
    f_alpha = lambda a: (2/a) * np.sinh(a * v / 2) - s_eq

    # Chute inicial robusto (Aproximação de parábola)
    a_guess = np.sqrt(24 * (L - dist_reta)) / v
    if a_guess <= 0: a_guess = 0.01

    alpha_sol = fsolve(f_alpha, a_guess, full_output=True)
    alpha = alpha_sol[0][0]
    
    if alpha_sol[2] != 1:
        print("Aviso: Convergência numérica não ideal.")

    # 3. Determinar Posição do Vértice (x0, y0) e Constantes
    mid_x = (p1['x'] + p2['x']) / 2
    # x0 é o deslocamento horizontal do ponto mais baixo
    x0 = mid_x - (1/alpha) * np.arctanh(h/L)
    
    C1 = -alpha * x0
    C2 = p1['y'] - (1/alpha) * np.cosh(alpha * p1['x'] + C1)
    y0 = (1/alpha) + C2  # Altura do vértice

    # 4. Análise de Forças
    # T0 (Tensão horizontal mínima no vértice) = (1/alpha) * w
    a_param = 1/alpha
    T0 = a_param * w
    
    print(f"\n--- Resultados Físicos ---")
    print(f"Parâmetro da Catenária (a): {a_param:.4f}")
    print(f"Tensão Horizontal (T0):    {T0:.2f} N")
    print(f"Vértice em:                x={x0:.2f}, y={y0:.2f}")

    # 5. Plotagem
    tem_flecha = (L >= L_critico)
    plotar_completo(p1, p2, alpha, C1, C2, x0, y0, tem_flecha)

def plotar_completo(p1, p2, alpha, C1, C2, x0, y0, tem_flecha):
    # Equação da catenária: y = a * cosh((x - x0)/a) + constante
    y_fcn = lambda x: (1/alpha) * np.cosh(alpha * x + C1) + C2
    
    x_min, x_max = min(p1['x'], p2['x']), max(p1['x'], p2['x'])
    x_vals = np.linspace(x_min, x_max, 200)
    y_vals = y_fcn(x_vals)

    plt.figure(figsize=(10, 6))
    plt.plot(x_vals, y_vals, 'b-', linewidth=2, label='Cabo (Catenária)')
    plt.plot([p1['x'], p2['x']], [p1['y'], p2['y']], 'ro', label='Ancoragens')

    if tem_flecha:
        plt.plot(x0, y0, 'gs', markersize=8, label=f'Vértice ({x0:.1f}, {y0:.1f})')
        # Linha vertical tracejada indicando o vértice
        plt.axvline(x=x0, color='k', linestyle='--', alpha=0.3)

    plt.title('Perfil da Catenária - Simulação Física')
    plt.xlabel('Distância X [m]')
    plt.ylabel('Altura Y [m]')
    plt.legend()
    plt.grid(True, linestyle=':', alpha=0.6)
    plt.axis('equal')
    plt.show()

# --- EXECUÇÃO PRINCIPAL ---
if __name__ == "__main__":
    # Configurações de entrada
    ponto1 = {'x': 0, 'y': 10}
    ponto2 = {'x': 30, 'y': 20}
    L_cabo = 35.0   # Comprimento do cabo
    peso_linear = 45.0 # N/m (Seu novo parâmetro)

    try:
        processar_catenaria(ponto1, ponto2, L_cabo, peso_linear)
    except Exception as e:
        print(f"\n[ERRO] {e}")

    print("\nScript finalizado.")
