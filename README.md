# Petróleo — da rocha ao mundo (jornada 3D)

Site imersivo para o Seminário de Geografia (Fontes de energia — petróleo), de Felipe Barrence Sonsin, 2º ano do Ensino Médio.
A rolagem conduz uma câmera 3D por **todas as etapas da produção do petróleo**, em ordem:
origem (formação e pré-sal) → exploração (sísmica) → perfuração → extração (árvore de natal, ROV, risers) → produção na plataforma FPSO (separador, tocha) → transporte (navio aliviador) → refino (torre de destilação) → consumo → desafio (impactos).

Regras de design definidas pelo aluno: **sem slides, sem caixa de texto fixa ao lado, sem aba de referências**. Só textos que aparecem e somem com a rolagem sobre a cena 3D, no estilo das referências Hubtown e Edolus (noite azul-escura, brilho, partículas, moldura fina, títulos largos com letras surgindo em ordem aleatória).

Este é o **único guia** do projeto.

---

## 1. Abrir e apresentar

No Windows, dê dois cliques em `site/Iniciar_Apresentacao.cmd` (instala na primeira vez, gera o build e abre `http://localhost:4173`). Depois disso funciona sem internet.

Pelo terminal (Node.js 20+):

```bash
cd site
npm install        # só na primeira vez
npm run dev        # desenvolvimento: http://localhost:5173
npm run apresentar # build + abre http://localhost:4173
npm run build      # gera site/dist (arquivos estáticos, caminhos relativos)
```

Abrir `index.html` direto do disco não funciona (módulos JS são bloqueados em `file://`).

Durante a apresentação:

| Ação | Como |
| --- | --- |
| Avançar / voltar devagar | roda do mouse, trackpad, ↓ ↑, PageDown/PageUp |
| Pular para a próxima / anterior etapa com texto | → / ← |
| Início / fim | Home / End |
| Ir para um capítulo | lista "Início … Desafio" à esquerda (telas com 1280 px ou mais; some enquanto o título grande está na tela) |
| Tela cheia | botão "Tela cheia" |
| Computador lento | botão "Gráficos alto/leve" (lembrado no navegador) |
| Abrir direto numa cena | endereço com `#id`, ex.: `http://localhost:4173/#torre` (ids em `site/src/roteiro.ts`) |

Desempenho medido: cena pronta em ~2 s e 60 fps numa GPU dedicada (RTX 4050). No modo "leve" a resolução, o reflexo do mar e o número de partículas caem.

---

## 2. Pastas

```
README.md                 este guia
blender/
  nucleo.py               ferramentas: paleta de materiais, construtor por material, primitivas, exportação GLB (Draco)
  modelos.py              gera TODOS os modelos: FPSO (com separador cortável), navio-sonda, aliviador,
                          navio sísmico, árvore de natal molhada (ANM), BOP, ROV e refinaria (com torre cortável)
  integracao.py           integração automática com o site: exporta sozinho o que for editado/salvo, liga sozinha
                          ao abrir petroleo.blend, sobe o site ao vivo + painel "Petróleo"
  petroleo.blend          cena do Blender com os modelos gerados (cada um numa coleção, todos na origem)
site/
  public/modelos/*.glb    modelos exportados pelo Blender (≈1 MB no total, compressão Draco)
  public/texturas/        agua_normal.png (ondas do mar, gerada no Blender)
  public/draco/           decodificador Draco (para funcionar offline)
  src/roteiro.ts          ★ CONTEÚDO E RITMO: cenas, textos, câmera, efeitos, capítulos
  src/mundo.ts            geografia: nível do mar, fundo (-2000 m), camadas do pré-sal, posições de poços e navios
  src/estado.ts           parâmetros animados pela rolagem (corte, sísmica, broca, fluxo, separador, torre, rede…)
  src/rolagem.ts          Lenis (rolagem suave) + GSAP ScrollTrigger: monta a linha do tempo mestra
  src/App.tsx             junta 3D, textos, painel e teclado
  src/ui/Textos.tsx       blocos de texto que entram/saem (desfoque + letras do título em ordem aleatória)
  src/ui/Hud.tsx          moldura, marca, lista de etapas, profundidade/altitude, barra de progresso, botões
  src/ui/Carregamento.tsx tela de carregamento
  src/cena/               3D (React Three Fiber + three.js)
    Experiencia.tsx       Canvas, pré-compilação dos shaders, ordem dos componentes
    modelos.ts            carrega os .glb do Blender (useModelo), aplica o acabamento (desgaste) e troca na hora
                          quando o Blender reexporta
    CameraRig.tsx         câmera na curva dos quadros do roteiro (+ leve paralaxe do mouse)
    Ambiente.tsx          neblina e luzes que mudam com a profundidade (mar azul-escuro, nunca preto)
    Ceu.tsx  Oceano.tsx   céu noturno (e, debaixo d'água, o degradê da água); mar com reflexo (Water)
    Submerso.tsx          raios de luz, plâncton luminoso e partículas desfocadas no mar fundo
    Plataforma.tsx        FPSO, tocha, luzes do convés, corte do separador e rótulos Gás/Óleo/Água
    Navios.tsx            navio-sonda, navio sísmico + cabos, aliviadores (atracado e viajando) e mangueira
    CampoSubmarino.tsx    fundo do mar (lodo com relevo procedural, pedras), risers "lazy wave", flutuadores,
                          amarras, árvores de natal com luzes de trabalho, ROV, BOP, neve marinha
    Corte.tsx             corte geológico em "raio X": água e rochas (arenito/folhelho, sal em faixas de fluxo,
                          carbonato poroso com óleo, folhelho gerador, basalto, falhas), sísmica, poços (shaders)
    Fluxos.tsx            óleo/gás/água correndo pelos dutos (partículas + "rio de luz")
    Costa.tsx             litoral (relevo, espuma das ondas, luzes da serra, navios fundeados), refinaria com
                          vapor, torre de destilação cortada, cidades com ruas e trânsito, rotas de distribuição
    Efeitos.tsx           bloom, curva de tons, vinheta e grão
    trajetos.ts util.ts   curvas dos dutos e do caminho do óleo; ruído e utilitários
```

---

## 3. Como funciona

1. A página tem uma "trilha" alta (`DURACAO × 90vh`). O ScrollTrigger liga a rolagem a **uma única linha do tempo GSAP** (`rolagem.ts`), 1:1 (`scrub: true`): a única suavização é a do Lenis.
2. A linha do tempo anima três coisas, todas lidas de `roteiro.ts`:
   - `cena.cam`: posição na lista de quadros de câmera (`CHAVES`, sem repetições). O `CameraRig` passa uma curva Catmull-Rom por todos os quadros (posição e alvo). O avanço segue `camNoTempo`: uma curva de Hermite por trecho cuja velocidade da imagem passa de um trecho ao outro sem trancos e **sem parar a cada cena** (antes a câmera acelerava e freava até zero em cada quadro).
   - parâmetros da cena 3D (`cena.corte`, `cena.sismica`, `cena.broca`, `cena.fluxo`…), que cada componente lê a cada quadro (`useFrame`);
   - os blocos de texto (opacidade, desfoque, letras do título).
3. Nada disso re-renderiza o React: `estado.ts` é um objeto comum que o GSAP escreve e o three.js lê.
4. Tempo em **unidades de rolagem** (1 unidade = 90% da altura da tela). Cada cena tem `duracao`; a câmera chega ao quadro `camera` depois de `transicao` e desliza até `deriva` no resto da cena.

### Coordenadas do mundo (metros, escala real na vertical)

- Y para cima, mar em `y = 0`, fundo do mar em `y = -2000`, reservatório do pré-sal entre ~-5.850 e -6.400 m.
- FPSO na origem, proa para +X, bombordo (balcão dos risers) para -Z.
- Corte geológico: plano `z = 100`; a câmera fica do lado -Z olhando para +Z, então **a direita da tela é o lado -X do mundo**.
- Refinaria e cidade na costa, em `x ≈ -27.600` (a distância real de ~300 km foi encurtada; o texto diz 300 km).
- Modelos do Blender chegam com (x, y, z) do Blender virando (x, z, -y) no three.js.

---

## 4. Tarefas comuns

**Mudar um texto** — edite `textos` da cena em `site/src/roteiro.ts` (rótulo, título, texto, `dado` com número em destaque). Posições: `esquerda`, `direita`, `centro`, `base` (no celular todos vão para baixo).

**Enquadramento** — com a lista de etapas na tela (1280 px ou mais), o texto da `esquerda` começa em ~196 px e vai até ~640 px. Deixe o assunto da cena à direita do centro: ponha o `alvo` da câmera um pouco à esquerda dele (como em `chegada` e `torre`). Confira sempre em 1280×720 (projetor comum) e em 1920×1080.

**Criar ou mexer numa cena** — acrescente/edite um objeto em `CENAS` (mesmo arquivo):

```ts
{
  id: 'minha-cena', capitulo: 'producao', duracao: 1.8, transicao: 1.0,
  camera: { pos: [x, y, z], alvo: [x, y, z], fov: 42 },
  deriva: { pos: [...], alvo: [...] },            // opcional: desliza devagar até o fim da cena
  efeitos: [{ parametro: 'separador', de: 0, para: 1, inicio: 0.9, fim: 1.6 }],
  textos: [{ posicao: 'esquerda', rotulo: '5 · Produção', titulo: '…', texto: '…' }],
}
```

Para achar bons quadros de câmera: rode `npm run dev`, abra com `#id-da-cena` e use no console `__jornada.irParaTempo(tempo, 0)`; `__jornada.cena` mostra os parâmetros. Em desenvolvimento, `?sem=costa,campo,corte,navios,fluxos` desliga partes da cena para isolar problemas.

**Mudar um modelo 3D (integração automática Blender → site)**

O caminho é automático nos dois sentidos de trabalho:

1. *Por código* — edite `blender/modelos.py` e rode no Blender (5.x), pelo editor de texto ou pelo MCP for Blender:

   ```python
   import sys, importlib
   sys.path.insert(0, r'<pasta do projeto>\blender')
   import nucleo, modelos, integracao
   for m in (nucleo, modelos, integracao): importlib.reload(m)
   modelos.gerar('fpso')     # ou modelos.gerar() para todos -> site/public/modelos/<nome>.glb
   nucleo.mostrar_so('fpso') # mostra só esse modelo no viewport
   ```

2. *À mão* — com a integração ligada, qualquer edição num modelo (mover, mudar malha ou material) é reexportada ~1 s depois da última mudança, e **Ctrl+S** reexporta todos (o site só troca os que mudaram de conteúdo). No Blender, a barra lateral da Vista 3D (tecla N) tem a aba **Petróleo** com: ligar/desligar, "Exportar tudo para o site", "Regenerar modelos pelo código" (este desfaz edições à mão) e "Abrir site ao vivo".

**Tudo liga sozinho neste computador.** Basta abrir `petroleo.blend` (dois cliques). Cerca de 1 s depois a integração liga, e o site ao vivo (`npm run dev`, escondido, em http://localhost:5173) sobe se estiver parado. Ao fechar o Blender, esse servidor fecha junto. Abrir outro arquivo `.blend` desliga a integração e tira o painel; voltar ao `petroleo.blend` religa. Quem faz isso é o script de início do Blender `%APPDATA%\Blender Foundation\Blender\5.2\scripts\startup\petroleo_integracao.py`, que o `integracao.ativar()` instala e atualiza. Para desfazer, apague esse arquivo. Em outro computador, rode uma vez o texto embutido `integracao_site.py` (editor de texto → Alt+P) ou `integracao.ativar()`; daí em diante ele também liga sozinho. A execução automática de scripts do Blender continua desligada: não precisa (nem deve) ser ativada. O log do site ao vivo fica em `%TEMP%\petroleo_site_ao_vivo.log`.

Do lado do site, o plugin `integracaoBlender` (`site/vite.config.ts`) percebe o `.glb` novo e a cena troca o modelo na hora — sem recarregar a página nem perder o ponto da rolagem — e aparece o aviso "↻ Blender → site: … atualizado". No build, cada modelo vai com `?v=<hash>` na URL (`site/src/cena/modelos.ts`), então nunca fica preso em cache velho. Os componentes 3D carregam modelos sempre por `useModelo('<nome>')`. Para conferir uma troca, digite `__modelos` no console do navegador (em `npm run dev`): mostra a versão de cada modelo e quantas vezes ele foi trocado.

O nome do objeto-raiz no Blender é o nome do arquivo no site (`fpso`, `navio_sonda`, `aliviador`, `sismico`, `anm`, `bop`, `rov`, `refinaria`); um modelo novo precisa entrar em `MODELOS` (`integracao.py`), em `GERADORES` (`modelos.py`) e no tipo `NomeModelo` (`modelos.ts`).

Ferramentas de modelagem do `Construtor` (`blender/nucleo.py`): `caixa`, `caixa_chanfrada` (quinas chanfradas que pegam brilho), `cilindro`, `esfera`, `toro` (volantes, aros), `flange` (com parafusos), `propulsor` (duto com hélice), `vaso_horizontal/vertical`, `tubo`, `trelica`, `guarda_corpo`, `escada`, `luz`. Em `modelos.py` há ainda `piso_contorno` (castelo de proa que segue o casco), `mastro_radar` e `baleeira_queda_livre`.

Acabamento no site: `modelos.ts` aplica a todo material vindo do Blender um desgaste procedural (manchas, variação de brilho; juntas de chapa e escorridos de ferrugem nos cascos; juntas no convés; incrustação marinha na base da árvore de natal e do BOP). Materiais emissivos (`luz_*`, `janela`, `fr_*`, `sep_*`) e os que o site corta (`separador_casco`, `torre_casco`) ficam de fora.

Convenções que o site usa (não renomeie sem ajustar o código):
- materiais `luz_*` e `janela` são emissivos (brilham com o bloom);
- separador: malha com material `separador_casco` (cortada no site) e fases `sep_agua`, `sep_oleo`, `sep_gas`;
- torre de destilação: `torre_casco` (cortada) e frações `fr_glp`, `fr_gasolina`, `fr_querosene`, `fr_diesel`, `fr_oleo`, `fr_residuo` (alturas em `FRACOES`, iguais às de `Costa.tsx`);
- Empties `ponto_*` marcam lugares usados no site: `ponto_tocha`, `ponto_riser_XX`, `ponto_mangote`, `ponto_separador`, `ponto_tocha_refinaria`, `ponto_pier`…

---

## 5. Regras técnicas (aprendidas na prática — siga sempre)

1. **Nada de NaN nos shaders.** No Windows (Chrome/Edge usam Direct3D), `pow()` com base que pode ser zero ou negativa e normais inválidas geram NaN, e o bloom espalha um único pixel NaN até a tela ficar preta. Use `clamp`/`max`, troque `pow(x, 2.0)` por `x * x` e passe tubos por `sanear()` (`Fluxos.tsx`).
2. **Não mude o número de luzes durante a jornada.** Esconder um grupo que contém luz recompila todos os materiais (engasgo). Para "apagar", zere a intensidade. Hoje há: hemisférica, lua, 2 luzes do convés, tocha e a luz do ROV/lanterna.
3. **Evite SpotLight** (deixou o carregamento 20× mais lento no Windows). Prefira poucas PointLight e brilho emissivo + bloom.
4. Planos vistos "de trás" precisam de `side: DoubleSide`.
5. Partículas que correm dentro de tubos são empurradas um pouco para a câmera no vertex shader; sem isso o próprio tubo as esconde.
6. O carregamento compila **todos** os shaders antes de mostrar a cena (`Pronto` em `Experiencia.tsx`). Mantenha, senão cada etapa nova engasga na primeira vez.
7. Teste no Chrome ou Edge do Windows. Se a aba ficar em segundo plano durante o carregamento, o navegador pausa a animação.
8. A pasta `site/public` fica fora da varredura do Tailwind (`@source not "../public"` em `estilos.css`): sem isso, cada `.glb` exportado pelo Blender recarregava a página inteira.
9. O projeto está no OneDrive, que às vezes "toca" arquivos ao sincronizar; o plugin só avisa o site quando o conteúdo do modelo realmente muda.
10. Na troca ao vivo de um modelo, só as **geometrias** da versão antiga são liberadas. Não descarte os materiais: isso libera programas de shader que a versão nova ainda vai usar, e recompilar no Direct3D trava a página.
11. **Detalhe procedural tem que sumir de longe.** Padrões finos (laminação das rochas, relevo do terreno, juntas de chapa) usam `fwidth` para desaparecer quando ficam menores que alguns pixels; sem isso eles "chuviscam" (o terreno da costa chegou a parecer quadriculado).
12. **Debaixo d'água nada é preto chapado.** A névoa e o fundo seguem o degradê de `Ambiente.tsx` (azul-esverdeado perto da superfície, azul-escuro no fundo), a luz hemisférica nunca zera e `Submerso.tsx` dá brilho (raios, plâncton). Partículas aditivas devem ser apagadas pela neblina (multiplicar pelo fator dela), não "clareadas" para a cor da névoa.

---

## 6. Conteúdo e fontes (números usados na tela)

- ≈80% do petróleo e do gás produzidos no Brasil em 2025 vieram do pré-sal (ANP, boletim mensal de produção: 79,6%).
- Pré-sal: rochas formadas há mais de 100 milhões de anos; reservatórios a até ~7 km do nível do mar (≈2 km de água + ≈5 km de rocha e sal); camada de sal de ~2.000 m na Bacia de Santos; ~300 km da costa em média (Petrobras; Coppe/UFRJ).
- Petróleo e derivados ≈35% da oferta interna de energia do Brasil em 2023 (EPE, Balanço Energético Nacional 2024).
- Demais valores são ordens de grandeza de manuais técnicos: luz do sol até ~200 m, ~4 °C e ~200 atm a 2.000 m, FPSO ≈300 m, aliviador ≈1 milhão de barris, destilação a quase 400 °C, Brasil entre os 10 maiores produtores.

A tela final mostra as fontes numa linha discreta (sem aba de referências).

---

## 7. Próximos passos possíveis

- Som ambiente opcional (mar, sonar, máquinas).
- Microvista dos poros da rocha com óleo (zoom dentro do reservatório).
