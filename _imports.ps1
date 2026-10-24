$c = Get-ChildItem -Recurse -File (Join-Path (Get-Location) 'src') -Include *.ts,*.tsx
$o = @()
foreach ($f in $c) {
  $lines = Get-Content $f.FullName
  $rel = $f.FullName.Substring((Get-Location).Path.Length)
  for ($i=0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'from\s+[''"].*?anilist[''"]' -or $lines[$i] -match 'anilist[''"]') {
      if ($lines[$i] -match 'import|anilist') {
        $o += ($rel + ' >> ' + $lines[$i].Trim())
      }
    }
  }
}
$o | Out-File (Join-Path (Get-Location) '_anilist_imports.txt') -Encoding utf8
Write-Output ('lines=' + $o.Count)