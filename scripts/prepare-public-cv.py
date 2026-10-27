"""Create a public-safe derivative; preserve the original CV unmodified.

Requires PyMuPDF. Run from the repository root. Review the rendered pages
whenever the source CV is replaced; do not assume these rules fit a new CV.
"""
from pathlib import Path
import re
import pymupdf

source = Path('Dexter Wen Jie Teo CV.pdf')
target = Path('public/cv/Dexter_Wen_Jie_Teo_CV.pdf')
pymupdf.TOOLS.set_small_glyph_heights(True)
document = pymupdf.open(source)
original = '\n'.join(page.get_text() for page in document)
private_numbers = re.findall(r'\+65\s*\d{4}\s*\d{4}', original)
if not private_numbers:
    raise RuntimeError('Expected mobile number was not found. Review the source CV manually.')

redactions = 0
for page in document:
    lines = [line for block in page.get_text('dict')['blocks'] if 'lines' in block for line in block['lines']]
    # Remove the contact-line separator with the phone number.
    for number in private_numbers:
        for rect in page.search_for(number):
            page.add_redact_annot(pymupdf.Rect(rect.x0 - 5, rect.y0, rect.x1 + 2, rect.y1), fill=(1, 1, 1))
            redactions += 1

    # The brief requires official verification before publishing this ranking.
    # Elective focuses are retained, as requested by the CV owner.
    for line in page.get_text('dict')['blocks']:
        if 'lines' not in line:
            continue
        for text_line in line['lines']:
            text = ''.join(span['text'] for span in text_line['spans'])
            if 'Ranked 4th' in text:
                rect = pymupdf.Rect(text_line['bbox'])
                page.add_redact_annot(pymupdf.Rect(65, rect.y0, 570, rect.y1), fill=(1, 1, 1))
                for candidate in lines:
                    candidate_text = ''.join(span['text'] for span in candidate['spans']).strip()
                    if candidate_text == '•' and abs(candidate['bbox'][1] - rect.y0) < 2:
                        page.add_redact_annot(pymupdf.Rect(candidate['bbox']), fill=(1, 1, 1))
                redactions += 1
    page.apply_redactions()
    # Remove hidden phone URI targets too, if present.
    for link in page.get_links():
        if link.get('uri', '').lower().startswith('tel:'):
            page.delete_link(link)

document.set_metadata({'title': 'Dexter Wen Jie Teo | Academic CV', 'author': 'Dexter Wen Jie Teo', 'subject': 'Public academic curriculum vitae'})
document.set_xml_metadata('')
target.parent.mkdir(parents=True, exist_ok=True)
document.save(target, garbage=4, deflate=True, clean=True)
document.close()

with pymupdf.open(target) as check:
    public_text = '\n'.join(page.get_text() for page in check)
    assert not any(number in public_text for number in private_numbers)
    assert 'Ranked 4th' not in public_text
    assert 'Elective Focus in Artificial Intelligence' in public_text
    assert 'Elective Focus in Cybersecurity' in public_text
    assert 'WTEO030@e.ntu.edu.sg' in public_text
    assert len(check) == 2
    render_dir = Path('tmp/pdfs')
    render_dir.mkdir(parents=True, exist_ok=True)
    for index, page in enumerate(check, 1):
        page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(render_dir / f'public-cv-{index}.png')
print(f'Prepared {target.as_posix()}; {redactions} redactions; 2 pages rendered for review.')
