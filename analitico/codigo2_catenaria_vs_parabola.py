# Apêndice B — Código 2: catenária exata com mapa de tração ao longo do cabo (comparação com a parábola).
# TCC "Modelos Analíticos, Numéricos e Experimentais para Análise de Estruturas Formadas por Cabos"
# (Armellini & Rüher Vicente, Escola Politécnica da USP, 2026). Código como publicado no texto.

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from scipy.optimize import fsolve

def plotar_catenaria_com_tensao_e_dados(p1, p2, L, q):
    xa, ya = p1['x'], p1['y']
    xb, yb = p2['x'], p2['y']
    
    # Diferenças reais para os cálculos algébricos
    dx = xb - xa
    dy = yb - ya
    
    # Valores absolutos para as verificações geométricas
    v = abs(dx)
    h = abs(dy)
    dist_reta = np.sqrt(v**2 + h**2)

    # 1. Validação do comprimento
    if L <= dist_reta:
        raise ValueError(f"Cabo demasiado curto. L ({L:.2f} m) deve ser maior que a distância linear ({dist_reta:.2f} m).")

    # 2. Cálculo do Comprimento Crítico (L_critico)
    # Define o comprimento onde o vértice coincide exatamente com o apoio mais baixo
    if h < 1e-5:
        L_critico = v
    else:
        f_crit = lambda a: np.cosh(a * v) - a * h - 1
        alpha_crit = fsolve(f_crit, 1.0)[0]
        L_critico = (1/alpha_crit) * np.sinh(alpha_crit * v)

    print("--- Análise Geométrica ---")
    print(f"L_input:   {L:.4f} m")
    print(f"L_critico: {L_critico:.4f} m")

    # 3. Estimativa e Cálculo Exato da Geometria (Alpha e T0)
    # Estimativa via Série de Taylor para um "chute inicial" robusto
    T0_est = q * np.sqrt((dx**3) / (24 * (np.sqrt(L**2 - dy**2) - dx)))
    s_eq = np.sqrt(L**2 - dy**2)
    
    def eq_transcendental(a):
        return 2 * a * np.sinh(dx / (2 * a)) - s_eq
        
    # fsolve com full_output para capturar avisos de convergência
    alpha_sol, info, ier, mesg = fsolve(eq_transcendental, T0_est / q, full_output=True)
    alpha = alpha_sol[0]
    
    if ier != 1:
        print("Aviso: A convergência numérica não foi a ideal.")
        
    T0 = alpha * q

    # 4. Cálculo do Vértice e Constante de Translação
    mid_x = (xa + xb) / 2
    x0 = mid_x - alpha * np.arctanh(dy / L)
    C2 = ya - alpha * np.cosh((xa - x0) / alpha)
    y0 = alpha + C2
    
    print("\n--- Resultados Físicos ---")
    print(f"Parâmetro da Catenária (\u03b1): {alpha:.4f} m")
    print(f"Tração Horizontal (T0):    {T0:.2f} N")
    print(f"Vértice em:                x = {x0:.2f} m, y = {y0:.2f} m")

    # Verifica se a flecha ocorre fisicamente dentro do vão
    tem_flecha = (L >= L_critico)
    if not tem_flecha:
        print("\nObservação: O vértice encontra-se fora do vão físico.")
        print("Isto indica uma catenária fortemente tracionada (curva estritamente crescente ou decrescente no vão).")

    # 5. Construção dos Vetores de Geometria e Esforço
    x_vals = np.linspace(min(xa, xb), max(xa, xb), 500)
    y_vals = alpha * np.cosh((x_vals - x0) / alpha) + C2
    
    # A Tração real no ponto (x)
    T_vals = T0 * np.cosh((x_vals - x0) / alpha)
    
    # 6. Configuração da visualização com LineCollection (Efeito ANSYS)
    points = np.array([x_vals, y_vals]).T.reshape(-1, 1, 2)
    segments = np.concatenate([points[:-1], points[1:]], axis=1)
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Criando a coleção de linhas com gradiente de cor baseado na Tração
    norm = plt.Normalize(T_vals.min(), T_vals.max())
    lc = LineCollection(segments, cmap='jet', norm=norm)
    lc.set_array(T_vals)
    lc.set_linewidth(4) 
    
    linha = ax.add_collection(lc)
    cbar = fig.colorbar(linha, ax=ax)
    cbar.set_label('Tração Interna T(x) [N]', fontsize=12)
    
    # Plotando os pontos de apoio
    ax.plot([xa, xb], [ya, yb], 'ko', markersize=8, label='Apoios Fixos')
    
    # Lógica de apresentação do vértice (Real vs Virtual)
    if tem_flecha:
        ax.plot(x0, y0, 'wX', markeredgecolor='k', markersize=10, 
                label=f'Vértice Real (T_mín = {T0:.1f} N)')
        ax.axvline(x=x0, color='k', linestyle='--', alpha=0.3)
    else:
        # Se for virtual, marca com transparência para indicar que está "fora" da corda física
        ax.plot(x0, y0, 'wX', markeredgecolor='gray', markersize=10, alpha=0.5,
                label=f'Vértice Virtual (T_mín = {T0:.1f} N)')
        
    ax.autoscale()
    ax.set_title('Perfil da Catenária e Mapa de Distribuição de Tensões', fontsize=14)
    ax.set_xlabel('Distância Horizontal X [m]', fontsize=12)
    ax.set_ylabel('Altura Y [m]', fontsize=12)
    ax.grid(True, linestyle='--', alpha=0.6)
    ax.legend(loc='upper left')
    ax.axis('equal') 
    
    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    # Dados de entrada do cenário padrão
    ponto_A = {'x': 0, 'y': 10}
    ponto_B = {'x': 30, 'y': 20}
    
    # Pode testar com 35.0 (vértice no vão) ou 32.0 (fortemente tracionado)
    L_total = 35.0  
    peso_q = 45.0   

    try:
        plotar_catenaria_com_tensao_e_dados(ponto_A, ponto_B, L_total, peso_q)
    except Exception as e:
        print(f"\n[ERRO] {e}")
