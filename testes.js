import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
async function porta(){return new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
test('Serviços de clientes, produtos e pedidos: integração, histórico e isolamento de falhas',async()=>{
 const raiz=await mkdtemp(join(tmpdir(),'wagner-teste-'));
 const processos=[];
 const [c,p,o,g]=await Promise.all([porta(),porta(),porta(),porta()]);
 async function iniciar(arquivo,port,extra={}){
  const processo=spawn(process.execPath,[arquivo],{env:{...process.env,PORT:String(port),DATA_DIR:join(raiz,String(port)),...extra},stdio:['ignore','pipe','pipe'],windowsHide:true});
  processos.push(processo);let log='';processo.stderr.on('data',d=>log+=d);processo.stdout.on('data',()=>{});
  for(let i=0;i<100;i++){if(processo.exitCode!==null)throw new Error(log);try{const r=await fetch('http://127.0.0.1:'+port+'/health');if(r.ok || port===g)return processo;}catch{}await esperar(50);}
  throw new Error('Serviço não iniciou: '+arquivo+' '+log);
 }
 async function req(port,path,method='GET',body,headers={}){
  const r=await fetch('http://127.0.0.1:'+port+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  const text=await r.text();let data=text;try{data=JSON.parse(text);}catch{}
  return {status:r.status,data,headers:r.headers};
 }
 async function parar(child){if(child.exitCode===null && child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
 try{
  const clienteProcesso=await iniciar('api-simples/server.js',c);
  await iniciar('api-rest/server.js',p);
  await iniciar('api-restful/server.js',o,{CLIENTES_URL:'http://127.0.0.1:'+c,PRODUTOS_URL:'http://127.0.0.1:'+p});
  await iniciar('front-end/server.js',g,{CLIENTES_PORT:String(c),PRODUTOS_PORT:String(p),PEDIDOS_PORT:String(o)});
  assert.equal((await req(g,'/')).status,200);
  const cliente=(await req(c,'/criarCliente','POST',{nome:'Ana',email:'ana@example.com'})).data.cliente;
  assert.ok(cliente.id);
  const produtoR=await req(p,'/produtos','POST',{nome:'Livro',preco:29.90});
  assert.equal(produtoR.status,201);const produto=produtoR.data;
  assert.equal((await req(c,'/listarProdutos','POST')).status,404);
  assert.equal((await req(o,'/produtos')).status,404);
  const entrada=(await req(g,'/api/restful/')).data;
  const lista=(await req(g,entrada.links[0].href)).data;
  const acao=lista.acoes[0];
  const criado=await req(g,acao.href,acao.metodo,{clienteId:cliente.id,produtoId:produto.id,quantidade:3});
  assert.equal(criado.status,201);assert.equal(criado.data.total,89.70);
  assert.ok(criado.headers.get('location').startsWith('/api/restful/pedidos/'));
  const pedido=criado.data;
  assert.equal((await req(o,'/pedidos','POST',{clienteId:cliente.id,produtoId:produto.id,quantidade:0})).status,400);
  assert.equal((await req(o,'/pedidos','POST',{clienteId:'inexistente',produtoId:produto.id,quantidade:1})).status,422);
  assert.equal((await req(o,'/pedidos','POST',{}, {'Content-Type':'text/plain'})).status,415);
  await req(p,'/produtos/'+produto.id,'PUT',{nome:'Livro novo',preco:50});
  assert.equal((await req(o,'/pedidos/'+pedido.id)).data.total,89.70);
  await req(p,'/produtos/'+produto.id,'DELETE');
  assert.equal((await req(o,'/pedidos/'+pedido.id)).data.produto.nome,'Livro');
  const cancelado=await req(g,pedido.acoes[0].href,pedido.acoes[0].metodo,{status:'cancelado'});
  assert.equal(cancelado.status,200);assert.deepEqual(cancelado.data.acoes,[]);
  assert.equal((await req(o,'/pedidos/'+pedido.id,'PUT',{status:'aberto'})).status,400);
  await parar(clienteProcesso);
  assert.equal((await req(p,'/produtos')).status,200);
  assert.equal((await req(o,'/pedidos')).status,200);
  assert.equal((await req(g,'/api/simples/listarClientes','POST')).status,502);
  assert.equal((await req(o,'/pedidos','POST',{clienteId:cliente.id,produtoId:produto.id,quantidade:1})).status,503);
  assert.equal((await req(o,'/pedidos')).data.dados.length,1);
 }finally{
  for(const child of processos)await parar(child);
  await rm(raiz,{recursive:true,force:true});
 }
});
