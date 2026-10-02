/// <reference lib="webworker" />
import {emptySemantic,type SemanticMatch,type SemanticResult} from '../backend/semantic-types';
import {tokenize} from '../backend/engine';

type Source={id:string;name:string;url:string;retrieved:string;text?:string};
type Passage={text:string;start:number;end:number;words:number;source?:Source};
const MODEL='Xenova/paraphrase-multilingual-MiniLM-L12-v2';

function passages(text:string,max=80):Passage[]{
 const sentences=Array.from(text.matchAll(/[^.!?\n]+(?:[.!?]+|$)/g),m=>({text:m[0].trim(),start:m.index!,end:m.index!+m[0].length,words:tokenize(m[0]).length})).filter(s=>s.words>=10);
 const chunks:Passage[]=[];let current:Passage|null=null;
 for(const s of sentences){if(!current)current={...s};else if(current.words+s.words<=95){current.text+=' '+s.text;current.end=s.end;current.words+=s.words;}else{chunks.push(current);current={...s};}}
 if(current)chunks.push(current);
 if(chunks.length<=max)return chunks;
 const scored=chunks.map((p,i)=>({p,i,score:new Set(tokenize(p.text).map(t=>t.value).filter(v=>v.length>4)).size+p.words/20}));
 const anchors=[0,Math.floor(chunks.length*.25),Math.floor(chunks.length*.5),Math.floor(chunks.length*.75),chunks.length-1].filter((v,i,a)=>v>=0&&a.indexOf(v)===i).map(i=>({p:chunks[i],i,score:999}));
 return [...new Map([...anchors,...scored.sort((a,b)=>b.score-a.score)].map(x=>[x.i,x.p])).values()].slice(0,max).sort((a,b)=>a.start-b.start);
}
function sourcePassages(sources:Source[],maxTotal=180){
 const result:Passage[]=[];
 for(const source of sources){if(!source.text)continue;for(const p of passages(source.text,32))result.push({...p,source});}
 return result.slice(0,maxTotal);
}
function dot(a:number[],b:number[]){let n=0;for(let i=0;i<Math.min(a.length,b.length);i++)n+=a[i]*b[i];return n;}
async function vectors(extractor:(input:string[],options:{pooling:string;normalize:boolean})=>Promise<{tolist:()=>number[][]}>,items:Passage[],progress:(done:number,total:number)=>void){
 const out:number[][]=[];for(let i=0;i<items.length;i+=8){const batch=items.slice(i,i+8);const tensor=await extractor(batch.map(p=>p.text),{pooling:'mean',normalize:true});out.push(...tensor.tolist());progress(Math.min(items.length,i+batch.length),items.length);}return out;
}
async function run(text:string,sources:Source[],post:(message:string,result?:SemanticResult)=>void):Promise<SemanticResult>{
 const doc=passages(text,80),src=sourcePassages(sources);
 if(doc.length<1||src.length<1)return emptySemantic('No readable source passages were available for multilingual semantic comparison.','insufficient');
 const total=doc.length+src.length;let done=0;
 const {pipeline,env}=await import('@huggingface/transformers');env.allowLocalModels=false;env.useBrowserCache=true;if(env.backends.onnx.wasm){env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;env.backends.onnx.wasm.wasmPaths='/onnx/';}
 const extractor=await pipeline('feature-extraction',MODEL,{dtype:'q8',device:'wasm',progress_callback:(data:unknown)=>{const d=data as {progress?:number;file?:string};post(typeof d.progress==='number'?`Downloading multilingual semantic model: ${Math.round(d.progress)}% (${d.file||'model'})`:'Preparing multilingual semantic model…');}}) as unknown as (input:string[],options:{pooling:string;normalize:boolean})=>Promise<{tolist:()=>number[][]}>;
 const docVec=await vectors(extractor,doc,(n)=>{done=n;post(`Semantic plagiarism check: ${Math.round(done/total*100)}%`);});
 const srcVec=await vectors(extractor,src,(n)=>{done=doc.length+n;post(`Semantic plagiarism check: ${Math.round(done/total*100)}%`);});
 const matches:SemanticMatch[]=[];const covered=new Set<number>();
 for(let i=0;i<doc.length;i++){let best=-1,bestScore=0;for(let j=0;j<src.length;j++){const score=dot(docVec[i],srcVec[j]);if(score>bestScore){bestScore=score;best=j;}}if(best>=0&&bestScore>=.72){const source=src[best].source!;matches.push({start:doc[i].start,end:doc[i].end,sourceId:source.id,sourceName:source.name,sourceUrl:source.url,words:doc[i].words,similarity:Math.round(bestScore*1000)/10,text:doc[i].text,sourceText:src[best].text});for(let k=doc[i].start;k<doc[i].end;k++)covered.add(k);}}
 const score=matches.length?Math.round(matches.reduce((n,m)=>n+m.words,0)/Math.max(1,tokenize(text).length)*1000)/10:0;
 return {status:'complete',score,reason:matches.length?'Local multilingual embedding model found source passages with high semantic similarity. Treat these as review evidence, especially for translated or heavily rewritten text.':'Local multilingual embedding model did not find high-similarity translated or rewritten passages in the compared sources.',model:MODEL,checkedPassages:total,totalPassages:total,matches:matches.sort((a,b)=>b.similarity-a.similarity).slice(0,40)};
}
self.onmessage=async(event:MessageEvent<{text:string;sources:Source[]}>)=>{try{const result=await run(event.data.text,event.data.sources,(message,result)=>self.postMessage({type:'progress',message,result}));self.postMessage({type:'complete',result});}catch{self.postMessage({type:'complete',result:emptySemantic('The local multilingual semantic model could not load. Exact, near-word, and concept-term checks still ran.','unavailable')});}};
