export const TIPO = 'application/vnd.wagner.pedidos+json';
export const perfil = {
  versao: '1.0',
  tipoMidia: TIPO,
  escopo: 'Contrato local de hipermídia do trabalho acadêmico; não é um tipo registrado na IANA.',
  codificacao: 'UTF-8',
  entrada: 'O cliente conhece apenas a URI inicial e este contrato. URIs de recursos não devem ser construídas a partir de IDs.',
  representacao: {
    links: 'Array de controles de navegação: rel, href e metodo. href é uma referência URI resolvida em relação à URI da resposta.',
    acoes: 'Array de operações atualmente disponíveis. A ausência de uma ação impede oferecê-la na interface. Não deduzir ações pelo estado.',
    dados: 'Array de representações embutidas ou de opções, conforme o controle que originou a consulta.',
    erro: 'Mensagem legível para respostas de falha. status contém o código HTTP correspondente.',
    extensibilidade: 'Ignorar propriedades desconhecidas. Não executar ações com métodos, tipos ou campos não compreendidos.'
  },
  links: {
    rel: 'Relação semântica: self identifica este recurso; collection identifica a coleção; profile identifica este contrato; up identifica o pedido associado ao estado.',
    href: 'Referência URI; não interpretar sua estrutura para decidir a operação.',
    metodo: 'GET para navegação segura.'
  },
  acoes: {
    rel: 'Identificador local documentado: criar ou cancelar.',
    titulo: 'Rótulo da operação para apresentar ao usuário.',
    href: 'Destino da requisição.',
    metodo: 'POST cria recurso; PUT substitui a representação de estado no destino. Não inferir método pelo nome da ação.',
    tipoConteudo: 'Content-Type do corpo, application/json nesta versão.',
    campos: 'Lista completa dos campos permitidos no objeto JSON de entrada. Campos extras são rejeitados.'
  },
  campos: {
    nome: 'Chave do campo no JSON.',
    titulo: 'Rótulo legível.',
    tipo: 'string ou number; converter controles HTML numéricos para números JSON.',
    obrigatorio: 'Rejeitar ausência ou string vazia antes de converter.',
    inteiro: 'Quando true, apenas números inteiros.',
    minimo: 'Limite numérico inferior inclusivo.',
    maximo: 'Limite numérico superior inclusivo.',
    valor: 'Quando presente, valor fixo da ação. Não solicitar edição ao usuário.',
    opcoes: 'Controle GET que retorna dados com id (valor enviado) e nome (rótulo). Usar sua URI sem construir caminhos.'
  },
  dominio: {
    pedido: 'id, cliente, produto, quantidade, total, status, criadoEm; cliente e produto são cópias históricas.',
    valores: 'preco e total são reais brasileiros. O total é calculado pelo servidor em centavos.',
    status: 'aberto ou cancelado. O estado tem recurso próprio e somente status é gravável nele.',
    cancelar: 'PUT da representação completa {status: cancelado} no recurso de estado. Retorna 204; repetir mantém o mesmo resultado.',
    exclusao: 'Pedidos não são apagados. DELETE é demonstrado no serviço de produtos.',
    sessoes: 'Sem cookies ou estado de sessão no servidor. Cada requisição contém todos os dados necessários.'
  },
  respostas: {
    200: 'Representação retornada.',
    201: 'Pedido criado. Location e self identificam o recurso.',
    204: 'Operação concluída sem corpo. Próximos destinos no cabeçalho Link.',
    304: 'GET/HEAD condicional sem alteração; reutilizar a representação armazenada.',
    400: 'JSON inválido ou entrada fora do contrato.',
    404: 'Recurso inexistente.',
    405: 'Método não permitido; consultar Allow.',
    406: 'Tipo solicitado em Accept não oferecido.',
    413: 'Corpo acima do limite de 16 KiB.',
    415: 'Tipo de corpo ou codificação não suportada.',
    422: 'Cliente/produto inexistente ou valor monetário fora do limite.',
    500: 'Erro interno.',
    503: 'Dependência indisponível; nenhum pedido foi criado.'
  },
  cache: 'GET/HEAD de recursos usam private, no-cache e ETag; alterações e erros usam no-store.',
  recuperacao: 'Erros têm links para entrada/coleção e perfil. O cliente deve tratar o status antes de executar qualquer transição.'
};
