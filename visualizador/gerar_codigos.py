"""Gera codigos.js: os códigos do trabalho, sem comentários, para o botão "Ver código"
do visualizador. Rode de novo sempre que um dos arquivos listados em CODIGOS mudar:

    python gerar_codigos.py
"""
import io
import json
import re
import tokenize
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent

# id: (arquivo relativo à raiz do repositório, título, linguagem)
CODIGOS = {
    'cod1': ('analitico/codigo1_catenaria_simples.py', 'Código 1 · catenária simples', 'python'),
    'cod2': ('analitico/codigo2_catenaria_vs_parabola.py', 'Código 2 · catenária × parábola', 'python'),
    'cod3': ('analitico/codigo3_dois_pesos.py', 'Código 3 · dois pesos', 'python'),
    'cod4': ('analitico/codigo4_forca_concentrada.py', 'Código 4 · força concentrada', 'python'),
    'solver': ('analitico/solver_geral.py', 'Solver geral 2D', 'python'),
    'cod5': ('analitico/codigo5_sistema_3d.py', 'Código 5 · sistema 3D', 'python'),
    'apdl3d': ('ansys/catenaria3d.inp', 'Modelo 3D (APDL)', 'apdl'),
    'apdlexp': ('ansys/exportar_resultados.inp', 'Exportação dos resultados (APDL)', 'apdl'),
    'forca': ('ansys/casos_forca.py', 'Casos de força concentrada', 'python'),
    'casos2d': ('ansys/casos_2d.py', 'Casos 2D', 'python'),
    'leitor': ('visualizador/experimento.js', 'Leitor da tabela do Qualisys', 'javascript'),
}


def sem_comentarios_python(texto):
    """Tira comentários (#) e docstrings mantendo a indentação e o resto intacto."""
    linhas = texto.splitlines()
    cortes = {}          # linha -> coluna onde começa o comentário
    apagar = set()       # linhas inteiras de docstring
    toks = list(tokenize.generate_tokens(io.StringIO(texto).readline))
    signif = [t for t in toks if t.type not in (tokenize.NL, tokenize.COMMENT)]
    for i, t in enumerate(signif):
        if t.type == tokenize.STRING:
            ant = signif[i - 1].type if i else tokenize.NEWLINE
            prox = signif[i + 1].type if i + 1 < len(signif) else tokenize.NEWLINE
            if ant in (tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING) and prox in (tokenize.NEWLINE, tokenize.ENDMARKER):
                apagar.update(range(t.start[0], t.end[0] + 1))
    for t in toks:
        if t.type == tokenize.COMMENT:
            cortes[t.start[0]] = t.start[1]
    saida = []
    for n, l in enumerate(linhas, 1):
        if n in apagar:
            continue
        if n in cortes:
            l = l[:cortes[n]].rstrip()
            if not l.strip():
                continue
        saida.append(l.rstrip())
    return saida


def sem_comentarios_apdl(texto):
    """APDL: '!' até o fim da linha (fora de aspas simples) e linhas /COM ou C***."""
    saida = []
    for l in texto.splitlines():
        if re.match(r'\s*(/COM\b|C\*\*\*)', l, re.I):
            continue
        dentro, corte = False, None
        for i, c in enumerate(l):
            if c == "'":
                dentro = not dentro
            elif c == '!' and not dentro:
                corte = i
                break
        if corte is not None:
            l = l[:corte]
            if not l.strip():
                continue
        saida.append(l.rstrip())
    return saida


def sem_comentarios_js(texto):
    """JS: linhas só de comentário e '// ...' no fim da linha (fora de strings e regex)."""
    saida = []
    for l in texto.splitlines():
        if re.match(r'\s*//', l):
            continue
        aspas, corte, i = None, None, 0
        while i < len(l):
            c = l[i]
            if aspas:
                if c == '\\':
                    i += 1
                elif c == aspas:
                    aspas = None
            elif c in '\'"`':
                aspas = c
            elif c == '/' and l[i:i + 2] == '//' and (i == 0 or l[i - 1] in ' \t;,)}'):
                corte = i
                break
            i += 1
        if corte is not None:
            l = l[:corte]
        saida.append(l.rstrip())
    return saida


def limpar(linhas):
    """Junta linhas em branco seguidas e tira as do começo e do fim."""
    out = []
    for l in linhas:
        if not l.strip() and (not out or not out[-1].strip()):
            continue
        out.append(l)
    while out and not out[-1].strip():
        out.pop()
    return '\n'.join(out) + '\n'


def trecho_leitor(texto):
    """Do experimento.js, só os leitores da tabela (entre os marcadores de seção)."""
    a = texto.index('// ---------------------------------------------------------------- leitores')
    b = texto.index('// ---------------------------------------------------------------- estado')
    return texto[a:b]


def main():
    dados = {}
    for chave, (rel, titulo, ling) in CODIGOS.items():
        texto = (RAIZ / rel).read_text(encoding='utf-8-sig')
        if chave == 'leitor':
            texto = trecho_leitor(texto)
        f = {'python': sem_comentarios_python, 'apdl': sem_comentarios_apdl, 'javascript': sem_comentarios_js}[ling]
        dados[chave] = {'titulo': titulo, 'arquivo': rel, 'ling': ling, 'texto': limpar(f(texto))}
        print(f'{rel}: {len(dados[chave]["texto"].splitlines())} linhas')
    destino = AQUI / 'codigos.js'
    destino.write_text('// Gerado por gerar_codigos.py (códigos sem comentários). Não editar.\n'
                       f'window.CODIGOS = {json.dumps(dados, ensure_ascii=False)};\n', encoding='utf-8')
    print(f'-> {destino}')


if __name__ == '__main__':
    main()
