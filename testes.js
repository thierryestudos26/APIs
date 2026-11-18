import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { TIPO_PEDIDOS, montarCorpo, obterCampos } from './front-end/public/hipermidia.js';

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
async function porta() {
  return new Promise(resolve => {
    const servidor = net.createServer();
    servidor.listen(0, '127.0.0.1', () => {
      const numero = servidor.address().port;
      servidor.close(() => resolve(numero));
    });
  });
}
function req(port, path, method = 'GET', body, headers = {}, raw = false) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : raw ? body : JSON.stringify(body);
    const request = http.request({
      hostname: '127.0.0.1', port, path, method,
      headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }), ...headers }
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => text += chunk);
      res.on('end', () => {
        let data = text;
        try { data = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, data, text, headers: res.headers });
      });
    });
    request.on('error', reject);
    request.setTimeout(6000, () => request.destroy(new Error('Timeout de teste')));
    request.end(payload);
  });
}
test('Contratos e integração dos três serviços', async t => {
  const raiz = await mkdtemp(join(tmpdir(), 'wagner-teste-'));
  const processos = [];
  const c = await porta(), p = await porta(), o = await porta(), g = await porta();
  async function iniciar(arquivo, port, extra = {}) {
    const child = spawn(process.execPath, [arquivo], {
      env: { ...process.env, PORT: String(port), DATA_DIR: join(raiz, String(port)), ...extra },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    processos.push(child);
    let log = '';
    child.on('error', err => log += err.message);
    child.stderr.on('data', d => log += d); child.stdout.on('data', () => {});
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(log);
      try { if ((await req(port, '/health')).status === 200) return child; } catch {}
      await esperar(50);
    }
    throw new Error('Serviço não iniciou: ' + arquivo + ' ' + log);
  }
  async function parar(child) {
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await done;
    }
  }
  let cliente, produto, pedido, acaoCriar, entrada, listaPath, etagAntesCancelar;
  let clienteProcesso, pedidoProcesso;
  const pedidoEnv = { CLIENTES_URL: 'http://127.0.0.1:' + c, PRODUTOS_URL: 'http://127.0.0.1:' + p, PEDIDOS_PATH: '/compras' };
  const chamar = async (path, method = 'GET', body) => {
    const r = await req(g, path, method, body, { Accept: TIPO_PEDIDOS });
    assert.ok(r.status < 400, JSON.stringify(r.data));
    return r.data;
  };
  try {
    clienteProcesso = await iniciar('api-simples/server.js', c);
    await iniciar('api-rest/server.js', p);
    pedidoProcesso = await iniciar('api-restful/server.js', o, pedidoEnv);
    await iniciar('front-end/server.js', g, { CLIENTES_PORT: String(c), PRODUTOS_PORT: String(p), PEDIDOS_PORT: String(o) });

    await t.test('RPC: verbos, POST, formatos variados e CRUD de clientes', async () => {
      const invalido = await req(c, '/criarCliente', 'POST', { nome: '', email: 'invalido' });
      assert.equal(invalido.status, 200); assert.equal(typeof invalido.data, 'string');
      const r = await req(c, '/criarCliente', 'POST', { nome: 'Ana', email: 'ana@example.com' });
      assert.equal(r.status, 200); cliente = r.data.cliente; assert.ok(cliente.id);
      assert.equal((await req(c, '/buscarCliente', 'POST', { id: cliente.id })).data.nome, 'Ana');
      assert.equal((await req(c, '/atualizarCliente', 'POST', { id: cliente.id, nome: 'Ana Silva', email: 'ana@example.com' })).data, 'Cliente atualizado.');
      assert.equal((await req(c, '/listarClientes', 'POST')).data.length, 1);
      assert.equal((await req(c, '/listarProdutos', 'POST')).status, 404);
    });

    await t.test('REST: recursos, JSON, 201/Location, validação e métodos', async () => {
      assert.equal((await req(p, '/produtos', 'POST', { nome: '', preco: -1 })).status, 400);
      assert.equal((await req(p, '/produtos', 'POST', '{}', { 'Content-Type': 'text/plain' }, true)).status, 415);
      assert.equal((await req(p, '/produtos', 'GET', undefined, { Accept: 'application/xml' })).status, 406);
      const r = await req(p, '/produtos', 'POST', { nome: 'Livro', preco: 29.90 });
      assert.equal(r.status, 201); produto = r.data;
      assert.equal(r.headers.location, '/produtos/' + produto.id);
      const head = await req(p, r.headers.location, 'HEAD');
      assert.equal(head.status, 200); assert.equal(head.text, '');
      assert.equal((await req(p, '/produtos/inexistente')).status, 404);
      const naoPermitido = await req(p, '/produtos', 'PATCH');
      assert.equal(naoPermitido.status, 405); assert.match(naoPermitido.headers.allow, /POST/);
      assert.equal((await req(p, '/produtos', 'OPTIONS')).status, 204);
    });

    await t.test('Hipermídia: tipo explícito, perfil, navegação sem URIs fixas e opções', async () => {
      const r = await req(g, '/api/restful/', 'GET', undefined, { Accept: TIPO_PEDIDOS });
      assert.equal(r.status, 200); assert.match(r.headers['content-type'], /vnd.wagner.pedidos\+json/);
      assert.match(r.headers.link, /profile/); assert.equal(r.headers['set-cookie'], undefined);
      entrada = r.data;
      listaPath = entrada.links.find(l => l.rel === 'collection').href;
      assert.equal(listaPath, '/api/restful/compras');
      const perfilPath = entrada.links.find(l => l.rel === 'profile').href;
      assert.equal((await chamar(perfilPath)).tipoMidia, TIPO_PEDIDOS);
      const lista = await chamar(listaPath); acaoCriar = lista.acoes.find(a => a.rel === 'criar');
      const campos = await obterCampos(acaoCriar, chamar);
      assert.equal(campos.find(f => f.nome === 'clienteId').alternativas[0].id, cliente.id);
      assert.equal(campos.find(f => f.nome === 'produtoId').alternativas[0].id, produto.id);
      assert.ok(campos.find(f => f.nome === 'quantidade').inteiro);
      assert.throws(() => montarCorpo(acaoCriar, { clienteId: cliente.id, produtoId: produto.id, quantidade: 1.5 }));
    });

    await t.test('Cache: ETag e 304 tanto na API quanto no gateway; HEAD equivalente', async () => {
      for (const [port, path] of [[o, '/compras'], [g, listaPath]]) {
        const r = await req(port, path);
        assert.equal(r.headers['cache-control'], 'private, no-cache'); assert.ok(r.headers.etag);
        const conditional = await req(port, path, 'GET', undefined, { 'If-None-Match': r.headers.etag });
        assert.equal(conditional.status, 304); assert.equal(conditional.text, '');
        const head = await req(port, path, 'HEAD');
        assert.equal(head.headers.etag, r.headers.etag); assert.equal(head.text, '');
      }
      assert.notEqual((await req(o, '/compras')).headers.etag, (await req(g, listaPath)).headers.etag);
    });

    await t.test('Pedido: 201, total calculado no servidor e invalidação do cache', async () => {
      const antigo = await req(g, listaPath);
      const corpo = montarCorpo(acaoCriar, { clienteId: cliente.id, produtoId: produto.id, quantidade: '3' });
      const r = await req(g, acaoCriar.href, acaoCriar.metodo, corpo);
      assert.equal(r.status, 201); pedido = r.data; assert.equal(pedido.total, 89.70);
      assert.equal(r.headers.location, pedido.links.find(l => l.rel === 'self').href);
      assert.equal(r.headers['cache-control'], 'no-store');
      assert.equal((await req(g, listaPath, 'GET', undefined, { 'If-None-Match': antigo.headers.etag })).status, 200);
      assert.equal((await req(g, acaoCriar.href, 'POST', { ...corpo, total: 0 })).status, 400);
      assert.equal((await req(g, acaoCriar.href, 'POST', { ...corpo, clienteId: 'inexistente' })).status, 422);
      assert.equal((await req(g, acaoCriar.href, 'POST', { ...corpo, quantidade: 0 })).status, 400);
    });

    await t.test('Erros uniformes: 400, 404, 405, 406, 413 e 415, direto e pelo gateway', async () => {
      for (const [port, prefix] of [[o, ''], [g, '/api/restful']]) {
        const casos = [
          ['/compras', 'POST', '{', { 'Content-Type': 'application/json' }, 400],
          ['/compras', 'POST', '{}', { 'Content-Type': 'text/plain' }, 415],
          ['/compras', 'POST', ' '.repeat(17000), { 'Content-Type': 'application/json' }, 413],
          ['/inexistente', 'GET', undefined, {}, 404],
          ['/compras', 'PATCH', undefined, {}, 405],
          ['/compras', 'GET', undefined, { Accept: 'application/xml' }, 406]
        ];
        for (const [path, method, body, headers, status] of casos) {
          const r = await req(port, prefix + path, method, body, headers, true);
          assert.equal(r.status, status); assert.equal(r.data.status, status); assert.equal(typeof r.data.erro, 'string');
          assert.equal(r.headers['cache-control'], 'no-store');
          // 413 pode ser detectado no próprio gateway, antes de chegar ao serviço.
          if (!(port === g && status === 413)) assert.ok(r.data.links.some(l => l.rel === 'collection'));
        }
      }
    });

    await t.test('Histórico preservado após alterar e excluir cadastros', async () => {
      const self = pedido.links.find(l => l.rel === 'self').href;
      assert.equal((await req(p, '/produtos/' + produto.id, 'PUT', { nome: 'Outro nome', preco: 50 })).status, 200);
      const r = await req(g, self); assert.equal(r.data.total, 89.70); assert.equal(r.data.produto.nome, 'Livro');
      assert.equal(r.data.cliente.nome, 'Ana Silva');
      assert.equal((await req(p, '/produtos/' + produto.id, 'DELETE')).status, 204);
      assert.equal((await req(p, '/produtos/' + produto.id, 'DELETE')).status, 404);
      assert.equal((await req(c, '/excluirCliente', 'POST', { id: cliente.id })).data, 'Cliente excluído.');
      assert.equal((await req(g, self)).data.total, 89.70);
      etagAntesCancelar = (await req(g, listaPath)).headers.etag;
    });

    await t.test('Estado: PUT completo, 204, links de retorno e cancelamento idempotente', async () => {
      const acao = pedido.acoes[0], corpo = montarCorpo(acao, {});
      assert.equal((await req(g, acao.href)).data.status, 'aberto');
      const r = await req(g, acao.href, acao.metodo, corpo);
      assert.equal(r.status, 204); assert.equal(r.text, ''); assert.match(r.headers.link, /collection/);
      assert.equal((await req(g, acao.href, acao.metodo, corpo)).status, 204);
      const atual = await req(g, pedido.links.find(l => l.rel === 'self').href);
      assert.deepEqual(atual.data.acoes, []); assert.equal(atual.data.status, 'cancelado');
      assert.equal((await req(g, acao.href, 'PUT', { status: 'aberto' })).status, 400);
      assert.equal((await req(g, listaPath, 'GET', undefined, { 'If-None-Match': etagAntesCancelar })).status, 200);
    });

    await t.test('Persistência e falha isolada: consultar/cancelar independe dos cadastros', async () => {
      await parar(pedidoProcesso);
      pedidoProcesso = await iniciar('api-restful/server.js', o, pedidoEnv);
      assert.equal((await req(g, listaPath)).data.dados[0].status, 'cancelado');
      await parar(clienteProcesso);
      assert.equal((await req(p, '/produtos')).status, 200);
      assert.equal((await req(g, listaPath)).status, 200);
      assert.equal((await req(g, '/api/simples/listarClientes', 'POST')).status, 502);
      const r = await req(g, acaoCriar.href, 'POST', { clienteId: cliente.id, produtoId: produto.id, quantidade: 1 });
      assert.equal(r.status, 503); assert.equal(r.headers['retry-after'], '3');
      assert.equal((await req(g, listaPath)).data.dados.length, 1);
      assert.equal((await req(g, pedido.acoes[0].href, 'PUT', { status: 'cancelado' })).status, 204);
    });

    await t.test('Front-end estático e módulo de hipermídia disponíveis', async () => {
      const html = await req(g, '/'); assert.equal(html.status, 200); assert.match(html.text, /type="module"/);
      for (const path of ['/app.js', '/hipermidia.js', '/style.css']) assert.equal((await req(g, path)).status, 200);
    });
  } finally {
    for (const child of processos) await parar(child);
    // raiz foi criada exclusivamente por mkdtemp nesta execução.
    await rm(raiz, { recursive: true, force: true });
  }
});
