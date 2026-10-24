function Dump-Block($file, $startPattern, $afterStart, $maxLines=30) {
  $c = Get-Content (Join-Path (Get-Location) $file)
  $out = New-Object System.Collections.Generic.List[string]
  for ($i=0; $i -lt $c.Count; $i++) {
    if ($c[$i] -match [regex]::Escape($startPattern)) {
      for ($j=$i; $j -lt [Math]::Min($c.Count, $i+$afterStart); $j++) { $out.Add("L$($j+1): $($c[$j])") }
      break
    }
  }
  return $out
}
$all = New-Object System.Collections.Generic.List[string]
$all.Add('===== ListParams =====')
$all.AddRange((Dump-Block 'src\lib\anilist.ts' 'export interface ListParams {' 22))
$all.Add('===== UpcomingAnime (types) =====')
$all.AddRange((Dump-Block 'src\lib\types.ts' 'UpcomingAnime' 14))
$all.Add('===== Episode (types) =====')
$all.AddRange((Dump-Block 'src\lib\types.ts' 'interface Episode' 16))
$all.Add('===== GetRecommendations =====')
$all.AddRange((Dump-Block 'src\lib\anilist.ts' 'getRecommendations' 10))
$all.Add('===== GetEpisodes =====')
$all.AddRange((Dump-Block 'src\lib\anilist.ts' 'getEpisodes(' 8))
$all.Add('===== GetUpcoming =====')
$all.AddRange((Dump-Block 'src\lib\anilist.ts' 'getUpcoming(' 18))
$all -join "`n" | Out-File (Join-Path (Get-Location) '_sigs4.txt') -Encoding utf8
Write-Output ('written ' + $all.Count)