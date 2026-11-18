import express from 'express';
import { fileURLToPath } from 'node:url';
import { criarRepositorio, iniciar } from '../compartilhado/base.js';
import { TIPO, perfil } from './perfil.js';

const app = express();
app.disable('x-powered-by');
const repo = criarRepositorio(fileURLToPath(new URL('./dados/pedidos.json', import.meta.url)));
const clientesURL = process.env.CLIENTES_URL || 'http://127.0.0.1:3001';
const produtosURL = process.env.PRODUTOS_URL || 'http://127.0.0.1:3002';
// Permite testar que o cliente segue links mesmo quando o servidor muda as URIs.
const raiz = process.env.PEDIDOS_PATH || '/pedidos';
if (!/^\/[a-z][a-z0-9-]*$/.test(raiz)) throw new Error('PEDIDOS_PATH inválido.');
const link = (rel, href) => ({ rel, href, metodo: 'GET' });
const campos = [
  { nome: 'clienteId', titulo: 'Cliente', tipo: 'string', obrigatorio: true, opcoes: link('opcoes', '/opcoes/clientes') },
  { nome: 'produtoId', titulo: 'Produto', tipo: 'string', obrigatorio: true, opcoes: link('opcoes', '/opcoes/produtos') },
  { nome: 'quantidade', titulo: 'Quantidade', tipo: 'number', obrigatorio: true, inteiro: true, minimo: 1, maximo: 1000 }
];
function representar(pedido) {
  const href = raiz + '/' + pedido.id;
  return {
    ...pedido,
    links: [link('self', href), link('collection', raiz), link('profile', '/perfil')],
    acoes: pedido.status === 'aberto' ? [{
      rel: 'cancelar', titulo: 'Cancelar pedido', href: href + '/status', metodo: 'PUT',
      tipoConteudo: 'application/json',
      campos: [{ nome: 'status', titulo: 'Situação', tipo: 'string', obrigatorio: true, valor: 'cancelado' }]
    }] : []
  };
}
function responder(res, status, dados) {
  res.set('Content-Type', TIPO);
  res.set('Link', '</perfil>; rel="profile"');
  return res.status(status).json(dados);
}
function falhar(res, status, mensagem) {
  res.set('Cache-Control', 'no-store');
  return responder(res, status, {
    status, erro: mensagem,
    links: [link('collection', raiz), link('profile', '/perfil')]
  });
}
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.vary('Accept');
  if (!req.accepts(TIPO)) return falhar(res, 406, 'Solicite ' + TIPO + ' ou */*.');
  next();
});
app.use(express.json({ limit: '16kb', strict: true }));
const cache = (req, res, next) => { res.set('Cache-Control', 'private, no-cache'); next(); };
app.get('/health', (req, res) => responder(res, 200, { servico: 'Pedidos', status: 'online', links: [link('collection', raiz)] }));
app.get('/perfil', cache, (req, res) => responder(res, 200, { ...perfil, links: [link('self', '/perfil'), link('collection', raiz)] }));
app.get('/', cache, (req, res) => responder(res, 200, {
  nome: 'Pedidos', links: [link('collection', raiz), link('profile', '/perfil')]
}));
app.get(raiz, cache, (req, res) => responder(res, 200, {
  dados: repo.listar().map(representar),
  links: [link('self', raiz), link('profile', '/perfil')],
  acoes: [{ rel: 'criar', titulo: 'Registrar pedido', href: raiz, metodo: 'POST', tipoConteudo: 'application/json', campos }]
}));
app.get(raiz + '/:id', cache, (req, res) => {
  const p = repo.buscar(req.params.id);
  return p ? responder(res, 200, representar(p)) : falhar(res, 404, 'Pedido não encontrado.');
});
app.get(raiz + '/:id/status', cache, (req, res) => {
  const p = repo.buscar(req.params.id);
  if (!p) return falhar(res, 404, 'Pedido não encontrado.');
  responder(res, 200, { status: p.status,
    links: [link('self', raiz + '/' + p.id + '/status'), link('up', raiz + '/' + p.id), link('collection', raiz)],
    acoes: representar(p).acoes });
});
async function consultar(url, metodo = 'GET', body) {
  const response = await fetch(url, {
    method: metodo, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000)
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status,
    dados: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
}
app.get('/opcoes/:tipo', async (req, res) => {
  if (!['clientes', 'produtos'].includes(req.params.tipo)) return falhar(res, 404, 'Opções não encontradas.');
  try {
    const cliente = req.params.tipo === 'clientes';
    const r = await consultar(cliente ? clientesURL + '/listarClientes' : produtosURL + '/produtos', cliente ? 'POST' : 'GET');
    if (!r.ok || !Array.isArray(r.dados)) throw new Error('Resposta inválida');
    responder(res, 200, {
      dados: r.dados.map(item => ({ id: item.id, nome: cliente ? item.nome : item.nome + ' — R$ ' + item.preco.toFixed(2) })),
      links: [link('self', '/opcoes/' + req.params.tipo), link('collection', raiz)]
    });
  } catch { falhar(res, 503, 'Não foi possível obter as opções do cadastro.'); }
});
const somenteJson = (req, res, next) => {
  if (!req.is('application/json')) return falhar(res, 415, 'Envie application/json.');
  next();
};
app.post(raiz, somenteJson, async (req, res) => {
  const body = req.body;
  const { clienteId, produtoId, quantidade } = body || {};
  if (!body || Array.isArray(body) || Object.keys(body).some(k => !['clienteId', 'produtoId', 'quantidade'].includes(k)) ||
      typeof clienteId !== 'string' || !clienteId.trim() || typeof produtoId !== 'string' || !produtoId.trim() ||
      !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 1000) {
    return falhar(res, 400, 'Envie apenas clienteId, produtoId e quantidade inteira de 1 a 1000.');
  }
  let cliente, produto;
  try {
    const [c, p] = await Promise.all([
      consultar(clientesURL + '/buscarCliente', 'POST', { id: clienteId }),
      consultar(produtosURL + '/produtos/' + encodeURIComponent(produtoId))
    ]);
    if (c.status >= 500 || p.status >= 500) throw new Error('Dependência indisponível');
    if (p.status === 404 || typeof c.dados === 'string') return falhar(res, 422, 'Cliente ou produto não encontrado.');
    if (!c.ok || !p.ok) throw new Error('Resposta inválida');
    cliente = c.dados; produto = p.dados;
    if (cliente?.id !== clienteId || produto?.id !== produtoId || !Number.isFinite(produto.preco) || produto.preco < 0) throw new Error('Resposta inválida');
  } catch {
    res.set('Retry-After', '3');
    return falhar(res, 503, 'Clientes ou produtos indisponíveis. Nenhum pedido foi criado.');
  }
  const centavos = Math.round(produto.preco * 100);
  if (!Number.isSafeInteger(centavos * quantidade)) return falhar(res, 422, 'Valor do pedido acima do limite.');
  const pedido = repo.criar({
    cliente: { id: cliente.id, nome: cliente.nome, email: cliente.email },
    produto: { id: produto.id, nome: produto.nome, preco: centavos / 100 },
    quantidade, total: centavos * quantidade / 100, status: 'aberto', criadoEm: new Date().toISOString()
  });
  res.location(raiz + '/' + pedido.id);
  responder(res, 201, representar(pedido));
});
app.put(raiz + '/:id/status', somenteJson, (req, res) => {
  const p = repo.buscar(req.params.id);
  if (!p) return falhar(res, 404, 'Pedido não encontrado.');
  if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || req.body.status !== 'cancelado') {
    return falhar(res, 400, 'Envie somente status: cancelado.');
  }
  if (p.status !== 'cancelado') {
    const { id, ...dados } = p;
    repo.atualizar(id, { ...dados, status: 'cancelado' });
  }
  res.set('Link', '<' + raiz + '/' + p.id + '>; rel="up", <' + raiz + '>; rel="collection", </perfil>; rel="profile"');
  res.status(204).end();
});
for (const [rota, metodos] of [
  ['/', 'GET, HEAD, OPTIONS'], ['/perfil', 'GET, HEAD, OPTIONS'], ['/health', 'GET, HEAD, OPTIONS'],
  ['/opcoes/:tipo', 'GET, HEAD, OPTIONS'], [raiz, 'GET, HEAD, POST, OPTIONS'],
  [raiz + '/:id', 'GET, HEAD, OPTIONS'], [raiz + '/:id/status', 'GET, HEAD, PUT, OPTIONS']
]) {
  app.all(rota, (req, res) => {
    res.set('Allow', metodos);
    return req.method === 'OPTIONS' ? res.status(204).end() : falhar(res, 405, 'Método não permitido.');
  });
}
app.use((req, res) => falhar(res, 404, 'Rota não encontrada.'));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  const mensagens = { 400: 'JSON inválido.', 413: 'Corpo acima de 16 KiB.', 415: 'Codificação de conteúdo não suportada.' };
  if (status === 500) console.error(err);
  falhar(res, status, mensagens[status] || 'Erro ao processar a requisição.');
});
iniciar(app, Number(process.env.PORT || 3003));
