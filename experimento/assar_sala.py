"""Assa ("bake") as texturas do modelo 3D da sala a partir do panorama e das fotos do piso.

Entradas: ../visualizador/img/lab/ambiente.jpg e ambiente_mascara.png (gerar_ambiente.py),
          ../visualizador/lab/proxies.js (estimar_proxies.py), fotos/4_ambiente/chao_*.jpg.
Saídas:   ../visualizador/img/lab/sala_atlas.jpg (atlas até 4096x4096)
          ../visualizador/lab/sala.js  (window.LAB_SALA = { partes: [{nome, pos, nor, uv, idx}] })

Sistema (mm): origem no chão sob a câmera (C = (0, 0, 1500)); +X para o portão; +Y para a parede
da porta; Z para cima. UV com v = 0 na linha de cima do atlas.

Para cada texel no ponto P: cor do panorama na direção P - C, com teste de oclusão contra os
proxies (se o raio C->P bate antes numa caixa, o texel está na "sombra de projeção").
Preenchimento do que não tem foto:
  piso    -> textura de lajotas montada das fotos chao_* (retificadas pela grade de 300 mm),
             com a cor ajustada à do piso fotografado e mistura multibanda (pirâmide laplaciana);
  paredes -> síntese da própria parede: interpolação ao longo das linhas horizontais (mantém
             eletrocalhas) + ruído com o espectro medido na parede visível, mistura multibanda;
  teto    -> o panorama já traz o teto sintético coerente com a caixa; oclusões como paredes;
  proxies -> estica a cor da borda visível (vizinho mais próximo) ou cor média da caixa.
Cada ilha do atlas tem 12 px de margem com conteúdo assado da continuação da superfície.

Uso: python assar_sala.py [--previa DIR]
"""
import json
import math
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, gaussian_filter, distance_transform_edt

AQUI = Path(__file__).resolve().parent
VIS = AQUI.parent / 'visualizador'
FOTOS = AQUI / 'fotos' / '4_ambiente'
C = np.array([0.0, 0.0, 1500.0])
U_X = 0.818
ATLAS = 4096
MARGEM = 12
LAJOTA = 300.0
PX_LAJ = 120                 # px por lajota na textura de piso (2,5 mm/px)
N_LAJ = 14                   # textura de piso = 14 x 14 lajotas = 4,2 m (repetível)
ORIGEM_QTM = np.array([150.0, -800.0])   # área do experimento: em frente aos perfis (parede y_oposta), ~1,5 m para dentro

# vão do portão (na parede x = x_portao): centralizado, de canto a canto com ~300 mm de ombreira
# (ombreiras em u 0,855 e 0,748 -> y = -1 278 e +2 541), até ~4 000 mm de altura (arco a +24,5°)
VAO = dict(y0=-1278.0, y1=2541.0, z1=4000.0)
FORA = 6000.0                # plano do jardim, além do portão


FF_POSE = None
PAREDES_Y_OPOSTA = -1586.0


# ---------------------------------------------------------------- entradas
def ler_proxies():
    txt = (VIS / 'lab' / 'proxies.js').read_text(encoding='utf-8')
    par = json.loads(re.search(r'LAB_PAREDES = (\{.*?\});', txt).group(1))
    lst = json.loads(re.search(r'LAB_PROXIES = (\[.*?\]);', txt, re.S).group(1))
    # proxies marcados como 'antigo' (não existem no estado final) ficam fora do modelo
    return par, [b for b in lst if not b.get('antigo')]


def ler_panorama():
    eq = np.asarray(Image.open(VIS / 'img' / 'lab' / 'ambiente.jpg').convert('RGB')).astype(np.float32) / 255
    m = Image.open(VIS / 'img' / 'lab' / 'ambiente_mascara.png').convert('L').resize((eq.shape[1], eq.shape[0]), Image.BILINEAR)
    return eq, np.asarray(m).astype(np.float32) / 255


def amostrar_pano(eq, mask, D):
    """Cor e máscara do panorama nas direções D (..., 3)."""
    H, W = eq.shape[:2]
    al = np.arctan2(D[..., 1], D[..., 0])
    th = np.arctan2(D[..., 2], np.hypot(D[..., 0], D[..., 1]))
    u = (U_X - al / (2 * np.pi)) % 1
    v = 0.5 - th / np.pi
    X = u * W - 0.5; Y = np.clip(v * H - 0.5, 0, H - 1)
    cor = np.stack([map_coordinates(eq[..., c], [Y, X], order=1, mode='grid-wrap') for c in range(3)], -1)
    m = map_coordinates(mask, [Y, X], order=1, mode='grid-wrap')
    return cor, m


# ---------------------------------------------------------------- oclusão (raio C -> P contra caixas)
def caixa_local(b):
    g = math.radians(b['giro'])
    R = np.array([[math.cos(g), -math.sin(g), 0], [math.sin(g), math.cos(g), 0], [0, 0, 1]])
    return np.array(b['centro'], float), R, np.array(b['tamanho'], float) / 2


def ocluido(P, caixas, exceto=None):
    """True onde o segmento C->P atravessa alguma caixa antes de chegar a P."""
    sh = P.shape[:-1]
    Pf = P.reshape(-1, 3)
    D = Pf - C
    occ = np.zeros(len(Pf), bool)
    for k, b in enumerate(caixas):
        if k == exceto:
            continue
        c, R, h = caixa_local(b)
        o = (C - c) @ R          # coordenadas locais
        d = D @ R
        with np.errstate(divide='ignore', invalid='ignore'):
            inv = 1.0 / d
            t0 = (-h - o) * inv
            t1 = (h - o) * inv
        tmin = np.nanmax(np.minimum(t0, t1), 1)
        tmax = np.nanmin(np.maximum(t0, t1), 1)
        occ |= (tmax >= tmin) & (tmin < 0.995) & (tmax > 0)
    return occ.reshape(sh)


# ---------------------------------------------------------------- mistura multibanda
def piramide_mistura(a, b, w, niveis=6, w_finos=None):
    """Mistura a (onde w=1) e b (w=0) por pirâmide laplaciana. w_finos: pesos opcionais para os
    2 níveis mais finos (ex.: usar o detalhe de b mesmo onde há foto)."""
    a = a.astype(np.float32); b = b.astype(np.float32); w = w.astype(np.float32)
    ga, gb, gw = [a], [b], [w]
    for _ in range(niveis):
        ga.append(cv2.pyrDown(ga[-1])); gb.append(cv2.pyrDown(gb[-1])); gw.append(cv2.pyrDown(gw[-1]))
    out = ga[-1] * gw[-1][..., None] + gb[-1] * (1 - gw[-1][..., None])
    for i in range(niveis - 1, -1, -1):
        sz = (ga[i].shape[1], ga[i].shape[0])
        la = ga[i] - cv2.pyrUp(ga[i + 1], dstsize=sz)
        lb = gb[i] - cv2.pyrUp(gb[i + 1], dstsize=sz)
        wi = gw[i]
        if w_finos is not None and i < 2:
            wi = wi * w_finos
        out = cv2.pyrUp(out, dstsize=sz) + la * wi[..., None] + lb * (1 - wi[..., None])
    return out


def conv_normalizada(img, w, sigma):
    num = np.stack([gaussian_filter(img[..., c] * w, sigma) for c in range(img.shape[-1])], -1)
    den = gaussian_filter(w, sigma)[..., None]
    return num / np.maximum(den, 1e-6), den[..., 0]


# ---------------------------------------------------------------- 2. textura de piso a partir das fotos
def _segmentos(g):
    e = cv2.Canny(cv2.GaussianBlur(g, (3, 3), 0), 20, 50)
    L = cv2.HoughLinesP(e, 1, np.pi / 720, 40, minLineLength=50, maxLineGap=4)
    return L.reshape(-1, 4).astype(float) if L is not None else np.zeros((0, 4))


def _linhas(s):
    p = np.c_[s[:, 0:2], np.ones(len(s))]; q = np.c_[s[:, 2:4], np.ones(len(s))]
    l = np.cross(p, q)
    return l / np.linalg.norm(l[:, :2], axis=1, keepdims=True)


def _inliers(s, vp, tol):
    mid = (s[:, 0:2] + s[:, 2:4]) / 2; d = s[:, 2:4] - s[:, 0:2]
    tv = vp[:2] / vp[2] - mid if abs(vp[2]) > 1e-9 else np.tile(vp[:2], (len(s), 1))
    c = np.abs((d * tv).sum(1)) / (np.linalg.norm(d, axis=1) * np.linalg.norm(tv, axis=1) + 1e-9)
    return np.degrees(np.arccos(np.clip(c, -1, 1))) < tol


def _ponto_fuga(s, rng):
    l = _linhas(s); w = np.hypot(s[:, 2] - s[:, 0], s[:, 3] - s[:, 1]); best = (0, None, None)
    for _ in range(3000):
        i, j = rng.choice(len(s), 2, replace=False)
        vp = np.cross(l[i], l[j])
        if np.linalg.norm(vp) < 1e-12:
            continue
        m = _inliers(s, vp, 1.5)
        if w[m].sum() > best[0]:
            best = (w[m].sum(), vp, m)
    vp = np.linalg.svd(l[best[2]] * w[best[2], None])[2][-1]
    return vp, _inliers(s, vp, 2.0)


def _periodo_fase(perfil):
    """Período (px) e fase das juntas num perfil 1D de 'escuridão'."""
    p = perfil - perfil.mean()
    ac = np.correlate(p, p, 'full')[len(p) - 1:]
    lo = 80   # lajota com menos de 80 px na foto retificada = harmônico/ruído
    T0 = lo + np.argmax(ac[lo:min(len(ac), 600)])
    # refina com pente
    melhor = (-1e9, T0, 0)
    for T in np.arange(T0 * 0.95, T0 * 1.05, 0.25):
        for f in np.arange(0, T, 1.0):
            idx = np.arange(f, len(p), T).astype(int)
            sc = p[idx].mean()
            if sc > melhor[0]:
                melhor = (sc, T, f)
    return melhor[1], melhor[2]


def lajotas_da_foto(k, rng):
    """Retifica a foto pela grade (pontos de fuga) e devolve recortes de lajotas inteiras."""
    im = cv2.imdecode(np.fromfile(str(FOTOS / f'chao_{k:02d}.jpg'), np.uint8), cv2.IMREAD_COLOR)  # caminho com acento
    h, w = im.shape[:2]
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    s = _segmentos(g)
    v1, m1 = _ponto_fuga(s, rng)
    v2, _ = _ponto_fuga(s[~m1], rng)
    p0 = np.array([w / 2, h * 0.85, 1.0])
    Hm = np.linalg.inv(np.c_[v1, v2, p0])
    ys, xs = np.mgrid[int(h * 0.3):h:10, 0:w:10]
    pts = np.c_[xs.ravel(), ys.ravel(), np.ones(xs.size)] @ Hm.T
    ok = pts[:, 2] * (Hm @ p0)[2] > 0
    q = pts[ok, :2] / pts[ok, 2:]
    lo, hi = np.percentile(q, 1, 0), np.percentile(q, 99, 0)
    s0 = 1500 / np.max(hi - lo)
    T = np.array([[s0, 0, -lo[0] * s0], [0, s0, -lo[1] * s0], [0, 0, 1]])
    M = T @ Hm
    sz = (int((hi - lo)[0] * s0) + 1, int((hi - lo)[1] * s0) + 1)
    r = cv2.warpPerspective(im, M, sz, flags=cv2.INTER_CUBIC).astype(np.float32) / 255
    val = cv2.warpPerspective(np.ones((h, w), np.float32), M, sz, flags=cv2.INTER_NEAREST) > 0.5
    val[:int(h * 0)] &= True
    r = r[..., ::-1]
    gr = r.mean(-1)
    esc = np.clip(cv2.GaussianBlur(gr, (0, 0), 3) - gr, 0, None) * val
    Tx, fx = _periodo_fase(esc.sum(0) / np.maximum(val.sum(0), 1))
    Ty, fy = _periodo_fase(esc.sum(1) / np.maximum(val.sum(1), 1))
    # reamostra para PX_LAJ px por lajota, com as juntas em múltiplos de PX_LAJ
    sx, sy = PX_LAJ / Tx, PX_LAJ / Ty
    A = np.array([[sx, 0, -fx * sx], [0, sy, -fy * sy]], np.float32)
    W2, H2 = int(sz[0] * sx), int(sz[1] * sy)
    r2 = cv2.warpAffine(r, A, (W2, H2), flags=cv2.INTER_AREA if sx < 1 else cv2.INTER_CUBIC)
    v2m = cv2.warpAffine(val.astype(np.float32), A, (W2, H2), flags=cv2.INTER_NEAREST) > 0.5
    v2m = cv2.erode(v2m.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    # equaliza a iluminação (gradiente/vinheta): divide pela versão bem borrada
    lum = r2.mean(-1)
    claro = v2m & (lum > np.percentile(lum[v2m], 20))
    ilum, _ = conv_normalizada(r2, claro.astype(np.float32), PX_LAJ * 0.8)
    r2 = r2 / np.maximum(ilum, 1e-3) * np.array([0.86, 0.86, 0.84], np.float32)
    recs = []
    for j in range(H2 // PX_LAJ):
        for i in range(W2 // PX_LAJ):
            y0, x0 = j * PX_LAJ, i * PX_LAJ
            cel = (slice(y0 + 7, y0 + PX_LAJ - 6), slice(x0 + 7, x0 + PX_LAJ - 6))
            if not v2m[y0:y0 + PX_LAJ, x0:x0 + PX_LAJ].all():
                continue
            t = r2[cel]
            l = t.mean(-1)
            sat = (t.max(-1) - t.min(-1))
            if (l < 0.62).mean() > 0.01 or (sat > 0.12).mean() > 0.01 or l.std() > 0.06:
                continue
            # resto de junta na borda do recorte (fase errada): descarta
            bordas = np.r_[l[:4].mean(1), l[-4:].mean(1), l[:, :4].mean(0), l[:, -4:].mean(0)]
            if bordas.min() < l.mean() - 0.035:
                continue
            # tira o brilho/reflexo dentro da placa: divide pela versão borrada da própria placa
            fundo = np.stack([gaussian_filter(t[..., c], 18, mode='reflect') for c in range(3)], -1)
            t = t / np.maximum(fundo, 1e-3) * t.reshape(-1, 3).mean(0)
            nit = cv2.Laplacian(l, cv2.CV_32F).var()
            recs.append((nit, cv2.resize(t, (PX_LAJ - 1, PX_LAJ - 1), interpolation=cv2.INTER_AREA)))
    return recs, (Tx, Ty)


def textura_piso_fotos(semente=3):
    rng = np.random.default_rng(semente)
    pool = []
    for k in (3, 4, 9, 2):
        try:
            recs, T = lajotas_da_foto(k, rng)
        except Exception as e:  # foto sem grade detectável
            print(f'  chao_{k:02d}: falhou ({e})'); continue
        print(f'  chao_{k:02d}: período {T[0]:.1f} x {T[1]:.1f} px, {len(recs)} lajotas inteiras')
        pool += recs
    # só as mais nítidas (as do fundo da foto ficam borradas pela perspectiva)
    pool.sort(key=lambda t: -t[0])
    pool = [p for _, p in pool[:max(12, int(len(pool) * 0.7))]]
    # normaliza a média de cada recorte (o tom de cada placa varia de leve, sorteado abaixo)
    alvo = np.median([p.reshape(-1, 3).mean(0) for p in pool], 0)
    pool = [p / p.reshape(-1, 3).mean(0) * alvo for p in pool]
    print(f'  {len(pool)} lajotas no conjunto; tom médio {alvo.round(3)}')
    N = N_LAJ * PX_LAJ
    tex = np.zeros((N, N, 3), np.float32)
    junta = alvo * 0.70
    ultimo = {}
    for j in range(N_LAJ):
        for i in range(N_LAJ):
            # evita a mesma placa vizinha
            viz = {ultimo.get((i - 1) % N_LAJ * 100 + j), ultimo.get(i * 100 + (j - 1) % N_LAJ)}
            while True:
                q = int(rng.integers(len(pool)))
                if q not in viz or len(pool) < 3:
                    break
            ultimo[i * 100 + j] = q
            t = pool[q]
            t = np.rot90(t, int(rng.integers(4)))
            if rng.random() < 0.5:
                t = t[:, ::-1]
            t = t * (1 + rng.normal(0, 0.012))
            y0, x0 = j * PX_LAJ, i * PX_LAJ
            tex[y0 + 1:y0 + PX_LAJ, x0 + 1:x0 + PX_LAJ] = t
            tex[y0, x0:x0 + PX_LAJ] = junta
            tex[y0:y0 + PX_LAJ, x0] = junta
    # junta com leve borrão (1 px real ~2 mm), repetível (wrap)
    jm = np.zeros((N, N), np.float32); jm[::PX_LAJ, :] = 1; jm[:, ::PX_LAJ] = 1
    jb = gaussian_filter(jm, 0.6, mode='wrap')
    jb = jb / jb.max()
    tex = tex * (1 - 0.25 * jb[..., None]) + junta * 0.25 * jb[..., None]
    return np.clip(tex, 0, 1)


def fase_juntas_panorama(eq, mask, par):
    """Tenta achar a fase da grade de 300 mm no piso fotografado (vista de cima a 5 mm/px)."""
    x = np.arange(-4000, 4000, 5.0); y = np.arange(par['y_oposta'] + 300, par['y_porta'] - 300, 5.0)
    X, Y = np.meshgrid(x, y)
    P = np.stack([X, Y, np.zeros_like(X)], -1)
    cor, m = amostrar_pano(eq, mask, P - C)
    g = cor.mean(-1)
    esc = np.clip(gaussian_filter(g, 2) - g, 0, None) * (m > 0.9)
    res = []
    for perf, coord in [(esc.sum(0), x), (esc.sum(1), y)]:
        ang = 2 * np.pi * coord / LAJOTA
        z = (perf * np.exp(1j * ang)).sum() / (np.abs(perf).sum() + 1e-9)
        res.append((np.angle(z) / (2 * np.pi) * LAJOTA % LAJOTA, abs(z)))
    return res


# ---------------------------------------------------------------- foto do estado final (perfis + piso)
FOTO_FINAL = FOTOS.parent / '5_montagem_final' / 'montagem_final_frente.jpg'
# pontos medidos à mão na foto (px) e suas coordenadas na parede dos perfis (y = y_oposta):
# eixo dos trilhos (380 mm entre eixos; no panorama em x ~ +0,10 e +0,44 m) na altura da barra
# inferior dos braços (1 070 mm) e na linha piso/parede; mais 3 pontos da linha piso/parede.
FF_PTS = [((787, 302), (460, 1070)), ((890, 304), (80, 1070)), ((889, 668), (80, 0)), ((788, 652), (460, 0))]
FF_LINHA = [(1000, 687), (1400, 765), (1200, 726)]
# objetos em primeiro plano / fora do plano (máscara à mão, px): tripé, pallet sobre caixote com
# caixas e tábuas, poste e base, suporte de aço, pilastra à direita, corrente
FF_MASCARA = [
    [(60, 80), (360, 80), (520, 700), (60, 780)],
    [(0, 0), (380, 0), (380, 370), (725, 370), (725, 700), (0, 720)],
    [(300, 395), (500, 395), (500, 930), (300, 930)],
    [(310, 920), (640, 920), (640, 1200), (310, 1200)],
    [(1110, 340), (1510, 340), (1510, 960), (1110, 960)],
    [(1400, 0), (1600, 0), (1600, 790), (1400, 790)],
]
FF_CORRENTE = [[(340, 470), (420, 455), (470, 470), (520, 560), (570, 650), (610, 710), (700, 780), (820, 830),
                (940, 790), (1040, 720), (1110, 670), (1180, 600), (1260, 470), (1300, 380)],
               [(812, 300), (830, 450), (855, 600), (880, 690), (945, 775)],
               [(600, 730), (660, 775), (720, 805), (800, 840), (860, 835)]]


def pose_foto_final(yw):
    from scipy.optimize import least_squares
    from PIL import ImageDraw
    im = np.asarray(Image.open(FOTO_FINAL).convert('RGB')).astype(np.float32) / 255
    H, W = im.shape[:2]
    px = np.array([p for p, _ in FF_PTS], float)
    X3 = np.array([[x, yw, z] for _, (x, z) in FF_PTS], float)
    xs = np.linspace(-5000, 2000, 3501)
    PL = np.c_[xs, np.full_like(xs, yw), np.zeros_like(xs)]

    def proj(p, P):
        R, _ = cv2.Rodrigues(p[1:4]); q = (P - p[4:7]) @ R.T
        return np.c_[W / 2 + p[0] * q[:, 0] / q[:, 2], H / 2 + p[0] * q[:, 1] / q[:, 2]], q[:, 2]

    def res(p):
        r = list((proj(p, X3)[0] - px).ravel())
        uv = proj(p, PL)[0]
        r += [np.hypot(uv[:, 0] - u, uv[:, 1] - v).min() for u, v in FF_LINHA]
        return r

    def mira(c, t):
        f = t - c; f /= np.linalg.norm(f); r = np.cross(f, [0, 0, 1]); r /= np.linalg.norm(r)
        return cv2.Rodrigues(np.array([r, np.cross(f, r), f]))[0].ravel()
    best = None
    for cx0 in (-2500, -1500, -800):
        for cy0 in (800, 1500, 2300):
            c0 = np.array([cx0, cy0, 1400.0])
            s_ = least_squares(res, np.r_[1300, mira(c0, np.array([300, yw, 600])), c0],
                               x_scale=np.r_[100, .1, .1, .1, 300, 300, 300])
            if best is None or s_.cost < best.cost:
                best = s_
    p = best.x
    # máscaras: objetos grandes ficam fora (usa o resto da sala); a corrente, fina, é apagada por
    # inpainting na própria foto (atrás dela só há parede branca e piso)
    fora = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(fora)
    for k in range(len(FF_MASCARA)):
        dr.polygon(FF_MASCARA[k], fill=255)
    rec = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(rec)
    for ln in FF_CORRENTE:
        dr.line(ln, fill=255, width=32)
    im8 = (im * 255).astype(np.uint8)
    im8 = cv2.inpaint(im8, np.asarray(rec), 9, cv2.INPAINT_TELEA)
    im = im8.astype(np.float32) / 255
    m = 1 - np.asarray(fora).astype(np.float32) / 255
    print(f'foto final: f = {p[0]:.0f} px, câmera em {p[4:7].round(0)} mm, resíduo {np.sqrt(2 * best.cost / 11):.1f} px')
    return dict(im=im, mask=m, proj=lambda P: proj(p, P), p=p, rec=np.asarray(rec))


def aplicar_foto_final(ff, il, base, P, superficie):
    """Projeta a foto final na ilha (parede dos perfis ou piso) e mistura sem emenda."""
    sh = P.shape[:2]
    uv, z = ff['proj'](P.reshape(-1, 3))
    H, W = ff['im'].shape[:2]
    u = uv[:, 0].reshape(sh); v = uv[:, 1].reshape(sh); z = z.reshape(sh)
    ok = (z > 100) & (u > 4) & (u < W - 5) & (v > 4) & (v < H - 5)
    if superficie == 'piso':
        ok &= (P[..., 1] < PAREDES_Y_OPOSTA + 3600)          # trecho em frente aos perfis
    if not ok.any():
        return base
    vv, uu = np.clip(v, 0, H - 1), np.clip(u, 0, W - 1)
    cor = np.stack([map_coordinates(ff['im'][..., c], [vv, uu], order=1) for c in range(3)], -1)
    mk = map_coordinates(ff['mask'], [vv, uu], order=1)
    w = (ok & (mk > 0.99)).astype(np.float32)
    w = cv2.erode(w, np.ones((5, 5), np.uint8))
    w = np.clip(distance_transform_edt(w > 0.5) / 25.0, 0, 1).astype(np.float32)
    if w.max() == 0:
        return base
    sel = w > 0.5
    g = np.median(base[sel], 0) / np.maximum(np.median(cor[sel], 0), 1e-3)
    cor = np.clip(cor * g, 0, 1)
    print(f'  foto final em {il.nome}: {sel.mean() * 100:.1f}% da ilha, ganho {g.round(3)}')
    return piramide_mistura(cor, base, w, niveis=6)


# ---------------------------------------------------------------- geometria das superfícies
class Ilha:
    """Retângulo de textura no espaço: P(s, t) = O + s * eu + t * ev (s, t em mm; t para 'baixo')."""
    def __init__(self, nome, grupo, O, eu, ev, lu, lv, mm, normal, caixa=None):
        self.nome, self.grupo = nome, grupo
        self.O, self.eu, self.ev = np.array(O, float), np.array(eu, float), np.array(ev, float)
        self.lu, self.lv, self.mm, self.n = lu, lv, mm, np.array(normal, float)
        self.caixa = caixa
        self.w = int(math.ceil(lu / mm)); self.h = int(math.ceil(lv / mm))
        self.W = self.w + 2 * MARGEM; self.H = self.h + 2 * MARGEM
        self.quads = []   # sub-retângulos (s0, s1, t0, t1) que viram geometria
        self.x = self.y = None

    def pontos(self):
        s = (np.arange(self.W) - MARGEM + 0.5) * (self.lu / self.w)
        t = (np.arange(self.H) - MARGEM + 0.5) * (self.lv / self.h)
        S, T = np.meshgrid(s, t)
        return self.O + S[..., None] * self.eu + T[..., None] * self.ev, S, T


def montar_ilhas(par, caixas):
    xf, xp, yo, yp, zt = par['x_fundo'], par['x_portao'], par['y_oposta'], par['y_porta'], par['teto']
    L = []
    # piso: uma face só, 5 mm/texel (cobre a área do experimento sem emendas)
    piso = Ilha('piso', 'piso', [xf, yp, 0], [1, 0, 0], [0, -1, 0], xp - xf, yp - yo, 5.0, [0, 0, 1])
    piso.quads = [(0, piso.lu, 0, piso.lv)]
    L.append(piso)
    teto = Ilha('teto', 'teto', [xf, yo, zt], [1, 0, 0], [0, 1, 0], xp - xf, yp - yo, 15.0, [0, 0, -1])
    teto.quads = [(0, teto.lu, 0, teto.lv)]
    L.append(teto)
    mmp = 12.0
    # paredes vistas de dentro (s para a direita de quem olha a parede, t para baixo)
    pp = Ilha('parede_porta', 'paredes', [xf, yp, zt], [1, 0, 0], [0, 0, -1], xp - xf, zt, mmp, [0, -1, 0])
    # parede dos perfis (oposta), atrás do experimento: mais resolução
    po = Ilha('parede_oposta', 'paredes', [xp, yo, zt], [-1, 0, 0], [0, 0, -1], xp - xf, zt, 6.0, [0, 1, 0])
    pf = Ilha('parede_fundo', 'paredes', [xf, yo, zt], [0, 1, 0], [0, 0, -1], yp - yo, zt, mmp, [1, 0, 0])
    pg = Ilha('parede_portao', 'paredes', [xp, yp, zt], [0, -1, 0], [0, 0, -1], yp - yo, zt, mmp, [-1, 0, 0])
    for il in (pp, po, pf):
        il.quads = [(0, il.lu, 0, il.lv)]
    # parede do portão com o vão de verdade (3 quads na mesma ilha -> sem emenda)
    s0, s1 = yp - VAO['y1'], yp - VAO['y0']
    tv = zt - VAO['z1']
    pg.quads = [(0, s0, 0, pg.lv), (s1, pg.lu, 0, pg.lv), (s0, s1, 0, tv)]
    L += [pp, po, pf, pg]
    # lado de fora: chão do pátio e fundo (jardim) a FORA mm além do portão
    ext_y0, ext_y1 = -7000.0, 9000.0
    ch = Ilha('patio', 'exterior', [xp, ext_y1, 0], [1, 0, 0], [0, -1, 0], FORA, ext_y1 - ext_y0, 20.0, [0, 0, 1])
    ch.quads = [(0, ch.lu, 0, ch.lv)]
    fd = Ilha('jardim', 'exterior', [xp + FORA, ext_y1, 9000], [0, -1, 0], [0, 0, -1], ext_y1 - ext_y0, 9000, 20.0, [-1, 0, 0])
    fd.quads = [(0, fd.lu, 0, fd.lv)]
    L += [ch, fd]
    # proxies: 5 faces (sem a de baixo), 8 mm/texel, normais para fora
    for k, b in enumerate(caixas):
        c, R, h = caixa_local(b)
        ex, ey, ez = R[:, 0], R[:, 1], R[:, 2]
        hx, hy, hz = h
        faces = [
            ('+x', c + ex * hx - ey * hy + ez * hz, ey, -ez, 2 * hy, 2 * hz, ex),
            ('-x', c - ex * hx + ey * hy + ez * hz, -ey, -ez, 2 * hy, 2 * hz, -ex),
            ('+y', c + ey * hy + ex * hx + ez * hz, -ex, -ez, 2 * hx, 2 * hz, ey),
            ('-y', c - ey * hy - ex * hx + ez * hz, ex, -ez, 2 * hx, 2 * hz, -ey),
            ('+z', c + ez * hz - ex * hx + ey * hy, ex, -ey, 2 * hx, 2 * hy, ez),
        ]
        for nm, O, eu, ev, lu, lv, n in faces:
            il = Ilha(f"{b['nome']}{nm}", 'proxy:' + b['nome'], O, eu, ev, lu, lv, 8.0, n, caixa=k)
            il.quads = [(0, lu, 0, lv)]
            L.append(il)
    return L


def empacotar(ilhas):
    """Prateleiras: a maior ilha (piso) primeiro; as demais por altura decrescente."""
    ordem = sorted(ilhas, key=lambda i: -(i.H * 10000 + i.W))
    x = y = 0; alt = 0
    # piso no canto superior esquerdo; o resto em prateleiras à direita dele e abaixo
    piso = [i for i in ordem if i.nome == 'piso'][0]
    piso.x, piso.y = 0, 0
    livres = [(piso.W, 0, ATLAS - piso.W, piso.H), (0, piso.H, ATLAS, ATLAS - piso.H)]
    resto = [i for i in ordem if i is not piso]
    for (rx, ry, rw, rh) in livres:
        x, y, alt = rx, ry, 0
        for il in list(resto):
            if il.W > rw:
                continue
            if x + il.W > rx + rw:
                x = rx; y += alt; alt = 0
            if y + il.H > ry + rh:
                continue
            il.x, il.y = x, y
            x += il.W; alt = max(alt, il.H)
            resto.remove(il)
    if resto:
        raise RuntimeError(f'{len(resto)} ilhas não couberam no atlas')
    return max(i.y + i.H for i in ilhas)


# ---------------------------------------------------------------- assar
def sintese_parede(cor, disp, rng):
    """Preenche onde disp=0: interpola ao longo de cada linha (horizontal) + ruído medido."""
    H, W = disp.shape
    base = cor.copy()
    xs = np.arange(W)
    for j in range(H):
        ok = disp[j] > 0.5
        if ok.sum() >= 2 and (~ok).any():
            for c in range(3):
                base[j, ~ok, c] = np.interp(xs[~ok], xs[ok], cor[j, ok, c])
        elif ok.sum() < 2:
            base[j] = np.nan
    # linhas sem nada: usa a média vertical vizinha
    if np.isnan(base).any():
        m = ~np.isnan(base[..., 0])
        lm, _ = conv_normalizada(np.nan_to_num(base), m.astype(np.float32), 25)
        base = np.where(np.isnan(base), lm, base)
    base = np.stack([gaussian_filter(base[..., c], (1.0, 3.0)) for c in range(3)], -1)
    # ruído com a amplitude do detalhe da parede visível
    hp = cor - np.stack([gaussian_filter(cor[..., c], 3) for c in range(3)], -1)
    amp = np.median(np.abs(hp[disp > 0.5])) * 1.3 if (disp > 0.5).any() else 0.01
    ru = gaussian_filter(rng.normal(0, 1, (H, W)), 1.2)
    ru = ru / (ru.std() + 1e-9) * amp
    return base + ru[..., None]


def assar(ilhas, caixas, eq, mask, tex_piso, fase, par, ff=None):
    rng = np.random.default_rng(11)
    out = {}
    tp2 = cv2.resize(tex_piso, (tex_piso.shape[1] // 2, tex_piso.shape[0] // 2), interpolation=cv2.INTER_AREA)  # 5 mm/px
    per = N_LAJ * LAJOTA
    cores_caixa = {}
    for il in sorted(ilhas, key=lambda i: (i.grupo.startswith('proxy'), i.nome)):
        P, S, T = il.pontos()
        D = P - C
        cor, m = amostrar_pano(eq, mask, D)
        if il.grupo == 'exterior':
            # visível só pelo vão do portão
            t = (par['x_portao'] - C[0]) / np.maximum(D[..., 0], 1e-6)
            yi = C[1] + t * D[..., 1]; zi = C[2] + t * D[..., 2]
            vis = (yi > VAO['y0']) & (yi < VAO['y1']) & (zi < VAO['z1']) & (zi > 0)
            vis = vis & ~ocluido(P, caixas)
            res = esticar(cor, vis)
        else:
            occ = ocluido(P, caixas, exceto=il.caixa)
            frente = (D @ il.n) < 0          # a face está de frente para a câmera
            if il.grupo == 'piso':
                vis = (~occ) * np.clip((m - 0.05) / 0.9, 0, 1)
                # só aceita pixels com cara de piso (claros, pouco saturados): móveis não modelados
                # e objetos soltos projetados no chão viram manchas -> ficam com a lajota
                lum = cor @ np.array([0.299, 0.587, 0.114], np.float32)
                sat = cor.max(-1) - cor.min(-1)
                ref = np.percentile(lum[vis > 0.8], 60) if (vis > 0.8).any() else 0.8
                pisolike = np.clip((lum - (ref - 0.16)) / 0.08, 0, 1) * np.clip((0.14 - sat) / 0.06, 0, 1)
                pisolike = cv2.erode(pisolike.astype(np.float32), np.ones((9, 9), np.uint8))
                vis = vis * gaussian_filter(pisolike, 3)
                # textura de lajotas no mundo (alinhada à grade), cor casada com o piso fotografado
                fx, fy = fase
                X = ((P[..., 0] - fx) % per) / 5.0 - 0.5
                Y = ((P[..., 1] - fy) % per) / 5.0 - 0.5
                base = np.stack([map_coordinates(tp2[..., c], [Y, X], order=1, mode='grid-wrap') for c in range(3)], -1)
                bl = np.stack([gaussian_filter(base[..., c], 30) for c in range(3)], -1)
                ganho, den = conv_normalizada(cor / np.maximum(bl, 1e-3), (vis > 0.8).astype(np.float32), 60)
                ganho2, _ = conv_normalizada(cor / np.maximum(bl, 1e-3), (vis > 0.8).astype(np.float32), 400)
                a = np.clip(den / 0.3, 0, 1)[..., None]
                ganho = ganho * a + ganho2 * (1 - a)
                base = base * ganho
                # detalhe fino das lajotas também sobre a foto (que é borrada a 5 mm)
                res = piramide_mistura(cor, base, gaussian_filter(vis, 1.0), niveis=7, w_finos=0.25)
            elif il.grupo in ('paredes', 'teto'):
                disp = ((~occ) & frente).astype(np.float32)
                sint = sintese_parede(cor, disp, rng)
                res = piramide_mistura(cor, sint, gaussian_filter(disp, 1.0), niveis=6)
            else:  # proxy
                vis = (~occ) & frente & (m > 0.3)
                if vis.sum() > 50:
                    res = esticar(cor, vis)
                    cores_caixa.setdefault(il.caixa, []).append(cor[vis].mean(0))
                else:
                    res = None
        if ff is not None and il.nome in ('parede_oposta', 'piso') and res is not None:
            res = aplicar_foto_final(ff, il, res, P, il.grupo)
        out[il.nome] = res
    # faces de proxy sem nada visível: cor média da caixa (ou cinza), com leve ruído
    for il in ilhas:
        if out[il.nome] is None:
            cm = np.mean(cores_caixa.get(il.caixa, [np.array([0.55, 0.55, 0.55])]), 0)
            r = gaussian_filter(rng.normal(0, 1, (il.H, il.W)), 1.5)
            out[il.nome] = (cm * 0.92)[None, None, :] * (1 + 0.02 * r[..., None])
    return out


def esticar(cor, vis):
    if vis.all():
        return cor
    if not vis.any():
        return np.broadcast_to(cor.reshape(-1, 3).mean(0), cor.shape).copy()
    _, ind = distance_transform_edt(~vis, return_indices=True)
    r = cor[ind[0], ind[1]]
    lis = np.stack([gaussian_filter(r[..., c], 2) for c in range(3)], -1)
    w = np.clip(distance_transform_edt(~vis) / 4, 0, 1)[..., None]
    return r * (1 - w) + lis * w


# ---------------------------------------------------------------- saída
def escrever(ilhas, texs, altura):
    H = int(2 ** math.ceil(math.log2(altura))) if altura > ATLAS // 2 else ATLAS // 2
    H = min(ATLAS, max(H, altura))
    atlas = np.full((H, ATLAS, 3), 0.5, np.float32)
    for il in ilhas:
        atlas[il.y:il.y + il.H, il.x:il.x + il.W] = texs[il.nome]
    img = Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8))
    q = 90
    while True:
        img.save(VIS / 'img' / 'lab' / 'sala_atlas.jpg', quality=q, optimize=True)
        if (VIS / 'img' / 'lab' / 'sala_atlas.jpg').stat().st_size < 2.9e6 or q <= 70:
            break
        q -= 4
    partes = {}
    quads = []
    for il in ilhas:
        p = partes.setdefault(il.grupo, dict(nome=il.grupo, pos=[], nor=[], uv=[], idx=[]))
        for (s0, s1, t0, t1) in il.quads:
            base = len(p['pos']) // 3
            cant = []
            for (s, t) in [(s0, t0), (s1, t0), (s1, t1), (s0, t1)]:
                P = il.O + s * il.eu + t * il.ev
                px = il.x + MARGEM + s / il.lu * il.w
                py = il.y + MARGEM + t / il.lv * il.h
                p['pos'] += [round(float(v), 1) for v in P]
                p['nor'] += [round(float(v), 4) for v in il.n]
                p['uv'] += [round(px / ATLAS, 6), round(py / H, 6)]
                cant.append((P, (px / ATLAS, py / H)))
            # orientação: CCW visto do lado da normal
            a, b, c = cant[0][0], cant[1][0], cant[2][0]
            if np.dot(np.cross(b - a, c - a), il.n) > 0:
                p['idx'] += [base, base + 1, base + 2, base, base + 2, base + 3]
            else:
                p['idx'] += [base, base + 2, base + 1, base, base + 3, base + 2]
            cant.append(il.n)
            quads.append(cant)
    js = ('// Gerado por ../experimento/assar_sala.py. Não editar.\n'
          '// Sala do laboratório com textura assada (img/lab/sala_atlas.jpg). mm; origem no chão sob a câmera\n'
          '// do panorama; +X para o portão; +Y para a parede da porta; Z para cima. UV com v = 0 no topo.\n'
          f'window.LAB_SALA = {{ atlas: "img/lab/sala_atlas.jpg", atlasAltura: {H}, partes: [\n'
          + ',\n'.join('  ' + json.dumps(p, separators=(',', ':')) for p in partes.values()) + '\n] };\n')
    (VIS / 'lab' / 'sala.js').write_text(js, encoding='utf-8')
    return atlas, quads, H


# ---------------------------------------------------------------- validação (ray casting nos quads)
def render(quads, atlas, olho, alvo, fov=90, n=(800, 500), cima=(0, 0, 1)):
    olho = np.array(olho, float); f = np.array(alvo, float) - olho; f /= np.linalg.norm(f)
    r = np.cross(f, cima); r /= np.linalg.norm(r); u = np.cross(r, f)
    W, H = n
    k = math.tan(math.radians(fov) / 2)
    xs = (np.arange(W) + 0.5) / W * 2 - 1; ys = 1 - (np.arange(H) + 0.5) / H * 2
    X, Y = np.meshgrid(xs * k, ys * k * H / W)
    D = f + X[..., None] * r + Y[..., None] * u
    D = D.reshape(-1, 3)
    best = np.full(len(D), np.inf); uvb = np.zeros((len(D), 2))
    AH, AW = atlas.shape[:2]
    for cant in quads:
        P0, P1, P3 = cant[0][0], cant[1][0], cant[3][0]
        e1, e2 = P1 - P0, P3 - P0
        nrm = np.cross(e1, e2)
        den = D @ nrm
        with np.errstate(divide='ignore', invalid='ignore'):
            t = ((P0 - olho) @ nrm) / den
        Q = olho + t[:, None] * D - P0
        a = (Q @ e1) / (e1 @ e1); b = (Q @ e2) / (e2 @ e2)
        frente = (D @ cant[4]) < 0 if len(cant) > 4 else True   # descarta faces de costas (como o WebGL)
        hit = (t > 1) & (t < best) & (a >= 0) & (a <= 1) & (b >= 0) & (b <= 1) & frente
        if hit.any():
            uv0, uv1, uv3 = np.array(cant[0][1]), np.array(cant[1][1]), np.array(cant[3][1])
            uvb[hit] = uv0 + a[hit, None] * (uv1 - uv0) + b[hit, None] * (uv3 - uv0)
            best[hit] = t[hit]
    px = uvb[:, 0] * AW - 0.5; py = uvb[:, 1] * AH - 0.5
    img = np.stack([map_coordinates(atlas[..., c], [py, px], order=1, mode='nearest') for c in range(3)], -1)
    img[~np.isfinite(best)] = [0.1, 0.1, 0.12]
    return img.reshape(H, W, 3)


def previa(quads, atlas, saida, par):
    oq = ORIGEM_QTM
    vistas = []
    # 1) do ponto de captura (deve bater com a foto)
    for alvo in [(-1, 0, 0), (0, 1, 0), (1, 0, 0), (0, -1, 0)]:
        vistas.append(render(quads, atlas, C, C + np.array(alvo) * 1000 + np.array([0, 0, -350])))
    # 2) a 1,7 m junto à origem do Qualisys, olhando em volta (inclinado para baixo)
    O2 = np.array([oq[0] - 400, oq[1] + 700, 1700])
    for alvo in [(-1, 0), (0, 1), (1, 0), (0, -1)]:
        vistas.append(render(quads, atlas, O2, O2 + np.array([alvo[0] * 1000, alvo[1] * 1000, -700])))
    g = np.concatenate([np.concatenate(vistas[:4], 1), np.concatenate(vistas[4:], 1)], 0)
    Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8)).save(saida / 'sala_vistas.jpg', quality=88)
    # 3) casa de bonecas: de cima, sem o teto
    q2 = [q for q in quads if q[0][0][2] < par['teto'] - 1 or q[2][0][2] < par['teto'] - 1]
    q2 = [q for q in q2 if not (q[0][0][2] == q[1][0][2] == q[2][0][2] == par['teto'])]
    cb = render(q2, atlas, (-9000, -12000, 11000), (-1500, -1000, 0), fov=60, n=(1400, 900))
    Image.fromarray((np.clip(cb, 0, 1) * 255).astype(np.uint8)).save(saida / 'sala_casa_bonecas.jpg', quality=88)
    # zoom 3x numa emenda foto/piso sintético perto do experimento
    z = render(quads, atlas, np.array([oq[0] - 900, oq[1] + 1600, 1500]), np.array([oq[0], par['y_oposta'], 500]), fov=30, n=(900, 600))
    Image.fromarray((np.clip(z, 0, 1) * 255).astype(np.uint8)).save(saida / 'sala_zoom_emenda.jpg', quality=90)
    lst = [saida / 'sala_vistas.jpg', saida / 'sala_casa_bonecas.jpg', saida / 'sala_zoom_emenda.jpg']
    if FF_POSE is not None:
        p = FF_POSE
        R, _ = cv2.Rodrigues(p[1:4])
        fw = R[2]; up = -R[1]
        fov = math.degrees(2 * math.atan(800 / p[0]))
        im = render(quads, atlas, p[4:7], p[4:7] + fw * 1000, fov=fov, n=(800, 600), cima=up)
        foto = np.asarray(Image.open(FOTO_FINAL).convert('RGB').resize((800, 600))).astype(np.float32) / 255
        Image.fromarray((np.clip(np.concatenate([foto, im], 1), 0, 1) * 255).astype(np.uint8)).save(saida / 'sala_pose_foto_final.jpg', quality=88)
        lst.append(saida / 'sala_pose_foto_final.jpg')
    return lst


def main():
    par, caixas = ler_proxies()
    eq, mask = ler_panorama()
    print('textura de piso das fotos:')
    tex = textura_piso_fotos()
    fz = fase_juntas_panorama(eq, mask, par)
    print(f'fase das juntas no panorama: x {fz[0][0]:.0f} mm (força {fz[0][1]:.3f}), y {fz[1][0]:.0f} mm (força {fz[1][1]:.3f})')
    fase = tuple(f if forca > 0.08 else 0.0 for f, forca in fz)
    ilhas = montar_ilhas(par, caixas)
    alt = empacotar(ilhas)
    print(f'{len(ilhas)} ilhas, atlas {ATLAS} x {alt}')
    global PAREDES_Y_OPOSTA, FF_POSE
    PAREDES_Y_OPOSTA = par['y_oposta']
    ff = pose_foto_final(par['y_oposta']) if FOTO_FINAL.exists() else None
    FF_POSE = ff['p'] if ff is not None else None
    texs = assar(ilhas, caixas, eq, mask, tex, fase, par, ff)
    atlas, quads, H = escrever(ilhas, texs, alt)
    print('ok:', VIS / 'img' / 'lab' / 'sala_atlas.jpg', f'({(VIS / "img" / "lab" / "sala_atlas.jpg").stat().st_size / 1e6:.2f} MB)', VIS / 'lab' / 'sala.js')
    if '--previa' in sys.argv:
        d = Path(sys.argv[sys.argv.index('--previa') + 1])
        Image.fromarray((tex * 255).astype(np.uint8)).save(d / 'piso_fotos.jpg', quality=90)
        t2 = np.tile(tex, (2, 2, 1))
        Image.fromarray((t2 * 255).astype(np.uint8)).resize((1680, 1680)).save(d / 'piso_fotos_2x2.jpg', quality=88)
        for p in previa(quads, atlas, d, par):
            print(p)


if __name__ == '__main__':
    main()
