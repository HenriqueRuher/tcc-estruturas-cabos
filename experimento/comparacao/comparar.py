"""Comparação real (Qualisys) x analítico (codigo5) x MEF (Ansys) do ensaio estático com correntes.

Entradas (geradas antes, nesta ordem):
    resultados/ajuste_ramos.json      python ajuste_ramos.py
    resultados/caso_analitico.json    python caso_analitico.py
    resultados/dados_experimento.txt  ansys/rodar_experimento.ps1  (Ansys de verdade)
Saídas:
    resultados/comparacao.csv  (tabela: nó, 9 marcadores, T0, trações nas fixações; ';' e vírgula decimal)
    resultados/comparacao.json
    ansys/figuras/MEF_Experimento_*.png  (mesma pasta e estilo das figuras do capítulo 5)

Como os marcadores são comparados
---------------------------------
A posição de arco de cada marcador ao longo da corrente não foi medida. Por isso:
  * erro normal: distância do marcador ao ponto mais próximo da curva do modelo no mesmo ramo
    (projeção). É o erro de FORMA/posição transversal e não depende de saber o arco.
  * erro no mesmo arco: o arco do marcador a partir do nó é estimado pela catenária ajustada
    aos dados (projeção do marcador nela); toma-se o ponto do modelo com esse mesmo arco a partir
    do nó do modelo. Inclui o deslizamento ao longo do cabo, mas herda a incerteza desse arco.

Qual valor medido é o "real"
----------------------------
O "real" é um QUADRO medido, não a média: o quadro do Qualisys em que os 10 pontos (nó + 9 marcadores)
ficam mais perto do modelo analítico (menor RMS das distâncias; quadro_mais_proximo, abaixo). O ensaio é
estático e os marcadores variam décimos de milímetro entre quadros, então a escolha muda o erro em
décimos de milímetro; o resultado com a mediana do ensaio é impresso e gravado junto, para ficar à vista.
Os modelos NÃO mudam com essa escolha: as fixações e os comprimentos que entram neles continuam vindo do
ajuste feito com a mediana (ajuste_ramos.py), assim como o arco de cada marcador e as trações inferidas.
"""
import csv
import json
import sys

import numpy as np

import dados_experimento as X

sys.path.insert(0, str(X.RAIZ))
import estilo_tcc as E  # noqa: E402

sys.stdout.reconfigure(encoding='utf8')
FIGURAS = X.RAIZ / 'ansys' / 'figuras'
TRAMOS = {'A': ('C1', 1, X.Q1), 'B': ('C3', 2, X.Q1), 'C': ('C2', 3, X.Q2)}   # ramo, seção, q


def ler_ansys(arq=X.RESULTADOS / 'dados_experimento.txt'):
    nos0, elems, U, reac, sets = {}, [], {}, {}, 0
    for ln in open(arq):
        p = ln.split()
        if not p:
            continue
        if p[0] == 'N':
            nos0[int(float(p[1]))] = np.array([float(v) for v in p[2:5]])
        elif p[0] == 'E':
            elems.append(tuple(int(float(v)) for v in p[1:5]))
        elif p[0] == 'S':
            sets, tempo, U, B = int(float(p[1])), float(p[2]), {}, {}
        elif p[0] == 'U':
            U[int(float(p[1]))] = np.array([float(v) for v in p[2:5]])
        elif p[0] == 'B':
            B[int(float(p[1]))] = float(p[2])
        elif p[0] == 'R':
            reac[int(float(p[1]))] = np.array([float(v) for v in p[2:5]])
    pos = {n: nos0[n] + U[n] for n in U}
    # mesma lógica do casos_forca.topologia: P = nó comum às 3 seções; cada trecho percorrido
    # pela conectividade, da ancoragem até P
    secs = {}
    for e, sc, a, b in elems:
        secs.setdefault(a, set()).add(sc)
        secs.setdefault(b, set()).add(sc)
    (noP,) = [n for n, s in secs.items() if len(s) == 3]
    tr = {}
    for k, (ramo, sc, q) in TRAMOS.items():
        es = [e for e in elems if e[1] == sc]
        grau = {}
        for e in es:
            for n in e[2:]:
                grau[n] = grau.get(n, 0) + 1
        anc = next(n for n, g in grau.items() if g == 1 and n != noP)
        ordem, atual, resto, N = [anc], anc, es[:], []
        while atual != noP:
            e = next(e for e in resto if atual in e[2:])
            resto.remove(e)
            atual = e[3] if e[2] == atual else e[2]
            ordem.append(atual)
            N.append(B[e[0]])
        xyz = np.array([pos[n] for n in ordem])
        d = np.diff(xyz, axis=0)
        t0 = np.array(N) * np.hypot(d[:, 0], d[:, 2]) / np.linalg.norm(d, axis=1)
        m = len(t0)
        tr[k] = dict(xyz=xyz, N=np.array(N), t0=t0, T0_meio=float(t0[m // 4: 3 * m // 4].mean()),
                     T0_junto_P=float(t0[-1]), N_fix=float(N[0]), R=reac[anc], L=float(np.linalg.norm(d, axis=1).sum()))
    return dict(P=pos[noP], tr=tr, tempo=tempo, sets=sets)


def projetar(p, curva):
    """ponto mais próximo de p na poligonal 'curva' (n,3) -> (ponto, arco desde curva[0])"""
    a, b = curva[:-1], curva[1:]
    d = b - a
    t = np.clip(np.einsum('ij,ij->i', p - a, d) / np.einsum('ij,ij->i', d, d), 0, 1)
    q = a + t[:, None] * d
    i = int(np.argmin(np.linalg.norm(q - p, axis=1)))
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(d, axis=1))])
    return q[i], s[i] + t[i] * np.linalg.norm(d[i])


def no_arco(curva, s):
    """ponto da poligonal a um arco s de curva[0]"""
    ss = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(curva, axis=0), axis=1))])
    return np.array([np.interp(s, ss, curva[:, k]) for k in range(3)])


def distancias(P, modelo):
    """distância de cada ponto medido ao modelo [mm]: o nó ao nó do modelo e cada marcador à curva do seu ramo.
    P: dicionário nome -> posição. -> vetor (10,), nó primeiro e depois os marcadores na ordem de TRAMOS"""
    d = [np.linalg.norm(P['centro'] - modelo['P'])]
    for k, (ramo, sc, q) in TRAMOS.items():
        for j in (3, 2, 1):
            p = P[f'{ramo}_0{j}']
            d.append(np.linalg.norm(p - projetar(p, modelo['curva'][k])[0]))
    return np.array(d)


def quadro_mais_proximo(nomes, D, modelo):
    """índice do quadro medido mais próximo do modelo (menor RMS das 10 distâncias) e o RMS de cada quadro"""
    rms = np.array([np.sqrt(np.mean(distancias(dict(zip(nomes, q)), modelo) ** 2)) for q in D])
    return int(np.argmin(rms)), rms


def main():
    Ex = X.eixos_salvos()
    nomes_tsv, D = X.ler_tsv()
    Pmed = {n: np.median(D[:, i], axis=0) for i, n in enumerate(nomes_tsv)}   # o mesmo que X.medianas()
    aj = X.ler_json('ajuste_ramos.json')
    an = X.ler_json('caso_analitico.json')
    ans = ler_ansys()
    print(f'Ansys: {ans["sets"]} subpassos gravados, fator de carga final {ans["tempo"]:.4f}')
    # tudo em mm, no sistema do Qualisys; curvas orientadas do nó para a fixação
    mods = {'Analítico': dict(P=Ex.para_qualisys(an['P_modelo_m']),
                              curva={k: Ex.para_qualisys(np.array(an['ramos'][k]['curva'])) for k in TRAMOS}),
            'Ansys': dict(P=Ex.para_qualisys(ans['P']),
                          curva={k: Ex.para_qualisys(ans['tr'][k]['xyz'][::-1]) for k in TRAMOS})}
    # "real" = o quadro medido mais próximo do analítico (ver o cabeçalho); a mediana fica para referência
    fq, rms_q = quadro_mais_proximo(nomes_tsv, D, mods['Analítico'])
    Pr = dict(zip(nomes_tsv, D[fq]))
    real_no = Pr['centro']
    d_med = {n: distancias(Pmed, m) for n, m in mods.items()}
    quadro = dict(indice=fq, numero=fq + 1, total=len(D), rms10=float(rms_q[fq]),
                  rms10_min_max=[float(rms_q.min()), float(rms_q.max())],
                  mediana={n: dict(no=float(d[0]), rms=float(np.sqrt(np.mean(d[1:] ** 2))), maximo=float(d[1:].max()),
                                   rms10=float(np.sqrt(np.mean(d ** 2)))) for n, d in d_med.items()})
    print(f'real = quadro {fq + 1} de {len(D)}, o mais próximo do analítico: RMS dos 10 pontos {rms_q[fq]:.2f} mm '
          f'(entre os quadros: {rms_q.min():.2f} a {rms_q.max():.2f} mm; com a mediana do ensaio: {quadro["mediana"]["Analítico"]["rms10"]:.2f} mm)')
    linhas = [['grandeza', 'item', 'real', 'analitico', 'ansys', 'erro_analitico', 'erro_ansys', 'unidade', 'obs']]
    f2 = lambda v: f'{v:.1f}'
    vet = lambda v: '(' + '; '.join(f2(c) for c in v) + ')'
    linhas.append(['quadro medido usado como real', f'{fq + 1} de {len(D)}', '', '', '',
                   f'{quadro["mediana"]["Analítico"]["no"]:.1f}', f'{quadro["mediana"]["Ansys"]["no"]:.1f}', 'mm',
                   'quadro do Qualisys mais próximo do analítico (menor RMS das distâncias do nó e dos 9 marcadores); '
                   'as colunas de erro desta linha trazem o erro do nó com a MEDIANA do ensaio, para referência'])

    # ---- nó
    for nome, m in mods.items():
        m['dP'] = m['P'] - real_no
    linhas.append(['posição do nó P', 'centro', vet(real_no), vet(mods['Analítico']['P']), vet(mods['Ansys']['P']),
                   f2(np.linalg.norm(mods['Analítico']['dP'])), f2(np.linalg.norm(mods['Ansys']['dP'])), 'mm',
                   'Qualisys X;Y;Z; erro = distância 3D; dX;dY;dZ: an ' + vet(mods['Analítico']['dP']) +
                   ' / ansys ' + vet(mods['Ansys']['dP'])])
    print('nó real', np.round(real_no, 1))
    for nome, m in mods.items():
        print(f'  {nome:9s} {np.round(m["P"], 1)}  d = {np.round(m["dP"], 1)}  |d| = {np.linalg.norm(m["dP"]):.1f} mm'
              f'  (com a mediana: {quadro["mediana"][nome]["no"]:.1f} mm)')

    # ---- marcadores
    marc = []
    for k, (ramo, sc, q) in TRAMOS.items():
        r = aj['ramos'][ramo]
        for j in (3, 2, 1):
            nome_m = f'{ramo}_0{j}'
            p = Pr[nome_m]
            s_real = r['arco_marcadores_mm'][4 - j]          # arco do nó até o pé do marcador na catenária ajustada
            lin = dict(marcador=nome_m, tramo=k, real=p, s_real=s_real)
            for nome, m in mods.items():
                pe, s_proj = projetar(p, m['curva'][k])
                mesmo = no_arco(m['curva'][k], s_real)
                lin[nome] = dict(normal=float(np.linalg.norm(p - pe)), s_proj=s_proj, pe=pe,
                                 d_arco=mesmo - p, arco=float(np.linalg.norm(mesmo - p)))
            marc.append(lin)
            linhas.append([f'marcador (erro normal)', nome_m, vet(p), vet(lin['Analítico']['pe']), vet(lin['Ansys']['pe']),
                           f2(lin['Analítico']['normal']), f2(lin['Ansys']['normal']), 'mm',
                           f'ponto do modelo = projeção do marcador; arco projetado desde o nó an {lin["Analítico"]["s_proj"]:.0f}'
                           f' / ansys {lin["Ansys"]["s_proj"]:.0f} mm'])
            linhas.append([f'marcador (mesmo arco)', nome_m, f'arco {s_real:.0f}',
                           vet(p + lin['Analítico']['d_arco']), vet(p + lin['Ansys']['d_arco']),
                           f2(lin['Analítico']['arco']), f2(lin['Ansys']['arco']), 'mm',
                           'ponto do modelo no mesmo arco desde o nó que o marcador tem na catenária ajustada'])
    print(f'\n{"marcador":9s} {"arco":>6s} | {"erro normal an/ansys":>21s} | {"mesmo arco an/ansys":>20s} [mm]')
    for l in marc:
        print(f'{l["marcador"]:9s} {l["s_real"]:6.0f} | {l["Analítico"]["normal"]:9.1f} {l["Ansys"]["normal"]:9.1f}   | '
              f'{l["Analítico"]["arco"]:8.1f} {l["Ansys"]["arco"]:9.1f}')
    for nome in mods:
        e = np.array([l[nome]['normal'] for l in marc])
        e2 = np.array([l[nome]['arco'] for l in marc])
        print(f'  RMS {nome}: normal {np.sqrt(np.mean(e ** 2)):.1f} mm (máx {e.max():.1f}); mesmo arco {np.sqrt(np.mean(e2 ** 2)):.1f} mm (máx {e2.max():.1f})')

    # ---- T0 e trações
    print(f'\n{"":4s} {"T0 real (q·a)":>16s} {"T0 analítico":>13s} {"T0 Ansys meio":>14s} {"Ansys junto a P":>16s}  [N]')
    sig_a = {r: aj['ramos'][r]['sigma_a_mm'] for r in aj['ramos']}
    tr_vis = {k: {} for k in TRAMOS}          # trações de cada ramo, para o visualizador
    for k, (ramo, sc, q) in TRAMOS.items():
        Tr = aj['ramos'][ramo]['T0_N']
        sTr = q * sig_a[ramo] / 1000
        Ta, Tm = an['ramos'][k]['T0'], ans['tr'][k]['T0_meio']
        tr_vis[k].update(T0_real=Tr, sT0_real=sTr, T0_an=Ta, T0_ansys=Tm)
        print(f'{k:4s} {Tr:9.3f} ± {sTr:.3f} {Ta:13.4f} {Tm:14.4f} {ans["tr"][k]["T0_junto_P"]:16.4f}')
        linhas.append(['T0 (tração horizontal)', f'{k} ({ramo})', f'{Tr:.3f} ± {sTr:.3f}', f'{Ta:.4f}', f'{Tm:.4f}',
                       f'{100 * (Ta / Tr - 1):+.1f}%', f'{100 * (Tm / Tr - 1):+.1f}%', 'N',
                       f'real = q·a do ajuste de catenária (inferido, não medido); Ansys = média na metade central '
                       f'(como no TCC); Ansys no elemento junto a P = {ans["tr"][k]["T0_junto_P"]:.3f} N'])
    print(f'\n{"":4s} {"T fixação analítico":>20s} {"|R| Ansys":>10s} {"N 1o elem Ansys":>16s} {"V an":>8s} {"R_y Ansys":>10s}  [N]')
    sV_an = sV_ans = 0
    for k, (ramo, sc, q) in TRAMOS.items():
        a_ = an['ramos'][k]
        R = ans['tr'][k]['R']
        # tração "real" na fixação: só inferível pela catenária ajustada prolongada (T = q·a·cosh)
        rr = aj['ramos'][ramo]
        Tfix_real = q * rr['a_mm'] / 1000 * np.sqrt(1 + (rr['tan_no'] + X.RAMOS[ramo]['L'] * 1000 / rr['a_mm']) ** 2)
        sV_an += a_['V_fix']
        sV_ans += R[1]
        tr_vis[k].update(Tfix_real=Tfix_real, Tfix_an=a_['T_fix'], Tfix_ansys=float(np.linalg.norm(R)))
        print(f'{k:4s} {a_["T_fix"]:20.4f} {np.linalg.norm(R):10.4f} {ans["tr"][k]["N_fix"]:16.4f} {a_["V_fix"]:8.4f} {R[1]:10.4f}'
              f'   (inferida da geometria real: {Tfix_real:.3f})')
        linhas.append(['tração na fixação', f'{k} ({ramo})', f'{Tfix_real:.3f} (inferida)', f'{a_["T_fix"]:.4f}',
                       f'{np.linalg.norm(R):.4f}', f'{a_["T_fix"] / X.G * 1000:.0f} gf', f'{np.linalg.norm(R) / X.G * 1000:.0f} gf',
                       'N', f'Ansys = |reação de apoio|; N do 1o elemento = {ans["tr"][k]["N_fix"]:.4f} N; nenhuma tração foi '
                       f'medida (células de carga descartadas); "real" = q·a·cosh da catenária ajustada prolongada'])
    peso = X.Q1 * X.L1 + X.Q2 * X.LC
    print(f'soma das verticais: analítico {sV_an:.4f} N, Ansys {sV_ans:.4f} N; peso suspenso (balança) {peso:.4f} N '
          f'= {peso / X.G:.4f} kgf')
    linhas.append(['soma das verticais nas 3 fixações', 'A+B+C', f'{peso:.4f} (balança: 1,373 + 0,4735·1,425 kg)',
                   f'{sV_an:.4f}', f'{sV_ans:.4f}', f'{100 * (sV_an / peso - 1):+.3f}%', f'{100 * (sV_ans / peso - 1):+.3f}%',
                   'N', 'cheque de ordem de grandeza (item 5): deve fechar com o peso suspenso'])
    for k in TRAMOS:
        print(f'comprimento do trecho {k} no Ansys: {ans["tr"][k]["L"]:.5f} m')

    with open(X.RESULTADOS / 'comparacao.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        for l in linhas:
            w.writerow([c.replace('.', ',') if isinstance(c, str) and i in (2, 3, 4, 5, 6) else c for i, c in enumerate(l)])
    X.salvar_json('comparacao.json', dict(
        quadro=quadro,
        no=dict(real=real_no, analitico=mods['Analítico']['P'], ansys=mods['Ansys']['P']),
        marcadores=[{k: v for k, v in l.items()} for l in marc],
        ansys={k: dict(T0_meio=v['T0_meio'], T0_junto_P=v['T0_junto_P'], N_fix=v['N_fix'], R=v['R'], L=v['L'])
               for k, v in ans['tr'].items()},
        soma_verticais=dict(peso=peso, analitico=sV_an, ansys=sV_ans)))
    exportar_visualizador(real_no, mods, marc, tr_vis, dict(peso=peso, analitico=sV_an, ansys=sV_ans), an, quadro)
    figuras(Ex, Pr, aj, an, ans, mods, marc)


def exportar_visualizador(real_no, mods, marc, tr, verticais, an, quadro):
    """Grava visualizador/experimento_comparacao.js: o que a página do Experimento precisa para sobrepor o
    analítico e o Ansys aos marcadores do Qualisys (curvas em mm no sistema do Qualisys, erros e trações)."""
    v1 = lambda v, n=1: [round(float(c), n) for c in v]
    rms = lambda e: float(np.sqrt(np.mean(np.square(e))))
    chave = {'Analítico': 'analitico', 'Ansys': 'ansys'}
    ramos = []
    for k, (ramo, sc, q) in TRAMOS.items():
        r = dict(id=k, prefixo=ramo, nome=X.RAMOS[ramo]['nome'], L_mm=round(X.RAMOS[ramo]['L'] * 1000, 1), q_Nm=round(q, 4),
                 real=dict(T0=round(tr[k]['T0_real'], 3), sT0=round(tr[k]['sT0_real'], 3), Tfix=round(tr[k]['Tfix_real'], 3)))
        for nome, c in chave.items():
            curva = np.asarray(mods[nome]['curva'][k])
            passo = max(1, len(curva) // 50)
            pts = [v1(p) for p in curva[::passo]]
            if not np.allclose(curva[-1], curva[::passo][-1]):
                pts.append(v1(curva[-1]))
            r[c] = dict(curva=pts, T0=round(tr[k]['T0_' + ('an' if c == 'analitico' else 'ansys')], 4),
                        Tfix=round(tr[k]['Tfix_' + ('an' if c == 'analitico' else 'ansys')], 4))
        ramos.append(r)
    obj = {X.TSV.name: dict(
        # quadro medido usado como "real" (índice a partir de 0) e, para referência, os erros com a mediana do ensaio
        quadro=dict(indice=quadro['indice'], total=quadro['total'],
                    mediana={c: {k: round(v, 2) for k, v in quadro['mediana'][n].items()} for n, c in chave.items()}),
        no=dict(real=v1(real_no), **{c: v1(mods[n]['P']) for n, c in chave.items()},
                erro={c: round(float(np.linalg.norm(mods[n]['dP'])), 2) for n, c in chave.items()}),
        sigma_no=v1(an['monte_carlo']['sigma_P_qualisys_mm'], 2),
        ramos=ramos,
        marcadores=[dict(nome=l['marcador'], ramo=l['tramo'], real=v1(l['real']), arco_mm=round(l['s_real'], 1),
                         **{c: dict(pe=v1(l[n]['pe']), erro=round(l[n]['normal'], 2)) for n, c in chave.items()}) for l in marc],
        rms={c: round(rms([l[n]['normal'] for l in marc]), 2) for n, c in chave.items()},
        maximo={c: round(max(l[n]['normal'] for l in marc), 2) for n, c in chave.items()},
        verticais={k: round(v, 3) for k, v in verticais.items()},
        medidas=dict(L1_mm=X.L1 * 1000, eta=X.ETA, LC_mm=X.LC * 1000, q1_kgm=round(X.Q1_KG, 4), q2_kgm=round(X.Q2_KG, 4)))}
    saida = X.RAIZ / 'visualizador' / 'experimento_comparacao.js'
    saida.write_text('// Gerado por experimento/comparacao/comparar.py. Não editar.\n'
                     'window.QTM_COMPARACAO = ' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + ';\n',
                     encoding='utf8', newline='\n')
    print(f'-> {saida.relative_to(X.RAIZ)} ({saida.stat().st_size / 1000:.1f} kB)')


def figuras(Ex, Pr, aj, an, ans, mods, marc):
    E.aplicar()
    cor = {'A': E.C1, 'B': E.C2, 'C': E.C3}
    # ---- Figura 1: perfil de cada ramo no seu plano vertical (como MEF_Perfis_Comparacao):
    # distância horizontal a partir do nó de cada modelo, elevação Z absoluta
    fig, axs = E.figura(3, largura=13, altura=4.4, sharey=True)
    for ax, (k, (ramo, sc, q)) in zip(axs, TRAMOS.items()):
        e = np.array(aj['ramos'][ramo]['e'])
        hor = lambda pts, P: (np.atleast_2d(pts)[:, :2] - P[:2]) @ e
        c_an, P_an = mods['Analítico']['curva'][k], mods['Analítico']['P']
        ax.plot(hor(c_an, P_an), c_an[:, 2], '-', color=E.ANALITICO, lw=1.8, label='Analítico (Código 5)')
        c_f, P_f = mods['Ansys']['curva'][k], mods['Ansys']['P']
        ax.plot(hor(c_f, P_f), c_f[:, 2], 'o', ms=3.6, mfc='white', mew=1.1, color=cor[k], label='MEF (Ansys)')
        pts = np.array([Pr['centro']] + [Pr[f'{ramo}_0{j}'] for j in (3, 2, 1)])
        ax.plot(hor(pts, Pr['centro']), pts[:, 2], 'D', ms=7, color=E.TINTA, mfc=E.TINTA, label='Real (marcadores)', zorder=6)
        fx = np.array(aj['ramos'][ramo]['fixacao'])
        ax.plot(hor(fx, Pr['centro']), [fx[2]], '^', ms=9, mfc='white', mec=E.TINTA, mew=1.4, label='Fixação estimada', zorder=6)
        ax.set_title(f'Ramo {k}–P ({X.RAMOS[ramo]["nome"].split("(")[1][:-1]}, {ramo})', color=cor[k])
        ax.set_xlabel('Distância horizontal a partir do nó [mm]')
    axs[0].set_ylabel('Altura $Z$ [mm]')
    E.legenda(axs[1], ncol=4)
    fig.tight_layout()
    E.salvar(fig, 'MEF_Experimento_Perfis', FIGURAS)

    # ---- Figura 2: vista de cima e erro por marcador
    fig, axs = E.figura(2, largura=13, altura=5.0, gridspec_kw=dict(width_ratios=[1, 1.25]))
    ax = axs[0]
    for k in TRAMOS:
        c_an, c_f = mods['Analítico']['curva'][k], mods['Ansys']['curva'][k]
        ax.plot(c_an[:, 0], c_an[:, 1], '-', color=E.ANALITICO, lw=1.6)
        ax.plot(c_f[::2, 0], c_f[::2, 1], 'o', ms=3.2, mfc='white', mew=1, color=cor[k])
    nomes = [n for n in Pr if n != 'centro']
    pts = np.array([Pr[n] for n in nomes])
    ax.plot(pts[:, 0], pts[:, 1], 'D', ms=6, color=E.TINTA)
    ax.plot(*Pr['centro'][:2], 'D', ms=7, color=E.DESTAQUE)
    for n, p in zip(nomes, pts):
        ax.annotate(n, p[:2], xytext=(5, 4), textcoords='offset points', fontsize=7.5, color=E.TINTA2)
    for k, ramo in (('A', 'C1'), ('B', 'C3'), ('C', 'C2')):
        fx = aj['ramos'][ramo]['fixacao']
        ax.plot(fx[0], fx[1], '^', ms=9, mfc='white', mec=E.TINTA, mew=1.4)
        ax.annotate(k, fx[:2], xytext=(-12, 4), textcoords='offset points', fontweight='bold')
    ax.set_aspect('equal', adjustable='datalim')
    ax.set_xlabel('$X$ Qualisys [mm]')
    ax.set_ylabel('$Y$ Qualisys [mm]')
    ax.set_title('Vista de cima')
    ax = axs[1]
    rot = ['nó'] + [l['marcador'] for l in marc]
    x = np.arange(len(rot))
    w = 0.2
    serie = [('Analítico', 'normal', E.ANALITICO, 'Analítico: distância à curva'),
             ('Ansys', 'normal', E.C1, 'Ansys: distância à curva'),
             ('Analítico', 'arco', E.ANALITICO2, 'Analítico: mesmo arco'),
             ('Ansys', 'arco', E.C4, 'Ansys: mesmo arco')]
    for i, (m, tipo, c, lab) in enumerate(serie):
        v = [np.linalg.norm(mods[m]['dP'])] + [l[m][tipo] for l in marc]
        ax.bar(x + (i - 1.5) * w, v, w, color=c, label=lab)
    sig = np.linalg.norm(an['monte_carlo']['sigma_P_mm'])
    ax.axhline(sig, color=E.MUTED, ls='--', lw=1.2, label=f'incerteza do nó no modelo (1σ, {sig:.1f} mm)'.replace('.', ','))
    ax.set_xticks(x, rot, rotation=45, ha='right')
    ax.set_ylabel('Erro em relação ao real [mm]')
    ax.set_title('Erro por ponto (marcadores na ordem nó → fixação)')
    ax.legend(fontsize=8.5, loc='upper center', bbox_to_anchor=(0.5, -0.2), ncol=3, frameon=False)
    fig.tight_layout()
    E.salvar(fig, 'MEF_Experimento_Erros', FIGURAS)

    # ---- Figura 3: força axial e T0 ao longo de cada trecho no Ansys, com o analítico
    fig, axs = E.figura(2, largura=12, altura=4.2)
    for k in TRAMOS:
        t = ans['tr'][k]
        d = np.diff(t['xyz'], axis=0)
        comp = np.linalg.norm(d, axis=1)
        s = np.concatenate([[0], np.cumsum(comp)])[:-1] + comp / 2
        axs[0].plot(s, t['N'], color=cor[k], label=f'{k}–P')
        axs[1].plot(s, t['t0'], color=cor[k], label=f'{k}–P (MEF)')
        axs[1].axhline(an['ramos'][k]['T0'], color=E.ANALITICO, ls='--', lw=1.2)
        ramo = TRAMOS[k][0]
        axs[1].plot([s[-1] + 0.03], [aj['ramos'][ramo]['T0_N']], 'D', color=cor[k], mec=E.TINTA, ms=6)
    axs[0].set_title('Força axial $N$ (Ansys)')
    axs[1].set_title('Componente horizontal $T_0 = N\\cos\\varphi$')
    for ax in axs:
        ax.set_xlabel('Posição ao longo do trecho, da fixação até P [m]')
        ax.set_ylabel('[N]')
    axs[0].legend()
    axs[1].plot([], [], '--', color=E.ANALITICO, lw=1.2, label='Analítico ($T_0$ constante)')
    axs[1].plot([], [], 'D', color=E.MUTED, label='Real: $q\\,a$ da catenária ajustada')
    axs[1].legend(fontsize=8.5, loc='lower left')
    fig.tight_layout()
    E.salvar(fig, 'MEF_Experimento_Tracao', FIGURAS)


if __name__ == '__main__':
    main()
