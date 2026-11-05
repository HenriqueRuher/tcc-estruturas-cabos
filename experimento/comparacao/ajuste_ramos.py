"""Ajuste de catenária por ramo, fixações A, B, C estimadas e comprimento do ramo da média
sem usar os 142,5 cm (item 1 da comparação).

Fixações: não foram medidas. Cada ramo é prolongado sobre a sua catenária ajustada, do nó até
o comprimento medido (L_A, L_B, L_C). A estimativa de L_C abaixo NÃO usa essa fixação C.

Comprimento do ramo da média, dois caminhos:
  catenária: arco do nó até o último marcador (C2_01), direto da curva ajustada;
  equilíbrio: arcos que fazem o codigo5, com os últimos marcadores como apoios e os q da
              balança, cair exatamente no nó medido (3 equações, 3 arcos).
Nos dois falta o pedaço do último marcador até o poste, que os dados não enxergam: nada na
catenária marca onde a corrente termina. Esse pedaço é estimado pela corrente grossa, cujo
comprimento total é conhecido (o que sobra dos 2,004 m nas duas pontas).

Uso:  python ajuste_ramos.py [n_sorteios]
Saída: resultados/ajuste_ramos.json + texto no terminal
"""
import sys

import numpy as np
from scipy.optimize import least_squares, minimize_scalar

import dados_experimento as X

sys.path.insert(0, str(X.RAIZ / 'analitico'))
from codigo5_sistema_3d import resolver_sistema_3d  # noqa: E402

sys.stdout.reconfigure(encoding='utf8')
N_MC = int(sys.argv[1]) if len(sys.argv) > 1 else 500
RNG = np.random.default_rng(20261105)
L_MM = {r: 1000 * d['L'] for r, d in X.RAMOS.items()}
ORDEM = ('C1', 'C3', 'C2')          # A, B, C
NOMES = ['centro'] + [f'{r}_0{k}' for r in X.RAMOS for k in (1, 2, 3)]


def resolver(pA, pB, pC, LA, LB, LC, q1=X.Q1, q2=X.Q2, chute=None):
    return resolver_sistema_3d(tuple(pA), tuple(pB), tuple(pC), LA + LB, LC, q1, q2, LA / (LA + LB),
                               chute_inicial=chute, verbose=False)


def inverter(P, F):
    """arcos do nó até os últimos marcadores que fazem o modelo cair no nó medido"""
    E = X.Eixos(F['C1']['fix'], F['C3']['fix'])
    mA, mB, mC = (E.para_modelo(P[f'{r}_01']) for r in ORDEM)
    Pm = E.para_modelo(P['centro'])
    ch = [*Pm, 2.7, 2.7, 1.9, 0, 0.35, -0.55]

    def erro(L):
        return (np.array(resolver(mA, mB, mC, *L, chute=ch)[0]) - Pm) * 1000
    s0 = [F[r]['s'][-1] / 1000 for r in ORDEM]
    return least_squares(erro, s0, diff_step=1e-4, xtol=1e-7, ftol=1e-7).x * 1000


def razao_q(F):
    """q_média/q_grossa que melhor fecha o equilíbrio do nó, só com as inclinações ajustadas"""
    v = {r: F[r]['a'] * np.array([*F[r]['e'], F[r]['tan_no']]) for r in F}
    return minimize_scalar(lambda k: np.linalg.norm(v['C1'] + v['C3'] + k * v['C2']),
                           bounds=(0.2, 2), method='bounded').x


def fechamento_vertical(F):
    """resultante vertical das 3 trações no nó, com as curvas ajustadas e os q da balança [gf]"""
    return sum(q * F[r]['a'] * F[r]['tan_no'] for r, q in
               (('C1', X.Q1_KG), ('C3', X.Q1_KG), ('C2', X.Q2_KG)))


def main():
    P = X.medianas()
    nomes, D = X.ler_tsv()
    print(f'{len(D)} quadros; desvio-padrão máximo de um marcador {D.std(0).max():.3f} mm; '
          f'lacunas (NaN/zero): {int(np.isnan(D).sum() + (D == 0).sum())}')
    F = X.ajustar_todos(P, L_MM)
    fora = np.concatenate([F[r]['off'] for r in F])
    # 4 pontos numa reta horizontal ajustada: sobram 2 graus de liberdade por ramo
    sig = float(np.sqrt(np.sum(fora ** 2) / (3 * 2)))
    print(f'dispersão fora do plano vertical: sigma = {sig:.1f} mm')
    for r in F:
        d = F[r]
        print(f'{r}: a = {d["a"]:.1f} mm, RMS normal = {np.sqrt(np.mean(d["res"] ** 2)):.2f} mm, '
              f'resíduos {np.round(d["res"], 2)}, arco até _01 = {d["s"][-1]:.1f}, '
              f'falta até L = {L_MM[r] - d["s"][-1]:.1f} mm, inclinação no nó = '
              f'{np.degrees(np.arctan(d["tan_no"])):.1f}°, fixação = {np.round(d["fix"], 1)}')
    print(f'fechamento vertical no nó com as curvas ajustadas: {fechamento_vertical(F):+.0f} gf')
    print(f'razão q_média/q_grossa que fecha o nó: {razao_q(F):.3f} (balança: {X.Q2_KG / X.Q1_KG:.3f})')

    sA, sB = F['C1']['s'][-1], F['C3']['s'][-1]
    inv = inverter(P, F)
    print(f'equilíbrio inverso, arcos até _01 [mm]: A {inv[0]:.1f}  B {inv[1]:.1f}  C {inv[2]:.1f}')
    print(f'corrente grossa: sobram {1000 * X.L1 - sA - sB:.1f} mm (catenária) / '
          f'{1000 * X.L1 - inv[0] - inv[1]:.1f} mm (equilíbrio) nas 2 pontas')

    # Monte Carlo: posição do marcador em relação ao eixo da corrente, sigma tirado da dispersão
    # fora do plano; a ponta da média é sorteada entre as duas pontas da grossa
    base = {k: F[k]['p'] for k in F}
    am = []
    for _ in range(N_MC):
        Pi = {n: P[n] + RNG.normal(0, sig, 3) for n in NOMES}
        Fi = {r: X.ajustar_ramo(Pi['centro'], np.array([Pi[f'{r}_03'], Pi[f'{r}_02'], Pi[f'{r}_01']]),
                                L_MM[r], base[r]) for r in X.RAMOS}
        try:
            iv = inverter(Pi, Fi)
        except Exception:
            continue
        dA, dB = L_MM['C1'] - Fi['C1']['s'][-1], L_MM['C3'] - Fi['C3']['s'][-1]
        ponta_cat = RNG.uniform(min(dA, dB), max(dA, dB))
        ponta_eq = (1000 * X.L1 - iv[0] - iv[1]) / 2
        am.append([Fi['C2']['s'][-1], iv[2], ponta_cat, ponta_eq, razao_q(Fi), fechamento_vertical(Fi),
                   *Fi['C1']['fix'], *Fi['C3']['fix'], *Fi['C2']['fix'],
                   Fi['C1']['a'], Fi['C2']['a'], Fi['C3']['a']])
    A = np.array(am)
    media, desvio = A.mean(0), A.std(0)
    Lc_cat, Lc_eq = A[:, 0] + A[:, 2], A[:, 1] + A[:, 3]
    centro = (Lc_cat.mean() + Lc_eq.mean()) / 2
    # incerteza combinada: dispersão de cada caminho + distância entre eles (erro de modelo)
    inc = float(np.hypot((Lc_cat.std() + Lc_eq.std()) / 2, (Lc_cat.mean() - Lc_eq.mean()) / 2))
    print(f'{len(A)} sorteios válidos de {N_MC}')
    print(f'arco nó->C2_01: catenária {A[:, 0].mean():.1f} ± {A[:, 0].std():.1f}; '
          f'equilíbrio {A[:, 1].mean():.1f} ± {A[:, 1].std():.1f}')
    print(f'ponta: catenária {A[:, 2].mean():.1f} ± {A[:, 2].std():.1f}; equilíbrio {A[:, 3].mean():.1f} ± {A[:, 3].std():.1f}')
    print(f'L_C estimado: catenária {Lc_cat.mean():.0f} ± {Lc_cat.std():.0f} mm; equilíbrio {Lc_eq.mean():.0f} ± '
          f'{Lc_eq.std():.0f} mm; combinado {centro:.0f} ± {inc:.0f} mm (medido {1000 * X.LC:.0f})')
    print(f'razão q: {media[4]:.3f} ± {desvio[4]:.3f};  fechamento vertical: {media[5]:+.0f} ± {desvio[5]:.0f} gf')
    print('sigma das fixações [mm] (X,Y,Z): A', np.round(desvio[6:9], 1), 'B', np.round(desvio[9:12], 1),
          'C', np.round(desvio[12:15], 1))
    print('sigma de a [mm]: C1 %.1f C2 %.1f C3 %.1f' % tuple(desvio[15:18]))
    E = X.Eixos(F['C1']['fix'], F['C3']['fix'])
    X.salvar_json('ajuste_ramos.json', dict(
        sigma_marcador_mm=sig, eixos=E.json(),
        ramos={r: dict(fixacao=F[r]['fix'], a_mm=F[r]['a'], T0_N=X.RAMOS[r]['q'] * F[r]['a'] / 1000,
                       sigma_a_mm=float(desvio[15 + i]), res_normal_mm=F[r]['res'], fora_plano_mm=F[r]['off'],
                       arco_marcadores_mm=F[r]['s'], tan_no=F[r]['tan_no'], e=F[r]['e'],
                       c=F[r]['c'], x0=F[r]['x0'], z0=F[r]['z0'], u=F[r]['u'],
                       falta_ate_L_mm=L_MM[r] - F[r]['s'][-1])
               for i, r in enumerate(F)},
        sigma_fixacao_mm=dict(A=desvio[6:9], B=desvio[9:12], C=desvio[12:15]),
        equilibrio_inverso_mm=dict(A=inv[0], B=inv[1], C=inv[2]),
        fechamento_vertical_gf=dict(valor=fechamento_vertical(F), media_mc=media[5], sigma_mc=desvio[5]),
        razao_q=dict(valor=razao_q(F), media_mc=media[4], sigma_mc=desvio[4], balanca=X.Q2_KG / X.Q1_KG),
        L_C_estimado_mm=dict(catenaria=[Lc_cat.mean(), Lc_cat.std()], equilibrio=[Lc_eq.mean(), Lc_eq.std()],
                             combinado=[centro, inc], medido=1000 * X.LC,
                             arco_ate_C2_01_catenaria=[A[:, 0].mean(), A[:, 0].std()],
                             arco_ate_C2_01_equilibrio=[A[:, 1].mean(), A[:, 1].std()]),
        n_sorteios=len(A)))


if __name__ == '__main__':
    main()
