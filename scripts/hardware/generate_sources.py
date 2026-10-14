#!/usr/bin/env python3
"""Build the initial prototype sources; edit sources in KiCad after generation."""
import json
import pathlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'hardware/sources'

COUNTER = 0
def uid():
    global COUNTER
    COUNTER += 1
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'bbn-accessory-v1/' + str(COUNTER)))

def symbol_id(reference):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'bbn-accessory-v1/symbol/' + reference))

SCHEMATIC_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, 'bbn-accessory-v1/schematic'))
def q(text): return json.dumps(str(text))

def prop(name,value,x=0,y=0,layer='F.Fab',hide=True):
    return f'(property {q(name)} {q(value)} (at {x} {y}) (layer {q(layer)}) (effects (font (size 1 1) (thickness 0.15)) {"(hide yes)" if hide else ""}))'

PARTS = [
    ('J1','5V DC IN',12,25,10,8,12,5.0,[(1,'5V_IN'),(2,'GND')],'screw-terminal'),
    ('F1','60R075XU',27,25,10.2,3.1,16.2,5.08,[(1,'5V_IN'),(2,'FUSED')],None),
    ('D1','1N5822-E3/54',45,25,18.5,5.5,6.5,15.24,[(1,'FUSED'),(2,'ACCESSORY_5V')],None),
    ('J2','FAN DC OUT',68,25,10,8,12,5.0,[(1,'ACCESSORY_5V'),(2,'GND')],'screw-terminal'),
    ('R1','MFR-25FBF52-1K',44,12,10.5,3.3,4,7.62,[(1,'ACCESSORY_5V'),(2,'LED_A')],None),
    ('D2','WP7113SGC',58,12,5.3,5.3,10,2.54,[(1,'LED_A'),(2,'GND')],None),
]
NETS = {'5V_IN':1,'GND':2,'FUSED':3,'ACCESSORY_5V':4,'LED_A':5}


def footprint(part):
    ref,value,x,y,w,h,d,pitch,pins,connector = part
    name = 'Terminal_5mm' if connector else ('PTC_P5.08' if ref=='F1' else ('Axial_P15.24' if ref=='D1' else ('Resistor_P7.62' if ref=='R1' else 'LED_D5')))
    text = f'(footprint "BBN:{name}" (layer "F.Cu") (uuid "{uid()}") (at {x} {y}) (path "/{SCHEMATIC_ID}/{symbol_id(ref)}") (attr through_hole)'
    text += prop('Reference',ref,0,-h/2-1.7,'F.SilkS',False)+prop('Value',value,0,h/2+1.7)
    for k,v in [('BBN_Width',w),('BBN_Height',h),('BBN_Depth',d)]: text += prop(k,v)
    if connector: text += prop('BBN_Connector',connector)
    for a,b in [((-w/2,-h/2),(w/2,-h/2)),((w/2,-h/2),(w/2,h/2)),((w/2,h/2),(-w/2,h/2)),((-w/2,h/2),(-w/2,-h/2))]:
        text += f'(fp_line (start {a[0]} {a[1]}) (end {b[0]} {b[1]}) (stroke (width 0.1) (type default)) (layer "F.Fab") (uuid "{uid()}"))'
    text += f'(fp_rect (start {-w/2-0.3} {-h/2-0.3}) (end {w/2+0.3} {h/2+0.3}) (stroke (width 0.05) (type default)) (layer "F.CrtYd") (uuid "{uid()}"))'
    for number,net in pins:
        px = -pitch/2 if number==1 else pitch/2
        drill = 1.3 if connector else (1.4 if ref=='D1' else 0.8)
        size = 2.6 if connector else (2.6 if ref=='D1' else 1.8)
        text += f'(pad "{number}" thru_hole {"rect" if number==1 else "circle"} (at {px} 0) (size {size} {size}) (drill {drill}) (layers "*.Cu" "*.Mask") (net {NETS[net]} "/{net}") (uuid "{uid()}"))'
    return text+')'


def board():
    b = '(kicad_pcb (version 20241229) (generator "pcbnew") (general (thickness 1.6)) (paper "A4")'
    b += '(layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user "b.silkscreen") (37 "F.SilkS" user "f.silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user "b.courtyard") (47 "F.CrtYd" user "f.courtyard") (48 "B.Fab" user) (49 "F.Fab" user))'
    b += '(setup (pad_to_mask_clearance 0) (allow_soldermask_bridges_in_footprints no))'
    for net,number in NETS.items(): b+=f'(net {number} "/{net}")'
    for part in PARTS: b+=footprint(part)
    for number,(x,y) in enumerate([(4,4),(76,4),(4,46),(76,46)],1):
        b+=f'(footprint "BBN:MountingHole_3.2mm" (layer "F.Cu") (uuid "{uid()}") (at {x} {y}) (attr board_only exclude_from_pos_files exclude_from_bom)'+prop('Reference','H'+str(number))+prop('Value','M3 clearance')+f'(fp_rect (start -3 -3) (end 3 3) (stroke (width 0.05) (type default)) (layer "F.CrtYd") (uuid "{uid()}"))(pad "" np_thru_hole circle (at 0 0) (size 3.2 3.2) (drill 3.2) (layers "*.Cu" "*.Mask") (uuid "{uid()}")))'
    for a,c in [((0,0),(80,0)),((80,0),(80,50)),((80,50),(0,50)),((0,50),(0,0))]:
        b+=f'(gr_line (start {a[0]} {a[1]}) (end {c[0]} {c[1]}) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") (uuid "{uid()}"))'
    def route(points,net,layer='F.Cu',width=1):
        nonlocal b
        for a,c in zip(points,points[1:]): b+=f'(segment (start {a[0]} {a[1]}) (end {c[0]} {c[1]}) (width {width}) (layer "{layer}") (net {NETS[net]}) (uuid "{uid()}"))'
    route([(9.5,25),(9.5,18),(24.46,18),(24.46,25)],'5V_IN')
    route([(29.54,25),(37.38,25)],'FUSED')
    route([(52.62,25),(65.5,25)],'ACCESSORY_5V')
    route([(52.62,25),(52.62,20),(40.19,20),(40.19,12)],'ACCESSORY_5V')
    route([(47.81,12),(56.73,12)],'LED_A',width=0.4)
    route([(14.5,25),(14.5,40),(70.5,40),(70.5,25)],'GND','B.Cu')
    route([(59.27,12),(59.27,40)],'GND','B.Cu',0.6)
    for text,x,y,size in [('BBN CAFE ACCESSORY v1',40,6,1.3),('5V DC ONLY / 0.5A LOAD',40,42.5,1),('IN +  -',12,32,1),('OUT +  -',68,32,1),('PROTOTYPE - TEST BEFORE USE',40,46,1),('D1: BAND AT PIN 2',40,34,1)]:
        b+=f'(gr_text "{text}" (at {x} {y}) (layer "F.SilkS") (uuid "{uid()}") (effects (font (size {size} {size}) (thickness 0.15))))'
    return b+')\n'


def symbol_definition(name,pin_names):
    text=f'(symbol "BBN:{name}" (pin_names (offset 0)) (in_bom yes) (on_board yes)'
    text+='(property "Reference" "U" (at 0 5.08 0) (effects (font (size 1.27 1.27))))(property "Value" "'+name+'" (at 0 -5.08 0) (effects (font (size 1.27 1.27))))'
    graphics='(rectangle (start -2.54 2.54) (end 2.54 -2.54) (stroke (width 0) (type default)) (fill (type none)))'
    if name in ('Schottky','LED'):
        graphics='(polyline (pts (xy -2.54 2.54) (xy 2.54 0) (xy -2.54 -2.54) (xy -2.54 2.54)) (stroke (width 0) (type default)) (fill (type none)))(polyline (pts (xy 2.54 2.54) (xy 2.54 -2.54)) (stroke (width 0) (type default)) (fill (type none)))'
    if name == 'LED':
        for dx in (0,2.54):
            graphics+=f'(polyline (pts (xy {dx} 3.81) (xy {dx+2.54} 6.35) (xy {dx+1.27} 6.35) (xy {dx+2.54} 6.35) (xy {dx+2.54} 5.08)) (stroke (width 0) (type default)) (fill (type none)))'
    text+=f'(symbol "{name}_0_1" {graphics})'
    text+=f'(symbol "{name}_1_1"'
    for n,pinname in enumerate(pin_names,1):
        x,angle=(-5.08,0) if n==1 else (5.08,180)
        text+=f'(pin passive line (at {x} 0 {angle}) (length 2.54) (name "{pinname}" (effects (font (size 1 1)))) (number "{n}" (effects (font (size 1 1)))))'
    return text+'))'


def schematic():
    root=SCHEMATIC_ID
    s=f'(kicad_sch (version 20250114) (generator "eeschema") (uuid "{root}") (paper "A4") (title_block (title "BBN Cafe 5V Accessory Distribution — Prototype") (rev "1.0") (company "BoomBigNose") (comment 1 "0.5A fan only; SBC / screen on separate certified supply")) (lib_symbols'
    defs={'Terminal':['+','-'],'Fuse':['IN','OUT'],'Schottky':['A','K'],'Resistor':['1','2'],'LED':['A','K']}
    for name,pins in defs.items(): s+=symbol_definition(name,pins)
    s+=')'
    names={'J1':'Terminal','J2':'Terminal','F1':'Fuse','D1':'Schottky','R1':'Resistor','D2':'LED'}
    schempos={'J1':(40.64,63.5),'F1':(85.09,63.5),'D1':(129.54,63.5),'J2':(220.98,63.5),'R1':(110.49,109.22),'D2':(154.94,109.22)}
    for ref,val,_,__,w,h,d,pitch,pins,conn in PARTS:
        x,y=schempos[ref]; sid=symbol_id(ref);name=names[ref]
        s+=f'(symbol (lib_id "BBN:{name}") (at {x} {y} 0) (unit 1) (in_bom yes) (on_board yes) (dnp no) (uuid "{sid}")'
        for key,value,py in [('Reference',ref,y-(9 if ref=='D2' else 6)),('Value',val,y+6),('Footprint','BBN:'+('Terminal_5mm' if conn else ('PTC_P5.08' if ref=='F1' else ('Axial_P15.24' if ref=='D1' else ('Resistor_P7.62' if ref=='R1' else 'LED_D5')))),y+8)]:
            s+=f'(property "{key}" {q(value)} (at {x} {py} 0) (effects (font (size 1.27 1.27)) {"(hide yes)" if key=="Footprint" else ""}))'
        for number,net in pins: s+=f'(pin "{number}" (uuid "{uid()}"))'
        s+=f'(instances (project "accessory" (path "/{root}" (reference "{ref}") (unit 1)))))'
        for number,net in pins:
            px=x-5.08 if number==1 else x+5.08
            endpoint=px-7.62 if number==1 else px+7.62
            s+=f'(wire (pts (xy {px} {y}) (xy {endpoint} {y})) (stroke (width 0) (type default)) (uuid "{uid()}"))'
            s+=f'(label "{net}" (at {endpoint} {y} {0 if number==1 else 180}) (effects (font (size 1.27 1.27)) (justify {"right" if number==1 else "left"} bottom)) (uuid "{uid()}"))'
    s+=f'(text "5V_IN → F1 resettable PTC → D1 Schottky → ACCESSORY_5V\\nR1 + D2 indicate protected output present. Fan connects at J2.\\nNo GPIO fan control; no SBC or display power; no mains." (at 35 145 0) (effects (font (size 1.5 1.5)) (justify left)) (uuid "{uid()}"))'
    return s+')\n'

if __name__ == '__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'accessory.kicad_pcb').write_text(board())
    (OUT/'accessory.kicad_sch').write_text(schematic())
    (OUT/'BBN.kicad_sym').write_text('(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")'+''.join(symbol_definition(n,p).replace('BBN:'+n,n,1) for n,p in {'Terminal':['+','-'],'Fuse':['IN','OUT'],'Schottky':['A','K'],'Resistor':['1','2'],'LED':['A','K']}.items())+')\n')
    (OUT/'sym-lib-table').write_text('(sym_lib_table (version 7) (lib (name "BBN") (type "KiCad") (uri "${KIPRJMOD}/BBN.kicad_sym") (options "") (descr "Project-owned accessory symbols")))\n')
    library=OUT/'BBN.pretty'
    library.mkdir(exist_ok=True)
    for part in PARTS:
        text=footprint(part)
        name=text.split('\"')[1].split(':')[1]
        text=text.replace('BBN:'+name,name,1)
        (library/(name+'.kicad_mod')).write_text(text+'\n')
    (library/'MountingHole_3.2mm.kicad_mod').write_text('(footprint "MountingHole_3.2mm" (layer "F.Cu") (attr board_only exclude_from_pos_files exclude_from_bom)'+prop('Reference','H')+prop('Value','M3 clearance')+'(fp_rect (start -3 -3) (end 3 3) (stroke (width 0.05) (type default)) (layer "F.CrtYd"))(pad "" np_thru_hole circle (at 0 0) (size 3.2 3.2) (drill 3.2) (layers "*.Cu" "*.Mask")))\n')
    (OUT/'fp-lib-table').write_text('(fp_lib_table (version 7) (lib (name "BBN") (type "KiCad") (uri "${KIPRJMOD}/BBN.pretty") (options "") (descr "Project-owned through-hole footprints")))\n')
    project={'meta':{'filename':'accessory.kicad_pro','version':1},'board':{'design_settings':{'rules':{'min_clearance':0.25,'min_track_width':0.25,'min_hole_clearance':0.25,'min_through_hole_diameter':0.3,'min_copper_edge_clearance':0.5},'rule_severities':{'missing_courtyard':'warning','track_not_centered_on_via':'warning','footprint_type_mismatch':'warning'},'drc_exclusions':[]}},'net_settings':{'classes':[{'name':'Default','clearance':0.25,'track_width':1.0,'via_diameter':0.8,'via_drill':0.4}],'meta':{'version':4}},'erc':{'erc_exclusions':[]}}
    (OUT/'accessory.kicad_pro').write_text(json.dumps(project,indent=2)+'\n')
