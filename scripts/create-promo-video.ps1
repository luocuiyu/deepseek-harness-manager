param(
  [Parameter(Mandatory = $true)]
  [string]$StartupVideo,
  [string]$OutputFile
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectDir = Split-Path $PSScriptRoot -Parent
$workspaceDir = Split-Path (Split-Path $projectDir -Parent) -Parent
$tempDir = Join-Path $workspaceDir 'work\video-promo-tmp'
$outputDir = Join-Path $workspaceDir 'outputs'

if (-not $OutputFile) {
  $OutputFile = Join-Path $outputDir 'DeepSeek-Harness-Manager-宣传视频.mp4'
}

if (-not (Test-Path -LiteralPath $StartupVideo)) {
  throw "启动视频不存在：$StartupVideo"
}

foreach ($command in @('ffmpeg', 'ffprobe')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "未找到 $command，请先安装 FFmpeg。"
  }
}

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$assets = @{
  'startup.mp4' = $StartupVideo
  'embedded.png' = Join-Path $projectDir 'screenshots\v021-embedded-dsh.png'
  'dashboard.png' = Join-Path $projectDir 'screenshots\v021-dashboard.png'
  'sessions.png' = Join-Path $projectDir 'screenshots\v021-sessions.png'
  'presets.png' = Join-Path $projectDir 'screenshots\v021-agent-presets.png'
  'market.png' = Join-Path $projectDir 'screenshots\v021-plugin-market.png'
  'icon.png' = Join-Path $projectDir 'resources\icon.png'
}

foreach ($entry in $assets.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $entry.Value)) {
    throw "缺少素材：$($entry.Value)"
  }
  Copy-Item -LiteralPath $entry.Value -Destination (Join-Path $tempDir $entry.Key) -Force
}

Add-Type -AssemblyName System.Speech

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command 执行失败，退出码：$LASTEXITCODE"
  }
}

function Get-MediaDuration {
  param([Parameter(Mandatory = $true)][string]$Path)

  $raw = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $Path
  if ($LASTEXITCODE -ne 0) {
    throw "无法读取媒体时长：$Path"
  }
  return [double]::Parse($raw.Trim(), [Globalization.CultureInfo]::InvariantCulture)
}

function ConvertTo-AssTime {
  param([Parameter(Mandatory = $true)][double]$Seconds)

  $totalCentiseconds = [Math]::Round($Seconds * 100)
  $hours = [Math]::Floor($totalCentiseconds / 360000)
  $minutes = [Math]::Floor(($totalCentiseconds % 360000) / 6000)
  $secondsPart = [Math]::Floor(($totalCentiseconds % 6000) / 100)
  $centiseconds = $totalCentiseconds % 100
  return ('{0}:{1:00}:{2:00}.{3:00}' -f $hours, $minutes, $secondsPart, $centiseconds)
}

function Write-AssFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][double]$Duration,
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Subtitle,
    [string]$Eyebrow = 'DEEPSEEK HARNESS MANAGER',
    [switch]$EndCard
  )

  $end = ConvertTo-AssTime $Duration
  $titleSize = if ($EndCard) { 62 } else { 44 }
  $titleMargin = if ($EndCard) { 410 } else { 52 }
  $subtitleMargin = if ($EndCard) { 225 } else { 55 }
  $escapedTitle = $Title.Replace("`r", '').Replace("`n", '\N')
  $escapedSubtitle = $Subtitle.Replace("`r", '').Replace("`n", '\N')
  $escapedEyebrow = $Eyebrow.Replace("`r", '').Replace("`n", '\N')

  $ass = @"
[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Eyebrow,Microsoft YaHei UI,24,&H00B6C9E8,&H000000FF,&H80000000,&H50000000,1,0,0,0,100,100,2,0,1,1,0,8,70,70,25,1
Style: Title,Microsoft YaHei UI,$titleSize,&H00FFFFFF,&H000000FF,&HAA07101F,&H78060A12,1,0,0,0,100,100,0,0,1,3,1,8,90,90,$titleMargin,1
Style: Subtitle,Microsoft YaHei UI,38,&H00FFFFFF,&H000000FF,&HCC05080F,&H99050A12,0,0,0,0,100,100,0,0,3,2,0,2,130,130,$subtitleMargin,1
Style: Link,Consolas,34,&H00F4C65E,&H000000FF,&HCC05080F,&H99050A12,1,0,0,0,100,100,0,0,3,2,0,2,100,100,108,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,$end,Eyebrow,,0,0,0,,{\fad(250,300)}$escapedEyebrow
Dialogue: 0,0:00:00.10,$end,Title,,0,0,0,,{\fad(350,350)}$escapedTitle
Dialogue: 1,0:00:00.15,$end,Subtitle,,0,0,0,,{\fad(350,350)}$escapedSubtitle
"@

  if ($EndCard) {
    $ass += "`r`nDialogue: 2,0:00:00.30,$end,Link,,0,0,0,,{\fad(450,350)}github.com/luocuiyu/deepseek-harness-manager`r`n"
  }

  [IO.File]::WriteAllText($Path, $ass, [Text.UTF8Encoding]::new($false))
}

function New-Narration {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
  try {
    $voice = $synth.GetInstalledVoices() |
      Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-CN' } |
      Select-Object -First 1
    if ($voice) {
      $synth.SelectVoice($voice.VoiceInfo.Name)
    }
    $synth.Rate = 0
    $synth.Volume = 100
    $synth.SetOutputToWaveFile($Path)
    $synth.Speak($Text)
  }
  finally {
    $synth.Dispose()
  }
}

$scenes = @(
  [ordered]@{
    Key = '01-startup'; Kind = 'video'; Asset = 'startup.mp4'; Minimum = 8.4
    Title = '双击图标，即刻进入工作状态'
    Subtitle = '告别重复输入 npx 命令，一次启动，直接进入 DeepSeek Harness。'
    Voice = '还在每次输入命令启动 DeepSeek Harness 吗？现在，只需双击图标，就能直接进入工作状态。'
  },
  [ordered]@{
    Key = '02-embedded'; Kind = 'image'; Asset = 'embedded.png'; Minimum = 9.3
    Title = '真正的桌面体验'
    Subtitle = 'Web 界面直接嵌入应用，独立任务栏图标，工作目录随时切换。'
    Voice = 'DeepSeek Harness Manager，把原本的网页界面直接嵌入桌面应用。任务栏显示独立图标，工作目录也能随时切换。'
  },
  [ordered]@{
    Key = '03-dashboard'; Kind = 'image'; Asset = 'dashboard.png'; Minimum = 9.4
    Title = '运行状态，集中掌握'
    Subtitle = '进程、端口、运行状态与官方额度一屏查看，停止和重启一步完成。'
    Voice = '控制台集中展示运行状态、端口、进程和官方额度，并提供停止、重启与打开 Web 界面的快捷操作。'
  },
  [ordered]@{
    Key = '04-sessions'; Kind = 'image'; Asset = 'sessions.png'; Minimum = 8.9
    Title = '会话观察台'
    Subtitle = '搜索历史会话，查看工作目录、代理预设与上下文信息。'
    Voice = '会话观察台帮助你搜索和查看历史会话、工作目录、代理预设与上下文信息。'
  },
  [ordered]@{
    Key = '05-presets'; Kind = 'image'; Asset = 'presets.png'; Minimum = 11.3
    Title = '插件与代理预设，清晰管理'
    Subtitle = '来源、用户添加状态和会话占用一目了然；删除后先进入软件回收站。'
    Voice = '插件和代理预设不再混在一起。来源、是否由用户添加、当前占用一目了然。删除内容会先进入软件回收站，可以恢复，也可以彻底清理。'
  },
  [ordered]@{
    Key = '06-market'; Kind = 'image'; Asset = 'market.png'; Minimum = 8.7
    Title = '发现更多 Harness 插件'
    Subtitle = '搜索、浏览与管理集中在同一界面，扩展能力更加便捷。'
    Voice = '插件市场支持搜索与浏览，扩展能力的发现和管理，都集中在同一个界面。'
  },
  [ordered]@{
    Key = '07-update'; Kind = 'image'; Asset = 'dashboard.png'; Minimum = 8.2
    Title = '启动即检查更新'
    Subtitle = '发现新版本后直接提示下载与安装，无需先卸载旧版本。'
    Voice = '每次启动，软件都会自动检查新版本。有更新时直接提示下载和安装，不再需要先卸载旧版本。'
  },
  [ordered]@{
    Key = '08-end'; Kind = 'end'; Asset = 'icon.png'; Minimum = 8.2
    Title = 'DeepSeek Harness Manager'
    Subtitle = '开源、免费，为更顺手的 DeepSeek Harness 桌面体验而生。'
    Voice = 'DeepSeek Harness Manager 现已开源。访问屏幕中的 GitHub 地址，下载最新版本，欢迎体验和提出建议。'
  }
)

Push-Location $tempDir
try {
  $renderedScenes = [Collections.Generic.List[string]]::new()

  foreach ($scene in $scenes) {
    $wav = "$($scene.Key).wav"
    $wavPath = Join-Path $tempDir $wav
    $ass = "$($scene.Key).ass"
    $assPath = Join-Path $tempDir $ass
    $mp4 = "$($scene.Key).mp4"

    New-Narration -Text $scene.Voice -Path $wavPath
    $voiceDuration = Get-MediaDuration $wavPath
    $duration = [Math]::Max([double]$scene.Minimum, $voiceDuration + 0.9)
    $durationText = $duration.ToString('0.000', [Globalization.CultureInfo]::InvariantCulture)
    $fadeOut = ([Math]::Max(0, $duration - 0.5)).ToString('0.000', [Globalization.CultureInfo]::InvariantCulture)

    Write-AssFile -Path $assPath -Duration $duration -Title $scene.Title -Subtitle $scene.Subtitle -EndCard:($scene.Kind -eq 'end')

    $audioFilter = "[1:a]loudnorm=I=-18:TP=-1.5:LRA=7,apad,atrim=0:$durationText[a]"
    $commonOutput = @(
      '-map', '[v]', '-map', '[a]', '-t', $durationText,
      '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart', '-y', $mp4
    )

    if ($scene.Kind -eq 'video') {
      $videoFilter = "[0:v]tpad=stop_mode=clone:stop_duration=8,setpts=PTS-STARTPTS,split=2[bg][fg];" +
        "[bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=32,eq=brightness=-0.18:saturation=0.75[bg2];" +
        "[fg]scale=1920:1080:force_original_aspect_ratio=decrease[fg2];" +
        "[bg2][fg2]overlay=(W-w)/2:(H-h)/2,fade=t=in:st=0:d=0.45,fade=t=out:st=${fadeOut}:d=0.5,ass='$ass'[v];$audioFilter"
      $args = @('-i', $scene.Asset, '-i', $wavPath, '-filter_complex', $videoFilter) + $commonOutput
    }
    elseif ($scene.Kind -eq 'end') {
      $videoFilter = "[0:v]scale=340:340[logo];" +
        "[1:v][logo]overlay=(W-w)/2:125,fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOut}:d=0.5,ass='$ass'[v];" +
        "[2:a]loudnorm=I=-18:TP=-1.5:LRA=7,apad,atrim=0:$durationText[a]"
      $args = @(
        '-loop', '1', '-i', $scene.Asset,
        '-f', 'lavfi', '-i', "color=c=0x070B14:s=1920x1080:r=30:d=$durationText",
        '-i', $wavPath, '-filter_complex', $videoFilter
      ) + $commonOutput
    }
    else {
      $videoFilter = "[0:v]split=2[bg][fg];" +
        "[bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=32,eq=brightness=-0.20:saturation=0.72[bg2];" +
        "[fg]scale=1720:900:force_original_aspect_ratio=decrease[fg2];" +
        "[bg2][fg2]overlay=(W-w)/2:(H-h)/2,fade=t=in:st=0:d=0.45,fade=t=out:st=${fadeOut}:d=0.5,ass='$ass'[v];$audioFilter"
      $args = @('-loop', '1', '-framerate', '30', '-i', $scene.Asset, '-i', $wavPath, '-filter_complex', $videoFilter) + $commonOutput
    }

    Write-Host "正在渲染：$($scene.Title)（$durationText 秒）"
    Invoke-External -Command 'ffmpeg' -Arguments $args
    $renderedScenes.Add($mp4)
  }

  $concatFile = 'concat.txt'
  $concatContent = ($renderedScenes | ForEach-Object { "file '$($_.Replace("'", "''"))'" }) -join "`r`n"
  [IO.File]::WriteAllText((Join-Path $tempDir $concatFile), $concatContent, [Text.UTF8Encoding]::new($false))

  Invoke-External -Command 'ffmpeg' -Arguments @(
    '-f', 'concat', '-safe', '0', '-i', $concatFile,
    '-c', 'copy', '-movflags', '+faststart', '-y', 'joined.mp4'
  )

  $totalDuration = Get-MediaDuration 'joined.mp4'
  $totalText = $totalDuration.ToString('0.000', [Globalization.CultureInfo]::InvariantCulture)
  $bed = "aevalsrc=0.045*sin(2*PI*110*t)+0.028*sin(2*PI*164.81*t)+0.018*sin(2*PI*220*t):s=48000:d=$totalText"
  $finalFilter = '[0:a]volume=1.0[voice];[1:a]volume=0.18,lowpass=f=520,afade=t=in:st=0:d=1.2,afade=t=out:st=' +
    ([Math]::Max(0, $totalDuration - 1.4)).ToString('0.000', [Globalization.CultureInfo]::InvariantCulture) +
    ':d=1.4[bed];[voice][bed]amix=inputs=2:duration=first:dropout_transition=0[a]'

  Invoke-External -Command 'ffmpeg' -Arguments @(
    '-i', 'joined.mp4', '-f', 'lavfi', '-i', $bed,
    '-filter_complex', $finalFilter,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', '-y', $OutputFile
  )

  $coverFile = [IO.Path]::ChangeExtension($OutputFile, '.jpg')
  Invoke-External -Command 'ffmpeg' -Arguments @(
    '-ss', '2.0', '-i', $OutputFile, '-frames:v', '1', '-q:v', '2', '-update', '1', '-y', $coverFile
  )

  Write-Host "成片已生成：$OutputFile"
  Write-Host "封面已生成：$coverFile"
}
finally {
  Pop-Location
}
