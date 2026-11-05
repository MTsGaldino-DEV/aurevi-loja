# Análise de UX: loja de moda na Nuvemshop

Referência: uma loja de moda feminina na Nuvemshop (tema Rio), em 05/11/2026, a 1440 px e 390 px. O nome fica fora do repositório, que é público. Este documento registra padrões de UX e funcionalidades. Nenhuma imagem, texto, logo ou código foi reaproveitado.

## Alcance e limites

**Visitado:** home, uma categoria e um produto, sem login.

**Não acessado:** o `robots.txt` da loja proíbe acesso automatizado a `/comprar/`, `/checkout/`, `/frete/` e `/search/`. Por isso o script não colocou produto no carrinho, não abriu o checkout, não calculou frete e não fez busca. O carrinho só foi visto vazio. O checkout vem da descrição do briefing.

**Garantias do script:** ele bloqueia qualquer `POST` para a loja, inclusive os de analytics da própria página, e toda navegação para as rotas proibidas. As capturas ficam em `docs/research/screens/`, fora do Git, porque contêm fotos de terceiros. Para repetir: `tools/research/capture.mjs`.

**Amostra pequena:** uma categoria e um produto, com todas as variações disponíveis. O estado "esgotado" não foi visto.

**Legenda da coluna "Onde aparece":** sem marcação = observado; _(briefing)_ = descrito no briefing, não observado; _(não observado)_ = previsto no briefing, mas sem acesso.

## Decisões de escopo

| Funcionalidade                                | Onde aparece                                                             | Decisão         | Por quê                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Barra de anúncios rotativa                    | Global, topo                                                             | MVP             | Comunica frete grátis, parcelas e cupom. Na Aurevi: até 3 mensagens editáveis, sem animar com `prefers-reduced-motion`. |
| Header com logo, carrinho e menu              | Global                                                                   | MVP             | Base da navegação.                                                                                                      |
| Menu com subcategorias                        | Painel no desktop, gaveta com níveis no mobile                           | MVP             | O modelo já prevê hierarquia. Catálogo pequeno pede até 2 níveis.                                                       |
| Busca com sugestões                           | Header                                                                   | Fase 2          | Catálogo pequeno se resolve com menu e filtros. Adicionar quando houver volume.                                         |
| Conta de cliente                              | Header                                                                   | Fase 2          | Compra sem cadastro reduz atrito. Consultar o pedido por link no e-mail cobre o essencial.                              |
| Hero em carrossel                             | Home                                                                     | MVP, com ajuste | Na Aurevi: um hero fixo, sem carrossel, para favorecer LCP e foco. Imagem e link vêm de `settings`.                     |
| Banners de coleção com CTA                    | Home                                                                     | MVP             | Dois blocos fixos, editados em `settings`. Sem editor visual.                                                           |
| Vitrine de lançamentos                        | Home                                                                     | MVP             | Mostra produto logo após o hero. Rolagem horizontal nativa com CSS.                                                     |
| Vídeos curtos ligados a produto               | Home                                                                     | Fase 2          | Bom para moda, mas exige produção contínua de vídeo e pesa no mobile.                                                   |
| Depoimentos e nota do Google                  | Home                                                                     | Fase 2          | Marca nova ainda não tem avaliações reais. Não exibir números sem lastro.                                               |
| Newsletter                                    | Rodapé                                                                   | Fase 2          | Sem envio de campanhas no MVP, a captação ficaria parada.                                                               |
| Pop-up de desconto por e-mail                 | Sobreposto, inclusive ao carrinho                                        | Não             | Interrompe o mobile. O cupom pode ir na barra de anúncios.                                                              |
| Rodapé com institucional, contato e redes     | Global, com acordeões no mobile                                          | MVP             | Exigência legal inclui CNPJ, endereço e canais de atendimento.                                                          |
| Selos de segurança                            | Rodapé                                                                   | Não             | Decorativos, não acrescentam garantia real.                                                                             |
| WhatsApp flutuante                            | Global                                                                   | MVP, com ajuste | Canal esperado no Brasil. Link `wa.me`, sem cobrir preço nem CTA.                                                       |
| Aviso de cookies                              | Global, por aceite implícito                                             | MVP, com ajuste | Na Aurevi: escolha real para cookies não essenciais, conforme a Fase 9.                                                 |
| Cashback                                      | Barra de anúncios, rodapé                                                | Fase 2          | Já definido como fora do MVP.                                                                                           |
| Grid de categoria                             | 2 colunas no mobile, 4 no desktop                                        | MVP             | Padrão eficiente e centrado na foto.                                                                                    |
| Filtros por cor, tamanho e preço com contagem | Lateral no desktop, modal no mobile                                      | MVP             | Previsto na Fase 3. Cor com amostra e contagem por opção.                                                               |
| Ordenação                                     | Topo no desktop, dentro de "Filtrar" no mobile                           | MVP             | Previsto na Fase 3.                                                                                                     |
| "Mostrar mais produtos"                       | Fim do grid                                                              | MVP             | Simples no mobile. Manter página na URL para SEO e botão voltar.                                                        |
| Card com nome, preço e parcelas               | Grid e vitrines                                                          | MVP             | Informação mínima para decidir o clique.                                                                                |
| Selo de desconto e preço riscado              | Card                                                                     | MVP             | Usa `compare_at_price_cents`.                                                                                           |
| Preço no Pix no card                          | Não visto no card                                                        | MVP             | Diferencial barato: o desconto Pix já existe em `settings`.                                                             |
| Compra rápida em painel inferior              | Card no mobile                                                           | Fase 2          | Em moda, a cliente quer ver fotos e medidas. A página de produto basta no início.                                       |
| Amostras de cor no card                       | Não visto no card                                                        | Fase 2          | Útil com catálogo maior.                                                                                                |
| Galeria                                       | Miniaturas no desktop, deslize com pontos no mobile                      | MVP             | Núcleo da venda de moda.                                                                                                |
| Foto muda conforme a cor                      | Na amostra, a galeria não mudou ao trocar a cor                          | MVP             | `product_images` já prevê o vínculo com cor.                                                                            |
| Seletor de cor e tamanho em botões            | Produto e compra rápida                                                  | MVP             | Toque fácil e estado visível.                                                                                           |
| Estoque por variação                          | Não visto, sem esgotados na amostra                                      | MVP             | Opção esgotada desabilitada, mas visível.                                                                               |
| "Avise-me quando chegar"                      | Não visto                                                                | Fase 2          | Precisa de fila e e-mail próprios.                                                                                      |
| Medidas e modelo                              | Texto livre na descrição                                                 | MVP, com ajuste | Na Aurevi: tabela estruturada por tamanho, com medida e tamanho usado pela modelo.                                      |
| Composição do tecido                          | Texto livre na descrição                                                 | MVP             | Reduz dúvida e devolução.                                                                                               |
| Parcelamento                                  | Card e produto                                                           | MVP             | Vem de `settings`.                                                                                                      |
| Desconto Pix no produto                       | Não visto no topo nem no acordeão aberto; "Ver mais detalhes" não aberto | MVP             | Mostrar junto do preço.                                                                                                 |
| Frete por CEP                                 | Acordeão no produto; envio não testado                                   | MVP             | Na Aurevi: campo visível, sem acordeão.                                                                                 |
| Barra de frete grátis                         | Produto; no carrinho _(não observado)_                                   | MVP             | Principal no carrinho. No produto, uma linha simples basta.                                                             |
| Produtos relacionados                         | Fim do produto                                                           | MVP             | Mesma categoria, sem recomendação algorítmica.                                                                          |
| Breadcrumb                                    | Categoria e produto                                                      | MVP             | Navegação e dados estruturados.                                                                                         |
| Botões de compartilhar                        | Produto                                                                  | Não             | Pouco uso, ocupa espaço.                                                                                                |
| Carrinho em gaveta                            | Global, visto vazio                                                      | MVP             | Mantém a cliente na página. O estado vazio deve levar às categorias.                                                    |
| Cupom, frete e resumo no carrinho             | _(não observado)_                                                        | MVP             | Previsto na Fase 4. Valores sempre recalculados no servidor.                                                            |
| Etapas do checkout                            | Checkout _(briefing)_                                                    | MVP             | Previsto na Fase 4.                                                                                                     |
| Resumo fixo                                   | Checkout _(briefing)_                                                    | MVP             | Fixo no desktop, recolhível no mobile.                                                                                  |
| Frete com nome e prazo                        | Checkout _(briefing)_                                                    | MVP             | Reduz dúvida na decisão.                                                                                                |
| Comentário do pedido                          | Checkout _(briefing)_                                                    | MVP             | `orders.notes` já existe.                                                                                               |
| Cartão com parcelas e Pix                     | Checkout _(briefing)_                                                    | MVP             | Decisão tomada: Payment Brick.                                                                                          |
| Salvar dados para a próxima compra            | Checkout _(briefing)_                                                    | Fase 2          | Depende de conta de cliente.                                                                                            |
| Área "Live" e linhas por perfil               | Menu                                                                     | Não             | Específicas da referência. Categorias comuns atendem.                                                                   |

## O que a Aurevi pode fazer melhor

Itens baseados no que foi observado nesta amostra:

1. **Escolha de tamanho explícita.** A referência já abre com cor e tamanho selecionados, o que facilita comprar o tamanho errado. Na Aurevi, o botão pede a escolha do tamanho.
2. **CTA sempre ao alcance no mobile.** A 390 × 844, o botão de compra fica abaixo da primeira tela e não acompanha a rolagem. Na Aurevi, ele fica fixo depois de passar do seletor.
3. **Nada cobrindo a informação de compra.** Na primeira tela do produto, o botão de WhatsApp cobre parte do texto de parcelas.
4. **Foto ligada à cor.** Trocar a cor não mudou a galeria na amostra. Na Aurevi, a galeria acompanha a cor escolhida.
5. **Preço no Pix sempre visível.** Exibir o preço no Pix no card e ao lado do preço do produto.
6. **Medidas comparáveis.** Tabela por tamanho, no lugar de texto corrido, mais o tamanho usado pela modelo.
7. **Frete à vista.** Campo de CEP aberto no produto, com prazo, em vez de escondido em acordeão.
8. **Um elemento por vez.** No mobile, o pop-up abriu por cima do carrinho. A Aurevi fica sem pop-up.
9. **Consentimento real.** Trocar o aceite implícito por escolha real para cookies não essenciais.
10. **Dados de variação limpos.** A referência mistura formatos de tamanho nos filtros. Na Aurevi, valores de opção padronizados no admin.
11. **Fotos consistentes.** Direção de fotografia única reforça a estética premium, em que o produto domina a página.

### Performance

Medição de uma única carga, sem limitação de rede, em máquina local. Serve só de comparação, não representa usuários reais.

| Página    | LCP desktop / mobile | CLS desktop / mobile | Requisições | Domínios |
| --------- | -------------------- | -------------------- | ----------- | -------- |
| Home      | 1,26 s / 0,84 s      | 0,006 / 0            | 83 / 80     | 23       |
| Categoria | 1,54 s / 1,22 s      | 0,027 / 0,032        | 61 / 58     | 17       |
| Produto   | 0,24 s / 0,20 s      | 0,089 / 0,034        | 78 / 71     | 22       |

Nestes números, a referência já é rápida, então a velocidade não é uma vantagem garantida. Os LCPs do produto parecem baixos demais e podem estar subestimados. O ponto em que a Aurevi pode ganhar é ter menos terceiros: a referência carrega de 17 a 23 domínios por página. A meta é manter LCP abaixo de 2,5 s e CLS abaixo de 0,1 em dados reais, no percentil 75 do mobile.

## Impacto na Fase 1

Ajustes propostos ao modelo de dados, se este escopo for aprovado:

- `products`: tabela de medidas estruturada, tamanho usado pela modelo e composição.
- `settings`: mensagens da barra de anúncios, hero e blocos de coleção.
- `orders`: token de acesso para consultar o pedido por link, sem conta.
