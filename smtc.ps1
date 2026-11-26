# Streams the current Windows media session (Spotify, Apple Music, browsers...) as one JSON line every ~300 ms.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Pick-Session {
  $best = $null
  foreach ($x in $mgr.GetSessions()) {
    $st = $x.GetPlaybackInfo().PlaybackStatus.ToString()
    if ($st -eq 'Playing') {
      if (-not $best) { $best = $x }
      if ($x.SourceAppUserModelId -match 'Spotify|AppleInc|iTunes|AppleMusic') { return $x }
    }
  }
  if ($best) { return $best }
  return $mgr.GetCurrentSession()
}

while ($true) {
  try {
    $s = Pick-Session
    if ($null -eq $s) {
      [Console]::WriteLine('{"status":"none"}')
    } else {
      $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $status = $s.GetPlaybackInfo().PlaybackStatus.ToString()
      $tl = $s.GetTimelineProperties()
      $pos = $tl.Position.TotalMilliseconds
      if ($status -eq 'Playing') {
        $elapsed = ([DateTime]::UtcNow - $tl.LastUpdatedTime.UtcDateTime).TotalMilliseconds
        if ($elapsed -gt 0 -and $elapsed -lt 3600000) { $pos += $elapsed }
      }
      $o = [ordered]@{
        status = $status
        title  = $props.Title
        artist = $props.Artist
        album  = $props.AlbumTitle
        pos    = [math]::Round($pos)
        end    = [math]::Round($tl.EndTime.TotalMilliseconds)
        app    = $s.SourceAppUserModelId
      }
      [Console]::WriteLine(($o | ConvertTo-Json -Compress))
    }
  } catch {
    [Console]::WriteLine('{"status":"none"}')
  }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 300
}
