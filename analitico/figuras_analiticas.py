"""Gera os gráficos dos Capítulos 3 e 4 do TCC no estilo único (estilo_tcc.py).

Os valores vêm da solução analítica geral (solver_geral.py), que reproduz os Códigos 1, 3 e
4, e do Código 5 (sistema 3D). Grava em analitico/figuras/ e, na pasta do TCC, também em
Texto/Imagens/ com os nomes usados no Latex.tex.

Uso:  python figuras_analiticas.py
"""
import sys
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))
import estilo_tcc as E  # noqa: E402
from solver_geral import Analitico  # noqa: E402

E.aplicar()
PASTA = AQUI / 'figuras'


# gráficos do Capítulo 3: o texto do TCC mantém as figuras originais, então a versão no
# estilo único fica só em analitico/figuras/ (não sobrescreve Texto/Imagens)
SO_PASTA = {'Grafico_Esforcos', 'Grafico_Esforcos_02', 'Gráfico3'}


def salvar(fig, nome):
    if nome in SO_PASTA:
        import matplotlib.pyplot as plt
        PASTA.mkdir(parents=True, exist_ok=True)
        fig.savefig(PASTA / f'{nome}.png')
        plt.close(fig)
        print('salvo (só em analitico/figuras):', nome)
    else:
        E.salvar(fig, nome, PASTA)


def curva(an, n=600):
    s = np.linspace(0, an.Lt, n)
    xy = np.array([an.ponto(si)[0] for si in s])
    T = np.array([an.ponto(si)[2] for si in s])
    return s, xy, T


def trecho(an, a, b, n=300):
    s = np.linspace(a, b, n)
    return np.array([an.ponto(si)[0] for si in s])


def vertice_simples(A, B, L, q, an):
    """vértice (real ou virtual) da catenária de um cabo homogêneo (Código 1)"""
    alpha = an.H / q
    dx, dy = B[0] - A[0], B[1] - A[1]
    x0 = (A[0] + B[0]) / 2 - alpha * np.arctanh(dy / L)
    y0 = A[1] - alpha * (np.cosh((A[0] - x0) / alpha) - 1)
    return np.array([x0, y0])


def fmt(v, d=2):
    return f'{v:.{d}f}'.replace('.', ',')


# ---------------------------------------------------------------- Capítulo 3
def cabo_tracao(nome, L):
    A, B, q = (0, 10), (30, 20), 45
    an = Analitico(A, B, [(L, q)], [])
    s, xy, T = curva(an)
    v = vertice_simples(A, B, L, q, an)
    real = A[0] <= v[0] <= B[0]
    fig, ax = E.figura(largura=8.4, altura=4.4)
    E.cabo_colorido(fig, ax, xy[:, 0], xy[:, 1], T)
    E.ancoragens(ax, [A, B], ['A', 'B'])
    E.vertice(ax, v, f'Vértice {"real" if real else "virtual"} ($T_0$ = {fmt(an.H, 1)} N)', virtual=not real)
    if not real:  # prolongamento virtual da curva até o vértice
        alpha = an.H / q
        xs = np.linspace(v[0], A[0], 80)
        ax.plot(xs, v[1] + alpha * (np.cosh((xs - v[0]) / alpha) - 1), '--', color=E.MUTED, lw=1.2,
                label='Prolongamento (fora do cabo)')
    E.eixos_xy(ax)
    E.legenda(ax)
    salvar(fig, nome)


def catenaria_vs_parabola():
    A, B, L, q = (0, 10), (30, 20), 35, 45
    an = Analitico(A, B, [(L, q)], [])
    _, xy, _ = curva(an)
    v = vertice_simples(A, B, L, q, an)
    a, b, c = 0.030532, -0.5826, 10.00           # coeficientes da Tabela do Cap. 3 (Código 2)
    xp = np.linspace(0, 30, 300)
    fig, ax = E.figura(largura=8.4, altura=4.4)
    ax.plot(xy[:, 0], xy[:, 1], color=E.ANALITICO, label='Catenária (exata)')
    ax.plot(xp, a * xp ** 2 + b * xp + c, '--', color=E.TINTA2, lw=1.8, label='Parábola (aproximação)')
    E.ancoragens(ax, [A, B], ['A', 'B'])
    E.vertice(ax, v, f'Vértice da catenária ({fmt(v[0])}; {fmt(v[1])})')
    xv = -b / (2 * a)
    ax.plot(xv, a * xv ** 2 + b * xv + c, 's', ms=6.5, mfc='white', mec=E.TINTA2, mew=1.6, zorder=7,
            label=f'Vértice da parábola ({fmt(xv)}; {fmt(a * xv ** 2 + b * xv + c)})')
    E.eixos_xy(ax)
    E.legenda(ax)
    salvar(fig, 'Gráfico3')


def esquema_origem_s():
    """Origem da coordenada de arco s no vértice: vértice real (esquerda) e virtual (direita).
    Os dois painéis têm o mesmo tamanho e a mesma escala; os rótulos ficam em regiões livres."""
    import matplotlib.pyplot as plt
    a = 12.0
    y = lambda x: a * (np.cosh(x / a) - 1)
    yl = lambda x: np.sinh(x / a)                       # inclinação

    def arco_seta(ax, x0, x1, d, cor, rot, pos_rot, ha):
        """seta paralela ao cabo (deslocada d para o lado côncavo), de x0 até x1"""
        xs = np.linspace(x0, x1, 80)
        n = np.column_stack([-yl(xs), np.ones_like(xs)]) / np.hypot(yl(xs), 1)[:, None]
        p = np.column_stack([xs, y(xs)]) + d * n
        ax.plot(p[:-3, 0], p[:-3, 1], color=cor, lw=1.4)
        ax.annotate('', xy=p[-1], xytext=p[-4], arrowprops=dict(arrowstyle='-|>', color=cor, lw=1.4, mutation_scale=13))
        ax.text(*pos_rot, rot, color=cor, ha=ha, va='center', fontsize=11)

    fig, axs = plt.subplots(1, 2, figsize=(11, 4.9))
    for ax in axs:
        ax.set_xlim(-16, 22)
        ax.set_ylim(-5, 18)
        ax.set_aspect('equal')               # mesma escala e mesmo tamanho nos dois painéis
        ax.grid(False)
        ax.set_xticks([]); ax.set_yticks([])
        ax.set_xlabel('$x$'); ax.set_ylabel('$y$')

    # (a) vértice interno ao vão: s < 0 à esquerda, s > 0 à direita
    ax = axs[0]
    xa, xb = -12.0, 17.0
    xs = np.linspace(xa, xb, 300)
    ax.plot(xs, y(xs), color=E.ANALITICO, lw=2.6, label='Cabo (catenária)')
    E.ancoragens(ax, [(xa, y(xa)), (xb, y(xb))], ['A', 'B'])
    E.vertice(ax, (0, 0), label='Vértice $(x_0, y_0)$: $s = 0$')
    ax.text(0, -1.6, '$(x_0, y_0)$\n$s = 0$', ha='center', va='top', fontsize=10.5)
    arco_seta(ax, 0.6, 9.5, 1.3, E.TINTA2, '$s > 0$', (7.5, 7.2), 'center')
    arco_seta(ax, -0.6, -8.5, 1.3, E.TINTA2, '$s < 0$', (-7.2, 6.4), 'center')
    ax.set_title('Vértice interno ao vão\n(pertence ao cabo)', fontsize=11)

    # (b) vértice externo ao vão: o cabo só tem s > 0; o vértice é um ponto virtual
    ax = axs[1]
    xa, xb = 4.0, 17.0
    xv = np.linspace(-7, xa, 120)
    ax.plot(xv, y(xv), '--', color=E.ANALITICO, lw=1.4, alpha=0.55, label='Prolongamento da catenária (fora do cabo)')
    xs = np.linspace(xa, xb, 300)
    ax.plot(xs, y(xs), color=E.ANALITICO, lw=2.6)
    E.ancoragens(ax, [(xa, y(xa)), (xb, y(xb))], [None, 'B'])
    ax.text(xa + 0.6, y(xa) - 0.6, 'A', fontweight='bold', ha='left', va='top')   # abaixo da seta de s
    E.vertice(ax, (0, 0), virtual=True, label=None)
    ax.text(0, -1.6, '$(x_0, y_0)$ virtual\n$s = 0$', ha='center', va='top', fontsize=10.5)
    arco_seta(ax, 0.6, 12.5, 1.3, E.TINTA2, '$s > 0$ em todo o cabo', (2.5, 9.5), 'center')
    ax.set_title('Vértice externo ao vão\n(ponto virtual, fora do cabo)', fontsize=11)

    # legenda única, abaixo dos painéis (não cobre nada)
    hl =[ax.get_legend_handles_labels() for ax in axs]
    handles, labels = [], []
    for h_, l_ in zip(hl[0][0] + hl[1][0], hl[0][1] + hl[1][1]):
        if l_ not in labels:
            handles.append(h_); labels.append(l_)
    fig.legend(handles, labels, loc='lower center', ncol=2, frameon=False, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.1, 1, 1))
    salvar(fig, 'Esquema_OrigemS')


# ---------------------------------------------------------------- Capítulo 4: cabo híbrido
def hibrido(nome, A, B, l1, l2, q1, q2, legenda_extra=True):
    an = Analitico(A, B, [(l1, q1), (l2, q2)], [])
    p1, p2 = trecho(an, 0, l1), trecho(an, l1, l1 + l2)
    C = an.ponto(l1)[0]
    fig, ax = E.figura(largura=8.4, altura=4.8)
    ax.plot(p1[:, 0], p1[:, 1], color=E.ANALITICO, label=f'Trecho 1 ($l_1$ = {fmt(l1, 0)} m, $q_1$ = {fmt(q1, 0)} N/m)')
    ax.plot(p2[:, 0], p2[:, 1], color=E.ANALITICO2, label=f'Trecho 2 ($l_2$ = {fmt(l2, 0)} m, $q_2$ = {fmt(q2, 0)} N/m)')
    E.ancoragens(ax, [A, B], ['A', 'B'])
    E.no(ax, C, f'Nó de transição C ({fmt(C[0])}; {fmt(C[1])})')
    E.vertice(ax, an.mais_baixo(), 'Ponto mais baixo')
    ax.set_title(f'$T_0$ = {fmt(an.H)} N', loc='right', fontsize=10, fontweight='normal', color=E.TINTA2)
    E.eixos_xy(ax)
    E.legenda(ax)
    salvar(fig, nome)
    return an


def hibrido_tracao():
    an = Analitico((0, 10), (40, 20), [(30, 10), (20, 5)], [])
    s, _, T = curva(an, 1000)
    fig, ax = E.figura(largura=8.4, altura=4.4)
    m = s <= 30
    ax.plot(s[m], T[m], color=E.ANALITICO, label='Trecho 1 ($q_1$ = 10 N/m)')
    ax.plot(s[~m], T[~m], color=E.ANALITICO2, label='Trecho 2 ($q_2$ = 5 N/m)')
    ax.axvline(30, color=E.DESTAQUE, lw=1.2, ls='--', label='Nó de transição C ($s$ = 30 m)')
    ax.axhline(an.H, color=E.MUTED, lw=1.2, ls=':', label=f'$T_0$ = {fmt(an.H)} N')
    ax.set_xlabel('Comprimento de arco $s$ a partir de A [m]')
    ax.set_ylabel('Tração $T$ [N]')
    E.legenda(ax)
    salvar(fig, 'Grafico4b')


def esquema_hibrido():
    A, B = (0, 10), (40, 20)
    an = Analitico(A, B, [(30, 10), (20, 5)], [])
    p1, p2 = trecho(an, 0, 30), trecho(an, 30, 50)
    C = an.ponto(30)[0]
    fig, ax = E.figura(largura=8.4, altura=4.6)
    ax.plot(p1[:, 0], p1[:, 1], color=E.ANALITICO, label='Trecho 1: $l_1$, $q_1$')
    ax.plot(p2[:, 0], p2[:, 1], color=E.ANALITICO2, label='Trecho 2: $l_2$, $q_2$')
    for pts, cor in ((p1, E.ANALITICO), (p2, E.ANALITICO2)):
        for k in np.linspace(30, len(pts) - 30, 4).astype(int):
            E.forca(ax, pts[k], 1.3, cor=cor)
    E.ancoragens(ax, [A, B], ['$A(x_A, y_A)$', '$B(x_B, y_B)$'])
    E.no(ax, C)
    ax.annotate('$C(x_C, y_C)$', C, xytext=(10, -14), textcoords='offset points', color=E.DESTAQUE,
                fontweight='bold', va='top')
    E.eixos_xy(ax)
    E.legenda(ax)
    salvar(fig, 'Esquema_CaboHibrido')


# ---------------------------------------------------------------- Capítulo 4: força concentrada
def forca_caso(nome, A, B, L, q, zeta, P, seta=2.0):
    an = Analitico(A, B, [(L, q)], [(zeta, P)] if 0 < zeta < 1 and P > 0 else [])
    sC = zeta * L
    fig, ax = E.figura(largura=8.4, altura=4.6)
    if 0 < sC < L:
        p1, p2 = trecho(an, 0, sC), trecho(an, sC, L)
        ax.plot(p1[:, 0], p1[:, 1], color=E.ANALITICO, label=f'Trecho 1 ($\\zeta L$ = {fmt(sC, 1)} m)')
        ax.plot(p2[:, 0], p2[:, 1], color=E.ANALITICO2, label=f'Trecho 2 ($(1-\\zeta) L$ = {fmt(L - sC, 1)} m)')
    else:
        p = trecho(an, 0, L)
        ax.plot(p[:, 0], p[:, 1], color=E.ANALITICO, label='Cabo')
    C = an.ponto(sC)[0]
    if P > 0:
        E.no(ax, C, f'Ponto de aplicação C ({fmt(C[0])}; {fmt(C[1])})')
        E.forca(ax, C, seta, f'P = {fmt(P, 0)} N', lado='esq' if sC <= 0 else 'dir')
        if sC <= 0:  # rótulo à esquerda da ancoragem: abre espaço para ele dentro do gráfico
            ax.set_xlim(A[0] - 7, B[0] + 1)
    E.ancoragens(ax, [A, B], ['A', 'B'])
    E.vertice(ax, an.mais_baixo(), 'Ponto mais baixo')
    ax.set_title(f'$T_0$ = {fmt(an.H)} N', loc='right', fontsize=10, fontweight='normal', color=E.TINTA2)
    E.eixos_xy(ax)
    E.legenda(ax)
    salvar(fig, nome)


def forca_mu():
    A, B, L, q = (0, 10), (30, 20), 35, 10
    fig, ax = E.figura(largura=8.4, altura=4.6)
    for mu, cor in zip((1, 5, 10, 20), E.TONS_ANALITICO):
        an = Analitico(A, B, [(L, q)], [(0.5, mu * q * L)])
        p = trecho(an, 0, L, 600)
        ax.plot(p[:, 0], p[:, 1], color=cor, lw=2,
                label=f'$\\mu$ = {mu} (P = {fmt(mu * q * L, 0)} N, $T_0$ = {fmt(an.H, 0)} N)')
        E.no(ax, an.ponto(L / 2)[0], cor=cor, ms=6.5)
    E.ancoragens(ax, [A, B], ['A', 'B'])
    E.eixos_xy(ax)
    E.legenda(ax)
    salvar(fig, 'Grafico12')


# ---------------------------------------------------------------- Estudo de Caso #3 (3D)
def sistema_3d(nome, eta=0.5, q2=20):
    import matplotlib.pyplot as plt
    from codigo5_sistema_3d import resolver_sistema_3d
    pA, pB, pC = (0, 20, 0), (40, 20, 0), (20, 15, 25)
    (xp, yp, zp), T0, C1, pesos, _ = resolver_sistema_3d(pA, pB, pC, 50, 30, 40, q2, eta, verbose=False)
    fig = plt.figure(figsize=(7.6, 6.2))
    ax = fig.add_subplot(111, projection='3d')
    # ordem de desenho fixa (o matplotlib 3D ordena por profundidade e pode pôr o ramal C–P
    # por cima do cabo principal): postes < C–P < A–P < B–P < marcadores
    ax.computed_zorder = False
    Z = {'C': 3, 'A': 4, 'B': 5}
    anc = {'A': pA, 'B': pB, 'C': pC}
    cores = {'A': E.C1, 'B': E.C2, 'C': E.C3}
    nomes = {'A': 'Trecho A–P (cabo 1)', 'B': 'Trecho B–P (cabo 1)', 'C': 'Trecho C–P (cabo 2)'}
    for i in 'ABC':
        p = anc[i]
        v = np.array([p[0] - xp, p[2] - zp])
        H = np.linalg.norm(v)
        t = np.linspace(0, 1, 200)
        r = t * H
        y = yp + T0[i] / pesos[i] * (np.cosh(pesos[i] * r / T0[i] + C1[i]) - np.cosh(C1[i]))
        ax.plot(xp + t * v[0], zp + t * v[1], y, color=cores[i], lw=2.4, zorder=Z[i],
                label=f'{nomes[i]}: $T_0$ = {fmt(T0[i], 1)} N')
        ax.plot([p[0], p[0]], [p[2], p[2]], [0, p[1]], color=E.TINTA2, lw=3, alpha=0.8, zorder=1)
        ax.text(p[0], p[2], p[1] + 1.2, i, fontweight='bold', ha='center', zorder=7)
    ax.scatter(*zip(*[(p[0], p[2], p[1]) for p in anc.values()]), marker='^', s=60, color=E.TINTA,
               depthshade=False, zorder=6)
    ax.scatter([xp], [zp], [yp], s=60, color=E.DESTAQUE, edgecolor='white', depthshade=False, zorder=7,
               label=f'Nó P ({fmt(xp)}; {fmt(yp)}; {fmt(zp)}) m')
    ax.set_xlabel('$x$ [m]')
    ax.set_ylabel('$z$ [m]')
    ax.set_zlabel('$y$ [m]')
    ax.set_zlim(0, 22)
    for eixo in (ax.xaxis, ax.yaxis, ax.zaxis):
        eixo.set_pane_color((0.97, 0.97, 0.96, 1))
        eixo._axinfo['grid'].update(color=E.GRADE, linewidth=0.7)
    ax.view_init(elev=20, azim=-60)
    ax.set_box_aspect((40, 25, 20))
    E.virgula(ax)
    ax.legend(loc='upper left', bbox_to_anchor=(0.0, 1.02))
    salvar(fig, nome)


if __name__ == '__main__':
    cabo_tracao('Grafico_Esforcos', 35)
    cabo_tracao('Grafico_Esforcos_02', 32)
    catenaria_vs_parabola()
    esquema_origem_s()
    esquema_hibrido()
    hibrido('Gráfico4', (0, 10), (40, 20), 30, 20, 10, 5)
    hibrido_tracao()
    hibrido('Gráfico5', (0, 10), (40, 10), 30, 30, 10, 10)
    hibrido('Gráfico6', (0, 10), (40, 20), 30, 20, 100, 10)
    hibrido('Gráfico7', (0, 10), (40, 20), 100, 10, 10, 5)
    forca_caso('Gráfico8', (0, 10), (30, 10), 35, 10, 0.5, 150)
    forca_caso('Gráfico9', (0, 10), (30, 20), 35, 10, 0.5, 0)       # Código 1 (sem força)
    forca_caso('Gráfico10', (0, 10), (30, 20), 35, 10, 0.5, 0)      # Código 4 com P = 0
    forca_caso('Gráfico11', (0, 10), (30, 20), 35, 10, 0.0, 150)    # P na ancoragem A
    forca_mu()
    sistema_3d('figura_4_11_caso_principal')
    sistema_3d('figura_4_12_caso_extremo_eta', eta=0.15)
    sistema_3d('figura_4_13_caso_extremo_q2', q2=200)
