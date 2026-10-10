import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data', 'db.json');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const TYPES = new Set(['tap','reaction','guess','dodge']);
const defaults = [
 {id:'click-frenzy',name:'Click Frenzy',description:'How fast can you tap in 10 seconds?',type:'tap',duration:10,accent:'#a88bff',createdAt:'2026-10-09T00:00:00Z',plays:0,tokenInterest:false},
 {id:'lightning-reflex',name:'Lightning Reflex',description:'React the moment the signal turns green.',type:'reaction',duration:10,accent:'#4adeb9',createdAt:'2026-10-09T00:00:00Z',plays:0,tokenInterest:false},
 {id:'lucky-seven',name:'Lucky Seven',description:'Find the secret number from 1 to 10.',type:'guess',duration:10,accent:'#ffbd70',createdAt:'2026-10-09T00:00:00Z',plays:0,tokenInterest:false},
 {id:'meteor-dodge',name:'Meteor Dodge',description:'Move left and right to dodge falling meteors.',type:'dodge',duration:20,accent:'#ff779e',createdAt:'2026-10-09T00:00:00Z',plays:0,tokenInterest:false}
];
let db;let sequence=Promise.resolve();
async function init(){try{db=JSON.parse(await readFile(DATA,'utf8'));if(!Array.isArray(db.games)||!Array.isArray(db.scores)) throw Error('invalid DB')}catch(e){if(e.code && e.code !== 'ENOENT') throw e;db={games:defaults,scores:[]};await persist()}}
async function persist(){await mkdir(path.dirname(DATA),{recursive:true});const tmp=DATA+'.tmp';await writeFile(tmp,JSON.stringify(db,null,2));await rename(tmp,DATA)}
function serialized(fn){const work=sequence.then(fn);sequence=work.catch(()=>{});return work}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))}
async function body(req){let str='';for await (const chunk of req){str+=chunk;if(str.length>16000)throw Object.assign(Error('Request too large'),{status:413})}try{return JSON.parse(str)}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}}
function clean(s,max){return typeof s==='string'?s.trim().slice(0,max):''}
function slug(s){return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'new-game'}
function validate(input){const name=clean(input?.name,45),description=clean(input?.description,180),type=input?.type,duration=Number(input?.duration),accent=input?.accent;
 if(name.length<2)throw Object.assign(Error('Name must be at least 2 characters'),{status:400});
 if(!TYPES.has(type))throw Object.assign(Error('Invalid game type'),{status:400});
 if(!Number.isInteger(duration)||duration<5||duration>60)throw Object.assign(Error('Duration must be 5–60 seconds'),{status:400});
 return {name,description,type,duration,accent:typeof accent==='string'&&/^#[0-9a-fA-F]{6}$/.test(accent)?accent:'#a88bff',tokenInterest:input.tokenInterest===true}
}
function publicGame(game){const {id,name,description,type,duration,accent,tokenInterest,createdAt,plays}=game;return {id,name,description,type,duration,accent,tokenInterest,createdAt,plays}}
function rank(gameId){const scores=db.scores.filter(x=>x.gameId===gameId).sort((a,b)=>b.points-a.points||a.createdAt.localeCompare(b.createdAt));return scores.slice(0,15).map(({name,points,createdAt},i)=>({rank:i+1,name,points,createdAt}))}
function generate(prompt){const p=clean(prompt,600).toLowerCase();if(p.length<6)throw Object.assign(Error('Describe your game in more detail'),{status:400});
 const type=/dodge|meteor|avoid|falling|obstacle|surviv/.test(p)?'dodge':/reaction|reflex|quick|green|signal/.test(p)?'reaction':/guess|number|mystery|higher|lower|trivia/.test(p)?'guess':'tap';
 const words=clean(prompt,600).replace(/\s+/g,' ').split(' ').filter(Boolean).slice(0,5).join(' ');
 const title=/(space|meteor|alien)/.test(p)?'Cosmic Rush':/(cat|kitten)/.test(p)?'Cat Dash':/(coffee|cafe)/.test(p)?'Caffeine Rush':type==='reaction'?'Flash Reflex':type==='guess'?'Mystery Number':type==='dodge'?'Dodge Dash':'Tap Frenzy';
 return {...validate({name:title,description:`Inspired by your prompt: ${words}`,type,duration:type==='dodge'?30:15,accent:type==='dodge'?'#ff779e':'#a88bff'}),generation:'rule-based-template',notice:'This preview uses a template matcher, not an AI model. Connect an AI provider for original generated games.'}
}
function rateLimit(){const hits=new Map();return (req,res)=>{const ip=(req.socket.remoteAddress||'unknown');const now=Date.now(),v=hits.get(ip)||[];const filtered=v.filter(x=>x>now-60000);if(filtered.length>=90){json(res,429,{error:'Too many requests'});return false}filtered.push(now);hits.set(ip,filtered);if(hits.size>5000)hits.clear();return true}}const allow=rateLimit();
async function serve(res,file){const ext=path.extname(file),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};try{const bytes=await readFile(path.join(PUBLIC,file));res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"});res.end(bytes)}catch{json(res,404,{error:'Not found'})}}
export async function app(req,res){try{if(!allow(req,res))return;const url=new URL(req.url,'http://localhost');const pathname=url.pathname;
 if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,version:'0.2.0'});
 if(req.method==='GET'&&pathname==='/api/games')return json(res,200,{games:db.games.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(publicGame)});
 if(req.method==='POST'&&pathname==='/api/generate')return json(res,200,{game:generate((await body(req)).prompt)});
 if(req.method==='POST'&&pathname==='/api/games'){const valid=validate(await body(req));return await serialized(async()=>{let id=slug(valid.name);if(db.games.some(g=>g.id===id))id+='-'+randomUUID().slice(0,7);const game={id,...valid,createdAt:new Date().toISOString(),plays:0};db.games.push(game);await persist();json(res,201,{game:publicGame(game),url:`/g/${id}`})})}
 const match=pathname.match(/^\/api\/games\/([a-z0-9-]+)(?:\/(scores|play))?$/);
 if(match){const [,id,sub]=match;const game=db.games.find(g=>g.id===id);if(!game)return json(res,404,{error:'Game not found'});
 if(req.method==='GET'&&!sub)return json(res,200,{game:publicGame(game)});
 if(req.method==='GET'&&sub==='scores')return json(res,200,{scores:rank(id)});
 if(req.method==='POST'&&sub==='play')return await serialized(async()=>{game.plays++;await persist();json(res,200,{plays:game.plays})});
 if(req.method==='POST'&&sub==='scores'){const b=await body(req);const name=clean(b.name,22)||'Anonymous',points=Number(b.points);if(!Number.isInteger(points)||points<0||points>100000)return json(res,400,{error:'Invalid score'});return await serialized(async()=>{db.scores.push({gameId:id,name,points,createdAt:new Date().toISOString(),digest:createHash('sha256').update(name+id).digest('hex').slice(0,8)});if(db.scores.length>10000)db.scores=db.scores.slice(-10000);await persist();json(res,201,{scores:rank(id)})})}}
 if(req.method==='GET'&&(pathname==='/'||/^\/g\/[a-z0-9-]+$/.test(pathname)))return serve(res,'index.html');
 if(req.method==='GET'&&['/app.js','/style.css'].includes(pathname))return serve(res,pathname.slice(1));
 return json(res,404,{error:'Not found'});
 }catch(e){json(res,e.status||500,{error:e.status?e.message:'Server error'});if(!e.status)console.error(e)}}
await init();if(process.env.NODE_ENV!=='test'){http.createServer(app).listen(PORT,'0.0.0.0',()=>console.log(`Playground running at http://localhost:${PORT}`))}
