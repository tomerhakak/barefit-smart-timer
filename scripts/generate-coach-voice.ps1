$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$voiceDirectory = Join-Path $PSScriptRoot '../public/assets/coach'
New-Item -ItemType Directory -Force -Path $voiceDirectory | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft Asaf')
$speaker.Rate = 2
$speaker.Volume = 100
$phrases = [ordered]@{
  '10' = 'עשר'; '9' = 'תשע'; '8' = 'שמונה'; '7' = 'שבע'; '6' = 'שֵׁשׁ'
  '5' = 'חמש'; '4' = 'ארבע'; '3' = 'שָׁלוֹשׁ'; '2' = 'שתיים'; '1' = 'אחת'
  'work' = 'קדימה, מתחילים!'; 'rest' = 'מנוחה'; 'prepare' = 'מוכנים?'
  'between' = 'הפסקה בין הסטים'; 'last' = 'סיבוב אחרון!'
  'last-set' = 'סיבוב אחרון בסט!'; 'finish' = 'האימון הושלם. כל הכבוד!'
}
try {
  foreach ($entry in $phrases.GetEnumerator()) {
    $speaker.Rate = if ($entry.Key -in @('3', '6')) { 0 } else { 2 }
    $speaker.SetOutputToWaveFile((Join-Path $voiceDirectory ($entry.Key + '.wav')))
    $speaker.Speak($entry.Value)
    $speaker.SetOutputToNull()
  }
} finally { $speaker.Dispose() }
node (Join-Path $PSScriptRoot 'prepare-coach-audio.mjs')
