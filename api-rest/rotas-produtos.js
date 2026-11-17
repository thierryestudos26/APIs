import { validarProduto, extrairProduto } from './produto.js';
export function registrarRotas(app, repo) {
 app.get('/produtos',(req,res)=>res.json(repo.listar()));
 app.get('/produtos/:id',(req,res)=>{
  const p=repo.buscar(req.params.id);
  return p ? res.json(p) : res.status(404).json({erro:'Produto não encontrado.'});
 });
 app.post('/produtos',(req,res)=>{
  const erro=validarProduto(req.body);
  if(erro)return res.status(400).json({erro});
  const p=repo.criar(extrairProduto(req.body));
  res.location('/produtos/'+p.id).status(201).json(p);
 });
 app.put('/produtos/:id',(req,res)=>{
  if(!repo.buscar(req.params.id))return res.status(404).json({erro:'Produto não encontrado.'});
  const erro=validarProduto(req.body);
  if(erro)return res.status(400).json({erro});
  res.json(repo.atualizar(req.params.id,extrairProduto(req.body)));
 });
 app.delete('/produtos/:id',(req,res)=>{
  if(!repo.buscar(req.params.id))return res.status(404).json({erro:'Produto não encontrado.'});
  repo.excluir(req.params.id);res.status(204).end();
 });
 for(const [rota,metodos] of [['/produtos','GET, HEAD, POST, OPTIONS'],['/produtos/:id','GET, HEAD, PUT, DELETE, OPTIONS']]){
  app.all(rota,(req,res)=>{
   res.set('Allow',metodos);
   return req.method==='OPTIONS'?res.status(204).end():res.status(405).json({erro:'Método não permitido.'});
  });
 }
}
