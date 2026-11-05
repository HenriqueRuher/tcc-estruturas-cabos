# Roda o experimento_corrente.inp + exportar_experimento.inp no ANSYS (batch) numa
# pasta temporaria (mesmo fluxo do rodar_exportacao.ps1) e copia os resultados para
# experimento/comparacao/resultados.
#
# Uso (PowerShell, dentro da pasta ansys):   .\rodar_experimento.ps1

$ErrorActionPreference = 'Stop'
$aqui    = $PSScriptRoot
$inp     = Join-Path $aqui 'experimento_corrente.inp'
$destino = Join-Path $aqui '..\experimento\comparacao\resultados'
$ansys   = 'C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe'
$rodada  = Join-Path $env:TEMP 'experimento_corrente_rodada'

if (-not (Test-Path $ansys)) { throw "ANSYS nao encontrado em $ansys (ajuste o caminho no script)." }

if (Test-Path $rodada) { Remove-Item $rodada -Recurse -Force }
New-Item -ItemType Directory $rodada | Out-Null
Copy-Item $inp $rodada
Copy-Item (Join-Path $aqui 'exportar_experimento.inp') $rodada

Push-Location $rodada
try {
    & $ansys -b -np 1 -i exportar_experimento.inp -o saida.out -j experimento_corrente
} finally { Pop-Location }

$dados = Join-Path $rodada 'dados_experimento.txt'
if (-not (Test-Path $dados)) { throw "ANSYS nao gerou dados_experimento.txt - veja $rodada\saida.out" }
Copy-Item $dados $destino -Force
foreach ($f in 'saida.out', 'resultado_noP.txt', 'resumo_T0.txt') {
    Copy-Item (Join-Path $rodada $f) (Join-Path $destino "ansys_$f") -Force
}
