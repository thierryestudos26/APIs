# Trabalho Wagner — loja com serviços por responsabilidade

## Executar
Requer Node.js 22 ou superior. Na raiz:
```sh
npm install
npm start
```
Abra http://localhost:3000. Cadastre um cliente, cadastre um produto e abra Pedidos.
Para encerrar todos os processos iniciados pelo comando, use Ctrl+C.
A queda de um processo não encerra os demais. O iniciador não reinicia serviços automaticamente.

## Responsabilidades
| Serviço | Porta padrão | API | Dados próprios |
|---|---|---|---|
| Clientes | 3001 | RPC simples | api-simples/dados/clientes.json |
| Produtos | 3002 | REST | api-rest/dados/produtos.json |
| Pedidos | 3003 | REST com hipermídia | api-restful/dados/pedidos.json |
| Interface/gateway | 3000 | Encaminhamento HTTP | Nenhum cadastro |

Clientes usa POST /listarClientes, /buscarCliente, /criarCliente, /atualizarCliente e /excluirCliente.
Criação e atualização recebem nome e email; busca e exclusão recebem id.
As respostas simples variam entre texto e JSON, inclusive erros de negócio com status 200, conforme o exercício.

Produtos usa GET/POST /produtos e GET/PUT/DELETE /produtos/:id.
Criação e atualização recebem nome e preco.

Pedidos começa em GET /. O cliente segue collection, descobre a ação criar e envia clienteId, produtoId e quantidade.
O serviço consulta Clientes por RPC e Produtos por REST. Não lê seus arquivos.
Ele calcula o total no servidor e armazena cópias históricas de cliente, produto e preço.
PUT /pedidos/:id com status cancelado cancela a compra. A ação cancelar só aparece em pedidos abertos; repetir o cancelamento é idempotente.
Pedidos não são apagados para manter o histórico. DELETE continua demonstrado no serviço de Produtos.
Sem estoque, pagamento ou entrega nesta versão.

## Autonomia e limitações
Cada API tem processo, responsabilidade e armazenamento próprios; a única comunicação de negócio entre elas é HTTP.
O código compartilhado contém utilitários HTTP e persistência. As regras de produtos ficam em api-rest.
O repositório e a instalação npm são compartilhados para facilitar a atividade; não há pipeline de deploy por serviço.
Persistência JSON serve para uma instância de cada serviço. Não execute duas instâncias escrevendo o mesmo arquivo.
As consultas de cliente e produto não são uma transação distribuída: o pedido registra a informação consultada naquele momento.
Se uma dependência falhar, criar pedido responde 503 e não grava; consultar e cancelar pedidos existentes continua funcionando.
Exclusões de clientes e produtos não apagam as cópias históricas dos pedidos.

## Execução individual
- npm run simples
- npm run rest
- npm run restful
- npm run frontend

PORT configura a porta de cada processo individual.
CLIENTES_URL e PRODUTOS_URL configuram as dependências do serviço de Pedidos.
CLIENTES_PORT, PRODUTOS_PORT e PEDIDOS_PORT configuram o gateway local.
DATA_DIR altera o diretório de dados de um serviço; os testes usam esse recurso.
npm start usa as portas padrão.

## Dados anteriores
O catálogo de api-rest foi mantido.
Os antigos arquivos api-simples/dados/produtos.json e api-restful/dados/produtos.json foram preservados, mas deixaram de ser usados: eram catálogos alternativos da demonstração antiga.
Nenhum produto antigo foi convertido automaticamente em cliente ou pedido.

## Testar
```sh
npm test
```
O teste inicia processos em portas temporárias e usa uma pasta temporária.
Verifica comunicação via gateway, cadastro de dependências, cálculo de total, validação, preservação histórica, cancelamento e falha de uma dependência. Encerra seus próprios processos ao terminar.

## REST e a atividade
A API de Pedidos oferece ações dependentes do estado, perfil em Link e cache explícito.
O cliente utiliza href, metodo, tipoConteudo e campos das ações.
O formato é didático e próprio; esta mudança não equivale a uma certificação de conformidade integral com REST.
Ainda cabem uma especificação mais formal do perfil, padronização completa dos erros e revisão do cache no gateway.

## Fontes
- Fielding, restrições REST: https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm
- Hipermídia segundo Fielding: https://roy.gbiv.com/untangled/2008/rest-apis-must-be-hypertext-driven
- Express: https://expressjs.com/en/guide/routing.html
