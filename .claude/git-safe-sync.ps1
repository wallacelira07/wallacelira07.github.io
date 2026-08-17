# git-safe-sync.ps1 — wrapper de "git pull --rebase" (+ opcionalmente "git push") com retry
# automatico contra interferencia TRANSITORIA do Google Drive.
#
# POR QUE ISSO EXISTE (17/08/2026): o .git real ja foi movido pra fora da pasta sincronizada
# (C:\Users\WLI015\.git-repos\Site.git, ver regra 6 do ESTADO_ATUAL.md) - isso resolveu a classe de
# erro mais grave (.git corrompido por desktop.ini). Mas os ARQUIVOS DO PROJETO em si continuam
# dentro da pasta sincronizada pelo Drive, por design (CLAUDE.md: "sem zip, sem copias paralelas,
# alterar sempre os arquivos reais do projeto") - entao o Drive ainda pode travar um arquivo por uma
# fracao de segundo enquanto sincroniza em background, bem no momento em que o Git tenta escrever
# nele (rebase reescreve varios arquivos rapido). Isso e fisicamente inevitavel enquanto os arquivos
# moram numa pasta sincronizada - a unica coisa que da pra fazer e nao deixar isso travar a sessao:
# detectar o padrao de erro, abortar um rebase que tenha ficado pela metade, esperar um instante, e
# tentar de novo sozinho.
#
# Uso: powershell -File .claude/git-safe-sync.ps1 [-Push] [-MaxRetries 5] [-DelaySeconds 3]
#   -Push          depois do pull --rebase ter sucesso, tambem faz "git push" com o mesmo retry.
#   -MaxRetries    quantas tentativas antes de desistir e reportar erro real (default 5).
#   -DelaySeconds  pausa entre tentativas (default 3s).
#
# Se falhar mesmo com as tentativas: nao e mais interferencia transitoria do Drive, e um erro real
# (conflito de merge de verdade, rede fora, etc) - resolver manualmente, nao insistir.

param(
  [switch]$Push,
  [int]$MaxRetries = 5,
  [int]$DelaySeconds = 3
)

function Invoke-GitRetry {
  param([string[]]$GitArgs, [string]$Label)
  for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
    $output = & git @GitArgs 2>&1
    $exitCode = $LASTEXITCODE
    $outputText = ($output | Out-String)
    if ($exitCode -eq 0) {
      Write-Host "[git-safe] $Label OK (tentativa $attempt/$MaxRetries)"
      return $true
    }
    $isTransient = $outputText -match 'unable to create file|Permission denied|cannot lock ref|index\.lock|File exists|being used by another process|Device or resource busy'
    if (-not $isTransient) {
      Write-Host "[git-safe] $Label falhou com erro que NAO bate com o padrao conhecido do Drive - parando pra nao mascarar um problema real:"
      Write-Host $outputText
      return $false
    }
    Write-Host "[git-safe] $Label bateu em interferencia transitoria do Drive (tentativa $attempt/$MaxRetries)."
    # Se sobrou um rebase pela metade, aborta antes de tentar de novo - senao a proxima tentativa
    # falha com "rebase already in progress" em vez do erro real.
    $gitDir = & git rev-parse --git-dir 2>$null
    if ($gitDir) {
      $rebaseMerge = Join-Path $gitDir "rebase-merge"
      $rebaseApply = Join-Path $gitDir "rebase-apply"
      if ((Test-Path $rebaseMerge) -or (Test-Path $rebaseApply)) {
        Write-Host "[git-safe] Abortando rebase que ficou pela metade antes de tentar de novo."
        & git rebase --abort 2>&1 | Out-Null
      }
    }
    if ($attempt -lt $MaxRetries) {
      Start-Sleep -Seconds $DelaySeconds
    }
  }
  Write-Host "[git-safe] $Label falhou apos $MaxRetries tentativas - isso ja nao e mais interferencia transitoria, precisa de intervencao manual."
  return $false
}

$pullOk = Invoke-GitRetry -GitArgs @('pull', '--rebase') -Label 'git pull --rebase'
if (-not $pullOk) { exit 1 }

if ($Push) {
  $pushOk = Invoke-GitRetry -GitArgs @('push') -Label 'git push'
  if (-not $pushOk) { exit 1 }
}

exit 0
