import { fileURLToPath } from 'node:url';
import { criarAplicacao, criarRepositorio, iniciar } from '../compartilhado/base.js';
const app = criarAplicacao('Clientes — API simples');
const repo = criarRepositorio(fileURLToPath(new URL('./dados/clientes.json', import.meta.url)));
const valido = d => d && typeof d.nome === 'string' && d.nome.trim().length > 0 && d.nome.trim().length <= 100 && typeof d.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) && d.email.length <= 254;
const extrair = d => ({nome:d.nome.trim(), email:d.email.trim()});
app.post('/listarClientes', (req,res) => res.json(repo.listar()));
app.post('/buscarCliente', (req,res) => { const c=repo.buscar(req.body?.id); return c ? res.json(c) : res.send('Cliente não encontrado.'); });
app.post('/criarCliente', (req,res) => {
 if(!valido(req.body)) return res.send('Informe nome e e-mail válidos.');
 res.json({mensagem:'Cliente criado.', cliente:repo.criar(extrair(req.body))});
});
app.post('/atualizarCliente', (req,res) => {
 if(!repo.buscar(req.body?.id)) return res.send('Cliente não encontrado.');
 if(!valido(req.body)) return res.send('Informe nome e e-mail válidos.');
 repo.atualizar(req.body.id,extrair(req.body)); res.send('Cliente atualizado.');
});
app.post('/excluirCliente', (req,res) => {
 if(!repo.buscar(req.body?.id)) return res.send('Cliente não encontrado.');
 repo.excluir(req.body.id); res.send('Cliente excluído.');
});
iniciar(app,Number(process.env.PORT || 3001));
