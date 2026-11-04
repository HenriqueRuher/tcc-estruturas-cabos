// Botão "Ver código": transforma cada <div class="ver-codigo" data-codigos="id1,id2">
// num botão que abre um pop-up com os códigos (de codigos.js, gerado por
// gerar_codigos.py), um por aba, com destaque de sintaxe e botões de copiar e baixar.
(() => {
  'use strict';
  const C = window.CODIGOS || {};
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const ICO = {
    codigo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/></svg>',
    arquivo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    baixar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>',
    fechar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    linhas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 5.5h1.5v2M4 11h2l-2 2.5h2M4 17h2l-1 1 1 1H4" class="fino"/></svg>',
    seta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  };
  const LING = { python: ['Py', 'Python'], apdl: ['APDL', 'Ansys APDL'], javascript: ['JS', 'JavaScript'] };

  // ------------------------------------------------------------ destaque de sintaxe (leve)
  const KW = {
    python: 'and as assert break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
    javascript: 'async await break case catch class const continue default delete do else export false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield',
    apdl: '',
  };
  const kwSet = {}; Object.entries(KW).forEach(([k, v]) => { kwSet[k] = new Set(v.split(' ').filter(Boolean)); });
  function realcar(texto, ling) {
    // strings, números, palavras; o resto passa direto
    const re = ling === 'apdl'
      ? /('[^'\n]*')|(\b\d+\.?\d*(?:[eE][-+]?\d+)?\b)|(^\s*[*/]?[A-Za-z][A-Za-z0-9_]*)|([A-Za-z_][A-Za-z0-9_]*)/gm
      : /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*(?:[eE][-+]?\d+)?\b)|(@?[A-Za-z_][A-Za-z0-9_]*(?=\s*\())|([A-Za-z_][A-Za-z0-9_]*)/g;
    let out = '', i = 0, m;
    while ((m = re.exec(texto))) {
      out += esc(texto.slice(i, m.index));
      const [s, str, num, fn, pal] = m;
      if (str) out += `<span class="tk-s">${esc(s)}</span>`;
      else if (num) out += `<span class="tk-n">${s}</span>`;
      else if (fn) {
        if (ling === 'apdl') { // comando no começo da linha
          const pre = s.match(/^\s*/)[0];
          out += pre + `<span class="tk-k">${esc(s.slice(pre.length))}</span>`;
        } else out += kwSet[ling].has(s) ? `<span class="tk-k">${s}</span>` : `<span class="tk-f">${esc(s)}</span>`;
      } else if (pal) out += kwSet[ling].has(s) ? `<span class="tk-k">${s}</span>` : esc(s);
      i = m.index + s.length;
    }
    return out + esc(texto.slice(i));
  }

  // ------------------------------------------------------------ pop-up (um só por página)
  const dlg = document.createElement('dialog');
  dlg.className = 'codigo-dlg';
  dlg.setAttribute('aria-labelledby', 'cdTitulo');
  dlg.innerHTML = `
    <div class="cd-topo">
      <span class="cd-ico">${ICO.codigo}</span>
      <div class="cd-tit"><h2 id="cdTitulo"></h2><small id="cdArq"></small></div>
      <div class="cd-acoes">
        <button type="button" class="cd-btn" id="cdLinhas" aria-pressed="true" title="Mostrar/ocultar números de linha">${ICO.linhas}<span>Linhas</span></button>
        <button type="button" class="cd-btn" id="cdBaixar" title="Baixar o código sem comentários">${ICO.baixar}<span>Baixar</span></button>
        <button type="button" class="cd-btn primario" id="cdCopiar" title="Copiar o código">${ICO.copiar}<span>Copiar</span></button>
        <button type="button" class="cd-btn so-ico" id="cdFechar" aria-label="Fechar" title="Fechar (Esc)">${ICO.fechar}</button>
      </div>
    </div>
    <div class="cd-abas" role="tablist"></div>
    <div class="cd-corpo"><pre class="cd-pre linhas"><code></code></pre></div>
    <div class="cd-rodape"><span id="cdInfo"></span><span class="cd-dica">Comentários removidos · indentação original · código completo em <a href="https://github.com/HenriqueRuher/tcc-estruturas-cabos" target="_blank" rel="noopener noreferrer">GitHub</a></span></div>`;
  document.body.appendChild(dlg);
  const $d = (s) => dlg.querySelector(s);
  let atual = null;
  function mostrar(id) {
    const c = C[id]; if (!c) return;
    atual = id;
    $d('#cdTitulo').textContent = c.titulo;
    $d('#cdArq').textContent = c.arquivo;
    const linhas = c.texto.replace(/\n$/, '').split('\n');
    $d('code').innerHTML = linhas.map((l) => `<span class="ln">${realcar(l, c.ling) || ' '}</span>`).join('');
    $d('#cdInfo').innerHTML = `<span class="cd-selo l-${c.ling}">${LING[c.ling][0]}</span> ${LING[c.ling][1]} · ${linhas.length} linhas`;
    dlg.querySelectorAll('.cd-abas button').forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $d('.cd-corpo').scrollTop = 0;
    const cp = $d('#cdCopiar'); cp.classList.remove('feito'); cp.innerHTML = `${ICO.copiar}<span>Copiar</span>`;
  }
  function abrir(ids, inicial) {
    const validos = ids.filter((id) => C[id]);
    if (!validos.length) return;
    const abas = $d('.cd-abas');
    abas.hidden = validos.length < 2;
    abas.innerHTML = validos.map((id) => `<button type="button" role="tab" data-id="${id}"><span class="cd-selo l-${C[id].ling}">${LING[C[id].ling][0]}</span>${esc(C[id].titulo)}</button>`).join('');
    mostrar(inicial && validos.includes(inicial) ? inicial : validos[0]);
    dlg.showModal();
  }
  $d('.cd-abas').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) mostrar(b.dataset.id); });
  $d('#cdFechar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => {
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
  $d('#cdLinhas').addEventListener('click', (e) => {
    const on = $d('.cd-pre').classList.toggle('linhas');
    e.currentTarget.setAttribute('aria-pressed', on);
  });
  $d('#cdCopiar').addEventListener('click', async (e) => {
    const b = e.currentTarget, texto = C[atual].texto;
    try { await navigator.clipboard.writeText(texto); }
    catch (err) { // sem permissão da área de transferência: método antigo
      const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
      dlg.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    b.classList.add('feito'); b.innerHTML = `${ICO.ok}<span>Copiado!</span>`;
    clearTimeout(b._t); b._t = setTimeout(() => { b.classList.remove('feito'); b.innerHTML = `${ICO.copiar}<span>Copiar</span>`; }, 1800);
  });
  $d('#cdBaixar').addEventListener('click', () => {
    const c = C[atual], a = document.createElement('a');
    a.download = c.arquivo.split('/').pop();
    a.href = URL.createObjectURL(new Blob([c.texto], { type: 'text/plain' }));
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ------------------------------------------------------------ botões nas páginas
  document.querySelectorAll('.ver-codigo').forEach((el) => {
    const ids = (el.dataset.codigos || '').split(',').map((s) => s.trim()).filter((id) => C[id]);
    if (!ids.length) { el.hidden = true; return; }
    const selos = [...new Set(ids.map((id) => C[id].ling))].map((l) => `<span class="cd-selo l-${l}" title="${LING[l][1]}">${LING[l][0]}</span>`).join('');
    const rotulo = el.dataset.rotulo || (ids.length > 1 ? `Ver os códigos (${ids.length})` : 'Ver o código');
    el.innerHTML = `<button type="button" class="vc-btn"><span class="vc-ico">${ICO.codigo}</span>`
      + `<span class="vc-txt"><b>${esc(rotulo)}</b><small>${ids.map((id) => esc(C[id].titulo)).join(' · ')}</small></span>`
      + `<span class="vc-selos">${selos}</span><span class="vc-seta">${ICO.seta}</span></button>`;
    el.querySelector('button').addEventListener('click', () => abrir(ids, el.dataset.inicial));
  });
})();
