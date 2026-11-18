import re, sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
names = {'map-pin':'MapPin','map-pin-plus':'MapPinPlus','route':'Route','footprints':'Footprints','bike':'Bike','car':'Car','grip-vertical':'GripVertical','crosshair':'Crosshair','locate-fixed':'LocateFixed','search':'Search','star':'Star','share-2':'Share2','copy':'Copy','ellipsis':'Ellipsis','undo-2':'Undo2','navigation':'Navigation','flag':'Flag','moon':'Moon','sun':'Sun','languages':'Languages','list-ordered':'ListOrdered','shell':'Shell','chevron-left':'ChevronLeft','x':'X','plus':'Plus','trash':'Trash'}
parts = []
for f, comp in sorted(names.items(), key=lambda kv: kv[1]):
    text = (src / f'{f}.svg').read_text()
    body = text[text.index('>', text.index('<svg')) + 1 : text.index('</svg>')]
    shapes = [s.strip() for s in re.findall(r'<(?:path|circle|rect|line|polyline|polygon|ellipse)[^>]*/>', body)]
    assert shapes, f
    for s in shapes:
        assert re.fullmatch(r'<\w+(\s+[a-z0-9]+="[^"]*")*\s*/>', s), s
    inner = '\n'.join('      ' + s for s in shapes)
    parts.append(f"export function {comp}(props: IconProps) {{\n  return (\n    <Icon {{...props}}>\n{inner}\n    </Icon>\n  );\n}}\n")
out.write_text('\n'.join(parts))
