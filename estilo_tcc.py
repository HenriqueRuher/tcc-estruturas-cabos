"""Estilo visual único dos gráficos do TCC (mesma paleta do visualizador web).

Uso:
    import estilo_tcc as E
    E.aplicar()
    fig, ax = E.figura()
    ... ax.plot(x, y, color=E.C1) ...
    E.salvar(fig, 'Grafico_X')        # grava em Texto/Imagens/ (e onde mais for pedido)
"""
from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from matplotlib.colors import LinearSegmentedColormap

RAIZ = Path(__file__).resolve().parent            # Codigos/
IMAGENS = RAIZ.parent / 'Texto' / 'Imagens'        # figuras usadas no Latex.tex

# paleta (igual às variáveis CSS de visualizador/style.css)
TINTA = '#0b0b0b'
TINTA2 = '#52514e'
MUTED = '#6c6b66'
GRADE = '#e1e0da'
C1 = '#2a78d6'      # azul   — MEF (Ansys) / trecho 1 / cabo A–P
C2 = '#eb6834'      # laranja — cabo B–P / 2ª série
C3 = '#1baf7a'      # verde  — trecho 3 / cabo C–P
C4 = '#8a5cc7'      # roxo   — 4ª série
ANALITICO = '#d7191c'  # vermelho — modelo analítico (mesma cor da curva analítica do visualizador)
DESTAQUE = '#e8590c'  # laranja — forças concentradas e nós notáveis (seta de força do visualizador)
SERIES = [C1, C2, C3, C4, '#c79a1b', MUTED]

# tons de vermelho para quando há mais de uma curva analítica (trechos, séries)
ANALITICO2 = '#f08a7e'   # trecho 2 (vermelho claro)
TONS_ANALITICO = ['#f4a582', '#e0605a', '#d7191c', '#8f0f12']

# mapa de cores da tração: viridis, o mesmo do visualizador (abas 2D e 3D)
MAPA_TRACAO = LinearSegmentedColormap.from_list(
    'tracao_tcc', ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779',
                   '#6ece58', '#b5de2b', '#fde725'])


def aplicar():
    mpl.rcParams.update({
        'font.family': 'DejaVu Sans',
        'mathtext.fontset': 'dejavusans',
        'font.size': 10.5,
        'axes.titlesize': 11,
        'axes.titleweight': 'bold',
        'axes.labelsize': 10.5,
        'axes.labelcolor': TINTA,
        'axes.edgecolor': TINTA2,
        'axes.linewidth': 0.8,
        'axes.spines.top': False,
        'axes.spines.right': False,
        'axes.grid': True,
        'axes.axisbelow': True,
        'axes.prop_cycle': mpl.cycler(color=SERIES),
        'grid.color': GRADE,
        'grid.linewidth': 0.7,
        'grid.linestyle': '-',
        'xtick.color': TINTA2,
        'ytick.color': TINTA2,
        'xtick.labelsize': 9.5,
        'ytick.labelsize': 9.5,
        'legend.fontsize': 9.5,
        'legend.frameon': True,
        'legend.framealpha': 0.92,
        'legend.edgecolor': GRADE,
        'legend.fancybox': False,
        'lines.linewidth': 2.2,
        'lines.solid_capstyle': 'round',
        'figure.dpi': 110,
        'savefig.dpi': 220,
        'savefig.bbox': 'tight',
        'savefig.facecolor': 'white',
        'figure.facecolor': 'white',
    })


def _virgula(ax):
    fmt = mpl.ticker.FuncFormatter(lambda v, _: f'{v:g}'.replace('.', ','))
    ax.xaxis.set_major_formatter(fmt)
    ax.yaxis.set_major_formatter(fmt)


def figura(ncols=1, nrows=1, largura=8.0, altura=4.6, **kw):
    fig, axs = plt.subplots(nrows, ncols, figsize=(largura, altura), **kw)
    for ax in np.atleast_1d(axs).flat:
        _virgula(ax)
    return fig, axs


def legenda(ax, ncol=2, **kw):
    """legenda padrão: abaixo do gráfico, sem moldura (não cobre as curvas)"""
    return ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.17), ncol=ncol, frameon=False,
                     columnspacing=1.6, handlelength=2.2, **kw)


def virgula(ax):
    fmt = mpl.ticker.FuncFormatter(lambda v, _: f'{v:g}'.replace('.', ','))
    for eixo in ('xaxis', 'yaxis', 'zaxis'):
        if hasattr(ax, eixo):
            getattr(ax, eixo).set_major_formatter(fmt)


def eixos_xy(ax, igual=True):
    ax.set_xlabel('$x$ [m]')
    ax.set_ylabel('$y$ [m]')
    if igual:
        ax.set_aspect('equal', adjustable='datalim')


def ancoragens(ax, pts, rotulos=None, label='Ancoragens'):
    pts = np.atleast_2d(pts)
    ax.plot(pts[:, 0], pts[:, 1], '^', ms=9, color=TINTA, zorder=6, label=label, clip_on=False)
    for p, r in zip(pts, rotulos or []):
        ax.annotate(r, p, xytext=(0, 8), textcoords='offset points', ha='center', va='bottom',
                    fontweight='bold', color=TINTA)


def no(ax, p, label=None, cor=DESTAQUE, marcador='o', ms=8):
    ax.plot(*p, marcador, ms=ms, color=cor, mec='white', mew=1.2, zorder=7, label=label)


def vertice(ax, p, label='Vértice', virtual=False):
    ax.plot(*p, 'D', ms=7.5, mfc='white', mec=TINTA, mew=1.6, zorder=7, label=label,
            alpha=0.55 if virtual else 1)


def forca(ax, p, comprimento, texto=None, cor=DESTAQUE):
    ax.annotate('', xy=(p[0], p[1] - comprimento), xytext=p,
                arrowprops=dict(arrowstyle='-|>', color=cor, lw=2.2, mutation_scale=16), zorder=8)
    if texto:
        ax.annotate(texto, (p[0], p[1] - comprimento), xytext=(6, 2), textcoords='offset points',
                    color=cor, fontweight='bold', va='bottom')


def cabo_colorido(fig, ax, x, y, T, rotulo='Tração $T$ [N]', lw=5):
    pts = np.column_stack([x, y]).reshape(-1, 1, 2)
    seg = np.concatenate([pts[:-1], pts[1:]], axis=1)
    lc = LineCollection(seg, cmap=MAPA_TRACAO, norm=plt.Normalize(T.min(), T.max()), capstyle='round')
    lc.set_array((T[:-1] + T[1:]) / 2)
    lc.set_linewidth(lw)
    ax.add_collection(lc)
    cb = fig.colorbar(lc, ax=ax, pad=0.02, fraction=0.045)
    cb.set_label(rotulo)
    cb.outline.set_edgecolor(GRADE)
    cb.ax.yaxis.set_major_formatter(mpl.ticker.FuncFormatter(lambda v, _: f'{v:g}'.replace('.', ',')))
    return lc


def salvar(fig, nome, *outras_pastas):
    # Texto/Imagens só existe na pasta do TCC; num clone do repositório, só as outras pastas
    pastas = ([IMAGENS] if IMAGENS.parent.exists() else []) + list(outras_pastas)
    for pasta in pastas:
        Path(pasta).mkdir(parents=True, exist_ok=True)
        fig.savefig(Path(pasta) / f'{nome}.png')
    plt.close(fig)
    print('salvo:', nome)
