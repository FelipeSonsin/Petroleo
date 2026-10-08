"""Ferramentas comuns para gerar os modelos da jornada do petróleo no Blender.

Unidades: 1 unidade = 1 metro. Eixos do Blender: X = comprimento (proa em +X),
Y = boca (bombordo em +Y), Z = altura (linha d'água em Z = 0).
O exportador glTF converte para Y-up: (x, y, z) do Blender vira (x, z, -y) no three.js.

O Construtor junta toda a geometria por material (poucas chamadas de desenho no navegador).
Pontos de referência para o site (tocha, risers, mangote...) são Empties chamados "ponto_*".
"""

import math
import random

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector


# ------------------------------------------------------------------ cores e materiais

def srgb(hexcor):
    """'#rrggbb' (sRGB) -> RGBA linear, que é o que o Principled BSDF espera."""
    hexcor = hexcor.lstrip('#')
    rgb = [int(hexcor[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return (*lin, 1.0)


# nome: (cor base, rugosidade, metálico, cor de emissão ou None, força da emissão)
PALETA = {
    'casco': ('#2a3036', 0.62, 0.35, None, 0),
    'casco_linha': ('#121315', 0.6, 0.2, None, 0),
    'casco_fundo': ('#5e1a12', 0.75, 0.1, None, 0),
    'conves': ('#3b3f3b', 0.9, 0.1, None, 0),
    'estrutura': ('#8d9497', 0.55, 0.55, None, 0),
    'estrutura_escura': ('#4b5155', 0.6, 0.5, None, 0),
    'vaso': ('#c3c6c2', 0.45, 0.3, None, 0),
    'tubo': ('#7a8285', 0.5, 0.6, None, 0),
    'tubo_verde': ('#4f6b55', 0.55, 0.3, None, 0),
    'tubo_vermelho': ('#8a2a22', 0.55, 0.3, None, 0),
    'amarelo': ('#d99a17', 0.5, 0.2, None, 0),
    'laranja': ('#ff5f0f', 0.45, 0.1, None, 0),
    'branco': ('#d6d9d5', 0.55, 0.1, None, 0),
    'heliponto': ('#2c3a31', 0.85, 0.1, None, 0),
    'marca_branca': ('#e8e8e2', 0.6, 0.0, None, 0),
    'marca_amarela': ('#f2b705', 0.6, 0.0, None, 0),
    'borracha': ('#141516', 0.8, 0.0, None, 0),
    'concreto': ('#6f706b', 0.95, 0.0, None, 0),
    'tanque': ('#b9bcb8', 0.5, 0.4, None, 0),
    'janela': ('#1a1d22', 0.2, 0.0, '#ffd2a0', 3.0),
    'janela_apagada': ('#0c0e12', 0.15, 0.3, None, 0),
    'luz_sodio': ('#2a1a0a', 0.5, 0.0, '#ffad55', 14.0),
    'luz_branca': ('#202428', 0.5, 0.0, '#dfe9ff', 12.0),
    'luz_vermelha': ('#200808', 0.5, 0.0, '#ff2a14', 18.0),
    'luz_verde': ('#082010', 0.5, 0.0, '#2bff6e', 14.0),
    'luz_azul': ('#081420', 0.5, 0.0, '#4fc3ff', 14.0),
    'casco_sonda': ('#4a1d1b', 0.6, 0.3, None, 0),
    'casco_aliviador': ('#262a30', 0.6, 0.35, None, 0),
    'casco_sismico': ('#1d2c47', 0.55, 0.3, None, 0),
    'chamine': ('#2c3034', 0.6, 0.3, None, 0),
    'faixa': ('#c2902c', 0.5, 0.2, None, 0),
    'asfalto': ('#17181a', 0.95, 0.0, None, 0),
    'tanque_teto': ('#7f8486', 0.6, 0.5, None, 0),
    'forno_fogo': ('#2a0c02', 0.6, 0.0, '#ff6a1a', 7.0),
    # torre de destilação: casco (cortado no site), pratos e frações em cada altura
    'torre_casco': ('#a2a8ab', 0.45, 0.55, None, 0),
    'prato': ('#50575b', 0.6, 0.5, None, 0),
    'fr_glp': ('#0b2a33', 0.4, 0.0, '#8fe6ff', 2.2),
    'fr_gasolina': ('#2e2a08', 0.4, 0.0, '#ffe45c', 2.2),
    'fr_querosene': ('#2e2208', 0.4, 0.0, '#ffc247', 2.2),
    'fr_diesel': ('#2e1a06', 0.4, 0.0, '#ff9a36', 2.2),
    'fr_oleo': ('#2a1004', 0.4, 0.0, '#e2622a', 2.2),
    'fr_residuo': ('#1a0803', 0.4, 0.0, '#9c3412', 2.0),
    # separador trifásico: casco próprio (cortado no site) e fases internas
    'separador_casco': ('#cdd1cd', 0.4, 0.35, None, 0),
    'sep_agua': ('#0a2340', 0.3, 0.0, '#2f7dff', 2.0),
    'sep_oleo': ('#2a1400', 0.3, 0.0, '#ff9a24', 2.6),
    'sep_gas': ('#061c24', 0.3, 0.0, '#5fe3ff', 1.4),
    # equipamentos submarinos e detalhes dos navios
    'amarelo_sub': ('#e3a514', 0.42, 0.15, None, 0),
    'laranja_rov': ('#ff6c0a', 0.5, 0.05, None, 0),
    'preto_rov': ('#1c1e21', 0.55, 0.35, None, 0),
    'aco': ('#9aa2a6', 0.32, 0.9, None, 0),
    'aco_escuro': ('#555c61', 0.4, 0.85, None, 0),
    'anodo': ('#b9b6ab', 0.6, 0.6, None, 0),
    'azul_eq': ('#2d5d9a', 0.5, 0.25, None, 0),
    'verde_conves': ('#3d5a45', 0.85, 0.1, None, 0),
    'vermelho_conves': ('#7a2a22', 0.85, 0.1, None, 0),
    'superestrutura': ('#e6e2d6', 0.6, 0.1, None, 0),
    'vidro': ('#0d1a22', 0.08, 0.5, None, 0),
    'luz_led': ('#2a3036', 0.4, 0.0, '#eef6ff', 22.0),
    'luz_ambar': ('#2a1a08', 0.4, 0.0, '#ffb347', 16.0),
}


def material(nome):
    mat = bpy.data.materials.get(nome)
    if mat is None:
        mat = bpy.data.materials.new(nome)
    cor, rug, met, emis, forca = PALETA.get(nome, ('#808080', 0.6, 0.0, None, 0))
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = srgb(cor)
    bsdf.inputs['Roughness'].default_value = rug
    bsdf.inputs['Metallic'].default_value = met
    if emis:
        bsdf.inputs['Emission Color'].default_value = srgb(emis)
        bsdf.inputs['Emission Strength'].default_value = forca
    else:
        bsdf.inputs['Emission Strength'].default_value = 0.0
    mat.diffuse_color = srgb(emis or cor)
    return mat


# ------------------------------------------------------------------ geometria

Z = Vector((0, 0, 1))


def _matriz(centro, escala=(1, 1, 1), rot=None):
    m = Matrix.Translation(Vector(centro))
    if rot is not None:
        m = m @ (rot.to_matrix().to_4x4() if isinstance(rot, Quaternion) else rot)
    return m @ Matrix.Diagonal((*escala, 1.0))


def _alinhar(p1, p2):
    d = Vector(p2) - Vector(p1)
    comp = d.length
    if comp < 1e-6:
        return Quaternion(), 0.0
    return Z.rotation_difference(d.normalized()), comp


class Construtor:
    """Acumula geometria por material e cria um objeto por material no final."""

    def __init__(self, nome, semente=1):
        self.nome = nome
        self.bms = {}
        self.pontos = {}
        self.rnd = random.Random(semente)

    def _bm(self, mat):
        bm = self.bms.get(mat)
        if bm is None:
            bm = self.bms[mat] = bmesh.new()
        return bm

    # primitivas -------------------------------------------------------------
    def caixa(self, centro, tam, mat, rot_z=0.0):
        rot = Matrix.Rotation(rot_z, 4, 'Z') if rot_z else None
        bmesh.ops.create_cube(self._bm(mat), size=1.0, matrix=_matriz(centro, tam, rot))

    def caixa_entre(self, minimo, maximo, mat):
        mn, mx = Vector(minimo), Vector(maximo)
        self.caixa((mn + mx) / 2, tuple(mx - mn), mat)

    def caixa_chanfrada(self, centro, tam, mat, chanfro=0.08, rot_z=0.0, segmentos=1):
        """Caixa com as arestas chanfradas: as quinas pegam brilho, como numa peça de verdade."""
        bm = self._bm(mat)
        rot = Matrix.Rotation(rot_z, 4, 'Z') if rot_z else None
        r = bmesh.ops.create_cube(bm, size=1.0, matrix=_matriz(centro, tam, rot))
        arestas = list({e for v in r['verts'] for e in v.link_edges})
        ch = min(chanfro, min(tam) * 0.45)
        if ch > 1e-4:
            bmesh.ops.bevel(bm, geom=arestas, offset=ch, segments=segmentos, profile=0.5,
                            affect='EDGES', clamp_overlap=True)

    def caixa_chanfrada_entre(self, minimo, maximo, mat, chanfro=0.08, segmentos=1):
        mn, mx = Vector(minimo), Vector(maximo)
        self.caixa_chanfrada((mn + mx) / 2, tuple(mx - mn), mat, chanfro, segmentos=segmentos)

    def toro(self, centro, raio, raio_tubo, mat, normal=(0, 0, 1), seg=24, seg_tubo=8):
        """Anel (volante de válvula, flange, aro de propulsor)."""
        bm = self._bm(mat)
        q = Z.rotation_difference(Vector(normal).normalized())
        c = Vector(centro)
        aneis = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            anel = []
            for j in range(seg_tubo):
                b = 2 * math.pi * j / seg_tubo
                rr = raio + raio_tubo * math.cos(b)
                anel.append(bm.verts.new(c + q @ Vector((rr * math.cos(a), rr * math.sin(a), raio_tubo * math.sin(b)))))
            aneis.append(anel)
        faces = []
        for i in range(seg):
            a1, a2 = aneis[i], aneis[(i + 1) % seg]
            for j in range(seg_tubo):
                k = (j + 1) % seg_tubo
                faces.append(bm.faces.new((a1[j], a2[j], a2[k], a1[k])))
        bmesh.ops.recalc_face_normals(bm, faces=faces)

    def flange(self, centro, normal, raio, mat, espessura=0.12, parafusos=8, mat_parafuso='aco_escuro'):
        """Flange com parafusos em volta (une trechos de tubo e equipamentos)."""
        n = Vector(normal).normalized()
        c = Vector(centro)
        self.cilindro(c - n * espessura / 2, c + n * espessura / 2, raio, mat, seg=20)
        q = Z.rotation_difference(n)
        for k in range(parafusos):
            a = 2 * math.pi * k / parafusos
            p = c + q @ Vector((math.cos(a) * raio * 0.82, math.sin(a) * raio * 0.82, 0))
            self.cilindro(p - n * (espessura * 0.9), p + n * (espessura * 0.9), raio * 0.07, mat_parafuso, seg=6)

    def propulsor(self, centro, eixo, raio, comprimento, mat='preto_rov', mat_helice='aco_escuro'):
        """Propulsor de ROV: duto aberto com aro, cubo e pás (vistas pelas pontas do duto)."""
        e = Vector(eixo).normalized()
        c = Vector(centro)
        a, b = c - e * comprimento / 2, c + e * comprimento / 2
        self.cilindro(a, b, raio, mat, seg=20, tampas=False)
        self.cilindro(a, b, raio * 0.9, mat, seg=20, tampas=False)
        for p in (a, b):
            self.toro(p, raio * 0.95, raio * 0.07, mat, normal=e, seg=20, seg_tubo=6)
        self.cilindro(c - e * comprimento * 0.3, c + e * comprimento * 0.25, raio * 0.28, mat_helice, seg=12)
        q = Z.rotation_difference(e)
        for k in range(4):
            ang = 2 * math.pi * k / 4
            d = q @ Vector((math.cos(ang), math.sin(ang), 0))
            self.barra(c + d * raio * 0.25, c + d * raio * 0.85, raio * 0.12, mat_helice, esp2=raio * 0.04)

    def barra(self, p1, p2, esp, mat, esp2=None):
        """Perfil quadrado (viga, coluna, corrimão) de p1 a p2."""
        q, comp = _alinhar(p1, p2)
        if comp == 0:
            return
        centro = (Vector(p1) + Vector(p2)) / 2
        bmesh.ops.create_cube(self._bm(mat), size=1.0,
                              matrix=_matriz(centro, (esp, esp2 or esp, comp), q))

    def cilindro(self, p1, p2, raio, mat, seg=12, raio2=None, tampas=True):
        q, comp = _alinhar(p1, p2)
        if comp == 0:
            return
        centro = (Vector(p1) + Vector(p2)) / 2
        bmesh.ops.create_cone(self._bm(mat), cap_ends=tampas, cap_tris=False, segments=seg,
                              radius1=raio, radius2=raio if raio2 is None else raio2,
                              depth=comp, matrix=_matriz(centro, rot=q))

    def esfera(self, centro, raio, mat, seg=12, aneis=8, escala=(1, 1, 1)):
        bmesh.ops.create_uvsphere(self._bm(mat), u_segments=seg, v_segments=aneis, radius=raio,
                                  matrix=_matriz(centro, escala))

    def vaso_horizontal(self, centro, comp, raio, mat, eixo='X', seg=16):
        """Vaso de pressão deitado: cilindro com tampos semiesféricos achatados."""
        c = Vector(centro)
        d = Vector((1, 0, 0)) if eixo == 'X' else Vector((0, 1, 0))
        meio = comp / 2 - raio * 0.5
        self.cilindro(c - d * meio, c + d * meio, raio, mat, seg=seg, tampas=False)
        esc = (0.5, 1, 1) if eixo == 'X' else (1, 0.5, 1)
        for s in (-1, 1):
            self.esfera(c + d * meio * s, raio, mat, seg=seg, aneis=8, escala=esc)

    def vaso_vertical(self, base, altura, raio, mat, seg=16):
        b = Vector(base)
        self.cilindro(b, b + Vector((0, 0, altura - raio * 0.5)), raio, mat, seg=seg)
        self.esfera(b + Vector((0, 0, altura - raio * 0.5)), raio, mat, seg=seg, aneis=6,
                    escala=(1, 1, 0.5))

    def tubo(self, pontos, raio, mat, seg=8):
        pts = [Vector(p) for p in pontos]
        for a, b in zip(pts, pts[1:]):
            self.cilindro(a, b, raio, mat, seg=seg, tampas=False)
        for p in pts[1:-1]:
            self.esfera(p, raio * 1.05, mat, seg=seg, aneis=4)

    def luz(self, centro, mat='luz_sodio', tam=0.5):
        self.caixa(centro, (tam, tam, tam * 0.6), mat)

    def trelica(self, base, topo, largura_base, largura_topo, mat, esp=0.5, passos=8,
                diagonais=True):
        """Torre treliçada de 4 pernas (torre de tocha, guindaste, torre de perfuração)."""
        base, topo = Vector(base), Vector(topo)
        eixo = topo - base
        q, comp = _alinhar(base, topo)
        lado = q @ Vector((1, 0, 0))
        frente = q @ Vector((0, 1, 0))

        def canto(t, i):
            w = (largura_base + (largura_topo - largura_base) * t) / 2
            sx, sy = ((1, 1), (-1, 1), (-1, -1), (1, -1))[i]
            return base + eixo * t + lado * (w * sx) + frente * (w * sy)

        for i in range(4):
            self.barra(canto(0, i), canto(1, i), esp, mat)
        for k in range(passos + 1):
            t = k / passos
            for i in range(4):
                self.barra(canto(t, i), canto(t, (i + 1) % 4), esp * 0.6, mat)
            if diagonais and k < passos:
                t2 = (k + 1) / passos
                for i in range(4):
                    a, b = (canto(t, i), canto(t2, (i + 1) % 4)) if k % 2 == 0 else \
                        (canto(t2, i), canto(t, (i + 1) % 4))
                    self.barra(a, b, esp * 0.45, mat)

    def guarda_corpo(self, pontos, z, mat='amarelo', altura=1.1, passo=2.5):
        pts = [Vector((p[0], p[1], z)) for p in pontos]
        h = Vector((0, 0, altura))
        for a, b in zip(pts, pts[1:]):
            self.barra(a + h, b + h, 0.08, mat)
            self.barra(a + h * 0.5, b + h * 0.5, 0.06, mat)
            n = max(1, int((b - a).length / passo))
            for k in range(n + 1):
                p = a.lerp(b, k / n)
                self.barra(p, p + h, 0.07, mat)

    def escada(self, base, topo, largura, mat='amarelo'):
        base, topo = Vector(base), Vector(topo)
        lado = (topo - base).cross(Z).normalized() * (largura / 2)
        self.barra(base + lado, topo + lado, 0.15, mat)
        self.barra(base - lado, topo - lado, 0.15, mat)
        n = int((topo - base).length / 0.6)
        for k in range(1, n):
            p = base.lerp(topo, k / n)
            self.barra(p - lado, p + lado, 0.08, mat)

    def ponto(self, nome, posicao):
        self.pontos[nome] = Vector(posicao)

    # finalização --------------------------------------------------------------
    def finalizar(self, colecao, angulo=50):
        raiz = bpy.data.objects.new(self.nome, None)
        colecao.objects.link(raiz)
        for nome_mat, bm in self.bms.items():
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
            me = bpy.data.meshes.new(f'{self.nome}_{nome_mat}')
            bm.to_mesh(me)
            bm.free()
            me.materials.append(material(nome_mat))
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(angulo))
            ob = bpy.data.objects.new(f'{self.nome}_{nome_mat}', me)
            colecao.objects.link(ob)
            ob.parent = raiz
        self.bms = {}
        for nome, pos in self.pontos.items():
            e = bpy.data.objects.new(nome, None)
            e.empty_display_size = 3
            e.location = pos
            colecao.objects.link(e)
            e.parent = raiz
        return raiz


def anexar_malha(raiz, nome, me, colecao):
    ob = bpy.data.objects.new(nome, me)
    colecao.objects.link(ob)
    ob.parent = raiz
    return ob


# ------------------------------------------------------------------ cena e exportação

def colecao(nome, limpar=True):
    col = bpy.data.collections.get(nome)
    if col is None:
        col = bpy.data.collections.new(nome)
        bpy.context.scene.collection.children.link(col)
    elif limpar:
        for ob in list(col.all_objects):
            dados = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if isinstance(dados, bpy.types.Mesh) and dados.users == 0:
                bpy.data.meshes.remove(dados)
    return col


def descendentes(ob):
    saida = [ob]
    for filho in ob.children:
        saida += descendentes(filho)
    return saida


def mostrar_so(nome_raiz):
    """Deixa visível só o modelo pedido (todos são gerados na origem e se sobrepõem)."""
    alvo = set(descendentes(bpy.data.objects[nome_raiz]))
    for ob in bpy.context.scene.objects:
        if ob.type in ('MESH', 'EMPTY'):
            ob.hide_set(ob not in alvo)


def exportar(raiz, caminho):
    import contextlib
    import io
    import logging
    bpy.ops.object.select_all(action='DESELECT')
    for ob in descendentes(raiz):
        ob.hide_set(False)
        ob.select_set(True)
    bpy.context.view_layer.objects.active = raiz
    logging.disable(logging.INFO)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        _exportar_gltf(caminho)
    logging.disable(logging.NOTSET)
    bpy.ops.object.select_all(action='DESELECT')


def _exportar_gltf(caminho):
    bpy.ops.export_scene.gltf(
        filepath=caminho, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_materials='EXPORT', export_lights=False, export_cameras=False,
        export_extras=False, export_normals=True, export_texcoords=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12)
    bpy.ops.object.select_all(action='DESELECT')


def contar_triangulos(raiz):
    total = 0
    for ob in descendentes(raiz):
        if ob.type == 'MESH':
            total += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    return total
