const $ = id => document.getElementById(id);
const moeda = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const configuracao = {
  clientes: {
    titulo: 'Clientes · API Simples (RPC)',
    novo: 'Novo cliente',
    descricao: 'Cadastros de pessoas que compram na loja.'
  },
  produtos: {
    titulo: 'Produtos · API REST',
    novo: 'Novo produto',
    descricao: 'Catálogo e preços atuais.'
  },
  pedidos: {
    titulo: 'Pedidos · API RESTful (HATEOAS)',
    novo: 'Novo pedido',
    descricao: 'Histórico de vendas. Pedidos cancelados permanecem registrados.'
  }
};
let secao='clientes', editando=null, itens=[], criar=null, colecao=null, ocupado=false;
const historico=[];
function avisar(texto,erro=false){$('mensagem').textContent=texto;$('mensagem').classList.toggle('erro',erro);$('mensagem').hidden=false;}
async function executar(fn){
 if(ocupado)return; ocupado=true;$('controles').disabled=true;$('mensagem').hidden=true;
 try{await fn();}catch(e){avisar(e.message,true);}finally{ocupado=false;$('controles').disabled=false;}
}
async function chamar(url,metodo='GET',dados,tipo='application/json'){
 const destino=new URL(url,location.origin);
 if(destino.origin!==location.origin || !destino.pathname.startsWith('/api/')) throw new Error('Endereço de API inválido.');
 let r;
 try{r=await fetch(destino,{method:metodo,headers:dados===undefined?{}:{'Content-Type':tipo},body:dados===undefined?undefined:JSON.stringify(dados),signal:AbortSignal.timeout(8000)});}
 catch{throw new Error('Serviço indisponível. Verifique se os servidores estão em execução.');}
 const texto=await r.text();let corpo=texto;
 if(r.headers.get('content-type')?.includes('application/json')) corpo=texto?JSON.parse(texto):null;
 historico.unshift({metodo,url,status:r.status,location:r.headers.get('location'),resposta:corpo});historico.splice(10);
 $('resposta').textContent=historico.map(x=>JSON.stringify(x,null,2)).join('\n\n');
 if(!r.ok)throw new Error(corpo?.erro || 'Erro HTTP '+r.status);
 return corpo;
}
function campo(nome,titulo,tipo='text',opcoes){
 const label=document.createElement('label');label.htmlFor=nome;label.textContent=titulo;
 const input=document.createElement(opcoes?'select':'input');input.id=nome;input.name=nome;input.required=true;
 if(opcoes){const inicial=new Option('Selecione…','');input.add(inicial);for(const o of opcoes)input.add(new Option(o.nome,o.id));}
 else{input.type=tipo;if(tipo==='number'){input.min='0';input.step='0.01';}else input.maxLength=nome==='email'?254:100;}
 $('campos').append(label,input);return input;
}
function reset(){editando=null;$('formulario').reset();$('cancelar').hidden=true;$('titulo-formulario').textContent=configuracao[secao].novo;}
function botao(texto,fn,classe='secundario'){const b=document.createElement('button');b.type='button';b.textContent=texto;b.className=classe;b.onclick=fn;return b;}
function renderizar(){
 $('registros').replaceChildren();$('cabecalho-tabela').replaceChildren();
 const titulos=secao==='clientes'?['Nome','E-mail','Ações']:secao==='produtos'?['Produto','Preço','Ações']:['Cliente / produto','Total','Situação','Ações'];
 const tr=document.createElement('tr');for(const t of titulos){const th=document.createElement('th');th.scope='col';th.textContent=t;tr.append(th);}$('cabecalho-tabela').append(tr);
 $('quantidade').textContent=itens.length+' registros';$('vazio').hidden=itens.length>0;
 for(const item of itens){
  const linha=document.createElement('tr');
  const valores=secao==='clientes'?[item.nome,item.email]:secao==='produtos'?[item.nome,moeda.format(item.preco)]:[item.cliente.nome+' / '+item.quantidade+' × '+item.produto.nome,moeda.format(item.total),item.status];
  for(const valor of valores){const td=document.createElement('td');td.textContent=valor;linha.append(td);}
  const td=document.createElement('td');const acoes=document.createElement('div');acoes.className='acoes';
  if(secao==='pedidos'){
   for(const acao of item.acoes || []) if(acao.rel==='cancelar') acoes.append(botao('Cancelar',()=>{if(confirm('Cancelar este pedido?'))executar(async()=>{
    await enviarAcao(acao,{});await depois('Pedido cancelado.');
   });},'perigo'));
  }else{
   acoes.append(botao('Editar',()=>{editando=item;$('nome').value=item.nome;$(secao==='clientes'?'email':'preco').value=secao==='clientes'?item.email:item.preco;$('titulo-formulario').textContent='Editar cadastro';$('cancelar').hidden=false;$('nome').focus();}));
   acoes.append(botao('Excluir',()=>{if(confirm('Excluir este cadastro? O histórico dos pedidos será preservado.'))executar(async()=>{
    if(secao==='clientes'){const r=await chamar('/api/simples/excluirCliente','POST',{id:item.id});if(r!=='Cliente excluído.')throw new Error(String(r));}
    else await chamar('/api/rest/produtos/'+item.id,'DELETE');
    await depois('Cadastro excluído.');
   });},'perigo'));
  }
  td.append(acoes);linha.append(td);$('registros').append(linha);
 }
}
async function enviarAcao(acao,valores){
 if(!acao)throw new Error('Ação indisponível.');
 const corpo={};
 for(const c of acao.campos || []){
  let v=Object.hasOwn(c,'valor')?c.valor:valores[c.nome];
  if(c.tipo==='number')v=Number(v);
  if(c.obrigatorio && (v===undefined || v===''))throw new Error('Preencha '+c.nome+'.');
  if(c.tipo==='number' && (!Number.isFinite(v) || (c.minimo!==undefined && v<c.minimo) || (c.maximo!==undefined && v>c.maximo)))throw new Error('Valor inválido para '+c.nome+'.');
  corpo[c.nome]=v;
 }
 return chamar(acao.href,acao.metodo,corpo,acao.tipoConteudo);
}
async function listar(){
 itens=[];
 if(secao==='clientes')itens=await chamar('/api/simples/listarClientes','POST');
 else if(secao==='produtos')itens=await chamar('/api/rest/produtos');
 else{
  const entrada=await chamar('/api/restful/');
  colecao=entrada.links.find(x=>x.rel==='collection');
  const resposta=await chamar(colecao.href,colecao.metodo);itens=resposta.dados;criar=resposta.acoes.find(x=>x.rel==='criar');
 }
 renderizar();
}
async function carregar(){
 reset();$('salvar').disabled=true;$('campos').replaceChildren();itens=[];renderizar();
 $('titulo-lista').textContent=configuracao[secao].titulo;$('descricao').textContent=configuracao[secao].descricao;
 await listar();
 if(secao!=='pedidos'){campo('nome','Nome');campo(secao==='clientes'?'email':'preco',secao==='clientes'?'E-mail':'Preço (R$)',secao==='clientes'?'email':'number');}
 else{
  try{
   const [clientes,produtos]=await Promise.all([chamar('/api/simples/listarClientes','POST'),chamar('/api/rest/produtos')]);
   campo('clienteId','Cliente','text',clientes);campo('produtoId','Produto','text',produtos.map(p=>({...p,nome:p.nome+' — '+moeda.format(p.preco)})));
   const q=campo('quantidade-pedido','Quantidade','number');q.name='quantidade';q.min='1';q.max='1000';q.step='1';q.value='1';
   if(!clientes.length || !produtos.length){avisar('Cadastre ao menos um cliente e um produto para criar pedidos.');return;}
  }catch(e){avisar('Histórico carregado, mas não é possível criar pedidos: '+e.message,true);return;}
 }
 $('salvar').disabled=secao==='pedidos'&&!criar;
}
async function depois(texto){reset();try{await carregar();avisar(texto);}catch(e){throw new Error(texto+' Não foi possível atualizar a lista: '+e.message);}}
$('formulario').onsubmit=e=>{e.preventDefault();executar(async()=>{
 const dados=Object.fromEntries(new FormData($('formulario')));
 // O fieldset está desabilitado durante a operação; leia os controles diretamente.
 for(const input of $('campos').querySelectorAll('input,select'))dados[input.name]=input.value;
 if(secao==='pedidos')await enviarAcao(criar,dados);
 else if(secao==='clientes'){
  const r=await chamar('/api/simples/'+(editando?'atualizarCliente':'criarCliente'),'POST',{...dados,...(editando?{id:editando.id}:{})});
  if(editando?r!=='Cliente atualizado.':!r?.cliente?.id)throw new Error(String(r));
 }else{dados.preco=Number(dados.preco);await chamar('/api/rest/produtos'+(editando?'/'+editando.id:''),editando?'PUT':'POST',dados);}
 await depois(secao==='pedidos'?'Pedido registrado.':'Cadastro salvo.');
});};
$('secao').onchange=()=>executar(async()=>{secao=$('secao').value;await carregar();});
$('recarregar').onclick=()=>executar(carregar);
$('cancelar').onclick=reset;
executar(carregar);
