"""Modelos 3D da jornada do petróleo, gerados por código no Blender.

Uso (no Blender, pelo MCP ou pelo editor de texto):
    import sys, importlib
    sys.path.insert(0, r'<pasta do projeto>/blender')
    import nucleo, modelos, integracao
    for m in (nucleo, modelos, integracao): importlib.reload(m)
    modelos.gerar('fpso')          # ou gerar() para todos
Cada modelo vai para uma coleção própria e é exportado em site/public/modelos/<nome>.glb.
Depois disso a integração automática fica ligada (integracao.py): edições feitas à mão no
Blender também chegam sozinhas ao site.
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Vector

import nucleo
from nucleo import Construtor, material

PASTA = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(os.path.dirname(PASTA), 'site', 'public', 'modelos')


# ------------------------------------------------------------------ casco de navio

def casco(nome, comp, boca, quilha, conves, proa, raio_popa=5.0, cair_proa=6.0, raio_bojo=3.0,
          aneis=None, mats=('casco', 'casco_linha', 'casco_fundo', 'conves')):
    """Casco por anéis horizontais: corpo paralelo, proa elíptica, popa de espelho arredondada.

    Materiais: casco (costado), casco_linha (faixa da linha d'água), casco_fundo (obras vivas)
    e conves (convés principal).
    """
    xs, xb = -comp / 2, comp / 2
    aneis = aneis or [quilha, quilha + 0.4, quilha + 1.2, quilha + 2.5, quilha + 4.5,
                      (quilha - 0.5) / 2, -0.5, 1.0, conves * 0.5, conves]
    fr_corpo = [0.0, 0.006, 0.018, 0.04, 0.07] + [0.07 + 0.93 * k / 14 for k in range(1, 15)]
    fr_proa = [1 - (1 - k / 16) ** 1.6 for k in range(1, 17)]

    def ponta(z):
        return xb - cair_proa * (conves - z) / (conves - quilha)

    def meia_boca(x, z):
        tip = ponta(z)
        ini = tip - proa
        h = boca / 2
        if x > ini:
            u = min((x - ini) / proa, 1.0)
            p = 2.1 if z > -0.5 else 1.75
            h *= max(1 - u ** p, 0) ** (1 / p)
        if x - xs < raio_popa:
            d = raio_popa - (x - xs)
            h = min(h, boca / 2 - raio_popa + math.sqrt(max(raio_popa ** 2 - d * d, 0)))
        if z < quilha + raio_bojo:
            dz = quilha + raio_bojo - z
            h -= raio_bojo - math.sqrt(max(raio_bojo ** 2 - dz * dz, 0))
        return max(h, 0.05)

    bm = bmesh.new()
    anel_verts = []
    for z in aneis:
        tip = ponta(z)
        ini = tip - proa
        xs_lado = [xs + (ini - xs) * f for f in fr_corpo] + [ini + proa * f for f in fr_proa]
        estibordo = [(x, -meia_boca(x, z)) for x in xs_lado]
        bombordo = [(x, meia_boca(x, z)) for x in reversed(xs_lado[:-1])]
        pts = estibordo[:-1] + [(xs_lado[-1], 0.0)] + bombordo
        anel_verts.append([bm.verts.new((x, y, z)) for x, y in pts])
    n = len(anel_verts[0])
    for a, b in zip(anel_verts, anel_verts[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    fundo = bm.faces.new(list(reversed(anel_verts[0])))
    topo = bm.faces.new(anel_verts[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        zc = f.calc_center_median().z
        f.material_index = 2 if zc < -0.5 else (1 if zc < 1.0 else 0)
    fundo.material_index = 2
    topo.material_index = 3
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(material(m))
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(35))
    return me, meia_boca


# ------------------------------------------------------------------ módulos de processo

def modulo(c, x0, y0, sx, sy, z0, niveis, tipo, rnd, h=7.0, luzes=True, aberto=False, leve=False):
    """Módulo de processo em estrutura metálica com equipamentos conforme o tipo.

    aberto=True deixa o último piso sem teto e sem equipamentos (lugar do separador principal).
    leve=True tira guarda-corpos e escadas e usa menos luminárias (unidades vistas de longe).
    """
    x1, y1 = x0 + sx, y0 + sy
    ztopo = z0 + niveis * h
    # colunas e pisos
    for x in [x0 + sx * k / 3 for k in range(4)]:
        for y in (y0, y1):
            c.barra((x, y, z0 - 4), (x, y, ztopo), 0.7, 'estrutura')
    for i in range(niveis + 1):
        z = z0 + i * h
        if i < niveis or not aberto:
            c.caixa_entre((x0, y0, z - 0.35), (x1, y1, z), 'estrutura_escura')
        for (a, b) in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1)), ((x0, y0), (x0, y1)),
                       ((x1, y0), (x1, y1))):
            c.barra((*a, z), (*b, z), 0.6, 'estrutura')
        if i > 0 and i < niveis:
            # contraventamento em X nas faces longas
            for y in (y0, y1):
                xm = x0 + sx / 2
                c.barra((x0, y, z - h), (xm, y, z), 0.3, 'estrutura')
                c.barra((x1, y, z - h), (xm, y, z), 0.3, 'estrutura')
    if not aberto:
        if not leve:
            c.guarda_corpo([(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], ztopo, passo=3.0)
        # resfriadores no teto: caixas com ventiladores
        if not leve and rnd.random() < 0.55:
            for k in range(2):
                xc = x0 + sx * (0.3 + 0.4 * k)
                c.caixa((xc, y0 + sy / 2, ztopo + 1.4), (sx * 0.32, sy * 0.6, 2.8), 'estrutura_escura')
                for j in range(3):
                    yc = y0 + sy * (0.3 + 0.2 * j)
                    c.cilindro((xc, yc, ztopo + 2.8), (xc, yc, ztopo + 3.3), 1.5, 'tubo', seg=16)
    # escada externa
    for i in range(0 if leve else niveis):
        z = z0 + i * h
        xa = x0 + 1.5 if i % 2 == 0 else x0 + 8.5
        xb = x0 + 8.5 if i % 2 == 0 else x0 + 1.5
        c.escada((xa, y0 - 1.2, z), (xb, y0 - 1.2, z + h), 1.0)

    seg = 10 if leve else 16  # unidades vistas de longe: cilindros com menos faces

    def vasos_horizontais(z, n=2, raio=1.8):
        for k in range(n):
            yc = y0 + sy * (k + 1) / (n + 1)
            comp = sx * rnd.uniform(0.55, 0.75)
            xc = x0 + sx / 2 + rnd.uniform(-1.5, 1.5)
            for xs_ in (xc - comp * 0.3, xc + comp * 0.3):
                c.caixa((xs_, yc, z + 0.6), (0.8, raio * 1.6, 1.2), 'estrutura_escura')
            c.vaso_horizontal((xc, yc, z + 1.2 + raio), comp, raio, 'vaso', seg=seg)

    def colunas(z, n=2):
        for k in range(n):
            xc = x0 + sx * (k + 1) / (n + 1) + rnd.uniform(-1, 1)
            yc = y0 + sy * rnd.uniform(0.3, 0.7)
            r = rnd.uniform(1.2, 2.0)
            c.vaso_vertical((xc, yc, z), ztopo - z + rnd.uniform(4, 12), r, 'vaso', seg=seg)
            for zz in range(int(z) + 6, int(ztopo + 6), 12 if leve else 6):
                c.cilindro((xc, yc, zz), (xc, yc, zz + 0.4), r + 0.6, 'estrutura', seg=12)

    def skids(z, n=2, mat='estrutura_escura'):
        for k in range(n):
            xc = x0 + sx * (k + 1) / (n + 1)
            yc = y0 + sy * rnd.uniform(0.35, 0.65)
            c.caixa((xc, yc, z + 1.6), (sx / (n + 1) * 0.8, sy * 0.35, 3.2), mat)
            c.vaso_vertical((xc + 2, yc + sy * 0.25, z), 6, 1.0, 'vaso', seg=seg)

    def turbinas(z):
        for k in range(2):
            yc = y0 + sy * (0.28 + 0.44 * k)
            c.caixa((x0 + sx / 2, yc, z + 3), (sx * 0.7, 5, 6), 'branco')
            c.cilindro((x0 + sx * 0.8, yc, z + 6), (x0 + sx * 0.8, yc, ztopo + 10), 1.3,
                       'estrutura_escura', seg=12)

    def tanques(z):
        for k in range(3):
            c.vaso_vertical((x0 + sx * (k + 1) / 4, y0 + sy * 0.5, z), 5, 2.2, 'tanque', seg=seg)

    def bombas(z):
        """Bombas com motor elétrico azul sobre a base, perto das bordas do piso, e um armário vermelho
        do sistema de incêndio."""
        for k in range(2):
            xc = x0 + sx * (0.25 + 0.5 * k)
            yc = y0 + (1.7 if k == 0 else sy - 1.7)
            c.caixa((xc, yc, z + 0.15), (3.0, 1.3, 0.3), 'estrutura_escura')
            c.cilindro((xc - 1.25, yc, z + 0.85), (xc + 0.1, yc, z + 0.85), 0.5, 'azul_eq', seg=12)
            c.cilindro((xc + 0.1, yc, z + 0.85), (xc + 1.2, yc, z + 0.85), 0.42, 'aco_escuro', seg=12)
            c.cilindro((xc + 0.95, yc, z + 1.2), (xc + 0.95, yc, z + 2.8), 0.18, 'tubo', seg=8)
        c.caixa((x0 + 1.4, y0 + sy - 0.9, z + 1.1), (1.3, 0.8, 2.2), 'tubo_vermelho')

    tipos = {
        'separacao': lambda z, i: vasos_horizontais(z, 2, 2.0),
        'oleo': lambda z, i: vasos_horizontais(z, 2, 1.6) if i % 2 == 0 else skids(z, 2),
        'compressao': lambda z, i: skids(z, 3) if i < niveis - 1 else colunas(z, 2),
        'gas': lambda z, i: colunas(z, 3) if i == 0 else skids(z, 2, 'vaso'),
        'geracao': lambda z, i: turbinas(z) if i == niveis - 1 else skids(z, 2),
        'utilidades': lambda z, i: tanques(z) if i % 2 == 0 else skids(z, 2),
        'agua': lambda z, i: colunas(z, 2) if i == 0 else vasos_horizontais(z, 2, 1.4),
        'chegada': lambda z, i: vasos_horizontais(z, 3, 1.1),
    }
    for i in range(niveis):
        if aberto and i == niveis - 1:
            break  # o último piso fica livre para o separador principal
        tipos[tipo](z0 + i * h, i)
        if not leve:
            bombas(z0 + i * h)
    # tubulações (as primeiras com válvula de volante amarelo)
    mats = ['tubo', 'tubo', 'tubo_verde', 'vaso', 'tubo_vermelho', 'amarelo']
    for k in range(3 if leve else 9):
        z = z0 + rnd.randrange(niveis) * h + rnd.uniform(4.5, 6.2)
        ya = y0 + rnd.uniform(1, sy - 1)
        yb = y0 + rnd.uniform(1, sy - 1)
        xa = x0 - 1
        xb_ = x1 + 1
        r = rnd.choice([0.15, 0.2, 0.3, 0.4, 0.5])
        m = rnd.choice(mats)
        xm = rnd.uniform(x0 + 3, x1 - 3)
        c.tubo([(xa, ya, z), (xm, ya, z), (xm, yb, z), (xb_, yb, z)], r, m, seg=8)
        if not leve and k < 3:
            xv = (xa + xm) / 2
            c.cilindro((xv - r * 1.6, ya, z), (xv + r * 1.6, ya, z), r * 1.45, 'aco_escuro', seg=10)
            c.cilindro((xv, ya, z), (xv, ya, z + r + 0.7), 0.06, 'aco', seg=6)
            c.toro((xv, ya, z + r + 0.75), 0.35, 0.04, 'amarelo', seg=12, seg_tubo=4)
    # luzes nas bordas de cada piso
    if luzes:
        # luminárias presas sob cada piso, perto das bordas
        for i in range(niveis + 1):
            if aberto and i == niveis:
                continue
            z = z0 + i * h - 0.62
            for k in range(3 if leve else 5):
                x = x0 + sx * (k + 0.5) / (3 if leve else 5)
                for y in (y0 + 0.6, y1 - 0.6):
                    c.luz((x, y, z), 'luz_branca' if rnd.random() < 0.3 else 'luz_sodio', 0.4)
    return ztopo


def separador(col, centro, comp=18.0, raio=2.4):
    """Separador trifásico principal: casco próprio e volumes internos (gás, óleo, água)."""
    s = Construtor('separador', semente=3)
    cx, cy, cz = centro
    s.vaso_horizontal((cx, cy, cz), comp, raio, 'separador_casco', seg=32)
    for xs_ in (cx - comp * 0.3, cx + comp * 0.3):
        s.caixa((xs_, cy, cz - raio - 0.5), (0.9, raio * 1.7, 1.6), 'estrutura_escura')
    s.cilindro((cx - comp * 0.42, cy, cz + raio - 0.2), (cx - comp * 0.42, cy, cz + raio + 2.2),
               0.45, 'separador_casco', seg=12)
    s.cilindro((cx + comp * 0.35, cy, cz + raio - 0.2), (cx + comp * 0.35, cy, cz + raio + 1.6),
               0.35, 'separador_casco', seg=12)
    s.cilindro((cx + comp * 0.2, cy, cz - raio + 0.2), (cx + comp * 0.2, cy, cz - raio - 1.6),
               0.3, 'separador_casco', seg=12)
    s.cilindro((cx + comp * 0.42, cy, cz - raio * 0.4), (cx + comp * 0.42, cy, cz - raio - 1.6),
               0.3, 'separador_casco', seg=12)
    s.ponto('ponto_separador', centro)
    raiz = s.finalizar(col)

    # volumes internos por faixas de altura: água (fundo), óleo (meio), gás (topo)
    ri = raio * 0.96
    # nível de líquido ~60%: água no fundo, óleo por cima dela, gás no espaço de cima
    faixas = [('sep_agua', -ri, -ri + 1.3), ('sep_oleo', -ri + 1.3, -ri + 3.2),
              ('sep_gas', -ri + 3.2, ri)]
    comp_int = comp - raio * 1.05  # termina onde começam os tampos
    for nome_mat, z_lo, z_hi in faixas:
        bm = bmesh.new()
        sec = _secao_circular(ri, z_lo, z_hi, 28)
        ext = []
        for xx in (cx - comp_int / 2, cx + comp_int / 2):
            ext.append([bm.verts.new((xx, cy + y, cz + z)) for y, z in sec])
        n = len(sec)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ext[0][i], ext[0][j], ext[1][j], ext[1][i]))
        bm.faces.new(list(reversed(ext[0])))
        bm.faces.new(ext[1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(nome_mat)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(material(nome_mat))
        nucleo.anexar_malha(raiz, nome_mat, me, col)
    # chicana de entrada e vertedouro (placas internas)
    p = Construtor('separador_internos', semente=4)
    p.caixa((cx - comp_int * 0.36, cy, cz), (0.15, ri * 1.6, ri * 1.6), 'estrutura')
    p.caixa((cx + comp_int * 0.28, cy, cz - ri + 1.5), (0.15, ri * 1.7, 3.0), 'estrutura')
    internos = p.finalizar(col)
    internos.parent = raiz
    return raiz


def _secao_circular(r, z_lo, z_hi, n):
    """Polígono (y, z) da parte do círculo de raio r entre as alturas z_lo e z_hi."""
    def ang(z):
        return math.asin(max(-1.0, min(1.0, z / r)))
    a_lo, a_hi = ang(z_lo), ang(z_hi)
    direita = [(r * math.cos(a_lo + (a_hi - a_lo) * k / n), r * math.sin(a_lo + (a_hi - a_lo) * k / n))
               for k in range(n + 1)]
    esquerda = [(-y, z) for y, z in reversed(direita)]
    pts = direita + esquerda
    limpos = []
    for p in pts:
        if not limpos or (abs(p[0] - limpos[-1][0]) > 1e-4 or abs(p[1] - limpos[-1][1]) > 1e-4):
            limpos.append(p)
    if abs(limpos[0][0] - limpos[-1][0]) < 1e-4 and abs(limpos[0][1] - limpos[-1][1]) < 1e-4:
        limpos.pop()
    return limpos


# ------------------------------------------------------------------ peças reutilizáveis

def heliponto(t, hx, hy, hz, raio):
    """Heliponto octogonal com círculo amarelo, H branco e luzes verdes no perímetro."""
    t.cilindro((hx, hy, hz - 0.5), (hx, hy, hz), raio, 'heliponto', seg=8)
    r1 = raio * 0.56
    t.cilindro((hx, hy, hz), (hx, hy, hz + 0.05), r1, 'marca_amarela', seg=32)
    t.cilindro((hx, hy, hz), (hx, hy, hz + 0.08), r1 * 0.9, 'heliponto', seg=32)
    k = raio / 13.5
    for (cx, cy, sx, sy) in ((-1.6, 0, 0.8, 5.2), (1.6, 0, 0.8, 5.2), (0, 0, 2.4, 0.8)):
        t.caixa((hx + cx * k, hy + cy * k, hz + 0.1), (sx * k, sy * k, 0.06), 'marca_branca')
    for i in range(16):
        a = 2 * math.pi * i / 16
        t.luz((hx + (raio - 0.1) * math.cos(a), hy + (raio - 0.1) * math.sin(a), hz + 0.3), 'luz_verde', 0.4)


def guindaste(t, gx, gy, z, ang, comp=34.0, alt_pedestal=22.0):
    """Guindaste de pedestal com cabine e lança treliçada amarela."""
    p0 = Vector((gx, gy, z))
    t.cilindro(p0, p0 + Vector((0, 0, alt_pedestal)), 1.9, 'amarelo', seg=16)
    topo = p0 + Vector((0, 0, alt_pedestal + 2))
    t.caixa(topo, (6.5, 4.2, 4.2), 'amarelo', rot_z=ang)
    d = Vector((math.cos(ang), math.sin(ang), 0))
    pb = topo + d * 2
    pt = pb + d * comp + Vector((0, 0, comp * 0.76))
    t.trelica(pb, pt, 2.4, 1.0, 'amarelo', esp=0.3, passos=10)
    t.cilindro(pt, pt - Vector((0, 0, comp * 0.85)), 0.06, 'borracha', seg=4)
    t.luz(pt + Vector((0, 0, 0.6)), 'luz_vermelha', 0.5)


def bloco_acomodacao(t, x0, x1, ya, z0, decks, rnd, frente=1, altura_deck=3.2, mat='branco'):
    """Bloco de acomodações com janelas (acesas ou não) na face de proa e nas laterais."""
    zt = z0 + decks * altura_deck
    t.caixa_entre((x0, -ya, z0), (x1, ya, zt), mat)
    xf = x1 if frente > 0 else x0
    for d in range(decks):
        z = z0 + d * altura_deck + altura_deck * 0.55
        for k in range(int(2 * ya / 2.4)):
            y = -ya + 1.2 + k * 2.4
            t.caixa((xf + 0.08 * frente, y, z), (0.2, 1.4, 1.0), 'janela' if rnd.random() < 0.6 else 'janela_apagada')
        for k in range(int((x1 - x0 - 2) / 2.6)):
            x = x0 + 1.6 + 2.6 * k
            for lado in (-1, 1):
                t.caixa((x, lado * (ya + 0.08), z), (1.4, 0.2, 1.0),
                        'janela' if rnd.random() < 0.5 else 'janela_apagada')
    return zt


def bordas_do_conves(t, meia_boca, conves, x0, x1, passo_luz=16):
    for lado in (-1, 1):
        pts = [(x, lado * (meia_boca(x, conves) - 0.5)) for x in range(int(x0), int(x1), 6)]
        t.guarda_corpo(pts, conves, passo=4.0)
        for x in range(int(x0) + 6, int(x1) - 6, passo_luz):
            y = lado * (meia_boca(x, conves) - 0.4)
            t.barra((x, y, conves), (x, y, conves + 3.5), 0.15, 'estrutura')
            t.luz((x, y, conves + 3.8), 'luz_sodio', 0.5)


# ------------------------------------------------------------------ FPSO

def fpso():
    col = nucleo.colecao('FPSO')
    comp, boca, quilha, conves = 300.0, 58.0, -18.0, 12.0
    me, meia_boca = casco('fpso_casco', comp, boca, quilha, conves, proa=50.0, raio_popa=7.0,
                          cair_proa=4.0, raio_bojo=3.2)
    c = Construtor('fpso', semente=11)
    raiz = c.finalizar(col)  # raiz vazia; a geometria vem nos construtores abaixo
    nucleo.anexar_malha(raiz, 'fpso_casco', me, col)
    rnd = random.Random(21)
    t = Construtor('fpso_topside', semente=12)

    # amurada e guarda-corpo do convés
    xs_borda = [-148 + 6 * k for k in range(50)]
    for lado in (-1, 1):
        pts = [(x, lado * (meia_boca(x, conves) - 0.6)) for x in xs_borda if x < 150]
        t.guarda_corpo(pts, conves, mat='amarelo', passo=4.0)
        for x in range(-140, 140, 14):
            y = lado * (meia_boca(x, conves) - 0.4)
            t.barra((x, y, conves), (x, y, conves + 4.0), 0.15, 'estrutura')
            t.luz((x, y, conves + 4.3), 'luz_sodio', 0.5)

    # pipe rack central
    for x in range(-104, 112, 12):
        for y in (-3.6, 3.6):
            t.barra((x, y, conves), (x, y, conves + 8), 0.6, 'estrutura')
        for z in (conves + 4, conves + 8):
            t.barra((x, -3.6, z), (x, 3.6, z), 0.5, 'estrutura')
    for k, (y, z, r, m) in enumerate([(-2.6, 16.6, 0.45, 'tubo'), (-1.3, 16.6, 0.3, 'tubo_verde'),
                                      (0.0, 16.6, 0.55, 'tubo'), (1.4, 16.6, 0.35, 'vaso'),
                                      (2.7, 16.6, 0.25, 'tubo_vermelho'), (-2.2, 20.5, 0.6, 'tubo'),
                                      (-0.4, 20.5, 0.4, 'amarelo'), (1.6, 20.5, 0.5, 'tubo')]):
        t.cilindro((-104, y, z), (110, y, z), r, m, seg=10, tampas=False)
    t.caixa((3, 0, conves + 8.6), (214, 2.0, 0.25), 'estrutura_escura')  # bandeja de cabos

    # módulos de processo (bombordo +Y, estibordo -Y)
    layout_bb = ['chegada', 'separacao', 'oleo', 'oleo', 'separacao', 'agua', 'agua', 'utilidades']
    layout_be = ['geracao', 'geracao', 'compressao', 'compressao', 'gas', 'gas', 'compressao',
                 'utilidades']
    z0 = conves + 4.0
    sep_centro = None
    for k in range(8):
        x0 = -98 + k * 26
        niv_bb = 3 if k in (1, 2, 4, 5) else 2
        niv_be = 3 if k in (2, 3, 4, 5) else 2
        ztop = modulo(t, x0, 5.5, 23.0, 21.0, z0, niv_bb, layout_bb[k], rnd, aberto=(k == 4))
        modulo(t, x0, -26.5, 23.0, 21.0, z0, niv_be, layout_be[k], rnd)
        if k == 4:
            sep_centro = (x0 + 11.5, 16.0, ztop - 7.0 + 0.35 + 1.4 + 2.4)
    separador(col, sep_centro).parent = raiz

    # torre da tocha (proa), inclinada para fora do navio
    base, topo = Vector((128, 0, conves)), Vector((146, 0, conves + 104))
    t.trelica(base, topo, 9.0, 2.6, 'estrutura', esp=0.55, passos=14)
    t.cilindro(topo, topo + Vector((1.5, 0, 6)), 0.9, 'estrutura_escura', seg=12)
    t.cilindro(topo + Vector((1.5, 0, 6)), topo + Vector((1.8, 0, 7.5)), 1.3, 'estrutura_escura',
               seg=12)
    t.ponto('ponto_tocha', topo + Vector((1.9, 0, 8.5)))
    t.tubo([(100, 0, conves + 8), (124, 0, conves + 8), (128, 0, conves + 2)], 0.7, 'tubo')
    for f in (0.35, 0.7, 1.0):
        p = base.lerp(topo, f)
        t.luz(p + Vector((0, 0, 0.8)), 'luz_vermelha', 0.7)

    # acomodações, passadiço e heliponto (popa)
    xa0, xa1, ya = -146.0, -114.0, 21.0
    t.caixa_entre((xa0, -ya, conves), (xa1, ya, conves + 26), 'superestrutura')
    t.caixa_entre((xa0 + 4, -ya + 4, conves + 26), (xa1 - 2, ya - 4, conves + 30), 'superestrutura')
    t.caixa_entre((xa1 - 1, -ya - 3, conves + 24), (xa1 + 0.5, ya + 3, conves + 25.2), 'superestrutura')
    for d in range(1, 6):  # varandas entre os andares
        t.caixa_entre((xa1, -ya, conves + d * 4.1 + 0.6), (xa1 + 1.4, ya, conves + d * 4.1 + 0.85), 'superestrutura')
    for d in range(6):
        z = conves + 1.6 + d * 4.1
        for y in [-ya + 1.6 + 2.6 * k for k in range(int(2 * ya / 2.6))]:
            m = 'janela' if rnd.random() < 0.62 else 'janela_apagada'
            t.caixa((xa1 + 0.08, y, z + 1.2), (0.2, 1.5, 1.1), m)
        for x in [xa0 + 2 + 2.8 * k for k in range(11)]:
            for lado in (-1, 1):
                m = 'janela' if rnd.random() < 0.5 else 'janela_apagada'
                t.caixa((x, lado * (ya + 0.08), z + 1.2), (1.5, 0.2, 1.1), m)
    for y in [-ya + 6 + 2.4 * k for k in range(12)]:
        t.caixa((xa1 - 1.9, y, conves + 28), (0.2, 1.8, 1.6), 'janela')
    # heliponto
    hz, hx = conves + 34.0, -136.0
    for (a, b) in (((xa0 + 3, -10), (hx, -6)), ((xa0 + 3, 10), (hx, 6)), ((xa1 - 6, -10), (hx, -4)),
                   ((xa1 - 6, 10), (hx, 4))):
        t.barra((*a, conves + 30), (*b, hz - 0.5), 0.6, 'estrutura')
    t.cilindro((hx, 0, hz - 0.5), (hx, 0, hz), 13.5, 'heliponto', seg=8)
    t.cilindro((hx, 0, hz), (hx, 0, hz + 0.05), 7.6, 'marca_amarela', seg=32)
    t.cilindro((hx, 0, hz), (hx, 0, hz + 0.08), 6.8, 'heliponto', seg=32)
    for (cxh, cyh, sxh, syh) in ((-1.6, 0, 0.8, 5.2), (1.6, 0, 0.8, 5.2), (0, 0, 2.4, 0.8)):
        t.caixa((hx + cxh, cyh, hz + 0.1), (sxh, syh, 0.06), 'marca_branca')
    for k in range(16):
        a = 2 * math.pi * k / 16
        t.luz((hx + 13.4 * math.cos(a), 13.4 * math.sin(a), hz + 0.3), 'luz_verde', 0.4)
    t.cilindro((xa1 - 10, 0, conves + 30), (xa1 - 10, 0, conves + 52), 0.35, 'estrutura', seg=8)
    t.luz((xa1 - 10, 0, conves + 52.6), 'luz_vermelha', 0.8)
    for lado, m in ((1, 'luz_vermelha'), (-1, 'luz_verde')):
        t.luz((xa1, lado * (ya + 3), conves + 25.8), m, 0.6)
    # baleeiras
    for x in (-140, -128):
        for lado in (-1, 1):
            t.esfera((x, lado * (ya + 2.6), conves + 10), 1.6, 'laranja', seg=12, aneis=8,
                     escala=(3.6, 1.0, 1.0))
            t.barra((x - 4, lado * (ya + 0.2), conves + 13), (x - 4, lado * (ya + 2.6), conves + 13),
                    0.4, 'estrutura')
            t.barra((x + 4, lado * (ya + 0.2), conves + 13), (x + 4, lado * (ya + 2.6), conves + 13),
                    0.4, 'estrutura')

    # guindastes
    for (gx, gy, ang) in ((-36, 25.0, math.radians(200)), (58, -25.0, math.radians(25)),
                          (110, 22.0, math.radians(150))):
        p0 = Vector((gx, gy, conves))
        t.cilindro(p0, p0 + Vector((0, 0, 22)), 1.9, 'amarelo', seg=16)
        t.caixa(p0 + Vector((0, 0, 24)), (6.5, 4.2, 4.2), 'amarelo', rot_z=ang)
        d = Vector((math.cos(ang), math.sin(ang), 0))
        pb = p0 + Vector((0, 0, 24)) + d * 2
        pt = pb + d * 34 + Vector((0, 0, 26))
        t.trelica(pb, pt, 2.4, 1.0, 'amarelo', esp=0.3, passos=10)
        t.cilindro(pt, pt - Vector((0, 0, 30)), 0.06, 'borracha', seg=4)
        t.luz(pt + Vector((0, 0, 0.6)), 'luz_vermelha', 0.5)

    # balcão de risers (bombordo, meia-nau)
    yb = meia_boca(0, conves)
    t.caixa_entre((-64, yb, 7.5), (40, yb + 4.5, 8.6), 'estrutura')
    t.caixa_entre((-64, yb, 2.0), (40, yb + 1.0, 8.6), 'estrutura_escura')
    for i, x in enumerate(range(-60, 40, 5)):
        t.barra((x, yb, 1.0), (x, yb + 4.5, 7.6), 0.5, 'estrutura')
        t.cilindro((x + 2.5, yb + 3.0, 9.6), (x + 2.5, yb + 3.0, -1.0), 0.45, 'estrutura_escura',
                   seg=10)
        t.ponto(f'ponto_riser_{i:02d}', (x + 2.5, yb + 3.0, -1.0))
    for x in range(-60, 40, 10):
        t.luz((x, yb + 4.6, 9.4), 'luz_sodio', 0.5)

    # amarras (ancoragem distribuída): saídas nos quatro cantos
    for nome_p, (x, lado) in (('ponto_amarra_proa_bb', (135, 1)), ('ponto_amarra_proa_be', (135, -1)),
                              ('ponto_amarra_popa_bb', (-138, 1)), ('ponto_amarra_popa_be', (-138, -1))):
        y = lado * (meia_boca(x, 0) + 0.2)
        t.caixa((x, y, conves - 2), (6, 1.6, 3), 'estrutura_escura')
        t.ponto(nome_p, (x, y, -1.0))

    # estação de transferência (popa): carretel do mangote
    t.cilindro((-149, -5, conves + 5), (-149, 5, conves + 5), 3.2, 'estrutura_escura', seg=16)
    t.cilindro((-149, -4, conves + 5), (-149, 4, conves + 5), 3.6, 'borracha', seg=16)
    t.ponto('ponto_mangote', (-152.5, 0, conves - 2))

    t.finalizar(col).parent = raiz
    return raiz


# ------------------------------------------------------------------ navios

def navio_sonda():
    """Navio-sonda: torre de perfuração a meia-nau, racks de tubos, acomodações e heliponto na proa."""
    col = nucleo.colecao('NAVIO_SONDA')
    comp, boca, quilha, conves = 228.0, 42.0, -12.0, 8.0
    me, mb = casco('sonda_casco', comp, boca, quilha, conves, proa=46.0, raio_popa=5.0, cair_proa=8.0,
                   raio_bojo=2.5, mats=('casco_sonda', 'casco_linha', 'casco_fundo', 'conves'))
    raiz = Construtor('navio_sonda').finalizar(col)
    nucleo.anexar_malha(raiz, 'sonda_casco', me, col)
    rnd = random.Random(31)
    t = Construtor('sonda_topside', semente=32)
    bordas_do_conves(t, mb, conves, -112, 112)

    # subestrutura e piso de perfuração
    piso = conves + 14
    for x in (-14, 14):
        for y in (-12, 12):
            t.barra((x, y, conves), (x, y, piso), 1.4, 'estrutura')
    t.caixa_entre((-16, -14, piso - 1.2), (16, 14, piso), 'estrutura_escura')
    t.guarda_corpo([(-16, -14), (16, -14), (16, 14), (-16, 14), (-16, -14)], piso, passo=3.0)
    # torre (derrick) com luzes nas quinas
    base, topo = Vector((0, 0, piso)), Vector((0, 0, piso + 62))
    t.trelica(base, topo, 16, 5, 'branco', esp=0.7, passos=12)
    t.caixa(topo + Vector((0, 0, 2.5)), (7, 7, 5), 'branco')
    for k in range(13):
        f = k / 12
        p = base.lerp(topo, f)
        w = (16 + (5 - 16) * f) / 2
        for sx, sy in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
            t.luz(p + Vector((sx * w, sy * w, 0)), 'luz_branca', 0.45)
    t.luz(topo + Vector((0, 0, 5.6)), 'luz_vermelha', 0.9)
    t.cilindro((0, 0, piso), (0, 0, piso + 40), 0.3, 'tubo', seg=8)
    t.caixa((0, 0, piso + 40), (2.5, 2.5, 3), 'amarelo')
    for (x, y) in ((-6, -6), (6, -6), (-6, 6), (6, 6)):
        t.cilindro((x, y, conves), (x, y, conves + 10), 0.8, 'estrutura_escura', seg=10)
    t.ponto('ponto_moonpool', (0, 0, quilha))
    # racks de tubos de perfuração (cinza e verde) e de juntas de riser (amarelas, mais grossas)
    for xc in (-52, -30, 32, 54):
        riser = xc in (-30, 32)
        t.caixa_entre((xc - 10, -15, conves), (xc + 10, 15, conves + 0.6), 'estrutura_escura')
        for lado in (-1, 1):
            for k in range(3):
                t.barra((xc - 10 + k * 10, lado * 15, conves), (xc - 10 + k * 10, lado * 15, conves + 5.5), 0.4,
                        'amarelo')
        if riser:
            for i in range(5):
                for j in range(3):
                    y, z = -12 + i * 6.0, conves + 1.4 + j * 1.25
                    t.cilindro((xc - 9.5, y, z), (xc + 9.5, y, z), 0.6, 'amarelo', seg=10)
            continue
        for i in range(10):
            for j in range(4):
                y, z = -13 + i * 2.9, conves + 0.9 + j * 0.62
                t.cilindro((xc - 9.5, y, z), (xc + 9.5, y, z), 0.3, 'tubo' if (i + j) % 3 else 'tubo_verde', seg=6)
    # casa do sondador (doghouse) no piso de perfuração e bloco de coroamento amarelo no topo
    t.caixa_chanfrada_entre((15, -13.5, piso), (25, -6, piso + 4.5), 'superestrutura', chanfro=0.25)
    for y in (-12, -10, -8):
        t.caixa((15.0, y, piso + 2.8), (0.2, 1.4, 1.2), 'janela')
    t.caixa_chanfrada(topo + Vector((0, 0, 6.0)), (4.5, 4.5, 2.0), 'amarelo', chanfro=0.2)
    # acomodações (com botes salva-vidas e mastro de radar) e heliponto na proa
    zt = bloco_acomodacao(t, 72, 98, 17, conves, 6, rnd, frente=1, mat='superestrutura')
    t.caixa_entre((78, -11, zt), (96, 11, zt + 3.4), 'superestrutura')
    for y in [-10 + 2.2 * k for k in range(10)]:
        t.caixa((96.1, y, zt + 1.8), (0.2, 1.6, 1.3), 'janela')
    mastro_radar(t, 84, zt + 3.4, altura=8, largura=3.5)
    for x in (76, 86):
        for lado in (-1, 1):
            t.esfera((x, lado * 19.2, conves + 9.5), 1.3, 'laranja', seg=12, aneis=8, escala=(3.2, 1.0, 0.9))
            t.barra((x - 3, lado * 17, conves + 12), (x - 3, lado * 19.6, conves + 12), 0.35, 'estrutura')
            t.barra((x + 3, lado * 17, conves + 12), (x + 3, lado * 19.6, conves + 12), 0.35, 'estrutura')
    hx, hz = 106.0, zt + 4.0
    for s in (-1, 1):
        t.barra((96, s * 8, zt), (hx, s * 6, hz - 0.5), 0.6, 'estrutura')
    heliponto(t, hx, 0, hz, 11.0)
    guindaste(t, -75, -16, conves, math.radians(40), comp=26, alt_pedestal=14)
    guindaste(t, 40, 16, conves, math.radians(210), comp=26, alt_pedestal=14)
    for y in (-6, 6):
        t.cilindro((-100, y, conves), (-100, y, conves + 22), 1.6, 'chamine', seg=12)
        t.cilindro((-100, y, conves + 18), (-100, y, conves + 20), 1.7, 'faixa', seg=12)
    t.finalizar(col).parent = raiz
    return raiz


def piso_contorno(t, mb, x0, x1, z0, z1, mat, passo=3.0, recuo=0.4):
    """Piso elevado que acompanha o contorno do casco (castelo de proa, tombadilho)."""
    x = x0
    while x < x1 - 1e-6:
        xb = min(x + passo, x1)
        w = max(mb(xb, z1) - recuo, 0.3)  # a ponta de vante é a mais estreita: fica dentro do casco
        t.caixa_entre((x, -w, z0), (xb, w, z1), mat)
        x = xb


def mastro_radar(t, x, z, altura=9.0, largura=4.0):
    """Mastro de radar em tripé com travessa, antenas de radar e luzes de navegação."""
    topo = Vector((x, 0, z + altura))
    for s in (-1, 1):
        t.cilindro((x - 1.2, s * largura / 2, z), topo + Vector((0, s * 0.3, 0)), 0.18, 'superestrutura', seg=8)
    t.cilindro((x + 1.6, 0, z), topo, 0.18, 'superestrutura', seg=8)
    t.caixa(topo + Vector((0, 0, -2.2)), (0.6, largura + 1.5, 0.35), 'superestrutura')
    for k, (dz, comp_antena) in enumerate(((-1.6, 6.0), (0.6, 4.0))):
        t.caixa(topo + Vector((0.3 * k, 0, dz)), (0.35, comp_antena, 0.25), 'aco_escuro')
    t.cilindro(topo, topo + Vector((0, 0, 2.5)), 0.1, 'aco', seg=6)
    t.luz(topo + Vector((0, 0, 2.7)), 'luz_branca', 0.5)


def baleeira_queda_livre(t, x, z, comp=10.0):
    """Baleeira de queda livre na rampa inclinada da popa (laranja, casco fechado)."""
    ang = math.radians(32)
    d = Vector((-math.cos(ang), 0, -math.sin(ang)))  # desce para a popa
    c = Vector((x, 0, z))
    for s in (-1, 1):
        t.barra(c + Vector((0, s * 1.6, 0)) - d * comp * 0.55, c + Vector((0, s * 1.6, 0)) + d * comp * 0.55,
                0.35, 'superestrutura')
    corpo = c + Vector((0, 0, 1.3))
    for k in range(5):
        f = (k - 2) / 2
        p = corpo - d * f * comp * 0.38
        r = 1.45 * (1 - 0.22 * f * f)
        t.esfera(p, r, 'laranja', seg=12, aneis=8)
    t.caixa_chanfrada(corpo + Vector((0, 0, 1.0)), (comp * 0.45, 1.6, 0.8), 'laranja', chanfro=0.2)


def aliviador():
    """Navio aliviador (shuttle tanker): superestrutura com passadiço na popa, convés com dutos,
    passarela, coletor de carga, respiros dos tanques, guinchos e a proa de carregamento (onde se
    conecta o mangote vindo da FPSO)."""
    col = nucleo.colecao('ALIVIADOR')
    comp, boca, quilha, conves = 276.0, 46.0, -15.0, 9.0
    me, mb = casco('aliviador_casco', comp, boca, quilha, conves, proa=52.0, raio_popa=6.0, cair_proa=7.0,
                   raio_bojo=2.8, mats=('casco_aliviador', 'casco_linha', 'casco_fundo', 'verde_conves'))
    raiz = Construtor('aliviador').finalizar(col)
    nucleo.anexar_malha(raiz, 'aliviador_casco', me, col)
    rnd = random.Random(41)
    t = Construtor('aliviador_topside', semente=42)
    bordas_do_conves(t, mb, conves, -136, 104, passo_luz=22)

    # castelo de proa elevado, com amurada, guinchos de amarração e a casa do carregamento pela proa
    zc = conves + 2.8
    piso_contorno(t, mb, 104, 133, conves, zc, 'casco_aliviador')
    for lado in (-1, 1):
        pts = [(x, lado * (mb(x, zc) - 0.6)) for x in range(104, 132, 3)]
        t.guarda_corpo(pts, zc, mat='amarelo', passo=3.0)
    for lado in (-1, 1):
        y = lado * 7.5
        t.cilindro((112, y - 1.6, zc + 1.4), (112, y + 1.6, zc + 1.4), 1.2, 'vermelho_conves', seg=16)
        t.caixa_chanfrada((112, y, zc + 0.5), (3.4, 4.2, 1.0), 'estrutura_escura', chanfro=0.15)
        t.cilindro((118, y, zc), (118, y, zc + 1.2), 0.45, 'estrutura_escura', seg=10)  # cabeço
    t.caixa_chanfrada_entre((121, -5.5, zc), (130, 5.5, zc + 6.5), 'superestrutura', chanfro=0.25)
    t.caixa_entre((129.9, -2.2, zc + 0.6), (130.2, 2.2, zc + 4.2), 'preto_rov')  # porta do mangote
    t.cilindro((124, -3.5, zc + 6.5), (124, 3.5, zc + 6.5), 1.5, 'laranja_rov', seg=16)  # carretel
    t.cilindro((126, 0, zc + 6.5), (126, 0, zc + 17), 0.35, 'estrutura', seg=8)
    t.luz((126, 0, zc + 17.4), 'luz_branca', 0.6)
    t.luz((130.3, 0, zc + 5.0), 'luz_led', 0.5)
    for lado in (-1, 1):  # âncoras no casco
        t.caixa_chanfrada((126, lado * (mb(126, conves - 3) + 0.15), conves - 3.5), (3.0, 0.5, 3.6),
                          'preto_rov', chanfro=0.3)
    t.ponto('ponto_proa', (136.5, 0, conves - 3))

    # dutos de carga, passarela central com guarda-corpo e cruzamentos
    for y, r, m in ((-3.2, 0.5, 'tubo'), (-1.6, 0.4, 'tubo_verde'), (0, 0.55, 'tubo'), (1.6, 0.35, 'tubo_vermelho'),
                    (3.2, 0.45, 'tubo')):
        t.cilindro((-104, y, conves + 1.1), (104, y, conves + 1.1), r, m, seg=8, tampas=False)
    for x in range(-104, 104, 12):
        for y in (-4.0, 4.0):
            t.barra((x, y, conves), (x, y, conves + 2.6), 0.25, 'estrutura')
        t.barra((x, -4.0, conves + 2.6), (x, 4.0, conves + 2.6), 0.25, 'estrutura')
    t.caixa_entre((-104, -1.0, conves + 2.6), (104, 1.0, conves + 2.9), 'estrutura')
    for lado in (-1, 1):
        t.guarda_corpo([(-104, lado * 0.95), (104, lado * 0.95)], conves + 2.9, mat='amarelo', passo=4.0)
    # escotilhas e domos dos tanques, respiros (válvulas P/V) e canhões de incêndio
    for x in range(-92, 100, 24):
        for y in (-9.0, 9.0):
            t.cilindro((x, y, conves), (x, y, conves + 0.7), 0.9, 'estrutura_escura', seg=14)
            t.cilindro((x, y, conves + 0.7), (x, y, conves + 0.85), 1.0, 'vermelho_conves', seg=14)
    for x in range(-84, 100, 34):
        for y in (-6.5, 6.5):
            t.cilindro((x, y, conves), (x, y, conves + 6.5), 0.22, 'tubo', seg=8)
            t.cilindro((x, y, conves + 6.5), (x, y, conves + 7.2), 0.45, 'tubo_vermelho', seg=10)
    for x in (-70, 40):
        for y in (-5.5, 5.5):
            t.cilindro((x, y, conves), (x, y, conves + 3.2), 0.18, 'tubo_vermelho', seg=8)
            t.cilindro((x, y, conves + 3.2), (x + 1.4, y, conves + 3.7), 0.16, 'tubo_vermelho', seg=8)

    # coletor de carga a meia-nau (manifold), com guindastes de mangueira dos dois bordos
    for y in (-15, 15):
        t.caixa_chanfrada((0, y, conves + 1.6), (9, 7, 3.2), 'estrutura_escura', chanfro=0.15)
        for k in range(4):
            x = -3 + k * 2
            t.cilindro((x, y, conves), (x, y, conves + 4.5), 0.35, 'tubo_vermelho', seg=8)
            t.flange((x, y, conves + 4.55), (0, 0, 1), 0.5, 'aco_escuro', espessura=0.1, parafusos=6)
    guindaste(t, 4, -18, conves, math.radians(120), comp=18, alt_pedestal=9)
    guindaste(t, -4, 18, conves, math.radians(250), comp=18, alt_pedestal=9)

    # superestrutura na popa: acomodações, passadiço com asas, mastro de radar e chaminé
    zt = bloco_acomodacao(t, -132, -108, 15, conves, 7, rnd, frente=1, mat='superestrutura')
    t.caixa_entre((-118, -21.5, zt), (-106, 21.5, zt + 3.6), 'superestrutura')
    for y in [-20 + 2.4 * k for k in range(17)]:
        t.caixa((-105.9, y, zt + 1.9), (0.2, 1.8, 1.5), 'janela')
    for lado in (-1, 1):
        for x in (-116, -112, -108):
            t.caixa((x, lado * 21.6, zt + 1.9), (1.6, 0.2, 1.5), 'janela')
        t.guarda_corpo([(-118, lado * 21.4), (-106, lado * 21.4)], zt + 3.6, mat='superestrutura', passo=3.0)
    t.caixa_entre((-117, -15, zt + 3.6), (-108, 15, zt + 4.0), 'superestrutura')
    mastro_radar(t, -112, zt + 4.0)
    t.caixa_chanfrada_entre((-131, -4.5, zt), (-123, 4.5, zt + 13), 'chamine', chanfro=0.4)
    t.caixa_entre((-131.2, -4.7, zt + 9), (-122.8, 4.7, zt + 10.5), 'faixa')
    t.caixa_entre((-130.5, -3.8, zt + 13), (-123.5, 3.8, zt + 13.6), 'preto_rov')
    for s, m in ((1, 'luz_vermelha'), (-1, 'luz_verde')):
        t.luz((-106, s * 21.7, zt + 3.0), m, 0.6)
    # baleeira de queda livre e bote de resgate
    baleeira_queda_livre(t, -136.5, conves + 6.5)
    t.esfera((-118, 17.5, conves + 9), 1.1, 'laranja', seg=12, aneis=8, escala=(2.6, 1.0, 0.8))
    t.finalizar(col).parent = raiz
    return raiz


def sismico():
    """Navio de pesquisa sísmica: ponte na proa, convés de popa largo com carretéis dos cabos."""
    col = nucleo.colecao('SISMICO')
    comp, boca, quilha, conves = 96.0, 24.0, -7.0, 5.0
    me, mb = casco('sismico_casco', comp, boca, quilha, conves, proa=22.0, raio_popa=2.0, cair_proa=5.0,
                   raio_bojo=1.8, mats=('casco_sismico', 'casco_linha', 'casco_fundo', 'conves'))
    raiz = Construtor('sismico').finalizar(col)
    nucleo.anexar_malha(raiz, 'sismico_casco', me, col)
    rnd = random.Random(51)
    t = Construtor('sismico_topside', semente=52)
    bordas_do_conves(t, mb, conves, -46, 46, passo_luz=12)
    zt = bloco_acomodacao(t, 8, 30, 10, conves, 4, rnd, frente=1, altura_deck=3.0, mat='superestrutura')
    t.caixa_entre((14, -11, zt), (30, 11, zt + 3.0), 'superestrutura')
    for y in [-10 + 2.2 * k for k in range(10)]:
        t.caixa((30.1, y, zt + 1.6), (0.2, 1.6, 1.2), 'janela')
    heliponto(t, 22, 0, zt + 4.5, 9.0)
    mastro_radar(t, 11, zt + 3.0, altura=7, largura=3.0)
    # flutuadores das fontes sísmicas (canhões de ar) prontos na popa
    for y in (-3.2, 3.2):
        t.cilindro((-44, y, conves + 1.2), (-28, y, conves + 1.2), 0.9, 'laranja', seg=14)
        for x in (-41, -36, -31):
            t.caixa((x, y, conves + 0.3), (0.6, 1.6, 0.6), 'estrutura_escura')
    for k in range(6):
        y = -8.5 + k * 3.4
        t.cilindro((-22, y - 1.3, conves + 3.2), (-22, y + 1.3, conves + 3.2), 2.6, 'estrutura_escura', seg=16)
        t.cilindro((-22, y - 1.1, conves + 3.2), (-22, y + 1.1, conves + 3.2), 2.8, 'laranja', seg=16)
    for y in (-9, 9):
        t.barra((-44, y, conves), (-40, y, conves + 9), 0.7, 'amarelo')
        t.barra((-36, y, conves), (-40, y, conves + 9), 0.7, 'amarelo')
    t.barra((-40, -9, conves + 9), (-40, 9, conves + 9), 0.7, 'amarelo')
    t.ponto('ponto_popa', (-48.5, 0, 0))
    t.finalizar(col).parent = raiz
    return raiz


# ------------------------------------------------------------------ equipamentos submarinos

def anm():
    """Árvore de natal molhada: bloco de válvulas sobre a cabeça do poço, atuadores, choke, conector
    da linha de produção, painel do ROV e moldura de proteção com funis-guia."""
    col = nucleo.colecao('ANM')
    t = Construtor('anm', semente=61)
    # base-guia e cabeça do poço
    t.caixa_chanfrada_entre((-3, -3, 0), (3, 3, 0.45), 'amarelo_sub', chanfro=0.06)
    t.caixa_entre((-3.02, -3.02, 0.12), (3.02, 3.02, 0.2), 'preto_rov')
    t.cilindro((0, 0, 0.45), (0, 0, 1.45), 0.62, 'aco_escuro', seg=24)
    t.flange((0, 0, 1.45), (0, 0, 1), 0.85, 'aco_escuro', espessura=0.16, parafusos=12)
    # bloco de válvulas (corpo da árvore), com faixa escura
    t.caixa_chanfrada_entre((-1.0, -1.0, 1.55), (1.0, 1.0, 3.55), 'amarelo_sub', chanfro=0.1, segmentos=2)
    t.caixa_entre((-1.02, -1.02, 2.45), (1.02, 1.02, 2.55), 'preto_rov')
    # atuadores hidráulicos das válvulas (mestra e de produção), com volante para o ROV
    for z in (2.0, 2.95):
        for (dx, dy) in ((-1, 0), (0, -1), (0, 1)):
            base = Vector((dx * 1.0, dy * 1.0, z))
            fim = Vector((dx * 1.75, dy * 1.75, z))
            t.cilindro(base, fim, 0.3, 'aco', seg=16)
            t.cilindro(fim, fim + Vector((dx * 0.2, dy * 0.2, 0)), 0.38, 'laranja_rov', seg=16)
            t.toro(fim + Vector((dx * 0.32, dy * 0.32, 0)), 0.22, 0.03, 'aco_escuro', normal=(dx, dy, 0),
                   seg=16, seg_tubo=5)
    # linha de produção: sai do bloco, desce e termina no conector (ponto_saida)
    t.tubo([(1.0, 0, 2.6), (2.5, 0, 2.6), (2.5, 0, 0.9), (3.25, 0, 0.9)], 0.24, 'aco_escuro', seg=14)
    for p in ((1.6, 0, 2.6), (2.5, 0, 1.7)):
        n = (1, 0, 0) if p[2] > 2 else (0, 0, 1)
        t.flange(p, n, 0.36, 'aco_escuro', espessura=0.1, parafusos=8)
    # válvula choke (controla a vazão) com volante
    t.cilindro((2.5, 0, 1.55), (2.5, -0.8, 1.55), 0.18, 'aco', seg=12)
    t.cilindro((2.5, -0.8, 1.2), (2.5, -0.8, 2.1), 0.34, 'amarelo_sub', seg=16)
    t.toro((2.5, -0.8, 2.25), 0.3, 0.035, 'aco_escuro', seg=18, seg_tubo=5)
    t.barra((2.5, -1.1, 2.25), (2.5, -0.5, 2.25), 0.04, 'aco_escuro')
    # conector da linha de fluxo (encaixe para o duto)
    t.cilindro((3.25, 0, 0.9), (3.6, 0, 0.9), 0.42, 'laranja_rov', seg=18)
    t.flange((3.27, 0, 0.9), (1, 0, 0), 0.5, 'aco_escuro', espessura=0.08, parafusos=8)
    t.ponto('ponto_saida', (3.6, 0, 0.9))
    # capa de proteção no topo, com olhal de içamento
    t.cilindro((0, 0, 3.55), (0, 0, 4.15), 0.72, 'amarelo_sub', seg=24)
    t.cilindro((0, 0, 4.15), (0, 0, 4.3), 0.55, 'amarelo_sub', seg=24, raio2=0.45)
    t.toro((0, 0, 4.5), 0.18, 0.05, 'aco', normal=(0, 1, 0), seg=14, seg_tubo=6)
    # painel do ROV (receptáculos, alavancas e marcadores coloridos) na face de estibordo
    t.caixa_chanfrada_entre((-0.9, -2.55, 1.0), (0.9, -2.35, 2.6), 'preto_rov', chanfro=0.03)
    for i in range(3):
        for j in range(2):
            x, z = -0.5 + i * 0.5, 1.4 + j * 0.75
            t.cilindro((x, -2.56, z), (x, -2.7, z), 0.12, 'aco', seg=12)
            t.barra((x, -2.72, z - 0.12), (x, -2.72, z + 0.12), 0.05, 'laranja_rov' if (i + j) % 2 else 'amarelo_sub')
    for k in range(3):
        t.luz((-0.5 + k * 0.5, -2.58, 2.45), 'luz_verde', 0.1)
    t.barra((0, -2.35, 1.8), (0, -1.0, 1.8), 0.12, 'preto_rov')
    # moldura de proteção: tubos amarelos com contraventamento e funis-guia no topo das colunas
    cantos = [(-2.6, -2.6), (2.6, -2.6), (2.6, 2.6), (-2.6, 2.6)]
    for (x, y) in cantos:
        t.cilindro((x, y, 0.45), (x, y, 4.7), 0.13, 'amarelo_sub', seg=10)
        t.cilindro((x, y, 4.7), (x, y, 5.15), 0.13, 'amarelo_sub', seg=10, raio2=0.32)
    for z in (2.4, 4.6):
        for a, b in zip(cantos, cantos[1:] + cantos[:1]):
            t.cilindro((*a, z), (*b, z), 0.1, 'amarelo_sub', seg=8)
    for a, b in zip(cantos, cantos[1:] + cantos[:1]):
        t.cilindro((*a, 0.5), (*b, 2.35), 0.07, 'amarelo_sub', seg=6)
    # anodos de sacrifício e lâmpadas de trabalho
    for (x, y) in cantos:
        t.caixa((x * 0.92, y, 1.2), (0.3, 0.12, 0.1), 'anodo')
        t.cilindro((x * 0.95, y * 0.95, 4.75), (x * 0.95, y * 0.95, 4.9), 0.07, 'luz_led', seg=10)
    return t.finalizar(col)


def bop():
    """BOP: pilha de válvulas de segurança (gavetas e anulares) com moldura, garrafas acumuladoras
    e módulos de controle, sobre o poço em perfuração."""
    col = nucleo.colecao('BOP')
    t = Construtor('bop', semente=71)
    cantos = [(-3.2, -2.6), (3.2, -2.6), (3.2, 2.6), (-3.2, 2.6)]
    for (x, y) in cantos:
        t.caixa_chanfrada_entre((x - 0.25, y - 0.25, 0), (x + 0.25, y + 0.25, 13.2), 'amarelo_sub', chanfro=0.05)
    for z in (0.3, 4.5, 8.6, 13.0):
        for a, b in zip(cantos, cantos[1:] + cantos[:1]):
            t.barra((*a, z), (*b, z), 0.4, 'amarelo_sub')
    # conector da cabeça do poço
    t.cilindro((0, 0, 0), (0, 0, 1.4), 1.0, 'aco_escuro', seg=24)
    t.flange((0, 0, 1.45), (0, 0, 1), 1.25, 'aco_escuro', espessura=0.2, parafusos=12)
    # quatro gavetas (rams): corpo vermelho com os castelos dos pistões nas laterais
    for k in range(4):
        z = 1.7 + k * 1.65
        t.caixa_chanfrada((0, 0, z + 0.7), (3.8, 2.0, 1.4), 'tubo_vermelho', chanfro=0.12)
        for s in (-1, 1):
            t.cilindro((s * 1.9, 0, z + 0.7), (s * 2.9, 0, z + 0.7), 0.55, 'tubo_vermelho', seg=16)
            t.cilindro((s * 2.9, 0, z + 0.7), (s * 3.05, 0, z + 0.7), 0.62, 'aco_escuro', seg=16)
        t.flange((0, 0, z + 1.45), (0, 0, 1), 1.05, 'aco_escuro', espessura=0.12, parafusos=10)
    # dois preventores anulares (cúpulas) e o conector do riser
    for z in (8.6, 10.5):
        t.cilindro((0, 0, z), (0, 0, z + 1.5), 1.45, 'amarelo_sub', seg=28)
        t.esfera((0, 0, z + 1.5), 1.45, 'amarelo_sub', seg=28, aneis=8, escala=(1, 1, 0.35))
    t.cilindro((0, 0, 12.4), (0, 0, 13.6), 0.85, 'aco_escuro', seg=20)
    t.cilindro((0, 0, 13.6), (0, 0, 15.5), 0.62, 'aco', seg=20)
    t.ponto('ponto_topo_bop', (0, 0, 15.5))
    # garrafas acumuladoras (guardam a pressão hidráulica que fecha o poço)
    for i in range(6):
        x = -2.6 + i * 1.04
        for y in (-2.25, 2.25):
            m = 'amarelo_sub' if i % 2 else 'aco'
            t.cilindro((x, y, 0.4), (x, y, 3.9), 0.36, m, seg=14)
            t.esfera((x, y, 3.9), 0.36, m, seg=14, aneis=6, escala=(1, 1, 0.6))
    # módulos de controle (pods amarelo e azul) e linhas de choke e kill
    t.caixa_chanfrada_entre((-3.0, -2.6, 9.0), (-1.6, -1.6, 12.6), 'amarelo_sub', chanfro=0.1)
    t.caixa_chanfrada_entre((1.6, 1.6, 9.0), (3.0, 2.6, 12.6), 'azul_eq', chanfro=0.1)
    for y in (-1.35, 1.35):
        t.tubo([(2.4, y, 1.5), (2.4, y, 12.8), (0.8, y, 13.2)], 0.17, 'aco_escuro', seg=10)
    for z in (4, 9):
        t.cilindro((3.45, 0, z), (3.6, 0, z), 0.09, 'luz_led', seg=10)
    for (x, y) in cantos:
        t.caixa((x, y * 0.92, 6.5), (0.3, 0.12, 0.1), 'anodo')
    return t.finalizar(col)


def rov():
    """Robô submarino de trabalho (ROV): flutuador de espuma, chassi de tubos, quatro propulsores
    vetoriais, dois braços manipuladores, câmeras e faróis de LED."""
    col = nucleo.colecao('ROV')
    t = Construtor('rov', semente=81)
    # flutuador (espuma sintática) com quinas arredondadas e faixa escura
    t.caixa_chanfrada_entre((-1.6, -0.95, 1.12), (1.55, 0.95, 1.72), 'amarelo_sub', chanfro=0.12, segmentos=2)
    t.caixa_chanfrada_entre((-0.9, -0.55, 1.7), (0.7, 0.55, 1.8), 'amarelo_sub', chanfro=0.05)
    t.caixa_entre((-1.62, -0.97, 1.28), (1.57, 0.97, 1.34), 'preto_rov')
    # aberturas dos propulsores verticais
    for y in (-0.48, 0.48):
        t.toro((0.1, y, 1.73), 0.24, 0.035, 'preto_rov', seg=20, seg_tubo=6)
        t.cilindro((0.1, y, 1.2), (0.1, y, 1.725), 0.22, 'preto_rov', seg=18, tampas=False)
    # olhal de içamento e terminação do cabo umbilical
    t.toro((-0.2, 0, 1.92), 0.1, 0.025, 'aco', normal=(0, 1, 0), seg=12, seg_tubo=6)
    t.cilindro((-0.2, 0, 1.8), (-0.2, 0, 1.86), 0.08, 'aco', seg=10)
    t.cilindro((0.35, 0, 1.8), (0.35, 0, 1.95), 0.11, 'preto_rov', seg=12)
    t.cilindro((0.35, 0, 1.95), (0.35, 0, 2.05), 0.06, 'preto_rov', seg=10, raio2=0.04)
    # chassi de tubos
    cantos = [(-1.5, -0.88), (1.45, -0.88), (1.45, 0.88), (-1.5, 0.88)]
    for (x, y) in cantos + [(0.0, -0.88), (0.0, 0.88)]:
        t.cilindro((x, y, 0.02), (x, y, 1.12), 0.045, 'preto_rov', seg=8)
    for z in (0.04, 0.58, 1.1):
        for a, b in zip(cantos, cantos[1:] + cantos[:1]):
            t.cilindro((*a, z), (*b, z), 0.04, 'preto_rov', seg=8)
    # esquis (onde ele pousa no fundo)
    for y in (-0.72, 0.72):
        t.caixa_chanfrada_entre((-1.55, y - 0.06, -0.02), (1.5, y + 0.06, 0.06), 'aco_escuro', chanfro=0.02)
    # módulos eletrônico e hidráulico, cilindros de pressão e caixa de ferramentas
    t.caixa_chanfrada_entre((-1.25, -0.6, 0.2), (0.6, 0.6, 0.85), 'preto_rov', chanfro=0.05)
    for y in (-0.35, 0.0, 0.35):
        t.cilindro((-1.3, y, 0.3), (-0.2, y, 0.3), 0.12, 'aco', seg=12)
        t.esfera((-1.3, y, 0.3), 0.12, 'aco', seg=12, aneis=6, escala=(0.5, 1, 1))
    t.caixa_chanfrada_entre((0.65, -0.45, 0.25), (1.1, 0.45, 0.8), 'azul_eq', chanfro=0.04)
    # propulsores horizontais nos quatro cantos, a 45 graus
    for (x, y, ang) in ((1.25, -0.8, 45), (1.25, 0.8, -45), (-1.35, -0.8, -45), (-1.35, 0.8, 45)):
        a = math.radians(ang)
        t.propulsor((x, y, 0.62), (math.cos(a), math.sin(a), 0), 0.2, 0.32)
    # câmeras (com lente) e faróis de LED na frente
    t.caixa_chanfrada_entre((1.42, -0.12, 0.88), (1.62, 0.12, 1.08), 'preto_rov', chanfro=0.03)
    t.cilindro((1.62, 0, 0.98), (1.7, 0, 0.98), 0.06, 'vidro', seg=12)
    for y in (-0.42, 0.42):
        t.cilindro((1.5, y, 1.0), (1.66, y, 1.0), 0.045, 'aco', seg=10)
        t.cilindro((1.66, y, 1.0), (1.68, y, 1.0), 0.04, 'vidro', seg=10)
    for (y, z) in ((-0.72, 0.78), (0.72, 0.78), (-0.6, 1.02), (0.6, 1.02)):
        t.cilindro((1.5, y, z), (1.64, y, z), 0.075, 'aco_escuro', seg=12)
        t.cilindro((1.64, y, z), (1.66, y, z), 0.065, 'luz_led', seg=12)
    t.ponto('ponto_farol', (1.75, 0, 0.75))
    t.ponto('ponto_cabo', (0.35, 0, 2.05))
    # braços manipuladores
    for lado, alcance in ((-1, 1.0), (1, 0.8)):
        y = 0.52 * lado
        ombro = Vector((1.35, y, 0.42))
        cotovelo = ombro + Vector((0.45 * alcance, 0.05 * lado, 0.12))
        punho = cotovelo + Vector((0.4 * alcance, 0.0, -0.22))
        ponta = punho + Vector((0.12, 0, -0.04))
        t.cilindro(ombro - Vector((0, 0.09, 0)), ombro + Vector((0, 0.09, 0)), 0.09, 'preto_rov', seg=12)
        t.cilindro(ombro, cotovelo, 0.06, 'aco', seg=10)
        t.esfera(cotovelo, 0.08, 'preto_rov', seg=10, aneis=6)
        t.cilindro(cotovelo, punho, 0.05, 'aco', seg=10)
        t.cilindro(punho, ponta, 0.055, 'preto_rov', seg=10)
        for s in (-1, 1):
            t.barra(ponta + Vector((0, s * 0.03, 0)), ponta + Vector((0.16, s * 0.05, -0.03)), 0.025, 'aco_escuro')
    # anodos de sacrifício
    for x in (-1.0, 0.6):
        for y in (-0.92, 0.92):
            t.caixa((x, y, 0.3), (0.22, 0.05, 0.08), 'anodo')
    return t.finalizar(col)


# ------------------------------------------------------------------ refinaria

FRACOES = [  # material, altura inicial e final na torre (m)
    ('fr_residuo', 4.6, 11.0), ('fr_oleo', 11.0, 21.0), ('fr_diesel', 21.0, 31.0),
    ('fr_querosene', 31.0, 41.0), ('fr_gasolina', 41.0, 51.0), ('fr_glp', 51.0, 60.5),
]


def anel_plataforma(t, centro, raio, z, largura=1.5, mat='estrutura', partes=16):
    cx, cy = centro
    for i in range(partes):
        a0, a1 = 2 * math.pi * i / partes, 2 * math.pi * (i + 1) / partes
        am = (a0 + a1) / 2
        r = raio + largura / 2
        corda = 2 * r * math.sin(math.pi / partes) * 1.04
        t.caixa((cx + r * math.cos(am), cy + r * math.sin(am), z), (largura, corda, 0.22), mat, rot_z=am)
        ro = raio + largura
        p0 = (cx + ro * math.cos(a0), cy + ro * math.sin(a0), z + 1.1)
        p1 = (cx + ro * math.cos(a1), cy + ro * math.sin(a1), z + 1.1)
        t.barra(p0, p1, 0.07, 'amarelo')
        t.barra((p0[0], p0[1], z), p0, 0.07, 'amarelo')


def torre_destilacao(col, base, raio=3.6, altura=62.0):
    """Torre de destilação atmosférica com pratos e faixas das frações (cortada no site)."""
    bx, by, bz = base
    s = Construtor('torre', semente=91)
    s.cilindro((bx, by, bz), (bx, by, bz + 4.5), raio * 1.06, 'estrutura_escura', seg=28)
    s.cilindro((bx, by, bz + 4.5), (bx, by, bz + altura), raio, 'torre_casco', seg=40, tampas=False)
    s.esfera((bx, by, bz + altura), raio, 'torre_casco', seg=40, aneis=10, escala=(1, 1, 0.42))
    for z in range(9, int(altura) - 2, 7):
        anel_plataforma(s, (bx, by), raio, bz + z)
    for k in (-1, 1):
        s.barra((bx + k * 0.35, by - raio - 1.6, bz), (bx + k * 0.35, by - raio - 1.6, bz + altura - 2), 0.08, 'amarelo')
    for k in range(int(altura / 0.35)):
        z = bz + k * 0.35
        s.barra((bx - 0.35, by - raio - 1.6, z), (bx + 0.35, by - raio - 1.6, z), 0.05, 'amarelo')
    # saídas laterais de cada fração e linha de topo
    for _, z0, z1 in FRACOES:
        z = bz + (z0 + z1) / 2
        s.tubo([(bx + raio, by, z), (bx + raio + 6, by, z), (bx + raio + 6, by, bz + 1)], 0.35, 'tubo', seg=10)
        s.cilindro((bx + raio + 6, by, z - 0.6), (bx + raio + 6, by, z + 0.6), 0.55, 'tubo_verde', seg=10)
    s.tubo([(bx, by, bz + altura + raio * 0.4), (bx, by, bz + altura + 3), (bx - 12, by, bz + altura + 3),
            (bx - 12, by, bz + 20)], 0.6, 'tubo', seg=10)
    s.tubo([(bx - 30, by, bz + 6), (bx - raio, by, bz + 8)], 0.55, 'tubo_vermelho', seg=10)
    for z in range(12, int(altura), 7):
        s.luz((bx + raio + 1.2, by - 1.0, bz + z + 0.4), 'luz_sodio', 0.35)
        s.luz((bx - raio - 1.2, by + 1.0, bz + z + 0.4), 'luz_sodio', 0.35)
    s.luz((bx, by, bz + altura + raio * 0.45), 'luz_vermelha', 0.6)
    s.ponto('ponto_torre', (bx, by, bz))
    raiz = s.finalizar(col)
    p = Construtor('torre_internos', semente=92)
    z = 6.0
    while z < altura - 1.5:
        p.cilindro((bx, by, bz + z), (bx, by, bz + z + 0.14), raio * 0.97, 'prato', seg=36)
        z += 2.5
    for mat, z0, z1 in FRACOES:
        p.cilindro((bx, by, bz + z0), (bx, by, bz + z1), raio * 0.9, mat, seg=36)
    internos = p.finalizar(col)
    internos.parent = raiz
    return raiz


def forno(t, x, y, comp=22, larg=11, alt=18, chamine=48):
    t.caixa_entre((x - comp / 2, y - larg / 2, 0), (x + comp / 2, y + larg / 2, alt), 'estrutura_escura')
    t.caixa_entre((x - comp / 2 - 0.1, y - larg / 2 - 0.1, 1.2), (x + comp / 2 + 0.1, y - larg / 2 + 0.2, 3.0), 'forno_fogo')
    t.caixa_entre((x - comp / 2 + 2, y - larg / 2 + 1, alt), (x + comp / 2 - 2, y + larg / 2 - 1, alt + 4), 'estrutura')
    t.cilindro((x, y, alt + 4), (x, y, chamine), 1.6, 'chamine', seg=14)
    t.luz((x, y, chamine + 0.5), 'luz_vermelha', 0.8)


def refinaria():
    """Refinaria em coordenadas locais (origem no centro); no site ela vai para a costa."""
    col = nucleo.colecao('REFINARIA')
    rnd = random.Random(101)
    raiz = Construtor('refinaria').finalizar(col)
    t = Construtor('refinaria_unidades', semente=102)
    t.caixa_entre((-950, -760, -1.0), (760, 760, 0.0), 'asfalto')
    # destilação: torre atmosférica (com corte), forno, torre de vácuo
    torre_destilacao(col, (40, -40, 0)).parent = raiz
    # bombas ao pé da torre (motores azuis) levando as frações para os tanques
    for k in range(5):
        xp, yp = 52 + k * 4.2, -22
        t.caixa((xp, yp, 0.15), (3.2, 1.4, 0.3), 'estrutura_escura')
        t.cilindro((xp - 1.3, yp, 0.9), (xp, yp, 0.9), 0.55, 'azul_eq', seg=12)
        t.cilindro((xp, yp, 0.9), (xp + 1.2, yp, 0.9), 0.45, 'aco_escuro', seg=12)
        t.cilindro((xp + 1.0, yp, 1.3), (xp + 1.0, yp, 7.6), 0.22, 'tubo', seg=8)
    forno(t, 10, -40)
    forno(t, 10, -62, comp=18)
    t.cilindro((75, -40, 0), (75, -40, 44), 5.0, 'torre_casco', seg=32)
    t.esfera((75, -40, 44), 5.0, 'torre_casco', seg=32, aneis=8, escala=(1, 1, 0.45))
    for z in range(10, 44, 8):
        anel_plataforma(t, (75, -40), 5.0, z)
    # unidades de processo (craqueamento, hidrotratamento, reforma...)
    unidades = [(-60, -120, 3, 'gas'), (-60, 30, 3, 'separacao'), (110, 40, 2, 'compressao'),
                (110, -150, 3, 'gas'), (-150, -40, 2, 'oleo'), (180, -60, 2, 'agua'),
                (-150, 110, 3, 'gas'), (40, 120, 2, 'utilidades'), (220, 120, 3, 'oleo')]
    for (x, y, niv, tipo) in unidades:
        modulo(t, x, y, 34.0, 26.0, 5.0, niv, tipo, rnd, h=8.0)

    # adensamento: mais unidades (versão leve) numa grade, fora das ruas de tubos e das áreas já ocupadas
    ocupado = [(x - 4, y - 4, x + 38, y + 30) for (x, y, _, _) in unidades]
    ocupado += [(-10, -80, 95, -20),      # torre de destilação, fornos e torre de vácuo
                (-125, 175, -55, 225),     # conversor do FCC
                (285, 315, 385, 380),      # esferas de GLP
                (165, 185, 315, 255),      # torres de resfriamento (abaixo)
                (-30, 240, -10, 280),      # chaminé
                (20, 262, 80, 298)]        # prédio de controle
    corredores = [('y', 0.0), ('x', 0.0), ('y', -95.0)]  # racks de tubos

    def livre(x0, y0, x1, y1):
        for (a, b, c_, d) in ocupado:
            if x0 < c_ and x1 > a and y0 < d and y1 > b:
                return False
        for eixo, v in corredores:
            lo, hi = (y0, y1) if eixo == 'y' else (x0, x1)
            if lo - 7 < v < hi + 7:
                return False
        return True

    tipos_leves = ['gas', 'oleo', 'compressao', 'agua', 'utilidades', 'separacao']
    for gx in range(-270, 320, 50):
        for gy in range(-250, 300, 44):
            x0, y0 = gx + rnd.uniform(-3, 3), gy + rnd.uniform(-3, 3)
            sx, sy = rnd.choice([26.0, 30.0, 34.0]), rnd.choice([20.0, 24.0])
            if not livre(x0, y0, x0 + sx, y0 + sy):
                continue
            ocupado.append((x0 - 3, y0 - 3, x0 + sx + 3, y0 + sy + 3))
            modulo(t, x0, y0, sx, sy, 4.0, rnd.choice([1, 2, 2, 3]), rnd.choice(tipos_leves), rnd,
                   h=7.0, leve=True)

    # torres de resfriamento: duas fileiras de células com ventiladores no topo
    for linha in range(2):
        for k in range(6):
            x, y = 175 + k * 22, 195 + linha * 28
            t.caixa_entre((x, y, 0), (x + 19, y + 24, 13), 'concreto')
            t.cilindro((x + 9.5, y + 12, 13), (x + 9.5, y + 12, 16.5), 7.5, 'estrutura_escura', seg=20)
            t.cilindro((x + 9.5, y + 12, 16.3), (x + 9.5, y + 12, 16.6), 6.6, 'tubo', seg=20)
            t.luz((x + 9.5, y - 0.3, 6), 'luz_sodio', 0.6)

    # prédio de controle (janelas acesas: a sala de controle trabalha a noite toda)
    t.caixa_entre((25, 268, 0), (75, 292, 12), 'branco')
    for k in range(9):
        t.caixa((29 + k * 5.4, 267.9, 7.5), (3.6, 0.2, 2.2), 'janela')
        t.caixa((29 + k * 5.4, 267.9, 3.0), (3.6, 0.2, 2.2), 'janela' if k % 3 else 'janela_apagada')

    # conversor do craqueamento catalítico (FCC): reator e regenerador
    t.vaso_vertical((-100, 200, 0), 58, 4.0, 'vaso')
    t.vaso_vertical((-80, 200, 0), 44, 7.0, 'vaso')
    t.tubo([(-100, 200, 50), (-90, 200, 54), (-80, 200, 46)], 1.2, 'tubo')
    for z in range(10, 56, 9):
        anel_plataforma(t, (-100, 200), 4.0, z, partes=12)
    # racks de tubos ligando as unidades
    for (x0, y0, x1, y1) in ((-200, 0, 260, 0), (0, -200, 0, 260), (-200, -95, 260, -95)):
        n = int(math.hypot(x1 - x0, y1 - y0) / 12)
        for k in range(n + 1):
            x, y = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n
            dx, dy = (0, 3.5) if y0 == y1 else (3.5, 0)
            t.barra((x - dx, y - dy, 0), (x - dx, y - dy, 7), 0.5, 'estrutura')
            t.barra((x + dx, y + dy, 0), (x + dx, y + dy, 7), 0.5, 'estrutura')
            t.barra((x - dx, y - dy, 7), (x + dx, y + dy, 7), 0.45, 'estrutura')
        for j, m in enumerate(('tubo', 'tubo_verde', 'tubo', 'vaso', 'tubo_vermelho')):
            off = -2.6 + j * 1.3
            ox, oy = (0, off) if y0 == y1 else (off, 0)
            t.cilindro((x0 + ox, y0 + oy, 7.6), (x1 + ox, y1 + oy, 7.6), 0.4, m, seg=8, tampas=False)
    # parque de tanques
    for i in range(5):
        for j in range(6):
            x, y = -780 + i * 105, -560 + j * 190
            r = rnd.choice([28, 32, 36, 40])
            h = rnd.choice([14, 16, 18])
            t.cilindro((x, y, 0), (x, y, h), r, 'tanque', seg=40)
            t.cilindro((x, y, h), (x, y, h + 0.6), r * 0.97, 'tanque_teto', seg=40)
            t.luz((x + r, y, h + 1.0), 'luz_sodio', 0.6)
            t.caixa_entre((x - r - 12, y - r - 12, 0), (x + r + 12, y - r - 11, 1.6), 'concreto')
    # esferas de GLP
    for k in range(6):
        x, y = 300 + (k % 3) * 34, 330 + (k // 3) * 34
        t.esfera((x, y, 13), 9.0, 'tanque', seg=24, aneis=14)
        for a in range(8):
            ang = 2 * math.pi * a / 8
            t.barra((x + 8.2 * math.cos(ang), y + 8.2 * math.sin(ang), 0),
                    (x + 8.6 * math.cos(ang), y + 8.6 * math.sin(ang), 12), 0.5, 'estrutura')
    # tocha da refinaria e chaminés
    t.cilindro((480, -520, 0), (480, -520, 95), 1.2, 'estrutura', seg=12)
    t.trelica((480, -520, 0), (480, -520, 90), 9, 3, 'estrutura', esp=0.4, passos=10)
    t.ponto('ponto_tocha_refinaria', (480, -520, 97))
    for (x, y, h) in ((-20, 260, 110), (150, -260, 90), (-260, 180, 80)):
        t.cilindro((x, y, 0), (x, y, h), 3.0, 'concreto', seg=16)
        t.cilindro((x, y, h - 6), (x, y, h - 3), 3.1, 'faixa', seg=16)
        t.luz((x, y, h + 0.5), 'luz_vermelha', 1.2)
    # postes de luz nas ruas
    for x in range(-900, 760, 60):
        for y in (-700, -260, 260, 700):
            t.barra((x, y, 0), (x, y, 10), 0.25, 'estrutura')
            t.luz((x, y, 10.3), 'luz_sodio', 0.8)
    # píer do terminal marítimo (o mar começa em x = +1600)
    t.caixa_entre((1500, 590, 0), (2550, 610, 4), 'concreto')
    t.caixa_entre((2380, 560, 0), (2560, 640, 5), 'concreto')
    for x in range(1520, 2560, 40):
        t.barra((x, 598, 4), (x, 598, 11), 0.3, 'estrutura')
        t.luz((x, 598, 11.3), 'luz_sodio', 0.9)
    for k in range(4):
        x = 2400 + k * 40
        t.trelica((x, 620, 5), (x + 6, 640, 22), 2.0, 1.0, 'amarelo', esp=0.3, passos=5)
    t.ponto('ponto_pier', (2470, 660, 0))
    t.finalizar(col).parent = raiz
    return raiz


# ------------------------------------------------------------------ geração e exportação

GERADORES = {
    'fpso': fpso, 'navio_sonda': navio_sonda, 'aliviador': aliviador, 'sismico': sismico,
    'anm': anm, 'bop': bop, 'rov': rov, 'refinaria': refinaria,
}


def gerar(*nomes, exportar=True):
    """Gera (e exporta para o site) os modelos pedidos; sem nomes, gera todos.

    No fim liga a integração automática: dali em diante, editar um modelo à mão no Blender
    ou salvar o .blend também atualiza o site sozinho (ver integracao.py).
    """
    import integracao
    os.makedirs(SAIDA, exist_ok=True)
    relatorio = []
    with integracao.pausada():
        for nome in nomes or GERADORES:
            raiz = GERADORES[nome]()
            tri = nucleo.contar_triangulos(raiz)
            if exportar:
                caminho = os.path.join(SAIDA, f'{nome}.glb')
                nucleo.exportar(raiz, caminho)
                relatorio.append(f'{nome}: {tri} triângulos, {os.path.getsize(caminho) / 1e6:.2f} MB')
            else:
                relatorio.append(f'{nome}: {tri} triângulos')
    if exportar and not integracao.estado['ativa']:
        integracao.ativar()
    return '\n'.join(relatorio)
