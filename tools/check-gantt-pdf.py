"""Check Chrome's actual PDFs, then render every page for visual review."""
import json, os, re, subprocess, sys
from pathlib import Path
import pdfplumber
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parent.parent
compact = '--compact' in sys.argv
stem = 'compact' if compact else 'step4'
layouts = json.loads((root / f'output/{stem}-print-layouts.json').read_text(encoding='utf-8'))
poppler = os.environ['PDFTOPPM']
out = root / f'output/{stem}-pdf-review'
out.mkdir(exist_ok=True)
normalize = lambda s: re.sub(r'\s+', '', s)
reports = []
for item in layouts:
    source = root / f"output/pdf/{'' if compact else 'step4-'}{item['name']}.pdf"
    expected_size = [297, 210] if item.get('paper') == 'A4' else [420, 297]
    expected_font = item.get('font', 9)
    names = {r['id']: r for r in item['rows']}
    with pdfplumber.open(source) as pdf:
        page_count = len(pdf.pages)
        assert len(pdf.pages) == len(item['parts']), (source, 'page count')
        min_font = 100
        for i, (page, part) in enumerate(zip(pdf.pages, item['parts'])):
            assert abs(page.width * 25.4 / 72 - expected_size[0]) < .4, (source, 'paper width')
            assert abs(page.height * 25.4 / 72 - expected_size[1]) < .4, (source, 'paper height')
            text = normalize(page.extract_text() or '')
            assert normalize('План строительных работ') in text
            assert normalize(f"Страница {i+1} из {len(pdf.pages)}") in text
            for key in part['ids'] + part['repeated']:
                assert normalize(names[key]['name']) in text, (source, i+1, names[key]['name'])
                if names[key]['archived']:
                    assert normalize('В АРХИВЕ') in text
            for control in ['Закрыть предпросмотр', 'Печатать / Сохранить PDF', 'Раскрыть всё перед печатью']:
                assert normalize(control) not in text
            for char in page.chars:
                if not char['text'].strip():
                    continue
                min_font = min(min_font, char['size'])
                assert char['size'] >= expected_font-.1, (source, i+1, char)
                assert char['x0'] >= 27 and char['x1'] <= page.width-27, (source, i+1, 'horizontal clipping', char)
                assert char['top'] >= 26 and char['bottom'] <= page.height-26, (source, i+1, 'vertical clipping', char)
            for shape in page.chars + page.rects + page.curves:
                color = shape.get('non_stroking_color')
                if isinstance(color, (tuple, list)) and len(color) == 3:
                    assert max(color)-min(color) < .005, (source, i+1, 'non-gray color', color)
        assert abs(min_font-expected_font)<.1, (source, 'selected font not applied')
        reports.append({'file':source.name, 'pages':len(pdf.pages),'format_mm':expected_size,'min_font_pt':round(min_font,2),'checks':'size, text, all rows and repeated context, margins, controls absent, grayscale'})
    prefix = out / item['name']
    for old in out.glob(item['name']+'-*.png'):
        suffix = old.stem.rsplit('-',1)[-1]
        if suffix.isdigit() or suffix == 'contact':
            old.unlink()
    subprocess.run([poppler, '-png', '-scale-to', '1800', str(source), str(prefix)], check=True, capture_output=True)
    pictures = [out / f"{item['name']}-{i:0{len(str(page_count))}d}.png" for i in range(1,page_count+1)]
    cols = 2
    contact = Image.new('RGB', (1000, ((len(pictures)+cols-1)//cols)*390), '#cfd4d0')
    draw = ImageDraw.Draw(contact)
    for i, picture in enumerate(pictures):
        with Image.open(picture) as img:
            thumb = ImageOps.contain(img.convert('RGB'), (490,355))
            x,y = (i%cols)*500,(i//cols)*390
            contact.paste(thumb,(x,y+25))
            draw.text((x+8,y+5), f"{item['name']} - page {i+1}", fill='black')
    contact.save(out / (item['name']+'-contact.png'))
(root / f'output/{stem}-pdf-checks.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(reports,ensure_ascii=False,indent=2))
