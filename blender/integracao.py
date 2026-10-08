"""Integração automática Blender -> site.

Liga sozinha: ao abrir petroleo.blend neste computador (script de início do Blender instalado
pelo próprio `ativar()`, ver `instalar_inicio_automatico`). À mão, no Blender (editor de texto,
console Python ou MCP):
    import integracao; integracao.ativar()
(`modelos.gerar()` também liga no fim.)

O que acontece com ela ligada:
- editou um modelo (moveu, mudou malha ou material)? ~1 s depois da última mudança ele é
  reexportado para site/public/modelos/<nome>.glb;
- salvou o .blend (Ctrl+S)? todos os modelos são reexportados;
- o site ao vivo (`npm run dev`, em http://localhost:5173) sobe escondido se estiver parado, e o
  Blender o encerra ao fechar; com ele aberto no navegador, o modelo novo troca na cena na hora
  (plugin integracaoBlender em site/vite.config.ts), sem recarregar a página.
Painel "Petróleo" na barra lateral da Vista 3D (tecla N): ligar/desligar, exportar tudo,
regenerar e abrir o site ao vivo.
"""

import atexit
import os
import socket
import subprocess
import sys
import tempfile
import time
import webbrowser

import bpy
from bpy.app.handlers import persistent

import nucleo

PASTA = os.path.dirname(os.path.abspath(__file__))
PASTA_SITE = os.path.join(os.path.dirname(PASTA), 'site')
SAIDA = os.path.join(PASTA_SITE, 'public', 'modelos')
# nome do objeto-raiz no Blender = nome do arquivo .glb no site (site/src/cena/modelos.ts)
MODELOS = ('fpso', 'navio_sonda', 'aliviador', 'sismico', 'anm', 'bop', 'rov', 'refinaria')
ATRASO = 1.0
PORTA = 5173
URL_SITE = f'http://localhost:{PORTA}/'
INICIO = 'petroleo_integracao.py'

estado = {'ativa': False, 'pendentes': set(), 'pausa': False, 'ultimo': ''}
# `npm run dev` iniciado por aqui (o valor sobrevive a um importlib.reload deste módulo)
_servidor = globals().get('_servidor')

# Texto guardado dentro do .blend: religa a integração à mão (útil em outro computador).
TEXTO_RELIGAR = '''# Religa a integração automática com o site (Alt+P aqui, ou "Run Script").
# Neste computador ela já liga sozinha ao abrir o arquivo; em outro, rode isto uma vez.
import sys, importlib, bpy
pasta = bpy.path.abspath('//')
if pasta not in sys.path:
    sys.path.insert(0, pasta)
import nucleo, modelos, integracao
for m in (nucleo, modelos, integracao):
    importlib.reload(m)
integracao.ativar()
'''

# Script de início do Blender (pasta scripts/startup do usuário), gerado por instalar_inicio_automatico().
TEXTO_INICIO = '''# Gerado por blender/integracao.py (projeto "Apresentação Geografia").
# Liga sozinha a integração Blender -> site quando petroleo.blend é aberto e a desliga ao abrir
# qualquer outro arquivo. Para o Blender não ligar mais sozinho, apague este arquivo.
import importlib
import os
import sys

import bpy
from bpy.app.handlers import persistent

PASTA = {pasta!r}
ARQUIVO = os.path.join(PASTA, 'petroleo.blend')


def _e_o_projeto():
    caminho = bpy.data.filepath
    return bool(caminho) and os.path.normcase(os.path.abspath(caminho)) == os.path.normcase(ARQUIVO)


def _modulo_do_projeto():
    m = sys.modules.get('integracao')
    arquivo = getattr(m, '__file__', None) or ''
    return m if os.path.normcase(os.path.dirname(arquivo)) == os.path.normcase(PASTA) else None


def _ligar():
    if not _e_o_projeto():
        return None
    try:
        if PASTA not in sys.path:
            sys.path.insert(0, PASTA)
        for nome in ('nucleo', 'modelos', 'integracao'):
            if nome in sys.modules:
                importlib.reload(sys.modules[nome])
            else:
                importlib.import_module(nome)
        sys.modules['integracao'].ativar()
    except Exception as erro:  # pasta fora do lugar, OneDrive sem os arquivos...
        print('[integração] não deu para ligar sozinha:', erro)
    return None


@persistent
def petroleo_ao_abrir(*_args):
    if _e_o_projeto():
        # espera a cena terminar de carregar: assim a abertura não conta como edição
        bpy.app.timers.register(_ligar, first_interval=1.0)
    elif _modulo_do_projeto() is not None:
        _modulo_do_projeto().sair()


def register():
    unregister()
    bpy.app.handlers.load_post.append(petroleo_ao_abrir)


def unregister():
    for f in list(bpy.app.handlers.load_post):
        if getattr(f, '__name__', '') == 'petroleo_ao_abrir':
            bpy.app.handlers.load_post.remove(f)
'''


def raiz_do_modelo(ob):
    while ob is not None:
        if ob.name in MODELOS:
            return ob.name
        ob = ob.parent
    return None


def modelos_existentes():
    return [n for n in MODELOS if bpy.data.objects.get(n) is not None]


def exportar(nomes):
    """Exporta os modelos pedidos para o site e registra o horário."""
    feitos = []
    estado['pausa'] = True
    try:
        os.makedirs(SAIDA, exist_ok=True)
        for nome in nomes:
            raiz = bpy.data.objects.get(nome)
            if raiz is None:
                continue
            nucleo.exportar(raiz, os.path.join(SAIDA, f'{nome}.glb'))
            feitos.append(nome)
    finally:
        estado['pausa'] = False
    if feitos:
        estado['ultimo'] = f"{time.strftime('%H:%M:%S')} · {', '.join(feitos)}"
        print(f"[integração] enviado ao site: {', '.join(feitos)}")
        _redesenhar_paineis()
    return feitos


def _redesenhar_paineis():
    wm = bpy.context.window_manager
    if wm is None:
        return
    for janela in wm.windows:
        for area in janela.screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()


def _exportar_pendentes():
    nomes = sorted(estado['pendentes'])
    estado['pendentes'].clear()
    if nomes:
        exportar(nomes)
    return None


def _marcar(nome):
    if nome:
        estado['pendentes'].add(nome)


@persistent
def _ao_mudar(_cena, depsgraph):
    if not estado['ativa'] or estado['pausa']:
        return
    for u in depsgraph.updates:
        dado = getattr(u.id, 'original', u.id)
        if isinstance(dado, bpy.types.Object):
            if u.is_updated_transform or u.is_updated_geometry:
                _marcar(raiz_do_modelo(dado))
        elif isinstance(dado, bpy.types.Mesh):
            for ob in bpy.data.objects:
                if ob.data == dado:
                    _marcar(raiz_do_modelo(ob))
        elif isinstance(dado, bpy.types.Material):
            for ob in bpy.data.objects:
                if ob.type == 'MESH' and dado.name in ob.data.materials:
                    _marcar(raiz_do_modelo(ob))
    if estado['pendentes']:
        # espera a pessoa parar de mexer antes de exportar
        if bpy.app.timers.is_registered(_exportar_pendentes):
            bpy.app.timers.unregister(_exportar_pendentes)
        bpy.app.timers.register(_exportar_pendentes, first_interval=ATRASO)


@persistent
def _ao_salvar(*_args):
    if estado['ativa']:
        exportar(modelos_existentes())


# ------------------------------------------------------------------ site ao vivo (npm run dev)

def site_ao_vivo_rodando():
    try:
        with socket.create_connection(('localhost', PORTA), timeout=0.3):
            return True
    except OSError:
        return False


def garantir_site_ao_vivo():
    """Sobe o `npm run dev` do site, escondido, se ele ainda não estiver rodando."""
    global _servidor
    if site_ao_vivo_rodando() or (_servidor is not None and _servidor.poll() is None):
        return False
    if not os.path.isdir(os.path.join(PASTA_SITE, 'node_modules')):
        print('[integração] o site ainda não foi instalado: rode "npm install" na pasta site uma vez')
        return False
    registro = open(os.path.join(tempfile.gettempdir(), 'petroleo_site_ao_vivo.log'), 'w', encoding='utf-8')
    _servidor = subprocess.Popen(
        f'npm run dev -- --port {PORTA} --strictPort', cwd=PASTA_SITE, shell=True,
        stdin=subprocess.DEVNULL, stdout=registro, stderr=subprocess.STDOUT,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    print(f'[integração] site ao vivo subindo em {URL_SITE}')
    return True


def _parar_site_ao_vivo():
    """Ao fechar o Blender, encerra o `npm run dev` que ele mesmo iniciou (com os processos filhos)."""
    if _servidor is not None and _servidor.poll() is None:
        subprocess.run(['taskkill', '/PID', str(_servidor.pid), '/T', '/F'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


if not globals().get('_saida_registrada'):
    atexit.register(lambda: _parar_site_ao_vivo())
    _saida_registrada = True


# ------------------------------------------------------------------ início automático

def caminho_inicio():
    return os.path.join(bpy.utils.user_resource('SCRIPTS', path='startup', create=True), INICIO)


def instalar_inicio_automatico():
    """Instala (ou atualiza) o script de início do Blender que liga a integração ao abrir petroleo.blend."""
    import importlib.util
    caminho = caminho_inicio()
    conteudo = TEXTO_INICIO.format(pasta=PASTA)
    try:
        with open(caminho, encoding='utf-8') as f:
            igual = f.read() == conteudo
    except OSError:
        igual = False
    if not igual:
        with open(caminho, 'w', encoding='utf-8') as f:
            f.write(conteudo)
        print(f'[integração] vai ligar sozinha ao abrir petroleo.blend ({caminho})')
    # o Blender só lê a pasta startup ao iniciar: registra já nesta sessão também
    nome = INICIO[:-3]
    if not igual or nome not in sys.modules:
        spec = importlib.util.spec_from_file_location(nome, caminho)
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        sys.modules[nome] = modulo
        modulo.register()
    return caminho


# ------------------------------------------------------------------ painel "Petróleo"

class PETROLEO_OT_alternar(bpy.types.Operator):
    bl_idname = 'petroleo.alternar_integracao'
    bl_label = 'Ligar / desligar integração'
    bl_description = 'Exporta sozinho para o site cada modelo editado e tudo ao salvar'

    def execute(self, _context):
        desativar() if estado['ativa'] else ativar()
        return {'FINISHED'}


class PETROLEO_OT_exportar(bpy.types.Operator):
    bl_idname = 'petroleo.exportar_tudo'
    bl_label = 'Exportar tudo para o site'
    bl_description = 'Grava todos os modelos em site/public/modelos'

    def execute(self, _context):
        feitos = exportar(modelos_existentes())
        self.report({'INFO'}, f'Enviado ao site: {", ".join(feitos)}')
        return {'FINISHED'}


class PETROLEO_OT_regenerar(bpy.types.Operator):
    bl_idname = 'petroleo.regenerar'
    bl_label = 'Regenerar modelos pelo código'
    bl_description = 'Refaz todos os modelos a partir de modelos.py (desfaz edições feitas à mão) e exporta'

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, _context):
        import importlib
        import modelos
        importlib.reload(modelos)
        self.report({'INFO'}, modelos.gerar().replace('\n', ' | '))
        return {'FINISHED'}


class PETROLEO_OT_abrir_site(bpy.types.Operator):
    bl_idname = 'petroleo.abrir_site'
    bl_label = 'Abrir site ao vivo'
    bl_description = 'Abre o site no navegador (e sobe o npm run dev se ele estiver parado)'

    def execute(self, _context):
        garantir_site_ao_vivo()
        tentativas = [0]

        def abrir():
            tentativas[0] += 1
            if site_ao_vivo_rodando() or tentativas[0] > 40:
                webbrowser.open(URL_SITE)
                return None
            return 0.5

        bpy.app.timers.register(abrir, first_interval=0.1)
        return {'FINISHED'}


class PETROLEO_PT_integracao(bpy.types.Panel):
    bl_label = 'Integração com o site'
    bl_idname = 'PETROLEO_PT_integracao'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Petróleo'

    def draw(self, _context):
        col = self.layout.column(align=True)
        ligada = estado['ativa']
        col.label(text='Automática: ligada' if ligada else 'Automática: desligada',
                  icon='LINKED' if ligada else 'UNLINKED')
        col.operator(PETROLEO_OT_alternar.bl_idname, text='Desligar' if ligada else 'Ligar')
        col.separator()
        col.operator(PETROLEO_OT_exportar.bl_idname, icon='EXPORT')
        col.operator(PETROLEO_OT_regenerar.bl_idname, icon='FILE_REFRESH')
        col.operator(PETROLEO_OT_abrir_site.bl_idname, icon='URL')
        col.separator()
        if estado['ultimo']:
            col.label(text=f"Último envio: {estado['ultimo']}")
        col.label(text='Liga sozinha ao abrir petroleo.blend')


CLASSES = (PETROLEO_OT_alternar, PETROLEO_OT_exportar, PETROLEO_OT_regenerar, PETROLEO_OT_abrir_site,
           PETROLEO_PT_integracao)


def _registrar_painel():
    for cls in CLASSES:
        # já registrada (desligou e ligou de novo pelo painel): nada a fazer — tirar e pôr de volta
        # a classe do próprio botão que está rodando derrubaria o Blender. Depois de um
        # importlib.reload a classe é outra, e o Blender troca sozinho a antiga de mesmo bl_idname.
        if not cls.is_registered:
            bpy.utils.register_class(cls)


def _guardar_texto_religar():
    texto = bpy.data.texts.get('integracao_site.py') or bpy.data.texts.new('integracao_site.py')
    # só mexe se mudou: ao abrir o arquivo, a integração liga sem deixá-lo "não salvo"
    if texto.as_string() != TEXTO_RELIGAR:
        texto.clear()
        texto.write(TEXTO_RELIGAR)
    # não registra como módulo: com a execução automática de scripts desligada (padrão do Blender),
    # isso só faria aparecer um aviso de segurança ao abrir o arquivo
    if texto.use_module:
        texto.use_module = False


def ativar():
    """Liga a exportação automática (ao editar e ao salvar), mostra o painel, deixa a integração
    ligando sozinha ao abrir petroleo.blend e sobe o site ao vivo se ele estiver parado."""
    desativar(silencioso=True)
    bpy.app.handlers.depsgraph_update_post.append(_ao_mudar)
    bpy.app.handlers.save_post.append(_ao_salvar)
    estado['ativa'] = True
    _registrar_painel()
    _guardar_texto_religar()
    try:
        instalar_inicio_automatico()
    except OSError as erro:
        print(f'[integração] não deu para instalar o início automático: {erro}')
    garantir_site_ao_vivo()
    print(f'[integração] ligada: modelos vão sozinhos para {SAIDA}')
    return 'integração ligada'


def desativar(silencioso=False):
    for lista, funcao in ((bpy.app.handlers.depsgraph_update_post, _ao_mudar),
                          (bpy.app.handlers.save_post, _ao_salvar)):
        for f in list(lista):
            if getattr(f, '__name__', '') == funcao.__name__ and getattr(f, '__module__', '') == __name__:
                lista.remove(f)
    if bpy.app.timers.is_registered(_exportar_pendentes):
        bpy.app.timers.unregister(_exportar_pendentes)
    estado['ativa'] = False
    if not silencioso:
        print('[integração] desligada')
        _redesenhar_paineis()
    return 'integração desligada'


def sair():
    """Desliga e tira o painel (chamado ao abrir outro arquivo .blend)."""
    desativar(silencioso=True)
    for cls in reversed(CLASSES):
        if cls.is_registered:
            bpy.utils.unregister_class(cls)


class pausada:
    """Bloco em que mudanças não disparam exportação (ex.: enquanto o código gera um modelo)."""

    def __enter__(self):
        self.antes = estado['pausa']
        estado['pausa'] = True

    def __exit__(self, *_):
        # avalia agora as mudanças feitas no bloco, ainda em pausa (senão viram exportação repetida)
        bpy.context.view_layer.update()
        estado['pausa'] = self.antes
        estado['pendentes'].clear()
