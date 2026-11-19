"""Local document extraction for the skill; never prints source text or parser errors."""
import io
import json
import logging
import re
import subprocess
import zipfile
from pathlib import Path
from xml.etree import ElementTree


def extract(data, suffix):
    units, warnings = [], []
    def add(text, location):
        if text and text.strip():
            units.append((text, location))
            if sum(len(value) for value, _ in units) > 4*1024*1024:
                raise ValueError('Document text exceeds 4 MiB; split the document.')
    try:
        if suffix == '.docx':
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                entries=archive.infolist()
                if len(entries)>2000 or sum(item.file_size for item in entries)>32*1024*1024:
                    raise ValueError('DOCX expanded content exceeds limits; split the document.')
                if 'word/document.xml' not in archive.namelist():
                    raise ValueError('DOCX document body missing; unsupported or encrypted file.')
                for item in entries:
                    if re.match(r'word/(embeddings|afchunk|altChunk)', item.filename):
                        warnings.append('Embedded document objects not inspected; export and check separately.')
                    if not re.fullmatch(r'word/(document|header\d*|footer\d*|comments|footnotes|endnotes)\.xml|docProps/[^/]+\.xml', item.filename):
                        continue
                    xml=archive.read(item)
                    if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
                        raise ValueError('XML entity declarations are not supported.')
                    tree=ElementTree.fromstring(xml)
                    paragraphs=list(tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'))
                    text='\n'.join(''.join(p.itertext()) for p in paragraphs) if paragraphs else '\n'.join(tree.itertext())
                    if item.filename=='word/document.xml' and not text.strip():warnings.append('DOCX body has no extractable text; check manually or OCR first.')
                    add(text,'DOCX '+item.filename)
        elif suffix == '.doc':
            result=subprocess.run(['node',str(Path(__file__).with_name('doc-text.mjs'))],input=data,capture_output=True,timeout=30)
            if result.returncode:
                raise ValueError('DOC could not be parsed; encrypted, unsupported or corrupt. Try saving as DOCX.')
            for unit in json.loads(result.stdout):
                add(unit['text'],unit['location'])
        elif suffix == '.pdf':
            from pypdf import PdfReader
            logging.getLogger('pypdf').disabled=True
            pdf=PdfReader(io.BytesIO(data),strict=True)
            if pdf.is_encrypted:
                raise ValueError('Encrypted PDF not inspected; decrypt locally and retry.')
            if len(pdf.pages)>100:
                raise ValueError('PDF exceeds 100 pages; split the document.')
            for number,page in enumerate(pdf.pages,1):
                text=page.extract_text() or ''
                if not text.strip():warnings.append(f'PDF page {number} has no extractable text; check manually or OCR first.')
                add(text,f'PDF page {number}')
                for reference in page.get('/Annots',[]):
                    annotation=reference.get_object()
                    add('\n'.join(str(annotation.get(key,'')) for key in ['/Contents','/V','/T']),f'PDF page {number} annotations')
            if pdf.metadata:add('\n'.join(str(value) for value in pdf.metadata.values()),'PDF metadata')
            if pdf.attachments:warnings.append('PDF attachments not inspected; export and check separately.')
    except (ImportError,FileNotFoundError):
        return [],['Document dependency unavailable: install pypdf for PDF and Node.js 22+ for DOC.']
    except subprocess.TimeoutExpired:
        return [],['DOC extraction timed out; split or resave the document.']
    except ValueError as error:
        # Only messages authored in this module are safe to return.
        message=str(error)
        if message.startswith(('Document text exceeds','DOCX expanded','DOCX document body','XML entity declarations','DOC could not','Encrypted PDF','PDF exceeds')):
            return [],[message]
        return [],['Document parsing failed; resave or decrypt the document locally and retry.']
    except Exception:
        return [],['Document parsing failed; resave or decrypt the document locally and retry.']
    if not units:warnings.append('No text extracted; content was not checked. Try OCR or resaving locally.')
    return units,list(dict.fromkeys(warnings))
