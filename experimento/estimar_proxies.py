"""Estima caixas 3D (proxies) dos móveis do laboratório a partir do panorama ambiente.jpg.

Técnica dos jogos de câmera fixa: caixas pintadas com o panorama projetado a partir do ponto de
captura. Daquele ponto ficam idênticas à foto, mas tapam objetos 3D e recebem sombra.

Coordenadas (mm): origem no chão logo abaixo do ponto de captura; +X para o portão (u = 0,818),
+Y para a parede da porta (u = 0,568), Z para cima; câmera a 1 500 mm.
Ângulo no plano: alfa = atan2(y, x) = 2 pi (0,818 - u). theta = elevação (graus, + para cima).

Cada móvel foi medido à mão no panorama (grade u x theta) e convertido:
  distância horizontal pela linha de contato com o chão:  d = 1500 / tan(-theta_chao)
  distância pela borda de um tampo de altura h:           d = (1500 - h) / tan(-theta_borda)
  altura pelo topo:                                       z = 1500 + d tan(theta_topo)
  largura pela faixa de azimute [u0, u1].

Saídas: ../visualizador/lab/proxies.js e, com --previa DIR, vistas de validação com as arestas.
Uso: python estimar_proxies.py [--previa DIR]
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates

AQUI = Path(__file__).resolve().parent
VIS = AQUI.parent / 'visualizador'
CAM_Z = 1500.0
U_X = 0.818

# Paredes (mm) no sistema acima. Sala de 14 110 (comprimento) x 4 443 (largura), pé-direito 7 887.
# Portão a ~5,4 m (ombreiras em u 0,748 e 0,855, vão centralizado de canto a canto com ~300 mm de
# margem; soleira a ~-16°), fundo a ~8,71 m (-9,5°). Parede da porta a ~2,857 m: a porta de 2,1 m
# fica a ~4,0 m na visada (base -20,5°, topo +8,6°, medido -20°/+9°). Parede dos perfis a ~1,586 m:
# os trilhos (380 mm entre eixos) aparecem em u 0,025 e 0,058 -> x ~ +0,44 e +0,10 m.
PAREDES = dict(x_portao=5400.0, x_fundo=5400.0 - 14110.0, y_porta=2857.0, y_oposta=2857.0 - 4443.0, teto=7887.0)


def alfa(u):
    return 2 * math.pi * (U_X - u)


def ponto(u, d):
    a = alfa(u)
    return d * math.cos(a), d * math.sin(a)


def d_chao(th):
    return CAM_Z / math.tan(math.radians(-th))


def d_borda(th, h):
    return (CAM_Z - h) / math.tan(math.radians(-th))


def z_topo(th, d):
    return CAM_Z + d * math.tan(math.radians(th))


def d_parede(u):
    """Distância horizontal até a primeira parede no azimute u."""
    a = alfa(u); c, s = math.cos(a), math.sin(a); P = PAREDES
    ds = []
    if c > 1e-9: ds.append(P['x_portao'] / c)
    if c < -1e-9: ds.append(P['x_fundo'] / c)
    if s > 1e-9: ds.append(P['y_porta'] / s)
    if s < -1e-9: ds.append(P['y_oposta'] / s)
    return min(ds)


def caixa_azimute(nome, u0, u1, d0, d1, z0, z1, giro='vista'):
    """Caixa entre os azimutes u0..u1 e as distâncias horizontais d0..d1 (frente/fundo).
    giro='vista' (padrão): de frente para a câmera (cobre a silhueta sem inflar);
    giro=None: alinhada aos eixos da sala (envolvente dos 4 cantos).
    A caixa nunca atravessa a parede: se passar, é empurrada para dentro mantendo a profundidade."""
    dw = d_parede((u0 + u1) / 2) - 20
    if d1 > dw:
        prof = d1 - d0
        d1 = dw; d0 = max(150.0, d1 - prof)
    if giro == 'vista':
        um = (u0 + u1) / 2
        dm = (d0 + d1) / 2
        larg = dm * abs(alfa(u0) - alfa(u1))
        cx, cy = ponto(um, dm)
        g = math.degrees(alfa(um))
        return dict(nome=nome, centro=[round(cx), round(cy), round((z0 + z1) / 2)],
                    tamanho=[round(d1 - d0), round(larg), round(z1 - z0)], giro=round(g, 1))
    pts = [ponto(u, d) for u in (u0, u1) for d in (d0, d1)]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return caixa_xy(nome, min(xs), max(xs), min(ys), max(ys), z0, z1)


def caixa_parede_perfis(nome, u0, u1, th_topo_frente, prof=None, th_frente=None, z0=0.0, z_frente=None):
    """Caixa encostada na parede dos perfis (y = y_oposta), alinhada à sala. A face da frente fica em
    y_oposta + prof (ou onde a borda da frente, de altura z_frente, aparece a th_frente); a largura
    vem dos raios u0, u1 cortando a face da frente; a altura vem do topo da frente (th_topo_frente)."""
    yw = PAREDES['y_oposta']
    um = (u0 + u1) / 2
    s_m = abs(math.sin(alfa(um)))
    if prof is None:
        d = d_borda(th_frente, z_frente)
        prof = abs(yw) - d * s_m      # da parede até a borda da frente
    yf = yw + prof
    xa, xb = yf / math.tan(alfa(u0)), yf / math.tan(alfa(u1))
    z1 = z_topo(th_topo_frente, abs(yf) / s_m)
    return caixa_xy(nome, min(xa, xb), max(xa, xb), yw, yf, z0, z1)


def caixa_xy(nome, x0, x1, y0, y1, z0, z1, giro=0.0):
    return dict(nome=nome, centro=[round((x0 + x1) / 2), round((y0 + y1) / 2), round((z0 + z1) / 2)],
                tamanho=[round(x1 - x0), round(y1 - y0), round(z1 - z0)], giro=giro)


def estimar():
    P = PAREDES
    cx = []
    # ---- lado do portão / parede dos perfis (u 0,86 a 0,14); a parede está a 1,6 m, então o que
    # parecia "no chão" está sobre mesas/caixotes encostados nela: alturas medidas na distância da parede
    # pallet sobre o caixote, encostado na parede: borda de trás do tampo a -19° (na parede),
    # borda da frente a -29°
    h = z_topo(-19, d_parede(0.95))
    cx.append(caixa_parede_perfis('pallet', 0.905, 1.0, -29, th_frente=-29, z_frente=h))
    pal = cx[-1]; yfp = pal['centro'][1] + pal['tamanho'][1] / 2
    # caixa de papelão sobre o pallet (topo -13,5°), 450 mm de fundo
    cx.append(caixa_parede_perfis('caixa_sobre_pallet', 0.955, 1.035, -13.5, prof=450, z0=h))
    # pilha de caixas / caixote azul sobre carrinho, perto da ombreira direita (contato -30°, topo -10,5°)
    d0 = d_chao(-30)
    cx.append(caixa_azimute('caixas_carrinho_portao', 0.862, 0.905, d0, d0 + 700, 0, z_topo(-10.5, d0)))
    # tábuas encostadas na parede dos perfis, junto do canto do portão (topo +7,5°)
    y = PAREDES['y_oposta']
    xa, xb = y / math.tan(alfa(0.885)), y / math.tan(alfa(0.866))
    cx.append(caixa_xy('tabuas_encostadas', min(xa, xb), max(xa, xb), y, y + 300, 0,
                       z_topo(7.5, d_parede(0.875))))
    # caixa laranja sobre a mesa baixa encostada na parede (base -30°, topo -20,5°)
    cx.append(caixa_parede_perfis('caixa_laranja', 0.012, 0.042, -20.5, prof=420))
    # caixa com mochila sobre a mesa baixa (topo -15°)
    cx.append(caixa_parede_perfis('caixa_mochila', 0.058, 0.122, -15, prof=550))
    # tábua comprida encostada na parede (topo +11°)
    cx.append(caixa_parede_perfis('tabua_em_pe', 0.153, 0.168, 11, prof=150))
    # mesa com peças coloridas: pés de trás -33,5° sob a borda de trás (-20°) -> h ~ 700
    d1 = d_chao(-33.5); h = z_topo(-20, d1); d0 = d1 - 750
    cx.append(caixa_azimute('mesa_pecas', 0.168, 0.236, d0, d1, 0, h))
    # escrivaninha / bancada com cadeiras mais ao fundo (cadeira -31°, tampo -12° com h = 850)
    d0 = d_chao(-31); d1 = d_borda(-12, 850) + 300
    cx.append(caixa_azimute('bancada_cadeiras', 0.214, 0.27, d0, d1, 0, 900))
    # ---- fundo (u 0,25 a 0,41)
    d0 = d_chao(-20.5)
    cx.append(caixa_azimute('tambor_azul', 0.268, 0.292, d0, d0 + 600, 0, z_topo(-9.5, d0)))
    d0 = d_chao(-20)
    cx.append(caixa_azimute('guindaste_amarelo', 0.282, 0.318, d0, d0 + 1200, 0, z_topo(0, d0)))
    cx.append(caixa_azimute('chapa_madeira', 0.256, 0.282, d0 - 300, d0 + 200, 0, z_topo(7, d0)))
    d0 = d_chao(-10.5)
    cx.append(caixa_azimute('tralha_fundo', 0.29, 0.345, d0, min(d0 + 1000, -P['x_fundo'] / math.cos(alfa(0.318) - math.pi) - 50), 0, z_topo(2, d0)))
    d0 = d_chao(-10)
    cx.append(caixa_azimute('armario_fundo', 0.345, 0.385, d0, d0 + 700, 0, z_topo(2, d0)))
    d0 = d_chao(-31)
    cx.append(caixa_azimute('escada_aluminio', 0.352, 0.381, d0, d0 + 300, 0, z_topo(-9.5, d0), giro='vista'))
    d0 = d_chao(-21.5)
    cx.append(caixa_azimute('mesa_caixote', 0.374, 0.41, d0, d0 + 650, 0, z_topo(-8, d0)))
    # ---- parede da porta (u 0,47 a 0,75)
    # bancada comprida: borda do tampo -24° (u 0,55) com h = 850 -> frente y ~1,45 m
    yf = d_borda(-24, 850) * math.sin(alfa(0.55))
    x0 = yf / math.tan(alfa(0.476)); x1 = yf / math.tan(alfa(0.69))
    # tampo saliente + corpo recuado (os pés ficam ~250 mm para dentro)
    cx.append(caixa_xy('bancada_porta_tampo', x0, x1, yf, yf + 800, 780, 850))
    cx.append(caixa_xy('bancada_porta_corpo', x0 + 150, x1 - 150, yf + 420, yf + 800, 0, 780))
    # caixas de papelão sobre a bancada (topo -12°)
    yc = yf + 200
    x0 = yc / math.tan(alfa(0.508)); x1 = yc / math.tan(alfa(0.6))
    cx.append(caixa_xy('caixas_sobre_bancada', x0, x1, yc, yc + 450, 850, z_topo(-12, yc / math.sin(alfa(0.55)))))
    # máquina azul no suporte, junto ao pilar esquerdo do portão (contato -30°, topo -1°)
    d0 = d_chao(-30)
    cx.append(caixa_azimute('maquina_suporte', 0.70, 0.735, d0, d0 + 500, 0, z_topo(-1, d0)))
    # pilha de escoras/grades pretas (contato -30°, topo -10,5°)
    cx.append(caixa_azimute('pilha_escoras', 0.714, 0.786, d0, d0 + 900, 0, z_topo(-10.5, d0)))
    # ombreiras do portão (o vão vai de canto a canto, com ~300 mm de parede de cada lado)
    xp = PAREDES['x_portao']
    y_esq = xp * math.tan(alfa(0.748)); y_dir = xp * math.tan(alfa(0.855))
    cx.append(caixa_xy('pilar_portao_esq', xp - 120, xp, y_esq, PAREDES['y_porta'], 0, 4000))
    cx.append(caixa_xy('pilar_portao_dir', xp - 120, xp, PAREDES['y_oposta'], y_dir, 0, 4000))
    # móveis do panorama que não existem mais no estado final (foto 5_montagem_final): ficam marcados
    # para a cena poder escondê-los (a área em frente aos perfis agora é do experimento)
    for b in cx:
        if b['nome'] in ANTIGOS:
            b['antigo'] = True
    return cx


ANTIGOS = {'caixa_sobre_pallet', 'caixa_laranja', 'caixa_mochila', 'tabua_em_pe'}


# ---------------------------------------------------------------- validação
def arestas(b):
    sx, sy, sz = b['tamanho']; cxx, cyy, czz = b['centro']; g = math.radians(b['giro'])
    c, s = math.cos(g), math.sin(g)
    V = []
    for dx in (-sx / 2, sx / 2):
        for dy in (-sy / 2, sy / 2):
            for dz in (-sz / 2, sz / 2):
                V.append((cxx + c * dx - s * dy, cyy + s * dx + c * dy, czz + dz))
    E = [(i, j) for i in range(8) for j in range(i + 1, 8) if bin(i ^ j).count('1') == 1]
    return V, E


def previa(caixas, saida):
    eq = np.asarray(Image.open(VIS / 'img' / 'lab' / 'ambiente.jpg').convert('RGB')).astype(np.float32) / 255
    H, W = eq.shape[:2]
    n = 640
    f = n / 2  # 90°
    vistas = []
    for yaw_u in [0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]:
        # direção central em coordenadas da sala
        a = alfa(yaw_u + 0.0625)
        pit = math.radians(-18)
        fw = np.array([math.cos(pit) * math.cos(a), math.cos(pit) * math.sin(a), math.sin(pit)])
        rt = np.array([math.sin(a), -math.cos(a), 0.0])
        up = np.cross(rt, fw)
        t = (np.arange(n) + 0.5 - n / 2) / f
        X, Y = np.meshgrid(t, -t)
        d = fw[None, None] + X[..., None] * rt + Y[..., None] * up
        d /= np.linalg.norm(d, axis=-1, keepdims=True)
        al = np.arctan2(d[..., 1], d[..., 0]); th = np.arcsin(np.clip(d[..., 2], -1, 1))
        u = (U_X - al / (2 * np.pi)) % 1; v = 0.5 - th / np.pi
        img = np.stack([map_coordinates(eq[..., c], [v * H - 0.5, u * W - 0.5], order=1, mode='wrap') for c in range(3)], -1)
        im = Image.fromarray((img * 255).astype(np.uint8)); dr = ImageDraw.Draw(im)

        def proj(p):
            q = np.array([p[0], p[1], p[2] - CAM_Z])
            z = q @ fw
            if z < 50:
                return None
            return (n / 2 + f * (q @ rt) / z, n / 2 - f * (q @ up) / z)
        for k, b in enumerate(caixas):
            V, E = arestas(b)
            cor = (255, 40, 40) if k % 2 == 0 else (40, 220, 255)
            for i, j in E:
                pts = [proj(np.array(V[i]) * (1 - s) + np.array(V[j]) * s) for s in np.linspace(0, 1, 20)]
                pts = [p for p in pts if p]
                if len(pts) > 1:
                    dr.line(pts, fill=cor, width=2)
            pc = proj(b['centro'])
            if pc and 0 < pc[0] < n and 0 < pc[1] < n:
                dr.text(pc, b['nome'], fill=(255, 255, 0))
        dr.text((6, 6), f'u {yaw_u:.3f}-{yaw_u + 0.125:.3f}', fill=(255, 255, 255))
        vistas.append(im)
    g = Image.new('RGB', (n * 4, n * 2))
    for i, im in enumerate(vistas):
        g.paste(im, ((i % 4) * n, (i // 4) * n))
    g.save(saida / 'validacao_proxies.jpg', quality=85)
    return saida / 'validacao_proxies.jpg'


def main():
    cx = estimar()
    (VIS / 'lab').mkdir(exist_ok=True)
    js = ('// Gerado por ../experimento/estimar_proxies.py. Não editar.\n'
          '// Caixas (mm) dos móveis do laboratório, para pintar com o panorama projetado do ponto de captura.\n'
          '// Origem no chão sob a câmera (Z = 1500 mm); +X para o portão; +Y para a parede da porta; giro em graus (Z).\n'
          f'window.LAB_PAREDES = {json.dumps(PAREDES)};\n'
          'window.LAB_PROXIES = [\n' + ',\n'.join('  ' + json.dumps(b, ensure_ascii=False) for b in cx) + '\n];\n')
    (VIS / 'lab' / 'proxies.js').write_text(js, encoding='utf-8')
    print(len(cx), 'caixas ->', VIS / 'lab' / 'proxies.js')
    if '--previa' in sys.argv:
        print(previa(cx, Path(sys.argv[sys.argv.index('--previa') + 1])))


if __name__ == '__main__':
    main()
