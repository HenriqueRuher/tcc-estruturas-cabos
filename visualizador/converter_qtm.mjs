// Embute as exportações TSV do Qualisys (../experimento/dados/*.tsv) em
// experimento_dados.js, para o visualizador abrir direto do disco (file://),
// sem servidor. O texto vai como está: quem interpreta é o leitor de experimento.js.
//
// Uso (na pasta visualizador/):  node converter_qtm.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const pasta = join(aqui, '..', 'experimento', 'dados');
const arquivos = readdirSync(pasta).filter((f) => f.toLowerCase().endsWith('.tsv')).sort();
if (!arquivos.length) { console.error(`nenhum .tsv em ${pasta}`); process.exit(1); }

const lista = arquivos.map((arquivo) => {
  const texto = readFileSync(join(pasta, arquivo), 'utf8').replace(/\r\n/g, '\n');
  if (!/^MARKER_NAMES\t/m.test(texto)) console.warn(`aviso: ${arquivo} não tem MARKER_NAMES (não parece exportação 3D do QTM)`);
  console.log(`${arquivo}: ${(texto.length / 1e6).toFixed(2)} MB`);
  return { arquivo, texto };
});
const saida = join(aqui, 'experimento_dados.js');
writeFileSync(saida, '// Gerado por converter_qtm.mjs a partir de ../experimento/dados/*.tsv. Não editar.\n'
  + `window.QTM_ARQUIVOS = ${JSON.stringify(lista)};\n`);
console.log(`-> ${saida} (${lista.length} arquivo(s))`);
