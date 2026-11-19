"""Synthetic DOCX/PDF fixtures only. Requires python-docx, reportlab, pypdf."""
from pathlib import Path
from docx import Document
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from pypdf import PdfReader, PdfWriter

ROOT=Path(__file__).resolve().parents[1]/'tests/fixtures/documents'
ROOT.mkdir(parents=True,exist_ok=True)
doc=Document();doc.core_properties.author='Synthetic Fixture'
paragraph=doc.add_paragraph();paragraph.add_run('Private ');paragraph.add_run('Person').bold=True
doc.add_paragraph('虚构同学');doc.add_table(1,1).cell(0,0).text='private@example.invalid'
doc.sections[0].header.paragraphs[0].text='Header Private Person'
doc.core_properties.subject='Metadata Private Person'
doc.save(ROOT/'sample.docx')
clean=Document();clean.core_properties.author='Synthetic Fixture';clean.add_paragraph('Public example only.');clean.save(ROOT/'clean.docx')
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
canvas=Canvas(str(ROOT/'sample.pdf'));canvas.setAuthor('Synthetic Fixture');canvas.setTitle('Synthetic sample')
canvas.drawString(60,750,'Private Person');canvas.drawString(60,720,'private@example.invalid')
canvas.setFont('STSong-Light',12);canvas.drawString(60,690,'虚构同学');canvas.showPage();canvas.save()
canvas=Canvas(str(ROOT/'scan.pdf'));canvas.setAuthor('Synthetic Fixture');canvas.drawImage(str(ROOT.parent/'clean.png'),60,400,320,200);canvas.showPage();canvas.save()
writer=PdfWriter();writer.append(PdfReader(ROOT/'sample.pdf'));writer.encrypt('synthetic-password');writer.write(ROOT/'encrypted.pdf')
writer=PdfWriter();writer.append(PdfReader(ROOT/'sample.pdf'));writer.append(PdfReader(ROOT/'scan.pdf'));writer.write(ROOT/'mixed.pdf')
print('Synthetic DOCX, text/CJK PDF, image-only PDF and encrypted PDF generated.')
