"""Texturas de detalhe repetíveis (seamless) do piso e da parede, extraídas das fotos do laboratório.

O atlas assado da sala (assar_sala.py) tem ~5 mm/px: de perto fica borrado. Estas texturas guardam só o
detalhe fino (passa-alta) de um recorte real de piso e de parede, com média 0,5, e o shader da sala multiplica
o atlas por 2·detalhe: manchas, sombras e cores continuam vindo do atlas; a textura só acrescenta o grão.

Recortes (fotos de 2_montagem, sem corrente nem cabo no recorte):
  piso   : corrente_no_chao.jpg (vista de cima), dentro de uma lajota, sem junta    ~1,2 mm/px
  parede : corrente_perfil_na_parede.jpg (parede branca ao lado dos perfis)       ~1,7 mm/px

Repetição sem emenda: mistura do recorte com ele mesmo deslocado de meia largura (np.roll), com pesos
que somem nas bordas de cada um e normalização que preserva a variância do detalhe (sem "lavar" a mistura).

Uso:  python texturas_detalhe.py   -> ../visualizador/img/lab/det_piso.jpg, det_parede.jpg (512 x 512)
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

AQUI = Path(__file__).resolve().parent
FOTOS = AQUI / 'fotos' / '2_montagem'
SAIDA = AQUI.parent / 'visualizador' / 'img' / 'lab'
N = 512

RECORTES = {
    'det_piso': dict(foto='corrente_no_chao.jpg', caixa=(1000, 325, 1135, 460), sigma=0.05, ganho=1.8, pre=0.8),
    'det_parede': dict(foto='corrente_perfil_na_parede.jpg', caixa=(440, 420, 690, 670), sigma=0.08, ganho=3.0, pre=2.0),
}


def seamless(a):
    """a: (n, n, c) passa-alta de média zero -> versão periódica nas duas direções"""
    n = a.shape[0]
    t = np.minimum(np.arange(n), n - 1 - np.arange(n)) / (n / 2)          # 0 na borda, 1 no centro
    w1 = np.sqrt(np.minimum.outer(t, t))[..., None]                        # peso do recorte original
    b = np.roll(np.roll(a, n // 2, 0), n // 2, 1)
    w2 = np.roll(np.roll(w1, n // 2, 0), n // 2, 1)                        # peso do deslocado (centro nas bordas)
    return (w1 * a + w2 * b) / np.sqrt(w1 ** 2 + w2 ** 2 + 1e-9)


def main():
    for nome, r in RECORTES.items():
        im = Image.open(FOTOS / r['foto']).convert('RGB').crop(r['caixa']).resize((N, N), Image.LANCZOS)
        a = np.asarray(im, float) / 255.0
        a = gaussian_filter(a, (r['pre'], r['pre'], 0), mode='reflect')   # tira os blocos 8x8 do JPEG do WhatsApp
        lum = a.mean(2, keepdims=True)
        baixa = gaussian_filter(a, (r['sigma'] * N, r['sigma'] * N, 0), mode='reflect')
        alta = a - baixa                                                   # só o grão e as marcas finas
        alta = 0.75 * (lum - gaussian_filter(lum, (r['sigma'] * N, r['sigma'] * N, 0), mode='reflect')) + 0.25 * alta
        s = seamless(alta - alta.mean((0, 1)))
        # marcas isoladas muito fortes se repetiriam a cada ladrilho: comprime acima de ~2,5 desvios
        sd = s.std()
        s = 2.5 * sd * np.tanh(s / (2.5 * sd))
        det = np.clip(0.5 + r['ganho'] * s / max(baixa.mean(), 1e-3) * 0.5, 0, 1)
        Image.fromarray((det * 255).round().astype(np.uint8)).save(SAIDA / f'{nome}.jpg', quality=92)
        print(f'{nome}.jpg  desvio {det.std():.3f}  média {det.mean():.3f}')


def parede_cor():
    """Textura de PAREDE completa (substitui o atlas nas paredes): recorte da parede pintada, sem a variação
    de iluminação da foto (dividida pela própria média borrada), repetível e com média 1 (gravada como 0,5).
    O shader multiplica pela cor média das paredes no atlas, então a textura só traz manchas e o grão."""
    im = Image.open(FOTOS / 'corrente_perfil_na_parede.jpg').convert('RGB').crop((480, 430, 705, 655)).resize((N, N), Image.LANCZOS)
    a = gaussian_filter(np.asarray(im, float) / 255.0, (1.5, 1.5, 0), mode='reflect')
    lum = a.mean(2, keepdims=True)
    rel = lum / gaussian_filter(lum, (0.18 * N, 0.18 * N, 0), mode='reflect') - 1.0   # manchas relativas, sem gradiente de luz
    s = seamless(rel - rel.mean())
    sd = s.std()
    s = 3.0 * sd * np.tanh(s / (3.0 * sd))
    tex = np.clip(0.5 * (1.0 + 2.5 * s), 0, 1).repeat(3, 2)
    Image.fromarray((tex * 255).round().astype(np.uint8)).save(SAIDA / 'parede.jpg', quality=92)
    print(f'parede.jpg  desvio {tex.std():.3f}  média {tex.mean():.3f}')


if __name__ == '__main__':
    main()
    parede_cor()
