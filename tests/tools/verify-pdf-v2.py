"""Read-only review of PDFs made by tests/browser/pdf-v2.cjs. Bundled Python deps."""
import json
from pathlib import Path
import re
import pdfplumber
from pypdf import PdfReader

root = Path(__file__).resolve().parents[2] / 'review-artifacts/feature-14'
normalize = lambda value: re.sub(r'\s+', ' ', value).strip()
for scenario in ['window', 'pvc-u', 'aluminium', 'full', 'exact', 'unresolved']:
    path = root / f'{scenario}.pdf'
    reader = PdfReader(path)
    manifest = json.loads((root / f'{scenario}.json').read_text(encoding='utf-8'))
    assert len(reader.pages) == manifest['pages'], scenario
    text = normalize(' '.join(page.extract_text() for page in reader.pages))
    for expected in manifest['money']:
        assert normalize(expected) in text, (scenario, expected, text)
    for expected in manifest['names']:
        assert normalize(expected) in text, (scenario, expected)
    assert not re.search(r'Округление|себестоимость|зарплат|наценк|tilt_turn|hardwareId|profileId|private-work|private-order|м²|,00\s*₽', text, re.I), scenario
    if scenario == 'unresolved':
        assert 'Цена отделки требует уточнения' in text
        assert 'Сумма заказа' not in text and manifest['final'] is None
    else:
        assert normalize(manifest['final']) in text
    if scenario == 'exact':
        assert '90 071 992 547 409,91 ₽' in text
        assert '90 071 992 547 409,89 ₽' in text
        assert '−0,02 ₽' in text
    if scenario == 'aluminium':
        assert 'Раздвижное' in text and 'ламинац' not in text.lower()
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            assert abs(page.width - 595.28) < .02 and abs(page.height - 841.89) < .02
            assert not page.images, (scenario, 'unexpected raster')
            assert page.chars, (scenario, 'blank page')
            # Include rotated dimension labels and footer; small tolerance for font bounds/stroke.
            for char in page.chars:
                assert 44 <= char['x0'] <= char['x1'] <= 551.5, (scenario, char)
                assert 40 <= char['top'] <= char['bottom'] <= 825, (scenario, char)
            for rect in page.rects:
                assert rect['width'] > 0 and rect['height'] > 0
                assert 44 <= rect['x0'] <= rect['x1'] <= 551.5, (scenario, rect)
                assert 44 <= rect['top'] <= rect['bottom'] <= 798, (scenario, rect)
    print(f'{scenario}: {len(reader.pages)} A4 pages, exact extracted money, embedded text, no images, all glyph/rectangle bounds verified')
