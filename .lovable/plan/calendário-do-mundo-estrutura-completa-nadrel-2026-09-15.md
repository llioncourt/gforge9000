# Calendário do mundo — estrutura completa (Nadrel)

Objetivo: o calendário da campanha deixa de ser uma lista simples de meses com um único tamanho e passa a suportar um sistema como o Calendário de Nadrel — incluindo nomes próprios para todas as unidades de tempo.

## O que passa a existir

**1. Nomes canônicos das unidades**
Cada campanha define como chama cada unidade, no singular e no plural, com padrão terráqueo:
- Era (Era / Eras)
- Ano (Ano / Anos) → em Nadrel: Ciclo / Ciclos
- Quarto/estação (Estação / Estações) → em Nadrel: Quarto / Quartos
- Mês (Mês / Meses)
- Semana (Semana / Semanas)
- Dia (Dia / Dias) → em Nadrel: Rota / Rotas
- Hora (Hora / Horas) → em Nadrel: quarto de Rota
- Minuto (Minuto / Minutos) → em Nadrel: parte

Esses nomes aparecem em toda a interface da timeline (rótulos dos campos, badges de data, texto "hoje no mundo").

**2. Meses com duração própria**
Cada mês vira um item com nome + número de dias, em vez de um valor único para todos. Continua aceitando um valor padrão quando o mês não define o seu.

**3. Agrupamento em estações/quartos**
Lista opcional de estações, cada uma com nome, subtítulo/lema opcional e os meses que contém. Usada para exibir a timeline agrupada e para mostrar a estação de uma data.

**4. Regra de ano bissexto configurável**
Modelo de dados: dia extra em um mês escolhido, com padrão de recorrência por bloco (ex.: "nos anos 4, 7 e 10 de cada bloco de 10"). Também suporta o padrão terráqueo (a cada 4 anos, exceto múltiplos de 100, salvo múltiplos de 400). Desligada por padrão.

**5. Subdivisão do dia**
Configuração de quantas horas tem um dia e quantos minutos tem uma hora (Nadrel: 4 por dia, 4 por hora = 16 partes). Eventos ganham campos opcionais de hora e minuto, que entram na ordenação.

**6. Semana**
Quantidade de dias por semana e nomes opcionais dos dias, usados para exibir o dia da semana de uma data.

**7. Validação**
Ao registrar um evento, o dia não pode exceder o tamanho do mês escolhido (com o dia extra do bissexto considerado), e hora/minuto respeitam a subdivisão. Mensagens de erro usam os nomes canônicos da campanha.

**8. Presets**
Botão "Calendário gregoriano" (já existente, atualizado para o novo formato).

## Interface

O diálogo "Calendar" do painel Timeline vira um editor com abas:
- **Unidades** — os nomes canônicos (singular/plural) de cada unidade.
- **Meses** — lista editável (nome + duração), reordenável, com adicionar/remover.
- **Estações** — grupos nomeados de meses.
- **Ciclo** — dias por semana, nomes dos dias, horas por dia, minutos por hora, regra de bissexto.
- **Hoje** — data atual do mundo, agora em campos estruturados (ano/mês/dia/hora) em vez de texto livre.

O formulário de adicionar evento passa a usar seletor de mês (em vez de texto), rótulos com os nomes da campanha, e campos opcionais de hora/minuto.

## Detalhes técnicos

- A lógica do calendário sai de `src/components/lore/timeline-panel.tsx` para um módulo puro `src/lib/world-calendar.ts` (sem React): tipos, defaults, parser tolerante, `monthLength`, `isLeapYear`, `dayOfWeek`, `seasonOfMonth`, `formatWorldDate`, `compareWorldDates`, `validateWorldDate`, presets gregoriano e Nadrel.
- Continua tudo em `campaigns.settings.calendar` (jsonb) — **sem migração de banco**.
- Compatibilidade: o parser lê o formato antigo (`months: string[]`, `days_per_month`, `current: string`) e o converte em memória para o novo formato; calendários já salvos continuam funcionando e são reescritos no novo formato ao salvar.
- Eventos: `data.hour` e `data.minute` novos e opcionais; `eventOrder` passa a devolver ano/mês/dia/hora/minuto. Eventos existentes seguem ordenando igual.
- Testes em `src/rules/__tests__/timeline.test.ts` ampliados: migração do formato antigo, meses de tamanhos variados, bissexto por bloco (ciclos 4/7/10 de 10), bissexto gregoriano, ordenação com hora/minuto, validação de dia fora do mês, dia da semana e estação, e preset de Nadrel somando 320 rotas (321 em ciclo bissexto).
