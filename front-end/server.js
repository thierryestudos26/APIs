import express from 'express';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { iniciar } from '../compartilhado/base.js';

const app = express();
const portas = {
  simples: Number(process.env.CLIENTES_PORT || 3001),
  rest: Number(process.env.PRODUTOS_PORT || 3002),
  restful: Number(process.env.PEDIDOS_PORT || 3003)
};
app.disable('x-powered-by');
app.disable('etag');
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', express.raw({ type: () => true, limit: '16kb' }));

app.use('/api/:servico', async (req, res) => {
  const servico = req.params.servico;
  if (!Object.hasOwn(portas, servico)) return res.status(404).json({ erro: 'Serviço não encontrado.' });
  const prefixo = '/api/' + servico;
  const publico = href => typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') ? prefixo + href : href;
  function adaptar(valor) {
    if (Array.isArray(valor)) return valor.map(adaptar);
    if (!valor || typeof valor !== 'object') return valor;
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, k === 'href' ? publico(v) : adaptar(v)]));
  }
  try {
    const headers = {};
    for (const nome of ['content-type', 'accept']) if (req.headers[nome]) headers[nome] = req.headers[nome];
    // HEAD usa a mesma representação transformada de GET, mas sem enviar o corpo ao cliente.
    const resposta = await fetch('http://127.0.0.1:' + portas[servico] + req.url, {
      method: req.method === 'HEAD' ? 'GET' : req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body?.length ? req.body : undefined,
      redirect: 'manual', signal: AbortSignal.timeout(5000)
    });
    res.status(resposta.status);
    for (const nome of ['content-type', 'cache-control', 'allow', 'vary', 'retry-after']) {
      const valor = resposta.headers.get(nome);
      if (valor) res.set(nome, valor);
    }
    const localizacao = resposta.headers.get('location');
    if (localizacao) res.set('Location', publico(localizacao));
    const links = resposta.headers.get('link');
    if (links) res.set('Link', links.replace(/<([^>]+)>/g, (_, href) => '<' + publico(href) + '>'));
    if ([204, 304].includes(resposta.status)) return res.end();

    let texto = await resposta.text();
    const tipo = resposta.headers.get('content-type') || '';
    if (servico === 'restful' && /(?:application\/json|\+json)(?:;|$)/i.test(tipo)) {
      texto = JSON.stringify(adaptar(JSON.parse(texto)));
    }
    // O corpo mudou ao reescrever href: seu ETag deve ser calculado novamente.
    if (['GET', 'HEAD'].includes(req.method) && resposta.status === 200 &&
        !String(res.get('Cache-Control')).includes('no-store')) {
      res.set('ETag', '"' + createHash('sha256').update(texto).digest('hex') + '"');
      if (req.fresh) {
        res.status(304);
        res.removeHeader('Content-Type');
        return res.end();
      }
    }
    res.set('Content-Length', String(Buffer.byteLength(texto)));
    if (req.method === 'HEAD') return res.end();
    res.end(texto);
  } catch (err) {
    const status = err.name === 'TimeoutError' ? 504 : 502;
    res.set('Cache-Control', 'no-store').status(status).json({ erro: 'Não foi possível acessar o serviço.', status });
  }
});
app.get('/health', (req, res) => res.json({ servico: 'Gateway', status: 'online' }));
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.set('Cache-Control', 'no-store').status(status).json({ status, erro: status === 413 ? 'Corpo acima de 16 KiB.' : 'Erro ao processar a requisição.' });
});
iniciar(app, Number(process.env.PORT || 3000));
