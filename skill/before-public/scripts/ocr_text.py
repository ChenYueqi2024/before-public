"""Local OCR via a bounded Node subprocess; image bytes use stdin, never URLs."""
import io
import json
import subprocess
from pathlib import Path
from PIL import Image,ImageOps

def recognize(image,location):
    warnings=[]
    try:
        if image.width*image.height>12000000:raise ValueError('pixels')
        image=ImageOps.exif_transpose(image).convert('RGB')
        if max(image.size)>2400:
            image.thumbnail((2400,2400));warnings.append('OCR image was resized; small text may be missed.')
        buffer=io.BytesIO();image.save(buffer,format='PNG')
        result=subprocess.run(['node',str(Path(__file__).with_name('ocr-text.cjs'))],input=buffer.getvalue(),capture_output=True,timeout=90)
        if result.returncode:raise ValueError('engine')
        data=json.loads(result.stdout)
        if not data['text'].strip():warnings.append('OCR found no text; blank, blurred or unsupported content requires manual review.')
        elif data['low']:warnings.append('OCR confidence is low; characters may be missed or misread. Review the original image.')
        return [(data['text'],location)],warnings,[{'location':location,'confidence':data['confidence']}]
    except subprocess.TimeoutExpired:
        return [],['OCR exceeded 90 seconds; shrink or split the file and retry.'],[]
    except Exception:
        return [],['OCR failed, dependency/model missing, or image exceeds 12 megapixels; content not fully checked.'],[]

def image_units(data):
    try:
        with Image.open(io.BytesIO(data)) as image:
            units,warnings,checks=recognize(image,'Image OCR')
            if getattr(image,'n_frames',1)>1:warnings.append('Only the first image frame was OCR-checked; remaining frames need separate checks.')
            return units,warnings,checks
    except Exception:return [],['Image could not be decoded for OCR.'],[]

def pdf_units(data):
    units,warnings,checks=[],[],[]
    try:
        import pypdfium2 as pdfium
        with pdfium.PdfDocument(data) as pdf:
            for number in range(min(len(pdf),20)):
                try:
                    page=pdf[number]
                    try:
                        width,height=page.get_size();scale=min(2,2400/max(width,height))
                        if width<=0 or height<=0 or width*height*scale*scale>6000000:raise ValueError()
                        bitmap=page.render(scale=scale)
                        try:found,notes,quality=recognize(bitmap.to_pil(),f'PDF page {number+1} OCR')
                        finally:bitmap.close()
                        units.extend(found);checks.extend(quality);warnings.extend(f'PDF page {number+1}: '+note for note in notes)
                        if scale<2:warnings.append(f'PDF page {number+1}: OCR resolution reduced; small text may be missed.')
                    finally:page.close()
                except Exception:warnings.append(f'PDF page {number+1}: rendering/OCR failed; image text not checked.')
            if len(pdf)>20:warnings.append('OCR covered only the first 20 PDF pages; split the remaining pages and retry.')
    except Exception:warnings.append('PDF OCR unavailable, encrypted or failed; install local pypdfium2 and OCR dependencies.')
    return units,warnings,checks
