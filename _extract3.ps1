function Dump($file, $start, $n) {
  $c = Get-Content (Join-Path (Get-Location) $file)
  $o = ''
  for ($i=0; $i -lt $c.Count; $i++) {
    if ($c[$i] -match [regex]::Escape($start)) {
      for ($j=$i; $j -lt [Math]::Min($c.Count, $i+$n); $j++) { $o = $o + ('L$($j+1): ' + $c[$j] + "`n") }
      return $o
    }
  }
  return "(not found: $start)`n"
}
$s = ''
$s += '===== ListParams =====' + "`n"
$s += Dump 'src\lib\anilist.ts' 'export interface ListParams {' 22
$s += '===== UpcomingAnime =====' + "`n"
$s += Dump 'src\lib\types.ts' 'UpcomingAnime' 14
$s += '===== Episode =====' + "`n"
$s += Dump 'src\lib\types.ts' 'interface Episode' 16
$s += '===== GetRecommendations =====' + "`n"
$s += Dump 'src\lib\anilist.ts' 'getRecommendations' 12
$s += '===== GetEpisodes =====' + "`n"
$s += Dump 'src\lib\anilist.ts' 'getEpisodes(' 6
$s += '===== GetUpcoming =====' + "`n"
$s += Dump 'src\lib\anilist.ts' 'getUpcoming(' 18
$s | Out-File (Join-Path (Get-Location) '_sigs4.txt') -Encoding utf8
Write-Output 'done'