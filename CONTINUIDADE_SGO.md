# CONTINUIDADE DO DESENVOLVIMENTO — SGO
## Sistema de Gestão Operacional / Centro de Operações e Simulacros

Atualizado em: 23/09/2026
Branch de trabalho: develop
Último commit validado: fe82dd9 — Corrige acentuacao no diario operacional das missoes

---

# 1. INSTRUÇÃO ESSENCIAL PARA UM NOVO CHAT

Este ficheiro é a referência de continuidade do desenvolvimento do SGO.

Antes de propor alterações:
1. Ler este ficheiro integralmente.
2. Trabalhar sempre sobre o código atual da branch `develop`.
3. Nunca assumir que uma funcionalidade existe sem a verificar no código ou no SGO real.
4. Nunca inventar versões, ZIPs, ficheiros ou resultados de testes.
5. Trabalhar em passos pequenos:
   alteração pequena → validação técnica → teste real no browser → commit → push.
6. Dar comandos PowerShell exatos e simples.
7. Nunca usar `git add .`.
8. Não fazer refatorizações grandes sem necessidade.
9. Não fazer conversões globais de encoding.
10. Não alterar vários problemas independentes no mesmo commit.

O utilizador prefere avançar um passo de cada vez, com pouca conversa e muita execução prática.

---

# 2. COMPUTADORES

Existem dois PCs:

- PC DO SERVIÇO — computador principal/original.
- PC DE CASA — segundo computador.

O código sincroniza através do Git/GitHub.

A base de dados PostgreSQL NÃO sincroniza através do Git.

Em 23/09/2026 o PC do serviço foi atualizado com:

git pull

e ficou em:

fe82dd9 (HEAD -> develop, origin/develop)
Corrige acentuacao no diario operacional das missoes

---

# 3. ARRANQUE DO SGO

Método habitual:

C:\centro-operacoes-simulacros\iniciar.bat

Backend manual:

cd C:\centro-operacoes-simulacros
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload

Frontend manual:

cd C:\centro-operacoes-simulacros\frontend
npm run dev

Frontend:
http://localhost:5173/

---

# 4. ARQUITETURA FUNCIONAL ATUAL

Estrutura conceptual principal:

OPERAÇÃO
→ OCORRÊNCIA
→ PLANO DE AÇÃO OPERACIONAL (PAO)
→ OBJETIVOS
→ MISSÕES
→ RECURSOS / ELEMENTOS

O conceito de Setores chegou a ser desenvolvido, mas foi considerado desnecessário para o fluxo principal. Não deve ser desenvolvido como prioridade.

Os Objetivos devem viver funcionalmente dentro do PAO e não como área principal independente.

---

# 5. PAO — PLANO DE AÇÃO OPERACIONAL

O PAO inclui atualmente:

- Intenção do Comandante
- Situação Operacional
- Objetivos Operacionais
- Missões agrupadas por objetivo
- Decisões Operacionais
- Timeline / Cronologia

Objetivo futuro:
gerar relatório operacional automaticamente a partir do PAO + Timeline.

---

# 6. ESTADOS DAS OCORRÊNCIAS

O estado "Despachada" foi removido do fluxo.

Fluxo atual:

Recebida
→ Em curso
→ Sob controlo
→ Encerrada
→ Arquivada

Commit que implementou esta alteração:

1ad34e5 — Simplifica fluxo das ocorrencias removendo despacho

Regras importantes:

- Ordenar deslocação NÃO muda automaticamente Recebida para Em curso.
- Confirmar chegada ao local muda Recebida → Em curso.
- Tempo de resposta = Receção → Primeira chegada.
- Não existe etapa artificial de "Despacho".

---

# 7. MAPA E PAINÉIS

Já foi verificado no código que mapa e painel lateral abrem a mesma ficha operacional para:

- Recursos
- Ocorrências
- Missões

Não é necessário implementar novamente.

No mapa:

- clicar no círculo da ocorrência abre a ocorrência;
- clicar no marcador do recurso abre o recurso;
- clicar no alvo da missão abre a missão;
- linhas missão-recurso são apenas visuais.

---

# 8. REPOSICIONAMENTO MANUAL DOS RECURSOS

Decisão funcional importante:

ARRASTAR UM RECURSO NO MAPA
= apenas atualizar a posição física conhecida.

Não deve:

- criar evento na Timeline;
- gerar alerta operacional;
- executar uma ordem;
- confirmar chegada;
- alterar estado operacional.

Ações diferentes:

"Ordenar deslocação"
= ação operacional registada.

"Confirmar chegada ao local"
= ação operacional registada.

O endpoint:

PUT /recursos/{recurso_id}/posicao

foi alterado para atualizar exclusivamente `localizacao`.

Commit provisório:

52850ea — WIP: reposicionamento manual de recursos sem timeline

Teste real realizado no PC de casa:

- PSP 01 arrastada;
- posição persistiu após atualização automática;
- não apareceu "Recurso 11 movido";
- não houve chegada automática;
- não houve alteração operacional.

FUNCIONALIDADE VALIDADA.

---

# 9. CODIFICAÇÃO / MOJIBAKE — PROBLEMA ATUAL

O `main.py` contém muitas strings antigas corrompidas, por exemplo:

Ãƒ...
Ã‚...
etc.

IMPORTANTE:

NÃO fazer conversão global do ficheiro.

Já houve uma tentativa com PowerShell:

Set-Content -Encoding UTF8

que introduziu BOM e agravou várias strings.

Essa tentativa foi totalmente revertida através do backup.

Método seguro adotado:

- corrigir apenas strings específicas;
- usar escapes Unicode no código-fonte:

\u00e3
\u00e7
\u00e0
etc.

Exemplo:

"Miss\u00e3o"

em execução produz corretamente:

"Missão"

Fluxo obrigatório:

pequeno grupo de strings
→ `python -m py_compile`
→ `git diff --check`
→ inspeção do diff
→ teste real no SGO
→ commit
→ push.

---

# 10. CORREÇÕES DE CODIFICAÇÃO JÁ VALIDADAS

## Chegada ao local

Commit:

e761f5c — Corrige acentuacao das mensagens de chegada

Teste real:

"Chegada ao local: Patrulha PSP 01 (PSP 01) chegou à ocorrência Teste de chegada"

apareceu corretamente na Timeline.

Também foi validada a transição:

Recebida → Em curso.

---

## Ordens de deslocação

Commit:

1dd8f0f — Corrige acentuacao das ordens de deslocacao

Foi corrigido, entre outros:

"Deslocação para ocorrência"

Teste real no painel Ordens passou.

Ordens antigas permanecem corrompidas porque já estavam gravadas na base de dados. Isto é esperado.

---

## Criação de missões

Commit:

0af03b2 — Corrige acentuacao na criacao de missoes

Teste real:

"Missão criada: Verificar condições do local"

apareceu corretamente nos Alertas e Timeline.

---

## Estados das missões

Commit:

12026cc — Corrige acentuacao nos estados das missoes

Testes reais:

"Missão Verificar condições do local alterada para Em execução"

e

"Missão Verificar condições do local alterada para Concluída"

apareceram corretamente na Timeline.

---

## Situação operacional das missões

Commit:

63e071f — Corrige acentuacao na situacao operacional das missoes

Testes reais:

"Situação da missão Avaliar segurança da área: Crítica"

e

"Situação da missão Avaliar segurança da área: Necessita de reforço"

apareceram corretamente na Timeline e Alertas.

---

## Diário operacional / notas das missões

Commit:

fe82dd9 — Corrige acentuacao no diario operacional das missoes

Teste real com a nota:

"Área avaliada. Não existem vítimas na zona crítica."

Foi validada corretamente:

- no Diário operacional;
- na Timeline;
- nos Alertas.

Isto demonstrou também que texto introduzido pelo utilizador com acentos percorre corretamente:

frontend
→ API
→ PostgreSQL
→ API
→ frontend.

Logo, o problema principal são strings antigas já corrompidas no código e alguns dados históricos, não o percurso normal dos novos dados.

---

# 11. PRÓXIMO PASSO EXATO

Continuar a limpeza CONTROLADA das strings corrompidas do `main.py`.

Prioridade:

1. textos que são gravados na Timeline;
2. textos que são gravados em Alertas;
3. textos que são gravados em Ordens;
4. mensagens visíveis ao utilizador;
5. só depois mensagens internas/comentários.

NÃO corrigir tudo de uma vez.

O trabalho parou imediatamente depois do commit:

fe82dd9

O próximo bloco ainda não foi escolhido/alterado.

Antes de continuar, executar uma pesquisa de diagnóstico ou inspecionar o bloco imediatamente posterior às notas das missões.

Existem ainda strings corrompidas em áreas como:

- estatísticas da missão;
- timeline da missão;
- associação/remoção de recursos às missões;
- operações;
- ocorrências;
- objetivos;
- outras respostas HTTP.

Corrigir um pequeno grupo de cada vez.

---

# 12. TESTES TEMPORÁRIOS REALIZADOS NO PC DE CASA

Na operação de teste foram criados registos temporários:

Ocorrência:
Teste de chegada

Missões:
- Verificar condições do local
- Avaliar segurança da área

Foram usados apenas para validar comportamento e encoding.

A base de dados do PC do serviço pode ter conteúdo diferente porque as bases de dados dos dois PCs não são sincronizadas pelo Git.

Não assumir que estes registos existem no PC do serviço.

---

# 13. OPERAÇÃO PRINCIPAL DO TESTE DE ACEITAÇÃO

Foi criada anteriormente:

SIMULACRO SISMOTER 2026 - EXEMPLO MANUAL

No PC do serviço, antes da ida para casa, existiam pelo menos:

Ocorrência:
Colapso parcial de edifício

Objetivo:
Socorrer as vítimas e estabilizar a zona afetada

Responsável:
Comandante Operacional

Recurso:
Patrulha PSP 01 / PSP 01

O estado concreto deve ser confirmado na base de dados atual antes de continuar o teste de aceitação.

Nunca assumir que a base de dados do PC de casa e do serviço estão iguais.

---

# 14. FORMULÁRIO DE OBJETIVOS DO PAO

O antigo fluxo usava vários `window.prompt()` e provocava problemas ao mudar de janela.

Foi substituído por formulário interno no SGO.

Inclui:

- Nome
- Descrição
- Prioridade
- Estado
- Responsável
- Ocorrência
- edição
- eliminar/arquivar

Commit:

197fcee — Melhora criacao e edicao dos objetivos do PAO

Validado no browser.

---

# 15. SEMÂNTICA DOS RECURSOS

Tempo empenhado:

começa quando o recurso é mobilizado/atribuído operacionalmente à ocorrência e inclui o percurso.

Termina quando fica disponível/libertado.

"Marcar disponível":
termina o empenhamento atual, mas o recurso continua na operação.

"Libertar recurso":
o recurso deixa a operação.

Correções históricas importantes:

2150346 — Corrige registo do tempo de empenhamento dos recursos
d4f2d17 — Corrige libertacao de recursos apos conclusao de missao

---

# 16. RELATÓRIO PDF

Existe geração de relatório operacional PDF.

Estrutura pretendida:

1. Identificação da operação
2. Intenção do Comandante
3. Ocorrências
4. Objetivos Operacionais
5. Missões Operacionais
6. Recursos Operacionais
7. Decisões Operacionais
8. Cronologia Operacional
9. Síntese Final

Identidade visual PSP usada:

RGB: 0,44,119
HEX: #002C77

Tipografia institucional de referência:

- Montserrat Black / Medium para identidade/títulos
- Montserrat para títulos/subtítulos
- Inter para corpo
- Arial como fallback

Não distorcer logótipo.
Não usar sombras ou gradientes desnecessários.

Commits históricos do PDF:

373beb7 — estrutura inicial
fe96b62 — identidade PSP
1771d6e — ocorrências/objetivos
1dd0ea9 — PAO/recursos
bb0e21d — recursos
12a100b — decisões
c92f245 — cronologia
eec7ca0 — síntese
9c4efbc — correção estado final
82e914c — notas completas das missões
dd3642c — encoding das notas
4d1e405 — Corrige rotulos da cronologia no relatorio PDF

O relatório deverá voltar a ser testado no final com dados reais do teste de aceitação.

---

# 17. MANUAIS FINAIS

O utilizador quer dois documentos finais:

1. Manual de Utilização completo
2. Manual de Instalação pequeno e separado

Existem versões de trabalho:

/mnt/data/Manual_Utilizacao_SGO_v1.docx
/mnt/data/Manual_Instalacao_SGO_v1.docx

Antes da entrega final:

- atualizar para o estado real do SGO;
- incorporar o walkthrough do teste de aceitação;
- incluir screenshots reais;
- renderizar;
- inspecionar TODAS as páginas;
- só depois entregar.

Não afirmar que foram renderizados/verificados sem o fazer realmente.

---

# 18. TESTE DE ACEITAÇÃO FINAL

Depois da limpeza prioritária do encoding, retomar o walkthrough completo com uma operação limpa.

O walkthrough deve funcionar simultaneamente como:

- teste funcional integral;
- fonte das capturas do Manual de Utilização.

Testar pelo menos:

- criar operação;
- recursos;
- elementos;
- ocorrência;
- PAO;
- intenção;
- objetivos;
- missões;
- situação operacional;
- diário operacional;
- ordens;
- deslocação;
- chegada;
- estados;
- decisões;
- Timeline;
- mapa;
- libertação de recursos;
- conclusão;
- encerramento;
- Replay;
- backup;
- restauro;
- relatório PDF.

---

# 19. BACKUPS / FICHEIROS LOCAIS

Existem muitos ficheiros locais não rastreados, incluindo:

App_PAO_passo*.jsx
App_PC_SERVICO_antes_sync.jsx
App_PDF_1C_antes_recuperacao.jsx
App_RECUPERACAO_a2a8a39.jsx
*.bak
main.py.backup_*
backups/*.sgo

NÃO usar:

git add .

Adicionar ao Git apenas ficheiros explicitamente pretendidos.

Há também:

CONTINUIDADE_SGO_ANTIGA.md

que é a cópia da nota de continuidade anterior a 23/09/2026.

---

# 20. GIT — PONTO SEGURO ATUAL

Branch:

develop

Estado remoto confirmado em 23/09/2026:

fe82dd9 (HEAD -> develop, origin/develop)
Corrige acentuacao no diario operacional das missoes

Commits recentes importantes, por ordem:

52850ea — WIP: reposicionamento manual de recursos sem timeline
e761f5c — Corrige acentuacao das mensagens de chegada
1dd8f0f — Corrige acentuacao das ordens de deslocacao
0af03b2 — Corrige acentuacao na criacao de missoes
12026cc — Corrige acentuacao nos estados das missoes
63e071f — Corrige acentuacao na situacao operacional das missoes
fe82dd9 — Corrige acentuacao no diario operacional das missoes

---

# 21. DISCIPLINA DE DESENVOLVIMENTO

SEMPRE:

1. confirmar o estado real;
2. fazer alteração pequena;
3. `python -m py_compile` para backend;
4. `git diff --check`;
5. inspecionar diff;
6. testar realmente no browser;
7. `git add` apenas do ficheiro pretendido;
8. commit;
9. push;
10. só depois passar ao próximo problema.

Para frontend:
também executar build quando a alteração o justificar.

Nunca considerar uma funcionalidade concluída apenas porque o código "parece correto".

---

# 22. FRASE PARA INICIAR UM NOVO CHAT

No novo chat, escrever:

"Estou a continuar o desenvolvimento do SGO. Tenho o projeto em C:\centro-operacoes-simulacros. Leia primeiro o ficheiro CONTINUIDADE_SGO.md e continue exatamente do ponto indicado. Trabalhe um passo de cada vez, validando e testando antes de cada commit."

Se o novo chat não tiver acesso ao ficheiro local, anexar `CONTINUIDADE_SGO.md`.

---

FIM DA NOTA DE CONTINUIDADE
