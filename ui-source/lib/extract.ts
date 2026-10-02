import {MAX_FILE_BYTES,wordCount,withinTextLimits} from '@/backend/input';
export {MAX_FILE_BYTES};
type PdfTextItem={str:string;hasEOL?:boolean;width?:number;transform?:number[]};
function pdfText(items:unknown[]){
 const rows:{y:number;items:{x:number;text:string;width:number}[]}[]=[];
 for(const raw of items){const item=raw as Partial<PdfTextItem>;if(typeof item.str!=='string'||!item.str)continue;const transform=Array.isArray(item.transform)?item.transform:[],x=Number(transform[4]??0),y=Number(transform[5]??0),width=Number(item.width??0);let row=rows.find(r=>Math.abs(r.y-y)<3);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x,text:item.str,width});}
 rows.sort((a,b)=>b.y-a.y);
 return rows.map(row=>{row.items.sort((a,b)=>a.x-b.x);let line='',prev:{x:number;text:string;width:number}|null=null;for(const item of row.items){const clean=item.text.replace(/\s+/g,' ').trim();if(!clean)continue;if(!prev){line+=clean;prev=item;continue;}const gap=item.x-(prev.x+prev.width),prevLast=clean?prev.text.trim().slice(-1):'',nextFirst=clean[0]||'',avgWidth=(prev.width/Math.max(prev.text.trim().length,1)+item.width/Math.max(clean.length,1))/2;const sameWord=gap<Math.max(1.2,avgWidth*.45)&&/[A-Za-z]/.test(prevLast)&&/[a-z]/.test(nextFirst);line+=sameWord?clean:' '+clean;prev=item;}return line.replace(/([A-Za-z])-\\s+([A-Za-z])/g,'$1$2');}).join('\\n');
}
function normalizeExtracted(text:string){
 return text.replace(/[ \\t]+/g,' ').replace(/\\n{3,}/g,'\\n\\n').replace(/([A-Za-z])-\\s*\\n\\s*([A-Za-z])/g,'$1$2').trim();
}
async function ocrPage(page:{getViewport:(options:{scale:number})=>{width:number;height:number};render:(options:{canvasContext:CanvasRenderingContext2D;viewport:{width:number;height:number}})=>{promise:Promise<unknown>}}){
 const Detector=(globalThis as unknown as {TextDetector?:new()=>{detect:(source:CanvasImageSource)=>Promise<{rawValue?:string}[]>}}).TextDetector;
 if(!Detector)return '';
 const viewport=page.getViewport({scale:2});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 const context=canvas.getContext('2d');if(!context)return '';
 await page.render({canvasContext:context,viewport}).promise;
 const detected=await new Detector().detect(canvas);canvas.width=0;canvas.height=0;
 return detected.map(item=>item.rawValue||'').filter(Boolean).join('\n');
}
export async function extract(file:File):Promise<string>{
 if(file.size>MAX_FILE_BYTES)throw new Error('The file exceeds 10 MB. Choose a file of 10 MB or less.');
 const ext=file.name.split('.').pop()?.toLowerCase();let text='';
 if(ext==='txt'||ext==='md'){text=await file.text();}
 else if(ext==='docx'){const mammoth=await import('mammoth');text=(await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;}
 else if(ext==='pdf'){
 const pdf=await import('pdfjs-dist');pdf.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
 const task=pdf.getDocument({data:await file.arrayBuffer()});
 try{const doc=await task.promise;let extractedWords=0,ocrWords=0;for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);const content=await p.getTextContent();let pageText=pdfText(content.items);if(wordCount(pageText)<3){const ocrText=await ocrPage(p as never);if(wordCount(ocrText)>wordCount(pageText)){pageText=ocrText;ocrWords+=wordCount(ocrText);}}pageText=normalizeExtracted(pageText);text+=(i>1?'\n\n':'')+pageText;extractedWords+=wordCount(pageText);p.cleanup();if(extractedWords>50000||text.length>MAX_FILE_BYTES)throw new Error('The extracted text exceeds 50,000 words or 10 MB. Split the document into smaller parts.');}if(!extractedWords&&doc.numPages>0)throw new Error('No readable PDF text found. This looks like a scanned PDF, and local OCR is not available in this browser. Use Chrome/Edge with local TextDetector support or convert the scan to text before uploading.');if(ocrWords)text='[OCR text extracted locally from scanned PDF pages]\\n\\n'+text;}finally{await task.destroy();}
 }else throw new Error('Supported formats: Word (.docx), PDF, TXT and MD. Save older .doc files as .docx first.');
 text=normalizeExtracted(text);if(!text.trim())throw new Error('No readable text found. Scanned PDFs need local OCR or conversion before uploading.');
 if(!withinTextLimits(text))throw new Error('The extracted text exceeds 50,000 words or 10 MB. Split the document into smaller parts.');return text;
}
