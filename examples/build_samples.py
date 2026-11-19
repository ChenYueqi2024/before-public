"""Generate a tiny synthetic site, fictional metadata, and a redacted sample report."""
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw
from PIL.TiffImagePlugin import IFDRational

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from before_public.scanner import load_rules, scan
from before_public.report import write_report


def main():
    site=ROOT/'examples/site';(site/'assets').mkdir(parents=True,exist_ok=True)
    (site/'index.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8">\n<meta name="author" content="Sample Private Person">\n<title>Synthetic fixture</title></head><body><p>Fictional test page only.</p>\n<a href="mailto:private@example.invalid">Contact</a></body></html>',encoding='utf-8')
    image=Image.new('RGB',(320,200),'#f7e5ae');draw=ImageDraw.Draw(image)
    draw.rectangle((95,35,225,165),fill='#8458ad');draw.text((105,93),'SAMPLE ONLY',fill='white')
    exif=Image.Exif();exif[34853]={1:'N',2:(IFDRational(1),IFDRational(2),IFDRational(3)),3:'E',4:(IFDRational(4),IFDRational(5),IFDRational(6))}
    image.save(site/'assets/old-photo.jpg',exif=exif)
    config=ROOT/'examples/privacy.example.json'
    report=scan(site,load_rules(config),config_path=config)
    docs=ROOT/'docs';write_report(report,docs)
    (docs/'report.html').replace(docs/'demo-report.html')
    (docs/'report.json').replace(docs/'demo-report.json')
    with zipfile.ZipFile(docs/'sample-site.zip','w',zipfile.ZIP_DEFLATED) as archive:
        archive.write(config,'privacy.example.json')
        for file in site.rglob('*'):
            if file.is_file():archive.write(file,file.relative_to(ROOT/'examples'))
    print(f"Synthetic sample: {len(report['findings'])} findings; {len(report['skipped'])} skipped.")


if __name__=='__main__':main()
