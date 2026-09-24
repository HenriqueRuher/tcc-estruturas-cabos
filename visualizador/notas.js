// Notas explicativas dos cards -> ícone "i" no título, que abre um balão com o texto.
// Os parágrafos .note (exceto avisos .warn) são MOVIDOS para dentro do balão, então
// o app.js continua atualizando-os normalmente pelo id.
(() => {
  'use strict';
  const abertos = new Set();
  const fecharTodos = (exceto) => {
    for (const b of [...abertos]) if (b !== exceto) alternar(b, false);
  };
  function alternar(btn, abrir) {
    const pop = btn._pop;
    abrir = abrir ?? pop.hidden;
    pop.hidden = !abrir;
    btn.setAttribute('aria-expanded', abrir);
    btn.classList.toggle('on', abrir);
    if (abrir) abertos.add(btn); else abertos.delete(btn);
  }
  // cards comuns (título em <h2>) e cards recolhíveis (<details>, título em <summary>)
  document.querySelectorAll('section.card, details.card').forEach((card, k) => {
    const h2 = card.querySelector(':scope > h2, :scope > summary');
    const notas = [...card.querySelectorAll(':scope > p.note')].filter((p) => !p.classList.contains('warn') && p.id !== 'casoAviso');
    if (!h2 || !notas.length) return;
    const pop = document.createElement('div');
    pop.className = 'info-pop'; pop.id = `info-${k}`; pop.hidden = true; pop.setAttribute('role', 'note');
    notas.forEach((p) => pop.appendChild(p));
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'info-btn';
    btn.setAttribute('aria-label', `Sobre: ${h2.textContent.trim()}`);
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', pop.id);
    btn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2"/><path d="M10 9v5"/><circle cx="10" cy="6.2" r=".9" class="p"/></svg>';
    btn._pop = pop;
    if (h2.id) { // o app.js reescreve esse título por textContent: o texto vai para um <span> com o id
      const sp = document.createElement('span');
      while (h2.firstChild) sp.appendChild(h2.firstChild);
      sp.id = h2.id; h2.removeAttribute('id'); h2.appendChild(sp);
    }
    h2.classList.add('com-info');
    h2.appendChild(btn);
    if (h2.tagName === 'SUMMARY') {
      // com o <details> fechado, o navegador não mostra nada fora do <summary>:
      // o balão fica dentro dele, e clicar no balão não abre/fecha o card
      h2.appendChild(pop);
      pop.addEventListener('click', (e) => e.preventDefault());
    } else h2.insertAdjacentElement('afterend', pop);
    // preventDefault: dentro do <summary>, o clique no ícone não abre/fecha o card
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fecharTodos(btn); alternar(btn); });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.info-pop')) fecharTodos(null); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharTodos(null); });
})();
