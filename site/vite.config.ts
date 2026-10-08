import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PASTA_MODELOS = path.join(RAIZ, 'public', 'modelos');

/** Hash curto do conteúdo de cada GLB exportado pelo Blender (vira ?v=… na URL: nada de cache velho). */
function versoesDosModelos() {
  const versoes: Record<string, string> = {};
  if (!fs.existsSync(PASTA_MODELOS)) return versoes;
  for (const arquivo of fs.readdirSync(PASTA_MODELOS)) {
    if (!arquivo.endsWith('.glb')) continue;
    const dados = fs.readFileSync(path.join(PASTA_MODELOS, arquivo));
    versoes[arquivo.slice(0, -4)] = crypto.createHash('md5').update(dados).digest('hex').slice(0, 10);
  }
  return versoes;
}

/**
 * Integração automática com o Blender.
 * - módulo virtual `virtual:versoes-modelos` com a versão de cada modelo (build e desenvolvimento);
 * - em `npm run dev`, quando o Blender regrava um .glb em public/modelos, o site recebe o evento
 *   `blender:modelos` e troca o modelo na cena na hora, sem recarregar a página.
 */
function integracaoBlender(): Plugin {
  const ID = 'virtual:versoes-modelos';
  const RESOLVIDO = '\0' + ID;
  return {
    name: 'integracao-blender',
    resolveId: (id) => (id === ID ? RESOLVIDO : undefined),
    load: (id) => (id === RESOLVIDO ? `export default ${JSON.stringify(versoesDosModelos())};` : undefined),
    handleHotUpdate({ file }) {
      // o próprio plugin avisa a página; evita a recarga completa padrão
      if (file.endsWith('.glb')) return [];
    },
    configureServer(server) {
      server.watcher.add(PASTA_MODELOS);
      let conhecidas = versoesDosModelos();
      let espera: ReturnType<typeof setTimeout> | undefined;
      const aoMudar = (arquivo: string) => {
        if (!arquivo.endsWith('.glb')) return;
        clearTimeout(espera);
        // o Blender grava o arquivo em partes: espera assentar antes de avisar
        espera = setTimeout(() => {
          const versoes = versoesDosModelos();
          // só o que mudou de conteúdo (o OneDrive "toca" arquivos ao sincronizar)
          const nomes = Object.keys(versoes).filter((n) => versoes[n] !== conhecidas[n]);
          conhecidas = versoes;
          if (!nomes.length) return;
          const mod = server.moduleGraph.getModuleById(RESOLVIDO);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'custom', event: 'blender:modelos', data: { nomes, versoes } });
          server.config.logger.info(`[blender] ${nomes.join(', ')} atualizado(s): trocando na cena`, { timestamp: true });
        }, 400);
      };
      server.watcher.on('change', aoMudar);
      server.watcher.on('add', aoMudar);
    },
  };
}

// base './' deixa o build (dist/) funcionando em qualquer pasta ou hospedagem estática.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), integracaoBlender()],
  server: { port: 5173 },
  // a cena 3D (three.js + React Three Fiber) é um bloco único de propósito: ~470 KB com gzip
  build: { chunkSizeWarningLimit: 2200 },
});
