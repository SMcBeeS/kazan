$ProgressPreference='SilentlyContinue'
cd f:\kazan-master\kazan-master
$out = New-Object System.Collections.ArrayList
function Add($s){ [void]$out.Add($s) }

$head = @{ 'Origin'='https://kazan.example.app'; 'User-Agent'='Mozilla/5.0' }
function GetText($u){ try { (Invoke-WebRequest -Uri $u -Headers $head -UseBasicParsing -TimeoutSec 30).Content } catch { 'ERR: '+$_.Exception.Message } }

Add '=========== SEARCHALL naruto ==========='
$c = GetText 'https://anipub.org/api/searchall/naruto?page=1'; Add $c

Add '=========== FINDBYGENRE action ==========='
$c = GetText 'https://anipub.org/api/findbyGenre/action?page=1'; Add $c

Add '=========== FINDBYRATING ==========='
$c = GetText 'https://anipub.org/api/findbyrating?page=1'; Add $c

Add '=========== SORT bare ==========='
$c = GetText 'https://anipub.org/api/sort?page=1'; Add $c

$out -join "`r`n" | Set-Content _ap_api.txt -Encoding UTF8
Write-Output ('WROTE ' + (Get-Item _ap_api.txt).Length + ' bytes')