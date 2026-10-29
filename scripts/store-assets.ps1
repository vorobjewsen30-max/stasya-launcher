param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$sourceImage=[System.Drawing.Image]::FromFile($Source)
try {
 foreach($item in @(@('Square44x44Logo.png',44),@('Square150x150Logo.png',150),@('StoreLogo.png',50),@('ListingIcon.png',300))){
  $size=[int]$item[1];$bitmap=New-Object System.Drawing.Bitmap($size,$size)
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  try{$graphics.Clear([System.Drawing.Color]::Transparent);$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$graphics.DrawImage($sourceImage,0,0,$size,$size);$bitmap.Save((Join-Path $Destination $item[0]),[System.Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
 }
} finally {$sourceImage.Dispose()}
