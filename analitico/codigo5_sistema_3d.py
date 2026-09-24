# Apêndice E — Código 5: equilíbrio 3D de dois cabos ligados num nó (9 equações).
# TCC "Modelos Analíticos, Numéricos e Experimentais para Análise de Estruturas Formadas por Cabos"
# (Armellini & Rüher Vicente, Escola Politécnica da USP, 2026). Código como publicado no texto,
# exceto o caminho onde as figuras são salvas (ver PASTA_FIG).

import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import root
from pathlib import Path

# (repositório) figuras salvas na pasta "figuras" ao lado deste arquivo; no texto
# do TCC o caminho era fixo (/home/claude/tcc3d/...), que só existia na máquina original
PASTA_FIG = Path(__file__).resolve().parent / "figuras"
PASTA_FIG.mkdir(exist_ok=True)


def resolver_sistema_3d(pA, pB, pC, L1, L_C, q1, q2, eta, chute_inicial=None, verbose=True):
    """
    Resolve o equilíbrio estático 3D de dois cabos interconectados:
      - Cabo 1: ancorado em A e B, ambos no plano z = 0 (za = zb).
        É "cortado" pelo Nó P a uma fração eta do seu comprimento total L1
        (medida a partir de A), dando origem aos trechos A e B.
      - Cabo 2 (trecho C): ancorado em C (fora do plano z = 0) e conectado
        ao Nó P, com comprimento L_C e peso distribuído q2.

    Retorna: (xp, yp, zp), T0 (dict), C1 (dict), pesos (dict), comprimentos (dict)
    """
    L_A = eta * L1
    L_B = (1.0 - eta) * L1

    ancoragens = {'A': pA, 'B': pB, 'C': pC}
    comprimentos = {'A': L_A, 'B': L_B, 'C': L_C}
    pesos = {'A': q1, 'B': q1, 'C': q2}

    def equacoes_residuais(vars_incognitas):
        xp, yp, zp = vars_incognitas[0:3]
        T0 = {'A': vars_incognitas[3], 'B': vars_incognitas[4], 'C': vars_incognitas[5]}
        C1 = {'A': vars_incognitas[6], 'B': vars_incognitas[7], 'C': vars_incognitas[8]}

        residuos = []

        H = {i: np.sqrt((ancoragens[i][0] - xp)**2 + (ancoragens[i][2] - zp)**2)
             for i in ['A', 'B', 'C']}
        V_reais = {i: ancoragens[i][1] - yp for i in ['A', 'B', 'C']}

        for i in ['A', 'B', 'C']:
            q = pesos[i]
            L = comprimentos[i]
            term_arg = (q * H[i]) / T0[i] + C1[i]

            V_calc = (T0[i] / q) * (np.cosh(term_arg) - np.cosh(C1[i]))
            residuos.append(V_reais[i] - V_calc)

            L_calc = (T0[i] / q) * (np.sinh(term_arg) - np.sinh(C1[i]))
            residuos.append(L - L_calc)

        Fx = sum(T0[i] * (ancoragens[i][0] - xp) / H[i] for i in ['A', 'B', 'C'])
        Fz = sum(T0[i] * (ancoragens[i][2] - zp) / H[i] for i in ['A', 'B', 'C'])
        Fy = sum(T0[i] * np.sinh(C1[i]) for i in ['A', 'B', 'C'])

        residuos.extend([Fx, Fy, Fz])
        return residuos

    if chute_inicial is None:
        # Chute inicial "físico": nó P interpolado em x pela fração eta,
        # puxado parcialmente em direção à ancoragem C (fora do plano) tanto
        # em y quanto em z, e trações horizontais em escala moderada
        # (usar T0 ~ q*L, como no Apêndice E original, tende a divergir
        # porque o argumento de cosh/sinh some rápido demais).
        xp_init = pA[0] + eta * (pB[0] - pA[0])
        yp_init = min(pA[1], pB[1], pC[1]) - 8.0
        zp_init = 0.2 * pC[2]
        chute_inicial = [
            xp_init, yp_init, zp_init,
            0.5 * q1 * L1, 0.5 * q1 * L1, 0.5 * q2 * L_C,
            0.1, 0.1, -0.5
        ]

    solucao = root(equacoes_residuais, chute_inicial, method='hybr', tol=1e-10)

    # Se não convergiu de primeira, tenta uma pequena varredura de chutes
    # (robustez extra, útil quando o usuário mudar bastante os parâmetros).
    if not solucao.success:
        for zp0 in np.linspace(0.05, 0.6, 6) * pC[2]:
            for yp0_off in [5.0, 8.0, 12.0, 15.0]:
                for escala in [0.25, 0.5, 1.0, 2.0]:
                    tentativa = [
                        xp_init, min(pA[1], pB[1], pC[1]) - yp0_off, zp0,
                        escala * q1 * L1, escala * q1 * L1, escala * q2 * L_C,
                        0.1, 0.1, -0.5
                    ]
                    sol_tentativa = root(equacoes_residuais, tentativa, method='hybr', tol=1e-10)
                    if sol_tentativa.success:
                        residuo = np.max(np.abs(equacoes_residuais(sol_tentativa.x)))
                        if residuo < 1e-6:
                            solucao = sol_tentativa
                            break
                else:
                    continue
                break
            else:
                continue
            break

    if not solucao.success:
        raise ValueError(f"O solver não convergiu: {solucao.message}")

    xp_sol, yp_sol, zp_sol = solucao.x[0:3]
    T0_sol = {'A': solucao.x[3], 'B': solucao.x[4], 'C': solucao.x[5]}
    C1_sol = {'A': solucao.x[6], 'B': solucao.x[7], 'C': solucao.x[8]}

    if verbose:
        residuo_max = np.max(np.abs(equacoes_residuais(solucao.x)))
        print("--- Equilíbrio 3D encontrado ---")
        print(f"Nó P: xp={xp_sol:.4f} m, yp={yp_sol:.4f} m, zp={zp_sol:.4f} m")
        print(f"T0_A={T0_sol['A']:.2f} N | T0_B={T0_sol['B']:.2f} N | T0_C={T0_sol['C']:.2f} N")
        print(f"C1_A={C1_sol['A']:.4f} | C1_B={C1_sol['B']:.4f} | C1_C={C1_sol['C']:.4f}")
        print(f"Resíduo máximo do sistema: {residuo_max:.2e}")

    return (xp_sol, yp_sol, zp_sol), T0_sol, C1_sol, pesos, comprimentos


def plotar_sistema_3d(pA, pB, pC, no_P, T0, C1, pesos, titulo="Configuração de Equilíbrio 3D", salvar_como=None):
    xp, yp, zp = no_P
    fig = plt.figure(figsize=(11, 8))
    ax = fig.add_subplot(111, projection='3d')

    ancoragens = {'A': pA, 'B': pB, 'C': pC}
    cores = {'A': 'b-', 'B': 'g-', 'C': 'm-'}
    nomes = {'A': 'Trecho A (cabo 1)', 'B': 'Trecho B (cabo 1)', 'C': 'Trecho C (cabo 2)'}

    for i in ['A', 'B', 'C']:
        p_anc = ancoragens[i]
        q = pesos[i]

        v_dir = np.array([p_anc[0] - xp, p_anc[2] - zp])
        H_total = np.linalg.norm(v_dir)

        t_steps = np.linspace(0, 1, 150)
        x_linha = xp + t_steps * v_dir[0]
        z_linha = zp + t_steps * v_dir[1]
        r = t_steps * H_total

        y_linha = yp + (T0[i] / q) * (np.cosh((q * r) / T0[i] + C1[i]) - np.cosh(C1[i]))

        ax.plot(x_linha, z_linha, y_linha, cores[i], linewidth=2.5, label=nomes[i])

    ax.scatter([pA[0], pB[0], pC[0]], [pA[2], pB[2], pC[2]], [pA[1], pB[1], pC[1]],
               color='red', s=60, label='Ancoragens')
    ax.scatter([xp], [zp], [yp], color='black', marker='s', s=90,
               label=f'Nó P ({xp:.1f}, {yp:.1f}, {zp:.1f})')

    ax.set_title(titulo)
    ax.set_xlabel('Eixo X [m]')
    ax.set_ylabel('Eixo Z (fora do plano) [m]')
    ax.set_zlabel('Eixo Y (altura) [m]')
    ax.legend()
    ax.grid(True)
    ax.view_init(elev=20, azim=-60)

    if salvar_como:
        plt.savefig(salvar_como, dpi=150, bbox_inches='tight')
        print(f"Figura salva em: {salvar_como}")
    plt.close(fig)


if __name__ == "__main__":
    # --- Caso principal: mesmos dados do Apêndice E ---
    ponto_A = (0.0, 20.0, 0.0)
    ponto_B = (40.0, 20.0, 0.0)
    ponto_C = (20.0, 15.0, 25.0)

    L_total_1 = 50.0
    L_cabo_C = 30.0
    q1 = 40.0
    q2 = q1 / 2.0
    eta = 0.5

    no_P, T0, C1, pesos, comprimentos = resolver_sistema_3d(
        ponto_A, ponto_B, ponto_C, L_total_1, L_cabo_C, q1, q2, eta
    )
    plotar_sistema_3d(ponto_A, ponto_B, ponto_C, no_P, T0, C1, pesos,
                       titulo="Caso Principal: nó de conexão no meio do cabo 1",
                       salvar_como=PASTA_FIG / "caso_principal.png")

    print("\n" + "=" * 60)
    print("CASO DE VALIDAÇÃO: eta -> quase 0 (nó perto de A)")
    print("=" * 60)
    no_P2, T02, C12, pesos2, comp2 = resolver_sistema_3d(
        ponto_A, ponto_B, ponto_C, L_total_1, L_cabo_C, q1, q2, eta=0.15
    )
    plotar_sistema_3d(ponto_A, ponto_B, ponto_C, no_P2, T02, C12, pesos2,
                       titulo="Caso Extremo: nó próximo à ancoragem A (eta=0.15)",
                       salvar_como=PASTA_FIG / "caso_eta_baixo.png")

    print("\n" + "=" * 60)
    print("CASO EXTREMO: cabo C muito mais pesado (q2 >> q1)")
    print("=" * 60)
    no_P3, T03, C13, pesos3, comp3 = resolver_sistema_3d(
        ponto_A, ponto_B, ponto_C, L_total_1, L_cabo_C, q1, q2=5 * q1, eta=0.5
    )
    plotar_sistema_3d(ponto_A, ponto_B, ponto_C, no_P3, T03, C13, pesos3,
                       titulo="Caso Extremo: cabo C com peso 5x maior (q2=5*q1)",
                       salvar_como=PASTA_FIG / "caso_q2_pesado.png")
