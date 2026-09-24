# Roda o catenaria3d.inp + exportar_resultados.inp no ANSYS (batch) numa pasta
# temporaria (para nao poluir a pasta do TCC com arquivos .rst/.esav/etc.),
# copia dados_ansys.txt de volta e gera dados.js para o visualizador.
#
# Uso (PowerShell, dentro da pasta ansys):   .\rodar_exportacao.ps1

$ErrorActionPreference = 'Stop'
$aqui   = $PSScriptRoot
$inp    = Join-Path $aqui 'catenaria3d.inp'
$vis    = Join-Path $aqui '..\visualizador'
$ansys  = 'C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe'
$rodada = Join-Path $env:TEMP 'catenaria3d_rodada'

if (-not (Test-Path $ansys)) { throw "ANSYS nao encontrado em $ansys (ajuste o caminho no script)." }

if (Test-Path $rodada) { Remove-Item $rodada -Recurse -Force }
New-Item -ItemType Directory $rodada | Out-Null
Copy-Item $inp $rodada
Copy-Item (Join-Path $aqui 'exportar_resultados.inp') $rodada

Push-Location $rodada
try {
    & $ansys -b -i exportar_resultados.inp -o saida.out -j catenaria3d
} finally { Pop-Location }

$dados = Join-Path $rodada 'dados_ansys.txt'
if (-not (Test-Path $dados)) { throw "ANSYS nao gerou dados_ansys.txt - veja $rodada\saida.out" }
Copy-Item $dados (Join-Path $vis 'dados_ansys.txt') -Force

node (Join-Path $vis 'converter_dados.mjs')
