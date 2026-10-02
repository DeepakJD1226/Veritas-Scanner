import {wordCount} from './input.ts';
import {AI_MODEL,AI_REVISION,emptyAI,aiProbability,summaryScore,type AIResult} from './ai-types.ts';
let classifier:Promise<import('@huggingface/transformers').TextClassificationPipeline>|null=null;
function clamp01(value:number){return Math.max(.02,Math.min(.98,value));}
function localStyleEstimate(text:string,reason:string):AIResult{
 const words=(text.toLowerCase().match(/\b[\p{L}\p{N}'-]+\b/gu)||[]).filter(Boolean),wordTotal=words.length;
 if(wordTotal<40)return emptyAI('At least 40 words are needed for the local AI-style estimate.','insufficient');
 const sentences=text.split(/[.!?]+/).map(s=>s.trim()).filter(s=>s.split(/\s+/).length>=4);
 const sentenceLengths=sentences.map(s=>(s.match(/\b[\p{L}\p{N}'-]+\b/gu)||[]).length),avg=sentenceLengths.reduce((a,b)=>a+b,0)/Math.max(1,sentenceLengths.length);
 const variance=sentenceLengths.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(1,sentenceLengths.length),std=Math.sqrt(variance);
 const unique=new Set(words),lexicalDiversity=unique.size/wordTotal;
 const transitions=['moreover','furthermore','therefore','additionally','in conclusion','overall','consequently','it is important','it is essential','plays a crucial','significant role','increasingly used'];
 const lower=text.toLowerCase(),transitionHits=transitions.reduce((n,p)=>n+(lower.match(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))?.length||0),0);
 const contractions=(lower.match(/\b\w+'(?:t|re|ve|ll|d|m|s)\b/g)||[]).length,firstPerson=(lower.match(/\b(i|me|my|mine|we|our|ours|us)\b/g)||[]).length;
 const starters=new Map<string,number>();for(const sentence of sentences){const starter=(sentence.toLowerCase().match(/\b[\p{L}\p{N}'-]+\b/gu)||[]).slice(0,3).join(' ');if(starter)starters.set(starter,(starters.get(starter)||0)+1);}
 const repeatedStarters=[...starters.values()].filter(n=>n>1).reduce((a,b)=>a+b-1,0);
 let score=.22;
 score+=Math.max(0,1-Math.abs(avg-21)/18)*.12;
 score+=Math.max(0,1-std/14)*.10;
 score+=Math.max(0,.58-lexicalDiversity)*.48;
 score+=Math.min(.26,transitionHits/Math.max(1,wordTotal/120)*.075);
 score+=Math.min(.08,repeatedStarters/Math.max(1,sentences.length)*.28);
 score+=contractions===0?.035:Math.max(0,.025-contractions/wordTotal*2.5);
 score+=firstPerson===0?.05:Math.max(0,.018-firstPerson/wordTotal*1.7);
 if(transitionHits>=3&&firstPerson===0)score+=.08;
 if(wordTotal<120)score-=.06;
 const final=clamp01(score);
 const evidence=[
  avg>=14&&avg<=28?'sentence length sits in a common AI-like range':null,
  std<10?'sentence lengths are unusually even':null,
  lexicalDiversity<.58?'lexical diversity is low for the document length':null,
  transitionHits>=2?'formal transition phrases are repeated':null,
  repeatedStarters>0?'some sentence openings repeat':null,
  contractions===0?'no contractions were found':null,
  firstPerson===0?'few personal/context markers were found':null
 ].filter(Boolean).join('; ');
 const chunks=sentences.slice(0,8).map((sentence,i)=>({startToken:i,endToken:i+1,score:final,text:sentence}));
 return {status:'complete',score:final,reason:evidence?`${reason} Local evidence used: ${evidence}.`:reason,model:'Veritas local stylometric fallback',revision:'1.1',checkedTokens:wordTotal,totalTokens:wordTotal,chunks};
}
export async function assessAI(text:string,progress:(message:string,result?:AIResult)=>void=()=>{},localModel?:string):Promise<AIResult>{
 const words=wordCount(text);
 if(words<100)return localStyleEstimate(text,'Text is short for the pretrained AI model, so Veritas used a local stylometric fallback. This is a review signal, not proof of authorship.');
 const letters=text.match(/\p{L}/gu)||[],latin=text.match(/\p{Script=Latin}/gu)||[];if(letters.length&&latin.length/letters.length<.85)return emptyAI('This model is English-focused. Non-Latin text cannot be assessed reliably.','unsupported');
 let result=emptyAI('Loading the local AI model.','pending');
 try{const {pipeline,env}=await import('@huggingface/transformers');const browser=typeof window!=='undefined'||typeof WorkerGlobalScope!=='undefined';
 if(browser){env.allowLocalModels=false;env.useBrowserCache=true;if(env.backends.onnx.wasm){env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;env.backends.onnx.wasm.wasmPaths='/onnx/';}}
 if(localModel)env.allowRemoteModels=false;
 if(!classifier)classifier=pipeline<'text-classification'>('text-classification',localModel||AI_MODEL,{dtype:'q8',device:browser?'wasm':'cpu',revision:localModel?'main':AI_REVISION,progress_callback:(data:unknown)=>{const d=data as {status?:string;file?:string;progress?:number};progress(typeof d.progress==='number'?`Downloading AI model: ${Math.round(d.progress)}% (${d.file||'model'})`:'Preparing the local AI model…');}}) as Promise<import('@huggingface/transformers').TextClassificationPipeline>;
 const p=await classifier;const ids=p.tokenizer.encode(text,{add_special_tokens:false});result={...result,totalTokens:ids.length,status:'partial',reason:'AI analysis is in progress. This is not a final document result.'};
 for(let start=0;start<ids.length;start+=384){const end=Math.min(start+448,ids.length);const fragment=p.tokenizer.decode(ids.slice(start,end),{skip_special_tokens:true,clean_up_tokenization_spaces:false});const output=await p(fragment,{top_k:2});const score=aiProbability(output);result.chunks.push({startToken:start,endToken:end,score,text:fragment});result.checkedTokens=end;result.score=summaryScore(result.chunks);progress(`AI analysis: ${Math.round(end/ids.length*100)}% of model tokens checked`,{...result,chunks:[...result.chunks]});if(end===ids.length)break;}
 return {...result,status:'complete',reason:'Token-weighted mean AI-class score across overlapping passages. This is a model signal, not a measured percentage of AI-written words or proof of authorship. English-focused; false positives and false negatives are possible.'};
 }catch{classifier=null;return result.checkedTokens?{...result,status:'partial',reason:'AI analysis stopped before the full document was checked. The score covers only completed passages.'}:localStyleEstimate(text,'The pretrained AI model could not load in this browser, so Veritas used a local stylometric fallback. This gives a usable estimate without calling a detection API, but false positives and false negatives are possible.');}
}
