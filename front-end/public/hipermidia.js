export const TIPO_PEDIDOS = 'application/vnd.wagner.pedidos+json';
export function montarCorpo(acao, valores) {
  if (!acao || !['POST', 'PUT'].includes(acao.metodo) || acao.tipoConteudo !== 'application/json') throw new Error('Ação não suportada.');
  const corpo = {};
  for (const campo of acao.campos || []) {
    let valor = Object.hasOwn(campo, 'valor') ? campo.valor : valores[campo.nome];
    if (valor === undefined || valor === '') {
      if (campo.obrigatorio) throw new Error('Preencha ' + (campo.titulo || campo.nome) + '.');
      continue;
    }
    if (campo.tipo === 'number') {
      valor = Number(valor);
      if (!Number.isFinite(valor) || (campo.inteiro && !Number.isInteger(valor)) ||
          (campo.minimo !== undefined && valor < campo.minimo) || (campo.maximo !== undefined && valor > campo.maximo)) {
        throw new Error('Valor inválido para ' + (campo.titulo || campo.nome) + '.');
      }
    } else if (campo.tipo !== 'string' || typeof valor !== 'string') throw new Error('Tipo de campo não suportado.');
    corpo[campo.nome] = valor;
  }
  return corpo;
}
export async function obterCampos(acao, chamar) {
  if (!acao) throw new Error('Criação indisponível.');
  return Promise.all(acao.campos.map(async campo => {
    if (!campo.opcoes) return { ...campo };
    const resposta = await chamar(campo.opcoes.href, campo.opcoes.metodo);
    if (!Array.isArray(resposta.dados)) throw new Error('Opções inválidas.');
    return { ...campo, alternativas: resposta.dados };
  }));
}
