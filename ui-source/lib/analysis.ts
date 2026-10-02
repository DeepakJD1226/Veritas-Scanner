export type Source = { id: string; name: string; text: string; url?: string; kind: 'reference' | 'web' };
export type Match = { start: number; end: number; sourceId: string; sourceStart: number; sourceEnd: number; words: number };
export function tokenize(text: string) {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu), m => ({value:m[0].normalize('NFKC').toLowerCase(),start:m.index!,end:m.index!+m[0].length}));
}
export function compare(text: string, sources: Source[]) {
 const tokens=tokenize(text), covered=new Set<number>(), matches:Match[]=[];
 for(const source of sources) {
  const other=tokenize(source.text), index=new Map<string,number[]>();
  for(let i=0;i<=other.length-8;i++){const k=other.slice(i,i+8).map(t=>t.value).join(' ');const a=index.get(k)||[]; if(a.length<30)a.push(i);index.set(k,a);}
  for(let i=0;i<=tokens.length-8;i++){
   const k=tokens.slice(i,i+8).map(t=>t.value).join(' '), starts=index.get(k);if(!starts)continue;
   let best=8,bestJ=starts[0];for(const j of starts){let n=8;while(i+n<tokens.length&&j+n<other.length&&tokens[i+n].value===other[j+n].value)n++;if(n>best){best=n;bestJ=j;}}
   matches.push({start:tokens[i].start,end:tokens[i+best-1].end,sourceId:source.id,sourceStart:other[bestJ].start,sourceEnd:other[bestJ+best-1].end,words:best});
   for(let w=i;w<i+best;w++)covered.add(w);i+=best-1;
  }
 }
 return {words:tokens.length,matchedWords:covered.size,similarity:sources.length?Math.round(covered.size/Math.max(tokens.length,1)*1000)/10:null,matches:matches.sort((a,b)=>a.start-b.start)};
}
export function sentences(text:string){return Array.from(text.matchAll(/[^.!?\n]+(?:[.!?]+|$)/g),m=>m[0].trim()).filter(s=>tokenize(s).length>=8);}
export function repeatedSentences(text:string){const seen=new Map<string,number>();for(const s of sentences(text)){const k=tokenize(s).map(t=>t.value).join(' ');seen.set(k,(seen.get(k)||0)+1);}return [...seen.entries()].filter(([,n])=>n>1).map(([text,count])=>({text,count}));}
