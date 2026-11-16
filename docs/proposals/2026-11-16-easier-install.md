# keepkeys: instalação e uso fáceis (relatório)

Data: 2026-11-16 · Branch: `easier-install-and-headless` (local, sem push)

## Resumo

O keepkeys foi desenhado para **um** cenário: agente local, desktop, com clipboard e navegador na mesma máquina. Nesse cenário ele funciona. Fora dele, falha de quatro formas, e todas aconteceram no caso do homeserver:

1. **Distribuição.** `keepkeys` não está no npm (o nome está **livre**: `GET registry.npmjs.org/keepkeys` responde 404). Todos os comandos do README falham.
2. **Servidor sem tela.** Sem TTY (o shell do agente) e sem display, o keepkeys tenta um clipboard ou uma página que ninguém alcança, e fica **bloqueado em silêncio de 5 a 10 min**. Ele chega a dizer "opened a page in your browser" num servidor sem navegador.
3. **Destino errado.** Com `.env.example` e sem nenhum `.env`, ele grava em `.env.local`. docker compose e python-dotenv leem `.env`. As chaves "chegam" e o app não as encontra.
4. **sudo.** O rename atômico entrega o `.env` ao root, e o app que roda como o usuário perde o acesso ao próprio `.env`.

O caminho que **já funcionava** no servidor é o prompt oculto num TTY (`keepkeys`, sem argumentos, no terminal SSH da pessoa). Ele só não estava documentado, e o agente não sabia oferecê-lo. A correção principal é fazer o keepkeys **entregar esse comando** quando percebe que está num servidor. Ela foi implementada e testada.

Com a branch, o caso real fica assim: o agente roda `keepkeys`, recebe `npx -y keepkeys --root ~/app` e repassa esse comando. A pessoa roda no SSH e cola 5 vezes. Resultado: 5 chaves em `.env` (dono e modo preservados), **nenhum** `y/N` e **nenhum** segredo no scrollback. O agente confere com `keepkeys list --json`. O que ainda falta para o critério de sucesso é **distribuição**: publicar no npm e ter um instalador sem Node.

## Como reproduzi

- Docker neste sandbox: `ubuntu:24.04` limpo (cenário "sem Node") e uma imagem "homeserver" (Ubuntu 24.04, `nodejs` do apt = **18.19.1**, tmux para simular o terminal SSH com bracketed paste, `SSH_CONNECTION` definido, usuário `henry` uid 1001 com sudo). Para o cenário com desktop: Xvfb + xclip.
- **Não executados:** Windows real e macOS real (não há como neste ambiente). Para eles, a análise é estática, sobre o código e o CI (que já roda nos três sistemas, mas com clipboard falso).

## 1. Atritos por cenário

### (b) Linux headless por SSH, sem Node: o caso real

| # | Passo | Resultado real |
|---|---|---|
| B0 | `npx keepkeys add X` num Ubuntu limpo | `bash: npx: command not found`. Uma imagem limpa também não tem `curl`, `git` nem `wget` (o Ubuntu Server de verdade traz `curl`). |
| B1 | `apt install nodejs` | Node **18.19.1** (o README pede ≥ 20). `nodejs` sozinho: 15 pacotes, 29 MB, **sem npx**. `nodejs npm`: **668 pacotes, 224 MB**. |
| B2 | `npx keepkeys --version` | `npm ERR! 404 Not Found - GET https://registry.npmjs.org/keepkeys` |
| B3 | `npx github:HenryyXD/keepkeys` | `npm ERR! syscall spawn git` / `enoent An unknown git error occurred` (sem git) |
| B4 | `npx -y https://codeload.github.com/HenryyXD/keepkeys/tar.gz/main --version` | Funciona (2 s), com `npm WARN EBADENGINE current: { node: 'v18.19.1' }`. |
| B5 | **Suíte completa no Node 18.19.1** | `# pass 125 # fail 0`. O mínimo de 20 não era necessário. |
| B6 | Agente (sem TTY): `keepkeys add TELEGRAM_BOT_TOKEN --to .env` | `keepkeys: opened a page in your browser to paste the key: http://127.0.0.1:44505/…`. É **falso** (não existe `xdg-open`), e o comando fica bloqueado até 10 min. |
| B7 | Agente: `… --clipboard` | Imprime só o cabeçalho e fica **5 min mudo** (a leitura do clipboard falha dentro do poll e o erro é engolido). |
| B8 | Agente: `keepkeys` (fill) | Lista 5 `[MISSING] … .env.local`, abre a página inalcançável e bloqueia. |
| B9 | MCP `request_secret` headless | Notifica "opened http://127.0.0.1:38323/… in the browser" e bloqueia a ferramenta por até 10 min. |
| B10 | `--browser` + `ssh -L` | Só funciona com a **mesma porta** aleatória e com `127.0.0.1`. `localhost:PORT` responde **403**, e uma porta local diferente também (checagem exata do `Host`). Além disso, a porta só é conhecida depois que o comando já rodou, o que exige uma segunda conexão SSH. |
| B11 | **Pessoa no TTY via SSH: `keepkeys`** | **Funciona.** Pede as 5 chaves, uma colagem por chave. Mas grava em `.env.local`, e há dois problemas abaixo. |
| B12 | …`TELEGRAM_CHAT_ID=987654321` | `! the value is very short (9 characters)` / `Save anyway? [y/N]` |
| B13 | …quem cola a próxima chave nesse `y/N` | **Vazamento na tela:** o `readline` ecoa, e apareceu `Save anyway? [y/N] henry@example.comp@ss w0rd!xsk-ant-oat01-fake…` |
| B14 | …`IMAP_PASSWORD` = senha de app do Gmail (`abcd efgh ijkl mnop`) | `! the value contains spaces or line breaks; keys normally have none` e outro `y/N`. |

**Passos até funcionar, hoje:** 1 instalação de Node (224 MB com npm), descobrir a URL do tarball lendo o `package.json`, abrir um terminal próprio (o agente não pode), rodar `keepkeys`, colar 5 vezes, responder 2 `y` e depois **corrigir o destino** (`.env.local` → `.env`) à mão. Isso dá cerca de 8 passos, com 2 que exigem ler código. O agente sozinho não chega lá: todos os caminhos dele bloqueiam.

### (a) Mac ou Linux com desktop, agente local

| Passo | Resultado |
|---|---|
| `npx keepkeys setup` | Mesmo **404** do npm. Funciona pelo tarball, mas `setup` registra `npx -y keepkeys mcp`, que também dá 404. A única saída é `git clone` + `npm link`. |
| Linux X11 + xclip: agente roda `add ANTHROPIC_API_KEY`, a pessoa copia | A chave **é salva** e o clipboard é limpo, mas o processo **não termina**: `ok: saved` só aparece quando outro programa copia algo. A causa é o `spawnSync('xclip -i')`, que espera o daemon do xclip herdar e fechar o stdout. No MCP isso congela o event loop, e a resposta ao agente não chega. Reproduzido: "4 s depois de copiar: processo vivo? SIM". |
| macOS | Não executado. Pelo código: `osascript` (changeCount) + `pbpaste`/`pbcopy`, sem o problema do xclip. O BACKLOG já lista "verificar em hardware real". |

### (c) Windows (análise estática)

- Mesmo bloqueio do npm. O Node não vem instalado (`winget install OpenJS.NodeJS.LTS`).
- Clipboard via PowerShell (`GetClipboardSequenceNumber`), `setup` com `cmd /c npx`, prompt com detecção de rajada para o conhost antigo: tudo parece correto e coberto no CI com clipboard falso.
- Risco não testado: um SSH para dentro do Windows (OpenSSH Server). O `Get-Clipboard` leria o clipboard da sessão do servidor. A branch trata isso como remoto (`SSH_CONNECTION`) e entrega o comando.

### (d) Agente num container ou VM na nuvem, pessoa em outro terminal

- **Se a pessoa tem terminal nessa máquina** (devcontainer, Codespaces, `docker exec -it`, SSH para a VM): é o cenário (b). Na branch, o agente recebe o comando, a pessoa roda no terminal dela, e o agente confere com `secrets_status`.
- **Se não tem** (sandbox hospedado de um agente web, como este onde rodei): não existe caminho que cumpra "nenhum segredo sai da máquina da pessoa". Qualquer solução seria um relay. O correto é dizer isso e apontar para o recurso de segredos da própria plataforma. A seção "For agents" do README agora diz exatamente isso.

### (e) `.env` de outro usuário, ou rodando via sudo

| Passo | Resultado real |
|---|---|
| `.env` `henry:henry 0640`; `sudo keepkeys add … --to .env` | Depois: **`root:root 0640`**. |
| O app (henry) lê o `.env` | `cat: .env: Permission denied` |
| henry roda keepkeys de novo | `keepkeys: EACCES: permission denied, open '/home/henry/app/.env'` |
| `.env` de outro usuário, sem sudo | `EACCES: permission denied, open '/srv/p/..env.692daf8a7c09.tmp'`: o erro cita o arquivo temporário. |
| Bug extra | `writeFileSync(tmp, {mode})` passa pelo **umask**. Um `.env` `0660` virava `0640` a cada reescrita. |

## 2. Recomendações (prioridade = impacto ÷ esforço)

Legenda: esforço P/M/G · impacto ★ a ★★★ · "0-dep" = mantém zero dependências de runtime.

### Rápidas (defaults, README, correções): implementadas na branch

| # | Mudança | Esforço | Impacto | Segurança | 0-dep |
|---|---|---|---|---|---|
| R1 | **Entrega para a pessoa** (headless/SSH sem TTY): CLI imprime um comando e sai com código 4; MCP retorna o comando na hora | M | ★★★ | Melhora: o comando não contém valor; o agente nunca recebe a URL de confirmação | sim |
| R2 | `atomicWrite` preserva dono e modo (sudo), corrige o umask, escreve no lugar quando não dá para fazer `chown`; erro de permissão legível | P | ★★★ | Melhora (o modo não "vaza" mais pelo umask) | sim |
| R3 | `.env.example` → padrão `.env` (não `.env.local`) quando não há arquivo | P | ★★★ | Neutra (o `.gitignore` e o aviso de "já commitado" continuam valendo) | sim |
| R4 | Corrige o travamento com xclip (stdout `ignore` nos comandos de limpar) | P | ★★ | Neutra | sim |
| R5 | `y/N` sem eco, de uma tecla; colagem descartada | P | ★★ | **Corrige um vazamento na tela** | sim |
| R6 | Avisos de formato: IDs, usuários e senhas não seguem regras de chave de API | P | ★★ | Leve: um `*_PASSWORD` com espaço não pede confirmação. Quebra de linha ainda avisa | sim |
| R7 | `--clipboard` falha na hora sem clipboard; `--browser` não mente sobre "opened" e imprime o `ssh -L`; a página aceita `localhost` em qualquer porta | P | ★★ | Ver a nota sobre o `Host` abaixo | sim |
| R8 | `engines` ≥ 18.19 + Node 18 na matriz de CI | P | ★★ | **Sinalizo:** o Node 18 está em EOL upstream (abr/2025). O keepkeys não usa APIs com CVE relevante, e o Ubuntu e o Debian ainda corrigem o pacote deles, mas isso convém documentar | sim |
| R9 | Versão num módulo (`src/version.js`, sincronizada por teste) para builds standalone | P | ★ (habilita E2) | Neutra | sim |
| R10 | README: "Quick start by situation" + "For agents" | P | ★★★ | Melhora (diz explicitamente para nunca usar `--stdin <<< sk-…`) | sim |

Nota sobre o `Host` (R7): antes, a página só aceitava exatamente `127.0.0.1:<porta>`. Agora aceita `127.0.0.1`, `localhost` e `[::1]` **em qualquer porta**, e exige `Origin === http://<Host>`. A proteção contra DNS rebinding continua, porque ela depende de o *nome* ser de loopback, não da porta. O token de 192 bits na URL continua sendo exigido. Não vejo enfraquecimento, mas como é código de segurança, merece sua revisão.

### Estruturais (distribuição): não implementadas, porque exigem publicação ou release

| # | Mudança | Esforço | Impacto | Segurança | 0-dep |
|---|---|---|---|---|---|
| E1 | **Publicar no npm** com provenance, via CI de release | P | ★★★ | Melhora com provenance; pinar a versão em `setup` (BACKLOG) reduz o risco de supply chain | sim |
| E2 | **Instalador sem Node:** `install.sh` / `install.ps1` que usam o Node do sistema se ≥ 18.19, senão baixam o Node oficial (31 MB `.tar.xz`), conferem o SHA-256 contra `SHASUMS256.txt` e instalam o tarball do keepkeys (46 kB) do GitHub Release, também com checksum | M | ★★★ | `curl | sh` exige confiar no domínio; mitigado com checksum, versão pinada e script curto e legível | sim (o runtime é o Node oficial) |
| E3 | Binários standalone (`bun build --compile`) nos Releases | M | ★★ | Precisa de assinatura no macOS/Windows para não esbarrar no Gatekeeper/SmartScreen; 5 binários para auditar | sim (testado: roda no Ubuntu sem Node, TTY ok), mas **105 MB** cada (50 MB gzip) |
| E4 | Homebrew tap / Scoop / winget | M | ★ | Neutra | sim |
| E5 | Imagem Docker oficial | P | ★ | **Não recomendo como caminho principal:** recria os problemas de sudo/uid/HOME do caso real, e o TTY exige `-it` | — |
| E6 | `keepkeys doctor` (BACKLOG) | P | ★ | Neutra | sim |

**Recusadas:** relay ou serviço web que receba a chave na máquina da pessoa e a entregue ao servidor ou ao sandbox. Isso quebra "nenhum segredo sai da máquina da pessoa": a chave passaria por um terceiro (logs, TLS terminado, operador), e o token de pareamento iria pelo chat, ou seja, o agente poderia interceptar. O mesmo vale para qualquer "colar num site e o agente busca". A única travessia aceitável é a que a própria pessoa controla: o terminal SSH dela ou um `ssh -L` que ela abre. Telemetria: nenhuma mudança adiciona chamadas de rede. As únicas continuam sendo o `--check` explícito para a API do provedor.

### Ordem sugerida

1. Revisar e mesclar a branch (R1–R10) **junto com** E1. O README novo usa `npx`, então mesclar sem publicar deixa tudo quebrado igual a hoje.
2. E1 (publicar) → 3. E2 (instalador) → 4. E3/E4 se houver demanda.

## 3. Esboço das 3 principais

### 3.1 Publicar no npm (E1)

O que já está pronto: `files` (só `bin`, `src`, README, LICENSE; `npm pack` = 28 arquivos, 46 kB), `bin`, `engines`, zero dependências, e o CI já roda `npm pack --dry-run`.

O que falta:
- `.github/workflows/release.yml`: disparado por tag `v*`; `permissions: id-token: write, contents: write`; `npm ci && npm test && npm publish --provenance --access public`; cria o GitHub Release com `keepkeys-<v>.tgz` + `SHA256SUMS` (insumo do E2).
- `package.json`: `"publishConfig": { "provenance": true, "access": "public" }`, `"homepage"`, `"bugs"`.
- Configurar a publicação confiável (OIDC) no npm para não guardar um `NPM_TOKEN` no repositório.
- `setup` registrar `npx -y keepkeys@<versão-maior.menor> mcp` (item do BACKLOG).

Antes: `npx keepkeys setup` → `404 Not Found`. Depois: funciona como o README promete.

### 3.2 Entrega para a pessoa num servidor (R1, implementada)

Arquivos: `src/env.js` (novo: `isHeadless`, `isRemoteSession`, `selfCommand`, `handoffCommand`), `src/cli.js` (modo `handoff`, código de saída 4), `src/mcp/server.js` (`handoffText`, instruções), `src/open-browser.js`, `src/errors.js`.

Detecção: `SSH_CONNECTION`/`SSH_CLIENT`/`SSH_TTY`, ou Linux sem `DISPLAY`/`WAYLAND_DISPLAY`. `KEEPKEYS_HEADLESS=1|0` força o resultado. Um TTY sempre vence: a pessoa no terminal SSH recebe o prompt oculto.

Antes (agente, homeserver):
```
$ keepkeys add TELEGRAM_BOT_TOKEN --to .env
keepkeys: opened a page in your browser to paste the key: http://127.0.0.1:44505/…
keepkeys: waiting for you to paste…          ← bloqueia 10 min
```
Depois:
```
$ keepkeys                     # agente, sem TTY, via SSH
keepkeys: nobody can copy or open a page on this machine from here (an SSH session).
keepkeys: to hand over 5 keys (TELEGRAM_BOT_TOKEN, …), the person runs this in their own terminal on this machine (over SSH is fine).
keepkeys: it asks with a hidden prompt; the value never appears on screen, in the shell history or here:
npx -y keepkeys --root ~/app                 ← stdout, última linha; exit 4
keepkeys: afterwards, check with: npx -y keepkeys --root ~/app list
```
MCP (`request_secret`, headless) responde em menos de 1 s:
```
not saved yet: this is an SSH session, so nobody can copy TELEGRAM_BOT_TOKEN or open a page here.
Ask the user to run this command in their own terminal on this machine (…):
    npx -y keepkeys --root ~/app add TELEGRAM_BOT_TOKEN --to .env
Tell them, in one line: "Run this in your terminal and paste the key when it asks (it stays hidden): …"
When they say it is done, call secrets_status to confirm. …
```
Garantias: o comando contém só o diretório, os nomes e os arquivos, nunca valores. O valor entra por prompt oculto, nunca como argumento, então não aparece em `ps` nem no histórico.

Limite conhecido: dentro de um `npx` do tarball do GitHub, `selfCommand` imprime `npx -y keepkeys`, que só funciona depois do E1.

### 3.3 Instalador sem Node (E2)

Interface proposta (critério de sucesso: Ubuntu limpo, um comando):
```bash
curl -fsSL https://github.com/HenryyXD/keepkeys/releases/latest/download/install.sh | sh -s -- --run ~/app
```
- O `install.sh` (cerca de 60 linhas de POSIX sh, versionado e publicado no Release):
  1. Se `node` ≥ 18.19 existe, usa ele. Senão, baixa `node-v22.x-<os>-<arch>.tar.xz` de nodejs.org para `~/.local/share/keepkeys/node`, confere com `SHASUMS256.txt` (opcionalmente com a assinatura GPG) e aborta se não bater.
  2. Baixa `keepkeys-<v>.tgz` + `SHA256SUMS` do mesmo Release e confere.
  3. Cria `~/.local/bin/keepkeys`, um wrapper de 2 linhas, **sem root**.
  4. `--run DIR`: `exec keepkeys --root DIR </dev/tty`. O stdin do `sh` é o pipe do curl, então o prompt lê de `/dev/tty`.
- Windows: `irm …/install.ps1 | iex`, com a mesma lógica (zip do Node e `Get-FileHash`).
- Com isso, o `selfCommand` passa a imprimir `keepkeys` quando ele estiver no PATH (já implementado), e o agente pode sugerir o instalador quando não houver Node.

Por que não binários (E3) como caminho principal: 105 MB por plataforma contra 31 MB (ou 46 kB quando há Node), 5 artefatos para assinar e auditar, e a necessidade de *notarization* no macOS. O E3 continua viável: com a branch, `bun build --compile` gera um binário que roda num Ubuntu sem Node, com o prompt oculto funcionando.

## 4. O que está na branch

`easier-install-and-headless`, 1 commit, 29 arquivos (+613/−55). `npm test`: **142 passando, 0 falhas** no Node 22 local e no **Node 18.19.1** do Ubuntu 24.04. Cada teste novo foi conferido **falhando no código antigo** (xclip, umask, sudo, dono, túnel, eco no `y/N`, avisos).

Testes novos: `test/env.test.js`, `test/fsutil.test.js` (os de root rodam só como root; o CI do GitHub os pula), `test/version.test.js`, e casos em `cli`, `mcp`, `page`, `prompt`, `detect` e `clipboard`.

Validação de ponta a ponta no container (código novo), no cenário real:
- agente → `npx -y keepkeys --root ~/app`
- a pessoa cola 5 vezes, **0** `y/N`
- `.env` `henry:henry 0600`
- `list --json` → 5 × `"status":"ok"`
- `grep` de segredos no scrollback do tmux → **0**

Pendências conhecidas (fora do escopo):
- Um `.gitignore` **novo** criado via sudo continua pertencendo ao root (modo 644, então é legível).
- macOS e Windows reais não foram testados.
- `apt install nodejs npm` (224 MB) aparece no README como provisório, até o E2 existir.

## 5. Revisão independente (depois do relatório)

Um revisor separado recebeu o diff e as regras de segurança, sem as minhas conclusões. Achados e o que foi feito:

| # | Achado | Gravidade | Status |
|---|---|---|---|
| 1 | O CLI sem TTY imprimia no stderr a URL da página de confirmação quando não conseguia abrir o navegador (SSH com clipboard legível, desktop sem `xdg-open`). O agente podia aprovar o valor sozinho (reproduzido com `curl`). A regressão veio desta branch, porque `openBrowser` passou a retornar `false` com mais frequência. | **Segurança** | Corrigido: a URL nunca é impressa (só com `KEEPKEYS_UNSAFE_SHOW_CONFIRM_URL=1`, usado na suíte de testes). Sem navegador, nada é salvo e a mensagem orienta a usar o terminal. Em headless sem TTY, até `--clipboard` vira a entrega por comando. Teste de regressão adicionado. |
| 2 | `y` + Enter no `y/N` deixava o Enter para o próximo prompt, que pulava a chave seguinte | Correção | Corrigido: a resposta exige Enter. |
| 3 | Colagem chegando caractere a caractere podia responder "sim" | Correção/segurança | Corrigido: o confirm detecta rajadas e bracketed paste e descarta. |
| 4 | O `~` no comando de entrega aponta para outro diretório se a pessoa é outro usuário | Correção | Corrigido: o caminho é sempre absoluto. |
| 5 | Aspas no Windows: `$()`, `%VAR%` e vírgulas em PowerShell/cmd | Segurança (só Windows via SSH) | Corrigido: aspas que cmd e PowerShell leem igual; se o caminho tem `$ % " \`` etc., o comando sai sem `--root` e com "(run it inside …)". |
| 6 | O comando de entrega perdia `--check` e `--allow-any-file` | Correção | Corrigido. |
| 7 | `chown` com EINVAL (namespace de usuário) quebrava a escrita | Robustez | Corrigido: qualquer falha de `chown` → escrita no lugar. |
| 8 | Pastas e `.gitignore` novos via sudo ficavam com o root; erro de permissão no `.gitignore` depois de salvar | Menor | Corrigido. |
| 9 | Ctrl+C no `y/N` dentro do `fill` não parava a execução | UX | Corrigido. |
| 10 | `npm_command=exec` herdado e caminhos de symlink do node | Menor | Corrigido: exige o cache `_npx`, compara realpath e pina `keepkeys@<versão>`. |

Achado falso? Nenhum: todos se confirmaram, o 1, o 2 e o 3 por execução. Depois das correções: `npm test` com 150 testes passando no Node 22 e no Node 18.19.1 (Ubuntu), e o exploit do revisor deixou de funcionar nos dois cenários.
