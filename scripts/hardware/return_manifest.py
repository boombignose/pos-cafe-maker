#!/usr/bin/env python3
"""Return mechanical data from the edited PCB; never reuse an unverified manifest."""
import argparse
import hashlib
import json
import math
import pathlib
import re


def parse_sexp(source):
    tokens = re.findall(r'"(?:\\.|[^"\\])*"|[^\s()]+|[()]', source)
    stack, roots = [], []
    for token in tokens:
        if token == '(':
            node = []
            (stack[-1] if stack else roots).append(node)
            stack.append(node)
        elif token == ')':
            if not stack:
                raise ValueError('Unbalanced KiCad source')
            stack.pop()
        else:
            if not stack:
                raise ValueError('Unexpected KiCad token')
            stack[-1].append(json.loads(token) if token.startswith('"') else token)
    if stack or len(roots) != 1:
        raise ValueError('Unbalanced KiCad source')
    return roots[0]


def children(node, kind):
    return [entry for entry in node if isinstance(entry, list) and entry and entry[0] == kind]


def child(node, kind):
    matches = children(node, kind)
    if not matches:
        raise ValueError('Missing KiCad field: ' + kind)
    return matches[0]


def positive(value, name):
    result = float(value)
    if not math.isfinite(result) or result <= 0:
        raise ValueError(name + ' must be positive and finite')
    return result


def manifest(path):
    raw = pathlib.Path(path).read_bytes()
    pcb = parse_sexp(raw.decode())
    if pcb[0] != 'kicad_pcb':
        raise ValueError('Expected a KiCad PCB')
    # shortcut: axis-aligned rectangular boards only, extend for curved/custom outlines.
    for entry in pcb:
        if isinstance(entry, list) and entry and entry[0].startswith('gr_') and entry[0] not in ('gr_line','gr_rect','gr_text'):
            layers = children(entry,'layer')
            if layers and layers[0][1] == 'Edge.Cuts':
                raise ValueError('Only a rectangular Edge.Cuts outline is supported')
    edge_points = []
    edges = []
    for kind in ('gr_rect', 'gr_line'):
        for edge in children(pcb, kind):
            if child(edge, 'layer')[1] == 'Edge.Cuts':
                points = [tuple(map(float, child(edge, end)[1:3])) for end in ('start', 'end')]
                if not all(math.isfinite(value) for point in points for value in point):
                    raise ValueError('Outline coordinates must be finite')
                edges.append((kind, points))
                edge_points.extend(points)
    if not edge_points:
        raise ValueError('PCB needs a rectangular Edge.Cuts outline')
    left, top = min(x for x,y in edge_points), min(y for x,y in edge_points)
    right, bottom = max(x for x,y in edge_points), max(y for x,y in edge_points)
    if len(edges) == 1 and edges[0][0] == 'gr_rect':
        pass
    elif len(edges) == 4 and all(kind == 'gr_line' for kind,points in edges):
        expected = {frozenset((a,b)) for a,b in [((left,top),(right,top)),((right,top),(right,bottom)),((right,bottom),(left,bottom)),((left,bottom),(left,top))]}
        if {frozenset(points) for kind,points in edges} != expected:
            raise ValueError('Only a closed rectangular Edge.Cuts outline is supported')
    else:
        raise ValueError('Only one rectangular Edge.Cuts outline is supported')
    thickness = positive(child(child(pcb, 'general'), 'thickness')[1], 'thickness')
    board = {'name': pathlib.Path(path).stem, 'width': round(right-left, 6), 'height': round(bottom-top, 6), 'thickness': thickness, 'holes': [], 'components': [], 'connectors': []}
    if board['width'] <= 0 or board['height'] <= 0:
        raise ValueError('Invalid PCB outline')
    for footprint in children(pcb, 'footprint'):
        layers = children(footprint,'layer')
        if layers and layers[0][1] != 'F.Cu':
            raise ValueError('Only top-side footprints are supported')
        props = {item[1]: item[2] for item in children(footprint, 'property')}
        reference = props.get('Reference', '')
        at = child(footprint, 'at')
        x, y = map(float, at[1:3])
        angle = math.radians(float(at[3]) if len(at)>3 else 0)
        if not all(math.isfinite(value) for value in (x,y,angle)):
            raise ValueError('Footprint coordinates must be finite')
        pads = children(footprint, 'pad')
        for pad in pads:
            if pad[2] == 'np_thru_hole':
                p = child(pad, 'at')
                px,py = map(float,p[1:3])
                board['holes'].append({'x':round(x+px*math.cos(angle)+py*math.sin(angle)-left,6),'y':round(bottom-y+px*math.sin(angle)-py*math.cos(angle),6),'diameter':positive(child(pad,'drill')[1], 'hole diameter')})
        if pads and all(pad[2] == 'np_thru_hole' for pad in pads):
            continue
        dimensions = []
        for key in ('BBN_Width', 'BBN_Height', 'BBN_Depth'):
            if key not in props:
                raise ValueError(reference + ' missing ' + key + '; set mechanical envelope in KiCad')
            dimensions.append(positive(props[key],key))
        width,height,depth = dimensions
        component = {'reference':reference,'name':props.get('Value',reference),'x':round(x-left,6),'y':round(bottom-y,6),'width':round(abs(width*math.cos(angle))+abs(height*math.sin(angle)),6),'height':round(abs(width*math.sin(angle))+abs(height*math.cos(angle)),6),'depth':depth}
        board['components'].append(component)
        if props.get('BBN_Connector'):
            board['connectors'].append({'id':reference,'name':props.get('Value',reference),'x':component['x'],'y':component['y'],'z':thickness,'type':props['BBN_Connector'],'pins':[{'name':pad[1],'net':child(pad,'net')[-1]} for pad in pads if pad[1]]})
    return {'schemaVersion':1, 'units':'mm', 'coordinateSystem':'lower-left; component envelopes centered; depth above PCB top', 'sourceFile':pathlib.Path(path).name,'sourceHash':hashlib.sha256(raw).hexdigest(), 'board':board}


def is_current(path, data):
    return data.get('sourceHash') == hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pcb', type=pathlib.Path)
    parser.add_argument('output', type=pathlib.Path)
    parser.add_argument('--check', action='store_true', help='Fail when the saved manifest differs from current PCB')
    args = parser.parse_args()
    generated = manifest(args.pcb)
    if args.check:
        saved = json.loads(args.output.read_text())
        if generated != saved:
            parser.exit(1, 'Stale manifest: regenerate from the current PCB\n')
    else:
        args.output.write_text(json.dumps(generated,ensure_ascii=False,indent=2)+'\n')

if __name__ == '__main__':
    main()
