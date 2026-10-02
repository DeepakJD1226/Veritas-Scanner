import {MAX_WORDS,MAX_FILE_BYTES,WORD_PATTERN,withinTextLimits} from './input.ts';
export type Token={value:string;start:number;end:number};
export type Source={id:string;name:string;text:string;kind?:string};
export type Match={start:number;end:number;sourceId:string;sourceStart:number;sourceEnd:number;words:number;kind:'exact'|'near';similarity:number;citationNearby:boolean;excerpt:string;excerptTruncated?:boolean};
export type PlagiarismEstimate={score:number;basis:'source_evidence'|'text_only';confidence:'high'|'medium'|'low';factors:string[]};
export const LIMITS={documentWords:MAX_WORDS,sourceWords:MAX_WORDS,documentChars:MAX_FILE_BYTES,sourceChars:MAX_FILE_BYTES,totalChars:1000000,sourceCount:100};
export function tokenize(text:string):Token[]{return Array.from(text.matchAll(new RegExp(WORD_PATTERN)),m=>({value:m[0].normalize('NFKC').replaceAll('’',"'").toLowerCase(),start:m.index!,end:m.index!+m[0].length}));}
const stop=new Set('a an the this that these those is are was were be been being to of and or in on at for by with as from it its we our they their he she his her but not can could will would should may might have has had do does did into than then also'.split(' '));
const synonyms=new Map<string,string>();
for(const group of [
 'analyse analyze examine review evaluate assess study inspect compare',
 'provide provides providing give gives giving offer offers offering supply supplies supplying',
 'access availability available reach use usage utilization utilisation',
 'popular common frequent high-demand demand',
 'underused unused low-use rarely-used overlooked',
 'resource resources material materials book books journal journals database databases collection collections',
 'student students learner learners pupil pupils',
 'education educational academic learning study studying',
 'institution institutions college colleges university universities school schools',
 'identify detect discover find notice reveal',
 'improve enhance strengthen increase raise support help',
 'decision decisions choice choices planning plan strategy',
 'dashboard report visualisation visualization chart charts',
 'department departments subject subjects course courses',
 'activity behaviour behavior pattern patterns trend trends',
 'monthly month-wise monthwise',
 'purchase purchasing buy buying acquisition acquire',
 'quiet calm silent peaceful',
 'digital online electronic web internet',
 'administrator administrators admin admins management managers',
 'faculty teacher teachers staff professor professors',
 'requirement requirements need needs necessary required',
 'crop crops plant plants agriculture agricultural farming farm farmer farmers',
 'disease diseases infection infections infected disorder disorders blight wilt mildew',
 'diagnosis diagnose diagnostic detect detection identify identification classify classification',
 'assistant assistants advisor advisory guidance recommendation recommendations suggestion suggestions',
 'regional local native vernacular language languages multilingual',
 'voice speech audio spoken',
 'image images visual vision photo photos picture pictures',
 'retrieval retrieve retrieved augmented augmentation rag',
 'adaptive iterative repeated recurring refinement refined',
 'treatment treatments remedy remedies control prevention management',
 'accurate accuracy precise precision reliable reliability robust',
 'content document documents writing text passage passages',
 'plagiarism plagiarised plagiarized copied copying duplicate duplicated overlap overlapping',
 'artificial ai generated automated machine model models'
]){const [root,...items]=group.split(' ');for(const item of [root,...items])synonyms.set(item,root);}
function stem(value:string){let v=value.normalize('NFKC').replaceAll('’',"'").toLowerCase();if(v.length>5&&v.endsWith('ies'))v=v.slice(0,-3)+'y';else if(v.length>6&&v.endsWith('ing'))v=v.slice(0,-3);else if(v.length>5&&v.endsWith('ed'))v=v.slice(0,-2);else if(v.length>4&&v.endsWith('es'))v=v.slice(0,-2);else if(v.length>4&&v.endsWith('s'))v=v.slice(0,-1);return synonyms.get(v)||v;}
function semanticValue(token:Token|string){return stem(typeof token==='string'?token:token.value);}
function distinctive(term:string){return term.length>=7||/\d/.test(term)||/[A-Z]/.test(term);}
function key(ts:Token[],i:number,n:number){return ts.slice(i,i+n).map(t=>t.value).join(' ');}
function citation(text:string,end:number){return /\[\d+(?:[,–\- ]\d+)*\]|\([^)]*(?:19|20)\d{2}[a-z]?[^)]*\)/.test(text.slice(Math.max(0,end-80),Math.min(text.length,end+100)));}
function segments(text:string,ts:Token[]){const result:{lo:number;hi:number}[]=[];let lo=0;for(let i=0;i<ts.length;i++){const boundary=i===ts.length-1||/[.!?\n]/.test(text.slice(ts[i].end,ts[i+1]?.start??text.length));if(boundary||i-lo>=59){if(i-lo+1>=10)result.push({lo,hi:i+1});lo=boundary?i+1:Math.max(lo+1,i-14);}}return result;}
function lcs(a:Token[],b:Token[]){const width=b.length+1,dp=new Uint16Array((a.length+1)*width);for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i*width+j]=a[i-1].value===b[j-1].value?dp[(i-1)*width+j-1]+1:Math.max(dp[(i-1)*width+j],dp[i*width+j-1]);let i=a.length,j=b.length;const aligned:number[]=[];while(i&&j){if(a[i-1].value===b[j-1].value){aligned.push(i-1);i--;j--;}else if(dp[(i-1)*width+j]>=dp[i*width+j-1])i--;else j--;}return aligned.reverse();}
function semanticLcs(a:Token[],b:Token[]){const av=a.map(semanticValue),bv=b.map(semanticValue),width=b.length+1,dp=new Uint16Array((a.length+1)*width);for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i*width+j]=av[i-1]===bv[j-1]?dp[(i-1)*width+j-1]+1:Math.max(dp[(i-1)*width+j],dp[i*width+j-1]);let i=a.length,j=b.length;const aligned:number[]=[];while(i&&j){if(av[i-1]===bv[j-1]){aligned.push(i-1);i--;j--;}else if(dp[(i-1)*width+j]>=dp[i*width+j-1])i--;else j--;}return aligned.reverse();}
function localPlagiarismEstimate(text:string,ts:Token[],repeated:{text:string;count:number}[],eligible:number,sources:number,similarity:number|null):PlagiarismEstimate{
 if(sources&&similarity!==null)return {score:similarity,basis:'source_evidence',confidence:'high',factors:['Score is based on exact and near word overlap with retrieved sources.']};
 const duplicate=new Set<number>(),seen=new Map<string,number[]>();for(let i=0;i+7<ts.length;i++){const k=key(ts,i,8),hits=seen.get(k)||[];if(hits.length){for(let j=i;j<i+8;j++)duplicate.add(j);for(const h of hits)for(let j=h;j<h+8;j++)duplicate.add(j);}hits.push(i);seen.set(k,hits);}
 const repeatWords=repeated.reduce((sum,r)=>sum+(tokenize(r.text).length*(r.count-1)),0),repeatRatio=eligible?repeatWords/eligible:0,dupRatio=eligible?duplicate.size/eligible:0;
 const longQuotes=(text.match(/"[^"\n]{120,}"|“[^”]{120,}”/g)||[]).length,citationCount=(text.match(/\[\d+(?:[,–\- ]\d+)*\]|\([^)]*(?:19|20)\d{2}[a-z]?[^)]*\)/g)||[]).length;
 const factors:string[]=[];if(dupRatio>.02)factors.push(`${Math.round(dupRatio*100)}% of words appear in repeated 8-word sequences inside the document.`);if(repeatRatio>.03)factors.push('Long repeated passages were found inside the document.');if(longQuotes&&!citationCount)factors.push('Long quoted-looking passages were found without citation-like markers.');if(!factors.length)factors.push('No strong internal copying pattern was found; outside-source coverage was unavailable.');
 const score=Math.round(Math.min(65,dupRatio*90+repeatRatio*70+Math.min(15,longQuotes*5)+(citationCount?0:3))*10)/10;
 return {score,basis:'text_only',confidence:'low',factors};
}
export function analyze(text:string,sources:Source[],options:{excludeQuotes?:boolean;excludeReferences?:boolean}={}){
 if(!withinTextLimits(text))throw new Error('Document exceeds 50,000 words or 10 MB of text.');const ts=tokenize(text);if(sources.length>LIMITS.sourceCount||sources.reduce((n,s)=>n+s.text.length,0)>LIMITS.totalChars)throw new Error('Reference collection exceeds capacity.');
 const excluded=new Set<number>(),quoteRanges=Array.from(text.matchAll(/"[^"\n]+"|“[^”]+”/g),m=>[m.index!,m.index!+m[0].length]);const bibliography=/(?:^|\n)\s*(?:references|bibliography|works cited)\s*:?\s*(?:\n|$)/i.exec(text)?.index;
 let quoteIndex=0;ts.forEach((t,i)=>{while(quoteIndex<quoteRanges.length&&quoteRanges[quoteIndex][1]<t.start)quoteIndex++;const q=quoteRanges[quoteIndex];if(options.excludeQuotes&&q&&t.start>=q[0]&&t.end<=q[1]||options.excludeReferences&&bibliography!==undefined&&t.start>=bibliography)excluded.add(i);});
 const exact=new Set<number>(),near=new Set<number>(),matches:Match[]=[];const coverage=new Int32Array(ts.length+1);
 type Chunk={source:Source;tokens:Token[];lo:number;hi:number;terms:Set<string>;semanticTerms:Set<string>};const chunks:Chunk[]=[],inverted=new Map<string,number[]>();
 let evidenceTruncated=false;function add(m:Match){if(matches.length<2000)matches.push({...m,excerpt:m.excerpt.slice(0,1200),excerptTruncated:m.excerpt.length>1200});else evidenceTruncated=true;}
 for(const source of sources){const other=tokenize(source.text);
 // Suffix automaton: all maximal exact substring matches, including overlaps.
 type State={next:Map<string,number>;link:number;len:number;end:number};
 const states:State[]=[{next:new Map(),link:-1,len:0,end:-1}];let last=0;
 for(let j=0;j<other.length;j++){const value=other[j].value,cur=states.length;states.push({next:new Map(),link:0,len:states[last].len+1,end:j});let p=last;while(p>=0&&!states[p].next.has(value)){states[p].next.set(value,cur);p=states[p].link;}if(p>=0){const q=states[p].next.get(value)!;if(states[p].len+1===states[q].len)states[cur].link=q;else{const clone=states.length;states.push({next:new Map(states[q].next),link:states[q].link,len:states[p].len+1,end:states[q].end});while(p>=0&&states[p].next.get(value)===q){states[p].next.set(value,clone);p=states[p].link;}states[q].link=clone;states[cur].link=clone;}}last=cur;}
 let state=0,length=0,pending:{lo:number;hi:number;sourceLo:number;sourceHi:number}|null=null;
 const flush=()=>{if(!pending)return;const {lo,hi,sourceLo,sourceHi}=pending;coverage[lo]++;coverage[hi]--;let included=false;for(let j=lo;j<hi;j++)if(!excluded.has(j)){included=true;break;}if(included)add({start:ts[lo].start,end:ts[hi-1].end,sourceId:source.id,sourceStart:other[sourceLo].start,sourceEnd:other[sourceHi-1].end,words:hi-lo,kind:'exact',similarity:100,citationNearby:citation(text,ts[hi-1].end),excerpt:source.text.slice(other[sourceLo].start,other[sourceHi-1].end)});pending=null;};
 for(let i=0;i<ts.length;i++){const value=ts[i].value;while(state&&!states[state].next.has(value)){state=states[state].link;length=states[state].len;}const next=states[state].next.get(value);if(next===undefined){state=0;length=0;}else{state=next;length++;}if(length<8){flush();continue;}const found={lo:i-length+1,hi:i+1,sourceLo:states[state].end-length+1,sourceHi:states[state].end+1};if(pending&&found.lo>pending.lo)flush();pending=found;}flush();
 for(const seg of segments(source.text,other)){const terms=new Set(other.slice(seg.lo,seg.hi).map(t=>t.value).filter(v=>v.length>2&&!stop.has(v))),semanticTerms=new Set(other.slice(seg.lo,seg.hi).map(semanticValue).filter(v=>v.length>2&&!stop.has(v)));const ci=chunks.length;chunks.push({source,tokens:other,...seg,terms,semanticTerms});for(const term of new Set([...terms,...semanticTerms])){const ids=inverted.get(term)||[];ids.push(ci);inverted.set(term,ids);}}
 }
 let active=0;for(let i=0;i<ts.length;i++){active+=coverage[i];if(active>0&&!excluded.has(i))exact.add(i);}
 let nearComparisons=0;
 for(const segment of segments(text,ts)){const q=ts.slice(segment.lo,segment.hi);if(q.every((_,i)=>exact.has(segment.lo+i)||excluded.has(segment.lo+i)))continue;const terms=new Set(q.map(t=>t.value).filter(v=>v.length>2&&!stop.has(v))),semanticTerms=new Set(q.map(semanticValue).filter(v=>v.length>2&&!stop.has(v)));const candidates=new Map<number,number>();for(const term of new Set([...terms,...semanticTerms])){const postings=inverted.get(term)||[];const weight=Math.log(1+(chunks.length+1)/(postings.length+1));for(const id of postings)candidates.set(id,(candidates.get(id)||0)+weight);}
 const ranked=[...candidates.entries()].sort((a,b)=>b[1]-a[1]).slice(0,16);for(const [id] of ranked){const chunk=chunks[id],s=chunk.tokens.slice(chunk.lo,chunk.hi);if(Math.min(q.length,s.length)/Math.max(q.length,s.length)<.45)continue;const exactOverlap=[...terms].filter(t=>chunk.terms.has(t)).length,semanticOverlap=[...semanticTerms].filter(t=>chunk.semanticTerms.has(t)).length,lexicalExact=2*exactOverlap/(terms.size+chunk.terms.size),lexicalSemantic=2*semanticOverlap/(semanticTerms.size+chunk.semanticTerms.size);if(semanticOverlap<6||lexicalSemantic<.44)continue;nearComparisons++;const alignment=lcs(q,s),semanticAlignment=semanticLcs(q,s);const sequence=2*alignment.length/(q.length+s.length),semanticSequence=2*semanticAlignment.length/(q.length+s.length);const sim=Math.max(.7*sequence+.3*lexicalExact,.58*semanticSequence+.42*lexicalSemantic);const technicalOverlap=[...semanticTerms].filter(t=>chunk.semanticTerms.has(t)&&distinctive(t)).length;const sequencePass=(sequence>=.64&&sim>=.68)||(semanticSequence>=.50&&lexicalSemantic>=.56&&sim>=.58);const conceptPass=semanticOverlap>=10&&technicalOverlap>=4&&lexicalSemantic>=.52&&semanticSequence>=.34&&sim>=.52;if(!sequencePass&&!conceptPass)continue;const aligned=semanticAlignment.length>alignment.length?semanticAlignment:alignment;const newWords=aligned.map(i=>segment.lo+i).filter(i=>!exact.has(i)&&!excluded.has(i));if(newWords.length<4)continue;newWords.forEach(i=>near.add(i));add({start:q[0].start,end:q[q.length-1].end,sourceId:chunk.source.id,sourceStart:s[0].start,sourceEnd:s[s.length-1].end,words:aligned.length,kind:'near',similarity:Math.round(Math.max(sim,conceptPass?0.58:0)*100),citationNearby:citation(text,q[q.length-1].end),excerpt:chunk.source.text.slice(s[0].start,s[s.length-1].end)});break;}
 }
 const eligible=ts.length-excluded.size;const percent=(count:number)=>sources.length&&eligible?Math.round(count/eligible*1000)/10:null;
 const repeats=new Map<string,number>();for(const s of segments(text,ts)){const k=key(ts,s.lo,s.hi-s.lo);repeats.set(k,(repeats.get(k)||0)+1);}
 const repeatList=[...repeats.entries()].filter(([,n])=>n>1).map(([text,count])=>({text,count})),similarity=percent(exact.size+near.size),plagiarismEstimate=localPlagiarismEstimate(text,ts,repeatList,eligible,sources.length,similarity);
 return {engine:'Veritas local engine 2.3',words:ts.length,eligibleWords:eligible,excludedWords:excluded.size,exactWords:exact.size,nearWords:near.size,matchedWords:exact.size+near.size,exactPercent:percent(exact.size),nearPercent:percent(near.size),similarity,plagiarismEstimate,sourceCount:sources.length,sourceCharacters:sources.reduce((n,s)=>n+s.text.length,0),nearComparisons,evidenceTruncated,matches:matches.sort((a,b)=>a.start-b.start),repeats:repeatList,ai:{status:'not_available',reason:'No locally trained and validated AI authorship classifier is installed. Writing style is not converted into an AI percentage.'},limitations:['Compared only with discovered or cached public sources.','Near matches include conservative semantic normalization and concept-term matching for rewritten technical passages, but translated plagiarism without shared names or technical terms can still be missed.','Quotation and bibliography exclusions are heuristic; check extraction and citations.','Near-match retrieval evaluates the top 16 lexical/semantic candidates per passage; this can miss candidates.','When no outside source is readable, the displayed plagiarism value is a low-confidence text-only risk estimate, not proof of plagiarism.','Scores are review measurements, not probabilities of misconduct.'],options};
}
