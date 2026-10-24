$ProgressPreference='SilentlyContinue'
cd f:\kazan-master\kazan-master
$script:head = @{ 'Origin'='https://kazan.example.app'; 'User-Agent'='Mozilla/5.0' }
$script:results = New-Object System.Collections.ArrayList
function Probe($name, $url){
  try {
    $h = Invoke-WebRequest -Uri $url -Headers $script:head -Method GET -UseBasicParsing -TimeoutSec 25
    $body = $h.Content
    if ($body.Length -gt 220) { $body = $body.Substring(0,220) }
    [void]$script:results.Add(($name + '  [' + $h.StatusCode + ' ' + $h.Headers['Content-Type'] + ']  ' + $body.Replace("`n"," ").Replace("`r","")))
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    [void]$script:results.Add(($name + '  [ERR ' + $code + ']  ' + $_.Exception.Message))
  }
}

# sort endpoint variants (order / type)
Probe 'sort?bare'            'https://anipub.org/api/sort?page=1&limit=10'
Probe 'sort?type=TV'         'https://anipub.org/api/sort?page=1&type=TV&limit=10'
Probe 'sort?sort=popularity' 'https://anipub.org/api/sort?page=1&sort=popularity&limit=10'
Probe 'sort?order=popularity' 'https://anipub.org/api/sort?page=1&order=popularity&limit=10'
Probe 'sort?genre=action'    'https://anipub.org/api/sort?page=1&genre=action&limit=10'
Probe 'sort?status=airing'   'https://anipub.org/api/sort?page=1&status=airing&limit=10'

# genre listing
Probe 'genres'    'https://anipub.org/api/genres?page=1'
Probe 'genre'     'https://anipub.org/api/genre?page=1'
Probe 'findbygenre(bare)!' 'https://anipub.org/api/findbyGenre?page=1'
Probe 'genrelist' 'https://anipub.org/api/genrelist'

# schedule / season / upcoming / trending
Probe 'upcoming'   'https://anipub.org/api/upcoming?page=1'
Probe 'season'     'https://anipub.org/api/season?page=1'
Probe 'airing'     'https://anipub.org/api/airing?page=1'
Probe 'trending'   'https://anipub.org/api/trending?page=1'
Probe 'schedule'   'https://anipub.org/api/schedule?page=1'

$script:results | Set-Content _ap_probe.txt -Encoding UTF8
Write-Output ('WROTE ' + $script:results.Count + ' lines')
