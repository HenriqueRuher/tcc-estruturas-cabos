"""Esquema da montagem do experimento (Capítulo 6): os três ramos na configuração de equilíbrio do
modelo analítico (resultados/caso_analitico.json), em perspectiva, com fixações, nó P, comprimentos e η.

Uso:  python figura_esquema.py      -> Texto/Imagens/Exp_Esquema.png (e ansys/figuras/)
"""
import json
import sys

import matplotlib.pyplot as plt
import numpy as np

import dados_experimento as X

sys.path.insert(0, str(X.RAIZ))
import estilo_tcc as E  # noqa: E402

E.aplicar()
d = json.loads((X.RESULTADOS / 'caso_analitico.json').read_text(encoding='utf-8'))
CORES = {'A': E.C1, 'B': E.C2, 'C': E.C3}
NOMES = {'A': 'A (perfil na parede)', 'B': 'B (suporte de aço)', 'C': 'C (poste com peso)'}
CORRENTE = {'A': 'corrente de 6 mm', 'B': 'corrente de 6 mm', 'C': 'corrente de 5 mm'}

fig = plt.figure(figsize=(8.0, 5.6))
ax = fig.add_subplot(projection='3d')
P = np.array(d['P_modelo_m'])
for k, r in d['ramos'].items():
    c = np.array(r['curva'])                      # modelo: y vertical -> plotar (x, z, y)
    ax.plot(c[:, 0], c[:, 2], c[:, 1], color=CORES[k], lw=3,
            label=f'{k}–P: {CORRENTE[k]}, $L$ = {r["L"]:.3f} m'.replace('.', ','))
    f = c[-1]
    ax.scatter(f[0], f[2], f[1], marker='^', s=70, color='white', edgecolor=E.TINTA, lw=1.4, zorder=5)
    ax.text(f[0], f[2], f[1] + 0.07, NOMES[k], ha='center', fontsize=9.5, weight='bold')
ax.scatter(*P[[0, 2, 1]], s=70, color=E.DESTAQUE, edgecolor=E.TINTA, zorder=6)
ax.text(P[0] + 0.05, P[2], P[1] - 0.12, 'P (nó)', fontsize=10, weight='bold', color=E.DESTAQUE)
ax.text2D(0.02, 0.97, r'$\eta = L_{AP}/(L_{AP}+L_{BP}) \approx 0{,}554$', transform=ax.transAxes, fontsize=10)
ax.set_xlabel('$x$ [m]')
ax.set_ylabel('$z$ [m]')
ax.set_zlabel('altura $y$ [m]')
ax.set_box_aspect((1.2, 1.2, 1.0))
ax.view_init(elev=18, azim=-110)
for eixo in (ax.xaxis, ax.yaxis, ax.zaxis):
    eixo.pane.set_facecolor('white')
    eixo.pane.set_edgecolor(E.GRADE)
    eixo.set_major_formatter(plt.FuncFormatter(lambda v, _: f'{v:.1f}'.replace('.', ',')))
ax.legend(loc='upper right', frameon=False, fontsize=9.5)
fig.tight_layout()
E.salvar(fig, 'Exp_Esquema', X.RAIZ / 'ansys' / 'figuras')
