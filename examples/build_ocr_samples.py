"""Raster fixtures contain fictional demonstration data, never real credentials."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from reportlab.pdfgen.canvas import Canvas
root=Path(__file__).resolve().parents[1]/'tests/fixtures/ocr';root.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',48)
lines=['虚构测试材料 / SYNTHETIC ONLY','姓名: 张三','身份证号: 11010519491231002X','手机号: 13800138000','API_KEY: sk-proj-'+('Ab12Cd34'*4),'PAT: ghp_'+('A1b2C3'*6),'private@example.invalid']
image=Image.new('RGB',(1800,900),'white');draw=ImageDraw.Draw(image)
for i,line in enumerate(lines):draw.text((65,45+115*i),line,font=font,fill='black')
image.save(root/'sensitive.png')
canvas=Canvas(str(root/'scanned.pdf'),pagesize=(900,450));canvas.setAuthor('Synthetic Fixture');canvas.drawImage(str(root/'sensitive.png'),0,0,width=900,height=450);canvas.showPage();canvas.save()
canvas=Canvas(str(root/'mixed.pdf'),pagesize=(900,500));canvas.setAuthor('Synthetic Fixture');canvas.drawString(30,475,'Public selectable header');canvas.drawImage(str(root/'sensitive.png'),0,0,width=900,height=450);canvas.showPage();canvas.save()
Image.new('RGB',(600,300),'white').save(root/'blank.png')
print('Fictional OCR fixtures generated: image, scanned PDF, mixed PDF, blank image.')
