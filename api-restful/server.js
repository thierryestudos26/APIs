import { fileURLToPath } from 'node:url';
import { criarAplicacao, criarRepositorio, iniciar } from '../compartilhado/base.js';
const app=criarAplicacao('Pedidos — API RESTful');
const repo=criarRepositorio(fileURLToPath(new URL('./dados/pedidos.json',import.meta.url)));
const clientesURL=process.env.CLIENTES_URL || 'http://127.0.0.1:3001';
const produtosURL=process.env.PRODUTOS_URL || 'http://127.0.0.1:3002';
const link=(rel,href,metodo='GET')=>({rel,href,metodo});
const campos=[
 {nome:'clienteId',tipo:'string',obrigatorio:true},
 {nome:'produtoId',tipo:'string',obrigatorio:true},
 {nome:'quantidade',tipo:'number',obrigatorio:true,minimo:1,maximo:1000}
];
function representar(p) {
 return {...p,links:[link('self','/pedidos/'+p.id),link('collection','/pedidos')],
 acoes:p.status==='aberto' ? [{...link('cancelar','/pedidos/'+p.id,'PUT'),tipoConteudo:'application/json',campos:[{nome:'status',tipo:'string',obrigatorio:true,valor:'cancelado'}]}] : []};
}
function responder(res,status,dados) {
 res.set('Link','</perfil>; rel="profile"');
 return res.status(status).json(dados);
}
const falhar=(res,status,mensagem)=>responder(res,status,{erro:mensagem,links:[link('collection','/pedidos')]});
app.get('/perfil',(req,res)=>res.json({
 nome:'Perfil de pedidos',formato:'application/json',
 processamento:'links são navegação; acoes são operações disponíveis no estado atual. Use href e metodo. Para o corpo use tipoConteudo e campos: nome, tipo, obrigatorio, limites e valor fixo quando presente.',
 relacoes:{self:'Este recurso',collection:'Coleção de pedidos',criar:'Registrar pedido',cancelar:'Cancelar pedido aberto'},
 estados:{aberto:'Permite cancelar',cancelado:'Estado final'},
 historico:'Cliente, produto e preço são cópias históricas obtidas por HTTP no momento do pedido. Alterações posteriores nos cadastros não alteram pedidos.'
}));
app.get('/',(req,res)=>responder(res,200,{nome:'Pedidos',links:[link('collection','/pedidos')]}));
app.get('/pedidos',(req,res)=>{
 res.set('Cache-Control','private, no-cache');
 responder(res,200,{dados:repo.listar().map(representar),links:[link('self','/pedidos')],acoes:[{...link('criar','/pedidos','POST'),tipoConteudo:'application/json',campos}]});
});
app.get('/pedidos/:id',(req,res)=>{
 const p=repo.buscar(req.params.id);
 if(!p) return falhar(res,404,'Pedido não encontrado.');
 res.set('Cache-Control','private, no-cache'); responder(res,200,representar(p));
});
app.use((req,res,next)=>{
 if(['POST','PUT'].includes(req.method) && !req.is('application/json')) return falhar(res,415,'Envie application/json.');
 next();
});
app.post('/pedidos',async(req,res)=>{
 const {clienteId,produtoId,quantidade}=req.body || {};
 if(typeof clienteId!=='string' || !clienteId || typeof produtoId!=='string' || !produtoId || !Number.isInteger(quantidade) || quantidade<1 || quantidade>1000) return falhar(res,400,'Informe cliente, produto e quantidade inteira de 1 a 1000.');
 let cliente,produto;
 try {
  const [c,p]=await Promise.all([
   fetch(clientesURL+'/buscarCliente',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:clienteId}),signal:AbortSignal.timeout(3000)}),
   fetch(produtosURL+'/produtos/'+encodeURIComponent(produtoId),{signal:AbortSignal.timeout(3000)})
  ]);
  if(c.status>=500 || p.status>=500) throw new Error('Dependência indisponível');
  if(!c.ok || !p.ok || !c.headers.get('content-type')?.includes('application/json')) return falhar(res,422,'Cliente ou produto não encontrado.');
  cliente=await c.json(); produto=await p.json();
  if(!cliente.id || !produto.id || !Number.isFinite(produto.preco)) throw new Error('Resposta inválida');
 } catch { return falhar(res,503,'Clientes ou produtos indisponíveis. Nenhum pedido foi criado.'); }
 const centavos=Math.round(produto.preco*100);
 if(!Number.isSafeInteger(centavos*quantidade)) return falhar(res,422,'Valor do pedido acima do limite.');
 const pedido=repo.criar({cliente:{id:cliente.id,nome:cliente.nome,email:cliente.email},produto:{id:produto.id,nome:produto.nome,preco:centavos/100},quantidade,total:centavos*quantidade/100,status:'aberto',criadoEm:new Date().toISOString()});
 res.location('/pedidos/'+pedido.id); responder(res,201,representar(pedido));
});
app.put('/pedidos/:id',(req,res)=>{
 const p=repo.buscar(req.params.id);
 if(!p) return falhar(res,404,'Pedido não encontrado.');
 if(req.body?.status!=='cancelado' || Object.keys(req.body).some(k=>k!=='status')) return falhar(res,400,'Envie somente status: cancelado.');
 const {id,...dados}=p;
 responder(res,200,representar(repo.atualizar(id,{...dados,status:'cancelado'})));
});
for(const [rota,metodos] of [['/pedidos','GET, HEAD, POST, OPTIONS'],['/pedidos/:id','GET, HEAD, PUT, OPTIONS']]) {
 app.all(rota,(req,res)=>{
  res.set('Allow',metodos);
  return req.method==='OPTIONS' ? res.status(204).end() : falhar(res,405,'Método não permitido.');
 });
}
iniciar(app,Number(process.env.PORT || 3003));
