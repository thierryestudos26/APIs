# Trabalho Wagner — APIs e microsserviços

## Executar

Requer Node.js 22 ou superior. Na pasta do projeto:

```sh
npm install
npm start
```

Abra http://localhost:3000. Cadastre cliente e produto e registre uma compra em Pedidos. O painel “Ver comunicação com as APIs” mostra requisições, respostas e cabeçalhos. Ctrl+C encerra os processos iniciados pelo comando. Não execute npm start duas vezes: isso causa EADDRINUSE. O iniciador não encerra processos de outras execuções nem reinicia automaticamente serviços que falharam.

## Serviços e contratos

| Serviço | Porta | Estilo | Dados próprios |
|---|---|---|---|
| Clientes | 3001 | API simples/RPC | api-simples/dados/clientes.json |
| Produtos | 3002 | REST | api-rest/dados/produtos.json |
| Pedidos | 3003 | RESTful com hipermídia | api-restful/dados/pedidos.json |
| Interface/gateway | 3000 | Interface e encaminhamento HTTP | Nenhum cadastro |

Clientes usa POST em /listarClientes, /buscarCliente, /criarCliente, /atualizarCliente e /excluirCliente. Recebe nome/email nos cadastros e id nas consultas e exclusões. Respostas variam entre texto e JSON; erros de negócio usam 200 intencionalmente para demonstrar o modelo simples do enunciado.

Produtos usa GET/POST em /produtos e GET/PUT/DELETE em /produtos/:id. POST e PUT recebem nome e preco em JSON; PUT substitui os campos editáveis completos. DELETE retorna 204 sem corpo.

Pedidos começa em GET /. O cliente segue collection e descobre a ação criar e os links das opções. Envia clienteId, produtoId e quantidade ao destino indicado. O serviço consulta Clientes por HTTP/RPC e Produtos por HTTP/REST, calcula o total em centavos e salva cópias históricas de cliente, produto e preço. Não acessa arquivos dos outros serviços.

O cancelamento usa PUT /pedidos/:id/status com {"status":"cancelado"}. A representação completa desse recurso de estado contém somente status. A resposta é 204, com próximos destinos em Link. Repetir o cancelamento é idempotente. A ação só é anunciada em pedidos abertos. Pedidos permanecem no histórico; DELETE é demonstrado em Produtos.

## Hipermídia

O tipo de resposta é application/vnd.wagner.pedidos+json: formato próprio da atividade, sem registro na IANA. O contrato está em api-restful/perfil.js, publicado em GET /perfil e indicado pela relação profile no cabeçalho Link.

- links: destinos com relação, URI e método.
- acoes: operações disponíveis com título, URI, método, tipo de conteúdo e campos permitidos.
- campos: nomes, tipos, obrigatoriedade, limites, valores fixos e controles para consultar opções.
- Erros do serviço: status HTTP, mensagem e links de recuperação. Erros gerados pelo gateway possuem seu próprio envelope JSON.

O front-end conhece o contrato e o endereço inicial, segue os controles e monta dinamicamente os campos de criação. O teste altera a coleção para /compras e percorre os mesmos controles para verificar a descoberta dos destinos.

## Restrições REST demonstradas

| Restrição de Fielding | Aplicação no serviço de Pedidos |
|---|---|
| Cliente-servidor | Interface separada das regras e persistência |
| Stateless | Sem sessão ou cookies; cada requisição contém sua entrada completa. Dados persistidos são estado dos recursos |
| Cache | GET/HEAD com ETag e private, no-cache; validação condicional com 304; alterações e erros com no-store |
| Interface uniforme: identificação | Recursos identificados por links self e collection |
| Interface uniforme: representações | Entrada JSON e respostas com tipo documentado; estado atualizado por PUT |
| Interface uniforme: mensagens autoexplicativas | Content-Type, contrato, status, Location, Link, Allow e cache |
| Interface uniforme: HATEOAS | Navegação, criação, opções e cancelamento anunciados nas respostas; ações dependem do estado |
| Sistema em camadas | Navegador → gateway → serviço; gateway preserva a semântica e adapta links |
| Código sob demanda (opcional) | JavaScript entregue ao navegador para executar a interface |

no-cache permite armazenamento, mas exige revalidação antes de reutilizar. O gateway reescreve links e calcula um ETag para a representação transformada. Consulta o serviço antes de avaliar a condição do cliente. HEAD mantém os metadados de GET sem corpo.

São demonstrados 200, 201 com Location, 204 sem corpo, 304, 400, 404, 405 com Allow, 406, 413, 415, 422 e 503 com Retry-After. O gateway usa 502/504 quando não consegue obter resposta do serviço.

REST é um estilo arquitetural; a separação REST versus RESTful é a classificação didática do enunciado, não duas especificações oficiais diferentes. Esta tabela descreve mecanismos implementados e verificáveis, não uma certificação universal de conformidade.

## Testar

```sh
npm test
```

Dez cenários de integração em uma suíte: o executor contabiliza onze testes incluindo o teste pai. Usam portas e dados temporários e encerram seus processos ao terminar. Cobrem CRUD RPC/REST, negociação de conteúdo, hipermídia, validação, status e cabeçalhos HTTP, ETag/304/HEAD direto e via gateway, cálculo monetário, histórico, cancelamento idempotente, persistência após reinício, falha de dependência e arquivos da interface.

A conferência manual no navegador também percorreu cadastro de cliente, cadastro de produto, criação e cancelamento de pedido, preservando o histórico e removendo a ação disponível.

## Execução individual

Use npm run simples, npm run rest, npm run restful ou npm run frontend.

| Variável | Aplicação |
|---|---|
| PORT | Porta do processo executado individualmente |
| CLIENTES_URL / PRODUTOS_URL | Dependências do serviço de Pedidos |
| CLIENTES_PORT / PRODUTOS_PORT / PEDIDOS_PORT | Portas de destino do gateway local |
| DATA_DIR | Armazenamento de uma instância; configure um diretório diferente por serviço |
| PEDIDOS_PATH | Coleção de Pedidos, padrão /pedidos |

npm start usa as portas padrão. A falha de um serviço não encerra os demais. Sem Clientes ou Produtos, novas compras retornam 503 sem gravação parcial; consultar e cancelar pedidos existentes continua disponível.

## Limitações

JSON atende à demonstração com uma instância de cada serviço. Não execute duas instâncias escrevendo no mesmo arquivo. As consultas a Clientes e Produtos não são transação distribuída: o pedido registra os valores consultados naquele momento. Alterar ou excluir cadastros não altera pedidos anteriores.

Os serviços compartilham repositório, instalação npm e utilitários técnicos. Não há pipeline individual de implantação, autenticação, estoque, pagamento ou entrega. Os antigos produtos.json em api-simples e api-restful foram preservados, mas não são utilizados.

## Fontes

- [Fielding — restrições REST](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm)
- [Fielding — hipermídia](https://roy.gbiv.com/untangled/2008/rest-apis-must-be-hypertext-driven)
- [RFC 9110 — semântica HTTP](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 9111 — cache HTTP](https://www.rfc-editor.org/rfc/rfc9111.html)
- [RFC 6906 — relação profile](https://www.rfc-editor.org/rfc/rfc6906.html)
- [RFC 8259 — JSON](https://www.rfc-editor.org/rfc/rfc8259.html)
