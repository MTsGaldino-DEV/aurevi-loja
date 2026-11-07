## Frete — Melhor Envio

A Fase 7 soma as cotações do Melhor Envio à tabela por UF já existente. A origem da Aurevi é **35045-120**, em `settings.shipping_origin`. O produto estima uma unidade da variante selecionada (ou da primeira disponível); a sacola e o checkout usam todas as variantes e quantidades do banco.

O servidor envia dimensões em cm, peso em kg e preço unitário como seguro. A resposta usa `custom_price` e `custom_delivery_range`; serviços com erro ou resposta inválida são omitidos. Frete grátis continua desligado por padrão; quando ativado por configuração ou cupom, zera somente a opção mais barata.

## Conectar a conta

1. Escolha o ambiente. Para desenvolvimento, comece pelo [sandbox](https://sandbox.melhorenvio.com.br); a conta e o aplicativo desse ambiente são separados dos de produção.
2. Em **Integrações → Área Dev.**, cadastre o aplicativo Aurevi. Use uma URL pública HTTPS para o callback, terminando em `/api/health`, e o mesmo endereço em `MELHOR_ENVIO_REDIRECT_URI`. Durante o desenvolvimento, defina primeiro um domínio de testes ou um túnel autorizado para a instalação local; não presuma que o cadastro aceitará `localhost`. A URL do ambiente de testes pode repetir a URL do callback, conforme a documentação oficial.
3. Configure somente em `apps/api/.env`:

   ```dotenv
   MELHOR_ENVIO_ENVIRONMENT=sandbox
   MELHOR_ENVIO_CLIENT_ID=<id-do-aplicativo>
   MELHOR_ENVIO_CLIENT_SECRET=<segredo-do-aplicativo>
   MELHOR_ENVIO_REDIRECT_URI=https://seu-endereco-publico/api/health
   MELHOR_ENVIO_USER_AGENT=Aurevi (seu-email-tecnico@dominio.com)
   INTEGRATION_ENCRYPTION_KEY=<64-caracteres-hexadecimais>
   ```

   Gere a chave uma vez com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde-a com os segredos da aplicação; trocar ou perder a chave exige autorizar novamente a conta.

4. Com o banco e a API locais rodando, execute `pnpm --filter @aurevi/api shipping:connect`. Abra o endereço impresso, autorize **somente `shipping-calculate`**, e cole a URL completa de retorno no próprio terminal. O comando valida o `state` e o callback antes de trocar o código por tokens; não cole essa URL ou os segredos no chat.
5. Reinicie a API após configurar as variáveis e teste uma peça/sacola com um CEP atendido. A conexão inicial não exige criar um endpoint público de administração.

Os tokens ficam cifrados com AES-256-GCM na tabela `integration_credentials`, separados por ambiente. O job diário renova quando faltam até 24 horas para expirar; a cotação também renova se necessário e repete uma vez após HTTP 401. O refresh token novo substitui o anterior na mesma gravação. Há uma instância da API, conforme a arquitetura atual.

Em produção, crie/autorize o aplicativo de produção, use `MELHOR_ENVIO_ENVIRONMENT=production` e um callback HTTPS do domínio da loja. Configure os segredos e a mesma chave de criptografia no servidor. A chave não pode ir para o frontend nem ser versionada. Somente cotação é autorizada; este fluxo não compra etiquetas.

## Falhas e limites

- Sem configuração ou autorização, a loja continua com a tabela por UF.
- Timeout de 4 segundos por chamada; falhas, inclusive de autenticação, não expõem a resposta do provedor ao cliente.
- Cache de 60 segundos, máximo de 200 consultas, incluindo origem, destino, produtos, quantidades, dimensões e preços. O checkout consulta de novo sem esse cache; se o serviço escolhido desaparecer, pede nova escolha antes de criar o pedido.
- Produto, sacola e criação do pedido compartilham o limite de 30 consultas/minuto/IP da conexão. No desenvolvimento, as requisições encaminhadas pelo Next compartilham a mesma cota. Cabeçalhos encaminhados não são confiados automaticamente: confiar no `X-Forwarded-For` preservado pelo Next permitiria falsificar a identidade. Na implantação, o Caddy deve encaminhar `/api` diretamente à API e higienizar os cabeçalhos, com proxies confiáveis configurados na API para distinguir clientes reais.
- O banco contém produtos fictícios. Para a operação real, cadastre peso e dimensões corretos das peças; a API do Melhor Envio calcula o empacotamento.
- Compra de etiquetas e rastreio continuam fora desta fase.

## Validação

Os testes da API usam o Postgres de teste e simulam somente a API externa. Cobrem os valores enviados, respostas parciais, frete grátis, cache, recotação, fallback, OAuth, criptografia e renovação. A confirmação de cotações reais exige o aplicativo autorizado.

Pendências de pagamento aceitas pelo usuário para retomada posterior: webhook real, confirmação de Pix pago, expiração real do Pix e parcelamento. Cartão aprovado/recusado, recuperação após recusa e troca de Pix para cartão foram verificados no pedido local #1011, com uma única baixa de estoque.

Fontes: [Cotação por produtos](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos), [OAuth](https://docs.melhorenvio.com.br/reference/fluxo-de-autoriza%C3%A7%C3%A3o), [Troca e renovação de tokens](https://docs.melhorenvio.com.br/reference/solicitacao-do-token), [FAQ](https://docs.melhorenvio.com.br/reference/faq).
