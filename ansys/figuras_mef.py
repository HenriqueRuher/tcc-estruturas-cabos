# Gera as figuras do Capitulo 5 (MEF) do Texto/Latex.tex a partir dos
# resultados do ANSYS ja exportados para o visualizador (dados.js e casos.js)
# e da solucao analitica do Estudo de Caso #3 (recalculada aqui).
#
# Uso: python figuras_mef.py   (salva em ./figuras/)

import json
import sys
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch
from scipy.optimize import root

AQUI = Path(__file__).resolve().parent
SAIDA = AQUI / 'figuras'
sys.path.insert(0, str(AQUI.parent))
import estilo_tcc as E  # noqa: E402  (estilo único dos gráficos do TCC)
E.aplicar()
SAIDA.mkdir(parents=True, exist_ok=True)


def ler_js(nome, var):
    txt = (AQUI.parent / 'visualizador' / nome).read_text(encoding='utf-8').strip()
    return json.loads(txt[len(f'window.{var} = '):].rstrip(';'))


SIM = ler_js('dados.js', 'SIM')
CASOS = ler_js('casos.js', 'CASOS')
par = SIM['params']
A, B, C = (np.array(par[k], float) for k in 'ABC')
ANC = {'A–P': A, 'B–P': B, 'C–P': C}
CORES = {'A–P': E.C1, 'B–P': E.C2, 'C–P': E.C3}

# ---------------------------------------------------------------- analitico
def residuo(X, LA=25, LB=25, LC=30, q1=40, q2=20):
    xp, yp, zp, TA, TB, TC, cA, cB, cC = X
    r = []
    for anc, T, c, q, L in [(A, TA, cA, q1, LA), (B, TB, cB, q1, LB), (C, TC, cC, q2, LC)]:
        H = np.hypot(anc[0] - xp, anc[2] - zp)
        a = T / q
        r.append(a * (np.cosh(H / a + c) - np.cosh(c)) - (anc[1] - yp))
        r.append(a * (np.sinh(H / a + c) - np.sinh(c)) - L)
    HA, HB, HC = (np.hypot(p[0] - xp, p[2] - zp) for p in (A, B, C))
    r.append(TA * (A[0] - xp) / HA + TB * (B[0] - xp) / HB + TC * (C[0] - xp) / HC)
    r.append(TA * (A[2] - zp) / HA + TB * (B[2] - zp) / HB + TC * (C[2] - zp) / HC)
    r.append(TA * np.sinh(cA) + TB * np.sinh(cB) + TC * np.sinh(cC))
    return r


sol = root(residuo, [20, 6, 2, 800, 800, 180, -.5, -.5, -.5], method='hybr')
assert sol.success
xp, yp, zp, TA, TB, TC, cA, cB, cC = sol.x
P_an = np.array([xp, yp, zp])
AN = {'A–P': (TA, cA, 40), 'B–P': (TB, cB, 40), 'C–P': (TC, cC, 20)}
print('analitico: P =', np.round(P_an, 3), ' T0 =', np.round([TA, TB, TC], 2))

# ---------------------------------------------------------------- MEF
nos0 = np.array(SIM['nos0'])
fin = SIM['frames'][-1]
pos = nos0 + np.array(fin['u'])
P_fem = pos[SIM['noP']]
print('MEF: P =', np.round(P_fem, 3))

# ---------------------------------------------------------------- erro RMS
# Erro por minimos quadrados entre os nos do MEF e a catenaria analitica:
# E_RMS = sqrt(mean(d_k^2)), com d_k a menor distancia do no k a curva.
#  - "posicao": distancia 3D absoluta (inclui o deslocamento do no P);
#  - "forma": perfil no plano vertical de cada trecho, cada modelo com a
#    origem no seu proprio P (isola o erro de forma da curva).
def dist_min(pts, curva):
    return np.array([np.min(np.linalg.norm(curva - p, axis=1)) for p in pts])


print('erro RMS (minimos quadrados) MEF x analitico:')
for cab in SIM['cabos']:
    nome = cab['nome']
    anc = ANC[nome]
    T0, c, q = AN[nome]
    a = T0 / q
    H = np.hypot(anc[0] - P_an[0], anc[2] - P_an[2])
    u = np.array([anc[0] - P_an[0], 0, anc[2] - P_an[2]]) / H
    s = np.linspace(0, H, 20001)
    y = P_an[1] + a * (np.cosh(s / a + c) - np.cosh(c))
    pts = pos[cab['nos']]
    d3 = dist_min(pts, P_an + np.outer(s, u) + np.outer(y - P_an[1], [0, 1, 0]))
    perfil = np.c_[np.hypot(pts[:, 0] - P_fem[0], pts[:, 2] - P_fem[2]), pts[:, 1]]
    d2 = dist_min(perfil, np.c_[s, y])
    L = {'A–P': par['LA'], 'B–P': par['LB'], 'C–P': par['LC']}[nome]
    rms3, rms2 = np.sqrt(np.mean(d3 ** 2)), np.sqrt(np.mean(d2 ** 2))
    print(f'  {nome}: posicao RMS {rms3:.3f} m (max {d3.max():.3f}, {100 * rms3 / L:.2f}% de L)'
          f' | forma RMS {rms2:.3f} m (max {d2.max():.3f}, {100 * rms2 / L:.2f}% de L)')
print(f'  |P_MEF - P_analitico| = {np.linalg.norm(P_fem - P_an):.3f} m')


# ---- Figura 1: perfis MEF x analitico (plano vertical local de cada trecho)
fig, axs = E.figura(3, largura=13, altura=4.2, sharey=True)
for ax, cab in zip(axs, SIM['cabos']):
    nome = cab['nome']
    anc = ANC[nome]
    T0, c, q = AN[nome]
    a = T0 / q
    H = np.hypot(anc[0] - P_an[0], anc[2] - P_an[2])
    r = np.linspace(0, H, 200)
    ax.plot(r, P_an[1] + a * (np.cosh(r / a + c) - np.cosh(c)), '-', color=E.ANALITICO, lw=1.8, label='Analítico')
    pts = pos[cab['nos']]
    r_f = np.hypot(pts[:, 0] - P_fem[0], pts[:, 2] - P_fem[2])
    ax.plot(r_f, pts[:, 1], 'o', ms=4, mfc='white', mew=1.3, color=CORES[nome], label='MEF (Ansys)')
    ax.set_title(f'Trecho {nome}', color=CORES[nome])
    ax.set_xlabel('Distância horizontal a partir de P [m]')
axs[0].set_ylabel('Elevação $y$ [m]')
axs[0].legend(loc='upper left')
fig.tight_layout()
E.salvar(fig, 'MEF_Perfis_Comparacao', SAIDA)

# ---- Figura 2: forca axial N e componente horizontal T0 ao longo do cabo
fig, axs = E.figura(2, largura=12, altura=4.2)
for cab in SIM['cabos']:
    nome = cab['nome']
    if nome == 'B–P':  # identico ao A-P por simetria (curvas sobrepostas)
        continue
    rot = 'A–P = B–P' if nome == 'A–P' else nome
    pts = pos[cab['nos']]
    d = np.diff(pts, axis=0)
    comp = np.linalg.norm(d, axis=1)
    s_meio = np.concatenate([[0], np.cumsum(comp)])[:-1] + comp / 2
    N = np.array([fin['b'][e][0] for e in cab['elems']])
    T0 = N * np.hypot(d[:, 0], d[:, 2]) / comp
    meio = (s_meio > 0.25 * s_meio[-1]) & (s_meio < 0.75 * s_meio[-1])
    print(f'{nome}: N max {N.max():.1f}  N min {N.min():.1f}  T0 junto a P {T0[-1]:.2f}  '
          f'T0 medio no trecho central {T0[meio].mean():.2f}  T0 min/max {T0.min():.1f}/{T0.max():.1f}')
    axs[0].plot(s_meio, N, color=CORES[nome], label=rot)
    axs[1].plot(s_meio, T0, color=CORES[nome], label=f'{rot} (MEF)')
    axs[1].axhline(AN[nome][0], color=E.ANALITICO, ls='--', lw=1.3)
axs[0].set_title('Força axial $N$')
axs[1].set_title('Componente horizontal $T_0 = N\\cos\\varphi$')
for ax in axs:
    ax.set_xlabel('Posição ao longo do trecho, da ancoragem até P [m]')
    ax.set_ylabel('[N]')
axs[0].legend()
axs[1].plot([], [], '--', color=E.ANALITICO, lw=1.3, label='Analítico ($T_0$ constante)')
axs[1].legend(loc='center right')
fig.tight_layout()
E.salvar(fig, 'MEF_Tracao_Ao_Longo', SAIDA)

# ---- Figura 3: historico de convergencia (posicao de P x fator de carga)
fat = [0] + [f['fator'] for f in SIM['frames']]
Ps = [nos0[SIM['noP']]] + [nos0[SIM['noP']] + np.array(f['u'][SIM['noP']]) for f in SIM['frames']]
Ps = np.array(Ps)
fig, ax = E.figura(largura=7.5, altura=4.2)
ax.plot(fat, Ps[:, 1], 'o-', ms=3, lw=1.6, color=E.C1, label='$y_P$ (MEF)')
ax.plot(fat, Ps[:, 2], 's-', ms=3, lw=1.6, color=E.C2, label='$z_P$ (MEF)')
ax.axhline(P_an[1], color=E.ANALITICO, ls='--', lw=1.3, label='$y_P$ analítico')
ax.axhline(P_an[2], color=E.ANALITICO, ls=':', lw=1.6, label='$z_P$ analítico')
ax.set_xlabel('Fator de carga (fração do peso próprio aplicado)')
ax.set_ylabel('Coordenada do nó P [m]')
ax.legend()
fig.tight_layout()
E.salvar(fig, 'MEF_Convergencia_NoP', SAIDA)

# ---- Figura 4: casos de forca concentrada (casos_forca.py): cabo carregado x T0
# linhas = cabo carregado (C-P, A-P); colunas = T0 do trecho carregado e do outro
# (5 das 10 posicoes, para legibilidade; F = 0 e o caso de referencia sem forca)
fig, axs = E.figura(2, 2, largura=12, altura=8, sharex=True)
base = CASOS.get('base')
pos_fig = [0.15, 0.35, 0.55, 0.75, 0.95]
for lin, (cabo, iC, iO, nC, nO) in enumerate([('C-P', 2, 0, 'C', 'A'), ('A-P', 0, 2, 'A', 'C')]):
    for p in pos_fig:
        cs = sorted((c for c in CASOS['casos'] if c['cabo'] == cabo and c['pos'] == p), key=lambda c: c['mag'])
        F = ([0] if base else []) + [c['mag'] for c in cs]
        tc = ([base['T0'][iC]] if base else []) + [c['T0'][iC] for c in cs]
        to = ([base['T0'][iO]] if base else []) + [c['T0'][iO] for c in cs]
        rot = f'{p:.0%} de {cabo[0]}→P'.replace('.', ',')
        axs[lin, 0].plot(F, tc, 'o-', ms=3.5, label=rot)
        axs[lin, 1].plot(F, to, 'o-', ms=3.5, label=rot)
    axs[lin, 0].set_title(f'Força no trecho {cabo.replace("-", "–")}: $T_{{0,{nC}}}$ (trecho carregado)')
    axs[lin, 1].set_title(f'Força no trecho {cabo.replace("-", "–")}: $T_{{0,{nO}}}$')
    axs[lin, 0].legend(title='Posição da força', fontsize=9)
for ax in axs.flat:
    ax.set_ylabel('[N]')
for ax in axs[1]:
    ax.set_xlabel('Intensidade da força concentrada $F$ [N]')
fig.tight_layout()
E.salvar(fig, 'MEF_Casos_ForcaConcentrada', SAIDA)

# ---- Figura 4b: estudo da rigidez à flexão (valores da Tabela tab:mef_rigidez do texto,
# obtidos com estudo_rigidez.py; analítico: P = (20,00; 6,36; 2,30) m, T0,C = 186,69 N)
EI = np.array([1571, 157.1, 15.71])
ESTUDO = {  # yP, zP, T0C
    'peso igual em todos os nós (versão anterior)': ([6.98, 6.57, 6.43], [3.21, 2.72, 2.59], [227.0, 218.6, 217.3]),
    'peso pelo comprimento de cada elemento (corrigido)': ([6.97, 6.55, 6.41], [3.03, 2.49, 2.34], [195.1, 187.7, 186.9]),
}
fig, axs = E.figura(2, largura=11, altura=4.2)
for (rot, (yP, zP, T0C)), cor, mk in zip(ESTUDO.items(), (E.DESTAQUE, E.C1), ('s', 'o')):
    dist = np.hypot(np.array(yP) - P_an[1], np.array(zP) - P_an[2])
    axs[0].plot(EI, dist, marker=mk, color=cor, label=rot)
    axs[1].plot(EI, 100 * (np.array(T0C) / AN['C–P'][0] - 1), marker=mk, color=cor)
axs[0].set_ylabel('Distância de P à posição analítica [m]')
axs[1].set_ylabel('Erro em $T_{0,C}$ [%]')
for ax in axs:
    ax.set_xscale('log')
    ax.invert_xaxis()
    ax.set_xlabel('Rigidez à flexão $EI$ [N·m²]  (← maior · menor →)')
    ax.set_ylim(bottom=0)
axs[0].xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f'{v:g}'.replace('.', ',')))
axs[1].xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f'{v:g}'.replace('.', ',')))
fig.tight_layout()
E.legenda(axs[0], ncol=2).set_bbox_to_anchor((1.1, -0.2))
E.salvar(fig, 'MEF_Estudo_Rigidez', SAIDA)

# ---- Figura 5: esquema do elemento infinitesimal (catenaria elastica)
fig, ax = plt.subplots(figsize=(7, 4.6))
ax.set_axis_off()
ax.set_aspect('equal')
t = np.linspace(0, 1, 100)
x = 1 + 4 * t
y = 1 + 0.9 * (2 * t - 1) ** 2 * 1.6 - 0.2
ax.plot(x, y, color='tab:blue', lw=4)
p0, p1 = (x[0], y[0]), (x[-1], y[-1])
seta = dict(arrowstyle='-|>', mutation_scale=18, lw=2.2)
ax.add_patch(FancyArrowPatch(p0, (p0[0] - 1.2, p0[1] + 1.6), color='k', **seta))
ax.add_patch(FancyArrowPatch(p1, (p1[0] + 1.3, p1[1] + 1.7), color='k', **seta))
ax.add_patch(FancyArrowPatch((3, 0.85), (3, -0.6), color='red', **seta))
ax.text(p0[0] - 1.9, p0[1] + 1.7, '$T(s_0)$', fontsize=14)
ax.text(p1[0] + 0.6, p1[1] + 1.9, '$T(s_0) + dT$', fontsize=14)
ax.text(3.15, -0.45, '$q\\,ds_0$', fontsize=14, color='red')
ax.text(1.9, 3.9, '$ds_0 \\rightarrow ds = (1+\\varepsilon)\\,ds_0$', fontsize=12, color='tab:blue')
ax.plot([p0[0] - 1.3, p0[0]], [p0[1], p0[1]], 'k--', lw=1)
ax.plot([p1[0], p1[0] + 1.3], [p1[1], p1[1]], 'k--', lw=1)
ax.text(p0[0] - 1.0, p0[1] + 0.3, '$\\theta$', fontsize=13)
ax.text(p1[0] + 0.55, p1[1] + 0.3, '$\\theta + d\\theta$', fontsize=13)
ax.add_patch(FancyArrowPatch((0.2, -0.9), (1.4, -0.9), color='gray', arrowstyle='-|>', mutation_scale=14))
ax.add_patch(FancyArrowPatch((0.2, -0.9), (0.2, 0.3), color='gray', arrowstyle='-|>', mutation_scale=14))
ax.text(1.45, -1.0, '$x$', color='gray', fontsize=12)
ax.text(0.05, 0.4, '$y$', color='gray', fontsize=12)
ax.set_xlim(-1.2, 7.5)
ax.set_ylim(-1.2, 4.6)
ax.set_title('Elemento infinitesimal de cabo elástico', fontsize=13)
fig.tight_layout()
fig.savefig(SAIDA / 'Esquema_ElementoInfinitesimal.png', dpi=200)
plt.close(fig)

print('figuras salvas em', SAIDA)
