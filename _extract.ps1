$c = Get-Content (Join-Path (Get-Location) 'src\lib\anilist.ts')
$pats = @('searchAnime','searchSuggestions','getAnime','getEpisodes','getGenres','getRecommendations','getRelations','getSchedule','getSeasonNow','getTopAnime','getUpcoming','export function currentSeason','export interface ListParams','export interface AnimeSuggestion')
$hits = New-Object System.Collections.Generic.List[string]
for ($i=0; $i -lt $c.Count; $i++) {
  foreach ($p in $pats) {
    $line = $c[$i]
    if ($line -match [regex]::Escape($p)) {
      # capture this line + following 6 lines for full signature
      $end = [Math]::Min($c.Count-1, $i+6)
      for ($j=$i; $j -le $end; $j++) { $hits.Add("L$($j+1): $($c[$j])") }
      $hits.Add('---')
      break
    }
  }
}
$hits -join "`n" | Out-File (Join-Path (Get-Location) '_sigs3.txt') -Encoding utf8
Write-Output ('lines=' + $hits.Count)