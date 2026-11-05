// Embute o panorama, a máscara de foto real e a textura do piso (img/lab/) em lab/ambiente_dados.js como data URI.
// Necessário porque, aberto por file://, o navegador não deixa o WebGL usar imagens de outros arquivos.
// Uso: node converter_lab.mjs   (rode de novo sempre que ../experimento/gerar_ambiente.py refizer as imagens)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const uri = (arq) => {
  const f = join(aqui, 'img', 'lab', arq);
  if (!existsSync(f)) return null;
  return `data:image/${arq.endsWith('.png') ? 'png' : 'jpeg'};base64,` + readFileSync(f).toString('base64');
};
const js = '// Gerado por converter_lab.mjs a partir de img/lab/. Não editar.\n'
  + `window.LAB_AMBIENTE = ${JSON.stringify({ ambiente: uri('ambiente.jpg'), piso: uri('piso.jpg'), mascara: uri('ambiente_mascara.png'), sala: uri('sala_atlas.jpg') })};\n`;
writeFileSync(join(aqui, 'lab', 'ambiente_dados.js'), js);
console.log(`lab/ambiente_dados.js: ${(js.length / 1024 / 1024).toFixed(2)} MB`);
