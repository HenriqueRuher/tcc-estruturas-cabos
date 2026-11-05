"""Dados medidos do ensaio estático com correntes e ferramentas comuns da comparação.

Tudo o que é medido está aqui, num lugar só. Os outros scripts da pasta importam daqui:
    ajuste_ramos.py -> caso_analitico.py -> (Ansys) -> comparar.py

Eixos
-----
Qualisys (dados):  X, Y horizontais, Z para cima, em mm.
Modelo (codigo5 e catenaria3d.inp):  Y é a vertical (o peso vai em -Y), A e B no plano z = 0,
C em z > 0, em metros, N/m.  A passagem é uma transformação rígida explícita (Eixos, abaixo):
    x = (p - A)·e1 / 1000      e1 = direção horizontal de A para B
    y = Z / 1000               a altura continua sendo a do Qualisys
    z = (p - A)·e3 / 1000      e3 = e1 × Z  (triedro direito; C cai em z > 0)
"""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
TSV = RAIZ / 'experimento' / 'dados' / 'Estatica_corrente.tsv'
RESULTADOS = AQUI / 'resultados'
RESULTADOS.mkdir(exist_ok=True)

# ---------------------------------------------------------------- medidas (balança e trena)
G = 9.80665
L1 = 2.004                  # corrente grossa, A-B [m]
M1 = 1.373                  # massa da corrente grossa nesses 2,004 m [kg]
L2_REAL = 2.002             # corrente média inteira [m]
M2 = 0.948                  # massa da corrente média inteira [kg]
LC = 1.425                  # trecho efetivo da média, entre o poste e o nó [m]
ETA = 0.5539                # medido a partir do perfil (provável): L_A = eta*L1
LA = ETA * L1               # 1,110 m (ramo do perfil, C1)
LB = (1 - ETA) * L1         # 0,894 m (ramo do suporte, C3)
Q1_KG = M1 / L1             # 0,6851 kg/m
Q2_KG = M2 / L2_REAL        # 0,4735 kg/m
Q1 = Q1_KG * G              # N/m
Q2 = Q2_KG * G              # N/m
RES_BALANCA = 0.002         # resolução da Toledo até 6 kg [kg]

# C1 = perfil (grossa), C2 = poste (média), C3 = suporte (grossa).  _01 = marcador mais longe do nó.
RAMOS = {'C1': dict(fix='A', L=LA, q=Q1, nome='A–P (perfil)'),
         'C2': dict(fix='C', L=LC, q=Q2, nome='C–P (poste)'),
         'C3': dict(fix='B', L=LB, q=Q1, nome='B–P (suporte)')}


def ler_tsv():
    """-> (nomes, D[quadro, marcador, eixo]) em mm"""
    linhas = TSV.read_text(encoding='utf-8', errors='replace').splitlines()
    nomes = next(l for l in linhas if l.startswith('MARKER_NAMES')).split('\t')[1:]
    i0 = next(i for i, l in enumerate(linhas) if l.startswith('TRAJECTORY_TYPES')) + 1
    D = np.array([[float(v) for v in l.split('\t')[:3 * len(nomes)]] for l in linhas[i0:] if l.strip()])
    return nomes, D.reshape(len(D), len(nomes), 3)


def medianas():
    nomes, D = ler_tsv()
    return {n: np.median(D[:, i], axis=0) for i, n in enumerate(nomes)}


# ---------------------------------------------------------------- catenária num plano vertical
def plano_vertical(pts):
    """reta horizontal de melhor ajuste -> origem (2), direção e (2, apontando do nó para fora)"""
    h = pts[:, :2]
    c = h.mean(0)
    e = np.linalg.svd(h - c)[2][0]
    if (h[-1] - h[0]) @ e < 0:
        e = -e
    return c, e


def _pe_normal(x, z, a, x0, z0):
    """pé da normal de (x, z) na catenária z0 + a(cosh((u-x0)/a) - 1): Newton em u"""
    u = np.array(x, float)
    for _ in range(30):
        t = (u - x0) / a
        zc, d1, d2 = z0 + a * (np.cosh(t) - 1), np.sinh(t), np.cosh(t) / a
        f = (u - x) + (zc - z) * d1
        h = 1 + d1 ** 2 + (zc - z) * d2
        u = u - np.clip(f / np.where(h > 0.1, h, 1 + d1 ** 2), -30, 30)   # passo limitado
    return u


def ajustar_catenaria(x, z, p0=None):
    """mínimos quadrados da DISTÂNCIA NORMAL à curva.  (O resíduo vertical exagera o erro
    nos pontos íngremes: a 70° de inclinação, 3 mm de distância viram 9 mm na vertical.)
    Parâmetros a = T0/q, x0, z0 (vértice).  -> (a, x0, z0), resíduos normais"""
    def res(p):
        a, x0, z0 = p
        u = _pe_normal(x, z, a, x0, z0)
        zc = z0 + a * (np.cosh((u - x0) / a) - 1)
        return np.sign(z - zc) * np.hypot(x - u, z - zc)
    def res1(p):      # 1a aproximação (resíduo vertical x cosseno): só para achar a partida
        a, x0, z0 = p
        t = (x - x0) / a
        return (z - z0 - a * (np.cosh(t) - 1)) / np.cosh(t)
    lim = ([50, -5000, -5000], [5000, 5000, 5000])
    if p0 is None:
        p0 = min((least_squares(res1, [a, x0, z.min() - 20], bounds=lim, x_scale=100)
                  for a in (200, 400, 800) for x0 in np.linspace(x.min() - 200, x.max(), 5)),
                 key=lambda s: s.cost).x
    s = least_squares(res, p0, bounds=lim, x_scale=100)
    return s.x, res(s.x)


def ajustar_ramo(no, marc, L_mm=None, p0=None):
    """no: (3,), marc: (3,3) do mais perto (_03) ao mais longe (_01) do nó [mm].
    -> dicionário do ajuste; com L_mm, prolonga a catenária até esse arco a partir do nó."""
    pts = np.vstack([no, marc])
    c, e = plano_vertical(pts)
    x = (pts[:, :2] - c) @ e
    off = (pts[:, :2] - c) @ np.array([-e[1], e[0]])
    (a, x0, z0), res = ajustar_catenaria(x, pts[:, 2], p0)
    u = _pe_normal(x, pts[:, 2], a, x0, z0)        # posição dos pés na curva
    arco = a * (np.sinh((u - x0) / a) - np.sinh((u[0] - x0) / a))
    r = dict(c=c, e=e, a=a, x0=x0, z0=z0, x=x, off=off, res=res, u=u, s=arco, p=[a, x0, z0],
             tan_no=np.sinh((u[0] - x0) / a))
    if L_mm is not None:
        r['fix'] = ponto_no_ramo(r, L_mm)
    return r


def ponto_no_ramo(r, s):
    """ponto 3D (mm) a um arco s (mm) do nó, sobre a catenária ajustada do ramo"""
    a, x0, z0 = r['a'], r['x0'], r['z0']
    u = x0 + a * np.arcsinh(np.sinh((r['u'][0] - x0) / a) + s / a)
    return np.array([*(r['c'] + u * r['e']), z0 + a * (np.cosh((u - x0) / a) - 1)])


def ajustar_todos(P, L=None):
    """P: dicionário nome -> posição [mm]; L: {'C1': mm, ...} para prolongar"""
    return {r: ajustar_ramo(P['centro'], np.array([P[f'{r}_03'], P[f'{r}_02'], P[f'{r}_01']]),
                            None if L is None else L[r]) for r in RAMOS}


# ---------------------------------------------------------------- eixos Qualisys <-> modelo
class Eixos:
    """transformação rígida explícita do Qualisys (mm) para o sistema do modelo (m)"""

    def __init__(self, A, B):
        self.A = np.array(A, float)
        d = (np.array(B, float) - self.A)[:2]
        self.e1 = np.array([*(d / np.linalg.norm(d)), 0.0])
        self.ez = np.array([0.0, 0.0, 1.0])
        self.e3 = np.cross(self.e1, self.ez)

    def para_modelo(self, p):
        p = np.asarray(p, float)
        d = p - self.A
        return np.stack([d @ self.e1, p[..., 2], d @ self.e3], axis=-1) / 1000

    def para_qualisys(self, m):
        m = np.asarray(m, float) * 1000
        h = np.multiply.outer(m[..., 0], self.e1) + np.multiply.outer(m[..., 2], self.e3)
        return self.A * np.array([1, 1, 0]) + h + np.multiply.outer(m[..., 1], self.ez)

    def json(self):
        return dict(A_qualisys_mm=self.A.tolist(), e1=self.e1.tolist(), e3=self.e3.tolist())


def eixos_salvos():
    d = ler_json('ajuste_ramos.json')
    fx = d['ramos']
    return Eixos(fx['C1']['fixacao'], fx['C3']['fixacao'])


def salvar_json(nome, obj):
    def conv(o):
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, np.generic):
            return o.item()
        raise TypeError(type(o))
    (RESULTADOS / nome).write_text(json.dumps(obj, indent=1, ensure_ascii=False, default=conv), encoding='utf8')


def ler_json(nome):
    return json.loads((RESULTADOS / nome).read_text(encoding='utf8'))
