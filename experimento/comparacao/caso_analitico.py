"""Caso analítico do experimento: Código 5 (resolver_sistema_3d, importado sem alteração) com os
parâmetros medidos, mais análise de sensibilidade e Monte Carlo.

Unidades e eixos exigidos pelo codigo5: metros, N/m, y vertical, A e B no plano z = 0
(dados_experimento.Eixos faz a passagem a partir do Qualisys). As fixações são as mesmas,
arredondadas a 0,01 mm, que vão no ansys/experimento_corrente.inp.

Uso:  python caso_analitico.py
Saída: resultados/caso_analitico.json + texto no terminal
"""
import sys

import numpy as np
from scipy.optimize import root

import dados_experimento as X

sys.path.insert(0, str(X.RAIZ / 'analitico'))
from codigo5_sistema_3d import resolver_sistema_3d  # noqa: E402

sys.stdout.reconfigure(encoding='utf8')
RNG = np.random.default_rng(7)
TRAMOS = ('A', 'B', 'C')
RAMO_DE = {'A': 'C1', 'B': 'C3', 'C': 'C2'}
PASSO_ELO = 0.035   # passo do elo ESTIMADO pelas fotos (não medido): ±meio elo = ±17,5 mm


def fixacoes():
    E = X.eixos_salvos()
    aj = X.ler_json('ajuste_ramos.json')
    return {k: tuple(np.round(E.para_modelo(aj['ramos'][RAMO_DE[k]]['fixacao']), 5) + 0.0) for k in TRAMOS}


def chute(F):
    return [F['A'][0] + X.ETA * (F['B'][0] - F['A'][0]), 0.3, 0.2, 2.7, 2.7, 1.9, 0.0, 0.3, -0.5]


def resolver(F, LA=X.LA, LB=X.LB, LC=X.LC, q1=X.Q1, q2=X.Q2):
    P, T0, C1, pesos, comp = resolver_sistema_3d(F['A'], F['B'], F['C'], LA + LB, LC, q1, q2, LA / (LA + LB),
                                                 chute_inicial=chute(F), verbose=False)
    return np.array(P), T0, C1, pesos, comp


def resolver_com_massa_no(F, m_no, LA=X.LA, LB=X.LB, LC=X.LC, q1=X.Q1, q2=X.Q2):
    """MESMAS 9 equações do codigo5, com um peso concentrado m_no*g no nó (só para a
    sensibilidade; com m_no = 0 confere-se que dá o mesmo resultado do codigo5)"""
    anc, Ls, qs = F, {'A': LA, 'B': LB, 'C': LC}, {'A': q1, 'B': q1, 'C': q2}

    def r(v):
        xp, yp, zp = v[:3]
        T0, c = dict(zip(TRAMOS, v[3:6])), dict(zip(TRAMOS, v[6:9]))
        H = {i: np.hypot(anc[i][0] - xp, anc[i][2] - zp) for i in TRAMOS}
        out = []
        for i in TRAMOS:
            arg = qs[i] * H[i] / T0[i] + c[i]
            out += [anc[i][1] - yp - T0[i] / qs[i] * (np.cosh(arg) - np.cosh(c[i])),
                    Ls[i] - T0[i] / qs[i] * (np.sinh(arg) - np.sinh(c[i]))]
        out += [sum(T0[i] * (anc[i][0] - xp) / H[i] for i in TRAMOS),
                sum(T0[i] * np.sinh(c[i]) for i in TRAMOS) - m_no * X.G,
                sum(T0[i] * (anc[i][2] - zp) / H[i] for i in TRAMOS)]
        return out
    s = root(r, resolver(F, LA, LB, LC, q1, q2)[0].tolist() + chute(F)[3:], method='hybr', tol=1e-12)
    assert s.success
    return s.x[:3]


def detalhes(F, P, T0, C1, pesos, comp):
    """curvas, tração e componente vertical nas fixações, comprimento conferido"""
    out = {}
    for i in TRAMOS:
        anc, q, a, c = np.array(F[i]), pesos[i], T0[i] / pesos[i], C1[i]
        H = np.hypot(anc[0] - P[0], anc[2] - P[2])
        u = np.array([anc[0] - P[0], 0, anc[2] - P[2]]) / H
        r = np.linspace(0, H, 801)
        y = P[1] + a * (np.cosh(r / a + c) - np.cosh(c))
        s = a * (np.sinh(r / a + c) - np.sinh(c))
        V = T0[i] * np.sinh(H / a + c)
        out[i] = dict(T0=T0[i], C1=C1[i], a=a, H=H, L=s[-1], T_fix=T0[i] * np.cosh(H / a + c), V_fix=V,
                      T_no=T0[i] * np.cosh(c), curva=P + np.outer(r, u) + np.outer(y - P[1], [0, 1, 0]), s=s)
    return out


def main():
    F = fixacoes()
    print('fixações (modelo, m):', {k: np.round(v, 5).tolist() for k, v in F.items()})
    P, T0, C1, pesos, comp = resolver(F)
    print(f'nó P (modelo) = {np.round(P, 5)}')
    d = detalhes(F, P, T0, C1, pesos, comp)
    E = X.eixos_salvos()
    Pq = E.para_qualisys(P)
    Preal = X.medianas()['centro']
    print(f'nó P (Qualisys, mm) = {np.round(Pq, 1)}; real {np.round(Preal, 1)}; diferença {np.round(Pq - Preal, 1)}'
          f' |{np.linalg.norm(Pq - Preal):.1f}| mm')
    peso = X.Q1 * X.L1 + X.Q2 * X.LC
    soma_V = sum(d[i]['V_fix'] for i in TRAMOS)
    for i in TRAMOS:
        print(f'{i}: T0 = {T0[i]:.4f} N ({T0[i] / X.G * 1000:.1f} gf)  C1 = {C1[i]:+.4f}  L = {d[i]["L"]:.5f}  '
              f'T fixação = {d[i]["T_fix"]:.4f} N ({d[i]["T_fix"] / X.G * 1000:.0f} gf)  V = {d[i]["V_fix"]:.4f} N')
    print(f'soma das verticais nas fixações {soma_V:.4f} N = {soma_V / X.G:.4f} kgf; peso suspenso pela balança '
          f'{peso:.4f} N = {peso / X.G:.4f} kgf (grossa {X.M1} kg + média {X.Q2_KG * X.LC:.4f} kg)')
    # conferência da extensão com massa no nó
    assert np.abs(resolver_com_massa_no(F, 0.0) - P).max() < 1e-8

    # ---------------- sensibilidade, um parâmetro por vez (diferença em mm no nó; T0 em %)
    base = dict(LA=X.LA, LB=X.LB, LC=X.LC, q1=X.Q1, q2=X.Q2)
    sens = []

    def caso(rot, F2=F, **kw):
        p = {**base, **kw}
        P2, T2, *_ = resolver(F2, **p)
        dP = (P2 - P) * 1000
        sens.append(dict(caso=rot, dP_mm=dP, dP_abs_mm=float(np.linalg.norm(dP)),
                         dT0_pct={i: 100 * (T2[i] / T0[i] - 1) for i in TRAMOS}))

    for i in TRAMOS:
        for k, eixo in enumerate('xyz'):
            for sinal in (+1, -1):
                F2 = dict(F)
                v = list(F[i])
                v[k] += sinal * 0.005
                F2[i] = tuple(v)
                caso(f'fixação {i} {eixo} {sinal * 5:+d} mm', F2)
    for nome in ('LA', 'LB', 'LC'):
        for dl in (+0.005, -0.005, +PASSO_ELO / 2, -PASSO_ELO / 2):
            caso(f'{nome} {dl * 1000:+.1f} mm', **{nome: base[nome] + dl})
    dq1 = X.RES_BALANCA / X.L1 * X.G
    dq2 = X.RES_BALANCA / X.L2_REAL * X.G
    caso('q1 + 2 g/2,004 m', q1=X.Q1 + dq1)
    caso('q2 + 2 g/2,002 m', q2=X.Q2 + dq2)
    caso('q2/q1 = 0,607 (razão que fecha o nó)', q2=0.607 * X.Q1)
    for m in (0.005, 0.010, 0.020):
        Pm = resolver_com_massa_no(F, m)
        sens.append(dict(caso=f'massa concentrada no nó {m * 1000:.0f} g', dP_mm=(Pm - P) * 1000,
                         dP_abs_mm=float(np.linalg.norm((Pm - P) * 1000)), dT0_pct=None))
    print('\nsensibilidade do nó P (mm, eixos do modelo: x ao longo de A->B, y vertical, z para C):')
    for s in sens:
        t = '' if s['dT0_pct'] is None else '  dT0 % ' + ' '.join(f'{v:+.2f}' for v in s['dT0_pct'].values())
        print(f'  {s["caso"]:40s} dP = {np.round(s["dP_mm"], 1)}  |{s["dP_abs_mm"]:.1f}|{t}')

    # ---------------- Monte Carlo: fixações (sigma do ajuste) + comprimentos (±5 mm, uniforme)
    aj = X.ler_json('ajuste_ramos.json')
    R = np.array([E.e1, E.ez, E.e3])          # Qualisys -> modelo (só rotação)
    sig = {i: R @ np.array(aj['sigma_fixacao_mm'][i]) for i in TRAMOS}
    am = []
    for _ in range(2000):
        F2 = {i: tuple(np.array(F[i]) + RNG.normal(0, np.abs(sig[i]) / 1000)) for i in TRAMOS}
        kw = {n: base[n] + RNG.uniform(-0.005, 0.005) for n in ('LA', 'LB', 'LC')}
        try:
            P2, T2, *_ = resolver(F2, **kw)
        except ValueError:
            continue
        am.append([*(P2 - P) * 1000, *(T2[i] for i in TRAMOS)])
    am = np.array(am)
    print(f'\nMonte Carlo ({len(am)}): sigma do nó (mm, modelo) {np.round(am[:, :3].std(0), 1)}; '
          f'sigma T0 (N) {np.round(am[:, 3:].std(0), 4)}')

    X.salvar_json('caso_analitico.json', dict(
        fixacoes_modelo_m=F, P_modelo_m=P, P_qualisys_mm=Pq, P_real_mm=Preal,
        ramos={i: {k: v for k, v in d[i].items()} for i in TRAMOS},
        peso_suspenso_N=peso, soma_verticais_N=soma_V,
        sensibilidade=sens, passo_elo_m=PASSO_ELO,
        monte_carlo=dict(n=len(am), sigma_P_mm=am[:, :3].std(0), sigma_T0_N=am[:, 3:].std(0),
                         sigma_P_qualisys_mm=np.abs(R.T) @ am[:, :3].std(0))))


if __name__ == '__main__':
    main()
