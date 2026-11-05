"""Gera o panorama esférico (equiretangular) do laboratório e a textura do piso.

Entradas: fotos/4_ambiente/panoramica_1..3.jpg (panorâmicas do celular, quase 360° cada).
Saídas:   ../visualizador/img/lab/ambiente.jpg (4096x2048) e piso.jpg (1024x1024, tileable).

Convenção (mundo do Qualisys, Z para cima): para a direção d a partir do ponto de captura,
phi = atan2(d.y, d.x), theta = asin(d.z); u = 0.5 - phi/(2 pi) (mod 1), v = 0.5 - theta/pi.
u = 0.5 corresponde ao centro da panoramica_1 (o alinhamento com o eixo X fica para a cena).

Etapas:
 1. casa features (SIFT, OpenCV) entre as três panorâmicas;
 2. ajusta, por mínimos quadrados, para cada panorâmica: u(x) linear por partes e a linha do
    horizonte y0(x) linear por partes, supondo projeção cilíndrica (theta = atan(k (y0 - y)));
    a escala angular sai do fechamento da volta de 360°;
 3. reprojeta as três na faixa equiretangular, com ganho de cor por panorâmica e mistura suave;
 4. acima e abaixo da faixa, sintetiza a sala (caixa retangular): paredes brancas continuando a
    cor da borda da faixa, teto com fileiras de luminárias tubulares e eletrocalhas, piso de
    lajotas (mesma textura do piso.jpg) projetado no plano do chão.

Uso: python gerar_ambiente.py [--previa]   (requer numpy, scipy, Pillow, opencv-python)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy.optimize import least_squares
from scipy.ndimage import map_coordinates, gaussian_filter

AQUI = Path(__file__).resolve().parent
FOTOS = AQUI / 'fotos' / '4_ambiente'
SAIDA = AQUI.parent / 'visualizador' / 'img' / 'lab'

W_EQ, H_EQ = 4096, 2048
ALTURA = 1500.0         # mm, altura do celular na captura (ponto de projeção do piso)
LAJOTA = 300.0          # mm, placa vinílica 30 x 30 cm (pelas fotos do chão)
PISO_LADO = 4 * LAJOTA  # mm cobertos pelo lado do piso.jpg (4 x 4 lajotas)
Y0_PANO1 = 130.0        # px, horizonte da panoramica_1 (ponto de fuga do corredor, medido à mão)

# Sala aproximada (mm), relativa ao ponto de captura, nos eixos da sala (a = ao longo do
# corredor, rumo ao portão; b = transversal). Az. do eixo a (rumo ao portão), em u da imagem.
# Medidas reais (trena laser): 14 110 mm (comprimento) x 4 443 mm (largura), pé-direito 7 887 mm.
# Posição da câmera (ombreiras do portão em u 0,748 e 0,855, porta de 2,1 m, perfis a 380 mm entre
# eixos): ~5,4 m do portão, ~8,71 m do fundo, ~2,857 m da parede da porta e ~1,586 m da dos perfis.
COMPR, LARG, PE_DIREITO = 14110.0, 4443.0, 7887.0
SALA = dict(a_portao=5400.0, a_fundo=5400.0 - COMPR, b_dir=2857.0, b_esq=2857.0 - LARG, teto=PE_DIREITO - ALTURA)
U_EIXO_PORTAO = 0.818   # u do ponto de fuga do eixo comprido, no sentido do portão (linhas paralelas ao corredor)
CORTE_INF = 15     # px (no 4096x2048) recortados acima da borda de baixo da faixa real
CORTE_SUP = 6      # px recortados abaixo da borda de cima
BORDA_GRAUS = 2.5  # largura da transição foto/sintético
K_U = 9   # nós de u(x)
K_Y = 6   # nós de y0(x)


def periodo(pares):
    """Pixels que correspondem a 360° (busca 1D com modelo linear u = o_k + x/P) e offsets o_k."""
    melhor = (np.inf, None, None)
    for P in np.arange(1200, 1700, 0.5):
        o = np.zeros(3)
        for b in (1, 2):
            d = []
            for a2, b2, s in [(0, b, 1), (b, 0, -1)]:
                m = (pares[:, 0] == a2) & (pares[:, 1] == b2)
                d.append(s * (pares[m, 2] - pares[m, 4]) / P)
            d = np.concatenate(d)
            o[b] = np.angle(np.mean(np.exp(2j * np.pi * d))) / (2 * np.pi)
        ua = o[pares[:, 0].astype(int)] + pares[:, 2] / P
        ub = o[pares[:, 1].astype(int)] + pares[:, 4] / P
        e = np.median(np.abs((ua - ub + 0.5) % 1 - 0.5) * P)
        if e < melhor[0]:
            melhor = (e, P, o.copy())
    return melhor[1], melhor[2]


def carregar():
    return [np.asarray(Image.open(FOTOS / f'panoramica_{i}.jpg').convert('RGB')).astype(np.float32) / 255
            for i in (1, 2, 3)]


# ---------------------------------------------------------------- 1. casamento
def casar(ims):
    import cv2
    sift = cv2.SIFT_create(6000)
    kd = [sift.detectAndCompute(cv2.cvtColor((im * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY), None) for im in ims]
    bf = cv2.BFMatcher()
    pares = []
    for a, b in [(0, 1), (1, 2), (2, 0)]:
        ms = bf.knnMatch(kd[a][1], kd[b][1], k=2)
        ms2 = {m.queryIdx: m.trainIdx for m, n in bf.knnMatch(kd[b][1], kd[a][1], k=2) if m.distance < 0.8 * n.distance}
        for m, n in ms:
            if m.distance < 0.75 * n.distance and ms2.get(m.trainIdx) == m.queryIdx:
                p = kd[a][0][m.queryIdx].pt
                q = kd[b][0][m.trainIdx].pt
                pares.append((a, b, p[0], p[1], q[0], q[1]))
    return np.array(pares)


# ---------------------------------------------------------------- 2. ajuste
# Cada panorâmica k: u_k(x) = o_k + s_k x + c_k(x)  (c_k linear por partes, pequeno e regularizado)
#                    y0_k(x) = h_k + a_k sin(2 pi s_k x) + b_k cos(2 pi s_k x) + e_k(x)  (horizonte)
#                    theta = atan(kk_k (y0_k(x) - y))  (cilíndrica)
# Calibre: pano 1 tem s_1 = 1/P (fechamento da volta), kk_1 = 2 pi / P, h_1 = Y0_PANO1 e
# u_1(centro) = 0.5. As inclinações (a, b) e as correções são penalizadas para não sobreajustar.
NP = 5 + K_U + K_Y + 1   # o, s, h, a, b, c[K_U], e[K_Y], kk


class Modelo:
    def __init__(self, W, P):
        self.W, self.P = W, P
        self.xu = [np.linspace(0, w, K_U) for w in W]
        self.xy = [np.linspace(0, w, K_Y) for w in W]

    def desempacotar(self, p):
        r = []
        for k in range(3):
            q = p[k * NP:(k + 1) * NP]
            o, ls, h, a, b = q[0], q[1], q[2], q[3], q[4]
            c = q[5:5 + K_U]; e = q[5 + K_U:5 + K_U + K_Y]; lk = q[-1]
            s = np.exp(ls)
            a = b = 0.0  # as panorâmicas do celular já saem niveladas (horizonte reto)
            if k == 0:
                s = 1 / self.P; h = Y0_PANO1; lk = np.log(2 * np.pi / self.P); e = 0 * e
            r.append(dict(o=o, s=s, h=h, a=a, b=b, c=c, e=e, kk=np.exp(lk)))
        # u_1(centro) = 0.5
        d = r[0]
        d['o'] = 0.5 - d['s'] * self.W[0] / 2 - np.interp(self.W[0] / 2, self.xu[0], d['c'])
        return r

    def u(self, par, k, x):
        d = par[k]
        return d['o'] + d['s'] * x + np.interp(x, self.xu[k], d['c'])

    def y0(self, par, k, x):
        d = par[k]
        w = 2 * np.pi * d['s'] * x
        return d['h'] + d['a'] * np.sin(w) + d['b'] * np.cos(w) + np.interp(x, self.xy[k], d['e'])

    def avaliar(self, par, k, x, y):
        return self.u(par, k, x), np.arctan(par[k]['kk'] * (self.y0(par, k, x) - y))


def ajustar(ims, pares):
    W = [im.shape[1] for im in ims]
    P, o = periodo(pares)
    print(f'360° = {P:.1f} px da panoramica_1 (cobre {360 * W[0] / P:.0f}°)')
    M = Modelo(W, P)
    p0 = np.zeros(3 * NP)
    for k in range(3):
        q = p0[k * NP:(k + 1) * NP]
        q[0] = o[k] + 0.5 - W[0] / 2 / P
        q[1] = np.log(1 / P); q[2] = Y0_PANO1; q[-1] = np.log(2 * np.pi / P)
    F = P / (2 * np.pi)
    usar = np.ones(len(pares), bool)
    LAM_C, LAM_E, LAM_AB = 3000.0, 0.3, 0.05

    def res(p, sel):
        par = M.desempacotar(p)
        pp = pares[sel]
        n = len(pp)
        ua = np.empty(n); ta = np.empty(n); ub = np.empty(n); tb = np.empty(n)
        for k in range(3):
            ma = pp[:, 0] == k
            ua[ma], ta[ma] = M.avaliar(par, k, pp[ma, 2], pp[ma, 3])
            mb = pp[:, 1] == k
            ub[mb], tb[mb] = M.avaliar(par, k, pp[mb, 4], pp[mb, 5])
        du = (ua - ub + 0.5) % 1 - 0.5
        reg = []
        for k in range(3):
            d = par[k]
            reg += list(LAM_C * d['c']) + list(LAM_C * np.diff(d['c'], 2))
            reg += list(LAM_E * d['e']) + list(LAM_E * 3 * np.diff(d['e'], 2))
            reg += [LAM_AB * d['a'], LAM_AB * d['b']]
        return np.concatenate([du * 2 * np.pi * F, (ta - tb) * F, reg])

    n = len(pares)
    for it in range(4):
        sol = least_squares(res, p0, args=(usar,), loss='soft_l1', f_scale=2.0, max_nfev=6000)
        p0 = sol.x
        r = res(p0, np.ones(n, bool))
        e = np.hypot(r[:n], r[n:2 * n])
        usar = e < (8.0 if it == 0 else 4.0)
        print(f'ajuste {it}: {usar.sum()}/{n} pares, erro mediano {np.median(e[usar]):.2f} px')
    return M, M.desempacotar(p0)


# ---------------------------------------------------------------- 3. faixa equiretangular
def inverter_u(M, par, k, u):
    """x tal que u_k(x) = u (mod 1); devolve x e se está dentro da imagem."""
    xs = np.linspace(0, M.W[k], 2049)
    uk = M.u(par, k, xs)
    return np.interp((u - uk[0]) % 1 + uk[0], uk, xs, left=np.nan, right=np.nan)


def faixa(ims, M, par):
    U = (np.arange(W_EQ) + 0.5) / W_EQ
    V = (np.arange(H_EQ) + 0.5) / H_EQ
    TH = (0.5 - V) * np.pi
    acum = np.zeros((H_EQ, W_EQ, 3), np.float32)
    peso = np.zeros((H_EQ, W_EQ), np.float32)
    amostras = []
    dists = []
    for k, im in enumerate(ims):
        h, w = im.shape[:2]
        x = inverter_u(M, par, k, U)                         # (W_EQ,)
        y0 = M.y0(par, k, x)
        kk = par[k]['kk']
        Y = y0[None, :] - np.tan(TH)[:, None] / kk           # (H, W)
        X = np.broadcast_to(x[None, :], Y.shape)
        ok = np.isfinite(X) & (Y >= 0) & (Y <= h - 1) & (np.abs(TH)[:, None] < 1.3)
        # peso: distância horizontal à borda da própria imagem (em px), guardada para escolher a
        # panorâmica dominante em cada coluna (evita fantasmas da média de três imagens)
        dx = np.nan_to_num(np.minimum(X, w - 1 - X), nan=-1.0)
        dy = np.minimum(Y, h - 1 - Y) / 12.0
        wgt = np.where(ok, np.clip(dy, 0, 1), 0)
        wgt = np.nan_to_num(wgt)
        dists.append(np.where(ok, dx, -1e9))
        cor = np.zeros((H_EQ, W_EQ, 3), np.float32)
        Xc = np.nan_to_num(X); Yc = np.clip(np.nan_to_num(Y), 0, h - 1)
        for c in range(3):
            cor[..., c] = map_coordinates(im[..., c], [Yc, Xc], order=1, mode='nearest')
        amostras.append((cor, wgt))
    # cor: cada panorâmica é levada à referência (pano 2, exposição intermediária) por uma curva
    # monotônica por canal (casamento de quantis na sobreposição) e depois um ajuste fino suave ao
    # longo de u (a exposição do celular deriva durante a varredura).
    ref = 1
    cr, wr = amostras[ref]
    for k in (0, 2):
        cb, wb = amostras[k]
        m = (wr > 0.05) & (wb > 0.05)
        qs = np.linspace(0, 1, 257)
        # curva só na luminância (preserva o matiz; evita manchas coloridas nos brancos estourados)
        lum = lambda c: c @ np.array([0.299, 0.587, 0.114], np.float32)
        Lb, Lr = lum(cb), lum(cr)
        lut_x = np.quantile(Lb[m], qs); lut_y = np.quantile(Lr[m], qs)
        lut_x, idx = np.unique(lut_x, return_index=True)
        L2 = np.interp(Lb, lut_x, lut_y[idx])
        cb = np.clip(cb * (L2 / np.maximum(Lb, 1e-4))[..., None], 0, 1)
        # balanço de branco: razão média de canais na sobreposição
        for c in range(3):
            cb[..., c] *= (cr[..., c][m].mean() + 1e-4) / (cb[..., c][m].mean() + 1e-4)
        num = np.array([(cr[..., c] * m).sum(0) for c in range(3)]).T
        den = np.array([(cb[..., c] * m).sum(0) for c in range(3)]).T
        cnt = m.sum(0)
        g = np.where(cnt[:, None] > 40, (num + 1e-3) / (den + 1e-3), np.nan)
        g = np.where(np.isnan(g), 1.0, np.clip(g, 0.9, 1.1))
        g = np.stack([gaussian_filter(g[:, c], 150, mode='wrap') for c in range(3)], 1)
        amostras[k] = (cb * g[None, :, :].astype(np.float32), wb)
        print(f'cor pano {k + 1}: ajuste fino {g.min():.3f}..{g.max():.3f}')
    # mistura com emenda estreita: peso = exp((d_k - d_max) / 35 px)
    dmax = np.max(np.stack(dists), 0)
    for k, (cor, wgt) in enumerate(amostras):
        wgt = wgt * np.exp(np.clip((dists[k] - dmax) / 35.0, -50, 0)) * (dists[k] > 0)
        acum += cor * wgt[..., None]
        peso += wgt
    band = acum / np.maximum(peso, 1e-6)[..., None]
    return band, peso


# ---------------------------------------------------------------- 4. sala sintética
def textura_piso(n=1024, semente=7):
    """Lajotas claras com rejunte cinza e manchas leves; repetível (lado = PISO_LADO mm)."""
    rng = np.random.default_rng(semente)
    lado = PISO_LADO
    px = lado / n
    yy, xx = np.mgrid[0:n, 0:n] * px
    nl = int(round(lado / LAJOTA))
    base = np.ones((n, n, 3), np.float32) * np.array([0.86, 0.86, 0.84], np.float32)
    # variação por lajota (tom)
    iy = (yy // LAJOTA).astype(int) % nl
    ix = (xx // LAJOTA).astype(int) % nl
    tons = rng.normal(0, 0.018, (nl, nl))
    base += tons[iy, ix][..., None]

    # ruído repetível (FFT de ruído branco filtrado -> periódico)
    def ruido(escala, amp):
        r = rng.normal(0, 1, (n, n))
        f = np.fft.fft2(r)
        ky = np.fft.fftfreq(n)[:, None]; kx = np.fft.fftfreq(n)[None, :]
        f *= np.exp(-(kx ** 2 + ky ** 2) * (escala ** 2) * 2)
        r = np.real(np.fft.ifft2(f))
        return (r / (r.std() + 1e-9) * amp).astype(np.float32)
    base += ruido(60, 0.008)[..., None]          # manchas largas
    base += ruido(4, 0.012)[..., None]           # granulado
    base += (ruido(1.2, 0.010))[..., None]
    # sujeira levemente amarronzada
    suj = np.clip(ruido(25, 1.0) - 1.3, 0, None) * 0.05
    base -= suj[..., None] * np.array([0.6, 0.8, 1.0])
    # pintas (granilha das placas vinílicas): pontos escuros e claros esparsos, com wrap
    for nd, amp, raio in [(9000, -0.10, 0.8), (2500, -0.16, 1.3), (5000, 0.05, 0.9)]:
        m = np.zeros((n, n), np.float32)
        py, pxx = rng.integers(0, n, nd), rng.integers(0, n, nd)
        np.add.at(m, (py, pxx), rng.uniform(0.5, 1.0, nd))
        m = gaussian_filter(m, raio, mode='wrap')
        base += (m / (m.max() + 1e-9) * amp * 1.2)[..., None] * np.array([1.0, 0.98, 0.95])
    # riscos finos (marcas de arraste) em direções aleatórias
    for _ in range(40):
        x0, y0 = rng.uniform(0, n, 2); ang = rng.uniform(0, np.pi); L = rng.uniform(20, 120)
        t = np.linspace(0, L, int(L * 2))
        ix = ((x0 + t * np.cos(ang)) % n).astype(int); iy = ((y0 + t * np.sin(ang)) % n).astype(int)
        base[iy, ix] -= rng.uniform(0.03, 0.07)
    # juntas finas entre placas
    gx = np.minimum(xx % LAJOTA, LAJOTA - xx % LAJOTA)
    gy = np.minimum(yy % LAJOTA, LAJOTA - yy % LAJOTA)
    g = np.minimum(gx, gy)
    rej = np.clip(1 - (g - 0.4) / 1.2, 0, 1)
    base = base * (1 - rej[..., None] * 0.35) + rej[..., None] * np.array([0.42, 0.42, 0.40]) * 0.35
    return np.clip(base, 0, 1)


def sala(band, peso, M, par):
    """Preenche onde a faixa não cobre: paredes, teto e piso de uma caixa retangular."""
    H, W = H_EQ, W_EQ
    U = (np.arange(W) + 0.5) / W
    V = (np.arange(H) + 0.5) / H
    phi = (0.5 - U) * 2 * np.pi
    th = (0.5 - V) * np.pi
    PHI, TH = np.meshgrid(phi, th)
    # direção nos eixos da imagem (x: u=0.5), depois nos eixos da sala
    dx = np.cos(TH) * np.cos(PHI); dy = np.cos(TH) * np.sin(PHI); dz = np.sin(TH)
    az = SALA['az']   # phi do eixo a (rumo ao portão)
    da = dx * np.cos(az) + dy * np.sin(az)
    db = -dx * np.sin(az) + dy * np.cos(az)
    with np.errstate(divide='ignore', invalid='ignore'):
        ta = np.where(da > 0, SALA['a_portao'] / da, SALA['a_fundo'] / da)
        tb = np.where(db > 0, SALA['b_dir'] / db, SALA['b_esq'] / db)
        tz = np.where(dz > 0, SALA['teto'] / dz, -ALTURA / dz)
    ta = np.where(np.isfinite(ta) & (ta > 0), ta, np.inf)
    tb = np.where(np.isfinite(tb) & (tb > 0), tb, np.inf)
    tz = np.where(np.isfinite(tz) & (tz > 0), tz, np.inf)
    t = np.minimum(np.minimum(ta, tb), tz)
    PA, PB, PZ = da * t, db * t, dz * t   # ponto atingido (mm, relativo à câmera)
    teto = (tz <= t + 1e-6) & (dz > 0)
    piso = (tz <= t + 1e-6) & (dz < 0)
    parede = ~(teto | piso)

    out = np.zeros((H, W, 3), np.float32)
    # --- paredes: cor da borda superior da faixa (por coluna), suavizada, com leve escurecimento p/ cima
    cob = peso > 0.02
    lin_sup = np.argmax(cob, 0)                     # primeira linha coberta, por coluna
    lin_inf = H - 1 - np.argmax(cob[::-1], 0)
    cols = np.arange(W)
    tira_s = np.stack([band[np.clip(lin_sup + 6 + d, 0, H - 1), cols] for d in range(10)]).mean(0)
    tira_i = np.stack([band[np.clip(lin_inf - 6 - d, 0, H - 1), cols] for d in range(10)]).mean(0)
    tira_s = np.stack([gaussian_filter(tira_s[:, c], 40, mode='wrap') for c in range(3)], 1)
    tira_i = np.stack([gaussian_filter(tira_i[:, c], 18, mode='wrap') for c in range(3)], 1)
    branco = np.array([0.80, 0.81, 0.80], np.float32)
    # acima: tende ao branco de parede (as paredes são brancas até o teto)
    alt_par = np.clip(PZ / max(SALA['teto'], 1), 0, 1)
    mix = np.clip((alt_par - 0.05) / 0.5, 0, 1)[..., None]
    par_cor = tira_s[None, :, :] * (1 - mix) + branco * mix
    # sombreamento: parede mais escura perto do teto e nos cantos
    canto = np.minimum(np.abs(np.abs(PA - (SALA['a_portao'] + SALA['a_fundo']) / 2) - (SALA['a_portao'] - SALA['a_fundo']) / 2),
                       np.abs(np.abs(PB - (SALA['b_dir'] + SALA['b_esq']) / 2) - (SALA['b_dir'] - SALA['b_esq']) / 2))
    par_cor = par_cor * (0.96 - 0.10 * alt_par[..., None]) * (1 - 0.06 * np.exp(-canto / 250))[..., None]
    # eletrocalhas cinza horizontais (duas alturas) e na junção parede-teto
    for zc, esp in [(3650 - ALTURA, 70), (SALA['teto'] - 90, 110)]:
        m = np.abs(PZ - zc) < esp / 2
        par_cor = np.where(m[..., None], np.array([0.50, 0.52, 0.53]) * (0.9 + 0.1 * (PZ > zc))[..., None], par_cor)
    out = np.where(parede[..., None], par_cor, out)

    # --- teto: branco com fileiras de luminárias tubulares (ao longo de b) e perfis
    tc = np.array([0.86, 0.87, 0.87], np.float32) * np.ones((H, W, 1), np.float32)
    # luminárias: calhas de 1250 mm com dois tubos, em grade (eixo comprido ao longo de a)
    # duas fileiras ao longo do comprimento (a 1,1 m de cada lado do eixo da sala)
    LA, PA_, PB_ = 1250.0, 2350.0, 2200.0
    ca = (PA - SALA['a_fundo'] - 700) % PA_
    cb = (PB - SALA['b_esq'] - (LARG / 2 - PB_)) % PB_
    da_ = np.abs(ca - PA_ / 2); db_ = np.abs(cb - PB_ / 2)
    corpo = (da_ < LA / 2 + 20) & (db_ < 75)
    tubo = (da_ < LA / 2 - 15) & (np.abs(db_ - 32) < 16)
    halo = np.exp(-np.maximum(da_ - LA / 2, 0) / 300) * np.exp(-np.maximum(db_ - 75, 0) / 260)
    tc = np.clip(tc + 0.06 * halo[..., None], 0, 1)
    tc = np.where(corpo[..., None], np.array([0.62, 0.63, 0.64]), tc)
    tc = np.where(tubo[..., None], np.array([1.0, 1.0, 0.99]), tc)
    # eletrocalha longitudinal ligando as fileiras (fio/perfilado cinza)
    eletro = (np.abs(cb - PB_ / 2) < 18) & ~corpo
    tc = np.where(eletro[..., None], np.array([0.45, 0.47, 0.49]), tc)
    out = np.where(teto[..., None], tc, out)

    # --- piso: lajotas projetadas no plano z = -ALTURA
    tex = textura_piso()
    n = tex.shape[0]
    fu = (PA % PISO_LADO) / PISO_LADO * n
    fv = (PB % PISO_LADO) / PISO_LADO * n
    pc = np.stack([map_coordinates(tex[..., c], [fv, fu], order=1, mode='wrap') for c in range(3)], -1)
    # tom do piso, coluna a coluna, tirado do piso real visível logo acima da borda de baixo da
    # faixa (pixels claros e pouco saturados = lajota; móveis ficam de fora), suavizado em u;
    # rumo ao nadir, tende ao tom médio do piso (evita raios coloridos vindos dos móveis)
    rows = np.arange(H)[:, None]
    lim_inf = lin_inf - CORTE_INF                    # borda real útil (abaixo dela a foto é borrada/escura)
    amos = []
    for d in range(0, 70, 2):
        r = np.clip(lim_inf - d, 0, H - 1)
        px_ = band[r, cols]
        sat = px_.max(1) - px_.min(1)
        lum = px_ @ np.array([0.299, 0.587, 0.114])
        ok = (sat < 0.08) & (lum > 0.45)
        amos.append(np.where(ok[:, None], px_, np.nan))
    amos = np.stack(amos)                                         # (n, W, 3)
    cont = np.isfinite(amos[..., 0]).sum(0)
    lum_a = amos @ np.array([0.299, 0.587, 0.114])
    # o piso iluminado é o mais claro dos candidatos (sombras e objetos cinza ficam abaixo)
    corte = np.nanpercentile(np.where(cont[None] > 0, lum_a, 0), 70, axis=0)
    sel = np.isfinite(lum_a) & (lum_a >= corte[None])
    tons = np.nansum(np.where(sel[..., None], amos, 0), 0) / np.maximum(sel.sum(0), 1)[:, None]
    validos = cont >= 4
    xs = np.arange(W)
    for c in range(3):
        tons[:, c] = np.interp(xs, xs[validos], tons[validos, c], period=W)
    tons = np.stack([gaussian_filter(tons[:, c], 60, mode='wrap') for c in range(3)], 1)
    tom_glob = np.median(tons, 0)
    th_borda = (0.5 - (lim_inf + 0.5) / H) * np.pi                 # theta da borda, por coluna
    w_col = np.clip(1 - (th_borda[None, :] - TH) / np.radians(25), 0, 1) ** 1.5
    tom = tons[None, :, :] * w_col[..., None] + tom_glob * (1 - w_col[..., None])
    pc = pc / tex.reshape(-1, 3).mean(0) * tom
    # sombra muito leve sob o operador (nadir)
    r = np.hypot(PA, PB)
    pc = pc * (1 - 0.06 * np.exp(-(r / 700) ** 2))[..., None]
    out = np.where(piso[..., None], pc, out)

    # --- máscara foto real (1) x sintético (0), borda suave de ~2,5°, recortada acima da borda de
    # baixo (as últimas linhas das panorâmicas são escuras e borradas) e um pouco abaixo da de cima
    sua = H * BORDA_GRAUS / 180
    ss = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
    a = ss((rows - (lin_sup[None, :] + CORTE_SUP)) / sua) * ss(((lim_inf[None, :]) - rows) / sua)
    a = a * (peso > 0.02)
    a = gaussian_filter(a, 1.5)
    final = band * a[..., None] + out * (1 - a[..., None])
    return np.clip(final, 0, 1), tex, a


def previa(eq, nome, saida):
    """Vistas perspectivas de 90° (frente, direita, trás, esquerda, cima, baixo)."""
    H, W = eq.shape[:2]
    n = 512
    t = np.linspace(-1, 1, n)
    X, Y = np.meshgrid(t, -t)
    vistas = []
    for yaw, pit in [(0, 0), (-90, 0), (180, 0), (90, 0), (0, 90), (0, -90), (0, -40), (180, -40)]:
        # câmera olhando para phi=yaw, theta=pit; x da imagem para a direita
        yr, pr = np.radians(yaw), np.radians(pit)
        f = np.array([np.cos(pr) * np.cos(yr), np.cos(pr) * np.sin(yr), np.sin(pr)])
        dirt = np.array([np.sin(yr), -np.cos(yr), 0.0])  # direita (sentido horário visto de cima)
        up = np.cross(dirt, f)
        d = f[None, None] + X[..., None] * dirt + Y[..., None] * up
        d /= np.linalg.norm(d, axis=-1, keepdims=True)
        phi = np.arctan2(d[..., 1], d[..., 0]); th = np.arcsin(np.clip(d[..., 2], -1, 1))
        u = (0.5 - phi / (2 * np.pi)) % 1; v = 0.5 - th / np.pi
        img = np.stack([map_coordinates(eq[..., c], [v * H - 0.5, u * W - 0.5], order=1, mode='wrap') for c in range(3)], -1)
        vistas.append(img)
    g = np.concatenate([np.concatenate(vistas[:4], 1), np.concatenate(vistas[4:], 1)], 0)
    Image.fromarray((g * 255).astype(np.uint8)).save(saida / nome, quality=85)


def main():
    ims = carregar()
    pares = casar(ims)
    print(len(pares), 'pares casados')
    M, par = ajustar(ims, pares)
    for k in range(3):
        u = M.u(par, k, np.array([0.0, M.W[k]]))
        print(f'pano {k + 1}: cobre {360 * (u[1] - u[0]):.1f}°, u(0)={u[0] % 1:.4f}, horizonte h={par[k]["h"]:.1f} '
              f'a={par[k]["a"]:.1f} b={par[k]["b"]:.1f}, kk={par[k]["kk"]:.5f} rad/px')
    band, peso = faixa(ims, M, par)
    # azimute do eixo da sala (rumo ao portão), pelo ponto de fuga das linhas do corredor
    SALA['az'] = (0.5 - U_EIXO_PORTAO) * 2 * np.pi
    eq, tex, mask = sala(band, peso, M, par)
    SAIDA.mkdir(parents=True, exist_ok=True)
    Image.fromarray((eq * 255 + 0.5).astype(np.uint8)).save(SAIDA / 'ambiente.jpg', quality=85, optimize=True)
    Image.fromarray((tex * 255 + 0.5).astype(np.uint8)).save(SAIDA / 'piso.jpg', quality=88, optimize=True)
    # máscara 1024x512, mesma convenção u/v: 255 = foto real, 0 = sintético
    Image.fromarray((np.clip(mask, 0, 1) * 255 + 0.5).astype(np.uint8), 'L').resize((1024, 512), Image.LANCZOS)         .save(SAIDA / 'ambiente_mascara.png', optimize=True)
    print('ok:', SAIDA / 'ambiente.jpg', SAIDA / 'piso.jpg')
    if '--previa' in sys.argv:
        d = Path(sys.argv[sys.argv.index('--previa') + 1]) if len(sys.argv) > sys.argv.index('--previa') + 1 else SAIDA
        previa(eq, 'previa_ambiente.jpg', d)
        Image.fromarray((np.clip(band, 0, 1) * 255).astype(np.uint8)).resize((2048, 1024)).save(d / 'previa_faixa.jpg', quality=85)


if __name__ == '__main__':
    main()
