import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyze,LIMITS,tokenize} from './engine.ts';
import {automaticAnalysis} from './automatic.ts';
import type {WebSource} from './web.ts';
import {hashText,validText} from './contracts.ts';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||8787);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be 1024–65535.');
const listenHost=process.env.HOST||'127.0.0.1';
await mkdir(resolve(root,'data'),{recursive:true});
const db=new DatabaseSync(process.env.VERITAS_DB_PATH||resolve(root,'data/corpus.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS reference_sources (id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, words INTEGER NOT NULL, created TEXT NOT NULL)');
db.exec('CREATE TABLE IF NOT EXISTS web_sources (id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL,content TEXT NOT NULL,retrieved TEXT NOT NULL)');
const mime:Record<string,string>={'.wasm':'application/wasm','.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.zip':'application/zip','.json':'application/json'};
const server=createServer(async(req,res)=>{const host=req.headers.host||`localhost:${port}`;
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 const send=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{const url=new URL(req.url||'/',`http://${host}`);let body:Record<string,unknown>={};if(req.method==='POST'||req.method==='DELETE'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>64*1024*1024){send(413,{error:'Request too large.'});return;}}try{body=JSON.parse(raw);}catch{send(400,{error:'Invalid JSON.'});return;}}
 if(url.pathname==='/api/sources'){
 if(req.method==='GET'){send(200,{sources:db.prepare('SELECT id,name,words,created,length(content) AS characters FROM reference_sources ORDER BY created DESC').all(),limits:LIMITS});return;}
 if(req.method==='DELETE'){if(typeof body.id!=='string'){send(400,{error:'Source ID required.'});return;}db.prepare('DELETE FROM reference_sources WHERE id=?').run(body.id);send(200,{deleted:true});return;}
 if(req.method==='POST'){if(typeof body.name!=='string'||!body.name.trim()||body.name.length>200||!validText(body.text,LIMITS.sourceChars)){send(400,{error:'Supply a title and 8+ words; maximum 50,000 words and 10 MB of text.'});return;}const text=body.text as string,hash=await hashText(text);if(db.prepare('SELECT id FROM reference_sources WHERE hash=?').get(hash)){send(409,{error:'This reference is already in your collection.'});return;}const id=crypto.randomUUID();const result=db.prepare('INSERT INTO reference_sources (id,name,content,hash,words,created) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM reference_sources) < ? AND (SELECT COALESCE(SUM(length(content)),0) FROM reference_sources) + ? <= ?').run(id,body.name.trim(),text,hash,tokenize(text).length,new Date().toISOString(),LIMITS.sourceCount,text.length,LIMITS.totalChars);if(!result.changes){send(409,{error:'Reference collection capacity reached.'});return;}send(201,{id});return;}}
 if(url.pathname==='/api/analyze'&&req.method==='POST'){if(!validText(body.text,LIMITS.documentChars,20)){send(400,{error:'Enter 20+ words, up to 50,000 words and 10 MB of text.'});return;}const cached=db.prepare('SELECT id,name,url,content AS text,retrieved FROM web_sources ORDER BY retrieved DESC LIMIT 12').all() as WebSource[];const fetcher:typeof fetch=process.env.VERITAS_OFFLINE==='1'?async()=>{throw new Error('Offline mode');}:fetch;const result=await automaticAnalysis(body.text as string,cached,{excludeQuotes:body.excludeQuotes===true,excludeReferences:body.excludeReferences===true},fetcher);for(const source of result.freshSources)db.prepare('INSERT OR REPLACE INTO web_sources (id,name,url,content,retrieved) VALUES (?,?,?,?,?)').run(source.id,source.name,source.url,source.text,source.retrieved);db.exec('DELETE FROM web_sources WHERE id NOT IN (SELECT id FROM web_sources ORDER BY retrieved DESC LIMIT 12)');const {freshSources,...report}=result;send(200,report);return;}
 if(url.pathname.startsWith('/api/')){send(405,{error:'Unsupported route or method.'});return;}
 if(req.method!=='GET'){send(405,{error:'Method not allowed.'});return;}
 const publicRoot=resolve(root,'web');const assetPath=resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));const rel=relative(publicRoot,assetPath);if(rel.startsWith('..')||isAbsolute(rel)){send(403,{error:'Forbidden'});return;}try{const bytes=await readFile(assetPath);res.writeHead(200,{'Content-Type':mime[extname(assetPath)]||'application/octet-stream'});res.end(bytes);}catch{send(404,{error:'Not found.'});}
 }catch{send(500,{error:'The local backend could not complete this request.'});}});
server.listen(port,listenHost,()=>console.log(`Veritas is ready at http://${listenHost==='0.0.0.0'?'localhost':listenHost}:${port}. Press Ctrl+C to stop.`));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
