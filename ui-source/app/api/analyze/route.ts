import {corpusDb} from '@/db/corpus';
import {LIMITS} from '@/backend/engine';
import {readBody,validText} from '@/backend/contracts';
import {automaticAnalysis} from '@/backend/automatic';
import type {WebSource} from '@/backend/web';
export async function POST(req:Request){try{const body=await readBody(req);if(!validText(body.text,LIMITS.documentChars,20))return Response.json({error:'Use 20–50,000 words, up to 10 MB of text.'},{status:400});let cache:WebSource[]=[];try{cache=(await corpusDb().prepare('SELECT id,name,url,content AS text,retrieved FROM web_sources ORDER BY retrieved DESC LIMIT 12').all<WebSource>()).results;}catch{}
 const result=await automaticAnalysis(body.text,cache,{excludeQuotes:body.excludeQuotes===true,excludeReferences:body.excludeReferences===true});const {freshSources,...report}=result;
 if(freshSources.length){try{const db=corpusDb();await db.batch([...freshSources.map(s=>db.prepare('INSERT INTO web_sources (id,name,url,content,retrieved) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,content=excluded.content,retrieved=excluded.retrieved').bind(s.id,s.name,s.url,s.text,s.retrieved)),db.prepare('DELETE FROM web_sources WHERE id NOT IN (SELECT id FROM web_sources ORDER BY retrieved DESC LIMIT 12)')]);}catch{}}
 return Response.json(report,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'The check could not complete. No originality or authorship verdict was made.'},{status:503});}}
